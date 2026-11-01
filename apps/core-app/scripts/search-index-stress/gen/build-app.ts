import { weightOf } from './dimensions'
import { PRESENT_DEADLINE_MS } from './checks'
import type { Draft, GenContext } from './context'
import { QUERY_IDS, appSubject, planQuery, queryApplies } from './queries'

const APP_QUERY_ENV = { guaranteed: true, prefixHits: () => 0 }
/** Transforms no other class produced come first, so a small plan still covers every one of them. */
const GLOBAL_UNSEEN_BONUS = 1000

/** Display names without duplicates (case and normalisation folded), in the order given. */
export function distinctApps(apps: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const app of apps) {
    const name = app.normalize('NFC').trim()
    const key = name.toLowerCase()
    if (name.length > 0 && !seen.has(key)) {
      seen.add(key)
      out.push(name)
    }
  }
  return out
}

/** Every (app, query transform) pair the transforms can express; the search-app class can never exceed this. */
export function appPairCapacity(apps: readonly string[]): number {
  let total = 0
  for (const app of distinctApps(apps)) {
    const subject = appSubject(app)
    for (const id of QUERY_IDS)
      if (weightOf('search-app', 'query', id) > 0 && queryApplies(id, subject)) total += 1
  }
  return total
}

export function buildSearchApps(ctx: GenContext, requested: number): Draft[] {
  const apps = distinctApps(ctx.options.apps)
  const remaining = new Map<string, string[]>()
  for (const id of QUERY_IDS) {
    if (weightOf('search-app', 'query', id) <= 0) continue
    const names = apps.filter((app) => queryApplies(id, appSubject(app)))
    if (names.length > 0) remaining.set(id, names)
  }
  const total = [...remaining.keys()].reduce(
    (sum, id) => sum + weightOf('search-app', 'query', id),
    0
  )
  const perQuery = new Map<string, number>()
  const perApp = new Map<string, number>()
  const drafts: Draft[] = []
  while (drafts.length < requested) {
    let best: string | undefined
    let bestScore = -Infinity
    for (const [id, names] of remaining) {
      if (names.length === 0) continue
      const used = perQuery.get(id) ?? 0
      const share = weightOf('search-app', 'query', id) / total
      const unseen = ctx.picker.seenInPlan('query', id) ? 0 : GLOBAL_UNSEEN_BONUS
      const score =
        (drafts.length + 1) * share - used + ctx.rng.next() * 0.8 + (used === 0 ? 50 : 0) + unseen
      if (score > bestScore) {
        bestScore = score
        best = id
      }
    }
    if (best === undefined) break
    const names = remaining.get(best) as string[]
    const least = Math.min(...names.map((name) => perApp.get(name) ?? 0))
    const candidates = names.filter((name) => (perApp.get(name) ?? 0) === least)
    const app = ctx.rng.pick(candidates)
    names.splice(names.indexOf(app), 1)
    perQuery.set(best, (perQuery.get(best) ?? 0) + 1)
    perApp.set(app, (perApp.get(app) ?? 0) + 1)
    const dims = { app, query: best }
    ctx.picker.record('search-app', dims)
    const plan = planQuery(best, appSubject(app), APP_QUERY_ENV)
    if (!plan) throw new Error(`query ${best} does not apply to app ${app}`)
    drafts.push({
      cls: 'search-app',
      dims,
      steps: [],
      checks: () => [
        {
          query: plan.query,
          target: { kind: 'app', name: app },
          expect: 'present',
          topK: plan.topK,
          tier: plan.tier,
          deadlineMs: PRESENT_DEADLINE_MS.seeded
        }
      ]
    })
  }
  return drafts
}
