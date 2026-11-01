import fs from 'node:fs'
import path from 'node:path'
import type { CheckResult } from '../types'

export interface ScenarioDoneRecord {
  kind: 'scenario-done'
  at: number
  scenarioId: string
  /** False when a filesystem step failed or a required scenario never ran. */
  stepsOk: boolean
  stepsMs: number | null
  totalMs: number
  error?: string
  /** Executed again on resume because a later scenario needed its files. */
  rerun?: boolean
}

export interface RunEventRecord {
  kind: 'run-event'
  at: number
  event: string
  detail?: string
}

export type CheckRecord = { kind: 'check'; at: number } & CheckResult

export interface ResultsStore {
  appendCheck(result: CheckResult): void
  appendScenarioDone(record: Omit<ScenarioDoneRecord, 'kind' | 'at'>): void
  appendEvent(event: string, detail?: string): void
  close(): void
}

export function openResultsStore(file: string, now: () => number = Date.now): ResultsStore {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const fd = fs.openSync(file, 'a+')
  const size = fs.fstatSync(fd).size
  if (size > 0) {
    const last = Buffer.alloc(1)
    fs.readSync(fd, last, 0, 1, size - 1)
    // A killed run can leave half a line behind; start the next record on a fresh one.
    if (last[0] !== 0x0a) fs.writeSync(fd, '\n')
  }
  let closed = false
  const write = (record: object): void => {
    if (closed) return
    fs.writeSync(fd, `${JSON.stringify(record)}\n`)
  }
  return {
    appendCheck: (result) => write({ kind: 'check', at: now(), ...result }),
    appendScenarioDone: (record) => write({ kind: 'scenario-done', at: now(), ...record }),
    appendEvent: (event, detail) =>
      write({ kind: 'run-event', at: now(), event, ...(detail ? { detail } : {}) }),
    close() {
      if (closed) return
      closed = true
      fs.closeSync(fd)
    }
  }
}

export interface LoadedResults {
  /** Last record wins per scenario and check index, in first-seen order. */
  checks: CheckResult[]
  /** Scenario ids with a `scenario-done` record, i.e. whose result set is complete. */
  completed: Set<string>
  done: Map<string, ScenarioDoneRecord>
  events: RunEventRecord[]
  /** Lines that were not valid records (a truncated tail after a crash). */
  corruptLines: number
}

export function loadResults(file: string): LoadedResults {
  const loaded: LoadedResults = {
    checks: [],
    completed: new Set(),
    done: new Map(),
    events: [],
    corruptLines: 0
  }
  if (!fs.existsSync(file)) return loaded
  const byKey = new Map<string, number>()
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let record: Record<string, unknown>
    try {
      record = JSON.parse(line) as Record<string, unknown>
    } catch {
      loaded.corruptLines += 1
      continue
    }
    if (
      record.kind === 'check' &&
      typeof record.scenarioId === 'string' &&
      typeof record.checkIndex === 'number'
    ) {
      const { kind: _kind, at: _at, ...result } = record
      const key = `${record.scenarioId}#${record.checkIndex}`
      const existing = byKey.get(key)
      if (existing === undefined) {
        byKey.set(key, loaded.checks.length)
        loaded.checks.push(result as unknown as CheckResult)
      } else {
        loaded.checks[existing] = result as unknown as CheckResult
      }
    } else if (record.kind === 'scenario-done' && typeof record.scenarioId === 'string') {
      loaded.completed.add(record.scenarioId)
      loaded.done.set(record.scenarioId, record as unknown as ScenarioDoneRecord)
    } else if (record.kind === 'run-event' && typeof record.event === 'string') {
      loaded.events.push(record as unknown as RunEventRecord)
    } else {
      loaded.corruptLines += 1
    }
  }
  return loaded
}
