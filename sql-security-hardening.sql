-- ========================================================================
-- sql-security-hardening.sql
-- Kitobchi.uz — xavfsizlik tuzatishlari (RLS, rolik himoyasi, anti-cheat)
-- ========================================================================
-- QANDAY ISHLATISH:
--   Supabase Dashboard → SQL Editor → yangi query → bu faylni to'liq
--   nusxalang → Run. Skript idempotent: bir necha marta ishga tushirsangiz
--   ham xato bermaydi.
--
-- DIQQAT: Bu skript haqiqiy production sxemasiga moslashtirilgan.
--   profiles  : id, username, full_name, avatar, avatar_image,
--               avatar_char_id, is_admin, stats, created_at
--               (score / streak / role / last_quiz_date USTUNLARI YO'Q —
--                butun progress `stats` jsonb ichida)
--   questions : id, bookId, question, options, correctAnswer, explanation
--               (`correct_answer` deb ataladigan ustun yo'q)
--
-- service_role kaliti RLS'ni aylantiradi. Quyidagi siyosatlar `anon` va
-- `authenticated` rollari uchun amal qiladi.
-- ========================================================================


-- ########################################################################
-- BOLIM 0 — DIAGNOSTIKA
-- ########################################################################
-- Ishga tushirmasdan oldin shu qismni alohida yuriting va natijani
-- ko'ring: bu jadvallarda qanday ustunlar borligini ko'rsatadi.

SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  (SELECT count(*) FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('profiles','books','questions','results','quiz_results',
                    'comments','characters','question_keys')
ORDER BY c.relname;

-- quiz_results ning haqiqiy ustunlari (0. bolimga qarab):
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'quiz_results'
--  ORDER BY ordinal_position;


-- ########################################################################
-- BOLIM 1 — quiz_results JADVALI
-- ########################################################################
-- Nima uchun: butun kod shu jadvaldan foydalanadi
--   api/quiz-submit.js  → insert
--   js/db.js            → insert + o'qish
--   js/pages/admin.js   → o'chirish
-- lekin avvalgi SQL skriptlarida u umuman mavjud emas edi.

CREATE TABLE IF NOT EXISTS public.quiz_results (
  "id"         BIGSERIAL PRIMARY KEY,
  "user_id"    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "book_id"    BIGINT,
  "book_slug"  TEXT,
  "score"      INTEGER NOT NULL DEFAULT 0,
  "total"      INTEGER NOT NULL DEFAULT 0,
  "percentage" INTEGER NOT NULL DEFAULT 0,
  "penalty"    INTEGER NOT NULL DEFAULT 0,
  "date"       DATE NOT NULL DEFAULT CURRENT_DATE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Jadval allaqachon bo'lsa ham kerakli ustunlarni qo'shadi.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='quiz_results'
                   AND column_name='user_id') THEN
    ALTER TABLE public.quiz_results ADD COLUMN "user_id" UUID;
    RAISE NOTICE 'quiz_results.user_id qo''shildi';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='quiz_results'
                   AND column_name='score') THEN
    ALTER TABLE public.quiz_results ADD COLUMN "score" INTEGER DEFAULT 0;
    RAISE NOTICE 'quiz_results.score qo''shildi';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='quiz_results'
                   AND column_name='total') THEN
    ALTER TABLE public.quiz_results ADD COLUMN "total" INTEGER DEFAULT 0;
    RAISE NOTICE 'quiz_results.total qo''shildi';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='quiz_results'
                   AND column_name='percentage') THEN
    ALTER TABLE public.quiz_results ADD COLUMN "percentage" INTEGER DEFAULT 0;
    RAISE NOTICE 'quiz_results.percentage qo''shildi';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='quiz_results'
                   AND column_name='penalty') THEN
    ALTER TABLE public.quiz_results ADD COLUMN "penalty" INTEGER DEFAULT 0;
    RAISE NOTICE 'quiz_results.penalty qo''shildi';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='quiz_results'
                   AND column_name='date') THEN
    ALTER TABLE public.quiz_results ADD COLUMN "date" DATE DEFAULT CURRENT_DATE;
    RAISE NOTICE 'quiz_results.date qo''shildi';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='quiz_results'
                   AND column_name='created_at') THEN
    ALTER TABLE public.quiz_results ADD COLUMN "created_at" TIMESTAMPTZ DEFAULT now();
    RAISE NOTICE 'quiz_results.created_at qo''shildi';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='quiz_results'
                   AND column_name='book_id') THEN
    ALTER TABLE public.quiz_results ADD COLUMN "book_id" BIGINT;
    RAISE NOTICE 'quiz_results.book_id qo''shildi';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_quiz_results_user_id ON public.quiz_results(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_date     ON public.quiz_results("date" DESC);

ALTER TABLE public.quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_results FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quiz_results_select_own"   ON public.quiz_results;
DROP POLICY IF EXISTS "quiz_results_select_admin" ON public.quiz_results;
DROP POLICY IF EXISTS "quiz_results_insert_own"   ON public.quiz_results;
DROP POLICY IF EXISTS "quiz_results_update_admin" ON public.quiz_results;
DROP POLICY IF EXISTS "quiz_results_delete_admin" ON public.quiz_results;
-- Eski keng "hamma o'qiydi/tahrirlaydi" qoidalari:
DROP POLICY IF EXISTS "Allow all on quiz_results"  ON public.quiz_results;
DROP POLICY IF EXISTS "quiz_results_all"          ON public.quiz_results;
DROP POLICY IF EXISTS "results_select_all"        ON public.quiz_results;

-- O'z natijalarini ko'rish. Boshqalarni tahrirlash yoki o'chirish mumkin emas.
CREATE POLICY "quiz_results_select_own" ON public.quiz_results
  FOR SELECT USING (auth.uid() = user_id);

-- O'z nomidan yozish mumkin, boshqa nom bilan emas.
CREATE POLICY "quiz_results_insert_own" ON public.quiz_results
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "quiz_results_update_admin" ON public.quiz_results
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "quiz_results_delete_admin" ON public.quiz_results
  FOR DELETE USING (public.is_admin());


-- ########################################################################
-- BOLIM 2 — profiles: o'z rolingizni oshiringizga yo'l qolmasin
-- ########################################################################
-- MUHIM: PostgreSQL'da RLS policy ichida NEW va OLD mavjud EMAS. Policy —
-- oddiy WHERE ifodasi; NEW/OLD faqat trigger kontekstida ishlaydi. Shu
-- sababli WITH CHECK ga `NEW.is_admin` yozish xato beradi:
--     ERROR: 42P01: missing FROM-clause entry for table "new"
--
-- To'g'ri yechim — ustun darajasidagi cheklov. `is_admin` ustuniga
-- authenticated/anon rollari uchun UPDATE huquqi berilmaydi, shuning uchun
-- hech bir mijoz rolini ko'tara olmaydi. Adminlikni o'zgartirish faqat
-- service_role (serverless) yoki SQL orqali mumkin.
--
-- WITH CHECK esa qatorni boshqa foydalanuvchiga o'tkazishni taqiqlaydi
-- (bu sifatsiz va Postgres'da ishlaydigan himoya).

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Rol eskalatsiyasini SQL darajasida nomutanosib qilish.
DO $$
BEGIN
  EXECUTE 'REVOKE UPDATE ("is_admin") ON public.profiles FROM authenticated';
  EXECUTE 'REVOKE UPDATE ("is_admin") ON public.profiles FROM anon';
  RAISE NOTICE 'profiles.is_admin ustuni authenticated/anon uchun yopildi';
EXCEPTION WHEN undefined_object THEN
  RAISE NOTICE 'REVOKE bajarilmadi (rol topilmadi) — davom etildi';
END $$;


-- ########################################################################
-- BOLIM 3 — SECURITY DEFINER funksiyalar uchun xavfsiz search_path
-- ########################################################################
-- `is_admin()` va `protect_profile_admin_role()` SECURITY DEFINER bilan
-- yaratilgan. `search_path` ni belgilamasligi — search_path poisoning
-- zaifligi (hujjatni majburlash mumkin).

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    (SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Xavfsizlik: Adminlikni faqat mavjud administrator o''zgartira oladi.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_admin_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_admin_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_admin_role();


-- ########################################################################
-- BOLIM 4 — Javob kalitlari uchun alohida jadval (anti-cheat)
-- ########################################################################
-- Nima uchun: `questions` jadvalidagi `correctAnswer` va `explanation`
-- ustunlari `questions_select_all ... USING (true)` siyosiati bilan OCHIQ.
-- Ya'ni backend sanitizatsiyasi qanchalik kuchli bo'lmasin, brauzer
-- konsolidan
--     supabase.from('questions').select('*')
-- desak, BARCHA javob kalitlari ko'rinadi.
--
-- Yechim: savol matnlari ochiq qoladi, javob kalitlari alohida jadvalda
-- saqlanadi va FAQAT service_role (backend) o'qiy oladi. anon va
-- authenticated rollari uchun umuman policy berilmaydi.
--
-- Eslatma: `questions` da ustun nomi `correctAnswer` (camelCase),
-- `correct_answer` emas.

CREATE TABLE IF NOT EXISTS public.question_keys (
  "question_id"    TEXT PRIMARY KEY,
  "correct_answer" TEXT NOT NULL DEFAULT '',
  "explanation"    TEXT DEFAULT '',
  "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.question_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_keys FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "question_keys_select_all" ON public.question_keys;
DROP POLICY IF EXISTS "question_keys_write_all"  ON public.question_keys;

-- Eski ustunlarni ko'chirish (bir marta bajariladi).
INSERT INTO public.question_keys (question_id, correct_answer, explanation)
SELECT
  q.id::text,
  COALESCE(q."correctAnswer"::text, ''),
  COALESCE(q.explanation, '')
FROM public.questions q
WHERE q.id IS NOT NULL
ON CONFLICT (question_id) DO UPDATE
  SET correct_answer = EXCLUDED.correct_answer,
      explanation    = EXCLUDED.explanation;


-- ########################################################################
-- BOLIM 4b — JAVOB KALITLARINI ANON DAN YOPISH (anti-cheat)
-- ########################################################################
-- `questions` jadvalidagi correctAnswer / explanation ustunlari ustun
-- darajasidagi huquq orqali yopiladi. RLS qator darajasida ishlaydi va
-- bitta ustunni ajratolmaydi — buning uchun REVOKE SELECT(column) kerak.
--
-- Natija: anon yoki authenticated kaliti bilan
--     supabase.from('questions').select('correctAnswer')
-- desak, 0 qator qaytadi. Savol matnlari ochiq qoladi.
--
-- MUHIM: backend endi kalitlarni `question_keys` dan o'qiydi
-- (api/quiz-submit.js, service_role bilan), shuning uchun baholash
-- buzilmaydi. Admin panel esa api/question-keys.js orqali o'qiydi.
-- Bu SQL ni bajarishdan OLDIN shu kod deploy qilingan bo'lishi kerak.

DO $$
BEGIN
  EXECUTE 'REVOKE SELECT ("correctAnswer") ON public.questions FROM anon';
  EXECUTE 'REVOKE SELECT ("correctAnswer") ON public.questions FROM authenticated';
  EXECUTE 'REVOKE SELECT ("explanation") ON public.questions FROM anon';
  EXECUTE 'REVOKE SELECT ("explanation") ON public.questions FROM authenticated';
  RAISE NOTICE 'questions.correctAnswer va explanation yopildi';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'REVOKE bajarilmadi: %', SQLERRM;
END $$;


-- ########################################################################
-- BOLIM 5 — leaderboard view (ixtiyoriy, xato bo'lsa to'xtatmaydi)
-- ########################################################################
-- `security_invoker` OLMAYDI (security definer). Sababi:
--   quiz_results_select_own faqat o'z qatorini ko'rsatadi, shuning uchun
--   invoker rejimida har kim faqat o'z ballini ko'rardi va reyting bo'sh
--   chiqardi. Reyting ochiq ma'lumot bo'lgani uchun view egasi
--   (postgres) huquqlari bilan agregatlash kerak.
--
-- Bu oqimada faqat AGREGAT (sum, count) ko'rinadi — individual
-- quiz_results qatorlari view orqali ochiq bo'lmaydi, shuning uchun
-- RLS ni aylantirish oqilamaydi.
--
-- Eslatma: `profiles` da `score` / `streak` / `role` USTUNLARI yo'q.
--   score  = quiz_results dan SUM()
--   streak = profiles.stats ->> 'currentStreak'

DROP VIEW IF EXISTS public.leaderboard CASCADE;

DO $$
BEGIN
  EXECUTE $view$
    CREATE VIEW public.leaderboard AS
    SELECT
      p.id            AS user_id,
      p.username      AS username,
      p.full_name     AS full_name,
      p.avatar        AS avatar,
      p.avatar_image  AS avatar_image,
      COALESCE(s.score, 0) AS score,
      CASE
        WHEN COALESCE(p.stats->>'currentStreak', '') ~ '^-?[0-9]+$'
          THEN (p.stats->>'currentStreak')::bigint
        ELSE 0
      END AS streak,
      COALESCE(s.tests, 0) AS tests_completed
    FROM public.profiles p
    LEFT JOIN (
      SELECT qr.user_id,
             SUM(COALESCE(qr.score, 0))::bigint AS score,
             COUNT(*)::bigint                   AS tests
      FROM public.quiz_results qr
      WHERE qr.user_id IS NOT NULL
      GROUP BY qr.user_id
    ) s ON s.user_id = p.id
    WHERE COALESCE(p.is_admin, false) = false
  $view$;
  RAISE NOTICE 'leaderboard view yaratildi';
EXCEPTION WHEN others THEN
  RAISE WARNING 'leaderboard view yaratilmadi: %', SQLERRM;
END $$;


-- ########################################################################
-- BOLIM 6 — Indekslar
-- ########################################################################
CREATE INDEX IF NOT EXISTS idx_questions_book        ON public.questions("bookId");
CREATE INDEX IF NOT EXISTS idx_profiles_username     ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_stats_score  ON public.profiles (((stats->>'totalScore')::bigint));
CREATE INDEX IF NOT EXISTS idx_comments_book        ON public.comments("bookId");


-- ########################################################################
-- BOLIM 7 — YAKUNIY TEKSHIRUV
-- ########################################################################
-- 7.1 RLS holati (rls_enabled va rls_forced = true bo'lishi kerak):
SELECT
  c.relname              AS table_name,
  c.relrowsecurity       AS rls_enabled,
  c.relforcerowsecurity  AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('profiles','books','questions','quiz_results','comments',
                    'characters','question_keys')
ORDER BY c.relname;

-- 7.2 quiz_results siyosatlari (faqat 4 ta bo'lishi kerak):
SELECT policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'quiz_results'
ORDER BY policyname;

-- 7.3 question_keys ga policy YO'Q bo'lishi kerak.
--     Natija 0 bo'lmasa, faqat service_role o'qiy oladi:
SELECT count(*) AS question_keys_policy_count
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'question_keys';

-- 7.4 profiles_update_own da WITH CHECK borligi:
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
  AND policyname = 'profiles_update_own';

-- 7.4b is_admin ustuni authenticated uchun yopilgan bo'lishi kerak
--      (authenticated/anon qatorlari bo'lmasa = rol ko'tarib bo'lmaydi)
SELECT grantee, privilege_type, column_name
FROM information_schema.column_privileges
WHERE table_schema='public' AND table_name='profiles'
  AND column_name='is_admin' AND privilege_type='UPDATE'
ORDER BY grantee;

-- 7.4c natija: authenticated_can_update_is_admin = false
SELECT has_column_privilege('authenticated', 'public.profiles', 'is_admin', 'UPDATE')
         AS authenticated_can_update_is_admin,
       has_column_privilege('anon', 'public.profiles', 'is_admin', 'UPDATE')
         AS anon_can_update_is_admin;

-- 7.4d ⭐ Anti-cheat: correctAnswer yopilgan, question ochiq bo'lishi kerak.
--       Kutilgan: anon_can_read_correctAnswer = false
--                 authenticated_can_read_correctAnswer = false
--                 anon_can_read_question = true
SELECT has_column_privilege('anon','public.questions','correctAnswer','SELECT')
         AS anon_can_read_correctAnswer,
       has_column_privilege('authenticated','public.questions','correctAnswer','SELECT')
         AS authenticated_can_read_correctAnswer,
       has_column_privilege('anon','public.questions','question','SELECT')
         AS anon_can_read_question;

-- 7.5 Ko'chirilgan javob kalitlari soni (questions qatorlariga teng bo'lishi
--     kerak):
SELECT
  (SELECT count(*) FROM public.question_keys) AS keys_copied,
  (SELECT count(*) FROM public.questions)      AS questions_total;

-- 7.6 Reyting (bo'sh bo'lishi normal):
SELECT * FROM public.leaderboard ORDER BY score DESC LIMIT 10;
