import type { GateResult } from '../eval-types'
import { sumTallies } from './classes'
import { scenarioIds } from './failures'
import { fmtMs, fmtPct, plural, thousands } from './format'
import { gate, type GateContext } from './gate-types'
import { CLASS_ORDER } from './results'

const INLINE_IDS = 20

/** G1: every hard-tier check gave the right answer. */
export function hardCorrectness(ctx: GateContext): GateResult {
  const title = 'Hard-check correctness'
  const tally = sumTallies(ctx.classes.map((entry) => entry.hard))
  if (tally.total === 0) {
    return gate(
      'G1',
      title,
      'unknown',
      `0 hard-tier checks among ${thousands(ctx.prepared.obs.length)} results, so correctness is unproven`
    )
  }
  const undecided = tally.error + tally.skipped
  const head = `${thousands(tally.pass)} of ${thousands(tally.total)} hard checks passed`
  if (tally.fail > 0) {
    const { hardFailed } = ctx.failures
    const ids = scenarioIds(hardFailed.rows, INLINE_IDS)
    const more = hardFailed.scenarios - ids.length
    const named = `${ids.join(', ')}${more > 0 ? ` (+${more} more)` : ''}`
    const tail = undecided > 0 ? `; ${thousands(undecided)} more undecided` : ''
    return gate(
      'G1',
      title,
      'fail',
      `${head}; ${thousands(tally.fail)} failed in ${plural(hardFailed.scenarios, 'scenario')}: ${named}${tail}`
    )
  }
  if (undecided > 0) {
    return gate(
      'G1',
      title,
      'unknown',
      `${head}; ${thousands(undecided)} undecided (${thousands(tally.error)} errored, ${thousands(tally.skipped)} skipped), so correctness is unproven`
    )
  }
  return gate('G1', title, 'pass', head)
}

/** G2: everything planned ran, and few checks ended undecided. */
export function completeness(ctx: GateContext): GateResult {
  const title = 'Completeness'
  const { classes, inputs, limits } = ctx
  const sum = (pick: (entry: (typeof classes)[number]) => number): number =>
    classes.reduce((total, entry) => total + pick(entry), 0)
  const planned = sum((entry) => entry.planned ?? 0)
  const executed = sum((entry) => entry.executed)
  const notRun = inputs.notRun.length
  const unaccounted = sum((entry) => entry.unaccounted)
  const skippedOnly = sum((entry) => entry.skippedOnly)
  const tally = sumTallies(classes.flatMap((entry) => [entry.hard, entry.soft]))
  const undecided = tally.error + tally.skipped
  const share = tally.total > 0 ? undecided / tally.total : 0
  const expected = classes.filter((entry) => (entry.planned ?? 0) > 0)
  const idle = expected.filter((entry) => entry.executed === 0).map((entry) => entry.class)

  const head =
    `${thousands(executed)} of ${thousands(planned)} scenarios executed (${thousands(tally.total)} checks); ${thousands(notRun)} not run; ` +
    `${thousands(tally.error)} errored, ${thousands(tally.skipped)} skipped (${fmtPct(share)}); ` +
    `${expected.length - idle.length} of ${expected.length} classes executed`
  const notes: string[] = []
  if (unaccounted > 0) notes.push(`${thousands(unaccounted)} planned scenarios unaccounted for`)
  if (idle.length > 0) notes.push(`no check ran for ${idle.join(', ')}`)
  if (ctx.prepared.duplicates > 0)
    notes.push(`${plural(ctx.prepared.duplicates, 'repeated result')} ignored`)
  const absent = CLASS_ORDER.filter((cls) => !classes.some((entry) => entry.class === cls))
  if (absent.length > 0) notes.push(`not in this run: ${absent.join(', ')}`)
  const stated = inputs.meta.scenarioCount
  if (planned > 0 && stated !== planned)
    notes.push(`meta says ${thousands(stated)} scenarios, classes sum to ${thousands(planned)}`)
  const detail = notes.length > 0 ? `${head}; ${notes.join('; ')}` : head

  if (notRun > 0 || unaccounted > 0 || idle.length > 0 || share > limits.undecidedShareFail)
    return gate('G2', title, 'fail', detail)
  if (planned === 0) {
    const why =
      tally.total > 0
        ? "the plan's class counts were not supplied"
        : 'nothing was planned or executed'
    return gate('G2', title, 'unknown', `${detail}; ${why}`)
  }
  const clean =
    undecided === 0 &&
    skippedOnly === 0 &&
    ctx.prepared.duplicates === 0 &&
    absent.length === 0 &&
    stated === planned
  return gate('G2', title, clean ? 'pass' : 'warn', detail)
}

