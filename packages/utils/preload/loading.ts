export const PRELOAD_LOADING_CHANNEL = '@talex-touch/preload'

export type LoadingMode = 'classic' | 'progress' | 'debug'

export type LoadingState = 'start' | 'finish'

export type LoadingEvent =
  | { type: 'mode'; mode: LoadingMode }
  | { type: 'message'; message: string }
  | { type: 'progress'; delta?: number; reset?: boolean }
  | { type: 'state'; state: LoadingState }

export interface PreloadAPI {
  sendPreloadEvent(event: LoadingEvent): void
}
