-- ============================================================================
-- Préférences de voyage rattachées au profil utilisateur (page Visite) :
-- ville d'origine, gares et aéroports de départ à privilégier.
-- Une ligne par utilisateur (upsert depuis la page Visite).
-- ============================================================================

create table if not exists public.visit_preferences (
  user_id uuid primary key default auth.uid(),
  origin_city text not null default 'Lille',
  preferred_stations jsonb not null default '[]'::jsonb,
  preferred_airports jsonb not null default '[]'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

create or replace function public.set_updated_date_visit_preferences()
returns trigger
language plpgsql
as $$
begin
  new.updated_date = now();
  return new;
end;
$$;

drop trigger if exists trg_visit_preferences_updated
  on public.visit_preferences;

create trigger trg_visit_preferences_updated
  before update on public.visit_preferences
  for each row execute function public.set_updated_date_visit_preferences();

-- ============================================================================
-- Row Level Security : chaque utilisateur ne voit et ne modifie que SES
-- préférences.
-- ============================================================================

alter table public.visit_preferences enable row level security;

drop policy if exists "visit_preferences_select_own" on public.visit_preferences;
create policy "visit_preferences_select_own"
  on public.visit_preferences
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "visit_preferences_insert_own" on public.visit_preferences;
create policy "visit_preferences_insert_own"
  on public.visit_preferences
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "visit_preferences_update_own" on public.visit_preferences;
create policy "visit_preferences_update_own"
  on public.visit_preferences
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================================
-- visit_trips : date de début de trajet (déroulée ensuite sur les étapes)
-- ============================================================================

alter table public.visit_trips
  add column if not exists start_date date;
