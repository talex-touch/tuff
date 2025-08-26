export enum ShortcutType {
  MAIN = 'main',
  RENDERER = 'renderer',
}

export interface ShortcutMeta {
  creationTime: number;
  modificationTime: number;
  author: string;
  description?: string;
}

export interface Shortcut {
  id: string;
  accelerator: string;
  type: ShortcutType;
  meta: ShortcutMeta;
}

export type ShortcutSetting = Shortcut[];

export const shortcutSettingOriginData: ShortcutSetting = [
  {
    id: 'core.system.summon',
    accelerator: 'CommandOrControl+Shift+A',
    type: ShortcutType.RENDERER,
    meta: {
      creationTime: Date.now(),
      modificationTime: Date.now(),
      author: 'system',
      description: 'Summon the main application window.'
    }
  }
];