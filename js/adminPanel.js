/* ==========================================
   IVENMEX - PANEL ADMIN OCULTO
   v2.1 - Saneamiento + Lógica inventario
   ========================================== */

(function () {
    'use strict';

    // ==========================================
    // CONFIGURACIÓN
    // ==========================================
    const ADMIN_CONFIG = {
        // 🔒 CAMBIA ESTA CONTRASEÑA
        PASSWORD_HASH: 'ivenmex2024',
        SESSION_KEY: 'ivx_admin_session',
        SESSION_DURATION: 2 * 60 * 60 * 1000, // 2 horas

        // 🤖 URL DEL WEBHOOK DE N8N
        // ⚠️ Verifica que el dominio esté bien escrito (sin espacios)
        N8N_WEBHOOK_URL: 'https://n8n.aguasdgu anipa.com/webhook/admin-chat',

        FALLBACK_TO_LOCAL: true
    };

    // ==========================================
    // ESTADO GLOBAL
    // ==========================================
    const AdminState = {
        isAuthenticated: false,
        currentView: 'dashboard',
        clickCount: 0,
        clickTimer: null,
        conversationHistory: []
    };

    // ==========================================
    // UTILIDADES GLOBALES
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
        } catch {
            return '-';
        }
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    // ==========================================
    // SANEAMIENTO: nunca valores negativos
    // ==========================================
    function sanitizeNumber(valor, defecto = 0) {
        const num = parseFloat(valor);
        if (isNaN(num) || num < 0) return defecto;
        return num;
    }

    function sanitizeMoney(valor) {
        return sanitizeNumber(valor, 0);
    }

    function sanitizeInt(valor) {
        const num = parseInt(valor, 10);
        if (isNaN(num) || num < 0) return 0;
        return num;
    }

    // ==========================================
    // TOASTS ADMIN
    // ==========================================
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
    // GESTIÓN DE SESIÓN
    // ==========================================
    function saveSession() {
        const session = {
            timestamp: Date.now(),
            expires: Date.now() + ADMIN_CONFIG.SESSION_DURATION
        };
        try {
            sessionStorage.setItem(ADMIN_CONFIG.SESSION_KEY, JSON.stringify(session));
        } catch (e) {
            console.warn('No se pudo guardar la sesión:', e);
        }
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
        } catch (e) {
            return false;
        }
    }

    function clearSession() {
        try {
            sessionStorage.removeItem(ADMIN_CONFIG.SESSION_KEY);
        } catch (e) {}
        AdminState.isAuthenticated = false;
    }

    // ==========================================
    // DETECCIÓN DE CLICK SECRETO EN EL LOGO
    // ==========================================
    function setupSecretTrigger() {
        const logo = document.querySelector('.md-toolbar-brand');
        if (!logo) {
            console.warn('⚠️ adminPanel: No se encontró .md-toolbar-brand');
            return;
        }

        logo.style.cursor = 'pointer';
        logo.addEventListener('click', (e) => {
            e.preventDefault();
            AdminState.clickCount++;

            clearTimeout(AdminState.clickTimer);
            AdminState.clickTimer = setTimeout(() => {
                AdminState.clickCount = 0;
            }, 1500);

            if (AdminState.clickCount >= 5) {
                AdminState.clickCount = 0;
                openLogin();
            }
        });

        // Atajo: Ctrl+Shift+A
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
            setTimeout(() => {
                const input = document.getElementById('adminPasswordInput');
                if (input) input.focus();
            }, 100);
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

        const password = input.value.trim();

        if (password === ADMIN_CONFIG.PASSWORD_HASH) {
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
            setTimeout(() => {
                input.style.borderColor = '';
            }, 1000);
        }
    }

    // ==========================================
    // PANEL ADMIN
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

    // ==========================================
    // NAVEGACIÓN ENTRE VISTAS
    // ==========================================
    function switchView(viewName) {
        AdminState.currentView = viewName;

        document.querySelectorAll('.admin-nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.view === viewName);
        });

        document.querySelectorAll('.admin-view').forEach(view => {
            view.classList.toggle('active', view.id === `adminView-${viewName}`);
        });

        switch (viewName) {
            case 'dashboard':  loadDashboardStats(); break;
            case 'clientes':   loadClientes();       break;
            case 'pedidos':    loadPedidos();        break;
            case 'ventas':     loadVentas();         break;
            case 'productos':  loadProductos();      break;
            case 'inventario': loadInventario();     break;
            case 'ia':         initIA();             break;
        }
    }

    // ==========================================
    // OBTENER CLIENTE SUPABASE DINÁMICAMENTE
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
            console.log('📊 Cargando estadísticas del dashboard...');

            const [clientesRes, pedidosRes, ventasRes, productosRes] = await Promise.all([
                sb.from('clientes').select('*', { count: 'exact', head: true }),
                sb.from('pedidos').select('*', { count: 'exact', head: true }),
                sb.from('pagos').select('monto'),
                sb.from('productos').select('*', { count: 'exact', head: true })
            ]);

            const totalClientes = clientesRes.count || 0;
            const totalPedidos = pedidosRes.count || 0;
            const totalProductos = productosRes.count || 0;
            const totalVentas = (ventasRes.data || []).reduce((sum, p) => sum + sanitizeMoney(p.monto), 0);

            setText('adminStatClientes', totalClientes);
            setText('adminStatPedidos', totalPedidos);
            setText('adminStatProductos', totalProductos);
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

            console.log(`✅ Stats: ${totalClientes} clientes, ${totalPedidos} pedidos, ${activos} activos, ${urgentes} urgentes`);
        } catch (error) {
            console.error('❌ Error cargando stats:', error);
            showToast('Error al cargar estadísticas: ' + error.message, 'error');
        }
    }

    // ==========================================
    // CLIENTES
    // ==========================================
    async function loadClientes() {
        try {
            const sb = getSupabase();
            console.log('👥 Cargando clientes...');

            const { data, error } = await sb
                .from('clientes')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(500);

            if (error) throw error;

            console.log(`✅ ${data?.length || 0} clientes cargados`);

            const tbody = document.getElementById('adminTablaClientes');
            if (!tbody) return;

            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="admin-table-empty"><i class="fas fa-users"></i>No hay clientes registrados</td></tr>';
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
            console.error('❌ Error cargando clientes:', error);
            const tbody = document.getElementById('adminTablaClientes');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="6" class="admin-table-empty" style="color:#EF4444;">
                    <i class="fas fa-exclamation-circle"></i>Error: ${escapeHtml(error.message)}
                </td></tr>`;
            }
            showToast('Error al cargar clientes', 'error');
        }
    }

    // ==========================================
    // PEDIDOS
    // ==========================================
    async function loadPedidos() {
        try {
            const sb = getSupabase();
            console.log('📋 Cargando pedidos...');

            const { data, error } = await sb
                .from('pedidos')
                .select(`
                    id, estado, prioridad, total, anticipo, fecha_solicitud,
                    fecha_entrega_prometida, observaciones,
                    clientes (nombre),
                    detalles_pedido (cantidad, productos (nombre))
                `)
                .order('fecha_solicitud', { ascending: false })
                .limit(200);

            if (error) throw error;

            console.log(`✅ ${data?.length || 0} pedidos cargados`);

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
            console.error('❌ Error cargando pedidos:', error);
            const tbody = document.getElementById('adminTablaPedidos');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="8" class="admin-table-empty" style="color:#EF4444;">
                    <i class="fas fa-exclamation-circle"></i>Error: ${escapeHtml(error.message)}
                </td></tr>`;
            }
            showToast('Error al cargar pedidos', 'error');
        }
    }

    // ==========================================
    // VENTAS
    // ==========================================
    async function loadVentas() {
        try {
            const sb = getSupabase();
            console.log('💰 Cargando ventas...');

            const { data, error } = await sb
                .from('pagos')
                .select(`
                    id, monto, metodo_pago, fecha_pago, referencia, observaciones,
                    pedidos (id, clientes (nombre))
                `)
                .order('fecha_pago', { ascending: false })
                .limit(200);

            if (error) throw error;

            console.log(`✅ ${data?.length || 0} pagos cargados`);

            const tbody = document.getElementById('adminTablaVentas');
            if (!tbody) return;

            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="admin-table-empty"><i class="fas fa-dollar-sign"></i>No hay ventas registradas</td></tr>';
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

            const total = data.reduce((sum, v) => sum + sanitizeMoney(v.monto), 0);
            setText('adminVentasTotal', formatCurrency(total));
        } catch (error) {
            console.error('❌ Error cargando ventas:', error);
            const tbody = document.getElementById('adminTablaVentas');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="6" class="admin-table-empty" style="color:#EF4444;">
                    <i class="fas fa-exclamation-circle"></i>Error: ${escapeHtml(error.message)}
                </td></tr>`;
            }
            showToast('Error al cargar ventas', 'error');
        }
    }

    // ==========================================
    // PRODUCTOS
    // ==========================================
    async function loadProductos() {
        try {
            const sb = getSupabase();
            console.log('📦 Cargando productos...');

            const { data, error } = await sb
                .from('productos')
                .select('*')
                .order('nombre')
                .limit(500);

            if (error) throw error;

            console.log(`✅ ${data?.length || 0} productos cargados`);

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
            console.error('❌ Error cargando productos:', error);
            const tbody = document.getElementById('adminTablaProductos');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="6" class="admin-table-empty" style="color:#EF4444;">
                    <i class="fas fa-exclamation-circle"></i>Error: ${escapeHtml(error.message)}
                </td></tr>`;
            }
            showToast('Error al cargar productos', 'error');
        }
    }

    // ==========================================
    // INVENTARIO (con lógica: 0=No hay, 1-5=Bajo, >5=OK)
    // ==========================================
    async function loadInventario() {
        try {
            const sb = getSupabase();
            console.log('🏭 === Cargando inventario ===');

            const { data, error, status, count } = await sb
                .from('inventario_materiales')
                .select('*', { count: 'exact' })
                .order('id', { ascending: true });

            console.log('📊 Status:', status, '| Count:', count, '| Rows:', data?.length);

            if (error) {
                console.error('❌ Error Supabase:', error);
                throw error;
            }

            const tbody = document.getElementById('adminTablaInventario');
            if (!tbody) {
                console.error('❌ No se encontró #adminTablaInventario');
                return;
            }

            if (!data || data.length === 0) {
                console.warn('⚠️ La tabla está vacía');
                tbody.innerHTML = '<tr><td colspan="6" class="admin-table-empty"><i class="fas fa-warehouse"></i>No hay materiales en inventario</td></tr>';
                return;
            }

            console.log(`✅ Renderizando ${data.length} materiales...`);

            tbody.innerHTML = data.map(m => {
                // SANEAMIENTO: nunca negativos
                const stockActual = Math.max(0, parseFloat(m.stock_actual) || 0);
                const stockMinimo = Math.max(0, parseFloat(m.stock_minimo) || 0);

                // ==========================================
                // LÓGICA DE ESTADO DEL STOCK
                // 0        → No hay (rojo)
                // 1 a 5    → Bajo (amarillo)
                // > 5      → OK (verde)
                // ==========================================
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

            console.log('✅ Inventario renderizado correctamente');

        } catch (error) {
            console.error('❌ Error cargando inventario:', error);
            const tbody = document.getElementById('adminTablaInventario');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="6" class="admin-table-empty" style="color:#EF4444;">
                    <i class="fas fa-exclamation-circle"></i>Error: ${escapeHtml(error.message || 'No se pudo cargar')}
                </td></tr>`;
            }
            showToast('Error al cargar inventario: ' + (error.message || ''), 'error');
        }
    }

    // ==========================================
    // HELPERS DE ESTADO
    // ==========================================
    function getEstadoClass(estado) {
        const map = {
            urgente: 'danger',
            en_produccion: 'warning',
            diseño: 'primary',
            control_calidad: 'default',
            cotizando: 'default',
            listo: 'success',
            entregado: 'success',
            cancelado: 'default'
        };
        return map[estado] || 'default';
    }

    function getEstadoLabel(estado) {
        const map = {
            cotizando: 'Cotizando',
            diseño: 'En Diseño',
            en_produccion: 'Producción',
            control_calidad: 'Control de Calidad',
            listo: 'Listo',
            entregado: 'Entregado',
            cancelado: 'Cancelado'
        };
        return map[estado] || estado || '-';
    }

    // ==========================================
    // ASISTENTE IA - ESTADO
    // ==========================================
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

    function loadIAConversations() {
        try {
            const raw = localStorage.getItem(IAState.storageKey);
            if (!raw) return [];
            const data = JSON.parse(raw);
            return Array.isArray(data) ? data : [];
        } catch (e) {
            return [];
        }
    }

    function saveIAConversations() {
        try {
            const toSave = IAState.conversations.slice(-20);
            localStorage.setItem(IAState.storageKey, JSON.stringify(toSave));
        } catch (e) {
            console.warn('No se pudo guardar conversaciones:', e);
        }
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
                ? IAState.conversations[IAState.conversations.length - 1].id
                : null;
        }
        saveIAConversations();
        renderConversationTabs();
        renderActiveConversation();
    }

    function renderConversationTabs() {
        const container = document.getElementById('adminIaConvs');
        if (!container) return;

        if (IAState.conversations.length === 0) {
            container.innerHTML = '';
            return;
        }

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
        conv.mensajes.forEach(msg => {
            renderMessage(container, msg, false);
        });
        scrollToBottom();
    }

    function renderWelcome(container) {
        container.innerHTML = `
            <div class="ia-welcome">
                <div class="ia-welcome-icon">
                    <i class="fas fa-robot"></i>
                </div>
                <h3>¡Hola! Soy tu asistente IA</h3>
                <p>Puedo consultar tu base de datos en lenguaje natural. Pregúntame lo que necesites sobre clientes, pedidos, ventas, productos, inventario y más.</p>
                <div class="ia-welcome-grid">
                    <div class="ia-welcome-card" data-query="Dame un resumen general del negocio">
                        <div class="ia-welcome-card-icon"><i class="fas fa-chart-pie"></i></div>
                        <h4>Resumen general</h4>
                        <p>Vista completa del estado de IVENMEX</p>
                    </div>
                    <div class="ia-welcome-card" data-query="Muéstrame los pedidos urgentes activos">
                        <div class="ia-welcome-card-icon" style="background:#FEE2E2;color:#991B1B;"><i class="fas fa-fire"></i></div>
                        <h4>Pedidos urgentes</h4>
                        <p>Lo que requiere atención inmediata</p>
                    </div>
                    <div class="ia-welcome-card" data-query="¿Cuáles son las ventas totales?">
                        <div class="ia-welcome-card-icon" style="background:#D1FAE5;color:#065F46;"><i class="fas fa-dollar-sign"></i></div>
                        <h4>Análisis de ventas</h4>
                        <p>Totales y tendencias de ingresos</p>
                    </div>
                    <div class="ia-welcome-card" data-query="¿Qué materiales tienen stock bajo o agotado?">
                        <div class="ia-welcome-card-icon" style="background:#FEF3C7;color:#92400E;"><i class="fas fa-exclamation-triangle"></i></div>
                        <h4>Alertas de stock</h4>
                        <p>Materiales que necesitan reabastecerse</p>
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
        if (msg.role === 'bot' && msg.categoria) {
            el.classList.add(msg.categoria);
        }

        const icon = msg.role === 'user' ? 'fa-user' : 'fa-robot';
        const formattedContent = msg.role === 'bot'
            ? renderMarkdown(msg.content)
            : escapeHtml(msg.content).replace(/\n/g, '<br>');

        const hora = new Date(msg.timestamp || Date.now()).toLocaleTimeString('es-ES', {
            hour: '2-digit', minute: '2-digit'
        });

        const latencyHtml = msg.latency
            ? `<span class="ia-message-latency">${(msg.latency / 1000).toFixed(1)}s</span>`
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
                    if (input) {
                        input.value = msg.content;
                        input.focus();
                    }
                }
            });
        });

        container.appendChild(el);

        if (animate) scrollToBottom();
    }

    function scrollToBottom() {
        const container = document.getElementById('adminIaMessages');
        if (container) {
            requestAnimationFrame(() => {
                container.scrollTop = container.scrollHeight;
            });
        }
    }

    // ==========================================
    // MARKDOWN RENDERER
    // ==========================================
    function renderMarkdown(text) {
        if (!text) return '';

        let html = escapeHtml(text);

        html = html.replace(/```([\s\S]+?)```/g, (match, code) => {
            return `<pre><code>${code.trim()}</code></pre>`;
        });

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
        let inList = false;
        let listType = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const bulletMatch = line.match(/^\s*[•\-]\s+(.+)$/);
            const numMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);

            if (bulletMatch) {
                if (!inList || listType !== 'ul') {
                    if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>');
                    output.push('<ul>');
                    inList = true;
                    listType = 'ul';
                }
                output.push(`<li>${bulletMatch[1]}</li>`);
            } else if (numMatch) {
                if (!inList || listType !== 'ol') {
                    if (inList) output.push(listType === 'ul' ? '</ul>' : '</ol>');
                    output.push('<ol>');
                    inList = true;
                    listType = 'ol';
                }
                output.push(`<li>${numMatch[2]}</li>`);
            } else {
                if (inList) {
                    output.push(listType === 'ul' ? '</ul>' : '</ol>');
                    inList = false;
                    listType = null;
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
                        <span class="ia-typing-text">Procesando con IA...</span>
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
            const titulo = message.slice(0, 30) + (message.length > 30 ? '...' : '');
            conv = crearNuevaConversacion(titulo);
        }

        const userMsg = {
            role: 'user',
            content: message,
            timestamp: Date.now()
        };
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
            let response;

            if (ADMIN_CONFIG.N8N_WEBHOOK_URL) {
                response = await queryN8N(message);
            }

            if (!response && ADMIN_CONFIG.FALLBACK_TO_LOCAL) {
                response = await queryLocalAI(message);
            }

            if (!response) {
                response = '⚠️ No pude procesar tu consulta. Intenta de nuevo.';
            }

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
            console.error('Error en IA:', error);
            removeTypingIndicator();

            const errorMsg = {
                role: 'bot',
                content: `❌ **Error al procesar tu consulta**\n\n${error.message || 'Error desconocido'}\n\n_Intenta de nuevo o verifica la conexión con n8n._`,
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
        updateHeaderStatus('checking', 'Verificando...');

        if (!ADMIN_CONFIG.N8N_WEBHOOK_URL) {
            updateHeaderStatus('offline', 'Motor local');
            return;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);

            const response = await fetch(ADMIN_CONFIG.N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: '__ping__', ping: true }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                updateHeaderStatus('online', 'Conectado');
            } else {
                throw new Error('HTTP ' + response.status);
            }
        } catch (error) {
            console.warn('n8n no responde al ping:', error);
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
            if (!confirm('¿Limpiar esta conversación? No se puede deshacer.')) return;
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
                if (node.textContent.toLowerCase().includes(query)) {
                    matches.push(node);
                }
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
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            showToast('Dictado por voz no soportado en este navegador', 'error');
            return;
        }

        const btn = document.getElementById('adminIaVoiceBtn');
        const input = document.getElementById('adminIaInput');
        if (!btn || !input) return;

        const recognition = new SpeechRecognition();
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

        recognition.onerror = (e) => {
            console.warn('Error de reconocimiento:', e);
            showToast('Error en dictado por voz', 'error');
        };

        recognition.onend = () => {
            btn.style.background = '';
            btn.style.color = '';
            input.focus();
        };

        try {
            recognition.start();
            showToast('🎤 Escuchando...', 'success');
        } catch (e) {
            btn.style.background = '';
            btn.style.color = '';
        }
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
    // CONSULTA A N8N
    // ==========================================
    async function queryN8N(question) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);

        try {
            const response = await fetch(ADMIN_CONFIG.N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    message: question,
                    history: AdminState.conversationHistory.slice(-5),
                    timestamp: new Date().toISOString(),
                    source: 'dashboard-admin'
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status} - ${response.statusText}`);
            }

            const data = await response.json();

            let respuesta =
                data.response ||
                data.output ||
                data.message ||
                data.text ||
                data.answer ||
                (Array.isArray(data) && data[0]?.response) ||
                (Array.isArray(data) && data[0]?.output) ||
                (Array.isArray(data) && data[0]?.mensaje);

            if (respuesta && typeof respuesta === 'object') {
                respuesta = respuesta.text || respuesta.content || JSON.stringify(respuesta);
            }

            if (!respuesta) {
                console.warn('Respuesta n8n sin formato esperado:', data);
                respuesta = '⚠️ El webhook respondió pero sin contenido reconocible.';
            }

            return respuesta;
        } catch (error) {
            clearTimeout(timeoutId);

            if (error.name === 'AbortError') {
                console.error('Timeout consultando n8n (60s)');
                throw new Error('El asistente tardó demasiado en responder. Intenta de nuevo.');
            }

            console.error('Error consultando n8n:', error);

            if (ADMIN_CONFIG.FALLBACK_TO_LOCAL) {
                console.warn('⚠️ Fallback al motor local');
                return await queryLocalAI(question);
            }

            throw error;
        }
    }

    // ==========================================
    // MOTOR DE IA LOCAL (fallback)
    // ==========================================
    async function queryLocalAI(question) {
        const q = question.toLowerCase();
        const sb = getSupabase();

        // ===== CLIENTES =====
        if (/(cuántos|cuantos|numero|número|total).*clientes?/.test(q) || /clientes.*total/.test(q)) {
            const { count } = await sb.from('clientes').select('*', { count: 'exact', head: true });
            return `📊 Actualmente tienes **${count || 0} clientes** registrados en el sistema.`;
        }

        if (/(lista|muestra|ver|dame|cuáles|cuales).*clientes?/.test(q)) {
            const { data } = await sb.from('clientes').select('id, nombre, telefono, email').limit(20).order('nombre');
            if (!data || data.length === 0) return '📭 No hay clientes registrados.';

            let respuesta = `📋 **Clientes registrados** (mostrando ${data.length}):\n\n`;
            data.forEach(c => {
                respuesta += `• **${c.nombre}**`;
                if (c.telefono) respuesta += ` - 📞 ${c.telefono}`;
                if (c.email) respuesta += ` - 📧 ${c.email}`;
                respuesta += '\n';
            });
            return respuesta;
        }

        // ===== PEDIDOS =====
        if (/(cuántos|cuantos|total).*pedidos?/.test(q)) {
            const { count } = await sb.from('pedidos').select('*', { count: 'exact', head: true });
            return `📊 Hay **${count || 0} pedidos** en total en el sistema.`;
        }

        if (/pedidos?.*urgentes?|urgentes?/.test(q)) {
            const { data } = await sb.from('pedidos')
                .select('id, estado, clientes(nombre), fecha_entrega_prometida, observaciones')
                .eq('prioridad', 'urgente')
                .not('estado', 'in', '(entregado,cancelado)')
                .limit(15);

            if (!data || data.length === 0) return '✅ No hay pedidos urgentes pendientes.';
            return `🚨 **Pedidos urgentes activos** (${data.length}):\n\n` + data.map(p =>
                `• **#${p.id}** - ${p.clientes?.nombre || 'Sin cliente'} - Estado: ${p.estado}`
            ).join('\n');
        }

        if (/pedidos?.*(activos?|pendientes?)/.test(q)) {
            const { data } = await sb.from('pedidos')
                .select('id, estado, clientes(nombre)')
                .not('estado', 'in', '(entregado,cancelado)')
                .limit(20);

            if (!data || data.length === 0) return '✅ No hay pedidos activos.';
            return `📋 **Pedidos activos** (${data.length}):\n\n` + data.map(p =>
                `• **#${p.id}** - ${p.clientes?.nombre || 'Sin cliente'} - ${p.estado}`
            ).join('\n');
        }

        // ===== VENTAS =====
        if (/(cuánto|cuanto|total).*(vendido|ventas?|ingresos?|facturado)/.test(q)) {
            const { data } = await sb.from('pagos').select('monto');
            const total = (data || []).reduce((sum, p) => sum + sanitizeMoney(p.monto), 0);
            return `💰 **Ventas totales:** ${formatCurrency(total)}\n\n📊 Basado en **${data?.length || 0} pagos** registrados.`;
        }

        // ===== PRODUCTOS =====
        if (/(cuántos|cuantos|total).*productos?/.test(q)) {
            const { count } = await sb.from('productos').select('*', { count: 'exact', head: true });
            return `📦 Tienes **${count || 0} productos** en el catálogo.`;
        }

        if (/(lista|muestra|ver|dame|cuáles|cuales).*productos?/.test(q)) {
            const { data } = await sb.from('productos').select('nombre, categoria, precio_unitario, precio_por_m2').eq('activo', true).limit(20);
            if (!data || data.length === 0) return '📭 No hay productos activos.';

            let respuesta = `📦 **Productos activos** (${data.length}):\n\n`;
            data.forEach(p => {
                const precio = p.precio_por_m2
                    ? `${formatCurrency(p.precio_por_m2)}/m²`
                    : formatCurrency(p.precio_unitario);
                respuesta += `• **${p.nombre}** (${p.categoria || 'Sin categoría'}) - ${precio}\n`;
            });
            return respuesta;
        }

        // ===== INVENTARIO (con lógica actualizada) =====
        if (/stock.*bajo|materiales?.*(bajo|bajos|agotar|agotado|sin stock)/.test(q)) {
            const { data } = await sb.from('inventario_materiales').select('*');

            const agotados = (data || []).filter(m => {
                const s = Math.max(0, parseFloat(m.stock_actual) || 0);
                return s === 0;
            });

            const bajos = (data || []).filter(m => {
                const s = Math.max(0, parseFloat(m.stock_actual) || 0);
                return s > 0 && s <= 5;
            });

            if (agotados.length === 0 && bajos.length === 0) {
                return '✅ Todos los materiales tienen stock suficiente (más de 5 unidades).';
            }

            let respuesta = '';

            if (agotados.length > 0) {
                respuesta += `🔴 **Materiales agotados** (${agotados.length}):\n\n`;
                respuesta += agotados.map(m =>
                    `• **${m.nombre}**: 0 ${m.unidad_medida || 'unidades'}`
                ).join('\n');
                respuesta += '\n\n';
            }

            if (bajos.length > 0) {
                respuesta += `⚠️ **Materiales con stock bajo** (${bajos.length}):\n\n`;
                respuesta += bajos.map(m =>
                    `• **${m.nombre}**: ${m.stock_actual} ${m.unidad_medida || ''}`
                ).join('\n');
            }

            return respuesta.trim();
        }

        // ===== EMPLEADOS =====
        if (/(cuántos|cuantos|total).*empleados?/.test(q)) {
            const { count } = await sb.from('empleados').select('*', { count: 'exact', head: true }).eq('activo', true);
            return `👥 Tienes **${count || 0} empleados activos**.`;
        }

        // ===== RESUMEN =====
        if (/(resumen|reporte|estadísticas?|estadisticas?|dashboard)/.test(q)) {
            const [clientes, pedidos, productos, ventasData, pedidosData] = await Promise.all([
                sb.from('clientes').select('*', { count: 'exact', head: true }),
                sb.from('pedidos').select('*', { count: 'exact', head: true }),
                sb.from('productos').select('*', { count: 'exact', head: true }),
                sb.from('pagos').select('monto'),
                sb.from('pedidos').select('estado, prioridad')
            ]);

            const totalVentas = (ventasData.data || []).reduce((s, p) => s + sanitizeMoney(p.monto), 0);
            const activos = (pedidosData.data || []).filter(p => p.estado !== 'entregado' && p.estado !== 'cancelado').length;
            const urgentes = (pedidosData.data || []).filter(p => p.prioridad === 'urgente' && p.estado !== 'entregado' && p.estado !== 'cancelado').length;

            return `📊 **Resumen General de IVENMEX**\n\n` +
                `👥 **Clientes:** ${clientes.count || 0}\n` +
                `📋 **Pedidos totales:** ${pedidos.count || 0}\n` +
                `🔥 **Pedidos activos:** ${activos}\n` +
                `🚨 **Pedidos urgentes:** ${urgentes}\n` +
                `📦 **Productos:** ${productos.count || 0}\n` +
                `💰 **Ventas totales:** ${formatCurrency(totalVentas)}`;
        }

        // ===== AYUDA =====
        if (/(ayuda|help|qué puedes|que puedes|comandos)/.test(q)) {
            return `🤖 **Puedo ayudarte con:**\n\n` +
                `📊 **Consultas:**\n` +
                `• "¿Cuántos clientes tengo?"\n` +
                `• "Muéstrame los pedidos urgentes"\n` +
                `• "¿Cuáles son las ventas totales?"\n` +
                `• "Lista los productos activos"\n` +
                `• "¿Qué materiales tienen stock bajo?"\n` +
                `• "Dame un resumen general"\n\n` +
                `💡 **Tip:** También puedes conectar n8n para IA avanzada.`;
        }

        // ===== SALUDO =====
        if (/^(hola|buenos|buenas|hey|hi)/.test(q)) {
            return `¡Hola! 👋 ¿En qué puedo ayudarte hoy?\n\nPrueba preguntarme sobre clientes, pedidos, ventas, productos o inventario.`;
        }

        // ===== DEFAULT =====
        return `🤔 No estoy seguro de cómo responder a eso.\n\nIntenta con:\n` +
            `• "¿Cuántos clientes tengo?"\n` +
            `• "Muéstrame los pedidos urgentes"\n` +
            `• "Ventas totales"\n` +
            `• "Resumen general"\n` +
            `• "Ayuda" para ver todos los comandos`;
    }

    // ==========================================
    // EVENT LISTENERS
    // ==========================================
    function setupEventListeners() {
        // Login
        document.getElementById('adminLoginBtn')?.addEventListener('click', attemptLogin);
        document.getElementById('adminLoginCancel')?.addEventListener('click', closeLogin);
        document.getElementById('adminPasswordInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') attemptLogin();
            if (e.key === 'Escape') closeLogin();
        });

        // Logout
        document.getElementById('adminLogoutBtn')?.addEventListener('click', logout);
        document.getElementById('adminCloseBtn')?.addEventListener('click', closeAdminPanel);

        // Navegación
        document.querySelectorAll('.admin-nav-item').forEach(item => {
            item.addEventListener('click', () => switchView(item.dataset.view));
        });

        // Esc para cerrar login
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const overlay = document.getElementById('adminLoginOverlay');
                if (overlay?.classList.contains('active')) {
                    closeLogin();
                }
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
                console.log('✅ adminPanel: Supabase detectado, inicializando...');
                setupSecretTrigger();
                setupEventListeners();
                console.log('🔐 Panel Admin listo. Click 5 veces en el logo o Ctrl+Shift+A.');
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
        reload: () => switchView(AdminState.currentView)
    };

}());
