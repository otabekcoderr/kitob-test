// ============================================================
// scripts/migrate-db.mjs — Jonli Supabase DB migratsiyasi
// ============================================================
// Vazifalar:
//   1. books.coverImage dagi base64 qiymatlarni "/covers/<id>.<ext>"
//      statisik fayl havolalariga almashtirish (payload ~1.5 MB tejash).
//   2. Muallif nomlarini birxillashtirish (Shekspir, Gyote, Doyl).
//
// Ishga tushirish (service role kaliti talab qilinadi):
//   SUPABASE_SERVICE_ROLE_KEY=xxx node scripts/migrate-db.mjs [--dry-run]
// ============================================================
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL_ = process.env.SUPABASE_URL || 'https://gvgyaxlbpkvpvwpqxjwc.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes('--dry-run');

if (!KEY) {
  console.error('XATO: SUPABASE_SERVICE_ROLE_KEY muhit o\'zgaruvchisi kerak.');
  process.exit(1);
}

const AUTHOR_FIXES = {
  'William Shakespeare': 'Uilyam Shekspir',
  'Johann Wolfgang von Goethe': 'Johann Wolfgang Gyote',
  'Arthur Conan Doyle': 'Artur Konan Doyl',
};

const supabase = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const { data: books, error } = await supabase.from('books').select('id, title, author, cover, coverImage');
if (error) { console.error('books select xatosi:', error); process.exit(1); }
console.log('Jami kitoblar:', books.length);

let updated = 0;
for (const b of books) {
  const patch = {};

  // 1. base64 coverImage -> statik fayl
  if (typeof b.coverImage === 'string' && b.coverImage.startsWith('data:image/')) {
    const m = b.coverImage.match(/^data:image\/(png|jpeg|jpg|webp);base64,/);
    if (m) {
      const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
      const file = path.join(ROOT, 'covers', `${b.id}.${ext}`);
      if (!fs.existsSync(file)) {
        console.warn(`  O'tkazildi (${b.id}): covers/${b.id}.${ext} fayli mavjud emas — avval extract-covers.mjs ni ishga tushiring.`);
      } else {
        patch.coverImage = `covers/${b.id}.${ext}`;
      }
    }
  }

  // 2. Muallif nomi
  if (AUTHOR_FIXES[b.author]) patch.author = AUTHOR_FIXES[b.author];

  if (Object.keys(patch).length === 0) continue;
  updated++;
  console.log(`  ${DRY ? '[dry-run] ' : ''}${b.id}:`, JSON.stringify(patch).slice(0, 120));
  if (!DRY) {
    const { error: uErr } = await supabase.from('books').update(patch).eq('id', b.id);
    if (uErr) console.error(`  XATO (${b.id}):`, uErr.message);
  }
}
console.log(`${DRY ? '(dry-run) ' : ''}Jami yangilanishi: ${updated} ta kitob.`);
