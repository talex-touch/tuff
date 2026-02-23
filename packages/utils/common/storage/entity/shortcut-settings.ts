export enum ShortcutType {
  MAIN = 'main',
  RENDERER = 'renderer',
  TRIGGER = 'trigger',
}

export enum ShortcutTriggerKind {
  MOUSE_RIGHT_LONG_PRESS = 'mouse:right-long-press',
}

export interface ShortcutMeta {
  creationTime: number
  modificationTime: number
  author: string
  description?: string
  enabled?: boolean
  triggerKind?: ShortcutTriggerKind | string
}

export interface Shortcut {
  id: string
  accelerator: string
  type: ShortcutType
  meta: ShortcutMeta
}

export type ShortcutSetting = Shortcut[]

export const shortcutSettingOriginData: ShortcutSetting = []
