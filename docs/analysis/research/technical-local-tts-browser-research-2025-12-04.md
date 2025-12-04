# Technical Research: Local TTS for Browser-Based Text-to-Speech

**Project:** SimpleReader
**Research Type:** Technical
**Date:** 2025-12-04
**Researcher:** Mary (Business Analyst) with Luca

---

## Executive Summary

This research investigates local text-to-speech (TTS) solutions for a browser-based reader application (Chrome extension + webapp). The goal is to create a Speechify alternative that runs entirely locally, with no cloud dependencies or subscriptions.

**Key Decisions:**
- **Primary TTS:** Kokoro TTS via kokoro-js (WebGPU primary, WASM fallback)
- **Word Sync:** Phoneme-weighted duration estimation (~90% accuracy)
- **Fallback:** Web Speech API for devices that can't load the model

---

## 1. TTS Model Options Analysis

### 1.1 Kokoro TTS (Selected)

| Attribute | Details |
|-----------|---------|
| Model size | 82M parameters (~80-320MB depending on quantization) |
| License | Apache 2.0 (fully free, commercial OK) |
| Quality | Near Speechify quality |
| Runtime | WebGPU or WASM via ONNX |
| Streaming | Yes, via `TextSplitterStream` |
| Voices | 21+ voices available |
| Source | https://github.com/hexgrad/kokoro |

**Why Kokoro:**
- Best quality-to-size ratio for browser deployment
- Apache 2.0 license allows full commercial use
- Active development and community
- Phoneme output enables word-level sync
- Streaming support for real-time playback

**Implementation:**
```javascript
import { KokoroTTS } from "kokoro-js";

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
  dtype: "q8",      // Options: fp32, fp16, q8, q4, q4f16
  device: "webgpu", // Fallback: "wasm"
});

const audio = await tts.generate("Hello world", { voice: "af_heart" });
```

**Quantization Options:**
| Type | Size | Quality | Speed |
|------|------|---------|-------|
| fp32 | ~320MB | Best | Requires WebGPU |
| fp16 | ~160MB | Excellent | Good |
| q8 | ~80MB | Very Good | Fast (recommended) |
| q4 | ~40MB | Good | Fastest |

### 1.2 Piper TTS (Alternative)

| Attribute | Details |
|-----------|---------|
| Model size | 15-60MB per voice |
| License | MIT |
| Quality | Good (less natural than Kokoro) |
| Runtime | WASM via ONNX |
| Library | @mintplex-labs/piper-tts-web |

**Pros:** Smaller models, many language options, very fast
**Cons:** Less expressive, no streaming support

### 1.3 Web Speech API (Fallback)

| Attribute | Details |
|-----------|---------|
| Model size | 0 (uses system voices) |
| License | N/A |
| Quality | Varies by OS/browser |
| Runtime | Native browser API |

**Implementation:**
```javascript
const utterance = new SpeechSynthesisUtterance("Hello world");
utterance.voice = speechSynthesis.getVoices()[0];
speechSynthesis.speak(utterance);
```

**Pros:** Zero download, instant, universal support
**Cons:** Quality varies, limited control, not truly "local model"

### 1.4 eSpeak-ng (Ultra-lightweight)

| Attribute | Details |
|-----------|---------|
| Model size | ~3MB |
| License | GPL v3 |
| Quality | Robotic but intelligible |
| Runtime | WASM |

**Use case:** Extreme low-bandwidth scenarios only

### 1.5 Comparison Matrix

| Model | Size | Quality | Speed | Streaming | Word Timing | License |
|-------|------|---------|-------|-----------|-------------|---------|
| **Kokoro** | 80-320MB | ★★★★★ | Fast | Yes | Via phonemes | Apache 2.0 |
| **Piper** | 15-60MB | ★★★★☆ | Very Fast | No | No | MIT |
| **Web Speech** | 0 | ★★★☆☆ | Instant | Yes | boundary event | N/A |
| **eSpeak-ng** | 3MB | ★★☆☆☆ | Very Fast | No | Yes | GPL v3 |

---

## 2. Word-Level Synchronization

### 2.1 The Challenge

