import { NextRequest, NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateObject, generateText, type LanguageModel } from 'ai';
import type { z } from 'zod';

// Fournisseur : Google Gemini (palier gratuit). UN SEUL modèle pour tout (T-031.2) :
// L'ancien modèle « flash » (sans lite) est redirigé d'office par Google le 01/12/2026 ; flash-lite ne l'est pas.
export const MODEL = 'gemini-2.5-flash-lite';
export const DAILY_LIMIT = 30; // appels IA par utilisateur et par jour (table ai_usage)

function getModel(): LanguageModel {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY manquante');
  return createGoogleGenerativeAI({ apiKey })(MODEL);
}

/** Dépendances externes, remplaçables par scripts/verif-ia.ts (aucun réseau pendant le test). */
export const aiDeps = {
  /** Client Supabase portant le jeton de l'utilisateur : la RLS s'applique. */
  makeClient(token: string): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Variables Supabase manquantes');
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  },
  async text(system: string, prompt: string): Promise<string> {
    const { text } = await generateText({ model: getModel(), system, prompt, maxOutputTokens: 400 });
    return text;
  },
  async object<T extends z.ZodTypeAny>(schema: T, system: string, content: any[]): Promise<z.infer<T>> {
    const { object } = await generateObject({
      model: getModel(), schema, system, messages: [{ role: 'user', content }],
    });
    return object as z.infer<T>;
  },
};

export interface Authed { db: SupabaseClient; userId: string }

/** 401 sans jeton valide ; sinon client Supabase de l'utilisateur. Avant tout appel IA. */
export async function authenticate(req: NextRequest): Promise<Authed | NextResponse> {
  const deny = () => NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') || '');
  if (!m) return deny();
  try {
    const db = aiDeps.makeClient(m[1]);
    const { data, error } = await db.auth.getUser(m[1]);
    if (error || !data?.user) return deny();
    return { db, userId: data.user.id };
  } catch {
    return deny();
  }
}

/**
 * Prend 1 appel sur le plafond du jour (fonction SQL atomique ai_take, supabase/ai-usage.sql).
 * Retourne null si OK, sinon la réponse 429 (plafond) ou 500 (table absente : on ferme, on n'ouvre pas).
 */
export async function takeQuota(db: SupabaseClient): Promise<NextResponse | null> {
  const { data, error } = await db.rpc('ai_take', { p_limit: DAILY_LIMIT });
  if (error || typeof data !== 'number') {
    console.error('[ai] quota indisponible:', error?.message);
    return NextResponse.json({ error: 'Service IA indisponible.' }, { status: 500 });
  }
  if (data < 0) return NextResponse.json({ error: 'quota' }, { status: 429 });
  return null;
}

/** Message générique côté client ; le détail reste dans les logs serveur. */
export function failure(e: unknown): NextResponse {
  console.error('[ai]', e instanceof Error ? e.message : e);
  return NextResponse.json({ error: "L'IA n'a pas pu répondre, réessaie dans un instant." }, { status: 500 });
}

export async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' && !Array.isArray(b) ? b : null;
  } catch { return null; }
}

/** Lit toutes les lignes (Supabase plafonne à 1000 par requête). */
export async function fetchAll(q: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; from < 10000; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}
