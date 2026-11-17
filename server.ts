import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import {fileURLToPath} from 'url';
import {
  ALL_SOURCE_IDS,
  apiSecurityAndCors,
  buildOpenApiSpec,
  buildShortcutPayload,
  calculateJewelleryBreakdown,
  clampFinite,
  createApiRateLimiter,
  formatInrServer,
  sanitizeMonth,
  sanitizePreferredSource,
  sanitizeYear,
} from './server/apiUtils.ts';
import {
  getAllSourceProbes,
  getGoldHistory,
  getLatestGoldWithFallback,
  getLiveSpotMarket,
} from './server/goldService.ts';
import {processCandidateLatest, registerSseClient, startGoldWatcher} from './server/goldWatcher.ts';
import {
  getVapidPublicKey,
  removePushSubscription,
  sendTestPushToEndpoint,
  upsertPushSubscription,
} from './server/pushService.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  app.set('trust proxy', true);
  app.use(express.json({limit: '64kb'}));

  // Public API CORS, Security Headers & Rate Limiter
  app.use('/api', apiSecurityAndCors);
  app.use('/api', createApiRateLimiter(120));

  // Health & API Discovery
  app.get('/api/health', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      status: 'ok',
      service: 'Kerala Gold Price (KGP) API',
      version: '1.1.0',
      providers: ALL_SOURCE_IDS,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/openapi.json', (req, res) => {
    const protocol = req.protocol || 'https';
    const host = req.get('host') || `localhost:${PORT}`;
    const spec = buildOpenApiSpec(`${protocol}://${host}`);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.json(spec);
  });

  // Live Kerala Gold Price + Multi-Source Fallback + Force Refresh Bypass
  app.get('/api/gold/latest', async (req, res) => {
    try {
      const sourceParam = sanitizePreferredSource(req.query.source);
      const probeParam = req.query.probe === 'true';
      const forceRefresh = req.query.refresh === 'true' || req.query.force === 'true';
      const data = await getLatestGoldWithFallback(sourceParam, probeParam, forceRefresh);
      if (sourceParam === 'auto') {
        void processCandidateLatest(data);
      }
      res.setHeader('Cache-Control', forceRefresh ? 'no-store' : 'public, max-age=30');
      res.json(data);
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Unable to fetch live gold prices.',
      });
    }
  });

  // Real-Time Server-Sent Events (SSE) stream for instant price & alert broadcasts
  app.get('/api/gold/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const unregister = registerSseClient(res);
    req.on('close', unregister);
  });

  // Web Push (VAPID) Subscription Management for Closed-App Background Alerts
  app.get('/api/push/public-key', (_req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        supported: true,
        publicKey: getVapidPublicKey(),
      });
    } catch (error) {
      res.status(500).json({
        supported: false,
        error: error instanceof Error ? error.message : 'Push keys unavailable.',
      });
    }
  });

  app.post('/api/push/subscribe', (req, res) => {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
        subscription?: {endpoint?: string; keys?: {p256dh?: string; auth?: string}};
        prefs?: Record<string, unknown>;
      };
      if (
        !body.subscription?.endpoint ||
        !body.subscription?.keys?.p256dh ||
        !body.subscription?.keys?.auth
      ) {
        res.status(400).json({error: 'Invalid Web Push subscription payload.'});
        return;
      }
      const {count} = upsertPushSubscription(
        body.subscription as Parameters<typeof upsertPushSubscription>[0],
        body.prefs || {},
      );
      res.setHeader('Cache-Control', 'no-store');
      res.json({ok: true, subscribers: count});
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to save push subscription.',
      });
    }
  });

  app.post('/api/push/unsubscribe', (req, res) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {endpoint?: string};
    if (!body.endpoint) {
      res.status(400).json({error: 'Missing subscription endpoint.'});
      return;
    }
    const result = removePushSubscription(body.endpoint);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ok: true, ...result});
  });

  app.post('/api/push/test', async (req, res) => {
    try {
      const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
        endpoint?: string;
        lang?: string;
      };
      if (!body.endpoint) {
        res.status(400).json({error: 'Missing subscription endpoint.'});
        return;
      }
      const latest = await getLatestGoldWithFallback('auto', false, false);
      const sent = await sendTestPushToEndpoint(
        body.endpoint,
        latest,
        body.lang === 'ml' ? 'ml' : 'en',
      );
      res.setHeader('Cache-Control', 'no-store');
      res.json({ok: sent});
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Unable to send test Web Push notification.',
      });
    }
  });

  // Flat Apple iPhone Shortcuts & External Web Widget Endpoint (JSON or Plain Text)
  app.get('/api/gold/shortcut', async (req, res) => {
    try {
      const sourceParam = sanitizePreferredSource(req.query.source);
      const format = String(req.query.format || 'json').toLowerCase();
      const lang = req.query.lang === 'ml' ? 'ml' : 'en';
      const forceRefresh = req.query.refresh === 'true' || req.query.force === 'true';

      const [latest, spot] = await Promise.all([
        getLatestGoldWithFallback(sourceParam, false, forceRefresh),
        getLiveSpotMarket().catch(() => null),
      ]);
      const payload = buildShortcutPayload(latest, spot);
      res.setHeader('Cache-Control', forceRefresh ? 'no-store' : 'public, max-age=30');

      if (format === 'text' || format === 'txt') {
        res.type('text/plain; charset=utf-8').send(
          lang === 'ml' ? payload.summaryMalayalam : payload.summaryText,
        );
        return;
      }

      res.json(payload);
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Unable to fetch shortcut gold summary.',
      });
    }
  });

  // Source Availability & Latency Probes
  app.get('/api/gold/sources', async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === 'true' || req.query.force === 'true';
      const probes = await getAllSourceProbes(forceRefresh);
      res.setHeader('Cache-Control', forceRefresh ? 'no-store' : 'public, max-age=60');
      res.json({probes, checkedAt: new Date().toISOString()});
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Source probe failed.',
      });
    }
  });

  // Daily / Monthly / Yearly Gold History (1925–Present)
  app.get('/api/gold/history', async (req, res) => {
    try {
      const rawMode = String(req.query.mode || 'daily').toLowerCase();
      const mode = rawMode === 'monthly' || rawMode === 'yearly' ? rawMode : 'daily';
      const year = sanitizeYear(req.query.year);
      const month = sanitizeMonth(req.query.month);
      const data = await getGoldHistory({mode, year, month});
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(data);
    } catch (error) {
      res.status(404).json({
        error: error instanceof Error ? error.message : 'History archive unavailable.',
      });
    }
  });

  // Live International XAU/INR & USD/INR Spot Market Context
  app.get('/api/gold/spot', async (_req, res) => {
    try {
      const spot = await getLiveSpotMarket();
      res.setHeader('Cache-Control', 'public, max-age=45');
      res.json(spot);
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Live spot feed unavailable.',
      });
    }
  });

  // Making-Charge & Reverse Budget Calculator API (GET for Shortcuts + POST for web apps)
  const handleCalculate = async (params: Record<string, unknown>, res: express.Response) => {
    try {
      const latest = await getLatestGoldWithFallback(sanitizePreferredSource(params.source), false);
      const unit = params.unit === 'gram' ? 'gram' : 'pavan';
      const purity = params.purity === '24k' || params.purity === '18k' ? params.purity : '22k';
      const makingMode =
        params.makingMode === 'perGram' || params.makingMode === 'flat' ? params.makingMode : 'percent';

      const result = calculateJewelleryBreakdown(
        {
          weight: params.weight !== undefined ? Number(params.weight) : 1,
          unit,
          purity,
          ratePerGram: params.ratePerGram !== undefined ? Number(params.ratePerGram) : undefined,
          makingMode,
          makingValue: params.makingValue !== undefined ? Number(params.makingValue) : undefined,
          gstPercent: params.gst !== undefined ? Number(params.gst) : undefined,
          hallmark: params.hallmark === true || params.hallmark === 'true' || params.hallmark === '1',
          stoneCharge: params.stone !== undefined ? Number(params.stone) : 0,
          oldGoldDeduction: params.exchange !== undefined ? Number(params.exchange) : 0,
          budget: params.budget !== undefined ? Number(params.budget) : undefined,
        },
        latest.current.gram22k,
        latest.current.dateLabel,
        latest.sourceName,
      );

      res.setHeader('Cache-Control', 'no-store');
      res.json(result);
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Calculation failed.',
      });
    }
  };

  app.get('/api/gold/calculate', (req, res) => handleCalculate(req.query as Record<string, unknown>, res));
  app.post('/api/gold/calculate', (req, res) =>
    handleCalculate((req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>, res),
  );

  // Dual-Unit Daily + Price-Change + Target Price Alert Check API (for iPhone Shortcuts, PWA & external webhooks)
  app.get('/api/gold/alert-check', async (req, res) => {
    try {
      const unit = req.query.unit === 'gram' ? 'gram' : 'pavan';
      const direction = req.query.direction === 'above' ? 'above' : 'below';
      const format = String(req.query.format || 'json').toLowerCase();
      const lang = req.query.lang === 'ml' ? 'ml' : 'en';
      const hasTarget = req.query.target !== undefined && req.query.target !== '';
      const targetPrice = hasTarget ? clampFinite(req.query.target, 0, 0, 10_000_000) : 0;
      const prevPavan = clampFinite(req.query.prevPavan, 0, 0, 10_000_000);

      if (hasTarget && targetPrice <= 0) {
        res.status(400).json({
          error: 'Please pass a valid positive numeric ?target= value (e.g. ?target=98000&unit=pavan).',
        });
        return;
      }

      const latest = await getLatestGoldWithFallback('auto', false, req.query.refresh === 'true');
      const {pavan22k, gram22k, changePavan, changeGram, dateLabel} = latest.current;
      const arrow = latest.current.direction === 'up' ? '▲' : latest.current.direction === 'down' ? '▼' : '●';
      const colorEmoji = latest.current.direction === 'up' ? '🟢' : latest.current.direction === 'down' ? '🔴' : '🟡';
      const trendColor = latest.current.direction === 'up' ? 'green' : latest.current.direction === 'down' ? 'red' : 'amber';

      const currentRate = unit === 'pavan' ? pavan22k : gram22k;
      const targetMet =
        targetPrice > 0
          ? direction === 'above'
            ? currentRate >= targetPrice
            : currentRate <= targetPrice
          : false;
      const priceChanged = prevPavan > 0 ? pavan22k !== prevPavan : changePavan !== 0;

      const chgPavanText =
        changePavan === 0
          ? '● 0'
          : `${arrow} ${changePavan > 0 ? '+' : '-'}₹${Math.abs(changePavan).toLocaleString('en-IN')}`;
      const chgGramText =
        changeGram === 0
          ? '● 0'
          : `${arrow} ${changeGram > 0 ? '+' : '-'}₹${Math.abs(changeGram).toLocaleString('en-IN')}/g`;

      const notificationTitle = targetMet
        ? `${colorEmoji} 🎯 ${lang === 'ml' ? 'ലക്ഷ്യ വിലയിലെത്തി!' : 'Gold Target Met!'} (${dateLabel})`
        : `${colorEmoji} ${arrow} ${lang === 'ml' ? 'കേരള 22K സ്വർണ്ണ വില' : 'Kerala 22K Gold'} · ${dateLabel}`;

      const notificationBody =
        lang === 'ml'
          ? `1 പവൻ: ${formatInrServer(pavan22k)} (${chgPavanText}) | 1 ഗ്രാം: ${formatInrServer(gram22k)} (${chgGramText}) · ${latest.scheduleLabel}`
          : `1 Pavan: ${formatInrServer(pavan22k)} (${chgPavanText}) | 1 Gram: ${formatInrServer(gram22k)} (${chgGramText}) · ${latest.scheduleLabel}`;

      res.setHeader('Cache-Control', 'no-store');

      if (format === 'text' || format === 'txt') {
        res.type('text/plain; charset=utf-8').send(`${notificationTitle}\n${notificationBody}`);
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
        message: `${notificationTitle} — ${notificationBody}`,
      });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Unable to evaluate gold price alert.',
      });
    }
  });

  if (!isProd) {
    const {createServer: createViteServer} = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: {server: httpServer},
        hmr: hmrDisabled ? false : {server: httpServer},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Kerala Gold Price server running on http://0.0.0.0:${PORT}`);
    startGoldWatcher();
  });
}

startServer();
