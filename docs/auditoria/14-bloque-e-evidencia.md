# 14 · Bloque E · preparación para SaaS

Rama `claude/auditoria-saas-egress`. **No desplegado. No se modificó la base de
datos: todo lo de este bloque es medición de sólo lectura y una propuesta sin
aplicar.**

## Resumen

| Paso | Plan | Estado |
|---|---|---|
| — | El historial de migraciones en el repositorio | **Hecho** · 378, verificadas byte por byte |
| E0 | ¿Qué tan multi-tenant es hoy? | **Medido** · mejor de lo que parecía |
| E1 | Medición de uso por organización | **Propuesta escrita, sin aplicar** |
| E2 | Límites por plan | **Propuesta escrita, sin aplicar** |
| E3 | Avisos al 50/75/90% | **Propuesta escrita, sin aplicar** |
| E4 | Rama de Supabase para pruebas | **Costo averiguado** · falta tu sí |

## E0 · el sistema ya es multi-tenant, y bien

Antes de proponer una migración a multi-tenant había que medir cuánto falta. La
respuesta corta: **casi nada**.

```
organizaciones                     1
tablas en el esquema app          90
  con organization_id             87
  con RLS activo                  90  ← todas
políticas RLS                    156
```

Las **tres** tablas sin `organization_id` se revisaron una por una, y ninguna es
un hueco:

| Tabla | Por qué está bien |
|---|---|
| `business_rule_catalog` | RLS activo y **cero políticas** = nadie entra salvo por función `SECURITY DEFINER` |
| `consent_document_versions` | Cuelga de `consent_documents`, que sí está por club |
| `policy_versions` | Cuelga de `policies`, igual |

Y las que tienen `organization_id` pero no lo usan en sus políticas, también:

| Tabla | Por qué está bien |
|---|---|
| `push_subscriptions` | Se filtra por `user_id = auth.uid()`, que es **más estricto**: una suscripción es de una persona, no de un club |
| `qa_runs`, `qa_results` | Su única política es para `service_role`; `authenticated` no tiene ninguna, o sea acceso negado |

### La función que había que revisar de verdad

`private.public_centro_tanner_document` es **pública** —la llama gente sin
cuenta— y toca `consent_document_versions`, una tabla sin `organization_id`. Con
un segundo club, ahí es donde se filtraría un documento ajeno.

Se leyó completa. Resuelve el club desde la llave pública, busca el documento
`where organization_id = v_org`, y **sólo entonces** pide las versiones de ese
documento. El alcance es transitivo y correcto. Además trae límite de peticiones.

**Veredicto: no hace falta una migración a multi-tenant.** El esquema ya lo es.
Lo que falta es lo comercial —medir, limitar, avisar— no lo estructural.

## Los números que cambian la conversación

```
Tannery City FC · 162 jugadores · 11 usuarios · 64 tutores
                · 105 archivos · 151 MB de Storage
```

**151 MB para un solo club**, con 1 GB en el plan gratuito. Al sexto club se
acaba el espacio, y nadie se entera hasta que algo deja de subir.

Después de correr la conversión del Bloque B, ese mismo club baja a unos
**18 MB**. Entonces caben más de **50 clubes** en el mismo plan.

| | Hoy | Tras el Bloque B |
|---|---:|---:|
| Storage por club | 151 MB | ~18 MB |
| Clubes en 1 GB | **6** | **más de 50** |

Ese factor de ocho es la diferencia entre un SaaS que no cierra números y uno
que sí. Y es la razón por la que **correr la conversión importa más que
cualquier otra cosa pendiente**.

## E1, E2 y E3 · propuesta escrita, sin aplicar

`supabase/propuestas/E1_E2_E3_medicion_limites_y_avisos.sql`.

Está **fuera** de `supabase/migrations/` a propósito: ahí sólo van las
migraciones ya aplicadas, y `qa-static.mjs` ahora falla si aparece una que no lo
esté.

**E1 · medir.** Una tabla `app.organization_usage` con una foto diaria por club:
jugadores, usuarios, tutores, archivos y bytes. La llave `(club, día)` la hace
idempotente — el cron puede correr dos veces sin duplicar, que es exactamente el
defecto que apareció en el motor de recargos.

**E2 · limitar.** Los topes viven en `organizations.settings.limits`, junto a los
ajustes que el club ya usa. **Un límite ausente significa sin límite**, así que
aplicar esto no le cambia nada a Tannery City hasta que alguien le ponga uno a
propósito.

**E3 · avisar.** Se escribe un evento de dominio, que es el canal que el sistema
ya tiene, y **no se repite el mismo nivel el mismo día**: nadie quiere cuatro
notificaciones de lo mismo.

### Qué se verificó y qué no

**Sí se verificó**, con consultas de sólo lectura: que `app.domain_events` tiene
las columnas que la propuesta usa, que `organizations.settings` existe, que
`cron.schedule` está disponible, y que `storage.objects` guarda el peso en
`metadata->>'size'` —de ahí salieron los 151 MB—.

