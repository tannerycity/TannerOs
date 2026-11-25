# Tanner LIVE

Entrenamientos en vivo, privados, para tutores y staff autorizados de Tannery
City, desde el CCTV Dahua de Tannery City Park.

**Estado (24/11/2026): la base está aplicada en producción; el código, en la
rama `claude/peaceful-sagan-pbosrs` (sin mezclar a `main`).**

- Base: migraciones `h101a…f` aplicadas el 24/11/2026 y verificadas función
  por función contra lo probado en local. Módulo `live` encendido sólo para
  Tannery City FC y sólo Presidencia lo tiene por rol.
- Ya registrados: el *XVR del parque* (Dahua DH-XVR1B16-I/T, 192.168.100.57,
  16 canales) y **4 cámaras de la cancha** por instalar (canales 9–12, rutas
  `tc-cancha-1` a `tc-cancha-4`), apagadas, sin audiencia ni horario.
- `app.tannerycity.com` (rama `main`) todavía no tiene el código: allí no se ve
  nada nuevo. La versión de prueba de Vercel de esta rama sí lo muestra.

| Fase | Qué | Estado |
|---|---|---|
| 1 | Auditoría y arquitectura | Hecha (este documento) |
| 2 | Módulo, navegación, interfaz, permisos y esquema, con proveedor de prueba | **Hecha.** Base aplicada en producción (h101a…f) |
| 3 | Diagnóstico Dahua desde la red del parque | Pantalla y RPC listos; **falta el agente** en sitio |
| 4 | Integración real (MediaMTX + primera cámara) | Pendiente: ver [PRIMERA-CAMARA.md](PRIMERA-CAMARA.md) |
| 5 | QA y despliegue | Pruebas automáticas listas; faltan las de carga y las de campo |

## 1. Lo que encontró la auditoría

El encargo describía Next.js. **TannerOS no es Next.js**, y no se introdujo:

| Pieza | Realidad del repositorio |
|---|---|
| Frontend | HTML + JavaScript (módulos ES) sin framework ni build de bundler. Cada pantalla es `v2/<modulo>/index.html` + `app.js` + `styles.css` |
| Hospedaje | Vercel, sitio estático. `scripts/construir.mjs` copia a `dist/` con huella en las URLs. `vercel.json` tiene rutas, CSP y cabeceras |
| Backend | Supabase: PostgreSQL con RLS. Tablas en `app`, lógica en `private`, la app sólo llama `public.v2_*` (security definer). Edge functions en `supabase/functions/` (se despliegan a mano) |
| Autenticación | Supabase Auth. Staff = `organization_memberships` (roles: Presidencia, Operaciones, Formadores, Contabilidad, Taquilla, Scouting, Academia). Familias = `app.guardians.user_id`, sin membresía |
| Permisos | Módulo por plan (`plan_modules`) y por club (`organization_module_overrides`); lectura/escritura por rol (`role_module_permissions`) y por persona (`private.membership_module_overrides`). `private.has_module_access()` es la regla |
| Multi-club | Toda fila lleva `organization_id`; clubes demo con candado de sólo lectura (`zz_club_read_only`) |
| Secretos | Ninguno en el navegador: la llave pública de Supabase está en `v2/shell.js` (es pública por diseño). Los secretos de servidor viven en Supabase (Edge Function secrets / Vault). No hay `.env` ni `NEXT_PUBLIC_*` |
| QA | `scripts/qa-static.mjs` + barreras (`scripts/barreras/`) + suites `scripts/qa-*.mjs` + humo en Chromium. CI en `.github/workflows/tanneros-qa.yml` |
| Migraciones | `supabase/migrations/` sólo guarda lo **ya aplicado** (con manifiesto y huella). Lo nuevo va a `supabase/propuestas/` |

Consecuencia para el video: Vercel y las edge functions de Supabase son
**serverless y efímeras**. No pueden sostener una conexión RTSP abierta ni
transcodificar. El video necesita un **servidor persistente aparte**.

## 2. Arquitectura elegida

```
 Red del parque (privada)                      Internet (TLS)                    Navegador
 ┌───────────────────────┐   RTSP (sólo     ┌────────────────────────┐ WebRTC  ┌─────────────────┐
 │ Grabador Dahua         │   red local o   │ Gateway MediaMTX        │ (WHEP)  │ app.tannerycity │
 │ NVR/XVR/DVR · :554     │──VPN/túnel────▶ │ live.tannerycity.com    │────────▶│ /live/          │
 │ substream H.264        │   saliente)     │ sourceOnDemand          │  HLS    │ /familias/live/ │
 └───────────────────────┘                  │ authMethod: http ──┐    │(Safari) └────────┬────────┘
                                            └────────────────────┼───┘                   │ RPC con sesión
                                                                 │ ticket                │
                                            ┌────────────────────▼───────────────────────▼───────┐
                                            │ Supabase: v2_live_ticket / v2_live_gateway_autoriza │
                                            │ (permisos, horario, pausa, revocación, bitácora)    │
                                            └──────────────────────────────────────────────────────┘
```

