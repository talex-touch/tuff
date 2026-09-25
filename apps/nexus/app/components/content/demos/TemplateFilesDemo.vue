<script setup lang="ts">
// Files template: the Tuff workspace's synced folders plus the per-plugin
// storage partition, in a file manager.
//
// The plugin partition follows the real host limits (per plugin: 100 MB in
// total, 10 MB per file, 1,000 files, flat, names matching
// `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$` — `plugin-business-file-storage.ts`),
// so an upload that breaks one of them fails the way the host would fail it.
// There is no plan or upgrade anywhere: the workspace only reports what it
// uses.
//
// One `trigger="manual"` TxContextMenu serves every tile and the empty area;
// it does not hand focus back when it closes, so the template does. Files
// dropped from the desktop go to a TxFileUploader laid over the file area,
// which only hands over `File` objects: progress, thumbnails (object URLs)
// and text previews are the template's, and so is revoking the URLs.
import type { BreadcrumbItem } from '@talex-touch/tuffex/breadcrumb'
import type { DataTableColumn, DataTableKey, DataTableSortState } from '@talex-touch/tuffex/data-table'
import type { FileUploaderFile } from '@talex-touch/tuffex/file-uploader'
import type { IconChipTone } from '@talex-touch/tuffex/icon-chip'
import type { ImageGalleryItem } from '@talex-touch/tuffex/image-gallery'
import type { ProgressBarProps } from '@talex-touch/tuffex/progress-bar'
import type { TreeKey, TreeNode, TreeValue } from '@talex-touch/tuffex/tree'
import { hasNavigator, hasWindow } from '@talex-touch/utils/env'
import { createReusableTemplate } from '@vueuse/core'
import { computed, defineComponent, nextTick, onBeforeUnmount, reactive, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

type NodeKind = 'folder' | 'image' | 'markdown' | 'text' | 'json' | 'csv' | 'pdf' | 'zip' | 'binary'
type SortKey = 'name' | 'modified' | 'size' | 'kind'
type ViewMode = 'grid' | 'list'
type Source = 'macbook' | 'windows' | 'plugin' | 'upload'
type Layout = 'search' | 'sidebar' | 'list' | 'grid' | 'chat' | 'menu' | 'wallpaper'
type PaletteName = 'night' | 'day' | 'dusk' | 'mint' | 'graphite'
type Mode = 'narrow' | 'column' | 'wide'

interface Bi { zh: string, en: string }

interface Art {
  layout: Layout
  palette: PaletteName
  seed: number
}

interface FileNode {
  id: string
  parentId: string | null
  kind: NodeKind
  /** The real file name; the same in both languages. */
  name: string
  /** Display name for folders the workspace creates itself. */
  label?: Bi
  size: number
  modifiedAt: number
  source?: Source
  art?: Art
  /** Pixel size, for images. */
  dims?: [number, number]
  /** Body of a text file, for the preview. */
  preview?: Bi
  isNew?: boolean
  /** An uploaded image: owned, and revoked, by the template. */
  objectUrl?: string
}

type UploadError = 'badName' | 'tooBig' | 'tooMany' | 'full'

interface UploadJob {
  id: string
  name: string
  size: number
  folderId: string
  progress: number
  status: 'uploading' | 'done' | 'error'
  error: UploadError | null
  file: File | null
  /** Seeds the uneven progress steps, so each row moves at its own pace. */
  seed: number
  /** A synced file from another device, drawn rather than uploaded. */
  art?: Art
  dims?: [number, number]
}

interface MenuState {
  target: 'items' | 'blank'
  ids: string[]
  /** The tile that takes focus back when the menu closes. */
  anchorId: string | null
}

// Scoped-slot values never reach <script setup>. This relays the stage's
// measured size into refs, so script state can depend on it.
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

// The file area is written once and placed either alone or in the left pane
// of a splitter (≥ 1200px); the preview is shared by that pane and the
// quick-look dialog.
const [DefineContent, ReuseContent] = createReusableTemplate()
const [DefinePreview, ReusePreview] = createReusableTemplate<{ item: FileNode, compact: boolean }>()

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))
const uid = useId().replace(/[^\w-]/g, '')

function L(text: Bi): string {
  return zh.value ? text.zh : text.en
}

