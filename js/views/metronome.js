// Metronome sheet. The click keeps going when the sheet is closed; the toolbar
// button shows the tempo while it plays. If the current block mentions a tempo
// ("70 bpm") the metronome offers it.

import { el, icon, parseBpm, setDigits } from '../util.js';
import { metronome, freshAudio } from '../audio.js';
import { openSheet } from './sheets.js';

export function openMetronomeSheet(app, { onChange }) {
  const settings = app.settings.metronome;
  if (!metronome.playing) {
    metronome.setBpm(settings.bpm);
    metronome.beats = settings.beats;
    metronome.accent = settings.accent;
  }

  // A tempo from the running (or last active) block.
  const s = app.active;
  const blockIndex = s ? (s.running ?? s.last_tile) : null;
  const blockBpm = blockIndex != null ? parseBpm(s.tiles[blockIndex].item_text) : null;

  const bpmValue = el('output', { class: 'metro-bpm', 'aria-live': 'polite' });
  const slider = el('input', {
    type: 'range', min: '30', max: '260', step: '1', class: 'metro-slider', 'aria-label': 'Tempo in beats per minute',
    oninput: (e) => setBpm(Number(e.target.value)),
  });
  const pulse = el('div', { class: 'metro-pulse', 'aria-hidden': 'true' });
  const playBtn = el('button', { class: 'btn btn-primary metro-play', type: 'button', onclick: toggle });
  const blockChip = blockBpm && blockBpm !== metronome.bpm
    ? el('button', { class: 'chip', type: 'button', onclick: () => { setBpm(blockBpm); blockChip.hidden = true; } },
      `Use ${blockBpm} bpm from this block`)
    : null;

  const step = (d, label) => el('button', { class: 'step-btn', type: 'button', 'aria-label': label, onclick: () => setBpm(metronome.bpm + d) },
    d > 0 ? `+${d}` : `−${-d}`);

  // Tap tempo: tap along a few times and the tempo follows (the last few taps, averaged).
  let taps = [];
  const tapBtn = el('button', {
    class: 'btn metro-tap', type: 'button', 'aria-label': 'Tap tempo: tap along to set the tempo',
    onclick: () => {
      const now = performance.now();
      if (taps.length && now - taps[taps.length - 1] > 2500) taps = []; // a pause starts over
      taps.push(now);
      taps = taps.slice(-6);
      tapBtn.classList.remove('tapped');
      void tapBtn.offsetWidth;
      tapBtn.classList.add('tapped');
      if (taps.length < 2) return;
      const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      setBpm(60000 / avg);
    },
  }, 'Tap');

  const beatsGroup = el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': 'Accent the first beat of every' });
  const beatOptions = [[0, 'Off'], [2, '2'], [3, '3'], [4, '4']];
  for (const [n, label] of beatOptions) {
    beatsGroup.append(el('button', {
      type: 'button', role: 'radio', class: 'seg', dataset: { beats: String(n) },
      'aria-label': n ? `Accent every ${n} beats` : 'No accent',
      onclick: () => setBeats(n),
    }, label));
  }

  function setBpm(bpm) {
    metronome.setBpm(bpm);
    render();
    save();
  }

  function setBeats(n) {
    metronome.beats = n;
    metronome.accent = n > 0;
    render();
    save();
  }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      app.updateSettings({ metronome: { ...app.settings.metronome, bpm: metronome.bpm, beats: metronome.beats, accent: metronome.accent } });
    }, 400);
  }

  function toggle() {
    if (metronome.playing) metronome.stop();
    else {
      freshAudio(); // inside the tap: guarantees sound on iOS even after a long pause
      metronome.start();
    }
    render();
    onChange();
  }

  function render() {
    setDigits(bpmValue, String(metronome.bpm));
    slider.value = String(metronome.bpm);
    playBtn.replaceChildren(icon(metronome.playing ? 'pause' : 'play'), metronome.playing ? 'Stop' : 'Start');
    playBtn.setAttribute('aria-pressed', String(metronome.playing));
    for (const b of beatsGroup.children) {
      const on = Number(b.dataset.beats) === (metronome.accent ? metronome.beats : 0);
      b.setAttribute('aria-checked', String(on));
    }
  }

  const stopListening = metronome.onBeat((beat, strong) => {
    pulse.classList.remove('beat', 'strong');
    void pulse.offsetWidth; // restart the flash
    pulse.classList.add('beat');
    if (strong) pulse.classList.add('strong');
  });

  render();
  return openSheet({
    title: 'Metronome',
    className: 'metro-sheet',
    content: [
      el('div', { class: 'metro-display' },
        step(-5, 'Slower by 5'), step(-1, 'Slower by 1'),
        el('div', { class: 'metro-readout' }, bpmValue, el('span', { class: 'metro-unit', text: 'bpm' }), pulse),
        step(1, 'Faster by 1'), step(5, 'Faster by 5'),
      ),
      slider,
      blockChip,
      el('div', { class: 'metro-row' }, el('span', { class: 'field-label', text: 'Accent every' }), beatsGroup),
      el('div', { class: 'metro-go' }, tapBtn, playBtn),
    ],
    onClose: () => {
      stopListening();
      onChange();
    },
  });
}
