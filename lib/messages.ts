// lib/messages.ts

// ============================================
// Supporting Types
// ============================================

export interface WordTiming {
  word: string;
  startTime: number;  // ms from audio start
  endTime: number;    // ms from audio start
  index: number;      // word position in text
}

export type PlaybackState = 'loading' | 'playing' | 'paused' | 'stopped';

// ============================================
// Message Type Definitions (Discriminated Union)
// ============================================

// TTS Engine Messages (Background <-> Offscreen)
export type TTSMessage =
  | { type: 'TTS_GENERATE'; text: string; voice: string; speed: number }
  | { type: 'TTS_PROGRESS'; progress: number }
  | { type: 'TTS_CHUNK_READY'; audioData: ArrayBuffer; wordTimings: WordTiming[] }
  | { type: 'TTS_COMPLETE' }
  | { type: 'TTS_ERROR'; error: string };

// Playback Control Messages (Content <-> Background)
export type PlaybackMessage =
  | { type: 'PLAYBACK_PLAY'; fromPosition?: number }
  | { type: 'PLAYBACK_PAUSE' }
  | { type: 'PLAYBACK_STOP' }
  | { type: 'PLAYBACK_STATE_CHANGED'; state: PlaybackState; position: number };

// Word Highlighting Messages (Background -> Content)
export type HighlightMessage =
  | { type: 'HIGHLIGHT_WORD'; wordIndex: number }
  | { type: 'HIGHLIGHT_RESET' }
  | { type: 'HIGHLIGHT_SCROLL_TO'; wordIndex: number };

// Content Extraction Messages (Content <-> Background)
export type ContentMessage =
  | { type: 'CONTENT_EXTRACT' }
  | { type: 'CONTENT_READY'; text: string; wordCount: number; title?: string }
  | { type: 'CONTENT_ERROR'; error: string };

// Settings Messages (Popup <-> Background)
export type SettingsMessage =
  | { type: 'SETTINGS_CHANGED'; key: string; value: unknown }
  | { type: 'SETTINGS_GET'; key: string }
  | { type: 'SETTINGS_VALUE'; key: string; value: unknown };

// Combined Message Type (all possible messages)
export type Message =
  | TTSMessage
  | PlaybackMessage
  | HighlightMessage
  | ContentMessage
  | SettingsMessage;

// ============================================
// Response Types
// ============================================

export interface MessageResponse<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================
// Type Guards
// ============================================

export function isTTSMessage(msg: Message): msg is TTSMessage {
  return msg.type.startsWith('TTS_');
}

export function isPlaybackMessage(msg: Message): msg is PlaybackMessage {
  return msg.type.startsWith('PLAYBACK_');
}

export function isHighlightMessage(msg: Message): msg is HighlightMessage {
  return msg.type.startsWith('HIGHLIGHT_');
}

export function isContentMessage(msg: Message): msg is ContentMessage {
  return msg.type.startsWith('CONTENT_');
}

export function isSettingsMessage(msg: Message): msg is SettingsMessage {
  return msg.type.startsWith('SETTINGS_');
}

// ============================================
// Message Sending Helpers
// ============================================

/**
 * Send a message to the background service worker.
 * Use from: content scripts, popup, options page
 */
export async function sendMessageToBackground<T = void>(
  message: Message
): Promise<MessageResponse<T>> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({
          success: false,
          error: chrome.runtime.lastError.message,
        });
      } else {
        resolve(response ?? { success: true });
      }
    });
  });
}

/**
 * Send a message to a specific tab's content script.
 * Use from: background service worker
 */
export async function sendMessageToTab<T = void>(
  tabId: number,
  message: Message
): Promise<MessageResponse<T>> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({
          success: false,
          error: chrome.runtime.lastError.message,
        });
      } else {
        resolve(response ?? { success: true });
      }
    });
  });
}

/**
 * Send a message to the offscreen document.
 * Use from: background service worker only
 *
 * Note: Offscreen documents receive messages via chrome.runtime.onMessage
 * just like other extension contexts. The target filtering happens
 * in the offscreen document's message handler.
 */
export async function sendMessageToOffscreen<T = void>(
  message: TTSMessage
): Promise<MessageResponse<T>> {
  // Offscreen documents receive runtime messages like other contexts
  // The offscreen handler filters by message type prefix
  return sendMessageToBackground<T>(message);
}

// ============================================
// Message Listener Helper
// ============================================

export type MessageHandler = (
  message: Message,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: MessageResponse) => void
) => boolean | void;

/**
 * Add a typed message listener.
 * Return true from handler to indicate async response (call sendResponse later).
 * Return false/undefined for sync response.
 */
export function addMessageListener(handler: MessageHandler): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Type guard: ensure message has a type property
    if (typeof message === 'object' && message !== null && 'type' in message) {
      return handler(message as Message, sender, sendResponse);
    }
    return false;
  });
}

// ============================================
// Message Creation Helpers (for type safety)
// ============================================

export const Messages = {
  // TTS
  ttsGenerate: (text: string, voice: string, speed: number): TTSMessage => ({
    type: 'TTS_GENERATE',
    text,
    voice,
    speed,
  }),
  ttsProgress: (progress: number): TTSMessage => ({
    type: 'TTS_PROGRESS',
    progress,
  }),
  ttsChunkReady: (audioData: ArrayBuffer, wordTimings: WordTiming[]): TTSMessage => ({
    type: 'TTS_CHUNK_READY',
    audioData,
    wordTimings,
  }),
  ttsComplete: (): TTSMessage => ({ type: 'TTS_COMPLETE' }),
  ttsError: (error: string): TTSMessage => ({ type: 'TTS_ERROR', error }),

  // Playback
  playbackPlay: (fromPosition?: number): PlaybackMessage => ({
    type: 'PLAYBACK_PLAY',
    ...(fromPosition !== undefined && { fromPosition }),
  }),
  playbackPause: (): PlaybackMessage => ({ type: 'PLAYBACK_PAUSE' }),
  playbackStop: (): PlaybackMessage => ({ type: 'PLAYBACK_STOP' }),
  playbackStateChanged: (state: PlaybackState, position: number): PlaybackMessage => ({
    type: 'PLAYBACK_STATE_CHANGED',
    state,
    position,
  }),

  // Highlight
  highlightWord: (wordIndex: number): HighlightMessage => ({
    type: 'HIGHLIGHT_WORD',
    wordIndex,
  }),
  highlightReset: (): HighlightMessage => ({ type: 'HIGHLIGHT_RESET' }),
  highlightScrollTo: (wordIndex: number): HighlightMessage => ({
    type: 'HIGHLIGHT_SCROLL_TO',
    wordIndex,
  }),

  // Content
  contentExtract: (): ContentMessage => ({ type: 'CONTENT_EXTRACT' }),
  contentReady: (text: string, wordCount: number, title?: string): ContentMessage => ({
    type: 'CONTENT_READY',
    text,
    wordCount,
    ...(title && { title }),
  }),
  contentError: (error: string): ContentMessage => ({ type: 'CONTENT_ERROR', error }),

  // Settings
  settingsChanged: (key: string, value: unknown): SettingsMessage => ({
    type: 'SETTINGS_CHANGED',
    key,
    value,
  }),
  settingsGet: (key: string): SettingsMessage => ({ type: 'SETTINGS_GET', key }),
  settingsValue: (key: string, value: unknown): SettingsMessage => ({
    type: 'SETTINGS_VALUE',
    key,
    value,
  }),
} as const;
