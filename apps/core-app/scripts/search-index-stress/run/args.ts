import type { Thresholds } from '../eval-types'
import { LEVEL_KEYS } from '../monitor/thresholds'
import type { ProfileName } from './profiles'

export class UsageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UsageError'
  }
}

export interface CommonOptions {
  embedding: 'off' | 'on'
  ui: 'hidden' | 'show'
  corpusRoot?: string
}

export const DEFAULT_NICE = 10

export interface RunOptions extends CommonOptions {
  profile: ProfileName
  seed: number
  count?: number
  concurrency?: number
  burstConcurrency?: number
  resume?: string
  keep: boolean
  thresholds?: Partial<Thresholds>
  runDir?: string
  qps: number
  /** `nice` level of the app and of this runner; 0 leaves both at normal priority. */
  nice: number
  seedTimeoutSec: number
  /** Searches wait this long for an answer before the poll counts as a driver error. */
  searchTimeoutMs: number
  /** JSON array of app names to build search-app scenarios from, instead of the apps installed here. */
  appsFile?: string
}

export type ParsedArgs =
  | { command: 'help' }
  | { command: 'doctor'; options: CommonOptions }
  | { command: 'gen'; options: { seed: number; count: number; out?: string; appsFile?: string } }
  | { command: 'run'; options: RunOptions }
  | {
      command: 'probe'
      options: CommonOptions & { keep: boolean; nice: number; appsFile?: string }
    }
  | { command: 'report'; options: { runDir: string } }

export const USAGE = `Usage: pnpm search:stress <command> [options]

  doctor                       Check that a run is allowed and possible; exit 2 when it is not.
  gen    [--seed N] [--count N] [--out FILE] [--apps-file FILE]
                               Generate a scenario plan and print its summary.
  run    --profile smoke|full|burst [options]
                               Execute a plan against one isolated app instance.
  probe  [--embedding off|on] [--ui hidden|show] [--corpus-root DIR] [--apps-file FILE] [--nice N] [--keep]
                               Launch, run eight canned searches, print raw findings, shut down.
  report <runDir>              Re-render report.md / report.json from a finished or aborted run.

run options
  --profile smoke|full|burst   smoke 200 scenarios, full 10000, burst create-image heavy (default smoke)
  --seed N                     generator seed (default 1)
  --count N                    scenario count (overrides the profile)
  --embedding off|on           local embedding off (default) or on (needs the installed embedding assets)
  --ui hidden|show             hidden (default) never touches the screen; show brings CoreBox up and steals focus
  --concurrency N              scenarios in flight in the steady phase (default 6)
  --burst-concurrency N        scenarios in flight in the burst phase (default 24)
  --qps N                      global cap on search queries per second (default 15)
  --nice N                     nice level of the app and the runner, 0 = normal priority (default 10); a niced app
                               on a busy machine can stall for reasons that are not its own, and the report records it
  --resume RUN               continue a run (run id under /private/tmp/tuff-stress, or a run directory)
  --keep                       keep corpus and profile after the run
  --corpus-root DIR            corpus location (default /Users/Shared/tuff-stress/<runId>/corpus)
  --run-dir DIR                output directory (default /private/tmp/tuff-stress/<runId>)
  --thresholds k=warn:fail,..  override monitor thresholds, e.g. mainLoopBlockMs=200:600,sampleOnBlockMs=250
  --seed-timeout SEC           give up when the seeded corpus is not indexed after this long (default 1200)
  --search-timeout MS          per-query answer timeout (default 8000)
  --apps-file FILE             JSON array of app names for search-app scenarios (default: the apps installed here)

exit codes: 0 pass, 1 fail, 2 refused or bad usage, 3 internal error`

interface FlagSpec {
  value: readonly string[]
  boolean: readonly string[]
}

interface Flags {
  values: Map<string, string>
  booleans: Set<string>
  positionals: string[]
}

function readFlags(argv: readonly string[], spec: FlagSpec): Flags {
  const flags: Flags = { values: new Map(), booleans: new Set(), positionals: [] }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--') {
      flags.positionals.push(...argv.slice(i + 1))
      break
    }
    if (!arg.startsWith('--')) {
      flags.positionals.push(arg)
      continue
    }
    const eq = arg.indexOf('=')
    const name = arg.slice(2, eq < 0 ? undefined : eq)
    const inline = eq < 0 ? undefined : arg.slice(eq + 1)
    if (spec.boolean.includes(name)) {
      if (inline !== undefined && !['true', 'false', '1', '0'].includes(inline)) {
        throw new UsageError(`--${name} takes no value (got "${inline}")`)
      }
      if (inline === undefined || inline === 'true' || inline === '1') flags.booleans.add(name)
      continue
    }
    if (!spec.value.includes(name)) throw new UsageError(`unknown option --${name}`)
    let value = inline
    if (value === undefined) {
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--'))
        throw new UsageError(`--${name} needs a value`)
      value = next
      i += 1
    }
    if (flags.values.has(name)) throw new UsageError(`--${name} given twice`)
    flags.values.set(name, value)
  }
  return flags
}

