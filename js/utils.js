// ============================================================
// utils.js — Umumiy yordamchi funksiyalar
// ============================================================
// Faqat sof (pure) yordamchi funksiyalar.
// Bu faylda DOM manipulyatsiya, API chaqiruvlari bo'lmaydi.
// ============================================================

// ============================================================
// 1. XSS HIMOYA — escapeHtml
// ============================================================

/**
 * Foydalanuvchidan kelgan matnni HTML-xavfsiz holga keltiradi.
 * innerHTML ga qo'yishdan OLDIN DOIM shu funksiyadan o'tkazing.
 *
 * @param {string} text — tozalanishi kerak bo'lgan matn
 * @returns {string}    — xavfsiz HTML matn
 *
 * @example
 *   element.innerHTML = escapeHtml(user.fullName);
 */
export function escapeHtml(text) {
  if (text === null || text === undefined) return '';

  return String(text)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#039;');
}

// ============================================================
// 2. CSS URL — cssUrl va safeCssUrl
// ============================================================

/**
 * Qiymatni CSS url() funksiyasiga o'raydi.
 * Ichki tırnoqlarni escape qiladi.
 *
 * @param {string} url — rasm yoki resurs manzili
 * @returns {string}   — CSS url() qiymati
 *
 * @example
 *   element.style.backgroundImage = cssUrl('/images/cover.jpg');
 *   // → "url('/images/cover.jpg')"
 */
export function cssUrl(url) {
  if (!url) return '';

  // CSS url() ichidagi tırnoqlarni escape qilamiz
  const escaped = String(url).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `url('${escaped}')`;
}

/**
 * URL ni tekshirib, xavfsiz bo'lsa CSS url() ga o'raydi.
 * javascript: va data: protokollarini rад etadi.
 * URL noto'g'ri bo'lsa bo'sh string qaytaradi.
 *
 * @param {string} url — tekshiriladigan URL
 * @returns {string}   — xavfsiz CSS url() yoki bo'sh string
 *
 * @example
 *   element.style.backgroundImage = safeCssUrl(userProvidedUrl);
 */
export function safeCssUrl(url) {
  if (!url) return '';

  const trimmed = String(url).trim().toLowerCase();

  // Xavfli protokollarni rad etamiz
  if (trimmed.startsWith('javascript:')) return '';
  if (trimmed.startsWith('data:')       &&
      !trimmed.startsWith('data:image/')) return '';

  return cssUrl(url);
}

// ============================================================
// 3. SANA FORMATI — formatDate
// ============================================================

/**
 * Sanani YYYY-MM-DD formatida qaytaradi (streak tizimi uchun).
 * toLocaleDateString() EMAS — bu funksiya ishlatilishi SHART.
 *
 * @param {Date|string|number} [date=new Date()] — sana (default: bugun)
 * @returns {string} — "YYYY-MM-DD" formatida sana
 *
 * @example
 *   formatDate();               // "2025-03-15"
 *   formatDate(new Date(2025, 0, 5)); // "2025-01-05"
 */
export function formatDate(date = new Date()) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  const d = date instanceof Date ? date : new Date(date);

  if (isNaN(d.getTime())) return '';

  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day   = String(d.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Har qanday sanani (Date, ISO string, timestamp) mahalliy vaqtdagi YYYY-MM-DD ga aylantiradi.
 * @param {Date|string|number|null} input
 * @returns {string|null}
 */
export function toLocalDateString(input) {
  if (!input) return null;
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input;
  }
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return null;
  return formatDate(d);
}

/**
 * Ikki sana (YYYY-MM-DD) orasidagi kalendar kunlar farqini hisoblaydi.
 * Masalan: daysBetween('2026-09-05', '2026-09-06') => 1
 * @param {string} dateStr1
 * @param {string} dateStr2
 * @returns {number}
 */
