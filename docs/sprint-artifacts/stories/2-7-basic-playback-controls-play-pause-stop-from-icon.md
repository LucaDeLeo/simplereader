# Story 2.7: Basic Playback Controls (Play/Pause/Stop from Icon)

## Story Info

| Field | Value |
|-------|-------|
| Epic | 2 - First Play Experience (The Magic Moment) |
| Story ID | 2-7 |
| Story Key | 2-7-basic-playback-controls-play-pause-stop-from-icon |
| Status | review |
| Created | 2025-12-11 |

---

## User Story

As a user,
I want to start, pause, and stop playback with simple controls,
So that I have basic control over the listening experience.

---

## Context & Background

This is the **final story in Epic 2**, the capstone that integrates all prior work into the complete "magic moment" experience. When complete, a user can:

1. Navigate to any article page
2. Click the extension icon
3. Click play and hear the article read aloud
4. See words highlighted in sync with audio
5. Pause, resume, and stop as needed

### Integration Summary

This story orchestrates components built in previous stories:

| Component | Story | Location | Purpose |
|-----------|-------|----------|---------|
| Content Extraction | 2-1 | `entrypoints/content/extractor.ts` | Extract article text via Readability |
| Offscreen Document | 2-2 | `lib/offscreen-manager.ts` | Ensure offscreen doc exists for TTS |
| Kokoro TTS | 2-3 | `entrypoints/offscreen/tts-engine.ts` | Generate speech with phoneme data |
| TTS Fallback | 2-4 | `entrypoints/offscreen/tts-engine.ts` | WebGPU -> WASM -> Web Speech fallback |
| Word Timing | 2-5 | `lib/phoneme-timing.ts` | Calculate word timings from phonemes |
| Highlighting | 2-6 | `entrypoints/content/highlighter.ts` | Highlight words, scroll to keep visible |

### Current State

**Message Protocol (lib/messages.ts):**
```typescript
// Playback messages already defined
export type PlaybackMessage =
  | { type: 'PLAYBACK_PLAY'; fromPosition?: number }
  | { type: 'PLAYBACK_PAUSE' }
  | { type: 'PLAYBACK_STOP' }
  | { type: 'PLAYBACK_STATE_CHANGED'; state: PlaybackState; position: number };

export type PlaybackState = 'loading' | 'playing' | 'paused' | 'stopped';
```

**Background Script (entrypoints/background.ts):**
```typescript
// Currently only routes TTS messages, has placeholder for playback:
// Playback messages -> handle state (Epic 2)
```

**Offscreen Document (entrypoints/offscreen/index.ts):**
- Full TTS generation with streaming chunks
- Playback control for Web Speech API
- Missing: Audio playback for Kokoro-generated audio

### Target State

After this story:
1. Extension popup shows Play/Pause/Stop button based on state
2. Clicking extension icon toggles play/pause (quick access)
3. Background script manages playback state machine
4. Audio player in offscreen plays Kokoro-generated audio
5. Highlighting synchronized during playback
6. Pause freezes audio and highlighting at current word
7. Stop resets everything

### Architecture Reference

From `docs/architecture.md`:
- **FR18**: User can start playback with one click from extension icon
- **FR20**: User can pause and resume playback
- **FR21**: User can stop playback
- **NFR1**: Audio playback starts within 2 seconds of clicking play (after model loaded)

From `docs/project_context.md`:
- Audio generation happens in offscreen document
- Web Audio API for audio playback (better control than HTML5 audio)
- Playback state in background script, synced to all contexts

### Data Flow

```
User clicks Play
       |
       v
[Extension Popup] -- PLAYBACK_PLAY --> [Background Script]
                                              |
                                              v
                                    [State: loading]
                                              |
                        +---------------------+---------------------+
                        |                                           |
                        v                                           v
           CONTENT_EXTRACT --> [Content Script]        [Ensure Offscreen Doc]
           <-- article text --                                      |
                        |                                           v
                        +-----------> TTS_GENERATE --> [Offscreen Document]
                                              |
                                              v
                                    [Kokoro TTS generates]
                                    [Sends TTS_CHUNK_READY]
                                              |
                                              v
                                    [Audio Player queues]
                                    [Sends word timings]
                                              |
                        +---------------------+
                        v
[Background Script] -- HIGHLIGHT_WORD --> [Content Script]
              |
              v
[Background Script] -- PLAYBACK_STATE_CHANGED --> [All Listeners]
```

---

## Acceptance Criteria

### AC1: Extension Icon Click Toggles Playback

**Given** I'm on a page with readable content
**When** I click the extension icon
**Then**:
- If stopped: Playback starts (extracts content, generates TTS, plays audio)
- If playing: Playback pauses
- If paused: Playback resumes
- Extension icon badge shows current state (">" for playing, "||" for paused)

