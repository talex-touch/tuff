import type { Ref } from 'vue'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { nextTick } from 'vue'

interface UseFocusOptions {
  boxInputRef: Ref<{ focus?: () => void } | null>
}

/**
 * Hook for managing CoreBox input focus
 */
export function useFocus(options: UseFocusOptions) {
  const { boxInputRef } = options
  const transport = useTuffTransport()

  /**
   * Focuses the CoreBox window first, then the input element
   */
  async function focusWindowAndInput(): Promise<void> {
    try {
      await transport.send(CoreBoxEvents.ui.focusWindow)
    } catch {
      // ignore focus errors
    }
    await nextTick()
    boxInputRef.value?.focus?.()
  }

  /**
   * Focuses only the input element
   */
  function focusInput(): void {
    boxInputRef.value?.focus?.()
  }

  return {
    focusWindowAndInput,
    focusInput
  }
}
