-- ============================================================================
-- Table : visit_trips
-- Projets de voyages / visites clients créés depuis le "Mode visite IA"
-- de la page Sites. Chaque utilisateur ne voit que ses propres voyages (RLS).
-- ============================================================================

create table if not exists public.visit_trips (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid(),
  name text not null default '',
  countries text not null default '',
  sites jsonb not null default '[]'::jsonb,
  plans jsonb not null default '[]'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  notes text not null default '',
  status text not null default 'draft',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.visit_trips
  drop constraint if exists visit_trips_status_check;

alter table public.visit_trips
  add constraint visit_trips_status_check
  check (status in ('draft', 'planned', 'done'));

create index if not exists visit_trips_owner_idx
  on public.visit_trips (owner);

create or replace function public.set_updated_date_visit_trips()
returns trigger
language plpgsql
as $$
begin
  new.updated_date = now();
  return new;
end;
$$;

drop trigger if exists trg_visit_trips_updated
  on public.visit_trips;

create trigger trg_visit_trips_updated
  before update on public.visit_trips
  for each row execute function public.set_updated_date_visit_trips();

-- ============================================================================
-- Row Level Security : chaque utilisateur ne voit et ne modifie que SES voyages
-- ============================================================================

alter table public.visit_trips enable row level security;

drop policy if exists "visit_trips_select_own" on public.visit_trips;
create policy "visit_trips_select_own"
  on public.visit_trips
  for select
  to authenticated
  using (owner = auth.uid());

drop policy if exists "visit_trips_insert_own" on public.visit_trips;
create policy "visit_trips_insert_own"
  on public.visit_trips
  for insert
  to authenticated
  with check (owner = auth.uid());

drop policy if exists "visit_trips_update_own" on public.visit_trips;
create policy "visit_trips_update_own"
  on public.visit_trips
  for update
  to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

drop policy if exists "visit_trips_delete_own" on public.visit_trips;
create policy "visit_trips_delete_own"
  on public.visit_trips
  for delete
  to authenticated
  using (owner = auth.uid());
