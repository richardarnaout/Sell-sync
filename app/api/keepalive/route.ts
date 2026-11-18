import { NextResponse } from 'next/server';
import { createServerSupabase } from '../../lib/supabaseClient';

// Anti-pause Supabase (offre gratuite : pause après 7 jours sans activité).
// Appelée chaque jour par Vercel Cron (voir vercel.json), qui envoie
// « Authorization: Bearer <CRON_SECRET> ». Lecture seule, une ligne au plus.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET non configuré' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'Non autorisé' }, { status: 401 });
  }

  // Requête légère : passe par Postgres (compte comme activité), RLS renvoie 0 ligne sans session.
  const { error } = await createServerSupabase().from('sales').select('id').limit(1);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, at: new Date().toISOString() });
}
