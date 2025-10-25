import { describe, it, expect, beforeEach } from 'vitest';
import Dexie from 'dexie';
import { runMigrations } from '../runtime';
import { 
  createSnapshot, 
  computeExpectedSchema,
  validateSchema,
  compareSnapshots,
  type SchemaSnapshot
} from '../snapshot';
import type { Migration } from '../types';

describe('Schema Snapshot', () => {
  beforeEach(async () => {
    try {
      await Dexie.delete('snapshot-test-db');
    } catch {
      // Ignore errors if database doesn't exist
    }
  });

  describe('createSnapshot', () => {
    it('should create a snapshot of the current database schema', async () => {
      const migrations: Migration[] = [
        {
          id: 1,
          name: 'initial',
          stores: {
            users: 'id, email, name',
            posts: 'id, userId, title'
          }
        }
      ];

      const { db } = await runMigrations('snapshot-test-db', migrations);
      const snapshot = await createSnapshot(db, migrations);

      expect(snapshot.version).toBe(1);
      expect(snapshot.lastMigrationId).toBe(1);
      expect(snapshot.tables.users).toBeDefined();
      expect(snapshot.tables.posts).toBeDefined();
      expect(snapshot.tables.users.name).toBe('users');
      
      await db.close();
    });

    it('should capture table indexes correctly', async () => {
      const migrations: Migration[] = [
        {
          id: 1,
          name: 'initial',
          stores: {
            users: 'id, email, name, createdAt'
          }
        }
      ];

      const { db } = await runMigrations('snapshot-test-db', migrations);
      const snapshot = await createSnapshot(db, migrations);

      expect(snapshot.tables.users.indexes).toContain('email');
      expect(snapshot.tables.users.indexes).toContain('name');
      expect(snapshot.tables.users.indexes).toContain('createdAt');
      
      await db.close();
    });
  });

  describe('computeExpectedSchema', () => {
    it('should compute final schema from migrations', () => {
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

      const schema = computeExpectedSchema(migrations);

      expect(schema.users).toBe('id, email, name');
    });

    it('should handle table deletion', () => {
      const migrations: Migration[] = [
        {
          id: 1,
          name: 'initial',
          stores: {
            users: 'id, email',
            temp: 'id, data'
          }
        },
        {
          id: 2,
          name: 'remove_temp',
          stores: {
            temp: null
          }
        }
      ];

      const schema = computeExpectedSchema(migrations);

      expect(schema.users).toBe('id, email');
      expect(schema.temp).toBeUndefined();
    });

    it('should apply migrations in order regardless of input order', () => {
      const migrations: Migration[] = [
        {
          id: 2,
          name: 'add_name',
          stores: {
            users: 'id, email, name'
          }
        },
        {
          id: 1,
          name: 'initial',
          stores: {
            users: 'id, email'
          }
        }
      ];

      const schema = computeExpectedSchema(migrations);

      expect(schema.users).toBe('id, email, name');
    });
  });

  describe('validateSchema', () => {
    it('should validate matching schemas', async () => {
      const migrations: Migration[] = [
        {
          id: 1,
          name: 'initial',
          stores: {
            users: 'id, email, name'
          }
        }
      ];

      const { db } = await runMigrations('snapshot-test-db', migrations);
      const snapshot = await createSnapshot(db, migrations);
      const expected = computeExpectedSchema(migrations);
      
      const result = validateSchema(snapshot, expected);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      
      await db.close();
    });

    it('should detect missing tables', async () => {
      const migrations: Migration[] = [
        {
          id: 1,
          name: 'initial',
          stores: {
            users: 'id, email'
          }
        }
      ];

      const { db } = await runMigrations('snapshot-test-db', migrations);
      const snapshot = await createSnapshot(db, migrations);
      
      // Pretend we expect a 'posts' table
      const expected = {
        users: 'id, email',
        posts: 'id, title'
      };
      
      const result = validateSchema(snapshot, expected);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing table: posts');
      
      await db.close();
    });

    it('should warn about unexpected tables', async () => {
      const migrations: Migration[] = [
        {
          id: 1,
          name: 'initial',
          stores: {
            users: 'id, email',
            extra: 'id, data'
          }
        }
      ];

      const { db } = await runMigrations('snapshot-test-db', migrations);
      const snapshot = await createSnapshot(db, migrations);
      
      // Only expect users table
      const expected = {
        users: 'id, email'
      };
      
      const result = validateSchema(snapshot, expected);

      expect(result.warnings).toContain('Unexpected table: extra');
      
      await db.close();
    });
  });

  describe('compareSnapshots', () => {
    it('should detect added tables', () => {
      const oldSnapshot: SchemaSnapshot = {
        version: 1,
        timestamp: Date.now(),
        lastMigrationId: 1,
        tables: {
          users: {
            name: 'users',
            primaryKey: 'id',
            indexes: ['email'],
            autoIncrement: false
          }
        }
      };

      const newSnapshot: SchemaSnapshot = {
        version: 2,
        timestamp: Date.now(),
        lastMigrationId: 2,
        tables: {
          users: {
            name: 'users',
            primaryKey: 'id',
            indexes: ['email'],
            autoIncrement: false
          },
          posts: {
            name: 'posts',
            primaryKey: 'id',
            indexes: ['userId'],
            autoIncrement: false
          }
        }
      };

      const diff = compareSnapshots(oldSnapshot, newSnapshot);

      expect(diff.added).toContain('posts');
      expect(diff.removed).toHaveLength(0);
      expect(diff.modified).toHaveLength(0);
    });

    it('should detect removed tables', () => {
      const oldSnapshot: SchemaSnapshot = {
        version: 1,
        timestamp: Date.now(),
        lastMigrationId: 1,
        tables: {
          users: {
            name: 'users',
            primaryKey: 'id',
            indexes: ['email'],
            autoIncrement: false
          },
          temp: {
            name: 'temp',
            primaryKey: 'id',
            indexes: [],
            autoIncrement: false
          }
        }
      };

      const newSnapshot: SchemaSnapshot = {
        version: 2,
        timestamp: Date.now(),
        lastMigrationId: 2,
        tables: {
          users: {
            name: 'users',
            primaryKey: 'id',
            indexes: ['email'],
            autoIncrement: false
          }
        }
      };

      const diff = compareSnapshots(oldSnapshot, newSnapshot);

      expect(diff.removed).toContain('temp');
      expect(diff.added).toHaveLength(0);
    });

    it('should detect modified tables', () => {
      const oldSnapshot: SchemaSnapshot = {
        version: 1,
        timestamp: Date.now(),
        lastMigrationId: 1,
        tables: {
          users: {
            name: 'users',
            primaryKey: 'id',
            indexes: ['email'],
            autoIncrement: false
          }
        }
      };

      const newSnapshot: SchemaSnapshot = {
        version: 2,
        timestamp: Date.now(),
        lastMigrationId: 2,
        tables: {
          users: {
            name: 'users',
            primaryKey: 'id',
            indexes: ['email', 'name'],
            autoIncrement: false
          }
        }
      };

      const diff = compareSnapshots(oldSnapshot, newSnapshot);

      expect(diff.modified).toContain('users');
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
    });
  });
});
