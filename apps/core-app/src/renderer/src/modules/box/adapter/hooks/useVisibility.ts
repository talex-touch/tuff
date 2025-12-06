import type { Ref } from 'vue'
import type { IBoxOptions } from '..'
import { useDocumentVisibility } from '@vueuse/core'
import { nextTick, ref, watch } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { appSetting } from '~/modules/channel/storage'
import { BoxMode } from '..'

/**
 * Manages CoreBox visibility, auto-clear, and autopaste behavior
 * @param boxOptions - Box state options
 * @param searchVal - Search input value ref
 * @param clipboardOptions - Clipboard state options
 * @param handleAutoFill - Function to auto-fill clipboard content
 * @param handlePaste - Function to paste clipboard content
 * @param _clearClipboard - Function to clear clipboard state
 * @param boxInputRef - Reference to box input component
 * @param deactivateAllProviders - Function to deactivate all active providers
 */
export function useVisibility(
  boxOptions: IBoxOptions,
  searchVal: Ref<string>,
  clipboardOptions: any,
  handleAutoFill: () => void,
  handlePaste: (options?: { overrideDismissed?: boolean }) => void,
  _clearClipboard: () => void,
  boxInputRef: Ref<any>,
  deactivateAllProviders: () => Promise<void>
) {
  const visibility = useDocumentVisibility()
  
  // Track if CoreBox was triggered by keyboard shortcut
  const wasTriggeredByShortcut = ref(false)

  // Listen for shortcut trigger event from main process
  const unregisterShortcutTrigger = touchChannel.regChannel('core-box:shortcut-triggered', () => {
    console.debug('[Visibility] CoreBox triggered by keyboard shortcut')
    wasTriggeredByShortcut.value = true
  })

  watch(
    () => visibility.value,
    (val) => {
      if (!val) {
        boxOptions.lastHidden = Date.now()
        console.debug('[Visibility] CoreBox hidden, timestamp saved:', boxOptions.lastHidden)
        
        // Reset shortcut trigger flag when hiding
        wasTriggeredByShortcut.value = false
        
        // Clear search input to trigger item list clearing
        searchVal.value = ''
        console.debug('[Visibility] Cleared search input')
        
        // Clear activated providers when widget is hidden
        console.debug('[Visibility] Clearing activated providers on hide')
        deactivateAllProviders().catch((error) => {
          console.error('[Visibility] Failed to deactivate providers on hide:', error)
        })
        
        // Don't clear clipboard, preserve state for expiration check on next open
        return
      }

      // Use nextTick to ensure the input element is available and ready.
      nextTick(() => {
        boxInputRef.value?.focus()
      })

      // Check if autoClear should be triggered
      if (appSetting.tools.autoClear !== -1 && boxOptions.lastHidden > 0) {
        const timeSinceHidden = Date.now() - boxOptions.lastHidden
        const autoClearMs = appSetting.tools.autoClear * 1000

        console.debug('[Visibility] CoreBox shown, checking autoClear', {
          timeSinceHidden: `${Math.round(timeSinceHidden / 1000)}s`,
          autoClearThreshold: `${appSetting.tools.autoClear}s`,
          shouldClear: timeSinceHidden > autoClearMs,
        })

        if (timeSinceHidden > autoClearMs) {
          console.debug('[Visibility] AutoClear triggered, clearing search bar')
          searchVal.value = ''
          boxOptions.mode = BoxMode.INPUT
          boxOptions.data = {}
        }
      }
      else if (appSetting.tools.autoClear === -1) {
        console.debug('[Visibility] AutoClear disabled (set to -1)')
      }
      else if (boxOptions.lastHidden <= 0) {
        console.debug('[Visibility] No lastHidden timestamp, skipping autoClear')
      }

      // Auto-detect clipboard when CoreBox is opened
      // handlePaste will check if clipboard is expired
      handlePaste()

      // Only auto-fill if triggered by keyboard shortcut
      if (wasTriggeredByShortcut.value && clipboardOptions.last) {
        console.debug('[Visibility] Auto-filling clipboard (triggered by shortcut)')
        handleAutoFill()
        // Reset flag after auto-filling
        wasTriggeredByShortcut.value = false
      } else if (clipboardOptions.last) {
        console.debug('[Visibility] Skipping auto-fill (not triggered by shortcut)')
      }
    },
  )

  return {
    visibility,
    cleanup: () => {
      unregisterShortcutTrigger()
    }
  }
}
