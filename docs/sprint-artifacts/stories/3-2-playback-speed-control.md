# Story 3-2: Playback Speed Control

**Epic:** 3 - Playback Controls & Mini-Player
**Status:** ready-for-dev
**Created:** 2025-12-12

## User Story

As a user,
I want to adjust the playback speed,
So that I can listen faster or slower based on my preference.

## Context

This story adds speed control to the SimpleReader extension. The infrastructure for speed already exists:
- `lib/storage.ts` defines `STORAGE_KEYS.preferredSpeed` with sync storage helpers
- `lib/constants.ts` defines `MIN_SPEED` (0.5), `MAX_SPEED` (2.0), `DEFAULT_SPEED` (1.0), and `clampSpeed()` helper
- TTS engines (`tts-engine.ts` and `web-speech.ts`) already accept and apply speed parameters
- `background.ts` already reads `preferredSpeed` from storage and passes it to TTS generation
- `popup/App.tsx` already displays the current speed but lacks controls to change it

What's missing: **UI controls** to let users change speed during playback with immediate effect.

## Acceptance Criteria

### AC1: Speed Slider in Popup UI
**Given** the popup is open
**When** I view the playback controls
**Then** a speed slider is visible below the play/pause/stop buttons
**And** the slider shows the current speed value (e.g., "1.0x")
**And** the slider range is 0.5x to 2.0x

### AC2: Speed Adjustment in 0.25x Steps
**Given** I am adjusting the speed slider
**When** I move the slider
**Then** speed changes in 0.25x increments (0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0)
**And** the current speed value updates in real-time as I drag

### AC3: Speed Persists to Storage
**Given** I have changed the speed
**When** I close and reopen the popup or browser
**Then** my preferred speed is restored from `chrome.storage.sync`
**And** new playback sessions start at my preferred speed

### AC4: Speed Changes Apply Immediately During Playback
**Given** audio is currently playing
**When** I adjust the speed slider
**Then** the playback speed changes immediately without stopping/restarting
**And** word highlighting timing adjusts to match the new speed

## Technical Requirements

### Files to Modify

1. **`entrypoints/popup/App.tsx`**
   - Add speed slider component below playback controls
   - Display current speed value
   - Handle speed change events
   - Save to storage on change
   - Send speed change message to background

2. **`entrypoints/popup/App.css`**
   - Style the speed slider component
   - Match existing popup design language

3. **`lib/messages.ts`**
   - Add new message type: `PLAYBACK_SPEED_CHANGE`
   - Add to `PlaybackMessage` union type
   - Add `Messages.playbackSpeedChange()` helper

4. **`entrypoints/background.ts`**
   - Handle `PLAYBACK_SPEED_CHANGE` message
   - Forward speed change to offscreen document
   - Adjust highlight timing calculations for new speed

5. **`entrypoints/offscreen/index.ts`**
   - Handle speed change during active playback
   - Adjust audio playback rate on AudioContext/HTMLAudioElement

### Implementation Details

#### Speed Slider Component (popup)

```tsx
// In App.tsx - add after controls div
const handleSpeedChange = async (newSpeed: number) => {
  setSpeed(newSpeed);
  await setSyncValue(STORAGE_KEYS.preferredSpeed, newSpeed);
  chrome.runtime.sendMessage(Messages.playbackSpeedChange(newSpeed));
};

// Render slider
<div className="speed-control">
  <label htmlFor="speed-slider">Speed: {speed}x</label>
  <input
    type="range"
    id="speed-slider"
    min={0.5}
    max={2.0}
    step={0.25}
    value={speed}
    onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
  />
</div>
```

#### Message Type Addition (messages.ts)

```typescript
// Add to PlaybackMessage union:
| { type: 'PLAYBACK_SPEED_CHANGE'; speed: number }

// Add to Messages object:
playbackSpeedChange: (speed: number): PlaybackMessage => ({
  type: 'PLAYBACK_SPEED_CHANGE',
  speed,
}),
```

#### Background Handler (background.ts)

```typescript
case 'PLAYBACK_SPEED_CHANGE':
  // Update current playback speed
  currentSpeed = message.speed;
  // Forward to offscreen for audio rate adjustment
  chrome.runtime.sendMessage(Messages.playbackSpeedChange(message.speed));
  // Recalculate highlight timing with new speed
  recalculateHighlightTiming(message.speed);
  sendResponse({ success: true });
  return false;
```

#### Audio Playback Rate (offscreen)

