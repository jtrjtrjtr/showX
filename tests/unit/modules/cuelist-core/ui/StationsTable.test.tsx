// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { StationsTable, type Awareness } from '../../../../../src/modules/cuelist-core/src/ui/StationsTable.js';

const now = new Date().toISOString();

const makeStation = (overrides: Partial<Awareness> = {}): Awareness => ({
  station_id: 'station-1',
  display_name: 'FOH Console',
  owned_departments: ['LX', 'SX'],
  watched_departments: ['VIDEO'],
  last_heartbeat_at: now,
  presence_color: '#0FA298',
  ...overrides,
});

describe('StationsTable', () => {
  it('shows "No stations connected" when stations array is empty', () => {
    render(<StationsTable stations={[]} canKick={false} onKick={vi.fn()} />);
    expect(screen.getByText(/no stations connected/i)).toBeTruthy();
  });

  it('renders a row for each station with display_name', () => {
    const stations = [
      makeStation({ station_id: 's1', display_name: 'FOH' }),
      makeStation({ station_id: 's2', display_name: 'Stage Left' }),
      makeStation({ station_id: 's3', display_name: 'Monitor Desk' }),
    ];
    render(<StationsTable stations={stations} canKick={false} onKick={vi.fn()} />);
    expect(screen.getByText('FOH')).toBeTruthy();
    expect(screen.getByText('Stage Left')).toBeTruthy();
    expect(screen.getByText('Monitor Desk')).toBeTruthy();
  });

  it('renders owned department chips for each station', () => {
    const stations = [makeStation({ owned_departments: ['LX', 'SX'] })];
    render(<StationsTable stations={stations} canKick={false} onKick={vi.fn()} />);
    expect(screen.getAllByText('LX').length).toBeGreaterThan(0);
    expect(screen.getAllByText('SX').length).toBeGreaterThan(0);
  });

  it('renders watched department chips for each station', () => {
    const stations = [makeStation({ watched_departments: ['VIDEO', 'AUTO'] })];
    render(<StationsTable stations={stations} canKick={false} onKick={vi.fn()} />);
    expect(screen.getAllByText('VIDEO').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AUTO').length).toBeGreaterThan(0);
  });

  it('renders presence color dot with aria-label', () => {
    const stations = [makeStation({ presence_color: '#0FA298' })];
    render(<StationsTable stations={stations} canKick={false} onKick={vi.fn()} />);
    const dot = screen.getByLabelText(/presence: #0FA298/i);
    expect(dot).toBeTruthy();
  });

  it('hides kick button when canKick is false', () => {
    const stations = [makeStation({ station_id: 's1' })];
    render(<StationsTable stations={stations} canKick={false} onKick={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /kick/i })).toBeNull();
  });

  it('shows kick button when canKick is true', () => {
    const stations = [makeStation({ station_id: 's1' })];
    render(<StationsTable stations={stations} canKick={true} onKick={vi.fn()} />);
    expect(screen.getByRole('button', { name: /kick/i })).toBeTruthy();
  });

  it('calls onKick with the correct station_id when kick button clicked', () => {
    const onKick = vi.fn();
    const stations = [makeStation({ station_id: 'target-station' })];
    render(<StationsTable stations={stations} canKick={true} onKick={onKick} />);
    fireEvent.click(screen.getByRole('button', { name: /kick/i }));
    expect(onKick).toHaveBeenCalledWith('target-station');
  });

  it('renders one kick button per station when canKick is true', () => {
    const onKick = vi.fn();
    const stations = [
      makeStation({ station_id: 's1', display_name: 'A' }),
      makeStation({ station_id: 's2', display_name: 'B' }),
    ];
    render(<StationsTable stations={stations} canKick={true} onKick={onKick} />);
    expect(screen.getAllByRole('button', { name: /kick/i })).toHaveLength(2);
  });

  it('renders table header rows for Name, Owned, Watched, Last seen columns', () => {
    const stations = [makeStation()];
    render(<StationsTable stations={stations} canKick={false} onKick={vi.fn()} />);
    expect(screen.getByText('Name')).toBeTruthy();
    expect(screen.getByText('Owned')).toBeTruthy();
    expect(screen.getByText('Watched')).toBeTruthy();
    expect(screen.getByText('Last seen')).toBeTruthy();
  });
});
