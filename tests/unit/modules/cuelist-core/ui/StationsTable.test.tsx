// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);
import { StationsTable, type Awareness, type OperatorRecord } from '../../../../../src/modules/cuelist-core/src/ui/StationsTable.js';

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

const makeOperator = (overrides: Partial<OperatorRecord> = {}): OperatorRecord => ({
  device_id: 'dev-1',
  display_name: 'Alice SM',
  owned_departments: ['SM'],
  role: 'sm',
  status: 'active',
  last_seen_at: Date.now() - 30_000,
  ...overrides,
});

describe('StationsTable — operators / Paired Devices section', () => {
  it('does not render Paired Devices section when operators prop is absent', () => {
    render(<StationsTable stations={[]} canKick={false} onKick={vi.fn()} />);
    expect(screen.queryByText('Paired Devices')).toBeNull();
  });

  it('does not render Paired Devices section when operators array is empty', () => {
    render(<StationsTable stations={[]} canKick={false} onKick={vi.fn()} operators={[]} />);
    expect(screen.queryByText('Paired Devices')).toBeNull();
  });

  it('renders Paired Devices section heading when operators array is non-empty', () => {
    render(<StationsTable stations={[]} canKick={false} onKick={vi.fn()} operators={[makeOperator()]} />);
    expect(screen.getByText('Paired Devices')).toBeTruthy();
  });

  it('renders operator display_name and role label', () => {
    render(
      <StationsTable
        stations={[]}
        canKick={false}
        onKick={vi.fn()}
        operators={[makeOperator({ display_name: 'Alice SM', role: 'sm' })]}
      />,
    );
    expect(screen.getByText('Alice SM')).toBeTruthy();
    expect(screen.getAllByText('SM').length).toBeGreaterThan(0);
  });

  it('renders "active" status for active operator', () => {
    render(
      <StationsTable stations={[]} canKick={false} onKick={vi.fn()} operators={[makeOperator({ status: 'active' })]} />,
    );
    expect(screen.getByText('active')).toBeTruthy();
  });

  it('renders "revoked" status for revoked operator', () => {
    render(
      <StationsTable
        stations={[]}
        canKick={false}
        onKick={vi.fn()}
        operators={[makeOperator({ status: 'revoked' })]}
      />,
    );
    expect(screen.getByText('revoked')).toBeTruthy();
  });

  it('shows Revoke button for active operator when canKick=true', () => {
    render(
      <StationsTable
        stations={[]}
        canKick={true}
        onKick={vi.fn()}
        operators={[makeOperator({ status: 'active' })]}
        onRevoke={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /revoke/i })).toBeTruthy();
  });

  it('hides Revoke button for revoked operator', () => {
    render(
      <StationsTable
        stations={[]}
        canKick={true}
        onKick={vi.fn()}
        operators={[makeOperator({ status: 'revoked' })]}
        onRevoke={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /revoke/i })).toBeNull();
  });

  it('calls onRevoke with device_id when Revoke button is clicked', () => {
    const onRevoke = vi.fn();
    render(
      <StationsTable
        stations={[]}
        canKick={true}
        onKick={vi.fn()}
        operators={[makeOperator({ device_id: 'target-dev', status: 'active' })]}
        onRevoke={onRevoke}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /revoke/i }));
    expect(onRevoke).toHaveBeenCalledWith('target-dev');
  });
});
