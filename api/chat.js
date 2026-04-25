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

    let activeProgramType = "maintenance";
    let activeProgramStatus = "active";
    let activeProgramStartDate = "";
    let activeProgramEndDate = "";
    let rolloverProgramType = "maintenance";
    let supportLevel = "maintenance";
    let programContext = "Program: Maintenance mode. Focus on long-term consistency and steady support.";

    // ===== LOAD INTAKE PROFILE =====
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

    // ===== FALLBACK TO USERS TABLE =====
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

    // ===== LOAD ACTIVE PROGRAM =====
    try {
      const today = new Date().toISOString().split("T")[0];

      const { data: activeProgramRow, error: activeProgramError } = await supabase
        .from("user_programs")
        .select(`
          id,
          program_type,
          status,
          start_date,
          end_date,
          rollover_program_type,
          support_level
        `)
        .eq("user_id", USER_ID)
        .eq("status", "active")
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeProgramError) {
        console.error("ACTIVE PROGRAM LOOKUP ERROR:", activeProgramError);
      } else if (activeProgramRow) {
        let resolvedProgram = activeProgramRow;

        const isExpiredReset =
          resolvedProgram.program_type === "reset_14_day" &&
          resolvedProgram.end_date &&
          resolvedProgram.end_date < today;

        if (isExpiredReset) {
          const nextProgramType = resolvedProgram.rollover_program_type || "maintenance";

          const { error: completeProgramError } = await supabase
            .from("user_programs")
            .update({ status: "completed" })
            .eq("id", resolvedProgram.id);

          if (completeProgramError) {
            console.error("PROGRAM COMPLETE UPDATE ERROR:", completeProgramError);
          } else {
            const { data: newProgramRows, error: newProgramError } = await supabase
              .from("user_programs")
              .insert([
                {
                  user_id: USER_ID,
                  program_type: nextProgramType,
                  status: "active",
                  start_date: today,
                  end_date: null,
                  rollover_program_type: "maintenance",
                  support_level: "maintenance"
                }
              ])
              .select();

            if (newProgramError) {
              console.error("PROGRAM ROLLOVER INSERT ERROR:", newProgramError);
            } else if (newProgramRows && newProgramRows.length > 0) {
              resolvedProgram = newProgramRows[0];
            }
          }
        }

        activeProgramType = resolvedProgram.program_type || "maintenance";
        activeProgramStatus = resolvedProgram.status || "active";
        activeProgramStartDate = resolvedProgram.start_date || "";
        activeProgramEndDate = resolvedProgram.end_date || "";
        rolloverProgramType = resolvedProgram.rollover_program_type || "maintenance";
        supportLevel = resolvedProgram.support_level || "maintenance";
      }

      if (activeProgramType === "reset_14_day") {
        programContext = `
Program: 14-Day Blood Sugar Reset
Support level: Reset
Phase: Active 14-day reset
Purpose: Help the user create early momentum, reduce decision fatigue, stabilize daily patterns, and build a simple foundation they can maintain.

Week 1 logic:
Theme: Remove friction. Build default meals.
Focus: Help the user simplify food choices, create 3–5 reliable default meals, reduce sugary drinks, protect evenings, and make consistency easier by reducing daily decisions.

Week 2 logic:
Theme: Stabilize food. Introduce movement. Reinforce new cravings.
Focus: Keep food simple, avoid unnecessary variety, add short movement moments, anchor movement after meals, reinforce craving shifts, and help the user lock in the new baseline.

Style:
More structured and proactive than maintenance mode. Clear, simple, practical, and momentum-building. Give direction without pressure. Keep everything doable in real life.

Rollover after end date: Maintenance
`;
      } else {
        programContext = `
Program: Maintenance
Support level: Maintenance
Phase: Ongoing maintenance
Purpose: Help the user protect progress, stay steady in real life, and maintain consistency over time.
Style: Sustainable, calm, supportive, lower intensity, and focused on reinforcing what works.
`;
      }
    } catch (programLoadError) {
      console.error("PROGRAM LOAD BLOCK ERROR:", programLoadError);
    }

    // ===== LOAD MEMORY =====
    const memoryLines = [];

    const { data: recentNotes, error: notesError } = await supabase
      .from("progress_logs")
      .select("entry_type, entry_text, entry_date, created_at")
      .eq("user_id", USER_ID)
      .in("entry_type", ["struggle", "win", "milestone"])
      .order("created_at", { ascending: false })
      .limit(5);

    if (notesError) {
      console.error("PROGRESS LOG MEMORY LOOKUP ERROR:", notesError);
    } else if (recentNotes && recentNotes.length > 0) {
      memoryLines.push(
        ...recentNotes.map((note) => {
          const date = note.entry_date || "";
          return `- ${date} [${note.entry_type}] ${note.entry_text}`;
        })
      );
    }

    const { data: savedMemories, error: savedMemoryError } = await supabase
      .from("user_memory")
      .select("memory_text, created_at")
      .eq("user_id", USER_ID)
      .order("created_at", { ascending: false })
      .limit(5);

    if (savedMemoryError) {
      console.error("USER MEMORY LOOKUP ERROR:", savedMemoryError);
    } else if (savedMemories && savedMemories.length > 0) {
      memoryLines.push(
        ...savedMemories.map((item) => `- [memory] ${item.memory_text}`)
      );
    }

    if (memoryLines.length > 0) {
      recentMemoryContext = memoryLines.join("\n");
    }

    console.log("MEMORY CANDIDATES:", memoryCandidates);
    console.log("USER_ID BEFORE MEMORY SAVE:", USER_ID, typeof USER_ID);
    console.log("ACTIVE PROGRAM TYPE:", activeProgramType);

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
PROGRAM MODE AWARENESS
-----------------------------------

