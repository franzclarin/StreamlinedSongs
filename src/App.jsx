import { useReducer, useEffect, useRef, useState, useCallback } from 'react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function hashStr(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i)
  return h >>> 0
}

function songColors(title = '', artist = '') {
  const seed = hashStr((title + artist).toLowerCase())
  const h1 = seed % 360
  const h2 = (h1 + 75 + (seed >> 4) % 70) % 360
  const h3 = (h2 + 50 + (seed >> 8) % 50) % 360
  return { h1, h2, h3 }
}

function songGradient(title, artist) {
  const { h1, h2, h3 } = songColors(title, artist)
  return `linear-gradient(135deg, hsl(${h1},55%,18%) 0%, hsl(${h2},60%,12%) 55%, hsl(${h3},45%,7%) 100%)`
}

function fmtTime(secs) {
  if (!secs || isNaN(secs)) return '0:00'
  const s = Math.floor(secs)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function uid() { return Math.random().toString(36).slice(2, 9) }
function fakeDuration() { return 180 + Math.floor(Math.random() * 120) }

async function safeJson(res) {
  const text = await res.text()
  if (!text || !text.trim()) {
    if (res.status === 503 || res.status === 502) {
      throw new Error('API server is not running. Start it with: npm run dev:server')
    }
    throw new Error(`Server returned status ${res.status} with no body`)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Unexpected server response (status ${res.status}): ${text.slice(0, 200)}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Waveform constants — 40 bars, sinusoidal height distribution
// ─────────────────────────────────────────────────────────────────────────────

const BAR_COUNT = 40

const SINE_HEIGHTS = Array.from({ length: BAR_COUNT }, (_, i) => {
  const t = i / (BAR_COUNT - 1)
  const base = Math.sin(t * Math.PI)
  const ripple = 0.28 * Math.sin(t * Math.PI * 3 + 0.6)
  return Math.max(5, Math.round(7 + 27 * (base + ripple)))
})

const WAVE_DURS = Array.from({ length: BAR_COUNT }, (_, i) =>
  ((0.28 + ((i * 137 + 31) % 100) / 220)).toFixed(2)
)

const WAVE_DELAYS = Array.from({ length: BAR_COUNT }, (_, i) =>
  ((i * 79 + 17) % 100 / 900).toFixed(3)
)

// ─────────────────────────────────────────────────────────────────────────────
// Curated playlists & trending data
// ─────────────────────────────────────────────────────────────────────────────

const CURATED_PLAYLISTS = [
  {
    id: 'late-night', emoji: '🌙', title: 'Late Night Drive',
    gradient: 'linear-gradient(135deg, #b45309 0%, #ea580c 100%)',
    songs: [
      { title: 'Motion Picture Soundtrack', artist: 'Radiohead' },
      { title: 'Holocene', artist: 'Bon Iver' },
      { title: 'Video Games', artist: 'Lana Del Rey' },
      { title: 'Lua', artist: 'Bright Eyes' },
      { title: 'Re: Stacks', artist: 'Bon Iver' },
    ],
  },
  {
    id: 'high-energy', emoji: '🔥', title: 'High Energy',
    gradient: 'linear-gradient(135deg, #dc2626 0%, #db2777 100%)',
    songs: [
      { title: 'HUMBLE.', artist: 'Kendrick Lamar' },
      { title: 'Lose Yourself', artist: 'Eminem' },
      { title: 'Stronger', artist: 'Kanye West' },
      { title: 'Power', artist: 'Kanye West' },
      { title: 'DNA.', artist: 'Kendrick Lamar' },
    ],
  },
  {
    id: 'sunday', emoji: '🌿', title: 'Sunday Morning',
    gradient: 'linear-gradient(135deg, #16a34a 0%, #0d9488 100%)',
    songs: [
      { title: 'Banana Pancakes', artist: 'Jack Johnson' },
      { title: 'Better Together', artist: 'Jack Johnson' },
      { title: 'Flightless Bird', artist: 'Iron & Wine' },
      { title: 'Such Great Heights', artist: 'Postal Service' },
      { title: 'The District Sleeps Alone Tonight', artist: 'Postal Service' },
    ],
  },
  {
    id: 'indie', emoji: '💫', title: 'Indie Classics',
    gradient: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
    songs: [
      { title: 'Rebellion (Lies)', artist: 'Arcade Fire' },
      { title: 'Dog Days Are Over', artist: 'Florence' },
      { title: 'Little Lion Man', artist: 'Mumford & Sons' },
      { title: 'Ho Hey', artist: 'Lumineers' },
      { title: 'Home', artist: 'Edward Sharpe' },
    ],
  },
  {
    id: 'cinematic', emoji: '🎹', title: 'Cinematic',
    gradient: 'linear-gradient(135deg, #475569 0%, #94a3b8 100%)',
    songs: [
      { title: "Comptine d'un autre été", artist: 'Yann Tiersen' },
      { title: 'Experience', artist: 'Ludovico Einaudi' },
      { title: 'Nuvole Bianche', artist: 'Ludovico Einaudi' },
      { title: 'River Flows in You', artist: 'Yiruma' },
      { title: 'Clair de Lune', artist: 'Debussy' },
    ],
  },
  {
    id: 'alt-rock', emoji: '🎸', title: '90s Alt Rock',
    gradient: 'linear-gradient(135deg, #ca8a04 0%, #92400e 100%)',
    songs: [
      { title: 'Smells Like Teen Spirit', artist: 'Nirvana' },
      { title: 'Black Hole Sun', artist: 'Soundgarden' },
      { title: 'Creep', artist: 'Radiohead' },
      { title: 'Wonderwall', artist: 'Oasis' },
      { title: 'Mr. Jones', artist: 'Counting Crows' },
    ],
  },
]

const TRENDING = [
  { title: 'Espresso', artist: 'Sabrina Carpenter' },
  { title: 'Die With A Smile', artist: 'Lady Gaga & Bruno Mars' },
  { title: 'APT.', artist: 'ROSÉ & Bruno Mars' },
  { title: 'luther', artist: 'Kendrick Lamar & SZA' },
  { title: 'Birds of a Feather', artist: 'Billie Eilish' },
  { title: 'Good Luck, Babe!', artist: 'Chappell Roan' },
  { title: 'Timeless', artist: 'The Weeknd & Playboi Carti' },
  { title: 'STARBOY', artist: 'The Weeknd' },
]

// ─────────────────────────────────────────────────────────────────────────────
// State & Reducer
// ─────────────────────────────────────────────────────────────────────────────

function loadLiked() {
  try { return JSON.parse(localStorage.getItem('ss_liked') || '[]') }
  catch { return [] }
}

const INIT = {
  queue: [],
  currentSong: null,
  isPlaying: false,
  audioCurrentTime: 0,
  audioDuration: 0,
  audioReady: false,
  audioError: null,
  volume: 75,
  repeatMode: 'off',   // 'off' | 'one' | 'all'
  isShuffled: false,
  history: [],          // [{...song, narration}] last 10
  likedSongs: loadLiked(), // [{id, title, artist, duration}]
  narration: null,
  revealedWords: 0,
  isLoadingNarrate: false,
  isLoadingSpeak: false,
  error: null,
  activeTab: 'queue',
  sidebarOpen: true,
  queueSheetOpen: false,
  queueFinished: false,
}

function reducer(state, action) {
  switch (action.type) {

    case 'ADD_TO_QUEUE': {
      const song = action.song
        ? action.song
        : { id: uid(), title: action.title, artist: action.artist, duration: action.duration || fakeDuration() }
      return { ...state, queue: [...state.queue, song], queueFinished: false }
    }

    case 'ADD_MANY_TO_QUEUE': {
      const songs = action.songs.map(s => ({
        id: uid(), title: s.title, artist: s.artist, duration: s.duration || fakeDuration(),
      }))
      return { ...state, queue: [...state.queue, ...songs], queueFinished: false }
    }

    case 'PLAY_NEXT_ADD': {
      const song = action.song
        ? action.song
        : { id: uid(), title: action.title, artist: action.artist, duration: action.duration || fakeDuration() }
      const idx = state.currentSong
        ? state.queue.findIndex(s => s.id === state.currentSong.id) + 1
        : 0
      const q = [...state.queue]; q.splice(idx, 0, song)
      return { ...state, queue: q }
    }

    case 'REMOVE_FROM_QUEUE':
      return { ...state, queue: state.queue.filter(s => s.id !== action.id) }

    case 'REORDER_QUEUE':
      return { ...state, queue: arrayMove(state.queue, action.oldIndex, action.newIndex) }

    case 'START_SONG':
      return {
        ...state,
        currentSong: action.song,
        isPlaying: false,
        audioCurrentTime: 0,
        audioDuration: 0,
        audioReady: false,
        audioError: null,
        narration: null,
        revealedWords: 0,
        isLoadingNarrate: true,
        isLoadingSpeak: false,
        error: null,
        queueFinished: false,
      }

    case 'SET_NARRATION':
      return { ...state, narration: action.narration, isLoadingNarrate: false, revealedWords: 0 }

    case 'SET_REVEALED':
      return { ...state, revealedWords: action.count }

    case 'SET_LOADING_SPEAK':
      return { ...state, isLoadingSpeak: action.value }

    case 'SET_AUDIO_READY':
      return { ...state, audioReady: true, isLoadingSpeak: false }

    case 'SET_AUDIO_ERROR':
      return { ...state, audioError: action.error, isLoadingSpeak: false }

    case 'AUDIO_TIME':
      return { ...state, audioCurrentTime: action.currentTime, audioDuration: action.duration }

    case 'SET_PLAYING':
      return { ...state, isPlaying: action.value }

    case 'SET_VOLUME':
      return { ...state, volume: action.volume }

    case 'SET_REPEAT':
      return { ...state, repeatMode: action.mode }

    case 'TOGGLE_SHUFFLE':
      return { ...state, isShuffled: !state.isShuffled }

    case 'ADD_HISTORY': {
      const entry = { ...action.song, narration: action.narration }
      const h = [entry, ...state.history.filter(x => x.id !== action.song.id)].slice(0, 10)
      return { ...state, history: h }
    }

    case 'TOGGLE_LIKED': {
      const exists = state.likedSongs.some(s => s.id === action.song.id)
      const likedSongs = exists
        ? state.likedSongs.filter(s => s.id !== action.song.id)
        : [...state.likedSongs, {
            id: action.song.id, title: action.song.title,
            artist: action.song.artist, duration: action.song.duration,
          }]
      return { ...state, likedSongs }
    }

    case 'CLEAR_LIKED':
      return { ...state, likedSongs: [] }

    case 'SET_TAB':
      return { ...state, activeTab: action.tab }

    case 'TOGGLE_SIDEBAR':
      return { ...state, sidebarOpen: !state.sidebarOpen }

    case 'SET_QUEUE_SHEET':
      return { ...state, queueSheetOpen: action.value }

    case 'TOGGLE_QUEUE_SHEET':
      return { ...state, queueSheetOpen: !state.queueSheetOpen }

    case 'SET_ERROR':
      return { ...state, error: action.error, isLoadingNarrate: false }

    case 'QUEUE_FINISHED':
      return { ...state, queueFinished: true }

    case 'REPLAY_HISTORY':
      return {
        ...state,
        currentSong: action.song,
        isPlaying: false,
        audioCurrentTime: 0,
        audioDuration: 0,
        audioReady: false,
        audioError: null,
        narration: action.narration,
        revealedWords: action.narration ? action.narration.split(/\s+/).length : 0,
        isLoadingNarrate: false,
        isLoadingSpeak: true,
        error: null,
        queueFinished: false,
      }

    default:
      return state
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function AmbientBackground({ song }) {
  if (!song) return null
  const { h1, h2, h3 } = songColors(song.title, song.artist)
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', width: 700, height: 700, borderRadius: '50%',
        background: `hsl(${h1}, 70%, 28%)`, top: '-25%', left: '-15%',
        filter: 'blur(130px)', opacity: 0.13,
        animation: 'blobDrift1 22s ease-in-out infinite alternate',
      }} />
      <div style={{
        position: 'absolute', width: 550, height: 550, borderRadius: '50%',
        background: `hsl(${h2}, 60%, 22%)`, bottom: '-15%', right: '-10%',
        filter: 'blur(110px)', opacity: 0.11,
        animation: 'blobDrift2 28s ease-in-out infinite alternate',
      }} />
      <div style={{
        position: 'absolute', width: 400, height: 400, borderRadius: '50%',
        background: `hsl(${h3}, 50%, 18%)`, top: '45%', left: '42%',
        filter: 'blur(90px)', opacity: 0.09,
        animation: 'blobDrift3 19s ease-in-out infinite alternate',
      }} />
    </div>
  )
}

function Waveform({ isPlaying, barWidth = 3, gap = 2.5, height = 44 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap, height, flexShrink: 0 }}>
      {SINE_HEIGHTS.map((h, i) => (
        <div
          key={i}
          className={`wv-bar${isPlaying ? ' playing' : ''}`}
          style={{
            width: barWidth,
            height: h,
            '--dur': `${WAVE_DURS[i]}s`,
            '--delay': `${WAVE_DELAYS[i]}s`,
            opacity: isPlaying ? 0.85 : 0.2,
          }}
        />
      ))}
    </div>
  )
}

