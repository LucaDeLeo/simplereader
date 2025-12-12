# Story 3-4: Position Indicator When Paused

**Epic:** 3 - Playback Controls & Mini-Player
**Status:** ready-for-dev
**Created:** 2025-12-12

## User Story

As a user,
I want to see where I am in the article when paused,
So that I know my progress and can resume from the right spot.

## Context

This is the **final story in Epic 3**, adding visual polish to the paused state. Most functionality already exists from prior stories - this story enhances the visual feedback when playback is paused.

### What Already Exists

| Feature | Story | Implementation | Status |
|---------|-------|----------------|--------|
| Current word highlighted when paused | 2-6 | `sr-word--current` class stays on current word | Done |
| Mini-player shows position | 3-3 | Shows "142 / 1,203" word count | Done |
| Badge shows "||" for paused | 2-7 | Badge text "||" with blue color | Done |
| Pause/resume from position | 2-7 | Background tracks `currentWordIndex` | Done |

### What This Story Adds

1. **Pulsing animation on current word when paused** - Visual cue that highlights attention on paused position
2. **Mini-player shows "Paused" label** - Clear text indication of paused state
3. **Respects reduced-motion preference** - No animation when `prefers-reduced-motion` is enabled

### Current Highlighter CSS (`entrypoints/content/highlighter.ts`)

```css
.sr-word--current {
  background-color: var(--sr-highlight-color);
  border-radius: 2px;
  box-shadow: 0 0 0 1px var(--sr-highlight-color);
}

@media (prefers-reduced-motion: reduce) {
  .sr-word {
    transition: none;
  }
}
```

### Current Mini-Player (`entrypoints/content/player/MiniPlayer.tsx`)

```tsx
<div className="sr-player__position">
  {state === 'loading' ? (
    <span className="sr-player__loading">Loading...</span>
  ) : (
    <span>{currentPosition.toLocaleString()} / {totalWords.toLocaleString()}</span>
  )}
</div>
```

## Acceptance Criteria

### AC1: Current Word Pulses When Paused

**Given** playback is paused
**When** I look at the article
**Then**:
- The current word has a subtle pulsing animation (scale or opacity)
- The pulse is gentle and non-distracting (1-2 second cycle)
- The pulse draws attention to resume point without being annoying

### AC2: Reduced Motion Respect

**Given** `prefers-reduced-motion: reduce` is enabled
**When** playback is paused
**Then**:
- No animation plays on the current word
- A static visual indicator shows instead (e.g., thicker border or underline)
- User can still identify the paused position

### AC3: Mini-Player Shows Paused State

**Given** playback is paused
**When** I view the mini-player
**Then**:
- "Paused" label is visible
- Position still shows current word / total words
- Play button icon indicates ability to resume

### AC4: Resume From Exact Position

**Given** playback is paused with pulsing indicator
**When** I click play/resume
**Then**:
- Playback resumes from the highlighted word
- Pulsing animation stops immediately
- Highlighting resumes normal behavior (moves to next word)

## Technical Requirements

### Files to Modify

1. **`entrypoints/content/highlighter.ts`**
   - Add CSS for paused state animation
   - Add class `sr-word--paused` for pulsing effect
   - Add function to set/clear paused state

2. **`entrypoints/content/player/mini-player.css`**
   - Add styles for paused state indicator

3. **`entrypoints/content/player/MiniPlayer.tsx`**
   - Show "Paused" label when state is paused

4. **`entrypoints/content/index.ts`**
   - Set paused class on current word when state changes to paused
   - Remove paused class when state changes from paused

### Implementation Details

#### Highlighter CSS Updates

Add to `injectStyles()` in `highlighter.ts`:

```css
/* Paused state - pulsing animation */
.sr-word--paused.sr-word--current {
  animation: sr-pulse 1.5s ease-in-out infinite;
}

@keyframes sr-pulse {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 0 0 1px var(--sr-highlight-color);
  }
  50% {
    transform: scale(1.02);
    box-shadow: 0 0 0 3px var(--sr-highlight-color);
  }
}

/* Reduced motion alternative */
@media (prefers-reduced-motion: reduce) {
  .sr-word--paused.sr-word--current {
    animation: none;
    /* Static indicator instead */
    border-bottom: 2px solid var(--sr-highlight-color);
    box-shadow: 0 0 0 2px var(--sr-highlight-color);
  }
}
```

