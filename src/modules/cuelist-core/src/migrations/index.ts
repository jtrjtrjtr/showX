import type { ShowJson, CuelistJson } from '../persistence/projections.js';

export interface MigrationInput {
  show: ShowJson;
  cuelists: CuelistJson[];
}

export interface MigrationResult {
  migrated: MigrationInput;
  applied: string[];
}

export interface Migration {
  id: string;
  description: string;
  up(input: MigrationInput): Promise<MigrationInput>;
}

const MIGRATIONS: Migration[] = [
  {
    id: 'M001_add_cue_number',
    description: 'Add cue_number field (null) to all existing cues',
    async up(input) {
      return {
        ...input,
        cuelists: input.cuelists.map((cl) => ({
          ...cl,
          cues: cl.cues.map((cue) => ({
            ...cue,
            cue_number: cue.cue_number ?? null,
          })),
        })),
      };
    },
  },
];

/**
 * Run any migrations whose id is not already in show.applied_migrations.
 * Applies in catalog order. Updates applied_migrations in the migrated show
 * so subsequent loads skip already-applied migrations.
 */
export async function runMigrations(input: MigrationInput): Promise<MigrationResult> {
  const applied: string[] = [];
  const alreadyApplied = new Set(input.show.applied_migrations ?? []);

  let current = input;
  for (const migration of MIGRATIONS) {
    if (alreadyApplied.has(migration.id)) continue;
    current = await migration.up(current);
    applied.push(migration.id);
    current = {
      ...current,
      show: {
        ...current.show,
        applied_migrations: [...current.show.applied_migrations, migration.id],
      },
    };
  }

  return { migrated: current, applied };
}
