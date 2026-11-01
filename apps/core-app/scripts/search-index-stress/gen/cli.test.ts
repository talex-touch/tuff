import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { Scenario, ScenarioPlan } from '../types'
import { describePlan } from './describe'
import { runCli } from './main'
import { generatePlan } from './plan'
import { APPS, scratchDir } from './test-fixtures'

const dir = scratchDir('gen-cli-')
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function run(...argv: string[]): { code: number; out: string; err: string } {
  const out: string[] = []
  const err: string[] = []
  const code = runCli(argv, { out: (text) => out.push(text), err: (text) => err.push(text) })
  return { code, out: out.join('\n'), err: err.join('\n') }
}

function write(name: string, content: unknown): string {
  const path = join(dir, name)
  writeFileSync(path, typeof content === 'string' ? content : JSON.stringify(content))
  return path
}

const read = (path: string): ScenarioPlan => JSON.parse(readFileSync(path, 'utf8')) as ScenarioPlan

describe('generate', () => {
  it('writes the plan to --out and reports its size on stderr', () => {
    const out = join(dir, 'plan.json')
    const result = run('generate', '--seed', '7', '--count', '40', '--out', out)
    expect(result.code).toBe(0)
    expect(result.out).toBe('')
    expect(result.err).toMatch(
      /^plan: 40 scenarios, corpus \d+ files \/ \d+ bytes, \d+ bytes of JSON$/
    )
    const plan = read(out)
    expect(plan.scenarios).toHaveLength(40)
    expect(JSON.stringify(plan)).toBe(
      JSON.stringify(generatePlan({ seed: 7, count: 40, apps: [] }))
    )
  })

  it('prints the plan on stdout without --out', () => {
    const result = run('generate', '--seed', '7', '--count', '12')
    expect(result.code).toBe(0)
    expect((JSON.parse(result.out) as ScenarioPlan).scenarios).toHaveLength(12)
  })

  it('takes the installed apps from --apps-file', () => {
    const apps = write('apps.json', ['Safari', '微信', 'Notes'])
    const out = join(dir, 'with-apps.json')
    expect(
      run('generate', '--seed', '3', '--count', '60', '--apps-file', apps, '--out', out).code
    ).toBe(0)
    const plan = read(out)
    expect(plan.options.apps).toEqual(['Safari', '微信', 'Notes'])
    const used = new Set(
      plan.scenarios.filter((row) => row.class === 'search-app').map((row) => row.dims.app)
    )
    expect(used.size).toBeGreaterThan(0)
    for (const app of used) expect(['Safari', '微信', 'Notes']).toContain(app)
  })

  it('takes class weights from --mix', () => {
    const out = join(dir, 'mixed.json')
    const apps = write('apps-for-mix.json', APPS)
    expect(
      run(
        'generate',
        '--seed',
        '2',
        '--count',
        '100',
        '--apps-file',
        apps,
        '--mix',
        'create-image=70,search-app=0',
        '--out',
        out
      ).code
    ).toBe(0)
    const plan = read(out)
    const count = (cls: string): number => plan.scenarios.filter((row) => row.class === cls).length
    expect(count('search-app')).toBe(0)
    expect(count('create-image')).toBeGreaterThan(count('search-file') * 2)
    expect(plan.options.mix).toEqual({ 'create-image': 70, 'search-app': 0 })
  })

  it.each([
    ['unknown class in --mix', ['--mix', 'bogus=3'], /bad --mix entry: bogus=3/],
    ['--mix without a weight', ['--mix', 'search-app'], /bad --mix entry: search-app/],
    ['non-numeric --mix weight', ['--mix', 'search-app=lots'], /bad --mix entry: search-app=lots/],
    ['--seed that is not a number', ['--seed', 'x'], /seed must be an integer/],
    ['--seed that is not an integer', ['--seed', '1.5'], /seed must be an integer/]
  ] as Array<[string, string[], RegExp]>)('%s exits 2 with a message', (_name, extra, message) => {
    const result = run('generate', '--seed', '1', '--count', '10', ...extra)
    expect(result.code).toBe(2)
    expect(result.err).toMatch(message)
    expect(result.out).toBe('')
  })

  it('exits 2 when --count is missing or negative', () => {
    expect(run('generate', '--seed', '1')).toMatchObject({ code: 2 })
    expect(run('generate', '--seed', '1', '--count=-4').err).toMatch(
      /count must be a non-negative integer/
    )
    expect(run('generate', '--seed', '1', '--count', '-4').code).toBe(2)
  })

  it('exits 2 for an --apps-file that is not a JSON array of strings, or does not exist', () => {
    for (const [name, content] of [
      ['object.json', { a: 1 }],
      ['numbers.json', [1, 2]],
      ['broken.json', '[not json']
    ] as const) {
      const result = run(
        'generate',
        '--seed',
        '1',
        '--count',
        '10',
        '--apps-file',
        write(name, content)
      )
      expect(result.code, name).toBe(2)
      expect(result.err.length, name).toBeGreaterThan(0)
    }
    expect(
      run('generate', '--seed', '1', '--count', '10', '--apps-file', join(dir, 'missing.json')).err
    ).toMatch(/ENOENT/)
  })

  it('rejects an unknown option', () => {
    expect(run('generate', '--seed', '1', '--count', '10', '--frobnicate').code).toBe(2)
  })
})