**Por qué así**

- **MediaMTX** (v1.21.4 al 23/11/2026, código abierto) toma el RTSP del grabador
  y lo entrega como WebRTC y HLS sin transcodificar. Con `sourceOnDemand` sólo
  jala la cámara cuando alguien ve.
- **WebRTC (WHEP) primero**: latencia de ~1 s, nativo en Safari de iPhone/iPad,
  Chrome de Android y escritorio, sin librerías. El ticket viaja en
  `Authorization: Bearer` (no en la URL).
- **HLS nativo de respaldo** (Safari): más latencia (varios segundos) pero
  atraviesa redes que bloquean UDP. `<video>` no manda encabezados, así que ahí
  el ticket va en la consulta; vence en minutos y se ata al primer dispositivo.
- **H.264 y substream**: WebRTC en navegadores no soporta H.265 de forma general
  (la documentación de MediaMTX lo advierte). El substream (≈ 704×480) pesa poco
  para el enlace de subida del parque. Recomendado: H.264 sin B-frames.
- **Autorización real**: MediaMTX con `authMethod: http` pregunta en cada
  conexión. Un puente en el mismo servidor llama a
  `v2_live_gateway_autoriza(token, path, accion, ip, sesion)` con la llave de
  servicio. La base vuelve a revisar **todo** como si fuera esa persona
  (horario, pausa, bloqueo, audiencia) y devuelve `expireAt` = fin de la
  sesión o del horario, lo que llegue primero. MediaMTX cierra la sesión a esa
  hora.
- **Revocación inmediata**: pausar, apagar o revocar marca los tickets en la
  base; el puente consulta `v2_live_gateway_cortes` cada pocos segundos y
  expulsa esas sesiones con la API de control de MediaMTX
  (`POST /v3/webrtc/sessions/kick/{id}`, `/v3/hls/sessions/kick/{id}`), que
  sólo escucha en `127.0.0.1`.
- **Compartir el enlace no sirve**: la página no lleva token; el ticket sale de
  una RPC con sesión, dura 120 s para empezar, se guarda sólo como hash
  (SHA‑256) y queda atado a la IP del primer uso.
- **El grabador nunca se expone**: el puerto 554 no se abre a internet. El
  gateway llega al grabador por red local (gateway en el parque) o por un
  túnel/VPN saliente desde el parque (WireGuard o Tailscale). Usuario y clave
  RTSP viven sólo en el servidor del gateway.

Alternativas descartadas: ver la cámara desde DMSS o la nube de Dahua
(prohibido por el encargo y sin control de acceso por familia); transcodificar
en Vercel o en edge functions (imposible: efímeras); librería `hls.js` (no hace
falta con WebRTC, y la CSP prohíbe CDNs: habría que meterla a `vendor/`).

## 3. Qué se construyó (fase 2)

### Base de datos — `supabase/migrations/*_h101[a-f]_*.sql` (aplicadas)

| Tabla (`app.`) | Para qué |
|---|---|
| `live_settings` | Pausa general (botón de pánico), URL del gateway, vigencia de tickets y sesiones, versión de las reglas |
| `live_recorders` | Grabador: tipo, modelo, IP **privada**, puerto, códec, substream, conectividad. **Sin credenciales** (checks lo impiden) |
| `live_cameras` | Cámara: canal, perfil (sub/main), ruta del gateway, encendida, sensible, audio (por defecto no), estado |
| `live_camera_audience` | Quién ve: categorías (sus tutores) y roles del staff |
| `live_camera_windows` | Cuándo: horario semanal (hora de León) |
| `live_access_blocks` | Revocaciones por tutor, por cámara o de todo |
| `live_viewer_terms` | Aceptación de las reglas (no grabar, no compartir) |
| `live_broadcasts` | Botón Transmitir: cámara, modo (enlace/familias), nombre, enlace, fin, cupo |
| `live_tickets` | Tickets de reproducción (hash, vigencia, IP del primer uso, sesión del gateway). Sin usuario si vienen de un enlace |
| `live_diagnostics` | Pruebas reportadas por agente, gateway o persona (sin secretos) |

