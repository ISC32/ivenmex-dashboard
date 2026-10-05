/* ==========================================
   DASHBOARD TV - Detección robusta
   v16.0 - Soporte para TV 34x64 cm (25")
   ========================================== */
(function () {
  'use strict';

  // ==========================================
  // DETECCIÓN POR TAMAÑO FÍSICO (cm)
  // ==========================================
  function estimarTamanoFisico(anchoPx, altoPx, dpi) {
    // 1 pulgada = 2.54 cm
    // Asumimos DPI típico de Smart TV: 72-96
    const dpiEfectivo = dpi || 96;
    const anchoPulgadas = anchoPx / dpiEfectivo;
    const altoPulgadas = altoPx / dpiEfectivo;
    const anchoCm = anchoPulgadas * 2.54;
    const altoCm = altoPulgadas * 2.54;
    const diagonalPulgadas = Math.sqrt(anchoPulgadas ** 2 + altoPulgadas ** 2);
    return { anchoCm, altoCm, diagonalPulgadas };
  }

  function detectarTamanoPantalla() {
    const docEl = document.documentElement;
    let ancho = window.innerWidth || docEl.clientWidth || 0;
    let alto = window.innerHeight || docEl.clientHeight || 0;

    // Fallback si innerHeight es absurdo
    if (alto < 200) {
      console.warn(`⚠️ window.innerHeight inválido (${alto}px). Usando screen.height.`);
      alto = window.screen?.height || 768;
    }
    if (ancho < 500) {
      console.warn(`⚠️ window.innerWidth inválido (${ancho}px). Usando screen.width.`);
      ancho = window.screen?.width || 1366;
    }

    const screenW = window.screen?.width || ancho;
    const screenH = window.screen?.height || alto;
    const zoomRatio = screenW / ancho;
    const dpi = window.devicePixelRatio || 1;

    // Estimar tamaño físico
    const fisico = estimarTamanoFisico(ancho, alto, 96);

    const ratio = ancho / alto;
    const areaTotal = ancho * alto;

    // ==========================================
    // CLASIFICACIÓN MEJORADA
    // ==========================================
    let tipo = 'desktop';

    // Móvil
    if (ancho <= 480) {
      tipo = 'movil';
    }
    // Tablet
    else if (ancho <= 768) {
      tipo = 'tablet';
    }
    // TV pequeña (25"-32"): 1024-1599px
    // 1366x768 es el caso típico de Smart TV 25"
    else if (ancho <= 1599) {
      // Si el área es pequeña o la diagonal estimada es < 32", es TV
      if (fisico.diagonalPulgadas < 32 || areaTotal < 1600 * 900) {
        tipo = 'tv';
      } else {
        tipo = 'desktop';
      }
    }
    // TV mediana (32"-43"): 1600-2199px
    else if (ancho <= 2199) {
      tipo = 'tv';
    }
    // TV grande / 4K: >= 2200px
    else {
      tipo = 'tv-4k';
    }

    const orientacion = ancho > alto ? 'horizontal' : 'vertical';
    const esTV = tipo === 'tv' || tipo === 'tv-4k';
    const esUltraWide = ratio > 2.5;

    return {
      ancho, alto, areaTotal, ratio, tipo, orientacion, esTV, esUltraWide,
      dpi, zoomRatio, screenW, screenH,
      rawInnerHeight: window.innerHeight,
      fisico // { anchoCm, altoCm, diagonalPulgadas }
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

    console.log(`📺 Pantalla: ${tamano.tipo} (${tamano.ancho}x${tamano.alto})`);
    console.log(`   📐 Físico estimado: ${tamano.fisico.anchoCm.toFixed(1)}x${tamano.fisico.altoCm.toFixed(1)} cm (~${tamano.fisico.diagonalPulgadas.toFixed(1)}")`);
    console.log(`   🔍 Zoom: ${(tamano.zoomRatio * 100).toFixed(0)}% | DPI: ${tamano.dpi}`);
  }

  function ajustarGridEmpleados(tamano) {
    const grid = document.getElementById('empleadosAvatarGrid');
    if (!grid) return;

    const anchoPanel = grid.parentElement?.clientWidth || tamano.ancho;
    const cardMin = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--card-min')) || 78;
    const gap = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--grid-gap')) || 6;

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
    if (ancho < 1024) { detenerRotacionAutomatica(); return; }
    if (rotacionActiva) return;
    rotacionActiva = true;

    const paneles = [
      document.querySelector('.empleados-section'),
      document.querySelector('.empleados-tabla-section'),
      document.querySelector('.md-grid'),
      document.querySelector('.urgentes-section')
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
