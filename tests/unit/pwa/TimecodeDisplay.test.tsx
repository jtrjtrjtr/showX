// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { TimecodeDisplayView } from '../../../pwa/src/components/cuelist/TimecodeDisplay.js';
import type { ClockDisplay } from '../../../pwa/src/hooks/useClock.js';

vi.mock('../../../pwa/src/hooks/useClock.js', () => ({
  useClock: vi.fn(),
}));

afterEach(() => cleanup());

function makeClock(overrides: Partial<ClockDisplay> = {}): ClockDisplay {
  return {
    totalFrames: 0,
    formatted: '00:00:00:00',
    rate: 25,
    dropFrame: false,
    running: false,
    source: 'internal',
    locked: false,
    ...overrides,
  };
}

describe('TimecodeDisplayView', () => {
  it('renders with data-testid="timecode-display"', () => {
    render(<TimecodeDisplayView clock={makeClock()} />);
    expect(screen.getByTestId('timecode-display')).toBeInTheDocument();
  });

  it('renders formatted TC from clock prop', () => {
    render(<TimecodeDisplayView clock={makeClock({ formatted: '01:23:45:12' })} />);
    expect(screen.getByTestId('timecode-digits').textContent).toBe('01:23:45:12');
  });

  it('shows INT badge for internal source', () => {
    render(<TimecodeDisplayView clock={makeClock({ source: 'internal' })} />);
    expect(screen.getByTestId('timecode-source').textContent).toBe('INT');
  });

  it('shows MTC badge for mtc source', () => {
    render(<TimecodeDisplayView clock={makeClock({ source: 'mtc' })} />);
    expect(screen.getByTestId('timecode-source').textContent).toBe('MTC');
  });

  it('shows LTC badge for ltc source', () => {
    render(<TimecodeDisplayView clock={makeClock({ source: 'ltc' })} />);
    expect(screen.getByTestId('timecode-source').textContent).toBe('LTC');
  });

  it('running AND locked → teal digits and green dot', () => {
    render(<TimecodeDisplayView clock={makeClock({ running: true, locked: true })} />);
    const digits = screen.getByTestId('timecode-digits') as HTMLElement;
    const dot = screen.getByTestId('timecode-status-dot') as HTMLElement;
    // tokens.color.teal = '#2DD4BF' → rgb(45, 212, 191)
    expect(digits.style.color).toBe('rgb(45, 212, 191)');
    // tokens.color.green = '#34D399' → rgb(52, 211, 153)
    expect(dot.style.background).toBe('rgb(52, 211, 153)');
    expect(dot.getAttribute('aria-label')).toBe('Clock running');
  });

  it('stopped (running=false, locked=false) → dim ink_disabled styling', () => {
    render(<TimecodeDisplayView clock={makeClock({ running: false, locked: false })} />);
    const digits = screen.getByTestId('timecode-digits') as HTMLElement;
    const dot = screen.getByTestId('timecode-status-dot') as HTMLElement;
    // tokens.color.ink_disabled = '#5C6170' → rgb(92, 97, 112)
    expect(digits.style.color).toBe('rgb(92, 97, 112)');
    expect(dot.style.background).toBe('rgb(92, 97, 112)');
    expect(dot.getAttribute('aria-label')).toBe('Clock stopped');
  });

  it('running but NOT locked → dim (no active)', () => {
    render(<TimecodeDisplayView clock={makeClock({ running: true, locked: false })} />);
    const digits = screen.getByTestId('timecode-digits') as HTMLElement;
    expect(digits.style.color).toBe('rgb(92, 97, 112)');
  });

  it('locked but NOT running → dim', () => {
    render(<TimecodeDisplayView clock={makeClock({ running: false, locked: true })} />);
    const digits = screen.getByTestId('timecode-digits') as HTMLElement;
    expect(digits.style.color).toBe('rgb(92, 97, 112)');
  });

  it('uses tabular-nums CSS for jitter-free layout', () => {
    render(<TimecodeDisplayView clock={makeClock()} />);
    const digits = screen.getByTestId('timecode-digits') as HTMLElement;
    expect(digits.style.fontVariantNumeric).toBe('tabular-nums');
  });

  it('uses mono font family', () => {
    render(<TimecodeDisplayView clock={makeClock()} />);
    const digits = screen.getByTestId('timecode-digits') as HTMLElement;
    expect(digits.style.fontFamily.toLowerCase()).toContain('mono');
  });

  it('default size is 48px', () => {
    render(<TimecodeDisplayView clock={makeClock()} />);
    const digits = screen.getByTestId('timecode-digits') as HTMLElement;
    expect(digits.style.fontSize).toBe('48px');
  });

  it('custom size prop is applied to digits', () => {
    render(<TimecodeDisplayView clock={makeClock()} size={28} />);
    const digits = screen.getByTestId('timecode-digits') as HTMLElement;
    expect(digits.style.fontSize).toBe('28px');
  });

  it('source badge is also teal when active', () => {
    render(<TimecodeDisplayView clock={makeClock({ source: 'mtc', running: true, locked: true })} />);
    const badge = screen.getByTestId('timecode-source') as HTMLElement;
    expect(badge.style.color).toBe('rgb(45, 212, 191)');
  });

  it('source badge is dim when inactive', () => {
    render(<TimecodeDisplayView clock={makeClock({ source: 'mtc', running: false, locked: false })} />);
    const badge = screen.getByTestId('timecode-source') as HTMLElement;
    expect(badge.style.color).toBe('rgb(92, 97, 112)');
  });
});

describe('TimecodeDisplay (connected — mocked useClock)', () => {
  let mockUseClock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const clockModule = await import('../../../pwa/src/hooks/useClock.js');
    mockUseClock = vi.mocked(clockModule.useClock);
  });

  it('renders formatted TC from useClock hook', async () => {
    mockUseClock.mockReturnValue(makeClock({ formatted: '00:01:00:00', source: 'mtc', running: true, locked: true }));
    const { TimecodeDisplay } = await import('../../../pwa/src/components/cuelist/TimecodeDisplay.js');
    render(<TimecodeDisplay />);
    expect(screen.getByTestId('timecode-digits').textContent).toBe('00:01:00:00');
    expect(screen.getByTestId('timecode-source').textContent).toBe('MTC');
  });

  it('stopped clock from useClock → dim digits', async () => {
    mockUseClock.mockReturnValue(makeClock({ formatted: '00:00:00:00', running: false, locked: false }));
    const { TimecodeDisplay } = await import('../../../pwa/src/components/cuelist/TimecodeDisplay.js');
    render(<TimecodeDisplay />);
    const digits = screen.getByTestId('timecode-digits') as HTMLElement;
    expect(digits.style.color).toBe('rgb(92, 97, 112)');
  });
});
