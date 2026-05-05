import { apiPost } from '../../client';

export async function probeObsWizardConnect(connection = {}) {
  return apiPost('/api/obs/wizard/connect', connection);
}

export async function probeObsWizardScene({ sceneName, ...connection } = {}) {
  return apiPost('/api/obs/wizard/scene', { sceneName, ...connection });
}

export async function probeObsWizardVideo({ sceneName, ...connection } = {}) {
  return apiPost('/api/obs/wizard/video', { sceneName, ...connection });
}

export async function probeObsWizardImage({ sceneName, ...connection } = {}) {
  return apiPost('/api/obs/wizard/image', { sceneName, ...connection });
}

export async function probeObsWizardText({ sceneName, ...connection } = {}) {
  return apiPost('/api/obs/wizard/text', { sceneName, ...connection });
}

export async function probeObsWizardBrowser({ sceneName, ...connection } = {}) {
  return apiPost('/api/obs/wizard/browser', { sceneName, ...connection });
}

export async function probeObsWizardOrder({ sceneName, ...connection } = {}) {
  return apiPost('/api/obs/wizard/order', { sceneName, ...connection });
}

export async function probeObsWizardAudio(connection = {}) {
  return apiPost('/api/obs/wizard/audio', connection);
}

export async function cleanupObsWizard({ sceneName, ...connection } = {}) {
  return apiPost('/api/obs/wizard/cleanup', { sceneName, ...connection });
}

export async function setupObsWizardLogos({ sceneName, ...connection } = {}) {
  return apiPost('/api/obs/wizard/logos', { sceneName, ...connection });
}

export async function applySceneToObs({ sceneName, layers, sceneProfile, ...connection } = {}) {
  return apiPost('/api/obs/scene-editor/apply', { sceneName, layers, sceneProfile, ...connection });
}
