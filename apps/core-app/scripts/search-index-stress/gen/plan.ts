import { createHash } from 'node:crypto'
import type { GenerateOptions, Scenario, ScenarioClass, ScenarioPlan } from '../types'
import { appPairCapacity, buildSearchApps } from './build-app'
import { buildChangeImage } from './build-change'
import { buildCreateImage, buildSearchCreated } from './build-create'
import { buildIgnoreImage } from './build-ignore'
import { buildSearchFile, buildSearchImage } from './build-seeded'
import { GenContext, type Draft } from './context'
import { hashSeed, createRng } from './prng'

export const PROFILE_COUNTS = { smoke: 200, full: 10_000 } as const

export const CLASSES: readonly ScenarioClass[] = [
  'search-app',
  'search-file',
  'search-image',
  'create-image',
  'change-image',
  'ignore-image',
  'search-created'
]

export const DEFAULT_MIX: Record<ScenarioClass, number> = {
  'search-app': 10,
  'search-file': 20,
  'search-image': 15,
  'create-image': 30,
  'change-image': 12,
  'ignore-image': 5,
  'search-created': 8
}

/** search-created needs a create-image 20+ scenarios earlier (see `requires`). */
export const MIN_CREATED_GAP = 20

type Builder = (ctx: GenContext) => Draft | null
const SEEDED_BUILDERS: Partial<Record<ScenarioClass, Builder>> = {
  'ignore-image': buildIgnoreImage,
  'change-image': buildChangeImage,
  'create-image': buildCreateImage,
  'search-image': buildSearchImage,
  'search-file': buildSearchFile
}
const BUILD_ORDER: ScenarioClass[] = [
  'ignore-image',
  'change-image',
  'create-image',
  'search-image',
  'search-file'
]

function weightsOf(options: GenerateOptions): Record<ScenarioClass, number> {
  const weights = { ...DEFAULT_MIX }
  for (const cls of CLASSES) {
    const given = options.mix?.[cls]
    if (given !== undefined) weights[cls] = Number.isFinite(given) && given > 0 ? given : 0
  }
  return weights
}

