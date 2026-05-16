import type { TouchApp } from './touch-app'

let currentTouchApp: TouchApp | null = null

export function setCurrentTouchApp(touchApp: TouchApp): void {
  currentTouchApp = touchApp
}

export function getCurrentTouchApp(): TouchApp | null {
  return currentTouchApp
}

export function requireCurrentTouchApp(site: string): TouchApp {
  if (!currentTouchApp) {
    throw new Error(`[MainRuntimeState] Touch app is not initialized at ${site}`)
  }
  return currentTouchApp
}
