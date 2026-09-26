import type { TuffItem } from '@talex-touch/utils'
import type { MetaAction } from '@talex-touch/utils/transport/events/types/meta-overlay'
import type { ShortcutChordEvent } from '~/modules/shortcuts/shortcut-chord'
import { describe, expect, it } from 'vitest'
import { COREBOX_PRIMARY_ACTION_ID } from '../../../../../shared/events/corebox-scenes'
import type { MetaActionModel } from './meta-action-model'
import {
  buildMetaActionModel,
  buildMetaShowRequest,
  estimateMetaActionPanelHeight,
  HOST_ACTION_CHORDS,
  isChordTakenByHost,
  metaActionShortcutLabels,
  resolveMetaActionShortcut
} from './meta-action-model'

const FILE_ITEM = {
  id: '/Users/me/report.pdf',
  kind: 'file',
  source: { type: 'file', id: 'file-provider', name: 'Files' },
  render: { mode: 'default', basic: { title: 'report.pdf', subtitle: '/Users/me/report.pdf' } },
  // The action list `files/utils.ts` attaches, labels as the main process writes them.
  actions: [
    { id: 'open-file', type: 'open', label: 'Open', primary: true, payload: { path: '/x' } },
    { id: 'open-folder', type: 'open', label: 'Open Folder', payload: { path: '/Users/me' } },
    { id: 'file-copy-path', type: 'copy', label: 'Copy Path', payload: { text: '/x' } },
    { id: 'file-copy-shell-path', type: 'copy', label: 'Copy Shell Path', payload: { text: '/x' } },
    { id: 'file-copy-url', type: 'copy', label: 'Copy File URL', payload: { text: 'file:///x' } }
  ],
  meta: { file: { path: '/Users/me/report.pdf' } }
} as TuffItem

const APP_ITEM = {
  id: 'com.apple.Safari',
  kind: 'app',
  source: { type: 'application', id: 'app-provider', name: 'Applications' },
  render: { mode: 'default', basic: { title: 'Safari' } },
  actions: [{ id: 'open-app', type: 'open', label: 'Open', primary: true, payload: {} }],
  meta: { app: { path: '/Applications/Safari.app' } }
} as TuffItem

const CLIPBOARD_ITEM = {
  id: 'clipboard-42',
  kind: 'text',
  source: { id: 'clipboard-history', type: 'history', name: 'Clipboard History' },
  render: { mode: 'default', basic: { title: 'hello world' } },
  actions: [
    { id: 'paste', type: 'execute', label: 'Paste', shortcut: 'Enter' },
    { id: 'copy', type: 'copy', label: 'Copy', shortcut: 'CmdOrCtrl+C' }
  ],
  meta: { raw: { id: 42 } }
} as TuffItem

const PREVIEW_ITEM = {
  id: 'preview-1',
  kind: 'preview',
  source: { type: 'system', id: 'preview-provider', name: 'Preview' },
  render: { mode: 'default', basic: { title: '2 + 2 = 4' } },
  actions: [
    {
      id: 'preview-copy-primary',
      type: 'copy',
      label: '复制结果',
      icon: { type: 'class', value: 'i-ri-file-copy-line' },
      payload: { text: '4' }
    }
  ]
} as TuffItem

const DESTINATION_ITEM = {
  id: 'app-destination:settings-general',
  kind: 'command',
  source: { type: 'system', id: 'app-destination', name: 'Destinations' },
  render: { mode: 'default', basic: { title: '通用' } },
  actions: [
    {
      id: 'open-destination:settings-general',
      type: 'execute',
      label: '通用',
      primary: true
    },
    {
      id: 'open-destination:settings-appearance',
      type: 'execute',
      label: '外观',
      group: '常用设置'
    },
    {
      id: 'open-destination:settings-shortcuts',
      type: 'execute',
      label: '快捷键',
      group: '常用设置'
    }
  ]
} as TuffItem

