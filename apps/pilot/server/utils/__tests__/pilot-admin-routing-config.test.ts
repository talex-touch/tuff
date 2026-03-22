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
})
