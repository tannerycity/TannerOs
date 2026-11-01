/* Recolector del tablero sin Windsor: lo puro (30/10/2026, h56).
 *   - Cada API oficial se vuelve filas del catálogo cerrado, por día y negocio.
 *   - Dominios ajenos, búsquedas, URLs y nombres no se guardan.
 *   - Campañas: CLUB-/TCP- por prefijo; sin prefijo, compartido.
 *   - Nada de tokens ni llaves en lo que se guarda o registra.
 *   - El catálogo es el mismo en la función y en h56. */
import fs from 'node:fs';
import { CATALOGO, negocioDeHost, negocioDeCampana, diaDeMeta, ga4Trafico, ga4Eventos, searchConsole, metaAds, metaInsights, fotoSeguidores, sinSecretos } from '../supabase/functions/bi-recolector/normaliza.js';

let fallas = 0, n = 0;
const revisa = (t, ok, d = '') => { n++; if (!ok) { fallas++; console.error(`MAL ${t}${d ? ` · ${d}` : ''}`); } };
const bien = filas => filas.every(f => CATALOGO[f.fuente]?.includes(f.metrica) && /^\d{4}-\d{2}-\d{2}$/.test(f.dia) && f.valor >= 0 && ['club', 'tcp', 'compartido'].includes(f.negocio));

revisa('dominios: www y app son club, tcp es TCP, lo ajeno se descarta', negocioDeHost('www.tannerycity.com') === 'club' && negocioDeHost('app.tannerycity.com') === 'club'
  && negocioDeHost('tcp.tannerycity.com') === 'tcp' && negocioDeHost('tanneros-git-x.vercel.app') === null && negocioDeHost('evil.com') === null);
revisa('campañas por prefijo', negocioDeCampana('CLUB- Visoría') === 'club' && negocioDeCampana('tcp- rentas') === 'tcp' && negocioDeCampana('[5/10/2026] Promoción de https://api.whatsapp.com/send') === 'compartido');
revisa('día de Meta: end_time es el fin del día', diaDeMeta('2026-10-30T07:00:00+0000') === '2026-10-29');

const t = ga4Trafico({ rows: [
  { dimensionValues: [{ value: '20261029' }, { value: 'tcp.tannerycity.com' }], metricValues: [{ value: '12' }, { value: '9' }] },
  { dimensionValues: [{ value: '20261029' }, { value: 'www.tannerycity.com' }], metricValues: [{ value: '30' }, { value: '25' }] },
  { dimensionValues: [{ value: '20261029' }, { value: 'tannerycity.com' }], metricValues: [{ value: '5' }, { value: '4' }] },
  { dimensionValues: [{ value: '20261029' }, { value: 'localhost' }], metricValues: [{ value: '99' }, { value: '99' }] }] }, '561548928');
revisa('GA4: sesiones por negocio, www y raíz juntas, localhost fuera', bien(t) && t.find(f => f.negocio === 'club' && f.metrica === 'sesiones').valor === 35
  && t.find(f => f.negocio === 'tcp' && f.metrica === 'sesiones').valor === 12 && !t.some(f => f.valor === 99), JSON.stringify(t));
const e = ga4Eventos({ rows: [
  { dimensionValues: [{ value: '20261029' }, { value: 'tcp.tannerycity.com' }, { value: 'reservation_interest' }], metricValues: [{ value: '3' }] },
  { dimensionValues: [{ value: '20261029' }, { value: 'tcp.tannerycity.com' }, { value: 'purchase' }], metricValues: [{ value: '1' }] },
  { dimensionValues: [{ value: '20261029' }, { value: 'www.tannerycity.com' }, { value: 'generate_lead' }], metricValues: [{ value: '2' }] }] }, '561548928');
revisa('GA4: interés de renta y lead separados; un evento fuera del catálogo no entra', bien(e) && e.length === 2
  && e.some(f => f.metrica === 'interes_reserva' && f.negocio === 'tcp' && f.valor === 3) && e.some(f => f.metrica === 'leads_web' && f.negocio === 'club'));

const s = searchConsole({ rows: [
  { keys: ['2026-10-28', 'https://app.tannerycity.com/tienda/?club=x'], clicks: 2, impressions: 10, position: 3 },
  { keys: ['2026-10-28', 'https://tcp.tannerycity.com/'], clicks: 1, impressions: 4, position: 5 },
  { keys: ['2026-10-28', 'https://otro.com/'], clicks: 50, impressions: 50, position: 1 }] }, 'sc-domain:tannerycity.com');
