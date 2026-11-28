import type { DivisionBoxConfig, DivisionBoxState, SessionMeta } from '@talex-touch/utils'
import type { WebContentsView } from 'electron'
import type { TouchPlugin } from '../../plugin/plugin'
import type { CoreBoxKeyEvent } from '../core-box/key-event'

export type BoxToolDetachedUIViewReleaseResult = 'released' | 'not-owned' | 'failed'

export interface BoxToolDetachedDivisionBoxSession {
  readonly sessionId: string
  readonly meta: SessionMeta
  getState(): DivisionBoxState
  attachExistingUIView(view: WebContentsView, plugin: TouchPlugin): Promise<void>
  releaseExistingUIView(view: WebContentsView): BoxToolDetachedUIViewReleaseResult
}

export interface BoxToolKeyRoutableDivisionBoxSession {
  forwardKeyEventToUIView(event: CoreBoxKeyEvent): boolean
}

export interface BoxToolSurfaceBridgePort {
  findSessionByWindowWebContentsId(
    webContentsId: number
  ): BoxToolKeyRoutableDivisionBoxSession | undefined
  createSessionWithoutUI(config: DivisionBoxConfig): Promise<BoxToolDetachedDivisionBoxSession>
  destroySession(sessionId: string): Promise<void>
}

let activePort: BoxToolSurfaceBridgePort | null = null

export function registerBoxToolSurfaceBridgePort(port: BoxToolSurfaceBridgePort): () => void {
  activePort = port
  return () => {
    if (activePort === port) {
      activePort = null
    }
  }
}

export function getBoxToolSurfaceBridgePort(): BoxToolSurfaceBridgePort | null {
  return activePort
}

export function resetBoxToolSurfaceBridgePort(): void {
  activePort = null
}
