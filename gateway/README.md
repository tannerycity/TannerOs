# Servidor de video de Tanner LIVE

Lo que corre fuera de Vercel y de Supabase: **MediaMTX** (toma el video del DVR
y lo entrega al navegador) y el **puente** (`puente.mjs`), que decide quién ve
preguntándole a la base.

```
DVR Dahua ──RTSP (red privada o túnel)──▶ MediaMTX ──WebRTC/HLS + TLS──▶ navegador
                                             │ ¿lo dejo ver?
                                             ▼
                                       puente.mjs ──▶ Supabase (v2_live_gateway_*)
```

| Archivo | Qué es |
|---|---|
| `mediamtx.yml` | Configuración de MediaMTX v1.21.4. Sin secretos ni cámaras |
| `puente.mjs` | Autoriza, da de alta cámaras, corta sesiones y reporta estado. Node 22, sin dependencias |
| `prueba-local.mjs` | Prueba de punta a punta con un DVR simulado, en una sola máquina |

## Variables del puente (sólo en el servidor, nunca en el repo)

| Variable | Ejemplo | Nota |
|---|---|---|
| `SUPABASE_URL` | `https://pacnegivzgxpanphrnwp.supabase.co` | |
| `SUPABASE_SERVICE_ROLE_KEY` | *(secreto)* | Sólo llama `v2_live_gateway_*` |
| `DVR_HOST` | `192.168.100.57` | IP del DVR **vista desde el servidor** (red del parque o túnel) |
| `DVR_PUERTO` | `554` | |
| `DVR_USUARIO` / `DVR_CLAVE` | `tannerlive` / *(secreto)* | Usuario **de sólo ver** en el DVR |
| `CAMARAS` | `[{"ruta":"tc-cancha-1","canal":9}]` | O la ruta a un `camaras.json`. La `ruta` es la misma que se pone en Tanner LIVE › Cámaras |

## Instalar en el servidor (cuando haya servidor)

1. Descargar MediaMTX v1.21.4 de su página de releases en GitHub y **verificar
   el sha256** contra `checksums.sha256`.
2. Copiar `mediamtx.yml` y `puente.mjs`. Correr los dos como servicios
   (systemd), con las variables de arriba en un archivo `EnvironmentFile`
   de permisos 600.
3. Caddy con TLS automático para `live.tannerycity.com`:
   ```
   live.tannerycity.com {
     reverse_proxy /*/index.m3u8 127.0.0.1:8888
     reverse_proxy 127.0.0.1:8889
   }
   ```
   (HLS va a 8888 por sus rutas `.m3u8`/segmentos; ajustar con la doc de Caddy.)
4. Firewall: abrir 443/TCP y 8189/UDP+TCP. **Nada más.** 9997 (API) y 9100
   (puente) sólo escuchan en 127.0.0.1.
5. En Tanner LIVE › Cámaras › Servidor de video, Presidencia pone
   `https://live.tannerycity.com`.

## Probar todo en una sola máquina (sin tocar producción)

Necesita Postgres 16, ffmpeg con libx264, openssl, el binario de MediaMTX,
Chromium y `playwright-core`.

```bash
PG="-h /var/run/postgresql -U postgres" MEDIAMTX=./mediamtx \
CHROME_PATH=/ruta/a/chrome node gateway/prueba-local.mjs
```

Resultado esperado (24/11/2026: 12/12):

- la base da un enlace al tocar Transmitir
- el enlace se ve **en vivo** con imagen real que pasó por usuario y clave del "DVR"
- un ticket inventado o sin ticket: rechazado por el servidor de video
- el puente reporta la cámara en línea, y no escribe claves ni tokens en su bitácora
- **Detener** corta el video en segundos y la página dice que terminó

## Con el DVR real

El navegador sólo reproduce **H.264**. Hoy los substreams del XVR están en
H.265: las 4 cámaras nuevas de la cancha deben quedar con substream H.264,
704x480, 15 fps, ~512 kbps (ver `docs/tanner-live/PRIMERA-CAMARA.md`).
