import * as cheerio from 'cheerio';
import type {
  DailyRateEntry,
  HistoryResponse,
  LatestGoldResponse,
  LiveSpotMarketData,
  MonthlyRateEntry,
  PreferredSource,
  PriceDirection,
  SourceId,
  SourceProbeResult,
  YearlyRateEntry,
} from '../src/types/gold.ts';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const MONTHS = [
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
] as const;

const SHORT_MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function parseNumericPrice(raw: string): number | null {
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/(?:Rs\.?\s*|₹\s*)?([\d,]+(?:\.\d+)?)/i);
  if (!match) return null;
  const val = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(val) && val > 0 ? val : null;
}

function formatIstFromHeader(lastModified: string | null): string {
  if (!lastModified) {
    return (
      new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }) + ' IST'
    );
  }
  const dt = new Date(lastModified);
  if (Number.isNaN(dt.getTime())) return lastModified;
  return (
    dt.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }) + ' IST'
  );
}

function parseIsoDateFromLabel(dateLabel: string): string {
  const m = dateLabel.match(/(\d{1,2})[- ]([A-Za-z]{3})[- ,]+(\d{2,4})/);
  if (!m) return dateLabel;
  const day = m[1].padStart(2, '0');
  const monIdx = SHORT_MONTHS[m[2].toLowerCase()];
  if (monIdx === undefined) return dateLabel;
  const monthNum = String(monIdx + 1).padStart(2, '0');
  const rawYear = Number(m[3]);
  const fullYear = m[3].length === 2 ? (rawYear >= 50 ? 1900 + rawYear : 2000 + rawYear) : rawYear;
  return `${fullYear}-${monthNum}-${day}`;
}

function parseDateAndSession(rawCellText: string): {
  dateLabel: string;
  session: string;
  isToday: boolean;
  isYesterday: boolean;
} {
  const normalized = rawCellText.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  const isToday = /today/i.test(normalized);
  const isYesterday = /yesterday/i.test(normalized);
  const dateMatch = normalized.match(/\d{1,2}-[A-Za-z]{3}-\d{2,4}/);
  const dateLabel = dateMatch ? dateMatch[0] : normalized.replace(/(Today|Yesterday|»)/gi, '').trim();

  let session = 'Daily';
  const sessionMatch = normalized.match(/\(([^)]+)\)/);
  if (sessionMatch) {
    session = sessionMatch[1].trim();
  } else if (isToday) {
    session = 'Today';
  } else if (isYesterday) {
    session = 'Yesterday';
  }

  return {dateLabel, session, isToday, isYesterday};
}

function computeDirection(diff: number): PriceDirection {
  if (diff > 0) return 'up';
  if (diff < 0) return 'down';
  return 'flat';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function fetchTextWithTimeout(
  url: string,
  timeoutMs = 8000,
): Promise<{ok: boolean; status: number; text: string; lastModified: string | null; redirectedUrl: string}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/javascript,application/json;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      text,
      lastModified: res.headers.get('last-modified'),
      redirectedUrl: res.url,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function parseDailyHtml(html: string, gramOverride?: number | null): {
  entries: DailyRateEntry[];
  monthlyHigh: {pavan: number; gram: number; dateLabel: string} | null;
  monthlyLow: {pavan: number; gram: number; dateLabel: string} | null;
  trendLabel: string;
  monthLabel: string;
  year: number;
  monthKey: string;
} {
  const $ = cheerio.load(html);
  const rawRows: Array<{
    dateLabel: string;
    session: string;
    isToday: boolean;
    isYesterday: boolean;
    pavan: number;
    note?: string;
  }> = [];

  let monthlyHigh: {pavan: number; gram: number; dateLabel: string} | null = null;
  let monthlyLow: {pavan: number; gram: number; dateLabel: string} | null = null;

  $('table tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length === 3) {
      const label = cells.eq(0).text().replace(/\s+/g, ' ').trim();
      const dateStr = cells.eq(1).text().replace(/\s+/g, ' ').trim();
      const priceVal = parseNumericPrice(cells.eq(2).text());
      if (/^highest:/i.test(label) && priceVal) {
        monthlyHigh = {pavan: priceVal, gram: round2(priceVal / 8), dateLabel: dateStr};
      } else if (/^lowest:/i.test(label) && priceVal) {
        monthlyLow = {pavan: priceVal, gram: round2(priceVal / 8), dateLabel: dateStr};
      }
      return;
    }

    if (cells.length === 2) {
      const col0 = cells.eq(0).text().replace(/\s+/g, ' ').trim();
      const col1 = cells.eq(1).text().replace(/\s+/g, ' ').trim();
      if (/^date$/i.test(col0) || /trend/i.test(col0)) return;
      if (!/\d{1,2}-[A-Za-z]{3}-\d{2,4}/.test(col0)) return;

      const pavan = parseNumericPrice(col1);
      if (!pavan) return;

      const parsedDate = parseDateAndSession(col0);
      let note: string | undefined;
      if (/highest/i.test(col1)) note = 'Highest of Month';
      else if (/lowest/i.test(col1)) note = 'Lowest of Month';

      rawRows.push({
        ...parsedDate,
        pavan,
        note,
      });
    }
  });

  const entries: DailyRateEntry[] = rawRows.map((row, idx) => {
    const isLast = idx === rawRows.length - 1;
    const gram =
      isLast && gramOverride && Math.abs(gramOverride * 8 - row.pavan) <= 8
        ? gramOverride
        : round2(row.pavan / 8);

    const prev = idx > 0 ? rawRows[idx - 1] : null;
    const prevGram = prev ? round2(prev.pavan / 8) : gram;
    const changePavan = prev ? round2(row.pavan - prev.pavan) : 0;
    const changeGram = prev ? round2(gram - prevGram) : 0;
    const changePercent = prev && prev.pavan > 0 ? round2((changePavan / prev.pavan) * 100) : 0;
    const isoDate = parseIsoDateFromLabel(row.dateLabel);

    return {
      id: `${isoDate}-${row.session.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${idx}`,
      dateLabel: row.dateLabel,
      isoDate,
      session: row.session,
      isToday: row.isToday,
      isYesterday: row.isYesterday,
      pavan: row.pavan,
      gram,
      changePavan,
      changeGram,
      changePercent,
      direction: computeDirection(changePavan),
      note: row.note,
    };
  });

  if (!monthlyHigh && entries.length > 0) {
    const maxEntry = entries.reduce((a, b) => (b.pavan > a.pavan ? b : a));
    monthlyHigh = {pavan: maxEntry.pavan, gram: maxEntry.gram, dateLabel: maxEntry.dateLabel};
  }
  if (!monthlyLow && entries.length > 0) {
    const minEntry = entries.reduce((a, b) => (b.pavan < a.pavan ? b : a));
    monthlyLow = {pavan: minEntry.pavan, gram: minEntry.gram, dateLabel: minEntry.dateLabel};
  }

  let trendLabel = 'Steady';
  const bodyText = $('body').text();
  if (/gold_price_trend_up|Upward/i.test(html) || /\bUpward\b/i.test(bodyText)) {
    trendLabel = 'Upward';
  } else if (/gold_price_trend_down|Downward/i.test(html) || /\bDownward\b/i.test(bodyText)) {
    trendLabel = 'Downward';
  }

  const h1Text = $('h1').text().replace(/\s+/g, ' ').trim();
  const monthYearMatch = h1Text.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i,
  );
  const firstEntryIso = entries[entries.length - 1]?.isoDate || '';
  const fallbackYear = firstEntryIso.match(/^(\d{4})-(\d{2})/)?.[1];
  const fallbackMonthIdx = firstEntryIso.match(/^(\d{4})-(\d{2})/)?.[2];

  const monthName = monthYearMatch
    ? monthYearMatch[1]
    : fallbackMonthIdx
      ? MONTHS[Number(fallbackMonthIdx) - 1]
      : 'november';
  const year = monthYearMatch
    ? Number(monthYearMatch[2])
    : fallbackYear
      ? Number(fallbackYear)
      : new Date().getFullYear();

  const normalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1).toLowerCase();

  return {
    entries,
    monthlyHigh,
    monthlyLow,
    trendLabel,
    monthLabel: `${normalizedMonth} ${year}`,
    year,
    monthKey: monthName.toLowerCase(),
  };
}

