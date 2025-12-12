---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - docs/prd.md
  - docs/architecture.md
  - docs/project_context.md
workflowType: 'epics-stories'
lastStep: 4
project_name: 'simplereader'
user_name: 'Luca'
date: '2025-12-11'
completedAt: '2025-12-11'
status: 'complete'
---

# SimpleReader - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for SimpleReader, decomposing the requirements from the PRD, Architecture, and Project Context into implementable stories.

## Requirements Inventory

### Functional Requirements

**TTS Engine (FR1-6):**

- FR1: User can play text-to-speech audio generated locally in the browser
- FR2: System uses Kokoro TTS model running via WebGPU when available
- FR3: System falls back to WASM runtime when WebGPU is unavailable
- FR4: System falls back to Web Speech API when model cannot load
- FR5: User can select from available Kokoro voices
- FR6: System caches the TTS model after first download

**Content Extraction (FR7-12):**

- FR7: User can read the main content of the current webpage
- FR8: System automatically identifies article/main content area
- FR9: System skips navigation, ads, sidebars, and footers
- FR10: System handles tables by reading row-by-row
- FR11: System handles code blocks appropriately (read or skip gracefully)
- FR12: User can read selected text instead of full page

**Word Highlighting (FR13-17):**

- FR13: System highlights the current word as audio plays
- FR14: System visually distinguishes current word from already-spoken words
- FR15: System scrolls to keep the current word visible
- FR16: User can customize highlight color
- FR17: Highlighting syncs with audio using phoneme-weighted timing

**Playback Control (FR18-24):**

- FR18: User can start playback with one click from extension icon
- FR19: User can start playback with keyboard shortcut (Alt+Shift+R)
- FR20: User can pause and resume playback
- FR21: User can stop playback
- FR22: User can adjust playback speed (0.5x to 2x range)
- FR23: System shows current playback position when paused
- FR24: System displays a floating mini-player with controls

**User Settings (FR25-28):**

- FR25: System persists user's speed preference across sessions
- FR26: System persists user's voice preference across sessions
- FR27: System persists user's highlight color preference
- FR28: User can access settings through extension popup

**Model Management (FR29-32):**

- FR29: System shows download progress during first model load
- FR30: System stores model in browser cache for offline use
- FR31: System unloads model after extended inactivity to free memory
- FR32: System detects device capability and selects appropriate runtime

**Accessibility (FR33-36):**

- FR33: All playback controls are keyboard-accessible
- FR34: Extension popup is screen-reader compatible (ARIA labels)
- FR35: System respects reduced-motion preferences for animations
- FR36: Player UI meets contrast requirements

### Non-Functional Requirements

**Performance (NFR1-6):**

- NFR1: Audio playback starts within 2 seconds of clicking play (after model loaded)
- NFR2: Word highlighting updates at 60fps with no perceptible lag from audio
- NFR3: UI remains responsive during TTS generation (no main thread blocking)
- NFR4: Model download completes within 30 seconds on typical broadband
- NFR5: Peak memory usage stays under 500MB (model + audio + DOM)
- NFR6: Extension does not degrade host page performance

**Privacy & Security (NFR7-10):**

- NFR7: No text or user data is transmitted to external servers
- NFR8: Extension requests only minimal required permissions
- NFR9: Model and preferences stored only in local browser storage
- NFR10: No analytics or tracking of any kind

**Accessibility (NFR11-15):**

- NFR11: All interactive elements are keyboard-navigable
- NFR12: Player controls have appropriate ARIA labels for screen readers
- NFR13: Color choices meet WCAG 2.1 AA contrast requirements
- NFR14: Animations respect prefers-reduced-motion setting
- NFR15: Highlight colors are customizable for color blindness

**Reliability (NFR16-20):**

- NFR16: Extension works on major content sites (Medium, Substack, HN, Reddit, news)
- NFR17: Graceful fallback when primary TTS unavailable (Web Speech API)
- NFR18: Model cache persists across browser restarts
- NFR19: Extension recovers gracefully from errors without crashing
- NFR20: Content extraction handles varied HTML structures without failing

### Additional Requirements

**Starter Template & Project Setup:**

- ARCH-1: Initialize project with WXT React template (official): `bunx wxt@latest init simplereader`
- ARCH-2: Add CSP for WASM in `wxt.config.ts`: `wasm-unsafe-eval` required for kokoro-js
- ARCH-3: Create foundational shared files first: `lib/messages.ts`, `lib/storage.ts`, `lib/errors.ts`

