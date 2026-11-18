import type { AiAttachment } from '../../ai-elements/src/types'
import type { PromptBarCommand, PromptBarModel, PromptBarSource } from '../src/types'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, ref } from 'vue'
import TxPromptBar from '../src/TxPromptBar.vue'

// An open menu holds a document-level pointerdown listener. Bars left mounted
// would keep answering events raised by later tests, so every mount is torn
// down — which also exercises the listener removal on unmount.
enableAutoUnmount(afterEach)

const sources: PromptBarSource[] = [
  { key: 'attach', name: 'Add photos & files', desc: 'Upload from your computer', attach: true },
  { key: 'scoop', name: 'Scoop Data', desc: 'Sales & churn metrics' },
  { key: 'gmail', name: 'Gmail', desc: 'Read and manage Gmail', connectable: true },
]

const commands: PromptBarCommand[] = [
  { key: 'compare', name: '/compare', desc: 'Flavor vs. last summer' },
  { key: 'restock', name: '/restock', desc: 'Build a reorder list' },
]

const models: PromptBarModel[] = [
  { key: 'vanilla', name: 'Vanilla 1', tag: 'Basic' },
  { key: 'sprinkles', name: 'Sprinkles 5', tag: 'Flagship' },
]

function mountBar(props: Record<string, unknown> = {}) {
  return mount(TxPromptBar, { props: { sources, commands, ...props } })
}

