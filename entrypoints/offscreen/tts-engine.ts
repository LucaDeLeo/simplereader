// entrypoints/offscreen/tts-engine.ts
// Kokoro TTS engine wrapper for offscreen document

import { KokoroTTS, TextSplitterStream } from 'kokoro-js';
import type { RawAudio } from '@huggingface/transformers';
import type { WordTiming } from '@/lib/messages';
import { createTTSError, ERROR_CODES } from '@/lib/errors';
import { calculateWordTimings } from '@/lib/phoneme-timing';
import {
  MODEL_ID,
  MODEL_DTYPE,
  TTS_SAMPLE_RATE,
  DEFAULT_VOICE,
  clampSpeed,
  getAllVoices,
  type TTSDevice,
  type KokoroVoice,
} from '@/lib/constants';
import { setLocalValue, STORAGE_KEYS, type DeviceCapability } from '@/lib/storage';
import {
  isWebSpeechAvailable,
  speak as speakWithWebSpeech,
  loadVoices as loadWebSpeechVoices,
  stop as stopWebSpeech,
  pause as pauseWebSpeech,
  resume as resumeWebSpeech,
} from './web-speech';

// Type for Transformers.js progress info
interface TransformersProgressInfo {
  status: string;
  name?: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}

// ============================================
// Types
// ============================================

/** Progress callback type (0-100) */
export type ProgressCallback = (progress: number) => void;

/** Model loading/status information */
export interface ModelStatus {
  loaded: boolean;
  loading: boolean;
  device: TTSDevice | null;
  cached: boolean;
}

/** Result from audio generation */
export interface GenerationResult {
  audio: Float32Array;
  phonemes: string;
  wordTimings: WordTiming[];
  sampleRate: number;
}

/** Chunk result during streaming generation */
export interface GenerationChunk {
  audio: Float32Array;
  phonemes: string;
  wordTimings: WordTiming[];
  sampleRate: number;
}

// ============================================
// Module State (Singleton Pattern)
// ============================================

let ttsInstance: KokoroTTS | null = null;
let isInitializing = false;
let currentDevice: TTSDevice | null = null;
let initializationPromise: Promise<void> | null = null;

// Fallback chain state
let activeEngine: 'kokoro-webgpu' | 'kokoro-wasm' | 'webspeech' | null = null;
let deviceCapability: DeviceCapability | null = null;

// ============================================
// Device Detection
// ============================================

/**
 * Detect the best available device for TTS inference.
 * Prefers WebGPU for performance, falls back to WASM.
 */
async function detectDevice(): Promise<TTSDevice> {
  // Check for WebGPU support
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gpu = (navigator as any).gpu;
      const adapter = await gpu.requestAdapter();
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
 * Synchronous device check for status reporting.
 * Only checks capability, not actual availability.
 */
function detectDeviceSync(): TTSDevice {
  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    return 'webgpu';
  }
  return 'wasm';
}

// ============================================
// Initialization
// ============================================

/**
 * Initialize the Kokoro TTS model (singleton).
 *
 * - First call downloads and loads the model (~80MB for q8)
 * - Subsequent calls return immediately
 * - Concurrent calls wait for the first initialization
 * - Model is cached in IndexedDB by Transformers.js
 *
 * @param onProgress - Callback for loading progress (0-100)
 */
