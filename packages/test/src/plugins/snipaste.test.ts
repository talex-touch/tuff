import { describe, expect, it, vi } from 'vitest'
import { createPluginGlobals, loadPluginModule } from './plugin-loader'

const snipasteUrl = new URL('../../../../plugins/touch-snipaste/index.js', import.meta.url)

class TestItemBuilder {
  private readonly item: Record<string, unknown> & { actions: unknown[], meta: Record<string, unknown> }

  constructor(id: string) {
    this.item = { id, actions: [], meta: {} }
  }

  setSource(type: string, id: string, name: string): this {
    this.item.source = { type, id, name }
    return this
  }

  setTitle(title: string): this {
    this.item.title = title
    return this
  }

  setSubtitle(subtitle: string): this {
    this.item.subtitle = subtitle
    return this
  }

  setIcon(icon: unknown): this {
    this.item.icon = icon
    return this
  }

  setMeta(meta: Record<string, unknown>): this {
    this.item.meta = { ...this.item.meta, ...meta }
    return this
  }

  createAndAddAction(id: string, type: string, label: string, payload: unknown): this {
    this.item.actions.push({ id, type, label, payload })
    return this
  }

  build(): Record<string, unknown> {
    return this.item
  }
}

function harness(result: unknown = { actionId: 'snip', status: 'started' }) {
  const items: Array<Record<string, unknown>> = []
  const runAction = vi.fn(async () => result)
  const pluginModule = loadPluginModule<Record<string, (...args: unknown[]) => Promise<unknown>>>(
    snipasteUrl,
    createPluginGlobals({
      TuffItemBuilder: TestItemBuilder,
      platform: { platform: 'darwin', arch: 'arm64' },
      plugin: {
        feature: {
          clearItems: vi.fn(async () => {
            items.splice(0)
          }),
          pushItems: vi.fn(async (next: Array<Record<string, unknown>>) => {
            items.push(...next)
          }),
        },
        snipaste: { runAction },
      },
    }),
  )
  return { items, pluginModule, runAction }
}

describe('snipaste isolated Prelude boundary', () => {
  it('publishes only fixed actions and invokes the purpose-built facade', async () => {
    const fixture = harness()
    await fixture.pluginModule.onFeatureTriggered('snipaste-quick', { text: '截图' })
    const item = fixture.items.find(entry =>
      (entry.actions as Array<{ payload: { actionId: string } }>)[0]?.payload.actionId === 'snip',
    )

    await expect(
      fixture.pluginModule.onItemAction(item, { actionId: 'run-action' }),
    ).resolves.toMatchObject({ status: 'started', success: true })
    expect(fixture.runAction).toHaveBeenCalledExactlyOnceWith('snip')
  })

  it('keeps permission denial explicit without exposing host detail', async () => {
    const fixture = harness({
      actionId: 'snip',
      status: 'blocked',
      reason: 'permission-denied',
    })
    await fixture.pluginModule.onFeatureTriggered('snipaste-quick', { text: '截图' })

    const result = await fixture.pluginModule.onItemAction(fixture.items[0], {
      actionId: 'run-action',
    })

    expect(result).toMatchObject({
      status: 'blocked',
      success: false,
      reason: 'permission-denied',
      message: '缺少 system.shell 权限',
    })
    expect(JSON.stringify(result)).not.toMatch(/Applications|Program Files|private/)
  })

  it('rejects a forged custom action before the host capability', async () => {
    const fixture = harness()
    const result = await fixture.pluginModule.onItemAction(
      {
        meta: { defaultAction: 'snipaste-action' },
        actions: [{ id: 'run-action', payload: { actionId: 'custom-command' } }],
      },
      { actionId: 'run-action' },
    )

    expect(result).toMatchObject({ status: 'blocked', reason: 'invalid-action' })
    expect(fixture.runAction).not.toHaveBeenCalled()
  })
})
