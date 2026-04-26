# StreamerOps Wizard System - Design Proposal

**Status**: Architectural Proposal  
**Date**: April 25, 2026  
**Related**: Advanced UI in `OverlaysStarCitizenQuickPlayoutPage.jsx`

---

## Executive Summary

The current StreamerOps overlay system is a **monolithic, feature-complete advanced UI** packed into a single page. While powerful, it requires operator familiarity with all features. A **Wizard system** would provide:

- **Guided workflows** for common tasks (setup broadcast, switch BRB, etc.)
- **Progressive disclosure** (show only relevant options)
- **Reusable component library** for future overlays
- **Lower barrier to entry** for new operators
- **Preset-based automation** (save/recall broadcaster state)

This document outlines the wizard concept, architectural decisions, and phased implementation strategy.

---

## Current System Architecture

### Advanced UI (Existing)
**Location**: `OverlaysStarCitizenQuickPlayoutPage.jsx`  
**Approach**: Everything on one page with all controls visible  
**Pros**:
- Power user friendly
- No modal/navigation overhead
- Full state visibility at all times
- Works for complex branching scenarios

**Cons**:
- Cognitive overload for first-time users
- Hard to follow a specific workflow
- No guidance on "what to do next"
- Screen real estate constraints

### Relay Architecture (Shared)
Both advanced UI and wizard use the same underlying systems:
- **Relay API**: `/api/overlays/star-citizen/control` (event queue, polling)
- **BroadcastChannel**: Same-browser fallback sync
- **Live library**: Playlist hydration
- **State management**: React hooks + refs (no Redux/Zustand needed)

---

## Wizard System Concept

### Philosophy
A **wizard** is a guided, multi-step interface that:
1. **Asks questions** to understand broadcaster intent
2. **Suggests actions** based on context
3. **Validates input** before execution
4. **Provides feedback** at each step
5. **Saves presets** for repeated workflows

### Key Insight: The Loop
Most streaming workflows follow a pattern:
```
1. Select content (which videos/images to play)
2. Configure playback (loop? duration? visibility?)
3. Set output (clean/overlay/source-capture?)
4. Execute (go live)
5. Monitor (watch for issues)
6. Adjust (next/prev/pause if needed)
7. REPEAT
```

The wizard optimizes steps 1-4 into a linear flow. The advanced UI handles steps 5-7 and ad-hoc control.

---

## Proposed Wizard Workflows

### Workflow 1: Quick Broadcast Setup
**Use Case**: "I want to go live with a intro video, then show my content, with optional music"

**Steps**:
1. **Select intro**: Pick video (or skip)
2. **Select main content**: Playlist from library or upload
3. **Set loop**: Auto-advance or manual control?
4. **Configure playback**: 
   - Mute audio? (for in-game audio)
   - Show header/disclaimer?
   - Stage mode: Fixed 16:9 or fit to window?
5. **Configure output**: Clean (for capture), overlay (for self), or both?
6. **Review & confirm**: "Ready to go live?"
7. **Execute**: Load playout, set Streamlabs source to URL

**Save as Preset**: "My Broadcast Setup"

### Workflow 2: Quick BRB (Be Right Back)
**Use Case**: "I need a hold screen for 5 minutes"

**Steps**:
1. **Select BRB image/video**: Browse presets (or upload)
2. **Add music**: Optional background music
3. **Set duration**: Auto-advance after X minutes? Or manual?
4. **Confirm**: "BRB in 5 min?"
5. **Execute**: Switch to BRB content

**Save as Preset**: "BRB - Standard"

### Workflow 3: Content Swap
**Use Case**: "I want to switch what's playing without restarting everything"

**Steps**:
1. **Current playlist check**: Show what's playing now
2. **Select new content**: Browse library
3. **Confirm swap**: "Replace current playlist?"
4. **Execute**: Load new content, maintain loop/playback settings

