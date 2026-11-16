import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  CheckCircle2,
  Database,
  RefreshCw,
  Server,
  ShieldAlert,
} from 'lucide-react';
import React, {useMemo, useState} from 'react';
import {TRANSLATIONS} from '../i18n/translations';
import type {
  AppLanguage,
  LatestGoldResponse,
  LiveSpotMarketData,
  PreferredSource,
  SourceProbeResult,
} from '../types/gold';
import {X} from 'lucide-react';
import type {ActiveAlertEvent, PriceAlertConfig} from '../services/priceAlerts';
import {formatInr, formatSignedInr} from '../utils/format';
import {MarketOutlookTile} from './MarketOutlookTile';
import {PriceChart, type ChartPoint} from './PriceChart';

interface LivePriceTabProps {
  lang: AppLanguage;
  data: LatestGoldResponse | null;
  spotData: LiveSpotMarketData | null;
  loading: boolean;
  refreshing: boolean;
  fromCache: boolean;
  error: string | null;
  preferredSource: PreferredSource;
  alertConfig: PriceAlertConfig | null;
  alertMatchedValue: number | null;
  activeAlertEvent: ActiveAlertEvent | null;
  onDismissAlertEvent: () => void;
  onOpenAlertModal: () => void;
  onSelectSource: (source: PreferredSource) => void;
  onRefresh: (probeSources?: boolean) => void;
  onOpenCalculator: () => void;
}

const SOURCE_OPTIONS: Array<{id: PreferredSource; label: string}> = [
  {id: 'auto', label: 'Auto (Primary + Fallback)'},
  {id: 'keralagold', label: 'KeralaGold.com'},
  {id: 'livegoldkerala', label: 'LiveGoldKerala.com'},
  {id: 'goodreturns', label: 'GoodReturns.in'},
  {id: 'groww', label: 'Groww.in'},
  {id: 'bankbazaar', label: 'BankBazaar.com'},
  {id: 'josalukkas', label: 'Jos Alukkas'},
  {id: 'kalyan', label: 'Kalyan Jewellers'},
  {id: 'toi', label: 'Times of India'},
];

function getProbeLabel(status: SourceProbeResult['status']): string {
  switch (status) {
    case 'online':
      return 'Online';
    case 'blocked':
      return 'Bot Protected';
    case 'unavailable':
      return 'Unavailable';
    case 'spa-only':
      return 'Client Only';
    default:
      return 'Error';
  }
}

