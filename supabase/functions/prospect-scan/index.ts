// ============================================================================
// Edge Function : prospect-scan
// Scan IA hebdomadaire de prospection.
//
// Pipeline :
//   1. Lit les groupes (groupes.site_web) + sites existants (sites.groupe,
//      sites.noms, sites.domaine, sites.pays) pour bâtir un profil de recherche.
//   2. Génère des requêtes de recherche web (Mistral AI) ciblant les domaines
//      existants + Chimie / Calcination / Incinération (broyeurs à boulets,
//      fours rotatifs).
//   3. Exécute les recherches via Vertex AI Search (Agent Search / Discovery Engine
//      API) sur un datastore de sites web indexant les sites des groupes connus
//      + domaines industriels cibles, et collecte des candidats (URL de page
//      = source_url, titre = site candidat).
//   4. Pour chaque candidat : géocodage (OpenStreetMap Nominatim) du pays de
//      la source, scoring de pertinence (Mistral AI) par rapport aux sites
//      existants, et déduplication vs sites déjà répertoriés.
//   5. Insère les nouveaux candidats (score >= SEUIL) dans prospect_suggestions.
//
// Secrets requis (supabase secrets set ...):
//   - GCLOUD_PROJECT_ID      : ID du projet Google Cloud
//   - GCLOUD_LOCATION        : région du datastore ("global", "us" ou "eu")
//   - VERTEX_SEARCH_DATASTORE_ID : ID du datastore Agent Search (créé sur
//                                  https://console.cloud.google.com/ → AI Applications)
//   - GCLOUD_CLIENT_EMAIL    : email du service account (ex: crm-prospect@project.iam.gserviceaccount.com)
//   - GCLOUD_PRIVATE_KEY     : clé privée du service account (format PEM, JSON-encoded pour les sauts de ligne)
//   - MISTRAL_API_KEY        : clé API Mistral AI (https://console.mistral.ai)
//
// Planification (lundi matin) :
//   supabase functions schedule prospect-scan --cron "0 7 * * 1"
//
// Invocation manuelle :
//   curl -i --request POST "$SUPABASE_URL/functions/v1/prospect-scan" \
//     --header "Authorization: Bearer $SERVICE_ROLE_KEY"
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY") ?? "";
const GCLOUD_PROJECT_ID = Deno.env.get("GCLOUD_PROJECT_ID") ?? "";
const GCLOUD_LOCATION = Deno.env.get("GCLOUD_LOCATION") ?? "global";
const VERTEX_SEARCH_DATASTORE_ID = Deno.env.get("VERTEX_SEARCH_DATASTORE_ID") ?? "";
const GCLOUD_CLIENT_EMAIL = Deno.env.get("GCLOUD_CLIENT_EMAIL") ?? "";
const GCLOUD_PRIVATE_KEY = Deno.env.get("GCLOUD_PRIVATE_KEY") ?? "";

const SCORE_THRESHOLD = 40;
const MAX_SUGGESTIONS_PER_RUN = 80;
const MAX_CANDIDATES = 120;

interface ExistingSite {
  groupe: string;
  noms: string;
  domaine: string;
  pays: string;
}

interface Groupe {
  nom_groupe: string;
  site_web: string | null;
}

interface Candidate {
  groupe: string;
  noms: string;
  source_url: string;
  snippet: string;
}

interface ScoredCandidate extends Candidate {
  domaine: string;
  pays: string;
  adress: string;
  latitude: string;
  longitude: string;
  score: number;
  score_reason: string;
}

// --- Supabase helpers (service_role, bypass RLS) ---------------------------

async function supabaseSelect<T>(
  table: string,
  columns: string
): Promise<T[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(columns)}`;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`select ${table} failed (${res.status}): ${txt}`);
  }
  return (await res.json()) as T[];
}

async function supabaseInsert(rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  const url = `${SUPABASE_URL}/rest/v1/prospect_suggestions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal,resolution=ignore-duplicates",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`insert prospect_suggestions failed (${res.status}): ${txt}`);
  }
}

