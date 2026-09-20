# 13 · Bloque D · QA

Rama `claude/auditoria-saas-egress`. **No desplegado. No se escribió una sola
fila en producción: las siete pruebas son de sólo lectura.**

## Resumen

Siete de las ocho pruebas de `06` ya corren y pasan. La octava necesita escribir
y espera un ambiente aparte.

| # | Prueba | Forma | Estado |
|---|---|---|---|
| 01 | Un tutor no ve al hijo de otro | Permisos, SQL | ✅ Pasa |
| 02 | El cobro no se duplica con doble clic | Invariante, SQL | ✅ Pasa |
| 03 | Un pago revertido y reasignado no se pierde | Invariante, SQL | ✅ Pasa |
| 04 | No hay recargo para quien ya pagó | Invariante, SQL | ✅ Pasa |
| 05 | Un Formadores no ve el dinero de una familia | Permisos, SQL | ✅ Pasa |
| 06 | La foto va al Tanner correcto | Invariante, SQL | ✅ Pasa |
| 07 | Ninguna lista descarga un original | Navegador | ✅ Pasa |
| 08 | El formulario público resiste basura | — | ⬜ **Falta: necesita escribir** |

## La decisión que cambió el diseño de las pruebas

El plan original era escribir pruebas sintéticas: crear dos familias de mentira,
mandar el mismo cobro dos veces, revertir un pago a propósito. Eso obliga a
**escribir en la base de un club que está operando**, aunque después se revierta.

Mich frenó ese camino, y tenía razón: una transacción revertida igual mueve
secuencias, dispara triggers y deja huella en tablas de auditoría.

Así que las pruebas cambiaron de forma:

| Familia | Qué hace | Qué demuestra | Qué **no** demuestra |
|---|---|---|---|
| **Permisos** (01, 05) | Suplanta a un usuario real —con `request.jwt.claims`, lo mismo que ve la base desde el navegador— y pide datos ajenos | Que el candado del servidor cierra | Nada sobre lo que la pantalla enseña |
| **Invariantes** (02, 03, 04, 06) | Recorre los libros reales buscando una contradicción | Que **hoy** los datos cuadran | Que el código no pueda descuadrarlos mañana |

Un invariante sobre los datos de hoy es **más fuerte** que una prueba sintética
en un sentido —revisa el libro completo, no un caso de laboratorio— y **más
débil** en otro: si la tabla está vacía, no prueba nada. Por eso cada una falla
si no encontró filas que revisar.

## Lo que encontró la prueba 02

El invariante de cobro duplicado dio positivo la primera vez: **4 pares de pagos
gemelos** —mismo Tanner, mismo monto, mismo día, capturados con menos de dos
minutos de diferencia—.

Se investigaron uno por uno antes de llamarlos defecto:

| Tanner | Monto | Fecha | Conceptos | Veredicto |
|---|---:|---|---|---|
| Luis Máximo Luna | $550 | 5 jul | Mensualidad Julio / Mensualidad Julio | Gemelo real |
| Mikel Formoso | $400 | 6 jul | Mensualidad Julio / Mensualidad Julio | Gemelo real |
| Elías Santino López | $400 | 8 jul | Mensualidad Julio / **Inscripción** | Legítimo: dos cosas distintas |
| David Ponce | $800 | 3 ago | Mensualidad **Julio** / Mensualidad **agosto** | Legítimo: dos meses |

**Los cuatro tienen `source = legacy_import`.** Vienen del sistema viejo, no de
TannerOS, y son anteriores al corte contable del 1 de agosto de 2026 que ya
cerró esa historia.

Filtrando a lo que el club puede volver a equivocar —lo capturado **en**
TannerOS—:

```
54 pagos hechos en TannerOS · 53 con llave de idempotencia · 0 gemelos
```

Por eso la prueba 02 excluye `legacy%` a propósito: incluirlos la dejaría en
rojo para siempre por algo que ya se decidió cerrar. Queda escrito en el archivo
y aquí, para que nadie crea que se barrió debajo de la alfombra.

## Lo que encontró la prueba 05

```
Formadores  : 13 Tanners · 0 con dinero
Presidencia : 75 Tanners · 75 con cuota
```

