// ==========================================
// DASHBOARD INVEMEX - OPTIMIZADO v7.0
// ==========================================

const CONFIG = {
    SUPABASE_URL: 'https://ubyesdxizxywfwysechk.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_ocKHSbzB3BuoZRWu4GvCFQ_fonZWWgQ',
    REFRESH_INTERVAL: 45000,
    TOAST_DURATION: 4000,
    MAX_RETRIES: 3,
    RETRY_DELAY: 2000
};

console.log('🚀 Iniciando Dashboard INVEMEX v7.0');

const supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
window.supabaseClient = supabaseClient;

const STATE = {
    clientes: [], productos: [], pedidos: [], urgentes: [],
    empleados: [], tareas: [], eficiencia: [], loading: false,
    refreshInterval: null, realtimeChannel: null, ultimaActualizacion: null
};

const Cache = {
    data: new Map(),
    TTL: 30000,
    get(key) {
        const item = this.data.get(key);
        if (!item) return null;
        if (Date.now() - item.time > this.TTL) { this.data.delete(key); return null; }
        return item.value;
    },
    set(key, value) { this.data.set(key, { value, time: Date.now() }); },
    invalidate(...keys) { keys.forEach(k => this.data.delete(k)); },
    clear() { this.data.clear(); }
};

const ToastSystem = {
    container: null,
    init() {
        this.container = document.getElementById('toast-container');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.className = 'md-toast-container';
            document.body.appendChild(this.container);
        }
    },
    show(title, message, type = 'success') {
        if (!this.container) this.init();
        const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
        const toast = document.createElement('div');
        toast.className = `md-toast ${type}`;
        toast.innerHTML = `
            <div class="toast-icon"><i class="fas ${icons[type] || icons.success}"></i></div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
        `;
        this.container.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(40px) scale(0.95)';
            setTimeout(() => toast.remove(), 400);
        }, CONFIG.TOAST_DURATION);
    },
    success(title, message) { this.show(title, message, 'success'); },
    error(title, message) { this.show(title, message, 'error'); },
    warning(title, message) { this.show(title, message, 'warning'); },
    info(title, message) { this.show(title, message, 'info'); }
};

const DateFormatter = {
    getToday() { return new Date().toISOString().split('T')[0]; },
    formatHora() { return new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
};

const StateMappers = {
    estadoClass: {
        urgente: 'danger', 'producción': 'warning', 'en diseño': 'primary',
        completado: 'success', en_produccion: 'warning', diseño: 'primary',
        control_calidad: 'default', cotizando: 'default', listo: 'success',
        entregado: 'success', cancelado: 'default'
    },
    estadoLabel: {
        cotizando: 'Cotizando', diseño: 'En Diseño', en_produccion: 'Producción',
        control_calidad: 'Control Calidad', listo: 'Listo', entregado: 'Entregado', cancelado: 'Cancelado'
    },
    getEstadoClass(estado) { return this.estadoClass[estado] || 'default'; },
    getEstadoLabel(estado) { return this.estadoLabel[estado] || estado; }
};

const ErrorHandler = {
    show(message) {
        const cont = document.getElementById('error-container');
        if (!cont) return;
        cont.innerHTML = `
            <div style="background:#FEF2F2; border:1px solid #FECACA; border-radius:12px; padding:20px; max-width:500px; text-align:left; margin-top:20px;">
                <strong style="color:#991B1B; display:block; margin-bottom:8px;"><i class="fas fa-exclamation-circle"></i> Error de Conexión</strong>
                <pre style="background:white; padding:12px; border-radius:8px; font-size:13px; max-height:150px; overflow:auto;">${message}</pre>
                <button class="md-btn md-btn-primary mt-3" onclick="App.reintentar()"><i class="fas fa-redo"></i> Reintentar</button>
            </div>
        `;
    },
    clear() { const cont = document.getElementById('error-container'); if (cont) cont.innerHTML = ''; }
};

const LoadingSystem = {
    show(text = 'Cargando...') {
        const el = document.getElementById('loading-text');
        if (el) el.textContent = text;
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = 'flex';
        const newLoader = document.getElementById('ivx-loader');
        if (newLoader) { newLoader.style.display = 'flex'; newLoader.style.opacity = '1'; newLoader.style.pointerEvents = 'auto'; }
    },
    hide() {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = 'none';
        const dashboard = document.getElementById('dashboard');
        if (dashboard) dashboard.style.display = 'block';
        const newLoader = document.getElementById('ivx-loader');
        if (newLoader) {
            newLoader.style.opacity = '0';
            newLoader.style.pointerEvents = 'none';
            setTimeout(() => { newLoader.style.display = 'none'; }, 500);
        }
    },
    setText(text) { const el = document.getElementById('loading-text'); if (el) el.textContent = text; }
};

async function withRetry(fn, retries = CONFIG.MAX_RETRIES) {
    for (let i = 0; i < retries; i++) {
        try { return await fn(); }
        catch (err) { if (i === retries - 1) throw err; await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY * (i + 1))); }
    }
}

