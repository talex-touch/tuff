import { beforeEach, describe, expect, it, vi } from 'vitest'

const { settingsStore, mockDb } = vi.hoisted(() => {
  const settingsStore = new Map<string, string>()

  const mockDb = {
    prepare(sql: string) {
      let params: unknown[] = []
      return {
        bind(...args: unknown[]) {
          params = args
          return this
        },
        async first<T>() {
          if (/SELECT\s+value/i.test(sql)) {
            const key = String(params[0] || '')
            const value = settingsStore.get(key)
            if (value === undefined) {
              return null
            }
            return { value } as T
          }
          return null
        },
        async run() {
          if (/INSERT\s+INTO\s+pilot_admin_settings/i.test(sql)) {
            const key = String(params[0] || '')
            const value = String(params[1] || '')
            settingsStore.set(key, value)
          }
          return {}
        },
      }
    },
  }

  return {
    settingsStore,
    mockDb,
  }
})

vi.mock('../pilot-store', () => ({
  getPilotDatabase: vi.fn(() => mockDb as any),
  requirePilotDatabase: vi.fn(() => mockDb as any),
}))

function createEvent() {
  return {
    context: {},
  } as any
}

async function loadTarget() {
  return await import('../pilot-admin-routing-config')
}

describe('pilot-admin-routing-config', () => {
  beforeEach(() => {
    settingsStore.clear()
  })

  it('旧 routing policy 会从 legacy intent/image 字段派生 scenePolicies', async () => {
    const { getPilotAdminRoutingConfig } = await loadTarget()
    const event = createEvent()

    settingsStore.set('routing.policy', JSON.stringify({
      defaultModelId: 'quota-auto',
      defaultRouteComboId: 'default-auto',
      intentNanoModelId: 'intent-model',
      intentRouteComboId: 'intent-combo',
      imageGenerationModelId: 'image-model',
      imageRouteComboId: 'image-combo',
    }))

    const config = await getPilotAdminRoutingConfig(event)

    expect(config.routingPolicy.scenePolicies).toEqual([
      {
        scene: 'intent_classification',
        modelId: 'intent-model',
        routeComboId: 'intent-combo',
      },
      {
        scene: 'image_generate',
        modelId: 'image-model',
        routeComboId: 'image-combo',
      },
    ])
  })

  it('删除 system 模型后不会自动补回非 quota-auto 默认项', async () => {
    const { getPilotAdminRoutingConfig, updatePilotAdminRoutingConfig } = await loadTarget()
    const event = createEvent()

    const updated = await updatePilotAdminRoutingConfig(event, {
      modelCatalog: [
        {
          id: 'quota-auto',
          name: 'Quota Auto',
          source: 'system',
          enabled: true,
          visible: true,
          bindings: [],
        },
      ] as any,
    })

    const idsAfterUpdate = updated.modelCatalog.map(item => item.id)
    expect(idsAfterUpdate).toContain('quota-auto')
    expect(idsAfterUpdate).not.toContain('gpt-5.2')
    expect(idsAfterUpdate).not.toContain('gpt-5.4')
    expect(idsAfterUpdate).not.toContain('gemini-2.5-pro')
    expect(idsAfterUpdate).not.toContain('gemini-3-pro')
    expect(idsAfterUpdate).not.toContain('claudecode-opus-4.6')
    expect(idsAfterUpdate).not.toContain('claudecode-sonnet-4.6')

    const persisted = await getPilotAdminRoutingConfig(event)
    const idsAfterReload = persisted.modelCatalog.map(item => item.id)
    expect(idsAfterReload).toEqual(idsAfterUpdate)
  })

  it('当保存结果缺少 quota-auto 时会自动补回 quota-auto', async () => {
    const { updatePilotAdminRoutingConfig } = await loadTarget()
    const event = createEvent()

    const updated = await updatePilotAdminRoutingConfig(event, {
      modelCatalog: [
        {
          id: 'images-economy',
          name: 'Images Economy',
          source: 'manual',
          enabled: true,
          visible: true,
          bindings: [],
        },
      ] as any,
    })

    const ids = updated.modelCatalog.map(item => item.id)
    expect(ids).toContain('images-economy')
    expect(ids).toContain('quota-auto')
    expect(ids).not.toContain('gpt-5.2')
    expect(ids).not.toContain('gemini-2.5-pro')
  })

  it('保存 scenePolicies 时会同步回写 legacy intent/image 字段', async () => {
    const { updatePilotAdminRoutingConfig } = await loadTarget()
    const event = createEvent()

    const updated = await updatePilotAdminRoutingConfig(event, {
      modelCatalog: [
        {
          id: 'quota-auto',
          name: 'Quota Auto',
          source: 'system',
          enabled: true,
          visible: true,
          scenes: [],
          bindings: [],
        },
        {
          id: 'intent-model',
          name: 'Intent Model',
          source: 'manual',
          enabled: true,
          visible: true,
          scenes: ['intent_classification'],
          bindings: [],
        },
        {
          id: 'image-model',
          name: 'Image Model',
          source: 'manual',
          enabled: true,
          visible: true,
          scenes: ['image_generate'],
          bindings: [],
        },
      ] as any,
      routingPolicy: {
        scenePolicies: [
          {
            scene: 'intent_classification',
            modelId: 'intent-model',
            routeComboId: 'intent-combo',
          },
          {
            scene: 'image_generate',
            modelId: 'image-model',
            routeComboId: 'image-combo',
          },
        ],
      },
    })

    expect(updated.routingPolicy.intentNanoModelId).toBe('intent-model')
    expect(updated.routingPolicy.intentRouteComboId).toBe('intent-combo')
    expect(updated.routingPolicy.imageGenerationModelId).toBe('image-model')
    expect(updated.routingPolicy.imageRouteComboId).toBe('image-combo')
    expect(updated.routingPolicy.scenePolicies).toEqual([
      {
        scene: 'intent_classification',
        modelId: 'intent-model',
        routeComboId: 'intent-combo',
      },
      {
        scene: 'image_generate',
        modelId: 'image-model',
        routeComboId: 'image-combo',
      },
    ])

    const persisted = JSON.parse(settingsStore.get('routing.policy') || '{}')
    expect(persisted.intentNanoModelId).toBe('intent-model')
    expect(persisted.intentRouteComboId).toBe('intent-combo')
    expect(persisted.imageGenerationModelId).toBe('image-model')
    expect(persisted.imageRouteComboId).toBe('image-combo')
  })

  it('显式 scenePolicies 命中未打 scene 标签的模型组时会拒绝保存', async () => {
    const { updatePilotAdminRoutingConfig } = await loadTarget()
    const event = createEvent()

    await expect(updatePilotAdminRoutingConfig(event, {
      modelCatalog: [
        {
          id: 'quota-auto',
          name: 'Quota Auto',
          source: 'system',
          enabled: true,
          visible: true,
          scenes: [],
          bindings: [],
        },
        {
          id: 'chat-model',
          name: 'Chat Model',
          source: 'manual',
          enabled: true,
          visible: true,
          scenes: [],
          bindings: [],
        },
      ] as any,
      routingPolicy: {
        scenePolicies: [
          {
            scene: 'intent_classification',
            modelId: 'chat-model',
          },
        ],
      },
    })).rejects.toThrow('chat-model is missing required scene tag: intent_classification')
  })

  it('显式 scenePolicies 出现重复 scene 时会拒绝保存', async () => {
    const { updatePilotAdminRoutingConfig } = await loadTarget()
    const event = createEvent()

    await expect(updatePilotAdminRoutingConfig(event, {
      modelCatalog: [
        {
          id: 'quota-auto',
          name: 'Quota Auto',
          source: 'system',
          enabled: true,
          visible: true,
          scenes: [],
          bindings: [],
        },
        {
          id: 'intent-model',
          name: 'Intent Model',
          source: 'manual',
          enabled: true,
          visible: true,
          scenes: ['intent_classification'],
          bindings: [],
        },
      ] as any,
      routingPolicy: {
        scenePolicies: [
          {
            scene: 'intent_classification',
            modelId: 'intent-model',
            routeComboId: 'intent-combo-a',
          },
          {
            scene: 'intent-classification',
            modelId: 'intent-model',
            routeComboId: 'intent-combo-b',
          },
        ],
      },
    })).rejects.toThrow('Scene policy duplicated: intent_classification')
  })

  it('legacy intent/image patch 仍可覆盖已保存的 scenePolicies', async () => {
    const { updatePilotAdminRoutingConfig } = await loadTarget()
    const event = createEvent()

    await updatePilotAdminRoutingConfig(event, {
      modelCatalog: [
        {
          id: 'quota-auto',
          name: 'Quota Auto',
          source: 'system',
          enabled: true,
          visible: true,
          scenes: [],
          bindings: [],
        },
        {
          id: 'intent-model',
          name: 'Intent Model',
          source: 'manual',
          enabled: true,
          visible: true,
          scenes: ['intent_classification'],
          bindings: [],
        },
      ] as any,
      routingPolicy: {
        scenePolicies: [
          {
            scene: 'intent_classification',
            modelId: 'intent-model',
            routeComboId: 'intent-combo',
          },
        ],
      },
    })

    const updated = await updatePilotAdminRoutingConfig(event, {
      routingPolicy: {
        intentNanoModelId: 'legacy-intent-model',
        intentRouteComboId: 'legacy-intent-combo',
      },
    })

    expect(updated.routingPolicy.intentNanoModelId).toBe('legacy-intent-model')
    expect(updated.routingPolicy.intentRouteComboId).toBe('legacy-intent-combo')
    expect(updated.routingPolicy.scenePolicies).toEqual([
      {
        scene: 'intent_classification',
        modelId: 'legacy-intent-model',
        routeComboId: 'legacy-intent-combo',
      },
    ])
  })
})
