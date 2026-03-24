import { 
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  RebuildPageContainer,
  OsEventTypeList,
} from '@evenrealities/even_hub_sdk'

// State
let currentTrack = { title: 'No track', artist: '', album: '', isPlaying: false }
let bridge: any = null

async function init() {
  // Get bridge - this is injected by the Even app WebView
  bridge = await waitForEvenAppBridge()
  
  setStatus('Connected to G2', true)

  // Create initial glasses display with 2 containers:
  // 1. Header (small text at top)
  // 2. Main content (track info, receives events)
  const result = await bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer({
      containerTotalNum: 2,
      textObject: [
        new TextContainerProperty({
          xPosition: 0,
          yPosition: 0,
          width: 576,
          height: 40,
          borderWidth: 0,
          borderColor: 0,
          paddingLength: 4,
          containerID: 1,
          containerName: 'header',
          content: '  ▶ Now Playing',
          isEventCapture: 0,
        }),
        new TextContainerProperty({
          xPosition: 0,
          yPosition: 44,
          width: 576,
          height: 244,
          borderWidth: 1,
          borderColor: 5,
          borderRdaius: 4,
          paddingLength: 8,
          containerID: 2,
          containerName: 'track',
          content: 'Waiting for music...\n\n\n\n  Tap → Next\n  Tap ← Prev\n  Double Tap → Play/Pause',
          isEventCapture: 1,
        }),
      ],
    })
  )

  console.log('[NowPlaying] createStartUpPageContainer result:', result)

  // Listen for touch events from G2 touchpad and R1 ring
  bridge.onEvenHubEvent((event: any) => {
    const eventType = event?.textEvent?.eventType ?? event?.sysEvent?.eventType ?? event?.listEvent?.eventType
    
    // CLICK_EVENT = 0, but SDK normalizes 0 to undefined
    if (eventType === OsEventTypeList.CLICK_EVENT || eventType === undefined || eventType === 0) {
      handleClick()
    } else if (eventType === OsEventTypeList.DOUBLE_CLICK_EVENT || eventType === 3) {
      handleDoubleTap()
    } else if (eventType === OsEventTypeList.SCROLL_BOTTOM_EVENT || eventType === 2) {
      handleScrollDown()
    } else if (eventType === OsEventTypeList.SCROLL_TOP_EVENT || eventType === 1) {
      handleScrollUp()
    } else if (eventType === OsEventTypeList.FOREGROUND_ENTER_EVENT || eventType === 4) {
      // Refresh display when app comes to foreground
      updateGlassesDisplay()
    }
  })

  // Start polling for now playing info
  startNowPlayingPolling()
  
  // Also set up the phone-side UI
  setupPhoneUI()
}

// Update the glasses display with current track
async function updateGlassesDisplay() {
  if (!bridge) return
  
  const status = currentTrack.isPlaying ? '▶' : '■'
  const headerText = `  ${status} Now Playing`
  
  // Build track display text (fits in ~400 chars)
  let trackText = ''
  trackText += `${currentTrack.title}\n`
  trackText += `${currentTrack.artist}\n`
  if (currentTrack.album) {
    trackText += `${currentTrack.album}\n`
  }
  trackText += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
  trackText += `◀ Prev  │  ${status} Play/Pause  │  Next ▶`
  
  // Update header
  await bridge.textContainerUpgrade(new TextContainerUpgrade({
    containerID: 1,
    containerName: 'header',
    contentOffset: 0,
    contentLength: 100,
    content: headerText,
  }))
  
  // Update track info
  await bridge.textContainerUpgrade(new TextContainerUpgrade({
    containerID: 2,
    containerName: 'track',
    contentOffset: 0,
    contentLength: 1000,
    content: trackText,
  }))
}

function handleClick() {
  // Single tap = next track
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState // try to trigger next
  }
  // Update via phone UI - send message to phone side
  document.dispatchEvent(new CustomEvent('g2-next'))
  // Show feedback
  showFeedback('Next ▶▶')
}

function handleDoubleTap() {
  document.dispatchEvent(new CustomEvent('g2-playpause'))
  currentTrack.isPlaying = !currentTrack.isPlaying
  showFeedback(currentTrack.isPlaying ? '▶ Playing' : '■ Paused')
  updatePhoneUI()
}

function handleScrollDown() {
  // Scroll down = previous (alternative gesture)
  document.dispatchEvent(new CustomEvent('g2-prev'))
  showFeedback('◀◀ Previous')
}

function handleScrollUp() {
  // Volume or other action
}

