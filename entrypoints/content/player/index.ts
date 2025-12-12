// entrypoints/content/player/index.ts
// Player lifecycle management with Shadow DOM injection

import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import { MiniPlayer } from './MiniPlayer';
import {
  sendMessageToBackground,
  Messages,
  type PlaybackState,
} from '@/lib/messages';

// Import CSS as string for injection into Shadow DOM
import miniPlayerStyles from './mini-player.css?inline';

// ============================================
// Player State
// ============================================

interface PlayerState {
  visible: boolean;
  playbackState: PlaybackState;
  currentPosition: number;
  totalWords: number;
}

const state: PlayerState = {
  visible: false,
  playbackState: 'stopped',
  currentPosition: 0,
  totalWords: 0,
};

// ============================================
// DOM References
// ============================================

let shadowRoot: ShadowRoot | null = null;
let playerRoot: Root | null = null;
let containerElement: HTMLDivElement | null = null;

// ============================================
// Public API
// ============================================

/**
 * Initialize the player module.
 * Creates Shadow DOM container but doesn't show player until state changes.
 */
export function initializePlayer(): void {
  // Prevent duplicate injection
  if (document.getElementById('simplereader-root')) {
    console.log('[SimpleReader] Player container already exists');
    return;
  }

  // Create container element
  containerElement = document.createElement('div');
  containerElement.id = 'simplereader-root';
  document.body.appendChild(containerElement);

  // Attach closed Shadow DOM for style isolation
  shadowRoot = containerElement.attachShadow({ mode: 'closed' });

  // Inject styles into Shadow DOM
  const styleElement = document.createElement('style');
  styleElement.textContent = miniPlayerStyles;
  shadowRoot.appendChild(styleElement);

  // Create mount point for React
  const mountPoint = document.createElement('div');
  mountPoint.id = 'simplereader-player-mount';
  shadowRoot.appendChild(mountPoint);

  // Create React root
  playerRoot = createRoot(mountPoint);

  console.log('[SimpleReader] Player initialized (Shadow DOM)');
}

/**
 * Set the total word count (from content extraction).
 */
export function setTotalWords(count: number): void {
  state.totalWords = count;
}

/**
 * Update player state from PLAYBACK_STATE_CHANGED message.
 */
export function updatePlayerState(playbackState: PlaybackState, position: number): void {
  const previousState = state.playbackState;
  state.playbackState = playbackState;
  state.currentPosition = position;

  console.log(`[SimpleReader] Player state: ${previousState} -> ${playbackState}`);

  if (playbackState === 'stopped') {
    hidePlayer();
  } else {
    showPlayer();
  }
}

/**
 * Clean up player module.
 */
export function destroyPlayer(): void {
  if (playerRoot) {
    playerRoot.unmount();
    playerRoot = null;
  }

  if (containerElement) {
    containerElement.remove();
    containerElement = null;
  }

  shadowRoot = null;
  state.visible = false;
  state.playbackState = 'stopped';
  state.currentPosition = 0;

  console.log('[SimpleReader] Player destroyed');
}

// ============================================
// Internal Functions
// ============================================

function showPlayer(): void {
  if (!playerRoot) {
    console.warn('[SimpleReader] Player not initialized');
    return;
  }

  state.visible = true;
  renderPlayer();
}

function hidePlayer(): void {
  state.visible = false;
  // Render with stopped state to hide (MiniPlayer returns null)
  renderPlayer();
}

function renderPlayer(): void {
  if (!playerRoot) return;

  playerRoot.render(
    createElement(MiniPlayer, {
      state: state.playbackState,
      currentPosition: state.currentPosition,
      totalWords: state.totalWords,
      onPlay: handlePlay,
      onPause: handlePause,
      onStop: handleStop,
    })
  );
}

// ============================================
// Button Handlers
// ============================================

function handlePlay(): void {
  console.log('[SimpleReader] Play button clicked');
  sendMessageToBackground(Messages.playbackPlay());
}

function handlePause(): void {
  console.log('[SimpleReader] Pause button clicked');
  sendMessageToBackground(Messages.playbackPause());
}

function handleStop(): void {
  console.log('[SimpleReader] Stop button clicked');
  sendMessageToBackground(Messages.playbackStop());
}

// ============================================
// Export state getter for debugging
// ============================================

export function getPlayerState(): Readonly<PlayerState> {
  return { ...state };
}
