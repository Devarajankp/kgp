import {Download, Share, X} from 'lucide-react';
import React, {useState} from 'react';
import {usePWAInstall} from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        aria-label="Install app"
        title="Install app"
        className="inline-flex min-h-[36px] min-w-[36px] sm:min-h-[40px] sm:px-3.5 items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-2 py-1.5 text-[11px] sm:text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 active:scale-[0.98] dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400 whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          aria-label="Install on iOS"
          title="Install on iOS"
          className="inline-flex min-h-[36px] min-w-[36px] sm:min-h-[40px] sm:px-3 items-center justify-center gap-1.5 rounded-xl border border-slate-900/10 bg-white/70 px-2 py-1.5 text-[11px] sm:text-xs font-semibold text-slate-800 transition hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/15 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Share className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Install</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="liquid-glass w-full max-w-sm rounded-3xl p-6 text-slate-900 dark:text-slate-100">
              <div className="flex items-start justify-between gap-4">
                <h3 id="ios-install-title" className="font-display text-lg font-semibold">
                  Install on iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close install instructions"
                  className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <ol className="mt-3 space-y-2.5 text-sm text-slate-600 dark:text-slate-300">
                <li>
                  1. Tap the <strong className="text-slate-900 dark:text-white">Share</strong> button in Safari&apos;s toolbar.
                </li>
                <li>
                  2. Scroll down and tap{' '}
                  <strong className="text-slate-900 dark:text-white">Add to Home Screen</strong>.
                </li>
                <li>
                  3. Tap <strong className="text-slate-900 dark:text-white">Add</strong> to launch Kerala Gold Price as a standalone app.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-slate-950 cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
