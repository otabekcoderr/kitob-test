import { supabase } from './supabase-client.js';

const SESSION_KEY = 'kitobtest_session';
const AVATARS = ['😊', '🦊', '🐱', '🦁', '🐼', '🦉', '🐸', '🌟', '🎯', '🚀', '📚', '🎨', '🧠', '✍️', '💡', '🧙'];

function usernameToEmail(username) {
  return `${username.toLowerCase()}@kitobchi.local`;
}

async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error || !data) return null;
  return data;
}

function formatUser(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    username: profile.username,
    fullName: profile.full_name,
    avatar: profile.avatar,
    avatarImage: profile.avatar_image,
    avatarCharId: profile.avatar_char_id,
    isAdmin: !!profile.is_admin,
    stats: profile.stats || {
      testsCompleted: 0,
      avgScore: 0,
      bestScore: 0,
      currentStreak: 0,
      maxStreak: 0,
      lastQuizDate: ''
    }
  };
}

function saveSession(user) {
  if (user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input.replace(/[<>\"'&]/g, (char) => {
    const map = {
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '&': '&amp;'
    };
    return map[char];
  });
}

export async function register(fullName, username, password) {
  if (!fullName || !username || !password) {
    throw new Error("Iltimos, barcha maydonlarni to'ldiring!");
  }
  if (username.length < 3) {
    throw new Error("Foydalanuvchi nomi kamida 3 ta belgidan iborat bo'lishi kerak");
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    throw new Error("Foydalanuvchi nomi faqat harf, raqam va _ belgisidan iborat bo'lishi kerak");
  }
  if (password.length < 4) {
    throw new Error("Parol kamida 4 ta belgidan iborat bo'lishi kerak");
  }

  const sanitizedFullName = sanitizeInput(fullName.trim());
  const sanitizedUsername = sanitizeInput(username.toLowerCase().trim());
  const email = usernameToEmail(sanitizedUsername);
  const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];

  // Username band emasligini oldindan tekshirish (UX uchun)
  const { data: existing } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', sanitizedUsername)
    .maybeSingle();

  if (existing) {
    throw new Error("Ushbu foydalanuvchi nomi allaqachon band!");
  }

  // signUp — trigger profile'ni metadata orqali avtomatik yaratadi
  // MUHIM: manual profiles.insert() YO'Q — trigger buni qiladi
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: sanitizedUsername,
        full_name: sanitizedFullName,
        avatar
      }
    }
  });

  if (error) {
    if (
      error.message.includes('already registered') ||
      error.message.includes('already exists')
    ) {
      throw new Error("Ushbu foydalanuvchi nomi allaqachon band!");
    }
    throw new Error("Ro'yxatdan o'tishda xatolik: " + error.message);
  }

  if (!data.user) {
    throw new Error("Ro'yxatdan o'tishda xatolik yuz berdi");
  }

  // Email tasdiqlash yoqilganmi tekshirish
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error(
      "Email tasdiqlash yoqilgan. Supabase Dashboard → Authentication → " +
      "Settings → 'Confirm email' ni o'chiring."
    );
  }

  // Trigger ishlashi uchun profile'ni o'qiymiz
  let profile = await getProfile(data.user.id);
  if (!profile) {
    // Trigger biroz kechikishi mumkin — bir marta qayta urinamiz
    await new Promise(r => setTimeout(r, 600));
    profile = await getProfile(data.user.id);
  }

  if (!profile) {
    // Trigger ishlamagan — fallback sifatida manual yaratamiz
    await supabase.from('profiles').insert({
      id: data.user.id,
      username: sanitizedUsername,
      full_name: sanitizedFullName,
      avatar,
      is_admin: false,
      stats: {
        testsCompleted: 0,
        avgScore: 0,
        bestScore: 0,
        currentStreak: 0,
        maxStreak: 0,
        lastQuizDate: ''
      }
    });
    profile = await getProfile(data.user.id);
  }

  if (!profile) {
    throw new Error(
      "Profil yaratildi, lekin yuklab bo'lmadi. Iltimos, kirishni qayta urinib ko'ring."
    );
  }

  const sessionUser = formatUser(profile);
  saveSession(sessionUser);
  return sessionUser;
}

