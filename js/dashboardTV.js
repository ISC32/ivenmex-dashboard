/* ==========================================
   DASHBOARD TV - Detección automática de pantalla
   ========================================== */
(function () {
  'use strict';

  function detectarTamanoPantalla() {
    const ancho = window.innerWidth;
    const alto = window.innerHeight;
    const areaTotal = ancho * alto;
    const ratio = ancho / alto;

    let tipo = 'desktop';
    if (ancho <= 480) tipo = 'movil';
    else if (ancho <= 768) tipo = 'tablet';
    else if (ancho <= 1399) tipo = 'desktop';
    else if (ancho <= 2199) tipo = 'tv';
    else tipo = 'tv-4k';

    const orientacion = ancho > alto ? 'horizontal' : 'vertical';
    const esTV = Math.abs(ratio - 1.777) < 0.15;
    const esUltraWide = ratio > 2;

    return { ancho, alto, areaTotal, ratio, tipo, orientacion, esTV, esUltraWide, dpi: window.devicePixelRatio || 1 };
  }

  function aplicarClaseTamano(tamano) {
    const body = document.body;
    body.classList.remove('tv-display', 'tv-4k', 'mobile-display', 'tablet-display', 'ultrawide-display');
    body.setAttribute('data-screen', tamano.tipo);
    body.setAttribute('data-orientation', tamano.orientacion);

    if (tamano.tipo === 'tv' || tamano.tipo === 'tv-4k') body.classList.add('tv-display');
    if (tamano.tipo === 'tv-4k') body.classList.add('tv-4k');
    if (tamano.tipo === 'movil') body.classList.add('mobile-display');
    if (tamano.tipo === 'tablet') body.classList.add('tablet-display');
    if (tamano.esUltraWide) body.classList.add('ultrawide-display');

    document.documentElement.style.setProperty('--screen-width', `${tamano.ancho}px`);
    document.documentElement.style.setProperty('--screen-height', `${tamano.alto}px`);
    document.documentElement.style.setProperty('--screen-ratio', tamano.ratio);

    console.log(`📺 Pantalla detectada: ${tamano.tipo} (${tamano.ancho}x${tamano.alto}) - ${tamano.orientacion}`);
  }

  function ajustarGridEmpleados(tamano) {
    const grid = document.getElementById('empleadosAvatarGrid');
    if (!grid) return;

    const anchoPanel = grid.parentElement?.clientWidth || tamano.ancho;
    const cardMin = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--card-min')) || 120;
    const gap = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--grid-gap')) || 14;

    const columnasCalculadas = Math.max(2, Math.floor((anchoPanel + gap) / (cardMin + gap)));
    grid.style.gridTemplateColumns = `repeat(${columnasCalculadas}, minmax(${cardMin}px, 1fr))`;
    console.log(`📊 Grid ajustado a ${columnasCalculadas} columnas`);
  }

  // ==========================================
  // ROTACIÓN AUTOMÁTICA
  // ==========================================
  let rotacionActiva = false;
  let rotacionInterval = null;
  let panelActual = 0;

  function iniciarRotacionAutomatica() {
    const ancho = window.innerWidth;
    if (ancho < 1400) { detenerRotacionAutomatica(); return; }
    if (rotacionActiva) return;
    rotacionActiva = true;

    const paneles = [
      document.querySelector('.empleados-section'),
      document.querySelector('.md-grid'),
      document.querySelector('.urgentes-section'),
      document.querySelector('.charts-section'),
      document.querySelector('.eficiencia-section')
    ].filter(p => p !== null);

    if (paneles.length === 0) return;

    rotacionInterval = setInterval(() => {
      paneles.forEach(p => p.classList.remove('panel-highlight'));
      panelActual = (panelActual + 1) % paneles.length;
      paneles[panelActual]?.classList.add('panel-highlight');
    }, 8000);

    console.log('🔄 Rotación automática iniciada');
  }

  function detenerRotacionAutomatica() {
    if (rotacionInterval) { clearInterval(rotacionInterval); rotacionInterval = null; }
    rotacionActiva = false;
  }

  function observarCambiosTamano() {
    let timeoutId = null;
    window.addEventListener('resize', () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const tamano = detectarTamanoPantalla();
        aplicarClaseTamano(tamano);
        ajustarGridEmpleados(tamano);
        iniciarRotacionAutomatica();
      }, 200);
    });
    window.addEventListener('orientationchange', () => {
      setTimeout(() => {
        const tamano = detectarTamanoPantalla();
        aplicarClaseTamano(tamano);
        ajustarGridEmpleados(tamano);
      }, 300);
    });

    const grid = document.getElementById('empleadosAvatarGrid');
    if (grid && window.ResizeObserver) {
      const observer = new ResizeObserver(() => {
        const tamano = detectarTamanoPantalla();
        ajustarGridEmpleados(tamano);
      });
      observer.observe(grid.parentElement || grid);
    }
  }

  function initTV() {
    document.body.classList.add('tv-display');
    const clock = document.getElementById('fecha-texto');
    if (clock) clock.classList.add('tv-clock');

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/dashboard-tv.css?v=11';
    document.head.appendChild(link);

    const tamano = detectarTamanoPantalla();
    aplicarClaseTamano(tamano);
    ajustarGridEmpleados(tamano);
    iniciarRotacionAutomatica();
    observarCambiosTamano();

    window.TVDisplay = {
      detectar: detectarTamanoPantalla,
      aplicar: aplicarClaseTamano,
      ajustarGrid: ajustarGridEmpleados,
      iniciarRotacion: iniciarRotacionAutomatica,
      detenerRotacion: detenerRotacionAutomatica
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTV, { once: true });
  } else {
    initTV();
  }
}());
