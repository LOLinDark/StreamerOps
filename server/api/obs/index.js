import OBSWebSocket from 'obs-websocket-js';
import { createLogger } from '../../lib/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildSceneProfileFromEditorLayers,
  compileSceneProfile,
  normalizeSceneProfile,
} from '../../../app/streamer/sceneModel.js';

const logger = createLogger('api.obs');
const DEFAULT_HOST = process.env.OBS_WS_HOST || '127.0.0.1';
const DEFAULT_PORT = Number.parseInt(process.env.OBS_WS_PORT || '4455', 10);
const DEFAULT_SECURE = String(process.env.OBS_WS_SECURE || 'false').toLowerCase() === 'true';
const DEFAULT_TIMEOUT_MS = 4000;
const MAX_SCENE_NAME_LENGTH = 120;

// Resolve absolute paths for assets
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const ASSETS_DIR = path.join(PROJECT_ROOT, 'public', 'assets');

function sanitizeHost(value) {
  const host = String(value || DEFAULT_HOST).trim();
  if (!host || host.length > 255) {
    return DEFAULT_HOST;
  }
  return host;
}

function sanitizePort(value) {
  const parsed = Number.parseInt(String(value || DEFAULT_PORT), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    return DEFAULT_PORT;
  }
  return parsed;
}

function sanitizeSceneName(value) {
  const raw = String(value || 'StreamerOps Wizard 1B Test').trim();
  const cleaned = raw.replace(/[\r\n\t]/g, ' ').slice(0, MAX_SCENE_NAME_LENGTH);
  return cleaned || 'StreamerOps Wizard 1B Test';
}

function normalizeConnectionInput(body = {}) {
  return {
    host: sanitizeHost(body.host),
    port: sanitizePort(body.port),
    secure: Boolean(body.secure ?? DEFAULT_SECURE),
    password: typeof body.password === 'string' ? body.password : '',
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
}

function buildAddress({ host, port, secure }) {
  const protocol = secure ? 'wss' : 'ws';
  return `${protocol}://${host}:${port}`;
}

async function withObsConnection(input, task) {
  const obs = new OBSWebSocket();
  const address = buildAddress(input);

  try {
    const connectPromise = obs.connect(address, input.password || undefined, {
      rpcVersion: 1,
      eventSubscriptions: 0,
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`OBS connection timeout after ${input.timeoutMs}ms`)), input.timeoutMs);
    });

    const connectResult = await Promise.race([connectPromise, timeoutPromise]);
    const result = await task(obs, connectResult || {});
    return result;
  } finally {
    try {
      await obs.disconnect();
    } catch {
      // Ignore disconnect failures for probe-style requests.
    }
  }
}

function mapObsError(error) {
  const message = String(error?.message || 'Unknown OBS error');
  if (/authentication/i.test(message)) {
    return { status: 401, error: 'OBS authentication failed. Check websocket password.' };
  }
  if (/ECONNREFUSED|timeout|network|Unable to connect|connection/i.test(message)) {
    return { status: 502, error: 'Unable to connect to OBS websocket endpoint.' };
  }
  return { status: 500, error: 'OBS probe failed.' };
}

