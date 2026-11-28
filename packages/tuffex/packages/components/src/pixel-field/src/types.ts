export type PixelFieldPreset = 'branch' | 'leaf' | 'sprout' | 'blade' | 'orb' | 'wave'
export type PixelFieldPaletteName = 'emerald' | 'violet' | 'cyan' | 'amber' | 'mono'
export type PixelFieldStage = 'adaptive' | 'obsidian'
export type PixelFieldInteraction = 'coalesce' | 'repel' | 'attract' | 'ripple'

export interface PixelFieldPalette {
  /** Deepest ambient dots near edges or valleys. */
  shadow: string
  /** Mid-tone body dots. */
  mid: string
  /** Luminous ridge and contour dots. */
  bright: string
  /** Specular vein and hover-flare core dots. */
  highlight: string
  /** Optional custom obsidian/surface backdrop override. */
  backdrop?: string
}

export interface PixelFieldLabels {
  /** Fallback accessible description for the visual stage. */
  stage: string
}

export const PIXEL_FIELD_DEFAULT_LABELS: Readonly<PixelFieldLabels> = Object.freeze({
  stage: 'Interactive pixel particle field',
})

export interface PixelFieldProps {
  /** Built-in procedural botanical or geometric preset. */
  preset?: PixelFieldPreset
  /** Optional image or SVG URL sampled into an interactive pixel matrix. */
  src?: string
  /** Optional text glyph or wordmark sampled into an interactive pixel matrix. */
  text?: string
  /** Colour palette preset or custom 4-stop ramp. */
  palette?: PixelFieldPaletteName | PixelFieldPalette
  /** Surface mode: `adaptive` follows TuffEx light/dark tokens; `obsidian` locks a pitch-black glowing stage. */
  stage?: PixelFieldStage
  /** Base square pixel size in CSS pixels. */
  pixelSize?: number
  /** Spacing gap between lattice cells in CSS pixels. */
  gap?: number
  /** Density multiplier (0.4–1.6). */
  density?: number
  /** Ambient animation speed multiplier (0.2–3). */
  speed?: number
  /** Enable continuous ambient motion (still respects prefers-reduced-motion). */
  animated?: boolean
  /** Pause the animation loop on the current frame. */
  paused?: boolean
  /** Enable pointer hover sway, coalescing, and local disturbance. */
  interactive?: boolean
  /** Pointer interaction physics mode. */
  interaction?: PixelFieldInteraction
  /** Pointer influence radius in CSS pixels. */
  pointerRadius?: number
  /** Pointer force intensity multiplier (0–2). */
  pointerStrength?: number
  /** Depth parallax sway multiplier on hover (0–2). */
  parallax?: number
  /** Trigger an expanding luminous pulse wave on click/tap. */
  rippleOnClick?: boolean
  /** Optional CSS aspect-ratio for the stage container. */
  aspectRatio?: string | number
  /** Corner radius in CSS px or CSS length string. */
  radius?: number | string
  /** Accessible label override for the canvas stage. */
  ariaLabel?: string
  /** Custom fallback labels for assistive technologies. */
  labels?: Partial<PixelFieldLabels>
}

export interface PixelFieldParticle {
  /** Normalized home X in [0, 1]. */
  hx: number
  /** Normalized home Y in [0, 1]. */
  hy: number
  /** Current offset X in CSS pixels from home. */
  ox: number
  /** Current offset Y in CSS pixels from home. */
  oy: number
  /** Spring velocity X (px/s). */
  vx: number
  /** Spring velocity Y (px/s). */
  vy: number
  /** Base luminance in [0, 1]. */
  lum: number
  /** Structural vein / ridge weight in [0, 1]. */
  vein: number
  /** Pseudo-3D depth in [-1, 1] driving parallax. */
  depth: number
  /** 0 = core silhouette pixel, > 0 = floating halo/spore dispersion factor. */
  scatter: number
  /** Deterministic phase angle [0, 2π]. */
  phase: number
  /** Individual shimmer frequency. */
  freq: number
  /** Horizontal wind-shear streak factor at luminous tips [0, 1]. */
  streak: number
  /** Rest scatter vector X (px). */
  restDx: number
  /** Rest scatter vector Y (px). */
  restDy: number
  /** Structural flexibility along the stem/leaf tip [0, 1] for wind bend. */
  flex: number
}

export interface PixelFieldHandle {
  /** Emit a luminous shockwave ripple at normalized coordinates (defaults to center). */
  pulse: (nx?: number, ny?: number) => void
  /** Rebuild the particle field from current props and container size. */
  rebuild: () => void
  /** Current particle count in the active lattice. */
  readonly count: number
}