function parseMonthlyHtml(html: string): {
  entries: MonthlyRateEntry[];
  high: {pavan: number; gram: number; label: string} | null;
  low: {pavan: number; gram: number; label: string} | null;
} {
  const $ = cheerio.load(html);
  const rawRows: Array<{month: string; dateLabel: string; pavan: number}> = [];
  let high: {pavan: number; gram: number; label: string} | null = null;
  let low: {pavan: number; gram: number; label: string} | null = null;

  $('table tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length === 3) {
      const c0 = cells.eq(0).text().replace(/\s+/g, ' ').trim();
      const c1 = cells.eq(1).text().replace(/\s+/g, ' ').trim();
      const c2 = cells.eq(2).text().replace(/\s+/g, ' ').trim();

      if (/^highest:/i.test(c0)) {
        const val = parseNumericPrice(c2);
        if (val) high = {pavan: val, gram: round2(val / 8), label: c1};
        return;
      }
      if (/^lowest:/i.test(c0)) {
        const val = parseNumericPrice(c2);
        if (val) low = {pavan: val, gram: round2(val / 8), label: c1};
        return;
      }

      if (/^(month|date)$/i.test(c0)) return;
      const pavan = parseNumericPrice(c2);
      if (c0 && pavan && /\d{1,2}-[A-Za-z]{3}-\d{2,4}/.test(c1)) {
        rawRows.push({month: c0, dateLabel: c1, pavan});
      }
    }
  });

  const entries: MonthlyRateEntry[] = rawRows.map((row, idx) => {
    const gram = round2(row.pavan / 8);
    const prev = idx > 0 ? rawRows[idx - 1] : null;
    const prevGram = prev ? round2(prev.pavan / 8) : gram;
    const changePavan = prev ? round2(row.pavan - prev.pavan) : 0;
    const changeGram = prev ? round2(gram - prevGram) : 0;
    const changePercent = prev && prev.pavan > 0 ? round2((changePavan / prev.pavan) * 100) : 0;
    return {
      id: `${row.month.toLowerCase()}-${idx}`,
      month: row.month,
      dateLabel: row.dateLabel,
      pavan: row.pavan,
      gram,
      changePavan,
      changeGram,
      changePercent,
      direction: computeDirection(changePavan),
    };
  });

  if (!high && entries.length > 0) {
    const maxE = entries.reduce((a, b) => (b.pavan > a.pavan ? b : a));
    high = {pavan: maxE.pavan, gram: maxE.gram, label: maxE.month};
  }
  if (!low && entries.length > 0) {
    const minE = entries.reduce((a, b) => (b.pavan < a.pavan ? b : a));
    low = {pavan: minE.pavan, gram: minE.gram, label: minE.month};
  }

  return {entries, high, low};
}

