// entrypoints/offscreen/web-speech.ts
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

export interface WebSpeechCallbacks {
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
  const localEnglish = voices.find((v) => v.lang.startsWith('en') && v.localService);
  if (localEnglish) return localEnglish;

  const anyEnglish = voices.find((v) => v.lang.startsWith('en'));
  if (anyEnglish) return anyEnglish;

  const defaultVoice = voices.find((v) => v.default);
  if (defaultVoice) return defaultVoice;

  return voices[0] || null;
}

/**
 * Get list of available Web Speech voices for UI.
 */
export function getAvailableVoices(): Array<{ name: string; lang: string; local: boolean }> {
  return availableVoices.map((v) => ({
    name: v.name,
    lang: v.lang,
    local: v.localService,
  }));
}

// ============================================
// Availability Check
// ============================================

/**
 * Check if Web Speech API is available.
 */
export function isWebSpeechAvailable(): boolean {
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

// ============================================
// Speech Generation
// ============================================

/**
 * Generate speech using Web Speech API.
 * Returns a promise that resolves with word timing data.
 *
 * @param text - Text to speak
 * @param voice - Voice name (unused, uses selectBestVoice)
 * @param speed - Playback speed (0.5-2.0)
 * @param callbacks - Event callbacks for word, end, error
 */
export async function speak(
  text: string,
  _voice: string,
  speed: number = 1.0,
  callbacks: WebSpeechCallbacks = {}
): Promise<WebSpeechResult> {
  if (!isWebSpeechAvailable()) {
    throw createTTSError(
      ERROR_CODES.TTS_WASM_FAILED,
      'Web Speech API is not available in this browser',
      false
    );
  }

  // Cancel any existing speech
  stop();

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
    // Our 0.5-2.0 range maps directly
    const clampedSpeed = clampSpeed(speed);
    utterance.rate = clampedSpeed;

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
        callbacks.onWord?.(timing);
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
      callbacks.onEnd?.();

      resolve({
        wordTimings,
        duration,
      });
    };

    utterance.onerror = (event) => {
      currentUtterance = null;
      const error = new Error(`Speech synthesis error: ${event.error}`);
      callbacks.onError?.(error);
      reject(
        createTTSError(ERROR_CODES.TTS_SYNTHESIS_FAILED, `Web Speech API error: ${event.error}`, true)
      );
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
export function pause(): void {
  if (speechSynthesis.speaking && !speechSynthesis.paused) {
    speechSynthesis.pause();
    console.log('[SimpleReader] Web Speech paused');
  }
}

/**
 * Resume Web Speech playback.
 */
export function resume(): void {
  if (speechSynthesis.paused) {
    speechSynthesis.resume();
    console.log('[SimpleReader] Web Speech resumed');
  }
}

/**
 * Stop Web Speech playback.
 */
export function stop(): void {
  speechSynthesis.cancel();
  currentUtterance = null;
  console.log('[SimpleReader] Web Speech stopped');
}

/**
 * Check if Web Speech is currently speaking.
 */
export function isSpeaking(): boolean {
  return speechSynthesis.speaking;
}

/**
 * Check if Web Speech is paused.
 */
export function isPaused(): boolean {
  return speechSynthesis.paused;
}
