import type { ShortcutWithStatus } from '~/modules/channel/main/shortcon'

export type SaveState = 'saving' | 'success' | 'error'
export type CopyState = 'success' | 'error'

export type ShortcutRowBase = {
  shortcut: ShortcutWithStatus
  label: string
  desc: string
  sourceLabel: string
  statusText: string | null
  spotlightHint: string | null
  saveState?: SaveState
  saveText: string
  isEnabled: boolean
}

export type ShortcutRowView = ShortcutRowBase & {
  copyIcon: string
  copyState?: CopyState
}
