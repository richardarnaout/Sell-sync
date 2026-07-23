-- ════════════════════════════════════════════════════════════════════════
--  Auto-import SellSync — tables STOCK (achats Shein) + VENTES DÉTECTÉES
--  À coller dans Supabase → SQL Editor → Run (comme pour la table `sales`).
--  Sûr à relancer : tout est en "if not exists".
-- ════════════════════════════════════════════════════════════════════════

-- ── Stock : articles achetés (Shein), en attente de vente ──
create table if not exists public.purchases (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  date           date not null,
  article        text not null,
  color          text,
  size           text,
  purchase_price numeric not null default 0,
  sku            text,
  order_number   text,
  status         text not null default 'en_stock',   -- en_stock | vendu | ignore
  created_at     timestamptz not null default now()
);
alter table public.purchases enable row level security;
drop policy if exists purchases_own on public.purchases;
create policy purchases_own on public.purchases
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists purchases_user_idx on public.purchases (user_id, status);

-- ── Ventes détectées (Vinted "transaction finalisée"), en attente d'appariement ──
create table if not exists public.pending_sales (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  date               date not null,
  article            text not null,
  color              text,
  size               text,
  sale_price         numeric not null default 0,
  transaction_number text,
  status             text not null default 'en_attente', -- en_attente | traite | ignore
  created_at         timestamptz not null default now()
);
alter table public.pending_sales enable row level security;
drop policy if exists pending_sales_own on public.pending_sales;
create policy pending_sales_own on public.pending_sales
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists pending_sales_user_idx on public.pending_sales (user_id, status);
