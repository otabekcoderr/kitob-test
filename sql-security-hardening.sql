-- ========================================================================
-- sql-security-hardening.sql
-- Kitobchi.uz — BL-2 / BL-3 / BL-5 xavfsizlik tuzatishlari
-- ========================================================================
-- Supabase SQL Editor'da TO'LIQ (barcha qatorlar) bajarilishi kerak.
-- Tavsiya tartibi: avval bitta SELECT bilan jadvallar holatini tekshiring,
-- keyin ushbu skriptni ishga tushiring.
--
-- XAVFSIZLIK ESLATMASI: `service_role` kaliti backenddan keladi va RLS'ni
-- aylantirib o'tadi. Quyidagi siyosatlar `anon` va `authenticated`
-- rollari uchun amal qiladi.
-- ========================================================================


-- ------------------------------------------------------------------------
-- 0. DIAGNOSTIKA — avval shu qatorni yuritib, natijani yozib boring
-- ------------------------------------------------------------------------
SELECT
  c.relname                                        AS table_name,
  c.relrowsecurity                                  AS rls_enabled,
  (SELECT count(*) FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('profiles','books','questions','results','quiz_results','comments','characters','arena_matches')
ORDER BY c.relname;


-- ------------------------------------------------------------------------
-- 1. quiz_results JADVALI (BL-2)
-- ------------------------------------------------------------------------
-- Nima uchun: butun kod shu jadvaldan foydalanadi
-- (api/quiz-submit.js:587, js/db.js:960,1161,1233, js/pages/admin.js:1184),
-- lekin avvalgi SQL skriptlarida u umuman mavjud emas edi. RLS yoqiq
-- jadvalga `anon` kaliti bilan to'g'ridan-to'g'ri yozish/o'chirish mumkin.
--
-- Agar jadval umuman yo'q bo'lsa, quyidagi CREATE TABLE ishlaydi.

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

CREATE INDEX IF NOT EXISTS idx_quiz_results_user_id ON public.quiz_results(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_results_date     ON public.quiz_results(date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_results_user_book_date
  ON public.quiz_results(user_id, COALESCE("book_id", 0), date);

ALTER TABLE public.quiz_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_results FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quiz_results_select_own"   ON public.quiz_results;
DROP POLICY IF EXISTS "quiz_results_select_admin" ON public.quiz_results;
DROP POLICY IF EXISTS "quiz_results_insert_own"   ON public.quiz_results;
DROP POLICY IF EXISTS "quiz_results_update_admin" ON public.quiz_results;
DROP POLICY IF EXISTS "quiz_results_delete_admin" ON public.quiz_results;

-- O'z natijalarini ko'rish: hammaga (davlat e'lon qilinadi).
-- Boshqalarni tahrirlash yoki o'chirishga yo'l yo'q.
CREATE POLICY "quiz_results_select_own" ON public.quiz_results
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "quiz_results_insert_own" ON public.quiz_results
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "quiz_results_update_admin" ON public.quiz_results
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "quiz_results_delete_admin" ON public.quiz_results
  FOR DELETE USING (public.is_admin());


-- ------------------------------------------------------------------------
-- 2. profiles: WITH CHECK va search_path (BL-3)
-- ------------------------------------------------------------------------
-- Muammo: `profiles_update_own` faqat `USING (auth.uid() = id)` edi.
-- `WITH CHECK` yo'q bo'lgani uchun UPDATE qoidasi yangi qatorga shart
-- qo'ygan holda "hamma narsa o'zgara oladi" degan ma'noga ega bo'ladi.
-- `protect_profile_admin_role` trigger'i bu holatni yopadi, ammo trigger
-- ishlamasa yoki odatda bypass qilinsa rolik ko'tarilishi mumkin edi.
-- WITH CHECK — RLS darajasidagi arzon va ishonchli himoya.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id OR public.is_admin())
  WITH CHECK (
    auth.uid() = id
    AND COALESCE(NEW.is_admin, false) = COALESCE((SELECT is_admin FROM public.profiles WHERE id = auth.uid()), false)
  );


-- ------------------------------------------------------------------------
-- 3. SECURITY DEFINER funksiyalar uchun xavfsiz search_path (BL-3)
-- ------------------------------------------------------------------------
-- `is_admin()` va `protect_profile_admin_role()` `SECURITY DEFINER` bilan
-- yaratilgan. `search_path` ni belgilamasligi shu funksiyalar ichida
-- `is_admin` yoki `profiles` nomi bilan boshqa obyekt chaqirilsa
-- (search_path poisoning) hujjatni majburlash mumkin.

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
  IF (NEW.role IS DISTINCT FROM OLD.role) OR (NEW.is_admin IS DISTINCT FROM OLD.is_admin) THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Xavfsizlik: Rolni faqat mavjud administrator o''zgartira oladi.';
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


-- ------------------------------------------------------------------------
-- 4. Javob kalitlari uchun alohida jadval (BL-4 / anti-cheat mustahkamligi)
-- ------------------------------------------------------------------------
-- Nima uchun: hozir `questions` jadvalidagi `correctAnswer` va
-- `explanation` ustunlari `questions_select_all ... USING (true)` siyosiati
-- bilan OCHIQ. Ya'ni backend sanitizatsiyasi qanchalik kuchli bo'lmasin,
-- `js/db.js:713` orqali brauzer konsolidan
--   supabase.from('questions').select('*')
-- desak, BARCHA javob kalitlari ochiq ko'rinadi.
--
-- Yechim: savol matnlari ochiq qoladi, javob kalitlari esa alohida
-- jadvalda saqlanadi va faqat `service_role` (backend) o'qiy oladi.
-- Supabase anon/authenticated rollari uchun umuman policy berilmaydi.

CREATE TABLE IF NOT EXISTS public.question_keys (
  "question_id" TEXT PRIMARY KEY,
  "correct_answer" TEXT NOT NULL,
  "explanation"   TEXT DEFAULT '',
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.question_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_keys FORCE ROW LEVEL SECURITY;

-- Eski "hamma o'qiy oladi" qoidasini olib tashlaymiz.
DROP POLICY IF EXISTS "question_keys_select_all" ON public.question_keys;
DROP POLICY IF EXISTS "question_keys_write_all"  ON public.question_keys;
-- Yangi policy qo'shilmaydi: service_role RLS'ni aylantiradi.

-- Eski ustunlarni ko'chirish (bir marta bajariladi).
INSERT INTO public.question_keys (question_id, correct_answer, explanation)
SELECT q.id::text,
       COALESCE(q.correct_answer, q.correctAnswer::text, ''),
       COALESCE(q.explanation, '')
FROM public.questions q
WHERE q.id IS NOT NULL
ON CONFLICT (question_id) DO NOTHING;


-- ------------------------------------------------------------------------
-- 5. Reyting integriteti (BL-5)
-- ------------------------------------------------------------------------
-- Reyting `quiz_results` dan agregatlanadigan, hech qachon klient
-- yozadigan `score` ustunidan o'qilmaydi.

DROP VIEW IF EXISTS public.leaderboard CASCADE;
CREATE VIEW public.leaderboard WITH (security_invoker = true) AS
SELECT
  p.id            AS user_id,
  p.username      AS username,
  p.full_name     AS full_name,
  p.avatar        AS avatar,
  p.avatar_image  AS avatar_image,
  COALESCE(s.score, 0)      AS score,
  COALESCE(s.streak, 0)     AS streak,
  COALESCE(s.tests, 0)      AS tests_completed
FROM public.profiles p
LEFT JOIN (
  SELECT
    user_id,
    SUM(COALESCE(score, 0))::bigint AS score,
    COUNT(*)::bigint               AS tests
  FROM public.quiz_results
  GROUP BY user_id
) s ON s.user_id = p.id
WHERE COALESCE(p.is_admin, false) = false
  AND COALESCE(p.role, 'user') <> 'admin';


-- ------------------------------------------------------------------------
-- 6. Keshlash / indekslar
-- ------------------------------------------------------------------------
ALTER TABLE public.questions ALTER COLUMN "explanation" SET DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_questions_book ON public.questions("bookId");
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_comments_book ON public.comments("bookId");


-- ------------------------------------------------------------------------
-- 7. YAKUNIY TEKSHIRUV — natijani ko'rib chiqing
-- ------------------------------------------------------------------------
-- 7.1 Barcha jadvallarda RLS yoqilgan bo'lishi kerak:
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN ('profiles','books','questions','results','quiz_results',
                    'comments','characters','question_keys')
ORDER BY c.relname;

-- 7.2 quiz_results ga anonymous yozish UCHUN policy qolmaganini tasdiqlash:
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'quiz_results'
ORDER BY policyname, cmd;

-- 7.3 question_keys ga hech qanday policy yo'qligini tasdiqlash
--     (bo'sh natija = faqat service_role o'qiy oladi):
SELECT count(*) AS question_keys_policy_count
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'question_keys';

-- 7.4 Reyting ma'lumotlari (bo'sh bo'lishi normal):
SELECT * FROM public.leaderboard LIMIT 10;
