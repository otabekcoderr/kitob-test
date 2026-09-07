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
// 7. AUDIO EFFEKTLARI (Web Audio API — 0ms kechikish, tashqi faylsiz)
// ============================================================
let _audioCtx = null;
function _getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!_audioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) _audioCtx = new AudioCtx();
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
        <span class="book-cover-placeholder__emblem" aria-hidden="true">📖</span>
        <div class="book-cover-placeholder__title">${escapeHtml(truncate(title, isLarge ? 50 : 28))}</div>
        <div class="book-cover-placeholder__divider"></div>
      </div>
      <div class="book-cover-placeholder__footer">
        <span class="book-cover-placeholder__author">${escapeHtml(truncate(author, isLarge ? 30 : 20))}</span>
      </div>
    </div>
  `;
}

// ============================================================
// 9. RIVOJLANISH VA GEYMIFIKATSIYA (PROGRESSION)
// ============================================================
export * from './progression.js';

