import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://rkmzrgektehctcozagnk.supabase.co';
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrbXpyZ2VrdGVoY3Rjb3phZ25rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0MzQ5MzEsImV4cCI6MjEwNTAxMDkzMX0.fL3cLacrVLuGuxXsX5mOQ_aZHhEZFMlGnbVo-5eF3qA';

// Base public client (for public operations & Admin Supabase Auth)
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'cs_admin_auth',
  },
});

let cachedCoordinatorClient = null;
let lastCoordinatorToken = null;

// Coordinator dynamic client constructor with x-coordinator-token header support
// Exactly matching CS-backend-new2/CoOrd/js/supabase.js and Supabase current_actor_id() SQL
export function getCoordinatorClient(token) {
  const coordinatorToken =
    token ||
    (() => {
      try {
        const stored = JSON.parse(localStorage.getItem('coordinatorSession') || 'null');
        return stored?.token || '';
      } catch {
        return '';
      }
    })();

  if (cachedCoordinatorClient && lastCoordinatorToken === coordinatorToken) {
    return cachedCoordinatorClient;
  }

  cachedCoordinatorClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'cs_coord_auth',
    },
    global: {
      headers: coordinatorToken ? { 'x-coordinator-token': coordinatorToken } : {},
    },
  });
  lastCoordinatorToken = coordinatorToken;

  return cachedCoordinatorClient;
}

