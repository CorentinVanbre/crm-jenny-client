-- Limite de suppression de sites : 5 par jour pour les utilisateurs non admin.
--
-- Principe :
--   - Chaque suppression est journalisée dans public.site_deletions (via un
--     trigger AFTER DELETE en SECURITY DEFINER, qui contourne la RLS).
--   - La policy DELETE sur public.sites n'autorise la suppression que si le
--     compteur de suppressions du jour (déjà journalisées) est < 5, sauf pour
--     les admins (role = 'admin' dans le JWT user_metadata).
--   - Quand la policy bloque, le .delete() client supprime 0 ligne sans
--     erreur : le front affiche alors un message explicite.

create table if not exists public.site_deletions (
  id uuid primary key default gen_random_uuid(),
  site_id text,
  user_id text not null,
  deleted_at timestamptz not null default now()
);

alter table public.site_deletions enable row level security;

-- Lecture : ses propres suppressions, ou toutes les suppressions pour un admin
drop policy if exists "site_deletions_select" on public.site_deletions;
create policy "site_deletions_select"
  on public.site_deletions
  for select
  to authenticated
  using (
    user_id = auth.uid()::text
    or coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
  );

-- Journalisation des suppressions (SECURITY DEFINER = contourne la RLS)
create or replace function public.log_site_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.site_deletions (site_id, user_id)
  values (old.id::text, auth.uid()::text);
  return old;
end;
$$;

drop trigger if exists sites_delete_log on public.sites;
create trigger sites_delete_log
  after delete on public.sites
  for each row
  execute function public.log_site_deletion();

-- Policy DELETE : propriétaire + limite de 5 suppressions/jour (hors admin)
drop policy if exists "sites_delete_own" on public.sites;
create policy "sites_delete_own"
  on public.sites
  for delete
  to authenticated
  using (
    owner = auth.uid()::text
    and (
      coalesce(auth.jwt() -> 'user_metadata' ->> 'role', '') = 'admin'
      or (
        select count(*)
        from public.site_deletions d
        where d.user_id = auth.uid()::text
          and d.deleted_at >= date_trunc('day', now())
      ) < 5
    )
  );
