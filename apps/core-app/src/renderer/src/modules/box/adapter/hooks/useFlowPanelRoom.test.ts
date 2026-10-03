// @vitest-environment jsdom
import type { IProviderActivate, TuffItem } from '@talex-touch/utils'
import { computed, createApp, effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFlowPanelRoom } from './useFlowPanelRoom'
import { useResize } from './useResize'

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({ send: async () => undefined })
}))

vi.mock('~/modules/storage/app-storage', () => ({
  appSetting: { diagnostics: {}, recommendation: { enabled: true }, searchEngine: {} }
}))

vi.mock('~/utils/dev-log', () => ({ devLog: vi.fn() }))

const ROW_HEIGHT = 48
/** What `useResize` asks for rows of `ROW_HEIGHT`: the rows, the 56px header and its 10px margin. */
function resultsHeight(rows: number): number {
  return rows * ROW_HEIGHT + 56 + 10
}

const innerHeightDescriptor = Object.getOwnPropertyDescriptor(window, 'innerHeight')

/** The height of the window the picker opens in. */
function setWindowHeight(height: number): void {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
}

function renderRows(count: number): void {
  const content = document.querySelector('.CoreBoxRes-ScrollContent') as HTMLElement
  content.innerHTML = ''
  for (let index = 0; index < count; index += 1) {
    const row = document.createElement('div')
    // jsdom has no layout: give the measurer explicit geometry.
    row.getBoundingClientRect = () =>
      ({
        top: index * ROW_HEIGHT,
        bottom: (index + 1) * ROW_HEIGHT,
        height: ROW_HEIGHT,
        left: 0,
        right: 0,
        width: 0,
        x: 0,
        y: 0,
        toJSON: () => ({})
      }) as DOMRect
    Object.defineProperty(row, 'offsetTop', { value: index * ROW_HEIGHT, configurable: true })
    Object.defineProperty(row, 'offsetHeight', { value: ROW_HEIGHT, configurable: true })
    content.appendChild(row)
  }
}

/**
 * The room wired to the window the way CoreBox wires it: `useResize` (inside `useSearch` there)
 * takes the floor and reports whether it applies. The results on screen are `rows` rows.
 */
async function mountRoom(rows: number) {
  let room!: ReturnType<typeof useFlowPanelRoom>
  const results = ref<TuffItem[]>([])
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = createApp({
    setup() {
      room = useFlowPanelRoom()
      useResize({
        results: computed(() => results.value),
        activeActivations: ref<IProviderActivate[] | null>(null),
        loading: ref(false),
        floor: room.floor,
        floorApplied: room.floorApplied
      })
      return () => null
    }
  })
  app.mount(root)

  renderRows(rows)
  results.value = Array.from({ length: rows }, (_, index) => ({ id: `item-${index}` }) as TuffItem)
  await nextTick()
  await vi.advanceTimersByTimeAsync(100)
  await vi.runOnlyPendingTimersAsync()

  return {
    room,
    /** The picker's `room` event, once `useResize` has seen the floor. */
    async update(height: number): Promise<void> {
      room.update(height)
      await nextTick()
    },
    unmount: () => {
      app.unmount()
      root.remove()
    }
  }
}

