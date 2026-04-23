import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Checkbox,
  Collapse,
  Container,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconExternalLink,
  IconSearch,
  IconX,
  IconDownload,
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
  IconChevronDown,
  IconChevronUp,
  IconTrash,
} from '@tabler/icons-react';
import DevTag from '../components/DevTag';
import MediaPlayer from '../components/MediaPlayer';
import { fetchAerobookFeed, getCachedAerobookFeed, fetchYoutubePlaylist } from '../core/api/providers/media';
import {
  fetchDownloadStatus,
  fetchDownloadEnv,
  enqueueForDownload,
  startDownloadWorker,
  stopDownloadWorker,
  retryDownload,
  removeDownloadItem,
} from '../core/api/providers/media';
import { formatRelativeTime } from '../utils/time';
import { useAppStore } from '../stores';

const STORAGE_KEY = 'omnicore.dev.video-catalog.tracked';

// ── Known playlists ──────────────────────────────────────────────────────
const PLAYLISTS = [
  { value: 'feed', label: 'Aerobook Feed (Recent)' },
  { value: 'PLVct2QDhDrB2UV4UkGVdo1uct5I2AUqLE', label: 'Behind The Ships' },
  { value: 'PLVct2QDhDrB2-Edu0jm18lz0W9NRcXy3Y', label: 'Squadron 42 Playlist' },
];

function loadTracked() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveTracked(tracked) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tracked));
  } catch {
    // Ignore storage errors.
  }
}

const TAG_OPTIONS = [
  { value: 'ship-commercial', label: 'Ship Commercial' },
  { value: 'isc', label: 'Inside Star Citizen' },
  { value: 'lore', label: 'Lore' },
  { value: 'trailer', label: 'Trailer' },
  { value: 'dev-update', label: 'Dev Update' },
  { value: 'gameplay', label: 'Gameplay' },
  { value: 'other', label: 'Other' },
];

const TAG_COLORS = {
  'ship-commercial': 'cyan',
  isc: 'green',
  lore: 'violet',
  trailer: 'red',
  'dev-update': 'orange',
  gameplay: 'teal',
  other: 'gray',
};

const FILTER_OPTIONS = [
  { value: 'all', label: 'All Videos' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'unreviewed', label: 'Not Reviewed' },
  ...TAG_OPTIONS.map((t) => ({ value: `tag:${t.value}`, label: `Tag: ${t.label}` })),
];

