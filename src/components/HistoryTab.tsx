import {Database, RefreshCw, Search, Trash2} from 'lucide-react';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {TRANSLATIONS} from '../i18n/translations';
import {clearHistoryCache, getCacheStats, pruneUnusedCache, type CacheStats} from '../services/cacheDb';
import {fetchGoldHistory} from '../services/goldClient';
import type {AppLanguage, HistoryResponse} from '../types/gold';
import {formatBytes, formatInr, formatSignedInr} from '../utils/format';
import {PriceChart, type ChartPoint} from './PriceChart';

interface HistoryTabProps {
  lang: AppLanguage;
}

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const;

function getCurrentIstDateParts(): {year: number; month: string} {
  const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return {
    year: Math.max(2026, nowIst.getUTCFullYear()),
    month: nowIst.toLocaleString('en-US', {month: 'long', timeZone: 'UTC'}).toLowerCase(),
  };
}

const INITIAL_IST = getCurrentIstDateParts();
const MAX_YEAR = INITIAL_IST.year;
const YEARS = Array.from({length: MAX_YEAR - 2009 + 1}, (_, i) => MAX_YEAR - i);
const MONTHLY_YEARS = Array.from({length: MAX_YEAR - 2020 + 1}, (_, i) => MAX_YEAR - i);

