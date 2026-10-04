# Timebox

A timeboxed guitar practice app for your phone. A session is 60 minutes, split into twelve 5-minute blocks. Each block tells you exactly what to practise today. Run the timer, rate each block 1 to 5 stars, and watch your habits and weak spots in Stats.

It is a Progressive Web App: plain HTML, CSS and JavaScript, no build step, no dependencies, no accounts. Everything is stored on your device and it works offline.

## Put it on your phone

The app is live at **https://dustyshelf2455.github.io/guitarpractice/**, served by GitHub Pages (Settings → Pages → Deploy from a branch → `claude/relaxed-ride-7bhyk8`, `/ (root)`). Every push to that branch redeploys it within a minute or two. If you later move the code to `main`, switch the Pages branch to `main` too.

Install it:
- **iPhone (Safari):** open the link, tap **Share → Add to Home Screen**.
- **Android (Chrome):** open the link, tap **⋮ → Install app** (or the install banner).

Install it rather than using it in a browser tab. Installed, it opens full screen, and Safari will not clear its data. Safari can delete data for websites you haven't visited in 7 days, but not for home-screen apps.

**Updating:** when new code is pushed, the installed app picks it up the next time you open it with a connection. Close it fully and reopen if you want the update immediately.

## How it works

| You do | It does |
|---|---|
| Tap a block | Starts its 5:00 countdown and opens it **full screen**: the item, a big countdown ring, and Pause. Starting a block pauses any other running block. |
| Tap the ring or **Pause** | Pauses the block. Tap again to resume. **Finish** appears while paused, to complete it early. |
| **All blocks** (top left), or the back gesture | Returns to the grid. The block keeps running, and tapping it reopens full screen. |
| **Pause / Resume** (top of grid) | Pauses or resumes the whole session. Resume reopens the block full screen. |
| ⇄ on a block | Swaps in the next item from that block's list. Tap again to keep cycling. Only on blocks you haven't started. |
| Block hits 0:00 | Chimes and vibrates (vibration is Android only). Tap **Finish and rate**, choose stars, and you're back at the grid. |
| **End** (bottom) | Ends the session. It is saved as partial if not every block is done, and discarded if none are. |
| 🔗 on a block | Opens that item's link (backing track, tab, video). |
| Metronome (bottom, or top right when full screen) | A wooden click track with accents. While it plays, a glow swings across the top of the screen in time, landing on each click (handy with the phone on silent). It offers the tempo from the current block, e.g. "70 bpm". It keeps playing when the sheet is closed. |

**Diagrams:** a block can show scale shapes, arpeggios or chord charts on its full-screen card. The starter library has them for its scales, chords, picking patterns and pentatonic or blues items. To add or change one, go to Settings → Library → a subtype → tap an item → **Diagrams**:

- **Scale** or **Arpeggio**: pick the root, the scale (major, minor, pentatonics, blues, modes) or chord type, and the position ("open position" or a starting fret). The dots show note names or intervals. Roots are solid.
- **Chords**: type names like `C G Am F`. It knows the common open shapes and plays any other chord as an E- or A-shape barre. Add `:E` or `:A` to pick the barre shape (`G:E`). Supported types: major, m, 7, maj7, m7, sus2, sus4, 5, plus open Cadd9.
- When the item's text names a scale, arpeggio or chords (e.g. "B minor scale, 2nd position"), the editor suggests it, and new items get it automatically.

**Appearance** (Settings → Appearance):

- **Style:** *Lounge* (default) is forest green and parchment with brass accents, the Fraunces serif, faint paper grain and double-rule borders. *Classic* is the original plain high-contrast look.
- **Theme:** Auto follows your phone's light/dark setting; Dark and Light force one.
- **Blocks:** *Grid* shows all twelve at once (3×4). *List* shows full-width rows, six to a screen, and scrolls.

