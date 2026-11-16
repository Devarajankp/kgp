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

  // Live Kerala Gold Price + Multi-Source Fallback
  app.get('/api/gold/latest', async (req, res) => {
    try {
      const sourceParam = sanitizePreferredSource(req.query.source);
      const probeParam = req.query.probe === 'true';
      const data = await getLatestGoldWithFallback(sourceParam, probeParam);
      res.setHeader('Cache-Control', 'public, max-age=45');
      res.json(data);
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Unable to fetch live gold prices.',
      });
    }
  });

  // Flat Apple iPhone Shortcuts & External Web Widget Endpoint (JSON or Plain Text)
  app.get('/api/gold/shortcut', async (req, res) => {
    try {
      const sourceParam = sanitizePreferredSource(req.query.source);
      const format = String(req.query.format || 'json').toLowerCase();
      const lang = req.query.lang === 'ml' ? 'ml' : 'en';

      const [latest, spot] = await Promise.all([
        getLatestGoldWithFallback(sourceParam, false),
        getLiveSpotMarket().catch(() => null),
      ]);
      const payload = buildShortcutPayload(latest, spot);
      res.setHeader('Cache-Control', 'public, max-age=45');

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
  app.get('/api/gold/sources', async (_req, res) => {
    try {
      const probes = await getAllSourceProbes();
      res.setHeader('Cache-Control', 'public, max-age=60');
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

  // Target Price Alert Check API (for iPhone Shortcuts daily automation)
  app.get('/api/gold/alert-check', async (req, res) => {
    try {
      const unit = req.query.unit === 'gram' ? 'gram' : 'pavan';
      const targetPrice = clampFinite(req.query.target, 0, 0, 10_000_000);
      if (targetPrice <= 0) {
        res.status(400).json({
          error: 'Please pass a valid positive numeric ?target= value (e.g. ?target=98000&unit=pavan).',
        });
        return;
      }

      const latest = await getLatestGoldWithFallback('auto', false);
      const currentRate = unit === 'pavan' ? latest.current.pavan22k : latest.current.gram22k;
      const targetMet = currentRate <= targetPrice;
      const difference = Math.round(currentRate - targetPrice);

      res.setHeader('Cache-Control', 'no-store');
      res.json({
        targetMet,
        unit,
        targetPrice,
        currentRate,
        currentRateFormatted: formatInrServer(currentRate),
        targetPriceFormatted: formatInrServer(targetPrice),
        difference,
        dateLabel: latest.current.dateLabel,
        updatedTimeIst: latest.updatedTimeIst,
        source: latest.sourceName,
        message: targetMet
          ? `Target met! Kerala 22K (${unit}) is ${formatInrServer(currentRate)}, at or below ${formatInrServer(targetPrice)}.`
          : `Not met yet. Current Kerala 22K (${unit}) is ${formatInrServer(currentRate)} (${formatInrServer(difference)} above ${formatInrServer(targetPrice)}).`,
      });
    } catch (error) {
      res.status(502).json({
        error: error instanceof Error ? error.message : 'Unable to evaluate target price.',
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
  });
}

startServer();
