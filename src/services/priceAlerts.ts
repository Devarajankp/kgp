import type {AppLanguage, LatestGoldResponse} from '../types/gold';
import {formatInr, formatSignedInr} from '../utils/format';
import {resolveApiUrl} from './goldClient';

export interface PriceAlertConfig {
  enabled: boolean; // Master notifications ON/OFF switch
  notifyOnPriceChange: boolean; // Instant alert when 1 Pavan / 1 Gram rate increases or decreases
  notifyDailySummary: boolean; // Daily rate summary push on new board date/session
  targetEnabled: boolean; // Custom price threshold alert
  unit: 'pavan' | 'gram';
  direction: 'below' | 'above';
  targetPrice: number;
  lastSeenKey?: string;
  lastSeenPavan?: number;
  lastSeenGram?: number;
  lastDailyKey?: string;
  lastTargetKey?: string;
  updatedAt: string;
}

export interface ActiveAlertEvent {
  id: string;
  reasons: Array<'change' | 'daily' | 'target'>;
  trendDirection: 'up' | 'down' | 'flat';
  trendSymbol: '▲' | '▼' | '●';
  colorEmoji: '🟢' | '🔴' | '🟡';
  pavan22k: number;
  gram22k: number;
  deltaPavan: number;
  deltaGram: number;
  dateLabel: string;
  scheduleLabel: string;
  title: string;
  body: string;
  targetMatched?: boolean;
  triggeredAt: string;
}

export type NotificationCapability =
  | 'granted'
  | 'denied'
  | 'default'
  | 'ios-needs-install'
  | 'in-app-only';

const ALERT_STORAGE_KEY = 'kgp-target-price-alert';
const BASELINE_STORAGE_KEY = 'kgp-last-board-rate';

interface StoredBaseline {
  key: string;
  pavan22k: number;
  gram22k: number;
}

export function createDefaultAlertConfig(pavan22k = 100320): PriceAlertConfig {
  return {
    enabled: false,
    notifyOnPriceChange: true,
    notifyDailySummary: true,
    targetEnabled: false,
    unit: 'pavan',
    direction: 'below',
    targetPrice: Math.max(0, Math.round(pavan22k - 1000)),
    updatedAt: new Date().toISOString(),
  };
}

export function readPriceAlert(): PriceAlertConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ALERT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PriceAlertConfig>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      enabled: Boolean(parsed.enabled),
      notifyOnPriceChange: parsed.notifyOnPriceChange ?? true,
      notifyDailySummary: parsed.notifyDailySummary ?? true,
      targetEnabled: parsed.targetEnabled ?? (typeof parsed.targetPrice === 'number' && parsed.targetPrice > 0),
      unit: parsed.unit === 'gram' ? 'gram' : 'pavan',
      direction: parsed.direction === 'above' ? 'above' : 'below',
      targetPrice: typeof parsed.targetPrice === 'number' ? parsed.targetPrice : 100000,
      lastSeenKey: parsed.lastSeenKey,
      lastSeenPavan: parsed.lastSeenPavan,
      lastSeenGram: parsed.lastSeenGram,
      lastDailyKey: parsed.lastDailyKey,
      lastTargetKey: parsed.lastTargetKey,
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function savePriceAlert(config: PriceAlertConfig): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(config));
}

export function clearPriceAlert(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ALERT_STORAGE_KEY);
}

export function isIOSDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalonePWA(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as {standalone?: boolean}).standalone === true
  );
}

export function getNotificationCapability(): NotificationCapability {
  if (typeof window === 'undefined') return 'in-app-only';
  if ('Notification' in window) {
    return Notification.permission;
  }
  if (isIOSDevice() && !isStandalonePWA()) {
    return 'ios-needs-install';
  }
  return 'in-app-only';
}

export async function requestNotificationPermission(): Promise<NotificationCapability> {
  if (typeof window === 'undefined') return 'in-app-only';
  if (!('Notification' in window)) {
    return getNotificationCapability();
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return getNotificationCapability();
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function syncServerPushSubscription(
  config: PriceAlertConfig,
  lang: AppLanguage = 'en',
): Promise<{registered: boolean; reason?: string}> {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return {registered: false, reason: 'browser-unsupported'};
  }
  if (Notification.permission !== 'granted') {
    return {registered: false, reason: 'permission-not-granted'};
  }

  try {
    const keyRes = await fetch(resolveApiUrl('api/push/public-key'), {cache: 'no-store'});
    const ct = keyRes.headers.get('content-type') || '';
    if (!keyRes.ok || !ct.includes('application/json')) {
      return {registered: false, reason: 'no-push-server'};
    }
    const {publicKey} = (await keyRes.json()) as {publicKey?: string};
    if (!publicKey) return {registered: false, reason: 'no-public-key'};

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const saveRes = await fetch(resolveApiUrl('api/push/subscribe'), {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        subscription: sub.toJSON(),
        prefs: {
          enabled: config.enabled,
          notifyOnPriceChange: config.notifyOnPriceChange,
          notifyDailySummary: config.notifyDailySummary,
          targetEnabled: config.targetEnabled,
          unit: config.unit,
          direction: config.direction,
          targetPrice: config.targetPrice,
          lang,
        },
      }),
    });
    return {registered: saveRes.ok};
  } catch {
    return {registered: false, reason: 'network-error'};
  }
}