Las dos mitades importan. El candado `private.can_see_player_money` protege
**siete campos** de `v2_players` (`base_monthly_fee`, `billing_status`,
`needs_review`, `review_reason`, `benefit_active`, `benefit_source`,
`benefit_type`), y ninguno se filtró.

El **control positivo** es igual de necesario: si el candado devolviera `false`
para todo el mundo, la prueba pasaría y el club se quedaría sin ver su propio
dinero. Por eso la prueba también exige que quien sí cobra lo vea.

De paso quedó probado el candado por categoría: el profe ve **13** de los 75.

## Lo que encontró la prueba 07

`qa-static.mjs` ya impedía que el **código** pidiera la foto completa en una
lista. Faltaba comprobarlo **en ejecución**, y ahora lo hace
`scripts/qa-humo-navegador.mjs`:

```
✓ /v2/jugadores/ · 3 firma(s), todas miniaturas
```

La mordida fue clara: al quitarle la miniatura a un Tanner de prueba, la lista
pasó a firmar **2 en vez de 3**. O sea **lo deja fuera en lugar de caer al
original**, que es exactamente la regla 1 del contrato de egress de Codex.

## Que las pruebas muerdan, no sólo que pasen

Una prueba que pasa contra código sano y también contra código roto no vale
nada. Ya pasó en este trabajo: la primera versión de `qa-image-encode` pasaba
contra el defecto que debía atrapar.

Así que cada invariante se comprobó contra filas reales:

| Comprobación | Esperado | Encontrado |
|---|---|---|
| 02 sin el filtro de legacy | > 0 | **4** gemelos |
| 03 con el umbral invertido | > 0 | **129** pagos |
| 04 con la comparación invertida | > 0 | **46** recargos |
| 06 agrupando por Tanner | 51 | **51** fotos |

Las consultas alcanzan datos reales: no están pasando por no encontrar nada.
Además, cada prueba falla explícitamente si revisó cero filas.

## Cómo se corren

```bash
DATABASE_URL="postgresql://..." ./supabase/tests/correr-todas.sh
```

Una que pasa no imprime error y termina en 0. Una que falla levanta
`PRUEBA FALLÓ: …` con el detalle de qué filas la rompieron.

Las de navegador van aparte, porque necesitan Chromium:

```bash
npm i playwright-core && node scripts/qa-humo-navegador.mjs
```

## La prueba 08, y por qué no está

El formulario público **escribe**: un registro crea un prospecto y sube una
foto. No hay forma de probarlo de verdad sin dejar basura en el club.

Necesita un ambiente aparte. Las opciones, en orden de lo que yo recomendaría:

1. **Una rama de Supabase** (`create_branch`): copia la base, se prueba encima y
   se tira. Cuesta dinero y hay que autorizarlo.
2. Un proyecto de Supabase gratis aparte, sembrado con datos de mentira.
3. Dejarla como está y probar el formulario a mano antes de cada despliegue.

Lo mismo aplica a las formas **sintéticas** de 02, 03 y 04 —mandar el cobro dos
veces de verdad, revertir un pago de verdad—. Aquí están como invariantes, que
es lo que se puede hacer sin tocar un club que está operando.

## Hallazgo aparte: las migraciones no están en el repositorio

Revisando la base salió algo que no es del Bloque D pero no se puede callar:

```
migraciones aplicadas en Supabase : 312
archivos en supabase/migrations/  :  11
```

**Faltan 301.** Están versionadas en Supabase, sí, pero **no en git**: no
pasaron por revisión de código, no tienen historia, y **la base de datos no se
puede reconstruir desde el repositorio**.

Para un club que opera, es un riesgo de recuperación. Para un SaaS que va a
tener más de un cliente, es bloqueante: no hay forma de levantar el esquema de
un cliente nuevo desde el código.

No lo arreglé porque exportar 301 migraciones es un trabajo en sí mismo y
merece su propia decisión. Va como recomendación al **Bloque E**.

## Lo que este bloque NO hizo

- **No escribió nada en producción.** Ni en una transacción revertida.
- **No se desplegó.**
- **La prueba 08 no existe**, y las formas sintéticas de 02, 03 y 04 tampoco.
- **No hay prueba en WebKit**, que es el hueco que costó los 143 MB en PNG.
  `06` lo pide y sigue sin resolverse: aquí no hay WebKit instalado.
