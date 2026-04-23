/**
 * Developer Context System
 * 
 * Maps pages to relevant tasks, documentation, and reminders.
 * Shown in dev mode to help developers stay oriented.
 * 
 * Update this as features evolve and docs change.
 */

export const developerContext = {
  // Main Dashboard
  '/': {
    title: 'StreamerOps Control Deck',
    status: '🔄 In Conversion - Streamer Dashboard Pass Started',
    docs: [
      { title: 'Project Overview', path: 'docs/DEVELOPER-REFERENCE.md' },
      { title: 'OmniCore Roadmap', path: 'g:\\My Drive\\Project Management\\Live\\OmniCore-Documentation\\OmniCore-ROADMAP.md' },
    ],
    tasks: [
      '✅ Post-login flow implemented',
      '✅ Initial streamer-first card copy pass',
      '⏳ Replace player-hub priorities with stream workflows',
      '⏳ Add playlist, status, and launch surfaces',
      '⏳ Add creator operations quick links',
      '⏳ Define first stream/network health widgets',
      '⏳ Align route targets with streamer tool outcomes',
    ],
    reminder: 'This is now the primary streamer dashboard surface. Keep it operational, fast to scan, and directly useful during stream setup and live sessions.',
  },

  // HOTAS Config
  '/hotas-config': {
    title: 'HOTAS Configuration',
    status: '⏳ In Development',
    docs: [
      { title: 'HOTAS Config Guide', path: 'docs/HOTAS-CONFIG-GUIDE.md' },
      { title: 'HOTAS Quick Ref', path: 'g:\\My Drive\\Project Management\\Live\\OmniCore-Documentation\\HOTAS\\STAR-CITIZEN-HOTAS-QUICK-REFERENCE.md' },
      { title: 'Web vs Desktop', path: 'g:\\My Drive\\Project Management\\Live\\OmniCore-Documentation\\HOTAS\\STAR-CITIZEN-HOTAS-WEB-VS-DESKTOP.md' },
    ],
    tasks: [
      '✅ Config page created',
      '⏳ Joystick library integration',
      '⏳ Profile management (save/load)',
      '⏳ Real-time input display',
      '⏳ Mapping presets',
      '⏳ Test with actual hardware',
    ],
    reminder: 'This is a core feature. Refer to HOTAS feasibility & implementation docs. Test with real joysticks.',
  },

  // Developer API Test
  '/developer/api-test': {
    title: 'API Testing Suite',
    status: '✅ Citizen API Working',
    docs: [
      { title: 'API Integration Guide', path: 'docs/API-INTEGRATION.md' },
      { title: 'Star Citizen API Docs', path: 'https://starcitizen-api.com/api.php' },
      { title: 'Security Standards', path: 'docs/SECURITY.md' },
    ],
    tasks: [
      '✅ Star Citizen citizen lookup (live)',
      '✅ Gemini AI chat testing',
      '✅ Rate limits monitoring',
      '⏳ Cache validation UI',
      '⏳ Batch API testing',
      '⏳ Response timing analysis',
    ],
    reminder: 'Star Citizen API endpoint: /{apikey}/v1/live/user/{handle} on api.starcitizen-api.com. Get key from Discord.',
  },

  // Developer Nav Charts Lab
  '/developer/nav-charts-lab': {
    title: 'Nav Charts Lab (Dual-Reality Mockup)',
    status: '⏳ In Development',
    docs: [
      { title: 'Active Sprint', path: 'g:\\My Drive\\Project Management\\Live\\OmniCore-Documentation\\Active-Sprint.md' },
      { title: 'API Integration Guide', path: 'docs/API-INTEGRATION.md' },
    ],
    tasks: [
      '✅ Dual-reality blend slider mockup',
      '✅ Command briefing mode UI mockup',
      '✅ Confidence fog visualization toggle',
      '⏳ Replace synthetic graph with cached RSI starmap data',
      '⏳ Add route search based on real jump links',
      '⏳ Wire mission/contract feed when API coverage is confirmed',
    ],
    reminder: 'Prototype uses synthetic topology for interaction testing only. Do not present operational risk values as live game truth until backed by a real source.',
  },

  // Developer Page
  '/developer': {
    title: 'Developer Hub',
    status: '🔧 Maintenance',
    docs: [
      { title: 'Tech Stack & Architecture', path: 'docs/DEVELOPER-REFERENCE.md' },
      { title: 'Security Audit', path: 'docs/SECURITY.md' },
    ],
    tasks: [
      '✅ Dev mode toggle',
      '✅ Activity logging',
      '✅ Error monitoring',
      '⏳ Performance metrics',
      '⏳ Build size analysis',
      '⏳ Bundle budget tracking',
    ],
    reminder: 'This is the nerve center for development. Keep tools organized and discoverable.',
  },

  // Login Page
  '/login': {
    title: 'RSI Login',
    status: '✅ MVP Complete',
    docs: [
      { title: 'Auth Architecture', path: 'docs/DEVELOPER-REFERENCE.md#authentication' },
    ],
    tasks: [
      '✅ Basic login with handle',
      '⏳ Fetch real citizen data',
      '⏳ Display profile info on login',
      '⏳ Error handling for invalid handles',
      '⏳ Welcome/onboarding flow',
    ],
    reminder: 'Plan: Fetch RSI data after login using citizen handle. Show real org/profile.',
  },

  // Settings
  '/settings': {
    title: 'Settings & Configuration',
    status: '⏳ WIP',
    docs: [
      { title: 'Settings Architecture', path: 'docs/DEVELOPER-REFERENCE.md' },
    ],
    tasks: [
      '✅ Theme switcher',
      '⏳ User preferences',
      '⏳ Cost alert thresholds',
      '⏳ API key management',
      '⏳ Export/import config',
    ],
    reminder: 'Keep settings in Zustand store with localStorage persistence.',
  },

  // Aerobook (Media Library)
  '/aerobook': {
    title: 'Aerobook (Media & Social)',
    status: '⏳ In Development',
    docs: [
      { title: 'Aerobook Guide', path: 'docs/AEROBOOK-GUIDE.md' },
    ],
    tasks: [
      '✅ Basic grid layout',
      '⏳ YouTube API integration',
      '⏳ Twitch API integration',
      '⏳ Content filtering',
      '⏳ Like/comment system',
      '⏳ Bookmarking',
    ],
    reminder: 'Goal: Instagram-like experience for Star Citizen content. See AEROBOOK-GUIDE.md for YouTube setup.',
  },

  // Chat (Gemini)
  '/admin/chat/gemini': {
    title: 'Gemini AI Chat',
    status: '✅ Working',
    docs: [
      { title: 'AI Integration', path: 'docs/API-INTEGRATION.md#google-gemini-api' },
    ],
    tasks: [
      '✅ Chat interface',
      '✅ Token counting',
      '✅ Cost tracking',
      '⏳ Conversation history',
      '⏳ System prompt customization',
      '⏳ Star Citizen context injection',
    ],
    reminder: 'Using Gemini 2.0 Flash. Keep token usage visible. Update system prompts in server.',
  },

  // Analytics
  '/admin/analytics': {
    title: 'Analytics & Usage',
    status: '✅ MVP',
    docs: [
      { title: 'Monitoring & Logging', path: 'docs/SECURITY.md#logging--monitoring' },
    ],
    tasks: [
      '✅ Request counting',
      '✅ Cost calculation',
      '✅ Token tracking',
      '⏳ Charts & graphs',
      '⏳ Export reports',
      '⏳ Trend analysis',
    ],
    reminder: 'Track usage to prevent surprise bills. Set cost alerts in settings.',
  },

  // Developer Context Index
  '/developer/context': {
    title: 'Developer Context Index',
    status: '✅ New Feature',
    docs: [
      { title: 'Developer Reference', path: 'docs/DEVELOPER-REFERENCE.md' },
    ],
    tasks: [
      '✅ Context system created',
      '✅ Index page implemented',
      '⏳ Add more page contexts',
      '⏳ Extend with team coordination',
    ],
    reminder: 'This page aggregates all developer contexts. Keep it current as you work on features.',
  },

  // Loadout Builder
  '/loadout-builder': {
    title: 'Loadout Builder',
    status: '⏳ Not Started',
    docs: [],
    tasks: [
      '⏳ UI layout design',
      '⏳ Weapon/armor/component database',
      '⏳ Load-out calculator',
      '⏳ Save/share configs',
    ],
    reminder: 'Major feature. Needs integration with Star Citizen data. Plan scope carefully.',
  },

  // Economy Tracker
  '/economy-tracker': {
    title: 'Platform Tracker',
    status: '📋 Repurpose Planned',
    docs: [],
    tasks: [
      '⏳ Replace economy-first scope with creator/platform metrics',
      '⏳ Define Twitch-focused monitoring model',
      '⏳ Identify cross-platform metrics worth tracking later',
      '⏳ Rework charts around stream operations instead of commodities',
      '⏳ Decide whether this belongs in analytics or standalone tools',
    ],
    reminder: 'This surface no longer fits the product direction as-is. Repurpose it into platform and engagement monitoring rather than trade tooling.',
  },

  // Location Guide
  '/location-guide': {
    title: 'Status View',
    status: '📋 Repurpose Planned',
    docs: [],
    tasks: [
      '⏳ Define OBS, VLC, media, and overlay health indicators',
      '⏳ Add simple service availability states',
      '⏳ Show stream readiness at a glance',
      '⏳ Leave map/nav concepts out of first streamer pass',
      '⏳ Confirm whether any existing location assets are reusable',
    ],
    reminder: 'Use this route as the future stream operations monitor unless a cleaner dedicated status route is introduced.',
  },

  // Ship Database
  '/ship-database': {
    title: 'Ship Tools',
    status: '📋 Repurpose Planned',
    docs: [],
    tasks: [
      '⏳ Keep ship stats as reusable source data',
      '⏳ Define chat-game management requirements',
      '⏳ Define stream sequence builder requirements',
      '⏳ Split presentation mode from reference mode if needed',
      '⏳ Keep data update path simple and reusable',
    ],
    reminder: 'This is one of the strongest reuse candidates in StreamerOps. Favor a shared data layer with streamer-specific presentation modes.',
  },

  // New Player Guide
  '/new-player-guide': {
    title: 'Streamer Academy',
    status: '📋 Repurpose Planned',
    docs: [
      { title: 'Onboarding Checklist', path: 'docs/CHECKLIST-TEMPLATE.md' },
    ],
    tasks: [
      '✅ Placeholder page',
      '⏳ Rework content structure for streamer setup',
      '⏳ Add operational checklists and launch guides',
      '⏳ Add reusable setup notes for OBS, VLC, and overlays',
      '⏳ Add progress tracking only if it helps execution',
      '⏳ Keep documentation practical rather than tutorial-heavy',
    ],
    reminder: 'This should become the practical operator guide area for StreamerOps rather than a new-player game tutorial.',
  },

  // Developer -> Error Log
  '/developer/errors': {
    title: 'Error Log Viewer',
    status: '✅ Working',
    docs: [
      { title: 'Error Handling', path: 'docs/SECURITY.md#error-handling' },
    ],
    tasks: [
      '✅ Log display',
      '✅ Filtering & search',
      '⏳ Export to file',
      '⏳ Error clustering',
    ],
    reminder: 'Critical for debugging. Sanitized to not expose sensitive data.',
  },

  // Developer -> Changes
  '/developer/changes': {
    title: 'Changelog',
    status: '⏳ WIP',
    docs: [],
    tasks: [
      '✅ Changes tracked',
      '⏳ Versioning',
      '⏳ User-facing summaries',
      '⏳ Release notes generation',
    ],
    reminder: 'Keep release notes up to date for users and developers.',
  },

  // Settings
  '/settings': {
    title: 'User Settings',
    status: '⏳ In Development',
    docs: [
      { title: 'Settings Architecture', path: 'docs/DEVELOPER-REFERENCE.md' },
    ],
    tasks: [
      '✅ Theme switcher',
      '⏳ User preferences',
      '⏳ Cost alert thresholds',
      '⏳ API key management',
      '⏳ Export/import config',
    ],
    reminder: 'Use Zustand with localStorage persistence for settings.',
  },

  // Settings -> Theme
  '/settings/theme': {
    title: 'Theme Customization',
    status: '✅ Working',
    docs: [
      { title: 'Theme Lab Guide', path: 'g:\\My Drive\\Project Management\\Live\\OmniCore-Documentation\\START.md' },
    ],
    tasks: [
      '✅ Light/dark toggle',
      '✅ Color presets',
      '⏳ Custom color picker',
      '⏳ CSS variable export',
    ],
    reminder: 'Built with CSS variables. Test across all pages for consistency.',
  },
};

/**
 * Get context for current page
 * @param {string} pathname - Current route pathname
 * @returns {object|null} Context object or null if no context
 */
export function getPageContext(pathname) {
  return developerContext[pathname] || null;
}

/**
 * Get all contexts (for index/map)
 */
export function getAllContexts() {
  return developerContext;
}

/**
 * Get contexts by status (for filtering)
 */
export function getContextsByStatus(status) {
  return Object.entries(developerContext)
    .filter(([, context]) => context.status.startsWith(status.substring(0, 2)))
    .reduce((acc, [path, context]) => ({ ...acc, [path]: context }), {});
}
