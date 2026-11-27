import type { MatrixLoaderEra, MatrixLoaderShape, MatrixLoaderState } from '../types'
import { hasDocument } from '@talex-touch/utils/env'
import { MATRIX_LOADER_PERIODS } from '../types'
import {
  BAYER_4X4,
  clamp,
  easeInOutCubic,
  easeInOutQuart,
  easeInOutQuint,
  halftoneRatio,
  holdMorph,
  lerp,
  noise2,
  normalizeGridSize,
  smoothstep,
  sphericalWarp,
} from './math'

export interface MatrixLoaderBlendLayer {
  state: MatrixLoaderState
  weight: number
}

export interface RenderOptions {
  state: MatrixLoaderState
  era: MatrixLoaderEra
  shape: MatrixLoaderShape
  gridSize: number
  bulge: number
  taper: number
  fill: number
  intensity: number
  noise: number
  noiseFrequency: number
  fxStrength: number
  dark: boolean
  inkRgb: readonly [number, number, number]
  /** Optional OLED ink alpha channel in `[0, 1]`. Defaults to `1`. */
  inkAlpha?: number
  /** Optional previous state during smooth state-to-state morph. */
  prevState?: MatrixLoaderState
  /** Morph progress in `[0, 1]` from `prevState` to `state`. */
  morphMix?: number
  /** Optional weighted outgoing layers for interrupted crossfades. */
  prevLayers?: readonly MatrixLoaderBlendLayer[]
}

interface EraStyle {
  substrateBg: string | null
  substrateBorder: string | null
  rgb: readonly [number, number, number]
  glow: number
  glowColor: string
}

const DECIDING_STOPS: readonly (readonly [number, number])[] = [
  [0.16, 0.14],
  [-0.24, -0.04],
  [0.15, -0.15],
  [-0.14, -0.10],
]

const GENERATING_DIRS = [1, -1, 1, -1, 1, -1, 1, -1, 1] as const
const GENERATING_CYCLES = [1, 2, 1, 2, 1, 2, 1, 2, 1] as const

const LCD_PALETTE: readonly (readonly [number, number, number])[] = [
  [22, 32, 18],
  [60, 72, 50],
  [118, 128, 100],
  [158, 168, 135],
]

function resolveEraStyle(era: MatrixLoaderEra, dark: boolean, inkRgb: readonly [number, number, number]): EraStyle {
  switch (era) {
    case 'crt':
      return {
        substrateBg: '#040906',
        substrateBorder: 'rgba(130, 255, 175, 0.22)',
        rgb: [145, 255, 180],
        glow: 14,
        glowColor: 'rgba(70, 255, 140, 0.85)',
      }
    case 'vfd':
      return {
        substrateBg: '#040c0f',
        substrateBorder: 'rgba(98, 252, 240, 0.22)',
        rgb: [98, 252, 240],
        glow: 16,
        glowColor: 'rgba(40, 240, 230, 0.9)',
      }
    case 'dither':
      return {
        substrateBg: '#ffffff',
        substrateBorder: 'rgba(20, 20, 18, 0.16)',
        rgb: [0, 0, 0],
        glow: 0,
        glowColor: '#000000',
      }
    case 'lcd':
      return {
        substrateBg: '#9ea887',
        substrateBorder: 'rgba(24, 34, 20, 0.22)',
        rgb: [22, 32, 18],
        glow: 0,
        glowColor: '#000000',
      }
    default:
      return {
        substrateBg: null,
        substrateBorder: null,
        rgb: inkRgb,
        glow: 0,
        glowColor: dark ? '#ffffff' : '#111317',
      }
  }
}

interface StateField {
  bulge: number
  lensX: number
  lensY: number
  extraCols: number
  rowShifts: number[] | null
  globalShiftX: number
  accelVel: number
  extractInner: number
  extractOuter: number
  thinkPhase: number
  searchAngle: number
}

