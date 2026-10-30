# Propuesta de tablero ejecutivo

Cada KPI lleva su estado:

- **Observado**: dato medido directamente.
- **Estimado**: calculado o con muestra parcial.
- **No disponible**: falta fuente o autorización.

Nada estimado se presenta como observado.

## Fila 1 · Negocio

| KPI | Fuente | Estado hoy |
|---|---|---|
| Ingresos cobrados (mes) | Supabase taquilla/pagos | Observado |
| Pedidos de tienda pagados | Supabase pedidos | Observado |
| `purchase` en GA4/Meta | servidor (MP → MP/CAPI) | No disponible |
| Costo por lead (Meta) | Windsor Meta + GA4 | No disponible (falta cuenta publicitaria) |

## Fila 2 · Captación (club vs TCP, por hostname)

| KPI | Fuente | Estado hoy |
|---|---|---|
| Sesiones | GA4 Marketing | Estimado (sólo con consentimiento) |
| Clics a WhatsApp | GA4 Marketing | Estimado |
| Leads (`generate_lead`) | GA4 + Supabase lista de espera | Observado en Supabase; estimado en GA4 |
| Interés de reserva | GA4 Marketing (tcp) | Estimado |
| Tasa lead / sesión | GA4 | Estimado |

## Fila 3 · SEO

| KPI | Fuente | Estado hoy |
|---|---|---|
| Clics e impresiones orgánicas | Search Console | Observado (tras conectar) |
| Posición media de "academia de futbol León" y similares | Search Console | Observado |
| Páginas indexadas vs. enviadas | Search Console | Observado |

## Fila 4 · Uso de TannerOS

| KPI | Fuente | Estado hoy |
|---|---|---|
| Usuarios activos día / semana / mes | h55 `v2_usage_summary` | No disponible (h55 sin aplicar) |
| Módulos más y menos usados | h55 / GA4 TannerOS | No disponible / Estimado |
| Acciones clave (cobros, asistencias, pedidos) | GA4 `tanner_feature_used` + Supabase | Observado en Supabase; estimado en GA4 |
| Tiempo de carga p75 por módulo | GA4 `tanner_screen_load` | Estimado |
| Errores por módulo | GA4 `tanner_error` | Estimado |

## Diseño

- Una página, 4 filas, comparación contra el periodo anterior en cada número.
- Cada número lleva su etiqueta de estado.
- Uso de TannerOS: se puede construir dentro de TannerOS (Administración) leyendo `v2_usage_summary`, sin Windsor.
- Marketing y SEO: Windsor → Looker Studio o la herramienta que elija Presidencia.
