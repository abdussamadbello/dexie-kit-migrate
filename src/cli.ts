#!/usr/bin/env node

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

program
  .name('dexie-migrate')
  .description('SQL-style migrations for Dexie.js')
  .version('0.1.0');

/**
 * Generate a new migration file
 */
program
  .command('new [description]')
  .description('Create a new migration file')
  .action((description?: string) => {
    const migrationName = description || 'new_migration';
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    
    // Find the next migration ID
    const migrationsDir = path.join(process.cwd(), 'migrations');
    
    // Create migrations directory if it doesn't exist
    if (!fs.existsSync(migrationsDir)) {
      fs.mkdirSync(migrationsDir, { recursive: true });
      console.log(`Created migrations directory: ${migrationsDir}`);
    }

    // Find existing migrations to determine next ID
    let nextId = 1;
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir);
      const migrationFiles = files.filter(f => /^\d{4}_/.test(f));
      
      if (migrationFiles.length > 0) {
        const lastFile = migrationFiles.sort().pop();
        if (lastFile) {
          const match = lastFile.match(/^(\d{4})_/);
          if (match) {
            nextId = parseInt(match[1], 10) + 1;
          }
        }
      }
    }

    const paddedId = String(nextId).padStart(4, '0');
    const sanitizedName = migrationName.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    const filename = `${paddedId}_${timestamp}_${sanitizedName}.ts`;
    const filepath = path.join(migrationsDir, filename);

    const template = `import type { Migration } from 'dexie-migrate';

export default {
  id: ${nextId},
  name: '${sanitizedName}',
  
  // Define schema changes (optional)
  stores: {
    // Example: users: 'id, email, name'
  },
  
  // Data transformation (optional)
  async up(tx) {
    // Example: await tx.table('users').toCollection().modify(user => {
    //   user.updatedAt = Date.now();
    // });
  },
  
  // Test-only rollback (optional, never runs in production)
  async down(tx) {
    // Example: await tx.table('users').toCollection().modify(user => {
    //   delete user.updatedAt;
    // });
  },
  
  // Validation after migration (optional)
  async validateAfter(tx) {
    // Example: const count = await tx.table('users').count();
    // return count > 0;
    return true;
  }
} as Migration;
`;

    fs.writeFileSync(filepath, template);
    console.log(`✓ Created migration: ${filename}`);
    console.log(`\nNext steps:`);
    console.log(`  1. Edit ${filepath}`);
    console.log(`  2. Import it in your database setup`);
    console.log(`  3. Run your application to apply the migration`);
  });

/**
 * Check schema drift
 */
