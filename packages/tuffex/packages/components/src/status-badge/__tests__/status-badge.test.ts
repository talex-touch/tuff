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

    // The OS marker stays a bare glyph — it names a platform, not a state — so
    // it keeps `__icon`, while the tone's glyph moved inside the disc.
    expect(wrapper.find('.tx-status-badge__icon').classes()).toContain('i-simple-icons-apple')
    expect(wrapper.find('.tx-status-badge__glyph').classes()).toContain('i-carbon-information')

    const osOnly = mount(TxStatusBadge, {
      props: {
        text: 'Linux',
        os: 'linux',
        osOnly: true,
      },
    })
    expect(osOnly.findAll('.tx-status-badge__icon')).toHaveLength(1)
    expect(osOnly.find('.tx-status-badge__icon').classes()).toContain('i-simple-icons-linux')
    // `osOnly` suppresses the state disc entirely.
    expect(osOnly.find('.tx-status-badge__chip').exists()).toBe(false)
  })

  it('uses custom icon and emits click', async () => {
    const wrapper = mount(TxStatusBadge, {
      props: {
        text: 'Custom',
        icon: 'i-carbon-star-filled',
      },
    })

    expect(wrapper.find('.tx-status-badge__glyph').classes()).toContain('i-carbon-star-filled')

    await wrapper.trigger('click')
    expect(wrapper.emitted('click')?.[0][0]).toBeInstanceOf(MouseEvent)
  })

  it('knocks the glyph out of a filled disc, and leaves muted an empty ring', () => {
    const approved = mount(TxStatusBadge, { props: { text: 'Approved', status: 'success' } })
    const disc = approved.find('.tx-status-badge__chip')
    expect(disc.exists()).toBe(true)
    expect(disc.classes()).not.toContain('is-hollow')
    // The disc is decoration; the mono label is what carries the state.
    expect(disc.attributes('aria-hidden')).toBe('true')

    // "Not started" is an absence, so it renders as a dashed ring with no glyph
    // rather than one more filled disc.
    const notStarted = mount(TxStatusBadge, { props: { text: 'Not started', status: 'muted' } })
    expect(notStarted.find('.tx-status-badge__chip').classes()).toContain('is-hollow')
    expect(notStarted.find('.tx-status-badge__glyph').exists()).toBe(false)
  })

  it('lets a custom icon opt muted back into a filled disc', () => {
    const wrapper = mount(TxStatusBadge, {
      props: { text: 'Queued', status: 'muted', icon: 'i-carbon-pause' },
    })

    // The host asked for a symbol, so there is something to knock out.
    expect(wrapper.find('.tx-status-badge__chip').classes()).not.toContain('is-hollow')
    expect(wrapper.find('.tx-status-badge__glyph').classes()).toContain('i-carbon-pause')
  })

  it('paints the disc from the chip ramp, not from the label hue', () => {
    const wrapper = mount(TxStatusBadge, { props: { text: 'Cancelled', status: 'danger' } })
    const style = wrapper.attributes('style')!

    // Two different ramps on purpose: a glyph knocked out of `--tx-color-danger`
    // measures 2.88:1, under the 3:1 minimum for a graphical object.
    expect(style).toContain('--tx-status-color: var(--tx-color-danger)')
    expect(style).toContain('--tx-status-chip: var(--tx-status-chip-danger)')
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
    ['success', 'i-carbon-checkmark'],
    ['warning', 'i-carbon-time'],
    ['danger', 'i-carbon-close'],
    ['info', 'i-carbon-information'],
  ] as const)('knocks a solid glyph out of the disc for the %s tone', (status, icon) => {
    const wrapper = mount(TxStatusBadge, { props: { text: status, status } })
    const glyphs = wrapper.findAll('.tx-status-badge__glyph')
    expect(glyphs).toHaveLength(1)
    expect(glyphs[0].classes()).toContain(icon)
    // The disc supplies the enclosing circle, so an outlined glyph would draw a
    // second one inside it.
    expect(glyphs[0].classes().some(c => c.endsWith('-outline'))).toBe(false)
  })

  it('gives muted no glyph at all, because absence is not a state symbol', () => {
    const wrapper = mount(TxStatusBadge, { props: { text: 'Not started', status: 'muted' } })
    expect(wrapper.findAll('.tx-status-badge__glyph')).toHaveLength(0)
  })

  describe('style contract (source)', () => {
    const sfc = readFileSync(SFC_PATH, 'utf8')
    const style = sfc.slice(sfc.indexOf('<style'), sfc.indexOf('</style>'))
    const root = blockBody(style, '\n.tx-status-badge')

    it('positive control: the brace matcher isolates the root rule and its nested rules', () => {
      expect(root.length).toBeGreaterThan(100)
      expect(declaration(ownDeclarations(root), 'font-size')).toBe('12px')
      expect(blockBody(root, '&--sm')).toMatch(/padding/)
      // And the stripper really removes nested rules rather than being a no-op:
      // the icon's `1em` lives one level down, so it must not leak into the
      // root's own declarations, or the two font-size assertions here and below
      // would be reading the same text.
      expect(ownDeclarations(root)).not.toContain('1em')
      expect(blockBody(root, '&__icon')).toContain('1em')
    })

    it('is a mono label, not a pill and not a button', () => {
      const own = ownDeclarations(root)
      // The 999px cap it used to carry read as a quiet TxButton at a glance.
      // A square-ish radius plus the mono face gives the family its own
      // silhouette. 700 would put it back in button territory.
      expect(declaration(own, 'border-radius')).toBe('8px')
      expect(declaration(own, 'font-weight')).toBe('500')
      expect(declaration(own, 'font-family')).toContain('--tx-font-mono')
    })

    it('carries no border: the tint and the disc already bound the badge', () => {
      // A hairline on top of both reads as a third edge. This is a deliberate
      // divergence from the TxBadge / TxTag / TxAlert 12%/32% recipe — only the
      // border half is dropped, the tint stays in family.
      expect(ownDeclarations(root)).not.toMatch(/(^|\s)border:/)
    })

    it('paints the disc from the chip ramp and never from --tx-color-*', () => {
      const chip = ownDeclarations(blockBody(root, '&__chip'))
      expect(declaration(chip, 'background')).toContain('--tx-status-chip')
      expect(declaration(chip, 'color')).toContain('--tx-status-chip-on')
      // Reaching for the label hue here is the 1.67–2.90:1 regression.
      expect(declaration(chip, 'background')).not.toContain('--tx-color-')
    })

    it('renders the muted disc as a dashed ring rather than a fill', () => {
      const hollow = ownDeclarations(blockBody(root, '&.is-hollow'))
      expect(declaration(hollow, 'background')).toBe('transparent')
      expect(declaration(hollow, 'border')).toContain('dashed')
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

    it('tightens only the disc side, leaving the text side its own inset', () => {
      // The disc is a circle: with a leading inset equal to the vertical one,
      // its centre lands the same distance from the left edge as from the top,
      // so the two read as one gap. The text side keeps the text-only inset —
      // letters have square corners and need the room the disc does not.
      for (const size of ['sm', 'md']) {
        const base = ownDeclarations(blockBody(root, `&--${size} {`))
        const [vertical, horizontal] = declaration(base, 'padding')!
          .split(/\s+/)
          .map(value => Number.parseFloat(value))
        const withIcon = ownDeclarations(blockBody(root, `&--${size}.has-icon`))

        expect(Number.parseFloat(declaration(withIcon, 'padding-left')!)).toBe(vertical)
        // Untouched, so the declaration is absent and the base value stands.
        expect(declaration(withIcon, 'padding-right')).toBeNull()
        expect(horizontal).toBeGreaterThan(vertical!)
      }
    })

    it('drives the disc size from a custom property a host can override', () => {
      const glyph = ownDeclarations(blockBody(root, '&__glyph'))
      // The glyph has to sit inside a circle, so it is a fraction of the disc
      // rather than 1em of the text: at 1em it would touch the disc's edge.
      expect(Number.parseFloat(declaration(glyph, 'font-size')!)).toBeLessThan(1)

      // A per-size rule block would leave a host no handle. Two callers
      // (nexus dashboard assets, core-app StoreItemCard) compress the badge for
      // a dense row and used to scale the glyph via `font-size`; the disc is
      // px-sized now, so it needs its own knob or it towers over the text.
      const chip = ownDeclarations(blockBody(root, '&__chip'))
      expect(declaration(chip, 'width')).toContain('--tx-status-chip-size')
      expect(declaration(chip, 'height')).toContain('--tx-status-chip-size')
      expect(blockBody(root, '&--md')).toContain('--tx-status-chip-size: 18px')
      expect(blockBody(root, '&--sm')).toContain('--tx-status-chip-size: 15px')
    })
  })

  it('flags a pill that opens with a glyph, so only that side takes the concentric padding', () => {
    expect(mount(TxStatusBadge, { props: { text: 'Online', status: 'success' } }).classes()).toContain('has-icon')
    expect(mount(TxStatusBadge, { props: { text: 'macOS', os: 'macos', osOnly: true } }).classes()).toContain('has-icon')
    // No glyph at all: the pill keeps its symmetric padding.
    expect(mount(TxStatusBadge, { props: { text: 'Plain', osOnly: true } }).classes()).not.toContain('has-icon')
  })
})