function evaluateStateField(
  state: MatrixLoaderState,
  t: number,
  N: number,
  step: number,
  baseBulge: number,
  amp: number,
): StateField {
  const field: StateField = {
    bulge: baseBulge,
    lensX: 0,
    lensY: 0,
    extraCols: 0,
    rowShifts: null,
    globalShiftX: 0,
    accelVel: 0,
    extractInner: 1,
    extractOuter: 1,
    thinkPhase: 0,
    searchAngle: 0,
  }

  switch (state) {
    case 'thinking':
      field.thinkPhase = ((t / MATRIX_LOADER_PERIODS.thinking) - 0.31) * Math.PI * 2
      break

    case 'searching':
      field.searchAngle = ((t / MATRIX_LOADER_PERIODS.searching) * Math.PI * 2) - 1.15
      break

    case 'exploring': {
      const angle = (t / MATRIX_LOADER_PERIODS.exploring) * Math.PI * 2 + 1.65
      const rad = 0.24 * amp
      field.lensX = -Math.cos(angle) * rad
      field.lensY = -Math.sin(angle) * rad
      break
    }

    case 'deciding': {
      const u = (((t / MATRIX_LOADER_PERIODS.deciding) - 0.08) % 1 + 1) % 1
      const seg = u * 4
      const k = Math.floor(seg) % 4
      const f = seg - Math.floor(seg)
      const m = f < 0.55 ? 0 : easeInOutQuart((f - 0.55) / 0.45)
      const s0 = DECIDING_STOPS[k]!
      const s1 = DECIDING_STOPS[(k + 1) % 4]!
      field.lensX = lerp(s0[0], s1[0], m) * amp
      field.lensY = lerp(s0[1], s1[1], m) * amp
      break
    }

    case 'generating': {
      const T = MATRIX_LOADER_PERIODS.generating
      const u = (((t + 0.02) / T) % 1 + 1) % 1
      const shifts: number[] = []
      // Staggered rows shear smoothly across the circular aperture and converge
      // back to exact checkerboard parity for a clean canonical hold in u >= 0.80.
      for (let r = 0; r < N; r++) {
        const lag = ((r * 2 + 1) % 5) * 0.022
        const activeSpan = 0.68
        const bu = u < 0.80 ? easeInOutCubic(clamp((u - lag) / activeSpan, 0, 1)) : 1.0
        const dir = GENERATING_DIRS[r % GENERATING_DIRS.length]!
        const cyc = GENERATING_CYCLES[r % GENERATING_CYCLES.length]!
        const rawCycles = cyc * amp
        const intCycles = Math.round(rawCycles)
        const fracCycles = rawCycles - intCycles
        shifts.push(dir * (intCycles * bu + fracCycles * Math.sin(bu * Math.PI)) * 2 * step)
      }
      field.rowShifts = shifts
      field.extraCols = 4
      break
    }

    case 'extracting': {
      const T = MATRIX_LOADER_PERIODS.extracting
      const u = (((t - 0.84) / T) % 1 + 1) % 1
      const evalRing = (uExp0: number, uExp1: number, uCon0: number, uCon1: number): number => {
        if (u < uExp0)
          return 0
        if (u < uExp1)
          return easeInOutCubic((u - uExp0) / (uExp1 - uExp0))
        if (u < uCon0)
          return 1
        if (u < uCon1)
          return 1 - easeInOutCubic((u - uCon0) / (uCon1 - uCon0))
        return 0
      }
      field.extractOuter = evalRing(0.05, 0.25, 0.68, 0.90)
      field.extractInner = evalRing(0.14, 0.36, 0.56, 0.78)
      break
    }

    case 'accelerating': {
      const T = MATRIX_LOADER_PERIODS.accelerating
      const u = (((t - 0.97) / T) % 1 + 1) % 1
      const prog = easeInOutQuint(u)
      field.accelVel = Math.sin(u * Math.PI) ** 2.0
      const intCycles = Math.round(amp)
      const fracCycles = amp - intCycles
      field.globalShiftX = (intCycles * prog + fracCycles * Math.sin(prog * Math.PI)) * 2 * step
      field.extraCols = 4
      break
    }

    case 'defining': {
      const T = MATRIX_LOADER_PERIODS.defining
      const u = (((t - 0.85) / T) % 1 + 1) % 1
      const m = holdMorph(u, 0.16, 0.24, 0.24, 0.22)
      field.bulge = lerp(0, baseBulge * amp, m)
      break
    }
  }

  return field
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rad, y)
  ctx.lineTo(x + w - rad, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad)
  ctx.lineTo(x + w, y + h - rad)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h)
  ctx.lineTo(x + rad, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad)
  ctx.lineTo(x, y + rad)
  ctx.quadraticCurveTo(x, y, x + rad, y)
  ctx.closePath()
}

