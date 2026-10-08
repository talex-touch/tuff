// @vitest-environment jsdom
import type {
  McpServerInventory,
  McpServerRow
} from '@talex-touch/utils/transport/sdk/domains/mcp-servers'
import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The MCP page's server list, mounted whole with only its SDK boundary stubbed: rows merged across
 * agents, the agent bar and search, every row's own switch (imported servers flip, new ones import
 * one server alone, credentials ask first), the drawer, and the first-load, failure and empty states.
 */

const sdk = vi.hoisted(() => ({
  inventory: vi.fn(),
  setServerEnabled: vi.fn(),
  probe: vi.fn(),
  probeDeclared: vi.fn(),
  upsertManual: vi.fn(),
  applyImport: vi.fn(),
  getSnapshot: vi.fn(),
  deleteItem: vi.fn()
}))

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))

/**
 * `TxButton`'s ripple and the tooltip anchor ask for media queries, which jsdom lacks.
 *
 * Reduced motion is on: v-wave then draws no ripple, so none of its cleanup timers can fire after the
 * file's environment is torn down (`document is not defined` under a loaded batch run).
 */
vi.hoisted(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true)
  }))
})

vi.mock('@talex-touch/utils/renderer', () => ({
  useIntelligenceSdk: () => ({
    orchestratorApplyImport: sdk.applyImport,
    orchestratorGetSnapshot: sdk.getSnapshot,
    orchestratorDeleteImportedItem: sdk.deleteItem
  }),
  useMcpServersSdk: () => ({
    inventory: sdk.inventory,
    setServerEnabled: sdk.setServerEnabled,
    probe: sdk.probe,
    probeDeclared: sdk.probeDeclared,
    upsertManual: sdk.upsertManual
  })
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    te: () => true,
    locale: { value: 'en-US' }
  })
}))
vi.mock('vue-sonner', () => ({ toast }))

import SettingMcpServers from './SettingMcpServers.vue'

const MASK = '••••••'

function row(overrides: Partial<McpServerRow> & Pick<McpServerRow, 'key' | 'name'>): McpServerRow {
  return {
    transport: 'stdio',
    summary: 'npx',
    detail: { command: 'npx', args: [], envNames: [], headerNames: [] },
    hasSecrets: false,
    agents: [],
    tuff: { state: 'not-imported' },
    ...overrides
  }
}

const CLAUDE = {
  agentId: 'claude',
  sourcePath: '/Users/me/.claude.json',
  candidateId: 'claude:mcp'
}
const CODEX = {
  agentId: 'codex',
  sourcePath: '/Users/me/.codex/config.toml',
  candidateId: 'codex:mcp'
}

/** Claude and Codex both run context7 the same way: one row. pencil and github live beside it. */
function inventory(overrides: Partial<McpServerInventory> = {}): McpServerInventory {
  return {
    scanId: 'scan-1',
    agents: [
      { agentId: 'claude', label: 'Claude Code', skillCount: null, mcpServerCount: 2 },
      { agentId: 'codex', label: 'Codex', skillCount: null, mcpServerCount: 2 }
    ],
    unreadableSources: [],
    rows: [
      row({
        key: 'mcp:context7',
        name: 'context7',
        summary: 'npx -y @upstash/context7-mcp',
        detail: {
          command: 'npx',
          args: ['-y', '@upstash/context7-mcp'],
          envNames: [],
          headerNames: []
        },
        agents: [CLAUDE, CODEX]
      }),
      row({
        key: 'mcp:docs',
        name: 'docs',
        transport: 'http',
        summary: 'https://docs.example.com/mcp',
        detail: {
          url: 'https://docs.example.com/mcp',
          envNames: [],
          headerNames: ['Authorization']
        },
        hasSecrets: true,
        tuff: {
          state: 'disabled',
          itemId: 'manual:docs',
          profileId: 'manual.docs',
          origin: 'manual',
          provider: 'manual'
        }
      }),
      row({
        key: 'mcp:github',
        name: 'github',
        summary: `docker run -i --rm -e GITHUB_TOKEN ${MASK}`,
        detail: {
          command: 'docker',
          args: ['run', '-i', '--rm', '-e', 'GITHUB_TOKEN', MASK],
          envNames: ['GITHUB_TOKEN'],
          headerNames: []
        },
        hasSecrets: true,
        agents: [CODEX]
      }),
      row({
        key: 'mcp:pencil',
        name: 'pencil',
        summary: '/Applications/Pencil.app/mcp --app desktop',
        agents: [CLAUDE],
        tuff: {
          state: 'enabled',
          itemId: 'claude-item',
          profileId: 'p-pencil',
          origin: 'imported',
          provider: 'claude'
        }
      })
    ],
    ...overrides
  }
}

