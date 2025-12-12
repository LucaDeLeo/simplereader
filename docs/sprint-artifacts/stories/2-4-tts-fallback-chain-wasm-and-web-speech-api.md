# Story 2.4: TTS Fallback Chain (WASM and Web Speech API)

## Story Info

| Field | Value |
|-------|-------|
| Epic | 2 - First Play Experience (The Magic Moment) |
| Story ID | 2-4 |
| Story Key | 2-4-tts-fallback-chain-wasm-and-web-speech-api |
| Status | ready-for-dev |
| Created | 2025-12-11 |

---

## User Story

As a user,
I want TTS to work even if my device doesn't support WebGPU,
So that I can use SimpleReader on any Chrome browser.

---

## Context & Background

This is the **fourth story in Epic 2**, implementing the TTS fallback chain that ensures SimpleReader works on all devices. While Story 2-3 implemented Kokoro TTS with WebGPU preference, this story adds robust fallback mechanisms.

### The Fallback Chain

The architecture specifies a three-tier fallback strategy:

```
1. Kokoro WebGPU  (best quality, requires GPU)
       |
       v [if WebGPU unavailable or fails]
2. Kokoro WASM   (good quality, CPU-based)
       |
       v [if WASM/model fails]
3. Web Speech API (system voices, universal)
```

### Why This Matters

- **WebGPU**: Only available in Chrome 113+ with compatible GPU hardware
- **WASM**: Works on any modern browser but slower than WebGPU
- **Web Speech API**: Universal fallback using system TTS voices

### Current State (After Story 2-3)

The `tts-engine.ts` already implements:
- WebGPU detection via `navigator.gpu.requestAdapter()`
- Automatic WASM fallback when WebGPU unavailable
- Singleton TTS instance management

However, it lacks:
- Handling when Kokoro model fails entirely (network error, corrupted cache)
- Web Speech API as final fallback
- Device capability storage for UI display
- Graceful error recovery

### Target State

After this story:
1. If Kokoro WebGPU fails, automatically try Kokoro WASM
2. If Kokoro WASM fails, automatically use Web Speech API
3. Device capability stored in `chrome.storage.local` for UI
4. User never sees TTS failure - always some voice output
5. Fallback happens silently without user intervention

### Architecture Reference

From `docs/architecture.md`:
- **FR3**: System falls back to WASM runtime when WebGPU is unavailable
- **FR4**: System falls back to Web Speech API when model cannot load
- **NFR17**: Graceful fallback when primary TTS unavailable

From `docs/project_context.md`:
- Privacy: Web Speech API may use cloud voices on some systems (acceptable as last resort)
- Error handling: Propagate as typed `ExtensionError` objects

From `lib/storage.ts`:
```typescript
deviceCapability: 'deviceCapability',  // 'webgpu' | 'wasm' | 'webspeech'
```

---

## Acceptance Criteria

### AC1: Kokoro WASM Fallback on WebGPU Failure

**Given** WebGPU is unavailable or fails to initialize
**When** TTS generation is requested
**Then**:
- System automatically attempts Kokoro with WASM device
- No user intervention required
- Console logs: `[SimpleReader] WebGPU unavailable, trying WASM fallback`
- If WASM succeeds, TTS works normally with slightly slower performance
- `deviceCapability` storage updated to `'wasm'`

### AC2: Web Speech API Fallback on Kokoro Failure

**Given** Kokoro TTS fails entirely (both WebGPU and WASM)
**When** TTS generation is requested
**Then**:
- System falls back to Web Speech API
- Console logs: `[SimpleReader] Kokoro failed, using Web Speech API fallback`
- Web Speech API uses best available system voice
- `deviceCapability` storage updated to `'webspeech'`
- User hears audio (quality may differ from Kokoro)

### AC3: Web Speech API Implementation

