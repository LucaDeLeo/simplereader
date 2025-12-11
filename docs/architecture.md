---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - docs/prd.md
  - docs/analysis/product-brief-simplereader-2025-12-04.md
  - docs/analysis/research/technical-architecture-patterns-research-2025-12-04.md
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2025-12-11'
project_name: 'simplereader'
user_name: 'Luca'
date: '2025-12-11'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
36 requirements organized across 6 capability areas:
- **TTS Engine (FR1-6):** Local Kokoro TTS with WebGPU → WASM → Web Speech API fallback chain
- **Content Extraction (FR7-12):** Smart article detection, table/code handling, selected text support
- **Word Highlighting (FR13-17):** Real-time word highlighting synchronized via phoneme-weighted timing
- **Playback Control (FR18-24):** One-click activation, keyboard shortcuts, floating mini-player
- **User Settings (FR25-28):** Persistent preferences for speed, voice, highlight color
- **Model Management (FR29-32):** Progress indication, caching, memory management, capability detection
- **Accessibility (FR33-36):** Full keyboard navigation, screen reader compatibility, contrast compliance

**Non-Functional Requirements:**
20 requirements defining quality attributes:
- **Performance:** Audio start < 2s, highlighting at 60fps, peak memory < 500MB, no main thread blocking
- **Privacy:** Zero external transmission, minimal permissions, local-only storage, no analytics
- **Accessibility:** WCAG 2.1 AA compliance, keyboard navigation, screen reader support
- **Reliability:** Works on major sites, graceful fallbacks, model cache persistence, error recovery

**Scale & Complexity:**
- Primary domain: Browser Extension (Chrome MV3)
- Complexity level: Low-Medium
- Estimated architectural components: 5 (Service Worker, Offscreen Document, Content Script, Popup, Options)

### Technical Constraints & Dependencies

| Constraint | Impact |
|------------|--------|
| **MV3 Service Worker Limitations** | Cannot run WebGPU/WASM in background - forces offscreen document pattern |
| **Kokoro Model Size (~80MB q8)** | Requires IndexedDB caching, progressive download with progress indication |
| **WebGPU Browser Support** | Chrome 113+ required; WASM fallback for older/unsupported browsers |
| **Cross-Context Communication** | All TTS ↔ highlighting coordination via chrome.runtime messaging |
| **Shadow DOM Isolation** | Floating player must be style-isolated from host page CSS |

**External Dependencies:**
- kokoro-js (Kokoro TTS wrapper)
- Transformers.js (model loading/caching)
- WXT (extension framework)
- Zustand (state management)
- idb-keyval (IndexedDB wrapper)

### Cross-Cutting Concerns Identified

| Concern | Affected Components | Architectural Pattern |
|---------|--------------------|-----------------------|
| **Message Passing** | All contexts | Typed message protocol with discriminated unions |
| **State Synchronization** | Service Worker, Content Script, Popup | Zustand + chrome.storage.sync |
| **Model Lifecycle** | Offscreen Document, Service Worker | Lazy loading, timeout-based unloading |
| **Error Boundaries** | All contexts | Graceful degradation to fallback TTS |
| **Playback Timing** | Offscreen (audio), Content Script (highlighting) | RAF-based sync with word timing data |

## Starter Template Evaluation

### Primary Technology Domain

**Browser Extension (Chrome MV3)** - PRD and research documents validated WXT as the extension framework choice.

### Starter Options Considered

| Option | Pros | Cons |
|--------|------|------|
| **WXT vanilla (React template)** | Official, minimal, WXT 0.20.x, no bloat | Need to add Tailwind manually if desired |
| **wxt-react-shadcn-tailwindcss** | Pre-configured Tailwind + shadcn, dark mode ready | Community-maintained, might lag behind WXT releases |
| **Manual from scratch** | Full control | Unnecessary for well-documented framework |

### Selected Starter: WXT React Template (Official)

**Rationale:**
1. UI is minimal - floating mini-player + popup settings. No need for full component library.
2. Content script UI lives in Shadow DOM - isolated from global styles.
3. Official template keeps project on latest WXT version.
4. Tailwind is a quick addition later if needed.

**Initialization Command:**

```bash
bunx wxt@latest init simplereader
# Select: React template, Bun as package manager when prompted
cd simplereader
bun install
```

