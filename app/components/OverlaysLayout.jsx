import { AppShell, Badge, Button, Card, Divider, Group, NavLink, Stack, Switch, Text, Title, ActionIcon, Tooltip } from '@mantine/core';
import { useEffect, useState, useMemo } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { apiGet, useAppStore } from '../platform-core';
import BrandWordmark from './BrandWordmark';
import DevFooter from './DevFooter';
import DevPanel from './DevPanel';
import { PageTitleProvider } from '../contexts/PageTitleContext';
import { getAutoPageTitle } from '../utils/pageTitle';

const FRONTEND_VERSION = 'Alpha V0.1.0';

export default function OverlaysLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;
  const autoPageTitle = useMemo(() => getAutoPageTitle(path), [path]);
  const { colorScheme, toggleColorScheme, devMode, toggleDevMode, logActivity } = useAppStore();

  const [pageTitle, setPageTitle] = useState(null);

  useEffect(() => {
    setPageTitle(null);
  }, [path]);

  const [serverOnline, setServerOnline] = useState(false);
  const [projectHours, setProjectHours] = useState(0);
  const [navbarCollapsed, setNavbarCollapsed] = useState(false);
  const [asideCollapsed, setAsideCollapsed] = useState(false);

  useEffect(() => {
    async function checkServer() {
      try {
        logActivity('API', 'GET /api/version');
        const data = await apiGet('/api/version');
        setProjectHours(data.projectHours || 0);
        setServerOnline(true);
      } catch {
        setServerOnline(false);
      }
    }

    checkServer();
  }, [logActivity]);

  const isActive = (route) => path === route || path.startsWith(`${route}/`);

  return (
    <PageTitleProvider value={{ setPageTitle }}>
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 250, breakpoint: 'md', collapsed: { mobile: true, desktop: navbarCollapsed } }}
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
          </Group>
          <Group gap="xs">
            <Button variant={path === '/' ? 'filled' : 'subtle'} color="cyan" component={Link} to="/">Dashboard</Button>
            <Button variant={path.startsWith('/admin') ? 'filled' : 'subtle'} component={Link} to="/admin/analytics">Admin</Button>
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
        <Title order={5} mb="md" c="dimmed" style={{ letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          Overlays Studio
        </Title>
        <Stack gap="xs">
          <NavLink label="Overview" active={path === '/overlays'} component={Link} to="/overlays" />
          <NavLink label="Scene Manager" active={isActive('/overlays/scene-manager')} component={Link} to="/overlays/scene-manager" />
          <NavLink label="Browser Playout" active={isActive('/overlays/playout')} component={Link} to="/overlays/playout" />
          <Divider my="xs" label="Quick Pages" labelPosition="center" />
          <NavLink label="Star Citizen Playout Window" active={isActive('/overlays/window/star-citizen-playout')} component={Link} to="/overlays/window/star-citizen-playout" />
          <NavLink label="Star Citizen Source Capture" active={isActive('/overlays/window/star-citizen-source-capture')} component={Link} to="/overlays/window/star-citizen-source-capture" />
          <NavLink label="Star Citizen Remote Control" active={isActive('/overlays/window/star-citizen-remote-control')} component={Link} to="/overlays/window/star-citizen-remote-control" />
          <NavLink label="Star Citizen Quick Controls" active={isActive('/overlays/star-citizen-control')} component={Link} to="/overlays/star-citizen-control" />
          <Divider my="xs" label="Compatibility" labelPosition="center" />
          <NavLink label="Legacy Streamer Scene Manager" active={isActive('/streamer/scene-manager')} component={Link} to="/streamer/scene-manager" />
        </Stack>
      </AppShell.Navbar>

      <AppShell.Aside p="md" style={{ overflowY: 'auto' }}>
        <Stack>
          <Title order={5}>Mode</Title>
          <Switch checked={colorScheme === 'dark'} onChange={toggleColorScheme} onLabel="🌙" offLabel="☀️" />
          <Divider />
          <Title order={5}>Dev Mode</Title>
          <Switch checked={devMode} onChange={toggleDevMode} onLabel="ON" offLabel="OFF" />
          <Divider />
          <Card withBorder p="sm">
            <Stack gap={4}>
              <Text fw={600} size="sm">Backend</Text>
              <Badge color={serverOnline ? 'teal' : 'orange'} variant="light">
                {serverOnline ? 'Online' : 'Offline'}
              </Badge>
            </Stack>
          </Card>
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
