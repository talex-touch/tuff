import type { AvatarEditorTransform } from './types'
import { stepSpring } from '../../../../../utils/animation/spring'
import { normalizeRotation } from './geometry'

export interface StageVisualState {
  zoom: number
  offsetX: number
  offsetY: number
  rotation: number
  maskRadiusRatio: number
  gridAlpha: number
}

const TRANSFORM_SPRING = { stiffness: 340, damping: 28 }
const GRID_SPRING = { stiffness: 420, damping: 34 }
const EPSILON = 0.001

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export interface StageMotionController {
  readonly state: StageVisualState
  snap: (target: AvatarEditorTransform, maskRadiusRatio: number, gridAlpha: number) => void
  springTo: (
    target: AvatarEditorTransform,
    maskRadiusRatio: number,
    gridAlpha: number,
    onFrame: () => void,
  ) => void
  stop: () => void
}

/**
 * Frame-driven spring interpolator (`stepSpring`) for silky button transforms
 * (90° rotate, fit/fill, reset), continuous mask morphing, and grid fade.
 */
export function createStageMotion(initialMaskRatio: number): StageMotionController {
  const state: StageVisualState = {
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    maskRadiusRatio: initialMaskRatio,
    gridAlpha: 0,
  }

  const vel = {
    zoom: 0,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    maskRadiusRatio: 0,
    gridAlpha: 0,
  }

  let rafId: number | null = null
  let lastTs = 0
  let goal: StageVisualState = { ...state }
  let activeCallback: (() => void) | null = null

  function stop(): void {
    if (rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    lastTs = 0
    activeCallback = null
  }

  function resetVelocities(): void {
    vel.zoom = 0
    vel.offsetX = 0
    vel.offsetY = 0
    vel.rotation = 0
    vel.maskRadiusRatio = 0
    vel.gridAlpha = 0
  }

  function snap(target: AvatarEditorTransform, maskRadiusRatio: number, gridAlpha: number): void {
    stop()
    resetVelocities()
    state.zoom = target.zoom
    state.offsetX = target.offsetX
    state.offsetY = target.offsetY
    state.rotation = target.rotation
    state.maskRadiusRatio = maskRadiusRatio
    state.gridAlpha = gridAlpha
    goal = { ...state }
  }

  function tick(ts: number): void {
    const dt = lastTs > 0 ? Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000)) : 1 / 60
    lastTs = ts

    ;[state.zoom, vel.zoom] = stepSpring(state.zoom, vel.zoom, goal.zoom, TRANSFORM_SPRING, dt)
    ;[state.offsetX, vel.offsetX] = stepSpring(state.offsetX, vel.offsetX, goal.offsetX, TRANSFORM_SPRING, dt)
    ;[state.offsetY, vel.offsetY] = stepSpring(state.offsetY, vel.offsetY, goal.offsetY, TRANSFORM_SPRING, dt)
    ;[state.rotation, vel.rotation] = stepSpring(state.rotation, vel.rotation, goal.rotation, TRANSFORM_SPRING, dt)
    ;[state.maskRadiusRatio, vel.maskRadiusRatio] = stepSpring(
      state.maskRadiusRatio,
      vel.maskRadiusRatio,
      goal.maskRadiusRatio,
      TRANSFORM_SPRING,
      dt,
    )
    ;[state.gridAlpha, vel.gridAlpha] = stepSpring(state.gridAlpha, vel.gridAlpha, goal.gridAlpha, GRID_SPRING, dt)

    const settled
      = Math.abs(state.zoom - goal.zoom) < EPSILON && Math.abs(vel.zoom) < EPSILON
        && Math.abs(state.offsetX - goal.offsetX) < EPSILON && Math.abs(vel.offsetX) < EPSILON
        && Math.abs(state.offsetY - goal.offsetY) < EPSILON && Math.abs(vel.offsetY) < EPSILON
        && Math.abs(state.rotation - goal.rotation) < 0.05 && Math.abs(vel.rotation) < 0.05
        && Math.abs(state.maskRadiusRatio - goal.maskRadiusRatio) < EPSILON && Math.abs(vel.maskRadiusRatio) < EPSILON
        && Math.abs(state.gridAlpha - goal.gridAlpha) < 0.01 && Math.abs(vel.gridAlpha) < 0.01

    if (settled) {
      state.zoom = goal.zoom
      state.offsetX = goal.offsetX
      state.offsetY = goal.offsetY
      state.rotation = normalizeRotation(goal.rotation)
      state.maskRadiusRatio = goal.maskRadiusRatio
      state.gridAlpha = goal.gridAlpha
      resetVelocities()
      const cb = activeCallback
      stop()
      cb?.()
      return
    }

    activeCallback?.()
    rafId = requestAnimationFrame(tick)
  }

  function springTo(
    target: AvatarEditorTransform,
    maskRadiusRatio: number,
    gridAlpha: number,
    onFrame: () => void,
  ): void {
    if (prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      snap(target, maskRadiusRatio, gridAlpha)
      onFrame()
      return
    }

    // Take the shortest angular path so rotating across ±180° never spins backwards 270°.
    const shortestDelta = normalizeRotation(target.rotation - state.rotation)
    goal = {
      zoom: target.zoom,
      offsetX: target.offsetX,
      offsetY: target.offsetY,
      rotation: state.rotation + shortestDelta,
      maskRadiusRatio,
      gridAlpha,
    }
    activeCallback = onFrame
    if (rafId === null) {
      lastTs = 0
      rafId = requestAnimationFrame(tick)
    }
  }

  return { state, snap, springTo, stop }
}