**Given** Web Speech API is the active TTS engine
**When** text is sent for TTS generation
**Then**:
- `SpeechSynthesisUtterance` created with text
- Voice selected from `speechSynthesis.getVoices()` (prefer English)
- Speed parameter applied via `utterance.rate` (0.5-2.0 mapped appropriately)
- Word boundary events (`onboundary`) used for highlighting sync
- Pause/resume works via `speechSynthesis.pause()`/`resume()`
- Stop works via `speechSynthesis.cancel()`

### AC4: Device Capability Detection and Storage

**Given** TTS engine initializes
**When** device capability is determined
**Then**:
- Capability detected: `'webgpu'`, `'wasm'`, or `'webspeech'`
- Stored in `chrome.storage.local` using `STORAGE_KEYS.deviceCapability`
- Capability persisted across sessions (avoid re-detection)
- Can be invalidated if user upgrades browser/hardware

### AC5: Fallback Chain Error Handling

**Given** an error occurs during TTS initialization or generation
**When** handling the error
**Then**:
- Error is logged with `[SimpleReader]` prefix
- If recoverable, next fallback in chain is attempted
- If all fallbacks fail, `TTS_ERROR` message sent with clear user message
- Error includes `recoverable: false` only if Web Speech API also fails
- Never silently fail - always provide feedback

### AC6: Word Timing for Web Speech API

**Given** Web Speech API is generating speech
**When** audio plays
**Then**:
- `SpeechSynthesisUtterance.onboundary` event used for word tracking
- Word timings approximated from boundary events
- `charIndex` from boundary event mapped to word index
- Highlighting sync maintained (may be less accurate than Kokoro)
- Format matches `WordTiming` interface from `lib/messages.ts`

---

## Technical Implementation Notes

### Fallback Engine Module (`entrypoints/offscreen/fallback.ts`)

