// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { TransportBar, type TransportBarProps } from '../../../../../pwa/src/components/cuelist/TransportBar.js';

afterEach(() => cleanup());

function makeProps(overrides: Partial<TransportBarProps> = {}): TransportBarProps {
  return {
    onBack: vi.fn(),
    onUnarm: vi.fn(),
    backDisabled: false,
    unarmDisabled: false,
    ...overrides,
  };
}

describe('TransportBar', () => {
  it('renders BACK and UNARM buttons with correct testids', () => {
    render(<TransportBar {...makeProps()} />);
    expect(screen.getByTestId('transport-back')).toBeInTheDocument();
    expect(screen.getByTestId('transport-unarm')).toBeInTheDocument();
  });

  it('BACK button calls onBack when clicked', () => {
    const onBack = vi.fn();
    render(<TransportBar {...makeProps({ onBack })} />);
    fireEvent.click(screen.getByTestId('transport-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('UNARM button calls onUnarm when clicked', () => {
    const onUnarm = vi.fn();
    render(<TransportBar {...makeProps({ onUnarm })} />);
    fireEvent.click(screen.getByTestId('transport-unarm'));
    expect(onUnarm).toHaveBeenCalledTimes(1);
  });

  it('BACK button is disabled when backDisabled=true', () => {
    render(<TransportBar {...makeProps({ backDisabled: true })} />);
    expect(screen.getByTestId('transport-back')).toBeDisabled();
  });

  it('UNARM button is disabled when unarmDisabled=true', () => {
    render(<TransportBar {...makeProps({ unarmDisabled: true })} />);
    expect(screen.getByTestId('transport-unarm')).toBeDisabled();
  });

  it('BACK disabled button does not call onBack when clicked', () => {
    const onBack = vi.fn();
    render(<TransportBar {...makeProps({ backDisabled: true, onBack })} />);
    fireEvent.click(screen.getByTestId('transport-back'));
    expect(onBack).not.toHaveBeenCalled();
  });

  it('UNARM disabled button does not call onUnarm when clicked', () => {
    const onUnarm = vi.fn();
    render(<TransportBar {...makeProps({ unarmDisabled: true, onUnarm })} />);
    fireEvent.click(screen.getByTestId('transport-unarm'));
    expect(onUnarm).not.toHaveBeenCalled();
  });

  it('both buttons are at least 56px tall', () => {
    render(<TransportBar {...makeProps()} />);
    const back = screen.getByTestId('transport-back');
    const unarm = screen.getByTestId('transport-unarm');
    expect(back).toHaveStyle({ minHeight: '56px' });
    expect(unarm).toHaveStyle({ minHeight: '56px' });
  });

  it('both buttons have aria-labels', () => {
    render(<TransportBar {...makeProps()} />);
    expect(screen.getByLabelText('BACK — re-arm previous cue')).toBeInTheDocument();
    expect(screen.getByLabelText('UNARM — disarm current cue')).toBeInTheDocument();
  });
});
