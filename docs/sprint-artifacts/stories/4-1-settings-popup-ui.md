# Story 4-1: Settings Popup UI

**Epic:** 4 - User Preferences & Settings
**Status:** ready-for-dev
**Created:** 2025-12-12

## User Story

As a user,
I want to access settings through the extension popup,
So that I can customize my experience.

## Context

This story adds a tabbed interface to the extension popup, separating playback controls from settings. The Settings tab allows users to configure voice selection, speed preference, and highlight color - all persisting to `chrome.storage.sync` for cross-device synchronization.

### What Exists

**Popup Component** (`entrypoints/popup/App.tsx`):
- Current popup displays: title, description, playback controls (Play/Pause/Stop), status bar
- Speed slider already exists with persistence to `STORAGE_KEYS.preferredSpeed`
- Voice name displayed in footer via `formatVoiceName()`
- Message listeners for `PLAYBACK_STATE_CHANGED` and `TTS_ERROR`
- Uses `getSyncValue()` and `setSyncValue()` from storage helpers

**Popup Styles** (`entrypoints/popup/App.css`):
- Fixed width 280px popup
- Control button styling (play/pause/stop with colors)
- Speed slider with custom thumb styling
- Status bar and settings info sections

**Storage Infrastructure** (`lib/storage.ts`):
- `STORAGE_KEYS.preferredVoice` - string voice ID (e.g., "af_bella")
- `STORAGE_KEYS.preferredSpeed` - number (0.5 to 2.0)
- `STORAGE_KEYS.highlightColor` - HighlightColor type ('yellow' | 'green' | 'blue' | 'pink' | string)
- `getSyncValue()` and `setSyncValue()` helpers with proper typing
- `DEFAULT_STORAGE_VALUES` with sensible defaults

**Voice Constants** (`lib/constants.ts`):
- `KOKORO_VOICES` const object with all 24 voice IDs
- `KokoroVoice` type for type safety
- `getVoiceMetadata(voice)` - returns `{ id, name, gender, accent }`
- `getAllVoices()` - returns array of all voice IDs
- `getVoicesByFilter({ gender?, accent? })` - filter voices
- `DEFAULT_VOICE` = 'af_heart'

**Speed Constants** (`lib/constants.ts`):
- `MIN_SPEED` = 0.5
- `MAX_SPEED` = 2.0
- `DEFAULT_SPEED` = 1.0
- `clampSpeed()` utility function

### Architecture Requirements

From `docs/architecture.md`:
- **ARCH-11**: Storage keys defined in `lib/storage.ts` only - never string literals
- **FR28**: User can access settings through extension popup
- **FR5**: User can select from available Kokoro voices
- **FR16**: User can customize highlight color
- **FR25**: System persists user's speed preference across sessions

From `docs/prd.md`:
- Settings UI should be "clean and intuitive"
- All 21+ Kokoro voices available for selection
- Preset highlight colors (yellow, green, blue, pink) plus custom hex option
- Changes should reflect immediately

### Current Popup Structure

```tsx
// Current App.tsx structure
<div className="popup">
  <h1>SimpleReader</h1>
  <p className="description">...</p>
  {error && <div className="error-message">...</div>}
  <div className="controls">...</div>
  <div className="status-bar">...</div>
  <div className="speed-control">...</div>
  <div className="settings-info">...</div>
</div>
```

Target structure with tabs:
```tsx
<div className="popup">
  <h1>SimpleReader</h1>
  <div className="sr-tabs">
    <button className="sr-tab sr-tab--active">Player</button>
    <button className="sr-tab">Settings</button>
  </div>
  {/* Player Tab */}
  <div className="sr-tab-panel">
    <div className="controls">...</div>
    <div className="status-bar">...</div>
    <div className="speed-control">...</div>  {/* Keep in Player tab */}
  </div>
  {/* Settings Tab */}
  <div className="sr-tab-panel">
    <VoiceSelector />
    <SpeedSlider />  {/* Duplicate for convenience */}
    <ColorPicker />
  </div>
</div>
```

## Acceptance Criteria

### AC1: Tabbed Navigation

