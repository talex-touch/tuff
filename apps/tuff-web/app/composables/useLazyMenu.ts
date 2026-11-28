import type { Ref } from 'vue'
import { defineAsyncComponent, nextTick, ref, watch } from 'vue'

export interface LazyDropdownTriggerHandle {
  focus: () => void
  isFocused?: () => boolean
}

/**
 * Delays importing `@talex-touch/tuffex/dropdown-menu` until a user hovers,
 * focuses, or activates the menu trigger.
 */
export function useLazyDropdownMenu(triggerRef?: Ref<LazyDropdownTriggerHandle | null>) {
  const isOpen = ref(false)
  const menuActivated = ref(false)
  const pendingFocusRestore = ref(false)
  let loadingPromise: Promise<typeof import('@talex-touch/tuffex/dropdown-menu')> | null = null

  const loadDropdown = () => {
    if (!loadingPromise) {
      loadingPromise = import('@talex-touch/tuffex/dropdown-menu').catch((error) => {
        loadingPromise = null
        throw error
      })
    }
    return loadingPromise
  }

  if (triggerRef) {
    watch(
      () => triggerRef.value,
      (handle, previousHandle) => {
        if (!pendingFocusRestore.value || !handle || handle === previousHandle)
          return
        pendingFocusRestore.value = false
        if (!import.meta.client)
          return
        const active = document.activeElement
        if (!active || active === document.body || active === document.documentElement)
          handle.focus()
      },
      { flush: 'post' },
    )
  }

  const TxDropdownMenu = defineAsyncComponent(() => loadDropdown().then(m => m.TxDropdownMenu))
  const TxDropdownItem = defineAsyncComponent(() => loadDropdown().then(m => m.TxDropdownItem))

  function activateMenu(openAfterLoad = false) {
    if (menuActivated.value) {
      if (openAfterLoad)
        isOpen.value = true
      return
    }
    loadDropdown()
      .then(() => {
        const shouldRestoreFocus = !openAfterLoad && Boolean(triggerRef?.value?.isFocused?.())
        if (shouldRestoreFocus)
          pendingFocusRestore.value = true
        menuActivated.value = true
        if (openAfterLoad) {
          void nextTick(() => {
            isOpen.value = true
          })
        }
      })
      .catch((error) => {
        pendingFocusRestore.value = false
        if (import.meta.dev)
          console.warn('[useLazyDropdownMenu] failed to load dropdown menu chunk', error)
      })
  }

  return {
    isOpen,
    menuActivated,
    activateMenu,
    TxDropdownMenu,
    TxDropdownItem,
  }
}
