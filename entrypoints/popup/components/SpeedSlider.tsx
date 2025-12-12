import { MIN_SPEED, MAX_SPEED } from '@/lib/constants';

interface SpeedSliderProps {
  value: number;
  onChange: (speed: number) => void;
  label?: string;
}

export function SpeedSlider({ value, onChange, label = 'Speed' }: SpeedSliderProps) {
  return (
    <div className="sr-speed-slider">
      <label htmlFor="sr-speed-slider-input">{label}: {value}x</label>
      <input
        type="range"
        id="sr-speed-slider-input"
        min={MIN_SPEED}
        max={MAX_SPEED}
        step={0.25}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}
