import { createRequire } from 'module'
const require = createRequire(import.meta.url)
require('dotenv').config({ path: '.env.local' })
require('dotenv').config()

import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors())
app.use(express.json({ limit: '1mb' }))

const VOICE_ID = 'onwK4e9ZLuTAKqWW03F9' // Daniel — Steady Broadcaster

const NARRATE_SYSTEM = `You are Sterling, a sharp and cinematic music guide for StreamlinedSongs. \
When given a song, speak directly to the listener as if introducing it on a late-night radio show. \
Generate exactly 4 paragraphs (150-200 words total):
1) What this song feels like emotionally and sonically
2) The story or themes behind it
3) A vivid scene of when/where to listen to this song
4) One striking detail about the artist or recording that makes it special.
Write in second person. Be specific and evocative. Pure flowing prose only.`

// ── POST /api/narrate ─────────────────────────────────────────────────────────
app.post('/api/narrate', async (req, res) => {
  const { title = '', artist = '', duration, genre } = req.body ?? {}
  if (!title || !artist) return res.status(400).json({ error: 'title and artist are required' })
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' })

  try {
    const userMsg = [`Song: "${title}" by ${artist}`, genre && `Genre: ${genre}`, duration && `Duration: ${duration}`]
      .filter(Boolean).join(', ')

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: NARRATE_SYSTEM,
        messages: [{ role: 'user', content: userMsg }],
      }),
    })

    const bodyText = await response.text()
    if (!response.ok) {
      let errMsg = `Claude error ${response.status}`
      try { errMsg = JSON.parse(bodyText)?.error?.message || errMsg } catch { /* ignore */ }
      return res.status(response.status).json({ error: errMsg })
    }

    let data
    try { data = JSON.parse(bodyText) } catch {
      return res.status(500).json({ error: `Claude returned invalid JSON: ${bodyText.slice(0, 100)}` })
    }
    if (!data.content?.[0]?.text) {
      return res.status(500).json({ error: 'Claude returned no text content' })
    }
    return res.json({ narration: data.content[0].text.trim() })
  } catch (err) {
    console.error('[narrate]', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// ── POST /api/speak ───────────────────────────────────────────────────────────
app.post('/api/speak', async (req, res) => {
  const { text = '' } = req.body ?? {}
  if (!text) return res.status(400).json({ error: 'text is required' })
  if (!process.env.ELEVENLABS_API_KEY) return res.status(503).json({ error: 'ELEVENLABS_API_KEY not configured' })

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.8,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    })

    if (!response.ok) {
      const msg = await response.text()
      return res.status(response.status).json({ error: msg })
    }

    res.set('Content-Type', 'audio/mpeg')
    res.set('Cache-Control', 'no-store')
    const buffer = await response.arrayBuffer()
    return res.send(Buffer.from(buffer))
  } catch (err) {
    console.error('[speak]', err.message)
    return res.status(500).json({ error: err.message })
  }
})

// ── POST /api/recommend ───────────────────────────────────────────────────────
const RECOMMEND_FALLBACK = [
  { title: 'Holocene', artist: 'Bon Iver', reason: 'A timeless atmospheric indie folk track.' },
  { title: 'Lua', artist: 'Bright Eyes', reason: 'Quiet and emotionally resonant.' },
  { title: 'Fade Into You', artist: 'Mazzy Star', reason: 'Dreamy and melancholic.' },
]

app.post('/api/recommend', async (req, res) => {
  const { recentlyPlayed = [], likedSongs = [] } = req.body ?? {}
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' })

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: 'You are a music recommendation engine. Return ONLY a raw JSON array, no markdown, no code fences, no explanation. Format: [{"title":"...","artist":"...","reason":"..."}]',
        messages: [{
          role: 'user',
          content: `Recently played: ${recentlyPlayed.join(', ') || 'none'}. Liked: ${likedSongs.join(', ') || 'none'}. Recommend 5 songs.`,
        }],
      }),
    })

    const bodyText = await response.text()
    if (!response.ok) {
      let errMsg = `Claude error ${response.status}`
      try { errMsg = JSON.parse(bodyText)?.error?.message || errMsg } catch { /* ignore */ }
      return res.status(response.status).json({ error: errMsg })
    }

    let claudeData
    try { claudeData = JSON.parse(bodyText) } catch {
      return res.json(RECOMMEND_FALLBACK)
    }

    const rawText = (claudeData.content?.[0]?.text || '')
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim()

    try {
      return res.json(JSON.parse(rawText))
    } catch {
      return res.json(RECOMMEND_FALLBACK)
    }
  } catch (err) {
    console.error('[recommend]', err.message)
    return res.json(RECOMMEND_FALLBACK)
  }
})

// ── Malformed body error handler ──────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed' || err.status === 400) {
    return res.status(400).json({ error: 'Invalid or empty request body' })
  }
  console.error('[unhandled]', err.message)
  res.status(500).json({ error: err.message || 'Internal server error' })
})

// ── Startup checks ────────────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason)
})

const PORT = 3001
const server = app.listen(PORT, () => {
  const missing = ['ANTHROPIC_API_KEY', 'ELEVENLABS_API_KEY'].filter(k => !process.env[k])
  console.log(`\n  StreamlinedSongs API  →  http://localhost:${PORT}`)
  if (missing.length) {
    console.warn(`  WARNING: missing env vars: ${missing.join(', ')}`)
  } else {
    console.log('  ENV: all API keys loaded')
  }
  console.log()
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ERROR: port ${PORT} is already in use.`)
    console.error(`  Kill the old process first, then restart.\n`)
  } else {
    console.error('[server error]', err.message)
  }
  process.exit(1)
})
