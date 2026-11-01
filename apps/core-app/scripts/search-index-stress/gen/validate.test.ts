import { describe, expect, it } from 'vitest'
import type {
  FsStep,
  PayloadSpec,
  Scenario,
  ScenarioClass,
  ScenarioPlan,
  SearchCheck
} from '../types'
import { CLASSES, generatePlan } from './plan'
import { isHardStyle } from './queries'
import { PrefixIndex } from './registry'
import { validatePlan } from './validate'
import { cloneOf, mediumPlan, optionsFor, smokePlan } from './test-fixtures'

let ignoring: ScenarioPlan | undefined
const ONLY_IGNORE = Object.fromEntries(CLASSES.map((cls) => [cls, cls === 'ignore-image' ? 1 : 0]))
const ignorePlan = (): ScenarioPlan =>
  (ignoring ??= generatePlan(optionsFor(120, { mix: ONLY_IGNORE })))

const PAYLOAD: PayloadSpec = { kind: 'png', bytes: 2048, seed: 1 }

function find(
  plan: ScenarioPlan,
  cls: ScenarioClass,
  test: (scenario: Scenario) => boolean = () => true
): Scenario {
  const found = plan.scenarios.find((scenario) => scenario.class === cls && test(scenario))
  if (!found) throw new Error(`no ${cls} scenario matches in the plan`)
  return found
}

const firstCheck = (scenario: Scenario): SearchCheck => scenario.checks[0] as SearchCheck
const writeOf = (scenario: Scenario): Extract<FsStep, { op: 'write' }> =>
  scenario.steps.find(
    (step): step is Extract<FsStep, { op: 'write' }> => step.op === 'write'
  ) as Extract<FsStep, { op: 'write' }>

function problemsAfter(
  mutate: (plan: ScenarioPlan) => void,
  base: () => ScenarioPlan = smokePlan
): string[] {
  const plan = cloneOf(base())
  mutate(plan)
  return validatePlan(plan)
}

function expectProblem(
  mutate: (plan: ScenarioPlan) => void,
  expected: RegExp,
  base: () => ScenarioPlan = smokePlan
): void {
  const problems = problemsAfter(mutate, base)
  expect(
    problems.some((problem) => expected.test(problem)),
    `${expected} not among: ${problems.slice(0, 4).join(' | ')}`
  ).toBe(true)
}

describe('validatePlan accepts what the generator makes', () => {
  it('smoke, medium and ignore-only plans are valid and validation does not touch the plan', () => {
    for (const plan of [smokePlan(), mediumPlan(), ignorePlan()]) {
      const before = JSON.stringify(plan)
      expect(validatePlan(plan)).toEqual([])
      expect(JSON.stringify(plan)).toBe(before)
    }
  })
})

describe('plan-level rules', () => {
  it('rejects a wrong count or mismatching options', () => {
    expectProblem((plan) => void (plan.count = 201), /plan\.count is 201 but the plan holds 200/)
    expectProblem((plan) => void (plan.options.seed += 1), /plan\.options do not match/)
  })

  it('rejects wrong positions, unknown classes, duplicate ids and ids that do not match their content', () => {
    expectProblem(
      (plan) => void ((plan.scenarios[3] as Scenario).index = 99),
      /index 99 is not its position 3/
    )
    expectProblem(
      (plan) => void ((plan.scenarios[0] as Scenario).class = 'bogus' as ScenarioClass),
      /unknown class bogus/
    )
    expectProblem(
      (plan) => void ((plan.scenarios[7] as Scenario).id = (plan.scenarios[6] as Scenario).id),
      /duplicate id/
    )
    expectProblem(
      (plan) => void ((plan.scenarios[7] as Scenario).id = (plan.scenarios[6] as Scenario).id),
      /only 199 distinct scenario ids for 200/
    )
    expectProblem(
      (plan) => void (find(plan, 'search-file').id = 'search-file-000000000000'),
      /id does not match the scenario content/
    )
  })

  it('counts distinct (class, dims) tuples, so a repeated situation cannot hide', () => {
    const repeat = (plan: ScenarioPlan): void => {
      const [first, second] = plan.scenarios.filter(
        (scenario) => scenario.class === 'search-file'
      ) as [Scenario, Scenario]
      second.dims = { ...first.dims }
    }
    expectProblem(repeat, /same class and dimensions as an earlier scenario/)
    expectProblem(repeat, /only 199 distinct \(class, dims\) tuples for 200 scenarios/)
  })

  it('stops listing after 500 problems and counts the rest', () => {
    const problems = problemsAfter((plan) =>
      plan.scenarios.forEach((scenario) => {
        scenario.dims = {}
        scenario.checks = []
      })
    )
    expect(problems).toHaveLength(501)
    expect(problems[500]).toMatch(/^\.\.\. and \d+ more problems$/)
  })
})

