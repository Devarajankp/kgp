import fs from 'fs';
import path from 'path';
import {buildOpenApiSpec, buildShortcutPayload} from '../server/apiUtils.ts';
import {getGoldHistory, getLatestGoldWithFallback, getLiveSpotMarket} from '../server/goldService.ts';
import type {HistoryResponse, LatestGoldResponse} from '../src/types/gold.ts';

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

const HISTORY_START_YEAR = 2009;
const MONTHLY_START_YEAR = 2020;

function getCurrentIstYearMonth(): {year: number; monthIndex: number; monthKey: string} {
  const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const year = nowIst.getUTCFullYear();
  const monthIndex = nowIst.getUTCMonth();
  return {
    year,
    monthIndex,
    monthKey: MONTHS[monthIndex],
  };
}

function buildDailyHistoryFromLatest(latest: LatestGoldResponse): HistoryResponse {
  return {
    mode: 'daily',
    title: `Daily Gold Prices — ${latest.monthLabel}`,
    subtitle: `${latest.entries.length} recorded updates including morning/evening revisions`,
    sourceName: latest.sourceName,
    sourceUrl: latest.sourceUrl,
    fetchedAt: latest.fetchedAt,
    serverLastModified: latest.serverLastModified,
    high: latest.monthlyHigh
      ? {
          pavan: latest.monthlyHigh.pavan,
          gram: latest.monthlyHigh.gram,
          label: latest.monthlyHigh.dateLabel,
        }
      : null,
    low: latest.monthlyLow
      ? {
          pavan: latest.monthlyLow.pavan,
          gram: latest.monthlyLow.gram,
          label: latest.monthlyLow.dateLabel,
        }
      : null,
    dailyEntries: latest.entries,
  };
}

function hasValidNonEmptyJson(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    const raw = fs.readFileSync(filePath, 'utf8');
    if (raw.length < 30) return false;
    const parsed = JSON.parse(raw) as HistoryResponse;
    if (parsed.mode === 'daily') return Array.isArray(parsed.dailyEntries) && parsed.dailyEntries.length > 0;
    if (parsed.mode === 'monthly') return Array.isArray(parsed.monthlyEntries) && parsed.monthlyEntries.length > 0;
    if (parsed.mode === 'yearly') return Array.isArray(parsed.yearlyEntries) && parsed.yearlyEntries.length > 0;
    return false;
  } catch {
    return false;
  }
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({length: Math.min(concurrency, items.length)}, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      await worker(items[idx]);
    }
  });
  await Promise.all(runners);
}

