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

// Migration catalog — empty for MVP; add entries as migrations are authored.
const MIGRATIONS: Migration[] = [];

/**
 * Run any migrations whose id is not already in show.applied_migrations.
 * Applies in catalog order. Returns the mutated input + list of applied ids.
 */
export async function runMigrations(input: MigrationInput): Promise<MigrationResult> {
  const applied: string[] = [];
  const alreadyApplied = new Set(input.show.applied_migrations ?? []);

  let current = input;
  for (const migration of MIGRATIONS) {
    if (alreadyApplied.has(migration.id)) continue;
    current = await migration.up(current);
    applied.push(migration.id);
  }

  return { migrated: current, applied };
}
