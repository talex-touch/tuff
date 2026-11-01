import { describe, expect, it } from 'vitest'
import type { CorpusFile, FsStep, Scenario, ScenarioClass, ScenarioPlan } from '../types'
import { distinctApps } from './build-app'
import {
  ADMITTED_EXTENSIONS,
  FILE_TYPE_EXTENSIONS,
  FORMAT_EXTENSIONS,
  PIXEL_SIZES,
  SIZE_BYTES,
  valueIds
} from './dimensions'
import { CLASSES, MIN_CREATED_GAP, generatePlan } from './plan'
import { excludedUnconditionally, pathProblem } from './policy'
import { APPS, flatSteps, leftInPlace, mediumPlan, optionsFor } from './test-fixtures'

const ofClass = (plan: ScenarioPlan, cls: ScenarioClass): Scenario[] =>
  plan.scenarios.filter((scenario) => scenario.class === cls)
const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)
const dirName = (path: string): string => path.slice(0, Math.max(0, path.lastIndexOf('/')))
const lowerExt = (path: string): string => path.slice(path.lastIndexOf('.') + 1).toLowerCase()
const corpusOf = (plan: ScenarioPlan): Map<string, CorpusFile> =>
  new Map(plan.corpus.files.map((file) => [file.path, file]))
const targetPath = (scenario: Scenario, at = 0): string =>
  scenario.checks[at]?.target.path as string
const ops = (scenario: Scenario): string[] =>
  scenario.steps.filter((step) => step.op !== 'mkdir').map((step) => step.op)
const bodyOf = (scenario: Scenario): FsStep[] =>
  scenario.steps.filter((step) => step.op !== 'mkdir')

const ONLY_IGNORE = Object.fromEntries(CLASSES.map((cls) => [cls, cls === 'ignore-image' ? 1 : 0]))
let ignoring: ScenarioPlan | undefined
const ignorePlan = (): ScenarioPlan =>
  (ignoring ??= generatePlan(optionsFor(150, { mix: ONLY_IGNORE })))

/** Rules whose outcome depends on what sits next to the file, so the generator never calls them hard. */
const SOFT_RULES =
  /^(development-path:project-|cache-path:project-|unsupported-extension:|scan-skips:)/

function expectedBytes(format: string, size: string): number {
  return format === 'zero-byte' ? 0 : (SIZE_BYTES[size] as number)
}

describe('every class is present in the 600-scenario plan', () => {
  it('has at least 25 scenarios of each class', () => {
    for (const cls of CLASSES)
      expect(ofClass(mediumPlan(), cls).length, cls).toBeGreaterThanOrEqual(25)
  })
})

describe('search-app', () => {
  it('looks an installed app up by its display name and touches nothing', () => {
    const apps = new Set(distinctApps(APPS))
    for (const scenario of ofClass(mediumPlan(), 'search-app')) {
      expect(scenario.steps).toEqual([])
      expect(scenario.checks).toHaveLength(1)
      const check = scenario.checks[0] as Scenario['checks'][number]
      expect(apps.has(String(scenario.dims.app))).toBe(true)
      expect(check.target).toEqual({ kind: 'app', name: scenario.dims.app })
      expect(check.expect).toBe('present')
      if (check.tier === 'hard') {
        expect(scenario.dims.query).toBe('exact-stem')
        expect(check.query).toBe(scenario.dims.app)
      }
    }
  })
})

describe('search-file', () => {
  it('points at a seeded non-image file of the declared family', () => {
    const plan = mediumPlan()
    const files = corpusOf(plan)
    for (const scenario of ofClass(plan, 'search-file')) {
      const path = targetPath(scenario)
      const file = files.get(path)
      expect(scenario.steps).toEqual([])
      expect(scenario.checks).toHaveLength(1)
      expect(scenario.checks[0]?.expect).toBe('present')
      expect(file, path).toBeDefined()
      expect(FILE_TYPE_EXTENSIONS[String(scenario.dims.fileType)]).toContain(lowerExt(path))
      expect(['text', 'binary']).toContain(file?.payload.kind)
      expect(pathProblem(path)).toBeNull()
      expect(excludedUnconditionally(path, ADMITTED_EXTENSIONS)).toBe(false)
      if (file?.payload.kind === 'text') expect(file.text?.length).toBeGreaterThan(0)
    }
  })
})

