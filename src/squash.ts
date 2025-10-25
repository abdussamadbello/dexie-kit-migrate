import type { Migration } from './types';
import { computeExpectedSchema } from './snapshot';

/**
 * Options for squashing migrations
 */
export interface SquashOptions {
  /** Migration ID to squash up to (inclusive) */
  cutoffId: number;
  /** Name for the new base migration */
  baseName?: string;
  /** Whether to preserve individual up() functions (not recommended) */
  preserveUpFunctions?: boolean;
}

/**
 * Result of squashing operation
 */
export interface SquashResult {
  /** The new base migration that replaces all squashed migrations */
  baseMigration: Migration;
  /** IDs of migrations that were squashed */
  squashedIds: number[];
  /** Migrations that were not squashed (after cutoff) */
  remainingMigrations: Migration[];
}

/**
 * Squash multiple migrations into a single base migration
 * 
 * This combines multiple migration files into one, preserving the final schema
 * but losing the intermediate steps. This is useful for:
 * - Reducing migration complexity after many changes
 * - Improving performance for new installations
 * - Cleaning up migration history
 * 
 * Note: This only merges schema changes. Data transformations (up functions)
 * are not preserved unless preserveUpFunctions is true.
 */
export function squashMigrations(
  migrations: Migration[],
  options: SquashOptions
): SquashResult {
  const { cutoffId, baseName = 'base_migration', preserveUpFunctions = false } = options;
  
  // Sort migrations by ID
  const sorted = [...migrations].sort((a, b) => a.id - b.id);
  
  // Split into migrations to squash and migrations to keep
  const toSquash = sorted.filter(m => m.id <= cutoffId);
  const toKeep = sorted.filter(m => m.id > cutoffId);
  
  if (toSquash.length === 0) {
    throw new Error('No migrations to squash with the given cutoff');
  }
  
  // Compute the final schema from squashed migrations
  const finalSchema = computeExpectedSchema(toSquash);
  
  // Create the base migration
  const baseMigration: Migration = {
    id: 1,
    name: baseName,
    stores: finalSchema
  };
  
  // Optionally preserve up functions (warning: can be problematic)
  if (preserveUpFunctions) {
    const upFunctions = toSquash
      .filter(m => m.up)
      .map(m => m.up!);
    
    if (upFunctions.length > 0) {
      baseMigration.up = async (tx) => {
        for (const upFn of upFunctions) {
          await upFn(tx);
        }
      };
    }
  }
  
  return {
    baseMigration,
    squashedIds: toSquash.map(m => m.id),
    remainingMigrations: toKeep
  };
}

/**
 * Renumber migrations sequentially starting from a given ID
 */
export function renumberMigrations(
  migrations: Migration[],
  startId: number = 1
): Migration[] {
  const sorted = [...migrations].sort((a, b) => a.id - b.id);
  
  return sorted.map((migration, index) => ({
    ...migration,
    id: startId + index
  }));
}

/**
 * Generate migration file content for a squashed migration
 */
export function generateSquashedMigrationFile(migration: Migration): string {
  const storesContent = migration.stores
    ? Object.entries(migration.stores)
        .map(([table, schema]) => {
          if (schema === null) {
            return `    ${table}: null`;
          }
          return `    ${table}: '${schema}'`;
        })
        .join(',\n')
    : '';
  
  let upFunction = '';
  if (migration.up) {
    upFunction = `
  
  // Combined data transformations from squashed migrations
  async up(tx) {
    // Note: This is a simplified version. Review and test thoroughly.
    // Original up() functions may need manual adjustment.
    ${migration.up.toString().split('\n').slice(1, -1).join('\n    ')}
  }`;
  }
  
  return `import type { Migration } from 'dexie-migrate';

/**
 * Base migration created by squashing migrations
 * Generated at: ${new Date().toISOString()}
 * 
 * This migration replaces multiple individual migrations.
 * It represents the final schema state after applying all squashed migrations.
 */
export default {
  id: ${migration.id},
  name: '${migration.name}',
  
  stores: {
${storesContent}
  }${upFunction}
} as Migration;
`;
}

/**
 * Validate that squashing is safe
 */
export function validateSquash(
  migrations: Migration[],
  cutoffId: number
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  const toSquash = migrations.filter(m => m.id <= cutoffId);
  
  // Check for complex up functions
  const hasUpFunctions = toSquash.some(m => m.up);
  if (hasUpFunctions) {
    warnings.push(
      'Some migrations have up() functions with data transformations. ' +
      'These will be lost in the squashed migration. ' +
      'Ensure new installations can bootstrap without these transformations, ' +
      'or use preserveUpFunctions option (not recommended for production).'
    );
  }
  
  // Check for down functions
  const hasDownFunctions = toSquash.some(m => m.down);
  if (hasDownFunctions) {
    warnings.push(
      'Some migrations have down() functions. ' +
      'These will be lost in the squashed migration.'
    );
  }
  
  // Check for validation functions
  const hasValidation = toSquash.some(m => m.validateAfter);
  if (hasValidation) {
    warnings.push(
      'Some migrations have validateAfter() functions. ' +
      'These will be lost in the squashed migration.'
    );
  }
  
  return {
    valid: true,
    warnings
  };
}
