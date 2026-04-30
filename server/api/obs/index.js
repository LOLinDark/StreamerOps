import OBSWebSocket from 'obs-websocket-js';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('api.obs');
const DEFAULT_HOST = process.env.OBS_WS_HOST || '127.0.0.1';
const DEFAULT_PORT = Number.parseInt(process.env.OBS_WS_PORT || '4455', 10);
const DEFAULT_SECURE = String(process.env.OBS_WS_SECURE || 'false').toLowerCase() === 'true';
const DEFAULT_TIMEOUT_MS = 4000;
const MAX_SCENE_NAME_LENGTH = 120;

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

  logger.info('OBS wizard routes registered');
}
