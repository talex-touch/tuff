// Adapted from Beautiful UI (https://www.beautifului.dev), © 2026 Shane Levine, MIT.

import type { MaybeRefOrGetter, Ref } from 'vue'
import { onBeforeUnmount, onMounted, ref, toValue, watchPostEffect } from 'vue'

export interface UseAutosizeOptions {
  textarea: Ref<HTMLTextAreaElement | null>
  /** Hidden span mirroring the draft; its width is the single-line width. */
  measure: Ref<HTMLElement | null>
  /** The grid laying the textarea out beside the fixed controls. */
  controls: Ref<HTMLElement | null>
  /** Elements that share the inline row with the textarea. */
  fixed: () => (HTMLElement | null | undefined)[]
  value: MaybeRefOrGetter<string>
  minHeight: MaybeRefOrGetter<number>
  maxHeight: MaybeRefOrGetter<number>
}

export interface UseAutosizeReturn {
  /** True once the draft has to take a row of its own above the controls. */
  expanded: Ref<boolean>
  remeasure: () => void
}

/** Column gap assumed when the computed style is unreadable (jsdom, detached). */
const FALLBACK_GAP = 4
/** Slack matching upstream, so a draft never sits flush against a control. */
const INLINE_SLACK = 8

/**
 * Grows the composer textarea with its content and decides when the draft has
 * outgrown the inline row. Private to `TxPromptBar`: it is coupled to that
 * component's grid, not a general-purpose autosize.
 */
export function useAutosize(options: UseAutosizeOptions): UseAutosizeReturn {
  const expanded = ref(false)
  const containerWidth = ref(0)

  function remeasure(): void {
    const input = options.textarea.value
    const measure = options.measure.value
    const controls = options.controls.value
    if (!input || !measure || !controls)
      return

    // "Would this still fit beside the controls?" is always asked of the inline
    // layout, never of the current one — otherwise the answer flips to `false`
    // the moment the textarea gets a full row and the two states oscillate.
    const fixed = options.fixed().filter((element): element is HTMLElement => Boolean(element))
    const gap = Number.parseFloat(getComputedStyle(controls).columnGap) || FALLBACK_GAP
    const fixedWidth = fixed.reduce((total, element) => total + element.offsetWidth, 0)
    const inlineWidth = controls.clientWidth - fixedWidth - gap * fixed.length

    const draft = toValue(options.value)
    // A container that has not been laid out yet — a hidden subtree, the frame
    // before first paint — reports zero width, and every draft "overflows" it.
    // Hold the current shape and wait for the observer instead.
    if (controls.clientWidth > 0)
      expanded.value = draft.includes('\n') || measure.offsetWidth + INLINE_SLACK > inlineWidth

    const min = toValue(options.minHeight)
    const max = toValue(options.maxHeight)
    input.style.height = '0px'
    const contentHeight = input.scrollHeight
    input.style.height = `${Math.min(Math.max(contentHeight, min), max)}px`
    input.style.overflowY = contentHeight > max ? 'auto' : 'hidden'
  }

  // Post-flush: the measure span has to be carrying the new draft, and the grid
  // has to have re-flowed, before any of these reads mean anything.
  watchPostEffect(() => {
    void toValue(options.value)
    void toValue(options.minHeight)
    void toValue(options.maxHeight)
    void containerWidth.value
    // Reading `expanded` buys one more pass after the grid re-flows, so the
    // height is measured against the row the textarea actually landed on. The
    // extra pass settles on its own: it recomputes the same value and writes
    // nothing, so no further invalidation follows.
    void expanded.value
    remeasure()
  })

  let observer: ResizeObserver | null = null

  onMounted(() => {
    const controls = options.controls.value
    if (!controls || typeof ResizeObserver === 'undefined')
      return

    observer = new ResizeObserver((entries) => {
      containerWidth.value = entries[0]?.contentRect.width ?? 0
    })
    observer.observe(controls)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })

  return { expanded, remeasure }
}
