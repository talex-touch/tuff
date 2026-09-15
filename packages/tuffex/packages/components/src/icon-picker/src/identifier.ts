import type { TxIconSource, TxIconType } from '../../icon/src/types'

/**
 * The icon identifier: one string that round-trips a `TxIconSource`.
 *
 * `<type>:<value>` — `emoji:🚀`, `class:i-ri-rocket-line`, `file:/Users/me/a.png`,
 * `url:https://x/y.svg`, `builtin:star`.
 *
 * A string rather than the object because the callers that need this are
 * persisting it: a provider row in JSON, a plugin manifest, a settings record.
 * Those all already store strings, and a stored object invites half-written
 * shapes (`{ type: 'file' }` with no value) that every reader then has to
 * defend against. One string is either parseable or it is not.
 *
 * The separator is the first colon, so a value may contain colons — `url:` and
 * a Windows `file:C:/...` both do.
 */

const ICON_TYPES: Record<string, true> = {
  emoji: true,
  url: true,
  file: true,
  class: true,
  builtin: true,
}

/**
 * Parses an identifier, or `null` when it is empty or malformed.
 *
 * An unprefixed string is not guessed at. `i-ri-rocket-line` looks like a
 * class and `🚀` looks like an emoji, but `rocket.png` is ambiguous between a
 * file and a nonsense class, and a picker that silently resolves one wrong
 * produces an icon that renders as an empty box with no error anywhere. The
 * one exception is a bare emoji, below, which cannot be anything else.
 */
export function parseIconIdentifier(identifier: string | null | undefined): TxIconSource | null {
  const raw = (identifier ?? '').trim()
  if (!raw)
    return null

  const separator = raw.indexOf(':')
  if (separator > 0) {
    const type = raw.slice(0, separator) as TxIconType
    const value = raw.slice(separator + 1)
    if (ICON_TYPES[type] && value)
      return { type, value }
  }

  // A bare emoji is unambiguous: no other icon type is written as one.
  // Accepted because users paste emoji into plain-text fields constantly, and
  // rejecting `🚀` while accepting `emoji:🚀` is a distinction they never made.
  if (isEmoji(raw))
    return { type: 'emoji', value: raw }

  return null
}

/** Serializes a source. Returns `''` for a valueless source, which stores as "no icon". */
export function formatIconIdentifier(icon: TxIconSource | null | undefined): string {
  if (!icon?.value)
    return ''
  return `${icon.type}:${icon.value}`
}

/**
 * Whether a string is a single emoji.
 *
 * `Extended_Pictographic` alone is not enough: it matches the base of `👨‍💻`
 * but not its ZWJ joiner or the second base, so the anchored test fails on
 * every joined sequence — which is most of the interesting ones. `RGI_Emoji`
 * is the property that spans a whole sequence, including skin-tone modifiers
 * and flags.
 */
function isEmoji(value: string): boolean {
  try {
    // Constructor, not a literal: `v` mode is a *parse*-time feature, so a
    // literal would throw while the module is being compiled — before the
    // catch below can run — and take the whole picker down on any engine
    // older than Safari 17 / Node 20. Building it at runtime is what makes
    // the fallback reachable.
    // eslint-disable-next-line prefer-regex-literals
    return new RegExp('^\\p{RGI_Emoji}$', 'v').test(value)
  }
  catch {
    // `v` mode landed in Safari 17 / Node 20. On an older engine, fall back to
    // the pictographic base test: it under-accepts joined sequences rather
    // than over-accepting arbitrary text.
    return /^\p{Extended_Pictographic}/u.test(value)
  }
}
