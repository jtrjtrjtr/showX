import { useRef, useEffect } from 'react';
import { tokens } from './tokens.js';

export interface InlineEditProps {
  initialValue: string;
  placeholder?: string;
  maxLength?: number;
  onCommit: (value: string) => void;
  onCancel: () => void;
  /** Called on Tab keypress — commit current value and move to next cell. */
  onTab?: (value: string) => void;
}

export function InlineEdit({ initialValue, placeholder, maxLength, onCommit, onCancel, onTab }: InlineEditProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  return (
    <input
      ref={inputRef}
      data-testid="inline-edit-input"
      type="text"
      defaultValue={initialValue}
      placeholder={placeholder}
      maxLength={maxLength}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          onCommit(e.currentTarget.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
        } else if (e.key === 'Tab') {
          e.preventDefault();
          e.stopPropagation();
          if (onTab) {
            onTab(e.currentTarget.value);
          } else {
            onCommit(e.currentTarget.value);
          }
        }
      }}
      onBlur={(e) => {
        onCommit(e.currentTarget.value);
      }}
      style={{
        fontFamily: tokens.font.mono,
        fontSize: 13,
        color: tokens.color.ink,
        background: tokens.color.raised,
        border: `1px solid ${tokens.color.teal}`,
        borderRadius: tokens.radius.s,
        padding: '2px 4px',
        width: '100%',
        outline: 'none',
        boxSizing: 'border-box',
      }}
    />
  );
}
