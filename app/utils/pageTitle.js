import { getAllRoutes } from '../config/routes';

const TITLE_OVERRIDES = {
  '/': 'Dashboard',
  '/aerobook': 'Media Feed',
  '/onboarding': 'Onboarding',
  '/new-player-guide': 'New Player Guide',
  '/loadout-builder': 'Loadout Builder',
  '/economy-tracker': 'Economy Tracker',
  '/location-guide': 'Status View',
  '/hotas-config': 'HOTAS Config',
  '/hotas-config-modes-lab': 'HOTAS Modes Lab',
  '/ship-database': 'Ship Database',
  '/settings': 'Settings',
  '/settings/hotas': 'HOTAS',
  '/settings/theme': 'Theme',
  '/about': 'About',
  '/screenshots': 'Screenshots',
  '/admin/chat/claude': 'Claude Chat',
  '/admin/chat/gemini': 'Gemini Chat',
  '/admin/ai-rules': 'AI Rules',
  '/admin/analytics': 'Analytics',
  '/admin/rate-limits': 'Rate Limits',
  '/admin/history': 'Field History',
  '/developer': 'Developer',
  '/developer/context': 'Developer Context',
  '/developer/errors': 'Error Log',
  '/developer/changes': 'Changes',
  '/developer/api-test': 'API Test',
  '/developer/nav-charts-lab': 'Nav Charts Lab',
  '/developer/testing': 'Developer Testing',
  '/developer/hotas-modes-lab': 'HOTAS Modes Lab',
  '/developer/hotas-profile-matrix-lab': 'HOTAS Profile Matrix Lab',
  '/developer/hotas-profile-matrix': 'HOTAS Profile Matrix Lab',
  '/developer/hotas-profile-lab': 'HOTAS Profile Matrix Lab',
  '/developer/video-catalog': 'Followed YouTube/Twitch',
  '/streamer': 'Streamer Control',
  '/streamer/video-library': 'Followed Videos',
  '/streamer/playlists': 'Playlist Manager',
  '/streamer/scene-manager': 'Scene Manager',
  '/streamer/sequence-builder': 'Sequence Builder',
  '/streamer/playout': 'Browser Playout',
  '/streamer/background-removal': 'Ship PNG Cutout',
  '/streamer/sound-files': 'Sound Files',
  '/overlays': 'Overlays Studio',
  '/overlays/scene-manager': 'Scene Manager',
  '/overlays/playout': 'Browser Playout',
  '/overlays/star-citizen-control': 'Star Citizen Quick Controls',
  '/overlays/window/star-citizen-playout': 'Star Citizen Playout',
  '/overlays/window/star-citizen-source-capture': 'Source Capture',
  '/overlays/window/star-citizen-remote-control': 'Remote Control',
};

function cleanRouteLabel(label) {
  const raw = String(label || '').trim();
  if (!raw) return '';

  const withoutTag = raw.replace(/^\[[^\]]+\]\s*/, '');
  const parenthetical = withoutTag.match(/\(([^)]+)\)\s*$/);
  if (parenthetical?.[1]) {
    return parenthetical[1].trim();
  }

  const withoutPathPrefix = withoutTag.replace(/^\/[\w/-]+\s*/, '').trim();
  if (withoutPathPrefix) {
    return withoutPathPrefix;
  }

  return withoutTag.replace(/^\//, '').trim();
}

function titleFromPath(pathname) {
  const parts = String(pathname || '/').split('/').filter(Boolean);
  if (parts.length === 0) return 'Dashboard';
  const last = parts[parts.length - 1] || 'page';
  return last.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

export function getAutoPageTitle(pathname) {
  const path = String(pathname || '/');

  if (TITLE_OVERRIDES[path]) {
    return TITLE_OVERRIDES[path];
  }

  const allRoutes = getAllRoutes();
  const exact = allRoutes.find((route) => route.path === path);
  if (exact) {
    const cleaned = cleanRouteLabel(exact.label);
    return cleaned || titleFromPath(path);
  }

  const prefix = [...allRoutes]
    .filter((route) => path.startsWith(`${route.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0] || null;

  if (prefix) {
    const cleaned = cleanRouteLabel(prefix.label);
    return cleaned || titleFromPath(path);
  }

  return titleFromPath(path);
}
