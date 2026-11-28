<script setup lang="ts">
import './TemplateImageStudioDemo.css'
// ImageStudio template: an image studio making assets for Tuff — wallpapers
// for a theme, an icon for a plugin. Parameters sit in a rail (a sheet below
// 640px), the prompt above a grid of generating tiles, and earlier sets in a
// strip from 960px. A finished image opens full size, varies, copies its
// prompt or becomes the wallpaper.
//
// What is real and what is sample data:
// - No model is called. Every image is an SVG drawn by this file from the
//   prompt, style, ratio, seed, guidance and steps, so the same inputs always
//   give the same picture and nothing touches the network. The header and the
//   toasts say the results are sample data.
// - Setting a wallpaper or a plugin icon only marks the tile.
// - The generating look is TxImageGeneration: tiles mosaic in, and a variant
//   churns the finished image into cells before the next one dissolves in. It
//   has no reduced-motion mode, so under reduced motion tiles are plain images.
// - Playback starts from the frame's `@enter`: it picks a style and a ratio,
//   types a prompt and presses Generate. Any reader input takes over.
import type { AiSuggestion } from '@talex-touch/tuffex/ai-elements'
import type { TxFlatRadioValue } from '@talex-touch/tuffex/flat-radio'
import type { TxFlatSelectValue } from '@talex-touch/tuffex/flat-select'
import type { ImageGenerationCycleEvent, ImageGenerationHandle, ImageGenerationPreset } from '@talex-touch/tuffex/image-generation'
import type { ImagePreviewItem } from '@talex-touch/tuffex/image-preview'
import type { SegmentedSliderSegment } from '@talex-touch/tuffex/segmented-slider'
import { hasDocument, hasNavigator, hasWindow } from '@talex-touch/utils/env'
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

type Mode = 'narrow' | 'column' | 'wide'
type StyleKey = 'glass' | 'aurora' | 'pixel' | 'watercolor' | 'neon'
type RatioKey = '1:1' | '16:9' | '9:16'
type Subject = 'wallpaper' | 'icon'
type Glyph = 'clipboard' | 'spark'
type Mood = 'sunset' | 'day' | 'night' | null
type WhenKey = 'now' | 'minutes' | 'hour' | 'yesterday'
/** queued → revealing → done; a variant goes done → churning → revealing → done. */
type TileStatus = 'queued' | 'revealing' | 'churning' | 'done'
type HoldKind = 'hover' | 'focus'

interface Bi { zh: string, en: string }

interface Params {
  style: StyleKey
  ratio: RatioKey
  count: number
  seed: number
  guidance: number
  steps: number
}

interface Tile {
  id: string
  index: number
  /** Variants asked of this tile; part of its art seed. */
  variant: number
  /** The image the tile is generating, or shows once done. */
  src: string
  /** What the plain <img> shows: trails `src` until a variant lands. */
  shownSrc: string
  status: TileStatus
  /** Whether TxImageGeneration is mounted. Restored sets are plain images. */
  gen: boolean
}

interface GenSet {
  id: string
  prompt: string
  params: Params
  /** Seeds the art, so a seeded or scripted prompt draws the same pictures in either language. */
  key: string
  subject: Subject
  glyph: Glyph
  mood: Mood
  tiles: Tile[]
  /** Until every tile has landed once; ends with the "generated" toast. */
  generating: boolean
  when: WhenKey
}

interface SeedSet { key: string, prompt: Bi, params: Params, when: WhenKey }
interface GridFit { cols: number, w: number, h: number, scroll: boolean }
interface Cue { at: number, group: string, run: () => void }

const STYLES: StyleKey[] = ['glass', 'aurora', 'pixel', 'watercolor', 'neon']
const RATIOS: RatioKey[] = ['1:1', '16:9', '9:16']
const RATIO_SHAPE: Record<RatioKey, string> = { '1:1': 'square', '16:9': 'landscape', '9:16': 'portrait' }
/** Source size of each image; the art is drawn in these units. */
const SIZE: Record<RatioKey, [number, number]> = { '1:1': [640, 640], '16:9': [960, 540], '9:16': [540, 960] }
/** The generating effect per style: mosaics for the hard-edged looks, a sweep for the soft ones. */
const EFFECT: Record<StyleKey, ImageGenerationPreset> = {
  glass: 'sweep-gradient',
  aurora: 'pixels-mechanic',
  pixel: 'pixels-organic',
  watercolor: 'sweep-gradient',
  neon: 'pixels-mechanic',
}
const COUNTS = [1, 2, 3, 4]
const SEED_MAX = 99999
const MAX_SETS = 6

// Timing in ms of the stage's own clock, which stops while the stage is off screen.
const TYPE_START = 900
const TYPE_STEPS = 24
const TYPE_INTERVAL = 42
const REVEAL_LEAD = 450
const REVEAL_STAGGER = 320
/** TxImageGeneration reveals in 3 s; past this a tile shows its image without the effect. */
const REVEAL_WATCHDOG = 8000
const CHURN_MS = 1400
const TOAST_MS = 3600
const TOAST_UNDO_MS = 4800
const TOAST_REARM_MS = 2000

const GRID_GAP = 10
/** Narrower than this a tile is too small to judge, so the grid scrolls instead. */
const MIN_TILE = 112

const SCRIPT: Params = { style: 'aurora', ratio: '16:9', count: 4, seed: 7310, guidance: 7, steps: 30 }

const ACTIVE_SEED: SeedSet = {
  key: 'seed-icon',
  prompt: { zh: '剪贴板历史插件图标，圆角方形，玻璃质感', en: 'Icon for the Clipboard History plugin, rounded square, glass finish' },
  params: { style: 'glass', ratio: '1:1', count: 4, seed: 2417, guidance: 7, steps: 30 },
  when: 'minutes',
}

const SEEDS: SeedSet[] = [
  ACTIVE_SEED,
  {
    key: 'seed-valley',
    prompt: { zh: '像素风山谷日落，16 色调色板', en: 'Pixel-art valley at sunset, 16-colour palette' },
    params: { style: 'pixel', ratio: '16:9', count: 2, seed: 806, guidance: 8, steps: 25 },
    when: 'hour',
  },
  {
    key: 'seed-lake',
    prompt: { zh: '水彩晕染的晨雾湖面，纸张纹理', en: 'Watercolour lake in morning mist, paper texture' },
    params: { style: 'watercolor', ratio: '9:16', count: 3, seed: 5120, guidance: 6, steps: 35 },
    when: 'yesterday',
  },
]

/** What a suggestion sets besides the prompt. */
const SUGGESTION_PARAMS: Record<string, Pick<Params, 'style' | 'ratio'>> = {
  corebox: { style: 'glass', ratio: '16:9' },
  clipboard: { style: 'neon', ratio: '1:1' },
  settings: { style: 'watercolor', ratio: '16:9' },
}

const ZH = {
  frameTitle: 'ImageStudio 图像工作室',
  heading: '图像工作室',
  subtitle: '为 Tuff 主题与插件生成素材',
  sample: '示例数据',
  replay: '重新演示',
  params: '参数',
  paramsToggle: (summary: string) => `参数：${summary}`,
  closeParams: '收起参数',
  style: '风格',
  styles: { glass: '玻璃', aurora: '极光', pixel: '像素', watercolor: '水彩', neon: '霓虹' },
  ratio: '比例',
  count: '数量',
  countValue: (count: number) => `${count} 张`,
  seed: '种子',
  randomSeed: '随机种子',
  advanced: '高级',
  guidance: '引导',
  guidanceValue: '引导数值',
  steps: '步数',
  stepsValue: '步数数值',
  advancedNote: '引导越高配色越浓，步数越多细节越密。图像由代码绘制，不调用模型。',
  placeholder: '描述想要的画面，回车生成',
  promptLabel: '提示词',
  generate: '生成',
  suggestionsLabel: '提示词示例',
  suggestions: [
    { id: 'corebox', text: 'CoreBox 背景：玻璃质感的柔和渐变' },
    { id: 'clipboard', text: '剪贴板历史插件图标，霓虹线条' },
    { id: 'settings', text: '设置页插画：水彩晨雾山谷' },
  ],
  results: '生成结果',
  generating: '生成中',
  varying: '变体中',
  progress: (done: number, total: number) => `生成中 ${done}/${total}`,
  tileName: (style: string, ratio: string, index: number) => `${style} · ${ratio} · 第 ${index} 张`,
  viewerName: (style: string, ratio: string) => `${style} · ${ratio}`,
  tileAlt: (prompt: string, index: number) => `${prompt}（第 ${index} 张）`,
  actions: (index: number) => `第 ${index} 张的操作`,
  zoom: '放大',
  variant: '变体',
  copyPrompt: '复制提示词',
  apply: { wallpaper: '设为壁纸', icon: '设为插件图标' },
  badge: { wallpaper: '当前壁纸', icon: '当前图标' },
  history: '历史',
  historyLabel: '生成历史',
  when: { now: '刚刚', minutes: '12 分钟前', hour: '1 小时前', yesterday: '昨天' },
  toastLabel: '通知',
  dismiss: '关闭通知',
  undo: '撤销',
  generated: (count: number) => `已生成 ${count} 张 · 示例`,
  copied: '提示词已复制',
  appliedToast: { wallpaper: '已设为 Tuff 壁纸 · 示例', icon: '已设为插件图标 · 示例' },
  viewerTitle: '大图预览',
  viewerPrevious: '上一张',
  viewerNext: '下一张',
  viewerClose: '关闭预览',
  viewerZoomIn: '放大',
  viewerZoomOut: '缩小',
  viewerZoom: '缩放',
  viewerReset: '适应屏幕',
  viewerFailed: '图片加载失败',
  viewerRotate: '旋转',
  viewerCopy: '复制图片',
  viewerShare: '分享',
  viewerDownload: '下载',
  viewerMenu: '图片操作',
  viewerStrip: '图片列表',
  viewerCopied: '已复制图片',
  viewerLinkCopied: '已复制链接',
  viewerCopyFailed: '无法复制图片',
  viewerItem: (current: number, total: number, name?: string) => `${name ? `${name}，` : ''}第 ${current} 张，共 ${total} 张`,
  viewerDialog: (title: string, name: string) => `${title}：${name}`,
  viewerReadout: (readout: string, label: string) => `${readout}，${label}`,
  scriptPrompt: 'Tuff 主题壁纸：极光夜空与雪山，冷色调，左侧留出图标区',
}

type Copy = typeof ZH

