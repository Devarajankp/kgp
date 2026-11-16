import type {AppLanguage, LatestGoldResponse} from '../types/gold';
import {formatInr, formatSignedInr} from './format';

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
  const hasChart = monthEntries.length >= 2;
  const recentEntries = monthEntries.slice(-5).reverse();
  const hasRecent = recentEntries.length > 0;

  const width = 960;
  let height = 510;
  if (hasChart) height += 250;
  if (hasRecent) height += 238;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const isDark = theme === 'dark';

  // Background Canvas matching Day/Night App Theme
  const bg = ctx.createLinearGradient(0, 0, width, height);
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
  ctx.fillRect(0, 0, width, height);

  // Ambient Gold Radial Glows
  const glow1 = ctx.createRadialGradient(210, 140, 10, 210, 140, 420);
  glow1.addColorStop(0, isDark ? 'rgba(239, 184, 73, 0.22)' : 'rgba(218, 165, 62, 0.24)');
  glow1.addColorStop(1, 'rgba(218, 165, 62, 0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, width, height);

  const glow2 = ctx.createRadialGradient(790, height - 120, 10, 790, height - 120, 360);
  glow2.addColorStop(0, isDark ? 'rgba(212, 148, 42, 0.16)' : 'rgba(184, 119, 20, 0.16)');
  glow2.addColorStop(1, 'rgba(184, 119, 20, 0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, width, height);

  // Outer Liquid Glass Card Frame
  drawRoundedRect(ctx, 32, 32, width - 64, height - 64, 32);
  ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(255, 255, 255, 0.72)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = isDark ? 'rgba(239, 184, 73, 0.34)' : 'rgba(184, 119, 20, 0.30)';
  ctx.stroke();

  // Header Strip
  ctx.fillStyle = isDark ? '#efb849' : '#9a5b0a';
  ctx.font = '700 20px "Outfit", "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    lang === 'ml' ? 'കേരള സ്വർണ്ണ വില · KGP' : 'KERALA GOLD PRICE · KGP',
    68,
    86,
  );

  ctx.fillStyle = isDark ? 'rgba(243, 244, 246, 0.75)' : 'rgba(22, 24, 29, 0.68)';
  ctx.font = '500 18px "Plus Jakarta Sans", system-ui, sans-serif';
  const dateInfo = `${data.current.dateLabel}  ·  ${data.scheduleLabel}`;
  const dateWidth = ctx.measureText(dateInfo).width;
  ctx.fillText(dateInfo, width - 68 - dateWidth, 86);

  // Subtle divider
  ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.10)' : 'rgba(22, 24, 29, 0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(68, 112);
  ctx.lineTo(width - 68, 112);
  ctx.stroke();

  // Left Primary Brushed Gold Box: 1 Pavan (8g)
  drawRoundedRect(ctx, 68, 134, 404, 236, 24);
  const cardGrad = ctx.createLinearGradient(68, 134, 472, 370);
  if (isDark) {
    cardGrad.addColorStop(0, 'rgba(239, 184, 73, 0.22)');
    cardGrad.addColorStop(0.5, 'rgba(255, 241, 184, 0.10)');
    cardGrad.addColorStop(1, 'rgba(212, 148, 42, 0.05)');
  } else {
    cardGrad.addColorStop(0, 'rgba(239, 184, 73, 0.26)');
    cardGrad.addColorStop(0.5, 'rgba(255, 251, 235, 0.85)');
    cardGrad.addColorStop(1, 'rgba(218, 165, 62, 0.14)');
  }
  ctx.fillStyle = cardGrad;
  ctx.fill();

  // Specular metallic sheen streak inside Pavan tile
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

  ctx.strokeStyle = isDark ? 'rgba(239, 184, 73, 0.38)' : 'rgba(184, 119, 20, 0.36)';
  ctx.lineWidth = 1.25;
  drawRoundedRect(ctx, 68, 134, 404, 236, 24);
  ctx.stroke();

  ctx.fillStyle = isDark ? '#fde68a' : '#854d0e';
  ctx.font = '600 18px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(lang === 'ml' ? '1 പവൻ (8 ഗ്രാം · 22K)' : '1 PAVAN (8g · 22K)', 96, 174);

  // Fraunces Gold Metallic Price Numerals
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

  ctx.fillStyle = isDark ? 'rgba(243, 244, 246, 0.72)' : 'rgba(22, 24, 29, 0.68)';
  ctx.font = '500 17px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(`24K Est: ${formatInr(data.current.pavan24kEstimate)}`, 96, 338);

  // Right Box: 1 Gram + Other Purities
  drawRoundedRect(ctx, 494, 134, 398, 236, 24);
  ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(255, 255, 255, 0.62)';
  ctx.fill();
  ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(22, 24, 29, 0.10)';
  ctx.stroke();

  ctx.fillStyle = isDark ? 'rgba(243, 244, 246, 0.85)' : 'rgba(22, 24, 29, 0.75)';
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

  ctx.fillStyle = isDark ? 'rgba(243, 244, 246, 0.72)' : 'rgba(22, 24, 29, 0.68)';
  ctx.font = '500 17px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    `24K: ${formatInr(data.current.gram24kEstimate)}/g  ·  18K: ${formatInr(data.current.gram18kEstimate)}/g`,
    522,
    338,
  );

  let nextY = 390;

  // Miniature Monthly Price Chart Section (with Y-axis, X-axis, High/Low markers, and month delta)
  if (hasChart) {
    const chartBoxH = 232;
    drawRoundedRect(ctx, 68, nextY, width - 136, chartBoxH, 22);
    ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.038)' : 'rgba(255, 255, 255, 0.56)';
    ctx.fill();
    ctx.strokeStyle = isDark ? 'rgba(239, 184, 73, 0.22)' : 'rgba(184, 119, 20, 0.22)';
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

    // Chart Header
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
    ctx.fillText(netText, width - 94 - netW, nextY + 32);

    // Plot Box Geometry
    const plotX = 166;
    const plotY = nextY + 54;
    const plotW = width - 94 - plotX;
    const plotH = 128;

    // Horizontal Y-Axis Gridlines + Labels (Top, Mid, Low)
    const yTicks = [padHigh, Math.round((padHigh + padLow) / 2), padLow];
    yTicks.forEach((tickVal, idx) => {
      const ty = plotY + (idx / 2) * plotH;
      ctx.save();
      ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(22, 24, 29, 0.09)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotX, ty);
      ctx.lineTo(plotX + plotW, ty);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = isDark ? 'rgba(243, 244, 246, 0.58)' : 'rgba(22, 24, 29, 0.56)';
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

    // Gold Gradient Area Under Curve
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

    // Smooth Line Stroke
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

    // Highlight Peak, Low, and Latest Dots
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

    // Mini Legend Badges for Peak & Low inside chart footer
    const midIdx = Math.floor((monthEntries.length - 1) / 2);
    const xTicks = [
      {idx: 0, text: firstPt.dateLabel.replace(/-\d{2}$/, ''), align: 'left' as const},
      {idx: midIdx, text: monthEntries[midIdx].dateLabel.replace(/-\d{2}$/, ''), align: 'center' as const},
      {idx: monthEntries.length - 1, text: lastPt.dateLabel.replace(/-\d{2}$/, ''), align: 'right' as const},
    ];

    ctx.fillStyle = isDark ? 'rgba(243, 244, 246, 0.58)' : 'rgba(22, 24, 29, 0.58)';
    ctx.font = '500 13px "Plus Jakarta Sans", system-ui, sans-serif';
    xTicks.forEach((tk) => {
      const px = pts[tk.idx].x;
      const tw = ctx.measureText(tk.text).width;
      const tx = tk.align === 'left' ? px : tk.align === 'right' ? px - tw : px - tw / 2;
      ctx.fillText(tk.text, tx, plotY + plotH + 22);
    });

    // Peak & Low tiny callout line on bottom right of chart card
    ctx.font = '600 12px "Plus Jakarta Sans", system-ui, sans-serif';
    const peakTag = `● Peak ${firstPt ? monthEntries[peakIdx].dateLabel.replace(/-\d{2}$/, '') : ''}: ${formatInr(monthEntries[peakIdx].pavan)}`;
    const lowTag = `● Low ${monthEntries[lowIdx].dateLabel.replace(/-\d{2}$/, '')}: ${formatInr(monthEntries[lowIdx].pavan)}`;
    ctx.fillStyle = isDark ? '#34d399' : '#047857';
    ctx.fillText(peakTag, plotX, plotY + plotH + 40);
    const peakW = ctx.measureText(peakTag).width;
    ctx.fillStyle = isDark ? '#fb7185' : '#be123c';
    ctx.fillText(lowTag, plotX + peakW + 22, plotY + plotH + 40);

    nextY += chartBoxH + 18;
  }

  // Recent 5-Day Price Trend Box
  if (hasRecent) {
    drawRoundedRect(ctx, 68, nextY, width - 136, 220, 20);
    ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(255, 255, 255, 0.52)';
    ctx.fill();
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(22, 24, 29, 0.09)';
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
        ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(22, 24, 29, 0.06)';
        ctx.beginPath();
        ctx.moveTo(94, rowY - 22);
        ctx.lineTo(width - 94, rowY - 22);
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
      ctx.fillText(deltaStr, width - 94 - dw, rowY);
    });

    nextY += 238;
  }

  // Footer attribution strip
  drawRoundedRect(ctx, 68, nextY, width - 136, 70, 18);
  ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.45)';
  ctx.fill();
  ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(22, 24, 29, 0.08)';
  ctx.stroke();

  ctx.fillStyle = isDark ? 'rgba(243, 244, 246, 0.72)' : 'rgba(22, 24, 29, 0.68)';
  ctx.font = '500 16px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(`Updated ${data.updatedTimeIst}  ·  Source: ${data.sourceName}`, 94, nextY + 41);

  ctx.fillStyle = isDark ? '#efb849' : '#9a5b0a';
  ctx.font = '600 15px "Plus Jakarta Sans", system-ui, sans-serif';
  const badge = data.monthLabel;
  const bw = ctx.measureText(badge).width;
  ctx.fillText(badge, width - 94 - bw, nextY + 41);

  return await new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}