describe('validate', () => {
  const good = generatePlan({ seed: 11, count: 60, apps: APPS })
  const goodFile = write('good.json', good)

  it('says valid and exits 0 for a generated plan', () => {
    expect(run('validate', goodFile)).toEqual({ code: 0, out: 'valid', err: '' })
  })

  it('exits 1 and lists the problems for a plan that was damaged after generation', () => {
    const broken = JSON.parse(JSON.stringify(good)) as ScenarioPlan
    const victim = broken.scenarios[3] as Scenario
    broken.count = 61
    victim.index = 99
    const result = run('validate', write('broken.json', broken))
    const problems = Number(/^(\d+) problems$/.exec(result.out)?.[1])
    expect(result.code).toBe(1)
    expect(problems).toBeGreaterThanOrEqual(3)
    expect(result.err.split('\n')).toHaveLength(problems)
    expect(result.err).toMatch(/plan\.count is 61/)
    expect(result.err).toMatch(/index 99 is not its position 3/)
  })

  it('prints at most 50 problem lines but reports the full count', () => {
    const broken = JSON.parse(JSON.stringify(good)) as ScenarioPlan
    for (const scenario of broken.scenarios) scenario.dims = {}
    const result = run('validate', write('wrecked.json', broken))
    expect(result.code).toBe(1)
    expect(result.err.split('\n')).toHaveLength(50)
    expect(Number(/^(\d+) problems$/.exec(result.out)?.[1])).toBeGreaterThan(50)
  })

  it('exits 2 when the file is missing or is not JSON', () => {
    expect(run('validate', join(dir, 'absent.json')).code).toBe(2)
    expect(run('validate', write('text.json', 'hello')).code).toBe(2)
  })
})

describe('describe', () => {
  it('prints the description as JSON', () => {
    const plan = generatePlan({ seed: 11, count: 60, apps: APPS })
    const result = run('describe', write('described.json', plan))
    expect(result.code).toBe(0)
    const description = JSON.parse(result.out) as ReturnType<typeof describePlan>
    expect(description).toEqual(JSON.parse(JSON.stringify(describePlan(plan))))
    expect(description.distinct).toMatchObject({ scenarios: 60, ids: 60, tuples: 60 })
  })
})

describe('usage', () => {
  it.each([[[]], [['frobnicate']], [['describe']], [['validate']]] as Array<[string[]]>)(
    '%j prints the usage and exits 2',
    (argv) => {
      const result = run(...argv)
      expect(result.code).toBe(2)
      expect(result.err).toMatch(/usage:/)
      expect(result.err).toMatch(/generate --seed N --count N/)
      expect(result.out).toBe('')
    }
  )
})