export const LivePriceTab: React.FC<LivePriceTabProps> = ({
  lang,
  data,
  spotData,
  loading,
  refreshing,
  fromCache,
  error,
  preferredSource,
  alertConfig,
  alertMatchedValue,
  activeAlertEvent,
  onDismissAlertEvent,
  onOpenAlertModal,
  onSelectSource,
  onRefresh,
  onOpenCalculator,
}) => {
  const [chartUnit, setChartUnit] = useState<'pavan' | 'gram'>('pavan');
  const [customUnit, setCustomUnit] = useState<'pavan' | 'gram'>('pavan');
  const [customQty, setCustomQty] = useState<string>('1');
  const [showSources, setShowSources] = useState(false);

  const t = TRANSLATIONS[lang].live;
  const chartStrings = TRANSLATIONS[lang].chart;

  const chartPoints: ChartPoint[] = useMemo(() => {
    if (!data?.entries) return [];
    return data.entries.map((entry) => ({
      id: entry.id,
      label: entry.dateLabel.replace(/-\d{2}$/, ''),
      sublabel: entry.session,
      pavan: entry.pavan,
      gram: entry.gram,
      changePavan: entry.changePavan,
      changeGram: entry.changeGram,
      direction: entry.direction,
    }));
  }, [data]);

  const reverseEntries = useMemo(() => {
    if (!data?.entries) return [];
    return [...data.entries].reverse();
  }, [data]);

  const parsedQty = Math.max(0, Number(customQty) || 0);
  const customGrams = customUnit === 'pavan' ? parsedQty * 8 : parsedQty;
  const customPavan = customUnit === 'pavan' ? parsedQty : parsedQty / 8;
  const custom22kValue = data ? Math.round(customGrams * data.current.gram22k) : 0;
  const custom24kValue = data ? Math.round(customGrams * data.current.gram24kEstimate) : 0;

  if (loading && !data) {
    return (
      <div className="space-y-3 sm:space-y-4">
        <div className="liquid-glass rounded-2xl sm:rounded-3xl p-4 sm:p-6 animate-pulse">
          <div className="h-4 w-44 rounded bg-slate-900/10 dark:bg-white/10" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="h-24 rounded-xl bg-slate-900/8 dark:bg-white/8" />
            <div className="h-24 rounded-xl bg-slate-900/8 dark:bg-white/8" />
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="liquid-glass rounded-2xl sm:rounded-3xl p-5 text-center">
        <p className="font-display text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
          {t.unableToLoad}
        </p>
        <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          {error || 'Network and cached snapshots were unreachable.'}
        </p>
        <button
          type="button"
          onClick={() => onRefresh(true)}
          className="mt-4 inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:bg-amber-700 cursor-pointer"
        >
          <RefreshCw className="h-4 w-4" />
          <span>{t.retryFetch}</span>
        </button>
      </div>
    );
  }

  const isUp = data.current.direction === 'up';
  const isDown = data.current.direction === 'down';

  return (
    <div className="space-y-3 sm:space-y-5">
      {activeAlertEvent && (
        <div
          role="status"
          className={`liquid-glass rounded-2xl border px-3.5 py-2.5 text-xs ${
            activeAlertEvent.trendDirection === 'up'
              ? 'border-emerald-500/35 bg-emerald-500/12 text-emerald-950 dark:text-emerald-200'
              : activeAlertEvent.trendDirection === 'down'
                ? 'border-rose-500/35 bg-rose-500/12 text-rose-950 dark:text-rose-200'
                : 'border-amber-500/35 bg-amber-500/12 text-amber-950 dark:text-amber-200'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              <p className="inline-flex items-center gap-1.5 font-bold">
                <span
                  aria-hidden="true"
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-md text-[11px] font-bold text-white shrink-0 ${
                    activeAlertEvent.trendDirection === 'up'
                      ? 'bg-emerald-600'
                      : activeAlertEvent.trendDirection === 'down'
                        ? 'bg-rose-600'
                        : 'bg-amber-600'
                  }`}
                >
                  {activeAlertEvent.trendSymbol}
                </span>
                <span className="truncate">{activeAlertEvent.title}</span>
              </p>
              <p className="text-[11px] font-medium tabular-nums opacity-90">{activeAlertEvent.body}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={onOpenAlertModal}
                className="font-semibold underline hover:no-underline cursor-pointer"
              >
                {lang === 'ml' ? 'മാറ്റുക' : 'Alerts'}
              </button>
              <button
                type="button"
                onClick={onDismissAlertEvent}
                aria-label="Dismiss alert"
                className="rounded-lg p-1 hover:bg-black/10 dark:hover:bg-white/10 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {!activeAlertEvent && alertConfig?.enabled && alertConfig.targetEnabled && alertMatchedValue !== null && (
        <div
          role="status"
          className="liquid-glass flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-900 dark:text-emerald-200"
        >
          <span className="inline-flex items-center gap-2 font-semibold tabular-nums">
            <BellRing className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
            {lang === 'ml'
              ? `ലക്ഷ്യ വിലയിലെത്തി! 1 പവൻ: ${formatInr(data.current.pavan22k)} · 1 ഗ്രാം: ${formatInr(data.current.gram22k)}`
              : `Target Met! 1 Pavan: ${formatInr(data.current.pavan22k)} · 1 Gram: ${formatInr(data.current.gram22k)} (Target ${alertConfig.direction === 'above' ? '≥' : '≤'} ${formatInr(alertConfig.targetPrice)})`}
          </span>
          <button
            type="button"
            onClick={onOpenAlertModal}
            className="font-semibold underline hover:no-underline cursor-pointer"
          >
            {lang === 'ml' ? 'മാറ്റുക' : 'Edit Alert'}
          </button>
        </div>
      )}

      {/* Compact Adaptive Hero Tile */}
      <section className="liquid-glass rounded-2xl sm:rounded-3xl p-3.5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] sm:text-xs text-slate-600 dark:text-slate-400">
              <span className="font-semibold text-amber-700 dark:text-amber-400">{t.kicker}</span>
              <span aria-hidden="true">·</span>
              <span>{data.current.dateLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{data.scheduleLabel}</span>
              {fromCache && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{t.cached}</span>
                </>
              )}
            </div>
            <h1 className="mt-0.5 font-display text-lg sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t.title}
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 tabular-nums truncate">
              {data.updatedTimeIst} · {data.sourceName}
              {data.fallbackUsed ? ` ${t.fallbackSuffix}` : ''}
            </p>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowSources((v) => !v)}
              className="inline-flex min-h-[36px] sm:min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-900/10 bg-white/60 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-slate-700 transition hover:bg-white dark:border-white/12 dark:bg-white/8 dark:text-slate-200 whitespace-nowrap cursor-pointer"
            >
              <Server className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t.sourcesBtn}</span>
            </button>
            <button
              type="button"
              onClick={() => onRefresh(showSources)}
              disabled={refreshing}
              aria-label="Refresh latest gold price"
              className="inline-flex min-h-[36px] sm:min-h-[38px] items-center gap-1.5 rounded-xl bg-amber-600 px-2.5 sm:px-3.5 py-1.5 text-[11px] sm:text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-60 dark:bg-amber-500 dark:text-slate-950 whitespace-nowrap cursor-pointer"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{refreshing ? t.syncingBtn : t.refreshBtn}</span>
            </button>
          </div>
        </div>

        {/* Multi-Source Fallback Inspector */}
        {showSources && (
          <div className="mt-3.5 border-t border-slate-900/8 pt-3 dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] sm:text-xs font-semibold text-slate-800 dark:text-slate-200">
                {t.providersHeading}
              </span>
              <div className="flex items-center gap-2">
                <select
                  aria-label="Select preferred price source"
                  value={preferredSource}
                  onChange={(e) => onSelectSource(e.target.value as PreferredSource)}
                  className="min-h-[34px] rounded-lg border border-slate-900/12 bg-white/80 px-2.5 py-1 text-[11px] sm:text-xs font-medium text-slate-800 dark:border-white/15 dark:bg-slate-900/80 dark:text-slate-100"
                >
                  {SOURCE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onRefresh(true)}
                  disabled={refreshing}
                  className="min-h-[34px] rounded-lg border border-slate-900/12 bg-white/70 px-2.5 py-1 text-[11px] sm:text-xs font-semibold text-slate-800 hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 cursor-pointer"
                >
                  {t.probeAllBtn}
                </button>
              </div>
            </div>

            {data.fallbackChain && data.fallbackChain.length > 0 && (
              <div className="mt-2.5 grid grid-cols-2 lg:grid-cols-4 gap-2">
                {data.fallbackChain.map((probe) => (
                  <div
                    key={probe.id}
                    className="rounded-xl border border-slate-900/8 bg-white/55 px-2.5 py-2 text-[11px] dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-slate-900 dark:text-white truncate">
                        {probe.name}
                      </span>
                      <span
                        className={`inline-flex items-center gap-0.5 font-medium shrink-0 ${
                          probe.status === 'online'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {probe.status === 'online' ? (
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                        )}
                        {getProbeLabel(probe.status)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {probe.detail} · {probe.latencyMs}ms
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Side-by-Side 2-Column Rate Tiles — Fixed clean wrapping for 24K/18K rates with metallic shimmer */}
        <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:gap-4">
          <div className="gold-shimmer rounded-xl sm:rounded-2xl border border-amber-600/25 bg-gradient-to-br from-amber-500/14 via-amber-400/6 to-transparent p-3 sm:p-4 dark:border-amber-400/25 dark:from-amber-400/16">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t.pavanTitle}
              </span>
              <span
                className={`inline-flex items-center gap-0.5 text-[10px] sm:text-xs font-semibold tabular-nums ${
                  isUp
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : isDown
                      ? 'text-rose-700 dark:text-rose-400'
                      : 'text-slate-500'
                }`}
              >
                {isUp ? (
                  <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                ) : isDown ? (
                  <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
                ) : null}
                {data.current.changePavan === 0 ? '0' : formatSignedInr(data.current.changePavan)}
              </span>
            </div>
            <div className="mt-1 font-gold-numeral gold-text-shine text-xl sm:text-3xl font-bold tracking-tight">
              {formatInr(data.current.pavan22k)}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] sm:text-xs text-slate-600 dark:text-slate-400 tabular-nums leading-snug">
              <span className="whitespace-nowrap">24K: {formatInr(data.current.pavan24kEstimate)}</span>
              <span aria-hidden="true" className="hidden sm:inline">·</span>
              <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                {data.current.trendLabel}
              </span>
            </div>
          </div>

          <div className="rounded-xl sm:rounded-2xl border border-slate-900/10 bg-white/60 p-3 sm:p-4 dark:border-white/10 dark:bg-white/5">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t.gramTitle}
              </span>
              <span
                className={`text-[10px] sm:text-xs font-semibold tabular-nums ${
                  isUp
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : isDown
                      ? 'text-rose-700 dark:text-rose-400'
                      : 'text-slate-500'
                }`}
              >
                {data.current.changeGram === 0
                  ? t.steady
                  : `${formatSignedInr(data.current.changeGram, 0)}/g`}
              </span>
            </div>
            <div className="mt-1 font-gold-numeral text-xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              {formatInr(data.current.gram22k)}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] sm:text-xs text-slate-600 dark:text-slate-400 tabular-nums leading-snug">
              <span className="whitespace-nowrap">24K: {formatInr(data.current.gram24kEstimate)}</span>
              <span aria-hidden="true" className="hidden sm:inline">·</span>
              <span className="whitespace-nowrap text-slate-500 dark:text-slate-400">
                18K: {formatInr(data.current.gram18kEstimate)}
              </span>
            </div>
          </div>
        </div>

        {/* Compact High/Low + Calculator Link */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-900/8 pt-2.5 text-[11px] sm:text-xs dark:border-white/10 tabular-nums">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-600 dark:text-slate-400">
            {data.monthlyHigh && (
              <span>
                {t.high}{' '}
                <strong className="text-slate-900 dark:text-white">
                  {formatInr(data.monthlyHigh.pavan)}
                </strong>
              </span>
            )}
            {data.monthlyLow && (
              <span>
                {t.low}{' '}
                <strong className="text-slate-900 dark:text-white">
                  {formatInr(data.monthlyLow.pavan)}
                </strong>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onOpenCalculator}
            className="inline-flex items-center gap-1 font-semibold text-amber-700 hover:text-amber-800 dark:text-amber-400 cursor-pointer"
          >
            <span>{t.makingCalcLink}</span>
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </section>

      {/* Responsive Split: Custom Weight Tile + Active Month Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-5 items-stretch">
        <section className="lg:col-span-5 liquid-glass rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                {t.customWeightTitle}
              </h2>
              <div className="liquid-segmented inline-flex rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setCustomUnit('pavan')}
                  className={`min-h-[30px] rounded-md px-2.5 py-1 text-[11px] sm:text-xs font-semibold transition cursor-pointer ${
                    customUnit === 'pavan'
                      ? 'liquid-pill-active text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {t.pavanUnit}
                </button>
                <button
                  type="button"
                  onClick={() => setCustomUnit('gram')}
                  className={`min-h-[30px] rounded-md px-2.5 py-1 text-[11px] sm:text-xs font-semibold transition cursor-pointer ${
                    customUnit === 'gram'
                      ? 'liquid-pill-active text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {t.gramUnit}
                </button>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-900/8 bg-white/55 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center gap-2">
                <label htmlFor="custom-weight-input" className="sr-only">
                  {t.customWeightTitle}
                </label>
                <input
                  id="custom-weight-input"
                  type="number"
                  min="0"
                  step="0.25"
                  value={customQty}
                  onChange={(e) => setCustomQty(e.target.value)}
                  className="w-20 sm:w-24 min-h-[38px] rounded-lg border border-slate-900/12 bg-white/90 px-2.5 py-1.5 font-mono-nums text-sm sm:text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-white/15 dark:bg-slate-900/80 dark:text-white"
                />
                <span className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {customUnit === 'pavan'
                    ? `(${customGrams.toFixed(1).replace(/\.0$/, '')}g)`
                    : `(${customPavan.toFixed(2).replace(/\.?0+$/, '')}P)`}
                </span>
              </div>

              <div className="text-right tabular-nums">
                <div className="font-gold-numeral text-lg sm:text-2xl font-bold text-slate-900 dark:text-white">
                  {formatInr(custom22kValue)}
                </div>
                <div className="text-[10.5px] sm:text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  24K: {formatInr(custom24kValue)}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-3 gap-1.5">
            {[
              {label: `0.5 ${t.pavanUnit}`, unit: 'pavan' as const, qty: '0.5'},
              {label: `1 ${t.pavanUnit}`, unit: 'pavan' as const, qty: '1'},
              {label: `2 ${t.pavanUnit}`, unit: 'pavan' as const, qty: '2'},
              {label: `5 ${t.pavanUnit}`, unit: 'pavan' as const, qty: '5'},
              {label: '10 g', unit: 'gram' as const, qty: '10'},
              {label: '50 g', unit: 'gram' as const, qty: '50'},
            ].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  setCustomUnit(preset.unit);
                  setCustomQty(preset.qty);
                }}
                className="min-h-[32px] rounded-lg border border-slate-900/10 bg-white/60 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-white dark:border-white/10 dark:bg-white/8 dark:text-slate-200 cursor-pointer whitespace-nowrap"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </section>

        <div className="lg:col-span-7">
          <PriceChart
            points={chartPoints}
            unit={chartUnit}
            onUnitChange={setChartUnit}
            title={`${data.monthLabel} ${t.chartTitleSuffix}`}
            subtitle={t.chartSubtitle}
            labels={chartStrings}
          />
        </div>
      </div>

      {/* Live Global Spot & Buy-vs-Wait Situational Outlook */}
      <MarketOutlookTile lang={lang} latestData={data} spotData={spotData} />

      {/* Zero-Horizontal-Scroll Active Month Price Log */}
      <section className="liquid-glass rounded-2xl sm:rounded-3xl p-3.5 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
              {data.monthLabel} {t.priceLogTitle} ({reverseEntries.length})
            </h2>
          </div>
          {fromCache && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
              <Database className="h-3 w-3" aria-hidden="true" />
              {t.cached}
            </span>
          )}
        </div>

        <div className="mt-3 w-full">
          <table className="w-full table-fixed text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-900/10 text-[11px] sm:text-xs font-semibold text-slate-500 dark:border-white/10 dark:text-slate-400">
                <th className="w-[33%] sm:w-[24%] py-2 pr-1">{t.colDate}</th>
                <th className="hidden sm:table-cell sm:w-[18%] py-2 pr-2">{t.colSession}</th>
                <th className="w-[24%] sm:w-[20%] py-2 px-1 text-right">{t.colPavan}</th>
                <th className="w-[21%] sm:w-[18%] py-2 px-1 text-right">{t.colGram}</th>
                <th className="w-[22%] sm:w-[20%] py-2 pl-1 text-right">{t.colChange}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900/6 text-[11px] sm:text-sm dark:divide-white/8">
              {reverseEntries.map((entry) => {
                const up = entry.direction === 'up';
                const down = entry.direction === 'down';
                const timePart =
                  data.updatedTimeIst.match(/(\d{1,2}:\d{2}\s*(?:am|pm)(?:\s*IST)?)/i)?.[1] ||
                  data.scheduleLabel;
                const sessionShort = entry.isToday ? `${t.todayLabel} · ${timePart}` : entry.session;
                return (
                  <tr
                    key={entry.id}
                    className={`transition-colors hover:bg-slate-900/[0.025] dark:hover:bg-white/[0.03] ${
                      entry.isToday ? 'bg-amber-500/[0.08] dark:bg-amber-400/[0.09]' : ''
                    }`}
                  >
                    <td className="py-2 sm:py-2.5 pr-1 align-middle">
                      <div className="font-medium text-slate-900 dark:text-white tabular-nums truncate">
                        {entry.dateLabel}
                      </div>
                      <div className="sm:hidden text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        {sessionShort}
                        {entry.note ? ` · ${entry.note.replace(' of Month', '')}` : ''}
                      </div>
                    </td>
                    <td className="hidden sm:table-cell py-2.5 pr-2 align-middle text-xs text-slate-600 dark:text-slate-400 truncate">
                      {sessionShort}
                    </td>
                    <td className="py-2 sm:py-2.5 px-1 align-middle text-right font-semibold text-slate-900 dark:text-white tabular-nums whitespace-nowrap">
                      {formatInr(entry.pavan)}
                    </td>
                    <td className="py-2 sm:py-2.5 px-1 align-middle text-right text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                      {formatInr(entry.gram)}
                    </td>
                    <td className="py-2 sm:py-2.5 pl-1 align-middle text-right tabular-nums">
                      {entry.changePavan === 0 ? (
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
                            {up ? '▲' : '▼'} {formatSignedInr(entry.changePavan)}
                          </div>
                          <div className="text-[10px] opacity-80">
                            ({entry.changePercent > 0 ? '+' : ''}
                            {entry.changePercent}%)
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
      </section>
    </div>
  );
};
