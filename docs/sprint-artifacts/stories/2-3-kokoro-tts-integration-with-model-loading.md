# Story 2.3: Kokoro TTS Integration with Model Loading

## Story Info

| Field | Value |
|-------|-------|
| Epic | 2 - First Play Experience (The Magic Moment) |
| Story ID | 2-3 |
| Story Key | 2-3-kokoro-tts-integration-with-model-loading |
| Status | ready-for-dev |
| Created | 2025-12-11 |

---

## User Story

As a user,
I want the extension to generate natural-sounding speech from text,
So that I can listen to articles with high-quality audio.

---

## Context & Background

This is the **third story in Epic 2**, implementing the core TTS engine that powers SimpleReader's "magic moment". Kokoro TTS is an open-weight 82M parameter model that runs entirely in the browser via WebGPU or WASM, ensuring complete privacy.

### Why Kokoro TTS?

Kokoro offers significant advantages for a privacy-focused browser extension:
- **100% local processing** - no text ever leaves the browser
- **High quality** - comparable to larger commercial models
- **WebGPU acceleration** - fast inference on modern GPUs
- **WASM fallback** - works on older devices too
- **Streaming support** - audio chunks generated progressively
- **Multiple voices** - 21+ voice options available

### kokoro-js Library

The `kokoro-js` npm package (v1.2.0+) provides a JavaScript wrapper:

```typescript
import { KokoroTTS, TextSplitterStream } from "kokoro-js";

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
  dtype: "q8",       // Options: "fp32", "fp16", "q8", "q4", "q4f16"
  device: "webgpu",  // Options: "webgpu", "wasm" (browser) or "cpu" (node)
});

// Streaming generation
const splitter = new TextSplitterStream();
const stream = tts.stream(splitter);

for await (const { text, phonemes, audio } of stream) {
  // Process each chunk as it's generated
}

// Non-streaming generation
const audio = await tts.generate(text, { voice: "af_heart" });
```

### Model Details

| Property | Value |
|----------|-------|
| Model ID | `onnx-community/Kokoro-82M-v1.0-ONNX` |
| Size (q8) | ~80MB |
| Sample Rate | 24000 Hz |
| Quantization Options | fp32, fp16, q8, q4, q4f16 |
| Default Voice | `af_heart` (American female) |

### Architecture Reference

From `docs/architecture.md`:
- **ARCH-4**: Offscreen document REQUIRED for TTS - service workers cannot run WebGPU/WASM
- **FR1**: User can play text-to-speech audio generated locally in the browser
- **FR2**: System uses Kokoro TTS model running via WebGPU when available
- **FR6**: System caches the TTS model after first download

From `docs/project_context.md`:
- kokoro-js requires `wasm-unsafe-eval` CSP (already configured in Story 1-2)
- Model caching handled automatically by Transformers.js via IndexedDB

### Current State

The offscreen document (`entrypoints/offscreen/index.ts`) has a stub for TTS:

```typescript
case 'TTS_GENERATE':
  startKeepAlive();
  console.log('[SimpleReader] TTS generate requested:', {
    textLength: message.text.length,
    voice: message.voice,
    speed: message.speed,
  });
  // TODO: Story 2-3 - Kokoro TTS integration
  sendResponse({ success: true });
  break;
```

### Target State

After this story:
1. Kokoro TTS model loads in offscreen document (WebGPU preferred, WASM fallback)
2. Model is cached in IndexedDB after first download
3. Text generates audio with phoneme data for word timing
4. Audio chunks stream to content script via message protocol
5. Progress events sent during model loading and generation

---

## Acceptance Criteria

### AC1: Kokoro TTS Model Loading

**Given** the offscreen document receives a `TTS_GENERATE` message
**When** the TTS engine is not yet initialized
**Then**:
- `kokoro-js` loads the model via `KokoroTTS.from_pretrained()`
- Model ID is `onnx-community/Kokoro-82M-v1.0-ONNX`
- Quantization is `q8` (best balance of size/quality)
- Device detection tries WebGPU first, falls back to WASM
- Model initialization is a singleton (not reloaded per request)
- Console logs model loading progress with `[SimpleReader]` prefix

### AC2: Model Caching via IndexedDB

