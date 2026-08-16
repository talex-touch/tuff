// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue'
import type { PromptBarMenuKind } from './types'
import { computed, ref, toValue, watch } from 'vue'

export interface PromptBarToken {
  kind: PromptBarMenuKind
  /** Text typed after the trigger character, lower-cased for matching. */
  query: string
  /** Index of the trigger character itself within the draft. */
  start: number
}

/**
 * Only a trailing token counts, and only at a word boundary — `you@host` is an
 * email address, not a mention.
 */
const TOKEN_PATTERN = /(^|\s)([@/])([\w-]*)$/

export function parseToken(draft: string): PromptBarToken | null {
  const match = TOKEN_PATTERN.exec(draft)
  if (!match)
    return null

  const lead = match[1] ?? ''
  const trigger = match[2]
  const query = match[3] ?? ''

  return {
    kind: trigger === '@' ? 'at' : 'slash',
    query: query.toLowerCase(),
    start: match.index + lead.length,
  }
}

/** The shape both menus agree on; callers keep their own richer row types. */
export interface TokenMenuRow {
  key: string
  name: string
}

export interface UseTokenMenuOptions<
  TSource extends TokenMenuRow,
  TCommand extends TokenMenuRow,
> {
  draft: MaybeRefOrGetter<string>
  sources?: MaybeRefOrGetter<readonly TSource[] | undefined>
  commands?: MaybeRefOrGetter<readonly TCommand[] | undefined>
  /** Forces the `at` menu open with an empty query — the composer's + button. */
  forced?: MaybeRefOrGetter<boolean>
}

export interface UseTokenMenuReturn<
  TSource extends TokenMenuRow,
  TCommand extends TokenMenuRow,
> {
  token: ComputedRef<PromptBarToken | null>
  menu: ComputedRef<PromptBarMenuKind | null>
  query: ComputedRef<string>
  rows: ComputedRef<(TSource | TCommand)[]>
  activeIndex: Ref<number>
  activeRow: ComputedRef<TSource | TCommand | undefined>
  /** Whether the highlight has been earned yet — see `engage`. */
  engaged: Ref<boolean>
  dismissed: Ref<boolean>
  move: (direction: 1 | -1) => void
  engage: (index: number) => void
  dismiss: () => void
  resume: () => void
  /** The draft with the pending token replaced by `replacement`, plus a space. */
  insert: (replacement: string) => string
}

/**
 * The `@` / `/` menu state machine behind `TxPromptBar`, exported on its own so
 * a host can wire mentions into its own composer without adopting the whole
 * bar. Pure state: it owns no DOM and performs no side effects.
 */
export function useTokenMenu<
  TSource extends TokenMenuRow,
  TCommand extends TokenMenuRow,
>(options: UseTokenMenuOptions<TSource, TCommand>): UseTokenMenuReturn<TSource, TCommand> {
  const activeIndex = ref(0)
  const engaged = ref(false)
  const dismissed = ref(false)

  const token = computed(() => (dismissed.value ? null : parseToken(toValue(options.draft))))

  const menu = computed<PromptBarMenuKind | null>(() =>
    toValue(options.forced) ? 'at' : token.value?.kind ?? null,
  )

  const query = computed(() => (toValue(options.forced) ? '' : token.value?.query ?? ''))

  const rows = computed<(TSource | TCommand)[]>(() => {
    const needle = query.value
    if (menu.value === 'at')
      return (toValue(options.sources) ?? []).filter(row => row.name.toLowerCase().includes(needle))

    if (menu.value === 'slash') {
      // Commands carry their own leading slash; match against the bare word so
      // typing `/comp` narrows to `/compare`.
      return (toValue(options.commands) ?? []).filter(row =>
        row.name.replace(/^\//, '').toLowerCase().startsWith(needle),
      )
    }

    return []
  })

  const activeRow = computed(() => rows.value[activeIndex.value])

  // A fresh menu, or a narrowed one, starts with nothing highlighted: the
  // highlight is a pointer, and pre-selecting the first row would claim the
  // reader is already somewhere they never went.
  watch([menu, query], () => {
    activeIndex.value = 0
    engaged.value = false
  })

  watch(
    () => rows.value.length,
    (length) => {
      if (activeIndex.value > length - 1)
        activeIndex.value = 0
    },
  )

  // Typing revives a menu the reader dismissed with Escape.
  watch(
    () => toValue(options.draft),
    () => {
      dismissed.value = false
    },
  )

  function move(direction: 1 | -1): void {
    const total = rows.value.length
    if (total === 0)
      return

    // Nothing is highlighted yet, so the first key lands on an end rather than
    // stepping off the index the highlight was merely parked at — upstream
    // steps, which skips the first row on the very first press.
    if (!engaged.value) {
      engaged.value = true
      activeIndex.value = direction === 1 ? 0 : total - 1
      return
    }

    activeIndex.value = (activeIndex.value + (direction === 1 ? 1 : total - 1)) % total
  }

  function engage(index: number): void {
    activeIndex.value = index
    engaged.value = true
  }

  function dismiss(): void {
    dismissed.value = true
    engaged.value = false
  }

  function resume(): void {
    dismissed.value = false
  }

  function insert(replacement: string): string {
    const draft = toValue(options.draft)
    const pending = token.value
    const head = pending ? draft.slice(0, pending.start) : draft
    // With no pending token (the + button opened the menu mid-word) upstream
    // splices the mention straight onto the preceding word. Keep them apart.
    const separator = head.length > 0 && !/\s$/.test(head) ? ' ' : ''

    return `${head}${separator}${replacement} `
  }

  return {
    token,
    menu,
    query,
    rows,
    activeIndex,
    activeRow,
    engaged,
    dismissed,
    move,
    engage,
    dismiss,
    resume,
    insert,
  }
}
