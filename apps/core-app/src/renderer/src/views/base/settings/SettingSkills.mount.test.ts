// @vitest-environment jsdom
import type { IntelligenceCapabilityConfig } from '@talex-touch/tuff-intelligence'
import type {
  SkillInventoryRow,
  SkillInventorySnapshot
} from '@talex-touch/utils/transport/sdk/domains/skill-local'
import type { DOMWrapper, VueWrapper } from '@vue/test-utils'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The skills page mounted whole, with only its boundaries stubbed: the skill inventory and directory
 * events, the imported-item switch, the settings store behind the built-in skills, and the built-in
 * editor itself (its own behaviour is `IntelligenceCapabilityInfo.test.ts`'s). What is under test is
 * the page: one row per real file, the agent bar and search across both groups, every switch acting
 * at once on Tuff alone, the built-in drawer's draft and its close question, the skill directories,
 * and the first-load, failure and empty states.
 */

const sdk = vi.hoisted(() => ({
  inventory: vi.fn(),
  setEnabled: vi.fn(),
  addDir: vi.fn(),
  removeDir: vi.fn(),
  list: vi.fn(),
  setImportedActive: vi.fn(),
  testCapability: vi.fn(),
  transportSend: vi.fn()
}))

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))

/** The settings store the built-in skills live in, rebuilt per test. */
const store = vi.hoisted(() => ({
  manager: null as null | Record<string, unknown>,
  hydrated: true
}))

/** What the stubbed editor does when the page asks it to hand over a prompt still being typed. */
const editor = vi.hoisted(() => ({
  nestedOpen: false,
  onFlush: null as null | ((emit: (event: string, ...args: unknown[]) => void) => void)
}))

/**
 * `TxButton`'s ripple and the tooltip anchor ask for media queries, which jsdom lacks.
 *
 * Reduced motion is on: v-wave then draws no ripple at all. A ripple schedules its own cleanup timers
 * (75 ms, then the wave, then the dissolve), and under a loaded batch run one of them could fire after
 * the file's environment was torn down — `document is not defined`, an unhandled error that fails the
 * run although every test passed. With no ripple there is no timer to outlive the test.
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
    orchestratorSetImportedItemActive: sdk.setImportedActive,
    testCapability: sdk.testCapability
  })
}))

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send: sdk.transportSend })
}))

vi.mock('@talex-touch/utils/transport/sdk/domains/skill-local', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@talex-touch/utils/transport/sdk/domains/skill-local')
  >()),
  createSkillLocalSdk: () => ({
    inventory: sdk.inventory,
    setEnabled: sdk.setEnabled,
    addDir: sdk.addDir,
    removeDir: sdk.removeDir,
    list: sdk.list
  })
}))

vi.mock('@talex-touch/utils/renderer/storage', () => ({
  intelligenceSettings: {
    isHydrated: () => store.hydrated,
    whenHydrated: () => Promise.resolve()
  }
}))

vi.mock('~/modules/hooks/useIntelligenceManager', () => ({
  useIntelligenceManager: () => store.manager
}))

vi.mock('~/components/intelligence/capabilities/IntelligenceCapabilityInfo.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      name: 'IntelligenceCapabilityInfo',
      props: {
        capability: { type: Object, required: true },
        providers: { type: Array, default: () => [] },
        bindings: { type: Array, default: () => [] },
        isTesting: { type: Boolean, default: false },
        testResult: { type: Object, default: null },
        testBlockedReason: { type: String, default: undefined }
      },
      emits: ['updateModels', 'updatePrompt', 'reorderProviders', 'test', 'toggleProvider'],
      setup(props, { emit, expose }) {
        expose({
          flushPrompt: () => editor.onFlush?.(emit as (event: string, ...args: unknown[]) => void),
          hasOpenDrawer: () => editor.nestedOpen
        })
        return () =>
          h('div', {
            class: 'InfoStub',
            'data-capability': props.capability?.id,
            'data-blocked': props.testBlockedReason ?? ''
          })
      }
    })
  }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    te: () => true,
    locale: { value: 'en-US' }
  })
}))
vi.mock('vue-sonner', () => ({ toast }))

import { ref } from 'vue'
import { TxTooltip } from '@talex-touch/tuffex/tooltip'
import SettingSkills from './SettingSkills.vue'

/* ─── fixtures ─── */

function skill(
  overrides: Partial<SkillInventoryRow> & Pick<SkillInventoryRow, 'id' | 'name'>
): SkillInventoryRow {
  return {
    kind: 'local',
    description: '',
    storage: 'local',
    storageRoot: null,
    realPath: `/Users/me/skills/${overrides.name}`,
    sources: [],
    enabledInTuff: true,
    ...overrides
  }
}

/**
 * The shape this machine really has for `lark-approval`: one copy in cc-switch's library linked into
 * Codex, and a different file in the shared `~/.agents` layer that Claude Code and Pi both link to.
 */
