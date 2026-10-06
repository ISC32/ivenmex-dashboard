/* ==========================================
   IVENMEX - PANEL ADMIN OCULTO
   v1.0 - Protegido por contraseña + IA
   ========================================== */

(function () {
    'use strict';

    // ==========================================
    // CONFIGURACIÓN
    // ==========================================
    const ADMIN_CONFIG = {
        // 🔒 CAMBIA ESTA CONTRASEÑA
        PASSWORD_HASH: 'ivenmex2024', // Simple por ahora, se puede hashear después
        SESSION_KEY: 'ivx_admin_session',
        SESSION_DURATION: 2 * 60 * 60 * 1000, // 2 horas

        // 🤖 ENDPOINT DEL WEBHOOK DE N8N (cámbialo por el tuyo)
        // Ejemplo: 'https://tu-n8n.com/webhook/chatbot-ivenmex'
        N8N_WEBHOOK_URL: '', // Si está vacío, usa el motor de IA local

        // 🔑 API KEY de OpenAI (opcional, para IA local)
        OPENAI_API_KEY: '' // Si está vacío, usa consultas SQL directas
    };

    // ==========================================
    // ESTADO
    // ==========================================
    const AdminState = {
        isAuthenticated: false,
        currentView: 'dashboard',
        clickCount: 0,
        clickTimer: null,
        conversationHistory: []
    };

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
        if (!logo) return;

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

        // También con teclado: Ctrl+Shift+A
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

        // Cargar vista por defecto
        switchView('dashboard');
        loadDashboardStats();
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

        // Actualizar nav items
        document.querySelectorAll('.admin-nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.view === viewName);
        });

        // Actualizar vistas
        document.querySelectorAll('.admin-view').forEach(view => {
            view.classList.toggle('active', view.id === `adminView-${viewName}`);
        });

        // Cargar datos según vista
        switch (viewName) {
            case 'dashboard':
                loadDashboardStats();
                break;
            case 'clientes':
                loadClientes();
                break;
            case 'pedidos':
                loadPedidos();
                break;
            case 'ventas':
                loadVentas();
                break;
            case 'productos':
                loadProductos();
                break;
            case 'inventario':
                loadInventario();
                break;
            case 'ia':
                initIA();
                break;
        }
    }

    // ==========================================
    // CARGA DE DATOS
    // ==========================================
    const supabase = window.supabaseClient;

    async function loadDashboardStats() {
        try {
            const [clientesRes, pedidosRes, ventasRes, productosRes] = await Promise.all([
                supabase.from('clientes').select('*', { count: 'exact', head: true }),
                supabase.from('pedidos').select('*', { count: 'exact', head: true }),
                supabase.from('pagos').select('monto'),
                supabase.from('productos').select('*', { count: 'exact', head: true })
            ]);

            const totalClientes = clientesRes.count || 0;
            const totalPedidos = pedidosRes.count || 0;
            const totalProductos = productosRes.count || 0;
            const totalVentas = (ventasRes.data || []).reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0);

            setText('adminStatClientes', totalClientes);
            setText('adminStatPedidos', totalPedidos);
            setText('adminStatProductos', totalProductos);
            setText('adminStatVentas', formatCurrency(totalVentas));

            // Estadísticas adicionales
            const { data: pedidosData } = await supabase.from('pedidos').select('estado, prioridad');
            const activos = (pedidosData || []).filter(p => p.estado !== 'entregado' && p.estado !== 'cancelado').length;
            const urgentes = (pedidosData || []).filter(p => p.prioridad === 'urgente' && p.estado !== 'entregado' && p.estado !== 'cancelado').length;

            setText('adminStatActivos', activos);
            setText('adminStatUrgentes', urgentes);
        } catch (error) {
            console.error('Error cargando stats:', error);
            showToast('Error al cargar estadísticas', 'error');
        }
    }

    async function loadClientes() {
        try {
            const { data, error } = await supabase
                .from('clientes')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

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
            console.error('Error cargando clientes:', error);
            showToast('Error al cargar clientes', 'error');
        }
    }

    async function loadPedidos() {
        try {
            const { data, error } = await supabase
                .from('pedidos')
                .select(`
                    id, estado, prioridad, total, anticipo, fecha_solicitud,
                    fecha_entrega_prometida, observaciones,
                    clientes (nombre),
                    detalles_pedido (cantidad, productos (nombre))
                `)
                .order('fecha_solicitud', { ascending: false })
                .limit(100);

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
                        <td>${formatCurrency(p.total || 0)}</td>
                        <td>${formatCurrency(p.anticipo || 0)}</td>
                        <td><span class="md-badge ${getEstadoClass(p.estado)}">${getEstadoLabel(p.estado)}</span></td>
                        <td><span class="md-badge ${p.prioridad === 'urgente' ? 'danger' : 'default'}">${p.prioridad || 'normal'}</span></td>
                        <td>${formatDate(p.fecha_entrega_prometida)}</td>
                    </tr>
                `;
            }).join('');
        } catch (error) {
            console.error('Error cargando pedidos:', error);
            showToast('Error al cargar pedidos', 'error');
        }
    }

    async function loadVentas() {
        try {
            const { data, error } = await supabase
                .from('pagos')
                .select(`
                    id, monto, metodo_pago, fecha_pago, referencia, observaciones,
                    pedidos (id, clientes (nombre))
                `)
                .order('fecha_pago', { ascending: false })
                .limit(100);

            if (error) throw error;

            const tbody = document.getElementById('adminTablaVentas');
            if (!tbody) return;

            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="admin-table-empty"><i class="fas fa-dollar-sign"></i>No hay ventas registradas</td></tr>';
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

            // Total
            const total = data.reduce((sum, v) => sum + (parseFloat(v.monto) || 0), 0);
            setText('adminVentasTotal', formatCurrency(total));
        } catch (error) {
            console.error('Error cargando ventas:', error);
            showToast('Error al cargar ventas', 'error');
        }
    }

    async function loadProductos() {
        try {
            const { data, error } = await supabase
                .from('productos')
                .select('*')
                .order('nombre');

            if (error) throw error;

            const tbody = document.getElementById('adminTablaProductos');
            if (!tbody) return;

            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="admin-table-empty"><i class="fas fa-box"></i>No hay productos</td></tr>';
                return;
            }

            tbody.innerHTML = data.map(p => `
                <tr>
                    <td><strong>#${p.id}</strong></td>
                    <td>${escapeHtml(p.nombre || '-')}</td>
                    <td>${escapeHtml(p.categoria || '-')}</td>
                    <td>${escapeHtml(p.material || '-')}</td>
                    <td>${p.precio_por_m2 ? formatCurrency(p.precio_por_m2) + '/m²' : formatCurrency(p.precio_unitario || 0)}</td>
                    <td>${p.activo ? '<span class="md-badge success">Activo</span>' : '<span class="md-badge default">Inactivo</span>'}</td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('Error cargando productos:', error);
            showToast('Error al cargar productos', 'error');
        }
    }

    async function loadInventario() {
        try {
            const { data, error } = await supabase
                .from('inventario_materiales')
                .select('*')
                .order('nombre');

            if (error) throw error;

            const tbody = document.getElementById('adminTablaInventario');
            if (!tbody) return;

            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="admin-table-empty"><i class="fas fa-warehouse"></i>No hay materiales</td></tr>';
                return;
            }

            tbody.innerHTML = data.map(m => {
                const stockBajo = parseFloat(m.stock_actual) <= parseFloat(m.stock_minimo);
                return `
                    <tr>
                        <td><strong>#${m.id}</strong></td>
                        <td>${escapeHtml(m.nombre || '-')}</td>
                        <td>${escapeHtml(m.tipo || '-')}</td>
                        <td>${m.stock_actual} ${m.unidad_medida || ''}</td>
                        <td>${m.stock_minimo} ${m.unidad_medida || ''}</td>
                        <td>${stockBajo ? '<span class="md-badge danger">Stock bajo</span>' : '<span class="md-badge success">OK</span>'}</td>
                    </tr>
                `;
            }).join('');
        } catch (error) {
            console.error('Error cargando inventario:', error);
            showToast('Error al cargar inventario', 'error');
        }
    }

    // ==========================================
    // ASISTENTE IA
    // ==========================================
    function initIA() {
        const messagesEl = document.getElementById('adminIaMessages');
        if (!messagesEl) return;

        // Mensaje de bienvenida si está vacío
        if (messagesEl.children.length === 0) {
            addIAMessage('bot', `¡Hola! 👋 Soy tu asistente de IA para el dashboard de IVENMEX.

Puedo ayudarte con:
• 📊 Consultar clientes, pedidos, ventas y productos
• 📈 Generar reportes y estadísticas
• 🔍 Buscar información específica
• 💡 Responder preguntas sobre tus datos

Prueba preguntarme cosas como:
• "¿Cuántos clientes tengo?"
• "Muéstrame los pedidos urgentes"
• "¿Cuáles son las ventas totales?"
• "¿Qué productos tengo?"`);
        }
    }

    function addIAMessage(role, content) {
        const container = document.getElementById('adminIaMessages');
        if (!container) return;

        const messageEl = document.createElement('div');
        messageEl.className = `ia-message ${role}`;

        const icon = role === 'user' ? 'fa-user' : 'fa-robot';
        const formattedContent = role === 'bot' ? formatBotResponse(content) : escapeHtml(content);

        messageEl.innerHTML = `
            <div class="ia-message-avatar"><i class="fas ${icon}"></i></div>
            <div class="ia-message-content">${formattedContent}</div>
        `;

        container.appendChild(messageEl);
        container.scrollTop = container.scrollHeight;

        // Guardar en historial
        AdminState.conversationHistory.push({ role, content, timestamp: Date.now() });
    }

    function addTypingIndicator() {
        const container = document.getElementById('adminIaMessages');
        if (!container) return null;

        const el = document.createElement('div');
        el.className = 'ia-message bot';
        el.id = 'iaTypingIndicator';
        el.innerHTML = `
            <div class="ia-message-avatar"><i class="fas fa-robot"></i></div>
            <div class="ia-message-content">
                <div class="ia-typing"><span></span><span></span><span></span></div>
            </div>
        `;
        container.appendChild(el);
        container.scrollTop = container.scrollHeight;
        return el;
    }

    function removeTypingIndicator() {
        const el = document.getElementById('iaTypingIndicator');
        if (el) el.remove();
    }

    function formatBotResponse(text) {
        // Convertir markdown simple a HTML
        let html = escapeHtml(text);

        // Negrita **texto**
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        // Código `texto`
        html = html.replace(/`(.+?)`/g, '<code>$1</code>');

        // Saltos de línea
        html = html.replace(/\n/g, '<br>');

        // Listas con viñetas
        html = html.replace(/^• (.+)$/gm, '<li>$1</li>');
        if (html.includes('<li>')) {
            html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
        }

        return html;
    }

    async function sendIAMessage() {
        const input = document.getElementById('adminIaInput');
        const sendBtn = document.getElementById('adminIaSend');
        if (!input || !sendBtn) return;

        const message = input.value.trim();
        if (!message) return;

        // Agregar mensaje del usuario
        addIAMessage('user', message);
        input.value = '';
        input.style.height = 'auto';

        // Deshabilitar botón mientras procesa
        sendBtn.disabled = true;
        addTypingIndicator();

        try {
            let response;

            // Si hay webhook de n8n configurado, usarlo
            if (ADMIN_CONFIG.N8N_WEBHOOK_URL) {
                response = await queryN8N(message);
            } else {
                // Motor de IA local basado en SQL
                response = await queryLocalAI(message);
            }

            removeTypingIndicator();
            addIAMessage('bot', response);
        } catch (error) {
            console.error('Error en IA:', error);
            removeTypingIndicator();
            addIAMessage('bot', '❌ Lo siento, hubo un error al procesar tu consulta. Intenta de nuevo.');
        } finally {
            sendBtn.disabled = false;
            input.focus();
        }
    }

    // ==========================================
    // MOTOR DE IA LOCAL (sin n8n)
    // Analiza la pregunta y consulta Supabase
    // ==========================================
    async function queryLocalAI(question) {
        const q = question.toLowerCase();

        // ===== CLIENTES =====
        if (/(cuántos|cuantos|numero|número|total).*clientes?/.test(q) || /clientes.*total/.test(q)) {
            const { count } = await supabase.from('clientes').select('*', { count: 'exact', head: true });
            return `📊 Actualmente tienes **${count || 0} clientes** registrados en el sistema.`;
        }

        if (/(lista|muestra|ver|dame|cuáles|cuales).*clientes?/.test(q)) {
            const { data } = await supabase.from('clientes').select('id, nombre, telefono, email').limit(20).order('nombre');
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

        if (/buscar.*cliente|cliente.*llamado|cliente.*nombre/.test(q)) {
            const match = question.match(/(?:llamado|nombre|cliente)\s+["']?([A-Za-záéíóúñÁÉÍÓÚÑ\s]+)["']?/i);
            if (match) {
                const termino = match[1].trim();
                const { data } = await supabase.from('clientes').select('*').ilike('nombre', `%${termino}%`).limit(10);
                if (!data || data.length === 0) return `🔍 No encontré clientes que coincidan con "${termino}".`;
                return `🔍 **Encontré ${data.length} cliente(s):**\n\n` + data.map(c =>
                    `• **${c.nombre}** - 📞 ${c.telefono || 'N/A'} - 📧 ${c.email || 'N/A'}`
                ).join('\n');
            }
        }

        // ===== PEDIDOS =====
        if (/(cuántos|cuantos|total).*pedidos?/.test(q)) {
            const { count } = await supabase.from('pedidos').select('*', { count: 'exact', head: true });
            return `📊 Hay **${count || 0} pedidos** en total en el sistema.`;
        }

        if (/pedidos?.*urgentes?|urgentes?/.test(q)) {
            const { data } = await supabase.from('pedidos')
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
            const { data } = await supabase.from('pedidos')
                .select('id, estado, clientes(nombre)')
                .not('estado', 'in', '(entregado,cancelado)')
                .limit(20);

            if (!data || data.length === 0) return '✅ No hay pedidos activos.';
            return `📋 **Pedidos activos** (${data.length}):\n\n` + data.map(p =>
                `• **#${p.id}** - ${p.clientes?.nombre || 'Sin cliente'} - ${p.estado}`
            ).join('\n');
        }

        if (/pedidos?.*(hoy|día|dia)/.test(q)) {
            const hoy = new Date().toISOString().split('T')[0];
            const { data } = await supabase.from('pedidos')
                .select('id, estado, clientes(nombre), fecha_solicitud')
                .gte('fecha_solicitud', hoy)
                .limit(20);

            if (!data || data.length === 0) return '📭 No hay pedidos registrados hoy.';
            return `📅 **Pedidos de hoy** (${data.length}):\n\n` + data.map(p =>
                `• **#${p.id}** - ${p.clientes?.nombre || 'Sin cliente'} - ${p.estado}`
            ).join('\n');
        }

        // ===== VENTAS =====
        if (/(cuánto|cuanto|total).*(vendido|ventas?|ingresos?|facturado)/.test(q)) {
            const { data } = await supabase.from('pagos').select('monto');
            const total = (data || []).reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0);
            return `💰 **Ventas totales:** ${formatCurrency(total)}\n\n📊 Basado en **${data?.length || 0} pagos** registrados.`;
        }

        if (/ventas?.*(mes|meses|último mes)/.test(q)) {
            const hace30 = new Date();
            hace30.setDate(hace30.getDate() - 30);
            const { data } = await supabase.from('pagos')
                .select('monto, fecha_pago')
                .gte('fecha_pago', hace30.toISOString());

            const total = (data || []).reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0);
            return `📅 **Ventas últimos 30 días:** ${formatCurrency(total)}\n\n📊 **${data?.length || 0}** pagos registrados en este período.`;
        }

        if (/ventas?.*(hoy|día|dia)/.test(q)) {
            const hoy = new Date().toISOString().split('T')[0];
            const { data } = await supabase.from('pagos')
                .select('monto')
                .gte('fecha_pago', hoy);

            const total = (data || []).reduce((sum, p) => sum + (parseFloat(p.monto) || 0), 0);
            return `💵 **Ventas de hoy:** ${formatCurrency(total)}\n\n📊 **${data?.length || 0}** pagos registrados.`;
        }

        // ===== PRODUCTOS =====
        if (/(cuántos|cuantos|total).*productos?/.test(q)) {
            const { count } = await supabase.from('productos').select('*', { count: 'exact', head: true });
            return `📦 Tienes **${count || 0} productos** en el catálogo.`;
        }

        if (/(lista|muestra|ver|dame|cuáles|cuales).*productos?/.test(q)) {
            const { data } = await supabase.from('productos').select('id, nombre, categoria, precio_unitario, precio_por_m2').eq('activo', true).limit(20);
            if (!data || data.length === 0) return '📭 No hay productos activos.';

            let respuesta = `📦 **Productos activos** (${data.length}):\n\n`;
            data.forEach(p => {
                const precio = p.precio_por_m2 ? `${formatCurrency(p.precio_por_m2)}/m²` : formatCurrency(p.precio_unitario || 0);
                respuesta += `• **${p.nombre}** (${p.categoria || 'Sin categoría'}) - ${precio}\n`;
            });
            return respuesta;
        }

        // ===== INVENTARIO =====
        if (/(inventario|materiales?|stock)/.test(q)) {
            const { data } = await supabase.from('inventario_materiales').select('*').order('nombre');
            if (!data || data.length === 0) return '📭 No hay materiales en inventario.';

            let respuesta = `📦 **Inventario de materiales** (${data.length}):\n\n`;
            data.slice(0, 15).forEach(m => {
                const alerta = parseFloat(m.stock_actual) <= parseFloat(m.stock_minimo) ? ' ⚠️' : '';
                respuesta += `• **${m.nombre}**: ${m.stock_actual} ${m.unidad_medida || ''}${alerta}\n`;
            });
            if (data.length > 15) respuesta += `\n_... y ${data.length - 15} materiales más._`;
            return respuesta;
        }

        if (/stock.*bajo|materiales?.*(bajo|bajos|agotar|agotado)/.test(q)) {
            const { data } = await supabase.from('inventario_materiales').select('*');
            const bajos = (data || []).filter(m => parseFloat(m.stock_actual) <= parseFloat(m.stock_minimo));

            if (bajos.length === 0) return '✅ Todos los materiales tienen stock suficiente.';
            return `⚠️ **Materiales con stock bajo** (${bajos.length}):\n\n` + bajos.map(m =>
                `• **${m.nombre}**: ${m.stock_actual} ${m.unidad_medida || ''} (mín: ${m.stock_minimo})`
            ).join('\n');
        }

        // ===== EMPLEADOS =====
        if (/(cuántos|cuantos|total).*empleados?/.test(q)) {
            const { count } = await supabase.from('empleados').select('*', { count: 'exact', head: true }).eq('activo', true);
            return `👥 Tienes **${count || 0} empleados activos**.`;
        }

        if (/(lista|muestra|ver|dame).*empleados?/.test(q)) {
            const { data } = await supabase.from('empleados').select('nombre, apellido, cargo, email').eq('activo', true);
            if (!data || data.length === 0) return '📭 No hay empleados activos.';
            return `👥 **Empleados activos** (${data.length}):\n\n` + data.map(e =>
                `• **${e.nombre} ${e.apellido || ''}** - ${e.cargo || 'Sin cargo'}`
            ).join('\n');
        }

        // ===== REPORTES =====
        if (/(resumen|reporte|estadísticas?|estadisticas?|dashboard)/.test(q)) {
            const [clientes, pedidos, productos, ventasData, pedidosData] = await Promise.all([
                supabase.from('clientes').select('*', { count: 'exact', head: true }),
                supabase.from('pedidos').select('*', { count: 'exact', head: true }),
                supabase.from('productos').select('*', { count: 'exact', head: true }),
                supabase.from('pagos').select('monto'),
                supabase.from('pedidos').select('estado, prioridad')
            ]);

            const totalVentas = (ventasData.data || []).reduce((s, p) => s + (parseFloat(p.monto) || 0), 0);
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
                `💡 **Tip:** Puedes hacer preguntas más específicas como "buscar cliente Juan" o "ventas del último mes".`;
        }

        // ===== SALUDO =====
        if (/^(hola|buenos|buenas|hey|hi)/.test(q)) {
            return `¡Hola! 👋 ¿En qué puedo ayudarte hoy?\n\nPrueba preguntarme sobre clientes, pedidos, ventas, productos o inventario.`;
        }

        // ===== RESPUESTA POR DEFECTO =====
        return `🤔 No estoy seguro de cómo responder a eso.\n\nIntenta con:\n` +
            `• "¿Cuántos clientes tengo?"\n` +
            `• "Muéstrame los pedidos urgentes"\n` +
            `• "Ventas totales"\n` +
            `• "Resumen general"\n` +
            `• "Ayuda" para ver todos los comandos`;
    }

    // ==========================================
    // CONSULTA A N8N (si está configurado)
    // ==========================================
    async function queryN8N(question) {
        try {
            const response = await fetch(ADMIN_CONFIG.N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: question,
                    history: AdminState.conversationHistory.slice(-5),
                    timestamp: new Date().toISOString()
                })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();

            // Soportar múltiples formatos de respuesta
            return data.response || data.message || data.output || data.text || JSON.stringify(data);
        } catch (error) {
            console.error('Error consultando n8n:', error);
            // Fallback al motor local
            return await queryLocalAI(question);
        }
    }

    // ==========================================
    // UTILIDADES
    // ==========================================
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function formatCurrency(amount) {
        const num = parseFloat(amount) || 0;
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
            control_calidad: 'Control de Calidad', listo: 'Listo', entregado: 'Entregado', cancelado: 'Cancelado'
        };
        return map[estado] || estado || '-';
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

        // IA
        document.getElementById('adminIaSend')?.addEventListener('click', sendIAMessage);
        document.getElementById('adminIaInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendIAMessage();
            }
        });
        document.getElementById('adminIaInput')?.addEventListener('input', (e) => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
        });

        // Sugerencias IA
        document.querySelectorAll('.admin-ia-suggestion').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = document.getElementById('adminIaInput');
                if (input) {
                    input.value = btn.dataset.query || btn.textContent;
                    sendIAMessage();
                }
            });
        });

        // Escape para cerrar
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && AdminState.isAuthenticated) {
                const loginOverlay = document.getElementById('adminLoginOverlay');
                if (!loginOverlay?.classList.contains('active')) {
                    // Solo cerrar si no está en login
                }
            }
        });
    }

    // ==========================================
    // INICIALIZACIÓN
    // ==========================================
    function init() {
        if (!window.supabaseClient) {
            console.warn('⚠️ adminPanel: supabaseClient no disponible, reintentando...');
            setTimeout(init, 500);
            return;
        }

        setupSecretTrigger();
        setupEventListeners();

        console.log('🔐 Panel Admin inicializado. Click 5 veces en el logo o Ctrl+Shift+A para acceder.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Exponer API pública
    window.AdminPanel = {
        open: openLogin,
        close: closeAdminPanel,
        logout,
        switchView
    };
}());
