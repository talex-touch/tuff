<script setup lang="ts">
// Gallery template: the Nexus community showcase wall.
//
// Every artwork is an SVG generated from a seed, a four-colour palette and a
// motif, plus three local JPGs that already ship with the site — no image is
// fetched from anywhere. Details open in TxModal (it teleports; TxFlipOverlay
// does not yet, and the docs article would become its containing block).
// Uploads stay in this tab: the template copies each file into an object URL it
// owns, so the uploader can unmount without breaking a card, and every URL is
// revoked on reset and unmount.
import type { FilterChipItem, FilterChipValue } from '@talex-touch/tuffex/filter-chips'
import type { ImageGalleryItem } from '@talex-touch/tuffex/image-gallery'
import type { ImageUploaderFile } from '@talex-touch/tuffex/image-uploader'
import type { SegmentedSliderSegment } from '@talex-touch/tuffex/segmented-slider'
import { hasNavigator, hasWindow } from '@talex-touch/utils/env'
import { computed, defineComponent, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import NeonDunesArt from '~/images/assets/intelligence.jpg'
import CalendarArt from '~/images/assets/plugin-cards/calendar.jpg'
import FlutedGlassArt from '~/images/assets/plugin-cards/notion.jpg'
import TemplateFrame from './TemplateFrame.vue'

type Collection = 'wallpaper' | 'theme' | 'cover' | 'community'
type CollectionFilter = 'all' | Collection
type Motif = 'orbs' | 'dunes' | 'grid' | 'rings' | 'corebox' | 'glyph' | 'stars' | 'keys' | 'pixels'
type GlyphKind = 'clip' | 'bolt' | 'globe' | 'window' | 'bracket' | 'compass' | 'power'
type PaletteName = 'aurora' | 'lilac' | 'ocean' | 'neon' | 'glacier' | 'ember' | 'mint' | 'midnight' | 'coral' | 'matcha' | 'peach' | 'graphite' | 'forest' | 'sand' | 'dusk'
type Orientation = 'landscape' | 'portrait' | 'square'
type Layout = 'grid' | 'masonry' | 'list'
type SortKey = 'newest' | 'rating' | 'likes'
type ThumbSize = 's' | 'm' | 'l' | 'xl'
type ArtistId = 'lq' | 'mo' | 'ks' | 'ac' | 'nh' | 'zy' | 'lm' | 'of' | 'you'
type TagKey = 'dark' | 'light' | 'gradient' | 'minimal' | 'retro' | 'geometric' | 'landscape' | 'space' | 'theme' | 'icon' | 'pixel' | 'glass'
type Mode = 'narrow' | 'column' | 'wide'

interface Bi { zh: string, en: string }

interface Palette {
  colors: [string, string, string, string]
  dark: boolean
}

type ArtSource =
  | { kind: 'svg', motif: Motif, palette: PaletteName, seed: number, glyph?: GlyphKind }
  | { kind: 'asset', src: string, palette: PaletteName }

interface Artwork {
  id: string
  title: Bi
  collection: Collection
  source: ArtSource
  url: string
  orientation: Orientation
  pixels: [number, number]
  artist: ArtistId
  rating: number
  votes: number
  likes: number
  liked: boolean
  myRating: number
  createdAt: number
  isNew: boolean
  tags: TagKey[]
  uploaded?: boolean
}

// Scoped-slot values never reach <script setup>. This relays the stage's
// measured size into refs, so props that CSS cannot reach can follow it.
const StageSize = defineComponent({
  name: 'StageSize',
  props: {
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 },
  },
  emits: { resize: (_width: number, _height: number) => true },
  setup(props, { emit }) {
    watch(() => [props.width, props.height] as const, ([width, height]) => emit('resize', width, height), { immediate: true })
    return () => null
  },
})

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))

function L(text: Bi): string {
  return zh.value ? text.zh : text.en
}

function prefersReducedMotion(): boolean {
  return hasWindow() && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* ─── Artwork generator ───────────────────────────────────────────────── */

// Palettes are image content, not UI chrome: each one is tuned to read as a
// finished piece on both the light and the dark docs theme.
const PALETTES: Record<PaletteName, Palette> = {
  aurora: { colors: ['#0b1026', '#33287a', '#6c5ce7', '#00d2d3'], dark: true },
  lilac: { colors: ['#f5edff', '#cdbcff', '#8b5cf6', '#f0abfc'], dark: false },
  ocean: { colors: ['#03162f', '#0b4f8a', '#1e90ff', '#8fe3ff'], dark: true },
  neon: { colors: ['#12002b', '#3a0ca3', '#ff2e97', '#00e5ff'], dark: true },
  glacier: { colors: ['#eef4ff', '#bcd4ff', '#6c8dff', '#3a56d4'], dark: false },
  ember: { colors: ['#1c0a06', '#7a1f0b', '#ff6a2b', '#ffc15e'], dark: true },
  mint: { colors: ['#eafbf3', '#a4e8c8', '#2fbf8f', '#127a5c'], dark: false },
  midnight: { colors: ['#070b1f', '#1b2350', '#4f5bd5', '#b8c1ff'], dark: true },
  coral: { colors: ['#fff2ee', '#ffb4a2', '#ff6f61', '#c2185b'], dark: false },
  matcha: { colors: ['#f4f9ec', '#c8e6a0', '#7cb342', '#33691e'], dark: false },
  peach: { colors: ['#fff6ec', '#ffd6a5', '#ff9f68', '#f25f5c'], dark: false },
  graphite: { colors: ['#0f1115', '#262a33', '#6b7280', '#e5e7eb'], dark: true },
  forest: { colors: ['#06140f', '#0f3d2e', '#2e8b57', '#a8e6cf'], dark: true },
  sand: { colors: ['#fbf6ee', '#eadbc4', '#c9a27e', '#7a5c43'], dark: false },
  dusk: { colors: ['#140b2e', '#4b2a86', '#e05bd0', '#ffb36b'], dark: true },
}

const PIXELS: Record<Orientation, [number, number]> = {
  landscape: [3840, 2400],
  portrait: [1800, 2700],
  square: [2048, 2048],
}

const VIEWBOX: Record<Orientation, [number, number]> = {
  landscape: [640, 400],
  portrait: [400, 600],
  square: [480, 480],
}

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function n(value: number): string {
  return String(Math.round(value * 10) / 10)
}

function stops(colors: string[], opacities: number[] = []): string {
  return colors.map((color, index) => {
    const opacity = opacities[index] ?? 1
    return `<stop offset="${n(index / Math.max(1, colors.length - 1))}" stop-color="${color}" stop-opacity="${opacity}"/>`
  }).join('')
}

function blur(id: string, deviation: number): string {
  return `<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${n(deviation)}"/></filter>`
}

interface Drawing { defs: string, body: string }

// Soft light: blobs spread over a 3×2 lattice so they never clump, plus two
// thin ribbons that give the blur a direction, like an aurora.
function drawOrbs(w: number, h: number, p: Palette, rand: () => number): Drawing {
  const [c0, c1, c2, c3] = p.colors
  const m = Math.min(w, h)
  const fills = [c1, c2, c3, c2, c3, c1]
  const blobs = fills.map((fill, index) => {
    const cx = (index % 3 + 0.15 + rand() * 0.7) / 3 * w
    const cy = (Math.floor(index / 3) + 0.1 + rand() * 0.8) / 2 * h
    return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(m * (0.2 + rand() * 0.22))}" fill="${fill}" opacity="${n(0.6 + rand() * 0.35)}"/>`
  }).join('')
  const ribbons = [c2, c3].map((stroke, index) => {
    const y = h * (0.3 + index * 0.26 + rand() * 0.12)
    const lift = h * (0.14 + rand() * 0.12)
    const d = `M${n(-w * 0.1)} ${n(y + lift)}C${n(w * 0.28)} ${n(y - lift)} ${n(w * 0.62)} ${n(y + lift * 1.2)} ${n(w * 1.1)} ${n(y - lift * 0.6)}`
    return `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${n(m * (index ? 0.05 : 0.085))}" stroke-linecap="round" opacity="0.7"/>`
  }).join('')
  return {
    defs: `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">${stops([c0, c1])}</linearGradient>${blur('soft', m * 0.1)}${blur('streak', m * 0.04)}`,
    body: `<rect width="${w}" height="${h}" fill="url(#bg)"/><g filter="url(#soft)">${blobs}</g><g filter="url(#streak)">${ribbons}</g>`,
  }
}

function wave(w: number, h: number, base: number, amp: number, rand: () => number, segments = 4): string {
  const points = Array.from({ length: segments + 1 }, (_, index) => [w * index / segments, base + (rand() - 0.5) * 2 * amp] as const)
  let d = `M0 ${h}L0 ${n(points[0]![1])}`
  for (let index = 1; index < points.length; index += 1) {
    const [x0, y0] = points[index - 1]!
    const [x1, y1] = points[index]!
    const half = (x1 - x0) / 2
    d += `C${n(x0 + half)} ${n(y0)} ${n(x1 - half)} ${n(y1)} ${n(x1)} ${n(y1)}`
  }
  return `${d}L${w} ${h}Z`
}

function drawDunes(w: number, h: number, p: Palette, rand: () => number): Drawing {
  const [c0, c1, c2, c3] = p.colors
  const m = Math.min(w, h)
  const sunX = w * (0.25 + rand() * 0.5)
  const sunY = h * (0.24 + rand() * 0.12)
  const sun = p.dark ? c3 : c2
  const layers: [string, number][] = p.dark
    ? [[c1, 0.85], [c2, 0.5], [c1, 0.95], [c0, 1]]
    : [[c1, 0.9], [c2, 0.45], [c2, 0.8], [c3, 0.92]]
  const hills = layers.map(([fill, opacity], index) =>
    `<path d="${wave(w, h, h * (0.5 + index * 0.12), h * (0.075 - index * 0.01), rand)}" fill="${fill}" opacity="${opacity}"/>`,
  ).join('')
  return {
    defs: `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${stops(p.dark ? [c0, c1] : [c0, c1])}</linearGradient>${blur('glow', m * 0.09)}`,
    body: `<rect width="${w}" height="${h}" fill="url(#sky)"/><circle cx="${n(sunX)}" cy="${n(sunY)}" r="${n(m * 0.24)}" fill="${sun}" opacity="0.45" filter="url(#glow)"/><circle cx="${n(sunX)}" cy="${n(sunY)}" r="${n(m * 0.1)}" fill="${sun}"/>${hills}`,
  }
}

function drawGrid(w: number, h: number, p: Palette, _rand: () => number): Drawing {
  const [c0, c1, c2, c3] = p.colors
  const horizon = h * 0.6
  const radius = Math.min(w, h) * 0.24
  const cx = w / 2
  const cy = horizon - radius * 0.35
  const bands = Array.from({ length: 5 }, (_, index) => {
    const y = cy + radius * (0.12 + index * 0.18)
    return `<rect x="${n(cx - radius)}" y="${n(y)}" width="${n(radius * 2)}" height="${n(2 + index * 2.2)}" fill="${c1}"/>`
  }).join('')
  const across = Array.from({ length: 9 }, (_, index) => {
    const y = horizon + (h - horizon) * ((index + 1) / 9) ** 1.9
    return `<line x1="0" y1="${n(y)}" x2="${w}" y2="${n(y)}"/>`
  }).join('')
  const down = Array.from({ length: 21 }, (_, index) => {
    const k = index - 10
    return `<line x1="${n(cx + k * 8)}" y1="${n(horizon)}" x2="${n(cx + k * w * 0.16)}" y2="${h}"/>`
  }).join('')
  return {
    defs: `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${stops([c0, c1])}</linearGradient><linearGradient id="sun" x1="0" y1="0" x2="0" y2="1">${stops([c3, c2])}</linearGradient><clipPath id="sunclip"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(radius)}"/></clipPath>${blur('glow', h * 0.05)}`,
    body: `<rect width="${w}" height="${h}" fill="url(#sky)"/><ellipse cx="${n(cx)}" cy="${n(horizon)}" rx="${n(w * 0.55)}" ry="${n(h * 0.1)}" fill="${c2}" opacity="0.5" filter="url(#glow)"/><g clip-path="url(#sunclip)"><rect x="${n(cx - radius)}" y="${n(cy - radius)}" width="${n(radius * 2)}" height="${n(radius * 2)}" fill="url(#sun)"/>${bands}</g><rect y="${n(horizon)}" width="${w}" height="${n(h - horizon)}" fill="${c0}"/><g stroke="${c3}" stroke-width="1.2" opacity="0.55">${across}${down}</g>`,
  }
}

