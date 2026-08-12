import { anyStr2Num, num2anyStr } from '@talex-touch/utils/common'
import { describe, expect, it } from 'vitest'

describe('#Common', () => {
  it('serial str-num test', () => {
    const testWord = 'test'

    const num = anyStr2Num(testWord)

    expect(num).not.toBeNaN()
    expect(num).toBe(BigInt(10100015001415))

    const str = num2anyStr(num)

    expect(str).toBe(testWord)
  })
})

// The '#File tree' suite was removed: help/tree-generator was pruned in 63c4f5022
// (2026-07-14) and this was its only remaining caller, so the import failed and took
// the whole file down with it -- including the str-num test above, which was never
// reported as failing because the suite could not load at all. The test itself called
// genFileTree(p) and asserted nothing, so there is no coverage to reinstate.
