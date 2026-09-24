// ============================================================================
// Edge Function : contact-extract
// Extrait les informations d'un contact (nom, pr\u00e9nom, fonction, emails,
// t\u00e9l\u00e9phones, genre) \u00e0 partir d'un texte libre (champ "observations") OU
// d'une image (photo de carte de visite) en s'appuyant sur Mistral AI.
//
// Pipeline :
//   1. Re\u00e7oit { text?: string, image?: string }.
//      - text  : contenu texte des observations (mode texte).
//      - image : image encod\u00e9e en base64 (data URI ou base64 brut), par ex.
//                une photo de carte de visite (mode vision).
//   2. Demande \u00e0 Mistral d'extraire les champs structur\u00e9s.
//        - mode texte  : mistral-small-latest
//        - mode vision : pixtral-12b-2409 (mod\u00e8le multimodal)
//   3. Renvoie un objet JSON normalis\u00e9 :
//      { noms, prenom, fonction, email, num_mobile, num_fixe, genre }
//
// Secrets requis (supabase secrets set ...):
//   - MISTRAL_API_KEY : cl\u00e9 API Mistral AI (https://console.mistral.ai)
//
// Invocation :
//   curl -i --request POST "$SUPABASE_URL/functions/v1/contact-extract" \
//     --header "Content-Type: application/json" \
//     --data '{"text":"..."}'            # mode texte
//     --data '{"image":"data:image/..."}'  # mode vision
// ============================================================================

const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY") ?? "";

interface ExtractedContact {
  noms?: string;
  prenom?: string;
  fonction?: string;
  email?: string;
  num_mobile?: string;
  num_fixe?: string;
  genre?: string;
  langue?: string;
}

async function callMistralText(prompt: string): Promise<string> {
  if (!MISTRAL_API_KEY) {
    console.warn("MISTRAL_API_KEY manquant");
    return "{}";
  }
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.warn(`Mistral failed (${res.status}): ${body}`);
    return "{}";
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "{}";
}

// Appel vision : envoie une image (data URI base64) \u00e0 pixtral-12b-2409.
async function callMistralVision(imageDataUri: string, prompt: string): Promise<string> {
  if (!MISTRAL_API_KEY) {
    console.warn("MISTRAL_API_KEY manquant");
    return "{}";
  }
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: "pixtral-12b-2409",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: imageDataUri },
        ],
      }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.warn(`Mistral vision failed (${res.status}): ${body}`);
    return "{}";
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "{}";
}

// Nettoie la sortie d'un LLM pour extraire un JSON valide :
// - retire les fences markdown ```json ... ``` (ou ``` ... ```)
// - si le JSON est incomplet, tente de compl\u00e9ter les crochets/accolades ouverts
function stripJsonFence(raw: string): string {
  let s = (raw ?? "").trim();
  if (!s) return "";
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) {
    s = fence[1].trim();
  }
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  const objStart = s.indexOf("{");
  const arrStart = s.indexOf("[");
  let start = -1;
  if (objStart === -1) start = arrStart;
  else if (arrStart === -1) start = objStart;
  else start = Math.min(objStart, arrStart);
  if (start > 0) s = s.slice(start);
  let openSq = 0, openCu = 0;
  let inStr = false, esc = false;
  for (const ch of s) {
    if (esc) { esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "[") openSq++;
    else if (ch === "]") openSq--;
    else if (ch === "{") openCu++;
    else if (ch === "}") openCu--;
  }
  if (openSq > 0) s += "]".repeat(openSq);
  if (openCu > 0) s += "}".repeat(openCu);
  return s.trim();
}

function parseMistralJson<T>(raw: string): T | null {
  if (!raw) return null;
  const candidates = [raw, stripJsonFence(raw)];
  for (const c of candidates) {
    try {
      return JSON.parse(c) as T;
    } catch {
      // continue
    }
  }
  return null;
}

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

// Normalise une image base64 en data URI attendue par Mistral.
// Accepte d\u00e9j\u00e0 une data URI ("data:image/...;base64,...") ou du base64 brut
// (on suppose alors image/jpeg).
function toDataUri(image: string): string {
  const s = image.trim();
  if (s.startsWith("data:")) return s;
  return `data:image/jpeg;base64,${s}`;
}

