# Streamlabs Browser Source Timeout - Investigation Guide

**Status**: Active Investigation  
**Date**: April 25, 2026  
**Symptom**: Streamlabs browser source stops updating after ~60 seconds, "CLICK ONCE TO ENABLE SOUND" appears

---

## Symptom Description

The playout page works initially when loaded into Streamlabs OBS browser source, but after approximately 1 minute:
1. Video/image rendering stops (blank screen or last frame frozen)
2. "CLICK ONCE TO ENABLE SOUND" message appears
3. Remote commands no longer update the display
4. Manual interaction (clicking on source) may briefly restore it
5. Full page reload is required to restore sync

---

## Potential Root Causes (Ranked by Likelihood)

### Cause 1: Browser Autoplay Policy Timeout (HIGH PROBABILITY)
**How it works**:
- Modern browsers (Chrome, Firefox) restrict autoplay of videos with audio
- If video plays muted initially, browsers will pause it if user doesn't interact
- After ~60 seconds of no interaction, autoplay may be throttled or blocked

**Symptom Match**:
- ✓ Happens consistently at same time
- ✓ "Click to enable sound" suggests audio blocking
- ✓ Affects video only (images would still display)
- ✓ Streamlabs browser source is backgrounded (not focused)

**Test to confirm**:
```javascript
// In QuickPlayoutPage.jsx, add monitoring
if (videoRef.current) {
  videoRef.current.addEventListener('pause', () => {
    console.warn('VIDEO PAUSED (autoplay throttle?)');
  });
  videoRef.current.addEventListener('playing', () => {
    console.log('VIDEO PLAYING');
  });
}
```

**Fix approach**:
1. Keep track of video playback state
2. If paused unexpectedly, attempt to resume with `play()`
3. Add periodic keepalive (click simulation) to reset autoplay timeout
4. Consider muted autoplay + optional unmute on first user gesture

---

### Cause 2: Streamlabs OBS Browser Source Refresh/Reload Cycle (HIGH PROBABILITY)
**How it works**:
- Streamlabs may reload browser sources on a timer for memory management
- Common default: reload every 60-120 seconds
- Reload would reset the page, re-fetch playout, but lose current playback state

**Symptom Match**:
- ✓ Timing is consistent (~60s matches common cache/reload intervals)
- ✓ After reload, playout would lose playback state (paused)
- ✓ Would explain the blank/frozen appearance

**Streamlabs Settings** (in OBS):
- Settings → Browser → "Refresh browser source" (may have timer)
- Settings → Advanced → Browser cache settings
- Check if background tabs are suspended

**Test to confirm**:
```javascript
// Monitor page reloads
window.addEventListener('beforeunload', () => {
  console.warn('PAGE RELOAD DETECTED');
  localStorage.setItem('lastReloadTime', Date.now());
});

// On page load, check if reload just happened
if (localStorage.getItem('lastReloadTime')) {
  const timeSinceReload = Date.now() - Number(localStorage.getItem('lastReloadTime'));
  console.log(`Reloaded ${timeSinceReload}ms ago`);
}
```

**Fix approach**:
1. Add `<meta http-equiv="refresh" content="none">` to prevent auto-refresh
2. Configure Streamlabs to not reload sources (disable refresh timer)
3. Persist playback state to localStorage + restore on reload
4. Add keepalive fetch to backend to keep connection active

---

### Cause 3: Rate Limiting on Relay API (MEDIUM PROBABILITY)
**How it works**:
- Playout polls relay every 500ms
- ~120 polls per minute
- If rate limit is triggered, polling fails silently
- Without polling, remote commands don't reach playout

**Rate Limit Config**:
```javascript
// From server/index.js
const HOURLY_REQUEST_LIMIT = 100;
const DAILY_REQUEST_LIMIT = 20;

// BUT relay endpoint skips rate limiting:
skip: (req) => originalUrl.startsWith('/api/overlays/star-citizen/control')
```

**Symptom Match**:
- ? Would stop all sync, but wouldn't explain video pause
- ? Timing wouldn't be so consistent (depends on traffic)
- ? Only affects remote commands, not local playback

**Verdict**: Unlikely as primary cause, but could be secondary issue

**Test to confirm**:
```javascript
// Monitor fetch failures
const poll = async () => {
  try {
    const response = await fetch(`${OVERLAY_CONTROL_API}?after=${lastSeq}`);
    if (!response.ok) {
      console.error(`POLLING FAILED: ${response.status}`);
      return; // Silent fail currently
    }
    // ...
  } catch (err) {
    console.error('POLLING ERROR:', err);
  }
};
```

