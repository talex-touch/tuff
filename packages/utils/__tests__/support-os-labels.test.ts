/**
 * SupportOS is the vocabulary a plugin manifest declares its platforms in, published through the
 * SDK. Three members named one OS version and carried another: WATCHOS_9 and WATCHOS_10 had their
 * values swapped, and WINDOWS_11 was 'Windows 10 Pro' (#872). A consumer gating on
 * SupportOS.WATCHOS_10 matched watchOS 9 devices and missed watchOS 10 - inverted, not merely
 * broken.
 *
 * The pin is the general rule rather than three literals, because the bug is a copy-paste slip and
 * the next one will land on a different member. Every underscore-separated segment of the key must
 * appear in the value: WINDOWS_11 must say 'Windows' and '11' somewhere, whatever the casing. That
 * needs no table of how each OS capitalises itself, and it caught exactly these three out of 46.
 */
import { describe, expect, it } from 'vitest'

import { SupportOS } from '../base/index'

const MEMBERS = Object.entries(SupportOS) as [string, string][]

describe('SupportOS values match the member they are named for', () => {
  it('规则本身有效:构造一个错值会被判为违规(缺这条,下面的空结果什么都不证明)', () => {
    expect(violations([['WATCHOS_10', 'watchOS 9']])).toEqual(['WATCHOS_10 = "watchOS 9"'])
    expect(violations([['WATCHOS_10', 'watchOS 10']])).toEqual([])
  })

  it('46 个成员全部自洽', () => {
    expect(MEMBERS).toHaveLength(46)
    expect(violations(MEMBERS)).toEqual([])
  })

  it('被交换的两个 watchOS 成员各自指向自己的版本', () => {
    expect(SupportOS.WATCHOS_9).toBe('watchOS 9')
    expect(SupportOS.WATCHOS_10).toBe('watchOS 10')
  })

  it('WINDOWS_11 不再是 Windows 10 的一个版本', () => {
    expect(SupportOS.WINDOWS_11).toBe('Windows 11')
    expect(SupportOS.WINDOWS_11).not.toBe(SupportOS.WINDOWS_10)
  })

  it('没有两个成员共享同一个值(否则平台门控会把两个 OS 当成一个)', () => {
    const values = MEMBERS.map(([, value]) => value)

    expect(new Set(values).size).toBe(values.length)
  })
})

/** Keys whose value is missing one of the segments the key names, formatted for the failure text. */
function violations(members: [string, string][]): string[] {
  return members
    .filter(([key, value]) =>
      key.split('_').some((segment) => !value.toLowerCase().includes(segment.toLowerCase()))
    )
    .map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
}
