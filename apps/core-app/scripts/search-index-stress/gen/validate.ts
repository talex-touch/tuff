import type {
  CorpusManifest,
  PayloadSpec,
  Scenario,
  ScenarioClass,
  ScenarioPlan,
  SearchCheck
} from '../types'
import { distinctApps, appPairCapacity } from './build-app'
import {
  ADMITTED_EXTENSIONS,
  CLASS_DIMENSIONS,
  FORBIDDEN,
  MAX_CORPUS_FILES,
  MAX_SCENARIO_WRITE_BYTES,
  maxCorpusBytes,
  valueIds,
  weightOf,
  type DimensionName
} from './dimensions'
import { CLASSES, MIN_CREATED_GAP, scenarioId, tupleKey } from './plan'
import {
  directoryNameProblem,
  excludedUnconditionally,
  fileNameProblem,
  pathProblem
} from './policy'
import { HARD_QUERY_IDS, MAX_HARD_PREFIX_HITS, isHardStyle } from './queries'
import { PrefixIndex, foldPath } from './registry'
import {
  corpusView,
  payloadProblem,
  replaySteps,
  type CorpusView,
  type Ledger,
  type Sink,
  type StepOutcome
} from './validate-steps'

const MAX_REPORTED = 500
const NFC = (value: string): string => value.normalize('NFC')

/** Keeps the first problems and counts the rest, so a systematic bug does not return thousands of lines. */
class Problems implements Sink {
  readonly list: string[] = []
  private total = 0

  push(message: string): number {
    this.total += 1
    if (this.list.length < MAX_REPORTED) this.list.push(message)
    return this.total
  }

  result(): string[] {
    return this.total > this.list.length
      ? [...this.list, `... and ${this.total - this.list.length} more problems`]
      : this.list
  }
}

const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1)
const dirsOf = (path: string): string[] => path.split('/').slice(0, -1)
const isPresentable = (path: string): boolean =>
  fileNameProblem(basename(path), ADMITTED_EXTENSIONS) === null &&
  dirsOf(path).every((dir) => directoryNameProblem(dir) === null)

function checkCorpus(corpus: CorpusManifest, limit: number, problems: Problems): Ledger {
  const existing = new Set<string>()
  const seen = new Set<string>()
  const note = (path: string): boolean => {
    const bad = pathProblem(path)
    if (bad) problems.push(`corpus: ${bad}`)
    if (existing.has(foldPath(path)))
      problems.push(`corpus: duplicate path (case/normalisation-insensitive): ${path}`)
    existing.add(foldPath(path))
    return bad === null
  }
  for (const dir of corpus.directories) {
    if (note(dir) && dir.includes('/') && !seen.has(dir.slice(0, dir.lastIndexOf('/'))))
      problems.push(`corpus: directory listed before its parent: ${dir}`)
    seen.add(dir)
  }
  let bytes = 0
  for (const file of corpus.files) {
    if (note(file.path) && dirsOf(file.path).length > 0 && !seen.has(dirsOf(file.path).join('/')))
      problems.push(`corpus: file without a listed directory: ${file.path}`)
    const bad = payloadProblem(file.payload)
    if (bad) problems.push(`corpus: ${file.path}: ${bad}`)
    if (file.payload.kind === 'text' && file.payload.bytes > 0 && !file.text)
      problems.push(`corpus: text file without text: ${file.path}`)
    bytes += file.payload.bytes
  }
  if (corpus.files.length > MAX_CORPUS_FILES)
    problems.push(`corpus: ${corpus.files.length} files exceed ${MAX_CORPUS_FILES}`)
  if (bytes > limit) problems.push(`corpus: ${bytes} bytes exceed ${limit}`)
  return { owners: new Map(), existing }
}

function checkDims(scenario: Scenario, apps: ReadonlySet<string>, problems: Problems): void {
  const expected = CLASS_DIMENSIONS[scenario.class]
  const given = Object.keys(scenario.dims)
  if (given.length !== expected.length || !expected.every((dim) => given.includes(dim))) {
    problems.push(
      `${scenario.id}: dims ${given.join(',')} do not match the ${scenario.class} dimensions ${expected.join(',')}`
    )
    return
  }
  for (const dim of expected) {
    const value = scenario.dims[dim]
    if (typeof value !== 'string' || value === '')
      problems.push(`${scenario.id}: dimension ${dim} is not a non-empty string`)
    else if (dim === 'app') {
      if (!apps.has(NFC(value)))
        problems.push(`${scenario.id}: app ${value} is not in options.apps`)
    } else if (!valueIds(dim as Exclude<DimensionName, 'app'>).includes(value))
      problems.push(`${scenario.id}: unknown ${dim} value ${value}`)
    else if (weightOf(scenario.class, dim as Exclude<DimensionName, 'app'>, value) <= 0)
      problems.push(`${scenario.id}: ${dim}=${value} is not allowed in ${scenario.class}`)
  }
  for (const row of FORBIDDEN) {
    const names = Object.keys(row) as DimensionName[]
    if (
      names.every(
        (name) => expected.includes(name) && row[name]?.includes(scenario.dims[name] as string)
      )
    ) {
      problems.push(
        `${scenario.id}: forbidden combination ${names.map((name) => `${name}=${scenario.dims[name]}`).join(' ')}`
      )
    }
  }
}

