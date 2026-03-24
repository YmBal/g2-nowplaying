import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'

// ── Config ──────────────────────────────────────────────────────
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxK__w9uR7ETSXSDCP8WYVie0cNes5fj_WwDGpHnocoOvJCHLbxSd1GnOIptog6A_ry/exec'

// ── State ───────────────────────────────────────────────────────
let bridge: any = null
let track = { title: 'Waiting...', artist: '', album: '', isPlaying: false }
let debounce = false

// ── Glasses display ─────────────────────────────────────────────
function trackContent(): string {
  const s = track.isPlaying ? '\u25B6' : '\u25A0' // ▶ or ■
  let t = ''
  t += `${track.title}\n`
  if (track.artist) t += `${track.artist}\n`
  if (track.album) t += `${track.album}\n`
  t += '\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\n'
  t += `\u25C0 Prev  \u2502  ${s} Play/Pause  \u2502  Next \u25B6`
  return t
}

function headerContent(): string {
  const s = track.isPlaying ? '\u25B6' : '\u25A0'
  return `  ${s} Now Playing`
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
      if (changed) {
        updateDisplay()
        updatePhoneUI()
      }
    }
  } catch (_) { /* network hiccup, ignore */ }
}

// ── Input events from G2 / R1 ──────────────────────────────────
function handleEvent(eventType: number | undefined) {
  if (debounce) return
  debounce = true
  setTimeout(() => { debounce = false }, 350)

  if (eventType === OsEventTypeList.CLICK_EVENT || eventType === undefined || eventType === 0) {
    flashFeedback('Next \u25B6\u25B6')
    postCommand('next')
  } else if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT || eventType === 3) {
    track.isPlaying = !track.isPlaying
    flashFeedback(track.isPlaying ? '\u25B6 Playing' : '\u25A0 Paused')
    postCommand('playpause')
  } else if (eventType === OsEventTypeList.SCROLL_BOTTOM_EVENT || eventType === 2) {
    flashFeedback('\u25C0\u25C0 Previous')
    postCommand('prev')
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
  nextBtn?.addEventListener('click', () => flashFeedback('Next \u25B6\u25B6'))
  prevBtn?.addEventListener('click', () => flashFeedback('\u25C0\u25C0 Previous'))
}

async function pushTrackToServer() {
  try {
    const body = JSON.stringify({ title: track.title, artist: track.artist, album: track.album, isPlaying: track.isPlaying })
    await fetch(`${APPS_SCRIPT_URL}?action=setNowPlaying`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
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
          xPosition: 0, yPosition: 0, width: 576, height: 40,
          borderWidth: 0, borderColor: 0, paddingLength: 4,
          containerID: 1, containerName: 'header',
          content: headerContent(),
          isEventCapture: 0,
        }),
        new TextContainerProperty({
          xPosition: 0, yPosition: 44, width: 576, height: 244,
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

  // Poll for now playing info every 3 seconds
  setInterval(fetchNowPlaying, 3000)
  fetchNowPlaying()
}

init().catch(console.error)
