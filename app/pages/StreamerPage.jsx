import { Container, Title, Card, Text, Stack, Badge, Group, Button, SimpleGrid } from '@mantine/core';
import { useNavigate } from 'react-router-dom';

const tools = [
  {
    label: 'Video Library',
    desc: 'Download and queue Star Citizen videos from YouTube playlists. Build your local video catalogue for streaming.',
    path: '/streamer/video-library',
    status: 'live',
  },
  {
    label: 'Playlist Builder',
    desc: 'Build ordered ship-image + video sequences and export plans for VLC/OBS workflows immediately.',
    path: '/streamer/sequence-builder',
    status: 'live',
  },
  {
    label: 'Ship PNG Cutout',
    desc: 'Upload ship art, remove the background with Clipdrop, and download transparent PNG files.',
    path: '/streamer/background-removal',
    status: 'live',
  },
  {
    label: 'OBS Connect',
    desc: 'Connect OmniCore to OBS Studio via obs-websocket-js for programmatic scene and source control.',
    path: null,
    status: 'soon',
  },
  {
    label: 'Transition Manager',
    desc: 'Configure stinger transitions, crossfades, and scene swap logic between videos in a playlist.',
    path: null,
    status: 'soon',
  },
  {
    label: 'Stream Monitor',
    desc: 'Live stream health, encoding stats, and current playback status in a single view.',
    path: null,
    status: 'soon',
  },
  {
    label: 'Schedule',
    desc: 'Plan and automate stream sessions with timed playlist playback and auto-start logic.',
    path: null,
    status: 'soon',
  },
];

export default function StreamerPage() {
  const navigate = useNavigate();

  return (
    <Container size="lg" py="md">
      <Stack gap="lg">
        <div>
          <Title>📡 Streamer Control</Title>
          <Text c="dimmed" mt="xs">
            Tools for managing video playlists, OBS integration, and automated Star Citizen stream broadcasts.
          </Text>
        </div>

        <Card withBorder p="md" style={{ borderColor: 'rgba(176, 0, 255, 0.35)', background: 'rgba(108, 0, 255, 0.05)' }}>
          <Group gap="xs" mb="xs">
            <Badge color="violet" variant="light">Roadmap Vision</Badge>
          </Group>
          <Text size="sm">
            Build a local video library → arrange into a playlist → trigger OBS via WebSocket → play videos with stinger
            transitions between clips → broadcast a polished Star Citizen TV stream without manual intervention.
          </Text>
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
                  <Button
                    size="xs"
                    variant="light"
                    color="violet"
                    onClick={() => navigate(tool.path)}
                  >
                    Open Tool
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