/** The same machine after one server came on: only that row's Tuff state differs. */
function withState(
  base: McpServerInventory,
  key: string,
  tuff: McpServerRow['tuff']
): McpServerInventory {
  return {
    ...base,
    rows: base.rows.map((candidate) => (candidate.key === key ? { ...candidate, tuff } : candidate))
  }
}

function coded(code: string): Error {
  return Object.assign(new Error(code), { code })
}

const mounted: VueWrapper[] = []

async function mountList(): Promise<VueWrapper> {
  const wrapper = mount(SettingMcpServers, {
    props: { title: 'MCP' },
    global: { stubs: { teleport: true } }
  })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

/**
 * `TxBottomDialog` acts on a button 200 ms after the click and animates out for another 150. This
 * waits for the dialog to be gone, not for a fixed time: under a loaded batch run its timers fire
 * late, and a fixed wait raced them.
 */
async function settleDialog(): Promise<void> {
  await vi.waitFor(
    () => {
      if (mounted.some((wrapper) => wrapper.find('.tx-bottom-dialog').exists()))
        throw new Error('the dialog is still open')
    },
    { timeout: 5000, interval: 20 }
  )
  await flushPromises()
}

function rowNamed(wrapper: VueWrapper, name: string): DOMWrapper<Element> {
  const found = wrapper
    .findAll('.ResourceRow')
    .find((candidate) => candidate.find('.ResourceRow-Name').text() === name)
  if (!found) throw new Error(`no row named ${name}`)
  return found
}

function rowNames(wrapper: VueWrapper): string[] {
  return wrapper
    .findAll('[data-testid="mcp-servers-list"] .ResourceRow-Name')
    .map((name) => name.text())
}

function switchOf(target: DOMWrapper<Element>): DOMWrapper<Element> {
  const control = target.find('button[role="switch"]')
  if (!control.exists()) throw new Error('no switch')
  return control
}

function buttonLabelled(wrapper: VueWrapper | DOMWrapper<Element>, label: string) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === label)
  if (!button) throw new Error(`no button labelled ${label}`)
  return button
}

function chip(wrapper: VueWrapper, agentId: string): DOMWrapper<Element> {
  const found = wrapper
    .findAll('button.tx-bui-filter-chips__chip')
    .find((candidate) => candidate.find(`[data-agent-chip="${agentId}"]`).exists())
  if (!found) throw new Error(`no chip for ${agentId}`)
  return found
}

async function openRow(wrapper: VueWrapper, name: string): Promise<DOMWrapper<Element>> {
  await rowNamed(wrapper, name).find('button.ResourceRow-Hit').trigger('click')
  await flushPromises()
  const detail = wrapper.find('.McpDetail')
  if (!detail.exists()) throw new Error('drawer did not open')
  return detail
}

beforeEach(() => {
  for (const mock of Object.values(sdk)) mock.mockReset()
  toast.error.mockReset()
  toast.success.mockReset()
  sdk.inventory.mockResolvedValue(inventory())
})

afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.unmount()
})

describe('settingMcpServers: the list', () => {
  it('draws one row per server, merged across the agents that declare it', async () => {
    const wrapper = await mountList()

    expect(rowNames(wrapper)).toEqual(['context7', 'docs', 'github', 'pencil'])
    // context7 is declared by Claude Code and Codex: one row, both marks lit.
    const marks = rowNamed(wrapper, 'context7')
      .findAll('.AgentIconRow-Item')
      .map((mark) => [mark.attributes('data-agent-id'), mark.attributes('data-configured')])
    expect(marks).toEqual([
      ['claude', 'true'],
      ['codex', 'true']
    ])
    // pencil only by Claude: Codex's mark is there, dimmed.
    expect(
      rowNamed(wrapper, 'pencil')
        .findAll('.AgentIconRow-Item')
        .map((mark) => mark.attributes('data-configured'))
    ).toEqual(['true', 'false'])
  })

  it('labels each row with its transport, its credentials and where Tuff stands', async () => {
    const wrapper = await mountList()
    const tags = (name: string) =>
      rowNamed(wrapper, name)
        .findAll('.ResourceRow-Tags .SettingChip')
        .map((tag) => tag.text())

    expect(tags('context7')).toEqual([
      'settings.mcpPage.tagStdio',
      'settings.mcpPage.tagNotImported'
    ])
    expect(tags('github')).toEqual([
      'settings.mcpPage.tagStdio',
      'settings.mcpPage.tagSecrets',
      'settings.mcpPage.tagNotImported'
    ])
    expect(tags('docs')).toEqual([
      'settings.mcpPage.tagHttp',
      'settings.mcpPage.tagSecrets',
      'settings.mcpPage.tagManual'
    ])
    expect(rowNamed(wrapper, 'github').find('.ResourceRow-Desc').text()).toBe(
      `docker run -i --rm -e GITHUB_TOKEN ${MASK}`
    )
  })

  it('counts what Tuff runs and filters by agent, the same chip again showing everything', async () => {
    const wrapper = await mountList()

    expect(wrapper.find('.ResourceAgentBar-Summary').text()).toBe(
      'settings.resources.enabledLabel 1 / 4'
    )
    expect(chip(wrapper, 'claude').text()).toBe('Claude Code2')

    await chip(wrapper, 'codex').trigger('click')
    expect(rowNames(wrapper)).toEqual(['context7', 'github'])

    await chip(wrapper, 'codex').trigger('click')
    expect(rowNames(wrapper)).toEqual(['context7', 'docs', 'github', 'pencil'])
  })

  it('searches, says so when nothing matches, and clears both filters in one go', async () => {
    const wrapper = await mountList()
    // TuffEx fields hand their attributes to the native control, so the test id is on the input.
    const search = wrapper.find('input[data-testid="mcp-servers-search"]')

    await search.setValue('upstash')
    expect(rowNames(wrapper)).toEqual(['context7'])

    await chip(wrapper, 'claude').trigger('click')
    await search.setValue('nothing-like-this')
    const empty = wrapper.find('[data-testid="mcp-servers-search-empty"]')
    expect(empty.text()).toContain('settings.mcpPage.searchEmptyTitle')

    await buttonLabelled(empty, 'settings.mcpPage.clearFilters').trigger('click')
    expect(rowNames(wrapper)).toEqual(['context7', 'docs', 'github', 'pencil'])
  })
})

