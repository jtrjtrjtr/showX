// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { GoButton, type GoButtonProps, HOLD_GO_THRESHOLD_MS } from '../../../../../pwa/src/components/cuelist/GoButton.js';
import { tokens } from '../../../../../pwa/src/components/cuelist/tokens.js';

afterEach(() => cleanup());

const noop = vi.fn();
const noopOverride = vi.fn();

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

  it('click triggers onGo callback (rehearsal mode)', () => {
    const onGo = vi.fn();
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

  it('long-press 1.5s triggers onOverride in rehearsal mode', async () => {
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

  it('short press (< 1.5s) does not trigger onOverride in rehearsal mode', async () => {
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

  it('touch start starts long-press timer same as mouse down (rehearsal)', async () => {
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

  it('touch end clears long-press timer (rehearsal)', async () => {
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

  // ── B003-603 new behaviour ────────────────────────────────────────────────

  it('HOLD_GO_THRESHOLD_MS is exported and equals 250', () => {
    expect(HOLD_GO_THRESHOLD_MS).toBe(250);
  });

  it('SHOW mode: instant click does NOT fire onGo', () => {
    const onGo = vi.fn();
    render(<GoButton {...makeProps({ armedCueId: 'q1', mode: 'show', onGo })} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onGo).not.toHaveBeenCalled();
  });

  it('SHOW mode: mouseDown held for 250ms fires onGo', async () => {
    vi.useFakeTimers();
    const onGo = vi.fn();
    render(<GoButton {...makeProps({ armedCueId: 'q1', mode: 'show', onGo })} />);
    const btn = screen.getByRole('button');
    fireEvent.mouseDown(btn);
    await act(async () => {
      vi.advanceTimersByTime(HOLD_GO_THRESHOLD_MS);
    });
    expect(onGo).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('SHOW mode: mouseUp before 250ms cancels hold and does not fire', async () => {
    vi.useFakeTimers();
    const onGo = vi.fn();
    render(<GoButton {...makeProps({ armedCueId: 'q1', mode: 'show', onGo })} />);
    const btn = screen.getByRole('button');
    fireEvent.mouseDown(btn);
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.mouseUp(btn);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(onGo).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('SHOW mode: touchStart held for 250ms fires onGo', async () => {
    vi.useFakeTimers();
    const onGo = vi.fn();
    render(<GoButton {...makeProps({ armedCueId: 'q1', mode: 'show', onGo })} />);
    const btn = screen.getByRole('button');
    fireEvent.touchStart(btn);
    await act(async () => {
      vi.advanceTimersByTime(HOLD_GO_THRESHOLD_MS);
    });
    expect(onGo).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('SHOW mode: touchEnd before 250ms cancels hold', async () => {
    vi.useFakeTimers();
    const onGo = vi.fn();
    render(<GoButton {...makeProps({ armedCueId: 'q1', mode: 'show', onGo })} />);
    const btn = screen.getByRole('button');
    fireEvent.touchStart(btn);
    await act(async () => { vi.advanceTimersByTime(100); });
    fireEvent.touchEnd(btn);
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(onGo).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('goInert=true: click does not fire onGo (debounce guard)', () => {
    const onGo = vi.fn();
    render(<GoButton {...makeProps({ armedCueId: 'q1', onGo, goInert: true })} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onGo).not.toHaveBeenCalled();
  });

  it('goInert=true: press in show mode does not start hold', async () => {
    vi.useFakeTimers();
    const onGo = vi.fn();
    render(<GoButton {...makeProps({ armedCueId: 'q1', mode: 'show', onGo, goInert: true })} />);
    const btn = screen.getByRole('button');
    fireEvent.mouseDown(btn);
    await act(async () => { vi.advanceTimersByTime(HOLD_GO_THRESHOLD_MS + 100); });
    expect(onGo).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('firedConfirmLabel shows "fired: {label}" with data-testid', () => {
    render(
      <GoButton
        {...makeProps({ armedCueId: 'q1', firedConfirmLabel: 'Overture' })}
      />
    );
    const confirm = screen.getByTestId('go-fired-confirm');
    expect(confirm).toHaveTextContent('fired: Overture');
  });

  it('firedConfirmLabel is not rendered when null', () => {
    render(<GoButton {...makeProps({ armedCueId: 'q1', firedConfirmLabel: null })} />);
    expect(screen.queryByTestId('go-fired-confirm')).toBeNull();
  });

  it('followCount > 0 shows "+N follow" subtitle', () => {
    render(<GoButton {...makeProps({ armedCueId: 'q1', followCount: 3 })} />);
    expect(screen.getByText('+3 follow')).toBeInTheDocument();
  });

  it('followCount 0 does not show follow subtitle', () => {
    render(<GoButton {...makeProps({ armedCueId: 'q1', followCount: 0 })} />);
    expect(screen.queryByText(/follow/i)).toBeNull();
  });

  it('followCount caps display at +9', () => {
    render(<GoButton {...makeProps({ armedCueId: 'q1', followCount: 15 })} />);
    expect(screen.getByText('+9 follow')).toBeInTheDocument();
  });

  it('goInert applies desaturated visual (opacity 0.55)', () => {
    render(<GoButton {...makeProps({ armedCueId: 'q1', goInert: true })} />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveStyle({ opacity: '0.55' });
  });
});
