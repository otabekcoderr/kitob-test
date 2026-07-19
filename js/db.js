// ============================================================
// db.js — Ma'lumotlar bazasi bilan ishlash
// ============================================================
// Barcha Supabase so'rovlari shu yerda.
// Tartib: avval Supabase, xato bo'lsa data.js fallback.
// Merge EMAS — biri ishlasa ikkinchisi chaqirilmaydi.
//
// Import qilinadi: supabase-client.js, auth.js, data.js
// Bu fayldan import qilinadi: barcha sahifa skriptlari
// ============================================================

import { supabase } from './supabase-client.js';
import { getCurrentUser } from './auth.js';
import * as localData from './data.js';

// ============================================================
// KONSTANTALAR
// ============================================================

/** So'rov timeout vaqti — 10 soniya */
const TIMEOUT = 10_000;

// ============================================================
// ICHKI YORDAMCHI FUNKSIYALAR
// ============================================================

/**
 * Joriy foydalanuvchining Supabase JWT tokenini qaytaradi.
 * Token topilmasa — null.
 *
 * @returns {Promise<string|null>}
 */
export async function getAccessToken() {
    try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session) return null;
        return session.access_token;
    } catch {
        return null;
    }
}

/**
 * Promise ga timeout qo'shadi.
 * TIMEOUT ms ichida javob kelmasa — xato otadi.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} [ms=TIMEOUT]
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms = TIMEOUT) {
    const timer = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), ms)
    );
    return Promise.race([promise, timer]);
}

/**
 * Supabase so'rovini timeout bilan bajaradi.
 * Natija: { data, error } — Supabase formatida.
 *
 * @param {object} query — Supabase query builder
 * @returns {Promise<{data: any, error: any}>}
 */
async function runQuery(query) {
    try {
        return await withTimeout(query);
    } catch (err) {
        return { data: null, error: err };
    }
}

// ============================================================
// KITOBLAR
// ============================================================

/**
 * Barcha kitoblarni qaytaradi.
 *
 * Tartib:
 *   1. Supabase dan olib keladi
 *   2. Xato bo'lsa → data.js fallback (almashtirish, merge emas)
 *
 * @returns {Promise<object[]>} — kitoblar massivi
 */
export async function getBooks() {
    try {
        const { data, error } = await runQuery(
            supabase
                .from('books')
                .select('*')
                .order('title', { ascending: true })
        );

        if (!error && Array.isArray(data) && data.length > 0) {
            return data;
        }

        // Supabase ishlamadi — fallback
        console.warn('[db] getBooks: Supabase xatosi, data.js ishlatilmoqda.');
        return localData.books ?? [];

    } catch (err) {
        console.error('[db] getBooks xatosi:', err);
        return localData.books ?? [];
    }
}

/**
 * Bitta kitobni ID bo'yicha qaytaradi.
 *
 * @param {string|number} bookId
 * @returns {Promise<object|null>}
 */
export async function getBookById(bookId) {
    try {
        const { data, error } = await runQuery(
            supabase
                .from('books')
                .select('*')
                .eq('id', bookId)
                .single()
        );

        if (!error && data) return data;

        // Fallback — data.js dan qidirish
        console.warn('[db] getBookById: Supabase xatosi, data.js ishlatilmoqda.');
        const books = localData.books ?? [];
        return books.find(b => String(b.id) === String(bookId)) ?? null;

    } catch (err) {
        console.error('[db] getBookById xatosi:', err);
        const books = localData.books ?? [];
        return books.find(b => String(b.id) === String(bookId)) ?? null;
    }
}

// ============================================================
// SAVOLLAR
// ============================================================

/**
 * Berilgan kitob uchun savollarni qaytaradi.
 *
 * Tartib:
 *   1. Supabase dan olib keladi
 *   2. Xato bo'lsa → data.js fallback
 *
 * @param {string|number} bookId
 * @returns {Promise<object[]>} — savollar massivi
 */
export async function getQuestions(bookId) {
    try {
        const { data, error } = await runQuery(
            supabase
                .from('questions')
                .select('*')
                .eq('book_id', bookId)
                .order('id', { ascending: true })
        );

        if (!error && Array.isArray(data) && data.length > 0) {
            return data;
        }

        // Fallback
        console.warn('[db] getQuestions: Supabase xatosi, data.js ishlatilmoqda.');
        const allQuestions = localData.questions ?? {};
        return allQuestions[bookId] ?? [];

    } catch (err) {
        console.error('[db] getQuestions xatosi:', err);
        const allQuestions = localData.questions ?? {};
        return allQuestions[bookId] ?? [];
    }
}

// ============================================================
// NATIJALAR (QUIZ RESULTS)
// ============================================================

