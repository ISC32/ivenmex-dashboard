/* Activacion del modo TV: se activa con ?tv en la URL o pantallas >= 1400px.
   No cambia la logica del dashboard, solo la presentacion. */
(function () {
  'use strict';

  function esModoTV() {
    try {
      var qs = new URLSearchParams(window.location.search);
      if (qs.has('tv')) return true;
      if (localStorage.getItem('ivx-tv-mode') === '1') return true;
    } catch (_) { /* noop */ }
    // En televisores y monitores grandes el dashboard debe verse optimizado por defecto
    return window.matchMedia && window.matchMedia('(min-width: 1400px)').matches;
  }

  function initTV() {
    if (!esModoTV()) return;
    document.body.classList.add('tv-display');
    var clock = document.getElementById('fecha-texto');
    if (clock) clock.classList.add('tv-clock');

    ['css/dashboard-tv.css?v=2', 'css/dashboard-tv-responsive.css?v=1'].forEach(function (href) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    });

    reorganizarParaTV();
    iniciarReloj();
  }

  /* Agrupa "Equipo de trabajo" y los graficos en una sola fila para aprovechar
     el formato 16:9 del televisor y reducir el scroll vertical. */
  function reorganizarParaTV() {
    var empleados = document.querySelector('.empleados-section');
    var charts = document.querySelector('.charts-section');
    if (!empleados || !charts || empleados.parentElement.querySelector('.tv-row')) return;
    var row = document.createElement('div');
    row.className = 'tv-row d-flex gap-4 flex-wrap';
    empleados.parentElement.insertBefore(row, empleados);
    row.appendChild(empleados);
    row.appendChild(charts);
  }

  /* Reloj visible en la barra superior, util para modo pantalla siempre encendida. */
  function iniciarReloj() {
    var clock = document.getElementById('fecha-texto');
    if (!clock) return;
    function tick() {
      var ahora = new Date();
      clock.textContent = ahora.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) +
        ' · ' + ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    }
    tick();
    setInterval(tick, 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initTV, { once: true });
  else initTV();
}());
