import { reactive } from 'vue'
import { toast } from 'vue-sonner'
import { writeClipboardText } from '@talex-touch/utils/common/utils/clipboard'
import type { CopyState } from './shortcut-dialog.types'

type ShortcutCopyMessages = {
  success: string
  failed: string
}

export const useShortcutCopy = (messages: ShortcutCopyMessages) => {
  const copyStateMap = reactive(new Map<string, CopyState>())
  const copyTimers = new Map<string, number>()

  const setCopyState = (id: string, state: CopyState): void => {
    copyStateMap.set(id, state)
    const existingTimer = copyTimers.get(id)
    if (existingTimer) {
      window.clearTimeout(existingTimer)
      copyTimers.delete(id)
    }
    const timeout = window.setTimeout(() => {
      copyStateMap.delete(id)
      copyTimers.delete(id)
    }, 1400)
    copyTimers.set(id, timeout)
  }

  const getCopyState = (id: string): CopyState | undefined => copyStateMap.get(id)

  const getCopyIcon = (id: string): string => {
    const state = getCopyState(id)
    if (state === 'success') return 'i-carbon-checkmark'
    if (state === 'error') return 'i-carbon-close'
    return 'i-carbon-copy'
  }

  const resetCopyState = (): void => {
    copyStateMap.clear()
    for (const timer of copyTimers.values()) {
      window.clearTimeout(timer)
    }
    copyTimers.clear()
  }

  const copyShortcutId = async (id: string): Promise<void> => {
    if (!id) return
    const copied = await writeClipboardText(id)

    if (copied) {
      setCopyState(id, 'success')
      toast.success(messages.success)
    } else {
      setCopyState(id, 'error')
      toast.error(messages.failed)
    }
  }

  return {
    copyShortcutId,
    getCopyState,
    getCopyIcon,
    resetCopyState
  }
}
