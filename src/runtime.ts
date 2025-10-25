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
  const newlyApplied: number[] = [];

  // Build version chain
  for (let i = 0; i < sortedMigrations.length; i++) {
    const migration = sortedMigrations[i];
    const versionNumber = i + 1;
    const isNewMigration = !appliedIds.has(migration.id);

    if (verbose && isNewMigration) {
      console.log(`[dexie-migrate] Applying migration ${migration.id}: ${migration.name}`);
    }

    // Define the version with schema changes
    const versionBuilder = db.version(versionNumber);
    
    // Combine migration stores with migrations table
    const stores = migration.stores ? { ...migration.stores } : {};
    stores[MIGRATIONS_TABLE] = 'id, name, appliedAt';
    versionBuilder.stores(stores);

    // Add upgrade function only for new migrations
    if (isNewMigration) {
      const migrationToApply = migration; // Capture in closure
      const progressIndex = newlyApplied.length + 1;
      
      versionBuilder.upgrade(async (tx) => {
        try {
          onProgress?.(progressIndex, pendingMigrations.length);
          
          // Run the up migration
          if (migrationToApply.up) {
            await migrationToApply.up(tx);
          }

          // Run validation if defined
          if (migrationToApply.validateAfter) {
            const isValid = await migrationToApply.validateAfter(tx);
            if (!isValid) {
              throw new Error(`Migration ${migrationToApply.id} validation failed`);
            }
          }

          // Record that this migration was applied
          await tx.table(MIGRATIONS_TABLE).add({
            id: migrationToApply.id,
            name: migrationToApply.name,
            appliedAt: Date.now()
          });

          if (verbose) {
            console.log(`[dexie-migrate] ✓ Migration ${migrationToApply.id} completed`);
          }
        } catch (error) {
          console.error(`[dexie-migrate] ✗ Migration ${migrationToApply.id} failed:`, error);
          onError?.(migrationToApply, error as Error);
          throw error;
        }
      });
      
      newlyApplied.push(migration.id);
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
      appliedMigrations: newlyApplied,
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
    // Open without specifying version - Dexie will use existing version
    await tempDb.open();
    
    // Check if migrations table exists
    const hasMigrationsTable = tempDb.tables.some(t => t.name === MIGRATIONS_TABLE);
    
    if (!hasMigrationsTable) {
      await tempDb.close();
      return new Set();
    }
    
    // Get applied migrations
    const appliedRecords = await tempDb.table<MigrationRecord>(MIGRATIONS_TABLE).toArray();
    const appliedIds = new Set(appliedRecords.map(r => r.id));
    
    await tempDb.close();
    
    return appliedIds;
  } catch (error) {
    // Database doesn't exist or can't be opened
    try {
      await tempDb.close();
    } catch {
      // Ignore
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
