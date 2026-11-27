import type { ReactNode } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

export interface MountedTree {
  container: HTMLDivElement
  rerender: (node: ReactNode) => void
  unmount: () => void
}

const activeTrees = new Set<MountedTree>()

export function mount(node: ReactNode): MountedTree {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  act(() => {
    root.render(node)
  })

  const tree: MountedTree = {
    container,
    rerender(next: ReactNode) {
      act(() => {
        root.render(next)
      })
    },
    unmount() {
      act(() => {
        root.unmount()
      })
      container.remove()
      activeTrees.delete(tree)
    },
  }

  activeTrees.add(tree)
  return tree
}

export function cleanupAll(): void {
  for (const tree of Array.from(activeTrees))
    tree.unmount()
}
