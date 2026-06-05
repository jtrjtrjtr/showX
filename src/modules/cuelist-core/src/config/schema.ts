import { z } from 'zod';
import type { ConfigSchemaDescriptor, ZodSchema } from 'showx-shared';

const CuelistCoreConfigSchema = z.object({
  autosave_interval_ms: z.number().int().min(1000).max(300000).default(30000),
  history_rotation_size_bytes: z.number().int().min(1_000_000).default(50_000_000),
  history_rotation_max_age_days: z.number().int().min(1).default(10),
  // presence_color_palette is null in 0.1; palette values ratified in a follow-up task per Q11
  presence_color_palette: z.array(z.string()).nullable().default(null),
});

export type CuelistCoreConfig = z.infer<typeof CuelistCoreConfigSchema>;

export const configSchema: ConfigSchemaDescriptor<CuelistCoreConfig> = {
  schemaVersion: 1,
  // Zod's ZodObject is structurally compatible with showx-shared ZodSchema<T>; cast required
  // because Zod's complex generic type tree doesn't literally extend the showx-shared interface.
  zodSchema: CuelistCoreConfigSchema as unknown as ZodSchema<CuelistCoreConfig>,
  defaults: CuelistCoreConfigSchema.parse({}),
};
