import { extname } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  fileFilterService,
  type FileFilterReason
} from '@talex-touch/utils/common/file-filter-service'
import {
  BLACKLISTED_BUNDLE_SUFFIXES,
  BLACKLISTED_FILE_PREFIXES,
  BLACKLISTED_FILE_SUFFIXES,
  CONTEXT_DEPENDENT_BLACKLISTED_DIRS,
  DEV_BLACKLISTED_DIRS,
  FILE_SCAN_MAX_DEPTH,
  SYSTEM_BLACKLISTED_DIRS,
  TEMP_BLACKLISTED_DIRS
} from '@talex-touch/utils/common/file-scan-constants'
import { WHITELISTED_EXTENSIONS } from '../../../src/main/modules/box-tool/addon/files/constants'
import { getFileTraversalExclusionReason } from '../../../src/main/modules/box-tool/addon/files/file-traversal-policy'
import type { FsStep, ScenarioPlan } from '../types'
import {
  ADMITTED_EXTENSIONS,
  DIMENSIONS,
  FILE_TYPE_EXTENSIONS,
  FORMAT_EXTENSIONS,
  valueIds
} from './dimensions'
import { buildName } from './names'
import { PlacementPool } from './placement'
import { generatePlan } from './plan'
import {
  buildIgnore,
  directoryNameProblem,
  excludedUnconditionally,
  fileNameProblem,
  type IgnoreBuild
} from './policy'
import { SEED, optionsFor } from './test-fixtures'

/** A place the indexer walks into; /tmp, /private and /var are system paths to it. */
const ROOT = '/Volumes/tuff-stress/corpus'

type Readdir = (directory: string) => Promise<string[]>

function readdirOf(relativePaths: readonly string[]): Readdir {
  const children = new Map<string, Set<string>>()
  for (const path of relativePaths) {
    const parts = path.split('/')
    parts.forEach((part, index) => {
      const parent = index === 0 ? ROOT : `${ROOT}/${parts.slice(0, index).join('/')}`
      const names = children.get(parent) ?? new Set<string>()
      names.add(part)
      children.set(parent, names)
    })
  }
  return async (directory) => [...(children.get(directory) ?? [])]
}

interface Verdict {
  scan: FileFilterReason | null
  incremental: FileFilterReason | null
}

/** The two ways a file reaches the index, in the order the app applies their checks. */
async function verdict(relative: string, readdir: Readdir): Promise<Verdict> {
  const path = `${ROOT}/${relative}`
  const name = relative.slice(relative.lastIndexOf('/') + 1)
  const extension = extname(name).toLowerCase()
  const target = { path, name, extension }
  const walk = await getFileTraversalExclusionReason(path, readdir)
  const unsupported = WHITELISTED_EXTENSIONS.has(extension) ? null : 'unsupported-extension'
  return {
    scan: walk ?? fileFilterService.getIndexExclusionReason(target) ?? unsupported,
    incremental: unsupported ?? fileFilterService.getManualIndexExclusionReason(target) ?? walk
  }
}

const admitted = (found: Verdict): boolean => found.scan === null && found.incremental === null
const excluded = (found: Verdict): boolean => found.scan !== null && found.incremental !== null

function stepsTree(steps: readonly FsStep[]): string[] {
  return steps.flatMap((step): string[] => {
    if (step.op === 'parallel') return stepsTree(step.steps)
    if (step.op === 'copy' || step.op === 'move') return [step.to]
    return 'path' in step ? [step.path] : []
  })
}

function planTree(plan: ScenarioPlan): Readdir {
  return readdirOf([
    ...plan.corpus.directories,
    ...plan.corpus.files.map((file) => file.path),
    ...plan.scenarios.flatMap((s) => stepsTree(s.steps))
  ])
}

