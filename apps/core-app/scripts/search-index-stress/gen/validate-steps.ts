import type { CorpusManifest, FsStep, PayloadSpec, Scenario } from '../types'
import { MAX_PAYLOAD_BYTES, MAX_PIXEL_SIDE } from './payload'
import { pathProblem } from './policy'
import { foldPath } from './registry'

const KINDS = new Set([
  'png',
  'jpg',
  'gif',
  'bmp',
  'webp',
  'tiff',
  'heic',
  'svg',
  'fake-image',
  'text',
  'binary'
])
const MAX_SLEEP_MS = 10_000
const EMPTY: PayloadSpec = { kind: 'binary', bytes: 0, seed: 0 }

export function payloadProblem(spec: PayloadSpec): string | null {
  if (!KINDS.has(spec.kind)) return `unknown payload kind ${String(spec.kind)}`
  if (!Number.isInteger(spec.bytes) || spec.bytes < 0 || spec.bytes > MAX_PAYLOAD_BYTES)
    return `payload bytes out of range: ${spec.bytes}`
  if (!Number.isInteger(spec.seed)) return `payload seed is not an integer: ${spec.seed}`
  for (const side of [spec.width, spec.height]) {
    if (side !== undefined && (!Number.isInteger(side) || side < 1 || side > MAX_PIXEL_SIDE))
      return `payload pixel size out of range: ${side}`
  }
  if ((spec.width === undefined) !== (spec.height === undefined))
    return 'payload needs both width and height, or neither'
  return null
}

export interface CorpusView {
  files: Map<string, PayloadSpec>
  directories: Set<string>
}

export function corpusView(corpus: CorpusManifest): CorpusView {
  return {
    files: new Map(corpus.files.map((file) => [file.path, file.payload])),
    directories: new Set(corpus.directories)
  }
}

/** Shared across scenarios: who touched which folded path, and which folded paths already exist. */
export interface Ledger {
  owners: Map<string, string>
  existing: Set<string>
}

export interface Sink {
  push: (message: string) => unknown
}

export interface StepOutcome {
  /** Bytes the steps put on disk (a copy counts its source size, a rewrite counts again). */
  written: number
  /** Files that exist after the steps and were created or replaced by them. */
  files: Map<string, PayloadSpec>
  /** Seeded files the steps moved away or deleted. */
  gone: Set<string>
  /** Symlinks the steps made: link path -> root-relative target. */
  links: Map<string, string>
  /** Every path a step wrote, copied or moved a file to. */
  destinations: string[]
}

const parentOf = (path: string): string =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''

function pathsOf(step: FsStep): string[] {
  switch (step.op) {
    case 'copy':
    case 'move':
      return [step.from, step.to]
    case 'sleep':
    case 'parallel':
      return []
    default:
      return [step.path]
  }
}

const related = (a: string, b: string): boolean =>
  a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)

