import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActionIcon, Badge, Button, Card, Container, Group, Stack, Table, Text, Tooltip } from '@mantine/core';
import DevTag from '../components/DevTag';
import { IconAlertTriangle, IconFolderCheck, IconPlayerPlay, IconRefresh, IconTrash, IconVideo } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { usePageTitle } from '../contexts/PageTitleContext';
import { restoreStoredDirectoryEntries, supportsStoredDirectoryHandles } from '../streamer/directoryHandles';
import {
  analyzeSequenceHealth,
  getSequenceTypeLabel,
  loadSequenceLibrary,
  requestOpenSavedSequence,
  saveSequenceLibrary,
} from '../streamer/sequenceLibrary';

const VIDEO_PROBE_TIMEOUT_MS = 7000;

function canProbeVideoSource(source) {
  const value = String(source || '').trim();
  if (!value) return false;
  if (/^blob:|^https?:\/\//i.test(value)) return true;
  if (value.startsWith('/')) return true;
  return false;
}

function toProbeUrl(source) {
  const value = String(source || '').trim();
  if (!value) return '';
  if (value.startsWith('/')) {
    return new URL(value, window.location.origin).toString();
  }
  return value;
}

function probeVideoSource(source) {
  const probeTarget = toProbeUrl(source);
  if (!probeTarget) {
    return Promise.resolve({ ok: false, skipped: false, reason: 'Missing source' });
  }

  if (!canProbeVideoSource(probeTarget)) {
    return Promise.resolve({ ok: false, skipped: true, reason: 'Local file path cannot be verified in browser probe' });
  }

  return new Promise((resolve) => {
    const video = document.createElement('video');
    let settled = false;

    const cleanup = () => {
      video.removeAttribute('src');
      video.load();
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      cleanup();
      resolve(result);
    };

    const timer = window.setTimeout(() => {
      finish({ ok: false, skipped: false, reason: 'Timed out loading metadata' });
    }, VIDEO_PROBE_TIMEOUT_MS);

    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => {
      finish({ ok: true, skipped: false, reason: null });
    };
    video.onerror = () => {
      finish({
        ok: false,
        skipped: false,
        reason: `Browser decode/load failed (error code ${video.error?.code || 'unknown'})`,
      });
    };
    video.src = probeTarget;
  });
}

function summarizeVideoProbe(probe) {
  if (!probe) {
    return { label: 'Not run', color: 'gray', summary: 'Video decode check has not been run yet.' };
  }

  if (probe.running) {
    return { label: 'Checking...', color: 'blue', summary: 'Running browser metadata checks for video items.' };
  }

  if (probe.total === 0) {
    return { label: 'No videos', color: 'gray', summary: 'Playlist has no video items to probe.' };
  }

  if (probe.failed > 0) {
    return { label: `Failed ${probe.failed}`, color: 'red', summary: `${probe.ok} ok, ${probe.failed} failed, ${probe.skipped} skipped.` };
  }

  if (probe.ok > 0) {
    return { label: `OK ${probe.ok}`, color: 'teal', summary: `${probe.ok} video item(s) loaded metadata successfully.` };
  }

  return { label: 'Skipped', color: 'yellow', summary: `${probe.skipped} item(s) could not be browser-probed.` };
}

function getRecordIntegrity(entry) {
  const safeEntry = entry && typeof entry === 'object' ? entry : {};
  const issues = [];

  if (!String(safeEntry.id || '').trim()) {
    issues.push('Missing playlist id');
  }
  if (!Array.isArray(safeEntry.sequence)) {
    issues.push('Sequence data is missing or malformed');
  }
  if (!String(safeEntry.name || '').trim()) {
    issues.push('Missing playlist name');
  }

  return {
    ok: issues.length === 0,
    issues,
  };
}

export default function StreamerPlaylistManagerPage() {
  const navigate = useNavigate();
  const { setPageTitle } = usePageTitle();

  useEffect(() => {
    setPageTitle(<><DevTag tag="ST02" />Playlist Manager</>);
    return () => setPageTitle(null);
  }, [setPageTitle]);
  const [savedSequences, setSavedSequences] = useState([]);
  const [restoredImageEntries, setRestoredImageEntries] = useState([]);
  const [restoredVideoEntries, setRestoredVideoEntries] = useState([]);
  const [directoryStatus, setDirectoryStatus] = useState('Checking remembered folders...');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRunningVideoProbe, setIsRunningVideoProbe] = useState(false);
  const [videoProbeById, setVideoProbeById] = useState({});

  const refreshLibrary = useCallback(() => {
    setSavedSequences(loadSequenceLibrary());
  }, []);

  const refreshRememberedFolders = useCallback(async () => {
    if (!supportsStoredDirectoryHandles()) {
      setRestoredImageEntries([]);
      setRestoredVideoEntries([]);
      setDirectoryStatus('Remembered folder verification is not supported in this browser.');
      return;
    }

    setIsRefreshing(true);
    try {
      const [imageEntries, videoEntries] = await Promise.all([
        restoreStoredDirectoryEntries('image', false),
        restoreStoredDirectoryEntries('video', false),
      ]);
      setRestoredImageEntries(imageEntries);
      setRestoredVideoEntries(videoEntries);
      setDirectoryStatus(`Remembered folders ready: ${imageEntries.length} image file(s), ${videoEntries.length} video file(s).`);
    } catch {
      setRestoredImageEntries([]);
      setRestoredVideoEntries([]);
      setDirectoryStatus('Could not read remembered folders. Reconnect them in Sequence Builder if needed.');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refreshLibrary();
    refreshRememberedFolders();
  }, [refreshLibrary, refreshRememberedFolders]);

  const rows = useMemo(() => savedSequences.map((entry, index) => {
    const safeEntry = entry && typeof entry === 'object' ? entry : {};
    const items = Array.isArray(safeEntry.sequence) ? safeEntry.sequence : [];
    const health = analyzeSequenceHealth(items, {
      imageEntries: restoredImageEntries,
      videoEntries: restoredVideoEntries,
    });
    const imageCount = items.filter((item) => item?.type === 'image').length;
    const videoCount = items.filter((item) => item?.type === 'video').length;
    const integrity = getRecordIntegrity(safeEntry);
    const stableId = String(safeEntry.id || '').trim() || `missing-id-${index}`;

    return {
      ...safeEntry,
      stableId,
      items,
      health,
      imageCount,
      videoCount,
      typeLabel: getSequenceTypeLabel(items),
      integrity,
    };
  }), [restoredImageEntries, restoredVideoEntries, savedSequences]);

  const runVideoProbe = useCallback(async () => {
    if (isRunningVideoProbe) return;
    setIsRunningVideoProbe(true);

    try {
      const runningState = {};
      rows.forEach((entry) => {
        runningState[entry.stableId] = {
          running: true,
          total: entry.videoCount,
          ok: 0,
          failed: 0,
          skipped: 0,
          details: [],
        };
      });
      setVideoProbeById(runningState);

      const nextProbeState = {};
      for (const entry of rows) {
        const videoItems = entry.items.filter((item) => item?.type === 'video');
        const details = [];
        let ok = 0;
        let failed = 0;
        let skipped = 0;

        for (const item of videoItems) {
          const result = await probeVideoSource(item?.source || '');
          details.push({
            id: item?.id || '',
            title: item?.title || 'Untitled video',
            source: item?.source || '',
            ...result,
          });

          if (result.skipped) {
            skipped += 1;
          } else if (result.ok) {
            ok += 1;
          } else {
            failed += 1;
          }
        }

        nextProbeState[entry.stableId] = {
          running: false,
          total: videoItems.length,
          ok,
          failed,
          skipped,
          details,
        };
      }

      setVideoProbeById(nextProbeState);
    } finally {
      setIsRunningVideoProbe(false);
    }
  }, [isRunningVideoProbe, rows]);

  function openInBuilder(id) {
    requestOpenSavedSequence(id);
    navigate('/streamer/sequence-builder');
  }

  function deleteSequence(id) {
    const next = savedSequences.filter((entry) => entry.id !== id);
    setSavedSequences(next);
    saveSequenceLibrary(next);
  }

  return (
    <Container size="lg" py="md">
      <Stack gap="lg">
        <Text c="dimmed">
          Review saved sequences, confirm whether their media still resolves, and reopen any playlist in Sequence Builder.
        </Text>

        <Card withBorder p="md" style={{ borderColor: 'rgba(76, 201, 240, 0.35)' }}>
          <Stack gap="sm">
            <Group justify="space-between" wrap="wrap">
              <Group gap="xs" wrap="wrap">
                <Badge variant="light" color="cyan">Saved playlists: {rows.length}</Badge>
                <Badge variant="light" color="gray">{directoryStatus}</Badge>
              </Group>
              <Group gap="xs" wrap="wrap">
                <Button variant="light" leftSection={<IconRefresh size={16} />} onClick={refreshLibrary}>
                  Refresh Library
                </Button>
                <Button
                  variant="light"
                  color="blue"
                  leftSection={<IconFolderCheck size={16} />}
                  onClick={refreshRememberedFolders}
                  loading={isRefreshing}
                >
                  Refresh Health Check
                </Button>
                <Button
                  variant="light"
                  color="violet"
                  leftSection={<IconVideo size={16} />}
                  onClick={runVideoProbe}
                  loading={isRunningVideoProbe}
                >
                  Run Video Check
                </Button>
              </Group>
            </Group>
            <Text size="xs" c="dimmed">
              Health uses remembered image/video folders when available. Direct Windows paths are listed as unverified because the browser cannot prove those files still exist.
            </Text>
            <Text size="xs" c="dimmed">
              Video Check tries loading metadata for each video source and flags items that fail browser decode/network checks.
            </Text>
          </Stack>
        </Card>

        <Card withBorder p="md">
          <Table striped withTableBorder withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Playlist</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Items</Table.Th>
                <Table.Th>Health</Table.Th>
                <Table.Th>Video Check</Table.Th>
                <Table.Th>Updated</Table.Th>
                <Table.Th style={{ width: 140 }}>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.length === 0 && (
                <Table.Tr>
                  <Table.Td colSpan={7}>
                    <Text c="dimmed" size="sm" ta="center" py="md">
                      No saved playlists yet. Build one in Sequence Builder, then it will appear here.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              )}
              {rows.map((entry) => (
                <Table.Tr key={entry.stableId}>
                  <Table.Td>
                    <Stack gap={2}>
                      <Group gap={6} wrap="wrap">
                        <Text size="sm" fw={600}>{entry.name || 'Untitled Sequence'}</Text>
                        {!entry.integrity.ok && (
                          <Tooltip label={entry.integrity.issues.join(' | ')}>
                            <Badge variant="light" color="orange" leftSection={<IconAlertTriangle size={12} />}>
                              Record warning
                            </Badge>
                          </Tooltip>
                        )}
                      </Group>
                      <Text size="xs" c="dimmed">
                        {entry.videoCount} video / {entry.imageCount} image
                      </Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={entry.typeLabel === 'Video only' ? 'green' : entry.typeLabel === 'Mixed' ? 'violet' : 'cyan'}>
                      {entry.typeLabel}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{entry.items.length}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={2}>
                      <Badge variant="light" color={entry.health.color}>{entry.health.label}</Badge>
                      <Text size="xs" c="dimmed">{entry.health.summary}</Text>
                    </Stack>
                  </Table.Td>
                  <Table.Td>
                    {(() => {
                      const probeSummary = summarizeVideoProbe(videoProbeById[entry.stableId]);
                      return (
                        <Stack gap={2}>
                          <Badge variant="light" color={probeSummary.color}>{probeSummary.label}</Badge>
                          <Text size="xs" c="dimmed">{probeSummary.summary}</Text>
                        </Stack>
                      );
                    })()}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" c="dimmed">{new Date(entry.updatedAt || entry.createdAt || Date.now()).toLocaleString()}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap={4} wrap="nowrap">
                      <Tooltip label="Open in Sequence Builder">
                        <ActionIcon variant="light" color="blue" onClick={() => openInBuilder(entry.id)} disabled={!entry.id}>
                          <IconPlayerPlay size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete saved playlist">
                        <ActionIcon variant="light" color="red" onClick={() => deleteSequence(entry.id)} disabled={!entry.id}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      </Stack>
    </Container>
  );
}
