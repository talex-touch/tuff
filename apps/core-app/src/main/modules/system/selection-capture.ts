import type { SelectionCaptureResult } from '@talex-touch/utils/transport/events/types/app'
import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'
import { clipboard } from 'electron'
import { createLogger } from '../../utils/logger'
import { getSelectionCaptureCapabilityPatch } from '../platform/capability-adapter'
import { sendPlatformShortcut } from './desktop-shortcut'
import { getXdotoolUnavailableReason } from './linux-desktop-tools'

const selectionCaptureLog = createLogger('SelectionCapture')
const execFileAsync = promisify(execFile)
const COPY_COMMAND_TIMEOUT_MS = 900
const COPY_RESULT_POLL_DELAY_MS = 120

interface ClipboardSnapshot {
  items: Array<{
    format: string
    data: Buffer
  }>
}

export interface SelectionCaptureOptions {
  enabled?: boolean
}

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null
  try {
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`${label} timeout after ${timeoutMs}ms`))
      }, timeoutMs)
    })
    return await Promise.race([promise, timeoutPromise])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

async function captureMacSelectionTextDirectly(): Promise<string | null> {
  try {
    const script = [
      'tell application "System Events"',
      '  tell (first process whose frontmost is true)',
      '    try',
      '      set focusedElement to value of attribute "AXFocusedUIElement"',
      '      set selectedText to value of attribute "AXSelectedText" of focusedElement',
      '      if selectedText is missing value then',
      '        return ""',
      '      end if',
      '      return selectedText',
      '    on error',
      '      return ""',
      '    end try',
      '  end tell',
      'end tell'
    ].join('\n')
    const { stdout } = await execFileAsync('osascript', ['-e', script])
    const selectedText = typeof stdout === 'string' ? stdout.trim() : ''
    return selectedText || null
  } catch {
    return null
  }
}

function snapshotClipboard(): ClipboardSnapshot {
  const items: ClipboardSnapshot['items'] = []
  for (const format of clipboard.availableFormats()) {
    try {
      items.push({
        format,
        data: clipboard.readBuffer(format)
      })
    } catch (error) {
      selectionCaptureLog.debug(`Skip clipboard format snapshot: ${format}`, {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
  return { items }
}

function restoreClipboard(snapshot: ClipboardSnapshot): boolean {
  try {
    clipboard.clear()
    for (const item of snapshot.items) {
      clipboard.writeBuffer(item.format, item.data)
    }
    return true
  } catch (error) {
    selectionCaptureLog.warn('Failed to restore clipboard snapshot', {
      error: error instanceof Error ? error.message : String(error)
    })
    return false
  }
}

async function captureSelection(
  options: SelectionCaptureOptions = {}
): Promise<SelectionCaptureResult> {
  const capturedAt = Date.now()
  const selectionCapability = await getSelectionCaptureCapabilityPatch({
    enabled: options.enabled !== false
  })

  if (selectionCapability.supportLevel === 'unsupported') {
    return {
      text: '',
      supportLevel: selectionCapability.supportLevel,
      issueCode: selectionCapability.issueCode === 'DISABLED' ? 'disabled' : 'unsupported',
      issueMessage: selectionCapability.reason,
      limitations: selectionCapability.limitations,
      capturedAt
    }
  }

  const baseResult = {
    supportLevel: selectionCapability.supportLevel,
    limitations: selectionCapability.limitations,
    capturedAt
  } satisfies Omit<SelectionCaptureResult, 'text'>

  if (process.platform === 'darwin') {
    const directSelection = await captureMacSelectionTextDirectly()
    if (directSelection) {
      return {
        text: directSelection,
        ...baseResult
      }
    }
  }

  const clipboardSnapshot = snapshotClipboard()
  const startedAt = Date.now()
  let result: SelectionCaptureResult

  try {
    await withTimeout(sendPlatformShortcut('copy'), COPY_COMMAND_TIMEOUT_MS, 'copy-command')
    await delay(COPY_RESULT_POLL_DELAY_MS)
    const text = clipboard.readText().trim()
    result = text
      ? {
          text,
          ...baseResult
        }
      : {
          text: '',
          ...baseResult,
          issueCode: 'empty',
          issueMessage: 'No selected text was captured from the active application.'
        }
  } catch (error) {
    const issueMessage = error instanceof Error ? error.message : 'Failed to capture selected text'
    const xdotoolUnavailableReason = getXdotoolUnavailableReason()
    result = {
      text: '',
      ...baseResult,
      issueCode: issueMessage === xdotoolUnavailableReason ? 'unsupported' : 'failed',
      issueMessage,
      limitations:
        issueMessage === xdotoolUnavailableReason && xdotoolUnavailableReason
          ? [xdotoolUnavailableReason]
          : baseResult.limitations
    }
  }

  const restored = restoreClipboard(clipboardSnapshot)
  selectionCaptureLog.debug('Selection capture completed', {
    meta: {
      costMs: Date.now() - startedAt,
      restored,
      supportLevel: result.supportLevel,
      issueCode: result.issueCode
    }
  })

  if (!restored) {
    return {
      text: '',
      ...baseResult,
      issueCode: 'failed',
      issueMessage: 'Clipboard snapshot restore failed after selection capture.'
    }
  }

  return result
}

export const selectionCaptureService = {
  capture: captureSelection
}
