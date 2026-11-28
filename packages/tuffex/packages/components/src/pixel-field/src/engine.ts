import type { PixelFieldInteraction, PixelFieldParticle } from './types'

export interface PixelFieldPointerState {
  /** Pointer X in CSS pixels relative to canvas left. */
  x: number
  /** Pointer Y in CSS pixels relative to canvas top. */
  y: number
  /** Normalized X in [-1, 1] from canvas center. */
  nx: number
  /** Normalized Y in [-1, 1] from canvas center. */
  ny: number
  /** Pointer velocity X (px/s) for directional wake. */
  vx: number
  /** Pointer velocity Y (px/s) for directional wake. */
  vy: number
  /** True while pointer is inside the field. */
  inside: boolean
}

export interface PixelFieldPulse {
  x: number
  y: number
  age: number
  maxAge: number
  maxRadius: number
}

export interface PixelFieldStepConfig {
  width: number
  height: number
  dpr: number
  pixelSize: number
  speed: number
  interactive: boolean
  interaction: PixelFieldInteraction
  pointerRadius: number
  pointerStrength: number
  parallax: number
  dark: boolean
  reduced: boolean
}

export interface PixelFieldRuntimeState {
  time: number
  hoverMix: number
  parallaxX: number
  parallaxY: number
  pulses: PixelFieldPulse[]
}

export function createPixelFieldRuntime(): PixelFieldRuntimeState {
  return {
    time: 0,
    hoverMix: 0,
    parallaxX: 0,
    parallaxY: 0,
    pulses: [],
  }
}

/**
 * Advances particle physics & renders one crisp frame of the pixel lattice.
 * Performs zero per-particle heap allocations for steady 60fps across multi-card grids.
 */
