---
stepsCompleted: [1, 2, 3, 4, 5]
inputDocuments:
  - docs/analysis/research/technical-local-tts-browser-research-2025-12-04.md
  - docs/analysis/research/technical-architecture-patterns-research-2025-12-04.md
workflowType: 'product-brief'
lastStep: 5
project_name: 'simplereader'
user_name: 'Luca'
date: '2025-12-04'
---

# Product Brief: simplereader

**Date:** 2025-12-04
**Author:** Luca

---

## Executive Summary

SimpleReader is a browser-based text-to-speech tool that runs 100% locally. No subscriptions, no cloud, no copy-pasting - just highlight text or click play and listen with real-time word highlighting, right where you're reading.

Built on Kokoro TTS running entirely in the browser via WebGPU/WASM, SimpleReader eliminates the subscription model by eliminating the server. Your text never leaves your browser. It's free because it costs nothing to run.

---

## Core Vision

### Problem Statement

People want to listen to web content instead of reading it, but current TTS solutions force an unacceptable tradeoff: pay a subscription (Speechify, Natural Reader Premium) or deal with friction (copy-paste into separate apps, robotic system voices, no visual sync).

The result: most people just don't use TTS, even when listening would be better than reading.

### Problem Impact

- **Subscription fatigue**: Yet another $10-15/month for a feature that should be free
- **Context switching**: Pasting text into external apps breaks reading flow
- **Privacy concerns**: Cloud TTS means your reading content goes to someone's server
- **Accessibility gap**: People who would benefit most from TTS (dyslexia, visual fatigue, multitasking) are priced out or friction-ed out

### Why Existing Solutions Fall Short

| Solution | Problem |
|----------|---------|
| **Speechify** | $139/year subscription, cloud-dependent |
| **Natural Reader** | Freemium walls, limited voices without payment |
| **Browser extensions** | Use system voices (robotic), no word highlighting |
| **Copy-paste apps** | Forces you out of context, extra steps |

None offer: free + high-quality voices + in-place reading + word sync.

### Proposed Solution

SimpleReader: A Chrome extension that adds TTS to any webpage with one click.

- **In-place reading**: Stay on the page, see words highlighted as they're spoken
- **High-quality local TTS**: Kokoro model runs entirely in-browser (80MB, cached once)
- **Zero cost**: No servers = no subscriptions = free forever
- **Universal**: Works on articles, PDFs, emails, selected text - any text on any page

### Key Differentiators

1. **100% Local**: Kokoro TTS runs in your browser via WebGPU/WASM. Text never leaves your device.
2. **Free Forever**: No server infrastructure means no costs to pass on. This isn't freemium - it's just free.
3. **In-Place Experience**: Read AND listen on the same page with word-level highlighting. No context switching.
4. **Privacy by Default**: Your reading habits are yours. No analytics, no cloud, no tracking.
5. **Works Offline**: Once the model is cached, works without internet.

---

## Target Users

### Primary Users

**The Focus Reader (Primary Persona: Luca)**

A knowledge worker who consumes significant written content online - articles, documentation, essays. Uses TTS in three distinct modes:

| Mode | Context | Key Need |
|------|---------|----------|
| **Focus Mode** | At desk, actively reading | Dual-channel input (audio + visual highlighting) for better comprehension and focus |
| **Background Mode** | Away from screen (cooking, chores) | Audio via headphones, easy to start before walking away |
| **Ambient Mode** | Light multitasking (gaming, browsing) | Audio running in background, occasional glance at progress |

**Characteristics:**
- Technically savvy, values simplicity over feature bloat
- Privacy-conscious, prefers local over cloud
- Has tried existing TTS solutions, frustrated by subscriptions and friction
- Wants something that "just works" without configuration

**Success Moment:** Installs extension, navigates to an article, hits play, and it reads intelligently - handling tables and formatting correctly - with words highlighting as it goes. "Finally."

### Secondary Users

**The General Web Reader**

Anyone who discovers SimpleReader in the Chrome Web Store and thinks "I could use this":
- Students working through reading lists
- People with reading difficulties (dyslexia, visual fatigue)
- Commuters who want to listen to saved articles
- Non-native speakers who benefit from hearing + reading together
- Anyone with a "read later" backlog they'd rather listen to

These users share the same core need but may emphasize different modes. The product serves them all because it's free and frictionless - low barrier to try.

### User Journey

**Discovery → Value**

