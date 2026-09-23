const CONFIG = {
    SUPABASE_URL: 'https://ubyesdxizxywfwysechk.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_ocKHSbzB3BuoZRWu4GvCFQ_fonZWWgQ',
    REFRESH_INTERVAL: 30000,
    TOAST_DURATION: 4000
};

// Permitir sobrescribir credenciales sin recompilar (ej. ?sbUrl=...&sbKey=... o ventana TV)
try {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get('sbUrl')) CONFIG.SUPABASE_URL = qs.get('sbUrl');
    if (qs.get('sbKey')) CONFIG.SUPABASE_ANON_KEY = qs.get('sbKey');
} catch (_) { /* noop */ }

console.log('🚀 Iniciando Dashboard INVEMEX v6.1.0');

let supabaseClient = null;
if (typeof window.supabase === 'undefined' || !window.supabase?.createClient) {
    console.error('❌ SDK de Supabase no disponible');
} else {
    try {
        supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
            global: { headers: { 'x-client-info': 'ivx-dashboard/6.1.0' } },
            auth: { persistSession: false, autoRefreshToken: false }
        });
    } catch (error) {
        console.error('❌ No se pudo crear el cliente de Supabase:', error);
    }
}
window.supabaseClient = supabaseClient;

const STATE = {
    clientes: [],
    productos: [],
    pedidos: [],
    urgentes: [],
    empleados: [],
    tareas: [],
    loading: false,
    refreshInterval: null,
    realtimeChannel: null,
    ultimaActualizacion: null
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
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };
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
    formatLong() {
        return new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    },
    getToday() {
        return new Date().toISOString().split('T')[0];
    },
    formatHora() {
        return new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
};

