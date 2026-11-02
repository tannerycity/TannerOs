// Métricas de marketing: las cuentas (v2/metricas/metricas.js), sin navegador.
// Lo que se protege: el periodo termina ayer; sin dato no hay número (ni cero);
// sólo se compara si el periodo anterior tiene datos completos; seguidores es
// el último valor; posición de Google ponderada; la tasa de Facebook; el
// embudo dice dónde se pierde la pista; las recomendaciones salen de reglas y
// son cuatro como máximo.
import { rango, hoyMexico, suma, ultimo, serie, cambio, indicadores, posicionGoogle, tasaFacebook, embudo, recomendaciones, estadoFuente } from '../v2/metricas/metricas.js';

let fallas = 0, n = 0;
const revisa = (t, ok, d = '') => { n++; if (!ok) { fallas++; console.error(`MAL ${t}${d ? ` · ${d}` : ''}`); } };

const r = rango(7, '2026-11-02');
revisa('el periodo termina ayer y el anterior es del mismo largo', r.hasta === '2026-11-01' && r.desde === '2026-10-26' && r.antesHasta === '2026-10-25' && r.antesDesde === '2026-10-19', JSON.stringify(r));
revisa('hoy en México: a las 3 a.m. UTC todavía es ayer', hoyMexico(Date.parse('2026-11-03T03:00:00Z')) === '2026-11-02');

// Datos como los reales del 02/11/2026: una semana medida, sin la anterior.
const fila = (fuente, negocio, metrica, dia, valor) => ({ fuente, negocio, metrica, dia, valor });
const dias = ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'];
const D = {
  filas: [
    ...dias.map((d, i) => fila('facebook', 'tcp', 'visualizaciones', d, 50 + i)), fila('facebook', 'tcp', 'interacciones', '2026-10-30', 1),
    ...dias.map(d => fila('facebook', 'club', 'visualizaciones', d, 250))
      .concat(dias.map(d => fila('facebook', 'club', 'interacciones', d, 25))),
    fila('facebook', 'club', 'seguidores', '2026-11-02', 460), fila('instagram', 'club', 'seguidores', '2026-11-02', 992),
    ...dias.slice(0, 6).map(d => fila('instagram', 'club', 'alcance', d, 260)),
    fila('search_console', 'club', 'clics', '2026-10-29', 7), fila('search_console', 'club', 'impresiones', '2026-10-29', 29), fila('search_console', 'club', 'posicion_ponderada', '2026-10-29', 56),
    fila('search_console', 'club', 'clics', '2026-10-30', 3), fila('search_console', 'club', 'impresiones', '2026-10-30', 30), fila('search_console', 'club', 'posicion_ponderada', '2026-10-30', 79)
  ],
  cuentas: [{ fuente: 'facebook', negocio: 'club' }, { fuente: 'facebook', negocio: 'tcp' }, { fuente: 'instagram', negocio: 'club' }, { fuente: 'instagram', negocio: 'tcp' },
    { fuente: 'search_console', negocio: 'compartido' }, { fuente: 'ga4', negocio: 'club' }, { fuente: 'ga4', negocio: 'compartido' }, { fuente: 'meta_ads', negocio: 'compartido' }, { fuente: 'gbp', negocio: 'club' }],
  sincronizaciones: [{ fuente: 'facebook', estado: 'ok', cuando: '2026-11-02T16:00:00Z' }, { fuente: 'instagram', estado: 'ok' }, { fuente: 'search_console', estado: 'ok' },
    { fuente: 'ga4', estado: 'ok' }, { fuente: 'meta_ads', estado: 'ok' }, { fuente: 'gbp', estado: 'bloqueada', detalle: 'Requiere acceso aprobado por Google' }],
  prospectos: [{ dia: '2026-10-28', n: 2 }, { dia: '2026-10-20', n: 1 }], inscripciones: [{ dia: '2026-10-29', n: 1 }]
};

revisa('suma con días medidos', JSON.stringify(suma(D.filas, 'instagram', 'club', 'alcance', r.desde, r.hasta)) === JSON.stringify({ valor: 1560, dias: 6 }));
revisa('sin filas no hay número (null, no 0)', suma(D.filas, 'ga4', 'club', 'sesiones', r.desde, r.hasta).valor === null);
revisa('seguidores es el último valor, no la suma', ultimo(D.filas, 'instagram', 'club', 'seguidores', '2026-11-02').valor === 992);
const sIg = serie(D.filas, 'instagram', 'club', 'alcance', r.desde, r.hasta);
revisa('serie diaria: un hueco es null, no cero', sIg.length === 7 && sIg[6].valor === null && sIg[0].valor === 260);
revisa('cambio: sólo con periodo anterior completo', cambio(120, 100, 7, 7) === 20 && cambio(120, 100, 4, 7) === null && cambio(120, null, 0, 7) === null && cambio(120, 0, 7, 7) === null);

