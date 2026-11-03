import { supabase } from '../supabaseClient';

// Appelle l'Edge Function admin-user-actions (réservée aux admins, vérifiée
// côté serveur via le JWT de session transmis en Authorization).
async function callAdminUserActions(payload: {
  action: 'get_user' | 'generate_temp_password' | 'set_language';
  userId: string;
  langue?: string;
}): Promise<Record<string, unknown>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Non connecté.');
  }
  const baseUrl = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
  if (!baseUrl) {
    throw new Error('VITE_SUPABASE_URL non défini : edge function injoignable.');
  }
  const functionUrl = baseUrl + '/functions/v1/admin-user-actions';
  let res: Response;
  try {
    res = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_KEY || '',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(
      'Edge function injoignable (réseau/CORS). Vérifiez qu\'elle est déployée : supabase functions deploy admin-user-actions'
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Erreur ${res.status}`);
  }
  return data;
}

export async function getUserInfo(userId: string): Promise<{ email: string; langue: string }> {
  const data = await callAdminUserActions({ action: 'get_user', userId });
  return { email: String(data.email ?? ''), langue: String(data.langue ?? 'fr') };
}

export async function generateTemporaryPassword(userId: string): Promise<string> {
  const data = await callAdminUserActions({ action: 'generate_temp_password', userId });
  return String(data.password ?? '');
}

export async function setUserLanguage(userId: string, langue: string): Promise<string> {
  const data = await callAdminUserActions({ action: 'set_language', userId, langue });
  return String(data.langue ?? langue);
}
