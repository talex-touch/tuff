import { describe, expect, it } from 'vitest'
import { matchesMetaPanelQuery, normalizeMetaPanelQuery } from './meta-panel-filter'

describe('meta panel filter', () => {
  it('reads the field trimmed and lower-cased', () => {
    expect(normalizeMetaPanelQuery('  Copy PATH ')).toBe('copy path')
    expect(normalizeMetaPanelQuery('   ')).toBe('')
  })

  it('matches every row on an empty query', () => {
    expect(matchesMetaPanelQuery('', 'Pin to Recommendations')).toBe(true)
  })

  it('matches the query anywhere in the label, whatever its case', () => {
    expect(matchesMetaPanelQuery('path', 'Copy Path')).toBe(true)
    expect(matchesMetaPanelQuery('系统', 'QuickOps 系统信息')).toBe(true)
    expect(matchesMetaPanelQuery('paste', 'Copy Path')).toBe(false)
  })

  it('matches the query anywhere in a detail, skipping the ones a row lacks', () => {
    expect(
      matchesMetaPanelQuery('read-only', 'System Info', [undefined, 'A Read-Only summary'])
    ).toBe(true)
    expect(matchesMetaPanelQuery('quickops', 'System Info', ['A summary', 'QuickOps'])).toBe(true)
    expect(matchesMetaPanelQuery('airdrop', 'System Info', [undefined, 'QuickOps'])).toBe(false)
  })

  it('matches the query’s letters in order in the label, and only there', () => {
    expect(matchesMetaPanelQuery('cp', 'Copy Path')).toBe(true)
    expect(matchesMetaPanelQuery('qsysi', 'QuickOps System Info')).toBe(true)
    // Out of order.
    expect(matchesMetaPanelQuery('pc', 'Copy Path')).toBe(false)
    // In order in the detail, but a detail matches on the whole query only.
    expect(matchesMetaPanelQuery('cp', 'Pin', ['Copy Path'])).toBe(false)
  })
})
