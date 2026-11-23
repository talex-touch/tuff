import fs from 'node:fs/promises'
import chalk from 'chalk'
import { logApp } from './app-provider-log'
import { LogStyle } from './app-utils'

// Install-to-searchable budget for one app, summed across the watch chain:
//   FSEvents dispatch  0.1-1s   (OS, chokidar-fsevents)
// + event coalescing   0.4s     (APP_WATCH_COALESCE_WINDOW_MS, indexed-source-event-router)
// + stability wait     0.55s    (APP_STABILITY_PROBE_INTERVAL_MS + APP_STABILITY_SETTLE_MS)
// + app info + upsert  ~0.35s
//   = 1.5-2.5s against a 10s target.
// The shared watcher now uses a bounded 500ms write-settle window; the probe pair still catches a
// bundle that is being copied in after the first stable filesystem notification.
export const APP_STABILITY_PROBE_INTERVAL_MS = 300
export const APP_STABILITY_SETTLE_MS = 250
export const APP_STABILITY_DEFAULT_RETRIES = 5

export interface ItemStabilityStats {
  size: number
  mtimeMs: number
  isDirectory(): boolean
}

export type ItemStabilityResult =
  | { status: 'stable' }
  | { status: 'changing'; attempts: number }
  | { status: 'missing'; error: unknown }
  | { status: 'error'; error: unknown }
  | { status: 'aborted' }

export interface WaitForItemStabilityOptions {
  delayMs?: number
  retries?: number
  settleMs?: number
  signal?: AbortSignal
  stat?: (itemPath: string) => Promise<ItemStabilityStats>
  wait?: (ms: number, signal?: AbortSignal) => Promise<boolean>
}

// A `.app` is a directory whose st_size is constant (96 on APFS) however much is still being
// copied into it, so comparing sizes declared every bundle stable on the first probe. The
// directory mtime moves as entries land; files keep the size comparison and add mtime.
export function getItemStabilityFingerprint(stats: ItemStabilityStats): string {
  return stats.isDirectory() ? `dir:${stats.mtimeMs}` : `file:${stats.size}:${stats.mtimeMs}`
}

export function isMissingItemError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | null | undefined)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

export function getRetryableStabilityError(result: ItemStabilityResult): unknown | null {
  if (result.status === 'changing') {
    return new Error(`APP_ITEM_UNSTABLE: item still changing after ${result.attempts} probes`)
  }
  if (result.status === 'error') {
    return result.error
  }
  return null
}

async function waitAbortable(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return false
  return await new Promise<boolean>((resolve) => {
    let settled = false
    let timer: NodeJS.Timeout | null = null
    function onAbort(): void {
      finish(false)
    }
    function finish(completed: boolean): void {
      if (settled) return
      settled = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      signal?.removeEventListener('abort', onAbort)
      resolve(completed)
    }
    timer = setTimeout(() => finish(true), ms)
    timer.unref?.()
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function waitForItemStability(
  itemPath: string,
  options: WaitForItemStabilityOptions = {}
): Promise<ItemStabilityResult> {
  const delayMs = Math.max(0, options.delayMs ?? APP_STABILITY_PROBE_INTERVAL_MS)
  const retries = Math.max(1, Math.floor(options.retries ?? APP_STABILITY_DEFAULT_RETRIES))
  const settleMs = Math.max(0, options.settleMs ?? APP_STABILITY_SETTLE_MS)
  const signal = options.signal
  const statFn = options.stat ?? ((target: string) => fs.stat(target))
  const waitFn = options.wait ?? waitAbortable

  if (signal?.aborted) {
    return { status: 'aborted' }
  }

  logApp(`Waiting for item to stabilize: ${chalk.cyan(itemPath)}`, LogStyle.info)

  for (let i = 0; i < retries; i += 1) {
    if (signal?.aborted) {
      return { status: 'aborted' }
    }

    try {
      const fingerprint1 = getItemStabilityFingerprint(await statFn(itemPath))
      if (signal?.aborted) {
        return { status: 'aborted' }
      }

      const waited = await waitFn(delayMs, signal)
      if (!waited || signal?.aborted) {
        return { status: 'aborted' }
      }

      const fingerprint2 = getItemStabilityFingerprint(await statFn(itemPath))
      if (signal?.aborted) {
        return { status: 'aborted' }
      }

      if (fingerprint1 === fingerprint2) {
        logApp(`Item stabilized: ${chalk.green(itemPath)}`, LogStyle.success)
        if (settleMs > 0) {
          const settled = await waitFn(settleMs, signal)
          if (!settled || signal?.aborted) {
            return { status: 'aborted' }
          }
        }
        return { status: 'stable' }
      }

      logApp(
        `Item still changing: ${chalk.yellow(itemPath)}, retry ${i + 1}/${retries}`,
        LogStyle.info
      )
    } catch (error) {
      if (signal?.aborted) {
        return { status: 'aborted' }
      }
      if (isMissingItemError(error)) {
        logApp(
          `Item disappeared while checking stability: ${chalk.yellow(itemPath)}`,
          LogStyle.warning
        )
        return { status: 'missing', error }
      }
      logApp(
        `Failed to check item stability: ${chalk.red(
          error instanceof Error ? error.message : String(error)
        )}`,
        LogStyle.error
      )
      return { status: 'error', error }
    }
  }

  logApp(`Item did not stabilize: ${chalk.yellow(itemPath)}`, LogStyle.warning)
  return { status: 'changing', attempts: retries }
}
