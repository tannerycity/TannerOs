# Tablero ejecutivo sin Windsor (decisión de Presidencia, 30/10/2026)

Tannery City no paga Windsor.ai. Windsor queda sólo como herramienta de
consulta mientras dure el trial y **nada del sistema depende de él**. El tablero
lee APIs oficiales desde el servidor y guarda sólo agregados en Supabase.

## 1. Inventario de dependencias

| Dato | Fuente de verdad | Cómo llega | Costo | Permiso necesario | Estado |
|---|---|---|---|---|---|
| Prospectos, inscripciones, cobrado (Club) | Base de TannerOS | Directo en `v2_bi_tablero` | $0 | Ya existe | En producción (h56, 01/11/2026) |
| Uso de TannerOS (DAU/WAU/MAU) | Base de TannerOS (h55) | `v2_usage_summary` | $0 | Ya existe | En producción |
| Reservas, torneos, ingresos (TCP) | Base de TCP (otro Supabase) | Vista agregada de TCP | $0 | Acceso a ese proyecto | **Bloqueado: sin acceso** |
| Sesiones, leads web, WhatsApp, interés de renta | GA4 (561403621, 561548928) | GA4 Data API, diario | $0 | Cuenta de servicio como **Lector** en cada propiedad | Falta crear la cuenta de servicio |
| Clics e impresiones en Google | Search Console (`sc-domain:tannerycity.com`) | Search Console API, diario | $0 | La misma cuenta de servicio como usuario **restringido** | Falta darla de alta |
| Gasto, alcance, leads, conversaciones | Meta Ads (act_1253862975729440) | Marketing API `insights`, diario | $0 | Usuario del sistema con `ads_read` | Falta token; **no se asume aprobado** |
| Seguidores, visualizaciones e interacciones de páginas | Facebook (166989879833376, 727296023789322) | Graph API `insights`, una métrica por llamada (h57) | $0 | `pages_read_engagement`, `pages_show_list`, `read_insights` | Conectado el 02/11/2026. Meta dio de baja `page_impressions`: se usa `page_media_view` (visualizaciones), que no es lo mismo que impresiones |
| Seguidores y alcance de Instagram | IG (17841462855563889, 17841475095627973) | Graph API `insights` | $0 | `instagram_basic`, `instagram_manage_insights` | Falta token; **no se asume aprobado** |
| Llamadas e indicaciones en Google Maps | Business Profile | Performance API | $0 | **Acceso aprobado por Google** (solicitud aparte) | Bloqueado; usar el panel nativo |
| Reportes de GA4 y Search Console | Looker Studio | Conectores nativos de Google | $0 | Los mismos accesos de lectura | Opcional (ver §5) |

Windsor no aparece en ninguna fila. La prueba `qa-bi-recolector` falla si el
recolector llama a cualquier dominio que no sea de Google o de Meta.

## 2. Diseño técnico

```
pg_cron (diario 06:15 CDMX, h56b)
  └─ pg_net POST → Edge Function bi-recolector   (x-bi-secreto, comparado contra el Vault)
        ├─ GA4 Data API ........ cuenta de servicio (analytics.readonly)
        ├─ Search Console API .. cuenta de servicio (webmasters.readonly)
        ├─ Meta Graph/Marketing  token de usuario del sistema (sólo lectura)
        └─ normaliza.js → filas {fuente, cuenta, negocio, métrica, día, valor}
              └─ v2_bi_ingesta (sólo service_role)
                    ├─ app.bi_metricas_dia     (agregados, catálogo cerrado)
                    └─ app.bi_sincronizaciones (ok / error / bloqueada + motivo)

TannerOS (Presidencia) → v2_bi_tablero(org, desde, hasta)
  ├─ Club: prospectos, inscripciones y cobrado, de la base (real)
  ├─ Externo por negocio (real o no_disponible, nunca un cero falso)
  ├─ Costo por prospecto/inscripción: sólo con gasto CLUB- (estimado)
  └─ TCP operación: no_disponible hasta conectar su base
```

Reglas del diseño:

- **Sólo agregados.** Nunca URLs completas, búsquedas, nombres de campaña, personas ni ids de usuario. El negocio se decide por dominio (`www`/`app` = club, `tcp` = TCP) o por prefijo de campaña (`CLUB-`/`TCP-`).
- **Catálogo cerrado** (`private.bi_catalogo` = `CATALOGO` de `normaliza.js`; una prueba verifica que coincidan).
- **Honestidad.** Si una fuente nunca sincronizó bien, el KPI sale `no_disponible` con valor nulo. Si Meta niega un permiso, la fuente queda `bloqueada` con el motivo, sin el token.
- **Secretos sólo en el servidor:** `GOOGLE_SERVICE_ACCOUNT_JSON` y `META_SYSTEM_USER_TOKEN` en los secretos de Edge Functions (los carga el dueño). El secreto del disparador lo genera h56b dentro del Vault de Supabase y nadie lo ve. Nada en el repositorio, el chat ni el navegador.
- **Permisos mínimos:** scopes `*.readonly`; en Meta, usuario del sistema con acceso de sólo análisis a los activos del club.
- **Relectura de 7 días** en cada corrida (las APIs corrigen días recientes); la ingesta hace upsert por día.
- **Conservación:** 25 meses de métricas y 6 de bitácora (`supabase/propuestas/bi_purga.sql`, sin aplicar).
- **Acceso:** el tablero sólo con el módulo Administración (Presidencia). Las tablas no tienen permisos para `anon` ni `authenticated`.

