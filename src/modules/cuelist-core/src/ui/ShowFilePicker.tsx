import React from 'react';
import { tokens } from './tokens.js';

interface ShowFilePickerProps {
  onOpen: () => void;
  onNew: () => void;
}

export function ShowFilePicker({ onOpen, onNew }: ShowFilePickerProps) {
  return (
    <div style={{ display: 'flex', gap: tokens.space.m }}>
      <button
        onClick={onOpen}
        style={{
          background: tokens.color.teal,
          color: tokens.color.cream,
          border: 'none',
          borderRadius: tokens.radius.m,
          padding: `${tokens.space.s}px ${tokens.space.l}px`,
          fontFamily: tokens.font.ui,
          fontWeight: 600,
          cursor: 'pointer',
          fontSize: 14,
        }}
      >
        Open .showx
      </button>
      <button
        onClick={onNew}
        style={{
          background: tokens.color.cream,
          color: tokens.color.ink,
          border: `1px solid ${tokens.color.gray_300}`,
          borderRadius: tokens.radius.m,
          padding: `${tokens.space.s}px ${tokens.space.l}px`,
          fontFamily: tokens.font.ui,
          fontWeight: 600,
          cursor: 'pointer',
          fontSize: 14,
        }}
      >
        New show
      </button>
    </div>
  );
}
