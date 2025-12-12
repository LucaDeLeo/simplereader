import { useState, useEffect } from 'react';
import { STORAGE_KEYS, getSyncValue } from '@/lib/storage';
import './App.css';

function App() {
  const [status, setStatus] = useState<'ready' | 'loading'>('ready');
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
  }, []);

  return (
    <div className="popup">
      <h1>SimpleReader</h1>
      <p className="description">
        Text-to-speech with word-level highlighting
      </p>
      <p className="status">
        Status: {status === 'ready' ? 'Ready' : 'Loading...'}
      </p>
      {voiceName && (
        <p className="voice">Voice: {voiceName}</p>
      )}
      {speed !== null && (
        <p className="speed">Speed: {speed}x</p>
      )}
    </div>
  );
}

export default App;