### AC2: Popup Playback Controls

**Given** I open the extension popup
**When** I view the UI
**Then**:
- Play button visible when stopped
- Pause button visible when playing
- Stop button always visible when playing/paused
- Loading spinner/text shown during TTS generation
- Current state clearly indicated

### AC3: Playback State Machine

**Given** the background script
**When** managing playback
**Then**:
- States: `stopped` -> `loading` -> `playing` <-> `paused`
- State persisted in module (not storage - ephemeral)
- State changes broadcast via `PLAYBACK_STATE_CHANGED`
- Current tab ID tracked for multi-tab awareness
- Stop from any state returns to `stopped`

### AC4: Audio Playback in Offscreen

**Given** TTS chunks are generated (Kokoro)
**When** audio needs to play
**Then**:
- Audio player uses Web Audio API for precise control
- Chunks queued in AudioContext for gapless playback
- Current playback position tracked in samples/ms
- Pause stops AudioContext, Resume reconnects
- Stop clears queue and resets position
- Sample rate: 24000 Hz (Kokoro output)

### AC5: Word Highlighting Synchronization

**Given** audio is playing
**When** playback progresses
**Then**:
- Background sends `HIGHLIGHT_WORD` to content script at correct times
- Word timing from TTS generation used for sync
- Highlighting runs ahead by ~50ms for perceived sync
- On pause, current word remains highlighted
- On stop, highlighting reset via `HIGHLIGHT_RESET`
- Scroll-to-word triggered every ~10 words or on pause

### AC6: Performance Requirement

**Given** the model is already loaded
**When** I click play
**Then**:
- Audio starts within 2 seconds (NFR1)
- First audio chunk plays while rest generates (streaming)
- UI remains responsive during generation
- No main thread blocking

### AC7: Error Handling

**Given** an error occurs during playback
**When** the error is caught
**Then**:
- State returns to `stopped`
- Error message shown in popup (brief, user-friendly)
- Highlighting reset on content page
- Console logs full error for debugging
- Recoverable errors (TTS fallback) handled transparently

---

## Technical Implementation Notes

### Background Script Playback Controller (`entrypoints/background.ts`)