describe('dimension rules', () => {
  it('rejects missing, unknown, disallowed and forbidden values', () => {
    expectProblem(
      (plan) => void delete find(plan, 'search-file').dims.query,
      /do not match the search-file dimensions/
    )
    expectProblem(
      (plan) => void (find(plan, 'search-image').dims.size = 'gigantic'),
      /unknown size value gigantic/
    )
    expectProblem(
      (plan) => void (find(plan, 'search-image').dims.size = 'xlarge'),
      /size=xlarge is not allowed in search-image/
    )
    expectProblem(
      (plan) => void (find(plan, 'search-app').dims.app = 'Nonexistent App'),
      /is not in options\.apps/
    )
    expectProblem((plan) => {
      const scenario = find(plan, 'create-image')
      scenario.dims.writeMode = 'burst-2'
      scenario.dims.size = 'xlarge'
    }, /forbidden combination/)
    expectProblem((plan) => {
      const scenario = find(plan, 'create-image')
      scenario.dims.size = 'wide'
      scenario.dims.format = 'svg'
    }, /forbidden combination/)
  })
})

describe('step rules', () => {
  const withStep = (step: FsStep) => (plan: ScenarioPlan) =>
    void find(plan, 'create-image').steps.unshift(step)
  const writing = (path: string): FsStep => ({ op: 'write', path, payload: PAYLOAD })

  it.each([
    ['dot-dot', '../outside.png', /bad path component/],
    ['embedded dot-dot', 'fresh/../../b.png', /bad path component/],
    ['absolute', '/etc/passwd.png', /absolute path/],
    ['drive letter', 'C:/Windows/x.png', /absolute path/],
    ['backslash', 'fresh\\x.png', /backslash in path/],
    ['NUL', 'fresh/x\0.png', /NUL in path/],
    ['256-byte component', `fresh/${'a'.repeat(252)}.png`, /component over 255 bytes/],
    ['empty component', 'fresh//x.png', /bad path component/],
    ['missing parent', 'no-such-dir/x.png', /parent directory does not exist/]
  ])('rejects a write to %s', (_name, path, expected) => {
    expectProblem(withStep(writing(path)), expected)
  })

  it('rejects symlinks that point out of the corpus, copies and moves from nowhere, and bad deletes', () => {
    expectProblem(
      withStep({ op: 'symlink', path: 'fresh/link', target: '../secret' }),
      /bad path component/
    )
    expectProblem(
      withStep({ op: 'symlink', path: 'fresh/link', target: '/etc/hosts' }),
      /absolute path/
    )
    expectProblem(
      withStep({ op: 'symlink', path: 'fresh/link', target: 'fresh/ghost' }),
      /symlink target does not exist/
    )
    expectProblem(
      withStep({ op: 'copy', from: 'copy-sources/missing.png', to: 'fresh/x.png' }),
      /copy source does not exist/
    )
    expectProblem(
      withStep({ op: 'move', from: 'fresh/ghost.png', to: 'fresh/ghost2.png' }),
      /move source does not exist/
    )
    expectProblem(withStep({ op: 'delete', path: 'fresh/ghost.png' }), /delete of a missing path/)
    expectProblem(withStep({ op: 'mkdir', path: 'fresh' }), /mkdir on an existing directory/)
    expectProblem(
      withStep({ op: 'move', from: '../a.png', to: 'fresh/a.png' }),
      /bad path component/
    )
  })

  it('rejects bad sleeps, chunk counts and payloads', () => {
    expectProblem(withStep({ op: 'sleep', ms: 999_999 }), /sleep out of range/)
    expectProblem(withStep({ op: 'sleep', ms: -1 }), /sleep out of range/)
    expectProblem(
      withStep({ ...writing('fresh/c.png'), chunks: 0 } as FsStep),
      /bad chunk count: 0/
    )
    expectProblem(
      withStep({ op: 'write', path: 'fresh/c.png', payload: { ...PAYLOAD, bytes: -1 } }),
      /payload bytes out of range/
    )
    expectProblem(
      withStep({
        op: 'write',
        path: 'fresh/c.png',
        payload: { ...PAYLOAD, kind: 'exe' as PayloadSpec['kind'] }
      }),
      /unknown payload kind exe/
    )
    expectProblem(
      withStep({ op: 'write', path: 'fresh/c.png', payload: { ...PAYLOAD, width: 10 } }),
      /needs both width and height/
    )
    expectProblem(
      withStep({
        op: 'write',
        path: 'fresh/c.png',
        payload: { ...PAYLOAD, width: 99_999, height: 1 }
      }),
      /pixel size out of range/
    )
  })

  it('walks into parallel groups and rejects nesting, empty groups and steps that depend on a sibling', () => {
    const inner = (steps: FsStep[]): FsStep => ({ op: 'parallel', steps })
    expectProblem(withStep(inner([])), /empty parallel group/)
    expectProblem(withStep(inner([writing('../escape.png')])), /bad path component/)
    expectProblem(withStep(inner([writing('/abs/escape.png')])), /absolute path/)
    expectProblem(
      withStep(inner([inner([writing('fresh/n.png')])])),
      /parallel groups cannot be nested/
    )
    expectProblem(withStep(inner([inner([writing('../deep-escape.png')])])), /bad path component/)
    expectProblem(
      withStep(inner([writing('fresh/p.png'), writing('fresh/p.png')])),
      /parallel steps touch the same path/
    )
    expectProblem(
      withStep(inner([writing('fresh/P.png'), writing('fresh/p.png')])),
      /parallel steps touch the same path/
    )
    expectProblem(
      withStep(inner([{ op: 'mkdir', path: 'fresh/zz' }, writing('fresh/zz/a.png')])),
      /one inside the other/
    )
    expect(
      problemsAfter(withStep(inner([writing('fresh/p1.png'), writing('fresh/p2.png')])))
    ).not.toContainEqual(expect.stringMatching(/parallel/))
  })

  it('rejects two scenarios that use one path, names that differ only by case, and oversized scenarios', () => {
    expectProblem((plan) => {
      const [first, second] = plan.scenarios.filter(
        (scenario) => scenario.class === 'create-image' && writeOf(scenario)
      ) as [Scenario, Scenario]
      second.steps.push({ op: 'write', path: writeOf(first).path, payload: PAYLOAD })
    }, /path also used by/)
    expectProblem(
      withStep(writing('copy-sources/SRC-PNG-TINY.png')),
      /name already exists \(case\/normalisation-insensitive\)/
    )
    expectProblem(
      (plan) =>
        void (writeOf(
          find(plan, 'create-image', (s) => s.steps.some((step) => step.op === 'write'))
        ).payload.bytes = 5 * 1024 * 1024),
      /\(limit 4194304\)/
    )
  })
})

