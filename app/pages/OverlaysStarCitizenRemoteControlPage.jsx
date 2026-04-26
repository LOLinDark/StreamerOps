import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import {
  getQuickPlayoutTemplate,
  QUICK_PLAYOUT_CONTROL_CHANNEL,
} from '../overlays/quickPlayoutTemplates';
import { getHelpTips } from '../data/helpTips';
import { useRotatingTips } from '../hooks/useRotatingTips';

const TEMPLATE_ID = 'star-citizen-core-v1';
const DISCLAIMER_TEXT = 'Star Citizen, Roberts Space Industries©️(RSI) and Cloud Imperium ©️are registered trademarks of Cloud Imperium Rights LLC';
const PRESET_STORAGE_KEY = 'streamerops.quickPlayout.remotePresets.v1';
const LAST_PRESET_STORAGE_KEY = 'streamerops.quickPlayout.lastPreset.v1';
const MONITOR_MUTE_STORAGE_KEY = 'streamerops.quickPlayout.remoteMonitorMuted.v1';
const VISIBILITY_KEYS = ['header', 'hint', 'disclaimer'];
const OVERLAY_CONTROL_API = '/api/overlays/star-citizen/control';
const OVERLAY_STATE_API = '/api/overlays/star-citizen/state';
const STAR_CITIZEN_LEFT_LOGO = '/assets/images/star-citizen/starcitizen-logo-white.png';
const STAR_CITIZEN_RIGHT_LOGO = '/assets/images/star-citizen/MadeByTheCommunity_White.png';
const SYNC_STALE_MS = 6000;
const DEFAULT_PRESETS = [
  {
    name: 'Broadcast',
    elementVisibility: { header: true, hint: false, disclaimer: true },
    stageMode: 'fit',
  },
  {
    name: 'Cinematic',
    elementVisibility: { header: false, hint: false, disclaimer: true },
    stageMode: 'fixed16x9',
  },
  {
    name: 'Minimal',
    elementVisibility: { header: false, hint: false, disclaimer: false },
    stageMode: 'fixed16x9',
  },
];

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

function generateCommandId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function postControl(command, payload = {}, senderId = '') {
  const message = {
    target: TEMPLATE_ID,
    command,
    payload,
    commandId: generateCommandId(),
    senderId,
    sentAt: new Date().toISOString(),
  };

  try {
    const channel = new BroadcastChannel(QUICK_PLAYOUT_CONTROL_CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {
    // BroadcastChannel may be unavailable in some contexts.
  }

  fetch(OVERLAY_CONTROL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
    keepalive: true,
  }).catch(() => {
    // Backend relay is best-effort.
  });
}

function publishStateSnapshot(snapshot) {
  fetch(OVERLAY_STATE_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      target: TEMPLATE_ID,
      snapshot,
    }),
    keepalive: true,
  }).catch(() => {
    // Snapshot publishing is best-effort; command relay remains primary.
  });
}

function loadSavedPresets() {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY);
    if (!raw) return DEFAULT_PRESETS;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_PRESETS;

    const validPresets = parsed.filter((preset) => preset && typeof preset.name === 'string');
    const merged = [...DEFAULT_PRESETS];

    validPresets.forEach((preset) => {
      const existingIndex = merged.findIndex((entry) => entry.name.toLowerCase() === preset.name.toLowerCase());
      if (existingIndex >= 0) {
        merged[existingIndex] = preset;
      } else {
        merged.push(preset);
      }
    });

    return merged;
  } catch {
    return DEFAULT_PRESETS;
  }
}

function savePresetsToStorage(presets) {
  localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presets));
}

function loadLastPresetName() {
  return localStorage.getItem(LAST_PRESET_STORAGE_KEY) || 'Broadcast';
}

function saveLastPresetName(name) {
  localStorage.setItem(LAST_PRESET_STORAGE_KEY, name);
}