**Extension Architecture (Critical Patterns):**

- ARCH-4: Offscreen document REQUIRED for TTS - service workers cannot run WebGPU/WASM
- ARCH-5: All cross-context communication via typed messages from `lib/messages.ts`
- ARCH-6: Never import extension-specific code between contexts - only from `lib/`
- ARCH-7: Shadow DOM required for floating player - prevents host page style leaks
- ARCH-8: Always check if offscreen document exists before creating (`getContexts()`)
- ARCH-9: Chrome closes offscreen docs after ~30s of audio inactivity - handle lifecycle

**Naming & Code Patterns:**

- ARCH-10: Message types in SCREAMING_SNAKE_CASE with context prefix (e.g., `TTS_GENERATE`)
- ARCH-11: Storage keys defined in `lib/storage.ts` only - never string literals
- ARCH-12: CSS prefix with `sr-` to prevent conflicts with host page
- ARCH-13: Tests co-located: `foo.ts` → `foo.test.ts`

**Content Extraction:**

- ARCH-14: Use Mozilla Readability library - clone DOM before parsing
- ARCH-15: Post-process tables for row-by-row reading

**Word Timing:**

- ARCH-16: Phoneme-weighted duration estimation with sentence boundary reset
- ARCH-17: Use `requestAnimationFrame` for highlight updates

**Testing:**

- ARCH-18: Vitest with WxtVitest plugin for unit tests
- ARCH-19: Playwright E2E for critical path only (install → play → highlight)
- ARCH-20: No visual regression tests in MVP

**Build & Distribution:**

- ARCH-21: Bun as package manager and runtime
- ARCH-22: Manual Chrome Web Store upload (no CI/CD for MVP)

### FR Coverage Map

| FR | Epic | Description |
|----|------|-------------|
| FR1 | Epic 2 | Play TTS audio locally |
| FR2 | Epic 2 | Kokoro via WebGPU |
| FR3 | Epic 2 | WASM fallback |
| FR4 | Epic 2 | Web Speech API fallback |
| FR5 | Epic 4 | Voice selection |
| FR6 | Epic 2 | Model caching |
| FR7 | Epic 2 | Read main content |
| FR8 | Epic 2 | Auto-detect article |
| FR9 | Epic 2 | Skip nav/ads/sidebars |
| FR10 | Epic 5 | Table row-by-row |
| FR11 | Epic 5 | Code block handling |
| FR12 | Epic 5 | Selected text reading |
| FR13 | Epic 2 | Highlight current word |
| FR14 | Epic 5 | Distinguish spoken words |
| FR15 | Epic 2 | Auto-scroll to word |
| FR16 | Epic 4 | Customize highlight color |
| FR17 | Epic 2 | Phoneme-weighted sync |
| FR18 | Epic 2 | One-click from icon |
| FR19 | Epic 3 | Alt+Shift+R shortcut |
| FR20 | Epic 2 | Pause/resume |
| FR21 | Epic 2 | Stop playback |
| FR22 | Epic 3 | Speed control (0.5x-2x) |
| FR23 | Epic 3 | Show position when paused |
| FR24 | Epic 3 | Floating mini-player |
| FR25 | Epic 4 | Persist speed pref |
| FR26 | Epic 4 | Persist voice pref |
| FR27 | Epic 4 | Persist highlight color |
| FR28 | Epic 4 | Settings popup |
| FR29 | Epic 6 | Download progress |
| FR30 | Epic 6 | Offline caching |
| FR31 | Epic 6 | Unload on inactivity |
| FR32 | Epic 6 | Device capability detection |
| FR33 | Epic 7 | Keyboard-accessible controls |
| FR34 | Epic 7 | Screen reader compatible |
| FR35 | Epic 7 | Reduced motion |
| FR36 | Epic 7 | Contrast requirements |

**Coverage: 36/36 FRs mapped (100%)**

## Epic List

### Epic 1: Project Setup & Architecture Foundation

**Goal:** Extension shell installs in Chrome with foundational architecture ready for feature development.

**User Outcome:** A working Chrome extension that can be loaded in developer mode, with all shared infrastructure (`lib/messages.ts`, `lib/storage.ts`, `lib/errors.ts`) established per architecture patterns.