export const HistoryTab: React.FC<HistoryTabProps> = ({lang}) => {
  const [mode, setMode] = useState<'daily' | 'monthly' | 'yearly'>('daily');
  const [selectedYear, setSelectedYear] = useState<number>(INITIAL_IST.year);
  const [selectedMonth, setSelectedMonth] = useState<string>(INITIAL_IST.month);
  const [yearlySpan, setYearlySpan] = useState<'all' | '25' | '10'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [chartUnit, setChartUnit] = useState<'pavan' | 'gram'>('pavan');

  const [historyData, setHistoryData] = useState<HistoryResponse | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);

  const t = TRANSLATIONS[lang].history;
  const chartStrings = TRANSLATIONS[lang].chart;

  const refreshStats = useCallback(async () => {
    const stats = await getCacheStats();
    setCacheStats(stats);
  }, []);

  const loadHistory = useCallback(
    async (forceRefresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchGoldHistory({
          mode,
          year: selectedYear,
          month: selectedMonth,
          forceRefresh,
        });
        setHistoryData(res.data);
        setFromCache(res.fromCache);
        await refreshStats();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load requested history.');
      } finally {
        setLoading(false);
      }
    },
    [mode, selectedYear, selectedMonth, refreshStats],
  );

  useEffect(() => {
    loadHistory(false);
  }, [loadHistory]);

  const handlePruneUnused = async () => {
    const {removedCount} = await pruneUnusedCache(true);
    await refreshStats();
    setCacheNotice(
      removedCount > 0
        ? `Removed ${removedCount} unused cached archive${removedCount === 1 ? '' : 's'}.`
        : t.prunedNone,
    );
  };

  const handleClearAllHistoryCache = async () => {
    await clearHistoryCache();
    await refreshStats();
    setCacheNotice(t.clearedMsg);
  };

  const filteredRows = useMemo(() => {
    if (!historyData) return [];
    const q = searchTerm.trim().toLowerCase();

    if (mode === 'daily' && historyData.dailyEntries) {
      const list = [...historyData.dailyEntries].reverse();
      if (!q) return list;
      return list.filter(
        (r) =>
          r.dateLabel.toLowerCase().includes(q) ||
          r.session.toLowerCase().includes(q) ||
          String(r.pavan).includes(q) ||
          String(r.gram).includes(q),
      );
    }

    if (mode === 'monthly' && historyData.monthlyEntries) {
      const list = [...historyData.monthlyEntries];
      if (!q) return list;
      return list.filter(
        (r) =>
          r.month.toLowerCase().includes(q) ||
          r.dateLabel.toLowerCase().includes(q) ||
          String(r.pavan).includes(q),
      );
    }

    if (mode === 'yearly' && historyData.yearlyEntries) {
      let list = [...historyData.yearlyEntries];
      if (yearlySpan === '25') list = list.filter((r) => r.year >= 2001);
      else if (yearlySpan === '10') list = list.filter((r) => r.year >= 2016);
      if (q) {
        list = list.filter((r) => String(r.year).includes(q) || String(r.pavan).includes(q));
      }
      return [...list].reverse();
    }

    return [];
  }, [historyData, mode, searchTerm, yearlySpan]);

  const chartPoints: ChartPoint[] = useMemo(() => {
    if (!historyData) return [];
    if (mode === 'daily' && historyData.dailyEntries) {
      return historyData.dailyEntries.map((e) => ({
        id: e.id,
        label: e.dateLabel.replace(/-\d{2}$/, ''),
        sublabel: e.session,
        pavan: e.pavan,
        gram: e.gram,
        changePavan: e.changePavan,
        changeGram: e.changeGram,
        direction: e.direction,
      }));
    }
    if (mode === 'monthly' && historyData.monthlyEntries) {
      return historyData.monthlyEntries.map((e) => ({
        id: e.id,
        label: e.month.slice(0, 3),
        sublabel: e.dateLabel,
        pavan: e.pavan,
        gram: e.gram,
        changePavan: e.changePavan,
        changeGram: e.changeGram,
        direction: e.direction,
      }));
    }
    if (mode === 'yearly' && historyData.yearlyEntries) {
      let list = historyData.yearlyEntries;
      if (yearlySpan === '25') list = list.filter((r) => r.year >= 2001);
      else if (yearlySpan === '10') list = list.filter((r) => r.year >= 2016);
      return list.map((e) => ({
        id: e.id,
        label: String(e.year),
        sublabel: e.dateLabel,
        pavan: e.pavan,
        gram: e.gram,
        changePavan: e.changePavan,
        changeGram: e.changeGram,
        direction: e.direction,
      }));
    }
    return [];
  }, [historyData, mode, yearlySpan]);

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* Compact Filter Tile */}
      <section className="liquid-glass rounded-2xl sm:rounded-3xl p-3.5 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <h1 className="font-display text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">
              {t.title}
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
              {t.subtitle}
            </p>
          </div>

          <div
            className="liquid-segmented grid grid-cols-3 w-full sm:w-auto rounded-xl p-1"
            role="tablist"
            aria-label="History granularity"
          >
            {(
              [
                {id: 'daily', label: t.dailyTab},
                {id: 'monthly', label: t.monthlyTab},
                {id: 'yearly', label: t.yearlyTab},
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={mode === tab.id}
                onClick={() => setMode(tab.id)}
                className={`min-h-[34px] rounded-lg px-3 py-1 text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                  mode === tab.id
                    ? 'liquid-pill-active text-slate-900 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Adaptive Filter Controls */}
        <div className="mt-3 grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          {mode === 'daily' && (
            <>
              <select
                aria-label="Select month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="min-h-[38px] rounded-xl border border-slate-900/12 bg-white/80 px-2.5 py-1.5 text-xs sm:text-sm font-medium text-slate-900 capitalize dark:border-white/15 dark:bg-slate-900/80 dark:text-white"
              >
                {MONTHS.map((m) => (
                  <option key={m} value={m} className="capitalize">
                    {m.charAt(0).toUpperCase() + m.slice(1)}
                  </option>
                ))}
              </select>
              <select
                aria-label="Select year"
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="min-h-[38px] rounded-xl border border-slate-900/12 bg-white/80 px-2.5 py-1.5 text-xs sm:text-sm font-medium text-slate-900 tabular-nums dark:border-white/15 dark:bg-slate-900/80 dark:text-white"
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </>
          )}

          {mode === 'monthly' && (
            <select
              aria-label="Select year for monthly summary"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="col-span-2 sm:w-auto min-h-[38px] rounded-xl border border-slate-900/12 bg-white/80 px-2.5 py-1.5 text-xs sm:text-sm font-medium text-slate-900 tabular-nums dark:border-white/15 dark:bg-slate-900/80 dark:text-white"
            >
              {MONTHLY_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}

          {mode === 'yearly' && (
            <div
              className="col-span-2 liquid-segmented grid grid-cols-3 rounded-xl p-0.5"
              role="group"
              aria-label="Yearly span"
            >
              {[
                {id: 'all' as const, label: t.spanAll},
                {id: '25' as const, label: t.span25},
                {id: '10' as const, label: t.span10},
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setYearlySpan(s.id)}
                  className={`min-h-[34px] rounded-lg px-2 py-1 text-[11px] sm:text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                    yearlySpan === s.id
                      ? 'liquid-pill-active text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}

          <div className="col-span-2 flex items-center gap-2 sm:flex-1">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full min-h-[38px] rounded-xl border border-slate-900/12 bg-white/80 pl-8 pr-2.5 py-1.5 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-white/15 dark:bg-slate-900/80 dark:text-white"
              />
            </div>

            <button
              type="button"
              onClick={() => loadHistory(true)}
              disabled={loading}
              aria-label="Reload history"
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-900/12 bg-white/70 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 cursor-pointer shrink-0"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              <span className="hidden sm:inline">{t.reloadBtn}</span>
            </button>
          </div>
        </div>

        {historyData && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-900/8 pt-2.5 text-[11px] sm:text-xs text-slate-600 dark:border-white/10 dark:text-slate-400 tabular-nums">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {historyData.high && (
                <span>
                  {t.high}{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {formatInr(historyData.high.pavan, historyData.high.pavan < 100 ? 2 : 0)}
                  </strong>{' '}
                  ({historyData.high.label})
                </span>
              )}
              {historyData.low && (
                <span>
                  {t.low}{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {formatInr(historyData.low.pavan, historyData.low.pavan < 100 ? 2 : 0)}
                  </strong>{' '}
                  ({historyData.low.label})
                </span>
              )}
            </div>
            <span>{fromCache ? t.deviceCache : t.liveArchive}</span>
          </div>
        )}
      </section>

      {error && (
        <div className="liquid-glass rounded-2xl sm:rounded-3xl p-4 text-xs sm:text-sm text-rose-700 dark:text-rose-400">
          {error}
        </div>
      )}

      {!error && chartPoints.length > 0 && (
        <PriceChart
          points={chartPoints}
          unit={chartUnit}
          onUnitChange={setChartUnit}
          title={historyData?.title || 'Historical Trend'}
          subtitle={historyData?.subtitle}
          labels={chartStrings}
        />
      )}

      {/* Zero-Horizontal-Scroll History Table */}
      {!error && (
        <section className="liquid-glass rounded-2xl sm:rounded-3xl p-3.5 sm:p-5">
          <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
            {t.recordedEntries} ({filteredRows.length})
          </h2>

          {loading && !historyData ? (
            <div className="mt-3 space-y-2">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-9 rounded-xl bg-slate-900/6 dark:bg-white/6 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="mt-3 w-full">
              <table className="w-full table-fixed text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-900/10 text-[11px] sm:text-xs font-semibold text-slate-500 dark:border-white/10 dark:text-slate-400">
                    <th className="w-[33%] sm:w-[24%] py-2 pr-1">
                      {mode === 'yearly' ? t.colYear : mode === 'monthly' ? t.colMonth : t.colDate}
                    </th>
                    <th className="hidden sm:table-cell sm:w-[18%] py-2 pr-2">
                      {mode === 'daily' ? t.colSession : t.colBenchmark}
                    </th>
                    <th className="w-[24%] sm:w-[20%] py-2 px-1 text-right">{t.colPavan}</th>
                    <th className="w-[21%] sm:w-[18%] py-2 px-1 text-right">{t.colGram}</th>
                    <th className="w-[22%] sm:w-[20%] py-2 pl-1 text-right">{t.colChange}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900/6 text-[11px] sm:text-sm dark:divide-white/8">
                  {filteredRows.map((row) => {
                    const primaryLabel =
                      'year' in row ? String(row.year) : 'month' in row ? row.month : row.dateLabel;
                    const secondaryLabel = 'session' in row ? row.session : row.dateLabel;
                    const up = row.direction === 'up';
                    const down = row.direction === 'down';
                    return (
                      <tr
                        key={row.id}
                        className="transition-colors hover:bg-slate-900/[0.025] dark:hover:bg-white/[0.03]"
                      >
                        <td className="py-2 sm:py-2.5 pr-1 align-middle">
                          <div className="font-medium text-slate-900 dark:text-white tabular-nums truncate">
                            {primaryLabel}
                          </div>
                          <div className="sm:hidden text-[10px] text-slate-500 dark:text-slate-400 truncate">
                            {secondaryLabel}
                          </div>
                        </td>
                        <td className="hidden sm:table-cell py-2.5 pr-2 align-middle text-xs text-slate-600 dark:text-slate-400 truncate">
                          {secondaryLabel}
                        </td>
                        <td className="py-2 sm:py-2.5 px-1 align-middle text-right font-semibold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                          {formatInr(row.pavan, row.pavan < 100 ? 2 : 0)}
                        </td>
                        <td className="py-2 sm:py-2.5 px-1 align-middle text-right text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                          {formatInr(row.gram, row.gram < 100 ? 2 : 0)}
                        </td>
                        <td className="py-2 sm:py-2.5 pl-1 align-middle text-right tabular-nums">
                          {row.changePavan === 0 ? (
                            <span className="text-[11px] text-slate-400 dark:text-slate-500">—</span>
                          ) : (
                            <div
                              className={`font-semibold text-[11px] sm:text-xs leading-tight ${
                                up
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : down
                                    ? 'text-rose-700 dark:text-rose-400'
                                    : 'text-slate-500'
                              }`}
                            >
                              <div>
                                {up ? '▲' : '▼'}{' '}
                                {formatSignedInr(row.changePavan, Math.abs(row.changePavan) < 10 ? 2 : 0)}
                              </div>
                              <div className="text-[10px] opacity-80">
                                ({row.changePercent > 0 ? '+' : ''}
                                {row.changePercent}%)
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Compact Cache Management Tile */}
      <section className="liquid-glass rounded-2xl sm:rounded-3xl p-3.5 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <div className="rounded-xl bg-amber-500/12 p-2 text-amber-700 dark:text-amber-400 shrink-0">
              <Database className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-display text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                {t.cacheTitle}
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {cacheStats
                  ? `${cacheStats.historyCount} periods · ${formatBytes(cacheStats.totalBytes)} · Auto-prunes >14d unused`
                  : t.checkingCache}
              </p>
              {cacheNotice && (
                <p className="mt-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  {cacheNotice}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePruneUnused}
              className="min-h-[34px] rounded-xl border border-slate-900/12 bg-white/70 px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-slate-800 hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 cursor-pointer"
            >
              {t.pruneBtn}
            </button>
            <button
              type="button"
              onClick={handleClearAllHistoryCache}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-rose-500/25 bg-rose-500/8 px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-rose-700 hover:bg-rose-500/15 dark:text-rose-400 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t.clearBtn}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
