import { createClient } from '@supabase/supabase-js';

// Client Supabase « service » : contourne la RLS. SERVEUR UNIQUEMENT (routes API),
// jamais importé par un composant client. La clé n'a pas de préfixe NEXT_PUBLIC_,
// donc Next.js ne l'envoie jamais au navigateur.
export function createAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définies (voir .env.example).');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}