export async function initializeTTS(onProgress?: ProgressCallback): Promise<void> {
  // Already initialized
  if (ttsInstance) {
    console.log('[SimpleReader] TTS already initialized');
    return;
  }

  // Wait for ongoing initialization
  if (isInitializing && initializationPromise) {
    console.log('[SimpleReader] TTS initialization in progress, waiting...');
    await initializationPromise;
    return;
  }

  // Start initialization
  isInitializing = true;

  initializationPromise = (async () => {
    try {
      console.log('[SimpleReader] Initializing Kokoro TTS...');
      console.log(`[SimpleReader] Model: ${MODEL_ID}, dtype: ${MODEL_DTYPE}`);

      const device = await detectDevice();
      currentDevice = device;

      // Track loading progress
      let lastProgress = 0;

      ttsInstance = await KokoroTTS.from_pretrained(MODEL_ID, {
        dtype: MODEL_DTYPE,
        device,
        progress_callback: (progressInfo: TransformersProgressInfo) => {
          // Only handle progress status with actual progress value
          if (progressInfo.status === 'progress' && progressInfo.progress !== undefined) {
            const percent = Math.round(progressInfo.progress);

            // Only report significant changes to reduce noise
            if (percent > lastProgress) {
              lastProgress = percent;
              console.log(`[SimpleReader] Model loading: ${percent}% - ${progressInfo.file ?? 'loading'}`);
              onProgress?.(percent);
            }
          } else if (progressInfo.status === 'done') {
            console.log(`[SimpleReader] Downloaded: ${progressInfo.file}`);
          } else if (progressInfo.status === 'initiate') {
            console.log(`[SimpleReader] Downloading: ${progressInfo.file}`);
          }
        },
      });

      console.log(`[SimpleReader] Kokoro TTS initialized (device: ${device})`);
      onProgress?.(100);
    } catch (error) {
      console.error('[SimpleReader] TTS initialization failed:', error);
      ttsInstance = null;
      currentDevice = null;

      throw createTTSError(
        ERROR_CODES.TTS_MODEL_LOAD_FAILED,
        `Failed to load Kokoro TTS model: ${error instanceof Error ? error.message : String(error)}`,
        true,
        error
      );
    } finally {
      isInitializing = false;
      initializationPromise = null;
    }
  })();

  await initializationPromise;
}

// ============================================
// Speech Generation
// ============================================

/**
 * Generate speech from text using Kokoro TTS.
 *
 * Uses streaming generation for progressive output.
 * Each chunk contains audio samples and word timing data.
 *
 * @param text - Text to convert to speech
 * @param voice - Voice ID (default: af_heart)
 * @param speed - Playback speed multiplier (0.5-2.0)
 * @param onChunk - Callback for each audio chunk as it's generated
 * @param onProgress - Callback for generation progress (0-100)
 * @returns Combined audio result with all samples and timings
 */
export async function generateSpeech(
  text: string,
  voice: string = DEFAULT_VOICE,
  speed: number = 1.0,
  onChunk?: (chunk: GenerationChunk) => void,
  onProgress?: ProgressCallback
): Promise<GenerationResult> {
  if (!ttsInstance) {
    throw createTTSError(
      ERROR_CODES.TTS_MODEL_LOAD_FAILED,
      'TTS not initialized. Call initializeTTS() first.',
      true
    );
  }

  // Validate and normalize input
  const trimmedText = text.trim();
  if (!trimmedText) {
    throw createTTSError(
      ERROR_CODES.TTS_SYNTHESIS_FAILED,
      'Cannot generate speech from empty text',
      false
    );
  }

  const normalizedSpeed = clampSpeed(speed);
  const normalizedVoice = voice || DEFAULT_VOICE;

  console.log('[SimpleReader] Generating speech:', {
    textLength: trimmedText.length,
    voice: normalizedVoice,
    speed: normalizedSpeed,
  });

  try {
    // Use streaming for progressive audio generation
    const splitter = new TextSplitterStream();
    const stream = ttsInstance.stream(splitter, { voice: normalizedVoice as KokoroVoice });

    // Collect all chunks
    const chunks: GenerationChunk[] = [];
    let totalSamplesProcessed = 0;
    let chunkCount = 0;

    // Process stream in background
    const streamPromise = (async () => {
      for await (const result of stream) {
        const { text: chunkText, phonemes, audio } = result;

        // Extract audio data - RawAudio has 'audio' property (Float32Array)
        const audioData = (audio as RawAudio).audio;

        // Calculate word timings for this chunk using phoneme-weighted algorithm
        const wordTimings = calculateWordTimings(
          chunkText,
          phonemes,
          totalSamplesProcessed,
          audioData.length,
          TTS_SAMPLE_RATE
        );

        const chunk: GenerationChunk = {
          audio: audioData,
          phonemes,
          wordTimings,
          sampleRate: TTS_SAMPLE_RATE,
        };

        chunks.push(chunk);
        totalSamplesProcessed += audioData.length;
        chunkCount++;

        // Report chunk
        onChunk?.(chunk);

        console.log(
          `[SimpleReader] Generated chunk ${chunkCount}: ${audioData.length} samples (${(audioData.length / TTS_SAMPLE_RATE).toFixed(2)}s)`
        );
      }
    })();

    // Split text into sentences for streaming
    // This regex handles common sentence endings
    const sentences = trimmedText.match(/[^.!?]+[.!?]+\s*/g) || [trimmedText];
    const totalSentences = sentences.length;

    // Feed sentences to the splitter
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i].trim();
      if (sentence) {
        splitter.push(sentence);
        // Report progress based on input processing (first 50%)
        onProgress?.(Math.round(((i + 1) / totalSentences) * 50));
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

    // Combine word timings from all chunks
    const allWordTimings = chunks.flatMap((c) => c.wordTimings);

    // Re-index word timings sequentially
    allWordTimings.forEach((timing, index) => {
      timing.index = index;
    });

    console.log('[SimpleReader] Speech generation complete:', {
      totalSamples: combinedAudio.length,
      durationSeconds: (combinedAudio.length / TTS_SAMPLE_RATE).toFixed(2),
      wordCount: allWordTimings.length,
      chunks: chunkCount,
    });

    return {
      audio: combinedAudio,
      phonemes: chunks.map((c) => c.phonemes).join(' '),
      wordTimings: allWordTimings,
      sampleRate: TTS_SAMPLE_RATE,
    };
  } catch (error) {
    console.error('[SimpleReader] Speech generation failed:', error);

    // If it's already an ExtensionError, re-throw
    if (error && typeof error === 'object' && 'code' in error) {
      throw error;
    }

    throw createTTSError(
      ERROR_CODES.TTS_SYNTHESIS_FAILED,
      `Speech generation failed: ${error instanceof Error ? error.message : String(error)}`,
      true,
      error
    );
  }
}

