# StreamlinedSongs

A sleek, AI-powered music player built with React and deployed on Vercel. Add songs to your queue, get personalized recommendations, and hear cinematic narrations for every track — voiced by a text-to-speech broadcaster.

## Features

- **Queue management** — Add, reorder (drag-and-drop), and remove songs. Songs persist across sessions via localStorage.
- **AI recommendations** — Claude analyzes your recently played and liked songs and suggests 5 new tracks tailored to your taste.
- **AI narration** — "Sterling", a cinematic radio-host persona powered by Claude, generates a 4-paragraph narration for any song: the emotional feel, the story behind it, a vivid listening scene, and a striking artist detail.
- **Text-to-speech** — Narrations are spoken aloud via ElevenLabs (Daniel voice) at the click of a button.
- **Curated playlists** — Six hand-picked playlists (Late Night Drive, High Energy, Sunday Morning, Indie Classics, Cinematic, 90s Alt Rock) you can load instantly.
- **Trending songs** — A quick-add panel of currently trending tracks.
- **Liked songs** — Heart any song to save it; liked songs influence AI recommendations.
- **Animated waveform** — A 40-bar sinusoidal waveform animates while a song is playing.
- **Per-song gradients** — Each song card gets a unique color gradient derived from its title and artist.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Tailwind CSS |
| Drag-and-drop | @dnd-kit |
| Backend (serverless) | Vercel Functions (TypeScript) |
| AI narration & recommendations | Anthropic Claude (`claude-sonnet-4-20250514`) |
| Text-to-speech | ElevenLabs Turbo v2.5 |
| Deployment | Vercel |

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/recommend` | POST | Returns 5 AI song recommendations based on listening history |
| `/api/narrate` | POST | Generates a cinematic narration for a given song |
| `/api/speak` | POST | Converts narration text to an MP3 audio stream via ElevenLabs |

## Getting Started

### Prerequisites

- Node.js 18+
- [Vercel CLI](https://vercel.com/docs/cli): `npm i -g vercel`
- An [Anthropic API key](https://console.anthropic.com/)
- An [ElevenLabs API key](https://elevenlabs.io/) (for TTS)

### Setup

1. Clone the repo and install dependencies:

```bash
git clone https://github.com/your-username/StreamlinedSongs.git
cd StreamlinedSongs
npm install
```

2. Create a `.env` file at the project root:

```env
ANTHROPIC_API_KEY=your_anthropic_key_here
ELEVENLABS_API_KEY=your_elevenlabs_key_here
```

3. Start the dev server (runs both Vite and Vercel Functions locally):

```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000).

### Build & Deploy

```bash
npm run build   # Vite production build → dist/
vercel --prod   # Deploy to Vercel
```

Set `ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY` as environment variables in your Vercel project settings.
