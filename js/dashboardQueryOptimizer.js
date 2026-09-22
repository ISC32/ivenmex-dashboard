/**
 * Optimización de carga para el dashboard INVEMEX.
 *
 * Este módulo centraliza lecturas frecuentes, evita peticiones repetidas y
 * agrupa los refrescos disparados por Realtime. Cárguelo después de
 * dashboardInvemex.js en index.html:
 *   <script src="js/dashboardQueryOptimizer.js?v=1" defer></script>
 */
(function () {
    'use strict';

    const App = window.App;
    const supabaseClient = window.supabaseClient;
    if (!App || !supabaseClient) {
        console.warn('[INVEMEX] Query optimizer: App/Supabase no disponible');
        return;
    }

    const original = {
        cargarDatos: App.cargarDatos.bind(App),
        cargarEstadosGrafico: App.cargarEstadosGrafico.bind(App),
        cargarCargaTrabajo: App.cargarCargaTrabajo.bind(App),
        cargarEficiencia: App.cargarEficiencia.bind(App),
        cargarClientes: App.cargarClientes.bind(App),
        cargarProductos: App.cargarProductos.bind(App)
    };

    const cache = new Map();
    const inflight = new Map();
    const TTL = 45_000;
    let refreshTimer = null;
    let refreshInProgress = false;

    async function cached(key, loader, ttl = TTL) {
        const now = Date.now();
        const current = cache.get(key);
        if (current && now - current.time < ttl) return current.value;
        if (inflight.has(key)) return inflight.get(key);
        const request = Promise.resolve().then(loader).then(value => {
            cache.set(key, { value, time: Date.now() });
            return value;
        }).finally(() => inflight.delete(key));
        inflight.set(key, request);
        return request;
    }

    function invalidate(...keys) {
        keys.forEach(key => cache.delete(key));
    }

    // El Realtime puede emitir varios eventos seguidos. Un solo refresco por
    // ventana reduce picos de API/BD y evita renders concurrentes.
    App.refrescarDatosSilencioso = function () {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(async () => {
            if (refreshInProgress) return;
            refreshInProgress = true;
            try {
                invalidate('clientes', 'productos');
                await original.cargarDatos();
            } finally {
                refreshInProgress = false;
            }
        }, 600);
    };

    // Los seis conteos de estados se ejecutaban secuencialmente. Ejecutarlos
    // en paralelo mantiene la misma UI y reduce el tiempo total de espera.
    App.cargarEstadosGrafico = async function () {
        const estados = ['cotizando', 'diseño', 'en_produccion', 'control_calidad', 'listo', 'entregado'];
        const labels = ['Cotizando', 'Diseño', 'Producción', 'Control Calidad', 'Listo', 'Entregado'];
        const colores = ['#0B218B', '#1A3BA8', '#FFF200', '#E84C3D', '#27AE60', '#8B6914'];
        try {
            const counts = await Promise.all(estados.map(estado =>
                cached(`estado:${estado}`, async () => {
                    const { count, error } = await supabaseClient.from('pedidos')
                        .select('id', { count: 'exact', head: true }).eq('estado', estado);
                    if (error) throw error;
                    return count || 0;
                })
            ));
            const resultados = counts.map((value, i) => ({ label: labels[i], value, color: colores[i] }));
            const total = counts.reduce((sum, value) => sum + value, 0);
            const chart = document.getElementById('doughnut-chart');
            if (chart) {
                chart.dataset.total = total;
                let start = 0;
                chart.style.background = total ? `conic-gradient(${resultados.map(item => {
                    const end = start + item.value / total * 100;
                    const part = `${item.color} ${start}% ${end}%`;
                    start = end;
                    return part;
                }).join(', ')})` : 'conic-gradient(#EEEEEE 0% 100%)';
            }
            const legend = document.getElementById('doughnut-legend');
            if (legend) legend.innerHTML = resultados.map(item =>
                `<div class="legend-item"><span class="color-box" style="background:${item.color};"></span>${item.label}: ${item.value}</div>`
            ).join('');
        } catch (error) { console.error('Error cargando estados optimizado:', error); }
    };

    App.cargarCargaTrabajo = async function () {
        const areas = [
            { nombre: 'diseño', label: 'Diseño', icon: 'fa-paint-brush', clase: 'design' },
            { nombre: 'corte', label: 'Corte', icon: 'fa-cut', clase: 'corte' },
            { nombre: 'sublimacion', label: 'Sublimación', icon: 'fa-hotjar', clase: 'sublimacion' }
        ];
        try {
            const resultados = await Promise.all(areas.map(async area => {
                const { count, error } = await supabaseClient.from('tareas')
                    .select('id', { count: 'exact', head: true })
                    .eq('tipo_tarea', area.nombre).in('estado', ['pendiente', 'en_progreso']);
                if (error) throw error;
                return { ...area, tareas: count || 0 };
            }));
            const max = Math.max(1, ...resultados.map(item => item.tareas));
            resultados.push({ label: 'Administración', icon: 'fa-user-tie', clase: 'admin', tareas: 0 });
            const chart = document.getElementById('bar-chart');
            if (chart) chart.innerHTML = resultados.map(item =>
                `<div class="bar-item"><span class="bar-label"><i class="fas ${item.icon}"></i> ${item.label}</span><div class="bar-track"><div class="bar-fill ${item.clase}" style="width:${item.tareas / max * 100}%">${item.tareas} tareas</div></div></div>`
            ).join('');
        } catch (error) { console.error('Error cargando carga de trabajo optimizada:', error); }
    };

    // Evita el patrón N+1 de cargarEficiencia: empleados + una sola consulta
    // de tareas, agrupada en memoria.
    App.cargarEficiencia = async function () {
        try {
            const [{ data: empleados, error: e1 }, { data: tareas, error: e2 }] = await Promise.all([
                supabaseClient.from('empleados').select('id, nombre, apellido, cargo').eq('activo', true),
                supabaseClient.from('tareas').select('id, empleado_id, estado, completada')
            ]);
            if (e1) throw e1;
            if (e2) throw e2;
            const porEmpleado = new Map();
            (tareas || []).forEach(tarea => {
                const lista = porEmpleado.get(tarea.empleado_id) || [];
                lista.push(tarea);
                porEmpleado.set(tarea.empleado_id, lista);
            });
            // Reutiliza el render existente sin volver a consultar la BD.
            const html = (empleados || []).map(empleado => {
                const lista = porEmpleado.get(empleado.id) || [];
                const total = lista.length;
                const completadas = lista.filter(t => t.estado === 'completado' || t.completada === true).length;
                const pendientes = total - completadas;
                const tasa = total ? Math.round(completadas / total * 100) : 0;
                return `<tr><td><strong>${empleado.nombre} ${empleado.apellido || ''}</strong></td><td>${empleado.cargo || 'Sin cargo'}</td><td><span class="md-badge success">${completadas}</span></td><td><span class="md-badge warning">${pendientes}</span></td><td>0</td><td>${tasa}%</td><td>-</td><td>-</td><td>${tasa >= 70 ? 'Buen rendimiento' : 'Sin datos'}</td></tr>`;
            }).join('');
            const tbody = document.getElementById('tbody-eficiencia');
            if (tbody) tbody.innerHTML = html || '<tr><td colspan="9">No hay empleados registrados</td></tr>';
        } catch (error) { console.error('Error cargando eficiencia optimizada:', error); }
    };

    // Listas usadas por formularios: conservarlas en memoria durante el TTL.
    App.cargarClientes = function () { return cached('clientes', original.cargarClientes); };
    App.cargarProductos = function () { return cached('productos', original.cargarProductos); };
    App.invalidateQueryCache = () => invalidate('clientes', 'productos', 'estado:cotizando', 'estado:diseño', 'estado:en_produccion', 'estado:control_calidad', 'estado:listo', 'estado:entregado');
})();