function parseYearlyHtml(html: string): {
  entries: YearlyRateEntry[];
  high: {pavan: number; gram: number; label: string} | null;
  low: {pavan: number; gram: number; label: string} | null;
} {
  const $ = cheerio.load(html);
  const rawRows: Array<{year: number; dateLabel: string; pavan: number}> = [];

  $('table tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length === 3) {
      const yStr = cells.eq(0).text().replace(/\s+/g, ' ').trim();
      const dateLabel = cells.eq(1).text().replace(/\s+/g, ' ').trim();
      const pStr = cells.eq(2).text().replace(/\s+/g, ' ').trim();
      if (!/^\d{4}$/.test(yStr)) return;
      const pavan = parseNumericPrice(pStr);
      if (!pavan) return;
      rawRows.push({year: Number(yStr), dateLabel, pavan});
    }
  });

  rawRows.sort((a, b) => a.year - b.year);

  const entries: YearlyRateEntry[] = rawRows.map((row, idx) => {
    const gram = round2(row.pavan / 8);
    const prev = idx > 0 ? rawRows[idx - 1] : null;
    const prevGram = prev ? round2(prev.pavan / 8) : gram;
    const changePavan = prev ? round2(row.pavan - prev.pavan) : 0;
    const changeGram = prev ? round2(gram - prevGram) : 0;
    const changePercent = prev && prev.pavan > 0 ? round2((changePavan / prev.pavan) * 100) : 0;
    return {
      id: `year-${row.year}`,
      year: row.year,
      dateLabel: row.dateLabel,
      pavan: row.pavan,
      gram,
      changePavan,
      changeGram,
      changePercent,
      direction: computeDirection(changePavan),
    };
  });

  let high: {pavan: number; gram: number; label: string} | null = null;
  let low: {pavan: number; gram: number; label: string} | null = null;
  if (entries.length > 0) {
    const maxE = entries.reduce((a, b) => (b.pavan > a.pavan ? b : a));
    const minE = entries.reduce((a, b) => (b.pavan < a.pavan ? b : a));
    high = {pavan: maxE.pavan, gram: maxE.gram, label: String(maxE.year)};
    low = {pavan: minE.pavan, gram: minE.gram, label: String(minE.year)};
  }

  return {entries, high, low};
}

function parseLiveGoldKeralaHistoryHtml(html: string): DailyRateEntry[] {
  const $ = cheerio.load(html);
  const raw: Array<{
    dateLabel: string;
    isToday: boolean;
    gram: number;
    pavan: number;
  }> = [];

  $('table')
    .first()
    .find('tr')
    .each((_, tr) => {
      const cells = $(tr).find('td');
      if (cells.length < 3) return;
      const rawDate = cells.eq(0).text().replace(/\s+/g, ' ').trim();
      const isToday = /today/i.test(rawDate);
      const dm = rawDate.match(/(\d{1,2})\s+([A-Za-z]{3})[,\s]+(\d{4})/);
      const dateLabel = dm ? `${dm[1]}-${dm[2]}-${dm[3].slice(-2)}` : rawDate.replace(/Today/gi, '').trim();
      const gram = parseNumericPrice(cells.eq(1).text());
      const pavan = parseNumericPrice(cells.eq(2).text());
      if (gram && pavan && dateLabel) {
        raw.push({dateLabel, isToday, gram, pavan});
      }
    });

  // LiveGoldKerala table is newest-first -> reverse to chronological order
  raw.reverse();

  return raw.map((row, idx) => {
    const prev = idx > 0 ? raw[idx - 1] : null;
    const changePavan = prev ? round2(row.pavan - prev.pavan) : 0;
    const changeGram = prev ? round2(row.gram - prev.gram) : 0;
    const changePercent = prev && prev.pavan > 0 ? round2((changePavan / prev.pavan) * 100) : 0;
    const isoDate = parseIsoDateFromLabel(row.dateLabel);
    return {
      id: `lgk-${isoDate}-${idx}`,
      dateLabel: row.dateLabel,
      isoDate,
      session: row.isToday ? 'Today' : 'Daily',
      isToday: row.isToday,
      isYesterday: idx === raw.length - 2,
      pavan: row.pavan,
      gram: row.gram,
      changePavan,
      changeGram,
      changePercent,
      direction: computeDirection(changePavan),
    };
  });
}

async function probeKeralaGold(): Promise<{
  probe: SourceProbeResult;
  data?: LatestGoldResponse;
}> {
  const start = Date.now();
  const url = 'https://www.keralagold.com/daily-gold-prices.htm';
  try {
    const [dailyRes, jsRes] = await Promise.all([
      fetchTextWithTimeout(url, 8000),
      fetchTextWithTimeout('https://www.keralagold.com/gold-price.js', 5000).catch(() => null),
    ]);
    const latencyMs = Date.now() - start;

    if (!dailyRes.ok) {
      return {
        probe: {
          id: 'keralagold',
          name: 'KeralaGold.com',
          url,
          status: 'unavailable',
          httpStatus: dailyRes.status,
          latencyMs,
          detail: `HTTP ${dailyRes.status}`,
          supportsHistory: true,
        },
      };
    }

    let gramOverride: number | null = null;
    if (jsRes?.ok) {
      const m = jsRes.text.match(/var\s+gram\s*=\s*(\d+(?:\.\d+)?)/);
      if (m) gramOverride = Number(m[1]);
    }

    const parsed = parseDailyHtml(dailyRes.text, gramOverride);
    if (parsed.entries.length === 0) {
      return {
        probe: {
          id: 'keralagold',
          name: 'KeralaGold.com',
          url,
          status: 'error',
          httpStatus: dailyRes.status,
          latencyMs,
          detail: 'Price table could not be parsed',
          supportsHistory: true,
        },
      };
    }

    const latest = parsed.entries[parsed.entries.length - 1];
    const gram22k = latest.gram;
    const pavan22k = latest.pavan;
    const gram24kEstimate = Math.round(gram22k * (24 / 22));
    const pavan24kEstimate = gram24kEstimate * 8;
    const gram18kEstimate = Math.round(gram22k * (18 / 22));

    const probe: SourceProbeResult = {
      id: 'keralagold',
      name: 'KeralaGold.com',
      url,
      status: 'online',
      httpStatus: dailyRes.status,
      latencyMs,
      detail: `Active · ${parsed.entries.length} records in ${parsed.monthLabel}`,
      supportsHistory: true,
    };

    const data: LatestGoldResponse = {
      source: 'keralagold',
      sourceName: 'KeralaGold.com',
      sourceUrl: url,
      fallbackUsed: false,
      fallbackChain: [probe],
      fetchedAt: new Date().toISOString(),
      serverLastModified: dailyRes.lastModified,
      updatedTimeIst: formatIstFromHeader(dailyRes.lastModified),
      scheduleLabel: latest.session === 'Today' ? 'Morning Update' : `${latest.session} Session`,
      monthLabel: parsed.monthLabel,
      year: parsed.year,
      monthKey: parsed.monthKey,
      current: {
        dateLabel: latest.dateLabel,
        session: latest.session,
        gram22k,
        pavan22k,
        gram24kEstimate,
        pavan24kEstimate,
        gram18kEstimate,
        changePavan: latest.changePavan,
        changeGram: latest.changeGram,
        changePercent: latest.changePercent,
        direction: latest.direction,
        trendLabel: parsed.trendLabel,
      },
      monthlyHigh: parsed.monthlyHigh,
      monthlyLow: parsed.monthlyLow,
      entries: parsed.entries,
    };

    return {probe, data};
  } catch (err) {
    return {
      probe: {
        id: 'keralagold',
        name: 'KeralaGold.com',
        url,
        status: 'error',
        latencyMs: Date.now() - start,
        detail: err instanceof Error ? err.message : 'Network error',
        supportsHistory: true,
      },
    };
  }
}

