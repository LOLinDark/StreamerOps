/**
 * Route Configuration for OmniCore
 * Single source of truth for all app routes
 * Used by App.jsx and DevPanel to avoid duplication
 * 
 * Add new routes here and they'll automatically appear in the dev panel
 */

export const routeConfig = {
  main: [
    {
      label: '/ Dashboard',
      path: '/',
      category: 'Main App',
      color: 'cyan',
    },
    {
      label: '/login',
      path: '/login',
      category: 'Main App',
      color: 'cyan',
    },
    {
      label: '/aerobook',
      path: '/aerobook',
      category: 'Main App',
      color: 'cyan',
    },
    {
      label: '/onboarding',
      path: '/onboarding',
      category: 'Main App',
      color: 'cyan',
    },
    {
      label: '/settings',
      path: '/settings',
      category: 'Main App',
      color: 'cyan',
    },
    {
      label: '/settings/hotas',
      path: '/settings/hotas',
      category: 'Main App',
      color: 'cyan',
    },
    {
      label: '/about',
      path: '/about',
      category: 'Main App',
      color: 'cyan',
    },
  ],

  themeLab: [
    {
      label: '/theme (Landing)',
      path: '/theme',
      category: 'Theme Lab',
      color: 'orange',
    },
    {
      label: '/theme/star-citizen',
      path: '/theme/star-citizen',
      category: 'Theme Lab',
      color: 'orange',
    },
    {
      label: '/theme/squadron-42',
      path: '/theme/squadron-42',
      category: 'Theme Lab',
      color: 'orange',
    },
    {
      label: '📐 /theme/placeholder-samples',
      path: '/theme/placeholder-samples',
      category: 'Theme Lab',
      color: 'orange',
    },
    {
      label: '[HC01] /theme/hotas-config',
      path: '/theme/hotas-config',
      category: 'Theme Lab',
      color: 'orange',
    },
    {
      label: '[HC03] /theme/hotas-config-dark',
      path: '/theme/hotas-config-dark',
      category: 'Theme Lab',
      color: 'orange',
    },
    {
      label: '[HC04] /theme/hotas-config-toggle',
      path: '/theme/hotas-config-toggle',
      category: 'Theme Lab',
      color: 'orange',
    },
    {
      label: '[LEGACY] /theme/hotas-test -> /settings/hotas',
      path: '/theme/hotas-test',
      category: 'Theme Lab',
      color: 'yellow',
    },
  ],

  admin: [
    {
      label: '/admin/chat/gemini',
      path: '/admin/chat/gemini',
      category: 'Admin & Tools',
      color: 'grape',
    },
    {
      label: '/admin/ai-rules',
      path: '/admin/ai-rules',
      category: 'Admin & Tools',
      color: 'grape',
    },
    {
      label: '/admin/analytics',
      path: '/admin/analytics',
      category: 'Admin & Tools',
      color: 'grape',
    },
    {
      label: '/developer',
      path: '/developer',
      category: 'Admin & Tools',
      color: 'grape',
    },
  ],

  testPages: [
    {
      label: '[DEV09] /developer/testing',
      path: '/developer/testing',
      category: 'Test Pages',
      color: 'teal',
    },
    {
      label: '[DEV03] /developer/api-test',
      path: '/developer/api-test',
      category: 'Test Pages',
      color: 'teal',
    },
    {
      label: '[DEV06] /developer/nav-charts-lab',
      path: '/developer/nav-charts-lab',
      category: 'Test Pages',
      color: 'teal',
    },
    {
      label: '[HC06] /developer/hotas-modes-lab',
      path: '/developer/hotas-modes-lab',
      category: 'Test Pages',
      color: 'teal',
    },
    {
      label: '[HC07] /developer/hotas-profile-matrix-lab',
      path: '/developer/hotas-profile-matrix-lab',
      category: 'Test Pages',
      color: 'teal',
    },
    {
      label: '[HC-TEST] /settings/hotas',
      path: '/settings/hotas',
      category: 'Test Pages',
      color: 'teal',
    },
    {
      label: '[DEV08] /developer/video-catalog (Followed YouTube/Twitch)',
      path: '/developer/video-catalog',
      category: 'Test Pages',
      color: 'teal',
    },
  ],

  streamer: [
    {
      label: '/streamer',
      path: '/streamer',
      category: 'Streamer',
      color: 'violet',
    },
    {
      label: '[ST01] /streamer/video-library (Followed Videos)',
      path: '/streamer/video-library',
      category: 'Streamer',
      color: 'violet',
    },
    {
      label: '[ST02] /streamer/scene-manager',
      path: '/streamer/scene-manager',
      category: 'Streamer',
      color: 'violet',
    },
    {
      label: '[ST03] /streamer/playout',
      path: '/streamer/playout',
      category: 'Streamer',
      color: 'violet',
    },
    {
      label: '[ST04] /streamer/wizard-1b',
      path: '/streamer/wizard-1b',
      category: 'Streamer',
      color: 'violet',
    },
  ],

  overlays: [
    {
      label: '/overlays',
      path: '/overlays',
      category: 'Overlays Studio',
      color: 'pink',
    },
    {
      label: '[OV01] /overlays/scene-manager',
      path: '/overlays/scene-manager',
      category: 'Overlays Studio',
      color: 'pink',
    },
    {
      label: '[OV02] /overlays/playout',
      path: '/overlays/playout',
      category: 'Overlays Studio',
      color: 'pink',
    },
    {
      label: '[OV03] /overlays/window/star-citizen-playout',
      path: '/overlays/window/star-citizen-playout',
      category: 'Overlays Studio',
      color: 'pink',
    },
    {
      label: '[OV04] /overlays/window/star-citizen-remote-control',
      path: '/overlays/window/star-citizen-remote-control',
      category: 'Overlays Studio',
      color: 'pink',
    },
    {
      label: '[OV05] /overlays/window/star-citizen-source-capture',
      path: '/overlays/window/star-citizen-source-capture',
      category: 'Overlays Studio',
      color: 'pink',
    },
    {
      label: '[OV06] /overlays/star-citizen-control (Quick Controls)',
      path: '/overlays/star-citizen-control',
      category: 'Overlays Studio',
      color: 'pink',
    },
    {
      label: '[OV07] /overlays/wizard-1b (Capability Wizard)',
      path: '/overlays/wizard-1b',
      category: 'Overlays Studio',
      color: 'pink',
    },
  ],
};

/**
 * Get all routes organized by category
 * @returns {Object} Routes grouped by category
 */
export const getAllRoutesByCategory = () => {
  return routeConfig;
};

/**
 * Get all routes flattened
 * @returns {Array} All routes in a single array
 */
export const getAllRoutes = () => {
  return [
    ...routeConfig.main,
    ...routeConfig.themeLab,
    ...routeConfig.admin,
    ...routeConfig.testPages,
    ...routeConfig.streamer,
    ...routeConfig.overlays,
  ];
};

/**
 * Get routes by category
 * @param {string} category - Category name (e.g., 'Main App', 'Theme Lab')
 * @returns {Array} Routes in that category
 */
export const getRoutesByCategory = (category) => {
  return getAllRoutes().filter((route) => route.category === category);
};

/**
 * Get unique categories
 * @returns {Array} List of all categories
 */
export const getCategories = () => {
  const categories = new Set();
  getAllRoutes().forEach((route) => {
    categories.add(route.category);
  });
  return Array.from(categories);
};