const EN: Copy = {
  frameTitle: 'ImageStudio',
  heading: 'Image Studio',
  subtitle: 'Assets for Tuff themes and plugins',
  sample: 'Sample data',
  replay: 'Replay',
  params: 'Parameters',
  paramsToggle: summary => `Parameters: ${summary}`,
  closeParams: 'Hide parameters',
  style: 'Style',
  styles: { glass: 'Glass', aurora: 'Aurora', pixel: 'Pixel', watercolor: 'Watercolour', neon: 'Neon' },
  ratio: 'Aspect ratio',
  count: 'Images',
  countValue: count => (count === 1 ? '1 image' : `${count} images`),
  seed: 'Seed',
  randomSeed: 'Random seed',
  advanced: 'Advanced',
  guidance: 'Guidance',
  guidanceValue: 'Guidance value',
  steps: 'Steps',
  stepsValue: 'Steps value',
  advancedNote: 'Higher guidance means stronger colour; more steps mean finer detail. The images are drawn by code, not a model.',
  placeholder: 'Describe the image, then press Enter',
  promptLabel: 'Prompt',
  generate: 'Generate',
  suggestionsLabel: 'Prompt ideas',
  suggestions: [
    { id: 'corebox', text: 'CoreBox backdrop: soft gradient, glass finish' },
    { id: 'clipboard', text: 'Clipboard History plugin icon, neon lines' },
    { id: 'settings', text: 'Settings illustration: watercolour valley in morning mist' },
  ],
  results: 'Results',
  generating: 'Generating',
  varying: 'New variation',
  progress: (done, total) => `Generating ${done}/${total}`,
  tileName: (style, ratio, index) => `${style} · ${ratio} · Image ${index}`,
  viewerName: (style, ratio) => `${style} · ${ratio}`,
  tileAlt: (prompt, index) => `${prompt} (image ${index})`,
  actions: index => `Image ${index} actions`,
  zoom: 'Enlarge',
  variant: 'Variation',
  copyPrompt: 'Copy prompt',
  apply: { wallpaper: 'Set as wallpaper', icon: 'Set as plugin icon' },
  badge: { wallpaper: 'Current wallpaper', icon: 'Current icon' },
  history: 'History',
  historyLabel: 'Generation history',
  when: { now: 'Just now', minutes: '12 min ago', hour: '1 hr ago', yesterday: 'Yesterday' },
  toastLabel: 'Notification',
  dismiss: 'Dismiss',
  undo: 'Undo',
  generated: count => `Generated ${count === 1 ? '1 image' : `${count} images`} · sample`,
  copied: 'Prompt copied',
  appliedToast: { wallpaper: 'Set as Tuff wallpaper · sample', icon: 'Set as plugin icon · sample' },
  viewerTitle: 'Preview',
  viewerPrevious: 'Previous image',
  viewerNext: 'Next image',
  viewerClose: 'Close preview',
  viewerZoomIn: 'Zoom in',
  viewerZoomOut: 'Zoom out',
  viewerZoom: 'Zoom',
  viewerReset: 'Fit to screen',
  viewerFailed: 'This image could not be loaded',
  viewerRotate: 'Rotate',
  viewerCopy: 'Copy image',
  viewerShare: 'Share',
  viewerDownload: 'Download',
  viewerMenu: 'Image actions',
  viewerStrip: 'Images',
  viewerCopied: 'Image copied',
  viewerLinkCopied: 'Link copied',
  viewerCopyFailed: 'Could not copy the image',
  viewerItem: (current: number, total: number, name?: string) => name ? `${name}, ${current} of ${total}` : `Image ${current} of ${total}`,
  viewerDialog: (title: string, name: string) => `${title}: ${name}`,
  viewerReadout: (readout: string, label: string) => `${readout}, ${label}`,
  scriptPrompt: 'Tuff theme wallpaper: aurora night sky over snowy peaks, cool tones, space on the left for icons',
}

// Scoped-slot values never reach <script setup>. This relays the stage's
// measured size into refs, so layout decisions CSS cannot make can follow it.
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
const copy = computed<Copy>(() => (zh.value ? ZH : EN))

function L(text: Bi): string {
  return zh.value ? text.zh : text.en
}

function prefersReducedMotion(): boolean {
  return hasWindow() && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

async function writeClipboard(text: string): Promise<void> {
  if (!hasNavigator())
    return
  try {
    await navigator.clipboard.writeText(text)
  }
  catch {
    // Denied or unavailable; the toast still confirms the intent.
  }
}

/* ─── Art ─────────────────────────────────────────────────────────────── */

// Each image is an SVG data URI. The seed takes the art key, style, ratio,
// seed, tile and variant; guidance and steps stay out of it and only change
// the look (colour strength, amount of detail), so nudging them keeps the
// composition.

type Rand = () => number
type Point = [number, number]

interface Look {
  /** 0.55–1, from guidance: how strong the colour is. */
  vivid: number
  /** 0.3–1.7, from steps: how many stars, ridges and specks. */
  detail: number
}

interface Scene {
  W: number
  H: number
  rnd: Rand
  look: Look
  mood: Mood
  /** Prefix for ids, so a scene nested in an icon keeps its own defs. */
  id: string
}

interface ArtSpec {
  key: string
  params: Params
  subject: Subject
  glyph: Glyph
  mood: Mood
  index: number
  variant: number
}

function hashString(text: string): number {
  let hash = 0x811C9DC5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function mulberry32(seed: number): Rand {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function at<T>(list: readonly T[], index: number): T {
  return list[((index % list.length) + list.length) % list.length] as T
}

function pick<T>(rnd: Rand, list: readonly T[]): T {
  return at(list, Math.floor(rnd() * list.length))
}

/** One decimal is plenty at these sizes and keeps the data URIs short. */
function n1(value: number): number {
  return Math.round(value * 10) / 10
}

function mix(from: string, to: string, t: number): string {
  const a = Number.parseInt(from.slice(1), 16)
  const b = Number.parseInt(to.slice(1), 16)
  let out = '#'
  for (const shift of [16, 8, 0]) {
    const x = (a >> shift) & 255
    const y = (b >> shift) & 255
    out += Math.round(x + (y - x) * t).toString(16).padStart(2, '0')
  }
  return out
}

function blur(id: string, deviation: number): string {
  return `<filter id='${id}' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='${n1(deviation)}'/></filter>`
}

function points(list: Point[]): string {
  return list.map(([x, y]) => `${n1(x)},${n1(y)}`).join(' ')
}

/** A midpoint-displaced ridge across the full width. */
function ridgeLine(rnd: Rand, W: number, base: number, rough: number, depth = 6): Point[] {
  let line: Point[] = [[0, base + (rnd() - 0.5) * rough], [W, base + (rnd() - 0.5) * rough]]
  let spread = rough
  for (let d = 0; d < depth; d++) {
    const next: Point[] = []
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]!
      const b = line[i + 1]!
      next.push(a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + (rnd() - 0.5) * spread])
    }
    next.push(line[line.length - 1]!)
    line = next
    spread *= 0.52
  }
  return line
}

/** Polygon points for a line closed down to `floor`. */
function closed(line: Point[], W: number, floor: number): string {
  return `${points(line)} ${W},${n1(floor)} 0,${n1(floor)}`
}

const GLASS: { bg: [string, string], blobs: string[] }[] = [
  { bg: ['#ece8ff', '#cfdaff'], blobs: ['#8b7bff', '#5ec8ff', '#ff9ad5', '#b49cff'] },
  { bg: ['#ddf7ee', '#c9e8ff'], blobs: ['#34d399', '#38bdf8', '#a3e635', '#5eead4'] },
  { bg: ['#fff0e3', '#ffdbe8'], blobs: ['#fb923c', '#f472b6', '#facc15', '#fda4af'] },
]

function glassScene({ W, H, rnd, look, id }: Scene): string {
  const pal = pick(rnd, GLASS)
  const m = Math.min(W, H)
  let blobs = ''
  const count = 4 + Math.round(look.detail * 2)
  for (let i = 0; i < count; i++)
    blobs += `<circle cx='${n1(rnd() * W)}' cy='${n1(rnd() * H)}' r='${n1(m * (0.16 + rnd() * 0.22))}' fill='${at(pal.blobs, i)}' fill-opacity='${n1(0.35 + look.vivid * 0.45)}'/>`
  let defs = `<linearGradient id='${id}bg' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${pal.bg[0]}'/><stop offset='1' stop-color='${pal.bg[1]}'/></linearGradient>`
    + `<linearGradient id='${id}sheen' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='0.55'/><stop offset='0.45' stop-color='#fff' stop-opacity='0.06'/><stop offset='1' stop-color='#fff' stop-opacity='0.18'/></linearGradient>`
    + blur(`${id}soft`, m * 0.07) + blur(`${id}frost`, m * 0.11) + blur(`${id}shade`, m * 0.03)
  let panes = ''
  const paneCount = rnd() > 0.45 ? 3 : 2
  for (let i = 0; i < paneCount; i++) {
    const w = W * (i === 0 ? 0.52 : 0.3) * (0.85 + rnd() * 0.3)
    const h = H * (i === 0 ? 0.44 : 0.28) * (0.85 + rnd() * 0.3)
    const rect = `x='${n1(W * 0.06 + rnd() * (W * 0.88 - w))}' y='${n1(H * 0.06 + rnd() * (H * 0.88 - h))}' width='${n1(w)}' height='${n1(h)}' rx='${n1(m * 0.045)}'`
    defs += `<clipPath id='${id}pane${i}'><rect ${rect}/></clipPath>`
    // Frosted: the same blobs blurred harder and clipped to the pane.
    panes += `<rect ${rect} fill='#1e1b4b' fill-opacity='0.14' filter='url(#${id}shade)' transform='translate(0 ${n1(m * 0.02)})'/>`
      + `<g clip-path='url(#${id}pane${i})'><rect width='${W}' height='${H}' fill='url(#${id}bg)'/><g filter='url(#${id}frost)'>${blobs}</g><rect width='${W}' height='${H}' fill='#fff' fill-opacity='0.22'/></g>`
      + `<rect ${rect} fill='url(#${id}sheen)'/><rect ${rect} fill='none' stroke='#fff' stroke-opacity='0.7' stroke-width='${n1(m * 0.003)}'/>`
  }
  let specks = ''
  for (let i = 0; i < Math.round(7 * look.detail); i++)
    specks += `<circle cx='${n1(rnd() * W)}' cy='${n1(rnd() * H)}' r='${n1(m * (0.005 + rnd() * 0.014))}' fill='#fff' fill-opacity='${n1(0.25 + rnd() * 0.4)}'/>`
  return `<defs>${defs}</defs><rect width='${W}' height='${H}' fill='url(#${id}bg)'/><g filter='url(#${id}soft)'>${blobs}</g>${panes}${specks}`
}

const AURORA: { sky: [string, string, string], bands: string[], snow: [string, string], rock: string }[] = [
  { sky: ['#030712', '#0b1d3a', '#173f66'], bands: ['#34f5c5', '#5ee1ff', '#a78bfa'], snow: ['#e6f2ff', '#6f8fb8'], rock: '#07111f' },
  { sky: ['#05040f', '#1b1145', '#2d1d66'], bands: ['#7cff9e', '#f472b6', '#60a5fa'], snow: ['#f0e9ff', '#8a7cc0'], rock: '#0b0820' },
  { sky: ['#020a10', '#06283a', '#0f5266'], bands: ['#22d3ee', '#a3e635', '#2dd4bf'], snow: ['#e0fbff', '#6aa8b6'], rock: '#04141b' },
]