export function renderPixelFieldFrame(
  ctx: CanvasRenderingContext2D,
  particles: readonly PixelFieldParticle[],
  lut: readonly string[],
  runtime: PixelFieldRuntimeState,
  pointer: PixelFieldPointerState,
  config: PixelFieldStepConfig,
  dt: number,
): void {
  const { width, height, dpr, pixelSize, speed, interactive, interaction, pointerRadius, pointerStrength, parallax, dark, reduced } = config
  const clampedDt = reduced ? 0 : Math.min(0.05, Math.max(0, dt))
  runtime.time += clampedDt * speed

  // Smoothly spring hover presence (coalesces halo particles + lifts luminance on hover).
  const targetHover = interactive && pointer.inside && !reduced ? 1 : 0
  const hoverRate = targetHover > runtime.hoverMix ? 8.5 : 4.2
  runtime.hoverMix += (targetHover - runtime.hoverMix) * (1 - Math.exp(-clampedDt * hoverRate))
  if (Math.abs(runtime.hoverMix - targetHover) < 0.001) runtime.hoverMix = targetHover

  // Smooth parallax drift toward pointer offset.
  const targetPx = interactive && pointer.inside && !reduced ? pointer.nx * 9 * parallax : 0
  const targetPy = interactive && pointer.inside && !reduced ? pointer.ny * 9 * parallax : 0
  const pLerp = 1 - Math.exp(-clampedDt * 6.5)
  runtime.parallaxX += (targetPx - runtime.parallaxX) * pLerp
  runtime.parallaxY += (targetPy - runtime.parallaxY) * pLerp

  // Advance click shockwave pulses.
  for (let i = runtime.pulses.length - 1; i >= 0; i--) {
    const pulse = runtime.pulses[i]!
    pulse.age += clampedDt
    if (pulse.age >= pulse.maxAge) runtime.pulses.splice(i, 1)
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const t = runtime.time
  const hover = runtime.hoverMix
  const scaleBoost = 1 + hover * 0.042
  const cx = width * 0.5
  const cy = height * 0.5
  const radiusSq = pointerRadius * pointerRadius
  const stiffness = 28
  const damping = 7.4
  const lutMax = lut.length - 1
  const pulseCount = runtime.pulses.length

  // Batching fillStyle transitions minimizes Canvas2D state switches.
  let lastFill = ''

  for (let i = 0; i < particles.length; i++) {
    const p = particles[i]!

    // 1. Base botanical home coordinate with gentle hover scale lift and 3D depth parallax.
    const baseX = cx + (p.hx * width - cx) * scaleBoost + runtime.parallaxX * (0.45 + p.depth * 0.65)
    const baseY = cy + (p.hy * height - cy) * scaleBoost + runtime.parallaxY * (0.45 + p.depth * 0.65)

    // 2. Ambient wind sway & rest halo dispersion (halo tightens crisply on hover!).
    const windX = reduced ? 0 : Math.sin(t * 1.15 + p.hy * 3.8 + p.phase * 0.35) * (1.8 + 3.2 * p.flex)
    const windY = reduced ? 0 : Math.cos(t * 0.92 + p.hx * 3.2 + p.phase * 0.4) * (1.2 + 2.1 * p.flex)

    // In `coalesce` mode (Violet signature), hovering snaps dissolved halo particles back onto the leaf edge.
    const restTighten = interaction === 'coalesce' ? 1 - hover * 0.86 : 1 - hover * 0.3
    let targetOx = p.restDx * restTighten + windX
    const targetOy = p.restDy * restTighten + windY

    // Subtle horizontal wind-shear streak at bright leaf tips.
    let extraWidth = 0
    if (!reduced && p.streak > 0.15) {
      const gust = Math.sin(t * 2.4 + p.hy * 12 + p.phase)
      if (gust > 0.55) {
        const shear = (gust - 0.55) * 2.2 * p.streak
        targetOx += shear * 4.5
        extraWidth = shear * pixelSize * 1.35
      }
    }

    // 3. Localized pointer field interaction.
    let localFlare = 0
    if (interactive && pointer.inside && !reduced && pointerStrength > 0) {
      const curX = baseX + p.ox
      const curY = baseY + p.oy
      const dx = curX - pointer.x
      const dy = curY - pointer.y
      const distSq = dx * dx + dy * dy
      if (distSq < radiusSq && distSq > 0.0001) {
        const dist = Math.sqrt(distSq)
        const falloff = 1 - dist / pointerRadius
        const falloff2 = falloff * falloff
        const ux = dx / dist
        const uy = dy / dist
        localFlare = falloff2 * 0.42 * pointerStrength

        if (interaction === 'repel') {
          const push = falloff2 * 28 * pointerStrength
          p.vx += ux * push * 14 * clampedDt
          p.vy += uy * push * 14 * clampedDt
        }
        else if (interaction === 'attract') {
          const pull = falloff2 * 22 * pointerStrength
          p.vx -= (ux * pull - uy * pull * 0.32) * 12 * clampedDt
          p.vy -= (uy * pull + ux * pull * 0.32) * 12 * clampedDt
        }
        else if (interaction === 'ripple') {
          const wave = Math.sin(dist * 0.16 - t * 9.5) * falloff * 14 * pointerStrength
          p.vx += ux * wave * 15 * clampedDt
          p.vy += uy * wave * 15 * clampedDt
          localFlare = Math.max(localFlare, Math.abs(wave) * 0.04)
        }
        else {
          // `coalesce` (Violet signature): subtle botanical brush swirl + wake along pointer travel.
          const brush = falloff2 * 13 * pointerStrength
          const swirlX = -uy * 0.45 + ux * 0.72
          const swirlY = ux * 0.45 + uy * 0.72
          p.vx += (swirlX * brush * 12 + pointer.vx * falloff2 * 0.025) * clampedDt
          p.vy += (swirlY * brush * 12 + pointer.vy * falloff2 * 0.025) * clampedDt
        }
      }
    }

    // 4. Expanding click shockwave ripples.
    for (let k = 0; k < pulseCount; k++) {
      const pulse = runtime.pulses[k]!
      const prog = pulse.age / pulse.maxAge
      const ringR = prog * pulse.maxRadius
      const px = baseX + p.ox - pulse.x
      const py = baseY + p.oy - pulse.y
      const dist = Math.hypot(px, py)
      const band = 1 - Math.abs(dist - ringR) / 42
      if (band > 0) {
        const fade = 1 - prog
        const power = band * band * fade
        localFlare = Math.max(localFlare, power * 0.55)
        if (dist > 0.01 && !reduced) {
          p.vx += (px / dist) * power * 180 * clampedDt
          p.vy += (py / dist) * power * 180 * clampedDt
        }
      }
    }

    // 5. Damped spring back to target offset.
    if (reduced) {
      p.ox = targetOx
      p.oy = targetOy
      p.vx = 0
      p.vy = 0
    }
    else {
      const ax = (targetOx - p.ox) * stiffness - p.vx * damping
      const ay = (targetOy - p.oy) * stiffness - p.vy * damping
      p.vx += ax * clampedDt
      p.vy += ay * clampedDt
      p.ox += p.vx * clampedDt
      p.oy += p.vy * clampedDt
    }

    const drawX = Math.round((baseX + p.ox) * dpr) / dpr
    const drawY = Math.round((baseY + p.oy) * dpr) / dpr
    if (drawX < -pixelSize * 3 || drawX > width + pixelSize * 3 || drawY < -pixelSize * 3 || drawY > height + pixelSize * 3) {
      continue
    }

    // 6. Bioluminescent twinkle + vein hover bloom.
    const shimmer = reduced ? 0 : Math.sin(t * (1.8 + p.freq) + p.phase) * 0.14
    const waveSweep = reduced ? 0 : Math.sin(t * 1.4 - p.hx * 4.5 + p.hy * 3.2) * 0.08
    const hoverBoost = hover * (0.14 + p.vein * 0.24)
    const energy = Math.max(0.02, Math.min(1, p.lum + shimmer + waveSweep + hoverBoost + localFlare))

    const haloAlpha = p.scatter > 0.45
      ? (0.28 + 0.52 * (0.5 + 0.5 * Math.sin(t * (1.6 + p.freq) + p.phase))) * (0.65 + hover * 0.35)
      : 0.36 + energy * 0.64

    const alpha = dark ? Math.min(1, haloAlpha) : Math.min(0.95, haloAlpha * 0.92)
    if (alpha < 0.05) continue

    const colorIdx = Math.min(lutMax, Math.max(0, Math.round(energy * lutMax)))
    const fill = lut[colorIdx]!
    if (fill !== lastFill) {
      ctx.fillStyle = fill
      lastFill = fill
    }
    ctx.globalAlpha = alpha

    // Slightly smaller dots for halo dust, crisp squares for core & bright veins.
    const dotSize = p.scatter > 0.55
      ? Math.max(1.5, pixelSize * (0.58 + hover * 0.22))
      : pixelSize * (0.82 + energy * 0.26)
    ctx.fillRect(drawX - dotSize * 0.5, drawY - dotSize * 0.5, dotSize + extraWidth, dotSize)
  }

  ctx.globalAlpha = 1
}
