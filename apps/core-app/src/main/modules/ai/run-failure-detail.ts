import { readProviderDetail } from './intelligence-error-normalizer'
import { redactProviderDetail } from './provider-detail-redaction'

/**
 * What ended a run, in words fit to show the person who started it.
 *
 * A run's public error is a fixed code (`AI_RUN_FAILED`) because the run record persists and a
 * plugin with the agents permission reads it. The cause is not part of that record: it travels in
 * memory from where the run failed to the Home conversation that owns it, which already keeps a
 * provider's own words for a failed chat turn. Same rule as there: one line, credential-shaped runs
 * and the home directory masked (`redactProviderDetail`), and absolute paths cut to their file
 * name - a stack frame's `/Users/me/project/x.ts:42` says which file, not whose machine.
 */

/** A path of two or more segments that is not the tail of a word, a `~` path or a URL's `//`. */
const UNIX_PATH = /(?<![\w~./])\/(?:[\w.@%+-]+\/)+([\w.@%+-]+)/g
const WINDOWS_PATH = /\b[A-Za-z]:\\(?:[^\\\s"']+\\)+([^\\\s"']+)/g

function messageOf(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message
    return typeof message === 'string' ? message : ''
  }
  return ''
}

/** Empty when the error says nothing: the caller then has nothing to add to the fixed code. */
export function projectRunFailureDetail(error: unknown): string {
  const raw = readProviderDetail(error) ?? messageOf(error)
  if (!raw.trim()) return ''
  const withoutPaths = raw.replace(UNIX_PATH, '…/$1').replace(WINDOWS_PATH, '…\\$1')
  return redactProviderDetail(withoutPaths)
}