function auroraScene({ W, H, rnd, look, id }: Scene): string {
  const pal = pick(rnd, AURORA)
  const m = Math.min(W, H)
  let defs = `<linearGradient id='${id}sky' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${pal.sky[0]}'/><stop offset='0.55' stop-color='${pal.sky[1]}'/><stop offset='1' stop-color='${pal.sky[2]}'/></linearGradient>`
    + `<linearGradient id='${id}snow' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${pal.snow[0]}'/><stop offset='1' stop-color='${pal.snow[1]}'/></linearGradient>`
    + blur(`${id}glow`, m * 0.022)
  let body = `<rect width='${W}' height='${H}' fill='url(#${id}sky)'/>`
  const stars = Math.round((40 * look.detail * Math.max(W, H)) / 640)
  for (let i = 0; i < stars; i++)
    body += `<circle cx='${n1(rnd() * W)}' cy='${n1(rnd() * H * 0.6)}' r='${n1(m * (0.0008 + rnd() * 0.0018))}' fill='#fff' fill-opacity='${n1(0.35 + rnd() * 0.6)}'/>`
  const strength = n1(0.45 + look.vivid * 0.5)
  for (let b = 0; b < 3; b++) {
    const color = at(pal.bands, b)
    defs += `<linearGradient id='${id}band${b}' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${color}' stop-opacity='0'/><stop offset='0.6' stop-color='${color}' stop-opacity='${strength}'/><stop offset='1' stop-color='${color}' stop-opacity='0'/></linearGradient>`
    const y0 = H * (0.14 + b * 0.1 + rnd() * 0.06)
    const amp = H * (0.03 + rnd() * 0.05)
    const thick = H * (0.09 + rnd() * 0.08)
    const freq = ((1.1 + rnd() * 1.5) * Math.PI * 2) / W
    const phase = rnd() * Math.PI * 2
    const tilt = (rnd() - 0.5) * H * 0.2
    const edge = (x: number): number => y0 + tilt * (x / W - 0.5) + amp * Math.sin(x * freq + phase)
    const top: Point[] = []
    const bottom: Point[] = []
    for (let i = 0; i <= 16; i++) {
      const x = (W * i) / 16
      top.push([x, edge(x)])
      bottom.unshift([x, edge(x) + thick * (0.7 + 0.3 * Math.sin(x * freq * 1.7 + phase))])
    }
    // Curtain rays rise from the band's upper edge.
    let rays = ''
    for (let r = 0; r < Math.round(9 * look.detail); r++) {
      const x = rnd() * W
      const len = H * (0.06 + rnd() * 0.12)
      rays += `<rect x='${n1(x)}' y='${n1(edge(x) - len)}' width='${n1(m * 0.006)}' height='${n1(len + thick * 0.5)}' fill='url(#${id}band${b})'/>`
    }
    body += `<g filter='url(#${id}glow)' style='mix-blend-mode:screen'><polygon points='${points(top)} ${points(bottom)}' fill='url(#${id}band${b})'/>${rays}</g>`
  }
  body += `<polygon points='${closed(ridgeLine(rnd, W, H * 0.62, H * 0.42), W, H)}' fill='url(#${id}snow)'/>`
    + `<polygon points='${closed(ridgeLine(rnd, W, H * 0.77, H * 0.18), W, H)}' fill='${mix(pal.rock, pal.snow[1], 0.35)}'/>`
    + `<polygon points='${closed(ridgeLine(rnd, W, H * 0.88, H * 0.12), W, H)}' fill='${pal.rock}'/>`
  return `<defs>${defs}</defs>${body}`
}

type PixelMood = Exclude<Mood, null>

const PIXEL: Record<PixelMood, { sky: string[], sun: string, far: string, near: string, water: string, glint: string, star: string }> = {
  sunset: { sky: ['#2b1b4f', '#5a2a6e', '#9c3a6e', '#e0605e', '#ffa064'], sun: '#ffe08a', far: '#7a3a6e', near: '#3d1f45', water: '#4a2a63', glint: '#ffd27a', star: '#ffe9c4' },
  day: { sky: ['#3f8ff0', '#5aa6f5', '#7dbcf8', '#a6d3fb', '#d3ebff'], sun: '#fff4b0', far: '#6aa874', near: '#2f6b3f', water: '#3b7fc4', glint: '#e8f6ff', star: '#ffffff' },
  night: { sky: ['#070b1f', '#0d1636', '#16224d', '#1f2f63', '#2a3c78'], sun: '#f4f1d0', far: '#22305c', near: '#0e1530', water: '#14204a', glint: '#c9d4ff', star: '#ffffff' },
}
const PIXEL_MOODS: PixelMood[] = ['sunset', 'day', 'night']

function pixelScene({ W, H, rnd, look, mood, id }: Scene): string {
  const key = mood ?? pick(rnd, PIXEL_MOODS)
  const pal = PIXEL[key]
  // 20px cells at every source size: 32×32, 48×27 or 27×48.
  const cols = W === H ? 32 : W > H ? 48 : 27
  const rows = W === H ? 32 : W > H ? 27 : 48
  const cells: string[] = Array.from({ length: cols * rows }, () => '')
  const put = (x: number, y: number, color: string): void => {
    if (x >= 0 && y >= 0 && x < cols && y < rows)
      cells[y * cols + x] = color
  }
  const horizon = Math.round(rows * (0.58 + rnd() * 0.08))

  // Sky bands, each handed to the next by a checker row, the way a 16-colour palette would.
  const bandH = horizon / pal.sky.length
  let sky = ''
  let defs = ''
  for (let b = 0; b < pal.sky.length; b++) {
    const y0 = Math.round(b * bandH)
    const y1 = Math.round((b + 1) * bandH)
    sky += `<rect y='${y0}' width='${cols}' height='${y1 - y0}' fill='${at(pal.sky, b)}'/>`
    if (b < pal.sky.length - 1) {
      const next = at(pal.sky, b + 1)
      defs += `<pattern id='${id}px${b}' width='2' height='2' patternUnits='userSpaceOnUse'><rect width='1' height='1' fill='${next}'/><rect x='1' y='1' width='1' height='1' fill='${next}'/></pattern>`
      sky += `<rect y='${y1 - 1}' width='${cols}' height='1' fill='url(#${id}px${b})'/>`
    }
  }

  if (key === 'night') {
    for (let i = 0; i < Math.round(cols * 0.5 * look.detail); i++)
      put(Math.floor(rnd() * cols), Math.floor(rnd() * horizon * 0.7), pal.star)
  }
  else if (key === 'day') {
    for (let c = 0; c < 2 + Math.round(look.detail); c++) {
      const cx = Math.floor(rnd() * cols)
      const cy = 3 + Math.floor(rnd() * horizon * 0.35)
      const w = 4 + Math.floor(rnd() * 5)
      for (let x = -w; x <= w; x++)
        put(cx + x, cy, pal.star)
      for (let x = 2 - w; x < w - 1; x++)
        put(cx + x, cy - 1, pal.star)
      for (let x = 4 - w; x < w - 3; x++)
        put(cx + x, cy - 2, pal.star)
    }
  }

  // The sun (a moon at night); at sunset it sits on the horizon with its lower half striped.
  const R = Math.max(2, Math.round(Math.min(cols, rows) * (key === 'night' ? 0.07 : 0.12 + rnd() * 0.04)))
  const sx = Math.round(cols * (0.3 + rnd() * 0.4))
  const sy = Math.round(key === 'sunset' ? horizon - R * 0.4 : horizon - rows * (0.2 + rnd() * 0.1))
  for (let y = -R; y <= R; y++) {
    if (key === 'sunset' && y > 0 && y % 3 === 1)
      continue
    for (let x = -R; x <= R; x++) {
      if (x * x + y * y <= R * R + R && sy + y < horizon)
        put(sx + x, sy + y, pal.sun)
    }
  }

  // Far hills rise towards both edges: a valley.
  const phase = rnd() * 6
  for (let x = 0; x < cols; x++) {
    const u = Math.abs((2 * x) / (cols - 1) - 1)
    const h = Math.max(1, Math.round(rows * (0.05 + 0.26 * u ** 1.5) + Math.sin(x * 0.55 + phase) * 1.4 * look.detail))
    for (let y = horizon - h; y < horizon; y++)
      put(x, y, pal.far)
  }

  // Water, with the sun's broken reflection narrowing towards the viewer.
  const ripple = mix(pal.water, pal.glint, 0.25)
  for (let y = horizon; y < rows; y++) {
    const depth = (y - horizon) / Math.max(1, rows - horizon)
    for (let x = 0; x < cols; x++)
      put(x, y, (y - horizon) % 4 === 2 && (x + y) % 5 === 0 ? ripple : pal.water)
    const span = Math.max(1, Math.round(R * (1 - depth * 0.6)))
    for (let x = sx - span; x <= sx + span; x++) {
      if (rnd() < 0.5)
        put(x, y, pal.glint)
    }
  }

  // Near slopes frame the valley from both sides.
  const phase2 = rnd() * 6
  for (let x = 0; x < cols; x++) {
    const u = Math.abs((2 * x) / (cols - 1) - 1)
    if (u < 0.42)
      continue
    const h = Math.round((rows - horizon + rows * 0.1) * ((u - 0.42) / 0.58) ** 0.8 + Math.sin(x * 0.9 + phase2))
    for (let y = rows - Math.max(0, h); y < rows; y++)
      put(x, y, pal.near)
  }

  // Row runs of the painted cells; the sky behind them is already drawn.
  let runs = ''
  for (let y = 0; y < rows; y++) {
    let x = 0
    while (x < cols) {
      const color = cells[y * cols + x] ?? ''
      let end = x + 1
      while (end < cols && cells[y * cols + end] === color)
        end++
      if (color)
        runs += `<rect x='${x}' y='${y}' width='${end - x}' height='1' fill='${color}'/>`
      x = end
    }
  }
  return `<svg width='${W}' height='${H}' viewBox='0 0 ${cols} ${rows}' preserveAspectRatio='none' shape-rendering='crispEdges'><defs>${defs}</defs>${sky}${runs}</svg>`
}

const WATERCOLOR: { paper: string, sky: string, far: string, near: string, mist: string, water: string, accent: string, ink: string }[] = [
  { paper: '#f7f1e6', sky: '#9fc1e6', far: '#8ea6c8', near: '#5d7d9c', mist: '#ffffff', water: '#9dbad6', accent: '#e8a0a0', ink: '#3b4a5e' },
  { paper: '#f8f2e9', sky: '#f2c49e', far: '#c79b9d', near: '#8a6a7c', mist: '#fff8ee', water: '#e0b49e', accent: '#ef8a5c', ink: '#4a3b46' },
  { paper: '#f2f5ee', sky: '#b6d6bf', far: '#8db39a', near: '#557f69', mist: '#ffffff', water: '#a6c9b6', accent: '#d9a441', ink: '#2f4a3c' },
]

