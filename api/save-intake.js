import { createClient } from '@supabase/supabase-js';

function getProgramConfig(programType) {
  if (programType === "reset_14_day") {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 14);

    return {
      support_level: "reset",
      end_date: endDate.toISOString().split("T")[0]
    };
  }

  return {
    support_level: "maintenance",
    end_date: null
  };
}
export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

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
    const customFields = contact.customFields || {};

    const email = String(
      contact.email ||
      body.email ||
      body.user_id ||
      ""
    ).trim().toLowerCase();

    const firstName = String(
      contact.firstName ||
      body.first_name ||
      ""
    ).trim();

    const companionName = String(
      customFields.Companion_Name ||
      customFields.companion_name ||
      body.companion_name ||
      ""
    ).trim();

    const timezone = String(
      customFields.Timezone ||
      customFields.timezone ||
      contact.timezone ||
      body.timezone ||
      ""
    ).trim();

    const primaryGoal = String(
      customFields.Primary_Goal ||
      customFields.primary_goal ||
      body.primary_goal ||
      ""
    ).trim();

    const biggestChallenge = String(
      customFields.Biggest_Challenge ||
      customFields.biggest_challenge ||
      body.biggest_challenge ||
      ""
    ).trim();

    const preferredCoachingTone = String(
      customFields.Preferred_Coaching_Tone ||
      customFields.preferred_coaching_tone ||
      body.preferred_coaching_tone ||
      ""
    ).trim();

    const movementPreference = String(
      customFields.Movement_Preference ||
      customFields.movement_preference ||
      body.movement_preference ||
      ""
    ).trim();

    const foodPreference = String(
      customFields.Food_Preference ||
      customFields.food_preference ||
      body.food_preference ||
      ""
    ).trim();

    const mainCravingPattern = String(
      customFields.Main_Craving_Pattern ||
      customFields.main_craving_pattern ||
      body.main_craving_pattern ||
      ""
    ).trim();

    const intakeSummary = String(
      body.intake_summary || "Submitted from website workflow"
    ).trim();

    const programType = String(
      body.program_type ||
      customFields.Program_Type ||
      customFields.program_type ||
      "maintenance"
    ).trim();

    const allowedProgramTypes = [
  "maintenance",
  "reset_14_day"
];

    if (!email) {
      return res.status(400).json({ error: "Missing email" });
    }

    if (!allowedProgramTypes.includes(programType)) {
      return res.status(400).json({
        error: "Invalid program_type"
      });
    }

    const intakePayload = {
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

    console.log("INTAKE UPSERT PAYLOAD:", JSON.stringify(intakePayload, null, 2));

    const { data: intakeData, error: intakeError } = await supabase
      .from("intake_profiles")
      .upsert([intakePayload], { onConflict: "user_id" })
      .select();

    if (intakeError) {
      console.error("SUPABASE INTAKE UPSERT ERROR:", intakeError);
      return res.status(500).json({
        error: "Failed to save intake",
        details: intakeError.message
      });
    }

    // Try to find real numeric user id in users table
    const { data: userRow, error: userLookupError } = await supabase
      .from("users")
      .select("id, email, first_name")
      .ilike("email", email)
      .maybeSingle();

    if (userLookupError) {
      console.error("USER LOOKUP ERROR:", userLookupError);
      return res.status(500).json({
        error: "Intake saved but user lookup failed",
        details: userLookupError.message
      });
    }

    // If no user row exists yet, we still return success for intake
    // but note that program assignment did not happen yet
    if (!userRow) {
      return res.status(200).json({
        success: true,
        profile: intakeData?.[0] || null,
        program_assigned: false,
        message: "Intake saved. No matching user row found yet for program assignment."
      });
    }

    const userId = String(userRow.id);
    const today = new Date().toISOString().split("T")[0];
    const programConfig = getProgramConfig(programType);

    const { error: closeExistingError } = await supabase
      .from("user_programs")
      .update({ status: "completed" })
      .eq("user_id", userId)
      .eq("status", "active");

    if (closeExistingError) {
      console.error("CLOSE EXISTING PROGRAM ERROR:", closeExistingError);
      return res.status(500).json({
        error: "Intake saved but failed to close existing program",
        details: closeExistingError.message
      });
    }

    const programPayload = {
      user_id: userId,
      program_type: programType,
      status: "active",
      start_date: today,
      end_date: programConfig.end_date,
      rollover_program_type: "maintenance",
      support_level: programConfig.support_level
    };

    console.log("PROGRAM INSERT PAYLOAD:", JSON.stringify(programPayload, null, 2));

    const { data: programData, error: programError } = await supabase
      .from("user_programs")
      .insert([programPayload])
      .select();

    if (programError) {
      console.error("PROGRAM INSERT ERROR:", programError);
      return res.status(500).json({
        error: "Intake saved but failed to assign program",
        details: programError.message
      });
    }

    return res.status(200).json({
      success: true,
      profile: intakeData?.[0] || null,
      program_assigned: true,
      program: programData?.[0] || null
    });
  } catch (error) {
    console.error("SAVE INTAKE SERVER ERROR:", error);
    return res.status(500).json({
      error: "Internal server error",
      details: error.message || "Unknown error"
    });
  }
}