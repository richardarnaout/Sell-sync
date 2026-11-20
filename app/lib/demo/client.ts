// T-034.1 — Faux client Supabase du mode démo : même API que celle utilisée par l'app
// (auth, from().select/insert/update/delete/upsert + filtres, rpc), données en mémoire.
// Aucune requête réseau. Les écritures vivent le temps de la session (rechargement = jeu neuf).
// Chargé uniquement via la branche démo de supabaseClient.ts, éliminée du build de production.
import { DEMO_USER, DEMO_MARKER, demoTables } from './data';

if (process.env.NODE_ENV === 'production') {
  // Double garde-fou : ce module ne doit jamais être chargé en production.
  throw new Error('Mode démo interdit en production.');
}

type Row = Record<string, any>;
type Result = { data: any; error: { message: string; code?: string } | null; count?: number | null };

const LATENCY_MS = 120; // un peu de latence : rend visibles les états « en cours » et les doubles clics

// Panne simulée pour tester les erreurs réseau : window.__SELLSYNC_DEMO_FAIL__ = 'sales' (ou 'rpc:<nom>', ou '*').
// Consommée à la première opération concernée.
function takeFailure(key: string): boolean {
  const g = globalThis as any;
  const f = g.__SELLSYNC_DEMO_FAIL__;
  if (!f) return false;
  if (f === '*' || f === key) { g.__SELLSYNC_DEMO_FAIL__ = null; return true; }
  return false;
}
const networkError = { message: 'Failed to fetch (panne simulée du mode démo)', code: 'DEMO_NETWORK' };

const db: Record<string, Row[]> = demoTables();
const wait = () => new Promise((r) => setTimeout(r, LATENCY_MS));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const uuid = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `demo-${Math.random().toString(36).slice(2)}`);

type Filter = (r: Row) => boolean;

class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: any = null;
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private max: number | null = null;
  private returning = false;
  private one: 'single' | 'maybe' | null = null;

  constructor(private table: string) {}

  select(_cols?: string, _opts?: unknown) { if (this.op !== 'select') this.returning = true; return this; }
  insert(v: Row | Row[]) { this.op = 'insert'; this.payload = v; return this; }
  upsert(v: Row | Row[]) { this.op = 'upsert'; this.payload = v; return this; }
  update(v: Row) { this.op = 'update'; this.payload = v; return this; }
  delete() { this.op = 'delete'; return this; }

  eq(c: string, v: any) { this.filters.push((r) => r[c] === v); return this; }
  neq(c: string, v: any) { this.filters.push((r) => r[c] !== v); return this; }
  in(c: string, vs: any[]) { this.filters.push((r) => vs.includes(r[c])); return this; }
  is(c: string, v: any) { this.filters.push((r) => (v === null ? r[c] == null : r[c] === v)); return this; }
  gt(c: string, v: any) { this.filters.push((r) => r[c] > v); return this; }
  gte(c: string, v: any) { this.filters.push((r) => r[c] >= v); return this; }
  lt(c: string, v: any) { this.filters.push((r) => r[c] < v); return this; }
  lte(c: string, v: any) { this.filters.push((r) => r[c] <= v); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.orders.push({ col, asc: o?.ascending !== false }); return this; }
  limit(n: number) { this.max = n; return this; }
  single() { this.one = 'single'; return this; }
  maybeSingle() { this.one = 'maybe'; return this; }

  private rows(): Row[] { return (db[this.table] ??= []); }
  private match(r: Row) { return this.filters.every((f) => f(r)); }

  private run(): Result {
    if (takeFailure(this.table)) return { data: null, error: networkError };
    const rows = this.rows();
    let out: Row[] = [];
    if (this.op === 'select') {
      out = rows.filter((r) => this.match(r));
      for (const { col, asc } of [...this.orders].reverse()) {
        out = [...out].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1)));
      }
      if (this.max != null) out = out.slice(0, this.max);
      this.returning = true;
    } else if (this.op === 'insert' || this.op === 'upsert') {
      const list: Row[] = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((r: Row) => ({
        created_at: new Date().toISOString(), ...clone(r), id: r.id ?? uuid(),
      }));
      for (const r of list) {
        const i = rows.findIndex((x) => x.id === r.id);
        if (i >= 0 && this.op === 'insert') {
          // Comme Postgres : clé primaire en double = erreur 23505, rien n'est écrit.
          return { data: null, error: { message: `duplicate key value violates unique constraint "${this.table}_pkey"`, code: '23505' } };
        }
      }
      for (const r of list) {
        const i = rows.findIndex((x) => x.id === r.id);
        if (i >= 0) rows[i] = { ...rows[i], ...r }; else rows.push(r);
      }
      out = list;
    } else if (this.op === 'update') {
      for (const r of rows) if (this.match(r)) { Object.assign(r, clone(this.payload)); out.push(r); }
    } else if (this.op === 'delete') {
      out = rows.filter((r) => this.match(r));
      db[this.table] = rows.filter((r) => !this.match(r));
    }
    const data = clone(out);
    if (this.one) {
      if (data.length === 0 && this.one === 'single') return { data: null, error: { message: 'Aucune ligne', code: 'PGRST116' } };
      return { data: data[0] ?? null, error: null };
    }
    return { data: this.returning ? data : null, error: null };
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, ko?: ((e: any) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return wait().then(() => this.run()).then(ok, ko);
  }
}