function inventory(overrides: Partial<SkillInventorySnapshot> = {}): SkillInventorySnapshot {
  return {
    rows: [
      skill({
        id: 'local:apple',
        name: 'apple-design',
        description: 'Fluid motion for Apple platforms',
        storageRoot: '/Users/me/.claude/skills',
        realPath: '/Users/me/.claude/skills/apple-design',
        sources: [{ agentId: 'claude', entryPath: '/Users/me/.claude/skills/apple-design' }]
      }),
      skill({
        id: 'local:lark-codex',
        name: 'lark-approval',
        description: 'Approvals in Lark',
        storage: 'cc-switch',
        storageRoot: '/Users/me/.cc-switch/skills',
        realPath: '/Users/me/.cc-switch/skills/lark-approval',
        sources: [{ agentId: 'codex', entryPath: '/Users/me/.codex/skills/lark-approval' }]
      }),
      skill({
        id: 'local:lark-shared',
        name: 'lark-approval',
        description: 'Approvals in Lark, shared layer',
        storage: 'agents-shared',
        storageRoot: '/Users/me/.agents/skills',
        realPath: '/Users/me/.agents/skills/lark-approval',
        sources: [
          { agentId: 'claude', entryPath: '/Users/me/.claude/skills/lark-approval' },
          { agentId: 'pi', entryPath: '/Users/me/.pi/agent/skills/lark-approval' }
        ]
      }),
      skill({
        id: 'imported-review',
        kind: 'imported',
        name: 'review-pr',
        description: 'Review a pull request',
        storage: 'tuff-import',
        realPath: null,
        sources: [{ agentId: 'codex', entryPath: null }],
        enabledInTuff: false
      })
    ],
    dirs: [
      { path: '/Users/me/.claude/skills', sourceId: 'claude', auto: true, skillCount: 2 },
      { path: '/Users/me/.codex/skills', sourceId: 'codex', auto: true, skillCount: 1 },
      { path: '/Users/me/.agents/skills', sourceId: 'agents', auto: true, skillCount: 1 },
      { path: '/Users/me/my-skills', sourceId: null, auto: false, skillCount: 0 }
    ],
    agents: [
      { agentId: 'claude', label: 'Claude Code', skillCount: 2, mcpServerCount: null },
      { agentId: 'codex', label: 'Codex', skillCount: 2, mcpServerCount: null },
      { agentId: 'pi', label: 'Pi', skillCount: 1, mcpServerCount: null }
    ],
    ...overrides
  }
}

function builtins(): Record<string, IntelligenceCapabilityConfig> {
  return {
    'vision.ocr': { id: 'vision.ocr', label: 'Text recognition', providers: [] },
    'text.translate': {
      id: 'text.translate',
      label: 'Translate',
      providers: [{ providerId: 'openai', enabled: true, priority: 1, models: ['gpt-4o'] }]
    },
    'text.chat': {
      id: 'text.chat',
      label: 'Chat',
      description: 'Talk to a model',
      promptTemplate: 'Be brief.',
      providers: [
        { providerId: 'nexus', enabled: true, priority: 1, models: ['gpt-4o-mini'] },
        { providerId: 'openai', enabled: true, priority: 2, models: [] }
      ]
    }
  }
}

function createManager() {
  const capabilities = ref<Record<string, IntelligenceCapabilityConfig>>(builtins())
  const providers = ref([
    { id: 'nexus', name: 'Nexus', type: 'openai', enabled: true, models: [] },
    { id: 'openai', name: 'OpenAI', type: 'openai', enabled: true, models: ['gpt-4o'] }
  ])
  return {
    capabilities,
    providers,
    setCapabilityProviders: vi.fn((id: string, bindings: unknown[]) => {
      capabilities.value = {
        ...capabilities.value,
        [id]: { ...capabilities.value[id]!, providers: bindings as never }
      }
    }),
    updateCapability: vi.fn((id: string, patch: Partial<IntelligenceCapabilityConfig>) => {
      capabilities.value = { ...capabilities.value, [id]: { ...capabilities.value[id]!, ...patch } }
    }),
    updateProvider: vi.fn(),
    saveSettings: vi.fn(() => Promise.resolve())
  }
}

function manager() {
  return store.manager as ReturnType<typeof createManager>
}

/* ─── helpers ─── */

const mounted: VueWrapper[] = []

