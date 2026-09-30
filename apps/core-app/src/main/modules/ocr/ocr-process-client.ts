import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { app, utilityProcess, type UtilityProcess } from 'electron'
import type { NativeOcrBlock, NativeOcrOptions, NativeOcrResult } from '@talex-touch/tuff-native'

/**
 * One-shot OCR transport. A request owns exactly one Electron utility process, so a native OCR
 * hang or SIGABRT can only take down that child -- never the main process or a shared worker
 * thread. Timeouts and cancellations terminate the OS process instead of tearing down a Node
 * environment while the N-API completion callback is still unwinding.
 */
const DEFAULT_OCR_PROCESS_TIMEOUT_MS = 30_000
const OCR_PROCESS_CHILD_FILENAME = 'ocr-process.js'
const OCR_PROCESS_SERVICE_NAME = 'Tuff OCR Runtime'

export interface OcrProcessRequest {
  type: 'ocr.request'
  requestId: string
  options: NativeOcrOptions
}

export interface OcrProcessSuccessMessage {
  type: 'ocr.success'
  requestId: string
  result: NativeOcrResult
}

export interface OcrProcessErrorMessage {
  type: 'ocr.error'
  requestId: string
  code?: string
  message: string
}

export interface OcrProcessInvocation {
  timeoutMs?: number
  signal?: AbortSignal
}

const createProcessError = (code: string, message: string): Error & { code: string } =>
  Object.assign(new Error(message), { code })

function resolveChildPath(): string {
  const candidates = new Set<string>([path.join(__dirname, OCR_PROCESS_CHILD_FILENAME)])
  const resourcesPath = process.resourcesPath
  if (typeof resourcesPath === 'string' && resourcesPath.length > 0) {
    candidates.add(
      path.join(resourcesPath, 'app.asar.unpacked', 'out', 'main', OCR_PROCESS_CHILD_FILENAME)
    )
    candidates.add(path.join(resourcesPath, 'app.asar', 'out', 'main', OCR_PROCESS_CHILD_FILENAME))
    candidates.add(path.join(resourcesPath, 'out', 'main', OCR_PROCESS_CHILD_FILENAME))
  }
  candidates.add(path.resolve(process.cwd(), 'out', 'main', OCR_PROCESS_CHILD_FILENAME))

  const all = Array.from(candidates)
  const found = all.find((candidate) => existsSync(candidate))
  if (!found) {
    throw new Error(`OCR process entry not found: ${all.join(', ')}`)
  }
  return found
}

function parseNativeResult(value: unknown): NativeOcrResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (typeof raw.text !== 'string') return null
  if (raw.engine !== 'apple-vision' && raw.engine !== 'windows-ocr') return null
  if (typeof raw.durationMs !== 'number' || !Number.isFinite(raw.durationMs)) return null

  const result: NativeOcrResult = {
    text: raw.text,
    engine: raw.engine,
    durationMs: raw.durationMs
  }
  if (typeof raw.confidence === 'number') result.confidence = raw.confidence
  if (typeof raw.language === 'string') result.language = raw.language
  if (Array.isArray(raw.blocks)) result.blocks = raw.blocks as NativeOcrBlock[]
  return result
}

