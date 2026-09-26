import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mount } from '@vue/test-utils'
import * as sass from 'sass'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { PRISM_GLOW_CONES } from '../src/cones'
import TxPrismGlow from '../src/TxPrismGlow.vue'

/** Vue's Transition swaps its classes, and measures, on the second animation frame. */
function frames(): Promise<void> {
  return new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done())))
}

describe('txPrismGlow', () => {
  it('renders the slot beside an aria-hidden layer of cones carrying their own parameters', () => {
    const wrapper = mount(TxPrismGlow, {
      slots: { default: '<span class="content">Building…</span>' },
    })

    expect(wrapper.classes()).toContain('tx-prism-glow')

    const field = wrapper.find('.tx-prism-glow__field')
    expect(field.attributes('aria-hidden')).toBe('true')

    const cones = field.findAll('.tx-prism-glow__cone')
    expect(cones).toHaveLength(PRISM_GLOW_CONES.length)
    cones.forEach((cone, slot) => {
      const style = (cone.element as HTMLElement).style
      const expected = PRISM_GLOW_CONES[slot]!
      expect(style.getPropertyValue('--tx-pg-slot')).toBe(String(slot))
      expect(style.getPropertyValue('--tx-pg-hue')).toBe(String(expected.hue))
      expect(style.getPropertyValue('--tx-pg-period')).toBe(String(expected.period))
      expect(cone.findAll('.tx-prism-glow__beam')).toHaveLength(1)
      expect(cone.findAll('.tx-prism-glow__rays')).toHaveLength(1)
    })
    // The periods differ pairwise: equal ones would travel locked together and never merge.
    expect(new Set(PRISM_GLOW_CONES.map(cone => cone.period)).size).toBe(PRISM_GLOW_CONES.length)

    // The slot is the root's own child, outside the hidden layer.
    const content = wrapper.find('.content')
    expect(content.text()).toBe('Building…')
    expect(content.element.parentElement).toBe(wrapper.element)
    expect(field.element.contains(content.element)).toBe(false)
  })

  it('mounts the light layer only while active, fading it out before it unmounts', async () => {
    const wrapper = mount(TxPrismGlow, {
      props: { active: false },
      slots: { default: 'Idle' },
      global: { stubs: { transition: false } },
    })
    expect(wrapper.find('.tx-prism-glow__field').exists()).toBe(false)
    expect(wrapper.text()).toBe('Idle')

    await wrapper.setProps({ active: true })
    expect(wrapper.find('.tx-prism-glow__field').exists()).toBe(true)
    await frames()
    await nextTick()

    await wrapper.setProps({ active: false })
    // Still there, leaving: the v-if sits inside the Transition, so the fade-out runs.
    const leaving = wrapper.find('.tx-prism-glow__field')
    expect(leaving.exists()).toBe(true)
    expect(leaving.classes()).toContain('tx-prism-glow-leave-active')

    await frames()
    await nextTick()
    expect(wrapper.find('.tx-prism-glow__field').exists()).toBe(false)
    expect(wrapper.find('.tx-prism-glow__cone').exists()).toBe(false)
    expect(wrapper.text()).toBe('Idle')
  })

  it('reflects palette and placement as modifier classes', async () => {
    const wrapper = mount(TxPrismGlow)
    expect(wrapper.classes()).toEqual(['tx-prism-glow', 'tx-prism-glow--spectrum', 'tx-prism-glow--bottom'])

    await wrapper.setProps({ palette: 'accent', placement: 'top' })
    expect(wrapper.classes()).toEqual(['tx-prism-glow', 'tx-prism-glow--accent', 'tx-prism-glow--top'])
  })

  it('binds intensity and duration as custom properties, clamped and never left unset', async () => {
    const wrapper = mount(TxPrismGlow)
    const read = (name: string) => (wrapper.element as HTMLElement).style.getPropertyValue(name)
    const expectVars = (intensity: string, duration: string) => {
      expect(read('--tx-prism-glow-intensity')).toBe(intensity)
      expect(read('--tx-prism-glow-duration')).toBe(duration)
    }

    expectVars('1', '6s')

    await wrapper.setProps({ intensity: 0.4, duration: 2.5 })
    expectVars('0.4', '2.5s')

    await wrapper.setProps({ intensity: 3, duration: 0 })
    expectVars('1', '6s')

    await wrapper.setProps({ intensity: -1, duration: -4 })
    expectVars('0', '6s')

    await wrapper.setProps({ intensity: Number.NaN, duration: Number.POSITIVE_INFINITY })
    expectVars('1', '6s')
  })
})

