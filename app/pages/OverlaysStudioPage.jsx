import { Badge, Button, Card, Container, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import DevTag from '../components/DevTag';
import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { usePageTitle } from '../contexts/PageTitleContext';

const tools = [
  {
    label: 'Star Citizen Quick Playout',
    desc: 'Open a hardcoded Star Citizen fullscreen playout page with hidden keyboard controls and looping mixed media.',
    path: '/overlays/window/star-citizen-playout',
    status: 'live',
    actionLabel: 'Open Tool',
  },
  {
    label: 'Star Citizen Remote Control',
    desc: 'Mirrors the playout design and adds integrated remote actions plus click-to-toggle layout elements.',
    path: '/overlays/window/star-citizen-remote-control',
    status: 'live',
    actionLabel: 'Open Remote',
  },
  {
    label: 'Star Citizen Quick Controls',
    desc: 'Backup compact command panel for quick play/pause/next/loop control.',
    path: '/overlays/star-citizen-control',
    status: 'live',
    actionLabel: 'Open Quick Controls',
  },
  {
    label: 'Scene Manager',
    desc: 'Create and organize scene collections for browser playout sequencing.',
    path: '/overlays/scene-manager',
    status: 'live',
    actionLabel: 'Open Tool',
  },
  {
    label: 'Browser Playout',
    desc: 'Run scene collection playout with cut/fade transitions and transport controls.',
    path: '/overlays/playout',
    status: 'live',
    actionLabel: 'Open Tool',
  },
  {
    label: 'Overlay Composer',
    desc: 'Future tool for building branded lower-thirds, stat cards, and sponsor overlays.',
    path: null,
    status: 'soon',
  },
];

export default function OverlaysStudioPage() {
  const navigate = useNavigate();
  const { setPageTitle } = usePageTitle();

  useEffect(() => {
    setPageTitle(<><DevTag tag="OV01" />Overlays Studio</>);
    return () => setPageTitle(null);
  }, [setPageTitle]);

  const openPlayoutWindow = ({ useFixedStage = true } = {}) => {
    const params = new URLSearchParams({ autostart: '1' });
    params.set('windowLabel', 'Program Output');
    params.set('windowId', 'main');
    if (useFixedStage) {
      params.set('stage', 'fixed16x9');
      params.set('viewport', '1920x1080');
      params.set('output', 'clean');
      params.set('mediaFit', 'cover');
    }

    const popupFeatures = [
      'popup=yes',
      'width=1920',
      'height=1080',
      'left=40',
      'top=40',
      'menubar=no',
      'toolbar=no',
      'location=no',
      'status=no',
      `resizable=${useFixedStage ? 'no' : 'yes'}`,
    ].join(',');

    window.open(
      `/overlays/window/star-citizen-playout?${params.toString()}`,
      'StarCitizenPlayoutWindow',
      popupFeatures
    );
  };

  const openSourceCaptureWindow = () => {
    const params = new URLSearchParams({
      autostart: '1',
      windowLabel: 'Source Capture',
      windowId: 'source-capture',
      stage: 'fixed16x9',
      viewport: '1920x1080',
      mediaFit: 'contain',
      canvasWidth: '1080',
      canvasHeight: '600',
    });

    const popupFeatures = [
      'popup=yes',
      'width=1920',
      'height=1080',
      'left=60',
      'top=60',
      'menubar=no',
      'toolbar=no',
      'location=no',
      'status=no',
      'resizable=no',
    ].join(',');

    window.open(
      `/overlays/window/star-citizen-source-capture?${params.toString()}`,
      'StarCitizenSourceCaptureWindow',
      popupFeatures
    );
  };

  return (
    <Container size="lg" py="md">
      <Stack gap="lg">
        <Text c="dimmed">
          Build scene compositions, test transitions, and run browser-based playout designed for window capture workflows.
        </Text>

        <Card withBorder p="md" style={{ borderColor: 'rgba(255, 99, 132, 0.35)', background: 'rgba(255, 99, 132, 0.06)' }}>
          <Stack gap="xs">
            <Group gap="xs">
              <Badge color="pink" variant="light">Work Backwards Delivery</Badge>
              <Badge color="teal" variant="light">On-Air First</Badge>
            </Group>
            <Text size="sm">
              Fastest path: open the hardcoded Star Citizen quick playout window and stream it. Then progressively replace hardcoded media/theme with app configuration and reusable presets.
            </Text>
            <Group>
              <Button color="pink" onClick={() => openPlayoutWindow({ useFixedStage: false })}>
                Open Star Citizen Playout Window
              </Button>
              <Button variant="light" color="cyan" onClick={() => openPlayoutWindow({ useFixedStage: true })}>
                Open Fixed 16:9 Playout
              </Button>
              <Button variant="light" color="grape" onClick={() => openSourceCaptureWindow()}>
                Open Source Capture Window
              </Button>
              <Button variant="light" onClick={() => window.open('/overlays/window/star-citizen-remote-control', '_blank', 'noopener,noreferrer')}>
                Open Star Citizen Remote Control
              </Button>
            </Group>
          </Stack>
        </Card>

        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
          {tools.map((tool) => (
            <Card key={tool.label} withBorder p="md">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text fw={700}>{tool.label}</Text>
                  <Badge
                    color={tool.status === 'live' ? 'teal' : 'gray'}
                    variant={tool.status === 'live' ? 'filled' : 'light'}
                    size="sm"
                  >
                    {tool.status === 'live' ? 'Live' : 'Coming Soon'}
                  </Badge>
                </Group>
                <Text size="sm" c="dimmed">{tool.desc}</Text>
                {tool.path && (
                  <Button size="xs" variant="light" color="pink" onClick={() => navigate(tool.path)}>
                    {tool.actionLabel || 'Open Tool'}
                  </Button>
                )}
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>
    </Container>
  );
}
