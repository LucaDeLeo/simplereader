// Pattern: Import from lib/ only
import {
  addMessageListener,
  isTTSMessage,
  isPlaybackMessage,
  sendMessageToTab,
  Messages,
  type TTSMessage,
  type PlaybackState,
  type MessageResponse,
  type WordTiming,
} from '@/lib/messages';
import { initializeDefaults, getSyncValue, STORAGE_KEYS } from '@/lib/storage';
import { ensureOffscreenDocument } from '@/lib/offscreen-manager';

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
  accumulatedAudioDurationMs: number; // Track duration from all chunks
}

const playback: PlaybackController = {
  state: 'stopped',
  tabId: null,
  wordTimings: [],
  currentWordIndex: 0,
  audioStartTime: null,
  highlightTimer: null,
  accumulatedAudioDurationMs: 0,
};

// ============================================
// Badge Management
// ============================================

function updateBadge(state: PlaybackState): void {
  const badgeText: Record<PlaybackState, string> = {
    stopped: '',
    loading: '...',
    playing: '>',
    paused: '||',
  };

  const badgeColor: Record<PlaybackState, string> = {
    stopped: '#666666',
    loading: '#FFA500',
    playing: '#4CAF50',
    paused: '#2196F3',
  };

  chrome.action.setBadgeText({ text: badgeText[state] });
  chrome.action.setBadgeBackgroundColor({ color: badgeColor[state] });
}

// ============================================
// State Transitions
// ============================================

