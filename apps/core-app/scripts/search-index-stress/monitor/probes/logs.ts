import { mkdir, open, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseAppLagLine, type AppLag } from '../app-lag'
import { classifyLogLine, stripAnsi, type MarkerClass } from '../db-markers'
import type { ProbeContext } from './context'

const MAX_FILES = 40
const READ_BUDGET_BYTES = 4 * 1024 * 1024
const FINAL_BUDGET_BYTES = 64 * 1024 * 1024
const MAX_LAG_ENTRIES = 1_000
const MAX_REPAIR_DETAILS = 50
const MAX_EXCERPT_FILES = 10
const CONTEXT_LINES = 3
const DEDUPE_MS = 10_000

export const STDOUT_LOG = 'app-stdout.log'

interface FileState {
  /** Only ever moves past complete lines, so no partial line is kept between polls. */
  offset: number
  recent: string[]
}

export interface MarkerCount {
  id: string
  cls: MarkerClass
  count: number
  firstAt: number
  sample: string
}

/** Tails the app's own logs for repair-class markers and for the lag its perf monitor reports. */
export class LogProbe {
  private readonly files = new Map<string, FileState>()
  private readonly counts = new Map<string, MarkerCount>()
  private readonly lag: AppLag[] = []
  private readonly repairDetails: string[] = []
  private excerpts = 0
  private polling = false

  constructor(private readonly ctx: ProbeContext) {}

  get appReportedLag(): AppLag[] {
    return [...this.lag].sort((a, b) => a.at - b.at)
  }

  get repairMarkers(): string[] {
    return [...this.repairDetails]
  }

  get markerCounts(): MarkerCount[] {
    return [...this.counts.values()]
  }

  /** `final` drains whatever is left, within a larger budget. */
  async poll(final = false): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      const { handles } = this.ctx
      const candidates: string[] = []
      try {
        for (const name of (await readdir(handles.logsDir)).sort()) {
          if (name.endsWith('.log')) candidates.push(join(handles.logsDir, name))
        }
      } catch {
        // no log directory yet
      }
      candidates.push(join(handles.evidenceDir, STDOUT_LOG))
      const live = new Set(candidates.slice(0, MAX_FILES))
      for (const file of this.files.keys()) if (!live.has(file)) this.files.delete(file)
      for (const file of live)
        await this.drain(file, final ? FINAL_BUDGET_BYTES : READ_BUDGET_BYTES)
    } finally {
      this.polling = false
    }
  }

  private async drain(file: string, budget: number): Promise<void> {
    let size: number
    try {
      size = (await stat(file)).size
    } catch {
      this.files.delete(file)
      return
    }
    let state = this.files.get(file)
    if (!state) this.files.set(file, (state = { offset: 0, recent: [] }))
    if (size < state.offset) state.offset = 0
    let remaining = budget
    while (state.offset < size && remaining > 0) {
      const length = Math.min(size - state.offset, remaining, READ_BUDGET_BYTES)
      const buffer = Buffer.allocUnsafe(length)
      const handle = await open(file, 'r')
      const { bytesRead } = await handle
        .read(buffer, 0, length, state.offset)
        .finally(() => handle.close())
      if (bytesRead === 0) return
      const lastNewline = buffer.lastIndexOf(0x0a, bytesRead - 1)
      const consumed =
        lastNewline >= 0 ? lastNewline + 1 : bytesRead === READ_BUDGET_BYTES ? bytesRead : 0
      if (consumed === 0) return
      state.offset += consumed
      remaining -= consumed
      await this.scan(file, state, buffer.toString('utf8', 0, consumed))
    }
  }

  private async scan(file: string, state: FileState, text: string): Promise<void> {
    const now = this.ctx.now()
    const lines = text.split('\n')
    for (let index = 0; index < lines.length; index++) {
      const raw = lines[index].endsWith('\r') ? lines[index].slice(0, -1) : lines[index]
      if (!raw) continue
      const line = stripAnsi(raw)
      if (line.includes('Event loop lag')) {
        const lag = parseAppLagLine(line, now)
        if (lag && this.lag.length < MAX_LAG_ENTRIES) this.lag.push(lag)
      }
      const hit = classifyLogLine(line)
      if (hit) {
        const after = lines.slice(index + 1, index + 1 + CONTEXT_LINES).map(stripAnsi)
        await this.onMarker(file, hit.marker.id, hit.marker.cls, hit.marker.meaning, line, [
          ...state.recent,
          line,
          ...after
        ])
      }
      state.recent.push(line)
      if (state.recent.length > CONTEXT_LINES) state.recent.shift()
    }
  }

  private async onMarker(
    file: string,
    id: string,
    cls: MarkerClass,
    meaning: string,
    line: string,
    context: string[]
  ): Promise<void> {
    const { ctx } = this
    const now = ctx.now()
    const known = this.counts.get(id)
    if (known) known.count++
    else this.counts.set(id, { id, cls, count: 1, firstAt: now, sample: line.slice(0, 300) })
    ctx.timeline('event', { k: 'db-marker', id, cls, line: line.slice(0, 300), file })
    if (cls === 'expected-on-fresh-profile') return

    const detail = `${id}: ${line.slice(0, 300)} (${meaning})`
    let evidence: string | undefined
    if (this.excerpts < MAX_EXCERPT_FILES) {
      this.excerpts++
      evidence = join(ctx.handles.evidenceDir, `db-marker-${this.excerpts}-${id}.txt`)
      try {
        await mkdir(ctx.handles.evidenceDir, { recursive: true })
        await writeFile(evidence, `${file}\n${context.join('\n')}\n`)
      } catch {
        evidence = undefined
      }
    }
    const breach = ctx.episodes.point(
      'db-repair-marker',
      cls === 'repair' ? 'fail' : 'warn',
      1,
      0,
      detail,
      {
        dedupeKey: `marker:${id}`,
        dedupeMs: DEDUPE_MS,
        evidence
      }
    )
    if (breach && cls === 'repair' && this.repairDetails.length < MAX_REPAIR_DETAILS) {
      this.repairDetails.push(detail)
    }
  }
}
