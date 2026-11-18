-- ════════════════════════════════════════════════════════════════════════
--  Suggestions écartées (T-027) — la croix ✕ sur une carte « Relier »
--  À coller dans Supabase → SQL Editor → Run. Additif, sûr à relancer.
--  Aucune nouvelle policy : la RLS existante de pending_sales (user_id = auth.uid())
--  couvre déjà la lecture et la mise à jour de cette colonne.
-- ════════════════════════════════════════════════════════════════════════

alter table public.pending_sales
  add column if not exists rejected_purchase_ids uuid[] not null default '{}';