function drawStateLayer(
  ctx: CanvasRenderingContext2D,
  state: MatrixLoaderState,
  t: number,
  size: number,
  R: number,
  opts: RenderOptions,
  eraStyle: EraStyle,
  layerAlpha: number,
): void {
  const N = normalizeGridSize(opts.gridSize)
  const halfN = (N - 1) / 2
  const step = 1.60 / (N - 1)
  const amp = clamp(opts.intensity, 0, 2)
  const oxShift = -0.028

  const field = evaluateStateField(state, t, N, step, opts.bulge, amp)
  const wrapCols = Math.ceil((N + 2) / 2) * 2
  const modSpan = wrapCols * step
  const isWrapped = field.extraCols > 0
  const noiseTime = amp > 0 ? t : 0
  const inkAlpha = opts.era === 'oled' ? clamp(opts.inkAlpha ?? 1, 0, 1) : 1

  ctx.save()
  ctx.translate(size / 2, size / 2)

  // Clip scrolling modes (Generating & Accelerating) cleanly to the sphere silhouette.
  if (isWrapped) {
    ctx.beginPath()
    ctx.arc(0, 0, R * 1.03, 0, Math.PI * 2)
    ctx.clip()
  }

  const [cr, cg, cb] = eraStyle.rgb
  const cMax = isWrapped ? wrapCols - 1 : N - 1
  const segs = size >= 48 ? 6 : 4

  for (let r = 0; r < N; r++) {
    for (let c = 0; c <= cMax; c++) {
      if ((((r + c) % 2) + 2) % 2 === 0)
        continue

      let u = (c - halfN) * step
      let v = (r - halfN) * step

      if (isWrapped) {
        if (field.rowShifts)
          u += field.rowShifts[r]!
        else if (field.globalShiftX)
          u += field.globalShiftX
        u = ((((u + modSpan / 2) % modSpan) + modSpan) % modSpan) - modSpan / 2
      }

      let sizeMul = 1.0
      let localBulge = field.bulge
      let xStretch = 1.0

      if (state === 'extracting') {
        const dist = Math.hypot(c - halfN, r - halfN)
        const isInner = dist <= 1.25
        const open = isInner ? field.extractInner : field.extractOuter
        const scalePos = lerp(1 - 0.42 * amp, 1.0, open)
        u *= scalePos
        v *= scalePos
        sizeMul = lerp(1 - 0.34 * amp, 1.0, open)
        localBulge = field.bulge * lerp(1 - 0.75 * Math.min(1, amp), 1.0, open)
      }
      else if (state === 'accelerating') {
        // Subtle kinetic elongation at peak surge velocity.
        xStretch = 1 + 0.14 * field.accelVel * amp
      }

      if (opts.noise > 0.001) {
        const nf = opts.noiseFrequency
        const nt = noiseTime * 0.9
        u += noise2(u * nf + nt, v * nf + 3.17) * 0.14 * opts.noise
        v += noise2(u * nf + 11.4, v * nf + nt) * 0.14 * opts.noise
        sizeMul *= 1 + noise2(u * nf - nt, v * nf + nt) * 0.22 * opts.noise
      }

      const radial = Math.hypot(u, v)
      if (isWrapped && radial > 1.28)
        continue

      const ratio = halftoneRatio(u, opts.taper) * opts.fill * sizeMul
      const hs = clamp(ratio, 0.08, 1.15) * step * 0.5
      const hsX = hs * xStretch
      const hsY = hs / Math.sqrt(xStretch)

      let lum = 1.0
      if (state === 'thinking') {
        const wave = 0.5 + 0.5 * Math.cos(field.thinkPhase - u * 2.45)
        lum = clamp(0.18 + 1.24 * wave, 0.18, 1.0)
        lum = lerp(1.0, lum, amp)
      }
      else if (state === 'searching') {
        const bx = Math.cos(field.searchAngle) * 0.72
        const by = Math.sin(field.searchAngle) * 0.72
        const d2 = (u - bx) * (u - bx) + (v - by) * (v - by)
        const spot = clamp(Math.exp(-d2 / 0.14) * 1.28, 0, 1)
        lum = 0.27 + 0.73 * spot
        lum = lerp(1.0, lum, amp)
      }
      else if (state === 'accelerating') {
        // Peak surge shifts spotlight slightly left as rightmost column slips past the limb.
        const focusCenter = lerp(0.12, -0.18, field.accelVel)
        const focus = Math.exp(-(((u - focusCenter) / 0.46) ** 2))
        const limb = clamp(1 - 0.86 * (Math.abs(u) / 0.98) ** 1.7, 0.08, 1)
        const core = clamp(0.12 + 1.28 * focus * limb, 0.12, 1.0)
        lum = clamp(lerp(core, core * 0.74, field.accelVel * 0.72), 0.10, 1.0)
        lum = lerp(1.0, lum, amp)
      }

      if (isWrapped) {
        // Soften aperture edge clipping so scrolling rows glide cleanly around the limb.
        lum *= 1 - smoothstep(0.98, 1.18, radial)
      }

      if (opts.noise > 0.001) {
        const nl = 0.5 + 0.5 * noise2(u * opts.noiseFrequency * 1.5 + noiseTime * 1.4, v * opts.noiseFrequency * 1.5 - noiseTime * 0.8)
        lum *= lerp(1, 0.35 + 0.65 * nl, opts.noise * 0.7)
      }

      const baseAlpha = opts.era === 'lcd'
        ? clamp(0.14 + 0.84 * clamp(lum, 0, 1), 0, 1)
        : clamp(lum, 0, 1) * inkAlpha
      const finalAlpha = clamp(baseAlpha * layerAlpha, 0, 1)
      if (finalAlpha <= 0.004)
        continue

      ctx.beginPath()
      if (opts.shape === 'quad') {
        let first = true
        const emit = (px: number, py: number): void => {
          const [wx, wy] = sphericalWarp(px, py, localBulge, field.lensX, field.lensY, oxShift)
          if (first) {
            ctx.moveTo(wx * R, wy * R)
            first = false
          }
          else {
            ctx.lineTo(wx * R, wy * R)
          }
        }
        for (let i = 0; i < segs; i++) emit(u - hsX + (2 * hsX * i) / segs, v - hsY)
        for (let i = 0; i < segs; i++) emit(u + hsX, v - hsY + (2 * hsY * i) / segs)
        for (let i = 0; i < segs; i++) emit(u + hsX - (2 * hsX * i) / segs, v + hsY)
        for (let i = 0; i < segs; i++) emit(u - hsX, v + hsY - (2 * hsY * i) / segs)
        ctx.closePath()
      }
      else if (opts.shape === 'circle') {
        const steps = size >= 48 ? 16 : 12
        for (let i = 0; i <= steps; i++) {
          const a = (i / steps) * Math.PI * 2
          const [wx, wy] = sphericalWarp(
            u + Math.cos(a) * hsX * 1.06,
            v + Math.sin(a) * hsY * 1.06,
            localBulge,
            field.lensX,
            field.lensY,
            oxShift,
          )
          if (i === 0)
            ctx.moveTo(wx * R, wy * R)
          else ctx.lineTo(wx * R, wy * R)
        }
        ctx.closePath()
      }
      else {
        const pts: readonly [number, number][] = [
          [u, v - hsY * 1.25],
          [u + hsX * 1.25, v],
          [u, v + hsY * 1.25],
          [u - hsX * 1.25, v],
        ]
        pts.forEach(([px, py], i) => {
          const [wx, wy] = sphericalWarp(px, py, localBulge, field.lensX, field.lensY, oxShift)
          if (i === 0)
            ctx.moveTo(wx * R, wy * R)
          else ctx.lineTo(wx * R, wy * R)
        })
        ctx.closePath()
      }

      ctx.fillStyle = `rgba(${cr},${cg},${cb},${finalAlpha.toFixed(4)})`
      if (eraStyle.glow > 0 && finalAlpha > 0.22) {
        ctx.shadowColor = eraStyle.glowColor
        ctx.shadowBlur = eraStyle.glow * opts.fxStrength * (size / 64) * finalAlpha
      }
      else {
        ctx.shadowBlur = 0
      }
      ctx.fill()
    }
  }

  ctx.restore()
}

