// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

// The live-window navigation to the settings page showed a blank subtree once;
// this pins down that the component itself mounts and lists items with nothing
// but its SDK boundary stubbed — so a blank page implicates the routing shell,
// not this component.

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
    orchestratorPreviewImport: vi.fn().mockResolvedValue({
      scanId: 'scan-1',
      candidates: [
        {
          id: 'candidate-mcp-1',
          kind: 'mcp',
          name: 'Discovered Claude MCP',
          provider: 'claude',
          state: 'added',
          blockingIssues: [],
          serverNames: ['memory', 'fetch'],
          secretKeyPaths: []
        }
      ]
    }),
    orchestratorApplyImport: vi.fn(),
    orchestratorSetImportedItemActive: vi.fn(),
    orchestratorDeleteImportedItem: vi.fn()
  }),
  useMcpServersSdk: () => ({
    probe: vi.fn().mockResolvedValue({ ok: true, toolCount: 3 }),
    upsertManual: vi.fn().mockResolvedValue({ itemId: 'mcp-1' })
  })
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    te: () => true
  })
}))
vi.mock('vue-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import SettingMcpServers from './SettingMcpServers.vue'

describe('settingMcpServers mounts standalone', () => {
  it('renders every MCP server from the store items without throwing', async () => {
    const wrapper = mount(SettingMcpServers)
    await flushPromises()

    expect(orchestratorGetSnapshot).toHaveBeenCalled()
    const text = wrapper.text()
    expect(text).toContain('settings.skillsMcp.mcp.label')
    expect(text).toContain('fs')
    expect(text).toContain('legacy-server')
    // The snapshot's skills belong to the skills section, not this one.
    expect(text).not.toContain('notes')
  })

  it('renders discovered unadopted MCP servers with adopt button', async () => {
    const wrapper = mount(SettingMcpServers)
    await flushPromises()

    const text = wrapper.text()
    expect(text).toContain('Discovered Claude MCP')
    expect(text).toContain('settings.skillsMcp.mcp.discoveredChip')
    expect(text).toContain('settings.skillsMcp.mcp.adoptAction')
  })
})