```typescript
// entrypoints/offscreen/fallback.ts
// Web Speech API fallback for TTS when Kokoro fails

import type { WordTiming } from '@/lib/messages';
import { createTTSError, ERROR_CODES } from '@/lib/errors';
import { clampSpeed } from '@/lib/constants';

// ============================================
// Types
// ============================================

export interface WebSpeechResult {
  wordTimings: WordTiming[];
  duration: number;
}

export interface WebSpeechOptions {
  voice?: string;
  speed?: number;
  onWord?: (timing: WordTiming) => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

// ============================================
// State
// ============================================

let currentUtterance: SpeechSynthesisUtterance | null = null;
let availableVoices: SpeechSynthesisVoice[] = [];
let voicesLoaded = false;

// ============================================
// Voice Loading
// ============================================

/**
 * Load available system voices.
 * Voices may not be immediately available - Chrome loads them async.
 */
export async function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (voicesLoaded && availableVoices.length > 0) {
    return availableVoices;
  }

  return new Promise((resolve) => {
    const loadVoiceList = () => {
      availableVoices = speechSynthesis.getVoices();
      voicesLoaded = true;
      resolve(availableVoices);
    };

    // Voices might already be loaded
    availableVoices = speechSynthesis.getVoices();
    if (availableVoices.length > 0) {
      voicesLoaded = true;
      resolve(availableVoices);
      return;
    }

    // Wait for voices to load (Chrome fires this event)
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoiceList;
    }

    // Fallback timeout in case event never fires
    setTimeout(() => {
      if (!voicesLoaded) {
        availableVoices = speechSynthesis.getVoices();
        voicesLoaded = true;
        resolve(availableVoices);
      }
    }, 1000);
  });
}

/**
 * Select the best available English voice.
 */
export function selectBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  // Prefer: local English voice > any English voice > default voice > first voice
  const localEnglish = voices.find(v => v.lang.startsWith('en') && v.localService);
  if (localEnglish) return localEnglish;

  const anyEnglish = voices.find(v => v.lang.startsWith('en'));
  if (anyEnglish) return anyEnglish;

  const defaultVoice = voices.find(v => v.default);
  if (defaultVoice) return defaultVoice;

  return voices[0] || null;
}

/**
 * Get list of available Web Speech voices for UI.
 */
export function getWebSpeechVoices(): Array<{ name: string; lang: string; local: boolean }> {
  return availableVoices.map(v => ({
    name: v.name,
    lang: v.lang,
    local: v.localService,
  }));
}

// ============================================
// Speech Generation
// ============================================

/**
 * Check if Web Speech API is available.
 */
export function isWebSpeechAvailable(): boolean {
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

/**
 * Generate speech using Web Speech API.
 * Returns a promise that resolves with word timing data.
 */
export async function speakWithWebSpeech(
  text: string,
  options: WebSpeechOptions = {}
): Promise<WebSpeechResult> {
  if (!isWebSpeechAvailable()) {
    throw createTTSError(
      ERROR_CODES.TTS_WASM_FAILED, // Reusing error code - Web Speech is last resort
      'Web Speech API is not available in this browser',
      false
    );
  }

  // Cancel any existing speech
  stopWebSpeech();

  // Load voices if needed
  const voices = await loadVoices();
  if (voices.length === 0) {
    throw createTTSError(
      ERROR_CODES.TTS_SYNTHESIS_FAILED,
      'No speech synthesis voices available',
      false
    );
  }

  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    currentUtterance = utterance;

    // Select voice
    const selectedVoice = selectBestVoice(voices);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      console.log(`[SimpleReader] Web Speech using voice: ${selectedVoice.name}`);
    }

    // Apply speed (Web Speech API rate: 0.1 to 10, default 1)
    // Map our 0.5-2.0 range to Web Speech API
    const speed = clampSpeed(options.speed ?? 1.0);
    utterance.rate = speed;

    // Track word timings via boundary events
    const wordTimings: WordTiming[] = [];
    const words = text.trim().split(/\s+/);
    let wordIndex = 0;
    let startTime = Date.now();

    utterance.onboundary = (event) => {
      if (event.name === 'word' && wordIndex < words.length) {
        const currentTime = Date.now() - startTime;
        const timing: WordTiming = {
          word: words[wordIndex] || '',
          startTime: currentTime,
          endTime: currentTime + 100, // Approximate, will be updated by next boundary
          index: wordIndex,
        };

        // Update previous word's end time
        if (wordTimings.length > 0) {
          wordTimings[wordTimings.length - 1].endTime = currentTime;
        }

        wordTimings.push(timing);
        options.onWord?.(timing);
        wordIndex++;
      }
    };

    utterance.onend = () => {
      const duration = Date.now() - startTime;

      // Update last word's end time
      if (wordTimings.length > 0) {
        wordTimings[wordTimings.length - 1].endTime = duration;
      }

      currentUtterance = null;
      options.onEnd?.();

      resolve({
        wordTimings,
        duration,
      });
    };

    utterance.onerror = (event) => {
      currentUtterance = null;
      const error = new Error(`Speech synthesis error: ${event.error}`);
      options.onError?.(error);
      reject(createTTSError(
        ERROR_CODES.TTS_SYNTHESIS_FAILED,
        `Web Speech API error: ${event.error}`,
        true
      ));
    };

    // Start speaking
    startTime = Date.now();
    speechSynthesis.speak(utterance);
  });
}

// ============================================
// Playback Control
// ============================================

/**
 * Pause Web Speech playback.
 */
export function pauseWebSpeech(): void {
  if (speechSynthesis.speaking && !speechSynthesis.paused) {
    speechSynthesis.pause();
    console.log('[SimpleReader] Web Speech paused');
  }
}

/**
 * Resume Web Speech playback.
 */
export function resumeWebSpeech(): void {
  if (speechSynthesis.paused) {
    speechSynthesis.resume();
    console.log('[SimpleReader] Web Speech resumed');
  }
}

/**
 * Stop Web Speech playback.
 */
export function stopWebSpeech(): void {
  speechSynthesis.cancel();
  currentUtterance = null;
  console.log('[SimpleReader] Web Speech stopped');
}

/**
 * Check if Web Speech is currently speaking.
 */
export function isWebSpeechSpeaking(): boolean {
  return speechSynthesis.speaking;
}

/**
 * Check if Web Speech is paused.
 */
export function isWebSpeechPaused(): boolean {
  return speechSynthesis.paused;
}
```