async function mountPage(): Promise<VueWrapper> {
  const wrapper = mount(SettingSkills, {
    props: { title: 'Skills' },
    attachTo: document.body,
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

function localRows(wrapper: VueWrapper): DOMWrapper<Element>[] {
  return wrapper.findAll('[data-testid="skills-local-list"] .ResourceRow')
}

function localIds(wrapper: VueWrapper): string[] {
  return localRows(wrapper).map((row) => row.attributes('data-skill-id') ?? '')
}

function builtinIds(wrapper: VueWrapper): string[] {
  return wrapper
    .findAll('[data-testid="skills-builtin-list"] .ResourceRow')
    .map((row) => row.attributes('data-capability-id') ?? '')
}

function localRow(wrapper: VueWrapper, id: string): DOMWrapper<Element> {
  const found = wrapper.find(`[data-testid="skills-local-list"] [data-skill-id="${id}"]`)
  if (!found.exists()) throw new Error(`no row ${id}`)
  return found
}

function builtinRow(wrapper: VueWrapper, id: string): DOMWrapper<Element> {
  const found = wrapper.find(`[data-testid="skills-builtin-list"] [data-capability-id="${id}"]`)
  if (!found.exists()) throw new Error(`no built-in row ${id}`)
  return found
}

function chip(wrapper: VueWrapper, agentId: string): DOMWrapper<Element> {
  const found = wrapper
    .findAll('button.tx-bui-filter-chips__chip')
    .find((candidate) => candidate.find(`[data-agent-chip="${agentId}"]`).exists())
  if (!found) throw new Error(`no chip for ${agentId}`)
  return found
}

function buttonLabelled(wrapper: VueWrapper | DOMWrapper<Element>, label: string) {
  const button = wrapper.findAll('button').find((candidate) => candidate.text() === label)
  if (!button) throw new Error(`no button labelled ${label}`)
  return button
}

/**
 * A drawer's own element. TxDrawer's root is a teleport and takes no attributes, so each drawer is
 * found by the handle its always-present footer carries.
 */
function drawerNamed(wrapper: VueWrapper, handle: string): DOMWrapper<Element> {
  const found = wrapper
    .findAll('.tx-drawer')
    .find((candidate) => candidate.find(`[data-drawer="${handle}"]`).exists())
  if (!found) throw new Error(`no drawer ${handle}`)
  return found
}

function drawer(wrapper: VueWrapper): DOMWrapper<Element> {
  return drawerNamed(wrapper, 'skill')
}

function drawerOpen(wrapper: VueWrapper): boolean {
  return drawer(wrapper).classes().includes('tx-drawer--visible')
}

function editorStub(wrapper: VueWrapper) {
  return wrapper.findComponent({ name: 'IntelligenceCapabilityInfo' })
}

async function openBuiltin(wrapper: VueWrapper, id: string) {
  await builtinRow(wrapper, id).find('button.ResourceRow-Hit').trigger('click')
  await flushPromises()
  const info = editorStub(wrapper)
  if (!info.exists()) throw new Error('the built-in drawer did not open')
  return info
}

async function closeDrawer(wrapper: VueWrapper): Promise<void> {
  await drawer(wrapper).find('button.tx-drawer__close').trigger('click')
  await flushPromises()
}

function dialog(wrapper: VueWrapper): DOMWrapper<Element> {
  return wrapper.find('.tx-bottom-dialog')
}

beforeEach(() => {
  for (const mock of Object.values(sdk)) mock.mockReset()
  toast.error.mockReset()
  toast.success.mockReset()
  store.manager = createManager()
  store.hydrated = true
  editor.nestedOpen = false
  editor.onFlush = null
  sdk.inventory.mockResolvedValue(inventory())
})

afterEach(() => {
  while (mounted.length > 0) mounted.pop()!.unmount()
})

/* ─── the list ─── */

describe('settingSkills: the list', () => {
  it('draws one row per real file: a file Claude and Pi share is one row, a same-named file is another', async () => {
    const wrapper = await mountPage()

    expect(localIds(wrapper)).toEqual([
      'local:apple',
      'local:lark-codex',
      'local:lark-shared',
      'imported-review'
    ])
    const marks = (id: string) =>
      localRow(wrapper, id)
        .findAll('.AgentIconRow-Item')
        .map((mark) => `${mark.attributes('data-agent-id')}:${mark.attributes('data-configured')}`)
    // The shared file: Claude Code and Pi lit, stored in the root that physically holds it.
    expect(marks('local:lark-shared')).toEqual(['claude:true', 'codex:false', 'pi:true'])
    expect(localRow(wrapper, 'local:lark-shared').find('.ResourceRow-Tags').text()).toBe(
      'settings.skillsPage.storage.agentsShared'
    )
    // The same name in cc-switch's library is a different file: its own row, Codex only.
    expect(marks('local:lark-codex')).toEqual(['claude:false', 'codex:true', 'pi:false'])
    expect(localRow(wrapper, 'local:lark-codex').find('.ResourceRow-Tags').text()).toBe(
      'settings.skillsPage.storage.ccSwitch'
    )
  })

  it('hints at the real file behind each label when rows share a name, and nowhere else', async () => {
    const wrapper = await mountPage()
    const hint = (id: string): unknown =>
      localRow(wrapper, id)
        .findAllComponents(TxTooltip)
        .map((tooltip: { props: (key: string) => unknown }) => tooltip.props('content'))
        .find((content: unknown) => typeof content === 'string' && content.startsWith('/'))

    expect(hint('local:lark-codex')).toBe('/Users/me/.cc-switch/skills/lark-approval')
    expect(hint('local:lark-shared')).toBe('/Users/me/.agents/skills/lark-approval')
    expect(hint('local:apple')).toBeUndefined()
  })

  it('shows a one-line description, the storage label and Tuff’s own switch on every row', async () => {
    const wrapper = await mountPage()
    const row = localRow(wrapper, 'imported-review')

    expect(row.find('.ResourceRow-Desc').text()).toBe('Review a pull request')
    expect(row.find('.ResourceRow-Tags').text()).toBe('settings.skillsPage.storage.tuffImport')
    const control = row.find('button[role="switch"]')
    expect(control.attributes('aria-checked')).toBe('false')
    expect(control.attributes('aria-label')).toBe(
      'settings.skillsPage.switchLabel:{"name":"review-pr"}'
    )
  })

  it('counts what Tuff offers and filters by agent, the same chip again showing everything', async () => {
    const wrapper = await mountPage()

    expect(wrapper.find('.ResourceAgentBar-Summary').text()).toBe(
      'settings.resources.enabledLabel 3 / 4'
    )
    expect(chip(wrapper, 'codex').text()).toBe('Codex2')
    expect(
      wrapper.findAll('[data-agent-chip]').map((mark) => mark.attributes('data-agent-chip'))
    ).toEqual(['claude', 'codex', 'pi'])

    await chip(wrapper, 'codex').trigger('click')
    expect(localIds(wrapper)).toEqual(['local:lark-codex', 'imported-review'])
    // Built-in skills belong to no agent, so a chosen agent leaves none of them.
    expect(wrapper.find('[data-testid="skills-builtin"]').exists()).toBe(false)

    await chip(wrapper, 'codex').trigger('click')
    expect(localIds(wrapper)).toHaveLength(4)
    expect(builtinIds(wrapper)).toHaveLength(3)
  })

  it('searches both groups, says so when nothing matches, and clears both filters in one go', async () => {
    const wrapper = await mountPage()
    const search = wrapper.find('input[data-testid="skills-search"]')

    await search.setValue('lark')
    expect(localIds(wrapper)).toEqual(['local:lark-codex', 'local:lark-shared'])
    expect(wrapper.find('[data-testid="skills-builtin"]').exists()).toBe(false)

    await search.setValue('translate')
    expect(wrapper.find('[data-testid="skills-local"]').exists()).toBe(false)
    expect(builtinIds(wrapper)).toEqual(['text.translate'])

    await search.setValue('pi')
    // Agent names count: Pi links the shared copy of lark-approval.
    expect(localIds(wrapper)).toContain('local:lark-shared')

    await chip(wrapper, 'claude').trigger('click')
    await search.setValue('nothing-like-this')
    const empty = wrapper.find('[data-testid="skills-search-empty"]')
    expect(empty.text()).toContain('settings.skillsPage.searchEmptyTitle')

    await buttonLabelled(empty, 'settings.skillsPage.clearFilters').trigger('click')
    expect(localIds(wrapper)).toHaveLength(4)
    expect(builtinIds(wrapper)).toHaveLength(3)
  })

  it('lists the built-in skills in their old order with channel · model and a hint, never an agent strip', async () => {
    const wrapper = await mountPage()

    expect(builtinIds(wrapper)).toEqual(['text.chat', 'text.translate', 'vision.ocr'])
    const chat = builtinRow(wrapper, 'text.chat')
    // "Nexus · gpt-4o-mini", and one more channel behind it.
    const summary = chat.find('.ResourceRow-Desc').text()
    expect(summary).toContain('settings.skillsPage.builtinMore')
    expect(summary).toContain('Nexus')
    expect(summary).toContain('gpt-4o-mini')
    expect(summary).toContain('"count":1')
    expect(builtinRow(wrapper, 'vision.ocr').find('.ResourceRow-Desc').text()).toBe(
      'settings.skillsPage.builtinNoChannel'
    )
    expect(chat.find('.ResourceRow-Hint').text()).toBe('settings.skillsPage.configureHint')
    expect(chat.find('.AgentIconRow').exists()).toBe(false)
    expect(chat.find('button[role="switch"]').exists()).toBe(false)
    expect(chat.find('button.ResourceRow-Hit').attributes('aria-label')).toBe(
      'settings.skillsPage.openBuiltin:{"name":"Chat"}'
    )
  })
})

/* ─── switches ─── */

describe('settingSkills: one switch per skill, at once', () => {
  it('switches a file on disk through Tuff’s own list and leaves every other row as it was', async () => {
    const wrapper = await mountPage()
    sdk.setEnabled.mockResolvedValue({
      dirs: [],
      skills: [
        {
          id: 'local:lark-shared',
          name: 'lark-approval',
          description: '',
          path: '/Users/me/.agents/skills/lark-approval',
          sourceDir: '/Users/me/.agents/skills',
          enabled: false
        }
      ]
    })

    await localRow(wrapper, 'local:lark-shared').find('button[role="switch"]').trigger('click')
    await flushPromises()

    expect(sdk.setEnabled).toHaveBeenCalledWith('local:lark-shared', false)
    expect(sdk.setImportedActive).not.toHaveBeenCalled()
    expect(
      localRow(wrapper, 'local:lark-shared')
        .find('button[role="switch"]')
        .attributes('aria-checked')
    ).toBe('false')
    expect(
      localRow(wrapper, 'local:lark-codex').find('button[role="switch"]').attributes('aria-checked')
    ).toBe('true')
    // No rescan was needed: the answer carried the new state.
    expect(sdk.inventory).toHaveBeenCalledTimes(1)
  })

  it('switches an imported copy through its own item', async () => {
    const wrapper = await mountPage()
    sdk.setImportedActive.mockResolvedValue({ id: 'imported-review', active: true })

    await localRow(wrapper, 'imported-review').find('button[role="switch"]').trigger('click')
    await flushPromises()

    expect(sdk.setImportedActive).toHaveBeenCalledWith({ itemId: 'imported-review', active: true })
    expect(sdk.setEnabled).not.toHaveBeenCalled()
    expect(
      localRow(wrapper, 'imported-review').find('button[role="switch"]').attributes('aria-checked')
    ).toBe('true')
  })

  it('says why a switch failed and reads the machine again', async () => {
    const wrapper = await mountPage()
    sdk.setEnabled.mockRejectedValue(new Error('disk is read-only'))

    await localRow(wrapper, 'local:apple').find('button[role="switch"]').trigger('click')
    await flushPromises()

    expect(toast.error).toHaveBeenCalledWith(
      'settings.skillsPage.toggleFailed:{"name":"apple-design","reason":"disk is read-only"}'
    )
    expect(sdk.inventory).toHaveBeenCalledTimes(2)
  })
})

/* ─── the skill drawer ─── */

describe('settingSkills: a skill on this machine', () => {
  it('lists every agent with its entry, the real path and the storage root, and is read-only', async () => {
    const wrapper = await mountPage()

    await localRow(wrapper, 'local:lark-shared').find('button.ResourceRow-Hit').trigger('click')
    await flushPromises()

    const detail = wrapper.find('.SkillDetail')
    const sources = detail.findAll('.SkillDetail-Source').map((source) => source.text())
    expect(sources).toEqual([
      'Claude Code/Users/me/.claude/skills/lark-approval',
      'Pi/Users/me/.pi/agent/skills/lark-approval'
    ])
    const location = detail.find('.SkillDetail-Location').text()
    expect(location).toContain('/Users/me/.agents/skills/lark-approval')
    expect(location).toContain('settings.skillsPage.storage.agentsShared')
    expect(location).toContain('/Users/me/.agents/skills')
    expect(wrapper.find('[data-testid="skill-read-only"]').text()).toBe(
      'settings.skillsPage.readOnlyNote'
    )
    expect(localRow(wrapper, 'local:lark-shared').classes()).toContain('is-active')
  })

  it('switches the skill from the drawer exactly as from its row', async () => {
    const wrapper = await mountPage()
    sdk.setEnabled.mockResolvedValue({ dirs: [], skills: [] })
    await localRow(wrapper, 'local:apple').find('button.ResourceRow-Hit').trigger('click')
    await flushPromises()

    await wrapper.find('.SkillDetail-Switch button[role="switch"]').trigger('click')
    await flushPromises()

    expect(sdk.setEnabled).toHaveBeenCalledWith('local:apple', false)
    expect(
      localRow(wrapper, 'local:apple').find('button[role="switch"]').attributes('aria-checked')
    ).toBe('false')
  })

  it('closes at once: a skill on disk has nothing to save', async () => {
    const wrapper = await mountPage()
    await localRow(wrapper, 'local:apple').find('button.ResourceRow-Hit').trigger('click')
    await flushPromises()

    await closeDrawer(wrapper)

    expect(drawerOpen(wrapper)).toBe(false)
    expect(dialog(wrapper).exists()).toBe(false)
  })
})

/* ─── the built-in skill drawer ─── */

describe('settingSkills: a built-in skill’s draft', () => {
  it('keeps an edit in the drawer: nothing reaches the store, and the test waits for a save', async () => {
    const wrapper = await mountPage()
    const info = await openBuiltin(wrapper, 'text.chat')
    expect(info.props('testBlockedReason')).toBeUndefined()

    info.vm.$emit('updateModels', 'nexus', ['gpt-4o'])
    await flushPromises()

    expect(manager().setCapabilityProviders).not.toHaveBeenCalled()
    expect(manager().capabilities.value['text.chat']!.providers![0]!.models).toEqual([
      'gpt-4o-mini'
    ])
    // The editor shows the draft over what is stored.
    expect(editorStub(wrapper).props('capability').providers[0].models).toEqual(['gpt-4o'])
    expect(editorStub(wrapper).props('testBlockedReason')).toBe('settings.skillsPage.testBlocked')
    expect(wrapper.find('[data-testid="skill-drawer-status"]').text()).toBe(
      'settings.skillsPage.unsaved'
    )
    expect(wrapper.find('[data-testid="skill-drawer-save"]').attributes('disabled')).toBeUndefined()

    // The test runs on what main holds, so a request arriving now is not sent.
    editorStub(wrapper).vm.$emit('test', { userInput: 'hello' })
    await flushPromises()
    expect(sdk.testCapability).not.toHaveBeenCalled()
  })

  it('asks before closing over unsaved changes, and Cancel keeps the drawer and the draft', async () => {
    const wrapper = await mountPage()
    const info = await openBuiltin(wrapper, 'text.chat')
    info.vm.$emit('updateModels', 'nexus', ['gpt-4o'])
    await flushPromises()

    await closeDrawer(wrapper)

    expect(dialog(wrapper).text()).toContain('settings.skillsPage.closeTitle:{"name":"Chat"}')
    expect(
      dialog(wrapper)
        .findAll('.tx-bottom-dialog__row')
        .map((row) => row.text())
    ).toEqual([
      'settings.skillsPage.closeSave',
      'settings.skillsPage.closeDiscard',
      'settings.skillsPage.closeCancel'
    ])
    await buttonLabelled(dialog(wrapper), 'settings.skillsPage.closeCancel').trigger('click')
    await settleDialog()

    expect(dialog(wrapper).exists()).toBe(false)
    expect(drawerOpen(wrapper)).toBe(true)
    expect(editorStub(wrapper).props('capability').providers[0].models).toEqual(['gpt-4o'])
    expect(manager().saveSettings).not.toHaveBeenCalled()
  })

  it('discards: the drawer closes and nothing is written', async () => {
    const wrapper = await mountPage()
    const info = await openBuiltin(wrapper, 'text.chat')
    info.vm.$emit('updateModels', 'nexus', ['gpt-4o'])
    await flushPromises()

    await closeDrawer(wrapper)
    await buttonLabelled(dialog(wrapper), 'settings.skillsPage.closeDiscard').trigger('click')
    await settleDialog()

    expect(drawerOpen(wrapper)).toBe(false)
    expect(manager().setCapabilityProviders).not.toHaveBeenCalled()
    expect(manager().saveSettings).not.toHaveBeenCalled()

    // Opening it again starts from what is stored.
    const again = await openBuiltin(wrapper, 'text.chat')
    expect(again.props('capability').providers[0].models).toEqual(['gpt-4o-mini'])
    expect(again.props('testBlockedReason')).toBeUndefined()
  })

  it('saves from the question: writes the draft, forces the save, closes, and the test is back', async () => {
    const wrapper = await mountPage()
    const info = await openBuiltin(wrapper, 'text.chat')
    info.vm.$emit('updateModels', 'nexus', ['gpt-4o'])
    await flushPromises()

    await closeDrawer(wrapper)
    await buttonLabelled(dialog(wrapper), 'settings.skillsPage.closeSave').trigger('click')
    await settleDialog()

    expect(manager().setCapabilityProviders).toHaveBeenCalledTimes(1)
    expect(manager().setCapabilityProviders.mock.calls[0]![0]).toBe('text.chat')
    expect(manager().capabilities.value['text.chat']!.providers![0]!.models).toEqual(['gpt-4o'])
    expect(manager().saveSettings).toHaveBeenCalledTimes(1)
    expect(drawerOpen(wrapper)).toBe(false)
    expect(toast.success).toHaveBeenCalledWith('settings.skillsPage.saved:{"name":"Chat"}')

    sdk.testCapability.mockResolvedValue({ success: true, message: 'ok' })
    const again = await openBuiltin(wrapper, 'text.chat')
    expect(again.props('testBlockedReason')).toBeUndefined()
    again.vm.$emit('test', { userInput: 'hello' })
    await flushPromises()
    expect(sdk.testCapability).toHaveBeenCalledWith(
      expect.objectContaining({ capabilityId: 'text.chat', userInput: 'hello' })
    )
  })

  it('saves from the footer and stays open', async () => {
    const wrapper = await mountPage()
    const info = await openBuiltin(wrapper, 'text.chat')
    info.vm.$emit('updatePrompt', 'text.chat', 'Be thorough.')
    await flushPromises()

    await wrapper.find('[data-testid="skill-drawer-save"]').trigger('click')
    await flushPromises()

    expect(manager().updateCapability).toHaveBeenCalledWith('text.chat', {
      promptTemplate: 'Be thorough.'
    })
    expect(manager().saveSettings).toHaveBeenCalledTimes(1)
    expect(drawerOpen(wrapper)).toBe(true)
    expect(editorStub(wrapper).props('testBlockedReason')).toBeUndefined()
    expect(wrapper.find('[data-testid="skill-drawer-save"]').attributes('disabled')).toBeDefined()
  })

  it('keeps the drawer open after a failed save, says why, and puts the store back', async () => {
    const wrapper = await mountPage()
    manager().saveSettings.mockRejectedValueOnce(
      Object.assign(new Error('persist failed'), {
        details: { reason: 'persist-failed', version: 7 }
      })
    )
    const info = await openBuiltin(wrapper, 'text.chat')
    info.vm.$emit('updateModels', 'nexus', ['gpt-4o'])
    await flushPromises()

    await wrapper.find('[data-testid="skill-drawer-save"]').trigger('click')
    await flushPromises()

    expect(drawerOpen(wrapper)).toBe(true)
    expect(wrapper.find('[data-testid="skill-drawer-status"]').text()).toBe(
      'settings.intelligence.capabilitySaveErrorWithDetail:{"detail":"settings.intelligence.capabilitySaveErrorPersist:{\\"version\\":7}"}'
    )
    // The write that failed is undone: no later save of the store can carry the edit.
    expect(manager().capabilities.value['text.chat']!.providers![0]!.models).toEqual([
      'gpt-4o-mini'
    ])
    // The edit is still the draft, so Save can try again and the test still waits.
    expect(editorStub(wrapper).props('capability').providers[0].models).toEqual(['gpt-4o'])
    expect(editorStub(wrapper).props('testBlockedReason')).toBe('settings.skillsPage.testBlocked')
    expect(wrapper.find('[data-testid="skill-drawer-save"]').attributes('disabled')).toBeUndefined()
  })

  it('closes without asking when a change was changed back', async () => {
    const wrapper = await mountPage()
    const info = await openBuiltin(wrapper, 'text.chat')
    info.vm.$emit('updateModels', 'nexus', ['gpt-4o'])
    info.vm.$emit('updateModels', 'nexus', ['gpt-4o-mini'])
    await flushPromises()

    await closeDrawer(wrapper)

    expect(dialog(wrapper).exists()).toBe(false)
    expect(drawerOpen(wrapper)).toBe(false)
  })

  it('counts a prompt still being typed as unsaved when the drawer closes', async () => {
    const wrapper = await mountPage()
    await openBuiltin(wrapper, 'text.chat')
    editor.onFlush = (emit) => emit('updatePrompt', 'text.chat', 'Typed, not handed over yet')

    await closeDrawer(wrapper)

    expect(dialog(wrapper).exists()).toBe(true)
  })

  it('takes no prompt for a skill other than the one open', async () => {
    const wrapper = await mountPage()
    const info = await openBuiltin(wrapper, 'text.chat')

    info.vm.$emit('updatePrompt', 'text.translate', 'stale')
    await flushPromises()

    expect(editorStub(wrapper).props('testBlockedReason')).toBeUndefined()
    await closeDrawer(wrapper)
    expect(dialog(wrapper).exists()).toBe(false)
  })

  it('leaves an Escape meant for a drawer nested in the editor to that drawer', async () => {
    const wrapper = await mountPage()
    const info = await openBuiltin(wrapper, 'text.chat')
    info.vm.$emit('updateModels', 'nexus', ['gpt-4o'])
    await flushPromises()
    editor.nestedOpen = true

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()

    expect(dialog(wrapper).exists()).toBe(false)
    expect(drawerOpen(wrapper)).toBe(true)

    editor.nestedOpen = false
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(dialog(wrapper).exists()).toBe(true)
  })
})

/* ─── directories ─── */

describe('settingSkills: skill directories', () => {
  it('lists the detected roots read-only and the user’s own directories with Remove', async () => {
    const wrapper = await mountPage()

    await wrapper.find('[data-testid="skills-add-dir"]').trigger('click')
    await flushPromises()

    const linked = wrapper.find('[data-testid="skill-dirs-linked"]')
    expect(linked.find('[data-dir-path="/Users/me/my-skills"]').exists()).toBe(true)
    expect(buttonLabelled(linked, 'settings.skillsPage.dirRemove').exists()).toBe(true)
    const detected = wrapper.find('[data-testid="skill-dirs-detected"]')
    expect(detected.findAll('.SkillDirs-Owner').map((owner) => owner.text())).toEqual([
      'Claude Code',
      'Codex',
      'settings.skillsPage.storage.agentsShared'
    ])
    expect(detected.findAll('button')).toHaveLength(0)
  })

  it('adds a directory the user picks and reads the machine again', async () => {
    const wrapper = await mountPage()
    sdk.transportSend.mockResolvedValue({ filePaths: ['/Users/me/new-skills'] })
    sdk.addDir.mockResolvedValue({ dirs: [], skills: [] })
    await wrapper.find('[data-testid="skills-add-dir"]').trigger('click')

    await wrapper.find('[data-testid="skill-dirs-add"]').trigger('click')
    await flushPromises()

    expect(String(sdk.transportSend.mock.calls[0]![0])).toBe('dialog:open-file')
    expect(sdk.transportSend.mock.calls[0]![1]).toMatchObject({ properties: ['openDirectory'] })
    expect(sdk.addDir).toHaveBeenCalledWith('/Users/me/new-skills')
    expect(sdk.inventory).toHaveBeenCalledTimes(2)
    expect(toast.success).toHaveBeenCalledWith('settings.skillsPage.dirAdded')
  })

  it('adds nothing when the picker is cancelled', async () => {
    const wrapper = await mountPage()
    sdk.transportSend.mockResolvedValue({ filePaths: [] })
    await wrapper.find('[data-testid="skills-add-dir"]').trigger('click')

    await wrapper.find('[data-testid="skill-dirs-add"]').trigger('click')
    await flushPromises()

    expect(sdk.addDir).not.toHaveBeenCalled()
    expect(sdk.inventory).toHaveBeenCalledTimes(1)
  })

  it('removes a directory the user added, which only unlinks it', async () => {
    const wrapper = await mountPage()
    sdk.removeDir.mockResolvedValue({ dirs: [], skills: [] })
    await wrapper.find('[data-testid="skills-add-dir"]').trigger('click')

    await buttonLabelled(
      wrapper.find('[data-testid="skill-dirs-linked"]'),
      'settings.skillsPage.dirRemove'
    ).trigger('click')
    await flushPromises()

    expect(sdk.removeDir).toHaveBeenCalledWith('/Users/me/my-skills')
    expect(sdk.inventory).toHaveBeenCalledTimes(2)
  })
})

/* ─── states ─── */

describe('settingSkills: states', () => {
  it('draws a skeleton of the bar, field, both headings and rows on a slow first read', async () => {
    let resolve!: (value: SkillInventorySnapshot) => void
    sdk.inventory.mockReturnValueOnce(new Promise((done) => (resolve = done)))
    const wrapper = mount(SettingSkills, {
      props: { title: 'Skills' },
      global: { stubs: { teleport: true } }
    })
    mounted.push(wrapper)
    await new Promise((done) => setTimeout(done, 200))

    const skeleton = wrapper.find('[data-testid="skills-skeleton"]')
    expect(skeleton.exists()).toBe(true)
    expect(skeleton.attributes('aria-hidden')).toBe('true')
    expect(skeleton.find('.ResourceAgentBar.is-placeholder').exists()).toBe(true)
    expect(skeleton.findAll('.SkillsPage-GroupTitle').map((title) => title.text())).toEqual([
      'settings.skillsPage.localGroup',
      'settings.skillsPage.builtinGroup'
    ])
    const [local, builtin] = skeleton.findAll('.SkillsPage-List')
    expect(local!.findAll('.ResourceRow.is-placeholder')).toHaveLength(4)
    expect(local!.find('.ResourceRow-AgentsPlaceholder').exists()).toBe(true)
    // Built-in rows: no label chip, no agents, no switch — an open hint, as loaded.
    expect(builtin!.findAll('.ResourceRow.is-placeholder')).toHaveLength(3)
    expect(builtin!.find('.ResourceRow-Tags').exists()).toBe(false)
    expect(builtin!.find('.ResourceRow-AgentsPlaceholder').exists()).toBe(false)
    expect(builtin!.find('.ResourceRow-Hint').exists()).toBe(true)
    expect(wrapper.find('h1').text()).toBe('Skills')

    resolve(inventory())
    await flushPromises()
    await new Promise((done) => setTimeout(done, 450))
    await flushPromises()

    expect(wrapper.find('[data-testid="skills-skeleton"]').exists()).toBe(false)
    expect(localIds(wrapper)).toHaveLength(4)
  })

  it('says the scan failed, offers a retry, and still lists the built-in skills', async () => {
    sdk.inventory.mockRejectedValueOnce(new Error('The operation failed. Please retry.'))
    const wrapper = await mountPage()

    const notice = wrapper.find('[data-testid="skills-scan-failed"]')
    expect(notice.attributes('role')).toBe('alert')
    expect(notice.text()).toContain('settings.skillsPage.scanFailedTitle')
    expect(builtinIds(wrapper)).toHaveLength(3)
    expect(wrapper.find('[data-testid="skills-local"]').exists()).toBe(false)

    await buttonLabelled(notice, 'settings.skillsPage.retry').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="skills-scan-failed"]').exists()).toBe(false)
    expect(localIds(wrapper)).toHaveLength(4)
  })

  it('keeps the rows on screen when a rescan fails', async () => {
    const wrapper = await mountPage()
    sdk.inventory.mockRejectedValueOnce(new Error('The operation failed. Please retry.'))

    await wrapper.find('[data-testid="skills-rescan"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="skills-scan-failed"]').exists()).toBe(true)
    expect(localIds(wrapper)).toHaveLength(4)
  })

  it('has an empty state with a way to add a directory when the machine has no skills', async () => {
    sdk.inventory.mockResolvedValue(inventory({ rows: [], agents: [], dirs: [] }))
    const wrapper = await mountPage()

    const empty = wrapper.find('[data-testid="skills-empty"]')
    expect(empty.text()).toContain('settings.skillsPage.emptyTitle')
    expect(wrapper.find('.ResourceAgentBar-Summary').text()).toBe(
      'settings.resources.enabledLabel 0 / 0'
    )
    // The built-in skills are Tuff's own and are always there.
    expect(builtinIds(wrapper)).toHaveLength(3)

    await buttonLabelled(empty, 'settings.skillsPage.addDir').trigger('click')
    await flushPromises()
    expect(drawerNamed(wrapper, 'dirs').classes()).toContain('tx-drawer--visible')
  })
})

describe('settingSkills: test hygiene', () => {
  /**
   * The guard behind the reduced-motion stub at the top of this file: a pressed `TxButton` draws no
   * ripple, so no ripple timer is left to fire after the environment is torn down.
   */
  it('draws no button ripple, so nothing outlives the test', async () => {
    const wrapper = await mountPage()
    const rescan = wrapper.find('[data-testid="skills-rescan"]')
    // TxButton loads its ripple directive with a dynamic import; wait until it has attached.
    await vi.waitFor(() => expect(rescan.attributes('data-v-wave-boundary')).toBe('true'), {
      timeout: 5000,
      interval: 10
    })

    await rescan.trigger('click')

    expect(rescan.element.querySelector('[data-v-wave-container-internal]')).toBeNull()
  })
})
