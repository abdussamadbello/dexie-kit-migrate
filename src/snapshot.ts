import Dexie from 'dexie';
import type { Migration, StoresMap } from './types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Schema snapshot representing the state of the database at a point in time
 */
export interface SchemaSnapshot {
  version: number;
  timestamp: number;
  tables: Record<string, TableSchema>;
  lastMigrationId: number;
}

/**
 * Schema for a single table
 */
export interface TableSchema {
  name: string;
  primaryKey: string;
  indexes: string[];
  autoIncrement: boolean;
}

/**
 * Result of schema validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Create a snapshot of the current database schema
 */
export async function createSnapshot(
  db: Dexie,
  migrations: Migration[]
): Promise<SchemaSnapshot> {
  const tables: Record<string, TableSchema> = {};
  
  for (const table of db.tables) {
    const schema = table.schema;
    
    tables[table.name] = {
      name: table.name,
      primaryKey: schema.primKey.name || schema.primKey.keyPath as string || 'id',
      indexes: schema.indexes.map(idx => idx.name),
      autoIncrement: schema.primKey.auto || false
    };
  }
  
  const lastMigration = migrations.length > 0 
    ? Math.max(...migrations.map(m => m.id))
    : 0;
  
  return {
    version: db.verno,
    timestamp: Date.now(),
    tables,
    lastMigrationId: lastMigration
  };
}

/**
 * Save snapshot to a JSON file
 */
export function saveSnapshotToFile(
  snapshot: SchemaSnapshot,
  filepath: string
): void {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  fs.writeFileSync(
    filepath,
    JSON.stringify(snapshot, null, 2),
    'utf-8'
  );
}

/**
 * Load snapshot from a JSON file
 */
export function loadSnapshotFromFile(filepath: string): SchemaSnapshot {
  if (!fs.existsSync(filepath)) {
    throw new Error(`Snapshot file not found: ${filepath}`);
  }
  
  const content = fs.readFileSync(filepath, 'utf-8');
  return JSON.parse(content) as SchemaSnapshot;
}

/**
 * Compute expected schema from migrations
 */
export function computeExpectedSchema(migrations: Migration[]): StoresMap {
  const schema: StoresMap = {};
  
  // Apply migrations in order to build final schema
  for (const migration of migrations.sort((a, b) => a.id - b.id)) {
    if (migration.stores) {
      for (const [tableName, tableSchema] of Object.entries(migration.stores)) {
        if (tableSchema === null) {
          // Table deletion
          delete schema[tableName];
        } else {
          // Table creation or update
          schema[tableName] = tableSchema;
        }
      }
    }
  }
  
  return schema;
}

/**
 * Validate current schema against expected schema
 */
export function validateSchema(
  current: SchemaSnapshot,
  expected: StoresMap
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Get expected table names (excluding internal tables)
  const expectedTables = Object.keys(expected);
  const currentTables = Object.keys(current.tables).filter(
    name => !name.startsWith('_')
  );
  
  // Check for missing tables
  for (const tableName of expectedTables) {
    if (!current.tables[tableName]) {
      errors.push(`Missing table: ${tableName}`);
    }
  }
  
  // Check for unexpected tables
  for (const tableName of currentTables) {
    if (!expected[tableName]) {
      warnings.push(`Unexpected table: ${tableName}`);
    }
  }
  
  // Validate each table's schema
  for (const tableName of expectedTables) {
    if (!current.tables[tableName]) continue;
    
    const currentTable = current.tables[tableName];
    const expectedSchema = expected[tableName];
    
    if (!expectedSchema) continue;
    
    // Parse expected schema to get indexes
    const expectedIndexes = parseSchemaString(expectedSchema);
    const currentIndexes = [currentTable.primaryKey, ...currentTable.indexes];
    
    // Check for missing indexes
    for (const expectedIndex of expectedIndexes) {
      if (!currentIndexes.includes(expectedIndex)) {
        errors.push(
          `Table ${tableName}: missing index '${expectedIndex}'`
        );
      }
    }
    
    // Check for extra indexes (warning only)
    for (const currentIndex of currentIndexes) {
      if (!expectedIndexes.includes(currentIndex)) {
        warnings.push(
          `Table ${tableName}: unexpected index '${currentIndex}'`
        );
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Parse Dexie schema string to extract field names
 */
function parseSchemaString(schema: string): string[] {
  // Dexie schema format: "primaryKey, index1, index2, [compound+index]"
  return schema
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => {
      // Remove compound index markers like [a+b]
      if (s.startsWith('[') && s.endsWith(']')) {
        return s.slice(1, -1);
      }
      // Remove prefix markers like ++id, &email, *tags
      return s.replace(/^[+&*]+/, '');
    });
}

/**
 * Compare two snapshots and return differences
 */
export function compareSnapshots(
  oldSnapshot: SchemaSnapshot,
  newSnapshot: SchemaSnapshot
): {
  added: string[];
  removed: string[];
  modified: string[];
} {
  const oldTables = new Set(Object.keys(oldSnapshot.tables));
  const newTables = new Set(Object.keys(newSnapshot.tables));
  
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];
  
  // Find added tables
  for (const table of newTables) {
    if (!oldTables.has(table)) {
      added.push(table);
    }
  }
  
  // Find removed tables
  for (const table of oldTables) {
    if (!newTables.has(table)) {
      removed.push(table);
    }
  }
  
  // Find modified tables
  for (const table of newTables) {
    if (oldTables.has(table)) {
      const oldSchema = JSON.stringify(oldSnapshot.tables[table]);
      const newSchema = JSON.stringify(newSnapshot.tables[table]);
      
      if (oldSchema !== newSchema) {
        modified.push(table);
      }
    }
  }
  
  return { added, removed, modified };
}
