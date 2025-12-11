---
stepsCompleted: [1, 2, 3, 4, 6, 7, 8, 9, 10, 11]
inputDocuments:
  - docs/analysis/product-brief-simplereader-2025-12-04.md
  - docs/analysis/research/technical-local-tts-browser-research-2025-12-04.md
  - docs/analysis/research/technical-architecture-patterns-research-2025-12-04.md
workflowType: 'prd'
lastStep: 11
project_name: 'simplereader'
user_name: 'Luca'
date: '2025-12-04'
status: complete
---

# Product Requirements Document - simplereader

**Author:** Luca
**Date:** 2025-12-04

## Executive Summary

SimpleReader is a browser-based text-to-speech tool that runs 100% locally. Built as a Chrome extension, it adds TTS to any webpage with one click—no subscriptions, no cloud, no copy-pasting.

The core insight: people want to listen to web content, but current solutions force an unacceptable tradeoff. Speechify costs $139/year. Free alternatives mean robotic system voices, copy-pasting into external apps, or no visual sync. Most people just don't use TTS, even when listening would be better than reading.

SimpleReader eliminates this tradeoff by running Kokoro TTS entirely in the browser via WebGPU/WASM. Your text never leaves your device. It's free because it costs nothing to run.

**Target Users:** Knowledge workers who consume significant written content online—articles, documentation, essays. They use TTS in three modes: Focus (audio + visual highlighting for comprehension), Background (audio while away from screen), and Ambient (light multitasking with occasional glances).

**The "Aha" Moment:** Install extension, navigate to an article, hit play, and it reads intelligently—handling tables and formatting correctly—with words highlighting as it goes. "Finally."

### What Makes This Special

1. **100% Local** - Kokoro TTS runs in your browser via WebGPU/WASM. Text never leaves your device.
2. **Free Forever** - No server infrastructure means no costs to pass on. Not freemium—just free.
3. **In-Place Experience** - Read AND listen on the same page with word-level highlighting. No context switching.
4. **Privacy by Default** - No analytics, no cloud, no tracking. Your reading habits are yours.
5. **Works Offline** - Once the model is cached, works without internet.

## Project Classification

**Technical Type:** Web App (Chrome Extension)
**Domain:** General (Productivity/Accessibility)
**Complexity:** Low

This is a consumer browser extension with clear technical scope: WXT framework for development, Manifest V3 architecture, offscreen document for TTS processing, content script for DOM highlighting. No regulatory requirements, no multi-tenant complexity, no compliance burden. Standard web practices apply.

## Success Criteria

### User Success

The product succeeds when users experience the "finally" moment:

| Indicator | Success Looks Like |
|-----------|-------------------|
| **First play works** | Install → article → click play → audio starts with highlighting. Zero friction. |
| **Returns to use it** | User comes back on different articles, different days. Not install-and-forget. |
| **Finishes articles** | Listens through full articles instead of abandoning halfway. |
| **Uses multiple modes** | Discovers value across Focus, Background, and Ambient contexts. |

### Business Success

No growth targets for v1.0. This is a "scratch your own itch" project.

**Signals that matter:**
- Chrome Web Store rating (aim for 4+ stars)
- Qualitative feedback in reviews
- Install count as a vanity metric (no targets)

**What we're NOT tracking:**
- Revenue (there is none)
- Conversion funnels (nothing to convert to)
- Engagement quotas (use it when you want)
- Any telemetry that leaves the browser

### Technical Success

**Product Quality Signals:**
- **It just works** - No configuration needed, auto-detects content correctly
- **Voice sounds good** - No complaints about robotic or unnatural speech
- **Highlighting syncs** - Words highlight in time with audio (the "magic" feature)
- **Content extraction is smart** - Tables, formatting, navigation handled correctly
- **Stable** - No crashes on major sites (Medium, Substack, news sites, blogs)

### Measurable Outcomes

**MVP is successful when:**
1. Works as daily driver for reading articles
2. First use is magic (install → article → play → works with highlighting)
3. Published on Chrome Web Store
4. Stable across major content sites
5. Voice quality comparable to paid alternatives

## Product Scope

### MVP - Minimum Viable Product

**TTS Engine:**
- Kokoro TTS in offscreen document (WebGPU primary, WASM fallback)
- q8 quantization (~80MB, cached in IndexedDB)
- Web Speech API fallback for unsupported devices