/** Stands in for the browser's observer: `resize()` reports a height for every observed target. */
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  targets: Element[] = []

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this)
  }

  observe(target: Element): void {
    this.targets.push(target)
  }

  unobserve(): void {}

  disconnect(): void {
    this.targets = []
  }

  /** Reports `height` for `only`, or for every observed target when omitted. */
  resize(height: number, only?: Element): void {
    const targets = only ? this.targets.filter(target => target === only) : this.targets
    const entries = targets.map(target => ({ target, contentRect: { height } }) as unknown as ResizeObserverEntry)
    this.callback(entries, this as unknown as ResizeObserver)
  }
}

describe('txPrismGlow collapse on grow', () => {
  beforeEach(() => {
    FakeResizeObserver.instances = []
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const latestObserver = (): FakeResizeObserver => FakeResizeObserver.instances.at(-1)!
  const hasField = (wrapper: ReturnType<typeof mount>): boolean => wrapper.find('.tx-prism-glow__field').exists()

  it('retracts at once when the box grows, and stays off until active cycles', async () => {
    const wrapper = mount(TxPrismGlow, { global: { stubs: { transition: false } } })
    const observer = latestObserver()
    expect(observer.targets).toEqual([wrapper.element])

    // The first report is the observer's initial callback: it sets the baseline, nothing else.
    observer.resize(56)
    await nextTick()
    expect(hasField(wrapper)).toBe(true)

    observer.resize(56.5)
    await nextTick()
    expect(hasField(wrapper), 'sub-pixel noise is not growth').toBe(true)

    observer.resize(62)
    await nextTick()
    expect(hasField(wrapper), 'a font swap reflowing the box by a few pixels is not growth').toBe(true)

    observer.resize(420)
    await nextTick()
    expect(wrapper.classes()).toContain('is-collapsing')
    // Pinned to the height from just before the growth (the 62 report), so the cones
    // retract where they were instead of stretching with the box.
    const leaving = wrapper.find('.tx-prism-glow__field')
    expect(leaving.exists()).toBe(true)
    expect((leaving.element as HTMLElement).style.height).toBe('62px')
    expect((leaving.element as HTMLElement).style.top).toBe('0px')
    await frames()
    await nextTick()
    expect(hasField(wrapper)).toBe(false)
    expect(wrapper.classes()).not.toContain('is-collapsing')

    observer.resize(56)
    await nextTick()
    expect(hasField(wrapper), 'shrinking back does not relight it').toBe(false)

    await wrapper.setProps({ active: false })
    await wrapper.setProps({ active: true })
    expect(hasField(wrapper)).toBe(true)
    observer.resize(56)
    await nextTick()
    expect(hasField(wrapper), 'measured from where the box is when the light came back').toBe(true)
  })

  it('turns a fade-out into the retract when the box grows during it, pinned at the old height', async () => {
    const wrapper = mount(TxPrismGlow, { global: { stubs: { transition: false } } })
    const observer = latestObserver()
    observer.resize(56)
    await nextTick()

    // `items = data; loading = false` in one update: the fade starts first, the growth lands after.
    await wrapper.setProps({ active: false })
    const leaving = wrapper.find('.tx-prism-glow__field')
    expect(leaving.exists()).toBe(true)
    expect((leaving.element as HTMLElement).style.height, 'every leave is pinned').toBe('56px')
    expect(wrapper.classes()).not.toContain('is-collapsing')

    observer.resize(300)
    await nextTick()
    expect(wrapper.classes()).toContain('is-collapsing')
    await frames()
    await nextTick()
    expect(hasField(wrapper)).toBe(false)
    expect(wrapper.classes()).not.toContain('is-collapsing')
  })

  it('speeds up a fade already under way when the box grows during it', async () => {
    const wrapper = mount(TxPrismGlow, { global: { stubs: { transition: false } } })
    const observer = latestObserver()
    observer.resize(56)
    await nextTick()

    await wrapper.setProps({ active: false })
    // jsdom has no Web Animations; stand in for the field's running opacity transition,
    // 100ms into its 450ms.
    const fade = { playbackRate: 1, effect: { getComputedTiming: () => ({ duration: 450, localTime: 100 }) } }
    const leaving = wrapper.find('.tx-prism-glow__field').element as HTMLElement & { getAnimations: () => unknown[] }
    leaving.getAnimations = () => [fade]

    observer.resize(300)
    await nextTick()
    // The remaining 350ms now play in about the collapse's own 140ms.
    expect(fade.playbackRate).toBeCloseTo(350 / 140, 5)
  })

  it('pins the padding box: the observer reports the content box, and the layer spans the padding', async () => {
    const wrapper = mount(TxPrismGlow, { global: { stubs: { transition: false } } })
    ;(wrapper.element as HTMLElement).style.padding = '18px 20px'
    const observer = latestObserver()
    observer.resize(104)
    await nextTick()

    await wrapper.setProps({ active: false })
    const fading = wrapper.find('.tx-prism-glow__field').element as HTMLElement
    expect(fading.style.height, 'a plain fade: 104 + 18 + 18').toBe('140px')
    await frames()
    await nextTick()

    await wrapper.setProps({ active: true })
    observer.resize(300)
    await nextTick()
    expect(wrapper.classes()).toContain('is-collapsing')
    const collapsing = wrapper.find('.tx-prism-glow__field').element as HTMLElement
    expect(collapsing.style.height, 'a collapse: the padding box from before the growth').toBe('140px')
  })

  it('keeps tracking the root through a collapse, so a later fade pins the height it grew to', async () => {
    const wrapper = mount(TxPrismGlow, { global: { stubs: { transition: false } } })
    const observer = latestObserver()
    observer.resize(100)
    await nextTick()
    observer.resize(250)
    await nextTick()
    expect((wrapper.find('.tx-prism-glow__field').element as HTMLElement).style.height).toBe('100px')
    await frames()
    await nextTick()
    expect(hasField(wrapper)).toBe(false)

    // Relit at the grown size: nothing changes size, so the observer reports nothing new.
    await wrapper.setProps({ active: false })
    await wrapper.setProps({ active: true })
    await frames()
    await nextTick()
    await wrapper.setProps({ active: false })
    expect((wrapper.find('.tx-prism-glow__field').element as HTMLElement).style.height).toBe('250px')
  })

  it('measures growth from the lowest height since the light came on, and can be switched off', async () => {
    const wrapper = mount(TxPrismGlow)
    const observer = latestObserver()
    observer.resize(300)
    observer.resize(100)
    await nextTick()
    expect(hasField(wrapper), 'shrinking alone never collapses').toBe(true)
    observer.resize(150)
    await nextTick()
    expect(hasField(wrapper)).toBe(false)

    const pinned = mount(TxPrismGlow, { props: { collapseOnGrow: false } })
    const pinnedObserver = latestObserver()
    pinnedObserver.resize(56)
    pinnedObserver.resize(420)
    await nextTick()
    expect(hasField(pinned)).toBe(true)
  })

  it('judges growth on growTarget, and pins the layer at the root height when that grows', async () => {
    const host = document.createElement('div')
    const wrapper = mount(TxPrismGlow, { props: { growTarget: host }, global: { stubs: { transition: false } } })
    const observer = latestObserver()
    // The root is watched too: its height is what the layer is pinned to.
    expect(observer.targets).toEqual([host, wrapper.element])

    observer.resize(56)
    await nextTick()
    observer.resize(56, wrapper.element)
    observer.resize(500, wrapper.element)
    await nextTick()
    expect(hasField(wrapper), 'the root growing is not the watched box growing').toBe(true)

    observer.resize(420, host)
    await nextTick()
    expect(wrapper.classes()).toContain('is-collapsing')
    expect((wrapper.find('.tx-prism-glow__field').element as HTMLElement).style.height).toBe('500px')

    await wrapper.setProps({ growTarget: null })
    expect(latestObserver().targets).toEqual([wrapper.element])
  })
})

// Compiled CSS, not source text: vitest never compiles `<style>`, and a rule that reads
// right in source can still lose to a nesting or a specificity change.
const SFC = resolve(dirname(fileURLToPath(import.meta.url)), '../src/TxPrismGlow.vue')
const REDUCED = '@media (prefers-reduced-motion: reduce)'
const KEYFRAME_PROPERTIES = ['opacity', 'scale', 'translate']

interface Rule {
  selectors: string[]
  declarations: Map<string, string>
  atRule: string | null
}

function compileStyles(): string {
  const source = readFileSync(SFC, 'utf8')
  const blocks = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(match => match[1] ?? '')
  expect(blocks.length).toBeGreaterThan(0)
  return blocks
    .map(block => sass.compileString(block, { url: pathToFileURL(SFC), syntax: 'scss' }).css)
    .join('\n')
}

/** Splits on top-level commas, leaving `:is(…, …)` and `calc(…)` whole. */
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
function parseRules(css: string): Rule[] {
  const rules: Rule[] = []
  const atRules: string[] = []
  let prelude = ''
  let i = 0
  while (i < css.length) {
    const char = css[i++]!
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

/** `var(--name, fallback)` → `var(--name)`. The fallback only serves hosts that load no `variables.scss`. */
function stripFallbacks(css: string): string {
  let out = ''
  let from = 0
  for (let start = css.indexOf('var(', from); start >= 0; start = css.indexOf('var(', from)) {
    let depth = 0
    let comma = -1
    let end = start
    for (let j = start + 3; j < css.length; j++) {
      if (css[j] === '(') {
        depth++
      }
      else if (css[j] === ')') {
        depth--
        if (depth === 0) {
          end = j
          break
        }
      }
      else if (css[j] === ',' && depth === 1 && comma < 0) {
        comma = j
      }
    }
    out += css.slice(from, start) + (comma < 0 ? css.slice(start, end + 1) : `${css.slice(start, comma)})`)
    from = end + 1
  }
  return out + css.slice(from)
}

const css = compileStyles()
const rules = parseRules(css)
const keyframeRules = rules.filter(rule => rule.atRule?.startsWith('@keyframes '))
const outside = rules.filter(rule => rule.atRule === null)
const reduced = rules.filter(rule => rule.atRule === REDUCED)

function reducedDeclarations(selector: string): Map<string, string> {
  const merged = new Map<string, string>()
  for (const rule of reduced.filter(rule => rule.selectors.includes(selector))) {
    for (const [property, value] of rule.declarations)
      merged.set(property, value)
  }
  return merged
}

describe('txPrismGlow style contract', () => {
  it('positive control: the compile produced the layer, its keyframes and its guard', () => {
    expect(outside.some(rule => rule.selectors.includes('.tx-prism-glow__cone'))).toBe(true)
    expect(keyframeRules.length).toBeGreaterThan(0)
    expect(reduced.length).toBeGreaterThan(0)
  })

  it('animates only translate, scale and opacity, with no var() inside a keyframe', () => {
    // Every name an animation uses has to resolve to a keyframes block checked below:
    // a misspelt name animates nothing and the check would pass over it.
    const used = outside
      .flatMap(rule => splitList(rule.declarations.get('animation') ?? 'none'))
      .filter(item => item !== 'none')
      .map(item => item.split(/\s+/)[0]!)
    const defined = [...new Set(keyframeRules.map(rule => rule.atRule!.slice('@keyframes '.length)))]
    expect(used.length).toBeGreaterThan(0)
    expect([...new Set(used)].sort()).toEqual([...defined].sort())
    for (const name of defined)
      expect(name).toMatch(/^tx-prism-glow-/)

    for (const rule of keyframeRules) {
      for (const [property, value] of rule.declarations) {
        expect(KEYFRAME_PROPERTIES, `${rule.atRule} ${rule.selectors.join(', ')} sets ${property}`).toContain(property)
        expect(value, `${rule.atRule} ${property}`).not.toContain('var(')
      }
    }
  })

  it('stops every animation and transition under reduced motion', () => {
    for (const rule of outside) {
      const animation = rule.declarations.get('animation')
      if (animation && animation !== 'none') {
        for (const selector of rule.selectors)
          expect(reducedDeclarations(selector).get('animation'), selector).toBe('none')
      }
      if (rule.declarations.has('transition')) {
        for (const selector of rule.selectors)
          expect(reducedDeclarations(selector).get('transition'), selector).toBe('none')
      }
    }
    expect(reducedDeclarations('.tx-prism-glow__cone').get('animation')).toBe('none')
    expect(reducedDeclarations('.tx-prism-glow__beam').get('animation')).toBe('none')
  })

  it('holds a finished frame under reduced motion: every cone lit and spread along the edge', () => {
    const shared = reducedDeclarations('.tx-prism-glow__cone')
    expect(shared.get('opacity')).toBe('1')
    expect(shared.get('scale')).toBe('1')

    // Each cone's slot (0, 1, …, inline on the element) times one step.
    const translate = shared.get('translate')
    const match = translate?.match(/^calc\(var\(--tx-pg-slot\) \* ([\d.]+)cqw\) 0$/)
    expect(match, translate).not.toBeNull()
    const step = Number.parseFloat(match![1]!)
    const width = Number.parseFloat(outside.find(rule => rule.selectors.includes('.tx-prism-glow__cone'))!.declarations.get('width')!)
    expect(step).toBeGreaterThan(0)
    // Left edge to right edge: slot 0 starts at 0, the last cone ends at 100cqw.
    expect((PRISM_GLOW_CONES.length - 1) * step + width).toBeCloseTo(100, 6)
  })

  it('shows the layer at once and drops it at once when motion is reduced', () => {
    // Vue holds enter-from and leave-active for two frames before it measures.
    expect(reducedDeclarations('.tx-prism-glow-enter-from').get('opacity')).toBe('var(--tx-prism-glow-intensity, 1)')
    expect(reducedDeclarations('.tx-prism-glow-leave-active').get('opacity')).toBe('0')
  })

  it('takes every colour from a token or a value derived from one', () => {
    // Positive control: there is a fallback for the stripper to remove.
    expect(css).toContain('var(--tx-color-primary, #409eff)')
    const stripped = stripFallbacks(css)
    expect(stripped).toContain('var(--tx-color-primary)')

    expect(stripped.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([])
    expect(stripped.match(/\b(?:rgba?|hsla?|hwb)\(/gi) ?? []).toEqual([])
    expect(stripped.match(/\b(?:white|black|gr[ae]y)\b/gi) ?? []).toEqual([])
  })
})
