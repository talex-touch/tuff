import { execFile } from 'node:child_process'
import { access, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

/** Resolves true when `file` was written. */
export type SpawnSample = (pid: number, file: string) => Promise<boolean>

export const SAMPLE_MIN_GAP_MS = 20_000
export const SAMPLE_MAX_PER_RUN = 12

/** `/usr/bin/sample <pid> 2 5` samples the process for 2 s at 5 ms; macOS only, no privileges for own-user processes. */
export const spawnMacSample: SpawnSample = (pid, file) =>
  new Promise((resolve) => {
    if (process.platform !== 'darwin') return resolve(false)
    execFile(
      '/usr/bin/sample',
      [String(pid), '2', '5', '-file', file],
      { timeout: 30_000 },
      (error) => {
        if (error) return resolve(false)
        access(file).then(
          () => resolve(true),
          () => resolve(false)
        )
      }
    )
  })

export interface SamplerDeps {
  evidenceDir: string
  mainPid: number
  now: () => number
  spawn: SpawnSample
  log: (line: string) => void
}

/** At most one capture in flight, one per 20 s, twelve per run; the caller never waits for a capture. */
export class StallSampler {
  private inFlight: Promise<void> | null = null
  private lastAt = -Infinity
  private taken = 0

  constructor(private readonly deps: SamplerDeps) {}

  get count(): number {
    return this.taken
  }

  /** Starts a capture if the limits allow. `onDone` gets the file once it exists. */
  request(onDone: (file: string) => void): boolean {
    const now = this.deps.now()
    if (
      this.inFlight ||
      now - this.lastAt < SAMPLE_MIN_GAP_MS ||
      this.taken >= SAMPLE_MAX_PER_RUN
    ) {
      return false
    }
    this.lastAt = now
    this.taken++
    const stamp = new Date(now).toISOString().replace(/[:.]/g, '-')
    const file = join(this.deps.evidenceDir, `stall-${stamp}.sample.txt`)
    this.inFlight = mkdir(this.deps.evidenceDir, { recursive: true })
      .then(() => this.deps.spawn(this.deps.mainPid, file))
      .then((ok) => {
        if (ok) {
          this.deps.log(`stall sample written: ${file}`)
          onDone(file)
        } else this.deps.log(`stall sample unavailable for pid ${this.deps.mainPid}`)
      })
      .catch(() => this.deps.log(`stall sample failed for pid ${this.deps.mainPid}`))
      .finally(() => {
        this.inFlight = null
      })
    return true
  }

  settle(): Promise<void> {
    return this.inFlight ?? Promise.resolve()
  }
}
