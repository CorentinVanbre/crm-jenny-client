import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../supabaseClient';
import type { User } from '@supabase/supabase-js';

interface UserZonesContextValue {
  allowedCountries: string[] | null; // null = admin (tout voir)
  loadingZones: boolean;
}

const UserZonesContext = createContext<UserZonesContextValue>({
  allowedCountries: null,
  loadingZones: true,
});

export function UserZonesProvider({ children }: { children: ReactNode }) {
  const [allowedCountries, setAllowedCountries] = useState<string[] | null>(null);
  const [loadingZones, setLoadingZones] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async (user: User | null) => {
      if (!user) {
        setAllowedCountries(null);
        setLoadingZones(false);
        return;
      }

      // Admin -> pas de filtre
      if ((user.user_metadata as Record<string, unknown>)?.role === 'admin') {
        setAllowedCountries(null);
        setLoadingZones(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_zones')
        .select('pays')
        .eq('user_id', user.id);

      if (active) {
        if (error) {
          console.error('Erreur chargement zones:', error.message);
          setAllowedCountries([]);
        } else {
          setAllowedCountries((data || []).map(r => r.pays));
        }
        setLoadingZones(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => load(session?.user ?? null));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      load(session?.user ?? null);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return (
    <UserZonesContext.Provider value={{ allowedCountries, loadingZones }}>
      {children}
    </UserZonesContext.Provider>
  );
}

export function useUserZones() {
  return useContext(UserZonesContext);
}