export const SEQUENCE_LIBRARY_KEY = 'streamerops.sequenceLibrary.v1';
export const SEQUENCE_DRAFT_KEY = 'streamerops.sequenceDraft.v1';
export const SEQUENCE_OPEN_REQUEST_KEY = 'streamerops.sequenceLibrary.openRequest.v1';

function getStorage() {
  return typeof globalThis !== 'undefined' ? globalThis.localStorage : null;
}

function toNormalizedId(entry, index) {
  const explicit = String(entry?.id || '').trim();
  if (explicit) return explicit;

  const name = String(entry?.name || 'untitled').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const created = String(entry?.createdAt || '').trim().replace(/[^0-9]/g, '').slice(0, 14) || 'legacy';
  return `legacy-${name || 'playlist'}-${created}-${index}`;
}

function normalizeSequenceItem(item, index) {
  const safeItem = item && typeof item === 'object' ? item : {};
  return {
    ...safeItem,
    id: String(safeItem.id || `item-${index + 1}`),
    type: safeItem.type === 'image' ? 'image' : 'video',
    title: String(safeItem.title || '').trim(),
    source: String(safeItem.source || '').trim(),
    durationSec: Number.isFinite(Number(safeItem.durationSec)) ? Number(safeItem.durationSec) : safeItem.durationSec,
  };
}

function normalizeSequenceRecord(entry, index) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const sequence = Array.isArray(entry.sequence)
    ? entry.sequence.map((item, itemIndex) => normalizeSequenceItem(item, itemIndex))
    : [];

  const now = new Date().toISOString();
  return {
    ...entry,
    id: toNormalizedId(entry, index),
    name: String(entry.name || '').trim() || 'Untitled Sequence',
    version: Number.isFinite(Number(entry.version)) ? Number(entry.version) : 1,
    createdAt: entry.createdAt || now,
    updatedAt: entry.updatedAt || entry.createdAt || now,
    sequence,
  };
}

export function loadSequenceLibrary() {
  try {
    const storage = getStorage();
    const raw = storage?.getItem(SEQUENCE_LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry, index) => normalizeSequenceRecord(entry, index))
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function saveSequenceLibrary(nextLibrary) {
  try {
    const storage = getStorage();
    storage?.setItem(SEQUENCE_LIBRARY_KEY, JSON.stringify(nextLibrary));
  } catch {
    // Ignore write errors.
  }
}

export function requestOpenSavedSequence(id) {
  if (!id) return;
  try {
    const storage = getStorage();
    storage?.setItem(SEQUENCE_OPEN_REQUEST_KEY, String(id));
  } catch {
    // Ignore write errors.
  }
}

export function consumeOpenSavedSequenceId() {
  try {
    const storage = getStorage();
    const value = storage?.getItem(SEQUENCE_OPEN_REQUEST_KEY);
    if (!value) return null;
    storage?.removeItem(SEQUENCE_OPEN_REQUEST_KEY);
    return value;
  } catch {
    return null;
  }
}

export function getSequenceTypeLabel(items) {
  const safeItems = Array.isArray(items) ? items : [];
  const hasImages = safeItems.some((item) => item?.type === 'image');
  const hasVideos = safeItems.some((item) => item?.type === 'video');

  if (hasImages && hasVideos) return 'Mixed';
  if (hasVideos) return 'Video only';
  if (hasImages) return 'Image only';
  return 'Empty';
}

function getBaseName(input) {
  return String(input || '').replace(/\\/g, '/').split('/').pop() || '';
}

function buildLookupKeys(input) {
  const raw = String(input || '').trim();
  const normalized = raw.replace(/\\/g, '/');
  const base = getBaseName(normalized);
  const segments = normalized.split('/').filter(Boolean);
  const suffixes = segments.map((_, index) => segments.slice(index).join('/'));

  return Array.from(new Set([
    normalized,
    normalized.toLowerCase(),
    base,
    base.toLowerCase(),
    ...suffixes,
    ...suffixes.map((suffix) => suffix.toLowerCase()),
  ].filter(Boolean)));
}

function findEntryForSource(source, lookup, entries) {
  const directMatch = buildLookupKeys(source)
    .map((key) => lookup.get(key))
    .find(Boolean);

  if (directMatch) {
    return directMatch;
  }

  const normalizedSource = String(source || '').replace(/\\/g, '/').toLowerCase();
  const sourceBase = getBaseName(normalizedSource);

  return entries.find((entry) => {
    const relativePath = String(entry.path || entry.file?.name || '').replace(/\\/g, '/').toLowerCase();
    return relativePath.endsWith(normalizedSource) || getBaseName(relativePath) === sourceBase;
  }) || null;
}

function createLookup(entries) {
  const lookup = new Map();
  entries.forEach((entry) => {
    buildLookupKeys(entry.path || entry.file?.name).forEach((key) => {
      if (!lookup.has(key)) {
        lookup.set(key, entry);
      }
    });
  });
  return lookup;
}

export function analyzeSequenceHealth(items, { imageEntries = [], videoEntries = [] } = {}) {
  const safeItems = Array.isArray(items) ? items : [];
  const imageLookup = createLookup(imageEntries);
  const videoLookup = createLookup(videoEntries);
  let missingSourceCount = 0;
  let missingRememberedCount = 0;
  let unverifiedLocalCount = 0;
  let resolvedCount = 0;

  safeItems.forEach((item) => {
    const source = String(item?.source || '').trim();
    if (!source) {
      missingSourceCount += 1;
      return;
    }

    if (/^blob:|^https?:\/\//i.test(source) || source.startsWith('/')) {
      resolvedCount += 1;
      return;
    }

    if (/^[a-zA-Z]:\\/.test(source) || /^file:\/\//i.test(source)) {
      unverifiedLocalCount += 1;
      return;
    }

    const entries = item?.type === 'image' ? imageEntries : videoEntries;
    const lookup = item?.type === 'image' ? imageLookup : videoLookup;
    const remembered = findEntryForSource(source, lookup, entries);
    if (remembered) {
      resolvedCount += 1;
      return;
    }

    missingRememberedCount += 1;
  });

  if (missingSourceCount > 0) {
    return {
      label: 'Missing sources',
      color: 'red',
      summary: `${missingSourceCount} item(s) have no file source.`,
      missingCount: missingSourceCount,
      unresolvedCount: missingRememberedCount + unverifiedLocalCount,
      resolvedCount,
    };
  }

  if (missingRememberedCount > 0) {
    return {
      label: 'Needs folder reconnect',
      color: 'orange',
      summary: `${missingRememberedCount} item(s) are not available from remembered folders.`,
      missingCount: missingRememberedCount,
      unresolvedCount: missingRememberedCount,
      resolvedCount,
    };
  }

  if (unverifiedLocalCount > 0) {
    return {
      label: 'Unverified local paths',
      color: 'yellow',
      summary: `${unverifiedLocalCount} item(s) use direct local paths the browser cannot verify here.`,
      missingCount: 0,
      unresolvedCount: unverifiedLocalCount,
      resolvedCount,
    };
  }

  return {
    label: 'Complete',
    color: 'teal',
    summary: `${safeItems.length} item(s) available.`,
    missingCount: 0,
    unresolvedCount: 0,
    resolvedCount,
  };
}
