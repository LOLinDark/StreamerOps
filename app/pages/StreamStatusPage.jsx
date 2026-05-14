import { useEffect, useState, useCallback } from 'react';
import { Badge, Button, Card, Container, Divider, Grid, Group, Loader, ScrollArea, Stack, Text, TextInput, PasswordInput } from '@mantine/core';
import { IconCheck, IconX, IconMinus, IconRefresh, IconVolume, IconMicrophone, IconHeadphones, IconDeviceDesktop } from '@tabler/icons-react';
import DevTag from '../components/DevTag';
import { usePageTitle } from '../contexts/PageTitleContext';
import { fetchAudioDevices, fetchObsAudioDiagnostic } from '../core/api/providers/audio';

const STORAGE_KEY = 'streamerops.audioProfile.v1';

const DEFAULT_PROFILE = {
  name: 'LOLinDark Stream Setup',
  mic: { label: 'HyperX QuadCast', routingApp: 'Nvidia Broadcast', expectedObsSource: 'Mic/Aux' },
  headphones: { label: 'HyperX Cloud II', role: 'monitoring' },
  desktopAudio: { label: 'Desktop Audio', expectedObsSource: 'Desktop Audio' },
  camera: { label: 'Webcam', routingApp: 'Nvidia Broadcast' },
  obs: { host: '127.0.0.1', port: '4455', password: '' },
  checks: [
    { id: 'hw-mic', label: 'Microphone hardware detected', category: 'hardware', auto: true },
    { id: 'hw-headphones', label: 'Headphones/output detected', category: 'hardware', auto: true },
    { id: 'proc-nvidia', label: 'Nvidia Broadcast running', category: 'software', auto: true },
    { id: 'proc-obs', label: 'OBS running', category: 'software', auto: true },
    { id: 'obs-connect', label: 'OBS websocket connected', category: 'obs', auto: true },
    { id: 'obs-mic-source', label: 'Mic source exists in OBS', category: 'obs', auto: true },
    { id: 'obs-mic-unmuted', label: 'Mic source is NOT muted', category: 'obs', auto: true },
    { id: 'obs-mic-tracks', label: 'Mic routed to stream output track', category: 'obs', auto: true },
    { id: 'obs-desktop-source', label: 'Desktop Audio source exists', category: 'obs', auto: true },
    { id: 'obs-desktop-unmuted', label: 'Desktop Audio is NOT muted', category: 'obs', auto: true },
    { id: 'manual-nvidia-mic', label: 'Nvidia Broadcast mic input set to HyperX', category: 'manual' },
    { id: 'manual-test-recording', label: 'Test recording has audible voice', category: 'manual' },
  ],
};

function loadProfile() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : DEFAULT_PROFILE;
  } catch { return DEFAULT_PROFILE; }
}

function saveProfile(profile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

function CheckIcon({ status }) {
  if (status === 'pass') return <IconCheck size={16} color="#22d17b" />;
  if (status === 'fail') return <IconX size={16} color="#ff5c5c" />;
  if (status === 'running') return <Loader size={14} color="cyan" />;
  return <IconMinus size={16} color="#6a8898" />;
}

function SignalNode({ label, status, icon: Icon, detail }) {
  const colors = { pass: '#22d17b', fail: '#ff5c5c', warn: '#ffb648', unknown: '#6a8898' };
  const color = colors[status] || colors.unknown;
  return (
    <Card withBorder p="sm" style={{ borderColor: color, borderWidth: 2, minWidth: 160 }}>
      <Stack gap={4} align="center">
        {Icon && <Icon size={20} color={color} />}
        <Text size="xs" fw={700} ta="center">{label}</Text>
        {detail && <Text size="xs" c="dimmed" ta="center">{detail}</Text>}
        <Badge size="xs" color={status === 'pass' ? 'teal' : status === 'fail' ? 'red' : 'gray'} variant="light">
          {status}
        </Badge>
      </Stack>
    </Card>
  );
}

function SignalArrow() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 0' }}>
      <Text size="lg" c="dimmed">↓</Text>
    </div>
  );
}

