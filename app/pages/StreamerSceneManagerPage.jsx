import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Container,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import DevTag from '../components/DevTag';
import {
  SCENE_IMPORT_QUEUE_KEY,
  SCENE_MANAGER_STORAGE_KEY,
  buildSceneCollectionDocument,
  createDefaultScene,
  createDefaultSceneState,
  normalizeSceneState,
  parseSceneCollectionDocument,
} from '../streamer/sceneModel';

function downloadTextFile(content, filename, mimeType = 'application/json') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function StreamerSceneManagerPage() {
  const navigate = useNavigate();
  const [state, setState] = useState(createDefaultSceneState);
  const [status, setStatus] = useState('Ready');
  const importInputRef = useRef(null);

  const sceneCount = useMemo(() => state.scenes.length, [state.scenes.length]);

  useEffect(() => {
    try {
      const queuedRaw = localStorage.getItem(SCENE_IMPORT_QUEUE_KEY);
      if (!queuedRaw) return;

      const parsed = parseSceneCollectionDocument(JSON.parse(queuedRaw));
      if (!parsed.ok) {
        localStorage.removeItem(SCENE_IMPORT_QUEUE_KEY);
        return;
      }

      setState(parsed.state);
      setStatus(`Imported from ${parsed.meta.source}${parsed.meta.sourceName ? ` (${parsed.meta.sourceName})` : ''}`);
      localStorage.removeItem(SCENE_IMPORT_QUEUE_KEY);
    } catch {
      localStorage.removeItem(SCENE_IMPORT_QUEUE_KEY);
    }
  }, []);

  function updateScene(sceneId, field, value) {
    setState((prev) => ({
      ...prev,
      scenes: prev.scenes.map((scene) => (scene.id === sceneId ? { ...scene, [field]: value } : scene)),
    }));
  }

  function addScene() {
    setState((prev) => ({
      ...prev,
      scenes: [...prev.scenes, createDefaultScene(prev.scenes.length + 1)],
    }));
  }

  function removeScene(sceneId) {
    setState((prev) => {
      if (prev.scenes.length <= 1) return prev;
      return {
        ...prev,
        scenes: prev.scenes.filter((scene) => scene.id !== sceneId),
      };
    });
  }

  function saveToBrowser() {
    const documentPayload = buildSceneCollectionDocument(state, { source: 'scene-manager' });
    localStorage.setItem(SCENE_MANAGER_STORAGE_KEY, JSON.stringify(documentPayload));
    setStatus(`Saved ${sceneCount} scene(s) to browser storage`);
  }

  function loadFromBrowser() {
    try {
      const raw = localStorage.getItem(SCENE_MANAGER_STORAGE_KEY);
      if (!raw) {
        setStatus('No saved scene collection found');
        return;
      }

      const parsed = parseSceneCollectionDocument(JSON.parse(raw));
      if (!parsed.ok) {
        setStatus('Saved scene collection is invalid');
        return;
      }

      setState(parsed.state);
      setStatus(`Loaded ${parsed.state.scenes.length} scene(s)`);
    } catch {
      setStatus('Failed to load scene collection');
    }
  }

  function exportJsonFile() {
    const doc = buildSceneCollectionDocument(state, { source: 'scene-manager' });
    downloadTextFile(JSON.stringify(doc, null, 2), 'streamerops-scene-collection.json');
    setStatus(`Exported ${sceneCount} scene(s) to JSON`);
  }

  function importJsonFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parseSceneCollectionDocument(JSON.parse(String(reader.result || '{}')));
        if (!parsed.ok) {
          setStatus('Import failed: unsupported scene JSON format');
          return;
        }

        setState(normalizeSceneState(parsed.state));
        setStatus(`Imported ${parsed.state.scenes.length} scene(s) from JSON`);
      } catch {
        setStatus('Import failed: invalid JSON file');
      }
    };

    reader.readAsText(file);
    event.target.value = '';
  }

  function resetAll() {
    setState(createDefaultSceneState());
    setStatus('Reset to defaults');
  }

  return (
    <Container size="lg" py="md">
      <Stack gap="lg">
        <Group justify="space-between" align="flex-start">
          <div>
            <Title order={2}><DevTag tag="ST03" />Scene Manager</Title>
            <Text c="dimmed" mt="xs">
              Manage a collection of stream scenes for browser-window playout. Branding and page-level elements are handled by Overlays Studio layout.
            </Text>
          </div>
          <Badge color="violet" variant="light">Basic v1</Badge>
        </Group>

        <Card withBorder>
          <Stack gap="md">
            <Group justify="space-between">
              <Group gap="xs">
                <Title order={4}>Scenes</Title>
                <Badge variant="light">{sceneCount}</Badge>
              </Group>
              <Button leftSection={<IconPlus size={16} />} variant="light" onClick={addScene}>
                Add Scene
              </Button>
            </Group>

            <Stack gap="sm">
              {state.scenes.map((scene, index) => (
                <Card key={scene.id} withBorder>
                  <Stack gap="sm">
                    <Group justify="space-between" align="center">
                      <Text fw={700}>Scene {index + 1}</Text>
                      <ActionIcon
                        color="red"
                        variant="light"
                        onClick={() => removeScene(scene.id)}
                        disabled={state.scenes.length <= 1}
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>

                    <TextInput
                      label="Scene name"
                      value={scene.name}
                      onChange={(event) => updateScene(scene.id, 'name', event.currentTarget.value)}
                      placeholder="Intro, Feature, Outro"
                    />

                    <TextInput
                      label="Video sequence reference"
                      value={scene.sequenceLabel}
                      onChange={(event) => updateScene(scene.id, 'sequenceLabel', event.currentTarget.value)}
                      placeholder="Sequence A / file path / playlist ID"
                    />

                    <Group grow>
                      <NumberInput
                        label="Scene duration (sec)"
                        min={1}
                        max={3600}
                        value={scene.sceneDurationSec}
                        onChange={(value) => updateScene(scene.id, 'sceneDurationSec', Number(value) || 30)}
                      />
                      <Select
                        label="Transition"
                        value={scene.transition}
                        onChange={(value) => updateScene(scene.id, 'transition', value || 'fade')}
                        data={[
                          { value: 'cut', label: 'Cut' },
                          { value: 'fade', label: 'Fade' },
                          { value: 'slide', label: 'Slide' },
                        ]}
                      />
                    </Group>

                    <Textarea
                      label="Notes"
                      minRows={2}
                      value={scene.notes}
                      onChange={(event) => updateScene(scene.id, 'notes', event.currentTarget.value)}
                      placeholder="Optional production notes"
                    />
                  </Stack>
                </Card>
              ))}
            </Stack>
          </Stack>
        </Card>

        <Card withBorder>
          <Group justify="space-between" align="center">
            <Text size="sm" c="dimmed">{status}</Text>
            <Group>
              <Button variant="default" onClick={() => navigate('/overlays/playout')}>Open Browser Playout</Button>
              <Button variant="light" onClick={exportJsonFile}>Export JSON</Button>
              <Button variant="light" component="label">
                Import JSON
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={importJsonFile}
                />
              </Button>
              <Button variant="default" onClick={loadFromBrowser}>Load</Button>
              <Button variant="default" color="gray" onClick={resetAll}>Reset</Button>
              <Button color="violet" onClick={saveToBrowser}>Save</Button>
            </Group>
          </Group>
        </Card>
      </Stack>
    </Container>
  );
}
