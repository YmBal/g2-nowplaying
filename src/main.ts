import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'

// ── Config ──────────────────────────────────────────────────────
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxK__w9uR7ETSXSDCP8WYVie0cNes5fj_WwDGpHnocoOvJCHLbxSd1GnOIptog6A_ry/exec'
const PROGRESS_BAR_LEN = 25
const DEFAULT_DURATION = 210 // 3.5 min fallback if no duration available

// ── State ───────────────────────────────────────────────────────
let bridge: any = null
let track = {
  title: 'Waiting...',
  artist: '',
  album: '',
  isPlaying: false,
  duration: 0,    // seconds, from server
  position: 0,    // seconds, from server
}
let trackStartTime: number | null = null  // local Date.now() when track was last fetched
let trackStartPosition: number = 0       // position at that fetch time
let debounce = false

// ── Progress bar ────────────────────────────────────────────────
function buildProgressBar(): string {
  const duration = track.duration > 0 ? track.duration : DEFAULT_DURATION
  // Estimate current position using elapsed time since last fetch
  let position = track.position
  if (track.isPlaying && trackStartTime !== null) {
    const elapsed = (Date.now() - trackStartTime) / 1000
    position = Math.min(trackStartPosition + elapsed, duration)
  }
  const ratio = Math.max(0, Math.min(1, position / duration))
  const filled = Math.round(ratio * PROGRESS_BAR_LEN)
  const empty = PROGRESS_BAR_LEN - filled
  return '\u2501'.repeat(filled) + '\u2500'.repeat(empty)
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function elapsedDisplay(): string {
  const duration = track.duration > 0 ? track.duration : DEFAULT_DURATION
  let position = track.position
  if (track.isPlaying && trackStartTime !== null) {
    const elapsed = (Date.now() - trackStartTime) / 1000
    position = Math.min(trackStartPosition + elapsed, duration)
  }
  return formatTime(Math.floor(position))
}

// ── Glasses display ─────────────────────────────────────────────
function trackContent(): string {
  const bar = buildProgressBar()
  let t = ''
  t += `${track.title}\n`
  if (track.artist) t += `${track.artist}\n`
  if (track.album) t += `${track.album}\n`
  t += '\n'
  t += `${bar}\n`
  t += '\n'
  t += '\u2191Prev  \u25CFPlay/Pause  \u2193Next'
  return t
}

function headerContent(): string {
  const s = track.isPlaying ? '\u25B6' : '\u25A0' // ▶ or ■
  const elapsed = elapsedDisplay()
  // Pad so elapsed time is right-aligned (canvas ~576px, header ~35px tall)
  const label = `${s} Now Playing`
  const spaces = Math.max(1, 28 - label.length - elapsed.length)
  return label + ' '.repeat(spaces) + elapsed
}

async function updateDisplay() {
  if (!bridge) return
  try {
    await bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: 1, containerName: 'header',
      contentOffset: 0, contentLength: 100,
      content: headerContent(),
    }))
    await bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: 2, containerName: 'track',
      contentOffset: 0, contentLength: 1000,
      content: trackContent(),
    }))
  } catch (e) { console.error('display update failed', e) }
}

async function flashFeedback(msg: string) {
  if (!bridge) return
  try {
    await bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: 2, containerName: 'track',
      contentOffset: 0, contentLength: 1000,
      content: `\n\n        ${msg}`,
    }))
  } catch (_) {}
  setTimeout(() => updateDisplay(), 700)
}

// ── Fetch track from Apps Script ────────────────────────────────
async function fetchNowPlaying() {
  try {
    const r = await fetch(`${APPS_SCRIPT_URL}?action=getNowPlaying&_t=${Date.now()}`)
    if (!r.ok) return
    const d = await r.json()
    if (d.success && d.title) {
      const changed = d.title !== track.title || d.artist !== track.artist
      track.title = d.title || 'Unknown'
      track.artist = d.artist || ''
      track.album = d.album || ''
      track.isPlaying = d.isPlaying ?? true
      const newDuration = Number(d.duration || 0)
      const newPosition = Number(d.position || 0)
      // Update position tracking: store server position and local timestamp
      if (changed || Math.abs(newPosition - track.position) > 5) {
        trackStartPosition = newPosition
        trackStartTime = Date.now()
      }
      track.duration = newDuration
      track.position = newPosition
      if (changed) {
        updatePhoneUI()
      }
      // Always update display to refresh progress bar
      updateDisplay()
    }
  } catch (_) { /* network hiccup, ignore */ }
}