/** Replays one scenario's steps against the corpus and reports what is wrong with them. */
export function replaySteps(
  scenario: Scenario,
  view: CorpusView,
  ledger: Ledger,
  problems: Sink
): StepOutcome {
  const created = new Map<string, PayloadSpec>()
  const gone = new Set<string>()
  const madeDirs = new Set<string>()
  const links = new Map<string, string>()
  const removedFolds = new Set<string>()
  const destinations: string[] = []
  let written = 0
  const report = (message: string): void => {
    problems.push(`${scenario.id}: ${message}`)
  }
  const exists = (path: string): boolean =>
    created.has(path) || (view.files.has(path) && !gone.has(path))
  const dirExists = (path: string): boolean =>
    path === '' || view.directories.has(path) || madeDirs.has(path)
  const payloadOf = (path: string): PayloadSpec =>
    created.get(path) ?? view.files.get(path) ?? EMPTY
  const claim = (path: string): void => {
    const owner = ledger.owners.get(foldPath(path))
    if (owner !== undefined && owner !== scenario.id) report(`path also used by ${owner}: ${path}`)
    else ledger.owners.set(foldPath(path), scenario.id)
  }
  const make = (path: string): void => {
    const folded = foldPath(path)
    if (ledger.existing.has(folded) && !removedFolds.has(folded))
      report(`name already exists (case/normalisation-insensitive): ${path}`)
    ledger.existing.add(folded)
  }
  const checkPath = (path: string): boolean => {
    const problem = pathProblem(path)
    if (problem) report(problem)
    return problem === null
  }
  const needParent = (path: string): void => {
    if (!dirExists(parentOf(path))) report(`parent directory does not exist: ${path}`)
  }
  const drop = (path: string): void => {
    created.delete(path)
    if (view.files.has(path)) gone.add(path)
    removedFolds.add(foldPath(path))
  }
  const put = (path: string, payload: PayloadSpec): void => {
    gone.delete(path)
    created.set(path, payload)
    destinations.push(path)
  }

  const run = (step: FsStep): void => {
    switch (step.op) {
      case 'mkdir':
        if (!checkPath(step.path)) return
        if (dirExists(step.path)) report(`mkdir on an existing directory: ${step.path}`)
        needParent(step.path)
        claim(step.path)
        make(step.path)
        madeDirs.add(step.path)
        return
      case 'write':
      case 'write-atomic': {
        if (!checkPath(step.path)) return
        const problem = payloadProblem(step.payload)
        if (problem) report(problem)
        needParent(step.path)
        claim(step.path)
        if (
          step.op === 'write' &&
          step.chunks !== undefined &&
          (!Number.isInteger(step.chunks) || step.chunks < 1)
        )
          report(`bad chunk count: ${step.chunks}`)
        if (!exists(step.path)) make(step.path)
        put(step.path, step.payload)
        written += step.payload.bytes
        return
      }
      case 'copy':
        if (!checkPath(step.from) || !checkPath(step.to)) return
        if (!exists(step.from)) report(`copy source does not exist: ${step.from}`)
        if (exists(step.to)) report(`copy target already exists: ${step.to}`)
        needParent(step.to)
        claim(step.to)
        make(step.to)
        written += payloadOf(step.from).bytes
        put(step.to, payloadOf(step.from))
        return
      case 'move': {
        if (!checkPath(step.from) || !checkPath(step.to)) return
        if (!exists(step.from)) report(`move source does not exist: ${step.from}`)
        if (exists(step.to) && foldPath(step.to) !== foldPath(step.from))
          report(`move target already exists: ${step.to}`)
        needParent(step.to)
        claim(step.from)
        claim(step.to)
        const payload = payloadOf(step.from)
        drop(step.from)
        make(step.to)
        put(step.to, payload)
        return
      }
      case 'delete':
        if (!checkPath(step.path)) return
        if (!exists(step.path) && !dirExists(step.path))
          report(`delete of a missing path: ${step.path}`)
        claim(step.path)
        drop(step.path)
        return
      case 'symlink':
        if (!checkPath(step.path) || !checkPath(step.target)) return
        if (!exists(step.target) && !dirExists(step.target))
          report(`symlink target does not exist: ${step.target}`)
        needParent(step.path)
        claim(step.path)
        make(step.path)
        created.set(step.path, EMPTY)
        links.set(step.path, step.target)
        return
      case 'touch':
        if (!checkPath(step.path)) return
        needParent(step.path)
        claim(step.path)
        if (!exists(step.path)) {
          make(step.path)
          put(step.path, EMPTY)
        }
        return
      case 'sleep':
        if (!Number.isFinite(step.ms) || step.ms < 0 || step.ms > MAX_SLEEP_MS)
          report(`sleep out of range: ${step.ms}`)
        return
      case 'parallel': {
        if (step.steps.length === 0) report('empty parallel group')
        const started: string[] = []
        for (const inner of step.steps) {
          if (inner.op === 'parallel') report('parallel groups cannot be nested')
          const mine = pathsOf(inner).map(foldPath)
          // Steps of one group start in the same tick, so none may depend on, or collide with, a sibling.
          for (const path of mine)
            if (started.some((other) => related(path, other)))
              report(`parallel steps touch the same path or one inside the other: ${path}`)
          started.push(...mine)
          run(inner)
        }
        return
      }
      default:
        report(`unknown step ${JSON.stringify(step)}`)
    }
  }
  for (const step of scenario.steps) run(step)
  return { written, files: created, gone, links, destinations }
}