function applyEraPostProcess(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  offscreen: HTMLCanvasElement | null,
  era: MatrixLoaderEra,
  fx: number,
  dpr: number,
): void {
  if (era === 'oled' || fx <= 0.01)
    return

  const W = canvas.width
  const H = canvas.height
  const pad = Math.round(W * 0.02)
  const rad = Math.round(W * 0.22)

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  drawRoundedRectPath(ctx, pad, pad, W - pad * 2, H - pad * 2, rad)
  ctx.clip()

  if (era === 'crt') {
    ctx.fillStyle = `rgba(0,0,0,${(0.32 * fx).toFixed(3)})`
    const pitch = Math.max(2, Math.round(2.5 * dpr))
    for (let y = 0; y < H; y += pitch)
      ctx.fillRect(0, y, W, Math.max(1, Math.floor(pitch / 2)))
  }
  else if (era === 'vfd') {
    ctx.fillStyle = `rgba(0,12,16,${(0.36 * fx).toFixed(3)})`
    const pitch = Math.max(2, Math.round(3 * dpr))
    for (let y = 0; y < H; y += pitch) ctx.fillRect(0, y, W, 1)
    for (let x = 0; x < W; x += pitch) ctx.fillRect(x, 0, 1, H)
  }
  else if ((era === 'dither' || era === 'lcd') && offscreen) {
    const octx = offscreen.getContext('2d', { willReadFrequently: true })
    if (octx) {
      const pix = Math.max(2, Math.round((era === 'lcd' ? 2.4 : 2.0) * dpr * (0.65 + 0.7 * fx)))
      const sw = Math.max(4, Math.floor(W / pix))
      const sh = Math.max(4, Math.floor(H / pix))
      if (offscreen.width !== sw || offscreen.height !== sh) {
        offscreen.width = sw
        offscreen.height = sh
      }
      octx.clearRect(0, 0, sw, sh)
      octx.drawImage(canvas, 0, 0, sw, sh)
      const img = octx.getImageData(0, 0, sw, sh)
      const data = img.data

      if (era === 'dither') {
        for (let y = 0; y < sh; y++) {
          for (let x = 0; x < sw; x++) {
            const idx = (y * sw + x) * 4
            const lum = (data[idx]! * 0.299 + data[idx + 1]! * 0.587 + data[idx + 2]! * 0.114) / 255
            const thr = BAYER_4X4[((y & 3) << 2) | (x & 3)]!
            const on = lum > thr
            data[idx] = on ? 236 : 18
            data[idx + 1] = on ? 231 : 18
            data[idx + 2] = on ? 220 : 16
            data[idx + 3] = 255
          }
        }
      }
      else {
        for (let y = 0; y < sh; y++) {
          for (let x = 0; x < sw; x++) {
            const idx = (y * sw + x) * 4
            const lum = (data[idx]! * 0.299 + data[idx + 1]! * 0.587 + data[idx + 2]! * 0.114) / 255
            const lvl = clamp(Math.floor(lum * 4), 0, 3)
            const rgb = LCD_PALETTE[lvl]!
            data[idx] = rgb[0]
            data[idx + 1] = rgb[1]
            data[idx + 2] = rgb[2]
            data[idx + 3] = 255
          }
        }
      }

      octx.putImageData(img, 0, 0)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(offscreen, 0, 0, W, H)

      if (era === 'lcd') {
        ctx.fillStyle = `rgba(158,168,135,${(0.32 * fx).toFixed(3)})`
        for (let y = 0; y < H; y += pix) ctx.fillRect(0, y, W, 1)
        for (let x = 0; x < W; x += pix) ctx.fillRect(x, 0, 1, H)
      }
    }
  }

  ctx.restore()
}

