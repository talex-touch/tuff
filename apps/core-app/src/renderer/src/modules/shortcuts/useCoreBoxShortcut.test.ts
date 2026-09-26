import type { ShortcutBinding } from '~/modules/channel/main/shortcon'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'

const mocks = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  return {
    listeners,
    getBinding: vi.fn<(id: string) => Promise<ShortcutBinding>>(),
    onChanged: vi.fn((handler: () => void) => {
      listeners.add(handler)
      return () => {
        listeners.delete(handler)
      }
    })
  }
})

const platform = ref('darwin')

vi.mock('~/modules/channel/main/shortcon', () => ({
  shortconApi: { getBinding: mocks.getBinding, onChanged: mocks.onChanged }
}))

vi.mock('~/modules/platform/renderer-platform', () => ({
  useRendererPlatform: () => ({ platform })
}))

import { useCoreBoxShortcut } from './useCoreBoxShortcut'

function binding(effective: string | null, configured = 'Alt+Space'): ShortcutBinding {
  return { configured, effective }
}

/** Lets the query promise and the resulting render work settle. */
async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

function useInScope() {
  const scope = effectScope()
  const state = scope.run(() => useCoreBoxShortcut())!
  return { scope, state }
}

afterEach(() => {
  mocks.getBinding.mockReset()
  mocks.onChanged.mockClear()
  mocks.listeners.clear()
  platform.value = 'darwin'
})

describe('useCoreBoxShortcut', () => {
  it('labels the key that opens CoreBox, asked of the main process', async () => {
    mocks.getBinding.mockResolvedValue(binding('Alt+Space'))
    const { scope, state } = useInScope()
    await settle()

    expect(mocks.getBinding).toHaveBeenCalledWith('core.box.toggle')
    expect(state.effectiveLabel.value).toBe('⌥Space')

    platform.value = 'win32'
    expect(state.effectiveLabel.value).toBe('Alt+Space')
    scope.stop()
  })

  it('follows the main process when the key moves', async () => {
    mocks.getBinding.mockResolvedValue(binding('Alt+Space'))
    const { scope, state } = useInScope()
    await settle()

    // A rebind in settings...
    mocks.getBinding.mockResolvedValue(binding('Command+K', 'Command+K'))
    for (const listener of mocks.listeners) listener()
    await settle()
    expect(state.effectiveLabel.value).toBe('⌘K')

    // ...and a key the OS then refuses: nothing stands in, so there is no key to teach.
    mocks.getBinding.mockResolvedValue(binding(null, 'Command+K'))
    for (const listener of mocks.listeners) listener()
    await settle()
    expect(state.effectiveLabel.value).toBeNull()
    expect(state.binding.value).toEqual({ configured: 'Command+K', effective: null })
    scope.stop()
  })

  it('teaches no key when none opens CoreBox', async () => {
    mocks.getBinding.mockResolvedValue(binding(null))
    const { scope, state } = useInScope()
    await settle()

    expect(state.effective.value).toBeNull()
    expect(state.effectiveLabel.value).toBeNull()
    scope.stop()
  })

  it('keeps the newest answer when an older query resolves last', async () => {
    let resolveFirst!: (value: ShortcutBinding) => void
    mocks.getBinding
      .mockImplementationOnce(
        () =>
          new Promise<ShortcutBinding>((resolve) => {
            resolveFirst = resolve
          })
      )
      .mockResolvedValueOnce(binding('Command+K', 'Command+K'))
    const { scope, state } = useInScope()

    for (const listener of mocks.listeners) listener()
    await settle()
    resolveFirst(binding('Alt+Space'))
    await settle()

    expect(state.effectiveLabel.value).toBe('⌘K')
    scope.stop()
  })

  it('stops listening with the scope that asked', () => {
    mocks.getBinding.mockResolvedValue(binding('Alt+Space'))
    const { scope } = useInScope()
    expect(mocks.listeners.size).toBe(1)

    scope.stop()

    expect(mocks.listeners.size).toBe(0)
  })
})
