/**
 * Share Notification Service
 *
 * Provides system notifications for share operations.
 * Displays feedback when content is shared via system or copied to clipboard.
 */

import type { FlowPayloadType, NativeShareResult } from '@talex-touch/utils'
import { Notification } from 'electron'
import { t } from '../../utils/i18n-helper'

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
 * Share notification messages, worded when shown.
 *
 * They were `$i18n:` markers, which only the renderer resolves: handed to the OS as they were,
 * a title read `✓ $i18n:flowTransfer.shareComplete`. The language can change at runtime, so
 * nothing is translated ahead of the notification.
 */
const MESSAGES = {
  shareComplete: {
    title: () => t('notifications.share.completeTitle'),
    body: (target: string) => t('notifications.share.completeBody', { target })
  },
  clipboardCopy: {
    title: () => t('notifications.share.copiedTitle'),
    body: () => t('notifications.share.copiedBody')
  },
  fileRevealed: {
    title: () => t('notifications.share.fileRevealedTitle'),
    body: (count: number) =>
      count > 1
        ? t('notifications.share.filesRevealedBody', { count })
        : t('notifications.share.fileRevealedBody')
  },
  shareError: {
    title: () => t('notifications.share.failedTitle'),
    body: (error: string) => t('notifications.share.failedBody', { error })
  },
  airdropReady: {
    title: () => t('notifications.share.airdropReadyTitle'),
    body: () => t('notifications.share.airdropReadyBody')
  },
  mailReady: {
    title: () => t('notifications.share.mailReadyTitle'),
    body: () => t('notifications.share.mailReadyBody')
  },
  messagesReady: {
    title: () => t('notifications.share.messagesReadyTitle'),
    body: () => t('notifications.share.messagesReadyBody')
  }
}

/** The name a share target goes by in a notification; an unknown target is shown as given. */
const TARGET_NAME_KEYS: Record<string, string> = {
  system: 'nativeShare.targets.systemShare',
  'system-share': 'nativeShare.targets.systemShare',
  airdrop: 'nativeShare.targets.airdrop',
  mail: 'nativeShare.targets.mail',
  messages: 'nativeShare.targets.messages',
  clipboard: 'nativeShare.targets.clipboard',
  finder: 'nativeShare.targets.finder',
  explorer: 'nativeShare.targets.explorer',
  browser: 'nativeShare.targets.browser'
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
      this.showError(result.error ?? t('common.unknownError'))
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
      title: `✓ ${MESSAGES.shareComplete.title()}`,
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
      title: `📋 ${MESSAGES.clipboardCopy.title()}`,
      body: MESSAGES.clipboardCopy.body(),
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
      title: `📂 ${MESSAGES.fileRevealed.title()}`,
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
      title: `📡 ${MESSAGES.airdropReady.title()}`,
      body: MESSAGES.airdropReady.body(),
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
      title: `✉️ ${MESSAGES.mailReady.title()}`,
      body: MESSAGES.mailReady.body(),
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
      title: `💬 ${MESSAGES.messagesReady.title()}`,
      body: MESSAGES.messagesReady.body(),
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
      title: `❌ ${MESSAGES.shareError.title()}`,
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
    const key = TARGET_NAME_KEYS[target]
    return key ? t(key) : target
  }
}

export const shareNotificationService = ShareNotificationService.getInstance()
