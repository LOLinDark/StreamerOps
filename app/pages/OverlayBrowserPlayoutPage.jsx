import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from '@mantine/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SCENE_MANAGER_STORAGE_KEY,
  parseSceneCollectionDocument,
} from '../streamer/sceneModel';

const FILE_EXT_IMAGE = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];

function isLikelyImage(source = '') {
  const lower = source.toLowerCase();
  return FILE_EXT_IMAGE.some((ext) => lower.includes(ext));
}

function normalizePlayableSource(source = '') {
  if (!source) {
    return '';
  }

  if (/^(https?:|blob:|data:|file:)/i.test(source)) {
    return source;
  }

  // Convert local Windows paths to file URLs for local browser playback where supported.
  if (/^[A-Za-z]:\\/.test(source)) {
    const normalized = source.replace(/\\/g, '/');
    return `file:///${normalized}`;
  }

  return source;
}

function getSceneItems(scene) {
  if (scene?.content?.type === 'sequence-inline' && Array.isArray(scene?.content?.sequence)) {
    return scene.content.sequence;
  }
  return [];
}

function loadSceneStateFromStorage() {
  try {
    const raw = localStorage.getItem(SCENE_MANAGER_STORAGE_KEY);
    if (!raw) {
      return parseSceneCollectionDocument(null).state;
    }
    const parsed = parseSceneCollectionDocument(JSON.parse(raw));
    return parsed.state;
  } catch {
    return parseSceneCollectionDocument(null).state;
  }
}

