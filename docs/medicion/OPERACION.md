# Operación: lo que requiere a una persona

## 1. Desbloquear los despliegues de TCP (P0)

**Causa comprobada:** Vercel bloquea cada commit de `main` de `tcp-app` cuyo autor es
`technologiesskyrock-lgtm`, porque esa cuenta de GitHub no tiene acceso al proyecto en el
equipo TanneryCity. Producción sigue sirviendo el último deploy bueno, anterior a #16.

Opciones, de menor a mayor costo:

| Opción | Quién | Costo | Efecto |
|---|---|---|---|
| A. Redeploy manual del último commit (`c273efb`) desde el dashboard de Vercel | Dueño del equipo TanneryCity | $0 | Publica lo actual. El siguiente merge de Skyrock vuelve a bloquearse. |
| B. Invitar a Skyrock como miembro del equipo, con acceso a `tcp-app` (liga de invitación en el estado del commit) | Dueño | Puede costar un asiento en el plan Pro | Arreglo permanente. **Requiere tu autorización por ser facturación.** |
| C. Que las fusiones a `main` las haga una cuenta de GitHub que ya sea miembro del equipo de Vercel | Skyrock / dueño | $0 | Arreglo permanente sin asientos nuevos. |

Recomendación: A hoy mismo y C como regla. B sólo si Skyrock necesita entrar a Vercel.

Después: smoke de https://tcp.tannerycity.com (portada, `/torneo`, `/app`).

## 2. www.tannerycity.com (GoDaddy)

- No hay repositorio: se edita en el panel de GoDaddy Website Builder.
- Revisar en el código del sitio (Configuración → Encabezado / HTML personalizado) si ya está `GTM-5H8QT73B` y si además está la integración nativa de Google Analytics o de Facebook Pixel de GoDaddy. Si están las dos, quitar la nativa.
- Pasos de instalación: INSTALACION-WWW-GTM.md.

## 3. Search Console

- Enviar `https://app.tannerycity.com/sitemap.xml` (publicado y válido; `qa-seo-tanneros`).
- TCP: enviar `https://tcp.tannerycity.com/sitemap.xml` sólo cuando #12 esté publicado.

## 4. Encender el GA4 del staff

1. El abogado aprueba la sección del uso por el personal (PRIVACIDAD.md).
2. Se publica el aviso v3 en TannerOS.
3. `GA4_STAFF_HABILITADO = true` en `v2/analitica-uso.js` y se actualiza la prueba de `qa-analitica-uso`.

## 5. Windsor

- Plan TRIAL: decidir plan antes de usarlo como fuente del tablero.
- La llave de API va como secreto de servidor (Supabase), nunca en el navegador ni en el repo.

## 6. Acceso para el tablero de TCP

La base de TCP es otro proyecto de Supabase, que esta sesión no ve. Para ocupación,
reservas e ingresos hace falta conectar ese proyecto a la sesión (sólo lectura) o
exponer desde TCP una vista agregada.
