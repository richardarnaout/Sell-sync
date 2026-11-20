import { createClient } from '@supabase/supabase-js';

// Seul endroit qui crée le client Supabase. URL et clé publique (anon / publishable)
// viennent des variables d'environnement : .env.local en local, réglages Vercel en prod.
// Accès littéral à process.env.NEXT_PUBLIC_* obligatoire pour que Next.js les injecte côté navigateur.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function realClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY doivent être définies (voir .env.example).',
    );
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}

// Client navigateur partagé. La session d'auth est gardée dans le localStorage,
// donc les policies RLS s'appliquent au bon user.
// T-034.1 : mode démo (NEXT_PUBLIC_DEMO=1, hors production seulement, règle dans lib/demo/flag.ts).
// La condition est écrite en toutes lettres ici : dans un build, elle devient `false` à la compilation
// et le module démo n'est même pas inclus (vérifié par verif:demo sur le dossier .next).
export const supabase: ReturnType<typeof realClient> =
  process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEMO === '1'
    ? // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('./demo/client').createDemoClient()
    : realClient();

// Client serveur sans session (routes API) : même projet, même clé publique, RLS appliquée.
export function createServerSupabase() {
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