export function registerObsRoutes(app) {
  app.post('/api/obs/wizard/connect', async (req, res) => {
    const input = normalizeConnectionInput(req.body);

    try {
      const data = await withObsConnection(input, async (obs, connectResult) => {
        const version = await obs.call('GetVersion');

        return {
          success: true,
          mode: 'connect',
          address: buildAddress(input),
          negotiatedRpcVersion: connectResult?.negotiatedRpcVersion || null,
          obsVersion: version?.obsVersion || null,
          obsWebSocketVersion: version?.obsWebSocketVersion || null,
          platform: version?.platform || null,
        };
      });

      return res.json(data);
    } catch (error) {
      const mapped = mapObsError(error);
      logger.warn(`Wizard connect probe failed: ${error?.message || error}`);
      return res.status(mapped.status).json({ success: false, mode: 'connect', error: mapped.error, details: String(error?.message || '') });
    }
  });

  app.post('/api/obs/wizard/scene', async (req, res) => {
    const input = normalizeConnectionInput(req.body);
    const sceneName = sanitizeSceneName(req.body?.sceneName);

    try {
      const data = await withObsConnection(input, async (obs) => {
        const listBefore = await obs.call('GetSceneList');
        const existingNames = Array.isArray(listBefore?.scenes)
          ? listBefore.scenes.map((scene) => String(scene.sceneName || '')).filter(Boolean)
          : [];

        let created = false;
        if (!existingNames.includes(sceneName)) {
          await obs.call('CreateScene', { sceneName });
          created = true;
        }

        await obs.call('SetCurrentProgramScene', { sceneName });
        const listAfter = await obs.call('GetSceneList');

        return {
          success: true,
          mode: 'scene',
          address: buildAddress(input),
          sceneName,
          created,
          totalScenes: Array.isArray(listAfter?.scenes) ? listAfter.scenes.length : existingNames.length,
          currentProgramSceneName: listAfter?.currentProgramSceneName || sceneName,
        };
      });

      return res.json(data);
    } catch (error) {
      const mapped = mapObsError(error);
      logger.warn(`Wizard scene probe failed: ${error?.message || error}`);
      return res.status(mapped.status).json({ success: false, mode: 'scene', sceneName, error: mapped.error, details: String(error?.message || '') });
    }
  });

  // Step 3: Video Layer Check — creates a media source and leaves it visible in OBS
  app.post('/api/obs/wizard/video', async (req, res) => {
    const input = normalizeConnectionInput(req.body);
    const sceneName = sanitizeSceneName(req.body?.sceneName);
    const sourceName = 'StreamerOps-VideoProbe';

    try {
      const data = await withObsConnection(input, async (obs) => {
        const sceneList = await obs.call('GetSceneList');
        const scenes = (sceneList?.scenes || []).map((s) => s.sceneName);
        if (!scenes.includes(sceneName)) {
          return { success: false, error: `Test scene "${sceneName}" not found. Run Prepare Test Scene first.` };
        }

        // Remove stale probe source from a previous run (if any)
        try { await obs.call('RemoveInput', { inputName: sourceName }); } catch { /* ok */ }

        // Create a media source and leave it in the scene
        await obs.call('CreateInput', {
          sceneName,
          inputName: sourceName,
          inputKind: 'ffmpeg_source',
          inputSettings: { local_file: '', looping: false, hw_decode: false },
          sceneItemEnabled: true,
        });

        const inputList = await obs.call('GetInputList', { inputKind: 'ffmpeg_source' });
        const found = (inputList?.inputs || []).some((i) => i.inputName === sourceName);

        return {
          success: found,
          mode: 'video',
          sourceCreated: found,
          sourceName,
          sceneName,
          note: found ? `Media source "${sourceName}" created and left visible in test scene.` : 'Source not found after creation.',
        };
      });

      if (!data.success) return res.status(500).json({ success: false, ...data });
      return res.json(data);
    } catch (error) {
      const mapped = mapObsError(error);
      logger.warn(`Wizard video probe failed: ${error?.message || error}`);
      return res.status(mapped.status).json({ success: false, mode: 'video', error: mapped.error, details: String(error?.message || '') });
    }
  });

  // Step 4: Image Layer Check — creates an image source and leaves it visible in OBS
  app.post('/api/obs/wizard/image', async (req, res) => {
    const input = normalizeConnectionInput(req.body);
    const sceneName = sanitizeSceneName(req.body?.sceneName);
    const sourceName = 'StreamerOps-ImageProbe';

    try {
      const data = await withObsConnection(input, async (obs) => {
        const sceneList = await obs.call('GetSceneList');
        const scenes = (sceneList?.scenes || []).map((s) => s.sceneName);
        if (!scenes.includes(sceneName)) {
          return { success: false, error: `Test scene "${sceneName}" not found. Run Prepare Test Scene first.` };
        }

        try { await obs.call('RemoveInput', { inputName: sourceName }); } catch { /* ok */ }

        await obs.call('CreateInput', {
          sceneName,
          inputName: sourceName,
          inputKind: 'image_source',
          inputSettings: { file: '' },
          sceneItemEnabled: true,
        });

        const inputList = await obs.call('GetInputList', { inputKind: 'image_source' });
        const found = (inputList?.inputs || []).some((i) => i.inputName === sourceName);

        return {
          success: found,
          mode: 'image',
          sourceCreated: found,
          sourceName,
          sceneName,
          note: found ? `Image source "${sourceName}" created and left visible in test scene.` : 'Source not found after creation.',
        };
      });

      if (!data.success) return res.status(500).json({ success: false, ...data });
      return res.json(data);
    } catch (error) {
      const mapped = mapObsError(error);
      logger.warn(`Wizard image probe failed: ${error?.message || error}`);
      return res.status(mapped.status).json({ success: false, mode: 'image', error: mapped.error, details: String(error?.message || '') });
    }
  });

  // Step 5: Text Layer Check — tries versioned kinds (Streamlabs), writes text, reads it back, leaves source visible
  app.post('/api/obs/wizard/text', async (req, res) => {
    const input = normalizeConnectionInput(req.body);
    const sceneName = sanitizeSceneName(req.body?.sceneName);
    const sourceName = 'StreamerOps-TextProbe';
    const testText = 'StreamerOps Wizard 1B Text Probe';
    // Streamlabs uses _v3 variants; plain OBS uses non-versioned names
    const TEXT_KINDS = ['text_gdiplus_v3', 'text_gdiplus', 'text_ft2_source_v2', 'text_ft2_source'];

    try {
      const data = await withObsConnection(input, async (obs) => {
        const sceneList = await obs.call('GetSceneList');
        const scenes = (sceneList?.scenes || []).map((s) => s.sceneName);
        if (!scenes.includes(sceneName)) {
          return { success: false, error: `Test scene "${sceneName}" not found. Run Prepare Test Scene first.` };
        }

        try { await obs.call('RemoveInput', { inputName: sourceName }); } catch { /* ok */ }

        let inputKind = null;
        for (const kind of TEXT_KINDS) {
          try {
            await obs.call('CreateInput', {
              sceneName,
              inputName: sourceName,
              inputKind: kind,
              inputSettings: { text: testText },
              sceneItemEnabled: true,
            });
            inputKind = kind;
            break;
          } catch { /* try next */ }
        }

        if (!inputKind) {
          return { success: false, mode: 'text', error: `None of the text source kinds worked: ${TEXT_KINDS.join(', ')}` };
        }

        const settings = await obs.call('GetInputSettings', { inputName: sourceName });
        const readBack = settings?.inputSettings?.text || '';
        const textMatches = readBack === testText;

        return {
          success: textMatches,
          mode: 'text',
          sourceCreated: true,
          inputKind,
          textWritten: testText,
          textReadBack: readBack,
          textMatches,
          sourceName,
          sceneName,
          note: textMatches
            ? `Text source "${sourceName}" (${inputKind}) created with text, readback verified. Left visible in test scene.`
            : `Text readback mismatch using ${inputKind}.`,
        };
      });

      if (!data.success) return res.status(500).json({ success: false, ...data });
      return res.json(data);
    } catch (error) {
      const mapped = mapObsError(error);
      logger.warn(`Wizard text probe failed: ${error?.message || error}`);
      return res.status(mapped.status).json({ success: false, mode: 'text', error: mapped.error, details: String(error?.message || '') });
    }
  });

  // Step 6: Browser Layer Check — creates a browser source, toggles visibility, leaves it visible
  app.post('/api/obs/wizard/browser', async (req, res) => {
    const input = normalizeConnectionInput(req.body);
    const sceneName = sanitizeSceneName(req.body?.sceneName);
    const sourceName = 'StreamerOps-BrowserProbe';

    try {
      const data = await withObsConnection(input, async (obs) => {
        const sceneList = await obs.call('GetSceneList');
        const scenes = (sceneList?.scenes || []).map((s) => s.sceneName);
        if (!scenes.includes(sceneName)) {
          return { success: false, error: `Test scene "${sceneName}" not found. Run Prepare Test Scene first.` };
        }

        try { await obs.call('RemoveInput', { inputName: sourceName }); } catch { /* ok */ }

        await obs.call('CreateInput', {
          sceneName,
          inputName: sourceName,
          inputKind: 'browser_source',
          inputSettings: {
            url: 'about:blank',
            width: 1920,
            height: 1080,
            fps: 30,
            shutdown: false,
            restart_when_active: false,
          },
          sceneItemEnabled: true,
        });

        const inputList = await obs.call('GetInputList', { inputKind: 'browser_source' });
        const found = (inputList?.inputs || []).some((i) => i.inputName === sourceName);

        // Toggle visibility off then on to verify scene item control
        let toggleOk = false;
        if (found) {
          const items = await obs.call('GetSceneItemList', { sceneName });
          const item = (items?.sceneItems || []).find((si) => si.sourceName === sourceName);
          if (item) {
            await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId: item.sceneItemId, sceneItemEnabled: false });
            await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId: item.sceneItemId, sceneItemEnabled: true });
            toggleOk = true;
          }
        }

        return {
          success: found,
          mode: 'browser',
          sourceCreated: found,
          toggleOk,
          sourceName,
          sceneName,
          note: found ? `Browser source "${sourceName}" created, visibility toggled. Left visible in test scene.` : 'Source not found after creation.',
        };
      });

      if (!data.success) return res.status(500).json({ success: false, ...data });
      return res.json(data);
    } catch (error) {
      const mapped = mapObsError(error);
      logger.warn(`Wizard browser probe failed: ${error?.message || error}`);
      return res.status(mapped.status).json({ success: false, mode: 'browser', error: mapped.error, details: String(error?.message || '') });
    }
  });

  // Step 7: Ordering and Visibility — creates two color sources (tries v3 for Streamlabs), reorders, leaves them visible
  app.post('/api/obs/wizard/order', async (req, res) => {
    const input = normalizeConnectionInput(req.body);
    const sceneName = sanitizeSceneName(req.body?.sceneName);
    const sourceA = 'StreamerOps-OrderProbeA';
    const sourceB = 'StreamerOps-OrderProbeB';
    const COLOR_KINDS = ['color_source_v3', 'color_source'];

    try {
      const data = await withObsConnection(input, async (obs) => {
        const sceneList = await obs.call('GetSceneList');
        const scenes = (sceneList?.scenes || []).map((s) => s.sceneName);
        if (!scenes.includes(sceneName)) {
          return { success: false, error: `Test scene "${sceneName}" not found. Run Prepare Test Scene first.` };
        }

        try { await obs.call('RemoveInput', { inputName: sourceA }); } catch { /* ok */ }
        try { await obs.call('RemoveInput', { inputName: sourceB }); } catch { /* ok */ }

        // Find a supported color source kind
        let colorKind = null;
        for (const kind of COLOR_KINDS) {
          try {
            await obs.call('CreateInput', { sceneName, inputName: sourceA, inputKind: kind, inputSettings: { color: 0xff0000ff }, sceneItemEnabled: true });
            colorKind = kind;
            break;
          } catch { /* try next */ }
        }

        if (!colorKind) {
          return { success: false, mode: 'order', error: `None of the color source kinds worked: ${COLOR_KINDS.join(', ')}` };
        }

        await obs.call('CreateInput', { sceneName, inputName: sourceB, inputKind: colorKind, inputSettings: { color: 0xff00ff00 }, sceneItemEnabled: true });

        const itemsBefore = await obs.call('GetSceneItemList', { sceneName });
        const itemA = (itemsBefore?.sceneItems || []).find((si) => si.sourceName === sourceA);
        const itemB = (itemsBefore?.sceneItems || []).find((si) => si.sourceName === sourceB);

        let reorderOk = false;
        let toggleOk = false;
        if (itemA && itemB) {
          // Toggle B visibility
          await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId: itemB.sceneItemId, sceneItemEnabled: false });
          await obs.call('SetSceneItemEnabled', { sceneName, sceneItemId: itemB.sceneItemId, sceneItemEnabled: true });
          toggleOk = true;

          // Move A to index 0
          await obs.call('SetSceneItemIndex', { sceneName, sceneItemId: itemA.sceneItemId, sceneItemIndex: 0 });
          const itemsAfter = await obs.call('GetSceneItemList', { sceneName });
          const topItem = (itemsAfter?.sceneItems || [])[0];
          reorderOk = topItem?.sceneItemId === itemA.sceneItemId;
        }

        return {
          success: reorderOk,
          mode: 'order',
          colorKind,
          reorderOk,
          toggleOk,
          sceneName,
          note: reorderOk
            ? `Two color sources created (${colorKind}), reorder and visibility toggle verified. Left visible in test scene.`
            : `Color sources created but reorder verification failed.`,
        };
      });

      if (!data.success) return res.status(500).json({ success: false, ...data });
      return res.json(data);
    } catch (error) {
      const mapped = mapObsError(error);
      logger.warn(`Wizard order probe failed: ${error?.message || error}`);
      return res.status(mapped.status).json({ success: false, mode: 'order', error: mapped.error, details: String(error?.message || '') });
    }
  });

  // Step 8: Audio Behavior Check — reads audio inputs, toggles mute and restores
  app.post('/api/obs/wizard/audio', async (req, res) => {
    const input = normalizeConnectionInput(req.body);

    try {
      const data = await withObsConnection(input, async (obs) => {
        const inputList = await obs.call('GetInputList');
        const allInputs = inputList?.inputs || [];

        const audioInputs = [];
        for (const inp of allInputs) {
          try {
            const vol = await obs.call('GetInputVolume', { inputName: inp.inputName });
            if (vol !== null && vol !== undefined) {
              const mute = await obs.call('GetInputMute', { inputName: inp.inputName });
              audioInputs.push({ name: inp.inputName, kind: inp.inputKind, muted: mute?.inputMuted ?? null, volumeDb: vol?.inputVolumeDb ?? null });
            }
          } catch { /* not an audio input */ }
        }

        let muteToggleOk = false;
        let testedInput = null;
        if (audioInputs.length > 0) {
          const target = audioInputs[0];
          testedInput = target.name;
          const wasMuted = target.muted ?? false;
          await obs.call('SetInputMute', { inputName: target.name, inputMuted: !wasMuted });
          const afterToggle = await obs.call('GetInputMute', { inputName: target.name });
          muteToggleOk = afterToggle?.inputMuted === !wasMuted;
          await obs.call('SetInputMute', { inputName: target.name, inputMuted: wasMuted });
        }

        return {
          success: audioInputs.length > 0,
          mode: 'audio',
          audioInputCount: audioInputs.length,
          audioInputs: audioInputs.slice(0, 6),
          muteToggleOk,
          testedInput,
          note: audioInputs.length > 0
            ? `Found ${audioInputs.length} audio input(s). Mute toggle ${muteToggleOk ? 'verified' : 'not confirmed'} on "${testedInput}".`
            : 'No audio inputs found. Add a mic or desktop audio source to OBS.',
        };
      });

      if (!data.success) return res.status(500).json({ success: false, ...data });
      return res.json(data);
    } catch (error) {
      const mapped = mapObsError(error);
      logger.warn(`Wizard audio probe failed: ${error?.message || error}`);
      return res.status(mapped.status).json({ success: false, mode: 'audio', error: mapped.error, details: String(error?.message || '') });
    }
  });

  // Logo Setup: Create positioned Star Citizen logo image sources for WYSIWYG scene migration test
  app.post('/api/obs/wizard/logos', async (req, res) => {
    const input = normalizeConnectionInput(req.body);
    const sceneName = sanitizeSceneName(req.body?.sceneName);
    const LEFT_LOGO_SOURCE = 'StreamerOps-LogoLeft';
    const RIGHT_LOGO_SOURCE = 'StreamerOps-LogoRight';
    const LEFT_LOGO_FILE = path.join(ASSETS_DIR, 'images', 'star-citizen', 'starcitizen-logo-white.png');
    const RIGHT_LOGO_FILE = path.join(ASSETS_DIR, 'images', 'star-citizen', 'MadeByTheCommunity_White.png');

    logger.info(`Wizard logo setup: Scene=${sceneName}, Left=${LEFT_LOGO_FILE}, Right=${RIGHT_LOGO_FILE}`);

    try {
      const data = await withObsConnection(input, async (obs) => {
        const sceneList = await obs.call('GetSceneList');
        const scenes = (sceneList?.scenes || []).map((s) => s.sceneName);
        if (!scenes.includes(sceneName)) {
          return { success: false, error: `Test scene "${sceneName}" not found. Run Prepare Test Scene first.` };
        }

        // Clean up stale logo sources from previous runs
        try { await obs.call('RemoveInput', { inputName: LEFT_LOGO_SOURCE }); } catch { /* ok */ }
        try { await obs.call('RemoveInput', { inputName: RIGHT_LOGO_SOURCE }); } catch { /* ok */ }

        // Normalize paths for OBS (use forward slashes)
        const leftLogoPath = LEFT_LOGO_FILE.replace(/\\/g, '/');
        const rightLogoPath = RIGHT_LOGO_FILE.replace(/\\/g, '/');

        // Create left logo (Star Citizen logo, left side)
        await obs.call('CreateInput', {
          sceneName,
          inputName: LEFT_LOGO_SOURCE,
          inputKind: 'image_source',
          inputSettings: { file: leftLogoPath },
          sceneItemEnabled: true,
        });

        // Create right logo (Made By The Community, right side)
        await obs.call('CreateInput', {
          sceneName,
          inputName: RIGHT_LOGO_SOURCE,
          inputKind: 'image_source',
          inputSettings: { file: rightLogoPath },
          sceneItemEnabled: true,
        });

        // Get scene items and apply transforms
        const items = await obs.call('GetSceneItemList', { sceneName });
        const leftItem = (items?.sceneItems || []).find((si) => si.sourceName === LEFT_LOGO_SOURCE);
        const rightItem = (items?.sceneItems || []).find((si) => si.sourceName === RIGHT_LOGO_SOURCE);

        const results = { left: null, right: null };

        // Position left logo: absolute left=16, vertically centered, max height 64px
        if (leftItem) {
          await obs.call('SetSceneItemTransform', {
            sceneName,
            sceneItemId: leftItem.sceneItemId,
            sceneItemTransform: {
              positionX: 16,
              positionY: 17,
              width: 64,
              height: 64,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
              alignment: 0,
              boundsType: 'OBS_BOUNDS_NONE',
              boundsWidth: 64,
              boundsHeight: 64,
              boundsAlignment: 0,
            },
          });
          results.left = 'positioned';
        }

        // Position right logo: absolute right=16 (1920-64-16=1840), vertically centered, max height 64px
        if (rightItem) {
          await obs.call('SetSceneItemTransform', {
            sceneName,
            sceneItemId: rightItem.sceneItemId,
            sceneItemTransform: {
              positionX: 1840,
              positionY: 17,
              width: 64,
              height: 64,
              rotation: 0,
              scaleX: 1,
              scaleY: 1,
              alignment: 0,
              boundsType: 'OBS_BOUNDS_NONE',
              boundsWidth: 64,
              boundsHeight: 64,
              boundsAlignment: 0,
            },
          });
          results.right = 'positioned';
        }

        return {
          success: !!(leftItem && rightItem),
          mode: 'logos',
          logoSources: { left: LEFT_LOGO_SOURCE, right: RIGHT_LOGO_SOURCE },
          transforms: results,
          sceneName,
          note: 'Star Citizen logo sources created and positioned.',
        };
      });

      if (!data.success) return res.status(500).json({ success: false, ...data });
      return res.json(data);
    } catch (error) {
      const mapped = mapObsError(error);
      logger.warn(`Wizard logo setup probe failed: ${error?.message || error}`);
      return res.status(mapped.status).json({ success: false, mode: 'logos', error: mapped.error, details: String(error?.message || '') });
    }
  });

  // Scene Editor: Apply a scene schema to OBS as native sources
  app.post('/api/obs/scene-editor/apply', async (req, res) => {
    const input = normalizeConnectionInput(req.body);
    const sceneName = sanitizeSceneName(req.body?.sceneName);
    const layers = Array.isArray(req.body?.layers) ? req.body.layers : [];
    const requestedProfile = req.body?.sceneProfile;
    const dryRun = Boolean(req.body?.dryRun);

    if ((!requestedProfile || typeof requestedProfile !== 'object') && layers.length === 0) {
      return res.status(400).json({ success: false, error: 'sceneProfile or layers array is required and must not be empty.' });
    }

    const TEXT_KINDS = ['text_gdiplus_v3', 'text_gdiplus', 'text_ft2_source_v2', 'text_ft2_source'];

    const resolveSceneSourcePath = (source) => {
      if (source.type === 'browser') {
        return /^https?:\/\//.test(source.url || '') ? source.url : 'about:blank';
      }

      if (source.type === 'text') {
        return String(source.template || '');
      }

      const asset = source.asset || {};
      const rawPath = String(asset.path || '');

      if (!rawPath || asset.kind === 'previewOnly') {
        return '';
      }

      if (asset.kind === 'publicAsset' || rawPath.startsWith('/assets/')) {
        return path.join(ASSETS_DIR, rawPath.replace(/^\/assets\//, ''));
      }

      return rawPath;
    };

    const normalizeAudioProfile = (source) => {
      const audio = source.audio && typeof source.audio === 'object' ? source.audio : {};
      const profile = String(audio.profile || 'live-program');
      const profileMuted = profile === 'preview-muted' || profile === 'intermission-muted';

      return {
        profile,
        muted: Boolean(audio.muted || profileMuted),
        monitoring: String(audio.monitoring || 'monitorOff'),
      };
    };

    const parseCssColor = (value) => {
      const text = String(value || '').trim();
      if (!text || text === 'transparent') {
        return null;
      }

      const hex = text.match(/^#?([0-9a-f]{6})([0-9a-f]{2})?$/i);
      if (hex) {
        const raw = hex[1];
        const alpha = hex[2] ? Number.parseInt(hex[2], 16) : 255;
        return {
          r: Number.parseInt(raw.slice(0, 2), 16),
          g: Number.parseInt(raw.slice(2, 4), 16),
          b: Number.parseInt(raw.slice(4, 6), 16),
          a: alpha,
        };
      }

      const rgba = text.match(/^rgba?\(([^)]+)\)$/i);
      if (rgba) {
        const parts = rgba[1].split(',').map((part) => part.trim());
        const alpha = parts[3] === undefined ? 1 : Math.max(0, Math.min(1, Number(parts[3])));
        return {
          r: Math.max(0, Math.min(255, Number.parseInt(parts[0], 10) || 0)),
          g: Math.max(0, Math.min(255, Number.parseInt(parts[1], 10) || 0)),
          b: Math.max(0, Math.min(255, Number.parseInt(parts[2], 10) || 0)),
          a: Math.round(alpha * 255),
        };
      }

      return null;
    };

    const toObsColorInt = (value) => {
      const color = parseCssColor(value);
      if (!color) {
        return null;
      }

      return ((color.a << 24) | (color.b << 16) | (color.g << 8) | color.r) >>> 0;
    };

    const toFontStyleName = (weight) => {
      const numeric = Number(weight);
      if (numeric >= 800) return 'Extra Bold';
      if (numeric >= 700) return 'Bold';
      if (numeric >= 600) return 'Semi Bold';
      return 'Regular';
    };

    const buildObsTextSettings = (text, style = {}) => {
      const fontSize = Number.isFinite(Number(style.fontSize)) ? Math.max(8, Number(style.fontSize)) : 42;
      const color = toObsColorInt(style.color || '#f4fbff');
      const background = parseCssColor(style.backgroundColor);
      const backgroundColor = toObsColorInt(style.backgroundColor);
      const settings = {
        text,
        font: {
          face: String(style.fontFamily || 'Inter'),
          size: fontSize,
          style: toFontStyleName(style.fontWeight),
        },
      };

      if (color !== null) {
        settings.color = color;
      }

      if (backgroundColor !== null) {
        settings.bk_color = backgroundColor;
        settings.bk_opacity = background?.a ?? 255;
      } else {
        settings.bk_opacity = 0;
      }

      if (['left', 'center', 'right'].includes(String(style.textAlign))) {
        settings.align = String(style.textAlign);
      }

      return settings;
    };

    const sourceToApplyLayer = (source) => {
      const transform = source.transform || {};
      return {
        id: String(source.id || '').slice(0, 80),
        label: String(source.label || '').slice(0, 120),
        sourceName: String(source.obs?.sourceName || `SE-${source.id}`).slice(0, 100),
        type: source.type === 'media' ? 'video' : source.type,
        visible: Boolean(source.enabled ?? true),
        fallback: Boolean(source.metadata?.fallback),
        x: Number.isFinite(Number(transform.x)) ? Number(transform.x) : 0,
        y: Number.isFinite(Number(transform.y)) ? Number(transform.y) : 0,
        width: Number.isFinite(Number(transform.width)) ? Math.max(1, Number(transform.width)) : 100,
        height: Number.isFinite(Number(transform.height)) ? Math.max(1, Number(transform.height)) : 100,
        opacity: Number.isFinite(Number(transform.opacity)) ? Math.min(100, Math.max(0, Number(transform.opacity) * 100)) : 100,
        source: resolveSceneSourcePath(source),
        audio: source.type === 'media' || source.type === 'audio' ? normalizeAudioProfile(source) : null,
        browser: source.type === 'browser' && source.browser && typeof source.browser === 'object' ? source.browser : null,
        style: source.type === 'text' && source.style && typeof source.style === 'object' ? source.style : null,
        playlistSlot: source.asset?.kind === 'playlistSlot' ? source.asset.slot : null,
        playlistItemTitle: source.asset?.kind === 'playlistSlot' ? source.asset.itemTitle : null,
        playlistNextTitle: source.asset?.kind === 'playlistSlot' ? source.asset.nextItemTitle : null,
        playbackState: source.asset?.kind === 'playlistSlot' ? source.asset.playbackState : null,
      };
    };

    const sceneProfile = requestedProfile && typeof requestedProfile === 'object'
      ? normalizeSceneProfile(requestedProfile, { layers, sceneName })
      : buildSceneProfileFromEditorLayers(layers, { sceneName });
    sceneProfile.target.sceneName = sceneName;

    const scenePlan = compileSceneProfile(sceneProfile, { resolveAssetPath: resolveSceneSourcePath });
    if (!scenePlan.valid) {
      return res.status(400).json({
        success: false,
        mode: 'scene-editor-apply',
        sceneName,
        schemaVersion: scenePlan.schemaVersion,
        errors: scenePlan.errors,
        warnings: scenePlan.warnings,
        error: scenePlan.errors.join(' '),
      });
    }

    const sanitizedLayers = sceneProfile.sources.map(sourceToApplyLayer);

    // ── Dry-run path ─────────────────────────────────────────────────────────
    if (dryRun) {
      return res.json({
        success: true,
        mode: 'scene-editor-apply',
        dryRun: true,
        schemaVersion: scenePlan.schemaVersion,
        profileId: scenePlan.profileId,
        sceneName,
        warnings: scenePlan.warnings,
        actions: scenePlan.actions,
        totalLayers: sanitizedLayers.length,
        totalApplied: 0,
        results: scenePlan.results,
      });
    }

    // ── Live apply path ───────────────────────────────────────────────────────
    try {
      const data = await withObsConnection(input, async (obs) => {
        // Ensure target scene exists
        const sceneList = await obs.call('GetSceneList');
        const existingScenes = (sceneList?.scenes || []).map((s) => s.sceneName);
        if (!existingScenes.includes(sceneName)) {
          await obs.call('CreateScene', { sceneName });
        }

        const results = [];

        const inputExists = async (inputName) => {
          const inputList = await obs.call('GetInputList');
          return (inputList?.inputs || []).some((item) => item.inputName === inputName);
        };

        const getSceneItem = async (sourceName) => {
          const sceneItems = await obs.call('GetSceneItemList', { sceneName });
          return (sceneItems?.sceneItems || []).find((item) => item.sourceName === sourceName) || null;
        };

        const ensureSceneItem = async (sourceName, visible) => {
          let item = await getSceneItem(sourceName);
          let sceneItemCreated = false;

          if (!item) {
            try {
              await obs.call('CreateSceneItem', {
                sceneName,
                sourceName,
                sceneItemEnabled: visible,
              });
              sceneItemCreated = true;
              item = await getSceneItem(sourceName);
            } catch {
              // Some OBS-compatible targets may not expose CreateSceneItem.
            }
          }

          if (item) {
            await obs.call('SetSceneItemEnabled', {
              sceneName,
              sceneItemId: item.sceneItemId,
              sceneItemEnabled: visible,
            });
          }

          return { item, sceneItemCreated };
        };

        const ensureInput = async ({ sourceName, inputKind, inputSettings, visible, createKinds }) => {
          const exists = await inputExists(sourceName);

          if (exists) {
            await obs.call('SetInputSettings', {
              inputName: sourceName,
              inputSettings,
              overlay: true,
            });
            const sceneItemResult = await ensureSceneItem(sourceName, visible);
            return {
              created: false,
              updated: true,
              inputKind,
              ...sceneItemResult,
            };
          }

          if (Array.isArray(createKinds) && createKinds.length > 0) {
            let lastError = null;
            for (const candidateKind of createKinds) {
              try {
                await obs.call('CreateInput', {
                  sceneName,
                  inputName: sourceName,
                  inputKind: candidateKind,
                  inputSettings,
                  sceneItemEnabled: visible,
                });
                const sceneItemResult = await ensureSceneItem(sourceName, visible);
                return {
                  created: true,
                  updated: false,
                  inputKind: candidateKind,
                  ...sceneItemResult,
                };
              } catch (error) {
                lastError = error;
              }
            }

            throw lastError || new Error(`Unable to create input "${sourceName}"`);
          }

          await obs.call('CreateInput', {
            sceneName,
            inputName: sourceName,
            inputKind,
            inputSettings,
            sceneItemEnabled: visible,
          });
          const sceneItemResult = await ensureSceneItem(sourceName, visible);
          return {
            created: true,
            updated: false,
            inputKind,
            ...sceneItemResult,
          };
        };

        // Process layers bottom-first so z-order in OBS matches visual stack
        const orderedLayers = [...sanitizedLayers].reverse();

        for (const layer of orderedLayers) {
          const sourceName = String(layer.sourceName || `SE-${layer.id}`).slice(0, 100);
          const result = { layerId: layer.id, sourceName, type: layer.type, status: 'pending', note: '' };

          // Fallback mode — leave existing OBS source untouched
          if (layer.fallback) {
            result.status = 'skipped';
            result.note = 'Fallback mode — existing OBS source not modified.';
            results.push(result);
            continue;
          }

          try {
            let ensureResult = null;

            if (layer.type === 'video') {
              // Resolve source: only allow filesystem paths (not blob: or http: for OBS)
              const filePath = layer.source.startsWith('/') || /^[A-Za-z]:[\\/]/.test(layer.source)
                ? layer.source.replace(/\//g, '\\')
                : '';

              ensureResult = await ensureInput({
                sourceName,
                inputKind: 'ffmpeg_source',
                inputSettings: { local_file: filePath, looping: true, hw_decode: false },
                visible: layer.visible,
              });
              result.note = filePath
                ? `Video source set to ${filePath}${layer.playlistItemTitle ? ` (${layer.playlistItemTitle})` : ''}`
                : 'Video source ensured (no local path - set file in OBS)';

            } else if (layer.type === 'image') {
              const filePath = layer.source.startsWith('/') || /^[A-Za-z]:[\\/]/.test(layer.source)
                ? layer.source.replace(/\//g, '\\')
                : path.join(ASSETS_DIR, layer.source.replace(/^\/assets\//, ''));

              ensureResult = await ensureInput({
                sourceName,
                inputKind: 'image_source',
                inputSettings: { file: filePath },
                visible: layer.visible,
              });
              result.note = `Image source set to ${filePath}`;

            } else if (layer.type === 'text') {
              const textSettings = buildObsTextSettings(layer.source, layer.style || {});
              ensureResult = await ensureInput({
                sourceName,
                inputKind: TEXT_KINDS[0],
                inputSettings: textSettings,
                visible: layer.visible,
                createKinds: TEXT_KINDS,
              });
              result.note = `Text source set with kind ${ensureResult.inputKind}`;
              result.textStyle = {
                fontFamily: textSettings.font?.face || null,
                fontSize: textSettings.font?.size || null,
                fontStyle: textSettings.font?.style || null,
                colorApplied: textSettings.color !== undefined,
                backgroundApplied: textSettings.bk_opacity > 0,
                align: textSettings.align || null,
              };

            } else if (layer.type === 'browser') {
              const url = /^https?:\/\//.test(layer.source) ? layer.source : 'about:blank';
              const browserWidth = Number.isFinite(Number(layer.browser?.width)) ? Math.max(1, Number(layer.browser.width)) : layer.width;
              const browserHeight = Number.isFinite(Number(layer.browser?.height)) ? Math.max(1, Number(layer.browser.height)) : layer.height;
              ensureResult = await ensureInput({
                sourceName,
                inputKind: 'browser_source',
                inputSettings: {
                  url,
                  width: browserWidth,
                  height: browserHeight,
                  fps: 30,
                  shutdown: false,
                  restart_when_active: Boolean(layer.browser?.restartWhenActive),
                },
                visible: layer.visible,
              });
              result.note = `Browser source set to ${url} (${browserWidth}x${browserHeight})`;

            } else if (layer.type === 'audio') {
              // Audio has no canvas position; just create a media source stub
              ensureResult = await ensureInput({
                sourceName,
                inputKind: 'ffmpeg_source',
                inputSettings: { local_file: layer.source, looping: true, hw_decode: false },
                visible: layer.visible,
              });
              result.note = 'Audio/media source ensured';

            } else {
              result.status = 'skipped';
              result.note = `Unsupported layer type: ${layer.type}`;
              results.push(result);
              continue;
            }

            result.operation = ensureResult?.created ? 'created' : 'updated';
            result.inputKind = ensureResult?.inputKind || null;
            result.sceneItemCreated = Boolean(ensureResult?.sceneItemCreated);
            result.playlistSlot = layer.playlistSlot || null;
            result.playbackState = layer.playbackState || null;

            if ((layer.type === 'video' || layer.type === 'audio') && layer.audio) {
              try {
                await obs.call('SetInputMute', {
                  inputName: sourceName,
                  inputMuted: Boolean(layer.audio.muted),
                });
                result.audio = {
                  profile: layer.audio.profile,
                  muted: Boolean(layer.audio.muted),
                  monitoring: layer.audio.monitoring,
                };
              } catch (audioError) {
                result.audioWarning = `Audio profile not fully applied: ${String(audioError?.message || audioError)}`;
              }
            }

            if (layer.type === 'video' && layer.playlistSlot && layer.playbackState === 'playing') {
              try {
                await obs.call('TriggerMediaInputAction', {
                  inputName: sourceName,
                  mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART',
                });
                result.mediaAction = 'restart';
              } catch (mediaError) {
                result.mediaWarning = `Media restart not applied: ${String(mediaError?.message || mediaError)}`;
              }
            }

            // Apply position and size transform
            const item = ensureResult?.item || await getSceneItem(sourceName);
            if (item) {
              const sceneItemTransform = {
                positionX: layer.x,
                positionY: layer.y,
                boundsWidth: layer.width,
                boundsHeight: layer.height,
                boundsType: 'OBS_BOUNDS_SCALE_INNER',
                alignment: 5, // top-left
              };

              if (layer.type !== 'audio') {
                await obs.call('SetSceneItemTransform', {
                  sceneName,
                  sceneItemId: item.sceneItemId,
                  sceneItemTransform,
                });
              }

              // Reset stale opacity filters before adding the current one.
              const filterName = `${sourceName}-opacity`;
              try { await obs.call('RemoveSourceFilter', { sourceName, filterName }); } catch { /* ok */ }
              if (layer.opacity < 100) {
                await obs.call('CreateSourceFilter', {
                  sourceName,
                  filterName,
                  filterKind: 'color_grade_filter',
                  filterSettings: { opacity: layer.opacity / 100 },
                });
              }
            }

            if (!item && layer.type !== 'audio') {
              result.status = 'error';
              result.note = `${result.note}; source settings updated but no scene item was found in "${sceneName}".`;
            } else {
              result.status = 'ok';
            }
          } catch (layerError) {
            result.status = 'error';
            result.note = String(layerError?.message || layerError);
            logger.warn(`Scene apply error for layer ${layer.id}: ${result.note}`);
          }

          results.push(result);
        }

        const totalOk = results.filter((r) => r.status === 'ok').length;
        return {
          success: true,
          mode: 'scene-editor-apply',
          sceneName,
          totalLayers: sanitizedLayers.length,
          totalApplied: totalOk,
          results,
        };
      });

      return res.json(data);
    } catch (error) {
      const mapped = mapObsError(error);
      logger.warn(`Scene editor apply failed: ${error?.message || error}`);
      return res.status(mapped.status).json({ success: false, mode: 'scene-editor-apply', error: mapped.error, details: String(error?.message || '') });
    }
  });

  // Cleanup: remove all probe sources from the test scene
  app.post('/api/obs/wizard/cleanup', async (req, res) => {
    const input = normalizeConnectionInput(req.body);
    const sceneName = sanitizeSceneName(req.body?.sceneName);
    const PROBE_SOURCES = [
      'StreamerOps-VideoProbe',
      'StreamerOps-ImageProbe',
      'StreamerOps-TextProbe',
      'StreamerOps-BrowserProbe',
      'StreamerOps-OrderProbeA',
      'StreamerOps-OrderProbeB',
      'StreamerOps-LogoLeft',
      'StreamerOps-LogoRight',
    ];

    try {
      const data = await withObsConnection(input, async (obs) => {
        const removed = [];
        const skipped = [];
        for (const name of PROBE_SOURCES) {
          try {
            await obs.call('RemoveInput', { inputName: name });
            removed.push(name);
          } catch {
            skipped.push(name);
          }
        }
        return { success: true, mode: 'cleanup', removed, skipped, sceneName };
      });

      return res.json(data);
    } catch (error) {
      const mapped = mapObsError(error);
      logger.warn(`Wizard cleanup failed: ${error?.message || error}`);
      return res.status(mapped.status).json({ success: false, mode: 'cleanup', error: mapped.error, details: String(error?.message || '') });
    }
  });

  logger.info('OBS wizard routes registered');
}
