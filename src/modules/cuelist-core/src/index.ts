import { CuelistCore } from './CuelistCore.js';
export { manifest } from './manifest.js';
export { CuelistCore };
// Loader expects default export to be a Module instance with `init` method on prototype
// chain (typeof mod.default.init === 'function'). Class itself fails this check.
export default new CuelistCore();
