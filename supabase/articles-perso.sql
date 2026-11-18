-- ════════════════════════════════════════════════════════════════════════
--  T-028 — Articles perso (seconde main, sans prix d'achat)
--  À coller dans Supabase → SQL Editor → Run, APRÈS valider-vente.sql.
--  Additif uniquement : 1 colonne + 1 fonction, aucune donnée modifiée. Sûr à relancer.
--  Aucune nouvelle policy : la RLS existante de sales (user_id = auth.uid()) couvre la colonne.
--  Retour arrière : alter table public.sales drop column is_personal;
--                   drop function public.valider_vente_perso(uuid, text, text, text);
-- ════════════════════════════════════════════════════════════════════════

alter table public.sales
  add column if not exists is_personal boolean not null default false;

-- Valide une vente détectée comme « article perso » : crée la vente sans achat et clôt la
-- vente en attente, en une seule transaction. Même principe que valider_vente (idempotente,
-- SECURITY INVOKER : la RLS de l'utilisateur s'applique).
create or replace function public.valider_vente_perso(
  p_pending_id  uuid,
  p_sale_id     text,
  p_article     text,
  p_product_url text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_pend public.pending_sales%rowtype;
  v_n    integer;
begin
  if v_uid is null then
    raise exception 'valider_vente_perso : utilisateur non connecté' using errcode = '28000';
  end if;

  select * into v_pend from public.pending_sales
   where id = p_pending_id and user_id = v_uid for update;
  if not found then
    raise exception 'valider_vente_perso : vente en attente introuvable' using errcode = 'P0002';
  end if;

  if v_pend.status = 'traite' then
    return jsonb_build_object('ok', true, 'deja_traite', true, 'sale_id', p_sale_id);
  end if;
  if v_pend.status <> 'en_attente' then
    raise exception 'valider_vente_perso : vente en attente déjà %', v_pend.status using errcode = 'P0001';
  end if;

  insert into public.sales
    (id, user_id, date, article, category, size, purchase_price, sale_price,
     shipping_cost, booster_cost, product_url, is_personal)
  values
    (p_sale_id, v_uid, v_pend.date::text, p_article, 'Autre', coalesce(v_pend.size, ''),
     0, v_pend.sale_price, 0, 0, p_product_url, true);

  update public.pending_sales set status = 'traite' where id = v_pend.id and user_id = v_uid;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'valider_vente_perso : clôture refusée'; end if;

  return jsonb_build_object('ok', true, 'deja_traite', false, 'sale_id', p_sale_id);
end;
$$;

revoke all on function public.valider_vente_perso(uuid, text, text, text) from public, anon;
grant execute on function public.valider_vente_perso(uuid, text, text, text) to authenticated;
