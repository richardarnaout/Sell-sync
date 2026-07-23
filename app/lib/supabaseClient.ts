import { createClient } from '@supabase/supabase-js';

// Client Supabase partagé (mêmes identifiants que page.tsx). La session d'auth est
// partagée via le localStorage, donc les policies RLS s'appliquent au bon user.
export const supabase = createClient(
  'https://omipwzbkrdtarlcuurhn.supabase.co',
  'sb_publishable_UdqYs50tvp37Kuni-sweTQ_n8i8s9kh',
);