export function daysBetween(dateStr1, dateStr2) {
  if (!dateStr1 || !dateStr2) return 0;
  const p1 = dateStr1.split('-').map(Number);
  const p2 = dateStr2.split('-').map(Number);
  const d1 = Date.UTC(p1[0], p1[1] - 1, p1[2]);
  const d2 = Date.UTC(p2[0], p2[1] - 1, p2[2]);
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

/**
 * Bugungi sanani YYYY-MM-DD formatida qaytaradi.
 *
 * @returns {string}
 */
export function today() {
  return formatDate(new Date());
}

/**
 * Kechagi sanani YYYY-MM-DD formatida qaytaradi.
 *
 * @returns {string}
 */
export function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDate(d);
}

// ============================================================
// 4. UI YORDAMCHILARI — notification, loading
// ============================================================

/**
 * Foydalanuvchiga bildirishnoma ko'rsatadi.
 * CSS klassini loyihadagi mavjud .notification klassiga moslashtiring.
 *
 * @param {string} message  — ko'rsatiladigan matn
 * @param {'success'|'error'|'info'|'warning'} [type='info'] — turi
 * @param {number} [duration=3000] — avtomatik yopilish (ms), 0 = yopilmaydi
 */
export function showNotification(message, type = 'info', duration = 3000) {
  // Eski bildirishnomalarni tozalaymiz
  document.querySelectorAll('.notification').forEach(el => el.remove());

  const el = document.createElement('div');
  el.className = `notification notification--${type}`;
  el.textContent = message; // innerHTML EMAS — XSS xavfi yo'q

  // ARIA accessibility
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-live', 'polite');

  document.body.appendChild(el);

  // Kirish animatsiyasi
  requestAnimationFrame(() => el.classList.add('notification--visible'));

  if (duration > 0) {
    setTimeout(() => {
      el.classList.remove('notification--visible');
      setTimeout(() => el.remove(), 300); // CSS transition kutamiz
    }, duration);
  }
}

/**
 * Tugmani loading holatiga o'tkazadi yoki tiklaydi.
 *
 * @param {HTMLButtonElement} button   — boshqariladigan tugma
 * @param {boolean}           loading  — true = loading, false = oddiy holat
 * @param {string}            [originalText] — loading=false da qo'yiladigan matn
 */
export function setButtonLoading(button, loading, originalText = '') {
  if (!button) return;

  if (loading) {
    button.dataset.originalText = button.textContent;
    button.textContent = 'Yuklanmoqda...';
    button.disabled = true;
    button.classList.add('btn--loading');
  } else {
    const text = originalText || button.dataset.originalText || '';
    button.textContent = text;
    button.disabled = false;
    button.classList.remove('btn--loading');
    delete button.dataset.originalText;
  }
}

// ============================================================
// 5. SUPABASE XATO XABARLARI — uzbekifyError
// ============================================================

/**
 * Supabase xato xabarini o'zbekchaga tarjima qiladi.
 *
 * @param {Error|{message:string}|string} error — Supabase xatosi
 * @returns {string} — foydalanuvchiga ko'rsatiladigan o'zbekcha xabar
 */
export function uzbekifyError(error) {
  const msg = (error?.message || String(error) || '').toLowerCase();

  const MAP = [
    // Auth xatolari
    [/invalid login credentials/,            'Login yoki parol noto\'g\'ri.'],
    [/email not confirmed/,                  'Email tasdiqlanmagan. Pochta qutingizni tekshiring.'],
    [/user already registered/,              'Bu foydalanuvchi allaqachon ro\'yxatdan o\'tgan.'],
    [/password should be at least/,          'Parol kamida 6 ta belgidan iborat bo\'lishi kerak.'],
    [/email.*invalid/,                       'Email manzili noto\'g\'ri formatda.'],
    [/too many requests/,                    'Juda ko\'p urinish. Biroz kuting.'],
    [/network.*error|failed to fetch/,       'Internet ulanishini tekshiring.'],
    [/jwt expired/,                          'Sessiya muddati tugagan. Qayta kiring.'],
    [/row.*level.*security|rls/,             'Ruxsat yo\'q.'],
    [/duplicate key.*violates.*unique/,      'Bu ma\'lumot allaqachon mavjud.'],
    [/timeout|etimedout/,                    'So\'rov vaqti tugadi. Qayta urinib ko\'ring.'],
    [/not found|does not exist/,             'Ma\'lumot topilmadi.'],
    [/permission denied/,                    'Ruxsat yo\'q.'],
    [/offline|connection_reset|aloqa yo'q|server vaqtincha/, 'Internet yoki server bilan aloqa yo\'q. Qayta urinib ko\'ring.'],
    [/503|service unavailable/,              'Server vaqtincha band. Qayta urinib ko\'ring.'],
  ];

  for (const [pattern, uzText] of MAP) {
    if (pattern.test(msg)) return uzText;
  }

  // Tarjima topilmasa umumiy xabar
  return 'Xatolik yuz berdi. Qayta urinib ko\'ring.';
}

