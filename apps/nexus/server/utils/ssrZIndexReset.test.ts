import { getZIndex, nextZIndex, refreshZIndex, resetZIndex } from '@talex-touch/tuffex/utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetZIndexForRequest } from './ssrZIndexReset'

// Hardcoded in TxDrawer; a drawer rendered with visible: true allocates from it
// during setup, which is what leaks across requests.
const DRAWER_Z_INDEX_SEED = 10000

describe('ssr z-index reset', () => {
  beforeEach(() => {
    resetZIndex(undefined, 'test')
  })

  it('restores the allocator to the state a fresh client module starts from', () => {
    const pristine = getZIndex()

    // Simulate one request rendering a visible drawer: refresh to its seed and
    // take a layer, exactly as TxDrawer's immediate watcher does.
    refreshZIndex(DRAWER_Z_INDEX_SEED, 'drawer')
    const allocated = nextZIndex()
    expect(allocated).toBeGreaterThan(pristine)
    expect(getZIndex()).not.toBe(pristine)

    resetZIndexForRequest()

    // Without this, the next request's TxModal would SSR the drifted value while
    // the client computed the pristine one — a hydration mismatch on the style.
    expect(getZIndex()).toBe(pristine)
  })

  it('is idempotent across consecutive requests', () => {
    const pristine = getZIndex()

    resetZIndexForRequest()
    resetZIndexForRequest()

    expect(getZIndex()).toBe(pristine)
  })
})
