export type SystemPermissionStatus = 'granted' | 'denied' | 'notDetermined' | 'unsupported'

export interface SystemPermissionCheckResult {
  status: SystemPermissionStatus
  canRequest: boolean
  message?: string
}

export interface WaitForPermissionGrantOptions {
  attempts?: number
  intervalMs?: number
  shouldContinue?: () => boolean
}

const DEFAULT_ATTEMPTS = 30
const DEFAULT_INTERVAL_MS = 1000

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve()
  }
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function waitForPermissionGrant(
  check: () => Promise<SystemPermissionCheckResult>,
  options: WaitForPermissionGrantOptions = {}
): Promise<SystemPermissionCheckResult> {
  const attempts = options.attempts ?? DEFAULT_ATTEMPTS
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS

  let latest = await check()
  for (let attempt = 0; latest.status !== 'granted' && attempt < attempts; attempt += 1) {
    if (options.shouldContinue?.() === false) {
      return latest
    }
    await delay(intervalMs)
    if (options.shouldContinue?.() === false) {
      return latest
    }
    latest = await check()
  }

  return latest
}
