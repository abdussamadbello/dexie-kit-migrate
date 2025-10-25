import type { Transaction } from 'dexie';

/**
 * Schema definition for tables
 * Key is table name, value is Dexie schema string
 * Example: { users: 'id, email, name', posts: 'id, userId, title' }
 */
export type StoresMap = Record<string, string | null>;

/**
 * Migration definition interface
 */
export interface Migration {
  /** Unique migration ID (must match filename prefix) */
  id: number;
  
  /** Migration name (must match filename suffix) */
  name: string;
  
  /** Optional schema changes for this migration */
  stores?: StoresMap;
  
  /** Optional data transformation function */
  up?: (tx: Transaction) => Promise<void>;
  
  /** Optional rollback function (test-only, never runs in production) */
  down?: (tx: Transaction) => Promise<void>;
  
  /** Optional validation after migration */
  validateAfter?: (tx: Transaction) => Promise<boolean>;
  
  /** Optional timeout in milliseconds (default 30s) */
  timeout?: number;
}

/**
 * Configuration options for runMigrations
 */
export interface MigrationOptions {
  /** Preview migrations without applying them */
  dryRun?: boolean;
  
  /** Enable verbose logging */
  verbose?: boolean;
  
  /** Progress callback */
  onProgress?: (current: number, total: number) => void;
  
  /** Error callback */
  onError?: (migration: Migration, error: Error) => void;
  
  /** Completion callback */
  onComplete?: () => void;
}

/**
 * Result returned by runMigrations
 */
export interface MigrationResult {
  /** Ready-to-use Dexie database instance */
  db: any;
  
  /** IDs of migrations that were applied */
  appliedMigrations: number[];
  
  /** IDs of migrations that were skipped (already applied) */
  skippedMigrations: number[];
  
  /** Final database version */
  finalVersion: number;
}

/**
 * Internal migration tracking record
 */
export interface MigrationRecord {
  id: number;
  name: string;
  appliedAt: number;
}
