-- ════════════════════════════════════════════════════════════════════════
--  Mails non reconnus par l'import automatique (T-022.6)
--  À coller dans Supabase → SQL Editor → Run, APRÈS import-mail.sql.
--  Additif et sûr à relancer : rien n'est supprimé, aucune donnée touchée.
--  Le webhook (clé service) écrit ; l'app (utilisateur connecté) lit et marque « vu ».
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.mail_rejects (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  mail_fingerprint text not null,          -- sha256(compte|id Gmail), comme pending_sales
  source_account   text,                   -- Gmail qui a reçu le mail
  subject          text,
  received_date    date,
  reason           text not null,
  missing          text[],                 -- champs que le parseur n'a pas trouvés
  attempts         integer not null default 1, -- l'Apps Script réessaie tant que le mail est en 422
  status           text not null default 'a_verifier' check (status in ('a_verifier', 'vu')),
  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now()
);

-- Un mail = une ligne, même si l'Apps Script le renvoie à chaque passage.
create unique index if not exists mail_rejects_user_mail_uniq
  on public.mail_rejects (user_id, mail_fingerprint);
create index if not exists mail_rejects_user_status_idx
  on public.mail_rejects (user_id, status);

-- RLS : chacun ne voit et ne modifie que ses lignes. Pas d'insert côté app : seul le webhook écrit.
alter table public.mail_rejects enable row level security;
drop policy if exists mail_rejects_select_own on public.mail_rejects;
drop policy if exists mail_rejects_update_own on public.mail_rejects;
drop policy if exists mail_rejects_delete_own on public.mail_rejects;
create policy mail_rejects_select_own on public.mail_rejects
  for select to authenticated using (auth.uid() = user_id);
create policy mail_rejects_update_own on public.mail_rejects
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy mail_rejects_delete_own on public.mail_rejects
  for delete to authenticated using (auth.uid() = user_id);

-- Renvoi d'un mail déjà noté : +1 tentative, date mise à jour ; un mail marqué « vu » le reste.
-- Appelé par le webhook (clé service) ; fermé aux utilisateurs de l'app.
create or replace function public.noter_mail_rejete(
  p_user_id uuid, p_fingerprint text, p_account text, p_subject text,
  p_received date, p_reason text, p_missing text[]
) returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.mail_rejects (user_id, mail_fingerprint, source_account, subject, received_date, reason, missing)
  values (p_user_id, p_fingerprint, p_account, p_subject, p_received, p_reason, p_missing)
  on conflict (user_id, mail_fingerprint) do update
    set attempts = public.mail_rejects.attempts + 1,
        last_seen_at = now(),
        reason = excluded.reason,
        missing = excluded.missing;
$$;
revoke all on function public.noter_mail_rejete(uuid, text, text, text, date, text, text[]) from public, anon, authenticated;
grant execute on function public.noter_mail_rejete(uuid, text, text, text, date, text, text[]) to service_role;
