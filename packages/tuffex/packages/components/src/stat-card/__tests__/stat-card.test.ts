import { flushPromises, mount } from '@vue/test-utils'
import * as sass from 'sass'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import TxStatCard from '../src/TxStatCard.vue'
import txStatCardSource from '../src/TxStatCard.vue?raw'

vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
  callback(0)
  return 0
})

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

async function flushStatCardTimers() {
  vi.runAllTimers()
  await flushPromises()
  await nextTick()
}

describe('txStatCard', () => {
  it('renders default value, label, icon aura and glyph, and clickable state', () => {
    const wrapper = mount(TxStatCard, {
      props: {
        value: 'Ready',
        label: 'Status',
        iconClass: 'i-carbon-checkmark',
        clickable: true,
      },
    })

    expect(wrapper.attributes('role')).toBe('group')
    // The group name now derives from the visible label via aria-labelledby (so
    // each card is distinguishable and localizable) instead of a hardcoded string.
    expect(wrapper.attributes('aria-label')).toBeUndefined()
    const labelledby = wrapper.attributes('aria-labelledby')
    expect(labelledby).toBeTruthy()
    expect(wrapper.get(`[id="${labelledby}"]`).text()).toBe('Status')
    expect(wrapper.classes()).toContain('tx-stat-card--clickable')
    expect(wrapper.find('.tx-stat-card__value').text()).toBe('Ready')
    expect(wrapper.find('.tx-stat-card__label').text()).toBe('Status')
    // The icon's colour is drawn out into an aura of three blobs on the right,
    // and the glyph sits bare in the slot: the badge, its tile and halo are gone.
    const aura = wrapper.get('.tx-stat-card__aura')
    expect(aura.attributes('aria-hidden')).toBe('true')
    expect(aura.findAll('.tx-stat-card__aura-blob')).toHaveLength(3)
    expect(wrapper.get('.tx-stat-card__glyph').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('.tx-stat-card__glyph .tx-stat-card__icon').classes()).toContain('i-carbon-checkmark')
    expect(wrapper.find('.tx-stat-card__badge').exists()).toBe(false)
  })

  it('signals click affordance only on clickable cards (no pointer cursor on the generic hover)', () => {
    const hoverRule = txStatCardSource.match(/\.tx-stat-card:hover\s*\{([\s\S]*?)\}/)
    expect(hoverRule).not.toBeNull()
    // The generic hover must not imply clickability...
    expect(hoverRule![1]).not.toContain('cursor: pointer')
    // ...that cursor belongs to the clickable modifier.
    expect(txStatCardSource).toContain('.tx-stat-card--clickable {')
  })

  it('renders custom value and label slots without replacing the card shell', () => {
    const wrapper = mount(TxStatCard, {
      props: {
        value: 42,
        label: 'Ignored',
      },
      slots: {
        value: '<strong class="custom-value">42ms</strong>',
        label: '<span class="custom-label">Latency</span>',
      },
    })

    expect(wrapper.find('.tx-stat-card__value .custom-value').text()).toBe('42ms')
    expect(wrapper.find('.tx-stat-card__label .custom-label').text()).toBe('Latency')
  })

  it('renders percent insight with derived value, default prefix, suffix, color, and icon', async () => {
    const wrapper = mount(TxStatCard, {
      props: {
        value: 120,
        label: 'Requests',
        insight: {
          from: 100,
          to: 120,
          precision: 0,
        },
      },
    })
    await flushStatCardTimers()

    const insight = wrapper.find('.tx-stat-card__insight')

    expect(wrapper.classes()).toContain('tx-stat-card--insight')
    expect(wrapper.find('.tx-stat-card__label--top').text()).toBe('Requests')
    expect(insight.attributes('style')).toContain('color: var(--tx-color-success, #67c23a)')
    // The default trend glyph is inline SVG, so it renders whether or not the
    // host's utility engine scanned an icon class out of this component.
    expect(insight.find('svg.tx-stat-card__insight-icon--trend').exists()).toBe(true)
    expect(insight.find('i.tx-stat-card__insight-icon').exists()).toBe(false)
    expect(insight.find('.tx-stat-card__insight-prefix').text()).toBe('+')
    expect(insight.text()).toContain('20')
    expect(insight.find('.tx-stat-card__insight-suffix').text()).toBe('%')
    // Sign, number and unit read as one figure, not three spaced tokens.
    expect(insight.find('.tx-stat-card__insight-text').text()).toBe('+20%')
  })

  it('renders delta insight with custom color, icon, suffix, and negative value', async () => {
    const wrapper = mount(TxStatCard, {
      props: {
        value: 70,
        label: 'Usage',
        insight: {
          from: 90,
          to: 70,
          type: 'delta',
          color: 'warning',
          iconClass: 'i-carbon-warning',
          suffix: ' pts',
        },
      },
    })
    await flushStatCardTimers()

    const insight = wrapper.find('.tx-stat-card__insight')

    expect(insight.attributes('style')).toContain('color: var(--tx-color-warning, #e6a23c)')
    expect(insight.find('.tx-stat-card__insight-icon').classes()).toContain('i-carbon-warning')
    expect(insight.find('.tx-stat-card__insight-prefix').exists()).toBe(false)
    expect(insight.text()).toContain('-20')
    expect(insight.find('.tx-stat-card__insight-suffix').text()).toBe('pts')
  })

  it('glows only behind a tinted icon, whatever colour syntax the browser reports', async () => {
    const colors: Record<string, string> = {
      'tint-rgb': 'rgb(64, 158, 255)',
      'tint-srgb': 'color(srgb 0.25 0.62 1)',
      'tint-grey': 'rgb(144, 147, 153)',
    }
    const realGetComputedStyle = window.getComputedStyle.bind(window)
    const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation(((element: Element, pseudo?: string | null) => {
      const tint = Object.keys(colors).find(name => element.classList.contains(name))
      return tint ? ({ color: colors[tint] } as CSSStyleDeclaration) : realGetComputedStyle(element, pseudo)
    }) as typeof window.getComputedStyle)

    const rgb = mount(TxStatCard, { props: { value: 1, label: 'A', iconClass: 'i-carbon-cloud tint-rgb' } })
    const srgb = mount(TxStatCard, { props: { value: 2, label: 'B', iconClass: 'i-carbon-cloud tint-srgb' } })
    const grey = mount(TxStatCard, { props: { value: 3, label: 'C', iconClass: 'i-carbon-cloud tint-grey' } })
    const greyRing = mount(TxStatCard, { props: { value: 4, label: 'D', variant: 'progress', progress: 40, iconClass: 'i-carbon-cloud tint-grey' } })
    await flushStatCardTimers()

    expect(rgb.classes()).toContain('tx-stat-card--tinted')
    expect(rgb.attributes('style')).toContain('--tx-stat-card-icon-color: rgb(64, 158, 255)')
    expect(srgb.classes()).toContain('tx-stat-card--tinted')
    // A grey icon has no hue to glow with; mixing it in drew fog behind the number.
    expect(grey.classes()).not.toContain('tx-stat-card--tinted')
    expect(grey.attributes('style') ?? '').not.toContain('--tx-stat-card-icon-color')
    // The ring still takes a grey icon's colour instead of falling back to primary.
    expect(greyRing.classes()).not.toContain('tx-stat-card--tinted')
    expect(greyRing.attributes('style')).toContain('--tx-stat-card-icon-color: rgb(144, 147, 153)')

    // The aura shows on `--tinted` + `--glow-in` only (the style contract below
    // pins that mapping). Every card fades in; only the tinted ones qualify, so
    // the grey cards render the layer and it stays hidden.
    expect(rgb.classes()).toEqual(expect.arrayContaining(['tx-stat-card--tinted', 'tx-stat-card--glow-in']))
    for (const untinted of [grey, greyRing]) {
      expect(untinted.find('.tx-stat-card__aura').exists()).toBe(true)
      expect(untinted.classes()).toContain('tx-stat-card--glow-in')
      expect(untinted.classes()).not.toContain('tx-stat-card--tinted')
    }

    spy.mockRestore()
  })

  it('re-reads the icon colour after the page theme changes', async () => {
    // The colour is written as a resolved literal. Success, warning and danger
    // differ between the light and dark tokens, so without a re-read the aura
    // and the ring kept the previous theme's hue.
    const root = document.documentElement
    const initialClassName = root.className
    const realGetComputedStyle = window.getComputedStyle.bind(window)
    const spy = vi.spyOn(window, 'getComputedStyle').mockImplementation(((element: Element, pseudo?: string | null) => {
      if (!element.classList.contains('tint-theme'))
        return realGetComputedStyle(element, pseudo)
      if (root.getAttribute('data-tx-contrast') === 'high')
        return { color: 'rgb(134, 239, 172)' } as CSSStyleDeclaration
      return { color: root.classList.contains('dark') ? 'rgb(74, 222, 128)' : 'rgb(103, 194, 58)' } as CSSStyleDeclaration
    }) as typeof window.getComputedStyle)

    const wrapper = mount(TxStatCard, { props: { value: 1, label: 'A', iconClass: 'i-carbon-checkmark tint-theme' } })
    await flushStatCardTimers()
    expect(wrapper.attributes('style')).toContain('--tx-stat-card-icon-color: rgb(103, 194, 58)')

    root.className = 'dark'
    // The mutation record lands in a microtask; the re-read waits one frame.
    await flushPromises()
    await flushStatCardTimers()
    expect(wrapper.attributes('style')).toContain('--tx-stat-card-icon-color: rgb(74, 222, 128)')

    // The high-contrast palette switches on an attribute, not a class.
    root.setAttribute('data-tx-contrast', 'high')
    await flushPromises()
    await flushStatCardTimers()
    expect(wrapper.attributes('style')).toContain('--tx-stat-card-icon-color: rgb(134, 239, 172)')

    wrapper.unmount()
    root.removeAttribute('data-tx-contrast')
    root.className = initialClassName
    spy.mockRestore()
  })

  it('renders progress variant from explicit progress and clamps the ring percent', () => {
    const wrapper = mount(TxStatCard, {
      props: {
        value: 128,
        label: 'Sync',
        variant: 'progress',
        progress: 142,
        iconClass: 'i-carbon-cloud',
        meta: 'Last sync 2s ago',
      },
    })

    const progress = wrapper.find('.tx-stat-card__progress')

    expect(wrapper.classes()).toContain('tx-stat-card--progress')
    expect(progress.exists()).toBe(true)
    expect(progress.attributes('style')).toContain('--tx-stat-card-progress: 100%')
    expect(progress.find('.tx-stat-card__progress-icon').classes()).toContain('i-carbon-cloud')
    expect(wrapper.find('.tx-stat-card__meta').text()).toBe('Last sync 2s ago')
    // The ring carries the icon here, so there is no bare glyph. The aura still
    // lies behind the ring: it comes first, so at the same z-index the ring
    // paints over it.
    expect(wrapper.find('.tx-stat-card__glyph').exists()).toBe(false)
    const layers = [...wrapper.element.children].map(child => child.classList[0])
    expect(layers.indexOf('tx-stat-card__aura')).toBeGreaterThanOrEqual(0)
    expect(layers.indexOf('tx-stat-card__aura')).toBeLessThan(layers.indexOf('tx-stat-card__progress'))
  })

  it('lets the progress ring read the percentage bound on its parent', () => {
    // The value is bound on `.tx-stat-card__progress` and read by the child ring.
    // Registered with `inherits: false`, the ring only saw the 0% initial value,
    // so the arc never drew. jsdom has no @property, so the contract is pinned in
    // the source.
    expect(txStatCardSource).toMatch(/@property --tx-stat-card-progress \{[^}]*inherits: true;/)
    expect(txStatCardSource).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.tx-stat-card__progress-ring \{\s*transition: none;/,
    )
  })

  it('treats numeric value under 100 as progress when progress prop is omitted', () => {
    const wrapper = mount(TxStatCard, {
      props: {
        value: 64,
        label: 'Capacity',
        variant: 'progress',
      },
    })

    expect(wrapper.find('.tx-stat-card__progress').attributes('style')).toContain('--tx-stat-card-progress: 64%')
  })

  it('renders custom meta slot in progress variant', () => {
    const wrapper = mount(TxStatCard, {
      props: {
        value: 50,
        label: 'Health',
        variant: 'progress',
      },
      slots: {
        meta: '<span class="custom-meta">Updated now</span>',
      },
    })

    expect(wrapper.find('.tx-stat-card__meta .custom-meta').text()).toBe('Updated now')
  })

  it('honors an explicit ariaLabel override for the group name', () => {
    const wrapper = mount(TxStatCard, {
      props: { value: 42, label: 'Revenue', ariaLabel: '营收卡片' },
    })

    // An explicit prop wins; pre-fix the name was always the hardcoded 'Stat card'.
    expect(wrapper.attributes('aria-label')).toBe('营收卡片')
    expect(wrapper.attributes('aria-labelledby')).toBeUndefined()
  })
})

