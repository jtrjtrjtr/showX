import { CuelistCore } from './CuelistCore.js';
export { manifest } from './manifest.js';
export { CuelistCore };
export { GoEventChannel } from './go/goEventChannel.js';
export type { GoChannelDeps } from './go/goEventChannel.js';
export { dispatchCue } from './dispatch/payloadDispatch.js';
export type { DispatchDeps, CueDispatchResult } from './dispatch/payloadDispatch.js';
export { updateCueFields, addCue, insertCueAfter, removeCue, reorderCues } from './document/cue.js';
export type { CueFieldPatch, MakeCueOpts } from './document/cue.js';
export { TriggerEngine } from './trigger/triggerEngine.js';
export type { TriggerEngineDeps } from './trigger/types.js';
// Loader expects default export to be a Module instance with `init` method on prototype
// chain (typeof mod.default.init === 'function'). Class itself fails this check.
export default new CuelistCore();
