# Technical Research: Architecture Patterns for SimpleReader

**Project:** SimpleReader
**Research Type:** Technical (Architecture & Design Patterns)
**Date:** 2025-12-04
**Researcher:** Mary (Business Analyst) with Luca

---

## Executive Summary

This research investigates optimal architecture patterns for a browser-based TTS reader (Chrome extension + webapp) using local Kokoro TTS. The goal: build a Speechify alternative that's fast, offline-capable, and maintainable.

**Key Architectural Decisions:**

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| **Framework** | WXT (Vite-based) | Best DX, hot reload, TypeScript, multi-browser |
| **TTS Runtime** | Offscreen Document | WebGPU/WASM work there, not in service workers |
| **State Management** | Zustand + chrome.storage | Simple, syncs across contexts |
| **Model Storage** | IndexedDB (via idb-keyval) | 80MB+ model caching |
| **Word Highlighting** | CSS class toggle + RAF | Performant, simple |
| **UI Pattern** | Floating mini-player + sidebar | Proven UX from Speechify |

---

## 1. Chrome Extension Architecture (MV3)

### 1.1 The MV3 Reality

Manifest V3 fundamentally changes extension architecture:

| MV2 | MV3 |
|-----|-----|
| Persistent background page | Ephemeral service worker |
| Full DOM access in background | No DOM in service worker |
| Any runtime (WebGPU, WASM) | Limited runtime in SW |
| Relaxed CSP | Strict CSP |

**Critical Constraint:** Service workers cannot run WebGPU or complex WASM. This is a hard blocker for running Kokoro directly in the background.

### 1.2 Recommended Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CONTENT SCRIPT                              │
│  • DOM manipulation (word highlighting)                             │
│  • Text extraction from webpage                                     │
│  • Playback UI overlay                                              │
│  • Receives audio chunks + timing data                              │
└─────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ chrome.runtime.sendMessage
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      SERVICE WORKER (Background)                    │
│  • Message router between contexts                                  │
│  • chrome.storage management                                        │
│  • Extension lifecycle (install, update)                            │
│  • Keyboard shortcut handling (chrome.commands)                     │
│  • DOES NOT run TTS model                                           │
└─────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ chrome.runtime.sendMessage
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      OFFSCREEN DOCUMENT                             │
│  • Kokoro TTS model loading (WebGPU/WASM)                          │
│  • Audio generation and streaming                                   │
│  • Phoneme extraction for word timing                               │
│  • Web Audio API playback                                           │
│  • Model caching in IndexedDB                                       │
└─────────────────────────────────────────────────────────────────────┘
                              ▲
                              │ Shared state
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         POPUP / OPTIONS                             │
│  • Settings UI (voice selection, speed)                             │
│  • Model download progress                                          │
│  • Voice preview                                                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.3 Why Offscreen Document?

Chrome's Offscreen API was designed exactly for this use case:

```javascript
// background.js - Create offscreen document for TTS
async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL('offscreen.html')]
  });

  if (existingContexts.length > 0) return;

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK', 'WORKERS'],  // Official reasons
    justification: 'TTS model inference and audio playback'
  });
}
```

**Offscreen Document Capabilities:**
- Full DOM access
- WebGPU and WASM support
- Web Audio API
- IndexedDB access
- Web Workers (for parallel processing)

**Limitations:**
- Cannot interact with web content directly
- Must communicate via message passing
- Only one offscreen document per reason

### 1.4 Message Passing Pattern

Use a typed message system for communication:

```typescript
// types/messages.ts
type MessageType =
  | { type: 'TTS_GENERATE'; text: string; voice: string }
  | { type: 'TTS_AUDIO_CHUNK'; chunk: ArrayBuffer; timing: WordTiming[] }
  | { type: 'TTS_COMPLETE' }
  | { type: 'PLAYBACK_CONTROL'; action: 'play' | 'pause' | 'stop' }
  | { type: 'HIGHLIGHT_WORD'; index: number };

// Typed message sender
async function sendToOffscreen<T extends MessageType>(message: T) {
  return chrome.runtime.sendMessage(message);
}

// Typed message handler
chrome.runtime.onMessage.addListener((message: MessageType, sender, sendResponse) => {
  switch (message.type) {
    case 'TTS_GENERATE':
      handleTTSGeneration(message.text, message.voice);
      break;
    // ...
  }
});
```