Reglas que la base hace cumplir (no la pantalla):

- Una cámara **nace apagada, sin audio, sin audiencia y sin horario**.
- No se enciende sin audiencia, sin horario y sin **revisión de permisos de
  imagen** (vigente 30 días). Si hay menores sin permiso de imagen en la
  audiencia, sólo Presidencia la enciende y debe escribir el porqué.
- Cambiar la audiencia la **apaga** y obliga a revisar otra vez.
- Una cámara sensible **nunca** se enciende ni se lista.
- Fuera de horario la familia no ve; el administrador sí (para configurar).
- Pausa general, apagar y revocar **cortan los tickets** al instante.
- Toda acción queda en `app.audit_events` (`live.*`), sin tokens.
- Tablas con RLS y sin acceso directo; todo por RPC. Las RPC del gateway sólo
  las llama `service_role`.

### Pantallas

| Ruta | Quién | Qué |
|---|---|---|
| `/live/` (`v2/live/`) | Staff con el módulo `live` | **Ver** (reproductor). Administradores: **Cámaras**, **Diagnóstico**, **Accesos**, **Bitácora** y **Pausar todo** |
| `/familias/live/` (`v2/familias/live/`) | Tutores | Sus cámaras, reglas, reproductor. Sin shell del staff |
| Inicio del portal | Tutores | Tarjeta "Tanner LIVE" sólo si el servidor dice que tiene cámaras |

| `/ver/#<código>` (`v2/ver/`) | Cualquiera con el enlace, **sin cuenta** | La transmisión de ese enlace, mientras dure |

### Botón "Transmitir" (24/11/2026)

Presidencia: *"un botón de transmitir y ya, y veo a quién le doy acceso"*. Arriba
de **Tanner LIVE › Ver**, para administradores:

1. Elige la cámara.
2. Elige quién la ve: **Cualquiera con el enlace** (rentas de TCP, la final del
   torneo) o **Sólo familias de la academia** (con su cuenta, fuera de su
   horario fijo).
3. Elige cuánto dura: 1 h, 2 h, 3 h o **hasta las 11 pm**.
4. **Transmitir.** El enlace se copia solo; se comparte por WhatsApp.

Se apaga sola al terminar el tiempo. Mientras está en vivo se ve cuánta gente
la ve, y hay **Copiar enlace**, **WhatsApp**, **Nuevo enlace** (el anterior deja
de servir y corta a quien lo usaba) y **Detener**.

Lo que el botón cuida solo, sin preguntarle nada a nadie:

- **Candado de la academia:** una cámara con horario de academia (p. ej. de
  4 a 7 pm) no se transmite por enlace en ese horario. Si una transmisión por
  enlace va a chocar con la academia, se apaga sola cuando empieza. El gateway
  lo revisa otra vez en cada conexión.
- **Cupo:** máximo 50 personas a la vez por enlace (ajustable en la base).
- **Pánico:** *Pausar todo* también detiene todas las transmisiones.
- Cámaras sensibles: nunca. Sin audio, sin grabación.
- El código va después de `#`: no llega al servidor web ni se filtra a otras
  páginas (`referrer: no-referrer`). La página entra siempre como anónima.

**TCP:** la recepción de TCP usa el mismo botón con un usuario de TannerOS que
sólo tenga Tanner LIVE (se da por persona en Usuarios). Quien rentó no necesita
cuenta ni app: sólo el enlace. Horario de TCP: 7 a 11 pm; academia: 4 a 7 pm.

Reproductor (`v2/live/reproductor.js`): no arranca solo, sin audio, sin
descarga ni imagen en imagen, pantalla completa (también en iPhone), estados
*Listo / Conectando / En vivo / En pausa / Sin señal / Error*, reconexión con
ticket nuevo (3 intentos), suelta la conexión si la pestaña se oculta 5 min.
**"En vivo" sólo con cuadros reales de un gateway.**

**Proveedor de prueba**: sin gateway, el administrador puede abrir una *señal
de prueba* generada en el navegador, rotulada "SEÑAL DE PRUEBA · No es una
cámara real". Nunca dice "En vivo" y la familia nunca la ve: a ella se le dice
"Cámara aún no conectada".

### Permisos por rol (después de aplicar h101)

| Rol | Puede |
|---|---|
| Superadministrador (plataforma) | Lo que permita `platform_admins` (no cambia) |
| Presidencia | Todo: cámaras, gateway, audio, encender con justificación, pausa, revocar, bitácora |
| Administrador del club | Se da por persona: Usuarios › persona › Tanner LIVE › escribir |
| Entrenador autorizado | Por persona con lectura + su rol en la audiencia de la cámara de su cancha |
| Padre o tutor | Cámaras cuya audiencia incluye la categoría de su hijo, en horario, con reglas aceptadas |
| Sin permiso | Nada; ni siquiera se le confirma que la cámara existe |

