import { describe, expect, it, vi } from 'vitest'
import {
  createDialogAutoSizerLifecycle,
  type DialogAutoSizerDomAdapter,
} from '~/composables/useDialogAutoSizer'

describe('dialog auto sizer lifecycle', () => {
  it('resets on open, measures observed content, responds to viewport resize, and disposes DOM resources', () => {
    let open = true
    let viewportHeight = 900
    const scheduled: Array<() => void> = []
    const reset = vi.fn()
    const setScrollAreaHeight = vi.fn()
    const setMaxScrollableHeight = vi.fn()
    const observe = vi.fn()
    const disconnect = vi.fn()
    const addResizeListener = vi.fn()
    const removeResizeListener = vi.fn()
    const callbacks: { resize: (() => void) | null, observer: (() => void) | null } = {
      resize: null,
      observer: null,
    }
    let contentScrollHeight = 700
    const contentElement = {} as HTMLElement
    Object.defineProperty(contentElement, 'scrollHeight', {
      configurable: true,
      get: () => contentScrollHeight,
    })

    const dom: DialogAutoSizerDomAdapter = {
      schedule: callback => scheduled.push(callback),
      getViewportHeight: () => viewportHeight,
      addViewportResizeListener: (listener) => {
        callbacks.resize = listener
        addResizeListener(listener)
      },
      removeViewportResizeListener: listener => removeResizeListener(listener),
      createResizeObserver: (callback) => {
        callbacks.observer = callback
        return { observe, disconnect }
      },
    }
    const lifecycle = createDialogAutoSizerLifecycle({
      isOpen: () => open,
      getContentElement: () => contentElement,
      minScrollableHeight: 220,
      minViewportScrollableHeight: 280,
      maxViewportScrollableHeight: 680,
      reset,
      setScrollAreaHeight,
      setMaxScrollableHeight,
      dom,
    })
    const flushScheduled = () => {
      while (scheduled.length)
        scheduled.shift()?.()
    }

    lifecycle.mount()
    lifecycle.open()
    flushScheduled()

    expect(reset).toHaveBeenCalledOnce()
    expect(setMaxScrollableHeight).toHaveBeenLastCalledWith(612)
    expect(addResizeListener).toHaveBeenCalledOnce()
    expect(observe).toHaveBeenCalledWith(contentElement)
    expect(setScrollAreaHeight).toHaveBeenLastCalledWith(612)

    viewportHeight = 400
    callbacks.resize?.()
    flushScheduled()
    expect(setMaxScrollableHeight).toHaveBeenLastCalledWith(280)
    expect(setScrollAreaHeight).toHaveBeenLastCalledWith(280)

    contentScrollHeight = 500
    callbacks.observer?.()
    flushScheduled()
    expect(setScrollAreaHeight).toHaveBeenLastCalledWith(280)

    lifecycle.dispose()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(removeResizeListener).toHaveBeenCalledOnce()

    open = false
    callbacks.observer?.()
    flushScheduled()
    expect(setScrollAreaHeight).toHaveBeenLastCalledWith(280)
  })
})
