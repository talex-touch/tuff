import { getBooleanEnv, getEnv } from '@talex-touch/utils/env'

/**
 * The one place production code learns it is running under the packaged acceptance / startup
 * benchmark harness. Every hook below used to be a raw `process.env` read in its own file (precore,
 * index, polyfills, auth, image-translate, preload), each with its own copy of the flag parser.
 *
 * None of these are user settings: the harness (`scripts/coreapp-packaged-*.ts`) sets them for one
 * launch, and an ordinary launch sees all of them unset.
 */

/** `TUFF_STARTUP_BENCHMARK_ONCE`: the launch is a timed benchmark run that exits by itself. */
export const STARTUP_BENCHMARK_ONCE_ENV = 'TUFF_STARTUP_BENCHMARK_ONCE'
/** `TUFF_STARTUP_BENCHMARK_USER_DATA_DIR`: an isolated userData/sessionData root for that launch. */
export const STARTUP_BENCHMARK_USER_DATA_DIR_ENV = 'TUFF_STARTUP_BENCHMARK_USER_DATA_DIR'
/** `TUFF_STARTUP_BENCHMARK_DIAG_PATH`: where precore writes its userData diagnostic JSON. */
export const STARTUP_BENCHMARK_DIAG_PATH_ENV = 'TUFF_STARTUP_BENCHMARK_DIAG_PATH'
/** `TUFF_PACKAGED_ACCEPTANCE_ISOLATED`: skip the single-instance lock for an isolated profile. */
export const PACKAGED_ACCEPTANCE_ISOLATED_ENV = 'TUFF_PACKAGED_ACCEPTANCE_ISOLATED'

function readTrimmedEnv(name: string): string | undefined {
  const value = getEnv(name)?.trim()
  return value ? value : undefined
}

export function isStartupBenchmarkMode(): boolean {
  return getBooleanEnv(STARTUP_BENCHMARK_ONCE_ENV)
}

export function resolveStartupBenchmarkUserDataDir(): string | undefined {
  return readTrimmedEnv(STARTUP_BENCHMARK_USER_DATA_DIR_ENV)
}

export function resolveStartupBenchmarkDiagPath(): string | undefined {
  return readTrimmedEnv(STARTUP_BENCHMARK_DIAG_PATH_ENV)
}

/** Isolated acceptance needs its own profile; the flag alone must not drop the instance lock. */
export function isIsolatedAcceptanceMode(): boolean {
  return (
    getBooleanEnv(PACKAGED_ACCEPTANCE_ISOLATED_ENV) &&
    resolveStartupBenchmarkUserDataDir() !== undefined
  )
}

/**
 * A `TUFF_VISIBLE_EVIDENCE_*` hook is live only inside a benchmark launch (or a unit test), so a
 * stray variable in a developer's shell cannot switch a production code path.
 */
export function isVisibleEvidenceHookEnabled(flagEnv: string): boolean {
  return getBooleanEnv(flagEnv) && (isStartupBenchmarkMode() || getEnv('NODE_ENV') === 'test')
}
