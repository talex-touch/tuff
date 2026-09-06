import { describe, expect, it } from 'vitest'
import { providerIconFor } from './provider-icons'

describe('providerIconFor', () => {
  it.each([
    ['openai', 'i-simple-icons-openai'],
    ['anthropic', 'i-simple-icons-anthropic'],
    ['deepseek', 'i-carbon-search-advanced'],
    ['siliconflow', 'i-carbon-ibm-watson-machine-learning'],
    ['local', 'i-carbon-bare-metal-server'],
    ['custom', 'i-carbon-settings']
  ])('maps %s to its class icon', (type, value) => {
    expect(providerIconFor(type)).toEqual({ type: 'class', value })
  })

  it('falls back to the custom icon for a type outside the enum', () => {
    expect(providerIconFor('pi')).toEqual(providerIconFor('custom'))
    expect(providerIconFor('')).toEqual(providerIconFor('custom'))
  })

  it('does not resolve prototype members as icons', () => {
    expect(providerIconFor('constructor')).toEqual(providerIconFor('custom'))
    expect(providerIconFor('toString')).toEqual(providerIconFor('custom'))
  })
})
