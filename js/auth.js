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

import { supabase }      from './supabase-client.js';
import { uzbekifyError } from './utils.js';

// ============================================================
// ICHKI KONSTANTALAR
// ============================================================

/** localStorage kalit nomi — sessiyani saqlash uchun */
const SESSION_KEY = 'kitobchi_user';

// ============================================================
// ICHKI YORDAMCHI FUNKSIYALAR (export qilinmaydi)
// ============================================================

/**
 * Foydalanuvchi ma'lumotlarini localStorage ga yozadi.
 * @param {object|null} user
 */
function _saveSession(user) {
  if (user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

/**
 * Supabase auth.user va uning user_metadata dan
 * dasturda ishlatiladigan oddiy obyekt yasaydi.
 *
 * @param {import('@supabase/supabase-js').User} authUser
 * @param {object} [profileData] — profiles jadvalidan kelgan qo'shimcha ma'lumot
 * @returns {object}
 */
function _buildUserObject(authUser, profileData = {}) {
  const username = profileData.username
              || authUser.user_metadata?.username   || '';
  const isDefaultAdmin = username.toLowerCase() === 'admin' || authUser.email?.toLowerCase().startsWith('admin@');
  return {
    id:        authUser.id,
    email:     authUser.email              || '',
    fullName:  profileData.full_name
                || authUser.user_metadata?.full_name  || '',
    username:  username,
    avatar:    profileData.avatar_url
                || authUser.user_metadata?.avatar_url || '',
    role:      profileData.role            || (isDefaultAdmin ? 'admin' : 'user'),
    score:     profileData.score           || 0,
    streak:    profileData.streak          || 0,
    lastQuizDate: profileData.last_quiz_date || null,
    createdAt: authUser.created_at         || '',
  };
}

/**
 * profiles jadvalidan foydalanuvchi qatorini olib keladi.
 * Topilmasa null qaytaradi (xato otmaydi).
 *
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
async function _fetchProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) return null;
    return data;
  } catch {
    return null;
  }
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

    // Supabase Auth signUp
    // Email sifatida username@kitobchi.local ishlatamiz
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email:    `${cleanUsername}@kitobchi.local`,
      password: password,
      options: {
        data: {
          full_name: cleanName,
          username:  cleanUsername,
        }
      }
    });

    if (authError) {
      return { success: false, error: uzbekifyError(authError) };
    }

    if (!authData.user) {
      return { success: false, error: 'Ro\'yxatdan o\'tishda xatolik. Qayta urinib ko\'ring.' };
    }

    // profiles jadvaliga yozish
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id:         authData.user.id,
        full_name:  cleanName,
        username:   cleanUsername,
        role:       'user',
        score:      0,
        streak:     0,
        last_quiz_date: null,
        created_at: new Date().toISOString(),
      }, { onConflict: 'id' });

    if (profileError) {
      console.warn('[auth] profiles upsert xatosi:', profileError.message);
      // Kritik emas — auth muvaffaqiyatli bo'ldi
    }

    // Sessiyani saqlash
    const userObj = _buildUserObject(authData.user, {
      full_name: cleanName,
      username:  cleanUsername,
    });
    _saveSession(userObj);

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
 * @param {string} username — Foydalanuvchi nomi
 * @param {string} password — Parol
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
export async function login(username, password) {
  try {
    if (!username?.trim()) return { success: false, error: 'Foydalanuvchi nomi kiritilishi shart.' };
    if (!password)          return { success: false, error: 'Parol kiritilishi shart.' };

    const cleanUsername = username.trim().toLowerCase();

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email:    `${cleanUsername}@kitobchi.local`,
      password: password,
    });

    if (authError) {
      return { success: false, error: uzbekifyError(authError) };
    }

    if (!authData.user) {
      return { success: false, error: 'Foydalanuvchi topilmadi.' };
    }

    // Profilni olish
    const profile = await _fetchProfile(authData.user.id);

    // Sessiyani saqlash
    const userObj = _buildUserObject(authData.user, profile || {});
    _saveSession(userObj);

    return { success: true, user: userObj };

  } catch (err) {
    console.error('[auth] login xatosi:', err);
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

    // localStorage ni har doim tozalaymiz (hatto Supabase xato qilsa ham)
    _saveSession(null);

    if (error) {
      console.warn('[auth] signOut xatosi:', error.message);
      // Foydalanuvchi nuqtai nazaridan chiqish muvaffaqiyatli
    }

    return { success: true };

  } catch (err) {
    console.error('[auth] logout xatosi:', err);
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
    return JSON.parse(raw);
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

    // Faqat ruxsat etilgan maydonlarni qabul qilamiz
    const dbUpdates = {};
    if (updates.fullName     !== undefined) dbUpdates.full_name       = updates.fullName;
    if (updates.avatar       !== undefined) dbUpdates.avatar_url      = updates.avatar;
    if (updates.score        !== undefined) dbUpdates.score           = updates.score;
    if (updates.streak       !== undefined) dbUpdates.streak          = updates.streak;
    if (updates.lastQuizDate !== undefined) dbUpdates.last_quiz_date  = updates.lastQuizDate;

    if (Object.keys(dbUpdates).length === 0) {
      return { success: false, error: 'Yangilanadigan ma\'lumot yo\'q.' };
    }

    // profiles jadvalini yangilash
    const { error: dbError } = await supabase
      .from('profiles')
      .update(dbUpdates)
      .eq('id', currentUser.id);

    if (dbError) {
      return { success: false, error: uzbekifyError(dbError) };
    }

    // localStorage dagi sessiyani yangilash
    const updatedUser = {
      ...currentUser,
      fullName:     updates.fullName     ?? currentUser.fullName,
      avatar:       updates.avatar       ?? currentUser.avatar,
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
        // Profil ma'lumotlarini olib, sessiyani yangilaymiz
        const profile = await _fetchProfile(session.user.id);
        const userObj = _buildUserObject(session.user, profile || {});
        _saveSession(userObj);

        if (typeof onLogin === 'function') onLogin(userObj);

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