describe('txPromptBar', () => {
  it('names the textarea from the placeholder when no label is given', () => {
    const wrapper = mountBar()
    const input = wrapper.find('textarea')
    expect(input.attributes('aria-label')).toBe('Write a message…')

    const labelled = mountBar({ ariaLabel: 'Prompt' })
    expect(labelled.find('textarea').attributes('aria-label')).toBe('Prompt')
  })

  it('claims combobox semantics only when it has rows to offer', () => {
    expect(mountBar().find('textarea').attributes('role')).toBe('combobox')

    const plain = mount(TxPromptBar)
    expect(plain.find('textarea').attributes('role')).toBeUndefined()
    expect(plain.find('textarea').attributes('aria-haspopup')).toBeUndefined()
  })

  it('opens the source listbox on @ and filters as the query grows', async () => {
    const wrapper = mountBar()
    const input = wrapper.find('textarea')

    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)

    await input.setValue('@')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
    expect(wrapper.findAll('[role="option"]')).toHaveLength(3)
    expect(input.attributes('aria-expanded')).toBe('true')

    await input.setValue('@scoop')
    expect(wrapper.findAll('[role="option"]')).toHaveLength(1)
    expect(wrapper.find('[role="option"]').text()).toContain('Scoop Data')
  })

  it('opens the command listbox on / and matches by prefix', async () => {
    const wrapper = mountBar()
    await wrapper.find('textarea').setValue('/re')

    const options = wrapper.findAll('[role="option"]')
    expect(options).toHaveLength(1)
    expect(options[0]!.text()).toContain('/restock')
  })

  it('reports no matches without closing the menu', async () => {
    const wrapper = mountBar()
    await wrapper.find('textarea').setValue('@zzz')

    expect(wrapper.findAll('[role="option"]')).toHaveLength(0)
    expect(wrapper.find('.tx-bui-prompt-bar-menu__empty').text()).toBe('No matches for "zzz"')
  })

  it('points aria-activedescendant at a row only once one is highlighted', async () => {
    const wrapper = mountBar()
    const input = wrapper.find('textarea')
    await input.setValue('@')
    expect(input.attributes('aria-activedescendant')).toBeUndefined()

    await input.trigger('keydown', { key: 'ArrowDown' })
    const active = input.attributes('aria-activedescendant')
    expect(active).toBeTruthy()
    expect(wrapper.find('[role="option"]').attributes('id')).toBe(active)
  })

  it('inserts the mention on Enter and closes the menu', async () => {
    const wrapper = mountBar()
    const input = wrapper.find('textarea')
    await input.setValue('note @scoop')
    await input.trigger('keydown', { key: 'ArrowDown' })
    await input.trigger('keydown', { key: 'Enter' })

    const updates = wrapper.emitted('update:modelValue')!
    expect(updates.at(-1)).toEqual(['note @Scoop Data '])
    expect(wrapper.emitted('sourceSelect')![0]![0]).toMatchObject({ key: 'scoop' })
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  })

  it('inserts the command verbatim, slash and all', async () => {
    const wrapper = mountBar()
    const input = wrapper.find('textarea')
    await input.setValue('/comp')
    await wrapper.find('[role="option"]').trigger('click')

    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['/compare '])
    expect(wrapper.emitted('commandSelect')![0]![0]).toMatchObject({ key: 'compare' })
  })

  it('leaves an IME candidate alone while the menu is open', async () => {
    const wrapper = mountBar()
    const input = wrapper.find('textarea')
    await input.setValue('@scoop')

    // Enter confirming a candidate must not pick a row — upstream guards the
    // send path but not this one.
    await input.trigger('compositionstart')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('sourceSelect')).toBeUndefined()
    expect(wrapper.emitted('send')).toBeUndefined()

    await input.trigger('compositionend')
    await input.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('sourceSelect')).toHaveLength(1)
  })

  it('raises attach and drops the pending token for the attach row', async () => {
    const wrapper = mountBar()
    await wrapper.find('textarea').setValue('@add')
    await wrapper.find('[role="option"]').trigger('click')

    expect(wrapper.emitted('attach')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([''])
    expect(wrapper.emitted('sourceSelect')).toBeUndefined()
  })

  it('connects an unconnected source instead of mentioning it', async () => {
    const wrapper = mountBar()
    await wrapper.find('textarea').setValue('@gmail')

    const row = wrapper.find('[role="option"]')
    expect(row.text()).toContain('Connect')
    await row.trigger('click')

    expect(wrapper.emitted('connectToggle')![0]![0]).toMatchObject({ key: 'gmail' })
    expect(wrapper.emitted('sourceSelect')).toBeUndefined()
    // The row still has something to say, so the menu stays put.
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
  })

  it('mentions a source once it is connected', async () => {
    const connected = sources.map(source =>
      source.key === 'gmail' ? { ...source, connected: true } : source,
    )
    const wrapper = mountBar({ sources: connected })
    await wrapper.find('textarea').setValue('@gmail')

    const row = wrapper.find('[role="option"]')
    expect(row.text()).toContain('Connected')
    await row.trigger('click')

    expect(wrapper.emitted('sourceSelect')![0]![0]).toMatchObject({ key: 'gmail' })
    expect(wrapper.emitted('connectToggle')).toBeUndefined()
  })

  it('dismisses the menu on Escape and reopens it on the next keystroke', async () => {
    const wrapper = mountBar()
    const input = wrapper.find('textarea')
    await input.setValue('@sco')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)

    await input.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)

    await input.setValue('@scoo')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
  })

  it('withholds send until there is something to send', async () => {
    const wrapper = mountBar()
    const send = wrapper.find('.tx-bui-prompt-bar__send')
    expect(send.attributes('disabled')).toBeDefined()
    expect(send.classes()).not.toContain('is-ready')

    await wrapper.find('textarea').setValue('hello')
    expect(wrapper.find('.tx-bui-prompt-bar__send').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.tx-bui-prompt-bar__send').classes()).toContain('is-ready')
  })

  it('sends on Enter and clears the draft', async () => {
    const wrapper = mountBar()
    const input = wrapper.find('textarea')
    await input.setValue('hello')
    await input.trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('send')![0]![0]).toEqual({ text: 'hello', attachments: [] })
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual([''])
  })

  it('keeps Shift+Enter for a newline', async () => {
    const wrapper = mountBar()
    const input = wrapper.find('textarea')
    await input.setValue('hello')
    await input.trigger('keydown', { key: 'Enter', shiftKey: true })

    expect(wrapper.emitted('send')).toBeUndefined()
  })

  it('refuses to send while a turn is in flight', async () => {
    const wrapper = mountBar({ submitting: true })
    await wrapper.find('textarea').setValue('hello')
    await wrapper.find('textarea').trigger('keydown', { key: 'Enter' })

    expect(wrapper.emitted('send')).toBeUndefined()
  })

  it('sends attachments alongside the text', async () => {
    const attachments: AiAttachment[] = [{ kind: 'file', id: 'f1', name: 'menu.pdf' }]
    const wrapper = mountBar({ attachments })

    expect(wrapper.find('.tx-bui-prompt-bar__attachment-name').text()).toBe('menu.pdf')
    // Attachments alone are enough to send.
    expect(wrapper.find('.tx-bui-prompt-bar__send').attributes('disabled')).toBeUndefined()

    await wrapper.find('.tx-bui-prompt-bar__send').trigger('click')
    expect(wrapper.emitted('send')![0]![0]).toEqual({ text: '', attachments })
  })

  it('labels and wires the attachment remove button', async () => {
    const attachments: AiAttachment[] = [{ kind: 'file', id: 'f1', name: 'menu.pdf' }]
    const wrapper = mountBar({ attachments })

    const remove = wrapper.find('.tx-bui-prompt-bar__attachment-remove')
    expect(remove.attributes('aria-label')).toBe('Remove menu.pdf')

    await remove.trigger('click')
    expect(wrapper.emitted('attachmentRemove')![0]).toEqual(['f1'])
  })

  it('falls back to a label for a nameless attachment', () => {
    const wrapper = mountBar({
      attachments: [{ kind: 'image', id: 'i1', url: 'blob:x' }] satisfies AiAttachment[],
    })
    expect(wrapper.find('.tx-bui-prompt-bar__attachment-name').text()).toBe('Attachment')
  })

  it('shows the first model until one is picked', async () => {
    const wrapper = mountBar({ models })
    const button = wrapper.find('.tx-bui-prompt-bar__model')
    expect(button.text()).toContain('Vanilla 1')
    expect(button.attributes('aria-expanded')).toBe('false')

    await button.trigger('click')
    const options = wrapper.findAll('[role="option"]')
    expect(options).toHaveLength(2)
    expect(options[0]!.attributes('aria-selected')).toBe('true')

    await options[1]!.trigger('click')
    expect(wrapper.emitted('update:model')![0]).toEqual(['sprinkles'])
    expect(wrapper.find('.tx-bui-prompt-bar__model').text()).toContain('Sprinkles 5')
  })

  it('drives the model menu from the keyboard', async () => {
    const wrapper = mountBar({ models })
    const button = wrapper.find('.tx-bui-prompt-bar__model')

    await button.trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
    expect(button.attributes('aria-activedescendant')).toBeTruthy()

    await button.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:model')![0]).toEqual(['vanilla'])
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  })

  it('honours a controlled model', async () => {
    const wrapper = mountBar({ models, model: 'sprinkles' })
    expect(wrapper.find('.tx-bui-prompt-bar__model').text()).toContain('Sprinkles 5')

    await wrapper.setProps({ model: 'vanilla' })
    expect(wrapper.find('.tx-bui-prompt-bar__model').text()).toContain('Vanilla 1')
  })

  it('hides the model picker when there are no models', () => {
    expect(mountBar().find('.tx-bui-prompt-bar__model').exists()).toBe(false)
  })

  it('toggles dictation and swaps the glyph for the meter', async () => {
    const wrapper = mountBar({ dictatable: true })
    const button = wrapper.find('.tx-bui-prompt-bar__dictate')
    expect(button.attributes('aria-pressed')).toBe('false')
    expect(button.attributes('aria-label')).toBe('Start dictation')
    expect(wrapper.find('.tx-bui-prompt-bar__bars').exists()).toBe(false)

    await button.trigger('click')
    expect(wrapper.emitted('update:listening')![0]).toEqual([true])
    expect(wrapper.find('.tx-bui-prompt-bar__bars').exists()).toBe(true)
    expect(wrapper.findAll('.tx-bui-prompt-bar__bar')).toHaveLength(3)
    expect(wrapper.find('textarea').attributes('placeholder')).toBe('Listening…')
  })

  it('omits dictation unless asked for', () => {
    expect(mountBar().find('.tx-bui-prompt-bar__dictate').exists()).toBe(false)
  })

  it('forces the source menu open from the + button', async () => {
    const wrapper = mountBar()
    const plus = wrapper.find('.tx-bui-prompt-bar__plus')
    expect(plus.attributes('aria-expanded')).toBe('false')

    await plus.trigger('click')
    expect(wrapper.findAll('[role="option"]')).toHaveLength(3)
    expect(wrapper.find('.tx-bui-prompt-bar__plus').classes()).toContain('is-on')
  })

  it('hides the + button when there are no sources', () => {
    const wrapper = mount(TxPromptBar, { props: { commands } })
    expect(wrapper.find('.tx-bui-prompt-bar__plus').exists()).toBe(false)
    expect(wrapper.find('.tx-bui-prompt-bar__controls').classes()).toContain('is-leadless')
  })

  it('tracks a controlled draft', async () => {
    const wrapper = mountBar({ modelValue: 'from the host' })
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('from the host')

    await wrapper.setProps({ modelValue: '@sco' })
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
  })

  it('takes the pill shape and its rounder controls', () => {
    const wrapper = mountBar({ variant: 'pill' })
    expect(wrapper.classes()).toContain('is-pill')
    expect(mountBar().classes()).toContain('is-rounded')
  })

  it('hands pasted files to the host without swallowing the paste', async () => {
    const wrapper = mountBar()
    const file = new File(['x'], 'shot.png', { type: 'image/png' })

    // Built by hand: jsdom's ClipboardEvent will not take a synthetic
    // `clipboardData`, so the property is attached to a plain event instead.
    const event = new Event('paste')
    Object.defineProperty(event, 'clipboardData', {
      value: { items: [{ kind: 'file', getAsFile: () => file }] },
    })
    wrapper.find('textarea').element.dispatchEvent(event)
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('paste')).toHaveLength(1)
    expect(wrapper.emitted('attachmentAdd')![0]![0]).toEqual([file])
  })

  it('exposes focus, insert and the open state', async () => {
    const wrapper = mountBar()
    const instance = wrapper.vm as unknown as {
      focus: () => void
      insert: (text: string) => void
      closeMenus: () => void
      menuOpen: boolean
    }

    expect(instance.menuOpen).toBe(false)

    instance.insert('@Scoop Data')
    expect(wrapper.emitted('update:modelValue')!.at(-1)).toEqual(['@Scoop Data'])

    await wrapper.find('.tx-bui-prompt-bar__plus').trigger('click')
    expect(instance.menuOpen).toBe(true)

    instance.closeMenus()
    await wrapper.vm.$nextTick()
    expect(instance.menuOpen).toBe(false)
  })

  it('closes an open menu when the pointer lands outside it', async () => {
    const wrapper = mountBar()
    await wrapper.find('.tx-bui-prompt-bar__plus').trigger('click')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  })

  it('leaves the menu alone when the pointer lands inside it', async () => {
    const wrapper = mountBar()
    await wrapper.find('.tx-bui-prompt-bar__plus').trigger('click')

    wrapper.find('[role="option"]').element.dispatchEvent(
      new Event('pointerdown', { bubbles: true }),
    )
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
  })

  it('lets go of the document listener when it unmounts', async () => {
    const added = vi.spyOn(document, 'addEventListener')
    const removed = vi.spyOn(document, 'removeEventListener')
    const pointerdowns = (spy: typeof removed) =>
      spy.mock.calls.filter(([type]) => type === 'pointerdown').length

    const wrapper = mountBar()
    await wrapper.find('.tx-bui-prompt-bar__plus').trigger('click')
    expect(pointerdowns(added)).toBeGreaterThan(0)

    // Counted across the unmount, not merely "was ever called": the open-state
    // watcher removes on close too, so a `some()` check would pass even with no
    // teardown at all.
    const before = pointerdowns(removed)
    wrapper.unmount()
    expect(pointerdowns(removed)).toBeGreaterThan(before)

    added.mockRestore()
    removed.mockRestore()
  })

  it('disables every control when disabled', () => {
    const wrapper = mountBar({ dictatable: true, models, disabled: true, modelValue: 'hi' })
    expect(wrapper.find('textarea').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.tx-bui-prompt-bar__plus').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.tx-bui-prompt-bar__model').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.tx-bui-prompt-bar__send').attributes('disabled')).toBeDefined()
    expect(wrapper.classes()).toContain('is-disabled')
  })

  it('guards keyCode 229 on IME, supports Home/End in token menu and bottom menuPlacement', async () => {
    const wrapper = mountBar({ menuPlacement: 'bottom' })
    const input = wrapper.find('textarea')
    await input.setValue('@')
    expect(wrapper.find('.tx-bui-prompt-bar-menu').classes()).toContain('is-placement-bottom')

    await input.trigger('keydown', { key: 'End' })
    const options = wrapper.findAll('[role="option"]')
    expect(options.at(-1)?.classes()).toContain('is-active')

    await input.trigger('keydown', { key: 'Home' })
    expect(options[0]?.classes()).toContain('is-active')

    await input.trigger('keydown', { key: 'Enter', keyCode: 229 })
    expect(wrapper.emitted('sourceSelect')).toBeUndefined()
  })

  it('supports capsule stop/queue send states, dictation Esc cancel, dragover counter, tray, and status dock', async () => {
    const wrapper = mount(TxPromptBar, {
      props: {
        sources,
        models: [{ key: 'm1', name: 'Model 1', effort: 'High' }],
        dictatable: true,
        streaming: true,
        stopText: 'Stop now',
        surface: 'refraction',
        conversing: true,
        beamActive: true,
        trayPlacement: 'top',
        trayLabel: 'Context tray',
        contextUsage: { used: 500, max: 1000, label: 'Context' },
        runStatus: { step: 'Searching files', elapsed: '00:04', active: true, tone: 'working' },
      },
      slots: {
        tray: '<div class="tray-slot">Pin</div>',
      },
    })

    expect(wrapper.classes()).toContain('is-surface-refraction')
    expect(wrapper.classes()).toContain('is-conversing')
    expect(wrapper.classes()).toContain('is-beam')
    expect(wrapper.classes()).toContain('is-streaming')
    expect(wrapper.find('.tx-bui-prompt-bar__context-pct').text()).toBe('50%')
    expect(wrapper.find('.tx-bui-prompt-bar__run-step').text()).toBe('Searching files')
    expect(wrapper.find('.tx-bui-prompt-bar__tray').attributes('aria-label')).toBe('Context tray')
    expect(wrapper.find('.tx-bui-prompt-bar__model-effort').text()).toBe('High')
    expect(wrapper.find('.tx-bui-prompt-bar__dictate-slot').classes()).toContain('is-yielding')

    const sendBtn = wrapper.find('.tx-bui-prompt-bar__send')
    expect(sendBtn.classes()).toContain('is-stop')
    await sendBtn.trigger('click')
    expect(wrapper.emitted('stop')).toHaveLength(1)

    await wrapper.setProps({ sendQueues: true, modelValue: 'queued prompt' })
    expect(sendBtn.classes()).toContain('is-queue')
    await sendBtn.trigger('click')
    expect(wrapper.emitted('send')?.[0]).toEqual([{ text: 'queued prompt', attachments: [] }])

    // Nested dragenter/dragleave counter avoids flickering
    const composer = wrapper.find('.tx-bui-prompt-bar__composer')
    const file = new File(['abc'], 'drop.txt', { type: 'text/plain' })
    const makeDrag = (type: string) => {
      const ev = new Event(type, { bubbles: true, cancelable: true }) as DragEvent
      Object.defineProperty(ev, 'dataTransfer', { value: { types: ['Files'], files: [file] } })
      return ev
    }
    composer.element.dispatchEvent(makeDrag('dragenter'))
    composer.element.dispatchEvent(makeDrag('dragenter'))
    composer.element.dispatchEvent(makeDrag('dragleave'))
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).toContain('is-dragover')
    composer.element.dispatchEvent(makeDrag('drop'))
    await wrapper.vm.$nextTick()
    expect(wrapper.classes()).not.toContain('is-dragover')
    expect(wrapper.emitted('attachmentAdd')).toEqual([[[file]]])

    // Dictation active + Esc cancel
    await wrapper.setProps({ streaming: false, listening: true, dictationState: 'listening', dictationElapsedMs: 12000 })
    expect(wrapper.find('textarea').attributes('readonly')).toBeDefined()
    expect(wrapper.find('.tx-bui-prompt-bar__dictate-timer').text()).toBe('00:12')
    await wrapper.find('textarea').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('dictationCancel')).toHaveLength(1)
    expect(wrapper.emitted('update:listening')?.at(-1)).toEqual([false])

    const vm = wrapper.vm as unknown as {
      box: HTMLElement | null
      input: HTMLTextAreaElement | null
      blur: () => void
      launch: () => Promise<void>
    }
    expect(vm.box).toBeTruthy()
    expect(vm.input).toBeTruthy()
    await expect(vm.launch()).resolves.toBeUndefined()
  })

  it('lets explicit sendState="ready" and sendState="empty" override draft inference', async () => {
    const readyEmpty = mount(TxPromptBar, {
      props: { modelValue: '', sendState: 'ready', clearOnSend: false },
    })
    const readyBtn = readyEmpty.find('.tx-bui-prompt-bar__send')
    expect(readyBtn.attributes('disabled')).toBeUndefined()
    expect(readyBtn.classes()).toContain('is-ready')
    await readyBtn.trigger('click')
    await readyEmpty.find('textarea').trigger('keydown', { key: 'Enter' })
    expect(readyEmpty.emitted('send')).toHaveLength(2)

    await readyEmpty.setProps({ submitting: true })
    expect(readyBtn.attributes('disabled')).toBeDefined()

    const forcedEmpty = mount(TxPromptBar, {
      props: { modelValue: 'unsent words', sendState: 'empty' },
    })
    const emptyBtn = forcedEmpty.find('.tx-bui-prompt-bar__send')
    expect(emptyBtn.attributes('disabled')).toBeDefined()
    expect(emptyBtn.classes()).not.toContain('is-ready')
    await emptyBtn.trigger('click')
    await forcedEmpty.find('textarea').trigger('keydown', { key: 'Enter' })
    expect(forcedEmpty.emitted('send')).toBeUndefined()
  })

  it('preserves mid-draft caret token menu when v-model parent echoes input, and resets on external change', async () => {
    const externalDraft = ref(' trailing')
    const Host = defineComponent({
      components: { TxPromptBar },
      setup() {
        return { externalDraft, sources }
      },
      template: `<TxPromptBar v-model="externalDraft" :sources="sources" />`,
    })

    const wrapper = mount(Host)
    const textarea = wrapper.find('textarea').element as HTMLTextAreaElement
    textarea.value = '@sco trailing'
    textarea.setSelectionRange(4, 4)
    textarea.dispatchEvent(new Event('input'))
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(externalDraft.value).toBe('@sco trailing')
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
    expect(wrapper.find('[role="option"]').text()).toContain('Scoop Data')

    // Distinct external overwrite resets caret to trailing end, closing the mid-draft @ menu.
    externalDraft.value = '@sco replaced externally'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  })

  it('shows active dictation bar even without sources or lead slots and passes delivery eligibility to #actions', async () => {
    const wrapper = mount(TxPromptBar, {
      props: {
        dictatable: true,
        listening: true,
        dictationState: 'listening',
        dictationElapsedMs: 12000,
      },
      slots: {
        actions: `<template #actions="{ canSend, send }"><button type="button" class="custom-send" :disabled="!canSend" @click="send">Custom Send</button></template>`,
      },
    })

    expect(wrapper.find('.tx-bui-prompt-bar__controls').classes()).not.toContain('is-leadless')
    expect(wrapper.find('.tx-bui-prompt-bar__dictate-bar').exists()).toBe(true)
    expect(wrapper.find('.tx-bui-prompt-bar__dictate-timer').text()).toBe('00:12')

    await wrapper.setProps({ listening: false, dictationState: 'idle', dictationElapsedMs: 0, modelValue: 'hello', streaming: true })
    expect(wrapper.find('.tx-bui-prompt-bar__controls').classes()).toContain('is-leadless')
    // Built-in primary button stays enabled to stop, while #actions custom send reflects canDeliverDraft (false).
    expect(wrapper.find('.tx-bui-prompt-bar__send').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.custom-send').attributes('disabled')).toBeDefined()

    await wrapper.setProps({ sendQueues: true })
    expect(wrapper.find('.custom-send').attributes('disabled')).toBeUndefined()
  })

  it('keeps the menu highlight inside the scrolling viewport coordinate system across tall option lists', async () => {
    const manySources: PromptBarSource[] = Array.from({ length: 10 }, (_, idx) => ({
      key: `s${idx}`,
      name: `Source ${idx}`,
      desc: `Row ${idx}`,
    }))
    const wrapper = mountBar({ sources: manySources })
    const input = wrapper.find('textarea')
    await input.setValue('@')

    const options = wrapper.findAll('[role="option"]')
    expect(options).toHaveLength(10)
    options.forEach((opt, idx) => {
      Object.defineProperty(opt.element, 'offsetTop', { value: idx * 36, configurable: true })
      Object.defineProperty(opt.element, 'offsetHeight', { value: 36, configurable: true })
    })

    await input.trigger('keydown', { key: 'End' })
    await wrapper.vm.$nextTick()

    const viewport = wrapper.find('.tx-bui-prompt-bar-menu__viewport')
    expect(viewport.exists()).toBe(true)
    expect(viewport.find('.tx-bui-prompt-bar-menu__highlight').exists()).toBe(true)
    expect(viewport.find('.tx-bui-prompt-bar-menu__list').exists()).toBe(true)
    expect(viewport.find('.tx-bui-prompt-bar-menu__highlight').attributes('style')).toContain('top: 324px')
  })
})
