import { reactive } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'
import type { DivisionBoxConfig, SessionMeta } from '@talex-touch/utils'

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
 * Uses preload flag $isDivisionBox for initial detection
 */
const initialType = window.$isDivisionBox ? 'division-box' : 'corebox'

export const windowState = reactive<{
  type: 'corebox' | 'division-box'
  divisionBox: DivisionBoxInitialData | null
}>({
  type: initialType,
  divisionBox: null
})

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
  // Use preload flag for DivisionBox detection
  if (window.$isDivisionBox) {
    windowState.type = 'division-box'
    document.body.classList.add('core-box', 'division-box')
    
    console.log(
      '%c DivisionBox MODE ',
      'background: #e91e63; color: #fff;padding: 2px 4px; border-radius: 4px;font-weight: bold;',
    )
  } else {
    console.log(
      '%c CoreBox MODE ',
      'background: #42b983; color: #fff;padding: 2px 4px; border-radius: 4px;font-weight: bold;',
    )
  }

  touchChannel.regChannel('core-box:trigger', ({ data }: any) => {
    const { show, id, type, sessionId, config, meta } = data!
    
    // Handle DivisionBox trigger (populate config and meta)
    if (type === 'division-box') {
      windowState.type = 'division-box'
      windowState.divisionBox = {
        type: 'division-box',
        sessionId,
        config,
        meta,
        theme: { dark: document.documentElement.classList.contains('dark') }
      }
      
      console.log(
        '%c DivisionBox Config Received ',
        'background: #e91e63; color: #fff;padding: 2px 4px; border-radius: 4px;font-weight: bold;',
        sessionId
      )
      
      document.body.classList.add('core-box', 'division-box')
      return
    }
    
    // Standard CoreBox trigger
    if (window.$startupInfo?.id !== undefined) {
      if (id !== window.$startupInfo.id)
        return
    }

    if (show) {
      document.body.classList.add('core-box')

      setTimeout(() => {
        const input = document.querySelector('#core-box-input') as HTMLElement

        input?.focus()
      }, 100)
    }
    else {
      document.body.classList.remove('core-box')
    }
  })
}
