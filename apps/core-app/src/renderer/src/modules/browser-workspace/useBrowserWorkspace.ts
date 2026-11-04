import type { BrowserWorkspaceState } from '@talex-touch/utils/transport/sdk/domains/browser'
import { createBrowserSdk } from '@talex-touch/utils/transport/sdk/domains/browser'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'

/**
 * One renderer-wide view of the browser workspace, read by the shell tab strip and the Browser page.
 * Module-scoped like `useBrowserConnection`: both surfaces must agree on the tab list, on the error
 * that gates the guest view, and on which floating layers cover it.
 */
const sdk = createBrowserSdk(useTuffTransport())
const state = shallowRef<BrowserWorkspaceState | null>(null)
const connecting = ref(true)
const error = ref('')
const tabMenuOpen = ref(false)
const pluginToolbarOpen = ref(false)
const accountOpen = ref(false)
let retryAction: (() => Promise<BrowserWorkspaceState>) | null = null
let consumers = 0
let unsubscribe: (() => void) | undefined

// The push listener is installed before getState. Both command replies and the first read may
// arrive behind a newer push, so Main's revision is the sole ordering authority.
function applyState(next: BrowserWorkspaceState): void {
  if (state.value && next.revision <= state.value.revision) return
  state.value = next
  connecting.value = false
}

async function refreshState(): Promise<void> {
  connecting.value = true
  error.value = ''
  try {
    applyState(await sdk.getState())
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure)
  } finally {
    connecting.value = false
  }
}

async function command(action: () => Promise<BrowserWorkspaceState>): Promise<boolean> {
  error.value = ''
  try {
    applyState(await action())
    retryAction = null
    return true
  } catch (failure) {
    retryAction = action
    error.value = failure instanceof Error ? failure.message : String(failure)
    return false
  }
}

function retryWorkspace(): void {
  if (retryAction) void command(retryAction)
  else void refreshState()
}

export function useBrowserWorkspace() {
  onMounted(() => {
    consumers += 1
    if (consumers > 1) return
    unsubscribe = sdk.onChanged(applyState)
    void refreshState()
  })
  onBeforeUnmount(() => {
    consumers -= 1
    if (consumers > 0) return
    unsubscribe?.()
    unsubscribe = undefined
  })

  return {
    state,
    connecting,
    error,
    tabMenuOpen,
    pluginToolbarOpen,
    accountOpen,
    command,
    retryWorkspace
  }
}
