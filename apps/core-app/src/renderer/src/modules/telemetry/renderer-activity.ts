type RendererActivityListener = (active: boolean) => void

let rendererActive = true
const listeners = new Set<RendererActivityListener>()

export function setRendererActivity(active: boolean): void {
  if (rendererActive === active) return
  rendererActive = active
  for (const listener of listeners) listener(active)
}

export function subscribeRendererActivity(listener: RendererActivityListener): () => void {
  listener(rendererActive)
  listeners.add(listener)
  return () => listeners.delete(listener)
}