function watercolorScene({ W, H, rnd, look, id }: Scene): string {
  const pal = pick(rnd, WATERCOLOR)
  const m = Math.min(W, H)
  const horizon = H * (0.56 + rnd() * 0.08)
  const hill = (base: number, amp: number): Point[] => {
    const f = 1.4 + rnd() * 1.2
    const ph = rnd() * 6
    return Array.from({ length: 25 }, (_, i): Point => {
      const t = i / 24
      return [W * t, base - amp * (0.6 * Math.sin(t * Math.PI * f + ph) + 0.4 * Math.sin(t * Math.PI * f * 2.3 + ph * 1.7) + 0.4)]
    })
  }
  const far = hill(horizon - H * 0.06, H * 0.1)
  const near = hill(horizon - H * 0.005, H * 0.05)
  const reflection = far.map(([x, y]): Point => [x, 2 * horizon - y])
  const wash = n1(0.35 + look.vivid * 0.35)
  const seed = Math.floor(rnd() * 1000)
  // Washes bleed through one displacement pass; the grain is paper, not pigment.
  // Near the border the pass samples past the paper, and some renderers clip it
  // to the canvas, so the bleed is laid over the undisplaced washes: a hole
  // shows the same wash, never bare paper.
  const defs = `<filter id='${id}wet' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.012' numOctaves='2' seed='${seed}' result='noise'/><feDisplacementMap in='SourceGraphic' in2='noise' scale='${n1(m * 0.045)}' xChannelSelector='R' yChannelSelector='G'/><feGaussianBlur stdDeviation='${n1(m * 0.003)}'/><feComposite in2='SourceGraphic' operator='over'/></filter>`
    + `<filter id='${id}grain' x='0' y='0' width='100%' height='100%'><feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='1' seed='${seed + 1}'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='table' tableValues='0 ${n1(0.05 + look.detail * 0.04)}'/></feComponentTransfer></filter>`
    + blur(`${id}mist`, m * 0.03)
  let ripples = ''
  for (let i = 0; i < Math.round(6 * look.detail); i++) {
    const y = horizon + (H - horizon) * (0.15 + rnd() * 0.8)
    const x = rnd() * W * 0.8
    ripples += `<line x1='${n1(x)}' y1='${n1(y)}' x2='${n1(x + W * (0.06 + rnd() * 0.14))}' y2='${n1(y)}'/>`
  }
  let reeds = ''
  const right = rnd() > 0.5
  for (let i = 0; i < 7; i++) {
    const x = W * ((right ? 0.82 : 0.02) + rnd() * 0.16)
    const h = H * (0.08 + rnd() * 0.1)
    reeds += `<path d='M${n1(x)} ${H}q${n1(m * 0.01)} ${n1(-h * 0.5)} ${n1((rnd() - 0.3) * m * 0.03)} ${n1(-h)}'/>`
  }
  const edge = `stroke-width='${n1(m * 0.004)}'`
  // The paper sits inside the wet group, so the group is opaque edge to edge.
  return `<defs>${defs}</defs><g filter='url(#${id}wet)'><rect width='${W}' height='${H}' fill='${pal.paper}'/>`
    + `<rect width='${W}' height='${n1(horizon + H * 0.02)}' fill='${pal.sky}' fill-opacity='${wash}'/>`
    + `<circle cx='${n1(W * (0.25 + rnd() * 0.5))}' cy='${n1(horizon - H * (0.14 + rnd() * 0.12))}' r='${n1(m * 0.07)}' fill='${pal.accent}' fill-opacity='0.55'/>`
    + `<polygon points='${closed(far, W, horizon)}' fill='${pal.far}' fill-opacity='${n1(wash + 0.1)}' stroke='${pal.far}' ${edge}/>`
    + `<rect y='${n1(horizon)}' width='${W}' height='${n1(H - horizon)}' fill='${pal.water}' fill-opacity='${wash}'/>`
    + `<polygon points='${closed(reflection, W, horizon)}' fill='${pal.far}' fill-opacity='0.22'/>`
    + `<polygon points='${closed(near, W, horizon + H * 0.01)}' fill='${pal.near}' fill-opacity='${n1(wash + 0.2)}' stroke='${pal.near}' ${edge}/>`
    + `</g>`
    + `<ellipse cx='${n1(W / 2)}' cy='${n1(horizon)}' rx='${n1(W * 0.62)}' ry='${n1(H * 0.035)}' fill='${pal.mist}' fill-opacity='0.55' filter='url(#${id}mist)'/>`
    + `<g stroke='${pal.ink}' stroke-opacity='0.16' stroke-width='${n1(m * 0.003)}' stroke-linecap='round'>${ripples}</g>`
    + `<g stroke='${pal.ink}' stroke-opacity='0.55' ${edge} fill='none' stroke-linecap='round'>${reeds}</g>`
    + `<rect width='${W}' height='${H}' filter='url(#${id}grain)'/>`
}

const NEON: { bg: [string, string, string], sun: [string, string], grid: string, ridge: string, line: string }[] = [
  { bg: ['#0a0220', '#1a0638', '#3a0b4f'], sun: ['#ffe14d', '#ff4fd8'], grid: '#ff4fd8', ridge: '#3df2ff', line: '#ffd1f7' },
  { bg: ['#020617', '#0b1440', '#142a6b'], sun: ['#7cf7ff', '#7c5cff'], grid: '#3df2ff', ridge: '#ff7ae6', line: '#c8f9ff' },
  { bg: ['#0b0311', '#2a0a2e', '#4a0f3a'], sun: ['#ffb36b', '#ff3d81'], grid: '#ff8a3d', ridge: '#b388ff', line: '#ffe0c2' },
]

function neonScene({ W, H, rnd, look, id }: Scene): string {
  const pal = pick(rnd, NEON)
  const m = Math.min(W, H)
  const hy = H * (0.58 + rnd() * 0.06)
  const sr = m * (0.19 + rnd() * 0.05)
  const sx = W * (0.35 + rnd() * 0.3)
  const sy = hy - sr * 0.42
  let stripes = ''
  for (let k = 0; k < 6; k++)
    stripes += `<rect x='${n1(sx - sr)}' y='${n1(sy + sr * (0.08 + k * 0.15))}' width='${n1(sr * 2)}' height='${n1(sr * (0.02 + k * 0.016))}' fill='#000'/>`
  const defs = `<linearGradient id='${id}bg' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${pal.bg[0]}'/><stop offset='0.7' stop-color='${pal.bg[1]}'/><stop offset='1' stop-color='${pal.bg[2]}'/></linearGradient>`
    + `<linearGradient id='${id}sun' x1='0' y1='0' x2='0' y2='1'><stop offset='0.1' stop-color='${pal.sun[0]}'/><stop offset='0.9' stop-color='${pal.sun[1]}'/></linearGradient>`
    + `<linearGradient id='${id}floor' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${mix(pal.bg[2], '#000000', 0.35)}'/><stop offset='1' stop-color='#000000'/></linearGradient>`
    + `<mask id='${id}cut'><rect width='${W}' height='${H}' fill='#fff'/>${stripes}</mask>`
    + blur(`${id}glow`, m * 0.016) + blur(`${id}halo`, m * 0.05)
  let stars = ''
  for (let i = 0; i < Math.round(24 * look.detail); i++)
    stars += `<circle cx='${n1(rnd() * W)}' cy='${n1(rnd() * hy * 0.75)}' r='${n1(m * (0.001 + rnd() * 0.002))}' fill='#fff' fill-opacity='${n1(0.3 + rnd() * 0.6)}'/>`
  // A wireframe range behind the horizon: the ridge plus a drop line from every other vertex.
  const peaks = ridgeLine(rnd, W, hy - H * 0.05, H * 0.2, 5)
  let wire = ''
  peaks.forEach(([x, y], i) => {
    if (i % 2 === 0 && y < hy)
      wire += `<line x1='${n1(x)}' y1='${n1(y)}' x2='${n1(x)}' y2='${n1(hy)}'/>`
  })
  // The floor grid: rows bunch towards the horizon, columns meet at its centre.
  let grid = ''
  const rowCount = Math.round(7 + 4 * look.detail)
  for (let k = 1; k <= rowCount; k++) {
    const y = hy + (H - hy) * (k / rowCount) ** 2
    grid += `<line x1='0' y1='${n1(y)}' x2='${W}' y2='${n1(y)}'/>`
  }
  const colCount = Math.round(6 + 3 * look.detail)
  const spread = (W * 1.5) / (2 * colCount)
  for (let i = -colCount; i <= colCount; i++)
    grid += `<line x1='${n1(W / 2 + i * spread * 0.1)}' y1='${n1(hy)}' x2='${n1(W / 2 + i * spread)}' y2='${H}'/>`
  const glow = n1(0.4 + look.vivid * 0.45)
  const gridStroke = `stroke='${pal.grid}' stroke-width='${n1(m * 0.003)}'`
  return `<defs>${defs}</defs><rect width='${W}' height='${H}' fill='url(#${id}bg)'/>${stars}`
    + `<circle cx='${n1(sx)}' cy='${n1(sy)}' r='${n1(sr * 1.1)}' fill='${pal.sun[1]}' fill-opacity='${glow}' filter='url(#${id}halo)'/>`
    + `<circle cx='${n1(sx)}' cy='${n1(sy)}' r='${n1(sr)}' fill='url(#${id}sun)' mask='url(#${id}cut)'/>`
    + `<polygon points='${closed(peaks, W, hy)}' fill='${pal.bg[0]}'/>`
    + `<g stroke='${pal.ridge}' stroke-opacity='0.3' stroke-width='${n1(m * 0.002)}'>${wire}</g>`
    + `<polyline points='${points(peaks)}' fill='none' stroke='${pal.ridge}' stroke-width='${n1(m * 0.006)}' stroke-opacity='${glow}' filter='url(#${id}glow)'/>`
    + `<polyline points='${points(peaks)}' fill='none' stroke='${pal.ridge}' stroke-width='${n1(m * 0.0025)}'/>`
    + `<rect y='${n1(hy)}' width='${W}' height='${n1(H - hy)}' fill='url(#${id}floor)'/>`
    + `<g ${gridStroke} stroke-opacity='${glow}' filter='url(#${id}glow)'>${grid}</g><g ${gridStroke}>${grid}</g>`
    + `<rect y='${n1(hy - m * 0.002)}' width='${W}' height='${n1(m * 0.004)}' fill='${pal.line}'/>`
}

const SCENES: Record<StyleKey, (scene: Scene) => string> = {
  glass: glassScene,
  aurora: auroraScene,
  pixel: pixelScene,
  watercolor: watercolorScene,
  neon: neonScene,
}

const ICON_ACCENT: Record<StyleKey, string> = { glass: '#6d5efc', aurora: '#2fd6a8', pixel: '#ff7a45', watercolor: '#e0876a', neon: '#3df2ff' }
const ICON_INK = '#3a3f58'