const PLUGIN_ITEM = {
  id: 'touch-translation/translate',
  kind: 'feature',
  source: { type: 'plugin', id: 'plugin-features', name: 'Plugins' },
  render: { mode: 'default', basic: { title: '翻译' } },
  actions: [
    {
      id: 'copy',
      type: 'copy',
      label: 'Copy Translation',
      icon: { type: 'class', value: 'i-ri-translate' },
      shortcut: '⌘⇧S'
    }
  ],
  meta: { pluginName: 'touch-translation' }
} as TuffItem

function build(item: TuffItem, platform: 'darwin' | 'win32' | 'linux' = 'darwin') {
  return buildMetaActionModel(buildMetaShowRequest(item), { platform })
}

function labelOf(model: MetaActionModel, id: string): unknown {
  return model.rows.find((row) => row.id === id)?.label
}

function press(
  code: string,
  modifiers: Partial<Omit<ShortcutChordEvent, 'code'>> = {},
  altGraph = false
): ShortcutChordEvent & { getModifierState: (key: string) => boolean } {
  return {
    code,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
    getModifierState: (key: string) => key === 'AltGraph' && altGraph
  }
}

describe('buildMetaActionModel — one row per action', () => {
  it('merges the provider primary into the ↵ row, so a file offers "Open" once', () => {
    const model = build(FILE_ITEM)

    expect(model.rows.map((row) => row.id)).toEqual([
      COREBOX_PRIMARY_ACTION_ID,
      'reveal-in-finder',
      'open-folder',
      'file-copy-path',
      'copy-title',
      'file-copy-shell-path',
      'file-copy-url',
      'toggle-pin',
      'flow-transfer'
    ])
    // The provider's "Open" is not a second row: it merged, and the merged row runs the main
    // list's Enter path (which truly opens), under the provider's label in the interface language.
    expect(model.rows.some((row) => row.id === 'open-file')).toBe(false)
    expect(model.rows[0]).toMatchObject({
      role: 'primary',
      label: { key: 'corebox.actions.open' },
      icon: { glyph: 'external' }
    })
  })

  it('names the reveal after the platform file manager, and never "Open"', () => {
    expect(labelOf(build(FILE_ITEM, 'darwin'), 'reveal-in-finder')).toEqual({
      key: 'corebox.actions.revealInFinder'
    })
    expect(labelOf(build(FILE_ITEM, 'win32'), 'reveal-in-finder')).toEqual({
      key: 'corebox.actions.revealInExplorer'
    })
    expect(labelOf(build(FILE_ITEM, 'linux'), 'reveal-in-finder')).toEqual({
      key: 'corebox.actions.revealInFileManager'
    })
  })

  it('merges a clipboard "Paste" that claims Enter, and keeps its Copy as the secondary', () => {
    const model = build(CLIPBOARD_ITEM)

    expect(model.rows.map((row) => row.id)).toEqual([
      COREBOX_PRIMARY_ACTION_ID,
      'copy',
      'copy-title',
      'toggle-pin',
      'flow-transfer'
    ])
    expect(model.rows[0]!.label).toEqual({ key: 'corebox.actions.paste' })
    // Raycast's clipboard history: ↵ pastes, ⌘↵ copies.
    expect(model.rows.find((row) => row.role === 'secondary')?.id).toBe('copy')
  })

  it('merges the preview copy action, so a calculator result shows one "复制结果"', () => {
    const model = build(PREVIEW_ITEM)
    const copyResultRows = model.rows.filter(
      (row) => 'key' in row.label && row.label.key === 'corebox.actions.copyResult'
    )

    expect(copyResultRows).toHaveLength(1)
    expect(copyResultRows[0]!.id).toBe(COREBOX_PRIMARY_ACTION_ID)
    expect(model.rows.some((row) => row.id === 'preview-copy-primary')).toBe(false)
  })

  it('does not repeat the item title as the primary label', () => {
    const model = build(DESTINATION_ITEM)

    // The panel header already reads "通用"; the ↵ row says what it does.
    expect(model.rows[0]!.label).toEqual({ key: 'corebox.actions.open' })
  })

  it('keeps a provider group as its own titled section, in its slot', () => {
    const model = build(DESTINATION_ITEM)

    expect(model.sections.map((section) => section.key)).toEqual([
      'primary',
      'group:open:常用设置',
      'copy',
      'organize',
      'flow'
    ])
    expect(model.sections[1]!.title).toEqual({ text: '常用设置' })
    // A settings list is not an alternate way to run this item, so it has no ⌘↵.
    expect(model.rows.some((row) => row.role === 'secondary')).toBe(false)
  })
})

