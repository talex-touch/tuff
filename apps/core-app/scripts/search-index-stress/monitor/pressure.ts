import type { Pressure, Thresholds } from '../eval-types'
import type { Episodes } from './episodes'
import { CPU_ELEVATED_SHARE, PRESSURE_HOLD_MS } from './thresholds'

/**
 * `critical` while a fail-level breach is open or ended less than the hold ago, `elevated` for a
 * warn-level one (same hold) or app-wide CPU above 70% of its fail limit, otherwise `ok`. Reads
 * counters the episode book already maintains, so it is O(1) and allocation-free except the reason.
 */
export class PressureGauge {
  private cpuPct = 0

  constructor(
    private readonly episodes: Episodes,
    private readonly thresholds: Thresholds,
    private readonly now: () => number
  ) {}

  setCpu(pct: number): void {
    this.cpuPct = pct
  }

  read(): { level: Pressure; reason?: string } {
    const now = this.now()
    const book = this.episodes
    if (book.openFail > 0 || now - book.lastFailAt < PRESSURE_HOLD_MS) {
      return { level: 'critical', reason: book.lastFailReason }
    }
    if (book.openWarn > 0 || now - book.lastWarnAt < PRESSURE_HOLD_MS) {
      return { level: 'elevated', reason: book.lastWarnReason }
    }
    const cpuLimit = this.thresholds.cpuPct.fail * CPU_ELEVATED_SHARE
    if (this.cpuPct > cpuLimit) {
      return {
        level: 'elevated',
        reason: `cpu ${Math.round(this.cpuPct)}% > ${Math.round(cpuLimit)}% (70% of the ${this.thresholds.cpuPct.fail}% fail limit)`
      }
    }
    return { level: 'ok' }
  }
}
