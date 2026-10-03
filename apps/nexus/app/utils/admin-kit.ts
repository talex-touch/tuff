import type { StatCardInsight } from '@talex-touch/tuffex/stat-card'

/**
 * Pure rules behind the administrator console components in
 * `components/admin/`. Kept out of the SFCs so they are tested directly.
 */

/** One card of `AdminStatGrid`. */
export interface AdminStatItem {
  key: string
  label: string
  /** A number is printed by TxStatCard in en-US; pass a `useAdminFormat()` string to follow the locale. */
  value: number | string
  meta?: string
  iconClass?: string
  insight?: StatCardInsight
}

export interface AdminIdentityInput {
  name?: string | null
  email?: string | null
  /** Shown when there is neither a name nor an email — an account id, say. */
  fallback?: string | null
}

export interface AdminIdentityDisplay {
  /** The name, or the email when there is no name: never both on one line. */
  primary: string
  /** The email under a name; `null` when it would only repeat `primary`. */
  secondary: string | null
  /** One letter, digit or CJK character for the avatar; `''` when there is none. */
  initial: string
  /** Everything known, for a `title` tooltip. */
  title: string
}

const NAME_CHARACTER = /[\p{L}\p{N}]/u

/**
 * The avatar initial: the first letter or digit, skipping brackets, emoji and
 * other symbols. Taking the first code unit gave "[R" and "[江" for names that
 * start with a bracket, and half a surrogate pair for one that starts with emoji.
 */
export function adminIdentityInitial(text: string | null | undefined): string {
  for (const character of text ?? '') {
    if (NAME_CHARACTER.test(character))
      return character.toLocaleUpperCase()
  }
  return ''
}

/**
 * What an identity cell shows. The audit log printed the email twice for an
 * administrator without a name — once as the name fallback, then again on the
 * line under it — so the email moves up when there is no name and the second
 * line only exists when it says something new.
 */
export function resolveAdminIdentity(input: AdminIdentityInput): AdminIdentityDisplay {
  const name = input.name?.trim() ?? ''
  const email = input.email?.trim() ?? ''
  const fallback = input.fallback?.trim() ?? ''
  const primary = name || email || fallback || '—'
  const secondary = name && email && name.toLocaleLowerCase() !== email.toLocaleLowerCase() ? email : null
  return {
    primary,
    secondary,
    initial: adminIdentityInitial(name || email || fallback),
    title: secondary ? `${primary} · ${secondary}` : primary,
  }
}

export interface AdminConfirmInput {
  /** Text the operator must type before a destructive action unlocks. */
  requireText?: string | null
  input: string
  loading?: boolean
}

/** A destructive confirmation is enabled only when nothing is running and the typed text matches exactly. */
export function canConfirmAdminAction({ requireText, input, loading }: AdminConfirmInput): boolean {
  if (loading)
    return false
  const required = requireText?.trim() ?? ''
  return !required || input.trim() === required
}

export interface AdminPagerInput {
  total: number
  limit: number
  page: number
  pageSizes?: readonly number[]
}

/**
 * Whether the page buttons are worth showing. One page of results gets the count
 * alone, unless a smaller page size would split it — then the size selector has
 * to stay reachable, or a reader who picked 100 could never go back to 20.
 */
export function shouldShowAdminPager({ total, limit, page, pageSizes = [] }: AdminPagerInput): boolean {
  if (total <= 0)
    return false
  if (page > 1 || total > limit)
    return true
  const sizes = pageSizes.filter(size => Number.isInteger(size) && size > 0)
  return sizes.length > 0 && total > Math.min(...sizes)
}