```typescript
// Add to entrypoints/background.ts

import {
  addMessageListener,
  isTTSMessage,
  isPlaybackMessage,
  isContentMessage,
  sendMessageToTab,
  Messages,
  type PlaybackState,
  type PlaybackMessage,
  type TTSMessage,
  type MessageResponse,
  type WordTiming,
} from '@/lib/messages';
import { ensureOffscreenDocument } from '@/lib/offscreen-manager';
import { initializeDefaults } from '@/lib/storage';

// ============================================
// Playback State Management
// ============================================

interface PlaybackController {
  state: PlaybackState;
  tabId: number | null;
  wordTimings: WordTiming[];
  currentWordIndex: number;
  audioStartTime: number | null;
  highlightTimer: ReturnType<typeof setTimeout> | null;
}

const playback: PlaybackController = {
  state: 'stopped',
  tabId: null,
  wordTimings: [],
  currentWordIndex: 0,
  audioStartTime: null,
  highlightTimer: null,
};

// ============================================
// Badge Management
// ============================================

function updateBadge(state: PlaybackState): void {
  const badgeText = {
    stopped: '',
    loading: '...',
    playing: '>',
    paused: '||',
  }[state];

  const badgeColor = {
    stopped: '#666666',
    loading: '#FFA500',
    playing: '#4CAF50',
    paused: '#2196F3',
  }[state];

  chrome.action.setBadgeText({ text: badgeText });
  chrome.action.setBadgeBackgroundColor({ color: badgeColor });
}

// ============================================
// State Transitions
// ============================================

function setPlaybackState(newState: PlaybackState, position: number = 0): void {
  const oldState = playback.state;
  playback.state = newState;

  console.log(`[SimpleReader] Playback state: ${oldState} -> ${newState}`);
  updateBadge(newState);

  // Broadcast state change
  chrome.runtime.sendMessage(Messages.playbackStateChanged(newState, position));

  // Also send to active tab
  if (playback.tabId) {
    sendMessageToTab(playback.tabId, Messages.playbackStateChanged(newState, position));
  }
}

// ============================================
// Playback Actions
// ============================================

async function startPlayback(tabId: number): Promise<void> {
  if (playback.state === 'loading' || playback.state === 'playing') {
    console.log('[SimpleReader] Playback already in progress');
    return;
  }

  playback.tabId = tabId;
  playback.wordTimings = [];
  playback.currentWordIndex = 0;
  setPlaybackState('loading');

  try {
    // 1. Extract content from tab
    console.log('[SimpleReader] Extracting content...');
    const extractResponse = await sendMessageToTab<{ text: string; title?: string; wordCount: number }>(
      tabId,
      Messages.contentExtract()
    );

    if (!extractResponse.success || !extractResponse.data) {
      throw new Error(extractResponse.error || 'Content extraction failed');
    }

    const { text, wordCount } = extractResponse.data;
    console.log(`[SimpleReader] Extracted ${wordCount} words`);

    // 2. Ensure offscreen document exists
    await ensureOffscreenDocument();

    // 3. Request TTS generation (will receive chunks via messages)
    console.log('[SimpleReader] Starting TTS generation...');
    await chrome.runtime.sendMessage(Messages.ttsGenerate(text, 'af_bella', 1.0));

  } catch (error) {
    console.error('[SimpleReader] Playback start failed:', error);
    stopPlayback();
  }
}

function pausePlayback(): void {
  if (playback.state !== 'playing') return;

  // Stop highlight timer
  if (playback.highlightTimer) {
    clearTimeout(playback.highlightTimer);
    playback.highlightTimer = null;
  }

  // Pause audio in offscreen
  chrome.runtime.sendMessage(Messages.playbackPause());

  setPlaybackState('paused', playback.currentWordIndex);
}

function resumePlayback(): void {
  if (playback.state !== 'paused') return;

  // Resume audio in offscreen
  chrome.runtime.sendMessage(Messages.playbackPlay(playback.currentWordIndex));

  setPlaybackState('playing', playback.currentWordIndex);

  // Restart highlight scheduling
  scheduleNextHighlight();
}

function stopPlayback(): void {
  // Stop highlight timer
  if (playback.highlightTimer) {
    clearTimeout(playback.highlightTimer);
    playback.highlightTimer = null;
  }

  // Stop audio in offscreen
  chrome.runtime.sendMessage(Messages.playbackStop());

  // Reset highlighting in content script
  if (playback.tabId) {
    sendMessageToTab(playback.tabId, Messages.highlightReset());
  }

  // Reset state
  playback.wordTimings = [];
  playback.currentWordIndex = 0;
  playback.audioStartTime = null;

  setPlaybackState('stopped');
}

// ============================================
// Highlight Scheduling
// ============================================

function scheduleNextHighlight(): void {
  if (playback.state !== 'playing' || !playback.tabId) return;
  if (playback.currentWordIndex >= playback.wordTimings.length) {
    // All words highlighted, playback complete
    console.log('[SimpleReader] Playback complete');
    stopPlayback();
    return;
  }

  const currentTiming = playback.wordTimings[playback.currentWordIndex];
  const now = Date.now();
  const elapsed = playback.audioStartTime ? now - playback.audioStartTime : 0;

  // Time until this word should be highlighted (with 50ms lead for perceived sync)
  const delay = Math.max(0, currentTiming.startTime - elapsed - 50);

  playback.highlightTimer = setTimeout(() => {
    if (playback.state !== 'playing' || !playback.tabId) return;

    // Send highlight command
    sendMessageToTab(playback.tabId, Messages.highlightWord(playback.currentWordIndex));

    // Scroll every 10 words or at specific intervals
    if (playback.currentWordIndex % 10 === 0) {
      sendMessageToTab(playback.tabId, Messages.highlightScrollTo(playback.currentWordIndex));
    }

    playback.currentWordIndex++;
    scheduleNextHighlight();
  }, delay);
}

// ============================================
// TTS Message Handling
// ============================================

function handleTTSChunkReady(audioData: ArrayBuffer, wordTimings: WordTiming[]): void {
  // Accumulate word timings
  const baseIndex = playback.wordTimings.length;
  const adjustedTimings = wordTimings.map((t, i) => ({
    ...t,
    index: baseIndex + i,
  }));
  playback.wordTimings.push(...adjustedTimings);

  console.log(`[SimpleReader] Received chunk: ${wordTimings.length} words, total: ${playback.wordTimings.length}`);

  // If this is first chunk and we're loading, start playback
  if (playback.state === 'loading' && playback.wordTimings.length > 0) {
    playback.audioStartTime = Date.now();
    setPlaybackState('playing');
    scheduleNextHighlight();
  }
}

function handleTTSComplete(): void {
  console.log('[SimpleReader] TTS generation complete');
  // Playback continues until all words highlighted
}

function handleTTSError(error: string): void {
  console.error('[SimpleReader] TTS error:', error);
  stopPlayback();
}

// ============================================
// Icon Click Handler
// ============================================

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  // Toggle based on current state
  switch (playback.state) {
    case 'stopped':
      await startPlayback(tab.id);
      break;
    case 'playing':
      pausePlayback();
      break;
    case 'paused':
      resumePlayback();
      break;
    case 'loading':
      // Don't interrupt loading
      console.log('[SimpleReader] Already loading, ignoring click');
      break;
  }
});

// ============================================
// Message Listener (Updated)
// ============================================

export default defineBackground(() => {
  console.log('[SimpleReader] Background service worker started');

  chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      console.log('[SimpleReader] First install - initializing defaults');
      await initializeDefaults();
    }
  });

  addMessageListener((message, sender, sendResponse) => {
    console.log('[SimpleReader] Received message:', message.type);

    // Handle TTS messages from offscreen
    if (isTTSMessage(message)) {
      switch (message.type) {
        case 'TTS_CHUNK_READY':
          handleTTSChunkReady(message.audioData, message.wordTimings);
          sendResponse({ success: true });
          return false;

        case 'TTS_COMPLETE':
          handleTTSComplete();
          sendResponse({ success: true });
          return false;

        case 'TTS_ERROR':
          handleTTSError(message.error);
          sendResponse({ success: true });
          return false;

        case 'TTS_PROGRESS':
          // Could update badge or popup with progress
          sendResponse({ success: true });
          return false;

        case 'TTS_GENERATE':
          // Route to offscreen
          handleTTSGenerate(message, sendResponse);
          return true;
      }
    }

    // Handle playback messages from popup
    if (isPlaybackMessage(message)) {
      switch (message.type) {
        case 'PLAYBACK_PLAY':
          const tabId = sender.tab?.id;
          if (tabId) {
            startPlayback(tabId);
          }
          sendResponse({ success: true });
          return false;

        case 'PLAYBACK_PAUSE':
          pausePlayback();
          sendResponse({ success: true });
          return false;

        case 'PLAYBACK_STOP':
          stopPlayback();
          sendResponse({ success: true });
          return false;

        case 'PLAYBACK_STATE_CHANGED':
          // Informational, no action
          sendResponse({ success: true });
          return false;
      }
    }

    // Handle content messages
    if (isContentMessage(message)) {
      // Forward to active tab if needed
      sendResponse({ success: true });
      return false;
    }

    sendResponse({ success: true });
    return false;
  });
});

async function handleTTSGenerate(
  message: Extract<TTSMessage, { type: 'TTS_GENERATE' }>,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  try {
    await ensureOffscreenDocument();
    const response = await chrome.runtime.sendMessage(message);
    sendResponse(response);
  } catch (error) {
    console.error('[SimpleReader] TTS generate failed:', error);
    sendResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
```