**No se verificó que corra.** Nadie la ha ejecutado. Lleva su reverso escrito y
va a una rama de Supabase antes que a producción.

## E4 · la rama de pruebas

Es el paso que el plan llamaba «el más importante», y sigue sin existir: **hoy
no hay ambiente de pruebas**. Todo se prueba contra el club que opera.

El costo, según Supabase:

| | |
|---|---:|
| Por hora | **$0.01344 USD** |
| Un día completo | ~$0.32 USD |
| Un mes encendida 24/7 | ~$9.70 USD |
| Una semana, 8 horas al día | **~$0.75 USD** |

Una rama se crea y se borra cuando se quiere, así que lo realista es la última
fila. **Menos de un dólar** por una semana de trabajo con red.

Lo que desbloquea, todo junto:

1. La **prueba 08** del Bloque D (el formulario público, que escribe).
2. Las formas **sintéticas** de las pruebas 02, 03 y 04 — mandar el cobro dos
   veces de verdad, revertir un pago de verdad.
3. Probar **esta propuesta** antes de tocar producción.
4. Ensayar cualquier cambio de esquema sin arriesgar al club.

**No la creé.** Cuesta dinero y necesita tu sí.

## El alta de un club · construida

El hueco que este documento señalaba —«el esquema aguanta varios clubes pero
nadie ha dado de alta uno»— ya tiene camino. Tres piezas:

**1. La migración**, en `supabase/propuestas/F1_alta_de_un_club.sql`, **sin
aplicar**. Crea `public.platform_admins` —porque dar de alta clubes está por
encima de cualquier club, y hoy no existía nada por encima de `is_owner`— y una
función que crea en **una sola transacción** la organización, su suscripción, su
política de cobro y sus categorías.

Esas cuatro van juntas porque son las que, si salen a medias, dejan un club
roto: sin suscripción el club nace **sin un solo módulo**, y se ve igual que uno
sano hasta que alguien intenta entrar.

Lo que **no** crea, a propósito: los documentos legales. Copiarle a otro club su
reglamento y su aviso de privacidad —con otra razón social— sería un regalo
envenenado. La función devuelve la lista de lo que falta, y la pantalla la
enseña.

**2. La pantalla**, `/admin/clubes/`, sólo visible para quien esté en
`platform_admins`. Probada en navegador en cuatro escenarios:

```
A · sin la migración aplicada  → «Falta aplicar la migración», con la ruta del archivo
B · usuario sin permiso        → «Esta pantalla no es para tu cuenta»
C · administrador              → lista los clubes con jugadores, usuarios y plan
D · el identificador           → «Deportivo Águilas de Tepa» → deportivo-aguilas-de-tepa
E · confirmación               → tras el primer clic no se creó nada
F · alta completa              → id, slug, plan, llave pública y los 5 pendientes
```

El paso E importa: el identificador sale en las ligas públicas y **no se cambia
después**, así que la pantalla obliga a leerlo dos veces.

**3. El runbook**, `docs/alta-de-un-club.md`: los siete pasos, qué se cambia
después y qué no, cómo verificar, cómo deshacer, y cuánto ocupa un club.

### Un enlace roto que apareció de paso

El Club House enlaza a `/admin/fotos/`, pero esa ruta **no existía en
`vercel.json`**: iba a dar 404. No es de esta sesión —el enlace ya estaba— pero
se arregló junto con el nuevo, y las dos rutas quedaron en el contrato de
`qa-static.mjs` para que no vuelva a pasar.

### El hueco que queda

**Invitar al primer usuario del club nuevo desde una pantalla.** Las pantallas
de TannerOS trabajan sobre *tu* club, no sobre el que acabas de crear, así que
hoy la membresía de Presidencia se crea con un `insert` a mano. El runbook trae
el SQL. Es lo último que falta para que el alta sea de verdad de punta a punta.

## Lo que falta para vender el segundo club

Por orden de lo que yo haría:

| # | Qué | Por qué |
|---|---|---|
| 1 | **Correr la conversión de fotos** | De 6 clubes a 50 en el mismo plan |
| 2 | Crear la rama de pruebas | Desbloquea todo lo demás |
| 3 | Aplicar E1/E2/E3 ahí y probarlas | Sin medición no hay plan que cobrar |
| 4 | Aplicar `F1_alta_de_un_club.sql` y dar de alta uno | Construido y probado en navegador; falta correr la migración |
| 5 | Paginar `v2_players` (C2) | A 2,000 jugadores deja de ser opcional |

El punto 4 es el que nadie ha probado: **el esquema aguanta varios clubes, pero
nadie ha dado de alta uno**. Existe `add_saas_onboarding_readiness`, así que hay
camino empezado, pero no está recorrido.

## Lo que este bloque NO hizo

- **No modificó la base de datos.** Ni una tabla, ni una función, ni un cron.
- **No creó la rama** de Supabase.
- **No migró nada a multi-tenant**, porque la medición dice que no hace falta.
- **No se desplegó.**