**ARCH covered:** ARCH-1, ARCH-2, ARCH-3, ARCH-5, ARCH-6, ARCH-10, ARCH-11, ARCH-12, ARCH-13, ARCH-21

---

### Epic 2: First Play Experience (The Magic Moment)

**Goal:** Deliver the core "finally" moment - user can install, navigate to an article, click play, and hear it read aloud with synchronized word highlighting.

**User Outcome:** Complete end-to-end TTS experience with content extraction, audio generation, and real-time word highlighting. This is the MVP value delivery.

**FRs covered:** FR1, FR2, FR3, FR4, FR6, FR7, FR8, FR9, FR13, FR15, FR17, FR18, FR20, FR21

**ARCH covered:** ARCH-4, ARCH-8, ARCH-9, ARCH-14, ARCH-16, ARCH-17

---

### Epic 3: Playback Controls & Mini-Player

**Goal:** Give users full control over their listening experience with convenient, accessible controls.

**User Outcome:** Keyboard shortcut for quick start (Alt+Shift+R), speed adjustment (0.5x-2x), floating mini-player with play/pause/stop, and visual position indicator.

**FRs covered:** FR19, FR22, FR23, FR24

**ARCH covered:** ARCH-7

---

### Epic 4: User Preferences & Settings

**Goal:** Enable users to customize their experience and have preferences persist across sessions.

**User Outcome:** Voice selection from available Kokoro voices, speed preference that persists, customizable highlight color, and settings accessible through extension popup.

**FRs covered:** FR5, FR16, FR25, FR26, FR27, FR28

---

### Epic 5: Content Intelligence

**Goal:** Handle complex and varied web content gracefully without user intervention.

**User Outcome:** Tables read row-by-row intelligently, code blocks handled appropriately, ability to read selected text, and visual distinction between current and already-spoken words.

**FRs covered:** FR10, FR11, FR12, FR14

**ARCH covered:** ARCH-15

---

### Epic 6: Model Management & Performance

**Goal:** Ensure smooth first-use experience and reliable operation across sessions.

**User Outcome:** Clear progress indication during model download, offline capability after first use, automatic memory management, and smart runtime selection based on device capability.

**FRs covered:** FR29, FR30, FR31, FR32

---

### Epic 7: Accessibility

**Goal:** Make SimpleReader fully accessible to users with disabilities or different interaction preferences.

**User Outcome:** All controls keyboard-accessible, full screen reader compatibility, respect for reduced-motion preferences, and WCAG 2.1 AA compliant contrast.

**FRs covered:** FR33, FR34, FR35, FR36

---

### Epic 8: Testing & Chrome Web Store Release

**Goal:** Ensure quality and make the extension available to users.

**User Outcome:** Thoroughly tested extension published on Chrome Web Store, stable and ready for daily use.

**ARCH covered:** ARCH-18, ARCH-19, ARCH-20, ARCH-22

---

## Epic Summary

| Epic | Title | FRs | Primary Value |
|------|-------|-----|---------------|
| 1 | Project Setup & Architecture | 0 | Installable shell |
| 2 | First Play Experience | 14 | **Magic moment** |
| 3 | Playback Controls & Mini-Player | 4 | Full control |
| 4 | User Preferences & Settings | 6 | Customization |
| 5 | Content Intelligence | 4 | Smart handling |
| 6 | Model Management | 4 | Reliability |
| 7 | Accessibility | 4 | Universal access |
| 8 | Testing & Release | 0 | Published extension |

---

## Epic 1: Project Setup & Architecture Foundation

**Goal:** Extension shell installs in Chrome with foundational architecture ready for feature development.

**User Outcome:** A working Chrome extension that can be loaded in developer mode, with all shared infrastructure (`lib/messages.ts`, `lib/storage.ts`, `lib/errors.ts`) established per architecture patterns.

**ARCH covered:** ARCH-1, ARCH-2, ARCH-3, ARCH-5, ARCH-6, ARCH-10, ARCH-11, ARCH-12, ARCH-13, ARCH-21

### Story 1.1: Initialize WXT Project with React Template

As a developer,
I want a properly initialized WXT project with React and Bun,
So that I have a working foundation to build the extension.

**Acceptance Criteria:**

**Given** an empty project directory
**When** I run the WXT initialization command
**Then** the project scaffolds with React template, TypeScript, and Bun lockfile
**And** `bun run dev` launches Chrome with the extension loaded
**And** the popup displays "SimpleReader" placeholder text

