import { describe, it, expect, beforeEach } from 'vitest';
import { CueLights } from '../../../../../src/modules/cuelist-core/src/cuelights/cueLights.js';

describe('CueLights', () => {
  let cl: CueLights;

  beforeEach(() => {
    cl = new CueLights();
  });

  it('initial state returns empty snapshot', () => {
    expect(cl.getState('cue-1')).toEqual({});
    expect(cl.hasActiveStandby('cue-1')).toBe(false);
    expect(cl.isFullyAcknowledged('cue-1')).toBe(false);
  });

  describe('setStandby(on=true)', () => {
    it('sets listed departments to standby', () => {
      cl.setStandby('cue-1', ['LX', 'SX'], true);
      const state = cl.getState('cue-1');
      expect(state['LX']).toBe('standby');
      expect(state['SX']).toBe('standby');
    });

    it('does not overwrite acknowledged state with standby', () => {
      cl.setStandby('cue-1', ['LX'], true);
      cl.acknowledge('cue-1', 'LX');
      cl.setStandby('cue-1', ['LX'], true);
      expect(cl.getState('cue-1')['LX']).toBe('acknowledged');
    });

    it('hasActiveStandby returns true after standby set', () => {
      cl.setStandby('cue-1', ['LX'], true);
      expect(cl.hasActiveStandby('cue-1')).toBe(true);
    });
  });

  describe('setStandby(on=false)', () => {
    it('clears departments back to idle', () => {
      cl.setStandby('cue-1', ['LX', 'SX'], true);
      cl.setStandby('cue-1', ['LX'], false);
      expect(cl.getState('cue-1')['LX']).toBe('idle');
      expect(cl.getState('cue-1')['SX']).toBe('standby');
    });

    it('clears acknowledged state back to idle', () => {
      cl.setStandby('cue-1', ['LX'], true);
      cl.acknowledge('cue-1', 'LX');
      cl.setStandby('cue-1', ['LX'], false);
      expect(cl.getState('cue-1')['LX']).toBe('idle');
    });
  });

  describe('acknowledge', () => {
    it('transitions standby→acknowledged', () => {
      cl.setStandby('cue-1', ['LX'], true);
      cl.acknowledge('cue-1', 'LX');
      expect(cl.getState('cue-1')['LX']).toBe('acknowledged');
    });

    it('ignores acknowledge for idle department', () => {
      cl.acknowledge('cue-1', 'LX');
      // Should remain absent (idle represented as missing key)
      const state = cl.getState('cue-1');
      expect(state['LX']).toBeUndefined();
    });

    it('ignores acknowledge for already-acknowledged department', () => {
      cl.setStandby('cue-1', ['LX'], true);
      cl.acknowledge('cue-1', 'LX');
      cl.acknowledge('cue-1', 'LX');
      expect(cl.getState('cue-1')['LX']).toBe('acknowledged');
    });

    it('ignores unknown cue', () => {
      cl.acknowledge('nonexistent', 'LX');
      expect(cl.getState('nonexistent')).toEqual({});
    });
  });

  describe('isFullyAcknowledged', () => {
    it('returns false when no departments set', () => {
      expect(cl.isFullyAcknowledged('cue-1')).toBe(false);
    });

    it('returns false when some departments in standby', () => {
      cl.setStandby('cue-1', ['LX', 'SX'], true);
      cl.acknowledge('cue-1', 'LX');
      expect(cl.isFullyAcknowledged('cue-1')).toBe(false);
    });

    it('returns true when all departments acknowledged', () => {
      cl.setStandby('cue-1', ['LX', 'SX'], true);
      cl.acknowledge('cue-1', 'LX');
      cl.acknowledge('cue-1', 'SX');
      expect(cl.isFullyAcknowledged('cue-1')).toBe(true);
    });

    it('returns false when some departments cleared to idle', () => {
      cl.setStandby('cue-1', ['LX', 'SX'], true);
      cl.acknowledge('cue-1', 'LX');
      cl.setStandby('cue-1', ['SX'], false);
      expect(cl.isFullyAcknowledged('cue-1')).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes all state for a cue on GO', () => {
      cl.setStandby('cue-1', ['LX', 'SX'], true);
      cl.acknowledge('cue-1', 'LX');
      cl.clear('cue-1');
      expect(cl.getState('cue-1')).toEqual({});
      expect(cl.hasActiveStandby('cue-1')).toBe(false);
    });

    it('does not affect other cues', () => {
      cl.setStandby('cue-1', ['LX'], true);
      cl.setStandby('cue-2', ['SX'], true);
      cl.clear('cue-1');
      expect(cl.getState('cue-2')['SX']).toBe('standby');
    });
  });

  describe('clearAll', () => {
    it('resets all cues', () => {
      cl.setStandby('cue-1', ['LX'], true);
      cl.setStandby('cue-2', ['SX'], true);
      cl.clearAll();
      expect(cl.getState('cue-1')).toEqual({});
      expect(cl.getState('cue-2')).toEqual({});
    });
  });

  describe('multi-department aggregation', () => {
    it('tracks multiple depts independently on same cue', () => {
      cl.setStandby('cue-5', ['LX', 'SX', 'VIDEO'], true);
      cl.acknowledge('cue-5', 'SX');
      const state = cl.getState('cue-5');
      expect(state['LX']).toBe('standby');
      expect(state['SX']).toBe('acknowledged');
      expect(state['VIDEO']).toBe('standby');
      expect(cl.isFullyAcknowledged('cue-5')).toBe(false);
      cl.acknowledge('cue-5', 'LX');
      cl.acknowledge('cue-5', 'VIDEO');
      expect(cl.isFullyAcknowledged('cue-5')).toBe(true);
    });
  });
});
