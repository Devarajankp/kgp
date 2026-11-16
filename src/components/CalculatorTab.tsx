import {RotateCcw} from 'lucide-react';
import React, {useEffect, useMemo, useState} from 'react';
import {TRANSLATIONS} from '../i18n/translations';
import type {AppLanguage, LatestGoldResponse} from '../types/gold';
import {formatInr} from '../utils/format';

interface CalculatorTabProps {
  lang: AppLanguage;
  latestData: LatestGoldResponse | null;
}

type PurityKey = '22k' | '24k' | '18k';
type MakingMode = 'percent' | 'perGram' | 'flat';

const PURITY_RATIO: Record<PurityKey, number> = {
  '22k': 1,
  '24k': 24 / 22,
  '18k': 18 / 22,
};

export const CalculatorTab: React.FC<CalculatorTabProps> = ({lang, latestData}) => {
  const base22kGram = latestData?.current.gram22k || 12540;
  const latestDateLabel = latestData?.current.dateLabel || 'Today';

  const [purity, setPurity] = useState<PurityKey>('22k');
  const [unit, setUnit] = useState<'pavan' | 'gram'>('pavan');
  const [weight, setWeight] = useState<string>('1');
  const [customRatePerGram, setCustomRatePerGram] = useState<number>(base22kGram);
  const [rateCustomized, setRateCustomized] = useState(false);

  const [makingMode, setMakingMode] = useState<MakingMode>('percent');
  const [makingPercent, setMakingPercent] = useState<number>(10);
  const [makingPercentInput, setMakingPercentInput] = useState<string>('10');
  const [makingPerGram, setMakingPerGram] = useState<number>(950);
  const [makingFlat, setMakingFlat] = useState<number>(8000);

  const [gstPercent, setGstPercent] = useState<number>(3);
  const [includeHallmark, setIncludeHallmark] = useState<boolean>(false);
  const [stoneCharge, setStoneCharge] = useState<string>('0');
  const [oldGoldDeduction, setOldGoldDeduction] = useState<string>('0');

  const [reverseBudget, setReverseBudget] = useState<string>('150000');

  const t = TRANSLATIONS[lang].calc;

  useEffect(() => {
    if (!rateCustomized && latestData?.current.gram22k) {
      setCustomRatePerGram(Math.round(latestData.current.gram22k * PURITY_RATIO[purity]));
    }
  }, [latestData, purity, rateCustomized]);

  const handlePurityChange = (nextPurity: PurityKey) => {
    setPurity(nextPurity);
    if (!rateCustomized) {
      setCustomRatePerGram(Math.round(base22kGram * PURITY_RATIO[nextPurity]));
    }
  };

  const handleSyncLatestRate = () => {
    setRateCustomized(false);
    setCustomRatePerGram(Math.round(base22kGram * PURITY_RATIO[purity]));
  };

  const numericWeight = Math.max(0, Number(weight) || 0);
  const totalGrams = unit === 'pavan' ? numericWeight * 8 : numericWeight;
  const totalPavan = totalGrams / 8;

  const breakdown = useMemo(() => {
    const baseGoldValue = totalGrams * customRatePerGram;
    let makingCharge = 0;
    if (makingMode === 'percent') {
      makingCharge = baseGoldValue * (makingPercent / 100);
    } else if (makingMode === 'perGram') {
      makingCharge = totalGrams * makingPerGram;
    } else {
      makingCharge = makingFlat;
    }

    const extraStone = Math.max(0, Number(stoneCharge) || 0);
    const hallmarkFee = includeHallmark && totalGrams > 0 ? 45 : 0;
    const taxableSubtotal = baseGoldValue + makingCharge + extraStone + hallmarkFee;
    const gstAmount = taxableSubtotal * (gstPercent / 100);
    const grossTotal = taxableSubtotal + gstAmount;
    const deduction = Math.max(0, Number(oldGoldDeduction) || 0);
    const netPayable = Math.max(0, grossTotal - deduction);
    const effectivePerGram = totalGrams > 0 ? grossTotal / totalGrams : 0;

    return {
      baseGoldValue,
      makingCharge,
      extraStone,
      hallmarkFee,
      taxableSubtotal,
      gstAmount,
      grossTotal,
      deduction,
      netPayable,
      effectivePerGram,
    };
  }, [
    totalGrams,
    customRatePerGram,
    makingMode,
    makingPercent,
    makingPerGram,
    makingFlat,
    stoneCharge,
    includeHallmark,
    gstPercent,
    oldGoldDeduction,
  ]);

  const reverseEstimate = useMemo(() => {
    const budget = Math.max(0, Number(reverseBudget) || 0);
    const preGstBudget = budget / (1 + gstPercent / 100);
    let gramsBuyable = 0;
    if (customRatePerGram > 0) {
      if (makingMode === 'percent') {
        gramsBuyable = preGstBudget / (customRatePerGram * (1 + makingPercent / 100));
      } else if (makingMode === 'perGram') {
        gramsBuyable = preGstBudget / (customRatePerGram + makingPerGram);
      } else {
        gramsBuyable = Math.max(0, preGstBudget - makingFlat) / customRatePerGram;
      }
    }
    return {
      grams: gramsBuyable,
      pavan: gramsBuyable / 8,
    };
  }, [reverseBudget, gstPercent, customRatePerGram, makingMode, makingPercent, makingPerGram, makingFlat]);

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* Mobile Instant Result Strip */}
      <div className="lg:hidden gold-shimmer liquid-glass rounded-2xl p-3.5 flex items-center justify-between gap-3">
        <div>
          <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
            {t.estBill} ({purity.toUpperCase()})
          </span>
          <div className="font-gold-numeral gold-text-shine text-2xl font-bold">
            {formatInr(Math.round(breakdown.netPayable))}
          </div>
        </div>
        <div className="text-right text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
          <div>
            {totalGrams.toFixed(1)}g ({totalPavan.toFixed(2)}P)
          </div>
          <div>
            {t.effRate}: {formatInr(Math.round(breakdown.effectivePerGram))}/g
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 sm:gap-5 items-start">
        {/* Controls Tile */}
        <section className="lg:col-span-7 liquid-glass rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h1 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
                {t.title}
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {t.syncedWith} {latestDateLabel}: {formatInr(base22kGram)}/g · {formatInr(base22kGram * 8)}/{t.pavan}
              </p>
            </div>
            {rateCustomized && (
              <button
                type="button"
                onClick={handleSyncLatestRate}
                className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-amber-600/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-500/20 dark:text-amber-300 cursor-pointer"
              >
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                <span>{t.syncLatest}</span>
              </button>
            )}
          </div>

          {/* Purity + Unit Side-by-Side even on Mobile */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
            <div>
              <span className="block text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t.purity}
              </span>
              <div className="liquid-segmented mt-1.5 grid grid-cols-3 rounded-xl p-0.5">
                {(['22k', '24k', '18k'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handlePurityChange(p)}
                    className={`min-h-[34px] rounded-lg text-[11px] sm:text-xs font-semibold uppercase transition cursor-pointer ${
                      purity === p
                        ? 'liquid-pill-active text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t.weightUnit}
              </span>
              <div className="liquid-segmented mt-1.5 grid grid-cols-2 rounded-xl p-0.5">
                <button
                  type="button"
                  onClick={() => setUnit('pavan')}
                  className={`min-h-[34px] rounded-lg text-[11px] sm:text-xs font-semibold transition cursor-pointer ${
                    unit === 'pavan'
                      ? 'liquid-pill-active text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {t.pavan}
                </button>
                <button
                  type="button"
                  onClick={() => setUnit('gram')}
                  className={`min-h-[34px] rounded-lg text-[11px] sm:text-xs font-semibold transition cursor-pointer ${
                    unit === 'gram'
                      ? 'liquid-pill-active text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {t.gram}
                </button>
              </div>
            </div>
          </div>

          {/* Rate & Weight Side-by-Side */}
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
            <div>
              <label
                htmlFor="calc-rate-gram"
                className="block text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                {t.ratePerGram}
              </label>
              <input
                id="calc-rate-gram"
                type="number"
                min="100"
                step="10"
                value={customRatePerGram}
                onChange={(e) => {
                  setRateCustomized(true);
                  setCustomRatePerGram(Math.max(0, Number(e.target.value) || 0));
                }}
                className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-900/12 bg-white/80 px-2.5 py-1.5 font-mono-nums text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-white/15 dark:bg-slate-900/80 dark:text-white"
              />
              <p className="mt-0.5 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 tabular-nums truncate">
                1P = {formatInr(customRatePerGram * 8)}
              </p>
            </div>

            <div>
              <label
                htmlFor="calc-weight"
                className="block text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                {t.weightLabel} ({unit === 'pavan' ? t.pavan : 'g'})
              </label>
              <input
                id="calc-weight"
                type="number"
                min="0"
                step="0.25"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-900/12 bg-white/80 px-2.5 py-1.5 font-mono-nums text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:border-white/15 dark:bg-slate-900/80 dark:text-white"
              />
              <p className="mt-0.5 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 tabular-nums truncate">
                {totalGrams.toFixed(1)}g · {totalPavan.toFixed(2)}P
              </p>
            </div>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {[
              {label: '0.5P', u: 'pavan' as const, w: '0.5'},
              {label: '1P', u: 'pavan' as const, w: '1'},
              {label: '2P', u: 'pavan' as const, w: '2'},
              {label: '5P', u: 'pavan' as const, w: '5'},
              {label: '10g', u: 'gram' as const, w: '10'},
            ].map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => {
                  setUnit(q.u);
                  setWeight(q.w);
                }}
                className="min-h-[32px] rounded-lg border border-slate-900/10 bg-white/60 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-white dark:border-white/10 dark:bg-white/8 dark:text-slate-200 cursor-pointer"
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Making Charge (VA) */}
          <div className="border-t border-slate-900/8 pt-3.5 dark:border-white/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t.makingChargeVa}
              </span>
              <div className="liquid-segmented inline-flex rounded-lg p-0.5">
                {(
                  [
                    {id: 'percent', label: t.pctRate},
                    {id: 'perGram', label: t.perGramRate},
                    {id: 'flat', label: t.flatRate},
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMakingMode(m.id)}
                    className={`min-h-[30px] rounded-md px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer ${
                      makingMode === m.id
                        ? 'liquid-pill-active text-slate-900 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {makingMode === 'percent' && (
              <div className="mt-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2 text-[11px] sm:text-xs tabular-nums">
                  <label htmlFor="calc-va-percent-input" className="text-slate-600 dark:text-slate-300 font-medium">
                    {t.vaPercentage}
                  </label>
                  <div className="inline-flex items-center gap-1 rounded-xl border border-slate-900/12 bg-white/85 px-2.5 py-1 focus-within:ring-2 focus-within:ring-amber-500 dark:border-white/15 dark:bg-slate-900/80">
                    <input
                      id="calc-va-percent-input"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max="100"
                      step="0.1"
                      value={makingPercentInput}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setMakingPercentInput(raw);
                        if (raw === '') {
                          setMakingPercent(0);
                          return;
                        }
                        const parsed = Number(raw);
                        if (Number.isFinite(parsed)) {
                          const clamped = Math.max(0, Math.min(100, parsed));
                          setMakingPercent(clamped);
                        }
                      }}
                      onBlur={() => setMakingPercentInput(String(makingPercent))}
                      className="w-14 bg-transparent text-right font-mono-nums text-xs sm:text-sm font-bold text-slate-900 focus:outline-none dark:text-white"
                    />
                    <span className="font-semibold text-amber-700 dark:text-amber-400">%</span>
                  </div>
                </div>
                <input
                  aria-label="Making charge percentage slider"
                  type="range"
                  min="0"
                  max="30"
                  step="0.5"
                  value={Math.min(30, makingPercent)}
                  onChange={(e) => {
                    const nextVal = Number(e.target.value);
                    setMakingPercent(nextVal);
                    setMakingPercentInput(String(nextVal));
                  }}
                  className="w-full accent-amber-600 cursor-pointer"
                />
                <div className="grid grid-cols-6 gap-1.5">
                  {[3, 5, 8, 10, 14, 18].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => {
                        setMakingPercent(pct);
                        setMakingPercentInput(String(pct));
                      }}
                      className={`min-h-[30px] rounded-lg px-1.5 py-1 text-[11px] font-semibold tabular-nums cursor-pointer ${
                        makingPercent === pct
                          ? 'bg-amber-600 text-white dark:bg-amber-500 dark:text-slate-950'
                          : 'border border-slate-900/10 bg-white/60 text-slate-700 dark:border-white/10 dark:bg-white/8 dark:text-slate-200'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            )}

            {makingMode === 'perGram' && (
              <input
                aria-label="Making charge per gram"
                type="number"
                min="0"
                step="50"
                value={makingPerGram}
                onChange={(e) => setMakingPerGram(Math.max(0, Number(e.target.value) || 0))}
                className="mt-2.5 w-full min-h-[38px] rounded-xl border border-slate-900/12 bg-white/80 px-3 py-1.5 font-mono-nums text-xs sm:text-sm font-semibold text-slate-900 dark:border-white/15 dark:bg-slate-900/80 dark:text-white"
              />
            )}

            {makingMode === 'flat' && (
              <input
                aria-label="Flat making charge total"
                type="number"
                min="0"
                step="100"
                value={makingFlat}
                onChange={(e) => setMakingFlat(Math.max(0, Number(e.target.value) || 0))}
                className="mt-2.5 w-full min-h-[38px] rounded-xl border border-slate-900/12 bg-white/80 px-3 py-1.5 font-mono-nums text-xs sm:text-sm font-semibold text-slate-900 dark:border-white/15 dark:bg-slate-900/80 dark:text-white"
              />
            )}
          </div>

          {/* GST, Stone, Exchange in 3-col compact row */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 border-t border-slate-900/8 pt-3.5 dark:border-white/10">
            <div>
              <label
                htmlFor="calc-gst"
                className="block text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                {t.gst}
              </label>
              <input
                id="calc-gst"
                type="number"
                min="0"
                max="18"
                step="0.5"
                value={gstPercent}
                onChange={(e) => setGstPercent(Math.max(0, Number(e.target.value) || 0))}
                className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-900/12 bg-white/80 px-2.5 py-1.5 font-mono-nums text-xs sm:text-sm font-semibold text-slate-900 dark:border-white/15 dark:bg-slate-900/80 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="calc-stone"
                className="block text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300 truncate"
              >
                {t.stone}
              </label>
              <input
                id="calc-stone"
                type="number"
                min="0"
                step="100"
                value={stoneCharge}
                onChange={(e) => setStoneCharge(e.target.value)}
                className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-900/12 bg-white/80 px-2.5 py-1.5 font-mono-nums text-xs sm:text-sm font-semibold text-slate-900 dark:border-white/15 dark:bg-slate-900/80 dark:text-white"
              />
            </div>

            <div>
              <label
                htmlFor="calc-exchange"
                className="block text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-300 truncate"
              >
                {t.exchange}
              </label>
              <input
                id="calc-exchange"
                type="number"
                min="0"
                step="500"
                value={oldGoldDeduction}
                onChange={(e) => setOldGoldDeduction(e.target.value)}
                className="mt-1 w-full min-h-[38px] rounded-xl border border-slate-900/12 bg-white/80 px-2.5 py-1.5 font-mono-nums text-xs sm:text-sm font-semibold text-slate-900 dark:border-white/15 dark:bg-slate-900/80 dark:text-white"
              />
            </div>
          </div>

          <label className="inline-flex min-h-[34px] items-center gap-2 text-[11px] sm:text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeHallmark}
              onChange={(e) => setIncludeHallmark(e.target.checked)}
              className="h-4 w-4 rounded accent-amber-600"
            />
            <span>{t.hallmark}</span>
          </label>
        </section>

        {/* Breakdown & Reverse Budget Tiles */}
        <aside className="lg:col-span-5 space-y-3 sm:space-y-5">
          <div className="liquid-glass rounded-2xl sm:rounded-3xl p-3.5 sm:p-5">
            <div className="hidden lg:block">
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                {t.estJewelleryBill} ({purity.toUpperCase()})
              </span>
              <div className="mt-1 font-gold-numeral gold-text-shine text-3xl font-bold tracking-tight">
                {formatInr(Math.round(breakdown.netPayable))}
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {t.effRate}: {formatInr(Math.round(breakdown.effectivePerGram))}/g · {totalGrams.toFixed(1)}g (
                {totalPavan.toFixed(2)}P)
              </p>
            </div>

            <dl className="lg:mt-4 space-y-2 lg:border-t lg:border-slate-900/8 lg:pt-3.5 text-xs sm:text-sm dark:border-white/10 tabular-nums">
              <div className="flex items-center justify-between">
                <dt className="text-slate-600 dark:text-slate-400">{t.baseGoldValue}</dt>
                <dd className="font-semibold text-slate-900 dark:text-white">
                  {formatInr(Math.round(breakdown.baseGoldValue))}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-600 dark:text-slate-400">
                  {t.makingCharge} {makingMode === 'percent' ? `(${makingPercent}%)` : ''}
                </dt>
                <dd className="font-semibold text-slate-900 dark:text-white">
                  {formatInr(Math.round(breakdown.makingCharge))}
                </dd>
              </div>
              {breakdown.extraStone > 0 && (
                <div className="flex items-center justify-between">
                  <dt className="text-slate-600 dark:text-slate-400">{t.stoneAddons}</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white">
                    {formatInr(Math.round(breakdown.extraStone))}
                  </dd>
                </div>
              )}
              {breakdown.hallmarkFee > 0 && (
                <div className="flex items-center justify-between">
                  <dt className="text-slate-600 dark:text-slate-400">{t.hallmarkingLabel}</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white">
                    {formatInr(breakdown.hallmarkFee)}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-slate-900/6 pt-2 dark:border-white/8">
                <dt className="text-slate-600 dark:text-slate-400">{t.taxableSubtotal}</dt>
                <dd className="font-semibold text-slate-900 dark:text-white">
                  {formatInr(Math.round(breakdown.taxableSubtotal))}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-600 dark:text-slate-400">GST ({gstPercent}%)</dt>
                <dd className="font-semibold text-slate-900 dark:text-white">
                  {formatInr(Math.round(breakdown.gstAmount))}
                </dd>
              </div>
              {breakdown.deduction > 0 && (
                <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400">
                  <dt>{t.oldGoldExchange}</dt>
                  <dd className="font-semibold">-{formatInr(Math.round(breakdown.deduction))}</dd>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-slate-900/10 pt-2.5 text-sm sm:text-base font-bold text-slate-900 dark:border-white/12 dark:text-white">
                <dt>{t.netPayable}</dt>
                <dd>{formatInr(Math.round(breakdown.netPayable))}</dd>
              </div>
            </dl>
          </div>

          <div className="liquid-glass rounded-2xl sm:rounded-3xl p-3.5 sm:p-5">
            <h2 className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
              {t.reverseTitle}
            </h2>
            <div className="mt-2 flex items-center gap-3">
              <label htmlFor="reverse-budget-input" className="sr-only">
                Budget amount in rupees
              </label>
              <input
                id="reverse-budget-input"
                type="number"
                min="0"
                step="5000"
                value={reverseBudget}
                onChange={(e) => setReverseBudget(e.target.value)}
                className="w-36 min-h-[38px] rounded-xl border border-slate-900/12 bg-white/80 px-2.5 py-1.5 font-mono-nums text-xs sm:text-sm font-semibold text-slate-900 dark:border-white/15 dark:bg-slate-900/80 dark:text-white"
              />
              <div className="flex-1 text-right tabular-nums">
                <div className="font-gold-numeral text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  {reverseEstimate.pavan.toFixed(2)} {t.pavanSuffix}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {reverseEstimate.grams.toFixed(2)} {t.afterVaGst}
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
