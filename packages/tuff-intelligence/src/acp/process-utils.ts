import type { Buffer } from 'node:buffer'
import type { ChildProcess } from 'node:child_process'
import type readline from 'node:readline'
import type { AcpKeyValueHeader, CliPermissionRiskKind } from './types'
import process from 'node:process'

export const DEFAULT_INIT_TIMEOUT_MS = 15_000
export const SIGTERM_GRACE_MS = 150
export const SIGKILL_GRACE_MS = 750
export const MAX_STDERR_TAIL_CHARS = 4_096

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function readNonEmptyString(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }
  return undefined
}

/**
 * Preserves whitespace (e.g. leading spaces or newlines in streamed token deltas).
 */
export function readRawNonEmptyString(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate
    }
  }
  return undefined
}

export function readFiniteNumber(...candidates: unknown[]): number | undefined {
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate
    }
  }
  return undefined
}

export function normalizeKeyValueEntries(
  value?: Record<string, string> | AcpKeyValueHeader[],
): Array<[string, string]> {
  if (!value)
    return []
  if (Array.isArray(value)) {
    const entries: Array<[string, string]> = []
    for (const item of value) {
      if (item && typeof item.name === 'string' && item.name.trim() && typeof item.value === 'string') {
        entries.push([item.name.trim(), item.value])
      }
    }
    return entries
  }
  const entries: Array<[string, string]> = []
  for (const [key, val] of Object.entries(value)) {
    if (key.trim() && typeof val === 'string') {
      entries.push([key.trim(), val])
    }
  }
  return entries
}

export function normalizeKeyValueRecord(
  value?: Record<string, string> | AcpKeyValueHeader[],
): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [k, v] of normalizeKeyValueEntries(value)) {
    result[k] = v
  }
  return result
}

const READ_RISK_PATTERN = /^(?:read|view|list|ls|glob|grep|search|find|fetch|web_?fetch|web_?search|notebook_?read|todo_?read|inspect|stat|get_)/i
const EXECUTE_RISK_PATTERN = /(?:exec|execute|bash|shell|terminal|command|cmd|run|computer|permission)/i
const WRITE_RISK_PATTERN = /(?:write|edit|patch|delete|remove|move|rename|mkdir|create|save|modify|file_?change)/i

export function inferPermissionRiskHint(
  toolName?: string,
  kind?: string,
): CliPermissionRiskKind {
  const candidates = [kind, toolName].filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
  for (const candidate of candidates) {
    const trimmed = candidate.trim()
    if (EXECUTE_RISK_PATTERN.test(trimmed))
      return 'execute'
    if (WRITE_RISK_PATTERN.test(trimmed))
      return 'write'
    if (READ_RISK_PATTERN.test(trimmed))
      return 'read'
  }
  // Conservative default: unknown tools are never classified as read-only.
  return 'write'
}

export function buildSpawnEnv(overrides?: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...(overrides || {}),
  }
}

export function hasProcessExited(proc: ChildProcess): boolean {
  return (
    (proc.exitCode !== null && proc.exitCode !== undefined)
    || (proc.signalCode !== null && proc.signalCode !== undefined)
  )
}

export function waitForProcessExit(proc: ChildProcess, timeoutMs: number): Promise<boolean> {
  if (hasProcessExited(proc))
    return Promise.resolve(true)
  return new Promise<boolean>((resolve) => {
    let settled = false
    let timer: NodeJS.Timeout | undefined
    function cleanup(): void {
      if (timer) {
        clearTimeout(timer)
        timer = undefined
      }
      proc.removeListener('exit', onExit)
      proc.removeListener('close', onExit)
    }
    function onExit(): void {
      if (settled)
        return
      settled = true
      cleanup()
      resolve(true)
    }
    timer = setTimeout(() => {
      if (settled)
        return
      settled = true
      cleanup()
      resolve(hasProcessExited(proc))
    }, timeoutMs)
    timer.unref?.()
    proc.once('exit', onExit)
    proc.once('close', onExit)
  })
}

export interface StderrTailCollector {
  getTail: () => string
  detach: () => void
}

export function createStderrTailCollector(
  proc: ChildProcess,
  maxChars: number = MAX_STDERR_TAIL_CHARS,
): StderrTailCollector {
  let buffer = ''
  let detached = false
  const onData = (chunk: Buffer | string): void => {
    const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
    buffer = (buffer + text).slice(-maxChars)
  }
  proc.stderr?.on('data', onData)
  return {
    getTail: () => buffer.trim(),
    detach: () => {
      if (detached)
        return
      detached = true
      proc.stderr?.removeListener('data', onData)
    },
  }
}

export function attachSafeStdinErrorGuard(proc: ChildProcess): void {
  proc.stdin?.on('error', () => {
    // Ignore late EPIPE / broken pipe errors during child exit or teardown.
  })
}

export interface TerminateChildProcessOptions {
  rl?: readline.Interface | null
  stderrCollector?: StderrTailCollector | null
  sigtermGraceMs?: number
  sigkillGraceMs?: number
}

/**
 * Bounded single-flight child teardown:
 * stdin.end() -> SIGTERM (150ms) -> SIGKILL (750ms) -> unref() + stream/listener cleanup.
 */
