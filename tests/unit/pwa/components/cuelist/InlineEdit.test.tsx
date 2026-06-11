// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import React from 'react';
import { InlineEdit } from '../../../../../pwa/src/components/cuelist/InlineEdit.js';

afterEach(() => cleanup());

describe('InlineEdit', () => {
  it('renders an input with initial value', () => {
    render(<InlineEdit initialValue="1A" onCommit={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByTestId('inline-edit-input') as HTMLInputElement;
    expect(input.value).toBe('1A');
  });

  it('calls onCommit with input value on Enter', () => {
    const onCommit = vi.fn();
    render(<InlineEdit initialValue="A" onCommit={onCommit} onCancel={vi.fn()} />);
    const input = screen.getByTestId('inline-edit-input');
    fireEvent.change(input, { target: { value: 'B' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('B');
  });

  it('calls onCancel on Escape', () => {
    const onCancel = vi.fn();
    const onCommit = vi.fn();
    render(<InlineEdit initialValue="A" onCommit={onCommit} onCancel={onCancel} />);
    const input = screen.getByTestId('inline-edit-input');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('calls onCommit on blur', () => {
    const onCommit = vi.fn();
    render(<InlineEdit initialValue="X" onCommit={onCommit} onCancel={vi.fn()} />);
    const input = screen.getByTestId('inline-edit-input');
    fireEvent.change(input, { target: { value: 'Y' } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('Y');
  });

  it('calls onTab with value on Tab keypress when onTab provided', () => {
    const onTab = vi.fn();
    const onCommit = vi.fn();
    render(<InlineEdit initialValue="A" onCommit={onCommit} onCancel={vi.fn()} onTab={onTab} />);
    const input = screen.getByTestId('inline-edit-input');
    fireEvent.change(input, { target: { value: 'B' } });
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(onTab).toHaveBeenCalledWith('B');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('calls onCommit on Tab when no onTab provided', () => {
    const onCommit = vi.fn();
    render(<InlineEdit initialValue="A" onCommit={onCommit} onCancel={vi.fn()} />);
    const input = screen.getByTestId('inline-edit-input');
    fireEvent.change(input, { target: { value: 'C' } });
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(onCommit).toHaveBeenCalledWith('C');
  });

  it('respects maxLength prop', () => {
    render(<InlineEdit initialValue="" maxLength={8} onCommit={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByTestId('inline-edit-input') as HTMLInputElement;
    expect(input.maxLength).toBe(8);
  });

  it('renders placeholder when provided', () => {
    render(<InlineEdit initialValue="" placeholder="#" onCommit={vi.fn()} onCancel={vi.fn()} />);
    const input = screen.getByTestId('inline-edit-input') as HTMLInputElement;
    expect(input.placeholder).toBe('#');
  });
});