export async function unregisterServerPushSubscription(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await fetch(resolveApiUrl('api/push/unsubscribe'), {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({endpoint: sub.endpoint}),
    }).catch(() => {});
  } catch {
    // Ignore cleanup error when offline
  }
}

export async function sendServerTestPush(lang: AppLanguage = 'en'): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return false;
    const res = await fetch(resolveApiUrl('api/push/test'), {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({endpoint: sub.endpoint, lang}),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as {ok?: boolean};
    return Boolean(body.ok);
  } catch {
    return false;
  }
}

export function buildTrendMeta(deltaPavan: number): {
  trendDirection: 'up' | 'down' | 'flat';
  trendSymbol: '▲' | '▼' | '●';
  colorEmoji: '🟢' | '🔴' | '🟡';
} {
  if (deltaPavan > 0) {
    return {trendDirection: 'up', trendSymbol: '▲', colorEmoji: '🟢'};
  }
  if (deltaPavan < 0) {
    return {trendDirection: 'down', trendSymbol: '▼', colorEmoji: '🔴'};
  }
  return {trendDirection: 'flat', trendSymbol: '●', colorEmoji: '🟡'};
}

export function formatAlertNotification(params: {
  data: LatestGoldResponse;
  deltaPavan: number;
  deltaGram: number;
  reasons: Array<'change' | 'daily' | 'target'>;
  config?: PriceAlertConfig | null;
  lang?: AppLanguage;
}): ActiveAlertEvent {
  const {data, deltaPavan, deltaGram, reasons, config, lang = 'en'} = params;
  const {pavan22k, gram22k, dateLabel} = data.current;
  const {trendDirection, trendSymbol, colorEmoji} = buildTrendMeta(deltaPavan);

  const pavanChg = deltaPavan === 0 ? '0' : `${trendSymbol} ${formatSignedInr(deltaPavan)}`;
  const gramChg = deltaGram === 0 ? '0' : `${trendSymbol} ${formatSignedInr(deltaGram)}/g`;

  let headlineLabel: string;
  if (reasons.includes('target') && config) {
    const dirChar = config.direction === 'above' ? '≥' : '≤';
    headlineLabel =
      lang === 'ml'
        ? `ലക്ഷ്യ വിലയിലെത്തി (${dirChar} ${formatInr(config.targetPrice)})`
        : `Price Target Hit (${dirChar} ${formatInr(config.targetPrice)})`;
  } else if (reasons.includes('change') && deltaPavan !== 0) {
    headlineLabel =
      deltaPavan > 0
        ? lang === 'ml'
          ? 'സ്വർണ്ണ വില വർദ്ധിച്ചു'
          : 'Kerala Gold Increased'
        : lang === 'ml'
          ? 'സ്വർണ്ണ വില കുറഞ്ഞു'
          : 'Kerala Gold Dropped';
  } else {
    headlineLabel = lang === 'ml' ? 'ഇന്നത്തെ സ്വർണ്ണ വില' : 'Daily Kerala Gold Update';
  }

  const title = `${colorEmoji} ${trendSymbol} ${headlineLabel} · ${dateLabel}`;
  const body =
    lang === 'ml'
      ? `1 പവൻ: ${formatInr(pavan22k)} (${pavanChg}) | 1 ഗ്രാം: ${formatInr(gram22k)} (${gramChg}) · ${data.scheduleLabel}`
      : `1 Pavan: ${formatInr(pavan22k)} (${pavanChg}) | 1 Gram: ${formatInr(gram22k)} (${gramChg}) · ${data.scheduleLabel}`;

  return {
    id: `${dateLabel}|${data.scheduleLabel}|${pavan22k}|${gram22k}|${reasons.join(',')}`,
    reasons,
    trendDirection,
    trendSymbol,
    colorEmoji,
    pavan22k,
    gram22k,
    deltaPavan,
    deltaGram,
    dateLabel,
    scheduleLabel: data.scheduleLabel,
    title,
    body,
    targetMatched: reasons.includes('target'),
    triggeredAt: new Date().toISOString(),
  };
}

