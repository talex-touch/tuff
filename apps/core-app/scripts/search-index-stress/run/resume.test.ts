import { describe, expect, it } from 'vitest'
import type { Scenario, ScenarioPlan } from '../types'
import { planResume } from './resume'
import type { LoadedResults } from './results-store'

const scenario = (id: string, steps: number, checks = 2): Scenario => ({
  id,
  index: 0,
  class: steps > 0 ? 'create-image' : 'search-file',
  dims: {},
  steps: Array.from({ length: steps }, () => ({ op: 'sleep' as const, ms: 1 })),
  checks: Array.from({ length: checks }, () => ({
    query: 'q',
    target: { kind: 'file' as const, name: 'a.png' },
    expect: 'present' as const,
    topK: 5,
    tier: 'hard' as const,
    deadlineMs: 100
  }))
})

const plan = (scenarios: Scenario[]): ScenarioPlan => ({
  seed: 1,
  count: scenarios.length,
  options: { seed: 1, count: scenarios.length, apps: [] },
  corpus: { directories: [], files: [] },
  scenarios
})

const check = (scenarioId: string, checkIndex: number): LoadedResults['checks'][number] => ({
  scenarioId,
  checkIndex,
  class: 'create-image',
  tier: 'hard',
  outcome: 'pass',
  latencyMs: 1,
  sinceStepsMs: 1,
  polls: 1,
  rank: 1,
  resultCount: 1,
  answerMs: 1
})

describe('planResume', () => {
  it('settles finished scenarios by whether their steps completed', () => {
    const done = new Map([
      [
        'a',
        {
          kind: 'scenario-done' as const,
          at: 1,
          scenarioId: 'a',
          stepsOk: true,
          stepsMs: 1,
          totalMs: 2
        }
      ],
      [
        'b',
        {
          kind: 'scenario-done' as const,
          at: 1,
          scenarioId: 'b',
          stepsOk: false,
          stepsMs: null,
          totalMs: 2,
          error: 'x'
        }
      ]
    ])
    const resume = planResume(plan([scenario('a', 1), scenario('b', 1), scenario('c', 1)]), {
      checks: [],
      done,
      events: []
    })
    expect(resume.settled.get('a')).toBe('ok')
    expect(resume.settled.get('b')).toBe('failed')
    expect(resume.pending.map((item) => item.id)).toEqual(['c'])
    expect(resume.interrupted).toEqual([])
  })

  it('skips a scenario that changed the corpus and was cut short, with the checks it still lacks', () => {
    const loaded = { checks: [check('a', 0)], done: new Map(), events: [] }
    const resume = planResume(plan([scenario('a', 2), scenario('b', 1)]), loaded)
    expect(resume.interrupted).toHaveLength(1)
    expect(resume.interrupted[0].scenario.id).toBe('a')
    expect([...resume.interrupted[0].missing]).toEqual([1])
    expect(resume.settled.get('a')).toBe('failed')
    expect(resume.pending.map((item) => item.id)).toEqual(['b'])
  })

  it('counts an interrupted event as a trace, and repeats a scenario that never touched the corpus', () => {
    const events = [
      { kind: 'run-event' as const, at: 1, event: 'scenario-interrupted', detail: 'a' },
      { kind: 'run-event' as const, at: 1, event: 'scenario-interrupted', detail: 's' }
    ]
    const resume = planResume(plan([scenario('a', 1), scenario('s', 0)]), {
      checks: [check('s', 0)],
      done: new Map(),
      events
    })
    expect(resume.interrupted.map((item) => [item.scenario.id, [...item.missing]])).toEqual([
      ['a', [0, 1]]
    ])
    expect(resume.pending.map((item) => item.id)).toEqual(['s'])
    expect(resume.settled.has('s')).toBe(false)
  })
})
