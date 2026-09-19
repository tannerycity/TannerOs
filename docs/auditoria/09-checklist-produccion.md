# 09 · Checklist de producción · Go / No-Go

El restablecimiento de la cuota el **22 de septiembre de 2026 no autoriza el
despliegue**. Lo autoriza esta lista.

## Bloqueantes · No-Go si alguno falla

| # | Criterio | Estado | Evidencia requerida |
|---|---|---|---|
| 1 | Sin hallazgos P0 abiertos | ⬜ | Bloque A aplicado y probado |
| 2 | Origen del egress identificado con evidencia | ✅ | `docs/auditoria/02` |
| 3 | Los listados usan miniaturas | ✅ | `qa-static.mjs` en verde |
| 4 | No se descargan originales sin intención | ✅ | Barrera de egress |
| 5 | Las fotos nuevas salen en WebP o JPEG, nunca PNG | ⬜ | Prueba en WebKit |
| 6 | Peso de la variante grande ≤ 400 kB | ⬜ | Prueba unitaria |
| 7 | Módulos de dinero con pruebas | ⬜ | Pruebas 2, 3 y 4 de `06` |
| 8 | Aislamiento entre familias probado | ⬜ | Prueba 1 de `06` |
| 9 | RLS y Storage auditados | ✅ | `docs/auditoria/05` |
| 10 | Sin secretos expuestos | ✅ | `service_role` sólo en Edge Function |
| 11 | Migraciones reversibles | ⬜ | Cada migración con su reverso |
| 12 | Las tres verificaciones de QA pasan | ✅ | `qa-static`, `qa-photo-cache`, `qa-evaluation-guidance` |
| 13 | Comparación medible antes/después | ⬜ | Peso por foto y kB por sesión |
| 14 | Reversión documentada | ⬜ | Por bloque, en `08` |

## Recomendados · No bloquean

| # | Criterio | Estado |
|---|---|---|
| 15 | Protección de contraseñas filtradas activa | ⬜ |
| 16 | `migration` fuera de `db_schemas` | ⬜ |
| 17 | `anon` sin EXECUTE en lo que no es público | ⬜ |
| 18 | Versión del cliente de Supabase fija | ⬜ |
| 19 | Alertas de cuota configuradas | ⬜ |
| 20 | Ambiente de pruebas separado | ⬜ |

## Métricas de aceptación

Medir **antes y después**, con el mismo recorrido:

| Métrica | Hoy | Objetivo |
|---|---:|---:|
| Peso medio de foto nueva | 3,060 kB | ≤ 400 kB |
| Peso de miniatura | 114 kB (PNG) | ≤ 40 kB |
| kB por sesión del portal | sin medir | ≤ 500 kB |
| Apertura del padrón | ~138 MB (potencial) | ≤ 1 MB |
| Egress mensual | 11.87 GB | ≤ 2 GB |

## Reversión

| Bloque | Cómo se revierte | Pierde datos |
|---|---|---|
| A · formato de imagen | Revertir commit | No |
| B1 · miniaturas | Dejarlas; son aditivas | No |
| B2 · convertir PNG | **Conservar el PNG original hasta validar** | Sí, si se borra antes de tiempo |
| B3 · Cache-Control | Revertir commit; afecta sólo a subidas nuevas | No |
| B4 · caché de `/v2/` | Revertir `vercel.json` y redesplegar | No |
| C2 · paginar | La RPC vieja se conserva hasta migrar todo | No |
| C3 · índices | Recrear desde la migración de reverso | No |

**Regla para B2:** no borrar ningún PNG original hasta que su reemplazo esté
verificado en pantalla. El ahorro de storage no vale perder la foto de un niño.

## Firma

| Rol | Nombre | Fecha | Go / No-Go |
|---|---|---|---|
| Presidencia | | | |
| Técnico | | | |
