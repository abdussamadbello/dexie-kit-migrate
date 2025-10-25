# dexie-migrate Documentation

## Table of Contents

1. [Getting Started](#getting-started)
2. [Core Concepts](#core-concepts)
3. [CLI Reference](#cli-reference)
4. [API Reference](#api-reference)
5. [Plugins](#plugins)
6. [UI Components](#ui-components)
7. [Best Practices](#best-practices)
8. [Migration Patterns](#migration-patterns)

## Getting Started

### Installation

```bash
npm install dexie dexie-migrate
```

### Quick Start

1. **Create your first migration:**

```bash
npx dexie-migrate new "initial schema"
```

2. **Edit the generated migration file:**

```typescript
// migrations/0001_20251025143000_initial_schema.ts
import type { Migration } from 'dexie-migrate';

export default {
  id: 1,
  name: 'initial_schema',
  
  stores: {
    users: 'id, email, name',
    posts: 'id, userId, title, createdAt'
  }
} as Migration;
```

3. **Run migrations in your app:**

```typescript
import { runMigrations } from 'dexie-migrate';
import m0001 from './migrations/0001_20251025143000_initial_schema';

const { db } = await runMigrations('my-app-db', [m0001]);

// Use the database
const users = await db.users.toArray();
```

## Core Concepts

### Migrations

Migrations are ordered, numbered changes to your database schema. Each migration:
- Has a unique numeric ID
- Defines schema changes via the `stores` property
- Optionally includes data transformations via `up()` function
- Includes metadata like name and timestamp

### Schema Evolution

Schema evolution is deterministic and linear:
1. Migrations are applied in order by ID
2. Each migration modifies the cumulative schema
3. Already-applied migrations are tracked and skipped
4. New installations apply all migrations in sequence

### Multi-Tab Safety

When multiple tabs are open:
- Only one tab runs migrations at a time
- Other tabs wait or refresh when complete
- Uses BroadcastChannel for coordination
- Prevents concurrent schema changes

## CLI Reference

### `new` - Create Migration

Create a new migration file:

```bash
npx dexie-migrate new "add user avatar"
```

**Options:**
- `[description]` - Migration description (optional)

**Output:**
- Creates numbered migration file in `migrations/` directory
- Includes boilerplate with TypeScript types

### `snapshot` - Create Schema Snapshot

Capture current schema state:

```bash
npx dexie-migrate snapshot
```

**Options:**
- `-o, --output <file>` - Output file path (default: `.dexie-migrate/snapshot.json`)
- `-d, --db <name>` - Database name

**Output:**
- Creates JSON snapshot of migration state
- Used for drift detection

### `check` - Check Schema Drift

Validate current migrations against snapshot:

```bash
npx dexie-migrate check
```

**Options:**
- `-s, --snapshot <file>` - Snapshot file to compare (default: `.dexie-migrate/snapshot.json`)

**Output:**
- Reports any drift detected
- Exit code 1 if drift found
- Exit code 0 if no drift

### `squash` - Squash Migrations

Combine multiple migrations into one:

```bash
npx dexie-migrate squash --cutoff 20
```

**Options:**
- `--cutoff <number>` - Migration ID to squash up to (default: 10)
- `-o, --output <dir>` - Output directory (default: `migrations`)
- `--dry-run` - Preview without changes

**Output:**
- Shows which migrations would be squashed
- Guidance on manual squashing process

### `print-schema` - Display Schema

Print current migration schema:

```bash
npx dexie-migrate print-schema
```

**Options:**
- `-f, --format <format>` - Output format: `json` or `table` (default: `table`)

**Output:**
- Lists all migrations with IDs and names
- Shows schema evolution

## API Reference

### `runMigrations(dbName, migrations, options?)`

Main function to run migrations and get database instance.

**Parameters:**
- `dbName` (string) - Database name
- `migrations` (Migration[]) - Array of migration objects
- `options` (MigrationOptions) - Optional configuration

**Returns:** `Promise<MigrationResult>`

**Example:**
```typescript
const result = await runMigrations('my-db', [m0001, m0002], {
  verbose: true,
  onProgress: (current, total) => console.log(`${current}/${total}`),
  onError: (migration, error) => console.error(error),
  onComplete: () => console.log('Done!')
});

// result.db - Dexie instance
// result.appliedMigrations - IDs of new migrations
// result.skippedMigrations - IDs of existing migrations
// result.finalVersion - Current DB version
```

### Schema Snapshot Functions

#### `createSnapshot(db, migrations)`

Create a snapshot from current database state:

```typescript
import { createSnapshot } from 'dexie-migrate';

const snapshot = await createSnapshot(db, migrations);
// snapshot.version, snapshot.tables, snapshot.lastMigrationId
```

#### `validateSchema(snapshot, expectedSchema)`

Validate snapshot against expected schema:

```typescript
import { validateSchema, computeExpectedSchema } from 'dexie-migrate';

const expected = computeExpectedSchema(migrations);
const result = validateSchema(snapshot, expected);

if (!result.valid) {
  console.error('Errors:', result.errors);
  console.warn('Warnings:', result.warnings);
}
```

#### `compareSnapshots(oldSnapshot, newSnapshot)`

Compare two snapshots to find differences:

```typescript
import { compareSnapshots } from 'dexie-migrate';

const diff = compareSnapshots(oldSnapshot, newSnapshot);
// diff.added - New tables
// diff.removed - Deleted tables
// diff.modified - Changed tables
```

### Migration Squashing Functions

#### `squashMigrations(migrations, options)`

Combine multiple migrations:

```typescript
import { squashMigrations } from 'dexie-migrate';

const result = squashMigrations(migrations, {
  cutoffId: 20,
  baseName: 'base_migration'
});

// result.baseMigration - Combined migration
// result.squashedIds - IDs that were merged
// result.remainingMigrations - Migrations after cutoff
```

#### `validateSquash(migrations, cutoffId)`

Check if squashing is safe:

```typescript
import { validateSquash } from 'dexie-migrate';

const validation = validateSquash(migrations, 20);
if (validation.warnings.length > 0) {
  console.warn(validation.warnings);
}
```

### Multi-Tab Coordination

#### `runWithCoordination(dbName, migrationFn, options?)`

Run migrations with automatic coordination:

```typescript
import { runWithCoordination } from 'dexie-migrate';

const result = await runWithCoordination(
  'my-db',
  () => runMigrations('my-db', migrations),
  { lockTimeout: 30000 }
);
```

#### `MigrationCoordinator`

Manual coordination control:

```typescript
import { MigrationCoordinator } from 'dexie-migrate';

const coordinator = new MigrationCoordinator('my-db', {
  lockTimeout: 30000,
  verbose: true
});

// Listen for events
coordinator.on('migration_started', msg => {
  console.log('Migration started in another tab');
});

// Acquire lock
const locked = await coordinator.waitForLock();
if (locked) {
  coordinator.notifyMigrationStarted();
  // ... run migrations
  coordinator.notifyMigrationCompleted();
}

coordinator.destroy();
```

## Plugins

### Vite Plugin

Auto-import migrations in Vite projects:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import dexieMigrate from 'dexie-migrate/vite-plugin';

export default defineConfig({
  plugins: [
    dexieMigrate({
      migrationsDir: 'src/db/migrations',
      validateSchema: true,
      snapshotPath: '.dexie-migrate/snapshot.json',
      verbose: false
    })
  ]
});
```

**Usage:**
```typescript
import migrations from 'virtual:dexie-migrate/migrations';
import { runMigrations } from 'dexie-migrate';

const { db } = await runMigrations('my-db', migrations);
```

### Webpack Plugin

Auto-import migrations in Webpack projects:

```javascript
// webpack.config.js
const { DexieMigratePlugin } = require('dexie-migrate/webpack-plugin');

module.exports = {
  plugins: [
    new DexieMigratePlugin({
      migrationsDir: 'src/db/migrations',
      validateSchema: true
    })
  ]
};
```

**Usage:**
```typescript
const migrations = require('virtual:dexie-migrate/migrations');
```

## UI Components

### Vanilla JavaScript

```typescript
import { MigrationProgressUI } from 'dexie-migrate/progress-ui';

const ui = new MigrationProgressUI({
  container: document.getElementById('progress')!,
  title: 'Upgrading Database',
  theme: 'dark',
  showDetails: true
});

await runMigrations('my-db', migrations, {
  onProgress: (current, total) => {
    ui.update({
      current,
      total,
      status: 'running',
      currentMigration: `Migration ${current}`
    });
  }
});

ui.complete();
```

### React

```tsx
import { useMigrationProgress, MigrationProgress } from 'dexie-migrate/react';

function App() {
  const { progress, db, start } = useMigrationProgress({
    dbName: 'my-db',
    migrations,
    autoStart: true
  });

  if (!db) {
    return (
      <MigrationProgress
        progress={progress}
        title="Loading Database"
        theme="light"
      />
    );
  }

  return <MainApp db={db} />;
}
```

### Vue 3

```vue
<script setup>
import { MigrationProgress, useMigrationProgress } from 'dexie-migrate/vue';

const { progress, db } = useMigrationProgress({
  dbName: 'my-db',
  migrations,
  autoStart: true
});
</script>

<template>
  <MigrationProgress
    v-if="!db"
    :progress="progress"
    title="Loading Database"
  />
  <MainApp v-else :db="db" />
</template>
```

## Best Practices

### 1. Never Edit Applied Migrations

Once a migration is applied in any environment, never modify it. Create a new migration instead.

### 2. Test Migrations Thoroughly

Test migrations with:
- Empty databases (new installations)
- Databases at various versions (upgrades)
- Large datasets (performance)

### 3. Keep Migrations Focused

Each migration should do one thing:
- Add a field
- Create an index
- Migrate data

### 4. Use Snapshots in CI/CD

```yaml
# .github/workflows/ci.yml
- name: Check schema drift
  run: npx dexie-migrate check
```

### 5. Squash Old Migrations

After all users are on a recent version:
1. Create a snapshot
2. Squash old migrations
3. Test thoroughly
4. Deploy

### 6. Handle Migration Errors

```typescript
await runMigrations('my-db', migrations, {
  onError: (migration, error) => {
    // Log to error tracking service
    console.error(`Migration ${migration.id} failed:`, error);
    
    // Show user-friendly message
    alert('Database upgrade failed. Please refresh the page.');
  }
});
```

## Migration Patterns

### Add Column with Default Value

```typescript
{
  id: 5,
  name: 'add_status_field',
  stores: {
    tasks: 'id, title, status, createdAt'
  },
  async up(tx) {
    await tx.table('tasks').toCollection().modify(task => {
      task.status = task.status || 'pending';
    });
  }
}
```

### Rename Column

```typescript
{
  id: 6,
  name: 'rename_email_to_emailAddress',
  stores: {
    users: 'id, emailAddress, name'
  },
  async up(tx) {
    await tx.table('users').toCollection().modify(user => {
      user.emailAddress = user.email;
      delete user.email;
    });
  }
}
```

### Add Index

```typescript
{
  id: 7,
  name: 'index_posts_by_author',
  stores: {
    posts: 'id, authorId, title, createdAt' // authorId is now indexed
  }
}
```

### Create Table

```typescript
{
  id: 8,
  name: 'create_comments_table',
  stores: {
    comments: 'id, postId, userId, text, createdAt'
  }
}
```

### Delete Table

```typescript
{
  id: 9,
  name: 'remove_old_logs_table',
  stores: {
    logs: null // Mark for deletion
  }
}
```

### Complex Data Migration

```typescript
{
  id: 10,
  name: 'normalize_tags',
  stores: {
    tags: 'id, name',
    postTags: 'id, postId, tagId'
  },
  async up(tx) {
    const posts = await tx.table('posts').toArray();
    const tagMap = new Map();
    
    for (const post of posts) {
      if (post.tags) {
        for (const tagName of post.tags) {
          let tag = tagMap.get(tagName);
          if (!tag) {
            tag = await tx.table('tags').add({ name: tagName });
            tagMap.set(tagName, tag);
          }
          
          await tx.table('postTags').add({
            postId: post.id,
            tagId: tag
          });
        }
        
        // Remove old tags field
        delete post.tags;
        await tx.table('posts').put(post);
      }
    }
  }
}
```

### Validation

```typescript
{
  id: 11,
  name: 'add_constraints',
  stores: {
    users: 'id, &email, name' // & makes email unique
  },
  async validateAfter(tx) {
    const users = await tx.table('users').toArray();
    const emails = users.map(u => u.email);
    const uniqueEmails = new Set(emails);
    
    if (emails.length !== uniqueEmails.size) {
      throw new Error('Duplicate emails found after migration');
    }
    
    return true;
  }
}
```

## Troubleshooting

### Migration Stuck in Progress

If a migration appears stuck:
1. Check browser console for errors
2. Close all tabs and reopen
3. Check if data is corrupted
4. As last resort, delete IndexedDB and start fresh

### Schema Drift Detected

If `check` command reports drift:
1. Review new migrations
2. Update snapshot: `npx dexie-migrate snapshot`
3. Commit new snapshot

### Type Errors with TypeScript

Ensure you have proper types:
```bash
npm install --save-dev @types/node
```

And in tsconfig.json:
```json
{
  "compilerOptions": {
    "types": ["dexie"]
  }
}
```