### Story 1.2: Configure Manifest for WASM and Required Permissions

As a developer,
I want the extension manifest configured with correct CSP and permissions,
So that Kokoro TTS can run WebAssembly and the extension can access required APIs.

**Acceptance Criteria:**

**Given** the initialized WXT project
**When** I configure `wxt.config.ts` with CSP and permissions
**Then** the manifest includes `wasm-unsafe-eval` in content_security_policy
**And** permissions include `activeTab`, `storage`, and `offscreen`
**And** the extension still loads successfully in Chrome

### Story 1.3: Create Typed Message Protocol Foundation

As a developer,
I want a typed message protocol in `lib/messages.ts`,
So that all cross-context communication is type-safe and consistent.

**Acceptance Criteria:**

**Given** the configured project
**When** I create `lib/messages.ts`
**Then** it exports a discriminated union `Message` type with SCREAMING_SNAKE_CASE types
**And** it includes placeholder message types for TTS, Playback, and Highlight contexts
**And** it exports typed `sendMessage` and `addMessageListener` helper functions
**And** TypeScript compiles without errors

### Story 1.4: Create Storage Keys and Helpers

As a developer,
I want centralized storage keys in `lib/storage.ts`,
So that all storage access is consistent and typo-proof.

**Acceptance Criteria:**

**Given** the project with message protocol
**When** I create `lib/storage.ts`
**Then** it exports a `STORAGE_KEYS` const object with all planned storage keys
**And** it exports typed `getStorageValue` and `setStorageValue` helper functions
**And** helpers distinguish between `sync` and `local` storage
**And** TypeScript compiles without errors

### Story 1.5: Create Error Handling Foundation

As a developer,
I want a typed error system in `lib/errors.ts`,
So that errors are consistently structured across all contexts.

**Acceptance Criteria:**

**Given** the project with storage helpers
**When** I create `lib/errors.ts`
**Then** it exports an `ExtensionError` interface with code, message, context, and recoverable fields
**And** it exports helper functions to create and propagate errors
**And** error codes follow SCREAMING_SNAKE_CASE naming
**And** TypeScript compiles without errors

### Story 1.6: Create Extension Entrypoint Skeletons

As a developer,
I want skeleton entrypoints for all extension contexts,
So that the project structure is complete and ready for feature implementation.

**Acceptance Criteria:**

**Given** the project with lib/ foundation
**When** I create skeleton entrypoints
**Then** `src/entrypoints/background/index.ts` exists with message listener setup
**And** `src/entrypoints/content/index.ts` exists with content script initialization
**And** `src/entrypoints/offscreen/` exists with index.html and index.ts
**And** `src/entrypoints/popup/` has App.tsx with placeholder UI
**And** all entrypoints import from `lib/` only (not from each other)
**And** extension loads without console errors

---

## Epic 2: First Play Experience (The Magic Moment)

**Goal:** Deliver the core "finally" moment - user can install, navigate to an article, click play, and hear it read aloud with synchronized word highlighting.

**User Outcome:** Complete end-to-end TTS experience with content extraction, audio generation, and real-time word highlighting. This is the MVP value delivery.

**FRs covered:** FR1, FR2, FR3, FR4, FR6, FR7, FR8, FR9, FR13, FR15, FR17, FR18, FR20, FR21

**ARCH covered:** ARCH-4, ARCH-8, ARCH-9, ARCH-14, ARCH-16, ARCH-17

### Story 2.1: Content Extraction with Mozilla Readability

As a user,
I want the extension to extract the main article content from a webpage,
So that only relevant text is read aloud (no ads, nav, sidebars).

**Acceptance Criteria:**

**Given** a webpage with article content (e.g., Medium, Substack, news site)
**When** the content script initializes
**Then** it uses Mozilla Readability to extract the main content
**And** it clones the DOM before parsing (Readability mutates)
**And** navigation, ads, sidebars, and footers are excluded
**And** the extracted text is available for TTS processing
**And** extraction completes in under 500ms for typical articles

**FRs:** FR7, FR8, FR9 | **ARCH:** ARCH-14

### Story 2.2: Offscreen Document Setup with Lifecycle Management

As a developer,
I want a properly managed offscreen document for TTS processing,
So that WebGPU/WASM can run isolated from the service worker.