#### Highlighter Functions

Add to `highlighter.ts`:

```typescript
/**
 * Set paused state on current word (adds pulsing animation).
 */
export function setPausedState(paused: boolean): void {
  if (!state.initialized || state.currentWordIndex === null) return;

  const wordElement = state.wordElements[state.currentWordIndex];
  if (!wordElement) return;

  if (paused) {
    wordElement.classList.add('sr-word--paused');
  } else {
    wordElement.classList.remove('sr-word--paused');
  }
}

/**
 * Clear paused state from all words.
 */
export function clearPausedState(): void {
  if (!state.initialized) return;

  for (const element of state.wordElements) {
    element.classList.remove('sr-word--paused');
  }
}
```

#### Mini-Player Update

Update `MiniPlayer.tsx`:

```tsx
<div className="sr-player__position">
  {state === 'loading' ? (
    <span className="sr-player__loading">Loading...</span>
  ) : state === 'paused' ? (
    <span className="sr-player__paused">
      Paused: {currentPosition.toLocaleString()} / {totalWords.toLocaleString()}
    </span>
  ) : (
    <span>{currentPosition.toLocaleString()} / {totalWords.toLocaleString()}</span>
  )}
</div>
```

Add to `mini-player.css`:

```css
.sr-player__paused {
  color: #2196F3; /* Blue to match badge color */
}
```

#### Content Script Integration

Update message handler in `entrypoints/content/index.ts`:

```typescript
import { setPausedState, clearPausedState } from './highlighter';

// In PLAYBACK_STATE_CHANGED handler:
case 'PLAYBACK_STATE_CHANGED':
  updatePlayerState(message.state, message.position);

  // Handle paused state animation
  if (message.state === 'paused') {
    setPausedState(true);
  } else {
    clearPausedState();
  }

  sendResponse({ success: true });
  break;
```

### CSS Class Summary

| Class | When Applied | Visual Effect |
|-------|--------------|---------------|
| `sr-word` | All wrapped words | Base style (no visual change) |
| `sr-word--current` | Currently playing/paused word | Yellow highlight |
| `sr-word--paused` | Current word when paused | Pulsing animation |

## Architecture Compliance

### Pattern Adherence

| Pattern | Compliance |
|---------|------------|
| FR23: Position indicator when paused | Mini-player shows "Paused: X / Y" |
| ARCH-12: CSS sr- prefix | All classes use `sr-word--paused`, `sr-player__paused` |
| NFR14: Reduced motion | Animation disabled with fallback static indicator |
| ARCH-17: requestAnimationFrame | Not needed - CSS animation handles this |

### File Changes

```
entrypoints/content/
  highlighter.ts           # UPDATE: Add paused CSS, setPausedState()
  index.ts                 # UPDATE: Call setPausedState on state change
  player/
    MiniPlayer.tsx         # UPDATE: Show "Paused" label
    mini-player.css        # UPDATE: Add .sr-player__paused style
```

## Tasks

### Task 1: Add Paused CSS Animation to Highlighter
**AC: 1, 2**
- [ ] Add `sr-word--paused` class styles in `injectStyles()`
- [ ] Add `@keyframes sr-pulse` animation
- [ ] Add `@media (prefers-reduced-motion)` alternative (static border)
- [ ] Verify animation is subtle (1.5s cycle, scale 1.02)

### Task 2: Add Paused State Functions to Highlighter
**AC: 1, 4**
- [ ] Add `setPausedState(paused: boolean)` function
- [ ] Add `clearPausedState()` function
- [ ] Export both functions from `highlighter.ts`
- [ ] Update `resetHighlight()` to also call `clearPausedState()`

