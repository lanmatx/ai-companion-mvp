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

    // ===== LOAD MEMORY =====
    let recentMemoryContext = "No recent notes.";

    try {
      const { data: notes } = await supabase
        .from('progress_logs')
        .select('entry_date, entry_type, entry_text')
        .eq('user_id', USER_ID)
        .order('created_at', { ascending: false })
        .limit(5);

      if (notes && notes.length > 0) {
        recentMemoryContext = notes.map((n, i) => {
          const date = n.entry_date || "No date";
          return `${i + 1}. [${date}] ${n.entry_type}: ${n.entry_text}`;
        }).join('\n');
      }
    } catch (err) {
      console.error("MEMORY ERROR:", err);
    }

    const systemPrompt = `
You are Neville, a personalized AI Health Companion for Living Longevity.

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
- predict timelines ("lose X pounds in X days")
- promise outcomes

If asked:
→ explain each body is different  
→ redirect to small steps  
→ focus on next 10 minutes  

-----------------------------------
RESPONSE RULES
-----------------------------------

- 2–5 sentences max
- ONE next step only
- calm, human tone
- no pressure
- no overwhelm

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

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": \`Bearer \${process.env.OPENAI_API_KEY}\`
      },
      body: JSON.stringify({
        model: "gpt-5.4",
        instructions: systemPrompt,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: \`CLIENT CONTEXT:
\${loriContext}

RECENT MEMORY:
\${recentMemoryContext}

USER MESSAGE:
\${message}\`
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

    // ===== SAVE CHAT =====
    try {
      await supabase.from('progress_logs').insert([
        {
          user_id: USER_ID,
          entry_type: 'user',
          entry_text: message
        },
        {
          user_id: USER_ID,
          entry_type: 'neville',
          entry_text: reply
        }
      ]);
    } catch (logError) {
      console.error("LOGGING ERROR:", logError);
    }

    return res.status(200).json({ reply });

  } catch (error) {
    console.error("SERVER ERROR:", error);
    return res.status(500).json({
      error: "Server error",
      details: error.message || "Unknown error"
    });
  }
}