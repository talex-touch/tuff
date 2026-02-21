export const isDev = import.meta.env.DEV

export function devLog(...args: unknown[]): void {
  if (!isDev) return
  console.log(...args)
}

export function createDevLogger(scope: string) {
  return (...args: unknown[]): void => {
    if (!isDev) return
    if (scope) {
      console.log(`[${scope}]`, ...args)
      return
    }
    console.log(...args)
  }
}
