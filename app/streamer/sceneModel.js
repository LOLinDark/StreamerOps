export const SCENE_MODEL_VERSION = 1;
export const SCENE_MANAGER_STORAGE_KEY = 'streamerops.sceneManager.v1';
export const SCENE_IMPORT_QUEUE_KEY = 'streamerops.sceneManager.importQueue.v1';
export const STREAMEROPS_SCENE_SCHEMA_VERSION = 'streamerops.scene.v0.1';
export const STREAMEROPS_SCENE_PATCH_VERSION = 'streamerops.scene.patch.v0.1';

const SCENE_SOURCE_TYPES = ['image', 'media', 'text', 'browser', 'audio'];
const EDITOR_LAYER_TYPES = ['image', 'video', 'text', 'browser', 'audio'];

const DEFAULT_CANVAS = {
  width: 1920,
  height: 1080,
  fps: 60,
};

const DEFAULT_TEXT_KIND = 'text_gdiplus_v3';

const SOURCE_KIND_BY_TYPE = {
  image: 'image_source',
  media: 'ffmpeg_source',
  text: DEFAULT_TEXT_KIND,
  browser: 'browser_source',
  audio: 'ffmpeg_source',
};

const SCENE_PATCH_OPS = [
  'addSource',
  'updateSource',
  'removeSource',
  'reorderSource',
  'setSourceEnabled',
  'setGroupEnabled',
];

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeSourceId(value, fallback) {
  return String(value || fallback || 'source')
    .trim()
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'source';
}

function normalizeSchemaSourceType(type) {
  if (type === 'video') {
    return 'media';
  }

  return SCENE_SOURCE_TYPES.includes(type) ? type : 'image';
}

function toSceneEditorLayerType(type) {
  if (type === 'media') {
    return 'video';
  }

  return EDITOR_LAYER_TYPES.includes(type) ? type : 'image';
}

function inferAsset(source, type) {
  const value = typeof source === 'string' ? source.slice(0, 1024) : '';

  if (type === 'browser') {
    return /^https?:\/\//.test(value) ? { kind: 'url', url: value } : { kind: 'url', url: 'about:blank' };
  }

  if (type === 'text') {
    return null;
  }

  if (type === 'audio' || type === 'media' || type === 'image') {
    if (value.startsWith('/assets/')) {
      return { kind: 'publicAsset', path: value };
    }

    if (/^[A-Za-z]:[\\/]/.test(value) || value.startsWith('/') || value.startsWith('file:')) {
      return { kind: 'localFile', path: value };
    }

    if (value.startsWith('blob:')) {
      return { kind: 'previewOnly', path: value };
    }

    return { kind: 'unresolved', path: value };
  }

  return null;
}

function buildSourceSettings(source) {
  if (source.type === 'text') {
    return {
      template: String(source.template || ''),
      bindings: source.bindings && typeof source.bindings === 'object' ? source.bindings : {},
      style: source.style && typeof source.style === 'object' ? source.style : {},
    };
  }

  if (source.type === 'browser') {
    return {
      url: source.url || source.asset?.url || 'about:blank',
    };
  }

  return {
    asset: source.asset || null,
  };
}

function getSourcePath(source) {
  if (source.type === 'browser') {
    return source.url || source.asset?.url || 'about:blank';
  }

  if (source.type === 'text') {
    return source.template || '';
  }

  return source.asset?.path || '';
}