// --- Vertex AI Search (Agent Search / Discovery Engine API) -----------------
// Google Cloud Vertex AI Search (renommé Agent Search) : recherche sur un
// datastore de sites web préalablement indexé (sites des groupes connus +
// domaines industriels cibles). Recommandé par Google comme remplaçant de
// Programmable Search Engine (CSE).
// Doc : https://cloud.google.com/generative-ai-app-builder/docs/search-data-store
// Auth : service account via JWT (OAuth2 access token), scope Discovery Engine.

let cachedAccessToken: { token: string; exp: number } | null = null;

function b64url(input: string): string {
  // Base64URL sans padding
  return btoa(input)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getGoogleAccessToken(): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.exp > Date.now() + 60000) {
    return cachedAccessToken.token;
  }
  if (!GCLOUD_CLIENT_EMAIL || !GCLOUD_PRIVATE_KEY) {
    throw new Error("GCLOUD_CLIENT_EMAIL / GCLOUD_PRIVATE_KEY manquants");
  }
  // La clé privée peut être stockée avec les "\n" échappés en littéraux.
  const privateKeyPem = GCLOUD_PRIVATE_KEY.replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: GCLOUD_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const encHeader = b64url(JSON.stringify(header));
  const encPayload = b64url(JSON.stringify(payload));
  const unsigned = `${encHeader}.${encPayload}`;

  // Importe la clé privée PKCS8 PEM
  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  const encSignature = b64url(String.fromCharCode(...new Uint8Array(signature)));
  const jwt = `${unsigned}.${encSignature}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Google OAuth token failed (${tokenRes.status}): ${await tokenRes.text()}`);
  }
  const tokenData = await tokenRes.json();
  cachedAccessToken = {
    token: tokenData.access_token,
    exp: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
  };
  return tokenData.access_token;
}

async function vertexSearch(query: string, count = 10): Promise<Candidate[]> {
  if (!VERTEX_SEARCH_DATASTORE_ID || !GCLOUD_PROJECT_ID) {
    console.warn("VERTEX_SEARCH_DATASTORE_ID / GCLOUD_PROJECT_ID manquants — recherche ignorée");
    return [];
  }
  const endpoint =
    GCLOUD_LOCATION === "global"
      ? "https://discoveryengine.googleapis.com"
      : `https://${GCLOUD_LOCATION}-discoveryengine.googleapis.com`;
  const servingConfig =
    `projects/${GCLOUD_PROJECT_ID}/locations/${GCLOUD_LOCATION}/collections/default_collection` +
    `/dataStores/${VERTEX_SEARCH_DATASTORE_ID}/servingConfigs/default_search:search`;
  const url = `${endpoint}/v1/${servingConfig}`;

  const accessToken = await getGoogleAccessToken();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      pageSize: Math.min(Math.max(count, 1), 100),
      queryExpansionSpec: { condition: "AUTO" },
      spellCorrectionSpec: { followupQueryExpansion: true },
    }),
  });
  if (!res.ok) {
    console.warn(`Vertex AI Search failed (${res.status}): ${await res.text()}`);
    return [];
  }
  const data = await res.json();
  const results = (data?.results ?? []) as Array<{
    id?: string;
    document?: {
      id?: string;
      name?: string;
      structData?: Record<string, unknown>;
      derivedStructData?: {
        title?: string;
        link?: string;
        snippets?: Array<{ snippet?: string }[]>;
      };
    };
  }>;
  return results
    .map((r) => {
      const doc = r.document?.derivedStructData ?? {};
      const title = doc.title ?? r.document?.name ?? "";
      const link = doc.link ?? "";
      const snippet = Array.isArray(doc.snippets)
        ? doc.snippets.flat().map((s) => s?.snippet ?? "").join(" ")
        : "";
      return {
        groupe: "",
        noms: String(title).split(/[|·—\-–]/)[0].trim(),
        source_url: link,
        snippet,
      } as Candidate;
    })
    .filter((c) => c.noms && c.source_url);
}

