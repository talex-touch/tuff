import type { Ref } from 'vue'
import { nextTick } from 'vue'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
import { touchChannel } from '~/modules/channel/channel-core'

interface UseFocusOptions {
  boxInputRef: Ref<any>
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
      await touchChannel.send('core-box:focus-window')
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
