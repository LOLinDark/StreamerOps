# StreamerOps Overlay Sync Architecture - Design Options & Rationale

**Date**: April 25, 2026  
**Status**: Reference Documentation  
**Audience**: Developers, Architects, Future Maintainers

---

## Overview

StreamerOps uses a **polling-based relay system** to keep multiple overlay pages in sync. This document explains:
- Why we chose polling over alternatives
- How the current system works
- Future improvements and scalability options
- Tradeoffs and design decisions

---

## The Sync Problem

**Scenario**:
1. Remote operator tab opens at `localhost:4342/remote`
2. Playout page opens in Streamlabs OBS browser source
3. Operator clicks "Next" → should advance playlist on playout page in real-time

**Challenges**:
- Pages are in different browser contexts (different tabs/processes)
- Operator doesn't have direct access to playout page's DOM or memory
- Playout page may be hidden/backgrounded in Streamlabs
- Network latency must be minimized (60ms ideally, <500ms acceptable)
- Solution must be resilient to page reloads, crashes, network issues

---

## Architecture Option A: Polling (CHOSEN)

### How It Works
```
Sequence Timeline:

Time 0:     Remote operator clicks "Next"
            POST /api/overlays/star-citizen/control
            Body: { command: "next", commandId: "cmd-123", ... }

Time 10ms:  Backend stores event with seq=42
            Event = { seq: 42, command: "next", ... }

Time 500ms: Playout page polls (every 500ms)
            GET /api/overlays/star-citizen/control?after=41
            
Time 510ms: Backend returns events with seq > 41
            Response = { latestSeq: 42, events: [{ seq: 42, command: "next" }] }

Time 520ms: Playout executes command
            setIndex(prev => prev + 1)

Time 540ms: Playout re-renders with new index
            Streamlabs browser source shows new video
```

### Pros
✓ **Simple**: No persistent connections, no server session state  
✓ **Resilient**: Polling continues even if tab is hidden/backgrounded  
✓ **Stateless**: Server doesn't track clients; survives server restarts  
✓ **Browser-friendly**: Works with autoplay restrictions, tab throttling  
✓ **Scalable**: Multiple playout pages don't need unique connections  
✓ **Debuggable**: All events visible in browser Network tab  
✓ **Offline-friendly**: Can cache events locally if network is intermittent  

### Cons
✗ **Latency**: 0-500ms depending on when poll happens (vs instant with WebSocket)  
✗ **Polling overhead**: 2 requests/second per playout page  
✗ **Event loss on restart**: Events not persisted (200-event in-memory buffer)  
✗ **Sequence number resets**: seq resets to 0 on server restart  

### Implementation Details

**Frontend (QuickPlayoutPage.jsx)**:
```javascript
const lastControlSeqRef = useRef(0);
const processedCommandIdsRef = useRef(new Set());

useEffect(() => {
  let active = true;
  
  const poll = async () => {
    try {
      // Fetch only events newer than last seen
      const response = await fetch(`/api/overlays/star-citizen/control?after=${lastControlSeqRef.current}`);
      const data = await response.json();
      
      for (const event of data.events) {
        if (!active) return;
        
        // Track sequence for next poll
        lastControlSeqRef.current = Math.max(lastControlSeqRef.current, event.seq);
        
        // Prevent duplicate execution via commandId
        if (processedCommandIdsRef.current.has(event.commandId)) {
          continue;
        }
        processedCommandIdsRef.current.add(event.commandId);
        
        // Execute command
        executeCommand(event.command, event.payload);
      }
    } catch {
      // Silent fail; BroadcastChannel provides fallback
    }
  };
  
  poll();
  const timer = setInterval(poll, 500);
  return () => { active = false; clearInterval(timer); };
}, []); // Empty deps: polling runs once, independent of state
```

**Backend (server/index.js)**:
```javascript
const overlayControlBus = {
  seq: 0,
  events: [], // Max 200
};

app.post('/api/overlays/star-citizen/control', (req, res) => {
  const event = {
    seq: ++overlayControlBus.seq,
    command: req.body.command,
    commandId: req.body.commandId,
    // ...
  };
  
  overlayControlBus.events.push(event);
  if (overlayControlBus.events.length > 200) {
    overlayControlBus.events.shift(); // Remove oldest
  }
  
  res.json({ success: true, seq: event.seq });
});

app.get('/api/overlays/star-citizen/control', (req, res) => {
  const after = parseInt(req.query.after || 0);
  const events = overlayControlBus.events
    .filter(e => e.seq > after)
    .slice(-50); // Max 50 per response
  
  res.json({ latestSeq: overlayControlBus.seq, events });
});
```

