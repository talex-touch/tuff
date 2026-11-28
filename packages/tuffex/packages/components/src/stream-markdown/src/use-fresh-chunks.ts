/**
 * Materialises freshly streamed text: every batch of characters appended to
 * the growing tail block enters through a blur that resolves as it settles.
 *
 * The hard part is that the tail block is re-rendered wholesale (`v-html`)
 * on every delta, which destroys any wrapper spans mid-animation. The fix is
 * to make the animation *stateless in the DOM*: chunks are registered by
 * character offset with their arrival time, and after every patch the still-
 * animating chunks are re-wrapped with a negative `animation-delay`, so each
 * one resumes exactly where the patch interrupted it. (A per-delta re-fade of
 * the whole tail element was tried long ago and retired — this is the version
 * that animates only what actually arrived.)
 */

export interface FreshChunksOptions {
  /** How long a chunk animates; older chunks stop being re-wrapped. */
  durationMs?: number
  /** Class applied to the wrapper spans. */
  className?: string
  /** Class applied to newly appended list items / table rows inside a growing block. */
  itemClassName?: string
  /** Injectable clock, for tests. */
  now?: () => number
}

interface Chunk {
  start: number
  end: number
  t0: number
}

interface ItemArrival {
  index: number
  t0: number
}

const STREAM_ITEM_SELECTOR = 'li, tbody > tr'

export interface FreshChunks {
  /**
   * Re-syncs against the element's current text and wraps still-animating
   * chunks. Call after every DOM patch of the tracked tail block, post-flush
   * (the wrap must land in the same frame as the patch, before paint).
   */
  update: (el: HTMLElement, blockId: number | string) => void
  /**
   * Adopts the element's current text as already shown: nothing in it
   * animates, and only what is appended after this call counts as fresh. For
   * content that was on screen before the tracker existed.
   */
  seed: (el: HTMLElement, blockId: number | string) => void
  /** Unwraps every fresh span under `root` and forgets all chunks. */
  finish: (root: ParentNode) => void
  reset: () => void
}

export function createFreshChunks(options: FreshChunksOptions = {}): FreshChunks {
  const duration = options.durationMs ?? 440
  const className = options.className ?? 'tx-stream-md__fresh'
  const itemClassName = options.itemClassName ?? 'tx-stream-md__fresh-item'
  const now = options.now ?? (() => performance.now())

  let blockId: number | string | null = null
  let text = ''
  let chunks: Chunk[] = []
  let itemCount = 0
  let itemArrivals: ItemArrival[] = []

  function reset(): void {
    blockId = null
    text = ''
    chunks = []
    itemCount = 0
    itemArrivals = []
  }

  function update(el: HTMLElement, id: number | string): void {
    const t = now()
    // Offsets are computed against clean DOM. A fresh `v-html` patch arrives
    // clean anyway; this covers update calls with no patch in between.
    unwrap(el)
    // `marked.parser` appends trailing newlines after closing block tags
    // (`<p>...</p>\n`, `<ul>\n<li>...</li>\n</ul>\n`). Trimming trailing
    // whitespace keeps prefix growth intact across every delta instead of
    // treating every append before `\n` as a rewrite.
    const nextText = (el.textContent ?? '').trimEnd()
    const items = Array.from(el.querySelectorAll<HTMLElement>(STREAM_ITEM_SELECTOR))

    if (blockId !== id) {
      // A brand-new tail block: everything it holds just arrived.
      blockId = id
      text = nextText
      chunks = nextText ? [{ start: 0, end: nextText.length, t0: t }] : []
      itemCount = items.length
      itemArrivals = []
    }
    else if (nextText.length > text.length && nextText.startsWith(text)) {
      chunks.push({ start: text.length, end: nextText.length, t0: t })
      text = nextText
      if (items.length > itemCount) {
        for (let index = itemCount; index < items.length; index++)
          itemArrivals.push({ index, t0: t })
      }
      else if (items.length < itemCount) {
        itemArrivals = itemArrivals.filter(entry => entry.index < items.length)
      }
      itemCount = items.length
    }
    else if (nextText !== text) {
      // The parser rewrote earlier output (an emphasis closing, a reference
      // link resolving): every offset is void. Resync without animating —
      // replaying settled text reads worse than skipping one beat.
      text = nextText
      chunks = []
      itemCount = items.length
      itemArrivals = []
    }
    else if (items.length > itemCount) {
      for (let index = itemCount; index < items.length; index++)
        itemArrivals.push({ index, t0: t })
      itemCount = items.length
    }

    chunks = chunks.filter(chunk => t - chunk.t0 < duration)
    for (const chunk of chunks) wrapChunk(el, chunk, t)

    itemArrivals = itemArrivals.filter(entry => t - entry.t0 < duration && entry.index < items.length)
    for (const entry of itemArrivals) {
      const item = items[entry.index]
      if (!item)
        continue
      item.classList.add(itemClassName)
      item.style.animationDelay = `${(-(t - entry.t0)).toFixed(1)}ms`
    }
  }

  function wrapChunk(el: HTMLElement, chunk: Chunk, t: number): void {
    const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    let offset = 0
    const targets: Array<{ node: Text, from: number, to: number }> = []
    for (
      let node = walker.nextNode() as Text | null;
      node;
      node = walker.nextNode() as Text | null
    ) {
      const nodeStart = offset
      const nodeEnd = offset + node.data.length
      offset = nodeEnd
      const from = Math.max(chunk.start, nodeStart)
      const to = Math.min(chunk.end, nodeEnd)
      if (from < to) {
        const localFrom = from - nodeStart
        const localTo = to - nodeStart
        // Never wrap pure whitespace slices — inter-element `\n` nodes inside
        // `<ul>`, `<ol>`, `<table>`, or `<tr>` must not gain child `<span>`s.
        if (node.data.slice(localFrom, localTo).trim())
          targets.push({ node, from: localFrom, to: localTo })
      }
      if (nodeEnd >= chunk.end)
        break
    }

    // Negative delay resumes the animation mid-flight after a re-wrap.
    const delay = `${(-(t - chunk.t0)).toFixed(1)}ms`
    for (const { node, from, to } of targets) {
      // splitText carves the exact range; the middle piece gets wrapped.
      const middle = from > 0 ? node.splitText(from) : node
      if (to - from < middle.data.length)
        middle.splitText(to - from)
      const span = el.ownerDocument.createElement('span')
      span.className = className
      span.style.animationDelay = delay
      middle.parentNode?.insertBefore(span, middle)
      span.appendChild(middle)
    }
  }

  function unwrap(root: ParentNode): void {
    for (const span of Array.from(root.querySelectorAll(`.${className}`))) {
      const parent = span.parentNode
      if (!parent)
        continue
      while (span.firstChild) parent.insertBefore(span.firstChild, span)
      parent.removeChild(span)
      // Merge the split text nodes back so the next walk sees stable offsets.
      if (parent instanceof Element || parent instanceof Document || parent instanceof DocumentFragment)
        parent.normalize()
    }
    for (const item of Array.from(root.querySelectorAll<HTMLElement>(`.${itemClassName}`))) {
      item.classList.remove(itemClassName)
      item.style.removeProperty('animation-delay')
    }
  }

  function finish(root: ParentNode): void {
    unwrap(root)
    reset()
  }

  function seed(el: HTMLElement, id: number | string): void {
    unwrap(el)
    blockId = id
    text = (el.textContent ?? '').trimEnd()
    chunks = []
    itemCount = el.querySelectorAll(STREAM_ITEM_SELECTOR).length
    itemArrivals = []
  }

  return { update, seed, finish, reset }
}