**iPad:** on a tablet (sized for the 13" iPad Pro) the whole interface scales up about 1.6× for easy reading. In landscape the grid is 4×3, and a full-screen block puts its diagram beside the dial.

**Which item comes up:** each block has a subtype (Warm-up, Scales, Songs, and so on). Within a subtype, the item you completed longest ago comes first, and items you've never done come before everything. Only completed blocks count, so anything you skip stays next in line. Today's plan is fixed the first time you open the app each day.

**Settings:** choose what each of the 12 slots practises and in what order. Edit the library (add, edit, reorder, add links, archive). Add areas and subtypes. Pick the theme. Export or import a backup, and reset the library to defaults. Archived items leave the rotation but keep their history.

**Stats:** streaks, sessions per week, a 13-week practice calendar, totals, your rating trend, and time share by area. Tap an area to see its subtypes, then a subtype to see its items. "Weak spots" lists your lowest-rated items, and History has every session block by block. A day counts toward your streak once any block is completed.

## Your data

- It lives in your browser's storage on this device only (IndexedDB). Nothing is sent anywhere.
- **Back up now and then:** go to Settings → Export backup. On a phone this opens the share sheet, where "Save to Files" works well.
- **Import** shows exactly what will change before anything happens. **Merge** only adds what's missing; **Replace** swaps everything for the file.

## Decisions made beyond the original spec

- A session left unfinished on an earlier day is closed as partial once it has been untouched for an hour. A session that is still going past midnight is kept, and it keeps the plan of the day it started.
- Ending a session with no completed blocks discards it rather than saving an empty session.
- After a session ends, the screen shows its result. **New** starts another session with a fresh plan from the rotation.
- You can tap a completed block (or a block in History) to change its rating.
- The 45-character item limit is a soft warning, not a hard stop.
- "Reset library to defaults" keeps all session history.
- Requested extras: an optional link per library item, and the built-in metronome.

## Testing on a real phone

Some things can only be checked on a real device (screen lock, audio, wake lock, installing). Work through [docs/QA-checklist.md](docs/QA-checklist.md) on your iPhone and/or Android phone.

## Development

No build step. Serve the folder with any static server:

```sh
npm run serve          # http://localhost:8080 (uses npx http-server)
npm test               # unit tests: timer engine, rotation, stats, import/export, app model
```

End-to-end tests drive headless Chromium with a fake clock (Playwright installed globally):

```sh
NODE_PATH=$(npm root -g) node tests/e2e/smoke.cjs      # session flow, reload, full 60-minute run
NODE_PATH=$(npm root -g) node tests/e2e/settings.cjs   # library, slots, theme, export/import, reset
NODE_PATH=$(npm root -g) node tests/e2e/offline.cjs    # service worker and offline reload
NODE_PATH=$(npm root -g) node tests/e2e/audio.cjs      # chime scheduling against the real audio clock
```

Other tools:

- `node tools/make-demo-data.mjs > demo.json` writes about ten weeks of realistic practice you can import to try out Stats. Use **Replace** on a test device, not your real one.
- `NODE_PATH=$(npm root -g) node tools/make-icons.cjs` re-renders the PNG icons from the SVGs.

**When you change any file, bump `VERSION` in `sw.js`** so installed apps fetch the new version. `tests/pwa.test.js` fails if a file is missing from the service worker's list.

### Layout

```
index.html, manifest.webmanifest, sw.js   PWA shell
css/app.css                               structure and the Classic style
css/lounge.css                            the Lounge style (default)
fonts/                                    Fraunces (SIL Open Font License, see fonts/OFL.txt)
js/engine.js     timer engine: pure, timestamp-based
js/plan.js       daily plan, rotation, swap
js/state.js      app model: actions, persistence, change events
js/store.js      IndexedDB (localStorage fallback)
js/stats.js      statistics (pure)
js/transfer.js   export, import validation, merge/replace
js/charts.js     hand-rolled SVG charts
js/music.js      music theory: spelled scales, arpeggios, positions, chord shapes
js/diagrams.js   fretboard and chord-box SVG
js/audio.js      chime, audio unlock, metronome
js/views/        session, settings, stats, sheets, metronome
tests/           unit tests (node --test) and e2e scripts
```