The user may be in one of two modes:
- Maintenance
- 14-Day Blood Sugar Reset

If the user is in Maintenance:
- prioritize sustainability, steadiness, and long-term consistency
- reduce pressure
- reinforce what already works
- help the user maintain progress without overcorrecting

If the user is in 14-Day Blood Sugar Reset:
- create early momentum and a sense of forward motion
- be warmer but more directive than maintenance mode
- reduce decision fatigue
- keep the plan simple and actionable
- help the user recover quickly after slips
- focus on practical daily behaviors that support blood sugar stability
- remind the user this is a 14-day reset phase, not a forever-perfect plan

Week 1 reset logic:
- focus on removing friction
- help the user build 3–5 default meals
- reduce randomness in food choices
- protect the evening window
- reduce or eliminate sugary drinks
- make consistency easier by reducing daily decisions

Week 2 reset logic:
- keep food simple and mostly unchanged
- introduce short movement moments, not workouts
- encourage movement after meals when possible
- reinforce reduced cravings as evidence that the system is working
- help the user lock in the new baseline

A 14-day reset plan should usually include:
- one main focus
- up to three anchor actions
- one craving or trigger strategy
- one recovery rule for imperfect days
- one simple win to aim for

Across all modes:
- do not become clinical
- do not become a strict rule enforcer
- adapt your coaching intensity to the current program mode

-----------------------------------
RESPONSE STRUCTURE
-----------------------------------

In most cases, follow this flow:

1. Recognize
Acknowledge what the user is experiencing

2. Interpret
Name what matters in this moment

3. Guide
Offer ONE small, low-friction next step that feels easy to do right now.

Prefer:
- reducing the intensity of the moment
- creating a pause before acting
- making the next decision easier, not “better”

Examples:
- drink something first
- pause for a minute
- delay the decision slightly
- make a smaller version of the choice

Avoid:
- jumping straight to “better food swaps”
- giving ideal or optimized choices
- sounding like a nutrition coach

The goal is not to optimize the decision.
The goal is to make the moment easier to handle.

4. Reinforce
Close in a way that reduces pressure and keeps the user grounded.

Prefer:
- “You’re not off track”
- “This is just one moment”
- “We can keep this small”
- “I’m with you”

Avoid:
- hype or cheerleading
- “You’ve got this”
- “You can do it”
- anything that feels like a slogan

-----------------------------------
RESPONSE RULES
-----------------------------------

- Keep responses to 2–5 sentences unless the user is clearly asking for a plan, review, or reset structure
- Give ONE main next step only unless the user asks for a plan
- Do not overwhelm the user
- Avoid long lists unless directly asked or creating a short reset plan
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
- “I’m with you”
- “Let’s just make this next decision easier”
- “This is one moment, not the whole day”
- “We can steady this without overthinking it”
- “You’re not off track — you’re just in a moment”

-----------------------------------
RELATIONAL TONE
-----------------------------------

Sound like a steady companion, not a helpful assistant.

That means:
- slightly less instructional
- slightly more emotionally grounded
- slightly more “with the user” in the moment

Prefer:
- “Let’s steady this”
- “Let’s make this easier”
- “We can keep this small”
- “You’re not off track”

Avoid sounding like:
- a productivity coach
- a nutrition expert
- a customer support bot

The user should feel accompanied, not managed.

In reset mode, you may be slightly more assertive and more organized, but you should still feel warm, grounded, and supportive.

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

6. Reset planning
→ when appropriate, help the user create a short 14-day reset plan that builds momentum without overwhelm

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
MEMORY AWARENESS
-----------------------------------

You may occasionally reference known user patterns when it feels natural and helpful.

Examples:
- “Evenings tend to be harder for you…”
- “You’ve mentioned cravings after dinner before…”
- “This seems like one of those moments you’ve run into before…”

Guidelines:
- Use memory subtly, not every time
- Do not repeat the same phrasing
- Do not sound like you are tracking or monitoring the user
- Keep it natural, light, and supportive
- Only reference memory when it genuinely helps the current moment feel easier

The goal is to make the user feel understood — not analyzed.

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

ACTIVE PROGRAM:
Type: ${activeProgramType}
Status: ${activeProgramStatus}
Start date: ${activeProgramStartDate || "Not specified"}
End date: ${activeProgramEndDate || "Ongoing"}
Rollover program: ${rolloverProgramType || "maintenance"}
Support level: ${supportLevel || "maintenance"}

PROGRAM DETAILS:
${programContext}

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

    const defaultReplyByProgram =
      activeProgramType === "reset_14_day"
        ? `Hi ${firstName} — welcome to your 14-Day Blood Sugar Reset. This phase is about creating early momentum, reducing decision fatigue, and building simple patterns that fit real life. To get us started, what tends to throw you off most right now — cravings, meals, evenings, energy dips, or consistency?`
        : `I’m here with you, ${firstName}. To support you in a way that fits you, tell me what usually feels hardest — food choices, cravings, energy, or consistency?`;

    const reply =
      data.output_text ||
      data.output?.[0]?.content?.[0]?.text ||
      defaultReplyByProgram;

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