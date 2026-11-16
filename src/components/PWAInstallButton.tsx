import {Download, MoreHorizontal, PlusSquare, Share, Smartphone, X} from 'lucide-react';
import React, {useState} from 'react';
import {createPortal} from 'react-dom';
import {usePWAInstall} from '../hooks/usePWAInstall';

const DISMISS_STORAGE_KEY = 'kgp-pwa-install-skipped';

export const PWAInstallButton: React.FC = () => {
  const {isInstallable, isInstalled, isIOS, isIOSSafari, install} = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(DISMISS_STORAGE_KEY) === '1';
  });

  if (isInstalled || dismissed) {
    return null;
  }

  // Only show the in-app install bar on install-capable environments (Chromium beforeinstallprompt or iOS/iPadOS)
  if (!isInstallable && !isIOS) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowGuide(true);
  };

  const handleSkip = () => {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, '1');
    }
  };

  const guideModal =
    showGuide && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm p-3 sm:p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pwa-install-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowGuide(false);
            }}
          >
            <div className="liquid-glass w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-3xl p-4 sm:p-5 text-slate-900 dark:text-slate-100 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-400">
                    <Smartphone className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 id="pwa-install-title" className="font-display text-base sm:text-lg font-bold leading-tight">
                      {isIOS ? 'Install on iPhone / iPad' : 'Install Kerala Gold App'}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Offline rates, native icon & alert support
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  aria-label="Close install instructions"
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer shrink-0"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {isIOS ? (
                <div className="mt-3.5 space-y-2.5 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                  {!isIOSSafari && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                      For best iPhone Home Screen installation and notifications, open this page in{' '}
                      <strong>Safari</strong> (or use your browser&apos;s Share menu below).
                    </div>
                  )}
                  <ol className="space-y-2 rounded-2xl border border-slate-900/8 bg-white/60 p-3 dark:border-white/10 dark:bg-white/5">
                    <li className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-600 text-[11px] font-bold text-white">
                        1
                      </span>
                      <span>
                        Tap the{' '}
                        <strong className="inline-flex items-center gap-1 text-slate-900 dark:text-white">
                          <Share className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          Share
                        </strong>{' '}
                        button in Safari (or tap{' '}
                        <strong className="inline-flex items-center gap-0.5 text-slate-900 dark:text-white">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                          Menu
                        </strong>{' '}
                        → <strong>Share</strong>).
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-600 text-[11px] font-bold text-white">
                        2
                      </span>
                      <span>
                        Scroll down and tap{' '}
                        <strong className="inline-flex items-center gap-1 text-slate-900 dark:text-white">
                          <PlusSquare className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                          Add to Home Screen
                        </strong>
                        .
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-600 text-[11px] font-bold text-white">
                        3
                      </span>
                      <span>
                        Ensure <strong className="text-slate-900 dark:text-white">Open as Web App</strong> is on, then tap{' '}
                        <strong className="text-slate-900 dark:text-white">Add</strong>.
                      </span>
                    </li>
                  </ol>
                </div>
              ) : (
                <div className="mt-3.5 space-y-2 rounded-2xl border border-slate-900/8 bg-white/60 p-3 text-xs sm:text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  <p>
                    Tap <strong>Install App</strong> to add Kerala Gold Price to your Home Screen or desktop dock for offline access.
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="mt-4 w-full min-h-[42px] rounded-xl bg-amber-600 py-2 text-sm font-semibold text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-slate-950 cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div className="mt-3 flex items-center justify-between gap-2.5 rounded-2xl border border-amber-600/25 bg-amber-500/10 px-3 py-2 text-xs dark:border-amber-400/25">
        <div className="flex items-center gap-2 min-w-0">
          <Smartphone className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 dark:text-white truncate">
              Install Kerala Gold App
            </p>
            <p className="text-[10.5px] text-slate-600 dark:text-slate-400 truncate">
              Offline rates & Home Screen icon
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleInstallClick}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-xl bg-amber-600 px-3 py-1 text-[11px] font-semibold text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-slate-950 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Install</span>
          </button>
          <button
            type="button"
            onClick={handleSkip}
            aria-label="Skip app install prompt"
            title="Skip"
            className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-xl border border-slate-900/10 bg-white/60 text-slate-600 hover:bg-white dark:border-white/12 dark:bg-white/10 dark:text-slate-300 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
      {guideModal}
    </>
  );
};