/** The plugin's glyph in a 100×100 box: a clipboard with a history clock, or a spark. */
function glyphArt(glyph: Glyph, style: StyleKey): string {
  const accent = ICON_ACCENT[style]
  const square = style === 'pixel'
  const cap = square ? 'square' : 'round'
  const lit = mix(accent, '#ffffff', 0.55)
  if (glyph === 'clipboard') {
    const board = `<rect x='22' y='16' width='56' height='70' rx='${square ? 2 : 11}'`
    const clip = `<rect x='35' y='9' width='30' height='15' rx='${square ? 1 : 6}'`
    const lines = `<path d='M33 40H67M33 52H61M33 64H52'/>`
    const clock = `<circle cx='72' cy='74' r='15'`
    const hands = `<path d='M72 66V74L78 78'/>`
    if (style === 'neon') {
      const trace = (color: string, width: number, extra: string): string =>
        `<g fill='none' stroke='${color}' stroke-width='${width}' stroke-linecap='round' stroke-linejoin='round'${extra}>${board}/>${clip}/>${lines}${clock}/>${hands}</g>`
      return trace(accent, 7, ` stroke-opacity='0.8' filter='url(#iglow)'`) + trace(lit, 3.5, '')
    }
    return `${board} fill='#fff' fill-opacity='0.94'/>${clip} fill='${accent}'/>`
      + `<g fill='none' stroke='${ICON_INK}' stroke-opacity='0.45' stroke-width='5' stroke-linecap='${cap}'>${lines}</g>`
      + `${clock} fill='${accent}' stroke='#fff' stroke-width='4'/>`
      + `<g fill='none' stroke='#fff' stroke-width='4' stroke-linecap='${cap}' stroke-linejoin='round'>${hands}</g>`
  }
  const star = square
    ? `<path d='M50 12L57 43L88 50L57 57L50 88L43 57L12 50L43 43Z'/>`
    : `<path d='M50 12C53 38 62 47 88 50C62 53 53 62 50 88C47 62 38 53 12 50C38 47 47 38 50 12Z'/>`
  const small = `<path d='M78 14C79 21 81 23 88 24C81 25 79 27 78 34C77 27 75 25 68 24C75 23 77 21 78 14Z'/>`
  if (style === 'neon')
    return `<g fill='none' stroke='${accent}' stroke-width='6' stroke-linejoin='round' filter='url(#iglow)'>${star}${small}</g><g fill='none' stroke='${lit}' stroke-width='3' stroke-linejoin='round'>${star}${small}</g>`
  return `<g fill='#fff' fill-opacity='0.95'>${star}</g><g fill='${accent}'>${small}</g>`
}

/** An app-icon plate on a quiet backdrop, the style's scene clipped inside it. */
function iconArt(spec: ArtSpec, W: number, H: number, rnd: Rand, look: Look): string {
  const { style } = spec.params
  const dark = style === 'aurora' || style === 'neon'
  const P = Math.round(Math.min(W, H) * 0.62)
  const x = n1((W - P) / 2)
  const y = n1((H - P) / 2 - P * 0.02)
  const plate = `x='${x}' y='${y}' width='${P}' height='${P}' rx='${n1(P * (style === 'pixel' ? 0.12 : 0.225))}'`
  const defs = `<radialGradient id='ibg' cx='0.5' cy='0.38' r='0.8'><stop offset='0' stop-color='${dark ? '#1d2130' : '#f6f7fb'}'/><stop offset='1' stop-color='${dark ? '#0a0c12' : '#dde2ec'}'/></radialGradient>`
    + `<clipPath id='iclip'><rect ${plate}/></clipPath>`
    + `<linearGradient id='igloss' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='#fff' stop-opacity='0.36'/><stop offset='0.5' stop-color='#fff' stop-opacity='0'/></linearGradient>`
    + `<filter id='idrop' x='-30%' y='-30%' width='160%' height='160%'><feDropShadow dx='0' dy='2' stdDeviation='2.5' flood-color='#0b0d1a' flood-opacity='0.3'/></filter>`
    + blur('ishadow', P * 0.05) + blur('iglow', 3)
  const scene = SCENES[style]({ W: 640, H: 640, rnd, look, mood: spec.mood, id: 's' })
  // A light glyph needs an edge on a light plate; the neon one carries its own glow.
  const lift = style === 'neon' ? '' : ` filter='url(#idrop)'`
  return `<defs>${defs}</defs><rect width='${W}' height='${H}' fill='url(#ibg)'/>`
    + `<rect ${plate} fill='#0b0d1a' fill-opacity='${dark ? 0.5 : 0.24}' filter='url(#ishadow)' transform='translate(0 ${n1(P * 0.05)})'/>`
    + `<g clip-path='url(#iclip)'><svg x='${x}' y='${y}' width='${P}' height='${P}' viewBox='0 0 640 640' preserveAspectRatio='xMidYMid slice'>${scene}</svg></g>`
    + `<rect ${plate} fill='url(#igloss)'/>`
    + `<rect ${plate} fill='none' stroke='#fff' stroke-opacity='0.4' stroke-width='${n1(P * 0.008)}'/>`
    + `<g transform='translate(${n1(x + P * 0.25)} ${n1(y + P * 0.25)}) scale(${Math.round(P * 0.5) / 100})'${lift}>${glyphArt(spec.glyph, style)}</g>`
}

function paint(spec: ArtSpec): string {
  const { params } = spec
  const [W, H] = SIZE[params.ratio]
  const rnd = mulberry32(hashString(`${spec.key}|${params.style}|${params.ratio}|${params.seed}|${spec.index}|${spec.variant}`))
  const look: Look = {
    vivid: 0.55 + (params.guidance / 12) * 0.45,
    detail: Math.min(1.7, Math.max(0.3, params.steps / 30)),
  }
  const body = spec.subject === 'icon'
    ? iconArt(spec, W, H, rnd, look)
    : SCENES[params.style]({ W, H, rnd, look, mood: spec.mood, id: 'a' })
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}' viewBox='0 0 ${W} ${H}'>${body}</svg>`)}`
}

// Wallpaper words win: the playback prompt asks for a wallpaper with room for icons.
function subjectOf(prompt: string): Subject {
  if (/壁纸|背景|wallpaper|background|backdrop/i.test(prompt))
    return 'wallpaper'
  return /图标|标志|icon|logo/i.test(prompt) ? 'icon' : 'wallpaper'
}

function glyphOf(prompt: string): Glyph {
  return /剪贴板|clipboard/i.test(prompt) ? 'clipboard' : 'spark'
}

function moodOf(prompt: string): Mood {
  if (/日落|黄昏|夕阳|sunset|dusk/i.test(prompt))
    return 'sunset'
  if (/夜|星空|night|stars/i.test(prompt))
    return 'night'
  return /白天|晴|daylight|sunny/i.test(prompt) ? 'day' : null
}

/** The scripted prompt and the suggestions draw the same pictures in either language. */
function artKeyOf(prompt: string): string {
  if (prompt === copy.value.scriptPrompt)
    return 'script'
  return copy.value.suggestions.find(suggestion => suggestion.text === prompt)?.id ?? prompt
}

/* ─── State ───────────────────────────────────────────────────────────── */

const rootRef = ref<HTMLElement | null>(null)
const paramsRef = ref<HTMLElement | null>(null)
const resultsRef = ref<HTMLElement | null>(null)
const viewerOpen = ref(false)
const viewerIndex = ref(0)

const ids = { params: useId(), ratio: useId(), count: useId(), seed: useId() }

const stageWidth = ref(0)
const mode = computed<Mode>(() => {
  const width = stageWidth.value
  // The frame reports 0 before its first measurement; lay out as a column until then.
  if (width <= 0)
    return 'column'
  if (width < 640)
    return 'narrow'
  return width < 960 ? 'column' : 'wide'
})

function onStageResize(width: number): void {
  stageWidth.value = width
}

const session = ref(0)
let setSeq = 0

function createSet(prompt: string, params: Params, key: string, live: boolean, when: WhenKey): GenSet {
  const id = `s${session.value}-${++setSeq}`
  const subject = subjectOf(prompt)
  const glyph = glyphOf(prompt)
  const mood = moodOf(prompt)
  const tiles = Array.from({ length: params.count }, (_, index): Tile => {
    const src = paint({ key, params, subject, glyph, mood, index, variant: 0 })
    return { id: `${id}-t${index}`, index, variant: 0, src, shownSrc: live ? '' : src, status: live ? 'queued' : 'done', gen: live }
  })
  return { id, prompt, params: { ...params }, key, subject, glyph, mood, tiles, generating: live, when }
}

function seedSets(): GenSet[] {
  return SEEDS.map(seed => createSet(L(seed.prompt), seed.params, seed.key, false, seed.when))
}

const sets = ref<GenSet[]>(seedSets())
const activeId = ref(sets.value[0]?.id ?? '')
const activeSet = computed(() => sets.value.find(set => set.id === activeId.value) ?? null)
/** The active set as a list, so the template gets a non-null `set`. */
const shown = computed(() => (activeSet.value ? [activeSet.value] : []))
const generating = computed(() => activeSet.value?.generating ?? false)

const form = reactive<Params>({ ...ACTIVE_SEED.params })
const draft = ref('')
const pressing = ref(false)
const sheetOpen = ref(false)
const advanced = ref<string[]>([])
const applied = reactive<Record<Subject, string | null>>({ wallpaper: null, icon: null })
const reduced = ref(false)
const onScreen = ref(true)

let entered = false
let touched = false
let scripted = false
let disposed = false
/** Set once a reveal never reported back (no WebGL, a lost context): later tiles skip the effect. */
let effectFailed = false

const paramsSummary = computed(() => `${copy.value.styles[form.style]} · ${form.ratio}`)
const countSegments = computed<SegmentedSliderSegment[]>(() => COUNTS.map(count => ({ value: count, label: copy.value.countValue(count) })))

const progress = computed(() => {
  const set = activeSet.value
  if (!set?.generating)
    return ''
  return copy.value.progress(set.tiles.filter(tile => tile.status === 'done').length, set.tiles.length)
})

function tileName(set: GenSet, tile: Tile): string {
  return copy.value.tileName(copy.value.styles[set.params.style], set.params.ratio, tile.index + 1)
}

/** Breakable only after a separator (see `.img-studio-set__meta`). */
function historyMeta(set: GenSet): string {
  return [copy.value.styles[set.params.style], set.params.ratio, copy.value.countValue(set.tiles.length), copy.value.when[set.when]]
    .map(part => part.replaceAll(' ', '\u00A0'))
    .join('\u00A0· ')
}

// The finished images of the set on screen, with ids alongside so Zoom can find its own.
const viewerTiles = computed(() => {
  const set = activeSet.value
  if (!set)
    return []
  const [width, height] = SIZE[set.params.ratio]
  // The preview counts the images itself, so their name leaves the position out.
  const name = copy.value.viewerName(copy.value.styles[set.params.style], set.params.ratio)
  return set.tiles
    .filter(tile => tile.status === 'done' && tile.shownSrc)
    .map(tile => ({ id: tile.id, item: { url: tile.shownSrc, name, alt: set.prompt, width, height } satisfies ImagePreviewItem }))
})
const viewerItems = computed(() => viewerTiles.value.map(entry => entry.item))

function findTile(setId: string, tileId: string): { set: GenSet, tile: Tile } | null {
  const set = sets.value.find(item => item.id === setId)
  const tile = set?.tiles.find(item => item.id === tileId)
  return set && tile ? { set, tile } : null
}

/* ─── Stage clock ─────────────────────────────────────────────────────── */

// Every scripted step and generation step is a cue on one clock. The clock
// stops while the stage is off screen or the tab is hidden, so nothing runs
// ahead unseen, and a cue group can be dropped as a whole.

