import { useEffect, useMemo, useRef, useState } from 'react';
import { Group, Stack, Text, Button, Switch } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { setupObsWizardLogos } from '../core/api/providers/obs';
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
const OVERLAY_STATE_API = '/api/overlays/star-citizen/state';
const STAR_CITIZEN_LEFT_LOGO = '/assets/images/star-citizen/starcitizen-logo-white.png';
const STAR_CITIZEN_RIGHT_LOGO = '/assets/images/star-citizen/MadeByTheCommunity_White.png';

function asAbsoluteAssetSource(source = '') {
  if (!source) return '';
  if (/^(https?:|blob:|data:|file:)/i.test(source)) return source;
  if (source.startsWith('/')) return source;
  return `/${source}`;
}

function normalizeMediaSource(source = '') {
  return String(source || '').trim().toLowerCase();
}

function findPlaylistIndexBySelection(items, selection = {}, fallbackIndex = 0) {
  const playlist = Array.isArray(items) ? items : [];
  if (!playlist.length) return 0;

  const wantedId = String(selection?.id || '').trim();
  if (wantedId) {
    const byId = playlist.findIndex((item) => String(item?.id || '').trim() === wantedId);
    if (byId >= 0) return byId;
  }

  const wantedSource = normalizeMediaSource(selection?.source || '');
  if (wantedSource) {
    const bySource = playlist.findIndex((item) => normalizeMediaSource(item?.source || '') === wantedSource);
    if (bySource >= 0) return bySource;
  }

  const numericFallback = Number.isFinite(fallbackIndex) ? Number(fallbackIndex) : Number(selection?.index);
  if (Number.isFinite(numericFallback)) {
    const max = playlist.length - 1;
    return Math.max(0, Math.min(Math.trunc(numericFallback), max));
  }

  return 0;
}

