export const HELP_TIP_SETS = {
  overlaysPlayout: [
    'Tip: Use F in the playout window to toggle fullscreen quickly before going live.',
    'Tip: Use V in the playout window to toggle fixed 16:9 stage mode.',
    'Tip: If a video ends, playout auto-advances to the next sequence item.',
    'Tip: Use the Remote Control page to apply saved presets during stream prep.',
    'Tip: Keep hint overlays hidden in your broadcast preset for cleaner output.',
  ],
  overlaysRemote: [
    'Tip: Save presets for Broadcast, BRB, and Starting Soon so switching is instant.',
    'Tip: Lock Controls mode prevents accidental clicks during live operation.',
    'Tip: Enable close guard to challenge accidental window close or refresh.',
    'Tip: Use Win+Shift+Right to move a window to your next monitor on Windows.',
    'Tip: Apply your last-used preset when opening Remote Control to speed setup.',
    'Referral Code: STAR-TBYK-XVFK',
  ],
};

export function getHelpTips(tipSetKey) {
  return HELP_TIP_SETS[tipSetKey] || [];
}
