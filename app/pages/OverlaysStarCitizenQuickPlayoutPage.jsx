import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Group, Stack, Text } from '@mantine/core';
import {
  getQuickPlayoutTemplate,
  QUICK_PLAYOUT_CONTROL_CHANNEL,
} from '../overlays/quickPlayoutTemplates';
import { restoreStoredDirectoryEntries, supportsStoredDirectoryHandles } from '../streamer/directoryHandles';

const TEMPLATE_ID = 'star-citizen-core-v1';
const DISCLAIMER_TEXT = 'Star Citizen, Roberts Space Industries©️(RSI) and Cloud Imperium ©️are registered trademarks of Cloud Imperium Rights LLC';
const VISIBILITY_KEYS = ['header', 'hint', 'disclaimer'];
const DEFAULT_STAR_CITIZEN_VIDEO_SOURCE = '/api/dev/download/file/Star_Citizen_Behind_the_Ships_-_MISC_Hull_B%20%5BJWEbWUewco0%5D.mp4';
const OVERLAY_CONTROL_API = '/api/overlays/star-citizen/control';

function asAbsoluteAssetSource(source = '') {
  if (!source) return '';
  if (/^(https?:|blob:|data:|file:)/i.test(source)) return source;
  if (source.startsWith('/')) return source;
  return `/${source}`;
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

function isDirectSource(source) {
  return /^(https?:|blob:|data:|file:)/i.test(String(source || '').trim());
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

async function resolveVideoSource(source) {
  const raw = String(source || '').trim();
  if (!raw) return '';

  if (isDirectSource(raw)) {
    return raw;
  }

  if (raw.startsWith('/')) {
    return raw;
  }

  const candidateUrls = [
    `/${raw.replace(/^\/+/, '')}`,
    `/assets/music/${raw.replace(/^\/+/, '')}`,
    `/assets/videos/${raw.replace(/^\/+/, '')}`,
    `/api/dev/download/file/${encodeURIComponent(raw.replace(/^\/+/, ''))}`,
  ];

  for (const candidate of candidateUrls) {
    // eslint-disable-next-line no-await-in-loop
    const ok = await probeVideoMetadata(candidate);
    if (ok) {
      return candidate;
    }
  }

  if (!supportsStoredDirectoryHandles()) {
    return '';
  }

  const entries = await restoreStoredDirectoryEntries('video', true);
  const match = findRememberedVideoMatch(raw, entries);
  if (!match?.file) {
    return '';
  }

  return URL.createObjectURL(match.file);
}

export default function OverlaysStarCitizenQuickPlayoutPage() {
  const template = useMemo(() => getQuickPlayoutTemplate(TEMPLATE_ID), []);
  const templatePlaylist = template.playlist || [];
  const params = useMemo(() => new URLSearchParams(window.location.search || ''), []);
  const autoStart = useMemo(() => {
    return params.get('autostart') === '1';
  }, [params]);
  const initialStageMode = useMemo(() => {
    const mode = params.get('stage');
    return mode === 'fixed16x9' ? 'fixed16x9' : 'fit';
  }, [params]);
  const forceMute = useMemo(() => params.get('mute') === '1', [params]);

  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoStart);
  const [isLooping, setIsLooping] = useState(true);
  const [stageMode, setStageMode] = useState(initialStageMode);
  const [closeGuardEnabled, setCloseGuardEnabled] = useState(true);
  const [fullscreenHintVisible, setFullscreenHintVisible] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [elementVisibility, setElementVisibility] = useState({
    header: true,
    hint: true,
    disclaimer: true,
  });
  const [playlist, setPlaylist] = useState(templatePlaylist);

  const videoRef = useRef(null);
  const timerRef = useRef(null);
  const sourceBlobUrlRef = useRef('');
  const processedCommandIdsRef = useRef(new Set());
  const lastControlSeqRef = useRef(0);

  const current = playlist[index] || null;
  const fallbackCurrentSource = asAbsoluteAssetSource(current?.source || '');
  const [resolvedCurrentSource, setResolvedCurrentSource] = useState(fallbackCurrentSource);
  const layoutReservedPx = (elementVisibility.header ? 72 : 0) + (elementVisibility.disclaimer ? 44 : 0) + 32;
  const stageMaxHeight = `calc(100vh - ${layoutReservedPx}px)`;
  const fixedStageWidth = `min(94vw, 1720px, calc(${stageMaxHeight} * 16 / 9))`;

  const clearItemTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const goTo = (nextIndex) => {
    if (!playlist.length) return;
    const max = playlist.length - 1;
    const clamped = Math.max(0, Math.min(nextIndex, max));
    setIndex(clamped);
  };

  useEffect(() => {
    let active = true;

    async function hydrateLivePlaylist() {
      try {
        const response = await fetch('/api/dev/download/library');
        if (!response.ok) return;
        const data = await response.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        if (!active || items.length === 0) return;
        setPlaylist(items);
      } catch {
        // Keep template playlist if live library is unavailable.
      }
    }

    hydrateLivePlaylist();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!playlist.length) {
      if (index !== 0) setIndex(0);
      return;
    }

    if (index > playlist.length - 1) {
      setIndex(playlist.length - 1);
    }
  }, [playlist, index]);

  const goNext = () => {
    if (!playlist.length) return;

    if (index < playlist.length - 1) {
      setIndex((prev) => prev + 1);
      return;
    }

    if (isLooping) {
      setIndex(0);
      return;
    }

    setIsPlaying(false);
  };

  const goPrev = () => {
    if (!playlist.length) return;
    if (index > 0) {
      setIndex((prev) => prev - 1);
      return;
    }
    if (isLooping) {
      setIndex(playlist.length - 1);
    }
  };

  const restart = () => {
    setIndex(0);
    setIsPlaying(true);
  };

  const stop = () => {
    setIsPlaying(false);
    setIndex(0);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  const executeCommand = (command, payload = {}) => {
    switch (command) {
      case 'play':
        setIsPlaying(true);
        break;
      case 'pause':
        setIsPlaying(false);
        break;
      case 'toggle-play':
        setIsPlaying((prev) => !prev);
        break;
      case 'next':
        goNext();
        break;
      case 'prev':
        goPrev();
        break;
      case 'restart':
        restart();
        break;
      case 'stop':
        stop();
        break;
      case 'toggle-loop':
        setIsLooping((prev) => !prev);
        break;
      case 'loop-on':
        setIsLooping(true);
        break;
      case 'loop-off':
        setIsLooping(false);
        break;
      case 'goto':
        if (Number.isFinite(payload.index)) {
          goTo(Number(payload.index));
        }
        break;
      case 'set-visibility':
        if (payload?.element && VISIBILITY_KEYS.includes(payload.element)) {
          const nextVisible = Boolean(payload.visible);
          setElementVisibility((prev) => ({ ...prev, [payload.element]: nextVisible }));
        }
        break;
      case 'set-stage-mode':
        if (payload?.mode === 'fixed16x9' || payload?.mode === 'fit') {
          setStageMode(payload.mode);
        }
        break;
      case 'toggle-stage-mode':
        setStageMode((prev) => (prev === 'fixed16x9' ? 'fit' : 'fixed16x9'));
        break;
      case 'set-close-guard':
        setCloseGuardEnabled(Boolean(payload?.enabled));
        break;
      default:
        break;
    }
  };

  const executeIncomingCommand = (message) => {
    const incoming = message && typeof message === 'object' ? message : {};
    if (incoming.target && incoming.target !== TEMPLATE_ID && incoming.target !== 'all') {
      return;
    }

    const commandId = String(incoming.commandId || '').trim();
    if (commandId) {
      if (processedCommandIdsRef.current.has(commandId)) {
        return;
      }

      processedCommandIdsRef.current.add(commandId);
      if (processedCommandIdsRef.current.size > 400) {
        const values = Array.from(processedCommandIdsRef.current);
        processedCommandIdsRef.current = new Set(values.slice(-250));
      }
    }

    executeCommand(incoming.command, incoming.payload || {});
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === 'Space') {
        event.preventDefault();
        executeCommand('toggle-play');
        return;
      }

      if (event.code === 'ArrowRight') {
        event.preventDefault();
        executeCommand('next');
        return;
      }

      if (event.code === 'ArrowLeft') {
        event.preventDefault();
        executeCommand('prev');
        return;
      }

      if (event.key.toLowerCase() === 'l') {
        event.preventDefault();
        executeCommand('toggle-loop');
        return;
      }

      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        executeCommand('restart');
        return;
      }

      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        executeCommand('stop');
        return;
      }

      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          document.documentElement.requestFullscreen?.().catch(() => {});
        }
        return;
      }

      if (event.key.toLowerCase() === 'v') {
        event.preventDefault();
        executeCommand('toggle-stage-mode');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isLooping, index]);

  useEffect(() => {
    try {
      const channel = new BroadcastChannel(QUICK_PLAYOUT_CONTROL_CHANNEL);
      channel.onmessage = (event) => {
        const message = event.data || {};
        executeIncomingCommand(message);
      };

      return () => {
        channel.close();
      };
    } catch {
      return undefined;
    }
  }, []);

  useEffect(() => {
    let active = true;

    const poll = async () => {
      try {
        const response = await fetch(`${OVERLAY_CONTROL_API}?after=${lastControlSeqRef.current}`, {
          cache: 'no-store',
        });
        if (!response.ok) return;

        const data = await response.json();
        const events = Array.isArray(data?.events) ? data.events : [];

        for (const event of events) {
          if (!active) return;
          lastControlSeqRef.current = Math.max(lastControlSeqRef.current, Number(event?.seq) || 0);
          executeIncomingCommand(event);
        }
      } catch {
        // Keep local channel control even if relay polling fails.
      }
    };

    poll();
    const timer = setInterval(poll, 500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [index, isPlaying, isLooping, stageMode, closeGuardEnabled]);

  useEffect(() => {
    clearItemTimer();

    if (!isPlaying || !current) return;

    if (current.type === 'image') {
      const waitMs = Math.max(1, Number(current.durationSec) || 5) * 1000;
      timerRef.current = setTimeout(() => {
        goNext();
      }, waitMs);
      return;
    }

    if (current.type === 'video' && videoRef.current) {
      const media = videoRef.current;
      media.muted = forceMute;
      media.volume = 1;

      media.play().then(() => {
        setAudioBlocked(false);
      }).catch(async () => {
        // Browsers may block autoplay with sound. Fall back to muted autoplay
        // so video still renders, then allow unmute on first user interaction.
        if (forceMute) {
          setIsPlaying(false);
          return;
        }

        media.muted = true;
        try {
          await media.play();
          setAudioBlocked(true);
        } catch {
          setIsPlaying(false);
        }
      });
    }

    return () => clearItemTimer();
  }, [index, isPlaying, current?.id, isLooping, forceMute]);

  useEffect(() => {
    if (!audioBlocked || forceMute) return undefined;

    const tryUnmute = () => {
      const media = videoRef.current;
      if (!media) return;
      media.muted = false;
      media.volume = 1;
      media.play().then(() => {
        setAudioBlocked(false);
      }).catch(() => {
        // Keep blocked state until an interaction successfully starts audio.
      });
    };

    window.addEventListener('pointerdown', tryUnmute, { passive: true });
    window.addEventListener('keydown', tryUnmute);

    return () => {
      window.removeEventListener('pointerdown', tryUnmute);
      window.removeEventListener('keydown', tryUnmute);
    };
  }, [audioBlocked, forceMute]);

  useEffect(() => {
    if (!videoRef.current) return;
    if (!isPlaying) {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    let active = true;

    async function runSourceResolution() {
      const raw = String(current?.source || '').trim();
      if (!raw) {
        if (sourceBlobUrlRef.current) {
          URL.revokeObjectURL(sourceBlobUrlRef.current);
          sourceBlobUrlRef.current = '';
        }
        setResolvedCurrentSource('');
        return;
      }

      if (current?.type !== 'video') {
        if (sourceBlobUrlRef.current) {
          URL.revokeObjectURL(sourceBlobUrlRef.current);
          sourceBlobUrlRef.current = '';
        }
        setResolvedCurrentSource(asAbsoluteAssetSource(raw));
        return;
      }

      const nextSource = await resolveVideoSource(raw);
      if (!active) return;

      const effectiveSource = nextSource || (current?.type === 'video' ? DEFAULT_STAR_CITIZEN_VIDEO_SOURCE : asAbsoluteAssetSource(raw));

      if (sourceBlobUrlRef.current && sourceBlobUrlRef.current !== effectiveSource) {
        URL.revokeObjectURL(sourceBlobUrlRef.current);
        sourceBlobUrlRef.current = '';
      }

      if (effectiveSource && effectiveSource.startsWith('blob:')) {
        sourceBlobUrlRef.current = effectiveSource;
      }

      setResolvedCurrentSource(effectiveSource);
    }

    runSourceResolution();

    return () => {
      active = false;
    };
  }, [current?.id, current?.source, current?.type]);

  useEffect(() => {
    return () => {
      if (sourceBlobUrlRef.current) {
        URL.revokeObjectURL(sourceBlobUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setFullscreenHintVisible(false), 7000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!closeGuardEnabled) {
        return;
      }

      event.preventDefault();
      event.returnValue = 'Playout close guard is enabled. Are you sure you want to close this stream window?';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [closeGuardEnabled]);

  return (
    <div
      style={{
        width: '100vw',
        minHeight: '100vh',
        background: template.theme.background,
        color: '#d8f3ff',
        display: 'grid',
        gridTemplateRows: elementVisibility.header ? 'auto 1fr auto' : '1fr auto',
      }}
    >
      {elementVisibility.header && (
        <Group justify="space-between" px="lg" py="md" style={{ borderBottom: `1px solid ${template.theme.border}` }}>
          <Stack gap={0}>
            <Text fw={800} style={{ letterSpacing: '0.08em' }}>{template.theme.title}</Text>
            <Text size="sm" c="rgba(216,243,255,0.75)">{template.theme.subtitle}</Text>
          </Stack>
          <Badge variant="light" color={closeGuardEnabled ? 'yellow' : 'gray'}>
            {closeGuardEnabled ? 'Close Guard On' : 'Close Guard Off'}
          </Badge>
        </Group>
      )}

      <div style={{ padding: 16, display: 'grid' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 0, overflow: 'hidden' }}>
          <div
            style={{
              width: stageMode === 'fixed16x9' ? fixedStageWidth : '100%',
              height: stageMode === 'fixed16x9' ? 'auto' : `min(100%, ${stageMaxHeight})`,
              maxHeight: stageMaxHeight,
              minHeight: 0,
              aspectRatio: stageMode === 'fixed16x9' ? '16 / 9' : undefined,
              border: `1px solid ${template.theme.border}`,
              background: 'rgba(0, 0, 0, 0.7)',
              borderRadius: 10,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
          {current?.type === 'video' ? (
            <video
              ref={videoRef}
              src={resolvedCurrentSource}
              style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
              muted={forceMute}
              playsInline
              onEnded={goNext}
            />
          ) : current?.type === 'image' ? (
            <img
              src={resolvedCurrentSource}
              alt={current?.title || 'Playlist image'}
              style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
            />
          ) : (
            <Group justify="center" align="center" style={{ height: '100%' }}>
              <Text c="gray.5">No media configured for this template.</Text>
            </Group>
          )}

          {audioBlocked && (
            <Group
              justify="center"
              align="center"
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.35)',
                pointerEvents: 'none',
              }}
            >
              <Badge color="yellow" variant="filled">Click once to enable sound</Badge>
            </Group>
          )}

          </div>
        </div>
      </div>

      {elementVisibility.disclaimer && (
        <Group justify="center" px="lg" py="sm" style={{ borderTop: `1px solid ${template.theme.border}` }}>
          <Text size="xs" ta="center" c="rgba(216,243,255,0.7)">
            {DISCLAIMER_TEXT}
          </Text>
        </Group>
      )}
    </div>
  );
}
