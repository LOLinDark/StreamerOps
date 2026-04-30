import { apiPost } from '../../client';

export async function probeObsWizardConnect(connection = {}) {
  return apiPost('/api/obs/wizard/connect', connection);
}

export async function probeObsWizardScene({ sceneName, ...connection } = {}) {
  return apiPost('/api/obs/wizard/scene', {
    sceneName,
    ...connection,
  });
}
