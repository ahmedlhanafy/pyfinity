import type { CSSProperties } from 'react';

interface PillOption {
  key: string;
  label: string;
}

interface PillToggleProps {
  options: PillOption[];
  value: string;
  onChange: (key: string) => void;
  size?: 'sm' | 'md';
  activeStyle?: CSSProperties;
}

export default function PillToggle({
  options,
  value,
  onChange,
  size = 'md',
  activeStyle,
}: PillToggleProps) {
  return (
    <div className={`pill-control pill-${size}`}>
      {options.map((opt) => (
        <button
          key={opt.key}
          className={`pill-segment${opt.key === value ? ' active' : ''}`}
          style={opt.key === value ? activeStyle : undefined}
          onClick={() => onChange(opt.key)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
