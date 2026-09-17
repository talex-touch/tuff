// @vitest-environment jsdom
import type { McpHostState } from '@talex-touch/utils/transport/sdk/domains/mcp-host'
import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'

// The local MCP server section: the one place a user can see that Tuff is being
// talked to. Everything asserted here is read back from the rendered DOM — the
// SDK boundary is stubbed, the section itself is real.

const host = vi.hoisted(() => ({
  getState: vi.fn(),
  setEnabled: vi.fn(),
  setToolEnabled: vi.fn(),
  setPort: vi.fn(),
  rotateToken: vi.fn()
}))

vi.mock('@talex-touch/utils/renderer', () => ({
  useIntelligenceSdk: () => ({
    orchestratorGetSnapshot: vi.fn().mockResolvedValue({
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
    }),
    orchestratorPreviewImport: vi.fn().mockResolvedValue({ scanId: 'scan-1', candidates: [] }),
    orchestratorApplyImport: vi.fn(),
    orchestratorSetImportedItemActive: vi.fn(),
    orchestratorDeleteImportedItem: vi.fn()
  }),
  useMcpServersSdk: () => ({
    probe: vi.fn().mockResolvedValue({ ok: true, toolCount: 3 }),
    upsertManual: vi.fn().mockResolvedValue({ itemId: 'mcp-1' })
  }),
  useMcpHostSdk: () => host
}))

