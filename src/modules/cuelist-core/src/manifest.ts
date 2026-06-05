import type { ModuleManifest } from 'showx-shared';
import { CuelistCore } from './CuelistCore.js';

export const manifest: ModuleManifest = {
  slug: 'cuelist-core',
  name: 'Cuelist Core',
  version: '0.1.0',
  description: 'Multi-operator FOH cuelist with per-department views and REHEARSAL mode.',
  tier: 'free',
  requires: {
    transports: [
      { kind: 'osc-out' },
      { kind: 'midi-out' },
      { kind: 'msc-out' },
      { kind: 'webhook-out' },
    ],
    permissions: ['network.lan', 'fs.readwrite.userdata'],
    depends_on: [],
    min_shell_version: '0.1.0',
  },
  default_enabled: true,
  persistedConfigSchemaVersion: 1,
  entry: CuelistCore,
  uiPanel: () => import('./ui/index.js'),
};