### Audio Player Module (`entrypoints/offscreen/audio-player.ts`)

```typescript
// entrypoints/offscreen/audio-player.ts
// Web Audio API player for Kokoro TTS audio chunks

const SAMPLE_RATE = 24000; // Kokoro output sample rate

interface AudioPlayerState {
  context: AudioContext | null;
  currentSource: AudioBufferSourceNode | null;
  queue: Float32Array[];
  isPlaying: boolean;
  isPaused: boolean;
  pausedAt: number; // playback position when paused
  startedAt: number; // AudioContext time when playback started
  totalSamples: number;
  onPlaybackEnd?: () => void;
}

const state: AudioPlayerState = {
  context: null,
  currentSource: null,
  queue: [],
  isPlaying: false,
  isPaused: false,
  pausedAt: 0,
  startedAt: 0,
  totalSamples: 0,
  onPlaybackEnd: undefined,
};

/**
 * Initialize audio context (call on first use).
 */
function ensureContext(): AudioContext {
  if (!state.context) {
    state.context = new AudioContext({ sampleRate: SAMPLE_RATE });
  }
  return state.context;
}

/**
 * Add audio chunk to playback queue.
 */
export function queueAudioChunk(samples: Float32Array): void {
  state.queue.push(samples);
  state.totalSamples += samples.length;

  // If not playing and we have enough to start, begin playback
  if (!state.isPlaying && !state.isPaused && state.queue.length > 0) {
    playFromQueue();
  }
}

/**
 * Start playing from the queue.
 */
function playFromQueue(): void {
  if (state.queue.length === 0 || state.isPlaying) return;

  const context = ensureContext();

  // Combine all queued chunks into single buffer
  const totalLength = state.queue.reduce((sum, chunk) => sum + chunk.length, 0);
  const combined = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of state.queue) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  state.queue = [];

  // Create audio buffer
  const buffer = context.createBuffer(1, combined.length, SAMPLE_RATE);
  buffer.copyToChannel(combined, 0);

  // Create source node
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);

  source.onended = () => {
    state.isPlaying = false;
    state.currentSource = null;

    // Check if more audio queued while playing
    if (state.queue.length > 0) {
      playFromQueue();
    } else {
      state.onPlaybackEnd?.();
    }
  };

  // Start playback
  state.currentSource = source;
  state.isPlaying = true;
  state.startedAt = context.currentTime;

  if (state.isPaused && state.pausedAt > 0) {
    // Resume from paused position
    source.start(0, state.pausedAt / SAMPLE_RATE);
    state.isPaused = false;
  } else {
    source.start();
  }

  console.log(`[SimpleReader] Audio playing: ${combined.length} samples (${(combined.length / SAMPLE_RATE).toFixed(2)}s)`);
}

/**
 * Pause audio playback.
 */
export function pause(): void {
  if (!state.isPlaying || !state.context || !state.currentSource) return;

  // Calculate current position
  const elapsed = state.context.currentTime - state.startedAt;
  state.pausedAt = elapsed * SAMPLE_RATE;

  // Stop current source
  state.currentSource.stop();
  state.currentSource = null;
  state.isPlaying = false;
  state.isPaused = true;

  console.log(`[SimpleReader] Audio paused at ${state.pausedAt} samples`);
}

/**
 * Resume audio playback.
 */
export function resume(): void {
  if (!state.isPaused) return;

  playFromQueue();
}

/**
 * Stop audio playback and clear queue.
 */
export function stop(): void {
  if (state.currentSource) {
    state.currentSource.stop();
    state.currentSource = null;
  }

  state.queue = [];
  state.isPlaying = false;
  state.isPaused = false;
  state.pausedAt = 0;
  state.startedAt = 0;
  state.totalSamples = 0;

  console.log('[SimpleReader] Audio stopped');
}

/**
 * Get current playback position in milliseconds.
 */
export function getCurrentPositionMs(): number {
  if (state.isPaused) {
    return (state.pausedAt / SAMPLE_RATE) * 1000;
  }

  if (!state.isPlaying || !state.context) {
    return 0;
  }

  const elapsed = state.context.currentTime - state.startedAt;
  return elapsed * 1000;
}

/**
 * Check if audio is currently playing.
 */
export function isPlaying(): boolean {
  return state.isPlaying;
}

/**
 * Check if audio is paused.
 */
export function isPaused(): boolean {
  return state.isPaused;
}

/**
 * Set callback for when playback ends.
 */
export function onPlaybackEnd(callback: () => void): void {
  state.onPlaybackEnd = callback;
}

/**
 * Reset player state (call when starting new playback).
 */
export function reset(): void {
  stop();
}
```

