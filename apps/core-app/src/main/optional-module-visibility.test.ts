/**
 * 35 of 38 foreground modules are mandatory, so any one of them failing to init quits the app -
 * a peripheral feature's blast radius equals total unavailability (#789).
 *
 * Widening the optional tier is the fix, but it needs this first: an optional module that fails
 * only produced a mainLog.warn, so moving modules into that tier would have traded "the app
 * refuses to start" for "the feature is quietly missing", which is not obviously better.
 *
 * Source assertions: index.ts is the app entry point and boots Electron on import.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const INDEX = readFileSync(path.join(__dirname, 'index.ts'), 'utf8')

describe('an optional module failing is visible, not just logged', () => {
  it('两个 optional 失败回调都走同一个上报函数', () => {
    // Positive control: both callbacks must still exist, or the assertions below prove nothing.
    const callbacks = INDEX.match(/onOptionalModuleLoadFailed/g) ?? []
    expect(callbacks).toHaveLength(2)

    const reports = INDEX.match(/reportOptionalModuleFailure\(/g) ?? []
    // One definition plus both call sites.
    expect(reports.length).toBeGreaterThanOrEqual(3)
  })

  it('上报进入 analytics message store,而不是只写日志', () => {
    expect(INDEX).toContain('getAnalyticsMessageStore().add(')
    expect(INDEX).toMatch(/reportOptionalModuleFailure[\s\S]{0,600}?getAnalyticsMessageStore/)
  })

  it('上报自身失败不会中断启动', () => {
    // The report is a nicety; startup is not. It must not be able to throw past itself.
    expect(INDEX).toMatch(
      /getAnalyticsMessageStore\(\)\.add\([\s\S]{0,400}?\}\)\s*\n\s*\} catch \(error\) \{/
    )
  })
})
