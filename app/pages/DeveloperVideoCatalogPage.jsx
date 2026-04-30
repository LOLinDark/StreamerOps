import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Center,
  Checkbox,
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
  IconPlus,
  IconRefresh,
  IconCheck,
} from '@tabler/icons-react';
import DevTag from '../components/DevTag';
import { usePageTitle } from '../contexts/PageTitleContext';
import MediaPlayer from '../components/MediaPlayer';
import { fetchAerobookFeed, getCachedAerobookFeed, fetchYoutubePlaylist } from '../core/api/providers/media';
import { fetchYouTubeChannelVideos } from '../core/api/providers/youtube';
import { fetchTwitchChannelVideos } from '../core/api/providers/twitch';
import {
  fetchDownloadedLibrary,
  fetchDownloadDurations,
  enqueueForDownload,
  startDownloadWorker,
} from '../core/api/providers/media';
import { formatRelativeTime } from '../utils/time';
import { notifications } from '@mantine/notifications';

function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

const STORAGE_KEY = 'omnicore.dev.video-catalog.tracked';
const FOLLOWED_SOURCES_KEY = 'omnicore.dev.video-catalog.followed-sources';
const VALID_YOUTUBE_ID = /^[a-zA-Z0-9_-]{11}$/;

const DEFAULT_VIDEO_SOURCES = [
  {
    id: 'feed',
    kind: 'feed',
    label: 'Official Star Citizen Feed',
    description: 'Aggregated recent videos from the built-in Star Citizen / Squadron 42 feed.',
  },
  {
    id: 'yt-playlist:PLVct2QDhDrB2UV4UkGVdo1uct5I2AUqLE',
    kind: 'youtube-playlist',
    externalId: 'PLVct2QDhDrB2UV4UkGVdo1uct5I2AUqLE',
    label: 'Official YouTube Playlist: Behind The Ships',
  },
  {
    id: 'yt-playlist:PLVct2QDhDrB2-Edu0jm18lz0W9NRcXy3Y',
    kind: 'youtube-playlist',
    externalId: 'PLVct2QDhDrB2-Edu0jm18lz0W9NRcXy3Y',
    label: 'Official YouTube Playlist: Squadron 42',
  },
];

function parseDurationSeconds(video) {
  const candidates = [
    video?.durationSec,
    video?.durationSeconds,
    video?.lengthSeconds,
    video?.duration,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate > 0 ? candidate : null;
    }

    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (!trimmed) continue;

      if (/^\d+$/.test(trimmed)) {
        const parsed = Number(trimmed);
        if (parsed > 0) {
          return parsed;
        }
      }

      const parts = trimmed.split(':').map((part) => Number(part));
      if (parts.length >= 2 && parts.every((part) => Number.isFinite(part))) {
        return parts.reduce((total, value) => total * 60 + value, 0);
      }
    }
  }

  return null;
}

