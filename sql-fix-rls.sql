-- ========================================================================
-- PROFILES jadvalining RLS qoidalarini tuzatish
-- ========================================================================

-- 1. Eski profiles policylarni o'chirish
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.profiles;
DROP POLICY IF EXISTS "Enable update for users based on id" ON public.profiles;

-- 2. Yangi to'g'ri policylarni yaratish
-- Barcha profillarni HAMMA o'qiy oladi (leaderboard, dashboard uchun)
CREATE POLICY "profiles_select_all" ON public.profiles
  FOR SELECT USING (true);

-- Faqat o'z profilini yangilash
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- Profil yaratish (trigger yoki ro'yxatdan o'tish orqali)
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ========================================================================
-- ROL VA ADMINLIK HUQUQINI NOQONUNIY O'ZGARTIRISHDAN HIMOYA (TRIGGER)
-- ========================================================================
CREATE OR REPLACE FUNCTION public.protect_profile_admin_role()
RETURNS trigger AS $$
BEGIN
  -- Agar role yoki is_admin o'zgartirilayotgan bo'lsa
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_admin IS DISTINCT FROM OLD.is_admin) THEN
    -- Faqat mavjud admin o'zgartira oladi
    IF NOT (SELECT public.is_admin()) THEN
      RAISE EXCEPTION 'Xavfsizlik: Oddiy foydalanuvchilar o''z rolini administratorga o''zgartira olmaydi!';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_profile_admin_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_admin_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_admin_role();

-- ========================================================================
-- RESULTS va COMMENTS policylarni qayta tekshirish/tuzatish
-- ========================================================================

-- Results: eski policylarni o'chirish va qayta yaratish
DROP POLICY IF EXISTS "results_select_all" ON public.results;
DROP POLICY IF EXISTS "results_select_own" ON public.results;
DROP POLICY IF EXISTS "results_insert_own" ON public.results;
DROP POLICY IF EXISTS "results_delete_admin" ON public.results;

CREATE POLICY "results_select_all" ON public.results
  FOR SELECT USING (true);

CREATE POLICY "results_insert_own" ON public.results
  FOR INSERT WITH CHECK (auth.uid()::text = "userId");

CREATE POLICY "results_delete_admin" ON public.results
  FOR DELETE USING (public.is_admin());

-- Comments: eski policylarni o'chirish va qayta yaratish
DROP POLICY IF EXISTS "comments_select_all" ON public.comments;
DROP POLICY IF EXISTS "comments_insert_own" ON public.comments;
DROP POLICY IF EXISTS "comments_update_own" ON public.comments;
DROP POLICY IF EXISTS "comments_delete_policy" ON public.comments;

CREATE POLICY "comments_select_all" ON public.comments
  FOR SELECT USING (true);

CREATE POLICY "comments_insert_own" ON public.comments
  FOR INSERT WITH CHECK (auth.uid()::text = "userId");

CREATE POLICY "comments_update_own" ON public.comments
  FOR UPDATE USING (auth.uid()::text = "userId");

CREATE POLICY "comments_delete_policy" ON public.comments
  FOR DELETE USING (auth.uid()::text = "userId" OR public.is_admin());