/**
 * Paint one deterministic frame of `TxMatrixLoader` onto a 2D canvas context.
 */
export function renderMatrixLoaderFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  size: number,
  dpr: number,
  tSec: number,
  opts: RenderOptions,
  offscreen: HTMLCanvasElement | null = null,
): void {
  const eraStyle = resolveEraStyle(opts.era, opts.dark, opts.inkRgb)

  ctx.save()
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, size, size)

  const hasSubstrate = eraStyle.substrateBg !== null
  if (hasSubstrate) {
    const pad = size * 0.02
    drawRoundedRectPath(ctx, pad, pad, size - pad * 2, size - pad * 2, size * 0.22)
    ctx.fillStyle = eraStyle.substrateBg!
    ctx.fill()
  }

  // Slightly inset radius when framed inside a hardware micro-display substrate.
  const R = size * (hasSubstrate ? 0.37 : 0.44)

  const hasBlend = (opts.prevLayers && opts.prevLayers.length > 0) || (opts.prevState && opts.prevState !== opts.state)
  const mix = hasBlend && opts.morphMix !== undefined && opts.morphMix < 1
    ? easeInOutCubic(clamp(opts.morphMix, 0, 1))
    : 1

  if (mix < 1 && opts.prevLayers && opts.prevLayers.length > 0) {
    const merged = new Map<MatrixLoaderState, number>()
    for (const layer of opts.prevLayers) {
      const w = layer.weight * (1 - mix)
      if (w > 0.004)
        merged.set(layer.state, (merged.get(layer.state) ?? 0) + w)
    }
    if (mix > 0.004)
      merged.set(opts.state, (merged.get(opts.state) ?? 0) + mix)
    for (const [layerState, weight] of merged)
      drawStateLayer(ctx, layerState, tSec, size, R, opts, eraStyle, clamp(weight, 0, 1))
  }
  else if (mix < 1 && opts.prevState) {
    drawStateLayer(ctx, opts.prevState, tSec, size, R, opts, eraStyle, 1 - mix)
    drawStateLayer(ctx, opts.state, tSec, size, R, opts, eraStyle, mix)
  }
  else {
    drawStateLayer(ctx, opts.state, tSec, size, R, opts, eraStyle, 1)
  }

  ctx.restore()

  applyEraPostProcess(ctx, canvas, offscreen, opts.era, opts.fxStrength, dpr)

  // Subtle hardware rim painted after post-process so it stays sharp.
  if (hasSubstrate && eraStyle.substrateBorder) {
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const pad = size * 0.02 + 0.5
    drawRoundedRectPath(ctx, pad, pad, size - pad * 2, size - pad * 2, size * 0.22)
    ctx.strokeStyle = eraStyle.substrateBorder
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
  }
}

