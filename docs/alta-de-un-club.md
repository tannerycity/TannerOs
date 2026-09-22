# Dar de alta un club

Paso a paso para estrenar un club en TannerOS. Escrito para que se siga solo,
un mes después, sin tener que preguntar nada.

**Antes de empezar, lo importante:** hasta hoy esto **nunca se ha hecho**.
Tannery City se creó a mano durante la migración inicial, en agosto de 2026, y
desde entonces no se ha dado de alta un segundo club. Lo que sigue está
construido y probado en navegador, pero **la parte de base de datos no se ha
ejecutado todavía**. Por eso el paso 0 no se salta.

---

## Lo que necesitas tener decidido

| Dato | Se cambia después | Nota |
|---|---|---|
| Nombre del club | Sí | |
| **Identificador (slug)** | **No** | Sale en las ligas públicas de registro y tienda |
| Razón social | Sí | Para los documentos legales |
| Zona horaria, moneda | Sí | Por omisión `America/Mexico_City` y `MXN` |
| Día de cargo y de vencimiento | Sí | Después del vencimiento nace el recargo |
| Monto del recargo | Sí | |
| Categorías | Sí | Son del club nuevo, **no** las de Tannery City |

Ten a la mano, además: el correo de quien va a ser Presidencia en ese club, su
logo, y el texto de su reglamento.

---

## Paso 0 · Aplicar la migración · **una sola vez, nunca más**

La pantalla de Clubes ya está en el código, pero las funciones que necesita
**no están en la base de datos**. Están escritas y sin aplicar en:

```
supabase/propuestas/F1_alta_de_un_club.sql
```

**No la apliques directo a producción.** Nadie la ha ejecutado nunca:

1. Crea una rama de Supabase (cuesta ~$0.013 USD la hora, y se borra al
   terminar).
2. Aplica el archivo ahí.
3. Da de alta un club de mentira y revisa que todo salga.
4. Prueba el **reverso**, que viene comentado al final del archivo.
5. Recién entonces, aplícala a producción.
6. Exporta el historial y actualiza el manifiesto:

```bash
node scripts/manifiesto-migraciones.mjs --escribir
```

7. Borra el archivo de `supabase/propuestas/`.

### Quién va a poder crear clubes

La migración crea `public.platform_admins` y mete ahí al dueño actual de
Tannery City. **Sólo quien esté en esa tabla ve la pantalla.** Para sumar a
alguien más:

```sql
insert into public.platform_admins (user_id, note)
values ('<uuid del usuario>', 'quién es y por qué');
```

Esa tabla no se administra desde ninguna pantalla, y es a propósito: dar de alta
clubes está por encima de cualquier club, y no es algo que el dueño de uno deba
poder hacerle a otro.

---

## Paso 1 · Crear el club · 2 minutos

**Club House → Clubes → Dar de alta un club.**

Llena el formulario. El identificador se arma solo a partir del nombre, pero
revísalo: **no se cambia después**.

La pantalla **pide confirmación antes de crear**, y te enseña exactamente lo que
va a hacer. Ese segundo paso existe porque el identificador es para siempre.

### Lo que crea, en una sola transacción

| Qué | Por qué está aquí |
|---|---|
| La organización | Obvio |
| La suscripción al plan | **Sin esto el club nace sin un solo módulo** |
| La política de cobro | Sin esto no se puede generar un cargo |
| Las categorías | Si las diste |

Las cuatro cosas o entran juntas o no entra ninguna. Un club a medias —con
organización pero sin suscripción— se ve igual que uno sano hasta que alguien
intenta entrar y no encuentra nada.

**Guarda la llave pública** que te muestra al terminar: es la que va en las
ligas públicas de ese club.

---

## Paso 2 · El primer usuario · **/usuarios/**

El club existe pero nadie puede entrar. Invita a quien será **Presidencia**.

