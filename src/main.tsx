import React from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

declare global {
  interface Window {
    __KGP_MOUNTED__?: boolean;
  }
}

async function clearPwaCachesAndReload() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // Proceed to reload even if cache cleanup fails
  }
  window.location.reload();
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends React.Component<{children: React.ReactNode}, ErrorBoundaryState> {
  state: ErrorBoundaryState = {hasError: false, message: ''};

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected display error.',
    };
  }

  componentDidCatch(error: Error) {
    console.error('[KGP] Render error caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="kgp-canvas-bg fixed inset-0 flex items-center justify-center p-6 text-slate-900 dark:text-slate-100">
          <div className="liquid-glass w-full max-w-sm rounded-3xl p-6 text-center">
            <h1 className="font-display text-lg font-bold">Kerala Gold Price</h1>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
              A cached version caused a startup issue. Tap below to refresh cleanly.
            </p>
            <button
              type="button"
              onClick={() => void clearPwaCachesAndReload()}
              className="mt-4 w-full min-h-[42px] rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 cursor-pointer"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Mark boot successful so the pre-mount watchdog in index.html knows React mounted cleanly
window.__KGP_MOUNTED__ = true;
try {
  window.sessionStorage.removeItem('kgp-pwa-boot-recovered');
} catch {
  // Ignore storage restrictions
}

// Proactively keep installed PWA service worker fresh across re-opens & app resumes
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateSW(true);
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const checkUpdate = () => {
      registration.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkUpdate();
      }
    });
    window.setInterval(checkUpdate, 30 * 60 * 1000);
  },
});

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
