// Tuner sheet: listens through the microphone, finds the string being played,
// and shows how far off it is with a needle between flat and sharp. Tap a
// string on the headstock to tune just that one; tap it again to go back to
// picking up any string. The microphone is released as soon as the sheet closes.

import { el, icon } from '../util.js';
import { STANDARD, detectPitch, nearestString, centsOff, noteOf, median } from '../tuner.js';
import { openSheet } from './sheets.js';

const IN_TUNE = 5; // cents either side that count as in tune
const HOLD_MS = 1500; // keep showing the last reading this long after the string fades
const TUNED_MS = 600; // in tune this long marks the string done
const RANGE = 50; // cents at the ends of the scale

// The headstock art: where each peg sits, as a share of the picture's height
// (low to high: E A D on the left from the bottom up, G B E on the right top down).
const PEGS = [
  { side: 'left', y: 55.8 },
  { side: 'left', y: 39.2 },
  { side: 'left', y: 22.7 },
  { side: 'right', y: 22.7 },
  { side: 'right', y: 39.2 },
  { side: 'right', y: 55.8 },
];

export function openTunerSheet() {
  let audio = null; // { ctx, stream, analyser, buf }
  let raf = 0;
  let lastRun = 0;
  let recent = []; // recent frequencies, for a steady needle
  let heardAt = 0;
  let inTuneSince = 0;
  let locked = null; // a string index, when one is picked by hand
  let closed = false;
  const tuned = new Set();

  const bubbleNote = el('span', { class: 'tuner-bubble-note', text: '' });
  const bubble = el('div', { class: 'tuner-bubble', 'aria-hidden': 'true' }, bubbleNote);
  const ticks = el('div', { class: 'tuner-ticks', 'aria-hidden': 'true' });
  for (let c = -RANGE; c <= RANGE; c += 5) {
    ticks.append(el('span', { class: `tuner-tick${c % 25 === 0 ? ' major' : ''}${c === 0 ? ' zero' : ''}`, style: `left:${50 + (c / RANGE) * 46}%` }));
  }
  const scale = el('div', { class: 'tuner-scale' },
    el('span', { class: 'tuner-flat', text: '♭', 'aria-hidden': 'true' }),
    el('span', { class: 'tuner-sharp', text: '♯', 'aria-hidden': 'true' }),
    ticks, bubble);
  const readout = el('div', { class: 'tuner-readout', 'aria-live': 'polite' });
  const message = el('div', { class: 'tuner-message', role: 'status' });
  const retry = el('button', { class: 'btn tuner-retry', type: 'button', hidden: true, onclick: () => start() }, 'Try again');

  const stringBtns = STANDARD.map((s, i) => el('button', {
    class: `tuner-string tuner-string-${PEGS[i].side}`, type: 'button', style: `top:${PEGS[i].y}%`,
    'aria-label': `${s.label} string`, 'aria-pressed': 'false',
    onclick: () => pick(i),
  }, el('span', { class: 'tuner-string-name', text: s.name }), el('span', { class: 'tuner-string-check' }, icon('check'))));
  const modeLine = el('div', { class: 'tuner-mode' });
  const neck = el('div', { class: 'tuner-neck' },
    el('img', { class: 'tuner-headstock', src: 'img/headstock.webp', alt: '', width: '540', height: '934', decoding: 'async' }),
    stringBtns);

  function pick(i) {
    locked = locked === i ? null : i;
    recent = [];
    inTuneSince = 0;
    render(null);
  }

  // ---- microphone ----

  async function start() {
    retry.hidden = true;
    stopAudio();
    const media = navigator.mediaDevices;
    if (!media || !media.getUserMedia) {
      showProblem("This browser can't use the microphone here.", false);
      return;
    }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    // Made inside the tap that opened the tuner, so iOS lets it run.
    const ctx = AC ? new AC() : null;
    if (!ctx) {
      showProblem("This browser can't listen for pitch.", false);
      return;
    }
    message.textContent = 'Allow the microphone to start tuning';
    let stream;
    try {
      stream = await media.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (err) {
      ctx.close().catch(() => {});
      if (closed) return;
      if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        showProblem('Timebox needs the microphone to hear your guitar. Allow it when your phone asks, or turn it on for this app in your phone’s settings, then try again.', true);
      } else if (err && err.name === 'NotFoundError') {
        showProblem('No microphone was found.', true);
      } else {
        showProblem('The microphone could not be started.', true);
      }
      return;
    }
    if (closed) {
      stream.getTracks().forEach((t) => t.stop());
      ctx.close().catch(() => {});
      return;
    }
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    source.connect(analyser);
    audio = { ctx, stream, analyser, buf: new Float32Array(analyser.fftSize) };
    sheet.dialog.classList.add('listening');
    render(null);
    raf = requestAnimationFrame(loop);
  }

  function stopAudio() {
    cancelAnimationFrame(raf);
    if (!audio) return;
    audio.stream.getTracks().forEach((t) => t.stop());
    audio.ctx.close().catch(() => {});
    audio = null;
    sheet?.dialog.classList.remove('listening');
  }

  function showProblem(text, canRetry) {
    message.textContent = text;
    message.classList.add('problem');
    readout.textContent = '';
    retry.hidden = !canRetry;
  }

  // ---- listening ----

  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (now - lastRun < 45) return; // about 20 readings a second is plenty
    lastRun = now;
    audio.analyser.getFloatTimeDomainData(audio.buf);
    const hit = detectPitch(audio.buf, audio.ctx.sampleRate);
    if (hit) {
      // A jump of more than a semitone is a new note: start the average over.
      if (recent.length && Math.abs(centsOff(hit.freq, median(recent))) > 100) recent = [];
      recent.push(hit.freq);
      if (recent.length > 5) recent.shift();
      heardAt = now;
      render(median(recent), now);
    } else if (recent.length && now - heardAt > HOLD_MS) {
      recent = [];
      render(null, now);
    }
  }

  function render(freq, now = performance.now()) {
    message.classList.remove('problem');
    const target = locked != null ? STANDARD[locked] : null;
    modeLine.textContent = target
      ? `Tuning the ${target.label} string. Tap it again for any string.`
      : 'Tap a string to tune just that one.';
    stringBtns.forEach((b, i) => {
      b.setAttribute('aria-pressed', String(locked === i));
      b.classList.toggle('tuned', tuned.has(i));
    });

    if (freq == null) {
      sheet?.dialog.classList.remove('hearing', 'in-tune');
      stringBtns.forEach((b) => b.classList.remove('heard'));
      bubble.style.setProperty('--x', '50%');
      bubbleNote.textContent = '';
      readout.textContent = '';
      message.textContent = audio
        ? (target ? `Play the ${target.label} string` : 'Start tuning by playing any string')
        : message.textContent;
      inTuneSince = 0;
      return;
    }

    const near = target ? { string: target, cents: centsOff(freq, target.freq) } : nearestString(freq);
    const cents = near.cents;
    const inTune = Math.abs(cents) <= IN_TUNE;
    const shown = Math.max(-RANGE, Math.min(RANGE, cents));
    bubble.style.setProperty('--x', `${50 + (shown / RANGE) * 46}%`);
    bubbleNote.textContent = near.string.name;
    sheet.dialog.classList.add('hearing');
    sheet.dialog.classList.toggle('in-tune', inTune);
    stringBtns.forEach((b, i) => b.classList.toggle('heard', i === near.string.index));

    const note = noteOf(freq);
    const sign = cents > 0 ? '+' : cents < 0 ? '−' : '';
    readout.replaceChildren(
      el('span', { class: 'tuner-readout-note', text: `${note.name}${note.octave}` }),
      el('span', { class: 'tuner-readout-cents', text: inTune ? 'in tune' : `${sign}${Math.abs(Math.round(cents))} cents` }),
    );
    if (inTune) {
      message.textContent = `${near.string.label} is in tune`;
      if (!inTuneSince) inTuneSince = now;
      if (now - inTuneSince >= TUNED_MS && !tuned.has(near.string.index)) {
        tuned.add(near.string.index);
        stringBtns[near.string.index].classList.add('tuned');
      }
    } else {
      inTuneSince = 0;
      message.textContent = cents < 0 ? `Tune ${near.string.label} up` : `Tune ${near.string.label} down`;
    }
  }

  const sheet = openSheet({
    title: 'Tuner',
    className: 'tuner-sheet',
    content: [
      el('div', { class: 'tuner-sub', text: 'Guitar · Standard (E A D G B E)' }),
      scale,
      readout,
      el('div', { class: 'tuner-message-row' }, message, retry),
      neck,
      modeLine,
    ],
    onClose: () => {
      closed = true;
      stopAudio();
    },
  });
  render(null);
  start();
  return sheet;
}
