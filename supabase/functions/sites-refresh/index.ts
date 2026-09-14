// ============================================================================
// Edge Function : sites-refresh
// Routine quotidienne (le matin) d'actualisation du statut couleur des sites.
//
// Règle métier :
//   - Sites verts "Visités" : si datevisite est plus ancienne que 18 mois,
//     passer le statut en jaune "Visités il y a +18mois" ; sinon laisser en vert.
//   - Tous les autres statuts ("Non visités", "Visités il y a +18mois",
//     "A visiter", "Fermés") : aucune action.
//
// Secrets requis (supabase secrets set ...) :
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//
// Planification (chaque matin) :
//   supabase functions schedule sites-refresh --cron "0 7 * * *"
//
// Invocation manuelle :
//   curl -i --request POST "$SUPABASE_URL/functions/v1/sites-refresh" \
//     --header "Authorization: Bearer $SERVICE_ROLE_KEY"
// ============================================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const STATUS_VISITES = "Visités";
const STATUS_VISITES_ANCIENS = "Visités il y a +18mois";
const VISITE_SEUIL_MOIS = 18;

// Date limite (YYYY-MM-DD) : aujourd'hui moins 18 mois.
// On retire 18 mois via setMonth (normalise les débordements de jour).
function computeLimitDate(): string {
  const limit = new Date();
  limit.setHours(0, 0, 0, 0);
  limit.setMonth(limit.getMonth() - VISITE_SEUIL_MOIS);
  return limit.toISOString().slice(0, 10);
}

Deno.serve(async (_req) => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(
      JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const limitDate = computeLimitDate();

    // PATCH sur sites : couleur = "Visités" ET datevisite < limitDate
    //   -> couleur = "Visités il y a +18mois"
    // Le filtre `lt` ignore les datevisite NULL (résultat NULL), donc les sites
    // "Visités" sans date de visite ne sont pas touchés.
    const filter = `couleur=eq.${encodeURIComponent(STATUS_VISITES)}&datevisite=lt.${limitDate}`;
    const url = `${SUPABASE_URL}/rest/v1/sites?${filter}`;

    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        "apikey": SERVICE_ROLE_KEY,
        "Prefer": "return=representation",
      },
      body: JSON.stringify({ couleur: STATUS_VISITES_ANCIENS }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Supabase PATCH error:", res.status, errText);
      return new Response(
        JSON.stringify({ error: "Sites update failed", status: res.status, detail: errText }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    const updated = await res.json();
    const count = Array.isArray(updated) ? updated.length : 0;

    return new Response(
      JSON.stringify({
        ok: true,
        updated: count,
        limitDate,
        rule: `Sites "${STATUS_VISITES}" avec datevisite < ${limitDate} passés en "${STATUS_VISITES_ANCIENS}"`,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Function error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
