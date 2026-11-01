import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { RunMeta, Thresholds } from '../eval-types'
import type { ProfileName } from './profiles'

export interface SegmentRecord {
  index: number
  profileDir: string
  startedAt: number
  endedAt: number | null
  /** True when the app exited by itself and left no `*.running` marker; null while it runs. */
  cleanShutdown: boolean | null
  shutdownDetail?: string
  appPid: number | null
  /** Processes of this segment still alive after the shutdown ladder; never killed. */
  leftPids: number[]
  abortReason: string | null
}

export interface StoredOptions {
  embedding: 'on' | 'off'
  ui: 'hidden' | 'show'
  qps: number
  nice: number
  concurrency: number
  burstConcurrency: number
  searchTimeoutMs: number
  seedTimeoutSec: number
  thresholds?: Partial<Thresholds>
}

/** `meta.json`: what `--resume` and `report` need to know about the run besides the plan and the results. */
export interface StoredMeta {
  version: 1
  runId: string
  profile: ProfileName
  seed: number
  count: number
  argv: string[]
  startedAt: number
  endedAt: number | null
  status: 'running' | 'finished' | 'aborted' | 'failed'
  abortReason: string | null
  options: StoredOptions
  corpus: { root: string; owned: boolean }
  host: RunMeta['host']
  appVersion?: string
  gitSha?: string
  /** Installed apps found on this machine and how many went into the plan; null when `--apps-file` supplied them. */
  apps: { found: number | null; used: number }
  switches: Record<string, string | number | boolean>
  segments: SegmentRecord[]
}

export async function readMeta(file: string): Promise<StoredMeta | null> {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as Partial<StoredMeta>
    return parsed.version === 1 &&
      typeof parsed.runId === 'string' &&
      Array.isArray(parsed.segments)
      ? (parsed as StoredMeta)
      : null
  } catch {
    return null
  }
}

export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`)
  await rename(temporary, file)
}

export function writeMeta(file: string, meta: StoredMeta): Promise<void> {
  return writeJsonAtomic(file, meta)
}

export function lastSegment(meta: StoredMeta): SegmentRecord | undefined {
  return meta.segments[meta.segments.length - 1]
}

/** The `RunMeta` of the report: run-wide facts plus every switch that shaped the numbers. */
export function toRunMeta(meta: StoredMeta, scenarioCount: number, endedAt: number): RunMeta {
  const unclean = meta.segments.filter((segment) => segment.cleanShutdown === false).length
  return {
    runId: meta.runId,
    startedAt: meta.startedAt,
    endedAt,
    profile: meta.profile,
    seed: meta.seed,
    scenarioCount,
    host: meta.host,
    ...(meta.appVersion ? { appVersion: meta.appVersion } : {}),
    ...(meta.gitSha ? { gitSha: meta.gitSha } : {}),
    argv: meta.argv,
    switches: {
      embedding: meta.options.embedding,
      ui: meta.options.ui,
      qps: meta.options.qps,
      nice: meta.options.nice,
      concurrency: meta.options.concurrency,
      burstConcurrency: meta.options.burstConcurrency,
      searchTimeoutMs: meta.options.searchTimeoutMs,
      appsUsed: meta.apps.used,
      ...(meta.apps.found !== null ? { appsFound: meta.apps.found } : {}),
      segments: meta.segments.length,
      uncleanSegments: unclean,
      ...(meta.abortReason ? { abortReason: meta.abortReason } : {}),
      ...meta.switches
    }
  }
}