// --- Mistral AI : génération de requêtes ------------------------------------

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  Ciment: ["ciment", "cement", "cimenterie", "cement plant", "clinker"],
  Mineralurgie: ["mineralurgie", "mineral processing", "broyage minerai", "ore grinding"],
  Platre: ["platre", "plaster", "gypse", "gypsum", "plaster plant"],
  Papeterie: ["papeterie", "pulp and paper", "paper mill", "pâte à papier"],
  Fertilisant: ["fertilisant", "fertilizer", "NPK", "engrais", "phosphate"],
  Chimie: ["chimie", "chemical plant", "usine chimique", "petrochemical", "sodium carbonate"],
  Calcination: ["calcination", "calciner", "four de calcination", "calcination plant", "lime kiln"],
  Incinération: ["incineration", "incinérateur", "waste-to-energy", "usine d'incinération", "cimierie"],
};

const PROCESS_KEYWORDS = [
  "broyeur à boulets",
  "ball mill",
  "four rotatif",
  "rotary kiln",
  "tube mill",
  " broyeur à boulets",
];

async function generateQueries(
  groupes: Groupe[],
  sites: ExistingSite[]
): Promise<string[]> {
  const domainSet = new Set(sites.map((s) => s.domaine));
  // On ajoute systématiquement les domaines cibles demandés
  ["Chimie", "Calcination", "Incinération"].forEach((d) => domainSet.add(d));

  const knownGroups = groupes
    .filter((g) => g.nom_groupe && g.site_web)
    .map((g) => `${g.nom_groupe} (${g.site_web})`)
    .slice(0, 40);
  const knownGroupNames = groupes.map((g) => g.nom_groupe).slice(0, 60);

  const prompt = `Tu es un assistant de prospection B2B pour des industriels utilisant des broyeurs à boulets et fours rotatifs.

Voici les domaines ciblés : ${Array.from(domainSet).join(", ")}.
Mots-clés process : ${PROCESS_KEYWORDS.join(", ")}.

Groupes existants à explorer (chercher d'autres sites de ces groupes non encore répertoriés) :
${knownGroups.join("\n")}

Génère 12 requêtes de recherche web (style Google/Bing) en français et anglais permettant de trouver de NOUVEAUX sites industriels (usines/cimenteries/usines chimiques/calcination/incinération) qui pourraient utiliser des broyeurs à boulets ou fours rotatifs. Inclis des requêtes du type "site:<domaine_d_un_groupe>" pour découvrir d'autres usines d'un groupe connu.

Réponds UNIQUEMENT avec un tableau JSON de chaînes, par exemple ["requête 1", "requête 2"].`;
  const queries = await callMistralText(prompt);
  try {
    const parsed = JSON.parse(queries);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((q) => typeof q === "string" && q.trim())
        .map((q) => q.trim())
        .slice(0, 12);
    }
  } catch {
    // fallback
  }
  // Fallback statique basé sur les domaines connus
  const fallback: string[] = [];
  Array.from(domainSet).forEach((d) => {
    const kws = DOMAIN_KEYWORDS[d] ?? [];
    fallback.push(`${kws[0] ?? d} broyeur à boulets four rotatif`);
    fallback.push(`${kws[0] ?? d} plant rotary kiln ball mill`);
  });
  knownGroupNames.slice(0, 6).forEach((g) => {
    fallback.push(`"${g}" usine cimenterie plant`);
  });
  return fallback.slice(0, 12);
}

// --- Mistral AI : scoring de pertinence -------------------------------------

