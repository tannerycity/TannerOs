# Fotos · qué falta para no cargarnos el Supabase

Medido el 20 de septiembre de 2026, con consultas de sólo lectura.

## La respuesta corta

**No está listo.** Falta lo más importante y es lo más fácil: **desplegar**.

El arreglo del PNG silencioso, la herramienta de conversión y el caché de fotos
están terminados y probados, pero viven en la rama
`claude/auditoria-saas-egress`. **`main` sigue sin ellos**, así que producción
sigue exactamente igual que cuando saltó la alarma.

## Dónde está el peso, de verdad

| Carpeta | PNG | Peso PNG | Archivos | ¿La herramienta lo arregla? |
|---|---:|---:|---:|---|
| `players` | 37 | **105 MB** | 51 | ✅ Sí |
| `prospects` | 13 | **35 MB** | 19 | ❌ **No** · necesita migración |
| `scouting` | 2 | **4 MB** | 2 | ❌ **No** · sólo código |
| `branding` | 11 | 651 kB | 11 | ✅ A propósito: son los iconos de la app |
| `equipment` | 0 | — | 22 | Ya están en WebP |

**Corrección a lo que dije antes:** cuando escribí que la herramienta arregla
«los 48 PNG», cubría **sólo el padrón**. Los 39 MB de prospectos y scouting
quedaron fuera y no lo dije. Aquí está el plan para cerrarlos.

## Espacio no es lo mismo que tráfico

La cuota que se disparó —11.87 GB de 5.5 GB— es de **egress**: bytes que salen
porque alguien abre una pantalla. Y eso lo domina **el padrón**, que se abre
todos los días desde Jugadores, Asistencia, Convocatoria y Taquilla.

Prospectos y scouting **casi no generan egress**: sus listas no abren fotos
solas —lo impide una barrera de `qa-static.mjs`— y se consultan poco. Sus 39 MB
pesan para el límite de 1 GB y para la cuenta del SaaS, **no** para la factura
que disparó la alarma.

Por eso el orden es: **primero el padrón**, que es el 100% del problema de hoy;
prospectos y scouting después, que son el 27% del espacio.

## El padrón, con números exactos

```
51 Tanners con foto
47 sin miniatura          → hoy se ven como iniciales en las listas
36 con original PNG o de más de 400 kB
51 por arreglar (todos)
117 MB de descarga para arreglarlos de un jalón
```

El último PNG entró el **12 de septiembre**. Que no hayan entrado más en ocho
días es porque nadie ha subido fotos, **no** porque esté arreglado: el arreglo
sigue sin desplegarse.

## Los cuatro pasos que faltan

| # | Qué | Quién | Cuándo |
|---|---|---|---|
| 1 | **Desplegar la rama a `main`** | Mich | Ya |
| 2 | Correr la conversión del padrón, por lotes | Mich | Después del 22 |
| 3 | Subir una foto desde un iPhone real y confirmar que llega `.jpg` bajo 400 kB | Mich | Tras el paso 1 |
| 4 | Prospectos y scouting | Falta hacerlo | Sin prisa |

### Paso 2, en detalle

**/admin/fotos/ → Revisar el padrón → Arreglar N fotos**

Revisar es gratis: lee la ficha de cada archivo, no descarga ninguna foto. Te
dice cuántos MB costaría antes de gastar uno solo.

Hazlo **por lotes de 10**. Son 117 MB en total; en lotes ves el resultado sin
comprometer la cuota de golpe.

La herramienta **no borra nada**: sube la foto nueva a una ruta nueva, apunta el
padrón ahí, y al final te lista los archivos viejos que quedaron sin uso para
que decidas aparte.

### Paso 4, en detalle

**Scouting (4 MB)** no necesita migración, pero sí cuidado: `v2_set_scouting_photo`
**valida el formato de la ruta** y exige `profile-<10 a 16 dígitos>.<ext>`. La
herramienta hoy escribe `profile-<stamp>-opt<stamp>.webp`, que **no pasa esa
validación**. Hay que escribir una marca de tiempo nueva, no un sufijo.

**Prospectos (35 MB)** sí necesita migración: `app.prospects` **no tiene columna
de miniatura**, y no existe ninguna RPC autenticada que actualice la foto de un
prospecto. Está escrita y sin aplicar en
`supabase/propuestas/F2_miniaturas_de_prospectos_y_scouting.sql`.

## Qué pasa cuando esto termine

| | Hoy | Después |
|---|---:|---:|
| Foto nueva desde un Safari sin WebP | 2,971 kB | **95 kB** |
| Foto vista dos veces el mismo día | se baja dos veces | **se baja una** |
| Peso del padrón en Storage | 117 MB | ~10 MB |
| Storage por club | 151 MB | ~18 MB |
| Clubes que caben en 1 GB | 6 | **más de 50** |

## Lo que no se puede prometer

**Nadie ha subido una foto desde un iPhone real con el código nuevo.** La
medición de 2,971 kB → 95 kB se hizo en Chromium con `toBlob` parcheado para
comportarse como Safari sin WebP. Reproduce **el mecanismo**, no **el
navegador**. El paso 3 existe justo por eso, y hasta que se haga, el criterio 5
del checklist sigue abierto.
