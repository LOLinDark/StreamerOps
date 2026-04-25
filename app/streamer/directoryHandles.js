const DIRECTORY_HANDLES_DB = 'streamerops.directoryHandles.v1';
const DIRECTORY_HANDLES_STORE = 'handles';
export const IMAGE_HANDLE_KEY = 'bulk-images';
export const VIDEO_HANDLE_KEY = 'bulk-videos';

function getIndexedDb() {
  return typeof globalThis !== 'undefined' ? globalThis.indexedDB : undefined;
}

function canUseStoredDirectoryHandles() {
  return typeof globalThis !== 'undefined'
    && typeof globalThis.window !== 'undefined'
    && typeof globalThis.window.showDirectoryPicker === 'function'
    && typeof getIndexedDb() !== 'undefined';
}

function openHandlesDb() {
  return new Promise((resolve, reject) => {
    const indexedDb = getIndexedDb();
    if (!indexedDb) {
      reject(new Error('IndexedDB is not available.'));
      return;
    }

    const request = indexedDb.open(DIRECTORY_HANDLES_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DIRECTORY_HANDLES_STORE)) {
        db.createObjectStore(DIRECTORY_HANDLES_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open directory handle database.'));
  });
}

export async function readStoredDirectoryHandle(key) {
  const db = await openHandlesDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DIRECTORY_HANDLES_STORE, 'readonly');
    const store = tx.objectStore(DIRECTORY_HANDLES_STORE);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('Failed reading stored directory handle.'));
  });
}

export async function readFilesFromDirectoryHandle(handle, relativePrefix = '') {
  const files = [];

  for await (const entry of handle.values()) {
    const nextPath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      files.push({ file, path: nextPath });
    } else if (entry.kind === 'directory') {
      const nested = await readFilesFromDirectoryHandle(entry, nextPath);
      files.push(...nested);
    }
  }

  return files;
}

export async function restoreStoredDirectoryEntries(kind, requestPermission = false) {
  if (!canUseStoredDirectoryHandles()) {
    return [];
  }

  const storageKey = kind === 'image' ? IMAGE_HANDLE_KEY : VIDEO_HANDLE_KEY;
  const handle = await readStoredDirectoryHandle(storageKey);
  if (!handle) {
    return [];
  }

  const permissionState = requestPermission
    ? await handle.requestPermission({ mode: 'read' })
    : await handle.queryPermission({ mode: 'read' });

  if (permissionState !== 'granted') {
    return [];
  }

  const files = await readFilesFromDirectoryHandle(handle);
  return files.filter(({ file }) =>
    kind === 'image' ? String(file.type || '').startsWith('image/') : String(file.type || '').startsWith('video/')
  );
}

export function supportsStoredDirectoryHandles() {
  return canUseStoredDirectoryHandles();
}