**Given** the model has been downloaded once
**When** the extension is reloaded or browser restarts
**Then**:
- Transformers.js (via kokoro-js) automatically caches in IndexedDB
- Subsequent loads use cached model (no network request)
- Cache persists across browser sessions
- First load shows progress, cached loads complete in < 500ms

### AC3: Audio Generation from Text

**Given** the TTS model is loaded
**When** a `TTS_GENERATE` message is received with text
**Then**:
- Text is processed through Kokoro TTS
- Voice parameter from message is used (default: `af_heart`)
- Speed parameter is applied (0.5x to 2.0x range)
- Audio is generated as raw PCM samples
- Phoneme data is extracted for word timing (Story 2-5)
- Generation uses streaming for progressive output

### AC4: Progress Events During Loading

**Given** model loading or audio generation is in progress
**When** progress changes
**Then**:
- `TTS_PROGRESS` messages are sent to background
- Progress is a percentage (0-100)
- Model download progress is reported separately from generation
- Background can forward progress to UI components

### AC5: Audio Chunk Streaming

**Given** audio is being generated
**When** chunks of audio are ready
**Then**:
- `TTS_CHUNK_READY` messages are sent with audio data
- AudioData is an ArrayBuffer containing PCM samples
- Word timing data accompanies each chunk
- Chunks are generated progressively (not waiting for full generation)
- `TTS_COMPLETE` is sent when all chunks are generated

### AC6: TTS Engine Module Structure

**Given** the project architecture
**When** implementing the TTS engine
**Then**:
- Main logic is in `entrypoints/offscreen/tts-engine.ts`
- Module exports `initializeTTS()`, `generateSpeech()`, `getModelStatus()`
- Only imports from `lib/` for types
- No direct chrome API usage in the module (pass via parameters)
- Module is testable in isolation

---

## Technical Implementation Notes

### Install kokoro-js Dependency

```bash
bun add kokoro-js
```

### TTS Engine Module (`entrypoints/offscreen/tts-engine.ts`)

