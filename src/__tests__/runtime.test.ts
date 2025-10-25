import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { runMigrations } from '../runtime';
import type { Migration } from '../types';

describe('runMigrations', () => {
  beforeEach(async () => {
    // Clean up any existing test databases
    const databases = await indexedDB.databases();
    for (const db of databases) {
      if (db.name) {
        await Dexie.delete(db.name);
      }
    }
  });

  it('should apply a single migration', async () => {
    const migration: Migration = {
      id: 1,
      name: 'initial',
      stores: {
        users: 'id, email, name'
      }
    };

    const result = await runMigrations('test-db', [migration]);

    expect(result.db).toBeDefined();
    expect(result.appliedMigrations).toEqual([1]);
    expect(result.skippedMigrations).toEqual([]);
    expect(result.finalVersion).toBe(1);

    // Verify the table exists
    expect(result.db.tables.map((t: any) => t.name)).toContain('users');
    
    await result.db.close();
  });

  it('should apply multiple migrations in order', async () => {
    const migrations: Migration[] = [
      {
        id: 1,
        name: 'initial',
        stores: {
          users: 'id, email'
        }
      },
      {
        id: 2,
        name: 'add_name',
        stores: {
          users: 'id, email, name'
        }
      }
    ];

    const result = await runMigrations('test-db', migrations);

    expect(result.appliedMigrations).toEqual([1, 2]);
    expect(result.finalVersion).toBe(2);
    
    await result.db.close();
  });

  it('should skip already applied migrations', async () => {
    const migrations: Migration[] = [
      {
        id: 1,
        name: 'initial',
        stores: {
          users: 'id, email'
        }
      }
    ];

    // Apply first time
    const result1 = await runMigrations('test-db', migrations);
    await result1.db.close();

    // Apply again - should skip
    const result2 = await runMigrations('test-db', migrations);
    
    expect(result2.appliedMigrations).toEqual([]);
    expect(result2.skippedMigrations).toEqual([1]);
    
    await result2.db.close();
  });

  it('should run up() function during migration', async () => {
    const migration: Migration = {
      id: 1,
      name: 'initial',
      stores: {
        users: 'id, email'
      },
      async up(tx) {
        await tx.table('users').add({ id: 1, email: 'test@example.com' });
      }
    };

    const result = await runMigrations('test-db', [migration]);

    const users = await result.db.users.toArray();
    expect(users).toHaveLength(1);
    expect(users[0].email).toBe('test@example.com');
    
    await result.db.close();
  });

  it('should validate migrations array', async () => {
    await expect(
      runMigrations('test-db', null as any)
    ).rejects.toThrow('Migrations must be an array');

    await expect(
      runMigrations('test-db', [])
    ).rejects.toThrow('At least one migration is required');
  });

  it('should detect duplicate migration IDs', async () => {
    const migrations: Migration[] = [
      { id: 1, name: 'first', stores: {} },
      { id: 1, name: 'duplicate', stores: {} }
    ];

    await expect(
      runMigrations('test-db', migrations)
    ).rejects.toThrow('Duplicate migration IDs detected');
  });

  it('should support dry run mode', async () => {
    const migration: Migration = {
      id: 1,
      name: 'initial',
      stores: {
        users: 'id, email'
      }
    };

    const result = await runMigrations('test-db', [migration], { dryRun: true });

    expect(result.db).toBeNull();
    expect(result.appliedMigrations).toEqual([]);
  });

  it('should call progress callback', async () => {
    const migrations: Migration[] = [
      { id: 1, name: 'first', stores: { users: 'id' } },
      { id: 2, name: 'second', stores: { posts: 'id' } }
    ];

    const progressCalls: Array<{ current: number; total: number }> = [];
    
    const result = await runMigrations('test-db', migrations, {
      onProgress: (current, total) => {
        progressCalls.push({ current, total });
      }
    });

    expect(progressCalls.length).toBeGreaterThan(0);
    
    await result.db.close();
  });
});