const StateMappers = {
    estadoClass: {
        urgente: 'danger',
        'producción': 'warning',
        'en diseño': 'primary',
        completado: 'success',
        en_produccion: 'warning',
        diseño: 'primary',
        control_calidad: 'default',
        cotizando: 'default',
        listo: 'success',
        entregado: 'success',
        cancelado: 'default'
    },
    estadoLabel: {
        cotizando: 'Cotizando',
        diseño: 'En Diseño',
        en_produccion: 'Producción',
        control_calidad: 'Control Calidad',
        listo: 'Listo',
        entregado: 'Entregado',
        cancelado: 'Cancelado'
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
                <pre style="background:white; padding:12px; border-radius:8px; font-size:13px; max-height:150px; overflow:auto; color:#1A1A1A; border:1px solid #EEEEEE;">${message}</pre>
                <button class="md-btn md-btn-primary mt-3" onclick="App.reintentar()"><i class="fas fa-redo"></i> Reintentar</button>
            </div>
        `;
    },
    clear() {
        const cont = document.getElementById('error-container');
        if (cont) cont.innerHTML = '';
    }
};

const LoadingSystem = {
    show(text = 'Cargando...') {
        const el = document.getElementById('loading-text');
        if (el) el.textContent = text;
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = 'flex';
        const newLoader = document.getElementById('ivx-loader');
        if (newLoader) {
            newLoader.style.display = 'flex';
            newLoader.style.opacity = '1';
            newLoader.style.pointerEvents = 'auto';
        }
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
    setText(text) {
        const el = document.getElementById('loading-text');
        if (el) el.textContent = text;
    }
};

const TableCounter = {
    update() {
        const tbody = document.getElementById('tabla-urgentes-body');
        const countEl = document.getElementById('total-registros');
        if (!countEl || !tbody) return;
        const filas = tbody.querySelectorAll('tr:not(:has(.md-empty))');
        countEl.textContent = tbody.querySelector('.md-empty') ? '0' : filas.length;
    }
};

const App = {
    calendarState: { currentDate: new Date(), selectedDate: new Date(), isOpen: false },

    async init() {
        console.log('📋 Inicializando aplicación v6.1.0...');
        const today = new Date();
        this.calendarState.selectedDate = new Date(today);
        this.calendarState.currentDate = new Date(today);
        this.updateDateDisplay?.(today);
        ToastSystem.init();
        LoadingSystem.show('Conectando con la base de datos...');
        await this.cargarTodosLosDatos();
        this.suscribirRealtime();
        STATE.refreshInterval = setInterval(() => this.refrescarDatosSilencioso(), CONFIG.REFRESH_INTERVAL);
        console.log('✅ Aplicación inicializada correctamente');
    },

    // Envuelve cualquier promesa con un tiempo máximo de espera (evita loader eterno en TV)
    withTimeout(promise, ms = 20000, label = 'consulta') {
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Tiempo de espera agotado en ${label}.`)), ms);
        });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
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
            ErrorHandler.show(error.message || 'Error al conectar con la base de datos. Revisa la consola (F12).');
            LoadingSystem.setText('⚠️ Error al cargar datos.');
            setTimeout(() => LoadingSystem.hide(), 1500);
        }
    },

    async cargarDatos() {
        console.log('📊 Cargando datos desde Supabase...');
        if (!supabaseClient) throw new Error('Sin conexión: el cliente de Supabase no está disponible.');
        try {
            await Promise.all([
                this.cargarKPI(),
                this.cargarEstadosGrafico(),
                this.cargarCargaTrabajo(),
                this.cargarPedidosUrgentes(),
                this.cargarEficiencia(),
                this.cargarEmpleadosYTareas()
            ]);
            console.log('✅ Todos los datos cargados correctamente');
            TableCounter.update();
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
            await this.cargarDatos();
            ToastSystem.success('✅ Actualizado', 'Datos del dashboard actualizados correctamente');
        } catch (error) {
            console.error('❌ Error al refrescar:', error);
            ToastSystem.error('❌ Error', 'No se pudieron actualizar los datos');
            ErrorHandler.show(error.message);
        }
    },

    async refrescarDatosSilencioso() {
        try {
            await this.cargarDatos();
            console.log('🔄 Datos actualizados automáticamente');
        } catch (error) {
            console.error('❌ Error en actualización automática:', error);
            // Reintenta una vez tras unos segundos si la conexión falló
            setTimeout(() => this.cargarDatos().catch(() => {}), 10000);
        }
    },

    async cargarKPI() {
        const hoy = DateFormatter.getToday();
        try {
            // Una sola consulta: trae los pedidos y calcula los KPI en memoria (menos requests)
            const { data, error } = await this.withTimeout(
                supabaseClient.from('pedidos').select('id, estado, prioridad, fecha_solicitud'),
                20000, 'carga de KPIs'
            );
            if (error) throw error;
            const pedidos = data || [];
            const activos = pedidos.filter(p => p.estado !== 'entregado' && p.estado !== 'cancelado').length;
            const produccion = pedidos.filter(p => p.estado === 'en_produccion').length;
            const entregados = pedidos.filter(p => p.estado === 'entregado' && p.fecha_solicitud && p.fecha_solicitud.slice(0, 10) >= hoy).length;
            const urgentes = pedidos.filter(p => p.prioridad === 'urgente' && p.estado !== 'entregado' && p.estado !== 'cancelado').length;
            const elements = {
                'kpi-activos': activos || 0,
                'kpi-activos-change': `${activos || 0} activos`,
                'kpi-produccion': produccion || 0,
                'kpi-produccion-change': `${produccion || 0} en producción`,
                'kpi-entregados': entregados || 0,
                'kpi-entregados-change': `${entregados || 0} hoy`,
                'kpi-urgentes': urgentes || 0,
                'kpi-urgentes-change': `${urgentes || 0} urgentes`
            };
            Object.entries(elements).forEach(([id, value]) => {
                const el = document.getElementById(id);
                if (el) el.textContent = value;
            });
            const badge2 = document.getElementById('urgentes-count-badge');
            if (badge2) badge2.textContent = urgentes || 0;
        } catch (error) {
            console.error('Error cargando KPI:', error);
        }
    },

    async cargarEstadosGrafico() {
        const estados = ['cotizando', 'diseño', 'en_produccion', 'control_calidad', 'listo', 'entregado'];
        const labels = ['Cotizando', 'Diseño', 'Producción', 'Control Calidad', 'Listo', 'Entregado'];
        const colores = ['#0B218B', '#1A3BA8', '#FFF200', '#E84C3D', '#27AE60', '#8B6914'];
        try {
            // Una sola consulta agrupada en memoria (antes: 6 consultas secuenciales)
            const { data, error } = await this.withTimeout(
                supabaseClient.from('pedidos').select('estado'),
                20000, 'gráfico de estados'
            );
            if (error) throw error;
            const conteo = {};
            (data || []).forEach(p => { conteo[p.estado] = (conteo[p.estado] || 0) + 1; });
            const resultados = estados.map((estado, i) => ({ label: labels[i], value: conteo[estado] || 0, color: colores[i] }));
            const total = resultados.reduce((sum, item) => sum + item.value, 0);
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
        } catch (error) {
            console.error('Error cargando estados:', error);
        }
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
            // Una sola consulta y agrupación en memoria (antes: 3 consultas secuenciales)
            const { data, error } = await this.withTimeout(
                supabaseClient.from('tareas').select('tipo_tarea').in('estado', ['pendiente', 'en_progreso']),
                20000, 'carga de trabajo'
            );
            if (error) throw error;
            const conteo = {};
            (data || []).forEach(t => { conteo[t.tipo_tarea] = (conteo[t.tipo_tarea] || 0) + 1; });
            let maxTareas = 1;
            const resultados = areas.map(area => {
                const tareas = conteo[area.nombre] || 0;
                if (tareas > maxTareas) maxTareas = tareas;
                return { ...area, tareas };
            });
            resultados.push({ label: 'Administración', icon: 'fa-user-tie', clase: 'admin', tareas: 0 });
            resultados.forEach(item => { item.porcentaje = maxTareas > 0 ? (item.tareas / maxTareas) * 100 : 0; });
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
        } catch (error) {
            console.error('Error cargando carga de trabajo:', error);
        }
    },

    async cargarPedidosUrgentes() {
        try {
            const { data, error } = await this.withTimeout(
                supabaseClient
                    .from('pedidos')
                    .select('id, cliente_id, estado, prioridad, observaciones, fecha_solicitud, fecha_entrega_prometida, clientes (nombre), detalles_pedido (producto_id, material_especifico, tiempo_estimado_minutos, productos (nombre)), tareas (id, empleado_id, fecha_fin, empleados (nombre, apellido))')
                    .eq('prioridad', 'urgente')
                    .not('estado', 'in', '(entregado,cancelado)')
                    .order('fecha_solicitud', { ascending: false })
                    .limit(10),
                20000, 'pedidos urgentes'
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
            TableCounter.update();
        } catch (error) {
            console.error('Error cargando pedidos urgentes:', error);
        }
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
            const { data, error } = await supabaseClient.from('pedidos').select('id, estado, prioridad, observaciones, fecha_solicitud, fecha_entrega_prometida, clientes (nombre, telefono, email), detalles_pedido (*, productos (*)), tareas (*, empleados (*))').eq('id', id).single();
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
                        <div class="col-md-6"><div class="detail-card"><div class="detail-label"><i class="fas fa-user" style="color: var(--md-primary);"></i> Cliente</div><div class="detail-value">${cliente.nombre || 'Sin cliente'}</div></div></div>
                        <div class="col-md-6"><div class="detail-card"><div class="detail-label"><i class="fas fa-box" style="color: var(--md-primary);"></i> Producto</div><div class="detail-value">${producto.nombre || detalle.material_especifico || 'Sin producto'}</div></div></div>
                        <div class="col-md-4"><div class="detail-card"><div class="detail-label"><i class="fas fa-ruler-combined" style="color: var(--md-primary);"></i> Medidas</div><div class="detail-value">${detalle.medida_ancho_cm ? `${detalle.medida_ancho_cm} x ${detalle.medida_alto_cm || '-'} cm` : 'No definida'}</div></div></div>
                        <div class="col-md-4"><div class="detail-card"><div class="detail-label"><i class="fas fa-clock" style="color: var(--md-primary);"></i> Tiempo Estimado</div><div class="detail-value">${detalle.tiempo_estimado_minutos ? `${Math.round(detalle.tiempo_estimado_minutos / 60 * 10) / 10} hrs` : 'N/A'}</div></div></div>
                        <div class="col-md-4"><div class="detail-card"><div class="detail-label"><i class="fas fa-user-tie" style="color: var(--md-primary);"></i> Asignado a</div><div class="detail-value">${empleado.nombre ? `${empleado.nombre} ${empleado.apellido || ''}`.trim() : 'Sin asignar'}</div></div></div>
                        <div class="col-md-6"><div class="detail-card"><div class="detail-label"><i class="fas fa-calendar-alt" style="color: var(--md-primary);"></i> Fechas</div><div class="detail-value">Solicitud: ${data.fecha_solicitud ? new Date(data.fecha_solicitud).toLocaleDateString('es-ES') : '-'}<br>Entrega: ${data.fecha_entrega_prometida ? new Date(data.fecha_entrega_prometida).toLocaleDateString('es-ES') : '-'}</div></div></div>
                        <div class="col-md-6"><div class="detail-card"><div class="detail-label"><i class="fas fa-info-circle" style="color: var(--md-primary);"></i> Información Adicional</div><div class="detail-value"><span class="md-badge ${estadoColor}">${estadoLabel}</span><br>${data.observaciones || 'Sin observaciones'}</div></div></div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('❌ Error cargando detalle:', error);
            const modalBody = document.getElementById('modal-detalle-body');
            if (modalBody) {
                modalBody.innerHTML = '<div style="text-align:center; padding:30px; color:#EF4444;"><i class="fas fa-exclamation-circle" style="font-size:32px; display:block; margin-bottom:12px;"></i>No se pudo cargar el detalle del pedido.</div>';
            }
            ToastSystem.error('Error', 'No se pudo cargar el detalle del pedido');
        }
    },

    empleadoColores: ['#0B218B', '#E84C3D', '#27AE60', '#F39C12', '#8E44AD', '#E74C8B', '#1A3BA8', '#2ECC71'],
    getColorEmpleado(nombre) {
        let hash = 0;
        for (let i = 0; i < nombre.length; i++) hash = nombre.charCodeAt(i) + ((hash << 5) - hash);
        return this.empleadoColores[Math.abs(hash) % this.empleadoColores.length];
    },

    async cargarEmpleadosYTareas() {
        console.log('📊 Cargando empleados...');
        if (!supabaseClient) throw new Error('Sin conexión con la base de datos.');
        try {
            const [{ data: empleados, error: errorEmpleados }, { data: tareas, error: errorTareas }] = await Promise.all([
                this.withTimeout(supabaseClient.from('empleados').select('*').eq('activo', true).order('nombre'), 20000, 'empleados'),
                this.withTimeout(supabaseClient.from('tareas').select('*').in('estado', ['pendiente', 'en_progreso', 'notificado']).order('fecha_asignacion', { ascending: false }), 20000, 'tareas')
            ]);
            if (errorEmpleados) throw errorEmpleados;
            STATE.empleados = empleados || [];
            const grid = document.getElementById('empleadosAvatarGrid');
            const badge = document.getElementById('empleados-total-badge');
            if (!empleados || empleados.length === 0) {
                if (grid) grid.innerHTML = '<div style="text-align:center; padding:20px; width:100%; color: var(--md-text-secondary);"><i class="fas fa-users" style="font-size:28px; display:block; margin-bottom:8px;"></i>No hay empleados activos</div>';
                if (badge) badge.textContent = '0';
                return;
            }
            if (errorTareas) throw errorTareas;
            STATE.tareas = tareas || [];
            this.renderAvataresEmpleados(empleados, tareas || []);
        } catch (error) {
            console.error('❌ Error cargando empleados:', error);
            const grid = document.getElementById('empleadosAvatarGrid');
            if (grid) grid.innerHTML = '<div style="text-align:center; padding:20px; width:100%; color: #EF4444;"><i class="fas fa-exclamation-circle" style="font-size:28px; display:block; margin-bottom:8px;"></i>No se pudieron cargar los empleados</div>';
            ToastSystem.error('Error', 'No se pudieron cargar los empleados');
            throw error;
        }
    },

    renderAvataresEmpleados(empleados, tareas) {
        const grid = document.getElementById('empleadosAvatarGrid');
        let html = '';
        empleados.forEach(empleado => {
            const tareasPendientes = tareas.filter(t => t.empleado_id === empleado.id).length;
            const color = this.getColorEmpleado(empleado.nombre);
            const iniciales = `${empleado.nombre.charAt(0)}${empleado.apellido ? empleado.apellido.charAt(0) : ''}`;
            const badgeClass = tareasPendientes > 0 ? 'pendiente' : 'listo';
            html += `
                <div class="empleado-avatar-card" onclick="App.abrirModalEmpleado(${empleado.id})" title="Ver tareas de ${empleado.nombre}">
                    <span class="avatar-badge ${badgeClass}">${tareasPendientes}</span>
                    <div class="avatar-circle" style="background:${color};">${iniciales}</div>
                    <span class="avatar-name">${empleado.nombre}</span>
                </div>
            `;
        });
        if (grid) grid.innerHTML = html;
        const badge = document.getElementById('empleados-total-badge');
        if (badge) badge.textContent = empleados.length;
    },

    async abrirModalEmpleado(empleadoId) {
        try {
            const { data: empleado, error: errorEmpleado } = await supabaseClient.from('empleados').select('*').eq('id', empleadoId).single();
            if (errorEmpleado) throw errorEmpleado;
            const { data: tareas, error: errorTareas } = await supabaseClient.from('tareas').select('*, pedidos (id, cliente_id, fecha_solicitud, fecha_entrega_prometida, observaciones, clientes (nombre))').eq('empleado_id', empleadoId).order('fecha_asignacion', { ascending: false });
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
        if (titleEl) {
            titleEl.innerHTML = `<span class="avatar-lg" style="background:${color};">${iniciales}</span>${empleado.nombre} ${empleado.apellido || ''}<span class="ms-2 md-badge primary" style="font-size:12px;">${total} tareas</span>`;
        }
        const bodyEl = document.getElementById('modalEmpleadoBody');
        if (bodyEl) {
            bodyEl.innerHTML = `
                <div class="profile-summary">
                    <div class="info-item"><span class="label">📋 Cargo:</span> ${empleado.cargo || 'Sin cargo'}</div>
                    ${empleado.email ? `<div class="info-item"><span class="label">📧 Email:</span> ${empleado.email}</div>` : ''}
                    ${empleado.telefono ? `<div class="info-item"><span class="label">📱 Teléfono:</span> ${empleado.telefono}</div>` : ''}
                    <div class="info-item"><span class="label">📊 Total tareas:</span> ${total}</div>
                </div>
                <div class="stats-row">
                    <span class="stat completadas">✅ ${completadas} completadas</span>
                    <span class="stat proceso">⏳ ${enProceso} en proceso</span>
                    <span class="stat pendientes">📋 ${pendientes} pendientes</span>
                </div>
                ${tareas.length > 0 ? `
                    <div class="table-wrapper" style="max-height: 400px; overflow-y: auto;">
                        <table class="tareas-empleado-modal">
                            <thead>
                                <tr><th style="min-width:80px;">Recepción</th><th style="min-width:120px;">Tarea</th><th style="min-width:100px;">Entrega</th><th style="min-width:150px;">Detalle</th><th style="min-width:110px;">Estado</th><th style="min-width:100px;">Fin</th></tr>
                            </thead>
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
            const tareaNombre = tarea.tipo_tarea || 'Sin tarea';
            const detalles = pedido.observaciones || tarea.observaciones || cliente.nombre || 'Sin detalles';
            return `
                <tr data-tarea-id="${tarea.id}">
                    <td>${fechaRecepcion}</td>
                    <td><strong>${tareaNombre}</strong></td>
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
            await Promise.all([this.cargarEmpleadosYTareas(), this.cargarEficiencia(), this.cargarPedidosUrgentes()]);
            await this.abrirModalEmpleado(empleadoId);
        } catch (error) {
            console.error('❌ Error actualizando tarea:', error);
            ToastSystem.error('Error', 'No se pudo actualizar la tarea');
        }
    },

    async calcularEficienciaEmpleado(empleadoId) {
        try {
            const { data: tareas, error } = await supabaseClient.from('tareas').select('*').eq('empleado_id', empleadoId);
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
        } catch (error) {
            console.error('Error calculando eficiencia:', error);
        }
    },

    suscribirRealtime() {
        try {
            if (STATE.realtimeChannel) supabaseClient.removeChannel(STATE.realtimeChannel);
            STATE.realtimeChannel = supabaseClient.channel('dashboard-updates')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
                    console.log('🔄 Cambio detectado en pedidos');
                    this.refrescarDatosSilencioso();
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'tareas' }, () => {
                    console.log('🔄 Cambio detectado en tareas');
                    this.refrescarDatosSilencioso();
                })
                .subscribe((status, err) => {
                    if (status === 'SUBSCRIBED') console.log('✅ Suscrito a cambios en tiempo real');
                    else if (err) console.error('❌ Error en suscripción:', err);
                });
        } catch (error) {
            console.error('❌ Error suscribiendo a Realtime:', error);
        }
    },

    async cargarEficiencia() {
        try {
            // Dos consultas en paralelo (empleados + todas las tareas) en lugar de N+1
            const [{ data: empleados, error: errorEmpleados }, { data: todasTareas, error: errorTareas }] = await Promise.all([
                this.withTimeout(supabaseClient.from('empleados').select('id, nombre, apellido, cargo').eq('activo', true), 20000, 'eficiencia/empleados'),
                this.withTimeout(supabaseClient.from('tareas').select('empleado_id, estado, completada'), 20000, 'eficiencia/tareas')
            ]);
            if (errorEmpleados) throw errorEmpleados;
            const tbody = document.getElementById('tbody-eficiencia');
            if (!tbody) return;
            if (!empleados || empleados.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:40px; color: var(--md-text-secondary);"><i class="fas fa-inbox" style="font-size:32px; display:block; margin-bottom:10px;"></i>No hay empleados activos</td></tr>';
                return;
            }
            const tareasPorEmpleado = {};
            (todasTareas || []).forEach(t => {
                if (t.empleado_id == null) return;
                (tareasPorEmpleado[t.empleado_id] = tareasPorEmpleado[t.empleado_id] || []).push(t);
            });
            let totalExito = 0, totalEmpleados = 0, mejorEmpleado = '', mejorTasa = 0;
            let html = '';
            for (const empleado of empleados) {
                const tareas = tareasPorEmpleado[empleado.id] || [];
                const totalTareas = tareas.length;
                const tareasCompletadas = tareas.filter(t => t.estado === 'completado' || t.completada === true).length;
                const tareasPendientes = tareas.filter(t => t.estado !== 'completado' && t.completada !== true).length;
                let tasaExito = totalTareas > 0 ? Math.round((tareasCompletadas / totalTareas) * 100) : 0;
                let eficienciaClass = '', eficienciaLabel = '', progressClass = '';
                if (tasaExito >= 90) { eficienciaClass = 'success'; eficienciaLabel = 'Excelente 🏆'; progressClass = 'success'; }
                else if (tasaExito >= 70) { eficienciaClass = 'primary'; eficienciaLabel = 'Bueno 👍'; progressClass = 'primary'; }
                else if (tasaExito >= 50) { eficienciaClass = 'warning'; eficienciaLabel = 'Regular ⚠️'; progressClass = 'warning'; }
                else if (tasaExito > 0) { eficienciaClass = 'danger'; eficienciaLabel = 'Necesita Mejorar 🔴'; progressClass = 'danger'; }
                else { eficienciaClass = 'default'; eficienciaLabel = 'Sin Datos 📊'; progressClass = 'default'; }

                html += `<tr>
                    <td><strong>${empleado.nombre} ${empleado.apellido || ''}</strong></td>
                    <td>${empleado.cargo || 'Sin cargo'}</td>
                    <td><span class="md-badge success">${tareasCompletadas}</span></td>
                    <td><span class="md-badge warning">${tareasPendientes}</span></td>
                    <td>0</td>
                    <td><div style="display:flex; align-items:center; gap:12px;"><div class="md-progress" style="width:100px;"><div class="progress-fill ${progressClass}" style="width:${tasaExito}%"></div></div></div></td>
                    <td>-</td><td>-</td>
                    <td><span class="md-badge ${eficienciaClass}">${eficienciaLabel}</span></td>
                </tr>`;
                if (tareasCompletadas > 0) {
                    totalExito += tasaExito;
                    totalEmpleados++;
                    if (tasaExito > mejorTasa) {
                        mejorTasa = tasaExito;
                        mejorEmpleado = `${empleado.nombre} ${empleado.apellido || ''}`;
                    }
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
        } catch (error) {
            console.error('❌ Error cargando eficiencia:', error);
            ToastSystem.error('Error', 'No se pudo cargar la eficiencia de empleados');
        }
    },

    async calcularEficienciaTodos() {
        try {
            ToastSystem.warning('⏳ Calculando', 'Procesando eficiencia de todos los empleados...');
            const { data: empleados, error: errorEmpleados } = await supabaseClient.from('empleados').select('id').eq('activo', true);
            if (errorEmpleados) throw errorEmpleados;
            let actualizados = 0;
            for (const emp of empleados) {
                const { data: tareas, error: errorTareas } = await supabaseClient.from('tareas').select('*').eq('empleado_id', emp.id);
                if (errorTareas) continue;
                const total = tareas.length;
                const completadas = tareas.filter(t => t.estado === 'completado' || t.completada === true).length;
                const pendientes = tareas.filter(t => t.estado !== 'completado' && t.completada !== true).length;
                const tasaExito = total > 0 ? Math.round((completadas / total) * 100) : 0;
                await supabaseClient.from('eficiencia_empleados').upsert({
                    empleado_id: emp.id,
                    fecha: new Date().toISOString().split('T')[0],
                    tareas_completadas: completadas,
                    tareas_pendientes: pendientes,
                    tareas_retrasadas: 0,
                    tasa_exito: tasaExito
                }, { onConflict: 'empleado_id, fecha' });
                actualizados++;
            }
            ToastSystem.success('✅ Completado', `Eficiencia calculada para ${actualizados} empleados`);
            await this.cargarEficiencia();
        } catch (error) {
            console.error('Error calculando eficiencia:', error);
            ToastSystem.error('Error', 'No se pudo calcular la eficiencia');
        }
    },

    reintentar() {
        ErrorHandler.clear();
        LoadingSystem.show('⏳ Reintentando conexión...');
        this.cargarTodosLosDatos();
    },

    async cargarClientes() {
        try {
            const { data, error } = await supabaseClient.from('clientes').select('*').order('nombre');
            if (error) throw error;
            STATE.clientes = data || [];
            const select = document.getElementById('pedido_cliente');
            if (select) {
                select.innerHTML = '<option value="">Seleccionar cliente...</option>' + STATE.clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
            }
            const tbody = document.getElementById('tbody-clientes');
            if (tbody) {
                tbody.innerHTML = STATE.clientes.length ? STATE.clientes.map(c => `<tr><td>${c.id}</td><td>${c.nombre}</td><td>${c.telefono || '-'}</td><td>${c.email || '-'}</td><td><button class="md-btn md-btn-text md-btn-sm" onclick="eliminarCliente(${c.id})"><i class="fas fa-trash"></i></button></td></tr>`).join('') : '<tr><td colspan="5">Sin clientes</td></tr>';
            }
        } catch (error) {
            console.error('Error clientes:', error);
            ToastSystem.error('Error', 'No se pudieron cargar los clientes');
        }
    },

    async guardarNuevoCliente() {
        const nombre = document.getElementById('cliente_nombre').value.trim();
        if (!nombre) {
            ToastSystem.error('Error', 'El nombre es obligatorio');
            return;
        }
        try {
            const { error } = await supabaseClient.from('clientes').insert({
                nombre,
                telefono: document.getElementById('cliente_telefono').value.trim() || null,
                email: document.getElementById('cliente_email').value.trim() || null
            });
            if (error) throw error;
            ToastSystem.success('✅ Cliente creado', `Cliente "${nombre}" registrado exitosamente`);
            bootstrap.Modal.getInstance(document.getElementById('modalNuevoCliente')).hide();
            document.getElementById('formNuevoCliente').reset();
            await this.cargarClientes();
        } catch (error) {
            console.error('Error guardar cliente:', error);
            ToastSystem.error('Error', 'No se pudo guardar el cliente');
        }
    },

    async eliminarCliente(id) {
        const cliente = STATE.clientes.find(c => c.id === id);
        if (!confirm(`¿Eliminar cliente "${cliente?.nombre}"?`)) return;
        try {
            const { error } = await supabaseClient.from('clientes').delete().eq('id', id);
            if (error) throw error;
            ToastSystem.success('✅ Cliente eliminado', 'Cliente eliminado correctamente');
            await this.cargarClientes();
        } catch (error) {
            console.error('Error eliminar cliente:', error);
            ToastSystem.error('Error', 'No se pudo eliminar el cliente');
        }
    },

    async cargarProductos() {
        try {
            const { data, error } = await supabaseClient.from('productos').select('*').order('nombre');
            if (error) throw error;
            STATE.productos = data || [];
            const select = document.getElementById('pedido_producto');
            if (select) {
                select.innerHTML = '<option value="">Seleccionar producto...</option>' + STATE.productos.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
            }
            const tbody = document.getElementById('tbody-productos');
            if (tbody) {
                tbody.innerHTML = STATE.productos.length ? STATE.productos.map(p => `<tr><td>${p.id}</td><td>${p.nombre}</td><td>${p.categoria || '-'}</td><td>${p.material || '-'}</td><td>${p.precio_unitario || p.precio_por_m2 || '-'}</td><td><button class="md-btn md-btn-text md-btn-sm" onclick="eliminarProducto(${p.id})"><i class="fas fa-trash"></i></button></td></tr>`).join('') : '<tr><td colspan="6">Sin productos</td></tr>';
            }
        } catch (error) {
            console.error('Error productos:', error);
            ToastSystem.error('Error', 'No se pudieron cargar los productos');
        }
    },

    async guardarNuevoProducto() {
        const nombre = document.getElementById('producto_nombre').value.trim();
        if (!nombre) {
            ToastSystem.error('Error', 'El nombre es obligatorio');
            return;
        }
        const tipoPrecio = document.getElementById('producto_tipo_precio').value;
        const precio = parseFloat(document.getElementById('producto_precio').value) || 0;
        try {
            const dataInsert = {
                nombre,
                categoria: document.getElementById('producto_categoria').value || null,
                material: document.getElementById('producto_material').value.trim() || null,
                tipo_producto: tipoPrecio === 'm2' ? 'servicio' : 'producto',
                tipo_precio: tipoPrecio,
                velocidad_impresion_m2_hora: parseFloat(document.getElementById('producto_velocidad').value) || null,
                activo: true
            };
            if (tipoPrecio === 'm2') dataInsert.precio_por_m2 = precio; else dataInsert.precio_unitario = precio;
            const { error } = await supabaseClient.from('productos').insert(dataInsert);
            if (error) throw error;
            ToastSystem.success('✅ Producto creado', `"${nombre}" registrado exitosamente`);
            bootstrap.Modal.getInstance(document.getElementById('modalNuevoProducto')).hide();
            document.getElementById('formNuevoProducto').reset();
            await this.cargarProductos();
        } catch (error) {
            console.error('Error guardar producto:', error);
            ToastSystem.error('Error', 'No se pudo guardar el producto');
        }
    },

    async eliminarProducto(id) {
        if (!confirm('¿Eliminar este producto?')) return;
        try {
            const { error } = await supabaseClient.from('productos').update({ activo: false }).eq('id', id);
            if (error) throw error;
            ToastSystem.success('✅ Producto eliminado', 'Producto eliminado correctamente');
            await this.cargarProductos();
        } catch (error) {
            console.error('Error eliminar producto:', error);
            ToastSystem.error('Error', 'No se pudo eliminar el producto');
        }
    },

    async guardarNuevoPedido() {
        const clienteId = document.getElementById('pedido_cliente').value;
        const productoId = document.getElementById('pedido_producto').value;
        if (!clienteId || !productoId) {
            ToastSystem.error('Error', 'Cliente y producto son obligatorios');
            return;
        }
        try {
            const { data: pedido, error: errorPedido } = await supabaseClient.from('pedidos').insert({
                cliente_id: parseInt(clienteId),
                prioridad: document.getElementById('pedido_prioridad').value || 'normal',
                fecha_entrega_prometida: document.getElementById('pedido_fecha_entrega').value || null,
                observaciones: document.getElementById('pedido_observaciones').value.trim() || null,
                estado: 'cotizando'
            }).select();
            if (errorPedido) throw errorPedido;
            const pedidoId = pedido[0].id;
            const { error: errorDetalle } = await supabaseClient.from('detalles_pedido').insert({
                pedido_id: pedidoId,
                producto_id: parseInt(productoId),
                cantidad: parseInt(document.getElementById('pedido_cantidad').value) || 1,
                medida_ancho_cm: parseFloat(document.getElementById('pedido_ancho').value) || null,
                medida_alto_cm: parseFloat(document.getElementById('pedido_alto').value) || null
            });
            if (errorDetalle) throw errorDetalle;
            ToastSystem.success('✅ Pedido creado', `Pedido #${pedidoId} registrado exitosamente`);
            bootstrap.Modal.getInstance(document.getElementById('modalNuevoPedido')).hide();
            document.getElementById('formNuevoPedido').reset();
            await this.refrescarDatosSilencioso();
        } catch (error) {
            console.error('Error guardar pedido:', error);
            ToastSystem.error('Error', 'No se pudo guardar el pedido');
        }
    },

    async abrirModalEditarPedido(id) {
        try {
            const { data, error } = await supabaseClient.from('pedidos').select('*').eq('id', id).single();
            if (error) throw error;
            document.getElementById('editar_pedido_id').textContent = id;
            document.getElementById('editar_pedido_id_hidden').value = id;
            document.getElementById('editar_pedido_estado').value = data.estado || 'cotizando';
            document.getElementById('editar_pedido_prioridad').value = data.prioridad || 'normal';
            document.getElementById('editar_pedido_observaciones').value = data.observaciones || '';
            new bootstrap.Modal(document.getElementById('modalEditarPedido')).show();
        } catch (error) {
            console.error('Error cargar pedido:', error);
            ToastSystem.error('Error', 'No se pudo cargar el pedido');
        }
    },

    async guardarEditarPedido() {
        const id = parseInt(document.getElementById('editar_pedido_id_hidden').value);
        try {
            const { error } = await supabaseClient.from('pedidos').update({
                estado: document.getElementById('editar_pedido_estado').value,
                prioridad: document.getElementById('editar_pedido_prioridad').value,
                observaciones: document.getElementById('editar_pedido_observaciones').value.trim() || null
            }).eq('id', id);
            if (error) throw error;
            ToastSystem.success('✅ Pedido actualizado', `Pedido #${id} actualizado correctamente`);
            bootstrap.Modal.getInstance(document.getElementById('modalEditarPedido')).hide();
            await this.refrescarDatosSilencioso();
        } catch (error) {
            console.error('Error actualizar pedido:', error);
            ToastSystem.error('Error', 'No se pudo actualizar el pedido');
        }
    },

    async completarPedido(id) {
        if (!confirm(`¿Marcar pedido #${id} como completado?`)) return;
        try {
            const { error } = await supabaseClient.from('pedidos').update({ estado: 'entregado' }).eq('id', id);
            if (error) throw error;
            ToastSystem.success('✅ Pedido completado', `Pedido #${id} marcado como entregado`);
            await this.refrescarDatosSilencioso();
        } catch (error) {
            console.error('Error completar pedido:', error);
            ToastSystem.error('Error', 'No se pudo completar el pedido');
        }
    },

    async eliminarPedido(id) {
        if (!confirm(`¿Cancelar pedido #${id}?`)) return;
        try {
            const { error } = await supabaseClient.from('pedidos').update({ estado: 'cancelado' }).eq('id', id);
            if (error) throw error;
            ToastSystem.success('✅ Pedido cancelado', `Pedido #${id} cancelado`);
            await this.refrescarDatosSilencioso();
        } catch (error) {
            console.error('Error cancelar pedido:', error);
            ToastSystem.error('Error', 'No se pudo cancelar el pedido');
        }
    },

    verPedido(id) { this.verPedidoDetalle(id); },

    abrirModalNuevoPedido() { this.cargarClientes(); this.cargarProductos(); new bootstrap.Modal(document.getElementById('modalNuevoPedido')).show(); },
    abrirModalClientes() { new bootstrap.Modal(document.getElementById('modalClientes')).show(); this.cargarClientes(); },
    abrirModalNuevoCliente() { new bootstrap.Modal(document.getElementById('modalNuevoCliente')).show(); },
    abrirModalProductos() { new bootstrap.Modal(document.getElementById('modalProductos')).show(); this.cargarProductos(); },
    abrirModalNuevoProducto() { new bootstrap.Modal(document.getElementById('modalNuevoProducto')).show(); },
    mostrarNotificaciones() {
        const urgentes = parseInt(document.getElementById('kpi-urgentes').textContent) || 0;
        if (urgentes > 0) ToastSystem.warning('📢 Notificaciones', `Tienes ${urgentes} pedido(s) urgente(s) pendiente(s)`);
        else ToastSystem.success('✅ Sin notificaciones', 'No hay pedidos urgentes pendientes');
    },

    destroy() {
        if (STATE.refreshInterval) { clearInterval(STATE.refreshInterval); STATE.refreshInterval = null; }
        if (STATE.realtimeChannel) { supabaseClient.removeChannel(STATE.realtimeChannel); STATE.realtimeChannel = null; }
        console.log('🧹 Aplicación destruida correctamente');
    }
};

