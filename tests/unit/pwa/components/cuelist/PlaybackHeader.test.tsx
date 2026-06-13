// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import { PlaybackHeader } from '../../../../../pwa/src/components/cuelist/PlaybackHeader.js';

afterEach(() => cleanup());

const BASE_NOW = 1_000_000;

describe('PlaybackHeader', () => {
  it('renders with data-testid="playback-header"', () => {
    render(
      <PlaybackHeader
        lastFiredLabel={null}
        lastFiredAt={null}
        playheadCueLabel={null}
        firstGoAt={null}
        now={BASE_NOW}
      />,
    );
    expect(screen.getByTestId('playback-header')).toBeInTheDocument();
  });

  it('has aria-live="polite"', () => {
    render(
      <PlaybackHeader
        lastFiredLabel={null}
        lastFiredAt={null}
        playheadCueLabel={null}
        firstGoAt={null}
        now={BASE_NOW}
      />,
    );
    expect(screen.getByTestId('playback-header')).toHaveAttribute('aria-live', 'polite');
  });

  it('shows NEXT cue label when provided', () => {
    render(
      <PlaybackHeader
        lastFiredLabel={null}
        lastFiredAt={null}
        playheadCueLabel="House up"
        firstGoAt={null}
        now={BASE_NOW}
      />,
    );
    expect(screen.getByTestId('playback-header')).toHaveTextContent('House up');
  });

  it('shows em-dash for NEXT when playheadCueLabel is null', () => {
    const { getByTestId } = render(
      <PlaybackHeader
        lastFiredLabel={null}
        lastFiredAt={null}
        playheadCueLabel={null}
        firstGoAt={null}
        now={BASE_NOW}
      />,
    );
    const header = getByTestId('playback-header');
    // Should have at least one em-dash for unknown NEXT
    expect(header.textContent).toContain('—');
  });

  it('shows last fired label with time-ago when provided', () => {
    const lastFiredAt = BASE_NOW - 42_000; // 42s ago
    render(
      <PlaybackHeader
        lastFiredLabel="House up"
        lastFiredAt={lastFiredAt}
        playheadCueLabel={null}
        firstGoAt={null}
        now={BASE_NOW}
      />,
    );
    const header = screen.getByTestId('playback-header');
    expect(header).toHaveTextContent('House up');
    expect(header).toHaveTextContent('42s ago');
  });

  it('formats time-ago as M:SS when over 60 seconds', () => {
    const lastFiredAt = BASE_NOW - 90_000; // 90s ago
    render(
      <PlaybackHeader
        lastFiredLabel="Blackout"
        lastFiredAt={lastFiredAt}
        playheadCueLabel={null}
        firstGoAt={null}
        now={BASE_NOW}
      />,
    );
    expect(screen.getByTestId('playback-header')).toHaveTextContent('1:30 ago');
  });

  it('shows elapsed clock since firstGoAt', () => {
    const firstGoAt = BASE_NOW - 125_000; // 2:05 elapsed
    render(
      <PlaybackHeader
        lastFiredLabel={null}
        lastFiredAt={null}
        playheadCueLabel={null}
        firstGoAt={firstGoAt}
        now={BASE_NOW}
      />,
    );
    expect(screen.getByTestId('playback-header')).toHaveTextContent('2:05');
  });

  it('shows em-dash for elapsed when firstGoAt is null', () => {
    render(
      <PlaybackHeader
        lastFiredLabel={null}
        lastFiredAt={null}
        playheadCueLabel={null}
        firstGoAt={null}
        now={BASE_NOW}
      />,
    );
    // Multiple dashes expected for null fields
    const header = screen.getByTestId('playback-header');
    expect(header.textContent).toContain('—');
  });

  // ── Pre-wait indicator ─────────────────────────────────────────────────────

  it('shows WAITING indicator when preWaitingCueLabel set and preWaitUntil in future', () => {
    render(
      <PlaybackHeader
        lastFiredLabel={null}
        lastFiredAt={null}
        playheadCueLabel={null}
        firstGoAt={null}
        now={BASE_NOW}
        preWaitingCueLabel="Scene 1"
        preWaitUntil={BASE_NOW + 1500}
      />,
    );
    const indicator = screen.getByTestId('prewait-indicator');
    expect(indicator).toBeInTheDocument();
    expect(indicator.textContent).toMatch(/WAITING/);
    expect(indicator.textContent).toMatch(/Scene 1/);
    // 1500ms remaining → 0:01.5
    expect(indicator.textContent).toMatch(/0:01\.5/);
  });

  it('no WAITING indicator when preWaitingCueLabel is null', () => {
    render(
      <PlaybackHeader
        lastFiredLabel={null}
        lastFiredAt={null}
        playheadCueLabel={null}
        firstGoAt={null}
        now={BASE_NOW}
        preWaitingCueLabel={null}
        preWaitUntil={BASE_NOW + 1500}
      />,
    );
    expect(screen.queryByTestId('prewait-indicator')).toBeNull();
  });

  it('no WAITING indicator when preWaitUntil has elapsed', () => {
    render(
      <PlaybackHeader
        lastFiredLabel={null}
        lastFiredAt={null}
        playheadCueLabel={null}
        firstGoAt={null}
        now={BASE_NOW}
        preWaitingCueLabel="Scene 1"
        preWaitUntil={BASE_NOW - 100}
      />,
    );
    expect(screen.queryByTestId('prewait-indicator')).toBeNull();
  });

  it('no WAITING indicator when preWaitUntil is null', () => {
    render(
      <PlaybackHeader
        lastFiredLabel={null}
        lastFiredAt={null}
        playheadCueLabel={null}
        firstGoAt={null}
        now={BASE_NOW}
        preWaitingCueLabel="Scene 1"
        preWaitUntil={null}
      />,
    );
    expect(screen.queryByTestId('prewait-indicator')).toBeNull();
  });
});
