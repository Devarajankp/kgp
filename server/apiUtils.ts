import type {Request, Response, NextFunction} from 'express';
import type {LatestGoldResponse, LiveSpotMarketData, PreferredSource, SourceId} from '../src/types/gold.ts';

const ALLOWED_SOURCES = new Set<PreferredSource>([
  'auto',
  'keralagold',
  'livegoldkerala',
  'goodreturns',
  'groww',
  'bankbazaar',
  'josalukkas',
  'kalyan',
  'toi',
]);

const ALLOWED_MONTHS = new Set([
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]);

export function sanitizePreferredSource(raw: unknown): PreferredSource {
  const val = String(raw || 'auto').toLowerCase().trim() as PreferredSource;
  return ALLOWED_SOURCES.has(val) ? val : 'auto';
}

export function sanitizeYear(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const num = Number(raw);
  if (!Number.isInteger(num)) return undefined;
  const maxYear = Math.max(2027, new Date().getFullYear() + 1);
  if (num < 1925 || num > maxYear) return undefined;
  return num;
}

export function sanitizeMonth(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const val = String(raw).toLowerCase().trim();
  return ALLOWED_MONTHS.has(val) ? val : undefined;
}

export function clampFinite(raw: unknown, fallback: number, min: number, max: number): number {
  const num = Number(raw);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export function formatInrServer(value: number): string {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

/**
 * Public read-only API CORS + defensive security headers middleware.
 */
export function apiSecurityAndCors(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

/**
 * Lightweight in-memory sliding-window rate limiter to protect upstream sources from abuse/spam.
 */
export function createApiRateLimiter(maxRequestsPerMinute = 120) {
  const hits = new Map<string, {count: number; resetAt: number}>();
  const windowMs = 60_000;

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    if (hits.size > 2000) {
      for (const [k, v] of hits.entries()) {
        if (v.resetAt <= now) hits.delete(k);
      }
    }

    const fwd = req.headers['x-forwarded-for'];
    const ip =
      (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'unknown';

    const existing = hits.get(ip);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowMs;
      hits.set(ip, {count: 1, resetAt});
      res.setHeader('X-RateLimit-Limit', String(maxRequestsPerMinute));
      res.setHeader('X-RateLimit-Remaining', String(maxRequestsPerMinute - 1));
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
      next();
      return;
    }

    existing.count += 1;
    const remaining = Math.max(0, maxRequestsPerMinute - existing.count);
    res.setHeader('X-RateLimit-Limit', String(maxRequestsPerMinute));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(existing.resetAt / 1000)));

    if (existing.count > maxRequestsPerMinute) {
      res.status(429).json({
        error: 'Rate limit exceeded. Please wait before sending more API requests.',
        retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000),
      });
      return;
    }

    next();
  };
}

export interface CalculateRequestInput {
  weight?: number;
  unit?: 'pavan' | 'gram';
  purity?: '22k' | '24k' | '18k';
  ratePerGram?: number;
  makingMode?: 'percent' | 'perGram' | 'flat';
  makingValue?: number;
  gstPercent?: number;
  hallmark?: boolean;
  stoneCharge?: number;
  oldGoldDeduction?: number;
  budget?: number;
}

