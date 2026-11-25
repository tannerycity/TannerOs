#!/usr/bin/env bash
# Tanner LIVE · instala el servidor de video en un Ubuntu 24.04 limpio.
#
#   sudo bash instalar.sh            (desde la carpeta gateway/servidor del repo)
#
# Instala MediaMTX v1.21.4 (verificando su sha256), Node, Caddy (TLS
# automático) y Tailscale; crea el usuario de servicio, los servicios systemd
# y el firewall. NO escribe secretos: al final te dice qué llenar.
# Se puede correr dos veces sin romper nada.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Córrelo con sudo"; exit 1; }
AQUI="$(cd "$(dirname "$0")" && pwd)"
GATEWAY="$(cd "$AQUI/.." && pwd)"
VERSION=v1.21.4
SHA256=be0c05d9c8af8338116977e7f1c3fcb409fbf882075e5ab075cf8baad76a59d2

echo "== Paquetes"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https ufw nodejs

echo "== Usuario de servicio"
id tannerlive >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin tannerlive
install -d -o root -g root -m 755 /opt/tannerlive
install -d -o root -g tannerlive -m 750 /etc/tannerlive

echo "== MediaMTX $VERSION"
if [ ! -x /opt/tannerlive/mediamtx ] || ! /opt/tannerlive/mediamtx --version 2>&1 | grep -q "$VERSION"; then
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/m.tgz" "https://github.com/bluenviron/mediamtx/releases/download/$VERSION/mediamtx_${VERSION}_linux_amd64.tar.gz"
  echo "$SHA256  $tmp/m.tgz" | sha256sum -c -
  tar -xzf "$tmp/m.tgz" -C "$tmp" mediamtx
  install -m 755 "$tmp/mediamtx" /opt/tannerlive/mediamtx
  rm -rf "$tmp"
fi
install -m 644 "$GATEWAY/puente.mjs" /opt/tannerlive/puente.mjs
install -o root -g tannerlive -m 640 "$GATEWAY/mediamtx.yml" /etc/tannerlive/mediamtx.yml
[ -f /etc/tannerlive/camaras.json ] || install -o root -g tannerlive -m 640 "$GATEWAY/camaras.json" /etc/tannerlive/camaras.json
[ -f /etc/tannerlive/puente.env ] || install -o root -g tannerlive -m 640 "$AQUI/puente.env.ejemplo" /etc/tannerlive/puente.env

echo "== Caddy (TLS automático)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq && apt-get install -y -qq caddy
fi
install -m 644 "$AQUI/Caddyfile" /etc/caddy/Caddyfile

echo "== Tailscale (túnel hacia el parque, sin abrir puertos del router)"
command -v tailscale >/dev/null || curl -fsSL https://tailscale.com/install.sh | sh

echo "== Servicios"
install -m 644 "$AQUI/mediamtx.service" /etc/systemd/system/mediamtx.service
install -m 644 "$AQUI/tannerlive-puente.service" /etc/systemd/system/tannerlive-puente.service
systemctl daemon-reload
systemctl enable mediamtx tannerlive-puente caddy >/dev/null

echo "== Firewall: sólo SSH, 443 y 8189 (WebRTC)"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null     # Caddy lo usa para sacar el certificado
ufw allow 443/tcp >/dev/null
ufw allow 8189/udp >/dev/null
ufw allow 8189/tcp >/dev/null
ufw --force enable >/dev/null

cat <<'FIN'

Listo. Falta (en este orden):
  1. sudo tailscale up --accept-routes          (y aprobar en el panel de Tailscale)
  2. sudo nano /etc/tannerlive/puente.env        (SUPABASE_SERVICE_ROLE_KEY y DVR_CLAVE)
  3. sudo chmod 640 /etc/tannerlive/puente.env
  4. sudo systemctl restart mediamtx tannerlive-puente caddy
  5. journalctl -u tannerlive-puente -f          (debe decir "puente escuchando")
Guía completa: docs/tanner-live/LANZAMIENTO.md
FIN
