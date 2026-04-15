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

    const user_id = String(body.user_id || body.email || "").trim();
    const email = String(body.email || "").trim();
    const first_name = String(body.first_name || "").trim();
    const companion_name = String(body.companion_name || "").trim();

    const primary_goal = String(body.primary_goal || "").trim();
    const biggest_challenge = String(body.biggest_challenge || "").trim();
    const preferred_coaching_tone = String(body.preferred_coaching_tone || "").trim();
    const movement_preference = String(body.movement_preference || "").trim();
    const food_preference = String(body.food_preference || "").trim();
    const main_craving_pattern = String(body.main_craving_pattern || "").trim();
    const timezone = String(body.timezone || "").trim();
    const intake_summary = String(body.intake_summary || "").trim();

    if (!user_id) {
      return res.status(400).json({ error: "Missing user_id or email" });
    }

    const payload = {
      user_id,
      email: email || null,
      first_name: first_name || null,
      companion_name: companion_name || null,
      timezone: timezone || null,
      primary_goal: primary_goal || null,
      biggest_challenge: biggest_challenge || null,
      preferred_coaching_tone: preferred_coaching_tone || null,
      movement_preference: movement_preference || null,
      food_preference: food_preference || null,
      main_craving_pattern: main_craving_pattern || null,
      intake_summary: intake_summary || null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await supabase
      .from("intake_profiles")
      .upsert([payload], { onConflict: "user_id" })
      .select();

    if (error) {
      console.error("SAVE INTAKE ERROR:", error);
      return res.status(500).json({
        error: "Failed to save intake",
        details: error.message
      });
    }

    return res.status(200).json({
      success: true,
      profile: data?.[0] || null
    });
  } catch (error) {
    console.error("SERVER ERROR:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error.message || "Unknown error"
    });
  }
}