### Popup UI (`entrypoints/popup/App.tsx`)

```tsx
// entrypoints/popup/App.tsx

import { useEffect, useState } from 'react';
import { Messages, type PlaybackState } from '@/lib/messages';

export default function App() {
  const [playbackState, setPlaybackState] = useState<PlaybackState>('stopped');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Listen for playback state changes
    const listener = (message: { type: string; state?: PlaybackState }) => {
      if (message.type === 'PLAYBACK_STATE_CHANGED' && message.state) {
        setPlaybackState(message.state);
        setError(null);
      }
      if (message.type === 'TTS_ERROR') {
        setError('Failed to generate speech. Please try again.');
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const handlePlay = async () => {
    setError(null);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.runtime.sendMessage(Messages.playbackPlay());
    }
  };

  const handlePause = () => {
    chrome.runtime.sendMessage(Messages.playbackPause());
  };

  const handleStop = () => {
    chrome.runtime.sendMessage(Messages.playbackStop());
  };

  return (
    <div style={{ padding: '16px', minWidth: '200px' }}>
      <h1 style={{ fontSize: '18px', marginBottom: '16px' }}>SimpleReader</h1>

      {error && (
        <div style={{ color: 'red', marginBottom: '12px', fontSize: '12px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
        {playbackState === 'stopped' && (
          <button onClick={handlePlay} style={buttonStyle}>
            Play
          </button>
        )}

        {playbackState === 'loading' && (
          <button disabled style={{ ...buttonStyle, opacity: 0.6 }}>
            Loading...
          </button>
        )}

        {playbackState === 'playing' && (
          <button onClick={handlePause} style={buttonStyle}>
            Pause
          </button>
        )}

        {playbackState === 'paused' && (
          <button onClick={handlePlay} style={buttonStyle}>
            Resume
          </button>
        )}

        {(playbackState === 'playing' || playbackState === 'paused') && (
          <button onClick={handleStop} style={buttonStyle}>
            Stop
          </button>
        )}
      </div>

      <div style={{ marginTop: '12px', fontSize: '12px', color: '#666', textAlign: 'center' }}>
        {playbackState === 'stopped' && 'Click Play to start reading'}
        {playbackState === 'loading' && 'Generating audio...'}
        {playbackState === 'playing' && 'Now playing'}
        {playbackState === 'paused' && 'Paused'}
      </div>
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: '8px 16px',
  fontSize: '14px',
  cursor: 'pointer',
  border: '1px solid #ccc',
  borderRadius: '4px',
  background: '#fff',
};
```

