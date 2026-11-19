import type {HistoryResponse, LatestGoldResponse, LiveSpotMarketData, PreferredSource} from '../types/gold';
import {
  maybeAutoPrune,
  readHistoryCache,
  readLatestCache,
  saveHistoryCache,
  saveLatestCache,
} from './cacheDb';

export type DataSourceMode = 'live-api' | 'static-snapshot' | 'offline-cache';

interface SnapshotBundle {
  latest: LatestGoldResponse;
  monthly: HistoryResponse;
  yearly: HistoryResponse;
}

const API_BASE_STORAGE_KEY = 'kgp-api-base-url';

export function normalizeApiOrigin(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProto);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !parsed.hostname) {
      return '';
    }
    return parsed.origin;
  } catch {
    return '';
  }
}

function isValidLatestGoldResponse(value: unknown): value is LatestGoldResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<LatestGoldResponse>;
  return Boolean(
    v.current &&
      typeof v.current === 'object' &&
      typeof v.current.pavan22k === 'number' &&
      Number.isFinite(v.current.pavan22k) &&
      v.current.pavan22k > 0 &&
      typeof v.current.gram22k === 'number' &&
      Number.isFinite(v.current.gram22k) &&
      v.current.gram22k > 0 &&
      Array.isArray(v.entries),
  );
}

function isValidHistoryResponse(value: unknown): value is HistoryResponse {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<HistoryResponse>;
  return (
    (v.mode === 'daily' || v.mode === 'monthly' || v.mode === 'yearly') &&
    typeof v.title === 'string' &&
    (Array.isArray(v.dailyEntries) || Array.isArray(v.monthlyEntries) || Array.isArray(v.yearlyEntries))
  );
}

function isValidSpotResponse(value: unknown): value is LiveSpotMarketData {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<LiveSpotMarketData>;
  return (
    typeof v.spot24kGramInr === 'number' &&
    Number.isFinite(v.spot24kGramInr) &&
    v.spot24kGramInr > 0 &&
    typeof v.spot22kGramInr === 'number' &&
    Number.isFinite(v.spot22kGramInr) &&
    v.spot22kGramInr > 0
  );
}

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(API_BASE_STORAGE_KEY)?.trim();
      if (saved) {
        const cleanOrigin = normalizeApiOrigin(saved);
        // Auto-heal: remove invalid URLs or redundant same-origin overrides (e.g. pasted Shortcut URLs on Vercel)
        if (!cleanOrigin || cleanOrigin === window.location.origin) {
          window.localStorage.removeItem(API_BASE_STORAGE_KEY);
        } else {
          const canonical = `${cleanOrigin}/`;
          if (saved !== canonical) {
            window.localStorage.setItem(API_BASE_STORAGE_KEY, canonical);
          }
          return canonical;
        }
      }
    } catch {
      // Ignore restricted storage
    }
  }
  const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (envBase) {
    const cleanEnv = normalizeApiOrigin(envBase);
    if (cleanEnv) {
      return `${cleanEnv}/`;
    }
  }
  return import.meta.env.BASE_URL || '/';
}

export function setApiBaseUrl(nextUrl: string): string {
  if (typeof window === 'undefined') return '';
  const cleanOrigin = normalizeApiOrigin(nextUrl);
  try {
    if (!cleanOrigin || cleanOrigin === window.location.origin) {
      window.localStorage.removeItem(API_BASE_STORAGE_KEY);
      return '';
    }
    window.localStorage.setItem(API_BASE_STORAGE_KEY, `${cleanOrigin}/`);
  } catch {
    // Ignore restricted storage
  }
  return cleanOrigin;
}

export function hasCustomApiBaseUrl(): boolean {
  if (typeof window !== 'undefined') {
    try {
      const saved = window.localStorage.getItem(API_BASE_STORAGE_KEY)?.trim();
      if (saved) {
        const cleanOrigin = normalizeApiOrigin(saved);
        if (!cleanOrigin || cleanOrigin === window.location.origin) {
          window.localStorage.removeItem(API_BASE_STORAGE_KEY);
        } else {
          return true;
        }
      }
    } catch {
      // Ignore restricted storage
    }
  }
  const envBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  return Boolean(envBase && normalizeApiOrigin(envBase));
}

export function resolveApiUrl(apiPath: string): string {
  const cleanPath = apiPath.replace(/^\/+/, '');
  return `${getApiBaseUrl()}${cleanPath}`;
}

