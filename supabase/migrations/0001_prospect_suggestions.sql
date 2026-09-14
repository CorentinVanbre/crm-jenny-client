-- ============================================================================
-- Table : prospect_suggestions
-- Suggestions de sites/groupes issus du scan IA (Edge Function prospect-scan)
-- Une suggestion = un site candidat, rattaché à un groupe existant ou candidat,
-- géolocalisé, scoré en pertinence, et modérée via la colonne `approved`.
-- ============================================================================

create table if not exists public.prospect_suggestions (
  id uuid primary key default gen_random_uuid(),

  -- Groupe de référence (existant dans `groupes`) ou groupe candidat détecté
  groupe text not null,
  -- Nom du site suggéré (nom de l'usine / installation)
  noms text not null,

  -- Domaine d'activité du site (Ciment, Mineralurgie, Platre, Papeterie,
  -- Fertilisant, Autre, Chimie, Calcination, Incinération)
  domaine text not null default 'Autre',

  -- Localisation
  pays text not null default '',
  adress jsonb not null default '{"formatted": ""}'::jsonb,
  latitude text not null default '',
  longitude text not null default '',

  -- Lien du site web qui a permis d'identifier ce site (source du scan)
  source_url text not null default '',

  -- Taux de fiabilité / pertinence (0 à 100) par rapport aux sites existants
  score integer not null default 0,
  -- Raison courte du score (mots-clés matched, domaine, etc.)
  score_reason text not null default '',

  -- Statut de modération : null = en attente, 'refused' = bouton supprimer,
  -- 'approved' = transformé en site via la modale d'analyse
  approved text default null,

  -- Métadonnées de scan
  scan_run_id text,
  scanned_at timestamptz not null default now(),

  owner uuid default null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

-- Index pour le filtrage par pays (utilisé par la RLS et la page Prospection)
create index if not exists prospect_suggestions_pays_idx
  on public.prospect_suggestions (pays);

create index if not exists prospect_suggestions_approved_idx
  on public.prospect_suggestions (approved);

create index if not exists prospect_suggestions_groupe_idx
  on public.prospect_suggestions (groupe);

-- Contrainte : approved ne peut valoir que null, 'approved' ou 'refused'
-- Idempotente : on retire d'éventuelles anciennes contraintes du même nom
-- avant de la recréer (utile en cas de ré-exécution).
alter table public.prospect_suggestions
  drop constraint if exists prospect_suggestions_approved_check;
alter table public.prospect_suggestions
  add constraint prospect_suggestions_approved_check
  check (approved is null or approved in ('approved', 'refused'));

-- updated_date automatique
create or replace function public.set_updated_date_prospect_suggestions()
returns trigger
language plpgsql
as $$
begin
  new.updated_date = now();
  return new;
end;
$$;

drop trigger if exists trg_prospect_suggestions_updated
  on public.prospect_suggestions;
create trigger trg_prospect_suggestions_updated
  before update on public.prospect_suggestions
  for each row execute function public.set_updated_date_prospect_suggestions();

-- ============================================================================
-- Row Level Security
-- Un utilisateur ne voit QUE les suggestions des pays qui lui sont attribués
-- (table user_zones). L'admin (role 'admin' dans user_metadata) voit tout.
-- La lecture est possible même pour les utilisateurs non authentifiés côté
-- client uniquement via ce contexte ; on requiert ici l'authentification.
-- ============================================================================

alter table public.prospect_suggestions enable row level security;

-- Lecture : l'utilisateur voit les pays de ses user_zones, l'admin voit tout
drop policy if exists "prospect_suggestions_select_own_zones" on public.prospect_suggestions;
create policy "prospect_suggestions_select_own_zones"
  on public.prospect_suggestions
  for select
  to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin')
    or pays in (
      select uz.pays
      from public.user_zones uz
      where uz.user_id = auth.uid()
    )
  );

-- Mise à jour de `approved` (modération) : même règle de pays que la lecture.
-- Un utilisateur ne peut refuser/approuver que les suggestions de ses pays.
drop policy if exists "prospect_suggestions_update_own_zones" on public.prospect_suggestions;
create policy "prospect_suggestions_update_own_zones"
  on public.prospect_suggestions
  for update
  to authenticated
  using (
    (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin')
    or pays in (
      select uz.pays
      from public.user_zones uz
      where uz.user_id = auth.uid()
    )
  )
  with check (
    (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin')
    or pays in (
      select uz.pays
      from public.user_zones uz
      where uz.user_id = auth.uid()
    )
  );

-- Insertion : réservée au service_role (Edge Function de scan)
drop policy if exists "prospect_suggestions_insert_service" on public.prospect_suggestions;
create policy "prospect_suggestions_insert_service"
  on public.prospect_suggestions
  for insert
  to service_role
  with check (true);
