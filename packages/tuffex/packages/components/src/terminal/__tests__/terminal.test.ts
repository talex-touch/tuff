import type { TerminalInstance } from '../src/types'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import TxTerminal from '../src/TxTerminal.vue'

interface Engine {
  emitInput: (data: string) => void
  listeners: Set<unknown>
  disposed: boolean
  focusCount: number
  addonDisposed: boolean
}
const engine = vi.hoisted(() => ({
  failInitialization: false,
  instances: [] as Engine[],
  holdWrites: false,
  completions: [] as Array<() => void>,
  dimensions: { cols: 90, rows: 25 },
  observers: [] as Array<{ callback: () => void; disconnected: boolean }>,
  frames: new Map<number, FrameRequestCallback>()
}))
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols: number
    rows: number
    options: Record<string, unknown>
    textarea: HTMLTextAreaElement | null = null
    output: HTMLPreElement | null = null
    get buffer() { return { active: { viewportY: this.output?.scrollTop ?? 0 } } }
    listeners = new Set<unknown>()
    disposed = false
    focusCount = 0
    addonDisposed = false
    addon: { dispose: () => void } | null = null
    input: (data: string) => void = () => undefined
    resized: (size: { cols: number; rows: number }) => void = () => undefined
    constructor(options: Record<string, unknown>) {
      if (engine.failInitialization) throw new Error('Engine initialization failed')
      this.options = options
      this.cols = Number(options.cols)
      this.rows = Number(options.rows)
      engine.instances.push(this)
    }
    loadAddon(addon: { dispose: () => void }) { this.addon = addon }
    open(host: HTMLElement) {
      this.output = document.createElement('pre')
      this.output.dataset.engineOutput = ''
      this.textarea = document.createElement('textarea')
      host.append(this.output, this.textarea)
    }
    write(data: string | Uint8Array, complete: () => void) {
      if (this.output) this.output.textContent += typeof data === 'string' ? data : new TextDecoder().decode(data)
      if (engine.holdWrites) engine.completions.push(complete)
      else complete()
    }
    writeln(data: string | Uint8Array, complete: () => void) {
      this.write(data, () => { if (this.output) this.output.textContent += '\r\n'; complete() })
    }
    clear() { if (this.output) this.output.textContent = this.output.textContent?.split('\r\n').at(-1) ?? '' }
    reset() { if (this.output) this.output.textContent = '' }
    focus() { this.focusCount += 1 }
    blur() {}
    scrollToBottom() { if (this.output) this.output.scrollTop = this.output.textContent?.length ?? 0 }
    scrollToLine(viewport: number) { if (this.output) this.output.scrollTop = viewport }
    resize(cols: number, rows: number) { this.cols = cols; this.rows = rows; this.resized({ cols, rows }) }
    onData(listener: (data: string) => void) {
      this.input = listener
      this.listeners.add(listener)
      return { dispose: () => { this.listeners.delete(listener) } }
    }
    onResize(listener: (size: { cols: number; rows: number }) => void) {
      this.resized = listener
      this.listeners.add(listener)
      return { dispose: () => { this.listeners.delete(listener) } }
    }
    emitInput(data: string) { this.input(data) }
    dispose() {
      this.disposed = true
      this.addon?.dispose()
      this.addonDisposed = true
    }
  }
}))
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    proposeDimensions() { return engine.dimensions }
    dispose() {}
  }
}))

enableAutoUnmount(afterEach)
beforeEach(() => {
  engine.failInitialization = false
  engine.instances.length = 0
  engine.completions.length = 0
  engine.observers.length = 0
  engine.frames.clear()
  engine.holdWrites = false
  engine.dimensions = { cols: 90, rows: 25 }
  vi.stubGlobal('ResizeObserver', class {
    entry: { callback: () => void; disconnected: boolean } = { callback: () => undefined, disconnected: false }
    constructor(callback: () => void) { this.entry.callback = callback; engine.observers.push(this.entry) }
    observe() {}
    disconnect() { this.entry.disconnected = true }
  })
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = engine.frames.size + 1
    engine.frames.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => engine.frames.delete(id))
})
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
async function settled() {
  await vi.dynamicImportSettled()
  await flushPromises()
  await nextTick()
}

