/* Si la calculadora no arranca en 8 segundos (red lenta, módulo que no cargó),
   se dice con palabras y con el WhatsApp del club, no con una pantalla vacía.
   Es un script clásico a propósito: corre aunque falle el módulo. */
setTimeout(function () {
  var c = document.getElementById('contenido');
  if (c && c.classList.contains('hidden')) {
    document.getElementById('cargando').classList.add('hidden');
    document.getElementById('falla').classList.remove('hidden');
  }
}, 8000);
