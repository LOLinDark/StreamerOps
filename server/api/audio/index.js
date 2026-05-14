import { exec } from 'child_process';
import OBSWebSocket from 'obs-websocket-js';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('api.audio');

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    exec(`powershell -NoProfile -NonInteractive -Command "${script}"`, { timeout: 8000 }, (error, stdout, stderr) => {
      if (error) return reject(new Error(`PowerShell failed: ${stderr || error.message}`));
      resolve(stdout.trim());
    });
  });
}

async function getWindowsAudioDevices() {
  try {
    const raw = await runPowerShell(
      'Get-CimInstance Win32_SoundDevice | Select-Object Name, Status, Manufacturer | ConvertTo-Json -Compress'
    );
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    logger.warn('CIM sound device query failed:', e.message);
    throw e;
  }
}

async function checkProcessRunning(processName) {
  try {
    const raw = await runPowerShell(
      `Get-Process -Name '${processName}' -ErrorAction SilentlyContinue | Select-Object -First 1 Id, ProcessName | ConvertTo-Json -Compress`
    );
    if (!raw) return { running: false, name: processName };
    const parsed = JSON.parse(raw);
    return { running: true, name: processName, pid: parsed.Id };
  } catch {
    return { running: false, name: processName };
  }
}

export function registerAudioDiagnosticRoutes(app) {
  app.get('/api/audio/devices', async (req, res) => {
    try {
      const [devices, processes] = await Promise.all([
        getWindowsAudioDevices(),
        Promise.all([
          checkProcessRunning('NVIDIA Broadcast'),
          checkProcessRunning('obs64'),
          checkProcessRunning('Streamlabs Desktop'),
        ]),
      ]);

      return res.json({ success: true, devices, processes, timestamp: new Date().toISOString() });
    } catch (error) {
      logger.warn('Audio device enumeration failed:', error.message);
      return res.status(500).json({ success: false, error: error.message || 'Unknown error' });
    }
  });

  app.post('/api/audio/obs-diagnostic', async (req, res) => {
    const obs = new OBSWebSocket();
    const host = String(req.body?.host || '127.0.0.1').trim();
    const port = Number(req.body?.port) || 4455;
    const password = req.body?.password || '';

    try {
      await obs.connect(`ws://${host}:${port}`, password || undefined, { rpcVersion: 1, eventSubscriptions: 0 });

      const inputList = await obs.call('GetInputList');
      const allInputs = inputList?.inputs || [];

      const audioSources = [];
      for (const inp of allInputs) {
        try {
          const vol = await obs.call('GetInputVolume', { inputName: inp.inputName });
          if (vol === null || vol === undefined) continue;

          const mute = await obs.call('GetInputMute', { inputName: inp.inputName });
          const settings = await obs.call('GetInputSettings', { inputName: inp.inputName });

          let monitorType = null;
          try {
            const m = await obs.call('GetInputAudioMonitorType', { inputName: inp.inputName });
            monitorType = m?.monitorType || null;
          } catch { /* not supported for this input */ }

          let tracks = null;
          try {
            const t = await obs.call('GetInputAudioTracks', { inputName: inp.inputName });
            tracks = t?.inputAudioTracks || null;
          } catch { /* not supported */ }

          audioSources.push({
            name: inp.inputName,
            kind: inp.inputKind,
            muted: mute?.inputMuted ?? null,
            volumeDb: vol?.inputVolumeDb ?? null,
            volumeMul: vol?.inputVolumeMul ?? null,
            monitorType,
            tracks,
            device: settings?.inputSettings?.device_id || settings?.inputSettings?.device || null,
          });
        } catch { /* not audio-capable */ }
      }

      await obs.disconnect();
      return res.json({ success: true, audioSources, totalInputs: allInputs.length, timestamp: new Date().toISOString() });
    } catch (error) {
      try { await obs.disconnect(); } catch { /* ok */ }
      return res.status(502).json({ success: false, error: error.message || 'OBS audio diagnostic failed' });
    }
  });

  logger.info('Audio diagnostic routes registered');
}
