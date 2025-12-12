import { useState, useEffect } from 'react';
import { STORAGE_KEYS, getSyncValue } from '@/lib/storage';
import { Messages, type PlaybackState, type Message } from '@/lib/messages';
import './App.css';

function App() {
  const [playbackState, setPlaybackState] = useState<PlaybackState>('stopped');
  const [error, setError] = useState<string | null>(null);
  const [voiceName, setVoiceName] = useState<string>('');
  const [speed, setSpeed] = useState<number | null>(null);

  useEffect(() => {
    // Load current settings to display
    async function loadSettings() {
      const voice = await getSyncValue(STORAGE_KEYS.preferredVoice);
      const speedValue = await getSyncValue(STORAGE_KEYS.preferredSpeed);
      if (voice) setVoiceName(voice);
      if (speedValue !== undefined) setSpeed(speedValue);
    }
    loadSettings();

    // Listen for playback state changes and errors
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
      <p className="description">
        Text-to-speech with word-level highlighting
      </p>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

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

      <div className="settings-info">
        {voiceName && <span className="setting">Voice: {formatVoiceName(voiceName)}</span>}
        {speed !== null && <span className="setting">Speed: {speed}x</span>}
      </div>
    </div>
  );
}

// Format voice ID to readable name (e.g., "af_bella" -> "Bella")
function formatVoiceName(voice: string): string {
  const parts = voice.split('_');
  if (parts.length > 1) {
    return parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
  }
  return voice;
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