---

### Cause 4: Session Timeout or CORS Issue (MEDIUM PROBABILITY)
**How it works**:
- After 60 seconds idle, CORS preflight might fail
- Browser session might time out
- HTTP cookies might expire

**CORS Config** (from server/index.js):
```javascript
cors({
  origin: ['http://localhost:4242', 'http://localhost:4342'],
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
})
```

**Symptom Match**:
- ? CORS errors would show in console
- ? Credentials flag is set (cookies enabled)
- ? Only affects cross-origin requests (but origin is localhost in dev)

**Verdict**: Less likely in development (localhost), but possible in production

---

### Cause 5: BroadcastChannel or Tab Backgrounding (MEDIUM PROBABILITY)
**How it works**:
- Streamlabs browser source tab is backgrounded (not focused)
- Browser may throttle timers or background tabs
- BroadcastChannel might not work across boundaries
- JS timers might be throttled to 1Hz or worse

**Browser Throttling Behavior**:
- Chrome: Throttles timers to 1Hz for background tabs (default)
- Firefox: Suspends tabs after 30+ minutes
- Safari: Suspends tabs aggressively

**Symptom Match**:
- ✓ Timing could match throttle behavior
- ✓ Video would continue but at reduced frame rate
- ✓ Remote commands would be delayed

**Test to confirm**:
```javascript
let pollCount = 0;
const poll = async () => {
  pollCount++;
  const now = Date.now();
  if (window.lastPollTime) {
    const interval = now - window.lastPollTime;
    if (interval > 1000) {
      console.warn(`Long poll interval: ${interval}ms (throttled?)`);
    }
  }
  window.lastPollTime = now;
};
```

---

### Cause 6: Media Source Becoming Unplayable (LOW PROBABILITY)
**How it works**:
- Video source URL expires or becomes inaccessible
- Media element errors silently
- Fallback to last frame

**Symptom Match**:
- ? Wouldn't explain "click to enable sound" message
- ? Only affects current video item

**Verdict**: Unlikely unless media URLs have TTL

---

## Investigation Steps

### Step 1: Add Comprehensive Logging
```javascript
// Add to QuickPlayoutPage.jsx around video element

// Monitor video element state
const monitorVideoState = () => {
  const log = (msg, data) => {
    const entry = { time: Date.now(), msg, ...data };
    window.videoMonitor = window.videoMonitor || [];
    window.videoMonitor.push(entry);
    console.log(`[VIDEO] ${msg}`, data);
  };

  if (!videoRef.current) return;

  videoRef.current.addEventListener('play', () => log('PLAY'));
  videoRef.current.addEventListener('pause', () => log('PAUSE'));
  videoRef.current.addEventListener('error', (e) => log('ERROR', { error: e.error?.message }));
  videoRef.current.addEventListener('stalled', () => log('STALLED'));
  videoRef.current.addEventListener('suspend', () => log('SUSPEND'));
  videoRef.current.addEventListener('abort', () => log('ABORT'));
  
  setInterval(() => {
    if (videoRef.current) {
      log('STATE', {
        paused: videoRef.current.paused,
        currentTime: videoRef.current.currentTime,
        ended: videoRef.current.ended,
        readyState: videoRef.current.readyState, // 0-4
        networkState: videoRef.current.networkState, // 0-3
      });
    }
  }, 5000); // Every 5 seconds
};

useEffect(() => {
  monitorVideoState();
}, []);
```

### Step 2: Test Different Scenarios
1. **Test 1**: Open playout in normal browser tab (not in Streamlabs)
   - Does it work for 5+ minutes?
   - If yes: Issue is Streamlabs-specific

2. **Test 2**: Enable browser console in Streamlabs
   - DevTools (F12) → Console
   - Look for errors or warnings after ~60s
   - Check for CORS errors or network failures

3. **Test 3**: Disable autoplay restrictions
   - Set `videoRef.current.muted = false` initially
   - See if that changes behavior

4. **Test 4**: Add keepalive mechanism
   - Periodically interact with page (simulate click)
   - See if that resets the timeout

5. **Test 5**: Monitor polling interval
   - Add `console.log` to every poll
   - Check if polls stop after 60s or continue

### Step 3: Export Diagnostics
```javascript
// Make diagnostics available to console
window.exportDiagnostics = () => {
  return {
    videoMonitor: window.videoMonitor || [],
    pollCount: window.pollCount || 0,
    lastPoll: window.lastPollTime || null,
    uptime: Date.now() - window.pageLoadTime,
  };
};

// Call from console: `copy(JSON.stringify(window.exportDiagnostics()))`
```

