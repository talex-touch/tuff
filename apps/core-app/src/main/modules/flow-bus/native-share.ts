/**
 * Native Share Service
 *
 * Provides platform-native share behavior where available.
 * macOS exposes real native targets; Windows/Linux only expose an explicit mail target.
 */

import type {
  FlowPayload,
  FlowTarget,
  NativeShareOptions,
  NativeShareTarget,
  NativeShareResult
} from '@talex-touch/utils'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { shell } from 'electron'
import { execFileSafe } from '@talex-touch/utils/common/utils/safe-shell'
import { shareNotificationService } from './share-notification'

async function runAppleScript(script: string): Promise<void> {
  await execFileSafe('osascript', ['-e', script])
}

async function runAppleScriptWithOutput(script: string): Promise<string> {
  const output = await execFileSafe('osascript', ['-e', script])
  return output.stdout?.trim() ?? ''
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')
}

function buildShareBody(text?: string, url?: string): string {
  const segments = [text, url].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  )
  return segments.join('\n')
}

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

  normalizeTarget(target?: string | null): NativeShareTarget | undefined {
    switch (target) {
      case 'system':
      case 'system-share':
        return 'system'
      case 'airdrop':
      case 'mail':
      case 'messages':
        return target
      default:
        return undefined
    }
  }

  /**
   * Gets available native share targets for current platform
   */
  getAvailableTargets(): FlowTarget[] {
    const targets: FlowTarget[] = []

    if (process.platform === 'darwin') {
      targets.push({
        id: 'system-share',
        name: 'System Share',
        description: 'Share via native macOS share target chooser',
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
        supportedTypes: ['text'],
        icon: 'ri:message-3-line'
      })
    } else if (process.platform === 'win32') {
      targets.push({
        id: 'mail',
        name: 'Mail',
        description: 'Share via the default mail client',
        supportedTypes: ['text'],
        icon: 'ri:mail-line'
      })
    } else {
      targets.push({
        id: 'mail',
        name: 'Mail',
        description: 'Share via the default mail client',
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
      const normalizedOptions = await this.materializeImageDataUrl(options)

      if (process.platform === 'darwin') {
        result = await this.shareMacOS(normalizedOptions)
      } else if (process.platform === 'win32') {
        result = await this.shareWindows(normalizedOptions)
      } else {
        result = await this.shareLinux(normalizedOptions)
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
    const target = this.normalizeTarget(options.target)
    const { text, url, files } = options
    const shareBody = buildShareBody(text, url)

    if (target === 'airdrop' && files?.length) {
      return await this.shareAirDrop(files)
    }

    if (target === 'mail') {
      return await this.shareMail(options)
    }

    if (target === 'messages' && shareBody) {
      return await this.shareMessages(shareBody)
    }

    if (!target || target === 'system') {
      return await this.shareMacSystem(options)
    }

    return { success: false, error: 'No content to share' }
  }

  private async shareMacSystem(options: NativeShareOptions): Promise<NativeShareResult> {
    const availableTargets: Array<{ label: string; target: NativeShareTarget }> = []
    if (options.files?.length) {
      availableTargets.push({ label: 'AirDrop', target: 'airdrop' })
      availableTargets.push({ label: 'Mail', target: 'mail' })
    }
    if (options.text || options.url) {
      availableTargets.push({ label: 'Mail', target: 'mail' })
      availableTargets.push({ label: 'Messages', target: 'messages' })
    }

    const dedupedTargets = availableTargets.filter(
      (item, index, items) =>
        items.findIndex((candidate) => candidate.target === item.target) === index
    )

    if (dedupedTargets.length === 0) {
      return { success: false, error: 'No content to share' }
    }

    if (dedupedTargets.length === 1) {
      return await this.shareMacTarget(dedupedTargets[0].target, options)
    }

    const choices = dedupedTargets.map((item) => `"${item.label}"`).join(', ')
    const selected = await runAppleScriptWithOutput(`
set shareChoice to choose from list {${choices}} with prompt "Choose a macOS share target" without multiple selections allowed
if shareChoice is false then
  return ""
end if
return item 1 of shareChoice
`)

    const choice = dedupedTargets.find((item) => item.label === selected)
    if (!choice) {
      return { success: false, error: 'Share cancelled' }
    }

    return await this.shareMacTarget(choice.target, options)
  }

  private async shareMacTarget(
    target: NativeShareTarget,
    options: NativeShareOptions
  ): Promise<NativeShareResult> {
    if (target === 'airdrop' && options.files?.length) {
      return await this.shareAirDrop(options.files)
    }
    if (target === 'mail') {
      return await this.shareMail({ ...options, target })
    }
    const shareBody = buildShareBody(options.text, options.url)
    if (target === 'messages' && shareBody) {
      return await this.shareMessages(shareBody)
    }
    return { success: false, error: `Target ${target} cannot handle current payload` }
  }

  /**
   * Shares via AirDrop
   */
  private async shareAirDrop(files: string[]): Promise<NativeShareResult> {
    try {
      // Use NSSharingService via AppleScript
      const filePaths = files.map((f) => `POSIX file "${escapeAppleScriptString(f)}"`).join(', ')
      const script = `
        use framework "AppKit"
        use scripting additions
        
        set theFiles to {${filePaths}}
        set shareService to current application's NSSharingService's sharingServiceNamed:(current application's NSSharingServiceNameSendViaAirDrop)
        shareService's performWithItems:theFiles
      `

      await runAppleScript(script)
      return { success: true, target: 'airdrop' }
    } catch (_error) {
      // Fallback: open AirDrop window
      await execFileSafe('open', [
        '/System/Library/CoreServices/Finder.app/Contents/Applications/AirDrop.app'
      ])
      return { success: true, target: 'airdrop-window' }
    }
  }

  /**
   * Shares via Mail
   */
  private async shareMail(options: NativeShareOptions): Promise<NativeShareResult> {
    const { title, text, files, url } = options
    const normalizedBody = buildShareBody(text, url)

    if (process.platform === 'darwin') {
      if (files?.length) {
        const escapedSubject = escapeAppleScriptString(title || '')
        const escapedBody = escapeAppleScriptString(normalizedBody)
        const attachmentStatements = files
          .map(
            (filePath) =>
              `tell newMessage to make new attachment with properties {file name:(POSIX file "${escapeAppleScriptString(filePath)}")} at after the last paragraph`
          )
          .join('\n')
        const script = `
          tell application "Mail"
            activate
            set newMessage to make new outgoing message with properties {subject:"${escapedSubject}", content:"${escapedBody}"}
            ${attachmentStatements}
            tell newMessage to set visible to true
          end tell
        `
        await runAppleScript(script)
      } else {
        const subject = encodeURIComponent(title || '')
        const body = encodeURIComponent(normalizedBody)
        await shell.openExternal(`mailto:?subject=${subject}&body=${body}`)
      }
    } else {
      if (files?.length) {
        return {
          success: false,
          error: 'Mail target does not support file attachments on this platform'
        }
      }
      const subject = encodeURIComponent(title || '')
      const body = encodeURIComponent(normalizedBody)
      await shell.openExternal(`mailto:?subject=${subject}&body=${body}`)
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
    await runAppleScript(script)

    // Copy text to clipboard for user to paste
    const { clipboard } = await import('electron')
    clipboard.writeText(text)

    return { success: true, target: 'messages', requiresUserAction: true }
  }

  /**
   * Shares on Windows via mail-only fallback
   */
  private async shareWindows(options: NativeShareOptions): Promise<NativeShareResult> {
    const target = this.normalizeTarget(options.target)

    if (!target || target === 'mail') {
      return await this.shareMail(options)
    }

    return {
      success: false,
      error:
        'Windows does not provide a system share sheet in core-app; only the explicit mail target is available.'
    }
  }

  /**
   * Shares on Linux via mail-only fallback
   */
  private async shareLinux(options: NativeShareOptions): Promise<NativeShareResult> {
    const target = this.normalizeTarget(options.target)

    if (!target || target === 'mail') {
      return await this.shareMail(options)
    }

    return {
      success: false,
      error:
        'Linux does not provide a system share sheet in core-app; only the explicit mail target is available.'
    }
  }

  private async materializeImageDataUrl(options: NativeShareOptions): Promise<NativeShareOptions> {
    const rawText = typeof options.text === 'string' ? options.text.trim() : ''
    if (options.files?.length || !rawText.startsWith('data:image/')) {
      return {
        ...options,
        target: this.normalizeTarget(options.target)
      }
    }

    const match = rawText.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i)
    if (!match) {
      return {
        ...options,
        target: this.normalizeTarget(options.target)
      }
    }

    const mimeType = match[1].toLowerCase()
    const base64Payload = match[2]
    const extension = mimeType.split('/')[1]?.replace(/[^a-z0-9]+/gi, '') || 'png'
    const tempFilePath = path.join(
      os.tmpdir(),
      `tuff-native-share-${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`
    )

    await fs.writeFile(tempFilePath, Buffer.from(base64Payload, 'base64'))

    return {
      ...options,
      text: undefined,
      files: [tempFilePath],
      target: this.normalizeTarget(options.target)
    }
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
        if (typeof payload.data === 'string' && payload.data.startsWith('data:')) {
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