```typescript
import { KokoroTTS, TextSplitterStream } from 'kokoro-js';
import type { WordTiming } from '@/lib/messages';
import { createTTSError, ERROR_CODES, type ExtensionError } from '@/lib/errors';

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const DEFAULT_VOICE = 'af_heart';
const SAMPLE_RATE = 24000;

// Singleton TTS instance
let ttsInstance: KokoroTTS | null = null;
let isInitializing = false;

// Progress callback type
type ProgressCallback = (progress: number) => void;

/**
 * Model status for UI display
 */
export interface ModelStatus {
  loaded: boolean;
  loading: boolean;
  device: 'webgpu' | 'wasm' | null;
  cached: boolean;
}

/**
 * Audio generation result
 */
export interface GenerationResult {
  audio: Float32Array;
  phonemes: string;
  wordTimings: WordTiming[];
  sampleRate: number;
}

/**
 * Detect the best available device for inference
 */
async function detectDevice(): Promise<'webgpu' | 'wasm'> {
  // Check for WebGPU support
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        console.log('[SimpleReader] WebGPU available, using GPU acceleration');
        return 'webgpu';
      }
    } catch (e) {
      console.log('[SimpleReader] WebGPU check failed:', e);
    }
  }

  console.log('[SimpleReader] Falling back to WASM');
  return 'wasm';
}

/**
 * Initialize the Kokoro TTS model (singleton)
 *
 * @param onProgress - Callback for loading progress (0-100)
 * @returns Promise that resolves when model is ready
 */
export async function initializeTTS(
  onProgress?: ProgressCallback
): Promise<void> {
  // Already initialized
  if (ttsInstance) {
    console.log('[SimpleReader] TTS already initialized');
    return;
  }

  // Prevent concurrent initialization
  if (isInitializing) {
    console.log('[SimpleReader] TTS initialization in progress, waiting...');
    await waitForInitialization();
    return;
  }

  isInitializing = true;

  try {
    console.log('[SimpleReader] Initializing Kokoro TTS...');

    const device = await detectDevice();

    // Initialize with progress tracking
    ttsInstance = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: 'q8',
      device,
      progress_callback: (progress: { progress: number; status: string }) => {
        const percent = Math.round(progress.progress * 100);
        console.log(`[SimpleReader] Model loading: ${percent}% - ${progress.status}`);
        onProgress?.(percent);
      },
    });

    console.log(`[SimpleReader] Kokoro TTS initialized (device: ${device})`);
  } catch (error) {
    console.error('[SimpleReader] TTS initialization failed:', error);
    throw createTTSError(
      ERROR_CODES.TTS_MODEL_LOAD_FAILED,
      'Failed to load Kokoro TTS model',
      true,
      error
    );
  } finally {
    isInitializing = false;
  }
}

/**
 * Wait for ongoing initialization to complete
 */
async function waitForInitialization(maxWaitMs = 60000): Promise<void> {
  const startTime = Date.now();
  while (isInitializing && Date.now() - startTime < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  if (!ttsInstance) {
    throw createTTSError(
      ERROR_CODES.TTS_MODEL_LOAD_FAILED,
      'TTS initialization timed out',
      true
    );
  }
}

/**
 * Generate speech from text
 *
 * @param text - Text to convert to speech
 * @param voice - Voice ID (default: af_heart)
 * @param speed - Playback speed multiplier (0.5-2.0)
 * @param onChunk - Callback for each audio chunk
 * @param onProgress - Callback for generation progress
 */
export async function generateSpeech(
  text: string,
  voice: string = DEFAULT_VOICE,
  speed: number = 1.0,
  onChunk?: (chunk: GenerationResult) => void,
  onProgress?: ProgressCallback
): Promise<GenerationResult> {
  if (!ttsInstance) {
    throw createTTSError(
      ERROR_CODES.TTS_MODEL_LOAD_FAILED,
      'TTS not initialized. Call initializeTTS() first.',
      true
    );
  }

  console.log('[SimpleReader] Generating speech:', {
    textLength: text.length,
    voice,
    speed,
  });

  // Clamp speed to valid range
  const clampedSpeed = Math.max(0.5, Math.min(2.0, speed));

  try {
    // Use streaming for progressive audio generation
    const splitter = new TextSplitterStream();
    const stream = ttsInstance.stream(splitter);

    // Start collecting results
    const chunks: GenerationResult[] = [];
    let totalSamples = 0;
    let processedChunks = 0;

    // Start processing stream in background
    const streamPromise = (async () => {
      for await (const { text: chunkText, phonemes, audio } of stream) {
        // Extract audio data
        const audioData = audio.audio_data as Float32Array;

        // Calculate word timings from phonemes (basic implementation)
        // Full implementation in Story 2-5
        const wordTimings = calculateBasicWordTimings(
          chunkText,
          phonemes,
          totalSamples,
          audioData.length,
          SAMPLE_RATE
        );

        const chunk: GenerationResult = {
          audio: audioData,
          phonemes,
          wordTimings,
          sampleRate: SAMPLE_RATE,
        };

        chunks.push(chunk);
        totalSamples += audioData.length;
        processedChunks++;

        // Report progress and chunk
        onChunk?.(chunk);

        console.log(`[SimpleReader] Generated chunk ${processedChunks}: ${audioData.length} samples`);
      }
    })();

    // Feed text to the stream with speed adjustment
    // Note: kokoro-js handles speed internally
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const totalSentences = sentences.length;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (sentence) {
        splitter.push(sentence);
        onProgress?.(Math.round(((i + 1) / totalSentences) * 50)); // First 50% is feeding
      }
    }

    // Signal end of input
    splitter.close();

    // Wait for all chunks to be generated
    await streamPromise;
    onProgress?.(100);

    // Combine all chunks into final result
    const totalLength = chunks.reduce((sum, c) => sum + c.audio.length, 0);
    const combinedAudio = new Float32Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      combinedAudio.set(chunk.audio, offset);
      offset += chunk.audio.length;
    }

    // Combine word timings
    const allWordTimings = chunks.flatMap(c => c.wordTimings);

    console.log('[SimpleReader] Speech generation complete:', {
      totalSamples: combinedAudio.length,
      durationSeconds: combinedAudio.length / SAMPLE_RATE,
      wordCount: allWordTimings.length,
    });

    return {
      audio: combinedAudio,
      phonemes: chunks.map(c => c.phonemes).join(' '),
      wordTimings: allWordTimings,
      sampleRate: SAMPLE_RATE,
    };

  } catch (error) {
    console.error('[SimpleReader] Speech generation failed:', error);
    throw createTTSError(
      ERROR_CODES.TTS_SYNTHESIS_FAILED,
      'Speech generation failed',
      true,
      error
    );
  }
}

/**
 * Calculate basic word timings from phonemes
 * This is a simplified implementation - full phoneme-weighted timing in Story 2-5
 */
function calculateBasicWordTimings(
  text: string,
  phonemes: string,
  sampleOffset: number,
  sampleCount: number,
  sampleRate: number
): WordTiming[] {
  const words = text.trim().split(/\s+/);
  if (words.length === 0) return [];

  const durationMs = (sampleCount / sampleRate) * 1000;
  const startTimeMs = (sampleOffset / sampleRate) * 1000;
  const avgWordDuration = durationMs / words.length;

  return words.map((word, i) => ({
    word,
    startTime: startTimeMs + (i * avgWordDuration),
    endTime: startTimeMs + ((i + 1) * avgWordDuration),
    index: i,
  }));
}

/**
 * Get current model status
 */
export function getModelStatus(): ModelStatus {
  return {
    loaded: ttsInstance !== null,
    loading: isInitializing,
    device: ttsInstance ? (detectDeviceSync() || 'wasm') : null,
    cached: false, // Transformers.js handles caching internally
  };
}

/**
 * Synchronous device detection (for status only)
 */
function detectDeviceSync(): 'webgpu' | 'wasm' | null {
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    return 'webgpu';
  }
  return 'wasm';
}

/**
 * Unload the TTS model to free memory
 * Call this after extended inactivity (Story 6-3)
 */
export async function unloadTTS(): Promise<void> {
  if (ttsInstance) {
    console.log('[SimpleReader] Unloading TTS model');
    // kokoro-js doesn't have explicit dispose, but nullifying allows GC
    ttsInstance = null;
  }
}

/**
 * Get list of available voices
 */
export function getAvailableVoices(): string[] {
  // Kokoro v1.0 voices
  return [
    // American Female voices
    'af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica',
    'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
    // American Male voices
    'am_adam', 'am_echo', 'am_eric', 'am_fenrir', 'am_liam',
    'am_michael', 'am_onyx', 'am_puck', 'am_santa',
    // British voices
    'bf_emma', 'bf_isabella',
    'bm_george', 'bm_lewis',
  ];
}
```

