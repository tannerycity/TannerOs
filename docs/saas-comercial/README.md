# Sistema comercial SaaS · Mi Club FC

> Profesionaliza tu club de fútbol. Impulsado por Tannery City.

| Documento | Contenido |
|---|---|
| [00-diagnostico.md](00-diagnostico.md) | Stack verificado, lo que ya existía, hallazgos y riesgos de compatibilidad |
| [01-matriz-funcional.md](01-matriz-funcional.md) | Cada módulo con sus funciones reales, estado, plan, complemento, costos y riesgos |
| [02-arquitectura-y-reglas.md](02-arquitectura-y-reglas.md) | Modelo de datos, estados, reglas, Mercado Pago, CFDI, seguridad y decisiones |
| [03-plan-qa.md](03-plan-qa.md) | TC-001 a TC-020 con evidencia y cómo correr las pruebas |
| [04-despliegue.md](04-despliegue.md) | Pasos con aprobaciones, reversa, checklist y riesgos pendientes |

## Archivos

| Archivo | Qué es |
|---|---|
| `supabase/pendientes/saas_comercial_v1.sql` | Migración **sin aplicar** (solo aditiva e idempotente) |
| `v2/saas/precios.js` | Motor de precios en centavos (pantalla) |
| `supabase/functions/saas-suscripcion/` | Edge Function de Mercado Pago (**sin desplegar**, sandbox por omisión) |
| `v2/admin/clubes/comercial.js` | Sección comercial del portal de la plataforma |
| `precios/` | Página pública: solo muestra un catálogo **publicado** |
| `scripts/qa-saas-*.mjs`, `supabase/tests/saas/` | Pruebas |

## Lo que necesita aprobación de Presidencia

Aplicar la migración, aprobar y publicar los precios, validar el IVA, crear la
cuenta de Mercado Pago del SaaS, cobrar en producción y elegir el PAC. Ver
[04-despliegue.md](04-despliegue.md).
