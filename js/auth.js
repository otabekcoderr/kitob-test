import { addUser, getUserByUsername, updateUser } from './db.js';

const SESSION_KEY = 'kitobtest_session';

function hashPassword(password) {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

const AVATARS = ['😊', '🦊', '🐱', '🦁', '🐼', '🦉', '🐸', '🌟', '🎯', '🚀', '📚', '🎨', '🧠', '✍️', '💡', '🧙'];

export async function register(fullName, username, password) {
  if (!fullName || !username || !password) {
    throw new Error("Iltimos, barcha maydonlarni to'ldiring!");
  }
  if (username.length < 3) {
    throw new Error("Foydalanuvchi nomi kamida 3 ta belgidan iborat bo'lishi kerak");
  }
  if (password.length < 4) {
    throw new Error("Parol kamida 4 ta belgidan iborat bo'lishi kerak");
  }

  // Check username uniqueness
  const existingUser = await getUserByUsername(username);
  if (existingUser) {
    throw new Error("Ushbu foydalanuvchi nomi allaqachon band!");
  }

  const userId = crypto.randomUUID();
  const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  const user = {
    id: userId,
    fullName,
    username,
    password: hashPassword(password),
    avatar,
    isAdmin: false,
    createdAt: Date.now(),
    stats: {
      testsCompleted: 0,
      avgScore: 0,
      bestScore: 0,
      currentStreak: 0,
      maxStreak: 0,
      lastQuizDate: ''
    }
  };

  await addUser(user);
  
  // Set session
  const sessionUser = { 
    id: user.id, 
    username: user.username, 
    fullName: user.fullName, 
    avatar: user.avatar,
    isAdmin: user.isAdmin,
    stats: user.stats 
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
  return sessionUser;
}

export async function login(username, password) {
  if (!username || !password) {
    throw new Error("Foydalanuvchi nomi va parolni kiriting!");
  }

  const user = await getUserByUsername(username);
  if (!user) {
    throw new Error("Foydalanuvchi topilmadi");
  }

  const hashed = hashPassword(password);
  if (user.password !== hashed) {
    throw new Error("Parol noto'g'ri!");
  }

  const sessionUser = { 
    id: user.id, 
    username: user.username, 
    fullName: user.fullName, 
    avatar: user.avatar,
    isAdmin: !!user.isAdmin,
    stats: user.stats 
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser));
  return sessionUser;
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
}

export function getCurrentUser() {
  const session = localStorage.getItem(SESSION_KEY);
  if (!session) return null;
  try {
    return JSON.parse(session);
  } catch (e) {
    return null;
  }
}

export function isLoggedIn() {
  return getCurrentUser() !== null;
}

export async function updateProfile(updates) {
  const currentUser = getCurrentUser();
  if (!currentUser) throw new Error("Tizimga kirilmagan!");

  if (updates.password) {
    updates.password = hashPassword(updates.password);
  }

  // Check username uniqueness if changing username
  if (updates.username && updates.username !== currentUser.username) {
    const existing = await getUserByUsername(updates.username);
    if (existing) {
      throw new Error("Ushbu foydalanuvchi nomi band!");
    }
  }

  const updatedUser = await updateUser(currentUser.id, updates);
  
  const newSessionUser = {
    id: updatedUser.id,
    username: updatedUser.username,
    fullName: updatedUser.fullName,
    avatar: updatedUser.avatar,
    avatarCharId: updatedUser.avatarCharId || undefined,
    isAdmin: !!updatedUser.isAdmin,
    stats: updatedUser.stats
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(newSessionUser));
  return newSessionUser;
}

export function getAvatars() {
  return AVATARS;
}

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'Admin@2024!';
const ADMIN_HASH = hashPassword(ADMIN_PASSWORD);

export async function initAdminAccount() {
  try {
    const existingAdmin = await getUserByUsername(ADMIN_USERNAME);
    if (!existingAdmin) {
      const user = {
        id: 'admin-fixed-id-uuid',
        fullName: 'Administrator 👑',
        username: ADMIN_USERNAME,
        password: ADMIN_HASH,
        avatar: '🧙',
        isAdmin: true,
        createdAt: Date.now(),
        stats: {
          testsCompleted: 0,
          avgScore: 0,
          bestScore: 0,
          currentStreak: 0,
          maxStreak: 0,
          lastQuizDate: ''
        }
      };
      await addUser(user);
      console.log("Super Admin yaratildi: admin / " + ADMIN_PASSWORD);
    }
  } catch (err) {
    console.error("Failed to seed admin:", err);
  }
}

export function getAdminCredentials() {
  return { username: ADMIN_USERNAME, password: ADMIN_PASSWORD };
}
