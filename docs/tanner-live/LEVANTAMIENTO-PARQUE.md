# Levantamiento en Tannery City Park

Hoja para llevar al parque. Lo que se anote aquí se registra después en
**Tanner LIVE › Cámaras** y **Diagnóstico**. Las contraseñas **no** se anotan en
TannerOS ni en esta hoja: se guardan en el gestor de contraseñas del club y,
en la fase 4, sólo en el servidor del gateway.

## Antes de ir

- [ ] Autorización por escrito de Presidencia para revisar el grabador.
- [ ] Quién instaló el CCTV y su contacto (puede tener la contraseña de admin).
- [ ] Laptop con **VLC** instalado y la app del fabricante (DMSS) en el celular, sólo para consultar datos.
- [ ] Cable Ethernet (por si el Wi-Fi de invitados está aislado de las cámaras).

## 1. El grabador

| Dato | Dónde se ve | Anotar |
|---|---|---|
| Marca y **modelo exacto** | Etiqueta debajo/atrás del equipo; menú *Sistema › Información* | |
| Tipo | NVR (sólo cámaras IP), XVR/DVR (cámaras analógicas/HDCVI) | |
| Número de serie | Etiqueta o *Información de versión* | |
| Firmware | *Información de versión* | |
| Número de canales | Etiqueta (4/8/16/32) | |
| ¿Cuántas cámaras conectadas y en qué canal? | Vista en vivo del grabador | |
| Ubicación física y si tiene UPS | | |

## 2. La red

| Dato | Dónde | Anotar |
|---|---|---|
| IP local del grabador | Menú *Red › TCP/IP*, o la lista de clientes del router | |
| Máscara y puerta de enlace | *Red › TCP/IP* | |
| ¿IP fija o DHCP? (debe ser fija o reservada en el router) | | |
| Puerto RTSP (por defecto 554) | *Red › Puertos* / *Conexión* | |
| Puerto HTTP/HTTPS del equipo | *Red › Puertos* | |
| ¿P2P / nube Dahua activado? | *Red › P2P* | |
| ¿Hay puertos abiertos a internet en el router hacia el grabador? (deben cerrarse) | Router › reenvío de puertos | |
| Proveedor de internet y **velocidad de SUBIDA** (speedtest en sitio, cable) | | |
| Modelo del router y quién tiene su acceso | | |
| ¿Red de cámaras separada del Wi-Fi de invitados? | | |
| ¿Hay una computadora o mini PC que pueda quedarse prendida en el parque? | | |

## 3. Cada cámara candidata

| Canal | Ubicación / cancha | ¿Muestra menores? | ¿Zona sensible (vestidor, baño, oficina)? | Códec principal | Códec substream | Resolución substream | FPS | ¿Tiene micrófono? |
|---|---|---|---|---|---|---|---|---|
| | | | | | | | | |
| | | | | | | | | |

Códec y resolución se ven en *Cámara › Codificación / Encode*. Para Tanner LIVE
el **substream debe ir en H.264** (no H.265 ni "H.264+ / Smart Codec"),
≈ 704×480 o 640×360, 15 fps, sin audio, con I-frame cada 1–2 s.

## 4. Prueba con VLC (dentro de la red del parque)

1. Conecta la laptop a la misma red que el grabador.
2. VLC › *Medio › Abrir ubicación de red* y escribe (sustituye la IP y el canal):

   ```
   rtsp://192.168.1.108:554/cam/realmonitor?channel=1&subtype=1
   ```

   `subtype=1` es el substream y `subtype=0` el principal (formato que
   documenta Dahua). Si VLC pide usuario y contraseña, usa el **usuario de sólo
   visualización** (ver punto 5). No escribas la contraseña dentro de la URL ni
   la guardes en el historial.
3. Si ves la cancha: en VLC › *Herramientas › Información del códec* anota
   códec, resolución y fps.
4. Registra el resultado en **Tanner LIVE › Diagnóstico › Registrar prueba
   manual** (sí/no, herramienta, códec, resolución). Queda como prueba hecha por
   una persona.

Si no abre: revisa que RTSP esté habilitado, el puerto, el canal y que la
laptop esté en la red correcta. No intentes "escanear" la red.

## 5. Usuario de sólo visualización

En el grabador (*Cuenta / Usuarios*), con autorización de Presidencia:

- [ ] Crear un usuario `tannerlive` con permiso **sólo de vista en vivo** de los
      canales autorizados (sin reproducción, sin configuración, sin PTZ).
- [ ] Contraseña larga y única, guardada en el gestor de contraseñas del club.
- [ ] Confirmar que la cuenta `admin` tiene contraseña fuerte y no es la de fábrica.

## 6. Decisiones que tiene que tomar el club

- [ ] Qué cámaras se transmiten y para qué categorías.
- [ ] Horarios de entrenamiento por cámara.
- [ ] Texto del aviso/consentimiento para familias (privacidad e imagen de menores) — revisar con el abogado del club.
- [ ] Quién administra Tanner LIVE además de Presidencia.
- [ ] Dónde vivirá el gateway: mini PC en el parque o servidor en la nube con túnel.