export async function recognizeImageTextIsolated(
  options: NativeOcrOptions,
  invocation?: OcrProcessInvocation
): Promise<NativeOcrResult> {
  const signal = invocation?.signal
  if (signal?.aborted) {
    throw createProcessError(
      'OCR_PROCESS_ABORTED',
      'OCR process request was aborted before it started'
    )
  }

  let childPath: string
  try {
    childPath = resolveChildPath()
  } catch (error) {
    throw createProcessError(
      'OCR_PROCESS_EXITED',
      error instanceof Error ? error.message : String(error)
    )
  }

  const timeoutMs =
    typeof invocation?.timeoutMs === 'number' &&
    Number.isFinite(invocation.timeoutMs) &&
    invocation.timeoutMs > 0
      ? invocation.timeoutMs
      : DEFAULT_OCR_PROCESS_TIMEOUT_MS
  const requestId = randomUUID()

  return await new Promise<NativeOcrResult>((resolve, reject) => {
    let settled = false
    let childExited = false
    let child: UtilityProcess | null = null
    let timer: NodeJS.Timeout | null = null
    let quitHookArmed = false
    let quitListener: (() => void) | null = null

    const disarmQuitHook = (): void => {
      if (!quitHookArmed) return
      quitHookArmed = false
      if (quitListener) app.off('before-quit', quitListener)
      quitListener = null
    }

    const detach = (): void => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      disarmQuitHook()
      if (signal) signal.removeEventListener('abort', handleAbort)
      if (child) {
        child.off('message', handleMessage)
        child.off('exit', handleExit)
        child.off('error', handleError)
        child.off('spawn', handleSpawn)
      }
    }

    const settleSuccess = (result: NativeOcrResult): void => {
      if (settled) return
      settled = true
      detach()
      resolve(result)
    }

    const settleFailure = (error: Error, killChild: boolean): void => {
      if (settled) return
      settled = true
      detach()
      if (killChild && child && !childExited) {
        try {
          child.kill()
        } catch {
          // The child may already be gone; the exit path has its own settlement.
        }
      }
      reject(error)
    }

    function handleAbort(): void {
      settleFailure(
        createProcessError('OCR_PROCESS_ABORTED', 'OCR process request was aborted'),
        true
      )
    }

    function handleMessage(message: unknown): void {
      if (settled) return
      if (!message || typeof message !== 'object' || Array.isArray(message)) return
      const payload = message as Record<string, unknown>
      if (payload.requestId !== requestId) return

      if (payload.type === 'ocr.success') {
        const result = parseNativeResult(payload.result)
        if (!result) {
          settleFailure(
            createProcessError(
              'OCR_PROCESS_INVALID_RESPONSE',
              'OCR process returned a malformed result'
            ),
            false
          )
          return
        }
        settleSuccess(result)
        return
      }

      if (payload.type === 'ocr.error') {
        const text =
          typeof payload.message === 'string' && payload.message.length > 0
            ? payload.message
            : 'OCR process failed'
        const error = new Error(text) as Error & { code?: string }
        if (typeof payload.code === 'string' && payload.code.length > 0) {
          error.code = payload.code
        }
        settleFailure(error, false)
      }
    }

    function handleSpawn(): void {
      postRequest()
    }

    function handleExit(code: number | null | undefined): void {
      childExited = true
      if (settled) return
      if (signal?.aborted) {
        settleFailure(
          createProcessError('OCR_PROCESS_ABORTED', 'OCR process request was aborted'),
          false
        )
        return
      }
      if (typeof code !== 'number' || code === 0) {
        settleFailure(
          createProcessError(
            'OCR_PROCESS_INVALID_RESPONSE',
            `OCR process exited before returning a result (code ${String(code)})`
          ),
          false
        )
        return
      }
      settleFailure(
        createProcessError('OCR_PROCESS_EXITED', `OCR process exited with code ${code}`),
        false
      )
    }

    function handleError(...args: unknown[]): void {
      if (settled) return
      if (signal?.aborted) {
        settleFailure(
          createProcessError('OCR_PROCESS_ABORTED', 'OCR process request was aborted'),
          false
        )
        return
      }
      const fatalType = args.find((value): value is string => typeof value === 'string')
      settleFailure(
        createProcessError(
          'OCR_PROCESS_EXITED',
          fatalType ? `OCR process fatal error: ${fatalType}` : 'OCR process fatal error'
        ),
        false
      )
    }

    if (signal) {
      signal.addEventListener('abort', handleAbort, { once: true })
    }

    try {
      child = utilityProcess.fork(childPath, [], {
        cwd: app.getPath('userData'),
        stdio: 'pipe',
        serviceName: OCR_PROCESS_SERVICE_NAME
      })
    } catch (error) {
      settleFailure(
        createProcessError(
          'OCR_PROCESS_EXITED',
          error instanceof Error ? error.message : String(error)
        ),
        false
      )
      return
    }

    const forkedChild = child
    forkedChild.on('message', handleMessage)
    forkedChild.on('exit', handleExit)
    forkedChild.on('error', handleError)
    forkedChild.once('spawn', handleSpawn)
    // Drain piped streams: an unconsumed pipe can fill and block the child mid-recognition.
    forkedChild.stdout?.on('data', () => {})
    forkedChild.stderr?.on('data', () => {})

    // Reclaim the child if the app quits mid-recognition: an orphaned utility process would keep
    // native OCR running after the parent is gone. Disarmed on every settle.
    quitListener = () => {
      settleFailure(
        createProcessError('OCR_PROCESS_ABORTED', 'OCR process request was aborted during quit'),
        true
      )
    }
    quitHookArmed = true
    app.on('before-quit', quitListener)

    // The deadline is armed before the spawn wait so a child that never reports 'spawn' is still
    // reclaimed. Its clock is not reset once the request goes out.
    timer = setTimeout(() => {
      settleFailure(
        createProcessError('OCR_PROCESS_TIMEOUT', `OCR process timed out after ${timeoutMs}ms`),
        true
      )
    }, timeoutMs)

    const postRequest = (): void => {
      const request: OcrProcessRequest = { type: 'ocr.request', requestId, options }
      try {
        forkedChild.postMessage(request)
      } catch (error) {
        settleFailure(
          createProcessError(
            'OCR_PROCESS_EXITED',
            error instanceof Error ? error.message : String(error)
          ),
          true
        )
      }
    }

    // A utility process only reliably receives messages once it has spawned; posting straight
    // after fork can be dropped, leaving the child idle until the deadline. pid being present
    // means it already spawned, so skip the wait rather than stalling on a late event.
    if (forkedChild.pid !== undefined && !settled) {
      postRequest()
    }
  })
}
