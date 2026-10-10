import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mount } from '@vue/test-utils'
import { compileStyle, parse } from 'vue/compiler-sfc'
import { describe, expect, it } from 'vitest'
import TxFlowLight from '../src/TxFlowLight.vue'

const here = dirname(fileURLToPath(import.meta.url))

describe('txFlowLight', () => {
  it('is one decorative layer, the corners variant by default', () => {
    const wrapper = mount(TxFlowLight)
    const el = wrapper.element as HTMLElement

    expect(el.classList.contains('tx-flow-light')).toBe(true)
    expect(el.classList.contains('tx-flow-light--corners')).toBe(true)
    expect(el.getAttribute('aria-hidden')).toBe('true')
    expect(el.childElementCount).toBe(0)
    // Nothing the host did not set lands inline: theme opacity and colours are read where used.
    expect(el.getAttribute('style') ?? '').toBe('')
  })

  it.each(['corners', 'rim', 'aurora'] as const)('draws the %s variant', (variant) => {
    const wrapper = mount(TxFlowLight, { props: { variant } })
    expect(wrapper.classes()).toContain(`tx-flow-light--${variant}`)
  })

  it('multiplies the theme opacity by intensity, never below zero', async () => {
    const wrapper = mount(TxFlowLight, { props: { intensity: 0.5 } })
    const style = () => (wrapper.element as HTMLElement).style

    expect(style().getPropertyValue('--tx-flow-light-intensity')).toBe('0.5')
    await wrapper.setProps({ intensity: -2 })
    expect(style().getPropertyValue('--tx-flow-light-intensity')).toBe('0')
    await wrapper.setProps({ intensity: Number.NaN })
    expect(style().getPropertyValue('--tx-flow-light-intensity')).toBe('1')
    await wrapper.setProps({ intensity: 1 })
    expect(style().getPropertyValue('--tx-flow-light-intensity')).toBe('')
  })

  it('replaces the brand stops in order, keeping any it was not given', () => {
    const wrapper = mount(TxFlowLight, { props: { colors: [' #111111 ', '', '#333333', '#444444', '#555555'] } })
    const style = (wrapper.element as HTMLElement).style

    expect(style.getPropertyValue('--tx-flow-light-color-1')).toBe('#111111')
    expect(style.getPropertyValue('--tx-flow-light-color-2')).toBe('')
    expect(style.getPropertyValue('--tx-flow-light-color-3')).toBe('#333333')
    expect(style.getPropertyValue('--tx-flow-light-color-4')).toBe('#444444')
    expect(style.getPropertyValue('--tx-flow-light-color-5')).toBe('')
  })
})

/**
 * vitest never compiles an SFC's `<style>`, so the rules the light depends on are read from the
 * scoped CSS the compiler emits for it: a dark-theme opacity per variant, the brand defaults, and
 * the high-contrast opt-out.
 */
describe('txFlowLight stylesheet', () => {
  const source = readFileSync(resolve(here, '../src/TxFlowLight.vue'), 'utf8')
  const block = parse(source).descriptor.styles[0]!
  const { code, errors } = compileStyle({
    source: block.content,
    filename: 'TxFlowLight.vue',
    id: 'data-v-flow',
    scoped: true,
    preprocessLang: 'scss',
  })
  const css = code.replace(/\s+/g, ' ')

  function ruleFor(selector: string): string {
    const at = css.indexOf(selector)
    expect(at, `rule for ${selector}`).toBeGreaterThan(-1)
    return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at))
  }

  it('compiles', () => {
    expect(errors).toEqual([])
  })

  it('defaults to the Tuff brand stops', () => {
    const base = ruleFor('.tx-flow-light[data-v-flow] {')
    expect(base).toContain('var(--tx-flow-light-color-1, #0894ff)')
    expect(base).toContain('var(--tx-flow-light-color-2, #c959dd)')
    expect(base).toContain('var(--tx-flow-light-color-3, #ff2e54)')
    expect(base).toContain('var(--tx-flow-light-color-4, #ff9004)')
    expect(base).toContain('pointer-events: none')
  })

  it.each([
    ['corners', '0.2', '0.34'],
    ['rim', '0.55', '0.75'],
    ['aurora', '0.14', '0.26'],
  ])('gives %s a light and a brighter dark opacity', (variant, light, dark) => {
    expect(ruleFor(`.tx-flow-light--${variant}[data-v-flow] {`)).toContain(`--tx-flow-light-default-opacity: ${light}`)
    expect(ruleFor(`[data-theme=dark] .tx-flow-light--${variant}[data-v-flow], .dark .tx-flow-light--${variant}[data-v-flow] {`))
      .toContain(`--tx-flow-light-default-opacity: ${dark}`)
  })

  it('hides under high contrast', () => {
    expect(ruleFor(`html[data-tx-contrast=high] .tx-flow-light[data-v-flow], html.contrast .tx-flow-light[data-v-flow] {`))
      .toContain('display: none')
  })
})
