export function hasWindow(): boolean {
  return typeof window !== 'undefined'
}

export function hasDocument(): boolean {
  return typeof document !== 'undefined'
}

export function hasNavigator(): boolean {
  return typeof navigator !== 'undefined'
}
