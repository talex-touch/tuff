import type { RendererWindowMode, WindowRole } from '../renderer/window-role'
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

  /**
   * The window's role as parsed from `process.argv` in the preload.
   *
   * The renderer cannot parse this itself: `contextIsolation` and `sandbox` are on for every
   * window, so its main world has no `process`, and `useArgMapper` there resolved argv to `[]` and
   * cached the empty result — leaving `isMainWindow()` permanently false and the update prompt
   * unreachable. The preload already parses the role for `windowMode`; carrying it through is what
   * gives the renderer a source at all.
   *
   * Only the validated `WindowRole` crosses the bridge, never raw argv.
   */
  role: WindowRole
}

export interface PreloadAPI {
  sendPreloadEvent: (event: LoadingEvent) => void
  getStartupContext: () => Promise<StartupContext>
  getStartupContextSnapshot: () => StartupContext | null
  getVisibleEvidenceConfig?: () => {
    authLoginTimeoutMs?: number
  }
}