const EXTRACTION_PROMPT = `Tu es un assistant qui extrait les coordonn\u00e9es d'un contact \u00e0 partir d'un texte libre (notes, signature d'email, carte de visite, etc.).

\u00c0 partir du texte ci-dessous, extrais les champs suivants si pr\u00e9sents :
- noms : nom de famille (en MAJUSCULES)
- prenom : pr\u00e9nom (capitale initiale)
- fonction : intitul\u00e9 de poste / fonction
- email : adresse email (en minuscules, sans accents)
- num_mobile : num\u00e9ro de t\u00e9l\u00e9phone mobile (format international si possible, chiffres et + uniquement)
- num_fixe : num\u00e9ro de t\u00e9l\u00e9phone fixe (chiffres et + uniquement)
- genre : "Homme" ou "Femme" si d\u00e9ductible du pr\u00e9nom/titre, sinon cha\u00eene vide
- langue : "Fran\u00e7ais", "Anglais" ou "Espagnol" selon la langue de l'intitul\u00e9 de poste (ex : "maintenance manager" = Anglais, "responsable production" = Fran\u00e7ais), sinon cha\u00eene vide

R\u00e8gles :
- Ne remplis un champ QUE si l'information est clairement pr\u00e9sente dans le texte.
- Si une information est absente ou incertaine, laisse le champ vide (cha\u00eene vide).
- Ne d\u00e9double pas les num\u00e9ros : num_mobile = le 1er num\u00e9ro, num_fixe = un \u00e9ventuel 2e.
- R\u00e9ponds UNIQUEMENT avec un objet JSON de la forme :
  {"noms":"","prenom":"","fonction":"","email":"","num_mobile":"","num_fixe":"","genre":"","langue":""}
  sans markdown ni texte autour.

Texte :
"""
${"%TEXT%"}
"""`;

function buildTextPrompt(text: string): string {
  return EXTRACTION_PROMPT.replace("%TEXT%", text);
}

// Prompt vision : m\u00eame structure d'extraction, mais l'image est fournie \u00e0 part
// dans le contenu du message (le prompt texte seul ne contient pas l'image).
const VISION_PROMPT = `Tu es un assistant qui extrait les coordonn\u00e9es d'un contact \u00e0 partir d'une photo de carte de visite.

\u00c0 partir de l'image ci-dessous, extrais les champs suivants si pr\u00e9sents :
- noms : nom de famille (en MAJUSCULES)
- prenom : pr\u00e9nom (capitale initiale)
- fonction : intitul\u00e9 de poste / fonction
- email : adresse email (en minuscules, sans accents)
- num_mobile : num\u00e9ro de t\u00e9l\u00e9phone mobile (format international si possible, chiffres et + uniquement)
- num_fixe : num\u00e9ro de t\u00e9l\u00e9phone fixe (chiffres et + uniquement)
- genre : "Homme" ou "Femme" si d\u00e9ductible du pr\u00e9nom/titre, sinon cha\u00eene vide
- langue : "Fran\u00e7ais", "Anglais" ou "Espagnol" selon la langue de l'intitul\u00e9 de poste (ex : "maintenance manager" = Anglais, "responsable production" = Fran\u00e7ais), sinon cha\u00eene vide

R\u00e8gles :
- Ne remplis un champ QUE si l'information est clairement lisible sur la carte.
- Si une information est absente, illisible ou incertaine, laisse le champ vide (cha\u00eene vide).
- Ne d\u00e9double pas les num\u00e9ros : num_mobile = le 1er num\u00e9ro, num_fixe = un \u00e9ventuel 2e.
- R\u00e9ponds UNIQUEMENT avec un objet JSON de la forme :
  {"noms":"","prenom":"","fonction":"","email":"","num_mobile":"","num_fixe":"","genre":"","langue":""}
  sans markdown ni texte autour.`;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req) => {
  // Pr\u00e9-v\u00e9rification CORS (preflight)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method === "GET") {
    return json({ ok: true, service: "contact-extract" });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Accepte du JSON, que ce soit envoy\u00e9 en application/json (invoke) ou en
  // text/plain (fetch simple navigateur, pour \u00e9viter le preflight CORS).
  let body: { text?: string; image?: string };
  try {
    const raw = await req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const text = clean(body.text);
  const image = clean(body.image);

  if (!text && !image) {
    return json({ error: "Missing 'text' or 'image' field" }, 400);
  }

  // Limite de taille de l'image : ~8 Mo (base64) pour \u00e9viter les timeouts.
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
  if (image && image.length > MAX_IMAGE_BYTES) {
    return json({ error: "Image too large (max 8MB)" }, 413);
  }

  try {
    let raw: string;
    if (image) {
      raw = await callMistralVision(toDataUri(image), VISION_PROMPT);
    } else {
      raw = await callMistralText(buildTextPrompt(text));
    }
    const parsed = parseMistralJson<ExtractedContact>(raw);

    const result: ExtractedContact = {
      noms: clean(parsed?.noms).toUpperCase(),
      prenom: clean(parsed?.prenom),
      fonction: clean(parsed?.fonction),
      email: clean(parsed?.email).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
      num_mobile: clean(parsed?.num_mobile).replace(/[^\d+]/g, ""),
      num_fixe: clean(parsed?.num_fixe).replace(/[^\d+]/g, ""),
      genre: clean(parsed?.genre),
      langue: clean(parsed?.langue),
    };

    return json({ ok: true, contact: result });
  } catch (err) {
    const e = err as { name?: string; message?: string; stack?: string };
    const detail = JSON.stringify({ name: e?.name, message: e?.message, stack: e?.stack }, null, 2);
    console.error("contact-extract error:", detail);
    return json({ error: detail }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
