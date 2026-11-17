import type {AppLanguage, LatestGoldResponse} from '../types/gold';
import {formatInr, formatSignedInr} from './format';

export type ShareAspectRatio = 'auto' | '9:16' | '4:5' | '1:1';

export interface ShareCustomPhoto {
  dataUrl: string;
  zoom: number;
  offsetX: number; // -1 to 1 normalized pan offset
  offsetY: number; // -1 to 1 normalized pan offset
  scrimOpacity: number; // 0 to 0.85 backdrop dim for text legibility
}

export interface ShareCardOptions {
  includeChart?: boolean;
  includeHistory?: boolean;
  aspectRatio?: ShareAspectRatio;
  customPhoto?: ShareCustomPhoto | null;
}

export const SHARE_PHOTO_CACHE_KEY = 'kgp-share-custom-photo-v1';

const imageCache = new Map<string, HTMLImageElement>();

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function readCachedSharePhoto(): ShareCustomPhoto | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SHARE_PHOTO_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ShareCustomPhoto>;
    if (!parsed || typeof parsed.dataUrl !== 'string' || !parsed.dataUrl.startsWith('data:image/')) {
      return null;
    }
    return {
      dataUrl: parsed.dataUrl,
      zoom: clamp(Number(parsed.zoom) || 1, 1, 2.5),
      offsetX: clamp(Number(parsed.offsetX) || 0, -1, 1),
      offsetY: clamp(Number(parsed.offsetY) || 0, -1, 1),
      scrimOpacity: clamp(Number(parsed.scrimOpacity ?? 0.35), 0, 0.85),
    };
  } catch {
    return null;
  }
}

export function saveCachedSharePhoto(photo: ShareCustomPhoto): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(SHARE_PHOTO_CACHE_KEY, JSON.stringify(photo));
    return true;
  } catch {
    return false;
  }
}

export function clearCachedSharePhoto(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SHARE_PHOTO_CACHE_KEY);
  } catch {
    // ignore storage errors
  }
}

