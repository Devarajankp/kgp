var __esm = (fn, res, err) => () => {
  if (fn)
    try {
      res = fn(fn = 0);
    } catch (e) {
      err = [e];
    }
  if (err)
    throw err[0];
  return res;
};

// server/apiUtils.ts
function sanitizePreferredSource(raw) {
  const val = String(raw || "auto").toLowerCase().trim();
  return ALLOWED_SOURCES.has(val) ? val : "auto";
}
function sanitizeYear(raw) {
  if (raw === undefined || raw === null || raw === "")
    return;
  const num = Number(raw);
  if (!Number.isInteger(num))
    return;
  const maxYear = Math.max(2027, new Date().getFullYear() + 1);
  if (num < 1925 || num > maxYear)
    return;
  return num;
}
function sanitizeMonth(raw) {
  if (raw === undefined || raw === null || raw === "")
    return;
  const val = String(raw).toLowerCase().trim();
  return ALLOWED_MONTHS.has(val) ? val : undefined;
}
function clampFinite(raw, fallback, min, max) {
  const num = Number(raw);
  if (!Number.isFinite(num))
    return fallback;
  return Math.min(max, Math.max(min, num));
}
function formatInrServer(value) {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}
function apiSecurityAndCors(req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}
function createApiRateLimiter(maxRequestsPerMinute = 120) {
  const hits = new Map;
  const windowMs = 60000;
  return (req, res, next) => {
    const now = Date.now();
    if (hits.size > 2000) {
      for (const [k, v] of hits.entries()) {
        if (v.resetAt <= now)
          hits.delete(k);
      }
    }
    const fwd = req.headers["x-forwarded-for"];
    const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim() || req.socket?.remoteAddress || "unknown";
    const existing = hits.get(ip);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowMs;
      hits.set(ip, { count: 1, resetAt });
      res.setHeader("X-RateLimit-Limit", String(maxRequestsPerMinute));
      res.setHeader("X-RateLimit-Remaining", String(maxRequestsPerMinute - 1));
      res.setHeader("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
      next();
      return;
    }
    existing.count += 1;
    const remaining = Math.max(0, maxRequestsPerMinute - existing.count);
    res.setHeader("X-RateLimit-Limit", String(maxRequestsPerMinute));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(existing.resetAt / 1000)));
    if (existing.count > maxRequestsPerMinute) {
      res.status(429).json({
        error: "Rate limit exceeded. Please wait before sending more API requests.",
        retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000)
      });
      return;
    }
    next();
  };
}
function calculateJewelleryBreakdown(input, liveBase22kGram, liveDateLabel, liveSourceName) {
  const unit = input.unit === "gram" ? "gram" : "pavan";
  const purity = input.purity === "24k" || input.purity === "18k" ? input.purity : "22k";
  const purityFactor = purity === "24k" ? 24 / 22 : purity === "18k" ? 18 / 22 : 1;
  const weight = clampFinite(input.weight, 1, 0, 1e5);
  const totalGrams = unit === "pavan" ? weight * 8 : weight;
  const totalPavan = totalGrams / 8;
  const defaultRate = Math.round(liveBase22kGram * purityFactor);
  const ratePerGramUsed = input.ratePerGram !== undefined && Number(input.ratePerGram) > 0 ? clampFinite(input.ratePerGram, defaultRate, 1, 1e6) : defaultRate;
  const makingMode = input.makingMode === "perGram" || input.makingMode === "flat" ? input.makingMode : "percent";
  const defaultMakingVal = makingMode === "percent" ? 10 : makingMode === "perGram" ? 950 : 8000;
  const makingValue = clampFinite(input.makingValue, defaultMakingVal, 0, 1e7);
  const gstPercent = clampFinite(input.gstPercent, 3, 0, 50);
  const hallmarkFee = input.hallmark && totalGrams > 0 ? 45 : 0;
  const stoneCharge = clampFinite(input.stoneCharge, 0, 0, 1e7);
  const oldGoldDeduction = clampFinite(input.oldGoldDeduction, 0, 0, 1e7);
  const baseGoldValue = totalGrams * ratePerGramUsed;
  const makingCharge = makingMode === "percent" ? baseGoldValue * (makingValue / 100) : makingMode === "perGram" ? totalGrams * makingValue : makingValue;
  const taxableSubtotal = baseGoldValue + makingCharge + stoneCharge + hallmarkFee;
  const gstAmount = taxableSubtotal * (gstPercent / 100);
  const grossTotal = taxableSubtotal + gstAmount;
  const netPayable = Math.max(0, grossTotal - oldGoldDeduction);
  const effectivePerGram = totalGrams > 0 ? grossTotal / totalGrams : 0;
  let reverseBudgetEstimate = null;
  if (input.budget !== undefined && Number(input.budget) > 0) {
    const budgetInr = clampFinite(input.budget, 0, 0, 1e8);
    const preGst = budgetInr / (1 + gstPercent / 100);
    let gramsBuyable = 0;
    if (ratePerGramUsed > 0) {
      if (makingMode === "percent") {
        gramsBuyable = preGst / (ratePerGramUsed * (1 + makingValue / 100));
      } else if (makingMode === "perGram") {
        gramsBuyable = preGst / (ratePerGramUsed + makingValue);
      } else {
        gramsBuyable = Math.max(0, preGst - makingValue) / ratePerGramUsed;
      }
    }
    reverseBudgetEstimate = {
      budgetInr: Math.round(budgetInr),
      estimatedGrams: Math.round(gramsBuyable * 100) / 100,
      estimatedPavan: Math.round(gramsBuyable / 8 * 100) / 100
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
    reverseBudgetEstimate
  };
}
function buildShortcutPayload(latest, spot) {
  const { current } = latest;
  const arrow = current.direction === "up" ? "▲" : current.direction === "down" ? "▼" : "●";
  const colorEmoji = current.direction === "up" ? "\uD83D\uDFE2" : current.direction === "down" ? "\uD83D\uDD34" : "\uD83D\uDFE1";
  const trendColor = current.direction === "up" ? "green" : current.direction === "down" ? "red" : "amber";
  const chgText = current.changePavan === 0 ? "● No change" : `${arrow} ${current.changePavan > 0 ? "+" : "-"}₹${Math.abs(current.changePavan).toLocaleString("en-IN")}`;
  const chgGramText = current.changeGram === 0 ? "● 0" : `${arrow} ${current.changeGram > 0 ? "+" : "-"}₹${Math.abs(current.changeGram).toLocaleString("en-IN")}/g`;
  const recent5Days = (latest.entries || []).slice(-5).reverse().map((e) => ({
    date: e.dateLabel,
    session: e.session,
    pavan: e.pavan,
    gram: e.gram,
    changePavan: e.changePavan,
    changeGram: e.changeGram,
    direction: e.direction,
    trendSymbol: e.direction === "up" ? "▲" : e.direction === "down" ? "▼" : "●",
    colorEmoji: e.direction === "up" ? "\uD83D\uDFE2" : e.direction === "down" ? "\uD83D\uDD34" : "\uD83D\uDFE1"
  }));
  let outlookSignal = "steady";
  let outlookNote = "Global spot market is steady; normal buying conditions.";
  if (spot) {
    if (spot.spotChangePercent <= -0.4) {
      outlookSignal = "wait";
      outlookNote = `Global spot is softer (${spot.spotChangePercent.toFixed(2)}%); if flexible, check tomorrow's 9:30 AM IST fix.`;
    } else if (spot.spotChangePercent >= 0.4) {
      outlookSignal = "buy_lock";
      outlookNote = `Global spot is rising (+${spot.spotChangePercent.toFixed(2)}%); locking today's rate may help urgent buyers.`;
    }
  }
  const notificationTitle = `${colorEmoji} ${arrow} Kerala 22K Gold ${current.direction === "up" ? "Up" : current.direction === "down" ? "Down" : "Update"} · ${current.dateLabel}`;
  const notificationBody = `1 Pavan: ${formatInrServer(current.pavan22k)} (${chgText}) | ` + `1 Gram: ${formatInrServer(current.gram22k)} (${chgGramText}) · ${latest.scheduleLabel}`;
  const summaryText = `${notificationTitle}
${notificationBody}`;
  const summaryMalayalam = `${colorEmoji} ${arrow} കേരള 22K സ്വർണ്ണ വില (${current.dateLabel})
` + `1 പവൻ: ${formatInrServer(current.pavan22k)} (${chgText}) | 1 ഗ്രാം: ${formatInrServer(current.gram22k)} (${chgGramText})`;
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
    summaryMalayalam
  };
}
function buildOpenApiSpec(baseUrl) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Kerala Gold Price (KGP) API",
      version: "1.1.0",
      description: "CORS-enabled public JSON & text API for Kerala 22K/24K/18K gold rates, 1925–present historical archives, live global XAU/INR spot context, making-charge estimation, and Apple iPhone Shortcuts automation.",
      license: { name: "MIT" }
    },
    servers: [{ url: baseUrl }],
    paths: {
      "/api/health": {
        get: {
          summary: "API health check & active provider list",
          responses: { "200": { description: "Service healthy" } }
        }
      },
      "/api/gold/shortcut": {
        get: {
          summary: "Flat compact JSON or plain-text rate payload tailored for Apple iPhone Shortcuts & widgets",
          parameters: [
            { name: "format", in: "query", schema: { type: "string", enum: ["json", "text"] } },
            { name: "lang", in: "query", schema: { type: "string", enum: ["en", "ml"] } },
            { name: "source", in: "query", schema: { type: "string" } }
          ],
          responses: { "200": { description: "Flat JSON or plain text summary" } }
        }
      },
      "/api/gold/latest": {
        get: {
          summary: "Full latest Kerala gold rates + intraday/monthly entries + optional fallback probes",
          parameters: [
            { name: "source", in: "query", schema: { type: "string" } },
            { name: "probe", in: "query", schema: { type: "boolean" } }
          ],
          responses: { "200": { description: "LatestGoldResponse JSON" } }
        }
      },
      "/api/gold/history": {
        get: {
          summary: "Historical Kerala gold rates (daily since Nov 2009, monthly benchmarks, yearly 1925–present)",
          parameters: [
            { name: "mode", in: "query", schema: { type: "string", enum: ["daily", "monthly", "yearly"] } },
            { name: "year", in: "query", schema: { type: "integer", minimum: 1925 } },
            { name: "month", in: "query", schema: { type: "string" } }
          ],
          responses: { "200": { description: "HistoryResponse JSON" } }
        }
      },
      "/api/gold/spot": {
        get: {
          summary: "Live international XAU/INR & USD/INR bullion spot snapshot from LivePriceOfGold.com",
          responses: { "200": { description: "LiveSpotMarketData JSON" } }
        }
      },
      "/api/gold/sources": {
        get: {
          summary: "Live availability and latency check across all 8 Kerala gold providers",
          responses: { "200": { description: "Provider probes JSON" } }
        }
      },
      "/api/gold/calculate": {
        get: {
          summary: "Calculate jewellery making charges, GST, HUID hallmarking, and reverse budget weight via GET query params (ideal for Shortcuts)",
          parameters: [
            { name: "weight", in: "query", schema: { type: "number", default: 1 } },
            { name: "unit", in: "query", schema: { type: "string", enum: ["pavan", "gram"], default: "pavan" } },
            { name: "purity", in: "query", schema: { type: "string", enum: ["22k", "24k", "18k"], default: "22k" } },
            { name: "ratePerGram", in: "query", schema: { type: "number" } },
            { name: "makingMode", in: "query", schema: { type: "string", enum: ["percent", "perGram", "flat"], default: "percent" } },
            { name: "makingValue", in: "query", schema: { type: "number", default: 10 } },
            { name: "gst", in: "query", schema: { type: "number", default: 3 } },
            { name: "hallmark", in: "query", schema: { type: "boolean", default: false } },
            { name: "stone", in: "query", schema: { type: "number", default: 0 } },
            { name: "exchange", in: "query", schema: { type: "number", default: 0 } },
            { name: "budget", in: "query", schema: { type: "number" } }
          ],
          responses: { "200": { description: "Itemized jewellery bill breakdown JSON" } }
        },
        post: {
          summary: "Calculate jewellery making charges via JSON POST body",
          responses: { "200": { description: "Itemized jewellery bill breakdown JSON" } }
        }
      },
      "/api/gold/alert-check": {
        get: {
          summary: "Evaluate daily rate changes (1 Pavan & 1 Gram with color-coded trend symbols) and optional custom target price for iPhone Shortcuts & push pipelines",
          parameters: [
            { name: "target", in: "query", required: false, schema: { type: "number" } },
            { name: "unit", in: "query", schema: { type: "string", enum: ["pavan", "gram"], default: "pavan" } },
            { name: "direction", in: "query", schema: { type: "string", enum: ["below", "above"], default: "below" } },
            { name: "prevPavan", in: "query", schema: { type: "number" } },
            { name: "format", in: "query", schema: { type: "string", enum: ["json", "text"], default: "json" } },
            { name: "lang", in: "query", schema: { type: "string", enum: ["en", "ml"], default: "en" } }
          ],
          responses: { "200": { description: "Dual-unit alert evaluation JSON or plain-text notification" } }
        }
      }
    }
  };
}
var ALLOWED_SOURCES, ALLOWED_MONTHS, ALL_SOURCE_IDS;
var init_apiUtils = __esm(() => {
  ALLOWED_SOURCES = new Set([
    "auto",
    "keralagold",
    "livegoldkerala",
    "goodreturns",
    "groww",
    "bankbazaar",
    "josalukkas",
    "kalyan",
    "toi"
  ]);
  ALLOWED_MONTHS = new Set([
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december"
  ]);
  ALL_SOURCE_IDS = [
    "keralagold",
    "livegoldkerala",
    "goodreturns",
    "groww",
    "bankbazaar",
    "josalukkas",
    "kalyan",
    "toi"
  ];
});

