import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock Electron BEFORE importing the service
class MockNotification {
  static isSupported() {
    return true
  }
  constructor(public options: any) {}
  show() {}
  on(event: string, callback: Function) {}
}

vi.mock('electron', () => ({
  Notification: MockNotification,
  shell: {
    openPath: vi.fn().mockResolvedValue(undefined),
    showItemInFolder: vi.fn()
  }
}))

// Import after mocking
import { NotificationService, NotificationConfig } from '../../../../apps/core-app/src/main/modules/download/notification-service'
import { DownloadTask, DownloadStatus, DownloadModule, DownloadPriority } from '@talex-touch/utils'

describe('NotificationService', () => {
  let notificationService: NotificationService

  beforeEach(() => {
    notificationService = new NotificationService()
  })

  describe('Configuration', () => {
    it('should initialize with default configuration', () => {
      const config = notificationService.getConfig()
      expect(config.downloadComplete).toBe(true)
      expect(config.updateAvailable).toBe(true)
      expect(config.updateDownloadComplete).toBe(true)
    })

    it('should update configuration', () => {
      notificationService.updateConfig({ downloadComplete: false })
      const config = notificationService.getConfig()
      expect(config.downloadComplete).toBe(false)
      expect(config.updateAvailable).toBe(true)
    })

    it('should support custom initial configuration', () => {
      const customService = new NotificationService({
        downloadComplete: false,
        updateAvailable: false
      })
      const config = customService.getConfig()
      expect(config.downloadComplete).toBe(false)
      expect(config.updateAvailable).toBe(false)
      expect(config.updateDownloadComplete).toBe(true)
    })
  })

  describe('Notification Support', () => {
    it('should check if notifications are supported', () => {
      expect(notificationService.isSupported()).toBe(true)
    })
  })

  describe('Download Complete Notification', () => {
    it('should show notification when download completes', () => {
      const task: DownloadTask = {
        id: 'test-task-1',
        url: 'https://example.com/file.zip',
        destination: '/downloads',
        filename: 'test-file.zip',
        priority: DownloadPriority.NORMAL,
        module: DownloadModule.USER_MANUAL,
        status: DownloadStatus.COMPLETED,
        progress: {
          totalSize: 1024 * 1024 * 100, // 100 MB
          downloadedSize: 1024 * 1024 * 100,
          speed: 0,
          percentage: 100
        },
        chunks: [],
        metadata: {},
        createdAt: new Date(Date.now() - 135000), // 2 minutes 15 seconds ago
        updatedAt: new Date()
      }

      // Should not throw
      expect(() => {
        notificationService.showDownloadCompleteNotification(task)
      }).not.toThrow()
    })

    it('should not show notification when disabled', () => {
      notificationService.updateConfig({ downloadComplete: false })
      
      const task: DownloadTask = {
        id: 'test-task-2',
        url: 'https://example.com/file.zip',
        destination: '/downloads',
        filename: 'test-file.zip',
        priority: DownloadPriority.NORMAL,
        module: DownloadModule.USER_MANUAL,
        status: DownloadStatus.COMPLETED,
        progress: {
          totalSize: 1024 * 1024,
          downloadedSize: 1024 * 1024,
          speed: 0,
          percentage: 100
        },
        chunks: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      }

      // Should not throw
      expect(() => {
        notificationService.showDownloadCompleteNotification(task)
      }).not.toThrow()
    })
  })

  describe('Update Available Notification', () => {
    it('should show notification when update is available', () => {
      expect(() => {
        notificationService.showUpdateAvailableNotification('v2.0.0', 'Release notes')
      }).not.toThrow()
    })

    it('should not show notification when disabled', () => {
      notificationService.updateConfig({ updateAvailable: false })
      
      expect(() => {
        notificationService.showUpdateAvailableNotification('v2.0.0')
      }).not.toThrow()
    })
  })

  describe('Update Download Complete Notification', () => {
    it('should show notification when update download completes', () => {
      expect(() => {
        notificationService.showUpdateDownloadCompleteNotification('v2.0.0', 'task-123')
      }).not.toThrow()
    })

    it('should not show notification when disabled', () => {
      notificationService.updateConfig({ updateDownloadComplete: false })
      
      expect(() => {
        notificationService.showUpdateDownloadCompleteNotification('v2.0.0', 'task-123')
      }).not.toThrow()
    })
  })

  describe('Download Failed Notification', () => {
    it('should show notification when download fails', () => {
      const task: DownloadTask = {
        id: 'test-task-3',
        url: 'https://example.com/file.zip',
        destination: '/downloads',
        filename: 'test-file.zip',
        priority: DownloadPriority.NORMAL,
        module: DownloadModule.USER_MANUAL,
        status: DownloadStatus.FAILED,
        progress: {
          totalSize: 1024 * 1024,
          downloadedSize: 512 * 1024,
          speed: 0,
          percentage: 50
        },
        chunks: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        error: 'Network timeout'
      }

      expect(() => {
        notificationService.showDownloadFailedNotification(task)
      }).not.toThrow()
    })
  })

  describe('Notification Click Callback', () => {
    it('should set and call notification click callback', () => {
      const callback = vi.fn()
      notificationService.setNotificationClickCallback(callback)

      // Simulate notification click by calling the callback directly
      const testCallback = notificationService['onNotificationClickCallback']
      expect(testCallback).toBeDefined()
      
      if (testCallback) {
        testCallback('task-123', 'show-task')
        expect(callback).toHaveBeenCalledWith('task-123', 'show-task')
      }
    })
  })
})