const App = {
    async init() {
        console.log('📋 Inicializando aplicación v7.0...');
        this.updateDateDisplay(new Date());
        ToastSystem.init();
        await this.cargarTodosLosDatos();
        this.suscribirRealtime();
        STATE.refreshInterval = setInterval(() => this.refrescarDatosSilencioso(), CONFIG.REFRESH_INTERVAL);
        console.log('✅ Aplicación inicializada correctamente');
    },

    updateDateDisplay(date) {
        const el = document.getElementById('fecha-texto');
        if (el) el.textContent = date.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    },

    async cargarTodosLosDatos() {
        try {
            LoadingSystem.show('Cargando datos del dashboard...');
            await this.cargarDatos();
            LoadingSystem.hide();
            this.actualizarHoraActualizacion();
            ToastSystem.success('✅ Listo', 'Dashboard actualizado correctamente');
        } catch (error) {
            console.error('❌ Error en carga inicial:', error);
            ErrorHandler.show(error.message || 'Error al conectar con la base de datos.');
            LoadingSystem.setText('⚠️ Error al cargar datos.');
            setTimeout(() => LoadingSystem.hide(), 1500);
        }
    },

    async cargarDatos() {
        console.log('📊 Cargando datos desde Supabase...');
        try {
            await Promise.all([
                this.cargarKPI(),
                this.cargarEstadosGrafico(),
                this.cargarCargaTrabajo(),
                this.cargarPedidosUrgentes(),
                this.cargarEficienciaOptimizada(),
                this.cargarEmpleadosYTareas()
            ]);
            console.log('✅ Todos los datos cargados correctamente');
            STATE.ultimaActualizacion = new Date();
            this.actualizarHoraActualizacion();
        } catch (error) {
            console.error('❌ Error en cargarDatos:', error);
            throw error;
        }
    },

    actualizarHoraActualizacion() {
        const el = document.getElementById('ultima-actualizacion-texto');
        if (el) el.textContent = `Última actualización: ${DateFormatter.formatHora()}`;
    },

    async refrescarDatos() {
        ToastSystem.info('🔄 Actualizando', 'Refrescando datos del dashboard...');
        try {
            Cache.clear();
            await this.cargarDatos();
            ToastSystem.success('✅ Actualizado', 'Datos del dashboard actualizados correctamente');
        } catch (error) {
            console.error('❌ Error al refrescar:', error);
            ToastSystem.error('❌ Error', 'No se pudieron actualizar los datos');
        }
    },

    async refrescarDatosSilencioso() {
        try {
            await this.cargarDatos();
            console.log('🔄 Datos actualizados automáticamente');
        } catch (error) {
            console.error('❌ Error en actualización automática:', error);
        }
    },

    async cargarKPI() {
        const hoy = DateFormatter.getToday();
        try {
            const { data, error } = await withRetry(() => supabaseClient.from('pedidos').select('estado, prioridad, fecha_solicitud'));
            if (error) throw error;

            let activos = 0, produccion = 0, entregados = 0, urgentes = 0;
            (data || []).forEach(p => {
                const esActivo = p.estado !== 'entregado' && p.estado !== 'cancelado';
                if (esActivo) activos++;
                if (p.estado === 'en_produccion') produccion++;
                if (p.estado === 'entregado' && p.fecha_solicitud && p.fecha_solicitud.startsWith(hoy)) entregados++;
                if (p.prioridad === 'urgente' && esActivo) urgentes++;
            });

            const elements = {
                'kpi-activos': activos, 'kpi-activos-change': `${activos} activos`,
                'kpi-produccion': produccion, 'kpi-produccion-change': `${produccion} en producción`,
                'kpi-entregados': entregados, 'kpi-entregados-change': `${entregados} hoy`,
                'kpi-urgentes': urgentes, 'kpi-urgentes-change': `${urgentes} urgentes`
            };
            Object.entries(elements).forEach(([id, value]) => {
                const el = document.getElementById(id);
                if (el) el.textContent = value;
            });
            const badge = document.getElementById('urgentes-count-badge');
            if (badge) badge.textContent = urgentes;
        } catch (error) { console.error('Error cargando KPI:', error); }
    },

    async cargarEstadosGrafico() {
        const colores = { cotizando: '#0B218B', diseño: '#1A3BA8', en_produccion: '#FFF200', control_calidad: '#E84C3D', listo: '#27AE60', entregado: '#8B6914' };
        const labels = { cotizando: 'Cotizando', diseño: 'Diseño', en_produccion: 'Producción', control_calidad: 'Control Calidad', listo: 'Listo', entregado: 'Entregado' };
        try {
            const { data, error } = await withRetry(() => supabaseClient.from('pedidos').select('estado'));
            if (error) throw error;
            const conteo = {};
            (data || []).forEach(p => { conteo[p.estado] = (conteo[p.estado] || 0) + 1; });
            const resultados = Object.keys(labels).map(k => ({ label: labels[k], value: conteo[k] || 0, color: colores[k] }));
            const total = resultados.reduce((sum, r) => sum + r.value, 0);
            const chart = document.getElementById('doughnut-chart');
            if (chart) {
                chart.setAttribute('data-total', total);
                chart.style.background = total > 0 ? (() => {
                    let grad = 'conic-gradient(';
                    let acumulado = 0;
                    resultados.forEach((item, index) => {
                        const porcentaje = (item.value / total) * 100;
                        grad += `${item.color} ${acumulado}% ${acumulado + porcentaje}%${index < resultados.length - 1 ? ', ' : ''}`;
                        acumulado += porcentaje;
                    });
                    return grad + ')';
                })() : 'conic-gradient(#EEEEEE 0% 100%)';
            }
            const legend = document.getElementById('doughnut-legend');
            if (legend) {
                legend.innerHTML = resultados.map(item => `
                    <div class="legend-item">
                        <span class="color-box" style="background:${item.color};"></span>
                        ${item.label}: ${item.value}
                    </div>
                `).join('');
            }
        } catch (error) { console.error('Error cargando estados:', error); }
    },

    async cargarCargaTrabajo() {
        const areas = [
            { nombre: 'diseño', label: 'Diseño', icon: 'fa-paint-brush', clase: 'design' },
            { nombre: 'corte', label: 'Corte', icon: 'fa-cut', clase: 'corte' },
            { nombre: 'sublimacion', label: 'Sublimación', icon: 'fa-hotjar', clase: 'sublimacion' }
        ];
        const gradientesMap = {
            design: 'linear-gradient(90deg, #0B218B, #1A3BA8)',
            corte: 'linear-gradient(90deg, #FFF200, #F5E600)',
            sublimacion: 'linear-gradient(90deg, #6C3483, #8E44AD)',
            admin: 'linear-gradient(90deg, #D81B60, #E74C8B)'
        };
        const coloresMap = { design: '#0B218B', corte: '#FFF200', sublimacion: '#8E44AD', admin: '#E74C8B' };
        try {
            const { data, error } = await withRetry(() => supabaseClient.from('tareas').select('tipo_tarea, estado'));
            if (error) throw error;
            const conteo = {};
            (data || []).forEach(t => {
                if (t.estado === 'pendiente' || t.estado === 'en_progreso') {
                    conteo[t.tipo_tarea] = (conteo[t.tipo_tarea] || 0) + 1;
                }
            });
            const resultados = areas.map(a => ({ ...a, tareas: conteo[a.nombre] || 0 }));
            resultados.push({ label: 'Administración', icon: 'fa-user-tie', clase: 'admin', tareas: 0 });
            const maxTareas = Math.max(1, ...resultados.map(r => r.tareas));
            resultados.forEach(item => { item.porcentaje = (item.tareas / maxTareas) * 100; });
            const barChart = document.getElementById('bar-chart');
            if (barChart) {
                barChart.innerHTML = resultados.map(item => {
                    const gradiente = gradientesMap[item.clase] || 'linear-gradient(90deg, #0B218B, #1A3BA8)';
                    const textColor = item.clase === 'corte' ? '#1A1A1A' : 'white';
                    return `
                        <div class="bar-item">
                            <span class="bar-label"><i class="fas ${item.icon}" style="color:${coloresMap[item.clase]};"></i> ${item.label}</span>
                            <div class="bar-track">
                                <div class="bar-fill ${item.clase}" style="width:${item.porcentaje}%; background:${gradiente}; color:${textColor};">
                                    ${item.tareas} tareas
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        } catch (error) { console.error('Error cargando carga de trabajo:', error); }
    },

    async cargarPedidosUrgentes() {
        try {
            const { data, error } = await withRetry(() =>
                supabaseClient.from('pedidos')
                    .select(`id, cliente_id, estado, prioridad, observaciones, fecha_solicitud, fecha_entrega_prometida, clientes (nombre), detalles_pedido (material_especifico, productos (nombre)), tareas (fecha_fin, empleados (nombre, apellido))`)
                    .eq('prioridad', 'urgente')
                    .not('estado', 'in', '(entregado,cancelado)')
                    .order('fecha_solicitud', { ascending: false })
                    .limit(10)
            );
            if (error) throw error;
            const tbody = document.getElementById('tabla-urgentes-body');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="10"><div class="md-empty"><div class="empty-icon"><i class="fas fa-inbox"></i></div><div class="empty-title">No hay pedidos urgentes</div></div></td></tr>';
                return;
            }
            tbody.innerHTML = data.map(pedido => {
                const detalle = pedido.detalles_pedido?.[0] || {};
                const producto = detalle.productos || {};
                const tarea = pedido.tareas?.[0] || {};
                const empleado = tarea.empleados || {};
                return `
                    <tr class="clickable-row" onclick="App.verPedidoDetalle(${pedido.id})">
                        <td><strong style="color: var(--md-primary);">#${pedido.id}</strong></td>
                        <td>${pedido.clientes?.nombre || 'Sin cliente'}</td>
                        <td style="max-width:150px; word-wrap:break-word;">${pedido.observaciones || 'Sin descripción'}</td>
                        <td>${detalle.material_especifico || producto.nombre || 'Sin tarea'}</td>
                        <td>${empleado.nombre ? `${empleado.nombre} ${empleado.apellido || ''}`.trim() : 'Sin asignar'}</td>
                        <td>${pedido.fecha_solicitud ? new Date(pedido.fecha_solicitud).toLocaleDateString('es-ES') : 'No definida'}</td>
                        <td>${pedido.fecha_entrega_prometida ? new Date(pedido.fecha_entrega_prometida).toLocaleDateString('es-ES') : 'No definida'}</td>
                        <td>${tarea.fecha_fin ? new Date(tarea.fecha_fin).toLocaleDateString('es-ES') : 'En proceso'}</td>
                        <td><span class="md-badge ${StateMappers.getEstadoClass(pedido.estado)}">${StateMappers.getEstadoLabel(pedido.estado)}</span></td>
                        <td>
                            <button class="md-btn md-btn-text md-btn-sm" onclick="event.stopPropagation(); App.verPedidoDetalle(${pedido.id})"><i class="fas fa-eye"></i></button>
                            <button class="md-btn md-btn-text md-btn-sm" onclick="event.stopPropagation(); App.abrirModalEditarPedido(${pedido.id})"><i class="fas fa-edit"></i></button>
                            <button class="md-btn md-btn-text md-btn-sm" onclick="event.stopPropagation(); App.completarPedido(${pedido.id})" style="color:#22C55E;"><i class="fas fa-check"></i></button>
                            <button class="md-btn md-btn-text md-btn-sm" onclick="event.stopPropagation(); App.eliminarPedido(${pedido.id})" style="color:#EF4444;"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (error) { console.error('Error cargando pedidos urgentes:', error); }
    },

    verPedidoDetalle(id) {
        const modalBody = document.getElementById('modal-detalle-body');
        const idSpan = document.getElementById('detalle-pedido-id');
        if (idSpan) idSpan.textContent = '#' + id;
        if (modalBody) {
            modalBody.innerHTML = '<div style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:32px; color: var(--md-primary);"></i><p style="margin-top:12px;">Cargando detalle...</p></div>';
        }
        const modal = new bootstrap.Modal(document.getElementById('modalDetallePedido'));
        modal.show();
        this.buscarYMostrarDetalle(id);
    },

    async buscarYMostrarDetalle(id) {
        try {
            const { data, error } = await supabaseClient.from('pedidos').select(`id, estado, prioridad, observaciones, fecha_solicitud, fecha_entrega_prometida, clientes (nombre, telefono, email), detalles_pedido (*, productos (*)), tareas (*, empleados (*))`).eq('id', id).single();
            if (error) throw error;
            const detalle = data.detalles_pedido?.[0] || {};
            const producto = detalle.productos || {};
            const tarea = data.tareas?.[0] || {};
            const empleado = tarea.empleados || {};
            const cliente = data.clientes || {};
            const estadoColor = StateMappers.getEstadoClass(data.estado);
            const estadoLabel = StateMappers.getEstadoLabel(data.estado);
            const modalBody = document.getElementById('modal-detalle-body');
            if (modalBody) {
                modalBody.innerHTML = `
                    <div class="row g-3">
                        <div class="col-md-6"><div class="detail-card"><div class="detail-label"><i class="fas fa-user" style="color: var(--md-primary);"></i> Cliente</div><div class="detail-value">${cliente.nombre || 'Sin cliente'}</div>${cliente.telefono ? `<small>📞 ${cliente.telefono}</small>` : ''}</div></div>
                        <div class="col-md-6"><div class="detail-card"><div class="detail-label"><i class="fas fa-box" style="color: var(--md-primary);"></i> Producto</div><div class="detail-value">${producto.nombre || detalle.material_especifico || 'Sin producto'}</div></div></div>
                        <div class="col-md-4"><div class="detail-card"><div class="detail-label"><i class="fas fa-ruler-combined" style="color: var(--md-primary);"></i> Medidas</div><div class="detail-value">${detalle.medida_ancho_cm ? `${detalle.medida_ancho_cm} x ${detalle.medida_alto_cm || '-'} cm` : 'No definida'}</div></div></div>
                        <div class="col-md-4"><div class="detail-card"><div class="detail-label"><i class="fas fa-clock" style="color: var(--md-primary);"></i> Tiempo Estimado</div><div class="detail-value">${detalle.tiempo_estimado_minutos ? `${detalle.tiempo_estimado_minutos} min` : 'N/A'}</div></div></div>
                        <div class="col-md-4"><div class="detail-card"><div class="detail-label"><i class="fas fa-user-tie" style="color: var(--md-primary);"></i> Asignado a</div><div class="detail-value">${empleado.nombre ? `${empleado.nombre} ${empleado.apellido || ''}`.trim() : 'Sin asignar'}</div></div></div>
                        <div class="col-md-6"><div class="detail-card"><div class="detail-label"><i class="fas fa-calendar-alt" style="color: var(--md-primary);"></i> Fechas</div><div class="detail-value">Solicitud: ${data.fecha_solicitud ? new Date(data.fecha_solicitud).toLocaleDateString('es-ES') : '-'}<br>Entrega: ${data.fecha_entrega_prometida ? new Date(data.fecha_entrega_prometida).toLocaleDateString('es-ES') : '-'}</div></div></div>
                        <div class="col-md-6"><div class="detail-card"><div class="detail-label"><i class="fas fa-info-circle" style="color: var(--md-primary);"></i> Estado</div><div class="detail-value"><span class="md-badge ${estadoColor}">${estadoLabel}</span></div>${data.observaciones ? `<p style="margin-top:8px; font-size:13px;">${data.observaciones}</p>` : ''}</div></div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('❌ Error cargando detalle:', error);
            const modalBody = document.getElementById('modal-detalle-body');
            if (modalBody) modalBody.innerHTML = '<div style="text-align:center; padding:30px; color:#EF4444;"><i class="fas fa-exclamation-circle" style="font-size:32px;"></i><p>Error al cargar el pedido</p></div>';
        }
    },

   empleadoGradients: [
    'linear-gradient(135deg, #6366F1, #8B5CF6)',
    'linear-gradient(135deg, #EC4899, #F43F5E)',
    'linear-gradient(135deg, #F59E0B, #FBBF24)',
    'linear-gradient(135deg, #10B981, #34D399)',
    'linear-gradient(135deg, #06B6D4, #22D3EE)',
    'linear-gradient(135deg, #F97316, #FB923C)',
    'linear-gradient(135deg, #8B5CF6, #A78BFA)',
    'linear-gradient(135deg, #14B8A6, #5EEAD4)'
],

getGradientEmpleado(nombre) {
    let hash = 0;
    for (let i = 0; i < nombre.length; i++) hash = nombre.charCodeAt(i) + ((hash << 5) - hash);
    return this.empleadoGradients[Math.abs(hash) % this.empleadoGradients.length];
},

    async cargarEmpleadosYTareas() {
    try {
        const { data: empleados, error: errorEmpleados } = await withRetry(() =>
            supabaseClient.from('empleados').select('id, nombre, apellido, cargo, email, telefono').eq('activo', true).order('nombre')
        );
        if (errorEmpleados) throw errorEmpleados;
        STATE.empleados = empleados || [];

        const { data: tareas, error: errorTareas } = await withRetry(() =>
            supabaseClient.from('tareas').select('id, empleado_id, estado').in('estado', ['pendiente', 'en_progreso', 'notificado'])
        );
        if (errorTareas) throw errorTareas;
        STATE.tareas = tareas || [];

        const conteo = {};
        let totalPendientes = 0, totalProceso = 0, totalListo = 0;

        tareas.forEach(t => {
            if (t.empleado_id) conteo[t.empleado_id] = (conteo[t.empleado_id] || 0) + 1;
            if (t.estado === 'pendiente' || t.estado === 'notificado') totalPendientes++;
            else if (t.estado === 'en_progreso') totalProceso++;
        });

        // Contar completadas del total
        const { count: completadas } = await supabaseClient
            .from('tareas')
            .select('*', { count: 'exact', head: true })
            .eq('estado', 'completado');
        totalListo = completadas || 0;

        // Actualizar stats globales
        const statsPendientes = document.getElementById('stats-pendientes');
        const statsProceso = document.getElementById('stats-proceso');
        const statsListo = document.getElementById('stats-listo');
        if (statsPendientes) statsPendientes.textContent = totalPendientes;
        if (statsProceso) statsProceso.textContent = totalProceso;
        if (statsListo) statsListo.textContent = totalListo;

        this.renderAvataresEmpleados(empleados, conteo);
    } catch (error) {
        console.error('❌ Error cargando empleados:', error);
        const grid = document.getElementById('empleadosAvatarGrid');
        if (grid) grid.innerHTML = '<div style="text-align:center; padding:20px; width:100%; color:#EF4444;"><i class="fas fa-exclamation-circle" style="font-size:28px;"></i>Error al cargar empleados</div>';
    }
},
    
    renderAvataresEmpleados(empleados, conteo) {
    const grid = document.getElementById('empleadosAvatarGrid');
    if (!grid) return;

    if (!empleados || empleados.length === 0) {
        grid.innerHTML = '<div style="text-align:center; padding:20px; width:100%; color:var(--md-text-secondary);">No hay empleados</div>';
        return;
    }

    const valoresConteo = Object.values(conteo);
    const maxTareas = Math.max(1, ...valoresConteo);

    grid.innerHTML = empleados.map(empleado => {
        const tareasPendientes = conteo[empleado.id] || 0;
        const gradient = this.getGradientEmpleado(empleado.nombre);
        const iniciales = `${empleado.nombre.charAt(0)}${empleado.apellido ? empleado.apellido.charAt(0) : ''}`.toUpperCase();
        const badgeClass = tareasPendientes > 0 ? 'pendiente' : 'listo';
        const porcentaje = tareasPendientes > 0 ? Math.min(100, (tareasPendientes / maxTareas) * 100) : 100;

        return `
            <div class="empleado-avatar-card"
                 onclick="App.abrirModalEmpleado(${empleado.id})"
                 style="--card-gradient: ${gradient};"
                 title="Ver tareas de ${empleado.nombre}">
                <span class="avatar-badge ${badgeClass}">${tareasPendientes}</span>
                <div class="avatar-circle">${iniciales}</div>
                <span class="avatar-name">${empleado.nombre}</span>
                <span class="empleado-cargo">${empleado.cargo || 'Sin cargo'}</span>
                <div class="empleado-progress">
                    <div class="empleado-progress-fill" style="width: ${porcentaje}%"></div>
                </div>
            </div>
        `;
    }).join('');

    const badge = document.getElementById('empleados-total-badge');
    if (badge) badge.textContent = empleados.length;
},
    
    async abrirModalEmpleado(empleadoId) {
        try {
            const { data: empleado, error: errorEmpleado } = await supabaseClient.from('empleados').select('*').eq('id', empleadoId).single();
            if (errorEmpleado) throw errorEmpleado;
            const { data: tareas, error: errorTareas } = await supabaseClient.from('tareas').select('*, pedidos (id, fecha_solicitud, fecha_entrega_prometida, observaciones, clientes (nombre))').eq('empleado_id', empleadoId).order('fecha_asignacion', { ascending: false });
            if (errorTareas) throw errorTareas;
            this.renderModalEmpleado(empleado, tareas || []);
            new bootstrap.Modal(document.getElementById('modalEmpleadoDetalle')).show();
        } catch (error) {
            console.error('❌ Error cargando empleado:', error);
            ToastSystem.error('Error', 'No se pudo cargar la información del empleado');
        }
    },

    renderModalEmpleado(empleado, tareas) {
        const color = this.getColorEmpleado(empleado.nombre);
        const iniciales = `${empleado.nombre.charAt(0)}${empleado.apellido ? empleado.apellido.charAt(0) : ''}`;
        const completadas = tareas.filter(t => t.estado === 'completado' || t.completada === true).length;
        const enProceso = tareas.filter(t => t.estado === 'en_progreso').length;
        const pendientes = tareas.filter(t => t.estado === 'pendiente').length;
        const total = tareas.length;
        const titleEl = document.getElementById('modalEmpleadoTitle');
        if (titleEl) titleEl.innerHTML = `<span class="avatar-lg" style="background:${color};">${iniciales}</span>${empleado.nombre} ${empleado.apellido || ''}<span class="ms-2 md-badge primary" style="font-size:12px;">${total} tareas</span>`;
        const bodyEl = document.getElementById('modalEmpleadoBody');
        if (bodyEl) {
            bodyEl.innerHTML = `
                <div class="profile-summary">
                    <div class="info-item"><span class="label">📋 Cargo:</span> ${empleado.cargo || 'Sin cargo'}</div>
                    ${empleado.email ? `<div class="info-item"><span class="label">📧 Email:</span> ${empleado.email}</div>` : ''}
                    ${empleado.telefono ? `<div class="info-item"><span class="label">📱 Teléfono:</span> ${empleado.telefono}</div>` : ''}
                    <div class="info-item"><span class="label">📊 Total:</span> ${total}</div>
                </div>
                <div class="stats-row">
                    <span class="stat completadas">✅ ${completadas} completadas</span>
                    <span class="stat proceso">⏳ ${enProceso} en proceso</span>
                    <span class="stat pendientes">📋 ${pendientes} pendientes</span>
                </div>
                ${tareas.length > 0 ? `
                    <div class="table-wrapper" style="max-height: 400px; overflow-y: auto;">
                        <table class="tareas-empleado-modal">
                            <thead><tr><th>Recepción</th><th>Tarea</th><th>Entrega</th><th>Detalle</th><th>Estado</th><th>Fin</th></tr></thead>
                            <tbody>${this.renderTareasModal(tareas, empleado)}</tbody>
                        </table>
                    </div>
                ` : '<div class="md-empty"><i class="fas fa-inbox empty-icon"></i><div class="empty-title">Sin tareas</div></div>'}
            `;
        }
    },

    renderTareasModal(tareas, empleado) {
        if (!tareas || tareas.length === 0) return '';
        const statusMap = { pendiente: 'Pendiente', en_progreso: 'En Proceso', notificado: 'Notificado', completado: 'Listo' };
        const statusOptions = ['pendiente', 'notificado', 'en_progreso', 'completado'];
        return tareas.map(tarea => {
            const pedido = tarea.pedidos || {};
            const cliente = pedido.clientes || {};
            const fechaRecepcion = pedido.fecha_solicitud ? new Date(pedido.fecha_solicitud).toLocaleDateString('es-ES') : '-';
            const fechaEntrega = pedido.fecha_entrega_prometida ? new Date(pedido.fecha_entrega_prometida).toLocaleDateString('es-ES') : '-';
            const fechaFin = tarea.fecha_fin ? new Date(tarea.fecha_fin).toLocaleDateString('es-ES') : '-';
            const detalles = pedido.observaciones || tarea.observaciones || cliente.nombre || 'Sin detalles';
            return `
                <tr data-tarea-id="${tarea.id}">
                    <td>${fechaRecepcion}</td>
                    <td><strong>${tarea.tipo_tarea || 'Sin tarea'}</strong></td>
                    <td>${fechaEntrega}</td>
                    <td style="max-width:150px; word-wrap:break-word;">${detalles}</td>
                    <td>
                        <select class="status-select status-${tarea.estado}" onchange="App.actualizarStatusTarea(${tarea.id}, this.value, ${empleado.id})">
                            ${statusOptions.map(opt => `<option value="${opt}" ${tarea.estado === opt ? 'selected' : ''}>${statusMap[opt]}</option>`).join('')}
                        </select>
                    </td>
                    <td><span class="status-badge-sm ${tarea.estado}">${tarea.estado === 'completado' ? fechaFin : 'En curso'}</span></td>
                </tr>
            `;
        }).join('');
    },

    async actualizarStatusTarea(tareaId, nuevoStatus, empleadoId) {
        try {
            const updateData = { estado: nuevoStatus };
            if (nuevoStatus === 'completado') {
                updateData.fecha_fin = new Date().toISOString();
                updateData.completada = true;
            }
            const { error } = await supabaseClient.from('tareas').update(updateData).eq('id', tareaId);
            if (error) throw error;
            await this.calcularEficienciaEmpleado(empleadoId);
            ToastSystem.success('✅ Actualizado', `Tarea cambiada a ${nuevoStatus}`);
            Cache.invalidate('eficiencia', 'empleados', 'pedidos');
            await Promise.all([this.cargarEmpleadosYTareas(), this.cargarEficienciaOptimizada(), this.cargarPedidosUrgentes()]);
            await this.abrirModalEmpleado(empleadoId);
        } catch (error) {
            console.error('❌ Error actualizando tarea:', error);
            ToastSystem.error('Error', 'No se pudo actualizar la tarea');
        }
    },

    async calcularEficienciaEmpleado(empleadoId) {
        try {
            const { data: tareas, error } = await supabaseClient.from('tareas').select('estado, completada').eq('empleado_id', empleadoId);
            if (error) throw error;
            const total = tareas.length;
            const completadas = tareas.filter(t => t.estado === 'completado' || t.completada === true).length;
            const pendientes = tareas.filter(t => t.estado === 'pendiente').length;
            const tasaExito = total > 0 ? Math.round((completadas / total) * 100) : 0;
            await supabaseClient.from('eficiencia_empleados').upsert({
                empleado_id: empleadoId,
                fecha: new Date().toISOString().split('T')[0],
                tareas_completadas: completadas,
                tareas_pendientes: pendientes,
                tareas_retrasadas: 0,
                tasa_exito: tasaExito
            }, { onConflict: 'empleado_id, fecha' });
        } catch (error) { console.error('Error calculando eficiencia:', error); }
    },

    async cargarEficienciaOptimizada() {
        try {
            const { data: empleados, error: errorEmpleados } = await withRetry(() =>
                supabaseClient.from('empleados').select('id, nombre, apellido, cargo').eq('activo', true)
            );
            if (errorEmpleados) throw errorEmpleados;
            const tbody = document.getElementById('tbody-eficiencia');
            if (!tbody) return;
            if (!empleados || empleados.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:40px;">No hay empleados</td></tr>';
                return;
            }
            const { data: todasTareas, error: errorTareas } = await withRetry(() =>
                supabaseClient.from('tareas').select('empleado_id, estado, completada')
            );
            if (errorTareas) throw errorTareas;
            const tareasPorEmpleado = {};
            todasTareas.forEach(t => {
                if (!t.empleado_id) return;
                if (!tareasPorEmpleado[t.empleado_id]) tareasPorEmpleado[t.empleado_id] = { total: 0, completadas: 0, pendientes: 0 };
                tareasPorEmpleado[t.empleado_id].total++;
                if (t.estado === 'completado' || t.completada === true) tareasPorEmpleado[t.empleado_id].completadas++;
                else tareasPorEmpleado[t.empleado_id].pendientes++;
            });
            let totalExito = 0, totalEmpleados = 0, mejorEmpleado = '', mejorTasa = 0;
            let html = '';
            for (const empleado of empleados) {
                const stats = tareasPorEmpleado[empleado.id] || { total: 0, completadas: 0, pendientes: 0 };
                const tasaExito = stats.total > 0 ? Math.round((stats.completadas / stats.total) * 100) : 0;
                let eficienciaClass = '', eficienciaLabel = '', progressClass = '';
                if (tasaExito >= 90) { eficienciaClass = 'success'; eficienciaLabel = 'Excelente 🏆'; progressClass = 'success'; }
                else if (tasaExito >= 70) { eficienciaClass = 'primary'; eficienciaLabel = 'Bueno 👍'; progressClass = 'primary'; }
                else if (tasaExito >= 50) { eficienciaClass = 'warning'; eficienciaLabel = 'Regular ⚠️'; progressClass = 'warning'; }
                else if (tasaExito > 0) { eficienciaClass = 'danger'; eficienciaLabel = 'Necesita Mejorar 🔴'; progressClass = 'danger'; }
                else { eficienciaClass = 'default'; eficienciaLabel = 'Sin Datos 📊'; progressClass = 'default'; }
                html += `<tr>
                    <td><strong>${empleado.nombre} ${empleado.apellido || ''}</strong></td>
                    <td>${empleado.cargo || 'Sin cargo'}</td>
                    <td><span class="md-badge success">${stats.completadas}</span></td>
                    <td><span class="md-badge warning">${stats.pendientes}</span></td>
                    <td>0</td>
                    <td><div style="display:flex; align-items:center; gap:12px;"><div class="md-progress" style="width:100px;"><div class="progress-fill ${progressClass}" style="width:${tasaExito}%"></div></div><span style="font-weight:600;">${tasaExito}%</span></div></td>
                    <td>-</td><td>-</td>
                    <td><span class="md-badge ${eficienciaClass}">${eficienciaLabel}</span></td>
                </tr>`;
                if (stats.completadas > 0) {
                    totalExito += tasaExito;
                    totalEmpleados++;
                    if (tasaExito > mejorTasa) { mejorTasa = tasaExito; mejorEmpleado = `${empleado.nombre} ${empleado.apellido || ''}`; }
                }
            }
            tbody.innerHTML = html;
            const tasaGeneral = totalEmpleados > 0 ? Math.round(totalExito / totalEmpleados) : 0;
            const el1 = document.getElementById('tasa-exito-general');
            const el2 = document.getElementById('tasa-exito-general-badge');
            const el3 = document.getElementById('empleado-mas-eficiente');
            if (el1) el1.textContent = `${tasaGeneral}%`;
            if (el2) el2.textContent = `${tasaGeneral}% General`;
            if (el3) el3.textContent = mejorEmpleado || 'Sin datos';
        } catch (error) { console.error('❌ Error cargando eficiencia:', error); }
    },

    async calcularEficienciaTodos() {
        try {
            ToastSystem.warning('⏳ Calculando', 'Procesando eficiencia de todos los empleados...');
            const { data: empleados, error: errorEmpleados } = await supabaseClient.from('empleados').select('id').eq('activo', true);
            if (errorEmpleados) throw errorEmpleados;
            const { data: todasTareas, error: errorTareas } = await supabaseClient.from('tareas').select('empleado_id, estado, completada');
            if (errorTareas) throw errorTareas;
            const tareasPorEmpleado = {};
            todasTareas.forEach(t => {
                if (!t.empleado_id) return;
                if (!tareasPorEmpleado[t.empleado_id]) tareasPorEmpleado[t.empleado_id] = { total: 0, completadas: 0, pendientes: 0 };
                tareasPorEmpleado[t.empleado_id].total++;
                if (t.estado === 'completado' || t.completada === true) tareasPorEmpleado[t.empleado_id].completadas++;
                else tareasPorEmpleado[t.empleado_id].pendientes++;
            });
            let actualizados = 0;
            for (const emp of empleados) {
                const stats = tareasPorEmpleado[emp.id] || { total: 0, completadas: 0, pendientes: 0 };
                const tasaExito = stats.total > 0 ? Math.round((stats.completadas / stats.total) * 100) : 0;
                await supabaseClient.from('eficiencia_empleados').upsert({
                    empleado_id: emp.id,
                    fecha: new Date().toISOString().split('T')[0],
                    tareas_completadas: stats.completadas,
                    tareas_pendientes: stats.pendientes,
                    tareas_retrasadas: 0,
                    tasa_exito: tasaExito
                }, { onConflict: 'empleado_id, fecha' });
                actualizados++;
            }
            ToastSystem.success('✅ Completado', `Eficiencia calculada para ${actualizados} empleados`);
            Cache.invalidate('eficiencia');
            await this.cargarEficienciaOptimizada();
        } catch (error) {
            console.error('Error calculando eficiencia:', error);
            ToastSystem.error('Error', 'No se pudo calcular la eficiencia');
        }
    },

    suscribirRealtime() {
        try {
            if (STATE.realtimeChannel) supabaseClient.removeChannel(STATE.realtimeChannel);
            STATE.realtimeChannel = supabaseClient.channel('dashboard-updates')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
                    Cache.invalidate('kpi', 'estados', 'urgentes');
                    this.refrescarDatosSilencioso();
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'tareas' }, () => {
                    Cache.invalidate('empleados', 'eficiencia', 'carga');
                    this.refrescarDatosSilencioso();
                })
                .subscribe((status, err) => {
                    if (status === 'SUBSCRIBED') console.log('✅ Suscrito a Realtime');
                    else if (err) console.error('❌ Error en suscripción:', err);
                });
        } catch (error) { console.error('❌ Error suscribiendo a Realtime:', error); }
    },

    reintentar() {
        ErrorHandler.clear();
        Cache.clear();
        LoadingSystem.show('⏳ Reintentando conexión...');
        this.cargarTodosLosDatos();
    },

    async cargarClientes() {
        try {
            const { data, error } = await supabaseClient.from('clientes').select('id, nombre, telefono, email').order('nombre');
            if (error) throw error;
            STATE.clientes = data || [];
            const select = document.getElementById('pedido_cliente');
            if (select) select.innerHTML = '<option value="">Seleccionar cliente...</option>' + STATE.clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
            const tbody = document.getElementById('tbody-clientes');
            if (tbody) tbody.innerHTML = STATE.clientes.length ? STATE.clientes.map(c => `<tr><td>${c.id}</td><td>${c.nombre}</td><td>${c.telefono || '-'}</td><td>${c.email || '-'}</td></tr>`).join('') : '<tr><td colspan="4">Sin clientes</td></tr>';
        } catch (error) { console.error('Error clientes:', error); }
    },

    async cargarProductos() {
        try {
            const { data, error } = await supabaseClient.from('productos').select('id, nombre, categoria, material, precio_unitario, precio_por_m2').order('nombre');
            if (error) throw error;
            STATE.productos = data || [];
            const select = document.getElementById('pedido_producto');
            if (select) select.innerHTML = '<option value="">Seleccionar producto...</option>' + STATE.productos.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
        } catch (error) { console.error('Error productos:', error); }
    },

    async guardarNuevoCliente() {
        const nombre = document.getElementById('cliente_nombre')?.value.trim();
        if (!nombre) { ToastSystem.error('Error', 'El nombre es obligatorio'); return; }
        try {
            const { error } = await supabaseClient.from('clientes').insert({
                nombre,
                telefono: document.getElementById('cliente_telefono')?.value.trim() || null,
                email: document.getElementById('cliente_email')?.value.trim() || null
            });
            if (error) throw error;
            ToastSystem.success('✅ Cliente creado', `Cliente "${nombre}" registrado`);
            bootstrap.Modal.getInstance(document.getElementById('modalNuevoCliente'))?.hide();
            document.getElementById('formNuevoCliente')?.reset();
            Cache.invalidate('clientes');
            await this.cargarClientes();
        } catch (error) {
            console.error('Error guardar cliente:', error);
            ToastSystem.error('Error', 'No se pudo guardar el cliente');
        }
    },

    async guardarNuevoPedido() {
        const clienteId = document.getElementById('pedido_cliente')?.value;
        const productoId = document.getElementById('pedido_producto')?.value;
        if (!clienteId || !productoId) { ToastSystem.error('Error', 'Cliente y producto son obligatorios'); return; }
        try {
            const { data: pedido, error: errorPedido } = await supabaseClient.from('pedidos').insert({
                cliente_id: parseInt(clienteId),
                prioridad: document.getElementById('pedido_prioridad')?.value || 'normal',
                fecha_entrega_prometida: document.getElementById('pedido_fecha_entrega')?.value || null,
                observaciones: document.getElementById('pedido_observaciones')?.value.trim() || null,
                estado: 'cotizando'
            }).select();
            if (errorPedido) throw errorPedido;
            const pedidoId = pedido[0].id;
            const { error: errorDetalle } = await supabaseClient.from('detalles_pedido').insert({
                pedido_id: pedidoId,
                producto_id: parseInt(productoId),
                cantidad: parseInt(document.getElementById('pedido_cantidad')?.value) || 1,
                medida_ancho_cm: parseFloat(document.getElementById('pedido_ancho')?.value) || null,
                medida_alto_cm: parseFloat(document.getElementById('pedido_alto')?.value) || null
            });
            if (errorDetalle) throw errorDetalle;
            ToastSystem.success('✅ Pedido creado', `Pedido #${pedidoId} registrado`);
            bootstrap.Modal.getInstance(document.getElementById('modalNuevoPedido'))?.hide();
            document.getElementById('formNuevoPedido')?.reset();
            Cache.clear();
            await this.refrescarDatosSilencioso();
        } catch (error) {
            console.error('Error guardar pedido:', error);
            ToastSystem.error('Error', 'No se pudo guardar el pedido');
        }
    },

    async completarPedido(id) {
        if (!confirm(`¿Marcar pedido #${id} como entregado?`)) return;
        try {
            const { error } = await supabaseClient.from('pedidos').update({ estado: 'entregado', updated_at: new Date().toISOString() }).eq('id', id);
            if (error) throw error;
            ToastSystem.success('✅ Pedido completado', `Pedido #${id} marcado como entregado`);
            Cache.clear();
            await this.refrescarDatosSilencioso();
        } catch (error) { console.error('Error completar pedido:', error); }
    },

    async eliminarPedido(id) {
        if (!confirm(`¿Cancelar pedido #${id}?`)) return;
        try {
            const { error } = await supabaseClient.from('pedidos').update({ estado: 'cancelado', updated_at: new Date().toISOString() }).eq('id', id);
            if (error) throw error;
            ToastSystem.success('✅ Pedido cancelado', `Pedido #${id} cancelado`);
            Cache.clear();
            await this.refrescarDatosSilencioso();
        } catch (error) { console.error('Error cancelar pedido:', error); }
    },

    verPedido(id) { this.verPedidoDetalle(id); },

    abrirModalNuevoPedido() { this.cargarClientes(); this.cargarProductos(); new bootstrap.Modal(document.getElementById('modalNuevoPedido')).show(); },
    abrirModalClientes() { new bootstrap.Modal(document.getElementById('modalClientes')).show(); this.cargarClientes(); },
    abrirModalNuevoCliente() { new bootstrap.Modal(document.getElementById('modalNuevoCliente')).show(); },
    abrirModalProductos() { new bootstrap.Modal(document.getElementById('modalProductos')).show(); this.cargarProductos(); },
    abrirModalNuevoProducto() { new bootstrap.Modal(document.getElementById('modalNuevoProducto')).show(); },

    destroy() {
        if (STATE.refreshInterval) { clearInterval(STATE.refreshInterval); STATE.refreshInterval = null; }
        if (STATE.realtimeChannel) { supabaseClient.removeChannel(STATE.realtimeChannel); STATE.realtimeChannel = null; }
        Cache.clear();
        console.log('🧹 Aplicación destruida');
    }
};

window.App = App;
window.abrirModalNuevoPedido = () => App.abrirModalNuevoPedido();
window.abrirModalClientes = () => App.abrirModalClientes();
window.abrirModalNuevoCliente = () => App.abrirModalNuevoCliente();
window.abrirModalProductos = () => App.abrirModalProductos();
window.abrirModalNuevoProducto = () => App.abrirModalNuevoProducto();
window.refrescarDatos = () => App.refrescarDatos();
window.mostrarNotificaciones = () => ToastSystem.info('Notificaciones', 'Sección en desarrollo');
window.guardarNuevoCliente = () => App.guardarNuevoCliente();
window.guardarNuevoPedido = () => App.guardarNuevoPedido();
window.completarPedido = (id) => App.completarPedido(id);
window.eliminarPedido = (id) => App.eliminarPedido(id);
window.verPedido = (id) => App.verPedido(id);
window.verPedidoDetalle = (id) => App.verPedidoDetalle(id);
window.reintentar = () => App.reintentar();
window.calcularEficienciaTodos = () => App.calcularEficienciaTodos();
window.cargarEmpleadosYTareas = () => App.cargarEmpleadosYTareas();
window.abrirModalEmpleado = (id) => App.abrirModalEmpleado(id);
window.calcularEficienciaEmpleado = (id) => App.calcularEficienciaEmpleado(id);
window.actualizarStatusTarea = (tareaId, nuevoStatus, empleadoId) => App.actualizarStatusTarea(tareaId, nuevoStatus, empleadoId);

document.addEventListener('DOMContentLoaded', () => { App.init(); });
window.addEventListener('beforeunload', () => { App.destroy(); });
console.log('✅ Dashboard INVEMEX v7.0 cargado correctamente');