### Update Offscreen Document (`entrypoints/offscreen/index.ts`)

Add audio player integration for Kokoro audio chunks:

```typescript
// Add to imports
import {
  queueAudioChunk,
  pause as pauseAudio,
  resume as resumeAudio,
  stop as stopAudio,
  reset as resetAudio,
  onPlaybackEnd,
} from './audio-player';

// Update handleTTSGenerate to queue audio:
// In the chunk callback:
(chunk: GenerationChunk) => {
  if (getActiveEngine() !== 'webspeech') {
    // Queue audio for playback
    queueAudioChunk(chunk.audio);
    // Also send to background for timing coordination
    sendChunkMessage(chunk);
  }
}

// Update handlePlaybackMessage:
function handlePlaybackMessage(
  message: PlaybackMessage,
  sendResponse: (response: MessageResponse) => void
): void {
  switch (message.type) {
    case 'PLAYBACK_PLAY':
      if (getActiveEngine() === 'webspeech') {
        resumeCurrentPlayback();
      } else {
        resumeAudio();
      }
      console.log('[SimpleReader] Playback resumed');
      break;

    case 'PLAYBACK_PAUSE':
      if (getActiveEngine() === 'webspeech') {
        pauseCurrentPlayback();
      } else {
        pauseAudio();
      }
      console.log('[SimpleReader] Playback paused');
      break;

    case 'PLAYBACK_STOP':
      if (getActiveEngine() === 'webspeech') {
        stopCurrentPlayback();
      } else {
        stopAudio();
        resetAudio();
      }
      console.log('[SimpleReader] Playback stopped');
      break;

    default:
      break;
  }

  sendResponse({ success: true });
}

// Set up playback end handler
onPlaybackEnd(() => {
  console.log('[SimpleReader] Playback ended');
  sendCompleteMessage();
});
```

---

## Architecture Compliance

### Pattern Adherence

| Pattern | Compliance |
|---------|------------|
| FR18: One-click from icon | `chrome.action.onClicked` toggles playback |
| FR20: Pause/resume | State machine with `playing` <-> `paused` transitions |
| FR21: Stop playback | Stop clears audio, resets highlights, returns to `stopped` |
| NFR1: Audio start < 2s | Streaming playback starts on first chunk |
| ARCH-5: Typed messages | All communication via `lib/messages.ts` types |
| ARCH-9: Offscreen lifecycle | `ensureOffscreenDocument()` before TTS requests |

### File Structure After Implementation

```
entrypoints/
  background.ts                    # UPDATE: Full playback controller
  popup/
    App.tsx                        # UPDATE: Playback controls UI
  offscreen/
    index.ts                       # UPDATE: Audio player integration
    audio-player.ts                # NEW: Web Audio API player
    tts-engine.ts                  # EXISTING: TTS generation
  content/
    index.ts                       # EXISTING: Highlight message handlers
    highlighter.ts                 # EXISTING: Word highlighting

lib/
  messages.ts                      # EXISTING: Message types
  offscreen-manager.ts             # EXISTING: Offscreen lifecycle
```

---

## Tasks

### Task 1: Create Audio Player Module
**AC: 4**
- [x] Create `entrypoints/offscreen/audio-player.ts`
- [x] Implement `queueAudioChunk()` to buffer incoming audio
- [x] Implement `playFromQueue()` using Web Audio API
- [x] Implement `pause()`, `resume()`, `stop()`
- [x] Implement `getCurrentPositionMs()` for sync
- [x] Implement `onPlaybackEnd()` callback
- [x] Handle sample rate (24000 Hz)

### Task 2: Implement Playback State Machine in Background
**AC: 3, 5**
- [x] Add `PlaybackController` interface and state
- [x] Implement state transitions: stopped -> loading -> playing <-> paused
- [x] Implement `startPlayback()`: extract content, request TTS
- [x] Implement `pausePlayback()`, `resumePlayback()`, `stopPlayback()`
- [x] Broadcast `PLAYBACK_STATE_CHANGED` on transitions
- [x] Track current tab ID for multi-tab awareness

