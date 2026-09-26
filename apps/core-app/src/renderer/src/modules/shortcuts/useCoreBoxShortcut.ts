import type { ShortcutBinding } from '~/modules/channel/main/shortcon'
import { computed, onScopeDispose, shallowRef } from 'vue'
import { shortconApi } from '~/modules/channel/main/shortcon'
import { useRendererPlatform } from '~/modules/platform/renderer-platform'
import { acceleratorLabel } from '../../../../shared/accelerator-label'
import { COREBOX_TOGGLE_SHORTCUT_ID } from '../../../../shared/corebox-shortcut'

/**
 * The global key that opens CoreBox, as the main process has it bound right now.
 *
 * Asked of the main process rather than written into the view, because the stored key is not
 * always a live one: the OS can refuse it (Windows does while another app holds Alt+Space), it can
 * lose an in-app conflict, and the user can rebind it in settings at any time. No other key stands
 * in, so then there is no key to teach. The main process pushes `shortcon:changed` after any of
 * these, so a hint follows without a reload.
 *
 * Call it in a component's setup, or another effect scope: the push subscription is released with
 * that scope.
 */
export function useCoreBoxShortcut() {
  const { platform } = useRendererPlatform()
  const binding = shallowRef<ShortcutBinding | null>(null)
  let latestRequest = 0
  let disposed = false

  async function refresh(): Promise<void> {
    const request = ++latestRequest
    try {
      const next = await shortconApi.getBinding(COREBOX_TOGGLE_SHORTCUT_ID)
      // A slower earlier answer must not overwrite a newer one.
      if (disposed || request !== latestRequest) return
      binding.value = next ?? null
    } catch {
      // Keep what is shown: a hint that blinks out on one failed query reads as a glitch.
    }
  }

  const stopListening = shortconApi.onChanged(() => {
    void refresh()
  })
  void refresh()

  onScopeDispose(() => {
    disposed = true
    stopListening()
  })

  /** The accelerator that opens CoreBox now; `null` while loading, or when no key does. */
  const effective = computed(() => binding.value?.effective ?? null)

  /** `⌥Space` on macOS, `Alt+Space` elsewhere; `null` when there is no key to teach. */
  const effectiveLabel = computed(() =>
    effective.value ? acceleratorLabel(effective.value, platform.value) : null
  )

  return { binding, effective, effectiveLabel, platform }
}
