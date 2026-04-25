import { useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Stack,
  Table,
  Text,
  Title,
  ActionIcon,
  Tooltip,
  FileInput,
  Input,
} from '@mantine/core';
import { IconDownload, IconTrash, IconRefresh, IconUpload } from '@tabler/icons-react';
import DevTag from '../components/DevTag';

const SOUND_LIBRARY_KEY = 'streamerops.soundLibrary.v1';

const DEFAULT_SOUNDS = [
  {
    id: 'the-last-bulkhead-mp3',
    filename: 'The_Last_Bulkhead.mp3',
    path: '/assets/music/The_Last_Bulkhead.mp3',
    type: 'audio/mpeg',
    isDefault: true,
    description: 'Star Citizen original soundtrack - The Last Bulkhead',
  },
  {
    id: 'the-last-bulkhead-mp4',
    filename: 'The_Last_Bulkhead.mp4',
    path: '/assets/music/The_Last_Bulkhead.mp4',
    type: 'video/mp4',
    isDefault: true,
    description: 'Star Citizen original soundtrack - The Last Bulkhead (video format)',
  },
];

function formatFileSize(bytes) {
  if (!bytes) return 'N/A';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function fetchAudioMetadata(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const size = response.headers.get('content-length');
    return {
      size: size ? parseInt(size, 10) : null,
      contentType: response.headers.get('content-type'),
    };
  } catch {
    return { size: null, contentType: null };
  }
}

function loadSoundLibrary() {
  try {
    const raw = localStorage.getItem(SOUND_LIBRARY_KEY);
    if (!raw) return DEFAULT_SOUNDS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_SOUNDS;
    return parsed;
  } catch {
    return DEFAULT_SOUNDS;
  }
}

function saveSoundLibrary(sounds) {
  try {
    localStorage.setItem(SOUND_LIBRARY_KEY, JSON.stringify(sounds));
  } catch {
    // Storage limit exceeded or unavailable
  }
}

export default function StreamerSoundFilesPage() {
  const [sounds, setSounds] = useState(loadSoundLibrary);
  const [metadata, setMetadata] = useState({});
  const [status, setStatus] = useState('Ready');
  const [isLoading, setIsLoading] = useState(false);

  const soundsWithMeta = useMemo(
    () =>
      sounds.map((sound) => ({
        ...sound,
        meta: metadata[sound.id] || {},
      })),
    [sounds, metadata]
  );

  useEffect(() => {
    async function fetchAllMetadata() {
      setIsLoading(true);
      const newMetadata = { ...metadata };

      for (const sound of sounds) {
        if (!newMetadata[sound.id]) {
          const meta = await fetchAudioMetadata(sound.path);
          newMetadata[sound.id] = meta;
        }
      }

      setMetadata(newMetadata);
      setIsLoading(false);
    }

    fetchAllMetadata();
  }, [sounds]);

  function removeSound(id) {
    const sound = sounds.find((s) => s.id === id);
    if (sound?.isDefault) {
      setStatus('Cannot delete default sound files.');
      return;
    }

    setSounds((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveSoundLibrary(next);
      return next;
    });
    setStatus('Sound file removed from library.');
  }

  function resetToDefaults() {
    setSounds(DEFAULT_SOUNDS);
    saveSoundLibrary(DEFAULT_SOUNDS);
    setMetadata({});
    setStatus('Sound library reset to defaults.');
  }

  function downloadSound(sound) {
    const link = document.createElement('a');
    link.href = sound.path;
    link.download = sound.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setStatus(`Downloaded: ${sound.filename}`);
  }

  return (
    <Container size="lg" py="md">
      <Stack gap="lg">
        <div>
          <Title><DevTag tag="ST05" />🎵 Sound Files Management</Title>
          <Text c="dimmed" mt="xs">
            Manage audio files for use in overlays and playout sequences. Add background music, alerts, and streaming audio.
          </Text>
        </div>

        <Card withBorder radius="lg" p="md" bg="rgba(248, 249, 250, 0.02)">
          <Stack gap="md">
            <Group justify="space-between">
              <Group gap="xs">
                <Badge variant="light" color="blue">
                  {sounds.length} file(s)
                </Badge>
                <Badge variant="light" color="gray">
                  Status: {status}
                </Badge>
              </Group>
              <Group gap="xs">
                <Tooltip label="Reload metadata for all files">
                  <Button
                    variant="light"
                    size="xs"
                    onClick={() => {
                      setMetadata({});
                      setStatus('Refreshing metadata...');
                    }}
                    loading={isLoading}
                  >
                    <IconRefresh size={16} />
                  </Button>
                </Tooltip>
                <Tooltip label="Reset to default Star Citizen sounds">
                  <Button variant="light" size="xs" color="orange" onClick={resetToDefaults}>
                    Reset Defaults
                  </Button>
                </Tooltip>
              </Group>
            </Group>

            <div
              style={{
                overflowX: 'auto',
                borderRadius: 8,
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Filename</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Size</Table.Th>
                    <Table.Th>Description</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {soundsWithMeta.length === 0 ? (
                    <Table.Tr>
                      <Table.Td colSpan={6}>
                        <Text ta="center" c="dimmed" py="xl">
                          No sound files available. Click Reset Defaults to load Star Citizen soundtrack.
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ) : (
                    soundsWithMeta.map((sound) => (
                      <Table.Tr key={sound.id}>
                        <Table.Td>
                          <Text size="sm" fw={500}>
                            {sound.filename}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge size="sm" variant="light" color="cyan">
                            {sound.type}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          <Text size="sm">{formatFileSize(sound.meta.size)}</Text>
                        </Table.Td>
                        <Table.Td>
                          <Text size="xs" c="dimmed">
                            {sound.description}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          {sound.isDefault ? (
                            <Badge size="sm" variant="light" color="teal">
                              Default
                            </Badge>
                          ) : (
                            <Badge size="sm" variant="light" color="gray">
                              Custom
                            </Badge>
                          )}
                        </Table.Td>
                        <Table.Td>
                          <Group gap="xs">
                            <Tooltip label="Download file">
                              <ActionIcon
                                size="sm"
                                variant="light"
                                onClick={() => downloadSound(sound)}
                              >
                                <IconDownload size={14} />
                              </ActionIcon>
                            </Tooltip>
                            {!sound.isDefault && (
                              <Tooltip label="Remove from library">
                                <ActionIcon
                                  size="sm"
                                  variant="light"
                                  color="red"
                                  onClick={() => removeSound(sound.id)}
                                >
                                  <IconTrash size={14} />
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    ))
                  )}
                </Table.Tbody>
              </Table>
            </div>

            <Card withBorder p="md" bg="rgba(22, 163, 74, 0.08)" bd="1px solid rgba(22, 163, 74, 0.2)">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Text fw={600} size="sm">
                    ℹ️ About Sound Files
                  </Text>
                </Group>
                <Text size="xs" c="dimmed">
                  Store music and audio files here for use in stream overlays, alerts, and media sequences.
                  Default Star Citizen soundtrack files are included and cannot be deleted.
                </Text>
                <Text size="xs" c="dimmed">
                  Not currently integrated into playout. Coming soon: per-scene audio, background music triggers,
                  and alert sound effects.
                </Text>
              </Stack>
            </Card>
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
