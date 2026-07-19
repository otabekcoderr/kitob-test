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
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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
    if (trimmed.startsWith('data:') &&
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
    const d = date instanceof Date ? date : new Date(date);

    if (isNaN(d.getTime())) return '';

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
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
    // Eski bildirnomalrni tozalaymiz
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
        [/invalid login credentials/, 'Login yoki parol noto\'g\'ri.'],
        [/email not confirmed/, 'Email tasdiqlanmagan. Pochta qutingizni tekshiring.'],
        [/user already registered/, 'Bu foydalanuvchi allaqachon ro\'yxatdan o\'tgan.'],
        [/password should be at least/, 'Parol kamida 6 ta belgidan iborat bo\'lishi kerak.'],
        [/email.*invalid/, 'Email manzili noto\'g\'ri formatda.'],
        [/too many requests/, 'Juda ko\'p urinish. Biroz kuting.'],
        [/network.*error|failed to fetch/, 'Internet ulanishini tekshiring.'],
        [/jwt expired/, 'Sessiya muddati tugagan. Qayta kiring.'],
        [/row.*level.*security|rls/, 'Ruxsat yo\'q.'],
        [/duplicate key.*violates.*unique/, 'Bu ma\'lumot allaqachon mavjud.'],
        [/timeout|etimedout/, 'So\'rov vaqti tugadi. Qayta urinib ko\'ring.'],
        [/not found|does not exist/, 'Ma\'lumot topilmadi.'],
        [/permission denied/, 'Ruxsat yo\'q.'],
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
