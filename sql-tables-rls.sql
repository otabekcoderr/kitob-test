-- ========================================================================
-- 1. ADMIN TEKSHIRISH FUNKSIYASI
-- ========================================================================
CREATE OR REPLACE FUNCTION public.is_admin() 
RETURNS boolean AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM public.profiles WHERE id = auth.uid()), 
    false
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ========================================================================
-- 2. JADVALLARDA RLS REJIMINI YOQISH
-- ========================================================================
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- ========================================================================
-- 3. ESKI POLICYLARNI TOZALASH
-- ========================================================================
DROP POLICY IF EXISTS "books_select_all" ON public.books;
DROP POLICY IF EXISTS "books_insert_admin" ON public.books;
DROP POLICY IF EXISTS "books_update_admin" ON public.books;
DROP POLICY IF EXISTS "books_delete_admin" ON public.books;

DROP POLICY IF EXISTS "questions_select_all" ON public.questions;
DROP POLICY IF EXISTS "questions_insert_admin" ON public.questions;
DROP POLICY IF EXISTS "questions_update_admin" ON public.questions;
DROP POLICY IF EXISTS "questions_delete_admin" ON public.questions;

DROP POLICY IF EXISTS "characters_select_all" ON public.characters;
DROP POLICY IF EXISTS "characters_insert_admin" ON public.characters;
DROP POLICY IF EXISTS "characters_update_admin" ON public.characters;
DROP POLICY IF EXISTS "characters_delete_admin" ON public.characters;

DROP POLICY IF EXISTS "results_select_own" ON public.results;
DROP POLICY IF EXISTS "results_insert_own" ON public.results;
DROP POLICY IF EXISTS "results_delete_admin" ON public.results;

DROP POLICY IF EXISTS "comments_select_all" ON public.comments;
DROP POLICY IF EXISTS "comments_insert_own" ON public.comments;
DROP POLICY IF EXISTS "comments_update_own" ON public.comments;
DROP POLICY IF EXISTS "comments_delete_admin" ON public.comments;

-- ========================================================================
-- 4. YANGI POLICYLARNI QURISH
-- ========================================================================

-- BOOKS: Hamma o'qiy oladi, faqat adminlar o'zgartira oladi
CREATE POLICY "books_select_all" ON public.books FOR SELECT USING (true);
CREATE POLICY "books_insert_admin" ON public.books FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "books_update_admin" ON public.books FOR UPDATE USING (public.is_admin());
CREATE POLICY "books_delete_admin" ON public.books FOR DELETE USING (public.is_admin());

-- QUESTIONS: Hamma o'qiy oladi, faqat adminlar o'zgartira oladi
CREATE POLICY "questions_select_all" ON public.questions FOR SELECT USING (true);
CREATE POLICY "questions_insert_admin" ON public.questions FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "questions_update_admin" ON public.questions FOR UPDATE USING (public.is_admin());
CREATE POLICY "questions_delete_admin" ON public.questions FOR DELETE USING (public.is_admin());

-- CHARACTERS: Hamma o'qiy oladi, faqat adminlar o'zgartira oladi
CREATE POLICY "characters_select_all" ON public.characters FOR SELECT USING (true);
CREATE POLICY "characters_insert_admin" ON public.characters FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "characters_update_admin" ON public.characters FOR UPDATE USING (public.is_admin());
CREATE POLICY "characters_delete_admin" ON public.characters FOR DELETE USING (public.is_admin());

-- RESULTS: Natijalarni hamma ko'ra oladi (reyting uchun), faqat kirgan odam o'z natijasini yozadi
CREATE POLICY "results_select_all" ON public.results FOR SELECT USING (true);
CREATE POLICY "results_insert_own" ON public.results FOR INSERT WITH CHECK (auth.uid()::text = "userId");
CREATE POLICY "results_delete_admin" ON public.results FOR DELETE USING (public.is_admin());

-- COMMENTS: Izohlarni hamma o'qiydi, faqat kirganlar yozadi, egasi yoki admin o'chira oladi
CREATE POLICY "comments_select_all" ON public.comments FOR SELECT USING (true);
CREATE POLICY "comments_insert_own" ON public.comments FOR INSERT WITH CHECK (auth.uid()::text = "userId");
CREATE POLICY "comments_update_own" ON public.comments FOR UPDATE USING (auth.uid()::text = "userId");
CREATE POLICY "comments_delete_policy" ON public.comments FOR DELETE USING (auth.uid()::text = "userId" OR public.is_admin());
