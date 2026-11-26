// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import {
  arrangeFramesGrid,
  buildSandboxedFrameSrcdoc,
  CANVAS_MAX_ZOOM,
  CANVAS_MIN_ZOOM,
  clampCanvasZoom,
  computeViewportFit,
  formatNotesForAiPrompt,
  getFrameIframeSandbox,
  inverseLabelScale,
  resolveFrameOuterSize,
  scaleAbout,
  screenToWorld,
  solveFrameSnap,
  stepViewportSpring,
  TDS_CANVAS_FRAME_CSP,
  worldToScreen
} from './canvas-geometry'
import {
  commitSnapshot,
  createCanvasHistory,
  createCanvasHistoryState,
  diffSnapshots,
  fnv1aHash,
  peekSnapshot,
  redoSnapshot,
  restoreSnapshot,
  undoSnapshot
} from './canvas-history'
import type { TdsCanvasFrame, TdsCanvasNote } from './types'

enableAutoUnmount(afterEach)

vi.mock('@talex-touch/tuffex/popover', () => ({
  TxPopover: {
    props: ['modelValue', 'panelBackground'],
    emits: ['update:modelValue'],
    template:
      '<div class="tx-popover-stub" :data-panel-background="panelBackground"><div @click="$emit(\'update:modelValue\', !modelValue)"><slot name="reference" /></div><div v-if="modelValue"><slot /></div></div>'
  }
}))

import TdsDesignCanvas from './TdsDesignCanvas.vue'

function makeFrame(overrides: Partial<TdsCanvasFrame> = {}): TdsCanvasFrame {
  return {
    id: 'frame-1',
    title: 'Landing Mobile',
    kind: 'html',
    source: '<!doctype html><html><body><h1>Hello v1</h1></body></html>',
    deviceId: 'iphone-17-pro',
    orientation: 'portrait',
    showShell: true,
    x: 0,
    y: 0,
    ...overrides
  }
}

