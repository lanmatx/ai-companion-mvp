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

    console.log("WEBHOOK BODY:", JSON.stringify(req.body, null, 2));

    const body = req.body || {};
    const contact = body.contact || {};

    const email = String(
      contact.email ||
      body.email ||
      body.user_id ||
      ""
    ).trim();

    const firstName = String(
      contact.firstName ||
      body.first_name ||
      ""
    ).trim();

    const customFields = contact.customFields || {};

    const companionName = String(
      customFields.Companion_Name ||
      customFields.companion_name ||
      body.companion_name ||
      ""
    ).trim();

    const timezone = String(
      contact.timezone ||
      body.timezone ||
      ""
    ).trim();

    const primaryGoal = String(
      body.primary_goal || ""
    ).trim();

    const biggestChallenge = String(
      body.biggest_challenge || ""
    ).trim();

    const preferredCoachingTone = String(
      body.preferred_coaching_tone || ""
    ).trim();

    const movementPreference = String(
      body.movement_preference || ""
    ).trim();

    const foodPreference = String(
      body.food_preference || ""
    ).trim();

    const mainCravingPattern = String(
      body.main_craving_pattern || ""
    ).trim();

    const intakeSummary = String(
      body.intake_summary || "Submitted from website workflow"
    ).trim();

    if (!email) {
      return res.status(400).json({ error: "Missing email" });
    }

    const payload = {
      user_id: email,
      email: email,
      first_name: firstName || null,
      companion_name: companionName || null,
      timezone: timezone || null,
      primary_goal: primaryGoal || null,
      biggest_challenge: biggestChallenge || null,
      preferred_coaching_tone: preferredCoachingTone || null,
      movement_preference: movementPreference || null,
      food_preference: foodPreference || null,
      main_craving_pattern: mainCravingPattern || null,
      intake_summary: intakeSummary || null,
      updated_at: new Date().toISOString()
    };

    console.log("UPSERT PAYLOAD:", JSON.stringify(payload, null, 2));

    const { data, error } = await supabase
      .from("intake_profiles")
      .upsert([payload], { onConflict: "user_id" })
      .select();

    if (error) {
      console.error("SUPABASE UPSERT ERROR:", error);
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
    console.error("SAVE INTAKE SERVER ERROR:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error.message || "Unknown error"
    });
  }
}