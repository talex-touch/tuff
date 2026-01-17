/**
 * Share Notification Service
 *
 * Provides system notifications for share operations.
 * Displays feedback when content is shared via system or copied to clipboard.
 */

import type { FlowPayloadType, NativeShareResult } from '@talex-touch/utils'
import { FlowTransferKeys, i18nMsg } from '@talex-touch/utils/i18n'
import { Notification } from 'electron'

/**
 * Share notification configuration
 */
export interface ShareNotificationConfig {
  /** Enable share completion notifications */
  shareComplete: boolean
  /** Enable clipboard copy notifications */
  clipboardCopy: boolean
  /** Enable share error notifications */
  shareError: boolean
}

/**
 * Default share notification config
 */
export const defaultShareNotificationConfig: ShareNotificationConfig = {
  shareComplete: true,
  clipboardCopy: true,
  shareError: true
}

/**
 * Share notification messages with i18n support
 * Uses $i18n:key format for frontend resolution
 */
const MESSAGES = {
  shareComplete: {
    title: i18nMsg(FlowTransferKeys.SHARE_COMPLETE),
    body: (target: string) => `Content shared via ${target}` // Dynamic, keep as-is
  },
  clipboardCopy: {
    title: i18nMsg(FlowTransferKeys.COPIED_TO_CLIPBOARD),
    body: 'Content has been copied to your clipboard'
  },
  fileRevealed: {
    title: i18nMsg(FlowTransferKeys.FILE_REVEALED),
    body: (count: number) =>
      count > 1 ? `${count} files revealed in file manager` : 'File revealed in file manager'
  },
  shareError: {
    title: i18nMsg(FlowTransferKeys.SHARE_FAILED),
    body: (error: string) => `Unable to share: ${error}`
  },
  airdropReady: {
    title: i18nMsg(FlowTransferKeys.AIRDROP_READY),
    body: 'Select a device to send your files'
  },
  mailReady: {
    title: i18nMsg(FlowTransferKeys.MAIL_READY),
    body: 'Complete your email in the Mail app'
  },
  messagesReady: {
    title: i18nMsg(FlowTransferKeys.MESSAGES_READY),
    body: 'Content copied - paste in Messages to send'
  }
}

/**
 * ShareNotificationService
 *
 * Manages system notifications for share operations
 */
export class ShareNotificationService {
  private static instance: ShareNotificationService | null = null
  private config: ShareNotificationConfig

  private constructor(config?: Partial<ShareNotificationConfig>) {
    this.config = { ...defaultShareNotificationConfig, ...config }
  }

  static getInstance(): ShareNotificationService {
    if (!ShareNotificationService.instance) {
      ShareNotificationService.instance = new ShareNotificationService()
    }
    return ShareNotificationService.instance
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<ShareNotificationConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /**
   * Show share result notification
   */
  showShareResult(result: NativeShareResult, _payloadType?: FlowPayloadType): void {
    if (!result.success) {
      this.showError(result.error ?? 'Unknown error')
      return
    }

    const target = result.target ?? 'system'

    switch (target) {
      case 'clipboard':
        this.showClipboardCopy()
        break
      case 'finder':
      case 'explorer':
        this.showFileRevealed(1)
        break
      case 'airdrop':
      case 'airdrop-window':
        this.showAirDropReady()
        break
      case 'mail':
        this.showMailReady()
        break
      case 'messages':
        this.showMessagesReady()
        break
      default:
        this.showShareComplete(target)
    }
  }

  /**
   * Show share complete notification
   */
  showShareComplete(target: string): void {
    if (!this.config.shareComplete) return

    const notification = new Notification({
      title: `✓ ${MESSAGES.shareComplete.title}`,
      body: MESSAGES.shareComplete.body(this.formatTargetName(target)),
      silent: true,
      urgency: 'low',
      timeoutType: 'default'
    })

    notification.show()
  }

  /**
   * Show clipboard copy notification
   */
  showClipboardCopy(): void {
    if (!this.config.clipboardCopy) return

    const notification = new Notification({
      title: `📋 ${MESSAGES.clipboardCopy.title}`,
      body: MESSAGES.clipboardCopy.body,
      silent: true,
      urgency: 'low',
      timeoutType: 'default'
    })

    notification.show()
  }

  /**
   * Show file revealed notification
   */
  showFileRevealed(count: number): void {
    if (!this.config.shareComplete) return

    const notification = new Notification({
      title: `📂 ${MESSAGES.fileRevealed.title}`,
      body: MESSAGES.fileRevealed.body(count),
      silent: true,
      urgency: 'low',
      timeoutType: 'default'
    })

    notification.show()
  }

  /**
   * Show AirDrop ready notification
   */
  showAirDropReady(): void {
    if (!this.config.shareComplete) return

    const notification = new Notification({
      title: `📡 ${MESSAGES.airdropReady.title}`,
      body: MESSAGES.airdropReady.body,
      silent: true,
      urgency: 'low',
      timeoutType: 'default'
    })

    notification.show()
  }

  /**
   * Show mail ready notification
   */
  showMailReady(): void {
    if (!this.config.shareComplete) return

    const notification = new Notification({
      title: `✉️ ${MESSAGES.mailReady.title}`,
      body: MESSAGES.mailReady.body,
      silent: true,
      urgency: 'low',
      timeoutType: 'default'
    })

    notification.show()
  }

  /**
   * Show messages ready notification
   */
  showMessagesReady(): void {
    if (!this.config.shareComplete) return

    const notification = new Notification({
      title: `💬 ${MESSAGES.messagesReady.title}`,
      body: MESSAGES.messagesReady.body,
      silent: true,
      urgency: 'low',
      timeoutType: 'default'
    })

    notification.show()
  }

  /**
   * Show share error notification
   */
  showError(error: string): void {
    if (!this.config.shareError) return

    const notification = new Notification({
      title: `❌ ${MESSAGES.shareError.title}`,
      body: MESSAGES.shareError.body(error),
      silent: false,
      urgency: 'normal',
      timeoutType: 'default'
    })

    notification.show()
  }

  /**
   * Format target name for display
   */
  private formatTargetName(target: string): string {
    const names: Record<string, string> = {
      'system-share': 'System Share',
      airdrop: 'AirDrop',
      mail: 'Mail',
      messages: 'Messages',
      clipboard: 'Clipboard',
      finder: 'Finder',
      explorer: 'Explorer',
      browser: 'Browser'
    }
    return names[target] ?? target
  }
}

export const shareNotificationService = ShareNotificationService.getInstance()