function checkShape(check: SearchCheck, scenario: Scenario, problems: Problems): boolean {
  const tag = `${scenario.id}: check "${check.query}"`
  let ok = true
  const fail = (message: string): void => {
    ok = false
    problems.push(`${tag}: ${message}`)
  }
  if (check.expect !== 'present' && check.expect !== 'absent')
    fail(`bad expect ${String(check.expect)}`)
  if (check.tier !== 'hard' && check.tier !== 'soft') fail(`bad tier ${String(check.tier)}`)
  if (typeof check.query !== 'string' || check.query.trim() === '' || check.query.length > 512)
    fail('query is blank or over 512 characters')
  if (!Number.isInteger(check.topK) || check.topK < 1 || check.topK > 200)
    fail(`topK out of range: ${check.topK}`)
  if (!Number.isFinite(check.deadlineMs) || check.deadlineMs < 1_000 || check.deadlineMs > 120_000)
    fail(`deadlineMs out of range: ${check.deadlineMs}`)
  if (
    check.startAfterMs !== undefined &&
    (!Number.isFinite(check.startAfterMs) || check.startAfterMs < 0 || check.startAfterMs > 60_000)
  )
    fail(`startAfterMs out of range: ${check.startAfterMs}`)
  if (scenario.class === 'search-app') {
    if (check.target.kind !== 'app' || check.target.path !== undefined)
      fail('a search-app check must target an app by name')
    else if (check.target.name !== scenario.dims.app)
      fail(`target app ${check.target.name} differs from dims.app`)
  } else if (check.target.kind !== 'file' || !check.target.path) {
    fail('file checks need a target path')
  } else if (check.target.name !== basename(check.target.path)) {
    fail(`target name ${check.target.name} is not the last component of ${check.target.path}`)
  } else {
    const bad = pathProblem(check.target.path)
    if (bad) fail(bad)
  }
  return ok
}

const WORD_START = /[\s\-_.()[\]]/

function startsAWord(name: string, lower: string): boolean {
  const folded = name.toLowerCase()
  for (let at = folded.indexOf(lower); at !== -1; at = folded.indexOf(lower, at + 1)) {
    if (at === 0 || WORD_START.test(folded.charAt(at - 1))) return true
  }
  return false
}

/** Facts about a hard `present` check that depend on the file it finds and on every other indexable name. */
function checkHardPresent(
  scenario: Scenario,
  check: SearchCheck,
  payload: PayloadSpec | undefined,
  hits: (prefix: string) => number,
  problems: Problems
): void {
  const tag = `${scenario.id}: hard check "${check.query}"`
  const id = scenario.dims.query as string
  const query = NFC(check.query)
  if (scenario.class === 'search-app') {
    if (id !== 'exact-stem' || query !== NFC(check.target.name))
      problems.push(`${tag}: an app check is hard only for the exact display name`)
    return
  }
  const path = check.target.path as string
  const name = NFC(basename(path))
  const stem = name.slice(0, name.lastIndexOf('.'))
  if (!isHardStyle(scenario.dims.nameStyle as string))
    problems.push(`${tag}: name style ${scenario.dims.nameStyle} can only be soft`)
  if (!payload || payload.bytes === 0 || payload.kind === 'fake-image')
    problems.push(`${tag}: the file is empty or undecodable, discovery is not promised`)
  if (!isPresentable(path)) problems.push(`${tag}: ${path} is not an indexable path`)
  if (query === name || query === stem) return
  if (!HARD_QUERY_IDS.has(id) || id === 'exact-ext' || id === 'exact-stem') {
    problems.push(
      `${tag}: ${id} is hard only when the query is the exact name or name without extension`
    )
    return
  }
  const lower = query.toLowerCase()
  if ([...query].length < 3) problems.push(`${tag}: a prefix needs at least 3 characters`)
  if (!startsAWord(name, lower)) problems.push(`${tag}: the query does not start a word of ${name}`)
  const known = hits(lower)
  if (known > MAX_HARD_PREFIX_HITS)
    problems.push(`${tag}: ${known} indexable names start with it (limit ${MAX_HARD_PREFIX_HITS})`)
  if (check.topK < known)
    problems.push(
      `${tag}: topK ${check.topK} is below the ${known} names that could outrank the target`
    )
}

