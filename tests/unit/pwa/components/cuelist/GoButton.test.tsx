// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { GoButton, type GoButtonProps } from '../../../../../pwa/src/components/cuelist/GoButton.js';
import { tokens } from '../../../../../pwa/src/components/cuelist/tokens.js';

afterEach(() => cleanup());

const noop = () => '';
const noopOverride = () => {};

function makeProps(overrides: Partial<GoButtonProps> = {}): GoButtonProps {
  return {
    armedCueId: null,
    cueLabel: undefined,
    mode: 'rehearsal',
    onGo: noop,
    onOverride: noopOverride,
    rejectedReason: null,
    isAuthoritative: true,
    ...overrides,
  };
}

describe('GoButton', () => {
  it('is disabled and shows "no armed cue" aria-label when armedCueId is null', () => {
    render(<GoButton {...makeProps()} />);
    const btn = screen.getByRole('button', { name: /GO — no armed cue/i });
    expect(btn).toBeDisabled();
  });

  it('is enabled and label includes cue label when armedCueId is set', () => {
    render(<GoButton {...makeProps({ armedCueId: 'q1', cueLabel: 'Overture' })} />);
    const btn = screen.getByRole('button', { name: /GO — fire armed cue Overture/i });
    expect(btn).not.toBeDisabled();
  });

  it('click triggers onGo callback', () => {
    const onGo = vi.fn(() => 'req-id');
    render(<GoButton {...makeProps({ armedCueId: 'q1', cueLabel: 'Scene 1', onGo })} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onGo).toHaveBeenCalledTimes(1);
  });

  it('SHOW mode uses red background', () => {
    render(<GoButton {...makeProps({ armedCueId: 'q1', mode: 'show' })} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveStyle({ background: tokens.color.red });
  });

  it('REHEARSAL mode uses teal background', () => {
    render(<GoButton {...makeProps({ armedCueId: 'q1', mode: 'rehearsal' })} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveStyle({ background: tokens.color.teal });
  });

  it('rejectedReason set triggers shaking animation', async () => {
    const { rerender } = render(<GoButton {...makeProps({ armedCueId: 'q1' })} />);
    rerender(<GoButton {...makeProps({ armedCueId: 'q1', rejectedReason: 'not_sm' })} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveStyle({ animation: 'goShake 0.5s' });
  });

  it('long-press 1.5s triggers onOverride', async () => {
    vi.useFakeTimers();
    const onOverride = vi.fn();
    render(<GoButton {...makeProps({ armedCueId: 'q1', onOverride })} />);
    const btn = screen.getByRole('button');
    fireEvent.mouseDown(btn);
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(onOverride).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('short press (< 1.5s) does not trigger onOverride', async () => {
    vi.useFakeTimers();
    const onOverride = vi.fn();
    render(<GoButton {...makeProps({ armedCueId: 'q1', onOverride })} />);
    const btn = screen.getByRole('button');
    fireEvent.mouseDown(btn);
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.mouseUp(btn);
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(onOverride).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('is disabled when not authoritative (isAuthoritative=false)', () => {
    render(<GoButton {...makeProps({ armedCueId: 'q1', isAuthoritative: false })} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('touch start starts long-press timer same as mouse down', async () => {
    vi.useFakeTimers();
    const onOverride = vi.fn();
    render(<GoButton {...makeProps({ armedCueId: 'q1', onOverride })} />);
    const btn = screen.getByRole('button');
    fireEvent.touchStart(btn);
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(onOverride).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('touch end clears long-press timer', async () => {
    vi.useFakeTimers();
    const onOverride = vi.fn();
    render(<GoButton {...makeProps({ armedCueId: 'q1', onOverride })} />);
    const btn = screen.getByRole('button');
    fireEvent.touchStart(btn);
    fireEvent.touchEnd(btn);
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(onOverride).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('has minimum height of 80px for touch usability', () => {
    render(<GoButton {...makeProps({ armedCueId: 'q1' })} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveStyle({ minHeight: '80px' });
  });
});