/** G3: a created image becomes searchable quickly. Limits are provisional until calibrated. */
export function indexingSpeed(ctx: GateContext): GateResult {
  const title = 'Indexing speed'
  const { indexing, limits } = ctx
  if (indexing.decided === 0) {
    const ran =
      indexing.softMissesExcluded + indexing.rankMissesExcluded + indexing.undecidedExcluded
    return gate(
      'G3',
      title,
      'unknown',
      `0 decided create-image checks (${thousands(ran)} others ran), so indexing speed is unproven`
    )
  }
  const { censored } = indexing
  const resolution =
    indexing.resolutionP95Ms === null ? '' : `, poll gap p95 ${fmtMs(indexing.resolutionP95Ms)}`
  const never =
    indexing.neverSearchable > 0 ? `; ${thousands(indexing.neverSearchable)} never searchable` : ''
  const detail =
    `create-image since last step, n=${thousands(indexing.decided)}: p50 ${fmtMs(censored.p50)} / p95 ${fmtMs(censored.p95)} / p99 ${fmtMs(censored.p99)}` +
    `${never}${resolution} (provisional limits: p95 <= ${fmtMs(limits.indexP95WarnMs)} warn, p99 <= ${fmtMs(limits.indexP99FailMs)} fail)`
  if (censored.p99 > limits.indexP99FailMs) return gate('G3', title, 'fail', detail)
  if (censored.p95 > limits.indexP95WarnMs) return gate('G3', title, 'warn', detail)
  return gate('G3', title, 'pass', detail)
}

/** G4: the app answers a search quickly while it is under steady load. */
export function searchLatency(ctx: GateContext): GateResult {
  const title = 'Search latency'
  const { answers, limits } = ctx
  const dist = answers.answerMs
  if (dist.count === 0)
    return gate('G4', title, 'unknown', '0 answered present checks, so search latency is unproven')
  const scope =
    answers.scope === 'steady'
      ? 'steady-state present checks'
      : 'present checks of all phases (none tagged steady)'
  const detail =
    `answer time over ${thousands(dist.count)} ${scope}: p50 ${fmtMs(dist.p50)} / p95 ${fmtMs(dist.p95)} / p99 ${fmtMs(dist.p99)} / max ${fmtMs(dist.max)} ` +
    `(provisional limits: p95 <= ${fmtMs(limits.answerP95WarnMs)} warn, p99 <= ${fmtMs(limits.answerP99FailMs)} fail)`
  if (dist.p99 > limits.answerP99FailMs) return gate('G4', title, 'fail', detail)
  if (dist.p95 > limits.answerP95WarnMs) return gate('G4', title, 'warn', detail)
  return gate('G4', title, 'pass', detail)
}

/** G11: soft-tier quality is shown per class and never decides the verdict. */
export function softQuality(ctx: GateContext): GateResult {
  const title = 'Soft-tier quality'
  const parts = ctx.classes
    .filter((entry) => entry.soft.total > 0)
    .map(
      (entry) =>
        `${entry.class} ${fmtPct(entry.soft.pass / entry.soft.total)} (${thousands(entry.soft.pass)}/${thousands(entry.soft.total)})`
    )
  if (parts.length === 0)
    return gate('G11', title, 'pass', '0 soft-tier checks ran; informational, never gates')
  return gate(
    'G11',
    title,
    'pass',
    `soft pass rate by class: ${parts.join(', ')}; informational, never gates`
  )
}
