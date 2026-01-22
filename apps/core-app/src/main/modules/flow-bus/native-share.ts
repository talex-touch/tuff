/**
 * Native Share Service
 *
 * Provides integration with system native share functionality.
 * Supports macOS Share Sheet, Windows Share API, etc.
 */

import type {
  FlowPayload,
  FlowTarget,
  NativeShareOptions,
  NativeShareResult
} from '@talex-touch/utils'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { shell } from 'electron'
import { shareNotificationService } from './share-notification'

const execAsync = promisify(exec)

/**
 * Native share target IDs
 */
export const NATIVE_SHARE_TARGETS = {
  SYSTEM: 'native.system-share',
  AIRDROP: 'native.airdrop',
  MAIL: 'native.mail',
  MESSAGES: 'native.messages'
} as const

/**
 * NativeShareService
 *
 * Handles native system share operations
 */
export class NativeShareService {
  private static instance: NativeShareService | null = null

  private constructor() {}

  static getInstance(): NativeShareService {
    if (!NativeShareService.instance) {
      NativeShareService.instance = new NativeShareService()
    }
    return NativeShareService.instance
  }

  /**
   * Gets available native share targets for current platform
   */
  getAvailableTargets(): FlowTarget[] {
    const targets: FlowTarget[] = []

    if (process.platform === 'darwin') {
      // macOS supports Share Sheet
      targets.push({
        id: 'system-share',
        name: 'System Share',
        description: 'Share via macOS system share sheet',
        supportedTypes: ['text', 'files', 'image'],
        icon: 'ri:share-line'
      })

      targets.push({
        id: 'airdrop',
        name: 'AirDrop',
        description: 'Send to nearby devices via AirDrop',
        supportedTypes: ['files', 'image'],
        icon: 'ri:wireless-charging-line'
      })

      targets.push({
        id: 'mail',
        name: 'Mail',
        description: 'Send via email',
        supportedTypes: ['text', 'files', 'image'],
        icon: 'ri:mail-line'
      })

      targets.push({
        id: 'messages',
        name: 'Messages',
        description: 'Send via iMessage',
        supportedTypes: ['text', 'image'],
        icon: 'ri:message-3-line'
      })
    } else if (process.platform === 'win32') {
      // Windows Share API
      targets.push({
        id: 'system-share',
        name: 'System Share',
        description: 'Share via Windows share functionality',
        supportedTypes: ['text', 'files', 'image'],
        icon: 'ri:share-line'
      })

      targets.push({
        id: 'mail',
        name: 'Mail',
        description: 'Send via email',
        supportedTypes: ['text', 'files'],
        icon: 'ri:mail-line'
      })
    } else {
      // Linux - basic share via xdg-open
      targets.push({
        id: 'mail',
        name: 'Mail',
        description: 'Send via email',
        supportedTypes: ['text'],
        icon: 'ri:mail-line'
      })
    }

    return targets
  }

  /**
   * Shares content using native system share
   */
  async share(options: NativeShareOptions): Promise<NativeShareResult> {
    let result: NativeShareResult

    try {
      if (process.platform === 'darwin') {
        result = await this.shareMacOS(options)
      } else if (process.platform === 'win32') {
        result = await this.shareWindows(options)
      } else {
        result = await this.shareLinux(options)
      }
    } catch (error) {
      result = {
        success: false,
        error: error instanceof Error ? error.message : 'Share failed'
      }
    }

    // Show notification for share result
    shareNotificationService.showShareResult(result)

    return result
  }

  /**
   * Shares using macOS Share Sheet via AppleScript
   */
  private async shareMacOS(options: NativeShareOptions): Promise<NativeShareResult> {
    const { target, text, url, files } = options

    // AirDrop specific handling
    if (target === 'airdrop' && files?.length) {
      return await this.shareAirDrop(files)
    }

    // Mail specific handling
    if (target === 'mail') {
      return await this.shareMail(options)
    }

    // Messages specific handling
    if (target === 'messages' && text) {
      return await this.shareMessages(text)
    }

    // General system share via Share Sheet
    if (files?.length) {
      // For files, open in Finder and let user share manually
      for (const file of files) {
        shell.showItemInFolder(file)
      }
      return { success: true, target: 'finder' }
    }

    if (text || url) {
      // Use clipboard + notification for text
      const content = text || url || ''
      const { clipboard } = await import('electron')
      clipboard.writeText(content)

      return { success: true, target: 'clipboard' }
    }

    return { success: false, error: 'No content to share' }
  }

