import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import TxAiOpenUI from '../TxAiOpenUI.vue'
import { OPENUI_FENCE_LANG, splitOpenUIFences } from '../fences'
import { library } from '../library'
import { openUIPrompt } from '../prompt'

interface InternalRenderInstance {
  render?: (...args: unknown[]) => unknown
  props?: {
    statementId?: string
    nodePath?: string
    typeName?: string
  }
}

/**
 * Instruments every mounted `OpenUIPrimitive` component instance's real Vue
 * render function so tests can assert exact per-node re-render counts.
 */
function trackPrimitiveRenders(wrapper: ReturnType<typeof mount>) {
  const counts = new Map<string, number>()
  const primitives = wrapper.findAllComponents({ name: 'OpenUIPrimitive' })

  for (const comp of primitives) {
    const internal = (comp.vm as unknown as { $: InternalRenderInstance }).$
    const id = internal.props?.statementId ?? internal.props?.nodePath ?? 'unknown'
    const originalRender = internal.render
    if (!originalRender)
      continue
    counts.set(id, 0)
    internal.render = function trackedRender(...args: unknown[]) {
      counts.set(id, (counts.get(id) ?? 0) + 1)
      return originalRender.apply(this, args)
    }
  }

  return {
    get: (id: string) => counts.get(id) ?? 0,
    reset: () => {
      for (const key of counts.keys())
        counts.set(key, 0)
    },
    entries: () => Object.fromEntries(counts.entries()),
  }
}

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
        if (settledFirstElement)
          expect(first.element).toBe(settledFirstElement)
        else
          settledFirstElement = first.element
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
    const increment = buttons.find(button => button.text() === 'Increment')!
    const reset = buttons.find(button => button.text() === 'Reset')!

    await increment.trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('Count: 1')

    await reset.trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('Count: 0')
  })
})

