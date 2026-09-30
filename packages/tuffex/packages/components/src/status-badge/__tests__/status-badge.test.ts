import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxStatusBadge from '../src/TxStatusBadge.vue'


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


  it('flags a pill that opens with a glyph, so only that side takes the concentric padding', () => {
    expect(mount(TxStatusBadge, { props: { text: 'Online', status: 'success' } }).classes()).toContain('has-icon')
    expect(mount(TxStatusBadge, { props: { text: 'macOS', os: 'macos', osOnly: true } }).classes()).toContain('has-icon')
    // No glyph at all: the pill keeps its symmetric padding.
    expect(mount(TxStatusBadge, { props: { text: 'Plain', osOnly: true } }).classes()).not.toContain('has-icon')
  })
})
