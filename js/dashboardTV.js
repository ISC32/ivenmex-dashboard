/* ==========================================
   DASHBOARD TV - Detección robusta
   v14.0 - Corrige detección errónea
   ========================================== */
(function () {
  'use strict';

  function detectarTamanoPantalla() {
    // Usar documentElement si innerHeight es sospechoso
    const docEl = document.documentElement;
    let ancho = window.innerWidth || docEl.clientWidth || 0;
    let alto = window.innerHeight || docEl.clientHeight || 0;

    // FALLBACK: si alto es absurdo (< 200px), usar screen.height
    if (alto < 200) {
      console.warn(`⚠️ window.innerHeight inválido (${alto}px). Usando screen.height como fallback.`);
      alto = window.screen?.height || 1080;
    }

    // FALLBACK: si ancho es absurdo (< 500px), usar screen.width
    if (ancho < 500) {
      console.warn(`⚠️ window.innerWidth inválido (${ancho}px). Usando screen.width como fallback.`);
      ancho = window.screen?.width || 1920;
    }

    // Corregir por zoom del navegador (ratio entre screen y window)
    const screenW = window.screen?.width || ancho;
    const screenH = window.screen?.height || alto;
    const zoomRatio = screenW / ancho;

    // Si el zoom es significativo (> 1.2x), advertir
    if (zoomRatio > 1.2) {
      console.warn(`⚠️ Zoom detectado: ${(zoomRatio * 100).toFixed(0)}%. El dashboard puede verse mal.`);
    }

    const ratio = ancho / alto;
    const areaTotal = ancho * alto;

    let tipo = 'desktop';
    if (ancho <= 480) tipo = 'movil';
    else if (ancho <= 768) tipo = 'tablet';
    else if (ancho <= 1399) tipo = 'desktop';
    else if (ancho <= 2199) tipo = 'tv';
    else tipo = 'tv-4k';

    const orientacion = ancho > alto ? 'horizontal' : 'vertical';
    const esTV = Math.abs(ratio - 1.777) < 0.15;
    const esUltraWide = ratio > 2.5;

    return {
      ancho, alto, areaTotal, ratio, tipo, orientacion, esTV, esUltraWide,
      dpi: window.devicePixelRatio || 1,
      zoomRatio: zoomRatio,
      screenW, screenH,
      rawInnerHeight: window.innerHeight
    };
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
    if (tamano.rawInnerHeight !== tamano.alto) {
      console.log(`   ⚠️ innerHeight original: ${tamano.rawInnerHeight}px (usando ${tamano.alto}px)`);
    }
    if (tamano.zoomRatio > 1.2) {
      console.log(`   ⚠️ Zoom del navegador: ${(tamano.zoomRatio * 100).toFixed(0)}%`);
    }
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
      document.querySelector('.empleados-tabla-section'),
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
    // El contenido del dashboard está dentro de <main id="dashboard">,
    // así que la marca TV también debe vivir ahí para los selectores de layout.
    var mainEl = document.getElementById('dashboard');
    if (mainEl) mainEl.classList.add('tv-display');
    const clock = document.getElementById('fecha-texto');
    if (clock) clock.classList.add('tv-clock');

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/dashboard-tv.css?v=16';
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
