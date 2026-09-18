export enum ShortcutType {
  MAIN = 'main',
  RENDERER = 'renderer',
  TRIGGER = 'trigger',
  /**
   * A binding the *user* put on one plugin feature from the feature manager, as opposed to
   * `RENDERER`, which a plugin registers for itself from its own code.
   *
   * The distinction is not cosmetic: a `RENDERER` trigger only notifies the plugin, so it does
   * nothing at all unless that plugin wrote a listener for it. A `FEATURE` binding runs the
   * feature through the host's own execution path — the same one Enter uses in CoreBox — so it
   * works for every installed feature without the plugin participating.
   */
  FEATURE = 'feature',
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
  /** `FEATURE` bindings only: the feature this accelerator runs, within `author`'s plugin. */
  featureId?: string
}

export interface Shortcut {
  id: string
  accelerator: string
  type: ShortcutType
  meta: ShortcutMeta
}

export type ShortcutSetting = Shortcut[]

export const shortcutSettingOriginData: ShortcutSetting = []
