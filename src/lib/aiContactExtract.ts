export interface ExtractedContact {
  noms?: string;
  prenom?: string;
  fonction?: string;
  email?: string;
  num_mobile?: string;
  num_fixe?: string;
  genre?: string;
  langue?: string;
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
async function callContactExtract(payload: { text?: string; image?: string }): Promise<ExtractedContact | null> {
  const functionUrl =
    (import.meta.env.VITE_SUPABASE_URL || '') + '/functions/v1/contact-extract';

  try {
    const res = await fetch(functionUrl, {
      method: 'POST',
      // text/plain = en-têtes "CORS-safe" -> pas de preflight CORS (cf. doc
      // en haut de fichier). La Edge Function parse le corps JSON elle-même.
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
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

// Appelle l'Edge Function contact-extract (Mistral) pour extraire les champs
// d'un contact à partir d'un texte libre (observations).
export async function extractContactFromText(text: string): Promise<ExtractedContact | null> {
  if (!text || !text.trim()) return null;
  return callContactExtract({ text });
}

// Appelle l'Edge Function contact-extract (Mistral vision) pour extraire les
// champs d'un contact à partir d'une image (photo de carte de visite).
// `image` doit être une data URI base64 ("data:image/...;base64,...").
// Renvoie null en cas d'erreur.
export async function extractContactFromImage(image: string): Promise<ExtractedContact | null> {
  if (!image || !image.trim()) return null;
  return callContactExtract({ image });
}

// Lit un fichier image (File) et renvoie une data URI base64 prête à envoyer
// à l'Edge Function. Renvoie null si l'objet n'est pas une image lisible.
export function fileToDataUri(file: File): Promise<string | null> {
  return new Promise(resolve => {
    if (!file || !file.type.startsWith('image/')) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}