## 4. Variables y secretos

**Frontend: ninguna variable nueva.** No hay `NEXT_PUBLIC_*` ni nada que
configurar en Vercel. La URL del gateway se guarda en la base
(`live_settings.gateway_base_url`, sólo Presidencia) para no redesplegar.

**Servidor del gateway (fase 4, nunca en el repo):**

| Variable | Dónde | Qué |
|---|---|---|
| `DAHUA_RTSP_USER` / `DAHUA_RTSP_PASS` | Servidor del gateway | Usuario **de sólo visualización** creado en el grabador |
| `SUPABASE_URL` | Servidor del gateway (puente) | `https://pacnegivzgxpanphrnwp.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Servidor del gateway (puente) | Llave de servicio. Alternativa más estrecha: una edge function `live-gateway` con un secreto propio |

**CSP (`vercel.json`):** `https://live.tannerycity.com` ya está en `connect-src`
(WHEP) y `media-src` (HLS) desde el 24/11/2026. Si el servidor de video usa otro
dominio, hay que cambiarlo ahí.

## 5. Cómo correrlo en local

```bash
# Pruebas unitarias (Node 22, sin dependencias)
node scripts/qa-live.mjs
node scripts/qa-static.mjs

# Pantallas en Chromium (como en CI)
npm i --no-save playwright-core@1.63.0 && npx playwright install chromium
node scripts/qa-humo-live.mjs
node scripts/qa-humo-navegador.mjs

# Base de Tanner LIVE contra un Postgres 16 local (NO producción)
createdb live && export DB=postgres:///live
psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/tanner-live/replica_local.sql
for f in supabase/migrations/*_h101?_*.sql; do psql "$DB" -v ON_ERROR_STOP=1 -1 -f "$f"; done
psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/tanner-live/pruebas.sql   # 90 pruebas
psql "$DB" -v ON_ERROR_STOP=1 -f supabase/tests/tanner-live/reverso.sql   # deshace todo
```

Para ver las pantallas: `npx serve .` no aplica las rutas de `vercel.json`;
usa `vercel dev` o abre `/v2/live/` y `/v2/familias/live/` directo.

## 6. Cómo se aplicó la base (24/11/2026)

1. Pasó todas las barreras del repo y las 90 pruebas SQL en la réplica local.
2. Se aplicó en producción en seis partes (`h101a` a `h101f`), cada una en su
   transacción, y se comparó una huella de las 63 funciones y de las columnas
   contra la réplica: idénticas.
3. **Lo que encontró producción:** `app.audit_events.aggregate_id` es
   obligatorio y la réplica no lo exigía; pausar, ajustes y aceptar reglas
   habrían fallado al escribir la bitácora. `h101f` lo corrige, y la réplica
   ahora tiene las mismas restricciones (sin `h101f`, las pruebas fallan).
4. Exportada a `supabase/migrations/` con su versión real y manifiesto al día.

### Para el lanzamiento (falta)

1. Mezclar la rama a `main` (PR) para que `app.tannerycity.com` tenga el código.
2. Servidor de video y mini PC en el parque (`gateway/README.md`).
3. Instalar las 4 cámaras con substream H.264 y ponerles audiencia, horario
   (academia 4–7 pm) y revisión de permisos de imagen.
4. Dar el módulo por persona en Usuarios a quien opere el botón Transmitir.

### Aviso aparte (no es de Tanner LIVE)

El historial de Supabase (`supabase_migrations.schema_migrations`) no tiene
registradas 14 migraciones que sí están aplicadas y en el repo (h91–h100,
entre otras): se aplicaron sin `apply_migration`. `scripts/qa-migraciones-vs-base.sh`
ya fallaba antes de h101. Las de Tanner LIVE sí quedaron registradas.

## Archivos

- **[LANZAMIENTO.md](LANZAMIENTO.md) — día de configuración, paso a paso.**
- [LEVANTAMIENTO-PARQUE.md](LEVANTAMIENTO-PARQUE.md) — qué recopilar físicamente en Tannery City Park.
- [PRIMERA-CAMARA.md](PRIMERA-CAMARA.md) — pasos y dependencias para conectar la primera cámara.
- [../../gateway/](../../gateway/README.md) — servidor de video: config de MediaMTX, puente de autorización y prueba de punta a punta.
