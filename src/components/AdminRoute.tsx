import { useState, useEffect, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import type { User } from '@supabase/supabase-js';

export default function AdminRoute({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
  }, []);

  if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>Chargement...</div>;

  const isAdmin = (user?.user_metadata as Record<string, unknown> | undefined)?.role === 'admin';

  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}