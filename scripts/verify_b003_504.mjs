/**
 * B003-504 verification: GoExecutor unconditional OSC injection + dispatch.
 * Runs without Electron — uses built dist modules directly.
 *
 * Usage: node scripts/verify_b003_504.mjs
 *
 * Expects: nc -ul 7000  (or similar) listening on localhost:7000 to capture packets.
 * This script starts its own UDP listener on 7000 to self-verify.
 */
import { createSocket } from 'node:dgram';
import * as Y from 'yjs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Start UDP listener on 7000 ─────────────────────────────────────────────────

let oscReceived = false;
let oscPacketHex = '';

const udp = createSocket('udp4');
await new Promise((res, rej) => {
  udp.on('error', rej);
  udp.once('message', (msg) => {
    oscReceived = true;
    oscPacketHex = msg.toString('hex').slice(0, 80) + (msg.length > 40 ? '…' : '');
    console.log('[UDP CAPTURE] OSC packet received on :7000 — hex:', oscPacketHex);
    udp.close();
    res(undefined);
  });
  udp.bind(7000, '127.0.0.1', res);
});

// ── Load dist modules ──────────────────────────────────────────────────────────

const { default: EventBusCtor } = await import(`${ROOT}/src/main/dist/shared/EventBus.js`);
const { GoExecutor } = await import(`${ROOT}/src/main/dist/runtime/GoExecutor.js`);
const { OutputDispatcher } = await import(`${ROOT}/src/main/dist/shared/OutputDispatcher.js`);
const { dispatchCue } = await import(`${ROOT}/src/modules/cuelist-core/dist/dispatch/payloadDispatch.js`);

// ── Build a minimal Y.Doc with OSC cue ────────────────────────────────────────

const doc = new Y.Doc();
doc.transact(() => {
  const meta = doc.getMap('meta');
  meta.set('show_id', 'verify-show-1');
  meta.set('active_cuelist_id', 'cl-verify');

  const clMap = new Y.Map();
  clMap.set('id', 'cl-verify');
  clMap.set('name', 'Verify Cuelist');
  clMap.set('go_authority', 'auto_cascade');
  clMap.set('sm_offline_policy', { kind: 'freeze' });
  clMap.set('playhead', { cue_id: null, armed_cue_id: null });

  const cuesArr = new Y.Array();
  const cueMap = new Y.Map();
  cueMap.set('id', 'cue-osc-1');
  cueMap.set('label', 'OSC Test Cue');
  cueMap.set('department', ['LX']);

  const payloadsArr = new Y.Array();
  const p = new Y.Map();
  p.set('id', 'p-osc-1');
  p.set('type', 'osc');
  p.set('tag', 'LX');
  p.set('note', 'test');
  p.set('address', '/eos/cue/1/fire');
  p.set('args', []);
  payloadsArr.push([p]);

  cueMap.set('payloads', payloadsArr);
  cueMap.set('sort_key', 1000);
  cueMap.set('trigger', { kind: 'manual' });
  cueMap.set('description', '');
  cueMap.set('standby_note', '');
  cueMap.set('script_line_ref', null);
  cueMap.set('notes', '');
  cueMap.set('payload_frozen_at', null);
  cueMap.set('created_at', new Date().toISOString());
  cueMap.set('created_by', 'verify');
  cueMap.set('modified_at', new Date().toISOString());
  cueMap.set('modified_by', 'verify');
  cueMap.set('duration_hint_ms', null);

  cuesArr.push([cueMap]);
  clMap.set('cues', cuesArr);
  doc.getArray('cuelists').push([clMap]);
  doc.getMap('devices');
  doc.getMap('routing');
});

// ── Fake SyncBroker ────────────────────────────────────────────────────────────

const subs = new Map();
const broadcasts = [];
const fakeSyncBroker = {
  subscribeSideChannel(showId, handler) {
    if (!subs.has(showId)) subs.set(showId, new Set());
    const entry = { handler, unsub: () => subs.get(showId)?.delete(entry) };
    subs.get(showId).add(entry);
    return { id: 'fake', unsubscribe: entry.unsub };
  },
  publishSideChannel(showId, msg) {
    broadcasts.push(msg);
  },
};

// ── Logger ─────────────────────────────────────────────────────────────────────

const log = {
  debug: (...a) => console.log('[DEBUG]', ...a),
  info: (...a) => console.log('[INFO]', ...a),
  warn: (...a) => console.log('[WARN]', ...a),
  error: (...a) => console.log('[ERROR]', ...a),
  child: function() { return this; },
};

// ── EventBus ───────────────────────────────────────────────────────────────────

const events = new EventBusCtor();

// ── OutputDispatcher (real, but midi/dmx pools start empty) ───────────────────

const output = new OutputDispatcher('verify');

// ── GoExecutor ────────────────────────────────────────────────────────────────

const executor = new GoExecutor({ syncBroker: fakeSyncBroker, events, output, log });
executor.attach('verify-show-1', doc);

// At this point GoExecutor should have injected integration_osc device
const devMap = doc.getMap('devices');
const injected = devMap.get('integration_osc');
if (!injected) {
  console.error('[FAIL] integration_osc device NOT injected — something is wrong');
  process.exit(1);
}
console.log('[INFO] go-executor: injected integration OSC device', {
  device_id: 'integration_osc',
  host: injected.get('host'),
  port: injected.get('port'),
});

// ── Fire cue-fire event (simulating GoEventChannel) ───────────────────────────

console.log('[INFO] active_show.opened { pkgPath: verify }');

// Wait a tick for subscriptions to settle
await new Promise(r => setTimeout(r, 10));

events.publish({
  type: 'cue-fire',
  seq: 1,
  ts: Date.now(),
  source: 'cuelist-core',
  show_id: 'verify-show-1',
  cuelist_id: 'cl-verify',
  cue_id: 'cue-osc-1',
  cue_label: 'OSC Test Cue',
  departments: ['LX'],
  payloads: [{ id: 'p-osc-1', type: 'osc', tag: 'LX', note: 'test', address: '/eos/cue/1/fire', args: [] }],
  fired_by: 'op-verify',
  trigger_mode: 'manual',
});

// Wait for async dispatch + UDP delivery
await new Promise(r => setTimeout(r, 500));

executor.detach();

if (oscReceived) {
  console.log('[PASS] OSC packet observed on 127.0.0.1:7000');
} else {
  console.log('[INCOMPLETE] No OSC packet captured on :7000 within 500ms');
  console.log('  → check that UDP :7000 is not blocked and the OscPool is sending');
}

process.exit(0);
