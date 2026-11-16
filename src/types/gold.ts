export type SourceId =
  | 'keralagold'
  | 'livegoldkerala'
  | 'goodreturns'
  | 'groww'
  | 'bankbazaar'
  | 'josalukkas'
  | 'kalyan'
  | 'toi';

export type PreferredSource = 'auto' | SourceId;

export type PriceDirection = 'up' | 'down' | 'flat';

export type AppLanguage = 'en' | 'ml';

export interface DailyRateEntry {
  id: string;
  dateLabel: string;
  isoDate: string;
  session: string;
  isToday: boolean;
  isYesterday: boolean;
  pavan: number;
  gram: number;
  changePavan: number;
  changeGram: number;
  changePercent: number;
  direction: PriceDirection;
  note?: string;
}

export interface MonthlyRateEntry {
  id: string;
  month: string;
  dateLabel: string;
  pavan: number;
  gram: number;
  changePavan: number;
  changeGram: number;
  changePercent: number;
  direction: PriceDirection;
}

export interface YearlyRateEntry {
  id: string;
  year: number;
  dateLabel: string;
  pavan: number;
  gram: number;
  changePavan: number;
  changeGram: number;
  changePercent: number;
  direction: PriceDirection;
}

export interface SourceProbeResult {
  id: SourceId;
  name: string;
  url: string;
  status: 'online' | 'blocked' | 'unavailable' | 'spa-only' | 'error';
  httpStatus?: number;
  latencyMs: number;
  detail: string;
  supportsHistory: boolean;
}

export interface LatestGoldResponse {
  source: SourceId;
  sourceName: string;
  sourceUrl: string;
  fallbackUsed: boolean;
  fallbackChain: SourceProbeResult[];
  fetchedAt: string;
  serverLastModified: string | null;
  updatedTimeIst: string;
  scheduleLabel: string;
  monthLabel: string;
  year: number;
  monthKey: string;
  current: {
    dateLabel: string;
    session: string;
    gram22k: number;
    pavan22k: number;
    gram24kEstimate: number;
    pavan24kEstimate: number;
    gram18kEstimate: number;
    changePavan: number;
    changeGram: number;
    changePercent: number;
    direction: PriceDirection;
    trendLabel: string;
  };
  monthlyHigh: {
    pavan: number;
    gram: number;
    dateLabel: string;
  } | null;
  monthlyLow: {
    pavan: number;
    gram: number;
    dateLabel: string;
  } | null;
  entries: DailyRateEntry[];
}

export interface HistoryResponse {
  mode: 'daily' | 'monthly' | 'yearly';
  title: string;
  subtitle: string;
  sourceName: string;
  sourceUrl: string;
  fetchedAt: string;
  serverLastModified: string | null;
  high: {pavan: number; gram: number; label: string} | null;
  low: {pavan: number; gram: number; label: string} | null;
  dailyEntries?: DailyRateEntry[];
  monthlyEntries?: MonthlyRateEntry[];
  yearlyEntries?: YearlyRateEntry[];
}

export interface LiveSpotMarketData {
  sourceName: string;
  sourceUrl: string;
  fetchedAt: string;
  spot24kGramInr: number;
  spot22kGramInr: number;
  spotOzInr: number;
  spotChangePercent: number;
  usdInr: number;
  usdInrChangePercent: number;
  dayHigh24kGram: number | null;
  dayLow24kGram: number | null;
}

