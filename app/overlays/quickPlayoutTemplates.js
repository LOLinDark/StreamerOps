export const QUICK_PLAYOUT_CONTROL_CHANNEL = 'streamerops.quickPlayout.control.v1';
const SEQUENCE_LIBRARY_KEY = 'streamerops.sequenceLibrary.v1';
const STAR_CITIZEN_PLAYLIST_NAME = 'Star Citizen - Behind The Ships TV';
const STAR_CITIZEN_FALLBACK_FILE = 'Star_Citizen_Behind_the_Ships_-_MISC_Hull_B [JWEbWUewco0].mp4';

function getStorage() {
  return typeof globalThis !== 'undefined' ? globalThis.localStorage : null;
}

function normalizePlaylistItem(item, index) {
  const safeItem = item && typeof item === 'object' ? item : {};
  const type = safeItem.type === 'image' ? 'image' : 'video';
  const source = String(safeItem.source || '').trim();
  if (!source) return null;

  return {
    id: String(safeItem.id || `sc-item-${index + 1}`),
    type,
    title: String(safeItem.title || `${type === 'video' ? 'Video' : 'Image'} ${index + 1}`),
    source,
    ...(type === 'image' ? { durationSec: Math.max(1, Number(safeItem.durationSec) || 5) } : {}),
  };
}

function loadStarCitizenPlaylistFromLibrary() {
  try {
    const storage = getStorage();
    const raw = storage?.getItem(SEQUENCE_LIBRARY_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const namedTarget = parsed.find((entry) => String(entry?.name || '').trim() === STAR_CITIZEN_PLAYLIST_NAME);
    const fallbackTarget = [...parsed]
      .filter((entry) => Array.isArray(entry?.sequence) && entry.sequence.length > 0)
      .sort((a, b) => {
        const aTime = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
        const bTime = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
        return bTime - aTime;
      })[0] || null;

    const target = namedTarget || fallbackTarget;
    if (!target || !Array.isArray(target.sequence)) return [];

    return target.sequence
      .map((item, index) => normalizePlaylistItem(item, index))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function buildStarCitizenPlaylist() {
  const fromLibrary = loadStarCitizenPlaylistFromLibrary();
  if (fromLibrary.length > 0) {
    return fromLibrary;
  }

  // Fallback keeps stream usable and avoids temporary test clips.
  return [
    {
      id: 'sc-fallback-video-001',
      type: 'video',
      title: 'Star Citizen Behind the Ships - MISC Hull B',
      source: `/api/dev/download/file/${encodeURIComponent(STAR_CITIZEN_FALLBACK_FILE)}`,
    },
    {
      id: 'sc-fallback-image-002',
      type: 'image',
      title: 'Drake Vulture',
      source: '/assets/ships-artwork/drake-vulture.png',
      durationSec: 6,
    },
  ];
}

const STAR_CITIZEN_TEMPLATE = {
  id: 'star-citizen-core-v1',
  label: 'Star Citizen Core Playout',
  description: 'Hardcoded Star Citizen themed sequence for immediate fullscreen browser streaming.',
  theme: {
    title: 'STAR CITIZEN BROADCAST',
    subtitle: 'Verse Operations Feed',
    accent: '#4cc9f0',
    panel: 'rgba(2, 10, 20, 0.62)',
    border: 'rgba(76, 201, 240, 0.45)',
    background:
      'radial-gradient(120% 90% at 0% 0%, rgba(76, 201, 240, 0.25), rgba(0, 0, 0, 0) 40%), radial-gradient(120% 90% at 100% 100%, rgba(255, 102, 102, 0.2), rgba(0, 0, 0, 0) 42%), #01060f',
  },
  playlist: buildStarCitizenPlaylist(),
};

const templateMap = {
  [STAR_CITIZEN_TEMPLATE.id]: STAR_CITIZEN_TEMPLATE,
};

export function getQuickPlayoutTemplate(templateId) {
  return templateMap[templateId] || STAR_CITIZEN_TEMPLATE;
}

export function getQuickPlayoutTemplates() {
  return Object.values(templateMap);
}
