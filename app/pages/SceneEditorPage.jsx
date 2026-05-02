import { useEffect, useRef, useState } from 'react';
import { usePageTitle } from '../contexts/PageTitleContext';
import { notifications } from '@mantine/notifications';
import { applySceneToObs } from '../core/api/providers/obs';
import DevTag from '../components/DevTag';
import {
  ActionIcon,
  Badge,
  Box,
  Group,
  ScrollArea,
  Slider,
  Stack,
  Text,
  TextInput,
  Tooltip,
  NumberInput,
  Divider,
  Switch,
  Button,
} from '@mantine/core';
import {
  IconEye,
  IconEyeOff,
  IconLock,
  IconLockOpen,
  IconPhoto,
  IconVideo,
  IconLetterT,
  IconBrowser,
  IconVolume,
  IconLayersLinked,
  IconChevronUp,
  IconChevronDown,
  IconPlus,
  IconRefresh,
} from '@tabler/icons-react';

// ─── Resizable divider ────────────────────────────────────────────────────────
function ResizeHandle({ onResize, direction = 'vertical' }) {
  const handleMouseDown = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    
    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      onResize(deltaX);
    };
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        width: 6,
        height: '100%',
        background: 'rgba(76,201,240,0.1)',
        cursor: 'col-resize',
        transition: 'background 0.15s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(76,201,240,0.3)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(76,201,240,0.1)';
      }}
    >
      <div style={{ width: 1, height: '60%', background: 'rgba(76,201,240,0.4)' }} />
    </div>
  );
}

// ─── Layer type metadata ──────────────────────────────────────────────────────
const LAYER_ICONS = {
  image:   <IconPhoto   size={14} />,
  video:   <IconVideo   size={14} />,
  text:    <IconLetterT size={14} />,
  browser: <IconBrowser size={14} />,
  audio:   <IconVolume  size={14} />,
  group:   <IconLayersLinked size={14} />,
};

const LAYER_COLORS = {
  image:   'blue',
  video:   'violet',
  text:    'yellow',
  browser: 'teal',
  audio:   'orange',
  group:   'gray',
};

// ─── Initial example scene ────────────────────────────────────────────────────
const INITIAL_LAYERS = [
  {
    id: 'bg-video',
    label: 'Background Video',
    type: 'video',
    visible: true,
    locked: false,
    x: 0, y: 0, width: 1920, height: 1080,
    opacity: 100,
    source: '/assets/video/bg-placeholder.mp4',
  },
  {
    id: 'logo-left',
    label: 'SC Logo (Left)',
    type: 'image',
    visible: true,
    locked: false,
    x: 16, y: 17, width: 200, height: 64,
    opacity: 92,
    source: '/assets/images/star-citizen/starcitizen-logo-white.png',
    fallback: false,
  },
  {
    id: 'logo-right',
    label: 'MBC Logo (Right)',
    type: 'image',
    visible: true,
    locked: false,
    x: 1704, y: 17, width: 200, height: 64,
    opacity: 92,
    source: '/assets/images/star-citizen/MadeByTheCommunity_White.png',
    fallback: false,
  },
  {
    id: 'title-text',
    label: 'Ship Title',
    type: 'text',
    visible: true,
    locked: false,
    x: 800, y: 24, width: 320, height: 40,
    opacity: 100,
    source: 'Aegis Dynamics — Retaliator',
  },
  {
    id: 'disclaimer',
    label: 'Disclaimer Bar',
    type: 'text',
    visible: true,
    locked: false,
    x: 0, y: 1048, width: 1920, height: 32,
    opacity: 70,
    source: 'Star Citizen is in development. Content subject to change.',
  },
];

const STORAGE_KEY = 'scene-editor-state-v1';

// ─── Variable substitution ───────────────────────────────────────────────────
// Text layers support {{varName}} tokens. detectVars extracts unique names.
function detectVars(source) {
  if (typeof source !== 'string') return [];
  const matches = [...source.matchAll(/\{\{([a-zA-Z_][\w]*?)\}\}/g)];
  return [...new Set(matches.map((m) => m[1]))];
}

function resolveVars(source, vars) {
  if (!source || !vars || Object.keys(vars).length === 0) return source;
  return source.replace(/\{\{([a-zA-Z_][\w]*?)\}\}/g, (_, name) => vars[name] ?? `{{${name}}}`);
}

