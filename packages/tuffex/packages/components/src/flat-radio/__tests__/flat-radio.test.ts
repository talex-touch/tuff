import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import TxFlatRadio from '../src/TxFlatRadio.vue'
import flatRadioSource from '../src/TxFlatRadio.vue?raw'
import TxFlatRadioItem from '../src/TxFlatRadioItem.vue'
import flatRadioItemSource from '../src/TxFlatRadioItem.vue?raw'

function mountSingleFlatRadio(options: { disabled?: boolean, initial?: string } = {}) {
  return mount({
    components: { TxFlatRadio, TxFlatRadioItem },
    data: () => ({ value: options.initial ?? 'a' }),
    template: `
      <TxFlatRadio v-model="value" :disabled="${options.disabled ? 'true' : 'false'}">
        <TxFlatRadioItem value="a" label="Option A" />
        <TxFlatRadioItem value="b" label="Option B" disabled />
        <TxFlatRadioItem value="c" label="Option C" />
      </TxFlatRadio>
    `,
  })
}

function mountMultipleFlatRadio() {
  return mount({
    components: { TxFlatRadio, TxFlatRadioItem },
    data: () => ({ value: ['a'] }),
    template: `
      <TxFlatRadio v-model="value" multiple>
        <TxFlatRadioItem value="a" label="Option A" />
        <TxFlatRadioItem value="b" label="Option B" disabled />
        <TxFlatRadioItem value="c" label="Option C" />
      </TxFlatRadio>
    `,
  })
}

describe('txFlatRadio', () => {
  it('renders radiogroup semantics for single selection', () => {
    const wrapper = mountSingleFlatRadio()
    const root = wrapper.find('.tx-flat-radio')
    const items = wrapper.findAll('.tx-flat-radio-item')

    expect(root.attributes('role')).toBe('radiogroup')
    expect(root.attributes('aria-disabled')).toBe('false')
    expect(root.attributes('tabindex')).toBe('0')
    expect(items[0].attributes('role')).toBe('radio')
    expect(items[0].attributes('aria-checked')).toBe('true')
    expect(items[1].attributes('disabled')).toBeDefined()
  })

  it('moves single selection with arrow keys and skips disabled items', async () => {
    const wrapper = mountSingleFlatRadio()
    const root = wrapper.findComponent(TxFlatRadio)

    await root.trigger('keydown', { key: 'ArrowRight' })
    expect((wrapper.vm as any).value).toBe('c')

    await root.trigger('keydown', { key: 'ArrowRight' })
    expect((wrapper.vm as any).value).toBe('a')

    await root.trigger('keydown', { key: 'ArrowLeft' })
    expect((wrapper.vm as any).value).toBe('c')
  })

  it('supports Home and End keyboard selection', async () => {
    const wrapper = mountSingleFlatRadio({ initial: 'c' })
    const root = wrapper.findComponent(TxFlatRadio)

    await root.trigger('keydown', { key: 'Home' })
    expect((wrapper.vm as any).value).toBe('a')

    await root.trigger('keydown', { key: 'End' })
    expect((wrapper.vm as any).value).toBe('c')
  })

  it('does not move selection when disabled', async () => {
    const wrapper = mountSingleFlatRadio({ disabled: true })
    const root = wrapper.findComponent(TxFlatRadio)

    await root.trigger('keydown', { key: 'ArrowRight' })

    expect((wrapper.vm as any).value).toBe('a')
    expect(wrapper.find('.tx-flat-radio').attributes('tabindex')).toBe('-1')
  })

  it('toggles the focused item with Enter and Space in multiple mode', async () => {
    const wrapper = mountMultipleFlatRadio()
    const root = wrapper.findComponent(TxFlatRadio)

    await root.trigger('keydown', { key: 'ArrowRight' })
    await root.trigger('keydown', { key: 'Enter' })
    expect((wrapper.vm as any).value).toEqual(['a', 'c'])

    await root.trigger('keydown', { key: ' ' })
    expect((wrapper.vm as any).value).toEqual(['a'])
  })

  it('exposes the multi-select focus cursor via is-focused and aria-activedescendant (#18)', async () => {
    const wrapper = mountMultipleFlatRadio()
    const root = wrapper.findComponent(TxFlatRadio)
    const container = wrapper.find('.tx-flat-radio')
    const items = wrapper.findAll('.tx-flat-radio-item')

    // No virtual-focus cursor before any keyboard navigation.
    expect(container.attributes('aria-activedescendant')).toBeUndefined()

    await root.trigger('keydown', { key: 'ArrowRight' })

    // The cursor lands on the first enabled item after 'a' (disabled 'b' skipped) → 'c'.
    const focused = items[2]
    expect(focused.classes()).toContain('is-focused')
    const id = focused.attributes('id')
    expect(id).toBeTruthy()
    // The container announces the same item through aria-activedescendant.
    expect(container.attributes('aria-activedescendant')).toBe(id)
    expect(items[0].classes()).not.toContain('is-focused')
  })
})

function indicatorRuleBody(): string {
  const rule = flatRadioSource.slice(flatRadioSource.indexOf('.tx-flat-radio__indicator {'))
  return rule.slice(0, rule.indexOf('}'))
}

// `transition` values nest commas inside `var(...)` and `cubic-bezier(...)`, so
// a plain split tears the curves apart.
function splitTopLevel(value: string): string[] {
  const out: string[] = []
  let depth = 0
  let current = ''

  for (const ch of value) {
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1

    if (ch === ',' && depth === 0) {
      out.push(current.trim())
      current = ''
    }
    else {
      current += ch
    }
  }

  if (current.trim()) out.push(current.trim())
  return out
}

