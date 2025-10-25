/**
 * Progress UI components for dexie-migrate
 * 
 * Displays migration progress to users during database upgrades
 */

export interface MigrationProgress {
  current: number;
  total: number;
  currentMigration?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

export interface ProgressUIOptions {
  /**
   * Container element to render into
   */
  container: HTMLElement;

  /**
   * Custom title
   * @default 'Database Migration'
   */
  title?: string;

  /**
   * Custom CSS class for styling
   */
  className?: string;

  /**
   * Show detailed progress
   * @default true
   */
  showDetails?: boolean;

  /**
   * Theme
   * @default 'light'
   */
  theme?: 'light' | 'dark';
}

/**
 * Vanilla JavaScript progress UI component
 * 
 * @example
 * ```ts
 * import { MigrationProgressUI } from 'dexie-migrate/progress-ui';
 * 
 * const ui = new MigrationProgressUI({
 *   container: document.getElementById('migration-progress')!
 * });
 * 
 * const result = await runMigrations('my-db', migrations, {
 *   onProgress: (current, total) => {
 *     ui.update({ current, total, status: 'running' });
 *   }
 * });
 * 
 * ui.complete();
 * ```
 */
export class MigrationProgressUI {
  private container: HTMLElement;
  private options: Required<ProgressUIOptions>;
  private progressBar: HTMLElement | null = null;
  private statusText: HTMLElement | null = null;
  private detailsText: HTMLElement | null = null;

  constructor(options: ProgressUIOptions) {
    this.container = options.container;
    this.options = {
      container: options.container,
      title: options.title ?? 'Database Migration',
      className: options.className ?? 'dexie-migrate-progress',
      showDetails: options.showDetails ?? true,
      theme: options.theme ?? 'light'
    };

    this.render();
  }

  /**
   * Render the initial UI
   */
  private render(): void {
    const { title, className, theme, showDetails } = this.options;

    this.container.className = `${className} ${className}--${theme}`;
    this.container.innerHTML = `
      <div class="${className}__wrapper">
        <h3 class="${className}__title">${title}</h3>
        <div class="${className}__progress-bar-container">
          <div class="${className}__progress-bar" style="width: 0%"></div>
        </div>
        <div class="${className}__status">Initializing...</div>
        ${showDetails ? `<div class="${className}__details"></div>` : ''}
      </div>
    `;

    this.progressBar = this.container.querySelector(`.${className}__progress-bar`);
    this.statusText = this.container.querySelector(`.${className}__status`);
    this.detailsText = this.container.querySelector(`.${className}__details`);

    this.injectStyles();
  }

  /**
   * Inject default styles
   */
  private injectStyles(): void {
    const styleId = 'dexie-migrate-progress-styles';
    
    if (document.getElementById(styleId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
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
    `;
    document.head.appendChild(style);
  }

  /**
   * Update progress
   */
  update(progress: MigrationProgress): void {
    const percentage = progress.total > 0 
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

    if (this.progressBar) {
      this.progressBar.style.width = `${percentage}%`;
    }

    if (this.statusText) {
      let status = '';
      
      switch (progress.status) {
        case 'pending':
          status = 'Pending...';
          break;
        case 'running':
          status = `Migrating ${progress.current} of ${progress.total}...`;
          break;
        case 'completed':
          status = 'Migration completed!';
          break;
        case 'failed':
          status = `Migration failed: ${progress.error || 'Unknown error'}`;
          break;
      }

      this.statusText.textContent = status;
    }

    if (this.detailsText && progress.currentMigration) {
      this.detailsText.textContent = `Current: ${progress.currentMigration}`;
    }

    // Update container class based on status
    const className = this.options.className;
    this.container.classList.remove(`${className}--failed`, `${className}--completed`);
    
    if (progress.status === 'failed') {
      this.container.classList.add(`${className}--failed`);
    } else if (progress.status === 'completed') {
      this.container.classList.add(`${className}--completed`);
    }
  }

  /**
   * Mark as complete
   */
  complete(): void {
    this.update({
      current: 1,
      total: 1,
      status: 'completed'
    });
  }

  /**
   * Mark as failed
   */
  fail(error: string): void {
    this.update({
      current: 0,
      total: 1,
      status: 'failed',
      error
    });
  }

  /**
   * Destroy the UI
   */
  destroy(): void {
    this.container.innerHTML = '';
  }
}

/**
 * Simple function-based API for showing progress
 */
export function showMigrationProgress(
  container: HTMLElement | string,
  options?: Omit<ProgressUIOptions, 'container'>
): MigrationProgressUI {
  const element = typeof container === 'string'
    ? document.getElementById(container)
    : container;

  if (!element) {
    throw new Error('Container element not found');
  }

  return new MigrationProgressUI({
    ...options,
    container: element
  });
}
