/**
 * Server-only: generate "Why you two should connect" blurbs via Gemini.
 * Requires GEMINI_API_KEY in env.
 */

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

async function callGemini(prompt: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");
  const res = await fetch(`${GEMINI_URL}?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 150, temperature: 0.8 },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${t}`);
  }
  const data = await res.json();
  return (
    data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
    "You two should connect."
  );
}

/**
 * Generate an icebreaker from two archetype payloads and server context (Gemini Pro / Flash).
 * Use when you have archetype_json from onboarding; falls back to summary text if archetype is missing.
 */
export async function generateMatchBlurbFromArchetypes(
  userArchetype: string | Record<string, unknown> | null,
  matchArchetype: string | Record<string, unknown> | null,
  serverIdContext: string
): Promise<string> {
  const format = (v: string | Record<string, unknown> | null): string => {
    if (v == null) return "No profile yet.";
    if (typeof v === "string") {
      try {
        const o = JSON.parse(v) as Record<string, unknown>;
        return JSON.stringify(o).slice(0, 500);
      } catch {
        return v.slice(0, 500);
      }
    }
    return JSON.stringify(v).slice(0, 500);
  };
  const prompt = `Write a single short sentence (under 100 characters) explaining why these two people should connect. Be specific and warm. Server/context: ${serverIdContext}.

Person A (current user) archetype: ${format(userArchetype)}
Person B (match) archetype: ${format(matchArchetype)}

Return only the sentence, no quotes or prefix.`;
  const text = await callGemini(prompt);
  return text.slice(0, 200);
}

export async function generateMatchBlurb(
  currentSummary: string,
  matchSummary: string,
  context: string = "collaboration"
): Promise<string> {
  const prompt = `Write a single short sentence (under 100 characters) explaining why these two people should connect. Be specific and warm. Context: ${context}.

Person A (current user): ${currentSummary || "No summary yet."}
Person B (match): ${matchSummary || "No summary yet."}

Return only the sentence, no quotes or prefix.`;
  const text = await callGemini(prompt);
  return text.slice(0, 200);
}
