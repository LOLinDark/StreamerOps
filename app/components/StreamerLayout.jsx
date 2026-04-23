import { AppShell, NavLink, Badge, Button, Stack, Title, Indicator, Text, Divider, Alert, Switch, Group, Menu } from '@mantine/core';
import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { apiGet, useAppStore, useSettingsStore } from '../platform-core';
import DevFooter from './DevFooter';
import BrandWordmark from './BrandWordmark';

const FRONTEND_VERSION = 'Alpha V0.1.0';

export default function StreamerLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  const { colorScheme, toggleColorScheme, devMode, toggleDevMode, logActivity } = useAppStore();

  const [serverOnline, setServerOnline] = useState(false);
  const [serverVersion, setServerVersion] = useState(null);
  const [projectHours, setProjectHours] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);

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

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 220, breakpoint: 'sm' }}
      aside={{ width: 200, breakpoint: 'sm' }}
      padding="md"
    >
      <AppShell.Header p="md">
        <Group justify="space-between">
          <Group>
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
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="md">
        <Title order={5} mb="md" c="dimmed" style={{ letterSpacing: '0.15em', textTransform: 'uppercase' }}>Streamer</Title>
        <Stack gap="xs">
          <NavLink label="Overview" active={path === '/streamer'} component={Link} to="/streamer" />

          <Divider my="xs" label="Playlist" labelPosition="center" />
          <NavLink
            label="Video Library"
            active={isActive('/streamer/video-library')}
            component={Link}
            to="/streamer/video-library"
          />
          <NavLink
            label="Playlist Builder"
            disabled
            description="Coming soon"
          />

          <Divider my="xs" label="OBS" labelPosition="center" />
          <NavLink label="Connect to OBS" disabled description="obs-websocket" />
          <NavLink label="Scene Control" disabled description="Coming soon" />
          <NavLink label="Transitions" disabled description="Coming soon" />

          <Divider my="xs" label="Stream" labelPosition="center" />
          <NavLink label="Monitor" disabled description="Coming soon" />
          <NavLink label="Schedule" disabled description="Coming soon" />
        </Stack>
      </AppShell.Navbar>

      <AppShell.Aside p="md">
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
        </Stack>
      </AppShell.Aside>

      <AppShell.Main>
        <Outlet />
        {devMode && <DevFooter />}
      </AppShell.Main>
    </AppShell>
  );
}
