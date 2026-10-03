// Keep the screen on while a block (or the metronome) is running.
// Browsers drop the lock when the page is hidden, so it is re-requested on return.

let sentinel = null;
let wanted = false;

async function acquire() {
  if (sentinel || !wanted || document.visibilityState !== 'visible') return;
  if (!('wakeLock' in navigator)) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
    if (!wanted) release();
  } catch {
    sentinel = null; // denied (e.g. low battery) or unsupported; nothing to do
  }
}

function release() {
  const s = sentinel;
  sentinel = null;
  if (s) s.release().catch(() => {});
}

export function setWakeLock(on) {
  wanted = on;
  if (on) acquire();
  else release();
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') acquire();
});