**Critical: Add CSP for WASM in wxt.config.ts:**

```typescript
export default defineConfig({
  manifest: {
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
    }
  }
});
```

### Architectural Decisions Provided by Starter

| Decision | What WXT Provides |
|----------|-------------------|
| **Language & Runtime** | TypeScript by default, ESM modules |
| **Build Tooling** | Vite for blazing fast HMR, automatic manifest generation |
| **Project Structure** | Entrypoints-based organization (background/, content/, popup/, options/) |
| **Browser Targeting** | Multi-browser support from single codebase (Chrome first, Firefox/Safari later) |
| **Development Experience** | HMR for UI, fast reload for background/content scripts, auto-reload on manifest changes |

### What Must Be Added

| Component | Choice |
|-----------|--------|
| Offscreen document | Manual entrypoint in `src/entrypoints/offscreen/` |
| State management | Zustand + chrome.storage adapter |
| TTS engine | kokoro-js + Transformers.js in offscreen document |
| Shadow DOM player | React portal or manual injection |

**Note:** Project initialization using this command should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Message Protocol Design → Typed discriminated unions
- Content Extraction → Mozilla Readability
- Word Timing Strategy → Phoneme estimation with sentence reset
- Testing Strategy → Vitest unit + Playwright E2E

**Already Decided (By Starter/Research):**
- Extension Framework: WXT with React
- TTS Engine: Kokoro via offscreen document
- State Management: Zustand + chrome.storage
- Fallback Chain: WebGPU → WASM → Web Speech API

**Deferred Decisions (Post-MVP):**
- Firefox/Safari porting strategy
- Multi-language TTS support
- Audio export format

### Message Protocol Design

**Decision:** Typed message protocol using TypeScript discriminated unions

**Rationale:** Type safety, autocomplete, refactor-safe. No external dependencies.

**Implementation Pattern:**

```typescript
// types/messages.ts
type Message =
  | { type: 'TTS_GENERATE'; text: string; voice: string; speed: number }
  | { type: 'TTS_PROGRESS'; progress: number }
  | { type: 'TTS_CHUNK_READY'; audioData: ArrayBuffer; wordTimings: WordTiming[] }
  | { type: 'TTS_COMPLETE' }
  | { type: 'TTS_ERROR'; error: string }
  | { type: 'PLAYBACK_CONTROL'; action: 'play' | 'pause' | 'stop' }
  | { type: 'HIGHLIGHT_WORD'; index: number }
  | { type: 'HIGHLIGHT_RESET' };

interface WordTiming {
  word: string;
  startTime: number;
  endTime: number;
  index: number;
}
```

**Affects:** All extension contexts (Service Worker, Offscreen, Content Script, Popup)

### Content Extraction

**Decision:** Mozilla Readability library

**Rationale:** Battle-tested in Firefox Reader View, handles edge cases (tables, code blocks, navigation removal) that would take significant effort to replicate.

**Version:** @mozilla/readability (latest stable)

**Implementation Notes:**
- Clone document before parsing (Readability mutates DOM)
- Fallback to selected text if Readability fails
- Post-process tables for row-by-row reading

**Affects:** Content Script

### Word Timing Strategy

**Decision:** Phoneme-weighted duration estimation with sentence boundary reset

**Rationale:** ~90% accuracy is acceptable for MVP. Sentence reset prevents drift accumulation on long articles. Forced alignment is overkill.

**Implementation Pattern:**
- Calculate word duration from phoneme counts
- Track cumulative time within sentence
- Reset timing at sentence boundaries (., !, ?)
- Use requestAnimationFrame for highlight updates

**Affects:** Offscreen Document (timing calculation), Content Script (highlighting)

### Testing Strategy

**Decision:** Vitest for unit tests + Playwright for critical path E2E

**Rationale:** Vitest is Vite-native and fast. Playwright supports Chrome extension testing. Focus E2E on critical user journey.

**Unit Test Coverage:**
- Message protocol serialization/deserialization
- Content extraction logic
- Word timing calculations
- State management actions

**E2E Critical Path:**
- Install extension → Navigate to article → Click play → Audio plays with highlighting

**Deferred Testing:**
- Visual regression testing
- Cross-browser E2E (Firefox, Safari)
- Performance benchmarks

**Affects:** All components

