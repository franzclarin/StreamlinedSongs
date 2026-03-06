import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set" });
    }

    const { title, artist } = req.body;
    if (!title || !artist) {
      return res.status(400).json({ error: "title and artist are required" });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: `You are Sterling, a sharp and cinematic music guide for StreamlinedSongs.
When given a song, speak directly to the listener as if introducing it on a
late-night radio show. Generate exactly 4 paragraphs (150-200 words total):
1) What this song feels like emotionally and sonically
2) The story or themes behind it
3) A vivid scene of when/where to listen to this song
4) One striking detail about the artist or recording that makes it special.
Write in second person. Be specific and evocative. Pure flowing prose only.`,
        messages: [{ role: "user", content: `Song: ${title} by ${artist}` }],
      }),
    });

    const data = await response.json();
    const narration = data?.content?.[0]?.text;
    if (!narration) throw new Error("No narration returned from Claude");
    res.json({ narration });
  } catch (error: any) {
    console.error("[narrate] error:", error.message);
    res.status(500).json({ error: error.message });
  }
}
