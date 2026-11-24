import { describe, expect, it, vi } from 'vitest'
import { createRenderer, defineComponent, h } from 'vue'
import { useCoreBoxInput } from './useCoreBoxInput'

const sdkMocks = vi.hoisted(() => ({
  box: {
    getInput: vi.fn(),
    expand: vi.fn(),
  },
  feature: {
    onInputChange: vi.fn(),
    dispose: vi.fn(),
  },
}))

vi.mock('@talex-touch/utils/plugin/sdk', () => ({
  useBox: () => sdkMocks.box,
  useFeature: () => sdkMocks.feature,
}))

describe('useCoreBoxInput', () => {
  it('subscribes via useFeature().onInputChange and cleans up on unmount', async () => {
    const unsubscribe = vi.fn()
    let registeredHandler: ((input: string) => void) | undefined
    sdkMocks.feature.onInputChange.mockImplementation((handler: (input: string) => void) => {
      registeredHandler = handler
      return unsubscribe
    })
    sdkMocks.box.getInput.mockResolvedValue('{"initial":true}')

    const received: string[] = []
    let unmountHook: (() => void) | null = null

    const TestComponent = defineComponent({
      setup() {
        useCoreBoxInput(text => received.push(text))
        return () => h('div')
      },
    })

    const renderer = createRenderer({
      patchProp: () => {},
      insert: () => {},
      remove: () => {},
      createElement: () => ({}),
      createText: () => ({}),
      createComment: () => ({}),
      setText: () => {},
      setElementText: () => {},
      parentNode: () => null,
      nextSibling: () => null,
    })

    const app = renderer.createApp(TestComponent)
    app.mount({})
    unmountHook = () => app.unmount()

    await Promise.resolve()
    expect(received).toEqual(['{"initial":true}'])

    const emitInput = registeredHandler as ((input: string) => void) | undefined
    emitInput?.('{"updated":true}')
    expect(received).toEqual(['{"initial":true}', '{"updated":true}'])

    unmountHook()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(sdkMocks.feature.dispose).toHaveBeenCalledTimes(1)

    // Events emitted after unmount are ignored
    emitInput?.('{"stale":true}')
    expect(received).toEqual(['{"initial":true}', '{"updated":true}'])
  })
})
