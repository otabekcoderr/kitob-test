-- Eski jadvallarni o'chirish
DROP TABLE IF EXISTS arena_matches CASCADE;
DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS results CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS books CASCADE;
DROP TABLE IF EXISTS characters CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Users
CREATE TABLE users (
  "id" TEXT PRIMARY KEY,
  "fullName" TEXT NOT NULL,
  "username" TEXT UNIQUE NOT NULL,
  "password" TEXT NOT NULL,
  "avatar" TEXT DEFAULT '😊',
  "isAdmin" BOOLEAN DEFAULT false,
  "createdAt" BIGINT NOT NULL,
  "stats" JSONB DEFAULT '{}'::jsonb,
  "avatarCharId" TEXT DEFAULT ''
);

-- Books
CREATE TABLE books (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "author" TEXT DEFAULT '',
  "year" INTEGER DEFAULT 0,
  "genre" TEXT DEFAULT '',
  "difficulty" TEXT DEFAULT '',
  "cover" TEXT DEFAULT '',
  "coverBg" TEXT DEFAULT '',
  "coverTitleColor" TEXT DEFAULT '',
  "coverImage" TEXT DEFAULT '',
  "description" TEXT DEFAULT '',
  "questionCount" INTEGER DEFAULT 0
);

-- Results
CREATE TABLE results (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "userName" TEXT DEFAULT '',
  "userAvatar" TEXT DEFAULT '',
  "bookId" TEXT DEFAULT '',
  "bookTitle" TEXT DEFAULT '',
  "score" INTEGER DEFAULT 0,
  "originalScore" INTEGER DEFAULT 0,
  "penaltiesCount" INTEGER DEFAULT 0,
  "totalQuestions" INTEGER DEFAULT 0,
  "correctAnswers" INTEGER DEFAULT 0,
  "timeSpent" INTEGER DEFAULT 0,
  "answers" JSONB DEFAULT '[]'::jsonb,
  "completedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_results_userId ON results("userId");
CREATE INDEX IF NOT EXISTS idx_results_bookId ON results("bookId");

-- Comments
CREATE TABLE comments (
  "id" TEXT PRIMARY KEY,
  "bookId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userName" TEXT DEFAULT '',
  "userAvatar" TEXT DEFAULT '',
  "text" TEXT NOT NULL,
  "likesCount" INTEGER DEFAULT 0,
  "likedBy" JSONB DEFAULT '[]'::jsonb,
  "createdAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_bookId ON comments("bookId");
CREATE INDEX IF NOT EXISTS idx_comments_userId ON comments("userId");

-- Questions
CREATE TABLE questions (
  "id" TEXT PRIMARY KEY,
  "bookId" TEXT NOT NULL,
  "question" TEXT NOT NULL,
  "options" JSONB NOT NULL,
  "correctAnswer" INTEGER NOT NULL,
  "explanation" TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_questions_bookId ON questions("bookId");

-- Arena matches
CREATE TABLE arena_matches (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "userName" TEXT DEFAULT '',
  "userAvatar" TEXT DEFAULT '',
  "score" INTEGER DEFAULT 0,
  "correctCount" INTEGER DEFAULT 0,
  "totalQuestions" INTEGER DEFAULT 0,
  "timeSpent" INTEGER DEFAULT 0,
  "completedAt" BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_arena_userId ON arena_matches("userId");

-- Characters
CREATE TABLE characters (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "bookTitle" TEXT DEFAULT '',
  "avatar" TEXT DEFAULT '',
  "color" TEXT DEFAULT '',
  "description" TEXT DEFAULT '',
  "avatarImage" TEXT DEFAULT ''
);

-- ========================================================================
-- RLS (Row Level Security) — Har bir jadval auth.uid() asosida himoyalangan
-- ========================================================================

-- DIQQAT: Supabase SQL Editor'da quyidagi skriptni ishga tushiring.
-- Undan oldin eski "Allow all" policy'larni o'chirish kerak:
--
-- MUHIM: Supabase Authentication → Settings da "Confirm email" O'CHIRILGAN bo'lishi kerak!
-- Aks holda ro'yxatdan o'tish va admin login ishlamaydi (ilova @kitobchi.local fake email ishlatadi).
--
-- DROP POLICY IF EXISTS "Allow all on users" ON users;
-- DROP POLICY IF EXISTS "Allow all on books" ON books;
-- DROP POLICY IF EXISTS "Allow all on results" ON results;
-- DROP POLICY IF EXISTS "Allow all on comments" ON comments;
-- DROP POLICY IF EXISTS "Allow all on questions" ON questions;
-- DROP POLICY IF EXISTS "Allow all on arena_matches" ON arena_matches;
-- DROP POLICY IF EXISTS "Allow all on characters" ON characters;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE arena_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;

-- PROFILES: foydalanuvchi faqat o'z profilini ko'radi/tahrirlaydi; admin hammasini
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  USING (auth.uid() = id OR (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  USING (auth.uid() = id OR (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true)
  WITH CHECK (auth.uid() = id OR (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true);
CREATE POLICY "profiles_delete_admin" ON profiles FOR DELETE
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()) = true);

-- BOOKS: hamma ko'radi, faqat admin qo'shadi/tahrirlaydi/o'chiradi
CREATE POLICY "books_select_all" ON books FOR SELECT USING (true);
CREATE POLICY "books_insert_admin" ON books FOR INSERT
  WITH CHECK ((SELECT is_admin FROM profiles WHERE id = auth.uid()) = true);
CREATE POLICY "books_update_admin" ON books FOR UPDATE
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()) = true);
CREATE POLICY "books_delete_admin" ON books FOR DELETE
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()) = true);

-- RESULTS: foydalanuvchi o'z natijasini ko'radi, admin hammasini
CREATE POLICY "results_select_own" ON results FOR SELECT
  USING (auth.uid() = userId OR (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true);
CREATE POLICY "results_insert_own" ON results FOR INSERT
  WITH CHECK (auth.uid() = userId);
CREATE POLICY "results_delete_admin" ON results FOR DELETE
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()) = true);

-- COMMENTS: hamma ko'radi, faqat o'z fikrini qo'shadi; admin o'chiradi
CREATE POLICY "comments_select_all" ON comments FOR SELECT USING (true);
CREATE POLICY "comments_insert_own" ON comments FOR INSERT
  WITH CHECK (auth.uid() = userId);
CREATE POLICY "comments_update_own" ON comments FOR UPDATE
  USING (auth.uid() = userId);
CREATE POLICY "comments_delete_admin" ON comments FOR DELETE
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()) = true);