async function showFeedback(text: string) {
  if (!bridge) return
  await bridge.textContainerUpgrade(new TextContainerUpgrade({
    containerID: 2,
    containerName: 'track',
    contentOffset: 0,
    contentLength: 1000,
    content: `\n\n     ${text}\n`,
  }))
  // Restore after brief delay
  setTimeout(() => updateGlassesDisplay(), 800)
}

function startNowPlayingPolling() {
  // Poll navigator.mediaSession for track info
  setInterval(() => {
    if ('mediaSession' in navigator && navigator.mediaSession.metadata) {
      const meta = navigator.mediaSession.metadata
      const changed = meta.title !== currentTrack.title || meta.artist !== currentTrack.artist
      currentTrack.title = meta.title || 'Unknown'
      currentTrack.artist = meta.artist || 'Unknown artist'
      currentTrack.album = meta.album || ''
      if (changed) {
        updateGlassesDisplay()
        updatePhoneUI()
      }
    }
  }, 2000)
}

function setupPhoneUI() {
  // The phone side shows a form for manual track entry
  // and displays current state
  const app = document.getElementById('app')
  
  // Add event listeners for manual input
  const titleInput = document.getElementById('track-title') as HTMLInputElement
  const artistInput = document.getElementById('track-artist') as HTMLInputElement
  const albumInput = document.getElementById('track-album') as HTMLInputElement
  const sendBtn = document.getElementById('send-btn')
  const playPauseBtn = document.getElementById('playpause-btn')
  const nextBtn = document.getElementById('next-btn')
  const prevBtn = document.getElementById('prev-btn')
  
  sendBtn?.addEventListener('click', () => {
    currentTrack.title = titleInput?.value || 'No track'
    currentTrack.artist = artistInput?.value || ''
    currentTrack.album = albumInput?.value || ''
    updateGlassesDisplay()
    flashAction('Sent to G2')
  })
  
  playPauseBtn?.addEventListener('click', () => {
    currentTrack.isPlaying = !currentTrack.isPlaying
    updateGlassesDisplay()
    updatePhoneUI()
    flashAction(currentTrack.isPlaying ? '▶ Playing' : '■ Paused')
  })
  
  nextBtn?.addEventListener('click', () => {
    showFeedback('Next ▶▶')
    flashAction('⏭ Next')
  })
  prevBtn?.addEventListener('click', () => {
    showFeedback('◀◀ Previous')
    flashAction('⏮ Prev')
  })
  
  // Listen for G2/R1 gesture events
  document.addEventListener('g2-next', () => { flashAction('⏭ Next (G2)') })
  document.addEventListener('g2-prev', () => { flashAction('⏮ Prev (G2)') })
  document.addEventListener('g2-playpause', () => { updatePhoneUI() })
}

function updatePhoneUI() {
  const statusEl = document.getElementById('status')
  if (statusEl) {
    statusEl.textContent = `${currentTrack.isPlaying ? '▶' : '⏸'} ${currentTrack.title} - ${currentTrack.artist}`
    statusEl.className = 'status ok'
  }
  
  const playstateEl = document.getElementById('ph-playstate')
  if (playstateEl) {
    playstateEl.textContent = currentTrack.isPlaying ? '▶ Playing' : '⏸ Paused'
    playstateEl.className = currentTrack.isPlaying ? 'badge playing' : 'badge paused'
  }
  
  // Update preview pane
  const prevTitle = document.getElementById('prev-title')
  const prevArtist = document.getElementById('prev-artist')
  const prevAlbum = document.getElementById('prev-album')
  const prevHeading = document.getElementById('prev-heading')
  if (prevTitle)   prevTitle.textContent = currentTrack.title
  if (prevArtist)  prevArtist.textContent = currentTrack.artist
  if (prevAlbum)   prevAlbum.textContent = currentTrack.album
  if (prevHeading) prevHeading.textContent = currentTrack.isPlaying ? '▶ Now Playing' : '■ Paused'
}

function setStatus(msg: string, ok = true) {
  const el = document.getElementById('status')
  if (!el) return
  el.textContent = msg
  el.className = ok ? 'status ok' : 'status error'
}

function flashAction(label: string) {
  const el = document.getElementById('last-action')
  if (!el) return
  el.textContent = label
  el.classList.add('flash')
  setTimeout(() => el.classList.remove('flash'), 600)
}

// Start the app
init().catch((err) => {
  console.error('[NowPlaying] init error:', err)
  const el = document.getElementById('status')
  if (el) {
    el.textContent = 'Bridge unavailable — manual mode only'
    el.className = 'status error'
  }
  // Still wire up phone UI for manual mode
  setupPhoneUI()
})