### Build & Distribution

**Decision:** Bun + manual Chrome Web Store upload

**Rationale:** Solo project doesn't need CI/CD complexity. Bun is fast and modern.

**Build Process:**

```bash
bun run build           # Production build
bun run build --zip     # Create .zip for Web Store upload
```

**Version Strategy:** Standard semver, increment before each Web Store submission

**Affects:** Development workflow, release process

### Decision Impact Analysis

**Implementation Sequence:**
1. Project initialization (WXT + React)
2. Message protocol types
3. Offscreen document + TTS engine integration
4. Content extraction with Readability
5. Word highlighting with timing sync
6. Floating player UI
7. Settings/preferences
8. Testing suite
9. Chrome Web Store submission

**Cross-Component Dependencies:**

```
┌─────────────────────────────────────────────────────────────┐
│ Message Protocol (types/messages.ts)                        │
│ └─ Used by ALL contexts                                     │
└─────────────────────────────────────────────────────────────┘
           │
    ┌──────┴──────┬────────────────┬─────────────────┐
    ▼             ▼                ▼                 ▼
┌────────┐  ┌──────────┐  ┌──────────────┐  ┌────────────┐
│Service │  │ Offscreen│  │Content Script│  │   Popup    │
│Worker  │  │ Document │  │              │  │            │
├────────┤  ├──────────┤  ├──────────────┤  ├────────────┤
│ Router │  │ Kokoro   │  │ Readability  │  │ Settings   │
│ State  │  │ Timing   │  │ Highlighter  │  │ Voice      │
│ Cmds   │  │ Audio    │  │ Player UI    │  │ Speed      │
└────────┘  └──────────┘  └──────────────┘  └────────────┘
```

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 6 areas where AI agents could make different choices

| Conflict Area | Risk | Pattern Established |
|---------------|------|---------------------|
| Message type naming | System breaks if inconsistent | SCREAMING_SNAKE_CASE with context prefix |
| Storage key naming | Data loss or conflicts | camelCase, grouped by feature |
| File organization | Confusion, duplicate code | WXT entrypoints + lib/ for shared |
| Component/file naming | Import confusion | PascalCase components, kebab-case CSS |
| Error handling | Silent failures | Typed ExtensionError with context |
| CSS class naming | Style leaks in Shadow DOM | sr- prefix with BEM-ish structure |

### Naming Patterns

#### Message Type Naming

**Pattern:** `SCREAMING_SNAKE_CASE` with context prefix

```typescript
// CORRECT
type Message =
  | { type: 'TTS_GENERATE'; ... }      // TTS context
  | { type: 'TTS_PROGRESS'; ... }      // TTS context
  | { type: 'PLAYBACK_PLAY'; ... }     // Playback context
  | { type: 'HIGHLIGHT_WORD'; ... }    // Highlight context

// WRONG
| { type: 'ttsGenerate'; ... }         // camelCase
| { type: 'Generate'; ... }            // No context prefix
| { type: 'START'; ... }               // Ambiguous
```

#### Storage Key Naming

**Pattern:** `camelCase`, grouped by feature, defined as const object

```typescript
// CORRECT
const STORAGE_KEYS = {
  // User preferences (synced)
  preferredVoice: 'preferredVoice',
  preferredSpeed: 'preferredSpeed',
  highlightColor: 'highlightColor',

  // Session state (local only)
  lastPlayedUrl: 'lastPlayedUrl',
  modelLoaded: 'modelLoaded',
} as const;

// WRONG
'preferred_voice'    // snake_case
'PREFERRED_VOICE'    // SCREAMING_SNAKE
'voice'              // Too generic
```

#### Component & File Naming

**Pattern:** PascalCase components, kebab-case CSS, co-located tests

```
# CORRECT
components/
├── MiniPlayer.tsx         # Component (PascalCase)
├── MiniPlayer.test.tsx    # Co-located test
└── mini-player.css        # Styles (kebab-case)

# WRONG
├── mini-player.tsx        # kebab-case component
├── miniPlayer.tsx         # camelCase component
└── MiniPlayer.css         # PascalCase CSS
```

### Structure Patterns

#### Project Organization

**Pattern:** WXT entrypoints convention + `lib/` for shared code