// ─── Canvas scale helpers ─────────────────────────────────────────────────────
const DESIGN_W = 1920;
const DESIGN_H = 1080;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function LayerContent({ layer, selected, scaleY, vars }) {
  const commonFill = {
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  };

  if (layer.type === 'image') {
    return (
      <img
        src={layer.source}
        alt={layer.label}
        draggable={false}
        style={{
          ...commonFill,
          objectFit: 'contain',
        }}
      />
    );
  }

  if (layer.type === 'video') {
    return (
      <video
        src={layer.source}
        muted
        loop
        autoPlay
        playsInline
        preload="auto"
        style={{
          ...commonFill,
          objectFit: 'cover',
          background: 'rgba(0, 0, 0, 0.35)',
        }}
      />
    );
  }

  if (layer.type === 'text') {
    return (
      <div
        style={{
          ...commonFill,
          display: 'flex',
          alignItems: 'center',
          justifyContent: layer.width > 600 ? 'center' : 'flex-start',
          padding: `${Math.max(4, 10 * scaleY)}px ${Math.max(6, 14 * scaleY)}px`,
          color: '#f4fbff',
          fontWeight: 700,
          fontSize: Math.max(10, layer.height * scaleY * 0.62),
          letterSpacing: layer.id === 'disclaimer' ? '0.08em' : '0.03em',
          textTransform: layer.id === 'disclaimer' ? 'uppercase' : 'none',
          textShadow: '0 0 12px rgba(76,201,240,0.35)',
          background: layer.id === 'disclaimer' ? 'linear-gradient(90deg, rgba(5,12,22,0.68), rgba(7,18,34,0.88), rgba(5,12,22,0.68))' : 'transparent',
          // resolved below
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}
      >
        {resolveVars(layer.source, vars)}
      </div>
    );
  }

  if (layer.type === 'browser') {
    return (
      <div
        style={{
          ...commonFill,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(76,201,240,0.9)',
          fontSize: Math.max(10, layer.height * scaleY * 0.2),
          background: 'linear-gradient(135deg, rgba(8,20,40,0.86), rgba(5,10,18,0.72))',
          border: '1px solid rgba(76,201,240,0.18)',
        }}
      >
        Browser Source
      </div>
    );
  }

  if (layer.type === 'audio') {
    return (
      <div
        style={{
          ...commonFill,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,195,90,0.95)',
          fontSize: Math.max(10, layer.height * scaleY * 0.24),
          background: 'linear-gradient(135deg, rgba(38,22,0,0.55), rgba(15,10,0,0.4))',
          border: '1px solid rgba(255,195,90,0.18)',
        }}
      >
        Audio Layer
      </div>
    );
  }

  return selected ? (
    <div
      style={{
        ...commonFill,
        background: 'rgba(76,201,240,0.08)',
      }}
    />
  ) : null;
}

function CanvasLayer({ layer, selected, onSelect, onDragStart, canvasW, canvasH, vars }) {
  const scaleX = canvasW / DESIGN_W;
  const scaleY = canvasH / DESIGN_H;

  const style = {
    position: 'absolute',
    left:   layer.x * scaleX,
    top:    layer.y * scaleY,
    width:  layer.width  * scaleX,
    height: layer.height * scaleY,
    opacity: layer.opacity / 100,
    display: layer.visible ? 'block' : 'none',
    outline: selected ? '2px solid #4cc9f0' : '1px dashed rgba(255,255,255,0.15)',
    outlineOffset: selected ? 1 : 0,
    cursor: layer.locked ? 'default' : 'grab',
    boxSizing: 'border-box',
    background: selected ? 'rgba(76,201,240,0.08)' : 'transparent',
    transition: 'outline 0.1s',
    borderRadius: 2,
    overflow: 'hidden',
    userSelect: 'none',
  };

  const labelStyle = {
    position: 'absolute',
    top: 2,
    left: 4,
    fontSize: 9,
    color: selected ? '#4cc9f0' : 'rgba(255,255,255,0.5)',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '100%',
  };

  return (
    <div
      style={{
        ...style,
        cursor: layer.locked ? 'default' : selected ? 'grabbing' : 'grab',
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(layer.id);
      }}
      onMouseDown={(event) => {
        if (layer.locked) {
          return;
        }
        event.stopPropagation();
        onDragStart(layer.id, event);
      }}
    >
      <LayerContent layer={layer} selected={selected} scaleY={scaleY} vars={vars} />
      <span style={labelStyle}>{LAYER_ICONS[layer.type]} {layer.label}</span>
    </div>
  );
}

