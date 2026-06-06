import React, { useState, useEffect } from 'react';
import { tokens } from './tokens.js';
import type { RoutingRule, RulePayloadType } from '../document/routing.js';
import type { Device } from '../document/devices.js';

interface RoutingRuleEditDialogProps {
  open: boolean;
  initial?: Partial<RoutingRule>;
  isEdit: boolean;
  devices: Device[];
  onSave: (r: Omit<RoutingRule, 'rule_id' | 'sort_key'>) => void;
  onClose: () => void;
}

const PAYLOAD_TYPES: RulePayloadType[] = ['osc', 'msc', 'lx_ref', 'midi', 'webhook', 'wait', 'group'];

type FormState = {
  payload_type: RulePayloadType | '';
  tag_pattern: string;
  device_id: string;
  target_device_id: string;
  notes: string;
};

function validate(form: FormState, devices: Device[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!form.target_device_id) {
    errors.target_device_id = 'Required';
  } else if (!devices.find((d) => d.device_id === form.target_device_id)) {
    errors.target_device_id = 'Device not found';
  }
  if (form.payload_type && !PAYLOAD_TYPES.includes(form.payload_type as RulePayloadType)) {
    errors.payload_type = 'Invalid payload type';
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

export function RoutingRuleEditDialog({
  open,
  initial,
  isEdit,
  devices,
  onSave,
  onClose,
}: RoutingRuleEditDialogProps) {
  const [form, setForm] = useState<FormState>({
    payload_type: '',
    tag_pattern: '',
    device_id: '',
    target_device_id: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm({
        payload_type: (initial?.match?.payload_type ?? '') as RulePayloadType | '',
        tag_pattern: initial?.match?.tag_pattern ?? '',
        device_id: initial?.match?.device_id ?? '',
        target_device_id: initial?.target_device_id ?? '',
        notes: initial?.notes ?? '',
      });
      setErrors({});
    }
  }, [open, initial]);

  if (!open) return null;

  const set = (field: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleSave = () => {
    const errs = validate(form, devices);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const match: RoutingRule['match'] = {};
    if (form.payload_type) match.payload_type = form.payload_type;
    if (form.tag_pattern.trim()) match.tag_pattern = form.tag_pattern.trim();
    if (form.device_id.trim()) match.device_id = form.device_id.trim();

    onSave({
      match,
      target_device_id: form.target_device_id,
      notes: form.notes || undefined,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Edit routing rule' : 'Add routing rule'}
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
          minWidth: 400,
          maxWidth: 520,
          width: '100%',
          fontFamily: tokens.font.ui,
        }}
      >
        <h2 style={{ margin: 0, marginBottom: tokens.space.l, fontSize: 16, color: tokens.color.ink }}>
          {isEdit ? 'Edit Routing Rule' : 'Add Routing Rule'}
        </h2>

        <p style={{ margin: 0, marginBottom: tokens.space.l, fontSize: 12, color: tokens.color.gray_700 }}>
          Match criteria — leave all blank to match everything for the target device.
        </p>

        <Field label="Payload Type (match)" error={errors.payload_type}>
          <select
            style={inputStyle}
            value={form.payload_type}
            onChange={(e) => set('payload_type', e.target.value)}
            aria-label="Payload type match"
          >
            <option value="">Any</option>
            {PAYLOAD_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </Field>

        <Field label="Tag Pattern (match)" error={errors.tag_pattern}>
          <input
            style={{ ...inputStyle, fontFamily: tokens.font.mono }}
            value={form.tag_pattern}
            onChange={(e) => set('tag_pattern', e.target.value)}
            placeholder="e.g. LX (optional)"
            aria-label="Tag pattern match"
          />
        </Field>

        <Field label="Source Device ID (match)" error={errors.device_id}>
          <select
            style={inputStyle}
            value={form.device_id}
            onChange={(e) => set('device_id', e.target.value)}
            aria-label="Source device ID match"
          >
            <option value="">Any</option>
            {devices.map((d) => (
              <option key={d.device_id} value={d.device_id}>{d.label} ({d.device_id})</option>
            ))}
          </select>
        </Field>

        <Field label="Target Device" error={errors.target_device_id}>
          <select
            style={inputStyle}
            value={form.target_device_id}
            onChange={(e) => set('target_device_id', e.target.value)}
            aria-label="Target device"
          >
            <option value="">Select target device…</option>
            {devices.map((d) => (
              <option key={d.device_id} value={d.device_id}>{d.label} ({d.device_id})</option>
            ))}
          </select>
        </Field>

        <Field label="Notes" error={undefined}>
          <input
            style={inputStyle}
            value={form.notes}
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