function ignoreBuild(rule: string, serial: number): IgnoreBuild {
  const parts = buildName({ style: 'ascii-lower', serial, seed: SEED, ext: 'png' })
  return buildIgnore(rule, {
    token: parts.token,
    name: parts.name,
    serial,
    write: (path): FsStep => ({ op: 'write', path, payload: { kind: 'png', bytes: 64, seed: 1 } }),
    writeMarker: (path): FsStep => ({
      op: 'write',
      path,
      payload: { kind: 'text', bytes: 64, seed: 1, ext: 'txt' }
    })
  })
}

describe.skipIf(process.platform === 'win32')('the corpus root and the extension whitelist', () => {
  it('walks into the test root but not into /tmp or /var, which is why the runner needs a root of its own', async () => {
    expect(admitted(await verdict('control.png', readdirOf([])))).toBe(true)
    for (const system of ['/tmp/stress/a.png', '/var/stress/a.png']) {
      expect(await getFileTraversalExclusionReason(system, async () => [])).not.toBeNull()
    }
  })

  it('admits every extension the generator puts on an indexable file, in any letter case', async () => {
    const readdir = readdirOf([])
    for (const ext of ADMITTED_EXTENSIONS) {
      expect(WHITELISTED_EXTENSIONS.has(`.${ext}`), ext).toBe(true)
      expect(admitted(await verdict(`dir/name.${ext}`, readdir)), ext).toBe(true)
      expect(admitted(await verdict(`dir/NAME.${ext.toUpperCase()}`, readdir)), ext).toBe(true)
    }
  })

  it('keeps the extensions the not-whitelisted rule relies on out of the whitelist', () => {
    for (const ext of ['.tif', '.ico', '.avif', '.jfif'])
      expect(WHITELISTED_EXTENSIONS.has(ext), ext).toBe(false)
    expect(WHITELISTED_EXTENSIONS.has('.tiff')).toBe(true)
    expect(FORMAT_EXTENSIONS.tiff).toEqual(['tiff'])
  })

  it('lists only extensions that belong to a declared family or format', () => {
    const declared = new Set([
      ...Object.values(FILE_TYPE_EXTENSIONS).flat(),
      ...Object.values(FORMAT_EXTENSIONS).flat()
    ])
    expect([...ADMITTED_EXTENSIONS].sort()).toEqual([...declared].sort())
  })
})

describe.skipIf(process.platform === 'win32')(
  'ignore-image rules against the real FileFilterService',
  () => {
    const rules = valueIds('rule')
    const cited = (rule: string): string => rule.slice(0, rule.indexOf(':'))

    it('declares one layout for each rule and builds it without throwing', () => {
      for (const rule of rules)
        for (let serial = 0; serial < 8; serial += 1)
          expect(() => ignoreBuild(rule, serial), rule).not.toThrow()
    })

    it.each(rules.filter((rule) => !rule.startsWith('scan-skips:')))(
      '%s is excluded for the reason it cites, by the scan and by the incremental add',
      async (rule) => {
        for (let serial = 0; serial < 8; serial += 1) {
          const build = ignoreBuild(rule, serial)
          const found = await verdict(build.absentPath, readdirOf(stepsTree(build.steps)))
          expect(found.scan, `${rule} #${serial} scan: ${build.absentPath}`).toBe(cited(rule))
          expect(
            found.incremental,
            `${rule} #${serial} incremental: ${build.absentPath}`
          ).not.toBeNull()
          if (build.hard) expect(excluded(found), `${rule} is claimed hard`).toBe(true)
        }
      }
    )

    it('marks a rule hard only when the path alone decides it', () => {
      const soft = new Set(rules.filter((rule) => !ignoreBuild(rule, 0).hard))
      const expected = rules.filter((rule) =>
        /^(scan-skips|unsupported-extension):|:project-/.test(rule)
      )
      expect([...soft].sort()).toEqual([...expected].sort())
    })

    it('leaves symlinked and over-deep images to the scanner, which no path classification can see', async () => {
      for (const rule of ['scan-skips:symlink-to-file', 'scan-skips:symlink-to-directory']) {
        const build = ignoreBuild(rule, 1)
        expect(build.hard).toBe(false)
        expect(
          admitted(await verdict(build.absentPath, readdirOf(stepsTree(build.steps)))),
          rule
        ).toBe(true)
        expect(build.steps.some((step) => step.op === 'symlink')).toBe(true)
      }
      const deep = ignoreBuild('scan-skips:beyond-max-depth', 1)
      const depth = deep.absentPath.split('/').length - 1
      expect(depth).toBeGreaterThan(FILE_SCAN_MAX_DEPTH)
      expect(admitted(await verdict(deep.absentPath, readdirOf(stepsTree(deep.steps))))).toBe(true)
    })

    it('writes the project marker beside the excluded output folder, because that is what excludes it', async () => {
      for (const rule of rules.filter((item) => item.includes(':project-'))) {
        const build = ignoreBuild(rule, 2)
        const folder = build.absentPath.slice(0, build.absentPath.lastIndexOf('/'))
        const withMarker = await verdict(build.absentPath, readdirOf(stepsTree(build.steps)))
        const withoutMarker = await verdict(
          build.absentPath,
          readdirOf(
            stepsTree(build.steps).filter(
              (path) =>
                !/\/(package\.json|Cargo\.toml|go\.mod|Makefile|pom\.xml|tsconfig\.json)$/.test(
                  path
                )
            )
          )
        )
        expect(withMarker.scan, rule).not.toBeNull()
        expect(withoutMarker.scan, `${rule} without its marker in ${folder}`).toBeNull()
      }
    })
  }
)