describe('txFlatRadio indicator contrast', () => {
  it('lifts the sliding indicator off the track, not off the page', () => {
    // Two earlier anchors both failed: --tx-bg-color-overlay sank below the
    // track on dark, and mixing the text colour into it landed the thumb within
    // four RGB steps of the track in both themes. --tx-surface-raised is defined
    // against --tx-fill-color, which is the track.
    const body = indicatorRuleBody()

    expect(body).toContain('var(--tx-surface-raised')
    expect(body).not.toContain('var(--tx-bg-color-overlay')
    expect(body).not.toContain('color-mix(in srgb, var(--tx-text-color-primary')
  })

  it('exposes the track, thumb and shadow as override points', () => {
    // fine-tune-card's docs named these three as the variables that would let
    // its specificity-war override block go away.
    expect(flatRadioSource).toContain('--tx-flat-radio-track-bg')
    expect(flatRadioSource).toContain('--tx-flat-radio-indicator-bg')
    expect(flatRadioSource).toContain('--tx-flat-radio-indicator-shadow')
  })
})

describe('txFlatRadio motion', () => {
  it('travels and resizes on one duration and one curve', () => {
    // Previously `transform` ran a 0.25s overshoot while `width` ran a 0.2s
    // ease, so on labels of unequal width the thumb arrived and only then
    // finished growing. Pinning the numbers here would churn on every retune;
    // the contract is that the two segments agree.
    const body = indicatorRuleBody().replace(/\s+/g, ' ')
    const declaration = body.slice(body.indexOf('transition:'))
    const value = declaration.slice('transition:'.length, declaration.indexOf(';'))

    const segments = splitTopLevel(value)
    const transform = segments.find(segment => segment.startsWith('transform '))
    const width = segments.find(segment => segment.startsWith('width '))

    expect(transform).toBeTruthy()
    expect(width).toBeTruthy()
    expect(transform!.replace(/^transform /, '')).toBe(width!.replace(/^width /, ''))
  })

  it('keeps item width independent of selection', () => {
    // `.is-selected { font-weight: 500 }` reflowed the selected item, shoved its
    // siblings, and moved the indicator's width target mid-flight. jsdom runs no
    // layout, so the guard is that the weight lives on every item instead.
    const styleBlock = flatRadioItemSource.slice(flatRadioItemSource.indexOf('.tx-flat-radio-item {'))
    const baseDeclarations = styleBlock.slice(0, styleBlock.indexOf('&:hover'))

    const selectedRule = flatRadioItemSource.slice(flatRadioItemSource.indexOf('&.is-selected {'))
    const selectedBody = selectedRule.slice(0, selectedRule.indexOf('}'))

    expect(baseDeclarations).toMatch(/font-weight:\s*500/)
    expect(selectedBody).not.toMatch(/font-weight/)
  })

  it('measures the indicator from fractional rects', () => {
    // `offsetWidth` survives as the denominator that normalises an ancestor
    // transform; `offsetLeft` was the rounded read and is gone.
    expect(flatRadioSource).toContain('getBoundingClientRect()')
    expect(flatRadioSource).not.toMatch(/\.offsetLeft/)
  })

  it('gives the press a target that is not the measured box', () => {
    const pressRule = flatRadioItemSource.slice(flatRadioItemSource.indexOf('&:active:not(.is-disabled) {'))
    const pressBody = pressRule.slice(0, pressRule.indexOf('}'))

    expect(pressBody).toContain('.tx-flat-radio-item__label')
    expect(pressBody).toContain('.tx-flat-radio-item__icon')
  })

  it('drops travel and press motion under prefers-reduced-motion', () => {
    expect(flatRadioSource).toContain('@media (prefers-reduced-motion: reduce)')
    expect(flatRadioItemSource).toContain('@media (prefers-reduced-motion: reduce)')
  })
})

describe('txFlatRadio size ladder', () => {
  function mountSized(size: string) {
    return mount({
      components: { TxFlatRadio, TxFlatRadioItem },
      data: () => ({ value: 'a' }),
      template: `
        <TxFlatRadio v-model="value" size="${size}">
          <TxFlatRadioItem value="a" label="Option A" />
          <TxFlatRadioItem value="b" label="Option B" />
        </TxFlatRadio>
      `,
    })
  }

  it('renders the xl tier', () => {
    const style = mountSized('xl').find('.tx-flat-radio').attributes('style') ?? ''

    expect(style).toContain('--tx-flat-radio-height: 44px')
    expect(style).toContain('--tx-flat-radio-font-size: 15px')
    expect(style).toContain('--tx-flat-radio-item-padding: 0 16px')
  })

  it('leaves the existing tiers where they were', () => {
    const md = mountSized('md').find('.tx-flat-radio').attributes('style') ?? ''
    const sm = mountSized('sm').find('.tx-flat-radio').attributes('style') ?? ''
    const lg = mountSized('lg').find('.tx-flat-radio').attributes('style') ?? ''

    expect(md).toContain('--tx-flat-radio-height: 30px')
    expect(sm).toContain('--tx-flat-radio-height: 24px')
    expect(lg).toContain('--tx-flat-radio-height: 36px')
    // The two variables that were hard-coded before xl keep their old values,
    // which is what lets TxFineTuneCard's inline pin stay untouched.
    expect(md).toContain('--tx-flat-radio-item-padding: 0 8px')
    expect(md).toContain('--tx-flat-radio-item-gap: 4px')
  })
})