**Given** the extension popup is open
**When** I view the popup
**Then**:
- Two tabs visible: "Player" and "Settings"
- Tabs are clearly distinguishable with active state
- Player tab is active by default
- Clicking a tab switches the visible panel
- Tab state persists within popup session (not across popup closes)

### AC2: Player Tab Content

**Given** the Player tab is active
**When** I view the tab content
**Then**:
- Playback controls (Play/Pause/Stop) are visible
- Status bar shows current playback state
- Speed slider is available for quick adjustment
- All existing popup functionality works unchanged

### AC3: Voice Selection

**Given** the Settings tab is active
**When** I view voice options
**Then**:
- Dropdown/select shows all 24 Kokoro voices
- Voices grouped by accent (American/British) and gender (Female/Male)
- Each voice shows readable name (e.g., "Bella" not "af_bella")
- Current selected voice is highlighted
- Selecting a voice immediately saves to `chrome.storage.sync`

### AC4: Speed Control in Settings

**Given** the Settings tab is active
**When** I view speed control
**Then**:
- Speed slider available (0.5x to 2.0x range)
- Current speed value displayed (e.g., "1.0x")
- Slider step is 0.25 (matching existing implementation)
- Changing speed immediately saves to storage
- Speed syncs with Player tab slider

### AC5: Highlight Color Picker

