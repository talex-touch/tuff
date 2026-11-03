import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import TxAiOpenUI from '../TxAiOpenUI.vue'
import { OPENUI_FENCE_LANG, splitOpenUIFences } from '../fences'

describe('splitOpenUIFences', () => {
  it('exports the OpenUI fence language and preserves complete blocks', () => {
    expect(OPENUI_FENCE_LANG).toBe('openui')
    expect(splitOpenUIFences('before\n```openui\nroot = Text("Hi")\n```\nafter')).toEqual([
      { kind: 'markdown', text: 'before\n', complete: true },
      { kind: 'openui', text: 'root = Text("Hi")\n', complete: true },
      { kind: 'markdown', text: 'after', complete: true },
    ])
  })

  it('splits multiple OpenUI blocks while retaining prose between them', () => {
    expect(
      splitOpenUIFences(
        'intro\n```openui\nfirst = Text("One")\n```\nmiddle\n```openui\nsecond = Text("Two")\n```\noutro',
      ),
    ).toEqual([
      { kind: 'markdown', text: 'intro\n', complete: true },
      { kind: 'openui', text: 'first = Text("One")\n', complete: true },
      { kind: 'markdown', text: 'middle\n', complete: true },
      { kind: 'openui', text: 'second = Text("Two")\n', complete: true },
      { kind: 'markdown', text: 'outro', complete: true },
    ])
  })

  it('leaves other language fences in markdown', () => {
    const source = '```ts\nconst answer = 42\n```\n```openui\nroot = Text("UI")\n```'

    expect(splitOpenUIFences(source)).toEqual([
      { kind: 'markdown', text: '```ts\nconst answer = 42\n```\n', complete: true },
      { kind: 'openui', text: 'root = Text("UI")\n', complete: true },
    ])
  })

  it('marks an unclosed trailing OpenUI block incomplete', () => {
    expect(splitOpenUIFences('prose\n```openui\nroot = Text("still streaming")')).toEqual([
      { kind: 'markdown', text: 'prose\n', complete: true },
      { kind: 'openui', text: 'root = Text("still streaming")', complete: false },
    ])
  })

  it('ends a program at a closing fence that has prose glued to it', () => {
    expect(splitOpenUIFences('```openui\nroot = Text("Hi")\n```结合调研，如下\n\n### Next')).toEqual([
      { kind: 'openui', text: 'root = Text("Hi")\n', complete: true },
      { kind: 'markdown', text: '结合调研，如下\n\n### Next', complete: true },
    ])
    expect(splitOpenUIFences('```openui\nroot = Text("Hi")\n```Then see below\nmore')).toEqual([
      { kind: 'openui', text: 'root = Text("Hi")\n', complete: true },
      { kind: 'markdown', text: 'Then see below\nmore', complete: true },
    ])
  })

  it('keeps a lone word after a fence inside the program', () => {
    expect(splitOpenUIFences('```openui\nroot = Text("Hi")\n```op')).toEqual([
      { kind: 'openui', text: 'root = Text("Hi")\n```op', complete: false },
    ])
  })

  it('preserves CRLF bytes inside and outside OpenUI blocks', () => {
    expect(splitOpenUIFences('before\r\n```openui\r\nroot = Text("CRLF")\r\n```\r\nafter')).toEqual([
      { kind: 'markdown', text: 'before\r\n', complete: true },
      { kind: 'openui', text: 'root = Text("CRLF")\r\n', complete: true },
      { kind: 'markdown', text: 'after', complete: true },
    ])
  })

  it('does not treat a partial opener as an OpenUI fence and keeps empty blocks', () => {
    expect(splitOpenUIFences('prefix\n```op')).toEqual([
      { kind: 'markdown', text: 'prefix\n```op', complete: true },
    ])
    expect(splitOpenUIFences('```openui\n```')).toEqual([
      { kind: 'openui', text: '', complete: true },
    ])
  })
})