**Word-Level Highlighting:**
- Phoneme-weighted duration estimation (~90% accuracy)
- Real-time highlighting with smooth scrolling
- Visual distinction for current word vs. already-spoken

**Smart Content Extraction:**
- Auto-detect main article content
- Intelligent table handling
- Selected text reading support

**Playback Controls:**
- Play / Pause / Stop
- Speed control (0.5x - 2x)
- Keyboard shortcut (Alt+Shift+R)
- Floating mini-player

**Voice & Settings:**
- Multiple Kokoro voices (21+ options)
- Speed preference persistence
- Highlight color customization

### Growth Features (Post-MVP)

- Firefox and Safari extensions
- More languages (Spanish, French, German)
- Sentence-level highlighting
- Reading progress sync across devices
- Export article to audio file (MP3)

### Vision (Future)

- Mobile companion app
- Integration with read-later services (Pocket, Instapaper)
- Custom voice creation/tuning
- API for other apps to use the TTS engine
- Open source the core engine

## User Journeys

### Journey 1: Luca - The Morning Article Ritual (Focus Mode)

Luca settles into his desk chair with a fresh cup of coffee, opening his browser to catch up on the Substack essays that piled up overnight. He's got three long-form pieces bookmarked—easily 45 minutes of reading. His eyes are already tired from yesterday's screen time, and he knows he'll skim if he just reads.

He clicks the SimpleReader icon. The floating player appears, and with one more click, the article begins. The first word highlights yellow as a natural voice starts reading. Luca leans back slightly, his eyes tracking the highlighted words as they flow. Something clicks—he's not just hearing the words, he's *seeing* them emphasized in real-time. His mind stops wandering.

Twenty minutes later, he's absorbed the entire first article without once reaching for his phone or switching tabs. The highlighting kept him anchored. He realizes he actually *remembers* what he read. He moves to the next article, adjusting speed to 1.2x—he's warmed up now. By the time his coffee is empty, he's finished all three pieces and retained more than he would have in twice the time just reading.

**This journey reveals requirements for:**
- One-click activation from extension icon
- Floating mini-player with minimal distraction
- Real-time word highlighting synchronized to audio
- Speed control accessible during playback
- Smooth transition between articles

---

### Journey 2: Luca - Cooking Companion (Background Mode)

It's 6 PM and Luca is about to start cooking dinner. He's got a 20-minute article about AI alignment that he's been meaning to read for days. He opens it on his laptop in the kitchen, hits the SimpleReader shortcut (Alt+Shift+R), and cranks the speed to 1.5x.

As the voice starts reading, he props his laptop where he can glance at it occasionally, then turns to the cutting board. The article plays through his laptop speakers while he chops vegetables. When something interesting comes up—"wait, what did they just say about mesa-optimization?"—he glances over and sees the current word highlighted. He taps pause, reads the paragraph, then resumes.

By the time dinner is ready, he's finished the article. What would have sat in his "read later" graveyard for another week is now done. He didn't have to choose between cooking and learning.

**This journey reveals requirements for:**
- Keyboard shortcut for quick start (Alt+Shift+R)
- Speed control up to 1.5x+ for background listening
- Pause/resume with visual position indicator
- Audio that plays through system speakers
- Highlighting that shows current position when glancing back

---

### Journey 3: First-Timer - The "Finally" Moment

Alex has tried Speechify (too expensive), Natural Reader (annoying upsells), and the built-in Chrome TTS (sounds robotic). They've mostly given up on TTS, resigned to skimming articles or letting them pile up unread.

A friend mentions SimpleReader in a group chat: "It's free and runs locally, no account needed." Skeptical but curious, Alex finds it on the Chrome Web Store and clicks "Add to Chrome." No signup. No permissions beyond "read content on pages."

They navigate to a Medium article they've been avoiding—a 15-minute read about career transitions. They click the SimpleReader icon and wait. A progress bar shows "Loading voice model: 47%... 78%... Ready!" It takes about 30 seconds on their WiFi.

They click play. A natural voice begins reading—not robotic, not uncanny valley, just... good. The first word highlights. Then the second. The voice and the highlights are in sync. Alex watches, slightly amazed, as the article reads itself aloud while they follow along visually.