interface SecondaryExtraction {
  gram22k: number;
  pavan22k?: number;
  gram24k?: number;
  gram18k?: number;
  changeGram?: number;
  historyEntries?: DailyRateEntry[];
}

type SecondarySourceId = Exclude<SourceId, 'keralagold'>;

const SECONDARY_CONFIGS: Record<
  SecondarySourceId,
  {name: string; url: string; supportsHistory: boolean}
> = {
  livegoldkerala: {
    name: 'LiveGoldKerala.com',
    url: 'https://www.livegoldkerala.com/',
    supportsHistory: true,
  },
  goodreturns: {
    name: 'GoodReturns.in',
    url: 'https://www.goodreturns.in/gold-rates/kerala.html',
    supportsHistory: false,
  },
  groww: {
    name: 'Groww.in',
    url: 'https://groww.in/gold-rates/gold-rate-today-in-kerala',
    supportsHistory: false,
  },
  bankbazaar: {
    name: 'BankBazaar.com',
    url: 'https://www.bankbazaar.com/gold-rate-kerala.html',
    supportsHistory: false,
  },
  josalukkas: {
    name: 'Jos Alukkas',
    url: 'https://www.josalukkasonline.com/gold-rate-today/kerala',
    supportsHistory: false,
  },
  kalyan: {
    name: 'Kalyan Jewellers',
    url: 'https://store.kalyanjewellers.net/gold-rate/kerala/en',
    supportsHistory: false,
  },
  toi: {
    name: 'Times of India',
    url: 'https://timesofindia.indiatimes.com/business/gold-rates-today/gold-price-in-kerala',
    supportsHistory: false,
  },
};