function drawRings(w: number, h: number, p: Palette, rand: () => number): Drawing {
  const [c0, c1, c2, c3] = p.colors
  const cx = w * (0.35 + rand() * 0.3)
  const cy = h * (0.35 + rand() * 0.3)
  const m = Math.max(w, h)
  const rings = Array.from({ length: 14 }, (_, index) => {
    const r = m * 0.045 * (index + 1) ** 1.12
    const width = index % 4 === 0 ? 3 : 1.2
    const dash = index % 3 === 1 ? ` stroke-dasharray="${n(r * 0.28)} ${n(r * 0.18)}"` : ''
    return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" stroke-width="${width}" opacity="${n(Math.max(0.18, 0.92 - index * 0.055))}"${dash}/>`
  }).join('')
  return {
    defs: `<radialGradient id="bg" cx="${n(cx / w)}" cy="${n(cy / h)}" r="0.9">${stops(p.dark ? [c1, c0] : [c0, c1])}</radialGradient><linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">${stops([c2, c3])}</linearGradient>${blur('glow', m * 0.03)}`,
    body: `<rect width="${w}" height="${h}" fill="url(#bg)"/><g fill="none" stroke="url(#ring)">${rings}</g><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(m * 0.05)}" fill="${c3}" opacity="0.8" filter="url(#glow)"/>`,
  }
}

// A CoreBox window in the theme's colours: a search field, a result list with
// one row selected, and a key-hint footer — what the theme would look like.
function drawCorebox(w: number, h: number, p: Palette, rand: () => number): Drawing {
  const [, c1, c2, c3] = p.colors
  const s = w / 640
  const x = w * 0.13
  const y = h * 0.15
  const ww = w * 0.74
  const wh = h * 0.7
  const surface = p.dark ? '#0d0f16' : '#ffffff'
  const ink = p.dark ? '#ffffff' : '#111827'
  const rows = Array.from({ length: 4 }, (_, index) => {
    const ry = y + 70 * s + index * 44 * s
    const selected = index === 1
      ? `<rect x="${n(x + 10 * s)}" y="${n(ry - 7 * s)}" width="${n(ww - 20 * s)}" height="${n(40 * s)}" rx="${n(10 * s)}" fill="${p.dark ? c3 : c2}" opacity="${p.dark ? 0.22 : 0.16}"/><rect x="${n(x + ww - 62 * s)}" y="${n(ry + 4 * s)}" width="${n(36 * s)}" height="${n(18 * s)}" rx="${n(5 * s)}" fill="${ink}" opacity="0.12"/>`
      : ''
    const icon = [c2, c3, c1, c2][index]
    return `${selected}<rect x="${n(x + 22 * s)}" y="${n(ry)}" width="${n(26 * s)}" height="${n(26 * s)}" rx="${n(8 * s)}" fill="${icon}"/><rect x="${n(x + 60 * s)}" y="${n(ry + 3 * s)}" width="${n(ww * (0.26 + rand() * 0.2))}" height="${n(8 * s)}" rx="${n(4 * s)}" fill="${ink}" opacity="0.78"/><rect x="${n(x + 60 * s)}" y="${n(ry + 16 * s)}" width="${n(ww * (0.14 + rand() * 0.14))}" height="${n(6 * s)}" rx="${n(3 * s)}" fill="${ink}" opacity="0.32"/>`
  }).join('')
  return {
    defs: `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">${stops([c1, c2])}</linearGradient>${blur('soft', h * 0.12)}${blur('shade', 14 * s)}`,
    body: `<rect width="${w}" height="${h}" fill="url(#bg)"/><circle cx="${n(w * 0.18)}" cy="${n(h * 0.2)}" r="${n(h * 0.34)}" fill="${c3}" opacity="0.75" filter="url(#soft)"/><circle cx="${n(w * 0.86)}" cy="${n(h * 0.9)}" r="${n(h * 0.4)}" fill="${c2}" opacity="0.7" filter="url(#soft)"/>`
      + `<rect x="${n(x + 6 * s)}" y="${n(y + 16 * s)}" width="${n(ww)}" height="${n(wh)}" rx="${n(18 * s)}" fill="#000" opacity="0.28" filter="url(#shade)"/>`
      + `<rect x="${n(x)}" y="${n(y)}" width="${n(ww)}" height="${n(wh)}" rx="${n(18 * s)}" fill="${surface}" opacity="0.9" stroke="${ink}" stroke-opacity="0.1"/>`
      + `<rect x="${n(x + 14 * s)}" y="${n(y + 14 * s)}" width="${n(ww - 28 * s)}" height="${n(40 * s)}" rx="${n(11 * s)}" fill="${ink}" opacity="0.06"/>`
      + `<circle cx="${n(x + 36 * s)}" cy="${n(y + 34 * s)}" r="${n(7 * s)}" fill="none" stroke="${ink}" stroke-opacity="0.5" stroke-width="${n(2 * s)}"/><line x1="${n(x + 41 * s)}" y1="${n(y + 39 * s)}" x2="${n(x + 46 * s)}" y2="${n(y + 44 * s)}" stroke="${ink}" stroke-opacity="0.5" stroke-width="${n(2 * s)}" stroke-linecap="round"/>`
      + `<rect x="${n(x + 56 * s)}" y="${n(y + 30 * s)}" width="${n(ww * 0.3)}" height="${n(8 * s)}" rx="${n(4 * s)}" fill="${ink}" opacity="0.3"/>`
      + rows
      + `<rect x="${n(x + 18 * s)}" y="${n(y + wh - 24 * s)}" width="${n(ww * 0.2)}" height="${n(6 * s)}" rx="${n(3 * s)}" fill="${ink}" opacity="0.22"/><rect x="${n(x + ww - 84 * s)}" y="${n(y + wh - 28 * s)}" width="${n(24 * s)}" height="${n(14 * s)}" rx="${n(4 * s)}" fill="${ink}" opacity="0.14"/><rect x="${n(x + ww - 54 * s)}" y="${n(y + wh - 28 * s)}" width="${n(36 * s)}" height="${n(14 * s)}" rx="${n(4 * s)}" fill="${ink}" opacity="0.14"/>`,
  }
}

const GLYPHS: Record<GlyphKind, string> = {
  clip: '<rect x="-0.6" y="-0.72" width="1.2" height="1.62" rx="0.2"/><rect x="-0.3" y="-0.92" width="0.6" height="0.34" rx="0.1" fill="#fff"/><path d="M-0.3 -0.1H0.3M-0.3 0.25H0.12"/>',
  bolt: '<path d="M0.15 -0.95L-0.48 0.1H0.02L-0.15 0.95L0.48 -0.12H-0.02Z" fill="#fff" stroke-width="0.08"/>',
  globe: '<circle r="0.86"/><ellipse rx="0.38" ry="0.86"/><path d="M-0.86 0H0.86M-0.72 -0.44Q0 -0.3 0.72 -0.44M-0.72 0.44Q0 0.3 0.72 0.44"/>',
  window: '<rect x="-0.86" y="-0.72" width="1.72" height="1.44" rx="0.2"/><path d="M-0.86 -0.34H0.86M-0.08 -0.34V0.72"/><circle cx="-0.62" cy="-0.53" r="0.05" fill="#fff"/><circle cx="-0.46" cy="-0.53" r="0.05" fill="#fff"/>',
  bracket: '<path d="M-0.34 -0.62L-0.84 0L-0.34 0.62M0.34 -0.62L0.84 0L0.34 0.62M0.14 -0.78L-0.14 0.78"/>',
  compass: '<circle r="0.86"/><path d="M0.36 -0.36L0.12 0.12L-0.36 0.36L-0.12 -0.12Z" fill="#fff"/>',
  power: '<path d="M-0.5 -0.56A0.74 0.74 0 1 0 0.5 -0.56M0 -0.9V-0.05"/>',
}

// A plugin cover: an app tile with a white glyph, lit from the top left.
function drawGlyph(w: number, h: number, p: Palette, rand: () => number, kind: GlyphKind): Drawing {
  const [c0, c1, c2, c3] = p.colors
  const size = Math.min(w, h) * 0.46
  const x = (w - size) / 2
  const y = (h - size) / 2 - h * 0.02
  return {
    defs: `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">${stops([c1, c0])}</linearGradient><linearGradient id="tile" x1="0" y1="0" x2="0.4" y2="1">${stops([c3, c2])}</linearGradient><linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">${stops(['#ffffff', '#ffffff'], [0.32, 0])}</linearGradient>${blur('soft', w * 0.12)}${blur('shade', size * 0.08)}`,
    body: `<rect width="${w}" height="${h}" fill="url(#bg)"/><circle cx="${n(w * (0.12 + rand() * 0.2))}" cy="${n(h * 0.15)}" r="${n(w * 0.32)}" fill="${c2}" opacity="0.55" filter="url(#soft)"/><circle cx="${n(w * 0.9)}" cy="${n(h * 0.92)}" r="${n(w * 0.3)}" fill="${c3}" opacity="0.35" filter="url(#soft)"/>`
      + `<ellipse cx="${n(w / 2 + size * 0.06)}" cy="${n(y + size * 1.05)}" rx="${n(size * 0.44)}" ry="${n(size * 0.08)}" fill="#000" opacity="0.35" filter="url(#shade)"/>`
      + `<rect x="${n(x)}" y="${n(y)}" width="${n(size)}" height="${n(size)}" rx="${n(size * 0.24)}" fill="url(#tile)"/><rect x="${n(x)}" y="${n(y)}" width="${n(size)}" height="${n(size * 0.6)}" rx="${n(size * 0.24)}" fill="url(#sheen)"/>`
      + `<g transform="translate(${n(w / 2)} ${n(y + size / 2)}) scale(${n(size * 0.3)})" fill="none" stroke="#fff" stroke-width="0.14" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[kind]}</g>`,
  }
}

function drawStars(w: number, h: number, p: Palette, rand: () => number): Drawing {
  const [c0, c1, c2, c3] = p.colors
  const dust = Array.from({ length: 110 }, () => `<circle cx="${n(rand() * w)}" cy="${n(rand() * h)}" r="${n(0.4 + rand() * 1.2)}" opacity="${n(0.25 + rand() * 0.65)}"/>`).join('')
  const points = Array.from({ length: 7 }, () => [w * (0.14 + rand() * 0.72), h * (0.2 + rand() * 0.6)] as const)
    .sort((a, b) => a[0] - b[0])
  const line = points.map(([px, py], index) => `${index ? 'L' : 'M'}${n(px)} ${n(py)}`).join('')
  const nodes = points.map(([px, py]) => `<circle cx="${n(px)}" cy="${n(py)}" r="8" fill="${c3}" opacity="0.3" filter="url(#glow)"/><circle cx="${n(px)}" cy="${n(py)}" r="2.6" fill="#fff"/>`).join('')
  return {
    defs: `<radialGradient id="bg" cx="0.7" cy="0.2" r="1">${stops([c1, c0])}</radialGradient>${blur('neb', Math.min(w, h) * 0.12)}${blur('glow', 4)}`,
    body: `<rect width="${w}" height="${h}" fill="url(#bg)"/><ellipse cx="${n(w * 0.3)}" cy="${n(h * 0.62)}" rx="${n(w * 0.32)}" ry="${n(h * 0.2)}" fill="${c2}" opacity="0.35" filter="url(#neb)"/><ellipse cx="${n(w * 0.78)}" cy="${n(h * 0.3)}" rx="${n(w * 0.22)}" ry="${n(h * 0.16)}" fill="${c3}" opacity="0.28" filter="url(#neb)"/><g fill="#fff">${dust}</g><path d="${line}" fill="none" stroke="${c3}" stroke-width="1.2" opacity="0.75"/>${nodes}`,
  }
}