For Kokoro TTS (AudioContext-based):
- Audio rate adjustment happens via regeneration (Kokoro doesn't support real-time rate change)
- For MVP: speed change during playback queues for next sentence/chunk

For Web Speech API:
- `utterance.rate` can be modified; requires stopping and resuming with new rate

### Edge Cases

1. **Speed change while paused**: Store new speed, apply when resume
2. **Speed change while loading**: Apply to generation once it starts
3. **Speed at boundaries**: `clampSpeed()` already handles 0.5-2.0 clamping
4. **Multiple rapid changes**: Debounce storage writes (250ms)

### Testing Checklist

- [ ] Slider appears in popup below playback controls
- [ ] Slider shows current speed (default 1.0x)
- [ ] Slider moves in 0.25x steps
- [ ] Speed label updates in real-time while dragging
- [ ] Speed persists after popup close/reopen
- [ ] Speed persists after browser restart
- [ ] New playback starts at saved speed
- [ ] Speed change during Kokoro playback affects next chunk
- [ ] Speed change during Web Speech playback adjusts immediately
- [ ] Speed change while paused applies on resume
- [ ] Keyboard can adjust slider (arrow keys)

## Dependencies

- Story 2-7 (Basic Playback Controls) - **DONE**
- Story 3-1 (Keyboard Shortcut) - **DONE**

## Technical Notes

### Existing Speed Infrastructure

**Storage** (`lib/storage.ts`):
```typescript
STORAGE_KEYS.preferredSpeed  // 'preferredSpeed'
StorageValues.preferredSpeed: number
DEFAULT_STORAGE_VALUES.preferredSpeed: 1.0
getSyncValue(STORAGE_KEYS.preferredSpeed)
setSyncValue(STORAGE_KEYS.preferredSpeed, value)
```

**Constants** (`lib/constants.ts`):
```typescript
MIN_SPEED = 0.5
MAX_SPEED = 2.0
DEFAULT_SPEED = 1.0
clampSpeed(speed: number): number
```

**TTS Generation** (`tts-engine.ts`):
```typescript
generateSpeech(text, voice, speed, onChunk, onProgress)
generateSpeechWithFallback(text, voice, speed, ...)
// speed already passed through and applied
```

**Web Speech** (`web-speech.ts`):
```typescript
speak(text, voice, speed, callbacks)
// utterance.rate = clampSpeed(speed)
```

**Background** (`background.ts`):
```typescript
const speed = await getSyncValue(STORAGE_KEYS.preferredSpeed) || 1.0;
Messages.ttsGenerate(text, voice, speed)
```

**Popup** (`App.tsx`):
```typescript
const [speed, setSpeed] = useState<number | null>(null);
// Displays speed but no controls to change it
<span className="setting">Speed: {speed}x</span>
```

### Real-time Speed Change Considerations

**Kokoro TTS**: Generated audio is at fixed rate. Real-time speed change requires:
- Option A: Regenerate from current position (complex, delays)
- Option B: Apply to next chunk only (simpler, recommended for MVP)
- Option C: Use Web Audio API playbackRate on AudioBufferSourceNode

**Web Speech API**: Supports rate change, but requires:
- Stop current utterance
- Resume from word position with new rate
- Use `speechSynthesis.cancel()` then `speak()` with adjusted rate

### Recommended MVP Approach

1. Speed slider saves preference immediately
2. Speed applies to next playback session automatically
3. During active playback:
   - For Kokoro: Display "Speed will apply to next playback"
   - For Web Speech: Apply immediately (stop/resume acceptable)

### Future Enhancement (Post-MVP)

- Real-time speed adjustment via Web Audio API `playbackRate`
- Speed presets (0.75x, 1.0x, 1.5x, 2.0x buttons)
- Per-site speed preferences

## Story Points

**Estimate:** 3 points (small-medium complexity)

- UI work is straightforward (slider component)
- Message passing infrastructure exists
- Speed parameter already flows through system
- Edge cases around real-time changes add complexity

## Definition of Done

- [ ] Speed slider visible in popup UI
- [ ] Slider range: 0.5x to 2.0x in 0.25x steps
- [ ] Speed value displayed alongside slider
- [ ] Speed persists to chrome.storage.sync
- [ ] Speed restored on popup reopen
- [ ] New playback uses saved speed
- [ ] Speed changes apply (at minimum) to next playback
- [ ] No console errors
- [ ] Code follows existing patterns (sr- prefix, typed messages)