function checkChecks(
  scenario: Scenario,
  outcome: StepOutcome,
  partners: StepOutcome[],
  view: CorpusView,
  hits: (prefix: string) => number,
  problems: Problems
): void {
  if (scenario.checks.length === 0) problems.push(`${scenario.id}: no checks`)
  const lookup = (path: string): PayloadSpec | undefined => {
    const own = outcome.files.get(path)
    if (own) return own
    for (const partner of partners) {
      const found = partner.files.get(path)
      if (found) return found
    }
    return outcome.gone.has(path) ? undefined : view.files.get(path)
  }
  const payloadAtEnd = (path: string): PayloadSpec | undefined => {
    const direct = lookup(path)
    if (direct) return direct
    for (const [link, target] of outcome.links)
      if (path.startsWith(`${link}/`)) return lookup(target + path.slice(link.length))
    return undefined
  }
  const wanted = new Set<string>()
  const unwanted = new Set<string>()
  const keys = new Set<string>()
  for (const check of scenario.checks) {
    if (!checkShape(check, scenario, problems)) continue
    const key = `${check.expect}|${check.query}|${check.target.path ?? check.target.name}`
    if (keys.has(key)) problems.push(`${scenario.id}: duplicate check "${check.query}"`)
    keys.add(key)
    if (scenario.class === 'search-app') {
      if (check.expect !== 'present')
        problems.push(`${scenario.id}: a search-app check must be present`)
      if (check.tier === 'hard') checkHardPresent(scenario, check, undefined, hits, problems)
      continue
    }
    const path = check.target.path as string
    const payload = payloadAtEnd(path)
    if (check.expect === 'present') {
      wanted.add(path)
      if (!payload)
        problems.push(`${scenario.id}: present target does not exist after the steps: ${path}`)
      if (!isPresentable(path))
        problems.push(`${scenario.id}: present target is excluded by the traversal policy: ${path}`)
      if (check.tier === 'soft' && check.topK < 20)
        problems.push(
          `${scenario.id}: soft check "${check.query}" needs a larger topK than ${check.topK}`
        )
      if (check.tier === 'hard') checkHardPresent(scenario, check, payload, hits, problems)
      continue
    }
    unwanted.add(path)
    const excluded = excludedUnconditionally(path, ADMITTED_EXTENSIONS)
    if (check.tier === 'hard' && !excluded)
      problems.push(
        `${scenario.id}: hard absent check on ${path}, which no traversal rule excludes`
      )
    if (check.tier === 'hard' && !payload)
      problems.push(
        `${scenario.id}: hard absent check on a path that was never written (stale-index checks are soft): ${path}`
      )
    if (scenario.class === 'ignore-image' && !payload)
      problems.push(`${scenario.id}: the excluded file was never written: ${path}`)
    if (scenario.class !== 'ignore-image' && payload && !excluded)
      problems.push(`${scenario.id}: absent target still exists and no rule excludes it: ${path}`)
  }
  for (const path of wanted)
    if (unwanted.has(path))
      problems.push(`${scenario.id}: ${path} is expected both present and absent`)
  if (scenario.class === 'ignore-image') {
    const present = scenario.checks.some((check) => check.expect === 'present')
    const absent = scenario.checks.some((check) => check.expect === 'absent')
    if (!present || !absent)
      problems.push(
        `${scenario.id}: an ignore-image scenario needs a visible control and an absent check`
      )
  }
}

function checkRequires(
  scenarios: readonly Scenario[],
  outcomes: Map<string, StepOutcome>,
  problems: Problems
): void {
  const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]))
  for (const scenario of scenarios) {
    const refs = scenario.requires ?? []
    if (scenario.class !== 'search-created') {
      if (refs.length > 0)
        problems.push(`${scenario.id}: only search-created scenarios may require another`)
      continue
    }
    if (refs.length !== 1) {
      problems.push(`${scenario.id}: search-created needs exactly one required scenario`)
      continue
    }
    const partner = byId.get(refs[0] as string)
    if (!partner) {
      problems.push(`${scenario.id}: requires unknown scenario ${refs[0]}`)
      continue
    }
    if (partner.class !== 'create-image')
      problems.push(`${scenario.id}: requires ${partner.id}, which is not a create-image`)
    if (partner.index > scenario.index - MIN_CREATED_GAP)
      problems.push(
        `${scenario.id}: runs ${scenario.index - partner.index} scenarios after its create-image (need ${MIN_CREATED_GAP})`
      )
    for (const dim of ['format', 'nameStyle', 'placement', 'size', 'writeMode']) {
      if (partner.dims[dim] !== scenario.dims[dim])
        problems.push(`${scenario.id}: ${dim} differs from its create-image`)
    }
    const files = outcomes.get(partner.id)?.files
    for (const check of scenario.checks) {
      if (check.target.path && !files?.has(check.target.path))
        problems.push(
          `${scenario.id}: target ${check.target.path} is not left in place by ${partner.id}`
        )
    }
  }
}