```
src/
├── entrypoints/           # WXT convention (mandatory)
│   ├── background/        # Service worker
│   │   └── index.ts
│   ├── content/           # Content script
│   │   ├── index.ts
│   │   ├── highlighter.ts
│   │   └── player/        # Floating player UI
│   ├── offscreen/         # TTS engine
│   │   ├── index.html
│   │   ├── index.ts
│   │   └── tts-engine.ts
│   └── popup/             # Settings popup
│       ├── index.html
│       ├── App.tsx
│       └── main.tsx
├── lib/                   # Shared logic (NOT in entrypoints)
│   ├── messages.ts        # Message types + send helpers
│   ├── storage.ts         # Storage keys + get/set helpers
│   ├── tts/               # TTS-related utilities
│   └── highlighting/      # Highlighting utilities
├── components/            # Shared React components
├── hooks/                 # Shared React hooks
└── types/                 # TypeScript type definitions
```

### Format Patterns

#### Error Handling

**Pattern:** Typed `ExtensionError` with context and recoverability

```typescript
interface ExtensionError {
  code: string;           // Machine-readable: 'TTS_MODEL_LOAD_FAILED'
  message: string;        // Human-readable: 'Failed to load voice model'
  context: 'offscreen' | 'content' | 'background' | 'popup';
  recoverable: boolean;   // Can user retry?
  originalError?: unknown; // For debugging
}

// Propagate via message protocol
| { type: 'TTS_ERROR'; error: ExtensionError }
| { type: 'CONTENT_ERROR'; error: ExtensionError }
```

#### CSS Class Naming (Shadow DOM)

**Pattern:** `sr-` prefix (SimpleReader) with BEM-ish structure

```css
/* CORRECT */
.sr-player { }                    /* Block */
.sr-player__button { }            /* Element */
.sr-player__button--active { }    /* Modifier */
.sr-word { }
.sr-word--current { }
.sr-word--spoken { }

/* WRONG */
.player { }           /* No prefix - could conflict */
.miniPlayer { }       /* camelCase */
.active { }           /* Too generic */
```

### Enforcement Guidelines

**All AI Agents MUST:**

1. Use message types from `lib/messages.ts` - never create new types inline
2. Use storage keys from `lib/storage.ts` - never use string literals directly
3. Place shared code in `lib/` - never duplicate logic across entrypoints
4. Use `sr-` prefix for all CSS classes in content script
5. Propagate errors as typed `ExtensionError` objects
6. Co-locate tests with the code they test (*.test.ts)

**Pattern Verification:**

- TypeScript compiler enforces message type usage
- ESLint rule can enforce storage key constants (optional)
- PR review checklist includes pattern compliance

### Anti-Patterns to Avoid

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Inline message types | Type safety lost, refactoring breaks | Import from `lib/messages.ts` |
| String literal storage keys | Typos cause silent failures | Use `STORAGE_KEYS.preferredVoice` |
| Logic in entrypoints | Duplicated, hard to test | Extract to `lib/`, import |
| Generic CSS classes | Style leaks in Shadow DOM | Always use `sr-` prefix |
| Swallowed errors | Silent failures, hard to debug | Propagate as `ExtensionError` |

## Project Structure & Boundaries

### Complete Project Directory Structure

