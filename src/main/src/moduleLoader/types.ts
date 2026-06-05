import { z } from 'zod';
import type { Module, ModuleContext } from 'showx-shared';

// Zod schema for manifest.json files on disk.
// This is intentionally simpler than the full TypeScript ModuleManifest from showx-shared:
// no 'entry' constructor (that comes from dynamic import of index.ts).
// Slug regex: ^[a-z][a-z0-9-]{1,39}$ per module_loader.md §2.3 (no underscore).
export const ModuleManifestSchema = z.object({
  name: z.string().min(1).max(40),
  slug: z.string().regex(/^[a-z][a-z0-9-]{1,39}$/),
  version: z.string().regex(/^\d+\.\d+\.\d+/),
  description: z.string().max(200),
  tier: z.enum(['free', 'pro']),
  depends_on: z.array(z.string()).default([]),
  requires: z
    .object({
      transports: z.array(z.string()).optional(),
    })
    .optional(),
});
export type ModuleManifest = z.infer<typeof ModuleManifestSchema>;

export type ModuleLifecycleState =
  | 'discovered'
  | 'manifest_invalid'
  | 'init_pending'
  | 'init_running'
  | 'init_failed'
  | 'inited'
  | 'start_running'
  | 'start_failed'
  | 'started'
  | 'stop_running'
  | 'stopped'
  | 'teardown_running'
  | 'torn_down'
  | 'quarantined';

export interface LoadedModule {
  slug: string;
  manifest: ModuleManifest;
  module: Module;
  context: ModuleContext;
  abortController: AbortController;
  state: ModuleLifecycleState;
  lastError?: { stage: string; error: Error; at: number };
}
