-- Étend la contrainte approved pour autoriser 'existing' (site déjà en base).
-- Idempotente : on retire l'ancienne contrainte avant de la recréer.
alter table public.prospect_suggestions
  drop constraint if exists prospect_suggestions_approved_check;
alter table public.prospect_suggestions
  add constraint prospect_suggestions_approved_check
  check (approved is null or approved in ('approved', 'refused', 'existing'));
