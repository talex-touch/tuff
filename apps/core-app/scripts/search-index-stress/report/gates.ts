import type { GateResult } from '../eval-types'
import type { GateContext } from './gate-types'
import {
  completeness,
  hardCorrectness,
  indexingSpeed,
  searchLatency,
  softQuality
} from './gates-results'
import {
  database,
  frames,
  monitorIntegrity,
  processStability,
  resources,
  responsiveness
} from './gates-monitor'

export { verdictOf } from './gate-types'
export type { GateContext } from './gate-types'

/** G1..G11 in order. */
export function evaluateGates(ctx: GateContext): GateResult[] {
  return [
    hardCorrectness(ctx),
    completeness(ctx),
    indexingSpeed(ctx),
    searchLatency(ctx),
    responsiveness(ctx),
    resources(ctx),
    frames(ctx),
    database(ctx),
    monitorIntegrity(ctx),
    processStability(ctx),
    softQuality(ctx)
  ]
}