let colorProbe: CanvasRenderingContext2D | null = null

/** Resolve a CSS color literal to an sRGB + alpha tuple `[r, g, b, a]` where `a ∈ [0, 1]`. */
export function resolveInkRgba(cssColor: string | undefined, dark: boolean): readonly [number, number, number, number] {
  const fallback: readonly [number, number, number, number] = dark ? [255, 255, 255, 1] : [17, 19, 23, 1]
  if (!cssColor || !hasDocument())
    return fallback
  try {
    if (!colorProbe) {
      const el = document.createElement('canvas')
      el.width = 1
      el.height = 1
      colorProbe = el.getContext('2d', { willReadFrequently: true })
    }
    if (!colorProbe)
      return fallback
    const ctx = colorProbe
    ctx.fillStyle = '#000'
    ctx.fillStyle = cssColor
    const first = ctx.fillStyle
    ctx.fillStyle = '#fff'
    ctx.fillStyle = cssColor
    if (ctx.fillStyle !== first)
      return fallback
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return [r ?? fallback[0], g ?? fallback[1], b ?? fallback[2], a !== undefined ? a / 255 : 1]
  }
  catch {
    return fallback
  }
}

/** Resolve a CSS color literal to an sRGB triplet; falls back cleanly on invalid colors or canvas-less hosts. */
export function resolveInkRgb(cssColor: string | undefined, dark: boolean): readonly [number, number, number] {
  const [r, g, b] = resolveInkRgba(cssColor, dark)
  return [r, g, b]
}
