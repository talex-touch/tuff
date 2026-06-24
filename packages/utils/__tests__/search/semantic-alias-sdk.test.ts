import { describe, expect, it } from 'vitest'
import {
  APP_SEMANTIC_ALIAS_CATALOG_MARKER,
  APP_SEMANTIC_ALIAS_CATALOG_MARKER_ZH,
  SEMANTIC_ALIAS_SDK_MIN_VERSION,
  buildSemanticAliasSearchTokens,
  createSemanticAliasSDK,
  defineSemanticAliases,
  normalizeSemanticAliases,
} from '../../search'
import { buildSemanticAliasPayload } from '../../plugin/sdk'

describe('semantic alias sdk', () => {
  it('normalizes aliases and keeps first spelling while deduping case-insensitively', () => {
    expect(normalizeSemanticAliases([' ps ', 'PS', 'design', '', '  即时   通讯  '])).toEqual([
      'ps',
      'design',
      '即时 通讯',
    ])
  })

  it('builds aliases, keywords, and alias tokens without overriding existing terms', () => {
    const payload = buildSemanticAliasPayload({
      existingAliases: ['custom', 'PS'],
      existingKeywords: ['workflow'],
      aliases: ['ps', 'Photoshop'],
      categories: ['design', '设计'],
      entries: defineSemanticAliases([
        {
          id: 'figma',
          aliases: ['fig'],
          categories: ['design'],
          synonyms: ['界面设计'],
        },
      ]),
    })

    expect(payload.aliases).toEqual(['custom', 'PS', 'Photoshop', 'design', '设计', 'fig', '界面设计'])
    expect(payload.keywords).toEqual(['workflow', 'ps', 'Photoshop', 'design', '设计', 'fig', '界面设计'])
    expect(payload.searchTokens).toContainEqual({
      value: 'ps',
      source: 'alias',
      display: 'ps',
    })
  })

  it('exposes a small object-style SDK for plugin integrations', () => {
    const sdk = createSemanticAliasSDK()

    expect(sdk.marker).toBe(APP_SEMANTIC_ALIAS_CATALOG_MARKER)
    expect(sdk.markerZh).toBe(APP_SEMANTIC_ALIAS_CATALOG_MARKER_ZH)
    expect(sdk.minSdkApi).toBe(SEMANTIC_ALIAS_SDK_MIN_VERSION)
    expect(sdk.tokens(['im', '聊天'])).toEqual(buildSemanticAliasSearchTokens(['im', '聊天']))
  })
})