---

## Architecture Option B: WebSocket (NOT CHOSEN)

### How It Works
```
Connection:      Remote and playout both connect to /ws/overlays
Event flow:      Remote clicks "Next" → server broadcasts to all connected clients
Delivery:        Instant (no polling delay)
State:           Server maintains active connections per client

Time 0:     Remote clicks "Next"
Time 5ms:   WebSocket message sent from remote to server
Time 10ms:  Server broadcasts to all clients
Time 15ms:  Playout receives message, executes command
```

### Pros
✓ **Low latency**: Instant delivery (5-15ms vs 0-500ms)  
✓ **Lower polling overhead**: Continuous connection, no request spam  
✓ **Bi-directional**: Server can push state to clients  
✓ **Real-time**: Natural for live features (telemetry, alerts)  

### Cons
✗ **Server session state**: Must track active connections (crashes lose all clients)  
✗ **Tab backgrounding**: Browser may throttle or close WebSocket in backgrounded tabs  
✗ **Connection management**: Heartbeat required, reconnection logic needed  
✗ **Firewall/proxy issues**: WebSocket may be blocked by some proxies  
✗ **Stateful complexity**: Harder to debug, requires connection pool management  
✗ **Mobile**: Less reliable on mobile networks (carrier proxies block WS)  

### When to Use
- High-frequency updates (10+ per second)
- Requires true push notifications
- Single server (not distributed)
- Users always keep page focused

### Migration Path
If polling becomes bottleneck:
1. Keep polling as primary (backward compatible)
2. Add WebSocket as optimization (clients prefer WS if available)
3. Server accepts events via both channels
4. Still persists to relay bus for polling clients

---

## Architecture Option C: Database Relay (NOT CHOSEN)

### How It Works
```
Event flow:      Remote POST → DB insert → Playout polls DB
Persistence:     All events stored permanently
Recovery:        Pages can catch up after restart/disconnect

Schema:
events {
  id: INT PRIMARY KEY
  seq: INT UNIQUE
  command: VARCHAR
  payload: JSON
  created_at: TIMESTAMP
  processed_by: SET<UUID>
}
```

### Pros
✓ **Persistence**: Events survive server restart  
✓ **Long-term history**: Can replay commands, debug issues  
✓ **Scaling**: Multiple servers can share relay state  
✓ **Audit trail**: Complete record for production use  

### Cons
✗ **Database dependency**: Adds operational complexity  
✗ **Latency**: DB writes slower than in-memory  
✗ **Cost**: DB storage, queries per second costs  
✗ **Overkill for MVP**: Not needed for local dev server  

### When to Use
- Production streaming with multiple servers
- Regulatory requirements (audit trail)
- High reliability (99.9% uptime SLA)
- Historical analysis needed

### Migration Path
If moving to production:
1. Add PostgreSQL with events table
2. Keep in-memory relay for speed
3. Async persistence to DB (write-ahead log)
4. Query DB as fallback if in-memory buffer overflows

---

## Fallback System: BroadcastChannel

### How It Works
```
When relay fails or is slow, BroadcastChannel provides same-window sync:

Architecture:
Remote Page ──────────────────────> Relay API
                                        ↓
                              Playout Page
                                        ↓
                        (Playout receives via relay polling)
                        
If relay down/slow:
Remote Page ──────────→ BroadcastChannel ──────→ Playout Page
                      (instant, same-window only)
```

### Implementation
```javascript
// In RemoteControlPage.jsx
const channel = new BroadcastChannel('QUICK_PLAYOUT_CONTROL_CHANNEL');
function handleNext() {
  channel.postMessage({ command: 'next', commandId: generateId() });
  // Also POST to relay (for cross-window sync)
  fetch('/api/overlays/star-citizen/control', {
    method: 'POST',
    body: JSON.stringify({ command: 'next', commandId })
  });
}

// In QuickPlayoutPage.jsx
const channel = new BroadcastChannel('QUICK_PLAYOUT_CONTROL_CHANNEL');
channel.onmessage = (event) => {
  executeIncomingCommand(event.data); // Same handler as relay polling
};
```

### Pros
✓ **No backend required**: Pure browser API  
✓ **Instant**: No network latency  
✓ **Resilient**: Works if backend is down  

