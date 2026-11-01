import { describe, expect, it } from 'vitest'
import { LEVEL_KEYS } from '../monitor/thresholds'
import { parseArgs, parseThresholds, UsageError } from './args'
import { buildLayout, isValidRunId, newRunId, resolveResumeTarget } from './layout'
import { resolveProfile } from './profiles'

describe('parseArgs', () => {
  it('maps no command and --help to help', () => {
    expect(parseArgs([])).toEqual({ command: 'help' })
    expect(parseArgs(['run', '--help'])).toEqual({ command: 'help' })
  })

  it('parses a run with every option, in both = and space forms', () => {
    const parsed = parseArgs([
      'run',
      '--profile',
      'full',
      '--seed=7',
      '--count',
      '300',
      '--embedding',
      'on',
      '--ui=show',
      '--concurrency',
      '4',
      '--burst-concurrency=12',
      '--qps',
      '8.5',
      '--nice',
      '5',
      '--resume',
      '20261030T010203Z-ab12',
      '--keep',
      '--corpus-root',
      '/Users/Shared/x/corpus/',
      '--run-dir',
      '/private/tmp/tuff-stress/custom',
      '--thresholds',
      'mainLoopBlockMs=200:600,sampleOnBlockMs=250'
    ])
    expect(parsed).toEqual({
      command: 'run',
      options: {
        profile: 'full',
        seed: 7,
        count: 300,
        embedding: 'on',
        ui: 'show',
        concurrency: 4,
        burstConcurrency: 12,
        qps: 8.5,
        nice: 5,
        resume: '20261030T010203Z-ab12',
        keep: true,
        corpusRoot: '/Users/Shared/x/corpus',
        runDir: '/private/tmp/tuff-stress/custom',
        thresholds: { mainLoopBlockMs: { warn: 200, fail: 600 }, sampleOnBlockMs: 250 },
        seedTimeoutSec: 1200,
        searchTimeoutMs: 8000
      }
    })
  })

  it('applies the documented defaults', () => {
    expect(parseArgs(['run'])).toEqual({
      command: 'run',
      options: {
        profile: 'smoke',
        seed: 1,
        embedding: 'off',
        ui: 'hidden',
        keep: false,
        qps: 15,
        nice: 10,
        seedTimeoutSec: 1200,
        searchTimeoutMs: 8000
      }
    })
    expect(parseArgs(['gen'])).toEqual({ command: 'gen', options: { seed: 1, count: 10_000 } })
  })

  it.each([
    [['run', '--profile', 'huge'], /--profile must be one of/],
    [['run', '--bogus', '1'], /unknown option --bogus/],
    [['run', '--seed'], /--seed needs a value/],
    [['run', '--seed', '--keep'], /--seed needs a value/],
    [['run', '--count', 'ten'], /must be an integer/],
    [['run', '--count', '0'], /between 1/],
    [['run', '--seed', '1', '--seed', '2'], /given twice/],
    [['run', '--keep=maybe'], /takes no value/],
    [['run', '--corpus-root', 'relative/dir'], /absolute path/],
    [['run', 'extra'], /no positional arguments/],
    [['doctor', '--embedding', 'maybe'], /--embedding must be one of/],
    [['report'], /exactly one run directory/],
    [['report', 'a', 'b'], /exactly one run directory/],
    [['frobnicate'], /unknown command/]
  ])('rejects %j', (argv, message) => {
    expect(() => parseArgs(argv as string[])).toThrow(UsageError)
    expect(() => parseArgs(argv as string[])).toThrow(message)
  })

  it('takes --nice for run and probe, 0 to 19, and nowhere else', () => {
    const nice = (argv: string[]): number | undefined => {
      const parsed = parseArgs(argv)
      return parsed.command === 'run' || parsed.command === 'probe'
        ? parsed.options.nice
        : undefined
    }
    expect(nice(['run', '--nice', '0'])).toBe(0)
    expect(nice(['run', '--nice=19'])).toBe(19)
    expect(nice(['probe'])).toBe(10)
    expect(nice(['probe', '--nice', '3'])).toBe(3)
    expect(() => parseArgs(['run', '--nice', '20'])).toThrow(/--nice must be between 0 and 19/)
    expect(() => parseArgs(['probe', '--nice', '-1'])).toThrow(/--nice must be between 0 and 19/)
    expect(() => parseArgs(['doctor', '--nice', '5'])).toThrow(/unknown option --nice/)
    expect(() => parseArgs(['gen', '--nice', '5'])).toThrow(/unknown option --nice/)
  })

  it('takes --apps-file for run, gen and probe, and only there', () => {
    expect(parseArgs(['run', '--apps-file', 'apps.json']).command).toBe('run')
    const run = parseArgs(['run', '--apps-file=/x/apps.json'])
    expect(run.command === 'run' && run.options.appsFile).toBe('/x/apps.json')
    const gen = parseArgs(['gen', '--apps-file', 'apps.json', '--seed', '3'])
    expect(gen).toEqual({
      command: 'gen',
      options: { seed: 3, count: 10_000, appsFile: 'apps.json' }
    })
    const probe = parseArgs(['probe', '--apps-file', 'a.json', '--keep'])
    expect(probe).toEqual({
      command: 'probe',
      options: { embedding: 'off', ui: 'hidden', keep: true, nice: 10, appsFile: 'a.json' }
    })
    expect(() => parseArgs(['doctor', '--apps-file', 'a.json'])).toThrow(
      /unknown option --apps-file/
    )
    expect(() => parseArgs(['run', '--apps-file', ' '])).toThrow(/needs a file path/)
    expect(
      parseArgs(['run']).command === 'run' &&
        'appsFile' in (parseArgs(['run']) as { options: object }).options
    ).toBe(false)
  })

  it('takes the report directory as the positional', () => {
    expect(parseArgs(['report', '/private/tmp/tuff-stress/x'])).toEqual({
      command: 'report',
      options: { runDir: '/private/tmp/tuff-stress/x' }
    })
  })
})

