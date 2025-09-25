import type { LoadingEvent, LoadingMode } from '../../../../shared/preload-loading'

function getApi() {
  if (typeof window === 'undefined') return null
  return window.api ?? null
}

export function sendPreloadEvent(event: LoadingEvent): void {
  const api = getApi()
  api?.sendPreloadEvent(event)
}

export function preloadLog(message: string): void {
  sendPreloadEvent({ type: 'message', message })
}

export function preloadProgress(delta = 0.05): void {
  sendPreloadEvent({ type: 'progress', delta })
}

export function preloadResetProgress(): void {
  sendPreloadEvent({ type: 'progress', reset: true })
}

export function preloadSetMode(mode: LoadingMode): void {
  sendPreloadEvent({ type: 'mode', mode })
}

export function preloadState(state: 'start' | 'finish'): void {
  sendPreloadEvent({ type: 'state', state })
}

export function preloadDebugStep(message: string, delta = 0.08): void {
  preloadLog(message)
  preloadProgress(delta)
}

export function preloadRemoveOverlay(): void {
  if (typeof window === 'undefined') return
  window.postMessage({ payload: 'removeLoading' }, '*')
}
