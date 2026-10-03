// Persistence. Three record stores:
//   meta     - key/value: schema_version, library, settings, home
//   sessions - keyed by session id
//   plans    - keyed by date ('YYYY-MM-DD')
// IndexedDB is preferred; localStorage is the fallback; memory is for tests.

const DB_NAME = 'timebox';
const DB_VERSION = 1;
const KEYS = { sessions: 'id', plans: 'date' };

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

async function openIndexedDB() {
  const open = indexedDB.open(DB_NAME, DB_VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
    if (!db.objectStoreNames.contains('plans')) db.createObjectStore('plans', { keyPath: 'date' });
  };
  const db = await req(open);
  return {
    kind: 'indexeddb',
    async get(store, key) {
      return req(db.transaction(store).objectStore(store).get(key));
    },
    async getAll(store) {
      return req(db.transaction(store).objectStore(store).getAll());
    },
    async put(store, value, key) {
      const tx = db.transaction(store, 'readwrite');
      if (store === 'meta') tx.objectStore(store).put(value, key);
      else tx.objectStore(store).put(value);
      return txDone(tx);
    },
    async delete(store, key) {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      return txDone(tx);
    },
    /** Atomically replace everything (import-replace and reset). */
    async replaceAll({ meta = {}, sessions = [], plans = [] }) {
      const tx = db.transaction(['meta', 'sessions', 'plans'], 'readwrite');
      for (const s of ['meta', 'sessions', 'plans']) tx.objectStore(s).clear();
      for (const [k, v] of Object.entries(meta)) tx.objectStore('meta').put(v, k);
      for (const s of sessions) tx.objectStore('sessions').put(s);
      for (const p of plans) tx.objectStore('plans').put(p);
      return txDone(tx);
    },
    /** Atomically write several records (import-merge). */
    async putMany({ meta = {}, sessions = [], plans = [] }) {
      const tx = db.transaction(['meta', 'sessions', 'plans'], 'readwrite');
      for (const [k, v] of Object.entries(meta)) tx.objectStore('meta').put(v, k);
      for (const s of sessions) tx.objectStore('sessions').put(s);
      for (const p of plans) tx.objectStore('plans').put(p);
      return txDone(tx);
    },
  };
}

/** Key/value backend shared by the localStorage and in-memory stores. */
function kvStore(kind, backend) {
  const k = (store, key) => `${DB_NAME}/${store}/${key}`;
  const keyOf = (store, value, key) => (store === 'meta' ? key : value[KEYS[store]]);
  const api = {
    kind,
    async get(store, key) {
      const raw = backend.getItem(k(store, key));
      return raw == null ? undefined : JSON.parse(raw);
    },
    async getAll(store) {
      const prefix = `${DB_NAME}/${store}/`;
      return backend.keys().filter((x) => x.startsWith(prefix)).map((x) => JSON.parse(backend.getItem(x)));
    },
    async put(store, value, key) {
      backend.setItem(k(store, keyOf(store, value, key)), JSON.stringify(value));
    },
    async delete(store, key) {
      backend.removeItem(k(store, key));
    },
    async replaceAll(data) {
      for (const x of backend.keys()) if (x.startsWith(`${DB_NAME}/`)) backend.removeItem(x);
      await api.putMany(data);
    },
    async putMany({ meta = {}, sessions = [], plans = [] }) {
      for (const [key, v] of Object.entries(meta)) await api.put('meta', v, key);
      for (const s of sessions) await api.put('sessions', s);
      for (const p of plans) await api.put('plans', p);
    },
  };
  return api;
}

export function memoryStore() {
  const map = new Map();
  return kvStore('memory', {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, v) => map.set(key, v),
    removeItem: (key) => map.delete(key),
    keys: () => [...map.keys()],
  });
}

function localStorageStore() {
  const ls = globalThis.localStorage;
  return kvStore('localstorage', {
    getItem: (key) => ls.getItem(key),
    setItem: (key, v) => ls.setItem(key, v),
    removeItem: (key) => ls.removeItem(key),
    keys: () => Array.from({ length: ls.length }, (_, i) => ls.key(i)),
  });
}

export async function openStore() {
  if (globalThis.indexedDB) {
    try {
      return await openIndexedDB();
    } catch (err) {
      console.warn('IndexedDB unavailable, falling back to localStorage', err);
    }
  }
  try {
    const probe = '__timebox_probe__';
    globalThis.localStorage.setItem(probe, '1');
    globalThis.localStorage.removeItem(probe);
    return localStorageStore();
  } catch {
    console.warn('No persistent storage available; data will not be saved.');
    return memoryStore();
  }
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch {
    /* not supported */
  }
  return false;
}
