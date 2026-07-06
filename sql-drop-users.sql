-- ========================================================================
-- BOSQICH 4 - ESKI USERS JADVALINI O'CHIRISH
-- ========================================================================

-- 1. Avval users jadvalida ma'lumot qolgan-qolmaganligini tekshiring:
SELECT count(*) FROM public.users;

-- 2. Agar barcha ma'lumotlar profiles jadvaliga ko'chgan bo'lsa (yoki yangi loyiha bo'lsa),
--    eski users jadvalini butunlay o'chirib tashlang:
DROP TABLE IF EXISTS public.users;
