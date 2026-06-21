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

-- RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE arena_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on books" ON books FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on results" ON results FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on comments" ON comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on questions" ON questions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on arena_matches" ON arena_matches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on characters" ON characters FOR ALL USING (true) WITH CHECK (true);
