// lib/constants.ts
// TTS configuration constants for Kokoro TTS integration

// ============================================
// Model Configuration
// ============================================

/** Hugging Face model ID for Kokoro TTS */
export const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

/** Model quantization - q8 offers best balance of size (~80MB) and quality */
export type ModelDtype = 'fp32' | 'fp16' | 'q8' | 'q4' | 'q4f16';
export const MODEL_DTYPE: ModelDtype = 'q8';

/** Audio sample rate for Kokoro TTS output */
export const TTS_SAMPLE_RATE = 24000;

// ============================================
// Voice Configuration
// ============================================

/**
 * Available Kokoro v1.0 voices
 * Naming convention:
 * - af_* = American Female
 * - am_* = American Male
 * - bf_* = British Female
 * - bm_* = British Male
 */
export const KOKORO_VOICES = {
  // American Female voices
  AF_HEART: 'af_heart',
  AF_ALLOY: 'af_alloy',
  AF_AOEDE: 'af_aoede',
  AF_BELLA: 'af_bella',
  AF_JESSICA: 'af_jessica',
  AF_KORE: 'af_kore',
  AF_NICOLE: 'af_nicole',
  AF_NOVA: 'af_nova',
  AF_RIVER: 'af_river',
  AF_SARAH: 'af_sarah',
  AF_SKY: 'af_sky',

  // American Male voices
  AM_ADAM: 'am_adam',
  AM_ECHO: 'am_echo',
  AM_ERIC: 'am_eric',
  AM_FENRIR: 'am_fenrir',
  AM_LIAM: 'am_liam',
  AM_MICHAEL: 'am_michael',
  AM_ONYX: 'am_onyx',
  AM_PUCK: 'am_puck',
  AM_SANTA: 'am_santa',

  // British Female voices
  BF_EMMA: 'bf_emma',
  BF_ISABELLA: 'bf_isabella',

  // British Male voices
  BM_GEORGE: 'bm_george',
  BM_LEWIS: 'bm_lewis',
} as const;

export type KokoroVoice = (typeof KOKORO_VOICES)[keyof typeof KOKORO_VOICES];

/** Default voice for TTS generation */
export const DEFAULT_VOICE: KokoroVoice = KOKORO_VOICES.AF_HEART;

// ============================================
// Speed Configuration
// ============================================

/** Minimum playback speed multiplier */
export const MIN_SPEED = 0.5;

/** Maximum playback speed multiplier */
export const MAX_SPEED = 2.0;

/** Default playback speed multiplier */
export const DEFAULT_SPEED = 1.0;

/**
 * Clamp speed to valid range
 */
export function clampSpeed(speed: number): number {
  return Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed));
}

// ============================================
// Device Configuration
// ============================================

/** TTS inference device types */
export type TTSDevice = 'webgpu' | 'wasm';

// ============================================
// Voice Metadata
// ============================================

export interface VoiceMetadata {
  id: KokoroVoice;
  name: string;
  gender: 'female' | 'male';
  accent: 'american' | 'british';
}

/**
 * Get human-readable metadata for a voice
 */
export function getVoiceMetadata(voice: KokoroVoice): VoiceMetadata {
  const prefix = voice.substring(0, 2);
  const name = voice.substring(3);

  const genderMap: Record<string, 'female' | 'male'> = {
    af: 'female',
    am: 'male',
    bf: 'female',
    bm: 'male',
  };

  const accentMap: Record<string, 'american' | 'british'> = {
    af: 'american',
    am: 'american',
    bf: 'british',
    bm: 'british',
  };

  return {
    id: voice,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    gender: genderMap[prefix] ?? 'female',
    accent: accentMap[prefix] ?? 'american',
  };
}

/**
 * Get all available voices as an array
 */
export function getAllVoices(): KokoroVoice[] {
  return Object.values(KOKORO_VOICES);
}

/**
 * Get voices filtered by criteria
 */
export function getVoicesByFilter(filter: {
  gender?: 'female' | 'male';
  accent?: 'american' | 'british';
}): KokoroVoice[] {
  return getAllVoices().filter((voice) => {
    const metadata = getVoiceMetadata(voice);
    if (filter.gender && metadata.gender !== filter.gender) return false;
    if (filter.accent && metadata.accent !== filter.accent) return false;
    return true;
  });
}
