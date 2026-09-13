import { useEffect, useState, ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

export default function RequireAuth({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ok' | 'pending' | 'out'>('loading');

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (mounted) setStatus('out');
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('approved')
        .eq('id', session.user.id)
        .maybeSingle();

      if (error || !profile || !profile.approved) {
        await supabase.auth.signOut();
        if (mounted) setStatus('pending');
        return;
      }
      if (mounted) setStatus('ok');
    };

    check();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      check();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (status === 'loading') {
    return <p style={{ textAlign: 'center', marginTop: '40px' }}>Chargement...</p>;
  }
  if (status === 'out') return <Navigate to="/login" replace />;
  if (status === 'pending') return <Navigate to="/login?pending=1" replace />;
  return <>{children}</>;
}