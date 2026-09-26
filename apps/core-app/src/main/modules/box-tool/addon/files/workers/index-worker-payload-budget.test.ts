import { describe, expect, it } from 'vitest'
import {
  INDEX_WORKER_RESULT_MAX_BYTES,
  measureIndexWorkerPayloadBytes
} from './index-worker-payload-budget'

describe('measureIndexWorkerPayloadBytes', () => {
  it('flags a payload past the limit without calling it indeterminate', () => {
    const budget = measureIndexWorkerPayloadBytes({ content: 'x'.repeat(100) }, 100)

    expect(budget.exceedsBudget).toBe(true)
    expect(budget.indeterminate).toBe(false)
    // The estimate is capped at the limit so a huge payload cannot report an unbounded number.
    expect(budget.bytes).toBe(100)
  })

  it('accepts a shared sub-object that is not a cycle', () => {
    const shared = { label: 'shared-value' }
    const budget = measureIndexWorkerPayloadBytes({ left: shared, right: shared })

    expect(budget.indeterminate).toBe(false)
    expect(budget.exceedsBudget).toBe(false)
    expect(Number.isFinite(budget.bytes)).toBe(true)
    expect(budget.bytes).toBeGreaterThan(0)
  })

  it('fails closed on a self-referential cycle', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic

    expect(measureIndexWorkerPayloadBytes(cyclic)).toMatchObject({
      exceedsBudget: true,
      indeterminate: true
    })
  })

  it('fails closed beyond the depth ceiling', () => {
    let deep: unknown = { leaf: 'x' }
    for (let index = 0; index < 14; index += 1) {
      deep = { child: deep }
    }

    expect(measureIndexWorkerPayloadBytes(deep)).toMatchObject({
      exceedsBudget: true,
      indeterminate: true
    })
  })

  it('budgets a nested typed array by its byte length', () => {
    const budget = measureIndexWorkerPayloadBytes(
      { vector: new Float32Array(2_048) },
      INDEX_WORKER_RESULT_MAX_BYTES
    )

    expect(budget.indeterminate).toBe(false)
    expect(budget.bytes).toBeGreaterThanOrEqual(2_048 * 4)
  })

  it('budgets a nested array buffer by its byte length', () => {
    const budget = measureIndexWorkerPayloadBytes(
      { blob: new ArrayBuffer(4_096) },
      INDEX_WORKER_RESULT_MAX_BYTES
    )

    expect(budget.indeterminate).toBe(false)
    expect(budget.bytes).toBeGreaterThanOrEqual(4_096)
  })

  it('treats a nested typed array past the limit as over budget', () => {
    const budget = measureIndexWorkerPayloadBytes({ vector: new Float32Array(1_024) }, 1_000)

    expect(budget.exceedsBudget).toBe(true)
    expect(budget.bytes).toBe(1_000)
  })

  it('fails closed on an object it cannot measure', () => {
    expect(measureIndexWorkerPayloadBytes({ lookup: new Map([['key', 'value']]) })).toMatchObject({
      exceedsBudget: true,
      indeterminate: true
    })
  })
})