export function calculateJewelleryBreakdown(
  input: CalculateRequestInput,
  liveBase22kGram: number,
  liveDateLabel: string,
  liveSourceName: string,
) {
  const unit = input.unit === 'gram' ? 'gram' : 'pavan';
  const purity = input.purity === '24k' || input.purity === '18k' ? input.purity : '22k';
  const purityFactor = purity === '24k' ? 24 / 22 : purity === '18k' ? 18 / 22 : 1;

  const weight = clampFinite(input.weight, 1, 0, 100_000);
  const totalGrams = unit === 'pavan' ? weight * 8 : weight;
  const totalPavan = totalGrams / 8;

  const defaultRate = Math.round(liveBase22kGram * purityFactor);
  const ratePerGramUsed =
    input.ratePerGram !== undefined && Number(input.ratePerGram) > 0
      ? clampFinite(input.ratePerGram, defaultRate, 1, 1_000_000)
      : defaultRate;

  const makingMode =
    input.makingMode === 'perGram' || input.makingMode === 'flat' ? input.makingMode : 'percent';
  const defaultMakingVal = makingMode === 'percent' ? 10 : makingMode === 'perGram' ? 950 : 8000;
  const makingValue = clampFinite(input.makingValue, defaultMakingVal, 0, 10_000_000);
  const gstPercent = clampFinite(input.gstPercent, 3, 0, 50);
  const hallmarkFee = input.hallmark && totalGrams > 0 ? 45 : 0;
  const stoneCharge = clampFinite(input.stoneCharge, 0, 0, 10_000_000);
  const oldGoldDeduction = clampFinite(input.oldGoldDeduction, 0, 0, 10_000_000);

  const baseGoldValue = totalGrams * ratePerGramUsed;
  const makingCharge =
    makingMode === 'percent'
      ? baseGoldValue * (makingValue / 100)
      : makingMode === 'perGram'
        ? totalGrams * makingValue
        : makingValue;

  const taxableSubtotal = baseGoldValue + makingCharge + stoneCharge + hallmarkFee;
  const gstAmount = taxableSubtotal * (gstPercent / 100);
  const grossTotal = taxableSubtotal + gstAmount;
  const netPayable = Math.max(0, grossTotal - oldGoldDeduction);
  const effectivePerGram = totalGrams > 0 ? grossTotal / totalGrams : 0;

  let reverseBudgetEstimate: {
    budgetInr: number;
    estimatedGrams: number;
    estimatedPavan: number;
  } | null = null;

  if (input.budget !== undefined && Number(input.budget) > 0) {
    const budgetInr = clampFinite(input.budget, 0, 0, 100_000_000);
    const preGst = budgetInr / (1 + gstPercent / 100);
    let gramsBuyable = 0;
    if (ratePerGramUsed > 0) {
      if (makingMode === 'percent') {
        gramsBuyable = preGst / (ratePerGramUsed * (1 + makingValue / 100));
      } else if (makingMode === 'perGram') {
        gramsBuyable = preGst / (ratePerGramUsed + makingValue);
      } else {
        gramsBuyable = Math.max(0, preGst - makingValue) / ratePerGramUsed;
      }
    }
    reverseBudgetEstimate = {
      budgetInr: Math.round(budgetInr),
      estimatedGrams: Math.round(gramsBuyable * 100) / 100,
      estimatedPavan: Math.round((gramsBuyable / 8) * 100) / 100,
    };
  }

  return {
    rateSource: liveSourceName,
    rateDate: liveDateLabel,
    purity: purity.toUpperCase(),
    inputWeight: weight,
    inputUnit: unit,
    totalGrams: Math.round(totalGrams * 100) / 100,
    totalPavan: Math.round(totalPavan * 100) / 100,
    ratePerGramUsed: Math.round(ratePerGramUsed),
    ratePerPavanUsed: Math.round(ratePerGramUsed * 8),
    makingMode,
    makingValue,
    gstPercent,
    baseGoldValue: Math.round(baseGoldValue),
    makingCharge: Math.round(makingCharge),
    hallmarkFee,
    stoneCharge: Math.round(stoneCharge),
    taxableSubtotal: Math.round(taxableSubtotal),
    gstAmount: Math.round(gstAmount),
    grossTotal: Math.round(grossTotal),
    oldGoldDeduction: Math.round(oldGoldDeduction),
    netPayable: Math.round(netPayable),
    netPayableFormatted: formatInrServer(netPayable),
    effectivePerGram: Math.round(effectivePerGram),
    reverseBudgetEstimate,
  };
}

