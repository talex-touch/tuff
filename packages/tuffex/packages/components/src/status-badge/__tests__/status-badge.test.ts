import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxStatusBadge from '../src/TxStatusBadge.vue'

const SFC_PATH = resolve(__dirname, '../src/TxStatusBadge.vue')

/**
 * Body of the first `{ … }` block opened after `selector`, walking braces so nested rules
 * do not truncate it. Throws when the selector is absent so a renamed selector cannot pass
 * as "declaration not present".
 */
function blockBody(source: string, selector: string): string {
  const start = source.indexOf(selector)
  if (start < 0)
    throw new Error(`selector not found: ${selector}`)
  const open = source.indexOf('{', start)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{')
      depth++
    else if (source[i] === '}' && --depth === 0)
      return source.slice(open + 1, i)
  }
  throw new Error(`unterminated block for selector: ${selector}`)
}

/** The block's own declarations, with every nested rule removed. */
function ownDeclarations(body: string): string {
  let out = ''
  let depth = 0
  for (const ch of body) {
    if (ch === '{') {
      depth++
      continue
    }
    if (ch === '}') {
      depth--
      continue
    }
    if (depth === 0)
      out += ch
  }
  return out
}

function declaration(block: string, property: string): string | null {
  const match = new RegExp(`(^|\\n)\\s*${property}\\s*:\\s*([^;]+);`).exec(block)
  return match ? match[2].trim() : null
}

describe('txStatusBadge', () => {
  it('renders text, size, and explicit status tone', () => {
    const wrapper = mount(TxStatusBadge, {
      props: {
        text: 'Online',
        status: 'success',
        size: 'sm',
      },
    })

    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.classes()).toContain('tx-status-badge--sm')
    expect(wrapper.find('.tx-status-badge__text').text()).toBe('Online')
    expect(wrapper.attributes('style')).toContain('--tx-status-color: var(--tx-color-success)')
  })

  it('maps status keys and lets explicit status take precedence', () => {
    const denied = mount(TxStatusBadge, {
      props: {
        text: 'Denied',
        statusKey: 'denied',
      },
    })
    expect(denied.attributes('style')).toContain('--tx-status-color: var(--tx-color-danger)')

    const explicit = mount(TxStatusBadge, {
      props: {
        text: 'Muted denied',
        status: 'muted',
        statusKey: 'denied',
      },
    })
    expect(explicit.attributes('style')).toContain('--tx-status-color: var(--tx-text-color-secondary)')
  })

  it('renders platform icon and supports osOnly', () => {
    const wrapper = mount(TxStatusBadge, {
      props: {
        text: 'macOS',
        os: 'macos',
        status: 'info',
      },
    })

    const icons = wrapper.findAll('.tx-status-badge__icon')
    expect(icons).toHaveLength(2)
    expect(icons[0].classes()).toContain('i-simple-icons-apple')
    expect(icons[1].classes()).toContain('i-carbon-information')

    const osOnly = mount(TxStatusBadge, {
      props: {
        text: 'Linux',
        os: 'linux',
        osOnly: true,
      },
    })
    expect(osOnly.findAll('.tx-status-badge__icon')).toHaveLength(1)
    expect(osOnly.find('.tx-status-badge__icon').classes()).toContain('i-simple-icons-linux')
  })

  it('uses custom icon and emits click', async () => {
    const wrapper = mount(TxStatusBadge, {
      props: {
        text: 'Custom',
        icon: 'i-carbon-star-filled',
      },
    })

    expect(wrapper.find('.tx-status-badge__icon').classes()).toContain('i-carbon-star-filled')

    await wrapper.trigger('click')
    expect(wrapper.emitted('click')?.[0][0]).toBeInstanceOf(MouseEvent)
  })

  it('becomes a keyboard-reachable button when a click listener is attached', async () => {
    const onClick = () => {}
    const wrapper = mount(TxStatusBadge, {
      props: { text: 'Open', status: 'info', onClick },
    })

    // A clickable badge is a button: reachable and Enter/Space-activatable.
    expect(wrapper.attributes('role')).toBe('button')
    expect(wrapper.attributes('tabindex')).toBe('0')

    await wrapper.trigger('keydown', { key: 'Enter' })
    await wrapper.trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('click')).toHaveLength(2)
  })

  it('stays a passive status region without a click listener', () => {
    const wrapper = mount(TxStatusBadge, { props: { text: 'Idle', status: 'muted' } })
    // No over-blocking: a non-interactive badge is a status region, out of the tab order.
    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.attributes('tabindex')).toBeUndefined()
  })

  // The five default icons are one outline "circle + glyph" family with a shared stroke
  // weight, so no tone carries more visual mass than another. A filled success disc next
  // to outlined warning / danger reads as "selected vs inactive" — a hierarchy the badge
  // does not have.
  it.each([
    ['success', 'i-carbon-checkmark-outline'],
    ['warning', 'i-carbon-warning'],
    ['danger', 'i-carbon-close-outline'],
    ['info', 'i-carbon-information'],
    ['muted', 'i-carbon-circle-dash'],
  ] as const)('renders the outline family icon for the %s tone', (status, icon) => {
    const wrapper = mount(TxStatusBadge, { props: { text: status, status } })
    const icons = wrapper.findAll('.tx-status-badge__icon')
    expect(icons).toHaveLength(1)
    expect(icons[0].classes()).toContain(icon)
    // Guard against a stale filled/solid glyph sneaking back in.
    expect(icons[0].classes().some(c => c.endsWith('-filled'))).toBe(false)
  })

  describe('style contract (source)', () => {
    const sfc = readFileSync(SFC_PATH, 'utf8')
    const style = sfc.slice(sfc.indexOf('<style'), sfc.indexOf('</style>'))
    const root = blockBody(style, '\n.tx-status-badge')

    it('positive control: the brace matcher isolates the root rule and its nested rules', () => {
      expect(root.length).toBeGreaterThan(100)
      expect(declaration(ownDeclarations(root), 'font-size')).toBe('12px')
      expect(blockBody(root, '&--sm')).toMatch(/padding/)
    })

    it('is a pill at TxBadge weight, not a button', () => {
      const own = ownDeclarations(root)
      expect(declaration(own, 'border-radius')).toBe('999px')
      expect(declaration(own, 'font-weight')).toBe('500')
    })

    it('sizes the icon with the text instead of a fixed pixel size', () => {
      const icon = ownDeclarations(blockBody(root, '&__icon'))
      expect(declaration(icon, 'font-size')).toBe('1em')
    })

    it('keeps at least 10px of horizontal padding at md so the pill end caps clear the icon', () => {
      const md = ownDeclarations(blockBody(root, '&--md'))
      const padding = declaration(md, 'padding')
      expect(padding).not.toBeNull()
      const parts = padding!.split(/\s+/).map(v => Number.parseFloat(v))
      const horizontal = parts.length === 1 ? parts[0] : parts[1]
      expect(horizontal).toBeGreaterThanOrEqual(10)
    })
  })
})
