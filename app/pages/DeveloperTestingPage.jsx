import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Card, Container, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import DevTag from '../components/DevTag';
import { usePageTitle } from '../contexts/PageTitleContext';
import { restoreStoredDirectoryEntries, supportsStoredDirectoryHandles } from '../streamer/directoryHandles';

const SEQUENCE_LIBRARY_KEY = 'streamerops.sequenceLibrary.v1';
const TARGET_PLAYLIST_NAME = 'Star Citizen - StarCitizenTV';

function readSequenceLibrary() {
  try {
    const raw = localStorage.getItem(SEQUENCE_LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function pickFirstVideoFromLibrary() {
  const library = readSequenceLibrary();
  const preferred = library.find((entry) => String(entry?.name || '').trim() === TARGET_PLAYLIST_NAME);
  const fallback = library.find((entry) => Array.isArray(entry?.sequence) && entry.sequence.some((item) => item?.type === 'video'));
  const target = preferred || fallback;
  if (!target || !Array.isArray(target.sequence)) {
    return { source: '', title: '', playlistName: '' };
  }

  const firstVideo = target.sequence.find((item) => item?.type === 'video' && String(item?.source || '').trim());
  if (!firstVideo) {
    return { source: '', title: '', playlistName: String(target.name || '') };
  }

  return {
    source: String(firstVideo.source || ''),
    title: String(firstVideo.title || 'Star Citizen Video'),
    playlistName: String(target.name || ''),
  };
}

function isDirectlyPlayableSource(source) {
  const value = String(source || '').trim();
  if (!value) return false;
  return /^(https?:|blob:|data:|file:)/i.test(value) || value.startsWith('/');
}

function normalizePath(input) {
  return String(input || '').replace(/\\/g, '/').toLowerCase().trim();
}

function getBaseName(input) {
  const normalized = normalizePath(input);
  return normalized.split('/').pop() || '';
}

function findRememberedVideoMatch(source, entries) {
  const normalizedSource = normalizePath(source);
  const sourceBase = getBaseName(source);

  return entries.find((entry) => {
    const path = normalizePath(entry?.path || entry?.file?.name || '');
    const base = getBaseName(path);
    return path === normalizedSource || path.endsWith(`/${normalizedSource}`) || base === sourceBase;
  }) || null;
}

function probeVideoMetadata(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    let settled = false;

    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      resolve(ok);
    };

    const timer = window.setTimeout(() => finish(false), timeoutMs);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => finish(true);
    video.onerror = () => finish(false);
    video.src = url;
  });
}