describe('check rules', () => {
  it('rejects malformed checks', () => {
    expectProblem(
      (plan) => void (firstCheck(find(plan, 'search-file')).query = '   '),
      /query is blank or over 512/
    )
    expectProblem(
      (plan) => void (firstCheck(find(plan, 'search-file')).topK = 0),
      /topK out of range/
    )
    expectProblem(
      (plan) => void (firstCheck(find(plan, 'search-file')).deadlineMs = 5),
      /deadlineMs out of range/
    )
    expectProblem(
      (plan) =>
        void ((firstCheck(find(plan, 'search-file')) as { expect: string }).expect = 'maybe'),
      /bad expect maybe/
    )
    expectProblem(
      (plan) => void ((firstCheck(find(plan, 'search-file')) as { tier: string }).tier = 'medium'),
      /bad tier medium/
    )
    expectProblem(
      (plan) => void (firstCheck(find(plan, 'search-file')).startAfterMs = -1),
      /startAfterMs out of range/
    )
    expectProblem((plan) => void (find(plan, 'search-file').checks = []), /no checks/)
    expectProblem(
      (plan) => void (firstCheck(find(plan, 'search-file')).target.name = 'other.png'),
      /is not the last component/
    )
    expectProblem(
      (plan) =>
        void (firstCheck(find(plan, 'search-file')).target = { kind: 'app', name: 'Safari' }),
      /file checks need a target path/
    )
  })

  it('rejects present targets that do not exist or that the indexer would drop', () => {
    expectProblem(
      (plan) =>
        void (firstCheck(find(plan, 'search-file')).target = {
          kind: 'file',
          name: 'nope.png',
          path: 'fresh/nope.png'
        }),
      /present target does not exist after the steps/
    )
    expectProblem((plan) => {
      const check = firstCheck(find(plan, 'search-file'))
      check.target = {
        kind: 'file',
        name: 'x.tmp',
        path: 'copy-sources/src-png-tiny.png'.replace('src-png-tiny.png', 'x.tmp')
      }
    }, /(excluded by the traversal policy|does not exist)/)
  })

  it('rejects hard tiers the product does not promise', () => {
    const soft = (plan: ScenarioPlan): Scenario =>
      find(plan, 'search-file', (s) => !isHardStyle(s.dims.nameStyle as string))
    expectProblem(
      (plan) => void (firstCheck(soft(plan)).tier = 'hard'),
      /can only be soft/,
      mediumPlan
    )
    expectProblem(
      (plan) =>
        void (firstCheck(find(plan, 'search-image', (s) => s.dims.format === 'fake-image')).tier =
          'hard'),
      /discovery is not promised/,
      mediumPlan
    )
    expectProblem(
      (plan) => {
        const scenario = find(
          plan,
          'search-file',
          (s) => String(s.dims.query).startsWith('prefix-') && firstCheck(s).tier === 'hard'
        )
        firstCheck(scenario).query = 'zzzzz'
      },
      /does not start a word/,
      mediumPlan
    )
    expectProblem(
      (plan) => {
        const index = new PrefixIndex()
        for (const file of plan.corpus.files)
          index.add(file.path.slice(file.path.lastIndexOf('/') + 1))
        const crowded = (s: Scenario): boolean =>
          String(s.dims.query).startsWith('prefix-') &&
          firstCheck(s).tier === 'hard' &&
          index.count(firstCheck(s).query.toLowerCase()) >= 2
        firstCheck(find(plan, 'search-file', crowded)).topK = 1
      },
      /topK 1 is below/,
      mediumPlan
    )
    expectProblem(
      (plan) =>
        void (firstCheck(find(plan, 'search-file', (s) => s.dims.query === 'lowercase')).tier =
          'hard'),
      /hard only when the query is the exact name/,
      mediumPlan
    )
  })

  it('rejects hard absent checks that no policy rule backs', () => {
    expectProblem(
      (plan) => {
        const scenario = find(plan, 'change-image', (s) => s.dims.change === 'delete')
        for (const check of scenario.checks) if (check.expect === 'absent') check.tier = 'hard'
      },
      /hard absent check on .*(which no traversal rule excludes|never written)/,
      mediumPlan
    )
    expectProblem((plan) => {
      const scenario = find(plan, 'search-file')
      scenario.checks.push({ ...firstCheck(scenario), expect: 'absent', tier: 'soft' })
    }, /absent target still exists and no rule excludes it/)
  })

  it('keeps ignore-image hard only where the traversal policy decides, and always with a visible control', () => {
    const rules = ignorePlan().scenarios.map((scenario) => String(scenario.dims.rule))
    expect(rules.filter((rule) => /project-|scan-skips/.test(rule)).length).toBeGreaterThan(5)
    expectProblem(
      (plan) => {
        const scenario = find(plan, 'ignore-image', (s) =>
          /project-|scan-skips/.test(String(s.dims.rule))
        )
        for (const check of scenario.checks) if (check.expect === 'absent') check.tier = 'hard'
      },
      /hard absent check on .*which no traversal rule excludes/,
      ignorePlan
    )
    expectProblem(
      (plan) =>
        void (find(plan, 'ignore-image').checks = find(plan, 'ignore-image').checks.filter(
          (check) => check.expect === 'absent'
        )),
      /needs a visible control and an absent check/,
      ignorePlan
    )
    expectProblem(
      (plan) =>
        void (find(plan, 'ignore-image').checks = find(plan, 'ignore-image').checks.filter(
          (check) => check.expect === 'present'
        )),
      /needs a visible control and an absent check/,
      ignorePlan
    )
  })

  it('rejects app checks that are not by display name', () => {
    expectProblem(
      (plan) => void (firstCheck(find(plan, 'search-app')).target = { kind: 'app', name: 'Other' }),
      /differs from dims\.app/
    )
    expectProblem(
      (plan) => void (firstCheck(find(plan, 'search-app')).expect = 'absent'),
      /a search-app check must be present/
    )
    expectProblem(
      (plan) =>
        void (firstCheck(find(plan, 'search-app', (s) => s.dims.query !== 'exact-stem')).tier =
          'hard'),
      /an app check is hard only for the exact display name/,
      mediumPlan
    )
  })

  it('rejects steps where there must be none, and none where there must be some', () => {
    expectProblem(
      (plan) => void find(plan, 'search-file').steps.push({ op: 'sleep', ms: 10 }),
      /must not change the filesystem/
    )
    expectProblem((plan) => void (find(plan, 'create-image').steps = []), /has no steps/)
  })
})

