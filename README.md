# Now Playing — Even Hub Plugin for G2 Glasses

Displays currently playing music on your **Even G2 glasses** and lets you
control playback via **R1 ring gestures**.

## Features

| Gesture | Action |
|---|---|
| **Single tap** | Next track |
| **Double tap** | Play / Pause toggle |
| **Scroll to bottom** | Previous track |

The plugin automatically reads track info via the **Web Media Session API**
when the Even Realities app WebView exposes it. If not available, a manual
input form on the phone side lets you type in the current song so your
glasses always show the right info.

### Glasses display layout

```
♪ Now Playing
Bohemian Rhapsody
Queen
A Night at the Opera
◀ tap·next  ▶  dbl·play/pause
```

---

## Requirements

- Node.js 18+
- npm 9+
- Even Realities app (iOS / Android) with Even Hub enabled
- Even G2 glasses (physical device required for full testing)

---

## Development

### 1. Install dependencies

```bash
npm install
```

### 2. Run dev server

```bash
npm run dev
```

Open `http://localhost:5173` in your browser. You'll see the phone-side UI.

To test with the glasses, load this URL inside the Even Hub SDK dev tool
or point the Even Realities app at your machine's local IP address
(e.g. `http://192.168.1.x:5173`).

### 3. Build for production

```bash
npm run build
```

Output is written to `dist/`.

---

## Packaging and Publishing

### 4. Log in to Even Hub

```bash
npx @evenrealities/evenhub-cli login
```

This opens a browser window for authentication with your Even Realities account.

### 5. Pack the plugin

```bash
npx @evenrealities/evenhub-cli pack app.json dist
```

Or use the shortcut:

```bash
npm run pack
```

This produces a `.ehpk` file (e.g. `com.jay.nowplaying-1.0.0.ehpk`) in the
project root.

### 6. Install via Even Hub

1. Open the **Even Realities** app on your phone.
2. Go to **Even Hub** → **My Plugins** → **+** (add).
3. Tap **Upload .ehpk file** and select the generated file.
4. The plugin appears in your hub — tap to launch.

---

## Project Structure

```
evenhub-nowplaying/
├── app.json          # Plugin metadata (package_id, version, etc.)
├── package.json      # npm scripts and dependencies
├── tsconfig.json     # TypeScript compiler config
├── vite.config.ts    # Vite build config
├── index.html        # Phone-side UI entry point
├── src/
│   └── main.ts       # Core plugin logic
└── README.md         # This file
```

---

## How it works

```
┌───────────────────────────────────────────────────────┐
│  Even Realities App (WebView)                         │
│                                                       │
│  index.html ──loads──> src/main.ts                    │
│       │                     │                        │
│  Phone-side UI          waitForEvenAppBridge()        │
│  (track form,           ────────────────────►        │
│   play controls)        bridge (BLE proxy)            │
│                              │                        │
│                    onEvenHubEvent(event)               │
│                    ◄── tap / double-tap ──            │
│                              │                        │
│                    buildGlassesPage(bridge, track)    │
│                    ──► createStartUpPageContainer()   │
└───────────────────────────────────────────────────────┘
                              │
                    BLE / Even OS
                              │
                    ┌─────────▼─────────┐
                    │  Even G2 Display  │
                    │  ♪ Now Playing    │
                    │  Track Title      │
                    │  Artist Name      │
                    └───────────────────┘
```

The `navigator.mediaSession` API is polled every 2 seconds. On iOS WebViews
that expose media metadata (e.g. when Apple Music or Spotify is playing in
the background), the glasses display updates automatically without any
manual input.

---

## SDK Reference

| API | Description |
|---|---|
| `waitForEvenAppBridge()` | Awaits BLE bridge connection |
| `bridge.onEvenHubEvent(cb)` | Register gesture / system event handler |
| `bridge.createStartUpPageContainer(container)` | Push UI to glasses |
| `new TextContainerProperty({…})` | Define a text row on the display |
| `new CreateStartUpPageContainer({…})` | Bundle rows into a page |

Event types (`OsEventTypeList`):

| Value | Name | Source |
|---|---|---|
| 0 | `CLICK_EVENT` | Ring tap, temple tap |
| 3 | `DOUBLE_CLICK_EVENT` | Ring double-tap |
| 4 | `FOREGROUND_ENTER_EVENT` | App foregrounded |
| 2 | `SCROLL_BOTTOM_EVENT` | Scrolled to bottom |

---

## Customisation

- **Change gestures**: Edit the `switch (eventType)` block in `src/main.ts`.
- **Change layout**: Adjust `xPosition`, `yPosition`, `width`, `height` in
  `buildGlassesPage()`. The G2 HUD logical resolution is 640 × 200 px.
- **Add list scrolling**: Replace `TextContainerProperty` rows with
  `ListContainerProperty` objects for interactive scrollable lists.

---

## License

MIT — build freely, share generously.