"Finally," they mutter. This is what TTS was supposed to be.

**This journey reveals requirements for:**
- Chrome Web Store installation (no account, minimal permissions)
- Model download with clear progress indication
- One-time download, cached for future use
- High-quality voice that sounds natural
- Immediate value on first use (no configuration needed)
- Word-level highlighting synchronized from first play

---

### Journey 4: Edge Case - Handling Messy Content

Luca opens a blog post that's heavy with code blocks, tables, and inline formatting. He's curious how SimpleReader will handle it.

He hits play. The TTS reads the article prose naturally, pauses appropriately at code blocks (reading them slightly differently or skipping inline code gracefully), and when it hits a table, it reads row-by-row in a sensible order: "Row 1: Feature, Speechify, SimpleReader. Row 2: Price, $139/year, Free."

It's not perfect—one table with merged cells gets a bit jumbled—but it's *intelligible*. Luca doesn't have to pre-clean the content or copy-paste into a separate tool. Good enough.

**This journey reveals requirements for:**
- Smart content extraction (skip nav, ads, sidebars)
- Intelligent handling of code blocks
- Table reading in row-by-row format
- Graceful degradation on complex formatting
- No pre-processing required by user

### Journey Requirements Summary

| Capability Area | Revealed By Journey |
|----------------|---------------------|
| **One-click activation** | Focus Mode, First-Timer |
| **Keyboard shortcut** | Background Mode |
| **Floating mini-player** | Focus Mode, Background Mode |
| **Word-level highlighting** | All journeys |
| **Speed control (0.5x-2x)** | Focus Mode, Background Mode |
| **Model download with progress** | First-Timer |
| **Model caching** | First-Timer |
| **Natural voice quality** | First-Timer |
| **Smart content extraction** | Edge Case |
| **Table handling** | Edge Case |
| **Pause/resume with position** | Background Mode |
| **Zero configuration** | First-Timer |

## Innovation & Novel Patterns

### Detected Innovation Areas

SimpleReader represents a fundamental architecture shift, not an incremental improvement over existing TTS solutions.

| Innovation | Description |
|------------|-------------|
| **Browser-Native Neural TTS** | Running Kokoro (82M parameter model, ~80MB) entirely in-browser via WebGPU/WASM. Real neural network inference in a browser tab, not API calls to cloud services. |
| **Privacy by Architecture** | Text never leaves the browser—not by policy, but by design. There's no server to send data to. Privacy is a structural guarantee, not a promise. |
| **Zero-Cost Business Model** | No servers = no infrastructure costs = nothing to charge for. This isn't "freemium with limits"—it's sustainably free because the cost structure is fundamentally different. |
| **Phoneme-Weighted Word Sync** | Using Kokoro's phoneme output for ~90% accurate word-level timing without complex forced alignment algorithms. Simple, effective, good enough. |

### What This Enables

The architectural innovation unlocks a combination that cloud-based solutions cannot match:

- **Free + High Quality** - Cloud TTS requires per-request costs; local inference has zero marginal cost
- **Private + Functional** - No privacy tradeoff for functionality; text stays local by design
- **Offline + Modern** - Works without internet once model is cached; still uses cutting-edge ML
- **Simple + Powerful** - No accounts, no API keys, no configuration; just install and use

### Validation Approach

The innovation is already validated at the technical layer:
- Kokoro TTS proven to run in browser (kokoro-js library exists)
- WebGPU/WASM inference is production-ready
- Word timing via phonemes demonstrated in research

**User validation needed:**
- Does the ~30 second model download on first use feel acceptable?
- Is ~90% word sync accuracy "good enough" vs perfect alignment?
- Do users trust "runs locally" claims without seeing proof?

### Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Model too large for some devices | Web Speech API fallback for low-memory devices |
| WebGPU not supported | WASM fallback (slower but universal) |
| Word sync not accurate enough | Acceptable for MVP; forced alignment possible for v2 |
| Users don't believe "local" claim | Could add "offline mode" demo or network indicator |

## Browser Extension Technical Requirements

### Platform Strategy

**Phase 1 (MVP):** Chrome only
- Manifest V3 architecture
- Chrome Web Store distribution
- Chrome 113+ required (WebGPU support)