### Updated TTS Engine with Fallback Chain (`entrypoints/offscreen/tts-engine.ts`)

Add fallback chain logic to existing module:

```typescript
// Add to imports
import {
  isWebSpeechAvailable,
  speakWithWebSpeech,
  loadVoices as loadWebSpeechVoices,
  stopWebSpeech,
  type WebSpeechResult,
} from './fallback';
import { setLocalValue, STORAGE_KEYS, type DeviceCapability } from '@/lib/storage';

// Add new state
let activeEngine: 'kokoro-webgpu' | 'kokoro-wasm' | 'webspeech' | null = null;
let deviceCapability: DeviceCapability | null = null;

// ============================================
// Fallback Chain Initialization
// ============================================

/**
 * Initialize TTS with automatic fallback chain.
 * Tries: WebGPU -> WASM -> Web Speech API
 */
export async function initializeTTSWithFallback(
  onProgress?: ProgressCallback
): Promise<DeviceCapability> {
  // Try Kokoro WebGPU first
  try {
    console.log('[SimpleReader] Attempting Kokoro WebGPU initialization...');
    await initializeKokoroWithDevice('webgpu', onProgress);
    activeEngine = 'kokoro-webgpu';
    deviceCapability = 'webgpu';
    await persistDeviceCapability('webgpu');
    console.log('[SimpleReader] TTS initialized with Kokoro WebGPU');
    return 'webgpu';
  } catch (webgpuError) {
    console.warn('[SimpleReader] WebGPU initialization failed:', webgpuError);
  }

  // Try Kokoro WASM fallback
  try {
    console.log('[SimpleReader] Attempting Kokoro WASM fallback...');
    await initializeKokoroWithDevice('wasm', onProgress);
    activeEngine = 'kokoro-wasm';
    deviceCapability = 'wasm';
    await persistDeviceCapability('wasm');
    console.log('[SimpleReader] TTS initialized with Kokoro WASM');
    return 'wasm';
  } catch (wasmError) {
    console.warn('[SimpleReader] WASM initialization failed:', wasmError);
  }

  // Final fallback: Web Speech API
  if (isWebSpeechAvailable()) {
    console.log('[SimpleReader] Falling back to Web Speech API');
    await loadWebSpeechVoices();
    activeEngine = 'webspeech';
    deviceCapability = 'webspeech';
    await persistDeviceCapability('webspeech');
    onProgress?.(100);
    console.log('[SimpleReader] TTS initialized with Web Speech API');
    return 'webspeech';
  }

  // All fallbacks failed
  throw createTTSError(
    ERROR_CODES.TTS_MODEL_LOAD_FAILED,
    'All TTS engines failed to initialize. WebGPU, WASM, and Web Speech API are unavailable.',
    false
  );
}

/**
 * Initialize Kokoro with a specific device.
 */
async function initializeKokoroWithDevice(
  device: TTSDevice,
  onProgress?: ProgressCallback
): Promise<void> {
  // Reset existing instance if switching devices
  if (ttsInstance) {
    ttsInstance = null;
  }

  console.log(`[SimpleReader] Initializing Kokoro TTS with device: ${device}`);

  ttsInstance = await KokoroTTS.from_pretrained(MODEL_ID, {
    dtype: MODEL_DTYPE,
    device,
    progress_callback: (progressInfo: TransformersProgressInfo) => {
      if (progressInfo.status === 'progress' && progressInfo.progress !== undefined) {
        const percent = Math.round(progressInfo.progress);
        onProgress?.(percent);
      }
    },
  });

  currentDevice = device;
}

/**
 * Persist device capability to storage for UI display.
 */
async function persistDeviceCapability(capability: DeviceCapability): Promise<void> {
  try {
    await setLocalValue(STORAGE_KEYS.deviceCapability, capability);
    console.log(`[SimpleReader] Device capability stored: ${capability}`);
  } catch (error) {
    console.warn('[SimpleReader] Failed to persist device capability:', error);
  }
}

// ============================================
// Unified Speech Generation
// ============================================

/**
 * Generate speech using the active engine (Kokoro or Web Speech).
 * Automatically uses the initialized engine from fallback chain.
 */
export async function generateSpeechWithFallback(
  text: string,
  voice: string = DEFAULT_VOICE,
  speed: number = 1.0,
  onChunk?: (chunk: GenerationChunk) => void,
  onProgress?: ProgressCallback,
  onWord?: (timing: WordTiming) => void
): Promise<GenerationResult> {
  // Ensure TTS is initialized
  if (!activeEngine) {
    await initializeTTSWithFallback(onProgress);
  }

  // Route to appropriate engine
  if (activeEngine === 'webspeech') {
    return generateWithWebSpeech(text, speed, onWord);
  }

  // Use Kokoro (WebGPU or WASM)
  try {
    return await generateSpeech(text, voice, speed, onChunk, onProgress);
  } catch (kokoroError) {
    console.error('[SimpleReader] Kokoro generation failed, trying Web Speech:', kokoroError);

    // Try Web Speech as runtime fallback
    if (isWebSpeechAvailable()) {
      activeEngine = 'webspeech';
      deviceCapability = 'webspeech';
      await persistDeviceCapability('webspeech');
      return generateWithWebSpeech(text, speed, onWord);
    }

    throw kokoroError;
  }
}

/**
 * Generate speech using Web Speech API.
 */
async function generateWithWebSpeech(
  text: string,
  speed: number,
  onWord?: (timing: WordTiming) => void
): Promise<GenerationResult> {
  console.log('[SimpleReader] Generating speech with Web Speech API');

  const result = await speakWithWebSpeech(text, {
    speed,
    onWord,
    onEnd: () => {
      console.log('[SimpleReader] Web Speech generation complete');
    },
  });

  // Web Speech doesn't provide raw audio, but we still return timing data
  // The actual audio plays directly through the browser
  return {
    audio: new Float32Array(0), // No raw audio for Web Speech
    phonemes: '', // No phoneme data for Web Speech
    wordTimings: result.wordTimings,
    sampleRate: 0, // Not applicable for Web Speech
  };
}

// ============================================
// Status and Capability
// ============================================

/**
 * Get current active TTS engine.
 */
export function getActiveEngine(): string | null {
  return activeEngine;
}

/**
 * Get device capability.
 */
export function getDeviceCapability(): DeviceCapability | null {
  return deviceCapability;
}

/**
 * Get extended model status including active engine.
 */
export function getExtendedModelStatus(): ModelStatus & { activeEngine: string | null } {
  return {
    ...getModelStatus(),
    activeEngine,
  };
}
```

