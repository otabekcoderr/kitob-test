// ============================================================
// auth.js — Foydalanuvchi autentifikatsiyasi
// ============================================================
// Bu fayl faqat autentifikatsiya bilan shug'ullanadi:
//   register · login · logout · getCurrentUser
//   updateProfile · initAuth
//
// Import qilinadi: supabase-client.js, utils.js
// Bu fayldan import qilinadi: boshqa barcha fayllar
// ============================================================

import { supabase, isSupabaseOnline } from './supabase-client.js';
import {
  uzbekifyError,
  generateSalt,
  hashPassword,
  verifyPassword,
  generateSessionToken,
  setAdminSessionSecret,
  createDynamicAdminToken,
  verifySessionSignature,
} from './utils.js';
import { characters }    from './characters.js';

// ============================================================
// ICHKI KONSTANTALAR VA XAVFSIZLIK SOZLAMALARI
// ============================================================

/** localStorage kalit nomi — sessiyani saqlash uchun */
export const SESSION_KEY = 'kitobchi_user';

/** Ro'yxatdan o'tgan foydalanuvchilar zaxirasi (offline/fallback uchun) */
export const REGISTERED_USERS_KEY = 'kitobchi_registered_users';

/** Brute-force va tez-tez noto'g'ri urinishlardan himoya kaliti */
export const RATE_LIMIT_KEY = 'kitobchi_auth_rate_limit';

/**
 * Autentifikatsiya cheklovi (Rate Limiting) holatini qaytaradi.
 * @returns {{ isLocked: boolean, remainingSeconds: number, attempts: number }}
 */
export function getRateLimitStatus() {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    if (!raw) return { isLocked: false, remainingSeconds: 0, attempts: 0 };
    const data = JSON.parse(raw);
    const now = Date.now();
    if (data.lockoutUntil && now < data.lockoutUntil) {
      const remainingSeconds = Math.ceil((data.lockoutUntil - now) / 1000);
      return { isLocked: true, remainingSeconds, attempts: data.attempts || 0 };
    }
    return { isLocked: false, remainingSeconds: 0, attempts: data.attempts || 0 };
  } catch {
    return { isLocked: false, remainingSeconds: 0, attempts: 0 };
  }
}

/**
 * Noto'g'ri urinishni qayd qiladi va kerak bo'lsa kirishni bloklaydi.
 */
export function _recordFailedLogin() {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    const data = raw ? JSON.parse(raw) : { attempts: 0, lockoutUntil: 0 };
    data.attempts = (data.attempts || 0) + 1;
    const now = Date.now();
    if (data.attempts >= 10) {
      data.lockoutUntil = now + 300 * 1000; // 10 marta xatoda 5 daqiqa (300s) lockout
    } else if (data.attempts >= 5) {
      data.lockoutUntil = now + 30 * 1000;  // 5 marta xatoda 30 soniya lockout
    }
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(data));
  } catch {}
}

/**
 * Muvaffaqiyatli kirishda cheklovlarni bekor qiladi.
 */
export function _clearRateLimit() {
  try {
    localStorage.removeItem(RATE_LIMIT_KEY);
  } catch {}
}

