import type { Payload } from 'showx-shared';
import { OscPayloadEditor } from './OscPayloadEditor.js';
import { MscPayloadEditor } from './MscPayloadEditor.js';
import { LxRefPayloadEditor } from './LxRefPayloadEditor.js';
import { MidiPayloadEditor } from './MidiPayloadEditor.js';
import { DmxPayloadEditor } from './DmxPayloadEditor.js';
import { WebhookPayloadEditor } from './WebhookPayloadEditor.js';
import { WaitPayloadEditor } from './WaitPayloadEditor.js';
import { GroupPayloadEditor } from './GroupPayloadEditor.js';
import { tokens } from '../tokens.js';

interface PayloadEditorSwitchProps {
  payload: Payload;
  cuelistId: string;
  cueId: string;
  locked: boolean;
}

const TYPE_LABELS: Record<string, string> = {
  osc: 'OSC',
  msc: 'MSC',
  lx_ref: 'LX Ref',
  midi: 'MIDI',
  dmx: 'DMX',
  webhook: 'Webhook',
  wait: 'Wait',
  group: 'Group',
};

export function PayloadEditorSwitch({ payload, cuelistId, cueId, locked }: PayloadEditorSwitchProps) {
  return (
    <div
      style={{
        border: `1px solid ${tokens.color.border}`,
        borderRadius: tokens.radius.m,
        padding: tokens.space.m,
        background: tokens.color.raised,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: tokens.color.teal,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: tokens.space.s,
        }}
      >
        {TYPE_LABELS[payload.type] ?? payload.type}
      </div>

      {payload.type === 'osc' && (
        <OscPayloadEditor payload={payload} cuelistId={cuelistId} cueId={cueId} locked={locked} />
      )}
      {payload.type === 'msc' && (
        <MscPayloadEditor payload={payload} cuelistId={cuelistId} cueId={cueId} locked={locked} />
      )}
      {payload.type === 'lx_ref' && (
        <LxRefPayloadEditor payload={payload} cuelistId={cuelistId} cueId={cueId} locked={locked} />
      )}
      {payload.type === 'midi' && (
        <MidiPayloadEditor payload={payload} cuelistId={cuelistId} cueId={cueId} locked={locked} />
      )}
      {payload.type === 'dmx' && (
        <DmxPayloadEditor payload={payload} cuelistId={cuelistId} cueId={cueId} locked={locked} />
      )}
      {payload.type === 'webhook' && (
        <WebhookPayloadEditor payload={payload} cuelistId={cuelistId} cueId={cueId} locked={locked} />
      )}
      {payload.type === 'wait' && (
        <WaitPayloadEditor payload={payload} cuelistId={cuelistId} cueId={cueId} locked={locked} />
      )}
      {payload.type === 'group' && (
        <GroupPayloadEditor payload={payload} cuelistId={cuelistId} cueId={cueId} locked={locked} />
      )}
    </div>
  );
}