function checkClass(scenario: Scenario, problems: Problems): void {
  const seeded =
    scenario.class === 'search-app' ||
    scenario.class === 'search-file' ||
    scenario.class === 'search-image' ||
    scenario.class === 'search-created'
  if (seeded && scenario.steps.length > 0)
    problems.push(`${scenario.id}: ${scenario.class} must not change the filesystem`)
  if (!seeded && scenario.steps.length === 0)
    problems.push(`${scenario.id}: ${scenario.class} has no steps`)
  if (
    scenario.class !== 'search-app' &&
    scenario.checks.some((check) => check.target.kind !== 'file')
  )
    problems.push(`${scenario.id}: only search-app checks target apps`)
}

/** Every rule a plan must satisfy; an empty list means the plan is valid. */
export function validatePlan(plan: ScenarioPlan): string[] {
  const problems = new Problems()
  const scenarios = plan.scenarios
  if (scenarios.length !== plan.count)
    problems.push(`plan.count is ${plan.count} but the plan holds ${scenarios.length} scenarios`)
  if (plan.options.count !== plan.count || plan.options.seed !== plan.seed)
    problems.push('plan.options do not match plan.seed / plan.count')
  const apps = new Set(distinctApps(plan.options.apps).map(NFC))
  const ledger = checkCorpus(plan.corpus, maxCorpusBytes(plan.count), problems)
  const view = corpusView(plan.corpus)
  const index = new PrefixIndex()
  const outcomes = new Map<string, StepOutcome>()
  const ids = new Set<string>()
  const tuples = new Set<string>()
  const counts = new Map<ScenarioClass, number>()

  const indexed = new Set<string>()
  const addIndexed = (path: string): void => {
    if (!indexed.has(foldPath(path)) && !excludedUnconditionally(path, ADMITTED_EXTENSIONS)) {
      indexed.add(foldPath(path))
      index.add(basename(path))
    }
  }
  for (const file of plan.corpus.files) addIndexed(file.path)

  scenarios.forEach((scenario, position) => {
    if (scenario.index !== position)
      problems.push(`${scenario.id}: index ${scenario.index} is not its position ${position}`)
    if (!CLASSES.includes(scenario.class)) {
      problems.push(`${scenario.id}: unknown class ${String(scenario.class)}`)
      return
    }
    counts.set(scenario.class, (counts.get(scenario.class) ?? 0) + 1)
    if (ids.has(scenario.id)) problems.push(`${scenario.id}: duplicate id`)
    ids.add(scenario.id)
    if (scenario.id !== scenarioId(scenario.class, scenario.dims, scenario.steps, scenario.checks))
      problems.push(`${scenario.id}: id does not match the scenario content`)
    const tuple = tupleKey(scenario.class, scenario.dims)
    if (tuples.has(tuple))
      problems.push(`${scenario.id}: same class and dimensions as an earlier scenario`)
    tuples.add(tuple)
    checkDims(scenario, apps, problems)
    checkClass(scenario, problems)
    const outcome = replaySteps(scenario, view, ledger, problems)
    outcomes.set(scenario.id, outcome)
    if (outcome.written > MAX_SCENARIO_WRITE_BYTES)
      problems.push(
        `${scenario.id}: writes ${outcome.written} bytes (limit ${MAX_SCENARIO_WRITE_BYTES})`
      )
    for (const path of outcome.destinations) addIndexed(path)
  })

  const hits = (prefix: string): number => index.count(prefix)
  for (const scenario of scenarios) {
    const outcome = outcomes.get(scenario.id)
    if (!outcome || !CLASSES.includes(scenario.class)) continue
    const partners = (scenario.requires ?? []).flatMap((id) => outcomes.get(id) ?? [])
    checkChecks(scenario, outcome, partners, view, hits, problems)
  }
  checkRequires(scenarios, outcomes, problems)
  if ((counts.get('search-app') ?? 0) > appPairCapacity(plan.options.apps))
    problems.push('more search-app scenarios than (app, query) pairs exist')
  if (ids.size !== scenarios.length)
    problems.push(`only ${ids.size} distinct scenario ids for ${scenarios.length} scenarios`)
  if (tuples.size !== scenarios.length)
    problems.push(
      `only ${tuples.size} distinct (class, dims) tuples for ${scenarios.length} scenarios`
    )
  return problems.result()
}
