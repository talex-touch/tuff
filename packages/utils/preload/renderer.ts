import type { LoadingEvent, LoadingMode, LoadingState, PreloadAPI, StartupContext } from './loading'
import { hasWindow } from '../env'

function getPreloadApi(): PreloadAPI | null {
  if (!hasWindow())
    return null
  return (window as any).api ?? null
}

export function sendPreloadEvent(event: LoadingEvent): void {
  const api = getPreloadApi()
  api?.sendPreloadEvent(event)
}

export async function getStartupContext(): Promise<StartupContext | null> {
  const api = getPreloadApi()
  if (!api?.getStartupContext) {
    return null
  }
  return await api.getStartupContext()
}

export function getStartupContextSnapshot(): StartupContext | null {
  const api = getPreloadApi()
  return api?.getStartupContextSnapshot?.() ?? null
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

export function preloadState(state: LoadingState): void {
  sendPreloadEvent({ type: 'state', state })
}

export function preloadDebugStep(message: string, delta = 0.08): void {
  preloadLog(message)
  preloadProgress(delta)
}

export function preloadRemoveOverlay(): void {
  if (!hasWindow())
    return
  window.postMessage({ payload: 'removeLoading' }, '*')
}
