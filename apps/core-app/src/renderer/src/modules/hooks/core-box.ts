import { reactive } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'
import type { DivisionBoxConfig, SessionMeta } from '@talex-touch/utils'
import { isDivisionBox as checkIsDivisionBox } from '@talex-touch/utils/renderer'

/**
 * DivisionBox initial data from unified channel
 */
export interface DivisionBoxInitialData {
  type: 'division-box'
  sessionId: string
  config: DivisionBoxConfig
  meta: SessionMeta
  theme: { dark: boolean }
}

declare global {
  interface Window {
    /** DivisionBox mode flag set by preload */
    $isDivisionBox?: boolean
  }
}

/**
 * Window type state
 * Uses preload flag $isDivisionBox OR arg-mapper for initial detection
 */
const detectDivisionBox = (): boolean => {
  // Check preload flag first
  if (window.$isDivisionBox) return true
  // Fallback to arg-mapper check
  try {
    return checkIsDivisionBox()
  } catch {
    return false
  }
}

const initialType = detectDivisionBox() ? 'division-box' : 'corebox'

export const windowState = reactive<{
  type: 'corebox' | 'division-box'
  divisionBox: DivisionBoxInitialData | null
}>({
  type: initialType,
  divisionBox: null
})

if (initialType === 'division-box') {
  document.body.classList.add('core-box', 'division-box')
}

try {
  touchChannel.regChannel('core-box:trigger', ({ data }: any) => {
    const { show, id, type, sessionId, config, meta } = data!
    
    console.debug('[core-box.ts] Received core-box:trigger', { show, id, type, startupInfoId: window.$startupInfo?.id })
    
    if (type === 'division-box') {
      windowState.type = 'division-box'
      windowState.divisionBox = {
        type: 'division-box',
        sessionId,
        config,
        meta,
        theme: { dark: document.documentElement.classList.contains('dark') }
      }
      document.body.classList.add('core-box', 'division-box')
      return
    }
    
    if (window.$startupInfo?.id !== undefined && id !== window.$startupInfo.id) {
      console.debug('[core-box.ts] ID mismatch, skipping', { receivedId: id, startupInfoId: window.$startupInfo.id })
      return
    }

    // Always keep core-box class - CoreBox is a separate window, 
    // visibility is controlled by the window itself, not CSS class
    if (!document.body.classList.contains('core-box')) {
      console.debug('[core-box.ts] Adding core-box class to body')
      document.body.classList.add('core-box')
    }

    if (show) {
      setTimeout(() => {
        const input = document.querySelector('#core-box-input') as HTMLElement
        input?.focus()
      }, 100)
      
      // Dispatch event to trigger recommendation refresh when CoreBox is shown
      window.dispatchEvent(new CustomEvent('corebox:shown'))
    }
    // Note: We no longer remove core-box class on hide - the window visibility
    // is controlled by the main process, not by CSS class
  })
} catch { /* ignore */ }

/**
 * Check if running in DivisionBox mode
 */
export function isDivisionBoxMode(): boolean {
  return windowState.type === 'division-box'
}

/**
 * Get DivisionBox config
 */
export function getDivisionBoxConfig(): DivisionBoxConfig | null {
  return windowState.divisionBox?.config ?? null
}

export function useCoreBox(): void {
  // Trigger listener already registered at module load
}
