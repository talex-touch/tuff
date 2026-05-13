import type {
  ClipboardActionResult,
  ClipboardApplyRequest,
  ClipboardCopyAndPasteRequest
} from '@talex-touch/utils/transport/events/types'
import type { HandlerContext } from '@talex-touch/utils/transport/main'
import type { NativeImage } from 'electron'
import type { ClipboardApplyPayload } from './clipboard-request-normalizer'
import type { IClipboardItem } from './clipboard-history-persistence'
import type { LogOptions } from '../../utils/logger'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { clipboard } from 'electron'
import { coreBoxManager } from '../box-tool/core-box/manager'
import { notificationModule } from '../notification'
import { getAutoPasteCapabilityPatch } from '../platform/capability-adapter'
import { sendPlatformShortcut } from '../system/desktop-shortcut'
import {
  AUTO_PASTE_FAILED_MESSAGE,
  ClipboardActionRuntimeError,
  normalizeClipboardActionError,
  summarizeClipboardApplyPayload
} from './clipboard-action-diagnostics'
import { createNativeImageFromClipboardSource } from './clipboard-image-persistence'
import { buildApplyPayloadFromCopyAndPaste } from './clipboard-request-normalizer'

export interface ClipboardAutopasteAutomationOptions {
  hasDatabase: () => boolean
  getItemById: (id: number) => Promise<IClipboardItem | null>
  rememberFreshness: (item: IClipboardItem) => void
  primeImage?: (image: NativeImage) => void
  primeFiles?: (files: string[]) => void
  markText?: (text: string) => void
  onWrite?: () => void
  logWarn: (message: string, data?: LogOptions) => void
  logError: (message: string, data?: LogOptions) => void
  logDebug: (message: string, data?: LogOptions) => void
}

export function parseClipboardFileList(content?: string | null): string[] {
  if (!content) return []
  try {
    const parsed = JSON.parse(content)
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (entry): entry is string => typeof entry === 'string' && entry.length > 0
      )
    }
  } catch {
    return []
  }
  return []
}

