-- SellSync : RLS "propriétaire seulement" (idempotent, additif, aucune donnée touchée).
-- La clé service (routes serveur) contourne la RLS : rien ne casse côté serveur.
do $$
declare t text;
begin
  foreach t in array array['sales','templates','purchases','pending_sales'] loop
    if to_regclass('public.'||t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists %I on public.%I', t||'_select_own', t);
      execute format('drop policy if exists %I on public.%I', t||'_insert_own', t);
      execute format('drop policy if exists %I on public.%I', t||'_update_own', t);
      execute format('drop policy if exists %I on public.%I', t||'_delete_own', t);
      execute format('create policy %I on public.%I for select to authenticated using (auth.uid() = user_id)', t||'_select_own', t);
      execute format('create policy %I on public.%I for insert to authenticated with check (auth.uid() = user_id)', t||'_insert_own', t);
      execute format('create policy %I on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t||'_update_own', t);
      execute format('create policy %I on public.%I for delete to authenticated using (auth.uid() = user_id)', t||'_delete_own', t);
      -- Les anciennes politiques larges (rôle public, *_own, "Users can delete...") sont retirées
      -- pour que seules les 4 politiques ci-dessus s'appliquent.
      execute format('drop policy if exists %I on public.%I', t||'_own', t);
    end if;
  end loop;
end $$;
drop policy if exists "Users can delete their own sales" on public.sales;
drop policy if exists "Users can delete their own templates" on public.templates;
-- Table vinted_sold_notices : voir achats-shein.sql (RLS déjà incluse, pas encore créée en base).