function prefersReducedMotion(): boolean {
  return hasWindow() && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* ─── Constants ───────────────────────────────────────────────────────── */

// 10:30 on Wednesday 23 Sep 2026 in Asia/Shanghai.
const NOW = Date.UTC(2026, 8, 23, 2, 30)
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const SHANGHAI = 8 * HOUR
const KB = 1024
const MB = 1024 * 1024

// The host's own limits for a plugin's business files.
const PLUGIN_MAX_FILE = 10 * MB
const PLUGIN_MAX_TOTAL = 100 * MB
const PLUGIN_MAX_FILES = 1_000
const PLUGIN_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const TEXT_PREVIEW_LIMIT = 256 * KB

/** A wall-clock time in Shanghai on a day of September 2026 (or earlier, by underflow). */
function at(day: number, hour: number, minute = 0): number {
  return Date.UTC(2026, 8, day, hour, minute) - SHANGHAI
}

/* ─── Artwork (screenshots and wallpapers are drawn, never fetched) ───── */

// Image content, not UI chrome: each palette reads as a finished picture on
// the light and the dark docs theme alike.
const PALETTES: Record<PaletteName, { bg: [string, string], glow: string, surface: string, ink: string, accent: string, accent2: string }> = {
  night: { bg: ['#0b1026', '#33287a'], glow: '#6c5ce7', surface: '#12162b', ink: '#ffffff', accent: '#7c6cf0', accent2: '#00d2d3' },
  day: { bg: ['#eef4ff', '#bcd4ff'], glow: '#6c8dff', surface: '#ffffff', ink: '#111827', accent: '#3a56d4', accent2: '#6c8dff' },
  dusk: { bg: ['#140b2e', '#4b2a86'], glow: '#e05bd0', surface: '#1a1233', ink: '#ffffff', accent: '#e05bd0', accent2: '#ffb36b' },
  mint: { bg: ['#eafbf3', '#a4e8c8'], glow: '#2fbf8f', surface: '#ffffff', ink: '#0f2a22', accent: '#127a5c', accent2: '#2fbf8f' },
  graphite: { bg: ['#0f1115', '#262a33'], glow: '#6b7280', surface: '#171a21', ink: '#ffffff', accent: '#60a5fa', accent2: '#e5e7eb' },
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

function bar(x: number, y: number, w: number, h: number, fill: string, opacity: number): string {
  return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" rx="${n(h / 2)}" fill="${fill}" opacity="${opacity}"/>`
}

// A window in the palette's colours on a soft desktop, with one of a few
// app layouts inside: what a Tuff screenshot looks like at thumbnail size.
function drawScreen(art: Art): string {
  const p = PALETTES[art.palette]
  const rand = random(art.seed)
  const W = 320
  const H = 200
  const x = 30
  const y = 24
  const w = 260
  const h = 152
  let body = ''
  if (art.layout === 'wallpaper') {
    const blobs = Array.from({ length: 6 }, (_, index) => {
      const cx = (index % 3 + 0.2 + rand() * 0.6) / 3 * W
      const cy = (Math.floor(index / 3) + 0.15 + rand() * 0.7) / 2 * H
      return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(40 + rand() * 38)}" fill="${[p.accent, p.accent2, p.glow][index % 3]}" opacity="${n(0.55 + rand() * 0.35)}"/>`
    }).join('')
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.bg[0]}"/><stop offset="1" stop-color="${p.bg[1]}"/></linearGradient><filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="22"/></filter></defs><rect width="${W}" height="${H}" fill="url(#bg)"/><g filter="url(#soft)">${blobs}</g></svg>`
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }
  const ink = p.ink
  if (art.layout === 'search') {
    body += `<rect x="${x + 12}" y="${y + 12}" width="${w - 24}" height="24" rx="8" fill="${ink}" opacity="0.07"/>${bar(x + 36, y + 21, 70 + rand() * 40, 6, ink, 0.35)}`
    for (let index = 0; index < 4; index += 1) {
      const ry = y + 46 + index * 25
      if (index === 1)
        body += `<rect x="${x + 8}" y="${ry - 3}" width="${w - 16}" height="23" rx="7" fill="${p.accent}" opacity="0.22"/>`
      body += `<rect x="${x + 16}" y="${ry}" width="16" height="16" rx="5" fill="${[p.accent, p.accent2, p.glow, p.accent][index]}"/>${bar(x + 40, ry + 2, 60 + rand() * 70, 5, ink, 0.75)}${bar(x + 40, ry + 10, 34 + rand() * 40, 4, ink, 0.3)}`
    }
  }
  else if (art.layout === 'sidebar') {
    body += `<rect x="${x}" y="${y}" width="72" height="${h}" rx="12" fill="${ink}" opacity="0.05"/>`
    for (let index = 0; index < 6; index += 1)
      body += bar(x + 12, y + 16 + index * 20, 36 + rand() * 18, 5, ink, index === 1 ? 0.8 : 0.32)
    for (let index = 0; index < 4; index += 1) {
      const ry = y + 18 + index * 32
      body += `${bar(x + 88, ry, 70 + rand() * 50, 6, ink, 0.7)}${bar(x + 88, ry + 10, 50 + rand() * 40, 4, ink, 0.28)}<rect x="${x + w - 42}" y="${ry - 1}" width="26" height="14" rx="7" fill="${index % 2 ? ink : p.accent}" opacity="${index % 2 ? 0.18 : 0.95}"/><circle cx="${x + w - (index % 2 ? 35 : 23)}" cy="${ry + 6}" r="5" fill="#ffffff"/>`
    }
  }
  else if (art.layout === 'list') {
    for (let index = 0; index < 5; index += 1) {
      const ry = y + 14 + index * 27
      body += `<rect x="${x + 12}" y="${ry}" width="22" height="22" rx="6" fill="${[p.accent, p.accent2, p.glow][index % 3]}" opacity="0.85"/>${bar(x + 42, ry + 3, 90 + rand() * 80, 6, ink, 0.72)}${bar(x + 42, ry + 13, 50 + rand() * 50, 4, ink, 0.3)}${bar(x + w - 44, ry + 8, 28, 4, ink, 0.25)}`
    }
  }
  else if (art.layout === 'grid') {
    body += `<rect x="${x + 12}" y="${y + 12}" width="${w - 24}" height="22" rx="8" fill="${ink}" opacity="0.07"/>`
    for (let index = 0; index < 12; index += 1) {
      const cx = x + 22 + (index % 6) * 38
      const cy = y + 48 + Math.floor(index / 6) * 48
      body += `<rect x="${cx}" y="${cy}" width="26" height="26" rx="8" fill="${[p.accent, p.accent2, p.glow][(index + art.seed) % 3]}" opacity="${n(0.7 + rand() * 0.3)}"/>${bar(cx - 1, cy + 32, 28, 4, ink, 0.3)}`
    }
  }
  else if (art.layout === 'chat') {
    for (let index = 0; index < 4; index += 1) {
      const mine = index % 2 === 1
      const bw = 90 + rand() * 70
      const bx = mine ? x + w - 14 - bw : x + 14
      const by = y + 14 + index * 34
      body += `<rect x="${n(bx)}" y="${by}" width="${n(bw)}" height="24" rx="10" fill="${mine ? p.accent : ink}" opacity="${mine ? 0.85 : 0.08}"/>${bar(bx + 10, by + 9, bw - 30, 5, mine ? '#ffffff' : ink, mine ? 0.85 : 0.5)}`
    }
  }
  else {
    body += `<rect x="${x}" y="${y}" width="${w}" height="16" rx="8" fill="${ink}" opacity="0.08"/>`
    body += `<rect x="${x + w - 118}" y="${y + 22}" width="104" height="112" rx="10" fill="${p.surface}" stroke="${ink}" stroke-opacity="0.14"/>`
    for (let index = 0; index < 5; index += 1)
      body += `${index === 2 ? `<rect x="${x + w - 112}" y="${y + 30 + index * 20}" width="92" height="16" rx="5" fill="${p.accent}" opacity="0.25"/>` : ''}${bar(x + w - 104, y + 35 + index * 20, 46 + rand() * 24, 5, ink, 0.6)}`
    body += `${bar(x + 18, y + 40, 90, 6, ink, 0.25)}${bar(x + 18, y + 54, 70, 5, ink, 0.18)}`
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.bg[0]}"/><stop offset="1" stop-color="${p.bg[1]}"/></linearGradient><filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="26"/></filter><filter id="shade" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter></defs><rect width="${W}" height="${H}" fill="url(#bg)"/><circle cx="${n(40 + rand() * 60)}" cy="40" r="70" fill="${p.glow}" opacity="0.6" filter="url(#soft)"/><circle cx="290" cy="190" r="80" fill="${p.accent2}" opacity="0.45" filter="url(#soft)"/><rect x="${x + 4}" y="${y + 10}" width="${w}" height="${h}" rx="12" fill="#000000" opacity="0.25" filter="url(#shade)"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${p.surface}" opacity="0.94" stroke="${ink}" stroke-opacity="0.1"/>${body}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/* ─── Mock data ───────────────────────────────────────────────────────── */

const ROOT_WS = 'ws'
const ROOT_PLUGINS = 'plugins'
const SEPTEMBER_SHOTS = 'ws-shots-09'

const FOLDERS: FileNode[] = [
  { id: ROOT_WS, parentId: null, kind: 'folder', name: 'Workspace', label: { zh: '工作区', en: 'Workspace' }, size: 0, modifiedAt: at(23, 9, 58) },
  { id: 'ws-docs', parentId: ROOT_WS, kind: 'folder', name: 'Documents', label: { zh: '文档', en: 'Documents' }, size: 0, modifiedAt: at(23, 9, 58) },
  { id: 'ws-shots', parentId: ROOT_WS, kind: 'folder', name: 'Screenshots', label: { zh: '截图', en: 'Screenshots' }, size: 0, modifiedAt: at(23, 8, 31) },
  { id: SEPTEMBER_SHOTS, parentId: 'ws-shots', kind: 'folder', name: '2026-09', size: 0, modifiedAt: at(23, 8, 31) },
  { id: 'ws-shots-08', parentId: 'ws-shots', kind: 'folder', name: '2026-08', size: 0, modifiedAt: at(-1, 18, 20) },
  { id: 'ws-clips', parentId: ROOT_WS, kind: 'folder', name: 'Clipboard exports', label: { zh: '剪贴板导出', en: 'Clipboard exports' }, size: 0, modifiedAt: at(22, 22) },
  { id: 'ws-themes', parentId: ROOT_WS, kind: 'folder', name: 'Themes', label: { zh: '主题', en: 'Themes' }, size: 0, modifiedAt: at(19, 21, 40) },
  { id: ROOT_PLUGINS, parentId: null, kind: 'folder', name: 'Plugin storage', label: { zh: '插件存储', en: 'Plugin storage' }, size: 0, modifiedAt: at(23, 10, 12) },
  { id: 'plugin-intelligence', parentId: ROOT_PLUGINS, kind: 'folder', name: 'touch-intelligence', size: 0, modifiedAt: at(23, 10, 12) },
  { id: 'plugin-snippets', parentId: ROOT_PLUGINS, kind: 'folder', name: 'touch-snippets', size: 0, modifiedAt: at(22, 16, 3) },
  { id: 'plugin-bookmarks', parentId: ROOT_PLUGINS, kind: 'folder', name: 'touch-browser-bookmarks', size: 0, modifiedAt: at(21, 9, 44) },
]

const RELEASE_NOTES: Bi = {
  zh: '# Tuff 2.4 发布说明\n\n- **CoreBox**：结果列表与预览同一帧出现\n- **剪贴板**：时间线视图，可按来源筛选\n- **插件市场**：增量更新，下载体积更小\n\n> 在「设置 → 关于」中检查更新。',
  en: '# Tuff 2.4 release notes\n\n- **CoreBox**: results and preview land in the same frame\n- **Clipboard**: a timeline view with source filters\n- **Plugin store**: delta updates and smaller downloads\n\n> Check for updates under Settings → About.',
}

function doc(id: string, parentId: string, name: string, kind: NodeKind, size: number, modifiedAt: number, preview?: Bi, source: Source = 'macbook'): FileNode {
  return { id, parentId, kind, name, size, modifiedAt, preview, source }
}

function shot(id: string, parentId: string, name: string, size: number, modifiedAt: number, art: Art, source: Source = 'macbook'): FileNode {
  return { id, parentId, kind: 'image', name, size, modifiedAt, art, dims: art.layout === 'wallpaper' ? [3840, 2400] : [1440, 900], source }
}

function seedNodes(): FileNode[] {
  const nodes: FileNode[] = FOLDERS.map(folder => ({ ...folder, label: folder.label ? { ...folder.label } : undefined }))
  nodes.push(
    doc('readme', ROOT_WS, 'README.md', 'markdown', 3.1 * KB, at(22, 16, 20), {
      zh: '# 工作区\n\n这里的文件夹会在你登录 Tuff 的设备之间同步。\n\n- **文档**：笔记与草稿\n- **截图**：CoreBox 截图按月归档\n- **剪贴板导出**：从剪贴板历史导出的记录\n\n插件存储由各插件自己管理，不参与同步。',
      en: '# Workspace\n\nThese folders sync between the devices you sign in to Tuff on.\n\n- **Documents**: notes and drafts\n- **Screenshots**: CoreBox captures, filed by month\n- **Clipboard exports**: items exported from clipboard history\n\nPlugin storage is managed by each plugin and does not sync.',
    }),
    doc('review-report', ROOT_WS, 'review-report.pdf', 'pdf', 2.1 * MB, at(19, 11, 5), undefined, 'windows'),
    doc('release-notes', 'ws-docs', 'release-notes-2.4.md', 'markdown', 8.4 * KB, at(23, 8, 12), RELEASE_NOTES),
    doc('review-guidelines', 'ws-docs', 'plugin-review-guidelines.md', 'markdown', 12.1 * KB, at(22, 18, 40), {
      zh: '# 插件审核标准\n\n1. 只申请必需的权限，可选权限写明用途\n2. 业务文件放在插件存储：单个文件不超过 10 MB，总量不超过 100 MB\n3. 提交前在 CoreBox 里走一遍全部触发词',
      en: '# Plugin review guidelines\n\n1. Ask only for the permissions you need; say what each optional one is for\n2. Keep business files in plugin storage: 10 MB per file, 100 MB in total\n3. Run every trigger word in CoreBox before you submit',
    }),
    doc('roadmap', 'ws-docs', 'roadmap-2026-q4.md', 'markdown', 5.2 * KB, at(21, 10, 2), {
      zh: '# 2026 第四季度\n\n- 插件市场：团队空间\n- CoreBox：多语言查询\n- 剪贴板：跨设备冲突合并',
      en: '# Q4 2026\n\n- Plugin store: team spaces\n- CoreBox: multilingual queries\n- Clipboard: merging conflicts across devices',
    }),
    doc('meeting-notes', 'ws-docs', 'meeting-notes-0923.txt', 'text', 2.8 * KB, at(23, 9, 58), {
      zh: '9 月 23 日 · 周会\n\n1. 2.4.1 修复多屏定位，今天发\n2. win32 夜间构建失败，佐藤跟进\n3. 下周一 Nexus 维护，提前发公告',
      en: '23 Sep · weekly sync\n\n1. 2.4.1 fixes multi-monitor placement; ships today\n2. The win32 nightly failed; Kenji follows up\n3. Nexus maintenance next Monday; announce it early',
    }),
    doc('sdkapi', 'ws-docs', 'sdkapi-260713.json', 'json', 18.6 * KB, at(18, 14, 30), {
      zh: '{\n  "sdkapi": 260713,\n  "added": ["TuffQuery.inputs", "acceptedInputTypes"],\n  "breaking": []\n}',
      en: '{\n  "sdkapi": 260713,\n  "added": ["TuffQuery.inputs", "acceptedInputTypes"],\n  "breaking": []\n}',
    }),
    shot('corebox-dark', SEPTEMBER_SHOTS, 'corebox-dark.png', 1.2 * MB, at(23, 8, 31), { layout: 'search', palette: 'night', seed: 11 }),
    shot('corebox-light', SEPTEMBER_SHOTS, 'corebox-light.png', 1.1 * MB, at(23, 8, 30), { layout: 'search', palette: 'day', seed: 12 }),
    shot('clipboard-timeline', SEPTEMBER_SHOTS, 'clipboard-timeline.png', 860 * KB, at(22, 17, 12), { layout: 'list', palette: 'day', seed: 13 }),
    shot('settings-ai', SEPTEMBER_SHOTS, 'settings-ai.png', 740 * KB, at(22, 15, 3), { layout: 'sidebar', palette: 'graphite', seed: 14 }),
    shot('launcher-search', SEPTEMBER_SHOTS, 'launcher-search.png', 920 * KB, at(21, 11, 40), { layout: 'grid', palette: 'mint', seed: 15 }),
    shot('ocr-demo', SEPTEMBER_SHOTS, 'ocr-demo.png', 1.4 * MB, at(20, 19, 25), { layout: 'list', palette: 'dusk', seed: 16 }, 'windows'),
    shot('tray-menu', SEPTEMBER_SHOTS, 'tray-menu.png', 310 * KB, at(19, 9, 12), { layout: 'menu', palette: 'day', seed: 17 }),
    shot('notification-center', SEPTEMBER_SHOTS, 'notification-center.png', 680 * KB, at(18, 16, 44), { layout: 'chat', palette: 'night', seed: 18 }),
    shot('plugin-store', 'ws-shots-08', 'plugin-store.png', 1.3 * MB, at(-1, 18, 20), { layout: 'grid', palette: 'day', seed: 21 }),
    shot('window-presets', 'ws-shots-08', 'window-presets.png', 960 * KB, at(-4, 10, 5), { layout: 'sidebar', palette: 'mint', seed: 22 }),
    shot('quick-actions-v1', 'ws-shots-08', 'quick-actions-v1.png', 540 * KB, at(-8, 14, 33), { layout: 'search', palette: 'graphite', seed: 23 }),
    shot('dark-mode', 'ws-shots-08', 'dark-mode.png', 1.1 * MB, at(-12, 21, 2), { layout: 'list', palette: 'night', seed: 24 }),
    shot('onboarding-01', 'ws-shots-08', 'onboarding-01.png', 820 * KB, at(-18, 9, 40), { layout: 'chat', palette: 'dusk', seed: 25 }),
    shot('onboarding-02', 'ws-shots-08', 'onboarding-02.png', 790 * KB, at(-18, 9, 42), { layout: 'menu', palette: 'mint', seed: 26 }),
    doc('clip-export', 'ws-clips', 'clipboard-2026-09-22.json', 'json', 320 * KB, at(22, 22), {
      zh: '[\n  { "type": "text", "source": "Safari", "at": "2026-09-22T21:48" },\n  { "type": "image", "source": "CoreBox", "at": "2026-09-22T21:40" }\n]',
      en: '[\n  { "type": "text", "source": "Safari", "at": "2026-09-22T21:48" },\n  { "type": "image", "source": "CoreBox", "at": "2026-09-22T21:40" }\n]',
    }),
    doc('snippets-csv', 'ws-clips', 'snippets.csv', 'csv', 46 * KB, at(20, 13, 15), {
      zh: 'trigger,text\n;sig,此致 敬礼\n;addr,上海市徐汇区\n;mtg,明天 10:00 周会',
      en: 'trigger,text\n;sig,Best regards\n;addr,Xuhui District, Shanghai\n;mtg,Weekly sync tomorrow 10:00',
    }),
    doc('history-zip', 'ws-clips', 'history-0915.zip', 'zip', 2.3 * MB, at(15, 23, 5)),
    doc('midnight-theme', 'ws-themes', 'corebox-midnight.zip', 'zip', 540 * KB, at(19, 21, 40)),
    shot('aurora-dusk', 'ws-themes', 'aurora-dusk.png', 2.4 * MB, at(17, 20, 18), { layout: 'wallpaper', palette: 'dusk', seed: 31 }),
  )
  // touch-intelligence keeps its local conversation history here, one file a
  // month, and sits close to the 100 MB limit on purpose.
  const history = [9.9, 9.8, 9.6, 9.7, 9.5, 9.9, 9.8, 9.6, 9.5]
  history.forEach((size, index) => {
    const month = String(index + 1).padStart(2, '0')
    nodes.push(doc(`intel-${month}`, 'plugin-intelligence', `conversations-2026-${month}.json`, 'json', size * MB, at(-(8 - index) * 30 + 23, 23, 50), undefined, 'plugin'))
  })
  nodes.push(
    doc('intel-commands', 'plugin-intelligence', 'commands.json', 'json', 0.4 * MB, at(22, 11, 9), {
      zh: '{\n  "commands": [\n    { "trigger": "tldr", "prompt": "用三句话概括选中的文字" },\n    { "trigger": "polish", "prompt": "润色，保持原意" }\n  ]\n}',
      en: '{\n  "commands": [\n    { "trigger": "tldr", "prompt": "Summarise the selection in three sentences" },\n    { "trigger": "polish", "prompt": "Polish it, keep the meaning" }\n  ]\n}',
    }, 'plugin'),
    doc('intel-index', 'plugin-intelligence', 'index.json', 'json', 4.1 * MB, at(23, 10, 12), undefined, 'plugin'),
    doc('snippets-library', 'plugin-snippets', 'library.json', 'json', 2.4 * MB, at(22, 16, 3), undefined, 'plugin'),
    doc('snippets-state', 'plugin-snippets', 'state.json', 'json', 0.2 * MB, at(22, 16, 3), undefined, 'plugin'),
    doc('bookmarks-json', 'plugin-bookmarks', 'bookmarks.json', 'json', 142 * KB, at(21, 9, 44), {
      zh: '[\n  { "title": "Tuff 文档", "url": "https://tuff.tagzxia.com/docs", "pinned": true },\n  { "title": "Nexus 插件市场", "url": "https://tuff.tagzxia.com/store" }\n]',
      en: '[\n  { "title": "Tuff docs", "url": "https://tuff.tagzxia.com/docs", "pinned": true },\n  { "title": "Nexus plugin store", "url": "https://tuff.tagzxia.com/store" }\n]',
    }, 'plugin'),
    doc('bookmarks-recent', 'plugin-bookmarks', 'recent.json', 'json', 58 * KB, at(21, 9, 44), undefined, 'plugin'),
  )
  return nodes
}

// Synced in by the scripted playback: two captures from the reader's other
// machine, drawn like the rest.
const SYNC_FILES: { name: string, size: number, art: Art }[] = [
  { name: 'menubar-dark.png', size: 1.3 * MB, art: { layout: 'menu', palette: 'night', seed: 41 } },
  { name: 'quick-actions.png', size: 980 * KB, art: { layout: 'search', palette: 'mint', seed: 42 } },
]

/* ─── Copy ────────────────────────────────────────────────────────────── */

const copy = computed(() => zh.value
  ? {
      frameTitle: '工作区文件',
      searchPlaceholder: '在此文件夹中搜索',
      searchLabel: '搜索文件',
      view: { label: '显示方式', grid: '网格', list: '列表' },
      upload: '上传',
      uploadLabel: '上传文件',
      newFolder: '新建文件夹',
      back: '返回上级',
      ancestors: '上级文件夹',
      treeLabel: '文件夹',
      items: (count: number) => `${count} 项`,
      folderItems: (count: number) => `${count} 项`,
      sort: { label: '排序', name: '名称', modified: '修改时间', size: '大小', kind: '类型', asc: '升序', desc: '降序' },
      sortedBy: (key: string) => `排序：${key}`,
      gridLabel: (folder: string) => `「${folder}」中的文件`,
      isNew: '新',
      quota: {
        title: '插件存储',
        hint: '每个插件上限 100 MB',
        used: (used: string, total: string) => `${used} / ${total}`,
        near: '接近上限',
        rules: (files: number) => `单文件 ≤ 10 MB · ${files} / 1,000 个文件`,
        workspace: (used: string) => `工作区已用 ${used}`,
        barLabel: (name: string, used: string) => `${name} 已用 ${used}，上限 100 MB`,
        parts: { history: '对话历史', index: '索引', other: '其他' },
      },
      selected: (count: number, size: string) => (size ? `已选 ${count} 项 · ${size}` : `已选 ${count} 项`),
      selectFile: (name: string) => `选择 ${name}`,
      clearSelection: '取消选择',
      menu: {
        open: '打开',
        preview: '快速预览',
        rename: '重命名',
        copyPath: '复制路径',
        moveTo: '移动到…',
        download: '下载',
        remove: '删除',
        newFolder: '新建文件夹',
        flatOnly: '插件存储不支持子文件夹',
        upload: '上传文件…',
        sort: '排序方式',
        view: '显示方式',
        count: (label: string, count: number) => `${label} ${count} 项`,
      },
      keys: { space: '空格', enter: '回车' },
      empty: {
        title: '这个文件夹是空的',
        desc: '把文件拖到这里，或点「上传」。',
        searchTitle: '没有匹配的文件',
        searchDesc: '换个关键词，或者清除搜索。',
        clear: '清除搜索',
      },
      columns: { name: '名称', size: '大小', kind: '类型', modified: '修改时间' },
      kinds: {
        folder: '文件夹',
        image: 'PNG 图片',
        markdown: 'Markdown',
        text: '纯文本',
        json: 'JSON',
        csv: 'CSV 表格',
        pdf: 'PDF 文档',
        zip: 'ZIP 压缩包',
        binary: '数据文件',
      } as Record<NodeKind, string>,
      sources: { macbook: '来自 MacBook', windows: '来自 Windows 台式机', plugin: '由插件写入', upload: '刚刚上传' } as Record<Source, string>,
      preview: {
        title: '预览',
        open: '打开',
        copyPath: '复制路径',
        prev: '上一个',
        next: '下一个',
        position: (index: number, total: number) => `${index} / ${total}`,
        modified: (when: string) => `修改于 ${when}`,
        unsupported: '无法预览此类型',
        unsupportedDesc: '宿主会用系统应用打开它。',
        noSelection: '选择一个文件',
        noSelectionDesc: '单击文件在这里预览；空格打开快速预览。',
        siblings: '同文件夹的图片',
        gallery: { title: '图片', prev: '上一张', next: '下一张', prevText: '上一张', nextText: '下一张' },
        galleryItem: (index: number) => `图片 ${index + 1}`,
        galleryOpen: (name: string) => `查看 ${name}`,
        folderSummary: (count: number, size: string) => `${count} 项 · ${size}`,
      },
      rename: {
        label: '新名称',
        empty: '名称不能为空',
        taken: '这个文件夹里已有同名项目',
        slash: '名称里不能有 /',
        pluginName: '只能用字母、数字和 . _ -，且以字母或数字开头',
      },
      move: {
        title: (count: number) => `移动 ${count} 项到…`,
        confirm: '移动到这里',
        cancel: '取消',
        hint: '只能在工作区内移动；插件存储由插件自己管理。',
      },
      uploader: {
        drop: (folder: string) => `松开以上传到「${folder}」`,
        hint: '文件会同步到你的其他设备',
        pluginHint: '单个文件不超过 10 MB，文件名只能用字母、数字和 . _ -',
        button: '选择文件',
      },
      tray: {
        label: '上传进度',
        uploading: (count: number) => `正在上传 ${count} 个文件`,
        syncing: (count: number) => `正在从 MacBook 同步 ${count} 个截图`,
        done: (count: number) => `已上传 ${count} 个文件`,
        synced: (count: number) => `已同步 ${count} 个截图`,
        partial: (done: number, failed: number) => `已上传 ${done} 个，${failed} 个失败`,
        progress: (value: number) => `${value}%`,
        rowLabel: (name: string) => `${name} 的上传进度`,
        tooBig: '超过单文件 10 MB 上限',
        full: '会超出这个插件 100 MB 的总上限',
        tooMany: '这个插件已有 1,000 个文件',
        badName: '插件存储的文件名只能用字母、数字和 . _ -',
        toWorkspace: '改存到工作区',
        dismiss: '关闭上传进度',
        started: (count: number) => `开始上传 ${count} 个文件`,
        finished: (done: number, failed: number) => (failed ? `上传完成：${done} 个成功，${failed} 个失败` : `上传完成：${done} 个文件`),
      },
      toastLabel: '操作结果',
      undo: '撤销',
      dismiss: '关闭提示',
      undone: '已撤销',
      removed: (count: number) => `已删除 ${count} 项`,
      moved: (count: number, folder: string) => `已把 ${count} 项移到「${folder}」`,
      renamed: (name: string) => `已重命名为 ${name}`,
      created: '已新建文件夹',
      pathCopied: '路径已复制',
      downloads: (count: number) => `宿主会下载 ${count} 个文件（示例）`,
      hostOpens: (name: string) => `宿主会用系统应用打开 ${name}`,
      untitledFolder: '新建文件夹',
      pathRoot: '~/Tuff',
    }
  : {
      frameTitle: 'Workspace files',
      searchPlaceholder: 'Search this folder',
      searchLabel: 'Search files',
      view: { label: 'View', grid: 'Grid', list: 'List' },
      upload: 'Upload',
      uploadLabel: 'Upload files',
      newFolder: 'New folder',
      back: 'Up one level',
      ancestors: 'Parent folders',
      treeLabel: 'Folders',
      items: (count: number) => (count === 1 ? '1 item' : `${count} items`),
      folderItems: (count: number) => (count === 1 ? '1 item' : `${count} items`),
      sort: { label: 'Sort', name: 'Name', modified: 'Date modified', size: 'Size', kind: 'Kind', asc: 'Ascending', desc: 'Descending' },
      sortedBy: (key: string) => `Sort: ${key}`,
      gridLabel: (folder: string) => `Files in ${folder}`,
      isNew: 'New',
      quota: {
        title: 'Plugin storage',
        hint: '100 MB per plugin',
        used: (used: string, total: string) => `${used} of ${total}`,
        near: 'Nearly full',
        rules: (files: number) => `≤ 10 MB per file · ${files} of 1,000 files`,
        workspace: (used: string) => `Workspace uses ${used}`,
        barLabel: (name: string, used: string) => `${name} uses ${used} of 100 MB`,
        parts: { history: 'History', index: 'Index', other: 'Other' },
      },
      selected: (count: number, size: string) => (size ? `${count} selected · ${size}` : `${count} selected`),
      selectFile: (name: string) => `Select ${name}`,
      clearSelection: 'Clear selection',
      menu: {
        open: 'Open',
        preview: 'Quick look',
        rename: 'Rename',
        copyPath: 'Copy path',
        moveTo: 'Move to…',
        download: 'Download',
        remove: 'Delete',
        newFolder: 'New folder',
        flatOnly: 'Plugin storage has no sub-folders',
        upload: 'Upload files…',
        sort: 'Sort by',
        view: 'View as',
        count: (label: string, count: number) => `${label} ${count} items`,
      },
      keys: { space: 'Space', enter: 'Enter' },
      empty: {
        title: 'This folder is empty',
        desc: 'Drop files here, or press Upload.',
        searchTitle: 'No matching files',
        searchDesc: 'Try another name, or clear the search.',
        clear: 'Clear search',
      },
      columns: { name: 'Name', size: 'Size', kind: 'Kind', modified: 'Modified' },
      kinds: {
        folder: 'Folder',
        image: 'PNG image',
        markdown: 'Markdown',
        text: 'Plain text',
        json: 'JSON',
        csv: 'CSV sheet',
        pdf: 'PDF document',
        zip: 'ZIP archive',
        binary: 'Data file',
      } as Record<NodeKind, string>,
      sources: { macbook: 'From MacBook', windows: 'From the Windows desktop', plugin: 'Written by the plugin', upload: 'Just uploaded' } as Record<Source, string>,
      preview: {
        title: 'Preview',
        open: 'Open',
        copyPath: 'Copy path',
        prev: 'Previous',
        next: 'Next',
        position: (index: number, total: number) => `${index} of ${total}`,
        modified: (when: string) => `Modified ${when}`,
        unsupported: 'No preview for this kind',
        unsupportedDesc: 'The host would open it in its system app.',
        noSelection: 'Pick a file',
        noSelectionDesc: 'Click a file to preview it here; Space opens quick look.',
        siblings: 'Images in this folder',
        gallery: { title: 'Image', prev: 'Previous image', next: 'Next image', prevText: 'Prev', nextText: 'Next' },
        galleryItem: (index: number) => `Image ${index + 1}`,
        galleryOpen: (name: string) => `View ${name}`,
        folderSummary: (count: number, size: string) => `${count === 1 ? '1 item' : `${count} items`} · ${size}`,
      },
      rename: {
        label: 'New name',
        empty: 'A name is required',
        taken: 'Something here already has that name',
        slash: 'Names cannot contain /',
        pluginName: 'Letters, digits and . _ - only, starting with a letter or digit',
      },
      move: {
        title: (count: number) => (count === 1 ? 'Move 1 item to…' : `Move ${count} items to…`),
        confirm: 'Move here',
        cancel: 'Cancel',
        hint: 'Items move within the workspace only; plugin storage belongs to its plugin.',
      },
      uploader: {
        drop: (folder: string) => `Drop to upload to ${folder}`,
        hint: 'Files sync to your other devices',
        pluginHint: 'Up to 10 MB per file; names use letters, digits and . _ - only',
        button: 'Choose files',
      },
      tray: {
        label: 'Upload progress',
        uploading: (count: number) => (count === 1 ? 'Uploading 1 file' : `Uploading ${count} files`),
        syncing: (count: number) => `Syncing ${count} screenshots from MacBook`,
        done: (count: number) => (count === 1 ? 'Uploaded 1 file' : `Uploaded ${count} files`),
        synced: (count: number) => `Synced ${count} screenshots`,
        partial: (done: number, failed: number) => `${done} uploaded, ${failed} failed`,
        progress: (value: number) => `${value}%`,
        rowLabel: (name: string) => `Upload progress for ${name}`,
        tooBig: 'Over the 10 MB per-file limit',
        full: 'Would take this plugin past its 100 MB limit',
        tooMany: 'This plugin already has 1,000 files',
        badName: 'Plugin storage names use letters, digits and . _ - only',
        toWorkspace: 'Save to workspace',
        dismiss: 'Close upload progress',
        started: (count: number) => `Started uploading ${count} files`,
        finished: (done: number, failed: number) => (failed ? `Upload finished: ${done} done, ${failed} failed` : `Upload finished: ${done} files`),
      },
      toastLabel: 'Result',
      undo: 'Undo',
      dismiss: 'Dismiss',
      undone: 'Undone',
      removed: (count: number) => (count === 1 ? 'Deleted 1 item' : `Deleted ${count} items`),
      moved: (count: number, folder: string) => (count === 1 ? `Moved 1 item to ${folder}` : `Moved ${count} items to ${folder}`),
      renamed: (name: string) => `Renamed to ${name}`,
      created: 'Folder created',
      pathCopied: 'Path copied',
      downloads: (count: number) => `The host would download ${count} files (sample)`,
      hostOpens: (name: string) => `The host would open ${name} in its system app`,
      untitledFolder: 'untitled folder',
      pathRoot: '~/Tuff',
    })

/* ─── Stage size → layout mode ────────────────────────────────────────── */

const stageWidth = ref(0)

function onStageResize(width: number): void {
  stageWidth.value = width
}

// Same breakpoints as the container queries below; the first frame measures 0.
const mode = computed<Mode>(() => {
  const width = stageWidth.value
  if (!width)
    return 'column'
  if (width < 640)
    return 'narrow'
  return width < 960 ? 'column' : 'wide'
})

// A preview pane only once the expanded stage has room for it next to the
// tree and a useful grid; between 960 and 1199 quick look stays a dialog.
const showPane = computed(() => stageWidth.value >= 1200)

/* ─── State ───────────────────────────────────────────────────────────── */

const nodes = ref<FileNode[]>(seedNodes())
const currentId = ref<string>(SEPTEMBER_SHOTS)
const expandedKeys = ref<TreeKey[]>([ROOT_WS, 'ws-shots', ROOT_PLUGINS])
const view = ref<ViewMode>('grid')
const sort = reactive<{ key: SortKey, order: 'asc' | 'desc' }>({ key: 'modified', order: 'desc' })
const search = ref('')
const selected = ref<Set<string>>(new Set())
const anchorId = ref<string | null>(null)
const focusId = ref<string | null>(null)
const split = ref(0.62)
const announcement = ref('')
const rootRef = ref<HTMLElement | null>(null)
const gridRef = ref<HTMLElement | null>(null)

let seq = 0

const nodeMap = computed(() => new Map(nodes.value.map(node => [node.id, node])))

function childrenOf(id: string): FileNode[] {
  return nodes.value.filter(node => node.parentId === id)
}

function isFolder(node: FileNode | undefined | null): boolean {
  return node?.kind === 'folder'
}

function ancestors(id: string): FileNode[] {
  const chain: FileNode[] = []
  let node = nodeMap.value.get(id)
  while (node) {
    chain.unshift(node)
    node = node.parentId ? nodeMap.value.get(node.parentId) : undefined
  }
  return chain
}

function inPluginStorage(id: string): boolean {
  return ancestors(id)[0]?.id === ROOT_PLUGINS
}

function displayName(node: FileNode): string {
  return node.label ? L(node.label) : node.name
}

// A file name broken anywhere splits its extension ("menubar-dark.pn / g");
// the grid only offers a break after `-`, `_` and `.`, each piece followed
// by a <wbr>.
function nameParts(name: string): string[] {
  return name.match(/[^-_.]*[-_.]+|[^-_.]+$/g) ?? [name]
}

function sizeOf(node: FileNode): number {
  if (!isFolder(node))
    return node.size
  return childrenOf(node.id).reduce((sum, child) => sum + sizeOf(child), 0)
}

function isDescendant(id: string, ancestorId: string): boolean {
  return ancestors(id).some(node => node.id === ancestorId)
}

const current = computed(() => nodeMap.value.get(currentId.value) ?? nodeMap.value.get(ROOT_WS)!)
const currentInPlugin = computed(() => inPluginStorage(current.value.id))

/* ─── Formatting ──────────────────────────────────────────────────────── */

const lang = computed(() => (zh.value ? 'zh-CN' : 'en'))
const sizeNumber = computed(() => new Intl.NumberFormat(lang.value, { maximumFractionDigits: 1 }))
const relativeFormat = computed(() => new Intl.RelativeTimeFormat(lang.value, { numeric: 'auto', style: 'short' }))
const dateFormat = computed(() => new Intl.DateTimeFormat(lang.value, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }))
const collator = computed(() => new Intl.Collator(lang.value, { numeric: true, sensitivity: 'base' }))

// 1024-based, like the host's own limits (`10 * 1024 * 1024`).
function formatSize(bytes: number): string {
  if (bytes < KB)
    return `${Math.round(bytes)} B`
  if (bytes < MB)
    return `${sizeNumber.value.format(bytes / KB)} KB`
  return `${sizeNumber.value.format(bytes / MB)} MB`
}

function relative(ts: number): string {
  const diff = ts - NOW
  const minutes = Math.round(diff / MINUTE)
  if (Math.abs(minutes) < 60)
    return relativeFormat.value.format(minutes, 'minute')
  const hours = Math.round(diff / HOUR)
  if (Math.abs(hours) < 24)
    return relativeFormat.value.format(hours, 'hour')
  const days = Math.round(diff / DAY)
  if (Math.abs(days) < 30)
    return relativeFormat.value.format(days, 'day')
  return dateFormat.value.format(ts)
}

// `i-carbon-*` literals live here so UnoCSS generates them.
const KIND_META: Record<NodeKind, { icon: string, tone: IconChipTone }> = {
  folder: { icon: 'i-carbon-folder', tone: 'accent' },
  image: { icon: 'i-carbon-image', tone: 'accent' },
  markdown: { icon: 'i-carbon-document', tone: 'ink' },
  text: { icon: 'i-carbon-txt', tone: 'neutral' },
  json: { icon: 'i-carbon-json', tone: 'orange' },
  csv: { icon: 'i-carbon-csv', tone: 'green' },
  pdf: { icon: 'i-carbon-document-pdf', tone: 'red' },
  zip: { icon: 'i-carbon-zip', tone: 'neutral' },
  binary: { icon: 'i-carbon-data-base', tone: 'neutral' },
}

function kindFromName(name: string, type = ''): NodeKind {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext))
    return 'image'
  if (ext === 'md' || ext === 'markdown')
    return 'markdown'
  if (ext === 'txt' || ext === 'log')
    return 'text'
  if (ext === 'json')
    return 'json'
  if (ext === 'csv')
    return 'csv'
  if (ext === 'pdf')
    return 'pdf'
  if (ext === 'zip')
    return 'zip'
  return 'binary'
}

