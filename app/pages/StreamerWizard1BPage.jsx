import {
  Badge,
  Button,
  Card,
  Container,
  Divider,
  Group,
  PasswordInput,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DevTag from '../components/DevTag';
import { usePageTitle } from '../contexts/PageTitleContext';
import { probeObsWizardConnect, probeObsWizardScene, probeObsWizardVideo, probeObsWizardImage, probeObsWizardText, probeObsWizardBrowser, probeObsWizardOrder, probeObsWizardAudio, cleanupObsWizard } from '../core/api/providers/obs';

const WIZARD_STEPS = [
  {
    id: 'connect',
    title: 'Connect Session',
    layer: 'OBS API',
    desc: 'Validate adapter/session reachability and capture connection details.',
  },
  {
    id: 'scene',
    title: 'Prepare Test Scene',
    layer: 'Scene',
    desc: 'Create or select a disposable test scene for capability checks.',
  },
  {
    id: 'video',
    title: 'Video Layer Check',
    layer: 'Media Source',
    desc: 'Verify file-direct playback control (play/pause/next/restart).',
  },
  {
    id: 'image',
    title: 'Image Layer Check',
    layer: 'Image Source',
    desc: 'Verify logo sharpness and transform behavior at output resolution.',
  },
  {
    id: 'text',
    title: 'Text Layer Check',
    layer: 'Text Source',
    desc: 'Verify runtime text updates for title/subtitle/disclaimer use cases.',
  },
  {
    id: 'browser',
    title: 'Browser Layer Check',
    layer: 'Browser Source',
    desc: 'Verify dynamic overlays with visibility and refresh-safe behavior.',
  },
  {
    id: 'order',
    title: 'Ordering and Visibility',
    layer: 'Scene Items',
    desc: 'Verify source ordering, toggles, and group-level visibility control.',
  },
  {
    id: 'audio',
    title: 'Audio Behavior Check',
    layer: 'Audio',
    desc: 'Verify mute routing, monitor behavior, and stream-safe audio output.',
  },
];

const STATUS_COLORS = {
  pending: 'gray',
  running: 'blue',
  pass: 'teal',
  fail: 'red',
  skipped: 'yellow',
};

function nowStamp() {
  return new Date().toLocaleTimeString();
}

export default function StreamerWizard1BPage() {
  const navigate = useNavigate();
  const { setPageTitle } = usePageTitle();
  const [selectedStepId, setSelectedStepId] = useState(WIZARD_STEPS[0].id);
  const [connection, setConnection] = useState({
    host: '127.0.0.1',
    port: '4455',
    password: '',
  });
  const [statuses, setStatuses] = useState(() => Object.fromEntries(WIZARD_STEPS.map((step) => [step.id, 'pending'])));
  const [logs, setLogs] = useState(['Wizard initialized. Choose a step and run a probe or mark a manual result.']);

  useEffect(() => {
    setPageTitle(<><DevTag tag="ST04" />Wizard 1B Capability Tests</>);
    return () => setPageTitle(null);
  }, [setPageTitle]);

  const selectedStep = useMemo(
    () => WIZARD_STEPS.find((step) => step.id === selectedStepId) || WIZARD_STEPS[0],
    [selectedStepId]
  );

  const summary = useMemo(() => {
    const values = Object.values(statuses);
    return {
      pass: values.filter((value) => value === 'pass').length,
      fail: values.filter((value) => value === 'fail').length,
      skipped: values.filter((value) => value === 'skipped').length,
      pending: values.filter((value) => value === 'pending').length,
      running: values.filter((value) => value === 'running').length,
    };
  }, [statuses]);

  const appendLog = (message) => {
    setLogs((prev) => [`${nowStamp()} - ${message}`, ...prev].slice(0, 120));
  };

  const setStepStatus = (stepId, status, reason = '') => {
    setStatuses((prev) => ({ ...prev, [stepId]: status }));
    const label = WIZARD_STEPS.find((step) => step.id === stepId)?.title || stepId;
    appendLog(`${label}: ${status.toUpperCase()}${reason ? ` - ${reason}` : ''}`);
  };

  const getConnectionPayload = () => ({
    host: String(connection.host || '').trim() || '127.0.0.1',
    port: Number.parseInt(String(connection.port || '4455'), 10) || 4455,
    password: connection.password || '',
  });

  const runProbe = async (stepId) => {
    setStepStatus(stepId, 'running', 'Probe started');

    try {
      if (stepId === 'connect') {
        const result = await probeObsWizardConnect(getConnectionPayload());
        setStepStatus(
          stepId,
          'pass',
          `Connected (${result.obsVersion || 'unknown OBS'}, ws ${result.obsWebSocketVersion || 'unknown'})`
        );
        return;
      }

      if (stepId === 'scene') {
        const connectStatus = statuses.connect;
        if (connectStatus !== 'pass') {
          setStepStatus(stepId, 'skipped', 'Skipped because Connect Session is not marked PASS.');
          return;
        }

        const result = await probeObsWizardScene({
          ...getConnectionPayload(),
          sceneName: 'StreamerOps Wizard 1B Test',
        });

        setStepStatus(
          stepId,
          'pass',
          `${result.created ? 'Created' : 'Reused'} scene "${result.sceneName}" and set as current program scene`
        );
        return;
      }

      const connectStatus = statuses.connect;
      if (connectStatus !== 'pass') {
        setStepStatus(stepId, 'skipped', 'Skipped because Connect Session is not marked PASS.');
        return;
      }

      const scenePayload = { ...getConnectionPayload(), sceneName: 'StreamerOps Wizard 1B Test' };

      if (stepId === 'video') {
        const result = await probeObsWizardVideo(scenePayload);
        setStepStatus(stepId, 'pass', result.note || 'Media source probe passed.');
        return;
      }

      if (stepId === 'image') {
        const result = await probeObsWizardImage(scenePayload);
        setStepStatus(stepId, 'pass', result.note || 'Image source probe passed.');
        return;
      }

      if (stepId === 'text') {
        const result = await probeObsWizardText(scenePayload);
        setStepStatus(stepId, result.textMatches ? 'pass' : 'fail', result.note || 'Text source probe completed.');
        return;
      }

      if (stepId === 'browser') {
        const result = await probeObsWizardBrowser(scenePayload);
        setStepStatus(stepId, 'pass', result.note || 'Browser source probe passed.');
        return;
      }

      if (stepId === 'order') {
        const result = await probeObsWizardOrder(scenePayload);
        setStepStatus(stepId, result.reorderOk ? 'pass' : 'fail', result.note || 'Order probe completed.');
        return;
      }

      if (stepId === 'audio') {
        const result = await probeObsWizardAudio(getConnectionPayload());
        setStepStatus(stepId, result.audioInputCount > 0 ? 'pass' : 'fail', result.note || 'Audio probe completed.');
        return;
      }

      setStepStatus(stepId, 'pass', 'Basic probe completed. Confirm quality behavior manually before sign-off.');
    } catch (error) {
      const details = typeof error?.payload?.details === 'string' ? error.payload.details : '';
      const message = details ? `${error?.message || 'Probe failed'} (${details})` : (error?.message || 'Probe failed');
      setStepStatus(stepId, 'fail', message);
    }
  };

  const runAllProbes = async () => {
    for (const step of WIZARD_STEPS) {
      // eslint-disable-next-line no-await-in-loop
      await runProbe(step.id);
    }
  };

  const resetWizard = () => {
    setStatuses(Object.fromEntries(WIZARD_STEPS.map((step) => [step.id, 'pending'])));
    setLogs(['Wizard reset.']);
  };

  const cleanupTestScene = async () => {
    appendLog('Cleanup: RUNNING - Removing probe sources from test scene...');
    try {
      const result = await cleanupObsWizard({ ...getConnectionPayload(), sceneName: 'StreamerOps Wizard 1B Test' });
      appendLog(`Cleanup: DONE - Removed: ${result.removed?.join(', ') || 'none'}`);
    } catch (error) {
      appendLog(`Cleanup: FAIL - ${error?.message || 'Unknown error'}`);
    }
  };

  return (
    <Container size="xl" py="md">
      <Stack gap="md">
        <Card withBorder p="md" style={{ borderColor: 'rgba(86, 204, 242, 0.45)', background: 'rgba(86, 204, 242, 0.06)' }}>
          <Stack gap="xs">
            <Group justify="space-between" align="center">
              <Group gap="xs">
                <Badge color="cyan" variant="light">Wizard 1B</Badge>
                <Badge color="violet" variant="light">Capability Tests</Badge>
              </Group>
              <Group>
                <Button size="xs" variant="light" onClick={() => navigate('/streamer')}>
                  Back To Streamer
                </Button>
                <Button size="xs" variant="light" color="pink" onClick={() => navigate('/overlays')}>
                  Open Overlays Studio
                </Button>
              </Group>
            </Group>
            <Text size="sm" c="dimmed">
              Bare-bones step runner for proving what the OBS/Streamlabs stack can control now. Keep it simple, capture pass/fail evidence,
              and expand later.
            </Text>
          </Stack>
        </Card>

        <Group align="flex-start" grow wrap="nowrap">
          <Card withBorder p="sm" style={{ width: 320, minWidth: 320 }}>
            <Stack gap="xs">
              <Group justify="space-between">
                <Text fw={700}>Steps</Text>
                <Group gap={4}>
                  <Button size="compact-xs" variant="subtle" color="orange" onClick={cleanupTestScene} title="Remove all probe sources from the test scene in OBS">Clean Up OBS</Button>
                  <Button size="compact-xs" variant="subtle" onClick={resetWizard}>Reset</Button>
                </Group>
              </Group>

              <Card withBorder p="xs" style={{ background: 'rgba(255, 255, 255, 0.02)' }}>
                <Stack gap={6}>
                  <Text size="xs" fw={700}>OBS Connection</Text>
                  <TextInput
                    size="xs"
                    label="Host"
                    value={connection.host}
                    onChange={(event) => setConnection((prev) => ({ ...prev, host: event.currentTarget.value }))}
                  />
                  <TextInput
                    size="xs"
                    label="Port"
                    value={connection.port}
                    onChange={(event) => setConnection((prev) => ({ ...prev, port: event.currentTarget.value }))}
                  />
                  <PasswordInput
                    size="xs"
                    label="Password (optional)"
                    value={connection.password}
                    onChange={(event) => setConnection((prev) => ({ ...prev, password: event.currentTarget.value }))}
                  />
                </Stack>
              </Card>

              {WIZARD_STEPS.map((step, index) => {
                const isActive = selectedStepId === step.id;
                const status = statuses[step.id] || 'pending';
                return (
                  <Card
                    key={step.id}
                    withBorder
                    p="xs"
                    style={{ cursor: 'pointer', borderColor: isActive ? 'rgba(0, 192, 255, 0.7)' : undefined }}
                    onClick={() => setSelectedStepId(step.id)}
                  >
                    <Stack gap={4}>
                      <Group justify="space-between" align="center">
                        <Text size="sm" fw={600}>{index + 1}. {step.title}</Text>
                        <Badge size="xs" color={STATUS_COLORS[status] || 'gray'} variant="light">{status}</Badge>
                      </Group>
                      <Text size="xs" c="dimmed">{step.layer}</Text>
                    </Stack>
                  </Card>
                );
              })}
            </Stack>
          </Card>

          <Card withBorder p="md" style={{ flex: 1, minHeight: 520 }}>
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start">
                <Stack gap={2}>
                  <Title order={4}>{selectedStep.title}</Title>
                  <Text size="sm" c="dimmed">Layer: {selectedStep.layer}</Text>
                </Stack>
                <Badge color={STATUS_COLORS[statuses[selectedStep.id] || 'pending']} variant="light">
                  {statuses[selectedStep.id] || 'pending'}
                </Badge>
              </Group>

              <Text size="sm">{selectedStep.desc}</Text>

              <Divider my={2} />

              <Group>
                <Button color="blue" variant="light" onClick={() => runProbe(selectedStep.id)}>
                  Run Probe
                </Button>
                <Button color="teal" variant="light" onClick={() => setStepStatus(selectedStep.id, 'pass', 'Marked pass manually after verification')}>
                  Mark Pass
                </Button>
                <Button color="red" variant="light" onClick={() => setStepStatus(selectedStep.id, 'fail', 'Marked fail manually after verification')}>
                  Mark Fail
                </Button>
                <Button color="yellow" variant="light" onClick={() => setStepStatus(selectedStep.id, 'skipped', 'Marked skipped manually')}>
                  Skip
                </Button>
              </Group>

              <Group>
                <Button variant="default" onClick={runAllProbes}>Run All Probes</Button>
                <Button variant="light" onClick={() => navigate('/overlays/star-citizen-control')}>Open Quick Controls</Button>
                <Button variant="light" onClick={() => window.open('/overlays/window/star-citizen-remote-control', '_blank', 'noopener,noreferrer')}>
                  Open Remote Control Window
                </Button>
              </Group>

              <Card withBorder p="sm" style={{ background: 'rgba(0, 0, 0, 0.15)' }}>
                <Stack gap={4}>
                  <Text size="sm" fw={600}>Quick Notes</Text>
                  <Text size="xs" c="dimmed">Use Mark Pass/Fail after real-world checks in OBS or Streamlabs.</Text>
                  <Text size="xs" c="dimmed">In this scaffold build, API probes are placeholders until OBS adapter wiring is complete.</Text>
                </Stack>
              </Card>
            </Stack>
          </Card>

          <Card withBorder p="sm" style={{ width: 340, minWidth: 340, minHeight: 520 }}>
            <Stack gap="xs" h="100%">
              <Text fw={700}>Session Summary</Text>
              <Group gap="xs">
                <Badge color="teal" variant="light">Pass: {summary.pass}</Badge>
                <Badge color="red" variant="light">Fail: {summary.fail}</Badge>
                <Badge color="yellow" variant="light">Skipped: {summary.skipped}</Badge>
                <Badge color="gray" variant="light">Pending: {summary.pending}</Badge>
              </Group>

              <Divider my={2} />

              <Text fw={700} size="sm">Command Log</Text>
              <ScrollArea h={390} offsetScrollbars>
                <Stack gap={4}>
                  {logs.map((line, index) => (
                    <Text key={`${index}-${line}`} size="xs" c="dimmed">{line}</Text>
                  ))}
                </Stack>
              </ScrollArea>
            </Stack>
          </Card>
        </Group>
      </Stack>
    </Container>
  );
}