-- QUESTIONS: hamma ko'radi, faqat admin qo'shadi/tahrirlaydi/o'chiradi
CREATE POLICY "questions_select_all" ON questions FOR SELECT USING (true);
CREATE POLICY "questions_insert_admin" ON questions FOR INSERT
  WITH CHECK ((SELECT is_admin FROM profiles WHERE id = auth.uid()) = true);
CREATE POLICY "questions_update_admin" ON questions FOR UPDATE
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()) = true);
CREATE POLICY "questions_delete_admin" ON questions FOR DELETE
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()) = true);

-- ARENA_MATCHES: foydalanuvchi o'z jangini ko'radi, admin hammasini
CREATE POLICY "arena_select_own" ON arena_matches FOR SELECT
  USING (auth.uid() = userId OR (SELECT is_admin FROM profiles WHERE id = auth.uid()) = true);
CREATE POLICY "arena_insert_own" ON arena_matches FOR INSERT
  WITH CHECK (auth.uid() = userId);
CREATE POLICY "arena_delete_admin" ON arena_matches FOR DELETE
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()) = true);

-- CHARACTERS: hamma ko'radi, faqat admin qo'shadi/tahrirlaydi/o'chiradi
CREATE POLICY "characters_select_all" ON characters FOR SELECT USING (true);
CREATE POLICY "characters_insert_admin" ON characters FOR INSERT
  WITH CHECK ((SELECT is_admin FROM profiles WHERE id = auth.uid()) = true);
CREATE POLICY "characters_update_admin" ON characters FOR UPDATE
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()) = true);
CREATE POLICY "characters_delete_admin" ON characters FOR DELETE
  USING ((SELECT is_admin FROM profiles WHERE id = auth.uid()) = true);