// A 14px type badge carries three glyphs at most (the icon-chip contract).
function badgeLabel(node: FileNode): string {
  if (node.kind === 'json')
    return '{ }'
  const ext = node.name.includes('.') ? node.name.split('.').pop()!.toUpperCase() : ''
  return ext.slice(0, 3)
}

const thumbs = computed(() => {
  const map = new Map<string, string>()
  for (const node of nodes.value) {
    if (node.objectUrl)
      map.set(node.id, node.objectUrl)
    else if (node.art)
      map.set(node.id, drawScreen(node.art))
  }
  return map
})

function thumbOf(node: FileNode): string | undefined {
  return thumbs.value.get(node.id)
}

function pathOf(node: FileNode): string {
  const chain = ancestors(node.id).map(item => item.name)
  return `${copy.value.pathRoot}/${chain.join('/')}`
}

/* ─── Current folder ──────────────────────────────────────────────────── */

function compareNodes(a: FileNode, b: FileNode): number {
  // Folders first whatever the sort, the way every file manager does it.
  if (isFolder(a) !== isFolder(b))
    return isFolder(a) ? -1 : 1
  const direction = sort.order === 'asc' ? 1 : -1
  if (sort.key === 'name')
    return direction * collator.value.compare(displayName(a), displayName(b))
  if (sort.key === 'size')
    return direction * (sizeOf(a) - sizeOf(b))
  if (sort.key === 'kind')
    return direction * (collator.value.compare(a.kind, b.kind) || collator.value.compare(a.name, b.name))
  return direction * (a.modifiedAt - b.modifiedAt)
}

const needle = computed(() => search.value.trim().toLowerCase())

const items = computed(() => childrenOf(current.value.id)
  .filter(node => !needle.value || displayName(node).toLowerCase().includes(needle.value))
  .sort(compareNodes))

const selectedItems = computed(() => items.value.filter(node => selected.value.has(node.id)))
const selectedSize = computed(() => selectedItems.value.reduce((sum, node) => sum + sizeOf(node), 0))

const crumbs = computed(() => ancestors(current.value.id))
const breadcrumbItems = computed<BreadcrumbItem[]>(() => {
  const chain = crumbs.value
  // Narrow: the last crumb only; the parents sit in the ⋯ menu beside it.
  const shown = mode.value === 'narrow' ? chain.slice(-1) : chain
  return shown.map(node => ({ label: displayName(node) }))
})

function onCrumb(_item: BreadcrumbItem, index: number): void {
  const offset = mode.value === 'narrow' ? crumbs.value.length - 1 : 0
  const target = crumbs.value[index + offset]
  if (target)
    navigate(target.id)
}

function folderTree(parentId: string): TreeNode[] {
  return childrenOf(parentId)
    .filter(isFolder)
    .sort((a, b) => collator.value.compare(displayName(a), displayName(b)))
    .map((folder) => {
      const children = folderTree(folder.id)
      return { key: folder.id, label: displayName(folder), children: children.length ? children : undefined }
    })
}

const treeNodes = computed<TreeNode[]>(() => [ROOT_WS, ROOT_PLUGINS].map((id) => {
  const root = nodeMap.value.get(id)!
  return { key: id, label: displayName(root), children: folderTree(id) }
}))

function fileCount(id: string): number {
  return childrenOf(id).filter(node => !isFolder(node)).length
}

/* ─── Quota ───────────────────────────────────────────────────────────── */

interface PluginUsage {
  id: string
  name: string
  used: number
  files: number
  near: boolean
}

const pluginUsage = computed<PluginUsage[]>(() => childrenOf(ROOT_PLUGINS).map((folder) => {
  const used = sizeOf(folder)
  return { id: folder.id, name: folder.name, used, files: fileCount(folder.id), near: used >= PLUGIN_MAX_TOTAL * 0.9 }
}))

const currentUsage = computed(() => pluginUsage.value.find(usage => usage.id === current.value.id) ?? null)

// History / index / everything else, in MB against the 100 MB total.
const usageSegments = computed<ProgressBarProps['segments']>(() => {
  if (!currentUsage.value)
    return []
  let history = 0
  let index = 0
  let other = 0
  for (const node of childrenOf(current.value.id)) {
    if (node.name.startsWith('conversations-') || node.name.startsWith('library'))
      history += node.size
    else if (node.name.startsWith('index'))
      index += node.size
    else
      other += node.size
  }
  const parts = copy.value.quota.parts
  return [
    { value: history / MB, color: 'var(--tx-chart-categorical-1, #4290f0)', label: parts.history },
    { value: index / MB, color: 'var(--tx-chart-categorical-4, #8d58ee)', label: parts.index },
    { value: other / MB, color: 'var(--tx-chart-categorical-5, #50c3b6)', label: parts.other },
  ].filter(segment => segment.value > 0)
})

const workspaceUsed = computed(() => sizeOf(nodeMap.value.get(ROOT_WS)!))

/* ─── Navigation ──────────────────────────────────────────────────────── */

function navigate(id: string): void {
  const node = nodeMap.value.get(id)
  if (!node || !isFolder(node) || id === currentId.value)
    return
  currentId.value = id
  search.value = ''
  selected.value = new Set()
  anchorId.value = null
  focusId.value = null
  cancelRename()
  // Entering a folder opens its parents in the tree, so it is always visible.
  const open = new Set(expandedKeys.value)
  for (const ancestor of ancestors(id).slice(0, -1))
    open.add(ancestor.id)
  expandedKeys.value = [...open]
}

function onTreeSelect(value: TreeValue): void {
  if (typeof value === 'string')
    navigate(value)
}

function onTreeExpanded(keys: TreeKey[]): void {
  expandedKeys.value = keys
}

