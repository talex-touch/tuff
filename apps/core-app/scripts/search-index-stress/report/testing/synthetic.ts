import type { Breach, MonitorSummary, PhaseSummary, ReportInputs } from '../../eval-types'
import { DEFAULT_THRESHOLDS } from '../../monitor/thresholds'
import type { CheckResult, ScenarioClass } from '../../types'
import { T0, cleanDb, dist, runMeta } from './builders'

export function prng(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const MIX: ReadonlyArray<[ScenarioClass, number]> = [
  ['search-app', 0.05],
  ['search-file', 0.2],
  ['search-image', 0.2],
  ['create-image', 0.25],
  ['change-image', 0.12],
  ['ignore-image', 0.1],
  ['search-created', 0.08]
]

const FORMATS = ['png', 'jpg', 'gif', 'bmp', 'webp', 'tiff', 'heic', 'svg', 'fake-image']
const NAME_STYLES = ['ascii', 'cjk', 'emoji', 'long', 'dots', 'spaces', 'upper']
const PLACEMENTS = ['root', 'nested', 'deep', 'dot-dir', 'unicode-dir', 'excluded']
const SIZES = ['xs', 's', 'm', 'l', 'xl']
const QUERIES = ['exact', 'prefix', 'substring', 'fuzzy', 'case', 'extension', 'pinyin']
const WRITE_MODES = ['plain', 'atomic', 'chunked', 'copy', 'move', 'parallel']
const OPS = ['rename', 'overwrite', 'delete', 'move']
const REASONS = ['hidden', 'excluded-dir', 'symlink', 'fake', 'zero-byte', 'temp-ext']
const APP_KINDS = ['system', 'user', 'electron', 'cli']

type Dims = Record<string, string | number | boolean>

export interface SyntheticOptions {
  scenarios: number
  seed: number
}

const pick = <T>(rng: () => number, values: readonly T[]): T =>
  values[Math.floor(rng() * values.length)]

function dimsFor(cls: ScenarioClass, rng: () => number): Dims {
  const common = () => ({
    format: pick(rng, FORMATS),
    nameStyle: pick(rng, NAME_STYLES),
    placement: pick(rng, PLACEMENTS),
    size: pick(rng, SIZES)
  })
  switch (cls) {
    case 'search-app':
      return {
        nameStyle: pick(rng, NAME_STYLES),
        appKind: pick(rng, APP_KINDS),
        query: pick(rng, QUERIES)
      }
    case 'search-file':
      return { ...common(), query: pick(rng, QUERIES), dir: `d${Math.floor(rng() * 150)}` }
    case 'search-image':
      return { ...common(), query: pick(rng, QUERIES) }
    case 'create-image':
      return { ...common(), writeMode: pick(rng, WRITE_MODES) }
    case 'change-image':
      return { op: pick(rng, OPS), format: pick(rng, FORMATS), placement: pick(rng, PLACEMENTS) }
    case 'ignore-image':
      return { reason: pick(rng, REASONS), format: pick(rng, FORMATS) }
    case 'search-created':
      return { format: pick(rng, FORMATS), query: pick(rng, QUERIES) }
  }
}

const exponential = (rng: () => number, mean: number): number => -Math.log(1 - rng()) * mean

function resultsFor(
  cls: ScenarioClass,
  id: string,
  dims: Dims,
  rng: () => number,
  phase: string
): CheckResult[] {
  const checks = 1 + (rng() < 0.4 ? 1 : 0)
  const slow =
    (dims.format === 'heic' ? 5 : 1) *
    (dims.placement === 'deep' ? 2.5 : 1) *
    (phase === 'burst' ? 2 : 1)
  const fuzzy = dims.query === 'fuzzy' || dims.query === 'pinyin'
  const out: CheckResult[] = []
  for (let index = 0; index < checks; index++) {
    const answerMs = Math.round((25 + exponential(rng, 25)) * slow)
    const gap = [0, 150, 300][Math.floor(rng() * 3)]
    const base: CheckResult = {
      scenarioId: id,
      checkIndex: index,
      class: cls,
      tier: fuzzy ? 'soft' : 'hard',
      outcome: 'pass',
      latencyMs: answerMs + gap,
      sinceStepsMs: answerMs + gap,
      polls: 1 + Math.floor(rng() * 4),
      rank: 1,
      resultCount: 5,
      answerMs,
      maxPollGapMs: gap || 150,
      expect: 'present',
      phase
    }
    const roll = rng()
    if (cls === 'ignore-image') {
      out.push({
        ...base,
        rank: null,
        latencyMs: 3000,
        sinceStepsMs: 3000,
        expect: 'absent',
        outcome: roll < 0.002 ? 'fail' : 'pass',
        tier: 'hard'
      })
    } else if (roll < 0.0015) {
      out.push({
        ...base,
        outcome: 'error',
        latencyMs: null,
        sinceStepsMs: null,
        rank: null,
        resultCount: null,
        answerMs: null,
        detail: 'search driver lost the page'
      })
    } else if (roll < (fuzzy ? 0.12 : 0.003)) {
      out.push({
        ...base,
        outcome: 'fail',
        latencyMs: null,
        sinceStepsMs: null,
        rank: null,
        detail: 'target not found within 5000 ms'
      })
    } else if (cls === 'create-image') {
      const since =
        1200 +
        rng() * 1000 +
        (dims.writeMode === 'chunked' ? 2500 : 0) +
        (dims.format === 'heic' ? 800 : 0)
      out.push({ ...base, sinceStepsMs: Math.round(since), latencyMs: Math.round(since) })
    } else {
      out.push(base)
    }
  }
  return out
}

function phaseFor(
  name: string,
  startedAt: number,
  endedAt: number,
  frames: boolean,
  load: number
): PhaseSummary {
  return {
    phase: name,
    startedAt,
    endedAt,
    cpuPct: dist(20 * load, 40 * load, 60 * load, 90 * load, 120 * load),
    mainCpuPct: dist(10 * load, 25 * load, 40 * load),
    rendererCpuPct: dist(5 * load, 15 * load, 30 * load),
    rssMb: dist(900 + 100 * load, 1_100 + 100 * load, 1_300 + 100 * load),
    loopDelayMs: dist(2, 3, 4, 6, 14),
    loopMaxBlockMs: 60 * load,
    rendererBlockMs: dist(2, 5, 9, 20),
    frames: frames
      ? {
          total: 100_000,
          over33ms: 400,
          over50ms: 60,
          over100ms: 2,
          worstMs: 130,
          visibleWindows: 1
        }
      : null,
    breaches: []
  }
}

function monitorFor(count: number, rng: () => number): MonitorSummary {
  const minute = 60_000
  const phases = [
    phaseFor('seed', T0, T0 + 5 * minute, false, 1.5),
    phaseFor('steady', T0 + 5 * minute, T0 + 45 * minute, true, 1),
    phaseFor('burst', T0 + 45 * minute, T0 + 50 * minute, true, 2)
  ]
  const breaches: Breach[] = []
  const kinds: Array<[Breach['kind'], number, number]> = [
    ['main-loop-block', 140, 100],
    ['cpu', 190, 150],
    ['frame-drop', 0.015, 0.01],
    ['renderer-block', 130, 100]
  ]
  for (let index = 0; index < count; index++) {
    const [kind, value, limit] = kinds[index % kinds.length]
    breaches.push({
      at: T0 + Math.floor(rng() * 50 * minute),
      phase: index % 3 === 0 ? 'burst' : 'steady',
      kind,
      severity: 'warn',
      value,
      limit,
      detail: `episode ${index}`,
      marks: ['batch:' + index, 'waiting-for-index-idle']
    })
  }
  const lags = Array.from({ length: 15 }, (_, index) => ({
    at: T0 + 10 * minute + index * 2 * minute,
    lagMs: 210 + index * 5,
    suspect: index % 2 === 0 ? 'Intelligence.invoke' : 'unattributed',
    contexts: index % 2 === 0 ? ['Intelligence.invoke:embedding.generate'] : undefined
  }))
  return {
    startedAt: T0,
    endedAt: T0 + 50 * minute,
    phases,
    breaches,
    blindMs: 4_000,
    samplesWritten: 3_000,
    timelineFile: '/private/tmp/evidence/timeline.ndjson',
    dbRepairMarkers: [],
    thresholds: structuredClone(DEFAULT_THRESHOLDS),
    appReportedLag: lags,
    intervalMs: 1_000
  }
}

/** A deterministic run shaped like the real one: seven classes, ~1.4 checks per scenario, a few hundred misses. */
export function syntheticRun(options: SyntheticOptions): ReportInputs {
  const rng = prng(options.seed)
  const results: CheckResult[] = []
  const dims: ReportInputs['dims'] = {}
  const planned: ReportInputs['planned'] = {}
  for (let index = 0; index < options.scenarios; index++) {
    let roll = rng()
    let cls = MIX[MIX.length - 1][0]
    for (const [candidate, share] of MIX) {
      if (roll < share) {
        cls = candidate
        break
      }
      roll -= share
    }
    const id = `${cls}-${index.toString(16).padStart(12, '0')}`
    const scenarioDims = dimsFor(cls, rng)
    dims[id] = scenarioDims
    planned[cls] = (planned[cls] ?? 0) + 1
    const phase =
      index < options.scenarios * 0.1
        ? 'seed'
        : index < options.scenarios * 0.9
          ? 'steady'
          : 'burst'
    results.push(...resultsFor(cls, id, scenarioDims, rng, phase))
  }
  return {
    meta: runMeta({ scenarioCount: options.scenarios }),
    results,
    monitor: monitorFor(120, rng),
    db: cleanDb(),
    planned,
    dims,
    notRun: []
  }
}