export async function terminateChildProcess(
  proc: ChildProcess,
  options: TerminateChildProcessOptions = {},
): Promise<boolean> {
  const sigtermGraceMs = options.sigtermGraceMs ?? SIGTERM_GRACE_MS
  const sigkillGraceMs = options.sigkillGraceMs ?? SIGKILL_GRACE_MS

  try {
    proc.stdin?.end()
  }
  catch {
    // ignore already closed stdin
  }

  if (!hasProcessExited(proc)) {
    try {
      proc.kill('SIGTERM')
    }
    catch {
      // ignore kill errors; check authoritative exit below
    }
    const exitedAfterTerm = await waitForProcessExit(proc, sigtermGraceMs)
    if (!exitedAfterTerm && !hasProcessExited(proc)) {
      try {
        proc.kill('SIGKILL')
      }
      catch {
        // ignore kill errors; check authoritative exit below
      }
      const exitedAfterKill = await waitForProcessExit(proc, sigkillGraceMs)
      if (!exitedAfterKill && !hasProcessExited(proc)) {
        try {
          proc.unref?.()
        }
        catch {
          // ignore
        }
      }
    }
  }

  options.stderrCollector?.detach()

  if (options.rl) {
    try {
      options.rl.close()
    }
    catch {
      // ignore
    }
  }

  try {
    proc.stdout?.destroy()
  }
  catch {
    // ignore already destroyed stream
  }

  try {
    proc.stderr?.destroy()
  }
  catch {
    // ignore already destroyed stream
  }

  return hasProcessExited(proc)
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  if (!(timeoutMs > 0))
    return await promise

  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(timeoutMessage))
        }, timeoutMs)
        timer.unref?.()
      }),
    ])
  }
  catch (error) {
    void promise.catch(() => undefined)
    throw error
  }
  finally {
    if (timer)
      clearTimeout(timer)
  }
}

export function writeJsonLine(proc: ChildProcess, payload: unknown, label: string): Promise<void> {
  const stdin = proc.stdin
  if (!stdin || stdin.destroyed || stdin.writableEnded) {
    return Promise.reject(new Error(`${label} process stdin is not writable`))
  }
  const serialized = `${JSON.stringify(payload)}\n`
  return new Promise<void>((resolve, reject) => {
    try {
      stdin.write(serialized, 'utf8', (err) => {
        if (err)
          reject(err)
        else
          resolve()
      })
    }
    catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

export function tryWriteJsonLine(proc: ChildProcess, payload: unknown): boolean {
  const stdin = proc.stdin
  if (!stdin || stdin.destroyed || stdin.writableEnded)
    return false
  try {
    stdin.write(`${JSON.stringify(payload)}\n`, 'utf8')
    return true
  }
  catch {
    return false
  }
}

export function formatProcessExitError(
  label: string,
  code: number | null,
  signal: NodeJS.Signals | null,
  stderrTail: string,
): Error {
  const suffix = stderrTail ? `: ${stderrTail}` : ''
  return new Error(`${label} process exited (code=${code}, signal=${signal})${suffix}`)
}

export interface ProcessLifecycleHooks {
  onExit: (code: number | null, signal: NodeJS.Signals | null) => void
  onError: (error: Error) => void
  onStdoutEof?: () => void
}

export interface ProcessLifecycleController {
  markClosed: () => void
}

/**
 * Coordinates `exit`, `close`, `error`, and `readline` EOF events so:
 * - Real child processes flush buffered stdout/stderr before teardown runs (`close` after `exit`).
 * - Mock child processes (without a real numeric PID) finalize immediately on `exit`.
 * - Premature stdout EOF without exit still notifies callers instead of hanging forever.
 * - The child `error` listener remains attached so late errors never become uncaught exceptions.
 */
export function attachProcessLifecycle(
  proc: ChildProcess,
  rl: readline.Interface,
  hooks: ProcessLifecycleHooks,
): ProcessLifecycleController {
  let finalized = false
  let exitRecorded: { code: number | null, signal: NodeJS.Signals | null } | null = null
  let exitFallbackTimer: NodeJS.Timeout | undefined
  let eofTimer: NodeJS.Timeout | undefined

  const clearTimers = (): void => {
    if (exitFallbackTimer) {
      clearTimeout(exitFallbackTimer)
      exitFallbackTimer = undefined
    }
    if (eofTimer) {
      clearTimeout(eofTimer)
      eofTimer = undefined
    }
  }

  const finalizeExit = (code: number | null, signal: NodeJS.Signals | null): void => {
    if (finalized)
      return
    finalized = true
    clearTimers()
    hooks.onExit(code, signal)
  }

  proc.on('exit', (code, signal) => {
    exitRecorded = { code, signal }
    if (typeof proc.pid !== 'number') {
      finalizeExit(code, signal)
      return
    }
    if (!finalized && !exitFallbackTimer) {
      exitFallbackTimer = setTimeout(() => {
        finalizeExit(exitRecorded?.code ?? code, exitRecorded?.signal ?? signal)
      }, 50)
      exitFallbackTimer.unref?.()
    }
  })

  proc.on('close', (code, signal) => {
    finalizeExit(exitRecorded?.code ?? code, exitRecorded?.signal ?? signal)
  })

  rl.on('close', () => {
    if (finalized)
      return
    if (exitRecorded) {
      if (!eofTimer) {
        eofTimer = setTimeout(() => {
          finalizeExit(exitRecorded?.code ?? null, exitRecorded?.signal ?? null)
        }, 10)
        eofTimer.unref?.()
      }
      return
    }
    if (hooks.onStdoutEof && !eofTimer) {
      eofTimer = setTimeout(() => {
        if (!finalized) {
          hooks.onStdoutEof?.()
        }
      }, 25)
      eofTimer.unref?.()
    }
  })

  proc.on('error', (err) => {
    clearTimers()
    const wasFinalized = finalized
    finalized = true
    const error = err instanceof Error ? err : new Error(String(err))
    if (!wasFinalized) {
      hooks.onError(error)
    }
  })

  return {
    markClosed: () => {
      finalized = true
      clearTimers()
    },
  }
}
