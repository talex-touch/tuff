// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

// The live-window navigation to /setting/intelligence showed a blank subtree
// once; this pins down that the component itself mounts and lists items with
// nothing but its SDK boundary stubbed — so a blank page implicates the
// routing shell, not this component.

const orchestratorGetSnapshot = vi.fn().mockResolvedValue({
  importedItems: [
    {
      id: 'mcp-1',
      kind: 'mcp',
      name: 'fs',
      active: true,
      state: 'active',
      origin: 'manual',
      payload: { transport: { type: 'stdio', command: 'npx' } }
    },
    {
      id: 'skill-1',
      kind: 'skill',
      name: 'notes',
      description: 'take notes',
      active: true,
      state: 'active'
    },
    // A pre-contract row: no sourceId/candidateId. This is the shape that
    // blanked the live settings page — it must render, not throw.
    {
      id: 'mcp-legacy',
      kind: 'mcp',
      name: 'legacy-server',
      active: true,
      state: 'active'
    }
  ]
})

vi.mock('@talex-touch/utils/renderer', () => ({
  useIntelligenceSdk: () => ({
    orchestratorGetSnapshot,
    orchestratorSetImportedItemActive: vi.fn(),
    orchestratorDeleteImportedItem: vi.fn()
  }),
  useMcpServersSdk: () => ({
    probe: vi.fn().mockResolvedValue({ ok: true, toolCount: 3 }),
    upsertManual: vi.fn().mockResolvedValue({ itemId: 'mcp-1' })
  })
}))

const localSnapshot = {
  dirs: ['/Users/dev/tuff-skills'],
  skills: [
    {
      id: 'local:abc123def456',
      name: 'triage',
      description: 'Sort the inbox',
      path: '/Users/dev/tuff-skills/triage',
      sourceDir: '/Users/dev/tuff-skills',
      enabled: true
    }
  ]
}

const send = vi.fn(async (event: { toEventName: () => string }) =>
  event.toEventName() === 'ai:skill-local:list' ? localSnapshot : undefined
)

vi.mock('@talex-touch/utils/transport', () => ({ useTuffTransport: () => ({ send }) }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key
  })
}))
vi.mock('vue-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import SettingSkillsMcp from './SettingSkillsMcp.vue'

describe('settingSkillsMcp mounts standalone', () => {
  it('renders every section from the store items without throwing', async () => {
    const wrapper = mount(SettingSkillsMcp)
    await flushPromises()

    expect(orchestratorGetSnapshot).toHaveBeenCalled()
    const text = wrapper.text()
    expect(text).toContain('settings.skillsMcp.mcp.label')
    expect(text).toContain('settings.skillsMcp.skills.label')
    expect(text).toContain('fs')
    expect(text).toContain('notes')
    expect(text).toContain('legacy-server')
  })

  it('lists linked directories and their skills from the local snapshot', async () => {
    const wrapper = mount(SettingSkillsMcp)
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('settings.skillsMcp.localDirs.label')
    expect(text).toContain('/Users/dev/tuff-skills')
    expect(text).toContain('triage')
    expect(text).toContain('Sort the inbox')
    // One skill under the one directory, reported back to the row.
    expect(text).toContain('settings.skillsMcp.localDirs.dirDesc:{"count":1}')
  })
})
