// entrypoints/offscreen/audio-player.ts
// Web Audio API player for Kokoro TTS audio chunks

import { TTS_SAMPLE_RATE } from '@/lib/constants';

// ============================================
// Types
// ============================================

interface AudioPlayerState {
  context: AudioContext | null;
  currentSource: AudioBufferSourceNode | null;
  pendingBuffer: Float32Array | null; // Buffer being built for playback
  isPlaying: boolean;
  isPaused: boolean;
  pausedAt: number; // playback position in samples when paused
  startedAt: number; // AudioContext time when playback started
  onPlaybackEnd?: () => void;
  onPositionUpdate?: (positionMs: number) => void;
}

// ============================================
// Module State
// ============================================

const state: AudioPlayerState = {
  context: null,
  currentSource: null,
  pendingBuffer: null,
  isPlaying: false,
  isPaused: false,
  pausedAt: 0,
  startedAt: 0,
  onPlaybackEnd: undefined,
  onPositionUpdate: undefined,
};

// ============================================
// Context Management
// ============================================

/**
 * Ensure AudioContext exists and is in running state.
 * AudioContext must be created after user gesture.
 */
function ensureContext(): AudioContext {
  if (!state.context) {
    state.context = new AudioContext({ sampleRate: TTS_SAMPLE_RATE });
    console.log(`[SimpleReader] AudioContext created (sampleRate: ${TTS_SAMPLE_RATE})`);
  }

  // Resume if suspended (browser autoplay policy)
  if (state.context.state === 'suspended') {
    state.context.resume();
  }

  return state.context;
}

// ============================================
// Audio Queue Management
// ============================================

/**
 * Queue an audio chunk for playback.
 * Chunks are accumulated and played when play() is called.
 */
export function queueAudioChunk(samples: Float32Array): void {
  if (state.pendingBuffer) {
    // Append to existing buffer
    const combined = new Float32Array(state.pendingBuffer.length + samples.length);
    combined.set(state.pendingBuffer);
    combined.set(samples, state.pendingBuffer.length);
    state.pendingBuffer = combined;
  } else {
    // Start new buffer
    state.pendingBuffer = new Float32Array(samples);
  }

  console.log(`[SimpleReader] Queued ${samples.length} samples, total: ${state.pendingBuffer.length}`);

  // If we're playing and not paused, we need to restart with combined buffer
  // but preserve current playback position to avoid replaying audio
  if (state.isPlaying && !state.isPaused && state.context && state.currentSource) {
    // Calculate how far we've played into the previous buffer
    const elapsedSeconds = state.context.currentTime - state.startedAt;
    const previousOffset = state.pausedAt / TTS_SAMPLE_RATE;
    const currentPositionSamples = Math.floor((elapsedSeconds + previousOffset) * TTS_SAMPLE_RATE);

    // Store position before restarting
    state.pausedAt = currentPositionSamples;

    // Restart playback with combined buffer from current position
    playPendingBuffer();
  }
}

/**
 * Play the pending audio buffer.
 */
function playPendingBuffer(): void {
  if (!state.pendingBuffer || state.pendingBuffer.length === 0) {
    return;
  }

  const context = ensureContext();

  // Stop any currently playing source
  if (state.currentSource) {
    try {
      state.currentSource.onended = null;
      state.currentSource.stop();
    } catch {
      // Ignore errors if already stopped
    }
  }

  // Create audio buffer
  const buffer = context.createBuffer(1, state.pendingBuffer.length, TTS_SAMPLE_RATE);
  buffer.copyToChannel(new Float32Array(state.pendingBuffer), 0);

  // Create source node
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);

  source.onended = () => {
    if (state.currentSource === source) {
      state.isPlaying = false;
      state.currentSource = null;
      console.log('[SimpleReader] Audio playback ended');
      state.onPlaybackEnd?.();
    }
  };

  state.currentSource = source;
  state.startedAt = context.currentTime;

  // Start playback (from paused position if resuming)
  const offsetSeconds = state.pausedAt / TTS_SAMPLE_RATE;
  source.start(0, offsetSeconds);
  state.isPlaying = true;
  state.isPaused = false;

  const duration = (state.pendingBuffer.length - state.pausedAt) / TTS_SAMPLE_RATE;
  console.log(`[SimpleReader] Playing audio: ${duration.toFixed(2)}s from offset ${offsetSeconds.toFixed(2)}s`);
}

