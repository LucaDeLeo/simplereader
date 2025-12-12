# Story 1.2: Configure Manifest for WASM and Required Permissions

**Epic:** 1 - Project Setup & Architecture Foundation
**Status:** ready-for-dev
**Priority:** P0 - Critical Path
**Points:** 2

---

## User Story

**As a** developer,
**I want** the extension manifest configured with correct CSP and permissions,
**So that** Kokoro TTS can run WebAssembly and the extension can access required APIs.

---

## Background & Context

SimpleReader uses Kokoro TTS which runs via WebAssembly (WASM) in an offscreen document. Chrome's Manifest V3 security model blocks WASM execution by default. Without the proper Content Security Policy (CSP), the TTS engine will fail silently.

This story configures:
1. **CSP for WASM** - Required for kokoro-js to execute WebAssembly
2. **Permissions** - Minimal permissions needed for core functionality
3. **Offscreen API declaration** - Required for the TTS offscreen document

**Key Architecture References:**
- ARCH-2: Add CSP for WASM in `wxt.config.ts`: `wasm-unsafe-eval` required for kokoro-js
- ARCH-4: Offscreen document REQUIRED for TTS - service workers cannot run WebGPU/WASM
- NFR8: Extension requests only minimal required permissions

**Why This Matters:**
Without `wasm-unsafe-eval`, any attempt to load the Kokoro TTS model will fail silently. This is the #1 reason WASM-based extensions break in MV3.

---

## Acceptance Criteria

### AC1: Content Security Policy for WASM
**Given** the initialized WXT project from Story 1.1
**When** I configure the CSP in `wxt.config.ts`
**Then:**
- [ ] `wxt.config.ts` includes `content_security_policy` configuration
- [ ] Extension pages CSP includes `'wasm-unsafe-eval'` directive
- [ ] CSP follows format: `"script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"`
- [ ] Extension still loads successfully in Chrome without CSP errors

### AC2: Required Permissions
**Given** the CSP is configured
**When** I add required permissions to the manifest
**Then:**
- [ ] `activeTab` permission is declared (for content script injection)
- [ ] `storage` permission is declared (for user preferences)
- [ ] `offscreen` permission is declared (for TTS offscreen document)
- [ ] No unnecessary permissions are requested (privacy requirement NFR8)

### AC3: Build Verification
**Given** the manifest configuration is complete
**When** I run `bun run build`
**Then:**
- [ ] Build completes without errors
- [ ] Generated `manifest.json` in `.output/chrome-mv3/` contains correct CSP
- [ ] Generated `manifest.json` contains all declared permissions
- [ ] Extension can be loaded in Chrome via "Load unpacked"

### AC4: WASM Execution Test
**Given** the extension is loaded with new CSP
**When** I open the extension's background service worker DevTools
**Then:**
- [ ] No CSP violation errors appear in console
- [ ] Console command `WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0]))` returns `true`
- [ ] This confirms WASM can be instantiated in extension context

---

## Technical Details

### WXT Configuration Update

Update `wxt.config.ts` with the following configuration:

```typescript
import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    // Content Security Policy - REQUIRED for Kokoro TTS (WebAssembly)
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
    },
    // Minimal permissions per NFR8
    permissions: [
      'activeTab',  // Access current tab for content extraction
      'storage',    // Persist user preferences
      'offscreen',  // Create offscreen document for TTS
    ],
  },
});
```

### Generated Manifest Structure

After build, `.output/chrome-mv3/manifest.json` should contain:

```json
{
  "manifest_version": 3,
  "name": "SimpleReader",
  "version": "0.0.0",
  "content_security_policy": {
    "extension_pages": "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
  },
  "permissions": [
    "activeTab",
    "storage",
    "offscreen"
  ]
}
```

### Permission Justifications

| Permission | Purpose | Privacy Impact |
|------------|---------|----------------|
| `activeTab` | Read page content when user activates extension | Low - only active tab, user-triggered |
| `storage` | Save user preferences (voice, speed, highlight color) | None - local only |
| `offscreen` | Create document for WASM TTS processing | None - internal only |

**Permissions NOT requested (by design):**
- `tabs` - Not needed; `activeTab` is sufficient
- `<all_urls>` - Not needed; content scripts use `activeTab`
- `webRequest` - Not needed; no network interception
- `cookies` - Not needed; no authentication

### CSP Directive Breakdown

```
script-src 'self' 'wasm-unsafe-eval'; object-src 'self';
```

| Directive | Value | Purpose |
|-----------|-------|---------|
| `script-src` | `'self'` | Only load scripts from extension package |
| `script-src` | `'wasm-unsafe-eval'` | Allow WebAssembly compilation and execution |
| `object-src` | `'self'` | Only allow plugins/objects from extension package |

**Note:** `'wasm-unsafe-eval'` is specifically for WASM and is safer than `'unsafe-eval'` which would allow arbitrary JavaScript eval().