function drawKeys(w: number, h: number, p: Palette, rand: () => number): Drawing {
  const [c0, c1, c2, c3] = p.colors
  const px = w * 0.08
  const py = h * 0.18
  const pw = w * 0.84
  const ph = h * 0.64
  const gap = 8
  const unit = (pw - 28 - gap * 11) / 12
  const layout = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
    [1.8, 1, 1, 1, 1, 1, 1, 1, 1, 2.2],
    [1.3, 1.3, 1.3, 5.3, 1.3, 1.3],
  ]
  const rowHeight = (ph - 28 - gap * 3) / 4
  const face = p.dark ? c1 : '#ffffff'
  let keys = ''
  layout.forEach((row, rowIndex) => {
    let kx = px + 14
    const ky = py + 14 + rowIndex * (rowHeight + gap)
    for (const span of row) {
      const kw = unit * span + gap * (span - 1)
      const lit = rand() < 0.14 ? (rand() < 0.5 ? c2 : c3) : face
      keys += `<rect x="${n(kx)}" y="${n(ky + 3)}" width="${n(kw)}" height="${n(rowHeight)}" rx="7" fill="#000" opacity="0.18"/><rect x="${n(kx)}" y="${n(ky)}" width="${n(kw)}" height="${n(rowHeight)}" rx="7" fill="${lit}"/>`
      kx += kw + gap
    }
  })
  return {
    defs: `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">${stops([c0, c1])}</linearGradient>${blur('shade', 16)}`,
    body: `<rect width="${w}" height="${h}" fill="url(#bg)"/><rect x="${n(px + 8)}" y="${n(py + 18)}" width="${n(pw)}" height="${n(ph)}" rx="22" fill="#000" opacity="0.22" filter="url(#shade)"/><rect x="${n(px)}" y="${n(py)}" width="${n(pw)}" height="${n(ph)}" rx="22" fill="${p.dark ? c0 : c1}"/>${keys}`,
  }
}

function drawPixels(w: number, h: number, p: Palette, rand: () => number): Drawing {
  const colors = p.colors
  const cols = 20
  const cell = w / cols
  const rows = Math.ceil(h / cell)
  const gap = cell * 0.12
  const phase = rand() * 10
  let cells = ''
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const v = (Math.sin(x * 0.55 + phase) + Math.cos(y * 0.6 - phase * 0.7) + Math.sin((x + y) * 0.3 + phase * 1.3)) / 3
      const index = v < -0.35 ? 0 : v < 0.05 ? 1 : v < 0.45 ? 2 : 3
      cells += `<rect x="${n(x * cell + gap)}" y="${n(y * cell + gap)}" width="${n(cell - gap * 2)}" height="${n(cell - gap * 2)}" rx="${n(cell * 0.22)}" fill="${colors[index]}"/>`
    }
  }
  return {
    defs: '',
    body: `<rect width="${w}" height="${h}" fill="${colors[0]}"/>${cells}`,
  }
}

