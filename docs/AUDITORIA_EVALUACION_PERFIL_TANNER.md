# Auditoría e implementación — Perfil Tanner TC 1.0

## Implementación encontrada

- La captura directiva vive en `/v2/deportivo/` y usa `v2_players`,
  `v2_player_sports` y `v2_upsert_player_evaluation`. Guardaba cinco ejes 0–10,
  objetivos, nota, periodo y una extensión de porteros.
- El flujo real del profesor vive en `/v2/mi-academia/`, alimentado por
  `v2_coach_home` y protegido por la academia que devuelve esa RPC. La mutación
  existente es `v2_save_academy_evaluation`; conserva autor, academia y fecha en
  servidor. No se amplió el RBAC ni se expusieron datos administrativos.
- La Ficha Tanner reutiliza `v2_player_sports` para leer historial. Mostraba radar,
  barras y un promedio global, incompatible con TC 1.0.
- No existe en el repositorio una migración verificable ni una mutación de borrador.
  Por compatibilidad, se reutilizó el JSON `scores`, `sports_objective` y `notes`;
  los borradores permanecen locales y no alteran evaluaciones históricas.

## Decisiones implementadas

- La captura oficial se colocó en Mi Academia: academia → evaluaciones/jugadores →
  Tanner → evaluar, sin crear otra ruta.
- Tanner usa cinco dimensiones 1–5. “Sin evidencia” se persiste como ausencia de
  valor, nunca como cero. Baby utiliza el mismo motor con cuatro dimensiones y
  escala propia de tres estados.
- `TC_1.0`, categoría, periodo, fortaleza, prioridad y superpoder se conservan en
  metadata estructurada dentro de la nota compatible del endpoint existente.
- Se agregó borrador automático local, progreso trimestral, acceso rápido y
  “Guardar y siguiente”.
- Se eliminó el promedio global de la Ficha Tanner; el radar queda secundario y la
  lectura principal continúa siendo la lista de dimensiones.

## Límite conocido y siguiente migración

El repositorio no contiene DDL/RLS desplegable para agregar columnas sin riesgo.
La metadata se preserva hoy sin destruir historial. Cuando el esquema de Supabase
se incorpore al repositorio, se deben crear campos nativos para `status`,
`methodology_version`, `category_snapshot`, `strength`, `priority` y `superpower`,
y una RPC de borrador con las mismas reglas de academia que
`v2_save_academy_evaluation`. Hasta entonces no se simula un permiso nuevo desde
el cliente.