### Task 3: Implement Highlight Scheduling
**AC: 5**
- [x] Store word timings as they arrive from TTS chunks
- [x] Implement `scheduleNextHighlight()` using setTimeout
- [x] Send `HIGHLIGHT_WORD` at correct times (50ms lead)
- [x] Send `HIGHLIGHT_SCROLL_TO` every 10 words
- [x] Handle pause: stop timer, preserve position
- [x] Handle resume: restart timer from current position
- [x] Handle stop: clear timer, send `HIGHLIGHT_RESET`

### Task 4: Implement Extension Icon Click Handler
**AC: 1**
- [x] Add `chrome.action.onClicked` listener
- [x] Toggle based on current state: stopped->play, playing->pause, paused->resume
- [x] Skip action if loading (show loading in badge)

### Task 5: Implement Badge Updates
**AC: 1**
- [x] Add `updateBadge()` function
- [x] Show ">" for playing
- [x] Show "||" for paused
- [x] Show "..." for loading
- [x] Clear badge when stopped

### Task 6: Integrate Audio Player in Offscreen
**AC: 4**
- [x] Import audio-player module
- [x] Queue audio chunks during TTS generation
- [x] Route `PLAYBACK_PAUSE/PLAY/STOP` to audio player
- [x] Set up playback end callback

### Task 7: Update Popup UI
**AC: 2**
- [x] Update `App.tsx` with playback state management
- [x] Show Play button when stopped
- [x] Show Pause button when playing
- [x] Show Resume/Stop buttons when paused
- [x] Show loading indicator during TTS generation
- [x] Display error messages briefly

### Task 8: Handle TTS Messages in Background
**AC: 3, 6**
- [x] Handle `TTS_CHUNK_READY`: accumulate word timings, start playback on first chunk
- [x] Handle `TTS_COMPLETE`: log completion
- [x] Handle `TTS_ERROR`: stop playback, show error
- [x] Handle `TTS_PROGRESS`: optionally update UI

### Task 9: Error Handling
**AC: 7**
- [x] Catch errors in `startPlayback()`, call `stopPlayback()`
- [x] Forward TTS errors to popup
- [x] Reset highlights on error
- [x] Log full errors to console
- [x] Show user-friendly message in popup

### Task 10: Manual Testing
**AC: 1, 2, 3, 4, 5, 6, 7**
- [ ] Load extension in dev mode (`bun run dev`)
- [ ] Navigate to Medium article
- [ ] Click extension icon - verify playback starts
- [ ] Verify words highlight as audio plays
- [ ] Click icon again - verify pause
- [ ] Click icon again - verify resume from paused position
- [ ] Open popup, click Stop - verify everything resets
- [ ] Test on Substack, HN, news site
- [ ] Test error case (navigate to non-readable page)
- [ ] Measure time from click to audio start (target < 2s with cached model)

---

## Definition of Done

- [x] Audio player module created with Web Audio API
- [x] Background script manages playback state machine
- [x] Extension icon click toggles play/pause
- [x] Badge shows current playback state
- [x] Popup shows appropriate controls for state
- [x] Word highlighting synchronized with audio
- [x] Pause freezes audio and highlighting
- [x] Stop resets everything
- [ ] Audio starts within 2 seconds (cached model)
- [x] Errors handled gracefully
- [ ] Works on 3+ test sites
- [x] No TypeScript errors
- [x] Console logs show state transitions

---

## Dependencies

### Depends On
- Story 2-1: Content extraction (`extractContent()`)
- Story 2-2: Offscreen document (`ensureOffscreenDocument()`)
- Story 2-3: Kokoro TTS (`generateSpeechWithFallback()`)
- Story 2-4: TTS fallback chain (Web Speech API support)
- Story 2-5: Word timing calculation (`WordTiming[]` from TTS)
- Story 2-6: Word highlighting (`highlightWord()`, `scrollToWord()`, `resetHighlight()`)

### Enables
- Story 3-1: Keyboard Shortcut (extends playback controls)
- Story 3-2: Speed Control (adds speed parameter)
- Story 3-3: Floating Mini-Player (alternative UI)
- Epic 3+: All subsequent playback enhancements

---

## Test Scenarios

### Manual Testing Checklist

| Scenario | Steps | Expected Behavior |
|----------|-------|-------------------|
| First play | Navigate to article, click icon | Loading badge, then audio + highlighting |
| Pause | Click icon during playback | Audio stops, word stays highlighted, "||" badge |
| Resume | Click icon while paused | Audio resumes from position, highlighting continues |
| Stop | Open popup, click Stop | Everything resets, badge clears |
| Popup controls | Open popup, use buttons | Same behavior as icon click |
| Non-readable page | Navigate to google.com, click icon | Error message shown, no crash |
| Long article | Play 1000+ word article | Highlighting tracks through entire article |
| Audio sync | Watch highlighting vs audio | Words highlight ~50ms before spoken |
| Performance | Time from click to audio | Under 2 seconds with cached model |
| Tab switch | Start playback, switch tabs | Audio continues in background |

