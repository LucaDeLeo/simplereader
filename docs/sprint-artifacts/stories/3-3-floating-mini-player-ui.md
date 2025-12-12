# Story 3-3: Floating Mini-Player UI

**Epic:** 3 - Playback Controls & Mini-Player
**Status:** ready-for-dev
**Created:** 2025-12-12

## User Story

As a user,
I want a floating player on the page,
So that I have easy access to controls without opening the popup.

## Context

This story implements the floating mini-player UI that appears during playback. The mini-player provides persistent, accessible controls directly on the page without requiring the user to open the extension popup.

### What Exists

**Content Script Entry** (`entrypoints/content/index.ts`):
- Content script already loads on all pages
- Message listener infrastructure for `PLAYBACK_STATE_CHANGED`
- Highlighter module already demonstrates Shadow DOM injection patterns

**Message Protocol** (`lib/messages.ts`):
- `PLAYBACK_STATE_CHANGED` message includes `state: PlaybackState` and `position: number`
- `PLAYBACK_PLAY`, `PLAYBACK_PAUSE`, `PLAYBACK_STOP` messages for sending commands
- `sendMessageToBackground()` helper for sending messages to service worker

**Highlighter Module** (`entrypoints/content/highlighter.ts`):
- Demonstrates style injection: `injectStyles()` function
- Shows state management pattern with module-level state object
- CSS custom properties for theming: `--sr-highlight-color`

**Background Service** (`entrypoints/background.ts`):
- Broadcasts `PLAYBACK_STATE_CHANGED` to content script via `sendMessageToTab()`
- Already sends current `position` (word index) with state changes
- Playback state machine: `stopped -> loading -> playing <-> paused -> stopped`

### Architecture Requirements

From `docs/architecture.md`:
- **ARCH-7**: Shadow DOM required for floating player to prevent host page style leaks
- **ARCH-12**: CSS classes must use `sr-` prefix
- **Shadow DOM Boundary**: Player lives in `#simplereader-root` Shadow DOM

From `docs/prd.md`:
- **FR24**: System displays a floating mini-player with controls
- **FR23**: System shows current playback position when paused
- Floating mini-player with play/pause/stop and position indicator

### Shadow DOM Pattern

The architecture specifies Shadow DOM isolation to prevent style conflicts:

```
Host Page DOM
+------------------------------------------+
|                                          |
|  #simplereader-root (Shadow DOM)         |
|  +------------------------------------+  |
|  |                                    |  |
|  |  MiniPlayer (style-isolated)       |  |
|  |  - sr-player, sr-player__button    |  |
|  |                                    |  |
|  +------------------------------------+  |
|                                          |
+------------------------------------------+
```

## Acceptance Criteria

### AC1: Player Injection in Shadow DOM

**Given** the content script is loaded
**When** playback starts (state changes from `stopped` to `loading`)
**Then**:
- A Shadow DOM container `#simplereader-root` is created in document.body
- Mini-player renders inside the shadow root
- Player is isolated from host page CSS
- Player styles don't leak to host page

### AC2: Player Shows Play/Pause/Stop Controls

**Given** the mini-player is visible
**When** I view the player
**Then**:
- Play/Pause toggle button shows current state (play icon when paused, pause icon when playing)
- Stop button is always visible
- Buttons are large enough for easy clicking (min 32x32px touch target)
- All buttons use `sr-` prefixed class names

### AC3: Player Shows Position Indicator

**Given** playback is active or paused
**When** I view the mini-player
**Then**:
- Current word position is displayed (e.g., "142 / 1,203")
- Format: "current / total" word count
- Updates in real-time during playback
- Position remains visible when paused (FR23)

### AC4: Player Visibility Based on State

**Given** the mini-player has been created
**When** playback state changes:
- `loading`: Player appears with loading indicator
- `playing`: Player shows with active controls
- `paused`: Player shows with position frozen at current word
- `stopped`: Player hides (removed from DOM)

### AC5: Player Positioning

**Given** the mini-player is visible
**When** displayed on any webpage
**Then**:
- Positioned at bottom-right of viewport (fixed position)
- Has sensible margins from viewport edge (16px)
- Does not interfere with page scrolling
- Stays visible when scrolling
- Z-index high enough to appear above most page content

### AC6: Button Actions Send Messages

**Given** I interact with player buttons
**When** I click:
- Play/Pause button while playing: Sends `PLAYBACK_PAUSE` message
- Play/Pause button while paused: Sends `PLAYBACK_PLAY` message
- Stop button: Sends `PLAYBACK_STOP` message
**Then** background receives and processes the message

### AC7: Player Listens for State Changes

