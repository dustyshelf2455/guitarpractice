# Timebox

A timeboxed guitar practice app for your phone. A session is 60 minutes, split into twelve 5-minute blocks. Each block tells you exactly what to practise today. Run the timer, rate each block 1 to 5 stars, and watch your habits and weak spots in Stats.

It is a Progressive Web App: plain HTML, CSS and JavaScript, no build step, no dependencies, no accounts. Everything is stored on your device and it works offline.

## Put it on your phone

The app is live at **https://dustyshelf2455.github.io/guitarpractice/**, served by GitHub Pages (Settings → Pages → Deploy from a branch → `claude/relaxed-ride-7bhyk8`, `/ (root)`). Every push to that branch redeploys it within a minute or two. If you later move the code to `main`, switch the Pages branch to `main` too.

Install it:
- **iPhone (Safari):** open the link, tap **Share → Add to Home Screen**.
- **Android (Chrome):** open the link, tap **⋮ → Install app** (or the install banner).

Install it rather than using it in a browser tab. Installed, it opens full screen, and Safari will not clear its data. Safari can delete data for websites you haven't visited in 7 days, but not for home-screen apps.

**Updating:** the app checks for a new version whenever you bring it to the front (and every half hour while it's open). It switches over by itself at a quiet moment: never while a block is running, the metronome is playing or a sheet is open. Your session and blocks carry on exactly where they were, and a note says "Timebox is up to date". (Versions before this one didn't do that: if your app still looks old, swipe it away in the app switcher and open it again, twice.)

## How it works

| You do | It does |
|---|---|
| Tap a block | Opens it **full screen**, ready: the item and its diagram fill the screen (a fretboard is always drawn whole, as big as the space allows), with a slim timer strip at the bottom: the countdown, a thin progress line, and the buttons (on a phone held sideways, a narrow column on the right). Nothing starts yet. |
| **Begin** | Starts the block's 5:00 countdown, and the metronome. Beginning a block pauses any other running block. |
| 🎲 **Re-roll** (under Begin, or on the block in the grid) | Not in the mood for this one? Shows another item from the same list (the one done longest ago first); tap as often as you like, it cycles round. Only before you begin, and not on a locked block. The new item stays for this session. |
| **Lock** on a full-screen block (or in its rating sheet) | Keeps this item in this block every day, through new plans, until you unlock it: for the song you're focusing on this week. A locked block has a brass inner border and a padlock, and can't be re-rolled. Unlock the same way, or in Settings → Practice slots. |
| Tap the countdown or **Pause** | Pauses the block and the metronome. Tap again to resume both. **Finish** appears while paused, to complete it early. |
| **All blocks** (top left), or the back gesture | Returns to the grid and stops the metronome. The block keeps running, and tapping it reopens full screen. |
| **Pause / Resume** (top of grid) | Pauses or resumes the whole session. Resume reopens the block full screen. |
| ⇄ on a block | Swaps in the next item from that block's list. Tap again to keep cycling. Only on blocks you haven't started. |
| Block hits 0:00 | Chimes and vibrates (vibration is Android only). A metronome that is playing drops to half volume, so you can finish the phrase. Tap **Finish and rate**, choose stars, and you're back at the grid. |
| Tap a finished block | Change its rating, or reopen it: **Continue** picks up with the time it had left, **Do it over** starts again from 5:00. For a block finished by mistake. |
| **End** (bottom) | Ends the session. It is saved as partial if not every block is done, and discarded if none are. |
| 🔗 on a block | Opens that item's link (backing track, tab, YouTube lesson). |
| **Edit** / **Add notes** on a full-screen block | Opens the item: its notes, its link, and its diagrams (paste a tab or a chord sheet right there). Your notes show under the diagrams. |
| Metronome (bottom, or top right when full screen) | A wooden click track with accents. It starts by itself when you Begin or Resume a block and stops when you pause, finish or go back to the grid (turn that off in Settings → Metronome). Its tempo is the one you last chose, carried from block to block, except on a block that names its own ("70 bpm"); resuming a block keeps whatever tempo it had. While it plays, a glow swings across the top of the screen in time (handy with the phone on silent), and it shows its tempo at the top of a full-screen block. |