### Update Offscreen Handler for Fallback Support

```typescript
// In entrypoints/offscreen/index.ts

import {
  initializeTTSWithFallback,
  generateSpeechWithFallback,
  getActiveEngine,
  getDeviceCapability,
} from './tts-engine';
import { stopWebSpeech, pauseWebSpeech, resumeWebSpeech } from './fallback';
import { isPlaybackMessage, Messages } from '@/lib/messages';
// Note: startKeepAlive/stopKeepAlive implemented in story 2-2

// Update TTS_GENERATE handler to use fallback chain
case 'TTS_GENERATE':
  startKeepAlive();

  try {
    // Initialize TTS with fallback chain
    const capability = await initializeTTSWithFallback((progress) => {
      chrome.runtime.sendMessage(Messages.ttsProgress(progress));
    });

    console.log(`[SimpleReader] Using TTS engine: ${getActiveEngine()}`);

    // Generate speech with fallback support
    const result = await generateSpeechWithFallback(
      message.text,
      message.voice,
      message.speed,
      (chunk) => {
        // Only send chunks for Kokoro (Web Speech plays directly)
        if (getActiveEngine() !== 'webspeech') {
          const audioBuffer = chunk.audio.buffer.slice(
            chunk.audio.byteOffset,
            chunk.audio.byteOffset + chunk.audio.byteLength
          );
          chrome.runtime.sendMessage(
            Messages.ttsChunkReady(audioBuffer, chunk.wordTimings)
          );
        }
      },
      (progress) => {
        chrome.runtime.sendMessage(Messages.ttsProgress(50 + progress / 2));
      },
      (timing) => {
        // Real-time word timing for Web Speech
        if (getActiveEngine() === 'webspeech') {
          chrome.runtime.sendMessage(Messages.highlightWord(timing.index));
        }
      }
    );

    chrome.runtime.sendMessage(Messages.ttsComplete());
    sendResponse({
      success: true,
      data: {
        wordCount: result.wordTimings.length,
        engine: getActiveEngine(),
        capability: getDeviceCapability(),
      },
    });
  } catch (error) {
    // ... error handling
  } finally {
    stopKeepAlive();
  }
  break;

// Add playback control cases for Web Speech
// Note: startKeepAlive/stopKeepAlive are implemented in story 2-2
// Handle playback messages using isPlaybackMessage type guard from lib/messages.ts
if (isPlaybackMessage(message) && getActiveEngine() === 'webspeech') {
  switch (message.type) {
    case 'PLAYBACK_PLAY':
      resumeWebSpeech();
      break;
    case 'PLAYBACK_PAUSE':
      pauseWebSpeech();
      break;
    case 'PLAYBACK_STOP':
      stopWebSpeech();
      break;
  }
  sendResponse({ success: true });
  return true;
}
```

