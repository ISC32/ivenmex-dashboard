/* Activacion ligera del modo TV: no cambia la logica del dashboard. */
(function () {
  'use strict';
  function initTV() {
    document.body.classList.add('tv-display');
    var clock = document.getElementById('fecha-texto');
    if (clock) clock.classList.add('tv-clock');
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/dashboard-tv.css?v=1';
    document.head.appendChild(link);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initTV, { once: true });
  else initTV();
}());