describe('buildMetaActionModel — groups, labels and icons', () => {
  it('orders the groups primary / open / copy / organize / flow / plugin', () => {
    const request = {
      ...buildMetaShowRequest(APP_ITEM),
      pluginActions: [
        {
          id: 'share-to-notes',
          render: { basic: { title: 'Share to Notes' } },
          priority: 100
        } satisfies MetaAction
      ]
    }
    const model = buildMetaActionModel(request, { platform: 'darwin' })

    expect(model.sections.map((section) => section.slot)).toEqual([
      'primary',
      'open',
      'copy',
      'organize',
      'flow',
      'plugin'
    ])
    expect(model.sections.map((section) => section.title)).toEqual([
      null,
      { key: 'corebox.actions.groups.open' },
      { key: 'corebox.actions.groups.copy' },
      { key: 'corebox.actions.groups.organize' },
      { key: 'corebox.actions.groups.flow' },
      { key: 'corebox.actions.groups.plugin' }
    ])
  })

  it('shows host provider labels in the interface language and plugin labels as written', () => {
    const file = build(FILE_ITEM)
    expect(labelOf(file, 'file-copy-path')).toEqual({ key: 'corebox.actions.copyPath' })
    expect(labelOf(file, 'open-folder')).toEqual({ key: 'corebox.actions.openFolder' })

    const plugin = build(PLUGIN_ITEM)
    // Same generic id as the clipboard's Copy, but a plugin wrote this one.
    expect(labelOf(plugin, 'copy')).toEqual({ text: 'Copy Translation' })
    expect(plugin.rows.find((row) => row.id === 'copy')?.icon).toEqual({
      icon: { type: 'class', value: 'i-ri-translate' }
    })
  })

  it('gives every host row a fixed glyph instead of an empty placeholder', () => {
    for (const item of [FILE_ITEM, APP_ITEM, CLIPBOARD_ITEM, PREVIEW_ITEM, DESTINATION_ITEM]) {
      for (const row of build(item).rows) {
        expect(row.icon, `${item.id} → ${row.id}`).toHaveProperty('glyph')
      }
    }
  })

  it('offers a reveal only where there is a path to reveal', () => {
    const pathless = { ...APP_ITEM, meta: {} } as TuffItem

    expect(build(pathless).rows.some((row) => row.id === 'reveal-in-finder')).toBe(false)
  })

  it('offers no reveal for a Windows Store app, whose shell:AppsFolder id is not a file', () => {
    const storeApp = {
      ...APP_ITEM,
      meta: { app: { path: 'shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App' } }
    } as TuffItem
    const model = build(storeApp, 'win32')

    expect(model.rows.some((row) => row.id === 'reveal-in-finder')).toBe(false)
    // So Ctrl+↵ is not bound to an action that can only fail; it stays the Enter path.
    expect(model.rows.some((row) => row.role === 'secondary')).toBe(false)
    // Real paths on every platform still reveal.
    for (const path of [
      'C:\\Program Files\\App\\app.exe',
      '\\\\server\\share\\a.txt',
      '/usr/share/applications/a.desktop'
    ]) {
      const item = { ...APP_ITEM, meta: { app: { path } } } as TuffItem
      expect(
        build(item, 'win32').rows.some((row) => row.id === 'reveal-in-finder'),
        path
      ).toBe(true)
    }
  })

  it('lists only the plugin actions that are enabled, after the item’s own', () => {
    const request = {
      ...buildMetaShowRequest(APP_ITEM),
      pluginActions: [
        { id: 'plugin-on', render: { basic: { title: 'On' } }, priority: 100 },
        { id: 'plugin-off', render: { basic: { title: 'Off' }, disabled: true }, priority: 200 }
      ] satisfies MetaAction[]
    }
    const model = buildMetaActionModel(request, { platform: 'darwin' })

    expect(model.rows.at(-1)?.id).toBe('plugin-on')
    expect(model.rows.some((row) => row.id === 'plugin-off')).toBe(false)
  })
})

