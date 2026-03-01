/**
 * Server-only: generate "Why you two should connect" blurb via Gemini.
 * Requires GEMINI_API_KEY in env.
 */

export async function generateMatchBlurb(
  currentSummary: string,
  matchSummary: string,
  context: string = "collaboration"
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const prompt = `Write a single short sentence (under 100 characters) explaining why these two people should connect. Be specific and warm. Context: ${context}.

Person A (current user): ${currentSummary || "No summary yet."}
Person B (match): ${matchSummary || "No summary yet."}

Return only the sentence, no quotes or prefix.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 150, temperature: 0.8 },
      }),
    }
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${t}`);
  }
  const data = await res.json();
  const text =
    data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
    "You two should connect.";
  return text.slice(0, 200);
}