function goUp(): void {
  const parent = current.value.parentId
  if (parent)
    navigate(parent)
}

/* ─── Toast ───────────────────────────────────────────────────────────── */

const toast = reactive({ open: false, text: '', icon: 'i-carbon-checkmark-outline', undoable: false })
let toastTimer: ReturnType<typeof setTimeout> | undefined
let undoSnapshot: { nodes: FileNode[], current: string } | null = null
// Every toast closes by itself; a pointer or keyboard focus resting on it
// holds it open (it may carry Undo), and it re-arms two seconds after both
// have left.
let toastHovered = false
let toastFocused = false

function snapshot(): { nodes: FileNode[], current: string } {
  return { nodes: nodes.value.map(node => ({ ...node })), current: currentId.value }
}

function armToast(ms: number): void {
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.open = false
    undoSnapshot = null
  }, ms)
}

function notify(text: string, icon: string, before: ReturnType<typeof snapshot> | null = null): void {
  undoSnapshot = before
  toast.text = text
  toast.icon = icon
  toast.undoable = Boolean(before)
  toast.open = true
  if (toastHovered || toastFocused)
    clearTimeout(toastTimer)
  else
    armToast(before ? 4500 : 3200)
}

function holdToast(kind: 'hover' | 'focus'): void {
  if (kind === 'hover')
    toastHovered = true
  else
    toastFocused = true
  clearTimeout(toastTimer)
}

function releaseToast(kind: 'hover' | 'focus'): void {
  if (kind === 'hover')
    toastHovered = false
  else
    toastFocused = false
  if (toast.open && !toastHovered && !toastFocused)
    armToast(2000)
}

function onToastFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null
  if (!next || !(event.currentTarget as HTMLElement).contains(next))
    releaseToast('focus')
}

function closeToast(): void {
  clearTimeout(toastTimer)
  toast.open = false
  undoSnapshot = null
  toastHovered = false
  toastFocused = false
}

function undo(): void {
  if (!undoSnapshot)
    return
  nodes.value = undoSnapshot.nodes
  currentId.value = nodeMap.value.has(undoSnapshot.current) ? undoSnapshot.current : ROOT_WS
  selected.value = new Set()
  notify(copy.value.undone, 'i-carbon-undo')
}

function announce(text: string): void {
  announcement.value = ''
  void nextTick(() => {
    announcement.value = text
  })
}

/* ─── Selection ───────────────────────────────────────────────────────── */

function selectOnly(id: string): void {
  selected.value = new Set([id])
  anchorId.value = id
  focusId.value = id
}

function toggleSelected(id: string): void {
  const next = new Set(selected.value)
  if (next.has(id))
    next.delete(id)
  else
    next.add(id)
  selected.value = next
  anchorId.value = id
  focusId.value = id
}

function selectRange(id: string): void {
  const list = items.value
  const from = list.findIndex(node => node.id === (anchorId.value ?? id))
  const to = list.findIndex(node => node.id === id)
  if (from < 0 || to < 0) {
    selectOnly(id)
    return
  }
  const [start, end] = from < to ? [from, to] : [to, from]
  selected.value = new Set(list.slice(start, end + 1).map(node => node.id))
  focusId.value = id
}

function clearSelection(): void {
  selected.value = new Set()
}

function onTileClick(event: MouseEvent, node: FileNode): void {
  if (renamingId.value === node.id)
    return
  if (event.metaKey || event.ctrlKey)
    toggleSelected(node.id)
  else if (event.shiftKey)
    selectRange(node.id)
  else
    selectOnly(node.id)
}

function onGridClick(event: MouseEvent): void {
  if (event.target === event.currentTarget)
    clearSelection()
}

const tabStopId = computed(() => {
  const ids = items.value.map(node => node.id)
  return focusId.value && ids.includes(focusId.value) ? focusId.value : ids[0] ?? null
})

function tileSelector(id: string): string {
  const value = `${uid}-file-${id}`
  return `#${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value}`
}

// Scroll only the file area, and only as far as the tile needs.
function focusTile(id: string): void {
  const tile = rootRef.value?.querySelector<HTMLElement>(tileSelector(id))
  const scroller = tile?.closest<HTMLElement>('.files-scroll')
  if (!tile)
    return
  focusId.value = id
  tile.focus({ preventScroll: true })
  if (!scroller)
    return
  const top = tile.offsetTop
  const bottom = top + tile.offsetHeight
  if (top < scroller.scrollTop)
    scroller.scrollTop = top - 8
  else if (bottom > scroller.scrollTop + scroller.clientHeight)
    scroller.scrollTop = bottom - scroller.clientHeight + 8
}

// How many tiles a row holds, read off the grid rather than assumed, so the
// up and down arrows land on the tile visually above or below.
function columnsPerRow(): number {
  const grid = gridRef.value
  if (!grid || !hasWindow())
    return 1
  const template = window.getComputedStyle(grid).gridTemplateColumns
  return Math.max(1, template.split(' ').filter(Boolean).length)
}

/* ─── Opening and previewing ─────────────────────────────────────────── */

const previewOpen = ref(false)
const previewId = ref<string | null>(null)
const previewRef = ref<HTMLElement | null>(null)

const previewList = computed(() => items.value.filter(node => !isFolder(node)))
const previewItem = computed(() => (previewId.value ? nodeMap.value.get(previewId.value) ?? null : null))
const previewIndex = computed(() => previewList.value.findIndex(node => node.id === previewId.value))

// The pane follows the selection: one file selected, that file.
const paneItem = computed(() => {
  if (selectedItems.value.length !== 1)
    return null
  return selectedItems.value[0]!
})

function siblingsOf(node: FileNode): ImageGalleryItem[] {
  return childrenOf(node.parentId ?? ROOT_WS)
    .filter(item => item.kind === 'image' && thumbOf(item))
    .map(item => ({ id: item.id, url: thumbOf(item)!, name: item.name }))
}

function isPreviewable(node: FileNode): boolean {
  return node.kind === 'image' || Boolean(node.preview)
}

function openPreview(id: string): void {
  const node = nodeMap.value.get(id)
  if (!node || isFolder(node))
    return
  previewId.value = id
  previewOpen.value = true
  // TxModal focuses its overlay a tick after it opens; ←/→ and Space are
  // handled on the preview inside it. Only ever reached from the reader's
  // own click or key press.
  void nextTick()
    .then(() => nextTick())
    .then(() => previewRef.value?.focus({ preventScroll: true }))
}

function stepPreview(delta: number): void {
  const list = previewList.value
  if (!list.length)
    return
  const index = previewIndex.value < 0 ? 0 : previewIndex.value
  const next = list[(index + delta + list.length) % list.length]
  if (next) {
    previewId.value = next.id
    selectOnly(next.id)
  }
}

function onPreviewKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey)
    return
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    stepPreview(event.key === 'ArrowLeft' ? -1 : 1)
  }
  else if (event.key === ' ') {
    // Space toggles quick look, as it opened it.
    event.preventDefault()
    previewOpen.value = false
  }
}

watch(previewOpen, (open) => {
  if (!open && previewId.value) {
    const id = previewId.value
    void nextTick(() => {
      if (items.value.some(node => node.id === id))
        focusItem(id)
    })
  }
})

function openItem(node: FileNode): void {
  if (isFolder(node)) {
    navigate(node.id)
    return
  }
  if (isPreviewable(node)) {
    openPreview(node.id)
    return
  }
  notify(copy.value.hostOpens(node.name), 'i-carbon-launch')
}

/* ─── Rename ──────────────────────────────────────────────────────────── */

const renamingId = ref<string | null>(null)
const renameDraft = ref('')
const renameError = ref('')

function startRename(id: string): void {
  const node = nodeMap.value.get(id)
  if (!node || node.parentId === null || node.parentId === ROOT_PLUGINS)
    return
  renamingId.value = id
  renameDraft.value = node.label ? L(node.label) : node.name
  renameError.value = ''
  // A reader's own key press or menu choice: the field is what they asked for.
  void nextTick(() => {
    const input = rootRef.value?.querySelector<HTMLInputElement>('.files-rename input')
    if (!input)
      return
    input.focus({ preventScroll: true })
    const dot = node.kind === 'folder' ? -1 : input.value.lastIndexOf('.')
    input.setSelectionRange(0, dot > 0 ? dot : input.value.length)
  })
}

function cancelRename(): void {
  renamingId.value = null
  renameError.value = ''
}

function renameProblem(node: FileNode, name: string): string {
  const rules = copy.value.rename
  if (!name)
    return rules.empty
  if (name.includes('/'))
    return rules.slash
  if (inPluginStorage(node.id) && !PLUGIN_FILE_NAME.test(name))
    return rules.pluginName
  if (childrenOf(node.parentId!).some(item => item.id !== node.id && displayName(item).toLowerCase() === name.toLowerCase()))
    return rules.taken
  return ''
}

function commitRename(): void {
  const id = renamingId.value
  const node = id ? nodeMap.value.get(id) : undefined
  if (!node)
    return
  const name = renameDraft.value.trim()
  if (name === displayName(node)) {
    cancelRename()
    focusTile(node.id)
    return
  }
  const problem = renameProblem(node, name)
  if (problem) {
    renameError.value = problem
    return
  }
  const before = snapshot()
  node.name = name
  node.label = undefined
  node.modifiedAt = NOW
  cancelRename()
  notify(copy.value.renamed(name), 'i-carbon-edit', before)
  void nextTick(() => focusTile(node.id))
}

function onRenameKeydown(event: KeyboardEvent): void {
  event.stopPropagation()
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault()
    commitRename()
  }
  else if (event.key === 'Escape') {
    // Handled here, so the expanded stage must not collapse on the same press.
    event.preventDefault()
    const id = renamingId.value
    cancelRename()
    if (id)
      void nextTick(() => focusTile(id))
  }
}

function onRenameBlur(): void {
  // Leaving the field keeps a valid name and drops an invalid one.
  const id = renamingId.value
  const node = id ? nodeMap.value.get(id) : undefined
  if (!node)
    return
  if (renameProblem(node, renameDraft.value.trim()))
    cancelRename()
  else
    commitRename()
}

/* ─── Delete, move, copy, download, new folder ───────────────────────── */

function removeIds(ids: string[]): void {
  if (!ids.length)
    return
  const before = snapshot()
  const doomed = new Set<string>()
  for (const id of ids) {
    doomed.add(id)
    for (const node of nodes.value) {
      if (isDescendant(node.id, id))
        doomed.add(node.id)
    }
  }
  nodes.value = nodes.value.filter(node => !doomed.has(node.id))
  selected.value = new Set()
  notify(copy.value.removed(ids.length), 'i-carbon-trash-can', before)
  announce(copy.value.removed(ids.length))
}

async function copyPath(node: FileNode): Promise<void> {
  // Only ever reached from the reader's own click.
  if (hasNavigator()) {
    try {
      await navigator.clipboard.writeText(pathOf(node))
    }
    catch {
      // Clipboard permission can be denied; the toast still confirms intent.
    }
  }
  notify(copy.value.pathCopied, 'i-carbon-copy')
}

function download(ids: string[]): void {
  const count = ids.reduce((sum, id) => {
    const node = nodeMap.value.get(id)
    if (!node)
      return sum
    return sum + (isFolder(node) ? nodes.value.filter(item => !isFolder(item) && isDescendant(item.id, id)).length : 1)
  }, 0)
  notify(copy.value.downloads(count), 'i-carbon-download')
}

function uniqueName(parentId: string, base: string): string {
  const taken = new Set(childrenOf(parentId).map(node => displayName(node).toLowerCase()))
  if (!taken.has(base.toLowerCase()))
    return base
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  const ext = dot > 0 ? base.slice(dot) : ''
  const plugin = inPluginStorage(parentId)
  for (let index = 1; ; index += 1) {
    const candidate = plugin ? `${stem}-${index}${ext}` : `${stem} ${index}${ext}`
    if (!taken.has(candidate.toLowerCase()))
      return candidate
  }
}

function createFolder(): void {
  if (currentInPlugin.value)
    return
  const before = snapshot()
  seq += 1
  const id = `folder-${seq}`
  nodes.value = [...nodes.value, {
    id,
    parentId: current.value.id,
    kind: 'folder',
    name: uniqueName(current.value.id, copy.value.untitledFolder),
    size: 0,
    modifiedAt: NOW,
    isNew: true,
  }]
  notify(copy.value.created, 'i-carbon-folder-add', before)
  selectOnly(id)
  startRename(id)
}

const moveOpen = ref(false)
const moveIds = ref<string[]>([])
const moveTarget = ref<string | null>(null)

function canMoveInto(target: string, ids: string[]): boolean {
  if (inPluginStorage(target) || ids.some(id => inPluginStorage(id)))
    return false
  return ids.every(id => id !== target && !isDescendant(target, id) && nodeMap.value.get(id)?.parentId !== target)
}

const moveTree = computed<TreeNode[]>(() => {
  const root = nodeMap.value.get(ROOT_WS)!
  const disable = (list: TreeNode[]): TreeNode[] => list.map(node => ({
    ...node,
    disabled: !canMoveInto(String(node.key), moveIds.value),
    children: node.children ? disable(node.children) : undefined,
  }))
  return disable([{ key: ROOT_WS, label: displayName(root), children: folderTree(ROOT_WS) }])
})

function openMove(ids: string[]): void {
  if (!ids.length || ids.some(id => inPluginStorage(id)))
    return
  moveIds.value = ids
  moveTarget.value = null
  moveOpen.value = true
}

function moveNodes(ids: string[], target: string): void {
  if (!canMoveInto(target, ids))
    return
  const before = snapshot()
  const wanted = new Set(ids)
  for (const node of nodes.value) {
    if (wanted.has(node.id)) {
      node.name = uniqueName(target, displayName(node))
      node.label = undefined
      node.parentId = target
    }
  }
  selected.value = new Set()
  const folder = displayName(nodeMap.value.get(target)!)
  notify(copy.value.moved(ids.length, folder), 'i-carbon-folder-move-to', before)
  announce(copy.value.moved(ids.length, folder))
}

function confirmMove(): void {
  if (moveTarget.value)
    moveNodes(moveIds.value, moveTarget.value)
  moveOpen.value = false
}

function onMoveSelect(value: TreeValue): void {
  moveTarget.value = typeof value === 'string' ? value : null
}

/* ─── Keyboard (on the grid, never on document) ──────────────────────── */

function onGridKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || renamingId.value)
    return
  const list = items.value
  if (!list.length)
    return
  const key = event.key
  const mod = event.metaKey || event.ctrlKey
  const currentIndex = Math.max(0, list.findIndex(node => node.id === tabStopId.value))
  const node = list[currentIndex]!

  if (mod && key.toLowerCase() === 'a') {
    event.preventDefault()
    selected.value = new Set(list.map(item => item.id))
    return
  }
  if (event.altKey || (mod && key !== 'Backspace'))
    return

  const cols = view.value === 'grid' ? columnsPerRow() : 1
  const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }
  if (key in moves || key === 'Home' || key === 'End') {
    event.preventDefault()
    const target = key === 'Home' ? 0 : key === 'End' ? list.length - 1 : Math.min(list.length - 1, Math.max(0, currentIndex + moves[key]!))
    const next = list[target]!
    if (event.shiftKey)
      selectRange(next.id)
    else
      selectOnly(next.id)
    focusTile(next.id)
    return
  }
  if (key === 'Enter') {
    event.preventDefault()
    openItem(node)
    // A folder replaces the tiles, the focused one with them.
    if (isFolder(node))
      void nextTick(focusFirstItem)
  }
  else if (key === ' ') {
    event.preventDefault()
    if (!selected.value.has(node.id))
      selectOnly(node.id)
    if (!isFolder(node))
      openPreview(node.id)
  }
  else if (key === 'F2') {
    event.preventDefault()
    startRename(node.id)
  }
  else if (key === 'Delete' || key === 'Backspace') {
    event.preventDefault()
    removeIds(selected.value.size ? [...selected.value] : [node.id])
  }
  else if (key === 'Escape' && selected.value.size) {
    // Handled here, so the expanded stage must not collapse on the same press.
    event.preventDefault()
    clearSelection()
  }
  else if (key === 'ContextMenu' || (event.shiftKey && key === 'F10')) {
    event.preventDefault()
    openMenuForTile(node.id)
  }
}

/* ─── Context menu ────────────────────────────────────────────────────── */

const menuRef = ref<{ openAt: (target?: { x: number, y: number } | MouseEvent) => void, close: () => void } | null>(null)
const menu = reactive<MenuState>({ target: 'blank', ids: [], anchorId: null })
let menuTakesFocus = false

const menuNodes = computed(() => menu.ids.map(id => nodeMap.value.get(id)).filter((node): node is FileNode => Boolean(node)))
const menuSingle = computed(() => (menuNodes.value.length === 1 ? menuNodes.value[0]! : null))
const menuInPlugin = computed(() => menuNodes.value.some(node => inPluginStorage(node.id)))

