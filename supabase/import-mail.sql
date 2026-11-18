-- ════════════════════════════════════════════════════════════════════════
--  Import automatique des mails Vinted (T-018.8) — anti-doublon
--  À coller dans Supabase → SQL Editor → Run, APRÈS auto-import.sql.
--  Sûr à relancer : tout est en "if not exists".
-- ════════════════════════════════════════════════════════════════════════

alter table public.pending_sales add column if not exists mail_fingerprint text; -- sha256(compte|id Gmail)
alter table public.pending_sales add column if not exists source_account  text; -- Gmail qui a reçu le mail

-- Une vente Vinted = un n° de transaction : jamais deux fois pour le même utilisateur
-- (partagé avec l'import de l'historique T-018.7).
create unique index if not exists pending_sales_user_tx_uniq
  on public.pending_sales (user_id, transaction_number)
  where transaction_number is not null and transaction_number <> '';

-- Mail sans n° de transaction : l'empreinte du mail empêche le renvoi du même message.
create unique index if not exists pending_sales_user_mail_uniq
  on public.pending_sales (user_id, mail_fingerprint)
  where mail_fingerprint is not null;
