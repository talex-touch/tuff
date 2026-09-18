/**
 * The button family's size vocabulary.
 *
 * `TxButton` renders exactly three heights — 26px, 32px, 38px — so the prop
 * accepts exactly three words. It previously also typed `small`, `large` and
 * `mini`, which collapsed onto those same three tiers (`mini` and `small` were
 * both indistinguishable from `sm`, `large` from `lg`), so the wider union
 * bought six spellings for three behaviours and let two of them into the same
 * template.
 *
 * `resolveButtonSize` still maps the old spellings, and that is input
 * normalization at a published boundary, not a second API: they are gone from
 * `ButtonSize`, so no callsite that typechecks can produce them. What remains
 * is `@talex-touch/tuffex` consumers who compiled against 0.6.0 and pass
 * `size="small"` from plain JS, where a union is erased at runtime and Vue
 * hands the string straight through. Dropping the mapping would render their
 * buttons 6px taller with nothing to warn them.
 *
 * `button.vue` and `split-button.vue` each carried a private copy of this
 * mapping. Two copies of a normalization table drift the moment one of them
 * gains a tier, so it lives here once.
 */

/** Every spelling the `size` prop accepts. */
export type ButtonSize = 'sm' | 'md' | 'lg'

/**
 * Spellings that `ButtonSize` no longer offers but published builds still emit.
 *
 * Deliberately `Record<string, …>`: the keys are not part of any type in this
 * package, and typing them would put them back on the public surface.
 */
const LEGACY_SPELLINGS: Record<string, ButtonSize> = {
  small: 'sm',
  mini: 'sm',
  large: 'lg',
}

/**
 * Resolves the incoming `size` to the tier that drives `tx-size-*`.
 *
 * Unset resolves to `md`, matching the bare `.tx-button` rule block, which
 * carries the 32px height with no size class applied. An unrecognised string
 * resolves the same way, because a runtime consumer passing a typo should get
 * the default button rather than an unstyled one.
 */
export function resolveButtonSize(size: string | undefined): ButtonSize {
  if (!size)
    return 'md'
  const legacy = LEGACY_SPELLINGS[size]
  if (legacy)
    return legacy
  return size === 'sm' || size === 'lg' ? size : 'md'
}
