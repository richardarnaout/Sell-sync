import { createClient } from '@supabase/supabase-js';

// Seul endroit qui crée le client Supabase. URL et clé publique (anon / publishable)
// viennent des variables d'environnement : .env.local en local, réglages Vercel en prod.
// Accès littéral à process.env.NEXT_PUBLIC_* obligatoire pour que Next.js les injecte côté navigateur.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY doivent être définies (voir .env.example).',
  );
}

// Client navigateur partagé. La session d'auth est gardée dans le localStorage,
// donc les policies RLS s'appliquent au bon user.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Client serveur sans session (routes API) : même projet, même clé publique, RLS appliquée.
export function createServerSupabase() {
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
