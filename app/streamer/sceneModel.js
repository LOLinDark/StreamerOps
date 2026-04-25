export const SCENE_MODEL_VERSION = 1;
export const SCENE_MANAGER_STORAGE_KEY = 'streamerops.sceneManager.v1';
export const SCENE_IMPORT_QUEUE_KEY = 'streamerops.sceneManager.importQueue.v1';

function createSceneId() {
  return `scene-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createDefaultScene(index = 1) {
  return {
    id: createSceneId(),
    name: `Scene ${index}`,
    sequenceLabel: '',
    sceneDurationSec: 30,
    transition: 'fade',
    notes: '',
    content: {
      type: 'reference',
      sequence: [],
    },
  };
}

export function createDefaultSceneState() {
  return {
    scenes: [createDefaultScene(1)],
  };
}

function normalizeScene(rawScene, index) {
  const scene = rawScene && typeof rawScene === 'object' ? rawScene : {};
  const content = scene.content && typeof scene.content === 'object' ? scene.content : {};

  return {
    id: String(scene.id || createSceneId()),
    name: String(scene.name || `Scene ${index + 1}`),
    sequenceLabel: String(scene.sequenceLabel || ''),
    sceneDurationSec: Number(scene.sceneDurationSec) > 0 ? Number(scene.sceneDurationSec) : 30,
    transition: ['cut', 'fade', 'slide'].includes(String(scene.transition)) ? String(scene.transition) : 'fade',
    notes: String(scene.notes || ''),
    content: {
      type: String(content.type || 'reference'),
      sequence: Array.isArray(content.sequence) ? content.sequence : [],
    },
  };
}

export function normalizeSceneState(input) {
  const defaults = createDefaultSceneState();
  const source = input && typeof input === 'object' ? input : {};
  const rawScenes = Array.isArray(source.scenes) ? source.scenes : defaults.scenes;

  return {
    scenes: rawScenes.length > 0 ? rawScenes.map((scene, index) => normalizeScene(scene, index)) : [createDefaultScene(1)],
  };
}

export function buildSceneCollectionDocument(state, { source = 'scene-manager', sourceName = '' } = {}) {
  return {
    version: SCENE_MODEL_VERSION,
    type: 'streamer-scene-collection',
    generatedAt: new Date().toISOString(),
    source,
    sourceName: String(sourceName || ''),
    state: normalizeSceneState(state),
  };
}

export function parseSceneCollectionDocument(input) {
  // New format
  if (input && typeof input === 'object' && input.type === 'streamer-scene-collection' && input.state) {
    return {
      ok: true,
      state: normalizeSceneState(input.state),
      meta: {
        source: String(input.source || 'unknown'),
        sourceName: String(input.sourceName || ''),
      },
    };
  }

  // Legacy format (direct saved state)
  if (input && typeof input === 'object' && Array.isArray(input.scenes)) {
    return {
      ok: true,
      state: normalizeSceneState(input),
      meta: {
        source: 'legacy',
        sourceName: '',
      },
    };
  }

  return {
    ok: false,
    state: createDefaultSceneState(),
    meta: {
      source: 'invalid',
      sourceName: '',
    },
  };
}

export function buildSceneCollectionFromSequence({ sequence, sequenceName }) {
  const safeSequence = Array.isArray(sequence) ? sequence : [];
  const safeName = String(sequenceName || 'Untitled Sequence').trim() || 'Untitled Sequence';

  const totalDuration = safeSequence.reduce((sum, item) => {
    if (item?.type === 'image') return sum + (Number(item.durationSec) > 0 ? Number(item.durationSec) : 2);
    if (item?.type === 'video') return sum + (Number(item.durationSec) > 0 ? Number(item.durationSec) : 5);
    return sum;
  }, 0);

  return normalizeSceneState({
    scenes: [
      {
        id: createSceneId(),
        name: safeName,
        sequenceLabel: `Imported from Sequence Builder: ${safeName}`,
        sceneDurationSec: Math.max(1, Math.round(totalDuration)),
        transition: 'fade',
        notes: 'Inline sequence payload attached in content.sequence',
        content: {
          type: 'sequence-inline',
          sequence: safeSequence,
        },
      },
    ],
  });
}
