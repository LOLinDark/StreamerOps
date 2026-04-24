# OBS + VLC Playback Runbook (No OBS Experience Required)

## Goal
Play Star Citizen videos in sequence and show a visual transition between clips.

## Short Answer To Your Questions
- Can this be done with the OBS API? Yes, but not quickly for first setup.
- Is OBS API already implemented in StreamerOps? Not yet (planned only).
- Can VLC playlist insert PNG between each video automatically? Not in a reliable, simple way for this sprint.

For today, use OBS scene transitions (Stinger/Fade) while VLC handles video order.

---

## What "Playlist Sequencing" Means
Playlist sequencing = the exact top-to-bottom order of items in VLC playlist view.

Where to check:
1. Open VLC.
2. Go to View -> Playlist.
3. Drag items until order is exactly correct.
4. Save playlist if desired.

---

## Recommended "Works Today" Setup

### 1) Build the VLC Playlist (Videos Only)
1. Add your video files to VLC playlist.
2. Put them in final order.
3. Enable VLC playback mode you want (normal loop or one-pass).

Do not try to place PNG files between clips in VLC for now.

### 2) Add VLC Into OBS
1. In OBS, create a scene named Main Playback.
2. Add source: VLC Video Source.
3. Point it to your VLC playlist or media list.
4. Fit to screen and verify audio source behavior.

### 3) Create the Transition Look in OBS
Use one of these:

Option A (fastest): Fade transition
1. In Scene Transitions, choose Fade.
2. Set duration (start with 300-500 ms).

Option B (better visual style): Stinger transition
1. In Scene Transitions, choose Stinger.
2. Provide a short transition video file (webm or mov with alpha).
3. If your design starts as PNG, convert PNG into a short stinger clip first.

Important: OBS Stinger uses video, not a single PNG image.

### 4) Operate During Playback
1. Watch clip end timing in OBS Preview/Program.
2. Trigger transition at clip boundaries if needed.
3. Record a private 3-5 minute test before going live.

---

## Why Not OBS API First
OBS API (obs-websocket) is best for later automation:
- scene switching
- source visibility
- timed control
- status feedback

But it adds setup complexity. For same-day go-live, manual OBS + VLC is faster and safer.

---

## If You Want PNG Between Every Clip Automatically
You have two realistic approaches:

1. Pre-render approach (most reliable)
- Build one final video timeline where each clip has the PNG transition baked in.
- Play one output file in OBS/VLC.

2. Automation approach (next sprint)
- Implement OBS WebSocket control in StreamerOps.
- Programmatically switch scenes/sources at boundaries.

For today, use the recommended setup above.