### 1.5 Service Worker Persistence

Service workers are ephemeral - they can be terminated at any time. Handle this:

```javascript
// Keep-alive for active TTS sessions (use sparingly)
let keepAliveInterval;

function startKeepAlive() {
  keepAliveInterval = setInterval(() => {
    chrome.storage.local.set({ heartbeat: Date.now() });
  }, 20000); // Every 20 seconds
}

function stopKeepAlive() {
  clearInterval(keepAliveInterval);
}

// Better: Design for statelessness
// Store all state in chrome.storage, reconstruct on wake
```

---

## 2. Development Framework: WXT

### 2.1 Why WXT Over Vanilla Vite

| Feature | Vanilla Vite | CRXJS | WXT |
|---------|--------------|-------|-----|
| Hot reload | Manual | Yes | Yes |
| TypeScript | Manual | Yes | Yes |
| Multi-browser | Manual | Chrome only | Chrome, Firefox, Safari |
| Manifest generation | Manual | Partial | Full |
| Entrypoint discovery | Manual | Yes | Yes |
| Built-in utilities | None | Some | Comprehensive |
| Maintenance | Self | Inactive | Active |

**Recommendation: WXT** - It's the most actively maintained and feature-complete option.

### 2.2 WXT Project Structure for SimpleReader

```
📂 simplereader/
   📂 src/
      📂 entrypoints/
         📂 background/           # Service worker
            📄 index.ts
         📂 content/              # Content script
            📄 index.ts
            📄 highlighter.ts
            📄 overlay.tsx        # Floating player UI
         📂 offscreen/            # TTS engine
            📄 index.html
            📄 index.ts
            📄 tts-engine.ts
            📄 audio-player.ts
         📂 popup/                # Extension popup
            📄 index.html
            📄 App.tsx
            📄 main.tsx
         📂 options/              # Settings page
            📄 index.html
            📄 App.tsx
            📄 main.tsx
      📂 components/              # Shared UI components
         📄 VoiceSelector.tsx
         📄 SpeedSlider.tsx
         📄 ProgressBar.tsx
      📂 lib/                     # Shared logic
         📄 kokoro-wrapper.ts     # TTS abstraction
         📄 word-timing.ts        # Phoneme → word mapping
         📄 storage.ts            # State persistence
         📄 messages.ts           # Typed messaging
      📂 assets/
         📄 styles.css
   📄 wxt.config.ts
   📄 manifest.json               # Base manifest (WXT extends)
```

### 2.3 WXT Configuration

```typescript
// wxt.config.ts
import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifest: {
    name: 'SimpleReader',
    description: 'Local TTS reader - no subscriptions, no cloud',
    permissions: [
      'activeTab',
      'storage',
      'offscreen',
    ],
    commands: {
      'toggle-reader': {
        suggested_key: { default: 'Alt+Shift+R' },
        description: 'Start/stop reading'
      }
    }
  },
  // Target multiple browsers
  browser: process.env.BROWSER || 'chrome',
});
```

---

## 3. TTS Engine Architecture

### 3.1 Model Loading Strategy

The Kokoro model (80MB q8) needs careful loading:

```typescript
// offscreen/tts-engine.ts
import { KokoroTTS } from 'kokoro-js';

class TTSEngine {
  private tts: KokoroTTS | null = null;
  private loadingPromise: Promise<void> | null = null;

  async ensureLoaded(onProgress?: (p: number) => void): Promise<void> {
    if (this.tts) return;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = this.loadModel(onProgress);
    return this.loadingPromise;
  }

  private async loadModel(onProgress?: (p: number) => void): Promise<void> {
    // Detect best runtime
    const hasWebGPU = 'gpu' in navigator && await navigator.gpu?.requestAdapter();
    const device = hasWebGPU ? 'webgpu' : 'wasm';
    const dtype = hasWebGPU ? 'fp32' : 'q8';

    this.tts = await KokoroTTS.from_pretrained(
      'onnx-community/Kokoro-82M-v1.0-ONNX',
      {
        dtype,
        device,
        progress_callback: onProgress
          ? (p) => onProgress(p.progress)
          : undefined
      }
    );
  }

  async generate(text: string, voice = 'af_heart'): Promise<TTSResult> {
    await this.ensureLoaded();
    const result = await this.tts!.generate(text, { voice });
    return {
      audio: result.audio,
      phonemes: result.phonemes,
      duration: result.audio.duration
    };
  }
}

// Singleton for the offscreen document
export const ttsEngine = new TTSEngine();
```

### 3.2 Streaming Audio Pattern

For long texts, generate and play in chunks:

```typescript
// offscreen/audio-player.ts
class StreamingAudioPlayer {
  private audioContext: AudioContext;
  private scheduledTime = 0;
  private isPlaying = false;

  constructor() {
    this.audioContext = new AudioContext();
  }

  async playChunk(audioBuffer: AudioBuffer, onTimeUpdate: (t: number) => void) {
    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    // Schedule at the end of previous audio
    const startTime = Math.max(this.audioContext.currentTime, this.scheduledTime);
    source.start(startTime);
    this.scheduledTime = startTime + audioBuffer.duration;

    // Track playback position
    const updateInterval = setInterval(() => {
      if (this.audioContext.currentTime >= this.scheduledTime) {
        clearInterval(updateInterval);
      }
      onTimeUpdate(this.audioContext.currentTime - startTime);
    }, 50);

    return new Promise<void>(resolve => {
      source.onended = () => {
        clearInterval(updateInterval);
        resolve();
      };
    });
  }

  pause() {
    this.audioContext.suspend();
  }

  resume() {
    this.audioContext.resume();
  }
}
```

### 3.3 Text Chunking for Streaming

Split text into sentences for progressive generation:

```typescript
// lib/text-splitter.ts
export function splitIntoChunks(text: string, maxChars = 500): string[] {
  // Split on sentence boundaries
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > maxChars && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = '';
    }
    currentChunk += sentence;
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
```

---

## 4. State Management

### 4.1 State Architecture

Three layers of state:

| Layer | Storage | Purpose | Persistence |
|-------|---------|---------|-------------|
| **Session State** | In-memory | Current playback position, loaded model | None |
| **User Preferences** | chrome.storage.sync | Voice, speed, theme | Cross-device |
| **Local Cache** | IndexedDB | Model files, reading progress | Device-local |

### 4.2 Zustand for Cross-Context State

Use Zustand with chrome.storage persistence:

```typescript
// lib/storage.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ReaderState {
  // Playback
  isPlaying: boolean;
  currentWordIndex: number;
  speed: number;

  // Preferences
  voice: string;
  highlightColor: string;

  // Actions
  setPlaying: (playing: boolean) => void;
  setWordIndex: (index: number) => void;
  setSpeed: (speed: number) => void;
  setVoice: (voice: string) => void;
}

// Custom storage adapter for chrome.storage
const chromeStorageAdapter = {
  getItem: async (name: string) => {
    const result = await chrome.storage.sync.get(name);
    return result[name] ?? null;
  },
  setItem: async (name: string, value: string) => {
    await chrome.storage.sync.set({ [name]: value });
  },
  removeItem: async (name: string) => {
    await chrome.storage.sync.remove(name);
  },
};

export const useReaderStore = create<ReaderState>()(
  persist(
    (set) => ({
      isPlaying: false,
      currentWordIndex: 0,
      speed: 1.0,
      voice: 'af_heart',
      highlightColor: '#ffeb3b',

      setPlaying: (playing) => set({ isPlaying: playing }),
      setWordIndex: (index) => set({ currentWordIndex: index }),
      setSpeed: (speed) => set({ speed }),
      setVoice: (voice) => set({ voice }),
    }),
    {
      name: 'reader-state',
      storage: chromeStorageAdapter,
      partialize: (state) => ({
        // Only persist preferences, not playback state
        speed: state.speed,
        voice: state.voice,
        highlightColor: state.highlightColor,
      }),
    }
  )
);
```