function _getRegisteredUsers() {
  try {
    const raw = localStorage.getItem(REGISTERED_USERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Foydalanuvchini mahalliy xotiraga xavfsiz (SHA-256 + tuz bilan xeshlangan) saqlaydi.
 * Hech qachon ochiq parol yozilmaydi.
 * @param {object} user
 * @param {string} [plainPassword]
 */
async function _saveRegisteredUser(user, plainPassword) {
  if (!user || !user.username) return;
  try {
    const users = _getRegisteredUsers();
    const uname = String(user.username).toLowerCase();
    let salt = users[uname]?.salt || null;
    let passwordHash = users[uname]?.passwordHash || null;

    if (plainPassword) {
      salt = generateSalt(16);
      passwordHash = await hashPassword(plainPassword, salt);
    }

    users[uname] = {
      id: user.id || `local_user_${uname}`,
      username: uname,
      fullName: user.fullName || uname,
      email: user.email || `${uname}@kitobchi.local`,
      passwordHash: passwordHash,
      salt: salt,
      avatar: user.avatar || '👤',
      avatarCharId: user.avatarCharId || null,
      avatarImage: user.avatarImage || null,
      score: user.score || 0,
      streak: user.streak || 0,
      role: 'user',
      registeredAt: users[uname]?.registeredAt || new Date().toISOString()
    };
    // Agar eski ochiq parol bo'lsa uni olib tashlaymiz
    delete users[uname].password;

    localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(users));
  } catch (err) {
    console.warn('[auth] _saveRegisteredUser xatosi:', err);
  }
}

// ============================================================
// ICHKI YORDAMCHI FUNKSIYALAR (export qilinmaydi)
// ============================================================

/**
 * Foydalanuvchi ma'lumotlarini localStorage ga yozadi.
 * @param {object|null} user
 */
function _saveSession(user) {
  if (user && user.id) {
    if (user.role === 'admin' || user.isAdmin === true) {
      if (!user.sessionToken) {
        user.sessionToken = createDynamicAdminToken();
      }
      setAdminSessionSecret(user.sessionToken);
    } else {
      setAdminSessionSecret(null);
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));

    // Tanlangan personaj va avatarni hech qachon yo'qolmaydigan alohida kalitda mustahkam saqlaymiz
    if (user.avatarCharId || user.avatarImage || user.avatar) {
      try {
        localStorage.setItem(`kitobchi_user_character_${user.id}`, JSON.stringify({
          avatar: user.avatar || '🎭',
          avatarImage: user.avatarImage || null,
          avatarCharId: user.avatarCharId || null,
        }));
      } catch { /* ignore */ }
    }

    // Barcha foydalanuvchilar reyting xotirasiga ham doimiy yozib boramiz
    try {
      const raw = localStorage.getItem('kitobchi_all_users');
      const all = raw ? JSON.parse(raw) : {};
      all[user.id] = {
        id: user.id,
        username: user.username,
        fullName: user.fullName || user.username,
        avatar: user.avatar || '',
        avatarImage: user.avatarImage || null,
        avatarCharId: user.avatarCharId || null,
        score: user.score || 0,
        streak: user.streak || 0,
        lastQuizDate: user.lastQuizDate || null,
        role: user.role || 'user',
      };
      localStorage.setItem('kitobchi_all_users', JSON.stringify(all));
    } catch { /* ignore */ }
  } else {
    setAdminSessionSecret(null);
    localStorage.removeItem(SESSION_KEY);
  }
}

/**
 * Supabase auth.user va uning user_metadata dan
 * dasturda ishlatiladigan oddiy obyekt yasaydi.
 * Avvalgi sessiya va tanlangan personajni yo'qotmaydi.
 *
 * @param {import('@supabase/supabase-js').User} authUser
 * @param {object} [profileData] — profiles jadvalidan kelgan qo'shimcha ma'lumot
 * @returns {object}
 */
function _buildUserObject(authUser, profileData = {}) {
  // Avvalgi saqlangan ma'lumotlarni o'qiymiz
  const existingUser = getCurrentUser();

  let storedUser = null;
  try {
    const allRaw = localStorage.getItem('kitobchi_all_users');
    if (allRaw) {
      const all = JSON.parse(allRaw);
      storedUser = all[authUser.id] || null;
    }
  } catch {}

  let charData = null;
  try {
    const charRaw = localStorage.getItem(`kitobchi_user_character_${authUser.id}`);
    if (charRaw) charData = JSON.parse(charRaw);
  } catch {}

  const username      = profileData.username 
                     || authUser.user_metadata?.username 
                     || existingUser?.username 
                     || storedUser?.username 
                     || '';
  const email         = authUser.email || existingUser?.email || '';
  const cleanUsername = String(username).trim().toLowerCase();
  const cleanEmail    = String(email).trim().toLowerCase();

  // Adminlik huquqi: Hech qachon email.startsWith('admin@') orqali berilmaydi!
  // Faqat bazada tasdiqlangan admin roli va metadata uchun
  const isAdmin = Boolean(
    profileData.role === 'admin' ||
    profileData.is_admin === true ||
    profileData.isAdmin === true ||
    authUser.user_metadata?.role === 'admin'
  );

  // Avatar va Personaj ustuvorligi:
  const avatarCharId = charData?.avatarCharId !== undefined 
    ? charData.avatarCharId 
    : (existingUser?.avatarCharId !== undefined ? existingUser.avatarCharId : (storedUser?.avatarCharId || authUser.user_metadata?.avatarCharId || authUser.user_metadata?.avatar_char_id || profileData.avatar_char_id || null));

  const charFallback = avatarCharId ? (characters || []).find(c => String(c.id) === String(avatarCharId)) : null;

  const avatarImage = charData?.avatarImage !== undefined 
    ? charData.avatarImage 
    : (existingUser?.avatarImage !== undefined ? existingUser.avatarImage : (storedUser?.avatarImage || authUser.user_metadata?.avatarImage || authUser.user_metadata?.avatar_image || profileData.avatar_image || charFallback?.avatarImage || null));

  const avatar = charData?.avatar 
    || existingUser?.avatar 
    || storedUser?.avatar 
    || (profileData.avatar_image && (profileData.avatar_image.startsWith('http') || profileData.avatar_image.startsWith('data:image/')) ? profileData.avatar_image : null)
    || (profileData.avatar_url && (profileData.avatar_url.startsWith('http') || profileData.avatar_url.startsWith('data:image/')) ? profileData.avatar_url : null)
    || authUser.user_metadata?.avatar 
    || authUser.user_metadata?.avatar_url 
    || charFallback?.avatar
    || '🎭';

  const stats = profileData.stats || {};

  // Ball: Birinchi navbatda umumiy ball (totalScore / score) olinadi
  const score = stats.totalScore !== undefined && stats.totalScore !== null
    ? Number(stats.totalScore)
    : (stats.score !== undefined && stats.score !== null
      ? Number(stats.score)
      : Math.max(
          existingUser?.score || 0,
          storedUser?.score || 0,
          profileData.score || stats.avgScore || stats.bestScore || 0
        ));

  // Streak: currentStreak 0 bo'lsa ham 0 saqlanadi (hech qachon maxStreak bilan adashtirilmaydi)
  const streak = stats.currentStreak !== undefined && stats.currentStreak !== null
    ? Number(stats.currentStreak)
    : (profileData.streak !== undefined && profileData.streak !== null
      ? Number(profileData.streak)
      : (existingUser?.streak !== undefined
        ? Number(existingUser.streak)
        : (storedUser?.streak !== undefined ? Number(storedUser.streak) : 0)));

  const lastQuizDate = stats.lastQuizDate 
                    || profileData.last_quiz_date 
                    || existingUser?.lastQuizDate 
                    || storedUser?.lastQuizDate 
                    || null;

  return {
    id:        authUser.id,
    email:     email,
    fullName:  profileData.full_name
                || authUser.user_metadata?.full_name  || existingUser?.fullName || username || 'Foydalanuvchi',
    username:  username,
    avatar:    avatar,
    avatarImage: avatarImage,
    avatarCharId: avatarCharId,
    role:      isAdmin ? 'admin' : (profileData.role || existingUser?.role || 'user'),
    isAdmin:   isAdmin,
    score:     score,
    streak:    streak,
    lastQuizDate: lastQuizDate,
    createdAt: authUser.created_at || '',
  };
}

// Profil so'rovlarini deduplikatsiya qilish uchun kesh (parallel so'rovlarni birlashtiradi)
const _profileInFlight = new Map();

/**
 * profiles jadvalidan foydalanuvchi qatorini olib keladi.
 * Timeout va AbortSignal bilan himoyalangan.
 * Parallel so'rovlar deduplikatsiya qilinadi.
 * Topilmasa null qaytaradi.
 *
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
export async function _fetchProfile(userId) {
  if (!userId) return null;

  // Supabase offlayn bo'lsa yoki circuit breaker faol bo'lsa — zudlik bilan 0ms da null qaytarish
  if (!isSupabaseOnline()) return null;

  // Agar ayni paytda shu userId uchun so'rov ketayotgan bo'lsa — mavjud Promiseni qaytaramiz
  if (_profileInFlight.has(userId)) {
    return _profileInFlight.get(userId);
  }

  const promise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      try { controller.abort(); } catch {}
    }, 3500);

    try {
      let query = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId);

      if (typeof query.abortSignal === 'function') {
        query = query.abortSignal(controller.signal);
      }

      const { data, error } = await query.maybeSingle();
      clearTimeout(timer);
      if (error) return null;
      return data;
    } catch {
      clearTimeout(timer);
      return null;
    } finally {
      _profileInFlight.delete(userId);
    }
  })();

  _profileInFlight.set(userId, promise);
  return promise;
}

// ============================================================
// 1. REGISTER — Ro'yxatdan o'tish
// ============================================================

/**
 * Yangi foydalanuvchi ro'yxatdan o'tkazadi.
 *
 * Oqim:
 *   1. Supabase Auth orqali signUp (email = username@kitobchi.app)
 *   2. profiles jadvaliga qator qo'shadi (upsert)
 *   3. Sessiyani localStorage ga saqlaydi
 *
 * @param {string} fullName — To'liq ism
 * @param {string} username — Foydalanuvchi nomi (unikal)
 * @param {string} password — Parol (min 6 belgi)
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
export async function register(fullName, username, password) {
  try {
    // Kirish ma'lumotlarini tekshirish
    if (!fullName?.trim())  return { success: false, error: 'Ism kiritilishi shart.' };
    if (!username?.trim())  return { success: false, error: 'Foydalanuvchi nomi kiritilishi shart.' };
    if (!password)          return { success: false, error: 'Parol kiritilishi shart.' };
    if (password.length < 6) return { success: false, error: 'Parol kamida 6 ta belgidan iborat bo\'lishi kerak.' };

    // Username faqat harf, raqam va _ dan iborat bo'lishi kerak
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      return { success: false, error: 'Foydalanuvchi nomida faqat harf, raqam va _ bo\'lishi mumkin.' };
    }

    const cleanName     = fullName.trim();
    const cleanUsername = username.trim().toLowerCase();

    if (cleanUsername === 'admin' || cleanUsername === 'admin_kitobchi') {
      return { success: false, error: 'Bu foydalanuvchi nomi xizmat uchun band.' };
    }

    // Mavjud foydalanuvchi nomini profiles jadvalidan tekshirish
    try {
      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', cleanUsername)
        .maybeSingle();

      if (existingProfile) {
        return { success: false, error: 'Bu foydalanuvchi nomi allaqachon ro\'yxatdan o\'tgan.' };
      }
    } catch {}

    // Supabase Auth signUp
    let authData = null;
    let authError = null;
    try {
      const res = await supabase.auth.signUp({
        email: `${cleanUsername}@kitobchi.local`,
        password: password,
        options: {
          data: {
            full_name: cleanName,
            username:  cleanUsername,
          }
        }
      });
      authData = res.data;
      authError = res.error;
    } catch (netErr) {
      authError = netErr;
    }

    // Xatoliklarni tekshirish
    if (authError) {
      if (/user already registered|already exists|duplicate/i.test(authError.message || '')) {
        return { success: false, error: 'Bu foydalanuvchi nomi allaqachon ro\'yxatdan o\'tgan.' };
      }
      return { success: false, error: uzbekifyError(authError) || 'Ro\'yxatdan o\'tishda xatolik yuz berdi.' };
    }

    // Agar foydalanuvchi mavjud bo'lsa (identities bo'sh qaytadi)
    if (authData?.user && Array.isArray(authData.user.identities) && authData.user.identities.length === 0) {
      return { success: false, error: 'Bu foydalanuvchi nomi allaqachon ro\'yxatdan o\'tgan.' };
    }

    if (!authData?.user?.id) {
      return { success: false, error: 'Ro\'yxatdan o\'tish amalga oshmadi. Iltimos qayta urinib ko\'ring.' };
    }

    // Foydalanuvchi obyektini yaratish
    const userId = authData.user.id;
    const userObj = {
      id:           userId,
      email:        authData.user.email || `${cleanUsername}@kitobchi.local`,
      fullName:     cleanName,
      username:     cleanUsername,
      role:         'user',
      isAdmin:      false,
      score:        0,
      streak:       0,
      avatar:       '👤',
      avatarImage:  null,
      avatarCharId: null,
      offlineSession: !authData?.session, // Agar email tasdiqlash yoqilgan yoki tarmoq uzilgan bo'lsa
      stats: {
        score: 0,
        totalScore: 0,
        bestScore: 0,
        avgScore: 0,
        currentStreak: 0,
        maxStreak: 0,
        testsCompleted: 0
      }
    };

    // Mahalliy va doimiy xotiraga xavfsiz saqlash (xesh + tuz)
    await _saveRegisteredUser(userObj, password);
    _saveSession(userObj);

    // Agar Supabase auth muvaffaqiyatli bo'lgan bo'lsa, profiles jadvaliga ham yozib qo'yish
    if (authData?.user?.id) {
      try {
        await supabase
          .from('profiles')
          .upsert({
            id:             authData.user.id,
            full_name:      cleanName,
            username:       cleanUsername,
            is_admin:       false,
            avatar:         '👤',
            avatar_image:   null,
            avatar_char_id: null,
            stats: {
              avgScore: 0,
              bestScore: 0,
              maxStreak: 0,
              lastQuizDate: '',
              currentStreak: 0,
              testsCompleted: 0
            },
            created_at:     new Date().toISOString(),
          }, { onConflict: 'id' });
      } catch (profileError) {
        console.warn('[auth] profiles upsert xatosi:', profileError.message);
      }
    }

    return { success: true, user: userObj };

  } catch (err) {
    console.error('[auth] register xatosi:', err);
    return { success: false, error: uzbekifyError(err) };
  }
}

// ============================================================
// 2. LOGIN — Tizimga kirish
// ============================================================

/**
 * Foydalanuvchini tizimga kiritadi.
 *
 * @param {string} username — Foydalanuvchi nomi yoki email
 * @param {string} password — Parol
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
export async function login(username, password) {
  try {
    if (!username?.trim()) return { success: false, error: 'Foydalanuvchi nomi kiritilishi shart.' };
    if (!password)          return { success: false, error: 'Parol kiritilishi shart.' };

    // 0. Xavfsizlik cheklovi (Rate Limiting) tekshiruvi
    const rateLimit = getRateLimitStatus();
    if (rateLimit.isLocked) {
      return {
        success: false,
        error: `Xavfsizlik tizimi: Ko'p marta xato urinish aniqlandi. Iltimos, ${rateLimit.remainingSeconds} soniyadan so'ng qayta urinib ko'ring.`
      };
    }

    const cleanInput = username.trim().toLowerCase();
    const cleanPass = password;


    // 2. Email formatini to'g'ri shakllantirish (Double-@ xatosining oldini olish)
    const emailToUse = cleanInput.includes('@') ? cleanInput : `${cleanInput}@kitobchi.local`;

    // 3. Supabase Auth orqali kirish (Parol Supabase darajasida tekshiriladi)
    let authData = null;
    let authError = null;
    try {
      const res = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password: cleanPass,
      });
      authData = res.data;
      authError = res.error;
    } catch (err) {
      authError = err;
    }

    // 4. Agar Supabase muvaffaqiyatli qabul qildi
    if (authData?.user) {
      _clearRateLimit();
      const profile = await _fetchProfile(authData.user.id);
      const userObj = _buildUserObject(authData.user, profile || {});
      await _saveRegisteredUser(userObj, cleanPass);
      _saveSession(userObj);
      return { success: true, user: userObj };
    }

    // 5. Supabase xatolik qaytargan holatda tahlil
    const errorMsg = (authError?.message || String(authError || '')).toLowerCase();
    const isNetworkError = errorMsg.includes('offline') || errorMsg.includes('connection_reset') || errorMsg.includes('fetch') || errorMsg.includes('network') || errorMsg.includes('503') || errorMsg.includes('timeout');

    // Faqat haqiqiy tarmoq uzilishida (offline) mahalliy keshdagi xesh orqali tekshirish
    if (isNetworkError) {
      const regUsers = _getRegisteredUsers();
      const localUser = regUsers[cleanInput] || regUsers[cleanInput.replace('@kitobchi.local', '')];

      if (localUser) {
        let isPassValid = false;
        if (localUser.passwordHash && localUser.salt) {
          isPassValid = await verifyPassword(cleanPass, localUser.salt, localUser.passwordHash);
        } else if (localUser.password) {
          if (localUser.password === cleanPass) {
            isPassValid = true;
            await _saveRegisteredUser(localUser, cleanPass);
          }
        }

        if (isPassValid) {
          _clearRateLimit();
          const userObj = {
            ...localUser,
            offlineSession: true
          };
          delete userObj.password;
          delete userObj.passwordHash;
          delete userObj.salt;
          _saveSession(userObj);
          return { success: true, user: userObj };
        }
      }
      return { success: false, error: 'Internet yoki server bilan aloqa yo\'q. Iltimos qayta urinib ko\'ring.' };
    }

    _recordFailedLogin();
    return { success: false, error: 'Login yoki parol noto\'g\'ri.' };

  } catch (err) {
    console.error('[auth] login xatosi:', err);
    _recordFailedLogin();
    return { success: false, error: uzbekifyError(err) };
  }
}

// ============================================================
// 3. LOGOUT — Tizimdan chiqish
// ============================================================

/**
 * Foydalanuvchini tizimdan chiqaradi.
 * Supabase sessiyasini va localStorage ni tozalaydi.
 *
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function logout() {
  try {
    const { error } = await supabase.auth.signOut();

    // localStorage va admin sessiya imzosini har doim tozalaymiz
    setAdminSessionSecret(null);
    _saveSession(null);

    if (error) {
      console.warn('[auth] signOut xatosi:', error.message);
      // Foydalanuvchi nuqtai nazaridan chiqish muvaffaqiyatli
    }

    return { success: true };

  } catch (err) {
    console.error('[auth] logout xatosi:', err);
    setAdminSessionSecret(null);
    _saveSession(null); // Baribir tozalaymiz
    return { success: false, error: uzbekifyError(err) };
  }
}

// ============================================================
// 4. GET CURRENT USER — Joriy foydalanuvchi
// ============================================================

/**
 * Joriy foydalanuvchini localStorage dan qaytaradi.
 * localStorage bo'sh bo'lsa — null qaytaradi.
 *
 * Bu funksiya SINXRON — async emas.
 * Tez, bloklanmaydigan tekshirish uchun ishlatiladi.
 *
 * @returns {object|null}
 */
export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw);
    if (!user || !user.id) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    // Sessiya yaxlitligi va soxtalashtirishdan himoya (Tamper-proofing):
    // Adminlik da'vosi faqat tasdiqlangan kriptografik sessiya tokeni bilan qabul qilinadi.
    if (user.role === 'admin' || user.isAdmin === true || user.is_admin === true) {
      if (!verifySessionSignature(user)) {
        console.warn('[auth] Ruxsatsiz yoki soxta admin sessiyasi aniqlandi va bekor qilindi.');
        user.role = 'user';
        user.isAdmin = false;
        delete user.is_admin;
        delete user.sessionToken;
        try {
          localStorage.setItem(SESSION_KEY, JSON.stringify(user));
        } catch {}
      }
    }

    return user;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

