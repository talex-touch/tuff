export interface ShellTerminalCommandRequest {
  id: number
  command: string
  cwd?: string
  lang?: string
}

export interface BuildTerminalInputOptions {
  command: string
  cwd?: string
  lang?: string
  currentCwd?: string
  platform?: 'win32' | 'posix'
}

export interface BuiltTerminalInput {
  input: string
  nextCwd?: string
}

const PROMPT_PREFIX_RE = /^\$\s+/

/**
 * Normalizes a shell code snippet for direct PTY submission:
 * - normalizes CRLF/CR to LF
 * - strips leading/trailing empty lines while preserving internal indentation
 * - strips leading `$ ` shell prompts when every non-empty line is prompt-prefixed
 */
export function normalizeShellCommand(raw: string): string | null {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n')

  while (lines.length > 0 && lines[0]!.trim() === '') {
    lines.shift()
  }
  while (lines.length > 0 && lines[lines.length - 1]!.trim() === '') {
    lines.pop()
  }
  if (lines.length === 0) return null

  const nonEmptyLines = lines.filter((line) => line.trim() !== '')
  const allPromptPrefixed =
    nonEmptyLines.length > 0 && nonEmptyLines.every((line) => PROMPT_PREFIX_RE.test(line))

  const cleaned = allPromptPrefixed
    ? lines.map((line) => (PROMPT_PREFIX_RE.test(line) ? line.replace(PROMPT_PREFIX_RE, '') : line))
    : lines

  const joined = cleaned.join('\n').trimEnd()
  return joined.trim() ? joined : null
}

/**
 * Builds a shell-safe `cd` command for the target platform.
 * Returns null if `cwd` is empty or contains unsafe control characters.
 */
export function formatCdCommand(cwd: string, platform: 'win32' | 'posix' = 'posix'): string | null {
  const trimmed = cwd.trim()
  if (!trimmed || /[\0\r\n]/.test(trimmed)) return null

  if (platform === 'win32') {
    if (trimmed.includes('"')) return null
    return `cd /d "${trimmed}"`
  }

  const escaped = trimmed.replace(/'/g, `'\\''`)
  return `cd -- '${escaped}'`
}

/**
 * Converts a queued shell command request into raw PTY stdin bytes (`\r`-terminated),
 * prefixing a safe `cd` when the target `cwd` differs from the session's known directory.
 */
export function buildTerminalInput(options: BuildTerminalInputOptions): BuiltTerminalInput | null {
  const normalized = normalizeShellCommand(options.command)
  if (!normalized) return null

  const targetCwd = options.cwd?.trim() || undefined
  const currentCwd = options.currentCwd?.trim() || undefined
  const platform = options.platform ?? 'posix'

  const needsCd = Boolean(targetCwd && targetCwd !== currentCwd)
  const cdCommand = needsCd && targetCwd ? formatCdCommand(targetCwd, platform) : null
  const ptyCommand = normalized.replace(/\n/g, '\r')

  let input: string
  if (cdCommand) {
    if (normalized.includes('\n')) {
      input =
        platform === 'win32'
          ? `${cdCommand} && (\r${ptyCommand}\r)\r`
          : `${cdCommand} && {\r${ptyCommand}\r}\r`
    } else {
      input = `${cdCommand} && ${ptyCommand}\r`
    }
  } else {
    input = `${ptyCommand}\r`
  }

  return {
    input,
    nextCwd: undefined
  }
}
