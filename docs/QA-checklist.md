# Real-phone QA checklist

The automated tests cover the logic and run the UI in a desktop browser engine with a fake clock. These checks need a real phone. Do them on the installed app (home-screen icon), not a browser tab, unless the step says otherwise.

Note the iOS and Android versions you test on. ✅ = works, ❌ = broken (note what happened).

## Install

- [ ] **iOS:** Safari → Share → Add to Home Screen. The icon looks right, and it opens full screen with no Safari bars.
- [ ] **Android:** Chrome offers Install app, the icon looks right, and it opens full screen.
- [ ] The status bar area and the bottom home indicator don't cover the clock or the bottom toolbar.
- [ ] Rotating the phone doesn't break anything (the app is meant for portrait).

## Timer and session

- [ ] Tap a block: it turns light (dark in light mode) and counts down; the session clock counts down with it.
- [ ] Tap it again to pause (dashed outline), then again to resume.
- [ ] Start a second block: the first one pauses.
- [ ] Top **Pause** pauses everything; **Resume** restarts the same block.
- [ ] **Finish** on a paused block opens the rating sheet; its recorded time matches.
- [ ] Finish and rate a block full screen: the next unfinished block slides in, ready with **Begin**, and nothing is running until you tap it. After the last block you're on the grid.
- [ ] Tap a finished block: the sheet offers **Continue · m:ss left** and **Do it over**. Continue picks up where it stopped; Do it over starts from 5:00. Both open the block full screen.

## Chime, vibration, screen

- [ ] Ringer switch ON (iOS): when a block hits 0:00, the chime plays. (iOS mutes web audio when the ringer switch is off.)
- [ ] Android: the phone vibrates at 0:00.
- [ ] While a block runs, the screen doesn't dim or lock by itself (wake lock). Leave it for longer than your auto-lock time.
- [ ] Pause everything: the screen can lock normally again.

## Screen lock and backgrounding (the important one)

- [ ] Start a block, lock the phone for 2 minutes, unlock: the time is right (about 2 minutes less) and didn't freeze.
- [ ] Start a block, lock the phone for 7 minutes, unlock: the block shows **Time's up**, the session clock lost exactly 5:00, and no late chime plays a minute later.
- [ ] Start a block, switch to another app (e.g. YouTube for a backing track) for a minute, then come back: the time is right.
- [ ] Note: on iOS the chime can't play while the phone is locked or Timebox is in the background (iOS pauses web apps). It plays if you come back within about 30 seconds. Android may behave better.
- [ ] Start a block, swipe the app away completely (force close), reopen it: the session and the running block are exactly where they should be.
- [ ] Over a full hour with a few lock/unlock cycles, the session clock stays within a second of a separate stopwatch.

## Audio together with other apps

- [ ] Play a backing track in another app (Spotify, YouTube), then run Timebox: the chime plays over it without stopping the music.
- [ ] Metronome: start it, close the sheet. It keeps clicking and the toolbar shows the bpm. It stays steady (no drift or stutter) for a few minutes.
- [ ] On a block that says "70 bpm", the metronome offers "Use 70 bpm from this block".
- [ ] **Tap** in the metronome sheet: tap along four or five times and the bpm follows; a pause of a few seconds starts a fresh count.
- [ ] Metronome on in a full-screen block: at 0:00 the chime plays and the click carries on at half volume. Going back to the grid stops it.
- [ ] After turning the metronome off and on again (from a block), it clicks.

## Begin, re-roll, lock

- [ ] Tap a block: it opens full screen showing 5:00 and **Begin**; the clock doesn't move until you tap Begin.
- [ ] Begin: the metronome starts (ringer switch on). Pause: it stops. Resume: it starts again at the same tempo.
- [ ] Change the tempo in the metronome sheet, finish, open another block and Begin: it uses your new tempo. A block that says "70 bpm" uses 70.
- [ ] Re-roll a block a few times before beginning; go back to the grid and reload: the block keeps the last one.
- [ ] Lock a song: brass inner border and padlock on its tile. Next day it's still there in the same block.

## Licks, songs, strumming

- [ ] The last block of the day is a lick, with its tab, note names and chord boxes, and practice notes underneath.
- [ ] On a strumming block, start the metronome: each arrow lights in time with the clicks (downs on the numbers, ups on the "&").
- [ ] On a song block, tap **Add notes**, type a note, save: it shows under the chords straight away.
- [ ] In Ultimate Guitar, copy a whole chord sheet; in Timebox, Edit a song → Add a diagram → Song chord chart → paste. Only chords and section names remain.
- [ ] Paste a tab for a lick (Edit → Add a diagram → Tab): the preview matches.

## Data

- [ ] Complete a few blocks with ratings, close the app, reopen: everything is still there.
- [ ] The next day, the plan is different (yesterday's completed items moved to the back) and stays the same all day.
- [ ] Settings → Export backup: the share sheet appears (iOS: Save to Files works). The file opens as text.
- [ ] Settings → Import that file: the summary appears and Merge says nothing new.
- [ ] Airplane mode, then open the app: it works fully offline.

## Accessibility and comfort

- [ ] Larger system text size (iOS Settings → Display → Text Size; Android → Font size): text gets bigger, nothing overlaps, and the grid scrolls if it must.
- [ ] Light and dark system appearance both look right; Settings → Theme overrides them.
- [ ] Reduce Motion on: no slide animations.
- [ ] VoiceOver / TalkBack reads each block's item, area, state and time left.
- [ ] One-handed: you can reach Pause, End, Metronome, Stats and Settings comfortably.
