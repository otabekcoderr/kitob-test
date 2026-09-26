// ========================================================================
// api/_supabase.js — Supabase Client Initialization & Auth Verification
// ========================================================================

import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gvgyaxlbpkvpvwpqxjwc.supabase.co';
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_2raJHpiyV55SbGDghEUL5A_2UgIecMn';
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let _supabaseAnon = null;

/**
 * Returns cached anonymous Supabase client for JWT verification and public reads.
 */
export function getSupabaseAnon() {
  if (!_supabaseAnon && SUPABASE_URL && SUPABASE_ANON_KEY) {
    _supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
  }
  return _supabaseAnon;
}

/**
 * Returns privileged administrative Supabase client for database mutations.
 * Falls back to user JWT client if SERVICE_ROLE_KEY is absent during local dev.
 */
export function getSupabaseAdmin(token = null) {
  if (SUPABASE_SERVICE_ROLE_KEY) {
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  // Graceful fallback with authenticated user JWT
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {}
  });
}

/**
 * Safely extracts Bearer token from request headers (case-insensitive).
 */
export function extractBearerToken(req) {
  const authHeader = req.headers?.['authorization'] ||
                     req.headers?.['Authorization'] ||
                     req.headers?.authorization;

  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  const match = authHeader.match(/^Bearer\s+([A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+)$/i) ||
                authHeader.match(/^Bearer\s+(.+)$/i);

  if (!match || !match[1]) {
    return null;
  }

  const token = match[1].trim();
  return (token && token !== 'null' && token !== 'undefined') ? token : null;
}

/**
 * Authoritatively verifies user token via Supabase Auth.
 */
export async function verifyAuthUser(token) {
  if (!token) return { user: null, error: null };

  const client = getSupabaseAnon();
  if (!client) {
    return { user: null, error: new Error('Supabase client not initialized') };
  }

  try {
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) {
      return { user: null, error: error || new Error('Invalid user session') };
    }
    return { user, error: null };
  } catch (err) {
    return { user: null, error: err };
  }
}
