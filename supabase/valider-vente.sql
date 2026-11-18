-- ════════════════════════════════════════════════════════════════════════
--  T-022.7 — Validation d'une vente en 1 clic, atomique (tout ou rien)
--  À coller dans Supabase → SQL Editor → Run, APRÈS auto-import.sql et achats-shein.sql.
--  Additif uniquement : crée/remplace une fonction, ne touche à aucune donnée. Sûr à relancer.
--  Retour arrière : drop function public.valider_vente(uuid, uuid, text, text, text);
-- ════════════════════════════════════════════════════════════════════════
-- SECURITY INVOKER : la RLS de l'utilisateur connecté s'applique (aucun contournement).
-- Une fonction plpgsql est une seule transaction : toute erreur annule les 3 écritures.
-- Idempotente : p_sale_id est généré une fois par le client (clé d'idempotence). Si la vente
-- en attente est déjà « traite » (double clic, réseau relancé), rien n'est réécrit.
create or replace function public.valider_vente(
  p_pending_id  uuid,   -- vente détectée (pending_sales.id)
  p_purchase_id uuid,   -- article du stock vendu (purchases.id)
  p_sale_id     text,   -- id de la future vente (sales.id), fourni par le client
  p_article     text,   -- titre final (modèle — article)
  p_product_url text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_pend public.pending_sales%rowtype;
  v_purc public.purchases%rowtype;
  v_n    integer;
begin
  if v_uid is null then
    raise exception 'valider_vente : utilisateur non connecté' using errcode = '28000';
  end if;

  -- Verrou de ligne : un 2e appel simultané attend la fin du 1er, puis voit « traite ».
  select * into v_pend from public.pending_sales
   where id = p_pending_id and user_id = v_uid for update;
  if not found then
    raise exception 'valider_vente : vente en attente introuvable' using errcode = 'P0002';
  end if;

  if v_pend.status = 'traite' then
    return jsonb_build_object('ok', true, 'deja_traite', true, 'sale_id', p_sale_id);
  end if;
  if v_pend.status <> 'en_attente' then
    raise exception 'valider_vente : vente en attente déjà %', v_pend.status using errcode = 'P0001';
  end if;

  select * into v_purc from public.purchases
   where id = p_purchase_id and user_id = v_uid for update;
  if not found then
    raise exception 'valider_vente : article du stock introuvable' using errcode = 'P0002';
  end if;
  if v_purc.status <> 'en_stock' then
    raise exception 'valider_vente : article déjà sorti du stock (%)', v_purc.status using errcode = 'P0001';
  end if;

  insert into public.sales
    (id, user_id, date, article, category, size, purchase_price, sale_price,
     shipping_cost, booster_cost, product_url)
  values
    (p_sale_id, v_uid, v_pend.date::text, p_article, 'Autre',
     coalesce(nullif(v_purc.size, ''), v_pend.size, ''),
     v_purc.purchase_price, v_pend.sale_price, 0, 0, p_product_url);

  update public.purchases set status = 'vendu' where id = v_purc.id and user_id = v_uid;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'valider_vente : sortie du stock refusée'; end if;

  update public.pending_sales set status = 'traite' where id = v_pend.id and user_id = v_uid;
  get diagnostics v_n = row_count;
  if v_n <> 1 then raise exception 'valider_vente : clôture refusée'; end if;

  return jsonb_build_object('ok', true, 'deja_traite', false, 'sale_id', p_sale_id);
end;
$$;

revoke all on function public.valider_vente(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.valider_vente(uuid, uuid, text, text, text) to authenticated;