export default function StreamStatusPage() {
  const { setPageTitle } = usePageTitle();
  useEffect(() => {
    setPageTitle(<><DevTag tag="GT04" />Stream Status</>);
    return () => setPageTitle(null);
  }, [setPageTitle]);

  const [profile, setProfile] = useState(loadProfile);
  const [checkResults, setCheckResults] = useState({});
  const [devices, setDevices] = useState(null);
  const [obsAudio, setObsAudio] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState(null);
  const [logs, setLogs] = useState([]);

  const appendLog = useCallback((message, level = 'info') => {
    const stamp = new Date().toLocaleTimeString();
    setLogs((prev) => [`${stamp} [${level.toUpperCase()}] ${message}`, ...prev].slice(0, 200));
  }, []);

  const updateObs = (field, value) => {
    setProfile((prev) => {
      const next = { ...prev, obs: { ...prev.obs, [field]: value } };
      saveProfile(next);
      return next;
    });
  };

  const runDiagnostic = useCallback(async () => {
    setLoading(true);
    setLogs([]);
    const results = {};
    appendLog('Diagnostic started');

    try {
      appendLog('Querying Windows audio devices...');
      const deviceData = await fetchAudioDevices();
      setDevices(deviceData);
      appendLog(`Found ${(deviceData.devices || []).length} audio device(s)`);
      (deviceData.devices || []).forEach((d) => appendLog(`  Device: ${d.Name} [${d.Status}]`));

      // Hardware checks
      const deviceNames = (deviceData.devices || []).map((d) => (d.Name || '').toLowerCase());
      results['hw-mic'] = deviceNames.some((n) => n.includes('hyperx') || n.includes('quadcast')) ? 'pass' : 'fail';
      results['hw-headphones'] = deviceNames.some((n) => n.includes('hyperx') || n.includes('headset') || n.includes('headphone') || n.includes('realtek')) ? 'pass' : 'fail';
      appendLog(`Hardware mic: ${results['hw-mic']}${results['hw-mic'] === 'fail' ? ' — no device name matched "hyperx" or "quadcast"' : ''}`);
      appendLog(`Hardware output: ${results['hw-headphones']}${results['hw-headphones'] === 'fail' ? ' — no device name matched "hyperx", "headset", "headphone", or "realtek"' : ''}`);

      // Process checks
      const procs = deviceData.processes || [];
      procs.forEach((p) => appendLog(`  Process: ${p.name} — ${p.running ? `running (PID ${p.pid})` : 'NOT running'}`, p.running ? 'info' : 'warn'));
      results['proc-nvidia'] = procs.find((p) => p.name === 'NVIDIA Broadcast')?.running ? 'pass' : 'fail';
      results['proc-obs'] = procs.find((p) => p.name === 'obs64')?.running ? 'pass' : 'fail';
      if (results['proc-nvidia'] === 'fail') appendLog('Nvidia Broadcast is not running — mic noise removal unavailable', 'warn');
      if (results['proc-obs'] === 'fail') appendLog('OBS is not running — cannot query audio sources', 'warn');
    } catch (err) {
      appendLog(`Device query failed: ${err.message || err}`, 'error');
      results['hw-mic'] = 'fail';
      results['hw-headphones'] = 'fail';
      results['proc-nvidia'] = 'fail';
      results['proc-obs'] = 'fail';
    }

    // OBS checks
    if (results['proc-obs'] === 'pass') {
      try {
        appendLog(`Connecting to OBS at ${profile.obs.host}:${profile.obs.port}...`);
        const obsData = await fetchObsAudioDiagnostic({
          host: profile.obs.host || '127.0.0.1',
          port: Number(profile.obs.port) || 4455,
          password: profile.obs.password || '',
        });
        setObsAudio(obsData);
        results['obs-connect'] = 'pass';
        appendLog(`OBS connected — ${obsData.totalInputs} total inputs, ${(obsData.audioSources || []).length} audio sources`);

        const sources = obsData.audioSources || [];
        sources.forEach((s) => {
          appendLog(`  Audio: "${s.name}" [${s.kind}] vol=${s.volumeDb?.toFixed(1)}dB muted=${s.muted} monitor=${s.monitorType || 'none'} tracks=${JSON.stringify(s.tracks)}`);
        });

        const micSource = sources.find((s) => s.name.toLowerCase().includes('mic') || s.kind?.includes('input'));
        const desktopSource = sources.find((s) => s.name.toLowerCase().includes('desktop'));

        results['obs-mic-source'] = micSource ? 'pass' : 'fail';
        if (!micSource) appendLog('No mic source found — looked for source name containing "mic" or kind containing "input"', 'warn');
        results['obs-mic-unmuted'] = micSource && !micSource.muted ? 'pass' : micSource?.muted ? 'fail' : 'fail';
        if (micSource?.muted) appendLog(`Mic source "${micSource.name}" is MUTED — viewers will not hear your voice`, 'error');
        results['obs-mic-tracks'] = micSource?.tracks ? 'pass' : 'warn';
        if (!micSource?.tracks) appendLog('Could not read mic track routing — check Advanced Audio Properties in OBS', 'warn');
        results['obs-desktop-source'] = desktopSource ? 'pass' : 'fail';
        if (!desktopSource) appendLog('No Desktop Audio source found — looked for source name containing "desktop"', 'warn');
        results['obs-desktop-unmuted'] = desktopSource && !desktopSource.muted ? 'pass' : 'fail';
        if (desktopSource?.muted) appendLog(`Desktop Audio "${desktopSource.name}" is MUTED — viewers will not hear game/video audio`, 'error');
      } catch (err) {
        appendLog(`OBS connection failed: ${err.message || err}`, 'error');
        results['obs-connect'] = 'fail';
        results['obs-mic-source'] = 'unknown';
        results['obs-mic-unmuted'] = 'unknown';
        results['obs-mic-tracks'] = 'unknown';
        results['obs-desktop-source'] = 'unknown';
        results['obs-desktop-unmuted'] = 'unknown';
      }
    } else {
      appendLog('Skipping OBS checks — OBS process not detected', 'warn');
      results['obs-connect'] = 'fail';
    }

    appendLog(`Diagnostic complete — ${Object.values(results).filter((v) => v === 'pass').length} pass, ${Object.values(results).filter((v) => v === 'fail').length} fail`);
    setCheckResults(results);
    setLastRun(new Date().toLocaleTimeString());
    setLoading(false);
  }, [profile.obs, appendLog]);

  const toggleManual = (id) => {
    setCheckResults((prev) => ({
      ...prev,
      [id]: prev[id] === 'pass' ? 'pending' : 'pass',
    }));
  };

  const passCount = Object.values(checkResults).filter((v) => v === 'pass').length;
  const failCount = Object.values(checkResults).filter((v) => v === 'fail').length;
  const totalChecks = profile.checks.length;

  // Derive signal flow statuses
  const micStatus = checkResults['obs-mic-unmuted'] === 'pass' ? 'pass' : checkResults['obs-mic-source'] === 'pass' ? 'warn' : 'unknown';
  const desktopStatus = checkResults['obs-desktop-unmuted'] === 'pass' ? 'pass' : checkResults['obs-desktop-source'] === 'pass' ? 'warn' : 'unknown';
  const routingStatus = checkResults['proc-nvidia'] === 'pass' ? 'pass' : 'unknown';
  const outputStatus = micStatus === 'pass' && desktopStatus === 'pass' ? 'pass' : micStatus === 'fail' || desktopStatus === 'fail' ? 'fail' : 'unknown';

  return (
    <Container size="xl" py="md">
      <Stack gap="md">
        <Text c="dimmed">
          Pre-stream diagnostic. Validates your audio chain from hardware through OBS to stream output.
        </Text>

        {/* OBS Connection */}
        <Card withBorder p="sm">
          <Group gap="sm" align="flex-end" wrap="wrap">
            <TextInput size="xs" label="OBS Host" value={profile.obs.host} onChange={(e) => updateObs('host', e.currentTarget.value)} style={{ width: 140 }} />
            <TextInput size="xs" label="Port" value={profile.obs.port} onChange={(e) => updateObs('port', e.currentTarget.value)} style={{ width: 80 }} />
            <PasswordInput size="xs" label="Password" value={profile.obs.password} onChange={(e) => updateObs('password', e.currentTarget.value)} style={{ width: 160 }} />
            <Button leftSection={<IconRefresh size={16} />} onClick={runDiagnostic} loading={loading} color="cyan">
              Run Diagnostic
            </Button>
            {lastRun && <Text size="xs" c="dimmed">Last run: {lastRun}</Text>}
            <Group gap="xs">
              <Badge color="teal" variant="light">Pass: {passCount}</Badge>
              <Badge color="red" variant="light">Fail: {failCount}</Badge>
              <Badge color="gray" variant="light">Total: {totalChecks}</Badge>
            </Group>
          </Group>
        </Card>

        <Grid gutter="md">
          {/* LEFT: Checklist */}
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Stack gap="md">
              <Card withBorder p="md">
                <Stack gap="xs">
                  <Text fw={700} size="sm">Pre-Stream Checklist</Text>
                  <Divider label="Hardware" labelPosition="left" />
                  {profile.checks.filter((c) => c.category === 'hardware').map((check) => (
                    <Group key={check.id} gap="xs" wrap="nowrap">
                      <CheckIcon status={checkResults[check.id] || 'pending'} />
                      <Text size="sm">{check.label}</Text>
                    </Group>
                  ))}

                  <Divider label="Software" labelPosition="left" />
                  {profile.checks.filter((c) => c.category === 'software').map((check) => (
                    <Group key={check.id} gap="xs" wrap="nowrap">
                      <CheckIcon status={checkResults[check.id] || 'pending'} />
                      <Text size="sm">{check.label}</Text>
                    </Group>
                  ))}

                  <Divider label="OBS Audio Sources" labelPosition="left" />
                  {profile.checks.filter((c) => c.category === 'obs').map((check) => (
                    <Group key={check.id} gap="xs" wrap="nowrap">
                      <CheckIcon status={checkResults[check.id] || 'pending'} />
                      <Text size="sm">{check.label}</Text>
                    </Group>
                  ))}

                  <Divider label="Manual Verification" labelPosition="left" />
                  {profile.checks.filter((c) => c.category === 'manual').map((check) => (
                    <Group key={check.id} gap="xs" wrap="nowrap" style={{ cursor: 'pointer' }} onClick={() => toggleManual(check.id)}>
                      <CheckIcon status={checkResults[check.id] || 'pending'} />
                      <Text size="sm">{check.label}</Text>
                    </Group>
                  ))}
                </Stack>
              </Card>

              {/* Diagnostic Log */}
              <Card withBorder p="sm" style={{ background: 'rgba(0,0,0,0.2)' }}>
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Text fw={700} size="sm">Diagnostic Log</Text>
                    <Button size="compact-xs" variant="subtle" onClick={() => setLogs([])}>Clear</Button>
                  </Group>
                  <ScrollArea h={220} offsetScrollbars>
                    <Stack gap={2}>
                      {logs.length === 0 && <Text size="xs" c="dimmed">Run diagnostic to see output here.</Text>}
                      {logs.map((line, i) => (
                        <Text
                          key={`${i}-${line}`}
                          size="xs"
                          style={{ fontFamily: 'monospace', lineHeight: 1.4 }}
                          c={line.includes('[ERROR]') ? 'red' : line.includes('[WARN]') ? 'orange' : 'dimmed'}
                        >
                          {line}
                        </Text>
                      ))}
                    </Stack>
                  </ScrollArea>
                </Stack>
              </Card>
            </Stack>
          </Grid.Col>

          {/* RIGHT: Signal Flow */}
          <Grid.Col span={{ base: 12, md: 7 }}>
            <Card withBorder p="md" style={{ minHeight: 500 }}>
              <Stack gap="xs">
                <Text fw={700} size="sm">Signal Flow — Who Hears What</Text>
                <Text size="xs" c="dimmed">Shows the path from your devices to the stream output and your headphones.</Text>

                <Grid gutter="md" mt="md">
                  {/* Mic chain */}
                  <Grid.Col span={6}>
                    <Stack gap={0} align="center">
                      <Text size="xs" fw={700} c="cyan" mb="xs">🎤 VOICE → STREAM</Text>
                      <SignalNode label={profile.mic.label} status={checkResults['hw-mic'] || 'unknown'} icon={IconMicrophone} detail="Physical mic" />
                      <SignalArrow />
                      <SignalNode label="Nvidia Broadcast" status={routingStatus} icon={IconDeviceDesktop} detail="Noise removal" />
                      <SignalArrow />
                      <SignalNode label="OBS Mic/Aux" status={micStatus} icon={IconVolume} detail={obsAudio?.audioSources?.find((s) => s.name.toLowerCase().includes('mic'))?.muted ? '⚠️ MUTED' : 'Active'} />
                      <SignalArrow />
                      <SignalNode label="Stream Output" status={outputStatus} icon={IconVolume} detail="Track 1 → Twitch/YouTube" />
                    </Stack>
                  </Grid.Col>

                  {/* Desktop/Game audio chain */}
                  <Grid.Col span={6}>
                    <Stack gap={0} align="center">
                      <Text size="xs" fw={700} c="orange" mb="xs">🎮 GAME → STREAM + YOU</Text>
                      <SignalNode label="Game / Video Audio" status={checkResults['hw-headphones'] || 'unknown'} icon={IconDeviceDesktop} detail="Windows default output" />
                      <SignalArrow />
                      <SignalNode label="OBS Desktop Audio" status={desktopStatus} icon={IconVolume} detail={obsAudio?.audioSources?.find((s) => s.name.toLowerCase().includes('desktop'))?.muted ? '⚠️ MUTED' : 'Active'} />
                      <SignalArrow />
                      <Group gap="md">
                        <SignalNode label="Stream Output" status={outputStatus} icon={IconVolume} detail="Viewers hear this" />
                        <SignalNode label={profile.headphones.label} status={checkResults['hw-headphones'] || 'unknown'} icon={IconHeadphones} detail="You hear this" />
                      </Group>
                    </Stack>
                  </Grid.Col>
                </Grid>

                {/* OBS source details */}
                {obsAudio?.audioSources?.length > 0 && (
                  <>
                    <Divider my="sm" label="OBS Audio Sources (Live)" labelPosition="left" />
                    <Stack gap={4}>
                      {obsAudio.audioSources.map((source) => (
                        <Group key={source.name} justify="space-between" wrap="nowrap">
                          <Text size="xs" fw={600}>{source.name}</Text>
                          <Group gap="xs">
                            <Badge size="xs" color={source.muted ? 'red' : 'teal'} variant="light">
                              {source.muted ? 'MUTED' : 'LIVE'}
                            </Badge>
                            <Text size="xs" c="dimmed">{source.volumeDb?.toFixed(1) || '?'} dB</Text>
                            {source.monitorType && (
                              <Badge size="xs" variant="outline" color="gray">{source.monitorType}</Badge>
                            )}
                          </Group>
                        </Group>
                      ))}
                    </Stack>
                  </>
                )}

                {/* Windows devices */}
                {devices?.devices?.length > 0 && (
                  <>
                    <Divider my="sm" label="Windows Audio Devices" labelPosition="left" />
                    <Stack gap={4}>
                      {devices.devices.map((dev, i) => (
                        <Group key={`${dev.Name}-${i}`} gap="xs">
                          <Badge size="xs" color={dev.Status === 'OK' ? 'teal' : 'orange'} variant="light">{dev.Status || '?'}</Badge>
                          <Text size="xs">{dev.Name}</Text>
                        </Group>
                      ))}
                    </Stack>
                  </>
                )}
              </Stack>
            </Card>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}