describe('canvas-geometry physics, layout, snapping, and strict CSP sandbox', () => {
  it('rescales about cursor anchor keeping world point pinned and clamps zoom bounds', () => {
    const view = { k: 1, tx: 100, ty: 50 }
    const cursor = { x: 320, y: 210 }
    const worldBefore = screenToWorld(cursor, view)

    const zoomedIn = scaleAbout(view, 2, cursor)
    expect(zoomedIn.k).toBe(2)
    const worldAfter = screenToWorld(cursor, zoomedIn)
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 6)
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 6)
    expect(worldToScreen(worldAfter, zoomedIn).x).toBeCloseTo(cursor.x, 6)
    expect(worldToScreen(worldAfter, zoomedIn).y).toBeCloseTo(cursor.y, 6)

    expect(scaleAbout(view, 0.001, cursor).k).toBe(CANVAS_MIN_ZOOM)
    expect(scaleAbout(view, 99, cursor).k).toBe(CANVAS_MAX_ZOOM)
    expect(clampCanvasZoom(Number.NaN)).toBe(1)
  })

  it('computes inverseLabelScale clamped to [1/4, 8]', () => {
    expect(inverseLabelScale(1)).toBe(1)
    expect(inverseLabelScale(0.5)).toBe(2)
    expect(inverseLabelScale(2)).toBe(0.5)
    expect(inverseLabelScale(4)).toBe(0.25)
    expect(inverseLabelScale(0.1)).toBe(8)
    expect(inverseLabelScale(0.05)).toBe(8)
    expect(inverseLabelScale(0.001)).toBe(8)
  })

  it('converges viewport transitions smoothly with TuffEx stepSpring', () => {
    let view = { k: 1, tx: 0, ty: 0 }
    let velocity = { k: 0, tx: 0, ty: 0 }
    const target = { k: 0.65, tx: 180, ty: 90 }
    let settled = false

    for (let step = 0; step < 120; step += 1) {
      const next = stepViewportSpring(view, velocity, target, 1 / 60)
      view = next.view
      velocity = next.velocity
      if (next.settled) {
        settled = true
        break
      }
    }

    expect(settled).toBe(true)
    expect(view.k).toBeCloseTo(target.k, 3)
    expect(view.tx).toBeCloseTo(target.tx, 1)
    expect(view.ty).toBeCloseTo(target.ty, 1)
  })

  it('solves 6-anchor snapping (left/center/right and top/middle/bottom) with alignment guides', () => {
    const sibling = { x: 200, y: 100, width: 400, height: 600 }

    // Left-edge & top-edge snap
    const snapStart = solveFrameSnap({ x: 205, y: 96, width: 300, height: 500 }, [sibling], 8)
    expect(snapStart.snappedX).toBe(true)
    expect(snapStart.snappedY).toBe(true)
    expect(snapStart.x).toBe(200)
    expect(snapStart.y).toBe(100)
    expect(snapStart.guides.some((g) => g.axis === 'x' && g.position === 200)).toBe(true)
    expect(snapStart.guides.some((g) => g.axis === 'y' && g.position === 100)).toBe(true)

    // Horizontal center & vertical middle snap (sibling center = 400, middle = 400)
    const snapCenter = solveFrameSnap({ x: 253, y: 154, width: 300, height: 500 }, [sibling], 8)
    expect(snapCenter.snappedX).toBe(true)
    expect(snapCenter.snappedY).toBe(true)
    expect(snapCenter.x).toBe(250) // 250 + 150 = 400
    expect(snapCenter.y).toBe(150) // 150 + 250 = 400
    expect(
      snapCenter.guides.some((g) => g.axis === 'x' && g.anchor === 'center' && g.position === 400)
    ).toBe(true)
    expect(
      snapCenter.guides.some((g) => g.axis === 'y' && g.anchor === 'center' && g.position === 400)
    ).toBe(true)

    // Right-edge & bottom-edge snap (sibling right = 600, bottom = 700)
    const snapEnd = solveFrameSnap({ x: 296, y: 204, width: 300, height: 500 }, [sibling], 8)
    expect(snapEnd.snappedX).toBe(true)
    expect(snapEnd.snappedY).toBe(true)
    expect(snapEnd.x).toBe(300) // 300 + 300 = 600
    expect(snapEnd.y).toBe(200) // 200 + 500 = 700
    expect(
      snapEnd.guides.some((g) => g.axis === 'x' && g.anchor === 'end' && g.position === 600)
    ).toBe(true)
    expect(
      snapEnd.guides.some((g) => g.axis === 'y' && g.anchor === 'end' && g.position === 700)
    ).toBe(true)

    // Outside threshold -> no snap, no guides (anchors X: 20/50/80, Y: 20/50/80 vs sibling 200..600 / 100..700)
    const noSnap = solveFrameSnap({ x: 20, y: 20, width: 60, height: 60 }, [sibling], 8)
    expect(noSnap.snappedX).toBe(false)
    expect(noSnap.snappedY).toBe(false)
    expect(noSnap.guides).toEqual([])
  })

  it('arranges frames deterministically in a non-overlapping grid keeping order', () => {
    const frames = [
      makeFrame({ id: 'a', deviceId: 'iphone-17-pro', x: 500, y: 400 }),
      makeFrame({ id: 'b', deviceId: 'desktop-hd', x: 10, y: 900 }),
      makeFrame({ id: 'c', deviceId: 'ipad-pro-11', x: -300, y: 50 }),
      makeFrame({ id: 'd', deviceId: 'responsive', width: 640, height: 480, x: 0, y: 0 })
    ]

    const arranged = arrangeFramesGrid(frames, { columns: 2, gapX: 60, gapY: 80 })
    expect(arranged.map((f) => f.id)).toEqual(['a', 'b', 'c', 'd'])

    const sizeA = resolveFrameOuterSize(arranged[0]!)
    const sizeB = resolveFrameOuterSize(arranged[1]!)

    expect(arranged[0]!.x).toBe(0)
    expect(arranged[0]!.y).toBe(0)
    expect(arranged[1]!.x).toBe(sizeA.width + 60)
    expect(arranged[1]!.y).toBe(0)
    expect(arranged[2]!.x).toBe(0)
    expect(arranged[2]!.y).toBe(Math.max(sizeA.height, sizeB.height) + 80)
  })

  it('fits multiple frames centered inside container without upscaling past 1:1', () => {
    const frames = arrangeFramesGrid([
      makeFrame({ id: 'a', deviceId: 'iphone-17-pro' }),
      makeFrame({ id: 'b', deviceId: 'desktop-hd' })
    ])

    const compactFit = computeViewportFit(frames, { width: 800, height: 600 }, 40)
    expect(compactFit.k).toBeGreaterThanOrEqual(CANVAS_MIN_ZOOM)
    expect(compactFit.k).toBeLessThan(1)

    const hugeFit = computeViewportFit(
      [makeFrame({ id: 'w', deviceId: 'apple-watch-46', x: 0, y: 0 })],
      { width: 2000, height: 1500 },
      40
    )
    expect(hugeFit.k).toBe(1)

    expect(computeViewportFit([], { width: 800, height: 600 })).toEqual({ k: 1, tx: 0, ty: 0 })
  })

  it('builds strict zero-network outer-CSP sandboxed srcdoc for HTML and SVG', () => {
    const htmlDoc = buildSandboxedFrameSrcdoc('<div class="a">Hi & "ok"</div>', 'html')
    expect(htmlDoc).toContain('Content-Security-Policy')
    expect(htmlDoc).toContain(TDS_CANVAS_FRAME_CSP)
    expect(htmlDoc).toContain("default-src 'none'")
    expect(htmlDoc).toContain('sandbox="allow-scripts allow-forms allow-modals"')
    expect(htmlDoc).not.toContain('allow-same-origin')
    expect(htmlDoc).toContain('&quot;ok&quot;')
    expect(htmlDoc).toContain('&amp;')
    expect(getFrameIframeSandbox('html')).toBe('allow-scripts allow-forms allow-modals')

    const svgDoc = buildSandboxedFrameSrcdoc(
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="10"/></svg>',
      'svg'
    )
    expect(svgDoc).toContain("default-src 'none'")
    expect(svgDoc).toContain('sandbox=""')
    expect(svgDoc).not.toContain('allow-scripts')
    expect(svgDoc).not.toContain('allow-same-origin')
    expect(getFrameIframeSandbox('svg')).toBe('')

    expect(buildSandboxedFrameSrcdoc('', 'html')).toBe('')
  })

  it('formats unresolved pin notes into structured AI prompt referencing frame, device, and coords', () => {
    const frames = [
      makeFrame({ id: 'f1', title: 'Checkout Flow', deviceId: 'iphone-17-pro' }),
      makeFrame({ id: 'f2', title: 'Admin Board', deviceId: 'desktop-hd' })
    ]
    const notes: TdsCanvasNote[] = [
      {
        id: 'n1',
        frameId: 'f1',
        xRatio: 0.5,
        yRatio: 0.25,
        text: 'Make primary CTA full width',
        resolved: false,
        createdAt: 1
      },
      {
        id: 'n2',
        frameId: 'f2',
        xRatio: 0.1,
        yRatio: 0.1,
        text: 'Already done',
        resolved: true,
        createdAt: 2
      }
    ]

    const result = formatNotesForAiPrompt(notes, frames)
    expect(result.noteIds).toEqual(['n1'])
    expect(result.prompt).toContain('Checkout Flow')
    expect(result.prompt).toContain('iPhone 17 Pro 402×874')
    expect(result.prompt).toContain('(50%, 25%)')
    expect(result.prompt).toContain('(201px, 219px)')
    expect(result.prompt).toContain('Make primary CTA full width')
    expect(result.prompt).not.toContain('Already done')
  })
})