  /**
   * Shares via AirDrop
   */
  private async shareAirDrop(files: string[]): Promise<NativeShareResult> {
    try {
      // Use NSSharingService via AppleScript
      const filePaths = files.map((f) => `POSIX file "${f}"`).join(', ')
      const script = `
        use framework "AppKit"
        use scripting additions
        
        set theFiles to {${filePaths}}
        set shareService to current application's NSSharingService's sharingServiceNamed:(current application's NSSharingServiceNameSendViaAirDrop)
        shareService's performWithItems:theFiles
      `

      await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`)
      return { success: true, target: 'airdrop' }
    } catch (_error) {
      // Fallback: open AirDrop window
      await execAsync(
        'open /System/Library/CoreServices/Finder.app/Contents/Applications/AirDrop.app'
      )
      return { success: true, target: 'airdrop-window' }
    }
  }

  /**
   * Shares via Mail
   */
  private async shareMail(options: NativeShareOptions): Promise<NativeShareResult> {
    const { title, text, files } = options

    if (process.platform === 'darwin') {
      // Use mailto: for text, or Mail.app for attachments
      if (files?.length) {
        const script = `
          tell application "Mail"
            activate
            set newMessage to make new outgoing message with properties {subject:"${title || ''}", content:"${text || ''}"}
            ${files.map((f) => `tell newMessage to make new attachment with properties {file name:"${f}"}`).join('\n')}
            tell newMessage to set visible to true
          end tell
        `
        await execAsync(`osascript -e '${script.replace(/'/g, "'\\''")}'`)
      } else {
        const subject = encodeURIComponent(title || '')
        const body = encodeURIComponent(text || '')
        shell.openExternal(`mailto:?subject=${subject}&body=${body}`)
      }
    } else {
      // Windows/Linux - use mailto:
      const subject = encodeURIComponent(title || '')
      const body = encodeURIComponent(text || '')
      shell.openExternal(`mailto:?subject=${subject}&body=${body}`)
    }

    return { success: true, target: 'mail' }
  }

  /**
   * Shares via Messages (iMessage)
   */
  private async shareMessages(text: string): Promise<NativeShareResult> {
    if (process.platform !== 'darwin') {
      return { success: false, error: 'Messages only available on macOS' }
    }

    const script = `
      tell application "Messages"
        activate
      end tell
    `
    await execAsync(`osascript -e '${script}'`)

    // Copy text to clipboard for user to paste
    const { clipboard } = await import('electron')
    clipboard.writeText(text)

    return { success: true, target: 'messages' }
  }

  /**
   * Shares using Windows Share API
   */
  private async shareWindows(options: NativeShareOptions): Promise<NativeShareResult> {
    const { text, url, files, target } = options

    if (target === 'mail') {
      return await this.shareMail(options)
    }

    // Windows doesn't have a direct Share API in Electron
    // Use clipboard as fallback
    if (text || url) {
      const { clipboard } = await import('electron')
      clipboard.writeText(text || url || '')
      return { success: true, target: 'clipboard' }
    }

    if (files?.length) {
      for (const file of files) {
        shell.showItemInFolder(file)
      }
      return { success: true, target: 'explorer' }
    }

    return { success: false, error: 'No content to share' }
  }

  /**
   * Shares on Linux
   */
  private async shareLinux(options: NativeShareOptions): Promise<NativeShareResult> {
    const { text, url, target } = options

    if (target === 'mail') {
      return await this.shareMail(options)
    }

    // Use xdg-open for URLs
    if (url) {
      shell.openExternal(url)
      return { success: true, target: 'browser' }
    }

    // Copy text to clipboard
    if (text) {
      const { clipboard } = await import('electron')
      clipboard.writeText(text)
      return { success: true, target: 'clipboard' }
    }

    return { success: false, error: 'No content to share' }
  }

  /**
   * Converts FlowPayload to NativeShareOptions
   */
  payloadToShareOptions(payload: FlowPayload): NativeShareOptions {
    const options: NativeShareOptions = {}

    switch (payload.type) {
      case 'text':
        options.text =
          typeof payload.data === 'string' ? payload.data : JSON.stringify(payload.data)
        break

      case 'json':
        options.text = JSON.stringify(payload.data, null, 2)
        break

      case 'html':
        options.text = typeof payload.data === 'string' ? payload.data : ''
        break

      case 'files':
        if (Array.isArray(payload.data)) {
          options.files = payload.data as string[]
        } else if (typeof payload.data === 'string') {
          options.files = [payload.data]
        }
        break

      case 'image':
        // For images, we might need to save to temp file first
        if (typeof payload.data === 'string' && payload.data.startsWith('data:')) {
          // Data URL - would need to save to temp file
          options.text = payload.data
        } else if (typeof payload.data === 'string') {
          options.files = [payload.data]
        }
        break

      default:
        options.text =
          typeof payload.data === 'string' ? payload.data : JSON.stringify(payload.data)
    }

    // Add context as title if available
    if (payload.context?.metadata?.title) {
      options.title = payload.context.metadata.title
    }

    return options
  }
}

export const nativeShareService = NativeShareService.getInstance()
