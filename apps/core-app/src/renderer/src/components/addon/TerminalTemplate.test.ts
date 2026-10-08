// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file */
import type { TerminalCreateRequest } from '@talex-touch/utils/transport/events/terminal'
import type { VueWrapper } from '@vue/test-utils'
import { TerminalEvents } from '@talex-touch/utils/transport/events/terminal'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import TerminalTemplate from './TerminalTemplate.vue'

const transport = vi.hoisted(() => ({
  send: vi.fn(),
  listeners: new Map<unknown, Set<(payload: unknown) => void>>()
}))
vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: transport.send,
    on: (event: unknown, listener: (payload: unknown) => void) => {
      const entries = transport.listeners.get(event) ?? new Set()
      entries.add(listener)
      transport.listeners.set(event, entries)
      return () => entries.delete(listener)
    }
  })
}))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: { code: number }) => (values ? `${key}:${values.code}` : key)
  })
}))
vi.mock('~/utils/renderer-log', () => ({
  createRendererLogger: () => ({ error: () => undefined })
}))
vi.mock('@talex-touch/tuffex/button', () => ({
  TxButton: defineComponent({
    props: {
      disabled: Boolean,
      loading: Boolean
    },
    setup(props, { slots }) {
      return () => h('button', { disabled: props.disabled || props.loading }, slots.default?.())
    }
  })
}))
vi.mock('@talex-touch/tuffex/terminal', () => ({
  TxTerminal: defineComponent({
    setup(_props, { expose }) {
      const output = ref('')
      expose({
        write: async (data: string) => {
          output.value += data
        },
        reset: () => {
          output.value = ''
        },
        getSize: () => ({ cols: 100, rows: 30 }),
        focus: () => undefined
      })
      return () => h('pre', output.value)
    }
  })
}))

enableAutoUnmount(afterEach)
const closed: string[] = []
let creates = 0
let processToken: string | undefined
function emit(event: unknown, payload: unknown): void {
  transport.listeners.get(event)?.forEach((listener) => listener(payload))
}
beforeEach(() => {
  transport.send.mockReset()
  transport.listeners.clear()
  closed.length = 0
  creates = 0
  processToken = undefined
  transport.send.mockImplementation(
    async (event: unknown, payload: TerminalCreateRequest & { id: string }) => {
      if (event === TerminalEvents.session.create) {
        creates += 1
        processToken = payload.creationToken
        if (payload.command !== 'fixture-cli') throw new Error('Executable not found')
        if (payload.args?.includes('--fail')) {
          emit(TerminalEvents.session.data, { id: 'install', data: '真实输出\r\n' })
          emit(TerminalEvents.session.exit, { id: 'install', exitCode: 4 })
        }
        return { id: 'install' }
      }
      if (event === TerminalEvents.session.close) {
        if (payload.id) closed.push(payload.id)
        else if (payload.creationToken && payload.creationToken === processToken)
          closed.push('install')
        return
      }
      if (event === TerminalEvents.session.resize || event === TerminalEvents.session.write) return
      throw new Error('Unexpected installer transport operation')
    }
  )
})
function button(wrapper: VueWrapper, label: string) {
  const found = wrapper.findAll('button').find((item) => item.text() === label)
  if (!found) throw new Error(`Missing button: ${label}`)
  return found
}

describe('terminalTemplate explicit execution', () => {
  it('does not execute on mount and displays actual early output and exit after Start', async () => {
    const wrapper = mount(TerminalTemplate, { props: { command: 'fixture-cli', args: ['--fail'] } })
    await flushPromises()
    expect(creates).toBe(0)
    await button(wrapper, 'terminal.start').trigger('click')
    await flushPromises()
    expect(wrapper.find('pre').text()).toBe('真实输出\r\n\r\nterminal.exit:4')
    expect(wrapper.findAll('button').map((item) => item.text())).not.toContain('terminal.stop')
    expect(button(wrapper, 'terminal.start').attributes('disabled')).toBeUndefined()
  })

  it.each(['stop', 'unmount'] as const)(
    'cancels pending creation on %s without waiting for the create reply',
    async (action) => {
      let complete!: (value: { id: string }) => void
      transport.send.mockImplementationOnce((_event: unknown, payload: TerminalCreateRequest) => {
        processToken = payload.creationToken
        return new Promise<{ id: string }>((resolve) => {
          complete = resolve
        })
      })
      const wrapper = mount(TerminalTemplate, {
        props: { command: 'fixture-cli', args: ['--wait'] }
      })
      await button(wrapper, 'terminal.start').trigger('click')
      await flushPromises()
      if (action === 'stop') await button(wrapper, 'terminal.stop').trigger('click')
      else wrapper.unmount()
      expect([...transport.listeners.values()].every((entries) => entries.size === 0)).toBe(true)
      await flushPromises()
      expect(closed).toEqual(['install'])
      complete({ id: 'install' })
      await flushPromises()
      expect(closed).toEqual(['install'])
      if (action === 'stop') {
        emit(TerminalEvents.session.data, { id: 'install', data: 'late output' })
        emit(TerminalEvents.session.exit, { id: 'install', exitCode: 0 })
        await flushPromises()
        expect(wrapper.find('pre').text()).toBe('')
        expect(wrapper.find('[role="alert"]').exists()).toBe(false)
      }
    }
  )

  it('closes an active command on Stop and ignores its later output', async () => {
    const wrapper = mount(TerminalTemplate, { props: { command: 'fixture-cli', args: ['--wait'] } })
    await button(wrapper, 'terminal.start').trigger('click')
    await flushPromises()
    emit(TerminalEvents.session.data, { id: 'install', data: 'first' })
    await button(wrapper, 'terminal.stop').trigger('click')
    emit(TerminalEvents.session.data, { id: 'install', data: 'ignored' })
    await flushPromises()
    expect(wrapper.find('pre').text()).toBe('first')
    expect(closed).toEqual(['install'])
    wrapper.unmount()
    await flushPromises()
    expect(closed).toEqual(['install'])
  })

  it('surfaces launch failure and allows an explicit retry', async () => {
    transport.send.mockRejectedValueOnce(new Error('Executable not found'))
    const wrapper = mount(TerminalTemplate, { props: { command: 'fixture-cli', args: ['--wait'] } })
    await button(wrapper, 'terminal.start').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toBe('terminal.failed')
    await button(wrapper, 'terminal.start').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.findAll('button').map((item) => item.text())).toContain('terminal.stop')
  })
})