// Compiled CSS, not source text, for the contracts below: vitest never compiles
// `<style>`, and a rule that reads right in source can still lose to nesting.
const REDUCED = '@media (prefers-reduced-motion: reduce)'

interface StyleRule {
  selectors: string[]
  declarations: Map<string, string>
  atRule: string | null
}

/** Splits on top-level commas, leaving `:is(…, …)` and `color-mix(…, …)` whole. */
function splitList(value: string): string[] {
  const out: string[] = []
  let depth = 0
  let current = ''
  for (const char of value) {
    if (char === '(')
      depth++
    else if (char === ')')
      depth--
    if (char === ',' && depth === 0) {
      out.push(current.trim())
      current = ''
    }
    else {
      current += char
    }
  }
  out.push(current.trim())
  return out
}

/** Flat rules with the at-rule they sit in. Sass's expanded output never nests a brace inside a declaration block. */
function parseRules(css: string): StyleRule[] {
  const rules: StyleRule[] = []
  const atRules: string[] = []
  let prelude = ''
  let i = 0
  while (i < css.length) {
    const char = css[i++]
    if (char === '{') {
      const head = prelude.trim()
      prelude = ''
      if (head.startsWith('@')) {
        atRules.push(head)
        continue
      }
      const end = css.indexOf('}', i)
      const declarations = new Map<string, string>()
      for (const part of css.slice(i, end).split(';')) {
        const colon = part.indexOf(':')
        if (colon > 0)
          declarations.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim())
      }
      rules.push({ selectors: splitList(head), declarations, atRule: atRules.at(-1) ?? null })
      i = end + 1
    }
    else if (char === '}') {
      atRules.pop()
      prelude = ''
    }
    else {
      prelude += char
    }
  }
  return rules
}