// server/goldService.ts
import * as cheerio from "cheerio";
function parseNumericPrice(raw) {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const match = cleaned.match(/(?:Rs\.?\s*|₹\s*)?([\d,]+(?:\.\d+)?)/i);
  if (!match)
    return null;
  const val = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(val) && val > 0 ? val : null;
}
function formatIstFromHeader(lastModified) {
  if (!lastModified) {
    return new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }) + " IST";
  }
  const dt = new Date(lastModified);
  if (Number.isNaN(dt.getTime()))
    return lastModified;
  return dt.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  }) + " IST";
}
function parseIsoDateFromLabel(dateLabel) {
  const m = dateLabel.match(/(\d{1,2})[- ]([A-Za-z]{3})[- ,]+(\d{2,4})/);
  if (!m)
    return dateLabel;
  const day = m[1].padStart(2, "0");
  const monIdx = SHORT_MONTHS[m[2].toLowerCase()];
  if (monIdx === undefined)
    return dateLabel;
  const monthNum = String(monIdx + 1).padStart(2, "0");
  const rawYear = Number(m[3]);
  const fullYear = m[3].length === 2 ? rawYear >= 50 ? 1900 + rawYear : 2000 + rawYear : rawYear;
  return `${fullYear}-${monthNum}-${day}`;
}
function parseDateAndSession(rawCellText) {
  const normalized = rawCellText.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const isToday = /today/i.test(normalized);
  const isYesterday = /yesterday/i.test(normalized);
  const dateMatch = normalized.match(/\d{1,2}-[A-Za-z]{3}-\d{2,4}/);
  const dateLabel = dateMatch ? dateMatch[0] : normalized.replace(/(Today|Yesterday|»)/gi, "").trim();
  let session = "Daily";
  const sessionMatch = normalized.match(/\(([^)]+)\)/);
  if (sessionMatch) {
    session = sessionMatch[1].trim();
  } else if (isToday) {
    session = "Today";
  } else if (isYesterday) {
    session = "Yesterday";
  }
  return { dateLabel, session, isToday, isYesterday };
}
function computeDirection(diff) {
  if (diff > 0)
    return "up";
  if (diff < 0)
    return "down";
  return "flat";
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function getTodayIstInfo() {
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const year = istNow.getUTCFullYear();
  const monthIdx = istNow.getUTCMonth();
  const day = istNow.getUTCDate();
  const shortMonthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const shortMon = shortMonthNames[monthIdx] || "Jan";
  const monthKey = MONTHS[monthIdx] || "january";
  const prettyMonth = monthKey.charAt(0).toUpperCase() + monthKey.slice(1);
  return {
    isoDate: `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    dateLabel: `${day}-${shortMon}-${String(year).slice(-2)}`,
    monthLabel: `${prettyMonth} ${year}`,
    monthKey,
    year
  };
}
async function fetchTextWithTimeout(url, timeoutMs = 8000, forceRefresh = false) {
  const controller = new AbortController;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const targetUrl = forceRefresh ? `${url}${url.includes("?") ? "&" : "?"}_kgp_ts=${Date.now()}` : url;
    const headers = {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/javascript,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    };
    if (forceRefresh) {
      headers["Cache-Control"] = "no-cache, no-store, max-age=0";
      headers.Pragma = "no-cache";
    }
    const res = await fetch(targetUrl, {
      signal: controller.signal,
      cache: forceRefresh ? "no-store" : "default",
      headers
    });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      text,
      lastModified: res.headers.get("last-modified"),
      redirectedUrl: res.url
    };
  } finally {
    clearTimeout(timer);
  }
}
function parseDailyHtml(html, gramOverride) {
  const $ = cheerio.load(html);
  const rawRows = [];
  let monthlyHigh = null;
  let monthlyLow = null;
  $("table tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length === 3) {
      const label = cells.eq(0).text().replace(/\s+/g, " ").trim();
      const dateStr = cells.eq(1).text().replace(/\s+/g, " ").trim();
      const priceVal = parseNumericPrice(cells.eq(2).text());
      if (/^highest:/i.test(label) && priceVal) {
        monthlyHigh = { pavan: priceVal, gram: round2(priceVal / 8), dateLabel: dateStr };
      } else if (/^lowest:/i.test(label) && priceVal) {
        monthlyLow = { pavan: priceVal, gram: round2(priceVal / 8), dateLabel: dateStr };
      }
      return;
    }
    if (cells.length === 2) {
      const col0 = cells.eq(0).text().replace(/\s+/g, " ").trim();
      const col1 = cells.eq(1).text().replace(/\s+/g, " ").trim();
      if (/^date$/i.test(col0) || /trend/i.test(col0))
        return;
      if (!/\d{1,2}-[A-Za-z]{3}-\d{2,4}/.test(col0))
        return;
      const pavan = parseNumericPrice(col1);
      if (!pavan)
        return;
      const parsedDate = parseDateAndSession(col0);
      let note;
      if (/highest/i.test(col1))
        note = "Highest of Month";
      else if (/lowest/i.test(col1))
        note = "Lowest of Month";
      rawRows.push({
        ...parsedDate,
        pavan,
        note
      });
    }
  });
  const entries = rawRows.map((row, idx) => {
    const isLast = idx === rawRows.length - 1;
    const gram = isLast && gramOverride && Math.abs(gramOverride * 8 - row.pavan) <= 8 ? gramOverride : round2(row.pavan / 8);
    const prev = idx > 0 ? rawRows[idx - 1] : null;
    const prevGram = prev ? round2(prev.pavan / 8) : gram;
    const changePavan = prev ? round2(row.pavan - prev.pavan) : 0;
    const changeGram = prev ? round2(gram - prevGram) : 0;
    const changePercent = prev && prev.pavan > 0 ? round2(changePavan / prev.pavan * 100) : 0;
    const isoDate = parseIsoDateFromLabel(row.dateLabel);
    return {
      id: `${isoDate}-${row.session.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${idx}`,
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
      note: row.note
    };
  });
  if (!monthlyHigh && entries.length > 0) {
    const maxEntry = entries.reduce((a, b) => b.pavan > a.pavan ? b : a);
    monthlyHigh = { pavan: maxEntry.pavan, gram: maxEntry.gram, dateLabel: maxEntry.dateLabel };
  }
  if (!monthlyLow && entries.length > 0) {
    const minEntry = entries.reduce((a, b) => b.pavan < a.pavan ? b : a);
    monthlyLow = { pavan: minEntry.pavan, gram: minEntry.gram, dateLabel: minEntry.dateLabel };
  }
  let trendLabel = "Steady";
  const bodyText = $("body").text();
  if (/gold_price_trend_up|Upward/i.test(html) || /\bUpward\b/i.test(bodyText)) {
    trendLabel = "Upward";
  } else if (/gold_price_trend_down|Downward/i.test(html) || /\bDownward\b/i.test(bodyText)) {
    trendLabel = "Downward";
  }
  const h1Text = $("h1").text().replace(/\s+/g, " ").trim();
  const monthYearMatch = h1Text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
  const firstEntryIso = entries[entries.length - 1]?.isoDate || "";
  const fallbackYear = firstEntryIso.match(/^(\d{4})-(\d{2})/)?.[1];
  const fallbackMonthIdx = firstEntryIso.match(/^(\d{4})-(\d{2})/)?.[2];
  const monthName = monthYearMatch ? monthYearMatch[1] : fallbackMonthIdx ? MONTHS[Number(fallbackMonthIdx) - 1] : "november";
  const year = monthYearMatch ? Number(monthYearMatch[2]) : fallbackYear ? Number(fallbackYear) : new Date().getFullYear();
  const normalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1).toLowerCase();
  return {
    entries,
    monthlyHigh,
    monthlyLow,
    trendLabel,
    monthLabel: `${normalizedMonth} ${year}`,
    year,
    monthKey: monthName.toLowerCase()
  };
}
function parseMonthlyHtml(html) {
  const $ = cheerio.load(html);
  const rawRows = [];
  let high = null;
  let low = null;
  $("table tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length === 3) {
      const c0 = cells.eq(0).text().replace(/\s+/g, " ").trim();
      const c1 = cells.eq(1).text().replace(/\s+/g, " ").trim();
      const c2 = cells.eq(2).text().replace(/\s+/g, " ").trim();
      if (/^highest:/i.test(c0)) {
        const val = parseNumericPrice(c2);
        if (val)
          high = { pavan: val, gram: round2(val / 8), label: c1 };
        return;
      }
      if (/^lowest:/i.test(c0)) {
        const val = parseNumericPrice(c2);
        if (val)
          low = { pavan: val, gram: round2(val / 8), label: c1 };
        return;
      }
      if (/^(month|date)$/i.test(c0))
        return;
      const pavan = parseNumericPrice(c2);
      if (c0 && pavan && /\d{1,2}-[A-Za-z]{3}-\d{2,4}/.test(c1)) {
        rawRows.push({ month: c0, dateLabel: c1, pavan });
      }
    }
  });
  const entries = rawRows.map((row, idx) => {
    const gram = round2(row.pavan / 8);
    const prev = idx > 0 ? rawRows[idx - 1] : null;
    const prevGram = prev ? round2(prev.pavan / 8) : gram;
    const changePavan = prev ? round2(row.pavan - prev.pavan) : 0;
    const changeGram = prev ? round2(gram - prevGram) : 0;
    const changePercent = prev && prev.pavan > 0 ? round2(changePavan / prev.pavan * 100) : 0;
    return {
      id: `${row.month.toLowerCase()}-${idx}`,
      month: row.month,
      dateLabel: row.dateLabel,
      pavan: row.pavan,
      gram,
      changePavan,
      changeGram,
      changePercent,
      direction: computeDirection(changePavan)
    };
  });
  if (!high && entries.length > 0) {
    const maxE = entries.reduce((a, b) => b.pavan > a.pavan ? b : a);
    high = { pavan: maxE.pavan, gram: maxE.gram, label: maxE.month };
  }
  if (!low && entries.length > 0) {
    const minE = entries.reduce((a, b) => b.pavan < a.pavan ? b : a);
    low = { pavan: minE.pavan, gram: minE.gram, label: minE.month };
  }
  return { entries, high, low };
}
function parseYearlyHtml(html) {
  const $ = cheerio.load(html);
  const rawRows = [];
  $("table tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length === 3) {
      const yStr = cells.eq(0).text().replace(/\s+/g, " ").trim();
      const dateLabel = cells.eq(1).text().replace(/\s+/g, " ").trim();
      const pStr = cells.eq(2).text().replace(/\s+/g, " ").trim();
      if (!/^\d{4}$/.test(yStr))
        return;
      const pavan = parseNumericPrice(pStr);
      if (!pavan)
        return;
      rawRows.push({ year: Number(yStr), dateLabel, pavan });
    }
  });
  rawRows.sort((a, b) => a.year - b.year);
  const entries = rawRows.map((row, idx) => {
    const gram = round2(row.pavan / 8);
    const prev = idx > 0 ? rawRows[idx - 1] : null;
    const prevGram = prev ? round2(prev.pavan / 8) : gram;
    const changePavan = prev ? round2(row.pavan - prev.pavan) : 0;
    const changeGram = prev ? round2(gram - prevGram) : 0;
    const changePercent = prev && prev.pavan > 0 ? round2(changePavan / prev.pavan * 100) : 0;
    return {
      id: `year-${row.year}`,
      year: row.year,
      dateLabel: row.dateLabel,
      pavan: row.pavan,
      gram,
      changePavan,
      changeGram,
      changePercent,
      direction: computeDirection(changePavan)
    };
  });
  let high = null;
  let low = null;
  if (entries.length > 0) {
    const maxE = entries.reduce((a, b) => b.pavan > a.pavan ? b : a);
    const minE = entries.reduce((a, b) => b.pavan < a.pavan ? b : a);
    high = { pavan: maxE.pavan, gram: maxE.gram, label: String(maxE.year) };
    low = { pavan: minE.pavan, gram: minE.gram, label: String(minE.year) };
  }
  return { entries, high, low };
}
function parseLiveGoldKeralaHistoryHtml(html) {
  const $ = cheerio.load(html);
  const raw = [];
  $("table").first().find("tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 3)
      return;
    const rawDate = cells.eq(0).text().replace(/\s+/g, " ").trim();
    const isToday = /today/i.test(rawDate);
    const dm = rawDate.match(/(\d{1,2})\s+([A-Za-z]{3})[,\s]+(\d{4})/);
    const dateLabel = dm ? `${dm[1]}-${dm[2]}-${dm[3].slice(-2)}` : rawDate.replace(/Today/gi, "").trim();
    const gram = parseNumericPrice(cells.eq(1).text());
    const pavan = parseNumericPrice(cells.eq(2).text());
    if (gram && pavan && dateLabel) {
      raw.push({ dateLabel, isToday, gram, pavan });
    }
  });
  raw.reverse();
  return raw.map((row, idx) => {
    const prev = idx > 0 ? raw[idx - 1] : null;
    const changePavan = prev ? round2(row.pavan - prev.pavan) : 0;
    const changeGram = prev ? round2(row.gram - prev.gram) : 0;
    const changePercent = prev && prev.pavan > 0 ? round2(changePavan / prev.pavan * 100) : 0;
    const isoDate = parseIsoDateFromLabel(row.dateLabel);
    return {
      id: `lgk-${isoDate}-${idx}`,
      dateLabel: row.dateLabel,
      isoDate,
      session: row.isToday ? "Today" : "Daily",
      isToday: row.isToday,
      isYesterday: idx === raw.length - 2,
      pavan: row.pavan,
      gram: row.gram,
      changePavan,
      changeGram,
      changePercent,
      direction: computeDirection(changePavan)
    };
  });
}
async function probeKeralaGold(forceRefresh = false) {
  const start = Date.now();
  const url = "https://www.keralagold.com/daily-gold-prices.htm";
  try {
    const [dailyRes, jsRes] = await Promise.all([
      fetchTextWithTimeout(url, 8000, forceRefresh),
      fetchTextWithTimeout("https://www.keralagold.com/gold-price.js", 5000, forceRefresh).catch(() => null)
    ]);
    const latencyMs = Date.now() - start;
    if (!dailyRes.ok) {
      return {
        probe: {
          id: "keralagold",
          name: "KeralaGold.com",
          url,
          status: "unavailable",
          httpStatus: dailyRes.status,
          latencyMs,
          detail: `HTTP ${dailyRes.status}`,
          supportsHistory: true
        }
      };
    }
    let gramOverride = null;
    if (jsRes?.ok) {
      const m = jsRes.text.match(/var\s+gram\s*=\s*(\d+(?:\.\d+)?)/);
      if (m)
        gramOverride = Number(m[1]);
    }
    const parsed = parseDailyHtml(dailyRes.text, gramOverride);
    if (parsed.entries.length === 0) {
      return {
        probe: {
          id: "keralagold",
          name: "KeralaGold.com",
          url,
          status: "error",
          httpStatus: dailyRes.status,
          latencyMs,
          detail: "Price table could not be parsed",
          supportsHistory: true
        }
      };
    }
    const latest = parsed.entries[parsed.entries.length - 1];
    const gram22k = latest.gram;
    const pavan22k = latest.pavan;
    const gram24kEstimate = Math.round(gram22k * (24 / 22));
    const pavan24kEstimate = gram24kEstimate * 8;
    const gram18kEstimate = Math.round(gram22k * (18 / 22));
    const probe = {
      id: "keralagold",
      name: "KeralaGold.com",
      url,
      status: "online",
      httpStatus: dailyRes.status,
      latencyMs,
      detail: `Active · ${parsed.entries.length} records in ${parsed.monthLabel}`,
      supportsHistory: true
    };
    const data = {
      source: "keralagold",
      sourceName: "KeralaGold.com",
      sourceUrl: url,
      fallbackUsed: false,
      fallbackChain: [probe],
      fetchedAt: new Date().toISOString(),
      serverLastModified: dailyRes.lastModified,
      updatedTimeIst: formatIstFromHeader(dailyRes.lastModified),
      scheduleLabel: latest.session === "Today" ? "Morning Update" : `${latest.session} Session`,
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
        trendLabel: parsed.trendLabel
      },
      monthlyHigh: parsed.monthlyHigh,
      monthlyLow: parsed.monthlyLow,
      entries: parsed.entries
    };
    return { probe, data };
  } catch (err) {
    return {
      probe: {
        id: "keralagold",
        name: "KeralaGold.com",
        url,
        status: "error",
        latencyMs: Date.now() - start,
        detail: err instanceof Error ? err.message : "Network error",
        supportsHistory: true
      }
    };
  }
}
function extractRatesForSecondary(id, html) {
  const $ = cheerio.load(html);
  if (id === "livegoldkerala") {
    let gram22k = null;
    let pavan22k = null;
    let changeGram;
    $("table").first().find("tr").each((_, tr) => {
      const cells = $(tr).find("td");
      if (cells.length < 2)
        return;
      const label = cells.eq(0).text().replace(/\s+/g, " ").trim();
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
    const bodyText = $("body").text().replace(/\s+/g, " ");
    const m24 = bodyText.match(/24K[^₹]{0,30}₹\s*([\d,]{4,6})/i);
    const m18 = bodyText.match(/18K[^₹]{0,30}₹\s*([\d,]{4,6})/i);
    if (!gram22k && pavan22k)
      gram22k = round2(pavan22k / 8);
    if (gram22k && gram22k > 3000 && gram22k < 50000) {
      return {
        gram22k,
        pavan22k: pavan22k || gram22k * 8,
        gram24k: m24 ? Number(m24[1].replace(/,/g, "")) : undefined,
        gram18k: m18 ? Number(m18[1].replace(/,/g, "")) : undefined,
        changeGram
      };
    }
    return null;
  }
  if (id === "goodreturns") {
    let gram24k;
    let gram22k = null;
    let gram18k;
    let pavan22k;
    $("table").first().find("tr").each((_, tr) => {
      const cells = $(tr).find("td");
      if (cells.length < 4)
        return;
      const wt = cells.eq(0).text().trim();
      if (wt === "1") {
        gram24k = parseNumericPrice(cells.eq(1).text()) || undefined;
        gram22k = parseNumericPrice(cells.eq(2).text());
        gram18k = parseNumericPrice(cells.eq(3).text()) || undefined;
      } else if (wt === "8") {
        pavan22k = parseNumericPrice(cells.eq(2).text()) || undefined;
      }
    });
    if (gram22k && gram22k > 3000 && gram22k < 50000) {
      return { gram22k, pavan22k: pavan22k || gram22k * 8, gram24k, gram18k };
    }
    return null;
  }
  if (id === "groww") {
    const nextScript = $("#__NEXT_DATA__").text();
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
            gram18k: Number.isFinite(g18) ? g18 : undefined
          };
        }
      } catch {}
    }
    let gram22k = null;
    $("table").first().find("tr").each((_, tr) => {
      const cells = $(tr).find("td");
      if (cells.length >= 4 && /1\s*gram/i.test(cells.eq(0).text())) {
        gram22k = parseNumericPrice(cells.eq(2).text());
      }
    });
    if (gram22k && gram22k > 3000 && gram22k < 50000) {
      return { gram22k, pavan22k: gram22k * 8 };
    }
    return null;
  }
  if (id === "bankbazaar") {
    let gram22k = null;
    let pavan22k;
    let changeGram;
    $("table").first().find("tr").each((_, tr) => {
      const cells = $(tr).find("td");
      if (cells.length < 3)
        return;
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
      return { gram22k, pavan22k: pavan22k || gram22k * 8, changeGram };
    }
    return null;
  }
  if (id === "josalukkas") {
    const m22 = html.match(/22KT[^0-9]{1,8}(\d{4,6})/);
    const m24 = html.match(/24KT[^0-9]{1,8}(\d{4,6})/);
    const m18 = html.match(/18KT[^0-9]{1,8}(\d{4,6})/);
    const g22 = m22 ? Number(m22[1]) : null;
    if (g22 && g22 > 3000 && g22 < 50000) {
      return {
        gram22k: g22,
        pavan22k: g22 * 8,
        gram24k: m24 ? Number(m24[1]) : undefined,
        gram18k: m18 ? Number(m18[1]) : undefined
      };
    }
    return null;
  }
  if (id === "kalyan") {
    let gram22k = null;
    let gram24k;
    let gram18k;
    $("table").each((_, table) => {
      const heading = $(table).find("tr").first().text();
      const g1Cell = $(table).find("tr").filter((__, tr) => /^1\s*gm$/i.test($(tr).find("td").eq(0).text().trim())).first().find("td").eq(1).text();
      const val = parseNumericPrice(g1Cell);
      if (!val)
        return;
      if (/22k/i.test(heading))
        gram22k = val;
      else if (/24k/i.test(heading))
        gram24k = val;
      else if (/18k/i.test(heading))
        gram18k = val;
    });
    if (gram22k && gram22k > 3000 && gram22k < 50000) {
      return { gram22k, pavan22k: gram22k * 8, gram24k, gram18k };
    }
    return null;
  }
  if (id === "toi") {
    const bodyText = $("body").text().replace(/\s+/g, " ");
    const m22 = bodyText.match(/22K\s*gold\/gm\s*₹\s*([\d,]+)/i);
    const m24 = bodyText.match(/24K\s*gold\/gm\s*₹\s*([\d,]+)/i);
    const m18 = bodyText.match(/18K\s*gold\/gm\s*₹\s*([\d,]+)/i);
    const g22 = m22 ? Number(m22[1].replace(/,/g, "")) : null;
    if (g22 && g22 > 3000 && g22 < 50000) {
      return {
        gram22k: g22,
        pavan22k: g22 * 8,
        gram24k: m24 ? Number(m24[1].replace(/,/g, "")) : undefined,
        gram18k: m18 ? Number(m18[1].replace(/,/g, "")) : undefined
      };
    }
  }
  return null;
}
async function probeSecondarySource(id, forceRefresh = false) {
  const cfg = SECONDARY_CONFIGS[id];
  const start = Date.now();
  try {
    const res = await fetchTextWithTimeout(cfg.url, 8000, forceRefresh);
    const latencyMs = Date.now() - start;
    if (res.status === 403 || /cf-browser-verification|just a moment|attention required/i.test(res.text.slice(0, 4000))) {
      return {
        probe: {
          id,
          name: cfg.name,
          url: cfg.url,
          status: "blocked",
          httpStatus: res.status,
          latencyMs,
          detail: "Bot challenge protection (403)",
          supportsHistory: cfg.supportsHistory
        }
      };
    }
    if (!res.ok) {
      return {
        probe: {
          id,
          name: cfg.name,
          url: cfg.url,
          status: "unavailable",
          httpStatus: res.status,
          latencyMs,
          detail: `HTTP ${res.status}`,
          supportsHistory: cfg.supportsHistory
        }
      };
    }
    const extracted = extractRatesForSecondary(id, res.text);
    if (extracted) {
      let historyEntries;
      if (id === "livegoldkerala") {
        try {
          const histRes = await fetchTextWithTimeout("https://www.livegoldkerala.com/gold-rate-history", 6000, forceRefresh);
          if (histRes.ok) {
            historyEntries = parseLiveGoldKeralaHistoryHtml(histRes.text);
          }
        } catch {}
      }
      return {
        probe: {
          id,
          name: cfg.name,
          url: cfg.url,
          status: "online",
          httpStatus: res.status,
          latencyMs,
          detail: `22K ₹${extracted.gram22k.toLocaleString("en-IN")}/g · Pavan ₹${(extracted.pavan22k || extracted.gram22k * 8).toLocaleString("en-IN")}`,
          supportsHistory: cfg.supportsHistory
        },
        extracted: { ...extracted, historyEntries }
      };
    }
    return {
      probe: {
        id,
        name: cfg.name,
        url: cfg.url,
        status: "spa-only",
        httpStatus: res.status,
        latencyMs,
        detail: "Rate table requires client-side rendering",
        supportsHistory: cfg.supportsHistory
      }
    };
  } catch (err) {
    return {
      probe: {
        id,
        name: cfg.name,
        url: cfg.url,
        status: "error",
        latencyMs: Date.now() - start,
        detail: err instanceof Error ? err.message : "Request timed out",
        supportsHistory: cfg.supportsHistory
      }
    };
  }
}
function buildResponseFromSecondary(id, probe, extracted, chain, fallbackUsed, baseKgData) {
  const gram22k = extracted.gram22k;
  const pavan22k = extracted.pavan22k || gram22k * 8;
  const gram24kEstimate = extracted.gram24k || Math.round(gram22k * (24 / 22));
  const pavan24kEstimate = gram24kEstimate * 8;
  const gram18kEstimate = extracted.gram18k || Math.round(gram22k * (18 / 22));
  const entries = extracted.historyEntries && extracted.historyEntries.length > 0 ? extracted.historyEntries : baseKgData?.entries || [];
  const latestFromEntries = entries[entries.length - 1];
  const changeGram = extracted.changeGram ?? latestFromEntries?.changeGram ?? baseKgData?.current.changeGram ?? 0;
  const changePavan = changeGram !== 0 ? changeGram * 8 : latestFromEntries?.changePavan ?? baseKgData?.current.changePavan ?? 0;
  let monthlyHigh = baseKgData?.monthlyHigh || null;
  let monthlyLow = baseKgData?.monthlyLow || null;
  if (extracted.historyEntries && extracted.historyEntries.length > 0) {
    const maxE = extracted.historyEntries.reduce((a, b) => b.pavan > a.pavan ? b : a);
    const minE = extracted.historyEntries.reduce((a, b) => b.pavan < a.pavan ? b : a);
    monthlyHigh = { pavan: maxE.pavan, gram: maxE.gram, dateLabel: maxE.dateLabel };
    monthlyLow = { pavan: minE.pavan, gram: minE.gram, dateLabel: minE.dateLabel };
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
    scheduleLabel: baseKgData?.scheduleLabel || "Live Board Rate",
    monthLabel: baseKgData?.monthLabel || new Date().toLocaleString("en-US", { month: "long", year: "numeric" }),
    year: baseKgData?.year || new Date().getFullYear(),
    monthKey: baseKgData?.monthKey || MONTHS[new Date().getMonth()],
    current: {
      dateLabel: baseKgData?.current.dateLabel || new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "2-digit" }),
      session: baseKgData?.current.session || "Daily",
      gram22k,
      pavan22k,
      gram24kEstimate,
      pavan24kEstimate,
      gram18kEstimate,
      changePavan,
      changeGram,
      changePercent: pavan22k > 0 ? round2(changePavan / pavan22k * 100) : baseKgData?.current.changePercent || 0,
      direction: computeDirection(changePavan),
      trendLabel: changePavan > 0 ? "Upward" : changePavan < 0 ? "Downward" : baseKgData?.current.trendLabel || "Steady"
    },
    monthlyHigh,
    monthlyLow,
    entries
  };
}
function mergeNewerRateOntoPrimary(baseKgData, winner, chain, isSameDayRevision) {
  const todayIst = getTodayIstInfo();
  const gram22k = winner.extracted.gram22k;
  const pavan22k = winner.extracted.pavan22k || Math.round(gram22k * 8);
  const gram24kEstimate = winner.extracted.gram24k || Math.round(gram22k * (24 / 22));
  const pavan24kEstimate = gram24kEstimate * 8;
  const gram18kEstimate = winner.extracted.gram18k || Math.round(gram22k * (18 / 22));
  const baseEntries = [...baseKgData.entries || []];
  const prevEntry = baseEntries[baseEntries.length - 1] || null;
  const prevPavan = prevEntry?.pavan ?? baseKgData.current.pavan22k;
  const prevGram = prevEntry?.gram ?? baseKgData.current.gram22k;
  const changePavan = round2(pavan22k - prevPavan);
  const changeGram = round2(gram22k - prevGram);
  const changePercent = prevPavan > 0 ? round2(changePavan / prevPavan * 100) : 0;
  const direction = computeDirection(changePavan);
  const syntheticEntry = {
    id: `live-${todayIst.isoDate}-${pavan22k}`,
    dateLabel: todayIst.dateLabel,
    isoDate: todayIst.isoDate,
    session: isSameDayRevision ? "Intraday Update" : "Today",
    isToday: true,
    isYesterday: false,
    pavan: pavan22k,
    gram: gram22k,
    changePavan,
    changeGram,
    changePercent,
    direction
  };
  const mergedEntries = baseEntries.map((e) => ({ ...e, isToday: false }));
  mergedEntries.push(syntheticEntry);
  const maxE = mergedEntries.reduce((a, b) => b.pavan > a.pavan ? b : a, mergedEntries[0]);
  const minE = mergedEntries.reduce((a, b) => b.pavan < a.pavan ? b : a, mergedEntries[0]);
  return {
    source: winner.id,
    sourceName: winner.probe.name,
    sourceUrl: winner.probe.url,
    fallbackUsed: true,
    fallbackChain: chain,
    fetchedAt: new Date().toISOString(),
    serverLastModified: null,
    updatedTimeIst: formatIstFromHeader(null),
    scheduleLabel: isSameDayRevision ? "Intraday Live Update" : "Morning Live Update",
    monthLabel: todayIst.monthLabel || baseKgData.monthLabel,
    year: todayIst.year || baseKgData.year,
    monthKey: todayIst.monthKey || baseKgData.monthKey,
    current: {
      dateLabel: todayIst.dateLabel,
      session: syntheticEntry.session,
      gram22k,
      pavan22k,
      gram24kEstimate,
      pavan24kEstimate,
      gram18kEstimate,
      changePavan,
      changeGram,
      changePercent,
      direction,
      trendLabel: direction === "up" ? "Upward" : direction === "down" ? "Downward" : "Steady"
    },
    monthlyHigh: maxE ? { pavan: maxE.pavan, gram: maxE.gram, dateLabel: maxE.dateLabel } : baseKgData.monthlyHigh,
    monthlyLow: minE ? { pavan: minE.pavan, gram: minE.gram, dateLabel: minE.dateLabel } : baseKgData.monthlyLow,
    entries: mergedEntries
  };
}
async function getLatestGoldWithFallback(preferred = "auto", includeProbes = false, forceRefresh = false) {
  const cacheKey = `${preferred}:${includeProbes ? "probes" : "fast"}`;
  const cached = latestCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.cachedAt < LATEST_CACHE_TTL_MS) {
    return cached.data;
  }
  const chain = [];
  if (preferred !== "auto" && preferred !== "keralagold") {
    const [secondary, kg] = await Promise.all([
      probeSecondarySource(preferred, forceRefresh),
      probeKeralaGold(forceRefresh)
    ]);
    chain.push(secondary.probe, kg.probe);
    if (secondary.extracted) {
      const result = buildResponseFromSecondary(preferred, secondary.probe, secondary.extracted, chain, false, kg.data);
      latestCache.set(cacheKey, { data: result, cachedAt: Date.now() });
      return result;
    }
    if (kg.data) {
      const result = {
        ...kg.data,
        fallbackUsed: true,
        fallbackChain: chain
      };
      latestCache.set(cacheKey, { data: result, cachedAt: Date.now() });
      return result;
    }
    if (cached)
      return cached.data;
    throw new Error(`Preferred source ${preferred} and primary source are currently unreachable.`);
  }
  const secondaryToProbe = includeProbes ? SECONDARY_ORDER : FAST_CONSENSUS_SOURCES;
  const [kg, ...secondaryResults] = await Promise.all([
    probeKeralaGold(forceRefresh),
    ...secondaryToProbe.map((id) => probeSecondarySource(id, forceRefresh))
  ]);
  chain.push(kg.probe, ...secondaryResults.map((r) => r.probe));
  if (!kg.data) {
    const healthy = secondaryResults.find((r) => r.extracted);
    if (healthy?.extracted) {
      const result = buildResponseFromSecondary(healthy.probe.id, healthy.probe, healthy.extracted, chain, true);
      latestCache.set(cacheKey, { data: result, cachedAt: Date.now() });
      return result;
    }
    if (cached)
      return cached.data;
    throw new Error("All configured Kerala gold rate sources are currently unreachable.");
  }
  const todayIst = getTodayIstInfo();
  const kgLatestEntry = kg.data.entries[kg.data.entries.length - 1];
  const kgPrevEntry = kg.data.entries.length >= 2 ? kg.data.entries[kg.data.entries.length - 2] : null;
  const kgIsBehindToday = Boolean(kgLatestEntry?.isoDate && kgLatestEntry.isoDate < todayIst.isoDate);
  const kgCurrentPavan = kg.data.current.pavan22k;
  const fastSecondarySet = new Set(FAST_CONSENSUS_SOURCES);
  const fastOnline = secondaryResults.filter((r) => Boolean(r.extracted && fastSecondarySet.has(r.probe.id)));
  const votesForKg = 1 + fastOnline.filter((r) => (r.extracted.pavan22k || Math.round(r.extracted.gram22k * 8)) === kgCurrentPavan).length;
  const differingFast = fastOnline.filter((r) => {
    const p = r.extracted.pavan22k || Math.round(r.extracted.gram22k * 8);
    if (p === kgCurrentPavan)
      return false;
    if (!kgIsBehindToday && kgPrevEntry && p === kgPrevEntry.pavan)
      return false;
    return true;
  });
  let consensusWinner = null;
  if (differingFast.length >= 2) {
    const byPavan = new Map;
    for (const item of differingFast) {
      const p = item.extracted.pavan22k || Math.round(item.extracted.gram22k * 8);
      const list = byPavan.get(p) || [];
      list.push(item);
      byPavan.set(p, list);
    }
    let bestGroup = [];
    for (const [, group] of byPavan.entries()) {
      if (group.length > bestGroup.length) {
        bestGroup = group;
      }
    }
    const hasLgkAgreement = bestGroup.some((item) => item.probe.id === "livegoldkerala");
    if (bestGroup.length >= 2 && (kgIsBehindToday || bestGroup.length > votesForKg || hasLgkAgreement)) {
      consensusWinner = bestGroup[0];
    }
  }
  if (!consensusWinner && kgIsBehindToday) {
    const lgk = fastOnline.find((r) => r.probe.id === "livegoldkerala");
    const lgkLatest = lgk?.extracted?.historyEntries?.[lgk.extracted.historyEntries.length - 1];
    if (lgk && lgkLatest && (lgkLatest.isToday || lgkLatest.isoDate >= todayIst.isoDate)) {
      consensusWinner = lgk;
    }
  }
  if (consensusWinner) {
    const promoted = mergeNewerRateOntoPrimary(kg.data, {
      id: consensusWinner.probe.id,
      probe: consensusWinner.probe,
      extracted: consensusWinner.extracted
    }, chain, !kgIsBehindToday);
    latestCache.set(cacheKey, { data: promoted, cachedAt: Date.now() });
    return promoted;
  }
  const result = {
    ...kg.data,
    fallbackChain: chain
  };
  latestCache.set(cacheKey, { data: result, cachedAt: Date.now() });
  return result;
}
async function getAllSourceProbes(forceRefresh = false) {
  if (!forceRefresh && probesCache && Date.now() - probesCache.cachedAt < PROBES_CACHE_TTL_MS) {
    return probesCache.data;
  }
  const [kg, ...secondaries] = await Promise.all([
    probeKeralaGold(forceRefresh),
    ...SECONDARY_ORDER.map((id) => probeSecondarySource(id, forceRefresh))
  ]);
  const results = [kg.probe, ...secondaries.map((s) => s.probe)];
  probesCache = { data: results, cachedAt: Date.now() };
  return results;
}
async function getGoldHistory(params) {
  const { mode } = params;
  const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const currentYear = nowIst.getUTCFullYear();
  const currentMonth = nowIst.toLocaleString("en-US", { month: "long", timeZone: "UTC" }).toLowerCase();
  const targetYear = params.year || currentYear;
  const targetMonth = (params.month || currentMonth).toLowerCase();
  const hKey = `${mode}:${targetYear}:${targetMonth}`;
  const cachedH = historyServerCache.get(hKey);
  if (cachedH && Date.now() - cachedH.cachedAt < HISTORY_SERVER_TTL_MS) {
    return cachedH.data;
  }
  if (historyServerCache.size > 48) {
    const oldestKey = historyServerCache.keys().next().value;
    if (oldestKey)
      historyServerCache.delete(oldestKey);
  }
  if (mode === "yearly") {
    const url = "https://www.keralagold.com/yearly-gold-prices.htm";
    const res = await fetchTextWithTimeout(url, 8000);
    if (!res.ok)
      throw new Error(`Failed to fetch yearly history (HTTP ${res.status})`);
    const parsed = parseYearlyHtml(res.text);
    const out = {
      mode: "yearly",
      title: "Kerala Gold Yearly Price History (1925 – Present)",
      subtitle: "Annual 31-March benchmark prices per Pavan (8g, 22K) and per Gram",
      sourceName: "KeralaGold.com",
      sourceUrl: url,
      fetchedAt: new Date().toISOString(),
      serverLastModified: res.lastModified,
      high: parsed.high,
      low: parsed.low,
      yearlyEntries: parsed.entries
    };
    historyServerCache.set(hKey, { data: out, cachedAt: Date.now() });
    return out;
  }
  if (mode === "monthly") {
    const primaryUrl = "https://www.keralagold.com/monthly-gold-prices.htm";
    const archiveUrl = `https://www.keralagold.com/monthly-gold-prices-${targetYear}.htm`;
    const usedUrl = targetYear >= currentYear ? primaryUrl : archiveUrl;
    const res = await fetchTextWithTimeout(usedUrl, 8000);
    if (!res.ok)
      throw new Error(`Monthly archive for ${targetYear} unavailable (HTTP ${res.status})`);
    const parsed = parseMonthlyHtml(res.text);
    const out = {
      mode: "monthly",
      title: `Monthly Gold Price Summary (${targetYear})`,
      subtitle: "Mid-month (15th) benchmark prices for 1 Pavan & 1 Gram in Kerala",
      sourceName: "KeralaGold.com",
      sourceUrl: usedUrl,
      fetchedAt: new Date().toISOString(),
      serverLastModified: res.lastModified,
      high: parsed.high,
      low: parsed.low,
      monthlyEntries: parsed.entries
    };
    historyServerCache.set(hKey, { data: out, cachedAt: Date.now() });
    return out;
  }
  const prettyMonth = targetMonth.charAt(0).toUpperCase() + targetMonth.slice(1);
  const archiveUrl = `https://www.keralagold.com/daily-gold-prices-${targetMonth}-${targetYear}.htm`;
  try {
    let res = await fetchTextWithTimeout(archiveUrl, 8000);
    let usedUrl = archiveUrl;
    if (res.status === 404) {
      const liveRes = await fetchTextWithTimeout("https://www.keralagold.com/daily-gold-prices.htm", 8000);
      if (liveRes.ok) {
        const checkParsed = parseDailyHtml(liveRes.text);
        if (checkParsed.monthKey === targetMonth && checkParsed.year === targetYear) {
          res = liveRes;
          usedUrl = "https://www.keralagold.com/daily-gold-prices.htm";
        }
      }
    }
    if (res.ok) {
      const parsed = parseDailyHtml(res.text);
      if (parsed.entries.length > 0) {
        const out = {
          mode: "daily",
          title: `Daily Gold Prices — ${prettyMonth} ${targetYear}`,
          subtitle: `${parsed.entries.length} recorded updates including morning/evening revisions`,
          sourceName: "KeralaGold.com",
          sourceUrl: usedUrl,
          fetchedAt: new Date().toISOString(),
          serverLastModified: res.lastModified,
          high: parsed.monthlyHigh ? { pavan: parsed.monthlyHigh.pavan, gram: parsed.monthlyHigh.gram, label: parsed.monthlyHigh.dateLabel } : null,
          low: parsed.monthlyLow ? { pavan: parsed.monthlyLow.pavan, gram: parsed.monthlyLow.gram, label: parsed.monthlyLow.dateLabel } : null,
          dailyEntries: parsed.entries
        };
        historyServerCache.set(hKey, { data: out, cachedAt: Date.now() });
        return out;
      }
    }
  } catch {}
  const monthIdx = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december"
  ].indexOf(targetMonth);
  const isoPrefix = monthIdx >= 0 ? `${targetYear}-${String(monthIdx + 1).padStart(2, "0")}-` : "";
  if (isoPrefix) {
    const lgkUrl = "https://www.livegoldkerala.com/gold-rate-history";
    const lgkRes = await fetchTextWithTimeout(lgkUrl, 8000);
    if (lgkRes.ok) {
      const matchingEntries = parseLiveGoldKeralaHistoryHtml(lgkRes.text).filter((e) => e.isoDate.startsWith(isoPrefix));
      if (matchingEntries.length > 0) {
        const maxE = matchingEntries.reduce((a, b) => b.pavan > a.pavan ? b : a);
        const minE = matchingEntries.reduce((a, b) => b.pavan < a.pavan ? b : a);
        const out = {
          mode: "daily",
          title: `Daily Gold Prices — ${prettyMonth} ${targetYear}`,
          subtitle: `${matchingEntries.length} daily records via LiveGoldKerala.com fallback`,
          sourceName: "LiveGoldKerala.com",
          sourceUrl: lgkUrl,
          fetchedAt: new Date().toISOString(),
          serverLastModified: lgkRes.lastModified,
          high: { pavan: maxE.pavan, gram: maxE.gram, label: maxE.dateLabel },
          low: { pavan: minE.pavan, gram: minE.gram, label: minE.dateLabel },
          dailyEntries: matchingEntries
        };
        historyServerCache.set(hKey, { data: out, cachedAt: Date.now() });
        return out;
      }
    }
  }
  if (cachedH)
    return cachedH.data;
  throw new Error(`Archive for ${prettyMonth} ${targetYear} is not available.`);
}
async function getLiveSpotMarket() {
  if (spotMarketCache && Date.now() - spotMarketCache.cachedAt < SPOT_CACHE_TTL_MS) {
    return spotMarketCache.data;
  }
  const url = "https://www.livepriceofgold.com/india-gold-price.html";
  let res;
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
  const t0 = $("table").eq(0);
  const t0Header = t0.find("tr").first().text().replace(/\s+/g, " ");
  const pctMatch = t0Header.match(/([+-]?\d+(?:\.\d+)?)%/);
  const spotChangePercent = pctMatch ? Number(pctMatch[1]) : 0;
  let spot24kGramInr = 0;
  let spot22kGramInr = 0;
  let spotOzInr = 0;
  t0.find("tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 3)
      return;
    const label = cells.eq(1).text().replace(/\s+/g, " ").trim();
    const val = parseNumericPrice(cells.eq(2).text());
    if (!val)
      return;
    if (/24K\s*Gold\/gram/i.test(label))
      spot24kGramInr = val;
    else if (/22K\s*Gold\/gram/i.test(label))
      spot22kGramInr = val;
    else if (/Spot\s*Gold\/oz/i.test(label))
      spotOzInr = val;
  });
  let usdInr = 0;
  let usdInrChangePercent = 0;
  $("table").eq(1).find("tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 3)
      return;
    const label = cells.eq(1).text().replace(/\s+/g, " ").trim();
    if (/USD\/INR/i.test(label)) {
      const um = label.match(/([+-]?\d+(?:\.\d+)?)%/);
      usdInrChangePercent = um ? Number(um[1]) : 0;
      usdInr = parseNumericPrice(cells.eq(2).text()) || 0;
    }
  });
  let dayHigh24kGram = null;
  let dayLow24kGram = null;
  $("table").eq(2).find("tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 4)
      return;
    const label = cells.eq(0).text().replace(/\s+/g, " ").trim();
    if (/1\s*GRAM\s*GOLD\s*24K/i.test(label)) {
      dayHigh24kGram = parseNumericPrice(cells.eq(2).text());
      dayLow24kGram = parseNumericPrice(cells.eq(3).text());
    }
  });
  if (!spot24kGramInr || !spot22kGramInr) {
    if (spotMarketCache)
      return spotMarketCache.data;
    throw new Error("Could not parse live international spot rates.");
  }
  const parsed = {
    sourceName: "LivePriceOfGold.com",
    sourceUrl: url,
    fetchedAt: new Date().toISOString(),
    spot24kGramInr,
    spot22kGramInr,
    spotOzInr,
    spotChangePercent,
    usdInr,
    usdInrChangePercent,
    dayHigh24kGram,
    dayLow24kGram
  };
  spotMarketCache = { data: parsed, cachedAt: Date.now() };
  return parsed;
}
var USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36", MONTHS, SHORT_MONTHS, SECONDARY_CONFIGS, SECONDARY_ORDER, FAST_CONSENSUS_SOURCES, latestCache, LATEST_CACHE_TTL_MS = 30000, probesCache = null, PROBES_CACHE_TTL_MS = 120000, historyServerCache, HISTORY_SERVER_TTL_MS = 300000, spotMarketCache = null, SPOT_CACHE_TTL_MS = 60000;
var init_goldService = __esm(() => {
  MONTHS = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december"
  ];
  SHORT_MONTHS = {
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
    dec: 11
  };
  SECONDARY_CONFIGS = {
    livegoldkerala: {
      name: "LiveGoldKerala.com",
      url: "https://www.livegoldkerala.com/",
      supportsHistory: true
    },
    goodreturns: {
      name: "GoodReturns.in",
      url: "https://www.goodreturns.in/gold-rates/kerala.html",
      supportsHistory: false
    },
    groww: {
      name: "Groww.in",
      url: "https://groww.in/gold-rates/gold-rate-today-in-kerala",
      supportsHistory: false
    },
    bankbazaar: {
      name: "BankBazaar.com",
      url: "https://www.bankbazaar.com/gold-rate-kerala.html",
      supportsHistory: false
    },
    josalukkas: {
      name: "Jos Alukkas",
      url: "https://www.josalukkasonline.com/gold-rate-today/kerala",
      supportsHistory: false
    },
    kalyan: {
      name: "Kalyan Jewellers",
      url: "https://store.kalyanjewellers.net/gold-rate/kerala/en",
      supportsHistory: false
    },
    toi: {
      name: "Times of India",
      url: "https://timesofindia.indiatimes.com/business/gold-rates-today/gold-price-in-kerala",
      supportsHistory: false
    }
  };
  SECONDARY_ORDER = [
    "livegoldkerala",
    "goodreturns",
    "groww",
    "bankbazaar",
    "josalukkas",
    "kalyan",
    "toi"
  ];
  FAST_CONSENSUS_SOURCES = ["livegoldkerala", "goodreturns", "groww", "josalukkas"];
  latestCache = new Map;
  historyServerCache = new Map;
});

