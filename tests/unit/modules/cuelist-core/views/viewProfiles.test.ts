import { describe, it, expect } from 'vitest';
import {
  viewProfiles,
  profileForRole,
} from '../../../../../src/modules/cuelist-core/src/views/viewProfiles.js';

describe('viewProfiles', () => {
  it('sm(): owned=[SM], watched contains all 7 others', () => {
    const p = viewProfiles.sm();
    expect(p.owned).toEqual(['SM']);
    expect(p.watched).toHaveLength(7);
    expect(p.watched).not.toContain('SM');
    expect(p.watched).toContain('LX');
    expect(p.watched).toContain('OTHER');
  });

  it('lx(): owned=[LX], watched=[SM]', () => {
    const p = viewProfiles.lx();
    expect(p.owned).toEqual(['LX']);
    expect(p.watched).toEqual(['SM']);
  });

  it('sx(): owned=[SX], watched=[SM]', () => {
    const p = viewProfiles.sx();
    expect(p.owned).toEqual(['SX']);
    expect(p.watched).toEqual(['SM']);
  });

  it('video(): owned=[VIDEO], watched=[SM]', () => {
    expect(viewProfiles.video().owned).toEqual(['VIDEO']);
  });

  it('auto(): owned=[AUTO], watched=[SM]', () => {
    expect(viewProfiles.auto().owned).toEqual(['AUTO']);
  });

  it('pyro(): owned=[PYRO], watched=[SM]', () => {
    expect(viewProfiles.pyro().owned).toEqual(['PYRO']);
  });

  it('fs(): owned=[FS], watched=[SM]', () => {
    expect(viewProfiles.fs().owned).toEqual(['FS']);
  });

  it('other(): owned=[OTHER], watched=[SM]', () => {
    expect(viewProfiles.other().owned).toEqual(['OTHER']);
  });

  it('director(): owned=[], watched=all 8 departments', () => {
    const p = viewProfiles.director();
    expect(p.owned).toEqual([]);
    expect(p.watched).toHaveLength(8);
    expect(p.watched).toContain('LX');
    expect(p.watched).toContain('SM');
    expect(p.watched).toContain('OTHER');
  });

  it('solo(): owned=[LX,SX,VIDEO], watched=[SM]', () => {
    const p = viewProfiles.solo();
    expect(p.owned).toEqual(['LX', 'SX', 'VIDEO']);
    expect(p.watched).toEqual(['SM']);
  });

  it('each call returns a new object (no singleton mutation risk)', () => {
    const a = viewProfiles.sm();
    const b = viewProfiles.sm();
    expect(a).not.toBe(b);
    a.owned.push('LX' as never);
    expect(viewProfiles.sm().owned).toEqual(['SM']);
  });
});

describe('profileForRole', () => {
  it('stage_manager → sm profile', () => {
    const p = profileForRole('stage_manager');
    expect(p.owned).toEqual(['SM']);
    expect(p.watched).toHaveLength(7);
  });

  it('director → director profile (empty owned)', () => {
    const p = profileForRole('director');
    expect(p.owned).toEqual([]);
    expect(p.watched).toHaveLength(8);
  });

  it('watcher → director-equivalent profile (read-only)', () => {
    const p = profileForRole('watcher');
    expect(p.owned).toEqual([]);
    expect(p.watched).toHaveLength(8);
  });

  it('operator with single LX dept → lx profile', () => {
    const p = profileForRole('operator', ['LX']);
    expect(p.owned).toEqual(['LX']);
    expect(p.watched).toEqual(['SM']);
  });

  it('operator with multiple owned depts → multi-owned profile', () => {
    const p = profileForRole('operator', ['LX', 'SX']);
    expect(p.owned).toEqual(['LX', 'SX']);
    expect(p.watched).toEqual(['SM']);
  });

  it('operator with no ownedDepartments → empty owned, SM watched', () => {
    const p = profileForRole('operator', []);
    expect(p.owned).toEqual([]);
    expect(p.watched).toEqual(['SM']);
  });

  it('operator with undefined ownedDepartments → empty owned, SM watched', () => {
    const p = profileForRole('operator');
    expect(p.owned).toEqual([]);
    expect(p.watched).toEqual(['SM']);
  });

  it('operator with single VIDEO dept → video profile', () => {
    const p = profileForRole('operator', ['VIDEO']);
    expect(p.owned).toEqual(['VIDEO']);
  });

  it('operator with custom dept → generic profile with watched=[SM]', () => {
    const p = profileForRole('operator', ['CONFETTI']);
    expect(p.owned).toEqual(['CONFETTI']);
    expect(p.watched).toEqual(['SM']);
  });
});