async function scoreCandidates(
  candidates: Candidate[],
  sites: ExistingSite[]
): Promise<ScoredCandidate[]> {
  if (candidates.length === 0) return [];

  const profile = sites
    .slice(0, 60)
    .map((s) => `${s.groupe} | ${s.noms} | ${s.domaine} | ${s.pays}`)
    .join("\n");

  const existingNames = new Set(sites.map((s) => s.noms.toLowerCase().trim()));

  const scored: ScoredCandidate[] = [];
  // On score par lots pour limiter la taille des prompts
  const BATCH = 8;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const items = batch
      .map(
        (c, idx) =>
          `${idx}: ${c.noms} — ${c.source_url}\n   ${c.snippet}`
      )
      .join("\n");

    const prompt = `Tu es un expert en prospection industrielle (broyeurs à boulets / fours rotatifs).

Sites déjà connus de notre base :
${profile}

Pour CHAQUE candidat ci-dessous, renvoie un JSON : {"results":[{"index":0,"domaine":"...","score":0-100,"pays":"...","raison":"..."}]}.
- domaine : un de Ciment, Mineralurgie, Platre, Papeterie, Fertilisant, Chimie, Calcination, Incinération, Autre.
- pays : le pays probable du site (vide si inconnu).
- score : pertinence 0-100 (proximité process/zone géographique vs base, mention broyeur à boulets/four rotatif/ciment/clinker/chimie/calcination/incinération). Pénalise les blogs, annuaires, Wikipédia, LinkedIn.
- raison : courte explication.

Candidats :
${items}

Réponds UNIQUEMENT avec le JSON ci-dessus.`;

    let parsed: { results: Array<{
      index: number;
      domaine?: string;
      score?: number;
      pays?: string;
      raison?: string;
    }> } | null = null;
    try {
      const raw = await callMistralText(prompt);
      parsed = JSON.parse(raw);
    } catch (e) {
      console.warn("score parse failed", e);
    }

    const results = parsed?.results ?? [];
    batch.forEach((c, idx) => {
      const r = results.find((x) => x.index === idx) ?? {};
      const name = c.noms.toLowerCase().trim();
      if (existingNames.has(name)) return; // déjà répertorié
      scored.push({
        ...c,
        domaine: r.domaine ?? "Autre",
        pays: r.pays ?? "",
        adress: "",
        latitude: "",
        longitude: "",
        score: clampScore(r.score ?? 0),
        score_reason: r.raison ?? "",
      });
    });
  }
  return scored;
}

function clampScore(n: number): number {
  if (isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

async function callMistralText(prompt: string): Promise<string> {
  if (!MISTRAL_API_KEY) {
    console.warn("MISTRAL_API_KEY manquant");
    return "[]";
  }
  const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    console.warn(`Mistral failed (${res.status}): ${await res.text()}`);
    return "[]";
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "[]";
}

// --- Géocodage (OpenStreetMap Nominatim, gratuit) ---------------------------

async function geocode(
  query: string
): Promise<{ pays: string; adress: string; latitude: string; longitude: string }> {
  if (!query.trim()) {
    return { pays: "", adress: "", latitude: "", longitude: "" };
  }
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "crm-jenny-prospect/1.0" },
    });
    if (!res.ok) return { pays: "", adress: "", latitude: "", longitude: "" };
    const arr = (await res.json()) as Array<{
      lat?: string;
      lon?: string;
      display_name?: string;
      address?: { country?: string };
    }>;
    const first = arr?.[0];
    if (!first) return { pays: "", adress: "", latitude: "", longitude: "" };
    return {
      pays: first.address?.country ?? "",
      adress: first.display_name ?? "",
      latitude: first.lat ?? "",
      longitude: first.lon ?? "",
    };
  } catch {
    return { pays: "", adress: "", latitude: "", longitude: "" };
  }
}

// --- Déduplication des URL déjà suggérées -----------------------------------

async function alreadySuggestedUrls(urls: string[]): Promise<Set<string>> {
  if (urls.length === 0) return new Set();
  // on interroge par batch via une requête in(...) émulée par filtres OR
  const orFilter = urls
    .slice(0, 50)
    .map((u) => `source_url.eq.${encodeURIComponent(u)}`)
    .join(",");
  const url = `${SUPABASE_URL}/rest/v1/prospect_suggestions?select=source_url&${orFilter}`;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) return new Set();
  const rows = (await res.json()) as Array<{ source_url: string }>;
  return new Set(rows.map((r) => r.source_url));
}

