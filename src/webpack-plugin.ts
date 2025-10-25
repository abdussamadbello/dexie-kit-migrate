/**
 * Webpack plugin for dexie-migrate
 * 
 * Automatically imports migrations and provides schema validation during build
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Compiler, WebpackPluginInstance } from 'webpack';

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
 * Webpack plugin for dexie-migrate
 * 
 * Features:
 * - Auto-generates migration imports
 * - Validates schema during build
 * - Watches for migration file changes
 * 
 * @example
 * ```js
 * // webpack.config.js
 * const DexieMigratePlugin = require('dexie-migrate/webpack-plugin');
 * 
 * module.exports = {
 *   plugins: [
 *     new DexieMigratePlugin({
 *       migrationsDir: 'src/db/migrations',
 *       validateSchema: true
 *     })
 *   ]
 * };
 * ```
 */
export class DexieMigratePlugin implements WebpackPluginInstance {
  private options: Required<DexieMigratePluginOptions>;
  private migrationsPath: string = '';

  constructor(options: DexieMigratePluginOptions = {}) {
    this.options = {
      migrationsDir: options.migrationsDir ?? 'migrations',
      validateSchema: options.validateSchema ?? true,
      snapshotPath: options.snapshotPath ?? '.dexie-migrate/snapshot.json',
      verbose: options.verbose ?? false
    };
  }

  apply(compiler: Compiler): void {
    const { migrationsDir, validateSchema, snapshotPath, verbose } = this.options;

    // Resolve migrations path
    this.migrationsPath = path.resolve(compiler.context, migrationsDir);

    if (verbose) {
      console.log('[dexie-migrate] Plugin configured');
      console.log(`  Migrations dir: ${this.migrationsPath}`);
      console.log(`  Validate schema: ${validateSchema}`);
    }

    // Add migrations directory to watch
    compiler.hooks.afterEnvironment.tap('DexieMigratePlugin', () => {
      if (fs.existsSync(this.migrationsPath)) {
        // This will be picked up by webpack's watch system
        compiler.options.resolve = compiler.options.resolve || {};
        compiler.options.resolve.modules = compiler.options.resolve.modules || [];
        
        if (!compiler.options.resolve.modules.includes(this.migrationsPath)) {
          compiler.options.resolve.modules.push(this.migrationsPath);
        }
      }
    });

    // Validate schema during compilation
    compiler.hooks.beforeCompile.tapAsync(
      'DexieMigratePlugin',
      (params, callback) => {
        if (validateSchema) {
          this.validateSchema(compiler.context);
        }
        callback();
      }
    );

    // Register virtual module for auto-importing migrations
    compiler.hooks.normalModuleFactory.tap(
      'DexieMigratePlugin',
      (factory) => {
        factory.hooks.resolve.tapAsync(
          'DexieMigratePlugin',
          (resolveData, callback) => {
            const request = resolveData.request;

            if (request === 'virtual:dexie-migrate/migrations') {
              // Generate the module content
              const content = this.generateMigrationsModule(compiler.context);
              
              // Create a virtual module
              resolveData.request = path.join(__dirname, '__virtual__', 'migrations.js');
              
              // Write virtual module to temp location
              const virtualDir = path.join(__dirname, '__virtual__');
              if (!fs.existsSync(virtualDir)) {
                fs.mkdirSync(virtualDir, { recursive: true });
              }
              
              fs.writeFileSync(
                path.join(virtualDir, 'migrations.js'),
                content,
                'utf-8'
              );
            }

            callback();
          }
        );
      }
    );
  }

  /**
   * Validate schema against snapshot
   */
  private validateSchema(context: string): void {
    const snapshotFullPath = path.resolve(context, this.options.snapshotPath);

    if (!fs.existsSync(this.migrationsPath)) {
      if (this.options.verbose) {
        console.warn(`[dexie-migrate] Migrations directory not found: ${this.migrationsPath}`);
      }
      return;
    }

    if (fs.existsSync(snapshotFullPath)) {
      try {
        const snapshot = JSON.parse(fs.readFileSync(snapshotFullPath, 'utf-8'));
        const files = fs.readdirSync(this.migrationsPath);
        const migrationFiles = files.filter(f => /^\d{4}_.*\.ts$/.test(f));

        if (migrationFiles.length !== snapshot.version) {
          console.warn(
            `[dexie-migrate] Schema drift detected! ` +
            `Expected ${snapshot.version} migrations, found ${migrationFiles.length}. ` +
            `Run 'npx dexie-migrate check' for details.`
          );
        } else if (this.options.verbose) {
          console.log('[dexie-migrate] Schema validation passed');
        }
      } catch (error) {
        console.warn(`[dexie-migrate] Failed to validate schema:`, error);
      }
    } else if (this.options.verbose) {
      console.log(`[dexie-migrate] No snapshot found at ${snapshotFullPath}, skipping validation`);
    }
  }

  /**
   * Generate migrations auto-import module
   */
  private generateMigrationsModule(context: string): string {
    if (!fs.existsSync(this.migrationsPath)) {
      return 'module.exports = [];';
    }

    const files = fs.readdirSync(this.migrationsPath);
    const migrationFiles = files
      .filter(f => /^\d{4}_.*\.ts$/.test(f))
      .sort();

    if (migrationFiles.length === 0) {
      return 'module.exports = [];';
    }

    const imports = migrationFiles.map((file, index) => {
      const relativePath = path.relative(
        context,
        path.join(this.migrationsPath, file)
      );
      return `const m${index} = require('${relativePath}').default;`;
    }).join('\n');

    const exports = `module.exports = [${migrationFiles.map((_, i) => `m${i}`).join(', ')}];`;

    return `${imports}\n\n${exports}`;
  }
}

export default DexieMigratePlugin;
