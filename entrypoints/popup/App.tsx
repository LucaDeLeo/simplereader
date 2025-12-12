import { useState, useEffect } from 'react';
import { STORAGE_KEYS, getSyncValue, setSyncValue, type HighlightColor } from '@/lib/storage';
import { Messages, type PlaybackState, type Message } from '@/lib/messages';
import { DEFAULT_SPEED, DEFAULT_VOICE, type KokoroVoice } from '@/lib/constants';
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
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      const storedVoice = await getSyncValue(STORAGE_KEYS.preferredVoice);
      const storedSpeed = await getSyncValue(STORAGE_KEYS.preferredSpeed);
      const storedColor = await getSyncValue(STORAGE_KEYS.highlightColor);

      if (storedVoice) setVoice(storedVoice as KokoroVoice);
      if (storedSpeed !== undefined) setSpeed(storedSpeed);
      if (storedColor) setHighlightColor(storedColor);
      setSettingsLoaded(true);
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
          <p className="description">Text-to-speech with word-level highlighting</p>

          {error && <div className="error-message">{error}</div>}

          <div className="controls">
            {playbackState === 'stopped' && (
              <button onClick={handlePlay} className="control-button play">
                <PlayIcon />
                <span>Play</span>
              </button>
            )}

            {playbackState === 'loading' && (
              <button disabled className="control-button loading">
                <LoadingSpinner />
                <span>Loading...</span>
              </button>
            )}

            {playbackState === 'playing' && (
              <>
                <button onClick={handlePause} className="control-button pause">
                  <PauseIcon />
                  <span>Pause</span>
                </button>
                <button onClick={handleStop} className="control-button stop">
                  <StopIcon />
                  <span>Stop</span>
                </button>
              </>
            )}

            {playbackState === 'paused' && (
              <>
                <button onClick={handlePlay} className="control-button play">
                  <PlayIcon />
                  <span>Resume</span>
                </button>
                <button onClick={handleStop} className="control-button stop">
                  <StopIcon />
                  <span>Stop</span>
                </button>
              </>
            )}
          </div>

          <div className="status-bar">
            {playbackState === 'stopped' && 'Click Play to start reading'}
            {playbackState === 'loading' && 'Generating audio...'}
            {playbackState === 'playing' && 'Now playing'}
            {playbackState === 'paused' && 'Paused'}
          </div>

          {settingsLoaded && <SpeedSlider value={speed} onChange={handleSpeedChange} />}
        </div>
      )}

      {activeTab === 'settings' && settingsLoaded && (
        <div className="sr-tab-panel" id="panel-settings" role="tabpanel">
          <VoiceSelector value={voice} onChange={setVoice} />
          <SpeedSlider value={speed} onChange={handleSpeedChange} />
          <ColorPicker value={highlightColor} onChange={setHighlightColor} />
        </div>
      )}
    </div>
  );
}

// Icon components
function PlayIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6h12v12H6z" />
    </svg>
  );
}

function LoadingSpinner() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      className="spinner"
      role="img"
      aria-label="Loading"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeDasharray="31.4 31.4"
      />
    </svg>
  );
}

export default App;