export function isStaticPagesEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.endsWith('github.io') && !hasCustomApiBaseUrl();
}

function getLatestEntryIso(data: LatestGoldResponse): string {
  const last = data.entries?.[data.entries.length - 1];
  return last?.isoDate || '';
}

function isCandidateFresher(candidate: LatestGoldResponse, existing: LatestGoldResponse): boolean {
  const cIso = getLatestEntryIso(candidate);
  const eIso = getLatestEntryIso(existing);
  if (cIso && eIso && cIso !== eIso) {
    return cIso > eIso;
  }
  const cTime = Date.parse(candidate.fetchedAt || '');
  const eTime = Date.parse(existing.fetchedAt || '');
  if (Number.isFinite(cTime) && Number.isFinite(eTime) && cTime !== eTime) {
    return cTime > eTime;
  }
  return (candidate.entries?.length || 0) > (existing.entries?.length || 0);
}

let cachedBundlePromise: Promise<SnapshotBundle | null> | null = null;

async function loadBundledSnapshot(forceRefresh = false): Promise<SnapshotBundle | null> {
  if (forceRefresh || !cachedBundlePromise) {
    cachedBundlePromise = (async () => {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}data/kerala-gold-snapshot.json?_ts=${Date.now()}`, {
          cache: 'no-store',
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

async function fetchStaticLatestJson(): Promise<LatestGoldResponse | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/latest.json?_ts=${Date.now()}`, {
      cache: 'no-store',
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const json: unknown = await res.json();
      if (isValidLatestGoldResponse(json)) {
        return json;
      }
    }
  } catch {
    // Fallback to snapshot below
  }
  return null;
}

function getCurrentIstYearMonth(): {year: number; monthName: string} {
  const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return {
    year: nowIst.getUTCFullYear(),
    monthName: nowIst.toLocaleString('en-US', {month: 'long', timeZone: 'UTC'}).toLowerCase(),
  };
}

export async function fetchLatestGold(options?: {
  source?: PreferredSource;
  probe?: boolean;
  preferCacheFirst?: boolean;
  forceRefresh?: boolean;
}): Promise<{data: LatestGoldResponse; fromCache: boolean; dataMode: DataSourceMode}> {
  const source = options?.source || 'auto';
  const probe = options?.probe ?? false;
  const forceRefresh = options?.forceRefresh ?? false;

  if (options?.preferCacheFirst && !forceRefresh) {
    const cached = await readLatestCache();
    if (cached && isValidLatestGoldResponse(cached.data)) {
      return {data: cached.data, fromCache: true, dataMode: 'offline-cache'};
    }
  }

  // 1. Try Live Node API Server (current origin OR configured VITE_API_BASE_URL / custom URL)
  if (!isStaticPagesEnvironment()) {
    try {
      const params = new URLSearchParams({
        source,
        probe: String(probe),
      });
      if (forceRefresh) {
        params.set('refresh', 'true');
        params.set('_ts', String(Date.now()));
      }
      const res = await fetch(resolveApiUrl(`api/gold/latest?${params.toString()}`), {
        cache: 'no-store',
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data: unknown = await res.json();
        if (isValidLatestGoldResponse(data)) {
          await saveLatestCache(data);
          await maybeAutoPrune();
          return {data, fromCache: false, dataMode: 'live-api'};
        }
      }
    } catch {
      // Live backend unavailable (offline or static host)
    }
  }

  // 2. On Static GitHub Pages or Offline: check deployed static JSON & IndexedDB cache, keeping whichever is NEWER!
  const rawCached = await readLatestCache();
  const cached = rawCached && isValidLatestGoldResponse(rawCached.data) ? rawCached : null;
  const bundledLatest = (await loadBundledSnapshot(forceRefresh))?.latest;
  const staticLatest =
    (await fetchStaticLatestJson()) || (isValidLatestGoldResponse(bundledLatest) ? bundledLatest : null);

  if (staticLatest && (!cached || isCandidateFresher(staticLatest, cached.data))) {
    await saveLatestCache(staticLatest);
    return {data: staticLatest, fromCache: false, dataMode: 'static-snapshot'};
  }

  if (cached) {
    return {data: cached.data, fromCache: true, dataMode: 'offline-cache'};
  }

  if (staticLatest) {
    await saveLatestCache(staticLatest);
    return {data: staticLatest, fromCache: true, dataMode: 'static-snapshot'};
  }

  throw new Error('Unable to load gold rates from network or device cache.');
}

async function fetchStaticHistoryJson(params: {
  mode: 'daily' | 'monthly' | 'yearly';
  year: number;
  month: string;
  forceRefresh?: boolean;
  isActivePeriod?: boolean;
}): Promise<HistoryResponse | null> {
  const relPath =
    params.mode === 'yearly'
      ? 'api/history/yearly.json'
      : params.mode === 'monthly'
        ? `api/history/monthly-${params.year}.json`
        : `api/history/${params.year}-${params.month}.json`;

  const bust = params.forceRefresh || params.isActivePeriod ? `?_ts=${Date.now()}` : '';
  const url = `${import.meta.env.BASE_URL}${relPath}${bust}`;

  try {
    const res = await fetch(url, {
      cache: params.forceRefresh || params.isActivePeriod ? 'no-store' : 'default',
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const json: unknown = await res.json();
      if (isValidHistoryResponse(json)) {
        return json;
      }
    }
  } catch {
    // Offline or archive not present in static bundle
  }
  return null;
}

export async function fetchGoldHistory(params: {
  mode: 'daily' | 'monthly' | 'yearly';
  year?: number;
  month?: string;
  forceRefresh?: boolean;
}): Promise<{data: HistoryResponse; fromCache: boolean}> {
  const ist = getCurrentIstYearMonth();
  const targetYear = params.year || ist.year;
  const targetMonth = (params.month || ist.monthName).toLowerCase();

  const isActivePeriod =
    params.mode === 'yearly' ||
    (params.mode === 'monthly' && targetYear === ist.year) ||
    (params.mode === 'daily' && targetYear === ist.year && targetMonth === ist.monthName);

  const key =
    params.mode === 'yearly'
      ? 'yearly:all'
      : params.mode === 'monthly'
        ? `monthly:${targetYear}`
        : `daily:${targetYear}:${targetMonth}`;

  if (!params.forceRefresh) {
    const cached = await readHistoryCache(key);
    if (cached && isValidHistoryResponse(cached.data)) {
      const maxStaleMs = isActivePeriod ? 10 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - cached.cachedAt < maxStaleMs) {
        return {data: cached.data, fromCache: true};
      }
    }
  }

  // 1. Try Live Node API Server when not running strictly as static GitHub Pages
  if (!isStaticPagesEnvironment()) {
    try {
      const qs = new URLSearchParams({mode: params.mode});
      if (targetYear) qs.set('year', String(targetYear));
      if (targetMonth) qs.set('month', targetMonth);
      if (params.forceRefresh) qs.set('_ts', String(Date.now()));

      const res = await fetch(resolveApiUrl(`api/gold/history?${qs.toString()}`), {
        cache: params.forceRefresh || isActivePeriod ? 'no-store' : 'default',
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data: unknown = await res.json();
        if (isValidHistoryResponse(data)) {
          await saveHistoryCache(key, data);
          return {data, fromCache: false};
        }
      }
    } catch {
      // Fall back to static history JSON / cache
    }
  }

  // 2. Try deployed static History archive JSON (`public/api/history/*.json`)
  const staticHistory = await fetchStaticHistoryJson({
    mode: params.mode,
    year: targetYear,
    month: targetMonth,
    forceRefresh: params.forceRefresh,
    isActivePeriod,
  });
  if (staticHistory) {
    await saveHistoryCache(key, staticHistory);
    return {data: staticHistory, fromCache: false};
  }

  // 3. Fallback to bundled snapshot ONLY if the year/month matches exactly!
  const snapshot = await loadBundledSnapshot(params.forceRefresh);
  const rawStaleCache = await readHistoryCache(key);
  const staleCache = rawStaleCache && isValidHistoryResponse(rawStaleCache.data) ? rawStaleCache : null;

  if (snapshot) {
    if (params.mode === 'yearly' && snapshot.yearly) {
      await saveHistoryCache(key, snapshot.yearly);
      return {data: snapshot.yearly, fromCache: true};
    }
    if (params.mode === 'monthly' && snapshot.monthly && snapshot.latest?.year === targetYear) {
      await saveHistoryCache(key, snapshot.monthly);
      return {data: snapshot.monthly, fromCache: true};
    }
    if (
      params.mode === 'daily' &&
      snapshot.latest &&
      snapshot.latest.year === targetYear &&
      snapshot.latest.monthKey.toLowerCase() === targetMonth
    ) {
      const fallbackDaily: HistoryResponse = {
        mode: 'daily',
        title: `Daily Gold Prices — ${snapshot.latest.monthLabel}`,
        subtitle: `${snapshot.latest.entries.length} synced updates`,
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
      if (!staleCache || (fallbackDaily.dailyEntries?.length || 0) >= (staleCache.data.dailyEntries?.length || 0)) {
        return {data: fallbackDaily, fromCache: true};
      }
    }
  }

  if (staleCache) {
    return {data: staleCache.data, fromCache: true};
  }

  const prettyMonth = targetMonth.charAt(0).toUpperCase() + targetMonth.slice(1);
  if (params.mode === 'daily') {
    throw new Error(`Daily archive for ${prettyMonth} ${targetYear} is not available.`);
  }
  if (params.mode === 'monthly') {
    throw new Error(`Monthly archive for ${targetYear} is not available.`);
  }
  throw new Error('Selected history archive is not cached offline and could not be reached.');
}

export async function fetchLiveSpotMarket(forceRefresh = false): Promise<LiveSpotMarketData | null> {
  if (!isStaticPagesEnvironment()) {
    try {
      const qs = forceRefresh ? `?_ts=${Date.now()}` : '';
      const res = await fetch(resolveApiUrl(`api/gold/spot${qs}`), {cache: 'no-store'});
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const json: unknown = await res.json();
        if (isValidSpotResponse(json)) {
          return json;
        }
      }
    } catch {
      // Live backend unavailable; try synced static snapshot below
    }
  }

  try {
    const staticRes = await fetch(`${import.meta.env.BASE_URL}api/spot.json?_ts=${Date.now()}`, {
      cache: 'no-store',
    });
    const contentType = staticRes.headers.get('content-type') || '';
    if (staticRes.ok && contentType.includes('application/json')) {
      const json: unknown = await staticRes.json();
      if (isValidSpotResponse(json)) {
        return json;
      }
    }
  } catch {
    // Offline fallback
  }

  return null;
}

export interface ApiCapabilities {
  realtimeSync: boolean;
  sseSupported: boolean;
  pushSupported: boolean;
  runtime: 'vercel-serverless' | 'node-server' | 'static-pages';
}

export async function fetchApiCapabilities(): Promise<ApiCapabilities> {
  if (isStaticPagesEnvironment()) {
    return {
      realtimeSync: false,
      sseSupported: false,
      pushSupported: false,
      runtime: 'static-pages',
    };
  }
  try {
    const res = await fetch(resolveApiUrl('api/health'), {cache: 'no-store'});
    const ct = res.headers.get('content-type') || '';
    if (res.ok && ct.includes('application/json')) {
      const json = (await res.json()) as Partial<ApiCapabilities>;
      return {
        realtimeSync: json.realtimeSync ?? true,
        sseSupported: Boolean(json.sseSupported),
        pushSupported: Boolean(json.pushSupported),
        runtime:
          json.runtime === 'vercel-serverless' || json.runtime === 'node-server'
            ? json.runtime
            : 'node-server',
      };
    }
  } catch {
    // Offline or static fallback
  }
  return {
    realtimeSync: false,
    sseSupported: false,
    pushSupported: false,
    runtime: 'static-pages',
  };
}

export function subscribeGoldStream(
  onUpdate: (data: LatestGoldResponse) => void,
  onConnectionChange?: (connected: boolean) => void,
): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    onConnectionChange?.(false);
    return () => {};
  }
  if (isStaticPagesEnvironment()) {
    onConnectionChange?.(false);
    return () => {};
  }

  let closed = false;
  let es: EventSource | null = null;

  void (async () => {
    const caps = await fetchApiCapabilities();
    if (closed || !caps.sseSupported) {
      onConnectionChange?.(false);
      return;
    }

    try {
      es = new EventSource(resolveApiUrl('api/gold/stream'));
      es.addEventListener('connected', () => {
        if (!closed) onConnectionChange?.(true);
      });
      es.addEventListener('gold-update', (event) => {
        if (closed) return;
        onConnectionChange?.(true);
        try {
          const parsed: unknown = JSON.parse((event as MessageEvent).data);
          if (isValidLatestGoldResponse(parsed)) {
            void saveLatestCache(parsed);
            onUpdate(parsed);
          }
        } catch {
          // Ignore malformed SSE frame
        }
      });
      es.onerror = () => {
        if (!closed) onConnectionChange?.(false);
      };
    } catch {
      onConnectionChange?.(false);
    }
  })();

  return () => {
    closed = true;
    es?.close();
    onConnectionChange?.(false);
  };
}
