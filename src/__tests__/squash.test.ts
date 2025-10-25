import { describe, it, expect } from 'vitest';
import { 
  squashMigrations, 
  renumberMigrations,
  validateSquash,
  generateSquashedMigrationFile
} from '../squash';
import type { Migration } from '../types';

describe('Migration Squashing', () => {
  describe('squashMigrations', () => {
    it('should squash multiple migrations into one base migration', () => {
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
        },
        {
          id: 3,
          name: 'add_posts',
          stores: {
            posts: 'id, userId, title'
          }
        }
      ];

      const result = squashMigrations(migrations, { cutoffId: 3 });

      expect(result.baseMigration.id).toBe(1);
      expect(result.baseMigration.name).toBe('base_migration');
      expect(result.baseMigration.stores?.users).toBe('id, email, name');
      expect(result.baseMigration.stores?.posts).toBe('id, userId, title');
      expect(result.squashedIds).toEqual([1, 2, 3]);
      expect(result.remainingMigrations).toHaveLength(0);
    });

    it('should keep migrations after cutoff', () => {
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
        },
        {
          id: 3,
          name: 'add_posts',
          stores: {
            posts: 'id, title'
          }
        }
      ];

      const result = squashMigrations(migrations, { cutoffId: 2 });

      expect(result.squashedIds).toEqual([1, 2]);
      expect(result.remainingMigrations).toHaveLength(1);
      expect(result.remainingMigrations[0].id).toBe(3);
    });

    it('should use custom base migration name', () => {
      const migrations: Migration[] = [
        {
          id: 1,
          name: 'initial',
          stores: {
            users: 'id, email'
          }
        }
      ];

      const result = squashMigrations(migrations, { 
        cutoffId: 1, 
        baseName: 'custom_base' 
      });

      expect(result.baseMigration.name).toBe('custom_base');
    });

    it('should handle table deletions correctly', () => {
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

      const result = squashMigrations(migrations, { cutoffId: 2 });

      expect(result.baseMigration.stores?.users).toBe('id, email');
      expect(result.baseMigration.stores?.temp).toBeUndefined();
    });

    it('should throw error when no migrations match cutoff', () => {
      const migrations: Migration[] = [
        {
          id: 5,
          name: 'initial',
          stores: {
            users: 'id, email'
          }
        }
      ];

      expect(() => {
        squashMigrations(migrations, { cutoffId: 3 });
      }).toThrow('No migrations to squash');
    });
  });

  describe('renumberMigrations', () => {
    it('should renumber migrations sequentially', () => {
      const migrations: Migration[] = [
        { id: 5, name: 'first', stores: {} },
        { id: 10, name: 'second', stores: {} },
        { id: 15, name: 'third', stores: {} }
      ];

      const renumbered = renumberMigrations(migrations);

      expect(renumbered[0].id).toBe(1);
      expect(renumbered[1].id).toBe(2);
      expect(renumbered[2].id).toBe(3);
    });

    it('should use custom start ID', () => {
      const migrations: Migration[] = [
        { id: 5, name: 'first', stores: {} },
        { id: 10, name: 'second', stores: {} }
      ];

      const renumbered = renumberMigrations(migrations, 10);

      expect(renumbered[0].id).toBe(10);
      expect(renumbered[1].id).toBe(11);
    });

    it('should preserve migration names and content', () => {
      const migrations: Migration[] = [
        { 
          id: 5, 
          name: 'first', 
          stores: { users: 'id' },
          async up(tx) { /* noop */ }
        }
      ];

      const renumbered = renumberMigrations(migrations);

      expect(renumbered[0].name).toBe('first');
      expect(renumbered[0].stores).toEqual({ users: 'id' });
      expect(renumbered[0].up).toBeDefined();
    });
  });

  describe('validateSquash', () => {
    it('should warn about up functions', () => {
      const migrations: Migration[] = [
        {
          id: 1,
          name: 'initial',
          stores: { users: 'id, email' },
          async up(tx) {
            await tx.table('users').add({ id: 1, email: 'test@example.com' });
          }
        }
      ];

      const result = validateSquash(migrations, 1);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('up() functions');
    });

    it('should warn about down functions', () => {
      const migrations: Migration[] = [
        {
          id: 1,
          name: 'initial',
          stores: { users: 'id, email' },
          async down(tx) {
            await tx.table('users').clear();
          }
        }
      ];

      const result = validateSquash(migrations, 1);

      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('down()'))).toBe(true);
    });

    it('should warn about validation functions', () => {
      const migrations: Migration[] = [
        {
          id: 1,
          name: 'initial',
          stores: { users: 'id, email' },
          async validateAfter(tx) {
            return true;
          }
        }
      ];

      const result = validateSquash(migrations, 1);

      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('validateAfter()'))).toBe(true);
    });

    it('should return no warnings for simple schema migrations', () => {
      const migrations: Migration[] = [
        {
          id: 1,
          name: 'initial',
          stores: { users: 'id, email' }
        },
        {
          id: 2,
          name: 'add_name',
          stores: { users: 'id, email, name' }
        }
      ];

      const result = validateSquash(migrations, 2);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('generateSquashedMigrationFile', () => {
    it('should generate valid migration file content', () => {
      const migration: Migration = {
        id: 1,
        name: 'base_migration',
        stores: {
          users: 'id, email, name',
          posts: 'id, userId, title'
        }
      };

      const content = generateSquashedMigrationFile(migration);

      expect(content).toContain('import type { Migration }');
      expect(content).toContain("id: 1");
      expect(content).toContain("name: 'base_migration'");
      expect(content).toContain("users: 'id, email, name'");
      expect(content).toContain("posts: 'id, userId, title'");
      expect(content).toContain('as Migration');
    });

    it('should handle null table schemas for deletions', () => {
      const migration: Migration = {
        id: 1,
        name: 'base',
        stores: {
          users: 'id, email',
          temp: null
        }
      };

      const content = generateSquashedMigrationFile(migration);

      expect(content).toContain('temp: null');
    });
  });
});
