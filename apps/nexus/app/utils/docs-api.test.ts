import { describe, expect, it } from 'vitest'
import { coerceJsonArray, coerceJsonRecord } from './docs-api'

describe('docs api payload coercion', () => {
  it('coerces array values from json strings or arrays', () => {
    expect(coerceJsonArray('[{"path":"/docs"}]')).toEqual([{ path: '/docs' }])
    expect(coerceJsonArray([{ path: '/docs/dev' }])).toEqual([{ path: '/docs/dev' }])
    expect(coerceJsonArray('{"path":"/docs"}')).toEqual([])
  })

  it('coerces object values from json strings or records', () => {
    expect(coerceJsonRecord('{"syncStatus":"migrated"}')).toEqual({ syncStatus: 'migrated' })
    expect(coerceJsonRecord({ verified: true })).toEqual({ verified: true })
    expect(coerceJsonRecord('[1,2]')).toBeNull()
  })
})
