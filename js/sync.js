// ============================================================
// sync.js — Qurilmalar va Vkladkalararo Jonli Sinxronizatsiya
// ============================================================
// Vazifalar:
//   1. Multi-tab sinxronizatsiya (BroadcastChannel + storage event):
//      Bir vkladkada login, logout, avatar o'zgarishi, test yakunlanishi
//      yoki admin amal bajarilganda, barcha ochiq vkladkalar
//      sahifani qayta yuklamasdan (0ms) zudlik bilan yangilanadi.
//   2. Cross-device (qurilmalararo) jonli sinxronizatsiya:
//      Supabase Realtime (postgres_changes) orqali boshqa qurilmadan
//      (telefon, noutbuk) ball oshganda yoki o'zgarish bo'lganda,
//      barcha faol qurilmalarda reyting va profil yangilanadi.
//   3. Oynaga qaytishda (focus/visibility) rekonsilyatsiya:
//      Foydalanuvchi boshqa qurilmada test yechib qaytsa, avtomatik
//      eng so'nggi ball va streakni tortib oladi.
// ============================================================

import { supabase, isSupabaseOnline } from './supabase-client.js';
import { getCurrentUser } from './auth.js';

const CHANNEL_NAME = 'kitobchi_sync_channel';
let _broadcastChannel = null;
let _realtimeChannel = null;

// BroadcastChannel ni xavfsiz initsializatsiya qilish
try {
  if (typeof BroadcastChannel !== 'undefined') {
    _broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
  }
} catch {
  _broadcastChannel = null;
}

/**
 * Xabarni boshqa barcha vkladkalarga tarqatadi.
 * @param {string} type — Xabar turi ('AUTH_CHANGE', 'PROFILE_UPDATE', 'LEADERBOARD_UPDATE', 'USER_DELETED', 'THEME_CHANGE')
 * @param {object} [payload={}] — Qo'shimcha ma'lumotlar
 */
export function broadcastSyncEvent(type, payload = {}) {
  const message = { type, payload, timestamp: Date.now() };

  // 1. BroadcastChannel orqali (eng tezkor)
  if (_broadcastChannel) {
    try {
      _broadcastChannel.postMessage(message);
    } catch {}
  }

  // 2. LocalStorage orqali fallback (barcha brauzerlar va iframe'lar uchun)
  try {
    localStorage.setItem('kitobchi_cross_tab_ping', JSON.stringify(message));
  } catch {}
}

/**
 * Kelgan xabarni qayta ishlaydi va DOM hodisalarini chaqiradi.
 */
function _handleSyncMessage(msg) {
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'AUTH_CHANGE':
    case 'PROFILE_UPDATE': {
      // Boshqa vkladkada kirish/chiqish yoki profil o'zgardi
      window.dispatchEvent(new CustomEvent('kitobchi_profile_updated', { detail: msg.payload }));
      window.dispatchEvent(new CustomEvent('kitobchi_auth_sync', { detail: msg.payload }));
      break;
    }

    case 'LEADERBOARD_UPDATE': {
      // Reyting keshini tozalash va yangilanish hodisasi
      try {
        localStorage.removeItem('kitobchi_cached_leaderboard');
      } catch {}
      window.dispatchEvent(new CustomEvent('kitobchi_leaderboard_updated', { detail: msg.payload }));
      break;
    }

    case 'USER_DELETED': {
      // Foydalanuvchi o'chirildi
      const cur = getCurrentUser();
      if (cur && cur.id === msg.payload?.userId) {
        // Agar o'chirilgan foydalanuvchi o'zimiz bo'lsak — tizimdan xavfsiz chiqaramiz
        try {
          localStorage.removeItem('kitobchi_user');
          window.location.hash = '#login';
          window.location.reload();
        } catch {}
      } else {
        // Boshqa foydalanuvchi bo'lsa — reyting va jadvallarni yangilaymiz
        try {
          localStorage.removeItem('kitobchi_cached_leaderboard');
        } catch {}
        window.dispatchEvent(new CustomEvent('kitobchi_leaderboard_updated'));
      }
      break;
    }

    case 'THEME_CHANGE': {
      if (msg.payload?.theme) {
        document.documentElement.setAttribute('data-theme', msg.payload.theme);
      }
      break;
    }

    case 'BOOKS_UPDATED': {
      window.dispatchEvent(new CustomEvent('kitobchi_books_updated'));
      break;
    }

    default:
      break;
  }
}

/**
 * Multi-tab va Realtime sinxronizatsiya tizimini ishga tushiradi.
 */