---

## Implementation Tasks

### Task 1: Update wxt.config.ts (AC: 1, 2)
- [ ] Open `wxt.config.ts`
- [ ] Add `manifest` configuration object
- [ ] Add `content_security_policy` with `wasm-unsafe-eval`
- [ ] Add `permissions` array with `activeTab`, `storage`, `offscreen`
- [ ] Verify TypeScript compilation passes

### Task 2: Verify Development Build (AC: 3)
- [ ] Run `bun run dev`
- [ ] Confirm extension loads in Chrome
- [ ] Check Chrome DevTools console for CSP errors
- [ ] Verify no permission warnings in chrome://extensions

### Task 3: Verify Production Build (AC: 3)
- [ ] Run `bun run build`
- [ ] Inspect `.output/chrome-mv3/manifest.json`
- [ ] Confirm CSP is present and correct
- [ ] Confirm all permissions are listed
- [ ] Load built extension via "Load unpacked" to verify

### Task 4: Test WASM Capability (AC: 4)
- [ ] Open extension's service worker in DevTools (chrome://extensions > "service worker" link)
- [ ] Run in console: `WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0]))`
- [ ] Confirm result is `true`
- [ ] Run: `new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0]))`
- [ ] Confirm no CSP error is thrown

---

## Testing Checklist

### Manual Testing
- [ ] `bun run dev` starts without manifest errors
- [ ] Extension appears in Chrome extensions list without warnings
- [ ] No CSP errors in extension console
- [ ] `bun run build` completes successfully
- [ ] Built manifest.json contains correct CSP
- [ ] Built manifest.json contains all three permissions
- [ ] WASM validation test passes in service worker console

### Verification Commands
```bash
# Start dev server
bun run dev

# Build for production
bun run build

# Inspect generated manifest
cat .output/chrome-mv3/manifest.json | jq '.content_security_policy'
cat .output/chrome-mv3/manifest.json | jq '.permissions'
```

### WASM Test Script (run in service worker console)
```javascript
// Test 1: WASM validation
console.log('WASM validate:', WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0])));

// Test 2: WASM module creation
try {
  new WebAssembly.Module(new Uint8Array([0,97,115,109,1,0,0,0]));
  console.log('WASM module creation: SUCCESS');
} catch (e) {
  console.error('WASM module creation: FAILED', e);
}
```

---

## Definition of Done

- [ ] `wxt.config.ts` contains CSP with `wasm-unsafe-eval`
- [ ] `wxt.config.ts` contains permissions: `activeTab`, `storage`, `offscreen`
- [ ] `bun run dev` works without CSP errors
- [ ] `bun run build` generates correct manifest.json
- [ ] WASM validation passes in extension context
- [ ] No unnecessary permissions requested
- [ ] Code reviewed and approved

---

## Dependencies

**Depends on:** Story 1.1 (WXT project initialization) - COMPLETE
**Blocks:** Story 2.2 (Offscreen Document Setup), Story 2.3 (Kokoro TTS Integration)

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| CSP syntax error breaks extension | High | Test in dev mode before committing |
| Missing permission causes silent failures | Medium | Document each permission's purpose |
| Chrome updates CSP requirements | Low | Monitor Chrome release notes |

---

## Dev Notes

### Common Pitfalls

1. **Trailing semicolon in CSP**: The CSP string should end with a semicolon after each directive. Some examples omit this but it's required for proper parsing.

2. **Quote marks**: Directives like `'self'` and `'wasm-unsafe-eval'` MUST be quoted within the string.

3. **Object syntax for MV3**: In Manifest V3, `content_security_policy` is an object with `extension_pages` key, not a plain string.

### Why Not sandbox CSP?

Manifest V3 has two CSP contexts:
- `extension_pages`: For popup, options, offscreen documents
- `sandbox`: For sandboxed pages (not used in SimpleReader)

We only configure `extension_pages` because that's where the TTS offscreen document runs.

### Project Structure Notes

This story only modifies `wxt.config.ts`. No new files are created. The file structure remains:

```
simplereader/
├── wxt.config.ts        # <- Modified in this story
├── package.json
├── entrypoints/
│   ├── background.ts
│   └── popup/
│       ├── App.tsx
│       ├── App.css
│       ├── index.html
│       └── main.tsx
└── ...
```

### References

- [Source: docs/architecture.md#Starter Template Evaluation] - CSP requirement
- [Source: docs/project_context.md#Manifest Configuration] - CSP configuration example
- [Source: docs/epics.md#Story 1.2] - Original story definition
- [Chrome MV3 CSP Documentation](https://developer.chrome.com/docs/extensions/mv3/manifest/content_security_policy/)
- [WXT Manifest Configuration](https://wxt.dev/guide/essentials/config/manifest)

---

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

### Completion Notes List

### File List

- `wxt.config.ts` - Updated with CSP and permissions