describe('parseThresholds', () => {
  it('reads warn:fail pairs and single values', () => {
    expect(parseThresholds('cpuPct=150:250, rssMb=2000:3000,sampleOnBlockMs=100')).toEqual({
      cpuPct: { warn: 150, fail: 250 },
      rssMb: { warn: 2000, fail: 3000 },
      sampleOnBlockMs: 100
    })
  })

  it('accepts a ratio pair as a fraction', () => {
    expect(parseThresholds('frameOver20msRatio=0.03:0.08')).toEqual({
      frameOver20msRatio: { warn: 0.03, fail: 0.08 }
    })
  })

  it.each(LEVEL_KEYS)('accepts an override of %s, every level the monitor knows', (key) => {
    expect(parseThresholds(`${key}=1:2`)).toEqual({ [key]: { warn: 1, fail: 2 } })
  })

  it.each([
    ['nope=1:2', /unknown threshold/],
    ['cpuPct=250', /warn:fail/],
    ['cpuPct=300:200', /must not exceed/],
    ['cpuPct=a:b', /warn:fail/],
    ['cpuPct', /not key=value/],
    ['sampleOnBlockMs=-1', /non-negative/],
    ['cpuPct=1:2,cpuPct=3:4', /given twice/]
  ])('rejects %s', (text, message) => {
    expect(() => parseThresholds(text)).toThrow(message)
  })
})

describe('profiles', () => {
  it('smoke and full share the 85/15 steady/burst split with 6 and 24 in flight', () => {
    expect(resolveProfile('smoke', {}, { smoke: 200, full: 10_000 })).toMatchObject({
      count: 200,
      steadyConcurrency: 6,
      burstConcurrency: 24,
      steadyShare: 0.85
    })
    expect(resolveProfile('full', {}, { smoke: 200, full: 10_000 }).count).toBe(10_000)
  })

  it('burst runs everything at burst concurrency with a create-image heavy mix', () => {
    const burst = resolveProfile('burst')
    expect(burst).toMatchObject({ steadyConcurrency: 24, burstConcurrency: 24, steadyShare: 0 })
    expect(burst.mix?.['create-image']).toBeGreaterThan(burst.mix?.['search-file'] ?? 0)
    expect(burst.mix?.['search-app']).toBe(0)
  })

  it('lets overrides win and rejects nonsense', () => {
    expect(
      resolveProfile('smoke', { count: 20, concurrency: 2, burstConcurrency: 3 })
    ).toMatchObject({
      count: 20,
      steadyConcurrency: 2,
      burstConcurrency: 3
    })
    expect(() => resolveProfile('smoke', { count: 0 })).toThrow(RangeError)
    expect(() => resolveProfile('smoke', { concurrency: 0 })).toThrow(RangeError)
  })
})

describe('layout', () => {
  it('derives every path from the run id and keeps the corpus outside /private', () => {
    const layout = buildLayout({ runId: '20261030T010203Z-ab12' })
    expect(layout.runDir).toBe('/private/tmp/tuff-stress/20261030T010203Z-ab12')
    expect(layout.profileDir).toBe(`${layout.runDir}/profile`)
    expect(layout.logsDir).toBe(`${layout.runDir}/profile/tuff-dev/logs`)
    expect(layout.appLogFile).toBe(`${layout.runDir}/evidence/app-stdout.log`)
    expect(layout.corpusRoot).toBe('/Users/Shared/tuff-stress/20261030T010203Z-ab12/corpus')
    expect(layout.corpusOwnedDir).toBe('/Users/Shared/tuff-stress/20261030T010203Z-ab12')
    expect(layout.corpusRoot.startsWith('/private')).toBe(false)
  })

  it('honours an explicit corpus root without claiming ownership of its parent', () => {
    const layout = buildLayout({
      runId: 'abc-123',
      corpusRoot: '/Volumes/Ext/bench',
      runDir: '/private/tmp/x'
    })
    expect(layout.corpusRoot).toBe('/Volumes/Ext/bench')
    expect(layout.corpusOwnedDir).toBeNull()
    expect(layout.runDir).toBe('/private/tmp/x')
  })

  it('builds sortable UTC run ids and rejects ids that could escape a directory', () => {
    expect(newRunId(new Date('2026-10-30T18:15:30.123Z'), 'a1b2')).toBe('20261030T181530Z-a1b2')
    expect(isValidRunId('20261030T181530Z-a1b2')).toBe(true)
    for (const bad of ['', 'a', '../x', 'a/b', '..', '.hidden', 'a b'])
      expect(isValidRunId(bad)).toBe(false)
    expect(() => buildLayout({ runId: '../etc' })).toThrow(/invalid run id/)
  })

  it('resolves --resume as either a run id or a directory', () => {
    expect(resolveResumeTarget('abc-123')).toEqual({
      runId: 'abc-123',
      runDir: '/private/tmp/tuff-stress/abc-123'
    })
    expect(resolveResumeTarget('/somewhere/else/abc-123')).toEqual({
      runId: 'abc-123',
      runDir: '/somewhere/else/abc-123'
    })
  })
})