**Note**: No full page reload; just update playlist state (from advanced UI perspective, this is immediate)

---

## Data Model for Presets

### Preset Schema
```javascript
{
  id: "preset-broadcast-standard-2026",
  name: "My Broadcast Setup",
  type: "broadcast", // or "brb", "content-swap"
  createdAt: "2026-04-25T14:30:00Z",
  lastUsedAt: "2026-04-25T21:15:00Z",
  config: {
    // Wizard questions & answers
    introVideo: "https://...",
    contentPlaylist: ["item1", "item2", "item3"],
    autoLoop: true,
    muteAudio: false,
    showHeader: true,
    showDisclaimer: true,
    stageMode: "fixed16x9", // or "fit"
    outputModes: ["clean", "overlay"], // which outputs to show
    // Additional metadata
    tags: ["broadcast", "morning", "ready-to-go"],
    notes: "Standard setup for morning streams"
  }
}
```

### Storage Options
1. **localStorage**: 5-10 MB limit per origin, good for 10-20 presets
2. **IndexedDB**: 50+ MB typical, better for media files
3. **Backend (`/api/presets`)**: Centralized, survives device loss, requires auth
4. **Hybrid**: localStorage for quick access, sync to backend async

---

## Wizard UI Component Structure

```
<WizardContainer>
  <WizardStep1_SelectContent>
    <ContentBrowser />
    <PresetQuickLoad />
  </WizardStep1_SelectContent>

  <WizardStep2_ConfigurePlayback>
    <LoopToggle />
    <DurationPicker />
    <AudioSettings />
  </WizardStep2_ConfigurePlayback>

  <WizardStep3_ConfigureOutput>
    <OutputModeSelector /> <!-- clean/overlay/source-capture -->
    <StageModeSelector /> <!-- fixed16x9/fit -->
    <VisibilityToggles />
  </WizardStep3_ConfigureOutput>

  <WizardStep4_ReviewAndExecute>
    <PresetReview /> <!-- Show all selected values -->
    <SavePresetForm /> <!-- Save for later? -->
    <ExecuteButton /> <!-- Go live -->
  </WizardStep4_ReviewAndExecute>
</WizardContainer>
```

### Navigation
```
Step 1 → 2 → 3 → 4 → Execute
  ↓       ↓    ↓    ↓
Back buttons skip steps if user goes back
"Use Preset" shortcut to auto-fill all steps from saved config
"Start Over" resets all fields
```

---

## Integration Points

### With Advanced UI
```
Graph:
┌─────────────────────────────────────────┐
│  Overlay Page (Router)                  │
├─────────────────────────────────────────┤
│  <Route path="setup" → Wizard />        │
│  <Route path="control" → Advanced UI /> │
│  <Route path="playout" → Playout />    │
└─────────────────────────────────────────┘

Sharing:
- Both use same relay API
- Both update same state (playlist, playback settings)
- Both respect locks (visibilityLocked, stageLocked, etc.)
- Wizard output feeds into Advanced UI
```

### With Relay API
```
Wizard doesn't send commands; it configures state:
- Wizard: setPlaylist([...]) + setOutputMode('clean') + setStageMode('fixed16x9')
- Advanced UI: Polls relay, executes next/prev/play/pause commands

Wizard is "configuration", Advanced UI is "control"
```

### With Presets & Storage
```
Storage Flow:
User fills wizard → clicks "Save Preset" 
→ Preset stored in localStorage/IndexedDB
→ Next time, user clicks "Use Preset: My Broadcast Setup"
→ All fields auto-filled
→ One click to go live
```

---

## Implementation Phases

### Phase 1: Wizard MVP (Week 1-2)
**Goal**: Working prototype for "Quick Broadcast Setup" workflow

**Scope**:
- [x] Wizard scaffolding + Step navigation
- [x] Step 1: Content selection (browser + multi-select)
- [x] Step 2: Playback config (loop, mute)
- [x] Step 3: Output mode + stage mode
- [x] Step 4: Review + Execute
- [ ] localStorage preset saving

