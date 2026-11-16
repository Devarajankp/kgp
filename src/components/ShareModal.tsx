import {Check, Copy, Download, Moon, Share2, Sun, X} from 'lucide-react';
import React, {useEffect, useMemo, useState} from 'react';
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

  // Sync default card color with the active app Day/Night theme whenever opened
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

  if (!open || !data) return null;

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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="liquid-glass w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl p-4 sm:p-5 text-slate-900 dark:text-slate-100">
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

        {/* Theme-Matched Brushed Gold Share Card Preview (Preserves Gold Shimmer & Fraunces Shine + Recent Trend) */}
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

          <div className="mt-3 grid grid-cols-2 gap-2.5">
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
                className={`mt-1 font-gold-numeral text-xl sm:text-2xl font-bold tracking-tight ${
                  isDarkCard
                    ? 'bg-gradient-to-r from-[#f5d07a] via-[#fff2b8] to-[#efb849] bg-clip-text text-transparent'
                    : 'bg-gradient-to-r from-[#7c4706] via-[#c48112] to-[#7c4706] bg-clip-text text-transparent'
                }`}
              >
                {formatInr(data.current.pavan22k)}
              </div>
              <div
                className={`mt-1 text-[10.5px] sm:text-[11px] font-semibold tabular-nums ${
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
                className={`mt-1 font-gold-numeral text-xl sm:text-2xl font-bold tracking-tight ${
                  isDarkCard ? 'text-white' : 'text-slate-900'
                }`}
              >
                {formatInr(data.current.gram22k)}
              </div>
              <div
                className={`mt-1 text-[10px] tabular-nums ${
                  isDarkCard ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                24K: {formatInr(data.current.gram24kEstimate)} · 18K: {formatInr(data.current.gram18kEstimate)}
              </div>
            </div>
          </div>

          {/* Recent 5-Day Price History Strip */}
          {recentEntries.length > 0 && (
            <div
              className={`mt-2.5 rounded-xl border p-2.5 ${
                isDarkCard
                  ? 'border-white/10 bg-white/[0.035]'
                  : 'border-slate-900/10 bg-white/55'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-[10px] font-semibold mb-1.5">
                <span className={isDarkCard ? 'text-amber-300' : 'text-amber-800'}>
                  {lang === 'ml' ? 'സമീപകാല മാറ്റങ്ങൾ (1 പവൻ)' : 'Recent Trend (1 Pavan)'}
                </span>
                {data.monthlyHigh && data.monthlyLow && (
                  <span className={isDarkCard ? 'text-slate-400' : 'text-slate-500'}>
                    H: {formatInr(data.monthlyHigh.pavan)} · L: {formatInr(data.monthlyLow.pavan)}
                  </span>
                )}
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
    </div>
  );
};