function loadMonitorMutedPreference() {
  try {
    return localStorage.getItem(MONITOR_MUTE_STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

function saveMonitorMutedPreference(next) {
  localStorage.setItem(MONITOR_MUTE_STORAGE_KEY, next ? '1' : '0');
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

function formatAgeLabel(timestampMs) {
  const value = Number(timestampMs) || 0;
  if (!value) return 'never';
  const ageSec = Math.max(0, Math.round((Date.now() - value) / 1000));
  return `${ageSec}s ago`;
}

function isVisibilityEqual(left, right) {
  return Boolean(left?.header) === Boolean(right?.header)
    && Boolean(left?.hint) === Boolean(right?.hint)
    && Boolean(left?.disclaimer) === Boolean(right?.disclaimer);
}

export default function OverlaysStarCitizenRemoteControlPage() {
  const template = useMemo(() => getQuickPlayoutTemplate(TEMPLATE_ID), []);
  const templatePlaylist = template.playlist || [];

  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(true);
  const [stageMode, setStageMode] = useState('fit');
  const [closeGuardEnabled, setCloseGuardEnabled] = useState(true);
  const [controlsLocked, setControlsLocked] = useState(false);
  const [fullscreenHintVisible, setFullscreenHintVisible] = useState(true);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [monitorMuted, setMonitorMuted] = useState(loadMonitorMutedPreference);
  const [elementVisibility, setElementVisibility] = useState({
    header: true,
    hint: true,
    disclaimer: true,
  });
  const [playlist, setPlaylist] = useState(templatePlaylist);
  const [presets, setPresets] = useState(loadSavedPresets);
  const [selectedPresetName, setSelectedPresetName] = useState(loadLastPresetName);
  const [newPresetName, setNewPresetName] = useState('My Preset');
  const [diagnostics, setDiagnostics] = useState({
    lastSnapshotPublishAt: 0,
    stateReachable: false,
    stateLastSeenAt: 0,
    snapshotUpdatedAtMs: 0,
    snapshotMatchesRemote: false,
    relayReachable: false,
    relayLastSeenAt: 0,
    relayLastSeq: 0,
    lastDiagnosticsError: '',
  });
  const { currentTip } = useRotatingTips(getHelpTips('overlaysRemote'), 10000);

  const videoRef = useRef(null);
  const timerRef = useRef(null);
  const senderIdRef = useRef(`remote-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`);
  const currentSelectionRef = useRef({ id: '', source: '' });

  const current = playlist[index] || null;
  const currentHeaderTitle = String(current?.title || '').trim() || 'Awaiting Next Media Item';
  const currentSource = asAbsoluteAssetSource(current?.source || '');

  useEffect(() => {
    currentSelectionRef.current = {
      id: String(current?.id || '').trim(),
      source: String(current?.source || '').trim(),
    };
  }, [current?.id, current?.source]);

  // Remote control is the authoritative operator surface. In addition to sending
  // transient commands, it publishes a durable snapshot so source-capture can
  // recover after refreshes, missed polls, or a Streamlabs browser-source reload.
  useEffect(() => {
    const publishedAt = Date.now();
    setDiagnostics((prev) => ({ ...prev, lastSnapshotPublishAt: publishedAt }));
    publishStateSnapshot({
      index,
      isPlaying,
      isLooping,
      stageMode,
      closeGuardEnabled,
      elementVisibility,
      playlistLength: playlist.length,
      currentId: String(current?.id || ''),
      currentSource: String(current?.source || ''),
      sentAt: new Date(publishedAt).toISOString(),
    });
  }, [
    closeGuardEnabled,
    current?.id,
    current?.source,
    elementVisibility,
    index,
    isLooping,
    isPlaying,
    playlist.length,
    stageMode,
  ]);

  useEffect(() => {
    let active = true;

    const pollDiagnostics = async () => {
      let stateUpdate = {};
      let relayUpdate = {};

      try {
        const response = await fetch(OVERLAY_STATE_API, { cache: 'no-store' });
        if (response.ok) {
          const payload = await response.json();
          const snapshot = payload?.snapshot && typeof payload.snapshot === 'object' ? payload.snapshot : null;
          const updatedAtMs = Date.parse(String(payload?.updatedAt || ''));
          const currentId = String(current?.id || '').trim();
          const currentSource = normalizeMediaSource(current?.source || '');

          const snapshotMatchesRemote = Boolean(snapshot) && (
            Number(snapshot?.index) === Number(index)
            && Boolean(snapshot?.isPlaying) === Boolean(isPlaying)
            && Boolean(snapshot?.isLooping) === Boolean(isLooping)
            && String(snapshot?.stageMode || '') === String(stageMode)
            && isVisibilityEqual(snapshot?.elementVisibility, elementVisibility)
            && String(snapshot?.currentId || '').trim() === currentId
            && normalizeMediaSource(snapshot?.currentSource || '') === currentSource
          );

          stateUpdate = {
            stateReachable: true,
            stateLastSeenAt: Date.now(),
            snapshotUpdatedAtMs: Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
            snapshotMatchesRemote,
            lastDiagnosticsError: '',
          };
        } else {
          stateUpdate = {
            stateReachable: false,
            lastDiagnosticsError: `state api status ${response.status}`,
          };
        }
      } catch {
        stateUpdate = {
          stateReachable: false,
          lastDiagnosticsError: 'state api unreachable',
        };
      }

      try {
        const response = await fetch(`${OVERLAY_CONTROL_API}?after=0`, { cache: 'no-store' });
        if (response.ok) {
          const payload = await response.json();
          const events = Array.isArray(payload?.events) ? payload.events : [];
          const relayLastSeq = events.reduce((max, entry) => {
            const seq = Number(entry?.seq) || 0;
            return seq > max ? seq : max;
          }, 0);

          relayUpdate = {
            relayReachable: true,
            relayLastSeenAt: Date.now(),
            relayLastSeq,
          };
        } else {
          relayUpdate = {
            relayReachable: false,
          };
        }
      } catch {
        relayUpdate = {
          relayReachable: false,
        };
      }

      if (!active) return;
      setDiagnostics((prev) => ({
        ...prev,
        ...stateUpdate,
        ...relayUpdate,
      }));
    };

    pollDiagnostics();
    const timer = setInterval(pollDiagnostics, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [
    current?.id,
    current?.source,
    elementVisibility,
    index,
    isLooping,
    isPlaying,
    stageMode,
  ]);

  const stateFresh = diagnostics.snapshotUpdatedAtMs > 0
    ? (Date.now() - diagnostics.snapshotUpdatedAtMs) <= SYNC_STALE_MS
    : false;
  const relayFresh = diagnostics.relayLastSeenAt > 0
    ? (Date.now() - diagnostics.relayLastSeenAt) <= SYNC_STALE_MS
    : false;
  const inferredWindowConvergence = diagnostics.snapshotMatchesRemote && stateFresh && relayFresh;

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
    if (!playlist.length) {
      if (index !== 0) setIndex(0);
      return;
    }

    if (index > playlist.length - 1) {
      setIndex(playlist.length - 1);
    }
  }, [playlist, index]);

  const clearItemTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const goTo = (nextIndex, shouldBroadcast = true) => {
    if (!playlist.length) return;
    const max = playlist.length - 1;
    const clamped = Math.max(0, Math.min(nextIndex, max));
    setIndex(clamped);
    if (shouldBroadcast) {
      const selected = playlist[clamped] || null;
      postControl('goto', {
        index: clamped,
        id: String(selected?.id || ''),
        source: String(selected?.source || ''),
      }, senderIdRef.current);
    }
  };

  const goNext = (shouldBroadcast = true) => {
    if (!playlist.length) return;

    if (index < playlist.length - 1) {
      const nextIndex = index + 1;
      setIndex(nextIndex);
      if (shouldBroadcast) {
        postControl('next', {}, senderIdRef.current);
      }
      return;
    }

    if (isLooping) {
      setIndex(0);
      if (shouldBroadcast) {
        postControl('next', {}, senderIdRef.current);
      }
      return;
    }

    setIsPlaying(false);
    if (shouldBroadcast) {
      postControl('pause', {}, senderIdRef.current);
    }
  };

  const goPrev = (shouldBroadcast = true) => {
    if (!playlist.length) return;
    if (index > 0) {
      const nextIndex = index - 1;
      setIndex(nextIndex);
      if (shouldBroadcast) {
        postControl('prev', {}, senderIdRef.current);
      }
      return;
    }
    if (isLooping) {
      const nextIndex = playlist.length - 1;
      setIndex(nextIndex);
      if (shouldBroadcast) {
        postControl('prev', {}, senderIdRef.current);
      }
    }
  };

  const setPlaying = (next, shouldBroadcast = true) => {
    if (controlsLocked) return;
    setIsPlaying(next);
    if (shouldBroadcast) {
      postControl(next ? 'play' : 'pause', {}, senderIdRef.current);
    }
  };

  const restart = (shouldBroadcast = true) => {
    if (controlsLocked) return;
    setIndex(0);
    setIsPlaying(true);
    if (shouldBroadcast) {
      postControl('restart', {}, senderIdRef.current);
    }
  };

  const stop = (shouldBroadcast = true) => {
    if (controlsLocked) return;
    setIsPlaying(false);
    setIndex(0);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    if (shouldBroadcast) {
      postControl('stop', {}, senderIdRef.current);
    }
  };

  const setLoop = (next, shouldBroadcast = true) => {
    if (controlsLocked) return;
    setIsLooping(next);
    if (shouldBroadcast) {
      postControl(next ? 'loop-on' : 'loop-off', {}, senderIdRef.current);
    }
  };

  const toggleElement = (element) => {
    if (controlsLocked) return;
    if (!Object.prototype.hasOwnProperty.call(elementVisibility, element)) {
      return;
    }

    setElementVisibility((prev) => {
      const nextVisible = !prev[element];
      postControl('set-visibility', { element, visible: nextVisible }, senderIdRef.current);
      return { ...prev, [element]: nextVisible };
    });
  };

  const setStage = (nextMode) => {
    if (controlsLocked) return;
    const normalized = nextMode === 'fixed16x9' ? 'fixed16x9' : 'fit';
    setStageMode(normalized);
    postControl('set-stage-mode', { mode: normalized }, senderIdRef.current);
  };

  const applyPreset = (presetName) => {
    if (controlsLocked) return;
    const preset = presets.find((item) => item.name === presetName);
    if (!preset) {
      return;
    }

    const nextVisibility = {
      header: Boolean(preset.elementVisibility?.header),
      hint: Boolean(preset.elementVisibility?.hint),
      disclaimer: Boolean(preset.elementVisibility?.disclaimer),
    };

    setElementVisibility(nextVisibility);
    VISIBILITY_KEYS.forEach((key) => {
      postControl('set-visibility', { element: key, visible: nextVisibility[key] }, senderIdRef.current);
    });

    setStage(preset.stageMode || 'fit');
    setSelectedPresetName(presetName);
    saveLastPresetName(presetName);
  };

  const saveCurrentAsPreset = () => {
    if (controlsLocked) return;
    const trimmed = newPresetName.trim();
    if (!trimmed) {
      return;
    }

    const preset = {
      name: trimmed,
      elementVisibility: { ...elementVisibility },
      stageMode,
    };

    setPresets((prev) => {
      const next = [...prev];
      const indexFound = next.findIndex((item) => item.name.toLowerCase() === trimmed.toLowerCase());
      if (indexFound >= 0) {
        next[indexFound] = preset;
      } else {
        next.push(preset);
      }
      savePresetsToStorage(next);
      return next;
    });

    setSelectedPresetName(trimmed);
    saveLastPresetName(trimmed);
  };

  const deleteSelectedPreset = () => {
    if (controlsLocked) return;
    if (!selectedPresetName) {
      return;
    }

    if (DEFAULT_PRESETS.some((preset) => preset.name === selectedPresetName)) {
      return;
    }

    setPresets((prev) => {
      const next = prev.filter((item) => item.name !== selectedPresetName);
      savePresetsToStorage(next);
      return next;
    });

    setSelectedPresetName('Broadcast');
    saveLastPresetName('Broadcast');
  };

  const setCloseGuard = (enabled) => {
    if (controlsLocked) return;
    const next = Boolean(enabled);
    setCloseGuardEnabled(next);
    postControl('set-close-guard', { enabled: next }, senderIdRef.current);
  };

  const toggleMonitorMuted = () => {
    setMonitorMuted((prev) => {
      const next = !prev;
      saveMonitorMutedPreference(next);
      return next;
    });
  };

  const toggleControlsLock = () => {
    if (controlsLocked) {
      const ok = window.confirm('Unlock controls for live operation changes?');
      if (!ok) return;
      setControlsLocked(false);
      return;
    }

    setControlsLocked(true);
  };

  const openPlayoutWindow = ({ autostart = true, useFixedStage = false } = {}) => {
    const params = new URLSearchParams();
    if (autostart) {
      params.set('autostart', '1');
    }
    params.set('windowLabel', 'Program Output');
    params.set('windowId', 'main');
    if (useFixedStage || stageMode === 'fixed16x9') {
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
      `resizable=${useFixedStage || stageMode === 'fixed16x9' ? 'no' : 'yes'}`,
    ].join(',');

    const target = `/overlays/window/star-citizen-playout${params.toString() ? `?${params.toString()}` : ''}`;
    window.open(
      target,
      'StarCitizenPlayoutWindow',
      popupFeatures
    );
  };

  const openSourceCaptureWindow = ({ autostart = true } = {}) => {
    const params = new URLSearchParams();
    if (autostart) {
      params.set('autostart', '1');
    }
    params.set('windowLabel', 'Source Capture');
    params.set('windowId', 'source-capture');
    params.set('stage', 'fixed16x9');
    params.set('viewport', '1920x1080');
    params.set('mediaFit', 'contain');
    params.set('canvasWidth', '1080');
    params.set('canvasHeight', '600');

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

    const target = `/overlays/window/star-citizen-source-capture?${params.toString()}`;
    window.open(
      target,
      'StarCitizenSourceCaptureWindow',
      popupFeatures
    );
  };

  useEffect(() => {
    const last = loadLastPresetName();
    const exists = presets.some((preset) => preset.name === last);
    const target = exists ? last : 'Broadcast';
    applyPreset(target);
  }, []);

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!closeGuardEnabled) {
        return;
      }

      event.preventDefault();
      event.returnValue = 'Remote close guard is enabled. Are you sure you want to close this control window?';
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [closeGuardEnabled]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === 'Space') {
        event.preventDefault();
        setPlaying(!isPlaying);
        return;
      }

      if (event.code === 'ArrowRight') {
        event.preventDefault();
        if (controlsLocked) return;
        goNext();
        return;
      }

      if (event.code === 'ArrowLeft') {
        event.preventDefault();
        if (controlsLocked) return;
        goPrev();
        return;
      }

      if (event.key.toLowerCase() === 'l') {
        event.preventDefault();
        if (controlsLocked) return;
        setLoop(!isLooping);
        return;
      }

      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        if (controlsLocked) return;
        restart();
        return;
      }

      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (controlsLocked) return;
        stop();
        return;
      }

      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        toggleControlsLock();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [index, isLooping, isPlaying, controlsLocked]);

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
      media.muted = monitorMuted;
      media.volume = 1;

      media.play().then(() => {
        setAudioBlocked(false);
      }).catch(async () => {
        if (monitorMuted) {
          setPlaying(false);
          return;
        }

        // If autoplay with audio is blocked, keep video moving muted and wait
        // for the operator's first interaction to re-enable audio.
        media.muted = true;
        try {
          await media.play();
          setAudioBlocked(true);
        } catch {
          setPlaying(false);
        }
      });
    }

    return () => clearItemTimer();
  }, [index, isPlaying, current?.id, isLooping, monitorMuted]);

  useEffect(() => {
    if (!videoRef.current) return;
    if (!isPlaying) {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!audioBlocked || monitorMuted) return undefined;

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
  }, [audioBlocked, monitorMuted]);

  useEffect(() => {
    const timer = setTimeout(() => setFullscreenHintVisible(false), 7000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      style={{
        width: '100vw',
        minHeight: '100vh',
        background: template.theme.background,
        color: '#d8f3ff',
        display: 'grid',
        gridTemplateRows: elementVisibility.header ? 'auto 1fr auto' : '1fr auto',
        position: 'relative',
      }}
    >
      {currentTip && (
        <div
          style={{
            position: 'fixed',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 70,
            maxWidth: 760,
            width: 'min(90vw, 760px)',
            border: `1px solid ${template.theme.border}`,
            borderRadius: 999,
            padding: '10px 16px',
            background: 'rgba(4, 20, 42, 0.9)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
            textAlign: 'center',
          }}
        >
          <Text size="sm" c="rgba(216,243,255,0.92)">
            {currentTip}
          </Text>
        </div>
      )}

      {elementVisibility.header && (
        <div
          style={{ borderBottom: `1px solid ${template.theme.border}`, padding: '10px 16px', position: 'relative', cursor: 'pointer' }}
          onClick={() => toggleElement('header')}
        >
          <div style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
            <img
              src={STAR_CITIZEN_LEFT_LOGO}
              alt="Star Citizen"
              style={{ maxHeight: 64, width: 'auto', opacity: 0.92 }}
            />
          </div>

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

          <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center' }}>
            <img
              src={STAR_CITIZEN_RIGHT_LOGO}
              alt="Made By The Community"
              style={{ maxHeight: 64, width: 'auto', opacity: 0.92 }}
            />
          </div>
        </div>
      )}

      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 }}>
        <div style={{ display: 'grid', gridTemplateRows: 'auto auto', gap: 12, minHeight: 0 }}>
          <div
            style={{
              width: stageMode === 'fixed16x9' ? 'min(96vw, 1720px)' : '100%',
              height: stageMode === 'fixed16x9' ? 'auto' : '100%',
              aspectRatio: stageMode === 'fixed16x9' ? '16 / 9' : undefined,
              minHeight: stageMode === 'fixed16x9' ? undefined : '68vh',
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
              src={currentSource}
              style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
              muted={audioBlocked || monitorMuted}
              playsInline
              onEnded={() => goNext()}
            />
          ) : current?.type === 'image' ? (
            <img
              src={currentSource}
              alt={current?.title || 'Playlist image'}
              style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
            />
          ) : (
            <Group justify="center" align="center" style={{ height: '100%' }}>
              <Text c="gray.5">No media configured for this template.</Text>
            </Group>
          )}

          {fullscreenHintVisible && elementVisibility.hint && (
            <div
              onClick={() => toggleElement('hint')}
              style={{
                position: 'absolute',
                right: 14,
                bottom: 14,
                padding: '8px 10px',
                borderRadius: 8,
                background: template.theme.panel,
                border: `1px solid ${template.theme.border}`,
                cursor: 'pointer',
              }}
            >
              <Text size="xs">Keys: Space Play/Pause | ←/→ Prev/Next | L Loop | R Restart | S Stop</Text>
            </div>
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

          <div
            style={{
              border: `1px solid ${template.theme.border}`,
              background: template.theme.panel,
              borderRadius: 10,
              padding: 12,
            }}
          >
            <Stack gap="sm">
              <Text fw={700} size="sm">Playlist Items</Text>
              <Text size="xs" c="rgba(216,243,255,0.75)">
                Queue order lives here. This area can also host transitional-image insert controls.
              </Text>
              <div style={{ display: 'grid', gap: 8, maxHeight: 220, overflowY: 'auto', paddingRight: 4 }}>
                {playlist.map((item, itemIndex) => (
                  <Button
                    key={item.id}
                    variant={itemIndex === index ? 'filled' : 'light'}
                    color={itemIndex === index ? 'teal' : 'gray'}
                    size="xs"
                    onClick={() => goTo(itemIndex)}
                    disabled={controlsLocked}
                    style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  >
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                        {itemIndex + 1}. {item.type === 'image' ? 'Image' : 'Video'}
                      </div>
                      <div>{item.title || `Item ${itemIndex + 1}`}</div>
                    </div>
                  </Button>
                ))}
              </div>
            </Stack>
          </div>
        </div>

        <div
          style={{
            border: `1px solid ${template.theme.border}`,
            background: template.theme.panel,
            borderRadius: 10,
            padding: 12,
          }}
        >
          <Stack gap="sm">
            <Text fw={700}>Star Citizen Remote Control</Text>
            <Text size="xs" c="rgba(216,243,255,0.75)">Operate this preview and the live playout window together.</Text>
            <Group gap="xs">
              <Badge color={isPlaying ? 'teal' : 'gray'}>{isPlaying ? 'Playing' : 'Paused'}</Badge>
              <Badge color={isLooping ? 'cyan' : 'gray'} variant="light">{isLooping ? 'Loop On' : 'Loop Off'}</Badge>
              <Badge color="pink" variant="light">{index + 1}/{playlist.length || 0}</Badge>
              <Badge color={controlsLocked ? 'red' : 'teal'} variant="light">{controlsLocked ? 'Locked' : 'Unlocked'}</Badge>
            </Group>

            <Button color={controlsLocked ? 'orange' : 'red'} variant={controlsLocked ? 'light' : 'filled'} onClick={toggleControlsLock}>
              {controlsLocked ? 'Unlock Controls' : 'Lock Controls'}
            </Button>

            <Button variant="light" color={closeGuardEnabled ? 'yellow' : 'gray'} onClick={() => setCloseGuard(!closeGuardEnabled)} disabled={controlsLocked}>
              {closeGuardEnabled ? 'Disable Close Guard' : 'Enable Close Guard'}
            </Button>

            <Button variant="light" color={monitorMuted ? 'gray' : 'teal'} onClick={toggleMonitorMuted}>
              {monitorMuted ? 'Enable Remote Preview Sound' : 'Mute Remote Preview Sound'}
            </Button>
            <Text size="xs" c="rgba(216,243,255,0.75)">
              Remote-only monitor audio. This does not mute the playout/source window.
            </Text>

            <Group grow>
              <Button onClick={() => setPlaying(true)} disabled={controlsLocked}>Play</Button>
              <Button variant="light" onClick={() => setPlaying(false)} disabled={controlsLocked}>Pause</Button>
            </Group>
            <Group grow>
              <Button variant="light" onClick={() => goPrev()} disabled={controlsLocked}>Prev</Button>
              <Button variant="light" onClick={() => goNext()} disabled={controlsLocked}>Next</Button>
            </Group>
            <Group grow>
              <Button variant="light" color="orange" onClick={() => restart()} disabled={controlsLocked}>Restart</Button>
              <Button variant="light" color="red" onClick={() => stop()} disabled={controlsLocked}>Stop</Button>
            </Group>

            <Button variant="light" color="cyan" onClick={() => setLoop(!isLooping)} disabled={controlsLocked}>
              {isLooping ? 'Disable Loop' : 'Enable Loop'}
            </Button>

            <Button variant="light" color="blue" onClick={() => setStage(stageMode === 'fixed16x9' ? 'fit' : 'fixed16x9')} disabled={controlsLocked}>
              {stageMode === 'fixed16x9' ? 'Use Fit Stage' : 'Use Fixed 16:9 Stage'}
            </Button>

            <Text fw={600} size="sm">Presets</Text>
            <Select
              data={presets.map((preset) => ({ value: preset.name, label: preset.name }))}
              value={selectedPresetName}
              onChange={(value) => {
                if (!value) return;
                applyPreset(value);
              }}
              placeholder="Select preset"
              disabled={controlsLocked}
            />
            <TextInput
              value={newPresetName}
              onChange={(event) => setNewPresetName(event.currentTarget.value)}
              placeholder="Preset name"
              disabled={controlsLocked}
            />
            <Group grow>
              <Button variant="outline" size="xs" onClick={saveCurrentAsPreset} disabled={controlsLocked}>Save Preset</Button>
              <Button variant="outline" size="xs" color="red" onClick={deleteSelectedPreset} disabled={controlsLocked}>Delete Preset</Button>
            </Group>

            <Text fw={600} size="sm">Toggle Elements (click or buttons)</Text>
            <Group grow>
              <Button variant="outline" size="xs" onClick={() => toggleElement('header')} disabled={controlsLocked}>
                {elementVisibility.header ? 'Hide Header' : 'Show Header'}
              </Button>
              <Button variant="outline" size="xs" onClick={() => toggleElement('hint')} disabled={controlsLocked}>
                {elementVisibility.hint ? 'Hide Hint' : 'Show Hint'}
              </Button>
            </Group>
            <Button variant="outline" size="xs" onClick={() => toggleElement('disclaimer')} disabled={controlsLocked}>
              {elementVisibility.disclaimer ? 'Hide Disclaimer' : 'Show Disclaimer'}
            </Button>

            <Text fw={600} size="sm">Send To Display 3 Helper (Windows)</Text>
            <Text size="xs" c="rgba(216,243,255,0.8)">
              1. Click Open Fixed 16:9 Playout Window.
            </Text>
            <Text size="xs" c="rgba(216,243,255,0.8)">
              2. Click the playout window once.
            </Text>
            <Text size="xs" c="rgba(216,243,255,0.8)">
              3. Press Win+Shift+Right twice (or until the window reaches display 3).
            </Text>
            <Text size="xs" c="rgba(216,243,255,0.8)">
              4. Press F for fullscreen.
            </Text>

            <Button
              variant="default"
              onClick={() => openPlayoutWindow({ autostart: true })}
            >
              Open Star Citizen Playout Window
            </Button>
            <Button
              variant="light"
              color="cyan"
              onClick={() => openPlayoutWindow({ autostart: true, useFixedStage: true })}
            >
              Open Fixed 16:9 Playout Window
            </Button>
            <Button
              variant="light"
              color="grape"
              onClick={() => openSourceCaptureWindow({ autostart: true })}
            >
              Open Source Capture Window
            </Button>

          </Stack>
        </div>
      </div>

      {elementVisibility.disclaimer && (
        <Group
          justify="center"
          px="lg"
          py="sm"
          style={{ borderTop: `1px solid ${template.theme.border}`, cursor: 'pointer' }}
          onClick={() => toggleElement('disclaimer')}
        >
          <Text size="xs" ta="center" c="rgba(216,243,255,0.7)">
            {DISCLAIMER_TEXT}
          </Text>
        </Group>
      )}

      <div
        style={{
          borderTop: `1px solid ${template.theme.border}`,
          padding: '12px 16px 16px',
          background: 'rgba(1, 12, 26, 0.75)',
        }}
      >
        <Stack gap={6}>
          <Text fw={700} size="sm">Sync Diagnostics (Remote + Capture + Playout + Streamlabs)</Text>
          <Group gap="xs">
            <Badge color={diagnostics.stateReachable ? 'teal' : 'red'} variant="light">
              State API: {diagnostics.stateReachable ? 'Reachable' : 'Down'}
            </Badge>
            <Badge color={relayFresh ? 'teal' : 'yellow'} variant="light">
              Relay Bus: {relayFresh ? 'Fresh' : 'Stale'}
            </Badge>
            <Badge color={diagnostics.snapshotMatchesRemote ? 'teal' : 'yellow'} variant="light">
              Remote vs Snapshot: {diagnostics.snapshotMatchesRemote ? 'Aligned' : 'Drifting'}
            </Badge>
            <Badge color={inferredWindowConvergence ? 'teal' : 'yellow'} variant="light">
              Capture/Playout Convergence: {inferredWindowConvergence ? 'Healthy' : 'Needs Attention'}
            </Badge>
          </Group>

          <Text size="xs" c="rgba(216,243,255,0.78)">
            Snapshot published: {formatAgeLabel(diagnostics.lastSnapshotPublishAt)} | Snapshot updated: {formatAgeLabel(diagnostics.snapshotUpdatedAtMs)} | Relay heartbeat: {formatAgeLabel(diagnostics.relayLastSeenAt)} | Relay seq: {diagnostics.relayLastSeq}
          </Text>

          <Text size="xs" c="rgba(216,243,255,0.78)">
            Streamlabs readback: Not directly available from this page yet. Current status is inferred from relay + snapshot health rather than a direct "what is live right now" API response.
          </Text>

          {diagnostics.lastDiagnosticsError && (
            <Text size="xs" c="#ffb3b3">
              Last diagnostics error: {diagnostics.lastDiagnosticsError}
            </Text>
          )}
        </Stack>
      </div>
    </div>
  );
}
