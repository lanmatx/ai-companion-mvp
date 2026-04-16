console.log("WEBHOOK BODY:", JSON.stringify(req.body, null, 2));

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const body = req.body || {};

    console.log("WEBHOOK BODY:", JSON.stringify(body, null, 2));

    const contact = body.contact || {};

    const email = contact.email || "";
    const firstName = contact.firstName || "";

    const customFields = contact.customFields || {};
    const companionName =
      customFields.Companion_Name ||
      customFields.companion_name ||
      "";

    if (!email) {
      return res.status(400).json({ error: "Missing email" });
    }

    const { error } = await supabase
      .from("intake_profiles")
      .upsert({
        user_id: email,
        email: email,
        first_name: firstName,
        companion_name: companionName,
        intake_summary: "Submitted from website workflow"
      });

    if (error) {
      console.error("SUPABASE ERROR:", error);
      return res.status(500).json({ error: "Database error" });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
}