function AlbumArt({ title, artist, size = 120 }) {
  const initials = [title?.[0], artist?.[0]].filter(Boolean).join('').toUpperCase()
  return (
    <div style={{
      width: size, height: size,
      borderRadius: size > 80 ? 14 : 8,
      background: songGradient(title, artist),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, position: 'relative', overflow: 'hidden',
      boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 25% 25%, rgba(255,255,255,0.1), transparent 65%)',
      }} />
      <span style={{
        fontFamily: '"Playfair Display", serif',
        fontSize: size > 80 ? size / 4.2 : size / 3.5,
        fontWeight: 700, color: 'rgba(255,255,255,0.55)',
        letterSpacing: 3, position: 'relative',
      }}>{initials}</span>
    </div>
  )
}

function HeartIcon({ filled }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24"
      fill={filled ? '#e879a0' : 'none'}
      stroke={filled ? '#e879a0' : 'currentColor'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

function LoadingDots() {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 5, height: 5, borderRadius: '50%', background: '#f59e0b',
          animation: `wvBounce 0.8s ease-in-out ${i * 0.15}s infinite alternate`,
        }} />
      ))}
    </div>
  )
}

function NarrationDisplay({ narration, revealedWords }) {
  if (!narration) return null
  const paragraphs = narration.split(/\n{2,}/).filter(Boolean)

  let globalIdx = 0
  const parsed = paragraphs.map(para =>
    para.trim().split(/\s+/).map(word => ({ word, idx: globalIdx++ }))
  )

  return (
    <div style={{
      fontFamily: '"Courier Prime", "Courier New", monospace',
      fontSize: 15, lineHeight: 1.9, color: '#d4c5a0',
    }}>
      {parsed.map((words, pi) => (
        <p key={pi} style={{ margin: 0, marginBottom: pi < parsed.length - 1 ? '1.6em' : 0 }}>
          {words.map(({ word, idx }, wi) => (
            <span key={idx} style={{
              opacity: idx < revealedWords ? 1 : 0.04,
              transition: 'opacity 0.35s ease',
            }}>
              {word}{wi < words.length - 1 ? ' ' : ''}
            </span>
          ))}
        </p>
      ))}
    </div>
  )
}

function NarrationSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[100, 85, 95, 60, 100, 78, 88].map((w, i) => (
        <div key={i} className="skeleton" style={{ height: 14, width: `${w}%` }} />
      ))}
      <div style={{ height: 12 }} />
      {[90, 100, 72, 95, 83].map((w, i) => (
        <div key={i} className="skeleton" style={{ height: 14, width: `${w}%` }} />
      ))}
    </div>
  )
}

function ProgressBar({ currentTime, duration, onSeek }) {
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0
  const railRef = useRef(null)

  function handleClick(e) {
    if (!railRef.current || !duration) return
    const rect = railRef.current.getBoundingClientRect()
    const p = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
    onSeek(p)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
      <span style={{ fontSize: 11, color: '#6b7280', minWidth: 34, textAlign: 'right', fontFamily: '"DM Sans"' }}>
        {fmtTime(currentTime)}
      </span>
      <div ref={railRef} className="progress-rail" style={{ flex: 1 }} onClick={handleClick}>
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span style={{ fontSize: 11, color: '#6b7280', minWidth: 34, fontFamily: '"DM Sans"' }}>
        {fmtTime(duration)}
      </span>
    </div>
  )
}

// ─── Sortable Queue Item (dnd-kit) ───────────────────────────────────────────

function SortableQueueItem({ song, isCurrent, isLiked, onPlay, onRemove, onLike, onPlayNext }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: song.id })
  const [hovered, setHovered] = useState(false)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms ease',
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 999 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '7px 10px', borderRadius: 9, userSelect: 'none',
        background: isCurrent
          ? 'rgba(245,158,11,0.1)'
          : hovered ? 'rgba(255,255,255,0.04)' : 'transparent',
        border: isDragging
          ? '1px dashed rgba(245,158,11,0.35)'
          : '1px solid transparent',
        transition: 'background 0.15s, border 0.15s',
        position: 'relative',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Drag handle */}
      <span
        {...attributes} {...listeners}
        style={{
          color: '#2e2e44', fontSize: 13, cursor: 'grab', flexShrink: 0,
          touchAction: 'none', padding: '0 2px',
        }}
      >⠿</span>

      {/* Song info (clickable) */}
      <div onClick={onPlay} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, cursor: 'pointer' }}>
        <AlbumArt title={song.title} artist={song.artist} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: '"Playfair Display", serif', fontSize: 13,
            color: isCurrent ? '#fbbf24' : '#f0ead6',
            fontWeight: isCurrent ? 600 : 400,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{song.title}</div>
          <div style={{ fontSize: 11, color: '#52526a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {song.artist}
          </div>
        </div>
      </div>

      {/* Right side: duration + actions */}
      {hovered ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); onPlayNext() }}
            title="Play Next"
            style={{
              background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: 5, cursor: 'pointer', padding: '2px 8px',
              color: '#fbbf24', fontSize: 12, lineHeight: 1.4,
            }}
          >↑</button>
          <button
            onClick={e => { e.stopPropagation(); onRemove() }}
            title="Remove"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '2px 4px', color: '#6b7280', fontSize: 16, lineHeight: 1,
            }}
          >×</button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: '#52526a' }}>{fmtTime(song.duration)}</span>
          <button
            onClick={e => { e.stopPropagation(); onLike() }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: isLiked ? '#e879a0' : '#3a3a52' }}
          >
            <HeartIcon filled={isLiked} />
          </button>
        </div>
      )}
    </div>
  )
}

function CtrlBtn({ onClick, title, disabled, children, large = false }) {
  return (
    <button onClick={onClick} title={title} disabled={disabled} style={{
      background: 'none', border: 'none',
      cursor: disabled ? 'default' : 'pointer',
      color: disabled ? '#2a2a3a' : '#8880a0',
      padding: large ? 10 : 7, borderRadius: 8,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'color 0.15s',
    }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.color = '#f0ead6' }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.color = '#8880a0' }}
    >{children}</button>
  )
}

function ScrollingTicker({ currentSong, isPlaying }) {
  if (!currentSong) return null
  const text = `NOW PLAYING: ${currentSong.title.toUpperCase()} — ${currentSong.artist.toUpperCase()}`
  const spacer = '    ◆    '
  const chunk = text + spacer
  const repeated = chunk.repeat(6)

  return (
    <div style={{
      background: '#000', borderTop: '1px solid #1a1a2e',
      height: 27, overflow: 'hidden', display: 'flex', alignItems: 'center',
      flexShrink: 0,
    }}>
      <div className="ticker-track" style={{
        fontFamily: '"DM Sans", sans-serif', fontSize: 10,
        letterSpacing: 2.5, color: 'rgba(240,234,214,0.7)',
        fontWeight: 500,
        animationPlayState: isPlaying ? 'running' : 'paused',
      }}>
        {repeated}
      </div>
    </div>
  )
}

// ─── SearchBar — MusicBrainz debounced search ─────────────────────────────────

