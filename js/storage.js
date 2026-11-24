const DB = "niyayesh-kalimba";

function openDb() {
  if (!window.indexedDB) return Promise.reject(new Error("no-idb"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("songs")) db.createObjectStore("songs", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function listSongs() {
  const db = await openDb();
  const items = await new Promise((resolve, reject) => {
    const request = db.transaction("songs").objectStore("songs").getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveSong(song) {
  const db = await openDb();
  const tx = db.transaction("songs", "readwrite");
  tx.objectStore("songs").put(song);
  await txDone(tx);
  db.close();
  return song;
}

export async function removeSong(id) {
  const db = await openDb();
  const tx = db.transaction("songs", "readwrite");
  tx.objectStore("songs").delete(id);
  await txDone(tx);
  db.close();
}

export async function exportLibrary() {
  return { version: 1, songs: await listSongs() };
}

export async function importLibrary(data) {
  const songs = Array.isArray(data) ? data : (data && data.songs) || [];
  for (const song of songs) {
    if (song && song.id && Array.isArray(song.events)) await saveSong(song);
  }
  return songs.length;
}

export function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
