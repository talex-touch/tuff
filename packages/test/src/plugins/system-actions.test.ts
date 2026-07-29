import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule } from './plugin-loader'

interface PluginAction {
  id: string
  type: string
  label: string
  payload?: Record<string, unknown>
}

interface PluginItem {
  id: string
  title?: string
  subtitle?: string
  meta?: Record<string, unknown>
  actions?: PluginAction[]
}

type SystemResult
  = | { actionId: string, status: 'started' }
    | { actionId: string, status: 'blocked', reason: string }
    | { actionId: string, status: 'failed', reason: string }

interface SystemActionsPrelude {
  onInit: () => Promise<void>
  onFeatureTriggered: (featureId: string, query: unknown) => Promise<boolean>
  onItemAction: (item: PluginItem, context?: { actionId?: string }) => Promise<Record<string, unknown>>
  onDestroy: () => Promise<void>
}

class FakeBuilder {
  private readonly item: PluginItem

  constructor(id: string) {
    this.item = { id }
  }

  setSource() {
    return this
  }

  setTitle(title: string) {
    this.item.title = title
    return this
  }

  setSubtitle(subtitle: string) {
    this.item.subtitle = subtitle
    return this
  }

  setIcon() {
    return this
  }

  setMeta(meta: Record<string, unknown>) {
    this.item.meta = meta
    return this
  }

  createAndAddAction(id: string, type: string, label: string, payload: Record<string, unknown>) {
    this.item.actions = [{ id, type, label, payload }]
    return this
  }

  build() {
    return this.item
  }
}

function createHarness(platform = 'darwin') {
  const state = {
    items: [] as PluginItem[],
    calls: [] as string[],
    events: [] as string[],
    result: { actionId: 'lock-screen', status: 'started' } as SystemResult,
  }
  const runAction = vi.fn(async (actionId: string) => {
    state.calls.push(actionId)
    return { ...state.result, actionId }
  })
  const module = loadPluginModule<SystemActionsPrelude>(
    new URL('../../../../plugins/touch-system-actions/index.js', import.meta.url),
    createPluginGlobals({
      TuffItemBuilder: FakeBuilder,
      platform: { platform, arch: 'arm64' },
      system: { runAction },
      plugin: {
        feature: {
          async clearItems() {
            state.events.push('clear:start')
            await Promise.resolve()
            state.items = []
            state.events.push('clear:end')
          },
          async pushItems(items: PluginItem[]) {
            state.events.push('push:start')
            await Promise.resolve()
            state.items = items
            state.events.push('push:end')
          },
        },
      },
    }),
  )
  return { module, runAction, state }
}

function itemForAction(items: PluginItem[], actionId: string): PluginItem {
  const item = items.find(entry => entry.actions?.some(action => action.payload?.actionId === actionId))
  if (!item)
    throw new Error(`Missing action item: ${actionId}`)
  return item
}