**Notes and links:** every item can have notes (anything to remember: where you got to, the capo, what to watch) and a link (a YouTube lesson, a backing track, a tab). Add them from the full-screen block (**Edit**), or in Settings → Library → a subtype → tap an item.

**Diagrams:** a block can show scale shapes, arpeggios, chord shapes, a song's chord chart, a lick's tab, or a strumming pattern on its full-screen card. The starter library has them for its scales, chords, picking patterns, strumming, licks and pentatonic or blues items. To add or change one, tap **Edit** on the block (or go to Settings → Library → a subtype → tap an item) → **Diagrams**, then **Add a diagram** or **Edit** an existing one:

- **Scale** or **Arpeggio**: pick the root, the scale (major, minor, pentatonics, blues, modes) or chord type, and the position ("open position" or a starting fret). The dots show note names or intervals. Roots are solid.
- **Chords**: type names like `C G Am F`. It knows the common open shapes and plays any other chord as an E- or A-shape barre. Add `:E` or `:A` to pick the barre shape (`G:E`). Supported types: major, m, 7, maj7, m7, sus2, sus4, 5, plus open Cadd9.
- **Song chord chart**: one section per line, like `Verse: G C G D x2`, plus `Capo: 2` or `Key: G` if you like. Or paste a whole chord sheet, from Ultimate Guitar say: only the chords and section names are kept, lyrics are left out, and repeated verses and phrases are folded up. The card shows the chords by section and a chord box for each chord.
- **Tab (a lick or riff)**: paste six-line tab, high e on top. It understands hammer-ons (h), pull-offs (p), slides (/ and \\), bends (7b9), bend and release (7b9r7), vibrato (~) and bar lines. The card draws it with the note names above.
- **Strumming pattern**: tap each slot to choose down ↓, up ↑, muted chuck × or a miss, and tap > to accent it; pick 4/4 or 3/4, eighths or sixteenths. With the metronome on, the card lights each strum in time.
- When the item's text names a scale, arpeggio, chords or a strumming pattern (e.g. "B minor scale, 2nd position", "D DU UDU"), the editor suggests it, and new items get it automatically.

**Licks:** the last slot practises a lick: stock bluegrass, blues, country and folk licks around G, C and D (the G run, a C minor pentatonic run, a blues turnaround, a Chuck Berry double stop and more), each with tab and a note on how to practise it, plus "Find a new lick on YouTube and learn it". The tabs were written from teaching sources' descriptions and checked note by note. Add your own the same way.

**Appearance** (Settings → Appearance):

- **Style:** *Lounge* (default) is forest green and parchment with brass accents, the Fraunces serif, faint paper grain and double-rule borders. *Classic* is the original plain high-contrast look.
- **Theme:** Auto follows your phone's light/dark setting; Dark and Light force one.
- **Blocks:** *Grid* shows all twelve at once (3×4). *List* shows full-width rows, six to a screen, and scrolls.

**iPad:** on a tablet (sized for the 13" iPad Pro) the whole interface scales up about 1.6× for easy reading. In landscape the grid is 4×3.

**Diagrams full screen:** held upright, scales and runs are drawn on an upright neck (low E on the left, nut at the top), as big as the screen allows. Sideways, the neck runs across. Chord charts sit in a grid.

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
- A finished block can be reopened in today's session, including the last block of a session that just ended (the session comes back). Its item returns to its earlier place in the rotation, so a mistaken finish doesn't push it to the back of the queue.
- The 45-character item limit is a soft warning, not a hard stop.
- "Reset library to defaults" keeps all session history.
- Requested extras: an optional link per library item, and the built-in metronome.
- A lock belongs to the block's slot. Changing that slot's subtype in Settings, or archiving the item, releases it.
- Licks have their own subtype (under Improvisation) and the 12th slot, which used to be a second Backing track. An installed app switches that slot only if the slots were never changed; either way it can be changed back in Settings → Slots. "Riffs and licks" is now just "Riffs".
- A pasted chord sheet keeps chords and section names only, never lyrics.

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
NODE_PATH=$(npm root -g) node tests/e2e/blocks.cjs     # Begin, re-roll, locking a block across days
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
