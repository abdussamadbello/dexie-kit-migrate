import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MigrationCoordinator, runWithCoordination } from '../coordination';

// Mock BroadcastChannel
class MockBroadcastChannel {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  private static channels = new Map<string, MockBroadcastChannel[]>();

  constructor(name: string) {
    this.name = name;
    
    // Register this channel
    if (!MockBroadcastChannel.channels.has(name)) {
      MockBroadcastChannel.channels.set(name, []);
    }
    MockBroadcastChannel.channels.get(name)!.push(this);
  }

  postMessage(data: any): void {
    // Simulate broadcast to all channels with same name
    const channels = MockBroadcastChannel.channels.get(this.name) || [];
    
    // Use setTimeout to simulate async behavior
    setTimeout(() => {
      channels.forEach(channel => {
        if (channel !== this && channel.onmessage) {
          channel.onmessage(new MessageEvent('message', { data }));
        }
      });
    }, 0);
  }

  close(): void {
    const channels = MockBroadcastChannel.channels.get(this.name);
    if (channels) {
      const index = channels.indexOf(this);
      if (index > -1) {
        channels.splice(index, 1);
      }
    }
  }

  static reset(): void {
    MockBroadcastChannel.channels.clear();
  }
}

// Install mock globally
(global as any).BroadcastChannel = MockBroadcastChannel;

describe('Multi-tab Coordination', () => {
  beforeEach(() => {
    MockBroadcastChannel.reset();
  });

  describe('MigrationCoordinator', () => {
    it('should create coordinator with unique tab ID', () => {
      const coordinator1 = new MigrationCoordinator('test-db');
      const coordinator2 = new MigrationCoordinator('test-db');

      expect(coordinator1.getTabId()).not.toBe(coordinator2.getTabId());
      
      coordinator1.destroy();
      coordinator2.destroy();
    });

    it('should acquire lock when no other tabs have it', async () => {
      const coordinator = new MigrationCoordinator('test-db');
      
      const acquired = await coordinator.acquireLock();
      
      expect(acquired).toBe(true);
      expect(coordinator.hasLock()).toBe(true);
      
      coordinator.destroy();
    });

    it('should release lock', async () => {
      const coordinator = new MigrationCoordinator('test-db');
      
      await coordinator.acquireLock();
      expect(coordinator.hasLock()).toBe(true);
      
      coordinator.releaseLock();
      expect(coordinator.hasLock()).toBe(false);
      
      coordinator.destroy();
    });

    it('should notify other tabs when migration starts', async () => {
      const coordinator1 = new MigrationCoordinator('test-db');
      const coordinator2 = new MigrationCoordinator('test-db');

      let notified = false;
      coordinator2.on('migration_started', (msg) => {
        if (msg.type === 'migration_started') {
          notified = true;
        }
      });

      await coordinator1.acquireLock();
      coordinator1.notifyMigrationStarted();

      // Wait for async broadcast
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(notified).toBe(true);
      
      coordinator1.destroy();
      coordinator2.destroy();
    });

    it('should notify other tabs when migration completes', async () => {
      const coordinator1 = new MigrationCoordinator('test-db');
      const coordinator2 = new MigrationCoordinator('test-db');

      let completed = false;
      coordinator2.on('migration_completed', (msg) => {
        if (msg.type === 'migration_completed') {
          completed = true;
        }
      });

      await coordinator1.acquireLock();
      coordinator1.notifyMigrationCompleted();

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(completed).toBe(true);
      
      coordinator1.destroy();
      coordinator2.destroy();
    });

    it('should notify other tabs when migration fails', async () => {
      const coordinator1 = new MigrationCoordinator('test-db');
      const coordinator2 = new MigrationCoordinator('test-db');

      let failureMsg = '';
      coordinator2.on('migration_failed', (msg) => {
        if (msg.type === 'migration_failed') {
          failureMsg = msg.error;
        }
      });

      await coordinator1.acquireLock();
      coordinator1.notifyMigrationFailed(new Error('Test error'));

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(failureMsg).toBe('Test error');
      
      coordinator1.destroy();
      coordinator2.destroy();
    });

    it('should support adding and removing event listeners', () => {
      const coordinator = new MigrationCoordinator('test-db');
      
      const listener = vi.fn();
      
      coordinator.on('migration_started', listener);
      coordinator.off('migration_started', listener);
      
      coordinator.notifyMigrationStarted();
      
      expect(listener).not.toHaveBeenCalled();
      
      coordinator.destroy();
    });

    it('should clean up resources on destroy', async () => {
      const coordinator = new MigrationCoordinator('test-db');
      
      await coordinator.acquireLock();
      expect(coordinator.hasLock()).toBe(true);
      
      coordinator.destroy();
      expect(coordinator.hasLock()).toBe(false);
    });
  });

  describe('runWithCoordination', () => {
    it('should run migration function with coordination', async () => {
      const mockMigration = vi.fn().mockResolvedValue({ success: true });
      
      const result = await runWithCoordination('test-db', mockMigration);
      
      expect(mockMigration).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('should throw error if lock cannot be acquired', async () => {
      const coordinator1 = new MigrationCoordinator('test-db');
      await coordinator1.acquireLock();
      
      const mockMigration = vi.fn();
      
      await expect(
        runWithCoordination('test-db', mockMigration, { lockTimeout: 100 })
      ).rejects.toThrow('Failed to acquire migration lock');
      
      expect(mockMigration).not.toHaveBeenCalled();
      
      coordinator1.destroy();
    });

    it('should handle migration errors and notify', async () => {
      const error = new Error('Migration failed');
      const mockMigration = vi.fn().mockRejectedValue(error);
      
      await expect(
        runWithCoordination('test-db', mockMigration)
      ).rejects.toThrow('Migration failed');
    });

    it('should release lock even if migration fails', async () => {
      const mockMigration = vi.fn().mockRejectedValue(new Error('Test'));
      
      try {
        await runWithCoordination('test-db', mockMigration);
      } catch {
        // Expected
      }
      
      // Wait a bit for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Should be able to acquire lock again
      const coordinator = new MigrationCoordinator('test-db');
      const acquired = await coordinator.acquireLock();
      
      expect(acquired).toBe(true);
      
      coordinator.destroy();
    });
  });
});
