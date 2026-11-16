import type {HistoryResponse, LatestGoldResponse, LiveSpotMarketData, PreferredSource} from '../types/gold';
import {
  maybeAutoPrune,
  readHistoryCache,
  readLatestCache,
  saveHistoryCache,
  saveLatestCache,
} from './cacheDb';

interface SnapshotBundle {
  latest: LatestGoldResponse;
  monthly: HistoryResponse;
  yearly: HistoryResponse;
}

let cachedBundlePromise: Promise<SnapshotBundle | null> | null = null;

async function loadBundledSnapshot(): Promise<SnapshotBundle | null> {
  if (!cachedBundlePromise) {
    cachedBundlePromise = (async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/kerala-gold-snapshot.json`, {
          cache: 'no-cache',
        });
        if (!res.ok) return null;
        return (await res.json()) as SnapshotBundle;
      } catch {
        return null;
      }
    })();
  }
  return cachedBundlePromise;
}

export async function fetchLatestGold(options?: {
  source?: PreferredSource;
  probe?: boolean;
  preferCacheFirst?: boolean;
}): Promise<{data: LatestGoldResponse; fromCache: boolean}> {
  const source = options?.source || 'auto';
  const probe = options?.probe ?? false;

  if (options?.preferCacheFirst) {
    const cached = await readLatestCache();
    if (cached) {
      return {data: cached.data, fromCache: true};
    }
  }

  try {
    const params = new URLSearchParams({source, probe: String(probe)});
    const res = await fetch(`${import.meta.env.BASE_URL}api/gold/latest?${params.toString()}`, {
      cache: 'no-store',
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = (await res.json()) as LatestGoldResponse;
      await saveLatestCache(data);
      await maybeAutoPrune();
      return {data, fromCache: false};
    }
  } catch {
    // Backend unavailable (offline or static GitHub Pages host)
  }

  // Fallback 1: Local device IndexedDB cache
  const cached = await readLatestCache();
  if (cached) {
    return {data: cached.data, fromCache: true};
  }

  // Fallback 2: Pre-synced snapshot bundled in public/data/
  const snapshot = await loadBundledSnapshot();
  if (snapshot?.latest) {
    await saveLatestCache(snapshot.latest);
    return {data: snapshot.latest, fromCache: true};
  }

  throw new Error('Unable to load gold rates from network or device cache.');
}

export async function fetchGoldHistory(params: {
  mode: 'daily' | 'monthly' | 'yearly';
  year?: number;
  month?: string;
  forceRefresh?: boolean;
}): Promise<{data: HistoryResponse; fromCache: boolean}> {
  const key =
    params.mode === 'yearly'
      ? 'yearly:all'
      : params.mode === 'monthly'
        ? `monthly:${params.year || 2026}`
        : `daily:${params.year || 2026}:${(params.month || 'november').toLowerCase()}`;

  if (!params.forceRefresh) {
    const cached = await readHistoryCache(key);
    if (cached) {
      // Keep active month fresher (refresh if older than 30 min)
      const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
      const currentIstYear = nowIst.getUTCFullYear();
      const currentIstMonthName = nowIst
        .toLocaleString('en-US', {month: 'long', timeZone: 'UTC'})
        .toLowerCase();
      const isCurrentYearMonth =
        params.mode === 'daily' &&
        params.year === currentIstYear &&
        params.month?.toLowerCase() === currentIstMonthName;
      const maxStaleMs = isCurrentYearMonth ? 30 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - cached.cachedAt < maxStaleMs) {
        return {data: cached.data, fromCache: true};
      }
    }
  }

  try {
    const qs = new URLSearchParams({mode: params.mode});
    if (params.year) qs.set('year', String(params.year));
    if (params.month) qs.set('month', params.month.toLowerCase());

    const res = await fetch(`${import.meta.env.BASE_URL}api/gold/history?${qs.toString()}`);
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = (await res.json()) as HistoryResponse;
      await saveHistoryCache(key, data);
      return {data, fromCache: false};
    }
  } catch {
    // Fall back to cache or snapshot
  }

  const staleCache = await readHistoryCache(key);
  if (staleCache) {
    return {data: staleCache.data, fromCache: true};
  }

  const snapshot = await loadBundledSnapshot();
  if (snapshot) {
    if (params.mode === 'yearly' && snapshot.yearly) {
      await saveHistoryCache(key, snapshot.yearly);
      return {data: snapshot.yearly, fromCache: true};
    }
    if (params.mode === 'monthly' && snapshot.monthly) {
      await saveHistoryCache(key, snapshot.monthly);
      return {data: snapshot.monthly, fromCache: true};
    }
    if (params.mode === 'daily' && snapshot.latest) {
      const fallbackDaily: HistoryResponse = {
        mode: 'daily',
        title: `Daily Gold Prices — ${snapshot.latest.monthLabel}`,
        subtitle: `${snapshot.latest.entries.length} cached updates`,
        sourceName: snapshot.latest.sourceName,
        sourceUrl: snapshot.latest.sourceUrl,
        fetchedAt: snapshot.latest.fetchedAt,
        serverLastModified: snapshot.latest.serverLastModified,
        high: snapshot.latest.monthlyHigh
          ? {
              pavan: snapshot.latest.monthlyHigh.pavan,
              gram: snapshot.latest.monthlyHigh.gram,
              label: snapshot.latest.monthlyHigh.dateLabel,
            }
          : null,
        low: snapshot.latest.monthlyLow
          ? {
              pavan: snapshot.latest.monthlyLow.pavan,
              gram: snapshot.latest.monthlyLow.gram,
              label: snapshot.latest.monthlyLow.dateLabel,
            }
          : null,
        dailyEntries: snapshot.latest.entries,
      };
      return {data: fallbackDaily, fromCache: true};
    }
  }

  throw new Error('Selected history archive is not cached offline and could not be reached.');
}

export async function fetchLiveSpotMarket(): Promise<LiveSpotMarketData | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/gold/spot`, {cache: 'no-store'});
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      return (await res.json()) as LiveSpotMarketData;
    }
  } catch {
    // Graceful null fallback when offline or static host
  }
  return null;
}