export async function login(username, password) {
  if (!username || !password) {
    throw new Error("Foydalanuvchi nomi va parolni kiriting!");
  }

  const sanitizedUsername = sanitizeInput(username.toLowerCase().trim());
  const email = usernameToEmail(sanitizedUsername);

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        throw new Error("Foydalanuvchi nomi yoki parol noto'g'ri!");
      }
      if (error.message.includes('Email not confirmed')) {
        throw new Error(
          "Supabase Dashboard → Authentication → Settings → " +
          "'Confirm email' ni o'chiring va qayta urinib ko'ring."
        );
      }
      throw new Error(error.message);
    }

    if (!data.user) {
      throw new Error("Tizimga kirishda xatolik yuz berdi");
    }

    const profile = await getProfile(data.user.id);
    const sessionUser = formatUser(profile);
    if (!sessionUser) {
      throw new Error("Profil ma'lumotlari topilmadi");
    }

    saveSession(sessionUser);
    return sessionUser;
  } catch (err) {
    if (err.message.includes('Invalid login credentials')) {
      throw new Error("Foydalanuvchi nomi yoki parol noto'g'ri!");
    }
    if (err.message.includes('Email not confirmed')) {
      throw new Error(
        "Supabase Dashboard → Authentication → Settings → " +
        "'Confirm email' ni o'chiring va qayta urinib ko'ring."
      );
    }
    throw new Error(err.message);
  }
}

export function logout() {
  supabase.auth.signOut();
  localStorage.removeItem(SESSION_KEY);
}

export function getCurrentUser() {
  const session = localStorage.getItem(SESSION_KEY);
  if (!session) return null;
  try {
    return JSON.parse(session);
  } catch {
    return null;
  }
}

export function isLoggedIn() {
  return getCurrentUser() !== null;
}

export async function updateProfile(updates) {
  const currentUser = getCurrentUser();
  if (!currentUser) throw new Error("Tizimga kirilmagan!");

  const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();
  if (userError || !authUser) throw new Error("Tizimga kirilmagan!");

  if (updates.password) {
    if (updates.password.length < 4) {
      throw new Error("Parol kamida 4 ta belgidan iborat bo'lishi kerak");
    }
    const { error: pwError } = await supabase.auth.updateUser({
      password: updates.password
    });
    if (pwError) throw new Error("Parolni yangilashda xatolik: " + pwError.message);
  }

  const profileUpdates = {};
  if (updates.fullName) profileUpdates.full_name = sanitizeInput(updates.fullName);
  if (updates.avatar) profileUpdates.avatar = updates.avatar;
  if (updates.avatarImage !== undefined) profileUpdates.avatar_image = updates.avatarImage;
  if (updates.avatarCharId !== undefined) profileUpdates.avatar_char_id = updates.avatarCharId;

  if (Object.keys(profileUpdates).length > 0) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update(profileUpdates)
      .eq('id', authUser.id);

    if (profileError) {
      throw new Error("Profilni yangilashda xatolik yuz berdi");
    }
  }

  const profile = await getProfile(authUser.id);
  const sessionUser = formatUser(profile) || currentUser;
  saveSession(sessionUser);
  return sessionUser;
}

export function getAvatars() {
  return AVATARS;
}

// Supabase auth holat o'zgarishlarini kuzatish
export function initAuth() {
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
      localStorage.removeItem(SESSION_KEY);
    }
  });
}

// initAdminAccount — OLIB TASHLANDI
// Admin Supabase Dashboard orqali qo'lda yaratiladi:
// 1. Authentication → Users → Add user
//    Email: admin@kitobchi.local
//    Password: (o'zingiz tanlagan parol)
// 2. Table Editor → profiles → Insert row:
//    id: (yuqorida yaratilgan user ID)
//    username: admin
//    full_name: Administrator 👑
//    avatar: 🧙
//    is_admin: true