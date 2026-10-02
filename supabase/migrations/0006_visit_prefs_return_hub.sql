-- ============================================================================
-- Préférences de voyage (complément) :
-- - pool de gares / aéroports créés par l'utilisateur (déjà en jsonb) +
--   sous-ensemble sélectionné : l'utilisateur peut désélectionner sans supprimer
-- - autoriser un retour via une autre gare / un autre aéroport que l'aller
--   (et une autre agence de retour de voiture de location)
-- ============================================================================
alter table public.visit_preferences
  add column if not exists selected_stations jsonb not null default '[]'::jsonb;
alter table public.visit_preferences
  add column if not exists selected_airports jsonb not null default '[]'::jsonb;
alter table public.visit_preferences
  add column if not exists allow_different_return_hub boolean not null default false;