function cloneSceneValue(value) {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function isSafePatchPath(pathValue) {
  const pathText = String(pathValue || '');
  if (!pathText || pathText.includes('__proto__') || pathText.includes('prototype') || pathText.includes('constructor')) {
    return false;
  }

  return /^(label|enabled|locked|group|zIndex|asset|asset\.[\w.-]+|transform\.(x|y|width|height|rotation|opacity)|obs\.(sourceName|sourceKind)|metadata\.[\w.-]+|template|bindings\.[\w.-]+|style\.[\w.-]+|url|audio\.[\w.-]+)$/.test(pathText);
}

function setPathValue(target, pathText, value) {
  const parts = String(pathText).split('.');
  let cursor = target;

  parts.slice(0, -1).forEach((part) => {
    if (!cursor[part] || typeof cursor[part] !== 'object') {
      cursor[part] = {};
    }

    cursor = cursor[part];
  });

  cursor[parts[parts.length - 1]] = value;
}

export function buildSceneProfileFromEditorLayers(layers, {
  profileId = 'star-citizen-live-baseline',
  projectId = 'star-citizen-live',
  name = 'Star Citizen Live Baseline',
  sceneName = 'StreamerOps Scene Editor',
  canvas = DEFAULT_CANVAS,
} = {}) {
  const safeLayers = Array.isArray(layers) ? layers : [];
  const sources = safeLayers.map((layer, index) => {
    const type = normalizeSchemaSourceType(layer?.type);
    const id = sanitizeSourceId(layer?.id, `source-${index + 1}`);
    const opacity = clampNumber(toFiniteNumber(layer?.opacity, 100) / 100, 0, 1);
    const transform = {
      x: toFiniteNumber(layer?.x, 0),
      y: toFiniteNumber(layer?.y, 0),
      width: Math.max(1, toFiniteNumber(layer?.width, 100)),
      height: Math.max(1, toFiniteNumber(layer?.height, 100)),
      rotation: toFiniteNumber(layer?.rotation, 0),
      opacity,
    };

    const baseSource = {
      id,
      type,
      label: String(layer?.label || id).slice(0, 120),
      enabled: Boolean(layer?.visible ?? true),
      locked: Boolean(layer?.locked),
      group: String(layer?.group || (type === 'image' ? 'branding' : type === 'media' ? 'playout' : `${type}s`)),
      zIndex: toFiniteNumber(layer?.zIndex, index * 10),
      transform,
      obs: {
        sourceName: String(layer?.obs?.sourceName || `SE-${id}`).slice(0, 100),
        sourceKind: String(layer?.obs?.sourceKind || SOURCE_KIND_BY_TYPE[type]),
      },
      metadata: {
        editorLayerType: toSceneEditorLayerType(type),
        fallback: Boolean(layer?.fallback),
      },
    };

    if (type === 'text') {
      return {
        ...baseSource,
        template: String(layer?.source || ''),
        bindings: layer?.bindings && typeof layer.bindings === 'object' ? layer.bindings : {},
        style: layer?.style && typeof layer.style === 'object' ? layer.style : {},
      };
    }

    if (type === 'browser') {
      return {
        ...baseSource,
        url: inferAsset(layer?.source, type)?.url || 'about:blank',
      };
    }

    return {
      ...baseSource,
      asset: inferAsset(layer?.source, type),
      audio: type === 'media' || type === 'audio'
        ? {
            profile: String(layer?.audio?.profile || 'live-program'),
            muted: Boolean(layer?.audio?.muted),
            monitoring: String(layer?.audio?.monitoring || 'monitorOff'),
          }
        : undefined,
    };
  });

  const groupMap = new Map();
  sources.forEach((source) => {
    if (!groupMap.has(source.group)) {
      groupMap.set(source.group, {
        id: source.group,
        label: source.group.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
        enabled: true,
      });
    }
  });

  return {
    schemaVersion: STREAMEROPS_SCENE_SCHEMA_VERSION,
    profileId: String(profileId || 'scene-profile'),
    projectId: String(projectId || 'default-project'),
    name: String(name || 'Scene Profile'),
    canvas: {
      width: Math.max(1, toFiniteNumber(canvas?.width, DEFAULT_CANVAS.width)),
      height: Math.max(1, toFiniteNumber(canvas?.height, DEFAULT_CANVAS.height)),
      fps: Math.max(1, toFiniteNumber(canvas?.fps, DEFAULT_CANVAS.fps)),
    },
    target: {
      provider: 'obs',
      sceneName: String(sceneName || 'StreamerOps Scene Editor'),
    },
    sources,
    groups: [...groupMap.values()],
    metadata: {
      createdBy: 'streamerops',
      source: 'scene-editor',
    },
  };
}

export function normalizeSceneProfile(input, options = {}) {
  if (input?.schemaVersion !== STREAMEROPS_SCENE_SCHEMA_VERSION || !Array.isArray(input?.sources)) {
    return buildSceneProfileFromEditorLayers(options.layers || [], options);
  }

  const profile = {
    ...input,
    profileId: String(input.profileId || options.profileId || 'scene-profile'),
    projectId: String(input.projectId || options.projectId || 'default-project'),
    name: String(input.name || options.name || 'Scene Profile'),
    canvas: {
      width: Math.max(1, toFiniteNumber(input.canvas?.width, DEFAULT_CANVAS.width)),
      height: Math.max(1, toFiniteNumber(input.canvas?.height, DEFAULT_CANVAS.height)),
      fps: Math.max(1, toFiniteNumber(input.canvas?.fps, DEFAULT_CANVAS.fps)),
    },
    target: {
      provider: 'obs',
      sceneName: String(input.target?.sceneName || options.sceneName || 'StreamerOps Scene Editor'),
    },
    sources: input.sources.map((source, index) => {
      const type = normalizeSchemaSourceType(source?.type);
      const id = sanitizeSourceId(source?.id, `source-${index + 1}`);
      const transform = source?.transform && typeof source.transform === 'object' ? source.transform : {};

      return {
        ...source,
        id,
        type,
        label: String(source?.label || id).slice(0, 120),
        enabled: Boolean(source?.enabled ?? true),
        locked: Boolean(source?.locked),
        group: String(source?.group || (type === 'image' ? 'branding' : type === 'media' ? 'playout' : `${type}s`)),
        zIndex: toFiniteNumber(source?.zIndex, index * 10),
        transform: {
          x: toFiniteNumber(transform.x, 0),
          y: toFiniteNumber(transform.y, 0),
          width: Math.max(1, toFiniteNumber(transform.width, 100)),
          height: Math.max(1, toFiniteNumber(transform.height, 100)),
          rotation: toFiniteNumber(transform.rotation, 0),
          opacity: clampNumber(toFiniteNumber(transform.opacity, 1), 0, 1),
        },
        obs: {
          sourceName: String(source?.obs?.sourceName || `SE-${id}`).slice(0, 100),
          sourceKind: String(source?.obs?.sourceKind || SOURCE_KIND_BY_TYPE[type]),
        },
        metadata: {
          ...(source?.metadata && typeof source.metadata === 'object' ? source.metadata : {}),
          editorLayerType: source?.metadata?.editorLayerType || toSceneEditorLayerType(type),
          fallback: Boolean(source?.metadata?.fallback ?? source?.fallback),
        },
        ...buildSourceSettings({ ...source, type }),
      };
    }),
    groups: Array.isArray(input.groups) ? input.groups : [],
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
  };

  return profile;
}

export function validateSceneProfile(input) {
  const errors = [];
  const warnings = [];

  if (input?.schemaVersion !== STREAMEROPS_SCENE_SCHEMA_VERSION) {
    errors.push(`Unsupported scene schema version: ${input?.schemaVersion || 'missing'}`);
  }

  if (!Array.isArray(input?.sources) || input.sources.length === 0) {
    errors.push('Scene profile must include at least one source.');
  }

  (input?.sources || []).forEach((source) => {
    if (!SCENE_SOURCE_TYPES.includes(source.type)) {
      errors.push(`Unsupported source type for ${source.id || 'unknown'}: ${source.type}`);
    }

    if (source.transform?.opacity < 0 || source.transform?.opacity > 1) {
      errors.push(`Opacity must be 0..1 for source ${source.id}.`);
    }

    if (source.transform?.width <= 0 || source.transform?.height <= 0) {
      errors.push(`Transform dimensions must be positive for source ${source.id}.`);
    }

    if ((source.type === 'image' || source.type === 'media' || source.type === 'audio') && !source.asset?.path) {
      warnings.push(`Asset path not yet set for source ${source.id}.`);
    }

    if (source.asset?.kind === 'previewOnly') {
      warnings.push(`Preview-only blob URL cannot be applied to OBS for source ${source.id}.`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function normalizeScenePatch(input) {
  const patch = input && typeof input === 'object' ? input : {};
  const operations = Array.isArray(patch.operations) ? patch.operations : [];

  return {
    schemaVersion: String(patch.schemaVersion || ''),
    profileId: String(patch.profileId || ''),
    intent: String(patch.intent || '').slice(0, 240),
    operations: operations.map((operation) => ({
      ...operation,
      op: String(operation?.op || ''),
      sourceId: operation?.sourceId === undefined ? undefined : String(operation.sourceId),
      groupId: operation?.groupId === undefined ? undefined : String(operation.groupId),
    })),
  };
}

export function validateScenePatch(input, profile) {
  const patch = normalizeScenePatch(input);
  const errors = [];

  if (patch.schemaVersion !== STREAMEROPS_SCENE_PATCH_VERSION) {
    errors.push(`Unsupported patch schema version: ${patch.schemaVersion || 'missing'}`);
  }

  if (profile?.profileId && patch.profileId && patch.profileId !== profile.profileId) {
    errors.push(`Patch profileId ${patch.profileId} does not match active profile ${profile.profileId}.`);
  }

  if (patch.operations.length === 0) {
    errors.push('Patch must include at least one operation.');
  }

  patch.operations.forEach((operation, index) => {
    if (!SCENE_PATCH_OPS.includes(operation.op)) {
      errors.push(`Unsupported patch operation at index ${index}: ${operation.op || 'missing'}`);
    }

    if (['updateSource', 'removeSource', 'reorderSource', 'setSourceEnabled'].includes(operation.op) && !operation.sourceId) {
      errors.push(`Patch operation ${operation.op} requires sourceId.`);
    }

    if (operation.op === 'setGroupEnabled' && !operation.groupId) {
      errors.push('Patch operation setGroupEnabled requires groupId.');
    }

    if (operation.op === 'addSource' && (!operation.source || typeof operation.source !== 'object')) {
      errors.push('Patch operation addSource requires a source object.');
    }

    if (operation.op === 'updateSource') {
      const set = operation.set && typeof operation.set === 'object' ? operation.set : null;
      if (!set || Object.keys(set).length === 0) {
        errors.push('Patch operation updateSource requires a non-empty set object.');
      } else {
        Object.keys(set).forEach((pathText) => {
          if (!isSafePatchPath(pathText)) {
            errors.push(`Patch path is not allowed: ${pathText}`);
          }
        });
      }
    }
  });

  return {
    valid: errors.length === 0,
    errors,
    patch,
  };
}

export function applySceneProfilePatch(profileInput, patchInput) {
  const profile = normalizeSceneProfile(profileInput);
  const validation = validateScenePatch(patchInput, profile);

  if (!validation.valid) {
    return {
      ok: false,
      profile,
      errors: validation.errors,
    };
  }

  const nextProfile = cloneSceneValue(profile);
  const applied = [];

  validation.patch.operations.forEach((operation) => {
    if (operation.op === 'addSource') {
      const normalized = normalizeSceneProfile({
        ...nextProfile,
        sources: [operation.source],
      }).sources[0];
      nextProfile.sources.push(normalized);
      applied.push({ op: operation.op, sourceId: normalized.id });
      return;
    }

    if (operation.op === 'removeSource') {
      nextProfile.sources = nextProfile.sources.filter((source) => source.id !== operation.sourceId);
      applied.push({ op: operation.op, sourceId: operation.sourceId });
      return;
    }

    if (operation.op === 'reorderSource') {
      const index = nextProfile.sources.findIndex((source) => source.id === operation.sourceId);
      if (index < 0) {
        return;
      }

      const nextIndex = clampNumber(toFiniteNumber(operation.index, index), 0, nextProfile.sources.length - 1);
      const [source] = nextProfile.sources.splice(index, 1);
      nextProfile.sources.splice(nextIndex, 0, source);
      nextProfile.sources = nextProfile.sources.map((item, sourceIndex) => ({ ...item, zIndex: sourceIndex * 10 }));
      applied.push({ op: operation.op, sourceId: operation.sourceId, index: nextIndex });
      return;
    }

    if (operation.op === 'setSourceEnabled') {
      nextProfile.sources = nextProfile.sources.map((source) => (
        source.id === operation.sourceId ? { ...source, enabled: Boolean(operation.enabled) } : source
      ));
      applied.push({ op: operation.op, sourceId: operation.sourceId, enabled: Boolean(operation.enabled) });
      return;
    }

    if (operation.op === 'setGroupEnabled') {
      nextProfile.groups = nextProfile.groups.map((group) => (
        group.id === operation.groupId ? { ...group, enabled: Boolean(operation.enabled) } : group
      ));
      const group = nextProfile.groups.find((item) => item.id === operation.groupId);
      if (group) {
        nextProfile.sources = nextProfile.sources.map((source) => (
          source.group === operation.groupId ? { ...source, enabled: Boolean(operation.enabled) } : source
        ));
      }
      applied.push({ op: operation.op, groupId: operation.groupId, enabled: Boolean(operation.enabled) });
      return;
    }

    if (operation.op === 'updateSource') {
      nextProfile.sources = nextProfile.sources.map((source) => {
        if (source.id !== operation.sourceId) {
          return source;
        }

        const nextSource = cloneSceneValue(source);
        Object.entries(operation.set).forEach(([pathText, value]) => {
          setPathValue(nextSource, pathText, value);
        });
        return nextSource;
      });
      applied.push({ op: operation.op, sourceId: operation.sourceId, paths: Object.keys(operation.set) });
    }
  });

  return {
    ok: true,
    profile: normalizeSceneProfile(nextProfile),
    applied,
  };
}

export function compileSceneProfile(profileInput, {
  resolveAssetPath = (source) => getSourcePath(source),
} = {}) {
  const profile = normalizeSceneProfile(profileInput);
  const validation = validateSceneProfile(profile);
  const sceneName = profile.target.sceneName;
  const actions = [
    {
      action: 'ensureScene',
      sceneName,
    },
  ];

  const orderedSources = [...profile.sources].sort((a, b) => {
    if (a.zIndex !== b.zIndex) {
      return a.zIndex - b.zIndex;
    }

    return profile.sources.indexOf(a) - profile.sources.indexOf(b);
  });

  const results = orderedSources.map((source) => {
    const fallback = Boolean(source.metadata?.fallback);
    const resolvedPath = resolveAssetPath(source);
    const transform = {
      x: source.transform.x,
      y: source.transform.y,
      width: source.transform.width,
      height: source.transform.height,
      rotation: source.transform.rotation,
      opacity: source.transform.opacity,
    };

    if (fallback) {
      return {
        layerId: source.id,
        label: source.label,
        sourceName: source.obs.sourceName,
        type: source.metadata?.editorLayerType || toSceneEditorLayerType(source.type),
        sourceType: source.type,
        obsKind: null,
        resolvedPath: null,
        visible: source.enabled,
        opacity: Math.round(source.transform.opacity * 100),
        transform,
        status: 'skipped',
        note: 'Fallback mode - existing OBS source will not be modified.',
      };
    }

    const ensureAction = {
      action: source.type === 'image'
        ? 'ensureImageSource'
        : source.type === 'media'
          ? 'ensureMediaSource'
          : source.type === 'text'
            ? 'ensureTextSource'
            : source.type === 'browser'
              ? 'ensureBrowserSource'
              : 'ensureAudioSource',
      sceneName,
      sourceId: source.id,
      sourceName: source.obs.sourceName,
      sourceKind: source.obs.sourceKind,
      inputSettings: {
        path: resolvedPath,
        text: source.type === 'text' ? source.template : undefined,
        url: source.type === 'browser' ? resolvedPath : undefined,
      },
    };

    actions.push(ensureAction);

    if (source.type !== 'audio') {
      actions.push({
        action: 'setSceneItemTransform',
        sceneName,
        sourceId: source.id,
        sourceName: source.obs.sourceName,
        transform,
      });
    }

    actions.push({
      action: 'setSceneItemEnabled',
      sceneName,
      sourceId: source.id,
      sourceName: source.obs.sourceName,
      enabled: source.enabled,
    });

    if (source.transform.opacity < 1) {
      actions.push({
        action: 'setSourceOpacity',
        sourceId: source.id,
        sourceName: source.obs.sourceName,
        opacity: source.transform.opacity,
      });
    }

    return {
      layerId: source.id,
      label: source.label,
      sourceName: source.obs.sourceName,
      type: source.metadata?.editorLayerType || toSceneEditorLayerType(source.type),
      sourceType: source.type,
      obsKind: source.obs.sourceKind,
      resolvedPath,
      visible: source.enabled,
      opacity: Math.round(source.transform.opacity * 100),
      transform,
      status: 'dry-run',
      note: `${source.type} source at x=${transform.x} y=${transform.y} ${transform.width}x${transform.height}`,
    };
  });

  return {
    schemaVersion: profile.schemaVersion,
    profileId: profile.profileId,
    sceneName,
    valid: validation.valid,
    errors: validation.errors,
    warnings: validation.warnings,
    actions,
    results,
  };
}

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
