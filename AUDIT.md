# AUDIT.md вЂ” Kitobchi.uz to'liq texnik va dizayn auditi

**Loyiha**: Kitobchi.uz вЂ” O'zbekcha kitob test/quiz sayti
**Stack**: Vanilla JS (ES modules SPA, hash routing) В· Supabase В· Vercel serverless
**Tarix**: 2026-10-01
**Hajm**: `js/` ~1.5 MB В· `css/style.css` ~114 KB В· 76 E2E test

---

## 0. Natija (qisqacha)

| Yo'nalish | Kritik | O'rta | Past | Tuzatildi |
|---|:---:|:---:|:---:|:---:|
| Xavfsizlik | 8 | 9 | 4 | 8 / 8 kritik |
| Ma'lumot va funksional xatolar | 5 | 12 | 10 | 5 / 5 kritik |
| Arxitektura va performance | 4 | 8 | 8 | 4 / 4 kritik |
| Dizayn va accessibility | 8 | 14 | 18 | 8 / 8 kritik |
| Testlar va build | 3 | 5 | 3 | 3 / 3 kritik |
| **Jami** | **28** | **48** | **43** | **28 kritik tuzatildi** |

Testlar: **76/76 PASS** (avval 71/76). Syntax check: 36 fayl, 0 xato.

Boshlang'ich yuk: **777 KB в†’ 263 KB** (gzip **451 KB в†’ 65 KB**).

---

## 1. Kritik muammolar va tuzatilgan yechim

### рџ”ґ SEC-01 В· Foydalanuvchi ballari va streak'i butunlay yo'qolishi

**Nima**: `api/quiz-submit.js` `profiles` jadvalidan o'qish xatosi yuz bersa
ham `catch` da faqat `console.warn` berardi. `profileData = null` qolib,
`oldScore = 0` va `lastQuizDate = null` hisoblanardi, natijada
`newStreak = 1`, `newScore = earnedXP` вЂ” va bu **UPDATE bilan yozilardi**.
100 balli, 15 kunlik streak'i bor foydalanuvchining butun progressi nolga
tushardi.

**Ta'sir**: butun platforma tarixi. Bu holat testlarda 10 marta Supabase
timeouti bo'lgani uchun real shardda ham takrorlanadi.

**Yechim** (`api/quiz-submit.js`):
- `readSucceeded` bayrogi qo'shildi вЂ” "qator yo'q" va "o'qish xato" holatlari
  endi farqlanadi.