let cues: Cue[] = []
let cueTimer: ReturnType<typeof setTimeout> | undefined
let frozenAt: number | null = null
let pausedFor = 0

function clock(): number {
  return (frozenAt ?? performance.now()) - pausedFor
}

function cue(delay: number, group: string, run: () => void): void {
  if (disposed)
    return
  cues.push({ at: clock() + delay, group, run })
  armCues()
}

function armCues(): void {
  clearTimeout(cueTimer)
  cueTimer = undefined
  if (frozenAt !== null || cues.length === 0)
    return
  const next = Math.min(...cues.map(item => item.at))
  cueTimer = setTimeout(fireCues, Math.max(0, next - clock()))
}

/** The earliest cue that is due, unless the clock is frozen. */
function nextDue(): Cue | undefined {
  if (frozenAt !== null)
    return undefined
  const now = clock()
  let due: Cue | undefined
  for (const item of cues) {
    if (item.at <= now && (!due || item.at < due.at))
      due = item
  }
  return due
}

function fireCues(): void {
  cueTimer = undefined
  // One cue at a time: a cue may drop others, and a dropped cue must not run
  // just because it was already due.
  for (let due = nextDue(); due; due = nextDue()) {
    const current = due
    cues = cues.filter(item => item !== current)
    current.run()
  }
  armCues()
}

function dropCues(group?: string): void {
  cues = group === undefined ? [] : cues.filter(item => item.group !== group)
  armCues()
}

function syncClock(): void {
  const running = onScreen.value && !(hasDocument() && document.visibilityState === 'hidden')
  if (!running && frozenAt === null) {
    frozenAt = performance.now()
    armCues()
  }
  else if (running && frozenAt !== null) {
    pausedFor += performance.now() - frozenAt
    frozenAt = null
    armCues()
  }
}

/* ─── Generation ──────────────────────────────────────────────────────── */

const handles = new Map<string, ImageGenerationHandle>()

function setGenRef(tileId: string, el: unknown): void {
  if (el)
    handles.set(tileId, el as ImageGenerationHandle)
  else
    handles.delete(tileId)
}

function animates(): boolean {
  return !reduced.value && !effectFailed
}

/**
 * Moves focus out of a region about to disable or hide what holds it. Left
 * there, focus falls to <body>, where Esc no longer reaches the expanded frame.
 */
function keepFocusIn(region: Element | null | undefined, target?: HTMLElement | null): void {
  if (!region || !hasDocument())
    return
  const active = document.activeElement
  if (active && region.contains(active))
    (target ?? rootRef.value)?.focus({ preventScroll: true })
}

/** Settles whatever the active set still has in flight and leaves it as plain images. */
function finishActive(): void {
  const set = activeSet.value
  if (!set)
    return
  for (const tile of set.tiles) {
    tile.status = 'done'
    tile.shownSrc = tile.src
    tile.gen = false
    dropCues(`tile:${tile.id}`)
  }
  set.generating = false
  dropCues(`gen:${set.id}`)
}

function generate(): void {
  const prompt = draft.value.trim()
  if (!prompt || generating.value)
    return
  // ⌘/Ctrl+Enter from a tile's actions: those tiles are about to be replaced.
  keepFocusIn(resultsRef.value)
  finishActive()
  const live = animates()
  const set = createSet(prompt, form, artKeyOf(prompt), live, 'now')
  sets.value = [set, ...sets.value].slice(0, MAX_SETS)
  activeId.value = set.id
  if (!live) {
    notify(copy.value.generated(set.tiles.length), 'i-carbon-checkmark-outline')
    return
  }
  set.tiles.forEach((tile, index) => {
    cue(REVEAL_LEAD + index * REVEAL_STAGGER, `gen:${set.id}`, () => void revealTile(set.id, tile.id))
  })
}

async function revealTile(setId: string, tileId: string): Promise<void> {
  const found = findTile(setId, tileId)
  if (!found || found.tile.status !== 'queued')
    return
  // Triggers are ignored while paused, and a queued tile is paused off screen;
  // the new status reaches the component's `paused` prop on the next render.
  found.tile.status = 'revealing'
  await nextTick()
  const again = findTile(setId, tileId)
  if (!again || again.tile.status !== 'revealing')
    return
  const handle = handles.get(tileId)
  if (!handle) {
    settleTile(setId, tileId)
    return
  }
  handle.triggerReveal({ hold: 'manual' })
  watchTile(setId, tileId)
}

/** Whether a tile is inside both the results grid and the window: TxImageGeneration only draws those. */
function tileInView(tileId: string): boolean {
  const results = resultsRef.value
  const el = results?.querySelector<HTMLElement>(`[data-tile-id="${tileId}"]`)
  if (!results || !el || !hasWindow())
    return false
  const box = results.getBoundingClientRect()
  const rect = el.getBoundingClientRect()
  return rect.bottom > Math.max(box.top, 0) && rect.top < Math.min(box.bottom, window.innerHeight)
    && rect.right > Math.max(box.left, 0) && rect.left < Math.min(box.right, window.innerWidth)
}

function watchTile(setId: string, tileId: string): void {
  // A reveal that never reports `visible` would leave the tile spinning: drop
  // the effect and show the image. One scrolled out of the grid is only
  // waiting to be drawn, so it gets another round.
  cue(REVEAL_WATCHDOG, `tile:${tileId}`, () => {
    const found = findTile(setId, tileId)
    if (!found || found.tile.status === 'done')
      return
    if (!tileInView(tileId)) {
      watchTile(setId, tileId)
      return
    }
    effectFailed = true
    found.tile.gen = false
    settleTile(setId, tileId)
  })
}

function onCycle(setId: string, tileId: string, event: ImageGenerationCycleEvent): void {
  if (event.phase !== 'visible')
    return
  const found = findTile(setId, tileId)
  if (found?.tile.status === 'revealing' && event.src === found.tile.src)
    settleTile(setId, tileId)
}

function settleTile(setId: string, tileId: string): void {
  const found = findTile(setId, tileId)
  if (!found)
    return
  const { set, tile } = found
  tile.status = 'done'
  tile.shownSrc = tile.src
  dropCues(`tile:${tileId}`)
  if (!set.generating || set.tiles.some(item => item.status !== 'done'))
    return
  set.generating = false
  dropCues(`gen:${set.id}`)
  notify(copy.value.generated(set.tiles.length), 'i-carbon-checkmark-outline')
}

async function vary(setId: string, tileId: string): Promise<void> {
  const found = findTile(setId, tileId)
  if (!found || found.tile.status !== 'done')
    return
  const { set, tile } = found
  tile.variant++
  tile.src = paint({ key: set.key, params: set.params, subject: set.subject, glyph: set.glyph, mood: set.mood, index: tile.index, variant: tile.variant })
  if (!animates()) {
    tile.shownSrc = tile.src
    tile.gen = false
    return
  }
  // The tile's actions disable while it varies; the tile itself keeps focus.
  const tileEl = resultsRef.value?.querySelector<HTMLElement>(`[data-tile-id="${tileId}"]`)
  keepFocusIn(tileEl, tileEl)
  const handle = tile.gen ? handles.get(tile.id) : undefined
  if (!handle?.isImageActive()) {
    // A restored tile has no effect mounted: mount one and generate from scratch.
    tile.gen = true
    tile.status = 'queued'
    await nextTick()
    void revealTile(setId, tileId)
    return
  }
  // Churn the finished image into cells, then dissolve the variant in over it.
  tile.status = 'churning'
  await nextTick()
  if (findTile(setId, tileId)?.tile.status !== 'churning')
    return
  handle.triggerRegenerate({ autoReveal: false })
  cue(CHURN_MS, `tile:${tileId}`, async () => {
    const current = findTile(setId, tileId)
    if (current?.tile.status !== 'churning')
      return
    current.tile.status = 'revealing'
    await nextTick()
    handles.get(tileId)?.triggerReveal({ hold: 'manual' })
    watchTile(setId, tileId)
  })
}

function restoreSet(id: string): void {
  if (id === activeId.value)
    return
  const set = sets.value.find(item => item.id === id)
  if (!set)
    return
  finishActive()
  activeId.value = id
  Object.assign(form, set.params)
  draft.value = set.prompt
}

async function copyPrompt(set: GenSet): Promise<void> {
  await writeClipboard(set.prompt)
  notify(copy.value.copied, 'i-carbon-copy')
}

function applyTile(set: GenSet, tile: Tile): void {
  const subject = set.subject
  const previous = applied[subject]
  applied[subject] = tile.id
  notify(copy.value.appliedToast[subject], subject === 'icon' ? 'i-carbon-image' : 'i-carbon-screen', () => {
    applied[subject] = previous
  })
}

function openViewer(tile: Tile, event: MouseEvent): void {
  const index = viewerTiles.value.findIndex(entry => entry.id === tile.id)
  if (index < 0)
    return
  // The preview returns focus to whatever had it on opening, and WebKit does
  // not focus a clicked button: hand it this one.
  ;(event.currentTarget as HTMLElement | null)?.focus({ preventScroll: true })
  viewerIndex.value = index
  viewerOpen.value = true
}

/* ─── Parameters and prompt ───────────────────────────────────────────── */

function isStyle(value: unknown): value is StyleKey {
  return STYLES.includes(value as StyleKey)
}

function isRatio(value: unknown): value is RatioKey {
  return RATIOS.includes(value as RatioKey)
}

function onStyle(value: TxFlatSelectValue): void {
  if (isStyle(value))
    form.style = value
}

function onRatio(value: TxFlatRadioValue | TxFlatRadioValue[]): void {
  if (isRatio(value))
    form.ratio = value
}

function onCount(value: number | string): void {
  const count = Number(value)
  if (COUNTS.includes(count))
    form.count = count
}

function onSeed(value: number | null): void {
  if (value !== null && Number.isFinite(value))
    form.seed = Math.min(SEED_MAX, Math.max(0, Math.round(value)))
}

function randomSeed(): void {
  form.seed = Math.floor(Math.random() * (SEED_MAX + 1))
}

function onGuidance(value: number): void {
  form.guidance = value
}

function onSteps(value: number): void {
  form.steps = value
}

function onAdvanced(value: string | string[]): void {
  advanced.value = Array.isArray(value) ? value : value ? [value] : []
}

function onSend(): void {
  generate()
  // The send button disables itself while the set generates; Enter in the prompt keeps its focus.
  keepFocusIn(rootRef.value?.querySelector('.img-studio__composer .tx-bui-prompt-bar__send'))
}

function onSuggestion(suggestion: AiSuggestion): void {
  draft.value = suggestion.text
  const preset = SUGGESTION_PARAMS[suggestion.id]
  if (preset)
    Object.assign(form, preset)
}

/* ─── Parameter sheet (below 640px) ───────────────────────────────────── */

function openSheet(): void {
  sheetOpen.value = true
  void nextTick(() => paramsRef.value?.focus({ preventScroll: true }))
}

function closeSheet(): void {
  if (!sheetOpen.value)
    return
  sheetOpen.value = false
  void nextTick(() => rootRef.value?.querySelector<HTMLElement>('.img-studio__params-toggle')?.focus({ preventScroll: true }))
}

