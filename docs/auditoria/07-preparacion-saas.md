# 07 · Preparación para SaaS

## Lo que ya existe

El aislamiento multi-tenant **está construido y es correcto**. No hay que
migrar nada:

| Pieza | Estado |
|---|---|
| Identificador de tenant | `organization_id` con FK a `public.organizations` |
| Aislamiento | RLS en las 129 tablas + validación en cada RPC |
| Roles por organización | `organization_memberships` (rol, activo, propietario) |
| Permisos por módulo | `has_module_access(org, módulo, escritura)` |
| Configuración por club | `organizations.settings`: WhatsApp, prefijo de contraseñas, liga de tienda, fecha de corte |
| Branding por club | Bucket `tanneros-branding` con ruta por organización |
| Invitaciones | `v2_create_invitation` + Edge Function `staff-access` |
| Auditoría | `app.domain_events` con actor y contenido |
| Onboarding | `/admin/onboarding/` con checklist de preparación |

Una organización nueva puede existir hoy sin tocar código.

## Lo que falta

| Falta | Por qué importa | Esfuerzo |
|---|---|---|
| **Planes y límites** | Hoy nada impide que un club suba 10 GB de fotos | Medio |
| **Medición de uso** | No se sabe cuánto consume cada club: ni storage, ni egress, ni usuarios | Medio |
| **Alertas de cuota** | La primera señal del problema fue un correo de Supabase | Bajo |
| **Alta de organizaciones** | No hay flujo de registro de club nuevo; se crea a mano | Medio |
| **Facturación** | `organizations.settings.plan` existe pero no hay cobro | Alto |
| **Exportación y borrado** | Un club que se va no puede llevarse ni borrar sus datos | Medio |
| **Observabilidad** | Sin panel de errores ni trazas; los fallos se descubren por WhatsApp | Medio |
| **Ambientes separados** | Un solo proyecto Supabase: desarrollo y producción son lo mismo | **Alto** |

### El más urgente: no hay ambiente de pruebas

Todo lo que se ha hecho en esta sesión se aplicó **directo a producción**, con
transacciones revertidas como única red. Para un SaaS eso no es sostenible: una
migración equivocada afecta al club que está operando.

Supabase ofrece *branches* de base de datos. Sin eso no hay forma de probar una
migración, y tampoco de correr las pruebas de carga del documento `04`.

## Costos al crecer

Proyección con las correcciones de `03` aplicadas:

| Escala | Fotos | Storage | Egress/mes estimado | Plan |
|---|---:|---:|---:|---|
| Hoy (1 club, 66 jugadores) | 94 | 150 MB → ~15 MB | < 1 GB | Free alcanza |
| 5 clubes, 300 jugadores | ~450 | ~70 MB | ~4 GB | Pro |
| 20 clubes, 1,500 jugadores | ~2,300 | ~350 MB | ~18 GB | Pro |

Sin las correcciones, la columna de egress se multiplica por 15 y el plan Pro
se queda corto a los 5 clubes.

**El dato que manda la economía del producto es kB por sesión**, no el número de
clubes. Con miniaturas WebP de 19 kB, una sesión de portal cuesta ~50 kB; con
originales PNG de 3 MB, la misma sesión cuesta 140 MB. La diferencia entre un
negocio viable y uno que pierde dinero con cada cliente nuevo.

## Plan de migración incremental propuesto

No hace falta una migración de arquitectura. El orden sugerido:

1. **Medir**: tabla `app.organization_usage` alimentada por un cron, con
   storage, filas y usuarios por organización.
2. **Limitar**: `organizations.settings.limits` con techos por plan, validados
   en las RPC de subida.
3. **Alertar**: aviso al 50%, 75% y 90% del techo.
4. **Separar ambientes**: branch de Supabase para desarrollo.
5. **Alta autónoma**: flujo de registro de club nuevo.
6. **Facturación**: al final, cuando lo anterior sea estable.
