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
//   3. Exécute les recherches web (Serper.dev = vrais résultats Google) et
//      collecte des candidats (URL de page = source_url, titre = site candidat).
//   4. Pour chaque candidat : géocodage (OpenStreetMap Nominatim) du pays de
//      la source, scoring de pertinence (Mistral AI) par rapport aux sites
//      existants, et déduplication vs sites déjà répertoriés.
//   5. Insère les nouveaux candidats (score >= SEUIL) dans prospect_suggestions.
//
// Secrets requis (supabase secrets set ...):
//   - SERPER_API_KEY   : clé API Serper.dev (https://serper.dev/, 2 500 requêtes offertes à l'inscription)
//   - MISTRAL_API_KEY  : clé API Mistral AI (https://console.mistral.ai)
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
const SERPER_API_KEY = Deno.env.get("SERPER_API_KEY") ?? "";
const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY") ?? "";

const SCORE_THRESHOLD = 25;
const MAX_SUGGESTIONS_PER_RUN = 80;
const MAX_CANDIDATES = 160;

// Diagnostics de run (remplis au fil de l'exécution)
let mistralKeyPresent = !!(MISTRAL_API_KEY);
let mistralCallOk = true;
let mistralError = "";

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

interface Feedback {
  noms: string;
  groupe: string;
  domaine: string;
  approved: string;
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

// --- Serper.dev (vrais résultats Google, API SERP) -------------------------
// API : https://serper.dev  — renvoie les vrais résultats Google au format JSON.
// Free tier : 2 500 requêtes offertes à l'inscription (couvrent ~4 ans de scans
// hebdomadaires de ~12 requêtes), puis $1 / 1 000 requêtes.

async function serperSearch(query: string, count = 10): Promise<Candidate[]> {
  if (!SERPER_API_KEY) {
    console.warn("SERPER_API_KEY manquant — recherche ignorée");
    return [];
  }
  const num = Math.min(Math.max(count, 1), 10);
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": SERPER_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ q: query, num }),
  });
  if (!res.ok) {
    console.warn(`Serper search failed (${res.status}): ${await res.text()}`);
    return [];
  }
  const data = await res.json();
  const items = (data?.organic ?? []) as Array<{
    title?: string;
    link?: string;
    snippet?: string;
  }>;
  return items
    .filter((r) => r.title && r.link)
    .map((r) => ({
      groupe: "",
      noms: r.title!.split(/[|·—\-–]/)[0].trim(),
      source_url: r.link!,
      snippet: r.snippet ?? "",
    }));
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
  const knownCountries = Array.from(new Set(sites.map((s) => s.pays).filter(Boolean))).slice(0, 30);

  const prompt = `Tu es un assistant de prospection B2B. On cherche des INSTALLATIONS INDUSTRIELLES réelles (usines, cimenteries, cimenteries, usines chimiques, fours de calcination, usines d'incinération) — PAS des articles de blog, des pages Wikipédia, des fiches produit sur les machines, ni des annuaires de constructeurs.

Domaines ciblés : ${Array.from(domainSet).join(", ")}.
Pays déjà présents dans la base (privilégier ces zones) : ${knownCountries.join(", ")}.

Groupes industriels déjà connus (chercher d'autres usines de ces groupes non encore répertoriées) :
${knownGroups.join("\n")}

Génère 16 requêtes de recherche web (style Google/Bing) qui retournent des PAGES DE SITES INDUSTRIELS RÉELS, c'est-à-dire des usines nommées avec une adresse. Évite les requêtes génériques sur les mots-clés des machines ("broyeur à boulets", "ball mill", "rotary kiln") qui renvoient du contenu technique/article.

Types de requêtes efficaces à générer :
1. "site:<domaine_d_un_groupe_connu> usine" ou "site:<domaine> plant" pour découvrir d'autres sites d'un groupe
2. "<nom_de_groupe> usine <pays>" / "<group> plant <country>"
3. "cimenterie <pays>" / "cement plant <country>" (par pays présent dans la base)
4. "usine de calcination <pays>" / "lime plant <country>"
5. "usine d'incinération <pays>" / "waste-to-energy plant <country>"
6. "usine chimique <pays>" / "chemical plant <country>"
7. "cimenterie <ville connue du secteur>" / "cement plant <city>"
8. "groupe cimentier <pays> implantations" / "cement group <country> plants"

Réponds UNIQUEMENT avec un objet JSON {"queries": ["requête 1", "requête 2"]} sans aucun texte autour, sans markdown.`;
  const queries = await callMistralText(prompt);
  // Format attendu : {"queries": [...]} (json_object forcé) ou directement [...]
  const obj = parseMistralJson<{ queries?: string[] } | string[]>(queries);
  let arr: string[] | null = null;
  if (obj && Array.isArray(obj)) arr = obj;
  else if (obj && Array.isArray((obj as { queries?: string[] }).queries)) {
    arr = (obj as { queries: string[] }).queries;
  }
  if (arr) {
    return arr
      .filter((q) => typeof q === "string" && q.trim())
      .map((q) => q.trim())
      .slice(0, 16);
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
  sites: ExistingSite[],
  groupes: Groupe[],
  feedback: Feedback[]
): Promise<{ scored: ScoredCandidate[]; diag: ScoreDiag }> {
  const diag: ScoreDiag = {
    candidates_in: candidates.length,
    mistral_results: 0,
    existing_filtered: 0,
    noise_filtered: 0,
    raw_samples: [],
  };
  if (candidates.length === 0) return { scored: [], diag };

  const profile = sites
    .slice(0, 60)
    .map((s) => `${s.groupe} | ${s.noms} | ${s.domaine} | ${s.pays}`)
    .join("\n");

  const existingNames = new Set(sites.map((s) => s.noms.toLowerCase().trim()));

  // Construction de la section feedback pour le prompt (exemples positifs/négatifs)
  const positives = feedback
    .filter((f) => f.approved === "approved" || f.approved === "existing")
    .slice(0, 15)
    .map((f) => `${f.noms} (${f.domaine})${f.groupe ? " — " + f.groupe : ""}`);
  const negatives = feedback
    .filter((f) => f.approved === "refused")
    .slice(0, 15)
    .map((f) => `${f.noms} (${f.domaine})${f.score_reason ? " — " + f.score_reason : ""}`);
  const feedbackSection = (positives.length || negatives.length)
    ? `\n\nFeedback précédent de l'utilisateur (adapte tes scores à ces signaux) :
S suggestions bien reçues (favorise ce type) :\n${positives.join("\n") || "(aucune)"}\nSuggestions refusées (à éviter / pénaliser) :\n${negatives.join("\n") || "(aucune)"}\n`
    : "";

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

Pour CHAQUE candidat ci-dessous (titre de page web + URL + extrait), extraire un VRAI site industriel et le rattacher à un groupe.
- site_nom : le nom propre de l'usine/site (ex: "Teresa Plant", "Bukit Asam Plant", "Ciments de l'Atlas - Fès"). NE JAMAIS mettre une question, un titre de blog, ou un texte générique. Si tu ne peux pas identifier un site industriel précis, mets "site_nom" vide.
- groupe : le groupe industriel propriétaire si identifiable (ex: "CRH", "LafargeHolcim", "Republic Cement (CRH)"). Sinon vide.
- domaine : un de Ciment, Mineralurgie, Platre, Papeterie, Fertilisant, Chimie, Calcination, Incinération, Autre.
- pays : le pays probable du site (vide si inconnu).
- score : pertinence 0-100 (proximité process/zone géographique vs base, mention broyeur à boulets/four rotatif/ciment/clinker/chimie/calcination/incinération). Pénalise fortement (score <= 15) les blogs, annuaires, Wikipédia, LinkedIn, questions/réponses type "Quel est...", sites de petites annonces, news génériques.
- raison : courte explication.
${feedbackSection}
Candidats :
${items}

Renvoie UNIQUEMENT un objet JSON {"results":[{"index":0,"site_nom":"","groupe":"","domaine":"...","score":0,"pays":"...","raison":"..."}]} sans markdown ni texte autour.`;

    const raw = await callMistralText(prompt);
    type ScoreResult = {
      index: number;
      site_nom?: string;
      groupe?: string;
      domaine?: string;
      score?: number;
      pays?: string;
      raison?: string;
    };
    const parsed = parseMistralJson<{ results: Array<ScoreResult> }>(raw);
    if (!parsed && raw) {
      console.warn("score parse failed: raw non JSON, début=", raw.slice(0, 80));
      diag.raw_samples.push(raw.slice(0, 120));
    } else if (parsed) {
      diag.mistral_results += parsed.results?.length ?? 0;
      if (diag.raw_samples.length < 2 && raw) {
        diag.raw_samples.push(raw.slice(0, 120));
      }
    }

    const results = parsed?.results ?? [];
    if (results.length === 0 && batch.length > 0) {
      console.warn(`batch ${i / BATCH}: 0 résultats Mistral pour ${batch.length} candidats`);
    }
    batch.forEach((c, idx) => {
      const r: ScoreResult = results.find((x) => x.index === idx) ?? { index: idx };
      // Nom de site propre extrait par Mistral ; fallback sur le titre nettoyé
      const cleanNom = (r.site_nom ?? "").trim();
      const nomFinal = cleanNom || c.noms;
      const name = nomFinal.toLowerCase().trim();
      // Déduplication robuste : match exact OU inclusion (ex: "Teresa" dans "Teresa Plant")
      // pour les noms significatifs (>= 4 chars) afin d'éviter les faux positifs courts.
      let existsAlready = existingNames.has(name);
      if (!existsAlready && name.length >= 4) {
        for (const ex of existingNames) {
          if (ex.length >= 4 && (ex.includes(name) || name.includes(ex))) {
            existsAlready = true;
            break;
          }
        }
      }
      if (existsAlready) { diag.existing_filtered++; return; }
      // Groupe : priorité à Mistral, puis rattachement par domaine du site_web
      let groupeFinal = (r.groupe ?? "").trim();
      if (!groupeFinal) {
        const byDomain = groupes.find((g) => {
          if (!g.site_web) return false;
          try {
            const host = new URL(g.site_web).hostname.replace(/^www\./, "");
            return c.source_url.includes(host);
          } catch {
            return false;
          }
        });
        if (byDomain) groupeFinal = byDomain.nom_groupe;
      }
      // Bruit filtré : pas de site_nom ET score faible
      if (!cleanNom && (r.score ?? 0) <= 15) { diag.noise_filtered++; return; }
      scored.push({
        ...c,
        noms: nomFinal,
        groupe: groupeFinal,
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
  return { scored, diag };
}

interface ScoreDiag {
  candidates_in: number;
  mistral_results: number;
  existing_filtered: number;
  noise_filtered: number;
  raw_samples: string[];
}

function clampScore(n: number): number {
  if (isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// Nettoie la sortie d'un LLM pour extraire un JSON valide :
// - retire les fences markdown ```json ... ``` (ou ``` ... ```)
// - si le JSON est incomplet, tente de compléter les crochets/accolades ouverts
function stripJsonFence(raw: string): string {
  let s = (raw ?? "").trim();
  if (!s) return "";
  // fences ```json ... ``` ou ``` ... ```
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) {
    s = fence[1].trim();
  }
  // parfois pas de fence fermante (tronqué) : retire un éventuel ```json d'ouverture
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  // garde la première occurrence {...} ou [...]
  const objStart = s.indexOf("{");
  const arrStart = s.indexOf("[");
  let start = -1;
  if (objStart === -1) start = arrStart;
  else if (arrStart === -1) start = objStart;
  else start = Math.min(objStart, arrStart);
  if (start > 0) s = s.slice(start);
  // complète un JSON tronqué : équilibre crochets/accollades ouverts
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
  // si jamais négatif, on ne complète pas (cassé)
  if (openSq > 0) s += "]".repeat(openSq);
  if (openCu > 0) s += "}".repeat(openCu);
  return s.trim();
}