**Acceptance Criteria:**

**Given** the extension is loaded
**When** TTS processing is needed
**Then** the service worker checks for existing offscreen document via `getContexts()`
**And** creates the offscreen document only if it doesn't exist
**And** the offscreen document loads with `AUDIO_PLAYBACK` reason
**And** the offscreen document can receive messages from service worker
**And** handles Chrome's ~30s inactivity closure gracefully

**FRs:** (foundation) | **ARCH:** ARCH-4, ARCH-8, ARCH-9

### Story 2.3: Kokoro TTS Integration with Model Loading

As a user,
I want the extension to generate natural-sounding speech from text,
So that I can listen to articles with high-quality audio.

**Acceptance Criteria:**

**Given** the offscreen document is ready
**When** text is sent for TTS generation
**Then** Kokoro TTS model loads via kokoro-js (WebGPU if available)
**And** model is cached in IndexedDB after first download
**And** subsequent loads use cached model (no re-download)
**And** audio is generated as streaming chunks (not waiting for full generation)
**And** phoneme data is extracted alongside audio for word timing

**FRs:** FR1, FR2, FR6 | **ARCH:** ARCH-4

### Story 2.4: TTS Fallback Chain (WASM and Web Speech API)

As a user,
I want TTS to work even if my device doesn't support WebGPU,
So that I can use SimpleReader on any Chrome browser.

**Acceptance Criteria:**

**Given** WebGPU is unavailable on the device
**When** TTS generation is requested
**Then** the system automatically falls back to WASM runtime
**And** if WASM also fails, falls back to Web Speech API
**And** the user is not required to configure anything
**And** fallback selection happens automatically and silently
**And** audio quality degrades gracefully (Kokoro > WASM Kokoro > Web Speech)

**FRs:** FR3, FR4

### Story 2.5: Word Tokenization and Timing Calculation

As a developer,
I want accurate word timing from phoneme data,
So that highlighting can sync with audio playback.

**Acceptance Criteria:**

**Given** text has been processed by Kokoro TTS
**When** phoneme data is available
**Then** words are tokenized from the original text
**And** word durations are estimated using phoneme-weighted calculation
**And** timing resets at sentence boundaries (., !, ?) to prevent drift
**And** word timing array is generated with startTime, endTime, and word index
**And** timing achieves ~90% accuracy (acceptable for MVP)

**FRs:** FR17 | **ARCH:** ARCH-16

### Story 2.6: Word Highlighting with Synchronized Scrolling

As a user,
I want to see words highlighted as they are spoken,
So that I can follow along visually with the audio.

**Acceptance Criteria:**

**Given** audio is playing and word timings are available
**When** playback progresses
**Then** the current word is highlighted with a visible color (default yellow)
**And** highlighting updates use requestAnimationFrame for 60fps smoothness
**And** the page auto-scrolls to keep the current word visible
**And** CSS classes use `sr-` prefix (`sr-word`, `sr-word--current`)
**And** highlighting works in Shadow DOM isolation from host page styles

**FRs:** FR13, FR15, FR17 | **ARCH:** ARCH-17, ARCH-12

### Story 2.7: Basic Playback Controls (Play/Pause/Stop from Icon)

As a user,
I want to start, pause, and stop playback with simple controls,
So that I have basic control over the listening experience.

**Acceptance Criteria:**

**Given** I'm on a page with extractable content
**When** I click the extension icon
**Then** a play button appears (or playback starts automatically)
**And** clicking play extracts content and begins TTS with highlighting
**And** I can pause playback (audio stops, highlighting pauses at current word)
**And** I can resume playback from where I paused
**And** I can stop playback (audio stops, highlighting resets)
**And** audio starts within 2 seconds of clicking play (after model loaded)

**FRs:** FR18, FR20, FR21 | **NFRs:** NFR1

---

## Epic 3: Playback Controls & Mini-Player

**Goal:** Give users full control over their listening experience with convenient, accessible controls.

**User Outcome:** Keyboard shortcut for quick start (Alt+Shift+R), speed adjustment (0.5x-2x), floating mini-player with play/pause/stop, and visual position indicator.

**FRs covered:** FR19, FR22, FR23, FR24

**ARCH covered:** ARCH-7

### Story 3.1: Keyboard Shortcut for Quick Start

