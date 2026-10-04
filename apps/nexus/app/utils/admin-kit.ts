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
  /** The card's tooltip: the full value behind a shortened one, as `dateTimeTitle` is behind `tableDateTime`. */
  title?: string
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

// ─── Labelled fields ───────────────────────────────────────────────────────

/**
 * Controls a labelled field (`AdminFilterField`, `AdminFormField`) can find on its
 * own when it is not given the control's id. `TxSelect` takes no id, so this is
 * how a select gets its label.
 */
export const ADMIN_FIELD_CONTROL_SELECTOR = '[role="combobox"], input, select, textarea'

/** What the field helpers write through: an `Element` on the page, a stub in tests. */
export interface AdminFieldControl {
  getAttribute: (name: string) => string | null
  setAttribute: (name: string, value: string) => void
  removeAttribute: (name: string) => void
}

export interface AdminFieldRoot {
  querySelector: (selectors: string) => AdminFieldControl | null
}

/**
 * The control a field labels: the element with the field's `for` id, or else the
 * first combobox, input, select or textarea inside the field. Only the field's
 * own subtree is searched.
 */
export function findAdminFieldControl(root: AdminFieldRoot | null | undefined, controlId?: string | null): AdminFieldControl | null {
  if (!root)
    return null
  if (controlId)
    return root.querySelector(`[id="${controlId.replace(/["\\]/g, '\\$&')}"]`)
  return root.querySelector(ADMIN_FIELD_CONTROL_SELECTOR)
}

/**
 * A space-separated id list (`aria-describedby`) with `id` added or removed. The
 * other ids keep their order; `null` when none is left.
 */
export function withIdReference(list: string | null | undefined, id: string, present: boolean): string | null {
  const ids = (list ?? '').split(/\s+/).filter(entry => entry && entry !== id)
  if (present)
    ids.push(id)
  return ids.length ? ids.join(' ') : null
}

function setIdReference(control: AdminFieldControl, attribute: string, id: string, present: boolean) {
  const next = withIdReference(control.getAttribute(attribute), id, present)
  if (next === null)
    control.removeAttribute(attribute)
  else
    control.setAttribute(attribute, next)
}

export interface AdminFieldControlState {
  /** Id of the field's label element. */
  labelId: string
  /** The label is a `<label for>` naming the control already. */
  labelledByFor: boolean
  /** Id of the hint under the control, or `null` without one. */
  hintId: string | null
  invalid: boolean
}

/** What a field wrote on its control last time, so the next sync can take it back. */
export interface AdminFieldControlApplied {
  hintId: string | null
  invalid: boolean
}

export const ADMIN_FIELD_NOTHING_APPLIED: AdminFieldControlApplied = { hintId: null, invalid: false }

/**
 * Brings a field's control in line with the field: named after the label when it
 * is not a `<label for>` and nothing else names the control, described by the hint,
 * and `aria-invalid` while the field is invalid. Only what the field wrote itself
 * is ever taken back — another id in `aria-describedby` stays, and an
 * `aria-invalid` the field never set is left alone. Returns what it wrote now.
 */
export function syncAdminFieldControl(
  control: AdminFieldControl | null,
  state: AdminFieldControlState,
  applied: AdminFieldControlApplied = ADMIN_FIELD_NOTHING_APPLIED,
): AdminFieldControlApplied {
  if (!control)
    return applied
  if (!state.labelledByFor && control.getAttribute('aria-labelledby') === null && control.getAttribute('aria-label') === null)
    control.setAttribute('aria-labelledby', state.labelId)
  if (applied.hintId && applied.hintId !== state.hintId)
    setIdReference(control, 'aria-describedby', applied.hintId, false)
  if (state.hintId)
    setIdReference(control, 'aria-describedby', state.hintId, true)
  if (state.invalid)
    control.setAttribute('aria-invalid', 'true')
  else if (applied.invalid)
    control.removeAttribute('aria-invalid')
  return { hintId: state.hintId, invalid: state.invalid }
}
