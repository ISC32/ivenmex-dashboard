/* ==========================================
   IVENMEX - PANEL ADMIN OCULTO
   v3.0 - Con cotizaciones, facturas y deudas
   ========================================== */

(function () {
    'use strict';

    // ==========================================
    // CONFIGURACIÓN
    // ==========================================
    const ADMIN_CONFIG = {
        PASSWORD_HASH: 'ivenmex2024',
        SESSION_KEY: 'ivx_admin_session',
        SESSION_DURATION: 2 * 60 * 60 * 1000,
        N8N_WEBHOOK_URL: 'https://n8n.aguasdguanipa.com/webhook/admin-chat',
        IA_TIMEOUT: 90000
    };

    // ==========================================
    // ESTADO
    // ==========================================
    const AdminState = {
        isAuthenticated: false,
        currentView: 'dashboard',
        clickCount: 0,
        clickTimer: null
    };

    const IAState = {
        conversations: [],
        activeConvId: null,
        isSearchOpen: false,
        isCompact: false,
        isConvsOpen: false,
        isSending: false,
        startTime: null,
        storageKey: 'ivx_ia_conversations',
        _listenersSet: false
    };

    // ==========================================
    // HELPERS
    // ==========================================
    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function formatCurrency(amount) {
        const num = sanitizeNumber(amount);
        return '$' + num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatDate(dateStr) {
        if (!dateStr) return '-';
        try {
            return new Date(dateStr).toLocaleDateString('es-ES', {
                year: 'numeric', month: 'short', day: 'numeric'
            });
        } catch { return '-'; }
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function sanitizeNumber(valor, defecto = 0) {
        const num = parseFloat(valor);
        if (isNaN(num) || num < 0) return defecto;
        return num;
    }

    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `admin-toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(40px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ==========================================
    // SESIÓN
    // ==========================================
    function saveSession() {
        try {
            sessionStorage.setItem(ADMIN_CONFIG.SESSION_KEY, JSON.stringify({
                timestamp: Date.now(),
                expires: Date.now() + ADMIN_CONFIG.SESSION_DURATION
            }));
        } catch (e) {}
    }

    function checkSession() {
        try {
            const raw = sessionStorage.getItem(ADMIN_CONFIG.SESSION_KEY);
            if (!raw) return false;
            const session = JSON.parse(raw);
            if (Date.now() > session.expires) {
                sessionStorage.removeItem(ADMIN_CONFIG.SESSION_KEY);
                return false;
            }
            return true;
        } catch { return false; }
    }

    function clearSession() {
        try { sessionStorage.removeItem(ADMIN_CONFIG.SESSION_KEY); } catch (e) {}
        AdminState.isAuthenticated = false;
    }

    // ==========================================
    // TRIGGER SECRETO
    // ==========================================
    function setupSecretTrigger() {
        const logo = document.querySelector('.md-toolbar-brand');
        if (!logo) return;

        logo.style.cursor = 'pointer';
        logo.addEventListener('click', (e) => {
            e.preventDefault();
            AdminState.clickCount++;
            clearTimeout(AdminState.clickTimer);
            AdminState.clickTimer = setTimeout(() => { AdminState.clickCount = 0; }, 1500);
            if (AdminState.clickCount >= 5) {
                AdminState.clickCount = 0;
                openLogin();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'A') {
                e.preventDefault();
                openLogin();
            }
        });
    }

    // ==========================================
    // LOGIN
    // ==========================================
    function openLogin() {
        if (checkSession()) {
            AdminState.isAuthenticated = true;
            openAdminPanel();
            return;
        }
        const overlay = document.getElementById('adminLoginOverlay');
        if (overlay) {
            overlay.classList.add('active');
            setTimeout(() => document.getElementById('adminPasswordInput')?.focus(), 100);
        }
    }

    function closeLogin() {
        const overlay = document.getElementById('adminLoginOverlay');
        if (overlay) {
            overlay.classList.remove('active');
            const input = document.getElementById('adminPasswordInput');
            if (input) input.value = '';
            const err = document.getElementById('adminLoginError');
            if (err) err.textContent = '';
        }
    }

    function attemptLogin() {
        const input = document.getElementById('adminPasswordInput');
        const error = document.getElementById('adminLoginError');
        if (!input || !error) return;

        if (input.value.trim() === ADMIN_CONFIG.PASSWORD_HASH) {
            AdminState.isAuthenticated = true;
            saveSession();
            error.textContent = '';
            closeLogin();
            openAdminPanel();
            showToast('✅ Acceso concedido', 'success');
        } else {
            error.textContent = '❌ Contraseña incorrecta';
            input.value = '';
            input.focus();
            input.style.borderColor = '#EF4444';
            setTimeout(() => { input.style.borderColor = ''; }, 1000);
        }
    }

    // ==========================================
    // PANEL
    // ==========================================
    function openAdminPanel() {
        const panel = document.getElementById('adminPanel');
        if (!panel) return;
        panel.classList.add('active');
        document.body.style.overflow = 'hidden';
        switchView('dashboard');
    }

    function closeAdminPanel() {
        const panel = document.getElementById('adminPanel');
        if (panel) panel.classList.remove('active');
        document.body.style.overflow = '';
    }

    function logout() {
        clearSession();
        closeAdminPanel();
        showToast('👋 Sesión cerrada', 'success');
    }

    function switchView(viewName) {
        AdminState.currentView = viewName;
        document.querySelectorAll('.admin-nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.view === viewName);
        });
        document.querySelectorAll('.admin-view').forEach(view => {
            view.classList.toggle('active', view.id === `adminView-${viewName}`);
        });

        switch (viewName) {
            case 'dashboard':    loadDashboardStats(); break;
            case 'clientes':     loadClientes();       break;
            case 'pedidos':      loadPedidos();        break;
            case 'ventas':       loadVentas();         break;
            case 'productos':    loadProductos();      break;
            case 'inventario':   loadInventario();     break;
            case 'cotizaciones': loadCotizaciones();   break;
            case 'facturas':     loadFacturas();       break;
            case 'deudas':       loadDeudas();         break;
            case 'ia':           initIA();             break;
        }
    }

    // ==========================================
    // SUPABASE
    // ==========================================
    function getSupabase() {
        if (!window.supabaseClient) {
            throw new Error('Cliente Supabase no inicializado. Recarga la página.');
        }
        return window.supabaseClient;
    }

    // ==========================================
    // DASHBOARD STATS
    // ==========================================
    async function loadDashboardStats() {
        try {
            const sb = getSupabase();
            const [clientesRes, pedidosRes, ventasRes, productosRes, deudasRes] = await Promise.all([
                sb.from('clientes').select('*', { count: 'exact', head: true }),
                sb.from('pedidos').select('*', { count: 'exact', head: true }),
                sb.from('pagos').select('monto'),
                sb.from('productos').select('*', { count: 'exact', head: true }),
                sb.from('deudas_clientes').select('saldo_usd').neq('estado', 'anulada')
            ]);

            const totalVentas = (ventasRes.data || []).reduce((sum, p) => sum + sanitizeNumber(p.monto), 0);
            const deudaTotal = (deudasRes.data || []).reduce((sum, d) => sum + sanitizeNumber(d.saldo_usd), 0);

            setText('adminStatClientes', clientesRes.count || 0);
            setText('adminStatPedidos', pedidosRes.count || 0);
            setText('adminStatProductos', productosRes.count || 0);
            setText('adminStatVentas', formatCurrency(totalVentas));

            const { data: pedidosData } = await sb.from('pedidos').select('estado, prioridad');
            const activos = (pedidosData || []).filter(p =>
                p.estado !== 'entregado' && p.estado !== 'cancelado'
            ).length;
            const urgentes = (pedidosData || []).filter(p =>
                p.prioridad === 'urgente' && p.estado !== 'entregado' && p.estado !== 'cancelado'
            ).length;

            setText('adminStatActivos', activos);
            setText('adminStatUrgentes', urgentes);
        } catch (error) {
            console.error('Error stats:', error);
            showToast('Error al cargar estadísticas', 'error');
        }
    }

    // ==========================================
    // CLIENTES
    // ==========================================
    async function loadClientes() {
        try {
            const { data, error } = await getSupabase()
                .from('clientes').select('*')
                .order('created_at', { ascending: false }).limit(500);
            if (error) throw error;

            const tbody = document.getElementById('adminTablaClientes');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="admin-table-empty"><i class="fas fa-users"></i>No hay clientes</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(c => `
                <tr>
                    <td><strong>#${c.id}</strong></td>
                    <td>${escapeHtml(c.nombre || '-')}</td>
                    <td>${escapeHtml(c.telefono || '-')}</td>
                    <td>${escapeHtml(c.email || '-')}</td>
                    <td>${escapeHtml(c.direccion || '-')}</td>
                    <td>${formatDate(c.created_at)}</td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('Error clientes:', error);
            showToast('Error al cargar clientes', 'error');
        }
    }

    // ==========================================
    // PEDIDOS
    // ==========================================
    async function loadPedidos() {
        try {
            const { data, error } = await getSupabase()
                .from('pedidos')
                .select(`id, estado, prioridad, total, anticipo, fecha_solicitud,
                         fecha_entrega_prometida, clientes (nombre),
                         detalles_pedido (cantidad, productos (nombre))`)
                .order('fecha_solicitud', { ascending: false }).limit(200);
            if (error) throw error;

            const tbody = document.getElementById('adminTablaPedidos');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="admin-table-empty"><i class="fas fa-clipboard-list"></i>No hay pedidos</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(p => {
                const producto = p.detalles_pedido?.[0]?.productos?.nombre || '-';
                return `
                    <tr>
                        <td><strong>#${p.id}</strong></td>
                        <td>${escapeHtml(p.clientes?.nombre || 'Sin cliente')}</td>
                        <td>${escapeHtml(producto)}</td>
                        <td>${formatCurrency(p.total)}</td>
                        <td>${formatCurrency(p.anticipo)}</td>
                        <td><span class="md-badge ${getEstadoClass(p.estado)}">${getEstadoLabel(p.estado)}</span></td>
                        <td><span class="md-badge ${p.prioridad === 'urgente' ? 'danger' : 'default'}">${escapeHtml(p.prioridad || 'normal')}</span></td>
                        <td>${formatDate(p.fecha_entrega_prometida)}</td>
                    </tr>
                `;
            }).join('');
        } catch (error) {
            console.error('Error pedidos:', error);
            showToast('Error al cargar pedidos', 'error');
        }
    }

    // ==========================================
    // VENTAS
    // ==========================================
    async function loadVentas() {
        try {
            const { data, error } = await getSupabase()
                .from('pagos')
                .select(`id, monto, metodo_pago, fecha_pago, referencia, observaciones,
                         pedidos (id, clientes (nombre))`)
                .order('fecha_pago', { ascending: false }).limit(200);
            if (error) throw error;

            const tbody = document.getElementById('adminTablaVentas');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="admin-table-empty"><i class="fas fa-dollar-sign"></i>No hay ventas</td></tr>';
                setText('adminVentasTotal', formatCurrency(0));
                return;
            }
            tbody.innerHTML = data.map(v => `
                <tr>
                    <td><strong>#${v.id}</strong></td>
                    <td>#${v.pedidos?.id || '-'}</td>
                    <td>${escapeHtml(v.pedidos?.clientes?.nombre || 'Sin cliente')}</td>
                    <td><strong style="color: var(--md-success);">${formatCurrency(v.monto)}</strong></td>
                    <td>${escapeHtml(v.metodo_pago || '-')}</td>
                    <td>${formatDate(v.fecha_pago)}</td>
                </tr>
            `).join('');
            const total = data.reduce((sum, v) => sum + sanitizeNumber(v.monto), 0);
            setText('adminVentasTotal', formatCurrency(total));
        } catch (error) {
            console.error('Error ventas:', error);
            showToast('Error al cargar ventas', 'error');
        }
    }

    // ==========================================
    // PRODUCTOS
    // ==========================================
    async function loadProductos() {
        try {
            const { data, error } = await getSupabase()
                .from('productos').select('*')
                .order('nombre').limit(500);
            if (error) throw error;

            const tbody = document.getElementById('adminTablaProductos');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="admin-table-empty"><i class="fas fa-box"></i>No hay productos</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(p => {
                const precio = p.precio_por_m2
                    ? formatCurrency(p.precio_por_m2) + '/m²'
                    : formatCurrency(p.precio_unitario);
                return `
                    <tr>
                        <td><strong>#${p.id}</strong></td>
                        <td>${escapeHtml(p.nombre || '-')}</td>
                        <td>${escapeHtml(p.categoria || '-')}</td>
                        <td>${escapeHtml(p.material || '-')}</td>
                        <td>${precio}</td>
                        <td>${p.activo ? '<span class="md-badge success">Activo</span>' : '<span class="md-badge default">Inactivo</span>'}</td>
                    </tr>
                `;
            }).join('');
        } catch (error) {
            console.error('Error productos:', error);
            showToast('Error al cargar productos', 'error');
        }
    }

    // ==========================================
    // INVENTARIO
    // ==========================================
    async function loadInventario() {
        try {
            const { data, error } = await getSupabase()
                .from('inventario_materiales').select('*')
                .order('nombre').limit(500);
            if (error) throw error;

            const tbody = document.getElementById('adminTablaInventario');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="admin-table-empty"><i class="fas fa-warehouse"></i>No hay materiales</td></tr>';
                return;
            }
            tbody.innerHTML = data.map(m => {
                const stockActual = Math.max(0, parseFloat(m.stock_actual) || 0);
                const stockMinimo = Math.max(0, parseFloat(m.stock_minimo) || 0);
                let estadoBadge;
                if (stockActual === 0) {
                    estadoBadge = '<span class="md-badge danger"><i class="fas fa-times-circle"></i> No hay</span>';
                } else if (stockActual <= 5) {
                    estadoBadge = '<span class="md-badge warning"><i class="fas fa-exclamation-triangle"></i> Bajo</span>';
                } else {
                    estadoBadge = '<span class="md-badge success"><i class="fas fa-check-circle"></i> OK</span>';
                }
                return `
                    <tr>
                        <td><strong>#${m.id}</strong></td>
                        <td>${escapeHtml(m.nombre || '-')}</td>
                        <td>${escapeHtml(m.tipo || '-')}</td>
                        <td>${stockActual} ${escapeHtml(m.unidad_medida || '')}</td>
                        <td>${stockMinimo} ${escapeHtml(m.unidad_medida || '')}</td>
                        <td>${estadoBadge}</td>
                    </tr>
                `;
            }).join('');
        } catch (error) {
            console.error('Error inventario:', error);
            showToast('Error al cargar inventario', 'error');
        }
    }

    // ==========================================
    // COTIZACIONES
    // ==========================================
    async function loadCotizaciones() {
        try {
            const sb = getSupabase();
            console.log('📄 Cargando cotizaciones...');

            const { data, error } = await sb
                .from('cotizaciones')
                .select(`
                    id, numero, fecha_emision, total_usd, total_bs, estado,
                    archivo_pdf_url, archivo_docx_url,
                    clientes (nombre)
                `)
                .order('fecha_emision', { ascending: false })
                .limit(200);

            if (error) throw error;
            console.log(`✅ ${data?.length || 0} cotizaciones`);

            const tbody = document.getElementById('adminTablaCotizaciones');
            if (!tbody) return;

            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="admin-table-empty"><i class="fas fa-file-invoice-dollar"></i>No hay cotizaciones</td></tr>';
                return;
            }

            tbody.innerHTML = data.map(c => `
                <tr>
                    <td><strong>${escapeHtml(c.numero)}</strong></td>
                    <td>${escapeHtml(c.clientes?.nombre || 'Sin cliente')}</td>
                    <td>${formatDate(c.fecha_emision)}</td>
                    <td><strong>${formatCurrency(c.total_usd)}</strong></td>
                    <td>Bs ${parseFloat(c.total_bs || 0).toFixed(2)}</td>
                    <td><span class="cotizacion-estado-badge ${c.estado || 'emitida'}">${c.estado || 'emitida'}</span></td>
                    <td>
                        ${c.archivo_pdf_url
                            ? `<a href="${c.archivo_pdf_url}" target="_blank" class="file-action-btn pdf" title="Ver PDF"><i class="fas fa-file-pdf"></i></a>`
                            : '<span style="color:#9CA3AF;">-</span>'}
                    </td>
                    <td>
                        ${c.archivo_docx_url
                            ? `<a href="${c.archivo_docx_url}" target="_blank" class="file-action-btn docx" title="Descargar DOCX"><i class="fas fa-file-word"></i></a>`
                            : '<span style="color:#9CA3AF;">-</span>'}
                    </td>
                </tr>
            `).join('');

            // Buscador
            const buscador = document.getElementById('cotizaciones-buscar');
            if (buscador && !buscador.dataset.listener) {
                buscador.dataset.listener = 'true';
                buscador.addEventListener('input', (e) => {
                    const q = e.target.value.toLowerCase();
                    tbody.querySelectorAll('tr').forEach(tr => {
                        tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
                    });
                });
            }
        } catch (error) {
            console.error('❌ Error cotizaciones:', error);
            const tbody = document.getElementById('adminTablaCotizaciones');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="8" class="admin-table-empty" style="color:#EF4444;">
                    <i class="fas fa-exclamation-circle"></i>Error: ${escapeHtml(error.message)}
                </td></tr>`;
            }
            showToast('Error al cargar cotizaciones', 'error');
        }
    }

    // ==========================================
    // FACTURAS INTERNAS
    // ==========================================
    async function loadFacturas() {
        try {
            const sb = getSupabase();
            console.log('🧾 Cargando facturas internas...');

            const { data, error } = await sb
                .from('facturas_internas')
                .select(`
                    id, numero, fecha_emision, tipo, total_usd, metodo_pago,
                    clientes (nombre),
                    pedidos (id)
                `)
                .order('fecha_emision', { ascending: false })
                .limit(200);

            if (error) throw error;
            console.log(`✅ ${data?.length || 0} facturas internas`);

            const tbody = document.getElementById('adminTablaFacturas');
            if (!tbody) return;

            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="admin-table-empty"><i class="fas fa-receipt"></i>No hay facturas registradas</td></tr>';
                return;
            }

            tbody.innerHTML = data.map(f => `
                <tr>
                    <td><strong>${escapeHtml(f.numero)}</strong></td>
                    <td>${escapeHtml(f.clientes?.nombre || '-')}</td>
                    <td>${f.pedidos?.id ? `#${f.pedidos.id}` : '-'}</td>
                    <td><span class="md-badge default">${escapeHtml(f.tipo || 'venta')}</span></td>
                    <td><strong>${formatCurrency(f.total_usd)}</strong></td>
                    <td>${escapeHtml(f.metodo_pago || '-')}</td>
                    <td>${formatDate(f.fecha_emision)}</td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('❌ Error facturas:', error);
            const tbody = document.getElementById('adminTablaFacturas');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="7" class="admin-table-empty" style="color:#EF4444;">
                    <i class="fas fa-exclamation-circle"></i>Error: ${escapeHtml(error.message)}
                </td></tr>`;
            }
            showToast('Error al cargar facturas', 'error');
        }
    }

    // ==========================================
    // DEUDAS
    // ==========================================
    async function loadDeudas() {
        try {
            const sb = getSupabase();
            console.log('💰 Cargando deudas...');

            const periodo = document.getElementById('deudas-filtro-periodo')?.value || 'todo';

            let diasFiltro = null;
            if (periodo === 'semana') diasFiltro = 7;
            else if (periodo === 'mes') diasFiltro = 30;
            else if (periodo === 'trimestre') diasFiltro = 90;
            else if (periodo === 'año') diasFiltro = 365;

            let query = sb.from('deudas_clientes')
                .select(`
                    id, monto_total_usd, monto_pagado_usd, saldo_usd, fecha_deuda,
                    fecha_vencimiento, estado, concepto, notas,
                    clientes (id, nombre, telefono)
                `)
                .neq('estado', 'anulada')
                .order('fecha_deuda', { ascending: false });

            if (diasFiltro) {
                const fechaLimite = new Date();
                fechaLimite.setDate(fechaLimite.getDate() - diasFiltro);
                query = query.gte('fecha_deuda', fechaLimite.toISOString().split('T')[0]);
            }

            const { data, error } = await query;
            if (error) throw error;
            console.log(`✅ ${data?.length || 0} deudas`);

            // Agrupar por cliente
            const porCliente = {};
            (data || []).forEach(d => {
                const clienteId = d.clientes?.id || 0;
                if (!porCliente[clienteId]) {
                    porCliente[clienteId] = {
                        id: clienteId,
                        nombre: d.clientes?.nombre || 'Sin cliente',
                        telefono: d.clientes?.telefono || '-',
                        deudas: 0,
                        total: 0,
                        pagado: 0,
                        pendiente: 0,
                        vencido: 0
                    };
                }
                const c = porCliente[clienteId];
                c.deudas++;
                c.total += parseFloat(d.monto_total_usd) || 0;
                c.pagado += parseFloat(d.monto_pagado_usd) || 0;
                c.pendiente += parseFloat(d.saldo_usd) || 0;
                if (d.fecha_vencimiento && new Date(d.fecha_vencimiento) < new Date() && d.estado !== 'pagada') {
                    c.vencido += parseFloat(d.saldo_usd) || 0;
                }
            });

            const deudaTotal = Object.values(porCliente).reduce((s, c) => s + c.pendiente, 0);
            const deudaVencida = Object.values(porCliente).reduce((s, c) => s + c.vencido, 0);
            const cobrado = Object.values(porCliente).reduce((s, c) => s + c.pagado, 0);
            const clientesConDeuda = Object.values(porCliente).filter(c => c.pendiente > 0).length;

            setText('adminDeudaTotal', formatCurrency(deudaTotal));
            setText('adminDeudaVencida', formatCurrency(deudaVencida));
            setText('adminClientesDeuda', clientesConDeuda);
            setText('adminCobrado', formatCurrency(cobrado));

            const tbody = document.getElementById('adminTablaDeudas');
            if (!tbody) return;

            const clientesArray = Object.values(porCliente)
                .filter(c => c.pendiente > 0)
                .sort((a, b) => b.pendiente - a.pendiente);

            if (clientesArray.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="admin-table-empty"><i class="fas fa-check-circle"></i>No hay deudas pendientes</td></tr>';
                return;
            }

            tbody.innerHTML = clientesArray.map(c => `
                <tr>
                    <td><strong>${escapeHtml(c.nombre)}</strong></td>
                    <td>${escapeHtml(c.telefono)}</td>
                    <td><span class="md-badge default">${c.deudas}</span></td>
                    <td>${formatCurrency(c.total)}</td>
                    <td style="color:#22C55E;font-weight:700;">${formatCurrency(c.pagado)}</td>
                    <td style="color:#EF4444;font-weight:700;">${formatCurrency(c.pendiente)}</td>
                    <td>${c.vencido > 0 ? `<span class="md-badge danger">${formatCurrency(c.vencido)}</span>` : '<span style="color:#22C55E;">-</span>'}</td>
                    <td>
                        <button class="md-btn md-btn-text md-btn-sm" onclick="AdminPanel.verDetalleDeudas(${c.id})" title="Ver detalle">
                            <i class="fas fa-eye"></i>
                        </button>
                        <button class="md-btn md-btn-text md-btn-sm" onclick="AdminPanel.abrirModalAbono(${c.id})" title="Registrar abono">
                            <i class="fas fa-dollar-sign" style="color:#22C55E;"></i>
                        </button>
                    </td>
                </tr>
            `).join('');

            // Listener del filtro
            const filtro = document.getElementById('deudas-filtro-periodo');
            if (filtro && !filtro.dataset.listener) {
                filtro.dataset.listener = 'true';
                filtro.addEventListener('change', loadDeudas);
            }
        } catch (error) {
            console.error('❌ Error deudas:', error);
            const tbody = document.getElementById('adminTablaDeudas');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="8" class="admin-table-empty" style="color:#EF4444;">
                    <i class="fas fa-exclamation-circle"></i>Error: ${escapeHtml(error.message)}
                </td></tr>`;
            }
            showToast('Error al cargar deudas', 'error');
        }
    }

    // ==========================================
    // HELPERS DE ESTADO
    // ==========================================
    function getEstadoClass(estado) {
        const map = {
            urgente: 'danger', en_produccion: 'warning', diseño: 'primary',
            control_calidad: 'default', cotizando: 'default', listo: 'success',
            entregado: 'success', cancelado: 'default'
        };
        return map[estado] || 'default';
    }

    function getEstadoLabel(estado) {
        const map = {
            cotizando: 'Cotizando', diseño: 'En Diseño', en_produccion: 'Producción',
            control_calidad: 'Control de Calidad', listo: 'Listo',
            entregado: 'Entregado', cancelado: 'Cancelado'
        };
        return map[estado] || estado || '-';
    }

    // ==========================================
    // MODALES: NUEVA DEUDA / ABONO / FACTURA
    // ==========================================
    function abrirModalNuevaDeuda() {
        cargarClientesEnSelect('deuda_cliente');
        const modal = new bootstrap.Modal(document.getElementById('modalNuevaDeuda'));
        modal.show();
    }

    async function guardarNuevaDeuda() {
        const clienteId = document.getElementById('deuda_cliente')?.value;
        const concepto = document.getElementById('deuda_concepto')?.value.trim();
        const monto = parseFloat(document.getElementById('deuda_monto')?.value) || 0;
        const vencimiento = document.getElementById('deuda_vencimiento')?.value || null;
        const notas = document.getElementById('deuda_notas')?.value.trim() || null;

        if (!clienteId || !concepto || monto <= 0) {
            showToast('Completa cliente, concepto y monto', 'error');
            return;
        }

        try {
            const sb = getSupabase();
            const { error } = await sb.from('deudas_clientes').insert({
                cliente_id: parseInt(clienteId),
                concepto,
                monto_total_usd: monto,
                monto_pagado_usd: 0,
                saldo_usd: monto,
                fecha_vencimiento: vencimiento,
                notas,
                estado: 'pendiente'
            });

            if (error) throw error;

            showToast('✅ Deuda registrada', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalNuevaDeuda'))?.hide();
            document.getElementById('formNuevaDeuda')?.reset();
            loadDeudas();
            loadDashboardStats();
        } catch (error) {
            console.error('Error nueva deuda:', error);
            showToast('Error: ' + error.message, 'error');
        }
    }

    async function abrirModalAbono(clienteId) {
        const sb = getSupabase();
        const { data: cliente } = await sb.from('clientes').select('nombre').eq('id', clienteId).single();
        const { data: deudas } = await sb.from('deudas_clientes')
            .select('id, concepto, saldo_usd')
            .eq('cliente_id', clienteId)
            .neq('estado', 'pagada')
            .neq('estado', 'anulada');

        document.getElementById('abono_cliente_nombre').value = cliente?.nombre || '';
        document.getElementById('abono_cliente_id').value = clienteId;

        const selectDeuda = document.getElementById('abono_deuda_id');
        if (selectDeuda) {
            selectDeuda.innerHTML = '<option value="">Seleccionar deuda...</option>' +
                (deudas || []).map(d => `<option value="${d.id}">${d.concepto} - Saldo: $${parseFloat(d.saldo_usd).toFixed(2)}</option>`).join('');
        }

        const modal = new bootstrap.Modal(document.getElementById('modalAbonoDeuda'));
        modal.show();
    }

    async function guardarAbono() {
        const deudaId = document.getElementById('abono_deuda_id')?.value;
        const monto = parseFloat(document.getElementById('abono_monto')?.value) || 0;
        const metodo = document.getElementById('abono_metodo')?.value || 'divisa';
        const referencia = document.getElementById('abono_referencia')?.value.trim() || null;

        if (!deudaId || monto <= 0) {
            showToast('Selecciona una deuda y un monto válido', 'error');
            return;
        }

        try {
            const sb = getSupabase();
            const { error } = await sb.from('abonos_deudas').insert({
                deuda_id: parseInt(deudaId),
                monto_usd: monto,
                metodo_pago: metodo,
                referencia
            });

            if (error) throw error;

            showToast('✅ Abono registrado', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalAbonoDeuda'))?.hide();
            document.getElementById('formAbonoDeuda')?.reset();
            loadDeudas();
        } catch (error) {
            console.error('Error abono:', error);
            showToast('Error: ' + error.message, 'error');
        }
    }

    async function verDetalleDeudas(clienteId) {
        const modalBody = document.getElementById('modalDetalleDeudasBody');
        if (modalBody) {
            modalBody.innerHTML = '<div style="text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin" style="font-size:32px; color: var(--md-primary);"></i><p>Cargando...</p></div>';
        }

        const modal = new bootstrap.Modal(document.getElementById('modalDetalleDeudas'));
        modal.show();

        try {
            const sb = getSupabase();
            const { data: cliente } = await sb.from('clientes').select('*').eq('id', clienteId).single();
            const { data: deudas } = await sb.from('deudas_clientes')
                .select('*')
                .eq('cliente_id', clienteId)
                .neq('estado', 'anulada')
                .order('fecha_deuda', { ascending: false });

            const total = (deudas || []).reduce((s, d) => s + parseFloat(d.monto_total_usd || 0), 0);
            const pagado = (deudas || []).reduce((s, d) => s + parseFloat(d.monto_pagado_usd || 0), 0);
            const pendiente = (deudas || []).reduce((s, d) => s + parseFloat(d.saldo_usd || 0), 0);
            const vencido = (deudas || []).filter(d => d.fecha_vencimiento && new Date(d.fecha_vencimiento) < new Date() && d.estado !== 'pagada')
                .reduce((s, d) => s + parseFloat(d.saldo_usd || 0), 0);

            const filas = (deudas || []).map(d => `
                <tr>
                    <td>${formatDate(d.fecha_deuda)}</td>
                    <td>${escapeHtml(d.concepto || '-')}</td>
                    <td>${formatCurrency(d.monto_total_usd)}</td>
                    <td style="color:#22C55E;font-weight:700;">${formatCurrency(d.monto_pagado_usd)}</td>
                    <td style="color:#EF4444;font-weight:700;">${formatCurrency(d.saldo_usd)}</td>
                    <td>${formatDate(d.fecha_vencimiento)}</td>
                    <td><span class="md-badge ${d.estado === 'pagada' ? 'success' : d.estado === 'vencida' ? 'danger' : 'warning'}">${d.estado}</span></td>
                </tr>
            `).join('');

            modalBody.innerHTML = `
                <div class="deuda-detalle-header">
                    <h3>${escapeHtml(cliente?.nombre || 'Cliente')}</h3>
                    <p>${cliente?.telefono ? '📞 ' + escapeHtml(cliente.telefono) : ''} ${cliente?.email ? ' · ✉️ ' + escapeHtml(cliente.email) : ''}</p>
                </div>

                <div class="deuda-detalle-stats">
                    <div class="deuda-detalle-stat">
                        <div class="label">Total Facturado</div>
                        <div class="value">${formatCurrency(total)}</div>
                    </div>
                    <div class="deuda-detalle-stat">
                        <div class="label">Total Pagado</div>
                        <div class="value success">${formatCurrency(pagado)}</div>
                    </div>
                    <div class="deuda-detalle-stat">
                        <div class="label">Saldo Pendiente</div>
                        <div class="value danger">${formatCurrency(pendiente)}</div>
                    </div>
                    <div class="deuda-detalle-stat">
                        <div class="label">Vencido</div>
                        <div class="value warning">${formatCurrency(vencido)}</div>
                    </div>
                </div>

                <div class="table-responsive">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Concepto</th>
                                <th>Total</th>
                                <th>Pagado</th>
                                <th>Saldo</th>
                                <th>Vence</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>${filas || '<tr><td colspan="7" class="admin-table-empty">Sin deudas</td></tr>'}</tbody>
                    </table>
                </div>
            `;
        } catch (error) {
            console.error('Error detalle deudas:', error);
            modalBody.innerHTML = '<p style="color:#EF4444;text-align:center;">Error al cargar</p>';
        }
    }

    // ==========================================
    // NUEVA FACTURA INTERNA
    // ==========================================
    function abrirModalNuevaFactura() {
        cargarClientesEnSelect('factura_cliente');
        const modal = new bootstrap.Modal(document.getElementById('modalNuevaFactura'));
        modal.show();
    }

    async function guardarNuevaFactura() {
        const clienteId = document.getElementById('factura_cliente')?.value || null;
        const tipo = document.getElementById('factura_tipo')?.value || 'venta';
        const categoria = document.getElementById('factura_categoria')?.value.trim() || null;
        const descripcion = document.getElementById('factura_descripcion')?.value.trim() || null;
        const total = parseFloat(document.getElementById('factura_total')?.value) || 0;
        const metodo = document.getElementById('factura_metodo')?.value || 'divisa';

        if (total <= 0) {
            showToast('Ingresa un total válido', 'error');
            return;
        }

        try {
            const sb = getSupabase();
            const { error } = await sb.from('facturas_internas').insert({
                cliente_id: clienteId ? parseInt(clienteId) : null,
                tipo,
                categoria,
                descripcion,
                subtotal_usd: total,
                total_usd: total,
                metodo_pago: metodo
            });

            if (error) throw error;

            showToast('✅ Factura registrada', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modalNuevaFactura'))?.hide();
            document.getElementById('formNuevaFactura')?.reset();
            loadFacturas();
        } catch (error) {
            console.error('Error factura:', error);
            showToast('Error: ' + error.message, 'error');
        }
    }

    async function cargarClientesEnSelect(selectId) {
        try {
            const sb = getSupabase();
            const { data } = await sb.from('clientes').select('id, nombre').order('nombre').limit(500);
            const select = document.getElementById(selectId);
            if (select) {
                select.innerHTML = '<option value="">Seleccionar cliente...</option>' +
                    (data || []).map(c => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
            }
        } catch (error) {
            console.error('Error cargando clientes:', error);
        }
    }

    // ==========================================
    // ASISTENTE IA
    // ==========================================
    function loadIAConversations() {
        try {
            const raw = localStorage.getItem(IAState.storageKey);
            if (!raw) return [];
            const data = JSON.parse(raw);
            return Array.isArray(data) ? data : [];
        } catch { return []; }
    }

    function saveIAConversations() {
        try {
            localStorage.setItem(IAState.storageKey, JSON.stringify(IAState.conversations.slice(-20)));
        } catch (e) {}
    }

    function getActiveConversation() {
        return IAState.conversations.find(c => c.id === IAState.activeConvId) || null;
    }

    function crearNuevaConversacion(titulo = 'Nueva conversación') {
        const conv = {
            id: 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            titulo: titulo,
            mensajes: [],
            createdAt: Date.now()
        };
        IAState.conversations.push(conv);
        IAState.activeConvId = conv.id;
        saveIAConversations();
        renderConversationTabs();
        return conv;
    }

    function eliminarConversacion(convId) {
        const idx = IAState.conversations.findIndex(c => c.id === convId);
        if (idx === -1) return;
        IAState.conversations.splice(idx, 1);
        if (IAState.activeConvId === convId) {
            IAState.activeConvId = IAState.conversations.length > 0
                ? IAState.conversations[IAState.conversations.length - 1].id : null;
        }
        saveIAConversations();
        renderConversationTabs();
        renderActiveConversation();
    }

    function renderConversationTabs() {
        const container = document.getElementById('adminIaConvs');
        if (!container) return;
        if (IAState.conversations.length === 0) { container.innerHTML = ''; return; }

        container.innerHTML = IAState.conversations.map(conv => `
            <button class="admin-ia-conv-tab ${conv.id === IAState.activeConvId ? 'active' : ''}"
                    data-conv-id="${conv.id}">
                <i class="fas fa-comment"></i>
                <span>${escapeHtml(conv.titulo.slice(0, 25))}</span>
                <button class="admin-ia-conv-tab-close" data-close-id="${conv.id}" title="Eliminar">
                    <i class="fas fa-times"></i>
                </button>
            </button>
        `).join('');

        container.querySelectorAll('.admin-ia-conv-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                if (e.target.closest('.admin-ia-conv-tab-close')) return;
                IAState.activeConvId = tab.dataset.convId;
                renderConversationTabs();
                renderActiveConversation();
            });
        });
        container.querySelectorAll('.admin-ia-conv-tab-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                eliminarConversacion(btn.dataset.closeId);
            });
        });
    }

    function renderActiveConversation() {
        const container = document.getElementById('adminIaMessages');
        if (!container) return;
        const conv = getActiveConversation();
        if (!conv || conv.mensajes.length === 0) {
            renderWelcome(container);
            return;
        }
        container.innerHTML = '';
        conv.mensajes.forEach(msg => renderMessage(container, msg, false));
        scrollToBottom();
    }

    function renderWelcome(container) {
        container.innerHTML = `
            <div class="ia-welcome">
                <div class="ia-welcome-icon">
                    <i class="fas fa-robot"></i>
                </div>
                <h3>Hola, soy tu copiloto de IVENMEX 🤖</h3>
                <p>Tengo acceso completo a la base de datos. Puedo consultar, analizar y modificar cualquier información del negocio. Pregúntame lo que necesites.</p>
                <div class="ia-welcome-grid">
                    <div class="ia-welcome-card" data-query="Dame un resumen completo del estado actual del negocio">
                        <div class="ia-welcome-card-icon"><i class="fas fa-chart-pie"></i></div>
                        <h4>Visión general</h4>
                        <p>Estado actual de todo el negocio</p>
                    </div>
                    <div class="ia-welcome-card" data-query="Muéstrame las deudas por cliente">
                        <div class="ia-welcome-card-icon" style="background:#FEE2E2;color:#991B1B;"><i class="fas fa-hand-holding-usd"></i></div>
                        <h4>Deudas por cliente</h4>
                        <p>Quién debe y cuánto</p>
                    </div>
                    <div class="ia-welcome-card" data-query="Analiza las ventas del último mes">
                        <div class="ia-welcome-card-icon" style="background:#D1FAE5;color:#065F46;"><i class="fas fa-chart-line"></i></div>
                        <h4>Análisis de ventas</h4>
                        <p>Tendencias e insights</p>
                    </div>
                    <div class="ia-welcome-card" data-query="¿Qué materiales tienen stock bajo?">
                        <div class="ia-welcome-card-icon" style="background:#FEF3C7;color:#92400E;"><i class="fas fa-exclamation-triangle"></i></div>
                        <h4>Alertas de stock</h4>
                        <p>Materiales por reabastecer</p>
                    </div>
                </div>
            </div>
        `;

        container.querySelectorAll('.ia-welcome-card').forEach(card => {
            card.addEventListener('click', () => {
                const input = document.getElementById('adminIaInput');
                if (input) {
                    input.value = card.dataset.query;
                    sendIAMessage();
                }
            });
        });
    }

    function renderMessage(container, msg, animate = true) {
        const el = document.createElement('div');
        el.className = `ia-message ${msg.role}`;
        if (msg.role === 'bot' && msg.categoria) el.classList.add(msg.categoria);

        const icon = msg.role === 'user' ? 'fa-user' : 'fa-robot';
        const formattedContent = msg.role === 'bot'
            ? renderMarkdown(msg.content)
            : escapeHtml(msg.content).replace(/\n/g, '<br>');

        const hora = new Date(msg.timestamp || Date.now()).toLocaleTimeString('es-ES', {
            hour: '2-digit', minute: '2-digit'
        });

        const latencyHtml = msg.latency
            ? `<span class="ia-message-latency"><i class="fas fa-bolt"></i> ${(msg.latency / 1000).toFixed(1)}s</span>`
            : '';

        el.innerHTML = `
            <div class="ia-message-avatar ${msg.role === 'bot' ? 'online' : ''}">
                <i class="fas ${icon}"></i>
            </div>
            <div class="ia-message-wrapper">
                <div class="ia-message-content">${formattedContent}</div>
                <div class="ia-message-meta">
                    <span>${hora}</span>
                    ${latencyHtml}
                    ${msg.role === 'bot' ? `
                        <div class="ia-message-actions">
                            <button class="ia-message-action" data-action="copy" title="Copiar">
                                <i class="fas fa-copy"></i>
                            </button>
                            <button class="ia-message-action" data-action="reuse" title="Reusar">
                                <i class="fas fa-redo"></i>
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

        el.querySelectorAll('.ia-message-action').forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.action;
                if (action === 'copy') {
                    navigator.clipboard.writeText(msg.content).then(() => {
                        btn.classList.add('copied');
                        btn.innerHTML = '<i class="fas fa-check"></i>';
                        setTimeout(() => {
                            btn.classList.remove('copied');
                            btn.innerHTML = '<i class="fas fa-copy"></i>';
                        }, 1500);
                    });
                } else if (action === 'reuse') {
                    const input = document.getElementById('adminIaInput');
                    if (input) { input.value = msg.content; input.focus(); }
                }
            });
        });

        container.appendChild(el);
        if (animate) scrollToBottom();
    }

    function scrollToBottom() {
        const container = document.getElementById('adminIaMessages');
        if (container) {
            requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
        }
    }

    function renderMarkdown(text) {
        if (!text) return '';
        let html = escapeHtml(text);

        html = html.replace(/```([\s\S]+?)```/g, (m, c) => `<pre><code>${c.trim()}</code></pre>`);
        html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
        html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
        html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
        html = html.replace(/^---+$/gm, '<hr>');
        html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

        const lines = html.split('\n');
        const output = [];
        let inList = false, listType = null;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const bulletMatch = line.match(/^\s*[•\-]\s+(.+)$/);
            const numMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
            if (bulletMatch) {
                if (!inList || listType !== 'ul') {
                    if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>');
                    output.push('<ul>'); inList = true; listType = 'ul';
                }
                output.push(`<li>${bulletMatch[1]}</li>`);
            } else if (numMatch) {
                if (!inList || listType !== 'ol') {
                    if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>');
                    output.push('<ol>'); inList = true; listType = 'ol';
                }
                output.push(`<li>${numMatch[2]}</li>`);
            } else {
                if (inList) {
                    output.push(listType === 'ul' ? '</ul>' : '</ol>');
                    inList = false; listType = null;
                }
                output.push(line);
            }
        }
        if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>');
        html = output.join('\n');

        html = html.split('\n\n').map(p => {
            const trimmed = p.trim();
            if (!trimmed) return '';
            if (/^<(h[1-6]|ul|ol|pre|blockquote|hr|table)/.test(trimmed)) return trimmed;
            return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
        }).join('');

        return html;
    }

    function categorizarRespuesta(texto) {
        const t = texto.toLowerCase();
        if (/❌|error|falló|fallo|no se pudo/.test(t)) return 'error';
        if (/⚠️|advertencia|cuidado|atención/.test(t)) return 'warning';
        if (/✅|éxito|listo|completado|correcto/.test(t)) return 'success';
        if (/📊|resumen|totales|estadísticas|reporte/.test(t)) return 'data';
        if (/ℹ️|info|ayuda/.test(t)) return 'info';
        return null;
    }

    function addTypingIndicator() {
        const container = document.getElementById('adminIaMessages');
        if (!container) return null;

        const frases = [
            'Consultando la base de datos...',
            'Analizando información...',
            'Procesando tu pregunta...',
            'Buscando en los registros...',
            'Preparando respuesta...'
        ];
        const frase = frases[Math.floor(Math.random() * frases.length)];

        const el = document.createElement('div');
        el.className = 'ia-message bot';
        el.id = 'iaTypingIndicator';
        el.innerHTML = `
            <div class="ia-message-avatar online">
                <i class="fas fa-robot"></i>
            </div>
            <div class="ia-message-wrapper">
                <div class="ia-message-content">
                    <div class="ia-typing">
                        <span></span><span></span><span></span>
                        <span class="ia-typing-text">${frase}</span>
                    </div>
                </div>
            </div>
        `;
        container.appendChild(el);
        scrollToBottom();

        const brain = document.getElementById('adminIaBrain');
        if (brain) brain.classList.add('pensando');
        return el;
    }

    function removeTypingIndicator() {
        const el = document.getElementById('iaTypingIndicator');
        if (el) el.remove();
        const brain = document.getElementById('adminIaBrain');
        if (brain) brain.classList.remove('pensando');
    }

    async function sendIAMessage() {
        const input = document.getElementById('adminIaInput');
        const sendBtn = document.getElementById('adminIaSend');
        if (!input || !sendBtn || IAState.isSending) return;

        const message = input.value.trim();
        if (!message) return;

        let conv = getActiveConversation();
        if (!conv) {
            conv = crearNuevaConversacion(message.slice(0, 30) + (message.length > 30 ? '...' : ''));
        }

        const userMsg = { role: 'user', content: message, timestamp: Date.now() };
        conv.mensajes.push(userMsg);

        if (conv.mensajes.length === 1) {
            conv.titulo = message.slice(0, 30) + (message.length > 30 ? '...' : '');
            renderConversationTabs();
        }

        const container = document.getElementById('adminIaMessages');
        renderMessage(container, userMsg);
        input.value = '';
        input.style.height = 'auto';
        updateCharCounter();
        saveIAConversations();

        IAState.isSending = true;
        IAState.startTime = Date.now();
        sendBtn.disabled = true;
        sendBtn.classList.add('sending');
        addTypingIndicator();
        updateHeaderStatus('pensando', 'Pensando...');

        try {
            const historial = conv.mensajes.slice(-10).map(m => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: m.content
            }));

            const response = await queryN8N(message, historial);

            const latency = Date.now() - IAState.startTime;
            const botMsg = {
                role: 'bot',
                content: response,
                timestamp: Date.now(),
                latency: latency,
                categoria: categorizarRespuesta(response)
            };
            conv.mensajes.push(botMsg);
            removeTypingIndicator();
            renderMessage(container, botMsg);
            saveIAConversations();
            updateHeaderStatus('online', 'Online');
        } catch (error) {
            console.error('Error IA:', error);
            removeTypingIndicator();
            const errorMsg = {
                role: 'bot',
                content: `❌ **No pude procesar tu consulta**\n\n${error.message || 'Error desconocido'}`,
                timestamp: Date.now(),
                categoria: 'error'
            };
            conv.mensajes.push(errorMsg);
            renderMessage(container, errorMsg);
            saveIAConversations();
            updateHeaderStatus('offline', 'Error');
        } finally {
            IAState.isSending = false;
            sendBtn.disabled = false;
            sendBtn.classList.remove('sending');
            input.focus();
        }
    }

    function updateHeaderStatus(status, text) {
        const pill = document.getElementById('adminIaStatusPill');
        const textEl = document.getElementById('adminIaStatusText');
        if (!pill || !textEl) return;
        pill.classList.remove('offline', 'checking');
        if (status === 'offline') pill.classList.add('offline');
        if (status === 'checking') pill.classList.add('checking');
        textEl.textContent = text;
    }

    async function checkIAN8NConnection() {
        updateHeaderStatus('checking', 'Conectando...');
        if (!ADMIN_CONFIG.N8N_WEBHOOK_URL) {
            updateHeaderStatus('offline', 'Sin configurar');
            return;
        }
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            const response = await fetch(ADMIN_CONFIG.N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: '__ping__', ping: true }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            updateHeaderStatus(response.ok ? 'online' : 'offline',
                response.ok ? 'Conectado' : 'Error');
        } catch (error) {
            console.warn('n8n no responde:', error);
            updateHeaderStatus('offline', 'Sin conexión');
        }
    }

    function updateCharCounter() {
        const input = document.getElementById('adminIaInput');
        const counter = document.getElementById('adminIaCharCounter');
        if (!input || !counter) return;
        const len = input.value.length;
        counter.textContent = len > 0 ? `${len}/2000` : '';
        counter.style.color = len > 1800 ? '#EF4444' : '';
    }

    async function queryN8N(question, history = []) {
        if (!ADMIN_CONFIG.N8N_WEBHOOK_URL) {
            throw new Error('No hay webhook de n8n configurado.');
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), ADMIN_CONFIG.IA_TIMEOUT);

        try {
            const response = await fetch(ADMIN_CONFIG.N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({
                    message: question,
                    history: history,
                    timestamp: new Date().toISOString(),
                    source: 'dashboard-admin'
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();
            let respuesta = data.response || data.output || data.message ||
                            data.text || data.answer ||
                            (Array.isArray(data) && data[0]?.response) ||
                            (Array.isArray(data) && data[0]?.output) ||
                            (Array.isArray(data) && data[0]?.mensaje);

            if (respuesta && typeof respuesta === 'object') {
                respuesta = respuesta.text || respuesta.content || JSON.stringify(respuesta);
            }
            if (!respuesta) respuesta = '⚠️ El webhook respondió sin contenido reconocible.';
            return respuesta;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('El asistente tardó demasiado. Intenta de nuevo.');
            }
            throw error;
        }
    }

    function setupIAHeaderActions() {
        document.getElementById('adminIaNewBtn')?.addEventListener('click', () => {
            crearNuevaConversacion('Nueva conversación');
            renderActiveConversation();
            document.getElementById('adminIaInput')?.focus();
        });

        document.getElementById('adminIaConvsBtn')?.addEventListener('click', () => {
            const convs = document.getElementById('adminIaConvs');
            const btn = document.getElementById('adminIaConvsBtn');
            if (!convs || !btn) return;
            IAState.isConvsOpen = !IAState.isConvsOpen;
            convs.classList.toggle('active', IAState.isConvsOpen);
            btn.classList.toggle('active', IAState.isConvsOpen);
            renderConversationTabs();
        });

        document.getElementById('adminIaSearchBtn')?.addEventListener('click', () => {
            const search = document.getElementById('adminIaSearch');
            const btn = document.getElementById('adminIaSearchBtn');
            const input = document.getElementById('adminIaSearchInput');
            if (!search || !btn) return;
            IAState.isSearchOpen = !IAState.isSearchOpen;
            search.classList.toggle('active', IAState.isSearchOpen);
            btn.classList.toggle('active', IAState.isSearchOpen);
            if (IAState.isSearchOpen) input?.focus();
            else if (input) { input.value = ''; buscarEnConversacion(''); }
        });

        document.getElementById('adminIaSearchInput')?.addEventListener('input', (e) => {
            buscarEnConversacion(e.target.value.toLowerCase());
        });

        document.getElementById('adminIaCompactBtn')?.addEventListener('click', () => {
            const container = document.getElementById('adminIaContainer');
            const btn = document.getElementById('adminIaCompactBtn');
            if (!container || !btn) return;
            IAState.isCompact = !IAState.isCompact;
            container.classList.toggle('compacto', IAState.isCompact);
            btn.classList.toggle('active', IAState.isCompact);
        });

        document.getElementById('adminIaExportBtn')?.addEventListener('click', exportarConversacion);

        document.getElementById('adminIaClearBtn')?.addEventListener('click', () => {
            const conv = getActiveConversation();
            if (!conv || conv.mensajes.length === 0) return;
            if (!confirm('¿Limpiar esta conversación?')) return;
            conv.mensajes = [];
            saveIAConversations();
            renderActiveConversation();
            showToast('🗑️ Conversación limpiada', 'success');
        });

        document.getElementById('adminIaVoiceBtn')?.addEventListener('click', iniciarDictadoVoz);
    }

    function buscarEnConversacion(query) {
        const container = document.getElementById('adminIaMessages');
        if (!container) return;
        container.querySelectorAll('.ia-message-content mark').forEach(mark => {
            const parent = mark.parentNode;
            parent.replaceChild(document.createTextNode(mark.textContent), mark);
            parent.normalize();
        });
        if (!query || query.length < 2) return;

        container.querySelectorAll('.ia-message-content').forEach(content => {
            const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
            const matches = [];
            let node;
            while (node = walker.nextNode()) {
                if (node.textContent.toLowerCase().includes(query)) matches.push(node);
            }
            matches.forEach(textNode => {
                const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
                const parts = textNode.textContent.split(regex);
                const fragment = document.createDocumentFragment();
                parts.forEach(part => {
                    if (part.toLowerCase() === query) {
                        const mark = document.createElement('mark');
                        mark.style.background = '#FEF3C7';
                        mark.style.padding = '1px 2px';
                        mark.style.borderRadius = '2px';
                        mark.textContent = part;
                        fragment.appendChild(mark);
                    } else {
                        fragment.appendChild(document.createTextNode(part));
                    }
                });
                textNode.parentNode.replaceChild(fragment, textNode);
            });
        });
    }

    function exportarConversacion() {
        const conv = getActiveConversation();
        if (!conv || conv.mensajes.length === 0) {
            showToast('No hay conversación para exportar', 'error');
            return;
        }
        const contenido = conv.mensajes.map(m => {
            const fecha = new Date(m.timestamp).toLocaleString('es-ES');
            const quien = m.role === 'user' ? 'TÚ' : 'IA';
            return `[${fecha}] ${quien}:\n${m.content}\n`;
        }).join('\n---\n\n');

        const header = `Conversación IVENMEX - ${conv.titulo}\nFecha: ${new Date().toLocaleString('es-ES')}\n${'='.repeat(60)}\n\n`;
        const blob = new Blob([header + contenido], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ivenmex-conversacion-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('📥 Conversación exportada', 'success');
    }

    function iniciarDictadoVoz() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { showToast('Dictado por voz no soportado', 'error'); return; }

        const btn = document.getElementById('adminIaVoiceBtn');
        const input = document.getElementById('adminIaInput');
        if (!btn || !input) return;

        const recognition = new SR();
        recognition.lang = 'es-ES';
        recognition.continuous = false;
        recognition.interimResults = true;

        btn.style.background = '#EF4444';
        btn.style.color = 'white';

        recognition.onresult = (event) => {
            let transcript = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            input.value = transcript;
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 140) + 'px';
            updateCharCounter();
        };
        recognition.onerror = () => showToast('Error en dictado', 'error');
        recognition.onend = () => {
            btn.style.background = '';
            btn.style.color = '';
            input.focus();
        };

        try { recognition.start(); showToast('🎤 Escuchando...', 'success'); }
        catch (e) { btn.style.background = ''; btn.style.color = ''; }
    }

    function initIA() {
        const guardadas = loadIAConversations();
        if (guardadas.length > 0) {
            IAState.conversations = guardadas;
            IAState.activeConvId = guardadas[guardadas.length - 1].id;
        } else {
            crearNuevaConversacion('Conversación inicial');
        }
        renderConversationTabs();
        renderActiveConversation();

        if (!IAState._listenersSet) {
            IAState._listenersSet = true;
            setupIAHeaderActions();
            setupIAInputListeners();
            setupIASuggestionListeners();
        }
        checkIAN8NConnection();
    }

    function setupIAInputListeners() {
        const input = document.getElementById('adminIaInput');
        const sendBtn = document.getElementById('adminIaSend');
        if (!input) return;
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendIAMessage();
            }
        });
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 140) + 'px';
            updateCharCounter();
        });
        sendBtn?.addEventListener('click', sendIAMessage);
    }

    function setupIASuggestionListeners() {
        document.querySelectorAll('.admin-ia-suggestion').forEach(btn => {
            if (btn._listenerSet) return;
            btn._listenerSet = true;
            btn.addEventListener('click', () => {
                const input = document.getElementById('adminIaInput');
                if (input) {
                    input.value = btn.dataset.query || btn.textContent.trim();
                    sendIAMessage();
                }
            });
        });
    }

    // ==========================================
    // EVENT LISTENERS
    // ==========================================
    function setupEventListeners() {
        document.getElementById('adminLoginBtn')?.addEventListener('click', attemptLogin);
        document.getElementById('adminLoginCancel')?.addEventListener('click', closeLogin);
        document.getElementById('adminPasswordInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') attemptLogin();
            if (e.key === 'Escape') closeLogin();
        });
        document.getElementById('adminLogoutBtn')?.addEventListener('click', logout);
        document.getElementById('adminCloseBtn')?.addEventListener('click', closeAdminPanel);

        document.querySelectorAll('.admin-nav-item').forEach(item => {
            item.addEventListener('click', () => switchView(item.dataset.view));
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const overlay = document.getElementById('adminLoginOverlay');
                if (overlay?.classList.contains('active')) closeLogin();
            }
        });
    }

    // ==========================================
    // INICIALIZACIÓN
    // ==========================================
    function init() {
        let intentos = 0;
        const maxIntentos = 20;
        const esperar = () => {
            intentos++;
            if (window.supabaseClient) {
                console.log('✅ adminPanel: Supabase detectado');
                setupSecretTrigger();
                setupEventListeners();
                console.log('🔐 Panel Admin listo. 5 clicks en el logo o Ctrl+Shift+A');
                return;
            }
            if (intentos >= maxIntentos) {
                console.error('❌ adminPanel: Supabase nunca se inicializó');
                return;
            }
            setTimeout(esperar, 500);
        };
        esperar();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // ==========================================
    // API PÚBLICA
    // ==========================================
    window.AdminPanel = {
        open: openLogin,
        close: closeAdminPanel,
        logout,
        switchView,
        reload: () => switchView(AdminState.currentView),
        // Cotizaciones
        loadCotizaciones,
        // Facturas
        loadFacturas,
        abrirModalNuevaFactura,
        guardarNuevaFactura,
        // Deudas
        loadDeudas,
        abrirModalNuevaDeuda,
        guardarNuevaDeuda,
        abrirModalAbono,
        guardarAbono,
        verDetalleDeudas
    };

}());
