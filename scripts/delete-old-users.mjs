// ============================================================
// scripts/delete-old-users.mjs — Supabase DB eski sun'iy userlarni o'chirish
// ============================================================
// Ishga tushirish (service role kaliti talab qilinadi):
//   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/delete-old-users.mjs [--dry-run]
// ============================================================

import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.SUPABASE_URL || 'https://gvgyaxlbpkvpvwpqxjwc.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes('--dry-run');

if (!KEY) {
  console.error('XATO: SUPABASE_SERVICE_ROLE_KEY muhit o\'zgaruvchisi kerak.');
  process.exit(1);
}

const supabase = createClient(URL_, KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

console.log(`[clean-users] Supabase bazasi bilan ulanmoqda (${URL_})...`);

// 1. O'chirilishi kerak bo'lgan pattern va nomlar
const DUMMY_USERNAMES = [
  'demo_user',
  'demo_shohida',
  'demo_shohida_001',
  'demo_khasanov_002',
  'demo_umarof_003',
  'sample-1',
  'sample-2',
  'sample-3',
  'alisher_rahimov',
  'zilola_saidova',
  'test_user',
  'test_user_2026'
];

// 2. profiles jadvalidan qidirish
const { data: profiles, error: pErr } = await supabase
  .from('profiles')
  .select('id, username, full_name, is_admin, role, email');

if (pErr) {
  console.error('profiles jadvalini o\'qishda xato:', pErr.message);
  process.exit(1);
}

console.log(`Bazada jami ${profiles.length} ta profil mavjud.`);

const toDelete = profiles.filter(p => {
  const uname = String(p.username || '').toLowerCase();
  const uid = String(p.id || '').toLowerCase();
  const email = String(p.email || '').toLowerCase();

  // Asosiy adminni aslo o'chirmaymiz
  if (p.is_admin === true && (uname === 'admin' || uname === 'admin_kitobchi')) return false;

  return DUMMY_USERNAMES.includes(uname) ||
         uid.startsWith('demo_') ||
         uid.startsWith('sample-') ||
         uid.startsWith('test_') ||
         uid.startsWith('usr_') ||
         uid.startsWith('local_') ||
         email.includes('demo@') ||
         email.includes('sample@') ||
         uname.startsWith('demo_') ||
         uname.startsWith('sample_');
});

console.log(`O'chirilishi kerak bo'lgan eski/sun'iy profillar: ${toDelete.length} ta.`);

for (const u of toDelete) {
  console.log(`  ${DRY ? '[dry-run] ' : ''}O'chirilmoqda: @${u.username} (${u.full_name || 'Nomsiz'}, ID: ${u.id})`);

  if (!DRY) {
    // a) Izohlarni o'chirish
    await supabase.from('comments').delete().eq('user_id', u.id);
    // b) Test natijalarini o'chirish
    await supabase.from('quiz_results').delete().eq('user_id', u.id);
    // c) Profilni o'chirish
    const { error: delProfErr } = await supabase.from('profiles').delete().eq('id', u.id);
    if (delProfErr) console.warn(`    profiles o'chirishda ogohlantirish (${u.id}):`, delProfErr.message);

    // d) auth.users dan ham o'chirish (agar UUID bo'lsa)
    try {
      const { error: delAuthErr } = await supabase.auth.admin.deleteUser(u.id);
      if (delAuthErr) {
        // Agar auth da bo'lmasa oddiy ogohlantirish
      } else {
        console.log(`    auth.users dan ham muvaffaqiyatli o'chirildi (${u.id})`);
      }
    } catch {}
  }
}

console.log(`${DRY ? '(dry-run) ' : ''}Tozalash yakunlandi. Jami ${toDelete.length} ta foydalanuvchi tozalandi.`);
