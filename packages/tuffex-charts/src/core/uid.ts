let counter = 0

/** Monotonic id for unique SVG def ids (gradients, clip paths). */
export function nextUid(): number {
  return ++counter
}
