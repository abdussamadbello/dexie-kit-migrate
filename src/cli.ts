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
 * Check schema drift (placeholder)
 */
program
  .command('check')
  .description('Check for schema drift')
  .action(() => {
    console.log('Checking schema...');
    console.log('⚠ Schema validation not yet implemented');
    console.log('This will compare your code schema against a snapshot file');
  });

/**
 * Create snapshot (placeholder)
 */
program
  .command('snapshot')
  .description('Create a schema snapshot')
  .action(() => {
    console.log('Creating snapshot...');
    console.log('⚠ Snapshot creation not yet implemented');
    console.log('This will capture the current database schema');
  });

/**
 * Squash migrations (placeholder)
 */
program
  .command('squash')
  .option('--cutoff <number>', 'Migration ID to squash up to')
  .description('Squash old migrations into a single base migration')
  .action((options) => {
    console.log('Squashing migrations...');
    console.log('⚠ Migration squashing not yet implemented');
    if (options.cutoff) {
      console.log(`This will combine migrations 0001-${options.cutoff} into a base migration`);
    }
  });

/**
 * Print schema (placeholder)
 */
program
  .command('print-schema')
  .description('Print the current database schema')
  .action(() => {
    console.log('Printing schema...');
    console.log('⚠ Schema printing not yet implemented');
    console.log('This will display all tables and their indexes');
  });

program.parse();