/** How many scenarios of each class the options ask for; largest remainder, sums to `count`. */
export function classQuota(options: GenerateOptions): Record<ScenarioClass, number> {
  const weights = weightsOf(options)
  const total = CLASSES.reduce((sum, cls) => sum + weights[cls], 0)
  const quota = Object.fromEntries(CLASSES.map((cls) => [cls, 0])) as Record<ScenarioClass, number>
  if (total <= 0 || options.count <= 0) return quota
  const exact = CLASSES.map((cls) => ({ cls, share: (options.count * weights[cls]) / total }))
  let left = options.count
  for (const { cls, share } of exact) {
    quota[cls] = Math.floor(share)
    left -= quota[cls]
  }
  exact.sort((a, b) => b.share - Math.floor(b.share) - (a.share - Math.floor(a.share)))
  for (let index = 0; left > 0; index = (index + 1) % exact.length) {
    quota[(exact[index] as (typeof exact)[number]).cls] += 1
    left -= 1
  }
  return quota
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

/** Identity of a situation inside its class: the class plus every dimension value. */
export function tupleKey(cls: string, dims: Record<string, unknown>): string {
  return `${cls}|${JSON.stringify(Object.entries(dims).sort())}`
}

export function scenarioId(cls: string, dims: unknown, steps: unknown, checks: unknown): string {
  const digest = createHash('sha256')
    .update(canonical({ class: cls, dims, steps, checks }))
    .digest('hex')
  return `${cls}-${digest.slice(0, 12)}`
}

function assertOptions(options: GenerateOptions): void {
  if (!Number.isInteger(options.seed))
    throw new RangeError(`seed must be an integer: ${options.seed}`)
  if (!Number.isInteger(options.count) || options.count < 0)
    throw new RangeError(`count must be a non-negative integer: ${options.count}`)
}

function produce(
  ctx: GenContext,
  cls: ScenarioClass,
  count: number,
  exhausted: Set<ScenarioClass>
): Draft[] {
  const build = SEEDED_BUILDERS[cls] as Builder
  const out: Draft[] = []
  while (out.length < count) {
    const draft = build(ctx)
    if (!draft) {
      exhausted.add(cls)
      break
    }
    out.push(draft)
  }
  return out
}

/** Picks the fill class that is furthest below its weighted share. */
function neediestClass(
  weights: Record<ScenarioClass, number>,
  made: Map<ScenarioClass, number>,
  exhausted: Set<ScenarioClass>
): ScenarioClass {
  const open = BUILD_ORDER.filter((cls) => !exhausted.has(cls))
  if (open.length === 0)
    throw new Error('cannot reach the requested count: every class ran out of distinct situations')
  const sum = open.reduce((acc, cls) => acc + weights[cls], 0)
  const openMade = open.reduce((acc, cls) => acc + (made.get(cls) ?? 0), 0)
  let best = open[0] as ScenarioClass
  let bestGap = -Infinity
  for (const cls of open) {
    const share = sum > 0 ? weights[cls] / sum : 1 / open.length
    const gap = share * (openMade + 1) - (made.get(cls) ?? 0)
    if (gap > bestGap) {
      bestGap = gap
      best = cls
    }
  }
  return best
}

/** search-app stops at what the installed apps can express; the shortfall reflows into the other seeded classes so the count stays exact. */
export function generatePlan(options: GenerateOptions): ScenarioPlan {
  assertOptions(options)
  const ctx = new GenContext(options)
  const orderRng = createRng(hashSeed(options.seed, 'order'))
  const quota = classQuota(options)
  const weights = weightsOf(options)
  const exhausted = new Set<ScenarioClass>()
  const made = new Map<ScenarioClass, number>()
  const base: Draft[] = []
  const note = (cls: ScenarioClass, drafts: Draft[]): void => {
    made.set(cls, (made.get(cls) ?? 0) + drafts.length)
    base.push(...drafts)
  }

  for (const cls of BUILD_ORDER) note(cls, produce(ctx, cls, quota[cls], exhausted))
  note(
    'search-app',
    buildSearchApps(ctx, Math.min(quota['search-app'], appPairCapacity(options.apps)))
  )

  const seq = orderRng.shuffle(base)
  const partners = seq
    .map((draft, index) => ({ draft, index }))
    .filter(
      ({ draft, index }) => draft.created !== undefined && index <= seq.length - MIN_CREATED_GAP
    )
  const linked: Draft[] = []
  while (linked.length < quota['search-created'] && partners.length > 0) {
    let bestAt = 0
    let bestScore = -Infinity
    partners.forEach(({ draft }, at) => {
      const { query: _query, ...fixed } = draft.dims
      const score = ctx.picker.need('search-created', fixed) + orderRng.next() * 0.8
      if (score > bestScore) {
        bestScore = score
        bestAt = at
      }
    })
    const [{ draft: partner }] = partners.splice(bestAt, 1) as [{ draft: Draft; index: number }]
    const draft = buildSearchCreated(ctx, partner)
    if (!draft) continue
    const partnerAt = seq.indexOf(partner)
    seq.splice(
      partnerAt + MIN_CREATED_GAP + orderRng.int(seq.length - partnerAt - MIN_CREATED_GAP + 1),
      0,
      draft
    )
    linked.push(draft)
  }
  made.set('search-created', linked.length)

  while (seq.length < options.count) {
    const cls = neediestClass(weights, made, exhausted)
    const draft = (SEEDED_BUILDERS[cls] as Builder)(ctx)
    if (!draft) {
      exhausted.add(cls)
      continue
    }
    made.set(cls, (made.get(cls) ?? 0) + 1)
    seq.splice(orderRng.int(seq.length + 1), 0, draft)
  }

  const ids = new Map<Draft, string>()
  const scenarios: Scenario[] = seq.map((draft, index) => {
    const checks = draft.checks()
    const id = scenarioId(draft.cls, draft.dims, draft.steps, checks)
    ids.set(draft, id)
    return { id, index, class: draft.cls, dims: draft.dims, steps: draft.steps, checks }
  })
  seq.forEach((draft, index) => {
    if (draft.partner) (scenarios[index] as Scenario).requires = [ids.get(draft.partner) as string]
  })
  return {
    seed: options.seed,
    count: options.count,
    options,
    corpus: ctx.corpus.build(),
    scenarios
  }
}
