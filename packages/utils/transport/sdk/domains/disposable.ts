export type Disposer = () => void

export interface DisposableBag {
  add: (...disposers: Array<Disposer | null | undefined | false>) => void
  dispose: () => void
  readonly size: number
}

export function createDisposableBag(): DisposableBag {
  const disposers = new Set<Disposer>()

  return {
    add: (...items) => {
      for (const item of items) {
        if (typeof item === 'function') {
          disposers.add(item)
        }
      }
    },
    dispose: () => {
      for (const disposer of disposers) {
        try {
          disposer()
        } catch {
          // ignore disposer errors
        }
      }
      disposers.clear()
    },
    get size() {
      return disposers.size
    },
  }
}

