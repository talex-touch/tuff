/**
 * Payload emitted when the user clicks the run button on a shell code block.
 *
 * @public
 */
export interface CodeRunPayload {
  /** Normalized lowercase language identifier (e.g. `bash`, `sh`, `zsh`). */
  lang: string
  /** Raw source text of the code block. */
  code: string
}

/**
 * Fence languages that represent runnable shell or command snippets.
 * Shared across `TxCodeStream` and `TxCodeBlock` so both code-block surfaces
 * expose the run control for the exact same language set.
 */
export const RUNNABLE_SHELL_LANGUAGES = new Set([
  'bash',
  'sh',
  'shell',
  'zsh',
  'fish',
  'ksh',
  'csh',
  'dash',
  'console',
  'terminal',
  'shellsession',
  'shell-session',
  'cmd',
  'bat',
  'batch',
  'powershell',
  'pwsh',
  'ps1',
])

export function isRunnableShellLanguage(lang?: string): boolean {
  if (!lang)
    return false
  return RUNNABLE_SHELL_LANGUAGES.has(lang.trim().toLowerCase())
}