describe('canvas-history content-addressed blob deduplication and forward restore', () => {
  it('deduplicates identical source blobs by fnv1a hash across snapshots', () => {
    expect(fnv1aHash('<h1>A</h1>')).toBe(fnv1aHash('<h1>A</h1>'))
    expect(fnv1aHash('<h1>A</h1>')).not.toBe(fnv1aHash('<h1>B</h1>'))

    const sharedSource = '<!doctype html><body><main>Unchanged</main></body>'
    const history = createCanvasHistory()
    const frameA = makeFrame({ id: 'f1', source: sharedSource, x: 0, y: 0 })
    const frameB = makeFrame({ id: 'f2', source: sharedSource, x: 500, y: 0 })

    history.commitSnapshot('v1', [frameA, frameB], { now: 1000, id: 's1' })
    // Move frame without changing source -> blob count remains 1
    history.commitSnapshot('v2', [{ ...frameA, x: 120 }, frameB], { now: 2000, id: 's2' })
    expect(history.getBlobCount()).toBe(1)

    // Update one frame's source -> blob count increases to 2
    history.commitSnapshot(
      'v3',
      [{ ...frameA, source: '<!doctype html><body><main>Updated</main></body>' }, frameB],
      { now: 3000, id: 's3' }
    )
    expect(history.getBlobCount()).toBe(2)
  })

  it('supports undo, redo, non-destructive peek, forward restore, and snapshot diff', () => {
    let state = createCanvasHistoryState()
    const f1v1 = makeFrame({ id: 'f1', title: 'Hero', source: '<h1>v1</h1>' })
    const f1v2 = makeFrame({ id: 'f1', title: 'Hero', source: '<h1>v2</h1>' })
    const f2 = makeFrame({ id: 'f2', title: 'Pricing', source: '<h2>Pricing</h2>', x: 520 })

    const c1 = commitSnapshot(state, 'v1', [f1v1], { id: 's1', now: 100 })
    state = c1.state
    const c2 = commitSnapshot(state, 'v2', [f1v2, f2], { id: 's2', now: 200 })
    state = c2.state

    // Diff s1 -> s2: f1 modified, f2 added
    const diff12 = diffSnapshots(state, 's1', 's2')
    expect(diff12).toEqual({
      added: ['f2'],
      removed: [],
      modified: ['f1'],
      changedCount: 2
    })

    // Non-destructive peek leaves cursor & entries untouched
    const cursorBeforePeek = state.cursor
    const peeked = peekSnapshot(state, 's1')
    expect(peeked).toHaveLength(1)
    expect(peeked?.[0]?.source).toBe('<h1>v1</h1>')
    expect(state.cursor).toBe(cursorBeforePeek)

    // Undo -> back to s1; Redo -> forward to s2
    const undone = undoSnapshot(state)
    expect(undone.frames?.[0]?.source).toBe('<h1>v1</h1>')
    expect(undone.state.cursor).toBe(0)

    const redone = redoSnapshot(undone.state)
    expect(redone.frames).toHaveLength(2)
    expect(redone.frames?.[0]?.source).toBe('<h1>v2</h1>')
    expect(redone.state.cursor).toBe(1)

    // Restore s1 -> forward commit preserving pre-restore s2!
    const restored = restoreSnapshot(redone.state, 's1', { now: 300 })
    expect(restored).not.toBeNull()
    expect(restored!.frames).toHaveLength(1)
    expect(restored!.frames[0]!.source).toBe('<h1>v1</h1>')
    expect(restored!.state.entries).toHaveLength(3)
    expect(restored!.state.cursor).toBe(2)
    expect(restored!.entry.label).toBe('Restore: v1')

    // Undoing right after restore recovers the preserved pre-restore s2 state
    const undoRestore = undoSnapshot(restored!.state)
    expect(undoRestore.frames).toHaveLength(2)
    expect(undoRestore.frames?.[0]?.source).toBe('<h1>v2</h1>')
  })
})

