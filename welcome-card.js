// Generador de la tarjeta de bienvenida "Nuevo Tanner" (Concepto B).
// Dibuja un PNG de 1080x1920 (formato historia de Instagram) en un <canvas>
// a partir de los datos del registro recién guardado, para compartir por WhatsApp / redes.

const W = 1080, H = 1920;

const FONT_FACES = [
  ['Barlow Condensed', '600', '/fonts/barlow-condensed-600.woff2'],
  ['Barlow Condensed', '700', '/fonts/barlow-condensed-700.woff2'],
  ['Barlow Condensed', '800', '/fonts/barlow-condensed-800.woff2'],
  ['Inter', '400', '/fonts/inter-400.woff2'],
  ['Inter', '600', '/fonts/inter-600.woff2'],
  ['Inter', '800', '/fonts/inter-800.woff2'],
];

const COLORS = {
  cream: '#f6f2e8',
  navy: '#0d2229',
  gold: '#c8ae62',
  goldLight: '#e9d19c',
  goldDark: '#a9895a',
  line: '#ddd2ab',
  label: '#8a7a4d',
  muted: '#5c6a63',
  fine: '#9a8f6f',
};

let fontsReadyPromise = null;
function ensureFonts() {
  if (fontsReadyPromise) return fontsReadyPromise;
  fontsReadyPromise = Promise.all(
    FONT_FACES.map(([family, weight, url]) => {
      const face = new FontFace(family, `url(${url})`, { weight });
      return face
        .load()
        .then((loaded) => { document.fonts.add(loaded); return loaded; })
        .catch(() => null);
    })
  ).then(() => (document.fonts.ready ? document.fonts.ready : null));
  return fontsReadyPromise;
}

function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    img.src = src;
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCover(ctx, img, x, y, w, h) {
  const ir = img.width / img.height, br = w / h;
  let sx, sy, sw, sh;
  if (ir > br) { sh = img.height; sw = sh * br; sx = (img.width - sw) / 2; sy = 0; }
  else { sw = img.width; sh = sw / br; sx = 0; sy = (img.height - sh) / 2; }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function measureSpaced(ctx, text, font, spacing) {
  ctx.font = font;
  let w = 0;
  for (const ch of text) w += ctx.measureText(ch).width + spacing;
  if (text.length) w -= spacing;
  return w;
}

function drawSpaced(ctx, text, x, y, font, spacing, color, align = 'left') {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const total = measureSpaced(ctx, text, font, spacing);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
  return total;
}

function drawCenteredWrapped(ctx, text, cx, y, maxWidth, font, lineHeight, color) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const lines = wrapLines(ctx, text, maxWidth);
  lines.forEach((ln, i) => ctx.fillText(ln, cx, y + i * lineHeight));
  ctx.textAlign = 'left';
  return y + (lines.length - 1) * lineHeight;
}

function drawSilhouette(ctx, cx, cy, size) {
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = COLORS.navy;
  const r = size * 0.2;
  ctx.beginPath();
  ctx.arc(cx, cy - size * 0.12, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.42, cy + size * 0.46);
  ctx.quadraticCurveTo(cx - size * 0.42, cy + size * 0.02, cx, cy + size * 0.02);
  ctx.quadraticCurveTo(cx + size * 0.42, cy + size * 0.02, cx + size * 0.42, cy + size * 0.46);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCornerTicks(ctx, x, y, w, h, len, thick, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = thick;
  const segs = [
    [[x, y + len], [x, y], [x + len, y]],
    [[x + w - len, y], [x + w, y], [x + w, y + len]],
    [[x, y + h - len], [x, y + h], [x + len, y + h]],
    [[x + w - len, y + h], [x + w, y + h], [x + w, y + h - len]],
  ];
  segs.forEach((seg) => {
    ctx.beginPath();
    ctx.moveTo(seg[0][0], seg[0][1]);
    ctx.lineTo(seg[1][0], seg[1][1]);
    ctx.lineTo(seg[2][0], seg[2][1]);
    ctx.stroke();
  });
}

function drawInfoRow(ctx, { label, value, x, width, y, valueSize = 44, uppercaseValue = false }) {
  const labelFont = '800 15px Inter';
  drawSpaced(ctx, label.toUpperCase(), x, y + 15, labelFont, 4, COLORS.label, 'left');
  const valFont = `700 ${valueSize}px "Barlow Condensed"`;
  ctx.font = valFont;
  const text = uppercaseValue ? String(value || '').toUpperCase() : String(value || '');
  const lines = wrapLines(ctx, text, width);
  const vy = y + 25 + valueSize * 0.75;
  const lineHeight = valueSize * 1.05;
  ctx.fillStyle = COLORS.navy;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  lines.forEach((ln, i) => ctx.fillText(ln, x, vy + i * lineHeight));
  const valueBottom = vy + (lines.length - 1) * lineHeight + 8;
  const rowBottom = valueBottom + 16;
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, rowBottom);
  ctx.lineTo(x + width, rowBottom);
  ctx.stroke();
  return rowBottom + 16;
}

