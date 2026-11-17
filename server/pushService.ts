import fs from 'fs';
import {createRequire} from 'module';
import path from 'path';
import type {PushSubscription} from 'web-push';
import type {AppLanguage, LatestGoldResponse} from '../src/types/gold.ts';
import {formatInrServer} from './apiUtils.ts';

const require = createRequire(import.meta.url);
const webpush = require('web-push') as typeof import('web-push');

export interface PushAlertPreferences {
  enabled: boolean;
  notifyOnPriceChange: boolean;
  notifyDailySummary: boolean;
  targetEnabled: boolean;
  unit: 'pavan' | 'gram';
  direction: 'below' | 'above';
  targetPrice: number;
  lang: AppLanguage;
}

interface StoredPushSubscriber {
  endpoint: string;
  subscription: PushSubscription;
  prefs: PushAlertPreferences;
  lastAlertKey?: string;
  lastDailyKey?: string;
  lastTargetKey?: string;
  updatedAt: string;
}

interface VapidKeyPair {
  publicKey: string;
  privateKey: string;
}

const VAPID_FILE = path.resolve(process.cwd(), 'server/.vapid-keys.json');
const SUBS_FILE = path.resolve(process.cwd(), 'server/.push-subscriptions.json');

let initialized = false;
let vapidKeys: VapidKeyPair | null = null;
let subscribersCache: StoredPushSubscriber[] | null = null;

function ensureVapidConfigured(): VapidKeyPair {
  if (initialized && vapidKeys) return vapidKeys;

  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:alerts@keralagoldprice.app';

  if (envPub && envPriv) {
    vapidKeys = {publicKey: envPub, privateKey: envPriv};
  } else if (fs.existsSync(VAPID_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf-8')) as VapidKeyPair;
      if (parsed?.publicKey && parsed?.privateKey) {
        vapidKeys = parsed;
      }
    } catch {
      // Regenerate cleanly if corrupted
    }
  }

  if (!vapidKeys) {
    vapidKeys = webpush.generateVAPIDKeys();
    try {
      fs.mkdirSync(path.dirname(VAPID_FILE), {recursive: true});
      fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2));
    } catch {
      // Read-only filesystem fallback (keys remain in memory for session)
    }
  }

  webpush.setVapidDetails(subject, vapidKeys.publicKey, vapidKeys.privateKey);
  initialized = true;
  return vapidKeys;
}

