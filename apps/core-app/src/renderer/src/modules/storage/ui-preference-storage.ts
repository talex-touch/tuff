import { hasWindow } from '@talex-touch/utils/env'
import { createRendererLogger } from '~/utils/renderer-log'

const uiPreferenceLog = createRendererLogger('UiPreferenceStorage')

export class UiPreferenceStorage {
  getJson<T>(key: string): T | null {
    if (!hasWindow()) return null

    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) return null
      return JSON.parse(raw) as T
    } catch (error) {
      uiPreferenceLog.warn('Failed to read UI preference', key, error)
      return null
    }
  }

  setJson(key: string, value: unknown): void {
    if (!hasWindow()) return

    try {
      window.localStorage.setItem(key, JSON.stringify(value))
    } catch (error) {
      uiPreferenceLog.warn('Failed to persist UI preference', key, error)
    }
  }

  remove(key: string): void {
    if (!hasWindow()) return

    try {
      window.localStorage.removeItem(key)
    } catch (error) {
      uiPreferenceLog.warn('Failed to remove UI preference', key, error)
    }
  }
}

export const uiPreferenceStorage = new UiPreferenceStorage()

export function useUiPreference(): UiPreferenceStorage {
  return uiPreferenceStorage
}