function prepareMenu(id: string | null): void {
  if (id) {
    if (!selected.value.has(id))
      selectOnly(id)
    menu.target = 'items'
    menu.ids = [...selected.value]
    menu.anchorId = id
  }
  else {
    menu.target = 'blank'
    menu.ids = []
    menu.anchorId = null
  }
  menuTakesFocus = false
}

function onContextMenu(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  // Tiles carry the id themselves; a table row only has it on its name cell.
  const tile = target?.closest<HTMLElement>('[data-file]') ?? target?.closest('tr')?.querySelector<HTMLElement>('[data-file]')
  const id = tile?.dataset.file ?? null
  if (renamingId.value)
    return
  event.preventDefault()
  prepareMenu(id)
  menuRef.value?.openAt(event)
}

// The ContextMenu key and Shift+F10 have no pointer: the menu opens at the
// focused tile, not at the corner of the whole file area.
function openMenuForTile(id: string): void {
  const tile = rootRef.value?.querySelector<HTMLElement>(tileSelector(id))
  if (!tile)
    return
  prepareMenu(id)
  const rect = tile.getBoundingClientRect()
  menuRef.value?.openAt({ x: Math.round(rect.left + 12), y: Math.round(rect.top + Math.min(rect.height, 96)) })
}

const MENU_LEAVE_MS = 320
const focusTimers = new Set<ReturnType<typeof setTimeout>>()

function clearFocusTimers(): void {
  for (const timer of focusTimers)
    clearTimeout(timer)
  focusTimers.clear()
}

// TxContextMenu and TxDropdownMenu do not hand focus back. After Esc or a
// choice, focus is still on an item of the leaving (teleported) panel, and it
// falls to <body> once the panel has hidden. Only stranded focus moves — on
// <body>, or inside that panel — as the menu closes and once more after its
// leave transition; focus the reader put elsewhere keeps it.
function afterMenuClose(restore: () => void): void {
  const active = document.activeElement
  const panel = active instanceof HTMLElement ? active.closest('[role="menu"]') : null
  const settle = (): void => {
    const now = document.activeElement
    if (!now || now === document.body || panel?.contains(now))
      restore()
  }
  void nextTick(settle)
  const timer = setTimeout(() => {
    focusTimers.delete(timer)
    settle()
  }, MENU_LEAVE_MS)
  focusTimers.add(timer)
}

// A tile in the grid, a row in the list.
function focusItem(id: string): void {
  if (view.value === 'grid') {
    focusTile(id)
    return
  }
  const value = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id
  rootRef.value?.querySelector<HTMLElement>(`.files-table [data-file="${value}"]`)?.closest('tr')?.focus({ preventScroll: true })
}

function focusFirstItem(): void {
  const first = items.value[0]
  if (first)
    focusItem(first.id)
  else
    rootRef.value?.querySelector<HTMLElement>('.files-empty button')?.focus({ preventScroll: true })
}

function itemIds(): string[] {
  return [...(rootRef.value?.querySelectorAll<HTMLElement>('[data-file]') ?? [])].map(item => item.dataset.file ?? '')
}

// The item the menu was opened on gets focus back. If the choice took it
// away, the item now in its place does (removed), or the first of the folder
// it opened. A choice that moved focus on purpose (a rename field, quick look,
// a dialog) keeps it.
function onMenuClose(): void {
  const id = menu.anchorId
  const takes = menuTakesFocus
  menuTakesFocus = false
  if (takes || !id)
    return
  // Items emit select before the menu closes, so this is still the old render.
  const index = itemIds().indexOf(id)
  afterMenuClose(() => {
    const ids = items.value.map(node => node.id)
    if (ids.includes(id))
      focusItem(id)
    else if (id === currentId.value)
      focusFirstItem()
    else if (ids.length)
      focusItem(ids[Math.min(Math.max(index, 0), ids.length - 1)]!)
  })
}

function onSortMenuClose(): void {
  afterMenuClose(() => rootRef.value?.querySelector<HTMLElement>('.files-main__sort-trigger')?.focus({ preventScroll: true }))
}

// Picking the top folder takes this menu away (there is nothing above it to
// list) and disables Back, so focus goes on to the folder's first item.
function onAncestorsMenuClose(): void {
  afterMenuClose(() => {
    const trigger = rootRef.value?.querySelector<HTMLElement>('.files__ancestors')
    const back = rootRef.value?.querySelector<HTMLButtonElement>('.files__back')
    if (trigger)
      trigger.focus({ preventScroll: true })
    else if (back && !back.disabled)
      back.focus({ preventScroll: true })
    else
      focusFirstItem()
  })
}

function menuAction(action: 'open' | 'preview' | 'rename' | 'copy' | 'move' | 'download' | 'remove'): void {
  const list = menuNodes.value
  const first = list[0]
  if (!first)
    return
  if (action === 'open') {
    // Only quick look takes focus; a folder or a file the host opens leaves
    // it to the menu.
    menuTakesFocus = !isFolder(first) && isPreviewable(first)
    openItem(first)
  }
  else if (action === 'preview') {
    menuTakesFocus = true
    openPreview(first.id)
  }
  else if (action === 'rename') {
    menuTakesFocus = true
    startRename(first.id)
  }
  else if (action === 'copy') {
    void copyPath(first)
  }
  else if (action === 'move') {
    menuTakesFocus = true
    openMove(list.map(node => node.id))
  }
  else if (action === 'download') {
    download(list.map(node => node.id))
  }
  else {
    removeIds(list.map(node => node.id))
  }
}

function menuNewFolder(): void {
  // The new folder's name field takes focus; the menu must not take it back.
  menuTakesFocus = true
  createFolder()
}

function setSort(key: SortKey): void {
  if (sort.key === key)
    sort.order = sort.order === 'asc' ? 'desc' : 'asc'
  else
    Object.assign(sort, { key, order: key === 'name' || key === 'kind' ? 'asc' : 'desc' })
}

/* ─── List view (TxDataTable) ─────────────────────────────────────────── */

const listColumns = computed<DataTableColumn[]>(() => {
  const c = copy.value.columns
  if (mode.value === 'narrow') {
    return [
      { key: 'name', title: c.name, sortable: true },
      { key: 'size', title: c.size, width: 84, align: 'right', sortable: true },
    ]
  }
  return [
    { key: 'name', title: c.name, sortable: true },
    { key: 'size', title: c.size, width: 92, align: 'right', sortable: true },
    ...(mode.value === 'wide' ? [{ key: 'kind', title: c.kind, width: 120, sortable: true }] : []),
    { key: 'modified', title: c.modified, width: 132, sortable: true },
  ]
})

const tableSort = computed<DataTableSortState>(() => ({ key: sort.key, order: sort.order }))

function onTableSort(value: DataTableSortState | null): void {
  if (!value || !value.order)
    return
  Object.assign(sort, { key: value.key as SortKey, order: value.order })
}

const selectedKeys = computed<DataTableKey[]>(() => [...selected.value])

function onSelectedKeys(keys: DataTableKey[]): void {
  selected.value = new Set(keys.map(String))
}

let lastRowClick: { id: string, at: number } | null = null
let lastPointerAt = 0

// TxDataTable reports row clicks without the event; the wrapper remembers
// the modifiers of the pointer press that caused one, and a click with no
// press just before it came from the keyboard (Enter on a focused row).
let lastModifiers = { meta: false, shift: false }

function onListPointer(event: PointerEvent): void {
  lastPointerAt = Date.now()
  lastModifiers = { meta: event.metaKey || event.ctrlKey, shift: event.shiftKey }
}

function onRowClick(payload: { row: unknown }): void {
  const node = payload.row as FileNode
  const now = Date.now()
  if (now - lastPointerAt > 600) {
    openItem(node)
    if (isFolder(node))
      void nextTick(focusFirstItem)
    return
  }
  if (lastRowClick && lastRowClick.id === node.id && now - lastRowClick.at < 400) {
    lastRowClick = null
    openItem(node)
    return
  }
  lastRowClick = { id: node.id, at: now }
  if (lastModifiers.meta)
    toggleSelected(node.id)
  else if (lastModifiers.shift)
    selectRange(node.id)
  else
    selectOnly(node.id)
}

// TxDataTable already turns Enter and Space on a focused row into a row
// click (open, here); the rest of the grid's keys are added on the wrapper.
function onTableKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || renamingId.value || event.altKey)
    return
  const id = (event.target as HTMLElement | null)?.closest('tr')?.querySelector<HTMLElement>('[data-file]')?.dataset.file
  const node = id ? nodeMap.value.get(id) : undefined
  if (!node)
    return
  const key = event.key
  if (key === 'F2') {
    event.preventDefault()
    selectOnly(node.id)
    startRename(node.id)
  }
  else if (key === 'Delete' || key === 'Backspace') {
    event.preventDefault()
    removeIds(selected.value.size ? [...selected.value] : [node.id])
  }
  else if (key === 'ContextMenu' || (event.shiftKey && key === 'F10')) {
    event.preventDefault()
    const rect = (event.target as HTMLElement).getBoundingClientRect()
    prepareMenu(node.id)
    menuRef.value?.openAt({ x: Math.round(rect.left + 24), y: Math.round(rect.bottom) })
  }
  else if (key === 'Escape' && selected.value.size) {
    event.preventDefault()
    clearSelection()
  }
}

function asNode(row: unknown): FileNode {
  return row as FileNode
}

/* ─── Drag files onto a folder in the tree ───────────────────────────── */

const DRAG_TYPE = 'application/x-tuff-file'
const dragIds = ref<string[]>([])
const dropFolder = ref<string | null>(null)

function onTileDragStart(event: DragEvent, node: FileNode): void {
  if (renamingId.value || !event.dataTransfer) {
    event.preventDefault()
    return
  }
  const ids = selected.value.has(node.id) ? [...selected.value] : [node.id]
  if (!selected.value.has(node.id))
    selectOnly(node.id)
  dragIds.value = ids
  // A custom type only: the page must not mistake this for files from the
  // desktop (an image dragged as itself would carry `Files`).
  event.dataTransfer.setData(DRAG_TYPE, ids.join(','))
  event.dataTransfer.effectAllowed = 'move'
}

function onTileDragEnd(): void {
  dragIds.value = []
  dropFolder.value = null
}

function onFolderDragOver(event: DragEvent, id: string): void {
  if (!dragIds.value.length || !canMoveInto(id, dragIds.value))
    return
  event.preventDefault()
  if (event.dataTransfer)
    event.dataTransfer.dropEffect = 'move'
  dropFolder.value = id
}

function onFolderDragLeave(id: string): void {
  if (dropFolder.value === id)
    dropFolder.value = null
}

function onFolderDrop(event: DragEvent, id: string): void {
  if (!dragIds.value.length || !canMoveInto(id, dragIds.value))
    return
  event.preventDefault()
  moveNodes(dragIds.value, id)
  dragIds.value = []
  dropFolder.value = null
}

/* ─── Upload: desktop drops and the tray ──────────────────────────────── */

const uploaderRef = ref<{ pick: () => void } | null>(null)
const dropDepth = ref(0)
const jobs = ref<UploadJob[]>([])
const trayOpen = ref(false)
const trayHover = ref(false)
const traySync = ref(false)
const objectUrls = new Set<string>()
let uploadTimer: ReturnType<typeof setInterval> | undefined
let trayTimer: ReturnType<typeof setTimeout> | undefined

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function onAreaDragEnter(event: DragEvent): void {
  if (hasFiles(event))
    dropDepth.value += 1
}

function onAreaDragLeave(event: DragEvent): void {
  if (hasFiles(event))
    dropDepth.value = Math.max(0, dropDepth.value - 1)
}

function onAreaDrop(): void {
  dropDepth.value = 0
}

// Anywhere else in the template a file dropped from the desktop is refused
// rather than left to the browser, which would navigate the docs page to it.
function onRootDragOver(event: DragEvent): void {
  if (!hasFiles(event))
    return
  event.preventDefault()
  if (event.dataTransfer && !(event.target as HTMLElement | null)?.closest?.('.files-drop'))
    event.dataTransfer.dropEffect = 'none'
}

function onRootDrop(event: DragEvent): void {
  if (hasFiles(event))
    event.preventDefault()
  dropDepth.value = 0
}

function uploadFolderLabel(): string {
  const chain = crumbs.value.slice(-2).map(displayName)
  return chain.join(' / ')
}

// The host's own checks, in the order it runs them; `pending` is what this
// batch has already claimed ahead of the file.
function rejectReason(folderId: string, file: { name: string, size: number }, pending: { count: number, bytes: number }): UploadError | null {
  if (!inPluginStorage(folderId))
    return null
  if (!PLUGIN_FILE_NAME.test(file.name))
    return 'badName'
  if (file.size > PLUGIN_MAX_FILE)
    return 'tooBig'
  if (fileCount(folderId) + pending.count >= PLUGIN_MAX_FILES)
    return 'tooMany'
  if (sizeOf(nodeMap.value.get(folderId)!) + pending.bytes + file.size > PLUGIN_MAX_TOTAL)
    return 'full'
  return null
}

function queue(files: { name: string, size: number, file: File | null, art?: Art, dims?: [number, number] }[], folderId: string, sync = false): void {
  if (!files.length)
    return
  const pending = { count: 0, bytes: 0 }
  const added: UploadJob[] = files.map((item, index) => {
    const error = rejectReason(folderId, item, pending)
    if (!error) {
      pending.count += 1
      pending.bytes += item.size
    }
    seq += 1
    return {
      id: `upload-${seq}`,
      name: item.name,
      size: item.size,
      folderId,
      progress: error ? 0 : 2,
      status: error ? 'error' : 'uploading',
      error,
      file: item.file,
      seed: seq * 7 + index,
      art: item.art,
      dims: item.dims,
    }
  })
  // A new batch replaces the rows of a finished one.
  const running = jobs.value.filter(job => job.status === 'uploading')
  jobs.value = [...running, ...added]
  traySync.value = sync
  trayOpen.value = true
  clearTimeout(trayTimer)
  announce(copy.value.tray.started(added.length))
  if (!jobs.value.some(job => job.status === 'uploading')) {
    finishBatch()
    return
  }
  if (!uploadTimer)
    uploadTimer = setInterval(tickUploads, 120)
}

function tickUploads(): void {
  let running = 0
  for (const job of jobs.value) {
    if (job.status !== 'uploading')
      continue
    // Uneven steps, sized so a 1 MB file takes about 1.4 s; the bar's own
    // easing smooths them out.
    const rand = random(job.seed + Math.round(job.progress))()
    const step = Math.max(1.5, 100 / Math.max(8, 6 + (job.size / MB) * 5.5)) * (0.5 + rand)
    job.progress = Math.min(100, job.progress + step)
    if (job.progress >= 100)
      completeJob(job)
    else
      running += 1
  }
  if (!running) {
    clearInterval(uploadTimer)
    uploadTimer = undefined
    finishBatch()
  }
}

function completeJob(job: UploadJob): void {
  job.status = 'done'
  job.progress = 100
  if (!nodeMap.value.has(job.folderId))
    return
  seq += 1
  const kind = job.art ? 'image' : kindFromName(job.name, job.file?.type)
  const node: FileNode = {
    id: `file-${seq}`,
    parentId: job.folderId,
    kind,
    name: uniqueName(job.folderId, job.name),
    size: job.size,
    modifiedAt: NOW + seq * 1000,
    source: job.art ? 'macbook' : 'upload',
    art: job.art,
    dims: job.dims,
    isNew: true,
  }
  if (job.file && kind === 'image') {
    const url = URL.createObjectURL(job.file)
    objectUrls.add(url)
    node.objectUrl = url
  }
  nodes.value = [...nodes.value, node]
  // Small text files get a real preview; anything else keeps its metadata.
  if (job.file && (kind === 'markdown' || kind === 'text' || kind === 'json' || kind === 'csv') && job.file.size <= TEXT_PREVIEW_LIMIT) {
    void job.file.text().then((text) => {
      const target = nodes.value.find(item => item.id === node.id)
      if (target)
        target.preview = { zh: text, en: text }
    })
  }
}

const trayStats = computed(() => ({
  running: jobs.value.filter(job => job.status === 'uploading').length,
  done: jobs.value.filter(job => job.status === 'done').length,
  failed: jobs.value.filter(job => job.status === 'error').length,
}))

const trayTitle = computed(() => {
  const { running, done, failed } = trayStats.value
  const t = copy.value.tray
  if (running)
    return traySync.value ? t.syncing(jobs.value.length) : t.uploading(jobs.value.length)
  if (failed)
    return t.partial(done, failed)
  return traySync.value ? t.synced(done) : t.done(done)
})

function finishBatch(): void {
  const { done, failed } = trayStats.value
  announce(copy.value.tray.finished(done, failed))
  scheduleTrayClose()
}