As a user,
I want to start/stop playback with a keyboard shortcut,
So that I can control the extension without using my mouse.

**Acceptance Criteria:**

**Given** I'm on any webpage
**When** I press Alt+Shift+R
**Then** playback starts if not playing, or pauses if playing
**And** the shortcut works regardless of which element has focus
**And** the shortcut is registered via chrome.commands API
**And** the shortcut doesn't conflict with common browser shortcuts

**FRs:** FR19

### Story 3.2: Playback Speed Control

As a user,
I want to adjust the playback speed,
So that I can listen faster or slower based on my preference.

**Acceptance Criteria:**

**Given** audio is playing or paused
**When** I adjust the speed control
**Then** speed can be set from 0.5x to 2.0x in 0.1x increments
**And** speed changes apply immediately to current playback
**And** the current speed is visually displayed
**And** default speed is 1.0x

**FRs:** FR22

### Story 3.3: Floating Mini-Player UI

As a user,
I want a floating player on the page,
So that I have easy access to controls without opening the popup.

**Acceptance Criteria:**

**Given** playback has been initiated
**When** the mini-player is displayed
**Then** it appears as a floating element on the page (bottom-right by default)
**And** it's rendered in Shadow DOM (isolated from host styles)
**And** it shows play/pause/stop buttons
**And** it shows current speed and allows adjustment
**And** it shows current playback position indicator
**And** all CSS classes use `sr-` prefix
**And** it doesn't interfere with page content or scrolling

**FRs:** FR24 | **ARCH:** ARCH-7, ARCH-12

### Story 3.4: Position Indicator When Paused

As a user,
I want to see where I am in the article when paused,
So that I know my progress and can resume from the right spot.

**Acceptance Criteria:**

**Given** playback is paused
**When** I look at the page
**Then** the current word remains highlighted
**And** the mini-player shows a position indicator (e.g., "Word 142 of 1,203")
**And** resuming playback continues from exactly where I paused

**FRs:** FR23

---

## Epic 4: User Preferences & Settings

**Goal:** Enable users to customize their experience and have preferences persist across sessions.

**User Outcome:** Voice selection from available Kokoro voices, speed preference that persists, customizable highlight color, and settings accessible through extension popup.

**FRs covered:** FR5, FR16, FR25, FR26, FR27, FR28

### Story 4.1: Settings Popup UI

As a user,
I want to access settings through the extension popup,
So that I can customize my experience.

**Acceptance Criteria:**

**Given** the extension is installed
**When** I click the extension icon and access settings
**Then** I see a settings panel with voice, speed, and highlight options
**And** the UI is clean and intuitive
**And** settings changes are reflected immediately in preview (if applicable)

**FRs:** FR28

### Story 4.2: Voice Selection

As a user,
I want to choose from available Kokoro voices,
So that I can pick a voice I find pleasant.

**Acceptance Criteria:**

**Given** I'm in the settings panel
**When** I view voice options
**Then** all available Kokoro voices are listed (21+ options)
**And** I can preview a voice before selecting
**And** selected voice is used for all future playback
**And** voice selection is persisted via chrome.storage.sync

**FRs:** FR5, FR26

### Story 4.3: Speed Preference Persistence

As a user,
I want my speed preference to persist across sessions,
So that I don't have to adjust it every time.

**Acceptance Criteria:**

**Given** I've set a preferred speed
**When** I close and reopen the browser
**Then** my speed preference is restored
**And** new playback sessions start at my preferred speed
**And** speed is stored via chrome.storage.sync (syncs across devices)

**FRs:** FR25

### Story 4.4: Highlight Color Customization

As a user,
I want to customize the highlight color,
So that I can choose a color that works best for my vision.

**Acceptance Criteria:**

**Given** I'm in the settings panel
**When** I select a highlight color
**Then** I can choose from preset colors (yellow, green, blue, pink)
**And** I can optionally enter a custom hex color
**And** the color is applied to all highlighting immediately
**And** color preference is persisted via chrome.storage.sync

**FRs:** FR16, FR27

---

## Epic 5: Content Intelligence

**Goal:** Handle complex and varied web content gracefully without user intervention.

**User Outcome:** Tables read row-by-row intelligently, code blocks handled appropriately, ability to read selected text, and visual distinction between current and already-spoken words.

**FRs covered:** FR10, FR11, FR12, FR14

**ARCH covered:** ARCH-15

