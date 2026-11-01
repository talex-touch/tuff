import { describe, expect, it } from 'vitest'
import { appPairCapacity, distinctApps } from './build-app'
import { describePlan } from './describe'
import { CLASSES, classQuota, generatePlan } from './plan'
import { APPS, optionsFor } from './test-fixtures'
import { validatePlan } from './validate'

describe('distinctApps', () => {
  it('trims, NFC-normalises, drops blanks and case or normalisation duplicates, and keeps the first spelling', () => {
    expect(distinctApps(['Safari', ' safari', 'SAFARI ', '', '   ', 'Notes'])).toEqual([
      'Safari',
      'Notes'
    ])
    expect(distinctApps(['Caf\u00e9', 'Cafe\u0301', 'CAF\u00c9'])).toEqual(['Caf\u00e9'])
    expect(distinctApps(['微信', '微信 ', 'メモ'])).toEqual(['微信', 'メモ'])
    expect(distinctApps([])).toEqual([])
  })

  it('keeps the order it was given', () => {
    expect(distinctApps(['Zed', 'Alpha', 'Mid'])).toEqual(['Zed', 'Alpha', 'Mid'])
  })
})

describe('appPairCapacity', () => {
  it('is zero without usable names and counts an app once however it is spelled', () => {
    expect(appPairCapacity([])).toBe(0)
    expect(appPairCapacity(['', '  '])).toBe(0)
    expect(appPairCapacity(['Safari', 'safari', ' Safari '])).toBe(appPairCapacity(['Safari']))
    expect(appPairCapacity(['Caf\u00e9', 'Cafe\u0301'])).toBe(appPairCapacity(['Caf\u00e9']))
  })

  it('adds up app by app, and every real app offers several queries', () => {
    const names = ['Safari', 'Notes', '微信', 'Activity Monitor', 'Visual Studio Code']
    const single = names.map((name) => appPairCapacity([name]))
    for (const capacity of single) expect(capacity).toBeGreaterThanOrEqual(3)
    expect(appPairCapacity(names)).toBe(single.reduce((sum, capacity) => sum + capacity, 0))
  })

  it('is what the fixture list of installed apps can offer', () => {
    expect(distinctApps(APPS).length).toBe(APPS.length)
    expect(appPairCapacity(APPS)).toBeGreaterThan(distinctApps(APPS).length * 5)
  })
})

describe('search-app shrinks to what the installed apps can express, and the rest moves to other classes', () => {
  const CASES: Array<[string, string[]]> = [
    ['no apps', []],
    ['one app', ['Safari']],
    ['one app spelled three ways', ['Safari', 'safari', ' Safari ']],
    ['only blanks', ['', '  ']],
    ['NFC and NFD spellings of one name', ['Caf\u00e9', 'Cafe\u0301']],
    ['three apps', ['Safari', 'Notes', '微信']]
  ]

  it.each(CASES)('%s', (_name, apps) => {
    const options = { seed: 5, count: 300, apps }
    const plan = generatePlan(options)
    const description = describePlan(plan)
    const quota = classQuota(options)['search-app']
    const capacity = appPairCapacity(apps)
    const known = new Set(distinctApps(apps))

    expect(plan.scenarios).toHaveLength(300)
    expect(validatePlan(plan)).toEqual([])
    expect(description.distinct.ids).toBe(300)
    expect(description.distinct.tuples).toBe(300)
    expect(description.classes['search-app'].actual).toBe(Math.min(quota, capacity))
    expect(description.distinct.perClass['search-app'].capacity).toBe(capacity)

    expect(description.shortfall.total).toBe(Math.max(0, quota - capacity))
    expect(description.shortfall.short).toEqual(
      quota > capacity ? { 'search-app': quota - capacity } : {}
    )
    const reflowed = Object.entries(description.shortfall.reflowedInto)
    expect(reflowed.reduce((sum, [, count]) => sum + count, 0)).toBe(description.shortfall.total)
    for (const [cls] of reflowed) expect(['search-app', 'search-created']).not.toContain(cls)

    const pairs = new Set<string>()
    for (const scenario of plan.scenarios.filter((row) => row.class === 'search-app')) {
      expect(known.has(String(scenario.dims.app))).toBe(true)
      pairs.add(`${scenario.dims.app}|${scenario.dims.query}`)
    }
    expect(pairs.size).toBe(description.classes['search-app'].actual)
  })

  it('no shortfall when the installed apps can express the whole quota', () => {
    const description = describePlan(generatePlan(optionsFor(300)))
    expect(description.classes['search-app']).toEqual({ requested: 30, actual: 30 })
    expect(description.shortfall).toEqual({ total: 0, short: {}, reflowedInto: {} })
  })

  it('a single app yields each of its queries once and never a repeated pair', () => {
    const apps = ['Safari']
    const plan = generatePlan({ seed: 2, count: 90, apps, mix: { 'search-app': 100 } })
    const rows = plan.scenarios.filter((scenario) => scenario.class === 'search-app')
    expect(rows).toHaveLength(appPairCapacity(apps))
    expect(new Set(rows.map((row) => row.dims.query)).size).toBe(rows.length)
    expect(rows.every((row) => row.dims.app === 'Safari')).toBe(true)
    expect(validatePlan(plan)).toEqual([])
  })

  it('asking only for apps without any installed app still delivers the full count from the other classes', () => {
    const plan = generatePlan({
      seed: 3,
      count: 100,
      apps: [],
      mix: Object.fromEntries(CLASSES.map((cls) => [cls, cls === 'search-app' ? 1 : 0]))
    })
    const description = describePlan(plan)
    expect(plan.scenarios).toHaveLength(100)
    expect(description.classes['search-app']).toEqual({ requested: 100, actual: 0 })
    expect(description.classes['search-created'].actual).toBe(0)
    for (const cls of [
      'search-file',
      'search-image',
      'create-image',
      'change-image',
      'ignore-image'
    ] as const) {
      expect(description.classes[cls].actual, cls).toBe(20)
    }
    expect(validatePlan(plan)).toEqual([])
  })

  it('tiny plans without apps still reach their count', () => {
    for (const count of [0, 1, 2, 5]) {
      const plan = generatePlan({ seed: 9, count, apps: [] })
      expect(plan.scenarios).toHaveLength(count)
      expect(validatePlan(plan)).toEqual([])
    }
  })
})
