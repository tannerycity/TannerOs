/* PROPUESTA POR MES (24/11/2026). La hoja carta del diseño que mandó
 * Presidencia ("ahí está todo para cotizar patrocinadores"):
 *   1. Portada: marca, paquete, meses, vigencia, los activos y los totales
 *      (base, extras, descuento, IVA aparte, total mensual y total del
 *      contrato sobre dorado), el texto legal y el pie negro.
 *   2. Si hay uniforme: frente, espalda, short y medias con un número en cada
 *      lugar elegido, y el acercamiento de la manga.
 *   3. Si hay canchas, complejo o experiencias con foto: la foto, qué es y
 *      cuántos espacios.
 * El pie lleva sólo el WhatsApp de la academia (decisión de Presidencia).
 * datosDeHoja() no dibuja: se prueba con node. hojaPdf() dibuja con jsPDF.
 * Los logos y las fotos del uniforme son del kit de Tannery: otro club ve su
 * nombre en letra y los lugares del uniforme sobre un fondo liso. */
import { categoriaDe } from './cotizar.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLarga = (f) => { if (!f) return ''; const [a, m, d] = String(f).slice(0, 10).split('-').map(Number); return d + ' de ' + MESES[m - 1] + ' de ' + a; };
// Grupo corto para la columna de la tabla (el del diseño).
const GRUPO = { uniforms: 'Uniforme', park: 'Complejo', digital: 'Digital', sports: 'Experiencias', other: 'Otro' };
const pesos = (n) => '$' + Math.round(Number(n || 0)).toLocaleString('es-MX');

// Dónde va cada lugar del uniforme, en % de la foto: [foto, x, y, ancho, alto].
export const POSICIONES = [
  // Sobre la playera extendida (frente y espalda, 25/11/2026).
  [/pecho/i, 'Frente', 33, 53, 28, 9],
  [/manga.*der/i, 'Frente', 4, 14, 13, 9],
  [/manga.*izq/i, 'Frente', 79, 12, 12, 18],
  [/espalda.*sup/i, 'Espalda', 31, 16, 43, 7],
  [/espalda.*inf/i, 'Espalda', 36, 78, 36, 11],
  [/short.*der/i, 'Medias', 56, 1, 12, 11],
  [/short.*izq/i, 'Medias', 32, 1, 12, 11],
  [/medias/i, 'Medias', 41, 22, 26, 22],
];
export const posicionDe = (nombre) => { const p = POSICIONES.find(([re]) => re.test(String(nombre || ''))); return p ? { lado: p[1], x: p[2], y: p[3], w: p[4], h: p[5] } : null; };

// Sólo fotos del kit que vienen con la app (nunca una dirección de afuera).
export const fotoDelKit = (f) => /^\/brand\/patrocinios\/[a-z0-9-]+\.(jpg|png)$/.test(String(f || '')) ? f : null;

// 524792651338 -> 479 265 1338
export function telefonoBonito(t) {
  let d = String(t || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('52')) d = d.slice(2);
  if (d.length === 13 && d.startsWith('521')) d = d.slice(3);
  return d.length === 10 ? d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6) : d;
}