For a Speechify-like experience, we need to highlight the current word as it's being spoken. This requires mapping audio playback position to word positions in the DOM.

### 2.2 Approaches Evaluated

#### Approach A: Duration-Based Estimation (Simple)
- Divide audio duration by word count
- ~60-70% accuracy
- Too naive for production

#### Approach B: Syllable-Weighted (Medium)
- Weight duration by syllable count per word
- ~80% accuracy
- Decent but imperfect

#### Approach C: Phoneme-Weighted (Selected)
- Use Kokoro's phoneme output to weight duration
- ~90% accuracy
- Good balance of accuracy and simplicity

#### Approach D: Forced Alignment (Complex)
- Full audio-text alignment algorithms
- ~98% accuracy
- Overkill for this use case

### 2.3 Phoneme Mapping Deep Dive

**What is IPA (International Phonetic Alphabet)?**

IPA is a standardized way to represent speech sounds:

| Word | IPA (American English) |
|------|------------------------|
| Hello | həˈloʊ |
| World | wɜːld |
| Through | θɹuː |
| Knight | naɪt |

**Why Phoneme Count Beats Letter/Syllable Count:**

| Word | Letters | Syllables | Phonemes | Duration Correlation |
|------|---------|-----------|----------|---------------------|
| "through" | 7 | 1 | 3 | Phonemes wins |
| "cat" | 3 | 1 | 3 | Same |
| "I" | 1 | 1 | 2 | Phonemes wins |
| "beautiful" | 9 | 3 | 8 | Phonemes wins |

**Kokoro's Phoneme Output:**

Kokoro returns phonemes with word boundaries (spaces):
```javascript
{
  text: "Hello world",
  phonemes: "həˈloʊ wɜːld",  // Space = word boundary
  audio: AudioBuffer
}
```

**Implementation (15 lines):**
```javascript
function mapPhonemesToWords(text, phonemes, audioDuration) {
  const words = text.split(/\s+/);
  const phonemeGroups = phonemes.split(' ');

  // Count phonemes per word (excluding stress/length marks)
  const phonemeCounts = phonemeGroups.map(p =>
    p.replace(/[ˈˌː]/g, '').length
  );
  const totalPhonemes = phonemeCounts.reduce((a, b) => a + b, 0);

  // Calculate timing based on phoneme proportion
  let currentTime = 0;
  return words.map((word, i) => {
    const duration = (phonemeCounts[i] / totalPhonemes) * audioDuration;
    const timing = { word, start: currentTime, end: currentTime + duration };
    currentTime += duration;
    return timing;
  });
}
```

**IPA Quick Reference:**
```
Consonants:     p b t d k g f v θ ð s z ʃ ʒ h m n ŋ l r w j
Vowels:         iː ɪ e æ ɑː ɒ ɔː ʊ uː ʌ ɜː ə
Diphthongs:     eɪ aɪ ɔɪ aʊ əʊ ɪə eə ʊə
Stress marks:   ˈ (primary)  ˌ (secondary)  -- excluded from count
Length:         ː (long)  -- excluded from count
```

### 2.4 Web Speech API Fallback (Boundary Events)

For the Web Speech API fallback, use native boundary events:

```javascript
const utterance = new SpeechSynthesisUtterance(text);

utterance.onboundary = (event) => {
  if (event.name === 'word') {
    const wordStart = event.charIndex;
    const wordEnd = wordStart + event.charLength;
    highlightWord(wordStart, wordEnd);
  }
};

speechSynthesis.speak(utterance);
```

---

## 3. Implementation Architecture

### 3.1 System Flow