### 4.3 IndexedDB for Model Caching

Kokoro-js handles model caching via Transformers.js, but for additional data:

```typescript
// lib/cache.ts
import { get, set, del } from 'idb-keyval';

export const cache = {
  // Reading progress per URL
  async getProgress(url: string): Promise<number> {
    return (await get(`progress:${url}`)) ?? 0;
  },

  async setProgress(url: string, wordIndex: number): Promise<void> {
    await set(`progress:${url}`, wordIndex);
  },

  // Voice customizations
  async getVoiceSettings(voice: string): Promise<VoiceSettings | null> {
    return get(`voice:${voice}`);
  },

  async setVoiceSettings(voice: string, settings: VoiceSettings): Promise<void> {
    await set(`voice:${voice}`, settings);
  },
};
```

---

## 5. Word Highlighting UI

### 5.1 DOM Tokenization Strategy

Wrap each word in a span for highlighting:

```typescript
// content/highlighter.ts
export class WordHighlighter {
  private container: HTMLElement;
  private words: HTMLSpanElement[] = [];
  private currentIndex = -1;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  tokenize(): string[] {
    const text = this.container.textContent || '';
    const words = text.split(/(\s+)/);

    // Rebuild container with wrapped words
    this.container.innerHTML = '';
    const wordTexts: string[] = [];

    words.forEach((word, i) => {
      if (/^\s+$/.test(word)) {
        this.container.appendChild(document.createTextNode(word));
      } else {
        const span = document.createElement('span');
        span.className = 'sr-word';
        span.dataset.index = String(this.words.length);
        span.textContent = word;
        this.container.appendChild(span);
        this.words.push(span);
        wordTexts.push(word);
      }
    });

    return wordTexts;
  }

  highlight(index: number): void {
    if (index === this.currentIndex) return;

    // Remove previous highlight
    if (this.currentIndex >= 0 && this.words[this.currentIndex]) {
      this.words[this.currentIndex].classList.remove('sr-active');
      this.words[this.currentIndex].classList.add('sr-spoken');
    }

    // Add new highlight
    if (index >= 0 && this.words[index]) {
      this.words[index].classList.add('sr-active');
      this.words[index].scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }

    this.currentIndex = index;
  }

  reset(): void {
    this.words.forEach(w => {
      w.classList.remove('sr-active', 'sr-spoken');
    });
    this.currentIndex = -1;
  }
}
```

### 5.2 Highlighting Styles

```css
/* content/styles.css */
.sr-word {
  transition: background-color 0.1s ease;
  border-radius: 2px;
  padding: 0 1px;
}

.sr-active {
  background-color: var(--sr-highlight, #ffeb3b);
  color: #000;
}

.sr-spoken {
  color: var(--sr-spoken, #666);
}

/* High-contrast mode */
@media (prefers-contrast: high) {
  .sr-active {
    background-color: #000;
    color: #fff;
    outline: 2px solid #fff;
  }
}
```

### 5.3 Playback Synchronization

Use requestAnimationFrame for smooth highlight updates:

```typescript
// content/playback-sync.ts
export class PlaybackSync {
  private wordTimings: WordTiming[] = [];
  private highlighter: WordHighlighter;
  private currentTime = 0;
  private rafId: number | null = null;

  constructor(highlighter: WordHighlighter) {
    this.highlighter = highlighter;
  }

  setTimings(timings: WordTiming[]): void {
    this.wordTimings = timings;
  }

  start(getCurrentTime: () => number): void {
    const tick = () => {
      this.currentTime = getCurrentTime();

      // Find current word based on time
      const wordIndex = this.wordTimings.findIndex(
        (w, i) => {
          const next = this.wordTimings[i + 1];
          return this.currentTime >= w.start &&
                 (!next || this.currentTime < next.start);
        }
      );

      if (wordIndex >= 0) {
        this.highlighter.highlight(wordIndex);
      }

      this.rafId = requestAnimationFrame(tick);
    };

    tick();
  }

  stop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}
```