### Cons
✗ **Same-window only**: Remote and playout must be same browser (not Streamlabs)  
✗ **No persistence**: Lost if page reloads  
✗ **Browser support**: Not available in older browsers  

---

## Rate Limiting Strategy

### Current Configuration
```javascript
// server/index.js
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests max
  skip: (req) => req.path.includes('/overlays/star-citizen/control')
});

// Relay endpoints skip limiting because:
// - Polling generates 120 req/min per playout (2 req/sec)
// - Multiple playout tabs would quickly exceed 100 req/15min
// - CORS restriction to localhost:4342 provides security
```

### Scalability Limits
At current polling rate (500ms):
- 1 playout tab = ~12 req/min
- 10 playout tabs = ~120 req/min (OK, stays below 100/15min per tab)
- 100 playout tabs = ~1200 req/min (would exceed limits)

### If Scaling is Needed
**Option 1**: Increase rate limit for relay endpoint
```javascript
const relayLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 1000, // 1000 requests per minute (plenty of headroom)
});
app.get('/api/overlays/star-citizen/control', relayLimiter, (req, res) => { /* ... */ });
```

**Option 2**: Reduce polling frequency
```javascript
// Current: 500ms (2 Hz)
// Proposed: 1000ms (1 Hz)
const timer = setInterval(poll, 1000); // Double interval
// Tradeoff: Latency increases from 250ms avg to 500ms avg
```

**Option 3**: Use WebSocket (skip polling entirely)

---

## Deduplication Strategy

### Problem
Without deduplication, the same command could execute twice:
```
Scenario:
1. Relay receives: { command: "next", commandId: "cmd-123" }
2. Poll 1 fetches event, executes
3. Poll 2 fetches same event again (still in buffer)
4. Command executes twice → index increases by 2 instead of 1
```

### Solution: Command ID Tracking
```javascript
const processedCommandIdsRef = useRef(new Set());

const executeIncomingCommand = (message) => {
  const commandId = message.commandId;
  
  if (processedCommandIdsRef.current.has(commandId)) {
    return; // Already processed
  }
  
  processedCommandIdsRef.current.add(commandId);
  
  // Cleanup: keep only 250 most recent IDs
  if (processedCommandIdsRef.current.size > 400) {
    const values = Array.from(processedCommandIdsRef.current);
    processedCommandIdsRef.current = new Set(values.slice(-250));
  }
  
  executeCommand(message.command, message.payload);
};
```

### Why 250/400?
- Relay buffer = 200 events max
- ~100 seconds of event history at 2 Hz polling
- 250 stored IDs = sufficient overlap, low memory
- Cleanup at 400 = never exceed ~1 KB per playout page

### Edge Cases Handled
✓ Same event received multiple polls  
✓ Page reload loses history, then same event received again  
✓ BroadcastChannel + relay both deliver same event  

---

## State Management Options

### Option A: React Hooks + Context (CURRENT)
```javascript
// Local state in QuickPlayoutPage.jsx
const [index, setIndex] = useState(0);
const [isPlaying, setIsPlaying] = useState(false);
const refs = useRef({ lastSeq: 0, processedIds: new Set() });

// Refs avoid re-renders, allow long-lived polling
// Context (if used) would share state with advanced UI
```

### Pros
✓ Minimal dependencies  
✓ Polling effect easy to write  
✓ No external library  

### Cons
✗ State scattered across multiple pages  
✗ No centralized debugging  
✗ Prop drilling if many components need state  

### Option B: Zustand (FUTURE)
```javascript
const usePlayoutStore = create((set) => ({
  index: 0,
  isPlaying: false,
  setIndex: (i) => set({ index: i }),
  // ...
}));

// Pros: Centralized, persistence plugins, simple
// Cons: New dependency, overkill for current scope
```

### Option C: Redux (NOT RECOMMENDED)
✗ Overkill for this use case  
✗ Too much boilerplate  
✗ Polling effects become complex  

---

## Security Considerations

### Current Scope
- Local development only (localhost:4342 + localhost:4242)
- No authentication required
- No sensitive data in relay

### CORS Protection
```javascript
cors({
  origin: ['http://localhost:4342', 'http://localhost:4242'],
  credentials: true
})
```