function wait(ms: number): Promise<void> {
  if (!ms || ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class ClipboardAutopasteAutomation {
  constructor(private readonly options: ClipboardAutopasteAutomationOptions) {}

  public toActionFailureResult(
    error: unknown,
    logMessage: string,
    meta: Record<string, unknown> = {},
    fallbackMessage?: string,
    options: { notify?: boolean } = {}
  ): ClipboardActionResult {
    const failure = normalizeClipboardActionError(error, fallbackMessage)
    this.options.logWarn(logMessage, {
      error: failure.originalError,
      meta: {
        ...meta,
        code: failure.code,
        message: failure.message
      }
    })

    if (options.notify) {
      this.notifyAutoPasteFailure(failure)
    }

    return {
      success: false,
      message: failure.message,
      code: failure.code
    }
  }

  public async handleApplyRequest(
    request: ClipboardApplyRequest,
    context: HandlerContext
  ): Promise<ClipboardActionResult> {
    if (!this.options.hasDatabase()) {
      return this.toActionFailureResult(
        new ClipboardActionRuntimeError(
          'CLIPBOARD_DATABASE_UNAVAILABLE',
          'Clipboard database is not ready.'
        ),
        'Clipboard apply failed',
        {
          platform: process.platform,
          itemId: request?.id,
          pluginName: context.plugin?.name ?? null,
          autoPaste: request?.autoPaste !== false
        },
        'Clipboard database is not ready.'
      )
    }

    let item: IClipboardItem | null = null
    try {
      item = await this.options.getItemById(request.id)
    } catch (error) {
      return this.toActionFailureResult(error, 'Clipboard apply lookup failed', {
        platform: process.platform,
        itemId: request?.id,
        pluginName: context.plugin?.name ?? null,
        autoPaste: request?.autoPaste !== false
      })
    }

    if (!item) {
      return this.toActionFailureResult(
        new ClipboardActionRuntimeError(
          'CLIPBOARD_ITEM_NOT_FOUND',
          `Clipboard history item not found: ${request.id}`
        ),
        'Clipboard apply failed',
        {
          platform: process.platform,
          itemId: request?.id,
          pluginName: context.plugin?.name ?? null,
          autoPaste: request?.autoPaste !== false
        },
        'Clipboard history item not found.'
      )
    }

    const applyPayload: ClipboardApplyPayload = { item }
    try {
      if (request.autoPaste === false) {
        this.writeItemToClipboard(item, applyPayload)
        return { success: true }
      }

      await this.applyToActiveApp(applyPayload)
      return { success: true }
    } catch (error) {
      return this.toActionFailureResult(
        error,
        'Clipboard apply failed',
        {
          ...summarizeClipboardApplyPayload(applyPayload),
          pluginName: context.plugin?.name ?? null,
          autoPaste: request?.autoPaste !== false
        },
        AUTO_PASTE_FAILED_MESSAGE,
        { notify: true }
      )
    }
  }

  public async handleCopyAndPasteRequest(
    request: ClipboardCopyAndPasteRequest,
    context: HandlerContext
  ): Promise<ClipboardActionResult> {
    const applyPayload = buildApplyPayloadFromCopyAndPaste(request)
    try {
      await this.applyToActiveApp(applyPayload)
      return { success: true }
    } catch (error) {
      return this.toActionFailureResult(
        error,
        'Clipboard copy-and-paste failed',
        {
          ...summarizeClipboardApplyPayload(applyPayload),
          pluginName: context.plugin?.name ?? null
        },
        AUTO_PASTE_FAILED_MESSAGE,
        { notify: true }
      )
    }
  }

  public normalizeApplyPayload(payload: ClipboardApplyPayload): IClipboardItem {
    if (!payload) {
      throw new Error('Clipboard apply payload is missing.')
    }

    const base = payload.item ?? {}
    const derivedType = payload.type ?? base.type ?? (payload.files ? 'files' : undefined)
    let resolvedType: IClipboardItem['type'] | null = derivedType ?? null

    if (!resolvedType) {
      if (payload.text !== undefined || payload.html !== undefined) {
        resolvedType = 'text'
      }
    }

    if (!resolvedType) {
      throw new Error('Unable to resolve clipboard content type for auto paste.')
    }

    if (resolvedType === 'text') {
      const content = payload.text ?? base.content ?? ''
      const rawContent = payload.html ?? base.rawContent ?? null
      return {
        type: 'text',
        content,
        rawContent
      }
    }

    if (resolvedType === 'image') {
      const content = base.content ?? payload.text
      if (!content) {
        throw new Error('Image clipboard item is missing data URL content.')
      }
      return {
        type: 'image',
        content
      }
    }

    const files = payload.files ?? parseClipboardFileList(base.content)
    if (!files.length) {
      throw new Error('File clipboard item has no file paths to apply.')
    }

    return {
      type: 'files',
      content: JSON.stringify(files)
    }
  }

  public writeItemToClipboard(item: IClipboardItem, payload: ClipboardApplyPayload): void {
    if (item.type === 'text') {
      const html = item.rawContent ?? payload.html ?? undefined
      clipboard.write({
        text: item.content ?? '',
        html: html ?? undefined
      })
      this.options.markText?.(item.content ?? '')
      this.options.onWrite?.()
      return
    }

    if (item.type === 'image') {
      const source = item.content ?? ''
      const image = createNativeImageFromClipboardSource(source)
      if (image.isEmpty()) {
        throw new Error('Image clipboard item could not be reconstructed.')
      }
      clipboard.writeImage(image)
      this.options.primeImage?.(image)
      this.options.onWrite?.()
      return
    }

    const files = parseClipboardFileList(item.content)
    if (!files.length) {
      throw new Error('File clipboard item is empty.')
    }

    const resolvedPaths = files.map((filePath) => {
      try {
        return path.isAbsolute(filePath) ? filePath : path.resolve(filePath)
      } catch {
        return filePath
      }
    })

    const fileUrlContent = resolvedPaths
      .map((filePath) => pathToFileURL(filePath).toString())
      .join('\n')
    const buffer = Buffer.from(fileUrlContent, 'utf8')

    try {
      for (const format of ['public.file-url', 'public.file-url-multiple', 'text/uri-list']) {
        clipboard.writeBuffer(format, buffer)
      }
    } catch (error) {
      this.options.logWarn('Failed to populate file clipboard formats', { error })
    }

    clipboard.write({ text: resolvedPaths[0] ?? '' })
    this.options.primeFiles?.(resolvedPaths)
    this.options.onWrite?.()
  }

  public async applyToActiveApp(payload: ClipboardApplyPayload): Promise<void> {
    const item = this.normalizeApplyPayload(payload)

    if (typeof item.id === 'number') {
      this.options.rememberFreshness(item)
    }
    this.writeItemToClipboard(item, payload)

    if (payload.hideCoreBox !== false) {
      try {
        coreBoxManager.trigger(false)
      } catch (error) {
        this.options.logDebug('Failed to hide CoreBox before auto paste', { error })
      }
    }

    const delay = Number.isFinite(payload.delayMs) ? Math.max(0, Number(payload.delayMs)) : 150
    await wait(delay)

    await this.simulatePasteCommand()
  }

  private notifyAutoPasteFailure(failure: {
    code: ClipboardActionResult['code']
    message: string
  }): void {
    const code = failure.code ?? 'AUTO_PASTE_FAILED'
    notificationModule.showInternalSystemNotification({
      id: `clipboard-auto-paste-failed:${code}`,
      title: '自动粘贴失败',
      message: failure.message,
      level: 'error',
      dedupeKey: `clipboard-auto-paste-failed:${code}`,
      system: { silent: false }
    })
  }

  private async simulatePasteCommand(): Promise<void> {
    try {
      const autoPasteCapability = await getAutoPasteCapabilityPatch()
      if (autoPasteCapability.supportLevel === 'unsupported') {
        throw new Error(
          autoPasteCapability.reason ||
            `Auto paste is not supported on platform: ${process.platform}`
        )
      }

      await sendPlatformShortcut('paste')
    } catch (error) {
      const failure = normalizeClipboardActionError(error, AUTO_PASTE_FAILED_MESSAGE)
      this.options.logError('Failed to simulate paste command', {
        error: failure.originalError,
        meta: {
          code: failure.code,
          message: failure.message,
          platform: process.platform
        }
      })
      throw new ClipboardActionRuntimeError(failure.code, failure.message, failure.originalError)
    }
  }
}
