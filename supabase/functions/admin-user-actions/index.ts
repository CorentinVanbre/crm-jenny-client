// ============================================================================
// Edge Function : admin-user-actions
// Actions réservées aux administrateurs sur un compte utilisateur :
//   - get_user               : récupère email + langue préférée (user_metadata.langue)
//   - generate_temp_password : génère un mot de passe provisoire et l'applique au compte
//   - set_language           : modifie la langue préférée (user_metadata.langue)
//
// Sécurité :
//   - Déployée avec verify_jwt=true (par défaut) : le JWT de l'appelant est
//     vérifié par la passerelle et transmis dans l'en-tête Authorization.
//   - La fonction vérifie ensuite que l'appelant a le rôle "admin" (table
//     profiles) avant toute action, et refuse de modifier un compte admin.
//   - Les opérations sur auth.users nécessitent la clé service role.
//
// Secrets requis (supabase secrets set ...) :
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//
// Invocation (depuis le client, avec le token de session de l'admin) :
//   curl -i --request POST "$SUPABASE_URL/functions/v1/admin-user-actions" \
//     --header "Authorization: Bearer $USER_JWT" \
//     --header "Content-Type: application/json" \
//     --data '{"action":"generate_temp_password","userId":"..."}'
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const ALLOWED_LANGUAGES = ["fr", "en"] as const;
type AllowedLanguage = (typeof ALLOWED_LANGUAGES)[number];

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// Génère un mot de passe provisoire robuste (16 caractères, toutes les
// catégories exigées par la réinitialisation : majuscule, minuscule,
// chiffre, caractère spécial).
function generateTemporaryPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%^&*?-_";
  const all = upper + lower + digits + special;
  const pick = (alphabet: string): string => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return alphabet[buf[0] % alphabet.length];
  };
  const chars = [pick(upper), pick(lower), pick(digits), pick(special)];
  for (let i = chars.length; i < 16; i++) chars.push(pick(all));
  // Mélange aléatoire (Fisher-Yates)
  for (let i = chars.length - 1; i > 0; i--) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const j = buf[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "Configuration serveur manquante" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return jsonResponse({ error: "Non authentifié" }, 401);
  }

  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Identifie l'appelant à partir de son JWT
  const { data: callerData, error: callerError } = await adminClient.auth.getUser(jwt);
  if (callerError || !callerData?.user) {
    return jsonResponse({ error: "Non authentifié" }, 401);
  }
  const callerId = callerData.user.id;

  // Vérifie que l'appelant est admin (lecture service role, contourne la RLS)
  const { data: callerProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", callerId)
    .maybeSingle();
  if (profileError) {
    return jsonResponse({ error: `Erreur vérification du rôle: ${profileError.message}` }, 500);
  }
  if (callerProfile?.role !== "admin") {
    return jsonResponse({ error: "Accès réservé aux administrateurs" }, 403);
  }

  let payload: { action?: string; userId?: string; langue?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Corps JSON invalide" }, 400);
  }

  const { action, userId } = payload;
  if (!action || !userId) {
    return jsonResponse({ error: "action et userId requis" }, 400);
  }

  // Récupère la cible et refuse de modifier un compte admin
  const { data: targetData, error: targetError } = await adminClient.auth.admin.getUserById(userId);
  if (targetError || !targetData?.user) {
    return jsonResponse({ error: "Utilisateur introuvable" }, 404);
  }
  const target = targetData.user;
  const targetRole = (target.user_metadata as Record<string, unknown> | undefined)?.role;
  if (targetRole === "admin") {
    return jsonResponse({ error: "Impossible de modifier un compte administrateur" }, 403);
  }

  if (action === "get_user") {
    const langue = ((target.user_metadata as Record<string, unknown> | undefined)?.langue as string) || "fr";
    return jsonResponse({ email: target.email ?? "", langue: ALLOWED_LANGUAGES.includes(langue as AllowedLanguage) ? langue : "fr" });
  }

  if (action === "generate_temp_password") {
    const password = generateTemporaryPassword();
    const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, { password });
    if (updateError) {
      return jsonResponse({ error: `Erreur mise à jour du mot de passe: ${updateError.message}` }, 500);
    }
    return jsonResponse({ ok: true, password });
  }

  if (action === "set_language") {
    const langue = payload.langue;
    if (!langue || !ALLOWED_LANGUAGES.includes(langue as AllowedLanguage)) {
      return jsonResponse({ error: "langue invalide (fr ou en attendu)" }, 400);
    }
    const mergedMetadata = { ...(target.user_metadata as Record<string, unknown> | undefined), langue };
    // GoTrueAdminApi: la métadonnée utilisateur se transmet via `user_metadata`
    // (et non `data`, qui est ignoré silencieusement par l'endpoint admin).
    const { error: updateError } = await adminClient.auth.admin.updateUserById(userId, { user_metadata: mergedMetadata });
    if (updateError) {
      return jsonResponse({ error: `Erreur mise à jour de la langue: ${updateError.message}` }, 500);
    }
    // Relit l'utilisateur pour renvoyer la valeur réellement persistée
    const { data: freshData, error: freshError } = await adminClient.auth.admin.getUserById(userId);
    if (freshError || !freshData?.user) {
      return jsonResponse({ error: "Langue enregistrée mais relecture impossible" }, 500);
    }
    const storedLangue = ((freshData.user.user_metadata as Record<string, unknown> | undefined)?.langue as string) || "fr";
    return jsonResponse({ ok: true, langue: storedLangue });
  }

  return jsonResponse({ error: "action inconnue" }, 400);
});