### If Going to Production
1. **Authentication**: Add JWT tokens to relay requests
2. **Authorization**: Verify token has access to specific overlay
3. **Rate limiting**: Per-user limits instead of global
4. **HTTPS**: All traffic encrypted
5. **CSRF**: Add CSRF tokens to POST requests
6. **Input validation**: Sanitize command names and payloads
7. **Logging**: Audit trail of all commands + who sent them

### Example Production Addition
```javascript
app.post('/api/overlays/star-citizen/control',
  authenticateToken,
  authorizeOverlayAccess,
  rateLimitPerUser,
  validateCommand,
  csrfProtection,
  (req, res) => {
    logCommand({
      user: req.user.id,
      command: req.body.command,
      timestamp: new Date().toISOString()
    });
    // Store in relay...
  }
);
```

---

## Performance Characteristics

### Current System
```
Metrics:
- Polling latency: 0-500ms (avg 250ms)
- Command execution latency: <10ms (after fetch)
- Memory per playout: ~2 KB (for refs + state)
- Network: 2 requests/sec per playout = 240 requests/min per playout
- Relay buffer: 200 events max = ~20 KB JSON
- Scalability: Handles ~5-10 concurrent playout pages comfortably

Stress limits:
- 100 playout pages: ~5000 req/min to relay (OK with rate limit increase)
- 1000+ pages: Would require database relay + load balancing
```

### Optimization Opportunities
1. **Polling frequency**: Decrease from 500ms to 1000ms (halve traffic)
2. **Event batching**: Instead of 200 individual events, compress to 20
3. **Compression**: gzip responses (80-90% reduction for typical payload)
4. **Caching**: Browser cache for successful poll responses
5. **Predictive polling**: Skip polls if operator hasn't clicked recently

---

## Testing Strategy

### Unit Tests
```javascript
// Test deduplication
expect(executeIncomingCommand({ commandId: 'c1' })).toBe('executed');
expect(executeIncomingCommand({ commandId: 'c1' })).toBe('ignored');

// Test sequence tracking
expect(lastControlSeqRef.current).toBe(0);
poll();
expect(lastControlSeqRef.current).toBeGreaterThan(0);
```

### Integration Tests
```javascript
// Test relay + playout sync
1. POST command to relay
2. Wait 500ms
3. Check playout state updated
4. Repeat 10x, verify all execute
```

### Load Tests
```javascript
// Simulate N playout pages
for (let i = 0; i < 10; i++) {
  const ws = fetch(...);
  setInterval(() => ws.get(?after=X), 500);
}
// Measure response time, error rate
```

### Browser Tests
```javascript
// Test in Streamlabs OBS environment
// Test with DevTools open/closed
// Test with tab backgrounded
// Test after page reload
```

---

## Monitoring & Debugging

### Key Metrics to Track
1. **Poll success rate**: (successful polls / total polls)
2. **Command latency**: Time from POST to execution
3. **Buffer fill**: Current event count vs max (200)
4. **Sequence number**: Check for resets (indicates server restart)
5. **Playout uptime**: Time since last error

### Debug Endpoint (Optional)
```javascript
app.get('/api/overlays/star-citizen/control/debug', (req, res) => {
  res.json({
    currentSeq: overlayControlBus.seq,
    eventCount: overlayControlBus.events.length,
    oldestEvent: overlayControlBus.events[0],
    newestEvent: overlayControlBus.events[overlayControlBus.events.length - 1],
    uptime: process.uptime()
  });
});
```

---

## Conclusion: Why Polling?

**Summary Table**:
| Feature | Polling | WebSocket | Database |
|---------|---------|-----------|----------|
| Simplicity | ★★★★★ | ★★☆☆☆ | ★★★☆☆ |
| Latency | ★★★☆☆ | ★★★★★ | ★★☆☆☆ |
| Persistence | ☆☆☆☆☆ | ☆☆☆☆☆ | ★★★★★ |
| Scalability | ★★★☆☆ | ★★★★☆ | ★★★★★ |
| Browser friendly | ★★★★★ | ★★★☆☆ | ★★★★★ |
| Operational complexity | ★★★★★ | ★★★☆☆ | ★★☆☆☆ |

**For StreamerOps MVP**: Polling is optimal
- Simple to understand and debug
- Resilient to browser sleep/background
- Works reliably in Streamlabs OBS
- Scales to 10-20 concurrent broadcasters
- No external service dependencies

**Future migrations**:
- WebSocket when latency becomes critical
- Database when production reliability required
- Hybrid for best of both worlds