window.App = App;
window.abrirModalNuevoPedido = () => App.abrirModalNuevoPedido();
window.abrirModalClientes = () => App.abrirModalClientes();
window.abrirModalNuevoCliente = () => App.abrirModalNuevoCliente();
window.abrirModalProductos = () => App.abrirModalProductos();
window.abrirModalNuevoProducto = () => App.abrirModalNuevoProducto();
window.refrescarDatos = () => App.refrescarDatos();
window.mostrarNotificaciones = () => App.mostrarNotificaciones();
window.guardarNuevoCliente = () => App.guardarNuevoCliente();
window.guardarNuevoProducto = () => App.guardarNuevoProducto();
window.guardarNuevoPedido = () => App.guardarNuevoPedido();
window.guardarEditarPedido = () => App.guardarEditarPedido();
window.completarPedido = (id) => App.completarPedido(id);
window.eliminarPedido = (id) => App.eliminarPedido(id);
window.verPedido = (id) => App.verPedido(id);
window.verPedidoDetalle = (id) => App.verPedidoDetalle(id);
window.eliminarCliente = (id) => App.eliminarCliente(id);
window.eliminarProducto = (id) => App.eliminarProducto(id);
window.reintentar = () => App.reintentar();
window.calcularEficienciaTodos = () => App.calcularEficienciaTodos();
window.toggleAccordion = (id) => App.toggleAccordion?.(id);
window.toggleCalendar = () => App.toggleCalendar?.();
window.closeCalendar = () => App.closeCalendar?.();
window.calendarNavigate = (delta) => App.calendarNavigate?.(delta);
window.calendarGoToday = () => App.calendarGoToday?.();
window.selectDate = (year, month, day) => App.selectDate?.(year, month, day);
window.suscribirRealtime = () => App.suscribirRealtime();
window.cargarEmpleadosYTareas = () => App.cargarEmpleadosYTareas();
window.abrirModalEmpleado = (id) => App.abrirModalEmpleado(id);
window.calcularEficienciaEmpleado = (id) => App.calcularEficienciaEmpleado(id);
window.actualizarStatusTarea = (tareaId, nuevoStatus, empleadoId) => App.actualizarStatusTarea(tareaId, nuevoStatus, empleadoId);

document.addEventListener('DOMContentLoaded', () => { App.init(); });
window.addEventListener('beforeunload', () => { App.destroy(); });
console.log('✅ Dashboard INVEMEX v6.0.1 cargado correctamente');
