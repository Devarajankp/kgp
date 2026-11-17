import type {Response} from 'express';
import type {LatestGoldResponse} from '../src/types/gold.ts';
import {getLatestGoldWithFallback} from './goldService.ts';
import {dispatchBackgroundPushAlerts} from './pushService.ts';

const sseClients = new Set<Response>();
let lastKnownLatest: LatestGoldResponse | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
let inFlightCheck: Promise<LatestGoldResponse | null> | null = null;

function buildRateSignature(data: LatestGoldResponse): string {
  return `${data.current.dateLabel}|${data.current.pavan22k}|${data.current.gram22k}|${data.scheduleLabel}|${data.entries.length}`;
}

function isIstMarketWindow(): boolean {
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const hour = istNow.getUTCHours();
  return hour >= 8 && hour <= 19;
}

export function broadcastGoldUpdate(data: LatestGoldResponse): void {
  const payload = `event: gold-update\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}

export async function processCandidateLatest(next: LatestGoldResponse): Promise<void> {
  const prev = lastKnownLatest;
  const changed = !prev || buildRateSignature(prev) !== buildRateSignature(next);
  lastKnownLatest = next;

  if (changed) {
    broadcastGoldUpdate(next);
    if (prev) {
      await dispatchBackgroundPushAlerts(prev, next).catch(() => 0);
    }
  }
}

export async function pollOnceAndBroadcast(): Promise<LatestGoldResponse | null> {
  if (inFlightCheck) return inFlightCheck;
  inFlightCheck = (async () => {
    try {
      const next = await getLatestGoldWithFallback('auto', false, true);
      await processCandidateLatest(next);
      return next;
    } catch {
      return lastKnownLatest;
    } finally {
      inFlightCheck = null;
    }
  })();
  return inFlightCheck;
}

function scheduleNextPoll(): void {
  if (pollTimer) clearTimeout(pollTimer);
  // 2 min polling during Kerala bullion update hours (8 AM - 7 PM IST), 15 min off-hours
  const delayMs = isIstMarketWindow() ? 2 * 60 * 1000 : 15 * 60 * 1000;
  pollTimer = setTimeout(async () => {
    await pollOnceAndBroadcast();
    scheduleNextPoll();
  }, delayMs);
  pollTimer.unref?.();
}

export function registerSseClient(res: Response): () => void {
  sseClients.add(res);
  res.write(`event: connected\ndata: ${JSON.stringify({connectedAt: new Date().toISOString()})}\n\n`);
  if (lastKnownLatest) {
    res.write(`event: gold-update\ndata: ${JSON.stringify(lastKnownLatest)}\n\n`);
  }
  return () => {
    sseClients.delete(res);
  };
}

export function startGoldWatcher(): void {
  if (pollTimer) return;
  void pollOnceAndBroadcast();
  scheduleNextPoll();

  heartbeatTimer = setInterval(() => {
    for (const res of sseClients) {
      try {
        res.write(': keepalive\n\n');
      } catch {
        sseClients.delete(res);
      }
    }
  }, 25_000);
  heartbeatTimer.unref?.();
}
