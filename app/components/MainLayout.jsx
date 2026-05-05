import { Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Container } from '@mantine/core';
import AppHeader from './AppHeader';
import AerobookBar from './AerobookBar';
import DeveloperNotes from './DeveloperNotes';
import { trackAppView } from '../platform-core';
import { PageTitleProvider } from '../contexts/PageTitleContext';
import { getAutoPageTitle } from '../utils/pageTitle';

export default function MainLayout() {
  const location = useLocation();
  const [pageTitle, setPageTitle] = useState(null);
  const autoPageTitle = getAutoPageTitle(location.pathname);
  const isFullWidth = location.pathname === '/scene-editor';

  useEffect(() => {
    setPageTitle(null);
  }, [location.pathname]);

  console.log('[OmniCore] MainLayout rendered for path:', location.pathname);

  useEffect(() => {
    const path = `${location.pathname}${location.search || ''}`;
    trackAppView(path);
  }, [location.pathname, location.search]);

  return (
    <PageTitleProvider value={{ setPageTitle }}>
    <div style={{ minHeight: '100vh', background: 'var(--oc-space-deep)', position: 'relative' }}>
      <AppHeader pageTitle={pageTitle || autoPageTitle} />
      {!isFullWidth && <AerobookBar />}

      {/* Permanent gradient overlay — positioned below header + bookmark bar, scrolls with content */}
      {!isFullWidth && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '127px',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 0,
            background: 'linear-gradient(160deg, rgba(0,4,15,0.60) 0%, rgba(0,4,15,0.80) 100%)',
            pointerEvents: 'none',
            transition: 'background 0.5s ease',
          }}
        />
      )}

      {/* Main Content */}
      {isFullWidth ? (
        <div style={{ position: 'relative', zIndex: 1, width: '100%', height: 'calc(100vh - 60px)' }}>
          <Outlet />
        </div>
      ) : (
        <Container size="xl" style={{ padding: '2rem 1rem', position: 'relative', zIndex: 1 }}>
          <DeveloperNotes />
          <Outlet />
        </Container>
      )}
    </div>
    </PageTitleProvider>
  );
}