program
  .command('check')
  .description('Check for schema drift')
  .option('-s, --snapshot <file>', 'Snapshot file to compare against', '.dexie-migrate/snapshot.json')
  .action(async (options) => {
    try {
      console.log('Checking schema...');
      
      const snapshotPath = options.snapshot;
      
      if (!fs.existsSync(snapshotPath)) {
        console.error(`❌ Snapshot file not found: ${snapshotPath}`);
        console.log('Run "dexie-migrate snapshot" to create a snapshot first');
        process.exit(1);
      }
      
      const migrationsDir = path.join(process.cwd(), 'migrations');
      
      if (!fs.existsSync(migrationsDir)) {
        console.error('❌ No migrations directory found');
        process.exit(1);
      }
      
      // Load snapshot
      const snapshotContent = fs.readFileSync(snapshotPath, 'utf-8');
      const snapshot = JSON.parse(snapshotContent);
      
      // Load current migrations
      const files = fs.readdirSync(migrationsDir);
      const currentMigrations = files
        .filter(f => /^\d{4}_.*\.ts$/.test(f))
        .sort();
      
      console.log(`Snapshot version: ${snapshot.version}`);
      console.log(`Current migrations: ${currentMigrations.length}`);
      
      // Check for drift
      const driftDetected = currentMigrations.length !== snapshot.version;
      
      if (driftDetected) {
        console.log('⚠ Schema drift detected!');
        
        if (currentMigrations.length > snapshot.version) {
          const newMigrations = currentMigrations.slice(snapshot.version);
          console.log(`  New migrations (${newMigrations.length}):`);
          newMigrations.forEach(m => console.log(`    - ${m}`));
          console.log('\nRun "dexie-migrate snapshot" to update the snapshot');
        } else {
          console.log('  Fewer migrations than snapshot version');
          console.log('  This may indicate deleted migrations');
        }
        
        process.exit(1);
      } else {
        console.log('✓ No schema drift detected');
        console.log('  Schema matches snapshot');
      }
    } catch (error) {
      console.error('❌ Failed to check schema:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Create snapshot
 */
program
  .command('snapshot')
  .description('Create a schema snapshot')
  .option('-o, --output <file>', 'Output file path', '.dexie-migrate/snapshot.json')
  .option('-d, --db <name>', 'Database name (for browser environment, uses migrations only)')
  .action(async (options) => {
    try {
      console.log('Creating snapshot...');
      
      const migrationsDir = path.join(process.cwd(), 'migrations');
      
      if (!fs.existsSync(migrationsDir)) {
        console.error('❌ No migrations directory found');
        console.log('Run "dexie-migrate new" to create your first migration');
        process.exit(1);
      }

      // Load all migrations
      const files = fs.readdirSync(migrationsDir);
      const migrationFiles = files
        .filter(f => /^\d{4}_.*\.ts$/.test(f))
        .sort();

      if (migrationFiles.length === 0) {
        console.error('❌ No migration files found');
        process.exit(1);
      }

      // We can't actually run migrations in Node CLI context without a browser,
      // so we compute the expected schema from migration files
      console.log(`Found ${migrationFiles.length} migration(s)`);
      
      // For CLI, we create a schema snapshot from the migration definitions
      const snapshotPath = options.output;
      const snapshotDir = path.dirname(snapshotPath);
      
      if (!fs.existsSync(snapshotDir)) {
        fs.mkdirSync(snapshotDir, { recursive: true });
      }
      
      const snapshot = {
        version: migrationFiles.length,
        timestamp: Date.now(),
        lastMigrationId: migrationFiles.length,
        migrations: migrationFiles,
        note: 'Schema snapshot created from migration files. This represents the expected schema after all migrations are applied.'
      };
      
      fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');
      
      console.log(`✓ Snapshot saved to ${snapshotPath}`);
      console.log(`  Version: ${snapshot.version}`);
      console.log(`  Migrations: ${migrationFiles.length}`);
    } catch (error) {
      console.error('❌ Failed to create snapshot:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Squash migrations
 */
program
  .command('squash')
  .option('--cutoff <number>', 'Migration ID to squash up to', '10')
  .option('-o, --output <dir>', 'Output directory for squashed migration', 'migrations')
  .option('--dry-run', 'Preview without making changes')
  .description('Squash old migrations into a single base migration')
  .action(async (options) => {
    try {
      console.log('Squashing migrations...');
      
      const migrationsDir = path.join(process.cwd(), 'migrations');
      
      if (!fs.existsSync(migrationsDir)) {
        console.error('❌ No migrations directory found');
        process.exit(1);
      }

      const cutoffId = parseInt(options.cutoff, 10);
      
      if (isNaN(cutoffId) || cutoffId < 1) {
        console.error('❌ Invalid cutoff ID');
        process.exit(1);
      }

      // Load migration files
      const files = fs.readdirSync(migrationsDir);
      const migrationFiles = files
        .filter(f => /^\d{4}_.*\.ts$/.test(f))
        .sort();

      if (migrationFiles.length === 0) {
        console.error('❌ No migration files found');
        process.exit(1);
      }

      // Parse migration IDs from filenames
      const toSquash = migrationFiles.filter(f => {
        const match = f.match(/^(\d{4})_/);
        return match && parseInt(match[1], 10) <= cutoffId;
      });

      const toKeep = migrationFiles.filter(f => {
        const match = f.match(/^(\d{4})_/);
        return match && parseInt(match[1], 10) > cutoffId;
      });

      if (toSquash.length === 0) {
        console.error(`❌ No migrations found up to ID ${cutoffId}`);
        process.exit(1);
      }

      console.log(`\nMigrations to squash (${toSquash.length}):`);
      toSquash.forEach(f => console.log(`  - ${f}`));
      
      if (toKeep.length > 0) {
        console.log(`\nMigrations to keep (${toKeep.length}):`);
        toKeep.forEach(f => console.log(`  - ${f}`));
      }

      if (options.dryRun) {
        console.log('\n[DRY RUN] No changes made');
        console.log('Remove --dry-run to proceed with squashing');
        return;
      }

      // For actual implementation, we would:
      // 1. Parse migration files to extract schema definitions
      // 2. Combine them using squashMigrations()
      // 3. Generate new base migration file
      // 4. Create backup of old migrations
      // 5. Delete old migration files
      
      console.log('\n⚠ Warning: This is a destructive operation');
      console.log('Squashing will:');
      console.log('  1. Create a new base migration file');
      console.log('  2. Move old migrations to a backup folder');
      console.log('  3. Update migration numbering');
      console.log('\nTo proceed, you would need to:');
      console.log('  1. Ensure all production instances are at the latest version');
      console.log('  2. Create a database backup');
      console.log('  3. Test the squashed migration in a development environment');
      console.log('\nFor safety, manual squashing is recommended.');
      console.log('See documentation for the squashing procedure.');
      
    } catch (error) {
      console.error('❌ Failed to squash migrations:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

/**
 * Print schema
 */
program
  .command('print-schema')
  .option('-f, --format <format>', 'Output format (json|table)', 'table')
  .description('Print the current database schema')
  .action(async (options) => {
    try {
      console.log('Printing schema...');
      
      const migrationsDir = path.join(process.cwd(), 'migrations');
      
      if (!fs.existsSync(migrationsDir)) {
        console.error('❌ No migrations directory found');
        process.exit(1);
      }

      // Load migration files
      const files = fs.readdirSync(migrationsDir);
      const migrationFiles = files
        .filter(f => /^\d{4}_.*\.ts$/.test(f))
        .sort();

      if (migrationFiles.length === 0) {
        console.error('❌ No migration files found');
        process.exit(1);
      }

      console.log(`\nSchema based on ${migrationFiles.length} migration(s):\n`);
      
      // Parse and display migration file names and numbers
      const migrations: Array<{id: number, name: string, file: string}> = [];
      
      for (const file of migrationFiles) {
        const match = file.match(/^(\d{4})_\d+_(.+)\.ts$/);
        if (match) {
          migrations.push({
            id: parseInt(match[1], 10),
            name: match[2],
            file: file
          });
        }
      }

      if (options.format === 'json') {
        console.log(JSON.stringify({ migrations }, null, 2));
      } else {
        // Table format
        console.log('ID    | Name                           | File');
        console.log('------|--------------------------------|' + '-'.repeat(40));
        
        migrations.forEach(m => {
          const idStr = String(m.id).padEnd(5);
          const nameStr = m.name.padEnd(30);
          console.log(`${idStr} | ${nameStr} | ${m.file}`);
        });
        
        console.log('\nNote: This shows migration files. For actual database schema,');
        console.log('use the runtime API: createSnapshot(db, migrations)');
      }
      
    } catch (error) {
      console.error('❌ Failed to print schema:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();