const localSnapshot = {
  dirs: [{ path: '/Users/dev/tuff-skills', sourceId: null, auto: false }],
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
      params ? `${key}:${JSON.stringify(params)}` : key,
    te: () => true
  })
}))
vi.mock('vue-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import SettingSkillsMcp from './SettingSkillsMcp.vue'

const TOKEN = 'a3f1c7d2'.repeat(8)
const ENDPOINT = 'http://127.0.0.1:43110/mcp'

const LISTENING: McpHostState = {
  enabled: true,
  running: true,
  endpoint: ENDPOINT,
  port: 43110,
  token: TOKEN,
  tools: [
    {
      name: 'tuff_search_files',
      description: 'Search this machine for files by name or content',
      risk: 'read',
      enabled: true
    },
    {
      name: 'tuff_write_file',
      description: 'Write a file on this machine',
      risk: 'write',
      enabled: false
    }
  ]
}

/** The host answering a change the way the section must render it. */
function hostAnswering(name: string, enabled: boolean): McpHostState {
  return {
    ...LISTENING,
    tools: LISTENING.tools.map((tool) => (tool.name === name ? { ...tool, enabled } : tool))
  }
}

async function mountSection(state: McpHostState): Promise<VueWrapper> {
  host.getState.mockResolvedValue(state)
  const wrapper = mount(SettingSkillsMcp)
  await flushPromises()
  return wrapper
}

/** Rows are found by the label a user reads, not by position in the list. */
function rowNamed(wrapper: VueWrapper, title: string): DOMWrapper<Element> {
  const row = wrapper
    .findAll('.SettingRow')
    .find((candidate) => candidate.find('.SettingRow-Title').text() === title)
  if (!row) throw new Error(`no settings row titled ${title}`)
  return row
}

function switchOf(row: DOMWrapper<Element>): DOMWrapper<Element> {
  const control = row.find('button[role="switch"]')
  if (!control.exists()) throw new Error('row has no switch')
  return control
}

function buttonLabelled(row: DOMWrapper<Element>, label: string): DOMWrapper<Element> {
  const button = row.findAll('button').find((candidate) => candidate.text() === label)
  if (!button) throw new Error(`no button labelled ${label}`)
  return button
}

describe('settingSkillsMcp local MCP server section', () => {
  it('shows the running endpoint and every published tool on load, without a click', async () => {
    const wrapper = await mountSection(LISTENING)
    const text = wrapper.text()

    expect(text).toContain(ENDPOINT)
    for (const tool of LISTENING.tools) {
      const row = rowNamed(wrapper, tool.name)
      expect(row.find('.SettingRow-Desc').text()).toBe(tool.description)
      // Exactly one switch per tool, reading the tool's own state.
      expect(row.findAll('button[role="switch"]')).toHaveLength(1)
      expect(switchOf(row).attributes('aria-checked')).toBe(String(tool.enabled))
    }

    // Each tool says what it is allowed to do, in the words of its risk tier.
    expect(rowNamed(wrapper, 'tuff_search_files').text()).toContain(
      'settings.skillsMcp.host.risk.read'
    )
    expect(rowNamed(wrapper, 'tuff_write_file').text()).toContain(
      'settings.skillsMcp.host.risk.write'
    )
  })

  it('keeps the token masked until the reveal control is used', async () => {
    const wrapper = await mountSection(LISTENING)
    const tokenRow = rowNamed(wrapper, 'settings.skillsMcp.host.tokenTitle')

    const masked = tokenRow.find('.SettingRow-Trailing').text()
    expect(masked).not.toContain(TOKEN)
    expect(masked).toContain('•')

    await buttonLabelled(tokenRow, 'settings.skillsMcp.host.reveal').trigger('click')

    expect(
      rowNamed(wrapper, 'settings.skillsMcp.host.tokenTitle').find('.SettingRow-Trailing').text()
    ).toContain(TOKEN)
  })

  it('sends the flipped tool state and renders the state the host answers with', async () => {
    const wrapper = await mountSection(LISTENING)
    host.setToolEnabled.mockImplementation(async (name: string, enabled: boolean) =>
      hostAnswering(name, enabled)
    )

    await switchOf(rowNamed(wrapper, 'tuff_write_file')).trigger('click')
    await flushPromises()

    expect(host.setToolEnabled).toHaveBeenCalledWith('tuff_write_file', true)
    expect(switchOf(rowNamed(wrapper, 'tuff_write_file')).attributes('aria-checked')).toBe('true')

    // The other direction: a tool that is on must offer to turn off.
    await switchOf(rowNamed(wrapper, 'tuff_search_files')).trigger('click')
    await flushPromises()

    expect(host.setToolEnabled).toHaveBeenCalledWith('tuff_search_files', false)
    expect(switchOf(rowNamed(wrapper, 'tuff_search_files')).attributes('aria-checked')).toBe(
      'false'
    )
  })

  it('renders the state the host reports rather than the tap the user made', async () => {
    const wrapper = await mountSection(LISTENING)
    // The host answers with the tool still off, the way a refused change looks.
    host.setToolEnabled.mockResolvedValue(LISTENING)

    await switchOf(rowNamed(wrapper, 'tuff_write_file')).trigger('click')
    await flushPromises()

    expect(host.setToolEnabled).toHaveBeenCalledWith('tuff_write_file', true)
    expect(switchOf(rowNamed(wrapper, 'tuff_write_file')).attributes('aria-checked')).toBe('false')
  })

  it('explains why a switched-on listener is not up instead of reading as off', async () => {
    const wrapper = await mountSection({
      ...LISTENING,
      running: false,
      lastError: 'listen EADDRINUSE'
    })

    const description = rowNamed(wrapper, 'settings.skillsMcp.host.enableTitle')
      .find('.SettingRow-Desc')
      .text()

    expect(description).toContain('listen EADDRINUSE')
    // The failure outranks the plain "switched on but not bound yet" line.
    expect(description).not.toContain('settings.skillsMcp.host.startingDesc')
  })

  it('leaves the MCP-client and skills rows alone when the host is switched on', async () => {
    const wrapper = await mountSection({
      ...LISTENING,
      enabled: false,
      running: false,
      endpoint: null
    })

    const neighbours = ['fs', 'legacy-server', 'notes', 'triage']
    const before = neighbours.map((title) => rowNamed(wrapper, title).text())
    expect(
      switchOf(rowNamed(wrapper, 'settings.skillsMcp.host.enableTitle')).attributes('aria-checked')
    ).toBe('false')

    host.setEnabled.mockResolvedValue(LISTENING)
    await switchOf(rowNamed(wrapper, 'settings.skillsMcp.host.enableTitle')).trigger('click')
    await flushPromises()

    // The section itself did follow the answer, so this is not a no-op pass.
    expect(
      switchOf(rowNamed(wrapper, 'settings.skillsMcp.host.enableTitle')).attributes('aria-checked')
    ).toBe('true')
    expect(wrapper.text()).toContain(ENDPOINT)
    expect(neighbours.map((title) => rowNamed(wrapper, title).text())).toEqual(before)
  })
})
