-- ============================================================================
-- Préférences de voyage (complément) :
-- - gares / aéroports en saisie libre (n'importe où dans le monde, déjà stockés
--   en jsonb : aucune modification de structure nécessaire)
-- - durée standard de réunion (minutes) utilisée par le planificateur
-- ============================================================================

alter table public.visit_preferences
  add column if not exists meeting_minutes integer not null default 120;

alter table public.visit_preferences
  drop constraint if exists visit_preferences_meeting_minutes_check;

alter table public.visit_preferences
  add constraint visit_preferences_meeting_minutes_check
  check (meeting_minutes between 15 and 480);
