import { describe, expect, it } from 'vitest'
import type { SearchIndexItem } from './search-index-service'
import { SearchIndexService } from './search-index-service'

function createServiceHarness(): Record<string, any> {
  return new SearchIndexService({} as any) as Record<string, any>
}

describe('SearchIndexService delta/hash', () => {
  it('keyword hash 在关键词顺序变化时保持稳定', () => {
    const service = createServiceHarness()
    const entriesA = [
      { value: 'alpha', priority: 1.2 },
      { value: 'beta', priority: 1.0 },
      { value: 'ng:ab', priority: 0.5 }
    ]
    const entriesB = [
      { value: 'ng:ab', priority: 0.5 },
      { value: 'beta', priority: 1.0 },
      { value: 'alpha', priority: 1.2 }
    ]

    const hashA = service.buildKeywordHash(entriesA)
    const hashB = service.buildKeywordHash(entriesB)

    expect(hashA).toBe(hashB)
  })

  it('prepareDocument 会限制单条记录的 n-gram 写入上限', async () => {
    const service = createServiceHarness()
    const keywords = Array.from({ length: 220 }, (_, index) => ({
      value: `keywordtoken${index}`,
      priority: 1.5
    }))

    const item: SearchIndexItem = {
      itemId: 'file:/tmp/ngram-cap.txt',
      providerId: 'file-provider',
      type: 'file',
      name: 'Ngram Cap Test',
      keywords
    }

    const doc = await service.prepareDocument(item)
    const ngrams = doc.keywordEntries.filter((entry: { value: string }) =>
      entry.value.startsWith('ng:')
    )

    expect(ngrams.length).toBeLessThanOrEqual(256)
    expect(doc.keywordHash).toMatch(/^[a-f0-9]{40}$/)
  })

  it('prepareDocument 对相同输入生成相同 keywordHash', async () => {
    const service = createServiceHarness()

    const item: SearchIndexItem = {
      itemId: 'app:demo/test',
      providerId: 'app-provider',
      type: 'application',
      name: 'Demo App',
      displayName: 'Demo App',
      aliases: [{ value: 'da', priority: 1.5 }],
      keywords: [{ value: 'demo', priority: 1.2 }],
      path: '/Applications/Demo App.app'
    }

    const first = await service.prepareDocument(item)
    const second = await service.prepareDocument(item)

    expect(first.keywordHash).toBe(second.keywordHash)
  })
})
