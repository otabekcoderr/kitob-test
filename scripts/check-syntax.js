// ========================================================================
// scripts/check-syntax.js — Frontend ESM sintaksis tekshiruvi
// ========================================================================
// `node --check` bitta fayl bilan ishlaydi va ESM importlarini
// bajarilmaydi (shuning uchun `node --check a.js b.js` ishlameydi).
// Bu skript har bir faylni alohida tekshiradi va xatolarni yig'adi.
//
// Ishga tushirish: npm run check:js
// ========================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const TARGET_DIRS = ['js', 'api', 'tests', 'scripts'];

function collectJsFiles(dir, acc = []) {
  const full = path.join(projectRoot, dir);
  if (!fs.existsSync(full)) return acc;
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(rel, acc);
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
      acc.push(rel);
    }
  }
  return acc;
}

const files = TARGET_DIRS.flatMap(d => collectJsFiles(d));
const failures = [];

for (const rel of files) {
  try {
    execFileSync(process.execPath, ['--check', path.join(projectRoot, rel)], {
      stdio: 'pipe',
    });
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    failures.push({ file: rel, error: stderr });
  }
}

console.log(`[check:js] Tekshirilgan fayllar: ${files.length}`);

if (failures.length > 0) {
  console.error(`[check:js] ${failures.length} ta faylda sintaksis xatosi:`);
  for (const f of failures) {
    console.error(`\n--- ${f.file} ---\n${f.error}`);
  }
  process.exit(1);
}

console.log("[check:js] Barcha fayllar sintaksis jihatidan to'g'ri.");
