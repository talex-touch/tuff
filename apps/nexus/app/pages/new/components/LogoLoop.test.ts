import { readFileSync } from 'node:fs'
import { parse } from '@vue/compiler-sfc'
import { transform } from 'esbuild'
import { computed, nextTick, ref, watch } from 'vue'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const script = parse(
  readFileSync(new URL('./LogoLoop.vue', import.meta.url), 'utf8'),
).descriptor.scriptSetup?.content

if (!script)
  throw new Error('Expected LogoLoop.vue script setup block.')

type SetupLogoLoop = (deps: {
  props: Record<string, unknown>
  onMounted: (fn: () => void | Promise<void>) => void
  onUnmounted: (fn: () => void) => void
}) => void

let setupLogoLoop: SetupLogoLoop

beforeAll(async () => {
  const body = script
    .replace(/^import[\s\S]*?from [^\n]+\n/gm, '')
    .replace(/^export\s+(?=(?:interface|type)\b)/gm, '')
    .replace(/const props = withDefaults\(defineProps<LogoLoopProps>\(\),[\s\S]*?\n\}\)/, 'const props = deps.props')
  const { code } = await transform(
    `
export function setupLogoLoop(deps, vue) {
  const { computed, nextTick, ref, watch } = vue
  const { onMounted, onUnmounted } = deps
${body}
}
`,
    { format: 'esm', loader: 'ts', target: 'esnext' },
  )
  const mod = (await import(`data:text/javascript,${encodeURIComponent(code)}`)) as {
    setupLogoLoop: (deps: Parameters<SetupLogoLoop>[0], vue: Record<string, unknown>) => void
  }
  setupLogoLoop = deps => mod.setupLogoLoop(deps, { computed, nextTick, ref, watch })
})

describe('LogoLoop unmount lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('cancels the mount setTimeout and never leaks ResizeObserver or RAF when unmounted before 10ms', async () => {
    const mountedCallbacks: Array<() => void | Promise<void>> = []
    const unmountedCallbacks: Array<() => void> = []

    const ResizeObserverSpy = vi.fn(() => ({ observe: vi.fn(), disconnect: vi.fn() }))
    const rafSpy = vi.fn(() => 1)
    const cancelRafSpy = vi.fn()

    vi.stubGlobal('window', {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      ResizeObserver: ResizeObserverSpy,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      matchMedia: vi.fn(() => ({ matches: false })),
    })
    vi.stubGlobal('ResizeObserver', ResizeObserverSpy)
    vi.stubGlobal('requestAnimationFrame', rafSpy)
    vi.stubGlobal('cancelAnimationFrame', cancelRafSpy)

    setupLogoLoop({
      props: {
        logos: [{ node: '<span>A</span>', title: 'A' }],
        speed: 120,
        direction: 'left',
        width: '100%',
        logoHeight: 28,
        gap: 32,
        fadeOut: false,
        scaleOnHover: false,
        ariaLabel: 'Partner logos',
      },
      onMounted: fn => mountedCallbacks.push(fn),
      onUnmounted: fn => unmountedCallbacks.push(fn),
    })

    expect(mountedCallbacks).toHaveLength(1)
    expect(unmountedCallbacks).toHaveLength(1)

    // Mount starts `await nextTick(); mountTimer = window.setTimeout(..., 10)`
    const mountPromise = mountedCallbacks[0]!()
    await mountPromise

    // Unmount before the 10ms timer fires
    unmountedCallbacks[0]!()

    vi.advanceTimersByTime(100)
    await nextTick()

    expect(ResizeObserverSpy).not.toHaveBeenCalled()
    expect(rafSpy).not.toHaveBeenCalled()
  })
})
