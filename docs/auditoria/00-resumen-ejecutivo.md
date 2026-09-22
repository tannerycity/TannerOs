# 00 · Resumen ejecutivo

Auditoría del 19 de septiembre de 2026 · TannerOS · Supabase `pacnegivzgxpanphrnwp`

## Veredicto

**La aplicación es más sólida de lo que el susto del egress sugiere.** La
arquitectura de datos y permisos está bien construida y el aislamiento por
organización ya existe. No hay hallazgos críticos de seguridad.

Lo que sí hay es **un defecto concreto y reparable que explica el 95% del
consumo**, y varias capas de higiene pendientes antes de abrir el producto a
otros clubes.

## Los tres hechos que importan

**1. El egress no era por falta de miniaturas. Era por PNG.**

48 fotos originales son PNG de 3,060 kB de media, contra 204 kB de las WebP
equivalentes. Son 143 MB de los 150 MB almacenados. El código pide WebP, pero
`canvas.toBlob` devuelve PNG —no `null`— cuando el navegador no lo soporta, y
nadie comprueba lo que de verdad regresó. Safari sin soporte de WebP es el
navegador de las familias: por eso los PNG vienen de `players`, `prospects` y
`scouting`, y los WebP de `equipment`, que se captura desde computadora.

**El defecto sigue vivo**: hay PNG subidos hasta el 12 de septiembre. Está
copiado en 8 archivos. La corrección son tres líneas por archivo.

**2. No hay hallazgos P0 de seguridad, y eso se probó.**

39 funciones quedaron alcanzables por visitantes sin sesión. Se intentó
explotarlas —incluida `v2_set_player_photo`— y **todas respondieron
`Not authorized`**: validan por dentro. El GRANT sobra, pero no abre nada. Es
P2, no P0. Cero tablas sin RLS, cero funciones sin `search_path` fijo.

**3. El multi-tenant ya está construido.**

`organization_id` con FK, validación en cada RPC, membresías por organización,
permisos por módulo, configuración y branding por club. Lo que falta para SaaS
no es aislamiento: son planes, límites, medición de uso y alta de clubes.

## Prioridades

| # | Qué | Severidad | Esfuerzo | Ahorro / impacto |
|---|---|---|---|---|
| 1 | Detectar el tipo real de `toBlob` (8 archivos) | **P0 de egress** | Bajo | ~93% del peso de imágenes futuras |
| 2 | Generar las 46 miniaturas faltantes | P1 | Hecho, sin mergear (PR #137) | 99% en listados |
| 3 | `Cache-Control` de 1 hora → 1 año en fotos | P1 | Bajo | Quita re-descargas horarias |
| 4 | Activar protección de contraseñas filtradas | P1 | Un clic | Seguridad de 55 familias |
| 5 | Convertir los 48 PNG existentes a WebP | P1 | Medio | 143 MB → ~10 MB |
| 6 | Quitar `no-store` de `/v2/` | P1 | Bajo | Egress de Vercel y velocidad |
| 7 | Revocar de `anon` lo que no es público | P2 | Bajo | Defensa en profundidad |
| 8 | Sacar `migration` de `db_schemas` | P2 | Bajo | Quita 21 filas personales del alcance |
| 9 | Paginar `v2_players` (56 kB hoy) | P2 | Medio | Necesario para escalar |
| 10 | Podar 292 índices sin uso | P3 | Medio | Escrituras más baratas |

## Lo que esta auditoría no puede afirmar

- **El reparto exacto del egress por ruta.** Los `edge_logs` devolvieron error
  de backend en los dos intentos. El diagnóstico se sostiene en los pesos
  almacenados y en el comportamiento del código, no en una lectura directa del
  tráfico. Es una inferencia fuerte, pero es una inferencia.
- **No se midió rendimiento real bajo carga.** La restricción de no aumentar el
  egress impide las pruebas de carga que pide la Fase 4. Ver `04` para el diseño
  de esos escenarios, listos para correr cuando la cuota se restablezca.
- **Ninguna imagen fue descargada** para producir estos números.

## Sobre el 22 de septiembre

Que la cuota se restablezca no vuelve seguro el despliegue. Si se despliega sin
corregir el punto 1, **el consumo se reproduce**: cada foto que suba una mamá
desde su iPhone seguirá pesando 3 MB. El orden correcto es corregir, medir y
después desplegar. El checklist Go/No-Go está en `09`.
