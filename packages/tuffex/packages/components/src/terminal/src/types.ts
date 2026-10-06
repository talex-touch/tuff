import type { ITheme } from '@xterm/xterm'

/** Raw terminal output. Binary data is interpreted by xterm as UTF-8. */
export type TerminalData = string | Uint8Array

export interface TerminalSize {
  cols: number
  rows: number
}

export interface TerminalLabels {
  ariaLabel: string
}

export const TERMINAL_DEFAULT_LABELS: Readonly<TerminalLabels> = {
  ariaLabel: 'Terminal',
}

/** Display operations only; a host owns transport and process execution. */
export interface TerminalInstance {
  /** Resolves once xterm has parsed the complete output; rejects after disposal. */
  write: (data: TerminalData) => Promise<void>
  writeln: (data: TerminalData) => Promise<void>
  clear: () => void
  reset: () => void
  focus: () => void
  fit: () => TerminalSize | null
  getSize: () => TerminalSize | null
}

export interface TerminalProps {
  readOnly?: boolean
  autoFocus?: boolean
  autoScroll?: boolean
  /** Log records, each followed by CRLF. Changes replace or append the display. */
  lines?: readonly TerminalData[]
  /** When supplied, fixes this dimension instead of fitting it to the host. */
  cols?: number
  rows?: number
  fontSize?: number
  fontFamily?: string
  /** Overrides individual host-token colors without disabling theme updates. */
  theme?: ITheme
  labels?: Partial<TerminalLabels>
}

export interface TerminalEmits {
  (event: 'data', data: string): void
  (event: 'resize', size: TerminalSize): void
  (event: 'ready', instance: TerminalInstance): void
}
