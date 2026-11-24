import type { ComputedRef } from 'vue'
import type { StreamPacerOptions } from '../../stream-text/src/use-stream-pacer'
import { computed, shallowRef, watch } from 'vue'
import { useReducedMotion } from '../../../../utils/use-reduced-motion'
import { segmentWords } from '../../stream-text/src/segment'
import { useStreamPacer } from '../../stream-text/src/use-stream-pacer'

/**
 * Reasoning does not arrive a word at a time. A provider hands a whole thought over in one piece,
 * seconds apart, so a body bound straight to the arrived text sits still and then jumps by a
 * paragraph. This releases the arrived text on the stream family's own clock (`useStreamPacer`):
 * a steady cadence inside a burst, speeding up only as far as it takes to never fall further
 * behind than `maxLagMs`. The text it shows is always a prefix of the text that arrived - the
 * pacer only decides how much of it is visible yet - so nothing is rewritten, only revealed.
 *
 * `paced: false` (a settled step, reduced motion, no clock) shows everything at once.
 */
export interface PacedTextOptions {
  /** Everything that has arrived so far. */
  text: () => string
  /** The source is still producing; a settled step shows in full. */
  streaming: () => boolean
  locale?: string
  /** Per-unit cadence and lag bounds; the stream family's defaults when omitted. */
  pacing?: Pick<StreamPacerOptions, 'wordMs' | 'maxLagMs' | 'drainMs' | 'pauseMs'>
  /** Test seam: a deterministic frame clock. */
  clock?: Pick<StreamPacerOptions, 'now' | 'requestFrame' | 'cancelFrame' | 'setTimer' | 'clearTimer'>
}

export interface PacedText {
  /** The visible prefix of `text()`. */
  shown: ComputedRef<string>
  /** Whether units are still waiting to be shown. */
  pending: ComputedRef<boolean>
  /** Show everything now. */
  skip: () => void
}

/** Where each unit ends, as an offset into the text: `ends[n - 1]` is the length of the first n units. */
function appendUnitEnds(ends: number[], slice: string, baseOffset: number, locale: string): void {
  let offset = baseOffset
  for (const unit of segmentWords(slice, locale)) {
    offset += unit.text.length + unit.ws.length
    ends.push(offset)
  }
}

export function usePacedText(options: PacedTextOptions): PacedText {
  const reduced = useReducedMotion()
  const locale = options.locale ?? 'zh'

  // Incremental prefix cache: streaming appends to the tail, and Intl.Segmenter
  // never merges words across a newline, so completed lines stay cached while
  // only the active trailing line is re-segmented on each delta.
  let prevText = ''
  let prevEnds: number[] = []
  let safeOffset = 0
  let safeCount = 0

  const ends = computed(() => {
    const text = options.text()
    let nextEnds: number[]
    if (safeOffset > 0 && text.startsWith(prevText)) {
      nextEnds = prevEnds.slice(0, safeCount)
      appendUnitEnds(nextEnds, text.slice(safeOffset), safeOffset, locale)
    }
    else {
      nextEnds = []
      appendUnitEnds(nextEnds, text, 0, locale)
    }

    prevText = text
    prevEnds = nextEnds
    const lastNewline = text.lastIndexOf('\n')
    if (lastNewline >= 0) {
      const boundary = lastNewline + 1
      // Binary search for the count of units ending at or before `boundary`.
      let low = 0
      let high = nextEnds.length
      while (low < high) {
        const mid = (low + high) >> 1
        if (nextEnds[mid]! <= boundary)
          low = mid + 1
        else
          high = mid
      }
      safeCount = low
      safeOffset = low > 0 ? nextEnds[low - 1]! : 0
    }
    else {
      safeOffset = 0
      safeCount = 0
    }

    return nextEnds
  })

  // Units can be rewritten when the text changes shape (a word grows, markdown re-segments), so
  // what is visible is derived from the unit count, never from a remembered string offset.
  //
  // `appear`: a live step's body mounts with its first piece of text already in it (the host only
  // renders a body once there is something to show), and the pacer shows whatever is there at
  // mount as it is. Opting in makes that first piece pace like every piece after it; a settled
  // step is not streaming at mount, so it still shows in full.
  const pacer = useStreamPacer({
    total: () => ends.value.length,
    streaming: options.streaming,
    paced: () => !reduced.value,
    settleMs: () => 0,
    appear: options.streaming(),
    ...options.pacing,
    ...options.clock,
  })

  const visibleLength = shallowRef(0)
  watch(
    () => [pacer.revealed.value, ends.value] as const,
    ([revealed, all]) => {
      visibleLength.value = revealed <= 0 ? 0 : (all[Math.min(revealed, all.length) - 1] ?? 0)
    },
    { immediate: true, flush: 'sync' },
  )

  const shown = computed(() => {
    const full = options.text()
    return visibleLength.value >= full.length ? full : full.slice(0, visibleLength.value)
  })

  return {
    shown,
    pending: computed(() => pacer.revealed.value < ends.value.length),
    skip: pacer.skip,
  }
}