describe('search-image', () => {
  it('points at a seeded image whose bytes match the declared format and size', () => {
    const plan = mediumPlan()
    const files = corpusOf(plan)
    for (const scenario of ofClass(plan, 'search-image')) {
      const path = targetPath(scenario)
      const file = files.get(path) as CorpusFile
      const format = String(scenario.dims.format)
      expect(scenario.steps).toEqual([])
      expect(file, path).toBeDefined()
      expect(FORMAT_EXTENSIONS[format]).toContain(lowerExt(path))
      expect(file.payload.kind).toBe(format === 'zero-byte' ? 'fake-image' : format)
      expect(file.payload.bytes).toBe(expectedBytes(format, String(scenario.dims.size)))
      if (scenario.checks[0]?.tier === 'hard')
        expect(['fake-image', 'zero-byte']).not.toContain(format)
    }
  })
})

describe('create-image', () => {
  const created = (): Scenario[] => ofClass(mediumPlan(), 'create-image')
  const byMode = (mode: string): Scenario[] =>
    created().filter((scenario) => scenario.dims.writeMode === mode)

  it('covers every write mode at least twice in 600 scenarios', () => {
    const modes = new Set(created().map((scenario) => scenario.dims.writeMode))
    expect([...modes].sort()).toEqual(valueIds('writeMode').sort())
    for (const mode of modes)
      expect(byMode(String(mode)).length, String(mode)).toBeGreaterThanOrEqual(2)
  })

  it('leaves the file its present checks name, and only those, in place', () => {
    for (const scenario of created()) {
      const left = leftInPlace(scenario.steps)
      for (const check of scenario.checks) {
        const path = check.target.path as string
        expect(left.has(path), `${scenario.id} ${check.expect} ${path}`).toBe(
          check.expect === 'present'
        )
        if (check.expect === 'absent') expect(check.tier).toBe('soft')
      }
      expect(
        scenario.checks.some((check) => check.expect === 'present') ||
          scenario.dims.writeMode === 'create-then-delete'
      ).toBe(true)
    }
  })

  it('writes the declared format and size, with the pixel size of wide strips', () => {
    for (const scenario of created()) {
      const format = String(scenario.dims.format)
      const size = String(scenario.dims.size)
      const writes = flatSteps(scenario.steps).filter(
        (step): step is Extract<FsStep, { op: 'write' }> => step.op === 'write'
      )
      const last = writes[writes.length - 1]
      if (!last) continue
      expect(last.payload.kind).toBe(format === 'zero-byte' ? 'fake-image' : format)
      expect(last.payload.bytes).toBe(expectedBytes(format, size))
      expect(last.payload.width).toBe(PIXEL_SIZES[size]?.width)
      expect(last.payload.height).toBe(PIXEL_SIZES[size]?.height)
    }
  })

  it('direct, chunked and atomic writes are one step each', () => {
    for (const scenario of byMode('direct')) {
      expect(ops(scenario)).toEqual(['write'])
      expect((bodyOf(scenario)[0] as Extract<FsStep, { op: 'write' }>).chunks).toBeUndefined()
    }
    for (const chunks of [2, 4, 8]) {
      for (const scenario of byMode(`chunked-${chunks}`)) {
        const write = bodyOf(scenario)[0] as Extract<FsStep, { op: 'write' }>
        expect(ops(scenario)).toEqual(['write'])
        expect(write.chunks).toBe(chunks)
        expect([60, 120, 250]).toContain(write.chunkDelayMs)
      }
    }
    for (const scenario of byMode('atomic-rename')) expect(ops(scenario)).toEqual(['write-atomic'])
  })

  it('a download is a slow partial file renamed onto the final name', () => {
    for (const scenario of byMode('download-rename')) {
      const [write, move] = bodyOf(scenario) as [
        Extract<FsStep, { op: 'write' }>,
        Extract<FsStep, { op: 'move' }>
      ]
      expect(ops(scenario)).toEqual(['write', 'move'])
      expect(write.chunks).toBe(4)
      expect(write.path).toMatch(/\.(crdownload|part|download)$/)
      expect(move.from).toBe(write.path)
      expect(move.to).toBe(targetPath(scenario))
    }
  })

  it('copy-in copies a seeded source of the same format and size, move-in-stage goes through .stage', () => {
    const files = corpusOf(mediumPlan())
    for (const scenario of byMode('copy-in')) {
      const copy = bodyOf(scenario)[0] as Extract<FsStep, { op: 'copy' }>
      expect(ops(scenario)).toEqual(['copy'])
      expect(copy.from).toMatch(/^copy-sources\//)
      expect(copy.to).toBe(targetPath(scenario))
      expect(files.get(copy.from)?.payload.bytes).toBe(
        expectedBytes(String(scenario.dims.format), String(scenario.dims.size))
      )
    }
    for (const scenario of byMode('move-in-stage')) {
      const [write, move] = bodyOf(scenario) as [
        Extract<FsStep, { op: 'write' }>,
        Extract<FsStep, { op: 'move' }>
      ]
      expect(ops(scenario)).toEqual(['write', 'move'])
      expect(write.path).toMatch(/^\.stage\//)
      expect(move.from).toBe(write.path)
      expect(move.to).toBe(targetPath(scenario))
    }
  })

  it('a burst starts N distinct files of one directory in one parallel group', () => {
    for (const count of [2, 4, 8, 16]) {
      const rows = byMode(`burst-${count}`)
      expect(rows.length, `burst-${count}`).toBeGreaterThan(0)
      for (const scenario of rows) {
        expect(ops(scenario)).toEqual(['parallel'])
        const inner = flatSteps(scenario.steps)
        expect(inner).toHaveLength(count)
        expect(inner.every((step) => step.op === 'write')).toBe(true)
        const paths = inner.map((step) => (step as Extract<FsStep, { op: 'write' }>).path)
        expect(new Set(paths.map((path) => path.toLowerCase())).size).toBe(count)
        expect(new Set(paths.map(dirName)).size).toBe(1)
        expect(paths).toContain(targetPath(scenario))
      }
    }
  })

  it('overwrite, rename-after-create, create-then-delete and touch-empty have their own shapes', () => {
    for (const scenario of byMode('overwrite')) {
      const [first, , second] = bodyOf(scenario) as [
        Extract<FsStep, { op: 'write' }>,
        FsStep,
        Extract<FsStep, { op: 'write' }>
      ]
      expect(ops(scenario)).toEqual(['write', 'sleep', 'write'])
      expect(first.path).toBe(second.path)
      expect(first.payload).not.toEqual(second.payload)
    }
    for (const scenario of byMode('rename-after-create')) {
      const [write, , move] = bodyOf(scenario) as [
        Extract<FsStep, { op: 'write' }>,
        FsStep,
        Extract<FsStep, { op: 'move' }>
      ]
      expect(ops(scenario)).toEqual(['write', 'sleep', 'move'])
      expect(move.from).toBe(write.path)
      expect(scenario.checks.map((check) => [check.expect, check.target.path])).toEqual([
        ['present', move.to],
        ['absent', write.path]
      ])
    }
    for (const scenario of byMode('create-then-delete')) {
      const [write, , remove] = bodyOf(scenario) as [
        Extract<FsStep, { op: 'write' }>,
        FsStep,
        Extract<FsStep, { op: 'delete' }>
      ]
      expect(ops(scenario)).toEqual(['write', 'sleep', 'delete'])
      expect(remove.path).toBe(write.path)
      expect(
        scenario.checks.every(
          (check) => check.expect === 'absent' && check.target.path === write.path
        )
      ).toBe(true)
    }
    for (const scenario of byMode('touch-empty')) {
      expect(ops(scenario)).toEqual(['touch'])
      expect(scenario.dims.format).toBe('zero-byte')
    }
  })

  it('a new-dir placement makes its directories before the first write, parents first', () => {
    const rows = created().filter((scenario) => scenario.dims.placement === 'new-dir')
    expect(rows.length).toBeGreaterThan(10)
    for (const scenario of rows) {
      const made = scenario.steps
        .filter((step): step is Extract<FsStep, { op: 'mkdir' }> => step.op === 'mkdir')
        .map((step) => step.path)
      expect(made.length).toBeGreaterThan(0)
      expect(scenario.steps.slice(0, made.length).every((step) => step.op === 'mkdir')).toBe(true)
      made.forEach((path, index) => {
        expect(path.startsWith('fresh/')).toBe(true)
        if (index > 0) expect(path.startsWith(`${made[index - 1]}/`)).toBe(true)
      })
    }
  })
})

describe('change-image', () => {
  const changes = (): Scenario[] => ofClass(mediumPlan(), 'change-image')
  const byChange = (change: string): Scenario[] =>
    changes().filter((scenario) => scenario.dims.change === change)
  const first = (scenario: Scenario): FsStep => bodyOf(scenario)[0] as FsStep

  it('covers every change at least twice and starts from a seeded file', () => {
    const files = corpusOf(mediumPlan())
    expect([...new Set(changes().map((scenario) => scenario.dims.change))].sort()).toEqual(
      valueIds('change').sort()
    )
    for (const scenario of changes()) {
      const step = first(scenario)
      const source = step.op === 'move' ? step.from : 'path' in step ? step.path : ''
      expect(files.has(source), `${scenario.id} ${scenario.dims.change} ${source}`).toBe(true)
    }
  })

  it('rename, move and move-new-dir keep the content and check old and new names', () => {
    for (const scenario of byChange('rename')) {
      const move = first(scenario) as Extract<FsStep, { op: 'move' }>
      expect(dirName(move.to)).toBe(dirName(move.from))
      expect(baseName(move.to)).not.toBe(baseName(move.from))
      expect(scenario.checks.map((check) => [check.expect, check.target.path])).toEqual([
        ['present', move.to],
        ['absent', move.from]
      ])
    }
    for (const scenario of byChange('move')) {
      const move = first(scenario) as Extract<FsStep, { op: 'move' }>
      expect(dirName(move.to)).not.toBe(dirName(move.from))
      expect(baseName(move.to)).toBe(baseName(move.from))
      expect(scenario.checks.map((check) => [check.expect, check.target.path])).toEqual([
        ['present', move.to],
        ['absent', move.from]
      ])
    }
    for (const scenario of byChange('move-new-dir')) {
      const [mkdir, move] = scenario.steps as [
        Extract<FsStep, { op: 'mkdir' }>,
        Extract<FsStep, { op: 'move' }>
      ]
      expect(mkdir.op).toBe('mkdir')
      expect(mkdir.path).toMatch(/^fresh\//)
      expect(dirName(move.to)).toBe(mkdir.path)
    }
  })

  it('rename-case changes only the letter case and stays soft', () => {
    for (const scenario of byChange('rename-case')) {
      const move = first(scenario) as Extract<FsStep, { op: 'move' }>
      expect(baseName(move.to)).not.toBe(baseName(move.from))
      expect(baseName(move.to).toLowerCase()).toBe(baseName(move.from).toLowerCase())
      expect(scenario.checks).toHaveLength(1)
      expect(scenario.checks[0]?.tier).toBe('soft')
      expect(scenario.checks[0]?.topK).toBeGreaterThanOrEqual(20)
    }
  })

  it('overwrite, replace-atomic, delete-recreate and touch end with the file present under its own name', () => {
    const files = corpusOf(mediumPlan())
    for (const change of ['overwrite', 'replace-atomic', 'delete-recreate', 'touch']) {
      for (const scenario of byChange(change)) {
        const path = (first(scenario) as { path: string }).path
        expect(scenario.checks.map((check) => [check.expect, check.target.path])).toEqual([
          ['present', path]
        ])
        expect(
          leftInPlace(scenario.steps).has(path) || change === 'touch' || change === 'overwrite'
        ).toBe(true)
        if (change === 'overwrite' || change === 'replace-atomic') {
          const write = first(scenario) as Extract<FsStep, { op: 'write' | 'write-atomic' }>
          expect(write.payload.seed).not.toBe(files.get(path)?.payload.seed)
        }
      }
    }
    for (const scenario of byChange('delete-recreate'))
      expect(ops(scenario)).toEqual(['delete', 'write'])
  })

  it('delete is stale-index detection: one soft absent check on the deleted path', () => {
    for (const scenario of byChange('delete')) {
      const remove = first(scenario) as Extract<FsStep, { op: 'delete' }>
      expect(scenario.checks.map((check) => [check.expect, check.tier, check.target.path])).toEqual(
        [['absent', 'soft', remove.path]]
      )
    }
  })

  it('hidden and temporary renames are hard only because the traversal policy drops the new name', () => {
    for (const scenario of byChange('rename-to-hidden-name')) {
      const move = first(scenario) as Extract<FsStep, { op: 'move' }>
      expect(baseName(move.to)).toBe(`.${baseName(move.from)}`)
    }
    for (const scenario of byChange('rename-to-temporary-name')) {
      const move = first(scenario) as Extract<FsStep, { op: 'move' }>
      expect(move.to).toBe(`${move.from}.bak`)
    }
    for (const change of ['rename-to-hidden-name', 'rename-to-temporary-name']) {
      for (const scenario of byChange(change)) {
        const move = first(scenario) as Extract<FsStep, { op: 'move' }>
        const hard = scenario.checks.filter((check) => check.tier === 'hard')
        expect(hard.map((check) => [check.expect, check.target.path])).toEqual([
          ['absent', move.to]
        ])
        expect(excludedUnconditionally(move.to, ADMITTED_EXTENSIONS)).toBe(true)
      }
    }
  })

  it('restoring a temporary name starts from a seeded .bak file', () => {
    for (const scenario of byChange('restore-from-temporary-name')) {
      const move = first(scenario) as Extract<FsStep, { op: 'move' }>
      expect(move.from).toBe(`${move.to}.bak`)
      expect(scenario.checks.map((check) => [check.expect, check.target.path])).toEqual([
        ['present', move.to]
      ])
    }
  })
})

describe('ignore-image', () => {
  const rows = (plan: ScenarioPlan = ignorePlan()): Scenario[] => ofClass(plan, 'ignore-image')

  it('an ignore-only plan reaches every rule', () => {
    expect([...new Set(rows().map((scenario) => scenario.dims.rule))].sort()).toEqual(
      valueIds('rule').sort()
    )
  })

  it('every scenario pairs a visible control with one excluded file', () => {
    for (const scenario of [...rows(), ...rows(mediumPlan())]) {
      const [control, absent] = scenario.checks
      expect(scenario.checks).toHaveLength(2)
      expect(control?.expect).toBe('present')
      expect(absent?.expect).toBe('absent')
      expect(absent?.startAfterMs).toBe(3000)
      expect(targetPath(scenario, 0)).toMatch(/^ignored\/[^/]+\//)
      expect(targetPath(scenario, 0).split('/')[1]).toBe(targetPath(scenario, 1).split('/')[1])
      expect(targetPath(scenario, 0)).not.toBe(targetPath(scenario, 1))
      expect(leftInPlace(scenario.steps).has(targetPath(scenario, 0))).toBe(true)
    }
  })

  it('hard absent only where the traversal policy decides, soft where it depends on the neighbours', () => {
    for (const scenario of [...rows(), ...rows(mediumPlan())]) {
      const absent = scenario.checks[1] as Scenario['checks'][number]
      const rule = String(scenario.dims.rule)
      expect(absent.tier, rule).toBe(SOFT_RULES.test(rule) ? 'soft' : 'hard')
      if (absent.tier === 'hard')
        expect(
          excludedUnconditionally(absent.target.path as string, ADMITTED_EXTENSIONS),
          rule
        ).toBe(true)
    }
  })

  it('the excluded file really is shaped like the rule it cites', () => {
    const shapes: Record<string, (path: string, scenario: Scenario) => boolean> = {
      'hidden-name:dot-prefix': (path) => baseName(path).startsWith('.'),
      'hidden-name:tilde-prefix': (path) => baseName(path).startsWith('~'),
      'hidden-name:hash-prefix': (path) => baseName(path).startsWith('#'),
      'hidden-name:dollar-prefix': (path) => baseName(path).startsWith('$'),
      'system-metadata:appledouble': (path) => baseName(path).startsWith('._'),
      'temporary-name:tilde-suffix': (path) => baseName(path).endsWith('~'),
      'temporary-name:tmp': (path) => baseName(path).endsWith('.tmp'),
      'temporary-name:bak': (path) => baseName(path).endsWith('.bak'),
      'hidden-name:hidden-directory': (path) =>
        path
          .split('/')
          .slice(0, -1)
          .some((part) => part.startsWith('.')),
      'bundle-internal:app': (path) => /\.app\/Contents\/Resources\//.test(path),
      'bundle-internal:photoslibrary': (path) => /\.photoslibrary\/originals\//.test(path),
      'development-path:node_modules': (path) => path.includes('/node_modules/'),
      'development-path:pycache': (path) => path.includes('/__pycache__/'),
      'unsupported-extension:no-extension': (path) => !baseName(path).includes('.'),
      'unsupported-extension:not-whitelisted': (path) =>
        ['tif', 'ico', 'avif', 'jfif'].includes(lowerExt(path)),
      'scan-skips:beyond-max-depth': (path) => path.split('/').length - 1 > 24,
      'cache-path:project-tmp': (path) => path.includes('/proj/tmp/')
    }
    const seen = new Set<string>()
    for (const scenario of rows()) {
      const rule = String(scenario.dims.rule)
      const path = targetPath(scenario, 1)
      seen.add(rule)
      expect(shapes[rule]?.(path, scenario) ?? true, `${rule} ${path}`).toBe(true)
      if (rule.startsWith('scan-skips:symlink')) {
        const links = flatSteps(scenario.steps).filter(
          (step): step is Extract<FsStep, { op: 'symlink' }> => step.op === 'symlink'
        )
        expect(
          links.some((link) => path === link.path || path.startsWith(`${link.path}/`)),
          rule
        ).toBe(true)
      }
    }
    for (const rule of Object.keys(shapes)) expect(seen.has(rule), rule).toBe(true)
  })

  it('development-path rules write the project marker next to the output directory', () => {
    for (const scenario of rows().filter((row) =>
      /^(development-path:project-|cache-path:project-)/.test(String(row.dims.rule))
    )) {
      const markers = flatSteps(scenario.steps)
        .filter((step): step is Extract<FsStep, { op: 'write' }> => step.op === 'write')
        .map((step) => baseName(step.path))
      expect(
        markers.some((name) =>
          ['package.json', 'Cargo.toml', 'go.mod', 'Makefile', 'pom.xml', 'tsconfig.json'].includes(
            name
          )
        )
      ).toBe(true)
    }
  })
})

describe('search-created', () => {
  const links = (plan: ScenarioPlan): Array<[Scenario, Scenario]> => {
    const byId = new Map(plan.scenarios.map((scenario) => [scenario.id, scenario]))
    return ofClass(plan, 'search-created').map((scenario) => [
      scenario,
      byId.get(scenario.requires?.[0] as string) as Scenario
    ])
  }

  it('always requires one earlier create-image that leaves the very file it looks for', () => {
    const plan = mediumPlan()
    const used = new Set<string>()
    const pairs = links(plan)
    expect(pairs.length).toBeGreaterThan(30)
    for (const [scenario, partner] of pairs) {
      expect(scenario.requires).toHaveLength(1)
      expect(partner?.class).toBe('create-image')
      expect(scenario.index - partner.index).toBeGreaterThanOrEqual(MIN_CREATED_GAP)
      expect(partner.dims.writeMode).not.toBe('create-then-delete')
      for (const dim of ['format', 'nameStyle', 'placement', 'size', 'writeMode'])
        expect(scenario.dims[dim], dim).toBe(partner.dims[dim])
      expect(scenario.steps).toEqual([])
      expect(scenario.checks).toHaveLength(1)
      expect(scenario.checks[0]?.expect).toBe('present')
      expect(leftInPlace(partner.steps).has(targetPath(scenario))).toBe(true)
      expect(partner.checks.some((check) => check.target.path === targetPath(scenario))).toBe(true)
      expect(used.has(partner.id)).toBe(false)
      used.add(partner.id)
    }
  })

  it('only search-created scenarios require anything', () => {
    for (const scenario of mediumPlan().scenarios)
      if (scenario.class !== 'search-created') expect(scenario.requires).toBeUndefined()
  })

  it('keeps the gap for other sizes and seeds too', () => {
    for (const [count, seed] of [
      [30, 3],
      [50, 4],
      [120, 5],
      [333, 6]
    ] as const) {
      const plan = generatePlan(optionsFor(count, { seed }))
      for (const [scenario, partner] of links(plan)) {
        expect(scenario.index - partner.index, `${count}/${seed}`).toBeGreaterThanOrEqual(
          MIN_CREATED_GAP
        )
        expect(partner.class).toBe('create-image')
      }
    }
  })

  it('a plan too small for the gap simply has none, and still reaches its count', () => {
    for (const count of [1, 10, 21]) {
      const plan = generatePlan(optionsFor(count))
      expect(plan.scenarios).toHaveLength(count)
      expect(ofClass(plan, 'search-created')).toHaveLength(0)
    }
  })
})
