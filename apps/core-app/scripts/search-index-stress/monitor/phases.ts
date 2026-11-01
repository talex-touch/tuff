import type { Breach, PhaseSummary } from '../eval-types'
import { distribution } from './stats'

export class PhaseAcc {
  endedAt: number
  readonly cpu: number[] = []
  readonly mainCpu: number[] = []
  readonly rendererCpu: number[] = []
  readonly rss: number[] = []
  readonly loopDelay: number[] = []
  readonly rendererBlock: number[] = []
  loopMax = 0
  readonly frames = { total: 0, over33: 0, over50: 0, over100: 0, worst: 0 }
  readonly framePages = new Set<string>()

  constructor(
    readonly name: string,
    readonly startedAt: number
  ) {
    this.endedAt = startedAt
  }

  addFrames(
    page: string,
    counts: { n: number; o33: number; o50: number; o100: number; worst: number }
  ): void {
    this.frames.total += counts.n
    this.frames.over33 += counts.o33
    this.frames.over50 += counts.o50
    this.frames.over100 += counts.o100
    this.frames.worst = Math.max(this.frames.worst, counts.worst)
    if (counts.n > 0) this.framePages.add(page)
  }

  get empty(): boolean {
    return (
      this.cpu.length === 0 &&
      this.loopDelay.length === 0 &&
      this.rendererBlock.length === 0 &&
      this.frames.total === 0
    )
  }
}

/** Phases are keyed by name: setting `steady` again resumes the earlier accumulator. */
export class PhaseBook {
  private readonly phases = new Map<string, PhaseAcc>()
  current: PhaseAcc

  constructor(initial: string, now: number) {
    this.current = new PhaseAcc(initial, now)
    this.phases.set(initial, this.current)
  }

  get name(): string {
    return this.current.name
  }

  set(name: string, now: number): void {
    this.current.endedAt = now
    if (name === this.current.name) return
    let next = this.phases.get(name)
    if (!next) {
      next = new PhaseAcc(name, now)
      this.phases.set(name, next)
    }
    this.current = next
  }

  /** Phases that saw no sample and lasted under `minSpanMs` are left out. */
  summaries(breaches: readonly Breach[], endedAt: number, minSpanMs: number): PhaseSummary[] {
    this.current.endedAt = endedAt
    const out: PhaseSummary[] = []
    for (const acc of this.phases.values()) {
      if (acc.empty && acc.endedAt - acc.startedAt < minSpanMs) continue
      out.push({
        phase: acc.name,
        startedAt: acc.startedAt,
        endedAt: acc.endedAt,
        cpuPct: distribution(acc.cpu),
        mainCpuPct: distribution(acc.mainCpu),
        rendererCpuPct: distribution(acc.rendererCpu),
        rssMb: distribution(acc.rss),
        loopDelayMs: distribution(acc.loopDelay),
        loopMaxBlockMs: acc.loopMax,
        rendererBlockMs: distribution(acc.rendererBlock),
        frames:
          acc.frames.total > 0
            ? {
                total: acc.frames.total,
                over33ms: acc.frames.over33,
                over50ms: acc.frames.over50,
                over100ms: acc.frames.over100,
                worstMs: acc.frames.worst,
                visibleWindows: acc.framePages.size
              }
            : null,
        breaches: breaches.filter((breach) => breach.phase === acc.name)
      })
    }
    return out
  }
}
