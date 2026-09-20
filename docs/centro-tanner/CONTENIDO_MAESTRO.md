# Centro Tanner — contenido cargado

Este archivo documenta qué contenido real se importó a `app.policies`,
`app.faqs`, `app.consent_documents` y `app.centro_tanner_changes` en
`supabase/migrations-escritas-a-mano/202609131002_centro_tanner_module_and_seed.sql`, y
cómo agregar más sin tocar código.

## Regla seguida

No se inventó ninguna política ni dato legal. Solo se cargó:

1. **Aviso de privacidad** — el texto que ya vivía publicado en
   `/aviso-de-privacidad/index.html` desde el 19 de agosto de 2026 (misma
   razón social, domicilio y correo ARCO reales que ya usaba el club).
   Ahora es la única copia; esa página y Centro Tanner leen de aquí.
2. **Reglamento del club, Uso de fotos y video, Términos para visorías** —
   ya existían en `app.consent_documents`; no se tocó su texto.
3. **Pagos y servicios no acumulables** — la política nueva entregada
   explícitamente por Presidencia, con las 3 preguntas frecuentes que la
   acompañaban.
4. Tres FAQ adicionales que solo **resumen** el Reglamento, Uso de imagen
   y Visoría ya reales, para que Inicio no se vea vacío.
5. Changelog: `v1.0` (lanzamiento) y `v1.1` (la política de pagos, con el
   texto exacto de ejemplo de la misión).

## Lo que falta por cargar

El club mencionó que existen del orden de 140 políticas internas. Aquí
solo se cargó el contenido que estaba disponible en el repositorio o que
Presidencia entregó en esta tarea. **No se inventó el resto.**

## Cómo agregar el resto del contenido (sin tocar código)

Opción recomendada — interfaz: `/admin/centro-tanner/` dentro de TannerOS
(rol Presidencia). Crear política → llenar código, categoría, respuesta
corta y texto completo → Publicar.

Opción por lote — SQL: crear una migración nueva en `supabase/migrations/`
insertando filas en `app.policies` (y `app.faqs` si aplica) con el mismo
patrón que `202609131002_centro_tanner_module_and_seed.sql`. Nunca editar
esa migración ya aplicada: cada carga nueva es un archivo nuevo.

Categorías válidas (columna `category`, restringida por `check`):
`inscripcion, mensualidades, becas, entrenamientos, asistencia, partidos,
uniformes, baby_tanners, jugadores, familias, conducta, seguridad, salud,
tanner_os, estacionamiento, tannery_city_park, privacidad, faq`.
