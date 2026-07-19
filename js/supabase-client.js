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
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';

// ----------------------------------------------------------
// Supabase client — barcha fayllar shu obyektni import qiladi
// ----------------------------------------------------------
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        persistSession: true,   // Sessiyani localStorage da saqlaydi
        autoRefreshToken: true,   // Token muddati tugashidan oldin yangilaydi
        detectSessionInUrl: false // OAuth callback URL dan sessiya aniqlamaslik
    }
});
