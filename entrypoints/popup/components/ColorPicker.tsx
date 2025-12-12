import { useState, useEffect } from 'react';
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
    const isPreset = PRESET_COLORS.some((p) => p.value === value);
    if (!isPreset && value.startsWith('#')) {
      setIsCustom(true);
      setCustomHex(value);
    } else {
      setIsCustom(false);
    }
  }, [value]);

  const handlePresetSelect = async (color: HighlightColor) => {
    setIsCustom(false);
    setCustomHex('');
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
          <span className="sr-color-preview" style={{ backgroundColor: customHex }} />
        )}
      </div>
    </div>
  );
}
