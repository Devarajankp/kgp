import React, {useId, useMemo, useState} from 'react';
import type {PriceDirection} from '../types/gold';
import {formatInr, formatSignedInr} from '../utils/format';

export interface ChartPoint {
  id: string;
  label: string;
  sublabel?: string;
  pavan: number;
  gram: number;
  changePavan: number;
  changeGram: number;
  direction: PriceDirection;
}

interface PriceChartProps {
  points: ChartPoint[];
  unit: 'pavan' | 'gram';
  onUnitChange?: (unit: 'pavan' | 'gram') => void;
  title: string;
  subtitle?: string;
  height?: number;
  labels?: {
    noPoints: string;
    pavanBtn: string;
    gramBtn: string;
    highShort: string;
    lowShort: string;
  };
}

function formatAxisPrice(val: number): string {
  if (val < 100) return `₹${val.toFixed(0)}`;
  return `₹${Math.round(val).toLocaleString('en-IN')}`;
}

export const PriceChart: React.FC<PriceChartProps> = ({
  points,
  unit,
  onUnitChange,
  title,
  subtitle,
  height = 205,
  labels = {
    noPoints: 'No chart points available for this selection.',
    pavanBtn: 'Pavan',
    gramBtn: '1 Gram',
    highShort: 'H',
    lowShort: 'L',
  },
}) => {
  const gradId = useId().replace(/:/g, '');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const chartData = useMemo(() => {
    if (points.length === 0) return null;
    const width = 520;
    const padLeft = 68;
    const padRight = 14;
    const padTop = 14;
    const padBottom = 28;
    const innerW = width - padLeft - padRight;
    const innerH = height - padTop - padBottom;

    const values = points.map((p) => (unit === 'pavan' ? p.pavan : p.gram));
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || Math.max(1, maxVal * 0.02);
    const yMin = Math.max(0, minVal - range * 0.14);
    const yMax = maxVal + range * 0.14;
    const ySpan = yMax - yMin || 1;

    const coords = points.map((p, idx) => {
      const val = unit === 'pavan' ? p.pavan : p.gram;
      const x =
        points.length === 1
          ? padLeft + innerW / 2
          : padLeft + (idx / (points.length - 1)) * innerW;
      const y = padTop + ((yMax - val) / ySpan) * innerH;
      return {x, y, val, point: p};
    });

    const linePath = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
      .join(' ');

    const areaPath =
      coords.length > 1
        ? `${linePath} L ${coords[coords.length - 1].x.toFixed(1)} ${(padTop + innerH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padTop + innerH).toFixed(1)} Z`
        : '';

    const yTicks = [0, 0.33, 0.66, 1].map((ratio) => {
      const y = padTop + innerH * ratio;
      const value = yMax - ySpan * ratio;
      return {ratio, y, value};
    });

    const highCoord = coords.reduce((a, b) => (b.val > a.val ? b : a));
    const lowCoord = coords.reduce((a, b) => (b.val < a.val ? b : a));

    return {
      width,
      height,
      padLeft,
      padRight,
      padTop,
      padBottom,
      innerW,
      innerH,
      coords,
      linePath,
      areaPath,
      yTicks,
      highCoord,
      lowCoord,
      minVal,
      maxVal,
    };
  }, [points, unit, height]);

  if (!chartData || points.length === 0) {
    return (
      <div className="liquid-glass rounded-2xl sm:rounded-3xl p-3.5 sm:p-5">
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
          {labels.noPoints}
        </p>
      </div>
    );
  }

  const activeIdx =
    hoverIdx !== null && hoverIdx < chartData.coords.length ? hoverIdx : chartData.coords.length - 1;
  const active = chartData.coords[activeIdx];
  const activeChange = unit === 'pavan' ? active.point.changePavan : active.point.changeGram;

  const handlePointerMove = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0]?.clientX : e.clientX;
    if (clientX === undefined || rect.width <= 0) return;

    const relX = ((clientX - rect.left) / rect.width) * chartData.width;
    let nearest = 0;
    let bestDist = Infinity;
    chartData.coords.forEach((c, idx) => {
      const d = Math.abs(c.x - relX);
      if (d < bestDist) {
        bestDist = d;
        nearest = idx;
      }
    });
    setHoverIdx(nearest);
  };

  // Pick up to 5 evenly-spaced X axis labels including first & last without overlapping
  const maxXLabels = points.length <= 5 ? points.length : 5;
  const xTickIndices = new Set<number>();
  if (points.length === 1) {
    xTickIndices.add(0);
  } else {
    for (let i = 0; i < maxXLabels; i++) {
      const idx = Math.round((i * (points.length - 1)) / (maxXLabels - 1));
      xTickIndices.add(idx);
    }
  }

  const xAxisY = chartData.padTop + chartData.innerH;

  return (
    <div className="liquid-glass rounded-2xl sm:rounded-3xl p-3.5 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-white truncate">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 truncate">
              {subtitle}
            </p>
          )}
        </div>

        {onUnitChange && (
          <div
            className="liquid-segmented inline-flex rounded-lg sm:rounded-xl p-0.5 shrink-0"
            role="group"
            aria-label="Chart price unit"
          >
            <button
              type="button"
              onClick={() => onUnitChange('pavan')}
              className={`min-h-[30px] sm:min-h-[34px] rounded-md sm:rounded-lg px-2.5 py-1 text-[11px] sm:text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                unit === 'pavan'
                  ? 'liquid-pill-active text-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {labels.pavanBtn}
            </button>
            <button
              type="button"
              onClick={() => onUnitChange('gram')}
              className={`min-h-[30px] sm:min-h-[34px] rounded-md sm:rounded-lg px-2.5 py-1 text-[11px] sm:text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                unit === 'gram'
                  ? 'liquid-pill-active text-slate-900 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {labels.gramBtn}
            </button>
          </div>
        )}
      </div>

      {/* Scrubber Readout */}
      <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-900/6 pb-2 dark:border-white/8">
        <div className="flex items-baseline gap-2">
          <span className="font-gold-numeral text-lg sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
            {formatInr(active.val, active.val < 100 ? 2 : 0)}
          </span>
          <span className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">
            {active.point.label}
            {active.point.sublabel ? ` · ${active.point.sublabel}` : ''}
          </span>
        </div>

        <div className="flex items-center gap-2.5 text-[11px] sm:text-xs tabular-nums">
          {activeChange !== 0 && (
            <span
              className={`font-semibold ${
                active.point.direction === 'up'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-rose-700 dark:text-rose-400'
              }`}
            >
              {active.point.direction === 'up' ? '▲' : '▼'}{' '}
              {formatSignedInr(activeChange, Math.abs(activeChange) < 10 ? 2 : 0)}
            </span>
          )}
          <span className="text-slate-500 dark:text-slate-400">
            {labels.highShort}: {formatInr(chartData.maxVal, chartData.maxVal < 100 ? 2 : 0)} · {labels.lowShort}:{' '}
            {formatInr(chartData.minVal, chartData.minVal < 100 ? 2 : 0)}
          </span>
        </div>
      </div>

      {/* Responsive SVG Chart with explicit Y & X axes */}
      <div className="mt-2 w-full select-none">
        <svg
          viewBox={`0 0 ${chartData.width} ${chartData.height}`}
          className="h-44 sm:h-52 w-full touch-pan-y"
          onMouseMove={handlePointerMove}
          onTouchMove={handlePointerMove}
          onMouseLeave={() => setHoverIdx(null)}
          role="img"
          aria-label={title}
        >
          <defs>
            <linearGradient id={`area-${gradId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d97706" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#d97706" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Horizontal Gridlines & Y-Axis Scale Values */}
          {chartData.yTicks.map((tick) => (
            <g key={tick.ratio}>
              <line
                x1={chartData.padLeft}
                x2={chartData.width - chartData.padRight}
                y1={tick.y}
                y2={tick.y}
                stroke="currentColor"
                className="text-slate-900/8 dark:text-white/10"
                strokeDasharray="3 4"
              />
              <text
                x={chartData.padLeft - 6}
                y={tick.y + 3.5}
                textAnchor="end"
                fontSize="10.5"
                className="fill-slate-500 dark:fill-slate-400 font-medium tabular-nums"
              >
                {formatAxisPrice(tick.value)}
              </text>
            </g>
          ))}

          {/* Y & X Axes Lines */}
          <line
            x1={chartData.padLeft}
            x2={chartData.padLeft}
            y1={chartData.padTop}
            y2={xAxisY}
            stroke="currentColor"
            className="text-slate-900/15 dark:text-white/15"
            strokeWidth="1"
          />
          <line
            x1={chartData.padLeft}
            x2={chartData.width - chartData.padRight}
            y1={xAxisY}
            y2={xAxisY}
            stroke="currentColor"
            className="text-slate-900/15 dark:text-white/15"
            strokeWidth="1"
          />

          {/* Gold Area Fill */}
          {chartData.areaPath && (
            <path d={chartData.areaPath} fill={`url(#area-${gradId})`} />
          )}

          {/* Main Gold Trend Line */}
          <path
            d={chartData.linePath}
            fill="none"
            stroke="#d97706"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Subtle Node Markers (LiveGoldKerala style) */}
          {chartData.coords.length <= 45 &&
            chartData.coords.map((c) => (
              <circle
                key={`dot-${c.point.id}`}
                cx={c.x}
                cy={c.y}
                r="2.2"
                fill="#f59e0b"
                opacity="0.45"
              />
            ))}

          {/* Monthly High & Low Beacons */}
          <circle
            cx={chartData.highCoord.x}
            cy={chartData.highCoord.y}
            r="3.8"
            className="fill-emerald-600 dark:fill-emerald-400 stroke-white dark:stroke-slate-900"
            strokeWidth="1.25"
          />
          <circle
            cx={chartData.lowCoord.x}
            cy={chartData.lowCoord.y}
            r="3.8"
            className="fill-rose-600 dark:fill-rose-400 stroke-white dark:stroke-slate-900"
            strokeWidth="1.25"
          />

          {/* Interactive Active Scrubber */}
          <line
            x1={active.x}
            x2={active.x}
            y1={chartData.padTop}
            y2={xAxisY}
            stroke="#d97706"
            strokeWidth="1.25"
            strokeDasharray="3 3"
            opacity="0.75"
          />
          <circle
            cx={active.x}
            cy={active.y}
            r="5"
            className="fill-amber-500 stroke-white dark:stroke-slate-900"
            strokeWidth="2"
          />

          {/* X-Axis Tick Marks & Labels */}
          {chartData.coords.map((c, idx) => {
            if (!xTickIndices.has(idx)) return null;
            const isFirst = idx === 0;
            const isLast = idx === chartData.coords.length - 1;
            return (
              <g key={`x-${c.point.id}`}>
                <line
                  x1={c.x}
                  x2={c.x}
                  y1={xAxisY}
                  y2={xAxisY + 4}
                  stroke="currentColor"
                  className="text-slate-900/20 dark:text-white/20"
                  strokeWidth="1"
                />
                <text
                  x={c.x}
                  y={chartData.height - 6}
                  textAnchor={isFirst ? 'start' : isLast ? 'end' : 'middle'}
                  fontSize="10.5"
                  className="fill-slate-500 dark:fill-slate-400 font-medium tabular-nums"
                >
                  {c.point.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
