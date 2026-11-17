import {RefreshCw} from 'lucide-react';
import React, {useEffect, useState} from 'react';
import type {AppLanguage} from '../types/gold';

interface SyncTimerPillProps {
  lang: AppLanguage;
  lastSyncedAt: number | null;
  intervalMs: number;
  refreshing: boolean;
  streamConnected: boolean;
  onSyncNow: () => void;
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  if (totalSec < 5) return 'now';
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  return `${mins}m`;
}

export const SyncTimerPill: React.FC<SyncTimerPillProps> = ({
  lang,
  lastSyncedAt,
  intervalMs,
  refreshing,
  streamConnected,
  onSyncNow,
}) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
  }, [lastSyncedAt]);

  useEffect(() => {
    const tick = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        setNow(Date.now());
      }
    };
    const id = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  const baseTs = lastSyncedAt ?? now;
  const elapsedMs = Math.max(0, now - baseTs);
  const remainingMs = Math.max(0, intervalMs - (elapsedMs % intervalMs));
  const nextLabel = formatCountdown(remainingMs);
  const elapsedLabel = formatElapsed(elapsedMs);

  return (
    <button
      type="button"
      onClick={onSyncNow}
      disabled={refreshing}
      title={
        lang === 'ml'
          ? `അവസാന സിങ്ക്: ${elapsedLabel} · അടുത്ത സിങ്ക്: ${nextLabel} (ഇപ്പോൾ സിങ്ക് ചെയ്യാൻ ക്ലിക്ക് ചെയ്യുക)`
          : `Last synced ${elapsedLabel} ago · Next auto-sync in ${nextLabel}. Tap to sync now.`
      }
      className={`inline-flex min-h-[32px] sm:min-h-[34px] items-center gap-1.5 rounded-xl border px-2 sm:px-2.5 py-1 text-[11px] font-semibold tabular-nums transition cursor-pointer whitespace-nowrap disabled:opacity-70 ${
        streamConnected
          ? 'border-emerald-600/25 bg-emerald-500/12 text-emerald-800 hover:bg-emerald-500/20 dark:border-emerald-400/25 dark:bg-emerald-400/12 dark:text-emerald-300'
          : 'border-amber-600/30 bg-amber-500/12 text-amber-800 hover:bg-amber-500/20 dark:border-amber-400/30 dark:bg-amber-400/12 dark:text-amber-300'
      }`}
    >
      {refreshing ? (
        <>
          <RefreshCw className="h-3 w-3 animate-spin shrink-0" aria-hidden="true" />
          <span>{lang === 'ml' ? 'സിങ്ക്...' : 'Syncing'}</span>
        </>
      ) : (
        <>
          <span
            className={`h-1.5 w-1.5 rounded-full shrink-0 ${
              streamConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-pulse'
            }`}
            aria-hidden="true"
          />
          <span className="hidden sm:inline">
            {streamConnected
              ? lang === 'ml'
                ? `ലൈവ് · ${elapsedLabel}`
                : `Live · ${elapsedLabel}`
              : lang === 'ml'
                ? `സിങ്ക് ${elapsedLabel} · അടുത്തത് ${nextLabel}`
                : `${elapsedLabel} · Next ${nextLabel}`}
          </span>
          <span className="sm:hidden">
            {streamConnected ? `Live · ${nextLabel}` : `↻ ${nextLabel}`}
          </span>
        </>
      )}
    </button>
  );
};
