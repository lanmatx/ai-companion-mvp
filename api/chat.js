import { createClient } from '@supabase/supabase-js';

function extractMemoryCandidates(message) {
  const text = (message || "").trim();
  if (!text) return [];

  const patterns = [
    /i struggle with .+/i,
    /i struggle at .+/i,
    /i have trouble .+/i,
    /i crave .+/i,
    /i tend to .+/i,
    /i usually .+/i,
    /i often .+/i,
    /i prefer .+/i,
    /i like .+/i,
    /i don't like .+/i,
    /i do not like .+/i,
    /my hardest time is .+/i,
    /evenings are hard for me/i,
    /nights are hard for me/i,
    /after dinner .+/i,
    /stress makes me .+/i
  ];

  const matches = patterns
    .filter((pattern) => pattern.test(text))
    .map(() => text)
    .slice(0, 1);

  return [...new Set(matches)];
}

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
    const message = (body.message || "").trim();

    let USER_ID = String(body.user_id || "").trim();
    const memoryCandidates = extractMemoryCandidates(message);

    if (!USER_ID && body.email) {
      USER_ID = String(body.email).trim();
    }

    if (!USER_ID) {
      return res.status(400).json({ error: "Missing user_id" });
    }

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    let firstName = (body.first_name || "").trim();
    let companionName = (body.companion_name || "").trim();
    let recentMemoryContext = "No recent notes.";
    let intakeProfileContext = "No intake profile available yet.";

    let primaryGoal = "";
    let biggestChallenge = "";
    let preferredCoachingTone = "";
    let movementPreference = "";
    let foodPreference = "";
    let mainCravingPattern = "";
    let timezone = "";
    let intakeSummary = "";

    // Load intake profile first
    const { data: intakeRow, error: intakeError } = await supabase
      .from("intake_profiles")
      .select(`
        user_id,
        email,
        first_name,
        companion_name,
        timezone,
        primary_goal,
        biggest_challenge,
        preferred_coaching_tone,
        movement_preference,
        food_preference,
        main_craving_pattern,
        intake_summary
      `)
      .eq("user_id", USER_ID)
      .maybeSingle();

    if (intakeError) {
      console.error("INTAKE LOOKUP ERROR:", intakeError);
    } else if (intakeRow) {
      firstName = intakeRow.first_name || firstName;
      companionName = intakeRow.companion_name || companionName;

      primaryGoal = intakeRow.primary_goal || "";
      biggestChallenge = intakeRow.biggest_challenge || "";
      preferredCoachingTone = intakeRow.preferred_coaching_tone || "";
      movementPreference = intakeRow.movement_preference || "";
      foodPreference = intakeRow.food_preference || "";
      mainCravingPattern = intakeRow.main_craving_pattern || "";
      timezone = intakeRow.timezone || "";
      intakeSummary = intakeRow.intake_summary || "";

      const intakeBits = [
        primaryGoal ? `Primary goal: ${primaryGoal}` : "",
        biggestChallenge ? `Biggest challenge: ${biggestChallenge}` : "",
        preferredCoachingTone ? `Preferred coaching tone: ${preferredCoachingTone}` : "",
        movementPreference ? `Movement preference: ${movementPreference}` : "",
        foodPreference ? `Food preference: ${foodPreference}` : "",
        mainCravingPattern ? `Main craving pattern: ${mainCravingPattern}` : "",
        timezone ? `Timezone: ${timezone}` : "",
        intakeSummary ? `Intake summary: ${intakeSummary}` : ""
      ].filter(Boolean);

      if (intakeBits.length > 0) {
        intakeProfileContext = intakeBits.join("\n");
      }
    }

    // Fallback to users table if needed
    if (!firstName || !companionName) {
      if (USER_ID.includes("@")) {
        const { data: userRow, error: userError } = await supabase
          .from("users")
          .select("id, first_name, email, companion_name")
          .ilike("email", USER_ID)
          .maybeSingle();

        if (userError) {
          console.error("USER LOOKUP BY EMAIL ERROR:", userError);
        } else if (userRow) {
          USER_ID = String(userRow.id);
          firstName = firstName || userRow.first_name || "";
          companionName = companionName || userRow.companion_name || "";
        }
      } else {
        const numericUserId = Number(USER_ID);

        if (!Number.isNaN(numericUserId)) {
          const { data: userRow, error: userError } = await supabase
            .from("users")
            .select("id, first_name, email, companion_name")
            .eq("id", numericUserId)
            .maybeSingle();

          if (userError) {
            console.error("USER LOOKUP BY ID ERROR:", userError);
          } else if (userRow) {
            USER_ID = String(userRow.id);
            firstName = firstName || userRow.first_name || "";
            companionName = companionName || userRow.companion_name || "";
          }
        }
      }
    }

    if (!firstName) {
      firstName = "there";
    }

    if (!companionName) {
      companionName = "your companion";
    }

    const { data: recentNotes, error: notesError } = await supabase
      .from("progress_logs")
      .select("entry_type, entry_text, entry_date, created_at")
      .eq("user_id", USER_ID)
      .in("entry_type", ["struggle", "win", "milestone"])
      .order("created_at", { ascending: false })
      .limit(5);

    if (notesError) {
      console.error("MEMORY LOOKUP ERROR:", notesError);
    } else if (recentNotes && recentNotes.length > 0) {
      recentMemoryContext = recentNotes
        .map((note) => {
          const date = note.entry_date || "";
          return `- ${date} [${note.entry_type}] ${note.entry_text}`;
        })
        .join("\n");
    }

    console.log("MEMORY CANDIDATES:", memoryCandidates);
    console.log("USER_ID BEFORE MEMORY SAVE:", USER_ID, typeof USER_ID);

    // ===== SAVE NEW MEMORY =====
    try {
      if (memoryCandidates.length > 0) {
        for (const memoryText of memoryCandidates) {
          const cleanedMemory = memoryText.trim().toLowerCase();

          const { data: existingMemories, error: existingError } = await supabase
            .from("user_memory")
            .select("memory_text")
            .eq("user_id", USER_ID)
            .order("created_at", { ascending: false })
            .limit(10);

          if (existingError) {
            console.error("MEMORY DUPLICATE CHECK ERROR:", existingError);
            continue;
          }

          const isDuplicate = (existingMemories || []).some(
            (m) => (m.memory_text || "").trim().toLowerCase() === cleanedMemory
          );

          if (!isDuplicate) {
            const { error: insertError } = await supabase
              .from("user_memory")
              .insert([
                {
                  user_id: USER_ID,
                  memory_text: memoryText,
                  source: "chat"
                }
              ]);

            if (insertError) {
              console.error("MEMORY INSERT ERROR:", insertError);
            } else {
              console.log("MEMORY SAVED:", memoryText);
            }
          }
        }
      }
    } catch (memorySaveError) {
      console.error("MEMORY SAVE BLOCK ERROR:", memorySaveError);
    }

    const systemPrompt = `
You are ${companionName}, a personalized AI Health Companion for Living Longevity.

Your role is to support the user in real-life moments by helping them make better decisions without pressure, shame, or overwhelm.

You are warm, calm, practical, and encouraging.
You are not clinical, not robotic, not judgmental, and never overwhelming.

-----------------------------------
CORE ROLE
-----------------------------------

Help the user:
- stay steady in real life
- reduce decision fatigue
- interrupt all-or-nothing thinking
- redirect cravings and impulses
- reinforce small wins
- build consistency over time

You are NOT:
- a doctor
- a rule enforcer
- a meal plan generator
- a calorie counter

You ARE:
- a steady companion in the moment
- a guide for the next small decision

-----------------------------------
CORE PHILOSOPHY
-----------------------------------

- Health is maintenance, not repair
- Consistency matters more than perfection
- Small repeatable actions beat big intentions
- Default choices reduce friction
- Cravings are patterns, not failures
- Replacement works better than restriction
- Real life matters; advice must fit real life
- The goal is decision support, not rigid rules

-----------------------------------
RESPONSE STRUCTURE
-----------------------------------

In most cases, follow this flow:

1. Recognize
Acknowledge what the user is experiencing

2. Interpret
Name what matters in this moment

3. Guide
Give ONE simple, practical next step

4. Reinforce
Close with calm encouragement and reduce pressure

-----------------------------------
RESPONSE RULES
-----------------------------------

- Keep responses to 2–5 sentences
- Give ONE main next step only
- Do not overwhelm the user
- Avoid long lists unless directly asked
- Avoid clinical or technical language
- Avoid sounding like an expert or authority
- Never shame, judge, or pressure
- Never require rigid compliance

Do NOT:
- diagnose
- prescribe medication
- enforce strict protocols
- present “perfect” plans

-----------------------------------
TONE
-----------------------------------

Sound like:
- calm
- steady
- reassuring
- practical
- human

Use language like:
- “That makes sense”
- “That’s okay”
- “Let’s keep this simple”
- “We’re just focusing on the next step”
- “You don’t need to get this perfect”
- “There are options here”

-----------------------------------
PRIMARY FUNCTIONS
-----------------------------------

You support the user in:

1. Craving moments
→ interrupt and redirect

2. Daily food decisions
→ help with simple, practical choices

3. Emotional dips
→ reduce overwhelm and shrink the problem

4. Wins
→ reinforce what worked and why

5. Reflection
→ help reset without guilt

-----------------------------------
PERSONALIZATION PRINCIPLES
-----------------------------------

Always adapt to the user.

Do not impose a fixed system.

Help the user:
- work with their real schedule
- respond to their real hunger signals
- make decisions that fit their life

-----------------------------------
EARLY CONVERSATION PRIORITY
-----------------------------------

In the first few interactions, gently learn the user’s preferences in a natural, conversational way.

Prioritize learning:
- preferred foods or flavors
- hardest times of day
- common craving moments
- preferred support style or coaching tone
- any important avoidances or sensitivities

Do this gradually, not like an interrogation.

Ask at most 1–2 short preference questions at a time, and only when it feels natural.

When the user is new, your first reply should:
- feel warm and personal
- reinforce that support will be tailored to them
- reflect their goal or challenge if known
- invite a short response about their preferences

Avoid generic “How can I help?” openings when more useful preference-gathering would serve better.

If the user’s primary goal is known, naturally anchor support to that goal.
If the user’s biggest challenge is known, acknowledge it in a calm, non-dramatic way.
If the user’s preferred coaching tone is known, match it.

-----------------------------------
SUBTLE EDUCATION
-----------------------------------

When appropriate, gently introduce simple health principles tied to the user’s current situation.

Do this:
- briefly (1–2 sentences)
- naturally within the response
- as an observation, not a rule

Use soft language such as:
- may
- can
- your body may be signaling

Do NOT:
- lecture
- explain too much
- impose strict rules
- sound dogmatic

-----------------------------------
PRIORITIES
-----------------------------------

1. Reduce pressure and shame
2. Interrupt all-or-nothing thinking
3. Offer one useful next step
4. Lightly educate if appropriate
5. Reinforce agency and continuity
`;

    const clientContext = `
Client first name: ${firstName}
Companion name: ${companionName}

KNOWN HIGH-PRIORITY CONTEXT:
Primary goal: ${primaryGoal || "Not specified"}
Biggest challenge: ${biggestChallenge || "Not specified"}
Preferred coaching tone: ${preferredCoachingTone || "Not specified"}

INTAKE PROFILE:
${intakeProfileContext}

RECENT MEMORY:
${recentMemoryContext}
`;

    console.log("USER:", message);
    console.log("USER_ID:", USER_ID);
    console.log("FIRST_NAME:", firstName);
    console.log("COMPANION_NAME:", companionName);

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        instructions: systemPrompt,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `CLIENT CONTEXT:
${clientContext}

USER MESSAGE:
${message}`
              }
            ]
          }
        ]
      })
    });

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      console.error("OPENAI ERROR:", JSON.stringify(data, null, 2));
      return res.status(openaiResponse.status).json({
        error: "OpenAI request failed",
        details: data
      });
    }

    const reply =
      data.output_text ||
      data.output?.[0]?.content?.[0]?.text ||
      `I’m here with you, ${firstName}. To support you in a way that fits you, tell me what usually feels hardest — food choices, cravings, energy, or consistency?`;

    try {
      const lowerMsg = message.toLowerCase();
      let entry_type = null;

      if (
        lowerMsg.includes("tempt") ||
        lowerMsg.includes("craving") ||
        lowerMsg.includes("urge") ||
        lowerMsg.includes("want sweet") ||
        lowerMsg.includes("want sugar")
      ) {
        entry_type = "struggle";
      } else if (
        lowerMsg.includes("did well") ||
        lowerMsg.includes("resisted") ||
        lowerMsg.includes("paused") ||
        lowerMsg.includes("stayed consistent") ||
        lowerMsg.includes("walked") ||
        lowerMsg.includes("said no") ||
        lowerMsg.includes("chose better")
      ) {
        entry_type = "win";
      }

      if (entry_type) {
        const { error: logError } = await supabase
          .from("progress_logs")
          .insert([
            {
              user_id: USER_ID,
              entry_type,
              entry_text: message,
              entry_date: new Date().toISOString().split("T")[0]
            }
          ]);

        if (logError) {
          console.error("AUTO LOG INSERT ERROR:", logError);
        } else {
          console.log("AUTO LOG SUCCESS");
        }
      }
    } catch (autoLogError) {
      console.error("AUTO LOG ERROR:", autoLogError);
    }

    return res.status(200).json({
      reply,
      first_name: firstName,
      companion_name: companionName
    });
  } catch (error) {
    console.error("SERVER ERROR:", error);
    return res.status(500).json({
      error: "Server error",
      details: error.message || "Unknown error"
    });
  }
}