import { Badge, Button, Card, Container, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import DevTag from '../components/DevTag';
import { QUICK_PLAYOUT_CONTROL_CHANNEL, getQuickPlayoutTemplate } from '../overlays/quickPlayoutTemplates';

const TEMPLATE_ID = 'star-citizen-core-v1';

function openPlayoutWindow({ useFixedStage = true } = {}) {
  const params = new URLSearchParams({ autostart: '1' });
  if (useFixedStage) {
    params.set('stage', 'fixed16x9');
  }

  window.open(
    `/overlays/window/star-citizen-playout?${params.toString()}`,
    'StarCitizenPlayoutWindow',
    'popup=yes,width=1920,height=1080,left=40,top=40,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
  );
}

function sendControlCommand(command, payload = {}) {
  try {
    const channel = new BroadcastChannel(QUICK_PLAYOUT_CONTROL_CHANNEL);
    channel.postMessage({
      target: TEMPLATE_ID,
      command,
      payload,
      sentAt: new Date().toISOString(),
    });
    channel.close();
    return true;
  } catch {
    return false;
  }
}

export default function OverlaysStarCitizenControlPage() {
  const template = getQuickPlayoutTemplate(TEMPLATE_ID);

  return (
    <Container size="md" py="md">
      <Stack gap="lg">
        <div>
          <Title order={2}><DevTag tag="OV02" />Star Citizen Quick Controls</Title>
          <Text c="dimmed" mt="xs">
            Backup command panel for Star Citizen playout. Use this for quick transport control if you are not using the full remote-control view.
          </Text>
        </div>

        <Card withBorder p="md" style={{ borderColor: 'rgba(76, 201, 240, 0.45)' }}>
          <Stack gap="sm">
            <Group justify="space-between">
              <Text fw={700}>{template.label}</Text>
              <Badge color="teal" variant="light">Control Ready</Badge>
            </Group>
            <Text size="sm" c="dimmed">Open the playout window first, then use these commands.</Text>
            <Group>
              <Button onClick={() => openPlayoutWindow({ useFixedStage: false })}>
                Open Star Citizen Playout Window
              </Button>
              <Button variant="light" color="cyan" onClick={() => openPlayoutWindow({ useFixedStage: true })}>
                Open Fixed 16:9 Playout
              </Button>
              <Button variant="light" onClick={() => window.open('/overlays/window/star-citizen-remote-control', '_blank', 'noopener,noreferrer')}>
                Open Star Citizen Remote Control
              </Button>
            </Group>
          </Stack>
        </Card>

        <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
          <Button onClick={() => sendControlCommand('play')}>Play</Button>
          <Button variant="light" onClick={() => sendControlCommand('pause')}>Pause</Button>
          <Button variant="light" color="gray" onClick={() => sendControlCommand('toggle-play')}>Toggle</Button>
          <Button variant="light" onClick={() => sendControlCommand('prev')}>Previous</Button>
          <Button variant="light" onClick={() => sendControlCommand('next')}>Next</Button>
          <Button variant="light" color="orange" onClick={() => sendControlCommand('restart')}>Restart</Button>
          <Button variant="light" color="red" onClick={() => sendControlCommand('stop')}>Stop</Button>
          <Button variant="light" color="cyan" onClick={() => sendControlCommand('toggle-loop')}>Toggle Loop</Button>
          <Button variant="light" color="teal" onClick={() => sendControlCommand('loop-on')}>Loop On</Button>
        </SimpleGrid>

        <Card withBorder>
          <Stack gap={6}>
            <Text fw={600}>Keyboard fallback (in playout window)</Text>
            <Text size="sm" c="dimmed">Space: play/pause</Text>
            <Text size="sm" c="dimmed">Left/Right arrows: previous/next item</Text>
            <Text size="sm" c="dimmed">L: toggle loop</Text>
            <Text size="sm" c="dimmed">R: restart from first item and play</Text>
            <Text size="sm" c="dimmed">S: stop and reset</Text>
            <Text size="sm" c="dimmed">F: toggle fullscreen</Text>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
