if (typeof window !== 'undefined' && !window.matchMedia) {
  // `prefers-reduced-motion: reduce` matches by default so components and tests
  // observe final geometry instead of racing enter/update tweens (the charts
  // tween layer in `components/src/charts/src/core/animate.ts` depends on it).
  // Tests that need animation override this stub themselves (see
  // `components/src/charts/__tests__/animate.test.ts`).
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
}

// jsdom lacks ResizeObserver; the charts' TxChart measures its container with
// it. Passive stub: it never fires, so it only stands in for the constructor —
// tests that assert on resize behaviour install their own observer.
if (typeof globalThis !== 'undefined' && !('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    constructor(_callback: ResizeObserverCallback) {}
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver
}

if (typeof Range !== 'undefined') {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => {
      return {
        length: 0,
        item: () => null,
        *[Symbol.iterator]() {},
      } as DOMRectList
    }
  }
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON: () => {},
    })
  }
}
