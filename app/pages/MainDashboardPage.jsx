import { Container, Text, SimpleGrid, Stack, Image, Group } from '@mantine/core';
import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { SciFiFrame } from '../components/ui';
import DevTag from '../components/DevTag';
import IncompleteFeatureBadge from '../components/IncompleteFeatureBadge';
import { usePageTitle } from '../contexts/PageTitleContext';
import { getAssetUrl } from '../utils/pathUtils';
import { useAppStore } from '../stores';

// ═══════════════════════════════════════════════════════════════
// WIREFRAME COMPONENTS
// ═══════════════════════════════════════════════════════════════

// HOTAS Wireframe - Generic throttle and joystick setup
const HOTASWireframe = ({ color }) => (
  <svg viewBox="0 0 200 240" style={{ width: '100%', height: '100%', maxWidth: '120px' }}>
    {/* Throttle unit - left side */}
    <g opacity="0.9">
      {/* Throttle grip */}
      <rect x="20" y="80" width="35" height="100" stroke={color} strokeWidth="1.5" fill="none" rx="3" />
      {/* Hat switch */}
      <circle cx="37" cy="50" r="12" stroke={color} strokeWidth="1.5" fill="none" />
      <line x1="37" y1="40" x2="37" y2="60" stroke={color} strokeWidth="1" />
      <line x1="27" y1="50" x2="47" y2="50" stroke={color} strokeWidth="1" />
      {/* Rotary controls */}
      <circle cx="37" cy="155" r="8" stroke={color} strokeWidth="1.5" fill="none" />
      <line x1="37" y1="150" x2="37" y2="145" stroke={color} strokeWidth="1" />
      {/* Slider indicators */}
      <line x1="20" y1="110" x2="55" y2="110" stroke={color} strokeWidth="0.8" />
      <line x1="20" y1="125" x2="55" y2="125" stroke={color} strokeWidth="0.8" />
      <line x1="20" y1="140" x2="55" y2="140" stroke={color} strokeWidth="0.8" />
    </g>

    {/* Joystick - center */}
    <g opacity="0.9">
      {/* Stick base */}
      <rect x="80" y="140" width="40" height="60" stroke={color} strokeWidth="1.5" fill="none" rx="2" />
      {/* Stick shaft */}
      <line x1="100" y1="100" x2="100" y2="140" stroke={color} strokeWidth="1.5" />
      {/* Stick grip */}
      <circle cx="100" cy="85" r="10" stroke={color} strokeWidth="1.5" fill="none" />
      <line x1="95" y1="80" x2="105" y2="80" stroke={color} strokeWidth="1" />
      {/* Stick throw indicators */}
      <circle cx="100" cy="85" r="18" stroke={color} strokeWidth="0.8" fill="none" opacity="0.5" />
    </g>

    {/* Connection line */}
    <line x1="55" y1="160" x2="80" y2="160" stroke={color} strokeWidth="1" opacity="0.6" />
  </svg>
);

// Hornet Wireframe - Based on schematic (side/top view)
const ShipWireframe = ({ color }) => (
  <svg viewBox="0 0 200 180" style={{ width: '100%', height: '100%', maxWidth: '140px' }}>
    {/* Main fuselage - cockpit to aft */}
    <g opacity="0.9">
      {/* Forward cockpit/canopy */}
      <path
        d="M 100 40 L 95 60 L 85 65 L 85 90 L 100 95 L 115 90 L 115 65 L 105 60 Z"
        stroke={color}
        strokeWidth="1.5"
        fill="none"
      />
      {/* Main body */}
      <ellipse cx="100" cy="110" rx="25" ry="35" stroke={color} strokeWidth="1.5" fill="none" />
      {/* Aft section */}
      <path
        d="M 90 140 L 85 160 L 100 165 L 115 160 L 110 140 Z"
        stroke={color}
        strokeWidth="1.5"
        fill="none"
      />
    </g>

    {/* Wing structures */}
    <g opacity="0.9">
      {/* Port (left) wing */}
      <path
        d="M 85 105 L 55 100 L 50 110 L 85 115 Z"
        stroke={color}
        strokeWidth="1.5"
        fill="none"
      />
      {/* Starboard (right) wing */}
      <path
        d="M 115 105 L 145 100 L 150 110 L 115 115 Z"
        stroke={color}
        strokeWidth="1.5"
        fill="none"
      />
    </g>

    {/* Engine pods - dual */}
    <g opacity="0.9">
      {/* Port engine */}
      <rect x="70" y="125" width="12" height="28" stroke={color} strokeWidth="1.5" fill="none" rx="2" />
      <line x1="70" y1="135" x2="82" y2="135" stroke={color} strokeWidth="0.8" />
      {/* Starboard engine */}
      <rect x="118" y="125" width="12" height="28" stroke={color} strokeWidth="1.5" fill="none" rx="2" />
      <line x1="118" y1="135" x2="130" y2="135" stroke={color} strokeWidth="0.8" />
    </g>

    {/* Landing gear indicators */}
    <g opacity="0.6">
      <line x1="80" y1="140" x2="75" y2="155" stroke={color} strokeWidth="1" />
      <line x1="120" y1="140" x2="125" y2="155" stroke={color} strokeWidth="1" />
      <line x1="100" y1="145" x2="100" y2="158" stroke={color} strokeWidth="1" />
    </g>
  </svg>
);

