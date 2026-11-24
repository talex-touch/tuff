// @vitest-environment jsdom

import type { HerdrProjectedConversation } from '@talex-touch/utils/transport/sdk/domains/herdr'
import type { HerdrProjectedSession } from '~/modules/herdr/useHerdrRuntime'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, reactive, ref } from 'vue'

enableAutoUnmount(afterEach)

const mocks = vi.hoisted(() => ({
  watchProjection: vi.fn(async () => null),
  unwatchProjection: vi.fn(async () => {}),
  refreshProjection: vi.fn(async () => null),
  send: vi.fn(async () => ({ turn: 1, status: 'working', started: true })),
  interrupt: vi.fn(async () => ({ terminal: 't1', action: 'interrupt', outcome: 'stopped' })),
  isWatchingProjection: vi.fn(() => false)
}))

const sessionsRef = ref<HerdrProjectedSession[]>([])
const projectionsMap = reactive<Record<string, HerdrProjectedConversation>>({})
const loadingMap = reactive<Record<string, boolean>>({})
const drawerTabsRef = ref<Array<{ id: string; kind: 'herdr' | 'local'; address?: string }>>([])

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: ref('en-US') })
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn()
  }
}))

vi.mock('~/modules/herdr/useHerdrRuntime', () => ({
  useHerdrRuntime: () => ({
    sessionByAddress: computed(() => {
      const map = new Map<string, HerdrProjectedSession>()
      for (const s of sessionsRef.value) map.set(s.address, s)
      return map
    }),
    projectionsByAddress: projectionsMap,
    projectionLoadingByAddress: loadingMap,
    drawerTabs: drawerTabsRef,
    watchProjection: mocks.watchProjection,
    unwatchProjection: mocks.unwatchProjection,
    refreshProjection: mocks.refreshProjection,
    isWatchingProjection: mocks.isWatchingProjection,
    send: mocks.send,
    interrupt: mocks.interrupt
  })
}))

vi.mock('@talex-touch/tuffex/skeleton', () => ({
  TxRowSkeleton: {
    name: 'TxRowSkeleton',
    template: '<div data-testid="tx-row-skeleton" />'
  }
}))

vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: {
    name: 'TxButton',
    props: {
      nativeType: { type: String, default: 'button' },
      disabled: { type: Boolean, default: false },
      loading: { type: Boolean, default: false }
    },
    emits: ['click'],
    template:
      '<button :type="nativeType || \'button\'" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>'
  }
}))

import ShellHerdrConversationView from './ShellHerdrConversationView.vue'

function makeSession(overrides: Partial<HerdrProjectedSession> = {}): HerdrProjectedSession {
  return {
    address: 't1',
    machine: null,
    name: 'claude-task',
    title: '',
    argv: ['claude'],
    cwd: '/Users/dev/app',
    foregroundName: 'claude',
    foregroundCwd: '/Users/dev/app',
    foregroundPid: 100,
    state: 'live',
    status: { state: 'working', app: 'claude', progress: 55 },
    statusMs: 1000,
    reported: true,
    turn: 3,
    keep: false,
    template: null,
    parent: null,
    labels: {},
    cols: 80,
    rows: 24,
    pid: 100,
    exitCode: null,
    signal: null,
    reason: null,
    screen: 'exact',
    createdMs: 900,
    finishedMs: null,
    projectId: 'p1',
    projectName: 'Tuff',
    displayTitle: 'claude-task',
    ...overrides
  }
}

