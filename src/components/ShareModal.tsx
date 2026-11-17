import {
  Check,
  Copy,
  Download,
  ImagePlus,
  Moon,
  RotateCcw,
  Share2,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import type {AppLanguage, LatestGoldResponse} from '../types/gold';
import {
  buildShareText,
  clearCachedSharePhoto,
  processCustomPhotoFile,
  readCachedSharePhoto,
  renderShareCardPng,
  saveCachedSharePhoto,
  type ShareAspectRatio,
  type ShareCardOptions,
  type ShareCustomPhoto,
} from '../utils/shareCard';

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  data: LatestGoldResponse | null;
  lang: AppLanguage;
  theme: 'light' | 'dark';
}

const ASPECT_OPTIONS: Array<{id: ShareAspectRatio; label: string}> = [
  {id: 'auto', label: 'Auto'},
  {id: '9:16', label: '9:16 Status'},
  {id: '4:5', label: '4:5 IG'},
  {id: '1:1', label: '1:1'},
];

export const ShareModal: React.FC<ShareModalProps> = ({open, onClose, data, lang, theme}) => {
  const [cardTheme, setCardTheme] = useState<'light' | 'dark'>(theme);
  const [includeChart, setIncludeChart] = useState(true);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [aspectRatio, setAspectRatio] = useState<ShareAspectRatio>('auto');
  const [customPhoto, setCustomPhoto] = useState<ShareCustomPhoto | null>(() => readCachedSharePhoto());

  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    origOffsetX: number;
    origOffsetY: number;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setCardTheme(theme);
      setCustomPhoto(readCachedSharePhoto());
      setStatusMsg(null);
      setCopied(false);
    }
  }, [open, theme]);

  useEffect(() => {
    if (!open || !data) return;
    let cancelled = false;
    setRendering(true);

    const options: ShareCardOptions = {
      includeChart,
      includeHistory,
      aspectRatio,
      customPhoto,
    };

    const timer = window.setTimeout(() => {
      void renderShareCardPng(data, lang, cardTheme, options).then((blob) => {
        if (cancelled) return;
        setRendering(false);
        setPreviewBlob(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return blob ? URL.createObjectURL(blob) : null;
        });
      });
    }, 35);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, data, lang, cardTheme, includeChart, includeHistory, aspectRatio, customPhoto]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!open || !data || typeof document === 'undefined') return null;

  const isDarkCard = cardTheme === 'dark';
  const shareText = buildShareText(data, lang);
  const supportsWebShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const hasEntries = (data.entries?.length ?? 0) > 0;
  const hasChartData = (data.entries?.length ?? 0) >= 2;

  const currentOptions: ShareCardOptions = {
    includeChart,
    includeHistory,
    aspectRatio,
    customPhoto,
  };

  const updatePhotoState = (updater: (prev: ShareCustomPhoto) => ShareCustomPhoto) => {
    setCustomPhoto((prev) => {
      if (!prev) return prev;
      const next = updater(prev);
      saveCachedSharePhoto(next);
      return next;
    });
  };

  const handleSelectPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setStatusMsg(null);
    try {
      const dataUrl = await processCustomPhotoFile(file);
      const nextPhoto: ShareCustomPhoto = {
        dataUrl,
        zoom: 1,
        offsetX: 0,
        offsetY: 0,
        scrimOpacity: 0.35,
      };
      setCustomPhoto(nextPhoto);
      const saved = saveCachedSharePhoto(nextPhoto);
      if (aspectRatio === 'auto') {
        setAspectRatio('9:16');
      }
      setStatusMsg(
        saved
          ? lang === 'ml'
            ? 'ചിത്രം ചേർത്തു & ക്യാഷ് ചെയ്തു! ക്രമീകരിക്കാൻ ഡ്രാഗ് ചെയ്യുക.'
            : 'Photo merged & cached! Drag preview to reposition.'
          : lang === 'ml'
            ? 'ചിത്രം ചേർത്തു (സ്റ്റോറേജ് പരിധി കാരണം ക്യാഷ് ചെയ്യാനായില്ല).'
            : 'Photo merged! (Too large to persist in cache.)',
      );
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Unable to load selected photo.');
    }
  };

  const handleClearPhoto = () => {
    clearCachedSharePhoto();
    setCustomPhoto(null);
    setStatusMsg(lang === 'ml' ? 'ക്യാഷ് ചെയ്ത ചിത്രം നീക്കം ചെയ്തു.' : 'Cleared cached photo.');
  };

  const handleNativeShare = async () => {
    setSharing(true);
    setStatusMsg(null);
    try {
      const blob = previewBlob || (await renderShareCardPng(data, lang, cardTheme, currentOptions));
      if (blob && typeof File !== 'undefined') {
        const fileName = `kerala-gold-${data.current.dateLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
        const file = new File([blob], fileName, {type: 'image/png'});
        if (navigator.canShare && navigator.canShare({files: [file]})) {
          // Strictly image-only share (no caption text attached)
          await navigator.share({files: [file]});
          setStatusMsg(lang === 'ml' ? 'സ്ക്രീൻഷോട്ട് ചിത്രം പങ്കിട്ടു!' : 'Shared screenshot image!');
          return;
        }
      }

      setStatusMsg(
        lang === 'ml'
          ? 'ഈ ബ്രൗസറിൽ നേരിട്ടുള്ള ഇമേജ് ഷെയർ പിന്തുണയില്ല — Save PNG ഉപയോഗിക്കുക.'
          : 'Image file share unsupported on this browser — use Save PNG below.',
      );
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setStatusMsg(null);
      } else {
        setStatusMsg(
          lang === 'ml'
            ? 'നേരിട്ട് പങ്കിടാനായില്ല — Save PNG ഉപയോഗിക്കുക.'
            : 'Native share unavailable here — use Save PNG below.',
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
    const blob = previewBlob || (await renderShareCardPng(data, lang, cardTheme, currentOptions));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kerala-gold-${data.current.dateLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatusMsg(lang === 'ml' ? 'ഷെയർ കാർഡ് സേവ് ചെയ്തു!' : 'Saved screenshot PNG!');
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!customPhoto) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origOffsetX: customPhoto.offsetX,
      origOffsetY: customPhoto.offsetY,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragStateRef.current;
    if (!ds?.active || !customPhoto) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - ds.startX) / Math.max(80, rect.width * 0.45);
    const dy = (e.clientY - ds.startY) / Math.max(80, rect.height * 0.45);
    const nextX = Math.max(-1, Math.min(1, ds.origOffsetX + dx));
    const nextY = Math.max(-1, Math.min(1, ds.origOffsetY + dy));
    setCustomPhoto((prev) => (prev ? {...prev, offsetX: nextX, offsetY: nextY} : prev));
  };

  const handlePointerUp = () => {
    if (dragStateRef.current?.active && customPhoto) {
      dragStateRef.current = null;
      saveCachedSharePhoto(customPhoto);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-2.5 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="liquid-glass w-full max-w-lg max-h-[calc(100dvh-1.25rem)] overflow-y-auto rounded-3xl p-4 sm:p-5 text-slate-900 dark:text-slate-100 shadow-2xl">
        <div className="flex items-center justify-between gap-2">
          <h2 id="share-modal-title" className="font-display text-base sm:text-lg font-bold">
            {lang === 'ml' ? 'സ്ക്രീൻഷോട്ട് പങ്കിടുക' : 'Share Rate Screenshot'}
          </h2>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCardTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
              aria-label="Toggle share card theme"
              title={isDarkCard ? 'Switch card to Day theme' : 'Switch card to Night theme'}
              className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl border border-slate-900/10 bg-white/70 text-slate-700 hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-200 cursor-pointer"
            >
              {isDarkCard ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close share dialog"
              className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Section Toggles + Aspect Ratio Bar */}
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={!hasChartData}
              onClick={() => setIncludeChart((v) => !v)}
              className={`min-h-[30px] rounded-lg px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 ${
                includeChart && hasChartData
                  ? 'bg-amber-600 text-white dark:bg-amber-500 dark:text-slate-950'
                  : 'border border-slate-900/12 bg-white/60 text-slate-700 dark:border-white/15 dark:bg-white/8 dark:text-slate-300'
              }`}
            >
              {includeChart ? '✓ ' : '+ '}
              {lang === 'ml' ? 'ചാർട്ട്' : 'Chart'}
            </button>
            <button
              type="button"
              disabled={!hasEntries}
              onClick={() => setIncludeHistory((v) => !v)}
              className={`min-h-[30px] rounded-lg px-2.5 py-1 text-[11px] font-semibold transition cursor-pointer disabled:opacity-40 ${
                includeHistory && hasEntries
                  ? 'bg-amber-600 text-white dark:bg-amber-500 dark:text-slate-950'
                  : 'border border-slate-900/12 bg-white/60 text-slate-700 dark:border-white/15 dark:bg-white/8 dark:text-slate-300'
              }`}
            >
              {includeHistory ? '✓ ' : '+ '}
              {lang === 'ml' ? 'ചരിത്രം' : 'History'}
            </button>
          </div>

          <div className="liquid-segmented inline-flex rounded-xl p-0.5">
            {ASPECT_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setAspectRatio(opt.id)}
                className={`min-h-[28px] rounded-lg px-2 py-0.5 text-[10.5px] font-semibold transition cursor-pointer whitespace-nowrap ${
                  aspectRatio === opt.id
                    ? 'liquid-pill-active text-slate-900 dark:text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Live Exact Rendered Screenshot Preview (Drag to Reposition Photo when active) */}
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`relative mt-2.5 flex items-center justify-center rounded-2xl border border-slate-900/10 bg-black/5 p-2 dark:border-white/10 dark:bg-black/30 select-none ${
            customPhoto ? 'cursor-grab active:cursor-grabbing touch-none' : ''
          }`}
        >
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Gold price share card preview"
              draggable={false}
              className="max-h-[42vh] w-auto max-w-full rounded-xl object-contain shadow-lg"
            />
          ) : (
            <div className="flex h-48 w-full items-center justify-center text-xs text-slate-500">
              {lang === 'ml' ? 'തയ്യാറാക്കുന്നു...' : 'Generating screenshot...'}
            </div>
          )}
          {rendering && previewUrl && (
            <span className="absolute top-3 right-3 rounded-lg bg-black/65 px-2 py-0.5 text-[10px] font-semibold text-white">
              Updating...
            </span>
          )}
          {customPhoto && (
            <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm whitespace-nowrap">
              {lang === 'ml' ? 'ചിത്രം നീക്കാൻ ഡ്രാഗ് ചെയ്യുക' : 'Drag image to pan crop'}
            </span>
          )}
        </div>

        {/* Custom Photo Upload / Crop / Cache Controls */}
        <div className="mt-2.5 rounded-2xl border border-slate-900/8 bg-white/55 p-2.5 dark:border-white/10 dark:bg-white/5 space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleSelectPhoto}
            className="hidden"
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-[32px] items-center gap-1.5 rounded-xl border border-slate-900/12 bg-white/85 px-2.5 py-1 text-[11px] font-semibold text-slate-800 hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 cursor-pointer"
            >
              <ImagePlus className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              <span>
                {customPhoto
                  ? lang === 'ml'
                    ? 'മറ്റൊരു ഫോട്ടോ തിരഞ്ഞെടുക്കുക'
                    : 'Change Background Photo'
                  : lang === 'ml'
                    ? 'ഗാലറിയിൽ നിന്ന് ഫോട്ടോ ചേർക്കുക'
                    : 'Add Custom Photo (Optional)'}
              </span>
            </button>

            {customPhoto && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    updatePhotoState((p) => ({...p, zoom: 1, offsetX: 0, offsetY: 0}))
                  }
                  title="Reset photo crop"
                  className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-slate-900/10 bg-white/75 px-2 py-1 text-[10.5px] font-semibold text-slate-700 hover:bg-white dark:border-white/12 dark:bg-white/10 dark:text-slate-200 cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  <span>Center</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearPhoto}
                  title="Clear cached photo"
                  className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-[10.5px] font-semibold text-rose-700 hover:bg-rose-500/20 dark:text-rose-300 cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" aria-hidden="true" />
                  <span>{lang === 'ml' ? 'നീക്കുക' : 'Clear Photo'}</span>
                </button>
              </div>
            )}
          </div>

          {customPhoto && (
            <div className="grid grid-cols-2 gap-3 pt-1 text-[10.5px]">
              <label className="space-y-1">
                <div className="flex items-center justify-between font-semibold text-slate-700 dark:text-slate-300">
                  <span>{lang === 'ml' ? 'സൂം' : 'Crop Zoom'}</span>
                  <span className="tabular-nums">{customPhoto.zoom.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="2.5"
                  step="0.05"
                  value={customPhoto.zoom}
                  onChange={(e) =>
                    updatePhotoState((p) => ({...p, zoom: Number(e.target.value)}))
                  }
                  className="w-full accent-amber-600 cursor-pointer"
                />
              </label>

              <label className="space-y-1">
                <div className="flex items-center justify-between font-semibold text-slate-700 dark:text-slate-300">
                  <span>{lang === 'ml' ? 'പശ്ചാത്തല മങ്ങൽ' : 'Photo Dim'}</span>
                  <span className="tabular-nums">{Math.round(customPhoto.scrimOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.85"
                  step="0.05"
                  value={customPhoto.scrimOpacity}
                  onChange={(e) =>
                    updatePhotoState((p) => ({...p, scrimOpacity: Number(e.target.value)}))
                  }
                  className="w-full accent-amber-600 cursor-pointer"
                />
              </label>
            </div>
          )}
        </div>

        {statusMsg && (
          <p className="mt-2 text-center text-xs font-medium text-amber-700 dark:text-amber-400">
            {statusMsg}
          </p>
        )}

        {/* Action Buttons */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {supportsWebShare && (
            <button
              type="button"
              onClick={handleNativeShare}
              disabled={sharing || rendering}
              className="flex-1 min-h-[42px] inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-amber-700 disabled:opacity-60 dark:bg-amber-500 dark:text-slate-950 cursor-pointer"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              <span>
                {sharing
                  ? lang === 'ml'
                    ? 'തയ്യാറാക്കുന്നു...'
                    : 'Preparing...'
                  : lang === 'ml'
                    ? 'ചിത്രം ഷെയർ ചെയ്യുക'
                    : 'Share Image'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={handleDownloadPng}
            disabled={rendering}
            className="min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-900/12 bg-white/80 px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 cursor-pointer"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>{lang === 'ml' ? 'സേവ് PNG' : 'Save PNG'}</span>
          </button>

          <button
            type="button"
            onClick={handleCopyText}
            className="min-h-[42px] inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-900/12 bg-white/80 px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 cursor-pointer"
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            ) : (
              <Copy className="h-4 w-4" aria-hidden="true" />
            )}
            <span>{copied ? (lang === 'ml' ? 'പകർത്തി' : 'Copied') : lang === 'ml' ? 'ടെക്സ്റ്റ്' : 'Copy Text'}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
