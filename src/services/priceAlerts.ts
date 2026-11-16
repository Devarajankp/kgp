import type {LatestGoldResponse} from '../types/gold';
import {formatInr} from '../utils/format';

export interface PriceAlertConfig {
  enabled: boolean;
  unit: 'pavan' | 'gram';
  targetPrice: number;
  lastTriggeredKey?: string;
  updatedAt: string;
}

const ALERT_STORAGE_KEY = 'kgp-target-price-alert';

export function readPriceAlert(): PriceAlertConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ALERT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PriceAlertConfig;
    if (!parsed || typeof parsed.targetPrice !== 'number') return null;
    return parsed;
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

export function getNotificationPermissionState(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'granted') {
    return 'granted';
  }
  return await Notification.requestPermission();
}

export async function dispatchGoldNotification(
  title: string,
  body: string,
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
          tag: 'kgp-target-price-alert',
        });
        return true;
      }
    }
    new Notification(title, {
      body,
      icon: `${import.meta.env.BASE_URL}pwa-192x192.png`,
      tag: 'kgp-target-price-alert',
    });
    return true;
  } catch {
    return false;
  }
}

export async function evaluateTargetPriceAlert(
  data: LatestGoldResponse,
): Promise<{
  triggeredNow: boolean;
  isMatched: boolean;
  currentValue: number;
  config: PriceAlertConfig | null;
}> {
  const config = readPriceAlert();
  if (!config || !config.enabled || config.targetPrice <= 0) {
    return {triggeredNow: false, isMatched: false, currentValue: 0, config};
  }

  const currentValue =
    config.unit === 'pavan' ? data.current.pavan22k : data.current.gram22k;
  const isMatched = currentValue > 0 && currentValue <= config.targetPrice;

  if (!isMatched) {
    return {triggeredNow: false, isMatched: false, currentValue, config};
  }

  const triggerKey = `${data.current.dateLabel}:${config.unit}:${config.targetPrice}`;
  if (config.lastTriggeredKey === triggerKey) {
    return {triggeredNow: false, isMatched: true, currentValue, config};
  }

  const unitLabel = config.unit === 'pavan' ? '1 Pavan (8g)' : '1 Gram (22K)';
  const title = `Gold Target Reached: ${formatInr(currentValue)}`;
  const body = `Kerala 22K ${unitLabel} rate (${formatInr(currentValue)}) is at or below your target of ${formatInr(config.targetPrice)} (${data.current.dateLabel}).`;

  const sent = await dispatchGoldNotification(title, body);
  if (sent) {
    const updated: PriceAlertConfig = {
      ...config,
      lastTriggeredKey: triggerKey,
    };
    savePriceAlert(updated);
    return {triggeredNow: true, isMatched: true, currentValue, config: updated};
  }

  return {triggeredNow: false, isMatched: true, currentValue, config};
}