describe('ShellHerdrConversationView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionsRef.value = [makeSession()]
    drawerTabsRef.value = [{ id: 'herdr:t1', kind: 'herdr', address: 't1' }]
    for (const key of Object.keys(projectionsMap)) delete projectionsMap[key]
    for (const key of Object.keys(loadingMap)) delete loadingMap[key]
  })

  it('renders TxRowSkeleton during initial projection load', () => {
    loadingMap.t1 = true
    const wrapper = mount(ShellHerdrConversationView, { props: { address: 't1' } })
    expect(wrapper.find('[data-testid="tx-row-skeleton"]').exists()).toBe(true)
    expect(mocks.watchProjection).toHaveBeenCalledWith('t1')
  })

  it('renders structured timeline with provider badge, reasoning disclosure, tool call chips, and truncated notice', async () => {
    projectionsMap.t1 = {
      address: 't1',
      provider: 'claude',
      nativeSessionId: 'c-1',
      filePath: '/tmp/c-1.jsonl',
      available: true,
      truncated: true,
      updatedAt: 2000,
      messages: [
        { id: 'm1', role: 'user', text: 'Fix unit tests', timestamp: 1000 },
        {
          id: 'm2',
          role: 'assistant',
          text: 'Inspecting failing spec.',
          reasoning: 'First check the import path.',
          toolCalls: [
            {
              id: 'tc-1',
              name: 'read_file',
              status: 'completed',
              argsPreview: '{"path":"foo.ts"}',
              outputPreview: 'export const x = 1'
            },
            {
              id: 'tc-2',
              name: 'bash',
              status: 'running'
            }
          ],
          timestamp: 1500
        }
      ]
    }

    const wrapper = mount(ShellHerdrConversationView, { props: { address: 't1' } })

    expect(wrapper.find('[data-testid="herdr-conv-provider"]').text()).toContain('Claude Code')
    expect(wrapper.find('[data-testid="herdr-conv-project"]').text()).toContain('Tuff')
    expect(wrapper.find('[data-testid="herdr-conv-progress"]').attributes('aria-valuenow')).toBe(
      '55'
    )
    expect(wrapper.find('[data-testid="herdr-conv-truncated"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="herdr-conv-message"]')).toHaveLength(2)

    // Reasoning is collapsed by default and toggles open via semantic button.
    expect(wrapper.find('[data-testid="herdr-conv-reasoning-body"]').exists()).toBe(false)
    await wrapper.find('[data-testid="herdr-conv-reasoning-toggle"]').trigger('click')
    expect(wrapper.find('[data-testid="herdr-conv-reasoning-body"]').text()).toContain(
      'First check the import path.'
    )

    // Tool call chip expands args & output previews.
    expect(wrapper.find('[data-testid="herdr-conv-tool-detail"]').exists()).toBe(false)
    const toolChips = wrapper.findAll('[data-testid="herdr-conv-tool-chip"]')
    expect(toolChips).toHaveLength(2)
    await toolChips[0]!.trigger('click')
    const detail = wrapper.find('[data-testid="herdr-conv-tool-detail"]')
    expect(detail.exists()).toBe(true)
    expect(detail.text()).toContain('foo.ts')
    expect(detail.text()).toContain('export const x = 1')

    // Composer submits text to herdr.send and stop button triggers herdr.interrupt while working.
    await wrapper.find('[data-testid="herdr-conv-composer-input"]').setValue('looks good')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(mocks.send).toHaveBeenCalledWith('t1', 'looks good')

    await wrapper.find('[data-testid="herdr-conv-stop-btn"]').trigger('click')
    expect(mocks.interrupt).toHaveBeenCalledWith('t1')
  })

  it('shows prominent Blocked Action Banner with one-click Take Over in Terminal button', async () => {
    sessionsRef.value = [
      makeSession({
        status: {
          state: 'blocked',
          app: 'claude',
          kind: 'permission',
          msg: 'Allow running rm -rf dist?'
        }
      })
    ]
    projectionsMap.t1 = {
      address: 't1',
      provider: 'claude',
      nativeSessionId: 'c-1',
      filePath: '/tmp/c-1.jsonl',
      available: true,
      truncated: false,
      updatedAt: 2000,
      messages: []
    }

    const wrapper = mount(ShellHerdrConversationView, { props: { address: 't1' } })

    const banner = wrapper.find('[data-testid="herdr-conv-blocked-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('herdr.blockedKind.permission')
    expect(banner.text()).toContain('Allow running rm -rf dist?')

    await wrapper.find('[data-testid="herdr-conv-takeover-btn"]').trigger('click')
    expect(wrapper.emitted('switch-terminal')).toHaveLength(1)
  })

  it('renders graceful non-JSONL status card with Open Raw Terminal and working composer', async () => {
    sessionsRef.value = [
      makeSession({
        address: 'prod/t2',
        machine: 'prod',
        argv: ['zsh'],
        foregroundName: 'htop',
        cwd: '/srv/app',
        foregroundCwd: '/srv/app',
        status: { state: 'idle' }
      })
    ]
    projectionsMap['prod/t2'] = {
      address: 'prod/t2',
      provider: null,
      nativeSessionId: null,
      filePath: null,
      available: false,
      truncated: false,
      updatedAt: 2000,
      messages: []
    }

    const wrapper = mount(ShellHerdrConversationView, { props: { address: 'prod/t2' } })

    const nonJsonl = wrapper.find('[data-testid="herdr-conv-non-jsonl"]')
    expect(nonJsonl.exists()).toBe(true)
    expect(nonJsonl.text()).toContain('htop')
    expect(nonJsonl.text()).toContain('/srv/app')

    await wrapper.find('[data-testid="herdr-conv-open-terminal-btn"]').trigger('click')
    expect(wrapper.emitted('switch-terminal')).toHaveLength(1)

    await wrapper.find('[data-testid="herdr-conv-composer-input"]').setValue('uptime')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(mocks.send).toHaveBeenCalledWith('prod/t2', 'uptime')
  })
})
