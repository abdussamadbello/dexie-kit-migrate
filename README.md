# @dexie-kit/migrate

**SQL-style migrations for Dexie: numbered files, snapshot, squashing, resumable upgrades, multi-tab safe.**

Give Dexie apps a linear, testable, deterministic migration story—like SQL migrations—without fighting IndexedDB's constraints.

[![npm version](https://img.shields.io/npm/v/@dexie-kit/migrate.svg)](https://www.npmjs.com/package/@dexie-kit/migrate)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

✅ **Numbered, append-only migration files** (like Rails/Django/Alembic)  
✅ **Deterministic schema evolution** across teams and deployments  
✅ **Git-friendly** (one file per change, easy to review)  
✅ **Resumable migrations** (atomic steps, retry on failure)  
✅ **TypeScript-first** with full type safety  
✅ **Framework-agnostic** (works with React, Vue, Svelte, vanilla JS, etc.)  
✅ **Bundler-agnostic** (Vite, Webpack, Rollup, or no bundler)

## Quick Start

### Installation

```bash
npm install dexie @dexie-kit/migrate
```

### 1. Create your first migration

```bash
npx dexie-migrate new "initial schema"
```

This creates a migration file like `migrations/0001_20251025143000_initial_schema.ts`

### 2. Edit the migration file

```typescript
// migrations/0001_20251025143000_initial_schema.ts
import type { Migration } from '@dexie-kit/migrate';

export default {
  id: 1,
  name: 'initial_schema',
  
  stores: {
    forms: 'id, name, createdAt',
    responses: 'id, formId, createdAt'
  }
} as Migration;
```

### 3. Initialize your database

```typescript
// db/index.ts
import { runMigrations } from '@dexie-kit/migrate';
import m0001 from './migrations/0001_20251025143000_initial_schema';

const MIGRATIONS = [m0001];

export const db = await runMigrations('my-app-db', MIGRATIONS);
```

### 4. Use it anywhere in your app

```typescript
// main.ts
import { db } from './db';

const forms = await db.forms.toArray();
console.log('Forms:', forms);
```

## Usage

### Creating Migrations

**Add a new migration:**
```bash
npx dexie-migrate new "add user avatar field"
```

**Migration with data transformation:**
```typescript
// migrations/0002_20251025150000_add_updated_at.ts
import type { Migration } from '@dexie-kit/migrate';

export default {
  id: 2,
  name: 'add_updated_at',
  
  stores: {
    forms: 'id, name, createdAt, updatedAt'
  },
  
  async up(tx) {
    const now = Date.now();
    await tx.table('forms').toCollection().modify(form => {
      form.updatedAt = form.updatedAt ?? now;
    });
  }
} as Migration;
```

### Running Migrations

**Basic usage:**
```typescript
import { runMigrations } from '@dexie-kit/migrate';
import m0001 from './migrations/0001_initial_schema';
import m0002 from './migrations/0002_add_updated_at';

const MIGRATIONS = [m0001, m0002];

const { db } = await runMigrations('my-app-db', MIGRATIONS);
```

**With options:**
```typescript
const { db, appliedMigrations, skippedMigrations } = await runMigrations(
  'my-app-db', 
  MIGRATIONS, 
  {
    verbose: true,
    onProgress: (current, total) => {
      console.log(`Migrating: ${current}/${total}`);
    },
    onError: (migration, error) => {
      console.error(`Migration ${migration.id} failed:`, error);
    },
    onComplete: () => {
      console.log('All migrations completed!');
    }
  }
);
```

### Auto-importing Migrations

**Vite:**
```typescript
const migrationModules = import.meta.glob<{ default: Migration }>(
  './migrations/*.ts',
  { eager: true }
);

const MIGRATIONS = Object.values(migrationModules)
  .map(m => m.default)
  .sort((a, b) => a.id - b.id);
```

**Webpack:**
```typescript
const migrationContext = require.context('./migrations', false, /\.ts$/);

const MIGRATIONS = migrationContext
  .keys()
  .map(key => migrationContext(key).default)
  .sort((a, b) => a.id - b.id);
```

## API Reference

### `runMigrations(dbName, migrations, options?)`

Run migrations and return a Dexie database instance.

**Parameters:**
- `dbName` (string): Database name
- `migrations` (Migration[]): Array of migration objects
- `options` (MigrationOptions, optional):
  - `dryRun` (boolean): Preview without applying
  - `verbose` (boolean): Enable logging
  - `onProgress` (function): Progress callback
  - `onError` (function): Error callback
  - `onComplete` (function): Completion callback

**Returns:** `Promise<MigrationResult>`
- `db`: Dexie database instance
- `appliedMigrations`: IDs of newly applied migrations
- `skippedMigrations`: IDs of already applied migrations
- `finalVersion`: Current database version

### Migration Interface

```typescript
interface Migration {
  id: number;                                      // Required: unique ID
  name: string;                                    // Required: descriptive name
  stores?: StoresMap;                              // Optional: schema changes
  up?: (tx: Transaction) => Promise<void>;        // Optional: data transformation
  down?: (tx: Transaction) => Promise<void>;      // Optional: test-only rollback
  validateAfter?: (tx: Transaction) => Promise<boolean>; // Optional: validation
  timeout?: number;                                // Optional: timeout in ms
}
```

## CLI Commands

```bash
# Create new migration
npx dexie-migrate new "description"

# Check schema drift (coming soon)
npx dexie-migrate check

# Create snapshot (coming soon)
npx dexie-migrate snapshot

# Squash migrations (coming soon)
npx dexie-migrate squash --cutoff 20

# Print schema (coming soon)
npx dexie-migrate print-schema
```

## Migration Patterns

### Add Column
```typescript
{
  id: 3,
  name: 'add_status',
  stores: {
    forms: 'id, name, createdAt, updatedAt, status'
  },
  async up(tx) {
    await tx.table('forms').toCollection().modify(form => {
      form.status = 'draft';
    });
  }
}
```

### Add Index
```typescript
{
  id: 4,
  name: 'index_forms_status',
  stores: {
    forms: 'id, name, createdAt, updatedAt, status' // status is now indexed
  }
}
```

### Rename Table
```typescript
{
  id: 5,
  name: 'rename_users_to_accounts',
  stores: {
    accounts: 'id, email, name',
    users: null // mark for deletion
  },
  async up(tx) {
    const oldData = await tx.table('users').toArray();
    await tx.table('accounts').bulkAdd(oldData);
  }
}
```

## Requirements

- **Dexie.js**: ^3.0.0 || ^4.0.0
- **Modern JavaScript environment**: Browser with ES modules support or bundler
- **Optional**: TypeScript for type safety

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Safari iOS 14+

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Type check
npm run type-check
```

## Advanced Features

### Schema Snapshot and Validation

Create and validate schema snapshots to detect drift:

```bash
# Create a snapshot of current schema
npx dexie-migrate snapshot

# Check for schema drift
npx dexie-migrate check
```

**Programmatic API:**
```typescript
import { createSnapshot, validateSchema, computeExpectedSchema } from '@dexie-kit/migrate';

// Create snapshot from database
const snapshot = await createSnapshot(db, migrations);

// Validate current schema against expected
const expected = computeExpectedSchema(migrations);
const result = validateSchema(snapshot, expected);

if (!result.valid) {
  console.error('Schema errors:', result.errors);
}
```

### Migration Squashing

Combine multiple migrations into a single base migration:

```bash
# Squash migrations up to ID 20
npx dexie-migrate squash --cutoff 20

# Preview without making changes
npx dexie-migrate squash --cutoff 20 --dry-run
```

**Programmatic API:**
```typescript
import { squashMigrations, renumberMigrations } from '@dexie-kit/migrate';

const result = squashMigrations(migrations, { cutoffId: 20 });

// result.baseMigration - the new combined migration
// result.remainingMigrations - migrations after cutoff
// result.squashedIds - IDs that were squashed
```

### Multi-Tab Coordination

Ensure safe migrations across multiple browser tabs:

```typescript
import { runWithCoordination, MigrationCoordinator } from '@dexie-kit/migrate';

// Simple coordination wrapper
const result = await runWithCoordination(
  'my-db',
  async () => runMigrations('my-db', migrations),
  { lockTimeout: 30000, verbose: true }
);

// Or use coordinator directly for more control
const coordinator = new MigrationCoordinator('my-db', { verbose: true });

coordinator.on('migration_started', (msg) => {
  console.log('Another tab started migration');
});

const locked = await coordinator.waitForLock();
if (locked) {
  // Run migrations
  coordinator.notifyMigrationStarted();
  // ... 
  coordinator.notifyMigrationCompleted();
}

coordinator.destroy();
```

### Vite Plugin

Auto-import migrations in Vite projects:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import dexieMigrate from '@dexie-kit/migrate/vite-plugin';

export default defineConfig({
  plugins: [
    dexieMigrate({
      migrationsDir: 'src/db/migrations',
      validateSchema: true,
      snapshotPath: '.dexie-migrate/snapshot.json'
    })
  ]
});
```

Then import migrations using a virtual module:

```typescript
import migrations from 'virtual:dexie-migrate/migrations';
import { runMigrations } from '@dexie-kit/migrate';

const { db } = await runMigrations('my-db', migrations);
```

### Webpack Plugin

Auto-import migrations in Webpack projects:

```javascript
// webpack.config.js
const DexieMigratePlugin = require('@dexie-kit/migrate/webpack-plugin');

module.exports = {
  plugins: [
    new DexieMigratePlugin({
      migrationsDir: 'src/db/migrations',
      validateSchema: true
    })
  ]
};
```

### Progress UI Components

Display migration progress to users:

**Vanilla JavaScript:**
```typescript
import { showMigrationProgress } from '@dexie-kit/migrate/progress-ui';

const ui = showMigrationProgress('migration-container', {
  title: 'Upgrading Database',
  theme: 'dark'
});

await runMigrations('my-db', migrations, {
  onProgress: (current, total) => {
    ui.update({ current, total, status: 'running' });
  }
});

ui.complete();
```

**React:**
```tsx
import { useMigrationProgress, MigrationProgress } from '@dexie-kit/migrate/react';

function App() {
  const { progress, db } = useMigrationProgress({
    dbName: 'my-db',
    migrations: [m0001, m0002],
    autoStart: true
  });

  if (!db) {
    return <MigrationProgress progress={progress} />;
  }

  return <div>App ready!</div>;
}
```

**Vue 3:**
```vue
<script setup>
import { MigrationProgress, useMigrationProgress } from '@dexie-kit/migrate/vue';

const { progress, db } = useMigrationProgress({
  dbName: 'my-db',
  migrations: [m0001, m0002],
  autoStart: true
});
</script>

<template>
  <MigrationProgress v-if="!db" :progress="progress" />
  <div v-else>App ready!</div>
</template>
```

## Roadmap

- [x] Core runtime (`runMigrations`)
- [x] CLI (`new` command)
- [x] Schema snapshot and validation
- [x] Migration squashing
- [x] Multi-tab coordination enhancements
- [x] Vite/Webpack plugins
- [x] Progress UI components

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Credits

Inspired by migration systems from Rails, Django, and Alembic, adapted for IndexedDB and Dexie.js.