// A finished tray settles away after a moment, unless the pointer is on it
// or a row still needs the reader (a failed upload).
function scheduleTrayClose(): void {
  clearTimeout(trayTimer)
  if (trayStats.value.running || trayStats.value.failed)
    return
  trayTimer = setTimeout(() => {
    if (!trayHover.value)
      trayOpen.value = false
  }, 2400)
}

function onTrayLeave(): void {
  trayHover.value = false
  scheduleTrayClose()
}

function closeTray(): void {
  clearTimeout(trayTimer)
  trayOpen.value = false
  jobs.value = jobs.value.filter(job => job.status === 'uploading')
}

function retryInWorkspace(job: UploadJob): void {
  jobs.value = jobs.value.filter(item => item.id !== job.id)
  queue([{ name: job.name, size: job.size, file: job.file }], 'ws-docs')
}

function onFilesAdded(added: FileUploaderFile[]): void {
  dropDepth.value = 0
  queue(added.map(item => ({ name: item.name, size: item.size, file: item.file })), current.value.id)
}

function pickFiles(): void {
  uploaderRef.value?.pick()
}

/* ─── Scripted playback: a sync from the reader's other machine ───────── */

let entered = false

function syncShots(): void {
  const files = SYNC_FILES.filter(file => !childrenOf(SEPTEMBER_SHOTS).some(node => node.name === file.name))
  if (!files.length)
    return
  if (prefersReducedMotion()) {
    // The end state, without the tray or its timers.
    for (const file of files) {
      seq += 1
      nodes.value = [...nodes.value, {
        id: `file-${seq}`,
        parentId: SEPTEMBER_SHOTS,
        kind: 'image',
        name: file.name,
        size: file.size,
        modifiedAt: NOW + seq * 1000,
        source: 'macbook',
        art: file.art,
        dims: [1440, 900],
        isNew: true,
      }]
    }
    return
  }
  queue(files.map(file => ({ name: file.name, size: file.size, file: null, art: file.art, dims: [1440, 900] as [number, number] })), SEPTEMBER_SHOTS, true)
}

function onEnter(): void {
  entered = true
  syncShots()
}

/* ─── Reset ───────────────────────────────────────────────────────────── */

function releaseUrls(): void {
  for (const url of objectUrls)
    URL.revokeObjectURL(url)
  objectUrls.clear()
}

function resetDemo(): void {
  clearFocusTimers()
  closeToast()
  clearTimeout(trayTimer)
  clearInterval(uploadTimer)
  uploadTimer = undefined
  // Cleared before the menu and the preview close, so neither hands focus
  // back to a tile: a reset (or a language switch) must not pull focus here.
  menu.anchorId = null
  previewId.value = null
  menuRef.value?.close()
  releaseUrls()
  nodes.value = seedNodes()
  currentId.value = SEPTEMBER_SHOTS
  expandedKeys.value = [ROOT_WS, 'ws-shots', ROOT_PLUGINS]
  view.value = 'grid'
  Object.assign(sort, { key: 'modified', order: 'desc' })
  search.value = ''
  selected.value = new Set()
  anchorId.value = null
  focusId.value = null
  split.value = 0.62
  jobs.value = []
  trayOpen.value = false
  trayHover.value = false
  dropDepth.value = 0
  dragIds.value = []
  dropFolder.value = null
  previewOpen.value = false
  moveOpen.value = false
  announcement.value = ''
  cancelRename()
  if (entered)
    syncShots()
}

defineExpose({ resetDemo })

watch(locale, () => resetDemo())

onBeforeUnmount(() => {
  clearFocusTimers()
  clearTimeout(toastTimer)
  clearTimeout(trayTimer)
  clearInterval(uploadTimer)
  releaseUrls()
})
</script>