// ============================================================
// 6. BOSHQA YORDAMCHILAR
// ============================================================

/**
 * Qiymatni aniq raqamga aylantiradi.
 * NaN, null, undefined → 0
 *
 * @param {*} value
 * @returns {number}
 */
export function toNumber(value) {
  const n = Number(value);
  return isNaN(n) ? 0 : n;
}

/**
 * Massivni aralashtirib tashlaydi (Fisher-Yates).
 *
 * @template T
 * @param {T[]} array — aralashtirilishi kerak bo'lgan massiv
 * @returns {T[]}     — yangi aralashtirilgan massiv (original o'zgarmaydi)
 */
export function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Matnni qisqartiradi, uzun bo'lsa "..." qo'shadi.
 *
 * @param {string} text    — qisqartirilishi kerak bo'lgan matn
 * @param {number} maxLen  — maksimal belgilar soni (default: 100)
 * @returns {string}
 */
export function truncate(text, maxLen = 100) {
  const str = String(text || '');
  return str.length > maxLen ? str.slice(0, maxLen).trimEnd() + '...' : str;
}

/**
 * Millisekundlarda berilgan vaqt kutadi (async/await uchun).
 *
 * @param {number} ms — kutish vaqti (ms)
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Kitobchi logotipi: Concept 1 "Ochiq kitob sahifalari + K monogrammasi"
 * Vektorli SVG dizayn (0ms yuklanish, yuqori sifat, dark/light moslashuvchan)
 */
export const LOGO_SVG = `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="kitobchi-logo-svg" aria-hidden="true">
  <!-- Chap kitob ustuni (K poyasi) -->
  <rect x="12" y="10" width="10" height="44" rx="3.5" fill="#D97706"/>
  <line x1="17" y1="14" x2="17" y2="50" stroke="#FEF3C7" stroke-width="1.2" stroke-linecap="round" stroke-opacity="0.6"/>
  <!-- Yuqori o'ng sahifa (K yuqori qanoti) -->
  <path d="M22 28 C26 21 34 14 46 11 C47.7 10.5 49.5 11.8 49.5 13.6 L49.5 20.2 C49.5 21.2 48.7 22.1 47.7 22.4 C39 25 32 30 26.5 35.5 Z" fill="#F59E0B"/>
  <path d="M28 25 C34 20 40 16 46 14.5" stroke="#FFFFFF" stroke-width="1" stroke-linecap="round" stroke-opacity="0.6"/>
  <!-- Quyi o'ng sahifa (K quyi qanoti) -->
  <path d="M23 33 C31 38.5 39 44.5 47.5 47.8 C48.8 48.3 49.5 49.5 49.5 50.8 L49.5 54.2 C49.5 55.9 47.7 57.1 46.1 56.4 C34 51 26 42 22 36 Z" fill="#D97706"/>
  <!-- Markaziy ma'rifat nuqtasi -->
  <circle cx="23.5" cy="32" r="2.5" fill="#FEF3C7"/>
  <circle cx="23.5" cy="32" r="4.5" stroke="#FEF3C7" stroke-width="0.75" stroke-opacity="0.6"/>
</svg>`;