### Task 3: Update Mini-Player for Paused Label
**AC: 3**
- [ ] Update `MiniPlayer.tsx` to show "Paused:" prefix when `state === 'paused'`
- [ ] Add `.sr-player__paused` class with blue color (#2196F3)
- [ ] Verify position still shows correctly

### Task 4: Integrate with Content Script
**AC: 1, 4**
- [ ] Import `setPausedState`, `clearPausedState` in content/index.ts
- [ ] Call `setPausedState(true)` when state changes to 'paused'
- [ ] Call `clearPausedState()` when state changes to any other state
- [ ] Verify state changes propagate correctly

### Task 5: Testing
**AC: All**
- [ ] Test pulsing animation appears when paused
- [ ] Test animation stops when resumed
- [ ] Test mini-player shows "Paused" label
- [ ] Test with `prefers-reduced-motion` enabled (use DevTools emulation)
- [ ] Test reduced motion shows static border instead of animation
- [ ] Test resume continues from correct word
- [ ] Test stop clears paused state

## Definition of Done

- [ ] Current word pulses when paused (CSS animation)
- [ ] Animation is subtle and non-distracting (1.5s cycle)
- [ ] Reduced motion shows static indicator instead
- [ ] Mini-player shows "Paused:" prefix with blue color
- [ ] Position still displays correctly (X / Y words)
- [ ] Resume from paused position works correctly
- [ ] Animation stops immediately on resume
- [ ] Stop clears all paused state
- [ ] No TypeScript errors
- [ ] All CSS classes use sr- prefix

## Dependencies

### Depends On
- Story 2-6: Word highlighting (`highlightWord()`, `sr-word--current`)
- Story 2-7: Playback state machine (`paused` state)
- Story 3-3: Mini-player UI (position display)

### Enables
- Epic 7: Accessibility enhancements can build on reduced-motion pattern
- Story 5-4: Visual distinction for spoken words can reuse animation patterns

## Test Scenarios

### Manual Testing Checklist

| Scenario | Steps | Expected Behavior |
|----------|-------|-------------------|
| Pause shows pulse | Play article, pause mid-read | Current word pulses gently |
| Resume stops pulse | Pause, then resume | Pulse stops, highlighting continues |
| Mini-player label | Pause playback | Shows "Paused: 142 / 1,203" |
| Reduced motion | Enable reduced-motion in DevTools, pause | Static border, no animation |
| Stop clears all | Pause, then stop | Pulse stops, highlight resets |
| Multiple pause/resume | Pause, resume, pause again | Animation toggles correctly each time |

### DevTools Reduced Motion Test

1. Open DevTools > Rendering panel
2. Enable "Emulate CSS media feature prefers-reduced-motion"
3. Set to "reduce"
4. Pause playback
5. Verify static border instead of animation

### Console Log Expectations

```
[SimpleReader] Playback state: playing -> paused
[SimpleReader] Set paused state on word 142
[SimpleReader] Playback state: paused -> playing
[SimpleReader] Cleared paused state
```

## References

- [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
- [Source: docs/epics.md#Story 3.4] - Original story definition
- [Source: docs/architecture.md#FR23] - Position indicator requirement
- [Source: entrypoints/content/highlighter.ts] - Existing highlighting implementation
- [Source: entrypoints/content/player/MiniPlayer.tsx] - Existing mini-player component

## Dev Notes

### Why CSS Animation Over JavaScript?

1. **Performance**: CSS animations run on compositor thread, no main thread blocking
2. **Simplicity**: No setTimeout/setInterval management needed
3. **Automatic cleanup**: Animation stops when class is removed
4. **Reduced motion built-in**: `@media` query handles preference automatically

### Animation Design Rationale

**Scale over opacity:**
- Scale (1.02) is subtle but noticeable
- Opacity changes can look like loading/flicker
- Scale maintains readability

**1.5s cycle time:**
- Fast enough to draw attention
- Slow enough to not be annoying
- Matches common "breathing" UI patterns

### Alternative Approaches Considered

1. **Blinking cursor next to word**: Rejected - too intrusive, accessibility concerns
2. **Background color pulse**: Rejected - interferes with highlight color customization
3. **Border animation**: Used as reduced-motion fallback - simple but effective

### Mini-Player Label Decision

"Paused: X / Y" chosen over alternatives:
- "|| X / Y" - Less clear for screen readers
- "X / Y (paused)" - Position more prominent
- Just icon change - May not be noticed

The "Paused:" prefix is concise and clear.

### Story Scope

This story is intentionally small because most functionality exists. The main additions are:
1. ~20 lines of CSS for animation
2. ~15 lines of TypeScript for state functions
3. ~5 lines of JSX for label

Estimated effort: 1-2 story points (small enhancement).

---

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

<!-- Populated after implementation -->

### File List

- `entrypoints/content/highlighter.ts` (update: add paused CSS animation, setPausedState function)
- `entrypoints/content/player/MiniPlayer.tsx` (update: show "Paused:" label)
- `entrypoints/content/player/mini-player.css` (update: add .sr-player__paused style)
- `entrypoints/content/index.ts` (update: call setPausedState on state changes)