describe('buildMetaActionModel — keys', () => {
  it('binds the Raycast-aligned chords to the host actions', () => {
    const chords = Object.fromEntries(build(FILE_ITEM).rows.map((row) => [row.id, row.chord]))

    expect(chords['file-copy-path']).toEqual({ code: 'KeyC', shift: true })
    expect(chords['copy-title']).toEqual({ code: 'KeyC', alt: true })
    expect(chords['reveal-in-finder']).toEqual({ code: 'KeyO' })
    expect(chords['toggle-pin']).toEqual({ code: 'Period' })
    expect(chords['flow-transfer']).toEqual({ code: 'KeyD', shift: true })
  })

  /**
   * Ctrl+. is the punctuation-width toggle of Microsoft Pinyin, Sogou and fcitx. With one of them
   * on, the IME takes the key and the page never sees it, so off macOS pin is Ctrl+Shift+. — and
   * the panel's badge and the result-list key are the same row's chord, so they move together.
   */
  it('pins with ⌘. on macOS and Ctrl+Shift+. on Windows and Linux, badge and key alike', () => {
    const pinRow = (model: MetaActionModel) => model.rows.find((row) => row.id === 'toggle-pin')!

    const mac = build(FILE_ITEM, 'darwin')
    expect(pinRow(mac).chord).toEqual({ code: 'Period' })
    expect(metaActionShortcutLabels(pinRow(mac), true)).toEqual(['⌘.'])
    expect(
      resolveMetaActionShortcut(mac, press('Period', { metaKey: true }), {
        isMac: true,
        scope: 'list'
      })?.id
    ).toBe('toggle-pin')
    expect(
      resolveMetaActionShortcut(mac, press('Period', { metaKey: true, shiftKey: true }), {
        isMac: true,
        scope: 'list'
      })
    ).toBeNull()

    for (const platform of ['win32', 'linux'] as const) {
      const model = build(FILE_ITEM, platform)
      expect(pinRow(model).chord, platform).toEqual({ code: 'Period', shift: true })
      expect(metaActionShortcutLabels(pinRow(model), false), platform).toEqual(['Ctrl+Shift+.'])
      for (const scope of ['list', 'panel'] as const) {
        expect(
          resolveMetaActionShortcut(model, press('Period', { ctrlKey: true, shiftKey: true }), {
            isMac: false,
            scope
          })?.id,
          `${platform} ${scope}`
        ).toBe('toggle-pin')
        // Not bound, so not swallowed either: the key stays the IME's.
        expect(
          resolveMetaActionShortcut(model, press('Period', { ctrlKey: true }), {
            isMac: false,
            scope
          }),
          `${platform} ${scope}`
        ).toBeNull()
      }
    }
  })

  it('keeps both pin chords from declared shortcuts, on every platform', () => {
    expect(isChordTakenByHost({ code: 'Period' })).toBe(true)
    expect(isChordTakenByHost({ code: 'Period', shift: true })).toBe(true)

    for (const platform of ['darwin', 'win32'] as const) {
      const request = {
        ...buildMetaShowRequest(APP_ITEM),
        pluginActions: [
          { id: 'plugin-dot', render: { basic: { title: 'Dot' }, shortcut: '⌘.' } },
          { id: 'plugin-shift-dot', render: { basic: { title: 'Shift dot' }, shortcut: '⌘⇧.' } }
        ] satisfies MetaAction[]
      }
      const chords = Object.fromEntries(
        buildMetaActionModel(request, { platform }).rows.map((row) => [row.id, row.chord])
      )
      expect(chords['plugin-dot'], platform).toBeNull()
      expect(chords['plugin-shift-dot'], platform).toBeNull()
    }
  })

  it('makes the reveal the ⌘↵ secondary for files and apps, badge included', () => {
    for (const item of [FILE_ITEM, APP_ITEM]) {
      const secondary = build(item).rows.find((row) => row.role === 'secondary')
      expect(secondary?.id).toBe('reveal-in-finder')
      expect(metaActionShortcutLabels(secondary!, true)).toEqual(['⌘↵', '⌘O'])
      expect(metaActionShortcutLabels(secondary!, false)).toEqual(['Ctrl+↵', 'Ctrl+O'])
    }
  })

  it('leaves ⌘C to text editing: a declared CmdOrCtrl+C binds and shows nothing', () => {
    const copy = build(CLIPBOARD_ITEM).rows.find((row) => row.id === 'copy')!

    expect(copy.chord).toBeNull()
    expect(metaActionShortcutLabels(copy, true)).toEqual(['⌘↵'])
  })

  it('keeps a plugin chord that is free, and drops one that CoreBox or a host action owns', () => {
    const request = {
      ...buildMetaShowRequest(APP_ITEM),
      pluginActions: [
        { id: 'free', render: { basic: { title: 'Free' }, shortcut: '⌘⇧S' } },
        { id: 'panel-key', render: { basic: { title: 'K' }, shortcut: '⌘K' } },
        { id: 'select-all', render: { basic: { title: 'A' }, shortcut: '⌘A' } },
        { id: 'reveal-key', render: { basic: { title: 'O' }, shortcut: 'Ctrl+O' } },
        { id: 'copy-path-key', render: { basic: { title: 'P' }, shortcut: 'CmdOrCtrl+Shift+C' } },
        { id: 'duplicate', render: { basic: { title: 'Dup' }, shortcut: '⌘⇧S' } }
      ] satisfies MetaAction[]
    }
    const chords = Object.fromEntries(
      buildMetaActionModel(request, { platform: 'darwin' }).rows.map((row) => [row.id, row.chord])
    )

    expect(chords.free).toEqual({ code: 'KeyS', shift: true })
    expect(chords['panel-key']).toBeNull()
    expect(chords['select-all']).toBeNull()
    expect(chords['reveal-key']).toBeNull()
    // Reserved even on an app, which has no copy-path row: one key, one meaning.
    expect(chords['copy-path-key']).toBeNull()
    // First registration wins a contested chord.
    expect(chords.duplicate).toBeNull()
  })

  it('gives a chord an item action declared to the item action, not to a plugin', () => {
    const request = {
      ...buildMetaShowRequest(PLUGIN_ITEM),
      pluginActions: [{ id: 'plugin-save', render: { basic: { title: 'Save' }, shortcut: '⌘⇧S' } }]
    }
    const model = buildMetaActionModel(request, { platform: 'darwin' })
    const chords = Object.fromEntries(model.rows.map((row) => [row.id, row.chord]))

    expect(chords.copy).toEqual({ code: 'KeyS', shift: true })
    // Its badge would teach a key that runs the item's own action.
    expect(chords['plugin-save']).toBeNull()
    expect(
      resolveMetaActionShortcut(model, press('KeyS', { metaKey: true, shiftKey: true }), {
        isMac: true,
        scope: 'panel'
      })?.id
    ).toBe('copy')
  })

  it('owns no chord CoreBox already binds (⌘K, ⌘D, ⌘1–0, editing keys, ⌘↵)', () => {
    const existing = [
      { code: 'KeyK' },
      { code: 'KeyD' },
      ...Array.from({ length: 10 }, (_, digit) => ({ code: `Digit${digit}` })),
      { code: 'KeyA' },
      { code: 'KeyC' },
      { code: 'KeyV' },
      { code: 'KeyX' },
      { code: 'KeyZ' },
      { code: 'KeyY' },
      { code: 'Enter' },
      { code: 'ArrowLeft' },
      { code: 'ArrowRight' }
    ]
    const key = (chord: { code: string; shift?: boolean; alt?: boolean }) =>
      `${chord.code}:${Boolean(chord.shift)}:${Boolean(chord.alt)}`
    const hostKeys = HOST_ACTION_CHORDS.map(key)

    expect(new Set(hostKeys).size).toBe(hostKeys.length)
    for (const chord of existing) expect(hostKeys).not.toContain(key(chord))
    for (const chord of existing) expect(isChordTakenByHost(chord)).toBe(true)
  })
})

