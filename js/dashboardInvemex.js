/*
 * Puente de compatibilidad: el archivo completo de la aplicacion vive en el
 * commit estable anterior. Se carga de forma sincrona para que CONFIG, STATE,
 * App e init existan antes de DOMContentLoaded.
 */
document.write('<script src="https://raw.githubusercontent.com/ISC32/ivenmex-dashboard/dcdeaa4411f1df7a1dc295e04b1b893218c2915a/js/dashboardInvemex.js"><\\/script>');
document.write('<script src="js/dashboardTV.js?v=2"><\\/script>');