describe('tx-ai-openui fine-grained reactivity', () => {
  it('updates only nodes bound to the mutated state key without re-evaluating or re-rendering siblings', async () => {
    const upperSpy = vi.spyOn(library.functions.Upper, 'fn')
    const lowerSpy = vi.spyOn(library.functions.Lower, 'fn')

    try {
      const wrapper = mount(TxAiOpenUI, {
        props: {
          content: [
            'root = Col([cardA, cardB, cardStatic])',
            '$a = "ada"',
            '$b = "GRACE"',
            'cardA = Card([fieldA, echoA])',
            'fieldA = Input($a, "First")',
            'echoA = Text(@Upper($a))',
            'cardB = Card([fieldB, echoB])',
            'fieldB = Input($b, "Second")',
            'echoB = Text(@Lower($b))',
            'cardStatic = Card([titleStatic, tableStatic, chartStatic])',
            'titleStatic = Title("Static Summary")',
            'tableStatic = Table(["Metric", "Value"], [["Users", 120]])',
            'chartStatic = Chart("bar", [{ label: "Q1", score: 80 }], "label", ["score"])',
          ].join('\n'),
          streaming: false,
        },
      })

      expect(wrapper.find('[data-openui-node="echoA"]').text()).toBe('ADA')
      expect(wrapper.find('[data-openui-node="echoB"]').text()).toBe('grace')
      expect(upperSpy).toHaveBeenCalledTimes(1)
      expect(lowerSpy).toHaveBeenCalledTimes(1)

      const renders = trackPrimitiveRenders(wrapper)
      upperSpy.mockClear()
      lowerSpy.mockClear()

      // Mutate $a only.
      await wrapper.find('input[aria-label="First"]').setValue('lovelace')
      await nextTick()

      expect(wrapper.find('[data-openui-node="echoA"]').text()).toBe('LOVELACE')
      expect(wrapper.find('[data-openui-node="echoB"]').text()).toBe('grace')

      // Only @Upper($a) re-evaluated; @Lower($b) did not run at all.
      expect(upperSpy).toHaveBeenCalledTimes(1)
      expect(lowerSpy).toHaveBeenCalledTimes(0)

      // Only fieldA and echoA re-rendered; ancestors and all sibling subtrees stayed untouched.
      expect(renders.get('fieldA')).toBeGreaterThanOrEqual(1)
      expect(renders.get('echoA')).toBe(1)
      expect(renders.get('root')).toBe(0)
      expect(renders.get('cardA')).toBe(0)
      expect(renders.get('cardB')).toBe(0)
      expect(renders.get('fieldB')).toBe(0)
      expect(renders.get('echoB')).toBe(0)
      expect(renders.get('cardStatic')).toBe(0)
      expect(renders.get('titleStatic')).toBe(0)
      expect(renders.get('tableStatic')).toBe(0)
      expect(renders.get('chartStatic')).toBe(0)

      // Mutate $b only and confirm isolation works symmetrically.
      renders.reset()
      upperSpy.mockClear()
      lowerSpy.mockClear()

      await wrapper.find('input[aria-label="Second"]').setValue('HOPPER')
      await nextTick()

      expect(wrapper.find('[data-openui-node="echoB"]').text()).toBe('hopper')
      expect(lowerSpy).toHaveBeenCalledTimes(1)
      expect(upperSpy).toHaveBeenCalledTimes(0)

      expect(renders.get('fieldB')).toBeGreaterThanOrEqual(1)
      expect(renders.get('echoB')).toBe(1)
      expect(renders.get('root')).toBe(0)
      expect(renders.get('cardA')).toBe(0)
      expect(renders.get('fieldA')).toBe(0)
      expect(renders.get('echoA')).toBe(0)
      expect(renders.get('cardB')).toBe(0)
      expect(renders.get('cardStatic')).toBe(0)
      expect(renders.get('tableStatic')).toBe(0)
      expect(renders.get('chartStatic')).toBe(0)
    }
    finally {
      upperSpy.mockRestore()
      lowerSpy.mockRestore()
    }
  })

  it('isolates leaf state updates inside @Each and conditional rootExpression subtrees', async () => {
    const eachWrapper = mount(TxAiOpenUI, {
      props: {
        content: [
          'root = Col([pickB, itemsList])',
          '$selected = "a"',
          '$items = [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }]',
          'pickB = Button("Select Beta", @Set($selected, "b"))',
          'itemsList = Col(@Each($items, "item", Card([Text(item.name), Text($selected == item.id ? "Active" : "Idle")])))',
        ].join('\n'),
        streaming: false,
      },
    })

    const cardsBefore = eachWrapper.findAll('.tx-ai-openui__card')
    expect(cardsBefore).toHaveLength(2)
    expect(cardsBefore[0]!.text()).toContain('Alpha')
    expect(cardsBefore[0]!.text()).toContain('Active')
    expect(cardsBefore[1]!.text()).toContain('Beta')
    expect(cardsBefore[1]!.text()).toContain('Idle')

    const eachRenders = trackPrimitiveRenders(eachWrapper)

    await eachWrapper.find('button[aria-label="Select Beta"]').trigger('click')
    await nextTick()

    const cardsAfter = eachWrapper.findAll('.tx-ai-openui__card')
    expect(cardsAfter[0]!.text()).toContain('Idle')
    expect(cardsAfter[1]!.text()).toContain('Active')

    // Neither root, button, itemsList, nor the generated Card containers re-rendered.
    expect(eachRenders.get('root')).toBe(0)
    expect(eachRenders.get('pickB')).toBe(0)
    expect(eachRenders.get('itemsList')).toBe(0)
    expect(eachRenders.get('root.children.1.children.0')).toBe(0)
    expect(eachRenders.get('root.children.1.children.1')).toBe(0)
    // Static item.name text nodes stayed untouched; only the $selected status leaves re-rendered.
    expect(eachRenders.get('root.children.1.children.0.children.0')).toBe(0)
    expect(eachRenders.get('root.children.1.children.1.children.0')).toBe(0)
    expect(eachRenders.get('root.children.1.children.0.children.1')).toBe(1)
    expect(eachRenders.get('root.children.1.children.1.children.1')).toBe(1)

    // Root ternary expression (`rootExpression`): changing inner state does not re-render Card.
    const ternaryWrapper = mount(TxAiOpenUI, {
      props: {
        content: [
          'root = $tab == "a" ? cardA : cardB',
          '$tab = "a"',
          '$note = "init"',
          'cardA = Card([fieldNote, echoNote, goB])',
          'fieldNote = Input($note, "Note")',
          'echoNote = Text("Note: " + $note)',
          'goB = Button("Switch", @Set($tab, "b"))',
          'cardB = Card([Title("Pane B")])',
        ].join('\n'),
        streaming: false,
      },
    })

    expect(ternaryWrapper.text()).toContain('Note: init')
    const ternaryRenders = trackPrimitiveRenders(ternaryWrapper)

    await ternaryWrapper.find('input[aria-label="Note"]').setValue('updated')
    await nextTick()

    expect(ternaryWrapper.text()).toContain('Note: updated')
    expect(ternaryRenders.get('root.children.1')).toBe(1)
    expect(ternaryRenders.get('root')).toBe(0)
    expect(ternaryRenders.get('root.children.2')).toBe(0)

    await ternaryWrapper.find('button[aria-label="Switch"]').trigger('click')
    await nextTick()
    expect(ternaryWrapper.text()).toContain('Pane B')
  })
})