function extractRatesForSecondary(
  id: SecondarySourceId,
  html: string,
): SecondaryExtraction | null {
  const $ = cheerio.load(html);

  if (id === 'livegoldkerala') {
    let gram22k: number | null = null;
    let pavan22k: number | null = null;
    let changeGram: number | undefined;
    $('table')
      .first()
      .find('tr')
      .each((_, tr) => {
        const cells = $(tr).find('td');
        if (cells.length < 2) return;
        const label = cells.eq(0).text().replace(/\s+/g, ' ').trim();
        const todayVal = parseNumericPrice(cells.eq(1).text());
        if (/^1\s*gram$/i.test(label) && todayVal) {
          gram22k = todayVal;
          const chgText = cells.eq(3).text();
          const chgVal = parseNumericPrice(chgText);
          if (chgVal !== null) {
            changeGram = /▼|-/.test(chgText) ? -chgVal : /▲|\+/.test(chgText) ? chgVal : 0;
          }
        } else if (/pavan|8\s*grams/i.test(label) && todayVal) {
          pavan22k = todayVal;
        }
      });

    const bodyText = $('body').text().replace(/\s+/g, ' ');
    const m24 = bodyText.match(/24K[^₹]{0,30}₹\s*([\d,]{4,6})/i);
    const m18 = bodyText.match(/18K[^₹]{0,30}₹\s*([\d,]{4,6})/i);
    if (!gram22k && pavan22k) gram22k = round2(pavan22k / 8);
    if (gram22k && gram22k > 3000 && gram22k < 50000) {
      return {
        gram22k,
        pavan22k: pavan22k || gram22k * 8,
        gram24k: m24 ? Number(m24[1].replace(/,/g, '')) : undefined,
        gram18k: m18 ? Number(m18[1].replace(/,/g, '')) : undefined,
        changeGram,
      };
    }
    return null;
  }

  if (id === 'goodreturns') {
    let gram24k: number | undefined;
    let gram22k: number | null = null;
    let gram18k: number | undefined;
    let pavan22k: number | undefined;
    $('table')
      .first()
      .find('tr')
      .each((_, tr) => {
        const cells = $(tr).find('td');
        if (cells.length < 4) return;
        const wt = cells.eq(0).text().trim();
        if (wt === '1') {
          gram24k = parseNumericPrice(cells.eq(1).text()) || undefined;
          gram22k = parseNumericPrice(cells.eq(2).text());
          gram18k = parseNumericPrice(cells.eq(3).text()) || undefined;
        } else if (wt === '8') {
          pavan22k = parseNumericPrice(cells.eq(2).text()) || undefined;
        }
      });
    if (gram22k && gram22k > 3000 && gram22k < 50000) {
      return {gram22k, pavan22k: pavan22k || gram22k * 8, gram24k, gram18k};
    }
    return null;
  }

  if (id === 'groww') {
    const nextScript = $('#__NEXT_DATA__').text();
    if (nextScript) {
      try {
        const parsed = JSON.parse(nextScript);
        const kerala = parsed?.props?.pageProps?.goldRateData?.physicalGoldRate?.kerala;
        const g22 = Number(kerala?.price?.TWENTY_TWO);
        const g24 = Number(kerala?.price?.TWENTY_FOUR);
        const g18 = Number(kerala?.price?.EIGHTEEN);
        if (Number.isFinite(g22) && g22 > 3000 && g22 < 50000) {
          return {
            gram22k: g22,
            pavan22k: g22 * 8,
            gram24k: Number.isFinite(g24) ? g24 : undefined,
            gram18k: Number.isFinite(g18) ? g18 : undefined,
          };
        }
      } catch {
        // fallback to table below
      }
    }
    let gram22k: number | null = null;
    $('table')
      .first()
      .find('tr')
      .each((_, tr) => {
        const cells = $(tr).find('td');
        if (cells.length >= 4 && /1\s*gram/i.test(cells.eq(0).text())) {
          gram22k = parseNumericPrice(cells.eq(2).text());
        }
      });
    if (gram22k && gram22k > 3000 && gram22k < 50000) {
      return {gram22k, pavan22k: gram22k * 8};
    }
    return null;
  }

  if (id === 'bankbazaar') {
    let gram22k: number | null = null;
    let pavan22k: number | undefined;
    let changeGram: number | undefined;
    $('table')
      .first()
      .find('tr')
      .each((_, tr) => {
        const cells = $(tr).find('td');
        if (cells.length < 3) return;
        const label = cells.eq(0).text().trim();
        if (/^1\s*gram$/i.test(label)) {
          gram22k = parseNumericPrice(cells.eq(1).text());
          const chgText = cells.eq(3).text();
          const chg = parseNumericPrice(chgText);
          if (chg !== null) {
            changeGram = /▼|-/.test(chgText) ? -chg : /▲|\+/.test(chgText) ? chg : 0;
          }
        } else if (/^8\s*grams?$/i.test(label)) {
          pavan22k = parseNumericPrice(cells.eq(1).text()) || undefined;
        }
      });
    if (gram22k && gram22k > 3000 && gram22k < 50000) {
      return {gram22k, pavan22k: pavan22k || gram22k * 8, changeGram};
    }
    return null;
  }

  if (id === 'josalukkas') {
    const m22 = html.match(/22KT[^0-9]{1,8}(\d{4,6})/);
    const m24 = html.match(/24KT[^0-9]{1,8}(\d{4,6})/);
    const m18 = html.match(/18KT[^0-9]{1,8}(\d{4,6})/);
    const g22 = m22 ? Number(m22[1]) : null;
    if (g22 && g22 > 3000 && g22 < 50000) {
      return {
        gram22k: g22,
        pavan22k: g22 * 8,
        gram24k: m24 ? Number(m24[1]) : undefined,
        gram18k: m18 ? Number(m18[1]) : undefined,
      };
    }
    return null;
  }

  if (id === 'kalyan') {
    let gram22k: number | null = null;
    let gram24k: number | undefined;
    let gram18k: number | undefined;
    $('table').each((_, table) => {
      const heading = $(table).find('tr').first().text();
      const g1Cell = $(table)
        .find('tr')
        .filter((__, tr) => /^1\s*gm$/i.test($(tr).find('td').eq(0).text().trim()))
        .first()
        .find('td')
        .eq(1)
        .text();
      const val = parseNumericPrice(g1Cell);
      if (!val) return;
      if (/22k/i.test(heading)) gram22k = val;
      else if (/24k/i.test(heading)) gram24k = val;
      else if (/18k/i.test(heading)) gram18k = val;
    });
    if (gram22k && gram22k > 3000 && gram22k < 50000) {
      return {gram22k, pavan22k: gram22k * 8, gram24k, gram18k};
    }
    return null;
  }

  if (id === 'toi') {
    const bodyText = $('body').text().replace(/\s+/g, ' ');
    const m22 = bodyText.match(/22K\s*gold\/gm\s*₹\s*([\d,]+)/i);
    const m24 = bodyText.match(/24K\s*gold\/gm\s*₹\s*([\d,]+)/i);
    const m18 = bodyText.match(/18K\s*gold\/gm\s*₹\s*([\d,]+)/i);
    const g22 = m22 ? Number(m22[1].replace(/,/g, '')) : null;
    if (g22 && g22 > 3000 && g22 < 50000) {
      return {
        gram22k: g22,
        pavan22k: g22 * 8,
        gram24k: m24 ? Number(m24[1].replace(/,/g, '')) : undefined,
        gram18k: m18 ? Number(m18[1].replace(/,/g, '')) : undefined,
      };
    }
  }

  return null;
}

async function probeSecondarySource(id: SecondarySourceId): Promise<{
  probe: SourceProbeResult;
  extracted?: SecondaryExtraction;
}> {
  const cfg = SECONDARY_CONFIGS[id];
  const start = Date.now();
  try {
    const res = await fetchTextWithTimeout(cfg.url, 8000);
    const latencyMs = Date.now() - start;

    if (res.status === 403 || /cf-browser-verification|just a moment|attention required/i.test(res.text.slice(0, 4000))) {
      return {
        probe: {
          id,
          name: cfg.name,
          url: cfg.url,
          status: 'blocked',
          httpStatus: res.status,
          latencyMs,
          detail: 'Bot challenge protection (403)',
          supportsHistory: cfg.supportsHistory,
        },
      };
    }

    if (!res.ok) {
      return {
        probe: {
          id,
          name: cfg.name,
          url: cfg.url,
          status: 'unavailable',
          httpStatus: res.status,
          latencyMs,
          detail: `HTTP ${res.status}`,
          supportsHistory: cfg.supportsHistory,
        },
      };
    }

    const extracted = extractRatesForSecondary(id, res.text);
    if (extracted) {
      let historyEntries: DailyRateEntry[] | undefined;
      if (id === 'livegoldkerala') {
        try {
          const histRes = await fetchTextWithTimeout('https://www.livegoldkerala.com/gold-rate-history', 6000);
          if (histRes.ok) {
            historyEntries = parseLiveGoldKeralaHistoryHtml(histRes.text);
          }
        } catch {
          // Live rate still succeeds without history fetch
        }
      }

      return {
        probe: {
          id,
          name: cfg.name,
          url: cfg.url,
          status: 'online',
          httpStatus: res.status,
          latencyMs,
          detail: `22K ₹${extracted.gram22k.toLocaleString('en-IN')}/g · Pavan ₹${(extracted.pavan22k || extracted.gram22k * 8).toLocaleString('en-IN')}`,
          supportsHistory: cfg.supportsHistory,
        },
        extracted: {...extracted, historyEntries},
      };
    }

    return {
      probe: {
        id,
        name: cfg.name,
        url: cfg.url,
        status: 'spa-only',
        httpStatus: res.status,
        latencyMs,
        detail: 'Rate table requires client-side rendering',
        supportsHistory: cfg.supportsHistory,
      },
    };
  } catch (err) {
    return {
      probe: {
        id,
        name: cfg.name,
        url: cfg.url,
        status: 'error',
        latencyMs: Date.now() - start,
        detail: err instanceof Error ? err.message : 'Request timed out',
        supportsHistory: cfg.supportsHistory,
      },
    };
  }
}

