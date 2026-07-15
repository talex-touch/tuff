import type { IntelligenceInvokeOptions } from '@talex-touch/tuff-intelligence'
import { describe, expect, it } from 'vitest'
import {
  inheritOuterGovernance,
  isOuterGovernedInvocation,
  markOuterGovernedInvocation
} from './intelligence-invoke-governance'

describe('outer-governed invocation marker', () => {
  it('is identity-bound, non-serializable, and cannot be forged through invocation metadata', () => {
    const options: IntelligenceInvokeOptions = {
      preferredProviderId: 'workflow-provider',
      metadata: { outerGovernedInvocation: true, caller: 'untrusted-caller' }
    }
    const enumerableFields = Object.keys(options)
    const serializedOptions = JSON.stringify(options)
    const ownPropertyNames = Object.getOwnPropertyNames(options)
    const ownSymbols = Object.getOwnPropertySymbols(options)

    markOuterGovernedInvocation(options)

    expect(isOuterGovernedInvocation(options)).toBe(true)
    expect(Object.keys(options)).toEqual(enumerableFields)
    expect(JSON.stringify(options)).toBe(serializedOptions)
    expect(Object.getOwnPropertyNames(options)).toEqual(ownPropertyNames)
    expect(Object.getOwnPropertySymbols(options)).toEqual(ownSymbols)
    expect(isOuterGovernedInvocation({ ...options })).toBe(false)
    expect(
      isOuterGovernedInvocation({
        metadata: { outerGovernedInvocation: true, caller: 'untrusted-caller' }
      })
    ).toBe(false)
  })

  it('inherits governance only when the explicit source identity is marked', () => {
    const markedSource = markOuterGovernedInvocation<IntelligenceInvokeOptions>({
      preferredProviderId: 'workflow-provider'
    })
    const inheritedClone = {
      ...markedSource,
      metadata: { workflowStepId: 'aggregate-result' }
    }
    const unmarkedClone: IntelligenceInvokeOptions = {
      preferredProviderId: 'direct-provider'
    }

    inheritOuterGovernance(markedSource, inheritedClone)
    inheritOuterGovernance(undefined, unmarkedClone)

    expect(isOuterGovernedInvocation(inheritedClone)).toBe(true)
    expect(isOuterGovernedInvocation(unmarkedClone)).toBe(false)
  })
})