// server/pushService.ts
import fs from "fs";
import { createRequire } from "module";
import path from "path";
function ensureVapidConfigured() {
  if (initialized && vapidKeys)
    return vapidKeys;
  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:alerts@keralagoldprice.app";
  if (envPub && envPriv) {
    vapidKeys = { publicKey: envPub, privateKey: envPriv };
  } else if (fs.existsSync(VAPID_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(VAPID_FILE, "utf-8"));
      if (parsed?.publicKey && parsed?.privateKey) {
        vapidKeys = parsed;
      }
    } catch {}
  }
  if (!vapidKeys) {
    vapidKeys = webpush.generateVAPIDKeys();
    try {
      fs.mkdirSync(path.dirname(VAPID_FILE), { recursive: true });
      fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2));
    } catch {}
  }
  webpush.setVapidDetails(subject, vapidKeys.publicKey, vapidKeys.privateKey);
  initialized = true;
  return vapidKeys;
}
function loadSubscribers() {
  if (subscribersCache)
    return subscribersCache;
  try {
    if (fs.existsSync(SUBS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SUBS_FILE, "utf-8"));
      if (Array.isArray(raw)) {
        subscribersCache = raw;
        return subscribersCache;
      }
    }
  } catch {}
  subscribersCache = [];
  return subscribersCache;
}
function saveSubscribers(list) {
  subscribersCache = list;
  try {
    fs.mkdirSync(path.dirname(SUBS_FILE), { recursive: true });
    fs.writeFileSync(SUBS_FILE, JSON.stringify(list, null, 2));
  } catch {}
}
function getVapidPublicKey() {
  return ensureVapidConfigured().publicKey;
}
function upsertPushSubscription(subscription, prefs) {
  ensureVapidConfigured();
  const list = loadSubscribers();
  const existingIdx = list.findIndex((s) => s.endpoint === subscription.endpoint);
  const normalizedPrefs = {
    enabled: prefs.enabled ?? true,
    notifyOnPriceChange: prefs.notifyOnPriceChange ?? true,
    notifyDailySummary: prefs.notifyDailySummary ?? true,
    targetEnabled: prefs.targetEnabled ?? false,
    unit: prefs.unit === "gram" ? "gram" : "pavan",
    direction: prefs.direction === "above" ? "above" : "below",
    targetPrice: Number.isFinite(Number(prefs.targetPrice)) ? Number(prefs.targetPrice) : 1e5,
    lang: prefs.lang === "ml" ? "ml" : "en"
  };
  const nextEntry = {
    endpoint: subscription.endpoint,
    subscription,
    prefs: normalizedPrefs,
    lastAlertKey: existingIdx >= 0 ? list[existingIdx].lastAlertKey : undefined,
    lastDailyKey: existingIdx >= 0 ? list[existingIdx].lastDailyKey : undefined,
    lastTargetKey: existingIdx >= 0 ? list[existingIdx].lastTargetKey : undefined,
    updatedAt: new Date().toISOString()
  };
  if (existingIdx >= 0) {
    list[existingIdx] = nextEntry;
  } else {
    list.push(nextEntry);
  }
  saveSubscribers(list);
  return { count: list.length };
}
function removePushSubscription(endpoint) {
  const list = loadSubscribers();
  const next = list.filter((s) => s.endpoint !== endpoint);
  const removed = next.length !== list.length;
  if (removed)
    saveSubscribers(next);
  return { removed, count: next.length };
}
function buildPushMessage(latest, deltaPavan, deltaGram, reason, prefs) {
  const { pavan22k, gram22k, dateLabel } = latest.current;
  const arrow = deltaPavan > 0 ? "▲" : deltaPavan < 0 ? "▼" : "●";
  const colorEmoji = deltaPavan > 0 ? "\uD83D\uDFE2" : deltaPavan < 0 ? "\uD83D\uDD34" : "\uD83D\uDFE1";
  const signedPavan = deltaPavan === 0 ? "0" : `${arrow} ${deltaPavan > 0 ? "+" : "-"}₹${Math.abs(deltaPavan).toLocaleString("en-IN")}`;
  const signedGram = deltaGram === 0 ? "0" : `${arrow} ${deltaGram > 0 ? "+" : "-"}₹${Math.abs(deltaGram).toLocaleString("en-IN")}/g`;
  const ml = prefs.lang === "ml";
  let headline;
  if (reason === "target") {
    const cmp = prefs.direction === "above" ? "≥" : "≤";
    headline = ml ? `ലക്ഷ്യ വിലയിലെത്തി (${cmp} ${formatInrServer(prefs.targetPrice)})` : `Price Target Hit (${cmp} ${formatInrServer(prefs.targetPrice)})`;
  } else if (reason === "change" && deltaPavan !== 0) {
    headline = deltaPavan > 0 ? ml ? "സ്വർണ്ണ വില വർദ്ധിച്ചു" : "Kerala Gold Increased" : ml ? "സ്വർണ്ണ വില കുറഞ്ഞു" : "Kerala Gold Dropped";
  } else {
    headline = ml ? "ഇന്നത്തെ സ്വർണ്ണ വില" : "Kerala Gold Live Update";
  }
  const title = `${colorEmoji} ${arrow} ${headline} · ${dateLabel}`;
  const body = ml ? `1 പവൻ: ${formatInrServer(pavan22k)} (${signedPavan}) | 1 ഗ്രാം: ${formatInrServer(gram22k)} (${signedGram}) · ${latest.sourceName}` : `1 Pavan: ${formatInrServer(pavan22k)} (${signedPavan}) | 1 Gram: ${formatInrServer(gram22k)} (${signedGram}) · ${latest.sourceName}`;
  return { title, body, tag: `kgp-${reason}-${dateLabel}` };
}
async function sendTestPushToEndpoint(endpoint, latest, lang = "en") {
  ensureVapidConfigured();
  const list = loadSubscribers();
  const target = list.find((s) => s.endpoint === endpoint);
  if (!target)
    return false;
  const payload = buildPushMessage(latest, latest.current.changePavan, latest.current.changeGram, "test", { ...target.prefs, lang });
  try {
    await webpush.sendNotification(target.subscription, JSON.stringify({
      ...payload,
      url: "/"
    }));
    return true;
  } catch (err) {
    const statusCode = err?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      removePushSubscription(endpoint);
    }
    return false;
  }
}
async function dispatchBackgroundPushAlerts(prev, next) {
  const list = loadSubscribers();
  if (list.length === 0)
    return 0;
  ensureVapidConfigured();
  let sentCount = 0;
  let mutated = false;
  const expiredEndpoints = [];
  const boardKey = `${next.current.dateLabel}|${next.scheduleLabel}`;
  const deltaPavan = prev && prev.current.pavan22k > 0 && prev.current.pavan22k !== next.current.pavan22k ? next.current.pavan22k - prev.current.pavan22k : next.current.changePavan;
  const deltaGram = prev && prev.current.gram22k > 0 && prev.current.gram22k !== next.current.gram22k ? next.current.gram22k - prev.current.gram22k : next.current.changeGram;
  const rateChanged = Boolean(prev && (prev.current.pavan22k !== next.current.pavan22k || prev.current.gram22k !== next.current.gram22k));
  await Promise.all(list.map(async (sub) => {
    if (!sub.prefs.enabled)
      return;
    const unitVal = sub.prefs.unit === "pavan" ? next.current.pavan22k : next.current.gram22k;
    const targetMatched = sub.prefs.targetEnabled && sub.prefs.targetPrice > 0 && (sub.prefs.direction === "above" ? unitVal >= sub.prefs.targetPrice : unitVal <= sub.prefs.targetPrice);
    const targetKey = `${next.current.dateLabel}:${sub.prefs.unit}:${sub.prefs.direction}:${sub.prefs.targetPrice}`;
    const dailyKey = `${boardKey}:${next.current.pavan22k}`;
    const changeKey = `${boardKey}:${next.current.pavan22k}:${next.current.gram22k}`;
    let reason = null;
    if (targetMatched && sub.lastTargetKey !== targetKey) {
      reason = "target";
      sub.lastTargetKey = targetKey;
    } else if (sub.prefs.notifyOnPriceChange && rateChanged && sub.lastAlertKey !== changeKey) {
      reason = "change";
      sub.lastAlertKey = changeKey;
    } else if (sub.prefs.notifyDailySummary && sub.lastDailyKey !== dailyKey) {
      reason = "daily";
      sub.lastDailyKey = dailyKey;
    }
    if (!reason)
      return;
    mutated = true;
    const message = buildPushMessage(next, deltaPavan, deltaGram, reason, sub.prefs);
    try {
      await webpush.sendNotification(sub.subscription, JSON.stringify({
        ...message,
        url: "/"
      }));
      sentCount += 1;
    } catch (err) {
      const statusCode = err?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        expiredEndpoints.push(sub.endpoint);
      }
    }
  }));
  if (expiredEndpoints.length > 0) {
    const cleaned = list.filter((s) => !expiredEndpoints.includes(s.endpoint));
    saveSubscribers(cleaned);
  } else if (mutated) {
    saveSubscribers(list);
  }
  return sentCount;
}
var require2, webpush, VAPID_FILE, SUBS_FILE, initialized = false, vapidKeys = null, subscribersCache = null;
var init_pushService = __esm(() => {
  init_apiUtils();
  require2 = createRequire(import.meta.url);
  webpush = require2("web-push");
  VAPID_FILE = path.resolve(process.cwd(), "server/.vapid-keys.json");
  SUBS_FILE = path.resolve(process.cwd(), "server/.push-subscriptions.json");
});