function renderArt(source: ArtSource, orientation: Orientation): string {
  if (source.kind === 'asset')
    return source.src
  const [w, h] = VIEWBOX[orientation]
  const palette = PALETTES[source.palette]
  const rand = random(source.seed)
  let drawing: Drawing
  switch (source.motif) {
    case 'dunes': drawing = drawDunes(w, h, palette, rand); break
    case 'grid': drawing = drawGrid(w, h, palette, rand); break
    case 'rings': drawing = drawRings(w, h, palette, rand); break
    case 'corebox': drawing = drawCorebox(w, h, palette, rand); break
    case 'glyph': drawing = drawGlyph(w, h, palette, rand, source.glyph ?? 'bolt'); break
    case 'stars': drawing = drawStars(w, h, palette, rand); break
    case 'keys': drawing = drawKeys(w, h, palette, rand); break
    case 'pixels': drawing = drawPixels(w, h, palette, rand); break
    default: drawing = drawOrbs(w, h, palette, rand)
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${drawing.defs}</defs>${drawing.body}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/* ─── Catalogue ───────────────────────────────────────────────────────── */

const NOW = Date.UTC(2026, 8, 23, 2, 0)
const DAY = 86_400_000

const ARTISTS: Record<ArtistId, { name: Bi, hue: string }> = {
  lq: { name: { zh: '林乔', en: 'Lin Qiao' }, hue: 'var(--tx-chart-categorical-1, #4290f0)' },
  mo: { name: { zh: 'Mara Okafor', en: 'Mara Okafor' }, hue: 'var(--tx-chart-categorical-6, #d37536)' },
  ks: { name: { zh: '佐藤健二', en: 'Kenji Sato' }, hue: 'var(--tx-chart-categorical-5, #50c3b6)' },
  ac: { name: { zh: 'Ava Chen', en: 'Ava Chen' }, hue: 'var(--tx-chart-categorical-3, #e8649d)' },
  nh: { name: { zh: 'Noor Haddad', en: 'Noor Haddad' }, hue: 'var(--tx-chart-categorical-4, #8d58ee)' },
  zy: { name: { zh: '周屿', en: 'Zhou Yu' }, hue: 'var(--tx-chart-categorical-2, #f5b647)' },
  lm: { name: { zh: 'Léa Martin', en: 'Léa Martin' }, hue: 'var(--tx-chart-categorical-5, #50c3b6)' },
  of: { name: { zh: 'Omar Farouk', en: 'Omar Farouk' }, hue: 'var(--tx-chart-categorical-1, #4290f0)' },
  you: { name: { zh: '你', en: 'You' }, hue: 'var(--tx-bui-accent, #0285ff)' },
}

const COLLECTIONS: Record<CollectionFilter, { label: Bi, blurb: Bi, dot: string, icon: string }> = {
  all: {
    label: { zh: '全部', en: 'All' },
    blurb: { zh: 'Nexus 社区分享的壁纸、CoreBox 主题与插件封面。', en: 'Wallpapers, CoreBox themes and plugin covers shared on Nexus.' },
    dot: '',
    icon: 'i-carbon-image-copy',
  },
  wallpaper: {
    label: { zh: '壁纸', en: 'Wallpapers' },
    blurb: { zh: '为桌面与 CoreBox 背景准备的高分辨率作品。', en: 'High-resolution pieces for the desktop and the CoreBox backdrop.' },
    dot: 'var(--tx-chart-categorical-1, #4290f0)',
    icon: 'i-carbon-image',
  },
  theme: {
    label: { zh: 'CoreBox 主题', en: 'CoreBox themes' },
    blurb: { zh: '配色与材质预设，一键应用到 CoreBox。', en: 'Colour and material presets you can apply to CoreBox in one click.' },
    dot: 'var(--tx-chart-categorical-4, #8d58ee)',
    icon: 'i-carbon-template',
  },
  cover: {
    label: { zh: '插件封面', en: 'Plugin covers' },
    blurb: { zh: 'Nexus 插件市场里的封面与图标。', en: 'Covers and icons from the Nexus plugin store.' },
    dot: 'var(--tx-chart-categorical-6, #d37536)',
    icon: 'i-carbon-plug',
  },
  community: {
    label: { zh: '社区精选', en: 'Community picks' },
    blurb: { zh: '本月由社区投票选出的作品。', en: 'Pieces the community voted up this month.' },
    dot: 'var(--tx-chart-categorical-3, #e8649d)',
    icon: 'i-carbon-trophy',
  },
}

const TAGS: Record<TagKey, Bi> = {
  dark: { zh: '暗色', en: 'Dark' },
  light: { zh: '浅色', en: 'Light' },
  gradient: { zh: '渐变', en: 'Gradient' },
  minimal: { zh: '极简', en: 'Minimal' },
  retro: { zh: '复古', en: 'Retro' },
  geometric: { zh: '几何', en: 'Geometric' },
  landscape: { zh: '风景', en: 'Landscape' },
  space: { zh: '星空', en: 'Space' },
  theme: { zh: '主题', en: 'Theme' },
  icon: { zh: '图标', en: 'Icon' },
  pixel: { zh: '像素', en: 'Pixel' },
  glass: { zh: '玻璃', en: 'Glass' },
}

interface Entry {
  id: string
  title: Bi
  collection: Collection
  source: ArtSource
  orientation: Orientation
  artist: ArtistId
  rating: number
  votes: number
  likes: number
  days: number
  tags: TagKey[]
}

function svg(motif: Motif, palette: PaletteName, seed: number, glyph?: GlyphKind): ArtSource {
  return { kind: 'svg', motif, palette, seed, glyph }
}

const ENTRIES: Entry[] = [
  { id: 'aurora-dusk', title: { zh: '极光黄昏', en: 'Aurora Dusk' }, collection: 'wallpaper', source: svg('orbs', 'aurora', 11), orientation: 'landscape', artist: 'mo', rating: 4.8, votes: 212, likes: 1284, days: 1, tags: ['dark', 'gradient'] },
  { id: 'neon-dunes', title: { zh: '霓虹沙丘', en: 'Neon Dunes' }, collection: 'wallpaper', source: { kind: 'asset', src: NeonDunesArt, palette: 'dusk' }, orientation: 'landscape', artist: 'zy', rating: 4.9, votes: 305, likes: 2210, days: 6, tags: ['dark', 'landscape'] },
  { id: 'fluted-glass', title: { zh: '条纹玻璃', en: 'Fluted Glass' }, collection: 'wallpaper', source: { kind: 'asset', src: FlutedGlassArt, palette: 'graphite' }, orientation: 'portrait', artist: 'lm', rating: 4.6, votes: 144, likes: 876, days: 9, tags: ['glass', 'minimal'] },
  { id: 'mica-mist', title: { zh: 'Mica 晨雾', en: 'Mica Mist' }, collection: 'wallpaper', source: svg('orbs', 'lilac', 23), orientation: 'landscape', artist: 'ac', rating: 4.5, votes: 98, likes: 640, days: 2, tags: ['light', 'gradient'] },
  { id: 'vibrancy-deep', title: { zh: 'Vibrancy 深海', en: 'Vibrancy Deep' }, collection: 'wallpaper', source: svg('dunes', 'ocean', 31), orientation: 'landscape', artist: 'ks', rating: 4.7, votes: 187, likes: 1105, days: 12, tags: ['dark', 'landscape'] },
  { id: 'synth-horizon', title: { zh: '合成器地平线', en: 'Synth Horizon' }, collection: 'wallpaper', source: svg('grid', 'neon', 41), orientation: 'landscape', artist: 'of', rating: 4.4, votes: 121, likes: 932, days: 15, tags: ['retro', 'dark'] },
  { id: 'concentric-echo', title: { zh: '同心回响', en: 'Concentric Echo' }, collection: 'wallpaper', source: svg('rings', 'glacier', 53), orientation: 'square', artist: 'lq', rating: 4.3, votes: 76, likes: 418, days: 20, tags: ['light', 'geometric'] },
  { id: 'amber-dunes', title: { zh: '琥珀沙丘', en: 'Amber Dunes' }, collection: 'wallpaper', source: svg('dunes', 'ember', 61), orientation: 'landscape', artist: 'zy', rating: 4.6, votes: 133, likes: 804, days: 4, tags: ['dark', 'landscape'] },
  { id: 'mint-layers', title: { zh: '薄荷层叠', en: 'Mint Layers' }, collection: 'wallpaper', source: svg('dunes', 'mint', 71), orientation: 'portrait', artist: 'ac', rating: 4.2, votes: 64, likes: 377, days: 27, tags: ['light', 'landscape'] },
  { id: 'midnight-bokeh', title: { zh: '午夜光斑', en: 'Midnight Bokeh' }, collection: 'wallpaper', source: svg('orbs', 'midnight', 83), orientation: 'portrait', artist: 'nh', rating: 4.5, votes: 110, likes: 690, days: 7, tags: ['dark', 'gradient'] },
  { id: 'coral-tide', title: { zh: '珊瑚潮汐', en: 'Coral Tide' }, collection: 'wallpaper', source: svg('dunes', 'coral', 97), orientation: 'landscape', artist: 'lm', rating: 4.4, votes: 92, likes: 551, days: 18, tags: ['light', 'landscape'] },
  { id: 'glacier-rings', title: { zh: '冰川环', en: 'Glacier Rings' }, collection: 'wallpaper', source: svg('rings', 'ocean', 101), orientation: 'portrait', artist: 'ks', rating: 4.1, votes: 58, likes: 302, days: 33, tags: ['dark', 'geometric'] },
  { id: 'matcha-fields', title: { zh: '抹茶田', en: 'Matcha Fields' }, collection: 'wallpaper', source: svg('dunes', 'matcha', 113), orientation: 'landscape', artist: 'mo', rating: 4.3, votes: 70, likes: 415, days: 23, tags: ['light', 'landscape'] },
  { id: 'star-trails', title: { zh: '星轨', en: 'Star Trails' }, collection: 'wallpaper', source: svg('stars', 'midnight', 127), orientation: 'landscape', artist: 'of', rating: 4.8, votes: 240, likes: 1520, days: 3, tags: ['dark', 'space'] },
  { id: 'corebox-midnight', title: { zh: 'CoreBox 午夜', en: 'CoreBox Midnight' }, collection: 'theme', source: svg('corebox', 'midnight', 131), orientation: 'landscape', artist: 'lq', rating: 4.9, votes: 402, likes: 3120, days: 5, tags: ['theme', 'dark'] },
  { id: 'corebox-daybreak', title: { zh: 'CoreBox 晨光', en: 'CoreBox Daybreak' }, collection: 'theme', source: svg('corebox', 'peach', 137), orientation: 'landscape', artist: 'ac', rating: 4.6, votes: 188, likes: 1240, days: 2, tags: ['theme', 'light'] },
  { id: 'graphite', title: { zh: '石墨', en: 'Graphite' }, collection: 'theme', source: svg('corebox', 'graphite', 139), orientation: 'landscape', artist: 'ks', rating: 4.7, votes: 260, likes: 1780, days: 11, tags: ['theme', 'dark', 'minimal'] },
  { id: 'sea-salt', title: { zh: '海盐', en: 'Sea Salt' }, collection: 'theme', source: svg('corebox', 'glacier', 149), orientation: 'landscape', artist: 'mo', rating: 4.4, votes: 97, likes: 612, days: 16, tags: ['theme', 'light'] },
  { id: 'lavender', title: { zh: '薰衣草', en: 'Lavender' }, collection: 'theme', source: svg('corebox', 'lilac', 151), orientation: 'landscape', artist: 'lm', rating: 4.5, votes: 120, likes: 834, days: 8, tags: ['theme', 'light'] },
  { id: 'evergreen', title: { zh: '常青', en: 'Evergreen' }, collection: 'theme', source: svg('corebox', 'forest', 157), orientation: 'landscape', artist: 'zy', rating: 4.3, votes: 84, likes: 520, days: 21, tags: ['theme', 'dark'] },
  { id: 'coral-theme', title: { zh: '珊瑚', en: 'Coral' }, collection: 'theme', source: svg('corebox', 'coral', 163), orientation: 'landscape', artist: 'nh', rating: 4.2, votes: 66, likes: 398, days: 25, tags: ['theme', 'light'] },
  { id: 'neon-theme', title: { zh: '霓虹', en: 'Neon' }, collection: 'theme', source: svg('corebox', 'neon', 167), orientation: 'landscape', artist: 'of', rating: 4.6, votes: 171, likes: 1302, days: 1, tags: ['theme', 'dark', 'retro'] },
  { id: 'paper', title: { zh: '纸张', en: 'Paper' }, collection: 'theme', source: svg('corebox', 'sand', 173), orientation: 'landscape', artist: 'lq', rating: 4.4, votes: 102, likes: 590, days: 13, tags: ['theme', 'light', 'minimal'] },
  { id: 'calendar-cover', title: { zh: '日历 · 31', en: 'Calendar · 31' }, collection: 'cover', source: { kind: 'asset', src: CalendarArt, palette: 'ember' }, orientation: 'square', artist: 'ac', rating: 4.8, votes: 150, likes: 990, days: 10, tags: ['icon'] },
  { id: 'clipboard-cover', title: { zh: '剪贴板历史', en: 'Clipboard History' }, collection: 'cover', source: svg('glyph', 'mint', 181, 'clip'), orientation: 'square', artist: 'ks', rating: 4.7, votes: 133, likes: 870, days: 6, tags: ['icon'] },
  { id: 'quick-actions-cover', title: { zh: '快速操作', en: 'Quick Actions' }, collection: 'cover', source: svg('glyph', 'ember', 191, 'bolt'), orientation: 'square', artist: 'mo', rating: 4.5, votes: 96, likes: 610, days: 14, tags: ['icon'] },
  { id: 'translate-cover', title: { zh: '翻译', en: 'Translate' }, collection: 'cover', source: svg('glyph', 'ocean', 193, 'globe'), orientation: 'square', artist: 'lm', rating: 4.6, votes: 124, likes: 760, days: 2, tags: ['icon'] },
  { id: 'window-presets-cover', title: { zh: '窗口预设', en: 'Window Presets' }, collection: 'cover', source: svg('glyph', 'lilac', 197, 'window'), orientation: 'square', artist: 'zy', rating: 4.3, votes: 71, likes: 402, days: 19, tags: ['icon'] },
  { id: 'workspace-scripts-cover', title: { zh: '工作区脚本', en: 'Workspace Scripts' }, collection: 'cover', source: svg('glyph', 'graphite', 199, 'bracket'), orientation: 'square', artist: 'of', rating: 4.4, votes: 88, likes: 505, days: 12, tags: ['icon'] },
  { id: 'browser-open-cover', title: { zh: '浏览器直达', en: 'Browser Open' }, collection: 'cover', source: svg('glyph', 'coral', 211, 'compass'), orientation: 'square', artist: 'nh', rating: 4.2, votes: 60, likes: 344, days: 29, tags: ['icon'] },
  { id: 'system-actions-cover', title: { zh: '系统操作', en: 'System Actions' }, collection: 'cover', source: svg('glyph', 'forest', 223, 'power'), orientation: 'square', artist: 'lq', rating: 4.1, votes: 54, likes: 290, days: 31, tags: ['icon'] },
  { id: 'clipboard-constellation', title: { zh: '剪贴板星座', en: 'Clipboard Constellation' }, collection: 'community', source: svg('stars', 'dusk', 227), orientation: 'landscape', artist: 'zy', rating: 4.9, votes: 280, likes: 1880, days: 1, tags: ['space', 'dark'] },
  { id: 'keyboard-haiku', title: { zh: '键盘俳句', en: 'Keyboard Haiku' }, collection: 'community', source: svg('keys', 'sand', 229), orientation: 'landscape', artist: 'lm', rating: 4.7, votes: 190, likes: 1210, days: 4, tags: ['minimal', 'light'] },
  { id: 'pixel-garden', title: { zh: '像素花园', en: 'Pixel Garden' }, collection: 'community', source: svg('pixels', 'matcha', 233), orientation: 'square', artist: 'ac', rating: 4.6, votes: 150, likes: 1044, days: 8, tags: ['pixel'] },
  { id: 'morning-desk', title: { zh: '晨间工作台', en: 'Morning Desk' }, collection: 'community', source: svg('dunes', 'peach', 239), orientation: 'portrait', artist: 'mo', rating: 4.5, votes: 115, likes: 760, days: 12, tags: ['light', 'landscape'] },
  { id: 'quiet-mode', title: { zh: '静默模式', en: 'Quiet Mode' }, collection: 'community', source: svg('rings', 'sand', 241), orientation: 'square', artist: 'nh', rating: 4.4, votes: 94, likes: 588, days: 17, tags: ['minimal', 'light'] },
]

// Rendered once; a reset rebuilds the list from these strings, not the SVGs.
const ART_URLS = new Map(ENTRIES.map(entry => [entry.id, renderArt(entry.source, entry.orientation)]))

function seedArtworks(): Artwork[] {
  return ENTRIES.map(entry => ({
    id: entry.id,
    title: entry.title,
    collection: entry.collection,
    source: entry.source,
    url: ART_URLS.get(entry.id)!,
    orientation: entry.orientation,
    pixels: entry.source.kind === 'asset' && entry.id === 'neon-dunes' ? [1199, 800] : PIXELS[entry.orientation],
    artist: entry.artist,
    rating: entry.rating,
    votes: entry.votes,
    likes: entry.likes,
    liked: false,
    myRating: 0,
    createdAt: NOW - entry.days * DAY,
    isNew: entry.days <= 3,
    tags: entry.tags,
  }))
}

function paletteOf(art: Artwork): string[] {
  return art.uploaded ? [] : [...PALETTES[art.source.palette].colors]
}

const variantCache = new Map<string, ImageGalleryItem[]>()

function variantsOf(art: Artwork): ImageGalleryItem[] {
  if (art.uploaded)
    return [{ id: `${art.id}-0`, url: art.url }]
  const cached = variantCache.get(art.id)
  if (cached)
    return cached
  const source = art.source
  const motif: Motif = source.kind === 'svg' && source.motif !== 'glyph' ? source.motif : 'orbs'
  const base = source.kind === 'svg' ? source.seed : 900 + art.id.length
  const variants: ImageGalleryItem[] = [{ id: `${art.id}-0`, url: art.url }]
  for (const [index, offset] of [7, 13, 29].entries()) {
    variants.push({
      id: `${art.id}-${index + 1}`,
      url: renderArt({ kind: 'svg', motif, palette: source.palette, seed: base + offset }, art.orientation === 'portrait' ? 'portrait' : 'square'),
    })
  }
  variantCache.set(art.id, variants)
  return variants
}

/* ─── Copy ────────────────────────────────────────────────────────────── */

const copy = computed(() => zh.value
  ? {
      frameTitle: 'Gallery 画廊',
      heading: '作品墙',
      source: 'Nexus 社区',
      works: (n: number) => `${n} 件作品`,
      creators: (n: number) => `${n} 位创作者`,
      collectionsLabel: '作品合集',
      likedToggle: (n: number) => `只看收藏（${n}）`,
      upload: '上传',
      uploadLabel: '上传作品',
      uploadTitle: '上传作品',
      uploadHint: '图片只在本页预览，不会离开你的浏览器。',
      uploadText: '选择图片',
      removeUpload: (name?: string) => `移除 ${name ?? '图片'}`,
      thumb: '缩略图',
      layout: { grid: '网格', masonry: '瀑布流', list: '列表' },
      layoutLabel: '布局',
      sort: { newest: '最新', rating: '评分最高', likes: '最多喜欢' },
      sortLabel: (label: string) => `排序：${label}`,
      count: (n: number) => `${n} 件`,
      isNew: '新',
      open: (title: string, artist: string) => `查看《${title}》，作者 ${artist}`,
      like: (title: string) => `收藏《${title}》`,
      liked: (title: string) => `已收藏《${title}》`,
      unliked: (title: string) => `已取消收藏《${title}》`,
      uploaded: (n: number) => `已上传 ${n} 件作品`,
      uploadRemoved: '已移除上传的作品',
      emptyTitle: '还没有收藏',
      emptyDesc: '在作品上点心形即可收藏，之后会出现在这里。',
      emptyAction: '浏览全部作品',
      toastLabel: '操作结果',
      dismiss: '关闭提示',
      side: { works: '作品', likes: '喜欢', rating: '平均评分', contributors: '创作者', tags: '热门标签', upload: '投稿' },
      detail: {
        by: (date: string) => `发布于 ${date}`,
        myRating: '你的评分',
        community: (rating: string, votes: number) => `社区 ${rating} · ${votes} 人评分`,
        star: (n: number) => `评 ${n} 星`,
        palette: '配色',
        copyHex: (hex: string) => `复制色值 ${hex}`,
        variants: '变体',
        setWallpaper: '设为壁纸',
        applyTheme: '应用主题',
        openStore: '在插件市场打开',
        copyColors: '复制色值',
        prev: '上一件',
        next: '下一件',
        position: (i: number, total: number) => `${i} / ${total}`,
        vector: '矢量',
        local: '本地预览',
        colors: (n: number) => `${n} 色`,
        wallpaperSet: '已设为桌面壁纸',
        themeApplied: '已应用到 CoreBox',
        storeOpened: '宿主会打开插件市场的对应页面',
        colorsCopied: (n: number) => `已复制 ${n} 个色值`,
        hexCopied: (hex: string) => `已复制 ${hex}`,
        rated: (n: number) => `已评 ${n} 星，谢谢`,
        feedback: '操作结果',
        variantPrev: '上一张',
        variantNext: '下一张',
        variantTitle: '变体预览',
        variantName: (i: number) => (i === 0 ? '原图' : `变体 ${String.fromCharCode(64 + i)}`),
        variantOpen: (label: string) => `放大查看 ${label}`,
      },
    }
  : {
      frameTitle: 'Gallery',
      heading: 'Showcase wall',
      source: 'Nexus community',
      works: (n: number) => `${n} pieces`,
      creators: (n: number) => `${n} creators`,
      collectionsLabel: 'Collections',
      likedToggle: (n: number) => `Favourites only (${n})`,
      upload: 'Upload',
      uploadLabel: 'Upload artwork',
      uploadTitle: 'Upload artwork',
      uploadHint: 'Images are previewed on this page only; nothing leaves your browser.',
      uploadText: 'Choose images',
      removeUpload: (name?: string) => `Remove ${name ?? 'image'}`,
      thumb: 'Size',
      layout: { grid: 'Grid', masonry: 'Masonry', list: 'List' },
      layoutLabel: 'Layout',
      sort: { newest: 'Newest', rating: 'Top rated', likes: 'Most liked' },
      sortLabel: (label: string) => `Sort: ${label}`,
      count: (n: number) => `${n} shown`,
      isNew: 'New',
      open: (title: string, artist: string) => `View ${title} by ${artist}`,
      like: (title: string) => `Favourite ${title}`,
      liked: (title: string) => `Added ${title} to favourites`,
      unliked: (title: string) => `Removed ${title} from favourites`,
      uploaded: (n: number) => (n > 1 ? `Uploaded ${n} pieces` : 'Uploaded 1 piece'),
      uploadRemoved: 'Removed the upload',
      emptyTitle: 'No favourites yet',
      emptyDesc: 'Tap the heart on any piece and it will show up here.',
      emptyAction: 'Browse everything',
      toastLabel: 'Result',
      dismiss: 'Dismiss',
      side: { works: 'Pieces', likes: 'Likes', rating: 'Avg. rating', contributors: 'Creators', tags: 'Popular tags', upload: 'Submit' },
      detail: {
        by: (date: string) => `Published ${date}`,
        myRating: 'Your rating',
        community: (rating: string, votes: number) => `Community ${rating} · ${votes} ratings`,
        star: (n: number) => `Rate ${n} star${n > 1 ? 's' : ''}`,
        palette: 'Palette',
        copyHex: (hex: string) => `Copy ${hex}`,
        variants: 'Variants',
        setWallpaper: 'Set as wallpaper',
        applyTheme: 'Apply theme',
        openStore: 'Open in the store',
        copyColors: 'Copy colours',
        prev: 'Previous piece',
        next: 'Next piece',
        position: (i: number, total: number) => `${i} of ${total}`,
        vector: 'vector',
        local: 'local preview',
        colors: (n: number) => `${n} colours`,
        wallpaperSet: 'Set as your desktop wallpaper',
        themeApplied: 'Applied to CoreBox',
        storeOpened: 'The host would open this plugin in the store',
        colorsCopied: (n: number) => `Copied ${n} colours`,
        hexCopied: (hex: string) => `Copied ${hex}`,
        rated: (n: number) => `Rated ${n} star${n > 1 ? 's' : ''}, thanks`,
        feedback: 'Result',
        variantPrev: 'Previous image',
        variantNext: 'Next image',
        variantTitle: 'Variant preview',
        variantName: (i: number) => (i === 0 ? 'Original' : `Variant ${String.fromCharCode(64 + i)}`),
        variantOpen: (label: string) => `Enlarge ${label}`,
      },
    })

/* ─── Stage ───────────────────────────────────────────────────────────── */

const stageWidth = ref(0)

function onStageResize(width: number): void {
  stageWidth.value = width
}

const mode = computed<Mode>(() => {
  const width = stageWidth.value
  if (!width)
    return 'column'
  if (width < 640)
    return 'narrow'
  return width < 960 ? 'column' : 'wide'
})

/* ─── State ───────────────────────────────────────────────────────────── */

const artworks = ref<Artwork[]>(seedArtworks())
const collection = ref<CollectionFilter>('all')
const onlyLiked = ref(false)
const layout = ref<Layout>('grid')
const sortKey = ref<SortKey>('newest')
const thumbSize = ref<ThumbSize>('m')

const THUMB_MIN: Record<ThumbSize, number> = { s: 118, m: 150, l: 196, xl: 256 }
const SORT_KEYS: SortKey[] = ['newest', 'rating', 'likes']
const SORT_ICON: Record<SortKey, string> = { newest: 'i-carbon-time', rating: 'i-carbon-star', likes: 'i-carbon-favorite' }

const sizeSegments: SegmentedSliderSegment[] = [
  { value: 's', label: 'S' },
  { value: 'm', label: 'M' },
  { value: 'l', label: 'L' },
  { value: 'xl', label: 'XL' },
]

const inCollection = computed(() => artworks.value.filter(art =>
  (collection.value === 'all' || art.collection === collection.value) && (!onlyLiked.value || art.liked),
))

const visible = computed(() => {
  const list = inCollection.value.slice()
  if (sortKey.value === 'rating')
    return list.sort((a, b) => b.rating - a.rating || b.votes - a.votes)
  if (sortKey.value === 'likes')
    return list.sort((a, b) => b.likes - a.likes)
  return list.sort((a, b) => b.createdAt - a.createdAt)
})

const likedCount = computed(() => artworks.value.filter(art => art.liked).length)

const collectionItems = computed<FilterChipItem[]>(() => (Object.keys(COLLECTIONS) as CollectionFilter[]).map(key => ({
  value: key,
  label: L(COLLECTIONS[key].label),
  dot: COLLECTIONS[key].dot || undefined,
  // Derived from the same filter the wall applies, favourites included.
  count: artworks.value.filter(art => (key === 'all' || art.collection === key) && (!onlyLiked.value || art.liked)).length,
})))

const contributors = computed(() => {
  const seen = new Set<ArtistId>()
  for (const art of inCollection.value) {
    if (art.artist !== 'you')
      seen.add(art.artist)
  }
  return [...seen]
})

const collectionStats = computed(() => {
  const list = inCollection.value
  const likes = list.reduce((sum, art) => sum + art.likes, 0)
  const rated = list.filter(art => art.votes > 0)
  const average = rated.length ? rated.reduce((sum, art) => sum + art.rating, 0) / rated.length : 0
  const tagCounts = new Map<TagKey, number>()
  for (const art of list) {
    for (const tag of art.tags)
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  }
  const tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([tag]) => tag)
  return { works: list.length, likes, average, tags }
})

const compact = computed(() => new Intl.NumberFormat(zh.value ? 'zh-CN' : 'en', { notation: 'compact', maximumFractionDigits: 1 }))
const dateFormat = computed(() => new Intl.DateTimeFormat(zh.value ? 'zh-CN' : 'en', { month: 'short', day: 'numeric', timeZone: 'Asia/Shanghai' }))

function artistName(id: ArtistId): string {
  return L(ARTISTS[id].name)
}

function avatarColors(id: ArtistId): { bg: string, ink: string } {
  const hue = ARTISTS[id].hue
  return {
    bg: `color-mix(in srgb, ${hue} 22%, var(--tx-bg-color, #fff))`,
    ink: `color-mix(in srgb, ${hue} 78%, var(--tx-text-color-primary, #303133))`,
  }
}

function displayRating(value: number): number {
  return Math.round(value * 2) / 2
}

/* ─── Entrance (TxStagger) ────────────────────────────────────────────── */

// TxStagger reads `appear` once, when it mounts. The wall renders still before
// the stage is on screen, and each replay swaps the key so a fresh group plays.
const staggerKey = ref(0)
const staggerAppear = ref(false)
const scrollHost = ref<HTMLElement | null>(null)

function playEntrance(): void {
  staggerAppear.value = !prefersReducedMotion()
  staggerKey.value += 1
}

function scrollWallTop(): void {
  const viewport = scrollHost.value?.querySelector<HTMLElement>('.tx-edge-fade-mask__viewport')
  if (viewport)
    viewport.scrollTop = 0
}

function onEnter(): void {
  playEntrance()
}

watch([collection, onlyLiked, layout, sortKey], () => {
  scrollWallTop()
  playEntrance()
})

/* ─── Toasts ──────────────────────────────────────────────────────────── */

const wallToast = reactive({ open: false, text: '', icon: 'i-carbon-favorite-filled' })
const detailToast = reactive({ open: false, text: '', icon: 'i-carbon-checkmark-outline' })
let wallTimer: ReturnType<typeof setTimeout> | undefined
let detailTimer: ReturnType<typeof setTimeout> | undefined

function notifyWall(text: string, icon: string): void {
  wallToast.text = text
  wallToast.icon = icon
  wallToast.open = true
  clearTimeout(wallTimer)
  wallTimer = setTimeout(() => {
    wallToast.open = false
  }, 2600)
}

// The detail modal covers the wall, so its feedback is drawn inside it.
function notifyDetail(text: string, icon: string): void {
  detailToast.text = text
  detailToast.icon = icon
  detailToast.open = true
  clearTimeout(detailTimer)
  detailTimer = setTimeout(() => {
    detailToast.open = false
  }, 2400)
}

/* ─── Actions ─────────────────────────────────────────────────────────── */

function toggleLike(art: Artwork, where: 'wall' | 'detail' = 'wall'): void {
  art.liked = !art.liked
  art.likes += art.liked ? 1 : -1
  const text = art.liked ? copy.value.liked(L(art.title)) : copy.value.unliked(L(art.title))
  const icon = art.liked ? 'i-carbon-favorite-filled' : 'i-carbon-favorite'
  if (where === 'detail')
    notifyDetail(text, icon)
  else
    notifyWall(text, icon)
}

function onCollectionChange(value: FilterChipValue): void {
  collection.value = value as CollectionFilter
}

function onThumbSize(value: number | string): void {
  thumbSize.value = value as ThumbSize
}

async function writeClipboard(text: string): Promise<void> {
  if (!hasNavigator())
    return
  try {
    await navigator.clipboard.writeText(text)
  }
  catch {
    // Clipboard access can be denied; the feedback still confirms the intent.
  }
}

/* ─── Detail ──────────────────────────────────────────────────────────── */

const detailOpen = ref(false)
const detailId = ref<string | null>(null)
const detailRef = ref<HTMLElement | null>(null)

const detailIndex = computed(() => visible.value.findIndex(art => art.id === detailId.value))
const current = computed(() => (detailId.value ? artworks.value.find(art => art.id === detailId.value) ?? null : null))
const currentVariants = computed(() => (current.value ? variantsOf(current.value) : []))

function openDetail(id: string): void {
  detailId.value = id
  detailToast.open = false
  detailOpen.value = true
  // TxModal focuses its overlay one tick after its props update, and ←/→ are
  // handled on the detail inside it: two ticks later, move focus one level
  // down so the arrows work straight away. Only ever reached from the
  // reader's own click or key press.
  void nextTick()
    .then(() => nextTick())
    .then(() => detailRef.value?.focus({ preventScroll: true }))
}

function step(delta: number): void {
  const list = visible.value
  if (!list.length)
    return
  const index = detailIndex.value < 0 ? 0 : detailIndex.value
  const next = list[(index + delta + list.length) % list.length]
  if (next)
    detailId.value = next.id
}

// ←/→ belong to the detail only while it is open, and only on its own root —
// never on document, where they would steal the docs page's own keys.
function onDetailKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey)
    return
  const target = event.target as HTMLElement | null
  if (target?.closest('[role="radiogroup"], input, textarea'))
    return
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    step(event.key === 'ArrowLeft' ? -1 : 1)
  }
}