function SearchBar({ onAddToQueue, onPlayNext, onPlayNow }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const timerRef = useRef(null)
  const inputRef = useRef(null)

  async function doSearch(q) {
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(q)}&fmt=json&limit=10`
      const res = await fetch(url, {
        headers: { 'User-Agent': 'StreamlinedSongs/1.0 (streamlinedsongs@example.com)' },
      })
      const ct = res.headers.get('content-type') || ''
      if (!res.ok || !ct.includes('application/json')) {
        setResults([])
        return
      }
      const data = await safeJson(res)
      setResults((data.recordings || []).map(r => ({
        id: r.id,
        title: r.title,
        artist: r['artist-credit']?.[0]?.name
          || r['artist-credit']?.[0]?.artist?.name
          || 'Unknown Artist',
        album: r.releases?.[0]?.title || '',
        duration: r.length ? r.length / 1000 : null,
        tags: (r.tags || []).slice(0, 3).map(t => t.name),
      })))
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  function handleChange(e) {
    const q = e.target.value
    setQuery(q)
    setSelectedIdx(-1)
    clearTimeout(timerRef.current)
    if (q.trim()) {
      timerRef.current = setTimeout(() => doSearch(q), 250)
      setOpen(true)
    } else {
      setResults([])
      setOpen(false)
    }
  }

  function handleKeyDown(e) {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, -1)) }
    else if (e.key === 'Enter' && selectedIdx >= 0) {
      const r = results[selectedIdx]
      onAddToQueue({ id: uid(), title: r.title, artist: r.artist, duration: r.duration || fakeDuration() })
      setQuery(''); setResults([]); setOpen(false)
    }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  function addResult(r) {
    onAddToQueue({ id: uid(), title: r.title, artist: r.artist, duration: r.duration || fakeDuration() })
    setQuery(''); setResults([]); setOpen(false)
    inputRef.current?.focus()
  }

  function playNextResult(r) {
    onPlayNext({ id: uid(), title: r.title, artist: r.artist, duration: r.duration || fakeDuration() })
    setQuery(''); setResults([]); setOpen(false)
  }

  function playNowResult(r) {
    onPlayNow({ id: uid(), title: r.title, artist: r.artist, duration: r.duration || fakeDuration() })
    setQuery(''); setResults([]); setOpen(false)
  }

  return (
    <div style={{
      padding: '10px 10px 8px',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      flexShrink: 0, position: 'relative',
    }}>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => query.trim() && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder="Search song or artist…"
          style={{
            width: '100%', background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 7,
            color: '#f0ead6', padding: '7px 30px 7px 10px', fontSize: 13,
            outline: 'none', fontFamily: '"DM Sans", sans-serif',
          }}
        />
        {query && (
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => { setQuery(''); setResults([]); setOpen(false); inputRef.current?.focus() }}
            style={{
              position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', color: '#52526a', cursor: 'pointer',
              padding: '2px 4px', fontSize: 15, lineHeight: 1,
            }}
          >×</button>
        )}
      </div>

      {loading && (
        <div style={{ padding: '6px 2px 0', fontSize: 11, color: '#52526a', fontFamily: '"DM Sans"' }}>
          Searching…
        </div>
      )}

      {open && !loading && query.trim() && results.length === 0 && (
        <div style={{ padding: '8px 2px 0', fontSize: 12, color: '#52526a', fontFamily: '"DM Sans"' }}>
          No results. Try different keywords.
        </div>
      )}

      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', left: 10, right: 10, top: 'calc(100% - 8px)', zIndex: 50,
          background: '#0d0d1b', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 9, overflow: 'hidden', maxHeight: 340, overflowY: 'auto',
          boxShadow: '0 10px 40px rgba(0,0,0,0.7)',
        }}>
          {results.map((r, i) => (
            <div
              key={r.id || i}
              style={{
                padding: '8px 10px',
                background: i === selectedIdx ? 'rgba(245,158,11,0.08)' : 'transparent',
                borderBottom: i < results.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
              }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: '"Playfair Display", serif', fontSize: 13,
                    color: '#f0ead6', fontWeight: 600,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>{r.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: '#7c7ca8' }}>{r.artist}</span>
                    {r.album && (
                      <span style={{ fontSize: 10, color: '#52526a', fontStyle: 'italic' }}>
                        {r.album}
                      </span>
                    )}
                  </div>
                  {r.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                      {r.tags.map(tag => (
                        <span key={tag} style={{
                          fontSize: 9, background: 'rgba(245,158,11,0.12)',
                          color: '#f59e0b', borderRadius: 10, padding: '1px 6px',
                        }}>{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                  {r.duration && (
                    <span style={{
                      fontSize: 10, color: '#52526a',
                      background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: '1px 5px',
                    }}>{fmtTime(r.duration)}</span>
                  )}
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => addResult(r)}
                      style={{
                        fontSize: 10, background: 'rgba(255,255,255,0.07)',
                        border: '1px solid rgba(255,255,255,0.12)', borderRadius: 5,
                        color: '#c8bfa0', cursor: 'pointer', padding: '3px 7px',
                        fontFamily: '"DM Sans"',
                      }}
                    >+ Queue</button>
                    <button
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => playNowResult(r)}
                      style={{
                        fontSize: 10, background: 'rgba(245,158,11,0.12)',
                        border: '1px solid rgba(245,158,11,0.28)', borderRadius: 5,
                        color: '#fbbf24', cursor: 'pointer', padding: '3px 7px',
                        fontFamily: '"DM Sans"',
                      }}
                    >▶ Play</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── AI Recommendations ───────────────────────────────────────────────────────

function RecommendSection({ recentlyPlayed, likedSongs, onAddToQueue }) {
  const [recs, setRecs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function fetchRecs() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recentlyPlayed, likedSongs }),
      })
      const data = await safeJson(res)
      if (!res.ok) throw new Error((data && data.error) || 'Recommend failed')
      setRecs(Array.isArray(data) ? data : (data.recommendations || []))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 4px 10px', fontFamily: '"DM Sans"',
      }}>
        <div style={{ fontSize: 10, color: '#f59e0b', letterSpacing: 3, textTransform: 'uppercase' }}>
          AI Picks
        </div>
        {recs.length > 0 && (
          <button
            onClick={fetchRecs}
            style={{ fontSize: 11, color: '#52526a', background: 'none', border: 'none', cursor: 'pointer', fontFamily: '"DM Sans"' }}
          >↻ Refresh</button>
        )}
      </div>

      {!loading && recs.length === 0 && !error && (
        <button
          onClick={fetchRecs}
          style={{
            width: '100%', padding: '10px 0',
            background: 'rgba(245,158,11,0.07)',
            border: '1px solid rgba(245,158,11,0.2)', borderRadius: 9,
            color: '#fbbf24', cursor: 'pointer', fontSize: 13, fontFamily: '"DM Sans"',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.12)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,158,11,0.07)'}
        >
          Recommend me something
        </button>
      )}

      {error && (
        <div style={{ fontSize: 11, color: '#fca5a5', padding: '4px 4px 8px', fontFamily: '"DM Sans"' }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1, 2, 3].map(i => (
            <div key={i} className="skeleton" style={{ height: 64, borderRadius: 9 }} />
          ))}
        </div>
      )}

      {!loading && recs.map((rec, i) => (
        <div
          key={i}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '8px 10px', borderRadius: 9, marginBottom: 6,
            borderLeft: '2px solid #f59e0b',
            background: 'rgba(245,158,11,0.04)',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: '"Playfair Display", serif', fontSize: 13, color: '#f0ead6' }}>
              {rec.title}
            </div>
            <div style={{ fontSize: 11, color: '#7c7ca8', marginBottom: 3 }}>{rec.artist}</div>
            {rec.reason && (
              <div style={{ fontSize: 10, color: '#52526a', fontStyle: 'italic', fontFamily: '"DM Sans"' }}>
                {rec.reason}
              </div>
            )}
          </div>
          <button
            onClick={() => onAddToQueue({ id: uid(), title: rec.title, artist: rec.artist, duration: fakeDuration() })}
            style={{
              fontSize: 10, background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5,
              color: '#c8bfa0', cursor: 'pointer', padding: '3px 7px',
              flexShrink: 0, fontFamily: '"DM Sans"',
            }}
          >+ Queue</button>
        </div>
      ))}
    </div>
  )
}

// ─── Discover Tab ─────────────────────────────────────────────────────────────

function DiscoverTab({ onAddToQueue, onPlayAll, history, likedSongs }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>

      {/* Curated Playlists */}
      <div style={{
        fontSize: 10, color: '#f59e0b', letterSpacing: 3, textTransform: 'uppercase',
        padding: '6px 4px 10px', fontFamily: '"DM Sans"',
      }}>Curated Playlists</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 24 }}>
        {CURATED_PLAYLISTS.map(pl => (
          <div
            key={pl.id}
            style={{
              borderRadius: 10, overflow: 'hidden', cursor: 'default',
              background: pl.gradient, padding: '12px 10px',
              display: 'flex', flexDirection: 'column', gap: 4,
              border: '1px solid rgba(255,255,255,0.08)',
              transition: 'transform 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <div style={{ fontSize: 20 }}>{pl.emoji}</div>
            <div style={{
              fontFamily: '"Playfair Display", serif', fontSize: 12,
              color: '#fff', fontWeight: 600, lineHeight: 1.2,
            }}>{pl.title}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', fontFamily: '"DM Sans"' }}>
              {pl.songs.length} songs
            </div>
            <button
              onClick={() => onPlayAll(pl.songs)}
              style={{
                marginTop: 4, background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.25)', borderRadius: 5,
                color: '#fff', cursor: 'pointer', fontSize: 10, padding: '4px 8px',
                fontFamily: '"DM Sans"', alignSelf: 'flex-start',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.5)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.3)'}
            >▶ Play All</button>
          </div>
        ))}
      </div>

      {/* AI Recommendations */}
      <RecommendSection
        recentlyPlayed={history.slice(0, 5).map(s => `${s.title} by ${s.artist}`)}
        likedSongs={likedSongs.slice(0, 5).map(s => `${s.title} by ${s.artist}`)}
        onAddToQueue={onAddToQueue}
      />

      {/* Trending Now */}
      <div style={{
        fontSize: 10, color: '#f59e0b', letterSpacing: 3, textTransform: 'uppercase',
        padding: '6px 4px 10px', fontFamily: '"DM Sans"',
      }}>Trending Now</div>
      {TRENDING.map((song, i) => (
        <div
          key={song.title}
          style={{
            display: 'flex', alignItems: 'center', gap: 9,
            padding: '6px 8px', borderRadius: 7, transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <span style={{
            fontSize: 11, color: '#3a3a52', minWidth: 16, textAlign: 'right',
            fontFamily: '"DM Sans"', fontWeight: 600,
          }}>{i + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: '"Playfair Display", serif', fontSize: 12, color: '#f0ead6',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{song.title}</div>
            <div style={{ fontSize: 10, color: '#52526a' }}>{song.artist}</div>
          </div>
          <button
            onClick={() => onAddToQueue({ id: uid(), title: song.title, artist: song.artist, duration: fakeDuration() })}
            style={{
              fontSize: 10, background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: 5,
              color: '#c8bfa0', cursor: 'pointer', padding: '3px 7px',
              flexShrink: 0, fontFamily: '"DM Sans"',
            }}
          >+ Queue</button>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main App
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  {
    id: 'queue', label: 'Queue',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
      </svg>
    ),
  },
  {
    id: 'discover', label: 'Discover',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
      </svg>
    ),
  },
  {
    id: 'liked', label: 'Liked',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>
    ),
  },
  {
    id: 'history', label: 'History',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
      </svg>
    ),
  },
]

export default function App() {
  const [state, dispatch] = useReducer(reducer, INIT)
  const audioRef = useRef(null)
  const blobUrlRef = useRef(null)
  const abortRef = useRef(new AbortController())
  const volumeRef = useRef(state.volume)
  const handleEndedRef = useRef(null)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  const [contentKey, setContentKey] = useState(0)

  // Initialize audio element once
  if (!audioRef.current) audioRef.current = new Audio()

  // Responsive detection
  useEffect(() => {
    const fn = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  // Keep volumeRef in sync
  useEffect(() => { volumeRef.current = state.volume }, [state.volume])

  // Sync volume to audio
  useEffect(() => {
    audioRef.current.volume = state.volume / 100
  }, [state.volume])

  // Persist liked songs to localStorage
  useEffect(() => {
    try { localStorage.setItem('ss_liked', JSON.stringify(state.likedSongs)) }
    catch { /* ignore */ }
  }, [state.likedSongs])

  // Audio events (set up once)
  useEffect(() => {
    const audio = audioRef.current

    const onTimeUpdate = () => dispatch({
      type: 'AUDIO_TIME',
      currentTime: audio.currentTime,
      duration: isNaN(audio.duration) ? 0 : audio.duration,
    })
    const onEnded = () => handleEndedRef.current?.()
    const onPlay  = () => dispatch({ type: 'SET_PLAYING', value: true })
    const onPause = () => dispatch({ type: 'SET_PLAYING', value: false })
    const onLoaded = () => dispatch({
      type: 'AUDIO_TIME',
      currentTime: 0,
      duration: isNaN(audio.duration) ? 0 : audio.duration,
    })

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('loadedmetadata', onLoaded)

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('loadedmetadata', onLoaded)
    }
  }, [])

  // Word-by-word reveal (130 wpm ≈ 460ms/word)
  useEffect(() => {
    if (!state.narration) return
    const words = state.narration.split(/\s+/)
    const MS_PER_WORD = 60000 / 130
    let count = 0
    dispatch({ type: 'SET_REVEALED', count: 0 })
    const id = setInterval(() => {
      count++
      dispatch({ type: 'SET_REVEALED', count })
      if (count >= words.length) clearInterval(id)
    }, MS_PER_WORD)
    return () => clearInterval(id)
  }, [state.narration])

  // ── Audio end handler ─────────────────────────────────────────────────────
  handleEndedRef.current = useCallback(() => {
    if (state.repeatMode === 'one' && state.currentSong) {
      playSong(state.currentSong)
      return
    }
    if (state.queue.length === 0) {
      if (state.repeatMode === 'all' && state.history.length > 0) {
        // Re-add history to queue and play first
        const songs = [...state.history].reverse()
        const next = state.isShuffled
          ? songs[Math.floor(Math.random() * songs.length)]
          : songs[0]
        dispatch({ type: 'ADD_MANY_TO_QUEUE', songs: songs.filter(s => s.id !== next.id) })
        playSong(next)
      } else {
        dispatch({ type: 'QUEUE_FINISHED' })
      }
      return
    }
    setTimeout(() => {
      const q = state.queue
      const next = state.isShuffled ? q[Math.floor(Math.random() * q.length)] : q[0]
      dispatch({ type: 'REMOVE_FROM_QUEUE', id: next.id })
      playSong(next)
    }, 1500)
  }, [state.repeatMode, state.queue, state.history, state.isShuffled, state.currentSong])

  // ── Play a song ───────────────────────────────────────────────────────────
  async function playSong(song) {
    audioRef.current.pause()
    audioRef.current.src = ''
    abortRef.current.abort()
    abortRef.current = new AbortController()
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }

    dispatch({ type: 'START_SONG', song })
    setContentKey(k => k + 1)
    const signal = abortRef.current.signal

    let narrationText
    try {
      const res = await fetch('/api/narrate', {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: song.title, artist: song.artist }),
      })
      const data = await safeJson(res)
      if (!res.ok) throw new Error(data.error || `Narrate error ${res.status}`)
      narrationText = data.narration
      dispatch({ type: 'SET_NARRATION', narration: narrationText })
      dispatch({ type: 'ADD_HISTORY', song, narration: narrationText })
    } catch (err) {
      if (err.name === 'AbortError') return
      dispatch({ type: 'SET_ERROR', error: err.message })
      return
    }

    fetchAndPlayAudio(narrationText, signal)
  }

  async function fetchAndPlayAudio(text, signal) {
    dispatch({ type: 'SET_LOADING_SPEAK', value: true })
    try {
      const res = await fetch('/api/speak', {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) {
        const data = await safeJson(res).catch(() => ({}))
        throw new Error(data.error || `Speak error ${res.status}`)
      }
      const blob = await res.blob()
      if (signal.aborted) return
      const url = URL.createObjectURL(blob)
      blobUrlRef.current = url
      audioRef.current.src = url
      audioRef.current.volume = volumeRef.current / 100
      await audioRef.current.play()
      dispatch({ type: 'SET_AUDIO_READY', value: true })
    } catch (err) {
      if (err.name === 'AbortError') return
      dispatch({ type: 'SET_AUDIO_ERROR', error: err.message })
    }
  }

  async function replayHistory(entry) {
    audioRef.current.pause()
    audioRef.current.src = ''
    abortRef.current.abort()
    abortRef.current = new AbortController()
    if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null }

    dispatch({ type: 'REPLAY_HISTORY', song: entry, narration: entry.narration })
    setContentKey(k => k + 1)

    if (entry.narration) {
      fetchAndPlayAudio(entry.narration, abortRef.current.signal)
    }
  }

  function togglePlayPause() {
    if (!state.audioReady) return
    if (audioRef.current.paused) audioRef.current.play()
    else audioRef.current.pause()
  }

  function skipNext() {
    if (state.queue.length === 0) return
    const q = state.queue
    const next = state.isShuffled ? q[Math.floor(Math.random() * q.length)] : q[0]
    dispatch({ type: 'REMOVE_FROM_QUEUE', id: next.id })
    playSong(next)
  }

  function skipPrev() {
    if (state.audioCurrentTime > 3) {
      audioRef.current.currentTime = 0
      return
    }
    if (state.history.length > 1) replayHistory(state.history[1])
    else audioRef.current.currentTime = 0
  }

  function handleSeek(pct) {
    if (!audioRef.current.duration) return
    audioRef.current.currentTime = (pct / 100) * audioRef.current.duration
  }

  function handleQueuePlay(song) {
    dispatch({ type: 'REMOVE_FROM_QUEUE', id: song.id })
    playSong(song)
  }

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = state.queue.findIndex(s => s.id === active.id)
      const newIndex = state.queue.findIndex(s => s.id === over.id)
      dispatch({ type: 'REORDER_QUEUE', oldIndex, newIndex })
    }
  }

  const {
    currentSong, isPlaying, audioCurrentTime, audioDuration, audioReady,
    audioError, volume, repeatMode, isShuffled, history, likedSongs, narration,
    revealedWords, isLoadingNarrate, isLoadingSpeak, error, activeTab,
    sidebarOpen, queueSheetOpen, queue, queueFinished,
  } = state

  const canPlay = !!(currentSong)
  const sidebarWidth = 300
  const likedIds = new Set(likedSongs.map(s => s.id))

  // ── Sidebar content ───────────────────────────────────────────────────────
  function SidebarContent() {
    return (
      <>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          {TABS.map(({ id, label, icon }) => {
            const isActive = activeTab === id
            const badge = id === 'queue' && queue.length > 0 ? queue.length : null
            return (
              <button key={id} onClick={() => dispatch({ type: 'SET_TAB', tab: id })} style={{
                flex: 1, padding: '10px 0 9px', background: 'none', border: 'none',
                borderBottom: isActive ? '2px solid #f59e0b' : '2px solid transparent',
                color: isActive ? '#fbbf24' : '#52526a',
                cursor: 'pointer', fontSize: 10, fontWeight: 500,
                fontFamily: '"DM Sans", sans-serif', letterSpacing: 0.5,
                transition: 'color 0.15s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                position: 'relative',
              }}>
                <div style={{ position: 'relative' }}>
                  {icon}
                  {badge && (
                    <span style={{
                      position: 'absolute', top: -5, right: -7,
                      background: '#f59e0b', color: '#080810',
                      borderRadius: '50%', width: 14, height: 14,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, fontWeight: 700, lineHeight: 1,
                    }}>{badge > 99 ? '99' : badge}</span>
                  )}
                </div>
                <span>{label}</span>
              </button>
            )
          })}
        </div>

        {/* Queue tab */}
        {activeTab === 'queue' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Search bar */}
            <SearchBar
              onAddToQueue={song => dispatch({ type: 'ADD_TO_QUEUE', song })}
              onPlayNext={song => dispatch({ type: 'PLAY_NEXT_ADD', song })}
              onPlayNow={song => { dispatch({ type: 'REMOVE_FROM_QUEUE', id: song.id }); playSong(song) }}
            />

            {/* Shuffle / Repeat */}
            <div style={{ padding: '7px 10px', display: 'flex', gap: 7, borderBottom: '1px solid rgba(255,255,255,0.05)', flexShrink: 0 }}>
              <button onClick={() => dispatch({ type: 'TOGGLE_SHUFFLE' })} style={{
                background: isShuffled ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isShuffled ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 7, color: isShuffled ? '#fbbf24' : '#52526a',
                cursor: 'pointer', padding: '5px 11px', fontSize: 13, transition: 'all 0.15s',
              }}>⇄</button>
              <button onClick={() => {
                const modes = ['off', 'one', 'all']
                dispatch({ type: 'SET_REPEAT', mode: modes[(modes.indexOf(repeatMode) + 1) % 3] })
              }} style={{
                background: repeatMode !== 'off' ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${repeatMode !== 'off' ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 7, color: repeatMode !== 'off' ? '#fbbf24' : '#52526a',
                cursor: 'pointer', padding: '5px 11px', fontSize: 12, fontWeight: 600,
                fontFamily: '"DM Sans"', transition: 'all 0.15s',
              }}>{repeatMode === 'one' ? '↺¹' : repeatMode === 'all' ? '↺∞' : '↺'}</button>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: 11, color: '#3a3a52', alignSelf: 'center', fontFamily: '"DM Sans"' }}>
                {queue.length} song{queue.length !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Queue list with dnd-kit */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 4px' }}>
              {queue.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#2e2e44', fontFamily: '"DM Sans"' }}>
                  <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>♫</div>
                  <div style={{ fontSize: 14, color: '#3a3a52', marginBottom: 6 }}>Your queue is empty.</div>
                  <div style={{ fontSize: 12, color: '#2e2e44' }}>Search or pick a recommended song below.</div>
                </div>
              ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={queue.map(s => s.id)} strategy={verticalListSortingStrategy}>
                    {queue.map(song => (
                      <SortableQueueItem
                        key={song.id}
                        song={song}
                        isCurrent={currentSong?.id === song.id}
                        isLiked={likedIds.has(song.id)}
                        onPlay={() => handleQueuePlay(song)}
                        onRemove={() => dispatch({ type: 'REMOVE_FROM_QUEUE', id: song.id })}
                        onLike={() => dispatch({ type: 'TOGGLE_LIKED', song })}
                        onPlayNext={() => {
                          dispatch({ type: 'REMOVE_FROM_QUEUE', id: song.id })
                          dispatch({ type: 'PLAY_NEXT_ADD', song })
                        }}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              )}
            </div>
          </div>
        )}

        {/* Discover tab */}
        {activeTab === 'discover' && (
          <DiscoverTab
            onAddToQueue={song => dispatch({ type: 'ADD_TO_QUEUE', song })}
            onPlayAll={songs => {
              const mapped = songs.map(s => ({ id: uid(), title: s.title, artist: s.artist, duration: s.duration || fakeDuration() }))
              dispatch({ type: 'ADD_MANY_TO_QUEUE', songs: mapped.slice(1) })
              playSong(mapped[0])
            }}
            history={history}
            likedSongs={likedSongs}
          />
        )}

        {/* Liked tab */}
        {activeTab === 'liked' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {likedSongs.length > 0 && (
              <div style={{
                padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)',
                display: 'flex', gap: 8, flexShrink: 0,
              }}>
                <button
                  onClick={() => {
                    const mapped = likedSongs.map(s => ({ id: uid(), title: s.title, artist: s.artist, duration: s.duration || fakeDuration() }))
                    dispatch({ type: 'ADD_MANY_TO_QUEUE', songs: mapped.slice(1) })
                    playSong(mapped[0])
                  }}
                  style={{
                    flex: 1, padding: '6px 0', borderRadius: 7,
                    background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
                    color: '#fbbf24', cursor: 'pointer', fontSize: 11, fontFamily: '"DM Sans"',
                  }}
                >▶ Play All</button>
                <button
                  onClick={() => {
                    if (confirm('Clear all liked songs?')) dispatch({ type: 'CLEAR_LIKED' })
                  }}
                  style={{
                    flex: 1, padding: '6px 0', borderRadius: 7,
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    color: '#6b7280', cursor: 'pointer', fontSize: 11, fontFamily: '"DM Sans"',
                  }}
                >Clear All</button>
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 4px' }}>
              {likedSongs.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#2e2e44', fontFamily: '"DM Sans"' }}>
                  <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>♡</div>
                  <div style={{ fontSize: 13 }}>No liked songs yet.</div>
                </div>
              ) : (
                likedSongs.map(song => {
                  const histEntry = history.find(s => s.id === song.id)
                  return (
                    <div
                      key={song.id}
                      onClick={() => histEntry ? replayHistory(histEntry) : dispatch({ type: 'ADD_TO_QUEUE', song })}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 9,
                        padding: '7px 10px', borderRadius: 9, cursor: 'pointer', transition: 'background 0.15s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <AlbumArt title={song.title} artist={song.artist} size={34} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontFamily: '"Playfair Display",serif', fontSize: 13, color: '#f0ead6',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{song.title}</div>
                        <div style={{ fontSize: 11, color: '#52526a' }}>{song.artist}</div>
                      </div>
                      <span style={{ color: '#e879a0', fontSize: 13 }}>♥</span>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* History tab */}
        {activeTab === 'history' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 4px' }}>
            {history.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#2e2e44', fontFamily: '"DM Sans"' }}>
                <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>◷</div>
                <div style={{ fontSize: 13 }}>Nothing played yet.</div>
              </div>
            ) : (
              history.map((entry, i) => (
                <div key={entry.id + i} onClick={() => replayHistory(entry)}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 9, cursor: 'pointer', transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ fontSize: 10, color: '#2e2e44', minWidth: 14, textAlign: 'right', fontFamily: '"DM Sans"' }}>{i + 1}</span>
                  <AlbumArt title={entry.title} artist={entry.artist} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: '"Playfair Display",serif', fontSize: 13, color: '#f0ead6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.title}</div>
                    <div style={{ fontSize: 11, color: '#52526a' }}>{entry.artist}</div>
                  </div>
                  {likedIds.has(entry.id) && <span style={{ color: '#e879a0', fontSize: 12 }}>♥</span>}
                </div>
              ))
            )}
          </div>
        )}
      </>
    )
  }

  // ── Mobile bottom nav tab handler ─────────────────────────────────────────
  function handleMobileTab(tab) {
    if (activeTab === tab && queueSheetOpen) {
      dispatch({ type: 'SET_QUEUE_SHEET', value: false })
    } else {
      dispatch({ type: 'SET_TAB', tab })
      dispatch({ type: 'SET_QUEUE_SHEET', value: true })
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      position: 'relative', overflow: 'hidden', background: '#080810',
    }}>

      {/* Grain overlay */}
      <div className="grain-overlay" />

      {/* Ambient background */}
      <AmbientBackground song={currentSong} />

      {/* ── Header ── */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '13px 22px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0, position: 'relative', zIndex: 10,
        background: 'rgba(8,8,16,0.7)', backdropFilter: 'blur(20px)',
      }}>
        {!isMobile && (
          <button
            onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
            style={{ background: 'none', border: 'none', color: '#52526a', cursor: 'pointer', fontSize: 17, padding: '2px 5px', borderRadius: 4 }}
          >☰</button>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M2 12 C5 5, 9 19, 12 12 C15 5, 19 19, 22 12" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
          </svg>
          <span style={{ fontFamily: '"Playfair Display", serif', fontSize: 19, fontWeight: 700, color: '#f0ead6', letterSpacing: 0.5 }}>
            StreamlinedSongs
          </span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Status indicators */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {isLoadingNarrate && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: '#52526a', fontFamily: '"DM Sans"' }}>
              <LoadingDots /> <span>Narrating…</span>
            </div>
          )}
          {isLoadingSpeak && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11, color: '#52526a', fontFamily: '"DM Sans"' }}>
              <LoadingDots /> <span>Synthesizing audio…</span>
            </div>
          )}
          {audioReady && isPlaying && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'wvBounce 1.2s ease-in-out infinite alternate' }} />
              <span style={{ fontSize: 11, color: '#22c55e', fontFamily: '"DM Sans"' }}>LIVE</span>
            </div>
          )}
        </div>
      </header>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', zIndex: 1 }}>

        {/* Desktop sidebar */}
        {!isMobile && (
          <aside className="glass" style={{
            width: sidebarOpen ? sidebarWidth : 0,
            minWidth: sidebarOpen ? sidebarWidth : 0,
            overflow: 'hidden',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            display: 'flex', flexDirection: 'column',
            transition: 'width 0.3s ease, min-width 0.3s ease',
            flexShrink: 0,
          }}>
            <div style={{ width: sidebarWidth, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <SidebarContent />
            </div>
          </aside>
        )}

        {/* ── Main content ── */}
        <main style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          {!currentSong ? (
            /* Empty state */
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '100%', gap: 28, padding: 40, textAlign: 'center',
            }}>
              <Waveform isPlaying={false} barWidth={4} gap={3} height={56} />
              <div>
                <h1 style={{
                  fontFamily: '"Playfair Display", serif', fontSize: 44,
                  fontWeight: 700, color: '#f0ead6', margin: 0, lineHeight: 1.05,
                }}>
                  StreamlinedSongs
                </h1>
                <p style={{ color: '#52526a', marginTop: 14, fontSize: 15, fontFamily: '"DM Sans"', lineHeight: 1.6 }}>
                  A late-night radio experience, narrated by AI.<br />Add a song to begin.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 480 }}>
                {[
                  ['Bohemian Rhapsody', 'Queen'],
                  ['Good Days', 'SZA'],
                  ['Hurt', 'Johnny Cash'],
                  ['Midnight Rain', 'Taylor Swift'],
                  ['The Night We Met', 'Lord Huron'],
                  ['Motion Picture Soundtrack', 'Radiohead'],
                ].map(([t, a]) => (
                  <button key={t} onClick={() => dispatch({ type: 'ADD_TO_QUEUE', title: t, artist: a })} style={{
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)',
                    borderRadius: 20, color: '#a09880', padding: '7px 15px',
                    cursor: 'pointer', fontSize: 12, fontFamily: '"DM Sans"',
                    transition: 'border-color 0.15s, color 0.15s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(245,158,11,0.4)'; e.currentTarget.style.color = '#f0ead6' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)'; e.currentTarget.style.color = '#a09880' }}
                  >+ {t}</button>
                ))}
              </div>
            </div>
          ) : queueFinished ? (
            /* Queue finished state */
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '100%', gap: 20, padding: 40, textAlign: 'center',
            }}>
              <Waveform isPlaying={false} barWidth={4} gap={3} height={44} />
              <div>
                <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 28, color: '#f0ead6', margin: 0 }}>
                  Queue finished
                </h2>
                <p style={{ color: '#52526a', marginTop: 10, fontSize: 14, fontFamily: '"DM Sans"', lineHeight: 1.6 }}>
                  Add more songs or explore the Discover tab.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => dispatch({ type: 'SET_TAB', tab: 'discover' })}
                  style={{
                    padding: '8px 20px', borderRadius: 20,
                    background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                    color: '#fbbf24', cursor: 'pointer', fontSize: 13, fontFamily: '"DM Sans"',
                  }}
                >Open Discover</button>
              </div>
            </div>
          ) : (
            /* Now Playing */
            <div key={contentKey} className="song-enter" style={{ padding: isMobile ? '24px 20px' : '36px 44px', maxWidth: 800 }}>

              {/* Song header */}
              <div style={{ display: 'flex', gap: 26, alignItems: 'flex-start', marginBottom: 36 }}>
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <AlbumArt title={currentSong.title} artist={currentSong.artist} size={isMobile ? 90 : 130} />
                  <div style={{
                    position: 'absolute', bottom: -12, left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(8,8,16,0.7)', borderRadius: 8, padding: '4px 8px',
                  }}>
                    <Waveform isPlaying={isPlaying} barWidth={2.5} gap={2} height={28} />
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
                  <div style={{ fontSize: 10, color: '#f59e0b', letterSpacing: 3.5, textTransform: 'uppercase', marginBottom: 10, fontFamily: '"DM Sans"' }}>
                    Now Playing
                  </div>
                  <h2 style={{
                    fontFamily: '"Playfair Display", serif',
                    fontSize: isMobile ? 26 : 36, fontWeight: 700, color: '#f0ead6',
                    margin: 0, lineHeight: 1.1, marginBottom: 7,
                  }}>{currentSong.title}</h2>
                  <div style={{ fontSize: 15, color: '#6b6880', marginBottom: 18, fontFamily: '"DM Sans"' }}>
                    {currentSong.artist}
                  </div>
                  <button
                    onClick={() => dispatch({ type: 'TOGGLE_LIKED', song: currentSong })}
                    style={{
                      background: likedIds.has(currentSong.id) ? 'rgba(232,121,160,0.1)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${likedIds.has(currentSong.id) ? 'rgba(232,121,160,0.35)' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: 20, cursor: 'pointer', padding: '6px 14px',
                      display: 'flex', alignItems: 'center', gap: 6,
                      transition: 'background 0.2s, border-color 0.2s',
                    }}
                  >
                    <HeartIcon filled={likedIds.has(currentSong.id)} />
                    <span style={{ fontSize: 12, color: likedIds.has(currentSong.id) ? '#e879a0' : '#6b6880', fontFamily: '"DM Sans"' }}>
                      {likedIds.has(currentSong.id) ? 'Liked' : 'Like'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="glass" style={{
                  borderColor: 'rgba(239,68,68,0.25)', borderRadius: 10,
                  padding: '12px 16px', marginBottom: 24,
                  fontFamily: '"Courier Prime", monospace', fontSize: 12, color: '#fca5a5',
                }}>
                  {error}
                </div>
              )}

              {/* Audio error (non-fatal) */}
              {audioError && !error && (
                <div className="glass" style={{
                  borderColor: 'rgba(245,158,11,0.2)', borderRadius: 10,
                  padding: '10px 16px', marginBottom: 24,
                  fontFamily: '"DM Sans"', fontSize: 12, color: '#b45309',
                }}>
                  Audio unavailable: {audioError}. Narration text is still displaying.
                </div>
              )}

              {/* Narration area */}
              <div className="glass" style={{ borderRadius: 14, padding: '28px 32px', marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: '#f59e0b', letterSpacing: 3.5, textTransform: 'uppercase', marginBottom: 20, fontFamily: '"DM Sans"' }}>
                  Sterling — Late Night Radio
                </div>
                {isLoadingNarrate ? (
                  <NarrationSkeleton />
                ) : (
                  <NarrationDisplay narration={narration} revealedWords={revealedWords} />
                )}
              </div>

            </div>
          )}
        </main>
      </div>

      {/* ── Player bar ── */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(8,8,16,0.92)', backdropFilter: 'blur(24px)',
        flexShrink: 0, position: 'relative', zIndex: 10,
        padding: '12px 22px 14px',
      }}>
        {/* Progress */}
        <div style={{ marginBottom: 13 }}>
          <ProgressBar currentTime={audioCurrentTime} duration={audioDuration} onSeek={handleSeek} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* Mini song info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
            {currentSong ? (
              <>
                <AlbumArt title={currentSong.title} artist={currentSong.artist} size={42} />
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontFamily: '"Playfair Display", serif', fontSize: 13, color: '#f0ead6',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160,
                  }}>{currentSong.title}</div>
                  <div style={{ fontSize: 11, color: '#52526a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>
                    {currentSong.artist}
                  </div>
                </div>
              </>
            ) : (
              <span style={{ fontSize: 13, color: '#2e2e44', fontFamily: '"DM Sans"' }}>No song playing</span>
            )}
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'center' }}>
            <CtrlBtn onClick={skipPrev} title="Previous" disabled={!canPlay}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>
              </svg>
            </CtrlBtn>

            <button
              onClick={() => {
                if (!currentSong && queue.length > 0) {
                  const s = queue[0]
                  dispatch({ type: 'REMOVE_FROM_QUEUE', id: s.id })
                  playSong(s)
                } else if (audioReady) {
                  togglePlayPause()
                }
              }}
              style={{
                width: 50, height: 50, borderRadius: '50%',
                background: (isLoadingNarrate || isLoadingSpeak) ? '#1e1e30' : 'linear-gradient(135deg, #b45309, #fbbf24)',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#080810', flexShrink: 0,
                boxShadow: audioReady && isPlaying ? '0 4px 24px rgba(245,158,11,0.45)' : '0 2px 12px rgba(0,0,0,0.5)',
                transition: 'box-shadow 0.3s, background 0.3s, transform 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.07)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              {(isLoadingNarrate || isLoadingSpeak) ? (
                <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: '#f59e0b', animation: `wvBounce 0.7s ${i * 0.12}s infinite alternate` }} />
                  ))}
                </div>
              ) : isPlaying ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21"/>
                </svg>
              )}
            </button>

            <CtrlBtn onClick={skipNext} title="Skip" disabled={queue.length === 0 && !currentSong}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z"/>
              </svg>
            </CtrlBtn>
          </div>

          {/* Volume */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 1, justifyContent: 'flex-end' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#3a3a52">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
            </svg>
            <input type="range" min="0" max="100" value={volume}
              onChange={e => dispatch({ type: 'SET_VOLUME', volume: +e.target.value })}
              style={{ width: 80 }}
            />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#3a3a52">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM16.5 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
          </div>
        </div>
      </div>

      {/* ── Scrolling ticker ── */}
      <ScrollingTicker currentSong={currentSong} isPlaying={isPlaying} />

      {/* ── Mobile bottom nav ── */}
      {isMobile && (
        <div style={{
          display: 'flex', borderTop: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(8,8,16,0.96)', backdropFilter: 'blur(20px)',
          flexShrink: 0, zIndex: 20,
        }}>
          {TABS.map(({ id, label, icon }) => {
            const isActive = activeTab === id && queueSheetOpen
            const badge = id === 'queue' && queue.length > 0 ? queue.length : null
            return (
              <button key={id} onClick={() => handleMobileTab(id)} style={{
                flex: 1, padding: '10px 0 12px', background: 'none', border: 'none',
                cursor: 'pointer', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 3,
                color: isActive ? '#fbbf24' : '#52526a',
                transition: 'color 0.15s',
                position: 'relative',
              }}>
                <div style={{ position: 'relative' }}>
                  {icon}
                  {badge && (
                    <span style={{
                      position: 'absolute', top: -5, right: -7,
                      background: '#f59e0b', color: '#080810',
                      borderRadius: '50%', width: 14, height: 14,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 8, fontWeight: 700, lineHeight: 1,
                    }}>{badge > 99 ? '99' : badge}</span>
                  )}
                </div>
                <span style={{ fontSize: 9, fontFamily: '"DM Sans"', letterSpacing: 0.3 }}>{label}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Mobile: Queue bottom sheet ── */}
      {isMobile && queueSheetOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        }} onClick={() => dispatch({ type: 'SET_QUEUE_SHEET', value: false })}>
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            background: '#0e0e1a', borderTop: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '16px 16px 0 0',
            height: '80vh', display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#2e2e44', alignSelf: 'center', margin: '12px 0' }} />
            <SidebarContent />
          </div>
        </div>
      )}

    </div>
  )
}