---

## Quick Fixes to Try (Ranked by Ease)

### Fix 1: Disable Streamlabs Browser Source Refresh
**Difficulty**: User Configuration  
**Steps**:
1. In Streamlabs OBS, right-click browser source
2. Properties → Check for "Refresh" option
3. Set to "Never" or remove timer
4. Disable "Suspend when not visible"

**Expected Result**: If source reloading was the issue, this may help

### Fix 2: Add Periodic Page Interaction
**Difficulty**: Code Change (10 minutes)  
**Code**:
```javascript
// Every 30 seconds, simulate a minimal interaction to reset autoplay throttle
useEffect(() => {
  const timer = setInterval(() => {
    if (videoRef.current && videoRef.current.paused && isPlaying) {
      videoRef.current.play().catch(() => {
        console.log('Auto-resume failed, will retry');
      });
    }
  }, 30000);
  
  return () => clearInterval(timer);
}, [isPlaying]);
```

**Expected Result**: May prevent autoplay throttling

### Fix 3: Persist Playback State to localStorage
**Difficulty**: Code Change (20 minutes)  
**Logic**:
```javascript
// On page load, restore state
useEffect(() => {
  const saved = localStorage.getItem('playbackState');
  if (saved) {
    const { index, isPlaying } = JSON.parse(saved);
    setIndex(index);
    setIsPlaying(isPlaying);
  }
}, []);

// Save state on change
useEffect(() => {
  localStorage.setItem('playbackState', JSON.stringify({ index, isPlaying }));
}, [index, isPlaying]);
```

**Expected Result**: If page reloads, state is restored

### Fix 4: Add Request Header to Keep Connection Alive
**Difficulty**: Code Change (5 minutes)  
**Code**:
```javascript
// Add keep-alive header to polling requests
const response = await fetch(`${OVERLAY_CONTROL_API}?after=${lastSeq}`, {
  cache: 'no-store',
  headers: {
    'Connection': 'keep-alive',
    'Keep-Alive': 'timeout=60, max=1000',
  }
});
```

**Expected Result**: May prevent session timeout on server

---

## Monitoring Strategy

Once fixes are applied, monitor:

1. **Video State Dashboard** (add to corner of playout):
   ```
   Playing: ✓/✗
   Polls: 120/120
   Uptime: 5m 30s
   Last Poll: 0.5s ago
   ```

2. **Alert Conditions**:
   - Polls stop for >2 seconds
   - Video pauses unexpectedly
   - Network errors occur
   - Page reloads detected

3. **Telemetry**:
   - Send diagnostics to server every minute
   - Endpoint: `POST /api/debug/playout-health`
   - Log: uptime, poll success rate, video state

---

## Expected Timeline

| Action | Time | Priority |
|--------|------|----------|
| Add comprehensive logging | 30 min | HIGH |
| Test in Streamlabs with console | 15 min | HIGH |
| Identify root cause | 30 min | HIGH |
| Apply quick fix | 10-30 min | HIGH |
| Deploy and test | 15 min | HIGH |
| Monitor for 24 hours | ongoing | MEDIUM |

---

## Decision Tree for Next Steps

```
Is timeout consistent at ~60 seconds?
├─ YES: Likely Streamlabs refresh or autoplay throttle
│  ├─ Disable Streamlabs refresh first
│  └─ If no change: Add keepalive + monitor timer throttling
└─ NO: Likely rate limiting or session timeout
   ├─ Check relay polling success rate
   └─ Add monitoring to identify pattern

Does video still render but frozen?
├─ YES: Autoplay throttle (video paused by browser)
│  └─ Fix: Auto-resume on timer + disable Streamlabs refresh
└─ NO: Entire source stopped/reloaded
   ├─ Likely Streamlabs refresh cycle
   └─ Fix: Disable refresh + restore state from localStorage

Does remote control still work?
├─ YES: UI updated, just video stuck (autoplay issue)
│  └─ Fix: Video auto-resume
└─ NO: No polling/sync (session or network issue)
   ├─ Fix: Keep-alive headers + CORS debugging
   └─ Monitor polling request success rate
```

---

## Success Criteria

Once fixed:
- ✓ Playout runs for >30 minutes without stopping
- ✓ Remote commands continue to work
- ✓ Video plays continuously
- ✓ No console errors or warnings
- ✓ Streamlabs OBS shows live stream without interruption
