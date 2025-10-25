import Dexie from 'dexie';
import type { Migration, MigrationOptions, MigrationResult, MigrationRecord } from './types';

const MIGRATIONS_TABLE = '_dexie_migrations';

/**
 * Run migrations and return a ready-to-use Dexie database
 */
export async function runMigrations(
  dbName: string,
  migrations: Migration[],
  options: MigrationOptions = {}
): Promise<MigrationResult> {
  const { dryRun = false, verbose = false, onProgress, onError, onComplete } = options;

  // Validate migrations
  validateMigrations(migrations);

  // Sort migrations by ID
  const sortedMigrations = [...migrations].sort((a, b) => a.id - b.id);

  if (verbose) {
    console.log(`[dexie-migrate] Starting migrations for database: ${dbName}`);
    console.log(`[dexie-migrate] Total migrations: ${sortedMigrations.length}`);
  }

  // Check which migrations have been applied
  const appliedIds = await getAppliedMigrations(dbName);
  
  // Determine which migrations need to be applied
  const pendingMigrations = sortedMigrations.filter(m => !appliedIds.has(m.id));
  const skippedMigrations = sortedMigrations.filter(m => appliedIds.has(m.id));

  if (verbose) {
    console.log(`[dexie-migrate] Applied: ${appliedIds.size}, Pending: ${pendingMigrations.length}`);
  }

  if (dryRun) {
    console.log('[dexie-migrate] DRY RUN - No changes will be applied');
    pendingMigrations.forEach(m => {
      console.log(`  Would apply: ${m.id}_${m.name}`);
    });
    
    // Return a mock result for dry run
    return {
      db: null,
      appliedMigrations: [],
      skippedMigrations: skippedMigrations.map(m => m.id),
      finalVersion: sortedMigrations.length
    };
  }

  // Create the actual database with migrations
  const db = new Dexie(dbName);
  const appliedMigrationIds: number[] = [];

  // Build version chain
  for (let i = 0; i < sortedMigrations.length; i++) {
    const migration = sortedMigrations[i];
    const versionNumber = i + 1;
    const isNewMigration = !appliedIds.has(migration.id);

    if (verbose && isNewMigration) {
      console.log(`[dexie-migrate] Applying migration ${migration.id}: ${migration.name}`);
    }

    if (isNewMigration) {
      onProgress?.(appliedMigrationIds.length + 1, pendingMigrations.length);
    }

    // Define the version with schema changes
    const versionBuilder = db.version(versionNumber);
    
    // Combine migration stores with migrations table
    const stores = migration.stores ? { ...migration.stores } : {};
    stores[MIGRATIONS_TABLE] = 'id, name, appliedAt';
    versionBuilder.stores(stores);

    // Add upgrade function only for new migrations
    if (isNewMigration) {
      versionBuilder.upgrade(async (tx) => {
        try {
          // Run the up migration
          if (migration.up) {
            await migration.up(tx);
          }

          // Run validation if defined
          if (migration.validateAfter) {
            const isValid = await migration.validateAfter(tx);
            if (!isValid) {
              throw new Error(`Migration ${migration.id} validation failed`);
            }
          }

          // Record that this migration was applied
          await tx.table(MIGRATIONS_TABLE).add({
            id: migration.id,
            name: migration.name,
            appliedAt: Date.now()
          });

          if (verbose) {
            console.log(`[dexie-migrate] ✓ Migration ${migration.id} completed`);
          }

          appliedMigrationIds.push(migration.id);
        } catch (error) {
          console.error(`[dexie-migrate] ✗ Migration ${migration.id} failed:`, error);
          onError?.(migration, error as Error);
          throw error;
        }
      });
    }
  }

  try {
    // Open the database (this will run pending migrations)
    await db.open();

    onComplete?.();

    if (verbose) {
      console.log(`[dexie-migrate] ✓ All migrations completed. Database at version ${sortedMigrations.length}`);
    }

    return {
      db,
      appliedMigrations: appliedMigrationIds,
      skippedMigrations: skippedMigrations.map(m => m.id),
      finalVersion: sortedMigrations.length
    };
  } catch (error) {
    console.error('[dexie-migrate] Migration failed:', error);
    throw error;
  }
}

/**
 * Get IDs of applied migrations from the database
 */
async function getAppliedMigrations(dbName: string): Promise<Set<number>> {
  const tempDb = new Dexie(dbName);
  
  try {
    // Try to open the database to check if it exists
    tempDb.version(1).stores({
      [MIGRATIONS_TABLE]: 'id, name, appliedAt'
    });

    await tempDb.open();
    
    // Get applied migrations
    const appliedRecords = await tempDb.table<MigrationRecord>(MIGRATIONS_TABLE).toArray();
    const appliedIds = new Set(appliedRecords.map(r => r.id));
    
    await tempDb.close();
    
    return appliedIds;
  } catch (error) {
    // Database doesn't exist or table doesn't exist
    try {
      await tempDb.close();
    } catch {
      // Ignore close errors
    }
    return new Set();
  }
}

/**
 * Validate migrations array
 */
function validateMigrations(migrations: Migration[]): void {
  if (!Array.isArray(migrations)) {
    throw new Error('Migrations must be an array');
  }

  if (migrations.length === 0) {
    throw new Error('At least one migration is required');
  }

  // Check for duplicate IDs
  const ids = migrations.map(m => m.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    throw new Error('Duplicate migration IDs detected');
  }

  // Validate each migration
  migrations.forEach((migration, index) => {
    if (!migration.id || typeof migration.id !== 'number') {
      throw new Error(`Migration at index ${index} has invalid ID`);
    }
    if (!migration.name || typeof migration.name !== 'string') {
      throw new Error(`Migration ${migration.id} has invalid name`);
    }
  });
}