### Updated Offscreen Document Handler (`entrypoints/offscreen/index.ts`)

```typescript
import { addMessageListener, isTTSMessage, type TTSMessage, type MessageResponse } from '@/lib/messages';
import { sendMessageToBackground, Messages } from '@/lib/messages';
import { initializeTTS, generateSpeech, getModelStatus } from './tts-engine';
import { isExtensionError, serializeError, getErrorContext } from '@/lib/errors';

console.log('[SimpleReader] Offscreen document loaded');

// Keep-alive mechanism
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

function startKeepAlive(): void {
  if (keepAliveInterval) return;
  keepAliveInterval = setInterval(() => {
    console.debug('[SimpleReader] Offscreen keep-alive ping');
  }, 20000);
  console.log('[SimpleReader] Keep-alive started');
}

function stopKeepAlive(): void {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log('[SimpleReader] Keep-alive stopped');
  }
}

// Listen for TTS messages from background
addMessageListener((message, sender, sendResponse) => {
  if (isTTSMessage(message)) {
    handleTTSMessage(message, sendResponse);
    return true; // Async response
  }
  return false;
});

/**
 * Handle TTS messages with full Kokoro integration
 */
async function handleTTSMessage(
  message: TTSMessage,
  sendResponse: (response: MessageResponse) => void
): Promise<void> {
  switch (message.type) {
    case 'TTS_GENERATE':
      startKeepAlive();

      try {
        // Initialize TTS if needed (with progress reporting)
        await initializeTTS((progress) => {
          // Send loading progress to background
          chrome.runtime.sendMessage(Messages.ttsProgress(progress));
        });

        // Generate speech with chunk callbacks
        const result = await generateSpeech(
          message.text,
          message.voice,
          message.speed,
          (chunk) => {
            // Send each chunk as it's generated
            const audioBuffer = chunk.audio.buffer.slice(
              chunk.audio.byteOffset,
              chunk.audio.byteOffset + chunk.audio.byteLength
            );
            chrome.runtime.sendMessage(
              Messages.ttsChunkReady(audioBuffer, chunk.wordTimings)
            );
          },
          (progress) => {
            // Send generation progress
            chrome.runtime.sendMessage(Messages.ttsProgress(50 + progress / 2));
          }
        );

        // Send completion
        chrome.runtime.sendMessage(Messages.ttsComplete());
        sendResponse({ success: true, data: { wordCount: result.wordTimings.length } });

      } catch (error) {
        console.error('[SimpleReader] TTS generation failed:', error);
        // Serialize ExtensionError for message passing
        if (isExtensionError(error)) {
          const serialized = serializeError(error);
          chrome.runtime.sendMessage(Messages.ttsError(serialized));
          sendResponse({
            success: false,
            error: serialized,
          });
        } else {
          // Wrap unexpected errors
          const errorMessage = error instanceof Error ? error.message : String(error);
          chrome.runtime.sendMessage(Messages.ttsError(errorMessage));
          sendResponse({
            success: false,
            error: errorMessage,
          });
        }
      } finally {
        stopKeepAlive();
      }
      break;

    case 'TTS_COMPLETE':
      stopKeepAlive();
      sendResponse({ success: true });
      break;

    case 'TTS_ERROR':
      stopKeepAlive();
      console.error('[SimpleReader] TTS error:', message.error);
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ success: true });
  }
}

// Cleanup on unload
globalThis.addEventListener('beforeunload', () => {
  stopKeepAlive();
  console.log('[SimpleReader] Offscreen document unloading');
});
```

