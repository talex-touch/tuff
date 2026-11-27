export type WindowsPowerShellFailureCode =
  | 'powershell-not-found'
  | 'powershell-execution-policy'
  | 'powershell-timeout'
  | 'powershell-command-failed'
  | 'powershell-parse-failed'

export type WindowsBackendKind =
  | 'powershell'
  | 'reg-query'
  | 'filesystem'
  | 'electron-shortcut'
  | 'unavailable'

export interface WindowsBackendAttempt {
  backend: WindowsBackendKind
  command?: string
  status: 'ok' | 'failed' | 'skipped'
  reasonCode?: WindowsPowerShellFailureCode | 'fallback-failed' | 'empty-result'
  error?: string
  durationMs?: number
}

export interface WindowsSourceDiagnostics {
  status: 'ready' | 'degraded' | 'failed'
  backend: WindowsBackendKind
  fallbackUsed: boolean
  reasonCode?: WindowsPowerShellFailureCode | 'all-backends-failed'
  reason?: string
  recovery?: string
  attempts: WindowsBackendAttempt[]
}

export interface ClassifiedPowerShellError {
  code: WindowsPowerShellFailureCode
  summary: string
  recovery: string
}

export interface RegQueryBlock {
  keyPath: string
  values: Map<string, { type: string; value: string }>
}

export interface RegQueryUninstallRecord {
  displayName?: string
  displayIcon?: string
  installLocation?: string
  publisher?: string
  systemComponent?: number
  releaseType?: string
  parentKeyName?: string
}

export interface RegQueryAppPathRecord {
  name?: string
  executablePath?: string
  pathValue?: string
}

const EXECUTION_POLICY_PATTERNS = [
  /execution of scripts is disabled/i,
  /PSSecurityException/i,
  /AuthorizationManager/i,
  /ExecutionPolicy/i,
  /ConstrainedLanguage/i,
  /AppLocker/i,
  /blocked by group policy/i,
  /cannot be loaded because running scripts is disabled/i,
  /UnauthorizedAccess/i
]

const TIMEOUT_PATTERNS = [/timed out/i, /\bETIMEDOUT\b/i, /\bSIGTERM\b/i]

const RECOVERY_GUIDANCE: Record<WindowsPowerShellFailureCode, string> = {
  'powershell-not-found':
    'Windows PowerShell (powershell.exe) was not found in PATH. Desktop apps fall back to Start Menu and reg.exe; restore System32\\WindowsPowerShell\\v1.0 to PATH for UWP/Store app discovery.',
  'powershell-execution-policy':
    'PowerShell was blocked by ExecutionPolicy or enterprise security policy. Desktop apps fall back to Start Menu and reg.exe; check Get-ExecutionPolicy -List or contact your administrator if UWP/Store app discovery is required.',
  'powershell-timeout':
    'PowerShell command timed out. Desktop apps fall back to Start Menu and reg.exe; retry scanning once system load settles.',
  'powershell-command-failed':
    'PowerShell exited with an error. Desktop apps fall back to Start Menu and reg.exe; verify Windows PowerShell availability in a terminal.',
  'powershell-parse-failed':
    'PowerShell output could not be parsed as JSON (profile noise or encoding mismatch). Desktop apps fall back to Start Menu and reg.exe.'
}

function readErrorText(error: unknown): {
  code: string
  message: string
  combined: string
  timedOut: boolean
} {
  if (!error || typeof error !== 'object') {
    const message = String(error ?? '')
    return { code: '', message, combined: message, timedOut: false }
  }
  const err = error as {
    code?: unknown
    message?: unknown
    stderr?: unknown
    stdout?: unknown
    killed?: unknown
    signal?: unknown
  }
  const code = err.code !== undefined && err.code !== null ? String(err.code) : ''
  const message = typeof err.message === 'string' ? err.message : String(error)
  const stderr = Buffer.isBuffer(err.stderr)
    ? err.stderr.toString('utf8')
    : typeof err.stderr === 'string'
      ? err.stderr
      : ''
  const stdout = Buffer.isBuffer(err.stdout)
    ? err.stdout.toString('utf8')
    : typeof err.stdout === 'string'
      ? err.stdout
      : ''
  const combined = [message, stderr, stdout].filter(Boolean).join('\n')
  const timedOut =
    err.killed === true ||
    err.signal === 'SIGTERM' ||
    code === 'ETIMEDOUT' ||
    TIMEOUT_PATTERNS.some((pattern) => pattern.test(combined))
  return { code, message, combined, timedOut }
}

export function getWindowsPowerShellRecovery(code: WindowsPowerShellFailureCode): string {
  return RECOVERY_GUIDANCE[code]
}