export function initCrossDeviceSync() {
  // 1. BroadcastChannel tinglovchisi
  if (_broadcastChannel) {
    _broadcastChannel.onmessage = (event) => {
      _handleSyncMessage(event.data);
    };
  }

  // 2. Storage event tinglovchisi (boshqa vkladka/oyna localStorage ni o'zgartirganda)
  window.addEventListener('storage', (e) => {
    if (e.key === 'kitobchi_cross_tab_ping' && e.newValue) {
      try {
        const msg = JSON.parse(e.newValue);
        _handleSyncMessage(msg);
      } catch {}
    } else if (e.key === 'kitobchi_user') {
      window.dispatchEvent(new CustomEvent('kitobchi_profile_updated'));
    } else if (e.key === 'kitobchi_theme' && e.newValue) {
      document.documentElement.setAttribute('data-theme', e.newValue);
    }
  });

  // 3. Supabase Realtime (boshqa qurilmalar o'rtasida jonli yangilanish)
  _initSupabaseRealtime();

  // 4. Tabga qaytishda (Focus & Visibility) jonli rekonsilyatsiya
  _initFocusReconciliation();
}

/**
 * Supabase Realtime orqali jonli ma'lumotlar o'zgarishini tinglash.
 */
function _initSupabaseRealtime() {
  if (!supabase || !supabase.channel) return;

  try {
    if (_realtimeChannel) {
      try { supabase.removeChannel(_realtimeChannel); } catch {}
    }

    _realtimeChannel = supabase.channel('kitobchi_global_sync')
      // profiles jadvalidagi barcha o'zgarishlar (yangi ball, streak, profil)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, (payload) => {
        // Reyting keshini tozalash
        try {
          localStorage.removeItem('kitobchi_cached_leaderboard');
        } catch {}

        const cur = getCurrentUser();
        // Agar o'zimizning profilimiz boshqa qurilmada yangilangan bo'lsa
        if (cur && payload.new && payload.new.id === cur.id) {
          const stats = payload.new.stats || {};
          const updatedUser = {
            ...cur,
            score: Number(stats.totalScore ?? stats.score ?? payload.new.score ?? cur.score),
            streak: Number(stats.currentStreak ?? payload.new.streak ?? cur.streak),
            avatar: payload.new.avatar || cur.avatar,
            avatarImage: payload.new.avatar_image || cur.avatarImage,
            fullName: payload.new.full_name || cur.fullName,
          };
          try {
            localStorage.setItem('kitobchi_user', JSON.stringify(updatedUser));
          } catch {}
          window.dispatchEvent(new CustomEvent('kitobchi_profile_updated', { detail: updatedUser }));
        }

        // Barcha qurilmalarda reytingni jonli yangilash
        window.dispatchEvent(new CustomEvent('kitobchi_leaderboard_updated'));
      })
      // Kitoblar va savollar o'zgarganda
      .on('postgres_changes', { event: '*', schema: 'public', table: 'books' }, () => {
        window.dispatchEvent(new CustomEvent('kitobchi_books_updated'));
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Realtime faol
        }
      });
  } catch (err) {
    console.warn('[sync] Supabase Realtime ulanish ogohlantirishi:', err);
  }
}

/**
 * Vkladka qayta ko'ringanda (fokus bo'lganda) so'nggi ma'lumotlarni tekshirish.
 */
let _lastFocusCheck = 0;
function _initFocusReconciliation() {
  const checkFreshness = async () => {
    const now = Date.now();
    // Har 20 soniyadan tez takrorlanmasligi kerak
    if (now - _lastFocusCheck < 20_000) return;
    _lastFocusCheck = now;

    if (!isSupabaseOnline()) return;

    const cur = getCurrentUser();
    if (cur && cur.id) {
      // Offline yoki lokal foydalanuvchilarni Supabase dan so'ramaymiz
      if (cur.offlineSession || String(cur.id).startsWith('local_') || String(cur.id).startsWith('admin-')) {
        return;
      }

      try {
        const { data: freshProfile, error } = await supabase
          .from('profiles')
          .select('id, username, full_name, avatar, avatar_image, stats')
          .eq('id', cur.id)
          .maybeSingle();

        if (freshProfile) {
          const stats = freshProfile.stats || {};
          const freshScore = Number(stats.totalScore ?? stats.score ?? cur.score);
          const freshStreak = Number(stats.currentStreak ?? cur.streak);

          if (freshScore !== cur.score || freshStreak !== cur.streak) {
            const updated = {
              ...cur,
              score: Math.max(freshScore, cur.score),
              streak: freshStreak,
            };
            localStorage.setItem('kitobchi_user', JSON.stringify(updated));
            window.dispatchEvent(new CustomEvent('kitobchi_profile_updated', { detail: updated }));
            broadcastSyncEvent('PROFILE_UPDATE', updated);
          }
        } else if (freshProfile === null && !error) {
          // Foydalanuvchi hisobi serverdan o'chirilgan bo'lsa, eskirgan sessiyani toza tozalash
          console.info('[sync] Foydalanuvchi hisobi serverda mavjud emas, sessiya yangilandi.');
          localStorage.removeItem('kitobchi_user');
          window.dispatchEvent(new CustomEvent('kitobchi_auth_sync', { detail: { user: null } }));
        }
      } catch {}
    }
  };

  window.addEventListener('focus', checkFreshness);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkFreshness();
    }
  });
}
