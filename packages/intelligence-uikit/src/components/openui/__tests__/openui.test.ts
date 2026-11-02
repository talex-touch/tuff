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
    const first = wrapper
      .findAll('[data-openui-node]')
      .find((node) => node.text() === 'First')
    expect(first?.text()).toBe('First')
    const firstElement = first!.element

    await wrapper.setProps({ content: chunks[2], streaming: false })

    const nodes = wrapper.findAll('[data-openui-node]')
    expect(nodes.map((node) => node.text())).toContain('First')
    expect(nodes.map((node) => node.text())).toContain('Second')
    const settledFirst = nodes.find((node) => node.text() === 'First')
    expect(settledFirst?.element).toBe(firstElement)
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
})
