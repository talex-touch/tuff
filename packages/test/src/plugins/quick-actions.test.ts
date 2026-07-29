import fs from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule } from './plugin-loader'

const quickActionsUrl = new URL('../../../../plugins/touch-quick-actions/index.js', import.meta.url)
const source = fs.readFileSync(quickActionsUrl, 'utf8')

class FakeBuilder {
  item: Record<string, unknown>
  basic: Record<string, unknown> = {}

  constructor(id: string) {
    this.item = { id }
  }

  setSource(type: string, id: string, name: string) {
    this.item.source = { type, id, name }
    return this
  }

  setTitle(title: string) {
    this.basic.title = title
    return this
  }

  setSubtitle(subtitle: string) {
    this.basic.subtitle = subtitle
    return this
  }

  setIcon(icon: unknown) {
    this.basic.icon = icon
    return this
  }

  setMeta(meta: Record<string, unknown>) {
    this.item.meta = meta
    return this
  }

  createAndAddAction(id: string, type: string, label: string, payload: unknown) {
    this.item.actions = [{ id, type, label, payload }]
    return this
  }

  build() {
    return { ...this.item, render: { mode: 'default', basic: this.basic } }
  }
}

interface QuickActionsPrelude {
  onInit: () => Promise<void>
  onFeatureTriggered: (featureId: string, query: unknown) => Promise<unknown>
  onItemAction: (item: Record<string, unknown>, context?: Record<string, unknown>) => Promise<unknown>
  onDestroy: () => void
}

function harness(systemResult: Record<string, unknown> = { actionId: 'lock-screen', status: 'started' }) {
  const items: Array<Record<string, unknown>> = []
  const features: Array<Record<string, unknown>> = []
  const systemCalls: string[] = []
  const module = loadPluginModule<QuickActionsPrelude>(
    quickActionsUrl,
    createPluginGlobals({
      platform: { platform: 'darwin', arch: 'arm64' },
      TuffItemBuilder: FakeBuilder,
      features: {
        async addFeature(feature: Record<string, unknown>) {
          features.push(feature)
          return true
        },
      },
      system: {
        async runAction(actionId: string) {
          systemCalls.push(actionId)
          return systemResult
        },
      },
      plugin: {
        feature: {
          async clearItems() {
            items.length = 0
          },
          async pushItems(next: Array<Record<string, unknown>>) {
            items.push(...next)
          },
        },
      },
    }),
  )
  return { features, items, module, systemCalls }
}

function actionItem(items: Array<Record<string, unknown>>, actionId: string) {
  return items.find(item =>
    (item.actions as Array<{ payload?: { actionId?: string } }> | undefined)?.some(
      action => action.payload?.actionId === actionId,
    ),
  )
}

describe('quick actions isolated Prelude', () => {
  it('contains no direct privileged or test-only child surface', () => {
    for (const pattern of [
      /\b__test\b/,
      /\brequire\s*\(/,
      /\bfetch\s*\(/,
      /(?:^|[^.\w])process\s*(?:\.|\[)/m,
      /\bnode:(?:fs|child_process|sqlite|worker_threads)\b/,
      /\bdialog\b/,
      /\b(?:command|executable|args|cwd|env|url|script)\s*:/,
    ]) {
      expect(source).not.toMatch(pattern)
    }
  })

  it('awaits dynamic feature registration with display metadata only', async () => {
    const state = harness()

    await state.module.onInit()

    expect(state.features).toHaveLength(8)
    expect(state.features.map(feature => feature.id)).toContain('quick-action-lock-screen')
    expect(state.features[0]?.platform).toEqual({
      win: { enable: false, arch: [], os: [] },
      darwin: { enable: true, arch: [], os: [] },
      linux: { enable: false, arch: [], os: [] },
    })
    expect(
      state.features.every(
        feature =>
          !Object.hasOwn(feature, 'command')
          && !Object.hasOwn(feature, 'executable')
          && !Object.hasOwn(feature, 'args')
          && !Object.hasOwn(feature, 'cwd')
          && !Object.hasOwn(feature, 'env'),
      ),
    ).toBe(true)
  })

  it('publishes bounded item actions and invokes only the selected fixed ID', async () => {
    const state = harness()
    await state.module.onFeatureTriggered('quick-actions', { text: '锁屏' })
    const item = actionItem(state.items, 'lock-screen')
    expect(item).toBeTruthy()

    await expect(state.module.onItemAction(item!, { actionId: 'run-action' })).resolves.toMatchObject({
      status: 'started',
      success: true,
    })
    expect(state.systemCalls).toEqual(['lock-screen'])
    expect(JSON.stringify(state.items)).not.toContain('command')
  })

  it('preserves main-owned confirmation denial as a stable blocked result', async () => {
    const state = harness({
      actionId: 'shutdown',
      status: 'blocked',
      reason: 'confirmation-denied',
    })

    await expect(state.module.onFeatureTriggered('quick-action-shutdown', { text: '' })).resolves.toMatchObject({
      status: 'blocked',
      reason: 'confirmation-denied',
      success: false,
    })
    expect(state.systemCalls).toEqual(['shutdown'])
  })

  it('redacts capability failures and never attempts a generic command fallback', async () => {
    const system = { runAction: vi.fn(async () => Promise.reject(new Error('/private/path'))) }
    const state = harness()
    const isolated = loadPluginModule<QuickActionsPrelude>(
      quickActionsUrl,
      createPluginGlobals({
        platform: { platform: 'darwin', arch: 'arm64' },
        TuffItemBuilder: FakeBuilder,
        features: { addFeature: async () => true },
        system,
        plugin: { feature: { clearItems: async () => undefined, pushItems: async () => undefined } },
      }),
    )

    await expect(isolated.onFeatureTriggered('quick-action-lock-screen', { text: '' })).resolves.toMatchObject({
      status: 'failed',
      reason: 'system-action-failed',
      message: '系统动作执行失败',
    })
    expect(system.runAction).toHaveBeenCalledExactlyOnceWith('lock-screen')
    expect(JSON.stringify(state)).not.toContain('/private/path')
  })
})
