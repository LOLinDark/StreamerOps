import { Container, Title, Card, Text, Stack, Badge, Group, Button, SimpleGrid, ActionIcon, Tooltip } from '@mantine/core';
import DevTag from '../components/DevTag';
import IncompleteFeatureBadge from '../components/IncompleteFeatureBadge';
import { useEffect, useState } from 'react';
import { usePageTitle } from '../contexts/PageTitleContext';
import { useNavigate } from 'react-router-dom';
import { IconArrowUp, IconArrowDown, IconGripVertical } from '@tabler/icons-react';
import { useAppStore } from '../stores';

const DEFAULT_TOOLS = [
  {
    id: 'scene-editor',
    label: 'Scene Editor',
    desc: 'WYSIWYG scene designer — canvas in the center, layers panel on the left, properties inspector on the right. Build and preview stream layouts visually.',
    path: '/streamer/scene-editor',
    status: 'live',
  },
  {
    id: 'wizard-1b',
    label: 'Wizard 1B Capability Tests',
    desc: 'Run step-by-step layer checks (video, image, text, browser, audio) with pass/fail tracking and logs.',
    path: '/streamer/wizard-1b',
    status: 'live',
  },
  {
    id: 'obs-connect',
    label: 'OBS Connect',
    desc: 'Connect to OBS Studio via obs-websocket-js for programmatic scene and source control. Test probes included.',
    path: null,
    status: 'soon',
  },
  {
    id: 'playlist-builder',
    label: 'Playlist Builder',
    desc: 'Build ordered ship-image + video sequences and export plans for VLC/OBS workflows immediately.',
    path: '/streamer/sequence-builder',
    status: 'live',
  },
  {
    id: 'playlist-manager',
    label: 'Playlist Manager',
    desc: 'View saved sequences, check their media health, and reopen them in Sequence Builder.',
    path: '/streamer/playlists',
    status: 'live',
  },
  {
    id: 'scene-manager',
    label: 'Scene Manager',
    desc: 'Manage simple browser-stream scenes with title, trademark notice, corner logos, and sequence references.',
    path: '/overlays/scene-manager',
    status: 'live',
  },
  {
    id: 'browser-playout',
    label: 'Browser Playout',
    desc: 'Play scene collections in a browser window with transport controls and transitions for capture in OBS.',
    path: '/overlays/playout',
    status: 'live',
  },
  {
    id: 'video-library',
    label: 'Followed Videos',
    desc: 'Track official Star Citizen media plus followed YouTube and Twitch channels, then queue videos for streaming.',
    path: '/streamer/video-library',
    status: 'live',
  },
  {
    id: 'background-removal',
    label: 'Ship PNG Cutout',
    desc: 'Upload ship art, remove the background with Clipdrop, and download transparent PNG files.',
    path: '/streamer/background-removal',
    status: 'live',
  },
  {
    id: 'sound-files',
    label: 'Sound Files',
    desc: 'Manage audio files and background music for overlays and stream sequences. View file metadata and details.',
    path: '/streamer/sound-files',
    status: 'live',
  },
  {
    id: 'transition-manager',
    label: 'Transition Manager',
    desc: 'Configure stinger transitions, crossfades, and scene swap logic between videos in a playlist.',
    path: null,
    status: 'soon',
  },
  {
    id: 'stream-monitor',
    label: 'Stream Monitor',
    desc: 'Live stream health, encoding stats, and current playback status in a single view.',
    path: null,
    status: 'soon',
  },
  {
    id: 'schedule',
    label: 'Schedule',
    desc: 'Plan and automate stream sessions with timed playlist playback and auto-start logic.',
    path: null,
    status: 'soon',
  },
];

export default function StreamerPage() {
  const { setPageTitle } = usePageTitle();
  const navigate = useNavigate();
  const devMode = useAppStore((s) => s.devMode);
  const [tools, setTools] = useState(() => {
    // Load saved order from localStorage, or use default
    const saved = localStorage.getItem('streamer-tools-order');
    if (saved) {
      try {
        const savedIds = JSON.parse(saved);
        const savedTools = savedIds.map(id => DEFAULT_TOOLS.find(t => t.id === id)).filter(Boolean);
        // Add any new tools that weren't in saved order
        const savedIds_set = new Set(savedIds);
        const newTools = DEFAULT_TOOLS.filter(t => !savedIds_set.has(t.id));
        return [...savedTools, ...newTools];
      } catch (e) {
        return DEFAULT_TOOLS;
      }
    }
    return DEFAULT_TOOLS;
  });

  useEffect(() => {
    setPageTitle(<><DevTag tag="ST01" />📡 Streamer Control</>);
    return () => setPageTitle(null);
  }, [setPageTitle]);

  const moveCard = (index, direction) => {
    const newTools = [...tools];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex >= 0 && newIndex < newTools.length) {
      [newTools[index], newTools[newIndex]] = [newTools[newIndex], newTools[index]];
      setTools(newTools);
      localStorage.setItem('streamer-tools-order', JSON.stringify(newTools.map(t => t.id)));
    }
  };

  return (
    <Container size="lg" py="md">
      <Stack gap="lg">
        <div>
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

        <Stack gap="md">
          {tools
            .filter((tool) => tool.status === 'live' || devMode)
            .map((tool, index) => (
            <Card key={tool.id} withBorder p="md">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Group gap="xs" align="flex-start" style={{ flex: 1 }}>
                    <Group gap={4}>
                      <Tooltip label="Drag to reorder" position="right">
                        <ActionIcon variant="subtle" color="gray" size="sm" disabled>
                          <IconGripVertical size={14} />
                        </ActionIcon>
                      </Tooltip>
                      <Text fw={700}>{tool.label}</Text>
                    </Group>
                  </Group>
                  <Group gap="xs" align="center">
                    {tool.status === 'live' ? (
                      <Badge color="teal" variant="filled" size="sm">
                        Live
                      </Badge>
                    ) : (
                      <IncompleteFeatureBadge />
                    )}
                    <Group gap={2}>
                      <Tooltip label="Move up" position="bottom">
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="gray"
                          onClick={() => moveCard(index, 'up')}
                          disabled={index === 0}
                        >
                          <IconArrowUp size={14} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Move down" position="bottom">
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="gray"
                          onClick={() => moveCard(index, 'down')}
                          disabled={index === tools.length - 1}
                        >
                          <IconArrowDown size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Group>
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
        </Stack>
      </Stack>
    </Container>
  );
}