export function datosDeHoja({ cot, activos = [], club = '', hoy, whatsapp = '', esTannery = false }) {
  const porId = new Map((activos || []).map((a) => [a.id, a]));
  const meses = Number(cot.months) > 0 ? Number(cot.months) : null;
  const ivaPct = Number(cot.ivaPct) || 0;
  const items = (cot.items || []).map((i) => ({ ...i, activo: porId.get(i.assetId) || null }));
  const esPaq = (i) => cot.packageAssetId && i.assetId === cot.packageAssetId;
  const lineas = items.map((i) => {
    const a = i.activo, q = Number(i.quantity || 1), importe = Number(i.unitPrice || 0) * q;
    return { grupo: esPaq(i) ? 'Paquete' : a ? GRUPO[categoriaDe(a)] || 'Otro' : 'Otro', nombre: i.description,
      cantidad: a?.piezas ? a.piezas * q : q, precio: importe > 0 ? pesos(importe) : 'Incluido', paquete: !!esPaq(i) };
  });
  const base = items.filter(esPaq).reduce((s, i) => s + Number(i.unitPrice || 0) * Number(i.quantity || 1), 0);
  const uniforme = items.filter((i) => i.activo && categoriaDe(i.activo) === 'uniforms' && posicionDe(i.description || i.activo.name))
    .map((i, k) => ({ n: k + 1, nombre: i.description, ...posicionDe(i.description || i.activo.name) }));
  const propiedades = items.filter((i) => fotoDelKit(i.activo?.foto)).map((i) => ({
    nombre: i.description, foto: fotoDelKit(i.activo.foto), descripcion: i.activo.description || '',
    cantidad: i.activo.piezas ? (i.activo.piezas * Number(i.quantity || 1)) + (i.activo.piezas * Number(i.quantity || 1) === 1 ? ' espacio' : ' espacios') : '' }));
  const anio = String(hoy || '').slice(0, 4);
  const tel = telefonoBonito(whatsapp);
  return {
    club, esTannery, folio: cot.folio || '', fecha: fechaLarga(hoy), anio,
    marca: cot.sponsorName || 'Tu marca', contacto: cot.contactName || '',
    paquete: cot.packageName || (meses ? 'Plan mensual' : 'Pago único'), meses, vigencia: cot.validUntil ? fechaLarga(cot.validUntil) : '',
    lineas, uniforme, manga: uniforme.some((u) => /manga/i.test(u.nombre)), propiedades,
    totales: {
      meses, ivaPct, base: pesos(base), extras: pesos(Number(cot.subtotal || 0) - base), conBase: base > 0,
      subtotal: pesos(cot.subtotal), descuento: Number(cot.discountAmount) > 0 ? '-' + pesos(cot.discountAmount) : '',
      descuentoPct: Number(cot.discountPct) || 0, iva: ivaPct ? pesos(cot.ivaAmount) : '',
      mensual: meses ? pesos(cot.monthlyTotal) : '', contrato: pesos(cot.contractTotal ?? cot.total),
    },
    notas: cot.notes || '',
    legal: (cot.validUntil ? 'Oferta válida hasta el ' + fechaLarga(cot.validUntil) + '. ' : '') +
      (ivaPct ? 'Precios en MXN; el IVA va desglosado. ' : 'Precios en MXN más IVA. ') +
      'Producción de materiales a cargo del patrocinador salvo acuerdo.',
    pie: tel ? 'WhatsApp academia ' + tel : club,
  };
}

export function nombreDeHoja(folio, marca) {
  const limpio = String(marca || 'marca').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  return 'Propuesta-' + (folio || 'patrocinio') + '-' + limpio + '.pdf';
}

/* Dibujo. Colores del diseño: Negro, Azul Cuero, Azul Legendario, Marfil,
   Niebla, Dorado Histórico y el rojo sólo para el descuento. */
const K = { negro: [26, 26, 26], cuero: [0, 69, 104], legendario: [5, 108, 127], marfil: [230, 229, 220], niebla: [220, 234, 231],
  dorado: [184, 164, 100], rojo: [180, 72, 59], blanco: [255, 255, 255], gris: [96, 96, 96], linea: [221, 221, 221], fondo: [241, 239, 233] };
const KIT = { wordmark: '/brand/patrocinios/wordmark-blanco.png', wat: '/brand/patrocinios/we-are-tanners-blanco.png',
  Frente: '/brand/patrocinios/uniforme-frente.jpg', Espalda: '/brand/patrocinios/uniforme-espalda.jpg',
  Medias: '/brand/patrocinios/uniforme-medias.jpg', Manga: '/brand/patrocinios/uniforme-manga.jpg' };

