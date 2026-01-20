import type { DownloadTask } from '@talex-touch/utils'
import path from 'node:path'
import { DownloadModule } from '@talex-touch/utils'
import { app, Notification, shell } from 'electron'
import { formatDuration, formatFileSize, t } from '../../utils/i18n-helper'

/**
 * Notification configuration interface
 */
export interface NotificationConfig {
  downloadComplete: boolean
  updateAvailable: boolean
  updateDownloadComplete: boolean
}

/**
 * Default notification configuration
 */
export const defaultNotificationConfig: NotificationConfig = {
  downloadComplete: true,
  updateAvailable: true,
  updateDownloadComplete: true
}

/**
 * NotificationService - Manages system notifications for downloads and updates
 * Implements Requirements 11.1, 11.2, 11.3, 11.4, 11.5
 */
export class NotificationService {
  private config: NotificationConfig
  private onNotificationClickCallback?: (taskId: string, action: string) => void

  constructor(config?: Partial<NotificationConfig>) {
    this.config = { ...defaultNotificationConfig, ...config }
  }

  /**
   * Set notification click callback
   * Requirement 11.3: Implement notification click navigation
   */
  setNotificationClickCallback(callback: (taskId: string, action: string) => void): void {
    this.onNotificationClickCallback = callback
  }

  /**
   * Show download complete notification
   * Requirement 11.1: Send system notification when download completes
   * Requirement 11.2: Display filename and "Open File" button in notification
   */
  showDownloadCompleteNotification(task: DownloadTask): void {
    if (this.shouldSuppressNotifications(task)) {
      return
    }

    // Check if notifications are enabled
    if (!this.config.downloadComplete) {
      return
    }

    // Calculate download duration
    const duration = this.calculateDuration(task.createdAt, new Date())
    const durationText = formatDuration(duration)

    // Format file size
    const sizeText = formatFileSize(task.progress.totalSize || 0)

    const notification = new Notification({
      title: `📥 ${t('notifications.downloadComplete')}`,
      body: t('notifications.downloadCompleteBody', {
        filename: task.filename,
        size: sizeText,
        duration: durationText
      }),
      icon: this.getIconForModule(task.module),
      silent: false,
      urgency: 'normal',
      timeoutType: 'default'
    })

    // Handle notification click
    // Requirement 11.3: Open download center and highlight task when notification is clicked
    notification.on('click', () => {
      console.log(`[NotificationService] Download complete notification clicked: ${task.id}`)
      this.onNotificationClickCallback?.(task.id, 'show-task')
    })

    // Handle action buttons (if supported by platform)
    notification.on('action', (_event, index) => {
      if (index === 0) {
        // Open file
        this.openFile(task)
      } else if (index === 1) {
        // Show in folder
        this.showInFolder(task)
      }
    })

    notification.show()
  }

  /**
   * Show update available notification
   * Requirement 11.5: Send special notification for update availability
   */
  showUpdateAvailableNotification(version: string, _releaseNotes?: string): void {
    // Check if notifications are enabled
    if (!this.config.updateAvailable) {
      return
    }

    const notification = new Notification({
      title: `🎉 ${t('notifications.updateAvailable')}`,
      body: t('notifications.updateAvailableBody', { version }),
      icon: this.getIconForModule(DownloadModule.APP_UPDATE),
      silent: false,
      urgency: 'normal',
      timeoutType: 'default'
    })

    // Handle notification click
    // Requirement 11.3: Navigate to update dialog when clicked
    notification.on('click', () => {
      console.log(`[NotificationService] Update available notification clicked: ${version}`)
      this.onNotificationClickCallback?.('update-available', 'show-update-dialog')
    })

    notification.show()
  }

  /**
   * Show update download complete notification
   * Requirement 11.5: Send special notification when update download completes
   */
  showUpdateDownloadCompleteNotification(version: string, taskId: string): void {
    // Check if notifications are enabled
    if (!this.config.updateDownloadComplete) {
      return
    }

    const notification = new Notification({
      title: `🎉 ${t('notifications.updateReady')}`,
      body: t('notifications.updateReadyBody', { version }),
      icon: this.getIconForModule(DownloadModule.APP_UPDATE),
      silent: false,
      urgency: 'critical',
      timeoutType: 'never'
    })

    // Handle notification click
    // Requirement 11.3: Navigate to install update when clicked
    notification.on('click', () => {
      console.log(`[NotificationService] Update download complete notification clicked: ${taskId}`)
      this.onNotificationClickCallback?.(taskId, 'install-update')
    })

    notification.show()
  }

  /**
   * Show download failed notification
   */
  showDownloadFailedNotification(task: DownloadTask): void {
    if (this.shouldSuppressNotifications(task)) {
      return
    }

    const notification = new Notification({
      title: `❌ ${t('notifications.downloadFailed')}`,
      body: t('notifications.downloadFailedBody', {
        filename: task.filename,
        error: task.error || t('downloadErrors.unknown_error')
      }),
      icon: this.getIconForModule(task.module),
      silent: false,
      urgency: 'normal',
      timeoutType: 'default'
    })

    // Handle notification click
    notification.on('click', () => {
      console.log(`[NotificationService] Download failed notification clicked: ${task.id}`)
      this.onNotificationClickCallback?.(task.id, 'show-task')
    })

    notification.show()
  }

  /**
   * Update notification configuration
   * Requirement 11.4: Support enabling/disabling notifications in settings
   */
  updateConfig(config: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get notification configuration
   */
  getConfig(): NotificationConfig {
    return { ...this.config }
  }

  /**
   * Check if notifications are supported
   */
  isSupported(): boolean {
    return Notification.isSupported()
  }

  // Private helper methods

  /**
   * Get icon path for module
   */
  private getIconForModule(_module: DownloadModule): string | undefined {
    // Return undefined to use default app icon
    // Can be customized to return specific icons for different modules
    return undefined
  }

  private shouldSuppressNotifications(task: DownloadTask): boolean {
    return app.isPackaged && Boolean(task.metadata?.hidden)
  }

  /**
   * Open file with default application
   */
  private async openFile(task: DownloadTask): Promise<void> {
    try {
      const filePath = path.join(task.destination, task.filename)
      await shell.openPath(filePath)
    } catch (error) {
      console.error('[NotificationService] Failed to open file:', error)
    }
  }

  /**
   * Show file in folder
   */
  private showInFolder(task: DownloadTask): void {
    try {
      const filePath = path.join(task.destination, task.filename)
      shell.showItemInFolder(filePath)
    } catch (error) {
      console.error('[NotificationService] Failed to show in folder:', error)
    }
  }

  /**
   * Calculate duration between two dates
   */
  private calculateDuration(start: Date, end: Date): number {
    return Math.floor((end.getTime() - start.getTime()) / 1000)
  }
}