export function buildShortcutPayload(
  latest: LatestGoldResponse,
  spot: LiveSpotMarketData | null,
) {
  const {current} = latest;
  const arrow = current.direction === 'up' ? '▲' : current.direction === 'down' ? '▼' : '●';
  const colorEmoji = current.direction === 'up' ? '🟢' : current.direction === 'down' ? '🔴' : '🟡';
  const trendColor = current.direction === 'up' ? 'green' : current.direction === 'down' ? 'red' : 'amber';
  const chgText =
    current.changePavan === 0
      ? '● No change'
      : `${arrow} ${current.changePavan > 0 ? '+' : '-'}₹${Math.abs(current.changePavan).toLocaleString('en-IN')}`;
  const chgGramText =
    current.changeGram === 0
      ? '● 0'
      : `${arrow} ${current.changeGram > 0 ? '+' : '-'}₹${Math.abs(current.changeGram).toLocaleString('en-IN')}/g`;

  const recent5Days = (latest.entries || [])
    .slice(-5)
    .reverse()
    .map((e) => ({
      date: e.dateLabel,
      session: e.session,
      pavan: e.pavan,
      gram: e.gram,
      changePavan: e.changePavan,
      changeGram: e.changeGram,
      direction: e.direction,
      trendSymbol: e.direction === 'up' ? '▲' : e.direction === 'down' ? '▼' : '●',
      colorEmoji: e.direction === 'up' ? '🟢' : e.direction === 'down' ? '🔴' : '🟡',
    }));

  let outlookSignal: 'wait' | 'buy_lock' | 'steady' = 'steady';
  let outlookNote = 'Global spot market is steady; normal buying conditions.';
  if (spot) {
    if (spot.spotChangePercent <= -0.4) {
      outlookSignal = 'wait';
      outlookNote = `Global spot is softer (${spot.spotChangePercent.toFixed(2)}%); if flexible, check tomorrow's 9:30 AM IST fix.`;
    } else if (spot.spotChangePercent >= 0.4) {
      outlookSignal = 'buy_lock';
      outlookNote = `Global spot is rising (+${spot.spotChangePercent.toFixed(2)}%); locking today's rate may help urgent buyers.`;
    }
  }

  const notificationTitle =
    `${colorEmoji} ${arrow} Kerala 22K Gold ${current.direction === 'up' ? 'Up' : current.direction === 'down' ? 'Down' : 'Update'} · ${current.dateLabel}`;
  const notificationBody =
    `1 Pavan: ${formatInrServer(current.pavan22k)} (${chgText}) | ` +
    `1 Gram: ${formatInrServer(current.gram22k)} (${chgGramText}) · ${latest.scheduleLabel}`;

  const summaryText = `${notificationTitle}\n${notificationBody}`;

  const summaryMalayalam =
    `${colorEmoji} ${arrow} കേരള 22K സ്വർണ്ണ വില (${current.dateLabel})\n` +
    `1 പവൻ: ${formatInrServer(current.pavan22k)} (${chgText}) | 1 ഗ്രാം: ${formatInrServer(current.gram22k)} (${chgGramText})`;

  return {
    date: current.dateLabel,
    schedule: latest.scheduleLabel,
    updatedTimeIst: latest.updatedTimeIst,
    source: latest.sourceName,
    sourceUrl: latest.sourceUrl,
    pavan22k: current.pavan22k,
    gram22k: current.gram22k,
    pavan24k: current.pavan24kEstimate,
    gram24k: current.gram24kEstimate,
    gram18k: current.gram18kEstimate,
    pavan22kFormatted: formatInrServer(current.pavan22k),
    gram22kFormatted: formatInrServer(current.gram22k),
    changePavan: current.changePavan,
    changeGram: current.changeGram,
    changePavanFormatted: chgText,
    changeGramFormatted: chgGramText,
    changePercent: current.changePercent,
    direction: current.direction,
    trendSymbol: arrow,
    colorEmoji,
    trendColor,
    trend: current.trendLabel,
    monthlyHighPavan: latest.monthlyHigh?.pavan ?? null,
    monthlyHighDate: latest.monthlyHigh?.dateLabel ?? null,
    monthlyLowPavan: latest.monthlyLow?.pavan ?? null,
    monthlyLowDate: latest.monthlyLow?.dateLabel ?? null,
    spot22kGramInr: spot?.spot22kGramInr ?? null,
    spot24kGramInr: spot?.spot24kGramInr ?? null,
    spotChangePercent: spot?.spotChangePercent ?? null,
    usdInr: spot?.usdInr ?? null,
    outlookSignal,
    outlookNote,
    recent5Days,
    notificationTitle,
    notificationBody,
    summaryText,
    summaryMalayalam,
  };
}

export const ALL_SOURCE_IDS: SourceId[] = [
  'keralagold',
  'livegoldkerala',
  'goodreturns',
  'groww',
  'bankbazaar',
  'josalukkas',
  'kalyan',
  'toi',
];

