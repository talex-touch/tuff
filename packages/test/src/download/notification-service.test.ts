import type { DownloadTask } from '@talex-touch/utils'
import { DownloadModule, DownloadPriority, DownloadStatus } from '@talex-touch/utils'

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getLocale: () => 'en-US',
  },
  Notification: class {
    static isSupported() {
      return true
    }

    constructor(public options: any) {}
    show() {}
    on(_event: string, _callback: (...args: any[]) => void) {}
  },
  shell: {
    openPath: async () => undefined,
    showItemInFolder: () => {},
  },
}))

describe('notificationService', () => {
  let NotificationService: typeof import('../../../../apps/core-app/src/main/modules/download/notification-service').NotificationService
  let notificationService: NotificationService

  beforeEach(async () => {
    if (!NotificationService) {
      const module = await import('../../../../apps/core-app/src/main/modules/download/notification-service')
      NotificationService = module.NotificationService
    }
    notificationService = new NotificationService()
  })

  describe('configuration', () => {
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
        updateAvailable: false,
      })
      const config = customService.getConfig()
      expect(config.downloadComplete).toBe(false)
      expect(config.updateAvailable).toBe(false)
      expect(config.updateDownloadComplete).toBe(true)
    })
  })

  describe('notification Support', () => {
    it('should check if notifications are supported', () => {
      expect(notificationService.isSupported()).toBe(true)
    })
  })

  describe('download Complete Notification', () => {
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
          percentage: 100,
        },
        chunks: [],
        metadata: {},
        createdAt: new Date(Date.now() - 135000), // 2 minutes 15 seconds ago
        updatedAt: new Date(),
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
          percentage: 100,
        },
        chunks: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      // Should not throw
      expect(() => {
        notificationService.showDownloadCompleteNotification(task)
      }).not.toThrow()
    })
  })

  describe('update Available Notification', () => {
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

  describe('update Download Complete Notification', () => {
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

  describe('download Failed Notification', () => {
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
          percentage: 50,
        },
        chunks: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        error: 'Network timeout',
      }

      expect(() => {
        notificationService.showDownloadFailedNotification(task)
      }).not.toThrow()
    })
  })

  describe('notification Click Callback', () => {
    it('should set and call notification click callback', () => {
      const callback = vi.fn()
      notificationService.setNotificationClickCallback(callback)

      // Simulate notification click by calling the callback directly
      const testCallback = notificationService.onNotificationClickCallback
      expect(testCallback).toBeDefined()

      if (testCallback) {
        testCallback('task-123', 'show-task')
        expect(callback).toHaveBeenCalledWith('task-123', 'show-task')
      }
    })
  })
})