function primaryAction(art: Artwork): void {
  if (art.collection === 'theme')
    notifyDetail(copy.value.detail.themeApplied, 'i-carbon-paint-brush')
  else if (art.collection === 'cover')
    notifyDetail(copy.value.detail.storeOpened, 'i-carbon-launch')
  else
    notifyDetail(copy.value.detail.wallpaperSet, 'i-carbon-screen')
}

function primaryLabel(art: Artwork): { text: string, icon: string } {
  if (art.collection === 'theme')
    return { text: copy.value.detail.applyTheme, icon: 'i-carbon-paint-brush' }
  if (art.collection === 'cover')
    return { text: copy.value.detail.openStore, icon: 'i-carbon-launch' }
  return { text: copy.value.detail.setWallpaper, icon: 'i-carbon-screen' }
}

async function copyColors(art: Artwork): Promise<void> {
  const colors = paletteOf(art)
  await writeClipboard(colors.join(', '))
  notifyDetail(copy.value.detail.colorsCopied(colors.length), 'i-carbon-color-palette')
}

async function copyHex(hex: string): Promise<void> {
  await writeClipboard(hex)
  notifyDetail(copy.value.detail.hexCopied(hex), 'i-carbon-copy')
}

function rate(art: Artwork, value: number): void {
  if (!art.myRating)
    art.votes += 1
  art.myRating = value
  notifyDetail(copy.value.detail.rated(value), 'i-carbon-star-filled')
}

