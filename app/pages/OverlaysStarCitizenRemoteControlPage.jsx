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
const VISIBILITY_KEYS = ['header', 'hint', 'disclaimer'];
const OVERLAY_CONTROL_API = '/api/overlays/star-citizen/control';
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
  const [elementVisibility, setElementVisibility] = useState({
    header: true,
    hint: true,
    disclaimer: true,
  });
  const [playlist, setPlaylist] = useState(templatePlaylist);
  const [presets, setPresets] = useState(loadSavedPresets);
  const [selectedPresetName, setSelectedPresetName] = useState(loadLastPresetName);
  const [newPresetName, setNewPresetName] = useState('My Preset');
  const { currentTip } = useRotatingTips(getHelpTips('overlaysRemote'), 10000);

  const videoRef = useRef(null);
  const timerRef = useRef(null);
  const senderIdRef = useRef(`remote-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`);

  const current = playlist[index] || null;
  const currentSource = asAbsoluteAssetSource(current?.source || '');

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
      postControl('goto', { index: clamped }, senderIdRef.current);
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
    if (useFixedStage || stageMode === 'fixed16x9') {
      params.set('stage', 'fixed16x9');
    }

    const target = `/overlays/window/star-citizen-playout${params.toString() ? `?${params.toString()}` : ''}`;
    window.open(
      target,
      'StarCitizenPlayoutWindow',
      'popup=yes,width=1920,height=1080,left=40,top=40,menubar=no,toolbar=no,location=no,status=no,resizable=yes'
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
      media.muted = false;
      media.volume = 1;

      media.play().then(() => {
        setAudioBlocked(false);
      }).catch(async () => {
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
  }, [index, isPlaying, current?.id, isLooping]);

  useEffect(() => {
    if (!videoRef.current) return;
    if (!isPlaying) {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!audioBlocked) return undefined;

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
  }, [audioBlocked]);

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
        <Group
          justify="space-between"
          px="lg"
          py="md"
          style={{ borderBottom: `1px solid ${template.theme.border}`, cursor: 'pointer' }}
          onClick={() => toggleElement('header')}
        >
          <Stack gap={0}>
            <Text fw={800} style={{ letterSpacing: '0.08em' }}>{template.theme.title}</Text>
            <Text size="sm" c="rgba(216,243,255,0.75)">{template.theme.subtitle}</Text>
          </Stack>
          <Badge variant="light" color="teal">Click to hide header</Badge>
        </Group>
      )}

      <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16 }}>
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
              muted={audioBlocked}
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

            <Text fw={600} size="sm">Playlist Items</Text>
            <div style={{ display: 'grid', gap: 8 }}>
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
    </div>
  );
}