watch(mode, (next) => {
  if (next !== 'narrow')
    sheetOpen.value = false
})

function onRootKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing)
    return
  // ⌘/Ctrl+Enter generates from anywhere in the studio. In the prompt itself
  // TxPromptBar sends on Enter first and claims the key.
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    generate()
    return
  }
  if (event.key !== 'Escape' || !sheetOpen.value)
    return
  // An open style menu closes on this press by itself (TxFlatSelect listens on document).
  const target = event.target as HTMLElement | null
  if (target?.closest('[aria-expanded="true"]:is([aria-haspopup], [role="combobox"])'))
    return
  // Closing the sheet is this press's whole job; the expanded overlay stays open.
  event.preventDefault()
  closeSheet()
}

/* ─── Toast ───────────────────────────────────────────────────────────── */

const toast = reactive({ open: false, text: '', icon: 'i-carbon-checkmark-outline', undoable: false })
const toastHold: Record<HoldKind, boolean> = { hover: false, focus: false }
let toastTimer: ReturnType<typeof setTimeout> | undefined
let toastUndo: (() => void) | null = null

function armToast(ms: number): void {
  clearTimeout(toastTimer)
  toastTimer = setTimeout(closeToast, ms)
}

function notify(text: string, icon: string, undo?: () => void): void {
  if (disposed)
    return
  toast.text = text
  toast.icon = icon
  toast.undoable = Boolean(undo)
  toastUndo = undo ?? null
  toast.open = true
  if (toastHold.hover || toastHold.focus)
    clearTimeout(toastTimer)
  else
    armToast(undo ? TOAST_UNDO_MS : TOAST_MS)
}

function holdToast(kind: HoldKind): void {
  toastHold[kind] = true
  clearTimeout(toastTimer)
}

function releaseToast(kind: HoldKind): void {
  toastHold[kind] = false
  if (toast.open && !toastHold.hover && !toastHold.focus)
    armToast(TOAST_REARM_MS)
}

function onToastFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null
  if (next && (event.currentTarget as HTMLElement).contains(next))
    return
  releaseToast('focus')
}

function closeToast(): void {
  clearTimeout(toastTimer)
  toastTimer = undefined
  toast.open = false
  toastUndo = null
  toastHold.hover = false
  toastHold.focus = false
}

/** The toast's own buttons go inert with it, so focus moves to the stage first. */
function dismissToast(): void {
  keepFocusIn(rootRef.value?.querySelector('.img-studio__toast'))
  closeToast()
}

function undoToast(): void {
  toastUndo?.()
  dismissToast()
}

/* ─── Results grid ────────────────────────────────────────────────────── */

const grid = reactive<GridFit>({ cols: 2, w: 0, h: 0, scroll: false })
const resultsBox = { width: 0, height: 0 }

// Tiles take their height from the ratio, so the fallback before the first
// measurement is still the right shape.
const gridStyle = computed(() => {
  const [w, h] = SIZE[activeSet.value?.params.ratio ?? form.ratio]
  return {
    '--cols': String(grid.cols),
    '--tile-ratio': `${w} / ${h}`,
    ...(grid.w > 0 ? { '--tile-w': `${grid.w}px` } : {}),
  }
})

/** The column count that gives the largest tiles at the images' own ratio. */
function fitGrid(count: number, aspect: number, width: number, height: number, maxCols: number): GridFit {
  let best: GridFit = { cols: 1, w: 0, h: 0, scroll: false }
  for (let cols = 1; cols <= Math.min(count, maxCols); cols++) {
    const rows = Math.ceil(count / cols)
    let w = (width - GRID_GAP * (cols - 1)) / cols
    let h = w / aspect
    const fitH = (height - GRID_GAP * (rows - 1)) / rows
    if (h > fitH) {
      h = fitH
      w = h * aspect
    }
    if (w > 0 && h > 0 && w * h > best.w * best.h)
      best = { cols, w: Math.floor(w), h: Math.floor(h), scroll: false }
  }
  if (best.w >= MIN_TILE)
    return best
  // Too small to judge: fill the width and let the grid scroll.
  const cols = Math.min(count, maxCols, width >= MIN_TILE * 2 + GRID_GAP ? 2 : 1)
  let w = Math.floor((width - GRID_GAP * (cols - 1)) / cols)
  let h = Math.floor(w / aspect)
  if (h > height) {
    h = Math.floor(height)
    w = Math.floor(h * aspect)
  }
  return { cols, w, h, scroll: true }
}

function refit(): void {
  const set = activeSet.value
  if (!set || resultsBox.width <= 0 || resultsBox.height <= 0)
    return
  const [w, h] = SIZE[set.params.ratio]
  Object.assign(grid, fitGrid(set.tiles.length, w / h, resultsBox.width, resultsBox.height, mode.value === 'narrow' ? 2 : 4))
}

watch([() => activeSet.value?.params.ratio, () => activeSet.value?.tiles.length, mode], refit)

/* ─── Playback ────────────────────────────────────────────────────────── */

function applyScript(): void {
  Object.assign(form, SCRIPT)
  draft.value = copy.value.scriptPrompt
}

function start(): void {
  if (touched)
    return
  if (!animates()) {
    // Reduced motion: the finished state at once; only the toast's own timer runs.
    applyScript()
    generate()
    return
  }
  scripted = true
  const prompt = copy.value.scriptPrompt
  cue(260, 'script', () => {
    form.style = SCRIPT.style
  })
  cue(560, 'script', () => {
    form.ratio = SCRIPT.ratio
  })
  cue(820, 'script', () => {
    form.seed = SCRIPT.seed
  })
  for (let step = 1; step <= TYPE_STEPS; step++) {
    cue(TYPE_START + step * TYPE_INTERVAL, 'script', () => {
      draft.value = prompt.slice(0, Math.round((prompt.length * step) / TYPE_STEPS))
    })
  }
  const typed = TYPE_START + TYPE_STEPS * TYPE_INTERVAL
  cue(typed + 200, 'script', () => {
    pressing.value = true
  })
  cue(typed + 380, 'script', () => {
    pressing.value = false
    scripted = false
    generate()
  })
}

/** Any reader input ends the script; a generation already running carries on. */
function onReaderInput(event: Event): void {
  touched = true
  if (!scripted)
    return
  scripted = false
  dropCues('script')
  pressing.value = false
  if (event.type === 'pointerdown')
    holdScript()
  else
    applyScript()
}

// The finished prompt grows the composer and moves the tiles below it. Filled in as a press ends
// the script, it would bring the press up on something else and lose its click, so it waits for
// the click and goes in just ahead of it.
const PRESS_ENDS = ['mouseup', 'pointercancel', 'dragend', 'contextmenu'] as const
let scriptHeld = false

function watchPressEnd(): void {
  for (const type of PRESS_ENDS)
    window.addEventListener(type, onPressEnd, true)
  // Not captured: an element's blur, as the press moves focus, is not the press ending.
  window.addEventListener('blur', onPressEnd)
}

function unwatchPressEnd(): void {
  for (const type of PRESS_ENDS)
    window.removeEventListener(type, onPressEnd, true)
  window.removeEventListener('blur', onPressEnd)
}

function holdScript(): void {
  scriptHeld = true
  watchPressEnd()
}

/** A press that clicks nothing here still ends: the script goes in after any click it makes. */
function onPressEnd(): void {
  unwatchPressEnd()
  setTimeout(releaseScript)
}

/** Fills the finished script in, if a press is holding it back. */
function releaseScript(): void {
  if (!scriptHeld)
    return
  dropHeldScript()
  applyScript()
}

function dropHeldScript(): void {
  if (!scriptHeld)
    return
  scriptHeld = false
  unwatchPressEnd()
}

function onEnter(): void {
  entered = true
  start()
}

function resetDemo(): void {
  dropCues()
  closeToast()
  viewerOpen.value = false
  session.value++
  sets.value = seedSets()
  activeId.value = sets.value[0]?.id ?? ''
  Object.assign(form, ACTIVE_SEED.params)
  draft.value = ''
  pressing.value = false
  sheetOpen.value = false
  advanced.value = []
  applied.wallpaper = null
  applied.icon = null
  touched = false
  scripted = false
  dropHeldScript()
  if (entered)
    void nextTick(start)
}

defineExpose({ resetDemo })

watch(locale, resetDemo)

/* ─── Lifecycle ───────────────────────────────────────────────────────── */

let visibility: IntersectionObserver | null = null
let sizing: ResizeObserver | null = null

function onVisibilityChange(): void {
  syncClock()
}

onMounted(() => {
  reduced.value = prefersReducedMotion()
  const root = rootRef.value
  if (root && typeof IntersectionObserver === 'function') {
    visibility = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (!entry)
        return
      onScreen.value = entry.isIntersecting
      syncClock()
    })
    visibility.observe(root)
  }
  if (hasDocument())
    document.addEventListener('visibilitychange', onVisibilityChange)
  const results = resultsRef.value
  if (results && typeof ResizeObserver === 'function') {
    sizing = new ResizeObserver((entries) => {
      const rect = entries[entries.length - 1]?.contentRect
      if (!rect)
        return
      resultsBox.width = rect.width
      resultsBox.height = rect.height
      refit()
    })
    sizing.observe(results)
  }
})

