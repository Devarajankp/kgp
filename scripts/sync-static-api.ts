import fs from 'fs';
import path from 'path';
import {buildOpenApiSpec, buildShortcutPayload} from '../server/apiUtils.ts';
import {getGoldHistory, getLatestGoldWithFallback, getLiveSpotMarket} from '../server/goldService.ts';

async function syncStaticApiFiles() {
  const nowYear = new Date().getFullYear();
  const [latest, monthly, yearly, spot] = await Promise.all([
    getLatestGoldWithFallback('auto', true),
    getGoldHistory({mode: 'monthly', year: nowYear}),
    getGoldHistory({mode: 'yearly'}),
    getLiveSpotMarket().catch(() => null),
  ]);

  const dataDir = path.resolve(process.cwd(), 'public/data');
  const apiDir = path.resolve(process.cwd(), 'public/api');
  fs.mkdirSync(dataDir, {recursive: true});
  fs.mkdirSync(apiDir, {recursive: true});

  fs.writeFileSync(
    path.join(dataDir, 'kerala-gold-snapshot.json'),
    JSON.stringify({latest, monthly, yearly}, null, 2),
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

  console.log(
    `Synced static PWA & Shortcut JSON snapshots: ${latest.current.dateLabel} · Pavan ₹${latest.current.pavan22k}`,
  );
}

syncStaticApiFiles().catch((err) => {
  console.error('Failed to sync static API files:', err);
  process.exit(1);
});
