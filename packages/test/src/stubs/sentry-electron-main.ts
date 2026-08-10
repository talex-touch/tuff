/**
 * Resolution target for `@sentry/electron/main` inside this package.
 *
 * Same problem as src/stubs/electron.ts: packages/test does not depend on
 * @sentry/electron, so the specifier is unresolvable from a test file while the
 * main-process code under test resolves it to the real package. A
 * vi.mock('@sentry/electron/main', ...) in the test therefore never binds, the
 * real module loads, and it calls parseSemver(process.versions.electron) at
 * module scope -- undefined outside an Electron runtime. The suite dies during
 * collection, which surfaces as a failed file with *zero* failed tests: invisible
 * in a summary line that only counts tests.
 *
 * Unlike the electron stub, these are no-ops rather than throwers. Sentry calls
 * are fire-and-forget telemetry that production code makes freely and no test
 * asserts; throwing here would break working tests to no purpose. A test that
 * wants to assert telemetry should still install its own vi.mock, which now binds
 * correctly because both sides resolve to this file.
 */

function noop(): void {}

export const init = noop
export const captureException = noop
export const captureMessage = noop
export const addBreadcrumb = noop
export const setTag = noop
export const setContext = noop
export const setUser = noop
export const setExtra = noop

const scope = {
  setTag: noop,
  setContext: noop,
  setUser: noop,
  setExtra: noop,
  setLevel: noop,
}

export function withScope(callback: (s: typeof scope) => void): void {
  callback(scope)
}

export function getCurrentScope(): typeof scope {
  return scope
}

export async function flush(): Promise<boolean> {
  return true
}
