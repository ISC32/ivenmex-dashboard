const supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
window.supabaseClient = supabaseClient;
// Carga el perfil visual para televisores sin bloquear la inicializacion de Supabase.
const tvScript = document.createElement('script');
tvScript.src = 'js/dashboardTV.js?v=1';
tvScript.defer = true;
document.head.appendChild(tvScript);