---

## 6. Floating Player UI

### 6.1 UI Pattern Analysis (From Speechify)

Speechify uses a floating mini-player with:
- Compact bar with play/pause, speed, close
- Expands to show more controls
- Draggable position
- Stays on top of content

### 6.2 Recommended UI Components

```tsx
// content/overlay/MiniPlayer.tsx
import { useState, useRef, useEffect } from 'react';
import { useReaderStore } from '@/lib/storage';

export function MiniPlayer() {
  const { isPlaying, speed, setPlaying, setSpeed } = useReaderStore();
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState({ x: 20, y: 20 });
  const dragRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={dragRef}
      className="sr-miniplayer"
      style={{
        position: 'fixed',
        right: position.x,
        bottom: position.y,
        zIndex: 999999
      }}
    >
      <div className="sr-controls">
        <button
          onClick={() => setPlaying(!isPlaying)}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </button>

        <SpeedSelector value={speed} onChange={setSpeed} />

        <button onClick={() => setExpanded(!expanded)}>
          <ExpandIcon />
        </button>

        <button onClick={handleClose} aria-label="Close">
          <CloseIcon />
        </button>
      </div>

      {expanded && (
        <div className="sr-expanded">
          <VoiceSelector />
          <ProgressBar />
          <SeekControls />
        </div>
      )}
    </div>
  );
}
```

### 6.3 Shadow DOM Isolation

Inject UI in Shadow DOM to avoid style conflicts:

```typescript
// content/inject-ui.ts
export function injectPlayerUI() {
  const host = document.createElement('div');
  host.id = 'simplereader-root';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'closed' });

  // Inject styles
  const style = document.createElement('style');
  style.textContent = PLAYER_STYLES; // Your CSS
  shadow.appendChild(style);

  // Inject React root
  const root = document.createElement('div');
  shadow.appendChild(root);

  createRoot(root).render(<MiniPlayer />);
}
```

---

## 7. Fallback Strategy

### 7.1 Web Speech API Fallback

For devices that can't run Kokoro:

```typescript
// lib/fallback-tts.ts
export class WebSpeechFallback {
  private utterance: SpeechSynthesisUtterance | null = null;
  private wordBoundaryCallback: ((index: number) => void) | null = null;

  canUse(): boolean {
    return 'speechSynthesis' in window;
  }

  speak(text: string, options: { voice?: string; rate?: number }): void {
    this.utterance = new SpeechSynthesisUtterance(text);

    // Map Kokoro voice to system voice (best effort)
    const voices = speechSynthesis.getVoices();
    const preferredVoice = voices.find(v =>
      v.name.toLowerCase().includes('english') &&
      v.name.toLowerCase().includes(options.voice?.includes('female') ? 'female' : 'male')
    );
    if (preferredVoice) {
      this.utterance.voice = preferredVoice;
    }

    this.utterance.rate = options.rate ?? 1.0;

    // Word boundary events for highlighting
    let charIndex = 0;
    let wordIndex = 0;
    this.utterance.onboundary = (event) => {
      if (event.name === 'word') {
        this.wordBoundaryCallback?.(wordIndex++);
      }
    };

    speechSynthesis.speak(this.utterance);
  }

  onWordBoundary(callback: (index: number) => void): void {
    this.wordBoundaryCallback = callback;
  }

  pause(): void {
    speechSynthesis.pause();
  }

  resume(): void {
    speechSynthesis.resume();
  }

  stop(): void {
    speechSynthesis.cancel();
  }
}
```

### 7.2 Capability Detection

