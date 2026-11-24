/**
 * Shared height-disclosure transition hooks for sidebar folder containers (`ShellProjectFolder` and
 * `ShellTemporarySpace`).
 *
 * The animated element MUST be a block clipping wrapper around an inner layout wrapper: measuring
 * the inner wrapper's layout height instead of a flex column's `scrollHeight` prevents `flex-shrink`
 * from compressing rows during collapse or undershooting the target height during expand.
 *
 * All hooks deliberately accept a single `(el)` parameter so Vue's `<Transition>` waits on the
 * element's CSS transition timing rather than requiring a manual `done` callback.
 */
function measureFolderHeight(node: HTMLElement): number {
  const inner = node.firstElementChild as HTMLElement | null
  if (!inner) return node.scrollHeight
  const rectHeight = inner.getBoundingClientRect().height
  return rectHeight > 0 ? rectHeight : inner.offsetHeight
}

export function onFolderBeforeEnter(el: Element): void {
  const node = el as HTMLElement
  const current = node.isConnected ? node.getBoundingClientRect().height : 0
  node.style.height = `${current}px`
}

export function onFolderEnter(el: Element): void {
  const node = el as HTMLElement
  void node.offsetHeight
  node.style.height = `${measureFolderHeight(node)}px`
}

export function onFolderAfterEnter(el: Element): void {
  ;(el as HTMLElement).style.height = ''
}

export function onFolderBeforeLeave(el: Element): void {
  const node = el as HTMLElement
  const current = node.getBoundingClientRect().height || measureFolderHeight(node)
  node.style.height = `${current}px`
}

export function onFolderLeave(el: Element): void {
  const node = el as HTMLElement
  void node.offsetHeight
  node.style.height = '0px'
}

export function onFolderAfterLeave(el: Element): void {
  ;(el as HTMLElement).style.height = ''
}