async function syncStaticApiFiles() {
  const forceAll = process.argv.includes('--all');
  const ist = getCurrentIstYearMonth();

  const [latest, monthlyCurrent, yearly, spot] = await Promise.all([
    getLatestGoldWithFallback('auto', true, true),
    getGoldHistory({mode: 'monthly', year: ist.year}),
    getGoldHistory({mode: 'yearly'}),
    getLiveSpotMarket().catch(() => null),
  ]);

  const dataDir = path.resolve(process.cwd(), 'public/data');
  const apiDir = path.resolve(process.cwd(), 'public/api');
  const historyDir = path.join(apiDir, 'history');
  fs.mkdirSync(dataDir, {recursive: true});
  fs.mkdirSync(apiDir, {recursive: true});
  fs.mkdirSync(historyDir, {recursive: true});

  fs.writeFileSync(
    path.join(dataDir, 'kerala-gold-snapshot.json'),
    JSON.stringify({latest, monthly: monthlyCurrent, yearly}, null, 2),
  );

  fs.writeFileSync(path.join(apiDir, 'latest.json'), JSON.stringify(latest, null, 2));
  fs.writeFileSync(
    path.join(apiDir, 'shortcut.json'),
    JSON.stringify(buildShortcutPayload(latest, spot), null, 2),
  );
  if (spot) {
    fs.writeFileSync(path.join(apiDir, 'spot.json'), JSON.stringify(spot, null, 2));
  }
  fs.writeFileSync(
    path.join(apiDir, 'openapi.json'),
    JSON.stringify(buildOpenApiSpec('https://localhost:3000'), null, 2),
  );

  // 1. Yearly static archive (always refreshed)
  fs.writeFileSync(path.join(historyDir, 'yearly.json'), JSON.stringify(yearly));

  // 2. Monthly static archives (2020..currentYear)
  fs.writeFileSync(path.join(historyDir, `monthly-${ist.year}.json`), JSON.stringify(monthlyCurrent));
  const pastMonthlyYears: number[] = [];
  for (let y = MONTHLY_START_YEAR; y < ist.year; y++) {
    const outPath = path.join(historyDir, `monthly-${y}.json`);
    if (forceAll || !hasValidNonEmptyJson(outPath)) {
      pastMonthlyYears.push(y);
    }
  }
  await runPool(pastMonthlyYears, 4, async (year) => {
    try {
      const data = await getGoldHistory({mode: 'monthly', year});
      if (data.monthlyEntries && data.monthlyEntries.length > 0) {
        fs.writeFileSync(path.join(historyDir, `monthly-${year}.json`), JSON.stringify(data));
      }
    } catch {
      // Skip unavailable historical year cleanly
    }
  });

  // 3. Daily static archives (always refresh current month + prior month; fill missing older months)
  const prevMonthYear = ist.monthIndex === 0 ? ist.year - 1 : ist.year;
  const prevMonthKey = MONTHS[ist.monthIndex === 0 ? 11 : ist.monthIndex - 1];

  // Current active month combines live consensus rate from latest if month matches
  if (latest.year === ist.year && latest.monthKey.toLowerCase() === ist.monthKey && latest.entries.length > 0) {
    fs.writeFileSync(
      path.join(historyDir, `${ist.year}-${ist.monthKey}.json`),
      JSON.stringify(buildDailyHistoryFromLatest(latest)),
    );
  } else {
    try {
      const currDaily = await getGoldHistory({mode: 'daily', year: ist.year, month: ist.monthKey});
      if (currDaily.dailyEntries && currDaily.dailyEntries.length > 0) {
        fs.writeFileSync(path.join(historyDir, `${ist.year}-${ist.monthKey}.json`), JSON.stringify(currDaily));
      }
    } catch {
      // Skip if current month failed
    }
  }

  // Always keep previous month fresh in case final day revision landed near month boundary
  try {
    const prevDaily = await getGoldHistory({mode: 'daily', year: prevMonthYear, month: prevMonthKey});
    if (prevDaily.dailyEntries && prevDaily.dailyEntries.length > 0) {
      fs.writeFileSync(path.join(historyDir, `${prevMonthYear}-${prevMonthKey}.json`), JSON.stringify(prevDaily));
    }
  } catch {
    // Ignore if unavailable
  }

  const dailyTasks: Array<{year: number; month: string}> = [];
  for (let year = HISTORY_START_YEAR; year <= ist.year; year++) {
    const maxMonth = year === ist.year ? ist.monthIndex : 11;
    for (let m = 0; m <= maxMonth; m++) {
      const month = MONTHS[m];
      if (year === ist.year && m === ist.monthIndex) continue;
      if (year === prevMonthYear && month === prevMonthKey) continue;
      const outPath = path.join(historyDir, `${year}-${month}.json`);
      if (forceAll || !hasValidNonEmptyJson(outPath)) {
        dailyTasks.push({year, month});
      }
    }
  }

  let syncedOlderCount = 0;
  await runPool(dailyTasks, 6, async ({year, month}) => {
    try {
      const daily = await getGoldHistory({mode: 'daily', year, month});
      if (daily.dailyEntries && daily.dailyEntries.length > 0) {
        fs.writeFileSync(path.join(historyDir, `${year}-${month}.json`), JSON.stringify(daily));
        syncedOlderCount++;
      }
    } catch {
      // Older months without an archive on source (e.g. early 2009) are skipped gracefully
    }
  });

  // 4. Write archive manifest listing available static files
  const availableMonthlyYears: number[] = [];
  const availableDailyByYear: Record<string, string[]> = {};
  for (const file of fs.readdirSync(historyDir)) {
    const monthlyMatch = file.match(/^monthly-(\d{4})\.json$/);
    if (monthlyMatch) {
      availableMonthlyYears.push(Number(monthlyMatch[1]));
      continue;
    }
    const dailyMatch = file.match(/^(\d{4})-([a-z]+)\.json$/);
    if (dailyMatch) {
      const [, y, m] = dailyMatch;
      if (!availableDailyByYear[y]) availableDailyByYear[y] = [];
      availableDailyByYear[y].push(m);
    }
  }
  availableMonthlyYears.sort((a, b) => b - a);
  for (const y of Object.keys(availableDailyByYear)) {
    availableDailyByYear[y].sort(
      (a, b) => MONTHS.indexOf(a as (typeof MONTHS)[number]) - MONTHS.indexOf(b as (typeof MONTHS)[number]),
    );
  }

  fs.writeFileSync(
    path.join(historyDir, 'manifest.json'),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        currentYear: ist.year,
        currentMonth: ist.monthKey,
        monthlyYears: availableMonthlyYears,
        dailyByYear: availableDailyByYear,
      },
      null,
      2,
    ),
  );

  console.log(
    `Synced static PWA & History snapshots: ${latest.current.dateLabel} · Pavan ₹${latest.current.pavan22k} (${syncedOlderCount} backfilled months, ${Object.keys(availableDailyByYear).length} daily years)`,
  );
}

syncStaticApiFiles().catch((err) => {
  console.error('Failed to sync static API files:', err);
  process.exit(1);
});
