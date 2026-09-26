import type { MDCElement, MDCNode, MDCRoot } from '@nuxtjs/mdc'
import { parseMarkdown } from '@nuxtjs/mdc/runtime'
import { describe, expect, it } from 'vitest'
import { closeSelfClosingComponentTags, remarkCloseComponentTags } from './remark-close-component-tags'

function parse(markdown: string, { close = true } = {}) {
  return parseMarkdown(markdown, {
    highlight: false,
    remark: { plugins: close ? { 'remark-close-component-tags': { instance: remarkCloseComponentTags } } : {} },
  })
}

function isElement(node: MDCNode | undefined): node is MDCElement {
  return node?.type === 'element'
}

function outline(nodes: MDCNode[]): string[] {
  return nodes.filter(isElement).map(node => `${node.tag}(${node.children.filter(isElement).length})`)
}

/** Every element tag in document order: which elements exist, regardless of nesting. */
function tagsOf(nodes: MDCNode[]): string[] {
  return nodes.filter(isElement).flatMap(node => [node.tag, ...tagsOf(node.children)])
}

function findElement(root: MDCRoot | MDCElement, tag: string): MDCElement | undefined {
  const stack = [...root.children]
  while (stack.length) {
    const node = stack.shift()
    if (!isElement(node))
      continue
    if (node.tag === tag)
      return node
    stack.unshift(...node.children)
  }
  return undefined
}

function textOf(node: MDCNode): string {
  if (node.type === 'text')
    return node.value
  return node.type === 'element' ? node.children.map(textOf).join('') : ''
}

describe('closeSelfClosingComponentTags', () => {
  it('writes a tag that opens the node as a kebab-case pair, the name MDC gives it', () => {
    expect(closeSelfClosingComponentTags('<TuffDocSourceLink />'))
      .toBe('<tuff-doc-source-link></tuff-doc-source-link>')
    expect(closeSelfClosingComponentTags('<TuffDocSourceLink/>'))
      .toBe('<tuff-doc-source-link></tuff-doc-source-link>')
  })

  it('keeps attributes byte for byte, including quoted > and /> and line breaks', () => {
    expect(closeSelfClosingComponentTags('<TuffDocSourceLink label="查看源码" path="packages/a/index.ts" />'))
      .toBe('<tuff-doc-source-link label="查看源码" path="packages/a/index.ts"></tuff-doc-source-link>')
    expect(closeSelfClosingComponentTags(`<TxBadge title='a > b' hint="x/>y" :count="1" @click="go" disabled />`))
      .toBe(`<tx-badge title='a > b' hint="x/>y" :count="1" @click="go" disabled></tx-badge>`)
    expect(closeSelfClosingComponentTags('<TxProgressBar\n  :percentage="32"\n  show-text\n/>'))
      .toBe('<tx-progress-bar\n  :percentage="32"\n  show-text></tx-progress-bar>')
  })

  it('keeps the spelling of every later tag in the node, which MDC never renames', () => {
    expect(closeSelfClosingComponentTags('<div class="row">\n  <TxTag /> <TxTag label="b" />\n</div>'))
      .toBe('<div class="row">\n  <TxTag></TxTag> <TxTag label="b"></TxTag>\n</div>')
    expect(closeSelfClosingComponentTags('<TxTag />\n<TxTag label="b" />'))
      .toBe('<tx-tag></tx-tag>\n<TxTag label="b"></TxTag>')
    expect(closeSelfClosingComponentTags('  <TxTag />'))
      .toBe('  <TxTag></TxTag>')
  })

  it('leaves tags that are already paired alone', () => {
    for (const html of [
      '<TuffDocSourceLink></TuffDocSourceLink>',
      '<TxButton type="primary">Save</TxButton>',
      '<TxButton>',
      '</TxButton>',
    ])
      expect(closeSelfClosingComponentTags(html)).toBe(html)
  })

  it('leaves lowercase, void and custom-element tags alone', () => {
    for (const html of [
      '<br />',
      '<img src="/logo.svg" alt="" />',
      '<i class="i-ri-home-line" />',
      '<tuff-doc-source-link />',
      '<my-widget data-x="1" />',
    ])
      expect(closeSelfClosingComponentTags(html)).toBe(html)
  })

  it('leaves comments and raw-text elements alone', () => {
    for (const html of [
      '<!-- <TuffDocSourceLink /> -->',
      '<script>const tag = \'<TxButton />\'</script>',
      '<textarea><TxButton /></textarea>',
    ])
      expect(closeSelfClosingComponentTags(html)).toBe(html)

    expect(closeSelfClosingComponentTags('<!-- <TxA /> --><TxB />'))
      .toBe('<!-- <TxA /> --><TxB></TxB>')
  })
})