## 3. Pruebas

| Prueba | Qué cubre | Resultado |
|---|---|---|
| `scripts/qa-bi-recolector.mjs` | Transformaciones de GA4, Search Console, Meta Ads e Insights; dominios ajenos fuera; campañas por prefijo; sin nombres ni URLs; errores sin tokens; catálogo igual en SQL y JS; sólo dominios de Google/Meta | 14/14. Mutación (TCP contado como club): 4 fallas detectadas |
| `supabase/tests/14_tablero_sin_windsor_honesto.sql` | Sólo Administración; nadie ingesta desde el navegador; `no_disponible` en vez de 0; ingesta rechaza métrica, cuenta y valor inválidos; seguidores = último valor; club y TCP separados; costo por prospecto sólo con gasto CLUB-; TCP operación no disponible; rango inválido | 10/10 en Postgres 16 local. Mutaciones (sin candado de Administración; cero en vez de nulo): detectadas |
| TypeScript de la función | Sintaxis (`typescript` 5.6) | 0 diagnósticos. Sin Deno en la sesión: no se ejecutó la función |

No probado todavía: llamadas reales a las APIs (faltan credenciales) y la
comparación contra los paneles nativos (QA-019). Ese es el paso 4 de §6.

## 4. Costo residual

| Concepto | Costo | Nota |
|---|---|---|
| GA4 Data API | $0 | Gratis, con cuota por propiedad; una corrida diaria usa una fracción mínima |
| Search Console API | $0 | Gratis, con cuota por sitio |
| Graph API y Marketing API de Meta | $0 | Gratis, con límites de llamadas por app y cuenta |
| Proyecto de Google Cloud y cuenta de servicio | $0 | Para estas APIs no se espera cuenta de facturación; confirmarlo al crear el proyecto |
| Supabase: 1 invocación diaria, pg_cron, pg_net | $0 adicional | ~30 invocaciones/mes, dentro de lo incluido en el plan actual |
| Almacenamiento | $0 adicional | ~50 filas/día ≈ 18 mil filas/año (pocos MB) |
| Looker Studio | $0 | Sólo con conectores nativos de Google; los de Meta en Looker Studio suelen ser de terceros con cuota y no se usan |
| Windsor | $0 | No se contrata; deja de usarse al terminar el trial |

Costo recurrente nuevo esperado: **$0**. Riesgo de costo: sólo si el plan de
Supabase cambia por otros motivos.

## 5. Looker Studio (opcional, gratis)

Sirve para explorar GA4 y Search Console con los conectores nativos de Google,
sin código. No sustituye al tablero de TannerOS: no ve la base del club ni la de
TCP, y Meta no tiene conector nativo gratuito. Uso recomendado: reporte de
análisis para Marketing; el tablero ejecutivo vive en TannerOS.

## 6. Migración antes de que termine el trial

| Paso | Quién | Depende de |
|---|---|---|
| 1. ~~Aprobar y aplicar h56; desplegar `bi-recolector`~~ **Hecho 01/11/2026**: h56 y h56b aplicadas (idénticas al repo), función desplegada, `pg_cron` diario 06:15 CDMX. Primera corrida: las 6 fuentes «bloqueadas» con su motivo; sin secreto responde 401. | Claude | — |
| 2. Crear la cuenta de servicio de Google y darla de alta como Lector en las 2 propiedades de GA4 y en Search Console | Dueño de las cuentas de Google | — |
| 3. Crear un usuario del sistema en Meta Business con acceso de análisis a la cuenta de anuncios, las 2 páginas y las 2 cuentas de IG; generar el token | Dueño del Business Manager | Que Meta no pida revisión (si la pide, queda bloqueada y se usan los reportes nativos) |
| 4. El dueño guarda los 2 secretos (`GOOGLE_SERVICE_ACCOUNT_JSON`, `META_SYSTEM_USER_TOKEN`); una semana en paralelo comparando con los paneles nativos (QA-019) | Dueño (secretos) y Claude (comparación) | Pasos 2 y 3 |
| 5. Construir la pantalla del tablero en TannerOS (Presidencia) | Claude | Paso 4 en verde |
| 6. Conectar la base de TCP (vista agregada sin datos personales) | Skyrock / dueño | Acceso al proyecto de TCP |
| 7. Dejar de consultar Windsor | — | Paso 4 validado |

Historial: GA4 y Search Console conservan su propio historial (el recolector
puede releer hacia atrás). Los seguidores sólo existen como foto del día, así que
el historial empieza el día que arranque el recolector. Windsor tampoco los
tiene hacia atrás.