async function findFirstVideoFileInDirectory(handle) {
  for await (const entry of handle.values()) {
    if (entry.kind === 'file') {
      const file = await entry.getFile();
      if (String(file.type || '').startsWith('video/')) {
        return file;
      }
    }

    if (entry.kind === 'directory') {
      const nested = await findFirstVideoFileInDirectory(entry);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

async function resolveSourceToPlayableUrl(source) {
  const raw = String(source || '').trim();
  if (!raw) {
    return { playableUrl: '', resolution: 'empty' };
  }

  if (isDirectlyPlayableSource(raw)) {
    return { playableUrl: raw, resolution: 'direct' };
  }

  // Try common same-origin paths for bare filenames first.
  const candidateUrls = [
    `/${raw.replace(/^\/+/, '')}`,
    `/assets/music/${raw.replace(/^\/+/, '')}`,
    `/assets/videos/${raw.replace(/^\/+/, '')}`,
  ];

  for (const candidate of candidateUrls) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await probeVideoMetadata(candidate);
    if (ok) {
      return { playableUrl: candidate, resolution: 'same-origin' };
    }
  }

  if (!supportsStoredDirectoryHandles()) {
    return { playableUrl: '', resolution: 'unsupported' };
  }

  const entries = await restoreStoredDirectoryEntries('video', true);
  const match = findRememberedVideoMatch(raw, entries);
  if (!match?.file) {
    return { playableUrl: '', resolution: 'not-found' };
  }

  const blobUrl = URL.createObjectURL(match.file);
  return { playableUrl: blobUrl, resolution: 'remembered' };
}

export default function DeveloperTestingPage() {
  const { setPageTitle } = usePageTitle();
  useEffect(() => {
    setPageTitle(<><DevTag tag="DEV09" />Testing Lab</>);
    return () => setPageTitle(null);
  }, [setPageTitle]);
  const initial = useMemo(() => pickFirstVideoFromLibrary(), []);
  const [videoSource, setVideoSource] = useState(initial.source);
  const [playableSource, setPlayableSource] = useState('');
  const [videoTitle, setVideoTitle] = useState(initial.title);
  const [playlistName, setPlaylistName] = useState(initial.playlistName);
  const [loadAttempted, setLoadAttempted] = useState(Boolean(initial.source));
  const [isResolving, setIsResolving] = useState(false);
  const [resolveNote, setResolveNote] = useState('');
  const [playerStatus, setPlayerStatus] = useState('Idle');
  const blobUrlRef = useRef('');
  const fileInputRef = useRef(null);

  const hasSource = Boolean(String(videoSource || '').trim());

  useEffect(() => {
    let active = true;

    async function runResolution() {
      if (!hasSource) {
        setPlayableSource('');
        setResolveNote('');
        setPlayerStatus('Idle');
        return;
      }

      setIsResolving(true);
      const result = await resolveSourceToPlayableUrl(videoSource);
      if (!active) return;

      const previousBlobUrl = blobUrlRef.current;
      if (previousBlobUrl && previousBlobUrl !== result.playableUrl) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = '';
      }

      if (result.resolution === 'remembered' && result.playableUrl) {
        blobUrlRef.current = result.playableUrl;
      }

      setPlayableSource(result.playableUrl || '');
      setPlayerStatus(result.playableUrl ? 'Source resolved. Waiting for player.' : 'No playable source resolved.');

      if (result.resolution === 'direct') {
        setResolveNote('Using source directly.');
      } else if (result.resolution === 'same-origin') {
        setResolveNote('Resolved using a same-origin asset path.');
      } else if (result.resolution === 'remembered') {
        setResolveNote('Resolved via remembered video folder.');
      } else if (result.resolution === 'not-found') {
        setResolveNote('Could not find this file in remembered video folders.');
      } else if (result.resolution === 'unsupported') {
        setResolveNote('Browser does not support remembered folder handles in this context.');
      } else {
        setResolveNote('No valid video source resolved.');
      }

      setIsResolving(false);
    }

    runResolution();
    return () => {
      active = false;
    };
  }, [hasSource, videoSource]);

  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  function loadFromPlaylist() {
    const next = pickFirstVideoFromLibrary();
    setVideoSource(next.source);
    setVideoTitle(next.title);
    setPlaylistName(next.playlistName);
    setLoadAttempted(true);
  }

  function pickVideoFile() {
    fileInputRef.current?.click();
  }

  function handleVideoFilePick(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = '';
    }

    const url = URL.createObjectURL(file);
    blobUrlRef.current = url;

    setVideoSource(url);
    setPlayableSource(url);
    setVideoTitle(file.name || 'Star Citizen Video');
    setPlaylistName('Manual File Selection');
    setLoadAttempted(true);
    setResolveNote('Using manually selected local file.');
    setPlayerStatus('Manual file selected. Waiting for player.');

    event.target.value = '';
  }

  async function pickFolderAndPlayFirstVideo() {
    if (typeof window.showDirectoryPicker !== 'function') {
      setResolveNote('This browser does not support folder picking.');
      return;
    }

    try {
      const directoryHandle = await window.showDirectoryPicker({ mode: 'read' });
      const file = await findFirstVideoFileInDirectory(directoryHandle);

      if (!file) {
        setResolveNote('No video files were found in the selected folder.');
        return;
      }

      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = '';
      }

      const url = URL.createObjectURL(file);
      blobUrlRef.current = url;

      setVideoSource(url);
      setPlayableSource(url);
      setVideoTitle(file.name || 'Star Citizen Video');
      setPlaylistName(`Folder: ${directoryHandle.name}`);
      setLoadAttempted(true);
      setResolveNote(`Playing first video found in selected folder: ${file.name}`);
      setPlayerStatus('Folder video selected. Waiting for player.');
    } catch (error) {
      if (error?.name === 'AbortError') {
        setResolveNote('Folder selection cancelled.');
        return;
      }

      setResolveNote('Could not open the selected folder for video playback.');
    }
  }

  return (
    <Container size="lg">
      <Stack gap="md">
<Card withBorder>
          <Stack gap="sm">
            <Group gap="xs" wrap="wrap">
              <Badge variant="light" color="cyan">Isolated Video Test</Badge>
              <Badge variant="light" color={hasSource ? 'teal' : 'orange'}>
                {hasSource ? 'Video source loaded' : 'No source loaded'}
              </Badge>
              <Badge variant="light" color={isResolving ? 'blue' : playableSource ? 'teal' : 'orange'}>
                {isResolving ? 'Resolving...' : playableSource ? 'Playable source ready' : 'Playable source missing'}
              </Badge>
            </Group>
            <Text size="sm" c="dimmed">
              This page is intentionally minimal: load one Star Citizen video source and confirm browser playback works.
            </Text>
            <Group wrap="wrap">
              <Button onClick={pickFolderAndPlayFirstVideo}>
                Pick Folder And Play First Video
              </Button>
              <Button variant="light" onClick={loadFromPlaylist}>
                Load First Video From Playlist
              </Button>
              <Button variant="light" color="grape" onClick={pickVideoFile}>
                Pick Video File
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleVideoFilePick}
                style={{ display: 'none' }}
              />
            </Group>
            <TextInput
              label="Video Source URL or Path"
              placeholder="https://... or /assets/..."
              value={videoSource}
              onChange={(event) => setVideoSource(event.currentTarget.value)}
            />
            <TextInput
              label="Video Title"
              placeholder="Optional"
              value={videoTitle}
              onChange={(event) => setVideoTitle(event.currentTarget.value)}
            />
            <Text size="xs" c="dimmed">
              Playlist source: {playlistName || 'None detected'}
            </Text>
            <Text size="xs" c="dimmed">
              Resolve status: {resolveNote || 'Idle'}
            </Text>
            <Text size="xs" c="dimmed">
              Player status: {playerStatus}
            </Text>
          </Stack>
        </Card>

        <Card withBorder>
          <Stack gap="xs">
            <Text fw={600}>{videoTitle || 'Star Citizen Video'}</Text>
            {playableSource ? (
              <video
                key={playableSource}
                src={playableSource}
                controls
                autoPlay
                muted
                playsInline
                onLoadedMetadata={() => setPlayerStatus('Metadata loaded. Browser can read the file.')}
                onCanPlay={() => setPlayerStatus('Can play. Use controls if autoplay does not start.')}
                onPlaying={() => setPlayerStatus('Playing.')}
                onPause={() => setPlayerStatus('Paused.')}
                onError={(event) => {
                  const mediaError = event.currentTarget.error;
                  setPlayerStatus(`Playback error${mediaError?.code ? ` (code ${mediaError.code})` : ''}. Browser could not decode this file.`);
                }}
                style={{ width: '100%', maxHeight: 620, background: '#000', borderRadius: 8 }}
              />
            ) : (
              <Text size="sm" c="dimmed">
                {loadAttempted
                  ? 'No playable video source could be resolved. Ensure your remembered video folder contains this file, then click Load First Video From Playlist again.'
                  : 'Click Load First Video From Playlist to test the first Star Citizen video.'}
              </Text>
            )}
          </Stack>
        </Card>
      </Stack>
    </Container>
  );
}