export function classifyWindowsPowerShellError(error: unknown): ClassifiedPowerShellError {
  if (error instanceof SyntaxError) {
    return {
      code: 'powershell-parse-failed',
      summary: error.message || 'PowerShell JSON output could not be parsed',
      recovery: RECOVERY_GUIDANCE['powershell-parse-failed']
    }
  }

  const { code, message, combined, timedOut } = readErrorText(error)

  if (
    code === 'ENOENT' ||
    /\bENOENT\b/i.test(combined) ||
    /spawn\s+powershell(\.exe)?\s+ENOENT/i.test(combined)
  ) {
    return {
      code: 'powershell-not-found',
      summary: 'PowerShell executable not found (ENOENT)',
      recovery: RECOVERY_GUIDANCE['powershell-not-found']
    }
  }

  if (EXECUTION_POLICY_PATTERNS.some((pattern) => pattern.test(combined))) {
    return {
      code: 'powershell-execution-policy',
      summary: message || 'PowerShell execution blocked by policy',
      recovery: RECOVERY_GUIDANCE['powershell-execution-policy']
    }
  }

  if (timedOut) {
    return {
      code: 'powershell-timeout',
      summary: message || 'PowerShell command timed out',
      recovery: RECOVERY_GUIDANCE['powershell-timeout']
    }
  }

  return {
    code: 'powershell-command-failed',
    summary: message || 'PowerShell command failed',
    recovery: RECOVERY_GUIDANCE['powershell-command-failed']
  }
}

export function buildWindowsPowerShellArgs(
  script: string,
  options: { bypassExecutionPolicy?: boolean } = {}
): string[] {
  const args = ['-NoProfile', '-NonInteractive']
  if (options.bypassExecutionPolicy !== false) {
    args.push('-ExecutionPolicy', 'Bypass')
  }
  args.push('-Command', script)
  return args
}

/**
 * Parses `reg.exe query <key> [/s]` text output into structured key blocks without PowerShell.
 */
export function parseRegQueryBlocks(stdout: string): RegQueryBlock[] {
  const blocks: RegQueryBlock[] = []
  let current: RegQueryBlock | null = null

  for (const rawLine of stdout.split(/\r?\n/)) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue

    if (/^HKEY_[A-Z_]+\\/i.test(trimmed)) {
      current = { keyPath: trimmed, values: new Map() }
      blocks.push(current)
      continue
    }

    if (!current) continue
    const match = rawLine.match(/^\s+(.+?)\s{2,}(REG_[A-Z0-9_]+)\s{2,}(.*)$/)
    if (!match) continue
    const name = match[1].trim()
    const type = match[2].trim()
    const value = match[3].trim()
    current.values.set(name.toLowerCase(), { type, value })
  }

  return blocks
}

function parseRegDword(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const trimmed = raw.trim()
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 16)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  const parsed = Number.parseInt(trimmed, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function parseRegQueryUninstallRecords(stdout: string): RegQueryUninstallRecord[] {
  const records: RegQueryUninstallRecord[] = []
  for (const block of parseRegQueryBlocks(stdout)) {
    const displayName = block.values.get('displayname')?.value?.trim()
    if (!displayName) continue
    records.push({
      displayName,
      displayIcon: block.values.get('displayicon')?.value?.trim() || undefined,
      installLocation: block.values.get('installlocation')?.value?.trim() || undefined,
      publisher: block.values.get('publisher')?.value?.trim() || undefined,
      systemComponent: parseRegDword(block.values.get('systemcomponent')?.value),
      releaseType: block.values.get('releasetype')?.value?.trim() || undefined,
      parentKeyName: block.values.get('parentkeyname')?.value?.trim() || undefined
    })
  }
  return records
}

export function parseRegQueryAppPathRecords(stdout: string): RegQueryAppPathRecord[] {
  const records: RegQueryAppPathRecord[] = []
  for (const block of parseRegQueryBlocks(stdout)) {
    const defaultEntry =
      block.values.get('(default)') ??
      Array.from(block.values.entries()).find(
        ([name]) => name.startsWith('(') && name.endsWith(')')
      )?.[1]
    const defaultValue = defaultEntry?.value?.trim()
    if (!defaultValue) continue
    const segments = block.keyPath.split('\\')
    const keyName = segments[segments.length - 1] || ''
    if (!keyName || keyName.toLowerCase() === 'app paths') continue
    records.push({
      name: keyName,
      executablePath: defaultValue,
      pathValue: block.values.get('path')?.value?.trim() || undefined
    })
  }
  return records
}

export function parseRegQueryPathValues(stdout: string): string[] {
  const values: string[] = []
  for (const block of parseRegQueryBlocks(stdout)) {
    const value = block.values.get('path')?.value?.trim()
    if (value) values.push(value)
  }
  return values
}

export interface WindowsSourceScanEvidenceInput<TKey extends string = string> {
  sourceId: TKey
  label: string
  apps: readonly unknown[]
  error?: string
  diagnostics?: WindowsSourceDiagnostics
}

export function mapWindowsSourceResultsToGroupedEvidence<TKey extends string>(
  results: readonly WindowsSourceScanEvidenceInput<TKey>[]
): Array<{
  sourceId: TKey
  label: string
  itemCount: number
  error?: string
  metadata?: Record<string, unknown>
}> {
  return results.map((result) => {
    const diagnostics = result.diagnostics
    const fallbackReason =
      !result.error && diagnostics?.fallbackUsed && diagnostics.reasonCode
        ? `${diagnostics.reasonCode} (fallback: ${diagnostics.backend})`
        : undefined
    return {
      sourceId: result.sourceId,
      label: result.label,
      itemCount: result.apps.length,
      error: result.error ?? fallbackReason,
      ...(diagnostics
        ? {
            metadata: {
              backend: diagnostics.backend,
              fallbackUsed: diagnostics.fallbackUsed,
              ...(diagnostics.reasonCode ? { reasonCode: diagnostics.reasonCode } : {}),
              ...(diagnostics.recovery ? { recovery: diagnostics.recovery } : {}),
              diagnostics
            }
          }
        : {})
    }
  })
}
