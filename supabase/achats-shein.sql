-- ════════════════════════════════════════════════════════════════════════
--  T-021 — Achats Shein automatiques + vraie date de vente Vinted
--  À coller dans Supabase → SQL Editor → Run, APRÈS auto-import.sql et import-mail.sql.
--  Additif uniquement (aucune suppression, aucune donnée modifiée). Sûr à relancer.
-- ════════════════════════════════════════════════════════════════════════

-- ── Stock : photo, lien Shein (saisie manuelle possible), une ligne par unité ──
alter table public.purchases add column if not exists photo_url      text;               -- img.ltwebstatic.com (mail Shein)
alter table public.purchases add column if not exists shein_url      text;               -- facultatif, saisi à la main
alter table public.purchases add column if not exists unit_index     integer not null default 1; -- 1..quantité commandée
alter table public.purchases add column if not exists source_account text;               -- Gmail qui a reçu la commande

-- Anti-doublon : un même mail Shein renvoyé ne recrée jamais les articles.
create unique index if not exists purchases_user_order_sku_unit_uniq
  on public.purchases (user_id, order_number, sku, unit_index)
  where order_number is not null and order_number <> '' and sku is not null and sku <> '';

-- ── Ventes en attente : clé de rapprochement + indicateur de date approximative ──
alter table public.pending_sales add column if not exists article_key text;                         -- article normalisé
alter table public.pending_sales add column if not exists date_approx boolean not null default false; -- true = date du « finalisée »

-- ── Avis Vinted « Ton article s'est vendu » : leur date = vraie date de vente ──
create table if not exists public.vinted_sold_notices (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  date             date not null,
  article          text not null,
  article_key      text not null,
  size             text,
  mail_fingerprint text not null,
  source_account   text,
  used             boolean not null default false, -- déjà rapproché d'une vente
  created_at       timestamptz not null default now()
);
alter table public.vinted_sold_notices enable row level security;
drop policy if exists vinted_sold_notices_own on public.vinted_sold_notices;
create policy vinted_sold_notices_own on public.vinted_sold_notices
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create unique index if not exists vinted_sold_notices_mail_uniq
  on public.vinted_sold_notices (user_id, mail_fingerprint);
create index if not exists vinted_sold_notices_key_idx
  on public.vinted_sold_notices (user_id, article_key, used);