// ── Input events from G2 ──────────────────────────────────────
// Standard G2 control pattern:
//   CLICK (0/undefined)  = Play/Pause toggle
//   SCROLL_BOTTOM (2)    = Next track
//   SCROLL_TOP (1)       = Previous track
//   DOUBLE_CLICK (3)     = Exit app
function handleEvent(eventType: number | undefined) {
  if (debounce) return
  debounce = true
  setTimeout(() => { debounce = false }, 350)

  if (eventType === OsEventTypeList.CLICK_EVENT || eventType === undefined || eventType === 0) {
    // Single tap = Play/Pause
    track.isPlaying = !track.isPlaying
    // Reset position tracking so progress bar reflects new state
    trackStartPosition = track.position
    trackStartTime = Date.now()
    flashFeedback(track.isPlaying ? '\u25B6 Playing' : '\u25A0 Paused')
    postCommand('playpause')
  } else if (eventType === OsEventTypeList.SCROLL_BOTTOM_EVENT || eventType === 2) {
    // Scroll down = Next track
    flashFeedback('\u2193 Next')
    postCommand('next')
  } else if (eventType === OsEventTypeList.SCROLL_TOP_EVENT || eventType === 1) {
    // Scroll up = Previous track
    flashFeedback('\u2191 Prev')
    postCommand('prev')
  } else if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT || eventType === 3) {
    // Double tap = Exit app
    flashFeedback('Goodbye...')
    setTimeout(() => {
      if (bridge && bridge.shutDownPageContainer) {
        bridge.shutDownPageContainer(0)
      }
    }, 500)
  }
}

async function postCommand(cmd: string) {
  try {
    await fetch(`${APPS_SCRIPT_URL}?action=musicCommand&command=${cmd}&_t=${Date.now()}`)
  } catch (_) {}
  // Refresh after short delay
  setTimeout(fetchNowPlaying, 1500)
}

// ── Phone-side UI helpers ───────────────────────────────────────
function updatePhoneUI() {
  const el = document.getElementById('status')
  if (el) el.textContent = `${track.isPlaying ? '\u25B6' : '\u23F8'} ${track.title} \u2013 ${track.artist}`
  const pTitle = document.getElementById('prev-title')
  const pArtist = document.getElementById('prev-artist')
  const pAlbum = document.getElementById('prev-album')
  if (pTitle) pTitle.textContent = track.title
  if (pArtist) pArtist.textContent = track.artist
  if (pAlbum) pAlbum.textContent = track.album
}

function setupPhoneUI() {
  const sendBtn = document.getElementById('send-btn')
  const playPauseBtn = document.getElementById('playpause-btn')
  const nextBtn = document.getElementById('next-btn')
  const prevBtn = document.getElementById('prev-btn')

  sendBtn?.addEventListener('click', () => {
    track.title = (document.getElementById('track-title') as HTMLInputElement)?.value || 'No track'
    track.artist = (document.getElementById('track-artist') as HTMLInputElement)?.value || ''
    track.album = (document.getElementById('track-album') as HTMLInputElement)?.value || ''
    // Push to Apps Script so StudyBudget can read it too
    pushTrackToServer()
    updateDisplay()
    updatePhoneUI()
  })

  playPauseBtn?.addEventListener('click', () => { track.isPlaying = !track.isPlaying; updateDisplay(); updatePhoneUI() })
  nextBtn?.addEventListener('click', () => { flashFeedback('\u2193 Next'); postCommand('next') })
  prevBtn?.addEventListener('click', () => { flashFeedback('\u2191 Prev'); postCommand('prev') })
}

async function pushTrackToServer() {
  try {
    const params = new URLSearchParams({
      action: 'setNowPlaying',
      title: track.title,
      artist: track.artist,
      album: track.album,
      isPlaying: track.isPlaying ? '1' : '0',
      duration: String(track.duration),
      position: String(track.position),
    })
    await fetch(`${APPS_SCRIPT_URL}?${params}`)
  } catch (_) {}
}

// ── Main ────────────────────────────────────────────────────────
async function init() {
  bridge = await waitForEvenAppBridge()

  const result = await bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer({
      containerTotalNum: 2,
      textObject: [
        new TextContainerProperty({
          xPosition: 0, yPosition: 0, width: 576, height: 35,
          borderWidth: 0, borderColor: 0, paddingLength: 4,
          containerID: 1, containerName: 'header',
          content: headerContent(),
          isEventCapture: 0,
        }),
        new TextContainerProperty({
          xPosition: 0, yPosition: 38, width: 576, height: 250,
          borderWidth: 1, borderColor: 5, borderRdaius: 4, paddingLength: 8,
          containerID: 2, containerName: 'track',
          content: trackContent(),
          isEventCapture: 1,
        }),
      ],
    })
  )

  bridge.onEvenHubEvent((event: any) => {
    const et = event?.textEvent?.eventType ?? event?.sysEvent?.eventType ?? event?.listEvent?.eventType
    handleEvent(et)
  })

  setupPhoneUI()

  // Poll for now playing info + update progress bar every 3 seconds
  setInterval(async () => {
    await fetchNowPlaying()
  }, 3000)

  // Also update just the display (progress bar + elapsed time) every 3 seconds
  // The fetchNowPlaying already calls updateDisplay, so this covers cases
  // when no fetch happens (we still want the bar to animate)
  setInterval(() => {
    if (bridge) updateDisplay()
  }, 3000)

  fetchNowPlaying()
}

init().catch(console.error)
