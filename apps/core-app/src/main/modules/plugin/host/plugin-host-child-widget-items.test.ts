import { describe, expect, it, vi } from 'vitest'
import { loadPluginPrelude } from './plugin-host-child-runtime'

const snapshot = {
  platform: 'darwin',
  arch: 'arm64',
  locale: 'zh-CN',
  manifest: { name: 'touch-intelligence', activationGeneration: 1 }
}

function payload(scriptContent: string, widgetDeclared = true) {
  const capabilityManifest = [
    {
      id: 'feature.items.push',
      callbackLifetime: 'transient' as const,
      callbackFields: []
    },
    ...(widgetDeclared
      ? [
          {
            id: 'feature.items.widget.push',
            callbackLifetime: 'transient' as const,
            callbackFields: []
          }
        ]
      : [])
  ]
  return {
    scriptContent,
    snapshot,
    capabilityManifest,
    callbackLimits: { maxCallbacks: 64, maxConcurrentCallbacks: 16, maxResources: 32 }
  }
}

describe('plugin Prelude widget item facade', () => {
  it('builds and publishes one bounded custom widget item through its declared facade', async () => {
    const invokeCapability = vi.fn(async () => ({ ok: true }))
    const runtime = loadPluginPrelude(
      payload(`
        module.exports = {
          async onInit() {
            const item = new TuffItemBuilder('intelligence-widget')
              .setSource('plugin', 'plugin-features', 'touch-intelligence')
              .setTitle('Intelligence answer')
              .setSubtitle('Ready')
              .setDescription('Generated answer')
              .setAccessory('AI')
              .setIcon({ type: 'class', value: 'i-ri-sparkling-line' })
              .setCustomRender(
                'vue',
                'touch-intelligence::intelligence-ask',
                { answer: 'bounded answer', updatedAt: 1 }
              )
              .setActions([
                {
                  id: 'open-intelligence-settings',
                  type: 'navigate',
                  label: 'Settings',
                  payload: { path: '/intelligence/channels' },
                  primary: false
                }
              ])
              .setMeta({
                pluginName: 'touch-intelligence',
                featureId: 'intelligence-ask',
                status: 'ready',
                keepCoreBoxOpen: true,
                payload: { requestId: 'request-1' },
                intelligence: { status: 'ready' }
              })
              .build()
            await plugin.widget.pushItems([item])
            return {
              keys: Object.keys(plugin.widget),
              frozen: Object.isFrozen(plugin.widget) && Object.isFrozen(plugin.widget.pushItems),
              nullPrototype: Object.getPrototypeOf(plugin.widget) === null,
              item
            }
          }
        }
      `),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toMatchObject({
      keys: ['pushItems'],
      frozen: true,
      nullPrototype: true,
      item: {
        id: 'intelligence-widget',
        source: { type: 'plugin', id: 'plugin-features', name: 'touch-intelligence' },
        actions: [
          {
            id: 'open-intelligence-settings',
            type: 'navigate',
            label: 'Settings',
            payload: { path: '/intelligence/channels' },
            primary: false
          }
        ],
        meta: {
          pluginName: 'touch-intelligence',
          featureId: 'intelligence-ask',
          status: 'ready',
          keepCoreBoxOpen: true,
          payload: { requestId: 'request-1' },
          intelligence: { status: 'ready' }
        },
        render: {
          mode: 'custom',
          basic: {
            title: 'Intelligence answer',
            subtitle: 'Ready',
            description: 'Generated answer',
            accessory: 'AI',
            icon: { type: 'class', value: 'i-ri-sparkling-line' }
          },
          custom: {
            type: 'vue',
            content: 'touch-intelligence::intelligence-ask',
            data: { answer: 'bounded answer', updatedAt: 1 }
          }
        }
      }
    })
    expect(invokeCapability).toHaveBeenCalledExactlyOnceWith(
      'feature.items.widget.push',
      {
        scope: 'active-feature',
        items: [expect.objectContaining({ id: 'intelligence-widget' })]
      },
      expect.any(Number)
    )
    runtime.shutdown()
  })

  it('keeps the widget facade absent when the fixed capability is undeclared', async () => {
    const invokeCapability = vi.fn()
    const runtime = loadPluginPrelude(
      payload(
        `module.exports={onInit(){return {widget:typeof plugin.widget,setCustomRender:typeof TuffItemBuilder.prototype.setCustomRender}}}`,
        false
      ),
      { invokeCapability }
    )

    await expect(runtime.callLifecycle('onInit', []).promise).resolves.toEqual({
      widget: 'undefined',
      setCustomRender: 'undefined'
    })
    expect(invokeCapability).not.toHaveBeenCalled()
    runtime.shutdown()
  })
})
