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
  /** Injectable clock, for tests. */
  now?: () => number
}

interface Chunk {
  start: number
  end: number
  t0: number
}

export interface FreshChunks {
  /**
   * Re-syncs against the element's current text and wraps still-animating
   * chunks. Call after every DOM patch of the tracked tail block, post-flush
   * (the wrap must land in the same frame as the patch, before paint).
   */
  update: (el: HTMLElement, blockId: number | string) => void
  /** Unwraps every fresh span under `root` and forgets all chunks. */
  finish: (root: ParentNode) => void
  reset: () => void
}

export function createFreshChunks(options: FreshChunksOptions = {}): FreshChunks {
  const duration = options.durationMs ?? 440
  const className = options.className ?? 'tx-stream-md__fresh'
  const now = options.now ?? (() => performance.now())

  let blockId: number | string | null = null
  let text = ''
  let chunks: Chunk[] = []

  function reset(): void {
    blockId = null
    text = ''
    chunks = []
  }

  function update(el: HTMLElement, id: number | string): void {
    const t = now()
    // Offsets are computed against clean DOM. A fresh `v-html` patch arrives
    // clean anyway; this covers update calls with no patch in between.
    unwrap(el)
    const nextText = el.textContent ?? ''

    if (blockId !== id) {
      // A brand-new tail block: everything it holds just arrived.
      blockId = id
      text = nextText
      chunks = nextText ? [{ start: 0, end: nextText.length, t0: t }] : []
    }
    else if (nextText.length > text.length && nextText.startsWith(text)) {
      chunks.push({ start: text.length, end: nextText.length, t0: t })
      text = nextText
    }
    else if (nextText !== text) {
      // The parser rewrote earlier output (an emphasis closing, a reference
      // link resolving): every offset is void. Resync without animating —
      // replaying settled text reads worse than skipping one beat.
      text = nextText
      chunks = []
    }

    chunks = chunks.filter(chunk => t - chunk.t0 < duration)
    for (const chunk of chunks) wrapChunk(el, chunk, t)
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
      if (from < to)
        targets.push({ node, from: from - nodeStart, to: to - nodeStart })
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
  }

  function finish(root: ParentNode): void {
    unwrap(root)
    reset()
  }

  return { update, finish, reset }
}
