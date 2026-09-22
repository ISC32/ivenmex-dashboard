/*
 * Optimizacion de consultas y actualizacion selectiva del dashboard INVEMEX.
 * Cargar despues de dashboardInvemex.js con defer.
 */
(function () {
    'use strict';
    const App = window.App;
    const client = window.supabaseClient;
    if (!App || !client) return;

    const cache = new Map();
    const inflight = new Map();
    const TTL = 30000;
    let timer = null;
    let running = false;

    function invalidate(...keys) { keys.forEach(key => cache.delete(key)); }
    async function cached(key, loader, ttl = TTL) {
        const hit = cache.get(key);
        if (hit && Date.now() - hit.time < ttl) return hit.value;
        if (inflight.has(key)) return inflight.get(key);
        const request = Promise.resolve().then(loader).then(value => {
            cache.set(key, { value, time: Date.now() });
            return value;
        }).finally(() => inflight.delete(key));
        inflight.set(key, request);
        return request;
    }

    const originalRefresh = App.refrescarDatosSilencioso?.bind(App);
    App.refrescarDatosSilencioso = function () {
        clearTimeout(timer);
        timer = setTimeout(async () => {
            if (running) return;
            running = true;
            invalidate('clientes', 'productos');
            try {
                if (originalRefresh) await originalRefresh();
                else await App.cargarDatos?.();
            } finally { running = false; }
        }, 500);
    };

    App.cargarClientes = App.cargarClientes ? (() => {
        const load = App.cargarClientes.bind(App);
        return () => cached('clientes', load);
    })() : App.cargarClientes;
    App.cargarProductos = App.cargarProductos ? (() => {
        const load = App.cargarProductos.bind(App);
        return () => cached('productos', load);
    })() : App.cargarProductos;
    App.invalidateQueryCache = () => {
        invalidate('clientes', 'productos');
        App.refrescarDatosSilencioso();
    };

    ['pedidos', 'tareas', 'empleados', 'clientes', 'productos'].forEach(table => {
        client.channel(`ivx-optimizer-${table}`)
            .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
                invalidate(table, 'clientes', 'productos');
                App.refrescarDatosSilencioso();
            })
            .subscribe();
    });
}());