const SECONDARY_ORDER: SecondarySourceId[] = [
  'livegoldkerala',
  'goodreturns',
  'groww',
  'bankbazaar',
  'josalukkas',
  'kalyan',
  'toi',
];

function buildResponseFromSecondary(
  id: SecondarySourceId,
  probe: SourceProbeResult,
  extracted: SecondaryExtraction,
  chain: SourceProbeResult[],
  fallbackUsed: boolean,
  baseKgData?: LatestGoldResponse,
): LatestGoldResponse {
  const gram22k = extracted.gram22k;
  const pavan22k = extracted.pavan22k || gram22k * 8;
  const gram24kEstimate = extracted.gram24k || Math.round(gram22k * (24 / 22));
  const pavan24kEstimate = gram24kEstimate * 8;
  const gram18kEstimate = extracted.gram18k || Math.round(gram22k * (18 / 22));

  const entries =
    extracted.historyEntries && extracted.historyEntries.length > 0
      ? extracted.historyEntries
      : baseKgData?.entries || [];

  const latestFromEntries = entries[entries.length - 1];
  const changeGram = extracted.changeGram ?? latestFromEntries?.changeGram ?? baseKgData?.current.changeGram ?? 0;
  const changePavan = changeGram !== 0 ? changeGram * 8 : latestFromEntries?.changePavan ?? baseKgData?.current.changePavan ?? 0;

  let monthlyHigh = baseKgData?.monthlyHigh || null;
  let monthlyLow = baseKgData?.monthlyLow || null;
  if (extracted.historyEntries && extracted.historyEntries.length > 0) {
    const maxE = extracted.historyEntries.reduce((a, b) => (b.pavan > a.pavan ? b : a));
    const minE = extracted.historyEntries.reduce((a, b) => (b.pavan < a.pavan ? b : a));
    monthlyHigh = {pavan: maxE.pavan, gram: maxE.gram, dateLabel: maxE.dateLabel};
    monthlyLow = {pavan: minE.pavan, gram: minE.gram, dateLabel: minE.dateLabel};
  }

  return {
    source: id,
    sourceName: probe.name,
    sourceUrl: probe.url,
    fallbackUsed,
    fallbackChain: chain,
    fetchedAt: new Date().toISOString(),
    serverLastModified: baseKgData?.serverLastModified || null,
    updatedTimeIst: baseKgData?.updatedTimeIst || formatIstFromHeader(null),
    scheduleLabel: baseKgData?.scheduleLabel || 'Live Board Rate',
    monthLabel:
      baseKgData?.monthLabel || new Date().toLocaleString('en-US', {month: 'long', year: 'numeric'}),
    year: baseKgData?.year || new Date().getFullYear(),
    monthKey: baseKgData?.monthKey || MONTHS[new Date().getMonth()],
    current: {
      dateLabel:
        baseKgData?.current.dateLabel ||
        new Date().toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: '2-digit'}),
      session: baseKgData?.current.session || 'Daily',
      gram22k,
      pavan22k,
      gram24kEstimate,
      pavan24kEstimate,
      gram18kEstimate,
      changePavan,
      changeGram,
      changePercent:
        pavan22k > 0 ? round2((changePavan / pavan22k) * 100) : baseKgData?.current.changePercent || 0,
      direction: computeDirection(changePavan),
      trendLabel:
        changePavan > 0
          ? 'Upward'
          : changePavan < 0
            ? 'Downward'
            : baseKgData?.current.trendLabel || 'Steady',
    },
    monthlyHigh,
    monthlyLow,
    entries,
  };
}

const latestCache = new Map<string, {data: LatestGoldResponse; cachedAt: number}>();
const LATEST_CACHE_TTL_MS = 45_000;

export async function getLatestGoldWithFallback(
  preferred: PreferredSource = 'auto',
  includeProbes = false,
): Promise<LatestGoldResponse> {
  const cacheKey = `${preferred}:${includeProbes ? 'probes' : 'fast'}`;
  const cached = latestCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < LATEST_CACHE_TTL_MS) {
    return cached.data;
  }

  const chain: SourceProbeResult[] = [];

  if (preferred !== 'auto' && preferred !== 'keralagold') {
    const [secondary, kg] = await Promise.all([
      probeSecondarySource(preferred),
      probeKeralaGold(),
    ]);
    chain.push(secondary.probe, kg.probe);

    if (secondary.extracted) {
      const result = buildResponseFromSecondary(
        preferred,
        secondary.probe,
        secondary.extracted,
        chain,
        false,
        kg.data,
      );
      latestCache.set(cacheKey, {data: result, cachedAt: Date.now()});
      return result;
    }

    if (kg.data) {
      const result: LatestGoldResponse = {
        ...kg.data,
        fallbackUsed: true,
        fallbackChain: chain,
      };
      latestCache.set(cacheKey, {data: result, cachedAt: Date.now()});
      return result;
    }

    if (cached) return cached.data;
    throw new Error(`Preferred source ${preferred} and primary source are currently unreachable.`);
  }

  const kg = await probeKeralaGold();
  chain.push(kg.probe);

  if (includeProbes || !kg.data) {
    const secondaryResults = await Promise.all(SECONDARY_ORDER.map((id) => probeSecondarySource(id)));
    for (const r of secondaryResults) chain.push(r.probe);

    if (!kg.data) {
      const healthy = secondaryResults.find((r) => r.extracted);
      if (healthy?.extracted) {
        const result = buildResponseFromSecondary(
          healthy.probe.id as SecondarySourceId,
          healthy.probe,
          healthy.extracted,
          chain,
          true,
        );
        latestCache.set(cacheKey, {data: result, cachedAt: Date.now()});
        return result;
      }
      if (cached) return cached.data;
      throw new Error('All configured Kerala gold rate sources are currently unreachable.');
    }
  }

  const result: LatestGoldResponse = {
    ...kg.data,
    fallbackChain: chain,
  };
  latestCache.set(cacheKey, {data: result, cachedAt: Date.now()});
  return result;
}

