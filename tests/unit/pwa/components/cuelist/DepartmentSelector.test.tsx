// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import React, { useState } from 'react';
import type { DepartmentTag } from 'showx-shared';
import { DepartmentSelector } from '../../../../../pwa/src/components/cuelist/DepartmentSelector.js';

afterEach(() => cleanup());

function Controlled({ initial }: { initial: DepartmentTag[] }) {
  const [value, setValue] = useState<DepartmentTag[]>(initial);
  return <DepartmentSelector value={value} onChange={setValue} />;
}

describe('DepartmentSelector', () => {
  it('renders chips for all 8 canonical departments', () => {
    render(<DepartmentSelector value={['SM']} onChange={() => {}} />);
    for (const dept of ['LX', 'SX', 'VIDEO', 'AUTO', 'PYRO', 'FS', 'SM', 'OTHER']) {
      expect(screen.getByRole('button', { name: dept })).toBeInTheDocument();
    }
  });

  it('active chip has aria-pressed=true, inactive has false', () => {
    render(<DepartmentSelector value={['LX']} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'LX' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'SX' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking inactive chip adds it to selection', async () => {
    render(<Controlled initial={['SM']} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'LX' }));
    });

    expect(screen.getByRole('button', { name: 'LX' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'SM' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking active chip removes it from selection', async () => {
    render(<Controlled initial={['LX', 'SM']} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'LX' }));
    });

    expect(screen.getByRole('button', { name: 'LX' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'SM' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not allow removing the last department (shows error if empty)', () => {
    // When value is already empty, error is shown
    render(<DepartmentSelector value={[]} onChange={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/≥ 1 department/);
  });

  it('clicking the only active chip does not call onChange (empty rejected)', async () => {
    const onChange = vi.fn();
    render(<DepartmentSelector value={['SM']} onChange={onChange} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'SM' }));
    });

    // onChange should not be called when removing would leave empty
    expect(onChange).not.toHaveBeenCalled();
  });
});
