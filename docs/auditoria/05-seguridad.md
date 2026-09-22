# 05 · Auditoría de seguridad

Medición del 19 de septiembre de 2026. Los hallazgos se **probaron**, no se
dedujeron: cada riesgo se intentó explotar en una transacción revertida.

## Veredicto

**No hay hallazgos P0.** La arquitectura de permisos es sólida y resiste las
pruebas. Lo que hay son capas de defensa que quedaron flojas y conviene apretar
antes de abrir el producto a más clubes.

## Lo que está bien

| Control | Evidencia |
|---|---|
| RLS universal | **0 tablas sin RLS** en `app`, `public` y `migration` |
| `app` fuera de PostgREST | `authenticator` no tiene USAGE sobre `app` ni `private` |
| `search_path` fijo | **0** funciones SECURITY DEFINER sin `search_path` fijo (de 527) |
| Separación de padrones | Staff y familias usan dominios internos distintos |
| Autorización por módulo | `has_module_access(org, módulo, escritura)` en cada comando |
| El dinero, aparte | `can_see_player_money` separa el acceso al expediente del acceso a su cobranza |
| Trazabilidad | `app.domain_events` registra actor y contenido de cada cambio sensible |
| CSP | Definida en `vercel.json`, sin `unsafe-eval`, con `frame-ancestors 'none'` |
| Service role | No aparece en el repositorio; sólo vive en la Edge Function |

## P1 — Alto

### P1-1 · Protección de contraseñas filtradas desactivada

Supabase puede rechazar contraseñas que aparecen en filtraciones conocidas
(HaveIBeenPwned). Está apagado.

Importa más de lo normal aquí: las familias reciben una contraseña temporal y
la cambian por una propia, y ese cambio no valida nada. Con 55 familias
entrando desde el teléfono, la probabilidad de un `123456` es alta.

**Solución:** activarlo en Authentication → Policies. Sin cambio de código.

## P2 — Medio (defensa en profundidad)

### P2-1 · 39 funciones `public.*` alcanzables por `anon`

De las 222 funciones SECURITY DEFINER en `public`, 39 tienen EXECUTE otorgado a
`anon`. Las `v2_public_*` son correctas por diseño (registro público, pedidos,
programas). Estas no deberían estarlo:

```
v2_set_player_photo · v2_billing_players · v2_catalog · v2_post_expense
v2_upsert_product · v2_upsert_bundle · v2_assign_equipment · v2_academy_admin
v2_correct_order_payment · v2_create_internal_order · v2_assign_academy_staff
v2_convert_and_enroll_academy_prospect · v2_production_batch_sheet · …
```

**Se intentó explotar, como visitante sin sesión:**

```
v2_billing_players    ✓ bloqueada: Not authorized
v2_catalog            ✓ bloqueada: Not authorized
v2_set_player_photo   ✓ bloqueada: Not authorized
```

**Ninguna es explotable**: todas validan `auth.uid()` y la membresía por dentro.
El GRANT sobra, pero no abre nada. Por eso es P2 y no P0.

La causa es conocida: en Postgres, **crear una función la otorga a PUBLIC por
defecto**. Cada `create or replace` vuelve a otorgarla.

**Solución:** revocar de `anon` las que no sean `v2_public_*`, y añadir una
verificación al QA que falle si aparece una nueva.

### P2-2 · El esquema `migration` está expuesto a PostgREST

`pgrst.db_schemas` incluye `migration`, que contiene 9 tablas del sistema
anterior, entre ellas `legacy_users` (**21 filas con datos personales**).

Mitigado hoy: `anon` y `authenticated` **no tienen USAGE** sobre ese esquema, y
las 9 tablas tienen RLS. Pero la protección depende de que nadie otorgue USAGE
por error; la migración ya terminó y el esquema no necesita estar publicado.

**Solución:** sacar `migration` de `db_schemas`.

### P2-3 · 143 funciones de `private` con EXECUTE para `anon`

Mismo origen que P2-1. No son alcanzables por HTTP: `private` no está en
`db_schemas` **y** `authenticator` no tiene USAGE sobre él. Dos candados
independientes. Aun así, el contrato del repositorio es que `private` se revoca
siempre, y 143 funciones se lo saltaron.

**Solución:** un `revoke` de barrido y una prueba que lo vigile.

## P3 — Mejora

- **Extensión en `public`**: una extensión instalada en el esquema expuesto.
  Moverla a `extensions`.
- **292 índices nunca usados** de 606. No es seguridad, pero encarece cada
  escritura. Ver `04`.

## Lo que no se auditó

- **Rate limiting**: no se revisó si Supabase tiene límites configurados por IP
  para Auth. Con registro público abierto, conviene mirarlo antes de escalar.
- **Dependencias**: no hay `package.json` ni lockfile en la raíz; el cliente de
  Supabase se trae por CDN sin versión fija (`@supabase/supabase-js@2`). Eso
  significa que **una versión nueva entra sola en producción**. Ver `04`.
- **XSS**: el código escapa con una función `esc()` consistente, pero no se hizo
  una revisión exhaustiva de cada `innerHTML`.
