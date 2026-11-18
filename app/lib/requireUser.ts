import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from './supabaseClient';

/**
 * Exige une session Supabase valide : en-tête « Authorization: Bearer <access_token> ».
 * Le jeton est vérifié auprès de Supabase (auth.getUser). Retourne null si OK,
 * sinon une réponse 401 à renvoyer telle quelle (avant tout appel à l'IA).
 */
export async function requireUser(req: NextRequest): Promise<NextResponse | null> {
  const header = req.headers.get('authorization') || '';
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  const deny = () => NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  if (!match) return deny();
  try {
    const { data, error } = await createServerSupabase().auth.getUser(match[1]);
    if (error || !data?.user) return deny();
    return null;
  } catch {
    return deny();
  }
}