**Files to create**:
- `app/pages/OverlaysWizardPage.jsx` (main wizard)
- `app/components/WizardStep1_SelectContent.jsx`
- `app/components/WizardStep2_ConfigurePlayback.jsx`
- `app/components/WizardStep3_ConfigureOutput.jsx`
- `app/components/WizardStep4_Review.jsx`
- `app/hooks/useWizardState.js` (state management)
- `app/hooks/usePresets.js` (preset save/load)

**Integration**:
- Add route: `/overlays/window/star-citizen-wizard`
- Share relay API + state with advanced UI
- No changes to existing advanced UI

### Phase 2: Preset System (Week 2-3)
**Goal**: Save, load, and manage presets

**Scope**:
- [x] Preset modal (create/update/delete)
- [x] Preset browser (list + search)
- [x] localStorage persistence
- [ ] Backend sync (`/api/presets`)
- [ ] Tagging & favoriting

**Files to create**:
- `app/components/PresetManager.jsx`
- `app/components/PresetBrowser.jsx`
- `app/utils/presetsStorage.js`

### Phase 3: BRB Workflow (Week 3)
**Goal**: Dedicated BRB wizard (simpler than broadcast)

**Scope**:
- [x] Simplified 3-step wizard
- [x] BRB media templates
- [x] Duration countdown

**Files to create**:
- `app/pages/OverlaysBRBWizardPage.jsx`

### Phase 4: Advanced Features (Week 4+)
**Scope**:
- [ ] Branching workflows (if music, then ask for volume)
- [ ] Preset templates (broadcast, BRB, starting-soon, etc.)
- [ ] Backend preset sync
- [ ] Batch presets (apply same config to multiple overlays)
- [ ] Undo/redo for wizard changes
- [ ] Integration with Streamlabs API (direct scene/source creation)

---

## Technology Decisions

### State Management
**Option A**: React Context (Chosen for MVP)
- **Pros**: Zero dependencies, simple for 1-2 wizards, works with existing hooks
- **Cons**: Prop drilling, no persistence without custom hook

**Option B**: Zustand
- **Pros**: Minimal, has persistence plugin, good for presets
- **Cons**: New dependency, overkill for MVP

**Decision**: Use Context for MVP (phase 1), migrate to Zustand in phase 2 if needed.

### UI Library
**Already using**: Mantine core components (badges, buttons, stacks)  
**Extend with**:
- `Stepper` component from Mantine (for step indication)
- `Modal` for preset management
- `FileInput` for media uploads
- `MultiSelect` for playlist picking

### Storage
**Phase 1**: localStorage (simple, no backend changes)  
**Phase 2**: IndexedDB (more space) or `/api/presets` (backend sync)

### Routing
**Option A**: Same page, hide/show components (simpler)
**Option B**: Separate routes (`/wizard`, `/wizard/step1`, etc.) (cleaner URLs)

**Decision**: Option A for MVP (reduce route complexity), switch to Option B if UX testing shows it's needed.

---

## Design Patterns

### Step Component Pattern
```javascript
function WizardStep({ stepNumber, title, children, onNext, onBack, isLastStep }) {
  return (
    <Stack>
      <Group><Badge>{stepNumber}/4</Badge><Title>{title}</Title></Group>
      <Box className="wizard-content">{children}</Box>
      <Group justify="space-between">
        <Button onClick={onBack} disabled={stepNumber === 1}>← Back</Button>
        <Button onClick={onNext}>{isLastStep ? '🚀 Go Live' : 'Next →'}</Button>
      </Group>
    </Stack>
  );
}
```