<template>
  <TemplateFrame :title="copy.frameTitle" :height="580" @enter="onEnter">
    <template #default="{ width: stageW, height: stageH }">
      <StageSize :width="stageW" :height="stageH" @resize="onStageResize" />

      <DefinePreview v-slot="{ item, compact }">
        <div class="files-preview" :class="{ 'is-compact': compact }">
          <div class="files-preview__stage">
            <img v-if="item.kind === 'image' && thumbOf(item)" class="files-preview__image" :src="thumbOf(item)" :alt="item.name" draggable="false">
            <div v-else-if="item.preview && item.kind === 'markdown'" class="files-preview__doc">
              <TxMarkdownView :content="L(item.preview)" />
            </div>
            <pre v-else-if="item.preview" class="files-preview__text">{{ L(item.preview) }}</pre>
            <TxEmptyState v-else variant="custom" size="small" :title="copy.preview.unsupported" :description="copy.preview.unsupportedDesc">
              <template #icon>
                <span class="files-empty-icon" :class="KIND_META[item.kind].icon" aria-hidden="true" />
              </template>
            </TxEmptyState>
          </div>
          <div class="files-preview__meta">
            <span>{{ copy.kinds[item.kind] }}<template v-if="item.dims"> · {{ item.dims[0] }}×{{ item.dims[1] }}</template> · {{ formatSize(sizeOf(item)) }}</span>
            <span>{{ copy.preview.modified(relative(item.modifiedAt)) }}<template v-if="item.source"> · {{ copy.sources[item.source] }}</template></span>
          </div>
          <div v-if="compact && item.kind === 'image' && siblingsOf(item).length > 1" class="files-preview__siblings">
            <span class="files-preview__label">{{ copy.preview.siblings }}</span>
            <TxImageGallery
              :items="siblingsOf(item)"
              :preview-title="copy.preview.gallery.title"
              :previous-label="copy.preview.gallery.prev"
              :next-label="copy.preview.gallery.next"
              :previous-text="copy.preview.gallery.prevText"
              :next-text="copy.preview.gallery.nextText"
              :item-label-formatter="copy.preview.galleryItem"
              :open-label-formatter="copy.preview.galleryOpen"
            />
          </div>
          <div v-if="compact" class="files-preview__actions">
            <TxButton size="sm" variant="primary" icon="i-carbon-launch" @click="openItem(item)">
              {{ copy.preview.open }}
            </TxButton>
            <TxButton size="sm" variant="secondary" icon="i-carbon-copy" @click="copyPath(item)">
              {{ copy.preview.copyPath }}
            </TxButton>
          </div>
        </div>
      </DefinePreview>

      <DefineContent>
        <div
          class="files-area"
          @dragenter="onAreaDragEnter"
          @dragleave="onAreaDragLeave"
          @drop="onAreaDrop"
          @contextmenu="onContextMenu"
        >
          <div class="files-scroll">
            <template v-if="items.length">
              <div
                v-if="view === 'grid'"
                ref="gridRef"
                class="files-grid"
                role="listbox"
                aria-multiselectable="true"
                :aria-label="copy.gridLabel(displayName(current))"
                @click="onGridClick"
                @keydown="onGridKeydown"
              >
                <div
                  v-for="node in items"
                  :id="`${uid}-file-${node.id}`"
                  :key="node.id"
                  class="file-tile"
                  :class="{ 'is-selected': selected.has(node.id), 'is-folder': isFolder(node), 'is-drop': dropFolder === node.id }"
                  role="option"
                  :aria-selected="selected.has(node.id)"
                  :aria-labelledby="`${uid}-file-${node.id}-name ${uid}-file-${node.id}-new ${uid}-file-${node.id}-meta`"
                  :tabindex="tabStopId === node.id ? 0 : -1"
                  :data-file="node.id"
                  :draggable="renamingId !== node.id"
                  @click="onTileClick($event, node)"
                  @dblclick="openItem(node)"
                  @focus="focusId = node.id"
                  @dragstart="onTileDragStart($event, node)"
                  @dragend="onTileDragEnd"
                  @dragover="isFolder(node) && onFolderDragOver($event, node.id)"
                  @dragleave="onFolderDragLeave(node.id)"
                  @drop="isFolder(node) && onFolderDrop($event, node.id)"
                >
                  <span class="file-tile__thumb">
                    <TxCornerOverlay placement="bottom-right" :offset-x="6" :offset-y="6">
                      <img v-if="thumbOf(node)" class="file-tile__image" :src="thumbOf(node)" alt="" draggable="false">
                      <TxIconChip v-else :size="44" :tone="KIND_META[node.kind].tone" variant="soft" :radius="12">
                        <span :class="KIND_META[node.kind].icon" />
                      </TxIconChip>
                      <template v-if="!isFolder(node) && thumbOf(node)" #overlay>
                        <TxIconChip :size="16" :label="badgeLabel(node)" :tone="KIND_META[node.kind].tone" />
                      </template>
                    </TxCornerOverlay>
                    <!-- The box adds a tile without ⌘. The grid owns keyboard selection,
                         so it stays out of the Tab order; it is named because a
                         click focuses it. The option takes its own name from the
                         file name, 新 tag and size, so this one is not read into it. -->
                    <span class="file-tile__check" @click.stop @dblclick.stop>
                      <TxCheckbox
                        :model-value="selected.has(node.id)"
                        tabindex="-1"
                        :aria-label="copy.selectFile(displayName(node))"
                        @update:model-value="toggleSelected(node.id)"
                      />
                    </span>
                    <span v-if="node.isNew" :id="`${uid}-file-${node.id}-new`" class="file-tile__new">
                      <TxTag :label="copy.isNew" color="var(--tx-bui-accent, #0285ff)" variant="soft" />
                    </span>
                  </span>
                  <span v-if="renamingId === node.id" class="files-rename" @click.stop @dblclick.stop>
                    <TxInput v-model="renameDraft" :aria-label="copy.rename.label" @keydown="onRenameKeydown" @blur="onRenameBlur" />
                    <span v-if="renameError" class="files-rename__error" role="alert">{{ renameError }}</span>
                  </span>
                  <span v-else :id="`${uid}-file-${node.id}-name`" class="file-tile__name" :title="displayName(node)">
                    <template v-for="(part, index) in nameParts(displayName(node))" :key="index">{{ part }}<wbr></template>
                  </span>
                  <span :id="`${uid}-file-${node.id}-meta`" class="file-tile__meta">{{ isFolder(node) ? copy.folderItems(childrenOf(node.id).length) : formatSize(node.size) }}</span>
                </div>
              </div>

              <div v-else class="files-table" @pointerdown.capture="onListPointer" @keydown="onTableKeydown">
                <TxDataTable
                  :selected-keys="selectedKeys"
                  :columns="listColumns"
                  :data="items"
                  :sort="tableSort"
                  :sort-on-client="false"
                  row-key="id"
                  sort-cycle="bi"
                  table-layout="fixed"
                  selectable
                  highlight-selected
                  sticky-header
                  @update:selected-keys="onSelectedKeys"
                  @update:sort="onTableSort"
                  @row-click="onRowClick"
                >
                  <template #cell-name="{ row }">
                    <span class="files-cell" :data-file="asNode(row).id">
                      <TxIconChip v-if="isFolder(asNode(row))" :size="20" tone="accent" variant="soft">
                        <span class="i-carbon-folder" />
                      </TxIconChip>
                      <TxIconChip v-else :size="16" :label="badgeLabel(asNode(row))" :tone="KIND_META[asNode(row).kind].tone" />
                      <span v-if="renamingId === asNode(row).id" class="files-rename" @click.stop>
                        <TxInput v-model="renameDraft" :aria-label="copy.rename.label" @keydown="onRenameKeydown" @blur="onRenameBlur" />
                        <span v-if="renameError" class="files-rename__error" role="alert">{{ renameError }}</span>
                      </span>
                      <span v-else class="files-cell__name">{{ displayName(asNode(row)) }}</span>
                      <TxTag v-if="asNode(row).isNew" :label="copy.isNew" color="var(--tx-bui-accent, #0285ff)" variant="soft" />
                    </span>
                  </template>
                  <template #cell-size="{ row }">
                    <span class="files-number">{{ isFolder(asNode(row)) ? copy.folderItems(childrenOf(asNode(row).id).length) : formatSize(asNode(row).size) }}</span>
                  </template>
                  <template #cell-kind="{ row }">
                    <span class="files-muted">{{ copy.kinds[asNode(row).kind] }}</span>
                  </template>
                  <template #cell-modified="{ row }">
                    <span class="files-muted" :title="dateFormat.format(asNode(row).modifiedAt)">{{ relative(asNode(row).modifiedAt) }}</span>
                  </template>
                </TxDataTable>
              </div>
            </template>

            <div v-else class="files-empty">
              <TxSearchEmpty
                v-if="needle"
                size="small"
                :title="copy.empty.searchTitle"
                :description="copy.empty.searchDesc"
                :primary-action="{ label: copy.empty.clear, icon: 'i-carbon-filter-remove' }"
                @primary="search = ''"
              >
                <template #icon>
                  <span class="files-empty-icon i-carbon-search" aria-hidden="true" />
                </template>
              </TxSearchEmpty>
              <TxEmptyState
                v-else
                variant="custom"
                size="small"
                :title="copy.empty.title"
                :description="copy.empty.desc"
                :primary-action="{ label: copy.upload, icon: 'i-carbon-upload' }"
                @primary="pickFiles"
              >
                <template #icon>
                  <span class="files-empty-icon i-carbon-folder-open" aria-hidden="true" />
                </template>
              </TxEmptyState>
            </div>
          </div>

          <!-- Files from the desktop land on the uploader laid over the area. It
               stays mounted while hidden so the Upload button can open its picker. -->
          <div v-show="dropDepth > 0" class="files-drop">
            <TxFileUploader
              ref="uploaderRef"
              :model-value="[]"
              multiple
              :max="20"
              :drop-text="copy.uploader.drop(uploadFolderLabel())"
              :hint-text="currentInPlugin ? copy.uploader.pluginHint : copy.uploader.hint"
              :button-text="copy.uploader.button"
              @add="onFilesAdded"
            />
          </div>

          <div v-if="selected.size" class="files-bulk">
            <span class="files-bulk__count">{{ copy.selected(selected.size, formatSize(selectedSize)) }}</span>
            <TxButton size="sm" variant="secondary" icon="i-carbon-download" @click="download([...selected])">
              {{ copy.menu.download }}
            </TxButton>
            <TxButton v-if="!currentInPlugin" size="sm" variant="secondary" icon="i-carbon-folder-move-to" @click="openMove([...selected])">
              {{ copy.menu.moveTo }}
            </TxButton>
            <TxButton size="sm" variant="danger" icon="i-carbon-trash-can" @click="removeIds([...selected])">
              {{ copy.menu.remove }}
            </TxButton>
            <TxIconButton class="files-bulk__clear" icon="i-carbon-close" size="xs" :label="copy.clearSelection" @click="clearSelection" />
          </div>

          <!-- TxToastPanel fades rather than unmounts: while closed the wrapper
               is inert, so its buttons leave the Tab order. -->
          <div
            class="files__toast"
            :class="{ 'is-open': toast.open }"
            :inert="toast.open ? undefined : true"
            @mouseenter="holdToast('hover')"
            @mouseleave="releaseToast('hover')"
            @focusin="holdToast('focus')"
            @focusout="onToastFocusOut"
          >
            <TxToastPanel :open="toast.open" :stack="0" side="above" :tether-length="10" :aria-label="copy.toastLabel">
              <div class="files-toast">
                <span class="files-toast__icon" :class="toast.icon" aria-hidden="true" />
                <span class="files-toast__text">{{ toast.text }}</span>
                <button v-if="toast.undoable" type="button" class="files-toast__action" @click="undo">
                  {{ copy.undo }}
                </button>
                <button type="button" class="files-toast__close" :aria-label="copy.dismiss" @click="closeToast">
                  <span class="i-carbon-close" aria-hidden="true" />
                </button>
              </div>
            </TxToastPanel>
          </div>
        </div>
      </DefineContent>

      <div
        ref="rootRef"
        class="files"
        :class="[`is-${mode}`, { 'has-pane': showPane }]"
        @dragover="onRootDragOver"
        @drop="onRootDrop"
      >
        <header class="files__bar">
          <div class="files__path">
            <TxIconButton v-if="mode === 'narrow'" class="files__back" icon="i-carbon-arrow-left" size="sm" :label="copy.back" :disabled="!current.parentId" @click="goUp" />
            <TxDropdownMenu v-if="mode === 'narrow' && crumbs.length > 1" placement="bottom-start" :min-width="200" @close="onAncestorsMenuClose">
              <template #trigger>
                <TxIconButton class="files__ancestors" icon="i-carbon-overflow-menu-horizontal" size="sm" :label="copy.ancestors" />
              </template>
              <TxDropdownItem v-for="node in crumbs.slice(0, -1)" :key="node.id" @select="navigate(node.id)">
                <span class="files-menu-item"><span class="i-carbon-folder" aria-hidden="true" />{{ displayName(node) }}</span>
              </TxDropdownItem>
            </TxDropdownMenu>
            <TxBreadcrumb :items="breadcrumbItems" separator-icon="i-carbon-chevron-right" @click="onCrumb" />
          </div>
          <div class="files__tools">
            <div class="files__search">
              <TxSearchInput v-model="search" :placeholder="copy.searchPlaceholder" :aria-label="copy.searchLabel" />
            </div>
            <TxFlatRadio v-model="view" size="sm" :aria-label="copy.view.label">
              <TxFlatRadioItem value="grid" icon="i-carbon-grid" :aria-label="copy.view.grid" :title="copy.view.grid" />
              <TxFlatRadioItem value="list" icon="i-carbon-list" :aria-label="copy.view.list" :title="copy.view.list" />
            </TxFlatRadio>
            <TxButton v-if="mode === 'wide' && !currentInPlugin" size="sm" variant="secondary" icon="i-carbon-folder-add" @click="createFolder">
              {{ copy.newFolder }}
            </TxButton>
            <div class="files__upload">
              <TxButton size="sm" variant="primary" icon="i-carbon-upload" :aria-label="copy.uploadLabel" @click="pickFiles">
                <span class="files__upload-label">{{ copy.upload }}</span>
              </TxButton>
              <!-- Progress changes several times a second: the tray itself stays
                   silent and the sr-only status below announces start and end. -->
              <div
                class="files__tray"
                :class="{ 'is-open': trayOpen }"
                :inert="trayOpen ? undefined : true"
                @pointerenter="trayHover = true"
                @pointerleave="onTrayLeave"
              >
                <TxToastPanel :open="trayOpen" :stack="jobs.length > 1 ? 1 : 0" :tether-length="10" live="off" aria-live="off" :aria-label="copy.tray.label">
                  <div class="files-tray">
                    <div class="files-tray__head">
                      <span class="files-tray__icon" :class="traySync ? 'i-carbon-laptop' : 'i-carbon-cloud-upload'" aria-hidden="true" />
                      <strong class="files-tray__title">{{ trayTitle }}</strong>
                      <button type="button" class="files-tray__close" :aria-label="copy.tray.dismiss" @click="closeTray">
                        <span class="i-carbon-close" aria-hidden="true" />
                      </button>
                    </div>
                    <TxCardItem v-for="job in jobs" :key="job.id" class="files-tray__row" align="center">
                      <template #avatar>
                        <TxIconChip :size="28" :tone="job.status === 'error' ? 'red' : KIND_META[job.art ? 'image' : kindFromName(job.name, job.file?.type)].tone" variant="soft">
                          <span :class="job.status === 'error' ? 'i-carbon-warning-alt' : KIND_META[job.art ? 'image' : kindFromName(job.name, job.file?.type)].icon" />
                        </TxIconChip>
                      </template>
                      <template #title>
                        <span class="files-tray__name">{{ job.name }}</span>
                      </template>
                      <template #right>
                        <span v-if="job.status === 'done'" class="files-tray__done i-carbon-checkmark-filled" aria-hidden="true" />
                      </template>
                      <template #description>
                        <template v-if="job.status === 'error'">
                          <span class="files-tray__error">{{ copy.tray[job.error!] }}</span>
                          <button v-if="job.file" type="button" class="files-link" @click="retryInWorkspace(job)">
                            {{ copy.tray.toWorkspace }}
                          </button>
                        </template>
                        <TxProgressBar
                          v-else
                          :percentage="Math.round(job.progress)"
                          height="4px"
                          show-text
                          text-placement="top"
                          :format="copy.tray.progress"
                          :detail="`${formatSize(job.size * job.progress / 100)} / ${formatSize(job.size)}`"
                          :status="job.status === 'done' ? 'success' : ''"
                          :aria-label="copy.tray.rowLabel(job.name)"
                        />
                      </template>
                    </TxCardItem>
                  </div>
                </TxToastPanel>
              </div>
            </div>
          </div>
        </header>

        <div class="files__body">
          <aside v-if="mode !== 'narrow'" class="files-side">
            <div class="files-side__tree">
              <TxTree
                :nodes="treeNodes"
                :model-value="current.id"
                :expanded-keys="expandedKeys"
                :aria-label="copy.treeLabel"
                @update:model-value="onTreeSelect"
                @update:expanded-keys="onTreeExpanded"
              >
                <template #item="{ node, level, expanded, hasChildren, selected: isSelected, toggleExpand }">
                  <span
                    class="files-tree-row"
                    :class="{ 'is-selected': isSelected, 'is-drop': dropFolder === node.key }"
                    @dragover="onFolderDragOver($event, String(node.key))"
                    @dragleave="onFolderDragLeave(String(node.key))"
                    @drop="onFolderDrop($event, String(node.key))"
                  >
                    <!-- The row's own click selects; the caret must only expand. -->
                    <button
                      v-if="hasChildren"
                      type="button"
                      class="files-tree-row__caret"
                      :class="{ 'is-open': expanded }"
                      tabindex="-1"
                      aria-hidden="true"
                      @click.stop="toggleExpand()"
                    >
                      <span class="i-carbon-chevron-right" />
                    </button>
                    <span v-else class="files-tree-row__caret" aria-hidden="true" />
                    <span
                      class="files-tree-row__icon"
                      :class="level === 0 ? (node.key === ROOT_PLUGINS ? 'i-carbon-plug' : 'i-carbon-workspace') : expanded ? 'i-carbon-folder-open' : 'i-carbon-folder'"
                      aria-hidden="true"
                    />
                    <span class="files-tree-row__label">{{ node.label }}</span>
                    <span v-if="level > 0 && fileCount(String(node.key))" class="files-tree-row__count">{{ fileCount(String(node.key)) }}</span>
                  </span>
                </template>
              </TxTree>
            </div>

            <div class="files-quota">
              <span class="files-quota__title">
                <span class="i-carbon-plug" aria-hidden="true" />{{ copy.quota.title }}
                <span class="files-quota__hint">{{ copy.quota.hint }}</span>
              </span>
              <button
                v-for="usage in pluginUsage"
                :key="usage.id"
                type="button"
                class="files-quota__row"
                :class="{ 'is-current': usage.id === current.id, 'is-near': usage.near }"
                @click="navigate(usage.id)"
              >
                <span class="files-quota__name">{{ usage.name }}</span>
                <span class="files-quota__used">{{ formatSize(usage.used) }}</span>
                <TxProgressBar
                  :percentage="Math.min(100, usage.used / PLUGIN_MAX_TOTAL * 100)"
                  height="4px"
                  :color="usage.near ? 'var(--tx-color-warning, #e6a23c)' : 'var(--tx-bui-accent, #0285ff)'"
                  :aria-label="copy.quota.barLabel(usage.name, formatSize(usage.used))"
                />
              </button>
              <span class="files-quota__workspace">{{ copy.quota.workspace(formatSize(workspaceUsed)) }}</span>
            </div>
          </aside>

          <section class="files-main">
            <header class="files-main__head">
              <span class="files-main__count">{{ copy.items(items.length) }}</span>
              <template v-if="currentUsage">
                <span class="files-main__quota">
                  <span class="files-main__quota-text">
                    {{ copy.quota.used(formatSize(currentUsage.used), '100 MB') }}
                    <span class="files-main__quota-rules">· {{ copy.quota.rules(currentUsage.files) }}</span>
                  </span>
                  <TxProgressBar
                    :segments="usageSegments"
                    :segments-total="100"
                    height="6px"
                    :aria-label="copy.quota.barLabel(currentUsage.name, formatSize(currentUsage.used))"
                  />
                </span>
                <TxStatusBadge v-if="currentUsage.near" size="sm" status="warning" icon="i-carbon-warning-alt" :text="copy.quota.near" />
              </template>
              <TxDropdownMenu placement="bottom-end" :min-width="190" @close="onSortMenuClose">
                <template #trigger>
                  <TxButton class="files-main__sort-trigger" size="sm" variant="ghost" :icon="sort.order === 'asc' ? 'i-carbon-sort-ascending' : 'i-carbon-sort-descending'">
                    <span class="files-main__sort">{{ copy.sortedBy(copy.sort[sort.key]) }}</span>
                  </TxButton>
                </template>
                <TxDropdownItem v-for="key in (['name', 'modified', 'size', 'kind'] as SortKey[])" :key="key" @select="setSort(key)">
                  {{ copy.sort[key] }}
                  <template v-if="sort.key === key" #right>
                    <span :class="sort.order === 'asc' ? 'i-carbon-sort-ascending' : 'i-carbon-sort-descending'" class="files-check" aria-hidden="true" />
                  </template>
                </TxDropdownItem>
              </TxDropdownMenu>
            </header>

            <div class="files-main__body">
              <TxSplitter v-if="showPane" v-model="split" :min="0.45" :max="0.75" :bar-size="9">
                <template #a>
                  <ReuseContent />
                </template>
                <template #b>
                  <aside class="files-pane" :aria-label="copy.preview.title">
                    <template v-if="paneItem && !isFolder(paneItem)">
                      <strong class="files-pane__title">{{ paneItem.name }}</strong>
                      <ReusePreview :item="paneItem" :compact="true" />
                    </template>
                    <template v-else-if="paneItem">
                      <strong class="files-pane__title">{{ displayName(paneItem) }}</strong>
                      <span class="files-pane__summary">{{ copy.preview.folderSummary(childrenOf(paneItem.id).length, formatSize(sizeOf(paneItem))) }}</span>
                    </template>
                    <TxNoSelection v-else size="small" :title="copy.preview.noSelection">
                      <template #icon>
                        <span class="files-empty-icon i-carbon-document-view" aria-hidden="true" />
                      </template>
                      <template #description>
                        <span class="files-pane__hint"><TxKbd>{{ copy.keys.space }}</TxKbd>{{ copy.preview.noSelectionDesc }}</span>
                      </template>
                    </TxNoSelection>
                  </aside>
                </template>
              </TxSplitter>
              <ReuseContent v-else />
            </div>
          </section>
        </div>

        <!-- One menu for every tile and for the empty area. It renders a
             two-node fragment, hence the wrapper for positioning. -->
        <div class="files__menu">
          <TxContextMenu ref="menuRef" trigger="manual" :width="228" @close="onMenuClose">
            <template #menu>
              <template v-if="menu.target === 'items' && menuNodes.length">
                <TxContextMenuItem v-if="menuSingle" class="files-menu" :shortcut="copy.keys.enter" @select="menuAction('open')">
                  <template #avatar>
                    <span class="files-menu__icon i-carbon-launch" aria-hidden="true" />
                  </template>
                  {{ copy.menu.open }}
                </TxContextMenuItem>
                <TxContextMenuItem v-if="menuSingle && !isFolder(menuSingle)" class="files-menu" :shortcut="copy.keys.space" @select="menuAction('preview')">
                  <template #avatar>
                    <span class="files-menu__icon i-carbon-view" aria-hidden="true" />
                  </template>
                  {{ copy.menu.preview }}
                </TxContextMenuItem>
                <TxContextMenuItem v-if="menuSingle" class="files-menu" shortcut="F2" @select="menuAction('rename')">
                  <template #avatar>
                    <span class="files-menu__icon i-carbon-edit" aria-hidden="true" />
                  </template>
                  {{ copy.menu.rename }}
                </TxContextMenuItem>
                <TxContextMenuItem v-if="menuSingle" class="files-menu" @select="menuAction('copy')">
                  <template #avatar>
                    <span class="files-menu__icon i-carbon-copy" aria-hidden="true" />
                  </template>
                  {{ copy.menu.copyPath }}
                </TxContextMenuItem>
                <TxContextMenuItem v-if="!menuInPlugin" class="files-menu" @select="menuAction('move')">
                  <template #avatar>
                    <span class="files-menu__icon i-carbon-folder-move-to" aria-hidden="true" />
                  </template>
                  {{ copy.menu.moveTo }}
                </TxContextMenuItem>
                <TxContextMenuItem class="files-menu" @select="menuAction('download')">
                  <template #avatar>
                    <span class="files-menu__icon i-carbon-download" aria-hidden="true" />
                  </template>
                  {{ menuNodes.length > 1 ? copy.menu.count(copy.menu.download, menuNodes.length) : copy.menu.download }}
                </TxContextMenuItem>
                <TxContextMenuDivider />
                <TxContextMenuItem class="files-menu" danger shortcut="⌫" @select="menuAction('remove')">
                  <template #avatar>
                    <span class="files-menu__icon i-carbon-trash-can" aria-hidden="true" />
                  </template>
                  {{ menuNodes.length > 1 ? copy.menu.count(copy.menu.remove, menuNodes.length) : copy.menu.remove }}
                </TxContextMenuItem>
              </template>
              <template v-else>
                <TxContextMenuItem class="files-menu" :disabled="currentInPlugin" @select="menuNewFolder">
                  <template #avatar>
                    <span class="files-menu__icon i-carbon-folder-add" aria-hidden="true" />
                  </template>
                  {{ copy.menu.newFolder }}
                  <template v-if="currentInPlugin" #description>
                    {{ copy.menu.flatOnly }}
                  </template>
                </TxContextMenuItem>
                <TxContextMenuItem class="files-menu" @select="pickFiles">
                  <template #avatar>
                    <span class="files-menu__icon i-carbon-upload" aria-hidden="true" />
                  </template>
                  {{ copy.menu.upload }}
                </TxContextMenuItem>
                <TxContextMenuDivider />
                <TxContextMenuSubmenu>
                  <span class="files-menu__label"><span class="files-menu__icon i-carbon-sort-descending" aria-hidden="true" />{{ copy.menu.sort }}</span>
                  <template #menu>
                    <TxContextMenuItem v-for="key in (['name', 'modified', 'size', 'kind'] as SortKey[])" :key="key" class="files-menu" @select="setSort(key)">
                      {{ copy.sort[key] }}
                      <template v-if="sort.key === key" #right>
                        <span :class="sort.order === 'asc' ? 'i-carbon-sort-ascending' : 'i-carbon-sort-descending'" class="files-check" aria-hidden="true" />
                      </template>
                    </TxContextMenuItem>
                  </template>
                </TxContextMenuSubmenu>
                <TxContextMenuSubmenu>
                  <span class="files-menu__label"><span class="files-menu__icon i-carbon-grid" aria-hidden="true" />{{ copy.menu.view }}</span>
                  <template #menu>
                    <TxContextMenuItem v-for="option in (['grid', 'list'] as ViewMode[])" :key="option" class="files-menu" @select="view = option">
                      {{ copy.view[option] }}
                      <template v-if="view === option" #right>
                        <span class="i-carbon-checkmark files-check" aria-hidden="true" />
                      </template>
                    </TxContextMenuItem>
                  </template>
                </TxContextMenuSubmenu>
              </template>
            </template>
          </TxContextMenu>
        </div>

        <span class="files-sr-only" role="status" aria-live="polite">{{ announcement }}</span>

        <TxModal v-model="previewOpen" :title="previewItem?.name ?? ''" width="min(760px, calc(100vw - 48px))">
          <div v-if="previewItem" ref="previewRef" class="files-quicklook" tabindex="-1" @keydown="onPreviewKeydown">
            <ReusePreview :item="previewItem" :compact="false" />
            <div class="files-quicklook__nav">
              <TxIconButton icon="i-carbon-chevron-left" size="sm" :label="copy.preview.prev" :disabled="previewList.length < 2" @click="stepPreview(-1)" />
              <span class="files-quicklook__position">{{ copy.preview.position(previewIndex + 1, previewList.length) }}</span>
              <TxIconButton icon="i-carbon-chevron-right" size="sm" :label="copy.preview.next" :disabled="previewList.length < 2" @click="stepPreview(1)" />
              <span class="files-quicklook__keys"><TxKbd>←</TxKbd><TxKbd>→</TxKbd><TxKbd>{{ copy.keys.space }}</TxKbd></span>
            </div>
          </div>
        </TxModal>

        <TxModal v-model="moveOpen" :title="copy.move.title(moveIds.length)" width="min(420px, calc(100vw - 48px))">
          <div class="files-move">
            <p class="files-move__hint">
              {{ copy.move.hint }}
            </p>
            <div class="files-move__tree">
              <TxTree
                :nodes="moveTree"
                :model-value="moveTarget ?? undefined"
                :default-expanded-keys="[ROOT_WS, 'ws-shots']"
                @update:model-value="onMoveSelect"
              >
                <template #item="{ node, expanded, hasChildren, selected: isSelected, toggleExpand }">
                  <span class="files-tree-row" :class="{ 'is-selected': isSelected, 'is-disabled': node.disabled }">
                    <button
                      v-if="hasChildren"
                      type="button"
                      class="files-tree-row__caret"
                      :class="{ 'is-open': expanded }"
                      tabindex="-1"
                      aria-hidden="true"
                      @click.stop="toggleExpand()"
                    >
                      <span class="i-carbon-chevron-right" />
                    </button>
                    <span v-else class="files-tree-row__caret" aria-hidden="true" />
                    <span class="files-tree-row__icon" :class="expanded ? 'i-carbon-folder-open' : 'i-carbon-folder'" aria-hidden="true" />
                    <span class="files-tree-row__label">{{ node.label }}</span>
                  </span>
                </template>
              </TxTree>
            </div>
          </div>
          <template #footer>
            <TxButton variant="ghost" size="sm" @click="moveOpen = false">
              {{ copy.move.cancel }}
            </TxButton>
            <TxButton variant="primary" size="sm" icon="i-carbon-folder-move-to" :disabled="!moveTarget" @click="confirmMove">
              {{ copy.move.confirm }}
            </TxButton>
          </template>
        </TxModal>
      </div>
    </template>
  </TemplateFrame>
