/**
 * React integration for dexie-migrate progress UI
 * 
 * @example
 * ```tsx
 * import { MigrationProgress } from 'dexie-migrate/react';
 * 
 * function App() {
 *   const [progress, setProgress] = useState({ current: 0, total: 0, status: 'pending' });
 * 
 *   useEffect(() => {
 *     runMigrations('my-db', migrations, {
 *       onProgress: (current, total) => {
 *         setProgress({ current, total, status: 'running' });
 *       }
 *     }).then(() => {
 *       setProgress(prev => ({ ...prev, status: 'completed' }));
 *     });
 *   }, []);
 * 
 *   return <MigrationProgress progress={progress} />;
 * }
 * ```
 */

import React, { useEffect, useRef } from 'react';

export interface MigrationProgressData {
  current: number;
  total: number;
  currentMigration?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

export interface MigrationProgressProps {
  /** Progress data */
  progress: MigrationProgressData;

  /** Custom title */
  title?: string;

  /** Show detailed progress */
  showDetails?: boolean;

  /** Theme */
  theme?: 'light' | 'dark';

  /** Custom class name */
  className?: string;

  /** Custom styles */
  style?: React.CSSProperties;
}

/**
 * React component for displaying migration progress
 */
export const MigrationProgress: React.FC<MigrationProgressProps> = ({
  progress,
  title = 'Database Migration',
  showDetails = true,
  theme = 'light',
  className = '',
  style
}) => {
  const percentage = progress.total > 0
    ? Math.round((progress.current / progress.total) * 100)
    : 0;

  let statusText = '';
  
  switch (progress.status) {
    case 'pending':
      statusText = 'Pending...';
      break;
    case 'running':
      statusText = `Migrating ${progress.current} of ${progress.total}...`;
      break;
    case 'completed':
      statusText = 'Migration completed!';
      break;
    case 'failed':
      statusText = `Migration failed: ${progress.error || 'Unknown error'}`;
      break;
  }

  const containerClass = [
    'dexie-migrate-progress',
    `dexie-migrate-progress--${theme}`,
    progress.status === 'failed' && 'dexie-migrate-progress--failed',
    progress.status === 'completed' && 'dexie-migrate-progress--completed',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClass} style={style}>
      <div className="dexie-migrate-progress__wrapper">
        <h3 className="dexie-migrate-progress__title">{title}</h3>
        
        <div className="dexie-migrate-progress__progress-bar-container">
          <div 
            className="dexie-migrate-progress__progress-bar"
            style={{ width: `${percentage}%` }}
          />
        </div>
        
        <div className="dexie-migrate-progress__status">
          {statusText}
        </div>
        
        {showDetails && progress.currentMigration && (
          <div className="dexie-migrate-progress__details">
            Current: {progress.currentMigration}
          </div>
        )}
      </div>

      <style>{`
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
      `}</style>
    </div>
  );
};

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

export interface UseMigrationProgressReturn {
  /** Current progress state */
  progress: MigrationProgressData;

  /** Database instance (available after completion) */
  db: any | null;

  /** Start migrations */
  start: () => Promise<void>;

  /** Reset state */
  reset: () => void;
}

/**
 * React hook for managing migration progress
 * 
 * @example
 * ```tsx
 * function App() {
 *   const { progress, db, start } = useMigrationProgress({
 *     dbName: 'my-db',
 *     migrations: [m0001, m0002],
 *     autoStart: true
 *   });
 * 
 *   if (!db) {
 *     return <MigrationProgress progress={progress} />;
 *   }
 * 
 *   return <div>App ready!</div>;
 * }
 * ```
 */
export function useMigrationProgress({
  dbName,
  migrations,
  options = {},
  autoStart = false
}: UseMigrationProgressOptions): UseMigrationProgressReturn {
  const [progress, setProgress] = React.useState<MigrationProgressData>({
    current: 0,
    total: 0,
    status: 'pending'
  });

  const [db, setDb] = React.useState<any | null>(null);
  const hasStarted = useRef(false);

  const start = React.useCallback(async () => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    try {
      setProgress({ current: 0, total: 0, status: 'running' });

      // Dynamic import to avoid bundling issues
      const { runMigrations } = await import('./runtime');

      const result = await runMigrations(dbName, migrations, {
        ...options,
        onProgress: (current: number, total: number) => {
          setProgress({
            current,
            total,
            status: 'running'
          });
        }
      });

      setDb(result.db);
      setProgress({
        current: result.appliedMigrations.length,
        total: result.appliedMigrations.length,
        status: 'completed'
      });
    } catch (error) {
      setProgress({
        current: 0,
        total: 0,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }, [dbName, migrations, options]);

  const reset = React.useCallback(() => {
    setProgress({ current: 0, total: 0, status: 'pending' });
    setDb(null);
    hasStarted.current = false;
  }, []);

  useEffect(() => {
    if (autoStart && !hasStarted.current) {
      start();
    }
  }, [autoStart, start]);

  return {
    progress,
    db,
    start,
    reset
  };
}