export default function OverlayBrowserPlayoutPage() {
  const [state, setState] = useState(loadSceneStateFromStorage);
  const [status, setStatus] = useState('Loaded scene collection from browser storage.');
  const [sceneIndex, setSceneIndex] = useState(0);
  const [itemIndex, setItemIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopAll, setLoopAll] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const timeoutRef = useRef(null);
  const transitionTimerRef = useRef(null);

  const sceneCount = state?.scenes?.length || 0;
  const safeSceneIndex = sceneCount ? Math.min(sceneIndex, sceneCount - 1) : 0;
  const currentScene = sceneCount ? state.scenes[safeSceneIndex] : null;
  const sceneItems = useMemo(() => getSceneItems(currentScene), [currentScene]);
  const safeItemIndex = sceneItems.length ? Math.min(itemIndex, sceneItems.length - 1) : 0;
  const currentItem = sceneItems[safeItemIndex] || null;

  const transition = currentScene?.transition || 'fade';
  const transitionMs = transition === 'fade' ? 500 : 0;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (sceneCount && safeSceneIndex !== sceneIndex) {
      setSceneIndex(safeSceneIndex);
    }
    if (sceneItems.length && safeItemIndex !== itemIndex) {
      setItemIndex(safeItemIndex);
    }
  }, [sceneCount, sceneItems.length, safeSceneIndex, sceneIndex, safeItemIndex, itemIndex]);

  const moveToStep = (nextSceneIndex, nextItemIndex = 0) => {
    if (!sceneCount) {
      return;
    }

    const clampedScene = Math.max(0, Math.min(nextSceneIndex, sceneCount - 1));
    const nextScene = state.scenes[clampedScene];
    const nextItems = getSceneItems(nextScene);
    const clampedItem = nextItems.length ? Math.max(0, Math.min(nextItemIndex, nextItems.length - 1)) : 0;

    if (transition === 'fade') {
      setIsTransitioning(true);
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
      transitionTimerRef.current = setTimeout(() => {
        setSceneIndex(clampedScene);
        setItemIndex(clampedItem);
        setIsTransitioning(false);
      }, transitionMs);
      return;
    }

    setSceneIndex(clampedScene);
    setItemIndex(clampedItem);
  };

  const goNext = () => {
    if (!sceneCount) {
      return;
    }

    if (sceneItems.length > 0 && safeItemIndex < sceneItems.length - 1) {
      moveToStep(safeSceneIndex, safeItemIndex + 1);
      return;
    }

    if (safeSceneIndex < sceneCount - 1) {
      moveToStep(safeSceneIndex + 1, 0);
      return;
    }

    if (loopAll) {
      moveToStep(0, 0);
      return;
    }

    setIsPlaying(false);
  };

  const goPrev = () => {
    if (!sceneCount) {
      return;
    }

    if (safeItemIndex > 0) {
      moveToStep(safeSceneIndex, safeItemIndex - 1);
      return;
    }

    if (safeSceneIndex > 0) {
      const prevScene = state.scenes[safeSceneIndex - 1];
      const prevItems = getSceneItems(prevScene);
      moveToStep(safeSceneIndex - 1, Math.max(0, prevItems.length - 1));
    }
  };

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    if (!isPlaying || !currentScene) {
      return;
    }

    const fallbackDurationSec = Math.max(1, Number(currentScene.sceneDurationSec) || 30);
    const itemDurationSec = Math.max(1, Number(currentItem?.durationSec) || fallbackDurationSec);
    const isVideo = (currentItem?.type || '').toLowerCase() === 'video';

    if (isVideo) {
      return;
    }

    timeoutRef.current = setTimeout(() => {
      goNext();
    }, itemDurationSec * 1000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [isPlaying, safeSceneIndex, safeItemIndex, currentScene, currentItem, loopAll]);

  const reloadFromStorage = () => {
    try {
      const raw = localStorage.getItem(SCENE_MANAGER_STORAGE_KEY);
      const loaded = parseSceneCollectionDocument(raw ? JSON.parse(raw) : null);
      setState(loaded.state);
      setSceneIndex(0);
      setItemIndex(0);
      setStatus(`Loaded ${loaded.state.scenes.length} scene(s) from Scene Manager storage.`);
    } catch {
      setStatus('Could not load scene data from browser storage.');
    }
  };

  const sceneOptions = state.scenes.map((scene, index) => ({
    value: String(index),
    label: `${index + 1}. ${scene.name || 'Untitled Scene'}`,
  }));

  const mediaSource = normalizePlayableSource(currentItem?.source || '');
  const mediaType = (currentItem?.type || '').toLowerCase() || (isLikelyImage(mediaSource) ? 'image' : 'video');

  return (
    <Container size="xl" py="md">
      <Stack gap="md">
        <Group justify="space-between">
          <div>
            <Title order={2}>Browser Playout</Title>
            <Text size="sm" c="dimmed">Run scenes in-browser for window capture workflows with basic transitions.</Text>
          </div>
          <Group>
            <Badge variant="light" color={isPlaying ? 'teal' : 'gray'}>{isPlaying ? 'Playing' : 'Stopped'}</Badge>
            <Button variant="light" onClick={reloadFromStorage}>Reload Scenes</Button>
          </Group>
        </Group>

        <Card withBorder>
          <Stack gap="xs">
            <Text size="sm" c="dimmed">{status}</Text>
            <Group gap="md" align="flex-end">
              <Select
                label="Jump to scene"
                data={sceneOptions}
                value={String(safeSceneIndex)}
                onChange={(value) => {
                  const next = Number(value);
                  if (Number.isFinite(next)) {
                    moveToStep(next, 0);
                  }
                }}
                disabled={!sceneCount}
                w={260}
              />
              <Switch
                label="Loop all"
                checked={loopAll}
                onChange={(event) => setLoopAll(event.currentTarget.checked)}
              />
              <Button variant="default" onClick={goPrev} disabled={!sceneCount}>Prev</Button>
              <Button color={isPlaying ? 'gray' : 'pink'} onClick={() => setIsPlaying((prev) => !prev)} disabled={!sceneCount}>
                {isPlaying ? 'Pause' : 'Play'}
              </Button>
              <Button variant="default" onClick={goNext} disabled={!sceneCount}>Next</Button>
            </Group>
          </Stack>
        </Card>

        <Card withBorder p="xs" style={{ background: '#02050b' }}>
          <div
            style={{
              position: 'relative',
              minHeight: '62vh',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 8,
              overflow: 'hidden',
              background: '#000',
              opacity: isTransitioning ? 0.25 : 1,
              transition: `opacity ${transitionMs}ms ease`,
            }}
          >
            {mediaSource ? (
              mediaType === 'image' ? (
                <img
                  src={mediaSource}
                  alt={currentItem?.title || currentScene?.name || 'Scene image'}
                  style={{ width: '100%', height: '62vh', objectFit: 'contain', display: 'block', background: '#000' }}
                />
              ) : (
                <video
                  key={`${safeSceneIndex}:${safeItemIndex}:${mediaSource}`}
                  src={mediaSource}
                  autoPlay={isPlaying}
                  controls
                  muted
                  onEnded={goNext}
                  style={{ width: '100%', height: '62vh', objectFit: 'contain', display: 'block', background: '#000' }}
                />
              )
            ) : (
              <Group justify="center" align="center" h="62vh">
                <Stack gap={4} align="center">
                  <Text c="gray.4" fw={600}>No playable media for this scene item.</Text>
                  <Text size="sm" c="gray.6">Use Scene Manager inline sequence items with reachable URLs or file paths.</Text>
                </Stack>
              </Group>
            )}

          </div>
        </Card>

        <Card withBorder>
          <Group justify="space-between">
            <Text size="sm">
              Scene {sceneCount ? safeSceneIndex + 1 : 0}/{sceneCount || 0}
              {sceneItems.length ? ` • Item ${safeItemIndex + 1}/${sceneItems.length}` : ''}
              {currentScene?.transition ? ` • Transition: ${currentScene.transition}` : ''}
            </Text>
            <Text size="sm" c="dimmed">{currentScene?.name || 'No scene selected'}</Text>
          </Group>
        </Card>
      </Stack>
    </Container>
  );
}
