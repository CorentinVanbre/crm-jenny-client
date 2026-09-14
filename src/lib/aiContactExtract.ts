export interface ExtractedContact {
  noms?: string;
  prenom?: string;
  fonction?: string;
  email?: string;
  num_mobile?: string;
  num_fixe?: string;
  genre?: string;
}

// Appelle l'Edge Function contact-extract (Mistral) pour extraire les champs
// d'un contact à partir d'un texte libre (observations).
//
// On utilise un fetch direct (et non supabase.functions.invoke) avec un
// Content-Type "text/plain" : cela n'envoie que des en-têtes "CORS-safe" et
// évite donc un preflight CORS (qui serait sinon bloqué par la passerelle
// Supabase). La fonction est déployée avec verify_jwt=false (aucune donnée
// Supabase lue), donc aucun header Authorization/apikey n'est nécessaire.
// Renvoie null en cas d'erreur (Mistral indisponible, clé manquante, etc.).
export async function extractContactFromText(text: string): Promise<ExtractedContact | null> {
  if (!text || !text.trim()) return null;

  const functionUrl =
    (import.meta.env.VITE_SUPABASE_URL || '') + '/functions/v1/contact-extract';

  try {
    const res = await fetch(functionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      console.error('contact-extract error:', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    if (data && data.ok && data.contact) {
      return data.contact as ExtractedContact;
    }
    return null;
  } catch (err) {
    console.error('contact-extract fetch failed:', err);
    return null;
  }
}
