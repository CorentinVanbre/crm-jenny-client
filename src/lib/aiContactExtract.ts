import { supabase } from '../supabaseClient';

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
// Renvoie null en cas d'erreur (Mistral indisponible, clé manquante, etc.).
export async function extractContactFromText(text: string): Promise<ExtractedContact | null> {
  if (!text || !text.trim()) return null;

  try {
    const { data, error } = await supabase.functions.invoke('contact-extract', {
      body: { text },
    });

    if (error) {
      console.error('contact-extract error:', error);
      return null;
    }

    if (data && data.ok && data.contact) {
      return data.contact as ExtractedContact;
    }
    return null;
  } catch (err) {
    console.error('contact-extract invoke failed:', err);
    return null;
  }
}
