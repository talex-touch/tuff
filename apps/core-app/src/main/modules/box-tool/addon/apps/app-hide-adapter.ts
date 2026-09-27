import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'
import { getLogger } from '@talex-touch/utils/common/logger'

const execFileAsync = promisify(execFile)
const appHideLog = getLogger('app-hide')
const APP_HIDE_COMMAND_TIMEOUT_MS = 2_000

export interface AppShortcutTarget {
  /** macOS identity of the application: the scan reads it from the bundle's `Info.plist`. */
  bundleId?: string
  /** The `.app` bundle on macOS, the executable on Windows. */
  path: string
}

export interface AppPutAwayOutcome {
  /** True when the bound application was in front and is away now. */
  hidden: boolean
  /** Diagnostic only: the caller launches whenever nothing was put away. */
  reason?: string
}

/**
 * Puts the application a shortcut is bound to away, when it is the one in front.
 *
 * Asking and acting are one call on purpose. `NSWorkspace.frontmostApplication` is the same
 * instant's fact as the hide, and only the process holding that fact can be asked for it: this
 * app's own frontmost cache is seconds old, and `System Events`' frontmost query blocks while the
 * front application is busy — measured on this machine as three consecutive 1.5s timeouts followed
 * by a 30s suspension. A stale match hides an application the user never touched, and the same key
 * then cannot summon it back into a state the user expects.
 *
 * macOS: `NSRunningApplication.hide` is the ⌘H the Dock performs, and it needs no TCC approval —
 * unlike AppleScript `tell application … to hide` (Automation consent per application) or System
 * Events' `visible` setter (Accessibility).
 *
 * Windows: minimising the process's foreground window, which is what a second click on its taskbar
 * button does.
 */
const MAC_PUT_AWAY_SCRIPT = String.raw`ObjC.import('AppKit');
function run(argv) {
  const wantBundleId = String(argv[0] || '');
  const wantPath = String(argv[1] || '');
  const front = $.NSWorkspace.sharedWorkspace.frontmostApplication;
  if (!front || front.isNil()) return JSON.stringify({ hidden: false, reason: 'no-frontmost' });
  const bundleValue = front.bundleIdentifier;
  const bundleId = bundleValue ? String(ObjC.unwrap(bundleValue)) : '';
  const urlValue = front.bundleURL;
  const bundlePath = urlValue ? String(ObjC.unwrap(urlValue.path)) : '';
  const identified = (wantBundleId && bundleId === wantBundleId) || (wantPath && bundlePath === wantPath);
  if (!identified) return JSON.stringify({ hidden: false, reason: 'not-frontmost' });
  const pid = Number(front.processIdentifier);
  if (!Number.isFinite(pid) || pid <= 0) return JSON.stringify({ hidden: false, reason: 'no-pid' });
  front.hide;
  // Hiding lands asynchronously in AppKit; a fresh running-application handle is what proves it.
  delay(0.05);
  const current = $.NSRunningApplication.runningApplicationWithProcessIdentifier(pid);
  return JSON.stringify({ hidden: Boolean(current.hidden) });
}`

const WINDOWS_PUT_AWAY_SCRIPT = String.raw`$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class TuffAppPutAwayWinApi {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
}
"@
$wantPath = [string]$args[0]
$running = @()
try { $running = @(Get-Process | Where-Object { $_.Path -and $_.Path -ieq $wantPath }) } catch {}
if ($running.Count -eq 0) {
  [pscustomobject]@{ hidden = $false; reason = 'not-running' } | ConvertTo-Json -Compress
  exit 0
}
$handle = [TuffAppPutAwayWinApi]::GetForegroundWindow()
$foregroundId = [uint32]0
[TuffAppPutAwayWinApi]::GetWindowThreadProcessId($handle, [ref]$foregroundId) | Out-Null
$owned = $false
foreach ($candidate in $running) { if ([int]$candidate.Id -eq [int]$foregroundId) { $owned = $true } }
if (-not $owned) {
  [pscustomobject]@{ hidden = $false; reason = 'not-frontmost' } | ConvertTo-Json -Compress
  exit 0
}
$shown = [bool][TuffAppPutAwayWinApi]::ShowWindowAsync($handle, 6)
[pscustomobject]@{ hidden = $shown; reason = $(if ($shown) { $null } else { 'minimize-refused' }) } | ConvertTo-Json -Compress`

function parseOutcome(stdout: string): AppPutAwayOutcome | null {
  const line = stdout
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .at(-1)
  if (!line) return null

  try {
    const parsed = JSON.parse(line) as { hidden?: unknown; reason?: unknown }
    if (typeof parsed.hidden !== 'boolean') return null
    return {
      hidden: parsed.hidden,
      reason: typeof parsed.reason === 'string' ? parsed.reason : undefined
    }
  } catch {
    return null
  }
}

/**
 * False on every path that cannot answer — an unsupported platform, a refused call, an application
 * that is not the one in front — so the caller keeps its launch behaviour rather than trading a
 * working summon for a silent no-op.
 */
export async function putAwayApplicationInFront(
  target: AppShortcutTarget
): Promise<AppPutAwayOutcome> {
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await execFileAsync(
        'osascript',
        ['-l', 'JavaScript', '-e', MAC_PUT_AWAY_SCRIPT, target.bundleId ?? '', target.path],
        { timeout: APP_HIDE_COMMAND_TIMEOUT_MS }
      )
      return parseOutcome(stdout) ?? { hidden: false, reason: 'unparsable' }
    }

    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          WINDOWS_PUT_AWAY_SCRIPT,
          target.path
        ],
        { timeout: APP_HIDE_COMMAND_TIMEOUT_MS, windowsHide: true }
      )
      return parseOutcome(stdout) ?? { hidden: false, reason: 'unparsable' }
    }

    // Linux has no window-manager-independent way to put one application away, and an enumeration
    // per desktop environment is a dependency this key does not need. A second press then simply
    // activates the application again.
    return { hidden: false, reason: 'platform-unsupported' }
  } catch (error) {
    appHideLog.warn('Failed to put the application bound to a shortcut away', { error })
    return { hidden: false, reason: 'command-failed' }
  }
}
