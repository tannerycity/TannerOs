# Sistema comercial SaaS · Mi Club FC

> Profesionaliza tu club de fútbol. Impulsado por Tannery City.

| Documento | Contenido |
|---|---|
| [00-diagnostico.md](00-diagnostico.md) | Stack verificado, lo que ya existía, hallazgos y riesgos de compatibilidad |
| [01-matriz-funcional.md](01-matriz-funcional.md) | Cada módulo con sus funciones reales, estado, plan, complemento, costos y riesgos |
| [02-arquitectura-y-reglas.md](02-arquitectura-y-reglas.md) | Modelo de datos, estados, reglas, Mercado Pago, CFDI, seguridad y decisiones |
| [03-plan-qa.md](03-plan-qa.md) | TC-001 a TC-020 con evidencia y cómo correr las pruebas |
| [04-despliegue.md](04-despliegue.md) | Pasos con aprobaciones, reversa, checklist y riesgos pendientes |

## Cómo enseñar la demo (sin pagar ni aplicar nada)

Todo corre en el navegador con datos de ejemplo y letrero de demostración: no
se toca la base, no se usa Mercado Pago y no se cobra nada.

| Qué enseñar | Dónde |
|---|---|
| Página de precios | `/precios/?demo=1` |
| Lo que ve la academia ("Mi plan") | Entrar a `/demo` como **Presidencia** → Administración → Mi plan |
| El negocio (MRR, Semilla 20, catálogo) | `/admin/clubes/?demo=1` con la cuenta de la plataforma |

Mientras la rama no se fusione a `main`, la demo vive en la vista previa de
Vercel de la rama (protegida con el inicio de sesión de Vercel del equipo).
Fusionar a `main` la publica en `app.tannerycity.com` **sin** activar cobros:
sin `?demo=1`, `/precios` sigue sin mostrar precios, y lo demás dice
"pendiente de activar" hasta aplicar la migración.

## Archivos

| Archivo | Qué es |
|---|---|
| `supabase/pendientes/saas_comercial_v1.sql` | Migración **sin aplicar** (solo aditiva e idempotente) |
| `v2/saas/precios.js` | Motor de precios en centavos (pantalla) |
| `supabase/functions/saas-suscripcion/` | Edge Function de Mercado Pago (**sin desplegar**, sandbox por omisión) |
| `v2/admin/clubes/comercial.js` | Sección comercial del portal de la plataforma |
| `v2/admin/suscripcion/` | "Mi plan" de la academia: contratar, pagar, cancelar, datos fiscales, facturas y exportar |
| `precios/` | Página pública: solo muestra un catálogo **publicado** (o el de demo con `?demo=1`) |
| `v2/saas/demo.js` | Datos de demostración (catálogo v1 y academias ficticias) |
| `scripts/qa-saas-*.mjs`, `supabase/tests/saas/` | Pruebas |

## Lo que necesita aprobación de Presidencia

Aplicar la migración, aprobar y publicar los precios, validar el IVA, crear la
cuenta de Mercado Pago del SaaS, cobrar en producción y elegir el PAC. Ver
[04-despliegue.md](04-despliegue.md).
