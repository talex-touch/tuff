export function hasWindow(): boolean {
  // eslint-disable-next-line no-restricted-syntax -- canonical window guard for framework-agnostic core
  return typeof window !== 'undefined'
}

export function hasDocument(): boolean {
  // eslint-disable-next-line no-restricted-syntax -- canonical document guard for framework-agnostic core
  return typeof document !== 'undefined'
}

export function hasNavigator(): boolean {
  // eslint-disable-next-line no-restricted-syntax -- canonical navigator guard for framework-agnostic core
  return typeof navigator !== 'undefined'
}
