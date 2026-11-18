import { defineAsyncComponent, nextTick, ref } from 'vue'

/**
 * Delays importing `@talex-touch/tuffex/dropdown-menu` (and its floating/popover
 * style closure) until a user hovers, focuses, or activates the menu trigger.
 */
export function useLazyDropdownMenu() {
  const isOpen = ref(false)
  const menuActivated = ref(false)
  let loadingPromise: Promise<typeof import('@talex-touch/tuffex/dropdown-menu')> | null = null

  const loadDropdown = () => {
    loadingPromise ??= import('@talex-touch/tuffex/dropdown-menu')
    return loadingPromise
  }

  const TxDropdownMenu = defineAsyncComponent(() => loadDropdown().then(m => m.TxDropdownMenu))
  const TxDropdownItem = defineAsyncComponent(() => loadDropdown().then(m => m.TxDropdownItem))

  function activateMenu(openAfterLoad = false) {
    if (menuActivated.value) {
      if (openAfterLoad)
        isOpen.value = true
      return
    }
    void loadDropdown().then(() => {
      menuActivated.value = true
      if (openAfterLoad) {
        void nextTick(() => {
          isOpen.value = true
        })
      }
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