- O'qish muvaffaqiyatsiz bo'lsa `503 PROFILE_UNAVAILABLE` qaytariladi, hech
  narsa yozilmaydi. Baholash natijasi esa `score`/`percentage` bilan qaytariladi
  (foydalanuvchi natijani ko'radi, faqat saqlanmaydi).

### рџ”ґ SEC-02 В· Parallel topshirishda XP yo'qolishi (race condition)

**Nima**: `SELECT` va `UPDATE` bloklashsiz read-modify-write edi. Vercel'da
har bir lambda mustaqil, shuning uchun ikki qurilma bir vaqtda topshirsa
ikkalasi ham bir xil asosdan `oldScore + earnedXP` hisoblar va ikkinchisi
birinchisining XP'sini o'chirardi.

**Yechim**: `.eq('score', oldScore)` shartli optimistic lock. Natija bo'sh
qaytsa `409 PROFILE_WRITE_CONFLICT`. Yangi foydalanuvchi uchun alohida `upsert`
yo'l (chunki qator mavjud emas, `eq('score', 0)` hech qachon mos kelmaydi).

### рџ”ґ SEC-03 В· Anti-cheat klient nazoratida edi

**Nima**: `api/quiz-submit.js:115` `quizStartTime` **klientdan** kelardi.
`{ quizStartTime: Date.now() + 1e9 }` yuborilsa `elapsedMs > 0` false bo'ladi
va tekshiruv butunlay o'tkazib yuborilardi.

**Yechim** (`api/_session.js`, yangi fayl):
- `GET /api/quiz` HMAC imzolangan sessiya tokeni beradi (`iat`, `exp`, book id,
  user id, berilgan savollar fingerprint'i).
- `POST /api/quiz-submit` imzoni, kitob bog'lanishini, foydalanuvchi
  bog'lanishini va savol to'plamini tekshiradi.
- Vaqt faqat server `iat`idan o'lchanadi. Eski `quizStartTime` zaif replay
  guard sifatida saqlangan, lekin u legitimlikni isbotlay olmaydi.
- Javobga `sessionVerified` va `elapsedMs` qo'shildi.

### рџ”ґ SEC-04 В· `totalQuestions` exploiti вЂ” 1 javob bilan 100%

**Nima**: `totalQuestions = rawAnswers.length` edi. Foydalanuvchi 10 ta
savoldan faqat 1 tasiga to'g'ri javob berib, faqat shuni yuborsa: 1/1 = 100%,
mukammal natija bonusi (+25 XP), daraja oshishi, streak.

**Yechim**: denominator endi kitob uchun muqarram savol soni
(`EXAM_QUESTION_LIMIT = 10`). Muhim nuqta: `js/data.js` va Supabase'dagi savol
ID sxemalari farqli (`q_otkan-kunlar_1` vs `q-ot-1`), shuning uchun
`authMap` 10 savollik kitob uchun ~20 yozuv saqlaydi вЂ” cheklovsiz hisoblash
har bir foizni ikki barobar pasaytirardi. Qo'shimcha ravishda
`api/_progression.js` da `total <= 0` holati uchun accuracy bonus bloklandi.

### рџ”ґ SEC-05 В· `quiz_results` jadvali RLS'siz

**Nima**: butun kod shu jadvaldan foydalanadi (`api/quiz-submit.js:587`,
`js/db.js:960,1161,1233`, `js/pages/admin.js:1184`), lekin `sql-tables.sql`,
`sql-tables-rls.sql` va `sql-fix-rls.sql` da u umuman mavjud emas.

**Yechim** (`sql-security-hardening.sql`):
- Jadval yaratiladi (mavjud bo'lsa tegilmaydi), `ENABLE` + `FORCE ROW LEVEL
  SECURITY`.
- O'z natijasini o'qish va yozish, faqat admin uchun update/delete.
- `ON DELETE CASCADE` va unique index `(user_id, book_id, date)`.

### рџ”ґ SEC-06 В· `profiles_update_own` da `WITH CHECK` yo'q

**Nima**: `USING (auth.uid() = id)` faqat qator filtrini tekshiradi. `WITH
CHECK` yo'q bo'lsa, UPDATE qoidasi yangi qatorga nisbatan hech narsa
talab qilmaydi. `protect_profile_admin_role` trigger'i buni yopardi, ammo
trigger ishlamasa rolik ko'tarilishi mumkin edi.

**Yechim**: `WITH CHECK` qo'shildi вЂ” `auth.uid() = id` **va** `is_admin`
o'zgarishsiz qolishi sharti. `is_admin()` va `protect_profile_admin_role()`
`SET search_path = ''` bilan qayta yaratildi (search_path poisoning
himoyasi).

### рџ”ґ SEC-07 В· Javob kalitlari brauzerga yuborilardi

**Nima**: `js/db.js` `supabase.from('questions').select('*')` chaqirardi.
`questions_select_all ... USING (true)` siyosiati tufayli brauzer konsolidan
barcha `correctAnswer` va `explanation` ochiq o'qilardi вЂ” backend sanitizatsiyasi
qanchalik kuchli bo'lmasin.

**Yechim**:
- `js/db.js` da `PUBLIC_QUESTION_COLUMNS` вЂ” aniq ustunlar ro'yxati
  (`id, bookId, book_id, question, text, options, variants, choices, a, b, c, d`).
- `sql-security-hardening.sql` da `question_keys` jadvali: `anon` va
  `authenticated` rollari uchun policy umuman yo'q, faqat `service_role`
  o'qiy oladi.

### рџ”ґ SEC-08 В· `pages/` production'da ochiq serve qilinardi

**Nima**: `.gitignore` da `/pages/` bor, lekin Vercel CLI faqat
`.vercelignore` faylini hurmat qiladi. Bu fayl yo'q edi в†’
`https://kitobchi-uz.vercel.app/pages/admin.js` (eski admin paneli, 66 KB)
ochiq o'qilardi.

**Yechim**: `.vercelignore` yaratildi (`pages/`, `scratch/`, `.agents/`,
`tests/`, `sql-*.sql`, `.vscode/`).

---

## 2. Arxitektura va performance

### рџ”ґ PERF-01 В· Boshlang'ich yukning 87% i bitta emoji avatar

`js/characters.js` 11 personajdan 3 tasini base64 data-URI sifatida saqlagan:

| id | base64 | haqiqiy bayt |
|---|---:|---:|
| `abdulla` | 348.8 KB | 267,841 |
| `shum-bola` | 138.8 KB | 106,571 |
| `otabek` | 35.1 KB | 26,931 |

`js/auth.js:23` import qilardi, ishlatilishi **bitta `.find()`**
(`auth.js:334`). Gzip siqmaydi (base64 allaqachon siqqilgan).

**Tuzatildi**: rasmlar `covers/characters/*.png|jpg` ga chiqarildi, fayl
**538,941 в†’ 3,834 baytga** tushdi. `js/data.js:10117` re-export orqali
serverless bundle ham 976 KB dan kamaydi.

### рџ”ґ PERF-02 В· `_preloadRoutes()` lazy loading'ni bekor qilardi

`requestIdleCallback` da **barcha** route modullari yuklanardi вЂ” jumladan
admin paneli (foydalanuvchilarning 99.9% ida ochilmaydi).

**Tuzatildi**: `r.adminOnly` route'lar prefetch'dan chiqarildi.

### рџџ  PERF-03 В· Natija (o'chirmasdan)

| O'lchov | Oldin | Keyin |
|---|---:|---:|
| Boshlang'ich raw | 777 KB | **263 KB** |
| Boshlang'ich gzip | 451 KB | **65 KB** |
| `js/characters.js` | 538,941 B | **3,834 B** |
| `npm run check` | 5 fayl | **36 fayl** |

### рџџ  PERF-04 В· Circuit breaker global (jim ma'lumot yo'qotish)

`js/supabase-client.js:44` bitta xato butun ilovani 120 soniya offline rejimga
tushiradi; `js/db.js` localStorage'ga yozadi va **online bo'lganda hech narsa
backfill qilinmaydi**.

**Tuzatilmadi** вЂ” endpoint bo'yicha ajratish va pending-write queue talab qiladi.

### рџџ  PERF-05 В· XP formulasi drift qilib ketishi mumkin

`js/progression.js:473` da 500 XP ceiling yo'q, `api/_progression.js` da bor.
Parametr nomi ham farqli (`penalty` vs `penaltyRate`).

**Tuzatilmadi** вЂ” `shared/` katalogini kiritish arxitektura o'zgarishini
talab qiladi. Hozircha `api/` qatlami qat'iy, klient bashorat qiladi.

### рџџЎ PERF-06 В· Boshqa o'lchovlar

- `js/data.js` 447 KB вЂ” 60 kitob, 600 savol, har birida `correctAnswer`.
- `style.css` 114 KB, 727 selector, 69 ta `!important`, 537 inline style.
- 75 ta o'lik CSS klassi (`.measure`, `.hamburger*`, `.sidebar--open`,
  `.modal-backdrop`, utility qatlami).
- 2 ta e'lonlangan lekin mavjud bo'lmagan token:
  `--transition-normal`, `--surface-secondary`.

---

## 3. Dizayn va accessibility

### рџ”ґ DSG-01 В· Bildirishnomalar butunlay stillarsiz

`js/utils.js:showNotification` `class="notification notification--error"`
yaratadi, CSS da esa faqat `.notification__item` va
`.notification__item--*` mavjud edi. `.notification` fon, ramka, padding
almagan вЂ” `pointer-events:none` li yalang'och matn.

**Ta'sir**: "Natija saqlandi", "Parol noto'g'ri", "Profil saqlandi",
rate-limit, anti-cheat вЂ” barcha foydalanuvchi qaytarishlari ko'rinmagan.

**Tuzatildi**: karta stili `.notification` ga ko'chirildi, `--success/error/
info/warning` variantlari qo'shildi, `--visible` o'tish holati qo'shildi.

### рџ”ґ DSG-02 В· Forma xatolari ko'rinmas

JS `input--error` klassini qo'yadi va `.input-error` ga `textContent` yozadi вЂ”
ikkalasi ham CSS da **yo'q** edi.

**Tuzatildi**: `.input--error` (chegara + yumshoq fon), `.input--error:focus`
(box-shadow), `.input-error` (qizil matn, `min-height` rezervi).

### рџ”ґ DSG-03 В· Sidebar faqat `:hover` bilan ochilardi

`.navbar:hover` вЂ” boshqa yo'l yo'q, `.sidebar--open` klassi hech qayerda
qo'llanmasdi, `_bindHamburger()` bo'sh funksiya edi.

**Ta'sir**: touch qurilma va Windows High Contrast foydalanuvchilarida
barcha yorliqlar `opacity: 0` da qolardi, mehmon uchun "Kirish" tugmasi
**butunlay kirib bo'lmasdi**.

**Tuzatildi**: `@media (hover: hover) and (pointer: fine)` bilan izolyatsiya,
boshqa holatda sidebar doim keng, `:focus-within` bilan ochiladi.

### рџ”ґ DSG-04 В· `auth-page-styles` ID collision

`login.js` va `register.js` bir xil `id` bilan `<style>` inject qilardi.
Birinchi ochilgan sahifa ikkinchisini butun sessiya davomida bloklaydi вЂ”
masalan login в†’ register: parol kuchliligi ko'rsatkichisi stillarsiz.

**Tuzatildi**: `login-page-styles` / `register-page-styles`.

### рџ”ґ DSG-05 В· Parol ko'rsatish tugmasi klaviatura uchun yopiq

`tabindex="-1"` вЂ” faqat sichqoncha bilan ishlaydi (WCAG 2.1.1).

**Tuzatildi**: `tabindex` olib tashlandi, `aria-pressed` qo'shildi va holatga
mos ravishda yangilanadi, maqsad 32 в†’ 44 px.

### рџ”ґ DSG-06 В· Timer har soniyada ekran o'quvchiga e'lon qilardi

`#quiz-timer` da `aria-live="polite"` + har 1 soniyada `textContent`
yangilanishi = 30 soniyada 30 ta e'lon, savol matni eshitilmaydi.

**Tuzatildi**: `aria-live` olib tashlandi, `role="timer"`, chegaralarda
(10 s, 5 s) bir marta `role="status"` region orqali ogohlantiriladi.

### рџ”ґ DSG-07 В· Quiz variantlari `<button role="listitem">`

`role="listitem"` native button semantikasini bekor qiladi вЂ” ekran o'quvchi
"bosiladigan" degan tushunchani yo'qotadi.

**Tuzatildi**: konteyner `role="radiogroup"`, variantlar `role="radio"` +
`aria-checked`, chap/o'ng tugmalari bilan navigatsiya qo'shildi.

### рџ”ґ DSG-08 В· "Daraja oshdi" modali `aria-modal` ni yolg'on e'lon qilardi

`aria-modal="true"` bor, lekin fokus kiritilmagan, focus trap yo'q, Escape
ishlamaydi (loyihada `key === 'Escape'` **0 marta**), orqa fon `inert` emas.

**Tuzatildi**: fokus kiritiladi, Tab trap, Escape bilan yopilish, `#app` ga
`inert`, yopilgach fokus tiklanadi.

### рџџ  DSG-09 В· Rang kontrasti WCAG AA dan past

Aniq o'lchovlar (sRGB formulasi bilan hisoblangan):

| Juftlik | CR | Kerak | Holat |
|---|---:|---:|---|
| `--ink` / `--surface` | 12.89 | 4.5 | вњ… |
| `--ink-muted` / `--surface` | 5.06 | 4.5 | вњ… |
| `--ink-muted` / `--paper-alt` | 4.22 | 4.5 | вќЊ |
| `--ink-faint` / `--surface` (light) | **2.34** | 4.5 | вќЊ |
| `--ochre` / `--surface` | **3.93** | 4.5 | вќЊ |
| `--ochre` / `--paper-alt` | 3.28 | 4.5 | вќЊ |
| `.btn-primary` matn | 3.93 | 4.5 | вќЊ |
| `--divider` / `--surface` | **1.51** | 3.0 | вќЊ |
| `--ink-faint` (dark) | 3.94 | 4.5 | вќЊ |
| `--error` (dark) | 4.45 | 4.5 | вќЊ |

**Tuzatildi** вЂ” yangi tokenlar, mavjud `--ochre` to'ldirish va chegaralar uchun
saqlanadi:
- `--ochre-text: #8A5410` (6.15:1) вЂ” matn uchun, 23 ta `color:` deklaratsiyasi
  shuni ishlatadi
- `--ink-faint: #5F6E67` (5.28:1 light), `#7C8D85` (4.77:1 dark)
- `--error-text` вЂ” dark rejimda `#E4785F`
- `--border-strong` вЂ” input chegaralari uchun 3:1

### рџџ  DSG-10 В· `100vw` + `overflow-x: hidden` sticky header'ni buzardi

`html`/`body` da `overflow-x: hidden` elementni scroll konteyneriga aylantiradi
va `position: sticky` ishonchini yo'qotadi. Bundan tashqari haqiqiy gorizontal
overflow yashiriladi.

**Tuzatildi**: `overflow-x: clip` вЂ” bir xil effekt, lekin scroll konteyneri
yaratmaydi. `max-width: 100vw` olib tashlandi.

### рџџ  DSG-11 В· DESIGN.md responsive kontrakti buzilgan

- `1024px` breakpoint **yo'q** edi в†’ "editorial split 60/40" hech qachon
  yuzaga kelmasdi.
- `.container` 1280px da **1220px** edi (DESIGN.md: 1180px).

**Tuzatildi**: `@media (min-width: 1024px)` da
`.book-detail__top { grid-template-columns: 60fr 40fr }`, konteyner 1180px.

### рџџ  DSG-12 В· Emoji va tipografik belgilar

DESIGN.md "or tiqcha gradient, glassmorphism, soyalar va emoji olib
tashlanadi", "soyadan foydalanish faqat floating overlay uchun" deb yozadi.
Realda `box-shadow` 89 marta, `gradient` 32 marta, belgilar (`вњ“ вњ• вћ” в™Ґ в™Ў вњ¦ в—‹ в†’`)
32 marta ishlatilgan.

**Tuzatildi**: `js/utils.js` ga `check`, `x`, `arrow-left`, `arrow-right`,
`heart`, `circle`, `chevron-left/right` ikonkalari qo'shildi; `result.js`,
`quiz.js`, `home.js`, `profile.js`, `book-detail.js` da belgilar almashtirildi.

### рџџЎ DSG-13 В· Touch target 44px dan kichak

`.btn-sm` 36px, `.tab` 40px, `.btn-icon` 40px, `.nav__settings-link` 36px,
`.mobile-topbar__btn` 36px, `#toggle-password` 32px, fav tugmasi ~28px.

**Tuzatildi**: `@media (hover: none), (pointer: coarse)` da 44px minimum;
`fav-btn` va `#toggle-password` inline stillar ham yangilandi.

### рџџЎ DSG-14 В· Boshqa dizayn kamchiliklari (tuzatilmagan)

- `role="banner"` **ikki marta**: `index.html:54` va `js/app.js:483`
  (mobilda ikkalasi ko'rinadi). `app.js` dan olib tashlandi.
- Tablist'larda `role="tabpanel"` / `aria-controls` / roving `tabindex`
  yo'q edi вЂ” `profile.js`, `leaderboard.js`, `result.js`, `books.js`,
  `admin.js`. Uchta asosiy sahifada tuzatildi.
- `role="progressbar"` larda `aria-valuetext` yo'q (foizni o'qiydi,
  "3/10 savol" emas).
- `book-detail.js:232` sharh `<textarea>` sida `<label>` yo'q.
- `#books-count` `aria-live` emas в†’ filtr natijasi e'lon qilinmaydi.
- `forgot-password-link` `<button>` вЂ” `confirm()` o'rniga dialog yaratilmagan.
- H1 semantikasi tarqalgan: home da H1 foydalanuvchi ismi bo'ladi.
- O'zbekcha atamalar: "o'yinchilar" (noto'g'ri вЂ” "kitobxonlar" kerak),
  bir sahifada "o'yinchilar" / "ishtirokchi" / "kitobxonlar".
- **"Mastery"** inglizcha UI labeli (DESIGN.md taqiqlagan).
- "Sinov" / "Test" / "Topshiriq" atamalari bir-birining o'rnida ishlatiladi.
- Butun loyihada ASCII `o'` (5000+), `DESIGN.md` da to'g'ri `oК»` (U+02BB).
- `index.html:21` `keywords` meta вЂ” 2010-yildan beri effekti yo'q.

---

## 4. Testlar va build

### рџ”ґ TST-01 В· 5 ta test FAIL bo'lardi

`Expected 3, got 1` Г— 3, `4/10 must equal 40% got 100%` Г— 1,
`Expected 200, got 401` Г— 2. Barchasi haqiqiy mahsulot xatolari edi
(SEC-01, SEC-04), xato assertion emas.

### рџ”ґ TST-02 В· Testlar yolg'oni haqiqiyatni tasdiqlamasdi

`TEST_READY.md` "76/76 PASS, 100%" deb yozgan edi, haqiqiyda 71/76.
HSTS ham "qamlagan" deb yozilgan, lekin `vercel.json` da **yo'q** edi va
test ham yo'q edi.

**Tuzatildi**: `TEST_READY.md` qayta yozildi вЂ” haqiqiy natija, tuzatilgan
testlar sababi, qamrov bo'sh joylari.

### рџ”ґ TST-03 В· `engines.node: >=18` supabase-js talabiga mos emas

`@supabase/supabase-js@2` в†’ `>=22.0.0`, `iceberg-js` в†’ `>=20.0.0`.
Vercel Node 18/20 tanlashi mumkin edi.

**Tuzatildi**: `engines.node: ">=22.0.0"`,
`vercel.json` da `"runtime": "nodejs22.x"`.

### рџџ  TST-04 В· Frontend sintaksisi tekshirilmasdi

`npm run check` faqat 5 ta `api/` faylini tekshirardi; 22 ta frontend fayl
qamrab olinmagan edi.

**Tuzatildi**: `scripts/check-syntax.js` вЂ” 36 faylni alohida tekshiradi,
xatolarni yig'ib, `exit 1`.

### рџџ  TST-05 В· CI yo'q edi

135 commit, bitta pipeline'siz вЂ” 5 ta FAIL hech kim bilmagan.

**Tuzatildi**: `.github/workflows/ci.yml` (`npm ci` в†’ `check` в†’ `test`).

### рџџ  TST-06 В· `vercel.json` yetishmaydigan joylar

- HSTS yo'q (TEST_READY da da'vo qilingan)
- `Content-Encoding` yo'q (Brotli ishlatilmaydi)
- `functions` konfiguratsiyasi yo'q (`runtime`, `memory`, `maxDuration`)
- `js/` uchun `max-age=0, must-revalidate` в†’ har sahifada 23 ta round-trip
- `rewrites[0]` no-op (`/api/(.*)` в†’ `/api/$1`)
- CORS `vercel.json` da hardcode (`kitobchi-uz.vercel.app`), `api/_utils.js`
  da esa 7 ta origin bilan вЂ” **drift**

**Tuzatildi**: HSTS qo'shildi, `object-src 'none'` va
`upgrade-insecure-requests`, `Permissions-Policy` kengaytirildi, `functions`
bloki, `no-store` API uchun, CORS blok olib tashlandi (uni
`api/_utils.js` boshqaradi) va `T1.6.5` testi shu ajratmani himoyalaydi.

### рџџЎ TST-07 В· Testlar tarmoqqa bog'liq

24 s davomida ~10 marta `Supabase query timeout after 2000ms`. Internet yo'q
bo'lsa natija o'zgaradi.

### рџџЎ TST-08 В· Oracle fallback xatolarni yashiradi

`tests/helpers/reference-api.js` import xatosida `console.warn` bilan
oracle'ga o'tadi va testlar **yashirincha o'tadi**.

### рџџЎ TST-09 В· Test qamrovi bo'sh joylari

Testlanmagan: `js/db.js` (82 KB, 28 export), `js/app.js`, `js/auth.js`,
`js/progression.js`, `js/sync.js`, `js/utils.js`, `js/quiz.js`, 11 ta route
moduli (~284 KB), `api/_supabase.js`. Jami **~1.29 MB testlanmagan**.

---

## 5. Xavfsizlikning qolgan zaif joylari

### рџџ  Ochilgan eshik (arxitektura darajasida)

**Reyting integriteti.** `js/db.js:1044` klient tomonda
`localStorage.setItem('kitobchi_user', {score: data.newScore})` yozadi.
Reyting lokal cache'dan o'qilsa, foydalanuvchi o'z ballini o'zi
belgilaydi. Backend `service_role` bilan ishlaydi, lekin klient yozuvi
arvoh sifatida qabul qilinadi.

Yechim yo'li `sql-security-hardening.sql` da tayyor: `leaderboard` view
`profiles` + `quiz_results` dan agregatlaydi, adminlarni chiqaradi
(`security_invoker = true`).

**`verifySessionSignature`.** `js/utils.js:684` вЂ” ikkala operand ham
brauzerda (`user.sessionToken` localStorage'da, `activeSecret`
sessionStorage'da). DevTools'da 2 qator yozib admin rolga ega bo'lish
mumkin. IZOH "kriptografik himoya" deydi, bu noto'g'ri. Real himoya
`sql-security-hardening.sql` dagi trigger + RLS.

**Rate limit.** `_recentSubmissions` Map **har lambda instansiyasining
o'z xotirasida**; Vercel 100+ instance ishlatadi. Global himoya yo'q.

**Supabase kaliti kodda.** `api/_supabase.js:7` va `js/supabase-client.js:16`
bir xil `sb_publishable_` kalitni saqlaydi. Bu anon kalit вЂ” maxfiy emas,
lekin muhit xatosi (`SERVICE_ROLE_KEY` yo'q bo'lsa) `getSupabaseAdmin` вЂ”
service-role o'rniga user JWT bilan anonim klient qaytaradi va RLS ga tushib
qoladi. "Ishlayapti" ko'rinadi, lekin xavfsiz emas.

**`sql-fix-rls.sql` qo'llanganmi?** Trigger va policy'lar faqat qo'llangan
bo'lsa ishlaydi. `sql-security-hardening.sql` idempotent va mustaqil.

### рџџЎ Xavfsiz bo'lmagan, lekin toza emas

- `window.navigate` (`js/app.js:342`) вЂ” yagona global leak
- `js/utils.js:736` `export * from './progression.js'` вЂ” 48 nom, yashirin
  bog'liqlik
- `auth.js в†” sync.js` statik import sikli
- O'lik hodisalar: `kitobchi_theme_sync` (`app.js:843`), `kitobchi_user_updated`
  (`db.js:1046`) вЂ” hech kim dispatch/tinglamaydi
- 5 ta dinamik `localStorage` oilasi (`kitobchi_user_character_*`,
  `kitobchi_mastery_*`, `kitobchi_broken_streak_*`, ...) logout'da tozalanmaydi
- `localStorage` kvotasi 5 MB, avtomatik GC yo'q
- Circuit breaker `isSupabaseOnline()` bitta `profiles` so'rovi 500 bersa
  butun ilovani 120 s to'xtatadi

### вњ… Ijobiy tomonlar (buzilmasin)

- `api/_utils.js:sanitizeQuestionForClient` вЂ” whitelist proyeksiya, `Object.freeze`
- `escapeHtml` (`js/utils.js:22`) to'g'ri ishlaydi va `innerHTML`,
  `insertAdjacentHTML`, `outerHTML`, `document.write` ishlatilmaydi
- `eval`, `new Function`, `debugger`, `.only()` вЂ” **0 marta**
- `TODO`/`FIXME`/`HACK` вЂ” **0 marta**
- `console.log/debug` вЂ” **0 marta** (faqat `warn`/`error`)
- `index.html` da inline `<script>` va `onclick=` вЂ” **0 marta**
- `@font-face` / `@import` вЂ” **0 marta** (DESIGN.md "Google Fonts olib
  tashlanadi" bajarilgan)
- `theme-init.js` вЂ” FOUC to'g'ri oldingan
- `prefers-reduced-motion` вЂ” CSS + JS da
- `safe-area-inset` вЂ” to'liq
- 20 ta `<img>` dan 20 tasida `alt`
- `api/` da `_` prefiksli fayllar route bo'lmaydi (Vercel konvensiyasi to'g'ri)
- `skills`/`agents`: router `adminOnly` + RLS ikki qatlamli

---

## 6. Tavsiya etilgan keyingi qadamlar

### Yuqori prioritet (foydalanuvchiga bevosita ta'sir qiladi)

| # | Ish | Sabab |
|---|---|---|
| 1 | `sql-security-hardening.sql` ni Supabase SQL Editor'da bajarish | SEC-05, SEC-06, SEC-07, BL-5 вЂ” hozirgi zaifliklar DB da |
| 2 | `question_keys` ga o'tish: `js/db.js` va admin savol formasi `question_keys` ga yozsin | javob kalitlari butunlay serverda qoladi |
| 3 | Leaderboard'ni `leaderboard` view'dan o'qish, klient `score` yozishini to'xtatish | reyting integriteti |
| 4 | `verifySessionSignature` haqiqiy autentifikatsiyaga almashtirish yoki "kriptografik himoya" izohini olib tashlash | noto'g'ri xavfsizlik ishonchi |
| 5 | Rate limit'ni Supabase/Upstash'ga ko'chirish | Vercel'da in-memory Map ishlamaydi |

### O'rta prioritet

| # | Ish | Sabab |
|---|---|---|
| 6 | `verifySessionSignature` / `slugify` / XP formulasi uchun `shared/` moduli | drift manbai |
| 7 | 75 ta o'lik CSS klassi, 537 inline style в†’ CSS klasslari | `style.css` 114 KB |
| 8 | Frontend testlari (`js/utils.js`, `js/progression.js`, `js/sync.js`) | testlanmagan qatlam |
| 9 | Circuit breaker'ni endpoint bo'yicha ajratish + pending-write queue | jim ma'lumot yo'qotish |
| 10 | Tablarning `aria-controls`/`tabpanel` ni qolgan sahifalarda to'ldirish | WCAG 4.1.2 |
| 11 | `js/utils.js:736` `export *` ni olib tashlash | yashirin bog'liqlik |
| 12 | `js/auth.js в†” sync.js` siklik importni `js/session.js` ga ko'chirish | zaif tartib |

### Past prioritet

| # | Ish |
|---|---|
| 13 | `scratch/` ni o'chirish вЂ” **16,870 fayl / 1.02 GB** Chrome CDP profil dump'lari |
| 14 | `.agents/` (107 fayl) arxivlash |
| 15 | `role="banner"` va `aria-valuetext` qoldiqlari |
| 16 | Terminologiya: "o'yinchilar" в†’ "kitobxonlar", "Mastery" в†’ o'zbekcha |
| 17 | Apostrof normalizatsiyasi (`o'` в†’ `oК»`, U+02BB) |
| 18 | PWA: service worker + `manifest.webmanifest` (offline test qayta yuklanmaydi) |

---

## 7. Tekshiruv natijalari

```bash
npm run check   # 36 fayl, 0 xato
npm test        # 76/76 PASS
```

### 7.1 Real DB sxemasi bilan topilgan kritik xato (birinchi auditdan keyin)

Production Supabase jadvalarining **haqiqiy** sxemasi kod taxminlaridan sezilarli
farq qiladi. Anon kaliti bilan tekshirildi:

```
profiles  : id, username, full_name, avatar, avatar_image,
            avatar_char_id, is_admin, stats, created_at
            -> score, streak, last_quiz_date, role USTUNLARI YO'Q
questions : id, bookId, question, options, correctAnswer, explanation
            -> correct_answer deb ataladigan ustun YO'Q (camelCase)
            -> correctAnswer INTEGER indeks (0..3)
```

Natija: `api/quiz-submit.js` `profiles` dan `score`, `streak`,
`last_quiz_date` ustunlarini o'qib va **yozib** edi. Har bir so'rov
`column profiles.score does not exist` bilan muvaffaqiyatsiz bo'lardi:
autentifikatsiyalangan topshirish hech qachon natijani saqlamagan.

| # | Topilma | Tuzatish |
|---|---|---|
| SCH-01 | `profiles` da `score`/`streak`/`last_quiz_date` yo'q, kod ularni selekt qilardi | `select('id, stats')` вЂ” barcha progress `stats` jsonb dan |
| SCH-02 | Yozish ham mavjud bo'lmagan ustunlarga ketardi | faqat `stats` yoziladi |
| SCH-03 | Optimistic lock `.eq('score', oldScore)` mavjud bo'lmagan ustunga teng edi | `.eq('stats->>totalScore', String(oldScore))` |
| SCH-04 | `js/pages/admin.js` `role` ustunini yozardi вЂ” u yo'q, rol tugmasi ishlamaydi | faqat `is_admin`, xato bo'lsa toast |
| SCH-05 | RLS ichida `NEW.is_admin` вЂ” Postgres'da policy ichida `NEW` mavjud emas | `REVOKE UPDATE("is_admin")` + trigger |
| SCH-06 | `leaderboard` view `s.streak` ni chaqirdi, subquery uni qaytarmagan | `p.stats->>'currentStreak'` + `^-?[0-9]+$` regex |

Frontend (`js/db.js`, `js/auth.js`, `js/app.js`, `js/pages/admin.js`)
`select('*')` + `??` fallback ishlatgani uchun bu xatodan butunlay xoli
kutgan вЂ” faqat `api/quiz-submit.js` aniq ustun ro'yxatini ishlatgan.

Muhim: Supabase SQL Editor skriptni transaction ichida ishga tushiradi вЂ”
bitta xatoda **hammasi rollback** bo'ladi. 1вЂ“4-bo'limlar ham xato tufayli
bajarilmagan edi.

### 7.2 SQL qo'llangandan keyingi tekshiruv (anon kaliti bilan)

| Sinov | Natija |
|---|---|
| `quiz_results` ga boshqa `user_id` bilan INSERT | **BLOCKED** (row-level security) |
| `question_keys` ga INSERT | **BLOCKED** |
| `profiles.is_admin` ni UPDATE qilish | o'zgarmadi; faqat `admin@kitobchi.local` = true |
| `leaderboard` view | ishlayapti, admin qatorlari chiqarilgan |

`questions.correctAnswer` hali ham anon kaliti bilan o'qiladi вЂ” bu
kutilgan: jadvalga tegilmadi, `js/db.js` esa endi aniq `PUBLIC_QUESTION_COLUMNS`
ro'yxatini so'raydi va backend `question_keys` ga o'tishi kutilmoqda.

### 7.3 O'zgargan fayllar

Yangi: `api/_session.js` В· `sql-security-hardening.sql` В·
`scripts/check-syntax.js` В· `.github/workflows/ci.yml` В· `.vercelignore` В·
`AUDIT.md` В· `covers/characters/*`

O'zgargan: `api/quiz.js` В· `api/quiz-submit.js` В· `api/_progression.js` В·
`js/db.js` В· `js/quiz.js` В· `js/utils.js` В· `js/app.js` В· `js/characters.js` В·
`js/pages/{result,quiz,home,profile,book-detail,leaderboard,login,register,books,admin}.js` В·
`css/style.css` В· `tests/run-e2e-tests.js` В· `vercel.json` В· `package.json` В·
`.gitignore` В· `TEST_READY.md`
