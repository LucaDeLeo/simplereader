---
project_name: 'simplereader'
user_name: 'Luca'
date: '2025-12-11'
sections_completed: ['technology_stack', 'critical_rules', 'anti_patterns', 'quick_reference']
status: 'complete'
validated: '2025-12-11'
---

# Project Context for AI Agents

_Critical rules for implementing SimpleReader - a Chrome extension for TTS with word highlighting._

---

## Technology Stack

| Technology | Version | Notes |
|------------|---------|-------|
| WXT | 0.20.x | Extension framework |
| React | 18.x | For popup and content script UI |
| TypeScript | 5.x | Strict mode enabled |
| Bun | latest | Package manager and runtime (preferred) |
| Vitest | latest | Unit tests via WxtVitest plugin |
| Playwright | latest | E2E only for critical path |
| Zustand | latest | State via chrome.storage adapter |
| kokoro-js | latest | TTS in offscreen document only (requires WASM CSP) |
| @mozilla/readability | latest | Clone DOM before parsing |

---

## Manifest Configuration (CRITICAL)

### Content Security Policy for WASM

**Required in wxt.config.ts for kokoro-js to work:**

```typescript
export default defineConfig({
  manifest: {
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
    }
  }
});
```

Without this, WebAssembly-based TTS will fail silently.

---

## Critical Rules

### Extension Architecture

- **Offscreen document is REQUIRED** for TTS - service workers cannot run WebGPU/WASM
- **All cross-context communication** via typed messages from `lib/messages.ts`
- **Never import extension-specific code** between contexts - only from `lib/`
- **Shadow DOM required** for floating player - prevents style leaks

### Offscreen Document Lifecycle

```typescript
// ALWAYS check if offscreen document exists before creating
const contexts = await chrome.runtime.getContexts({
  contextTypes: ['OFFSCREEN_DOCUMENT']
});

if (contexts.length === 0) {
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'TTS audio generation and playback'
  });
}
```

- Chrome closes offscreen docs after ~30s of audio inactivity
- Always check with `getContexts()` before creating (Chrome 116+)
- Keep audio playing or recreate document as needed

### Message Protocol (MUST FOLLOW)

```typescript
// ALWAYS use SCREAMING_SNAKE_CASE with context prefix
type: 'TTS_GENERATE'     // Correct
type: 'ttsGenerate'      // Wrong
type: 'generate'         // Wrong - no prefix
```

- Message types ONLY in `lib/messages.ts` - never inline
- All handlers must use discriminated union narrowing

### Storage Keys (MUST FOLLOW)

```typescript
// ALWAYS use STORAGE_KEYS constant, never string literals
chrome.storage.sync.get([STORAGE_KEYS.preferredVoice])  // Correct
chrome.storage.sync.get(['preferredVoice'])             // Wrong
```

- Keys defined in `lib/storage.ts` only
- Sync storage for user prefs, local for session state

### CSS in Content Script (MUST FOLLOW)

```css
/* ALWAYS prefix with sr- to prevent conflicts */
.sr-player { }            /* Correct */
.sr-player__button { }    /* Correct */
.player { }               /* Will conflict with host page */
```

### File Organization

- `src/entrypoints/` - WXT convention, one per context
- `src/lib/` - Shared logic only, no React components
- `src/components/` - Shared React components
- Tests co-located: `foo.ts` -> `foo.test.ts`

### Testing Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing';

export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    mockReset: true,
    restoreMocks: true,
  }
});
```

- Unit tests: Vitest with WxtVitest plugin, test business logic
- E2E: Playwright, ONLY test critical path (install -> play -> highlight)
- No visual regression tests in MVP

### Privacy (NON-NEGOTIABLE)

- **Zero external network calls** - all processing local
- **No analytics or telemetry** - none
- **Minimal permissions** - only what's required for core function
- Model cached in IndexedDB via Transformers.js (automatic, no config needed)

### Performance Targets

- Audio start: < 2s after play
- Highlighting: 60fps via requestAnimationFrame
- Peak memory: < 500MB
- Main thread: never blocked
- Use `scheduler.yield()` for cooperative scheduling in long operations

---

## Anti-Patterns to Avoid

| Don't | Do Instead |
|-------|------------|
| Import chrome APIs in lib/ | Pass as parameters or use dependency injection |
| Create message types inline | Import from lib/messages.ts |
| Use string storage keys | Use STORAGE_KEYS.keyName |
| Put logic in entrypoint index.ts | Extract to lib/ and import |
| Use generic CSS classes | Always prefix with sr- |
| Swallow errors silently | Propagate as ExtensionError |
| Fetch from external URLs | All resources bundled or cached locally |
| Create offscreen doc without checking | Use getContexts() first |
| Skip CSP config for WASM | Add wasm-unsafe-eval to manifest |

---

## Quick Reference

**Init project:**

```bash
bunx wxt@latest init simplereader
# Select: React template, Bun as package manager
cd simplereader && bun install
```

**Development:**

```bash
bun run dev          # Dev server with HMR
bun test             # Unit tests (Vitest)
bun run build --zip  # Production build for Chrome Web Store
```

**First files to create:**

1. `wxt.config.ts` - Add CSP for WASM (critical!)
2. `lib/messages.ts` - typed message protocol
3. `lib/storage.ts` - storage key constants
4. `lib/errors.ts` - ExtensionError type

**Verify WASM works:**

After init, test that CSP is correctly configured by loading kokoro-js in the offscreen document. If it fails silently, check the CSP configuration.