function loadSubscribers(): StoredPushSubscriber[] {
  if (subscribersCache) return subscribersCache;
  try {
    if (fs.existsSync(SUBS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf-8')) as StoredPushSubscriber[];
      if (Array.isArray(raw)) {
        subscribersCache = raw;
        return subscribersCache;
      }
    }
  } catch {
    // Ignore malformed store
  }
  subscribersCache = [];
  return subscribersCache;
}

function saveSubscribers(list: StoredPushSubscriber[]): void {
  subscribersCache = list;
  try {
    fs.mkdirSync(path.dirname(SUBS_FILE), {recursive: true});
    fs.writeFileSync(SUBS_FILE, JSON.stringify(list, null, 2));
  } catch {
    // Ignore if filesystem is ephemeral/read-only
  }
}

export function getVapidPublicKey(): string {
  return ensureVapidConfigured().publicKey;
}

export function upsertPushSubscription(
  subscription: PushSubscription,
  prefs: Partial<PushAlertPreferences>,
): {count: number} {
  ensureVapidConfigured();
  const list = loadSubscribers();
  const existingIdx = list.findIndex((s) => s.endpoint === subscription.endpoint);

  const normalizedPrefs: PushAlertPreferences = {
    enabled: prefs.enabled ?? true,
    notifyOnPriceChange: prefs.notifyOnPriceChange ?? true,
    notifyDailySummary: prefs.notifyDailySummary ?? true,
    targetEnabled: prefs.targetEnabled ?? false,
    unit: prefs.unit === 'gram' ? 'gram' : 'pavan',
    direction: prefs.direction === 'above' ? 'above' : 'below',
    targetPrice: Number.isFinite(Number(prefs.targetPrice)) ? Number(prefs.targetPrice) : 100000,
    lang: prefs.lang === 'ml' ? 'ml' : 'en',
  };

  const nextEntry: StoredPushSubscriber = {
    endpoint: subscription.endpoint,
    subscription,
    prefs: normalizedPrefs,
    lastAlertKey: existingIdx >= 0 ? list[existingIdx].lastAlertKey : undefined,
    lastDailyKey: existingIdx >= 0 ? list[existingIdx].lastDailyKey : undefined,
    lastTargetKey: existingIdx >= 0 ? list[existingIdx].lastTargetKey : undefined,
    updatedAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    list[existingIdx] = nextEntry;
  } else {
    list.push(nextEntry);
  }
  saveSubscribers(list);
  return {count: list.length};
}

export function removePushSubscription(endpoint: string): {removed: boolean; count: number} {
  const list = loadSubscribers();
  const next = list.filter((s) => s.endpoint !== endpoint);
  const removed = next.length !== list.length;
  if (removed) saveSubscribers(next);
  return {removed, count: next.length};
}

function buildPushMessage(
  latest: LatestGoldResponse,
  deltaPavan: number,
  deltaGram: number,
  reason: 'change' | 'daily' | 'target' | 'test',
  prefs: PushAlertPreferences,
): {title: string; body: string; tag: string} {
  const {pavan22k, gram22k, dateLabel} = latest.current;
  const arrow = deltaPavan > 0 ? '▲' : deltaPavan < 0 ? '▼' : '●';
  const colorEmoji = deltaPavan > 0 ? '🟢' : deltaPavan < 0 ? '🔴' : '🟡';
  const signedPavan =
    deltaPavan === 0 ? '0' : `${arrow} ${deltaPavan > 0 ? '+' : '-'}₹${Math.abs(deltaPavan).toLocaleString('en-IN')}`;
  const signedGram =
    deltaGram === 0 ? '0' : `${arrow} ${deltaGram > 0 ? '+' : '-'}₹${Math.abs(deltaGram).toLocaleString('en-IN')}/g`;

  const ml = prefs.lang === 'ml';
  let headline: string;
  if (reason === 'target') {
    const cmp = prefs.direction === 'above' ? '≥' : '≤';
    headline = ml
      ? `ലക്ഷ്യ വിലയിലെത്തി (${cmp} ${formatInrServer(prefs.targetPrice)})`
      : `Price Target Hit (${cmp} ${formatInrServer(prefs.targetPrice)})`;
  } else if (reason === 'change' && deltaPavan !== 0) {
    headline =
      deltaPavan > 0
        ? ml
          ? 'സ്വർണ്ണ വില വർദ്ധിച്ചു'
          : 'Kerala Gold Increased'
        : ml
          ? 'സ്വർണ്ണ വില കുറഞ്ഞു'
          : 'Kerala Gold Dropped';
  } else {
    headline = ml ? 'ഇന്നത്തെ സ്വർണ്ണ വില' : 'Kerala Gold Live Update';
  }

  const title = `${colorEmoji} ${arrow} ${headline} · ${dateLabel}`;
  const body = ml
    ? `1 പവൻ: ${formatInrServer(pavan22k)} (${signedPavan}) | 1 ഗ്രാം: ${formatInrServer(gram22k)} (${signedGram}) · ${latest.sourceName}`
    : `1 Pavan: ${formatInrServer(pavan22k)} (${signedPavan}) | 1 Gram: ${formatInrServer(gram22k)} (${signedGram}) · ${latest.sourceName}`;

  return {title, body, tag: `kgp-${reason}-${dateLabel}`};
}

export async function sendTestPushToEndpoint(
  endpoint: string,
  latest: LatestGoldResponse,
  lang: AppLanguage = 'en',
): Promise<boolean> {
  ensureVapidConfigured();
  const list = loadSubscribers();
  const target = list.find((s) => s.endpoint === endpoint);
  if (!target) return false;

  const payload = buildPushMessage(
    latest,
    latest.current.changePavan,
    latest.current.changeGram,
    'test',
    {...target.prefs, lang},
  );

  try {
    await webpush.sendNotification(
      target.subscription,
      JSON.stringify({
        ...payload,
        url: '/',
      }),
    );
    return true;
  } catch (err: unknown) {
    const statusCode = (err as {statusCode?: number})?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      removePushSubscription(endpoint);
    }
    return false;
  }
}