// ── RPC : mêmes règles que les fonctions SQL (supabase/*.sql), en mémoire ──
function rpcRun(name: string, a: Row): Result {
  if (takeFailure(`rpc:${name}`) || takeFailure('rpc')) return { data: null, error: networkError };
  const sales = db.sales, purchases = db.purchases, pending = db.pending_sales;
  const err = (message: string, code = 'P0001'): Result => ({ data: null, error: { message, code } });
  if (name === 'valider_vente' || name === 'valider_vente_perso') {
    const p = pending.find((x) => x.id === a.p_pending_id);
    if (!p) return err(`${name} : vente en attente introuvable`, 'P0002');
    if (p.status === 'traite') return { data: { ok: true, deja_traite: true, sale_id: a.p_sale_id }, error: null };
    if (p.status !== 'en_attente') return err(`${name} : vente en attente déjà ${p.status}`);
    let pur: Row | undefined;
    if (name === 'valider_vente') {
      pur = purchases.find((x) => x.id === a.p_purchase_id);
      if (!pur) return err('valider_vente : article du stock introuvable', 'P0002');
      if (pur.status !== 'en_stock') return err(`valider_vente : article déjà sorti du stock (${pur.status})`);
    }
    sales.push({
      id: a.p_sale_id, user_id: DEMO_USER.id, date: p.date, article: a.p_article, category: 'Autre',
      size: pur ? (pur.size || p.size || '') : (p.size || ''), purchase_price: pur ? pur.purchase_price : 0,
      sale_price: p.sale_price, shipping_cost: 0, booster_cost: 0, product_url: a.p_product_url ?? null,
      is_personal: !pur, created_at: new Date().toISOString(),
    });
    if (pur) pur.status = 'vendu';
    p.status = 'traite';
    return { data: { ok: true, deja_traite: false, sale_id: a.p_sale_id }, error: null };
  }
  return err(`Fonction ${name} absente du mode démo`, 'PGRST202');
}

// ── Auth ──
type Listener = (event: string, session: any) => void;
let session: any = { access_token: 'demo', token_type: 'bearer', user: { ...DEMO_USER } };
const listeners = new Set<Listener>();
const emit = (event: string) => listeners.forEach((l) => l(event, session));

export function createDemoClient(): any {
  return {
    __demo: DEMO_MARKER,
    from: (table: string) => new Query(table),
    rpc: (name: string, args: Row = {}) => ({
      then: (ok?: any, ko?: any) => wait().then(() => rpcRun(name, args)).then(ok, ko),
    }),
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user: session?.user ?? null }, error: null }),
      onAuthStateChange: (cb: Listener) => {
        listeners.add(cb);
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
      },
      signInWithPassword: async () => {
        session = { access_token: 'demo', token_type: 'bearer', user: { ...DEMO_USER } };
        emit('SIGNED_IN'); return { data: { session, user: session.user }, error: null };
      },
      signUp: async () => ({ data: { session: null, user: { ...DEMO_USER } }, error: null }),
      updateUser: async () => ({ data: { user: session?.user ?? null }, error: null }),
      signOut: async () => { session = null; emit('SIGNED_OUT'); return { error: null }; },
    },
  };
}

/** Pour verif:demo : état courant d'une table (copie). */
export function demoSnapshot(table: string): Row[] { return clone(db[table] ?? []); }
