// Adapted from Amicro. MIT License — Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { ComputedRef, Ref } from 'vue'
import type { SceneInput } from './geometry'
import type { PreparedShape } from './paint'
import type { DitherDataset, DitherHover, DitherPattern } from './types'
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import { useMotionActivity } from '../../../../../../utils/motion-activity'
import { springSteps } from '../../../../liquid/src/spring'
import { createDitherScene, finite } from './geometry'
import { paintDither, prepareDitherScene } from './paint'

export interface DitherRenderInput extends SceneInput {
  animated: boolean
  pattern: DitherPattern
  hover: DitherHover | null
  pointer: { x: number, y: number, inside: boolean }
}
interface NumericTween { position: number, velocity: number, target: number, write: (value: number) => void }

/** One owner for backing size, theme, DPR, interpolation and cancellation. Frames never read layout. */
export function useDitherCanvas(
  canvas: Ref<HTMLCanvasElement | null>,
  host: Ref<HTMLElement | null>,
  input: ComputedRef<DitherRenderInput>,
  width: Ref<number>,
): { ready: Ref<boolean>, active: ComputedRef<boolean> } {
  const { active, reduced, visible } = useMotionActivity(host, () => input.value.animated && (input.value.pattern === 'pixel' || input.value.pattern === 'ordered'))
  const ready = ref(false)
  let mounted = false
  let documentVisible = true
  let observer: ResizeObserver | undefined
  let themeObserver: MutationObserver | undefined
  let dprMedia: MediaQueryList | undefined
  let raf: number | undefined
  let previousTime = 0
  let lastPaintTime = 0
  let phase = 0
  let dpr = 1
  let colors: string[] = []
  let labelColor = ''
  let prepared: PreparedShape[] = []
  let displayed: DitherDataset = {}
  let tweens: NumericTween[] = []
  let selectionTween: { position: number, velocity: number, target: number } | undefined
  let geometryDirty = true
  let bound = false
  let forcePaint = true

  function stopFrame(): void {
    if (raf !== undefined) cancelAnimationFrame(raf)
    raf = undefined
    previousTime = 0
    lastPaintTime = 0
  }

  function bindDpr(): void {
    dprMedia?.removeEventListener('change', onDpr)
    dpr = Math.min(window.devicePixelRatio || 1, 2)
    dprMedia = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
    dprMedia.addEventListener('change', onDpr, { once: true })
  }

  function onDpr(): void {
    bindDpr()
    resize()
  }

  function refreshColors(): void {
    const element = host.value
    if (!element) return
    const probes = element.querySelectorAll<HTMLElement>('[data-dither-color]')
    colors = Array.from(probes, probe => getComputedStyle(probe).color)
    if (!colors.length) colors = [getComputedStyle(element).color]
    const labelProbe = element.querySelector<HTMLElement>('[data-dither-label-color]')
    labelColor = labelProbe ? getComputedStyle(labelProbe).color : getComputedStyle(element).backgroundColor
    forcePaint = true
    drawStatic()
  }

  function resize(): void {
    const element = host.value; const target = canvas.value
    if (!element || !target) return
    // Only called by observers/events or activation, never by the animation driver.
    const measured = element.clientWidth
    if (measured > 0) width.value = measured
    const w = Math.max(1, Math.round(width.value * dpr))
    const h = Math.max(1, Math.round(input.value.height * dpr))
    if (target.width !== w) target.width = w
    if (target.height !== h) target.height = h
    geometryDirty = true
    forcePaint = true
    drawStatic()
  }

  function bindObservers(): void {
    if (bound || !mounted || !host.value || !documentVisible) return
    bound = true
    bindDpr()
    resize()
    observer = new ResizeObserver(resize)
    observer.observe(host.value)
    themeObserver = new MutationObserver(refreshColors)
    // Theme belongs to ancestors; observing the entire document subtree would
    // make this canvas respond to every other chart's per-frame style writes.
    for (let element: HTMLElement | null = host.value; element; element = element.parentElement)
      themeObserver.observe(element, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
    window.addEventListener('resize', resize)
    refreshColors()
  }

  function unbindObservers(): void {
    observer?.disconnect()
    themeObserver?.disconnect()
    observer = undefined
    themeObserver = undefined
    dprMedia?.removeEventListener('change', onDpr)
    dprMedia = undefined
    window.removeEventListener('resize', resize)
    bound = false
  }

  function updateDataset(): void {
    const next = input.value.dataset
    const old = displayed
    tweens = []
    const shouldTween = active.value
    const add = (from: number, target: number, write: (value: number) => void): void => {
      const position = shouldTween ? finite(from, target) : target
      write(position)
      tweens.push({ position, velocity: 0, target, write })
    }
    const series = (next.series ?? []).map((item) => {
      const previous = old.series?.find(entry => entry.id === item.id)
      const data = (item.data ?? []).map((point, index, all) => {
        const prior = previous?.data ?? []
        const priorIndex = all.length > 1 ? Math.round(index / (all.length - 1) * Math.max(0, prior.length - 1)) : 0
        const copy = { ...point }
        add(prior[priorIndex]?.value ?? point.value, finite(point.value), value => { copy.value = value })
        return copy
      })
      const copy = { ...item, data }
      if (item.value !== undefined) add(previous?.value ?? item.value, finite(item.value), value => { copy.value = value })
      if (item.capacity !== undefined) add(previous?.capacity ?? item.capacity, finite(item.capacity, 100), value => { copy.capacity = value })
      return copy
    })
    const nodes = (next.nodes ?? []).map((item) => {
      const previous = old.nodes?.find(entry => entry.id === item.id)
      const copy = { ...item }
      add(previous?.x ?? item.x, finite(item.x), value => { copy.x = value })
      add(previous?.y ?? item.y, finite(item.y), value => { copy.y = value })
      add(previous?.radius ?? item.radius ?? 7, finite(item.radius, input.value.variant === 'dither-traffic' ? 25 : 7), value => { copy.radius = value })
      return copy
    })
    const cells = (next.cells ?? []).map((item) => {
      const previous = old.cells?.find(entry => entry.id === item.id)
      const copy = { ...item }
      add(previous?.value ?? item.value, finite(item.value), value => { copy.value = value })
      return copy
    })
    displayed = { series, nodes, cells }
    updateSelection()
    geometryDirty = true
    forcePaint = true
    drawStatic()
  }

  function updateSelection(): void {
    if (!['dither-gauge', 'dither-radial', 'dither-storage'].includes(input.value.variant)) {
      selectionTween = undefined
      return
    }
    const all = input.value.dataset.series ?? []
    const selected = all.find(item => item.id === input.value.selectedSeries)
      ?? all.find(item => !input.value.activeKeys || input.value.activeKeys.includes(item.id))
    const value = selected?.value ?? selected?.data?.reduce((sum, point) => sum + finite(point.value), 0) ?? 0
    const target = Math.min(1, Math.max(0, value / Math.max(1, finite(selected?.capacity, 100))))
    if (!selectionTween || !active.value) selectionTween = { position: target, velocity: 0, target }
    else selectionTween.target = target
    geometryDirty = true
  }

  function settle(): void {
    for (const tween of tweens) {
      tween.position = tween.target
      tween.velocity = 0
      tween.write(tween.target)
    }
    if (selectionTween) {
      selectionTween.position = selectionTween.target
      selectionTween.velocity = 0
    }
    geometryDirty = true
  }

  function drawStatic(): void {
    if (!mounted || !documentVisible || !canvas.value || !host.value) return
    const current = input.value
    if (current.pattern !== 'pixel' && current.pattern !== 'ordered') {
      ready.value = false
      return
    }
    const ctx = canvas.value.getContext('2d')
    if (!ctx || typeof Path2D === 'undefined') return
    if (geometryDirty) {
      const gaugeJitter = active.value && current.variant === 'dither-gauge' ? (Math.sin(phase) * 2 + Math.cos(phase * 2.3) * 1.5) / 100 : 0
      prepared = prepareDitherScene(createDitherScene({ ...current, dataset: displayed, selectedRatio: selectionTween ? selectionTween.position + gaugeJitter : undefined }))
      geometryDirty = false
    }
    paintDither(ctx, { shapes: prepared, width: current.width, height: current.height, dpr, phase: reduced.value || !current.animated ? 0 : phase, hover: current.hover, pointer: current.pointer, pattern: current.pattern, colors, labelColor, moving: active.value })
    ready.value = true
    forcePaint = false
  }

  function onFrame(now: number): void {
    raf = undefined
    if (!active.value || !mounted || !documentVisible) return
    const dt = previousTime ? Math.min(0.1, (now - previousTime) / 1000) : 0
    previousTime = now
    const slow = input.value.variant === 'dither-funnel' || input.value.variant === 'dither-storage' || input.value.variant === 'dither-uptime'
    phase += dt * (input.value.variant === 'dither-gauge' ? 3 : input.value.variant === 'dither-growth' || input.value.variant === 'members-growth' ? 1.8 : 1.2)
    let changing = false
    for (const tween of tweens) {
      if (Math.abs(tween.target - tween.position) < 0.001 && Math.abs(tween.velocity) < 0.001) continue
      const config = input.value.variant === 'dither-gauge' ? { stiffness: 120, damping: 20 }
        : input.value.variant === 'dither-storage' ? { stiffness: 150, damping: 20 } : 'smooth'
      const result = springSteps(tween.position, tween.velocity, tween.target, config, dt)
      tween.position = result[0]
      tween.velocity = result[1]
      tween.write(tween.position)
      changing = true
    }
    if (selectionTween && (Math.abs(selectionTween.target - selectionTween.position) > 0.0001 || Math.abs(selectionTween.velocity) > 0.0001)) {
      const result = springSteps(selectionTween.position, selectionTween.velocity, selectionTween.target,
        input.value.variant === 'dither-storage' ? { stiffness: 150, damping: 20 } : { stiffness: 120, damping: 20 }, dt)
      selectionTween.position = result[0]
      selectionTween.velocity = result[1]
      changing = true
    }
    if (changing || input.value.variant === 'dither-gauge') geometryDirty = true
    if (forcePaint || !slow || now - lastPaintTime >= 33) {
      lastPaintTime = now
      drawStatic()
    }
    raf = requestAnimationFrame(onFrame)
  }

  function sync(): void {
    if (!mounted) return
    if (!visible.value || !documentVisible) {
      stopFrame()
      unbindObservers()
      return
    }
    bindObservers()
    if (!active.value) {
      stopFrame()
      settle()
      drawStatic()
    } else if (raf === undefined) {
      previousTime = 0
      raf = requestAnimationFrame(onFrame)
    }
  }

  function onVisibility(): void {
    documentVisible = document.visibilityState === 'visible'
    sync()
  }

  function start(): void {
    if (mounted) return
    mounted = true
    documentVisible = document.visibilityState === 'visible'
    document.addEventListener('visibilitychange', onVisibility)
    updateDataset()
    // The first measured static frame is available before IntersectionObserver fires.
    bindObservers()
    sync()
  }

  function stop(): void {
    if (!mounted) return
    mounted = false
    stopFrame()
    unbindObservers()
    document.removeEventListener('visibilitychange', onVisibility)
    ready.value = false
  }

  watch(() => input.value.dataset, () => {
    updateDataset()
    if (mounted) refreshColors()
  }, { deep: true, flush: 'post' })
  watch(() => [input.value.variant, input.value.selectedSeries, input.value.activeKeys, input.value.maxValue, input.value.height], () => {
    updateSelection()
    geometryDirty = true
    forcePaint = true
    if (mounted) resize()
  }, { deep: true })
  watch(() => [input.value.hover, input.value.pointer.x, input.value.pointer.y, input.value.pointer.inside, input.value.pattern], () => {
    if (input.value.variant === 'dither-scatter') geometryDirty = true
    forcePaint = true
    if (mounted) {
      drawStatic()
      sync()
    }
  }, { deep: true })
  watch([active, visible, reduced], sync, { flush: 'post' })
  onMounted(start)
  onActivated(start)
  onDeactivated(stop)
  onBeforeUnmount(stop)
  return { ready, active: computed(() => active.value && mounted) }
}