describe('tx-ai-openui', () => {
  it('adds streamed sibling nodes without remounting an already settled sibling', async () => {
    const chunks = [
      'root = Col([a,b])\n',
      'root = Col([a,b])\na = Text("First")\n',
      'root = Col([a,b])\na = Text("First")\nb = Text("Second")',
    ]
    const wrapper = mount(TxAiOpenUI, {
      props: { content: chunks[0], streaming: true },
    })

    await wrapper.setProps({ content: chunks[1] })
    const first = wrapper.find('[data-openui-node="a"]')
    expect(first.text()).toBe('First')
    const firstElement = first.element

    await wrapper.setProps({ content: chunks[2], streaming: false })

    expect(wrapper.find('[data-openui-node="a"]').text()).toBe('First')
    expect(wrapper.find('[data-openui-node="b"]').text()).toBe('Second')
    expect(wrapper.find('[data-openui-node="a"]').element).toBe(firstElement)
  })

  it('tolerates short cumulative chunks without remounting settled nodes', async () => {
    const program = 'root = Col([a,b])\na = Text("First")\nb = Text("Second")'
    const chunks = Array.from({ length: Math.ceil(program.length / 7) }, (_, index) => program.slice(0, (index + 1) * 7))
    const wrapper = mount(TxAiOpenUI, {
      props: { content: '', streaming: true },
    })
    let previousNodeCount = 0
    let settledFirstElement: Element | undefined

    for (const content of chunks) {
      let thrown: unknown
      try {
        await wrapper.setProps({ content, streaming: true })
      }
      catch (error) {
        thrown = error
      }
      expect(thrown).toBeUndefined()

      const nodeCount = wrapper.findAll('[data-openui-node]').length
      expect(nodeCount).toBeGreaterThanOrEqual(previousNodeCount)
      previousNodeCount = nodeCount

      const first = wrapper.find('[data-openui-node="a"]')
      if (first.exists() && first.text() === 'First') {
        if (settledFirstElement) expect(first.element).toBe(settledFirstElement)
        else settledFirstElement = first.element
      }
    }

    await wrapper.setProps({ content: program, streaming: false })
    expect(wrapper.find('[data-openui-node="a"]').element).toBe(settledFirstElement)
    expect(wrapper.find('[data-openui-node="b"]').text()).toBe('Second')
  })

  it('updates dependent text when a bound input changes', async () => {
    const wrapper = mount(TxAiOpenUI, {
      props: {
        content: [
          'root = Col([field,echo])',
          '$name = "Ada"',
          'field = Input($name,"Name")',
          'echo = Text("Hello " + $name)',
        ].join('\n'),
        streaming: false,
      },
    })

    const input = wrapper.find('input')
    expect((input.element as HTMLInputElement).value).toBe('Ada')
    expect(wrapper.text()).toContain('Hello Ada')

    await input.setValue('Grace')
    await nextTick()

    expect(wrapper.text()).toContain('Hello Grace')
    expect(wrapper.text()).not.toContain('Hello Ada')
  })

  it('emits a continue_conversation action with the assistant message', async () => {
    const wrapper = mount(TxAiOpenUI, {
      props: {
        content: 'root = Col([button])\nbutton = Button("Continue", @ToAssistant("Help me"))',
        streaming: false,
      },
    })

    const button = wrapper.find('button')
    expect(button.text()).toContain('Continue')
    await button.trigger('click')

    const event = wrapper.emitted('action')?.[0]?.[0]
    expect(event).toMatchObject({
      type: 'continue_conversation',
      context: 'Help me',
    })
  })
  it('includes untouched and edited form values in ToAssistant actions', async () => {
    const wrapper = mount(TxAiOpenUI, {
      props: {
        content: [
          'root = Form([field,agree,submit])',
          '$name = "Ada"',
          '$yes = true',
          'field = Input($name,"Name")',
          'agree = Checkbox($yes,"Agree")',
          'submit = Button("Submit", @ToAssistant("Use these"))',
        ].join('\n'),
        streaming: false,
      },
    })

    const submit = wrapper.find('button[aria-label="Submit"]')
    await submit.trigger('click')

    const firstAction = wrapper.emitted('action')?.[0]?.[0]
    expect(firstAction).toMatchObject({
      type: 'continue_conversation',
      context: 'Use these',
      params: { formState: { Name: 'Ada', Agree: true } },
    })

    await wrapper.find('input[aria-label="Name"]').setValue('Grace')
    await nextTick()
    await submit.trigger('click')

    const secondAction = wrapper.emitted('action')?.[1]?.[0]
    expect(secondAction).toMatchObject({
      params: { formState: { Name: 'Grace', Agree: true } },
    })
  })

  it('applies Set and Reset actions to reactive state', async () => {
    const wrapper = mount(TxAiOpenUI, {
      props: {
        content: [
          'root = Col([increment,reset,readout])',
          '$count = 0',
          'increment = Button("Increment", @Set($count,$count+1))',
          'reset = Button("Reset", @Reset($count))',
          'readout = Text("Count: " + $count)',
        ].join('\n'),
        streaming: false,
      },
    })

    expect(wrapper.text()).toContain('Count: 0')
    const buttons = wrapper.findAll('button')
    const increment = buttons.find((button) => button.text() === 'Increment')!
    const reset = buttons.find((button) => button.text() === 'Reset')!

    await increment.trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('Count: 1')

    await reset.trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('Count: 0')
  })
})