function captionOf(art: Artwork): string {
  const [w, h] = art.pixels
  if (art.uploaded)
    return w ? `${w} × ${h} · ${copy.value.detail.local}` : copy.value.detail.local
  const kind = art.source.kind === 'svg' ? `SVG · ${copy.value.detail.vector}` : 'JPG'
  return `${w} × ${h} · ${kind} · ${copy.value.detail.colors(paletteOf(art).length)}`
}

/* ─── Uploads ─────────────────────────────────────────────────────────── */

const uploadOpen = ref(false)
const uploads = ref<ImageUploaderFile[]>([])
// The template owns these URLs: the uploaders revoke only their own on
// unmount, and a card must outlive the popover that produced it.
const ownedUrls = new Map<string, string>()

function detectOrientation(id: string, url: string): void {
  if (!hasWindow())
    return
  const probe = new Image()
  probe.onload = () => {
    const art = artworks.value.find(item => item.id === id)
    if (!art)
      return
    const ratio = probe.naturalWidth / Math.max(1, probe.naturalHeight)
    art.orientation = ratio > 1.15 ? 'landscape' : ratio < 0.87 ? 'portrait' : 'square'
    art.pixels = [probe.naturalWidth, probe.naturalHeight]
  }
  probe.src = url
}

function onUploads(next: ImageUploaderFile[]): void {
  let added = 0
  const target: Collection = collection.value === 'all' ? 'community' : collection.value
  for (const item of next) {
    if (ownedUrls.has(item.id))
      continue
    const url = item.file ? URL.createObjectURL(item.file) : item.url
    ownedUrls.set(item.id, url)
    const name = (item.name ?? item.file?.name ?? 'image').replace(/\.[a-z0-9]+$/i, '')
    const id = `upload-${item.id}`
    artworks.value.unshift({
      id,
      title: { zh: name, en: name },
      collection: target,
      source: { kind: 'asset', src: url, palette: 'graphite' },
      url,
      orientation: 'square',
      pixels: [0, 0],
      artist: 'you',
      rating: 0,
      votes: 0,
      likes: 0,
      liked: false,
      myRating: 0,
      createdAt: NOW + 1,
      isNew: true,
      tags: [],
      uploaded: true,
    })
    detectOrientation(id, url)
    added += 1
  }

  const alive = new Set(next.map(item => item.id))
  let removed = 0
  for (const [id, url] of [...ownedUrls]) {
    if (alive.has(id))
      continue
    ownedUrls.delete(id)
    if (url.startsWith('blob:'))
      URL.revokeObjectURL(url)
    artworks.value = artworks.value.filter(art => art.id !== `upload-${id}`)
    removed += 1
  }

  uploads.value = next.map(item => ({ ...item, url: ownedUrls.get(item.id) ?? item.url }))
  if (added)
    notifyWall(copy.value.uploaded(added), 'i-carbon-cloud-upload')
  else if (removed)
    notifyWall(copy.value.uploadRemoved, 'i-carbon-trash-can')
}

function releaseUploads(): void {
  for (const url of ownedUrls.values()) {
    if (url.startsWith('blob:'))
      URL.revokeObjectURL(url)
  }
  ownedUrls.clear()
  uploads.value = []
}

/* ─── Reset ───────────────────────────────────────────────────────────── */

async function resetDemo(): Promise<void> {
  clearTimeout(wallTimer)
  clearTimeout(detailTimer)
  wallToast.open = false
  detailToast.open = false
  detailOpen.value = false
  uploadOpen.value = false
  releaseUploads()
  artworks.value = seedArtworks()
  collection.value = 'all'
  onlyLiked.value = false
  layout.value = 'grid'
  sortKey.value = 'newest'
  thumbSize.value = 'm'
  await nextTick()
  scrollWallTop()
  playEntrance()
}

defineExpose({ resetDemo })

onBeforeUnmount(() => {
  clearTimeout(wallTimer)
  clearTimeout(detailTimer)
  releaseUploads()
})
</script>