describe('tx-ai-openui actions, widgets, and error handling', () => {
  it('supports OpenUrl, CopyToClipboard, default button action, and blocks unsafe URLs', async () => {
    const wrapper = mount(TxAiOpenUI, {
      props: {
        content: [
          'root = Col([openSafe, openBad, copyBtn, plainBtn])',
          'openSafe = Button("Open Docs", @OpenUrl("https://example.com/docs"))',
          'openBad = Button("Unsafe", @OpenUrl("javascript:alert(1)"))',
          'copyBtn = Button("Copy", @CopyToClipboard("copied-text"))',
          'plainBtn = Button("Ask Followup")',
        ].join('\n'),
        streaming: false,
      },
    })

    await wrapper.find('button[aria-label="Open Docs"]').trigger('click')
    await wrapper.find('button[aria-label="Unsafe"]').trigger('click')
    await wrapper.find('button[aria-label="Copy"]').trigger('click')
    await wrapper.find('button[aria-label="Ask Followup"]').trigger('click')

    const actions = (wrapper.emitted('action') ?? []).map(entry => entry[0])
    expect(actions).toEqual([
      { type: 'open_url', params: { url: 'https://example.com/docs' } },
      { type: 'copy_to_clipboard', params: { text: 'copied-text' } },
      { type: 'continue_conversation', context: 'Ask Followup', params: undefined },
    ])
  })

  it('suppresses actions while streaming and reports parse notices when settled', async () => {
    const wrapper = mount(TxAiOpenUI, {
      props: {
        content: 'root = Col([btn])\nbtn = Button("Go", @ToAssistant("Now"))',
        streaming: true,
      },
    })

    await wrapper.find('button[aria-label="Go"]').trigger('click')
    expect(wrapper.emitted('action')).toBeUndefined()

    await wrapper.setProps({
      content: 'root = Col([missingRef])',
      streaming: false,
    })
    await nextTick()

    const notice = wrapper.find('.tx-ai-openui__notice')
    expect(notice.exists()).toBe(true)
    expect(notice.attributes('role')).toBe('status')
  })

  it('renders TDS-aligned semantic primitives without wrapping Select or RadioGroup in outer labels', async () => {
    const resolveImage = vi.fn(async (query: string) => `https://cdn.example.com/${encodeURIComponent(query)}.png`)
    const wrapper = mount(TxAiOpenUI, {
      props: {
        content: [
          'root = Col([quote, badge, seg, sel, area, tbl, img, chrt])',
          '$mode = "day"',
          '$role = "dev"',
          '$bio = "hello"',
          'quote = Quote("Measure twice.", "Craft")',
          'badge = Badge("Ready", "success")',
          'seg = SegmentedControl($mode, ["day", "week"], true)',
          'sel = Select($role, ["dev", "ops"], "Role")',
          'area = TextArea($bio, "Bio", "Write here", 4)',
          'tbl = Table(["Name", "Count"], [["Alpha", 42]])',
          'img = SearchImage("mountain")',
          'chrt = Chart("line", [{ x: "Mon", v: 10 }, { x: "Tue", v: 20 }], "x", ["v"])',
        ].join('\n'),
        streaming: false,
        resolveImage,
      },
    })

    await nextTick()
    await Promise.resolve()
    await nextTick()

    // Quote & Badge
    expect(wrapper.find('blockquote.tx-ai-openui__quote p').text()).toBe('Measure twice.')
    expect(wrapper.find('blockquote.tx-ai-openui__quote cite').text()).toBe('Craft')
    expect(wrapper.find('.tx-ai-openui__badge.is-tone-success').text()).toContain('Ready')

    // SegmentedControl supports block mode and updates bound state without nested <label>
    const segmented = wrapper.find('.tx-ai-openui__choices.is-segmented.is-block')
    expect(segmented.exists()).toBe(true)
    expect(segmented.element.closest('label')).toBeNull()
    const weekRadio = segmented.find('input[value="week"]')
    await weekRadio.setValue(true)
    await nextTick()
    expect(segmented.find('.tx-ai-openui__choice.is-selected').text()).toBe('week')

    // Select is NOT wrapped in a <label> (avoids TxSelect double-toggle bug)
    const select = wrapper.find('.tuff-select')
    expect(select.exists()).toBe(true)
    expect(select.element.closest('label')).toBeNull()

    // TextArea uses explicit <label for="..."> pairing
    const textarea = wrapper.find('textarea.tx-ai-openui__textarea')
    expect(textarea.exists()).toBe(true)
    const textareaId = textarea.attributes('id')
    expect(textareaId).toBeTruthy()
    expect(wrapper.find(`label[for="${textareaId}"]`).text()).toBe('Bio')

    // Table has accessible region and column header scope
    expect(wrapper.find('.tx-ai-openui__table-scroll').attributes('role')).toBe('region')
    expect(wrapper.find('.tx-ai-openui__table th').attributes('scope')).toBe('col')
    expect(wrapper.find('.tx-ai-openui__table td.is-numeric').text()).toBe('42')

    // SearchImage resolved via callback & Chart rendered accessible container
    expect(resolveImage).toHaveBeenCalledWith('mountain')
    expect(wrapper.find('.tx-ai-openui__image img').attributes('src')).toBe('https://cdn.example.com/mountain.png')
    expect(wrapper.find('.tx-ai-openui__chart').attributes('role')).toBe('img')
  })

  it('scopes radio group names per instance so duplicate OpenUI messages never collide', async () => {
    const program = [
      'root = Col([seg])',
      '$range = "day"',
      'seg = SegmentedControl($range, ["day", "week"], "Range")',
    ].join('\n')

    const wrapper = mount({
      components: { TxAiOpenUI },
      data: () => ({ program }),
      template: '<div><div data-msg="1"><TxAiOpenUI :content="program" :streaming="false" /></div><div data-msg="2"><TxAiOpenUI :content="program" :streaming="false" /></div></div>',
    }, {
      attachTo: document.body,
    })

    try {
      const firstDay = wrapper.find('[data-msg="1"] input[type="radio"][value="day"]')
      const secondWeek = wrapper.find('[data-msg="2"] input[type="radio"][value="week"]')

      expect(firstDay.attributes('name')).toBeTruthy()
      expect(secondWeek.attributes('name')).toBeTruthy()
      expect(firstDay.attributes('name')).not.toBe('seg')
      expect(firstDay.attributes('name')).not.toBe(secondWeek.attributes('name'))
      expect((firstDay.element as HTMLInputElement).checked).toBe(true)

      await secondWeek.setValue(true)
      await nextTick()

      // Selecting an option in message 2 must NOT uncheck message 1's radio
      expect((secondWeek.element as HTMLInputElement).checked).toBe(true)
      expect((firstDay.element as HTMLInputElement).checked).toBe(true)
    }
    finally {
      wrapper.unmount()
    }
  })
})

