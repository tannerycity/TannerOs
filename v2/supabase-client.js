// El único lugar del sistema que nombra al CDN y a la versión del cliente.
//
// Antes los 30 archivos que hablan con Supabase importaban
// `https://esm.sh/@supabase/supabase-js@2` cada uno por su cuenta. Ese `@2` es
// flotante: resuelve a la última 2.x que exista **en el momento en que un
// navegador la pide**. O sea, el club podía amanecer con una versión del
// cliente que nadie eligió ni probó, sin que se hubiera desplegado nada. Y con
// una 3.0 ya en camino, el riesgo sólo crece.
//
// Fijarla aquí, en un solo archivo, hace dos cosas: congela lo que corre hoy, y
// deja un único renglón que cambiar el día que haya que subir de versión o
// salirse de esm.sh. `qa-static.mjs` impide que alguien vuelva a importar el
// CDN por su cuenta.
//
// 2.116.0 es exactamente lo que `@2` resolvía el 20 de septiembre de 2026
// (`latest` de npm para la rama 2.x), así que fijarla NO cambia nada hoy: sólo
// evita que cambie sola mañana.
export { createClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0';