/**
 * Foydalanuvchi tizimga kirgan-kirmaganligini tekshiradi.
 *
 * @returns {boolean}
 */
export function isLoggedIn() {
  return getCurrentUser() !== null;
}

/**
 * Supabase dan joriy sessiyani oladi va localStorage ni yangilaydi.
 * Sahifa yuklanganda bir marta chaqirish tavsiya etiladi.
 *
 * @returns {Promise<object|null>} — yangilangan foydalanuvchi yoki null
 */
export async function refreshCurrentUser() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session?.user) {
      _saveSession(null);
      return null;
    }

    const profile = await _fetchProfile(session.user.id);
    const userObj = _buildUserObject(session.user, profile || {});
    _saveSession(userObj);

    return userObj;

  } catch (err) {
    console.error('[auth] refreshCurrentUser xatosi:', err);
    return null;
  }
}

// ============================================================
// 5. UPDATE PROFILE — Profilni yangilash
// ============================================================

/**
 * Foydalanuvchi profilini yangilaydi.
 *
 * Qabul qilinadigan maydonlar:
 *   fullName · avatar · score · streak · lastQuizDate
 *
 * @param {object} updates — yangilanishi kerak bo'lgan maydonlar
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
export async function updateProfile(updates) {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'Tizimga kirmagansiz.' };
    }

    // Faqat Supabase profiles jadvalida MAVJUD maydonlarni yuboramiz: full_name, avatar, avatar_image, avatar_char_id, stats
    const dbUpdates = {};
    if (updates.fullName !== undefined) dbUpdates.full_name = updates.fullName;

    if (updates.avatar !== undefined && typeof updates.avatar === 'string') {
      if (updates.avatar.startsWith('http://') || updates.avatar.startsWith('https://') || updates.avatar.startsWith('data:image/')) {
        dbUpdates.avatar_image = updates.avatar;
      } else {
        dbUpdates.avatar = updates.avatar;
      }
    }
    if (updates.avatarImage !== undefined) {
      dbUpdates.avatar_image = updates.avatarImage;
    }
    if (updates.avatarCharId !== undefined) {
      dbUpdates.avatar_char_id = updates.avatarCharId;
    }

    // Statistika (score, streak, lastQuizDate) ni profiles.stats jsonb ustuniga saqlash
    if (updates.score !== undefined || updates.streak !== undefined || updates.lastQuizDate !== undefined) {
      const currentStats = currentUser.stats || {};
      const newScore = updates.score !== undefined ? Number(updates.score) : (currentUser.score || 0);
      const newStreak = updates.streak !== undefined ? Number(updates.streak) : (currentUser.streak || 0);
      const oldMaxStreak = currentStats.maxStreak ?? currentUser.streak ?? 0;
      const newMaxStreak = Math.max(newStreak, oldMaxStreak);

      dbUpdates.stats = {
        ...currentStats,
        totalScore: newScore,
        score: newScore,
        avgScore: newScore,
        bestScore: Math.max(newScore, currentStats.bestScore || 0, updates.earnedScore || 0),
        currentStreak: newStreak,
        maxStreak: newMaxStreak,
        lastQuizDate: updates.lastQuizDate || currentUser.lastQuizDate || '',
        activeDates: updates.activeDates || currentStats.activeDates || [],
        testsCompleted: (currentStats.testsCompleted || currentUser.testsCompleted || 0) + (updates.earnedScore !== undefined ? 1 : 0),
      };
    }

    if (Object.keys(dbUpdates).length > 0) {
      // profiles jadvalini yangilash
      try {
        await supabase
          .from('profiles')
          .update(dbUpdates)
          .eq('id', currentUser.id);
      } catch (err) {
        console.warn('[auth] profiles update Supabase fallback:', err);
      }
    }

    // Supabase auth user_metadata ni ham yangilab qo'yamiz (har doim xatosiz sessiyaga tushadi)
    try {
      await supabase.auth.updateUser({
        data: {
          avatar: updates.avatar !== undefined ? updates.avatar : currentUser.avatar,
          avatarImage: updates.avatarImage !== undefined ? updates.avatarImage : currentUser.avatarImage,
          avatarCharId: updates.avatarCharId !== undefined ? updates.avatarCharId : currentUser.avatarCharId,
          full_name: updates.fullName !== undefined ? updates.fullName : currentUser.fullName,
          score: updates.score !== undefined ? updates.score : currentUser.score,
          streak: updates.streak !== undefined ? updates.streak : currentUser.streak,
        }
      });
    } catch (metaErr) {
      console.warn('[auth] updateUser metadata fallback:', metaErr);
    }

    // Mustaqil personaj kalitini yangilash
    if (updates.avatarCharId !== undefined || updates.avatarImage !== undefined || updates.avatar !== undefined) {
      try {
        localStorage.setItem(`kitobchi_user_character_${currentUser.id}`, JSON.stringify({
          avatar: updates.avatar ?? currentUser.avatar ?? '🎭',
          avatarImage: updates.avatarImage !== undefined ? updates.avatarImage : (currentUser.avatarImage || null),
          avatarCharId: updates.avatarCharId !== undefined ? updates.avatarCharId : (currentUser.avatarCharId || null),
        }));
      } catch {}
    }

    // localStorage dagi sessiyani yangilash
    const updatedUser = {
      ...currentUser,
      fullName:     updates.fullName     ?? currentUser.fullName,
      avatar:       updates.avatar       ?? currentUser.avatar,
      avatarImage:  updates.avatarImage  !== undefined ? updates.avatarImage : currentUser.avatarImage,
      avatarCharId: updates.avatarCharId !== undefined ? updates.avatarCharId : currentUser.avatarCharId,
      score:        updates.score        ?? currentUser.score,
      streak:       updates.streak       ?? currentUser.streak,
      lastQuizDate: updates.lastQuizDate ?? currentUser.lastQuizDate,
    };
    _saveSession(updatedUser);

    return { success: true, user: updatedUser };

  } catch (err) {
    console.error('[auth] updateProfile xatosi:', err);
    return { success: false, error: uzbekifyError(err) };
  }
}

// ============================================================
// 6. INIT AUTH — Auth holatini kuzatish
// ============================================================

/**
 * Supabase auth holat o'zgarishlarini kuzatadi.
 * Sahifa yuklanganda bir marta chaqiriladi.
 *
 * Callback:
 *   onLogin(user)  — foydalanuvchi tizimga kirganida
 *   onLogout()     — foydalanuvchi tizimdan chiqqanida
 *
 * @param {object}   callbacks
 * @param {Function} [callbacks.onLogin]  — (user: object) => void
 * @param {Function} [callbacks.onLogout] — () => void
 * @returns {Function} — obunani bekor qiluvchi funksiya (cleanup)
 *
 * @example
 *   const unsubscribe = initAuth({
 *     onLogin:  (user) => renderDashboard(user),
 *     onLogout: ()     => renderLoginPage(),
 *   });
 *
 *   // Kerakmas bo'lganda:
 *   unsubscribe();
 */