### Preset Hook Pattern
```javascript
function usePresets() {
  const [presets, setPresets] = useState(() => loadPresetsFromStorage());
  
  const save = (preset) => {
    const updated = [...presets, { ...preset, id: generateId() }];
    setPresets(updated);
    localStorage.setItem('wizardPresets', JSON.stringify(updated));
  };
  
  const load = (id) => presets.find(p => p.id === id);
  const delete_ = (id) => setPresets(presets.filter(p => p.id !== id));
  
  return { presets, save, load, delete_ };
}
```

### Form Validation Pattern
```javascript
function useWizardForm() {
  const [form, setForm] = useState({});
  const [errors, setErrors] = useState({});
  
  const validate = () => {
    const newErrors = {};
    if (!form.contentPlaylist?.length) newErrors.contentPlaylist = 'Pick at least one item';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  return { form, setForm, errors, validate };
}
```

---

## Future Enhancements

### Wizard Analytics
Track which workflows are most used, where users get stuck:
```javascript
logWizardStep('broadcast', 1, { 
  contentCount: 5, 
  timeSpentMs: 45000,
  abandonedAt: false 
});
```

### AI-Assisted Presets
"Based on your broadcast history, we recommend this setup"
- Analyze past presets
- Suggest similar ones
- Offer optimization tips

### Mobile Wizard
Simplified mobile-friendly version:
- Larger touch targets
- Vertical navigation
- Fewer options per screen

### Voice Commands
"Set up broadcast with my morning playlist"
- Wizard UI + voice recognition
- Good for streamers with accessibility needs

### Scene Switcher Integration
Direct Streamlabs OBS scene management:
- Wizard creates scene
- Auto-sets browser source URL
- One-click deployment

---

## Risk Mitigation

### Risk: Wizard doesn't cover power user needs
**Mitigation**: Wizard always has "advanced mode" button to jump to advanced UI. Wizard never limits functionality; it just guides.

### Risk: Preset complexity grows unchecked
**Mitigation**: Preset schema is versioned. Old presets auto-migrate. Invalid presets are silently ignored.

### Risk: State inconsistency between wizard and advanced UI
**Mitigation**: Both use same state source (React hooks in context). Wizard changes are immediately visible in advanced UI tab.

### Risk: UI confusion (too many modals/pages)
**Mitigation**: Start with single wizard instance. If multiple wizards needed (broadcast + BRB), create a wizard *selector* page first.

---

## Example: Broadcast Workflow in Code

```javascript
function BroadcastWizard() {
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState({
    contentPlaylist: [],
    autoLoop: true,
    muteAudio: false,
    stageMode: 'fixed16x9'
  });

  const handleStepChange = (delta) => {
    if (step + delta < 1 || step + delta > 4) return;
    setStep(step + delta);
  };

  const handleExecute = async () => {
    // Apply config to shared state
    setPlaylist(config.contentPlaylist);
    setIsLooping(config.autoLoop);
    setForceMute(config.muteAudio);
    setStageMode(config.stageMode);
    
    // Navigate to advanced UI to monitor
    window.location.hash = '#control';
  };

  return (
    <Container>
      {step === 1 && <SelectContentStep config={config} setConfig={setConfig} />}
      {step === 2 && <ConfigPlaybackStep config={config} setConfig={setConfig} />}
      {step === 3 && <ConfigOutputStep config={config} setConfig={setConfig} />}
      {step === 4 && <ReviewStep config={config} onExecute={handleExecute} />}
    </Container>
  );
}
```

---

## Conclusion

The Wizard system complements the advanced UI without replacing it:
- **Advanced UI**: For power users and live control (next/prev/pause)
- **Wizard**: For new operators and preset-based setup

By providing both, StreamerOps becomes accessible to streamers at all skill levels while maintaining depth for power users.

**Next Steps**:
1. Gather streamer feedback on wizard workflows (interviews with 3-5 streamers)
2. Prototype Step 1 (content selection) to validate UX
3. Plan Phase 1 implementation sprint
4. Define preset schema in detail before Phase 2
