import React, { useState, useEffect } from 'react';
import { tokens } from './tokens.js';
import type { Device, DeviceDriver, DeviceTransport } from '../document/devices.js';

interface DeviceEditDialogProps {
  open: boolean;
  initial?: Partial<Device>;
  isEdit: boolean;
  onSave: (d: Device) => void;
  onClose: () => void;
  midiOutputs?: string[];
}

const TRANSPORTS: DeviceTransport[] = ['osc', 'midi', 'msc', 'dmx'];
const DRIVERS: DeviceDriver[] = ['eos', 'ma3', 'hog4', 'chamsys', 'qlab', 'generic'];

const DEVICE_ID_RE = /^[a-z0-9_-]+$/;
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const HOSTNAME_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

function isValidHost(host: string): boolean {
  return IPV4_RE.test(host) || HOSTNAME_RE.test(host);
}

function validate(form: Partial<Device>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.device_id || !DEVICE_ID_RE.test(form.device_id)) {
    errors.device_id = 'Must match [a-z0-9_-]+';
  }
  if (!form.label || form.label.trim().length === 0) {
    errors.label = 'Required';
  }
  if (!form.transport) {
    errors.transport = 'Required';
  }
  if (form.host && !isValidHost(form.host)) {
    errors.host = 'Must be IPv4 or hostname';
  }
  if (form.port !== undefined && (form.port < 1 || form.port > 65535)) {
    errors.port = 'Must be 1–65535';
  }
  if (form.driver && form.transport !== 'osc') {
    errors.driver = 'Driver is only valid for OSC transport';
  }
  if ((form.transport === 'midi' || form.transport === 'msc') && !form.midi_port?.trim()) {
    errors.midi_port = 'Required for MIDI/MSC';
  }
  return errors;
}

const inputStyle: React.CSSProperties = {
  fontFamily: tokens.font.ui,
  fontSize: 14,
  border: `1px solid ${tokens.color.gray_300}`,
  borderRadius: tokens.radius.s,
  padding: `${tokens.space.xs}px ${tokens.space.s}px`,
  width: '100%',
  boxSizing: 'border-box',
  background: tokens.color.cream,
  color: tokens.color.ink,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: tokens.color.gray_700,
  marginBottom: tokens.space.xs,
  fontFamily: tokens.font.ui,
};

const errorStyle: React.CSSProperties = {
  color: tokens.color.red,
  fontSize: 11,
  marginTop: 2,
  fontFamily: tokens.font.ui,
};

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: tokens.space.m }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {error && <div style={errorStyle}>{error}</div>}
    </div>
  );
}

