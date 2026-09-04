// ============================================================
// supabase-client.js — Supabase ulanish konfiguratsiyasi
// ============================================================
// Bu fayl faqat bitta vazifani bajaradi:
//   Supabase client yaratish va export qilish.
// Boshqa hech qanday mantiq bu yerda bo'lmaydi.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ----------------------------------------------------------
// Muhit o'zgaruvchilari (PRODUCTION da almashtiring)
// ----------------------------------------------------------
const SUPABASE_URL      = 'https://gvgyaxlbpkvpvwpqxjwc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2raJHpiyV55SbGDghEUL5A_2UgIecMn';

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
    fetch: async (input, init = {}) => {
      const urlStr = typeof input === 'string' ? input : (input?.url || '');
      const method = (init?.method || 'GET').toUpperCase();
      try {
        return await fetch(input, {
          ...init,
          cache: 'no-store'
        });
      } catch (err) {
        // Agar auth operatsiyasi yoki ma'lumot yozish bo'lsa, xatoni o'ziga qoldiramiz
        if (urlStr.includes('/auth/v1/') || method !== 'GET') {
          throw err;
        }
        // Ma'lumot o'qish (GET profiles, quiz_results) paytida tarmoq uzilsa (ERR_CONNECTION_RESET/CLOSED)
        // Brauzer konsolida qizil xatolik bermaslik va app to'xtamasligi uchun xavfsiz bo'sh fallback qaytaramiz
        console.warn('[supabase-client] Tarmoq uzilishi bartaraf etildi (fallback):', urlStr.split('?')[0]);
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }
});