describe('settingMcpServers: one switch per server', () => {
  it('switches off one imported server and leaves every other row as it was', async () => {
    const wrapper = await mountList()
    sdk.setServerEnabled.mockResolvedValue({
      state: 'disabled',
      itemId: 'claude-item',
      profileId: 'p-pencil',
      origin: 'imported',
      provider: 'claude'
    })
    const neighbours = ['context7', 'docs', 'github'].map((name) => rowNamed(wrapper, name).html())

    await switchOf(rowNamed(wrapper, 'pencil')).trigger('click')
    await flushPromises()

    expect(sdk.setServerEnabled).toHaveBeenCalledTimes(1)
    expect(sdk.setServerEnabled).toHaveBeenCalledWith('mcp:pencil', false)
    expect(sdk.applyImport).not.toHaveBeenCalled()
    expect(switchOf(rowNamed(wrapper, 'pencil')).attributes('aria-checked')).toBe('false')
    expect(['context7', 'docs', 'github'].map((name) => rowNamed(wrapper, name).html())).toEqual(
      neighbours
    )
  })

  it('switches on a server Tuff does not hold by importing it alone, then reads the machine again', async () => {
    const wrapper = await mountList()
    sdk.applyImport.mockResolvedValue({
      revisionId: 'r',
      imported: 1,
      unchanged: 0,
      removed: 0,
      items: []
    })
    sdk.inventory.mockResolvedValue(
      withState(inventory(), 'mcp:context7', {
        state: 'enabled',
        itemId: 'claude-item',
        profileId: 'p-context7',
        origin: 'imported',
        provider: 'claude'
      })
    )

    await switchOf(rowNamed(wrapper, 'context7')).trigger('click')
    await flushPromises()

    expect(sdk.applyImport).toHaveBeenCalledTimes(1)
    expect(sdk.applyImport).toHaveBeenCalledWith({
      scanId: 'scan-1',
      candidateIds: ['claude:mcp'],
      mcpServers: { 'claude:mcp': { include: ['context7'] } }
    })
    expect(sdk.inventory).toHaveBeenCalledTimes(2)
    expect(switchOf(rowNamed(wrapper, 'context7')).attributes('aria-checked')).toBe('true')
    // pencil, from the same file, keeps the switch it had.
    expect(switchOf(rowNamed(wrapper, 'pencil')).attributes('aria-checked')).toBe('true')
    expect(toast.success).toHaveBeenCalledWith('settings.mcpPage.imported:{"name":"context7"}')
  })

  it('asks before moving credentials, and imports with the go-ahead only after a yes', async () => {
    const wrapper = await mountList()
    sdk.applyImport
      .mockRejectedValueOnce(coded('AI_IMPORT_SECRET_CONFIRMATION_REQUIRED'))
      .mockResolvedValueOnce({ revisionId: 'r', imported: 1, unchanged: 0, removed: 0, items: [] })
    sdk.inventory.mockResolvedValue(
      withState(inventory(), 'mcp:github', {
        state: 'enabled',
        itemId: 'codex-item',
        profileId: 'p-github',
        origin: 'imported',
        provider: 'codex'
      })
    )

    await switchOf(rowNamed(wrapper, 'github')).trigger('click')
    await flushPromises()

    const dialog = wrapper.find('.tx-bottom-dialog')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('settings.mcpPage.secretTitle:{"name":"github"}')
    // Names, never values.
    expect(dialog.text()).toContain('GITHUB_TOKEN')
    expect(sdk.applyImport).toHaveBeenCalledTimes(1)
    expect(sdk.applyImport.mock.calls[0]![0]).not.toHaveProperty('confirmSecretMigration')

    await buttonLabelled(dialog, 'settings.mcpPage.secretConfirm').trigger('click')
    await settleDialog()

    expect(sdk.applyImport).toHaveBeenCalledTimes(2)
    expect(sdk.applyImport.mock.calls[1]![0]).toEqual({
      scanId: 'scan-1',
      candidateIds: ['codex:mcp'],
      mcpServers: { 'codex:mcp': { include: ['github'] } },
      confirmSecretMigration: true
    })
    expect(switchOf(rowNamed(wrapper, 'github')).attributes('aria-checked')).toBe('true')
    expect(wrapper.find('.tx-bottom-dialog').exists()).toBe(false)
  })

  it('moves nothing when the user declines the credential move', async () => {
    const wrapper = await mountList()
    sdk.applyImport.mockRejectedValueOnce(coded('AI_IMPORT_SECRET_CONFIRMATION_REQUIRED'))

    await switchOf(rowNamed(wrapper, 'github')).trigger('click')
    await flushPromises()
    await buttonLabelled(wrapper.find('.tx-bottom-dialog'), 'settings.mcpPage.cancel').trigger(
      'click'
    )
    await settleDialog()

    expect(sdk.applyImport).toHaveBeenCalledTimes(1)
    expect(switchOf(rowNamed(wrapper, 'github')).attributes('aria-checked')).toBe('false')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('says why a server needing re-authentication cannot be switched on, not that something failed', async () => {
    const wrapper = await mountList()
    sdk.applyImport.mockRejectedValueOnce(coded('MCP_SERVER_REAUTH_REQUIRED'))

    await switchOf(rowNamed(wrapper, 'github')).trigger('click')
    await flushPromises()

    expect(sdk.applyImport).toHaveBeenCalledTimes(1)
    expect(toast.error).toHaveBeenCalledWith('settings.mcpPage.errorReauth:{"name":"github"}')
    const detail = await openRow(wrapper, 'github')
    expect(detail.find('.McpDetail-Failure').text()).toBe(
      'settings.mcpPage.errorReauth:{"name":"github"}'
    )
  })

  it('scans again and retries once when the file changed after the scan', async () => {
    const wrapper = await mountList()
    sdk.applyImport
      .mockRejectedValueOnce(coded('AI_IMPORT_SOURCE_CHANGED'))
      .mockResolvedValueOnce({ revisionId: 'r', imported: 0, unchanged: 1, removed: 0, items: [] })
    sdk.inventory.mockResolvedValueOnce(inventory({ scanId: 'scan-2' })).mockResolvedValue(
      withState(inventory({ scanId: 'scan-2' }), 'mcp:context7', {
        state: 'enabled',
        itemId: 'claude-item',
        profileId: 'p-context7',
        origin: 'imported',
        provider: 'claude'
      })
    )

    await switchOf(rowNamed(wrapper, 'context7')).trigger('click')
    await flushPromises()

    expect(sdk.applyImport.mock.calls.map((call) => call[0].scanId)).toEqual(['scan-1', 'scan-2'])
    expect(switchOf(rowNamed(wrapper, 'context7')).attributes('aria-checked')).toBe('true')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('names a file that keeps changing instead of retrying forever', async () => {
    const wrapper = await mountList()
    sdk.applyImport.mockRejectedValue(coded('AI_IMPORT_SOURCE_CHANGED'))

    await switchOf(rowNamed(wrapper, 'context7')).trigger('click')
    await flushPromises()

    expect(sdk.applyImport).toHaveBeenCalledTimes(2)
    expect(toast.error).toHaveBeenCalledWith(
      'settings.mcpPage.errorSourceChanged:{"name":"context7"}'
    )
  })

  it('shows what the switch channel said when an imported server cannot come back on', async () => {
    const wrapper = await mountList()
    sdk.setServerEnabled.mockRejectedValueOnce(
      new Error("MCP_SERVER_SOURCE_MISSING: the agent's configuration no longer declares it")
    )

    await switchOf(rowNamed(wrapper, 'docs')).trigger('click')
    await flushPromises()

    expect(sdk.setServerEnabled).toHaveBeenCalledWith('mcp:docs', true)
    expect(toast.error).toHaveBeenCalledWith('settings.mcpPage.errorSourceMissing:{"name":"docs"}')
    // A failed change may still have landed, so the machine is read again.
    expect(sdk.inventory).toHaveBeenCalledTimes(2)
  })
})

describe('settingMcpServers: the drawer', () => {
  it('shows the sources, the command and credential names with masked values', async () => {
    const wrapper = await mountList()
    const detail = await openRow(wrapper, 'github')

    expect(detail.find('.McpDetail-Sources').text()).toContain('Codex')
    expect(detail.find('.McpDetail-Sources').text()).toContain('/Users/me/.codex/config.toml')
    const definition = detail.find('.McpDetail-Definition').text()
    expect(definition).toContain('docker')
    expect(definition).toContain('GITHUB_TOKEN')
    const secret = detail.find('.McpDetail-Secret')
    expect(secret.findAll('code').map((code) => code.text())).toEqual(['GITHUB_TOKEN', MASK])
    expect(detail.find('.McpDetail-Note').text()).toBe('settings.mcpPage.maskedNote')
    expect(rowNamed(wrapper, 'github').classes()).toContain('is-active')
  })

  it('probes the one server the drawer shows, by its own item and profile', async () => {
    const wrapper = await mountList()
    sdk.probe.mockResolvedValue({ ok: true, toolCount: 3 })
    const detail = await openRow(wrapper, 'pencil')

    await buttonLabelled(detail, 'settings.mcpPage.probeAction').trigger('click')
    await flushPromises()

    expect(sdk.probe).toHaveBeenCalledWith('claude-item', 'p-pencil')
    expect(wrapper.find('.McpDetail-Probe').text()).toBe('settings.mcpPage.probeOk:{"count":3}')
  })

  it('probes a server Tuff does not hold straight from the agent’s file, importing nothing', async () => {
    const wrapper = await mountList()
    sdk.probeDeclared.mockResolvedValue({ ok: true, toolCount: 4 })
    const detail = await openRow(wrapper, 'context7')
    expect(detail.find('.McpDetail-Probe').text()).toBe('settings.mcpPage.probeIdleDeclared')

    await buttonLabelled(detail, 'settings.mcpPage.probeAction').trigger('click')
    await flushPromises()

    expect(sdk.probeDeclared).toHaveBeenCalledExactlyOnceWith({
      scanId: 'scan-1',
      candidateId: 'claude:mcp',
      server: 'context7',
      key: 'mcp:context7'
    })
    expect(wrapper.find('.McpDetail-Probe').text()).toBe('settings.mcpPage.probeOk:{"count":4}')
    for (const spy of [sdk.probe, sdk.applyImport, sdk.setServerEnabled])
      expect(spy).not.toHaveBeenCalled()
    expect(wrapper.find('.McpDetail-SwitchDesc').text()).toBe('settings.mcpPage.stateNotImported')
    expect(switchOf(rowNamed(wrapper, 'context7')).attributes('aria-checked')).toBe('false')
  })

  it('asks before probing with credentials, naming them only, and probes with them after a yes', async () => {
    const wrapper = await mountList()
    sdk.probeDeclared
      .mockResolvedValueOnce({
        ok: false,
        error:
          'AI_IMPORT_SECRET_CONFIRMATION_REQUIRED: github is started with its credentials only once the user agrees'
      })
      .mockResolvedValueOnce({ ok: true, toolCount: 7 })
    const detail = await openRow(wrapper, 'github')

    await buttonLabelled(detail, 'settings.mcpPage.probeAction').trigger('click')
    await flushPromises()

    const dialog = wrapper.find('.tx-bottom-dialog')
    expect(dialog.text()).toContain('settings.mcpPage.probeSecretTitle:{"name":"github"}')
    expect(dialog.text()).toContain('settings.mcpPage.probeSecretMessage:{"names":"GITHUB_TOKEN"}')
    expect(sdk.probeDeclared).toHaveBeenCalledTimes(1)
    expect(sdk.probeDeclared.mock.calls[0]![0]).not.toHaveProperty('confirmSecrets')
    // Nothing runs while the user decides, so the drawer does not claim a probe is under way, and a
    // second press waits for this one.
    expect(wrapper.find('.McpDetail-Probe').text()).toBe('settings.mcpPage.probeIdleDeclared')
    await buttonLabelled(wrapper.find('.McpDetail'), 'settings.mcpPage.probeAction').trigger(
      'click'
    )
    await flushPromises()
    expect(sdk.probeDeclared).toHaveBeenCalledTimes(1)

    await buttonLabelled(dialog, 'settings.mcpPage.probeSecretConfirm').trigger('click')
    await settleDialog()

    expect(sdk.probeDeclared).toHaveBeenCalledTimes(2)
    expect(sdk.probeDeclared.mock.calls[1]![0]).toEqual({
      scanId: 'scan-1',
      candidateId: 'codex:mcp',
      server: 'github',
      key: 'mcp:github',
      confirmSecrets: true
    })
    expect(wrapper.find('.McpDetail-Probe').text()).toBe('settings.mcpPage.probeOk:{"count":7}')
    expect(sdk.applyImport).not.toHaveBeenCalled()
  })

  it('starts nothing when the user declines, and says nothing failed', async () => {
    const wrapper = await mountList()
    sdk.probeDeclared.mockResolvedValueOnce({
      ok: false,
      error: 'AI_IMPORT_SECRET_CONFIRMATION_REQUIRED: github needs a yes first'
    })
    const detail = await openRow(wrapper, 'github')

    await buttonLabelled(detail, 'settings.mcpPage.probeAction').trigger('click')
    await flushPromises()
    await buttonLabelled(wrapper.find('.tx-bottom-dialog'), 'settings.mcpPage.cancel').trigger(
      'click'
    )
    await settleDialog()

    expect(sdk.probeDeclared).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.McpDetail-Probe').text()).toBe('settings.mcpPage.probeIdleDeclared')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it.each([
    ['MCP_SERVER_REAUTH_REQUIRED: github needs its credentials re-entered', 'probeReasonReauth'],
    [
      'MCP_SERVER_SOURCE_MISSING: the configuration no longer declares github',
      'probeReasonSourceMissing'
    ]
  ])('says why a probe was refused, in the probe’s own words (%s)', async (error, reason) => {
    const wrapper = await mountList()
    sdk.probeDeclared.mockResolvedValueOnce({ ok: false, error })
    const detail = await openRow(wrapper, 'github')

    await buttonLabelled(detail, 'settings.mcpPage.probeAction').trigger('click')
    await flushPromises()

    expect(wrapper.find('.McpDetail-Probe').text()).toBe(
      `settings.mcpPage.probeFailed:{"reason":"settings.mcpPage.${reason}"}`
    )
    expect(wrapper.find('.tx-bottom-dialog').exists()).toBe(false)
  })

  it('shows what the server answered when it did not come up', async () => {
    const wrapper = await mountList()
    sdk.probeDeclared.mockResolvedValueOnce({
      ok: false,
      error: 'context7: MCP server is unavailable.'
    })
    const detail = await openRow(wrapper, 'context7')

    await buttonLabelled(detail, 'settings.mcpPage.probeAction').trigger('click')
    await flushPromises()

    expect(wrapper.find('.McpDetail-Probe').text()).toBe(
      'settings.mcpPage.probeFailed:{"reason":"context7: MCP server is unavailable."}'
    )
  })

  it('scans again and probes once more when the file changed after the scan, then names it', async () => {
    const wrapper = await mountList()
    sdk.probeDeclared
      .mockResolvedValueOnce({
        ok: false,
        error: 'AI_IMPORT_SOURCE_CHANGED: changed after the scan'
      })
      .mockResolvedValueOnce({ ok: true, toolCount: 2 })
      .mockResolvedValue({ ok: false, error: 'AI_IMPORT_SOURCE_CHANGED: changed after the scan' })
    sdk.inventory.mockResolvedValue(inventory({ scanId: 'scan-2' }))
    const detail = await openRow(wrapper, 'context7')

    await buttonLabelled(detail, 'settings.mcpPage.probeAction').trigger('click')
    await flushPromises()

    expect(sdk.probeDeclared.mock.calls.map((call) => call[0].scanId)).toEqual(['scan-1', 'scan-2'])
    expect(wrapper.find('.McpDetail-Probe').text()).toBe('settings.mcpPage.probeOk:{"count":2}')

    // A file that keeps changing is named after the one retry, not retried forever.
    await buttonLabelled(wrapper.find('.McpDetail'), 'settings.mcpPage.probeAction').trigger(
      'click'
    )
    await flushPromises()

    expect(sdk.probeDeclared).toHaveBeenCalledTimes(4)
    expect(wrapper.find('.McpDetail-Probe').text()).toBe(
      'settings.mcpPage.probeFailed:{"reason":"settings.mcpPage.probeReasonSourceChanged"}'
    )
  })

  it('switches a server from the drawer exactly as from its row', async () => {
    const wrapper = await mountList()
    sdk.setServerEnabled.mockResolvedValue({
      state: 'disabled',
      itemId: 'claude-item',
      profileId: 'p-pencil',
      origin: 'imported',
      provider: 'claude'
    })
    const detail = await openRow(wrapper, 'pencil')

    await switchOf(detail.find('.McpDetail-Switch')).trigger('click')
    await flushPromises()

    expect(sdk.setServerEnabled).toHaveBeenCalledWith('mcp:pencil', false)
    expect(switchOf(rowNamed(wrapper, 'pencil')).attributes('aria-checked')).toBe('false')
  })

  it('edits a hand-entered server from its stored copy and says what an empty field does', async () => {
    const wrapper = await mountList()
    sdk.getSnapshot.mockResolvedValue({
      importedItems: [
        {
          id: 'manual:docs',
          kind: 'mcp',
          name: 'docs',
          sourceId: 'manual',
          candidateId: 'manual:docs',
          normalizedProjection: {
            mcpProfiles: [
              {
                id: 'manual.docs',
                name: 'docs',
                transport: { type: 'streamable-http', url: 'https://docs.example.com/mcp?key=1' }
              }
            ]
          }
        }
      ]
    })
    sdk.upsertManual.mockResolvedValue({ itemId: 'manual:docs' })
    const detail = await openRow(wrapper, 'docs')

    await buttonLabelled(wrapper, 'settings.mcpPage.edit').trigger('click')
    await flushPromises()

    const url = wrapper.find('input[data-testid="mcp-form-url"]')
    expect((url.element as HTMLInputElement).value).toBe('https://docs.example.com/mcp?key=1')
    expect(wrapper.find('.McpForm').text()).toContain(
      'settings.mcpPage.storedSecretsNote:{"count":1,"names":"Authorization"}'
    )
    expect(detail.exists()).toBe(true)

    await wrapper.find('input[data-testid="mcp-form-name"]').setValue('docs-renamed')
    await wrapper.find('[data-testid="mcp-form-save"]').trigger('click')
    await flushPromises()

    expect(sdk.upsertManual).toHaveBeenCalledWith({
      name: 'docs-renamed',
      transport: 'streamable-http',
      url: 'https://docs.example.com/mcp?key=1',
      itemId: 'manual:docs'
    })
    // Back to the details of the saved server.
    expect(wrapper.find('.McpForm').exists()).toBe(false)
    expect(wrapper.find('.McpDetail').exists()).toBe(true)
  })

  it('deletes a hand-entered server only after a confirmation', async () => {
    const wrapper = await mountList()
    sdk.deleteItem.mockResolvedValue({ deleted: true })
    await openRow(wrapper, 'docs')

    await wrapper.find('[data-testid="mcp-server-delete"]').trigger('click')
    await flushPromises()
    expect(sdk.deleteItem).not.toHaveBeenCalled()

    const dialog = wrapper.find('.tx-bottom-dialog')
    expect(dialog.text()).toContain('settings.mcpPage.deleteTitle:{"name":"docs"}')
    await buttonLabelled(dialog, 'settings.mcpPage.delete').trigger('click')
    await settleDialog()

    expect(sdk.deleteItem).toHaveBeenCalledWith({ itemId: 'manual:docs' })
    expect(toast.success).toHaveBeenCalledWith('settings.mcpPage.deleted:{"name":"docs"}')
  })

  it('offers neither edit nor delete for a server an agent declares', async () => {
    const wrapper = await mountList()
    await openRow(wrapper, 'pencil')

    expect(wrapper.find('[data-testid="mcp-server-edit"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mcp-server-delete"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="mcp-server-read-only"]').text()).toBe(
      'settings.mcpPage.readOnlyNote'
    )
  })

  it('keeps the form buttons when the drawer showed an agent’s server first', async () => {
    // The drawer settles once whether it has a footer; a footer that only existed for some views
    // would leave the form opened afterwards without its save button.
    const wrapper = await mountList()
    await openRow(wrapper, 'pencil')

    await wrapper.find('[data-testid="mcp-servers-add"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('.McpForm').exists()).toBe(true)
    expect(wrapper.find('[data-testid="mcp-form-save"]').exists()).toBe(true)
  })

  it('keeps every field filled in one go, not just the last one', async () => {
    // Autofill and paste handlers set several fields before the page renders once in between.
    const wrapper = await mountList()
    sdk.upsertManual.mockResolvedValue({ itemId: 'manual:new' })
    await wrapper.find('[data-testid="mcp-servers-add"]').trigger('click')
    await flushPromises()

    const fill = (selector: string, value: string) => {
      const field = wrapper.find(selector).element as HTMLInputElement | HTMLTextAreaElement
      field.value = value
      field.dispatchEvent(new Event('input', { bubbles: true }))
    }
    fill('input[data-testid="mcp-form-name"]', 'fs')
    fill('input[data-testid="mcp-form-command"]', 'npx')
    fill('input[data-testid="mcp-form-args"]', '-y server')
    fill('textarea[data-testid="mcp-form-env"]', 'API_KEY=s3cret')
    await flushPromises()
    await wrapper.find('[data-testid="mcp-form-save"]').trigger('click')
    await flushPromises()

    expect(sdk.upsertManual).toHaveBeenCalledWith({
      name: 'fs',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'server'],
      env: { API_KEY: 's3cret' }
    })
  })

  it('adds a server by hand from the title row', async () => {
    const wrapper = await mountList()
    sdk.upsertManual.mockResolvedValue({ itemId: 'manual:new' })

    await wrapper.find('[data-testid="mcp-servers-add"]').trigger('click')
    await flushPromises()
    await wrapper.find('input[data-testid="mcp-form-name"]').setValue('fs')
    await wrapper.find('input[data-testid="mcp-form-command"]').setValue('npx')
    await wrapper
      .find('input[data-testid="mcp-form-args"]')
      .setValue('-y server "/Users/me/My Files"')
    await wrapper.find('textarea[data-testid="mcp-form-env"]').setValue('API_KEY=s3cret')
    await wrapper.find('[data-testid="mcp-form-save"]').trigger('click')
    await flushPromises()

    expect(sdk.upsertManual).toHaveBeenCalledWith({
      name: 'fs',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', 'server', '/Users/me/My Files'],
      env: { API_KEY: 's3cret' }
    })
  })
})

describe('settingMcpServers: states', () => {
  it('draws a skeleton of the same bar and rows on a slow first read, then the list', async () => {
    let resolve!: (value: McpServerInventory) => void
    sdk.inventory.mockReturnValueOnce(new Promise((done) => (resolve = done)))
    const wrapper = mount(SettingMcpServers, {
      props: { title: 'MCP' },
      global: { stubs: { teleport: true } }
    })
    mounted.push(wrapper)
    await new Promise((done) => setTimeout(done, 200))

    const skeleton = wrapper.find('[data-testid="mcp-servers-skeleton"]')
    expect(skeleton.exists()).toBe(true)
    expect(skeleton.attributes('aria-hidden')).toBe('true')
    expect(skeleton.find('.ResourceAgentBar.is-placeholder').exists()).toBe(true)
    expect(skeleton.findAll('.ResourceRow.is-placeholder')).toHaveLength(4)
    // The title row is real from the start.
    expect(wrapper.find('h1').text()).toBe('MCP')

    resolve(inventory())
    await flushPromises()
    await new Promise((done) => setTimeout(done, 450))
    await flushPromises()

    expect(wrapper.find('[data-testid="mcp-servers-skeleton"]').exists()).toBe(false)
    expect(rowNames(wrapper)).toEqual(['context7', 'docs', 'github', 'pencil'])
  })

  it('says the scan failed, offers a retry, and lists the servers once it works', async () => {
    sdk.inventory.mockRejectedValueOnce(new Error('The operation failed. Please retry.'))
    const wrapper = await mountList()

    const notice = wrapper.find('[data-testid="mcp-servers-scan-failed"]')
    expect(notice.attributes('role')).toBe('alert')
    expect(notice.text()).toContain('settings.mcpPage.scanFailedTitle')

    await buttonLabelled(notice, 'settings.mcpPage.retry').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="mcp-servers-scan-failed"]').exists()).toBe(false)
    expect(rowNames(wrapper)).toHaveLength(4)
  })

  it('keeps the rows on screen when a rescan fails', async () => {
    const wrapper = await mountList()
    sdk.inventory.mockRejectedValueOnce(new Error('The operation failed. Please retry.'))

    await wrapper.find('[data-testid="mcp-servers-rescan"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="mcp-servers-scan-failed"]').exists()).toBe(true)
    expect(rowNames(wrapper)).toHaveLength(4)
  })

  it('names the configuration files it could not read', async () => {
    sdk.inventory.mockResolvedValue(
      inventory({
        unreadableSources: [
          { agentId: 'pi', sourcePath: '/Users/me/.pi/mcp.json', reason: 'unparseable' }
        ]
      })
    )
    const wrapper = await mountList()

    expect(wrapper.find('[data-testid="mcp-servers-unreadable"]').text()).toContain(
      '/Users/me/.pi/mcp.json'
    )
  })

  it('has an empty state with a way to add a server when the machine has none', async () => {
    sdk.inventory.mockResolvedValue(inventory({ rows: [], agents: [] }))
    const wrapper = await mountList()

    const empty = wrapper.find('[data-testid="mcp-servers-empty"]')
    expect(empty.text()).toContain('settings.mcpPage.emptyTitle')
    expect(wrapper.find('[data-testid="mcp-servers-search"]').exists()).toBe(false)
    expect(wrapper.find('.ResourceAgentBar-Summary').text()).toBe(
      'settings.resources.enabledLabel 0 / 0'
    )

    await buttonLabelled(empty, 'settings.mcpPage.add').trigger('click')
    await flushPromises()
    expect(wrapper.find('.McpForm').exists()).toBe(true)
  })
})

describe('settingMcpServers: test hygiene', () => {
  /**
   * The guard behind the reduced-motion stub at the top of this file: a pressed `TxButton` draws no
   * ripple, so no ripple timer is left to fire after the environment is torn down.
   */
  it('draws no button ripple, so nothing outlives the test', async () => {
    const wrapper = await mountList()
    const rescan = wrapper.find('[data-testid="mcp-servers-rescan"]')
    // TxButton loads its ripple directive with a dynamic import; wait until it has attached.
    await vi.waitFor(() => expect(rescan.attributes('data-v-wave-boundary')).toBe('true'), {
      timeout: 5000,
      interval: 10
    })

    await rescan.trigger('click')

    expect(rescan.element.querySelector('[data-v-wave-container-internal]')).toBeNull()
  })
})
