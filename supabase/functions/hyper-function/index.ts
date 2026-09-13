// Edge Function : notifie l'admin par email lors d'une nouvelle demande d'inscription
// Déclenchée par un Database Webhook sur INSERT dans pending_registrations

interface WebhookPayload {
  type: "INSERT";
  table: string;
  schema: string;
  record: {
    id: string;
    user_id: string | null;
    email: string;
    status: string;
    created_date: string;
  };
  old_record: null;
}

const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") ?? "corentin.vanbre@yahoo.com";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "corentin.vanbre@yahoo.com";

Deno.serve(async (req) => {
  try {
    const payload: WebhookPayload = await req.json();

    // N'agir que sur les insertions
    if (payload.type !== "INSERT" || payload.table !== "pending_registrations") {
      return new Response(JSON.stringify({ skipped: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const email = payload.record?.email;
    if (!email) {
      return new Response(JSON.stringify({ error: "Missing email" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY manquant");
      return new Response(JSON.stringify({ error: "Server misconfiguration" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Construire le lien vers la page d'admin (adapte l'URL)
    const adminUrl = `${
      Deno.env.get("SITE_URL") ?? "https://crm-jenny-client.vercel.app/"
    }/admin/registrations`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [ADMIN_EMAIL],
        subject: "Nouvelle demande d'inscription à valider",
        html: `
          <div style="font-family: Arial, sans-serif; color: #333; max-width: 500px;">
            <h2>Nouvelle demande d'inscription</h2>
            <p>Un nouvel utilisateur a demandé à s'inscrire :</p>
            <p style="font-size: 16px;"><strong>Email :</strong> ${email}</p>
            <p>Pour valider ou refuser cette demande, rendez-vous sur la page d'administration :</p>
            <p>
              <a href="${adminUrl}"
                 style="display: inline-block; padding: 10px 20px; background: #000; color: #fff; text-decoration: none; border-radius: 4px;">
                Valider les inscriptions
              </a>
            </p>
          </div>
        `,
        text: `Nouvelle demande d'inscription à valider.\nEmail : ${email}\nLien : ${adminUrl}`,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend error:", errText);
      return new Response(JSON.stringify({ error: "Mail send failed" }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});