// ─── Layer list item ──────────────────────────────────────────────────────────
function LayerItem({ layer, selected, onSelect, onToggleVisible, onToggleLock, onMoveUp, onMoveDown, isFirst, isLast }) {
  return (
    <Box
      onClick={() => onSelect(layer.id)}
      style={{
        padding: '6px 8px',
        borderRadius: 6,
        cursor: 'pointer',
        background: selected ? 'rgba(76,201,240,0.12)' : 'transparent',
        border: selected ? '1px solid rgba(76,201,240,0.4)' : '1px solid transparent',
        opacity: layer.visible ? 1 : 0.45,
      }}
    >
      <Group justify="space-between" gap={4} wrap="nowrap">
        <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
          <Badge
            color={LAYER_COLORS[layer.type]}
            variant="dot"
            size="xs"
            style={{ flexShrink: 0 }}
          >
            {layer.type}
          </Badge>
          {layer.type === 'image' && layer.fallback && (
            <Badge color="orange" variant="outline" size="xs" style={{ flexShrink: 0 }}>fallback</Badge>
          )}
          <Text size="xs" truncate style={{ minWidth: 0 }}>{layer.label}</Text>
        </Group>
        <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
          <Tooltip label="Move up" position="right">
            <ActionIcon size="xs" variant="subtle" color="cyan" disabled={isFirst} onClick={(e) => { e.stopPropagation(); onMoveUp(layer.id); }}>
              <IconChevronUp size={11} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Move down" position="right">
            <ActionIcon size="xs" variant="subtle" color="cyan" disabled={isLast} onClick={(e) => { e.stopPropagation(); onMoveDown(layer.id); }}>
              <IconChevronDown size={11} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={layer.visible ? 'Hide' : 'Show'} position="right">
            <ActionIcon size="xs" variant="subtle" color="cyan" onClick={(e) => { e.stopPropagation(); onToggleVisible(layer.id); }}>
              {layer.visible ? <IconEye size={11} /> : <IconEyeOff size={11} />}
            </ActionIcon>
          </Tooltip>
          <Tooltip label={layer.locked ? 'Unlock' : 'Lock'} position="right">
            <ActionIcon size="xs" variant="subtle" color={layer.locked ? 'yellow' : 'cyan'} onClick={(e) => { e.stopPropagation(); onToggleLock(layer.id); }}>
              {layer.locked ? <IconLock size={11} /> : <IconLockOpen size={11} />}
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
    </Box>
  );
}

