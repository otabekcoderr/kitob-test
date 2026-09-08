// ============================================================
// supabase-client.js — Supabase ulanish konfiguratsiyasi & Resilient Fetch
// ============================================================
// Vazifasi:
//   1. Supabase client yaratish va export qilish.
//   2. Global Circuit Breaker va Resilient Fetch orqali tarmoq
//      uzilishi (net::ERR_CONNECTION_RESET) vaqtida brauzer konsoliga
//      qizil xatolar chiqishini to'xtatish va 0ms offline fallbackni ta'minlash.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ----------------------------------------------------------
// Muhit o'zgaruvchilari (PRODUCTION da almashtiring)
// ----------------------------------------------------------
const SUPABASE_URL      = 'https://gvgyaxlbpkvpvwpqxjwc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2raJHpiyV55SbGDghEUL5A_2UgIecMn';

// ============================================================
// GLOBAL CIRCUIT BREAKER (Yagona haqiqat manbai)
// ============================================================
let _supabaseOfflineUntil = 0;
let _supabaseFailureCount = 0;

/**
 * Supabase tarmog'i holatini tekshiradi.
 * Agar ketma-ket tarmoq uzilishi / connection reset yuz bergan bo'lsa,
 * brauzerni qotirmaslik va konsolga qizil xatolar chiqarmaslik uchun
 * so'rovlarni vaqtincha to'xtatadi.
 */
export function isSupabaseOnline() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  return Date.now() >= _supabaseOfflineUntil;
}

/**
 * Tarmoq muvaffaqiyatli ishlaganda circuit breaker holatini tozalaydi.
 */
export function markSupabaseSuccess() {
  _supabaseFailureCount = 0;
  _supabaseOfflineUntil = 0;
}

/**
 * Tarmoq uzilishi (ERR_CONNECTION_RESET / timeout / 5xx) aniqlanganda
 * tizimni avtonom kesh rejimiga o'tkazadi.
 */
export function markSupabaseFailure(err) {
  _supabaseFailureCount++;
  // Eksponentsial pauza: 30s, 60s, maksimal 120s
  const pauseMs = Math.min(30_000 * Math.pow(1.5, _supabaseFailureCount - 1), 120_000);
  _supabaseOfflineUntil = Date.now() + pauseMs;
  console.warn(`[supabase] Aloqa uzildi (${err?.message || 'net::ERR_CONNECTION_RESET'}). Tizim ${Math.round(pauseMs / 1000)}s ga avtonom kesh rejimiga o'tkazildi.`);
}

/**
 * Resilient fetch wrapper:
 * 1. Agar Circuit Breaker faol bo'lsa (Supabase vaqtincha mavjud bo'lmasa),
 *    brauzer darajasida umuman tashqi tarmoqqa chiqmaydi, konsolda ERR_CONNECTION_RESET
 *    xatolarini chiqarmaydi va zudlik bilan (0ms) synthetic 503 qaytaradi.
 * 2. Timeout (3500ms) bilan himoyalangan — osilib qolishlarning oldini oladi.
 * 3. Tarmoq uzilishi (ERR_CONNECTION_RESET / Failed to fetch / AbortError) yuz berganda
 *    darhol markSupabaseFailure() ni faollashtiradi va synthetic 503 qaytaradi.
 *    Bu @supabase/postgrest-js dagi fetchWithRetry ning konsolga 3 martadan
 *    qizil xato chiqarishini to'xtatadi.
 */
async function resilientFetch(input, init = {}) {
  if (!isSupabaseOnline()) {
    return new Response(JSON.stringify({
      code: 'OFFLINE_MODE',
      message: 'Supabase vaqtincha mavjud emas. Avtonom kesh rejimida ishlanmoqda.'
    }), {
      status: 503,
      statusText: 'Service Unavailable (Offline Mode)',
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    try { controller.abort(); } catch {}
  }, 3500);

  const callerSignal = init.signal;
  if (callerSignal) {
    if (callerSignal.aborted) {
      clearTimeout(timeoutId);
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        controller.abort();
      }, { once: true });
    }
  }

  const fetchInit = {
    ...init,
    signal: controller.signal
  };

  try {
    const res = await fetch(input, fetchInit);
    clearTimeout(timeoutId);
    if (res.ok || (res.status >= 200 && res.status < 500)) {
      markSupabaseSuccess();
    } else if (res.status >= 500) {
      markSupabaseFailure(new Error(`HTTP ${res.status}`));
    }
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    markSupabaseFailure(err);

    // fetchWithRetry takroriy urinishlar bilan konsolni to'ldirmasligi uchun
    // synthetic 503 qaytaramiz:
    return new Response(JSON.stringify({
      code: 'CONNECTION_RESET_FALLBACK',
      message: 'Tarmoq ulanishi uzildi (' + (err?.message || 'aloqa yo\'q') + '). Mahalliy keshga o\'tildi.'
    }), {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ----------------------------------------------------------
// Supabase client — barcha fayllar shu obyektni import qiladi
// ----------------------------------------------------------
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession:   true,   // Sessiyani localStorage da saqlaydi
    autoRefreshToken: true,   // Token muddati tugashidan oldin yangilaydi
    detectSessionInUrl: false // OAuth callback URL dan sessiya aniqlamaslik
  },
  global: {
    fetch: resilientFetch
  }
});

