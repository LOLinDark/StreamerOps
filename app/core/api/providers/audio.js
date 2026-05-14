import { apiGet, apiPost } from '../client';

export async function fetchAudioDevices() {
  return apiGet('/api/audio/devices');
}

export async function fetchObsAudioDiagnostic(connection = {}) {
  return apiPost('/api/audio/obs-diagnostic', connection);
}