</template>

<style scoped>
.files {
  position: relative;
  display: grid;
  height: 100%;
  box-sizing: border-box;
  grid-template-rows: auto minmax(0, 1fr);
  padding: 12px 14px 14px;
  background: var(--tx-bg-color, #fff);
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
}

/* Toolbar ---------------------------------------------------------------- */

.files__bar {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.files__path {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 4px;
  overflow: hidden;
}

.files__path :deep(.tx-breadcrumb) {
  min-width: 0;
  overflow: hidden;
}

.files__path :deep(.tx-breadcrumb__link) {
  font-size: 13px;
  white-space: nowrap;
}

.files__tools {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

.files__search {
  width: 200px;
}

.files__search :deep(.tx-input) {
  width: 100%;
}

.files__upload {
  position: relative;
}

.files__tray {
  position: absolute;
  z-index: 12;
  top: calc(100% + 2px);
  right: 0;
  width: 320px;
  pointer-events: none;
}

.files__tray.is-open {
  pointer-events: auto;
}

/* The tether drops from the Upload button, at the tray's right edge. */
.files__tray :deep(.tx-toast-panel) {
  align-items: flex-end;
}

.files__tray :deep(.tx-toast-panel__tether) {
  margin-right: 34px;
}

.files-tray {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.files-tray__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 0 6px 2px;
}

.files-tray__icon {
  flex: none;
  color: var(--tx-bui-accent-ink, #0170dd);
  font-size: 15px;
}

.files-tray__title {
  min-width: 0;
  flex: 1;
  font-size: 13px;
  font-weight: 600;
}

.files-tray__close {
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

.files-tray__close:hover {
  background: var(--tx-fill-color-light, #f5f7fa);
}

.files-tray__close:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

.files-tray__row {
  --tx-card-item-padding: 6px 4px;
  --tx-card-item-gap: 10px;
}

.files-tray__name {
  font-weight: 500;
}

.files-tray__done {
  color: var(--tx-bui-green, #189a4d);
}

.files-tray__error {
  display: block;
  color: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 55%, var(--tx-text-color-primary, #303133));
}

.files-link {
  margin-top: 4px;
  padding: 2px 0;
  border: 0;
  background: transparent;
  color: var(--tx-bui-accent-ink, #0170dd);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
}

.files-link:hover {
  text-decoration: underline;
}

.files-link:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

/* Body ------------------------------------------------------------------- */

.files__body {
  display: grid;
  min-height: 0;
  gap: 12px;
  grid-template-columns: 208px minmax(0, 1fr);
  margin-top: 10px;
}

.files-side {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
  padding: 8px 6px 10px;
  border-radius: 12px;
  background: var(--tx-fill-color-lighter, #fafafa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
}

.files-side__tree {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
}

.files-side__tree :deep(.tx-tree__list) {
  gap: 1px;
}

.files-tree-row {
  display: flex;
  min-width: 0;
  height: 28px;
  box-sizing: border-box;
  align-items: center;
  gap: 4px;
  padding: 0 8px 0 2px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
}

.files-tree-row:hover {
  background: var(--tx-bui-hover, #f4f5f6);
}

.files-tree-row.is-selected {
  background: color-mix(in srgb, var(--tx-bui-accent, #0285ff) 12%, transparent);
  color: var(--tx-bui-accent-ink, #0170dd);
}

.files-tree-row.is-drop {
  background: color-mix(in srgb, var(--tx-bui-accent, #0285ff) 14%, transparent);
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--tx-bui-accent, #0285ff) 60%, transparent);
}

.files-tree-row.is-disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.files-tree-row__caret {
  display: inline-flex;
  width: 18px;
  height: 18px;
  flex: none;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--tx-text-color-secondary, #909399);
  cursor: pointer;
  font-size: 12px;
}

.files-tree-row__caret.is-open span {
  transform: rotate(90deg);
}

.files-tree-row__icon {
  flex: none;
  color: var(--tx-bui-accent, #0285ff);
  font-size: 15px;
}

.files-tree-row__label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.files-tree-row__count {
  flex: none;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* The quota rows' hover tips rise above them; nothing up here clips. */
.files-quota {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 6px;
  padding: 10px 6px 0;
  border-top: 1px solid var(--tx-border-color-lighter, #ebeef5);
}

.files-quota__title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
}

.files-quota__hint {
  color: var(--tx-text-color-secondary, #909399);
  font-weight: 400;
}

.files-quota__row {
  display: grid;
  align-items: center;
  gap: 4px 8px;
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 5px 6px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.files-quota__row:hover {
  background: var(--tx-bui-hover, #f4f5f6);
}

.files-quota__row.is-current {
  background: color-mix(in srgb, var(--tx-bui-accent, #0285ff) 9%, transparent);
}

.files-quota__row:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

.files-quota__row :deep(.tx-progress-bar) {
  grid-column: 1 / -1;
}

.files-quota__name {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.files-quota__used {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.files-quota__row.is-near .files-quota__used {
  color: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 45%, var(--tx-text-color-primary, #303133));
}

.files-quota__workspace {
  padding: 2px 6px 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

/* Main ------------------------------------------------------------------- */

.files-main {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 8px;
}

.files-main__head {
  display: flex;
  min-width: 0;
  min-height: 30px;
  align-items: center;
  gap: 10px;
}

.files-main__count {
  flex: none;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.files-main__quota {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.files-main__quota-text {
  overflow: hidden;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.files-main__quota-rules {
  color: var(--tx-text-color-secondary, #909399);
}

.files-main__head > :deep(.tx-popover__reference) {
  margin-left: auto;
}

.files-main__sort {
  font-size: 12px;
}

.files-main__body {
  position: relative;
  min-height: 0;
  flex: 1;
}

.files-main__body :deep(.tx-splitter) {
  border: 0;
  border-radius: 0;
  background: transparent;
}

.files-main__body :deep(.tx-splitter__bar)::before {
  inset: 0 4px;
  border-radius: 0;
  background: var(--tx-border-color-lighter, #ebeef5);
  opacity: 1;
}

.files-main__body :deep(.tx-splitter__grip) {
  width: 5px;
  height: 30px;
  border: 0;
  border-radius: 999px;
  background: var(--tx-border-color, #dcdfe6);
  box-shadow: none;
  -webkit-backdrop-filter: none;
  backdrop-filter: none;
}

.files-main__body :deep(.tx-splitter__pane) {
  position: relative;
  overflow: hidden;
}

.files-area {
  position: relative;
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
}

.files-scroll {
  position: relative;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  border-radius: 12px;
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
}

.files-grid {
  display: grid;
  min-height: 100%;
  box-sizing: border-box;
  align-content: start;
  gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(112px, 1fr));
  padding: 10px;
  outline: none;
}

.file-tile {
  position: relative;
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  padding: 6px 6px 8px;
  border-radius: 12px;
  cursor: default;
  outline: none;
  user-select: none;
}

.file-tile:hover {
  background: var(--tx-bui-hover, #f4f5f6);
}

.file-tile.is-selected {
  background: color-mix(in srgb, var(--tx-bui-accent, #0285ff) 10%, transparent);
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--tx-bui-accent, #0285ff) 55%, transparent);
}

.file-tile.is-drop {
  background: color-mix(in srgb, var(--tx-bui-accent, #0285ff) 14%, transparent);
  box-shadow: inset 0 0 0 1.5px var(--tx-bui-accent, #0285ff);
}

.file-tile:focus-visible {
  box-shadow: inset 0 0 0 2px var(--tx-color-primary, #409eff);
}

/* 12px tile minus the 6px inset: the thumbnail's corners stay concentric. */
.file-tile__thumb {
  position: relative;
  display: flex;
  height: 72px;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
}

.file-tile__thumb :deep(.tx-corner-overlay) {
  display: flex;
  max-width: 100%;
  max-height: 100%;
}

.file-tile__image {
  display: block;
  max-width: 100%;
  max-height: 72px;
  border-radius: 6px;
  box-shadow: 0 0 0 1px var(--tx-border-color-lighter, #ebeef5), var(--tx-elevation-1, 1px 2px 4px rgba(0, 0, 0, 0.04));
  object-fit: contain;
}

.file-tile__check {
  position: absolute;
  top: 2px;
  left: 2px;
  display: inline-flex;
  padding: 2px;
  border-radius: 6px;
  background: var(--tx-bg-color, #fff);
  opacity: 0;
  transition: opacity 0.12s ease;
}

.file-tile:hover .file-tile__check,
.file-tile.is-selected .file-tile__check,
.files-grid:focus-within .file-tile:focus .file-tile__check {
  opacity: 1;
}

.file-tile__new {
  position: absolute;
  top: 2px;
  right: 2px;
  display: inline-flex;
}

.file-tile__name {
  display: -webkit-box;
  overflow: hidden;
  font-size: 13px;
  line-height: 1.35;
  text-align: center;
  /* Breaks come from the <wbr> after each separator; `anywhere` is only the
     fallback for a single segment longer than the tile. */
  word-break: normal;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.file-tile__meta {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.files-rename {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.files-rename :deep(.tx-input) {
  width: 100%;
  height: 26px;
}

.files-rename__error {
  color: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 55%, var(--tx-text-color-primary, #303133));
  font-size: 12px;
  line-height: 1.3;
}

/* List view: the table is its own scroll container (sticky header). */
.files-table {
  display: flex;
  height: 100%;
  flex-direction: column;
  --tx-data-table-row-hover-bg: var(--tx-bui-hover, #f4f5f6);
  --tx-data-table-row-selected-bg: color-mix(in srgb, var(--tx-bui-accent, #0285ff) 8%, var(--tx-bg-color, #fff));
}

.files-table :deep(.tx-data-table) {
  min-height: 0;
  flex: 0 1 auto;
  border-radius: 12px;
}

.files-cell {
  display: inline-flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.files-cell__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.files-number {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.files-muted {
  color: var(--tx-text-color-secondary, #909399);
  white-space: nowrap;
}

.files-empty {
  display: flex;
  height: 100%;
  min-height: 240px;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.files-empty-icon {
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-size: 28px;
}

/* The uploader as a drop layer: an opaque backstop under its translucent
   well, and none of its own button or list. */
.files-drop {
  position: absolute;
  z-index: 6;
  display: flex;
  padding: 8px;
  border-radius: 12px;
  background: var(--tx-bg-color, #fff);
  inset: 0;
}

.files-drop :deep(.tx-file-uploader) {
  flex: 1;
}

.files-drop :deep(.tx-file-uploader__drop) {
  height: 100%;
  box-sizing: border-box;
  justify-content: center;
  border-width: 1.5px;
}

.files-drop :deep(.tx-file-uploader__button),
.files-drop :deep(.tx-file-uploader__list) {
  display: none;
}

.files-bulk {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-top: 8px;
  padding: 6px 8px 6px 12px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--tx-bui-accent, #0285ff) 7%, var(--tx-bg-color, #fff));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-bui-accent, #0285ff) 22%, transparent);
}

.files-bulk__count {
  margin-right: 4px;
  color: var(--tx-bui-accent-ink, #0170dd);
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.files-bulk__clear {
  margin-left: auto;
}

/* Preview (pane and quick look) ----------------------------------------- */

.files-pane {
  display: flex;
  height: 100%;
  box-sizing: border-box;
  flex-direction: column;
  gap: 10px;
  padding: 4px 4px 4px 12px;
  overflow-y: auto;
}

.files-pane :deep(.tx-empty-state) {
  margin: auto;
}

.files-pane__title {
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.files-pane__summary,
.files-pane__hint {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.files-pane__hint {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.files-preview {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 10px;
  font-size: 13px;
}

.files-preview__stage {
  display: flex;
  min-height: 160px;
  max-height: min(56vh, 460px);
  align-items: center;
  justify-content: center;
  overflow: auto;
  border-radius: 10px;
  background: var(--tx-fill-color-lighter, #fafafa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
}

.files-preview.is-compact .files-preview__stage {
  max-height: 320px;
}

.files-preview__image {
  display: block;
  max-width: 100%;
  max-height: min(56vh, 460px);
  object-fit: contain;
}

.files-preview.is-compact .files-preview__image {
  max-height: 320px;
}

.files-preview__doc {
  width: 100%;
  align-self: stretch;
  padding: 12px 16px;
}

/* A preview is dense UI, not a docs page: body copy at 13px. */
.files-preview__doc :deep(.markdown-body) {
  font-size: 13px;
  line-height: 1.65;
}

.files-preview__doc :deep(.markdown-body h1) {
  margin: 4px 0 8px;
  padding: 0;
  border: 0;
  font-size: 15px;
}

.files-preview__text {
  width: 100%;
  box-sizing: border-box;
  align-self: stretch;
  margin: 0;
  padding: 12px 14px;
  font-family: var(--tx-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.files-preview__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.files-preview__label {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-weight: 500;
}

.files-preview__siblings {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.files-preview__siblings :deep(.tx-image-gallery__grid) {
  grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
  gap: 6px;
}

.files-preview__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.files-quicklook {
  display: flex;
  flex-direction: column;
  gap: 10px;
  outline: none;
}

.files-quicklook__nav {
  display: flex;
  align-items: center;
  gap: 8px;
}

.files-quicklook__position {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.files-quicklook__keys {
  display: inline-flex;
  gap: 4px;
  margin-left: auto;
}

.files-move {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.files-move__hint {
  margin: 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  line-height: 1.5;
}

.files-move__tree {
  max-height: 300px;
  padding: 6px;
  overflow-y: auto;
  border-radius: 10px;
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
}

/* Menu and toast --------------------------------------------------------- */

.files__menu {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
}

/* Teleported with the menu, but the class carries this file's scope: menu
   rows hover on the neutral ramp, which stays visible on the dark panel. */
.files-menu {
  --tx-card-item-hover-bg: var(--tx-bui-hover, #f4f5f6);
}

.files-menu__icon {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 15px;
}

.files-menu__label {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.files-menu-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.files-check {
  color: var(--tx-color-primary, #409eff);
}

.files__toast {
  position: absolute;
  z-index: 8;
  right: 10px;
  bottom: 10px;
  width: min(360px, calc(100% - 20px));
  pointer-events: none;
}

.files__toast.is-open {
  pointer-events: auto;
}

.files-toast {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.files-toast__icon {
  flex: none;
  color: var(--tx-bui-green, #189a4d);
  font-size: 15px;
}

.files-toast__text {
  min-width: 0;
  flex: 1;
  line-height: 1.45;
}

.files-toast__action,
.files-toast__close {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font: inherit;
}

.files-toast__action {
  padding: 3px 8px;
  color: var(--tx-bui-accent-ink, #0170dd);
  font-size: 12px;
  font-weight: 500;
}

.files-toast__action:hover {
  background: var(--tx-bui-accent-tint, #e9f3ff);
}

.files-toast__close {
  width: 22px;
  height: 22px;
  color: var(--tx-text-color-secondary, #909399);
}

.files-toast__close:hover {
  background: var(--tx-fill-color-light, #f5f7fa);
}

.files-toast__action:focus-visible,
.files-toast__close:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

.files-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .file-tile__check {
    transition: none;
  }
}

/* Layout ------------------------------------------------------------------ */

/* After the base rules: a container query adds no specificity. */
@container template (max-width: 639px) {
  .files {
    padding: 10px;
  }

  .files__bar {
    gap: 8px;
  }

  .files__tools {
    min-width: 0;
    flex: 1;
    justify-content: flex-end;
    gap: 6px;
  }

  .files__search {
    width: auto;
    min-width: 0;
    max-width: 180px;
    flex: 1;
  }

  .files__path {
    flex: 0 1 auto;
  }

  .files__upload-label {
    display: none;
  }

  .files__upload :deep(.tx-button) {
    min-width: 32px;
  }

  .files__tray {
    width: min(300px, calc(100cqw - 20px));
  }

  .files__body {
    grid-template-columns: minmax(0, 1fr);
  }

  .files-grid {
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  }

  .files-main__sort {
    display: none;
  }

  .files-main__quota-rules {
    display: none;
  }
}

@container template (min-width: 960px) {
  .files {
    padding: 16px 18px 16px;
  }

  .files__body {
    gap: 14px;
    grid-template-columns: 240px minmax(0, 1fr);
  }

  .files__search {
    width: 240px;
  }

  .files-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  }

  .file-tile__thumb {
    height: 84px;
  }

  .file-tile__image {
    max-height: 84px;
  }
}
</style>
