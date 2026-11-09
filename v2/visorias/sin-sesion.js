/* "Visorías" con s también lleva a la visoría pública (08/11/2026).
   Presidencia: "que los dos términos te redirijan a la página de visoría, por
   si se llegan a equivocar". /visorias es el módulo del staff: quien no tiene
   sesión abierta (un papá que escribió "visorias") se va a /visoria/; el
   staff con sesión se queda en su módulo. Va antes que todo y sin módulos
   para que el papá no vea ni un parpadeo. */
(function () {
  try {
    var conSesion = Object.keys(localStorage).some(function (k) { return /^sb-.+-auth-token$/.test(k); });
    if (!conSesion) location.replace('/visoria/' + location.search + location.hash);
  } catch (e) { /* sin localStorage: se queda y el módulo pide entrar */ }
})();
