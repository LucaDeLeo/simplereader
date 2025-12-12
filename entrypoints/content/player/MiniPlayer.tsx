// entrypoints/content/player/MiniPlayer.tsx
// React component for the floating mini-player UI

import type { PlaybackState } from '@/lib/messages';

// SVG Icons as React components
function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M4 2l10 6-10 6V2z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M3 2h4v12H3V2zm6 0h4v12H9V2z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M3 3h10v10H3V3z" />
    </svg>
  );
}

export interface MiniPlayerProps {
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
  // Don't render when stopped
  if (state === 'stopped') {
    return null;
  }

  const isPlaying = state === 'playing';
  const isLoading = state === 'loading';

  return (
    <div className="sr-player">
      <div className="sr-player__controls">
        <button
          className="sr-player__button sr-player__button--play-pause"
          onClick={isPlaying ? onPause : onPlay}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          disabled={isLoading}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
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
        {isLoading ? (
          <span className="sr-player__loading">Loading...</span>
        ) : (
          <span>
            {currentPosition.toLocaleString()} / {totalWords.toLocaleString()}
          </span>
        )}
      </div>
    </div>
  );
}