export async function dispatchGoldNotification(
  title: string,
  body: string,
  tag = 'kgp-gold-alert',
): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, {
          body,
          icon: `${import.meta.env.BASE_URL}pwa-192x192.png`,
          badge: `${import.meta.env.BASE_URL}pwa-192x192.png`,
          tag,
        });
        return true;
      }
    }
    new Notification(title, {
      body,
      icon: `${import.meta.env.BASE_URL}pwa-192x192.png`,
      tag,
    });
    return true;
  } catch {
    return false;
  }
}

function readStoredBaseline(): StoredBaseline | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(BASELINE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredBaseline;
  } catch {
    return null;
  }
}

function saveStoredBaseline(next: StoredBaseline): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(BASELINE_STORAGE_KEY, JSON.stringify(next));
}

export async function evaluatePriceAlerts(
  data: LatestGoldResponse,
  lang: AppLanguage = 'en',
): Promise<{
  event: ActiveAlertEvent | null;
  pushSent: boolean;
  targetMatchedNow: boolean;
  currentTargetUnitValue: number;
  config: PriceAlertConfig | null;
}> {
  const config = readPriceAlert();
  const boardKey = `${data.current.dateLabel}|${data.scheduleLabel}`;
  const prevBaseline = readStoredBaseline();

  const observedDeltaPavan =
    prevBaseline && prevBaseline.pavan22k > 0 && prevBaseline.pavan22k !== data.current.pavan22k
      ? data.current.pavan22k - prevBaseline.pavan22k
      : data.current.changePavan;
  const observedDeltaGram =
    prevBaseline && prevBaseline.gram22k > 0 && prevBaseline.gram22k !== data.current.gram22k
      ? data.current.gram22k - prevBaseline.gram22k
      : data.current.changeGram;

  saveStoredBaseline({
    key: boardKey,
    pavan22k: data.current.pavan22k,
    gram22k: data.current.gram22k,
  });

  if (!config || !config.enabled) {
    return {
      event: null,
      pushSent: false,
      targetMatchedNow: false,
      currentTargetUnitValue: 0,
      config,
    };
  }

  const targetVal = config.unit === 'pavan' ? data.current.pavan22k : data.current.gram22k;
  const targetMatchedNow =
    config.targetEnabled &&
    config.targetPrice > 0 &&
    targetVal > 0 &&
    (config.direction === 'above' ? targetVal >= config.targetPrice : targetVal <= config.targetPrice);

  const reasons: Array<'change' | 'daily' | 'target'> = [];

  const priceChangedSinceLastCheck =
    config.notifyOnPriceChange &&
    typeof config.lastSeenPavan === 'number' &&
    config.lastSeenPavan > 0 &&
    (config.lastSeenPavan !== data.current.pavan22k || config.lastSeenGram !== data.current.gram22k);

  if (priceChangedSinceLastCheck) {
    reasons.push('change');
  }

  const dailyKey = `${boardKey}:${data.current.pavan22k}`;
  if (config.notifyDailySummary && config.lastDailyKey !== dailyKey) {
    reasons.push('daily');
  }

  const targetKey = `${data.current.dateLabel}:${config.unit}:${config.direction}:${config.targetPrice}`;
  if (targetMatchedNow && config.lastTargetKey !== targetKey) {
    reasons.push('target');
  }

  const updated: PriceAlertConfig = {
    ...config,
    lastSeenKey: boardKey,
    lastSeenPavan: data.current.pavan22k,
    lastSeenGram: data.current.gram22k,
    lastDailyKey: reasons.includes('daily') ? dailyKey : config.lastDailyKey,
    lastTargetKey: reasons.includes('target') ? targetKey : config.lastTargetKey,
  };
  savePriceAlert(updated);

  if (reasons.length === 0) {
    return {
      event: null,
      pushSent: false,
      targetMatchedNow,
      currentTargetUnitValue: targetVal,
      config: updated,
    };
  }

  const event = formatAlertNotification({
    data,
    deltaPavan: priceChangedSinceLastCheck ? observedDeltaPavan : data.current.changePavan,
    deltaGram: priceChangedSinceLastCheck ? observedDeltaGram : data.current.changeGram,
    reasons,
    config: updated,
    lang,
  });

  const pushSent = await dispatchGoldNotification(event.title, event.body, `kgp-${reasons.join('-')}`);

  return {
    event,
    pushSent,
    targetMatchedNow,
    currentTargetUnitValue: targetVal,
    config: updated,
  };
}