1. **Discovery**: Chrome Web Store search, recommendation from friend, or sees it mentioned online
2. **Install**: One-click extension install, no account needed
3. **First Use**: Navigate to any article, see the SimpleReader button/icon, click play
4. **"Aha" Moment**: Article reads aloud with word highlighting, handles the page's formatting intelligently (skips nav, reads tables sensibly)
5. **Adoption**: Becomes default behavior - "I should listen to this" → click → listening
6. **Habit**: Part of daily routine - morning articles with coffee, background listening while cooking

**Key Interactions:**
- Extension icon click → starts reading current page
- Keyboard shortcut (Alt+Shift+R) → quick toggle
- In-page floating button → visible control without leaving content
- Speed control → match reading pace to context (1x for focus, 1.5x for background)

---

## Success Metrics

### North Star

**"People use it."** - The product succeeds when it becomes a natural part of how people consume web content.

### User Success Indicators

How users know SimpleReader is working for them:

| Indicator | What It Means |
|-----------|---------------|
| **First play works** | User installs, opens an article, clicks play → audio starts with highlighting. No friction. |
| **Returns to use it** | User comes back and uses it again on different articles (not install-and-forget) |
| **Finishes articles** | User listens through full articles instead of abandoning |
| **Uses multiple modes** | User discovers value in different contexts (focus, background, ambient) |

### Adoption Metrics

Chrome Web Store signals:

- **Install count** - Primary growth indicator
- **Active users** (Chrome provides weekly active)
- **Rating** - Quality signal (aim for 4+ stars)
- **Reviews** - Qualitative feedback, bug reports, feature requests

### Product Quality Signals

The product is good when:

- **It just works**: No configuration needed, auto-detects content correctly
- **Voice sounds good**: Users don't complain about robotic or unnatural speech
- **Highlighting syncs**: Words highlight in time with audio (the "magic" feature)
- **Content extraction is smart**: Tables, formatting, navigation handled correctly
- **No crashes/bugs**: Extension is stable across different sites

### What We're NOT Tracking

- Revenue (there is none)
- Conversion funnels (nothing to convert to)
- Engagement time quotas (use it when you want, not because we want you to)
- Any data that leaves the browser (privacy-first means no telemetry)

---

## MVP Scope

### Core Features

**v1.0 delivers the complete experience - no compromises.**

#### TTS Engine
- Kokoro TTS running in offscreen document
- WebGPU primary runtime (best performance)
- WASM fallback (broad compatibility)
- q8 quantization (80MB, good quality/size balance)
- Web Speech API fallback for devices that can't load model

#### Word-Level Highlighting
- Phoneme-weighted duration estimation for word sync (~90% accuracy)
- Real-time highlighting as audio plays
- Smooth scrolling to current word
- Visual distinction for current word vs. already-spoken

#### Smart Content Extraction
- Auto-detect main article content (skip nav, ads, footers)
- Intelligent table handling (read sensibly, not raw dump)
- Handle common formatting patterns
- Selected text reading (highlight text, read just that)

#### Playback Controls
- Play / Pause / Stop
- Speed control: 0.5x - 2x range
- Keyboard shortcut (Alt+Shift+R) for quick toggle
- Extension icon click to start reading current page
- In-page floating mini-player with controls

#### Voice & Settings
- Multiple Kokoro voices available (21+ options)
- Voice selection in settings/popup
- Speed preference persistence
- Highlight color customization

#### Architecture
- Chrome extension (Manifest V3)
- WXT framework for development
- Offscreen document for TTS processing
- Content script for DOM highlighting
- Service worker for coordination
- chrome.storage.sync for preferences
- IndexedDB for model caching

### Out of Scope for v1.0

- Firefox/Safari ports (Chrome first, others later)
- Mobile browser support
- PDF viewer integration (browser PDFs only, not custom viewer)
- Export to audio file
- Reading history/bookmarks
- Multi-language TTS (English first)
- Custom voice training
- Cloud sync of reading progress

### MVP Success Criteria

The v1.0 is successful when:

1. **It works for Luca**: Daily driver for reading articles
2. **First use is magic**: Install → navigate to article → click play → it works with highlighting
3. **Published on Chrome Web Store**: Available for anyone to install
4. **Stable**: No crashes on major sites (Medium, Substack, news sites, blogs)
5. **Voice quality is good**: Users don't complain about robotic speech

### Future Vision

If SimpleReader succeeds:

**Near-term (post v1.0):**
- Firefox and Safari extensions
- More languages (Spanish, French, German, etc.)
- Sentence-level highlighting (secondary color)
- Reading progress sync across devices
- Export article to audio file (MP3)

**Long-term:**
- Mobile companion app
- Integration with read-later services (Pocket, Instapaper)
- Custom voice creation/tuning
- API for other apps to use the TTS engine
- Open source the core engine