// ============================================================
// 6b. UI SVG IKONKALAR (DESIGN.md: emoji o'rniga vektor ikonka)
// ============================================================
const SVG_ICONS = {
  lock:     '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path>',
  unlock:   '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path>',
  flame:    '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>',
  candle:   '<path d="M12 2c1.2 2.2 2.5 3.6 2.5 5.8a2.5 2.5 0 1 1-5 0C9.5 5.6 10.8 4.2 12 2z"></path><rect x="8" y="11" width="8" height="11" rx="1.5"></rect>',
  trophy:   '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>',
  bolt:     '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line>',
  comment:  '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>',
  pencil:   '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>',
  crown:    '<path d="m2 6 3.5 11a1 1 0 0 0 .95.7h11.1a1 1 0 0 0 .95-.7L22 6l-5 4.5L12 3 7 10.5Z"></path><path d="M6 21h12"></path>',
  sprout:   '<path d="M7 20h10"></path><path d="M10 20c5.5-2.5.8-6.4 3-10"></path><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"></path><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"></path>',
  target:   '<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle>',
  sparkle:  '<path d="M12 3l1.9 5.7a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-2a2 2 0 0 0 1.3-1.3Z"></path>',
  book:     '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>',
  brain:    '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"></path><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"></path>',
  bulb:     '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"></path><path d="M9 18h6"></path><path d="M10 22h4"></path>',
  info:     '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>',
  volume:   '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>',
  'volume-off': '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="22" y1="9" x2="16" y2="15"></line><line x1="16" y1="9" x2="22" y2="15"></line>',
  star:     '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>',
  'arrow-up':   '<line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline>',
  'arrow-down': '<line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline>',
  shield:   '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>',
  camera:   '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle>',
  link:     '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>',
};

/**
 * Inline SVG ikonka HTML kodini qaytaradi (emoji o'rniga).
 * @param {string} name — SVG_ICONS kaliti
 * @param {number} [size=16]
 * @param {string} [extraStyle='']
 * @returns {string}
 */
export function svgIcon(name, size = 16, extraStyle = '') {
  const body = SVG_ICONS[name];
  if (!body) return '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-${Math.max(2, Math.round(size * 0.15))}px;${extraStyle}">${body}</svg>`;
}

// ============================================================
// 7. AUDIO EFFEKTLARI (Web Audio API — 0ms kechikish, tashqi faylsiz)
// ============================================================
let _audioCtx = null;
function _getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!_audioCtx) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) _audioCtx = new AudioCtx();
    } catch {
      return null;
    }
  }
  if (_audioCtx && _audioCtx.state === 'suspended') {
    _audioCtx.resume().catch(() => {});
  }
  return _audioCtx;
}

/**
 * Tovush effektlari yoqilganligini tekshiradi.
 * @returns {boolean}
 */
export function isSoundEnabled() {
  try {
    return localStorage.getItem('kitobchi_sound_enabled') !== 'false';
  } catch {
    return true;
  }
}

/**
 * Tovush effektlarini yoqish yoki o'chirish.
 * @param {boolean} enabled
 */
export function setSoundEnabled(enabled) {
  try {
    localStorage.setItem('kitobchi_sound_enabled', enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('kitobchi_sound_toggled', { detail: enabled }));
  } catch {}
}

/**
 * Test va geymifikatsiya uchun audio effektlarni ijro etadi.
 * @param {'correct'|'wrong'|'tick'|'levelup'} type
 */
export function playQuizSound(type) {
  if (!isSoundEnabled()) return;
  try {
    const ctx = _getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'correct') {
      // Yoqimli, uyg'un arfa/chime (C5 -> E5 -> G5)
      const notes = [523.25, 659.25, 783.99];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.08);
        gain.gain.setValueAtTime(0, now + i * 0.08);
        gain.gain.linearRampToValueAtTime(0.18, now + i * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.36);
      });
    } else if (type === 'wrong') {
      // Yumshoq, past akkord (G3 -> E3)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(146.83, now + 0.28);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.31);
    } else if (type === 'tick') {
      // Sekund strelkasi / taymer signali
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.06);
    } else if (type === 'levelup') {
      // Tantana fanfare akkordi (G4 -> C5 -> E5 -> G5 -> C6)
      const fanfare = [392.00, 523.25, 659.25, 783.99, 1046.50];
      fanfare.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.09);
        gain.gain.setValueAtTime(0, now + i * 0.09);
        gain.gain.linearRampToValueAtTime(0.22, now + i * 0.09 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.09);
        osc.stop(now + i * 0.09 + 0.46);
      });
    }
  } catch { /* Audio bloklangan bo'lsa xavfsiz o'tish */ }
}

