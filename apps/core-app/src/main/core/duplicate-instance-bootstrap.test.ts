/**
 * A second launch calls app.quit() before Electron is ready. That quit does not land
 * immediately -- precore's before-quit handler used to preventDefault unconditionally and run an
 * async shutdown with a timeout -- so whenReady still fired and the duplicate began loading
 * modules, including the database. Two processes opening the same libsql file is the failure
 * this guards (#790).
 *
 * Three sites have to agree for that to be closed, and each one is load-bearing on its own:
 * precore must keep the guard's return value, index.ts must check it before bootstrapping, and
 * before-quit must let a duplicate exit instead of holding it open.
 *
 * These are source assertions, in the style of the sibling quit-paths.test.ts. precore.ts runs
 * its guard, its handlers and its filesystem setup at module scope, so importing it to observe
 * the behaviour would boot most of the main process; the sites are pinned instead of the
 * runtime. The guard function's own return value is covered behaviourally in
 * single-instance-guard.test.ts.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const PRECORE = readFileSync(path.join(__dirname, 'precore.ts'), 'utf8')
const MAIN_INDEX = readFileSync(path.join(__dirname, '../index.ts'), 'utf8')

describe('a duplicate instance must not bootstrap', () => {
  it('precore 保留 setupSingleInstanceGuard 的返回值', () => {
    // Positive control: the call itself must still be there, or the rest proves nothing.
    expect(PRECORE).toContain('setupSingleInstanceGuard({')
    expect(PRECORE).toMatch(/const\s+hasSingleInstanceLock\s*=\s*setupSingleInstanceGuard\(/)
    expect(PRECORE).toMatch(/export function isDuplicateInstance\(\)/)
  })

  it('whenReady 在做任何事之前先检查它', () => {
    const body = /app\.whenReady\(\)\.then\(async \(\) => \{([\s\S]*?)\n\}\)/.exec(MAIN_INDEX)?.[1]
    expect(body, 'whenReady callback not found in index.ts').toBeTruthy()

    const guardAt = body!.indexOf('isDuplicateInstance()')
    expect(guardAt, 'whenReady does not check isDuplicateInstance').toBeGreaterThanOrEqual(0)

    // Anything that touches modules or the database must come after the guard.
    const bootstrapAt = body!.indexOf('enforceDevReleaseStartupConstraint')
    expect(bootstrapAt).toBeGreaterThan(guardAt)
  })

  it('before-quit 让重复实例直接退出,而不是 preventDefault 后走关停流程', () => {
    const handler = /app\.on\('before-quit', \(event\) => \{([\s\S]*?)\n\}\)/.exec(PRECORE)?.[1]
    expect(handler, 'before-quit handler not found in precore.ts').toBeTruthy()

    const exemptionAt = handler!.indexOf("intent.kind === 'duplicate-instance'")
    expect(exemptionAt, 'before-quit does not exempt a duplicate instance').toBeGreaterThanOrEqual(
      0
    )

    // The exemption is only worth anything if it precedes the preventDefault it is avoiding.
    const preventAt = handler!.indexOf('event.preventDefault()')
    expect(preventAt).toBeGreaterThan(exemptionAt)
  })
})