// ─── Properties panel ─────────────────────────────────────────────────────────
function PropertiesPanel({ layer, onUpdate, onPickSourceFile, onClearSourceFile, vars, onSetVar }) {
  const PANEL_ACCENT = '#4cc9f0';
  const fileInputRef = useRef(null);

  if (!layer) {
    return (
      <Stack gap="xs" p="sm" align="center" justify="center" style={{ height: '100%', color: `${PANEL_ACCENT}40` }}>
        <IconLayersLinked size={28} opacity={0.3} />
        <Text size="xs" ta="center" style={{ color: `${PANEL_ACCENT}60` }}>Select a layer to inspect its properties</Text>
      </Stack>
    );
  }

  const set = (key, value) => onUpdate(layer.id, { [key]: value });
  const isFileBackedLayer = layer.type === 'image' || layer.type === 'video';
  const fileAccept = layer.type === 'image' ? 'image/*' : layer.type === 'video' ? 'video/*' : undefined;

  return (
    <ScrollArea style={{ height: '100%' }}>
      <Stack gap="xs" p="sm">
        <Group justify="space-between" align="center">
          <Text size="xs" fw={600} style={{ color: PANEL_ACCENT, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Properties
          </Text>
          <Badge color={LAYER_COLORS[layer.type]} variant="light" size="xs">{layer.type}</Badge>
        </Group>

        <Divider style={{ borderColor: `${PANEL_ACCENT}20` }} />

        <TextInput
          label="Label"
          size="xs"
          value={layer.label}
          onChange={(e) => set('label', e.currentTarget.value)}
          styles={{ label: { color: `${PANEL_ACCENT}80` } }}
        />

        <Divider label="Position & Size" labelPosition="left" style={{ borderColor: `${PANEL_ACCENT}20` }} />

        <Group grow gap="xs">
          <NumberInput label="X" size="xs" value={layer.x} onChange={(v) => set('x', Number(v))} suffix="px" styles={{ label: { color: `${PANEL_ACCENT}80` } }} />
          <NumberInput label="Y" size="xs" value={layer.y} onChange={(v) => set('y', Number(v))} suffix="px" styles={{ label: { color: `${PANEL_ACCENT}80` } }} />
        </Group>
        <Group grow gap="xs">
          <NumberInput label="W" size="xs" value={layer.width}  onChange={(v) => set('width',  Number(v))} suffix="px" styles={{ label: { color: `${PANEL_ACCENT}80` } }} />
          <NumberInput label="H" size="xs" value={layer.height} onChange={(v) => set('height', Number(v))} suffix="px" styles={{ label: { color: `${PANEL_ACCENT}80` } }} />
        </Group>

        <Divider label="Appearance" labelPosition="left" style={{ borderColor: `${PANEL_ACCENT}20` }} />

        <Stack gap={4}>
          <Text size="xs" style={{ color: `${PANEL_ACCENT}80` }}>Opacity — {layer.opacity}%</Text>
          <Slider
            value={layer.opacity}
            onChange={(v) => set('opacity', v)}
            min={0} max={100} step={1}
            size="xs"
            color="cyan"
          />
        </Stack>

        <Switch
          label="Visible"
          size="xs"
          checked={layer.visible}
          onChange={(e) => set('visible', e.currentTarget.checked)}
          styles={{ label: { color: `${PANEL_ACCENT}80` } }}
        />
        <Switch
          label="Locked"
          size="xs"
          checked={layer.locked}
          onChange={(e) => set('locked', e.currentTarget.checked)}
          styles={{ label: { color: `${PANEL_ACCENT}80` } }}
        />

        <Divider label="Source" labelPosition="left" style={{ borderColor: `${PANEL_ACCENT}20` }} />

        <TextInput
          label="Source path / value"
          size="xs"
          value={layer.source || ''}
          onChange={(e) => set('source', e.currentTarget.value)}
          styles={{ label: { color: `${PANEL_ACCENT}80` } }}
        />

        {isFileBackedLayer && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={fileAccept}
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) {
                  onPickSourceFile(layer.id, file);
                }
                event.currentTarget.value = '';
              }}
            />
            <Group grow>
              <Button size="xs" variant="light" color="cyan" onClick={() => fileInputRef.current?.click()}>
                Choose {layer.type}
              </Button>
              <Button size="xs" variant="subtle" color="gray" onClick={() => onClearSourceFile(layer.id)}>
                Clear local file
              </Button>
            </Group>
            <Text size="10px" style={{ color: `${PANEL_ACCENT}70` }}>
              Ready for local {layer.type} uploads. Existing public asset paths still work as-is.
            </Text>
          </>
        )}

        {layer.type === 'image' && (
          <>
            <Divider label="Migration" labelPosition="left" style={{ borderColor: `${PANEL_ACCENT}20` }} />
            <Switch
              label="Fallback mode (skip on Apply to OBS)"
              size="xs"
              checked={!!layer.fallback}
              onChange={(e) => set('fallback', e.currentTarget.checked)}
              color="orange"
              styles={{ label: { color: `${PANEL_ACCENT}80` } }}
            />
            <Text size="10px" style={{ color: `${PANEL_ACCENT}60` }}>
              Enable to keep the existing OBS source untouched during Apply. Use for A/B comparison against the native image source.
            </Text>
          </>
        )}

        {layer.type === 'text' && (() => {
          const detectedVars = detectVars(layer.source);
          if (detectedVars.length === 0) return null;
          return (
            <>
              <Divider label="Variables" labelPosition="left" style={{ borderColor: `${PANEL_ACCENT}20` }} />
              <Text size="10px" style={{ color: `${PANEL_ACCENT}60` }}>
                Tokens found in source text — set values here, resolved at render and apply time.
              </Text>
              {detectedVars.map((varName) => (
                <TextInput
                  key={varName}
                  label={`{{${varName}}}`}
                  size="xs"
                  placeholder="Enter value…"
                  value={vars?.[varName] ?? ''}
                  onChange={(e) => onSetVar(varName, e.currentTarget.value)}
                  styles={{ label: { color: `${PANEL_ACCENT}80`, fontFamily: 'monospace' } }}
                />
              ))}
            </>
          );
        })()}
      </Stack>
    </ScrollArea>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function SceneEditorPage() {
  const { setPageTitle } = usePageTitle();
  useEffect(() => {
    setPageTitle(<><DevTag tag="SE01" />🎬 Scene Editor</>);
    return () => setPageTitle(null);
  }, [setPageTitle]);

  const [obsConfig, setObsConfig] = useState(() => {
    if (typeof window === 'undefined') {
      return { host: '127.0.0.1', port: 4455, password: '', sceneName: 'StreamerOps Scene Editor' };
    }
    try {
      const raw = window.localStorage.getItem('scene-editor-obs-config-v1');
      return raw ? { host: '127.0.0.1', port: 4455, password: '', sceneName: 'StreamerOps Scene Editor', ...JSON.parse(raw) } : { host: '127.0.0.1', port: 4455, password: '', sceneName: 'StreamerOps Scene Editor' };
    } catch { return { host: '127.0.0.1', port: 4455, password: '', sceneName: 'StreamerOps Scene Editor' }; }
  });
  const [applyState, setApplyState] = useState({ loading: false, lastResult: null });
  const [dryRunState, setDryRunState] = useState({ loading: false, result: null, open: false });
  const [vars, setVars] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem('scene-editor-vars-v1');
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  const [layers, setLayers] = useState(() => {
    if (typeof window === 'undefined') {
      return INITIAL_LAYERS;
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return INITIAL_LAYERS;
      }

      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.layers) ? parsed.layers : INITIAL_LAYERS;
    } catch {
      return INITIAL_LAYERS;
    }
  });
  const [selectedId, setSelectedId] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    if (typeof window === 'undefined') {
      return 260;
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return 260;
      }

      const parsed = JSON.parse(raw);
      return typeof parsed.leftPanelWidth === 'number' ? parsed.leftPanelWidth : 260;
    } catch {
      return 260;
    }
  });
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    if (typeof window === 'undefined') {
      return 260;
    }

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return 260;
      }

      const parsed = JSON.parse(raw);
      return typeof parsed.rightPanelWidth === 'number' ? parsed.rightPanelWidth : 260;
    } catch {
      return 260;
    }
  });
  const dragRef = useRef(null);
  const objectUrlRef = useRef(new Map());
  
  const canvasRef = (el) => {
    if (el && (el.offsetWidth !== canvasSize.w || el.offsetHeight !== canvasSize.h)) {
      setCanvasSize({ w: el.offsetWidth, h: el.offsetHeight });
    }
  };

  const handleLeftResize = (deltaX) => {
    const minWidth = 180;
    const maxWidth = 500;
    setLeftPanelWidth((prev) => Math.max(minWidth, Math.min(maxWidth, prev + deltaX)));
  };

  const handleRightResize = (deltaX) => {
    const minWidth = 180;
    const maxWidth = 500;
    setRightPanelWidth((prev) => Math.max(minWidth, Math.min(maxWidth, prev - deltaX)));
  };

  useEffect(() => {
    const handleMouseMove = (event) => {
      const drag = dragRef.current;
      if (!drag || !canvasSize.w || !canvasSize.h) {
        return;
      }

      const deltaX = (event.clientX - drag.startClientX) * (DESIGN_W / canvasSize.w);
      const deltaY = (event.clientY - drag.startClientY) * (DESIGN_H / canvasSize.h);

      setLayers((prev) => prev.map((layer) => {
        if (layer.id !== drag.layerId) {
          return layer;
        }

        return {
          ...layer,
          x: clamp(Math.round(drag.startX + deltaX), 0, Math.max(0, DESIGN_W - layer.width)),
          y: clamp(Math.round(drag.startY + deltaY), 0, Math.max(0, DESIGN_H - layer.height)),
        };
      }));
    };

    const handleMouseUp = () => {
      dragRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [canvasSize.h, canvasSize.w]);

  const startLayerDrag = (id, event) => {
    const layer = layers.find((item) => item.id === id);
    if (!layer) {
      return;
    }

    setSelectedId(id);
    dragRef.current = {
      layerId: id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: layer.x,
      startY: layer.y,
    };
  };

  const selectedLayer = layers.find((l) => l.id === selectedId) || null;

  const updateLayer = (id, changes) => {
    setLayers((prev) => prev.map((l) => l.id === id ? { ...l, ...changes } : l));
  };

  const revokeObjectUrl = (id) => {
    const objectUrl = objectUrlRef.current.get(id);
    if (!objectUrl) {
      return;
    }

    URL.revokeObjectURL(objectUrl);
    objectUrlRef.current.delete(id);
  };

  const pickSourceFile = (id, file) => {
    revokeObjectUrl(id);
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current.set(id, objectUrl);
    updateLayer(id, { source: objectUrl });
  };

  const clearSourceFile = (id) => {
    revokeObjectUrl(id);
    const initialLayer = INITIAL_LAYERS.find((layer) => layer.id === id);
    if (initialLayer) {
      updateLayer(id, { source: initialLayer.source });
    }
  };

  useEffect(() => () => {
    objectUrlRef.current.forEach((objectUrl) => {
      URL.revokeObjectURL(objectUrl);
    });
    objectUrlRef.current.clear();
  }, []);

  const handleApplyToObs = async () => {
    const resolvedLayers = layers.map((l) =>
      l.type === 'text' ? { ...l, source: resolveVars(l.source, vars) } : l
    );
    setApplyState({ loading: true, lastResult: null });
    const notifId = notifications.show({
      id: 'obs-apply',
      title: 'Applying to OBS…',
      message: `Pushing ${layers.filter(l => l.visible).length} visible layers to "${obsConfig.sceneName}"`,
      color: 'violet',
      loading: true,
      autoClose: false,
    });
    try {
      const result = await applySceneToObs({
        host: obsConfig.host,
        port: Number(obsConfig.port),
        password: obsConfig.password,
        sceneName: obsConfig.sceneName,
        layers: resolvedLayers,
      });
      setApplyState({ loading: false, lastResult: result });
      notifications.update({
        id: 'obs-apply',
        title: result.success ? 'Scene applied!' : 'Partial apply',
        message: result.success
          ? `${result.totalApplied}/${result.totalLayers} layers applied to "${result.sceneName}"`
          : (result.error || 'Some layers may have failed'),
        color: result.success ? 'cyan' : 'orange',
        loading: false,
        autoClose: 5000,
      });
    } catch (err) {
      setApplyState({ loading: false, lastResult: null });
      notifications.update({
        id: 'obs-apply',
        title: 'OBS connection failed',
        message: String(err?.message || err),
        color: 'red',
        loading: false,
        autoClose: 6000,
      });
    }
  };

  const handleDryRun = async () => {
    setDryRunState({ loading: true, result: null, open: true });
    try {
      const resolvedLayers = layers.map((l) =>
        l.type === 'text' ? { ...l, source: resolveVars(l.source, vars) } : l
      );
      const result = await applySceneToObs({
        host: obsConfig.host,
        port: Number(obsConfig.port),
        password: obsConfig.password,
        sceneName: obsConfig.sceneName,
        layers: resolvedLayers,
        dryRun: true,
      });
      setDryRunState({ loading: false, result, open: true });
    } catch (err) {
      setDryRunState({ loading: false, result: { success: false, error: String(err?.message || err) }, open: true });
    }
  };

  const setVar = (name, value) => {
    setVars((prev) => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('scene-editor-vars-v1', JSON.stringify(vars));
    } catch { /* ignore */ }
  }, [vars]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem('scene-editor-obs-config-v1', JSON.stringify(obsConfig));
    } catch { /* ignore */ }
  }, [obsConfig]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const persistedLayers = layers.map((layer) => {
      if (!objectUrlRef.current.has(layer.id)) {
        return layer;
      }

      const initialLayer = INITIAL_LAYERS.find((item) => item.id === layer.id);
      return {
        ...layer,
        source: initialLayer?.source || '',
      };
    });

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      layers: persistedLayers,
      leftPanelWidth,
      rightPanelWidth,
    }));
  }, [layers, leftPanelWidth, rightPanelWidth]);

  const toggleVisible = (id) => updateLayer(id, { visible: !layers.find((l) => l.id === id).visible });
  const toggleLock    = (id) => updateLayer(id, { locked:  !layers.find((l) => l.id === id).locked  });

  const moveLayer = (id, dir) => {
    setLayers((prev) => {
      const idx = prev.findIndex((l) => l.id === id);
      const next = dir === 'up' ? idx - 1 : idx + 1;
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  };

  const PANEL_BG    = 'rgba(11, 20, 40, 0.85)';
  const PANEL_BORDER = 'rgba(76, 201, 240, 0.2)';
  const PANEL_ACCENT = '#4cc9f0';
  const CANVAS_BG   = 'rgba(5, 8, 15, 0.95)';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--oc-space-deep)',
        position: 'relative',
      }}
    >
      {/* Sci-fi background gradient overlay */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(135deg, rgba(0,4,15,0.4) 0%, rgba(0,8,25,0.6) 50%, rgba(0,4,15,0.5) 100%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Content - positioned above gradient */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', position: 'relative', zIndex: 1 }}>

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <Box
        style={{
          height: 52,
          borderBottom: `1px solid ${PANEL_BORDER}`,
          background: PANEL_BG,
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 16,
          flexShrink: 0,
          boxShadow: `0 4px 16px rgba(76,201,240,0.08), inset 0 1px 0 ${PANEL_BORDER}`,
        }}
      >
        <Text size="sm" fw={700} style={{ letterSpacing: '0.05em', color: PANEL_ACCENT, flexShrink: 0 }}>🎬 SCENE EDITOR</Text>
        <Badge variant="light" color="cyan" size="sm" style={{ flexShrink: 0 }}>LIVE EDIT</Badge>
        <Box style={{ flex: 1 }} />
        <Tooltip label="OBS scene name — must exist or will be created">
          <TextInput
            size="xs"
            placeholder="OBS scene name"
            value={obsConfig.sceneName}
            onChange={(e) => setObsConfig((prev) => ({ ...prev, sceneName: e.currentTarget.value }))}
            style={{ width: 200 }}
            styles={{
              input: {
                background: 'rgba(11,20,40,0.6)',
                border: `1px solid ${PANEL_BORDER}`,
                color: PANEL_ACCENT,
                fontSize: 12,
              },
            }}
          />
        </Tooltip>
        <Tooltip label={`OBS WebSocket host:port — currently ${obsConfig.host}:${obsConfig.port}`}>
          <TextInput
            size="xs"
            placeholder="host:port"
            value={`${obsConfig.host}:${obsConfig.port}`}
            onChange={(e) => {
              const [h, p] = e.currentTarget.value.split(':');
              setObsConfig((prev) => ({ ...prev, host: h || '127.0.0.1', port: Number(p) || 4455 }));
            }}
            style={{ width: 120 }}
            styles={{
              input: {
                background: 'rgba(11,20,40,0.6)',
                border: `1px solid ${PANEL_BORDER}`,
                color: PANEL_ACCENT,
                fontSize: 12,
              },
            }}
          />
        </Tooltip>
        <Box style={{ width: 8 }} />
        <Tooltip label="Reset to defaults">
          <ActionIcon variant="subtle" color="cyan" onClick={() => {
            objectUrlRef.current.forEach((objectUrl) => {
              URL.revokeObjectURL(objectUrl);
            });
            objectUrlRef.current.clear();
            setLayers(INITIAL_LAYERS);
            setLeftPanelWidth(260);
            setRightPanelWidth(260);
            setSelectedId(null);
            setVars({});
            setDryRunState({ loading: false, result: null, open: false });
          }}>
            <IconRefresh size={16} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Simulate apply — shows what OBS would receive without connecting">
          <Button
            size="xs"
            variant="subtle"
            color="cyan"
            loading={dryRunState.loading}
            onClick={handleDryRun}
          >
            Dry Run
          </Button>
        </Tooltip>
        <Tooltip label={`Scene: ${obsConfig.sceneName} · OBS at ${obsConfig.host}:${obsConfig.port}`}>
          <Button
            size="xs"
            variant="light"
            color="violet"
            loading={applyState.loading}
            onClick={handleApplyToObs}
          >
            Apply to OBS
          </Button>
        </Tooltip>
      </Box>

      {/* ── Main workspace ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Left: Layers panel ──────────────────────────────────────────── */}
        <Box
          style={{
            width: leftPanelWidth,
            flexShrink: 0,
            borderRight: `1px solid ${PANEL_BORDER}`,
            background: PANEL_BG,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            backdropFilter: 'blur(8px)',
          }}
        >
          <Group justify="space-between" align="center" px="sm" py="xs" style={{ borderBottom: `1px solid ${PANEL_BORDER}`, flexShrink: 0 }}>
            <Text size="xs" fw={600} style={{ color: PANEL_ACCENT, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Layers</Text>
            <Tooltip label="Add layer (coming soon)">
              <ActionIcon size="xs" variant="subtle" color="cyan" disabled>
                <IconPlus size={12} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <ScrollArea style={{ flex: 1 }} p="xs">
            <Stack gap={4}>
              {layers.map((layer, i) => (
                <LayerItem
                  key={layer.id}
                  layer={layer}
                  selected={selectedId === layer.id}
                  onSelect={setSelectedId}
                  onToggleVisible={toggleVisible}
                  onToggleLock={toggleLock}
                  onMoveUp={(id) => moveLayer(id, 'up')}
                  onMoveDown={(id) => moveLayer(id, 'down')}
                  isFirst={i === 0}
                  isLast={i === layers.length - 1}
                />
              ))}
            </Stack>
          </ScrollArea>
          <Box style={{ borderTop: `1px solid ${PANEL_BORDER}`, padding: '8px 10px', flexShrink: 0 }}>
            <Text size="10px" c="dimmed">{layers.length} layers · {layers.filter(l => l.visible).length} visible</Text>
          </Box>
        </Box>

        {/* ── Left resize handle ──────────────────────────────────────────── */}
        <ResizeHandle onResize={handleLeftResize} />

        {/* ── Center: Canvas ──────────────────────────────────────────────── */}
        <Box
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: CANVAS_BG,
            overflow: 'hidden',
            padding: 32,
            backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(76,201,240,0.03) 0%, transparent 50%)',
          }}
          onClick={() => setSelectedId(null)}
        >
          <Box
            style={{
              width: '100%',
              maxWidth: '100%',
              aspectRatio: '16 / 9',
              position: 'relative',
              background: 'linear-gradient(135deg, rgba(5,8,15,0.8) 0%, rgba(10,15,30,0.9) 60%, rgba(5,8,15,0.8) 100%)',
              border: `2px solid ${PANEL_BORDER}`,
              borderRadius: 2,
              overflow: 'hidden',
              boxShadow: `0 0 40px rgba(76,201,240,0.15), inset 0 0 40px rgba(76,201,240,0.05)`,
            }}
            ref={canvasRef}
          >
            {/* Render layers scaled to canvas */}
            {layers.map((layer) => (
              <CanvasLayer
                key={layer.id}
                layer={layer}
                selected={selectedId === layer.id}
                onSelect={setSelectedId}
                onDragStart={startLayerDrag}
                canvasW={canvasSize.w}
                canvasH={canvasSize.h}
                vars={vars}
              />
            ))}

            {/* Canvas resolution label */}
            <Box
              style={{
                position: 'absolute',
                bottom: 6,
                right: 8,
                fontSize: 10,
                color: 'rgba(255,255,255,0.25)',
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            >
              1920 × 1080
            </Box>
          </Box>
        </Box>

        {/* ── Right resize handle ─────────────────────────────────────────── */}
        <ResizeHandle onResize={handleRightResize} />

        {/* ── Right: Properties panel ─────────────────────────────────────── */}
        <Box
          style={{
            width: rightPanelWidth,
            flexShrink: 0,
            borderLeft: `1px solid ${PANEL_BORDER}`,
            background: PANEL_BG,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            backdropFilter: 'blur(8px)',
          }}
        >
          <Box px="sm" py="xs" style={{ borderBottom: `1px solid ${PANEL_BORDER}`, flexShrink: 0 }}>
            <Text size="xs" fw={600} style={{ color: PANEL_ACCENT, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Inspector</Text>
          </Box>
          <Box style={{ flex: 1, overflow: 'hidden' }}>
            <PropertiesPanel
              layer={selectedLayer}
              onUpdate={updateLayer}
              onPickSourceFile={pickSourceFile}
              onClearSourceFile={clearSourceFile}
              vars={vars}
              onSetVar={setVar}
            />
          </Box>
        </Box>
      </div>

      {/* ── Status bar ──────────────────────────────────────────────────────── */}
      <Box
        style={{
          height: 32,
          borderTop: `1px solid ${PANEL_BORDER}`,
          background: PANEL_BG,
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 16,
          flexShrink: 0,
          boxShadow: `inset 0 1px 0 ${PANEL_BORDER}`,
        }}
      >
        <Text size="10px" c="dimmed" style={{ color: `${PANEL_ACCENT}80` }}>
          {selectedLayer
            ? `${selectedLayer.label} · ${selectedLayer.width}×${selectedLayer.height} @ (${selectedLayer.x}, ${selectedLayer.y})`
            : 'Click a layer to select — Ready to compose'}
        </Text>
        {dryRunState.result && (
          <>
            <Box style={{ flex: 1 }} />
            <Tooltip label={dryRunState.open ? 'Hide dry run results' : 'Show dry run results'}>
              <Button
                size="xs"
                variant="subtle"
                color={dryRunState.result.success ? 'cyan' : 'red'}
                onClick={() => setDryRunState((prev) => ({ ...prev, open: !prev.open }))}
              >
                {dryRunState.open ? 'Hide' : 'Show'} dry run — {dryRunState.result.results?.length ?? 0} layers
              </Button>
            </Tooltip>
          </>
        )}
      </Box>

      {/* ── Dry-run result panel ─────────────────────────────────────────────── */}
      {dryRunState.open && dryRunState.result && (
        <Box
          style={{
            borderTop: `1px solid ${PANEL_BORDER}`,
            background: 'rgba(8, 15, 30, 0.96)',
            backdropFilter: 'blur(8px)',
            maxHeight: 220,
            overflow: 'auto',
            flexShrink: 0,
          }}
        >
          <Box px="md" py="xs" style={{ borderBottom: `1px solid ${PANEL_BORDER}` }}>
            <Text size="xs" fw={600} style={{ color: PANEL_ACCENT, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Dry Run — {dryRunState.result.sceneName} — no OBS changes made
            </Text>
          </Box>
          <Box p="sm">
            {dryRunState.result.error && (
              <Text size="xs" c="red">{dryRunState.result.error}</Text>
            )}
            {Array.isArray(dryRunState.result.results) && (
              <Stack gap={4}>
                {dryRunState.result.results.map((r) => (
                  <Group key={r.layerId} gap={8} wrap="nowrap">
                    <Badge size="xs" color="cyan" variant="outline" style={{ flexShrink: 0, fontFamily: 'monospace' }}>
                      {r.type}
                    </Badge>
                    <Text size="xs" style={{ color: PANEL_ACCENT, flexShrink: 0, minWidth: 120 }} truncate>
                      {r.label}
                    </Text>
                    <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace', flexShrink: 0 }}>
                      {r.obsKind}
                    </Text>
                    <Text size="xs" c="dimmed" truncate style={{ flex: 1 }}>
                      {r.note}
                      {r.resolvedPath ? ` → ${r.resolvedPath}` : ''}
                    </Text>
                    <Badge size="xs" color={r.visible ? 'green' : 'gray'} variant="dot" style={{ flexShrink: 0 }}>
                      {r.visible ? 'visible' : 'hidden'}
                    </Badge>
                    {r.opacity < 100 && (
                      <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>{r.opacity}%</Text>
                    )}
                  </Group>
                ))}
              </Stack>
            )}
          </Box>
        </Box>
      )}
      </div>
    </div>
  );
}
