/**
 * Vue 3 integration for dexie-migrate progress UI
 * 
 * @example
 * ```vue
 * <script setup>
 * import { ref } from 'vue';
 * import { MigrationProgress, useMigrationProgress } from 'dexie-migrate/vue';
 * import { migrations } from './migrations';
 * 
 * const { progress, db } = useMigrationProgress({
 *   dbName: 'my-db',
 *   migrations,
 *   autoStart: true
 * });
 * </script>
 * 
 * <template>
 *   <MigrationProgress 
 *     v-if="!db"
 *     :progress="progress" 
 *     title="Loading Database"
 *   />
 *   <div v-else>App ready!</div>
 * </template>
 * ```
 */

import { defineComponent, ref, onMounted, computed, type PropType } from 'vue';

export interface MigrationProgressData {
  current: number;
  total: number;
  currentMigration?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

/**
 * Vue 3 component for displaying migration progress
 */
export const MigrationProgress = defineComponent({
  name: 'MigrationProgress',
  
  props: {
    progress: {
      type: Object as PropType<MigrationProgressData>,
      required: true
    },
    title: {
      type: String,
      default: 'Database Migration'
    },
    showDetails: {
      type: Boolean,
      default: true
    },
    theme: {
      type: String as PropType<'light' | 'dark'>,
      default: 'light'
    }
  },

  setup(props) {
    const percentage = computed(() => {
      return props.progress.total > 0
        ? Math.round((props.progress.current / props.progress.total) * 100)
        : 0;
    });

    const statusText = computed(() => {
      switch (props.progress.status) {
        case 'pending':
          return 'Pending...';
        case 'running':
          return `Migrating ${props.progress.current} of ${props.progress.total}...`;
        case 'completed':
          return 'Migration completed!';
        case 'failed':
          return `Migration failed: ${props.progress.error || 'Unknown error'}`;
        default:
          return '';
      }
    });

    const containerClass = computed(() => {
      return [
        'dexie-migrate-progress',
        `dexie-migrate-progress--${props.theme}`,
        props.progress.status === 'failed' && 'dexie-migrate-progress--failed',
        props.progress.status === 'completed' && 'dexie-migrate-progress--completed'
      ].filter(Boolean).join(' ');
    });

    return {
      percentage,
      statusText,
      containerClass
    };
  },

  template: `
    <div :class="containerClass">
      <div class="dexie-migrate-progress__wrapper">
        <h3 class="dexie-migrate-progress__title">{{ title }}</h3>
        
        <div class="dexie-migrate-progress__progress-bar-container">
          <div 
            class="dexie-migrate-progress__progress-bar"
            :style="{ width: percentage + '%' }"
          />
        </div>
        
        <div class="dexie-migrate-progress__status">
          {{ statusText }}
        </div>
        
        <div 
          v-if="showDetails && progress.currentMigration"
          class="dexie-migrate-progress__details"
        >
          Current: {{ progress.currentMigration }}
        </div>
      </div>

      <style>
        .dexie-migrate-progress {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding: 20px;
        }

        .dexie-migrate-progress__wrapper {
          max-width: 500px;
          margin: 0 auto;
        }

        .dexie-migrate-progress__title {
          margin: 0 0 16px 0;
          font-size: 18px;
          font-weight: 600;
        }

        .dexie-migrate-progress__progress-bar-container {
          width: 100%;
          height: 8px;
          background-color: #e0e0e0;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 12px;
        }

        .dexie-migrate-progress__progress-bar {
          height: 100%;
          background-color: #4caf50;
          transition: width 0.3s ease;
          border-radius: 4px;
        }

        .dexie-migrate-progress__status {
          font-size: 14px;
          margin-bottom: 8px;
          color: #333;
        }

        .dexie-migrate-progress__details {
          font-size: 12px;
          color: #666;
        }

        .dexie-migrate-progress--dark .dexie-migrate-progress__title,
        .dexie-migrate-progress--dark .dexie-migrate-progress__status {
          color: #fff;
        }

        .dexie-migrate-progress--dark .dexie-migrate-progress__details {
          color: #aaa;
        }

        .dexie-migrate-progress--dark .dexie-migrate-progress__progress-bar-container {
          background-color: #333;
        }

        .dexie-migrate-progress--failed .dexie-migrate-progress__progress-bar {
          background-color: #f44336;
        }

        .dexie-migrate-progress--completed .dexie-migrate-progress__progress-bar {
          background-color: #4caf50;
        }
      </style>
    </div>
  `
});

export interface UseMigrationProgressOptions {
  /** Database name */
  dbName: string;

  /** Migrations to apply */
  migrations: any[];

  /** Additional migration options */
  options?: any;

  /** Auto-start migrations on mount */
  autoStart?: boolean;
}

/**
 * Vue 3 composable for managing migration progress
 * 
 * @example
 * ```ts
 * const { progress, db, start, reset } = useMigrationProgress({
 *   dbName: 'my-db',
 *   migrations: [m0001, m0002],
 *   autoStart: true
 * });
 * ```
 */
export function useMigrationProgress(opts: UseMigrationProgressOptions) {
  const progress = ref<MigrationProgressData>({
    current: 0,
    total: 0,
    status: 'pending'
  });

  const db = ref<any | null>(null);
  const hasStarted = ref(false);

  const start = async () => {
    if (hasStarted.value) return;
    hasStarted.value = true;

    try {
      progress.value = { current: 0, total: 0, status: 'running' };

      // Dynamic import to avoid bundling issues
      const { runMigrations } = await import('./runtime');

      const result = await runMigrations(opts.dbName, opts.migrations, {
        ...opts.options,
        onProgress: (current: number, total: number) => {
          progress.value = {
            current,
            total,
            status: 'running'
          };
        }
      });

      db.value = result.db;
      progress.value = {
        current: result.appliedMigrations.length,
        total: result.appliedMigrations.length,
        status: 'completed'
      };
    } catch (error) {
      progress.value = {
        current: 0,
        total: 0,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  };

  const reset = () => {
    progress.value = { current: 0, total: 0, status: 'pending' };
    db.value = null;
    hasStarted.value = false;
  };

  if (opts.autoStart) {
    onMounted(() => {
      if (!hasStarted.value) {
        start();
      }
    });
  }

  return {
    progress,
    db,
    start,
    reset
  };
}
