const DEFAULT_BEFORE_QUIT_TIMEOUT_MS = 8_000

export interface BeforeQuitGuardResult {
  timedOut: boolean
  durationMs: number
}

export async function runWithBeforeQuitTimeout(
  task: () => Promise<void>,
  timeoutMs = DEFAULT_BEFORE_QUIT_TIMEOUT_MS
): Promise<BeforeQuitGuardResult> {
  const startedAt = Date.now()
  let timeoutHandle: NodeJS.Timeout | null = null

  const timedOut = await new Promise<boolean>((resolve, reject) => {
    let settled = false
    timeoutHandle = setTimeout(() => {
      if (settled) return
      settled = true
      resolve(true)
    }, timeoutMs)

    task()
      .then(() => {
        if (settled) return
        settled = true
        resolve(false)
      })
      .catch((error) => {
        if (settled) return
        settled = true
        reject(error)
      })
  }).finally(() => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
      timeoutHandle = null
    }
  })

  return {
    timedOut,
    durationMs: Date.now() - startedAt
  }
}
