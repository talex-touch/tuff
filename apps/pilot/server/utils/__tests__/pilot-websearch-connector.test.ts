import { describe, expect, it } from 'vitest'
import {
  dedupeNormalizedDocuments,
  isAllowlistedDomain,
} from '../pilot-websearch-connector'

describe('pilot-websearch-connector', () => {
  it('dedupes documents by urlHash + contentHash', () => {
    const docs = dedupeNormalizedDocuments([
      {
        url: 'https://docs.example.com/a',
        title: 'A',
        snippet: 's1',
        content: 'c1',
        domain: 'docs.example.com',
        urlHash: 'url-a',
        contentHash: 'content-1',
      },
      {
        url: 'https://docs.example.com/a?ref=dup',
        title: 'A2',
        snippet: 's2',
        content: 'c1',
        domain: 'docs.example.com',
        urlHash: 'url-a',
        contentHash: 'content-1',
      },
      {
        url: 'https://docs.example.com/b',
        title: 'B',
        snippet: 's3',
        content: 'c2',
        domain: 'docs.example.com',
        urlHash: 'url-b',
        contentHash: 'content-2',
      },
    ])

    expect(docs).toHaveLength(2)
    expect(docs.map(item => item.urlHash)).toEqual(['url-a', 'url-b'])
  })

  it('matches allowlist with subdomains', () => {
    expect(isAllowlistedDomain('docs.openai.com', ['openai.com'])).toBe(true)
    expect(isAllowlistedDomain('openai.com', ['openai.com'])).toBe(true)
    expect(isAllowlistedDomain('evil-openai.com', ['openai.com'])).toBe(false)
  })
})