describe('openui.css TDS style and token contract', () => {
  const rawOpenuiCss = readFileSync(resolve(__dirname, '../openui.css'), 'utf8')
  const strippedCss = rawOpenuiCss.replace(/\/\*[\s\S]*?\*\//g, '')

  it('contains no raw hex color literals outside CSS token var() fallbacks', () => {
    const hexMatches = [...strippedCss.matchAll(/#[0-9a-fA-F]{3,8}\b/g)]
    expect(hexMatches.length).toBeGreaterThan(0)

    for (const match of hexMatches) {
      const index = match.index ?? 0
      const lineStart = strippedCss.lastIndexOf('\n', index) + 1
      const lineEnd = strippedCss.indexOf('\n', index)
      const line = strippedCss.slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
      // Every hex literal must sit inside a `var(--tx-* ...)` or `var(--shell-* ...)` fallback.
      expect(line).toMatch(/var\(--(?:tx|shell)-[a-z0-9-]+,[\s\S]*#[0-9a-fA-F]{3,8}\b/)
    }

    // No bare rgb()/rgba()/hsl()/hsla() color literals anywhere in openui.css.
    expect(strippedCss).not.toMatch(/\b(?:rgba?|hsla?)\s*\(/i)
  })

  it('forbids hover color easing and bold 700 weights, enforces concentric radii and reduced-motion', () => {
    // No transitions easing color, background, or border-color.
    const transitions = [...strippedCss.matchAll(/transition(?:-property)?\s*:([^;]+);/gi)]
    for (const [, value] of transitions)
      expect(value).not.toMatch(/\b(?:all|color|background(?:-color)?|border(?:-color)?)\b/i)

    // No 700 / bold font weights on OpenUI prose.
    expect(strippedCss).not.toMatch(/font-weight\s*:\s*(?:700|bold)\b/i)

    // Concentric radius calculation for SegmentedControl thumb inside track.
    expect(strippedCss).toContain('calc(var(--openui-segmented-radius) - var(--openui-segmented-pad))')

    // Streaming-safe text-wrap: pretty & heading text-wrap: balance.
    expect(strippedCss).toContain('text-wrap: balance')
    expect(strippedCss).toContain('text-wrap: pretty')

    // Reduced-motion escape block present and stops animation & transition.
    expect(strippedCss).toMatch(/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/)
    expect(strippedCss).toMatch(/animation\s*:\s*none\s*!important/)
    expect(strippedCss).toMatch(/transition\s*:\s*none\s*!important/)
  })
})

describe('openUIPrompt TDS visual rules', () => {
  it('embeds concise TDS hierarchy, semantic state, and data integrity rules without bloating the prompt', () => {
    const prompt = openUIPrompt()

    expect(prompt).toContain('TDS HIERARCHY:')
    expect(prompt).toContain('never nest Card inside Card')
    expect(prompt).toContain('TDS SEMANTIC STATE:')
    expect(prompt).toContain('Never rely on color alone for status')
    expect(prompt).toContain('tabularNums')
    expect(prompt).toContain('TDS DATA INTEGRITY:')
    expect(prompt).toContain('never invent placeholder metrics')

    // Guard against prompt bloat: each added TDS rule stays concise (< 260 chars).
    const tdsRuleLines = prompt.split('\n').filter(line => /TDS (?:HIERARCHY|SEMANTIC STATE|DATA INTEGRITY):/.test(line))
    expect(tdsRuleLines).toHaveLength(3)
    for (const line of tdsRuleLines)
      expect(line.length).toBeLessThan(260)
  })
})
