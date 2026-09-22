# 01 · Arquitectura actual

Levantamiento del 19 de septiembre de 2026.

## Stack

| Capa | Qué es |
|---|---|
| Frontend | HTML + CSS + **JavaScript nativo con ES modules**. Sin framework, sin bundler, sin paso de build. |
| Hospedaje | Vercel (estático), `vercel.json` con redirects, rewrites y headers |
| Backend | Supabase: Postgres 17.6.1.127, región `us-east-1`, proyecto creado el 21 jun 2026 |
| Cliente | `@supabase/supabase-js@2` por CDN de `esm.sh`, importado en cada módulo |
| Auth | Supabase Auth. Correo real para staff; usuario inventado con dominio `@staff.tanneros.invalid` y `@familias.tanneros.invalid` para quien no tiene correo |
| Funciones | 1 Edge Function (`staff-access`, v12), versionada en `supabase/functions/` |
| Cron | 3 trabajos: cobranza (cada hora), ciclo de programas (cada hora), recordatorios (cada 30 min) |

No hay `package.json` en la raíz: **no hay compilación**. Lo que está en el
repositorio es exactamente lo que recibe el navegador.

## Base de datos

| | |
|---|---:|
| Tablas en `app` | 90 |
| Tablas en `public` | 39 |
| **Tablas sin RLS** | **0** |
| Políticas RLS | 176 |
| RPC públicas `v2_*` | 254 |
| Funciones en `private` | 306 |
| Vistas | 3 |
| Peso de la base | 36 MB |
| Índices | 606 (**292 nunca usados**) |

### El patrón de acceso

Es consistente en todo el sistema y es su mayor fortaleza:

```
navegador → public.v2_<algo>()      ← SECURITY INVOKER, otorgada a authenticated
              └→ private.<query|command>_<algo>()   ← SECURITY DEFINER, revocada
                    └→ app.<tablas>
```

`app` no está expuesto a PostgREST, así que las tablas no se tocan
directamente: todo pasa por una RPC que valida permisos. Las vistas
`charge_balances` y `payment_balances` calculan saldos en vez de guardarlos,
lo que evita estados inconsistentes.

### Esquemas expuestos por PostgREST

```
authenticator → pgrst.db_schemas = public, graphql_public, migration
authenticator → USAGE sobre private: NO · sobre app: NO
```

## Storage

| Bucket | Archivos | Peso | Público |
|---|---:|---:|---|
| `tanneros-private` | 75 | 115 MB | No |
| `tanneros-prospect-photos` | 19 | 35 MB | No |
| `tanneros-branding` | 11 | 651 kB | No |

Las 14 políticas de Storage derivan la organización y el módulo **de la ruta
del archivo** (`private.storage_org_id(name)`, `private.storage_module_code(name)`)
y las cruzan con `has_module_access`. Es un diseño sólido: la autorización de un
archivo no depende de una columna que se pueda desincronizar.

## Multi-tenant: ya existe

Esto no hay que construirlo, ya está:

- `organization_id` en las tablas de negocio, con FK a `public.organizations`.
- Cada RPC recibe `organization_id` y lo valida contra la membresía del usuario.
- `organization_memberships` define rol y estado por organización.
- El acceso por módulo se resuelve con `has_module_access(org, módulo, escritura)`.
- La configuración por club vive en `organizations.settings` (WhatsApp, prefijo
  de contraseñas, liga de la tienda, fecha de corte contable).
- Hasta el branding es por organización (`tanneros-branding`).

**Lo que falta para SaaS no es el aislamiento, es la operación**: planes,
límites, medición de uso y alta de organizaciones nuevas. Ver `07`.

## Módulos

35 pantallas bajo `/v2/`. Por área:

| Área | Módulos |
|---|---|
| Club | jugadores, asistencia, convocatoria, academias, captación, scouting, prospectos, deportivo, porteros, calendario |
| Dinero | taquilla, finanzas, contabilidad, patrocinadores |
| Comercio | pedidos, catálogo, captura, producción, utilería |
| Familias | familias (portal), tanner, estacionamiento |
| Gestión | admin (club, branding, auditoría, onboarding, fotos), usuarios, módulos, qa, dirección |

## Calidad existente

- `scripts/qa-static.mjs`: barrera arquitectónica. Verifica 36 pantallas, 30
  rutas canónicas y **reglas de egress** que fallan si una pantalla firma lotes
  por fuera del caché o si un avatar cae al original.
- `scripts/qa-photo-cache.mjs`: prueba funcional del caché de URLs firmadas.
- `scripts/qa-evaluation-guidance.mjs`
- CI en `tanneros-qa.yml`, con filtros de ruta.

Es poco en cobertura pero de buena naturaleza: son barreras que impiden
regresiones, no pruebas que describen lo que ya pasó.
