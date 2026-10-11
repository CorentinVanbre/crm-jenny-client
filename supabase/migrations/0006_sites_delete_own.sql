-- Suppression d'un site réservée à son propriétaire.
-- Sans policy DELETE, la RLS filtre silencieusement le .delete() côté client :
-- aucune erreur, mais 0 ligne supprimée.

drop policy if exists "sites_delete_own" on public.sites;
create policy "sites_delete_own"
  on public.sites
  for delete
  to authenticated
  using (owner = auth.uid()::text);