**Given** the mini-player is displayed
**When** playback state changes (from background)
**Then**:
- Player UI updates to reflect new state
- Button icons update (play<->pause)
- Position indicator updates
- Loading state shows appropriate feedback

## Technical Requirements

### Files to Create

1. **`entrypoints/content/player/MiniPlayer.tsx`**
   - React component for the mini-player UI
   - Manages local state synced with background
   - Renders control buttons and position display

2. **`entrypoints/content/player/mini-player.css`**
   - Scoped styles for mini-player
   - All classes prefixed with `sr-`
   - Designed for Shadow DOM isolation

3. **`entrypoints/content/player/index.ts`**
   - Player lifecycle management (show/hide)
   - Shadow DOM injection logic
   - Message listener for state sync

4. **`entrypoints/content/player/Controls.tsx`** (optional)
   - Play/pause/stop button components
   - Icon rendering (SVG or unicode)

### Files to Modify

1. **`entrypoints/content/index.ts`**
   - Import and initialize player module
   - Forward `PLAYBACK_STATE_CHANGED` to player

2. **`lib/messages.ts`**
   - May need to add `totalWords` to state messages
   - Or create new message type for player state sync

### Implementation Details

#### Shadow DOM Injection Pattern

```typescript
// entrypoints/content/player/index.ts
let shadowRoot: ShadowRoot | null = null;
let playerRoot: Root | null = null;

export function initializePlayer(): void {
  // Prevent duplicate injection
  if (document.getElementById('simplereader-root')) return;

  // Create container element
  const container = document.createElement('div');
  container.id = 'simplereader-root';
  document.body.appendChild(container);

  // Attach shadow DOM
  shadowRoot = container.attachShadow({ mode: 'closed' });

  // Inject styles
  const style = document.createElement('style');
  style.textContent = miniPlayerStyles; // Imported from CSS
  shadowRoot.appendChild(style);

  // Create React root
  const mountPoint = document.createElement('div');
  mountPoint.id = 'simplereader-player-mount';
  shadowRoot.appendChild(mountPoint);

  playerRoot = createRoot(mountPoint);
}
```

#### Mini-Player Component Structure

```tsx
// entrypoints/content/player/MiniPlayer.tsx
interface MiniPlayerProps {
  state: PlaybackState;
  currentPosition: number;
  totalWords: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
}

export function MiniPlayer({
  state,
  currentPosition,
  totalWords,
  onPlay,
  onPause,
  onStop,
}: MiniPlayerProps) {
  if (state === 'stopped') return null;

  return (
    <div className="sr-player">
      <div className="sr-player__controls">
        <button
          className="sr-player__button sr-player__button--play-pause"
          onClick={state === 'playing' ? onPause : onPlay}
          aria-label={state === 'playing' ? 'Pause' : 'Play'}
        >
          {state === 'playing' ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          className="sr-player__button sr-player__button--stop"
          onClick={onStop}
          aria-label="Stop"
        >
          <StopIcon />
        </button>
      </div>
      <div className="sr-player__position">
        {state === 'loading' ? (
          <span className="sr-player__loading">Loading...</span>
        ) : (
          <span>{currentPosition.toLocaleString()} / {totalWords.toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}
```

#### CSS Styles (BEM with sr- prefix)

```css
/* entrypoints/content/player/mini-player.css */
.sr-player {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 2147483647; /* Max z-index for top layer */

  display: flex;
  align-items: center;
  gap: 12px;

  padding: 8px 12px;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);

  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  color: #333333;
}

.sr-player__controls {
  display: flex;
  gap: 4px;
}

.sr-player__button {
  display: flex;
  align-items: center;
  justify-content: center;

  width: 32px;
  height: 32px;
  border: none;
  border-radius: 4px;
  background: #f0f0f0;
  cursor: pointer;

  transition: background-color 0.15s ease;
}

.sr-player__button:hover {
  background: #e0e0e0;
}

.sr-player__button:focus-visible {
  outline: 2px solid #2196F3;
  outline-offset: 2px;
}

.sr-player__button--play-pause {
  background: #4CAF50;
  color: white;
}

.sr-player__button--play-pause:hover {
  background: #45a049;
}

.sr-player__button--stop {
  background: #f44336;
  color: white;
}

.sr-player__button--stop:hover {
  background: #da190b;
}

.sr-player__position {
  min-width: 100px;
  text-align: center;
  color: #666666;
}

.sr-player__loading {
  color: #FFA500;
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .sr-player__button {
    transition: none;
  }
}
```

#### State Synchronization

```typescript
// In content script message handler
addMessageListener((message, _sender, sendResponse) => {
  if (isPlaybackMessage(message)) {
    if (message.type === 'PLAYBACK_STATE_CHANGED') {
      // Forward to player module
      updatePlayerState(message.state, message.position);
      sendResponse({ success: true });
      return false;
    }
  }
  return false;
});
```

