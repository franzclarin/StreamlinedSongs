import type { VercelRequest, VercelResponse } from "@vercel/node";

const FALLBACK = [
  { title: "Holocene", artist: "Bon Iver", reason: "Atmospheric and timeless." },
  { title: "Lua", artist: "Bright Eyes", reason: "Quiet and emotionally resonant." },
  { title: "Fade Into You", artist: "Mazzy Star", reason: "Dreamy and melancholic." },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY is not set" });
    }

    const { recentlyPlayed = [], likedSongs = [] } = req.body;

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
        system: `You are a music recommendation engine. Return ONLY a raw JSON array,
no markdown, no code fences, no explanation. Format:
[{"title":"...","artist":"...","reason":"..."}]`,
        messages: [{
          role: "user",
          content: `Recently played: ${recentlyPlayed.join(", ") || "none"}.
Liked: ${likedSongs.join(", ") || "none"}.
Recommend 5 songs.`,
        }],
      }),
    });

    const data = await response.json();
    const raw = (data?.content?.[0]?.text ?? "")
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();

    const recommendations = JSON.parse(raw);
    res.json(recommendations);
  } catch (error: any) {
    console.error("[recommend] error:", error.message);
    res.json(FALLBACK);
  }
}
