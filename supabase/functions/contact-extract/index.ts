// ============================================================================
// Edge Function : contact-extract
// Extrait les informations d'un contact (nom, prénom, fonction, emails,
// téléphones, genre) à partir d'un texte libre (champ "observations") en
// s'appuyant sur Mistral AI.
//
// Pipeline :
//   1. Reçoit { text: string } (le contenu des observations).
//   2. Demande à Mistral d'extraire les champs structurés.
//   3. Renvoie un objet JSON normalisé :
//      { noms, prenom, fonction, email, num_mobile, num_fixe, genre }
//
// Secrets requis (supabase secrets set ...):
//   - MISTRAL_API_KEY : clé API Mistral AI (https://console.mistral.ai)
//
// Invocation :
//   curl -i --request POST "$SUPABASE_URL/functions/v1/contact-extract" \
//     --header "Authorization: Bearer $ANON_KEY" \
//     --header "Content-Type: application/json" \
//     --data '{"text":"..."}'
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

// Nettoie la sortie d'un LLM pour extraire un JSON valide :
// - retire les fences markdown ```json ... ``` (ou ``` ... ```)
// - si le JSON est incomplet, tente de compléter les crochets/accolades ouverts
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

Deno.serve(async (req) => {
  if (req.method === "GET") {
    return json({ ok: true, service: "contact-extract" });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const text = clean(body.text);
  if (!text) {
    return json({ error: "Missing 'text' field" }, 400);
  }

  const prompt = `Tu es un assistant qui extrait les coordonnées d'un contact à partir d'un texte libre (notes, signature d'email, carte de visite, etc.).

À partir du texte ci-dessous, extrais les champs suivants si présents :
- noms : nom de famille (en MAJUSCULES)
- prenom : prénom (capitale initiale)
- fonction : intitulé de poste / fonction
- email : adresse email (en minuscules, sans accents)
- num_mobile : numéro de téléphone mobile (format international si possible, chiffres et + uniquement)
- num_fixe : numéro de téléphone fixe (chiffres et + uniquement)
- genre : "Homme" ou "Femme" si déductible du prénom/titre, sinon chaîne vide

Règles :
- Ne remplis un champ QUE si l'information est clairement présente dans le texte.
- Si une information est absente ou incertaine, laisse le champ vide (chaîne vide).
- Ne dédouble pas les numéros : num_mobile = le 1er numéro, num_fixe = un éventuel 2e.
- Réponds UNIQUEMENT avec un objet JSON de la forme :
  {"noms":"","prenom":"","fonction":"","email":"","num_mobile":"","num_fixe":"","genre":""}
  sans markdown ni texte autour.

Texte :
"""
${text}
"""`;

  try {
    const raw = await callMistralText(prompt);
    const parsed = parseMistralJson<ExtractedContact>(raw);

    const result: ExtractedContact = {
      noms: clean(parsed?.noms).toUpperCase(),
      prenom: clean(parsed?.prenom),
      fonction: clean(parsed?.fonction),
      email: clean(parsed?.email).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
      num_mobile: clean(parsed?.num_mobile).replace(/[^\d+]/g, ""),
      num_fixe: clean(parsed?.num_fixe).replace(/[^\d+]/g, ""),
      genre: clean(parsed?.genre),
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
    headers: { "Content-Type": "application/json" },
  });
}