describe.skipIf(process.platform === 'win32')('names and folders the generator places', () => {
  it('keeps every folder of the placement pool indexable, and the staging folder hidden', async () => {
    const pool = new PlacementPool(SEED)
    const directories = pool.directories()
    const readdir = readdirOf(directories)
    for (const directory of directories) {
      const found = await verdict(`${directory}/probe.png`, readdir)
      if (directory.split('/').includes('.stage')) expect(found.scan, directory).toBe('hidden-name')
      else expect(admitted(found), directory).toBe(true)
    }
    for (const id of valueIds('placement')) {
      const placement = pool.resolve(id, 'kobabi7')
      expect(
        admitted(
          await verdict(
            `${placement.dir ? `${placement.dir}/` : ''}probe.png`,
            readdirOf([...directories, ...placement.create])
          )
        ),
        id
      ).toBe(true)
    }
  })

  it('indexes names of every style under every admitted extension family', async () => {
    const readdir = readdirOf([])
    for (const style of valueIds('nameStyle')) {
      for (let serial = 0; serial < 12; serial += 1) {
        for (const ext of ['png', 'jpeg', 'heic', 'pdf', 'md']) {
          const parts = buildName({ style, serial, seed: SEED, ext })
          expect(admitted(await verdict(`album/${parts.name}`, readdir)), parts.name).toBe(true)
          expect(fileNameProblem(parts.name, ADMITTED_EXTENSIONS), parts.name).toBeNull()
        }
      }
    }
  })

  it('treats a name the same way the indexer does', async () => {
    const readdir = readdirOf([])
    const names = [
      'plain.png',
      '.hidden.png',
      '~tilde.png',
      '#hash.png',
      '$dollar.png',
      '._apple.png',
      'name.png~',
      'name.png.tmp',
      'name.png.bak',
      'name.png.old',
      'name.png.orig',
      'name.png.swp',
      'name.png.swo',
      'name.png.temp',
      'name.png.backup',
      'noextension',
      'name.tif',
      'name.avif',
      'name.localized',
      'Thumbs.db',
      '.DS_Store',
      'name.sqlite',
      'name.db'
    ]
    for (const name of names) {
      const indexed = admitted(await verdict(`album/${name}`, readdir))
      expect(fileNameProblem(name, ADMITTED_EXTENSIONS) === null, name).toBe(indexed)
    }
  })

  it('restates every prefix, suffix and bundle suffix the indexer excludes', () => {
    for (const prefix of BLACKLISTED_FILE_PREFIXES)
      expect(fileNameProblem(`${prefix}name.png`, ADMITTED_EXTENSIONS), prefix).not.toBeNull()
    for (const suffix of BLACKLISTED_FILE_SUFFIXES)
      expect(fileNameProblem(`name.png${suffix}`, ADMITTED_EXTENSIONS), suffix).not.toBeNull()
    for (const suffix of BLACKLISTED_BUNDLE_SUFFIXES) {
      expect(directoryNameProblem(`Name${suffix}`), suffix).not.toBeNull()
      expect(
        excludedUnconditionally(`Name${suffix}/inner/name.png`, ADMITTED_EXTENSIONS),
        suffix
      ).toBe(true)
    }
  })

  it('restates every directory name the indexer excludes by name', () => {
    const names = new Set([
      ...DEV_BLACKLISTED_DIRS,
      ...TEMP_BLACKLISTED_DIRS,
      ...SYSTEM_BLACKLISTED_DIRS,
      ...CONTEXT_DEPENDENT_BLACKLISTED_DIRS
    ])
    for (const name of names) {
      if (/[/%]/.test(name)) continue
      expect(directoryNameProblem(name), name).not.toBeNull()
    }
  })

  it('agrees with the indexer about which ancestors exclude a path whatever sits beside them', async () => {
    const readdir = readdirOf([])
    const paths = [
      'a/node_modules/x/name.png',
      'a/__pycache__/name.png',
      'a/site-packages/name.png',
      'a/uvcache/name.png',
      '.hidden/name.png',
      'a/.git/name.png',
      'App.app/Contents/name.png',
      'Pics.photoslibrary/originals/name.png',
      'a/b/name.png',
      'My Photos/Summer Trip/name.png'
    ]
    for (const path of paths) {
      expect(excludedUnconditionally(path, ADMITTED_EXTENSIONS), path).toBe(
        excluded(await verdict(path, readdir))
      )
    }
  })
})