let probesCache: {data: SourceProbeResult[]; cachedAt: number} | null = null;
const PROBES_CACHE_TTL_MS = 120_000;

export async function getAllSourceProbes(): Promise<SourceProbeResult[]> {
  if (probesCache && Date.now() - probesCache.cachedAt < PROBES_CACHE_TTL_MS) {
    return probesCache.data;
  }
  const [kg, ...secondaries] = await Promise.all([
    probeKeralaGold(),
    ...SECONDARY_ORDER.map((id) => probeSecondarySource(id)),
  ]);
  const results = [kg.probe, ...secondaries.map((s) => s.probe)];
  probesCache = {data: results, cachedAt: Date.now()};
  return results;
}

const historyServerCache = new Map<string, {data: HistoryResponse; cachedAt: number}>();
const HISTORY_SERVER_TTL_MS = 300_000;

export async function getGoldHistory(params: {
  mode: 'daily' | 'monthly' | 'yearly';
  year?: number;
  month?: string;
}): Promise<HistoryResponse> {
  const {mode} = params;
  const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const currentYear = nowIst.getUTCFullYear();
  const currentMonth = nowIst.toLocaleString('en-US', {month: 'long', timeZone: 'UTC'}).toLowerCase();

  const targetYear = params.year || currentYear;
  const targetMonth = (params.month || currentMonth).toLowerCase();
  const hKey = `${mode}:${targetYear}:${targetMonth}`;
  const cachedH = historyServerCache.get(hKey);
  if (cachedH && Date.now() - cachedH.cachedAt < HISTORY_SERVER_TTL_MS) {
    return cachedH.data;
  }

  if (historyServerCache.size > 48) {
    const oldestKey = historyServerCache.keys().next().value;
    if (oldestKey) historyServerCache.delete(oldestKey);
  }

  if (mode === 'yearly') {
    const url = 'https://www.keralagold.com/yearly-gold-prices.htm';
    const res = await fetchTextWithTimeout(url, 8000);
    if (!res.ok) throw new Error(`Failed to fetch yearly history (HTTP ${res.status})`);
    const parsed = parseYearlyHtml(res.text);
    const out: HistoryResponse = {
      mode: 'yearly',
      title: 'Kerala Gold Yearly Price History (1925 – Present)',
      subtitle: 'Annual 31-March benchmark prices per Pavan (8g, 22K) and per Gram',
      sourceName: 'KeralaGold.com',
      sourceUrl: url,
      fetchedAt: new Date().toISOString(),
      serverLastModified: res.lastModified,
      high: parsed.high,
      low: parsed.low,
      yearlyEntries: parsed.entries,
    };
    historyServerCache.set(hKey, {data: out, cachedAt: Date.now()});
    return out;
  }

  if (mode === 'monthly') {
    const primaryUrl = 'https://www.keralagold.com/monthly-gold-prices.htm';
    const archiveUrl = `https://www.keralagold.com/monthly-gold-prices-${targetYear}.htm`;

    let res = await fetchTextWithTimeout(targetYear >= currentYear ? primaryUrl : archiveUrl, 8000);
    let usedUrl = targetYear >= currentYear ? primaryUrl : archiveUrl;

    if (!res.ok && targetYear < currentYear) {
      res = await fetchTextWithTimeout(primaryUrl, 8000);
      usedUrl = primaryUrl;
    }

    if (!res.ok) throw new Error(`Monthly archive for ${targetYear} unavailable (HTTP ${res.status})`);
    const parsed = parseMonthlyHtml(res.text);
    const out: HistoryResponse = {
      mode: 'monthly',
      title: `Monthly Gold Price Summary (${targetYear})`,
      subtitle: 'Mid-month (15th) benchmark prices for 1 Pavan & 1 Gram in Kerala',
      sourceName: 'KeralaGold.com',
      sourceUrl: usedUrl,
      fetchedAt: new Date().toISOString(),
      serverLastModified: res.lastModified,
      high: parsed.high,
      low: parsed.low,
      monthlyEntries: parsed.entries,
    };
    historyServerCache.set(hKey, {data: out, cachedAt: Date.now()});
    return out;
  }

  // Daily archive for a given month + year
  const archiveUrl = `https://www.keralagold.com/daily-gold-prices-${targetMonth}-${targetYear}.htm`;

  try {
    let res = await fetchTextWithTimeout(archiveUrl, 8000);
    let usedUrl = archiveUrl;

    if (res.status === 404) {
      const liveRes = await fetchTextWithTimeout('https://www.keralagold.com/daily-gold-prices.htm', 8000);
      if (liveRes.ok) {
        const checkParsed = parseDailyHtml(liveRes.text);
        if (checkParsed.monthKey === targetMonth && checkParsed.year === targetYear) {
          res = liveRes;
          usedUrl = 'https://www.keralagold.com/daily-gold-prices.htm';
        }
      }
    }

    if (res.ok) {
      const parsed = parseDailyHtml(res.text);
      const prettyMonth = targetMonth.charAt(0).toUpperCase() + targetMonth.slice(1);
      const out: HistoryResponse = {
        mode: 'daily',
        title: `Daily Gold Prices — ${prettyMonth} ${targetYear}`,
        subtitle: `${parsed.entries.length} recorded updates including morning/evening revisions`,
        sourceName: 'KeralaGold.com',
        sourceUrl: usedUrl,
        fetchedAt: new Date().toISOString(),
        serverLastModified: res.lastModified,
        high: parsed.monthlyHigh
          ? {pavan: parsed.monthlyHigh.pavan, gram: parsed.monthlyHigh.gram, label: parsed.monthlyHigh.dateLabel}
          : null,
        low: parsed.monthlyLow
          ? {pavan: parsed.monthlyLow.pavan, gram: parsed.monthlyLow.gram, label: parsed.monthlyLow.dateLabel}
          : null,
        dailyEntries: parsed.entries,
      };
      historyServerCache.set(hKey, {data: out, cachedAt: Date.now()});
      return out;
    }
  } catch {
    // Fall through to LiveGoldKerala daily archive fallback if current month/year
  }

  // Fallback to LiveGoldKerala daily archive for recent daily prices
  const lgkUrl = 'https://www.livegoldkerala.com/gold-rate-history';
  const lgkRes = await fetchTextWithTimeout(lgkUrl, 8000);
  if (lgkRes.ok) {
    const entries = parseLiveGoldKeralaHistoryHtml(lgkRes.text);
    if (entries.length > 0) {
      const maxE = entries.reduce((a, b) => (b.pavan > a.pavan ? b : a));
      const minE = entries.reduce((a, b) => (b.pavan < a.pavan ? b : a));
      const out: HistoryResponse = {
        mode: 'daily',
        title: `Daily Gold Prices — Recent Archive`,
        subtitle: `${entries.length} daily records via LiveGoldKerala.com fallback`,
        sourceName: 'LiveGoldKerala.com',
        sourceUrl: lgkUrl,
        fetchedAt: new Date().toISOString(),
        serverLastModified: lgkRes.lastModified,
        high: {pavan: maxE.pavan, gram: maxE.gram, label: maxE.dateLabel},
        low: {pavan: minE.pavan, gram: minE.gram, label: minE.dateLabel},
        dailyEntries: entries,
      };
      historyServerCache.set(hKey, {data: out, cachedAt: Date.now()});
      return out;
    }
  }

  if (cachedH) return cachedH.data;
  throw new Error(`Archive for ${targetMonth} ${targetYear} is not currently available.`);
}