function setPlaybackState(newState: PlaybackState, position: number = 0): void {
  const oldState = playback.state;
  playback.state = newState;

  console.log(`[SimpleReader] Playback state: ${oldState} -> ${newState}`);
  updateBadge(newState);

  // Broadcast state change to all listeners
  const stateMessage = Messages.playbackStateChanged(newState, position);

  // Send to extension contexts (popup, etc.)
  chrome.runtime.sendMessage(stateMessage).catch(() => {
    // Ignore errors if no listeners
  });

  // Send to active tab content script
  if (playback.tabId) {
    sendMessageToTab(playback.tabId, stateMessage).catch(() => {
      // Ignore errors if tab closed
    });
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
  playback.audioStartTime = null;
  playback.accumulatedAudioDurationMs = 0;
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

    // 3. Get preferred voice from storage
    const voice = await getSyncValue(STORAGE_KEYS.preferredVoice) || 'af_bella';
    const speed = await getSyncValue(STORAGE_KEYS.preferredSpeed) || 1.0;

    // 4. Request TTS generation (streaming - will receive chunks via messages)
    console.log('[SimpleReader] Starting TTS generation...');
    chrome.runtime.sendMessage(Messages.ttsGenerate(text, voice, speed)).catch((error) => {
      console.error('[SimpleReader] TTS request failed:', error);
      stopPlayback();
    });

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

  // Pause audio in offscreen document
  chrome.runtime.sendMessage(Messages.playbackPause()).catch(() => {
    // Ignore if offscreen not ready
  });

  setPlaybackState('paused', playback.currentWordIndex);
}

function resumePlayback(): void {
  if (playback.state !== 'paused') return;

  // Resume audio in offscreen document
  chrome.runtime.sendMessage(Messages.playbackPlay(playback.currentWordIndex)).catch(() => {
    // Ignore if offscreen not ready
  });

  // Calculate audio position we're resuming from based on current word timing
  // This ensures highlight scheduling remains synchronized with resumed audio
  const resumePositionMs = playback.wordTimings[playback.currentWordIndex]?.startTime || 0;
  playback.audioStartTime = Date.now() - resumePositionMs;

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

  // Stop audio in offscreen document
  chrome.runtime.sendMessage(Messages.playbackStop()).catch(() => {
    // Ignore if offscreen not ready
  });

  // Reset highlighting in content script
  if (playback.tabId) {
    sendMessageToTab(playback.tabId, Messages.highlightReset()).catch(() => {
      // Ignore if tab closed
    });
  }

  // Reset state
  playback.wordTimings = [];
  playback.currentWordIndex = 0;
  playback.audioStartTime = null;
  playback.accumulatedAudioDurationMs = 0;
  playback.tabId = null;

  setPlaybackState('stopped');
}

// ============================================
// Highlight Scheduling
// ============================================

function scheduleNextHighlight(): void {
  if (playback.state !== 'playing' || !playback.tabId) return;

  if (playback.currentWordIndex >= playback.wordTimings.length) {
    // All words highlighted - wait for more or complete
    // Check again in 100ms in case more timings arrive
    playback.highlightTimer = setTimeout(() => {
      if (playback.currentWordIndex >= playback.wordTimings.length) {
        // Still no more words - playback is complete
        console.log('[SimpleReader] All words highlighted, playback complete');
        stopPlayback();
      } else {
        scheduleNextHighlight();
      }
    }, 100);
    return;
  }

  const currentTiming = playback.wordTimings[playback.currentWordIndex];
  const now = Date.now();
  const elapsed = playback.audioStartTime ? now - playback.audioStartTime : 0;

  // Time until this word should be highlighted (with 50ms lead for perceived sync)
  const delay = Math.max(0, currentTiming.startTime - elapsed - 50);

  playback.highlightTimer = setTimeout(() => {
    if (playback.state !== 'playing' || !playback.tabId) return;

    // Send highlight command to content script
    sendMessageToTab(playback.tabId, Messages.highlightWord(playback.currentWordIndex)).catch(() => {
      // Ignore if tab closed
    });

    // Scroll to keep word visible every 10 words
    if (playback.currentWordIndex % 10 === 0) {
      sendMessageToTab(playback.tabId, Messages.highlightScrollTo(playback.currentWordIndex)).catch(() => {
        // Ignore if tab closed
      });
    }

    playback.currentWordIndex++;
    scheduleNextHighlight();
  }, delay);
}

// ============================================
// TTS Message Handling (Streaming)
// ============================================

function handleTTSChunkReady(audioData: ArrayBuffer, wordTimings: WordTiming[]): void {
  // Accumulate word timings with adjusted indices
  const baseIndex = playback.wordTimings.length;
  const adjustedTimings = wordTimings.map((t, i) => ({
    ...t,
    index: baseIndex + i,
    // Offset times by accumulated duration from previous chunks
    startTime: t.startTime + playback.accumulatedAudioDurationMs,
    endTime: t.endTime + playback.accumulatedAudioDurationMs,
  }));
  playback.wordTimings.push(...adjustedTimings);

  // Track audio duration for timing offset
  const chunkDurationMs = (audioData.byteLength / 4) / 24000 * 1000; // Float32 = 4 bytes per sample
  playback.accumulatedAudioDurationMs += chunkDurationMs;

  console.log(`[SimpleReader] Received chunk: ${wordTimings.length} words, total: ${playback.wordTimings.length}`);

  // Start playback on first chunk
  if (playback.state === 'loading' && playback.wordTimings.length > 0) {
    playback.audioStartTime = Date.now();
    setPlaybackState('playing');
    scheduleNextHighlight();
  }
}

function handleTTSComplete(): void {
  console.log('[SimpleReader] TTS generation complete');
  // Playback continues until all words are highlighted
}

function handleTTSError(error: string): void {
  console.error('[SimpleReader] TTS error:', error);
  stopPlayback();
}

// ============================================
// Main Background Script
// ============================================

export default defineBackground(() => {
  console.log('[SimpleReader] Background service worker started');

  // Initialize defaults on first install
  chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
      console.log('[SimpleReader] First install - initializing defaults');
      await initializeDefaults();
    }
  });

  // Icon click handler - toggle playback
  chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;

    // Toggle playback based on current state
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
        console.log('[SimpleReader] Already loading, ignoring click');
        break;
    }
  });

  // Set up typed message listener
  addMessageListener((message, sender, sendResponse) => {
    console.log('[SimpleReader] Received message:', message.type);

    // Handle TTS messages from offscreen document (streaming)
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
          // Could update UI with progress
          sendResponse({ success: true });
          return false;

        case 'TTS_GENERATE':
          // Route TTS_GENERATE to offscreen document
          handleTTSGenerate(message, sendResponse);
          return true; // Async response
      }
    }

    // Handle playback messages from popup
    if (isPlaybackMessage(message)) {
      switch (message.type) {
        case 'PLAYBACK_PLAY':
          // Get current tab and start playback
          chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            const tabId = tabs[0]?.id;
            if (tabId) {
              if (playback.state === 'paused') {
                resumePlayback();
              } else {
                await startPlayback(tabId);
              }
            }
            sendResponse({ success: true });
          });
          return true; // Async response

        case 'PLAYBACK_PAUSE':
          pausePlayback();
          sendResponse({ success: true });
          return false;

        case 'PLAYBACK_STOP':
          stopPlayback();
          sendResponse({ success: true });
          return false;

        case 'PLAYBACK_STATE_CHANGED':
          // Informational - no action needed
          sendResponse({ success: true });
          return false;
      }
    }

    // Forward highlight messages from Web Speech to content script
    if (message.type === 'HIGHLIGHT_WORD' && playback.tabId) {
      sendMessageToTab(playback.tabId, message).catch(() => {});
      sendResponse({ success: true });
      return false;
    }

    sendResponse({ success: true });
    return false;
  });
});

/**
 * Route TTS_GENERATE to offscreen document.
 */
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