// Scene Editor Wireframe - canvas with layer panels
const SceneEditorWireframe = ({ color }) => (
  <svg viewBox="0 0 200 160" style={{ width: '100%', height: '100%', maxWidth: '140px' }}>
    {/* Canvas area */}
    <rect x="50" y="20" width="100" height="56" stroke={color} strokeWidth="1.5" fill="none" rx="1" />
    {/* 16:9 inner frame */}
    <rect x="54" y="24" width="92" height="48" stroke={color} strokeWidth="0.6" fill="none" opacity="0.4" />
    {/* Fake layers inside canvas */}
    <rect x="58" y="28" width="84" height="8"  stroke={color} strokeWidth="0.8" fill="none" opacity="0.6" />
    <rect x="58" y="52" width="30" height="14" stroke={color} strokeWidth="0.8" fill="none" opacity="0.6" />
    <rect x="112" y="52" width="30" height="14" stroke={color} strokeWidth="0.8" fill="none" opacity="0.6" />
    {/* Left panel (layers) */}
    <rect x="10" y="20" width="36" height="56" stroke={color} strokeWidth="1.2" fill="none" rx="1" />
    <line x1="14" y1="30" x2="42" y2="30" stroke={color} strokeWidth="0.7" opacity="0.5" />
    <line x1="14" y1="38" x2="42" y2="38" stroke={color} strokeWidth="0.7" opacity="0.5" />
    <line x1="14" y1="46" x2="42" y2="46" stroke={color} strokeWidth="0.7" opacity="0.5" />
    <line x1="14" y1="54" x2="42" y2="54" stroke={color} strokeWidth="0.7" opacity="0.5" />
    {/* Right panel (inspector) */}
    <rect x="154" y="20" width="36" height="56" stroke={color} strokeWidth="1.2" fill="none" rx="1" />
    <line x1="158" y1="30" x2="186" y2="30" stroke={color} strokeWidth="0.7" opacity="0.5" />
    <rect x="158" y="36" width="24" height="4" stroke={color} strokeWidth="0.5" fill="none" opacity="0.4" />
    <rect x="158" y="44" width="24" height="4" stroke={color} strokeWidth="0.5" fill="none" opacity="0.4" />
    <rect x="158" y="52" width="24" height="4" stroke={color} strokeWidth="0.5" fill="none" opacity="0.4" />
    {/* Top bar */}
    <rect x="10" y="12" width="180" height="6" stroke={color} strokeWidth="0.8" fill="none" rx="1" opacity="0.5" />
    {/* Bottom bar */}
    <rect x="10" y="78" width="180" height="5" stroke={color} strokeWidth="0.8" fill="none" rx="1" opacity="0.4" />
    {/* Selection highlight on canvas */}
    <rect x="58" y="52" width="30" height="14" stroke={color} strokeWidth="1.2" fill="none" opacity="1" />
  </svg>
);