// ============================================
// Status and Cleanup
// ============================================

/**
 * Get current model status for UI display.
 */
export function getModelStatus(): ModelStatus {
  return {
    loaded: ttsInstance !== null,
    loading: isInitializing,
    device: currentDevice,
    cached: false, // Transformers.js handles caching internally via IndexedDB
  };
}

/**
 * Get list of available voices.
 */
export function getAvailableVoices(): string[] {
  return getAllVoices();
}

/**
 * Unload the TTS model to free memory.
 *
 * Call this after extended inactivity to reduce memory usage.
 * The model will be reloaded (from cache) on next generation.
 */
export async function unloadTTS(): Promise<void> {
  if (ttsInstance) {
    console.log('[SimpleReader] Unloading TTS model');
    // kokoro-js doesn't have explicit dispose, but nullifying allows GC
    ttsInstance = null;
    currentDevice = null;
  }
}

// ============================================
// Fallback Chain Initialization
// ============================================

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

  // Track loading progress
  let lastProgress = 0;

  ttsInstance = await KokoroTTS.from_pretrained(MODEL_ID, {
    dtype: MODEL_DTYPE,
    device,
    progress_callback: (progressInfo: TransformersProgressInfo) => {
      if (progressInfo.status === 'progress' && progressInfo.progress !== undefined) {
        const percent = Math.round(progressInfo.progress);
        if (percent > lastProgress) {
          lastProgress = percent;
          onProgress?.(percent);
        }
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

// ============================================
// Unified Speech Generation
// ============================================

/**
 * Generate speech using Web Speech API.
 */
async function generateWithWebSpeech(
  text: string,
  speed: number,
  onWord?: (timing: WordTiming) => void
): Promise<GenerationResult> {
  console.log('[SimpleReader] Generating speech with Web Speech API');

  const result = await speakWithWebSpeech(text, '', speed, {
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

// ============================================
// Engine Status and Control
// ============================================

/**
 * Get current active TTS engine.
 */
export function getActiveEngine(): typeof activeEngine {
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
export function getExtendedModelStatus(): ModelStatus & { activeEngine: typeof activeEngine } {
  return {
    ...getModelStatus(),
    activeEngine,
  };
}

/**
 * Stop current TTS playback (routes to correct engine).
 */
export function stopCurrentPlayback(): void {
  if (activeEngine === 'webspeech') {
    stopWebSpeech();
  }
  // Kokoro audio playback is handled externally by audio player
}

/**
 * Pause current TTS playback (routes to correct engine).
 */
export function pauseCurrentPlayback(): void {
  if (activeEngine === 'webspeech') {
    pauseWebSpeech();
  }
  // Kokoro audio playback is handled externally by audio player
}

/**
 * Resume current TTS playback (routes to correct engine).
 */
export function resumeCurrentPlayback(): void {
  if (activeEngine === 'webspeech') {
    resumeWebSpeech();
  }
  // Kokoro audio playback is handled externally by audio player
}