export async function dispatchBackgroundPushAlerts(
  prev: LatestGoldResponse | null,
  next: LatestGoldResponse,
): Promise<number> {
  const list = loadSubscribers();
  if (list.length === 0) return 0;

  ensureVapidConfigured();
  let sentCount = 0;
  let mutated = false;
  const expiredEndpoints: string[] = [];

  const boardKey = `${next.current.dateLabel}|${next.scheduleLabel}`;
  const deltaPavan =
    prev && prev.current.pavan22k > 0 && prev.current.pavan22k !== next.current.pavan22k
      ? next.current.pavan22k - prev.current.pavan22k
      : next.current.changePavan;
  const deltaGram =
    prev && prev.current.gram22k > 0 && prev.current.gram22k !== next.current.gram22k
      ? next.current.gram22k - prev.current.gram22k
      : next.current.changeGram;

  const rateChanged = Boolean(
    prev && (prev.current.pavan22k !== next.current.pavan22k || prev.current.gram22k !== next.current.gram22k),
  );

  await Promise.all(
    list.map(async (sub) => {
      if (!sub.prefs.enabled) return;

      const unitVal = sub.prefs.unit === 'pavan' ? next.current.pavan22k : next.current.gram22k;
      const targetMatched =
        sub.prefs.targetEnabled &&
        sub.prefs.targetPrice > 0 &&
        (sub.prefs.direction === 'above' ? unitVal >= sub.prefs.targetPrice : unitVal <= sub.prefs.targetPrice);

      const targetKey = `${next.current.dateLabel}:${sub.prefs.unit}:${sub.prefs.direction}:${sub.prefs.targetPrice}`;
      const dailyKey = `${boardKey}:${next.current.pavan22k}`;
      const changeKey = `${boardKey}:${next.current.pavan22k}:${next.current.gram22k}`;

      let reason: 'target' | 'change' | 'daily' | null = null;
      if (targetMatched && sub.lastTargetKey !== targetKey) {
        reason = 'target';
        sub.lastTargetKey = targetKey;
      } else if (sub.prefs.notifyOnPriceChange && rateChanged && sub.lastAlertKey !== changeKey) {
        reason = 'change';
        sub.lastAlertKey = changeKey;
      } else if (sub.prefs.notifyDailySummary && sub.lastDailyKey !== dailyKey) {
        reason = 'daily';
        sub.lastDailyKey = dailyKey;
      }

      if (!reason) return;
      mutated = true;

      const message = buildPushMessage(next, deltaPavan, deltaGram, reason, sub.prefs);
      try {
        await webpush.sendNotification(
          sub.subscription,
          JSON.stringify({
            ...message,
            url: '/',
          }),
        );
        sentCount += 1;
      } catch (err: unknown) {
        const statusCode = (err as {statusCode?: number})?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          expiredEndpoints.push(sub.endpoint);
        }
      }
    }),
  );

  if (expiredEndpoints.length > 0) {
    const cleaned = list.filter((s) => !expiredEndpoints.includes(s.endpoint));
    saveSubscribers(cleaned);
  } else if (mutated) {
    saveSubscribers(list);
  }

  return sentCount;
}