// ============================================
// Playback Control
// ============================================

/**
 * Start playback of queued audio.
 */
export function play(): void {
  if (state.isPaused) {
    resume();
    return;
  }

  if (state.isPlaying) {
    console.log('[SimpleReader] Already playing');
    return;
  }

  state.pausedAt = 0;
  playPendingBuffer();
}

/**
 * Pause audio playback.
 */
export function pause(): void {
  if (!state.isPlaying || state.isPaused) return;

  const context = state.context;
  if (!context || !state.currentSource) return;

  // Calculate current position in samples
  const elapsedSeconds = context.currentTime - state.startedAt;
  const offsetFromPause = state.pausedAt / TTS_SAMPLE_RATE;
  state.pausedAt = Math.floor((elapsedSeconds + offsetFromPause) * TTS_SAMPLE_RATE);

  // Stop current source
  try {
    state.currentSource.onended = null;
    state.currentSource.stop();
  } catch {
    // Ignore errors if already stopped
  }

  state.currentSource = null;
  state.isPlaying = false;
  state.isPaused = true;

  console.log(`[SimpleReader] Audio paused at sample ${state.pausedAt} (${(state.pausedAt / TTS_SAMPLE_RATE).toFixed(2)}s)`);
}

/**
 * Resume audio playback from paused position.
 */
export function resume(): void {
  if (!state.isPaused) {
    console.log('[SimpleReader] Not paused, cannot resume');
    return;
  }

  playPendingBuffer();
}

/**
 * Stop audio playback and clear all buffers.
 */
export function stop(): void {
  // Stop current source
  if (state.currentSource) {
    try {
      state.currentSource.onended = null;
      state.currentSource.stop();
    } catch {
      // Ignore errors if already stopped
    }
    state.currentSource = null;
  }

  // Clear state
  state.pendingBuffer = null;
  state.isPlaying = false;
  state.isPaused = false;
  state.pausedAt = 0;
  state.startedAt = 0;

  console.log('[SimpleReader] Audio stopped and cleared');
}

/**
 * Reset player state for new playback session.
 */
export function reset(): void {
  stop();
}

// ============================================
// Status Queries
// ============================================

/**
 * Get current playback position in milliseconds.
 */
export function getCurrentPositionMs(): number {
  if (state.isPaused) {
    return (state.pausedAt / TTS_SAMPLE_RATE) * 1000;
  }

  if (!state.isPlaying || !state.context) {
    return 0;
  }

  const elapsedSeconds = state.context.currentTime - state.startedAt;
  const offsetFromPause = state.pausedAt / TTS_SAMPLE_RATE;
  return (elapsedSeconds + offsetFromPause) * 1000;
}

/**
 * Get current playback position in samples.
 */
export function getCurrentPositionSamples(): number {
  return Math.floor(getCurrentPositionMs() / 1000 * TTS_SAMPLE_RATE);
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
 * Get total duration of queued audio in milliseconds.
 */
export function getTotalDurationMs(): number {
  if (!state.pendingBuffer) return 0;
  return (state.pendingBuffer.length / TTS_SAMPLE_RATE) * 1000;
}

// ============================================
// Callbacks
// ============================================

/**
 * Set callback for when playback ends naturally.
 */
export function onPlaybackEnd(callback: () => void): void {
  state.onPlaybackEnd = callback;
}

/**
 * Set callback for position updates (called during playback).
 */
export function onPositionUpdate(callback: (positionMs: number) => void): void {
  state.onPositionUpdate = callback;
}