const styleRules = parseRules(
  [...txStatCardSource.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .map(match => sass.compileString(match[1] ?? '', { syntax: 'scss' }).css)
    .join('\n')
    // Loud comments survive the compile, and the parser would read them as selectors.
    .replace(/\/\*[\s\S]*?\*\//g, ''),
)
const topLevel = styleRules.filter(rule => rule.atRule === null)
const reduced = styleRules.filter(rule => rule.atRule === REDUCED)
const keyframes = styleRules.filter(rule => rule.atRule?.startsWith('@keyframes '))
const BLOBS = ['.tx-stat-card__aura-blob.is-a', '.tx-stat-card__aura-blob.is-b', '.tx-stat-card__aura-blob.is-c']

/** What the top-level rules naming exactly `selector` declare between them, later rules winning. */
function declared(selector: string): Map<string, string> {
  const merged = new Map<string, string>()
  for (const rule of topLevel.filter(rule => rule.selectors.includes(selector))) {
    for (const [property, value] of rule.declarations)
      merged.set(property, value)
  }
  return merged
}

describe('txStatCard style contract', () => {
  it('positive control: the compile produced the aura, its blobs, the glyph and the keyframes', () => {
    for (const selector of ['.tx-stat-card__aura', '.tx-stat-card__aura-blob', '.tx-stat-card__glyph', '.tx-stat-card__icon', ...BLOBS])
      expect(declared(selector).size, selector).toBeGreaterThan(0)
    expect(keyframes.length).toBeGreaterThan(0)
    expect(reduced.length).toBeGreaterThan(0)
  })

  it('shows the aura only on a tinted card that has faded in, and draws no blobs on any other', () => {
    expect(declared('.tx-stat-card__aura').get('opacity')).toBe('0')
    expect(declared('.tx-stat-card--tinted.tx-stat-card--glow-in .tx-stat-card__aura').get('opacity')).toBe('1')
    // The blobs go, not the layer: the layer has to stay in the box tree for
    // its fade to have an opacity to start from.
    expect(declared('.tx-stat-card:not(.tx-stat-card--tinted) .tx-stat-card__aura-blob').get('display')).toBe('none')
    for (const rule of styleRules.filter(rule => rule.selectors.some(selector => selector.endsWith('.tx-stat-card__aura'))))
      expect(rule.declarations.get('display'), rule.selectors.join(', ')).not.toBe('none')
  })

  it('drifts each blob on keyframes of its own that animate transform alone', () => {
    const names = [...new Set(keyframes.map(rule => (rule.atRule ?? '').slice('@keyframes '.length)))]
    expect(names).toHaveLength(3)
    for (const name of names)
      expect(name).toMatch(/^tx-stat-card-/)
    for (const rule of keyframes) {
      expect(rule.declarations.size, rule.atRule ?? '').toBeGreaterThan(0)
      // A blurred blob that moves is a compositor job. Animating its
      // border-radius, width or filter would redraw the blur every frame.
      for (const property of rule.declarations.keys())
        expect(property, `${rule.atRule} animates ${property}`).toBe('transform')
    }

    // The blobs are the only things that animate, each on its own keyframes.
    const animated = topLevel.filter(rule => (rule.declarations.get('animation') ?? 'none') !== 'none')
    expect(animated.flatMap(rule => rule.selectors).sort()).toEqual([...BLOBS].sort())
    const used = BLOBS.map(blob => (declared(blob).get('animation') ?? '').split(/\s+/)[0] ?? '')
    expect([...used].sort()).toEqual([...names].sort())
  })

  it('draws the glyph bare and casts no shadow from the glyph or the aura', () => {
    const parts = styleRules.filter(rule => rule.selectors.some(selector => /__(?:glyph|icon|aura)/.test(selector)))
    expect(parts.length).toBeGreaterThan(0)
    for (const rule of parts) {
      const where = rule.selectors.join(', ')
      expect(rule.declarations.has('box-shadow'), where).toBe(false)
      expect(rule.declarations.has('text-shadow'), where).toBe(false)
      expect(rule.declarations.get('filter') ?? '', where).not.toContain('drop-shadow')
    }
    // No tile, border or ring behind the glyph either.
    for (const selector of ['.tx-stat-card__glyph', '.tx-stat-card__icon']) {
      const surface = [...declared(selector).keys()].filter(property => /^(?:background|border|outline)/.test(property))
      expect(surface, selector).toEqual([])
    }
  })

  it('moves nothing on hover and never eases a colour', () => {
    // The hover is the edge firming up at once; nothing lifts, sweeps or glows.
    const hovers = styleRules.filter(rule => rule.selectors.some(selector => selector.includes(':hover')))
    expect(hovers.length).toBeGreaterThan(0)
    for (const rule of hovers) {
      const motion = [...rule.declarations.keys()].filter(property => /^(?:transform|translate|rotate|scale|transition|animation|opacity|filter)/.test(property))
      expect(motion, rule.selectors.join(', ')).toEqual([])
    }
    for (const rule of styleRules) {
      const eased = splitList(rule.declarations.get('transition') ?? 'none').map(item => item.split(/\s+/)[0] ?? '')
      expect(eased.filter(name => /^(?:all|color|background|border|box-shadow)/.test(name)), rule.selectors.join(', ')).toEqual([])
    }
  })

  it('stops every animation and transition under reduced motion and hides nothing there', () => {
    // The blob stops repeat the animated selectors: a bare `.tx-stat-card__aura-blob`
    // would lose to `.tx-stat-card__aura-blob.is-a` and leave the blob drifting.
    const stopped = (selector: string, property: string) =>
      reduced.some(rule => rule.selectors.includes(selector) && rule.declarations.get(property) === 'none')
    let moving = 0
    for (const rule of topLevel) {
      for (const property of ['animation', 'transition']) {
        const value = rule.declarations.get(property)
        if (!value || value === 'none')
          continue
        for (const selector of rule.selectors) {
          moving++
          expect(stopped(selector, property), `${selector} keeps its ${property}`).toBe(true)
        }
      }
    }
    expect(moving).toBeGreaterThan(0)

    // The still frame is the blobs' resting composition, fully drawn: motion is
    // stopped, never hidden.
    for (const rule of reduced) {
      const where = rule.selectors.join(', ')
      expect(rule.declarations.get('display'), where).not.toBe('none')
      expect(rule.declarations.get('visibility'), where).not.toBe('hidden')
      expect(rule.declarations.get('opacity'), where).not.toBe('0')
    }
  })
})