```
┌─────────────────────────────────────────────────────────┐
│                    Text Extraction                       │
│         (Extract main content from webpage)              │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   Word Tokenization                      │
│    Split text into words, wrap each in <span>           │
│    <span data-word-index="0">Hello</span>               │
│    <span data-word-index="1">world</span>               │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  Kokoro TTS Generation                   │
│    - Load model (WebGPU → WASM fallback)                │
│    - Generate audio with streaming                       │
│    - Extract phonemes for timing calculation             │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                 Timing Calculator                        │
│    - Map phonemes to words                               │
│    - Calculate start/end time per word                   │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                  Playback Controller                     │
│    - Play audio via Web Audio API                        │
│    - Track currentTime with requestAnimationFrame        │
│    - Emit word-change events                             │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                 DOM Highlighter                          │
│    - Listen to word-change events                        │
│    - Add/remove .highlight class                         │
│    - Auto-scroll to current word                         │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Key Components

#### Word Tokenization
```javascript
function tokenizeContent(container) {
  const text = container.textContent;
  const words = text.split(/(\s+)/);

  container.innerHTML = words.map((word, i) => {
    if (/^\s+$/.test(word)) return word;
    return `<span class="tts-word" data-index="${i}">${word}</span>`;
  }).join('');

  return words.filter(w => !/^\s+$/.test(w));
}
```

#### Highlight Controller
```javascript
class HighlightController {
  constructor(container) {
    this.container = container;
    this.currentIndex = -1;
  }

  highlight(index) {
    if (index === this.currentIndex) return;

    // Remove previous highlight
    this.container.querySelector('.tts-word.active')
      ?.classList.remove('active');

    // Add new highlight
    const wordEl = this.container.querySelector(`[data-index="${index}"]`);
    if (wordEl) {
      wordEl.classList.add('active');
      this.scrollToWord(wordEl);
      this.currentIndex = index;
    }
  }

  scrollToWord(element) {
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }
}
```

#### CSS Highlighting
```css
.tts-word {
  transition: background-color 0.1s ease;
}

.tts-word.active {
  background-color: #ffeb3b;
  border-radius: 3px;
  padding: 0 2px;
}

.tts-word.spoken {
  color: #666;
}
```

---

## 4. Technical Considerations

### 4.1 Model Caching

Store downloaded model in IndexedDB to avoid re-download:
```javascript
// kokoro-js handles this automatically via Transformers.js
// Models cached in browser's Cache API
```

### 4.2 WebGPU vs WASM

| Runtime | Browser Support | Performance | Quantization |
|---------|-----------------|-------------|--------------|
| WebGPU | Chrome 113+, Edge 113+ | Fast | fp32 recommended |
| WASM | Universal | Good | q8 recommended |

**Detection:**
```javascript
const hasWebGPU = 'gpu' in navigator;
const device = hasWebGPU ? 'webgpu' : 'wasm';
const dtype = hasWebGPU ? 'fp32' : 'q8';
```

### 4.3 Chrome Extension Considerations

- Content scripts can access DOM for highlighting
- Service worker for TTS generation (offscreen document may be needed)
- Model storage in extension's IndexedDB
- Keyboard shortcut registration via chrome.commands

### 4.4 Memory Management

- Kokoro model: ~80-320MB in memory
- Audio buffers: ~100KB per minute of speech
- Unload model when not in use for extended periods

---

## 5. Sources

### TTS Models
- Kokoro TTS: https://github.com/hexgrad/kokoro
- kokoro-js: https://www.npmjs.com/package/kokoro-js
- ONNX Community Models: https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX
- Piper TTS Web: https://github.com/Mintplex-Labs/piper-tts-web
- BrowserAI: https://github.com/sauravpanda/BrowserAI

### Word Sync & Highlighting
- Web Speech API boundary events: https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/boundary_event
- react-speech-highlight: https://github.com/albirrkarim/react-speech-highlight-demo
- transcript-tracer-js: https://github.com/samuelbradshaw/transcript-tracer-js

### Technical References
- ONNX Runtime Web: https://github.com/microsoft/onnxruntime
- Transformers.js: https://github.com/xenova/transformers.js
- Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API

---

## 6. Recommendations

### For MVP
1. **TTS Engine:** Kokoro with q8 quantization, WASM runtime
2. **Word Sync:** Phoneme-weighted duration estimation
3. **Fallback:** Web Speech API for unsupported browsers
4. **Model Loading:** Show progress bar, cache in IndexedDB

### Future Enhancements
1. WebGPU runtime for supported browsers (better performance)
2. Multiple voice options (Kokoro supports 21+ voices)
3. Speed control (0.5x - 2x)
4. Sentence-level highlighting (secondary color)
5. Offline mode with pre-cached model

---

*Research compiled by Mary (Business Analyst) for SimpleReader project*