**Phase 2 (Post-MVP):** Cross-browser
- Firefox (WebExtensions API)
- Safari (Safari Web Extensions)

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ CONTENT SCRIPT                                              │
│ • DOM manipulation (word highlighting)                      │
│ • Text extraction from webpage                              │
│ • Floating player UI (Shadow DOM isolated)                  │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │ chrome.runtime.sendMessage
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ SERVICE WORKER (Background)                                 │
│ • Message router between contexts                           │
│ • chrome.storage management                                 │
│ • Keyboard shortcut handling                                │
│ • Does NOT run TTS model                                    │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │ chrome.runtime.sendMessage
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ OFFSCREEN DOCUMENT                                          │
│ • Kokoro TTS model (WebGPU/WASM)                           │
│ • Audio generation & streaming                              │
│ • Phoneme extraction for word timing                        │
│ • Web Audio API playback                                    │
│ • Model caching (IndexedDB)                                 │
└─────────────────────────────────────────────────────────────┘
```

### Performance Requirements

| Aspect | Target | Rationale |
|--------|--------|-----------|
| **Model load** | < 30s on first use | One-time download, cached after |
| **Audio start** | < 2s after play | Streaming generation, don't wait for full audio |
| **Highlighting sync** | No perceptible lag | requestAnimationFrame, 60fps updates |
| **Memory usage** | < 500MB peak | Model + audio buffers + DOM |
| **No UI hangs** | Ever | Offscreen document isolation, no main thread blocking |

**Performance Architecture:**
- TTS runs in offscreen document (isolated from page)
- Audio chunks streamed progressively (don't wait for full generation)
- Word timing calculated ahead, highlighting uses RAF
- Model unloaded after 10 minutes of inactivity

### Accessibility Requirements

SimpleReader is an accessibility tool—it must be accessible itself.

**Keyboard Navigation:**
- All controls keyboard-accessible
- Alt+Shift+R: Global toggle (already planned)
- Space: Play/pause when player focused
- Arrow keys: Speed adjustment

**Screen Reader Compatibility:**
- Popup UI fully ARIA-labeled
- Player controls announced properly
- Status changes announced (playing, paused, loading)

**Visual Accessibility:**
- Highlight color customizable (color blindness)
- Sufficient contrast in player UI
- Respects prefers-reduced-motion for animations
- High contrast mode support

### Browser Permissions

**Required:**
- `activeTab` - Read current page content
- `storage` - Persist preferences
- `offscreen` - TTS model execution

**Not Required:**
- `tabs` - Don't need to list all tabs
- `history` - Don't track browsing
- `<all_urls>` - Only active tab, not all sites

### Development Framework

**WXT (Vite-based):**
- Hot reload during development
- TypeScript first-class support
- Multi-browser build targets
- Automatic manifest generation

**State Management:**
- Zustand for cross-context state
- chrome.storage.sync for preferences
- IndexedDB for model caching (via Transformers.js)

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Experience MVP
- Deliver the complete reading experience (audio + synchronized highlighting)
- Minimal feature set, but every feature works excellently
- "Do one thing well" - be the best free TTS reader, not a feature-packed mediocre one

**Resource Requirements:** Solo developer
- No backend infrastructure to maintain
- No team coordination overhead
- Ship fast, iterate based on personal use

### MVP Feature Set (Phase 1)

**Core User Journeys Supported:**
1. Focus Mode - Active reading with highlighting
2. Background Mode - Start playback, walk away
3. First-Timer - Install, download model, experience magic
4. Edge Case - Handle messy content gracefully

**Must-Have Capabilities:**

| Capability | Why Essential |
|------------|---------------|
| Kokoro TTS (WebGPU/WASM) | Core value proposition - high-quality local TTS |
| Word-level highlighting | Key differentiator - visual sync with audio |
| One-click activation | Zero friction to start |
| Speed control (0.5x-2x) | Essential for different use modes |
| Model caching | Can't re-download 80MB every time |
| Web Speech fallback | Graceful degradation for edge cases |

**Explicitly Out of MVP:**
- Firefox/Safari (Chrome first)
- Multiple languages (English only)
- Sentence-level highlighting
- Reading progress sync
- Audio export
- Any server-side component

### Post-MVP Features

**Phase 2 (Growth):**
- Firefox extension port
- Safari extension port
- Additional Kokoro voices
- Sentence-level highlighting (secondary color)
- Reading progress persistence (local)

**Phase 3 (Expansion):**
- Multi-language support (Spanish, French, German)
- Export article to audio file (MP3)
- Reading progress sync across devices
- Integration with Pocket/Instapaper

**Phase 4 (Vision):**
- Mobile companion app
- Custom voice fine-tuning
- API for other apps
- Open source the core engine

### Risk Mitigation Strategy

| Risk | Mitigation |
|------|------------|
| **Technical: Kokoro reliability across sites** | Test on 10 major sites before launch (Medium, Substack, HN, Reddit, news sites) |
| **Technical: Word sync accuracy** | 90% is acceptable for MVP; forced alignment can come in v2 |
| **UX: 30-second model download** | Clear progress indicator, only happens once, cache aggressively |
| **UX: Memory usage on low-end devices** | Web Speech API fallback, document memory requirements |
| **Market: Users don't trust "local" claim** | Could add network indicator or offline demo |

## Functional Requirements

### TTS Engine

- FR1: User can play text-to-speech audio generated locally in the browser
- FR2: System uses Kokoro TTS model running via WebGPU when available
- FR3: System falls back to WASM runtime when WebGPU is unavailable
- FR4: System falls back to Web Speech API when model cannot load
- FR5: User can select from available Kokoro voices
- FR6: System caches the TTS model after first download

### Content Extraction

- FR7: User can read the main content of the current webpage
- FR8: System automatically identifies article/main content area
- FR9: System skips navigation, ads, sidebars, and footers
- FR10: System handles tables by reading row-by-row
- FR11: System handles code blocks appropriately (read or skip gracefully)
- FR12: User can read selected text instead of full page

### Word Highlighting

- FR13: System highlights the current word as audio plays
- FR14: System visually distinguishes current word from already-spoken words
- FR15: System scrolls to keep the current word visible
- FR16: User can customize highlight color
- FR17: Highlighting syncs with audio using phoneme-weighted timing

### Playback Control

- FR18: User can start playback with one click from extension icon
- FR19: User can start playback with keyboard shortcut (Alt+Shift+R)
- FR20: User can pause and resume playback
- FR21: User can stop playback
- FR22: User can adjust playback speed (0.5x to 2x range)
- FR23: System shows current playback position when paused
- FR24: System displays a floating mini-player with controls

### User Settings

- FR25: System persists user's speed preference across sessions
- FR26: System persists user's voice preference across sessions
- FR27: System persists user's highlight color preference
- FR28: User can access settings through extension popup

### Model Management

- FR29: System shows download progress during first model load
- FR30: System stores model in browser cache for offline use
- FR31: System unloads model after extended inactivity to free memory
- FR32: System detects device capability and selects appropriate runtime

### Accessibility

- FR33: All playback controls are keyboard-accessible
- FR34: Extension popup is screen-reader compatible (ARIA labels)
- FR35: System respects reduced-motion preferences for animations
- FR36: Player UI meets contrast requirements

## Non-Functional Requirements

### Performance

- NFR1: Audio playback starts within 2 seconds of clicking play (after model loaded)
- NFR2: Word highlighting updates at 60fps with no perceptible lag from audio
- NFR3: UI remains responsive during TTS generation (no main thread blocking)
- NFR4: Model download completes within 30 seconds on typical broadband
- NFR5: Peak memory usage stays under 500MB (model + audio + DOM)
- NFR6: Extension does not degrade host page performance

### Privacy & Security

- NFR7: No text or user data is transmitted to external servers
- NFR8: Extension requests only minimal required permissions
- NFR9: Model and preferences stored only in local browser storage
- NFR10: No analytics or tracking of any kind

### Accessibility

- NFR11: All interactive elements are keyboard-navigable
- NFR12: Player controls have appropriate ARIA labels for screen readers
- NFR13: Color choices meet WCAG 2.1 AA contrast requirements
- NFR14: Animations respect prefers-reduced-motion setting
- NFR15: Highlight colors are customizable for color blindness

### Reliability

- NFR16: Extension works on major content sites (Medium, Substack, HN, Reddit, news)
- NFR17: Graceful fallback when primary TTS unavailable (Web Speech API)
- NFR18: Model cache persists across browser restarts
- NFR19: Extension recovers gracefully from errors without crashing
- NFR20: Content extraction handles varied HTML structures without failing