// ============================================================
// 8. TIPOGRAFIK KITOB MUQOVASI PLACEHOLDERI
// ============================================================

/**
 * Kitob ID yoki nomiga qarab barqaror editorial mato rangini aniqlaydi.
 * @param {object} book
 * @returns {string}
 */
export function getCoverThemeClass(book) {
  const themes = [
    'book-cover-theme-navy',
    'book-cover-theme-emerald',
    'book-cover-theme-ruby',
    'book-cover-theme-terracotta',
    'book-cover-theme-indigo',
    'book-cover-theme-walnut',
    'book-cover-theme-ochre'
  ];
  const str = String(book?.id || book?.title || 'kitob');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % themes.length;
  return themes[idx];
}

/**
 * Muqovasi yo'q yoki yuklanmagan kitoblar uchun tipografik nafis muqova HTML kodini yaratadi.
 * @param {object} book
 * @param {object} [options={}]
 * @returns {string}
 */
export function renderBookCoverPlaceholder(book, options = {}) {
  if (!book) book = { title: 'Kitob', author: '' };
  const title = book.title || 'Kitob';
  const author = book.author || 'Noma\'lum muallif';
  const genre = book.category || book.genre || 'Adabiyot';
  const themeClass = getCoverThemeClass(book);
  const isLarge = options.size === 'lg';

  return `
    <div class="book-cover-placeholder ${themeClass} ${isLarge ? 'book-cover-placeholder--lg' : ''}" style="${options.style || ''}">
      <div class="book-cover-placeholder__inner-frame"></div>
      <div class="book-cover-placeholder__header">
        <span class="book-cover-placeholder__genre">${escapeHtml(genre)}</span>
      </div>
      <div class="book-cover-placeholder__body">
        <span class="book-cover-placeholder__emblem" aria-hidden="true">${svgIcon('book', 22)}</span>
        <div class="book-cover-placeholder__title">${escapeHtml(truncate(title, isLarge ? 50 : 28))}</div>
        <div class="book-cover-placeholder__divider"></div>
      </div>
      <div class="book-cover-placeholder__footer">
        <span class="book-cover-placeholder__author">${escapeHtml(truncate(author, isLarge ? 30 : 20))}</span>
      </div>
    </div>
  `;
}

/**
 * Kitobning to'g'ri va haqiqiy muqova URL manzilini aniqlaydi.
 * Picsum yoki yaroqsiz placeholderlarni avtomatik filtrlaydi.
 * @param {object} book
 * @returns {string} — Haqiqiy rasm URL manzili yoki bo'sh satr
 */
export function getBookCoverUrl(book) {
  if (!book) return '';
  const candidates = [book.cover_url, book.cover, book.coverImage];
  for (const c of candidates) {
    if (typeof c === 'string') {
      const trimmed = c.trim();
      if (trimmed && trimmed !== '📖' && !trimmed.includes('picsum.photos')) {
        if (trimmed.startsWith('data:image/') || trimmed.startsWith('http://') || trimmed.startsWith('https://') || isImageUrl(trimmed)) {
          return trimmed;
        }
      }
    }
  }
  return '';
}

// ============================================================
// 8. KRIPTOGRAFIYA VA XAVFSIZLIK (Web Crypto API)
// ============================================================

/**
 * Tasodifiy heksadesimal tuz (salt) yaratadi.
 * @param {number} [byteLen=16]
 * @returns {string}
 */