### Story 5.1: Table Reading Row-by-Row

As a user,
I want tables to be read intelligently,
So that tabular data is comprehensible when spoken.

**Acceptance Criteria:**

**Given** article content contains a table
**When** TTS reaches the table
**Then** table is read row-by-row (e.g., "Row 1: Column A value, Column B value")
**And** header row is identified and used for context if present
**And** complex tables with merged cells are handled gracefully (best effort)

**FRs:** FR10 | **ARCH:** ARCH-15

### Story 5.2: Code Block Handling

As a user,
I want code blocks to be handled appropriately,
So that articles with code don't sound awkward.

**Acceptance Criteria:**

**Given** article content contains code blocks
**When** TTS reaches a code block
**Then** inline code is read naturally as part of the sentence
**And** large code blocks are either skipped or read with a "code block" announcement
**And** the user can configure code handling preference (skip/read)

**FRs:** FR11

### Story 5.3: Selected Text Reading

As a user,
I want to read only my selected text,
So that I can listen to specific sections without hearing the full article.

**Acceptance Criteria:**

**Given** I have selected text on the page
**When** I click play
**Then** only the selected text is read (not the full article)
**And** highlighting applies to the selected text only
**And** if no text is selected, full article is read as default

**FRs:** FR12

### Story 5.4: Visual Distinction for Spoken Words

As a user,
I want to see which words have already been spoken,
So that I can visually track progress through the article.

**Acceptance Criteria:**

**Given** audio is playing
**When** words are spoken
**Then** already-spoken words have a different visual style (e.g., dimmed or different color)
**And** current word has distinct highlighting (brighter/bolder)
**And** upcoming words appear in normal style
**And** CSS classes are `sr-word--spoken`, `sr-word--current`

**FRs:** FR14

---

## Epic 6: Model Management & Performance

**Goal:** Ensure smooth first-use experience and reliable operation across sessions.

**User Outcome:** Clear progress indication during model download, offline capability after first use, automatic memory management, and smart runtime selection based on device capability.

**FRs covered:** FR29, FR30, FR31, FR32

### Story 6.1: Download Progress Indication

As a first-time user,
I want to see download progress for the TTS model,
So that I know the extension is working and how long to wait.

**Acceptance Criteria:**

**Given** this is my first time using the extension
**When** the model begins downloading
**Then** a progress indicator shows download percentage
**And** estimated time remaining is displayed (if calculable)
**And** the indicator is visible and non-intrusive
**And** download completes within 30 seconds on typical broadband

**FRs:** FR29 | **NFRs:** NFR4

### Story 6.2: Offline Model Caching

As a user,
I want the model to work offline after first download,
So that I can use SimpleReader without internet.

**Acceptance Criteria:**

**Given** the model has been downloaded once
**When** I use the extension offline
**Then** TTS works normally using the cached model
**And** model is stored in IndexedDB (via Transformers.js)
**And** cache persists across browser restarts
**And** cache survives normal browser cache clearing

**FRs:** FR30 | **NFRs:** NFR18

### Story 6.3: Memory Management and Model Unloading

As a user,
I want the extension to manage memory responsibly,
So that it doesn't slow down my browser.

**Acceptance Criteria:**

**Given** TTS has been used
**When** no playback occurs for 10 minutes
**Then** the model is unloaded from memory
**And** memory usage drops significantly
**And** next play request reloads the model (from cache, not network)
**And** peak memory usage stays under 500MB

**FRs:** FR31 | **NFRs:** NFR5

### Story 6.4: Device Capability Detection

As a user,
I want the extension to automatically use the best available runtime,
So that I get optimal performance without manual configuration.

**Acceptance Criteria:**

**Given** I install the extension
**When** TTS is first requested
**Then** the system detects WebGPU availability
**And** selects WebGPU if available, otherwise WASM
**And** the detection is cached for future sessions
**And** user can see which runtime is being used (in settings/debug)

**FRs:** FR32

---

## Epic 7: Accessibility

**Goal:** Make SimpleReader fully accessible to users with disabilities or different interaction preferences.

**User Outcome:** All controls keyboard-accessible, full screen reader compatibility, respect for reduced-motion preferences, and WCAG 2.1 AA compliant contrast.

**FRs covered:** FR33, FR34, FR35, FR36

### Story 7.1: Keyboard Navigation for All Controls

