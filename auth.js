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
  if (user && user.id) {
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

  // Adminlik huquqi: serverdagi role, username 'admin', yoki email 'admin@...'
  const isAdmin = profileData.role === 'admin' ||
                  profileData.is_admin === true ||
                  profileData.isAdmin === true ||
                  authUser.user_metadata?.role === 'admin' ||
                  cleanUsername === 'admin' ||
                  cleanEmail.startsWith('admin@');

  // Avatar va Personaj ustuvorligi:
  const avatarImage = charData?.avatarImage !== undefined 
    ? charData.avatarImage 
    : (existingUser?.avatarImage !== undefined ? existingUser.avatarImage : (storedUser?.avatarImage || authUser.user_metadata?.avatarImage || authUser.user_metadata?.avatar_image || profileData.avatar_image || null));

  const avatarCharId = charData?.avatarCharId !== undefined 
    ? charData.avatarCharId 
    : (existingUser?.avatarCharId !== undefined ? existingUser.avatarCharId : (storedUser?.avatarCharId || authUser.user_metadata?.avatarCharId || authUser.user_metadata?.avatar_char_id || profileData.avatar_char_id || null));

  const avatar = charData?.avatar 
    || existingUser?.avatar 
    || storedUser?.avatar 
    || (profileData.avatar_url && (profileData.avatar_url.startsWith('http') || profileData.avatar_url.startsWith('data:image/')) ? profileData.avatar_url : null)
    || authUser.user_metadata?.avatar 
    || authUser.user_metadata?.avatar_url 
    || '🎭';

  const score = Math.max(
    existingUser?.score || 0,
    storedUser?.score || 0,
    profileData.score || 0
  );

  const streak = Math.max(
    existingUser?.streak || 0,
    storedUser?.streak || 0,
    profileData.streak || 0
  );

  const lastQuizDate = existingUser?.lastQuizDate 
                    || storedUser?.lastQuizDate 
                    || profileData.last_quiz_date 
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

    if (cleanUsername === 'admin') {
      return { success: false, error: 'Bu foydalanuvchi nomi xizmat uchun band.' };
    }

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
    const user = JSON.parse(raw);
    if (!user || !user.id) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }

    const cleanUsername = String(user.username || '').trim().toLowerCase();
    const cleanEmail    = String(user.email || '').trim().toLowerCase();
    if (user.role === 'admin' || user.isAdmin === true || user.is_admin === true || cleanUsername === 'admin' || cleanEmail.startsWith('admin@')) {
      user.role = 'admin';
      user.isAdmin = true;
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
      dbUpdates.stats = {
        avgScore: updates.score ?? currentUser.score ?? 0,
        bestScore: Math.max(updates.score ?? 0, currentUser.score ?? 0),
        currentStreak: updates.streak ?? currentUser.streak ?? 0,
        maxStreak: Math.max(updates.streak ?? 0, currentUser.streak ?? 0),
        lastQuizDate: updates.lastQuizDate || currentUser.lastQuizDate || '',
        testsCompleted: (currentUser.testsCompleted || 0) + (updates.score !== undefined ? 1 : 0),
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
