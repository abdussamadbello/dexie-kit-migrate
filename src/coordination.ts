/**
 * Multi-tab coordination for safe migrations
 * 
 * Uses BroadcastChannel API to coordinate migrations across browser tabs.
 * Ensures only one tab runs migrations at a time and others wait.
 */

/**
 * Lock state for migration coordination
 */
interface MigrationLock {
  tabId: string;
  acquiredAt: number;
  dbName: string;
}

/**
 * Message types for tab coordination
 */
type CoordinationMessage =
  | { type: 'lock_acquired'; tabId: string; dbName: string }
  | { type: 'lock_released'; tabId: string; dbName: string }
  | { type: 'migration_started'; tabId: string; dbName: string }
  | { type: 'migration_completed'; tabId: string; dbName: string }
  | { type: 'migration_failed'; tabId: string; dbName: string; error: string }
  | { type: 'ping'; tabId: string }
  | { type: 'pong'; tabId: string };

/**
 * Options for multi-tab coordinator
 */
export interface CoordinatorOptions {
  /** Timeout for acquiring lock in milliseconds */
  lockTimeout?: number;
  /** Whether to enable verbose logging */
  verbose?: boolean;
  /** Channel name (defaults to dexie-migrate-{dbName}) */
  channelName?: string;
}

/**
 * Multi-tab migration coordinator
 */
export class MigrationCoordinator {
  private channel: BroadcastChannel | null = null;
  private tabId: string;
  private dbName: string;
  private lock: MigrationLock | null = null;
  private options: Required<CoordinatorOptions>;
  private listeners: Map<string, Set<(msg: CoordinationMessage) => void>> = new Map();

  constructor(dbName: string, options: CoordinatorOptions = {}) {
    this.dbName = dbName;
    this.tabId = this.generateTabId();
    this.options = {
      lockTimeout: options.lockTimeout ?? 30000,
      verbose: options.verbose ?? false,
      channelName: options.channelName ?? `dexie-migrate-${dbName}`
    };

    if (typeof BroadcastChannel !== 'undefined') {
      this.initChannel();
    } else if (this.options.verbose) {
      console.warn('[dexie-migrate] BroadcastChannel not available, multi-tab coordination disabled');
    }
  }

  /**
   * Initialize BroadcastChannel for communication
   */
  private initChannel(): void {
    this.channel = new BroadcastChannel(this.options.channelName);
    
    this.channel.onmessage = (event) => {
      const msg = event.data as CoordinationMessage;
      
      if (this.options.verbose) {
        console.log(`[dexie-migrate:${this.tabId}] Received:`, msg);
      }

      // Notify listeners
      const listeners = this.listeners.get(msg.type);
      if (listeners) {
        listeners.forEach(listener => listener(msg));
      }
    };
  }

  /**
   * Generate unique tab ID
   */
  private generateTabId(): string {
    return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Broadcast message to all tabs
   */
  private broadcast(message: CoordinationMessage): void {
    if (this.channel) {
      this.channel.postMessage(message);
      
      if (this.options.verbose) {
        console.log(`[dexie-migrate:${this.tabId}] Broadcast:`, message);
      }
    }
  }

  /**
   * Add event listener for coordination messages
   */
  on(type: CoordinationMessage['type'], listener: (msg: CoordinationMessage) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  /**
   * Remove event listener
   */
  off(type: CoordinationMessage['type'], listener: (msg: CoordinationMessage) => void): void {
    const listeners = this.listeners.get(type);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * Try to acquire migration lock
   */
  async acquireLock(): Promise<boolean> {
    if (!this.channel) {
      // No coordination available, assume we have the lock
      return true;
    }

    // Check if another tab already has the lock
    const hasActiveLock = await this.checkForActiveLock();
    
    if (hasActiveLock) {
      if (this.options.verbose) {
        console.log(`[dexie-migrate:${this.tabId}] Another tab has the lock, waiting...`);
      }
      return false;
    }

    // Acquire the lock
    this.lock = {
      tabId: this.tabId,
      acquiredAt: Date.now(),
      dbName: this.dbName
    };

    this.broadcast({
      type: 'lock_acquired',
      tabId: this.tabId,
      dbName: this.dbName
    });

    return true;
  }

  /**
   * Release migration lock
   */
  releaseLock(): void {
    if (this.lock) {
      this.broadcast({
        type: 'lock_released',
        tabId: this.tabId,
        dbName: this.dbName
      });
      
      this.lock = null;
    }
  }

  /**
   * Check if another tab has an active lock
   */
  private async checkForActiveLock(): Promise<boolean> {
    return new Promise((resolve) => {
      let responseReceived = false;

      const onLockAcquired = (msg: CoordinationMessage) => {
        if (msg.type === 'lock_acquired' && msg.tabId !== this.tabId) {
          responseReceived = true;
          this.off('lock_acquired', onLockAcquired);
          resolve(true);
        }
      };

      this.on('lock_acquired', onLockAcquired);

      // Send ping to discover other tabs
      this.broadcast({ type: 'ping', tabId: this.tabId });

      // Wait for responses
      setTimeout(() => {
        this.off('lock_acquired', onLockAcquired);
        if (!responseReceived) {
          resolve(false);
        }
      }, 100);
    });
  }

  /**
   * Wait for lock to become available
   */
  async waitForLock(timeout?: number): Promise<boolean> {
    const maxWait = timeout ?? this.options.lockTimeout;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const acquired = await this.acquireLock();
      
      if (acquired) {
        return true;
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return false;
  }

  /**
   * Notify other tabs that migration has started
   */
  notifyMigrationStarted(): void {
    this.broadcast({
      type: 'migration_started',
      tabId: this.tabId,
      dbName: this.dbName
    });
  }

  /**
   * Notify other tabs that migration has completed
   */
  notifyMigrationCompleted(): void {
    this.broadcast({
      type: 'migration_completed',
      tabId: this.tabId,
      dbName: this.dbName
    });
  }

  /**
   * Notify other tabs that migration has failed
   */
  notifyMigrationFailed(error: Error): void {
    this.broadcast({
      type: 'migration_failed',
      tabId: this.tabId,
      dbName: this.dbName,
      error: error.message
    });
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.releaseLock();
    
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    
    this.listeners.clear();
  }

  /**
   * Get current tab ID
   */
  getTabId(): string {
    return this.tabId;
  }

  /**
   * Check if this tab has the lock
   */
  hasLock(): boolean {
    return this.lock !== null && this.lock.tabId === this.tabId;
  }
}

/**
 * Helper function to run migrations with multi-tab coordination
 */
export async function runWithCoordination<T>(
  dbName: string,
  migrationFn: () => Promise<T>,
  options: CoordinatorOptions = {}
): Promise<T> {
  const coordinator = new MigrationCoordinator(dbName, options);

  try {
    // Try to acquire lock
    const lockAcquired = await coordinator.waitForLock();

    if (!lockAcquired) {
      throw new Error(
        `Failed to acquire migration lock within ${options.lockTimeout ?? 30000}ms. ` +
        'Another tab may be running migrations.'
      );
    }

    // Notify start
    coordinator.notifyMigrationStarted();

    // Run migrations
    const result = await migrationFn();

    // Notify completion
    coordinator.notifyMigrationCompleted();

    return result;
  } catch (error) {
    coordinator.notifyMigrationFailed(error as Error);
    throw error;
  } finally {
    coordinator.destroy();
  }
}