```
simplereader/
├── README.md
├── package.json
├── bun.lockb                        # Bun lock file
├── wxt.config.ts                    # WXT configuration
├── tsconfig.json
├── vitest.config.ts                 # Vitest configuration
├── playwright.config.ts             # E2E test configuration
├── .env.example
├── .gitignore
│
├── src/
│   ├── entrypoints/                 # WXT entrypoints (mandatory structure)
│   │   │
│   │   ├── background/              # Service Worker
│   │   │   └── index.ts             # Message router, keyboard shortcuts, state coordination
│   │   │
│   │   ├── content/                 # Content Script (injected into pages)
│   │   │   ├── index.ts             # Main entry, initializes highlighter + player
│   │   │   ├── index.css            # Content script styles (sr- prefixed)
│   │   │   ├── highlighter.ts       # Word tokenization + highlighting logic
│   │   │   ├── highlighter.test.ts  # Co-located tests
│   │   │   ├── extractor.ts         # Readability wrapper, content extraction
│   │   │   ├── extractor.test.ts
│   │   │   └── player/              # Floating mini-player (Shadow DOM)
│   │   │       ├── MiniPlayer.tsx
│   │   │       ├── MiniPlayer.test.tsx
│   │   │       ├── mini-player.css
│   │   │       ├── Controls.tsx
│   │   │       └── ProgressBar.tsx
│   │   │
│   │   ├── offscreen/               # Offscreen Document (TTS engine)
│   │   │   ├── index.html           # Offscreen document HTML shell
│   │   │   ├── index.ts             # Message handler, TTS orchestration
│   │   │   ├── tts-engine.ts        # Kokoro wrapper, model loading
│   │   │   ├── tts-engine.test.ts
│   │   │   ├── audio-player.ts      # Web Audio API streaming
│   │   │   ├── word-timing.ts       # Phoneme → word timing calculations
│   │   │   ├── word-timing.test.ts
│   │   │   └── fallback.ts          # Web Speech API fallback
│   │   │
│   │   └── popup/                   # Extension Popup (settings UI)
│   │       ├── index.html
│   │       ├── main.tsx             # React entry point
│   │       ├── App.tsx              # Main popup component
│   │       ├── App.css
│   │       └── components/
│   │           ├── VoiceSelector.tsx
│   │           ├── SpeedSlider.tsx
│   │           ├── ColorPicker.tsx
│   │           └── ModelStatus.tsx
│   │
│   ├── lib/                         # Shared logic (pattern-compliant)
│   │   ├── messages.ts              # Message types + send helpers
│   │   ├── messages.test.ts
│   │   ├── storage.ts               # STORAGE_KEYS + get/set helpers
│   │   ├── storage.test.ts
│   │   ├── errors.ts                # ExtensionError type + helpers
│   │   └── constants.ts             # App-wide constants (voices, speeds, etc.)
│   │
│   ├── components/                  # Shared React components
│   │   └── Button.tsx               # If any shared UI needed
│   │
│   ├── hooks/                       # Shared React hooks
│   │   ├── useStorage.ts            # chrome.storage.sync hook
│   │   └── usePlaybackState.ts      # Playback state subscription
│   │
│   └── types/                       # TypeScript types
│       ├── index.ts                 # Re-exports
│       ├── tts.ts                   # TTS-related types (WordTiming, etc.)
│       └── chrome.d.ts              # Chrome API augmentations if needed
│
├── tests/                           # E2E tests (Playwright)
│   ├── fixtures/
│   │   └── test-article.html        # Sample article for testing
│   ├── critical-path.spec.ts        # Install → navigate → play → highlight
│   └── utils/
│       └── extension-helpers.ts     # Playwright extension utilities
│
├── public/                          # Static assets
│   ├── icon-16.png
│   ├── icon-32.png
│   ├── icon-48.png
│   └── icon-128.png
│
└── .output/                         # Build output (git-ignored)
    └── chrome-mv3/                  # Production Chrome build
```

### Architectural Boundaries

**Message Boundaries (Context Isolation):**

```
┌─────────────┐     messages.ts     ┌─────────────┐
│   Content   │◄───────────────────►│  Background │
│   Script    │                     │  (Service   │
│             │                     │   Worker)   │
└─────────────┘                     └─────────────┘
       ▲                                   ▲
       │ messages.ts                       │ messages.ts
       ▼                                   ▼
┌─────────────┐                     ┌─────────────┐
│   Popup     │                     │  Offscreen  │
│   (React)   │                     │  (TTS)      │
└─────────────┘                     └─────────────┘
```

All communication MUST use typed messages from `lib/messages.ts`.

**State Boundaries:**

| State Type | Location | Scope |
|------------|----------|-------|
| User preferences | `chrome.storage.sync` | Cross-device |
| Session state | `chrome.storage.local` | Device-local |
| Playback state | In-memory (Content Script) | Tab-local |
| Model state | In-memory (Offscreen) | Extension-local |

**Shadow DOM Boundary:**

