import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A route transition that records a start must clear it on *both* terminal hooks (#836).
 *
 * `routeTransitionStartedAt` was filled in `@before-enter` and drained only in `@after-enter`.
 * Vue fires `@enter-cancelled` instead when a transition is interrupted, and that hook was not
 * bound, so an interrupted navigation left its entry behind.
 *
 * The key is `route.fullPath`, and conversation routes are `/home/c/<uuid>` — an unbounded key
 * space. Clicking through the sidebar faster than the 0.35s transition added one entry per
 * conversation visited, and AppShell is the root layout: it never unmounts, so nothing ever
 * cleared them.
 *
 * Source-level rather than a mount test on purpose. AppShell pulls in the router, the wallpaper
 * state and the perf reporter, and the property worth pinning is the wiring — which hooks are
 * bound to what — not the transition timing itself. It lives in packages/utils because
 * `ci / CI - utils` blocks, whereas `App suites (core-app)` is continue-on-error and reports
 * success whatever the suite does.
 */

const SOURCE = readFileSync(
  path.resolve(__dirname, '../../../apps/core-app/src/renderer/src/views/layout/AppShell.vue'),
  'utf8',
)

describe('appShell route transition timing', () => {
  it('reads the component it means to check', () => {
    // Positive control: every assertion below is vacuous against an unreadable or wrong file.
    expect(SOURCE).toContain('routeTransitionStartedAt')
    expect(SOURCE).toContain('<transition')
  })

  it('records the start on before-enter', () => {
    expect(SOURCE).toMatch(/@before-enter="\(\) => onRouteEnterStart\(route\.fullPath\)"/)
    expect(SOURCE).toMatch(/function onRouteEnterStart[\s\S]{0,120}routeTransitionStartedAt\.set/)
  })

  it('clears it on after-enter, the completed path', () => {
    expect(SOURCE).toMatch(/@after-enter="\(\) => onRouteEnterEnd\(route\.fullPath\)"/)
    expect(SOURCE).toMatch(/function onRouteEnterEnd[\s\S]{0,300}routeTransitionStartedAt\.delete/)
  })

  it('clears it on enter-cancelled, the interrupted path', () => {
    expect(SOURCE).toMatch(/@enter-cancelled="\(\) => onRouteEnterCancelled\(route\.fullPath\)"/)
    expect(SOURCE).toMatch(/function onRouteEnterCancelled[\s\S]{0,200}routeTransitionStartedAt\.delete/)
  })

  it('binds a terminal hook for every transition that starts one', () => {
    // The rule the three above are instances of: a `before-enter` that records must be matched by
    // both terminal hooks, or an interrupted transition leaks. Counting keeps a second transition
    // from being added later with only the completed path wired.
    const count = (pattern: RegExp): number => SOURCE.match(pattern)?.length ?? 0

    expect(count(/@before-enter=/g)).toBe(1)
    expect(count(/@after-enter=/g)).toBe(count(/@before-enter=/g))
    expect(count(/@enter-cancelled=/g)).toBe(count(/@before-enter=/g))
  })
})
