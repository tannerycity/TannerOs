# Barreras

Cada archivo `.mjs` de esta carpeta es una comprobación que `qa-static` corre.
Exporta por defecto una función sin argumentos que devuelve un arreglo de
mensajes de error: vacío si todo está bien.

```js
import fs from 'node:fs';

export default function comprobar() {
  const errors = [];
  // …
  return errors;
}
```

## Por qué una por archivo

Antes estaban todas apiladas al final de `qa-static.mjs`, y cada PR añadía la
suya justo antes de la misma línea. Eso convirtió ese archivo en un punto de
conflicto permanente: **en tres merges se perdieron tres barreras**, y las tres
veces CI siguió en verde, porque una comprobación que desaparece no falla —
simplemente deja de proteger.

Con una barrera por archivo, dos PRs que añaden barreras ya no tocan el mismo
archivo. No hay conflicto que resolver, así que no hay nada que perder al
resolverlo.

## Cómo añadir una

1. Un archivo nuevo aquí. Corre solo: el cargador lee la carpeta completa.
2. Añade su nombre a `INVENTARIO.txt`.
3. **Rómpela a propósito y comprueba que falla.** Una barrera que no muerde es
   peor que ninguna: da la tranquilidad sin dar la protección. En esta misma
   carpeta hubo una que contaba ocurrencias en todo el archivo y no cazaba
   nada; se descubrió al intentar romperla.

## Qué hace el inventario

Una barrera nueva funciona sin tocarlo. Lo que atrapa es **que una desaparezca**,
que es lo único que no se delata solo.