### Error Codes for Fallback (`lib/errors.ts`)

Use existing error codes from `lib/errors.ts`:

```typescript
// Existing TTS error codes to use:
ERROR_CODES.TTS_MODEL_LOAD_FAILED     // When all engines fail to initialize
ERROR_CODES.TTS_SYNTHESIS_FAILED      // When speech generation fails
ERROR_CODES.TTS_WEBGPU_UNAVAILABLE    // When WebGPU specifically unavailable
ERROR_CODES.TTS_WASM_FAILED           // When WASM fallback fails
```

No new error codes needed - the existing set covers all fallback scenarios.

---

## Architecture Compliance

### Pattern Adherence

| Pattern | Compliance |
|---------|------------|
| FR3: WASM fallback | Automatic fallback when WebGPU unavailable |
| FR4: Web Speech fallback | Final fallback when Kokoro fails entirely |
| NFR17: Graceful fallback | Silent automatic fallback, user always hears audio |
| ARCH-5: Typed messages | Uses existing message protocol |
| ARCH-11: Storage keys | Uses `STORAGE_KEYS.deviceCapability` |

### File Structure After Implementation

```
lib/
  storage.ts            # EXISTING: Has deviceCapability key
  errors.ts             # EXISTING: Has all needed TTS error codes
  messages.ts           # EXISTING: Has isPlaybackMessage, PlaybackMessage types
  constants.ts          # EXISTING: TTS constants (clampSpeed)

entrypoints/
  offscreen/
    index.ts            # UPDATE: Integrate fallback handlers, use isPlaybackMessage
    tts-engine.ts       # UPDATE: Add fallback chain logic
    fallback.ts         # NEW: Web Speech API implementation
    fallback.test.ts    # NEW: Unit tests (Epic 8)
```

---

## Tasks

### Task 1: Create Web Speech API Fallback Module
**AC: 2, 3**
- [ ] Create `entrypoints/offscreen/fallback.ts`
- [ ] Implement `loadVoices()` with async voice loading
- [ ] Implement `selectBestVoice()` preferring local English voices
- [ ] Implement `speakWithWebSpeech()` with word boundary tracking
- [ ] Implement playback controls: `pauseWebSpeech()`, `resumeWebSpeech()`, `stopWebSpeech()`
- [ ] Implement `isWebSpeechAvailable()` check
- [ ] Implement `getWebSpeechVoices()` for UI

