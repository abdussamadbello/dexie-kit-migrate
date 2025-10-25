# dexie-migrate

**SQL-style migrations for Dexie: numbered files, snapshot, squashing, resumable upgrades, multi-tab safe.**

Give Dexie apps a linear, testable, deterministic migration story—like SQL migrations—without fighting IndexedDB's constraints.

[![npm version](https://img.shields.io/npm/v/dexie-migrate.svg)](https://www.npmjs.com/package/dexie-migrate)
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
npm install dexie dexie-migrate
```

### 1. Create your first migration

```bash
npx dexie-migrate new "initial schema"
```

This creates a migration file like `migrations/0001_20251025143000_initial_schema.ts`

### 2. Edit the migration file

```typescript
// migrations/0001_20251025143000_initial_schema.ts
import type { Migration } from 'dexie-migrate';

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
import { runMigrations } from 'dexie-migrate';
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
import type { Migration } from 'dexie-migrate';

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
import { runMigrations } from 'dexie-migrate';
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

## Roadmap

- [x] Core runtime (`runMigrations`)
- [x] CLI (`new` command)
- [ ] Schema snapshot and validation
- [ ] Migration squashing
- [ ] Multi-tab coordination enhancements
- [ ] Vite/Webpack plugins
- [ ] Progress UI components

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Credits

Inspired by migration systems from Rails, Django, and Alembic, adapted for IndexedDB and Dexie.js.
