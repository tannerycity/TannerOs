# Resultados de QA · 30/10/2026

**A** automatizada y pasando · **M** mutación detectada · **B** bloqueada (motivo) · **P** pendiente

| ID | Prueba | Estado | Evidencia |
|---|---|---|---|
| QA-001 | Sin consentimiento no se envían etiquetas | A, M | `qa-humo-medicion` caso 1 (tienda); tcp E2E «medición» |
| QA-002 | Rechazar cookies | A | `qa-humo-medicion` caso 2 |
| QA-003 | Aceptar cookies: eventos permitidos | A | `qa-humo-medicion` caso 3 (`view_item`, `add_to_cart`, `store_order_placed`) |
| QA-004 | Revocar: se detiene y borra cookies | A | `qa-humo-medicion` caso 4 (borra `_ga`/`_fbp`, sin peticiones nuevas) |
| QA-005 | Navegar entre módulos sin duplicados | A | `qa-humo-medicion` caso 7 (una sola carga de gtag); guardia anti-duplicado en `carga()` |
| QA-006 | Ficha de jugador sin datos personales | A | página sintética `/m/<modulo>` + lista blanca (`qa-analitica-uso`) |
| QA-007 | Cerrar sesión | A | `apagaAlSalir()` recarga sin etiquetas (llamado en SIGNED_OUT) |
| QA-008 | Familias / rol Tanner sin analítica del staff | A, M | `qa-humo-medicion` caso 8; prueba SQL 13 en producción |
| QA-009 | Interés de renta ≠ compra | A | tcp `analitica-publica.test.mjs` (`reservation_interest`) |
| QA-010 | Compra confirmada | P | `purchase` sólo desde servidor con pago real; falta `api_secret` de GA4 |
| QA-011 | Móvil | A | pruebas de navegador a 390×844 |
| QA-012 | Sitemap válido | A, M | `qa-seo-tanneros` |
| QA-013 | robots y noindex | A, M | `qa-seo-tanneros`; producción `/club/` con `X-Robots-Tag: noindex, nofollow` |
| QA-014 | Sin etiquetas duplicadas | A | una carga de gtag/fbq por página; GTM sólo en www |
| QA-015 | Preview de Vercel | A (TannerOS) / B (TCP) | TannerOS previews Ready; TCP: deploys de `main` bloqueados (OPERACION.md §1) |
| QA-016 | Evento en GA4 DebugView | B | sin acceso a GA4 ni red hacia los sitios; Windsor 0 filas |
| QA-017 | Evento en Meta Test Events | B | sin acceso a Events Manager |
| QA-018 | Red sin PII | A | caso 3 y 7: sin nombre, teléfono, folio, ids |
| QA-019 | Windsor contra la fuente | P | Windsor responde (ver AUDITORIA); falta comparar con Meta/Instagram nativos |
| QA-020 | Permisos del tablero | P | tablero aún no construido |
| QA-021 | GA4 del staff apagado hasta el aviso | A, M | `qa-humo-medicion` caso 9; `qa-analitica-uso`. Encenderlo hace fallar ambas |

Suites corridas el 30/10 en la rama `medicion-p0`: `qa-static` (OK en CI; local con Node 22 marca ★/✎ preexistentes),
`qa-analitica-uso` 20/20, `qa-humo-medicion` 23/23, `qa-humo-tienda-recibo` 13/13, `qa-humo-visoria` 74/74.
