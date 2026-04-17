import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const XDTOOL_PROBE_TIMEOUT_MS = 1_500
const XDTOOL_UNAVAILABLE_REASON =
  'Linux desktop automation requires xdotool to be installed and available in PATH.'

let xdotoolAvailabilityProbe: Promise<boolean> | null = null

export function getXdotoolUnavailableReason(): string {
  return XDTOOL_UNAVAILABLE_REASON
}

export async function isXdotoolAvailable(): Promise<boolean> {
  if (process.platform !== 'linux') {
    return false
  }

  if (!xdotoolAvailabilityProbe) {
    xdotoolAvailabilityProbe = execFileAsync('xdotool', ['--version'], {
      timeout: XDTOOL_PROBE_TIMEOUT_MS
    })
      .then(() => true)
      .catch(() => false)
  }

  return await xdotoolAvailabilityProbe
}

export async function ensureXdotoolAvailable(): Promise<void> {
  if (process.platform !== 'linux') {
    return
  }

  const available = await isXdotoolAvailable()
  if (!available) {
    throw new Error(XDTOOL_UNAVAILABLE_REASON)
  }
}
