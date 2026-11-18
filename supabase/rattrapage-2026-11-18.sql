-- ════════════════════════════════════════════════════════════════════════
--  T-021.2 — Rattrapage après le premier import réel (18/11/2026)
--  À coller dans Supabase → SQL Editor → Run, APRÈS achats-shein.sql. Sûr à relancer (idempotent).
--
--  1. Ajoute vinted_sold_notices.price (prix lu dans le mail « s'est vendu », sert au rapprochement).
--  2. Nettoie les marqueurs « [image: … » / « [image] » du texte brut Gmail dans les noms d'articles
--     (avis « s'est vendu » et ventes EN ATTENTE), recalcule article_key et la taille abîmée (« L] »).
--  3. Rattache les ventes en attente à date approximative à leur avis « s'est vendu » avec la règle
--     prudente de app/lib/matchSale.ts (mêmes critères) : vendu ≤ finalisé et écart ≤ 30 jours, tailles et
--     prix non contradictoires, ≥ 80 % des mots du titre le plus court en commun, ≥ 2 mots communs ou
--     1 mot + même taille / même prix, et UN SEUL candidat dans les deux sens. Dans le doute : rien.
--  Les fonctions sont temporaires (pg_temp) : rien ne reste en base à part les données corrigées.
--  Le dernier SELECT affiche les rattachements faits par ce passage (vide si rien à faire).
-- ════════════════════════════════════════════════════════════════════════

begin;

alter table public.vinted_sold_notices add column if not exists price numeric(10,2);

-- ── Fonctions de travail (copie SQL de parseVinted.ts / matchSale.ts) ──
create or replace function pg_temp.ss_fold(t text) returns text language sql immutable as $f$
  select translate(replace(replace(replace(lower(coalesce(t, '')), 'œ', 'oe'), 'æ', 'ae'), chr(160), ' '),
                   'àâäáãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy')
$f$;

-- « [image: <alt>] », « [image] », « [image: … » tronqué (jusqu'à la fin de ligne) → espace.
create or replace function pg_temp.ss_strip(t text) returns text language sql immutable as $f$
  select regexp_replace(coalesce(t, ''), '\[image(:[^]' || chr(10) || ']*)?\]?', ' ', 'gi')
$f$;

-- Nom propre : marqueurs retirés, prix final « 24,00 € » retiré ; si plus rien, texte alternatif de la photo.
create or replace function pg_temp.ss_clean(t text) returns text language sql immutable as $f$
  select coalesce(
    nullif(trim(regexp_replace(regexp_replace(pg_temp.ss_strip(t), '\s+', ' ', 'g'),
                               '(^|\s)[0-9]+([.,][0-9]{1,2})?\s*€\s*$', '')), ''),
    nullif(trim(regexp_replace(substring(t from '\[image:\s*([^]' || chr(10) || ']+)'), '\s*(…|\.\.\.)\s*\]?\s*$', '')), ''),
    '')
$f$;

-- Prix final « … 24,00 € » d'un nom brut, sinon null.
create or replace function pg_temp.ss_price(t text) returns numeric language sql immutable as $f$
  select nullif(replace(substring(pg_temp.ss_strip(t) from '(?:^|\s)([0-9]+(?:[.,][0-9]{1,2})?)\s*€\s*$'), ',', '.'), '')::numeric
$f$;

-- Même règle que articleKey() : minuscules, sans accents ni ponctuation.
create or replace function pg_temp.ss_key(t text) returns text language sql immutable as $f$
  select trim(regexp_replace(pg_temp.ss_fold(t), '[^a-z0-9]+', ' ', 'g'))
$f$;

-- Mots significatifs (matchTokens) : ≥ 3 lettres, sans mots vides ni tailles, pluriel simple retiré.
create or replace function pg_temp.ss_tokens(t text) returns text[] language sql immutable as $f$
  select coalesce(array_agg(distinct case when length(w) > 4 and w ~ '[sx]$' then left(w, -1) else w end), '{}')
  from regexp_split_to_table(trim(regexp_replace(pg_temp.ss_fold(pg_temp.ss_strip(t)), '[^a-z0-9]+', ' ', 'g')), ' ') as w
  where length(w) >= 3
    and w <> all (array['taille','robe','la','le','les','de','du','des','et','en','au','aux','un','une',
                        'pour','avec','sans','sur','tres','neuf','neuve','femme','homme','fille','garcon','marque'])
    and w !~ '^(x{0,3}s|m|x{0,4}l|[0-9]?xl|tu|unique|[0-9]+)$'
$f$;

-- Taille (matchSize) : champ taille, sinon « taille X » du nom ; « M / 38 » → « M ».
create or replace function pg_temp.ss_size(sz text, art text) returns text language sql immutable as $f$
  select upper(trim(split_part(split_part(regexp_replace(pg_temp.ss_fold(coalesce(
           nullif(trim(sz), ''), substring(art from '(?i)\mtaille\s*:?\s*([^\s,;]+)'), '')), '^taille\s+', ''), '/', 1), '(', 1)))
$f$;

-- Score (matchScore) ; null = couple refusé.
create or replace function pg_temp.ss_score(s_art text, s_size text, s_price numeric, s_date date,
                                            n_art text, n_size text, n_price numeric, n_date date)
returns numeric language plpgsql immutable as $f$
declare
  a text[]; b text[]; c int; cov numeric; sa text; sn text; same_size boolean; same_price boolean;
begin
  if n_date > s_date or s_date - n_date > 30 then return null; end if;
  sa := pg_temp.ss_size(s_size, s_art);
  sn := pg_temp.ss_size(n_size, n_art);
  if sa <> '' and sn <> '' and sa <> sn then return null; end if;
  same_size := sa <> '' and sa = sn;
  same_price := coalesce(s_price, 0) > 0 and coalesce(n_price, 0) > 0;
  if same_price and abs(s_price - n_price) > 0.005 then return null; end if;
  a := pg_temp.ss_tokens(s_art);
  b := pg_temp.ss_tokens(n_art);
  if cardinality(a) = 0 or cardinality(b) = 0 then return null; end if;
  select count(*) into c from unnest(a) as x where x = any (b);
  cov := c::numeric / least(cardinality(a), cardinality(b));
  if c = 0 or cov < 0.8 then return null; end if;
  if c < 2 and not same_size and not same_price then return null; end if;
  return c * 2 + cov + case when same_size then 1 else 0 end + case when same_price then 1 else 0 end;
end
$f$;

-- ── 2. Nettoyage des noms (seulement les lignes qui contiennent encore « [image ») ──
update public.vinted_sold_notices n
set article     = c.clean,
    article_key = pg_temp.ss_key(c.clean),
    price       = coalesce(n.price, pg_temp.ss_price(n.article)),
    size        = case when n.size is null or n.size = '' or n.size ~ '[]\[]'
                       then nullif(trim(both ']' from coalesce(substring(c.clean from '(?i)\mtaille\s+(\S+)'), '')), '')
                       else n.size end
from (select id, pg_temp.ss_clean(article) as clean from public.vinted_sold_notices where article ~* '\[image') c
where n.id = c.id and c.clean <> '';

update public.pending_sales p
set article     = c.clean,
    article_key = pg_temp.ss_key(c.clean),
    size        = case when p.size is null or p.size = '' or p.size ~ '[]\[]'
                       then nullif(trim(both ']' from coalesce(substring(c.clean from '(?i)\mtaille\s+(\S+)'), '')), '')
                       else p.size end
from (select id, pg_temp.ss_clean(article) as clean from public.pending_sales
      where status = 'en_attente' and article ~* '\[image') c
where p.id = c.id and c.clean <> '';

-- ── 3. Rattachement prudent : couple retenu seulement s'il est unique des deux côtés ──
create temp table ss_links on commit drop as
with pairs as (
  select p.id as pending_id, n.id as notice_id, n.date as notice_date, p.date as old_date,
         p.article as sale_article, n.article as sold_article
  from public.pending_sales p
  join public.vinted_sold_notices n
    on n.user_id = p.user_id and n.used = false
   and n.date <= p.date and n.date >= p.date - 30
  where p.status = 'en_attente' and p.date_approx = true
    and pg_temp.ss_score(p.article, p.size, p.sale_price, p.date, n.article, n.size, n.price, n.date) is not null
)
select * from pairs x
where (select count(*) from pairs y where y.pending_id = x.pending_id) = 1
  and (select count(*) from pairs y where y.notice_id = x.notice_id) = 1;

update public.pending_sales p set date = l.notice_date, date_approx = false
from ss_links l where p.id = l.pending_id and p.date_approx = true;

update public.vinted_sold_notices n set used = true
from ss_links l where n.id = l.notice_id;

select sale_article as vente, old_date as date_finalisee, sold_article as avis_vendu, notice_date as vraie_date
from ss_links order by notice_date;

commit;