export function generateSalt(byteLen = 16) {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(byteLen);
    crypto.getRandomValues(bytes);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

/**
 * Parol va tuzni SHA-256 orqali xeshlaydi.
 * @param {string} password
 * @param {string} salt
 * @returns {Promise<string>} - hex string
 */
export async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(`${password}:${salt}`);
  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let hash = 0;
  const str = `${password}:${salt}`;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

/**
 * Parolni xesh bilan tekshiradi.
 * @param {string} password
 * @param {string} salt
 * @param {string} expectedHash
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, salt, expectedHash) {
  if (!password || !expectedHash) return false;
  const computed = await hashPassword(password, salt);
  return computed.toLowerCase() === String(expectedHash).toLowerCase();
}

/**
 * Sessiya yaxlitligini ta'minlovchi kriptografik imzo.
 * @param {string} userId
 * @param {string} role
 * @returns {Promise<string>}
 */
export async function generateSessionToken(userId, role) {
  const secretKey = 'kitobchi_session_sig_v1_secure';
  return hashPassword(`${userId}:${role}`, secretKey);
}

const ADMIN_SESSION_KEY_STORAGE = 'kitobchi_adm_active_sig_token';

/**
 * Dinamik sessiya tokenini xavfsiz saqlash (faqat faol tab/sessiyada saqlanadi).
 * @param {string|null} token
 */
export function setAdminSessionSecret(token) {
  try {
    if (typeof sessionStorage !== 'undefined') {
      if (token) {
        sessionStorage.setItem(ADMIN_SESSION_KEY_STORAGE, token);
      } else {
        sessionStorage.removeItem(ADMIN_SESSION_KEY_STORAGE);
      }
    }
  } catch {}
}

/**
 * Faol sessiya tokenini o'qish
 * @returns {string|null}
 */
export function getAdminSessionSecret() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      return sessionStorage.getItem(ADMIN_SESSION_KEY_STORAGE);
    }
  } catch {}
  return null;
}

/**
 * Moslik uchun saqlangan token generatori (tashqi soxtalashtirishdan himoyalangan)
 */
export function createDynamicAdminToken() {
  return generateSalt(32);
}

/**
 * Sessiya yaxlitligini tekshiradi (soxtalashtirishdan himoya).
 * LocalStorage ni o'zgartirib adminlikka o'tishga urinishlarni to'liq bartaraf qiladi.
 * @param {object|null} user
 * @returns {boolean}
 */
export function verifySessionSignature(user) {
  if (!user) return false;
  if (user.role === 'admin' || user.isAdmin === true || user.is_admin === true) {
    const activeSecret = getAdminSessionSecret();
    if (!activeSecret || !user.sessionToken) return false;
    return user.sessionToken === activeSecret;
  }
  return true;
}

/**
 * Berilgan qiymat haqiqiy rasm URL (http/https), data URI yoki nisbiy rasm yo'li ekanligini tekshiradi.
 * Emoji yoki oddiy matnlarni rasm deb hisoblamaydi (broken image img teglarining oldini oladi).
 * @param {*} val
 * @returns {boolean}
 */
export function isImageUrl(val) {
  if (!val || typeof val !== 'string') return false;
  const s = val.trim();
  return s.startsWith('http://') ||
         s.startsWith('https://') ||
         s.startsWith('data:image/') ||
         s.startsWith('/') ||
         s.startsWith('./') ||
         s.startsWith('../') ||
         /^[\w-]+\/[\w./-]+\.(jpe?g|png|webp|gif|svg|avif)$/i.test(s);
}

/**
 * PostgREST / SQL query inputlarini xavfsiz tozalash.
 * Maxsus PostgREST operatorlari, qavslar va injection belgilarini olib tashlaydi.
 * @param {*} input
 * @returns {string}
 */
export function sanitizeQueryInput(input) {
  if (typeof input !== 'string') return String(input || '');
  return input.replace(/[\x00-\x1f"'\\]/g, '').trim();
}

/**
 * ID va slug larni xavfsiz tozalash (faqat harflar, raqamlar, chiziqcha va pastki chiziq).
 * @param {*} input
 * @returns {string}
 */
export function sanitizeIdentifier(input) {
  if (typeof input !== 'string') return String(input || '');
  return input.replace(/[^a-zA-Z0-9_\-]/g, '').trim();
}

// ============================================================
// 9. RIVOJLANISH VA GEYMIFIKATSIYA (PROGRESSION)
// ============================================================
export * from './progression.js';