export function DeviceEditDialog({ open, initial, isEdit, onSave, onClose, midiOutputs }: DeviceEditDialogProps) {
  const [form, setForm] = useState<Partial<Device>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm(initial ?? { transport: 'osc' });
      setErrors({});
    }
  }, [open, initial]);

  if (!open) return null;

  const set = (field: keyof Device, value: unknown) => {
    setForm((f) => {
      const next = { ...f, [field]: value } as Partial<Device>;
      if (field === 'transport' && value !== 'osc') {
        delete (next as Record<string, unknown>).driver;
      }
      if (field === 'transport' && value !== 'dmx') {
        delete (next as Record<string, unknown>).dmx_universe;
      }
      return next;
    });
  };

  const handleSave = () => {
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    onSave(form as Device);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Edit device' : 'Add device'}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: tokens.color.cream,
          border: `1px solid ${tokens.color.gray_300}`,
          borderRadius: tokens.radius.m,
          padding: tokens.space.xl,
          minWidth: 420,
          maxWidth: 560,
          width: '100%',
          fontFamily: tokens.font.ui,
        }}
      >
        <h2 style={{ margin: 0, marginBottom: tokens.space.l, fontSize: 16, color: tokens.color.ink }}>
          {isEdit ? 'Edit Device' : 'Add Device'}
        </h2>

        <Field label="Device ID" error={errors.device_id}>
          <input
            style={{ ...inputStyle, fontFamily: tokens.font.mono }}
            value={form.device_id ?? ''}
            disabled={isEdit}
            onChange={(e) => set('device_id', e.target.value)}
            placeholder="e.g. lx_eos"
            aria-label="Device ID"
          />
        </Field>

        <Field label="Label" error={errors.label}>
          <input
            style={inputStyle}
            value={form.label ?? ''}
            onChange={(e) => set('label', e.target.value)}
            placeholder="e.g. ETC Eos"
            aria-label="Label"
          />
        </Field>

        <Field label="Transport" error={errors.transport}>
          <select
            style={inputStyle}
            value={form.transport ?? ''}
            onChange={(e) => set('transport', e.target.value as DeviceTransport)}
            aria-label="Transport"
          >
            <option value="">Select…</option>
            {TRANSPORTS.map((t) => (
              <option key={t} value={t}>{t.toUpperCase()}</option>
            ))}
          </select>
        </Field>

        {(form.transport === 'osc' || form.transport === 'msc') && (
          <Field label="Host" error={errors.host}>
            <input
              style={inputStyle}
              value={form.host ?? ''}
              onChange={(e) => set('host', e.target.value)}
              placeholder="e.g. 192.168.1.100"
              aria-label="Host"
            />
          </Field>
        )}

        {(form.transport === 'osc' || form.transport === 'msc') && (
          <Field label="Port" error={errors.port}>
            <input
              style={inputStyle}
              type="number"
              min={1}
              max={65535}
              value={form.port ?? ''}
              onChange={(e) => set('port', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="e.g. 8000"
              aria-label="Port"
            />
          </Field>
        )}

        {form.transport === 'osc' && (
          <Field label="Driver" error={errors.driver}>
            <select
              style={inputStyle}
              value={form.driver ?? ''}
              onChange={(e) => set('driver', e.target.value || undefined)}
              aria-label="Driver"
            >
              <option value="">None (generic)</option>
              {DRIVERS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </Field>
        )}

        {(form.transport === 'midi' || form.transport === 'msc') && (
          <Field label="MIDI Port" error={errors.midi_port}>
            {midiOutputs && midiOutputs.length > 0 ? (
              <select
                style={inputStyle}
                value={form.midi_port ?? ''}
                onChange={(e) => set('midi_port', e.target.value || undefined)}
                aria-label="MIDI Port"
              >
                <option value="">Select port…</option>
                {midiOutputs.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            ) : (
              <input
                style={inputStyle}
                value={form.midi_port ?? ''}
                onChange={(e) => set('midi_port', e.target.value)}
                placeholder="e.g. IAC Driver Bus 1"
                aria-label="MIDI Port"
              />
            )}
          </Field>
        )}

        {form.transport === 'dmx' && (
          <Field label="DMX Universe" error={errors.dmx_universe}>
            <input
              style={inputStyle}
              type="number"
              min={1}
              value={form.dmx_universe ?? ''}
              onChange={(e) => set('dmx_universe', e.target.value ? Number(e.target.value) : undefined)}
              placeholder="e.g. 1"
              aria-label="DMX Universe"
            />
          </Field>
        )}

        <Field label="Notes" error={errors.notes}>
          <input
            style={inputStyle}
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Optional notes"
            aria-label="Notes"
          />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: tokens.space.s, marginTop: tokens.space.l }}>
          <button
            onClick={onClose}
            style={{
              fontFamily: tokens.font.ui,
              fontSize: 14,
              border: `1px solid ${tokens.color.gray_300}`,
              borderRadius: tokens.radius.s,
              padding: `${tokens.space.xs}px ${tokens.space.l}px`,
              background: 'none',
              cursor: 'pointer',
              color: tokens.color.gray_700,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              fontFamily: tokens.font.ui,
              fontSize: 14,
              border: 'none',
              borderRadius: tokens.radius.s,
              padding: `${tokens.space.xs}px ${tokens.space.l}px`,
              background: tokens.color.teal,
              cursor: 'pointer',
              color: tokens.color.cream,
              fontWeight: 600,
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
