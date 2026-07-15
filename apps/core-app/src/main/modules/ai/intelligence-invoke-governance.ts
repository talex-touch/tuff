import type { IntelligenceInvokeOptions } from '@talex-touch/tuff-intelligence'

const outerGovernedInvocations = new WeakSet<object>()

export function markOuterGovernedInvocation<T extends IntelligenceInvokeOptions>(options: T): T {
  outerGovernedInvocations.add(options)
  return options
}

export function isOuterGovernedInvocation(options: IntelligenceInvokeOptions | undefined): boolean {
  return Boolean(options && outerGovernedInvocations.has(options))
}

export function inheritOuterGovernance<T extends IntelligenceInvokeOptions>(
  source: IntelligenceInvokeOptions | undefined,
  target: T
): T {
  if (isOuterGovernedInvocation(source)) {
    markOuterGovernedInvocation(target)
  }
  return target
}
