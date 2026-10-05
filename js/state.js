// App model: owns the in-memory data, applies actions through the pure engine
// and plan modules, persists every change, and notifies the views.

import * as E from './engine.js';
import * as P from './plan.js';
import { defaultLibrary, defaultSettings, SCHEMA_VERSION, AREA_COLOR_COUNT, NOTES_LIMIT } from './defaults.js';
import { localDate, uid, clone, safeUrl } from './util.js';
import { migrate, normaliseLibrary } from './transfer.js';
import { normaliseDiagram, suggestDiagram } from './music.js';

const BACKUP_DAYS = 7;
const BACKUP_SESSIONS = 5;

export class App {
  constructor(store, clock = () => Date.now()) {
    this.store = store;
    this.clock = clock;
    this.library = null;
    this.settings = null;
    this.home = { mode: 'plan' }; // or { mode: 'done', session_id, date }
    this.plans = new Map();
    this.sessions = []; // every saved session, oldest first (includes the active one)
    this.active = null;
    this.today = null;
    this.backup = { at: null, edits: 0 }; // when a backup was last saved, and library edits since
    this.listeners = new Set();
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(type, detail) {
    for (const fn of this.listeners) fn(type, detail);
  }

  // ---------------------------------------------------------------- loading

  async load() {
    const st = this.store;
    const [version, library, settings, home, backup, sessions, plans] = await Promise.all([
      st.get('meta', 'schema_version'),
      st.get('meta', 'library'),
      st.get('meta', 'settings'),
      st.get('meta', 'home'),
      st.get('meta', 'backup'),
      st.getAll('sessions'),
      st.getAll('plans'),
    ]);
    if (!library) {
      this.library = defaultLibrary();
      this.settings = defaultSettings();
      await st.putMany({ meta: { schema_version: SCHEMA_VERSION, library: this.library, settings: this.settings } });
    } else {
      const data = migrate({ schema_version: version ?? 1, library, settings, sessions, plans });
      this.library = data.library;
      this.settings = { ...defaultSettings(), ...data.settings };
      if ((version ?? 1) !== SCHEMA_VERSION) {
        await st.putMany({ meta: { schema_version: SCHEMA_VERSION, library: this.library, settings: this.settings } });
      }
    }
    this.home = home || { mode: 'plan' };
    this.backup = { at: null, edits: 0, ...(backup || {}) };
    this.sessions = (sessions || []).sort((a, b) => a.started_at - b.started_at);
    this.plans = new Map((plans || []).map((p) => [p.date, p]));
    const actives = this.sessions.filter((s) => s.status === 'active');
    this.active = actives.pop() || null;
    // More than one active session can only come from a crash mid-write; close the extras.
    for (const s of actives) await this.closeSession(s, s.last_activity_at ?? s.started_at, true);
    // An upgrade can change the slots (v4 gave the last one to Licks): today's
    // plan follows, unless a session is already under way.
    if (library && (version ?? 1) !== SCHEMA_VERSION && !this.active) {
      const today = localDate(this.clock());
      if (this.plans.has(today)) await this.savePlan(P.reconcilePlan(this.library, this.plans.get(today)));
    }
    await this.refresh();
  }

  /**
   * Bring everything up to date with the clock: settle the running tile, close
   * a session abandoned on an earlier day, roll the plan over at midnight.
   * Returns time-up events.
   */
  async refresh() {
    const now = this.clock();
    const today = localDate(now);
    let events = [];
    if (this.active) {
      events = E.settle(this.active, now);
      if (events.length) await this.saveSession(this.active);
      if (E.isStale(this.active, today, now)) {
        await this.closeSession(this.active, this.active.last_activity_at ?? now, true);
      }
    }
    const dayChanged = today !== this.today;
    this.today = today;
    if (this.home.mode === 'done' && this.home.date !== today) await this.setHome({ mode: 'plan' });
    if (!this.active) await this.ensurePlan(today);
    if (dayChanged || events.length) this.emit('change');
    return events;
  }

  /** Called frequently while a tile runs. Cheap unless something changed. */
  async tick() {
    if (!this.active || this.active.running == null) return [];
    const events = E.settle(this.active, this.clock());
    if (events.length) {
      await this.saveSession(this.active);
      this.emit('change');
    }
    return events;
  }

  async ensurePlan(date) {
    if (this.plans.has(date)) return this.plans.get(date);
    const plan = P.generatePlan(this.library, date);
    await this.savePlan(plan);
    return plan;
  }

  // ------------------------------------------------------------- persistence

  async saveSession(s) {
    await this.store.put('sessions', clone(s));
  }

  async savePlan(plan) {
    this.plans.set(plan.date, plan);
    await this.store.put('plans', clone(plan));
  }

  async saveLibrary() {
    await this.store.put('meta', clone(this.library), 'library');
  }

  async saveSettings() {
    await this.store.put('meta', clone(this.settings), 'settings');
  }

  async setHome(home) {
    this.home = home;
    await this.store.put('meta', home, 'home');
  }

  // ------------------------------------------------------------------ board

  /** 'active' (session in progress), 'done' (just finished today) or 'plan' (not started). */
  get mode() {
    if (this.active) return 'active';
    if (this.home.mode === 'done' && this.doneSession) return 'done';
    return 'plan';
  }

  get doneSession() {
    return this.home.mode === 'done' ? this.sessions.find((s) => s.id === this.home.session_id) || null : null;
  }

  get currentPlan() {
    return this.plans.get(this.active ? this.active.date : this.today) || null;
  }

  /** The twelve tiles the session screen shows. */
  boardTiles() {
    if (this.active) return this.active.tiles;
    const done = this.mode === 'done' ? this.doneSession : null;
    if (done) return done.tiles;
    const plan = this.plans.get(this.today);
    return plan ? plan.entries.map((e) => E.newTile(P.snapshotEntry(this.library, e))) : [];
  }

  boardSession() {
    return this.active || (this.mode === 'done' ? this.doneSession : null);
  }

  // ---------------------------------------------------------------- actions

  async startSessionFromPlan(now) {
    const plan = await this.ensurePlan(this.today);
    const s = E.createSession({
      id: uid('s-'),
      date: plan.date,
      now,
      entries: plan.entries.map((e) => P.snapshotEntry(this.library, e)),
    });
    this.active = s;
    this.sessions.push(s);
    return s;
  }

  /**
   * Tap on a tile. Returns what happened so the UI can react:
   * started | paused | resumed | completed | rate | none
   */
  async tapTile(i) {
    const now = this.clock();
    if (this.mode === 'done') {
      return this.doneSession.tiles[i]?.completed ? { action: 'rate', session: this.doneSession, index: i } : { action: 'none' };
    }
    if (!this.active) await this.startSessionFromPlan(now);
    const s = this.active;
    E.settle(s, now);
    const t = s.tiles[i];
    let result = { action: 'none' };
    if (t.state === 'idle' && E.startTile(s, i, now)) result = { action: 'started' };
    else if (t.state === 'running' && E.pauseTile(s, i, now)) result = { action: 'paused' };
    else if (t.state === 'paused' && E.startTile(s, i, now)) result = { action: 'resumed' };
    else if (t.state === 'timeup') return this.completeTile(i);
    else if (t.state === 'completed') return { action: 'rate', session: s, index: i };
    await this.saveSession(s);
    this.emit('change');
    return result;
  }

  /** Complete a time-up tile or finish a paused one early. */
  async completeTile(i) {
    const s = this.active;
    if (!s) return { action: 'none' };
    const now = this.clock();
    const t = s.tiles[i];
    const before = t && t.item_id ? this.item(t.item_id)?.last_completed_at ?? null : null;
    if (!E.completeTile(s, i, now)) return { action: 'none' };
    if (t.item_id) {
      t.prev_completed_at = before;
      P.markCompleted(this.library, t.item_id, now);
      await this.saveLibrary();
    }
    if (E.allCompleted(s)) await this.closeSession(s, now);
    else await this.saveSession(s);
    this.emit('change');
    return { action: 'completed', session: s, index: i };
  }

  /** Can this finished block be reopened? Only in the session in progress, or the one just finished today. */
  canReopen(sessionId, i) {
    const s = this.sessions.find((x) => x.id === sessionId);
    if (!s || !s.tiles[i] || !s.tiles[i].completed) return false;
    if (s === this.active) return true;
    return !this.active && s === this.doneSession;
  }

  /**
   * Reopen a finished block and start it again: continuing from where it was
   * finished, or from 5:00 with `restart`. Its item goes back to its earlier
   * place in the rotation. Reopening a block of a session that just ended
   * brings that session back.
   */
  async reopenTile(sessionId, i, { restart = false } = {}) {
    if (!this.canReopen(sessionId, i)) return false;
    const now = this.clock();
    const s = this.sessions.find((x) => x.id === sessionId);
    const t = s.tiles[i];
    if (s !== this.active) {
      E.reactivateSession(s, now);
      this.active = s;
      await this.setHome({ mode: 'plan' });
    }
    if (t.item_id) {
      const item = this.item(t.item_id);
      if (item && item.last_completed_at === t.completed_at) {
        item.last_completed_at = t.prev_completed_at ?? null;
        await this.saveLibrary();
      }
    }
    E.reopenTile(s, i, now, restart);
    E.startTile(s, i, now);
    await this.saveSession(s);
    this.emit('change');
    return true;
  }

  async rateTile(sessionId, i, rating) {
    const s = this.sessions.find((x) => x.id === sessionId);
    if (!s || !E.rateTile(s, i, rating)) return false;
    await this.saveSession(s);
    this.emit('change');
    return true;
  }

  async masterToggle() {
    const s = this.active;
    if (!s) return 'idle';
    const now = this.clock();
    E.settle(s, now);
    const state = E.masterState(s);
    if (state === 'running') E.masterPause(s, now);
    else if (state === 'paused') E.masterResume(s, now);
    else return state;
    await this.saveSession(s);
    this.emit('change');
    return E.masterState(s);
  }

  /** Close a session. Sessions with nothing completed are discarded rather than saved. */
  async closeSession(s, at, auto = false) {
    E.endSession(s, at);
    if (s === this.active) this.active = null;
    if (E.completedCount(s) === 0) {
      this.sessions = this.sessions.filter((x) => x !== s);
      await this.store.delete('sessions', s.id);
      return null;
    }
    await this.saveSession(s);
    if (!auto) await this.setHome({ mode: 'done', session_id: s.id, date: localDate(at) });
    return s;
  }

  async endSession() {
    if (!this.active) return null;
    const saved = await this.closeSession(this.active, this.clock());
    if (!this.plans.has(this.today)) await this.ensurePlan(this.today);
    this.emit('change');
    return saved;
  }

  /** From the "done" screen: a fresh plan for another session today. */
  async newSession() {
    await this.savePlan(P.generatePlan(this.library, this.today));
    await this.setHome({ mode: 'plan' });
    this.emit('change');
  }

  // ---------------------------------------------------------------- locks

  /** The library slot behind board tile i. */
  slotOf(i) {
    const t = this.boardTiles()[i];
    return t ? this.library.slots.find((s) => s.slot_id === t.slot_id) || null : null;
  }

  /** Is block i locked: its slot keeps this item every day until unlocked? */
  isLocked(i) {
    const t = this.boardTiles()[i];
    const slot = this.slotOf(i);
    return !!(t && slot && t.item_id && slot.lock === t.item_id && P.lockedItem(this.library, slot));
  }

  /** A block can be locked when it has an item that still fits its slot. */
  canLock(i) {
    const t = this.boardTiles()[i];
    const slot = this.slotOf(i);
    const item = t && t.item_id ? this.item(t.item_id) : null;
    return !!(slot && item && !item.archived && item.subtype_id === slot.subtype_id);
  }

  async setLocked(i, locked) {
    const slot = this.slotOf(i);
    if (!slot) return false;
    if (locked) {
      if (!this.canLock(i)) return false;
      slot.lock = this.boardTiles()[i].item_id;
    } else delete slot.lock;
    await this.libraryChanged();
    return true;
  }

  /** Unlock a slot from Settings (by slot position). */
  async unlockSlot(index) {
    const slot = this.library.slots[index];
    if (!slot || !slot.lock) return;
    delete slot.lock;
    await this.libraryChanged();
  }

  canSwap(i) {
    const tiles = this.boardTiles();
    const t = tiles[i];
    if (!t || t.state !== 'idle' || this.mode === 'done' || this.isLocked(i)) return false;
    const plan = this.currentPlan;
    return !!(plan && P.swapCandidate(this.library, plan, t.slot_id));
  }

  async swap(i) {
    if (!this.canSwap(i)) return false;
    const plan = this.currentPlan;
    const slotId = this.boardTiles()[i].slot_id;
    P.applySwap(this.library, plan, slotId);
    await this.savePlan(plan);
    if (this.active) {
      P.refreshIdleTiles(this.library, this.active, plan);
      await this.saveSession(this.active);
    }
    this.emit('change');
    return true;
  }

  // ---------------------------------------------------------------- library

  /** After any library edit: save, keep today's plan and idle tiles in step. */
  async libraryChanged() {
    await this.saveLibrary();
    await this.noteEdit();
    if (this.active) {
      const plan = this.currentPlan;
      if (plan) {
        // Fill tiles whose subtype had no items before; don't move anything else mid-session.
        for (const e of plan.entries) {
          if (e.item_id) continue;
          const tile = this.active.tiles.find((t) => t.slot_id === e.slot_id);
          if (tile && tile.state === 'idle') {
            const used = new Set(plan.entries.map((x) => x.item_id));
            const cand = P.rotationOrder(P.activeItems(this.library, e.subtype_id)).find((it) => !used.has(it.id));
            if (cand) e.item_id = cand.id;
          }
        }
        await this.savePlan(plan);
      }
      P.refreshIdleTiles(this.library, this.active, plan);
      await this.saveSession(this.active);
    } else if (this.plans.has(this.today)) {
      await this.savePlan(P.reconcilePlan(this.library, this.plans.get(this.today)));
    }
    this.emit('change');
  }

  item(id) {
    return this.library.items.find((it) => it.id === id) || null;
  }

  subtype(id) {
    return this.library.subtypes.find((s) => s.id === id) || null;
  }

  area(id) {
    return this.library.areas.find((a) => a.id === id) || null;
  }

  itemsOf(subtypeId, { archived = false } = {}) {
    return this.library.items
      .filter((it) => it.subtype_id === subtypeId && !!it.archived === archived)
      .sort((a, b) => a.order - b.order);
  }

  subtypesOf(areaId, { archived = false } = {}) {
    return this.library.subtypes
      .filter((s) => (s.area_id || null) === (areaId || null) && !!s.archived === archived)
      .sort((a, b) => a.order - b.order);
  }

  sortedAreas() {
    return [...this.library.areas].sort((a, b) => a.order - b.order);
  }

  async addItem(subtypeId, text, url = '') {
    const items = this.itemsOf(subtypeId);
    const order = items.length ? Math.max(...this.library.items.filter((i) => i.subtype_id === subtypeId).map((i) => i.order)) + 1 : 0;
    // A new item that names a scale, arpeggio or chords gets that diagram straight away.
    const suggested = suggestDiagram(text);
    const item = {
      id: uid('i-'), subtype_id: subtypeId, text: text.trim(), url: safeUrl(url), notes: '',
      diagrams: suggested ? [normaliseDiagram(suggested)].filter(Boolean) : [],
      order, archived: false, last_completed_at: null,
    };
    this.library.items.push(item);
    await this.libraryChanged();
    return item;
  }

  async updateItem(id, patch) {
    const item = this.item(id);
    if (!item) return;
    Object.assign(item, patch);
    item.text = String(item.text).trim();
    item.url = safeUrl(item.url);
    item.notes = String(item.notes ?? '').slice(0, NOTES_LIMIT);
    item.diagrams = (item.diagrams || []).map(normaliseDiagram).filter(Boolean);
    await this.libraryChanged();
  }

  async moveItem(id, dir) {
    const item = this.item(id);
    if (!item) return;
    const list = this.itemsOf(item.subtype_id);
    const i = list.indexOf(item);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i].order, list[j].order] = [list[j].order, list[i].order];
    if (list[i].order === list[j].order) list.forEach((it, k) => (it.order = k));
    await this.libraryChanged();
  }

  /** Archive (or restore) an item. Archiving releases any slot locked to it; returns true if one was. */
  async setItemArchived(id, archived) {
    let unlocked = false;
    if (archived) {
      for (const slot of this.library.slots) {
        if (slot.lock === id) { delete slot.lock; unlocked = true; }
      }
    }
    await this.updateItem(id, { archived });
    return unlocked;
  }

  async addArea(name) {
    const used = new Set(this.library.areas.map((a) => a.color));
    let color = null;
    for (let c = 0; c < AREA_COLOR_COUNT; c++) if (!used.has(c)) { color = c; break; }
    const order = Math.max(-1, ...this.library.areas.map((a) => a.order)) + 1;
    const area = { id: uid('a-'), name: name.trim(), color, order };
    this.library.areas.push(area);
    await this.libraryChanged();
    return area;
  }

  async renameArea(id, name) {
    const a = this.area(id);
    if (a && name.trim()) a.name = name.trim();
    await this.libraryChanged();
  }

  /** Deleting an area leaves its subtypes untagged (they show under "Other"). */
  async deleteArea(id) {
    this.library.areas = this.library.areas.filter((a) => a.id !== id);
    for (const s of this.library.subtypes) if (s.area_id === id) s.area_id = null;
    await this.libraryChanged();
  }

  async addSubtype(name, areaId) {
    const order = Math.max(-1, ...this.library.subtypes.map((s) => s.order)) + 1;
    const sub = { id: uid('t-'), name: name.trim(), area_id: areaId || null, order, archived: false };
    this.library.subtypes.push(sub);
    await this.libraryChanged();
    return sub;
  }

  async updateSubtype(id, patch) {
    const s = this.subtype(id);
    if (!s) return;
    Object.assign(s, patch);
    await this.libraryChanged();
  }

  slotsUsing(subtypeId) {
    return this.library.slots.filter((s) => s.subtype_id === subtypeId).length;
  }

  async setSubtypeArchived(id, archived) {
    if (archived && this.slotsUsing(id)) return false;
    await this.updateSubtype(id, { archived });
    return true;
  }

  async setSlotSubtype(index, subtypeId) {
    const slot = this.library.slots[index];
    if (slot.subtype_id !== subtypeId) delete slot.lock; // a lock only means something within its subtype
    slot.subtype_id = subtypeId;
    await this.libraryChanged();
  }

  async moveSlot(index, dir) {
    const slots = this.library.slots;
    const j = index + dir;
    if (j < 0 || j >= slots.length) return;
    [slots[index], slots[j]] = [slots[j], slots[index]];
    await this.libraryChanged();
  }

  /** Restore default slots, areas, subtypes and starter library. History is kept. */
  async resetLibrary() {
    const fresh = defaultLibrary();
    // Keep rotation memory for starter items that still exist.
    for (const it of fresh.items) {
      const old = this.item(it.id);
      if (old && old.text === it.text) it.last_completed_at = old.last_completed_at;
    }
    this.library = fresh;
    if (!this.active) {
      await this.saveLibrary();
      await this.noteEdit();
      await this.savePlan(P.generatePlan(this.library, this.today));
      this.emit('change');
    } else {
      await this.libraryChanged();
    }
  }

  // --------------------------------------------------------------- settings

  async updateSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    await this.saveSettings();
    this.emit('settings');
  }

  // ----------------------------------------------------------------- backup

  async noteEdit() {
    this.backup = { ...this.backup, edits: this.backup.edits + 1 };
    await this.store.put('meta', clone(this.backup), 'backup');
  }

  /** A backup file was just saved: everything up to now is safe. */
  async markBackedUp(now = this.clock()) {
    this.backup = { at: now, edits: 0 };
    await this.store.put('meta', clone(this.backup), 'backup');
    this.emit('change');
  }

  /**
   * What a backup would protect that the last one didn't: sessions finished
   * since, and library edits. Due when there is something to lose and either
   * there has never been a backup, a week has passed, or a lot has piled up.
   */
  backupStatus(now = this.clock()) {
    const { at, edits } = this.backup;
    const sessions = this.sessions.filter((s) => s.status !== 'active'
      && (at == null || (s.ended_at ?? s.last_activity_at ?? s.started_at) > at)).length;
    const days = at == null ? null : Math.floor((now - at) / 86_400_000);
    const changed = sessions > 0 || edits > 0;
    const due = changed && (at == null || days >= BACKUP_DAYS || sessions >= BACKUP_SESSIONS);
    return { at, days, sessions, edits, due };
  }

  /** A fresh install (or a wiped one): nothing practised, never backed up. */
  get looksNew() {
    return this.sessions.length === 0 && this.backup.at == null;
  }

  // ------------------------------------------------------------ import/export

  snapshot() {
    return {
      library: clone(this.library),
      settings: clone(this.settings),
      plans: clone([...this.plans.values()]),
      sessions: clone(this.sessions),
    };
  }

  /**
   * Replace all data with an already-validated dataset. `backup` is the backup
   * record to keep (a restored file is itself a backup); by default the current one.
   */
  async replaceAll(data, backup = this.backup) {
    const library = normaliseLibrary(data.library);
    await this.store.replaceAll({
      meta: { schema_version: SCHEMA_VERSION, library, settings: data.settings, home: { mode: 'plan' }, backup: clone(backup) },
      sessions: data.sessions,
      plans: data.plans,
    });
    this.today = null;
    this.active = null;
    await this.load();
    this.emit('change');
    this.emit('settings');
  }
}
