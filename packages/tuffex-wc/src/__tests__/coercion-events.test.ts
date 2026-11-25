import { afterEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import {
  coerceBoolean,
  coerceBooleanOrString,
  coerceJson,
  coerceNumber,
  coerceStringOrJson,
  coerceStringOrNumber,
  defineTxButton,
  registerTuffexShadowStyles,
} from '../index'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('attribute/property coercion helpers', () => {
  it('coerces boolean HTML attributes truthfully including explicit false', () => {
    expect(coerceBoolean(undefined)).toBeUndefined()
    expect(coerceBoolean(null)).toBeUndefined()
    expect(coerceBoolean('')).toBe(true)
    expect(coerceBoolean('true')).toBe(true)
    expect(coerceBoolean('disabled')).toBe(true)
    expect(coerceBoolean('false')).toBe(false)
    expect(coerceBoolean('0')).toBe(false)
    expect(coerceBoolean(true)).toBe(true)
    expect(coerceBoolean(false)).toBe(false)
  })

  it('coerces numbers, string-or-number, boolean-or-string, and JSON cleanly', () => {
    expect(coerceNumber('42')).toBe(42)
    expect(coerceNumber('3.14')).toBe(3.14)
    expect(coerceNumber('')).toBeUndefined()
    expect(coerceNumber('not-a-num')).toBeUndefined()

    expect(coerceStringOrNumber('64')).toBe(64)
    expect(coerceStringOrNumber('100%')).toBe('100%')
    expect(coerceStringOrNumber('medium')).toBe('medium')

    expect(coerceBooleanOrString('')).toBe(true)
    expect(coerceBooleanOrString('false')).toBe(false)
    expect(coerceBooleanOrString('both')).toBe('both')

    expect(coerceJson('[{"value":"a","label":"A"}]')).toEqual([{ value: 'a', label: 'A' }])
    expect(coerceJson('not valid json')).toBeUndefined()

    expect(coerceStringOrJson('["1","2"]')).toEqual(['1', '2'])
    expect(coerceStringOrJson('panel-1')).toBe('panel-1')
  })
})

describe('light DOM default & optional Shadow DOM mode', () => {
  it('renders in Light DOM by default (shadowRoot: false) and supports shadowRoot: true with style injection', async () => {
    defineTxButton()
    const lightEl = document.createElement('tx-button')
    lightEl.setAttribute('variant', 'primary')
    lightEl.textContent = 'Light DOM'
    document.body.appendChild(lightEl)
    await nextTick()

    expect(lightEl.shadowRoot).toBeNull()
    const innerBtn = lightEl.querySelector('button.tx-button')
    expect(innerBtn).not.toBeNull()
    expect(innerBtn?.classList.contains('variant-primary')).toBe(true)
    expect(lightEl.textContent).toContain('Light DOM')

    registerTuffexShadowStyles('.tx-shadow-marker { color: var(--tx-color-primary); }')
    defineTxButton({
      tagName: 'tx-shadow-button-test',
      shadowRoot: true,
      styles: ['.tx-extra-style { opacity: 1; }'],
    })

    const shadowEl = document.createElement('tx-shadow-button-test')
    shadowEl.setAttribute('variant', 'danger')
    shadowEl.textContent = 'Shadow DOM'
    document.body.appendChild(shadowEl)
    await nextTick()

    expect(shadowEl.shadowRoot).not.toBeNull()
    const shadowBtn = shadowEl.shadowRoot?.querySelector('button.tx-button')
    expect(shadowBtn).not.toBeNull()
    expect(shadowBtn?.classList.contains('variant-danger')).toBe(true)
    const injectedCss = Array.from(shadowEl.shadowRoot?.querySelectorAll('style') ?? [])
      .map(s => s.textContent ?? '')
      .join('\n')
    expect(injectedCss).toContain('.tx-shadow-marker')
    expect(injectedCss).toContain('.tx-extra-style')
  })
})
