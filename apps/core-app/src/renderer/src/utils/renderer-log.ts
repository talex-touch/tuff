import { isDev } from './dev-log'

type RendererLogMethod = 'debug' | 'info' | 'warn' | 'error'

function emit(method: RendererLogMethod, scope: string, args: unknown[]): void {
  if (method === 'debug' && !isDev) {
    return
  }

  const payload = [`[${scope}]`, ...args]
  if (method === 'debug') {
    console.log(...payload)
    return
  }
  if (method === 'info') {
    console.info(...payload)
    return
  }
  if (method === 'warn') {
    console.warn(...payload)
    return
  }
  console.error(...payload)
}

export function createRendererLogger(scope: string) {
  return {
    debug: (...args: unknown[]) => emit('debug', scope, args),
    info: (...args: unknown[]) => emit('info', scope, args),
    warn: (...args: unknown[]) => emit('warn', scope, args),
    error: (...args: unknown[]) => emit('error', scope, args)
  }
}
