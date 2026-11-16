import {Check, Copy, Download, Moon, Share2, Sun, X} from 'lucide-react';
import React, {useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import type {AppLanguage, LatestGoldResponse} from '../types/gold';
import {formatInr, formatSignedInr} from '../utils/format';
import {buildShareText, renderShareCardPng} from '../utils/shareCard';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  data: LatestGoldResponse | null;
  lang: AppLanguage;
  theme: 'light' | 'dark';
}

export const ShareModal: React.FC<ShareModalProps> = ({open, onClose, data, lang, theme}) => {
  const [cardTheme, setCardTheme] = useState<'light' | 'dark'>(theme);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);

  useEffect(() => {
    if (open) {
      setCardTheme(theme);
    }
  }, [open, theme]);

  useEffect(() => {
    if (!open || !data) return;
    setStatusMsg(null);
    setCopied(false);
    let cancelled = false;
    renderShareCardPng(data, lang, cardTheme).then((blob) => {
      if (!cancelled) setPreviewBlob(blob);
    });
    return () => {
      cancelled = true;
    };
  }, [open, data, lang, cardTheme]);

  const recentEntries = useMemo(() => {
    if (!data?.entries) return [];
    return data.entries.slice(-5).reverse();
  }, [data]);

  const miniChart = useMemo(() => {
    const entries = data?.entries || [];
    if (entries.length < 2) return null;

    const minVal = Math.min(...entries.map((e) => e.pavan));
    const maxVal = Math.max(...entries.map((e) => e.pavan));
    const span = Math.max(1, maxVal - minVal);
    const padLow = Math.round(minVal - span * 0.12);
    const padHigh = Math.round(maxVal + span * 0.12);
    const padSpan = Math.max(1, padHigh - padLow);

    const w = 320;
    const h = 92;
    const left = 54;
    const right = 8;
    const top = 10;
    const bottom = 18;
    const innerW = w - left - right;
    const innerH = h - top - bottom;

    let peakIdx = 0;
    let lowIdx = 0;
    const pts = entries.map((e, idx) => {
      if (e.pavan >= entries[peakIdx].pavan) peakIdx = idx;
      if (e.pavan <= entries[lowIdx].pavan) lowIdx = idx;
      const x = left + (idx / Math.max(1, entries.length - 1)) * innerW;
      const y = top + innerH - ((e.pavan - padLow) / padSpan) * innerH;
      return {x, y, entry: e};
    });

    const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${(top + innerH).toFixed(1)} L${pts[0].x.toFixed(1)},${(top + innerH).toFixed(1)} Z`;
    const midIdx = Math.floor((entries.length - 1) / 2);
    const monthNet = entries[entries.length - 1].pavan - entries[0].pavan;

    return {
      w,
      h,
      left,
      top,
      innerW,
      innerH,
      padLow,
      padHigh,
      minVal,
      maxVal,
      peakIdx,
      lowIdx,
      midIdx,
      monthNet,
      pts,
      linePath,
      areaPath,
      firstLabel: entries[0].dateLabel.replace(/-\d{2}$/, ''),
      midLabel: entries[midIdx].dateLabel.replace(/-\d{2}$/, ''),
      lastLabel: entries[entries.length - 1].dateLabel.replace(/-\d{2}$/, ''),
      count: entries.length,
    };
  }, [data]);

  if (!open || !data || typeof document === 'undefined') return null;

  const isUp = data.current.direction === 'up';
  const isDown = data.current.direction === 'down';
  const isDarkCard = cardTheme === 'dark';
  const shareText = buildShareText(data, lang);
  const supportsWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleNativeShare = async () => {
    setSharing(true);
    setStatusMsg(null);
    try {
      const blob = previewBlob || (await renderShareCardPng(data, lang, cardTheme));
      if (blob && typeof File !== 'undefined') {
        const fileName = `kerala-gold-${data.current.dateLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
        const file = new File([blob], fileName, {type: 'image/png'});
        if (navigator.canShare && navigator.canShare({files: [file]})) {
          await navigator.share({
            title: lang === 'ml' ? 'ഇന്നത്തെ കേരള സ്വർണ്ണ വില' : 'Kerala Gold Price Today',
            text: shareText,
            files: [file],
          });
          setStatusMsg(lang === 'ml' ? 'കാർഡ് പങ്കിട്ടു!' : 'Shared rate card!');
          return;
        }
      }

      await navigator.share({
        title: lang === 'ml' ? 'ഇന്നത്തെ കേരള സ്വർണ്ണ വില' : 'Kerala Gold Price Today',
        text: shareText,
        url: window.location.href,
      });
      setStatusMsg(lang === 'ml' ? 'നിരക്കുകൾ പങ്കിട്ടു!' : 'Shared gold rates!');
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setStatusMsg(null);
      } else {
        setStatusMsg(
          lang === 'ml'
            ? 'നേരിട്ട് പങ്കിടാനായില്ല — പകർത്തുകയോ ഡൗൺലോഡ് ചെയ്യുകയോ ചെയ്യാം.'
            : 'Native share unavailable here — use Copy or Save PNG below.',
        );
      }
    } finally {
      setSharing(false);
    }
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setStatusMsg('Could not access clipboard.');
    }
  };

  const handleDownloadPng = async () => {
    const blob = previewBlob || (await renderShareCardPng(data, lang, cardTheme));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kerala-gold-${data.current.dateLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatusMsg(lang === 'ml' ? 'ഷെയർ കാർഡ് സേവ് ചെയ്തു!' : 'Saved share card PNG!');
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="liquid-glass w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-3xl p-4 sm:p-5 text-slate-900 dark:text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between gap-2">
          <h2 id="share-modal-title" className="font-display text-base sm:text-lg font-bold">
            {lang === 'ml' ? 'സ്വർണ്ണ വില പങ്കിടുക' : 'Share Gold Rate Card'}
          </h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCardTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label="Toggle share card theme"
              title={isDarkCard ? 'Switch card to Day theme' : 'Switch card to Night theme'}
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl border border-slate-900/10 bg-white/70 text-slate-700 hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-200 cursor-pointer"
            >
              {isDarkCard ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close share dialog"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Theme-Matched Brushed Gold Share Card Preview (Tiles + Miniature Monthly Chart + Recent 5 Days) */}
        <div
          className={`mt-3 overflow-hidden rounded-2xl border p-3.5 sm:p-4 shadow-xl transition-colors ${
            isDarkCard
              ? 'border-amber-400/35 bg-gradient-to-br from-[#10131a] via-[#18140d] to-[#0a0c11] text-white'
              : 'border-amber-600/25 bg-gradient-to-br from-[#faf7f0] via-[#f2e8d4] to-[#f8f4ea] text-slate-900'
          }`}
        >
          <div
            className={`flex items-center justify-between gap-2 border-b pb-2 text-[10.5px] sm:text-[11px] ${
              isDarkCard ? 'border-white/10' : 'border-slate-900/10'
            }`}
          >
            <span
              className={`font-display font-bold tracking-wide ${
                isDarkCard ? 'text-amber-300' : 'text-amber-800'
              }`}
            >
              {lang === 'ml' ? 'കേരള സ്വർണ്ണ വില · KGP' : 'KERALA GOLD PRICE · KGP'}
            </span>
            <span
              className={`tabular-nums truncate ${
                isDarkCard ? 'text-slate-300' : 'text-slate-600'
              }`}
            >
              {data.current.dateLabel} · {data.scheduleLabel}
            </span>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            {/* 1 Pavan Gold Metallic Shimmer Tile */}
            <div
              className={`gold-shimmer rounded-xl border p-2.5 sm:p-3 ${
                isDarkCard
                  ? 'border-amber-400/35 bg-gradient-to-br from-amber-500/18 via-amber-400/8 to-transparent'
                  : 'border-amber-600/30 bg-gradient-to-br from-amber-500/20 via-amber-200/35 to-white/65'
              }`}
            >
              <div
                className={`text-[10px] sm:text-[10.5px] font-semibold ${
                  isDarkCard ? 'text-amber-200' : 'text-amber-900'
                }`}
              >
                {lang === 'ml' ? '1 പവൻ (8g · 22K)' : '1 PAVAN (8g · 22K)'}
              </div>
              <div
                className={`mt-0.5 font-gold-numeral text-xl sm:text-2xl font-bold tracking-tight ${
                  isDarkCard
                    ? 'bg-gradient-to-r from-[#f5d07a] via-[#fff2b8] to-[#efb849] bg-clip-text text-transparent'
                    : 'bg-gradient-to-r from-[#7c4706] via-[#c48112] to-[#7c4706] bg-clip-text text-transparent'
                }`}
              >
                {formatInr(data.current.pavan22k)}
              </div>
              <div
                className={`mt-0.5 text-[10.5px] sm:text-[11px] font-semibold tabular-nums ${
                  isUp
                    ? isDarkCard
                      ? 'text-emerald-400'
                      : 'text-emerald-700'
                    : isDown
                      ? isDarkCard
                        ? 'text-rose-400'
                        : 'text-rose-700'
                      : 'text-slate-500'
                }`}
              >
                {data.current.changePavan === 0
                  ? lang === 'ml'
                    ? 'മാറ്റമില്ല'
                    : 'Steady'
                  : `${isUp ? '▲' : '▼'} ${formatSignedInr(data.current.changePavan)}`}
              </div>
            </div>

            {/* 1 Gram Tile */}
            <div
              className={`rounded-xl border p-2.5 sm:p-3 ${
                isDarkCard ? 'border-white/12 bg-white/5' : 'border-slate-900/10 bg-white/65'
              }`}
            >
              <div
                className={`text-[10px] sm:text-[10.5px] font-semibold ${
                  isDarkCard ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                {lang === 'ml' ? '1 ഗ്രാം (22K)' : '1 GRAM (22K)'}
              </div>
              <div
                className={`mt-0.5 font-gold-numeral text-xl sm:text-2xl font-bold tracking-tight ${
                  isDarkCard ? 'text-white' : 'text-slate-900'
                }`}
              >
                {formatInr(data.current.gram22k)}
              </div>
              <div
                className={`mt-0.5 text-[10px] tabular-nums ${
                  isDarkCard ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                24K: {formatInr(data.current.gram24kEstimate)} · 18K: {formatInr(data.current.gram18kEstimate)}
              </div>
            </div>
          </div>

          {/* Miniature Active-Month Trend Chart */}
          {miniChart && (
            <div
              className={`mt-2.5 rounded-xl border p-2.5 ${
                isDarkCard
                  ? 'border-amber-400/20 bg-white/[0.035]'
                  : 'border-amber-700/18 bg-white/60'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-semibold mb-1">
                <span className={isDarkCard ? 'text-amber-300' : 'text-amber-800'}>
                  {data.monthLabel} ({miniChart.count} updates)
                </span>
                <span
                  className={`tabular-nums ${
                    miniChart.monthNet > 0
                      ? isDarkCard
                        ? 'text-emerald-400'
                        : 'text-emerald-700'
                      : miniChart.monthNet < 0
                        ? isDarkCard
                          ? 'text-rose-400'
                          : 'text-rose-700'
                        : isDarkCard
                          ? 'text-slate-400'
                          : 'text-slate-600'
                  }`}
                >
                  {miniChart.monthNet === 0
                    ? 'Net: Steady'
                    : `Net: ${miniChart.monthNet > 0 ? '▲' : '▼'} ${formatSignedInr(miniChart.monthNet)}`}
                </span>
              </div>

              <svg
                viewBox={`0 0 ${miniChart.w} ${miniChart.h}`}
                className="w-full h-24 overflow-visible"
                role="img"
                aria-label={`${data.monthLabel} miniature gold price chart`}
              >
                <defs>
                  <linearGradient id="shareMiniAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={isDarkCard ? '#efb849' : '#b87714'} stopOpacity="0.35" />
                    <stop offset="100%" stopColor={isDarkCard ? '#efb849' : '#b87714'} stopOpacity="0.01" />
                  </linearGradient>
                </defs>

                {[0, 0.5, 1].map((tRatio, idx) => {
                  const y = miniChart.top + tRatio * miniChart.innerH;
                  const val = Math.round(miniChart.padHigh - tRatio * (miniChart.padHigh - miniChart.padLow));
                  return (
                    <g key={idx}>
                      <line
                        x1={miniChart.left}
                        x2={miniChart.left + miniChart.innerW}
                        y1={y}
                        y2={y}
                        stroke={isDarkCard ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)'}
                        strokeDasharray="3 3"
                        strokeWidth="0.75"
                      />
                      <text
                        x={miniChart.left - 4}
                        y={y + 3}
                        textAnchor="end"
                        fill={isDarkCard ? 'rgba(241,245,249,0.6)' : 'rgba(30,41,59,0.6)'}
                        fontSize="7.5"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {formatInr(val)}
                      </text>
                    </g>
                  );
                })}

                <path d={miniChart.areaPath} fill="url(#shareMiniAreaGrad)" />
                <path
                  d={miniChart.linePath}
                  fill="none"
                  stroke={isDarkCard ? '#efb849' : '#b87714'}
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {/* Peak, Low, and Latest Dots */}
                <circle
                  cx={miniChart.pts[miniChart.peakIdx].x}
                  cy={miniChart.pts[miniChart.peakIdx].y}
                  r="3"
                  fill="#10b981"
                  stroke={isDarkCard ? '#10131a' : '#ffffff'}
                  strokeWidth="1"
                />
                <circle
                  cx={miniChart.pts[miniChart.lowIdx].x}
                  cy={miniChart.pts[miniChart.lowIdx].y}
                  r="3"
                  fill="#f43f5e"
                  stroke={isDarkCard ? '#10131a' : '#ffffff'}
                  strokeWidth="1"
                />
                <circle
                  cx={miniChart.pts[miniChart.pts.length - 1].x}
                  cy={miniChart.pts[miniChart.pts.length - 1].y}
                  r="3.2"
                  fill={isDarkCard ? '#fde047' : '#d97706'}
                  stroke={isDarkCard ? '#10131a' : '#ffffff'}
                  strokeWidth="1"
                />

                {/* X-Axis Labels */}
                <text
                  x={miniChart.left}
                  y={miniChart.top + miniChart.innerH + 12}
                  textAnchor="start"
                  fill={isDarkCard ? 'rgba(241,245,249,0.58)' : 'rgba(30,41,59,0.58)'}
                  fontSize="7.5"
                >
                  {miniChart.firstLabel}
                </text>
                <text
                  x={miniChart.pts[miniChart.midIdx].x}
                  y={miniChart.top + miniChart.innerH + 12}
                  textAnchor="middle"
                  fill={isDarkCard ? 'rgba(241,245,249,0.58)' : 'rgba(30,41,59,0.58)'}
                  fontSize="7.5"
                >
                  {miniChart.midLabel}
                </text>
                <text
                  x={miniChart.left + miniChart.innerW}
                  y={miniChart.top + miniChart.innerH + 12}
                  textAnchor="end"
                  fill={isDarkCard ? 'rgba(241,245,249,0.58)' : 'rgba(30,41,59,0.58)'}
                  fontSize="7.5"
                >
                  {miniChart.lastLabel}
                </text>
              </svg>

              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[9.5px] tabular-nums">
                <span className={isDarkCard ? 'text-emerald-400' : 'text-emerald-700'}>
                  ● Peak ({miniChart.pts[miniChart.peakIdx].entry.dateLabel.replace(/-\d{2}$/, '')}):{' '}
                  {formatInr(miniChart.maxVal)}
                </span>
                <span className={isDarkCard ? 'text-rose-400' : 'text-rose-700'}>
                  ● Low ({miniChart.pts[miniChart.lowIdx].entry.dateLabel.replace(/-\d{2}$/, '')}):{' '}
                  {formatInr(miniChart.minVal)}
                </span>
              </div>
            </div>
          )}

          {/* Recent 5-Day Price History Strip */}
          {recentEntries.length > 0 && (
            <div
              className={`mt-2.5 rounded-xl border p-2.5 ${
                isDarkCard
                  ? 'border-white/10 bg-white/[0.035]'
                  : 'border-slate-900/10 bg-white/55'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-[10px] font-semibold mb-1">
                <span className={isDarkCard ? 'text-amber-300' : 'text-amber-800'}>
                  {lang === 'ml' ? 'സമീപകാല മാറ്റങ്ങൾ (1 പവൻ)' : 'Recent Trend (1 Pavan)'}
                </span>
              </div>

              <div
                className={`divide-y text-[10.5px] tabular-nums ${
                  isDarkCard ? 'divide-white/8' : 'divide-slate-900/8'
                }`}
              >
                {recentEntries.map((entry) => {
                  const eUp = entry.direction === 'up';
                  const eDown = entry.direction === 'down';
                  return (
                    <div key={entry.id} className="flex items-center justify-between gap-2 py-1">
                      <span className={`truncate ${isDarkCard ? 'text-slate-300' : 'text-slate-700'}`}>
                        {entry.dateLabel}{' '}
                        <span className={isDarkCard ? 'text-slate-500' : 'text-slate-400'}>
                          ({entry.session})
                        </span>
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`font-semibold ${isDarkCard ? 'text-white' : 'text-slate-900'}`}>
                          {formatInr(entry.pavan)}
                        </span>
                        <span
                          className={`font-semibold w-14 text-right ${
                            eUp
                              ? isDarkCard
                                ? 'text-emerald-400'
                                : 'text-emerald-700'
                              : eDown
                                ? isDarkCard
                                  ? 'text-rose-400'
                                  : 'text-rose-700'
                                : 'text-slate-400'
                          }`}
                        >
                          {entry.changePavan === 0
                            ? '—'
                            : `${eUp ? '▲' : '▼'} ${formatSignedInr(entry.changePavan)}`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div
            className={`mt-2.5 flex items-center justify-between text-[10px] tabular-nums ${
              isDarkCard ? 'text-slate-400' : 'text-slate-600'
            }`}
          >
            <span className="truncate">{data.updatedTimeIst}</span>
            <span className="shrink-0">{data.sourceName}</span>
          </div>
        </div>

        {statusMsg && (
          <p className="mt-2.5 text-center text-xs font-medium text-amber-700 dark:text-amber-400">
            {statusMsg}
          </p>
        )}

        {/* Action Buttons */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {supportsWebShare && (
            <button
              type="button"
              onClick={handleNativeShare}
              disabled={sharing}
              className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-60 dark:bg-amber-500 dark:text-slate-950 cursor-pointer"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              <span>
                {sharing
                  ? lang === 'ml'
                    ? 'തയ്യാറാക്കുന്നു...'
                    : 'Preparing...'
                  : lang === 'ml'
                    ? 'ഷെയർ ചെയ്യുക'
                    : 'Share via Device'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={handleDownloadPng}
            className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-900/12 bg-white/80 px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 cursor-pointer"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>{lang === 'ml' ? 'കാർഡ് സേവ്' : 'Save PNG'}</span>
          </button>

          <button
            type="button"
            onClick={handleCopyText}
            className="min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-900/12 bg-white/80 px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 cursor-pointer"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{copied ? (lang === 'ml' ? 'പകർത്തി' : 'Copied') : lang === 'ml' ? 'പകർത്തുക' : 'Copy'}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