function intFlag(
  flags: Flags,
  name: string,
  min: number,
  max = Number.MAX_SAFE_INTEGER
): number | undefined {
  const raw = flags.values.get(name)
  if (raw === undefined) return undefined
  if (!/^-?\d+$/.test(raw)) throw new UsageError(`--${name} must be an integer, got "${raw}"`)
  const value = Number(raw)
  if (value < min || value > max)
    throw new UsageError(`--${name} must be between ${min} and ${max}, got ${value}`)
  return value
}

function numberFlag(flags: Flags, name: string, min: number): number | undefined {
  const raw = flags.values.get(name)
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!Number.isFinite(value) || value < min)
    throw new UsageError(`--${name} must be a number >= ${min}, got "${raw}"`)
  return value
}

function enumFlag<T extends string>(
  flags: Flags,
  name: string,
  allowed: readonly T[]
): T | undefined {
  const raw = flags.values.get(name)
  if (raw === undefined) return undefined
  if (!allowed.includes(raw as T))
    throw new UsageError(`--${name} must be one of ${allowed.join('|')}, got "${raw}"`)
  return raw as T
}

function absoluteDirFlag(flags: Flags, name: string): string | undefined {
  const raw = flags.values.get(name)
  if (raw === undefined) return undefined
  if (!raw.startsWith('/')) throw new UsageError(`--${name} must be an absolute path, got "${raw}"`)
  if (raw.includes('\0')) throw new UsageError(`--${name} contains a NUL byte`)
  return raw.length > 1 ? raw.replace(/\/+$/, '') : raw
}

function fileFlag(flags: Flags, name: string): string | undefined {
  const raw = flags.values.get(name)
  if (raw === undefined) return undefined
  if (raw.trim() === '') throw new UsageError(`--${name} needs a file path`)
  if (raw.includes('\0')) throw new UsageError(`--${name} contains a NUL byte`)
  return raw
}

function noPositionals(flags: Flags, command: string): void {
  if (flags.positionals.length > 0) {
    throw new UsageError(`${command} takes no positional arguments, got "${flags.positionals[0]}"`)
  }
}

// The same list the monitor resolves overrides against, so a new `{ warn, fail }` key can never be accepted by one side only.
const PAIR_KEYS: readonly string[] = LEVEL_KEYS
const SINGLE_KEYS = ['sampleOnBlockMs'] as const

/** `mainLoopBlockMs=200:600,cpuPct=150:250,sampleOnBlockMs=250` -> warn:fail pairs and single values. */
export function parseThresholds(text: string): Partial<Thresholds> {
  const out: Record<string, unknown> = {}
  for (const part of text
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const eq = part.indexOf('=')
    if (eq <= 0) throw new UsageError(`threshold "${part}" is not key=value`)
    const key = part.slice(0, eq)
    const raw = part.slice(eq + 1)
    if (key in out) throw new UsageError(`threshold ${key} given twice`)
    if ((SINGLE_KEYS as readonly string[]).includes(key)) {
      const value = Number(raw)
      if (!Number.isFinite(value) || value < 0)
        throw new UsageError(`threshold ${key} must be a non-negative number, got "${raw}"`)
      out[key] = value
    } else if (PAIR_KEYS.includes(key)) {
      const pieces = raw.split(':')
      const [warn, fail] = pieces.map(Number)
      if (
        pieces.length !== 2 ||
        !Number.isFinite(warn) ||
        !Number.isFinite(fail) ||
        warn < 0 ||
        fail < 0
      ) {
        throw new UsageError(
          `threshold ${key} must be warn:fail with two non-negative numbers, got "${raw}"`
        )
      }
      if (warn > fail)
        throw new UsageError(`threshold ${key}: warn (${warn}) must not exceed fail (${fail})`)
      out[key] = { warn, fail }
    } else {
      throw new UsageError(
        `unknown threshold "${key}" (known: ${[...PAIR_KEYS, ...SINGLE_KEYS].join(', ')})`
      )
    }
  }
  return out as Partial<Thresholds>
}

