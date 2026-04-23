import { Badge, Card, Container, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import DevTag from '../components/DevTag';
import { apiGet } from '../core/api/client';
import { SciFiFrame } from '../components/ui';

function getBrowserStatus() {
  if (typeof navigator === 'undefined') {
    return { label: 'Unknown', color: 'gray', detail: 'Navigator unavailable' };
  }

  return navigator.onLine
    ? { label: 'Online', color: 'green', detail: 'Browser reports active connectivity' }
    : { label: 'Offline', color: 'red', detail: 'Browser reports offline mode' };
}

function buildChecks(apiState) {
  const browser = getBrowserStatus();

  return [
    {
      title: 'Frontend App',
      status: 'Ready',
      color: 'cyan',
      detail: 'StreamerOps UI is loaded in the browser and ready for local control work.',
    },
    {
      title: 'Backend API',
      status: apiState.ok ? 'Online' : 'Check Needed',
      color: apiState.ok ? 'green' : 'yellow',
      detail: apiState.ok
        ? `API version endpoint responded${apiState.version ? ` (${apiState.version})` : ''}.`
        : apiState.error || 'Version endpoint has not responded yet.',
    },
    {
      title: 'Browser Network',
      status: browser.label,
      color: browser.color,
      detail: browser.detail,
    },
    {
      title: 'Overlay Routes',
      status: 'Planned',
      color: 'blue',
      detail: 'Overlay-specific routes still need a dedicated first pass for OBS browser-source use.',
    },
    {
      title: 'Media Pipeline',
      status: 'Manual Ready',
      color: 'orange',
      detail: 'Current sprint assumes OBS and VLC are available even if in-app media orchestration is not finished.',
    },
    {
      title: 'Go-Live Confidence',
      status: apiState.ok ? 'Improving' : 'Partial',
      color: apiState.ok ? 'lime' : 'yellow',
      detail: 'Core app shell is live; next steps are OBS/VLC workflow validation and stream checklist execution.',
    },
  ];
}

const readinessChecklist = [
  'Confirm OBS scene collection for playback and transition flow.',
  'Confirm VLC playlist ordering and transition timing.',
  'Verify media folder paths and required PNG transition assets.',
  'Run a short private or unlisted broadcast test before going fully live.',
];

export default function StatusViewPage() {
  const [apiState, setApiState] = useState({ ok: false, version: '', error: '' });

  useEffect(() => {
    let cancelled = false;

    async function checkApi() {
      try {
        const payload = await apiGet('/api/version');
        if (!cancelled) {
          setApiState({
            ok: true,
            version: payload?.version || payload?.frontendVersion || '',
            error: '',
          });
        }
      } catch (error) {
        if (!cancelled) {
          setApiState({ ok: false, version: '', error: error.message || 'API request failed' });
        }
      }
    }

    checkApi();
    return () => {
      cancelled = true;
    };
  }, []);

  const checks = useMemo(() => buildChecks(apiState), [apiState]);

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        <div>
          <Text className="scifi-heading" style={{ margin: 0, fontSize: '2rem' }}>
            <DevTag tag="GT04" /> Status View
          </Text>
          <Text c="dimmed" size="sm" style={{ letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: '0.5rem' }}>
            Stream stack readiness for local OBS, VLC, overlays, and launch workflow
          </Text>
        </div>

        <SciFiFrame variant="corners" cornerLength={16} strokeWidth={1.5} padding={2}>
          <div style={{ padding: '1rem' }}>
            <Group justify="space-between" align="flex-start">
              <div>
                <Text fw={700} size="lg">Operational Summary</Text>
                <Text size="sm" c="dimmed">
                  This page is the first StreamerOps status surface. It is designed to answer one question quickly: can the stream stack be trusted for the next test or live run?
                </Text>
              </div>
              <Badge color={apiState.ok ? 'green' : 'yellow'} variant="light" size="lg">
                {apiState.ok ? 'API ONLINE' : 'API CHECK NEEDED'}
              </Badge>
            </Group>
          </div>
        </SciFiFrame>

        <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="lg">
          {checks.map((check) => (
            <Card key={check.title} withBorder radius="md" padding="lg" bg="rgba(11, 20, 40, 0.82)" style={{ borderColor: 'rgba(0, 217, 255, 0.18)' }}>
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Text fw={700}>{check.title}</Text>
                  <Badge color={check.color} variant="light">{check.status}</Badge>
                </Group>
                <Text size="sm" c="dimmed">{check.detail}</Text>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>

        <SciFiFrame variant="corners" cornerLength={16} strokeWidth={1.5} padding={2}>
          <div style={{ padding: '1rem' }}>
            <Stack gap="md">
              <Text fw={700} size="lg">Manual Test Checklist (OBS/VLC)</Text>
              <Text size="sm" c="dimmed">
                These are not automated reports yet. Validate them directly in OBS (Program/Preview windows) and VLC (playlist order and timing).
              </Text>
              {readinessChecklist.map((item) => (
                <Group key={item} align="flex-start" gap="sm">
                  <Badge color="cyan" variant="light">NEXT</Badge>
                  <Text size="sm" c="dimmed">{item}</Text>
                </Group>
              ))}
            </Stack>
          </div>
        </SciFiFrame>
      </Stack>
    </Container>
  );
}