```typescript
// lib/tts-factory.ts
export async function createTTSEngine(): Promise<TTSEngine | WebSpeechFallback> {
  // Check if we can run Kokoro
  const hasWebGPU = 'gpu' in navigator && await navigator.gpu?.requestAdapter();
  const hasWASM = typeof WebAssembly !== 'undefined';

  // Check available memory (Kokoro needs ~200MB)
  const hasEnoughMemory = navigator.deviceMemory
    ? navigator.deviceMemory >= 2
    : true; // Assume OK if can't detect

  if ((hasWebGPU || hasWASM) && hasEnoughMemory) {
    return new TTSEngine();
  }

  // Fall back to Web Speech API
  console.warn('Kokoro TTS not available, using Web Speech API fallback');
  return new WebSpeechFallback();
}
```

---

## 8. Performance Considerations

### 8.1 Model Loading UX

```typescript
// Show progress during model load
async function loadWithProgress() {
  const progressBar = document.getElementById('load-progress');

  await ttsEngine.ensureLoaded((progress) => {
    progressBar.style.width = `${progress * 100}%`;
    progressBar.textContent = `Loading voice model: ${Math.round(progress * 100)}%`;
  });

  progressBar.textContent = 'Ready!';
}
```

### 8.2 Memory Management

```typescript
// Unload model when not used for extended time
let unloadTimeout: number;

function scheduleUnload() {
  clearTimeout(unloadTimeout);
  unloadTimeout = window.setTimeout(() => {
    ttsEngine.unload();
    console.log('TTS model unloaded to free memory');
  }, 10 * 60 * 1000); // 10 minutes
}

function cancelUnload() {
  clearTimeout(unloadTimeout);
}
```

### 8.3 Content Script Performance

```typescript
// Debounce highlight updates
import { throttle } from 'lodash-es';

const throttledHighlight = throttle((index: number) => {
  highlighter.highlight(index);
}, 50);

// Use passive event listeners
document.addEventListener('scroll', handleScroll, { passive: true });
```

---

## 9. Sources

### Chrome Extension Architecture
- Chrome Offscreen API: https://developer.chrome.com/docs/extensions/reference/api/offscreen
- MV3 Service Worker Migration: https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers
- Crann State Management: https://github.com/moclei/crann
- XTranslate Architecture: https://github.com/ixrock/XTranslate

### TTS & Browser ML
- Kokoro-js: https://github.com/hexgrad/kokoro
- Transformers.js WebGPU: https://huggingface.co/docs/transformers.js/guides/webgpu
- ONNX Runtime Web: https://github.com/microsoft/onnxruntime
- Service Worker WebGPU Issue: https://github.com/xenova/transformers.js/issues/787

### WXT Framework
- WXT Documentation: https://wxt.dev
- WXT Entrypoints: https://wxt.dev/guide/essentials/entrypoints
- WXT Frontend Frameworks: https://wxt.dev/guide/essentials/frontend-frameworks

### UI/UX Patterns
- react-speech-highlight: https://github.com/albirrkarim/react-speech-highlight-demo
- Talkify: https://github.com/Hagsten/Talkify
- Readium TTS: https://github.com/readium/kotlin-toolkit

### State Management
- Zustand: https://github.com/pmndrs/zustand
- idb-keyval: https://github.com/jakearchibald/idb-keyval
- IndexedDB Best Practices: https://web.dev/learn/pwa/offline-data

---

## 10. Recommendations Summary

### For MVP

1. **Framework:** Use WXT for rapid development with hot reload
2. **Architecture:** Service Worker → Offscreen Document → Content Script
3. **TTS Runtime:** Offscreen document with WASM (q8) for broad compatibility
4. **State:** Zustand + chrome.storage.sync for preferences
5. **Highlighting:** Simple CSS class toggle with RAF sync
6. **UI:** Shadow DOM floating player, minimal design
7. **Fallback:** Web Speech API for unsupported devices

### Post-MVP Enhancements

1. WebGPU runtime detection for faster inference
2. Sentence-level highlighting (secondary color)
3. Reading progress sync across devices
4. Custom voice fine-tuning
5. Keyboard shortcuts customization
6. Export to audio file

---

*Research compiled by Mary (Business Analyst) for SimpleReader project*
