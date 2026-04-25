# Overlays Quick Playout Plan (Work Backwards)

## Goal
Deliver a reliable fullscreen browser window that can stream a mixed sequence of videos and PNG intermissions immediately, then progressively replace hardcoded values with app configuration.

## Why This Approach
- Fastest path to actual on-air usage.
- Reduces complexity by proving one concrete runtime before adding editor tooling.
- Creates a long-term pattern for generating future quick pages (e.g. Stream Starting Soon, BRB, Sponsor Reel).

## Implemented In This Iteration
1. Hardcoded Star Citizen playout page
- Route: /overlays/window/star-citizen-playout
- Uses a template config with a mixed media playlist (video + image + video + image).
- Full-window layout suitable for OBS window capture.

2. Hidden keyboard controls (no on-page control bar)
- Space: play/pause
- Left/Right: previous/next item
- L: toggle loop
- R: restart from item 1 and play
- S: stop/reset
- F: fullscreen toggle

3. Looping mixed media sequence
- Videos advance on ended.
- Images advance after durationSec timeout.
- Playlist loops when loop mode is on.

4. Optional remote control page inside app
- Route: /overlays/star-citizen-control
- Sends commands over BroadcastChannel to the playout window.
- Supports play, pause, next, previous, restart, stop, and loop controls.

5. Overlays Studio access point
- The Overlays Studio overview links directly to open the Star Citizen playout window and the remote control page.

## Long-Term Keep Strategy
Use template-driven quick pages so each new design is mostly configuration, not new logic.

### Stable Runtime Layer
- Runtime player logic remains shared and stable.
- Input commands (keyboard + channel) remain shared.
- Playlist runner (video ended + image duration timer) remains shared.

### Template Layer
Each quick page template should define:
- Visual theme tokens (background, frame style, accents, typography choices)
- Media playlist array
- Optional overlay regions (for later use)
- Control defaults (autostart, loop default)

### Progressive Upgrade Path
1. Hardcoded template (done)
2. Template JSON file per page
3. In-app template editor
4. Scene/sequence builder integration to populate template media
5. Preset library and one-click duplicate/edit workflows

## Operator Flow (Now)
1. Open Overlays Studio.
2. Open Star Citizen playout window.
3. Capture that window in OBS and set full screen.
4. Use keyboard or remote control page to operate playback.

## Immediate Follow-Up Recommendations
1. Replace demo media URLs with your actual local/served files.
2. Add one additional preset page (e.g. Stream Starting Soon) to validate the reusable model.
3. Add a media health check pass that marks unreachable sources before going live.
