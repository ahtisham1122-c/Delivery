import { createClient } from '@supabase/supabase-js';

// Production Credentials from environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

// Initialize the Supabase Client
// Priority: 1. Environment Variables, 2. LocalStorage (Legacy/Override)
const finalUrl = SUPABASE_URL || localStorage.getItem('sb_url');
const finalKey = SUPABASE_KEY || localStorage.getItem('sb_key');
const APP_SESSION_KEY = 'dairypro_app_session_token';

if (!finalUrl || !finalKey) {
  // Throw a clear visible error instead of falling back silently
  throw new Error('CRITICAL: Supabase credentials are missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_KEY in your environment variables.');
}

export const setAppSessionToken = (token: string) => {
  localStorage.setItem(APP_SESSION_KEY, token);
};

export const clearAppSessionToken = () => {
  localStorage.removeItem(APP_SESSION_KEY);
};

const sessionFetch: typeof fetch = (input, init = {}) => {
  const headers = new Headers(init.headers || {});
  const token = localStorage.getItem(APP_SESSION_KEY);
  if (token) headers.set('x-app-session', token);
  return fetch(input, { ...init, headers });
};

export const supabase = createClient(finalUrl, finalKey, {
  global: {
    fetch: sessionFetch
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});

/**
 * Validates if the cloud connection is correctly initialized
 */
export const isCloudConnected = () => {
  return finalUrl && finalKey && finalUrl.includes('supabase.co');
};

/**
 * Tests the connection to Supabase
 */
export const testConnection = async (): Promise<boolean> => {
  try {
    const { error } = await supabase.rpc('app_ping');
    if (error) {
      console.error('Supabase connection test failed:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('Supabase connection test failed:', error);
    return false;
  }
};