#### Button Message Sending

```typescript
// In MiniPlayer or player/index.ts
import { sendMessageToBackground, Messages } from '@/lib/messages';

function handlePlay() {
  sendMessageToBackground(Messages.playbackPlay());
}

function handlePause() {
  sendMessageToBackground(Messages.playbackPause());
}

function handleStop() {
  sendMessageToBackground(Messages.playbackStop());
}
```

### Word Count Tracking

The mini-player needs to know the total word count to display "142 / 1,203". Options:

**Option A (Recommended)**: Store totalWords in content script when extraction happens
- `extractContent()` already returns `wordCount`
- Store in module state when content is extracted
- Player reads from shared state

**Option B**: Add totalWords to PLAYBACK_STATE_CHANGED message
- Requires message protocol change
- More coupling between concerns

**Option C**: Player queries background for total
- Additional round-trip
- More complex

Recommend Option A - content script already has word count from extraction.

### Player Module State

```typescript
// entrypoints/content/player/index.ts
interface PlayerState {
  visible: boolean;
  playbackState: PlaybackState;
  currentPosition: number;
  totalWords: number;
}

const state: PlayerState = {
  visible: false,
  playbackState: 'stopped',
  currentPosition: 0,
  totalWords: 0,
};

export function setTotalWords(count: number): void {
  state.totalWords = count;
}

export function updatePlayerState(playbackState: PlaybackState, position: number): void {
  state.playbackState = playbackState;
  state.currentPosition = position;

  if (playbackState === 'stopped') {
    hidePlayer();
  } else {
    showPlayer();
    renderPlayer();
  }
}
```

## Architecture Compliance

### Pattern Adherence

| Pattern | Compliance |
|---------|------------|
| ARCH-7: Shadow DOM | Player rendered in closed shadow root |
| ARCH-12: CSS sr- prefix | All classes use `sr-player`, `sr-player__*` |
| FR24: Floating mini-player | Fixed position at bottom-right |
| FR23: Position indicator | Shows current word / total words |
| ARCH-5: Typed messages | Uses message protocol for all communication |

### File Structure

```
entrypoints/content/
  index.ts              # UPDATE: Initialize and wire up player
  player/               # NEW: Player module
    index.ts            # Player lifecycle, Shadow DOM injection
    MiniPlayer.tsx      # React component
    mini-player.css     # Scoped styles
    Controls.tsx        # Button components (optional)
```

## Tasks

### Task 1: Create Player Module Structure
**AC: 1**
- [ ] Create `entrypoints/content/player/` directory
- [ ] Create `index.ts` with player lifecycle functions
- [ ] Implement Shadow DOM injection (`initializePlayer()`)
- [ ] Export `showPlayer()`, `hidePlayer()`, `updatePlayerState()`

### Task 2: Create Mini-Player Styles
**AC: 2, 5**
- [ ] Create `mini-player.css` with sr- prefixed classes
- [ ] Style fixed positioning (bottom-right, z-index)
- [ ] Style control buttons (32px min, accessible)
- [ ] Style position indicator
- [ ] Add hover/focus states
- [ ] Add reduced-motion support

### Task 3: Create React Component
**AC: 2, 3, 4**
- [ ] Create `MiniPlayer.tsx` component
- [ ] Render play/pause toggle button with correct icon
- [ ] Render stop button
- [ ] Render position indicator (current / total)
- [ ] Handle loading state display
- [ ] Return null when state is 'stopped'

### Task 4: Implement Button Actions
**AC: 6**
- [ ] Import message helpers from `@/lib/messages`
- [ ] Implement `handlePlay()` sending `PLAYBACK_PLAY`
- [ ] Implement `handlePause()` sending `PLAYBACK_PAUSE`
- [ ] Implement `handleStop()` sending `PLAYBACK_STOP`
- [ ] Wire handlers to button onClick

### Task 5: Wire State Synchronization
**AC: 4, 7**
- [ ] Add `PLAYBACK_STATE_CHANGED` handler in content script
- [ ] Forward state changes to player module
- [ ] Track totalWords from content extraction
- [ ] Update player React state on each change

### Task 6: Integrate with Content Script
**AC: 1, 4, 7**
- [ ] Import player module in `content/index.ts`
- [ ] Initialize player on content script load
- [ ] Pass totalWords after content extraction
- [ ] Handle message routing to player