async function safeLoad(src) {
  try { return await loadImageEl(src); } catch { return null; }
}

/**
 * Genera la tarjeta de bienvenida como PNG (1080x1920, formato historia).
 * @returns {Promise<{canvas:HTMLCanvasElement, blob:Blob}>}
 */
export async function renderWelcomeCard({ firstName, lastName, category, folio, dateStr, photoUrl }) {
  await ensureFonts();

  const [photoImg, crestGold, wordmarkGold, crestNavy] = await Promise.all([
    photoUrl ? safeLoad(photoUrl) : Promise.resolve(null),
    safeLoad('/brand/crest-gold.png'),
    safeLoad('/brand/wordmark-gold.png'),
    safeLoad('/brand/crest-navy.png'),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // fondo
  ctx.fillStyle = COLORS.cream;
  ctx.fillRect(0, 0, W, H);

  // textura fina tipo papel seguridad
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = COLORS.navy;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let ox = -H; ox < W + H; ox += 26) { ctx.moveTo(ox, 0); ctx.lineTo(ox + H, H); }
  ctx.stroke();
  ctx.restore();

  // header
  const headerGrad = ctx.createLinearGradient(0, 0, W * 0.3, 300);
  headerGrad.addColorStop(0, '#0f2b32');
  headerGrad.addColorStop(1, '#07191e');
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, W, 300);
  const barGrad = ctx.createLinearGradient(0, 0, W, 0);
  barGrad.addColorStop(0, COLORS.goldDark);
  barGrad.addColorStop(0.4, COLORS.goldLight);
  barGrad.addColorStop(0.6, COLORS.gold);
  barGrad.addColorStop(1, COLORS.goldDark);
  ctx.fillStyle = barGrad;
  ctx.fillRect(0, 294, W, 6);

  if (crestGold) {
    const crestH = 78, crestW = crestH * (crestGold.width / crestGold.height);
    ctx.drawImage(crestGold, W / 2 - crestW / 2, 66, crestW, crestH);
  }
  if (wordmarkGold) {
    const wmH = 56, wmW = wmH * (wordmarkGold.width / wordmarkGold.height);
    ctx.drawImage(wordmarkGold, W / 2 - wmW / 2, 66 + 78 + 14, wmW, wmH);
  }
  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(W / 2 - 70, 246, 140, 2);

  // badge de estatus
  const badgeText = `CREDENCIAL DE INGRESO ${new Date().getFullYear()}`;
  const badgeFont = '800 16px Inter';
  const badgeSpacing = 4;
  const badgeTextW = measureSpaced(ctx, badgeText, badgeFont, badgeSpacing);
  const padX = 30, pillH = 44, pillW = badgeTextW + padX * 2;
  const pillX = W / 2 - pillW / 2, pillY = 272;
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fillStyle = COLORS.navy;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = COLORS.gold;
  ctx.stroke();
  drawSpaced(ctx, badgeText, W / 2, pillY + pillH / 2 + 6, badgeFont, badgeSpacing, COLORS.goldLight, 'center');

  // foto + datos
  const pbX = 90, pbY = 380, pbW = 290, pbH = 360;
  const pbGrad = ctx.createLinearGradient(pbX, pbY, pbX + pbW, pbY + pbH);
  pbGrad.addColorStop(0, '#e3dac0');
  pbGrad.addColorStop(1, '#efe9d8');
  ctx.fillStyle = pbGrad;
  ctx.fillRect(pbX, pbY, pbW, pbH);
  if (photoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(pbX + 2, pbY + 2, pbW - 4, pbH - 4);
    ctx.clip();
    drawCover(ctx, photoImg, pbX, pbY, pbW, pbH);
    ctx.restore();
  } else {
    drawSilhouette(ctx, pbX + pbW / 2, pbY + pbH / 2, 170);
  }
  ctx.strokeStyle = COLORS.navy;
  ctx.lineWidth = 2;
  ctx.strokeRect(pbX + 1, pbY + 1, pbW - 2, pbH - 2);
  drawCornerTicks(ctx, pbX - 2, pbY - 2, pbW + 4, pbH + 4, 20, 4, COLORS.gold);

  const infoX = 424, infoWidth = W - 90 - infoX;
  let cursorY = pbY + 6;
  cursorY = drawInfoRow(ctx, { label: 'Nombre', value: `${firstName} ${lastName}`.trim(), x: infoX, width: infoWidth, y: cursorY, valueSize: 50, uppercaseValue: true });
  cursorY = drawInfoRow(ctx, { label: 'Categoría', value: category || 'Por definir', x: infoX, width: infoWidth, y: cursorY, valueSize: 44 });
  cursorY = drawInfoRow(ctx, { label: 'Folio · Fecha', value: `${folio || ''} · ${dateStr || ''}`, x: infoX, width: infoWidth, y: cursorY, valueSize: 36 });

  const idRowBottom = Math.max(pbY + pbH, cursorY);

  // bienvenida
  let welcomeTop = idRowBottom + 90;
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(90, welcomeTop);
  ctx.lineTo(W - 90, welcomeTop);
  ctx.stroke();
  let lastBaseline = drawCenteredWrapped(ctx, '¡BIENVENIDO A LA FAMILIA TANNER!', W / 2, welcomeTop + 36 + 54, 900, '800 60px "Barlow Condensed"', 66, COLORS.navy);
  ctx.font = '600 19px Inter';
  ctx.fillStyle = COLORS.muted;
  ctx.textAlign = 'center';
  ctx.fillText('Tu registro quedó autenticado en Tannery City F.C.', W / 2, lastBaseline + 40);
  ctx.textAlign = 'left';

  // fine print
  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(W / 2 - 32, 1330, 64, 2);
  drawSpaced(ctx, 'DOCUMENTO GENERADO AUTOMÁTICAMENTE POR TANNEROS', W / 2, 1330 + 38, '600 16px Inter', 0.5, COLORS.fine, 'center');
  drawSpaced(ctx, 'VÁLIDO COMO COMPROBANTE DE REGISTRO EN TANNERY CITY F.C.', W / 2, 1330 + 66, '600 16px Inter', 0.5, COLORS.fine, 'center');

  // sello
  ctx.save();
  ctx.translate(895, 1595);
  ctx.rotate((-9 * Math.PI) / 180);
  ctx.beginPath();
  ctx.arc(0, 0, 95, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.cream;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.navy;
  ctx.stroke();
  ctx.beginPath();
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = COLORS.goldDark;
  ctx.lineWidth = 1.5;
  ctx.arc(0, 0, 85, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  if (crestNavy) {
    const ch = 46, cw = ch * (crestNavy.width / crestNavy.height);
    ctx.drawImage(crestNavy, -cw / 2, -44, cw, ch);
  }
  drawSpaced(ctx, 'AUTENTICADO', 0, 22, '800 13px Inter', 2, COLORS.navy, 'center');
  drawSpaced(ctx, 'TCFC', 0, 40, '800 13px Inter', 2, COLORS.navy, 'center');
  ctx.restore();

  // footer
  ctx.fillStyle = COLORS.navy;
  ctx.fillRect(0, 1780, W, 140);
  drawSpaced(ctx, 'CURTIMOS CAMPEONES DEL MUNDO', W / 2, 1838, '600 18px Inter', 3, COLORS.gold, 'center');
  drawSpaced(ctx, '#WEARETANNERS', W / 2, 1876, '800 26px "Barlow Condensed"', 2, '#ffffff', 'center');

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 0.95));
  return { canvas, blob };
}