/**
 * Test natijasini saqlaydi.
 *
 * @param {object} result
 * @param {string|number} result.bookId     — kitob ID
 * @param {number}        result.score      — to'plangan ball
 * @param {number}        result.total      — jami savollar
 * @param {number}        result.percentage — foiz
 * @param {number}        result.penalty    — jarima (anti-cheat)
 * @param {string}        result.date       — "YYYY-MM-DD" formatida
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function saveQuizResult(result) {
    try {
        const user = getCurrentUser();
        if (!user) return { success: false, error: 'Tizimga kirmagansiz.' };

        const { error } = await runQuery(
            supabase.from('quiz_results').insert({
                user_id: user.id,
                book_id: result.bookId,
                score: result.score,
                total: result.total,
                percentage: result.percentage,
                penalty: result.penalty ?? 0,
                date: result.date,
                created_at: new Date().toISOString(),
            })
        );

        if (error) {
            console.error('[db] saveQuizResult xatosi:', error.message);
            return { success: false, error: error.message };
        }

        return { success: true };

    } catch (err) {
        console.error('[db] saveQuizResult xatosi:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Foydalanuvchining barcha test natijalarini qaytaradi.
 *
 * @param {string} [userId] — ko'rsatilmasa joriy foydalanuvchi
 * @returns {Promise<object[]>}
 */
export async function getUserResults(userId) {
    try {
        const uid = userId ?? getCurrentUser()?.id;
        if (!uid) return [];

        const { data, error } = await runQuery(
            supabase
                .from('quiz_results')
                .select('*, books(title, author)')
                .eq('user_id', uid)
                .order('created_at', { ascending: false })
        );

        if (!error && Array.isArray(data)) return data;

        console.warn('[db] getUserResults: Supabase xatosi.');
        return [];

    } catch (err) {
        console.error('[db] getUserResults xatosi:', err);
        return [];
    }
}

// ============================================================
// REYTING (LEADERBOARD)
// ============================================================

/**
 * Eng yuqori ballli foydalanuvchilarni qaytaradi.
 *
 * @param {number} [limit=10] — nechta foydalanuvchi
 * @returns {Promise<object[]>}
 */
export async function getLeaderboard(limit = 10) {
    try {
        const { data, error } = await runQuery(
            supabase
                .from('profiles')
                .select('id, full_name, username, avatar_url, score, streak')
                .order('score', { ascending: false })
                .limit(limit)
        );

        if (!error && Array.isArray(data)) return data;

        console.warn('[db] getLeaderboard: Supabase xatosi.');
        return [];

    } catch (err) {
        console.error('[db] getLeaderboard xatosi:', err);
        return [];
    }
}

// ============================================================
// STREAK YANGILASH
// ============================================================

/**
 * Streak va ballni yangilaydi (test tugaganidan keyin chaqiriladi).
 *
 * Mantiq:
 *   - lastQuizDate kecha bo'lsa → streak + 1
 *   - lastQuizDate bundan oldin bo'lsa → streak = 1
 *   - Bugun allaqachon yechilgan bo'lsa → streak o'zgarmaydi
 *
 * @param {number} earnedScore  — bu testdan olingan ball
 * @param {string} todayDate    — "YYYY-MM-DD" formatida (formatDate() dan)
 * @returns {Promise<{success: boolean, newStreak: number, newScore: number, error?: string}>}
 */
export async function updateStreakAndScore(earnedScore, todayDate) {
    try {
        const user = getCurrentUser();
        if (!user) return { success: false, newStreak: 0, newScore: 0, error: 'Tizimga kirmagansiz.' };

        const lastDate = user.lastQuizDate ?? null;
        const oldStreak = user.streak ?? 0;
        const oldScore = user.score ?? 0;

        // Kecha sanasini hisoblash
        const todayObj = new Date(todayDate);
        const yesterdayObj = new Date(todayObj);
        yesterdayObj.setDate(yesterdayObj.getDate() - 1);
        const yesterdayStr = yesterdayObj.toISOString().slice(0, 10);

        // Streak mantiq
        let newStreak;
        if (lastDate === todayDate) {
            // Bugun allaqachon yechilgan — streak o'zgarmaydi
            newStreak = oldStreak;
        } else if (lastDate === yesterdayStr) {
            // Ketma-ket kun — streak ortadi
            newStreak = oldStreak + 1;
        } else {
            // Ko'p kun o'tib ketgan — streak nollanadi
            newStreak = 1;
        }

        const newScore = oldScore + earnedScore;

        // Supabase profiles yangilash
        const { error } = await runQuery(
            supabase
                .from('profiles')
                .update({
                    score: newScore,
                    streak: newStreak,
                    last_quiz_date: todayDate,
                })
                .eq('id', user.id)
        );

        if (error) {
            console.error('[db] updateStreakAndScore xatosi:', error.message);
            return { success: false, newStreak: oldStreak, newScore: oldScore, error: error.message };
        }

        // localStorage ni ham yangilaymiz
        const { updateProfile } = await import('./auth.js');
        await updateProfile({ score: newScore, streak: newStreak, lastQuizDate: todayDate });

        return { success: true, newStreak, newScore };

    } catch (err) {
        console.error('[db] updateStreakAndScore xatosi:', err);
        return { success: false, newStreak: 0, newScore: 0, error: err.message };
    }
}