describe('TxTerminal display contract', () => {
  it('preserves pre-ready writes, binary Unicode and large ANSI output in order', async () => {
    const wrapper = mount(TxTerminal)
    const api = wrapper.vm as unknown as TerminalInstance
    const large = '\u001B[32m中文\u001B[0m' + 'x'.repeat(100_000)
    const first = api.write(large)
    const second = api.writeln(new TextEncoder().encode('末尾'))
    await settled()
    await Promise.all([first, second])
    expect(wrapper.find('[data-engine-output]').element.textContent).toBe(large + '末尾\r\n')
  })

  it('appends records without duplication and replaces mutated, switched, and cleared logs', async () => {
    const lines = reactive(['first'])
    const wrapper = mount(TxTerminal, { props: { lines, readOnly: true } })
    await settled()
    lines.push('second')
    await settled()
    expect(wrapper.find('[data-engine-output]').element.textContent).toBe('first\r\nsecond\r\n')
    lines[0] = 'changed'
    await settled()
    expect(wrapper.find('[data-engine-output]').element.textContent).toBe('changed\r\nsecond\r\n')
    await wrapper.setProps({ lines: ['history'] })
    await settled()
    expect(wrapper.find('[data-engine-output]').element.textContent).toBe('history\r\n')
    await wrapper.setProps({ lines: [] })
    await settled()
    expect(wrapper.find('[data-engine-output]').element.textContent).toBe('')
  })

  it('suppresses read-only input and autofocus while preserving output, then enables interaction', async () => {
    const wrapper = mount(TxTerminal, { props: { readOnly: true, autoFocus: true, lines: ['selectable'] } })
    await settled()
    const target = engine.instances[0]
    target.emitInput('blocked')
    ;(wrapper.vm as unknown as TerminalInstance).focus()
    expect(wrapper.emitted('data')).toBeUndefined()
    expect(target.focusCount).toBe(0)
    expect(wrapper.find('[data-engine-output]').text()).toBe('selectable')
    expect(wrapper.find('textarea').attributes('aria-readonly')).toBe('true')
    await wrapper.setProps({ readOnly: false })
    expect(wrapper.find('textarea').attributes('aria-readonly')).toBe('false')
    target.emitInput('hello\u0003')
    expect(wrapper.emitted('data')).toEqual([['hello\u0003']])
  })

  it('reset cannot overtake a pending parse, and unmount rejects remaining write promises', async () => {
    engine.holdWrites = true
    const wrapper = mount(TxTerminal)
    await settled()
    const api = wrapper.vm as unknown as TerminalInstance
    const first = api.write('before')
    api.reset()
    const second = api.write('after')
    const rejected = expect(second).rejects.toThrow(/disposed/i)
    expect(wrapper.find('[data-engine-output]').text()).toBe('before')
    engine.completions.shift()?.()
    await first
    await flushPromises()
    expect(wrapper.find('[data-engine-output]').text()).toBe('after')
    wrapper.unmount()
    await rejected
    const target = engine.instances[0]
    expect(target.disposed).toBe(true)
    expect(target.addonDisposed).toBe(true)
    expect(target.listeners.size).toBe(0)
    expect(engine.observers[0].disconnected).toBe(true)
    await expect(api.write('late')).rejects.toThrow(/disposed/i)
  })

  it('unmount before dynamic initialization rejects queued output instead of hanging', async () => {
    const wrapper = mount(TxTerminal)
    const pending = (wrapper.vm as unknown as TerminalInstance).write('queued')
    const rejection = expect(pending).rejects.toThrow(/disposed/i)
    wrapper.unmount()
    await rejection
    await settled()
    expect(engine.instances).toEqual([])
  })

  it('fits changed host geometry and cancels queued fitting after unmount', async () => {
    const wrapper = mount(TxTerminal)
    vi.spyOn(wrapper.element, 'getBoundingClientRect').mockReturnValue({ width: 600, height: 400 } as DOMRect)
    await settled()
    const api = wrapper.vm as unknown as TerminalInstance
    expect(api.getSize()).toEqual({ cols: 90, rows: 25 })
    engine.dimensions = { cols: 110, rows: 35 }
    engine.observers[0].callback()
    engine.frames.forEach(callback => callback(0))
    engine.frames.clear()
    expect(api.getSize()).toEqual({ cols: 110, rows: 35 })
    expect(wrapper.emitted('resize')?.at(-1)).toEqual([{ cols: 110, rows: 35 }])
    engine.observers[0].callback()
    wrapper.unmount()
    expect(engine.frames.size).toBe(0)
    expect(api.getSize()).toBeNull()
  })
})

describe('TxTerminal initialization failure', () => {
  it('rejects queued writes and reports the actual failure through the Vue error boundary', async () => {
    engine.failInitialization = true
    const failures: unknown[] = []
    const wrapper = mount(TxTerminal, { global: { config: { errorHandler: error => failures.push(error) } } })
    const api = wrapper.vm as unknown as TerminalInstance
    const pending = api.write('queued')
    const rejection = expect(pending).rejects.toThrow('Engine initialization failed')
    await settled()
    await rejection
    expect(failures).toHaveLength(1)
    expect(failures[0]).toMatchObject({ message: 'Engine initialization failed' })
    await expect(api.write('later')).rejects.toThrow('Engine initialization failed')
    expect(api.getSize()).toBeNull()
  })
})

describe('TxTerminal log viewport', () => {
  it('preserves a reader\'s historical scroll position until automatic scrolling is explicitly enabled', async () => {
    const wrapper = mount(TxTerminal, { props: { readOnly: true, autoScroll: false, lines: ['history '.repeat(30)] } })
    await settled()
    const output = wrapper.find<HTMLPreElement>('[data-engine-output]').element
    output.scrollTop = 14
    await (wrapper.vm as unknown as TerminalInstance).write('new log')
    expect(output.scrollTop).toBe(14)
    await wrapper.setProps({ autoScroll: true })
    expect(output.scrollTop).toBe(output.textContent!.length)
    await (wrapper.vm as unknown as TerminalInstance).write('next log')
    expect(output.scrollTop).toBe(output.textContent!.length)
  })
})
