import { addUser, getUserByUsername, updateUser } from './db.js';

const SESSION_KEY = 'kitobtest_session';

const AVATARS = ['😊', '🦊', '🐱', '🦁', '🐼', '🦉', '🐸', '🌟', '🎯', '🚀', '📚', '🎨', '🧠', '✍️', '💡', '🧙'];

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password, hashedPassword) {
  const hashedInput = await hashPassword(password);
  return hashedInput === hashedPassword;
}

export async function register(fullName, username, password) {
  if (!fullName || !username || !password) {
    throw new Error("Iltimos, barcha maydonlarni to'ldiring!");
  }
  if (username.length < 3) {
    throw new Error("Foydalanuvchi nomi kamida 3 ta belgidan iborat bo'lishi kerak");
  }
  if (password.length < 8) {
    throw new Error("Parol kamida 8 ta belgidan iborat bo'lishi kerak");
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error("Parol kamida bitta katta harf, bitta kichik harf va bitta raqamdan iborat bo'lishi kerak");
  }

  const sanitizedFullName = sanitizeInput(fullName);
  const sanitizedUsername = sanitizeInput(username.toLowerCase());

  // Check username uniqueness
  const existingUser = await getUserByUsername(sanitizedUsername);
  if (existingUser) {
    throw new Error("Ushbu foydalanuvchi nomi allaqachon band!");
  }

  const userId = crypto.randomUUID();
  const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
  const user = {
    id: userId,
    fullName: sanitizedFullName,
    username: sanitizedUsername,
    password: await hashPassword(password),
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

  const sanitizedUsername = sanitizeInput(username.toLowerCase());
  const user = await getUserByUsername(sanitizedUsername);
  if (!user) {
    throw new Error("Foydalanuvchi topilmadi");
  }

  const isValid = await verifyPassword(password, user.password);
  if (!isValid) {
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

function sanitizeInput(input) {
  return input.replace(/[<>\"'&]/g, (char) => {
    const map = { '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '&': '&amp;' };
    return map[char];
  });
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
    if (updates.password.length < 8) {
      throw new Error("Parol kamida 8 ta belgidan iborat bo'lishi kerak");
    }
    if (!/[A-Z]/.test(updates.password) || !/[a-z]/.test(updates.password) || !/[0-9]/.test(updates.password)) {
      throw new Error("Parol kamida bitta katta harf, bitta kichik harf va bitta raqamdan iborat bo'lishi kerak");
    }
    updates.password = await hashPassword(updates.password);
  }

  // Check username uniqueness if changing username
  if (updates.username && updates.username !== currentUser.username) {
    const sanitizedUsername = sanitizeInput(updates.username.toLowerCase());
    const existing = await getUserByUsername(sanitizedUsername);
    if (existing) {
      throw new Error("Ushbu foydalanuvchi nomi band!");
    }
    updates.username = sanitizedUsername;
  }

  if (updates.fullName) {
    updates.fullName = sanitizeInput(updates.fullName);
  }

  const updatedUser = await updateUser(currentUser.id, updates);
  if (!updatedUser) {
    throw new Error("Profilni yangilashda xatolik yuz berdi. Iltimos, qayta urinib ko'ring.");
  }
  
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

const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'Admin@2024!SecurePass';

export async function initAdminAccount() {
  try {
    const existingAdmin = await getUserByUsername(DEFAULT_ADMIN_USERNAME);
    const adminHash = await hashPassword(DEFAULT_ADMIN_PASSWORD);
    
    if (!existingAdmin) {
      const user = {
        id: 'admin-fixed-id-uuid',
        fullName: 'Administrator 👑',
        username: DEFAULT_ADMIN_USERNAME,
        password: adminHash,
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
      console.log("Super Admin yaratildi. Iltimos, parolni o'zgartiring!");
    } else if (existingAdmin.password !== adminHash) {
      await updateUser(existingAdmin.id, { password: adminHash });
      console.log("Admin paroli yangilandi");
    }
  } catch (err) {
    console.error("Failed to seed admin:", err);
  }
}