describe('search-created links', () => {
  const linked = (plan: ScenarioPlan): Scenario => find(plan, 'search-created')
  it('rejects a missing, unknown, wrong-class, early or mismatching partner', () => {
    expectProblem(
      (plan) => void delete linked(plan).requires,
      /needs exactly one required scenario/,
      mediumPlan
    )
    expectProblem(
      (plan) => void (linked(plan).requires = ['create-image-000000000000']),
      /requires unknown scenario/,
      mediumPlan
    )
    expectProblem(
      (plan) => void (linked(plan).requires = [find(plan, 'search-file').id]),
      /which is not a create-image/,
      mediumPlan
    )
    expectProblem(
      (plan) => void (find(plan, 'search-file').requires = [find(plan, 'create-image').id]),
      /only search-created scenarios may require another/,
      mediumPlan
    )
    expectProblem(
      (plan) => {
        const scenario = linked(plan)
        const later = plan.scenarios.find(
          (other) => other.class === 'create-image' && other.index > scenario.index
        )
        if (!later) throw new Error('no create-image after the first search-created')
        scenario.requires = [later.id]
      },
      /scenarios after its create-image \(need 20\)/,
      mediumPlan
    )
    expectProblem(
      (plan) =>
        void (linked(plan).dims.format = linked(plan).dims.format === 'png' ? 'jpg' : 'png'),
      /format differs from its create-image/,
      mediumPlan
    )
    expectProblem(
      (plan) =>
        void (firstCheck(linked(plan)).target = {
          kind: 'file',
          name: 'x.png',
          path: 'fresh/x.png'
        }),
      /is not left in place by/,
      mediumPlan
    )
  })
})

