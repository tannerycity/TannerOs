# Captura visual del Perfil Tanner

La captura se hace contra un fixture sin autenticación ni datos personales:

- Ruta: `/v2/qa/perfil-tanner/`
- Viewport móvil oficial: `390 × 844`
- Viewport escritorio de revisión: `1440 × 1000`
- Captura de página completa para revisar las cinco dimensiones y decisiones.

El fixture carga las mismas hojas de estilo de TannerOS y Mi Academia. No simula
Supabase, no contiene fotografías de menores y está marcado `noindex,nofollow`.
Sirve para revisar jerarquía, tamaños táctiles, salto a dos filas de la escala,
ayuda contextual, “Sin evidencia” y la barra fija de guardado.

En un navegador abre:

```text
http://localhost:8000/v2/qa/perfil-tanner/
```

levantando previamente el repositorio con:

```bash
python3 -m http.server 8000
```

La captura autenticada final debe repetirse en staging con un profesor de prueba,
una academia ficticia y sin datos personales reales. El fixture no sustituye esa
validación; permite que la revisión visual sea reproducible en CI o localmente.
