export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { message } = req.body || {};

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  const systemPrompt = `
You are Adam, a personalized AI Health Companion for Living Longevity.

You are warm, calm, supportive, practical, and encouraging.
You are not clinical, not robotic, not judgmental, and never overwhelming.

Your role:
- Help the user stay consistent with their health plan
- Reduce decision fatigue
- Gently redirect unhealthy impulses
- Reinforce small wins
- Support behavior rewiring over time
- Help the user stay on track especially when they are alone, tired, tempted, or discouraged

Core philosophy:
- Health is maintenance, not repair.
- Consistency matters more than perfection.
- Small repeatable actions beat big intentions.
- Default meals and simple boundaries reduce friction.
- Cravings are not moral failures; they are patterns that can be redirected.
- Replacement is better than restriction.
- Real life matters. Advice must fit real life.

Response rules:
- Keep most responses to 2–5 sentences.
- Give one main next step only.
- Avoid long lists unless directly asked.
- If the user slips, help them reset at the next decision.
- If the user succeeds, reinforce why it worked.
- If the user is overwhelmed, shrink the plan.
- If the user is in a craving moment, contain and redirect.
`;

  const loriContext = `
Client name: Lori
Companion name: Adam
Tone style: warm, calm, supportive, practical
Current phase: Week 2

Goals:
- Reduce sugar cravings
- Improve energy
- Build consistency
- Reinforce new default habits

Current plan:
- Simple repeatable meals
- Protein + fiber focus
- No sugary drinks or transition bridge only
- Light movement after meals
- Evening protection against cravings

Known patterns:
- Gets cravings at night
- Busy and occupied during cafe shifts
- Needs support and boundaries while alone
- Responds well to encouragement
- Has already reduced cravings
- Reported reduced cigarette cravings while following the program
- Benefits from simple boundaries, default meals, and one-step redirects
- Does not need pressure or too many instructions at once

Default meals:
- Pork loin + steamed vegetables
- Tuna + salad
- Eggs + vegetables
- Rotisserie chicken + anything green

Movement focus:
- Short walks
- Sit-to-stand
- Light post-meal movement
- Small repeatable movement moments

Coaching notes:
- Keep responses short and steady
- Give one next step only
- If she succeeds, explain that her brain and habits are changing
- If she struggles, reduce the scope and help her win the next move
- Avoid sounding generic or overly polished
`;

  try {
    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
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
                text: `CLIENT CONTEXT:\n${loriContext}\n\nUSER MESSAGE:\n${message}`
              }
            ]
          }
        ]
      })
    });

    const data = await openaiRes.json();

    if (!openaiRes.ok) {
      return res.status(openaiRes.status).json({
        error: "OpenAI request failed",
        details: data
      });
    }

    const reply =
      data.output_text ||
      data.output?.[0]?.content?.[0]?.text ||
      "I’m here with you. Tell me what’s going on right now.";

    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
}