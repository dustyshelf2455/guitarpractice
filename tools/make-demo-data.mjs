// Generates a realistic backup file (about ten weeks of practice) by driving the
// real app model with a fake clock. Useful for trying the stats screens.
// Usage: node tools/make-demo-data.mjs > demo-backup.json

import { App } from '../js/state.js';
import { memoryStore } from '../js/store.js';
import { TILE_MS } from '../js/engine.js';
import { buildExport } from '../js/transfer.js';

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const clock = { now: new Date(2026, 6, 25, 19, 0).getTime() };
const app = new App(memoryStore(), () => clock.now);
await app.load();

// Some items are harder than others, so ratings differ in a believable way.
const difficulty = new Map([['picking-3', -1.4], ['picking-4', -1.2], ['chords-2', -1.6], ['songs-2', -0.9], ['backing-4', -0.7], ['warmup-1', 0.8]]);

const end = new Date(2026, 9, 3, 12, 0).getTime();
let day = 0;
while (clock.now < end) {
  day++;
  const skip = rand() < 0.28;
  if (!skip) {
    clock.now += Math.floor(rand() * 90) * 60_000;
    const blocks = rand() < 0.75 ? 12 : 4 + Math.floor(rand() * 7);
    for (let i = 0; i < blocks; i++) {
      await app.tapTile(i);
      const early = rand() < 0.08;
      clock.now += early ? 150_000 + Math.floor(rand() * 100_000) : TILE_MS + 3_000;
      await app.tick();
      if (early) {
        await app.tapTile(i); // pause
        await app.completeTile(i);
      } else {
        await app.tapTile(i);
      }
      const t = (app.active || app.doneSession).tiles[i];
      const skill = 3 + (difficulty.get(t.item_id) || 0) + day / 40 + (rand() - 0.5) * 1.6;
      const rating = rand() < 0.1 ? null : Math.max(1, Math.min(5, Math.round(skill)));
      if (rating) await app.rateTile((app.active || app.doneSession).id, i, rating);
      clock.now += 20_000;
    }
    if (app.active) await app.endSession();
  }
  clock.now = new Date(new Date(clock.now).setHours(0, 0, 0, 0)).getTime() + 86_400_000 + (18 + Math.floor(rand() * 3)) * 3_600_000;
  await app.refresh();
  if (app.mode === 'done') await app.newSession();
}

process.stdout.write(JSON.stringify(buildExport(app.snapshot(), clock.now), null, 1));