const kc = indicadores(D, 'club', r), kt = indicadores(D, 'tcp', r);
const k = (lista, c) => lista.find(x => x.k === c);
revisa('club: alcance 1,560 y sin flecha (no hay semana anterior)', k(kc, 'alcance_ig').valor === 1560 && k(kc, 'alcance_ig').cambio === null);
revisa('club: visitas al sitio sin medir (no hay filas de GA4 para www)', k(kc, 'visitas_web').valor === null);
revisa('anuncios con la fuente al día y sin campañas: gasto 0 real', k(kc, 'gasto_ads').valor === 0);
revisa('TCP: sólo los indicadores de cuentas que tiene', !!k(kt, 'vistas_fb') && !kt.some(x => x.fuente === 'ga4' && x.k === 'visitas_web' && x.valor != null));
revisa('posición de Google ponderada por impresiones', posicionGoogle(D, 'club', r.desde, r.hasta) === Math.round(((56 + 79) / 59) * 10) / 10);
revisa('tasa de Facebook = interacciones / visualizaciones', tasaFacebook(D, 'club', r.desde, r.hasta) === 10 && tasaFacebook(D, 'tcp', r.desde, r.hasta) === 0.3);
revisa('estado de fuente: bloqueada con su motivo', estadoFuente(D, 'gbp').estado === 'bloqueada' && /Google/.test(estadoFuente(D, 'gbp').detalle) && estadoFuente(D, 'xyz').estado === 'sin_conectar');

const eC = embudo(D, 'club', r, kc), eT = embudo(D, 'tcp', r, kt);
revisa('embudo del club: ven en redes = alcance IG + vistas FB', eC[0].valor === 1560 + 1750, JSON.stringify(eC[0]));
revisa('embudo del club: prospectos e inscritos del periodo (conteos de TannerOS)', eC.find(p => p.k === 'prospectos').valor === 2 && eC.find(p => p.k === 'inscritos').valor === 1);
revisa('embudo: lo que no se mide queda null (aquí se pierde la pista)', eC.find(p => p.k === 'entran').valor === null);
revisa('embudo de TCP termina en reservas sin conectar', eT.at(-1).k === 'reservan' && eT.at(-1).valor === null);

const iT = recomendaciones(D, 'tcp', r, kt), iC = recomendaciones(D, 'club', r, kc);
revisa('TCP: Facebook casi no conversa (0.3%) es lo primero', iT[0]?.tono === 'alerta' && /Facebook de TCP/.test(iT[0].titulo) && /0\.3%/.test(iT[0].texto), JSON.stringify(iT[0]));
revisa('club: sitio sin medir aparece como oportunidad', iC.some(i => i.tono === 'oportunidad' && /no mide visitas/.test(i.titulo)));
revisa('club: Google arriba (posición 2.3) como va bien', iC.some(i => i.tono === 'bien' && /posición 2\.3/.test(i.titulo)), JSON.stringify(iC));
revisa('recomendaciones: máximo cuatro y cada una dice su fuente', iC.length <= 4 && iT.length <= 4 && [...iC, ...iT].every(i => i.fuente && i.titulo && i.texto));
revisa('club sin Facebook flojo: no se inventa la alerta (10% de interacción)', !iC.some(i => /casi no conversa/.test(i.titulo)));
const sinPros = recomendaciones({ ...D, prospectos: [] }, 'club', r, kc);
revisa('sin prospectos en el periodo: alerta de prospectos', sinPros.some(i => i.tono === 'alerta' && /Ningún prospecto/.test(i.titulo)));
revisa('ninguna recomendación promete datos de personas', ![...iC, ...iT].some(i => /@|\d{10}/.test(i.texto)));

console.log(fallas ? `Métricas: ${fallas} de ${n} fallaron` : `Métricas OK · ${n} revisiones: periodo honesto, sin ceros inventados, comparación sólo con datos completos, embudo y recomendaciones`);
process.exit(fallas ? 1 : 0);