// --- Main -------------------------------------------------------------------

Deno.serve(async (req) => {
  // Health check
  if (req.method === "GET") {
    return json({ ok: true, service: "prospect-scan" });
  }

  if (!SERVICE_ROLE_KEY || !SUPABASE_URL) {
    return json({ error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants" }, 500);
  }

  const runId = `run_${new Date().toISOString().slice(0, 10)}_${Date.now()}`;
  try {
    // 1. Charger la base existante
    const [groupes, sites] = await Promise.all([
      supabaseSelect<Groupe>("groupes", "nom_groupe,site_web"),
      supabaseSelect<ExistingSite>("sites", "groupe,noms,domaine,pays"),
    ]);

    console.log(`Base: ${groupes.length} groupes, ${sites.length} sites`);

    // 2. Générer les requêtes
    const queries = await generateQueries(groupes, sites);
    console.log(`Requêtes générées: ${queries.length}`);

    // 3. Recherche web (Vertex AI Search / Discovery Engine sur le datastore)
    const allCandidates: Candidate[] = [];
    for (const q of queries) {
      const found = await vertexSearch(q, 8);
      // rattache au groupe connu si la requête le mentionne
      for (const c of found) {
        const matchedGroup = groupes.find((g) =>
          g.nom_groupe && c.noms.toLowerCase().includes(g.nom_groupe.toLowerCase())
        );
        c.groupe = matchedGroup?.nom_groupe ?? "";
        allCandidates.push(c);
      }
      // Limite globale de candidats
      if (allCandidates.length >= MAX_CANDIDATES) break;
    }
    console.log(`Candidats bruts: ${allCandidates.length}`);

    // Déduplication URL
    const seen = new Set<string>();
    const unique = allCandidates.filter((c) => {
      const key = c.source_url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const already = await alreadySuggestedUrls(unique.map((c) => c.source_url));
    const fresh = unique.filter((c) => !already.has(c.source_url));
    console.log(`Candidats frais: ${fresh.length}`);

    // 4. Scoring
    const scored = await scoreCandidates(fresh, sites);
    const kept = scored
      .filter((c) => c.score >= SCORE_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SUGGESTIONS_PER_RUN);
    console.log(`Suggestions retenues: ${kept.length}`);

    // 5. Géocodage des suggestions retenues
    for (const c of kept) {
      // pays déjà suggéré par le scorer ? sinon géocodage par nom+domaine
      const q = c.pays
        ? `${c.noms}, ${c.pays}`
        : `${c.noms}`;
      const geo = await geocode(q);
      if (geo.pays) {
        c.pays = geo.pays;
        c.adress = geo.adress;
        c.latitude = geo.latitude;
        c.longitude = geo.longitude;
      }
      // si toujours pas de pays, on tente à partir de la source_url
      if (!c.pays) {
        try {
          const host = new URL(c.source_url).hostname;
          const geo2 = await geocode(host);
          if (geo2.pays) {
            c.pays = geo2.pays;
            if (!c.adress) c.adress = geo2.adress;
            if (!c.latitude) c.latitude = geo2.latitude;
            if (!c.longitude) c.longitude = geo2.longitude;
          }
        } catch {
          // ignore
        }
      }
    }

    // 6. Insertion
    const rows = kept.map((c) => ({
      groupe: c.groupe || c.noms,
      noms: c.noms,
      domaine: c.domaine,
      pays: c.pays,
      adress: { formatted: c.adress },
      latitude: c.latitude,
      longitude: c.longitude,
      source_url: c.source_url,
      score: c.score,
      score_reason: c.score_reason,
      approved: null,
      scan_run_id: runId,
    }));

    await supabaseInsert(rows);

    return json({
      ok: true,
      run_id: runId,
      queries: queries.length,
      candidates: unique.length,
      fresh: fresh.length,
      inserted: rows.length,
    });
  } catch (err) {
    console.error("prospect-scan error:", err);
    return json({ error: String(err), run_id: runId }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