function commonOptions(flags: Flags): CommonOptions {
  const corpusRoot = absoluteDirFlag(flags, 'corpus-root')
  return {
    embedding: enumFlag(flags, 'embedding', ['off', 'on'] as const) ?? 'off',
    ui: enumFlag(flags, 'ui', ['hidden', 'show'] as const) ?? 'hidden',
    ...(corpusRoot ? { corpusRoot } : {})
  }
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...rest] = argv
  if (!command || command === 'help' || command === '--help' || command === '-h')
    return { command: 'help' }
  if (rest.includes('--help') || rest.includes('-h')) return { command: 'help' }

  switch (command) {
    case 'doctor': {
      const flags = readFlags(rest, { value: ['corpus-root', 'embedding', 'ui'], boolean: [] })
      noPositionals(flags, 'doctor')
      return { command, options: commonOptions(flags) }
    }
    case 'gen': {
      const flags = readFlags(rest, { value: ['seed', 'count', 'out', 'apps-file'], boolean: [] })
      noPositionals(flags, 'gen')
      const out = flags.values.get('out')
      const appsFile = fileFlag(flags, 'apps-file')
      return {
        command,
        options: {
          seed: intFlag(flags, 'seed', 0) ?? 1,
          count: intFlag(flags, 'count', 1, 1_000_000) ?? 10_000,
          ...(out ? { out } : {}),
          ...(appsFile ? { appsFile } : {})
        }
      }
    }
    case 'run': {
      const flags = readFlags(rest, {
        value: [
          'profile',
          'seed',
          'count',
          'embedding',
          'ui',
          'concurrency',
          'burst-concurrency',
          'qps',
          'resume',
          'corpus-root',
          'run-dir',
          'thresholds',
          'seed-timeout',
          'search-timeout',
          'apps-file',
          'nice'
        ],
        boolean: ['keep']
      })
      noPositionals(flags, 'run')
      const thresholds = flags.values.get('thresholds')
      const resume = flags.values.get('resume')
      const runDir = absoluteDirFlag(flags, 'run-dir')
      const appsFile = fileFlag(flags, 'apps-file')
      const count = intFlag(flags, 'count', 1, 1_000_000)
      const concurrency = intFlag(flags, 'concurrency', 1, 256)
      const burstConcurrency = intFlag(flags, 'burst-concurrency', 1, 256)
      return {
        command,
        options: {
          ...commonOptions(flags),
          profile: enumFlag(flags, 'profile', ['smoke', 'full', 'burst'] as const) ?? 'smoke',
          seed: intFlag(flags, 'seed', 0) ?? 1,
          keep: flags.booleans.has('keep'),
          qps: numberFlag(flags, 'qps', 0.1) ?? 15,
          nice: intFlag(flags, 'nice', 0, 19) ?? DEFAULT_NICE,
          seedTimeoutSec: intFlag(flags, 'seed-timeout', 30, 86_400) ?? 1200,
          searchTimeoutMs: intFlag(flags, 'search-timeout', 500, 120_000) ?? 8000,
          ...(count !== undefined ? { count } : {}),
          ...(concurrency !== undefined ? { concurrency } : {}),
          ...(burstConcurrency !== undefined ? { burstConcurrency } : {}),
          ...(resume ? { resume } : {}),
          ...(runDir ? { runDir } : {}),
          ...(appsFile ? { appsFile } : {}),
          ...(thresholds ? { thresholds: parseThresholds(thresholds) } : {})
        }
      }
    }
    case 'probe': {
      const flags = readFlags(rest, {
        value: ['corpus-root', 'embedding', 'ui', 'apps-file', 'nice'],
        boolean: ['keep']
      })
      noPositionals(flags, 'probe')
      const appsFile = fileFlag(flags, 'apps-file')
      return {
        command,
        options: {
          ...commonOptions(flags),
          keep: flags.booleans.has('keep'),
          nice: intFlag(flags, 'nice', 0, 19) ?? DEFAULT_NICE,
          ...(appsFile ? { appsFile } : {})
        }
      }
    }
    case 'report': {
      const flags = readFlags(rest, { value: [], boolean: [] })
      if (flags.positionals.length !== 1)
        throw new UsageError('report needs exactly one run directory')
      return { command, options: { runDir: flags.positionals[0] } }
    }
    default:
      throw new UsageError(`unknown command "${command}"`)
  }
}