export function buildOpenApiSpec(baseUrl: string) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Kerala Gold Price (KGP) API',
      version: '1.1.0',
      description:
        'CORS-enabled public JSON & text API for Kerala 22K/24K/18K gold rates, 1925–present historical archives, live global XAU/INR spot context, making-charge estimation, and Apple iPhone Shortcuts automation.',
      license: {name: 'MIT'},
    },
    servers: [{url: baseUrl}],
    paths: {
      '/api/health': {
        get: {
          summary: 'API health check & active provider list',
          responses: {'200': {description: 'Service healthy'}},
        },
      },
      '/api/gold/shortcut': {
        get: {
          summary: 'Flat compact JSON or plain-text rate payload tailored for Apple iPhone Shortcuts & widgets',
          parameters: [
            {name: 'format', in: 'query', schema: {type: 'string', enum: ['json', 'text']}},
            {name: 'lang', in: 'query', schema: {type: 'string', enum: ['en', 'ml']}},
            {name: 'source', in: 'query', schema: {type: 'string'}},
          ],
          responses: {'200': {description: 'Flat JSON or plain text summary'}},
        },
      },
      '/api/gold/latest': {
        get: {
          summary: 'Full latest Kerala gold rates + intraday/monthly entries + optional fallback probes',
          parameters: [
            {name: 'source', in: 'query', schema: {type: 'string'}},
            {name: 'probe', in: 'query', schema: {type: 'boolean'}},
          ],
          responses: {'200': {description: 'LatestGoldResponse JSON'}},
        },
      },
      '/api/gold/history': {
        get: {
          summary: 'Historical Kerala gold rates (daily since Nov 2009, monthly benchmarks, yearly 1925–present)',
          parameters: [
            {name: 'mode', in: 'query', schema: {type: 'string', enum: ['daily', 'monthly', 'yearly']}},
            {name: 'year', in: 'query', schema: {type: 'integer', minimum: 1925}},
            {name: 'month', in: 'query', schema: {type: 'string'}},
          ],
          responses: {'200': {description: 'HistoryResponse JSON'}},
        },
      },
      '/api/gold/spot': {
        get: {
          summary: 'Live international XAU/INR & USD/INR bullion spot snapshot from LivePriceOfGold.com',
          responses: {'200': {description: 'LiveSpotMarketData JSON'}},
        },
      },
      '/api/gold/sources': {
        get: {
          summary: 'Live availability and latency check across all 8 Kerala gold providers',
          responses: {'200': {description: 'Provider probes JSON'}},
        },
      },
      '/api/gold/calculate': {
        get: {
          summary: 'Calculate jewellery making charges, GST, HUID hallmarking, and reverse budget weight via GET query params (ideal for Shortcuts)',
          parameters: [
            {name: 'weight', in: 'query', schema: {type: 'number', default: 1}},
            {name: 'unit', in: 'query', schema: {type: 'string', enum: ['pavan', 'gram'], default: 'pavan'}},
            {name: 'purity', in: 'query', schema: {type: 'string', enum: ['22k', '24k', '18k'], default: '22k'}},
            {name: 'ratePerGram', in: 'query', schema: {type: 'number'}},
            {name: 'makingMode', in: 'query', schema: {type: 'string', enum: ['percent', 'perGram', 'flat'], default: 'percent'}},
            {name: 'makingValue', in: 'query', schema: {type: 'number', default: 10}},
            {name: 'gst', in: 'query', schema: {type: 'number', default: 3}},
            {name: 'hallmark', in: 'query', schema: {type: 'boolean', default: false}},
            {name: 'stone', in: 'query', schema: {type: 'number', default: 0}},
            {name: 'exchange', in: 'query', schema: {type: 'number', default: 0}},
            {name: 'budget', in: 'query', schema: {type: 'number'}},
          ],
          responses: {'200': {description: 'Itemized jewellery bill breakdown JSON'}},
        },
        post: {
          summary: 'Calculate jewellery making charges via JSON POST body',
          responses: {'200': {description: 'Itemized jewellery bill breakdown JSON'}},
        },
      },
      '/api/gold/alert-check': {
        get: {
          summary:
            'Evaluate daily rate changes (1 Pavan & 1 Gram with color-coded trend symbols) and optional custom target price for iPhone Shortcuts & push pipelines',
          parameters: [
            {name: 'target', in: 'query', required: false, schema: {type: 'number'}},
            {name: 'unit', in: 'query', schema: {type: 'string', enum: ['pavan', 'gram'], default: 'pavan'}},
            {name: 'direction', in: 'query', schema: {type: 'string', enum: ['below', 'above'], default: 'below'}},
            {name: 'prevPavan', in: 'query', schema: {type: 'number'}},
            {name: 'format', in: 'query', schema: {type: 'string', enum: ['json', 'text'], default: 'json'}},
            {name: 'lang', in: 'query', schema: {type: 'string', enum: ['en', 'ml'], default: 'en'}},
          ],
          responses: {'200': {description: 'Dual-unit alert evaluation JSON or plain-text notification'}},
        },
      },
    },
  };
}