export default function DeveloperVideoCatalogPage() {
  const [feed, setFeed] = useState(null);
  const [playlistVideos, setPlaylistVideos] = useState([]);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tracked, setTracked] = useState(loadTracked);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [activePlaylist, setActivePlaylist] = useState('feed');

  // Download queue state
  const [queueStatus, setQueueStatus] = useState(null);
  const [queueEnv, setQueueEnv] = useState(null);
  const [queueOpen, setQueueOpen] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const prevItemStatuses = useRef({});
  const connectionBackoffUntil = useRef(0);
  const logActivity = useAppStore((s) => s.logActivity);

  // Load aerobook feed (used when activePlaylist === 'feed')
  useEffect(() => {
    const cached = getCachedAerobookFeed();
    if (cached) {
      setFeed(cached);
      setLoading(false);
    }

    fetchAerobookFeed({ limit: 50 })
      .then((payload) => {
        setFeed(payload);
        setLoading(false);
      })
      .catch((err) => {
        if (!cached) setError(err.message || 'Failed to load feed');
        setLoading(false);
      });
  }, []);

  // Load playlist when activePlaylist changes away from 'feed'
  useEffect(() => {
    if (activePlaylist === 'feed') {
      setPlaylistVideos([]);
      return;
    }
    setPlaylistLoading(true);
    setError('');
    fetchYoutubePlaylist({ playlistId: activePlaylist, limit: 200 })
      .then((videos) => {
        setPlaylistVideos(videos);
        setPlaylistLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load playlist');
        setPlaylistLoading(false);
      });
  }, [activePlaylist]);

  const allVideos = useMemo(() => {
    if (activePlaylist !== 'feed') {
      // Map raw youtube provider format to aerobook post shape for compatibility
      return playlistVideos.map((v) => ({
        id: `youtube-${v.externalId}`,
        source: 'youtube',
        sourceLabel: v.sourceLabel || 'youtube-playlist',
        title: v.title,
        publishedAt: v.publishedAt,
        thumbnailUrl: v.thumbnailUrl,
        url: v.url,
        youtubeId: v.externalId,
        viewCount: 0,
      }));
    }
    if (!feed?.categories) return [];
    const sc = feed.categories['star-citizen'] || [];
    const sq = feed.categories['squadron-42'] || [];
    return [...sc, ...sq].sort(
      (a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)
    );
  }, [feed, playlistVideos, activePlaylist]);

  const filteredVideos = useMemo(() => {
    let result = allVideos;

    if (sourceFilter === 'youtube') result = result.filter((v) => v.source === 'youtube');
    else if (sourceFilter === 'twitch') result = result.filter((v) => v.source === 'twitch');

    if (search.trim()) {
      const term = search.toLowerCase();
      result = result.filter((v) => v.title?.toLowerCase().includes(term));
    }

    if (filter === 'reviewed') result = result.filter((v) => tracked[v.id]?.reviewed);
    else if (filter === 'unreviewed') result = result.filter((v) => !tracked[v.id]?.reviewed);
    else if (filter.startsWith('tag:')) {
      const tag = filter.slice(4);
      result = result.filter((v) => tracked[v.id]?.tag === tag);
    }

    return result;
  }, [allVideos, search, filter, sourceFilter, tracked]);

  function toggleReviewed(videoId) {
    setTracked((prev) => {
      const next = { ...prev, [videoId]: { ...prev[videoId], reviewed: !prev[videoId]?.reviewed } };
      saveTracked(next);
      return next;
    });
  }

  function setTag(videoId, tag) {
    setTracked((prev) => {
      const next = { ...prev, [videoId]: { ...prev[videoId], tag } };
      saveTracked(next);
      return next;
    });
  }

  const reviewedCount = allVideos.filter((v) => tracked[v.id]?.reviewed).length;

  // ── Download queue helpers ──────────────────────────────────────────────

  const refreshQueueStatus = useCallback(() => {
    // Back off if a recent connection-refused error is still within the quiet window
    const now = Date.now();
    if (now < connectionBackoffUntil.current) return;

    setQueueLoading(true);
    Promise.all([fetchDownloadStatus(), fetchDownloadEnv()])
      .then(([status, env]) => {
        connectionBackoffUntil.current = 0;
        // Diff item statuses to emit Activity Monitor events
        const prev = prevItemStatuses.current;
        for (const item of status.items || []) {
          const oldStatus = prev[item.videoId];
          if (oldStatus !== item.status) {
            const label = item.title ? `"${item.title.slice(0, 60)}"` : item.videoId;
            if (item.status === 'downloading') {
              logActivity('⬇️ YT-DLP', `Started: ${label}`);
            } else if (item.status === 'done') {
              logActivity('✅ YT-DLP', `Finished: ${label}`);
            } else if (item.status === 'failed') {
              logActivity('❌ YT-DLP', `Failed: ${label}${item.error ? ` — ${item.error.slice(0, 80)}` : ''}`);
            }
          }
          prev[item.videoId] = item.status;
        }
        setQueueStatus(status);
        setQueueEnv(env);
        setQueueLoading(false);
      })
      .catch((err) => {
        // ERR_CONNECTION_REFUSED surfaces as a TypeError or a network-level error
        const isConnectionRefused =
          err instanceof TypeError || (err?.status == null && err?.message?.toLowerCase().includes('fetch'));
        if (isConnectionRefused) {
          const backoffMs = (15 + Math.random() * 15) * 1000; // 15–30 s
          connectionBackoffUntil.current = Date.now() + backoffMs;
        }
        setQueueLoading(false);
      });
  }, [logActivity]);

  // Auto-poll every 5s only while the panel is open AND worker is confirmed running.
  // No fetch happens on mount or on panel open — only via explicit user action (refresh / toggle).
  useEffect(() => {
    if (!queueOpen || !queueStatus?.workerRunning) return;
    const id = setInterval(refreshQueueStatus, 5000);
    return () => clearInterval(id);
  }, [queueOpen, queueStatus?.workerRunning, refreshQueueStatus]);

  async function handleEnqueueAll() {
    const playlistLabel = PLAYLISTS.find((p) => p.value === activePlaylist)?.label || '';
    const videos = filteredVideos
      .filter((v) => v.youtubeId)
      .map((v) => ({
        videoId: v.youtubeId,
        title: v.title,
        url: v.url,
        playlistId: activePlaylist !== 'feed' ? activePlaylist : '',
        playlistLabel,
      }));
    if (!videos.length) return;
    await enqueueForDownload(videos);
    refreshQueueStatus();
  }

  async function handleEnqueueOne(video) {
    if (!video.youtubeId) return;
    const playlistLabel = PLAYLISTS.find((p) => p.value === activePlaylist)?.label || '';
    await enqueueForDownload([{
      videoId: video.youtubeId,
      title: video.title,
      url: video.url,
      playlistId: activePlaylist !== 'feed' ? activePlaylist : '',
      playlistLabel,
    }]);
    refreshQueueStatus();
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <div>
          <Text size="xl" fw={700} style={{ color: '#00d9ff', letterSpacing: '0.08em' }}>
            <DevTag tag="DEV08" />🎬 Video Catalog
          </Text>
          <Text size="sm" c="dimmed">
            RSI YouTube &amp; Twitch video index. Tag, track, and queue videos for stream sessions.
          </Text>
        </div>

        {/* Stats */}
        <Group gap="sm">
          <Badge color="cyan" variant="light">{allVideos.length} total</Badge>
          <Badge color="green" variant="light">{reviewedCount} reviewed</Badge>
          <Badge color="orange" variant="light">{allVideos.length - reviewedCount} remaining</Badge>
        </Group>

        {/* Playlist selector */}
        <Group gap="sm" wrap="wrap" align="center">
          <Text size="sm" fw={600} c="dimmed">Playlist:</Text>
          <Select
            data={PLAYLISTS}
            value={activePlaylist}
            onChange={(v) => {
              setActivePlaylist(v || 'feed');
              setSearch('');
              setFilter('all');
            }}
            w={240}
          />
        </Group>

        {/* ── Download Queue Panel ── */}
        <Card withBorder style={{ borderColor: 'rgba(0,217,255,0.2)' }}>
          <Group justify="space-between" mb={queueOpen ? 'sm' : 0}>
            <Group gap="sm">
              <IconDownload size={16} color="#00d9ff" />
              <Text fw={600} size="sm" style={{ color: '#00d9ff' }}>Download Queue</Text>
              {queueStatus && (
                <Group gap="xs">
                  <Badge size="xs" color="yellow" variant="light">{queueStatus.stats.queued} queued</Badge>
                  <Badge size="xs" color="green" variant="light">{queueStatus.stats.done} done</Badge>
                  {queueStatus.stats.failed > 0 && (
                    <Badge size="xs" color="red" variant="light">{queueStatus.stats.failed} failed</Badge>
                  )}
                  {queueStatus.workerRunning && (
                    <Badge size="xs" color="cyan" variant="filled">● Running</Badge>
                  )}
                </Group>
              )}
            </Group>
            <Group gap="xs">
              <Tooltip label="Refresh queue status">
                <ActionIcon size="sm" variant="subtle" color="cyan" onClick={refreshQueueStatus} loading={queueLoading}>
                  <IconRefresh size={14} />
                </ActionIcon>
              </Tooltip>
              <ActionIcon size="sm" variant="subtle" color="cyan" onClick={() => { setQueueOpen((o) => !o); if (!queueOpen) refreshQueueStatus(); }}>
                {queueOpen ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
              </ActionIcon>
            </Group>
          </Group>

          <Collapse in={queueOpen}>
            <Stack gap="sm">
              {/* Environment check */}
              {queueEnv && (
                <Group gap="sm" wrap="wrap">
                  <Badge size="xs" color={queueEnv.ytdlp.available ? 'green' : 'red'} variant="light">
                    yt-dlp {queueEnv.ytdlp.available ? `✓ ${queueEnv.ytdlp.version}` : '✗ not found'}
                  </Badge>
                  <Badge size="xs" color={queueEnv.ffmpeg.available ? 'green' : 'red'} variant="light">
                    ffmpeg {queueEnv.ffmpeg.available ? '✓' : '✗ not found'}
                  </Badge>
                  {queueEnv.downloadDir && (
                    <Badge size="xs" color="cyan" variant="light">
                      📁 {queueEnv.downloadDir}
                    </Badge>
                  )}
                  {!queueEnv.downloadDirSet && (
                    <Badge size="xs" color="orange" variant="light">YT_DOWNLOAD_DIR not set in .env</Badge>
                  )}
                </Group>
              )}

              {/* Worker controls */}
              <Group gap="sm" wrap="wrap" align="flex-start">
                {!queueStatus?.workerRunning ? (
                  <Tooltip
                    label={
                      !queueEnv ? 'Click Refresh to check environment first' :
                      !queueEnv.ytdlp.available ? 'yt-dlp is not installed — run: pip install yt-dlp' :
                      !queueEnv.downloadDirSet ? 'Set YT_DOWNLOAD_DIR in server/.env first' :
                      'Start downloading queued videos'
                    }
                    position="bottom"
                  >
                    <Button
                      size="xs"
                      leftSection={<IconPlayerPlay size={12} />}
                      color="green"
                      onClick={async () => { await startDownloadWorker(); refreshQueueStatus(); }}
                      disabled={queueEnv != null && (!queueEnv.ytdlp.available || !queueEnv.downloadDirSet)}
                    >
                      Start Worker
                    </Button>
                  </Tooltip>
                ) : (
                  <Button
                    size="xs"
                    leftSection={<IconPlayerStop size={12} />}
                    color="orange"
                    onClick={async () => { await stopDownloadWorker(); refreshQueueStatus(); }}
                  >
                    {queueStatus?.workerStopping ? 'Stopping…' : 'Stop Worker'}
                  </Button>
                )}
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconDownload size={12} />}
                  onClick={handleEnqueueAll}
                  disabled={filteredVideos.filter((v) => v.youtubeId).length === 0}
                >
                  Queue {filteredVideos.filter((v) => v.youtubeId).length} visible videos
                </Button>
              </Group>

              {/* Current download */}
              {queueStatus?.currentVideoId && (
                <Group gap="sm">
                  <Loader size={12} color="cyan" />
                  <Text size="xs" c="cyan">Downloading: {queueStatus.currentVideoId}</Text>
                </Group>
              )}

              {/* Queue list */}
              {queueStatus?.items?.length > 0 && (
                <ScrollArea h={220}>
                  <Stack gap={4}>
                    {queueStatus.items.map((item) => (
                      <Group key={item.videoId} justify="space-between" wrap="nowrap" gap="xs" style={{ padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                          <Text size="xs" lineClamp={1} style={{ color: '#e0eaf4' }}>{item.title || item.videoId}</Text>
                          <Group gap="xs">
                            <Badge
                              size="xs"
                              color={
                                item.status === 'done' ? 'green' :
                                item.status === 'downloading' ? 'cyan' :
                                item.status === 'failed' ? 'red' :
                                item.status === 'queued' ? 'yellow' : 'gray'
                              }
                              variant="light"
                            >
                              {item.status}
                            </Badge>
                            {item.playlistLabel && (
                              <Text size="xs" c="dimmed">{item.playlistLabel}</Text>
                            )}
                            {item.error && (
                              <Text size="xs" c="red" lineClamp={1}>{item.error}</Text>
                            )}
                          </Group>
                        </Stack>
                        <Group gap={4} wrap="nowrap">
                          {item.status === 'failed' && (
                            <Tooltip label="Retry">
                              <ActionIcon size="xs" variant="subtle" color="orange" onClick={async () => { await retryDownload(item.videoId); refreshQueueStatus(); }}>
                                <IconRefresh size={10} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                          {item.status !== 'downloading' && (
                            <Tooltip label="Remove from queue">
                              <ActionIcon size="xs" variant="subtle" color="red" onClick={async () => { await removeDownloadItem(item.videoId); refreshQueueStatus(); }}>
                                <IconTrash size={10} />
                              </ActionIcon>
                            </Tooltip>
                          )}
                        </Group>
                      </Group>
                    ))}
                  </Stack>
                </ScrollArea>
              )}
              {queueStatus?.items?.length === 0 && (
                <Text size="xs" c="dimmed">Queue is empty.</Text>
              )}
            </Stack>
          </Collapse>
        </Card>

        {/* Filters */}
        <Group gap="sm" wrap="wrap">
          <TextInput
            placeholder="Search videos…"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            leftSection={<IconSearch size={14} />}
            rightSection={search ? (
              <ActionIcon size="sm" variant="transparent" onClick={() => setSearch('')}>
                <IconX size={12} />
              </ActionIcon>
            ) : null}
            style={{ flex: 1, minWidth: 200 }}
          />
          <Select data={FILTER_OPTIONS} value={filter} onChange={(v) => setFilter(v || 'all')} w={200} />
          {activePlaylist === 'feed' && (
            <Select
              data={[
                { value: 'all', label: 'All Sources' },
                { value: 'youtube', label: 'YouTube' },
                { value: 'twitch', label: 'Twitch' },
              ]}
              value={sourceFilter}
              onChange={(v) => setSourceFilter(v || 'all')}
              w={160}
            />
          )}
        </Group>

        {/* Loading / Error */}
        {(loading || playlistLoading) && (
          <Center py="xl"><Loader size="sm" color="cyan" /></Center>
        )}
        {error && (
          <Text c="red" size="sm">{error}</Text>
        )}

        {/* Video Grid */}
        {!loading && !playlistLoading && filteredVideos.length === 0 && (
          <Center py="xl">
            <Text c="dimmed">No videos match your filters.</Text>
          </Center>
        )}

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {filteredVideos.map((video) => {
            const meta = tracked[video.id] || {};
            const tagColor = TAG_COLORS[meta.tag] || 'gray';

            return (
              <Card
                key={video.id}
                withBorder
                p="sm"
                style={{
                  borderColor: meta.reviewed ? 'rgba(34,209,123,0.3)' : 'rgba(255,255,255,0.08)',
                  opacity: meta.reviewed ? 0.7 : 1,
                }}
              >
                <Stack gap="xs">
                  {/* Thumbnail */}
                  <div
                    style={{
                      aspectRatio: '16/9',
                      borderRadius: 6,
                      overflow: 'hidden',
                      background: '#000',
                      cursor: 'pointer',
                    }}
                    onClick={() => setSelectedVideo(video)}
                  >
                    <img
                      src={video.thumbnailUrl}
                      alt={video.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { e.currentTarget.style.opacity = '0.2'; }}
                    />
                  </div>

                  {/* Title */}
                  <Text size="sm" fw={600} lineClamp={2} style={{ color: '#e0eaf4' }}>
                    {video.title}
                  </Text>

                  {/* Meta row */}
                  <Group gap="xs" wrap="wrap">
                    <Badge size="xs" color={video.source === 'twitch' ? 'violet' : 'red'} variant="light">
                      {video.source}
                    </Badge>
                    <Text size="xs" c="dimmed">{formatRelativeTime(video.publishedAt)}</Text>
                    {meta.tag && (
                      <Badge size="xs" color={tagColor} variant="light">{meta.tag}</Badge>
                    )}
                  </Group>

                  {/* Actions */}
                  <Group gap="xs" justify="space-between" wrap="wrap">
                    <Checkbox
                      label="Reviewed"
                      size="xs"
                      checked={!!meta.reviewed}
                      onChange={() => toggleReviewed(video.id)}
                      color="green"
                    />
                    <Select
                      data={TAG_OPTIONS}
                      value={meta.tag || null}
                      onChange={(v) => setTag(video.id, v)}
                      placeholder="Tag"
                      clearable
                      size="xs"
                      w={140}
                    />
                  </Group>

                  {/* Links */}
                  <Group gap="xs">
                    {video.url && (
                      <Tooltip label="Open on YouTube/Twitch">
                        <ActionIcon
                          component="a"
                          href={video.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          size="sm"
                          variant="subtle"
                          color="cyan"
                        >
                          <IconExternalLink size={14} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    <Button size="xs" variant="light" color="cyan" onClick={() => setSelectedVideo(video)}>
                      Preview
                    </Button>
                    {video.youtubeId && (
                      <Tooltip label="Add to download queue">
                        <ActionIcon size="sm" variant="subtle" color="green" onClick={() => handleEnqueueOne(video)}>
                          <IconDownload size={14} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>
      </Stack>

      {/* Preview Modal */}
      <Modal
        opened={!!selectedVideo}
        onClose={() => setSelectedVideo(null)}
        size="lg"
        title={selectedVideo?.title}
        styles={{
          content: { background: 'rgba(4, 10, 26, 0.97)', border: '1px solid rgba(255,255,255,0.09)' },
          overlay: { backdropFilter: 'blur(6px)' },
        }}
      >
        {selectedVideo && (
          <Stack gap="md">
            <div style={{ aspectRatio: '16/9', background: '#000', borderRadius: 6, overflow: 'hidden' }}>
              <MediaPlayer post={selectedVideo} autoplay />
            </div>
            <Group gap="sm">
              <Badge color={selectedVideo.source === 'twitch' ? 'violet' : 'red'} variant="light">
                {selectedVideo.source}
              </Badge>
              <Text size="sm" c="dimmed">{formatRelativeTime(selectedVideo.publishedAt)}</Text>
              {selectedVideo.viewCount > 0 && (
                <Text size="sm" c="dimmed">{selectedVideo.viewCount.toLocaleString()} views</Text>
              )}
            </Group>
            <Group gap="sm">
              <Checkbox
                label="Mark as reviewed"
                checked={!!tracked[selectedVideo.id]?.reviewed}
                onChange={() => toggleReviewed(selectedVideo.id)}
                color="green"
              />
              <Select
                data={TAG_OPTIONS}
                value={tracked[selectedVideo.id]?.tag || null}
                onChange={(v) => setTag(selectedVideo.id, v)}
                placeholder="Tag this video"
                clearable
                size="sm"
                w={180}
              />
              {selectedVideo.youtubeId && (
                <Button size="sm" variant="light" color="green" leftSection={<IconDownload size={14} />} onClick={() => { handleEnqueueOne(selectedVideo); setSelectedVideo(null); }}>
                  Queue for Download
                </Button>
              )}
            </Group>
            {selectedVideo.url && (
              <Anchor href={selectedVideo.url} target="_blank" rel="noopener noreferrer" size="sm">
                Open on {selectedVideo.source === 'twitch' ? 'Twitch' : 'YouTube'} ↗
              </Anchor>
            )}
          </Stack>
        )}
      </Modal>
    </Container>
  );
}

