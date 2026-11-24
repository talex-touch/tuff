// @vitest-environment jsdom
/**
 * The scheduler row inside the model menu: the coordinator and the enabled CLI profiles as chips,
 * the current one pressed, locked ones refused, profile switches behind the gear. TxFilterChips,
 * TxSwitch and TxSkeleton are the real ones.
 */
import type { AiAgentProfile } from '@talex-touch/utils/types/ai-orchestrator'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import HomeSchedulerRow from './HomeSchedulerRow.vue'
import { schedulerShortName, selectedSchedulerName } from './scheduler'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

function profile(id: string, name: string, enabled = true): AiAgentProfile {
  return {
    id,
    name,
    enabled,
    runtimeProvider: 'pi-core',
    allowedToolIds: [],
    permissionPolicy: { mode: 'manual' }
  } as unknown as AiAgentProfile
}

const COORDINATOR = profile('tuff-pi', 'Tuff Pi Coordinator')
const CODEX = profile('cli-codex', 'Codex CLI')
const OFF = profile('cli-omp', 'OMP', false)
const PROFILES = [COORDINATOR, CODEX, OFF]

function mountRow(props: Record<string, unknown> = {}) {
  return mount(HomeSchedulerRow, {
    props: {
      mode: 'agent',
      profileId: 'tuff-pi',
      profiles: PROFILES,
      profilesLoading: false,
      profilesError: false,
      profileSaving: null,
      branchOnChange: false,
      locked: false,
      ...props
    },
    attachTo: document.body
  })
}

function chipButtons(wrapper: ReturnType<typeof mountRow>) {
  return wrapper.findAll('.HomeSchedulerRow-Chips button')
}

describe('scheduler naming', () => {
  it('drops the role word and falls back before profiles load', () => {
    expect(schedulerShortName('Tuff Pi Coordinator')).toBe('Tuff Pi')
    expect(schedulerShortName('Coordinator')).toBe('Coordinator')
    expect(selectedSchedulerName('agent', undefined, PROFILES, 'fb')).toBe('Tuff Pi')
    expect(selectedSchedulerName('agent', 'cli-codex', PROFILES, 'fb')).toBe('Codex CLI')
    expect(selectedSchedulerName('chat', 'cli-codex', PROFILES, 'fb')).toBe('Tuff Pi')
    expect(selectedSchedulerName('agent', undefined, [], 'fb')).toBe('fb')
  })
})

describe('HomeSchedulerRow', () => {
  it('lists the coordinator and the enabled CLI profiles, and reads profiles on mount', () => {
    const wrapper = mountRow()
    expect(chipButtons(wrapper).map((chip) => chip.text())).toEqual(['Tuff Pi', 'Codex CLI'])
    expect(wrapper.emitted('load-profiles')).toHaveLength(1)
    wrapper.unmount()
  })

  it('picks another scheduler, and ignores the one already running', async () => {
    const wrapper = mountRow()
    await chipButtons(wrapper)[0]!.trigger('click')
    expect(wrapper.emitted('select-agent')).toBeUndefined()
    await chipButtons(wrapper)[1]!.trigger('click')
    expect(wrapper.emitted('select-agent')).toEqual([['cli-codex']])
    wrapper.unmount()
  })

  it('refuses other schedulers while Main is mid-turn and says why', async () => {
    const wrapper = mountRow({ locked: true, branchOnChange: true })
    await chipButtons(wrapper)[1]!.trigger('click')
    expect(wrapper.emitted('select-agent')).toBeUndefined()
    expect(wrapper.get('.HomeSchedulerRow-Note').text()).toBe('home.workspace.mode.branchLocked')
    wrapper.unmount()
  })

  it('keeps the profile switches behind the gear', async () => {
    const wrapper = mountRow()
    expect(wrapper.find('.HomeSchedulerRow-Manage').exists()).toBe(false)
    await wrapper.get('.HomeSchedulerRow-Gear').trigger('click')
    expect(wrapper.findAll('.HomeSchedulerRow-ManageRow')).toHaveLength(3)
    wrapper.unmount()
  })
})