describe.skipIf(process.platform === 'win32')(
  'a generated plan against the real FileFilterService',
  () => {
    const plan = generatePlan(optionsFor(1200))

    it('finds every present target indexable and every hard absent target excluded', async () => {
      const readdir = planTree(plan)
      const seen = { present: 0, hardAbsent: 0 }
      for (const scenario of plan.scenarios) {
        for (const check of scenario.checks) {
          if (check.target.kind !== 'file') continue
          const path = check.target.path as string
          if (check.expect === 'present') {
            seen.present += 1
            expect(admitted(await verdict(path, readdir)), `${scenario.id} ${path}`).toBe(true)
            expect(
              excludedUnconditionally(path, ADMITTED_EXTENSIONS),
              `${scenario.id} ${path}`
            ).toBe(false)
          } else if (check.tier === 'hard') {
            seen.hardAbsent += 1
            expect(excluded(await verdict(path, readdir)), `${scenario.id} ${path}`).toBe(true)
          }
        }
      }
      expect(seen.present).toBeGreaterThan(800)
      expect(seen.hardAbsent).toBeGreaterThan(20)
    })

    it('puts every corpus file where the indexer will read it', async () => {
      const readdir = planTree(plan)
      for (const file of plan.corpus.files) {
        if (
          file.path.startsWith('.stage/') ||
          !ADMITTED_EXTENSIONS.has(extname(file.path).slice(1).toLowerCase())
        )
          continue
        expect(admitted(await verdict(file.path, readdir)), file.path).toBe(true)
      }
    })
  }
)

describe('the rule dimension', () => {
  it('cites a reason the indexer has, or the scanner behaviour it relies on', () => {
    const reasons = new Set([
      'hidden-name',
      'temporary-name',
      'system-metadata',
      'internal-database',
      'bundle-internal',
      'system-path',
      'development-path',
      'cache-path',
      'excluded-path',
      'unsupported-extension',
      'scan-skips'
    ])
    for (const [rule] of DIMENSIONS.rule)
      expect(reasons.has(rule.slice(0, rule.indexOf(':'))), rule).toBe(true)
  })
})
