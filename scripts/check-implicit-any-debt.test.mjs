import { beforeAll, describe, expect, it } from 'vitest'

import {
  countImplicitAnyErrors,
  KNOWN_IMPLICIT_ANY_ERRORS,
} from './check-implicit-any-debt.mjs'

/**
 * The ratchet guarding #548. Runs against the real project, which is the point: a pin that only
 * ever sees fixtures cannot tell you the debt moved.
 *
 * tsc runs once for all three assertions. Three separate runs cost ~90s on CI and, being three
 * separate awaits inside one worker, gave the reporter that much longer to sit idle.
 */
describe('main-process implicit-any debt', () => {
  let measured

  beforeAll(async () => {
    measured = await countImplicitAnyErrors()
  }, 300_000)

  it('still measures something, so the pin is not being compared against an empty run', () => {
    // Positive control. A wrong project path, a tsc that failed to launch, or a changed
    // diagnostic format would all return 0, and every assertion below would pass for the wrong
    // reason -- silently declaring the debt repaired.
    expect(measured.count).toBeGreaterThan(0)
    expect(measured.lines[0]).toMatch(/error TS7\d+:/)
  })

  it('holds at the pinned count, in both directions', () => {
    // Above the pin is new untyped code. Below it is repair work that did not move the floor,
    // which leaves slack for the next regression to hide in.
    expect(measured.count).toBe(KNOWN_IMPLICIT_ANY_ERRORS)
  })

  it('counts only implicit-any diagnostics, not every error the project can produce', () => {
    // The pin means "untyped parameters", not "type errors". If an unrelated break were counted,
    // fixing it would push the number below the pin and read as repair.
    for (const line of measured.lines) {
      expect(line).toMatch(/error TS7\d+:/)
    }
  })
})