export async function processCustomPhotoFile(file: File): Promise<string> {
  if (typeof document === 'undefined') {
    throw new Error('Image processing unavailable in this environment.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode selected image.'));
      el.src = objectUrl;
    });

    const maxDim = 1280;
    const srcW = img.naturalWidth || img.width || 1;
    const srcH = img.naturalHeight || img.height || 1;
    const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
    const targetW = Math.max(1, Math.round(srcW * scale));
    const targetH = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas unavailable to optimize image.');
    }

    ctx.drawImage(img, 0, 0, targetW, targetH);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
    imageCache.set(dataUrl, img);
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadPhotoElement(dataUrl: string): Promise<HTMLImageElement | null> {
  const cached = imageCache.get(dataUrl);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return cached;
  }

  return await new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(dataUrl, img);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export function buildShareText(data: LatestGoldResponse, lang: AppLanguage): string {
  const {current} = data;
  const dirArrow = current.direction === 'up' ? '▲' : current.direction === 'down' ? '▼' : '•';
  const chgPavan =
    current.changePavan === 0 ? 'No change' : `${dirArrow} ${formatSignedInr(current.changePavan)}`;

  const recentEntries = (data.entries || []).slice(-5).reverse();
  const recentLines = recentEntries.map((e) => {
    const arrow = e.direction === 'up' ? '▲' : e.direction === 'down' ? '▼' : '•';
    const diff = e.changePavan === 0 ? 'Steady' : `${arrow} ${formatSignedInr(e.changePavan)}`;
    return `• ${e.dateLabel} (${e.session}): ${formatInr(e.pavan)} (${diff})`;
  });

  const highStr = data.monthlyHigh ? `High: ${formatInr(data.monthlyHigh.pavan)}` : '';
  const lowStr = data.monthlyLow ? `Low: ${formatInr(data.monthlyLow.pavan)}` : '';
  const rangeSummary = [highStr, lowStr].filter(Boolean).join(' · ');

  if (lang === 'ml') {
    return [
      `ഇന്നത്തെ കേരള സ്വർണ്ണ വില (${current.dateLabel})`,
      `1 പവൻ (22K): ${formatInr(current.pavan22k)} (${chgPavan})`,
      `1 ഗ്രാം (22K): ${formatInr(current.gram22k)}`,
      `24K: ${formatInr(current.gram24kEstimate)}/g · 18K: ${formatInr(current.gram18kEstimate)}/g`,
      ...(rangeSummary ? [`${data.monthLabel}: ${rangeSummary}`] : []),
      ...(recentLines.length > 0 ? ['', 'സമീപകാല നിരക്കുകൾ (1 പവൻ):', ...recentLines] : []),
      '',
      `പുതുക്കിയത്: ${data.updatedTimeIst} (${data.sourceName})`,
    ].join('\n');
  }

  return [
    `Kerala Gold Price (${current.dateLabel} · ${data.scheduleLabel})`,
    `1 Pavan (8g, 22K): ${formatInr(current.pavan22k)} (${chgPavan})`,
    `1 Gram (22K): ${formatInr(current.gram22k)}`,
    `24K: ${formatInr(current.gram24kEstimate)}/g · 18K: ${formatInr(current.gram18kEstimate)}/g`,
    ...(rangeSummary ? [`${data.monthLabel} Range: ${rangeSummary}`] : []),
    ...(recentLines.length > 0 ? ['', 'Recent Trend (1 Pavan):', ...recentLines] : []),
    '',
    `Updated: ${data.updatedTimeIst} · Source: ${data.sourceName}`,
  ].join('\n');
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export async function renderShareCardPng(
  data: LatestGoldResponse,
  lang: AppLanguage,
  theme: 'light' | 'dark' = 'dark',
  options: ShareCardOptions = {},
): Promise<Blob | null> {
  if (typeof document === 'undefined') return null;

  if (document.fonts && 'ready' in document.fonts) {
    try {
      await document.fonts.ready;
    } catch {
      // Proceed cleanly with fallback serif
    }
  }

  const monthEntries = data.entries || [];
  const hasChart = (options.includeChart ?? true) && monthEntries.length >= 2;
  const recentEntries = monthEntries.slice(-5).reverse();
  const hasRecent = (options.includeHistory ?? true) && recentEntries.length > 0;
  const aspectRatio: ShareAspectRatio = options.aspectRatio ?? 'auto';
  const customPhoto = options.customPhoto ?? null;

  const cardW = 960;
  let cardH = 510;
  if (hasChart) cardH += 250;
  if (hasRecent) cardH += 238;

  let canvasW = cardW;
  let canvasH = cardH;
  if (aspectRatio === '9:16') {
    canvasW = 1080;
    canvasH = 1920;
  } else if (aspectRatio === '4:5') {
    canvasW = 1080;
    canvasH = 1350;
  } else if (aspectRatio === '1:1') {
    canvasW = 1080;
    canvasH = 1080;
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const isDark = theme === 'dark';

  // Background Layer 1: App Day/Night gradient canvas
  const bg = ctx.createLinearGradient(0, 0, canvasW, canvasH);
  if (isDark) {
    bg.addColorStop(0, '#0e1118');
    bg.addColorStop(0.55, '#16130e');
    bg.addColorStop(1, '#090b10');
  } else {
    bg.addColorStop(0, '#f8f5ee');
    bg.addColorStop(0.55, '#f2ead9');
    bg.addColorStop(1, '#f7f3ea');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvasW, canvasH);

  let photoRendered = false;
  if (customPhoto?.dataUrl) {
    const photoImg = await loadPhotoElement(customPhoto.dataUrl);
    if (photoImg && photoImg.naturalWidth > 0 && photoImg.naturalHeight > 0) {
      const baseScale = Math.max(
        canvasW / photoImg.naturalWidth,
        canvasH / photoImg.naturalHeight,
      );
      const zoom = clamp(customPhoto.zoom || 1, 1, 2.5);
      const drawW = photoImg.naturalWidth * baseScale * zoom;
      const drawH = photoImg.naturalHeight * baseScale * zoom;
      const maxPanX = Math.max(0, (drawW - canvasW) / 2);
      const maxPanY = Math.max(0, (drawH - canvasH) / 2);
      const dx = (canvasW - drawW) / 2 + clamp(customPhoto.offsetX || 0, -1, 1) * maxPanX;
      const dy = (canvasH - drawH) / 2 + clamp(customPhoto.offsetY || 0, -1, 1) * maxPanY;

      ctx.drawImage(photoImg, dx, dy, drawW, drawH);

      const scrim = clamp(customPhoto.scrimOpacity ?? 0.35, 0, 0.85);
      if (scrim > 0) {
        ctx.fillStyle = isDark
          ? `rgba(8, 10, 16, ${scrim.toFixed(2)})`
          : `rgba(248, 245, 238, ${(scrim * 0.72).toFixed(2)})`;
        ctx.fillRect(0, 0, canvasW, canvasH);
      }
      photoRendered = true;
    }
  }

  if (!photoRendered) {
    // Ambient Gold Radial Glows
    const glow1 = ctx.createRadialGradient(
      canvasW * 0.22,
      canvasH * 0.18,
      10,
      canvasW * 0.22,
      canvasH * 0.18,
      Math.max(canvasW, canvasH) * 0.45,
    );
    glow1.addColorStop(0, isDark ? 'rgba(239, 184, 73, 0.22)' : 'rgba(218, 165, 62, 0.24)');
    glow1.addColorStop(1, 'rgba(218, 165, 62, 0)');
    ctx.fillStyle = glow1;
    ctx.fillRect(0, 0, canvasW, canvasH);

    const glow2 = ctx.createRadialGradient(
      canvasW * 0.82,
      canvasH * 0.84,
      10,
      canvasW * 0.82,
      canvasH * 0.84,
      Math.max(canvasW, canvasH) * 0.4,
    );
    glow2.addColorStop(0, isDark ? 'rgba(212, 148, 42, 0.16)' : 'rgba(184, 119, 20, 0.16)');
    glow2.addColorStop(1, 'rgba(184, 119, 20, 0)');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  // Transform & center the 960 x cardH card frame safely inside any aspect ratio
  const padX = aspectRatio === 'auto' ? 0 : 48;
  const padY = aspectRatio === 'auto' ? 0 : 64;
  const cardScale =
    aspectRatio === 'auto' ? 1 : Math.min((canvasW - padX) / cardW, (canvasH - padY) / cardH);
  const offsetX = (canvasW - cardW * cardScale) / 2;
  const offsetY = (canvasH - cardH * cardScale) / 2;

  ctx.save();
  ctx.translate(offsetX, offsetY);
  ctx.scale(cardScale, cardScale);

  // Outer Liquid Glass Card Frame
  drawRoundedRect(ctx, 32, 32, cardW - 64, cardH - 64, 32);
  if (photoRendered) {
    ctx.fillStyle = isDark ? 'rgba(12, 15, 22, 0.72)' : 'rgba(255, 255, 255, 0.84)';
  } else {
    ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(255, 255, 255, 0.72)';
  }
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = isDark ? 'rgba(239, 184, 73, 0.38)' : 'rgba(184, 119, 20, 0.34)';
  ctx.stroke();

  // Header Strip
  ctx.fillStyle = isDark ? '#efb849' : '#9a5b0a';
  ctx.font = '700 20px "Outfit", "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    lang === 'ml' ? 'കേരള സ്വർണ്ണ വില · KGP' : 'KERALA GOLD PRICE · KGP',
    68,
    86,
  );

  ctx.fillStyle = isDark ? 'rgba(243, 244, 246, 0.78)' : 'rgba(22, 24, 29, 0.72)';
  ctx.font = '500 18px "Plus Jakarta Sans", system-ui, sans-serif';
  const dateInfo = `${data.current.dateLabel}  ·  ${data.scheduleLabel}`;
  const dateWidth = ctx.measureText(dateInfo).width;
  ctx.fillText(dateInfo, cardW - 68 - dateWidth, 86);

  // Subtle divider
  ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(22, 24, 29, 0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(68, 112);
  ctx.lineTo(cardW - 68, 112);
  ctx.stroke();

  // Left Primary Brushed Gold Box: 1 Pavan (8g)
  drawRoundedRect(ctx, 68, 134, 404, 236, 24);
  const cardGrad = ctx.createLinearGradient(68, 134, 472, 370);
  if (isDark) {
    cardGrad.addColorStop(0, 'rgba(239, 184, 73, 0.24)');
    cardGrad.addColorStop(0.5, 'rgba(255, 241, 184, 0.12)');
    cardGrad.addColorStop(1, 'rgba(212, 148, 42, 0.06)');
  } else {
    cardGrad.addColorStop(0, 'rgba(239, 184, 73, 0.28)');
    cardGrad.addColorStop(0.5, 'rgba(255, 251, 235, 0.88)');
    cardGrad.addColorStop(1, 'rgba(218, 165, 62, 0.16)');
  }
  ctx.fillStyle = cardGrad;
  ctx.fill();

  ctx.save();
  drawRoundedRect(ctx, 68, 134, 404, 236, 24);
  ctx.clip();
  const shineGrad = ctx.createLinearGradient(120, 134, 390, 370);
  shineGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  shineGrad.addColorStop(0.45, isDark ? 'rgba(253, 224, 138, 0.14)' : 'rgba(255, 255, 255, 0.55)');
  shineGrad.addColorStop(0.65, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = shineGrad;
  ctx.fillRect(68, 134, 404, 236);
  ctx.restore();

  ctx.strokeStyle = isDark ? 'rgba(239, 184, 73, 0.42)' : 'rgba(184, 119, 20, 0.36)';
  ctx.lineWidth = 1.25;
  drawRoundedRect(ctx, 68, 134, 404, 236, 24);
  ctx.stroke();

  ctx.fillStyle = isDark ? '#fde68a' : '#854d0e';
  ctx.font = '600 18px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(lang === 'ml' ? '1 പവൻ (8 ഗ്രാം · 22K)' : '1 PAVAN (8g · 22K)', 96, 174);

  const textGrad = ctx.createLinearGradient(96, 204, 440, 286);
  if (isDark) {
    textGrad.addColorStop(0, '#f5d07a');
    textGrad.addColorStop(0.45, '#fff3c4');
    textGrad.addColorStop(1, '#efb849');
  } else {
    textGrad.addColorStop(0, '#7c4706');
    textGrad.addColorStop(0.5, '#c48112');
    textGrad.addColorStop(1, '#7c4706');
  }
  ctx.fillStyle = textGrad;
  ctx.font = '700 58px "Fraunces", Georgia, serif';
  ctx.fillText(formatInr(data.current.pavan22k), 96, 250);

  const isUp = data.current.direction === 'up';
  const isDown = data.current.direction === 'down';
  ctx.fillStyle = isUp
    ? isDark
      ? '#34d399'
      : '#047857'
    : isDown
      ? isDark
        ? '#fb7185'
        : '#be123c'
      : isDark
        ? '#94a3b8'
        : '#64748b';
  ctx.font = '600 20px "Plus Jakarta Sans", system-ui, sans-serif';
  const changeStr =
    data.current.changePavan === 0
      ? lang === 'ml'
        ? 'മാറ്റമില്ല'
        : 'Steady Today'
      : `${isUp ? '▲' : '▼'} ${formatSignedInr(data.current.changePavan)} (${data.current.changePercent > 0 ? '+' : ''}${data.current.changePercent}%)`;
  ctx.fillText(changeStr, 96, 298);

  ctx.fillStyle = isDark ? 'rgba(243, 244, 246, 0.78)' : 'rgba(22, 24, 29, 0.72)';
  ctx.font = '500 17px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(`24K Est: ${formatInr(data.current.pavan24kEstimate)}`, 96, 338);

  // Right Box: 1 Gram + Other Purities
  drawRoundedRect(ctx, 494, 134, 398, 236, 24);
  ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(255, 255, 255, 0.68)';
  ctx.fill();
  ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(22, 24, 29, 0.12)';
  ctx.stroke();

  ctx.fillStyle = isDark ? 'rgba(243, 244, 246, 0.88)' : 'rgba(22, 24, 29, 0.78)';
  ctx.font = '600 18px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(lang === 'ml' ? '1 ഗ്രാം (22K)' : '1 GRAM (22K)', 522, 174);

  ctx.fillStyle = isDark ? '#ffffff' : '#16181d';
  ctx.font = '700 56px "Fraunces", Georgia, serif';
  ctx.fillText(formatInr(data.current.gram22k), 522, 250);

  ctx.fillStyle = isUp
    ? isDark
      ? '#34d399'
      : '#047857'
    : isDown
      ? isDark
        ? '#fb7185'
        : '#be123c'
      : isDark
        ? '#94a3b8'
        : '#64748b';
  ctx.font = '600 20px "Plus Jakarta Sans", system-ui, sans-serif';
  const chgGram =
    data.current.changeGram === 0
      ? lang === 'ml'
        ? 'മാറ്റമില്ല'
        : 'Steady'
      : `${isUp ? '▲' : '▼'} ${formatSignedInr(data.current.changeGram)}/g`;
  ctx.fillText(chgGram, 522, 298);

  ctx.fillStyle = isDark ? 'rgba(243, 244, 246, 0.78)' : 'rgba(22, 24, 29, 0.72)';
  ctx.font = '500 17px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    `24K: ${formatInr(data.current.gram24kEstimate)}/g  ·  18K: ${formatInr(data.current.gram18kEstimate)}/g`,
    522,
    338,
  );

  let nextY = 390;

  // Optional Miniature Monthly Price Chart Section
  if (hasChart) {
    const chartBoxH = 232;
    drawRoundedRect(ctx, 68, nextY, cardW - 136, chartBoxH, 22);
    ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.62)';
    ctx.fill();
    ctx.strokeStyle = isDark ? 'rgba(239, 184, 73, 0.24)' : 'rgba(184, 119, 20, 0.24)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const firstPt = monthEntries[0];
    const lastPt = monthEntries[monthEntries.length - 1];
    const monthNet = lastPt.pavan - firstPt.pavan;
    const minVal = Math.min(...monthEntries.map((p) => p.pavan));
    const maxVal = Math.max(...monthEntries.map((p) => p.pavan));
    const span = Math.max(1, maxVal - minVal);
    const padLow = Math.round(minVal - span * 0.12);
    const padHigh = Math.round(maxVal + span * 0.12);
    const padSpan = Math.max(1, padHigh - padLow);

    let peakIdx = 0;
    let lowIdx = 0;
    monthEntries.forEach((p, idx) => {
      if (p.pavan >= monthEntries[peakIdx].pavan) peakIdx = idx;
      if (p.pavan <= monthEntries[lowIdx].pavan) lowIdx = idx;
    });

    ctx.fillStyle = isDark ? '#efb849' : '#9a5b0a';
    ctx.font = '700 15px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(
      `${data.monthLabel.toUpperCase()} CHART · ${monthEntries.length} UPDATES`,
      94,
      nextY + 32,
    );

    const mUp = monthNet > 0;
    const mDown = monthNet < 0;
    const netText =
      monthNet === 0
        ? 'Month: Steady'
        : `Month Net: ${mUp ? '▲' : '▼'} ${formatSignedInr(monthNet)}   ·   H: ${formatInr(maxVal)}  ·  L: ${formatInr(minVal)}`;
    ctx.fillStyle = mUp
      ? isDark
        ? '#34d399'
        : '#047857'
      : mDown
        ? isDark
          ? '#fb7185'
          : '#be123c'
        : isDark
          ? '#cbd5e1'
          : '#475569';
    ctx.font = '600 14px "Plus Jakarta Sans", system-ui, sans-serif';
    const netW = ctx.measureText(netText).width;
    ctx.fillText(netText, cardW - 94 - netW, nextY + 32);

    const plotX = 166;
    const plotY = nextY + 54;
    const plotW = cardW - 94 - plotX;
    const plotH = 128;

    const yTicks = [padHigh, Math.round((padHigh + padLow) / 2), padLow];
    yTicks.forEach((tickVal, idx) => {
      const ty = plotY + (idx / 2) * plotH;
      ctx.save();
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.11)' : 'rgba(22, 24, 29, 0.10)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotX, ty);
      ctx.lineTo(plotX + plotW, ty);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = isDark ? 'rgba(243, 244, 246, 0.65)' : 'rgba(22, 24, 29, 0.62)';
      ctx.font = '500 13px "JetBrains Mono", monospace';
      const lbl = formatInr(tickVal);
      const lw = ctx.measureText(lbl).width;
      ctx.fillText(lbl, plotX - lw - 12, ty + 4);
    });

    const pts = monthEntries.map((entry, idx) => {
      const x = plotX + (idx / Math.max(1, monthEntries.length - 1)) * plotW;
      const y = plotY + plotH - ((entry.pavan - padLow) / padSpan) * plotH;
      return {x, y, entry};
    });

    const areaGrad = ctx.createLinearGradient(0, plotY, 0, plotY + plotH);
    areaGrad.addColorStop(0, isDark ? 'rgba(239, 184, 73, 0.34)' : 'rgba(212, 148, 42, 0.28)');
    areaGrad.addColorStop(1, 'rgba(212, 148, 42, 0.01)');

    ctx.beginPath();
    ctx.moveTo(pts[0].x, plotY + plotH);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, plotY + plotH);
    ctx.closePath();
    ctx.fillStyle = areaGrad;
    ctx.fill();

    ctx.beginPath();
    pts.forEach((p, idx) => {
      if (idx === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = isDark ? '#efb849' : '#b87714';
    ctx.lineWidth = 2.8;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    const drawMarker = (pt: {x: number; y: number}, fill: string, ring: string) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = ring;
      ctx.stroke();
    };

    const ringBg = isDark ? '#12151d' : '#ffffff';
    drawMarker(pts[peakIdx], '#10b981', ringBg);
    drawMarker(pts[lowIdx], '#f43f5e', ringBg);
    drawMarker(pts[pts.length - 1], isDark ? '#fde047' : '#d97706', ringBg);

    const midIdx = Math.floor((monthEntries.length - 1) / 2);
    const xTicks = [
      {idx: 0, text: firstPt.dateLabel.replace(/-\d{2}$/, ''), align: 'left' as const},
      {idx: midIdx, text: monthEntries[midIdx].dateLabel.replace(/-\d{2}$/, ''), align: 'center' as const},
      {idx: monthEntries.length - 1, text: lastPt.dateLabel.replace(/-\d{2}$/, ''), align: 'right' as const},
    ];

    ctx.fillStyle = isDark ? 'rgba(243, 244, 246, 0.65)' : 'rgba(22, 24, 29, 0.62)';
    ctx.font = '500 13px "Plus Jakarta Sans", system-ui, sans-serif';
    xTicks.forEach((tk) => {
      const px = pts[tk.idx].x;
      const tw = ctx.measureText(tk.text).width;
      const tx = tk.align === 'left' ? px : tk.align === 'right' ? px - tw : px - tw / 2;
      ctx.fillText(tk.text, tx, plotY + plotH + 22);
    });

    ctx.font = '600 12px "Plus Jakarta Sans", system-ui, sans-serif';
    const peakTag = `● Peak ${monthEntries[peakIdx].dateLabel.replace(/-\d{2}$/, '')}: ${formatInr(monthEntries[peakIdx].pavan)}`;
    const lowTag = `● Low ${monthEntries[lowIdx].dateLabel.replace(/-\d{2}$/, '')}: ${formatInr(monthEntries[lowIdx].pavan)}`;
    ctx.fillStyle = isDark ? '#34d399' : '#047857';
    ctx.fillText(peakTag, plotX, plotY + plotH + 40);
    const peakW = ctx.measureText(peakTag).width;
    ctx.fillStyle = isDark ? '#fb7185' : '#be123c';
    ctx.fillText(lowTag, plotX + peakW + 22, plotY + plotH + 40);

    nextY += chartBoxH + 18;
  }

  // Optional Recent 5-Day Price Trend Box
  if (hasRecent) {
    drawRoundedRect(ctx, 68, nextY, cardW - 136, 220, 20);
    ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(255, 255, 255, 0.58)';
    ctx.fill();
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.11)' : 'rgba(22, 24, 29, 0.10)';
    ctx.stroke();

    ctx.fillStyle = isDark ? '#efb849' : '#9a5b0a';
    ctx.font = '600 16px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(
      lang === 'ml' ? 'സമീപകാല വില മാറ്റങ്ങൾ (1 പവൻ)' : 'RECENT RATE LOG (1 PAVAN · BUYER CONTEXT)',
      94,
      nextY + 34,
    );

    recentEntries.forEach((entry, idx) => {
      const rowY = nextY + 68 + idx * 32;
      if (idx > 0) {
        ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(22, 24, 29, 0.07)';
        ctx.beginPath();
        ctx.moveTo(94, rowY - 22);
        ctx.lineTo(cardW - 94, rowY - 22);
        ctx.stroke();
      }

      ctx.fillStyle = isDark ? '#f1f5f9' : '#1e293b';
      ctx.font = '600 16px "Plus Jakarta Sans", system-ui, sans-serif';
      ctx.fillText(`${entry.dateLabel}  (${entry.session})`, 94, rowY);

      ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
      ctx.font = '600 17px "JetBrains Mono", monospace';
      const priceText = `${formatInr(entry.pavan)}  ·  ${formatInr(entry.gram)}/g`;
      ctx.fillText(priceText, 450, rowY);

      const eUp = entry.direction === 'up';
      const eDown = entry.direction === 'down';
      ctx.fillStyle = eUp
        ? isDark
          ? '#34d399'
          : '#047857'
        : eDown
          ? isDark
            ? '#fb7185'
            : '#be123c'
          : isDark
            ? '#94a3b8'
            : '#64748b';
      ctx.font = '600 16px "Plus Jakarta Sans", system-ui, sans-serif';
      const deltaStr =
        entry.changePavan === 0
          ? '—'
          : `${eUp ? '▲' : '▼'} ${formatSignedInr(entry.changePavan)}`;
      const dw = ctx.measureText(deltaStr).width;
      ctx.fillText(deltaStr, cardW - 94 - dw, rowY);
    });

    nextY += 238;
  }

  // Footer attribution strip
  drawRoundedRect(ctx, 68, nextY, cardW - 136, 70, 18);
  ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.52)';
  ctx.fill();
  ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(22, 24, 29, 0.09)';
  ctx.stroke();

  ctx.fillStyle = isDark ? 'rgba(243, 244, 246, 0.78)' : 'rgba(22, 24, 29, 0.72)';
  ctx.font = '500 16px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(`Updated ${data.updatedTimeIst}  ·  Source: ${data.sourceName}`, 94, nextY + 41);

  ctx.fillStyle = isDark ? '#efb849' : '#9a5b0a';
  ctx.font = '600 15px "Plus Jakarta Sans", system-ui, sans-serif';
  const badge = data.monthLabel;
  const bw = ctx.measureText(badge).width;
  ctx.fillText(badge, cardW - 94 - bw, nextY + 41);

  ctx.restore();

  return await new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}
