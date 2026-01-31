import { isDevEnv } from '@talex-touch/utils/env'
import { useStartupInfo } from '../hooks/useStartupInfo'

export type AppEntranceMode = 'CoreBox' | 'MainApp' | 'DivisionBox'

type LogDetails = Record<string, unknown>

const printedOnceKeys = new Set<string>()
const { startupInfo } = useStartupInfo()

function shouldLogEntrance(): boolean {
  if (isDevEnv()) return true

  return Boolean(startupInfo.value?.isDev) || window.location.search.includes('debug-entrance')
}

function getModeStyle(mode: AppEntranceMode): string {
  switch (mode) {
    case 'CoreBox':
      return 'background:#7c3aed;color:#fff;'
    case 'DivisionBox':
      return 'background:#f97316;color:#111827;'
    case 'MainApp':
    default:
      return 'background:#22c55e;color:#052e16;'
  }
}

export function logAppEntranceMode(
  mode: AppEntranceMode,
  details?: LogDetails,
  options?: {
    onceKey?: string
    force?: boolean
  }
): void {
  if (!options?.force && !shouldLogEntrance()) return

  const onceKey = options?.onceKey ? `entrance:${options.onceKey}` : undefined
  if (onceKey && printedOnceKeys.has(onceKey)) return
  if (onceKey) printedOnceKeys.add(onceKey)

  const tagStyle = [
    'background:#111827;color:#fff;',
    'padding:2px 8px;',
    'border-radius:8px 0 0 8px;',
    'font-weight:700;',
    'letter-spacing:0.2px;'
  ].join('')

  const modeStyle = [
    getModeStyle(mode),
    'padding:2px 8px;',
    'border-radius:0 8px 8px 0;',
    'font-weight:700;'
  ].join('')

  console.groupCollapsed(`%cAppEntrance%c ${mode} Mode`, tagStyle, modeStyle)
  if (details && Object.keys(details).length > 0) {
    console.table(details)
  }
  console.groupEnd()
}
