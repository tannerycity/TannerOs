# Analítica de uso TannerOS — primera etapa

**Estatus:** propuesta en PR; no activar en producción antes de validar privacidad, QA y comportamiento real de GA4.

## Propósito
Medir únicamente visitas a la zona de staff autenticado para detectar qué módulos se usan, sin transmitir contenido del sistema. Identificador GA4: `G-KJN3NJS2YJ`. **No incluye Meta Pixel** ni campañas de remarketing para estas pantallas.

## Límites técnicos
- Primero se verifica la autenticación y se obtiene el rol. Solo roles de staff adulto de la lista autorizada; `Tanner`, familias y rutas no incluidas no generan eventos.
- Solicitud de consentimiento analítico independiente de la tienda; no se descarga gtag antes de aceptar.
- `page_view` con URL y título estáticos permitidos; `tanner_module_opened` solo contiene un nombre de módulo aprobado.
- Cualquier query string, fragmento, ruta dinámica, hostname de preview o módulo no reconocido bloquea totalmente la etiqueta.
- No se envían nombre, teléfono, correo, ID de jugador, organización, usuario, token, historial, dinero, salud ni valores de formularios.
- Para retirar permiso, `Preferencias de analítica` → `Solo lo necesario` provoca recarga de página y deja de cargar Google. Limpiar cookies existentes del navegador puede requerir una acción adicional.
- Se evitan duplicados cuando ya existe `gtag` o una etiqueta de Google preinstalada. No instalar el mismo ID también desde GTM.

## Eventos
| Evento | Parámetros | Significado |
| --- | --- | --- |
| `page_view` | `page_location`, `page_title` de lista estática | Vista de sección |
| `tanner_module_opened` | `module_name` de lista estática | Acceso a módulo de staff |

No se registran `login_success`, asistencia, pagos, conversiones ni datos de familias. Esos eventos requieren revisión por separado.

## QA antes de publicar
1. Ejecutar `node scripts/qa-analitica-uso.mjs` y el workflow de TannerOS QA.
2. En sesión limpia, confirmar con DevTools que no se envía nada a Google antes del consentimiento.
3. Elegir `Solo lo necesario`: no debe haber cargas de `gtag.js`.
4. Elegir `Aceptar` en perfil de staff: comprobar en DebugView `page_view` y `tanner_module_opened`.
5. Abrir URLs con `?player=...`, `#...`, `/familias/`, rutas privadas detalladas, o rol Tanner: **sin eventos**.
6. Retirar consentimiento y comprobar que no hay nuevas peticiones después de la recarga.
7. Verificar aviso de privacidad y requisitos aplicables antes de fusionar el cambio.

**Limitación:** GA4 recopila datos técnicos/pseudónimos asociados al dispositivo si la persona acepta. Esta implementación evita transferir datos del negocio, pero no convierte GA4 en medición completamente anónima.