describe('isolated system actions Prelude', () => {
  it('contains no privileged, arbitrary-command, or test-only child surface', () => {
    const sourcePath = fileURLToPath(
      new URL('../../../../plugins/touch-system-actions/index.js', import.meta.url),
    )
    const source = readFileSync(sourcePath, 'utf8')
    const module = loadPluginModule<Record<string, unknown>>(
      new URL('../../../../plugins/touch-system-actions/index.js', import.meta.url),
      createPluginGlobals({
        TuffItemBuilder: FakeBuilder,
        platform: { platform: 'darwin', arch: 'arm64' },
        system: { runAction: async () => ({ status: 'started' }) },
      }),
    )

    for (const pattern of [
      /\b__test\b/,
      /\brequire\s*\(/,
      /\bfetch\s*\(/,
      /(?:^|[^.\w])process\s*(?:\.|\[)/m,
      /\bnode:(?:fs|child_process|sqlite|worker_threads)\b/,
      /\b(?:command|executable|args|cwd|env|url|script)\s*:/,
      /\bpinyin-pro\b/,
      /\bdialog\b/,
    ]) {
      expect(source).not.toMatch(pattern)
    }
    expect(Object.keys(module).sort()).toEqual([
      'onDestroy',
      'onFeatureTriggered',
      'onInit',
      'onItemAction',
    ])
  })

  it('initializes and awaits ordered feature publication with fixed Darwin actions', async () => {
    const harness = createHarness('darwin')

    await expect(harness.module.onInit()).resolves.toBeUndefined()
    await expect(
      harness.module.onFeatureTriggered('system-actions', { text: '' }),
    ).resolves.toBe(true)

    expect(harness.state.events).toEqual(['clear:start', 'clear:end', 'push:start', 'push:end'])
    const ids = harness.state.items.flatMap(item => item.actions?.map(action => action.payload?.actionId) ?? [])
    expect(ids).toEqual([
      'shutdown',
      'restart',
      'lock-screen',
      'volume-up',
      'volume-down',
      'mute-toggle',
      'brightness-up',
      'brightness-down',
      'open-main-window',
    ])
    expect(ids).not.toContain('mute')
    expect(JSON.stringify(harness.state.items)).not.toContain('command')
  })

  it('omits unsupported brightness actions on Windows', async () => {
    const harness = createHarness('win32')

    await harness.module.onFeatureTriggered('system-actions', { text: '亮度' })

    expect(harness.state.items).toHaveLength(1)
    expect(harness.state.items[0]?.title).toBe('没有匹配的系统操作')
    expect(harness.runAction).not.toHaveBeenCalled()
  })

  it('opens the main window through the fixed host action without local permission logic', async () => {
    const harness = createHarness('darwin')
    await harness.module.onFeatureTriggered('system-actions', { text: '主窗口' })
    const item = itemForAction(harness.state.items, 'open-main-window')

    await expect(
      harness.module.onItemAction(item, { actionId: 'run-action' }),
    ).resolves.toMatchObject({ externalAction: true, status: 'started', success: true })
    expect(harness.runAction).toHaveBeenCalledExactlyOnceWith('open-main-window')
  })

  it('passes only the fixed action ID when a forged item adds an arbitrary command', async () => {
    const harness = createHarness('darwin')
    await harness.module.onFeatureTriggered('system-actions', { text: '增加音量' })
    const item = itemForAction(harness.state.items, 'volume-up')
    Object.assign(item.actions?.[0]?.payload ?? {}, {
      command: 'rm -rf /',
      executable: '/bin/sh',
      args: ['-c', 'unsafe'],
    })

    await expect(harness.module.onItemAction(item)).resolves.toMatchObject({
      status: 'started',
      success: true,
    })
    expect(harness.runAction).toHaveBeenCalledExactlyOnceWith('volume-up')
  })

  it('blocks hostile action IDs locally and preserves main-owned permission denial', async () => {
    const harness = createHarness('darwin')
    const hostile: PluginItem = {
      id: 'hostile',
      meta: { defaultAction: 'system-actions' },
      actions: [
        {
          id: 'run-action',
          type: 'plugin',
          label: 'Hostile',
          payload: { actionId: 'custom-command' },
        },
      ],
    }

    await expect(harness.module.onItemAction(hostile)).resolves.toMatchObject({
      status: 'blocked',
      reason: 'invalid-action',
      success: false,
    })
    expect(harness.runAction).not.toHaveBeenCalled()

    await harness.module.onFeatureTriggered('system-actions', { text: '锁屏' })
    harness.state.result = {
      actionId: 'lock-screen',
      status: 'blocked',
      reason: 'permission-denied',
    }
    await expect(
      harness.module.onItemAction(itemForAction(harness.state.items, 'lock-screen')),
    ).resolves.toMatchObject({
      status: 'blocked',
      reason: 'permission-denied',
      success: false,
    })
  })

  it('destroys and re-enables with a fresh fixed host binding', async () => {
    const first = createHarness('darwin')
    await first.module.onInit()
    await first.module.onFeatureTriggered('system-actions', { text: '锁屏' })
    await first.module.onItemAction(itemForAction(first.state.items, 'lock-screen'))
    await expect(first.module.onDestroy()).resolves.toBeUndefined()

    const second = createHarness('darwin')
    await second.module.onInit()
    await second.module.onFeatureTriggered('system-actions', { text: '主窗口' })
    await second.module.onItemAction(itemForAction(second.state.items, 'open-main-window'))

    expect(first.state.calls).toEqual(['lock-screen'])
    expect(second.state.calls).toEqual(['open-main-window'])
  })
})