// Hybrid Design - Grid + Wireframe + Glow
const HybridPlaceholder = ({ tool }) => (  <div
    style={{
      width: '100%',
      height: '200px',
      background: `linear-gradient(135deg, ${tool.color}14, ${tool.color}08)`,
      border: `2px solid ${tool.color}66`,
      borderRadius: '2px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: `0 0 20px ${tool.color}33, inset 0 0 20px ${tool.color}0D`,
    }}
  >
    {/* Grid background */}
    <svg
      style={{
        position: 'absolute',
        width: '100%',
        height: '100%',
        opacity: 0.15,
        top: 0,
        left: 0,
      }}
      viewBox="0 0 400 250"
      preserveAspectRatio="none"
    >
      {[...Array(5)].map((_, i) => (
        <line
          key={`h${i}`}
          x1="0"
          y1={i * 62.5}
          x2="400"
          y2={i * 62.5}
          stroke={tool.color}
          strokeWidth="1"
        />
      ))}
      {[...Array(7)].map((_, i) => (
        <line
          key={`v${i}`}
          x1={i * 57.14}
          y1="0"
          x2={i * 57.14}
          y2="250"
          stroke={tool.color}
          strokeWidth="1"
        />
      ))}
    </svg>

    {/* Content */}
    <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
      <div
        style={{
          width: '100px',
          height: '80px',
          marginBottom: '0.75rem',
          filter: `drop-shadow(0 0 15px ${tool.color}99)`,
        }}
      >
        {tool.id === 'hotas-config' ? (
          <HOTASWireframe color={tool.color} />
        ) : tool.id === 'scene-editor' ? (
          <SceneEditorWireframe color={tool.color} />
        ) : (
          <ShipWireframe color={tool.color} />
        )}
      </div>
      <div
        style={{
          fontFamily: '"Courier New", monospace',
          fontSize: '0.75rem',
          color: tool.color,
          letterSpacing: '0.05em',
          textShadow: `0 0 8px ${tool.color}80`,
        }}
      >
        {tool.id === 'hotas-config' ? 'HOTAS.CONFIG' : tool.id === 'scene-editor' ? 'SCENE.EDITOR' : 'VERSE.DB'}
      </div>
    </div>
  </div>
);

// Function to generate TOOLS array at runtime (not module scope)
const getToolsArray = () => [
  {
    id: 'hotas-config',
    title: 'Technology Config',
    desc: 'Join together streamer settings, control paths, hardware, and service integrations',
    image: null,
    alt: 'Technology Config - Streamer settings, hardware, and service integration controls',
    color: '#ff6b00',
    path: '/hotas-config',
    enabled: false,
  },
  {
    id: 'scene-editor',
    title: 'Scene Editor',
    desc: 'Design stream layouts visually — position layers, adjust sources, and build scenes for broadcast',
    image: null,
    alt: 'Scene Editor - WYSIWYG stream scene design tool',
    color: '#4cc9f0',
    path: '/scene-editor',
    enabled: true,
  },
  {
    id: 'new-player-guide',
    title: 'Streamer Academy',
    desc: 'Build setup guides, operating notes, and onboarding material for repeatable stream workflows',
    image: getAssetUrl('tools/new-player-guide.jpg'),
    alt: 'Streamer Academy - Stream setup guidance and onboarding documentation',
    color: '#00d9ff',
    path: '/new-player-guide',
    enabled: false,
  },
  {
    id: 'economy-tracker',
    title: 'Platform Tracker',
    desc: 'Track platform-facing operations, engagement metrics, and future Twitch-focused workflow signals',
    image: null,
    alt: 'Platform Tracker - Stream platform monitoring and engagement workflow data',
    color: '#b300ff',
    path: '/economy-tracker',
    enabled: false,
  },
  {
    id: 'location-guide',
    title: 'Status View',
    desc: 'Monitor stream stack health, overlays, media readiness, and service availability from one place',
    image: null,
    alt: 'Status View - Stream operations, overlay, and service health monitoring',
    color: '#00ff88',
    path: '/location-guide',
    enabled: true,
  },
];

