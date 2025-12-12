# Story 1.1: Initialize WXT Project with React Template

**Epic:** 1 - Project Setup & Architecture Foundation
**Status:** review
**Priority:** P0 - Critical Path
**Points:** 3

---

## User Story

**As a** developer,
**I want** a properly initialized WXT project with React and Bun,
**So that** I have a working foundation to build the SimpleReader extension.

---

## Background & Context

This is the foundational story for SimpleReader - a Chrome extension that provides text-to-speech with word-level highlighting. The project uses WXT (Web Extension Tools) as the extension framework because it provides:

- Hot Module Replacement (HMR) during development
- Automatic manifest generation
- TypeScript-first approach
- Multi-browser support from a single codebase
- Entrypoint-based project structure

The architecture document specifies using the official WXT React template (not community starters) to stay on the latest WXT version and avoid unnecessary dependencies.

**Key Architecture Decisions:**
- Package Manager: Bun (per ARCH-21)
- Framework: WXT with React template
- TypeScript: Strict mode enabled
- No Tailwind/shadcn initially (UI is minimal - floating player + popup)

---

## Acceptance Criteria

### AC1: Project Scaffolding
**Given** an empty project directory
**When** I run `bunx wxt@latest init simplereader` and select React template with Bun
**Then:**
- [x] Project scaffolds with React template
- [x] `package.json` exists with WXT and React dependencies
- [x] `bun.lock` file is created (Bun 1.3+ uses text-based bun.lock instead of binary bun.lockb)
- [x] `tsconfig.json` exists with TypeScript configuration
- [x] `wxt.config.ts` exists with base configuration

### AC2: Development Server
**Given** the initialized project
**When** I run `bun run dev`
**Then:**
- [x] WXT development server starts successfully
- [x] Chrome opens with the extension loaded in developer mode
- [x] No errors appear in the terminal
- [x] No errors appear in Chrome DevTools console

### AC3: Popup UI
**Given** the extension is loaded in Chrome
**When** I click the extension icon
**Then:**
- [x] A popup window appears
- [x] The popup displays placeholder text (e.g., "SimpleReader" or default WXT text)
- [x] The popup renders without React errors

### AC4: Project Structure
**Given** the scaffolded project
**When** I examine the directory structure
**Then:**
- [x] `entrypoints/popup/` directory exists with React files (WXT 0.20+ uses `entrypoints/` not `src/entrypoints/`)
- [x] `entrypoints/background.ts` exists
- [x] `public/` directory exists for static assets (icons)
- [x] Structure follows WXT conventions

### AC5: Build Verification
**Given** the development setup works
**When** I run `bun run build`
**Then:**
- [x] Build completes without errors
- [x] `.output/chrome-mv3/` directory is created
- [x] `manifest.json` is generated in the output
- [x] The built extension can be loaded in Chrome via "Load unpacked"

---

## Technical Details

### WXT Initialization Command

```bash
# Navigate to parent directory
cd /Users/luca/dev

# Initialize WXT project (interactive)
bunx wxt@latest init simplereader

# When prompted:
# - Select: React template
# - Select: bun as package manager

# Navigate into project
cd simplereader

# Install dependencies
bun install
```

**Note:** If `bunx wxt@latest init` has issues, fall back to:
```bash
npx wxt@latest init simplereader
# Then select React and bun
```

### Expected Project Structure After Init

```
simplereader/
├── .gitignore
├── .wxt/                    # WXT generated files (gitignored)
├── bun.lockb
├── package.json
├── public/
│   └── icon/               # Extension icons
│       ├── 16.png
│       ├── 32.png
│       ├── 48.png
│       ├── 96.png
│       └── 128.png
├── src/
│   └── entrypoints/
│       ├── background.ts   # Service worker
│       └── popup/
│           ├── App.tsx     # React component
│           ├── App.css
│           ├── index.html
│           └── main.tsx    # React entry point
├── tsconfig.json
└── wxt.config.ts
```

### WXT Configuration (wxt.config.ts)

The default generated config should look similar to:

```typescript
import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
});
```

**Important:** Do NOT add CSP configuration in this story. CSP for WASM is handled in Story 1.2.

### Package.json Expected Scripts

```json
{
  "scripts": {
    "dev": "wxt",
    "dev:firefox": "wxt -b firefox",
    "build": "wxt build",
    "build:firefox": "wxt build -b firefox",
    "zip": "wxt zip",
    "zip:firefox": "wxt zip -b firefox",
    "postinstall": "wxt prepare"
  }
}
```

### Dependencies Expected

```json
{
  "devDependencies": {
    "@wxt-dev/module-react": "^x.x.x",
    "react": "^18.x.x",
    "react-dom": "^18.x.x",
    "typescript": "^5.x.x",
    "wxt": "^0.20.x"
  }
}
```

---

## Implementation Tasks

### Task 1: Initialize WXT Project
- [x] Run WXT init command with React template and Bun
- [x] Verify all files are created correctly
- [x] Ensure `bun.lock` exists (not npm/yarn lock files)

### Task 2: Verify Development Server
- [x] Run `bun run dev`
- [x] Confirm Chrome opens with extension loaded
- [x] Check DevTools console for errors
- [x] Test hot reload by modifying popup text

### Task 3: Update Popup Placeholder
- [x] Change popup content to display "SimpleReader"
- [x] Add brief placeholder description
- [x] Ensure styling is minimal and clean

### Task 4: Verify Build Process
- [x] Run `bun run build`
- [x] Inspect `.output/chrome-mv3/` contents
- [x] Manually load built extension in Chrome to verify

### Task 5: Git Initialization
- [x] Ensure `.gitignore` includes `.wxt/`, `.output/`, `node_modules/`
- [ ] Make initial commit with project scaffold (pending user request)

---

## Testing Checklist

### Manual Testing
- [ ] `bun run dev` starts without errors
- [ ] Extension appears in Chrome extensions list
- [ ] Clicking extension icon shows popup
- [ ] Popup displays React content without errors
- [ ] Modifying App.tsx triggers hot reload
- [ ] `bun run build` completes successfully
- [ ] Built extension can be loaded via "Load unpacked"

### Verification Commands
```bash
# Start dev server
bun run dev

# Build for production
bun run build

# Create zip for distribution
bun run zip
```

---

## Definition of Done

- [x] WXT project initialized with React template
- [x] Bun is the package manager (bun.lock present)
- [x] `bun run dev` launches extension in Chrome
- [x] Popup displays "SimpleReader" placeholder
- [x] `bun run build` produces valid extension output
- [x] No console errors in development or production
- [x] Project structure matches WXT conventions
- [ ] Code committed to git (pending user request)

---

## Dependencies

**Depends on:** Nothing (first story)
**Blocks:** Stories 1.2, 1.3, 1.4, 1.5, 1.6 (all subsequent Epic 1 stories)

---

## Notes

- This story intentionally does NOT include CSP configuration for WASM - that's Story 1.2
- This story intentionally does NOT create `lib/` files - that's Stories 1.3-1.5
- The popup is just a placeholder - full UI comes in later epics
- If WXT version issues occur, check https://wxt.dev for latest init instructions

---

## References

- [WXT Installation Guide](https://wxt.dev/guide/installation)
- [WXT React Module](https://www.npmjs.com/package/@wxt-dev/module-react)
- [Architecture Document](docs/architecture.md) - Section: Starter Template Evaluation
- [Project Context](docs/project_context.md) - Quick Reference section