// cargar(url, png) -> { data, w, h } o null. Lo pone quien llama (navegador).
export async function hojaPdf(datos, { jsPDF = null, cargar = async () => null } = {}) {
  const Doc = jsPDF || (await import('/vendor/jspdf.mjs')).jsPDF;
  const doc = new Doc({ unit: 'pt', format: 'letter' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 44, PIE = 34;
  const img = {};
  const pide = async (k, url, png) => { try { img[k] = await cargar(url, png); } catch { img[k] = null; } };
  const fotos = [...new Set(datos.propiedades.map((p) => p.foto))];
  await Promise.all([
    ...(datos.esTannery ? [pide('wordmark', KIT.wordmark, true), pide('wat', KIT.wat, true)] : []),
    ...(datos.esTannery && datos.uniforme.length ? ['Frente', 'Espalda', 'Medias', 'Manga'].map((k) => pide(k, KIT[k], false)) : []),
    ...fotos.map((f) => pide(f, f, false)),
  ]);
  const fill = (c) => doc.setFillColor(...c), color = (c) => doc.setTextColor(...c), draw = (c) => doc.setDrawColor(...c);
  const letra = (tam, negrita = true) => { doc.setFont('helvetica', negrita ? 'bold' : 'normal'); doc.setFontSize(tam); };
  // Mayúsculas con aire. jsPDF no cuenta el espacio entre letras al alinear a
  // la derecha, así que se mide aquí.
  const etiqueta = (t, x, y, c = K.legendario, tam = 8, opt = {}) => {
    const txt = String(t).toUpperCase(), sp = 1.2; letra(tam); color(c);
    if (opt.align === 'right') { doc.text(txt, x - doc.getTextWidth(txt) - sp * (txt.length - 1), y, { charSpace: sp }); return; }
    doc.text(txt, x, y, { charSpace: sp, ...opt });
  };
  const contener = (im, x, y, w, h) => { const r = Math.min(w / im.w, h / im.h), iw = im.w * r, ih = im.h * r; return { x: x + (w - iw) / 2, y: y + (h - ih) / 2, w: iw, h: ih }; };
  const pon = (im, x, y, w, h, tipo) => { const c = contener(im, x, y, w, h); try { doc.addImage(im.data, tipo, c.x, c.y, c.w, c.h); } catch { /* sin imagen */ } return c; };

  const encabezado = (alto) => {
    fill(K.cuero); doc.rect(0, 0, W, alto, 'F');
    if (img.wordmark) pon(img.wordmark, M, alto * 0.2, 150, alto * 0.6, 'PNG');
    else { letra(alto > 80 ? 20 : 14); color(K.blanco); doc.text(doc.splitTextToSize(datos.club || '', 260)[0] || '', M, alto / 2 + 6); }
    etiqueta('Propuesta de patrocinio ' + datos.anio, W - M, alto / 2 - 4, K.dorado, 8, { align: 'right' });
    letra(9.5); color(K.blanco); doc.text([datos.folio, datos.fecha].filter(Boolean).join(' · '), W - M, alto / 2 + 10, { align: 'right' });
  };
  const pies = () => {
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i); fill(K.negro); doc.rect(0, H - PIE, W, PIE, 'F');
      letra(9, false); color(K.blanco); doc.text(datos.pie, M, H - PIE / 2 + 3);
      if (img.wat) pon(img.wat, W - M - 150, H - PIE + 10, 150, PIE - 20, 'PNG');
      else { letra(8); doc.text(String(datos.club || '').toUpperCase(), W - M, H - PIE / 2 + 3, { align: 'right', charSpace: 1 }); }
    }
  };
  const limite = H - PIE - 24;
  let y = 0;
  const nueva = () => { doc.addPage(); encabezado(56); y = 56 + 30; };
  const cabe = (alto) => { if (y + alto > limite) nueva(); };

  /* 1. Portada con la cuenta */
  encabezado(110);
  y = 150;
  etiqueta('Preparada para', M, y); y += 30;
  let t = 30; letra(t); while (t > 18 && doc.getTextWidth(datos.marca) > W - 2 * M) { t -= 2; letra(t); }
  color(K.cuero); doc.text(doc.splitTextToSize(datos.marca, W - 2 * M)[0], M, y); y += 20;
  if (datos.contacto) { letra(12, false); color(K.gris); doc.text(datos.contacto, M, y); y += 8; }
  y += 14;
  fill(K.marfil); doc.rect(M, y, W - 2 * M, 50, 'F');
  const col = (W - 2 * M - 32) / 3;
  [['Paquete', datos.paquete], ['Meses', datos.meses ? datos.meses + ' meses' : 'Pago único'], ['Vigencia', datos.vigencia || '—']].forEach(([k, v], i) => {
    const x = M + 16 + i * col;
    etiqueta(k, x, y + 19, K.legendario, 7.5); letra(11.5); color(K.negro); doc.text(doc.splitTextToSize(String(v), col - 8)[0], x, y + 36);
  });
  y += 74;

  draw(K.cuero); doc.setLineWidth(2); doc.line(M, y, W - M, y); y += 14;
  const cG = M, cN = M + 96, cQ = W - M - 120, cP = W - M;
  etiqueta('Grupo', cG, y, K.cuero, 7.5); etiqueta('Concepto', cN, y, K.cuero, 7.5); etiqueta('Cant.', cQ, y, K.cuero, 7.5, { align: 'right' }); etiqueta('Precio', cP, y, K.cuero, 7.5, { align: 'right' });
  y += 10; doc.setLineWidth(.6); draw(K.linea); doc.line(M, y, W - M, y); y += 15;
  datos.lineas.forEach((l) => {
    // Con muchos renglones se aprietan para que la cuenta quepa en la portada.
    const fila = datos.lineas.length > 9 ? 18 : 22;
    cabe(fila);
    letra(7.5, true); color(K.legendario); doc.text(l.grupo.toUpperCase(), cG, y, { charSpace: .5 });
    letra(10.5, l.paquete); color(K.negro); doc.text(doc.splitTextToSize(l.nombre, cQ - cN - 40)[0], cN, y);
    letra(10.5, false); doc.text(String(l.cantidad), cQ, y, { align: 'right' });
    letra(10.5, true); color(l.precio === 'Incluido' ? K.legendario : K.negro); doc.text(l.precio, cP, y, { align: 'right' });
    draw(K.linea); doc.line(M, y + (fila > 20 ? 8 : 6), W - M, y + (fila > 20 ? 8 : 6)); y += fila;
  });

  const T = datos.totales;
  const filas = [];
  if (T.conBase) filas.push(['Base', T.base], ['Activos extra', T.extras]); else filas.push(['Subtotal', T.subtotal]);
  if (T.descuento) filas.push(['Descuento ' + T.descuentoPct + '%', T.descuento, K.rojo]);
  if (T.iva) filas.push(['IVA ' + T.ivaPct + '% (se suma aparte)', T.iva]);
  cabe(filas.length * 18 + (T.meses ? 30 : 0) + 64);
  y += 10;
  // Notas y texto legal a la izquierda de los totales: la portada cabe en una hoja.
  const yIzq = y, anchoIzq = W - M - 260 - M - 28;
  const xT = W - M - 260;
  filas.forEach(([k, v, c]) => { letra(10, false); color(c || K.gris); doc.text(k, xT, y); letra(10.5); color(c || K.negro); doc.text(v, W - M, y, { align: 'right' }); y += 18; });
  if (T.meses) { draw(K.cuero); doc.setLineWidth(2); doc.line(xT, y - 8, W - M, y - 8); y += 8; etiqueta('Total mensual', xT, y, K.cuero, 9); letra(16); color(K.cuero); doc.text(T.mensual, W - M, y + 1, { align: 'right' }); y += 18; }
  fill(K.dorado); doc.rect(xT - 12, y, W - M - xT + 12, 46, 'F');
  etiqueta(T.meses ? 'Total contrato · ' + T.meses + ' meses' : 'Total', xT, y + 27, K.negro, 9);
  letra(19); color(K.negro); doc.text(T.contrato, W - M - 12, y + 30, { align: 'right' });
  y += 66;
  let yl = yIzq;
  if (datos.notas) { etiqueta('Notas', M, yl, K.legendario, 7.5); yl += 13; letra(10, false); color(K.negro); const n = doc.splitTextToSize(datos.notas, anchoIzq).slice(0, 5); doc.text(n, M, yl); yl += n.length * 13 + 10; }
  letra(8.5, false); color(K.gris); doc.text(doc.splitTextToSize(datos.legal, anchoIzq), M, yl);

  /* 2. Uniforme */
  if (datos.uniforme.length) {
    nueva();
    etiqueta('Espacios propuestos para ' + datos.marca, M, y); y += 15;
    letra(10, false); color(K.gris); doc.text('Tu marca en los uniformes oficiales. Ubicación aproximada; el diseño final se entrega con tu logo.', M, y); y += 20;
    const g = 16, bw = (W - 2 * M - g) / 2, bh = 210;
    const cuadros = [['Frente', 'Frente'], ['Espalda', 'Espalda'], ['Medias', 'Short y medias'], ['Manga', 'Manga · acercamiento']];
    cuadros.forEach(([k, titulo], i) => {
      const x = M + (i % 2) * (bw + g), yy = y + Math.floor(i / 2) * (bh + 30);
      etiqueta(titulo, x, yy, K.cuero, 7.5);
      fill(K.fondo); doc.rect(x, yy + 8, bw, bh, 'F');
      const area = img[k] ? pon(img[k], x, yy + 8, bw, bh, 'JPEG') : { x, y: yy + 8, w: bw, h: bh };
      const marcas = k === 'Manga' ? [...datos.uniforme.filter((u) => /manga.*izq/i.test(u.nombre)), ...datos.uniforme.filter((u) => /manga/i.test(u.nombre))].slice(0, 1).map((u) => ({ ...u, x: 42, y: 22, w: 40, h: 55 }))
        : datos.uniforme.filter((u) => u.lado === k);
      marcas.forEach((u) => {
        const mx = area.x + area.w * u.x / 100, my = area.y + area.h * u.y / 100, mw = area.w * u.w / 100, mh = area.h * u.h / 100;
        draw(K.dorado); doc.setLineWidth(2); doc.rect(mx, my, mw, mh, 'S');
        fill(K.dorado); doc.rect(mx, my - 13, 14, 13, 'F'); letra(8); color(K.negro); doc.text(String(u.n), mx + 7, my - 3.5, { align: 'center' });
      });
    });
    y += 2 * (bh + 30) + 4;
    datos.uniforme.forEach((u, i) => {
      const x = M + (i % 2) * (bw + g); if (i % 2 === 0 && i) y += 16;
      fill(K.dorado); doc.rect(x, y - 9, 12, 12, 'F'); letra(7.5); color(K.negro); doc.text(String(u.n), x + 6, y - .5, { align: 'center' });
      letra(10, false); doc.text(u.nombre, x + 18, y);
    });
  }

  /* 3. Propiedades con foto */
  if (datos.propiedades.length) {
    nueva();
    etiqueta('Propiedades para ' + datos.marca, M, y); y += 15;
    letra(10, false); color(K.gris); doc.text('Dónde se ve tu marca en las canchas, el complejo y los eventos.', M, y); y += 18;
    const g = 16, bw = (W - 2 * M - g) / 2, fh = 140, alto = fh + 58;
    datos.propiedades.forEach((p, i) => {
      if (i % 2 === 0) { if (i) y += alto; if (y + alto > limite) nueva(); }
      const x = M + (i % 2) * (bw + g);
      fill(K.marfil); doc.rect(x, y, bw, fh, 'F');
      if (img[p.foto]) pon(img[p.foto], x, y, bw, fh, 'JPEG');
      letra(11.5); color(K.negro); doc.text(doc.splitTextToSize(p.nombre, bw - 70)[0], x, y + fh + 17);
      if (p.cantidad) etiqueta(p.cantidad, x + bw, y + fh + 17, K.dorado, 7.5, { align: 'right' });
      letra(9.5, false); color(K.gris); doc.text(doc.splitTextToSize(p.descripcion, bw).slice(0, 2), x, y + fh + 32);
    });
  }

  pies();
  return doc;
}