describe('TdsDesignCanvas component interactions', () => {
  it('renders frames inside TdsDeviceFrame with strict CSP srcdoc, handles zoom/fit, and blocks iframe events while interacting', async () => {
    const frames: TdsCanvasFrame[] = [
      makeFrame({
        id: 'mobile',
        title: 'Mobile Home',
        kind: 'html',
        source: '<!doctype html><body><h1>Mobile</h1></body>',
        deviceId: 'iphone-17-pro',
        x: 0,
        y: 0
      }),
      makeFrame({
        id: 'icon',
        title: 'Logo Mark',
        kind: 'svg',
        source:
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24"/></svg>',
        deviceId: 'apple-watch-46',
        x: 520,
        y: 0
      })
    ]

    const wrapper = mount(TdsDesignCanvas, {
      props: {
        frames,
        lintCounts: {
          mobile: { errors: 1, warnings: 2 },
          icon: { errors: 0, warnings: 0 }
        }
      }
    })
    await flushPromises()

    // Both frames render inside TdsDeviceFrame with strict CSP & exact sandbox attributes
    expect(wrapper.findAll('[data-testid="tds-device-frame"]')).toHaveLength(2)
    const htmlIframe = wrapper.get('[data-testid="tds-canvas-frame-iframe-mobile"]')
    expect(htmlIframe.attributes('sandbox')).toBe('allow-scripts allow-forms allow-modals')
    expect(htmlIframe.attributes('srcdoc')).toContain("default-src 'none'")

    const svgIframe = wrapper.get('[data-testid="tds-canvas-frame-iframe-icon"]')
    expect(svgIframe.attributes('sandbox')).toBe('')
    expect(svgIframe.attributes('srcdoc')).toContain("default-src 'none'")
    expect(svgIframe.attributes('srcdoc')).not.toContain('allow-scripts')

    // Lint badge renders and emits open-lint(frameId)
    const lintBtn = wrapper.get('[data-testid="tds-canvas-frame-lint-mobile"]')
    expect(lintBtn.text()).toContain('3')
    await lintBtn.trigger('click')
    expect(wrapper.emitted('open-lint')).toEqual([['mobile']])

    // Ctrl+Wheel zooms about cursor and enables is-interacting (pointer-events blocked on iframes)
    const stage = wrapper.get('[data-testid="tds-canvas-stage"]')
    const initialZoom = wrapper.get('[data-testid="tds-canvas-zoom-readout"]').text()
    stage.element.dispatchEvent(
      new WheelEvent('wheel', {
        ctrlKey: true,
        deltaY: -100,
        clientX: 200,
        clientY: 160,
        bubbles: true,
        cancelable: true
      })
    )
    await nextTick()
    expect(stage.classes()).toContain('is-interacting')
    expect(htmlIframe.classes()).toContain('is-blocked')
    const zoomedText = wrapper.get('[data-testid="tds-canvas-zoom-readout"]').text()
    expect(zoomedText).not.toBe(initialZoom)

    // World container exposes translate3d + scale + --tds-canvas-lscale
    const worldStyle = wrapper.get('[data-testid="tds-canvas-world"]').attributes('style') ?? ''
    expect(worldStyle).toContain('translate3d(')
    expect(worldStyle).toContain('scale(')
    expect(worldStyle).toContain('--tds-canvas-lscale:')

    // Fit to screen updates viewport scale cleanly
    await wrapper.get('[data-testid="tds-canvas-fit"]').trigger('click')
    await nextTick()
    const fitReadout = Number.parseInt(
      wrapper.get('[data-testid="tds-canvas-zoom-readout"]').text(),
      10
    )
    expect(fitReadout).toBeGreaterThanOrEqual(5)
    expect(fitReadout).toBeLessThanOrEqual(100)
  })

  it('supports adding frames, auto-arranging, switching device preset, and deleting frames', async () => {
    const frames = [makeFrame({ id: 'f1', title: 'Screen A', x: 300, y: 200 })]
    const wrapper = mount(TdsDesignCanvas, {
      props: { frames, aiActionsEnabled: true }
    })
    await flushPromises()

    // Open Add Frame popover and pick Desktop HD
    await wrapper.get('[data-testid="tds-canvas-add-frame-trigger"]').trigger('click')
    await nextTick()
    await wrapper.get('[data-testid="tds-canvas-add-preset-desktop-hd"]').trigger('click')
    expect(wrapper.emitted('add-frame')?.[0]?.[0]).toMatchObject({
      deviceId: 'desktop-hd',
      kind: 'html'
    })

    // Auto-arrange emits updated frame coordinates
    await wrapper.get('[data-testid="tds-canvas-arrange"]').trigger('click')
    const arrangedFrames = wrapper.emitted('update:frames')?.[0]?.[0] as TdsCanvasFrame[]
    expect(arrangedFrames[0]?.x).toBe(0)
    expect(arrangedFrames[0]?.y).toBe(0)

    // Switch device preset on selected frame
    await wrapper.get('[data-testid="tds-canvas-device-switcher"]').trigger('click')
    await nextTick()
    await wrapper.get('[data-testid="tds-canvas-device-option-ipad-pro-11"]').trigger('click')
    const updatedFrames = wrapper.emitted('update:frames')?.[1]?.[0] as TdsCanvasFrame[]
    expect(updatedFrames[0]?.deviceId).toBe('ipad-pro-11')

    // Delete frame emits delete-frame
    await wrapper.get('[data-testid="tds-canvas-frame-delete-f1"]').trigger('click')
    expect(wrapper.emitted('delete-frame')).toEqual([['f1']])
  })

  it('supports dropping Figma-style pin notes, resolving notes, and sending pending notes to AI', async () => {
    const frames = [makeFrame({ id: 'f1', title: 'Checkout Card', deviceId: 'iphone-17-pro' })]
    const wrapper = mount(TdsDesignCanvas, {
      props: {
        frames,
        notes: [],
        aiActionsEnabled: true
      }
    })
    await flushPromises()

    // Activate Note tool (C)
    await wrapper.get('[data-testid="tds-canvas-tool-note"]').trigger('click')
    await nextTick()

    // Click frame note drop surface -> opens inline composer
    await wrapper.get('[data-testid="tds-canvas-note-surface-f1"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="tds-canvas-note-composer"]').exists()).toBe(true)

    await wrapper
      .get('[data-testid="tds-canvas-note-input"]')
      .setValue('Increase spacing above CTA button')
    await wrapper.get('[data-testid="tds-canvas-note-save"]').trigger('click')
    await nextTick()

    const emittedNotes = wrapper.emitted('update:notes')?.[0]?.[0] as TdsCanvasNote[]
    expect(emittedNotes).toHaveLength(1)
    expect(emittedNotes[0]?.frameId).toBe('f1')
    expect(emittedNotes[0]?.text).toBe('Increase spacing above CTA button')
    expect(emittedNotes[0]?.resolved).toBe(false)

    // Feed updated notes back as controlled prop -> pin renders & Send Notes to AI appears
    await wrapper.setProps({ notes: emittedNotes })
    await nextTick()

    const noteId = emittedNotes[0]!.id
    expect(wrapper.find(`[data-testid="tds-canvas-pin-${noteId}"]`).text()).toBe('1')

    await wrapper.get('[data-testid="tds-canvas-send-notes-ai"]').trigger('click')
    const aiPayload = wrapper.emitted('send-notes-to-ai')?.[0]?.[0] as {
      prompt: string
      noteIds: string[]
    }
    expect(aiPayload.noteIds).toEqual([noteId])
    expect(aiPayload.prompt).toContain('Checkout Card')
    expect(aiPayload.prompt).toContain('iPhone 17 Pro 402×874')
    expect(aiPayload.prompt).toContain('Increase spacing above CTA button')

    // Ask frame AI popover emits ask-frame-ai
    await wrapper.get('[data-testid="tds-canvas-ask-frame-trigger"]').trigger('click')
    await nextTick()
    await wrapper.get('[data-testid="tds-canvas-ask-frame-input"]').setValue('Add dark mode toggle')
    await wrapper.get('[data-testid="tds-canvas-ask-frame-submit"]').trigger('click')
    expect(wrapper.emitted('ask-frame-ai')).toEqual([
      [{ frameId: 'f1', prompt: 'Add dark mode toggle' }]
    ])

    // Newly saved pin card starts open; toggling pin closes & reopens it, then resolve marks resolved: true
    expect(wrapper.find(`[data-testid="tds-canvas-pin-card-${noteId}"]`).exists()).toBe(true)
    await wrapper.get(`[data-testid="tds-canvas-pin-${noteId}"]`).trigger('click')
    await nextTick()
    expect(wrapper.find(`[data-testid="tds-canvas-pin-card-${noteId}"]`).exists()).toBe(false)
    await wrapper.get(`[data-testid="tds-canvas-pin-${noteId}"]`).trigger('click')
    await nextTick()
    expect(wrapper.find(`[data-testid="tds-canvas-pin-card-${noteId}"]`).exists()).toBe(true)
    await wrapper.get(`[data-testid="tds-canvas-pin-resolve-${noteId}"]`).trigger('click')
    const resolvedNotes = wrapper.emitted('update:notes')?.[1]?.[0] as TdsCanvasNote[]
    expect(resolvedNotes[0]?.resolved).toBe(true)
  })

  it('snaps dragged frames to sibling edges with live alignment guides and renders empty state quick-add buttons', async () => {
    // 1. Empty state renders quick-add presets
    const emptyWrapper = mount(TdsDesignCanvas, { props: { frames: [] } })
    await flushPromises()
    expect(emptyWrapper.find('[data-testid="tds-canvas-empty"]').exists()).toBe(true)
    await emptyWrapper.get('[data-testid="tds-canvas-empty-add-phone"]').trigger('click')
    expect(emptyWrapper.emitted('add-frame')?.[0]?.[0]).toMatchObject({
      deviceId: 'iphone-17-pro',
      kind: 'html'
    })

    // 2. Dragging frame-2 near frame-1's top y=0 snaps and shows guide line
    const frames = [
      makeFrame({ id: 'f1', title: 'Primary', x: 0, y: 0 }),
      makeFrame({ id: 'f2', title: 'Secondary', x: 520, y: 36 })
    ]
    const wrapper = mount(TdsDesignCanvas, { props: { frames } })
    await flushPromises()

    const dragHandle = wrapper.get('[data-testid="tds-canvas-frame-drag-f2"]')
    const stage = wrapper.get('[data-testid="tds-canvas-stage"]')

    const makePointer = (type: string, clientX: number, clientY: number): MouseEvent => {
      const evt = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX,
        clientY
      })
      Object.defineProperty(evt, 'pointerId', { value: 7 })
      return evt
    }

    dragHandle.element.dispatchEvent(makePointer('pointerdown', 600, 100))
    await nextTick()
    // Move up by 33px -> raw y = 3, within 8px snap threshold of f1.y = 0
    stage.element.dispatchEvent(makePointer('pointermove', 600, 67))
    await nextTick()
    expect(wrapper.findAll('[data-testid="tds-canvas-snap-guide"]').length).toBeGreaterThan(0)

    stage.element.dispatchEvent(makePointer('pointerup', 600, 67))
    await nextTick()
    const committed = wrapper.emitted('update:frames')?.[0]?.[0] as TdsCanvasFrame[]
    expect(committed[1]?.y).toBe(0)
  })

  it('supports History Peek, non-destructive forward Restore, and Before/After split-slider Compare mode', async () => {
    const frameV1 = makeFrame({
      id: 'f1',
      title: 'Pricing Hero',
      source: '<!doctype html><body><h1>Pricing v1</h1></body>'
    })
    const frameV2 = makeFrame({
      id: 'f1',
      title: 'Pricing Hero',
      source: '<!doctype html><body><h1>Pricing v2</h1></body>'
    })

    const wrapper = mount(TdsDesignCanvas, {
      props: { frames: [frameV1] }
    })
    await flushPromises()

    // Open history strip (Initial snapshot already recorded)
    await wrapper.get('[data-testid="tds-canvas-history-toggle"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="tds-canvas-history-bar"]').exists()).toBe(true)

    // Update frames to v2 and save a second snapshot
    await wrapper.setProps({ frames: [frameV2] })
    await wrapper.get('[data-testid="tds-canvas-history-save"]').trigger('click')
    await nextTick()

    const entries = wrapper.findAll('[data-testid^="tds-canvas-history-entry-"]')
    expect(entries).toHaveLength(2)

    // Extract the first (Initial) snapshot id
    const initialEntryEl = entries[1]!
    const initialSnapId = initialEntryEl
      .attributes('data-testid')!
      .replace('tds-canvas-history-entry-', '')

    // Peek Initial snapshot -> displays v1 non-destructively without emitting update:frames
    await wrapper.get(`[data-testid="tds-canvas-history-peek-${initialSnapId}"]`).trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="tds-canvas-peek-banner"]').exists()).toBe(true)
    expect(
      wrapper.get('[data-testid="tds-canvas-frame-iframe-f1"]').attributes('srcdoc')
    ).toContain('Pricing v1')
    expect(wrapper.emitted('update:frames')).toBeUndefined()

    // Exit peek -> back to live v2
    await wrapper.get('[data-testid="tds-canvas-peek-exit"]').trigger('click')
    await nextTick()
    expect(
      wrapper.get('[data-testid="tds-canvas-frame-iframe-f1"]').attributes('srcdoc')
    ).toContain('Pricing v2')

    // Enter Before/After compare mode against Initial snapshot
    await wrapper.get('[data-testid="tds-canvas-compare-toggle"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="tds-canvas-compare-overlay"]').exists()).toBe(true)

    const beforeIframe = wrapper.get('[data-testid="tds-canvas-compare-before-iframe"]')
    const afterIframe = wrapper.get('[data-testid="tds-canvas-compare-after-iframe"]')
    expect(beforeIframe.attributes('srcdoc')).toContain('Pricing v1')
    expect(beforeIframe.attributes('srcdoc')).toContain("default-src 'none'")
    expect(afterIframe.attributes('srcdoc')).toContain('Pricing v2')
    expect(afterIframe.attributes('srcdoc')).toContain("default-src 'none'")

    // Move split slider to 30% -> clip-path updates
    await wrapper.get('[data-testid="tds-canvas-compare-slider"]').setValue('30')
    await nextTick()
    expect(wrapper.get('[data-testid="tds-canvas-compare-after"]').attributes('style')).toContain(
      'inset(0 0 0 30%)'
    )

    // Exit compare and forward-restore Initial snapshot -> emits update:frames and adds 3rd entry
    await wrapper.get('[data-testid="tds-canvas-compare-exit"]').trigger('click')
    await nextTick()
    await wrapper
      .get(`[data-testid="tds-canvas-history-restore-${initialSnapId}"]`)
      .trigger('click')
    await nextTick()

    const restoredFrames = wrapper.emitted('update:frames')?.[0]?.[0] as TdsCanvasFrame[]
    expect(restoredFrames[0]?.source).toContain('Pricing v1')
    expect(wrapper.findAll('[data-testid^="tds-canvas-history-entry-"]')).toHaveLength(3)
  })

  it('prevents iframe wheel/drag swallowing via pointer-capture shield and toggles explicit interactive mode', async () => {
    const frames = [
      makeFrame({ id: 'f1', title: 'Frame One', x: 0, y: 0 }),
      makeFrame({ id: 'f2', title: 'Frame Two', x: 520, y: 0 })
    ]
    const wrapper = mount(TdsDesignCanvas, {
      props: { frames }
    })
    await flushPromises()

    // Both frames start shielded and iframes blocked against swallowing wheel/drag
    expect(wrapper.find('[data-testid="tds-canvas-frame-shield-f1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="tds-canvas-frame-shield-f2"]').exists()).toBe(true)
    const shield1 = wrapper.get('[data-testid="tds-canvas-frame-shield-f1"]')
    expect(wrapper.get('[data-testid="tds-canvas-frame-iframe-f1"]').classes()).toContain(
      'is-blocked'
    )

    // Wheel zoom directly on the frame shield bubbles to the canvas stage and zooms cleanly
    const zoomBefore = wrapper.get('[data-testid="tds-canvas-zoom-readout"]').text()
    shield1.element.dispatchEvent(
      new WheelEvent('wheel', {
        ctrlKey: true,
        deltaY: -100,
        clientX: 180,
        clientY: 140,
        bubbles: true,
        cancelable: true
      })
    )
    await nextTick()
    expect(wrapper.get('[data-testid="tds-canvas-zoom-readout"]').text()).not.toBe(zoomBefore)

    // Wait for wheel idle clear or click Interact toggle on frame 2 -> activates live passthrough for f2 only
    vi.useFakeTimers()
    try {
      shield1.element.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 10, bubbles: true, cancelable: true })
      )
      vi.advanceTimersByTime(200)
      await nextTick()
    } finally {
      vi.useRealTimers()
    }

    await wrapper.get('[data-testid="tds-canvas-frame-shield-f2"]').trigger('dblclick')
    await nextTick()
    expect(wrapper.get('[data-testid="tds-canvas-frame-f2"]').attributes('data-interactive')).toBe(
      'true'
    )
    expect(wrapper.find('[data-testid="tds-canvas-frame-shield-f2"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="tds-canvas-frame-iframe-f2"]').classes()).not.toContain(
      'is-blocked'
    )
    // Frame 1 remains shielded
    expect(wrapper.find('[data-testid="tds-canvas-frame-shield-f1"]').exists()).toBe(true)

    // Pressing Escape automatically disengages interactive mode and restores the shield
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(wrapper.get('[data-testid="tds-canvas-frame-f2"]').attributes('data-interactive')).toBe(
      'false'
    )
    expect(wrapper.find('[data-testid="tds-canvas-frame-shield-f2"]').exists()).toBe(true)

    // Dedicated Interact toggle in inspector engages interactive mode and wheeling disengages it
    await wrapper.get('[data-testid="tds-canvas-interact-toggle"]').trigger('click')
    await nextTick()
    expect(wrapper.get('[data-testid="tds-canvas-frame-f2"]').attributes('data-interactive')).toBe(
      'true'
    )
    wrapper
      .get('[data-testid="tds-canvas-stage"]')
      .element.dispatchEvent(
        new WheelEvent('wheel', { deltaY: 40, bubbles: true, cancelable: true })
      )
    await nextTick()
    expect(wrapper.get('[data-testid="tds-canvas-frame-f2"]').attributes('data-interactive')).toBe(
      'false'
    )
  })

  it('caps live iframes to MAX_LIVE_IFRAMES=2 when frameBitmaps exist and rasterizes all frames while interacting', async () => {
    const sampleBitmap =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const frames = Array.from({ length: 6 }, (_, idx) =>
      makeFrame({
        id: `f${idx + 1}`,
        title: `Board ${idx + 1}`,
        x: idx * 460,
        y: 0
      })
    )
    const frameBitmaps: Record<string, string> = {}
    for (const frame of frames) {
      frameBitmaps[frame.id] = sampleBitmap
    }

    const wrapper = mount(TdsDesignCanvas, {
      props: {
        frames,
        selectedFrameId: 'f1',
        frameBitmaps
      }
    })
    await flushPromises()

    // At rest: at most 2 live iframes mounted; remaining 4 render crisp raster images
    expect(wrapper.findAll('[data-testid^="tds-canvas-frame-iframe-"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-testid^="tds-canvas-frame-raster-"]')).toHaveLength(4)
    expect(wrapper.find('[data-testid="tds-canvas-frame-iframe-f1"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="tds-canvas-frame-raster-f5"]').exists()).toBe(true)

    // Interacting with a previously rasterized frame (#5) upgrades it to a live iframe while keeping total <= 2
    await wrapper.get('[data-testid="tds-canvas-frame-interact-f5"]').trigger('click')
    await nextTick()
    expect(wrapper.find('[data-testid="tds-canvas-frame-iframe-f5"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid^="tds-canvas-frame-iframe-"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-testid^="tds-canvas-frame-raster-"]')).toHaveLength(4)

    // During active pan/zoom (wheel), ALL 6 frames swap to GPU-scaled raster images (0 live iframes)
    wrapper.get('[data-testid="tds-canvas-stage"]').element.dispatchEvent(
      new WheelEvent('wheel', {
        ctrlKey: true,
        deltaY: -80,
        bubbles: true,
        cancelable: true
      })
    )
    await nextTick()
    expect(wrapper.findAll('[data-testid^="tds-canvas-frame-iframe-"]')).toHaveLength(0)
    expect(wrapper.findAll('[data-testid^="tds-canvas-frame-raster-"]')).toHaveLength(6)
  })

  it('satisfies TDS design discipline: zero raw hex/rgba literals, zero hover color transitions, refraction popovers, and reduced-motion guard', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    const sfcSource = readFileSync(path.join(dir, 'TdsDesignCanvas.vue'), 'utf8')
    const styleMatch = sfcSource.match(/<style[^>]*>([\s\S]*?)<\/style>/)
    const styleBlock = styleMatch?.[1] ?? ''

    // Zero raw hex or rgba/rgb color literals in component styles
    expect(styleBlock).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(styleBlock).not.toMatch(/\brgba?\s*\(/i)

    // Zero color / background-color / border-color hover transitions
    expect(styleBlock).not.toMatch(/transition[^;]*(background-color|border-color|\bcolor\b)/i)

    // Reduced-motion escape present
    expect(styleBlock).toContain('@media (prefers-reduced-motion: reduce)')

    // Every TxPopover uses panel-background="refraction"
    const popoverTags = sfcSource.match(/<TxPopover[\s\S]*?>/g) ?? []
    expect(popoverTags.length).toBeGreaterThan(0)
    for (const tag of popoverTags) {
      expect(tag).toContain('panel-background="refraction"')
    }
  })
})
