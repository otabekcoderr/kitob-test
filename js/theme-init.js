// ============================================================
// theme-init.js — Temani FOUC (Flash of Unstyled Content) siz yuklash
// va dinamik yilni o'rnatish
// ============================================================

(function () {
  try {
    var saved = localStorage.getItem('kitobchi_theme');
    var theme = (saved === 'dark' || saved === 'light')
      ? saved
      : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) { /* ignore */ }
})();

document.addEventListener('DOMContentLoaded', function () {
  var yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
});