<template>
  <TemplateFrame :title="copy.frameTitle" :height="580" @enter="onEnter">
    <template #default="{ width: stageW, height: stageH }">
      <StageSize :width="stageW" :height="stageH" @resize="onStageResize" />
      <div class="gallery" :class="`is-${mode}`" :style="{ '--thumb-min': `${THUMB_MIN[thumbSize]}px` }">
        <header class="gallery__head">
          <div class="gallery__heading">
            <span class="gallery__logo" aria-hidden="true"><span class="i-carbon-image-copy" /></span>
            <div class="gallery__heading-text">
              <span class="gallery__title-row">
                <strong class="gallery__title">{{ copy.heading }}</strong>
                <TxBadge :value="artworks.length" />
              </span>
              <span class="gallery__subtitle">{{ copy.source }} · {{ copy.works(artworks.length) }}</span>
            </div>
          </div>
          <div class="gallery__tools">
            <span v-if="mode !== 'narrow'" class="gallery__crew">
              <TxAvatarGroup :max="3" :size="26" :overlap="7">
                <TxAvatar
                  v-for="id in contributors"
                  :key="id"
                  :name="artistName(id)"
                  :background-color="avatarColors(id).bg"
                  :text-color="avatarColors(id).ink"
                />
              </TxAvatarGroup>
              <span class="gallery__crew-label">{{ copy.creators(contributors.length) }}</span>
            </span>
            <TxTooltip :content="copy.likedToggle(likedCount)">
              <TxIconButton
                shape="pill"
                size="sm"
                :pressed="onlyLiked"
                :label="copy.likedToggle(likedCount)"
                @click="onlyLiked = !onlyLiked"
              >
                <span class="gallery__liked-inner">
                  <span :class="onlyLiked ? 'i-carbon-favorite-filled' : 'i-carbon-favorite'" aria-hidden="true" />
                  <span class="gallery__liked-count">{{ likedCount }}</span>
                </span>
              </TxIconButton>
            </TxTooltip>
            <TxPopover v-if="mode !== 'wide'" v-model="uploadOpen" placement="bottom-end" :width="300">
              <template #reference>
                <TxTooltip :content="copy.uploadLabel">
                  <TxIconButton icon="i-carbon-upload" size="sm" :label="copy.uploadLabel" />
                </TxTooltip>
              </template>
              <div class="gallery-upload">
                <strong class="gallery-upload__title">{{ copy.uploadTitle }}</strong>
                <p class="gallery-upload__hint">
                  {{ copy.uploadHint }}
                </p>
                <TxImageUploader
                  :model-value="uploads"
                  :max="6"
                  :upload-text="copy.uploadText"
                  :remove-label="copy.removeUpload"
                  @update:model-value="onUploads"
                />
              </div>
            </TxPopover>
          </div>
        </header>

        <div class="gallery__chips">
          <TxFilterChips
            :model-value="collection"
            :items="collectionItems"
            role="tablist"
            :aria-label="copy.collectionsLabel"
            @update:model-value="onCollectionChange"
          />
        </div>

        <section class="gallery__wall">
          <div class="gallery__toolbar">
            <TxGlassSurface width="100%" :height="46" :border-radius="14" :background-opacity="0.62" :blur="14">
              <div class="gallery-toolbar">
                <div v-if="mode !== 'narrow'" class="gallery-toolbar__size">
                  <span class="gallery-toolbar__label">{{ copy.thumb }}</span>
                  <div class="gallery-toolbar__slider">
                    <TxSegmentedSlider
                      :model-value="thumbSize"
                      :segments="sizeSegments"
                      :show-labels="false"
                      @update:model-value="onThumbSize"
                    />
                  </div>
                  <span class="gallery-toolbar__value">{{ thumbSize.toUpperCase() }}</span>
                </div>
                <span v-if="mode !== 'narrow'" class="gallery-toolbar__rule" aria-hidden="true" />
                <TxFlatRadio v-model="layout" size="sm" :aria-label="copy.layoutLabel">
                  <TxFlatRadioItem value="grid" icon="i-carbon-grid" :aria-label="copy.layout.grid" :title="copy.layout.grid" />
                  <TxFlatRadioItem value="masonry" icon="i-carbon-column" :aria-label="copy.layout.masonry" :title="copy.layout.masonry" />
                  <TxFlatRadioItem value="list" icon="i-carbon-list" :aria-label="copy.layout.list" :title="copy.layout.list" />
                </TxFlatRadio>
                <span class="gallery-toolbar__rule" aria-hidden="true" />
                <TxDropdownMenu placement="bottom-start" :min-width="168">
                  <template #trigger>
                    <button type="button" class="gallery-toolbar__sort" aria-haspopup="menu">
                      <span class="i-carbon-sort-descending" aria-hidden="true" />
                      {{ copy.sortLabel(copy.sort[sortKey]) }}
                      <span class="i-carbon-chevron-down gallery-toolbar__chevron" aria-hidden="true" />
                    </button>
                  </template>
                  <TxDropdownItem v-for="key in SORT_KEYS" :key="key" @select="sortKey = key">
                    <span class="gallery-menu-item">
                      <span :class="SORT_ICON[key]" aria-hidden="true" />
                      {{ copy.sort[key] }}
                    </span>
                    <template v-if="key === sortKey" #right>
                      <span class="i-carbon-checkmark gallery-menu-check" aria-hidden="true" />
                    </template>
                  </TxDropdownItem>
                </TxDropdownMenu>
                <span v-if="mode !== 'narrow'" class="gallery-toolbar__count">{{ copy.count(visible.length) }}</span>
              </div>
            </TxGlassSurface>
          </div>

          <div ref="scrollHost" class="gallery__scroll">
            <TxEdgeFadeMask axis="vertical" :size="28">
              <div class="gallery__content" :class="`is-${layout}`">
                <TxStagger
                  v-if="visible.length"
                  :key="staggerKey"
                  tag="ul"
                  class="gallery-grid"
                  :appear="staggerAppear"
                  :duration="280"
                  :delay-step="28"
                >
                  <li
                    v-for="art in visible"
                    :key="art.id"
                    class="gallery-card"
                    :class="[`is-${art.orientation}`, { 'is-liked': art.liked }]"
                  >
                    <div class="gallery-card__media">
                      <button
                        type="button"
                        class="gallery-card__open"
                        :aria-label="copy.open(L(art.title), artistName(art.artist))"
                        @click="openDetail(art.id)"
                      >
                        <img :src="art.url" alt="" loading="lazy" decoding="async" draggable="false">
                      </button>
                      <div v-if="layout !== 'list'" class="gallery-card__scrim" aria-hidden="true">
                        <TxRating v-if="art.votes" :model-value="displayRating(art.rating)" readonly :size="12" :gap="1" :precision="0.5" />
                        <span v-if="art.votes" class="gallery-card__score">{{ art.rating.toFixed(1) }}</span>
                        <span class="gallery-card__tag">{{ L(COLLECTIONS[art.collection].label) }}</span>
                      </div>
                      <span v-if="art.isNew && layout !== 'list'" class="gallery-card__new">
                        <TxBadge variant="primary">{{ copy.isNew }}</TxBadge>
                      </span>
                      <span v-if="layout !== 'list'" class="gallery-card__like">
                        <TxIconButton
                          size="xs"
                          shape="circle"
                          :icon="art.liked ? 'i-carbon-favorite-filled' : 'i-carbon-favorite'"
                          :pressed="art.liked"
                          :label="copy.like(L(art.title))"
                          @click="toggleLike(art)"
                        />
                      </span>
                    </div>
                    <div class="gallery-card__meta">
                      <span class="gallery-card__title">
                        {{ L(art.title) }}
                        <TxBadge v-if="art.isNew && layout === 'list'" variant="primary">{{ copy.isNew }}</TxBadge>
                      </span>
                      <span class="gallery-card__byline">
                        <TxAvatar
                          :name="artistName(art.artist)"
                          :size="18"
                          :background-color="avatarColors(art.artist).bg"
                          :text-color="avatarColors(art.artist).ink"
                        />
                        <span class="gallery-card__artist">{{ artistName(art.artist) }}</span>
                        <span class="gallery-card__likes">
                          <span :class="art.liked ? 'i-carbon-favorite-filled' : 'i-carbon-favorite'" aria-hidden="true" />
                          {{ compact.format(art.likes) }}
                        </span>
                      </span>
                    </div>
                    <div v-if="layout === 'list'" class="gallery-card__extra">
                      <TxTag :label="L(COLLECTIONS[art.collection].label)" :color="COLLECTIONS[art.collection].dot" variant="soft" />
                      <span v-if="art.votes" class="gallery-card__rating">
                        <TxRating :model-value="displayRating(art.rating)" readonly :size="12" :gap="1" :precision="0.5" :star-label="copy.detail.star" />
                        {{ art.rating.toFixed(1) }}
                      </span>
                      <TxIconButton
                        size="xs"
                        :icon="art.liked ? 'i-carbon-favorite-filled' : 'i-carbon-favorite'"
                        :pressed="art.liked"
                        :label="copy.like(L(art.title))"
                        @click="toggleLike(art)"
                      />
                    </div>
                  </li>
                </TxStagger>
                <TxEmptyState
                  v-else
                  variant="custom"
                  size="small"
                  :title="copy.emptyTitle"
                  :description="copy.emptyDesc"
                  :primary-action="{ label: copy.emptyAction, icon: 'i-carbon-image-copy' }"
                  @primary="onlyLiked = false"
                >
                  <template #icon>
                    <span class="gallery-empty-icon i-carbon-favorite" aria-hidden="true" />
                  </template>
                </TxEmptyState>
              </div>
            </TxEdgeFadeMask>
          </div>

          <div class="gallery__toast" :class="{ 'is-open': wallToast.open }">
            <TxToastPanel :open="wallToast.open" :tether="false" :stack="0" :aria-label="copy.toastLabel">
              <div class="gallery-toast">
                <span class="gallery-toast__icon" :class="wallToast.icon" aria-hidden="true" />
                <span class="gallery-toast__text">{{ wallToast.text }}</span>
                <button type="button" class="gallery-toast__close" :aria-label="copy.dismiss" @click="wallToast.open = false">
                  <span class="i-carbon-close" aria-hidden="true" />
                </button>
              </div>
            </TxToastPanel>
          </div>
        </section>

        <aside v-if="mode === 'wide'" class="gallery__side">
          <div class="gallery-side__intro">
            <span class="gallery-side__icon" aria-hidden="true"><span :class="COLLECTIONS[collection].icon" /></span>
            <div>
              <strong class="gallery-side__title">{{ L(COLLECTIONS[collection].label) }}</strong>
              <p class="gallery-side__blurb">
                {{ L(COLLECTIONS[collection].blurb) }}
              </p>
            </div>
          </div>

          <dl class="gallery-side__stats">
            <div>
              <dt>{{ copy.side.works }}</dt>
              <dd>{{ collectionStats.works }}</dd>
            </div>
            <div>
              <dt>{{ copy.side.likes }}</dt>
              <dd>{{ compact.format(collectionStats.likes) }}</dd>
            </div>
            <div>
              <dt>{{ copy.side.rating }}</dt>
              <dd>{{ collectionStats.average ? collectionStats.average.toFixed(1) : '—' }}</dd>
            </div>
          </dl>

          <div class="gallery-side__block">
            <span class="gallery-side__label">{{ copy.side.contributors }}</span>
            <div class="gallery-side__crew">
              <TxAvatarGroup :max="6" :size="28" :overlap="8">
                <TxAvatar
                  v-for="id in contributors"
                  :key="id"
                  :name="artistName(id)"
                  :background-color="avatarColors(id).bg"
                  :text-color="avatarColors(id).ink"
                />
              </TxAvatarGroup>
              <span class="gallery-side__muted">{{ copy.creators(contributors.length) }}</span>
            </div>
          </div>

          <div v-if="collectionStats.tags.length" class="gallery-side__block">
            <span class="gallery-side__label">{{ copy.side.tags }}</span>
            <div class="gallery-side__tags">
              <TxTag v-for="tag in collectionStats.tags" :key="tag" :label="`#${L(TAGS[tag])}`" variant="plain" />
            </div>
          </div>

          <div class="gallery-side__block gallery-side__upload">
            <span class="gallery-side__label">{{ copy.side.upload }}</span>
            <p class="gallery-side__muted">
              {{ copy.uploadHint }}
            </p>
            <TxImageUploader
              :model-value="uploads"
              :max="6"
              :upload-text="copy.uploadText"
              :remove-label="copy.removeUpload"
              @update:model-value="onUploads"
            />
          </div>
        </aside>

        <TxModal v-model="detailOpen" :title="current ? L(current.title) : ''" width="min(960px, calc(100vw - 48px))">
          <div v-if="current" ref="detailRef" class="gallery-detail" tabindex="-1" @keydown="onDetailKeydown">
            <div class="gallery-detail__media">
              <div class="gallery-detail__stage">
                <img :src="current.url" :alt="L(current.title)" draggable="false">
                <span class="gallery-detail__nav is-prev">
                  <TxIconButton icon="i-carbon-chevron-left" shape="circle" size="sm" :label="copy.detail.prev" @click="step(-1)" />
                </span>
                <span class="gallery-detail__nav is-next">
                  <TxIconButton icon="i-carbon-chevron-right" shape="circle" size="sm" :label="copy.detail.next" @click="step(1)" />
                </span>
              </div>
              <div class="gallery-detail__caption">
                <span>{{ captionOf(current) }}</span>
                <span class="gallery-detail__position">{{ copy.detail.position(detailIndex + 1, visible.length) }}</span>
              </div>
            </div>

            <div class="gallery-detail__info">
              <div class="gallery-detail__artist">
                <TxAvatar
                  :name="artistName(current.artist)"
                  :size="34"
                  :background-color="avatarColors(current.artist).bg"
                  :text-color="avatarColors(current.artist).ink"
                />
                <div class="gallery-detail__artist-text">
                  <strong>{{ artistName(current.artist) }}</strong>
                  <span>{{ copy.detail.by(dateFormat.format(current.createdAt)) }}</span>
                </div>
                <TxIconButton
                  :icon="current.liked ? 'i-carbon-favorite-filled' : 'i-carbon-favorite'"
                  :pressed="current.liked"
                  size="sm"
                  :label="copy.like(L(current.title))"
                  @click="toggleLike(current, 'detail')"
                />
              </div>

              <div class="gallery-detail__rating">
                <span class="gallery-detail__label">{{ copy.detail.myRating }}</span>
                <TxRating
                  :model-value="current.myRating"
                  :size="20"
                  :star-label="copy.detail.star"
                  @update:model-value="rate(current, $event)"
                />
                <span v-if="current.votes" class="gallery-detail__muted">{{ copy.detail.community(current.rating.toFixed(1), current.votes) }}</span>
              </div>

              <div v-if="current.tags.length" class="gallery-detail__tags">
                <TxTag :label="L(COLLECTIONS[current.collection].label)" :color="COLLECTIONS[current.collection].dot" variant="soft" />
                <TxTag v-for="tag in current.tags" :key="tag" :label="L(TAGS[tag])" variant="plain" />
              </div>

              <div v-if="paletteOf(current).length" class="gallery-detail__palette">
                <span class="gallery-detail__label">{{ copy.detail.palette }}</span>
                <div class="gallery-detail__swatches">
                  <button
                    v-for="hex in paletteOf(current)"
                    :key="hex"
                    type="button"
                    class="gallery-detail__swatch"
                    :aria-label="copy.detail.copyHex(hex)"
                    @click="copyHex(hex)"
                  >
                    <span class="gallery-detail__chip" :style="{ background: hex }" aria-hidden="true" />
                    <span class="gallery-detail__hex">{{ hex.toUpperCase() }}</span>
                  </button>
                </div>
              </div>

              <div class="gallery-detail__actions">
                <TxButton variant="primary" size="sm" :icon="primaryLabel(current).icon" @click="primaryAction(current)">
                  {{ primaryLabel(current).text }}
                </TxButton>
                <TxButton v-if="paletteOf(current).length" variant="secondary" size="sm" icon="i-carbon-color-palette" @click="copyColors(current)">
                  {{ copy.detail.copyColors }}
                </TxButton>
                <!-- Hangs under the buttons that produced it; the modal hides the wall's own toast. -->
                <div class="gallery-detail__toast" :class="{ 'is-open': detailToast.open }">
                  <TxToastPanel :open="detailToast.open" :stack="0" :tether-length="10" :aria-label="copy.detail.feedback">
                    <div class="gallery-toast">
                      <span class="gallery-toast__icon" :class="detailToast.icon" aria-hidden="true" />
                      <span class="gallery-toast__text">{{ detailToast.text }}</span>
                    </div>
                  </TxToastPanel>
                </div>
              </div>

              <div class="gallery-detail__variants">
                <span class="gallery-detail__label">{{ copy.detail.variants }}</span>
                <TxImageGallery
                  :items="currentVariants"
                  :preview-title="copy.detail.variantTitle"
                  :previous-label="copy.detail.variantPrev"
                  :next-label="copy.detail.variantNext"
                  :previous-text="copy.detail.variantPrev"
                  :next-text="copy.detail.variantNext"
                  :item-label-formatter="copy.detail.variantName"
                  :open-label-formatter="copy.detail.variantOpen"
                />
              </div>
            </div>
          </div>
        </TxModal>
      </div>
    </template>
  </TemplateFrame>
</template>

