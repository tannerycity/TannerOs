# Conectar la primera cámara Dahua (fases 3 y 4)

Nada de esto se ha hecho todavía. Cada paso dice qué necesita y quién decide.
**No se toca producción, el router ni el grabador sin autorización de
Presidencia.**

## Dependencias abiertas

| # | Qué falta | Quién | Bloquea |
|---|---|---|---|
| D1 | Levantamiento físico ([LEVANTAMIENTO-PARQUE.md](LEVANTAMIENTO-PARQUE.md)) | Staff en el parque | Todo |
| D2 | Confirmar que RTSP abre en VLC dentro de la red del parque | Staff en el parque | D4 |
| D3 | Aprobar y aplicar `h101` (ver README §6) | Presidencia + desarrollo | Panel y familias |
| D4 | Decidir dónde vive el gateway: (a) mini PC en el parque, (b) VPS con túnel | Presidencia | D5 |
| D5 | Subdominio `live.tannerycity.com` + certificado TLS | Quien administra el DNS | Familias |
| D6 | Texto de consentimiento / aviso de privacidad de Tanner LIVE | Presidencia + abogado | Encender |
| D7 | CSP de `vercel.json`: agregar el origen del gateway a `connect-src` y `media-src` | Desarrollo (PR) | Reproducir en producción |

## Recomendación de despliegue del gateway

**Yo recomendaría la opción (b): un VPS pequeño (2 vCPU, 2–4 GB) con MediaMTX
detrás de Caddy (TLS automático) y un túnel WireGuard/Tailscale saliente desde
un equipo pequeño en el parque.**

- El grabador sigue sin puertos abiertos: el túnel lo inicia el parque.
- El ancho de banda hacia las familias sale del VPS, no del internet del parque:
  el parque sube **un** substream (≈ 0.5–1 Mbps) por cámara activa, sin importar
  cuántas familias vean.
- Con la opción (a) cada familia consume subida del parque; con 20 familias a
  0.7 Mbps son ~14 Mbps de subida sólo para una cámara.

## Pasos

1. **D1–D2.** Llenar el levantamiento y registrar en TannerOS el grabador
   (modelo, IP, puerto, canal, códec, substream) y la prueba manual de VLC.
2. **Codificación del substream** en el grabador: H.264 (no H.265 ni Smart
   Codec), 640×360 o 704×480, 15 fps, I-frame 1–2 s, sin audio.
3. **Usuario de sólo vista** en el grabador (`tannerlive`).
4. **Servidor del gateway** (fuera de este repositorio):
   - MediaMTX con [gateway/mediamtx.example.yml](gateway/mediamtx.example.yml).
   - Caddy: `live.tannerycity.com` → `127.0.0.1:8889` (WHEP) y `/…/index.m3u8` → `127.0.0.1:8888`.
   - Firewall: 443/TCP y 8189/UDP+TCP abiertos; 9997 y 9100 sólo locales.
   - Puente de autorización (~80 líneas, Node o Deno) en `127.0.0.1:9100`:
     1. Recibe el JSON de MediaMTX; toma el ticket de `Authorization: Bearer`
        (WHEP) o de `query` `ticket=` (HLS).
     2. Llama `POST {SUPABASE_URL}/rest/v1/rpc/v2_live_gateway_autoriza` con la
        llave de servicio: `{token, path, accion: action, ip, sesion: id}`.
     3. `ok` → 200 y `{"expireAt": expira}`; si no → 401.
     4. Cada 5 s llama `v2_live_gateway_cortes(desde)` y expulsa esas sesiones
        con `POST 127.0.0.1:9997/v3/webrtc/sessions/kick/{id}` (y `hls`).
     5. Reporta el estado de cada ruta con `v2_live_gateway_estado(path, estado, error)`.
     6. Nunca registra tokens ni la URL RTSP en los logs.
   - Agente de diagnóstico (fase 3, el mismo equipo del parque): prueba
     **sólo** la IP y puerto registrados (TCP a 554, `DESCRIBE` RTSP, sondeo
     con `ffprobe` del substream) y reporta con `v2_live_agente_diagnostico`.
     Sin escaneo de red. Sólo cuando un administrador lo pida.
5. **TannerOS:** Presidencia pone `https://live.tannerycity.com` en
   *Cámaras › Servidor de video*. En la cámara: canal, ruta (`tc-cancha-1`),
   audiencia, horario. *Revisar permisos de imagen* → *Encender*.
6. **CSP (D7):** PR que agregue `https://live.tannerycity.com` a `connect-src` y
   `media-src`. Con su prueba en `qa-static`.
7. **Primera prueba real:** un administrador abre `/live/`. El sello debe pasar
   de *Conectando…* a *En vivo* sólo cuando llegan cuadros. Luego una familia
   piloto en `/familias/live/` desde iPhone y Android.

## QA de la fase 5 (antes de abrir a todas las familias)

| Caso | Cómo | Esperado |
|---|---|---|
| Acceso por rol | Presidencia, formador en audiencia, formador fuera, taquilla, tutor T10, tutor T12 | Sólo quien debe |
| Aislamiento de clubes | Tutor y Presidencia de un club demo | No ven cámaras de Tannery |
| Enlace compartido | Copiar la URL de `/familias/live/` a otro teléfono sin sesión | Pide entrar; sin ticket no hay video |
| Ticket compartido | Usar un ticket desde otra IP | `otro_dispositivo` (401) |
| Revocación en vivo | Revocar a un tutor viendo | Se corta en ≤ 5 s |
| Pausa general | Botón *Pausar todo* con 3 sesiones abiertas | Se cortan todas |
| Fin de horario | Ver hasta la hora de cierre | Se corta a la hora (expireAt) |
| Móvil | iPhone Safari, iPad, Android Chrome, escritorio | Reproduce, pantalla completa, sin audio |
| Conexión perdida | Apagar el Wi-Fi 10 s y volver | *Sin señal* → reintenta con ticket nuevo |
| Cámara caída | Desconectar la cámara | *Sin señal*; estado *Fuera de línea* en el panel |
| Carga | 50 lectores WebRTC simultáneos en una cámara | CPU y subida del VPS estables; el parque sube 1 stream |
