import { AppShell, NavLink, Badge, Button, Stack, Title, Indicator, Text, Divider, Alert, Switch, Group, Menu, ActionIcon, Tooltip } from '@mantine/core';
import { useState, useEffect, useMemo } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { apiGet, useAppStore, useSettingsStore } from '../platform-core';
import DevFooter from './DevFooter';
import DevPanel from './DevPanel';
import BrandWordmark from './BrandWordmark';
import { PageTitleProvider } from '../contexts/PageTitleContext';
import { getAutoPageTitle } from '../utils/pageTitle';

const FRONTEND_VERSION = 'Alpha V0.1.0';

export default function StreamerLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const autoPageTitle = useMemo(() => getAutoPageTitle(path), [path]);

  const { colorScheme, toggleColorScheme, devMode, toggleDevMode, logActivity } = useAppStore();

  const [serverOnline, setServerOnline] = useState(false);
  const [serverVersion, setServerVersion] = useState(null);
  const [projectHours, setProjectHours] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [navbarCollapsed, setNavbarCollapsed] = useState(false);
  const [asideCollapsed, setAsideCollapsed] = useState(false);

  useEffect(() => {
    const handleAIStart = () => setAiLoading(true);
    const handleAIEnd = () => setAiLoading(false);
    window.addEventListener('ai-request-start', handleAIStart);
    window.addEventListener('ai-request-end', handleAIEnd);
    return () => {
      window.removeEventListener('ai-request-start', handleAIStart);
      window.removeEventListener('ai-request-end', handleAIEnd);
    };
  }, []);

  useEffect(() => {
    const checkServer = async () => {
      try {
        logActivity('API', 'GET /api/version');
        const data = await apiGet('/api/version');
        logActivity('DATA', `Server ${data.version} - ${data.projectHours}h`);
        setServerVersion(data.version);
        setProjectHours(data.projectHours || 0);
        setServerOnline(true);
      } catch {
        logActivity('ERROR', 'Server offline');
        setServerOnline(false);
      }
    };

    checkServer();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') checkServer();
    }, 300000);
    return () => clearInterval(interval);
  }, [logActivity]);

  const isActive = (route) => path === route || path.startsWith(route + '/');

  const [pageTitle, setPageTitle] = useState(null);

  // Reset page title on navigation so stale titles don't linger
  useEffect(() => {
    setPageTitle(null);
  }, [path]);

  return (
    <PageTitleProvider value={{ setPageTitle }}>
    <AppShell
      header={{ height: 60 }}
      // VS Code's built-in browser is often narrow; collapse side rails at mobile
      // widths so Streamer tools remain clickable and testable.
      navbar={{ width: 220, breakpoint: 'md', collapsed: { mobile: true, desktop: navbarCollapsed } }}
      aside={{ width: 340, breakpoint: 'md', collapsed: { mobile: true, desktop: asideCollapsed } }}
      padding="md"
    >
      <AppShell.Header p="md">
        <Group justify="space-between" style={{ position: 'relative' }}>
          <Group>
            <Group gap={4}>
              <Tooltip label={navbarCollapsed ? 'Show left sidebar' : 'Hide left sidebar'}>
                <ActionIcon variant="subtle" onClick={() => setNavbarCollapsed((prev) => !prev)} aria-label="Toggle left sidebar">
                  {navbarCollapsed ? '>' : '<'}
                </ActionIcon>
              </Tooltip>
              <Tooltip label={asideCollapsed ? 'Show right sidebar' : 'Hide right sidebar'}>
                <ActionIcon variant="subtle" onClick={() => setAsideCollapsed((prev) => !prev)} aria-label="Toggle right sidebar">
                  {asideCollapsed ? '<' : '>'}
                </ActionIcon>
              </Tooltip>
            </Group>
            <BrandWordmark onClick={() => navigate('/')} size="1.25rem" color="#4cc9f0" />
            <Badge size="sm" variant="light">{FRONTEND_VERSION}</Badge>
            <Badge size="sm" variant="light" color="blue">📊 {projectHours}h</Badge>
            <Indicator color={aiLoading ? 'yellow' : 'green'} processing={aiLoading} size={8}>
              <Badge size="sm" variant="light" color={aiLoading ? 'yellow' : 'teal'}>
                {aiLoading ? '⚡' : '🤖'} AI
              </Badge>
            </Indicator>
          </Group>
          <Group gap="xs">
            <Button variant={path === '/' ? 'filled' : 'subtle'} color="cyan" component={Link} to="/">Dashboard</Button>
            <Menu>
              <Menu.Target>
                <Button variant={path.startsWith('/admin') ? 'filled' : 'subtle'}>Admin</Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item component={Link} to="/admin/chat/claude">Claude Chat</Menu.Item>
                <Menu.Item component={Link} to="/admin/chat/gemini">Gemini Chat</Menu.Item>
                <Menu.Item component={Link} to="/admin/ai-rules">AI Rules</Menu.Item>
                <Menu.Divider />
                <Menu.Item component={Link} to="/admin/analytics">Analytics</Menu.Item>
                <Menu.Item component={Link} to="/admin/rate-limits">Rate Limits</Menu.Item>
                <Menu.Item component={Link} to="/admin/history">Field History</Menu.Item>
              </Menu.Dropdown>
            </Menu>
            <Button variant={path.startsWith('/developer') ? 'filled' : 'subtle'} component={Link} to="/developer">Developer</Button>
            <Button variant={path.startsWith('/streamer') ? 'filled' : 'subtle'} color="violet" component={Link} to="/streamer">Streamer</Button>
            <Button variant={path.startsWith('/overlays') ? 'filled' : 'subtle'} color="pink" component={Link} to="/overlays">Overlays Studio</Button>
          </Group>
          {(pageTitle || autoPageTitle) && (
            <Text fw={700} size="lg" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', color: '#e8eaf0', letterSpacing: '0.04em' }}>
              {pageTitle || autoPageTitle}
            </Text>
          )}
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Title order={5} mb="md" c="dimmed" style={{ letterSpacing: '0.15em', textTransform: 'uppercase' }}>Streamer</Title>
        <Stack gap="xs">
          <NavLink label="Overview" active={path === '/streamer'} component={Link} to="/streamer" />

          <Divider my="xs" label="Playlist" labelPosition="center" />
          <NavLink
            label="Followed Videos"
            active={isActive('/streamer/video-library')}
            component={Link}
            to="/streamer/video-library"
            description="YouTube + Twitch sources"
          />
          <NavLink
            label="Playlist Manager"
            active={isActive('/streamer/playlists')}
            component={Link}
            to="/streamer/playlists"
            description="Saved sequence health"
          />
          <NavLink
            label="Playlist Builder"
            active={isActive('/streamer/sequence-builder')}
            component={Link}
            to="/streamer/sequence-builder"
            description="Image + video sequencing"
          />
          <NavLink
            label="Scene Manager"
            active={isActive('/streamer/scene-manager')}
            component={Link}
            to="/streamer/scene-manager"
            description="Browser scene collections"
          />
          <NavLink
            label="Browser Playout"
            active={isActive('/streamer/playout')}
            component={Link}
            to="/streamer/playout"
            description="Play scenes in browser"
          />
          <NavLink
            label="Ship PNG Cutout"
            active={isActive('/streamer/background-removal')}
            component={Link}
            to="/streamer/background-removal"
            description="AI background removal"
          />

          <Divider my="xs" label="Overlays Studio" labelPosition="center" />
          <NavLink label="Open Overlays Studio" active={isActive('/overlays')} component={Link} to="/overlays" />

          <Divider my="xs" label="OBS" labelPosition="center" />
          <NavLink label="Connect to OBS" disabled description="obs-websocket" />
          <NavLink label="Scene Control" disabled description="Coming soon" />
          <NavLink label="Transitions" disabled description="Coming soon" />

          <Divider my="xs" label="Stream" labelPosition="center" />
          <NavLink label="Monitor" disabled description="Coming soon" />
          <NavLink label="Schedule" disabled description="Coming soon" />
        </Stack>
      </AppShell.Navbar>

      <AppShell.Aside p="md" style={{ overflowY: 'auto' }}>
        <Stack>
          <Group justify="space-between">
            <Title order={5}>Theme</Title>
            <Switch
              checked={colorScheme === 'dark'}
              onChange={toggleColorScheme}
              onLabel="🌙"
              offLabel="☀️"
            />
          </Group>
          <Divider />
          <Group justify="space-between">
            <Title order={5}>Dev Mode</Title>
            <Switch checked={devMode} onChange={toggleDevMode} onLabel="ON" offLabel="OFF" />
          </Group>
          <Divider />
          <Title order={5}>Server Status</Title>

          {serverVersion && serverVersion !== FRONTEND_VERSION && (
            <Alert color="orange" title="Version Mismatch" mb="sm">
              <Text size="xs">Backend: {serverVersion}</Text>
              <Text size="xs">Frontend: {FRONTEND_VERSION}</Text>
            </Alert>
          )}

          <Indicator color={serverOnline ? 'green' : 'red'} processing={serverOnline}>
            <Text size="sm">{serverOnline ? 'Backend Online' : 'Backend Offline'}</Text>
          </Indicator>
          {serverVersion && <Text size="xs" c="dimmed">{serverVersion}</Text>}
          <Divider />
          <DevFooter docked width={280} height={260} />
          <Divider />
          <DevPanel docked />
        </Stack>
      </AppShell.Aside>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
    </PageTitleProvider>
  );
}