revisa('Search Console: por dominio, posición ponderada, sin URL ni búsqueda guardada', bien(s) && s.find(f => f.negocio === 'club' && f.metrica === 'posicion_ponderada').valor === 30
  && !JSON.stringify(s).includes('tienda') && !s.some(f => f.valor === 50), JSON.stringify(s));

const m = metaAds({ data: [
  { date_start: '2026-10-20', campaign_name: 'CLUB- Visoría', spend: '100.5', impressions: '1000', reach: '800', clicks: '40', actions: [{ action_type: 'lead', value: '3' }, { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '7' }] },
  { date_start: '2026-10-20', campaign_name: 'Promoción WhatsApp', spend: '20', impressions: '200', reach: '150', clicks: '5' }] }, '1253862975729440');
revisa('Meta Ads: gasto y leads por negocio; sin acciones = 0, no inventado', bien(m) && m.find(f => f.negocio === 'club' && f.metrica === 'gasto').valor === 100.5
  && m.find(f => f.negocio === 'club' && f.metrica === 'conversaciones').valor === 7 && m.find(f => f.negocio === 'compartido' && f.metrica === 'leads').valor === 0);
revisa('Meta Ads: el nombre de la campaña no se guarda', !JSON.stringify(m).includes('Visoría'));

const ig = metaInsights({ data: [{ name: 'reach', values: [{ value: 130, end_time: '2026-10-29T07:00:00+0000' }] }, { name: 'profile_views', values: [{ value: 5, end_time: '2026-10-29T07:00:00+0000' }] }] },
  'instagram', '17841462855563889', 'club', { reach: 'alcance' });
revisa('Insights: sólo lo mapeado (los nombres de Meta van en la configuración)', bien(ig) && ig.length === 1 && ig[0].dia === '2026-10-28' && ig[0].valor === 130);
revisa('Seguidores: foto del día; un valor raro no se guarda', fotoSeguidores(990, 'instagram', 'x', 'club', '2026-10-30')[0].valor === 990 && fotoSeguidores('NaN', 'instagram', 'x', 'club', '2026-10-30').length === 0);

const fuga = sinSecretos('400 Invalid OAuth access_token=EAABwzLixnjYBO1234567890abcdef y -----BEGIN PRIVATE KEY-----\nMIIabc\n-----END PRIVATE KEY-----');
revisa('errores sin tokens ni llaves', !/EAABwz|MIIabc/.test(fuga) && /oculto/.test(fuga), fuga);

const sql = fs.readFileSync(new URL('../supabase/pendientes/h56_bi_sin_windsor.sql', import.meta.url), 'utf8');
const cat = sql.slice(sql.indexOf('jsonb_build_object(\n    \'ga4\''), sql.indexOf('$$;', sql.indexOf('private.bi_catalogo()')));
revisa('el catálogo de h56 es el mismo que el de la función', Object.entries(CATALOGO).every(([f, ms]) => new RegExp(`'${f}',\\s*jsonb_build_array\\(${ms.map(x => `'${x}'`).join(',\\s*')}\\)`).test(cat)));
const fn = fs.readFileSync(new URL('../supabase/functions/bi-recolector/index.ts', import.meta.url), 'utf8');
revisa('la función exige su secreto y sólo lee (scopes readonly)', /x-bi-secreto/.test(fn) && /analytics\.readonly/.test(fn) && /webmasters\.readonly/.test(fn) && !/analytics\.edit|webmasters"/.test(fn));
const norm = fs.readFileSync(new URL('../supabase/functions/bi-recolector/normaliza.js', import.meta.url), 'utf8');
revisa('no llama a Windsor: sólo APIs oficiales de Google y Meta', ![fn, norm].some(x => /windsor\.ai|WINDSOR_/i.test(x)) && (fn.match(/https:\/\/[a-z0-9.]+\.[a-z]+/g) || []).every(u => /googleapis\.com$|graph\.facebook\.com$/.test(u)), (fn.match(/https:\/\/[a-z.]+/g) || []).join(' '));

console.log(fallas ? `BI recolector: ${fallas} de ${n} fallaron` : `BI recolector OK · ${n} revisiones: APIs oficiales a filas agregadas, por negocio, sin personas ni secretos`);
process.exit(fallas ? 1 : 0);
