import { touchChannel } from '~/modules/channel/channel-core'
import { appSetting } from '~/modules/channel/storage'
import { BoxMode, IBoxOptions } from '..'
import type { IClipboardHook, IClipboardOptions, IClipboardItem } from './types'

function normalizeTimestamp(value?: string | number | Date | null): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isFinite(time) ? time : null
  }

  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function useClipboard(
  boxOptions: IBoxOptions,
  clipboardOptions: IClipboardOptions,
  onPasteCallback?: () => void
): Omit<IClipboardHook, 'clipboardOptions'> {
  function canAutoPaste(): boolean {
    if (!clipboardOptions.last || !clipboardOptions.detectedAt) return false
    if (!appSetting.tools.autoPaste.enable) return false

    const limit = appSetting.tools.autoPaste.time
    if (limit === -1) return false
    if (limit === 0) return true

    return Date.now() - clipboardOptions.detectedAt <= limit * 1000
  }

  function handleAutoPaste(): void {
    if (!clipboardOptions.last) return
    if (!canAutoPaste()) return

    const data = clipboardOptions.last

    if (data.type === 'files') {
      try {
        const pathList = JSON.parse(data.content)
        const firstFile = pathList[0]

        if (firstFile) {
          boxOptions.file = {
            iconPath: firstFile,
            paths: pathList
          }
          boxOptions.mode = BoxMode.FILE

          clearClipboard({ remember: true })
        }
      } catch (error) {
        console.error('[Clipboard] Failed to parse file paths:', error)
      }
      return
    }

    if (data.type === 'text' || data.type === 'image' || data.type === 'html') {
      console.debug('[Clipboard] Auto-paste detected, content will be shown in tag', {
        type: data.type,
        length: data.type === 'text' ? data.content.length : undefined
      })

      if (onPasteCallback) {
        onPasteCallback()
      }
    }
  }

  function handlePaste(options?: { overrideDismissed?: boolean }): void {
    const overrideDismissed = options?.overrideDismissed ?? false
    const clipboard = touchChannel.sendSync('clipboard:get-latest') as IClipboardItem | null

    if (!clipboard || !clipboard.timestamp) {
      clearClipboard()
      return
    }

    const clipboardTimestamp = normalizeTimestamp(clipboard.timestamp)

    if (!clipboardTimestamp) {
      clearClipboard()
      return
    }

    const currentTimestamp = normalizeTimestamp(clipboardOptions.last?.timestamp ?? null)
    const dismissedTimestamp = normalizeTimestamp(clipboardOptions.lastClearedTimestamp)

    const isSameClipboard =
      currentTimestamp !== null && currentTimestamp === clipboardTimestamp
    const isDismissed =
      !overrideDismissed && dismissedTimestamp !== null && dismissedTimestamp === clipboardTimestamp

    if (isDismissed) {
      console.debug('[Clipboard] Skipping dismissed clipboard item')
      return
    }

    const shouldRefresh = !isSameClipboard || overrideDismissed

    if (shouldRefresh) {
      clipboardOptions.last = clipboard
      clipboardOptions.detectedAt = Date.now()
      clipboardOptions.lastClearedTimestamp = null

      console.debug('[Clipboard] New content detected', {
        type: clipboard.type,
        timestamp: new Date(clipboard.timestamp).toISOString()
      })

      if (onPasteCallback) {
        onPasteCallback()
      }
    }

    handleAutoPaste()
  }

  async function applyToActiveApp(item?: IClipboardItem): Promise<boolean> {
    const target = item ?? clipboardOptions.last
    if (!target) return false

    try {
      const result = await touchChannel.send('clipboard:apply-to-active-app', { item: target })
      if (typeof result === 'object' && result) {
        return Boolean(result.success)
      }
      return true
    } catch (error) {
      console.error('[Clipboard] Failed to apply to active app:', error)
      return false
    }
  }

  function clearClipboard(options?: { remember?: boolean }): void {
    const remember = options?.remember ?? false

    if (remember && clipboardOptions.last?.timestamp) {
      clipboardOptions.lastClearedTimestamp = clipboardOptions.last.timestamp
    } else if (!remember) {
      clipboardOptions.lastClearedTimestamp = null
    }

    clipboardOptions.last = null
    clipboardOptions.detectedAt = null

    if (onPasteCallback) {
      onPasteCallback()
    }
  }

  // Listen for system clipboard changes
  touchChannel.regChannel('clipboard:new-item', (data: any) => {
    if (!data?.type) return

    const clipboardData = data as IClipboardItem
    const incomingTimestamp = normalizeTimestamp(clipboardData.timestamp)
    const dismissedTimestamp = normalizeTimestamp(clipboardOptions.lastClearedTimestamp)

    if (incomingTimestamp && dismissedTimestamp && incomingTimestamp === dismissedTimestamp) {
      console.debug('[Clipboard] Ignoring dismissed clipboard item from system event')
      return
    }

    clipboardOptions.last = clipboardData
    clipboardOptions.detectedAt = Date.now()
    clipboardOptions.lastClearedTimestamp = null

    console.debug('[Clipboard] System clipboard changed', {
      type: clipboardData.type,
      timestamp: new Date(clipboardData.timestamp).toISOString()
    })

    if (onPasteCallback) {
      onPasteCallback()
    }
  })

  return {
    handlePaste,
    handleAutoPaste,
    applyToActiveApp,
    clearClipboard
  }
}