onBeforeUnmount(() => {
  disposed = true
  cues = []
  clearTimeout(cueTimer)
  clearTimeout(toastTimer)
  visibility?.disconnect()
  visibility = null
  sizing?.disconnect()
  sizing = null
  dropHeldScript()
  if (hasDocument())
    document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <TemplateFrame :title="copy.frameTitle" :height="600" @enter="onEnter">
    <template #default="{ width: stageW, height: stageH }">
      <StageSize :width="stageW" :height="stageH" @resize="onStageResize" />
      <div
        ref="rootRef"
        class="img-studio"
        :class="[`is-${mode}`, { 'is-offscreen': !onScreen }]"
        tabindex="-1"
        @pointerdown.capture="onReaderInput"
        @click.capture="releaseScript"
        @keydown.capture="onReaderInput"
        @focusin="onReaderInput"
        @keydown="onRootKeydown"
      >
        <header class="img-studio__head">
          <span class="img-studio__logo" aria-hidden="true"><span class="i-carbon-image-reference" /></span>
          <div class="img-studio__heading">
            <strong class="img-studio__title">{{ copy.heading }}</strong>
            <span class="img-studio__subtitle">{{ copy.subtitle }}</span>
          </div>
          <span class="img-studio__sample">{{ copy.sample }}</span>
          <!-- Hidden from assistive tech: the tiles carry their own status and the toast announces the end. -->
          <span v-if="progress" class="img-studio__progress" aria-hidden="true">
            <span class="img-studio__pulse" />
            <span class="img-studio__progress-text">{{ progress }}</span>
          </span>
          <TxButton
            v-if="mode === 'narrow'"
            class="img-studio__params-toggle"
            variant="secondary"
            size="sm"
            icon="i-carbon-settings-adjust"
            :aria-label="copy.paramsToggle(paramsSummary)"
            :aria-expanded="sheetOpen ? 'true' : 'false'"
            :aria-controls="ids.params"
            @click="openSheet"
          >
            <span class="img-studio__params-summary">{{ paramsSummary }}</span>
          </TxButton>
          <TxIconButton icon="i-carbon-renew" size="sm" :label="copy.replay" @click="resetDemo" />
        </header>

        <div class="img-studio__body">
          <!-- One parameter panel for every width: a rail, or a sheet over the
               results below 640px (not TxDrawer, which would take Tab and
               Escape on the whole document). -->
          <div v-if="mode === 'narrow'" class="img-studio__scrim" :class="{ 'is-open': sheetOpen }" aria-hidden="true" @click="closeSheet" />
          <aside
            :id="ids.params"
            ref="paramsRef"
            class="img-studio__params"
            :class="{ 'is-sheet': mode === 'narrow', 'is-open': sheetOpen }"
            :aria-label="copy.params"
            :tabindex="mode === 'narrow' ? -1 : undefined"
            :inert="mode === 'narrow' && !sheetOpen ? true : undefined"
          >
            <div class="img-studio__params-head">
              <span class="img-studio__section">{{ copy.params }}</span>
              <TxIconButton v-if="mode === 'narrow'" icon="i-carbon-close" size="xs" :label="copy.closeParams" @click="closeSheet" />
            </div>

            <!-- A label, not a heading: the trigger is a button, so the label names it. -->
            <label class="img-studio-field">
              <span class="img-studio-field__label">{{ copy.style }}</span>
              <TxFlatSelect :model-value="form.style" :placeholder="copy.style" @update:model-value="onStyle">
                <TxFlatSelectItem v-for="key in STYLES" :key="key" :value="key" :label="copy.styles[key]" />
              </TxFlatSelect>
            </label>

            <div class="img-studio-field">
              <span :id="ids.ratio" class="img-studio-field__label">{{ copy.ratio }}</span>
              <TxFlatRadio :model-value="form.ratio" size="sm" :aria-labelledby="ids.ratio" @update:model-value="onRatio">
                <TxFlatRadioItem v-for="key in RATIOS" :key="key" :value="key" :label="key">
                  <template #icon>
                    <span class="img-studio-ratio" :class="`is-${RATIO_SHAPE[key]}`" aria-hidden="true" />
                  </template>
                </TxFlatRadioItem>
              </TxFlatRadio>
            </div>

            <div class="img-studio-field">
              <div class="img-studio-field__row">
                <span :id="ids.count" class="img-studio-field__label">{{ copy.count }}</span>
                <span class="img-studio-field__value">{{ copy.countValue(form.count) }}</span>
              </div>
              <div class="img-studio-field__slider">
                <TxSegmentedSlider
                  :model-value="form.count"
                  :segments="countSegments"
                  :show-labels="false"
                  :aria-labelledby="ids.count"
                  @update:model-value="onCount"
                />
              </div>
            </div>

            <div class="img-studio-field">
              <span :id="ids.seed" class="img-studio-field__label">{{ copy.seed }}</span>
              <div class="img-studio-field__seed">
                <TxNumberInput
                  :model-value="form.seed"
                  :min="0"
                  :max="SEED_MAX"
                  :controls="false"
                  :aria-labelledby="ids.seed"
                  @update:model-value="onSeed"
                />
                <TxIconButton icon="i-carbon-shuffle" size="sm" :label="copy.randomSeed" @click="randomSeed" />
              </div>
            </div>

            <TxCollapse :model-value="advanced" class="img-studio__advanced" @update:model-value="onAdvanced">
              <TxCollapseItem name="advanced" :title="copy.advanced">
                <div class="img-studio__scrubs">
                  <TxScrubField
                    :model-value="form.guidance"
                    :label="copy.guidance"
                    :value-label="copy.guidanceValue"
                    :min="1"
                    :max="12"
                    @update:model-value="onGuidance"
                  />
                  <TxScrubField
                    :model-value="form.steps"
                    :label="copy.steps"
                    :value-label="copy.stepsValue"
                    :min="10"
                    :max="50"
                    :step="5"
                    @update:model-value="onSteps"
                  />
                </div>
                <p class="img-studio__note">
                  <span class="i-carbon-information" aria-hidden="true" />
                  <span>{{ copy.advancedNote }}</span>
                </p>
              </TxCollapseItem>
            </TxCollapse>
          </aside>

          <section class="img-studio__main" :inert="mode === 'narrow' && sheetOpen ? true : undefined">
            <div class="img-studio__composer" :class="{ 'is-pressing': pressing }">
              <!-- The prompt stays after a send, so the next set can start from it. -->
              <TxPromptBar
                v-model="draft"
                :clear-on-send="false"
                :placeholder="copy.placeholder"
                :aria-label="copy.promptLabel"
                :send-label="copy.generate"
                :submitting="generating"
                :max-height="72"
                @send="onSend"
              />
              <TxSuggestionChips :suggestions="copy.suggestions" :aria-label="copy.suggestionsLabel" @select="onSuggestion" />
            </div>

            <div
              ref="resultsRef"
              class="img-studio__results"
              :class="{ 'is-scroll': grid.scroll }"
              :style="gridStyle"
              role="list"
              :aria-label="copy.results"
              :aria-busy="generating ? 'true' : undefined"
            >
              <template v-for="set in shown" :key="set.id">
                <div
                  v-for="tile in set.tiles"
                  :key="tile.id"
                  class="img-studio-tile"
                  :class="`is-${tile.status}`"
                  :data-tile-id="tile.id"
                  role="listitem"
                  :aria-label="tileName(set, tile)"
                  tabindex="-1"
                >
                  <!-- Done tiles stay mounted, paused, so a variant can churn the image they show. -->
                  <TxImageGeneration
                    v-if="!reduced && tile.gen"
                    :ref="(el) => setGenRef(tile.id, el)"
                    class="img-studio-tile__gen"
                    :preset="EFFECT[set.params.style]"
                    :images="tile.src"
                    :border-radius="12"
                    :paused="tile.status === 'done' || (tile.status === 'queued' && !onScreen)"
                    @cycle="(event) => onCycle(set.id, tile.id, event)"
                  />
                  <img
                    v-if="tile.shownSrc"
                    :key="tile.shownSrc"
                    class="img-studio-tile__img"
                    :src="tile.shownSrc"
                    :alt="copy.tileAlt(set.prompt, tile.index + 1)"
                    draggable="false"
                  >
                  <span v-if="tile.status !== 'done'" class="img-studio-tile__status">
                    <span class="img-studio__pulse" aria-hidden="true" />
                    {{ tile.variant > 0 ? copy.varying : copy.generating }}
                  </span>
                  <span v-if="applied[set.subject] === tile.id" class="img-studio-tile__badge">
                    <span class="i-carbon-checkmark-filled" aria-hidden="true" />
                    {{ copy.badge[set.subject] }}
                  </span>
                  <div class="img-studio-tile__actions" role="group" :aria-label="copy.actions(tile.index + 1)">
                    <TxIconButton
                      icon="i-carbon-zoom-in"
                      size="xs"
                      :label="copy.zoom"
                      :disabled="tile.status !== 'done'"
                      @click="openViewer(tile, $event)"
                    />
                    <TxIconButton
                      icon="i-carbon-image-copy"
                      size="xs"
                      :label="copy.variant"
                      :disabled="tile.status !== 'done'"
                      @click="vary(set.id, tile.id)"
                    />
                    <TxIconButton
                      icon="i-carbon-copy"
                      size="xs"
                      :label="copy.copyPrompt"
                      :disabled="tile.status !== 'done'"
                      @click="copyPrompt(set)"
                    />
                    <TxIconButton
                      :icon="set.subject === 'icon' ? 'i-carbon-image' : 'i-carbon-screen'"
                      size="xs"
                      :label="copy.apply[set.subject]"
                      :disabled="tile.status !== 'done'"
                      @click="applyTile(set, tile)"
                    />
                  </div>
                </div>
              </template>
            </div>
          </section>

          <aside v-if="mode === 'wide'" class="img-studio__history" :aria-label="copy.historyLabel">
            <span class="img-studio__section">{{ copy.history }}</span>
            <ol class="img-studio__history-list">
              <li v-for="set in sets" :key="set.id">
                <button
                  type="button"
                  class="img-studio-set"
                  :class="{ 'is-active': set.id === activeId }"
                  :aria-current="set.id === activeId ? 'true' : undefined"
                  @click="restoreSet(set.id)"
                >
                  <span class="img-studio-set__thumbs" :class="`is-${set.tiles.length}`" aria-hidden="true">
                    <span v-for="tile in set.tiles" :key="tile.id" class="img-studio-set__thumb">
                      <img v-if="tile.shownSrc" :src="tile.shownSrc" alt="" draggable="false">
                    </span>
                  </span>
                  <span class="img-studio-set__prompt">{{ set.prompt }}</span>
                  <span class="img-studio-set__meta">{{ historyMeta(set) }}</span>
                </button>
              </li>
            </ol>
          </aside>
        </div>

        <!-- TxToastPanel fades rather than unmounts, so the wrapper is inert while closed. -->
        <div
          class="img-studio__toast"
          :class="{ 'is-open': toast.open }"
          :inert="toast.open ? undefined : true"
          @mouseenter="holdToast('hover')"
          @mouseleave="releaseToast('hover')"
          @focusin="holdToast('focus')"
          @focusout="onToastFocusOut"
        >
          <TxToastPanel :open="toast.open" :stack="0" :tether="false" :aria-label="copy.toastLabel">
            <div class="img-studio-toast">
              <span class="img-studio-toast__icon" :class="toast.icon" aria-hidden="true" />
              <span class="img-studio-toast__text">{{ toast.text }}</span>
              <button v-if="toast.undoable" type="button" class="img-studio-toast__action" @click="undoToast">
                {{ copy.undo }}
              </button>
              <button type="button" class="img-studio-toast__close" :aria-label="copy.dismiss" @click="dismissToast">
                <span class="i-carbon-close" aria-hidden="true" />
              </button>
            </div>
          </TxToastPanel>
        </div>

        <TxImagePreview
          v-model:open="viewerOpen"
          v-model:index="viewerIndex"
          :images="viewerItems"
          :label="copy.viewerTitle"
          :previous-label="copy.viewerPrevious"
          :next-label="copy.viewerNext"
          :close-label="copy.viewerClose"
          :zoom-in-label="copy.viewerZoomIn"
          :zoom-out-label="copy.viewerZoomOut"
          :zoom-label="copy.viewerZoom"
          :reset-label="copy.viewerReset"
          :failed-text="copy.viewerFailed"
          :rotate-label="copy.viewerRotate"
          :copy-label="copy.viewerCopy"
          :share-label="copy.viewerShare"
          :download-label="copy.viewerDownload"
          :menu-label="copy.viewerMenu"
          :indicator-label="copy.viewerStrip"
          :copied-text="copy.viewerCopied"
          :link-copied-text="copy.viewerLinkCopied"
          :copy-failed-text="copy.viewerCopyFailed"
          :indicator-item-formatter="copy.viewerItem"
          :label-formatter="copy.viewerDialog"
          :readout-label-formatter="copy.viewerReadout"
        />
      </div>
    </template>
  </TemplateFrame>
</template>
