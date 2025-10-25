export { runMigrations } from './runtime';
export type { 
  Migration, 
  MigrationOptions, 
  MigrationResult, 
  StoresMap,
  MigrationRecord 
} from './types';

export {
  createSnapshot,
  saveSnapshotToFile,
  loadSnapshotFromFile,
  computeExpectedSchema,
  validateSchema,
  compareSnapshots
} from './snapshot';

export type {
  SchemaSnapshot,
  TableSchema,
  ValidationResult
} from './snapshot';

export {
  squashMigrations,
  renumberMigrations,
  validateSquash,
  generateSquashedMigrationFile
} from './squash';

export type {
  SquashOptions,
  SquashResult
} from './squash';

export {
  MigrationCoordinator,
  runWithCoordination
} from './coordination';

export type {
  CoordinatorOptions
} from './coordination';
