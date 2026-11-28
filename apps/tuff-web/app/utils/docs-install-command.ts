/**
 * Docs code blocks that are a single `pnpm add` / `pnpm dlx` line render as a
 * package-manager switch. Only commands that translate faithfully qualify:
 * one line, `add` with at most a leading `-D` and no quoting, or `dlx`, whose
 * arguments are carried over exactly as written; anything else is shown as
 * written.
 */

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

export const PACKAGE_MANAGERS: readonly PackageManager[] = ['pnpm', 'npm', 'yarn', 'bun']

export interface InstallCommand {
  kind: 'add' | 'dlx'
  /** `add` only: the packages go to devDependencies. */
  dev: boolean
  /** Packages for `add`; the command and its arguments for `dlx`. */
  rest: string
}

const SHELLS = new Set(['bash', 'sh', 'shell', 'zsh'])

export function parseInstallCommand(code: string | undefined, lang: string | undefined): InstallCommand | null {
  if (!SHELLS.has((lang ?? '').toLowerCase()))
    return null
  const lines = (code ?? '').trim().split('\n')
  if (lines.length !== 1)
    return null
  const match = /^pnpm (add|dlx) (.+)$/.exec(lines[0]!.trim())
  if (!match)
    return null
  // The runner is the only part that changes, so a `dlx` command keeps its own
  // spacing and quoting.
  if (match[1] === 'dlx')
    return { kind: 'dlx', dev: false, rest: match[2]!.trim() }
  // Packages are re-joined one space apart, which a quoted argument would not survive.
  if (/["'`\\]/.test(match[2]!))
    return null
  const args = match[2]!.trim().split(/\s+/)
  const dev = args[0] === '-D'
  const packages = dev ? args.slice(1) : args
  if (!packages.length || packages.some(arg => arg.startsWith('-')))
    return null
  return { kind: 'add', dev, rest: packages.join(' ') }
}

const RUN: Record<PackageManager, string> = { pnpm: 'pnpm dlx', npm: 'npx', yarn: 'yarn dlx', bun: 'bunx' }
const ADD: Record<PackageManager, string> = { pnpm: 'pnpm add', npm: 'npm install', yarn: 'yarn add', bun: 'bun add' }

export function formatInstallCommand(command: InstallCommand, manager: PackageManager): string {
  if (command.kind === 'dlx')
    return `${RUN[manager]} ${command.rest}`
  // bun spells the dev flag in lower case
  const dev = command.dev ? (manager === 'bun' ? ' -d' : ' -D') : ''
  return `${ADD[manager]}${dev} ${command.rest}`
}
