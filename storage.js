(() => {
  const DB_NAME = 'soundboard-library';
  const STORE = 'sounds';

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  window.SoundboardStore = openDatabase().then(async (db) => {
    const store = () => db.transaction(STORE, 'readonly').objectStore(STORE);
    const all = async () => requestResult(store().getAll());
    const save = async (entry) => requestResult(db.transaction(STORE, 'readwrite').objectStore(STORE).put(entry));
    const remove = async (id) => requestResult(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id));

    const existing = await all();
    for (const entry of existing) {
      let changed = false;
      if (!entry.title && entry.name) { entry.title = entry.name; changed = true; }
      if (!entry.fileName && entry.name) { entry.fileName = entry.name; changed = true; }
      if (entry.showOnBoard === undefined && /^slot-\d{2}$/.test(entry.id)) { entry.showOnBoard = true; changed = true; }
      if (entry.showOnBoard === undefined) { entry.showOnBoard = false; changed = true; }
      if (entry.added === undefined) { entry.added = Date.now(); changed = true; }
      if (entry.background === undefined) { entry.background = false; changed = true; }
      if (entry.startAt === undefined) { entry.startAt = 0; changed = true; }
      if (entry.volume === undefined) { entry.volume = 1; changed = true; }
      if (changed) await save(entry);
    }
    return { all, save, remove };
  });
})();