**Given** the Settings tab is active
**When** I view highlight color options
**Then**:
- Four preset color buttons: Yellow, Green, Blue, Pink
- Custom hex input field for custom colors
- Current color visually indicated (checked/selected state)
- Preset buttons show color preview
- Selecting a color immediately saves to storage
- Custom hex input validates format (#RRGGBB)

### AC6: Settings Persistence

**Given** I have changed settings
**When** I close and reopen the popup
**Then**:
- Voice selection persists
- Speed preference persists
- Highlight color persists
- Settings load from `chrome.storage.sync` on popup open

### AC7: Immediate Effect

**Given** playback is active on a page
**When** I change settings in the popup
**Then**:
- Speed changes apply to current playback
- Highlight color changes apply to current highlighting
- Voice changes apply to next playback (not mid-playback)

## Technical Requirements

### Files to Create

1. **`entrypoints/popup/components/TabNavigation.tsx`**
   - Tab button components
   - Active tab state management
   - Accessible tab panel switching (ARIA)

2. **`entrypoints/popup/components/VoiceSelector.tsx`**
   - Grouped dropdown/select for voice selection
   - Voice metadata display
   - Storage integration

3. **`entrypoints/popup/components/ColorPicker.tsx`**
   - Preset color buttons (Yellow, Green, Blue, Pink)
   - Custom hex input with validation
   - Visual selection indicator

4. **`entrypoints/popup/components/SpeedSlider.tsx`**
   - Extract existing speed slider into reusable component
   - Accept value and onChange props
   - Display current speed value

### Files to Modify

1. **`entrypoints/popup/App.tsx`**
   - Add tab state management
   - Restructure into Player and Settings panels
   - Import new components
   - Wire up settings persistence

2. **`entrypoints/popup/App.css`**
   - Add tab navigation styles
   - Style Settings tab content
   - Style voice selector dropdown
   - Style color picker buttons and input

### Implementation Details

#### Tab Component Structure

```tsx
// entrypoints/popup/components/TabNavigation.tsx
interface TabNavigationProps {
  activeTab: 'player' | 'settings';
  onTabChange: (tab: 'player' | 'settings') => void;
}

export function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  return (
    <div className="sr-tabs" role="tablist">
      <button
        role="tab"
        aria-selected={activeTab === 'player'}
        aria-controls="panel-player"
        className={`sr-tab ${activeTab === 'player' ? 'sr-tab--active' : ''}`}
        onClick={() => onTabChange('player')}
      >
        Player
      </button>
      <button
        role="tab"
        aria-selected={activeTab === 'settings'}
        aria-controls="panel-settings"
        className={`sr-tab ${activeTab === 'settings' ? 'sr-tab--active' : ''}`}
        onClick={() => onTabChange('settings')}
      >
        Settings
      </button>
    </div>
  );
}
```

#### Voice Selector Component

```tsx
// entrypoints/popup/components/VoiceSelector.tsx
import { getAllVoices, getVoiceMetadata, type KokoroVoice } from '@/lib/constants';
import { STORAGE_KEYS, setSyncValue } from '@/lib/storage';

interface VoiceSelectorProps {
  value: KokoroVoice;
  onChange: (voice: KokoroVoice) => void;
}

export function VoiceSelector({ value, onChange }: VoiceSelectorProps) {
  const voices = getAllVoices();

  // Group voices by accent then gender
  const grouped = {
    americanFemale: voices.filter(v => {
      const m = getVoiceMetadata(v);
      return m.accent === 'american' && m.gender === 'female';
    }),
    americanMale: voices.filter(v => {
      const m = getVoiceMetadata(v);
      return m.accent === 'american' && m.gender === 'male';
    }),
    britishFemale: voices.filter(v => {
      const m = getVoiceMetadata(v);
      return m.accent === 'british' && m.gender === 'female';
    }),
    britishMale: voices.filter(v => {
      const m = getVoiceMetadata(v);
      return m.accent === 'british' && m.gender === 'male';
    }),
  };

  const handleChange = async (newVoice: KokoroVoice) => {
    onChange(newVoice);
    await setSyncValue(STORAGE_KEYS.preferredVoice, newVoice);
  };

  return (
    <div className="sr-voice-selector">
      <label htmlFor="sr-voice-select">Voice</label>
      <select
        id="sr-voice-select"
        value={value}
        onChange={(e) => handleChange(e.target.value as KokoroVoice)}
      >
        <optgroup label="American Female">
          {grouped.americanFemale.map(v => (
            <option key={v} value={v}>{getVoiceMetadata(v).name}</option>
          ))}
        </optgroup>
        <optgroup label="American Male">
          {grouped.americanMale.map(v => (
            <option key={v} value={v}>{getVoiceMetadata(v).name}</option>
          ))}
        </optgroup>
        <optgroup label="British Female">
          {grouped.britishFemale.map(v => (
            <option key={v} value={v}>{getVoiceMetadata(v).name}</option>
          ))}
        </optgroup>
        <optgroup label="British Male">
          {grouped.britishMale.map(v => (
            <option key={v} value={v}>{getVoiceMetadata(v).name}</option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}
```

#### Color Picker Component

```tsx
// entrypoints/popup/components/ColorPicker.tsx
import { STORAGE_KEYS, setSyncValue, type HighlightColor } from '@/lib/storage';

interface ColorPickerProps {
  value: HighlightColor;
  onChange: (color: HighlightColor) => void;
}

const PRESET_COLORS: { name: string; value: HighlightColor; hex: string }[] = [
  { name: 'Yellow', value: 'yellow', hex: '#FFEB3B' },
  { name: 'Green', value: 'green', hex: '#4CAF50' },
  { name: 'Blue', value: 'blue', hex: '#2196F3' },
  { name: 'Pink', value: 'pink', hex: '#E91E63' },
];

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [customHex, setCustomHex] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  useEffect(() => {
    // Check if current value is custom
    const isPreset = PRESET_COLORS.some(p => p.value === value);
    if (!isPreset && value.startsWith('#')) {
      setIsCustom(true);
      setCustomHex(value);
    } else {
      setIsCustom(false);
    }
  }, [value]);

  const handlePresetSelect = async (color: HighlightColor) => {
    setIsCustom(false);
    onChange(color);
    await setSyncValue(STORAGE_KEYS.highlightColor, color);
  };

  const handleCustomChange = (hex: string) => {
    setCustomHex(hex);
    // Validate hex format
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      setIsCustom(true);
      onChange(hex);
      setSyncValue(STORAGE_KEYS.highlightColor, hex);
    }
  };

  const isSelected = (color: HighlightColor) => {
    return !isCustom && value === color;
  };

  return (
    <div className="sr-color-picker">
      <label>Highlight Color</label>
      <div className="sr-color-presets">
        {PRESET_COLORS.map(({ name, value: colorValue, hex }) => (
          <button
            key={colorValue}
            className={`sr-color-btn ${isSelected(colorValue) ? 'sr-color-btn--selected' : ''}`}
            style={{ backgroundColor: hex }}
            onClick={() => handlePresetSelect(colorValue)}
            aria-label={name}
            aria-pressed={isSelected(colorValue)}
            title={name}
          />
        ))}
      </div>
      <div className="sr-color-custom">
        <label htmlFor="sr-custom-color">Custom:</label>
        <input
          type="text"
          id="sr-custom-color"
          placeholder="#RRGGBB"
          value={customHex}
          onChange={(e) => handleCustomChange(e.target.value)}
          className={isCustom ? 'sr-color-input--active' : ''}
          maxLength={7}
        />
        {isCustom && customHex && (
          <span
            className="sr-color-preview"
            style={{ backgroundColor: customHex }}
          />
        )}
      </div>
    </div>
  );
}
```

#### Speed Slider Component (Extracted)

```tsx
// entrypoints/popup/components/SpeedSlider.tsx
import { MIN_SPEED, MAX_SPEED } from '@/lib/constants';

interface SpeedSliderProps {
  value: number;
  onChange: (speed: number) => void;
  label?: string;
}

export function SpeedSlider({ value, onChange, label = 'Speed' }: SpeedSliderProps) {
  return (
    <div className="sr-speed-slider">
      <label htmlFor="sr-speed-slider">{label}: {value}x</label>
      <input
        type="range"
        id="sr-speed-slider"
        min={MIN_SPEED}
        max={MAX_SPEED}
        step={0.25}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}
```

#### Updated App.tsx Structure

```tsx
// entrypoints/popup/App.tsx
import { useState, useEffect } from 'react';
import { STORAGE_KEYS, getSyncValue, setSyncValue, type HighlightColor } from '@/lib/storage';
import { Messages, type PlaybackState, type Message } from '@/lib/messages';
import { MIN_SPEED, MAX_SPEED, DEFAULT_SPEED, type KokoroVoice, DEFAULT_VOICE } from '@/lib/constants';
import { TabNavigation } from './components/TabNavigation';
import { VoiceSelector } from './components/VoiceSelector';
import { ColorPicker } from './components/ColorPicker';
import { SpeedSlider } from './components/SpeedSlider';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState<'player' | 'settings'>('player');
  const [playbackState, setPlaybackState] = useState<PlaybackState>('stopped');
  const [error, setError] = useState<string | null>(null);

  // Settings state
  const [voice, setVoice] = useState<KokoroVoice>(DEFAULT_VOICE);
  const [speed, setSpeed] = useState<number>(DEFAULT_SPEED);
  const [highlightColor, setHighlightColor] = useState<HighlightColor>('yellow');

  useEffect(() => {
    async function loadSettings() {
      const storedVoice = await getSyncValue(STORAGE_KEYS.preferredVoice);
      const storedSpeed = await getSyncValue(STORAGE_KEYS.preferredSpeed);
      const storedColor = await getSyncValue(STORAGE_KEYS.highlightColor);

      if (storedVoice) setVoice(storedVoice as KokoroVoice);
      if (storedSpeed !== undefined) setSpeed(storedSpeed);
      if (storedColor) setHighlightColor(storedColor);
    }
    loadSettings();

    const listener = (message: Message) => {
      if (message.type === 'PLAYBACK_STATE_CHANGED') {
        setPlaybackState(message.state);
        setError(null);
      }
      if (message.type === 'TTS_ERROR') {
        setError('Failed to generate speech. Please try again.');
        setPlaybackState('stopped');
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const handleSpeedChange = async (newSpeed: number) => {
    setSpeed(newSpeed);
    await setSyncValue(STORAGE_KEYS.preferredSpeed, newSpeed);
  };

  const handlePlay = async () => {
    setError(null);
    chrome.runtime.sendMessage(Messages.playbackPlay());
  };

  const handlePause = () => {
    chrome.runtime.sendMessage(Messages.playbackPause());
  };

  const handleStop = () => {
    chrome.runtime.sendMessage(Messages.playbackStop());
  };

  return (
    <div className="popup">
      <h1>SimpleReader</h1>

      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === 'player' && (
        <div className="sr-tab-panel" id="panel-player" role="tabpanel">
          {error && <div className="error-message">{error}</div>}

          <div className="controls">
            {/* Play/Pause/Stop buttons - same as before */}
            {playbackState === 'stopped' && (
              <button onClick={handlePlay} className="control-button play">
                <PlayIcon />
                <span>Play</span>
              </button>
            )}
            {/* ... other states ... */}
          </div>

          <div className="status-bar">
            {playbackState === 'stopped' && 'Click Play to start reading'}
            {playbackState === 'loading' && 'Generating audio...'}
            {playbackState === 'playing' && 'Now playing'}
            {playbackState === 'paused' && 'Paused'}
          </div>

          <SpeedSlider value={speed} onChange={handleSpeedChange} />
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="sr-tab-panel" id="panel-settings" role="tabpanel">
          <VoiceSelector value={voice} onChange={setVoice} />
          <SpeedSlider value={speed} onChange={handleSpeedChange} />
          <ColorPicker value={highlightColor} onChange={setHighlightColor} />
        </div>
      )}
    </div>
  );
}
```

#### CSS for Tabs and Settings

```css
/* Tab Navigation */
.sr-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 1rem;
  border-bottom: 1px solid #e0e0e0;
}

.sr-tab {
  flex: 1;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #666;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}

.sr-tab:hover {
  color: #333;
}

.sr-tab--active {
  color: #4caf50;
  border-bottom-color: #4caf50;
}

.sr-tab:focus-visible {
  outline: 2px solid #4caf50;
  outline-offset: -2px;
}

/* Tab Panel */
.sr-tab-panel {
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Voice Selector */
.sr-voice-selector {
  margin-bottom: 1rem;
}

.sr-voice-selector label {
  display: block;
  font-size: 0.75rem;
  color: #666;
  margin-bottom: 0.375rem;
}

.sr-voice-selector select {
  width: 100%;
  padding: 0.5rem;
  font-size: 0.875rem;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  background: white;
  cursor: pointer;
}

.sr-voice-selector select:focus {
  outline: none;
  border-color: #4caf50;
  box-shadow: 0 0 0 2px rgba(76, 175, 80, 0.2);
}

/* Color Picker */
.sr-color-picker {
  margin-bottom: 1rem;
}

.sr-color-picker > label {
  display: block;
  font-size: 0.75rem;
  color: #666;
  margin-bottom: 0.375rem;
}

.sr-color-presets {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.sr-color-btn {
  width: 32px;
  height: 32px;
  border: 2px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: transform 0.1s ease, border-color 0.15s ease;
}

.sr-color-btn:hover {
  transform: scale(1.1);
}

.sr-color-btn--selected {
  border-color: #333;
  box-shadow: 0 0 0 2px white, 0 0 0 4px #333;
}

.sr-color-btn:focus-visible {
  outline: 2px solid #4caf50;
  outline-offset: 2px;
}

.sr-color-custom {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.sr-color-custom label {
  font-size: 0.75rem;
  color: #888;
}

.sr-color-custom input {
  width: 80px;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  font-family: monospace;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}

.sr-color-custom input:focus {
  outline: none;
  border-color: #4caf50;
}

.sr-color-input--active {
  border-color: #4caf50 !important;
}

.sr-color-preview {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid #ccc;
}

/* Speed Slider (Settings tab version) */
.sr-speed-slider {
  margin-bottom: 1rem;
}

.sr-speed-slider label {
  display: block;
  font-size: 0.75rem;
  color: #666;
  margin-bottom: 0.375rem;
}

.sr-speed-slider input[type="range"] {
  width: 100%;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: #e0e0e0;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.sr-speed-slider input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: #4caf50;
  border-radius: 50%;
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.sr-speed-slider input[type="range"]::-webkit-slider-thumb:hover {
  background: #43a047;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .sr-tab-panel {
    animation: none;
  }

  .sr-color-btn {
    transition: none;
  }

  .sr-tab {
    transition: none;
  }
}
```

### Message for Highlight Color Changes

To apply highlight color changes immediately during playback, the popup should notify the content script:

```typescript
// In ColorPicker or App.tsx after color change
const handleColorChange = async (color: HighlightColor) => {
  setHighlightColor(color);
  await setSyncValue(STORAGE_KEYS.highlightColor, color);

  // Notify active tab to update highlighting
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: 'HIGHLIGHT_COLOR_CHANGED',
        color,
      });
    }
  });
};
```

Note: The `HIGHLIGHT_COLOR_CHANGED` message may need to be added to `lib/messages.ts`.

## Architecture Compliance

### Pattern Adherence

| Pattern | Compliance |
|---------|------------|
| ARCH-11: Storage keys | Uses `STORAGE_KEYS.preferredVoice`, etc. from lib/storage.ts |
| FR28: Settings popup | Accessible via tabbed interface in popup |
| FR5: Voice selection | All 24 Kokoro voices in grouped dropdown |
| FR16: Highlight color | Preset colors + custom hex |
| FR25: Speed persistence | Stored in chrome.storage.sync |

### File Structure

```
entrypoints/popup/
  App.tsx               # UPDATE: Add tabs and wire components
  App.css               # UPDATE: Add tab and settings styles
  components/           # NEW: Components directory
    TabNavigation.tsx   # Tab buttons with ARIA
    VoiceSelector.tsx   # Grouped voice dropdown
    ColorPicker.tsx     # Preset buttons + custom input
    SpeedSlider.tsx     # Extracted slider component
```

## Tasks

### Task 1: Create Components Directory and TabNavigation
**AC: 1**
- [ ] Create `entrypoints/popup/components/` directory
- [ ] Create `TabNavigation.tsx` component
- [ ] Implement tab button rendering with active state
- [ ] Add proper ARIA attributes (role, aria-selected, aria-controls)
- [ ] Add keyboard support (arrow keys optional for MVP)

### Task 2: Extract SpeedSlider Component
**AC: 4**
- [ ] Create `SpeedSlider.tsx` component
- [ ] Accept value, onChange, and optional label props
- [ ] Move existing slider styles or create new ones
- [ ] Export from components directory

### Task 3: Create VoiceSelector Component
**AC: 3**
- [ ] Create `VoiceSelector.tsx` component
- [ ] Import voice utilities from `@/lib/constants`
- [ ] Group voices by accent (American/British) and gender
- [ ] Use optgroup elements for visual grouping
- [ ] Display readable names via `getVoiceMetadata()`
- [ ] Save to storage on change

### Task 4: Create ColorPicker Component
**AC: 5**
- [ ] Create `ColorPicker.tsx` component
- [ ] Render four preset color buttons (Yellow, Green, Blue, Pink)
- [ ] Add visual selection indicator (border or checkmark)
- [ ] Add custom hex input field
- [ ] Validate hex format (#RRGGBB)
- [ ] Show color preview for custom colors
- [ ] Save to storage on change

### Task 5: Update App.tsx with Tabs
**AC: 1, 2, 6**
- [ ] Add activeTab state management
- [ ] Import TabNavigation component
- [ ] Restructure JSX into Player and Settings panels
- [ ] Keep Player tab as default active
- [ ] Ensure existing playback controls work unchanged
- [ ] Load all settings on mount

### Task 6: Add Settings Tab Content
**AC: 3, 4, 5**
- [ ] Import VoiceSelector, ColorPicker, SpeedSlider
- [ ] Add components to Settings panel
- [ ] Wire up state for voice, speed, highlightColor
- [ ] Verify settings persistence on popup reopen

### Task 7: Update CSS
**AC: 1, 3, 4, 5**
- [ ] Add tab navigation styles
- [ ] Add voice selector styles
- [ ] Add color picker styles
- [ ] Add speed slider styles (if different from existing)
- [ ] Add reduced-motion support
- [ ] Ensure popup fits within 280px width

### Task 8: Testing
**AC: All**
- [ ] Test tab switching works
- [ ] Test voice selection saves and persists
- [ ] Test speed slider syncs between tabs
- [ ] Test color preset selection
- [ ] Test custom hex input validation
- [ ] Test settings load on popup open
- [ ] Test existing playback controls still work
- [ ] Test on Chrome with extension loaded

## Definition of Done

- [ ] Tabbed navigation with Player and Settings tabs
- [ ] Voice selector with all 24 voices grouped
- [ ] Speed slider working in both tabs (synced)
- [ ] Color picker with 4 presets + custom hex
- [ ] All settings persist to chrome.storage.sync
- [ ] Settings load correctly on popup open
- [ ] Existing playback controls work unchanged
- [ ] Clean, intuitive UI matching existing popup style
- [ ] No TypeScript errors
- [ ] No console errors
- [ ] Proper ARIA attributes for accessibility

## Dependencies

### Depends On
- Story 1-4: Create storage keys and helpers (STORAGE_KEYS)
- Story 3-2: Playback speed control (speed infrastructure)
- lib/constants.ts with voice metadata (already exists)
- lib/storage.ts with typed helpers (already exists)

### Enables
- Story 4-2: Voice selection (UX foundation)
- Story 4-3: Speed preference persistence (UI complete)
- Story 4-4: Highlight color customization (UI complete)
- Story 7-2: Screen reader compatibility (ARIA foundation)

## Test Scenarios

### Manual Testing Checklist

| Scenario | Steps | Expected Behavior |
|----------|-------|-------------------|
| Tab navigation | Click Settings tab | Settings panel shows |
| Tab persistence | Switch tabs multiple times | Active tab state maintained |
| Voice selection | Select different voice | Saves immediately, persists |
| Voice grouping | Open voice dropdown | Voices grouped by accent/gender |
| Speed change | Move speed slider | Updates display, saves |
| Speed sync | Change speed in Settings | Player tab reflects change |
| Preset color | Click Green button | Green selected, saves |
| Custom color | Enter #FF5733 | Color applied, saves |
| Invalid hex | Enter "red" | Not applied, no error |
| Settings persist | Close/reopen popup | All settings restored |
| Playback works | Click Play on Player tab | Playback starts normally |

### Console Log Expectations

```
[SimpleReader] Popup loaded
[SimpleReader] Settings loaded from storage
[SimpleReader] Voice changed: af_bella -> bf_emma
[SimpleReader] Speed changed: 1.0 -> 1.25
[SimpleReader] Highlight color changed: yellow -> #4CAF50
```

## References

- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/storage/)
- [WAI-ARIA Tabs Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)
- [Source: lib/storage.ts] - Storage keys and helpers
- [Source: lib/constants.ts] - Voice metadata and speed constants
- [Source: entrypoints/popup/App.tsx] - Current popup implementation
- [Source: docs/prd.md#FR5,FR16,FR25,FR28] - Requirements

## Dev Notes

### Why Tabs Instead of Separate Pages?

Using tabs within the popup rather than a separate options page because:
1. Settings are simple enough to fit in popup
2. Faster access - no extra click to options page
3. Users expect basic settings in popup
4. Consistent with other Chrome extensions

### Voice Selection UX

Using native `<select>` with `<optgroup>` instead of custom dropdown because:
1. Native accessibility built-in
2. Keyboard navigation works automatically
3. Consistent with OS styling
4. No additional bundle size

Alternative considered: Custom dropdown with search/filter. Deferred to post-MVP if 24 voices feels overwhelming.

### Color Picker Design

Four preset colors chosen based on:
1. Yellow - default, high visibility
2. Green - high contrast, easy on eyes
3. Blue - common preference, readable
4. Pink - alternative for differentiation

Custom hex allows power users to match brand colors or accessibility needs.

### Speed Slider in Both Tabs

Speed appears in both Player and Settings tabs because:
1. Quick access during playback (Player tab)
2. Logical place in preferences (Settings tab)
3. State is synced - changing one updates both
4. Common UX pattern in media apps

## Story Points

**Estimate:** 5 points (medium complexity)

- Multiple new components to create
- Tab state management
- Storage integration for 3 settings
- CSS styling for new UI elements
- Maintaining existing functionality

## Dev Agent Record

### Context Reference

<!-- Path(s) to story context XML will be added here by context workflow -->

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Completion Notes List

<!-- Populated after implementation -->

### File List

- `entrypoints/popup/components/TabNavigation.tsx` (new: tab buttons)
- `entrypoints/popup/components/VoiceSelector.tsx` (new: voice dropdown)
- `entrypoints/popup/components/ColorPicker.tsx` (new: color selection)
- `entrypoints/popup/components/SpeedSlider.tsx` (new: extracted slider)
- `entrypoints/popup/App.tsx` (update: tabs and settings panels)
- `entrypoints/popup/App.css` (update: tab and settings styles)
