import type { RendererWindowMode } from '../renderer/window-role'
import type { StartupInfo } from '../types/startup-info'

export const PRELOAD_LOADING_CHANNEL = '@talex-touch/preload'

export type LoadingMode = 'classic' | 'progress' | 'debug'

export type LoadingState = 'start' | 'finish'

export type LoadingEvent
  = | { type: 'mode', mode: LoadingMode }
    | { type: 'message', message: string }
    | { type: 'progress', delta?: number, reset?: boolean }
    | { type: 'state', state: LoadingState }

export interface StartupContext {
  startupInfo: StartupInfo | null
  windowMode: RendererWindowMode
  metaOverlay: boolean
}

export interface PreloadAPI {
  sendPreloadEvent: (event: LoadingEvent) => void
  getStartupContext: () => Promise<StartupContext>
  getStartupContextSnapshot: () => StartupContext | null
}