export function initAuth({ onLogin, onLogout } = {}) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (event, session) => {

      if (event === 'SIGNED_IN' && session?.user) {
        // 1. Agar foydalanuvchi ma'lumotlari keshda bo'lsa — zudlik bilan UI ni ochamiz (0ms instant render)
        const cachedUser = getCurrentUser();
        if (cachedUser && cachedUser.id === session.user.id) {
          if (typeof onLogin === 'function') onLogin(cachedUser);
          // Orqa fonda profilni xavfsiz yangilab qo'yamiz (ekranni qotirmaydi)
          _fetchProfile(session.user.id).then(profile => {
            if (profile) {
              const userObj = _buildUserObject(session.user, profile);
              _saveSession(userObj);
              if (typeof onLogin === 'function') onLogin(userObj);
            }
          }).catch(() => {});
          return;
        }

        // 2. Keshda bo'lmasa — profilni olib kelib sessiyani saqlaymiz
        try {
          const profile = await _fetchProfile(session.user.id);
          const userObj = _buildUserObject(session.user, profile || {});
          _saveSession(userObj);
          if (typeof onLogin === 'function') onLogin(userObj);
        } catch {
          // Tarmoq uzilsa ham sessiyadagi asosiy user ma'lumoti bilan davom etamiz
          const fallbackObj = _buildUserObject(session.user, {});
          _saveSession(fallbackObj);
          if (typeof onLogin === 'function') onLogin(fallbackObj);
        }

      } else if (event === 'SIGNED_OUT') {
        _saveSession(null);

        if (typeof onLogout === 'function') onLogout();

      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        // Token yangilanganda faqat sessiyani refresh qilamiz
        // (ortiqcha profil so'rovi qilmaymiz)
        const currentUser = getCurrentUser();
        if (currentUser) {
          // Joriy sessiyani saqlab qolamiz — o'zgarmagan
        }
      }
    }
  );

  // Cleanup funksiyasini qaytaramiz
  return () => subscription.unsubscribe();
}
