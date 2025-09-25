export const PRELOAD_LOADING_CHANNEL = '@talex-touch/preload'

export type LoadingMode = 'classic' | 'progress' | 'debug'

export type LoadingEvent =
  | { type: 'mode'; mode: LoadingMode }
  | { type: 'message'; message: string }
  | { type: 'progress'; delta?: number; reset?: boolean }
  | { type: 'state'; state: 'start' | 'finish' }

export interface PreloadAPI {
  sendPreloadEvent(event: LoadingEvent): void
}
