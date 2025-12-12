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
    americanFemale: voices.filter((v) => {
      const m = getVoiceMetadata(v);
      return m.accent === 'american' && m.gender === 'female';
    }),
    americanMale: voices.filter((v) => {
      const m = getVoiceMetadata(v);
      return m.accent === 'american' && m.gender === 'male';
    }),
    britishFemale: voices.filter((v) => {
      const m = getVoiceMetadata(v);
      return m.accent === 'british' && m.gender === 'female';
    }),
    britishMale: voices.filter((v) => {
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
          {grouped.americanFemale.map((v) => (
            <option key={v} value={v}>
              {getVoiceMetadata(v).name}
            </option>
          ))}
        </optgroup>
        <optgroup label="American Male">
          {grouped.americanMale.map((v) => (
            <option key={v} value={v}>
              {getVoiceMetadata(v).name}
            </option>
          ))}
        </optgroup>
        <optgroup label="British Female">
          {grouped.britishFemale.map((v) => (
            <option key={v} value={v}>
              {getVoiceMetadata(v).name}
            </option>
          ))}
        </optgroup>
        <optgroup label="British Male">
          {grouped.britishMale.map((v) => (
            <option key={v} value={v}>
              {getVoiceMetadata(v).name}
            </option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}
