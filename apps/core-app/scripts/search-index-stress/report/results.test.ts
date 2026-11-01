import { describe, expect, it } from 'vitest'
import { classOfId, dimsLabel, expectOf, kindOf, metricOf, prepare } from './results'
import { absentBad, absentOk, errored, found, missed, sid, skippedCheck } from './testing/builders'

describe('expectOf', () => {
  it('trusts the expect field the runner sets', () => {
    expect(expectOf(found('search-file', 1, { expect: 'absent', rank: 3 }))).toBe('absent')
    expect(expectOf(missed('search-file', 1, { expect: 'absent' }))).toBe('absent')
  })

  it('infers it for a pass from the rank: a rank means found, none means absence confirmed', () => {
    expect(expectOf(found('search-file', 1, { expect: undefined }))).toBe('present')
    expect(expectOf(absentOk('ignore-image', 1, { expect: undefined }))).toBe('absent')
  })

  it('infers it for a failure from the wording of the detail', () => {
    const base = { expect: undefined }
    expect(
      expectOf(missed('search-file', 1, { ...base, detail: 'target not found within 5000 ms' }))
    ).toBe('present')
    expect(
      expectOf(
        absentBad('ignore-image', 1, {
          ...base,
          detail: 'target appeared although it must be absent'
        })
      )
    ).toBe('absent')
    expect(
      expectOf(
        absentBad('ignore-image', 1, { ...base, detail: 'late indexing: found after 3000 ms' })
      )
    ).toBe('absent')
    expect(
      expectOf(absentBad('ignore-image', 1, { ...base, detail: 'expected to stay absent' }))
    ).toBe('absent')
  })
})

describe('kindOf', () => {
  it('names the six things a check can be', () => {
    expect(kindOf(found('search-file', 1))).toBe('present-pass')
    expect(kindOf(absentOk('ignore-image', 1))).toBe('absent-pass')
    expect(kindOf(missed('search-file', 1))).toBe('present-fail')
    expect(kindOf(absentBad('ignore-image', 1))).toBe('absent-fail')
    expect(kindOf(errored('search-file', 1))).toBe('error')
    expect(kindOf(skippedCheck('search-file', 1))).toBe('skipped')
  })
})

describe('classOfId', () => {
  it('reads the class from the id prefix, longest class names included', () => {
    expect(classOfId(sid('search-created', 5))).toBe('search-created')
    expect(classOfId(sid('create-image', 5))).toBe('create-image')
    expect(classOfId('nonsense-0001')).toBeNull()
  })
})

describe('prepare', () => {
  it('keeps the last result for a repeated check and counts the repeats', () => {
    const first = found('search-file', 1, { answerMs: 10 })
    const again = found('search-file', 1, { answerMs: 99 })
    const other = found('search-file', 1, { checkIndex: 1, answerMs: 20 })
    const prepared = prepare([first, other, again], {})
    expect(prepared.duplicates).toBe(1)
    expect(prepared.obs).toHaveLength(2)
    expect(prepared.obs.find((o) => o.r.checkIndex === 0)?.r.answerMs).toBe(99)
  })

  it('counts results whose scenario has no dims and still keeps them', () => {
    const prepared = prepare([found('search-file', 1), found('search-file', 2)], {
      [sid('search-file', 1)]: { format: 'png' }
    })
    expect(prepared.withoutDims).toBe(1)
    expect(prepared.obs).toHaveLength(2)
    expect(prepared.obs.map((o) => o.dims)).toEqual([{ format: 'png' }, undefined])
  })

  it('groups by the class on the result', () => {
    const prepared = prepare(
      [found('search-file', 1), found('search-app', 1), found('search-file', 2)],
      {}
    )
    expect(prepared.byClass.get('search-file')).toHaveLength(2)
    expect(prepared.byClass.get('search-app')).toHaveLength(1)
    expect(prepared.byClass.has('create-image')).toBe(false)
  })
})

describe('metricOf', () => {
  const obs = (r: ReturnType<typeof found>) => prepare([r], {}).obs[0]

  it('measures speed from a present check that passed', () => {
    const item = obs(
      found('create-image', 1, { latencyMs: 400, sinceStepsMs: 1_800, answerMs: 70 })
    )
    expect(metricOf(item, 'latencyMs')).toBe(400)
    expect(metricOf(item, 'sinceStepsMs')).toBe(1_800)
    expect(metricOf(item, 'answerMs')).toBe(70)
  })

  it('leaves an absent check out of every latency: its time is the deadline it waited out', () => {
    const item = obs(absentOk('ignore-image', 1))
    expect(metricOf(item, 'latencyMs')).toBeNull()
    expect(metricOf(item, 'sinceStepsMs')).toBeNull()
    expect(metricOf(item, 'answerMs')).toBeNull()
  })

  it('counts the answer of a present check that was answered but missed, and nothing else of it', () => {
    const item = obs(missed('search-file', 1, { answerMs: 640 }))
    expect(metricOf(item, 'answerMs')).toBe(640)
    expect(metricOf(item, 'latencyMs')).toBeNull()
  })

  it('ignores an error, a skip and a non-finite number', () => {
    expect(metricOf(obs(errored('search-file', 1, { answerMs: 50 })), 'answerMs')).toBeNull()
    expect(metricOf(obs(skippedCheck('search-file', 1)), 'answerMs')).toBeNull()
    expect(
      metricOf(obs(found('search-file', 1, { latencyMs: Number.NaN })), 'latencyMs')
    ).toBeNull()
    expect(metricOf(obs(found('search-file', 1, { answerMs: Infinity })), 'answerMs')).toBeNull()
  })
})

describe('dimsLabel', () => {
  it('lists key=value pairs and is empty without dims', () => {
    expect(dimsLabel({ format: 'png', size: 4, hidden: false })).toBe(
      'format=png size=4 hidden=false'
    )
    expect(dimsLabel(undefined)).toBe('')
  })
})