<style scoped>
.gallery {
  display: grid;
  height: 100%;
  box-sizing: border-box;
  grid-template-areas:
    'head'
    'chips'
    'wall';
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto minmax(0, 1fr);
  padding: 14px 16px 16px;
  background: var(--tx-bg-color, #fff);
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
}

/* Header ---------------------------------------------------------------- */

.gallery__head {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  grid-area: head;
}

.gallery__heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.gallery__logo {
  display: inline-flex;
  width: 32px;
  height: 32px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: color-mix(in srgb, var(--tx-chart-categorical-3, #e8649d) 14%, var(--tx-bg-color, #fff));
  color: color-mix(in srgb, var(--tx-chart-categorical-3, #e8649d) 80%, var(--tx-text-color-primary, #303133));
  font-size: 15px;
}

.gallery__heading-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.gallery__title-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.gallery__title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}

.gallery__subtitle {
  overflow: hidden;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gallery__tools {
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
}

.gallery__crew {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.gallery__crew-label {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.gallery__liked-inner {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.gallery__tools :deep(.tx-icon-button.is-pressed) {
  color: var(--tx-bui-red, #e3474c);
}

.gallery-upload {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gallery-upload__title {
  font-size: 13px;
  font-weight: 600;
}

.gallery-upload__hint {
  margin: 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  line-height: 1.5;
}

.gallery__chips {
  min-width: 0;
  padding-top: 10px;
  grid-area: chips;
}

/* Wall ------------------------------------------------------------------- */

.gallery__wall {
  position: relative;
  min-width: 0;
  min-height: 0;
  margin-top: 6px;
  overflow: hidden;
  border-radius: 16px;
  background: var(--tx-fill-color-lighter, #fafafa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  grid-area: wall;
}

.gallery__toolbar {
  position: absolute;
  z-index: 3;
  top: 10px;
  right: 10px;
  left: 10px;
}

.gallery-toolbar {
  display: flex;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  align-items: center;
  gap: 12px;
  padding: 0 8px 0 14px;
  color: var(--tx-text-color-primary, #303133);
}

.gallery-toolbar__size {
  display: flex;
  align-items: center;
  gap: 10px;
}

.gallery-toolbar__label,
.gallery-toolbar__count {
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
  white-space: nowrap;
}

.gallery-toolbar__count {
  margin-left: auto;
  padding-right: 6px;
  font-variant-numeric: tabular-nums;
}

.gallery-toolbar__slider {
  width: 96px;
  padding: 0 10px;
}

.gallery-toolbar__slider :deep(.tx-segmented-slider) {
  --tx-segmented-slider-height: 20px;
  --tx-segmented-slider-dot-size: 12px;
  --tx-segmented-slider-dot-active-size: 16px;

  min-height: 20px;
  padding: 2px 0;
}

.gallery-toolbar__value {
  min-width: 18px;
  color: var(--tx-text-color-secondary, #909399);
  font-family: var(--tx-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
}

.gallery-toolbar__rule {
  width: 1px;
  height: 18px;
  flex: none;
  background: color-mix(in srgb, var(--tx-text-color-primary, #303133) 14%, transparent);
}

.gallery-toolbar__sort {
  display: inline-flex;
  height: 28px;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--tx-text-color-primary, #303133);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.gallery-toolbar__sort:hover {
  background: color-mix(in srgb, var(--tx-text-color-primary, #303133) 8%, transparent);
}

.gallery-toolbar__sort:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

.gallery-toolbar__chevron {
  font-size: 12px;
  opacity: 0.6;
}

.gallery-menu-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.gallery-menu-check {
  color: var(--tx-color-primary, #409eff);
}

.gallery__scroll {
  position: absolute;
  inset: 0;
}

.gallery__scroll :deep(.tx-edge-fade-mask) {
  height: 100%;
}

.gallery__content {
  padding: 68px 14px 16px;
}

/* Grid, masonry and list share one card; the container picks the layout. */
.gallery__scroll :deep(.gallery-grid) {
  display: grid;
  margin: 0;
  padding: 0;
  gap: 16px 14px;
  grid-template-columns: repeat(auto-fill, minmax(var(--thumb-min, 150px), 1fr));
  list-style: none;
}

.gallery__content.is-masonry :deep(.gallery-grid) {
  display: block;
  column-gap: 14px;
  column-width: var(--thumb-min, 150px);
}

.gallery__content.is-list :deep(.gallery-grid) {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.gallery-card {
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
}

.gallery__content.is-masonry .gallery-card {
  display: inline-flex;
  width: 100%;
  margin-bottom: 16px;
  break-inside: avoid;
}

.gallery-card__media {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  aspect-ratio: 4 / 3;
  background: var(--tx-fill-color, #f0f2f5);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--tx-text-color-primary, #303133) 8%, transparent);
}

.gallery__content.is-masonry .gallery-card.is-landscape .gallery-card__media {
  aspect-ratio: 16 / 10;
}

.gallery__content.is-masonry .gallery-card.is-portrait .gallery-card__media {
  aspect-ratio: 3 / 4;
}

.gallery__content.is-masonry .gallery-card.is-square .gallery-card__media {
  aspect-ratio: 1;
}

.gallery-card__open {
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: zoom-in;
}

.gallery-card__open img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.gallery-card:hover .gallery-card__open img,
.gallery-card__open:focus-visible img {
  transform: scale(1.04);
}

.gallery-card__open:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: -2px;
  border-radius: 12px;
}

/* An inverted-surface scrim reads on any artwork in either theme. */
.gallery-card__scrim {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 22px 10px 8px;
  background: linear-gradient(to top, color-mix(in srgb, var(--tx-bui-tooltip-bg, #25272b) 72%, transparent), transparent);
  color: var(--tx-bui-tooltip-fg, #f6f7f8);
  font-size: 11px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;

  --tx-rating-star-filled: var(--tx-bui-orange, #ef720c);
  --tx-rating-star-empty: color-mix(in srgb, var(--tx-bui-tooltip-fg, #f6f7f8) 40%, transparent);
}

.gallery-card:hover .gallery-card__scrim,
.gallery-card:focus-within .gallery-card__scrim {
  opacity: 1;
}

.gallery-card__score {
  font-variant-numeric: tabular-nums;
}

.gallery-card__tag {
  margin-left: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gallery-card__new {
  position: absolute;
  top: 8px;
  left: 8px;
  border-radius: 999px;
  background: var(--tx-bg-color-overlay, #fff);
  box-shadow: var(--tx-elevation-1, 1px 2px 4px rgba(0, 0, 0, 0.04));
}

.gallery-card__like {
  position: absolute;
  top: 6px;
  right: 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 88%, transparent);
  box-shadow: var(--tx-elevation-1, 1px 2px 4px rgba(0, 0, 0, 0.04));
  opacity: 0;
  transition: opacity 0.2s ease;
}

.gallery-card:hover .gallery-card__like,
.gallery-card:focus-within .gallery-card__like,
.gallery-card.is-liked .gallery-card__like {
  opacity: 1;
}

.gallery-card__like :deep(.tx-icon-button) {
  color: var(--tx-text-color-regular, #606266);
}

.gallery-card__like :deep(.tx-icon-button.is-pressed),
.gallery-card__extra :deep(.tx-icon-button.is-pressed) {
  color: var(--tx-bui-red, #e3474c);
}

.gallery-card__like :deep(.tx-icon-button__icon),
.gallery-card__extra :deep(.tx-icon-button__icon) {
  font-size: 14px;
}

.gallery-card__meta {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  padding: 0 2px;
}

.gallery-card__title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gallery-card__byline {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.gallery-card__artist {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gallery-card__likes {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.gallery-card.is-liked .gallery-card__likes {
  color: var(--tx-bui-red, #e3474c);
}

/* List rows */
.gallery__content.is-list .gallery-card {
  flex-direction: row;
  align-items: center;
  gap: 14px;
  padding: 8px;
  border-radius: 12px;
}

.gallery__content.is-list .gallery-card:hover {
  background: var(--tx-bui-hover, #f4f5f6);
}

.gallery__content.is-list .gallery-card__media {
  width: 92px;
  flex: none;
  aspect-ratio: 16 / 10;
  border-radius: 9px;
}

.gallery__content.is-list .gallery-card__meta {
  min-width: 0;
  flex: 1;
}

.gallery-card__extra {
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
}

.gallery-card__rating {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-variant-numeric: tabular-nums;

  --tx-rating-star-filled: var(--tx-bui-orange, #ef720c);
}

.gallery-empty-icon {
  color: var(--tx-bui-red, #e3474c);
  font-size: 28px;
}

.gallery__content :deep(.tx-empty-state) {
  padding-top: 40px;
}

/* Toast */
.gallery__toast {
  position: absolute;
  z-index: 4;
  bottom: 14px;
  left: 50%;
  width: min(320px, calc(100% - 28px));
  pointer-events: none;
  translate: -50% 0;
}

.gallery__toast.is-open {
  pointer-events: auto;
}

.gallery-toast {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.gallery-toast__icon {
  flex: none;
  color: var(--tx-bui-red, #e3474c);
  font-size: 15px;
}

.gallery-toast__text {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gallery-toast__close {
  display: inline-flex;
  width: 22px;
  height: 22px;
  flex: none;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--tx-text-color-secondary, #909399);
  cursor: pointer;
}

.gallery-toast__close:hover {
  background: var(--tx-fill-color-light, #f5f7fa);
}

.gallery-toast__close:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

/* Side panel (wide) ------------------------------------------------------ */

.gallery__side {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 18px;
  padding: 16px;
  overflow-y: auto;
  border-radius: 16px;
  background: var(--tx-fill-color-lighter, #fafafa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  grid-area: side;
}

.gallery-side__intro {
  display: flex;
  gap: 12px;
}

.gallery-side__icon {
  display: inline-flex;
  width: 36px;
  height: 36px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--tx-bg-color, #fff);
  box-shadow: 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  font-size: 17px;
}

.gallery-side__title {
  font-size: 14px;
  font-weight: 600;
}

.gallery-side__blurb {
  margin: 4px 0 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  line-height: 1.55;
}

.gallery-side__stats {
  display: grid;
  margin: 0;
  gap: 8px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.gallery-side__stats > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px;
  border-radius: 10px;
  background: var(--tx-bg-color, #fff);
  box-shadow: 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
}

.gallery-side__stats dt {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.gallery-side__stats dd {
  margin: 0;
  font-size: 16px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.gallery-side__block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gallery-side__label {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-weight: 500;
}

.gallery-side__crew {
  display: flex;
  align-items: center;
  gap: 10px;
}

.gallery-side__muted {
  margin: 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  line-height: 1.5;
}

.gallery-side__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.gallery-side__upload :deep(.tx-image-uploader__grid) {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

/* Detail modal (teleported: only --tx-* tokens reach it) ----------------- */

.gallery-detail {
  display: grid;
  outline: none;
  max-height: calc(100dvh - 150px);
  gap: 20px;
  grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr);
  overflow-y: auto;
  container-name: gallery-detail;
  container-type: inline-size;
}

.gallery-detail__media {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
}

.gallery-detail__stage {
  position: relative;
  display: flex;
  height: min(52dvh, 460px);
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 14px;
  background: var(--tx-fill-color-lighter, #fafafa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
}

.gallery-detail__stage img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.gallery-detail__nav {
  position: absolute;
  top: 50%;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 86%, transparent);
  box-shadow: var(--tx-elevation-2, 1px 2px 8px rgba(0, 0, 0, 0.05));
  translate: 0 -50%;
}

.gallery-detail__nav.is-prev {
  left: 10px;
}

.gallery-detail__nav.is-next {
  right: 10px;
}

.gallery-detail__caption {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--tx-text-color-secondary, #909399);
  font-family: var(--tx-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
}

.gallery-detail__position {
  font-variant-numeric: tabular-nums;
}

.gallery-detail__info {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 16px;
}

.gallery-detail__artist {
  display: flex;
  align-items: center;
  gap: 10px;
}

.gallery-detail__artist-text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  font-size: 13px;
}

.gallery-detail__artist-text span,
.gallery-detail__muted {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.gallery-detail__artist :deep(.tx-icon-button.is-pressed) {
  color: var(--tx-bui-red, #e3474c);
}

.gallery-detail__rating {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;

  --tx-rating-star-filled: var(--tx-bui-orange, #ef720c);
  --tx-rating-star-hover: var(--tx-bui-orange, #ef720c);
}

.gallery-detail__label {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-weight: 500;
}

.gallery-detail__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.gallery-detail__palette,
.gallery-detail__variants {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gallery-detail__swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.gallery-detail__swatch {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 4px 4px;
  border: 0;
  border-radius: 999px;
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-regular, #606266);
  cursor: pointer;
  font-family: var(--tx-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
}

.gallery-detail__swatch:hover {
  background: var(--tx-fill-color, #f0f2f5);
}

.gallery-detail__swatch:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

.gallery-detail__chip {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-text-color-primary, #303133) 14%, transparent);
}

.gallery-detail__actions {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.gallery-detail__toast {
  position: absolute;
  z-index: 2;
  top: 100%;
  left: 0;
  width: min(300px, 100%);
  pointer-events: none;
}

.gallery-detail__toast.is-open {
  pointer-events: auto;
}

.gallery-detail__variants :deep(.tx-image-gallery__grid) {
  gap: 8px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.gallery-detail__variants :deep(.tx-image-gallery__thumb) {
  border-radius: 10px;
}

@container gallery-detail (max-width: 640px) {
  .gallery-detail {
    grid-template-columns: minmax(0, 1fr);
  }

  .gallery-detail__stage {
    height: min(40dvh, 320px);
  }
}

/* Layout ----------------------------------------------------------------- */

@container template (max-width: 639px) {
  .gallery {
    padding: 12px;
  }

  .gallery__heading-text {
    display: none;
  }

  .gallery__head {
    gap: 10px;
  }

  .gallery__tools {
    min-width: 0;
    flex: 1;
    justify-content: flex-end;
  }

  .gallery-toolbar {
    padding-left: 8px;
  }

  .gallery__content {
    padding: 66px 10px 14px;
  }

  .gallery__content.is-grid :deep(.gallery-grid) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .gallery__content.is-masonry :deep(.gallery-grid) {
    column-count: 2;
    column-width: auto;
  }

  .gallery__content.is-list .gallery-card__rating {
    display: none;
  }

  .gallery__content.is-list .gallery-card__extra :deep(.tx-tag) {
    display: none;
  }
}

@container template (min-width: 960px) {
  .gallery {
    column-gap: 16px;
    grid-template-areas:
      'head head'
      'chips side'
      'wall side';
    grid-template-columns: minmax(0, 1fr) 280px;
    padding: 18px 20px 20px;
  }

  .gallery__side {
    margin-top: 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gallery-card__open img,
  .gallery-card__scrim,
  .gallery-card__like {
    transition: none;
  }

  .gallery-card:hover .gallery-card__open img,
  .gallery-card__open:focus-visible img {
    transform: none;
  }

  .gallery__scroll :deep(.tx-stagger-enter-active),
  .gallery__scroll :deep(.tx-stagger-leave-active) {
    transition: none;
  }
}
</style>