describe('useFlowPanelRoom', () => {
  let unmount: (() => void) | null = null

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 0)
    )
    vi.stubGlobal('cancelAnimationFrame', (id: number) => window.clearTimeout(id))
    document.body.innerHTML =
      '<div class="CoreBox"></div>' +
      '<div class="CoreBoxRes-Main"><div class="scroll-area"><div class="CoreBoxRes-ScrollContent"></div></div></div>'
  })

  afterEach(() => {
    unmount?.()
    unmount = null
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
    if (innerHeightDescriptor) Object.defineProperty(window, 'innerHeight', innerHeightDescriptor)
  })

  it('paints a window the floor holds above the results, though the window was that tall already', async () => {
    // Picked from the ⌘K panel: main grew the window to 536 for the panel, over two results, and
    // the loading picker asks for that same height. Main stops painting once it hands it over.
    setWindowHeight(536)
    const box = await mountRoom(2)
    unmount = box.unmount
    expect(resultsHeight(2)).toBeLessThan(536)

    await box.update(536)
    expect(box.room.floorApplied.value).toBe(true)
    expect(box.room.fill.value).toBe(true)

    // The loaded targets need less, still more than the results.
    await box.update(356)
    expect(box.room.fill.value).toBe(true)
  })

  it('paints a window the floor grows', async () => {
    setWindowHeight(resultsHeight(2))
    const box = await mountRoom(2)
    unmount = box.unmount

    await box.update(240)
    expect(box.room.fill.value).toBe(true)
  })

  it('paints nothing while the results are as tall as the floor, or taller', async () => {
    setWindowHeight(resultsHeight(8))
    const box = await mountRoom(8)
    unmount = box.unmount

    await box.update(resultsHeight(8))
    expect(box.room.fill.value).toBe(false)
    await box.update(416)
    expect(box.room.floorApplied.value).toBe(false)
    expect(box.room.fill.value).toBe(false)
  })

  it('keeps the paint for 240 ms after the floor goes, while main takes the height back', async () => {
    const box = await mountRoom(2)
    unmount = box.unmount
    await box.update(416)

    // Closed: the floor goes at once and stops applying; the paint stays over main's 120–220 ms
    // resize animation.
    await box.update(0)
    expect(box.room.floor.value).toBe(0)
    expect(box.room.floorApplied.value).toBe(false)
    vi.advanceTimersByTime(239)
    expect(box.room.fill.value).toBe(true)
    vi.advanceTimersByTime(1)
    expect(box.room.fill.value).toBe(false)
  })

  it('keeps the paint for 240 ms when the loaded targets need less than the results', async () => {
    // Opened in a 536px window main grew for the ⌘K panel, over four results (258px). The loaded
    // targets need only 240: the floor stops holding the window up while the picker is still open,
    // and main animates the window down to the results over the strip the floor held.
    setWindowHeight(536)
    const box = await mountRoom(4)
    unmount = box.unmount
    await box.update(536)
    expect(box.room.fill.value).toBe(true)

    await box.update(240)
    expect(box.room.floor.value).toBe(240)
    expect(box.room.floorApplied.value).toBe(false)
    vi.advanceTimersByTime(239)
    expect(box.room.fill.value).toBe(true)
    vi.advanceTimersByTime(1)
    expect(box.room.fill.value).toBe(false)
  })

  it('holds nothing back for a floor that never held the window up', async () => {
    const box = await mountRoom(8)
    unmount = box.unmount
    await box.update(416)

    await box.update(0)
    expect(box.room.fill.value).toBe(false)
    vi.advanceTimersByTime(1_000)
    expect(box.room.fill.value).toBe(false)
  })

  it('keeps painting when the picker reopens while the window is still going back', async () => {
    const box = await mountRoom(2)
    unmount = box.unmount
    await box.update(416)
    await box.update(0)
    vi.advanceTimersByTime(100)

    await box.update(416)
    vi.advanceTimersByTime(1_000)
    expect(box.room.fill.value).toBe(true)
    expect(box.room.floor.value).toBe(416)
  })

  it('paints a reopen the results fill until the window is back, then stops', async () => {
    // Closed over two results, reopened over eight before the window is back: the shrink the
    // first close started is still taking its strip away.
    const box = await mountRoom(2)
    unmount = box.unmount
    await box.update(416)
    await box.update(0)
    vi.advanceTimersByTime(100)
    renderRows(8)
    await box.update(416)
    expect(box.room.floorApplied.value).toBe(false)

    vi.advanceTimersByTime(139)
    expect(box.room.fill.value).toBe(true)
    vi.advanceTimersByTime(1)
    expect(box.room.fill.value).toBe(false)
  })

  it('reads a height that is not a positive number as closed', () => {
    const scope = effectScope()
    const room = scope.run(() => useFlowPanelRoom())!
    room.update(416)
    room.update(Number.NaN)
    expect(room.floor.value).toBe(0)
    room.update(416)
    room.update(-10)
    expect(room.floor.value).toBe(0)
    scope.stop()
  })

  it('clears a pending hold when its scope ends', () => {
    const scope = effectScope()
    const room = scope.run(() => useFlowPanelRoom())!
    room.update(416)
    // As `useResize` reports for a floor above the results.
    room.floorApplied.value = true
    room.update(0)
    expect(vi.getTimerCount()).toBe(1)

    scope.stop()
    expect(vi.getTimerCount()).toBe(0)
  })
})