### Task 2: Implement Fallback Chain in TTS Engine
**AC: 1, 5**
- [ ] Add `initializeTTSWithFallback()` function
- [ ] Implement WebGPU -> WASM -> Web Speech chain
- [ ] Add `initializeKokoroWithDevice()` for specific device init
- [ ] Add `activeEngine` state tracking
- [ ] Add error handling with fallback progression
- [ ] Log each fallback attempt with `[SimpleReader]` prefix

### Task 3: Implement Device Capability Storage
**AC: 4**
- [ ] Add `persistDeviceCapability()` function
- [ ] Store capability using `STORAGE_KEYS.deviceCapability`
- [ ] Add `getDeviceCapability()` getter
- [ ] Update `getExtendedModelStatus()` to include engine info

### Task 4: Implement Unified Speech Generation
**AC: 1, 2, 6**
- [ ] Add `generateSpeechWithFallback()` function
- [ ] Route to Kokoro or Web Speech based on `activeEngine`
- [ ] Handle runtime Kokoro failures with Web Speech fallback
- [ ] Implement word timing callback for Web Speech
- [ ] Return consistent `GenerationResult` for both engines

### Task 5: Update Offscreen Message Handler
**AC: 1, 2, 5**
- [ ] Update `TTS_GENERATE` to use `initializeTTSWithFallback()`
- [ ] Update to use `generateSpeechWithFallback()`
- [ ] Add real-time word highlighting for Web Speech
- [ ] Handle playback control messages for Web Speech
- [ ] Include engine info in response

### Task 6: Use Existing Error Codes
**AC: 5**
- [ ] Use `ERROR_CODES.TTS_MODEL_LOAD_FAILED` when all engines fail to initialize
- [ ] Use `ERROR_CODES.TTS_SYNTHESIS_FAILED` when speech generation fails
- [ ] Use `ERROR_CODES.TTS_WASM_FAILED` for WASM-specific failures
- [ ] Ensure error messages are descriptive for fallback scenarios

### Task 7: Manual Testing
**AC: 1, 2, 3, 4, 5, 6**
- [ ] Test on WebGPU-capable device (should use WebGPU)
- [ ] Test with WebGPU disabled (should fallback to WASM)
- [ ] Test with Kokoro model blocked/unavailable (should use Web Speech)
- [ ] Verify `deviceCapability` stored correctly
- [ ] Test Web Speech playback controls (pause/resume/stop)
- [ ] Test word highlighting with Web Speech
- [ ] Verify console logs show fallback progression

---

## Definition of Done

- [ ] `fallback.ts` module created with Web Speech API implementation
- [ ] Fallback chain: WebGPU -> WASM -> Web Speech implemented
- [ ] Device capability stored in `chrome.storage.local`
- [ ] Web Speech API handles pause/resume/stop controls
- [ ] Word boundary events provide timing data for highlighting
- [ ] Error handling uses existing `ERROR_CODES` consistently
- [ ] Offscreen handler integrates fallback logic
- [ ] Console logs show fallback progression
- [ ] TTS always produces audio (never silently fails)
- [ ] No TypeScript errors

---

## Dependencies

### Depends On
- Story 2-2: Offscreen document lifecycle
- Story 2-3: Kokoro TTS integration (provides base implementation)
- Story 1-4: Storage helpers (`lib/storage.ts`)

### Enables
- Story 2-5: Word Timing Calculation (both engines provide timing)
- Story 2-6: Word Highlighting (needs timing from TTS)
- Story 6-4: Device Capability Detection (display in UI)

---

## Test Scenarios

### Manual Testing Checklist