describe('corpus rules', () => {
  const file = (path: string, payload: PayloadSpec = PAYLOAD) => ({ path, payload })
  it('rejects unsafe, duplicate, orphaned and oversized corpus entries', () => {
    expectProblem(
      (plan) => void plan.corpus.files.push(file('../x.png')),
      /corpus: bad path component/
    )
    expectProblem(
      (plan) => void plan.corpus.files.push(file('/abs/x.png')),
      /corpus: absolute path/
    )
    expectProblem((plan) => void plan.corpus.directories.push('x\0y'), /corpus: NUL in path/)
    expectProblem(
      (plan) => void plan.corpus.files.push(file('COPY-SOURCES/SRC-PNG-TINY.PNG')),
      /corpus: duplicate path/
    )
    expectProblem(
      (plan) => void plan.corpus.files.push(file('nodir/x.png')),
      /file without a listed directory/
    )
    expectProblem(
      (plan) => void plan.corpus.directories.reverse(),
      /directory listed before its parent/
    )
    expectProblem(
      (plan) =>
        void plan.corpus.files.push(
          file('notes-x.txt', { kind: 'text', bytes: 100, seed: 1, ext: 'txt' })
        ),
      /text file without text/
    )
    expectProblem(
      (plan) =>
        void plan.corpus.files.push(
          file('big.bin', { kind: 'binary', bytes: 30 * 1024 * 1024, seed: 1 })
        ),
      /corpus: \d+ bytes exceed 25165824/
    )
    expectProblem(
      (plan) => void plan.corpus.files.push(file('bad.png', { ...PAYLOAD, bytes: -5 })),
      /payload bytes out of range/
    )
    expectProblem(
      (plan) =>
        plan.corpus.files.push(
          ...Array.from({ length: 8000 }, (_, index) => file(`bulk-${index}.png`))
        ),
      /8\d{3} files exceed 8000/
    )
  })

  it('keeps a 24 MiB floor for small plans', () => {
    const plan = cloneOf(smokePlan())
    plan.corpus.files.push(file('big.bin', { kind: 'binary', bytes: 8 * 1024 * 1024, seed: 1 }))
    expect(validatePlan(plan).some((problem) => /corpus: .* bytes exceed/.test(problem))).toBe(
      false
    )
  })
})
