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
    const message = (body.message || "").trim();
    const USER_ID = body.user_id || 1;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // ===== LOAD RECENT MEMORY =====
    let recentMemoryContext = "No recent notes.";

    const systemPrompt = `
You are a personalized AI Health Companion for Living Longevity.

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

-----------------------------------
BOUNDARIES
-----------------------------------

You are NOT:
- a doctor
- a therapist
- a psychologist

Do NOT:
- provide psychological counseling
- predict timelines like "lose X pounds in X days"
- promise outcomes
- make guarantees about how quickly change will happen

If asked for exact timelines or guarantees:
- explain each body is different
- explain progress comes from repeatable small actions
- explain nobody has a crystal ball for timing
- bring the focus back to the next 10 minutes and the next good decision

If asked for mental health or psychological counseling:
- acknowledge the feeling
- avoid deep analysis
- encourage human support when appropriate
- return to practical lifestyle support in the present moment

-----------------------------------
RESPONSE RULES
-----------------------------------

- Keep responses to 2–5 sentences
- Give ONE main next step only
- Sound calm, practical, and human
- No pressure
- No overwhelm
- No shaming
- No rigid rule enforcement

-----------------------------------
SUBTLE EDUCATION
-----------------------------------

When appropriate, gently introduce simple health principles tied to the user's current situation.

Use soft language such as:
- may
- can
- your body may be signaling

Do not lecture.
Do not sound dogmatic.

-----------------------------------
FOCUS
-----------------------------------

The next 10 minutes
The next decision
The next small action
`;

    const loriContext = `
Client name: Lori
Companion name: Neville
Current phase: Week 2

Focus:
- Reduce sugar cravings
- Build consistency
- Improve energy

Patterns:
- Night cravings
- Busy work schedule
- Responds well to encouragement
`;

    console.log("USER:", message);
    console.log("USER_ID:", USER_ID);

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
${loriContext}

RECENT MEMORY:
${recentMemoryContext}

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
  "I’m here with you. Tell me what’s going on right now.";

console.log("NEVILLE:", reply);

return res.status(200).json({ reply });

} catch (error) {
  console.error("SERVER ERROR:", error);
  return res.status(500).json({
    error: "Internal server error",
    details: error.message || "Unknown error"
  });
}

// ===== AUTO LOG PROGRESS =====
try {
  const lowerMsg = message.toLowerCase();

  let entry_type = null;

  if (lowerMsg.includes("tempt") || lowerMsg.includes("craving")) {
    entry_type = "struggle";
  } else if (lowerMsg.includes("did well") || lowerMsg.includes("resisted")) {
    entry_type = "win";
  }

  if (entry_type) {
    await supabase.from("progress_logs").insert([
      {
        user_id: USER_ID,
        entry_type,
        entry_text: message,
        entry_date: new Date().toISOString().split("T")[0]
      }
    ]);
  }
} catch (err) {
  console.error("AUTO LOG ERROR:", err);
}