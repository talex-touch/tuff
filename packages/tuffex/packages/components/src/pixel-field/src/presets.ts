import type { PixelFieldParticle, PixelFieldPreset } from './types'

interface FieldSample {
  /** Silhouette occupancy in [0, 1] (0 = outside, 1 = solid interior). */
  alpha: number
  /** Brightness / shading intensity in [0, 1]. */
  lum: number
  /** Structural vein / ridge weight in [0, 1]. */
  vein: number
  /** Pseudo-3D depth in [-1, 1] for pointer parallax. */
  depth: number
  /** Distance outside the main silhouette for floating halo dust [0, 1]. */
  halo: number
  /** Structural tip flexibility for gentle wind bend [0, 1]. */
  flex: number
  /** Tip streak weight for subtle horizontal sheen on bright leaf rims [0, 1]. */
  streak: number
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function smoothstep(a: number, b: number, x: number): number {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

function hash2(x: number, y: number, seed: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453123
  return s - Math.floor(s)
}

/** Value noise in [0, 1] for subtle botanical mottling and organic stipple variation. */
function noise2(x: number, y: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const ux = fx * fx * (3 - 2 * fx)
  const uy = fy * fy * (3 - 2 * fy)
  const a = hash2(ix, iy, seed)
  const b = hash2(ix + 1, iy, seed)
  const c = hash2(ix, iy + 1, seed)
  const d = hash2(ix + 1, iy + 1, seed)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}

function emptySample(): FieldSample {
  return { alpha: 0, lum: 0, vein: 0, depth: 0, halo: 0, flex: 0, streak: 0 }
}

function mergeSample(base: FieldSample, add: FieldSample): FieldSample {
  if (add.alpha <= 0 && add.halo <= 0) return base
  const alpha = Math.max(base.alpha, add.alpha)
  const useAdd = add.alpha >= base.alpha * 0.85
  return {
    alpha,
    lum: Math.max(base.lum, add.lum),
    vein: Math.max(base.vein, add.vein),
    depth: useAdd ? add.depth : base.depth,
    halo: Math.max(base.halo, add.halo),
    flex: Math.max(base.flex, add.flex),
    streak: Math.max(base.streak, add.streak),
  }
}

/**
 * Evaluates a botanical elliptical-lanceolate leaf with curved midrib,
 * feathered pinnate lateral veins, directional rim lighting, and soft spore halo.
 */
function sampleBotanicalLeaf(
  x: number,
  y: number,
  cx: number,
  cy: number,
  angle: number,
  halfLen: number,
  halfWidth: number,
  options: {
    arch?: number
    veinFreq?: number
    lightBias?: number
    foldShadow?: number
    tipBrightness?: number
    streakEdge?: number
  } = {},
): FieldSample {
  const cos = Math.cos(-angle)
  const sin = Math.sin(-angle)
  const dx = x - cx
  const dy = y - cy
  // Local leaf coordinates: u along length [-1, 1], v across width [-1, 1]
  const lu = (dx * cos - dy * sin) / halfLen
  const rawV = (dx * sin + dy * cos) / halfWidth
  const arch = options.arch ?? 0.14
  const bend = arch * (lu * lu - 0.35)
  const lv = rawV - bend

  if (lu < -1.28 || lu > 1.32 || Math.abs(lv) > 1.7) return emptySample()

  // Tapered botanical profile: fuller base-middle, graceful pointed apex.
  const u01 = clamp((lu + 1) * 0.5, 0, 1)
  const widthProfile = Math.pow(Math.sin(Math.PI * Math.pow(u01, 0.88)), 0.82) * (1 - 0.14 * u01)
  const edgeNoise = (noise2(lu * 5.2, lv * 5.2, 13) - 0.5) * 0.08
  const radial = Math.abs(lv) / Math.max(0.025, widthProfile + edgeNoise)

  const insideMask = 1 - smoothstep(0.84, 1.04, radial)
  const tipMask = 1 - smoothstep(0.95, 1.06, Math.abs(lu))
  const alpha = insideMask * tipMask

  // Soft floating dust / spore halo outside the silhouette (especially upper edge)
  const distOutside = Math.max(0, radial - 0.92) + Math.max(0, Math.abs(lu) - 0.96) * 1.4
  const halo = distOutside > 0 && distOutside < 0.72
    ? (1 - distOutside / 0.72) * (0.45 + 0.55 * smoothstep(-0.2, 0.9, u01))
    : 0

  if (alpha <= 0.01 && halo <= 0.02) return emptySample()

  // Central midrib + arched pinnate secondary veins
  const midrib = Math.exp(-Math.pow(lv / 0.075, 2)) * (1 - 0.32 * u01)
  const veinFreq = options.veinFreq ?? 8.5
  const lateralPhase = (u01 * veinFreq - Math.pow(Math.abs(lv), 0.92) * 2.45) * Math.PI * 2
  const lateralWave = Math.pow(0.5 + 0.5 * Math.cos(lateralPhase), 4.2)
  const lateralMask = smoothstep(0.06, 0.25, Math.abs(lv)) * (1 - smoothstep(0.75, 1.0, radial))
  const fineVeins = lateralWave * lateralMask * 0.72
  const rimHighlight = smoothstep(0.58, 0.96, radial) * smoothstep(0.1, 0.9, u01)
  const vein = clamp(midrib * 0.95 + fineVeins + rimHighlight * 0.42, 0, 1)

  // Directional botanical lighting: brighter on upper-right rim & veins, velvety dark valleys
  const mottle = noise2(lu * 7.5 + 3.1, lv * 7.5 + 1.9, 29)
  const lightBias = options.lightBias ?? 0.55
  const directional = clamp(0.32 + u01 * (options.tipBrightness ?? 0.45) + (lv * 0.32 + 0.2) * lightBias, 0.1, 1)
  const foldShadow = options.foldShadow ?? 0.22
  const fold = 1 - foldShadow * Math.exp(-Math.pow((lv + 0.18) / 0.28, 2))
  const rimBurst = smoothstep(0.65, 0.98, radial) * smoothstep(0.38, 1.0, u01) * 0.45
  const lum = clamp(
    (0.18 + directional * 0.52 + vein * 0.34 + rimBurst + (mottle - 0.5) * 0.22) * fold,
    0.05,
    1,
  )

  const depth = clamp((0.5 - radial * 0.45) + (u01 - 0.5) * 0.65 + midrib * 0.25, -1, 1)
  const flex = clamp(0.25 + u01 * 0.75, 0, 1)
  const streak = (options.streakEdge ?? 0.65)
    * smoothstep(0.62, 1.0, u01)
    * smoothstep(0.45, 1.0, radial)
    * (lv > -0.15 ? 1 : 0.35)

  return { alpha, lum, vein, depth, halo, flex, streak }
}

/** Evaluates a smooth quadratic Bezier stem curve with tapering thickness. */
function sampleStem(
  x: number,
  y: number,
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  thickness: number,
  tipGlow = 0.7,
): FieldSample {
  let minD = Infinity
  let bestT = 0
  const steps = 22
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const inv = 1 - t
    const bx = inv * inv * p0[0] + 2 * inv * t * p1[0] + t * t * p2[0]
    const by = inv * inv * p0[1] + 2 * inv * t * p1[1] + t * t * p2[1]
    const d = Math.hypot(x - bx, y - by)
    if (d < minD) {
      minD = d
      bestT = t
    }
  }
  const w = thickness * (1.2 - 0.55 * bestT)
  const alpha = 1 - smoothstep(w * 0.55, w * 1.45, minD)
  const halo = minD > w && minD < w * 4.5 ? (1 - (minD - w) / (w * 3.5)) * 0.35 : 0
  if (alpha <= 0.01 && halo <= 0.02) return emptySample()

  const lum = clamp(0.38 + tipGlow * bestT * 0.52 + (1 - minD / Math.max(0.004, w * 1.4)) * 0.24, 0.12, 1)
  return {
    alpha,
    lum,
    vein: clamp(alpha * 0.88, 0, 1),
    depth: clamp(0.2 + bestT * 0.45, -1, 1),
    halo,
    flex: clamp(0.15 + bestT * 0.75, 0, 1),
    streak: 0,
  }
}

/** Card 001 — "Shared Components": diagonal botanical branch with three alternating leaves. */
function sampleBranch(x: number, y: number): FieldSample {
  let s = sampleStem(x, y, [0.34, 0.88], [0.49, 0.54], [0.76, 0.14], 0.013, 0.72)
  // Subtle lower-left shadow leaf
  const lower = sampleBotanicalLeaf(x, y, 0.32, 0.72, -2.55, 0.16, 0.072, {
    arch: -0.15,
    veinFreq: 6,
    lightBias: 0.25,
    tipBrightness: 0.22,
    streakEdge: 0.2,
  })
  lower.lum *= 0.62
  s = mergeSample(s, lower)

  // Mid-right poised leaf
  const mid = sampleBotanicalLeaf(x, y, 0.65, 0.52, -0.05, 0.20, 0.095, {
    arch: 0.22,
    veinFreq: 7.5,
    lightBias: 0.65,
    tipBrightness: 0.5,
    streakEdge: 0.6,
  })
  s = mergeSample(s, mid)

  // Upper-right crowning leaf catching bright specular light
  const top = sampleBotanicalLeaf(x, y, 0.72, 0.23, -0.78, 0.21, 0.102, {
    arch: -0.18,
    veinFreq: 7,
    lightBias: 0.8,
    tipBrightness: 0.62,
    streakEdge: 0.9,
  })
  s = mergeSample(s, top)
  return s
}

/** Card 002 — "Visual Continuity": bold macro diagonal leaf with luminous veins and rim. */
function sampleLeaf(x: number, y: number): FieldSample {
  let s = sampleBotanicalLeaf(x, y, 0.50, 0.56, -0.62, 0.47, 0.255, {
    arch: -0.11,
    veinFreq: 8.8,
    lightBias: 0.78,
    foldShadow: 0.26,
    tipBrightness: 0.58,
    streakEdge: 0.95,
  })
  const petiole = sampleStem(x, y, [0.10, 0.84], [0.16, 0.79], [0.23, 0.73], 0.014, 0.35)
  s = mergeSample(s, petiole)
  return s
}

/** Card 003 — "Live Signals": sweeping curved branch from top-left to bottom-right with twin sprouts. */
function sampleSprout(x: number, y: number): FieldSample {
  let s = sampleStem(x, y, [0.16, 0.28], [0.46, 0.64], [0.90, 0.94], 0.014, 0.8)
  // Luminous upper-right primary leaf
  const rightLeaf = sampleBotanicalLeaf(x, y, 0.70, 0.46, -0.58, 0.20, 0.092, {
    arch: 0.18,
    veinFreq: 6.5,
    lightBias: 0.85,
    tipBrightness: 0.68,
    streakEdge: 0.85,
  })
  s = mergeSample(s, rightLeaf)

  // Delicate secondary shoot mid-upper-left
  const leftShoot = sampleBotanicalLeaf(x, y, 0.39, 0.37, -1.35, 0.13, 0.056, {
    arch: -0.2,
    veinFreq: 5.5,
    lightBias: 0.55,
    tipBrightness: 0.42,
    streakEdge: 0.4,
  })
  leftShoot.lum *= 0.82
  s = mergeSample(s, leftShoot)

  // Small lower-left accent sprout
  const lowerBud = sampleBotanicalLeaf(x, y, 0.22, 0.36, 2.75, 0.11, 0.044, {
    arch: 0.12,
    veinFreq: 5,
    lightBias: 0.35,
    tipBrightness: 0.3,
    streakEdge: 0.2,
  })
  lowerBud.lum *= 0.68
  s = mergeSample(s, lowerBud)
  return s
}

/** Card 004 — "Code Handoff": tall slender arching blade leaf with deep inner fold and luminous spine. */
function sampleBlade(x: number, y: number): FieldSample {
  let s = sampleBotanicalLeaf(x, y, 0.56, 0.56, -0.92, 0.47, 0.188, {
    arch: 0.22,
    veinFreq: 9.2,
    lightBias: 0.82,
    foldShadow: 0.38,
    tipBrightness: 0.64,
    streakEdge: 0.88,
  })
  const petiole = sampleStem(x, y, [0.27, 0.92], [0.32, 0.84], [0.39, 0.75], 0.012, 0.42)
  s = mergeSample(s, petiole)
  return s
}

/** Bonus preset — "orb": 3D Fresnel stippled sphere with latitude bands and orbiting dust. */
function sampleOrb(x: number, y: number): FieldSample {
  const dx = (x - 0.5) / 0.34
  const dy = (y - 0.52) / 0.34
  const r2 = dx * dx + dy * dy
  const r = Math.sqrt(r2)
  if (r > 1.38) return emptySample()

  const alpha = 1 - smoothstep(0.92, 1.03, r)
  const halo = r > 0.94 ? clamp(1 - (r - 0.94) / 0.44, 0, 1) * 0.65 : 0
  if (alpha <= 0.01 && halo <= 0.02) return emptySample()

  const z = Math.sqrt(Math.max(0, 1 - Math.min(1, r2)))
  // Directional key light from top-right + Fresnel rim glow
  const diffuse = clamp(dx * 0.55 - dy * 0.55 + z * 0.62, 0, 1)
  const fresnel = Math.pow(1 - z, 2.2) * (0.45 + 0.55 * clamp(dx * 0.6 - dy * 0.6 + 0.5, 0, 1))
  const bands = Math.pow(0.5 + 0.5 * Math.cos((dy * 7.5 + dx * 2.2) * Math.PI), 4) * 0.55
  const meridians = Math.pow(0.5 + 0.5 * Math.cos(Math.atan2(dy, dx) * 10 + z * 4), 5) * 0.35
  const vein = clamp(fresnel * 0.85 + bands + meridians, 0, 1)
  const lum = clamp(0.14 + diffuse * 0.52 + fresnel * 0.46 + bands * 0.22, 0.06, 1)
  return {
    alpha,
    lum,
    vein,
    depth: clamp(z * 1.4 - 0.4, -1, 1),
    halo,
    flex: clamp(0.35 + (1 - z) * 0.65, 0, 1),
    streak: fresnel * smoothstep(0.1, 0.9, dx + 0.3) * 0.55,
  }
}

/** Bonus preset — "wave": 3D perspective topographic harmonic wave ribbon field. */
function sampleWave(x: number, y: number): FieldSample {
  const u = (x - 0.5) * 2
  const v = (y - 0.56) * 2
  const ridge1 = 0.24 * Math.sin(u * 3.4 - 0.4) + 0.12 * Math.cos(u * 6.2 + 0.8)
  const ridge2 = 0.18 * Math.sin(u * 2.6 + 1.4) - 0.08 * Math.sin(u * 5.0)
  const d1 = Math.abs(v - ridge1)
  const d2 = Math.abs(v - (ridge2 + 0.22))
  const d3 = Math.abs(v - (ridge1 - 0.28))

  const band1 = Math.exp(-Math.pow(d1 / 0.22, 2))
  const band2 = Math.exp(-Math.pow(d2 / 0.18, 2)) * 0.82
  const band3 = Math.exp(-Math.pow(d3 / 0.16, 2)) * 0.68
  const envX = 1 - smoothstep(0.74, 1.02, Math.abs(u))
  const alpha = clamp(Math.max(band1, band2, band3) * envX, 0, 1)
  const halo = alpha < 0.25 ? clamp((Math.max(band1, band2, band3) * 1.4) * envX, 0, 0.45) : 0
  if (alpha <= 0.05 && halo <= 0.04) return emptySample()

  const crest = Math.max(
    Math.exp(-Math.pow(d1 / 0.045, 2)),
    Math.exp(-Math.pow(d2 / 0.04, 2)) * 0.78,
    Math.exp(-Math.pow(d3 / 0.038, 2)) * 0.65,
  )
  const ripples = Math.pow(0.5 + 0.5 * Math.cos((v * 14 + Math.sin(u * 3.2) * 2.5) * Math.PI), 4) * 0.5
  const vein = clamp(crest * 0.92 + ripples * 0.45, 0, 1)
  const lum = clamp(0.18 + alpha * 0.48 + crest * 0.42 + (u * 0.12), 0.06, 1)
  return {
    alpha: smoothstep(0.12, 0.52, alpha),
    lum,
    vein,
    depth: clamp(crest * 0.8 - v * 0.45, -1, 1),
    halo,
    flex: clamp(0.35 + (u + 1) * 0.32, 0, 1),
    streak: crest * smoothstep(0.2, 0.9, u) * 0.5,
  }
}

function evaluatePreset(preset: PixelFieldPreset, x: number, y: number): FieldSample {
  switch (preset) {
    case 'branch': return sampleBranch(x, y)
    case 'sprout': return sampleSprout(x, y)
    case 'blade': return sampleBlade(x, y)
    case 'orb': return sampleOrb(x, y)
    case 'wave': return sampleWave(x, y)
    case 'leaf':
    default:
      return sampleLeaf(x, y)
  }
}

export interface BuildFieldOptions {
  preset: PixelFieldPreset
  width: number
  height: number
  pixelSize: number
  gap: number
  density: number
  /** Optional RGBA bitmap buffer sampled from `src` or `text`. */
  bitmap?: { data: Uint8ClampedArray, width: number, height: number } | null
}

/**
 * Generates a deterministic lattice of square pixel particles for either a
 * procedural botanical/geometric preset or an offscreen-sampled image/text bitmap.
 */
export function buildPixelFieldParticles(options: BuildFieldOptions): PixelFieldParticle[] {
  const w = Math.max(80, options.width)
  const h = Math.max(80, options.height)
  const density = clamp(options.density, 0.4, 1.6)
  const step = Math.max(2.6, (options.pixelSize + options.gap) / Math.sqrt(density))

  // Cap grid counts so even huge Hero stages stay crisp and steady at 60fps.
  const maxCols = 112
  const maxRows = 128
  const cols = Math.max(18, Math.min(maxCols, Math.floor(w / step)))
  const rows = Math.max(18, Math.min(maxRows, Math.floor(h / step)))

  const particles: PixelFieldParticle[] = []
  const bmp = options.bitmap

  for (let row = 0; row < rows; row++) {
    const ny = (row + 0.5) / rows
    for (let col = 0; col < cols; col++) {
      const nx = (col + 0.5) / cols
      const r1 = hash2(col, row, 1)
      const r2 = hash2(col, row, 2)
      const r3 = hash2(col, row, 3)

      let sample: FieldSample
      if (bmp) {
        const stageAspect = w / h
        const bmpAspect = bmp.width / Math.max(1, bmp.height)
        const u = stageAspect > bmpAspect ? 0.5 + (nx - 0.5) * (stageAspect / bmpAspect) : nx
        const v = stageAspect < bmpAspect ? 0.5 + (ny - 0.5) * (bmpAspect / stageAspect) : ny
        sample = u < 0 || u > 1 || v < 0 || v > 1 ? emptySample() : sampleBitmap(bmp, u, v)
      }
      else {
        // Keep botanical silhouettes and the 3D orb aspect-correct on any container shape.
        const aspect = w / h
        const maxScale = options.preset === 'wave' ? 1.35 : Number.POSITIVE_INFINITY
        const px = aspect > 1 ? 0.5 + (nx - 0.5) * Math.min(maxScale, aspect) : nx
        const py = aspect < 1 ? 0.5 + (ny - 0.5) * Math.min(maxScale, 1 / aspect) : ny
        sample = evaluatePreset(options.preset, px, py)
      }

      // Stippled quantization: solid veins stay dense; dim interior & edge halo dither organically.
      const keepCore = sample.alpha > 0.05 && r1 < (0.18 + sample.alpha * 0.72 + sample.vein * 0.28)
      const keepHalo = !keepCore && sample.halo > 0.05 && r1 < sample.halo * 0.24

      if (!keepCore && !keepHalo) continue

      const scatter = keepHalo
        ? 0.58 + 0.42 * r2
        : sample.alpha < 0.78
          ? (1 - sample.alpha) * 0.55
          : 0

      // Rest dispersion vector: floating halo pixels drift loosely outward at rest and coalesce on hover.
      const angle = r2 * Math.PI * 2
      const restDist = scatter * (4 + 14 * r3)
      const restDx = Math.cos(angle) * restDist
      const restDy = Math.sin(angle) * restDist - scatter * 3.5

      particles.push({
        hx: nx,
        hy: ny,
        ox: restDx,
        oy: restDy,
        vx: 0,
        vy: 0,
        lum: keepHalo ? clamp(sample.lum * 0.55 + 0.12 * r3, 0.08, 0.65) : sample.lum,
        vein: keepHalo ? 0.08 : sample.vein,
        depth: sample.depth,
        scatter,
        phase: r2 * Math.PI * 2,
        freq: 0.7 + r3 * 2.1,
        streak: keepHalo ? 0 : sample.streak,
        restDx,
        restDy,
        flex: sample.flex,
      })
    }
  }

  return particles
}

function sampleBitmap(
  bmp: { data: Uint8ClampedArray, width: number, height: number },
  nx: number,
  ny: number,
): FieldSample {
  const bx = clamp(Math.floor(nx * bmp.width), 0, bmp.width - 1)
  const by = clamp(Math.floor(ny * bmp.height), 0, bmp.height - 1)
  const readLuma = (ix: number, iy: number): { a: number, l: number } => {
    const cx = clamp(ix, 0, bmp.width - 1)
    const cy = clamp(iy, 0, bmp.height - 1)
    const idx = (cy * bmp.width + cx) * 4
    const a = (bmp.data[idx + 3] ?? 0) / 255
    const r = (bmp.data[idx] ?? 0) / 255
    const g = (bmp.data[idx + 1] ?? 0) / 255
    const b = (bmp.data[idx + 2] ?? 0) / 255
    return { a, l: (0.2126 * r + 0.7152 * g + 0.0722 * b) * a }
  }

  const center = readLuma(bx, by)
  const left = readLuma(bx - 1, by)
  const right = readLuma(bx + 1, by)
  const up = readLuma(bx, by - 1)
  const down = readLuma(bx, by + 1)

  const gx = right.l - left.l
  const gy = down.l - up.l
  const edge = clamp(Math.hypot(gx, gy) * 2.4, 0, 1)
  const neighborMax = Math.max(left.a, right.a, up.a, down.a)
  const halo = center.a < 0.15 && neighborMax > 0.2 ? neighborMax * 0.45 : 0

  if (center.a < 0.08 && halo < 0.05) return emptySample()

  return {
    alpha: center.a,
    lum: clamp(0.18 + center.l * 0.65 + edge * 0.35, 0.08, 1),
    vein: clamp(edge * 0.9 + center.l * 0.25, 0, 1),
    depth: clamp(center.l * 1.2 - 0.4, -1, 1),
    halo,
    flex: clamp(0.2 + (1 - ny) * 0.7, 0, 1),
    streak: edge * smoothstep(0.55, 1.0, nx) * 0.45,
  }
}

/** Rasterize text onto an offscreen canvas to feed `buildPixelFieldParticles`. */
export function rasterizeTextBitmap(
  text: string,
  size = 160,
  aspect = 1,
): { data: Uint8ClampedArray, width: number, height: number } | null {
  if (typeof document === 'undefined' || !text.trim()) return null
  const clampedAspect = clamp(aspect || 1, 0.65, 2.8)
  const bw = clampedAspect >= 1 ? Math.round(size * clampedAspect) : size
  const bh = clampedAspect < 1 ? Math.round(size / clampedAspect) : size
  const canvas = document.createElement('canvas')
  canvas.width = bw
  canvas.height = bh
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, bw, bh)
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const trimmed = text.trim()
  let fontSize = Math.round(bh * 0.64)
  ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  const measured = ctx.measureText(trimmed).width
  if (measured > bw * 0.86) {
    fontSize = Math.max(18, Math.floor(fontSize * ((bw * 0.86) / measured)))
    ctx.font = `700 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
  }
  ctx.fillText(trimmed, bw / 2, bh / 2)
  const img = ctx.getImageData(0, 0, bw, bh)
  return { data: img.data, width: bw, height: bh }
}

/** Load an image or SVG URL onto an offscreen canvas and return its RGBA buffer. */
export function loadImageBitmap(
  src: string,
  size = 160,
): Promise<{ data: Uint8ClampedArray, width: number, height: number } | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined' || !src.trim()) {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(null)
          return
        }
        const scale = Math.min((size * 0.86) / Math.max(1, img.naturalWidth), (size * 0.86) / Math.max(1, img.naturalHeight))
        const dw = img.naturalWidth * scale
        const dh = img.naturalHeight * scale
        ctx.clearRect(0, 0, size, size)
        ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh)
        const data = ctx.getImageData(0, 0, size, size)
        resolve({ data: data.data, width: size, height: size })
      }
      catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}