### Voice Constants (`lib/constants.ts`)

Create new file with voice constants for type safety:

```typescript
// lib/constants.ts

export const KOKORO_VOICES = {
  // American Female
  AF_HEART: 'af_heart',
  AF_ALLOY: 'af_alloy',
  AF_BELLA: 'af_bella',
  AF_NOVA: 'af_nova',
  AF_SKY: 'af_sky',
  // American Male
  AM_ADAM: 'am_adam',
  AM_ECHO: 'am_echo',
  AM_ONYX: 'am_onyx',
  // British
  BF_EMMA: 'bf_emma',
  BM_GEORGE: 'bm_george',
} as const;

export const DEFAULT_VOICE = KOKORO_VOICES.AF_HEART;
export const TTS_SAMPLE_RATE = 24000;
export const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
```

---

## Architecture Compliance

### Pattern Adherence

| Pattern | Compliance |
|---------|------------|
| ARCH-4: Offscreen required for TTS | Kokoro TTS runs in offscreen document only |
| ARCH-5: Cross-context via typed messages | Uses `TTS_*` messages from `lib/messages.ts` |
| ARCH-6: Only import from lib/ | tts-engine.ts imports types from lib/ only |
| FR1: Local TTS playback | Kokoro generates audio locally in browser |
| FR2: WebGPU when available | Device detection prefers WebGPU |
| FR6: Model caching | Transformers.js caches via IndexedDB |

### File Structure After Implementation

```
lib/
  constants.ts            # NEW: Voice constants and TTS config
  messages.ts             # EXISTING: TTS message types already defined

entrypoints/
  offscreen/
    index.html            # EXISTING: Offscreen HTML shell
    index.ts              # UPDATED: Full TTS message handling
    tts-engine.ts         # NEW: Kokoro TTS wrapper
    tts-engine.test.ts    # NEW: Unit tests (Epic 8)
```

---

## Tasks

### Task 1: Install kokoro-js Dependency
**AC: 1**
- [ ] Run `bun add kokoro-js`
- [ ] Verify package.json includes kokoro-js
- [ ] Ensure types are available (kokoro-js has built-in types)

### Task 2: Create TTS Engine Module
**AC: 1, 3, 6**
- [ ] Create `entrypoints/offscreen/tts-engine.ts`
- [ ] Implement `detectDevice()` for WebGPU/WASM detection
- [ ] Implement `initializeTTS()` with singleton pattern
- [ ] Implement `generateSpeech()` with streaming
- [ ] Implement `getModelStatus()` for status reporting
- [ ] Implement `getAvailableVoices()` for voice list
- [ ] Add `unloadTTS()` for memory management (Story 6-3)

