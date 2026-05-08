import { describe, expect, it } from 'vitest'
import { normalizeStoreIcon } from './store-icon-normalizer'

describe('store-icon-normalizer', () => {
  it('normalizes relative image paths with provider base url', () => {
    expect(normalizeStoreIcon('/icons/json.svg', 'https://nexus.example.com')).toEqual({
      iconUrl: 'https://nexus.example.com/icons/json.svg'
    })
  })

  it('normalizes iconify class aliases without treating plain words as classes', () => {
    expect(normalizeStoreIcon('ri:code-line')).toEqual({ icon: 'i-ri-code-line' })
    expect(normalizeStoreIcon('carbon-tools')).toEqual({ icon: 'i-carbon-tools' })
    expect(normalizeStoreIcon('json')).toEqual({})
  })

  it('supports manifest style icon objects', () => {
    expect(
      normalizeStoreIcon({ type: 'url', value: '/icons/dev.svg' }, 'https://nexus.example.com')
    ).toEqual({
      iconUrl: 'https://nexus.example.com/icons/dev.svg'
    })

    expect(normalizeStoreIcon({ type: 'class', value: 'carbon:tools' })).toEqual({
      icon: 'i-carbon-tools'
    })
  })
})