### Console Log Expectations

```
[SimpleReader] Background service worker started
[SimpleReader] Received message: PLAYBACK_PLAY
[SimpleReader] Playback state: stopped -> loading
[SimpleReader] Extracting content...
[SimpleReader] Extracted 523 words
[SimpleReader] Starting TTS generation...
[SimpleReader] Received chunk: 85 words, total: 85
[SimpleReader] Playback state: loading -> playing
[SimpleReader] Received chunk: 92 words, total: 177
...
[SimpleReader] TTS generation complete
[SimpleReader] Playback complete
[SimpleReader] Playback state: playing -> stopped
```

### Unit Test Cases (Epic 8)

```typescript
// background.test.ts
describe('Playback State Machine', () => {
  it('transitions stopped -> loading on play');
  it('transitions loading -> playing on first chunk');
  it('transitions playing -> paused on pause');
  it('transitions paused -> playing on resume');
  it('transitions any -> stopped on stop');
  it('broadcasts state changes');
});

describe('Highlight Scheduling', () => {
  it('schedules highlights based on word timings');
  it('applies 50ms lead time for perceived sync');
  it('scrolls every 10 words');
  it('stops on pause');
  it('resumes from correct position');
});

// audio-player.test.ts
describe('Audio Player', () => {
  it('queues audio chunks');
  it('plays combined audio');
  it('pauses and tracks position');
  it('resumes from paused position');
  it('stops and clears queue');
});
```

---

## References

- [Source: docs/architecture.md#Playback Control] - FR18, FR20, FR21, NFR1
- [Source: docs/epics.md#Story 2.7] - Original story definition
- [Source: lib/messages.ts] - PlaybackMessage types
- [Source: entrypoints/offscreen/tts-engine.ts] - TTS generation
- [Source: entrypoints/content/highlighter.ts] - Word highlighting
- [MDN Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) - Audio playback
- [Chrome Action API](https://developer.chrome.com/docs/extensions/reference/api/action) - Badge and icon

---

## Dev Notes

### Why Web Audio API over HTML5 Audio?

1. **Precise timing control** - Can query exact playback position
2. **Gapless playback** - Queue multiple buffers seamlessly
3. **Sample-level control** - Work with raw PCM from Kokoro
4. **Low latency** - Important for sync with highlighting

### Highlight Timing Strategy

The 50ms lead time accounts for:
- Message passing latency (~10-20ms)
- DOM update time (~5-10ms)
- Human perception window (~50ms)

Users perceive the highlight as "in sync" when it appears slightly before the word is spoken.

### Streaming vs Buffered Playback

We use streaming (play first chunk while generating rest) because:
- NFR1 requires < 2s to first audio
- User feedback is immediate
- Memory efficient for long articles

### State Persistence

Playback state is **not** persisted to storage because:
- It's ephemeral (valid only during current session)
- Tab might be closed/reloaded
- Simpler state management

Future: Could persist `lastPlayedUrl` and `lastPlayedPosition` for "continue reading" feature.

### Known Limitations (MVP Acceptable)

1. Single tab playback (can't play on multiple tabs simultaneously)
2. No seek/scrub functionality
3. Speed fixed at 1.0x (Story 3-2 adds control)
4. No visual progress bar (Story 3-3 adds mini-player)
5. No keyboard shortcut yet (Story 3-1)

---

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

1. Created `audio-player.ts` with Web Audio API using TTS_SAMPLE_RATE from constants
2. Background script implements full playback state machine (stopped -> loading -> playing <-> paused)
3. Background handles streaming TTS messages (TTS_CHUNK_READY, TTS_COMPLETE, TTS_ERROR)
4. Word timings accumulated with proper time offset across chunks
5. Highlight scheduling uses 50ms lead time for perceived sync
6. Extension icon click toggles playback state with badge updates
7. Popup shows Play/Pause/Resume/Stop controls based on state
8. Voice loaded from storage via getSyncValue(STORAGE_KEYS.preferredVoice)
9. Build passes with no TypeScript errors
10. Manual testing items remain for reviewer to validate

### File List

- `entrypoints/background.ts` (major update: full playback controller with state machine, badge updates, highlight scheduling)
- `entrypoints/offscreen/audio-player.ts` (new: Web Audio API player with queue, pause/resume, position tracking)
- `entrypoints/offscreen/index.ts` (update: audio player integration, playback message routing)
- `entrypoints/popup/App.tsx` (update: playback controls UI with state-based rendering)
- `entrypoints/popup/App.css` (update: styles for control buttons, spinner, status bar)