describe('remarkCloseComponentTags in the MDC pipeline', () => {
  const page = '## Technologies\n\n- Source notes.\n\n<TuffDocSourceLink />\n\n## Use cases\n\n- A list.\n\n## Related\n\ntext\n'

  it('reproduces the bug without the plugin: the tag swallows every later section', async () => {
    const { body } = await parse(page, { close: false })
    expect(outline(body.children)).toEqual(['h2(0)', 'ul(1)', 'tuff-doc-source-link(4)'])
  })

  it('keeps the sections after the tag as its siblings', async () => {
    const { body } = await parse(page)
    expect(outline(body.children)).toEqual(['h2(0)', 'ul(1)', 'tuff-doc-source-link(0)', 'h2(0)', 'ul(1)', 'h2(0)', 'p(0)'])
  })

  it('keeps attributes as props', async () => {
    const { body } = await parse('<TuffDocSourceLink label="View source" path="packages/tuffex/index.ts" />\n\n## Next\n')
    expect(body.children.filter(isElement).map(node => [node.tag, node.props])).toEqual([
      ['tuff-doc-source-link', { label: 'View source', path: 'packages/tuffex/index.ts' }],
      ['h2', { id: 'next' }],
    ])
  })

  it('closes an inline tag inside its paragraph', async () => {
    const { body } = await parse('See <TuffDocSourceLink /> for the source.\n')
    const paragraph = body.children.find(isElement)
    expect(paragraph?.tag).toBe('p')
    expect(paragraph?.children.map(node => isElement(node) ? `<${node.tag}(${node.children.length})>` : textOf(node)))
      .toEqual(['See ', '<tuff-doc-source-link(0)>', ' for the source.'])
  })

  it('names the element exactly as MDC names a paired tag', async () => {
    for (const name of ['TuffDocSourceLink', 'TxAIButton', 'Tx3DCard', 'Foo_Bar']) {
      const closed = await parse(`<${name} />\n`)
      const paired = await parse(`<${name}></${name}>\n`, { close: false })
      expect(outline(closed.body.children), name).toEqual(outline(paired.body.children))
    }
  })

  it('only moves where an element ends, never which element a tag becomes', async () => {
    // A leading component MDC renames, and later ones parse5 only lowercases. Renaming the later
    // ones turned inert markup into live components that threw during SSR (progress-bar docs).
    const cases = [
      ['<TxTag />\n<TxTag label="b" />\n', ['tx-tag(0)', 'txtag(0)']],
      ['<div>\n  <TxProgressBar :format="p => p" />\n  <TxProgressBar />\n</div>\n', ['div(2)']],
    ] as const
    for (const [markdown, expected] of cases) {
      const closed = await parse(markdown)
      const unclosed = await parse(markdown, { close: false })
      expect(tagsOf(closed.body.children), markdown).toEqual(tagsOf(unclosed.body.children))
      expect(outline(closed.body.children), markdown).toEqual(expected)
    }
  })

  it('leaves fenced code, inline code and MDC code props as written', async () => {
    const markdown = [
      '```vue',
      '<TuffDocSourceLink />',
      '```',
      '',
      'Write `<TuffDocSourceLink />` once per page.',
      '',
      ':::TuffDemoWrapper{demo="SliderDemo"}',
      '---',
      'code: |',
      '  <template>',
      '    <TxSlider v-model="value" />',
      '  </template>',
      '---',
      ':::',
      '',
    ].join('\n')
    const { body } = await parse(markdown)

    expect(textOf(findElement(body, 'pre')!)).toBe('<TuffDocSourceLink />\n')
    expect(textOf(findElement(findElement(body, 'p')!, 'code')!)).toBe('<TuffDocSourceLink />')
    expect(findElement(body, 'tuff-demo-wrapper')?.props?.code).toContain('<TxSlider v-model="value" />')
    expect(findElement(body, 'tuff-doc-source-link')).toBeUndefined()
  })
})