// Fallback image placeholder for missing assets
const PlaceholderImage = ({ tool }) => {
  // Use Hybrid design for enabled tech/ship tools
  if (tool.enabled && (tool.id === 'hotas-config' || tool.id === 'scene-editor')) {
    return <HybridPlaceholder tool={tool} />;
  }

  return (
    <div
      style={{
        width: '100%',
        height: '200px',
        background: `linear-gradient(135deg, ${tool.color}20, ${tool.color}40)`,
        border: `1px solid ${tool.color}60`,
        borderRadius: '2px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '3rem',
        opacity: 0.8,
      }}
    >
      <Text
        fw={700}
        size="sm"
        style={{
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: tool.color,
        }}
      >
        Preview
      </Text>
    </div>
  );
};

const ToolCard = ({ tool }) => {
  const navigate = useNavigate();
  const [imageLoaded, setImageLoaded] = React.useState(false);
  const devMode = useAppStore((s) => s.devMode);
  const isIncomplete = !tool.enabled;

  const handleClick = () => {
    if (tool.path && (tool.enabled || devMode)) {
      navigate(tool.path);
    }
  };

  const disabledStyles = isIncomplete && !devMode ? {
    opacity: 0.5,
    cursor: 'not-allowed',
  } : {
    cursor: tool.path ? 'pointer' : 'not-allowed',
  };

  return (
    <div
      onClick={handleClick}
      style={{
        transition: 'all 0.3s ease',
        ...disabledStyles,
      }}
      onMouseEnter={(e) => {
        if (tool.path && (tool.enabled || devMode)) {
          e.currentTarget.style.transform = 'translateY(-8px)';
          e.currentTarget.style.boxShadow = '0 12px 24px rgba(0, 217, 255, 0.2)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <SciFiFrame variant="corners" cornerLength={16} strokeWidth={1.5} padding={0}>
        <Stack gap={0}>
          {/* Image section */}
          <div
            style={{
              position: 'relative',
              overflow: 'hidden',
              borderBottom: `1px solid var(--oc-cyan-dim)`,
            }}
          >
            {tool.image ? (
              <>
                <Image
                  src={tool.image}
                  alt={tool.alt}
                  onLoad={() => setImageLoaded(true)}
                  fallback={<PlaceholderImage tool={tool} />}
                  style={{ display: imageLoaded ? 'block' : 'none' }}
                />
                {!imageLoaded && <PlaceholderImage tool={tool} />}
              </>
            ) : (
              <PlaceholderImage tool={tool} />
            )}
            
            {isIncomplete && (
              <div
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                }}
              >
                <IncompleteFeatureBadge label="Hidden from Public" />
              </div>
            )}
          </div>

          {/* Content section */}
          <div style={{ padding: '1rem' }}>
            <Group gap={6} mb={6}>
              <Text fw={700} style={{ color: tool.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {tool.title}
              </Text>
              {isIncomplete && <IncompleteFeatureBadge />}
            </Group>
            <Text size="sm" c="dimmed" style={{ lineHeight: 1.5 }}>
              {tool.desc}
            </Text>
          </div>
        </Stack>
      </SciFiFrame>
    </div>
  );
};

export default function MainDashboardPage() {
  const { setPageTitle } = usePageTitle();
  const devMode = useAppStore((s) => s.devMode);
  useEffect(() => {
    setPageTitle(<><DevTag tag="APP01" />Verse Operations Hub</>);
    return () => setPageTitle(null);
  }, [setPageTitle]);
  console.log('[OmniCore] MainDashboardPage rendered');
  // Evaluate TOOLS array at component render time (not module scope)
  const TOOLS = useMemo(() => getToolsArray(), []);
  const visibleTools = useMemo(
    () => TOOLS.filter((tool) => tool.enabled || devMode),
    [TOOLS, devMode]
  );
  
  return (
    <Container size="xl" py="xl">
      {/* Header */}
      <div style={{ marginBottom: '3rem' }}>
<Text c="dimmed" size="sm" style={{ letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: '0.5rem' }}>
          Launch streams, monitor systems, and manage creator workflows
        </Text>
      </div>

      {/* Tools Grid */}
      <SimpleGrid
        cols={{ base: 1, sm: 2, md: 3 }}
        spacing="lg"
        style={{
          marginBottom: '2rem',
        }}
      >
        {visibleTools.map((tool) => (
          <ToolCard key={tool.id} tool={tool} />
        ))}
      </SimpleGrid>
    </Container>
  );
}