⚠️ **Aquí hay un hueco conocido.** Las pantallas de TannerOS trabajan sobre
*tu* club, no sobre el que acabas de crear. Para invitar a alguien al club
nuevo, hoy hay dos caminos:

1. **El recomendado:** que esa persona se registre, y luego le creas la
   membresía a mano:

```sql
insert into public.organization_memberships (organization_id, user_id, role, active, is_owner)
values ('<id del club nuevo>', '<uuid de la persona>', 'Presidencia', true, true);
```

2. Agregarte a ti como Presidencia del club nuevo, entrar, y desde ahí usar
   `/usuarios/` normalmente.

**Esto es lo que falta para que el alta sea de verdad de punta a punta.** Está
anotado como el siguiente paso en `docs/auditoria/14`.

---

## Paso 3 · La marca · **/admin/branding/**

Logo, icono de la app y colores. Sin un color primario y al menos un archivo,
la pantalla de preparación lo marca como bloqueo.

---

## Paso 4 · Los documentos que firman las familias · **/admin/centro-tanner/**

Cuatro, y **ninguno se copia de Tannery City a propósito**: son documentos
legales de otro club, con otra razón social.

| Código | Qué es |
|---|---|
| `reglamento` | El reglamento interno |
| `uso_de_imagen` | Consentimiento para fotos y video |
| `visoria` | Términos de visorías |
| `privacidad` | Aviso de privacidad |

---

## Paso 5 · El catálogo · **/catalogo/**

Uniformes, inscripciones, paquetes. Lo que el club venda.

---

## Paso 6 · Revisar que no queden bloqueos · **/admin/onboarding/**

La pantalla de preparación revisa club y región, plan, marca, usuarios y roles,
jugadores, perfiles de cobro y módulos. **No des por terminada el alta hasta que
no quede ningún renglón en rojo.**

---

## Cómo saber que quedó bien

```bash
DATABASE_URL="postgresql://..." ./supabase/tests/correr-todas.sh
```

Las pruebas de aislamiento (01 y 05) recorren **todos** los clubes que existan,
así que con dos clubes valen el doble: comprueban que un tutor de uno no alcanza
al otro.

Y a mano, lo que ninguna prueba cubre todavía: entra al club nuevo, sube una
foto, registra un pago, y confirma desde el portal de familias que se ve.

---

## Cuánto ocupa un club

Con los números de Tannery City al 20 de septiembre de 2026:

| | Hoy | Después de correr la conversión de fotos |
|---|---:|---:|
| Storage por club | 151 MB | ~18 MB |
| **Clubes que caben en 1 GB** | **6** | **más de 50** |

**Corre la conversión del Bloque B antes de vender el segundo club.**
`/admin/fotos/` → Revisar el padrón → Arreglar por lotes.

---

## Si algo sale mal

El alta es una sola transacción: si falla a media, **no deja nada**. No hay que
limpiar.

Si el club se creó pero quieres deshacerlo, y **todavía no tiene datos**:

```sql
-- Revisa primero que de verdad esté vacío.
select (select count(*) from app.players where organization_id='<id>') as jugadores,
       (select count(*) from app.payments where organization_id='<id>') as pagos;

-- Sólo si los dos son cero:
delete from public.subscriptions where organization_id='<id>';
delete from app.billing_policies where organization_id='<id>';
delete from app.categories where organization_id='<id>';
delete from public.organization_memberships where organization_id='<id>';
delete from public.organizations where id='<id>';
```

**Si ya tiene jugadores o pagos, no lo borres.** Ponlo en
`status='inactive'` y pregunta.

---

## Lo que todavía no está resuelto

| Hueco | Dónde |
|---|---|
| Invitar al primer usuario desde una pantalla | Paso 2 |
| Nadie ha corrido la migración | Paso 0 |
| No hay ambiente de pruebas | `docs/auditoria/14` · una rama cuesta ~$0.75 la semana |
| `v2_players` sin paginar | A 2,000 jugadores deja de ser opcional |