let spotMarketCache: {data: LiveSpotMarketData; cachedAt: number} | null = null;
const SPOT_CACHE_TTL_MS = 60_000;

export async function getLiveSpotMarket(): Promise<LiveSpotMarketData> {
  if (spotMarketCache && Date.now() - spotMarketCache.cachedAt < SPOT_CACHE_TTL_MS) {
    return spotMarketCache.data;
  }

  const url = 'https://www.livepriceofgold.com/india-gold-price.html';
  let res: {ok: boolean; status: number; text: string; lastModified: string | null; redirectedUrl: string};
  try {
    try {
      res = await fetchTextWithTimeout(url, 9000);
    } catch {
      res = await fetchTextWithTimeout(url, 9000);
    }
    if (!res.ok) {
      throw new Error(`Spot feed unavailable (HTTP ${res.status})`);
    }
  } catch (err) {
    if (spotMarketCache) {
      return spotMarketCache.data;
    }
    throw err;
  }

  const $ = cheerio.load(res.text);
  const t0 = $('table').eq(0);
  const t0Header = t0.find('tr').first().text().replace(/\s+/g, ' ');
  const pctMatch = t0Header.match(/([+-]?\d+(?:\.\d+)?)%/);
  const spotChangePercent = pctMatch ? Number(pctMatch[1]) : 0;

  let spot24kGramInr = 0;
  let spot22kGramInr = 0;
  let spotOzInr = 0;

  t0.find('tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 3) return;
    const label = cells.eq(1).text().replace(/\s+/g, ' ').trim();
    const val = parseNumericPrice(cells.eq(2).text());
    if (!val) return;
    if (/24K\s*Gold\/gram/i.test(label)) spot24kGramInr = val;
    else if (/22K\s*Gold\/gram/i.test(label)) spot22kGramInr = val;
    else if (/Spot\s*Gold\/oz/i.test(label)) spotOzInr = val;
  });

  let usdInr = 0;
  let usdInrChangePercent = 0;
  $('table')
    .eq(1)
    .find('tr')
    .each((_, tr) => {
      const cells = $(tr).find('td');
      if (cells.length < 3) return;
      const label = cells.eq(1).text().replace(/\s+/g, ' ').trim();
      if (/USD\/INR/i.test(label)) {
        const um = label.match(/([+-]?\d+(?:\.\d+)?)%/);
        usdInrChangePercent = um ? Number(um[1]) : 0;
        usdInr = parseNumericPrice(cells.eq(2).text()) || 0;
      }
    });

  let dayHigh24kGram: number | null = null;
  let dayLow24kGram: number | null = null;
  $('table')
    .eq(2)
    .find('tr')
    .each((_, tr) => {
      const cells = $(tr).find('td');
      if (cells.length < 4) return;
      const label = cells.eq(0).text().replace(/\s+/g, ' ').trim();
      if (/1\s*GRAM\s*GOLD\s*24K/i.test(label)) {
        dayHigh24kGram = parseNumericPrice(cells.eq(2).text());
        dayLow24kGram = parseNumericPrice(cells.eq(3).text());
      }
    });

  if (!spot24kGramInr || !spot22kGramInr) {
    if (spotMarketCache) return spotMarketCache.data;
    throw new Error('Could not parse live international spot rates.');
  }

  const parsed: LiveSpotMarketData = {
    sourceName: 'LivePriceOfGold.com',
    sourceUrl: url,
    fetchedAt: new Date().toISOString(),
    spot24kGramInr,
    spot22kGramInr,
    spotOzInr,
    spotChangePercent,
    usdInr,
    usdInrChangePercent,
    dayHigh24kGram,
    dayLow24kGram,
  };
  spotMarketCache = {data: parsed, cachedAt: Date.now()};
  return parsed;
}

