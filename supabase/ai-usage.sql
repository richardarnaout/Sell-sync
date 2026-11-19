-- SellSync T-031.2 : plafond d'appels IA par utilisateur et par jour + mémoire du bilan du mois.
-- Additif et idempotent (rejouable sans effet). Ne touche à aucune table existante.
-- Retour arrière : drop function public.ai_take(int); drop table public.ai_cache; drop table public.ai_usage;

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null default current_date,
  count   int  not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
drop policy if exists ai_usage_select_own on public.ai_usage;
create policy ai_usage_select_own on public.ai_usage for select to authenticated using (auth.uid() = user_id);
-- Aucune policy insert/update/delete : seul ai_take() (security definer) écrit, donc le plafond ne se contourne pas.

create table if not exists public.ai_cache (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  value      text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.ai_cache enable row level security;
drop policy if exists ai_cache_select_own on public.ai_cache;
drop policy if exists ai_cache_insert_own on public.ai_cache;
drop policy if exists ai_cache_update_own on public.ai_cache;
create policy ai_cache_select_own on public.ai_cache for select to authenticated using (auth.uid() = user_id);
create policy ai_cache_insert_own on public.ai_cache for insert to authenticated with check (auth.uid() = user_id);
create policy ai_cache_update_own on public.ai_cache for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Prend 1 appel sur le plafond du jour. Retourne le compteur après prise, ou -1 si le plafond est atteint.
create or replace function public.ai_take(p_limit int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare v int;
begin
  if auth.uid() is null then return -1; end if;
  insert into public.ai_usage as u (user_id, day, count) values (auth.uid(), current_date, 1)
  on conflict (user_id, day) do update set count = u.count + 1 where u.count < p_limit
  returning u.count into v;
  return coalesce(v, -1);
end $$;
revoke all on function public.ai_take(int) from public;
grant execute on function public.ai_take(int) to authenticated;