### Task 3: Implement Progress Callbacks
**AC: 4**
- [ ] Add progress callback to `initializeTTS()`
- [ ] Add progress callback to `generateSpeech()`
- [ ] Wire progress to `TTS_PROGRESS` messages
- [ ] Test progress reporting in console

### Task 4: Implement Chunk Streaming
**AC: 5**
- [ ] Use `TextSplitterStream` for progressive generation
- [ ] Send `TTS_CHUNK_READY` for each audio chunk
- [ ] Include word timing data with chunks
- [ ] Send `TTS_COMPLETE` when generation finishes

### Task 5: Update Offscreen Message Handler
**AC: 1, 3, 4, 5**
- [ ] Update `handleTTSMessage()` in offscreen/index.ts
- [ ] Call `initializeTTS()` before generation
- [ ] Call `generateSpeech()` with chunk callbacks
- [ ] Send progress messages during loading/generation
- [ ] Handle errors and send `TTS_ERROR` messages

### Task 6: Create Voice Constants File
**AC: 3**
- [ ] Create `lib/constants.ts` with `KOKORO_VOICES`
- [ ] Add `DEFAULT_VOICE`, `TTS_SAMPLE_RATE`, `MODEL_ID`
- [ ] Update tts-engine.ts to use constants

### Task 7: Manual Testing
**AC: 1, 2, 3, 4, 5**
- [ ] Load extension in dev mode (`bun run dev`)
- [ ] Open offscreen document DevTools
- [ ] Send test `TTS_GENERATE` message
- [ ] Verify model downloads on first use
- [ ] Verify progress events in console
- [ ] Verify audio chunks generated
- [ ] Reload extension, verify cached model loads instantly
- [ ] Test with different voices
- [ ] Test speed adjustment (0.5x, 1.0x, 2.0x)

---

## Definition of Done

- [ ] `kokoro-js` installed as dependency
- [ ] `tts-engine.ts` module created with all exports
- [ ] TTS initializes with WebGPU when available, WASM fallback
- [ ] Model caches in IndexedDB after first download
- [ ] Progress events sent during loading and generation
- [ ] Audio chunks stream via `TTS_CHUNK_READY` messages
- [ ] Word timing data accompanies audio chunks
- [ ] Offscreen handler integrates tts-engine module
- [ ] Voice constants added to lib/constants.ts
- [ ] Console logs use `[SimpleReader]` prefix
- [ ] No TypeScript errors

---

## Dependencies

### Depends On
- Story 1-2: WASM CSP configuration (enables kokoro-js)
- Story 1-3: Typed message protocol (`lib/messages.ts`)
- Story 2-2: Offscreen document lifecycle (document must exist)

### Enables
- Story 2-4: TTS Fallback Chain (adds Web Speech API fallback)
- Story 2-5: Word Timing Calculation (uses phoneme data from this story)
- Story 2-6: Word Highlighting (needs audio + timing from TTS)
- Story 2-7: Basic Playback Controls (needs audio to play)

---

## Test Scenarios

### Manual Testing Checklist

| Scenario | Steps | Expected Behavior |
|----------|-------|-------------------|
| First model load | Send TTS_GENERATE, watch network | Model downloads (~80MB), progress events |
| Cached load | Reload extension, send TTS_GENERATE | Model loads from IndexedDB, no network |
| WebGPU device | Test on WebGPU-capable Chrome | Console shows "using GPU acceleration" |
| WASM fallback | Disable WebGPU flag, test | Console shows "Falling back to WASM" |
| Streaming chunks | Send long text | Multiple TTS_CHUNK_READY events |
| Voice selection | Test different voice IDs | Different voices produce different audio |
| Speed adjustment | Test speed 0.5, 1.0, 2.0 | Audio duration changes appropriately |
| Error handling | Send empty text or invalid voice | TTS_ERROR message sent |

### Console Log Expectations