function reconcileLivePlaylist(prev, incoming) {
  const nextItems = Array.isArray(incoming) ? incoming : [];
  if (nextItems.length === 0) {
    return prev;
  }

  const previous = Array.isArray(prev) ? prev : [];
  const hasFallbackOnly = previous.length > 0 && previous.every((item) => String(item?.id || '').startsWith('sc-fallback-'));
  if (hasFallbackOnly) {
    return nextItems;
  }

  const seen = new Set(previous.map((item) => `${String(item?.id || '').trim()}|${String(item?.source || '').trim()}`));
  const additions = nextItems.filter((item) => {
    const key = `${String(item?.id || '').trim()}|${String(item?.source || '').trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (additions.length === 0) {
    return previous;
  }

  return [...previous, ...additions];
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

export default function OverlaysStarCitizenQuickPlayoutPage({
  defaultOutputMode = 'overlay',
  defaultMediaFitMode = 'contain',
  lockVisibilityToggles = false,
  lockStageMode = false,
  sourceCaptureMode = false,
  defaultCanvasWidth = 1920,
  defaultCanvasHeight = 1080,
} = {}) {
  const template = useMemo(() => getQuickPlayoutTemplate(TEMPLATE_ID), []);
  const templatePlaylist = template.playlist || [];
  const params = useMemo(() => new URLSearchParams(window.location.search || ''), []);
  const autoStart = useMemo(() => {
    return params.get('autostart') === '1';
  }, [params]);
  const windowLabel = useMemo(() => {
    const raw = String(params.get('windowLabel') || '').trim();
    return raw || 'Program Output';
  }, [params]);
  const windowId = useMemo(() => {
    const raw = String(params.get('windowId') || '').trim();
    return raw || 'main';
  }, [params]);
  const initialStageMode = useMemo(() => {
    const mode = params.get('stage');
    return mode === 'fixed16x9' ? 'fixed16x9' : 'fit';
  }, [params]);
  const lockViewportTo1920x1080 = useMemo(() => {
    return params.get('viewport') === '1920x1080';
  }, [params]);
  const outputMode = useMemo(() => {
    const raw = String(params.get('output') || '').trim().toLowerCase();
    if (raw === 'clean' || raw === 'source' || raw === 'overlay') {
      return raw;
    }
    return defaultOutputMode;
  }, [defaultOutputMode, params]);
  const mediaFitMode = useMemo(() => {
    const raw = String(params.get('mediaFit') || '').trim().toLowerCase();
    if (raw === 'cover' || raw === 'contain') {
      return raw;
    }
    return defaultMediaFitMode;
  }, [defaultMediaFitMode, params]);
  const forceMute = useMemo(() => params.get('mute') === '1', [params]);
  const isCleanOutput = outputMode === 'clean';
  const visibilityLockedByOutput = lockVisibilityToggles || isCleanOutput;
  const designCanvasWidth = useMemo(() => {
    const parsed = Number(params.get('canvasWidth'));
    if (Number.isFinite(parsed) && parsed >= 320) return Math.round(parsed);
    return Math.max(320, Number(defaultCanvasWidth) || 1920);
  }, [defaultCanvasWidth, params]);
  const designCanvasHeight = useMemo(() => {
    const parsed = Number(params.get('canvasHeight'));
    if (Number.isFinite(parsed) && parsed >= 180) return Math.round(parsed);
    return Math.max(180, Number(defaultCanvasHeight) || 1080);
  }, [defaultCanvasHeight, params]);
  const [viewportSize, setViewportSize] = useState({
    width: Number(window.innerWidth || 0),
    height: Number(window.innerHeight || 0),
  });
  const designCanvasScale = sourceCaptureMode
    ? Math.min(
      Math.max(0.01, viewportSize.width / designCanvasWidth),
      Math.max(0.01, viewportSize.height / designCanvasHeight)
    )
    : 1;

  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(autoStart);
  const [isLooping, setIsLooping] = useState(true);
  const [stageMode, setStageMode] = useState(initialStageMode);
  const [closeGuardEnabled, setCloseGuardEnabled] = useState(true);
  const [fullscreenHintVisible, setFullscreenHintVisible] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [elementVisibility, setElementVisibility] = useState({
    header: !isCleanOutput,
    hint: !isCleanOutput,
    disclaimer: !isCleanOutput,
  });
  const [playlist, setPlaylist] = useState(templatePlaylist);
  const [useObsLogos, setUseObsLogos] = useState(false);
  const [obsConnectionSettings] = useState({ host: '127.0.0.1', port: 4455, password: '', sceneName: 'StreamerOps Wizard 1B Test' });
  const [logoSetupLoading, setLogoSetupLoading] = useState(false);

  const videoRef = useRef(null);
  const timerRef = useRef(null);
  const sourceBlobUrlRef = useRef('');
  // SYNC SYSTEM: Refs maintain state across renders without triggering re-renders.
  // processedCommandIdsRef prevents duplicate command execution within a session.
  // We track a rolling set of ~400 recent commandIds; when new commands arrive,
  // we check if we've already executed this commandId (within same window context).
  // This prevents the same click from playing twice if polling receives the same event twice.
  // See: executeIncomingCommand() for deduplication logic.
  const processedCommandIdsRef = useRef(new Set());
  
  // lastControlSeqRef tracks the last event sequence number we've processed.
  // When polling the relay API, we fetch: GET ?after=<lastSeq> to get only new events.
  // This ensures we don't re-execute old commands and keeps bandwidth low.
  // The backend returns only events with seq > parameter, max 50 events per poll.
  const lastControlSeqRef = useRef(0);
  const latestSnapshotRef = useRef(null);
  const lastSnapshotAppliedAtRef = useRef('');
  const currentSelectionRef = useRef({ id: '', source: '' });

  const current = playlist[index] || null;
  const currentHeaderTitle = String(current?.title || '').trim() || 'Awaiting Next Media Item';
  const fallbackCurrentSource = asAbsoluteAssetSource(current?.source || '');
  const [resolvedCurrentSource, setResolvedCurrentSource] = useState(fallbackCurrentSource);
  const layoutReservedPx = visibilityLockedByOutput
    ? 0
    : (elementVisibility.header ? 72 : 0) + (elementVisibility.disclaimer ? 44 : 0) + 32;
  const stageMaxHeight = sourceCaptureMode
    ? `calc(${designCanvasHeight}px - ${layoutReservedPx}px)`
    : `calc(100vh - ${layoutReservedPx}px)`;
  const fixedStageWidth = `min(94vw, 1720px, calc(${stageMaxHeight} * 16 / 9))`;
  const mediaObjectFit = mediaFitMode === 'cover' ? 'cover' : 'contain';

  useEffect(() => {
    currentSelectionRef.current = {
      id: String(current?.id || '').trim(),
      source: String(current?.source || '').trim(),
    };
  }, [current?.id, current?.source]);

  const applySnapshot = (snapshot, updatedAt = '') => {
    if (!snapshot || typeof snapshot !== 'object') {
      return;
    }

    latestSnapshotRef.current = snapshot;
    if (updatedAt) {
      lastSnapshotAppliedAtRef.current = updatedAt;
    }

    const nextIndex = findPlaylistIndexBySelection(
      playlist,
      {
        id: snapshot.currentId,
        source: snapshot.currentSource,
        index: snapshot.index,
      },
      snapshot.index
    );
    setIndex(nextIndex);

    if (typeof snapshot.isPlaying === 'boolean') {
      setIsPlaying(snapshot.isPlaying);
    }

    if (typeof snapshot.isLooping === 'boolean') {
      setIsLooping(snapshot.isLooping);
    }

    if (typeof snapshot.closeGuardEnabled === 'boolean') {
      setCloseGuardEnabled(snapshot.closeGuardEnabled);
    }

    if (!lockStageMode && (snapshot.stageMode === 'fixed16x9' || snapshot.stageMode === 'fit')) {
      setStageMode(snapshot.stageMode);
    }

    if (!visibilityLockedByOutput && snapshot.elementVisibility && typeof snapshot.elementVisibility === 'object') {
      setElementVisibility((prev) => ({
        ...prev,
        header: Boolean(snapshot.elementVisibility.header),
        hint: Boolean(snapshot.elementVisibility.hint),
        disclaimer: Boolean(snapshot.elementVisibility.disclaimer),
      }));
    }
  };

  useEffect(() => {
    if (!sourceCaptureMode) return undefined;

    const onResize = () => {
      setViewportSize({
        width: Number(window.innerWidth || 0),
        height: Number(window.innerHeight || 0),
      });
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [sourceCaptureMode]);

  useEffect(() => {
    if (!isCleanOutput) return;
    setElementVisibility({ header: false, hint: false, disclaimer: false });
  }, [isCleanOutput]);

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
        setIndex((prev) => findPlaylistIndexBySelection(items, currentSelectionRef.current, prev));
      } catch {
        // Keep template playlist if live library is unavailable.
      }
    }

    hydrateLivePlaylist();
    const timer = setInterval(hydrateLivePlaylist, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let active = true;

    const syncFromSnapshot = async () => {
      try {
        const response = await fetch(OVERLAY_STATE_API, { cache: 'no-store' });
        if (!response.ok) {
          return;
        }

        const data = await response.json();
        if (!active) {
          return;
        }

        const updatedAt = String(data?.updatedAt || '');
        if (!data?.snapshot || !updatedAt || updatedAt === lastSnapshotAppliedAtRef.current) {
          return;
        }

        applySnapshot(data.snapshot, updatedAt);
      } catch {
        // Snapshot sync is best-effort. Relay polling remains the primary live transport.
      }
    };

    syncFromSnapshot();
    const timer = setInterval(syncFromSnapshot, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [lockStageMode, playlist.length, visibilityLockedByOutput]);
  // SNAPSHOT RECONCILIATION: Command polling handles live control, but it is not enough
  // to recover after a page refresh or a missed burst of commands. The remote-control page
  // publishes its current authoritative state, and each playout/source-capture window
  // periodically reconciles to that state. This gives us eventual consistency even when the
  // browser source is reloaded or wakes up after timer throttling.

  useEffect(() => {
    if (!latestSnapshotRef.current) {
      return;
    }

    if (playlist.length <= 0) {
      return;
    }

    const snapshot = latestSnapshotRef.current || {};
    setIndex((prev) => findPlaylistIndexBySelection(
      playlist,
      {
        id: snapshot.currentId,
        source: snapshot.currentSource,
        index: snapshot.index,
      },
      prev
    ));
  }, [playlist.length]);

  useEffect(() => {
    const priorTitle = document.title;
    const nextTitle = `StreamerOps - Star Citizen Playout [${windowLabel}]`;
    document.title = nextTitle;

    try {
      window.name = `StreamerOps::StarCitizenPlayout::${windowId}`;
    } catch {
      // window.name assignment should be safe; ignore if blocked.
    }

    document.documentElement.setAttribute('data-window-role', 'star-citizen-playout');
    document.documentElement.setAttribute('data-window-id', windowId);

    return () => {
      document.title = priorTitle;
      document.documentElement.removeAttribute('data-window-role');
      document.documentElement.removeAttribute('data-window-id');
    };
  }, [windowId, windowLabel]);

  useEffect(() => {
    if (!playlist.length) {
      if (index !== 0) setIndex(0);
      return;
    }

    if (index > playlist.length - 1) {
      setIndex(playlist.length - 1);
    }
  }, [playlist, index]);

  useEffect(() => {
    if (!lockViewportTo1920x1080) {
      return undefined;
    }

    let cancelled = false;

    const fitViewport = (attempt = 0) => {
      if (cancelled) return;

      const targetW = 1920;
      const targetH = 1080;
      const innerW = Number(window.innerWidth || 0);
      const innerH = Number(window.innerHeight || 0);

      if (Math.abs(innerW - targetW) <= 1 && Math.abs(innerH - targetH) <= 1) {
        return;
      }

      const frameW = Math.max(0, Number(window.outerWidth || 0) - innerW);
      const frameH = Math.max(0, Number(window.outerHeight || 0) - innerH);
      const desiredOuterW = targetW + frameW;
      const desiredOuterH = targetH + frameH;

      try {
        window.resizeTo(desiredOuterW, desiredOuterH);
      } catch {
        return;
      }

      if (attempt < 6) {
        window.setTimeout(() => fitViewport(attempt + 1), 120);
      }
    };

    fitViewport();
    return () => {
      cancelled = true;
    };
  }, [lockViewportTo1920x1080]);

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
        goTo(findPlaylistIndexBySelection(playlist, payload, payload?.index));
        break;
      case 'set-visibility':
        if (visibilityLockedByOutput) {
          break;
        }
        if (payload?.element && VISIBILITY_KEYS.includes(payload.element)) {
          const nextVisible = Boolean(payload.visible);
          setElementVisibility((prev) => ({ ...prev, [payload.element]: nextVisible }));
        }
        break;
      case 'set-stage-mode':
        if (lockStageMode) {
          break;
        }
        if (payload?.mode === 'fixed16x9' || payload?.mode === 'fit') {
          setStageMode(payload.mode);
        }
        break;
      case 'toggle-stage-mode':
        if (lockStageMode) {
          break;
        }
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
    // DEDUPLICATION: Check if we've already processed this command.
    // This prevents a single operator click from advancing the playout twice
    // if the relay API returns the same event in multiple polls.
    // Note: BroadcastChannel messages also go through here, so same check applies.
    const commandId = String(incoming.commandId || '').trim();
    if (commandId) {
      if (processedCommandIdsRef.current.has(commandId)) {
        return;
      }
      processedCommandIdsRef.current.add(commandId);
      // Keep only the 250 most recent command IDs to avoid memory bloat.
      // If a command is somehow resent after 400 older commands, it will execute again.
      // This is acceptable because: (1) relay bus only keeps 200 events anyway,
      // and (2) commands are sent with sequence numbers, so relay won't resend old ones.
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
  // BroadcastChannel Fallback: Allows same-browser-context sync (e.g., if relay is down).
  // When remote control sends a command, it broadcasts on this channel immediately
  // so the playout page gets instant feedback even before relay API processes it.
  // If relay is unavailable, this is the only way sync works—commands still execute locally.

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
        // Silently continue: BroadcastChannel provides local fallback if relay is down.
      }
    };
    poll();
    const timer = setInterval(poll, 500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  // POLLING EFFECT: The heart of the sync system.
  // Why empty dependency array? To avoid restarting the timer on state changes.
  // Previously: [index, isPlaying, ...] caused the timer to restart every state update,
  // constantly clearing and re-creating the interval, which missed commands.
  // Now: [] = set up once on mount, poll continuously every 500ms independently of state.
  // 
  // Poll Strategy: GET /api/overlays/star-citizen/control?after=<lastSeq>
  // Returns only events with seq > lastSeq (default: 0), max 50 events per response.
  // Relay bus maintains ~200 events in memory with sequence numbers.
  // 
  // Flow: Remote operator clicks Next → sends POST to relay → relay stores event with new seq
  //       → next poll sees seq > lastSeq → receives event → executeIncomingCommand()
  //       → checks if commandId already processed (dedup) → calls executeCommand()
  //       → state updates (setIndex, setIsPlaying, etc.) → re-render with new index
  //       → Streamlabs browser source sees new video/image on stream.

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

    // Keep retrying unmute while live playback is running so browser-source output
    // can recover audio without requiring manual interaction overlays.
    const retryTimer = window.setInterval(tryUnmute, 1500);

    return () => {
      window.clearInterval(retryTimer);
      window.removeEventListener('pointerdown', tryUnmute);
      window.removeEventListener('keydown', tryUnmute);
    };
  }, [audioBlocked, forceMute, isPlaying, index]);

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
      data-source-capture-root={sourceCaptureMode ? 'true' : 'false'}
      style={sourceCaptureMode
        ? {
          width: '100vw',
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
          background: '#040b16',
        }
        : {
          width: '100vw',
          minHeight: '100vh',
          background: template.theme.background,
          color: '#d8f3ff',
          display: 'grid',
        }}
    >
      <div
        data-source-capture-canvas={sourceCaptureMode ? 'true' : 'false'}
        style={sourceCaptureMode
          ? {
            width: `${designCanvasWidth}px`,
            height: `${designCanvasHeight}px`,
            transform: `scale(${designCanvasScale})`,
            transformOrigin: 'center center',
            overflow: 'hidden',
            background: template.theme.background,
            color: '#d8f3ff',
            display: 'grid',
            gridTemplateRows: elementVisibility.header ? 'auto 1fr auto' : '1fr auto',
          }
          : {
            width: '100%',
            minHeight: '100vh',
            background: template.theme.background,
            color: '#d8f3ff',
            display: 'grid',
            gridTemplateRows: elementVisibility.header ? 'auto 1fr auto' : '1fr auto',
          }}
      >
      {outputMode !== 'clean' && elementVisibility.header && (
        <div style={{ borderBottom: `1px solid ${template.theme.border}`, padding: '10px 16px', position: 'relative' }}>
          {!useObsLogos && (
            <div style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
              <img
                src={STAR_CITIZEN_LEFT_LOGO}
                alt="Star Citizen"
                style={{ maxHeight: 64, width: 'auto', opacity: 0.92 }}
              />
            </div>
          )}
          <Stack gap={1} align="center" style={{ minHeight: 34, justifyContent: 'center' }}>
            <Text fw={800} style={{ letterSpacing: '0.08em', textTransform: 'uppercase' }}>Community Broadcast</Text>
            <Text
              size="sm"
              c="rgba(216,243,255,0.82)"
              style={{ maxWidth: '70vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {currentHeaderTitle}
            </Text>
          </Stack>

          {!useObsLogos && (
            <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
              <img
                src={STAR_CITIZEN_RIGHT_LOGO}
                alt="Made By The Community"
                style={{ maxHeight: 64, width: 'auto', opacity: 0.92 }}
              />
            </div>
          )}
        </div>
      )}

      <div
        style={{
          padding: isCleanOutput ? 0 : 16,
          display: 'grid',
          minHeight: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: stageMode === 'fixed16x9'
                ? (isCleanOutput ? (sourceCaptureMode ? `${designCanvasWidth}px` : '100vw') : fixedStageWidth)
                : '100%',
              height: stageMode === 'fixed16x9'
                ? (isCleanOutput ? (sourceCaptureMode ? `${designCanvasHeight}px` : '100vh') : 'auto')
                : `min(100%, ${stageMaxHeight})`,
              maxHeight: stageMaxHeight,
              minHeight: 0,
              aspectRatio: stageMode === 'fixed16x9' && !isCleanOutput ? '16 / 9' : undefined,
              border: isCleanOutput ? 'none' : `1px solid ${template.theme.border}`,
              background: 'rgba(0, 0, 0, 0.7)',
              borderRadius: (isCleanOutput || sourceCaptureMode) ? 0 : 10,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
          {current?.type === 'video' ? (
            <video
              ref={videoRef}
              src={resolvedCurrentSource}
              style={{ width: '100%', height: '100%', objectFit: mediaObjectFit, background: '#000' }}
              muted={forceMute}
              playsInline
              onEnded={goNext}
            />
          ) : current?.type === 'image' ? (
            <img
              src={resolvedCurrentSource}
              alt={current?.title || 'Playlist image'}
              style={{ width: '100%', height: '100%', objectFit: mediaObjectFit, background: '#000' }}
            />
          ) : (
            <Group justify="center" align="center" style={{ height: '100%' }}>
              <Text c="gray.5">No media configured for this template.</Text>
            </Group>
          )}

          </div>
        </div>
      </div>

      {outputMode !== 'clean' && elementVisibility.disclaimer && (
        <Group justify="center" px="lg" py="sm" style={{ borderTop: `1px solid ${template.theme.border}` }}>
          <Text size="xs" ta="center" c="rgba(216,243,255,0.7)">
            {DISCLAIMER_TEXT}
          </Text>
        </Group>
      )}

      {outputMode !== 'clean' && (
        <div style={{
          position: 'fixed',
          top: 16,
          right: 16,
          background: 'rgba(0, 0, 0, 0.8)',
          border: '1px solid rgba(216, 243, 255, 0.3)',
          borderRadius: 8,
          padding: 12,
          backdropFilter: 'blur(8px)',
          zIndex: 9999,
          minWidth: 200,
        }}>
          <Stack gap={8}>
            <Text size="xs" c="rgba(216, 243, 255, 0.8)" fw={600}>Logo Mode</Text>
            <Switch
              label="Use OBS Logos"
              checked={useObsLogos}
              onChange={(e) => setUseObsLogos(e.currentTarget.checked)}
              size="sm"
              description={useObsLogos ? 'Showing OBS-managed' : 'Showing HTML'}
            />
            {useObsLogos && (
              <Button
                size="xs"
                variant="light"
                loading={logoSetupLoading}
                onClick={async () => {
                  setLogoSetupLoading(true);
                  try {
                    const result = await setupObsWizardLogos({
                      ...obsConnectionSettings,
                      sceneIndex: null,
                    });
                    if (result?.success) {
                      notifications.show({
                        title: 'Success',
                        message: `Logo sources created in scene: ${result.sceneName}`,
                        color: 'teal',
                        autoClose: 3000,
                      });
                    } else {
                      notifications.show({
                        title: 'Setup Failed',
                        message: result?.error || 'Unknown error occurred',
                        color: 'red',
                        autoClose: 4000,
                      });
                      console.error('Logo setup error:', result);
                    }
                  } catch (err) {
                    const errorMsg = err?.message || String(err);
                    notifications.show({
                      title: 'Error',
                      message: errorMsg,
                      color: 'red',
                      autoClose: 5000,
                    });
                    console.error('Failed to setup OBS logos:', err);
                  } finally {
                    setLogoSetupLoading(false);
                  }
                }}
              >
                Setup OBS Logos
              </Button>
            )}
          </Stack>
        </div>
      )}
      </div>
    </div>
  );
}

