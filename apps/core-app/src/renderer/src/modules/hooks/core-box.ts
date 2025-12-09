import { reactive } from 'vue'
import { touchChannel } from '~/modules/channel/channel-core'
import { isDivisionBox as isDivisionBoxArg } from '@talex-touch/utils/renderer'
import type { DivisionBoxConfig, SessionMeta } from '@talex-touch/utils'

/**
 * DivisionBox initial data injected via IPC trigger
 */
export interface DivisionBoxInitialData {
  type: 'division-box'
  sessionId: string
  config: DivisionBoxConfig
  meta: SessionMeta
  theme: { dark: boolean }
}

/**
 * Window type state
 */
const initialType = isDivisionBoxArg() ? 'division-box' : 'corebox'
console.log('[core-box.ts] Initial window type:', initialType, 'isDivisionBoxArg:', isDivisionBoxArg())

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
  // Check if DivisionBox via command line argument (--core-type=division-box)
  const isDivisionBoxByArg = isDivisionBoxArg()
  console.log('[useCoreBox] isDivisionBoxArg:', isDivisionBoxByArg, 'process.argv:', process.argv)
  
  if (isDivisionBoxByArg) {
    windowState.type = 'division-box'
    
    console.log(
      '%c DivisionBox MODE ',
      'background: #e91e63; color: #fff;padding: 2px 4px; border-radius: 4px;font-weight: bold;',
    )
    
    // Auto-show for DivisionBox
    document.body.classList.add('core-box', 'division-box')
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