```
[SimpleReader] Offscreen document loaded
[SimpleReader] Initializing Kokoro TTS...
[SimpleReader] WebGPU available, using GPU acceleration
[SimpleReader] Model loading: 10% - Fetching model...
[SimpleReader] Model loading: 50% - Loading weights...
[SimpleReader] Model loading: 100% - Ready
[SimpleReader] Kokoro TTS initialized (device: webgpu)
[SimpleReader] Generating speech: { textLength: 500, voice: 'af_heart', speed: 1 }
[SimpleReader] Generated chunk 1: 48000 samples
[SimpleReader] Generated chunk 2: 52000 samples
[SimpleReader] Speech generation complete: { totalSamples: 100000, durationSeconds: 4.17, wordCount: 85 }
```

### Unit Test Cases (Epic 8)

```typescript
// tts-engine.test.ts
describe('initializeTTS', () => {
  it('initializes model as singleton');
  it('detects WebGPU when available');
  it('falls back to WASM when WebGPU unavailable');
  it('reports progress during loading');
  it('prevents concurrent initialization');
});

describe('generateSpeech', () => {
  it('generates audio from text');
  it('applies voice parameter');
  it('clamps speed to valid range');
  it('streams chunks progressively');
  it('includes word timing data');
  it('throws error if not initialized');
});

describe('getModelStatus', () => {
  it('returns loaded=false before init');
  it('returns loaded=true after init');
  it('returns correct device type');
});
```

---

## References

- [Source: docs/architecture.md#TTS Engine] - FR1, FR2, FR6, ARCH-4
- [Source: docs/project_context.md#Manifest Configuration] - WASM CSP requirement
- [Source: docs/epics.md#Story 2.3] - Original story definition
- [Source: lib/messages.ts] - TTS message types
- [kokoro-js npm](https://www.npmjs.com/package/kokoro-js) - Package documentation
- [Kokoro GitHub](https://github.com/hexgrad/kokoro) - Model repository
- [onnx-community/Kokoro-82M-v1.0-ONNX](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX) - Model on HuggingFace

---

## Dev Notes

### kokoro-js API Quick Reference

```typescript
// Import
import { KokoroTTS, TextSplitterStream } from 'kokoro-js';

// Initialize
const tts = await KokoroTTS.from_pretrained(modelId, {
  dtype: 'q8',           // Quantization: fp32, fp16, q8, q4, q4f16
  device: 'webgpu',      // Device: webgpu, wasm (browser), cpu (node)
  progress_callback: fn, // Progress reporting
});

// Non-streaming generation
const audio = await tts.generate(text, { voice: 'af_heart' });

// Streaming generation
const splitter = new TextSplitterStream();
const stream = tts.stream(splitter);

for await (const { text, phonemes, audio } of stream) {
  // Process chunk
}

splitter.push('text');  // Add text
splitter.close();       // Signal end
splitter.flush();       // Flush without closing
```

### Model Size by Quantization

| Quantization | Size | Quality | Use Case |
|--------------|------|---------|----------|
| fp32 | ~320MB | Best | Development |
| fp16 | ~160MB | Excellent | High-end devices |
| q8 | ~80MB | Great | **Default choice** |
| q4 | ~40MB | Good | Low-memory devices |
| q4f16 | ~40MB | Good | WebGPU optimized |

We use `q8` as the default - best balance of download size and audio quality.

### WebGPU Detection

Chrome requires WebGPU to be enabled and working. Detection:

```typescript
if (navigator.gpu) {
  const adapter = await navigator.gpu.requestAdapter();
  if (adapter) {
    // WebGPU available
  }
}
```

### Word Timing Strategy

This story implements basic word timing (equal duration per word). Story 2-5 will implement proper phoneme-weighted timing:

```
Basic (this story):   word duration = total duration / word count
Phoneme (Story 2-5):  word duration = phonemes in word * avg phoneme duration
```

### Memory Management

The TTS model uses ~300-500MB of memory when loaded. Story 6-3 will implement automatic unloading after inactivity. For now, the model stays loaded until the offscreen document is closed.

---

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

### File List

- `package.json` (update: add kokoro-js dependency)
- `entrypoints/offscreen/tts-engine.ts` (new)
- `entrypoints/offscreen/index.ts` (update: integrate tts-engine)
- `lib/constants.ts` (new: voice constants and TTS config)
