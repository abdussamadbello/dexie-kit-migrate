/**
 * Vite plugin for dexie-migrate
 * 
 * Automatically imports migrations and provides schema validation during build
 */

import type { Plugin } from 'vite';
import * as fs from 'fs';
import * as path from 'path';

export interface DexieMigratePluginOptions {
  /**
   * Path to migrations directory (relative to project root)
   * @default 'migrations'
   */
  migrationsDir?: string;

  /**
   * Enable schema validation during build
   * @default true
   */
  validateSchema?: boolean;

  /**
   * Path to schema snapshot file for validation
   * @default '.dexie-migrate/snapshot.json'
   */
  snapshotPath?: string;

  /**
   * Enable verbose logging
   * @default false
   */
  verbose?: boolean;
}

/**
 * Vite plugin for dexie-migrate
 * 
 * Features:
 * - Auto-generates migration imports
 * - Validates schema during build
 * - Hot-reloads when migrations change
 * 
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite';
 * import dexieMigrate from 'dexie-migrate/vite-plugin';
 * 
 * export default defineConfig({
 *   plugins: [
 *     dexieMigrate({
 *       migrationsDir: 'src/db/migrations',
 *       validateSchema: true
 *     })
 *   ]
 * });
 * ```
 */
export default function dexieMigratePlugin(
  options: DexieMigratePluginOptions = {}
): Plugin {
  const {
    migrationsDir = 'migrations',
    validateSchema = true,
    snapshotPath = '.dexie-migrate/snapshot.json',
    verbose = false
  } = options;

  let root: string;
  let migrationsPath: string;

  return {
    name: 'dexie-migrate',

    configResolved(config) {
      root = config.root;
      migrationsPath = path.resolve(root, migrationsDir);

      if (verbose) {
        console.log('[dexie-migrate] Plugin configured');
        console.log(`  Migrations dir: ${migrationsPath}`);
        console.log(`  Validate schema: ${validateSchema}`);
      }
    },

    buildStart() {
      if (!fs.existsSync(migrationsPath)) {
        if (verbose) {
          console.warn(`[dexie-migrate] Migrations directory not found: ${migrationsPath}`);
        }
        return;
      }

      if (validateSchema) {
        const snapshotFullPath = path.resolve(root, snapshotPath);
        
        if (fs.existsSync(snapshotFullPath)) {
          try {
            const snapshot = JSON.parse(fs.readFileSync(snapshotFullPath, 'utf-8'));
            const files = fs.readdirSync(migrationsPath);
            const migrationFiles = files.filter(f => /^\d{4}_.*\.ts$/.test(f));

            if (migrationFiles.length !== snapshot.version) {
              this.warn(
                `[dexie-migrate] Schema drift detected! ` +
                `Expected ${snapshot.version} migrations, found ${migrationFiles.length}. ` +
                `Run 'npx dexie-migrate check' for details.`
              );
            } else if (verbose) {
              console.log('[dexie-migrate] Schema validation passed');
            }
          } catch (error) {
            this.warn(`[dexie-migrate] Failed to validate schema: ${error}`);
          }
        } else if (verbose) {
          console.log(`[dexie-migrate] No snapshot found at ${snapshotFullPath}, skipping validation`);
        }
      }
    },

    /**
     * Transform virtual module that auto-imports migrations
     */
    resolveId(id) {
      if (id === 'virtual:dexie-migrate/migrations') {
        return '\0virtual:dexie-migrate/migrations';
      }
      return null;
    },

    load(id) {
      if (id === '\0virtual:dexie-migrate/migrations') {
        if (!fs.existsSync(migrationsPath)) {
          return 'export default [];';
        }

        const files = fs.readdirSync(migrationsPath);
        const migrationFiles = files
          .filter(f => /^\d{4}_.*\.ts$/.test(f))
          .sort();

        if (migrationFiles.length === 0) {
          return 'export default [];';
        }

        const imports = migrationFiles.map((file, index) => {
          const relativePath = path.relative(
            root,
            path.join(migrationsPath, file)
          );
          return `import m${index} from '/${relativePath}';`;
        }).join('\n');

        const exports = `export default [${migrationFiles.map((_, i) => `m${i}`).join(', ')}];`;

        return `${imports}\n\n${exports}`;
      }
      return null;
    },

    /**
     * Watch migrations directory for changes
     */
    configureServer(server) {
      const watchPath = path.join(migrationsPath, '**/*.ts');
      
      server.watcher.add(watchPath);
      
      server.watcher.on('add', (file) => {
        if (file.startsWith(migrationsPath)) {
          if (verbose) {
            console.log(`[dexie-migrate] New migration detected: ${path.basename(file)}`);
          }
          // Trigger HMR for the virtual module
          const module = server.moduleGraph.getModuleById('\0virtual:dexie-migrate/migrations');
          if (module) {
            server.moduleGraph.invalidateModule(module);
            server.ws.send({
              type: 'full-reload',
              path: '*'
            });
          }
        }
      });
    }
  };
}
