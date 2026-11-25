# Tanner LIVE · día de configuración

Todo lo de código y base de datos ya está hecho. Esta guía es lo que falta,
en orden. Cada paso dice quién lo hace y cómo saber que salió bien.

**Ya listo (24–25/11/2026):** base en producción (h101a…f), pantallas en
`app.tannerycity.com`, XVR del parque y 4 cámaras de la cancha registradas
(canales 9–12, rutas `tc-cancha-1` a `tc-cancha-4`, apagadas), servidor de
video escrito y probado de punta a punta, instalador del servidor.

## 0. Antes (una vez)

| # | Qué | Quién | Listo cuando |
|---|---|---|---|
| 0.1 | Instalar las 4 cámaras en los **canales 9, 10, 11 y 12** del XVR | Instalador | Se ven en la vista en vivo del DVR |
| 0.2 | Substream de esos 4 canales: **H.264, 704x480, 15 fps, CBR ~512 kbps, I-frame 1–2 s, sin audio** | Instalador | Foto de *Cámara › Codificar* de cada canal |
| ~~0.3~~ | IP del DVR fija: **192.168.100.200** — **hecho 25/11/2026** (estática en el DVR, fuera del rango DHCP del módem: .2–.100) | — | — |
| 0.4 | Usuario **de sólo ver** en el DVR: `tannerlive` (vista en vivo de canales 9–12) | Presidencia / instalador | Contraseña guardada en el gestor del club |
| 0.5 | Prueba VLC: `rtsp://192.168.100.200:554/cam/realmonitor?channel=9&subtype=1` | Quien esté en el parque | Se ve la cancha |

## 1. Servidor de video (≈ 1 hora)

| # | Qué | Detalle |
|---|---|---|
| 1.1 | Contratar un **VPS Ubuntu 24.04** (2 vCPU, 2–4 GB) | Cualquier proveedor. Anotar su IP pública |
| 1.2 | DNS: registro **A** `live.tannerycity.com` → IP del VPS | Quien maneja el dominio |
| 1.3 | En el VPS: `git clone` del repo y `sudo bash gateway/servidor/instalar.sh` | Instala MediaMTX (con verificación sha256), Node, Caddy, Tailscale, servicios y firewall |
| 1.4 | `sudo tailscale up --accept-routes` | Cuenta gratuita de Tailscale del club |

## 2. Mini PC en el parque (≈ 30 min)

Una computadora chica (mini PC o Raspberry Pi 4/5) conectada por cable al
mismo router que el DVR, siempre prendida y con no-break si se puede.

| # | Qué | Detalle |
|---|---|---|
| 2.1 | Instalar Tailscale | tailscale.com/download |
| 2.2 | `sudo tailscale up --advertise-routes=192.168.100.200/32` | Sólo anuncia el DVR, nada más de la red |
| 2.3 | En el panel de Tailscale: **aprobar la ruta** y desactivar el vencimiento de llave de esa máquina | |
| 2.4 | Desde el VPS: `nc -zv 192.168.100.200 554` | Debe decir *succeeded* |

Así el DVR **no se abre a internet**: el túnel lo inicia el parque.

## 3. Encender el servidor de video (≈ 10 min)

| # | Qué | Detalle |
|---|---|---|
| 3.1 | `sudo nano /etc/tannerlive/puente.env` | Llenar `SUPABASE_SERVICE_ROLE_KEY` (Supabase › Project Settings › API) y `DVR_CLAVE` (la del usuario `tannerlive`) |
| 3.2 | `sudo systemctl restart mediamtx tannerlive-puente caddy` | |
| 3.3 | `journalctl -u tannerlive-puente -f` | Debe decir `cámara tc-cancha-1 → canal 9 (sub)` … y `puente escuchando` |
| 3.4 | Abrir `https://live.tannerycity.com` en el navegador | Candado verde (Caddy sacó el certificado). Una página en blanco o 404 está bien |

## 4. Configurar en Tanner LIVE (≈ 15 min, desde el celular)

En **app.tannerycity.com › Tanner LIVE**:

| # | Pantalla | Qué |
|---|---|---|
| 4.1 | Cámaras › **Servidor de video** | Gateway: `https://live.tannerycity.com` → Guardar (sólo Presidencia) |
| 4.2 | Cámaras › cada cámara › **Editar** | Nombre (ej. *Cancha 1*), **quién la ve** (categorías de la academia), **horario** (días de academia, 16:00–19:00). Las rutas `tc-cancha-1…4` ya están puestas: no cambiarlas |
| 4.3 | Cámaras › **Revisar permisos de imagen** | Dice cuántos niños de esa audiencia no tienen permiso de imagen |
| 4.4 | Cámaras › **Encender** | Si hay niños sin permiso, sólo Presidencia y con justificación escrita |
| 4.5 | Ver › una cámara › **Reproducir** | El sello pasa de *Conectando…* a **En vivo**. En Cámaras sale *En línea* |

## 5. Primera transmisión con enlace (rentas / finales)

1. Ver › **Transmitir** › cámara › *Cualquiera con el enlace* › 1 h › **Transmitir**.
2. El enlace se copia solo. Ábrelo en otro celular **sin sesión**: debe verse.
3. **Detener** › en ese celular se corta en segundos y dice que terminó.
4. Entre 4 y 7 pm (horario de academia de esa cámara) el botón por enlace no deja: es a propósito.

## 6. Dar el botón a otras personas

**Usuarios › persona › Tanner LIVE** (escribir = puede Transmitir y configurar;
leer = sólo ver las cámaras de su rol). Recepción de TCP: crearle usuario con
sólo Tanner LIVE.

## Si algo sale mal

| Pasa | Haz |
|---|---|
| Algo que no debe verse | **Tanner LIVE › Pausar todo**: corta todo al instante |
| *Cámara aún no conectada* | Falta el paso 4.1 o la cámara no tiene ruta |
| Se queda en *Conectando…* | `journalctl -u mediamtx -f` en el VPS; revisar túnel (2.4) y clave del DVR (3.1) |
| *Sin señal* en H.265 | El substream no está en H.264 (paso 0.2) |
| Familias no ven | Revisa audiencia, horario, que esté encendida y que aceptaron las reglas |

Archivos: [`gateway/`](../../gateway/README.md) · [`gateway/servidor/instalar.sh`](../../gateway/servidor/instalar.sh) · [`gateway/camaras.json`](../../gateway/camaras.json)