describe('resolveMetaActionShortcut', () => {
  const file = build(FILE_ITEM)

  it('matches the physical key with the platform command modifier', () => {
    expect(
      resolveMetaActionShortcut(file, press('KeyC', { metaKey: true, shiftKey: true }), {
        isMac: true,
        scope: 'list'
      })?.id
    ).toBe('file-copy-path')
    expect(
      resolveMetaActionShortcut(file, press('KeyC', { ctrlKey: true, altKey: true }), {
        isMac: false,
        scope: 'list'
      })?.id
    ).toBe('copy-title')
    // Ctrl on a Mac is not the command key.
    expect(
      resolveMetaActionShortcut(file, press('KeyO', { ctrlKey: true }), {
        isMac: true,
        scope: 'list'
      })
    ).toBeNull()
  })

  it('runs the secondary on Mod↵, and nothing when the item has none', () => {
    const enter = press('Enter', { metaKey: true })

    expect(resolveMetaActionShortcut(file, enter, { isMac: true, scope: 'list' })?.id).toBe(
      'reveal-in-finder'
    )
    expect(
      resolveMetaActionShortcut(build(PREVIEW_ITEM), enter, { isMac: true, scope: 'list' })
    ).toBeNull()
  })

  it('answers nothing for a key that does not apply to this item', () => {
    // An app has no path row to copy.
    expect(
      resolveMetaActionShortcut(build(APP_ITEM), press('KeyC', { metaKey: true, shiftKey: true }), {
        isMac: true,
        scope: 'list'
      })
    ).toBeNull()
  })

  it('never fires on AltGr, which types characters on Windows layouts', () => {
    expect(
      resolveMetaActionShortcut(file, press('KeyC', { ctrlKey: true, altKey: true }, true), {
        isMac: false,
        scope: 'panel'
      })
    ).toBeNull()
  })

  it('leaves plugin rows and CoreBox-bound chords to the panel', () => {
    const request = {
      ...buildMetaShowRequest(FILE_ITEM),
      pluginActions: [{ id: 'free', render: { basic: { title: 'Free' }, shortcut: '⌘⇧S' } }]
    }
    const model = buildMetaActionModel(request, { platform: 'darwin' })
    const pluginKey = press('KeyS', { metaKey: true, shiftKey: true })
    const flowKey = press('KeyD', { metaKey: true, shiftKey: true })

    expect(resolveMetaActionShortcut(model, pluginKey, { isMac: true, scope: 'panel' })?.id).toBe(
      'free'
    )
    expect(resolveMetaActionShortcut(model, pluginKey, { isMac: true, scope: 'list' })).toBeNull()
    expect(resolveMetaActionShortcut(model, flowKey, { isMac: true, scope: 'panel' })?.id).toBe(
      'flow-transfer'
    )
    // ⌘⇧D in the list already opens Flow through `corebox:flow-item`.
    expect(resolveMetaActionShortcut(model, flowKey, { isMac: true, scope: 'list' })).toBeNull()
  })
})

describe('estimateMetaActionPanelHeight', () => {
  it('counts rows, titled sections and gaps with the shared geometry', () => {
    // App: five rows in five sections, four of them titled.
    // 40 header + (6 + 5 × 32 + 4 × 24 + 4 × 4 + 6) list + 40 filter.
    expect(estimateMetaActionPanelHeight(build(APP_ITEM))).toBe(364)
  })

  it('caps a long action list at the panel maximum, where the list scrolls', () => {
    expect(estimateMetaActionPanelHeight(build(FILE_ITEM))).toBe(420)
  })
})