### Task 7: Testing
**AC: All**
- [ ] Verify Shadow DOM injection on page load
- [ ] Test player appears on playback start
- [ ] Test play/pause button toggles correctly
- [ ] Test stop button hides player
- [ ] Test position updates during playback
- [ ] Test player hides when stopped
- [ ] Test player doesn't affect page styles
- [ ] Test page styles don't affect player
- [ ] Test on multiple sites (Medium, Substack, news)

## Definition of Done

- [ ] Player module created in `entrypoints/content/player/`
- [ ] Shadow DOM container `#simplereader-root` injected
- [ ] Player appears when playback starts (loading/playing/paused)
- [ ] Player hides when playback stops
- [ ] Play/pause button toggles and sends correct messages
- [ ] Stop button stops playback and hides player
- [ ] Position shows "current / total" word count
- [ ] Position updates during playback
- [ ] All CSS classes use `sr-` prefix
- [ ] Player isolated from host page styles
- [ ] No TypeScript errors
- [ ] No console errors on any test site

## Dependencies

### Depends On
- Story 2-7: Basic playback controls (playback state machine)
- Story 2-1: Content extraction (word count)
- Story 2-6: Word highlighting (position tracking)

### Enables
- Story 3-2: Speed control can be added to mini-player
- Story 3-4: Position indicator foundation
- Story 7-1: Keyboard navigation for player controls

## Test Scenarios

### Manual Testing Checklist

| Scenario | Steps | Expected Behavior |
|----------|-------|-------------------|
| Player appears | Start playback on article | Player visible at bottom-right |
| Play/pause toggle | Click play/pause button | Toggles between play/pause state |
| Stop playback | Click stop button | Playback stops, player hides |
| Position display | Watch during playback | Position increments (142 / 1,203) |
| Loading state | Start playback | Shows "Loading..." then position |
| Style isolation | Check page styles | Player unaffected by page CSS |
| No style leak | Check page after player | Page unaffected by player CSS |
| Scroll behavior | Scroll page while playing | Player stays fixed at bottom-right |
| Multiple pages | Navigate to new page | Old player removed, ready for new |

### Console Log Expectations

```
[SimpleReader] Content script loaded
[SimpleReader] Player initialized (Shadow DOM)
[SimpleReader] Received message: PLAYBACK_STATE_CHANGED
[SimpleReader] Player state: stopped -> loading
[SimpleReader] Player state: loading -> playing
```

## References

- [Chrome Extension Content Scripts](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [MDN Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM)
- [React 18 createRoot](https://react.dev/reference/react-dom/client/createRoot)
- [Source: docs/architecture.md] - Shadow DOM boundary diagram
- [Source: docs/prd.md#FR24] - Floating mini-player requirement
- [Source: entrypoints/content/highlighter.ts] - Style injection pattern

## Dev Notes

### Why Closed Shadow DOM?

Using `{ mode: 'closed' }` for the shadow root because:
1. Prevents host page JavaScript from accessing player internals
2. Stronger style isolation (no CSS-in-JS leakage)
3. Player is purely UI, no need for external access
4. Security: prevents malicious pages from manipulating player

### Z-Index Strategy

Using `z-index: 2147483647` (max 32-bit signed integer) because:
- Many sites use high z-index for modals, headers, ads
- Player must appear above all page content
- Shadow DOM already provides isolation, z-index is backup

### React in Content Script

Using React for the mini-player because:
1. Project already uses React (WXT template)
2. Declarative UI updates simplify state sync
3. Small bundle impact (already loaded for popup)
4. TypeScript type safety for props

Alternative: Could use vanilla DOM manipulation like highlighter.ts. React chosen for maintainability and consistency with project patterns.

### Icon Approach

Recommend using inline SVG for icons:
- No external font dependencies
- No CORS issues in extension context
- Crisp at any size
- Easy to style with CSS

Example play icon:
```tsx
const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 2l10 6-10 6V2z"/>
  </svg>
);
```

### Position Format

Using "142 / 1,203" format because:
- Clear relationship between current and total
- `toLocaleString()` for number formatting (commas)
- Compact enough for small player width

Alternative formats considered:
- "142 of 1,203" - slightly longer
- "142/1203" - no spacing, less readable
- Percentage "12%" - less precise for long articles

## Story Points

**Estimate:** 5 points (medium complexity)

- Shadow DOM injection pattern requires careful implementation
- React in content script requires bundling consideration
- State synchronization between background and content
- CSS isolation testing across multiple sites
- Multiple components to create

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

<!-- Populated after implementation -->

### File List

- `entrypoints/content/player/index.ts` (new: player lifecycle, Shadow DOM)
- `entrypoints/content/player/MiniPlayer.tsx` (new: React component)
- `entrypoints/content/player/mini-player.css` (new: scoped styles)
- `entrypoints/content/index.ts` (update: wire up player module)