function formatDurationLabel(totalSeconds) {
  const seconds = Number(totalSeconds || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '';
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (hours > 0) {
    return [hours, minutes, remainingSeconds].map((value, index) => String(value).padStart(index === 0 ? 1 : 2, '0')).join(':');
  }

  return `${String(minutes).padStart(1, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function normalizeHandle(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  return raw.startsWith('@') ? raw : `@${raw}`;
}

function extractYouTubeIdFromUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';

  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match?.[1] && VALID_YOUTUBE_ID.test(match[1])) {
      return match[1];
    }
  }

  return '';
}

function resolveVideoYoutubeId(video) {
  const candidates = [
    video?.youtubeId,
    video?.externalId,
    video?.videoId,
    video?.id,
    video?.slug,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (VALID_YOUTUBE_ID.test(value)) {
      return value;
    }
  }

  return extractYouTubeIdFromUrl(video?.url || video?.link || '');
}

function resolveThumbnailUrl(video, youtubeId = '') {
  const rawCandidates = [
    video?.thumbnailUrl,
    video?.thumbnail,
    video?.imageUrl,
    video?.previewImageUrl,
    video?.coverUrl,
    video?.image,
  ];

  for (const candidate of rawCandidates) {
    const raw = String(candidate || '').trim();
    if (!raw) continue;

    // Twitch and provider templates often use width/height placeholders.
    const templated = raw
      .replace(/\{width\}|%\{width\}/g, '640')
      .replace(/\{height\}|%\{height\}/g, '360');

    if (templated) {
      if (templated.startsWith('//')) {
        return `https:${templated}`;
      }
      return templated;
    }
  }

  if (youtubeId && VALID_YOUTUBE_ID.test(youtubeId)) {
    return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
  }

  return '';
}

function toThumbnailProxyUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (raw.startsWith('/')) return raw;

  const params = new URLSearchParams({ url: raw });
  return `/api/media/thumbnail?${params.toString()}`;
}

function buildFollowedSourceId(platform, input) {
  const clean = String(input || '').trim().replace(/^@/, '').toLowerCase();
  return `${platform}:${clean}`;
}

function loadFollowedSources() {
  try {
    const raw = JSON.parse(localStorage.getItem(FOLLOWED_SOURCES_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return raw.filter((item) => item && typeof item.id === 'string' && typeof item.kind === 'string');
  } catch {
    return [];
  }
}

function saveFollowedSources(nextSources) {
  try {
    localStorage.setItem(FOLLOWED_SOURCES_KEY, JSON.stringify(nextSources));
  } catch {
    // Ignore storage errors.
  }
}

function normalizeFetchedVideos(videos, sourceMeta) {
  const safeVideos = Array.isArray(videos) ? videos : [];
  return safeVideos.map((video, index) => {
    const resolvedYoutubeId = resolveVideoYoutubeId(video);
    const externalId = video.externalId || video.youtubeId || video.twitchId || video.id || resolvedYoutubeId || `${sourceMeta.id}-${index}`;
    const source = sourceMeta.platform || video.source || (sourceMeta.kind.startsWith('twitch') ? 'twitch' : 'youtube');
    const durationSec = parseDurationSeconds(video);
    const thumbnailUrl = resolveThumbnailUrl(video, resolvedYoutubeId);

    return {
      id: `${sourceMeta.id}:${externalId}`,
      source,
      sourceLabel: sourceMeta.label,
      title: video.title || video.name || `${sourceMeta.label} Video ${index + 1}`,
      publishedAt: video.publishedAt || video.createdAt || video.recordedAt || null,
      thumbnailUrl,
      url: video.url || video.link || '',
      youtubeId: resolvedYoutubeId || (source === 'youtube' ? (video.externalId || video.youtubeId || null) : null),
      twitchId: source === 'twitch' ? (video.externalId || video.twitchId || null) : null,
      viewCount: Number(video.viewCount || video.views || 0),
      durationSec,
      durationLabel: formatDurationLabel(durationSec),
    };
  });
}

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
  const { setPageTitle } = usePageTitle();
  useEffect(() => {
    setPageTitle(<><DevTag tag="DEV08" />Video Catalog</>);
    return () => setPageTitle(null);
  }, [setPageTitle]);
  const [feed, setFeed] = useState(null);
  const [sourceVideos, setSourceVideos] = useState([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tracked, setTracked] = useState(loadTracked);
  const [followedSources, setFollowedSources] = useState(loadFollowedSources);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [activeSource, setActiveSource] = useState('feed');
  const [followPlatform, setFollowPlatform] = useState('youtube');
  const [followInput, setFollowInput] = useState('');
  const [downloadingVideoId, setDownloadingVideoId] = useState('');

  // Download state
  const [downloadedVideoIds, setDownloadedVideoIds] = useState(() => new Set());
  const [durationByVideoId, setDurationByVideoId] = useState({});

  // Load aerobook feed (used when the built-in feed source is selected)
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

  const videoSources = useMemo(() => [...DEFAULT_VIDEO_SOURCES, ...followedSources], [followedSources]);

  const activeSourceMeta = useMemo(
    () => videoSources.find((item) => item.id === activeSource) || DEFAULT_VIDEO_SOURCES[0],
    [activeSource, videoSources]
  );

  // Load selected source when it changes away from the built-in feed
  useEffect(() => {
    if (activeSourceMeta.kind === 'feed') {
      setSourceVideos([]);
      return;
    }

    setSourceLoading(true);
    setError('');

    const loader = (() => {
      if (activeSourceMeta.kind === 'youtube-playlist') {
        return fetchYoutubePlaylist({ playlistId: activeSourceMeta.externalId, limit: 500 });
      }
      if (activeSourceMeta.kind === 'youtube-channel') {
        return fetchYouTubeChannelVideos({ handle: activeSourceMeta.externalId, limit: 500 });
      }
      if (activeSourceMeta.kind === 'twitch-channel') {
        return fetchTwitchChannelVideos({ channel: activeSourceMeta.externalId, limit: 200 });
      }
      return Promise.resolve([]);
    })();

    loader
      .then((payload) => {
        const videos = Array.isArray(payload) ? payload : payload?.videos || payload?.items || [];
        setSourceVideos(normalizeFetchedVideos(videos, activeSourceMeta));
        setSourceLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load followed source');
        setSourceLoading(false);
      });
  }, [activeSourceMeta]);

  const allVideos = useMemo(() => {
    if (activeSourceMeta.kind !== 'feed') {
      return sourceVideos;
    }
    if (!feed?.categories) return [];
    const sc = feed.categories['star-citizen'] || [];
    const sq = feed.categories['squadron-42'] || [];
    return [...sc, ...sq].sort(
      (a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0)
    );
  }, [feed, sourceVideos, activeSourceMeta]);

  const refreshDownloadedVideoIds = useCallback(async () => {
    try {
      const payload = await fetchDownloadedLibrary();
      const items = Array.isArray(payload?.items) ? payload.items : [];
      const next = new Set(
        items
          .map((item) => String(item?.videoId || '').trim())
          .filter(Boolean)
      );
      setDownloadedVideoIds(next);
    } catch {
      // Keep last known downloaded state on errors.
    }
  }, []);

  useEffect(() => {
    refreshDownloadedVideoIds();
  }, [refreshDownloadedVideoIds]);

  useEffect(() => {
    const candidateIds = Array.from(new Set(
      allVideos
        .map((video) => resolveVideoYoutubeId(video))
        .filter(Boolean)
    ));

    const unresolved = candidateIds.filter((id) => durationByVideoId[id] == null).slice(0, 120);
    if (unresolved.length === 0) {
      return;
    }

    let active = true;
    fetchDownloadDurations(unresolved)
      .then((payload) => {
        if (!active) return;
        const raw = payload?.durations && typeof payload.durations === 'object' ? payload.durations : {};
        setDurationByVideoId((prev) => {
          const next = { ...prev };
          unresolved.forEach((id) => {
            const value = Number(raw[id]);
            next[id] = Number.isFinite(value) && value > 0 ? value : 0;
          });
          return next;
        });
      })
      .catch(() => {
        if (!active) return;
        setDurationByVideoId((prev) => {
          const next = { ...prev };
          unresolved.forEach((id) => {
            if (next[id] == null) {
              next[id] = 0;
            }
          });
          return next;
        });
      });

    return () => {
      active = false;
    };
  }, [allVideos, durationByVideoId]);

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

  function addFollowedSource() {
    const raw = String(followInput || '').trim();
    if (!raw) return;

    const normalizedInput = followPlatform === 'youtube' ? normalizeHandle(raw) : raw.replace(/^@/, '');
    const kind = followPlatform === 'youtube' ? 'youtube-channel' : 'twitch-channel';
    const source = {
      id: buildFollowedSourceId(followPlatform, normalizedInput),
      kind,
      platform: followPlatform,
      externalId: normalizedInput,
      label: followPlatform === 'youtube'
        ? `Followed YouTube: ${normalizedInput}`
        : `Followed Twitch: ${normalizedInput}`,
    };

    setFollowedSources((prev) => {
      if (prev.some((item) => item.id === source.id)) {
        return prev;
      }
      const next = [...prev, source];
      saveFollowedSources(next);
      return next;
    });
    setFollowInput('');
    setActiveSource(source.id);
    setSearch('');
    setFilter('all');
  }

  function removeFollowedSource(sourceId) {
    setFollowedSources((prev) => {
      const next = prev.filter((item) => item.id !== sourceId);
      saveFollowedSources(next);
      return next;
    });

    if (activeSource === sourceId) {
      setActiveSource('feed');
    }
  }

  async function handleManualDownloadOne(video) {
    const youtubeId = resolveVideoYoutubeId(video);
    if (!youtubeId) {
      notifications.show({
        title: 'Download unavailable',
        message: 'This video does not have a valid YouTube ID for the downloader.',
        color: 'orange',
      });
      return;
    }

    setDownloadingVideoId(youtubeId);
    try {
      const playlistLabel = activeSourceMeta?.label || '';
      await withTimeout(enqueueForDownload([{
        videoId: youtubeId,
        title: video.title,
        url: video.url,
        playlistId: activeSourceMeta.kind === 'youtube-playlist' ? activeSourceMeta.externalId : activeSourceMeta.id,
        playlistLabel,
      }]), 10000, 'Queue request');
      await withTimeout(startDownloadWorker(), 10000, 'Worker start request');

      notifications.show({
        title: 'Download started',
        message: `Queued and started: ${String(video.title || youtubeId).slice(0, 90)}`,
        color: 'green',
      });

      // Refresh downloaded state after worker has had a moment to progress.
      window.setTimeout(() => {
        refreshDownloadedVideoIds();
      }, 2000);
    } catch (err) {
      let message = err?.message || 'Could not start manual download.';
      if (message.includes('YT_DOWNLOAD_DIR')) {
        message = 'Download folder is not configured. Set YT_DOWNLOAD_DIR in server/.env.';
      }
      if (message.includes('yt-dlp')) {
        message = 'yt-dlp is missing. Install yt-dlp on the server host.';
      }
      notifications.show({
        title: 'Download failed',
        message,
        color: 'red',
      });
    } finally {
      setDownloadingVideoId('');
    }
  }

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        <div
          style={{
            position: 'sticky',
            top: '127px',
            zIndex: 20,
            marginBottom: '0.25rem',
            padding: '0.75rem 1rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 0,
            backgroundColor: 'rgba(11, 20, 40, 0.94)',
            backdropFilter: 'blur(6px)',
            boxShadow: '0 6px 14px rgba(0, 0, 0, 0.2)',
          }}
        >
          <Stack gap="sm">
            <div>
<Text size="sm" c="dimmed">
                Track official Star Citizen sources plus your own followed YouTube and Twitch channels. Tag, review, preview, and manually download individual videos.
              </Text>
            </div>

            <Group gap="sm">
              <Badge color="cyan" variant="light">{allVideos.length} total</Badge>
              <Badge color="green" variant="light">{reviewedCount} reviewed</Badge>
              <Badge color="orange" variant="light">{allVideos.length - reviewedCount} remaining</Badge>
            </Group>
          </Stack>
        </div>

        <Card withBorder style={{ borderColor: 'rgba(0,217,255,0.2)' }}>
          <Stack gap="sm">
            <Group justify="space-between" wrap="wrap">
              <Text fw={700}>Followed Sources</Text>
              <Badge variant="light" color="cyan">{followedSources.length} custom follow(s)</Badge>
            </Group>
            <Text size="sm" c="dimmed">
              Star Citizen defaults stay available, but this list is where you add other YouTube channels and Twitch accounts you want to watch for stream content.
            </Text>
            <Group gap="sm" wrap="wrap" align="flex-end">
              <Select
                label="Platform"
                value={followPlatform}
                onChange={(value) => setFollowPlatform(value || 'youtube')}
                data={[
                  { value: 'youtube', label: 'YouTube channel' },
                  { value: 'twitch', label: 'Twitch channel' },
                ]}
                w={180}
              />
              <TextInput
                label={followPlatform === 'youtube' ? 'Channel Handle' : 'Channel Username'}
                placeholder={followPlatform === 'youtube' ? '@RobertsSpaceInd' : 'starcitizen'}
                value={followInput}
                onChange={(event) => setFollowInput(event.currentTarget.value)}
                style={{ minWidth: 240, flex: 1 }}
              />
              <Button leftSection={<IconPlus size={16} />} onClick={addFollowedSource}>
                Add Follow
              </Button>
            </Group>
            {followedSources.length > 0 && (
              <Group gap="xs" wrap="wrap">
                {followedSources.map((item) => (
                  <Badge
                    key={item.id}
                    size="lg"
                    color={item.platform === 'twitch' ? 'violet' : 'red'}
                    variant="light"
                    rightSection={(
                      <ActionIcon size="xs" variant="transparent" color="gray" onClick={() => removeFollowedSource(item.id)}>
                        <IconX size={10} />
                      </ActionIcon>
                    )}
                  >
                    {item.label}
                  </Badge>
                ))}
              </Group>
            )}
          </Stack>
        </Card>

        {/* Source selector */}
        <Group gap="sm" wrap="wrap" align="center">
          <Text size="sm" fw={600} c="dimmed">Source:</Text>
          <Select
            data={videoSources.map((item) => ({ value: item.id, label: item.label }))}
            value={activeSource}
            onChange={(v) => {
              setActiveSource(v || 'feed');
              setSearch('');
              setFilter('all');
            }}
            w={320}
          />
          <Button size="xs" variant="subtle" leftSection={<IconRefresh size={12} />} onClick={refreshDownloadedVideoIds}>
            Refresh Downloaded State
          </Button>
        </Group>
        {activeSourceMeta.kind === 'youtube-channel' && (
          <Text size="xs" c="dimmed">
            Followed YouTube channels are read from the public YouTube feed endpoint, which can return only the latest uploads.
          </Text>
        )}

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
          {activeSourceMeta.kind === 'feed' && (
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
        {(loading || sourceLoading) && (
          <Center py="xl"><Loader size="sm" color="cyan" /></Center>
        )}
        {error && (
          <Text c="red" size="sm">{error}</Text>
        )}

        {/* Video Grid */}
        {!loading && !sourceLoading && filteredVideos.length === 0 && (
          <Center py="xl">
            <Text c="dimmed">No videos match your filters.</Text>
          </Center>
        )}

        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {filteredVideos.map((video) => {
            const meta = tracked[video.id] || {};
            const tagColor = TAG_COLORS[meta.tag] || 'gray';
            const resolvedYoutubeId = resolveVideoYoutubeId(video);
            const resolvedDurationSec = video.durationSec || Number(durationByVideoId[resolvedYoutubeId] || 0);
            const resolvedDurationLabel = video.durationLabel || formatDurationLabel(resolvedDurationSec);
            const resolvedThumbnail = resolveThumbnailUrl(video, resolvedYoutubeId);
            const resolvedThumbnailProxy = toThumbnailProxyUrl(resolvedThumbnail);
            const alreadyDownloaded = Boolean(resolvedYoutubeId && downloadedVideoIds.has(resolvedYoutubeId));

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
                      src={resolvedThumbnailProxy}
                      alt={video.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => {
                        if (resolvedYoutubeId && !e.currentTarget.dataset.fallbackTried) {
                          e.currentTarget.dataset.fallbackTried = '1';
                          e.currentTarget.src = `/api/media/thumbnail?url=${encodeURIComponent(`https://i.ytimg.com/vi/${resolvedYoutubeId}/default.jpg`)}`;
                          return;
                        }
                        e.currentTarget.style.opacity = '0.2';
                      }}
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
                    {resolvedDurationLabel && (
                      <Badge size="xs" color="blue" variant="light">{resolvedDurationLabel}</Badge>
                    )}
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
                    {resolvedYoutubeId && (
                      <Button
                        size="xs"
                        variant="light"
                        color={alreadyDownloaded ? 'teal' : 'green'}
                        leftSection={<IconDownload size={12} />}
                        onClick={() => handleManualDownloadOne(video)}
                        loading={downloadingVideoId === resolvedYoutubeId}
                        disabled={Boolean(downloadingVideoId) && downloadingVideoId !== resolvedYoutubeId}
                      >
                        {alreadyDownloaded ? 'Download Again' : 'Download Now'}
                      </Button>
                    )}
                    {resolvedYoutubeId && alreadyDownloaded && (
                      <Tooltip label="Already downloaded to destination folder">
                        <ActionIcon size="sm" variant="subtle" color="teal" disabled>
                          <IconCheck size={14} />
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
              {selectedVideo.durationLabel && (
                <Text size="sm" c="dimmed">Duration: {selectedVideo.durationLabel}</Text>
              )}
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
                <Button
                  size="sm"
                  variant="light"
                  color="green"
                  leftSection={<IconDownload size={14} />}
                  onClick={() => { handleManualDownloadOne(selectedVideo); setSelectedVideo(null); }}
                  loading={downloadingVideoId === selectedVideo.youtubeId}
                >
                  Download Now
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

