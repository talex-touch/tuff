import type { RunMeta } from '../eval-types'
import { shellQuote } from './format'

const COMMANDS = new Set(['run', 'gen', 'report', 'probe', 'doctor'])
const LAUNCHER = 'pnpm search:stress'

function hasFlag(argv: readonly string[], name: string): boolean {
  return argv.some((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`))
}

/**
 * The command that repeats this run. `meta.argv` is either the CLI arguments (`run --profile full`)
 * or a whole `process.argv`, which is printed as recorded. For CLI arguments, profile and seed are
 * added when the run left them at their defaults, so the command never depends on those.
 */
export function reproductionCommand(meta: RunMeta): string {
  const argv = meta.argv
  if (argv.length > 0 && !COMMANDS.has(argv[0])) return argv.map(shellQuote).join(' ')
  const args = argv.length === 0 ? ['run'] : [...argv]
  if (args[0] === 'run') {
    if (!hasFlag(args, 'profile') && meta.profile) args.push('--profile', meta.profile)
    if (!hasFlag(args, 'seed')) args.push('--seed', String(meta.seed))
  }
  return [LAUNCHER, ...args.map(shellQuote)].join(' ')
}