```
┌─────────────────────────────────────────────────────────────┐
│ Host Page DOM                                               │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ #simplereader-root (Shadow DOM)                     │   │
│   │                                                     │   │
│   │   ┌─────────────────────────────────────────────┐   │   │
│   │   │ MiniPlayer (style-isolated)                 │   │   │
│   │   │ - sr-player, sr-player__button, etc.        │   │   │
│   │   └─────────────────────────────────────────────┘   │   │
│   │                                                     │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
│   <article> (highlighted text)                              │
│   - sr-word, sr-word--current, sr-word--spoken              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Requirements to Structure Mapping

| PRD Requirement | Implementation Location |
|-----------------|------------------------|
| **FR1-6: TTS Engine** | `src/entrypoints/offscreen/tts-engine.ts`, `fallback.ts` |
| **FR7-12: Content Extraction** | `src/entrypoints/content/extractor.ts` |
| **FR13-17: Word Highlighting** | `src/entrypoints/content/highlighter.ts` |
| **FR18-24: Playback Control** | `src/entrypoints/content/player/`, `background/index.ts` |
| **FR25-28: User Settings** | `src/entrypoints/popup/`, `src/lib/storage.ts` |
| **FR29-32: Model Management** | `src/entrypoints/offscreen/tts-engine.ts` |
| **FR33-36: Accessibility** | All UI components (ARIA in player + popup) |

### Integration Points

**Internal Communication Flow:**

```
User clicks play
    │
    ▼
[Content Script]
    │ 1. Extract text via Readability
    │ 2. Tokenize words
    │ 3. Send TTS_GENERATE message
    ▼
[Background SW] ──routes to──► [Offscreen Document]
                                    │
                                    │ 4. Load Kokoro model (if not cached)
                                    │ 5. Generate audio + word timings
                                    │ 6. Send TTS_CHUNK_READY messages
                                    ▼
[Background SW] ◄──routes from─── [Offscreen Document]
    │
    │ 7. Forward to Content Script
    ▼
[Content Script]
    │ 8. Play audio
    │ 9. Highlight words via RAF sync
    ▼