| Scenario | Steps | Expected Behavior |
|----------|-------|-------------------|
| WebGPU success | Test on capable device | Console: "initialized with Kokoro WebGPU", capability: 'webgpu' |
| WebGPU -> WASM | Disable WebGPU flag in Chrome | Console: "WebGPU failed... WASM", capability: 'wasm' |
| Kokoro -> Web Speech | Block model network request | Console: "Kokoro failed... Web Speech API", capability: 'webspeech' |
| Web Speech voices | Use Web Speech fallback | Console shows selected voice name |
| Web Speech word boundary | Play with Web Speech | Words highlighted as spoken |
| Web Speech pause/resume | Pause then resume | Audio pauses and resumes correctly |
| Web Speech stop | Stop during playback | Audio stops, highlighting resets |
| All engines fail | Block everything | TTS_ERROR with clear message |

### Console Log Expectations (Fallback Scenario)

```
[SimpleReader] Attempting Kokoro WebGPU initialization...
[SimpleReader] WebGPU initialization failed: adapter unavailable
[SimpleReader] Attempting Kokoro WASM fallback...
[SimpleReader] WASM initialization failed: network error
[SimpleReader] Falling back to Web Speech API
[SimpleReader] Web Speech using voice: Google US English
[SimpleReader] TTS initialized with Web Speech API
[SimpleReader] Device capability stored: webspeech
[SimpleReader] Generating speech with Web Speech API
[SimpleReader] Web Speech generation complete
```

### Unit Test Cases (Epic 8)

```typescript
// fallback.test.ts
describe('Web Speech API Fallback', () => {
  it('loads available voices');
  it('selects best English voice');
  it('generates speech with word boundaries');
  it('handles pause/resume/stop');
  it('throws error when API unavailable');
});

// tts-engine.test.ts (additions)
describe('TTS Fallback Chain', () => {
  it('uses WebGPU when available');
  it('falls back to WASM when WebGPU fails');
  it('falls back to Web Speech when Kokoro fails');
  it('persists device capability');
  it('throws when all engines fail');
});
```

---

## References

- [Source: docs/architecture.md#TTS Engine] - FR3, FR4, NFR17
- [Source: docs/epics.md#Story 2.4] - Original story definition
- [Source: lib/storage.ts] - deviceCapability storage key
- [Source: lib/errors.ts] - Error handling patterns
- [MDN Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) - API reference
- [SpeechSynthesisUtterance](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance) - Utterance API

---

## Dev Notes

### Web Speech API Quirks

1. **Voice Loading**: Voices may not be available immediately on page load. Chrome fires `onvoiceschanged` event when ready.

2. **Rate Mapping**: Web Speech API `rate` property ranges 0.1-10 (default 1). Our 0.5-2.0 maps directly.

3. **Word Boundaries**: The `onboundary` event with `name === 'word'` provides character index, not word index. Must map from `charIndex` to word.

4. **No Raw Audio**: Web Speech API plays directly through browser - no `Float32Array` returned. Audio player logic must handle this case.

5. **Privacy Note**: Some system voices may use cloud services. This is acceptable as Web Speech is last resort fallback.

### Testing Fallback Chain

To force fallback scenarios during development:

```typescript
// Force WASM (disable WebGPU check)
// In detectDevice(), return 'wasm' directly

// Force Web Speech (make Kokoro fail)
// Throw error in initializeKokoroWithDevice()

// Disable all (test error handling)
// Return false from isWebSpeechAvailable()
```

### Chrome DevTools Tips

- **Disable WebGPU**: `chrome://flags/#enable-unsafe-webgpu` set to Disabled
- **View offscreen console**: `chrome://extensions` -> SimpleReader -> "Inspect views: offscreen.html"
- **Network throttling**: DevTools -> Network -> Offline (blocks model download)

---

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

### File List

- `entrypoints/offscreen/fallback.ts` (new: Web Speech API implementation)
- `entrypoints/offscreen/tts-engine.ts` (update: add fallback chain)
- `entrypoints/offscreen/index.ts` (update: integrate fallback, uses startKeepAlive/stopKeepAlive from story 2-2)
