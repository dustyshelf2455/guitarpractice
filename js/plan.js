// Library queries, daily-plan generation, rotation and swap. Pure functions.
//
// Rotation rule: within a subtype, the item completed longest ago comes first;
// never-completed items come before everything; ties break by library order.
// Only completions move an item back in the queue, so skipped items come round again.

export function activeItems(library, subtypeId) {
  return library.items.filter((it) => it.subtype_id === subtypeId && !it.archived);
}

function rotationCompare(a, b) {
  const la = a.last_completed_at;
  const lb = b.last_completed_at;
  if (la == null && lb != null) return -1;
  if (la != null && lb == null) return 1;
  if (la != null && lb != null && la !== lb) return la - lb;
  return (a.order ?? 0) - (b.order ?? 0);
}

export function rotationOrder(items) {
  return [...items].sort(rotationCompare);
}

/**
 * Pick an item for one slot. Prefers items not already used; when a subtype
 * has too few items, repeats the least-used one (so repeats spread evenly).
 */
function pickForSlot(library, subtypeId, used) {
  const cands = rotationOrder(activeItems(library, subtypeId));
  if (!cands.length) return null;
  let pick = cands.find((it) => !used.has(it.id));
  if (!pick) {
    const least = Math.min(...cands.map((c) => used.get(c.id)));
    pick = cands.find((c) => used.get(c.id) === least);
  }
  used.set(pick.id, (used.get(pick.id) || 0) + 1);
  return pick;
}

/**
 * The item a slot is locked to, if the lock still applies (the item exists, is
 * active and still belongs to the slot's subtype). A locked slot shows that item
 * every day until it is unlocked.
 */
export function lockedItem(library, slot) {
  if (!slot || !slot.lock) return null;
  const item = library.items.find((it) => it.id === slot.lock);
  return item && !item.archived && item.subtype_id === slot.subtype_id ? item : null;
}

export function generatePlan(library, date) {
  // Locked slots first, so other slots of the same subtype pick around them.
  const locked = library.slots.map((slot) => lockedItem(library, slot));
  const used = new Map();
  for (const it of locked) if (it) used.set(it.id, (used.get(it.id) || 0) + 1);
  const entries = library.slots.map((slot, i) => {
    const pick = locked[i] || pickForSlot(library, slot.subtype_id, used);
    return { slot_id: slot.slot_id, subtype_id: slot.subtype_id, item_id: pick ? pick.id : null };
  });
  return { date, entries, swap_seen: {} };
}

/**
 * Bring an existing plan in line with the slot template after Settings changes:
 * follows the template's order, keeps entries whose subtype still matches and
 * whose item is still usable, and re-picks the rest by rotation.
 */
export function reconcilePlan(library, plan) {
  const byId = new Map(library.items.map((it) => [it.id, it]));
  const old = new Map(plan.entries.map((e) => [e.slot_id, e]));
  const keep = library.slots.map((slot) => {
    const lock = lockedItem(library, slot);
    if (lock) return { slot_id: slot.slot_id, subtype_id: slot.subtype_id, item_id: lock.id };
    const e = old.get(slot.slot_id);
    const item = e && e.item_id ? byId.get(e.item_id) : null;
    const ok = e && e.subtype_id === slot.subtype_id && item && !item.archived && item.subtype_id === slot.subtype_id;
    return ok ? { slot_id: slot.slot_id, subtype_id: slot.subtype_id, item_id: e.item_id } : null;
  });
  const used = new Map();
  for (const e of keep) if (e) used.set(e.item_id, (used.get(e.item_id) || 0) + 1);
  const entries = library.slots.map((slot, i) => {
    if (keep[i]) return keep[i];
    const pick = pickForSlot(library, slot.subtype_id, used);
    return { slot_id: slot.slot_id, subtype_id: slot.subtype_id, item_id: pick ? pick.id : null };
  });
  const swap_seen = {};
  for (const e of entries) {
    if (plan.swap_seen && plan.swap_seen[e.slot_id] && keep.some((k) => k && k.slot_id === e.slot_id)) {
      swap_seen[e.slot_id] = plan.swap_seen[e.slot_id];
    }
  }
  return { ...plan, entries, swap_seen };
}

/**
 * Next item a swap would show for a slot, or null if there is no alternative.
 * Excludes items on other slots today and the current item; prefers items this
 * slot hasn't shown yet today, and cycles back round once they've all been seen.
 */
export function swapCandidate(library, plan, slotId) {
  const entry = plan.entries.find((e) => e.slot_id === slotId);
  if (!entry) return null;
  if (lockedItem(library, library.slots.find((s) => s.slot_id === slotId))) return null; // locked: no re-roll
  const others = new Set(plan.entries.filter((e) => e !== entry).map((e) => e.item_id));
  const cands = rotationOrder(activeItems(library, entry.subtype_id))
    .filter((it) => it.id !== entry.item_id && !others.has(it.id));
  if (!cands.length) return null;
  const seen = new Set(plan.swap_seen?.[slotId] || []);
  if (entry.item_id) seen.add(entry.item_id);
  const fresh = cands.find((it) => !seen.has(it.id));
  return { item: fresh || cands[0], cycled: !fresh };
}

/** Apply a swap to the plan (mutates). Returns the new item, or null. */
export function applySwap(library, plan, slotId) {
  const cand = swapCandidate(library, plan, slotId);
  if (!cand) return null;
  const entry = plan.entries.find((e) => e.slot_id === slotId);
  plan.swap_seen = plan.swap_seen || {};
  let seen = plan.swap_seen[slotId] || [];
  if (!seen.length && entry.item_id) seen = [entry.item_id];
  if (cand.cycled) seen = entry.item_id ? [entry.item_id] : [];
  seen.push(cand.item.id);
  plan.swap_seen[slotId] = seen;
  entry.item_id = cand.item.id;
  return cand.item;
}

export function areaOf(library, subtypeId) {
  const sub = library.subtypes.find((s) => s.id === subtypeId);
  return sub && sub.area_id ? library.areas.find((a) => a.id === sub.area_id) || null : null;
}

/** Everything a tile needs to display, snapshotted from the library. */
export function snapshotEntry(library, entry) {
  const sub = library.subtypes.find((s) => s.id === entry.subtype_id) || null;
  const item = entry.item_id ? library.items.find((it) => it.id === entry.item_id) || null : null;
  const area = sub ? areaOf(library, sub.id) : null;
  return {
    slot_id: entry.slot_id,
    item_id: item ? item.id : null,
    item_text: item ? item.text : sub ? sub.name : 'Free practice',
    subtype_id: sub ? sub.id : null,
    subtype_name: sub ? sub.name : '',
    area_id: area ? area.id : null,
    area_name: area ? area.name : '',
    url: item ? item.url || '' : '',
    empty: !item,
  };
}

/** Refresh the text/labels of tiles that haven't been started yet (after library edits). */
export function refreshIdleTiles(library, session, plan) {
  const planned = new Map((plan?.entries || []).map((e) => [e.slot_id, e]));
  for (const t of session.tiles) {
    if (t.state !== 'idle') continue;
    const entry = planned.get(t.slot_id) || { slot_id: t.slot_id, subtype_id: t.subtype_id, item_id: t.item_id };
    Object.assign(t, snapshotEntry(library, entry));
  }
}

/** Mark an item completed for rotation purposes. */
export function markCompleted(library, itemId, at) {
  const item = library.items.find((it) => it.id === itemId);
  if (!item) return;
  if (item.last_completed_at == null || at > item.last_completed_at) item.last_completed_at = at;
}