User sees/hears content
```

**External Dependencies:**

| Dependency | Integration Point | Purpose |
|------------|------------------|---------|
| kokoro-js | `offscreen/tts-engine.ts` | TTS model inference |
| Transformers.js | via kokoro-js | Model loading/caching |
| @mozilla/readability | `content/extractor.ts` | Content extraction |
| Zustand | `lib/storage.ts` | State management |

### Development Workflow Integration

**Development Server:**

```bash
bun run dev              # Starts WXT dev server, opens Chrome with extension
bun run dev:firefox      # For Firefox development (post-MVP)
```

**Testing:**

```bash
bun test                 # Vitest unit tests (watch mode)
bun test:run             # Vitest single run
bun run test:e2e         # Playwright E2E tests
```

**Build:**

```bash
bun run build            # Production build → .output/chrome-mv3/
bun run build --zip      # Create .zip for Chrome Web Store
```

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
All technology choices validated as compatible:
- WXT framework fully supports offscreen document entrypoints
- Kokoro TTS + Transformers.js handle the fallback chain internally
- Zustand integrates with chrome.storage via standard adapter patterns
- Vitest and Playwright are both compatible with the Vite-based WXT build system
- Bun works as package manager with WXT (init via npx workaround)

**Pattern Consistency:**
Implementation patterns align with technology choices:
- TypeScript discriminated unions leverage WXT's TypeScript-first approach
- Zustand patterns work correctly across extension contexts
- BEM-ish CSS naming is appropriate for Shadow DOM isolation

**Structure Alignment:**
Project structure supports all architectural decisions:
- WXT entrypoints provide clear separation between extension contexts
- lib/ directory enables code sharing without duplication
- Test co-location aligns with Vitest best practices

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:**
All 36 functional requirements mapped to specific implementation locations:
- TTS Engine (FR1-6) → offscreen/tts-engine.ts, fallback.ts
- Content Extraction (FR7-12) → content/extractor.ts
- Word Highlighting (FR13-17) → content/highlighter.ts
- Playback Control (FR18-24) → content/player/, background/index.ts
- User Settings (FR25-28) → popup/, lib/storage.ts
- Model Management (FR29-32) → offscreen/tts-engine.ts
- Accessibility (FR33-36) → All UI components (ARIA required)

**Non-Functional Requirements Coverage:**
All 20 NFRs addressed architecturally:
- Performance: Offscreen isolation, RAF-based highlighting
- Privacy: Zero external calls by architecture design
- Accessibility: WCAG 2.1 AA patterns documented
- Reliability: Three-tier fallback chain, typed error handling

### Implementation Readiness Validation ✅

**Decision Completeness:**
- All critical technology decisions documented with rationale
- Implementation patterns include concrete code examples
- Enforcement guidelines provide clear rules for AI agents

**Structure Completeness:**
- Complete project tree with 40+ files defined
- Every file has documented purpose and responsibility
- Integration points mapped with ASCII diagrams

**Pattern Completeness:**
- 6 critical conflict points identified and addressed
- Naming conventions cover all code artifacts
- Process patterns (errors, loading) fully specified

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed (Low-Medium)
- [x] Technical constraints identified (MV3, WebGPU, model size)
- [x] Cross-cutting concerns mapped (messaging, state, errors)

**✅ Architectural Decisions**
- [x] Critical decisions documented with rationale
- [x] Technology stack fully specified (WXT, React, Kokoro, Zustand, Bun)
- [x] Integration patterns defined (typed messages, chrome.storage)
- [x] Performance considerations addressed (offscreen isolation, RAF)

**✅ Implementation Patterns**
- [x] Naming conventions established (messages, storage, CSS)
- [x] Structure patterns defined (WXT entrypoints + lib/)
- [x] Communication patterns specified (typed message protocol)
- [x] Process patterns documented (error handling, fallbacks)

**✅ Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established (Shadow DOM, context isolation)
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**
1. Clear separation of concerns via extension context isolation
2. Type-safe communication prevents runtime errors
3. Privacy-by-architecture eliminates data leak vectors
4. Three-tier TTS fallback ensures broad device compatibility
5. Patterns are concrete with code examples, not abstract

**Areas for Future Enhancement:**
- Firefox/Safari porting (post-MVP)
- Multi-language TTS support
- CI/CD automation
- ESLint rules for pattern enforcement

### Implementation Handoff

**AI Agent Guidelines:**
1. Follow all architectural decisions exactly as documented
2. Use implementation patterns consistently across all components
3. Respect project structure and boundaries
4. Import from lib/ - never duplicate shared logic
5. Use sr- prefix for all CSS in content script
6. Propagate errors as typed ExtensionError objects

**First Implementation Step:**

```bash
npx wxt@latest init simplereader
# Select: React template, Bun as package manager
cd simplereader
bun install
```

Then create `lib/messages.ts` and `lib/storage.ts` as the shared foundation.

## Architecture Completion Summary

### Workflow Completion

**Architecture Decision Workflow:** COMPLETED ✅
**Total Steps Completed:** 8
**Date Completed:** 2025-12-11
**Document Location:** docs/architecture.md

### Final Architecture Deliverables

**Complete Architecture Document**
- All architectural decisions documented with specific versions
- Implementation patterns ensuring AI agent consistency
- Complete project structure with all files and directories
- Requirements to architecture mapping
- Validation confirming coherence and completeness

**Implementation Ready Foundation**
- 10+ architectural decisions made
- 6 implementation patterns defined
- 5 architectural components specified
- 56 requirements (36 FR + 20 NFR) fully supported

**AI Agent Implementation Guide**
- Technology stack: WXT, React, Kokoro TTS, Zustand, Bun
- Consistency rules that prevent implementation conflicts
- Project structure with clear boundaries
- Integration patterns and communication standards

### Development Sequence

1. Initialize project using documented starter template
2. Set up development environment per architecture
3. Create `lib/messages.ts` and `lib/storage.ts` foundation
4. Implement core architectural components
5. Build features following established patterns
6. Maintain consistency with documented rules

### Quality Assurance Checklist

**✅ Architecture Coherence**
- [x] All decisions work together without conflicts
- [x] Technology choices are compatible
- [x] Patterns support the architectural decisions
- [x] Structure aligns with all choices

**✅ Requirements Coverage**
- [x] All functional requirements are supported
- [x] All non-functional requirements are addressed
- [x] Cross-cutting concerns are handled
- [x] Integration points are defined

**✅ Implementation Readiness**
- [x] Decisions are specific and actionable
- [x] Patterns prevent agent conflicts
- [x] Structure is complete and unambiguous
- [x] Examples are provided for clarity

---

**Architecture Status:** READY FOR IMPLEMENTATION ✅

**Next Phase:** Begin implementation using the architectural decisions and patterns documented herein.

**Document Maintenance:** Update this architecture when major technical decisions are made during implementation.