// server/goldWatcher.ts
function buildRateSignature(data) {
  return `${data.current.dateLabel}|${data.current.pavan22k}|${data.current.gram22k}|${data.scheduleLabel}|${data.entries.length}`;
}
function broadcastGoldUpdate(data) {
  const payload = `event: gold-update
data: ${JSON.stringify(data)}

`;
  for (const res of sseClients) {
    try {
      res.write(payload);
    } catch {
      sseClients.delete(res);
    }
  }
}
async function processCandidateLatest(next) {
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
function registerSseClient(res) {
  sseClients.add(res);
  res.write(`event: connected
data: ${JSON.stringify({ connectedAt: new Date().toISOString() })}

`);
  if (lastKnownLatest) {
    res.write(`event: gold-update
data: ${JSON.stringify(lastKnownLatest)}

`);
  }
  return () => {
    sseClients.delete(res);
  };
}
var sseClients, lastKnownLatest = null;
var init_goldWatcher = __esm(() => {
  init_goldService();
  init_pushService();
  sseClients = new Set;
});

// server/apiRouter.ts
init_apiUtils();
init_goldService();
import express from "express";
function registerApiRoutes(app, options = {}) {
  const serverless = options.serverless ?? process.env.VERCEL === "1";
  const defaultPort = options.defaultPort || Number(process.env.PORT) || 3000;
  app.set("trust proxy", true);
  app.use(express.json({ limit: "64kb" }));
  app.use("/api", apiSecurityAndCors);
  app.use("/api", createApiRateLimiter(120));
  app.get("/api/health", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      status: "ok",
      service: "Kerala Gold Price (KGP) API",
      version: "2.0.0",
      runtime: serverless ? "vercel-serverless" : "node-server",
      realtimeSync: true,
      sseSupported: !serverless,
      pushSupported: !serverless,
      providers: ALL_SOURCE_IDS,
      timestamp: new Date().toISOString()
    });
  });
  app.get("/api/openapi.json", (req, res) => {
    const protoHeader = req.headers["x-forwarded-proto"];
    const protocol = (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader)?.split(",")[0]?.trim() || req.protocol || "https";
    const host = req.get("host") || `localhost:${defaultPort}`;
    const spec = buildOpenApiSpec(`${protocol}://${host}`);
    res.setHeader("Cache-Control", "public, s-maxage=3600, max-age=3600");
    res.json(spec);
  });
  app.get("/api/gold/latest", async (req, res) => {
    try {
      const sourceParam = sanitizePreferredSource(req.query.source);
      const probeParam = req.query.probe === "true";
      const forceRefresh = req.query.refresh === "true" || req.query.force === "true";
      const data = await getLatestGoldWithFallback(sourceParam, probeParam, forceRefresh);
      if (!serverless && sourceParam === "auto") {
        await Promise.resolve().then(() => init_goldWatcher());
        processCandidateLatest(data);
      }
      if (forceRefresh) {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      } else {
        res.setHeader("Cache-Control", "public, s-maxage=45, stale-while-revalidate=90, max-age=15");
      }
      res.json(data);
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : "Unable to fetch live gold prices."
      });
    }
  });
  app.get("/api/gold/stream", async (req, res) => {
    if (serverless) {
      res.setHeader("Cache-Control", "no-store");
      res.status(501).json({
        sseSupported: false,
        runtime: "vercel-serverless",
        mode: "smart-polling",
        recommendedIntervalMs: 60000
      });
      return;
    }
    await Promise.resolve().then(() => init_goldWatcher());
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();
    const unregister = registerSseClient(res);
    req.on("close", unregister);
  });
  app.get("/api/push/public-key", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (serverless) {
      res.json({
        supported: false,
        reason: "serverless-runtime"
      });
      return;
    }
    try {
      await Promise.resolve().then(() => init_pushService());
      res.json({
        supported: true,
        publicKey: getVapidPublicKey()
      });
    } catch (error) {
      res.status(500).json({
        supported: false,
        error: error instanceof Error ? error.message : "Push keys unavailable."
      });
    }
  });
  app.post("/api/push/subscribe", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (serverless) {
      res.status(501).json({ ok: false, supported: false, reason: "serverless-runtime" });
      return;
    }
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      if (!body.subscription?.endpoint || !body.subscription?.keys?.p256dh || !body.subscription?.keys?.auth) {
        res.status(400).json({ error: "Invalid Web Push subscription payload." });
        return;
      }
      await Promise.resolve().then(() => init_pushService());
      const { count } = upsertPushSubscription(body.subscription, body.prefs || {});
      res.json({ ok: true, subscribers: count });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Failed to save push subscription."
      });
    }
  });
  app.post("/api/push/unsubscribe", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (serverless) {
      res.json({ ok: true, supported: false });
      return;
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (!body.endpoint) {
      res.status(400).json({ error: "Missing subscription endpoint." });
      return;
    }
    await Promise.resolve().then(() => init_pushService());
    const result = removePushSubscription(body.endpoint);
    res.json({ ok: true, ...result });
  });
  app.post("/api/push/test", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (serverless) {
      res.status(501).json({ ok: false, supported: false, reason: "serverless-runtime" });
      return;
    }
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      if (!body.endpoint) {
        res.status(400).json({ error: "Missing subscription endpoint." });
        return;
      }
      await Promise.resolve().then(() => init_pushService());
      const latest = await getLatestGoldWithFallback("auto", false, false);
      const sent = await sendTestPushToEndpoint(body.endpoint, latest, body.lang === "ml" ? "ml" : "en");
      res.json({ ok: sent });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : "Unable to send test Web Push notification."
      });
    }
  });
  app.get("/api/gold/shortcut", async (req, res) => {
    try {
      const sourceParam = sanitizePreferredSource(req.query.source);
      const format = String(req.query.format || "json").toLowerCase();
      const lang = req.query.lang === "ml" ? "ml" : "en";
      const forceRefresh = req.query.refresh === "true" || req.query.force === "true";
      const [latest, spot] = await Promise.all([
        getLatestGoldWithFallback(sourceParam, false, forceRefresh),
        getLiveSpotMarket().catch(() => null)
      ]);
      const payload = buildShortcutPayload(latest, spot);
      res.setHeader("Cache-Control", forceRefresh ? "no-store" : "public, s-maxage=45, stale-while-revalidate=90, max-age=15");
      if (format === "text" || format === "txt") {
        res.type("text/plain; charset=utf-8").send(lang === "ml" ? payload.summaryMalayalam : payload.summaryText);
        return;
      }
      res.json(payload);
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : "Unable to fetch shortcut gold summary."
      });
    }
  });
  app.get("/api/gold/sources", async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === "true" || req.query.force === "true";
      const probes = await getAllSourceProbes(forceRefresh);
      res.setHeader("Cache-Control", forceRefresh ? "no-store" : "public, s-maxage=60, stale-while-revalidate=120, max-age=30");
      res.json({ probes, checkedAt: new Date().toISOString() });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : "Source probe failed."
      });
    }
  });
  app.get("/api/gold/history", async (req, res) => {
    try {
      const rawMode = String(req.query.mode || "daily").toLowerCase();
      const mode = rawMode === "monthly" || rawMode === "yearly" ? rawMode : "daily";
      const year = sanitizeYear(req.query.year);
      const month = sanitizeMonth(req.query.month);
      const data = await getGoldHistory({ mode, year, month });
      const nowIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
      const currentIstYear = nowIst.getUTCFullYear();
      const currentIstMonth = nowIst.toLocaleString("en-US", { month: "long", timeZone: "UTC" }).toLowerCase();
      const isHistoricalFinished = mode === "daily" && year !== undefined && (year < currentIstYear || year === currentIstYear && month !== currentIstMonth) || mode === "monthly" && year !== undefined && year < currentIstYear;
      res.setHeader("Cache-Control", isHistoricalFinished ? "public, s-maxage=86400, stale-while-revalidate=604800, max-age=3600" : "public, s-maxage=180, stale-while-revalidate=360, max-age=60");
      res.json(data);
    } catch (error) {
      res.status(404).json({
        error: error instanceof Error ? error.message : "History archive unavailable."
      });
    }
  });
  app.get("/api/gold/spot", async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === "true" || req.query.force === "true";
      const spot = await getLiveSpotMarket();
      res.setHeader("Cache-Control", forceRefresh ? "no-store" : "public, s-maxage=45, stale-while-revalidate=90, max-age=20");
      res.json(spot);
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : "Live spot feed unavailable."
      });
    }
  });
  const handleCalculate = async (params, res) => {
    try {
      const latest = await getLatestGoldWithFallback(sanitizePreferredSource(params.source), false);
      const unit = params.unit === "gram" ? "gram" : "pavan";
      const purity = params.purity === "24k" || params.purity === "18k" ? params.purity : "22k";
      const makingMode = params.makingMode === "perGram" || params.makingMode === "flat" ? params.makingMode : "percent";
      const result = calculateJewelleryBreakdown({
        weight: params.weight !== undefined ? Number(params.weight) : 1,
        unit,
        purity,
        ratePerGram: params.ratePerGram !== undefined ? Number(params.ratePerGram) : undefined,
        makingMode,
        makingValue: params.makingValue !== undefined ? Number(params.makingValue) : undefined,
        gstPercent: params.gst !== undefined ? Number(params.gst) : undefined,
        hallmark: params.hallmark === true || params.hallmark === "true" || params.hallmark === "1",
        stoneCharge: params.stone !== undefined ? Number(params.stone) : 0,
        oldGoldDeduction: params.exchange !== undefined ? Number(params.exchange) : 0,
        budget: params.budget !== undefined ? Number(params.budget) : undefined
      }, latest.current.gram22k, latest.current.dateLabel, latest.sourceName);
      res.setHeader("Cache-Control", "no-store");
      res.json(result);
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : "Calculation failed."
      });
    }
  };
  app.get("/api/gold/calculate", (req, res) => handleCalculate(req.query, res));
  app.post("/api/gold/calculate", (req, res) => handleCalculate(req.body && typeof req.body === "object" ? req.body : {}, res));
  app.get("/api/gold/alert-check", async (req, res) => {
    try {
      const unit = req.query.unit === "gram" ? "gram" : "pavan";
      const direction = req.query.direction === "above" ? "above" : "below";
      const format = String(req.query.format || "json").toLowerCase();
      const lang = req.query.lang === "ml" ? "ml" : "en";
      const hasTarget = req.query.target !== undefined && req.query.target !== "";
      const targetPrice = hasTarget ? clampFinite(req.query.target, 0, 0, 1e7) : 0;
      const prevPavan = clampFinite(req.query.prevPavan, 0, 0, 1e7);
      if (hasTarget && targetPrice <= 0) {
        res.status(400).json({
          error: "Please pass a valid positive numeric ?target= value (e.g. ?target=98000&unit=pavan)."
        });
        return;
      }
      const latest = await getLatestGoldWithFallback("auto", false, req.query.refresh !== "false");
      const { pavan22k, gram22k, changePavan, changeGram, dateLabel } = latest.current;
      const arrow = latest.current.direction === "up" ? "▲" : latest.current.direction === "down" ? "▼" : "●";
      const colorEmoji = latest.current.direction === "up" ? "\uD83D\uDFE2" : latest.current.direction === "down" ? "\uD83D\uDD34" : "\uD83D\uDFE1";
      const trendColor = latest.current.direction === "up" ? "green" : latest.current.direction === "down" ? "red" : "amber";
      const currentRate = unit === "pavan" ? pavan22k : gram22k;
      const targetMet = targetPrice > 0 ? direction === "above" ? currentRate >= targetPrice : currentRate <= targetPrice : false;
      const priceChanged = prevPavan > 0 ? pavan22k !== prevPavan : changePavan !== 0;
      const chgPavanText = changePavan === 0 ? "● 0" : `${arrow} ${changePavan > 0 ? "+" : "-"}₹${Math.abs(changePavan).toLocaleString("en-IN")}`;
      const chgGramText = changeGram === 0 ? "● 0" : `${arrow} ${changeGram > 0 ? "+" : "-"}₹${Math.abs(changeGram).toLocaleString("en-IN")}/g`;
      const notificationTitle = targetMet ? `${colorEmoji} \uD83C\uDFAF ${lang === "ml" ? "ലക്ഷ്യ വിലയിലെത്തി!" : "Gold Target Met!"} (${dateLabel})` : `${colorEmoji} ${arrow} ${lang === "ml" ? "കേരള 22K സ്വർണ്ണ വില" : "Kerala 22K Gold"} · ${dateLabel}`;
      const notificationBody = lang === "ml" ? `1 പവൻ: ${formatInrServer(pavan22k)} (${chgPavanText}) | 1 ഗ്രാം: ${formatInrServer(gram22k)} (${chgGramText}) · ${latest.scheduleLabel}` : `1 Pavan: ${formatInrServer(pavan22k)} (${chgPavanText}) | 1 Gram: ${formatInrServer(gram22k)} (${chgGramText}) · ${latest.scheduleLabel}`;
      res.setHeader("Cache-Control", "no-store");
      if (format === "text" || format === "txt") {
        res.type("text/plain; charset=utf-8").send(`${notificationTitle}
${notificationBody}`);
        return;
      }
      res.json({
        alertTriggered: targetMet || priceChanged,
        targetEnabled: targetPrice > 0,
        targetMet,
        priceChanged,
        unit,
        direction,
        targetPrice: targetPrice > 0 ? targetPrice : null,
        pavan22k,
        gram22k,
        pavan22kFormatted: formatInrServer(pavan22k),
        gram22kFormatted: formatInrServer(gram22k),
        changePavan,
        changeGram,
        changePavanFormatted: chgPavanText,
        changeGramFormatted: chgGramText,
        trendDirection: latest.current.direction,
        trendSymbol: arrow,
        colorEmoji,
        trendColor,
        currentRate,
        currentRateFormatted: formatInrServer(currentRate),
        targetPriceFormatted: targetPrice > 0 ? formatInrServer(targetPrice) : null,
        difference: targetPrice > 0 ? Math.round(currentRate - targetPrice) : null,
        dateLabel,
        schedule: latest.scheduleLabel,
        updatedTimeIst: latest.updatedTimeIst,
        source: latest.sourceName,
        notificationTitle,
        notificationBody,
        message: `${notificationTitle} — ${notificationBody}`
      });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : "Unable to evaluate gold price alert."
      });
    }
  });
}
function createApiApp(options = {}) {
  const app = express();
  registerApiRoutes(app, options);
  return app;
}

// api/_entry.ts
var app = createApiApp({ serverless: true });
var _entry_default = app;
export {
  _entry_default as default
};