// Tente plusieurs stratégies pour parser un JSON depuis la sortie d'un LLM.
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

async function callMistralText(prompt: string): Promise<string> {
  if (!MISTRAL_API_KEY) {
    console.warn("MISTRAL_API_KEY manquant");
    mistralCallOk = false;
    mistralError = "MISTRAL_API_KEY manquant";
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
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.warn(`Mistral failed (${res.status}): ${body}`);
    mistralCallOk = false;
    mistralError = `Mistral ${res.status}: ${body.slice(0, 200)}`;
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

// --- Chargement des feedbacks récents (approved/refused/existing) ---------
// Sert à pondérer le scoring IA : exemples positifs (approved/existing) et
// négatifs (refused) pour rendre le scan adaptatif aux décisions utilisateur.

async function loadFeedback(): Promise<Feedback[]> {
  const url = `${SUPABASE_URL}/rest/v1/prospect_suggestions?select=noms,groupe,domaine,approved,score_reason&approved=not.is.null&order=updated_date.desc&limit=40`;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) return [];
  return (await res.json()) as Feedback[];
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
    // 1. Charger la base existante + feedbacks récents
    const [groupes, sites, feedback] = await Promise.all([
      supabaseSelect<Groupe>("groupes", "nom_groupe,site_web"),
      supabaseSelect<ExistingSite>("sites", "groupe,noms,domaine,pays"),
      loadFeedback(),
    ]);

    console.log(`Base: ${groupes.length} groupes, ${sites.length} sites, ${feedback.length} feedbacks`);

    // 2. Générer les requêtes
    const queries = await generateQueries(groupes, sites);
    console.log(`Requêtes générées: ${queries.length}`);

    // 3. Recherche web (Serper.dev = vrais résultats Google)
    const allCandidates: Candidate[] = [];
    for (const q of queries) {
      const found = await serperSearch(q, 10);
      for (const c of found) {
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
    const { scored, diag: scoreDiag } = await scoreCandidates(fresh, sites, groupes, feedback);
    const maxScore = scored.reduce((m, c) => Math.max(m, c.score), 0);
    const aboveThreshold = scored.filter((c) => c.score >= SCORE_THRESHOLD).length;
    const kept = scored
      .filter((c) => c.score >= SCORE_THRESHOLD)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_SUGGESTIONS_PER_RUN);
    console.log(`Suggestions retenues: ${kept.length} (max score=${maxScore}, >=seuil=${aboveThreshold})`);
    console.log(`Score diag:`, JSON.stringify(scoreDiag));
    const topSamples = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((c) => ({ noms: c.noms, score: c.score, domaine: c.domaine, pays: c.pays }));

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
      groupe: c.groupe,
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
      scored: scored.length,
      inserted: rows.length,
      score_threshold: SCORE_THRESHOLD,
      max_score: maxScore,
      above_threshold: aboveThreshold,
      mistral_key_present: mistralKeyPresent,
      mistral_ok: mistralCallOk,
      mistral_error: mistralError,
      score_diag: scoreDiag,
      top_candidates: topSamples,
    });
  } catch (err) {
    const e = err as { name?: string; message?: string; stack?: string };
    const detail = JSON.stringify({
      name: e?.name,
      message: e?.message,
      stack: e?.stack,
      raw: String(err),
    }, null, 2);
    console.error("prospect-scan error:", detail);
    return json({ error: detail, run_id: runId }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
