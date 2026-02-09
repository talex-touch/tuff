import { describe, expect, it } from 'vitest'
import { loadPluginModule } from './plugin-loader'

const renamePlugin = loadPluginModule(new URL('../../../../plugins/touch-batch-rename/index.js', import.meta.url))
const { __test: renameTest } = renamePlugin

describe('batch rename rules', () => {
  it('parses rule tokens', () => {
    const rules = renameTest.parseRules(
      'prefix:IMG_ suffix:_done replace:foo->bar seq:1:3 date:YYYYMMDD',
    )
    expect(rules.prefix).toBe('IMG_')
    expect(rules.suffix).toBe('_done')
    expect(rules.replaces.length).toBe(1)
    expect(rules.seq?.start).toBe(1)
    expect(rules.seq?.pad).toBe(3)
    expect(rules.dateFormat).toBe('YYYYMMDD')
  })

  it('builds rename plan with sequence and date', () => {
    const rules = renameTest.parseRules(
      'prefix:IMG_ suffix:_done seq:1:3 date:YYYYMMDD',
    )
    const now = new Date(2025, 0, 2)
    const plan = renameTest.buildRenamePlan(['/tmp/foo.txt', '/tmp/bar.txt'], rules, now)

    expect(plan.items[0].nextName).toBe('IMG_foo_done_20250102_001.txt')
    expect(plan.items[1].nextName).toBe('IMG_bar_done_20250102_002.txt')
  })
})