As a keyboard-only user,
I want to navigate all controls with keyboard,
So that I can use SimpleReader without a mouse.

**Acceptance Criteria:**

**Given** the mini-player or popup is visible
**When** I use keyboard navigation
**Then** all buttons are focusable with Tab
**And** focused elements have visible focus indicators
**And** Space/Enter activates focused buttons
**And** Arrow keys adjust sliders (speed)
**And** Escape closes popup/dismisses player

**FRs:** FR33 | **NFRs:** NFR11

### Story 7.2: Screen Reader Compatibility

As a screen reader user,
I want the extension to be properly labeled,
So that I can understand and use all features.

**Acceptance Criteria:**

**Given** I'm using a screen reader (NVDA, JAWS, VoiceOver)
**When** I interact with the extension
**Then** all buttons have descriptive ARIA labels
**And** status changes are announced (e.g., "Playing", "Paused", "Loading")
**And** progress indicators have ARIA live regions
**And** the popup is properly structured with landmarks

**FRs:** FR34 | **NFRs:** NFR12

### Story 7.3: Reduced Motion Support

As a user with motion sensitivity,
I want animations to respect my system preferences,
So that the extension doesn't cause discomfort.

**Acceptance Criteria:**

**Given** I have prefers-reduced-motion enabled in my OS
**When** the extension displays UI
**Then** smooth scrolling is disabled (instant scroll)
**And** transition animations are minimized or removed
**And** highlighting changes are instant rather than faded
**And** any loading spinners use static indicators

**FRs:** FR35 | **NFRs:** NFR14

### Story 7.4: Contrast and Visual Accessibility

As a user with visual impairments,
I want the UI to have sufficient contrast,
So that I can see all controls clearly.

**Acceptance Criteria:**

**Given** the mini-player or popup is visible
**When** I view the UI
**Then** all text meets WCAG 2.1 AA contrast requirements (4.5:1 minimum)
**And** interactive elements have visible boundaries
**And** focus indicators have sufficient contrast
**And** the UI works in high contrast mode

**FRs:** FR36 | **NFRs:** NFR13

---

## Epic 8: Testing & Chrome Web Store Release

**Goal:** Ensure quality and make the extension available to users.

**User Outcome:** Thoroughly tested extension published on Chrome Web Store, stable and ready for daily use.

**ARCH covered:** ARCH-18, ARCH-19, ARCH-20, ARCH-22

### Story 8.1: Unit Test Suite Setup

As a developer,
I want a unit test suite for core logic,
So that I can catch regressions early.

**Acceptance Criteria:**

**Given** the codebase with lib/ modules
**When** I run unit tests
**Then** Vitest runs with WxtVitest plugin
**And** tests cover message protocol serialization
**And** tests cover storage helpers
**And** tests cover word timing calculations
**And** tests cover content extraction logic
**And** test files are co-located (foo.test.ts next to foo.ts)

**ARCH:** ARCH-18, ARCH-13

### Story 8.2: E2E Critical Path Test

As a developer,
I want an E2E test for the critical user journey,
So that I can verify the magic moment works end-to-end.

**Acceptance Criteria:**

**Given** Playwright is configured for Chrome extension testing
**When** I run E2E tests
**Then** test loads the extension in Chrome
**And** test navigates to a sample article
**And** test clicks play
**And** test verifies audio starts (or mock audio in CI)
**And** test verifies word highlighting appears
**And** test passes in CI environment

**ARCH:** ARCH-19

### Story 8.3: Chrome Web Store Preparation

As a developer,
I want the extension packaged for Chrome Web Store,
So that users can discover and install it.

**Acceptance Criteria:**

**Given** development is complete
**When** I prepare for release
**Then** `bun run build --zip` creates a valid .zip file
**And** all required icons are present (16, 32, 48, 128px)
**And** manifest includes required Web Store fields (name, description, version)
**And** privacy policy is documented (if required)
**And** screenshots are prepared for the listing

**ARCH:** ARCH-22

### Story 8.4: Chrome Web Store Submission

As a developer,
I want to submit the extension to Chrome Web Store,
So that users can install it publicly.

**Acceptance Criteria:**

**Given** the .zip package is ready
**When** I submit to Chrome Web Store
**Then** all required listing information is provided
**And** the extension passes Chrome's automated review
**And** the extension is published and publicly available
**And** install link is documented in README

**ARCH:** ARCH-22
