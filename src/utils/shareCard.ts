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

  if (lang === 'ml') {
    return [
      `ഇന്നത്തെ കേരള സ്വർണ്ണ വില (${current.dateLabel})`,
      `1 പവൻ (22K): ${formatInr(current.pavan22k)} (${chgPavan})`,
      `1 ഗ്രാം (22K): ${formatInr(current.gram22k)}`,
      `24K: ${formatInr(current.gram24kEstimate)}/g · 18K: ${formatInr(current.gram18kEstimate)}/g`,
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

  const recentEntries = (data.entries || []).slice(-5).reverse();
  const hasRecent = recentEntries.length > 0;
  const width = 960;
  const height = hasRecent ? 820 : 620;
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
  drawRoundedRect(ctx, 68, 136, 404, 244, 24);
  const cardGrad = ctx.createLinearGradient(68, 136, 472, 380);
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
  drawRoundedRect(ctx, 68, 136, 404, 244, 24);
  ctx.clip();
  const shineGrad = ctx.createLinearGradient(120, 136, 390, 380);
  shineGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  shineGrad.addColorStop(0.45, isDark ? 'rgba(253, 224, 138, 0.14)' : 'rgba(255, 255, 255, 0.55)');
  shineGrad.addColorStop(0.65, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = shineGrad;
  ctx.fillRect(68, 136, 404, 244);
  ctx.restore();

  ctx.strokeStyle = isDark ? 'rgba(239, 184, 73, 0.38)' : 'rgba(184, 119, 20, 0.36)';
  ctx.lineWidth = 1.25;
  drawRoundedRect(ctx, 68, 136, 404, 244, 24);
  ctx.stroke();

  ctx.fillStyle = isDark ? '#fde68a' : '#854d0e';
  ctx.font = '600 19px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(lang === 'ml' ? '1 പവൻ (8 ഗ്രാം · 22K)' : '1 PAVAN (8g · 22K)', 96, 178);

  // Fraunces Gold Metallic Price Numerals
  const textGrad = ctx.createLinearGradient(96, 210, 440, 290);
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
  ctx.font = '700 60px "Fraunces", Georgia, serif';
  ctx.fillText(formatInr(data.current.pavan22k), 96, 258);

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
  ctx.font = '600 21px "Plus Jakarta Sans", system-ui, sans-serif';
  const changeStr =
    data.current.changePavan === 0
      ? lang === 'ml'
        ? 'മാറ്റമില്ല'
        : 'Steady Today'
      : `${isUp ? '▲' : '▼'} ${formatSignedInr(data.current.changePavan)} (${data.current.changePercent > 0 ? '+' : ''}${data.current.changePercent}%)`;
  ctx.fillText(changeStr, 96, 306);

  ctx.fillStyle = isDark ? 'rgba(243, 244, 246, 0.72)' : 'rgba(22, 24, 29, 0.68)';
  ctx.font = '500 17px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(`24K Est: ${formatInr(data.current.pavan24kEstimate)}`, 96, 348);

  // Right Box: 1 Gram + Other Purities
  drawRoundedRect(ctx, 494, 136, 398, 244, 24);
  ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.045)' : 'rgba(255, 255, 255, 0.62)';
  ctx.fill();
  ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(22, 24, 29, 0.10)';
  ctx.stroke();

  ctx.fillStyle = isDark ? 'rgba(243, 244, 246, 0.85)' : 'rgba(22, 24, 29, 0.75)';
  ctx.font = '600 19px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(lang === 'ml' ? '1 ഗ്രാം (22K)' : '1 GRAM (22K)', 522, 178);

  ctx.fillStyle = isDark ? '#ffffff' : '#16181d';
  ctx.font = '700 58px "Fraunces", Georgia, serif';
  ctx.fillText(formatInr(data.current.gram22k), 522, 258);

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
  ctx.font = '600 21px "Plus Jakarta Sans", system-ui, sans-serif';
  const chgGram =
    data.current.changeGram === 0
      ? lang === 'ml'
        ? 'മാറ്റമില്ല'
        : 'Steady'
      : `${isUp ? '▲' : '▼'} ${formatSignedInr(data.current.changeGram)}/g`;
  ctx.fillText(chgGram, 522, 306);

  ctx.fillStyle = isDark ? 'rgba(243, 244, 246, 0.72)' : 'rgba(22, 24, 29, 0.68)';
  ctx.font = '500 17px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(
    `24K: ${formatInr(data.current.gram24kEstimate)}/g  ·  18K: ${formatInr(data.current.gram18kEstimate)}/g`,
    522,
    348,
  );

  // Recent 5-Day Price Trend Box (Helps users judge market direction)
  let nextY = 402;
  if (hasRecent) {
    drawRoundedRect(ctx, 68, nextY, width - 136, 224, 20);
    ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(255, 255, 255, 0.52)';
    ctx.fill();
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.09)' : 'rgba(22, 24, 29, 0.09)';
    ctx.stroke();

    ctx.fillStyle = isDark ? '#efb849' : '#9a5b0a';
    ctx.font = '600 16px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.fillText(
      lang === 'ml' ? 'സമീപകാല വില മാറ്റങ്ങൾ (1 പവൻ)' : 'RECENT PRICE TREND (1 PAVAN · BUYERS CONTEXT)',
      94,
      nextY + 34,
    );

    const highStr = data.monthlyHigh ? `High: ${formatInr(data.monthlyHigh.pavan)}` : '';
    const lowStr = data.monthlyLow ? `Low: ${formatInr(data.monthlyLow.pavan)}` : '';
    const rangeTxt = [highStr, lowStr].filter(Boolean).join(' · ');
    if (rangeTxt) {
      ctx.fillStyle = isDark ? 'rgba(243, 244, 246, 0.65)' : 'rgba(22, 24, 29, 0.62)';
      ctx.font = '500 15px "Plus Jakarta Sans", system-ui, sans-serif';
      const rw = ctx.measureText(rangeTxt).width;
      ctx.fillText(rangeTxt, width - 94 - rw, nextY + 34);
    }

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

    nextY += 244;
  }

  // Footer attribution strip
  drawRoundedRect(ctx, 68, nextY, width - 136, 74, 18);
  ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.45)';
  ctx.fill();
  ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(22, 24, 29, 0.08)';
  ctx.stroke();

  ctx.fillStyle = isDark ? 'rgba(243, 244, 246, 0.72)' : 'rgba(22, 24, 29, 0.68)';
  ctx.font = '500 16px "Plus Jakarta Sans", system-ui, sans-serif';
  ctx.fillText(`Updated ${data.updatedTimeIst}  ·  Source: ${data.sourceName}`, 94, nextY + 43);

  ctx.fillStyle = isDark ? '#efb849' : '#9a5b0a';
  ctx.font = '600 15px "Plus Jakarta Sans", system-ui, sans-serif';
  const badge = data.monthLabel;
  const bw = ctx.measureText(badge).width;
  ctx.fillText(badge, width - 94 - bw, nextY + 43);

  return await new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}
