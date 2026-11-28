<script setup lang="ts">
import './TemplateWorkbenchDemo.css'
// Workbench template: a VS Code–style workbench for building a Tuff plugin,
// touch-translate. The explorer opens files into editor tabs, the bottom panel
// runs a simulated `pnpm dev` (tuff dev) in a read-only TxTerminal, and at
// ≥ 960 a CoreBox preview lists the features the dev server has loaded.
//
// Only a save reaches the "dev server": ⌘/Ctrl+S (which also formats JSON), or
// one second after typing stops. It reads the saved manifest and hot-reloads; a
// manifest that does not parse keeps the last good version loaded, so the
// preview goes stale while Problems and the status bar point at the broken line.
//
// Playback runs once from @enter: `pnpm dev` boots, a keyword is typed into
// manifest.json and saved, and the preview starts answering to it. Any reader
// input inside the stage cancels the rest; an edit already under way finishes at
// once, so the manifest is never left half-typed. Reduced motion applies the
// whole script synchronously, with no timers.
//
// Every terminal line is simulated and every duration is sample data.
import type { CodeEditorToolbarAction, CodeEditorToolbarActionKey } from '@talex-touch/tuffex/code-editor'
import type { IconChipTone } from '@talex-touch/tuffex/icon-chip'
import type { StatusTone } from '@talex-touch/tuffex/status-badge'
import type { TerminalInstance } from '@talex-touch/tuffex/terminal'
import type { TreeKey, TreeNode } from '@talex-touch/tuffex/tree'
import type { ComponentPublicInstance } from 'vue'
import { hasDocument, hasNavigator, hasWindow } from '@talex-touch/utils/env'
import { computed, defineComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

const FILE_PATHS = ['manifest.json', 'index.js', 'package.json', 'src/main.js', 'locales/en.json', 'locales/zh.json'] as const
const PANEL_TABS = ['terminal', 'problems'] as const

type Layout = 'narrow' | 'column' | 'wide'
type FilePath = typeof FILE_PATHS[number]
type FileLang = 'json' | 'javascript'
type PanelTab = typeof PANEL_TABS[number]
type DevState = 'stopped' | 'booting' | 'running'
type SaveSource = 'manual' | 'auto' | 'script'
type TimerGroup = 'play' | 'dev' | 'reload' | 'save' | 'toast'
type Parsed = { ok: true, value: unknown } | { ok: false, line: number, column: number, found: string }

interface WorkFile {
  path: FilePath
  name: string
  lang: FileLang
  /** What the dev server reads. */
  saved: string
  /** The editor buffer; differs from `saved` while the tab is dirty. */
  value: string
}

interface FeatureView {
  id: string
  name: string
  desc: string
  keywords: string[]
}

interface LoadedManifest {
  features: FeatureView[]
  commands: number
}

interface Problem {
  key: string
  severity: 'error' | 'warning'
  line: number
  column: number
  text: string
}

interface Hit {
  feature: FeatureView
  keyword: string | null
}

/** The slice of CodeMirror's EditorView the template drives, read from TxCodeEditor's getView(). */
interface EditorViewLike {
  state: { doc: { length: number, lines: number, line: (n: number) => { from: number, to: number }, toString: () => string } }
  scrollDOM: HTMLElement
  dispatch: (spec: { changes?: { from: number, to?: number, insert: string }, selection?: { anchor: number } }) => void
  lineBlockAt: (pos: number) => { top: number, height: number }
  requestMeasure: <T>(request: { read: (view: EditorViewLike) => T, write?: (measure: T, view: EditorViewLike) => void }) => void
}

interface EditorHandle {
  focus: () => void
  openSearch: () => boolean
  getView: () => unknown
}

interface PlayStep {
  at: number
  phase: 'boot' | 'edit'
  /** Decoration only: skipped under reduced motion and when the reader cancels. */
  decor?: boolean
  run: () => void
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

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))
const uid = useId().replace(/[^\w-]/g, '')

// ── Project ──────────────────────────────────────────────────────────────────

const PROJECT = 'touch-translate'
const VERSION = '0.4.2'
const BRANCH = 'feat/dict-keyword'
const PORT = 3733
const MOD = hasNavigator() && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'

/** The watcher's debounce plus a rebuild, before a save shows up in Tuff. */
const RELOAD_MS = 360
/** Typing pause after which dirty buffers save themselves. */
const AUTOSAVE_MS = 1000
/** Sample durations the dev server reports, cycled per reload. */
const RELOAD_SAMPLES = [86, 74, 92, 81]
const PRELUDE_SAMPLES = [41, 38, 45]
const HMR_SAMPLES = [12, 9, 14]

const TREE: TreeNode[] = [
  {
    key: 'locales',
    label: 'locales',
    children: [
      { key: 'locales/en.json', label: 'en.json' },
      { key: 'locales/zh.json', label: 'zh.json' },
    ],
  },
  { key: 'src', label: 'src', children: [{ key: 'src/main.js', label: 'main.js' }] },
  { key: 'index.js', label: 'index.js' },
  { key: 'manifest.json', label: 'manifest.json' },
  { key: 'package.json', label: 'package.json' },
]

/** CoreBox glyphs for the sample features; one the reader adds gets the generic glyph. */
const FEATURE_LOOK: Record<string, { icon: string, tone: IconChipTone }> = {
  'translate-selection': { icon: 'i-carbon-translate', tone: 'accent' },
  'translate-screenshot': { icon: 'i-carbon-scan-alt', tone: 'orange' },
}
const FALLBACK_LOOK: { icon: string, tone: IconChipTone } = { icon: 'i-carbon-application', tone: 'green' }

function isFilePath(key: TreeKey): key is FilePath {
  return (FILE_PATHS as readonly TreeKey[]).includes(key)
}

function nameOf(path: FilePath): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function fileIcon(path: FilePath): string {
  if (path.startsWith('locales/'))
    return 'i-carbon-language'
  return path.endsWith('.json') ? 'i-carbon-json' : 'i-carbon-script'
}

function fileTone(path: FilePath): 'manifest' | 'json' | 'js' | 'locale' {
  if (path === 'manifest.json')
    return 'manifest'
  if (path.startsWith('locales/'))
    return 'locale'
  return path.endsWith('.json') ? 'json' : 'js'
}

function lookOf(id: string): { icon: string, tone: IconChipTone } {
  return FEATURE_LOOK[id] ?? FALLBACK_LOOK
}

// ── Seed files ───────────────────────────────────────────────────────────────

function lines(...rows: string[]): string {
  return `${rows.join('\n')}\n`
}

function manifestOf(isZh: boolean): Record<string, unknown> {
  return {
    id: 'com.example.translate',
    name: PROJECT,
    version: VERSION,
    sdkapi: 261011,
    features: [
      {
        id: 'translate-selection',
        name: isZh ? '划词翻译' : 'Translate selection',
        commands: [{ type: 'over', value: isZh ? ['fy', 'fanyi', 'translate'] : ['tr', 'translate'] }],
        desc: isZh ? '翻译选中的文字或剪贴板内容' : 'Translate the selection or the clipboard',
        acceptedInputTypes: ['text'],
        interaction: { type: 'webcontent', path: '/translate' },
      },
      {
        id: 'translate-screenshot',
        name: isZh ? '截图翻译' : 'Screenshot translate',
        commands: [{ type: 'over', value: isZh ? ['jt', 'ocr'] : ['ocr', 'snap'] }],
        desc: isZh ? '框选屏幕区域，识别文字后翻译' : 'Select part of the screen, read it, translate it',
        acceptedInputTypes: ['image'],
        interaction: { type: 'webcontent', path: '/screenshot' },
      },
    ],
    permissions: { required: ['intelligence.basic'], optional: ['clipboard.write'] },
    dev: { enable: true, address: `http://localhost:${PORT}/`, source: true },
  }
}

function preludeSource(isZh: boolean): string {
  return lines(
    isZh ? '// Prelude：插件加载时运行，只做轻量的注册' : '// Prelude: runs when the plugin loads, so keep it light',
    'const { plugin, TuffItemBuilder } = globalThis',
    '',
    'function previewItem(featureId, text) {',
    '  return new TuffItemBuilder(featureId + \'-preview\')',
    isZh ? '    .setTitle(text || \'划词翻译\')' : '    .setTitle(text || \'Translate selection\')',
    isZh ? '    .setSubtitle(\'↵ 打开翻译面板\')' : '    .setSubtitle(\'↵ Open the translation panel\')',
    '    .build()',
    '}',
    '',
    'module.exports = {',
    '  async onFeatureTriggered(featureId, query) {',
    '    const text = typeof query === \'string\' ? query : query.text',
    '    await plugin.feature.clearItems()',
    '    await plugin.feature.pushItems([previewItem(featureId, text)])',
    '    return true',
    '  },',
    '}',
  )
}

function surfaceSource(isZh: boolean): string {
  return lines(
    isZh ? '// Surface：功能被触发后才加载的界面，改动走 Vite 热更新' : '// Surface: the UI a feature opens; edits hot-update through Vite',
    'import { createApp, h } from \'vue\'',
    isZh ? 'import messages from \'../locales/zh.json\'' : 'import messages from \'../locales/en.json\'',
    '',
    'createApp({',
    '  render: () => h(\'main\', { class: \'surface\' }, messages.title),',
    '}).mount(\'#app\')',
  )
}

function seedSources(isZh: boolean): Record<FilePath, string> {
  return {
    'manifest.json': `${formatJson(manifestOf(isZh))}\n`,
    'index.js': preludeSource(isZh),
    'package.json': `${formatJson({
      name: PROJECT,
      version: VERSION,
      private: true,
      type: 'module',
      scripts: { dev: 'tuff dev', build: 'tuff build' },
      dependencies: { vue: '^3.5.39' },
      devDependencies: { '@talex-touch/tuff-cli': '^0.1.1', 'vite': '^7.3.6' },
    })}\n`,
    'src/main.js': surfaceSource(isZh),
    'locales/en.json': `${formatJson({ title: 'Translate selection', empty: 'Select text, then press ⌥Space', copy: 'Copy translation' })}\n`,
    'locales/zh.json': `${formatJson({ title: '划词翻译', empty: '选中文字后按 ⌥Space', copy: '复制译文' })}\n`,
  }
}

function seedFiles(isZh: boolean): Record<FilePath, WorkFile> {
  const sources = seedSources(isZh)
  const out = {} as Record<FilePath, WorkFile>
  for (const path of FILE_PATHS)
    out[path] = { path, name: nameOf(path), lang: path.endsWith('.json') ? 'json' : 'javascript', saved: sources[path], value: sources[path] }
  return out
}

// ── JSON ─────────────────────────────────────────────────────────────────────

/** Prettier-like JSON: one key per line, short arrays of scalars kept on one line. */
function formatJson(value: unknown, indent = ''): string {
  const inner = `${indent}  `
  if (Array.isArray(value)) {
    if (!value.length)
      return '[]'
    if (value.every(item => item === null || typeof item !== 'object')) {
      const flat = `[${value.map(item => JSON.stringify(item)).join(', ')}]`
      if (indent.length + flat.length <= 64)
        return flat
    }
    return `[\n${value.map(item => inner + formatJson(item, inner)).join(',\n')}\n${indent}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
    if (!entries.length)
      return '{}'
    return `{\n${entries.map(([key, item]) => `${inner}${JSON.stringify(key)}: ${formatJson(item, inner)}`).join(',\n')}\n${indent}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/**
 * Offset of the first JSON syntax error, or -1. Engines word JSON.parse errors
 * differently and Safari reports no position at all, so the line and column
 * the template shows come from this scan instead.
 */
function jsonErrorAt(text: string): number {
  let at = 0

  function fail(): never {
    throw new SyntaxError('json')
  }

  function space(): void {
    while (at < text.length && ' \t\n\r'.includes(text[at]!))
      at++
  }

  function string(): void {
    at++
    while (at < text.length) {
      const char = text[at]!
      if (char === '"') {
        at++
        return
      }
      if (char < ' ')
        fail()
      at += char === '\\' ? 2 : 1
    }
    fail()
  }

  function value(): void {
    space()
    const char = text[at]
    if (char === '{' || char === '[') {
      const close = char === '{' ? '}' : ']'
      at++
      space()
      if (text[at] === close) {
        at++
        return
      }
      for (;;) {
        if (close === '}') {
          space()
          if (text[at] !== '"')
            fail()
          string()
          space()
          if (text[at] !== ':')
            fail()
          at++
        }
        value()
        space()
        if (text[at] === ',') {
          at++
          continue
        }
        if (text[at] === close) {
          at++
          return
        }
        fail()
      }
    }
    if (char === '"') {
      string()
      return
    }
    const literal = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(text.slice(at))
    if (!literal)
      fail()
    at += literal[0].length
  }

  try {
    value()
    space()
    if (at < text.length)
      fail()
    return -1
  }
  catch {
    return Math.min(at, text.length)
  }
}

function position(text: string, index: number): { line: number, column: number } {
  const before = text.slice(0, index)
  return { line: before.split('\n').length, column: index - before.lastIndexOf('\n') }
}

function parseJson(text: string): Parsed {
  let at = jsonErrorAt(text)
  if (at < 0) {
    try {
      return { ok: true, value: JSON.parse(text) }
    }
    catch {
      at = text.length
    }
  }
  return { ok: false, ...position(text, at), found: text[at] ?? '' }
}

function textOf(value: unknown): string {
  if (typeof value === 'string')
    return value
  const fallback = (value as { default?: unknown } | null)?.default
  return typeof fallback === 'string' ? fallback : ''
}

/** Features and their trigger words, the way CoreBox reads them from a manifest. */
function featuresOf(manifest: unknown): FeatureView[] {
  const list = (manifest as { features?: unknown } | null)?.features
  if (!Array.isArray(list))
    return []
  return list.flatMap((raw: unknown, index) => {
    if (!raw || typeof raw !== 'object')
      return []
    const feature = raw as { id?: unknown, name?: unknown, desc?: unknown, commands?: unknown }
    const commands: unknown[] = Array.isArray(feature.commands) ? feature.commands : []
    const keywords = commands.flatMap((command) => {
      const value = (command as { value?: unknown } | null)?.value
      const values: unknown[] = Array.isArray(value) ? value : [value]
      return values.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map(item => item.trim())
    })
    const id = typeof feature.id === 'string' && feature.id ? feature.id : `feature-${index + 1}`
    return [{ id, name: textOf(feature.name) || id, desc: textOf(feature.desc), keywords }]
  })
}

function locate(text: string, needle: string, last = false): { line: number, column: number } {
  const index = last ? text.lastIndexOf(needle) : text.indexOf(needle)
  return index < 0 ? { line: 1, column: 1 } : position(text, index)
}

// ── Copy ─────────────────────────────────────────────────────────────────────

const ZH = {
  frameTitle: 'Workbench 插件工作台',
  keyword: '词典',
  explorer: { title: '资源管理器', toggle: '资源管理器', label: '项目文件' },
  titlebar: { panel: '终端面板', preview: 'CoreBox 预览' },
  dev: { stopped: 'dev 未启动', booting: '启动中', reloading: '热重载中', running: `dev · :${PORT}`, broken: 'manifest 有误' },
  editor: { label: '编辑器' },
  tabs: {
    label: '已打开的文件',
    unsaved: '（未保存）',
    emptyTitle: '没有打开的文件',
    emptyDesc: '从资源管理器里选一个文件',
  },
  tools: { format: '格式化', search: '搜索', copy: '复制' },
  panel: {
    label: '面板',
    terminal: '终端',
    problems: '问题',
    start: '启动 dev',
    restart: '重启 dev',
    clear: '清空终端',
    collapse: '收起面板',
    expand: '展开面板',
    none: 'manifest.json 没有发现问题',
    error: '错误：',
    warning: '警告：',
    terminalLabel: 'tuff dev 输出（模拟）',
  },
  hint: {
    stopped: '运行 pnpm dev 后，保存即热重载',
    booting: '正在启动 tuff dev…',
    ready: (features: number, commands: number) => `已加载 · ${features} 个功能 · ${commands} 个触发词`,
    reloaded: (ms: number) => `已热重载 · ${ms}ms（示例）`,
    prelude: (ms: number) => `Prelude 已重启 · ${ms}ms（示例）`,
    hmr: (name: string, ms: number) => `${name} 已热更新 · ${ms}ms（示例）`,
    restart: 'package.json 已改 · 重启 dev 后生效',
    failed: (line: number) => `manifest.json 解析失败 · 第 ${line} 行`,
    offline: (name: string) => `${name} 已保存 · dev 未运行`,
  },
  status: {
    problems: (errors: number, warnings: number) => `问题：${errors} 个错误，${warnings} 个警告`,
    spaces: '空格: 2',
    save: '保存',
    terminal: '终端',
  },
  toast: {
    label: '工作台通知',
    dismiss: '关闭通知',
    saved: (name: string) => `已保存 ${name}`,
    formatted: (name: string) => `已格式化并保存 ${name}`,
    savedBroken: (name: string) => `已保存 ${name}，但 JSON 有语法错误`,
    tidy: (name: string) => `已格式化 ${name}`,
    alreadyTidy: (name: string) => `${name} 已经是格式化好的`,
    formatFailed: (line: number) => `第 ${line} 行有语法错误，无法格式化`,
    copied: (name: string) => `已复制 ${name} 的内容`,
    copyFailed: '浏览器没有允许写入剪贴板',
    live: (keyword: string, feature: string) => `CoreBox 里输入「${keyword}」现在能找到「${feature}」`,
  },
  note: '# 模拟输出 · 没有连接真实进程 · 耗时为示例数据',
  preview: {
    title: 'CoreBox 预览',
    badge: { offline: '未连接', syncing: '同步中', failed: '加载失败', stale: '旧版本', synced: '已同步' },
    placeholder: '输入关键词',
    results: '匹配的功能',
    offlineTitle: 'dev 未启动',
    offlineDesc: '启动后，这里按 manifest 实时列出插件功能',
    bootingTitle: '正在启动 dev…',
    bootingDesc: '加载 manifest.json 与 Prelude',
    brokenTitle: 'manifest 未能加载',
    brokenDesc: (line: number) => `修好第 ${line} 行并保存，预览就会出现`,
    noMatch: (query: string) => `没有功能响应「${query}」`,
    noMatchDesc: '把它加进某个功能的 commands，保存后再看',
    openManifest: '打开 manifest.json',
    stale: (line: number) => `第 ${line} 行有误 · 保留上次可用的版本`,
    foot: '按功能名称与 commands 匹配 · 保存后热重载',
  },
  problems: {
    syntax: (found: string) => `JSON 语法错误：意外的${found}`,
    end: '文件结尾',
    newline: '换行',
    quote: (char: string) => `“${char}”`,
    noKeywords: (feature: string) => `「${feature}」没有触发词，CoreBox 搜不到它`,
    duplicate: (keyword: string, feature: string) => `触发词“${keyword}”与「${feature}」重复`,
  },
  lang: { json: 'JSON', javascript: 'JavaScript' } as Record<FileLang, string>,
}

const EN: typeof ZH = {
  frameTitle: 'Workbench',
  keyword: 'dict',
  explorer: { title: 'Explorer', toggle: 'Explorer', label: 'Project files' },
  titlebar: { panel: 'Terminal panel', preview: 'CoreBox preview' },
  dev: { stopped: 'dev stopped', booting: 'Starting', reloading: 'Reloading', running: `dev · :${PORT}`, broken: 'manifest error' },
  editor: { label: 'Editor' },
  tabs: {
    label: 'Open files',
    unsaved: ' (unsaved)',
    emptyTitle: 'No open files',
    emptyDesc: 'Pick a file in the explorer',
  },
  tools: { format: 'Format', search: 'Search', copy: 'Copy' },
  panel: {
    label: 'Panel',
    terminal: 'Terminal',
    problems: 'Problems',
    start: 'Start dev',
    restart: 'Restart dev',
    clear: 'Clear terminal',
    collapse: 'Collapse panel',
    expand: 'Expand panel',
    none: 'No problems in manifest.json',
    error: 'Error: ',
    warning: 'Warning: ',
    terminalLabel: 'tuff dev output (simulated)',
  },
  hint: {
    stopped: 'Run pnpm dev and every save hot-reloads',
    booting: 'Starting tuff dev…',
    ready: (features: number, commands: number) => `Loaded · ${features} features · ${commands} triggers`,
    reloaded: (ms: number) => `Hot-reloaded · ${ms}ms (sample)`,
    prelude: (ms: number) => `Prelude restarted · ${ms}ms (sample)`,
    hmr: (name: string, ms: number) => `${name} hot-updated · ${ms}ms (sample)`,
    restart: 'package.json changed · restart dev to apply',
    failed: (line: number) => `manifest.json failed to parse · line ${line}`,
    offline: (name: string) => `Saved ${name} · dev is not running`,
  },
  status: {
    problems: (errors: number, warnings: number) => `Problems: ${errors} errors, ${warnings} warnings`,
    spaces: 'Spaces: 2',
    save: 'Save',
    terminal: 'Terminal',
  },
  toast: {
    label: 'Workbench notifications',
    dismiss: 'Dismiss',
    saved: (name: string) => `Saved ${name}`,
    formatted: (name: string) => `Formatted and saved ${name}`,
    savedBroken: (name: string) => `Saved ${name}, but its JSON has a syntax error`,
    tidy: (name: string) => `Formatted ${name}`,
    alreadyTidy: (name: string) => `${name} is already formatted`,
    formatFailed: (line: number) => `Syntax error on line ${line}; nothing to format`,
    copied: (name: string) => `Copied the contents of ${name}`,
    copyFailed: 'The browser did not allow writing to the clipboard',
    live: (keyword: string, feature: string) => `Typing “${keyword}” in CoreBox now finds ${feature}`,
  },
  note: '# Simulated output · no real process · timings are sample data',
  preview: {
    title: 'CoreBox preview',
    badge: { offline: 'Offline', syncing: 'Syncing', failed: 'Failed', stale: 'Stale', synced: 'Synced' },
    placeholder: 'Type a keyword',
    results: 'Matching features',
    offlineTitle: 'dev is not running',
    offlineDesc: 'Once it starts, the manifest\'s features show up here live',
    bootingTitle: 'Starting dev…',
    bootingDesc: 'Loading manifest.json and the Prelude',
    brokenTitle: 'The manifest did not load',
    brokenDesc: (line: number) => `Fix line ${line} and save to see the preview`,
    noMatch: (query: string) => `No feature answers to “${query}”`,
    noMatchDesc: 'Add it to a feature\'s commands, then save',
    openManifest: 'Open manifest.json',
    stale: (line: number) => `Error on line ${line} · kept last good`,
    foot: 'Matches feature names and commands · hot-reloads on save',
  },
  problems: {
    syntax: (found: string) => `JSON syntax error: unexpected ${found}`,
    end: 'end of file',
    newline: 'line break',
    quote: (char: string) => `"${char}"`,
    noKeywords: (feature: string) => `${feature} has no triggers, so CoreBox cannot find it`,
    duplicate: (keyword: string, feature: string) => `Trigger "${keyword}" duplicates one in ${feature}`,
  },
  lang: { json: 'JSON', javascript: 'JavaScript' },
}

const copy = computed(() => (zh.value ? ZH : EN))

// ── State ────────────────────────────────────────────────────────────────────

const files = reactive(seedFiles(zh.value))
const openTabs = ref<FilePath[]>(['manifest.json', 'index.js'])
const activePath = ref<FilePath | null>('manifest.json')
const openFolders = ref<TreeKey[]>([])
const explorerOpen = ref(true)
const drawerOpen = ref(false)
const panelOpen = ref(true)
const panelTab = ref<PanelTab>('terminal')
const previewOpen = ref(true)
const previewQuery = ref(copy.value.keyword)

const devState = ref<DevState>('stopped')
const reloading = ref(false)
/** What the dev server has loaded: the last manifest that parsed. */
const loaded = shallowRef<LoadedManifest | null>(null)
/** Set while the saved manifest does not parse. */
const brokenAt = ref<{ line: number, column: number, found: string } | null>(null)
const hint = reactive({ text: copy.value.hint.stopped, tone: 'muted' as StatusTone, pulse: 0 })

const rootRef = ref<HTMLElement | null>(null)
const explorerRef = ref<HTMLElement | null>(null)
const previewRef = ref<HTMLElement | null>(null)
const panelBodyRef = ref<HTMLElement | null>(null)
const tabStripRef = ref<HTMLElement | null>(null)
const terminalRef = shallowRef<TerminalInstance | null>(null)
const editors = new Map<FilePath, EditorHandle>()

let entered = false
let disposed = false
/** True while the template itself edits a buffer, so the edit is not taken for typing. */
let scripted = false
let reloadSeq = 0
const pendingReload = new Set<FilePath>()

// ── Layout ───────────────────────────────────────────────────────────────────

const stageWidth = ref(0)
const stageHeight = ref(0)

function onStageResize(width: number, height: number): void {
  stageWidth.value = width
  stageHeight.value = height
}

// Same breakpoints as the container queries; the first frame measures 0.
const layout = computed<Layout>(() => {
  const width = stageWidth.value
  if (!width)
    return 'column'
  if (width < 640)
    return 'narrow'
  return width < 960 ? 'column' : 'wide'
})

const explorerShown = computed(() => (layout.value === 'narrow' ? drawerOpen.value : explorerOpen.value))
const previewShown = computed(() => layout.value === 'wide' && previewOpen.value)

/** The terminal's height: a third of what the bars leave, so the editor keeps the most. */
const panelBodyHeight = computed(() => {
  const height = stageHeight.value || 600
  return Math.min(300, Math.max(120, Math.round((height - 40 - 26 - 34 - 32) * 0.36)))
})

// ── Derived ──────────────────────────────────────────────────────────────────

const activeFile = computed(() => (activePath.value ? files[activePath.value] : null))

function isDirty(path: FilePath): boolean {
  return files[path].value !== files[path].saved
}

function isDirtyKey(key: TreeKey): boolean {
  return isFilePath(key) && isDirty(key)
}

function treeIcon(key: TreeKey, open: boolean): string {
  if (isFilePath(key))
    return fileIcon(key)
  return open ? 'i-carbon-folder-open' : 'i-carbon-folder'
}

function foundText(found: string): string {
  const words = copy.value.problems
  if (!found)
    return words.end
  return found === '\n' || found === '\r' ? words.newline : words.quote(found)
}

/** Live from the manifest buffer, the way a language server reports before saving. */
const problems = computed<Problem[]>(() => {
  const source = files['manifest.json'].value
  const parsed = parseJson(source)
  const words = copy.value.problems
  if (!parsed.ok)
    return [{ key: 'syntax', severity: 'error', line: parsed.line, column: parsed.column, text: words.syntax(foundText(parsed.found)) }]
  const out: Problem[] = []
  const owners = new Map<string, string>()
  for (const feature of featuresOf(parsed.value)) {
    if (!feature.keywords.length)
      out.push({ key: `bare:${feature.id}`, severity: 'warning', ...locate(source, JSON.stringify(feature.id)), text: words.noKeywords(feature.name) })
    for (const keyword of feature.keywords) {
      const owner = owners.get(keyword)
      if (owner === undefined)
        owners.set(keyword, feature.name)
      else
        out.push({ key: `dup:${feature.id}:${keyword}`, severity: 'warning', ...locate(source, JSON.stringify(keyword), true), text: words.duplicate(keyword, owner) })
    }
  }
  return out
})

const errorCount = computed(() => problems.value.filter(problem => problem.severity === 'error').length)
const warningCount = computed(() => problems.value.length - errorCount.value)

const devBusy = computed(() => {
  if (devState.value === 'booting')
    return copy.value.dev.booting
  return reloading.value ? copy.value.dev.reloading : ''
})

const devBadge = computed<{ text: string, tone: StatusTone }>(() => {
  if (devState.value === 'stopped')
    return { text: copy.value.dev.stopped, tone: 'muted' }
  return brokenAt.value ? { text: copy.value.dev.broken, tone: 'danger' } : { text: copy.value.dev.running, tone: 'success' }
})

const previewBadge = computed<{ text: string, tone: StatusTone }>(() => {
  const words = copy.value.preview.badge
  if (devState.value === 'stopped')
    return { text: words.offline, tone: 'muted' }
  if (devState.value === 'booting' || reloading.value)
    return { text: words.syncing, tone: 'info' }
  if (!loaded.value)
    return { text: words.failed, tone: 'danger' }
  return brokenAt.value ? { text: words.stale, tone: 'warning' } : { text: words.synced, tone: 'success' }
})

/** CoreBox matching: a trigger that starts with the query wins, then one that contains it, then the name. */
const previewHits = computed<Hit[]>(() => {
  const features = loaded.value?.features ?? []
  const query = previewQuery.value.trim().toLowerCase()
  if (!query)
    return features.map(feature => ({ feature, keyword: null }))
  return features.flatMap<Hit>((feature) => {
    const keyword = feature.keywords.find(item => item.toLowerCase().startsWith(query))
      ?? feature.keywords.find(item => item.toLowerCase().includes(query))
    if (keyword)
      return [{ feature, keyword }]
    return feature.name.toLowerCase().includes(query) ? [{ feature, keyword: null }] : []
  })
})

const toolbarActions = computed<CodeEditorToolbarAction[]>(() => {
  const file = activeFile.value
  return [
    { key: 'format', label: copy.value.tools.format, icon: 'i-carbon-data-format', disabled: file?.lang !== 'json' },
    { key: 'search', label: copy.value.tools.search, icon: 'i-carbon-search', disabled: !file },
    { key: 'copy', label: copy.value.tools.copy, icon: 'i-carbon-copy', disabled: !file },
  ]
})

function slug(value: string): string {
  return value.replace(/[^\w-]/g, '-')
}

const tabId = (path: FilePath): string => `${uid}-tab-${slug(path)}`
const paneId = (path: FilePath): string => `${uid}-pane-${slug(path)}`
const panelTabId = (tab: PanelTab): string => `${uid}-ptab-${tab}`
const panelBodyId = (tab: PanelTab): string => `${uid}-pbody-${tab}`

// ── Timers ───────────────────────────────────────────────────────────────────

const timers: Record<TimerGroup, Set<ReturnType<typeof setTimeout>>> = {
  play: new Set(),
  dev: new Set(),
  reload: new Set(),
  save: new Set(),
  toast: new Set(),
}

function later(group: TimerGroup, ms: number, run: () => void): void {
  if (disposed)
    return
  const id = setTimeout(() => {
    timers[group].delete(id)
    run()
  }, ms)
  timers[group].add(id)
}

function clearGroup(group: TimerGroup): void {
  for (const id of timers[group])
    clearTimeout(id)
  timers[group].clear()
}

function clearAllTimers(): void {
  for (const group of Object.keys(timers) as TimerGroup[])
    clearGroup(group)
}

/** Only ever asked from the client: playback starts from `@enter`, a click or a reset. */
function prefersReducedMotion(): boolean {
  return hasWindow() && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Runs [gap, step] pairs one after another, or all at once under reduced motion. */
function runChain(group: TimerGroup, steps: Array<[number, () => void]>): void {
  if (prefersReducedMotion()) {
    for (const [, step] of steps)
      step()
    return
  }
  let at = 0
  for (const [gap, step] of steps) {
    at += gap
    later(group, at, step)
  }
}

// ── Toast ────────────────────────────────────────────────────────────────────

const toast = reactive({ open: false, text: '', icon: 'i-carbon-checkmark-outline', danger: false })
// The panel covers the corner of the terminal, so every toast closes by itself;
// only a pointer or keyboard focus resting on it holds it open.
let toastHovered = false
let toastFocused = false

function armToast(ms: number): void {
  clearGroup('toast')
  later('toast', ms, () => {
    toast.open = false
  })
}

function notify(text: string, icon: string, danger = false): void {
  if (disposed)
    return
  toast.text = text
  toast.icon = icon
  toast.danger = danger
  toast.open = true
  if (toastHovered || toastFocused)
    clearGroup('toast')
  else
    armToast(3600)
}

function holdToast(kind: 'hover' | 'focus'): void {
  if (kind === 'hover')
    toastHovered = true
  else
    toastFocused = true
  clearGroup('toast')
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

function closeToast(event?: MouseEvent): void {
  clearGroup('toast')
  toast.open = false
  toastHovered = false
  toastFocused = false
  // The dismiss button goes inert with the panel; keep focus in the stage.
  if (event)
    rootRef.value?.focus({ preventScroll: true })
}

// ── Focus ────────────────────────────────────────────────────────────────────

/** Before a region hides, moves focus out of it so Esc and the shortcuts keep working. */
function keepFocusOut(region: HTMLElement | null | undefined, target?: HTMLElement | null): void {
  if (!region || !hasDocument())
    return
  const active = document.activeElement
  if (active && region.contains(active))
    (target ?? rootRef.value)?.focus({ preventScroll: true })
}

function explorerToggle(): HTMLElement | null {
  return rootRef.value?.querySelector<HTMLElement>('[data-workbench-explorer-toggle]') ?? null
}

// ── Terminal ─────────────────────────────────────────────────────────────────

const ESC = '\u001B['

function paint(code: string, text: string): string {
  return `${ESC}${code}m${text}${ESC}0m`
}

function tag(): string {
  return paint('36', '[tuff]')
}

function prompt(): string {
  return `${paint('36', `~/${PROJECT}`)} ${paint('90', `(${BRANCH})`)} $ `
}

// Writes reject once the terminal is disposed; the output is decorative by then.
function termWrite(data: string): void {
  void terminalRef.value?.write(data).catch(() => {})
}

function termLine(data = ''): void {
  termWrite(`${data}\r\n`)
}

function writeIntro(): void {
  terminalRef.value?.reset()
  termLine(paint('90', copy.value.note))
  termWrite(prompt())
}

function clearTerminal(): void {
  terminalRef.value?.clear()
}

function termFound(found: string): string {
  if (!found)
    return 'end of input'
  return found === '\n' || found === '\r' ? 'line break' : `"${found}"`
}

// ── Dev server ───────────────────────────────────────────────────────────────

function setHint(text: string, tone: StatusTone): void {
  hint.text = text
  hint.tone = tone
  hint.pulse += 1
}

/** Reads the saved manifest, the way tuff dev does; a broken one keeps the last good version. */
function loadManifest(): boolean {
  const parsed = parseJson(files['manifest.json'].saved)
  if (!parsed.ok) {
    brokenAt.value = { line: parsed.line, column: parsed.column, found: parsed.found }
    return false
  }
  const features = featuresOf(parsed.value)
  loaded.value = { features, commands: features.reduce((sum, feature) => sum + feature.keywords.length, 0) }
  brokenAt.value = null
  return true
}

function brokenLine(): string {
  const broken = brokenAt.value
  return broken ? `manifest.json:${broken.line}:${broken.column} Unexpected ${termFound(broken.found)}` : ''
}

function bootSteps(restart: boolean): Array<[number, () => void]> {
  const steps: Array<[number, () => void]> = []
  if (restart) {
    steps.push([0, () => {
      termLine('^C')
      termLine(paint('90', 'dev server stopped'))
      termWrite(prompt())
    }])
  }
  for (const char of 'pnpm dev')
    steps.push([60, () => termWrite(char)])
  steps.push([240, () => {
    termLine()
    termLine(`> ${PROJECT}@${VERSION} dev`)
    termLine('> tuff dev')
    termLine()
  }])
  steps.push([420, () => {
    termLine(`  ${paint('32', 'VITE v7.3.6')}  ready in 412 ms`)
    termLine()
    termLine(`  ${paint('32', '➜')}  Local:   ${paint('36', `http://localhost:${PORT}/`)}`)
    termLine(paint('90', '  ➜  Network: use --host to expose'))
    termLine()
  }])
  steps.push([360, () => {
    // Saves before this point are part of the boot; later ones reload after it.
    pendingReload.clear()
    if (loadManifest())
      termLine(`${tag()} manifest.json ${paint('32', '✓')} ${loaded.value?.features.length} features · ${loaded.value?.commands} commands`)
    else
      termLine(`${tag()} ${paint('31', `✗ ${brokenLine()}`)}`)
  }])
  steps.push([240, () => termLine(`${tag()} prelude index.js ${paint('32', '✓')}`)])
  steps.push([280, finishBoot])
  return steps
}

function startDev(restart: boolean): void {
  clearGroup('dev')
  clearGroup('reload')
  reloading.value = false
  pendingReload.clear()
  devState.value = 'booting'
  loaded.value = null
  brokenAt.value = null
  setHint(copy.value.hint.booting, 'info')
  runChain('dev', bootSteps(restart))
}

function finishBoot(): void {
  devState.value = 'running'
  const manifest = loaded.value
  if (manifest && !brokenAt.value) {
    termLine(`${tag()} ${paint('32', '✓')} ${PROJECT} loaded into Tuff (dev)`)
    setHint(copy.value.hint.ready(manifest.features.length, manifest.commands), 'success')
  }
  else {
    termLine(`${tag()} ${paint('33', 'waiting for a valid manifest.json')}`)
    setHint(copy.value.hint.failed(brokenAt.value?.line ?? 1), 'danger')
  }
  if (pendingReload.size)
    scheduleReload()
}

function startFromPreview(): void {
  startDev(false)
  // The empty state holding the button is replaced; keep focus in the stage.
  rootRef.value?.focus({ preventScroll: true })
}

function queueReload(path: FilePath): void {
  if (devState.value === 'stopped') {
    setHint(copy.value.hint.offline(nameOf(path)), 'muted')
    return
  }
  pendingReload.add(path)
  if (devState.value === 'running')
    scheduleReload()
}

function scheduleReload(): void {
  if (reloading.value)
    return
  reloading.value = true
  if (prefersReducedMotion())
    flushReload()
  else
    later('reload', RELOAD_MS, flushReload)
}

function flushReload(): void {
  reloading.value = false
  // The manifest goes last, so its outcome is the one the status bar keeps.
  const paths = [...pendingReload].sort((a, b) => Number(a === 'manifest.json') - Number(b === 'manifest.json'))
  pendingReload.clear()
  for (const path of paths)
    reloadFile(path)
}

function reloadFile(path: FilePath): void {
  const seq = reloadSeq++
  if (path === 'manifest.json') {
    termLine(`${tag()} manifest.json changed`)
    if (loadManifest()) {
      const ms = RELOAD_SAMPLES[seq % RELOAD_SAMPLES.length]!
      const manifest = loaded.value!
      termLine(`${tag()} ${paint('32', '✓')} reloaded in ${ms}ms · ${manifest.features.length} features · ${manifest.commands} commands`)
      setHint(copy.value.hint.reloaded(ms), 'success')
    }
    else {
      termLine(`${tag()} ${paint('31', `✗ ${brokenLine()}`)}`)
      termLine(paint('90', '       keeping the last good version loaded'))
      setHint(copy.value.hint.failed(brokenAt.value?.line ?? 1), 'danger')
    }
    return
  }
  if (path === 'index.js') {
    const ms = PRELUDE_SAMPLES[seq % PRELUDE_SAMPLES.length]!
    termLine(`${tag()} prelude index.js changed → restarted in ${ms}ms`)
    setHint(copy.value.hint.prelude(ms), 'success')
    return
  }
  if (path === 'package.json') {
    termLine(`${tag()} ${paint('33', 'package.json changed — restart dev to apply')}`)
    setHint(copy.value.hint.restart, 'warning')
    return
  }
  const ms = HMR_SAMPLES[seq % HMR_SAMPLES.length]!
  termLine(`${paint('32', '[vite]')} hmr update ${paint('90', `/${path}`)}`)
  setHint(copy.value.hint.hmr(nameOf(path), ms), 'success')
}

// ── Editors ──────────────────────────────────────────────────────────────────

function setEditorRef(path: FilePath, el: Element | ComponentPublicInstance | null): void {
  if (el && 'getView' in el)
    editors.set(path, el as unknown as EditorHandle)
  else
    editors.delete(path)
}

/** The CodeMirror view behind a tab; null until TxCodeEditor's runtime has loaded. */
function viewOf(path: FilePath): EditorViewLike | null {
  const view = editors.get(path)?.getView()
  return view && typeof (view as Partial<EditorViewLike>).dispatch === 'function' ? view as EditorViewLike : null
}

function onEditorInput(path: FilePath, value: string): void {
  files[path].value = value
  if (scripted)
    return
  cancelPlay()
  clearGroup('save')
  later('save', AUTOSAVE_MS, autosave)
}

function autosave(): void {
  for (const path of FILE_PATHS) {
    if (isDirty(path))
      saveFile(path, 'auto')
  }
}

/** Replaces a buffer through the view, changing only the span that differs, so the caret keeps its place. */
function replaceBuffer(path: FilePath, next: string): void {
  const view = viewOf(path)
  if (view) {
    const current = view.state.doc.toString()
    let start = 0
    const max = Math.min(current.length, next.length)
    while (start < max && current[start] === next[start])
      start++
    let end = 0
    while (end < max - start && current[current.length - 1 - end] === next[next.length - 1 - end])
      end++
    scripted = true
    view.dispatch({ changes: { from: start, to: current.length - end, insert: next.slice(start, next.length - end) } })
    scripted = false
  }
  files[path].value = next
}

/** Moves the caret without scrolling anything but the editor's own scroller. */
function placeCaret(path: FilePath, pos: number, reveal: boolean): void {
  const view = viewOf(path)
  if (!view)
    return
  const at = Math.max(0, Math.min(pos, view.state.doc.length))
  view.dispatch({ selection: { anchor: at } })
  if (!reveal)
    return
  view.requestMeasure({
    read: v => ({ block: v.lineBlockAt(at), top: v.scrollDOM.scrollTop, height: v.scrollDOM.clientHeight }),
    write: ({ block, top, height }, v) => {
      if (block.top < top || block.top + block.height > top + height)
        v.scrollDOM.scrollTop = Math.max(0, block.top - height / 3)
    },
  })
}

function formatFile(path: FilePath | null): void {
  if (!path)
    return
  const file = files[path]
  if (file.lang !== 'json')
    return
  const parsed = parseJson(file.value)
  if (!parsed.ok) {
    notify(copy.value.toast.formatFailed(parsed.line), 'i-carbon-warning-alt', true)
    return
  }
  const next = `${formatJson(parsed.value)}\n`
  if (next === file.value) {
    notify(copy.value.toast.alreadyTidy(file.name), 'i-carbon-checkmark-outline')
    return
  }
  replaceBuffer(path, next)
  notify(copy.value.toast.tidy(file.name), 'i-carbon-data-format')
}

function saveFile(path: FilePath, source: SaveSource): void {
  const file = files[path]
  let formatted = false
  if (source !== 'auto' && file.lang === 'json') {
    const parsed = parseJson(file.value)
    const next = parsed.ok ? `${formatJson(parsed.value)}\n` : file.value
    if (next !== file.value) {
      replaceBuffer(path, next)
      formatted = true
    }
  }
  const changed = file.saved !== file.value
  file.saved = file.value
  if (source === 'manual') {
    const broken = file.lang === 'json' && !parseJson(file.value).ok
    if (broken)
      notify(copy.value.toast.savedBroken(file.name), 'i-carbon-warning-alt', true)
    else
      notify(formatted ? copy.value.toast.formatted(file.name) : copy.value.toast.saved(file.name), 'i-carbon-save')
  }
  // A manual save touches the file even when nothing changed, as editors do.
  if (changed || source === 'manual')
    queueReload(path)
}

function saveActive(): void {
  if (activePath.value)
    saveFile(activePath.value, 'manual')
}

async function copyFile(path: FilePath): Promise<void> {
  const name = files[path].name
  try {
    if (!hasNavigator() || !navigator.clipboard)
      throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(files[path].value)
    notify(copy.value.toast.copied(name), 'i-carbon-copy')
  }
  catch {
    notify(copy.value.toast.copyFailed, 'i-carbon-warning-alt', true)
  }
}

function onToolbarAction(key: CodeEditorToolbarActionKey): void {
  const path = activePath.value
  if (!path)
    return
  if (key === 'format')
    formatFile(path)
  else if (key === 'search')
    editors.get(path)?.openSearch()
  else if (key === 'copy')
    void copyFile(path)
}

// ── Tabs and explorer ────────────────────────────────────────────────────────

/** Scrolls the tab strip (only the strip) so a tab is in view. */
function revealTab(path: FilePath): void {
  void nextTick(() => {
    const strip = tabStripRef.value
    const tab = hasDocument() ? document.getElementById(tabId(path)) : null
    if (!strip || !tab)
      return
    if (tab.offsetLeft < strip.scrollLeft)
      strip.scrollLeft = tab.offsetLeft
    else if (tab.offsetLeft + tab.offsetWidth > strip.scrollLeft + strip.clientWidth)
      strip.scrollLeft = tab.offsetLeft + tab.offsetWidth - strip.clientWidth
  })
}

function openFile(path: FilePath): void {
  if (!openTabs.value.includes(path))
    openTabs.value = [...openTabs.value, path]
  activePath.value = path
  const folder = path.includes('/') ? path.slice(0, path.indexOf('/')) : null
  if (folder && !openFolders.value.includes(folder))
    openFolders.value = [...openFolders.value, folder]
  revealTab(path)
}

function focusTab(path: FilePath | null): void {
  void nextTick(() => {
    const target = (path ? document.getElementById(tabId(path)) : null) ?? rootRef.value
    target?.focus({ preventScroll: true })
  })
}

function closeTab(path: FilePath, fromKeyboard = false): void {
  const index = openTabs.value.indexOf(path)
  if (index < 0)
    return
  const active = document.activeElement
  const owned = [document.getElementById(tabId(path)), document.getElementById(paneId(path))]
  const hadFocus = !!active && owned.some(element => element?.contains(active))
  // A closed tab keeps its unsaved buffer; autosave still writes it.
  const remaining = openTabs.value.filter(item => item !== path)
  openTabs.value = remaining
  if (activePath.value === path)
    activePath.value = remaining[Math.min(index, remaining.length - 1)] ?? null
  if (hadFocus || fromKeyboard)
    focusTab(activePath.value)
}

function selectTab(path: FilePath): void {
  activePath.value = path
  revealTab(path)
}

function onTabAuxclick(event: MouseEvent, path: FilePath): void {
  if (event.button !== 1)
    return
  event.preventDefault()
  closeTab(path)
}

function onTabKeydown(event: KeyboardEvent, path: FilePath): void {
  if (event.key === 'Delete') {
    event.preventDefault()
    closeTab(path, true)
    return
  }
  const tabs = openTabs.value
  const index = tabs.indexOf(path)
  let next: FilePath | undefined
  if (event.key === 'ArrowRight')
    next = tabs[(index + 1) % tabs.length]
  else if (event.key === 'ArrowLeft')
    next = tabs[(index - 1 + tabs.length) % tabs.length]
  else if (event.key === 'Home')
    next = tabs[0]
  else if (event.key === 'End')
    next = tabs.at(-1)
  if (!next)
    return
  event.preventDefault()
  selectTab(next)
  focusTab(next)
}

function onTreeSelect({ key }: { key: TreeKey }): void {
  if (!isFilePath(key)) {
    openFolders.value = openFolders.value.includes(key) ? openFolders.value.filter(item => item !== key) : [...openFolders.value, key]
    return
  }
  openFile(key)
  if (layout.value === 'narrow')
    closeDrawer()
}

function onExpandedKeys(keys: TreeKey[]): void {
  openFolders.value = keys
}

function openDrawer(): void {
  drawerOpen.value = true
  void nextTick(() => explorerRef.value?.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]')?.focus({ preventScroll: true }))
}

function closeDrawer(): void {
  keepFocusOut(explorerRef.value, explorerToggle())
  drawerOpen.value = false
}

function toggleExplorer(): void {
  if (layout.value === 'narrow') {
    if (drawerOpen.value)
      closeDrawer()
    else
      openDrawer()
    return
  }
  if (explorerOpen.value)
    keepFocusOut(explorerRef.value, explorerToggle())
  explorerOpen.value = !explorerOpen.value
}

function togglePanel(): void {
  if (panelOpen.value)
    keepFocusOut(panelBodyRef.value)
  panelOpen.value = !panelOpen.value
}

function togglePreview(): void {
  if (previewOpen.value)
    keepFocusOut(previewRef.value)
  previewOpen.value = !previewOpen.value
}

function showPanelTab(tab: PanelTab): void {
  panelTab.value = tab
  panelOpen.value = true
}

function onPanelTabKeydown(event: KeyboardEvent): void {
  let next: PanelTab
  if (event.key === 'Home')
    next = 'terminal'
  else if (event.key === 'End')
    next = 'problems'
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    next = panelTab.value === 'terminal' ? 'problems' : 'terminal'
  else
    return
  event.preventDefault()
  showPanelTab(next)
  void nextTick(() => document.getElementById(panelTabId(next))?.focus({ preventScroll: true }))
}

function revealProblem(problem: Problem): void {
  openFile('manifest.json')
  void nextTick(() => {
    const view = viewOf('manifest.json')
    if (!view)
      return
    const line = view.state.doc.line(Math.min(Math.max(problem.line, 1), view.state.doc.lines))
    placeCaret('manifest.json', Math.min(line.from + problem.column - 1, line.to), true)
    editors.get('manifest.json')?.focus()
  })
}

/** Where a new trigger goes: just inside the first feature's `value` list. */
function keywordSlot(text: string): number {
  const start = text.indexOf('"value": [')
  return start < 0 ? -1 : text.indexOf(']', start)
}

function openKeywordSlot(): void {
  openFile('manifest.json')
  void nextTick(() => {
    const slot = keywordSlot(files['manifest.json'].value)
    if (slot >= 0)
      placeCaret('manifest.json', slot, true)
    editors.get('manifest.json')?.focus()
  })
}

// ── Preview ──────────────────────────────────────────────────────────────────

function triggerFeature(hit: Hit): void {
  const query = previewQuery.value.trim()
  panelOpen.value = true
  panelTab.value = 'terminal'
  termLine(`${tag()} onFeatureTriggered(${JSON.stringify(hit.feature.id)}, ${JSON.stringify(query)})`)
  termLine(`${paint('90', '[prelude]')} pushItems · 1 item`)
}

function triggerFirst(): void {
  const first = previewHits.value[0]
  if (first)
    triggerFeature(first)
}

// ── Keyboard and pointer ─────────────────────────────────────────────────────

function consume(event: Event): void {
  event.preventDefault()
  event.stopPropagation()
}

// Capture phase: xterm and CodeMirror would otherwise see the keys first, and
// xterm swallows Ctrl+S / Ctrl+J outright on Windows and Linux.
function onKeydownCapture(event: KeyboardEvent): void {
  cancelPlay()
  if (!(event.metaKey || event.ctrlKey) || event.altKey)
    return
  const key = event.key.toLowerCase()
  if (key === 's' && !event.shiftKey) {
    consume(event)
    saveActive()
  }
  else if (key === 'j' && !event.shiftKey) {
    consume(event)
    togglePanel()
  }
  else if (key === 'f' && event.shiftKey && event.target instanceof Element && event.target.closest('.workbench__pane')) {
    // TxCodeEditor binds Mod-Shift-F to JSON.stringify, which puts every array item on a line of its own.
    consume(event)
    formatFile(activePath.value)
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented)
    return
  if (layout.value === 'narrow' && drawerOpen.value) {
    // Consumed, so the expanded overlay stays open.
    event.preventDefault()
    closeDrawer()
  }
}

function onPointerdownCapture(event: PointerEvent): void {
  cancelPlay()
  if (layout.value !== 'narrow' || !drawerOpen.value)
    return
  const target = event.target as Node
  if (!explorerRef.value?.contains(target) && !explorerToggle()?.contains(target))
    drawerOpen.value = false
}

watch(layout, (next, previous) => {
  if (next === 'narrow' || previous === 'narrow') {
    keepFocusOut(explorerRef.value, explorerToggle())
    drawerOpen.value = false
  }
  if (next !== 'wide')
    keepFocusOut(previewRef.value)
})

// ── Playback ─────────────────────────────────────────────────────────────────

let playSteps: PlayStep[] = []
let playNext = 0
let typeAt = -1

function keystrokes(): string[] {
  // The Chinese keyword lands as one IME commit, the way it is typed.
  return zh.value ? [',', ' ', '"', ZH.keyword, '"'] : [',', ' ', '"', ...EN.keyword, '"']
}

function beginEdit(): void {
  openFile('manifest.json')
  typeAt = keywordSlot(files['manifest.json'].value)
  // Scrolls the editor's own scroller if the line is out of view, never the page.
  if (typeAt >= 0)
    placeCaret('manifest.json', typeAt, true)
}

function typeKeystroke(piece: string): void {
  if (typeAt < 0)
    return
  const at = typeAt
  typeAt += piece.length
  const view = viewOf('manifest.json')
  if (view) {
    scripted = true
    view.dispatch({ changes: { from: at, insert: piece }, selection: { anchor: at + piece.length } })
    scripted = false
    return
  }
  const text = files['manifest.json'].value
  files['manifest.json'].value = text.slice(0, at) + piece + text.slice(at)
}

function announceLive(): void {
  const hit = previewHits.value.find(item => item.keyword === copy.value.keyword)
  if (hit)
    notify(copy.value.toast.live(copy.value.keyword, hit.feature.name), 'i-carbon-flash')
}

function playScript(): PlayStep[] {
  const steps: PlayStep[] = [{ at: 0, phase: 'boot', run: () => startDev(false) }]
  let at = bootSteps(false).reduce((sum, [gap]) => sum + gap, 0) + 900
  steps.push({ at, phase: 'edit', run: beginEdit })
  for (const piece of keystrokes()) {
    at += piece.length > 1 ? 320 : 150
    steps.push({ at, phase: 'edit', run: () => typeKeystroke(piece) })
  }
  at += 650
  steps.push({ at, phase: 'edit', run: () => saveFile('manifest.json', 'script') })
  at += RELOAD_MS + 450
  steps.push({ at, phase: 'edit', decor: true, run: announceLive })
  return steps
}

function runPlayStep(index: number): void {
  const step = playSteps[index]
  if (!step)
    return
  playNext = index + 1
  step.run()
  if (playNext >= playSteps.length)
    playSteps = []
}

function play(): void {
  clearGroup('play')
  playSteps = playScript()
  playNext = 0
  if (prefersReducedMotion()) {
    for (const step of playSteps) {
      if (!step.decor)
        step.run()
    }
    playSteps = []
    return
  }
  playSteps.forEach((step, index) => later('play', step.at, () => runPlayStep(index)))
}

/**
 * Reader input stops the script. The dev server keeps booting on its own
 * timers; an edit under way completes at once (typing and the save), so the
 * manifest is never left half-typed. Decorative steps are dropped.
 */
function cancelPlay(): void {
  if (!playSteps.length)
    return
  clearGroup('play')
  const phase = playSteps[playNext - 1]?.phase
  const rest = playSteps.slice(playNext)
  playSteps = []
  for (const step of rest) {
    if (step.phase === phase && !step.decor)
      step.run()
  }
}

function onEnter(): void {
  entered = true
  play()
}

function resetDemo(): void {
  clearAllTimers()
  playSteps = []
  playNext = 0
  typeAt = -1
  scripted = false
  Object.assign(files, seedFiles(zh.value))
  openTabs.value = ['manifest.json', 'index.js']
  activePath.value = 'manifest.json'
  openFolders.value = []
  explorerOpen.value = true
  drawerOpen.value = false
  panelOpen.value = true
  panelTab.value = 'terminal'
  previewOpen.value = true
  previewQuery.value = copy.value.keyword
  devState.value = 'stopped'
  reloading.value = false
  pendingReload.clear()
  loaded.value = null
  brokenAt.value = null
  reloadSeq = 0
  setHint(copy.value.hint.stopped, 'muted')
  closeToast()
  writeIntro()
  if (entered)
    play()
}

onMounted(writeIntro)
watch(locale, resetDemo)
onBeforeUnmount(() => {
  disposed = true
  clearAllTimers()
})

defineExpose({ resetDemo })
</script>

<template>
  <TemplateFrame :title="copy.frameTitle" :height="600" @enter="onEnter">
    <template #default="{ width: stageW, height: stageH }">
      <StageSize :width="stageW" :height="stageH" @resize="onStageResize" />

      <!-- The root takes focus on clicks inside the stage (tabindex -1), so the
           shortcuts below keep working wherever the reader clicked. -->
      <div
        ref="rootRef"
        class="workbench"
        :class="`is-${layout}`"
        :style="{ '--workbench-panel-h': `${panelBodyHeight}px` }"
        tabindex="-1"
        @keydown.capture="onKeydownCapture"
        @keydown="onKeydown"
        @pointerdown.capture="onPointerdownCapture"
      >
        <header class="workbench__titlebar">
          <TxIconButton
            data-workbench-explorer-toggle
            size="xs"
            :icon="explorerShown ? 'i-carbon-open-panel-filled-left' : 'i-carbon-open-panel-left'"
            :label="copy.explorer.toggle"
            :pressed="explorerShown"
            @click="toggleExplorer"
          />
          <TxIconChip class="workbench__mark" :size="22" tone="accent" :font-size="13">
            <span class="i-carbon-translate" />
          </TxIconChip>
          <span class="workbench__project">{{ PROJECT }}</span>
          <TxTag class="workbench__branch" size="sm" variant="soft" icon="i-carbon-branch" :label="BRANCH" />
          <span class="workbench__spacer" />
          <span class="workbench__dev">
            <TxWorkingIndicator v-if="devBusy" variant="dots" :label="devBusy" :show-elapsed="false" />
            <TxStatusBadge v-else size="sm" :status="devBadge.tone" :text="devBadge.text" />
          </span>
          <TxIconButton
            size="xs"
            :icon="panelOpen ? 'i-carbon-open-panel-filled-bottom' : 'i-carbon-open-panel-bottom'"
            :label="copy.titlebar.panel"
            :pressed="panelOpen"
            @click="togglePanel"
          />
          <TxIconButton
            v-if="layout === 'wide'"
            size="xs"
            :icon="previewOpen ? 'i-carbon-open-panel-filled-right' : 'i-carbon-open-panel-right'"
            :label="copy.titlebar.preview"
            :pressed="previewOpen"
            @click="togglePreview"
          />
        </header>

        <div class="workbench__main">
          <aside v-show="explorerShown" ref="explorerRef" class="workbench__explorer" :aria-label="copy.explorer.label">
            <div class="workbench__explorer-head">
              {{ copy.explorer.title }}
            </div>
            <div class="workbench__explorer-body">
              <TxTree
                :nodes="TREE"
                :model-value="activePath ?? ''"
                :expanded-keys="openFolders"
                :indent="12"
                @select="onTreeSelect"
                @update:expanded-keys="onExpandedKeys"
              >
                <template #item="{ node, hasChildren, expanded: isOpen }">
                  <span class="workbench-tree__row" :class="[isFilePath(node.key) ? `is-${fileTone(node.key)}` : 'is-folder', { 'is-active': node.key === activePath }]">
                    <span class="workbench-tree__caret" :class="hasChildren ? (isOpen ? 'i-carbon-chevron-down' : 'i-carbon-chevron-right') : ''" aria-hidden="true" />
                    <span class="workbench-tree__icon" :class="treeIcon(node.key, isOpen)" aria-hidden="true" />
                    <span class="workbench-tree__label">{{ node.label }}</span>
                    <span v-if="isDirtyKey(node.key)" class="workbench-dot" />
                    <span v-if="isDirtyKey(node.key)" class="workbench-sr">{{ copy.tabs.unsaved }}</span>
                  </span>
                </template>
              </TxTree>
            </div>
          </aside>

          <section class="workbench__editor" :aria-label="copy.editor.label">
            <div class="workbench__tabbar">
              <div ref="tabStripRef" class="workbench__tabs" role="tablist" :aria-label="copy.tabs.label">
                <div
                  v-for="path in openTabs"
                  :id="tabId(path)"
                  :key="path"
                  class="workbench-tab"
                  :class="[`is-${fileTone(path)}`, { 'is-active': path === activePath, 'is-dirty': isDirty(path) }]"
                  role="tab"
                  :aria-selected="path === activePath"
                  :aria-controls="paneId(path)"
                  :tabindex="path === activePath ? 0 : -1"
                  aria-keyshortcuts="Delete"
                  @click="selectTab(path)"
                  @auxclick="onTabAuxclick($event, path)"
                  @keydown="onTabKeydown($event, path)"
                >
                  <span class="workbench-tab__icon" :class="fileIcon(path)" aria-hidden="true" />
                  <span class="workbench-tab__name">{{ files[path].name }}</span>
                  <span v-if="isDirty(path)" class="workbench-sr">{{ copy.tabs.unsaved }}</span>
                  <!-- Pointer only: keyboard users close a tab with Delete, and a
                       button nested in a tab would be a second stop per tab. -->
                  <span class="workbench-tab__close" aria-hidden="true" @click.stop="closeTab(path)">
                    <span class="workbench-dot" />
                    <span class="workbench-tab__x i-carbon-close" />
                  </span>
                </div>
              </div>
              <TxCodeEditorToolbar class="workbench__tools" :actions="toolbarActions" @action="onToolbarAction" />
            </div>

            <div class="workbench__editors">
              <div
                v-for="path in openTabs"
                v-show="path === activePath"
                :id="paneId(path)"
                :key="path"
                class="workbench__pane"
                role="tabpanel"
                :aria-labelledby="tabId(path)"
              >
                <TxCodeEditor
                  :ref="(el) => setEditorRef(path, el)"
                  :model-value="files[path].value"
                  :language="files[path].lang"
                  :line-wrapping="layout === 'narrow'"
                  @update:model-value="(value: string) => onEditorInput(path, value)"
                />
              </div>
              <div v-if="!activePath" class="workbench__pane is-empty">
                <TxEmptyState variant="custom" size="small" :title="copy.tabs.emptyTitle" :description="copy.tabs.emptyDesc">
                  <template #icon>
                    <span class="workbench-empty-icon i-carbon-document-blank" aria-hidden="true" />
                  </template>
                </TxEmptyState>
              </div>
            </div>

            <section class="workbench__panel" :aria-label="copy.panel.label">
              <div class="workbench__panel-head">
                <div class="workbench__panel-tabs" role="tablist" :aria-label="copy.panel.label">
                  <button
                    v-for="tab in PANEL_TABS"
                    :id="panelTabId(tab)"
                    :key="tab"
                    type="button"
                    role="tab"
                    class="workbench-ptab"
                    :class="{ 'is-active': panelTab === tab }"
                    :aria-selected="panelTab === tab"
                    :aria-controls="panelBodyId(tab)"
                    :tabindex="panelTab === tab ? 0 : -1"
                    @click="showPanelTab(tab)"
                    @keydown="onPanelTabKeydown"
                  >
                    {{ tab === 'terminal' ? copy.panel.terminal : copy.panel.problems }}
                    <span v-if="tab === 'problems' && problems.length" class="workbench-ptab__count" :class="{ 'is-error': errorCount > 0 }">{{ problems.length }}</span>
                  </button>
                </div>
                <span class="workbench__spacer" />
                <TxIconButton
                  size="xs"
                  :icon="devState === 'stopped' ? 'i-carbon-play-filled-alt' : 'i-carbon-restart'"
                  :label="devState === 'stopped' ? copy.panel.start : copy.panel.restart"
                  @click="startDev(devState !== 'stopped')"
                />
                <TxIconButton size="xs" icon="i-carbon-clean" :label="copy.panel.clear" @click="clearTerminal" />
                <TxIconButton
                  size="xs"
                  :icon="panelOpen ? 'i-carbon-chevron-down' : 'i-carbon-chevron-up'"
                  :label="panelOpen ? copy.panel.collapse : copy.panel.expand"
                  @click="togglePanel"
                />
              </div>
              <div v-show="panelOpen" ref="panelBodyRef" class="workbench__panel-body">
                <div
                  v-show="panelTab === 'terminal'"
                  :id="panelBodyId('terminal')"
                  class="workbench__terminal"
                  role="tabpanel"
                  :aria-labelledby="panelTabId('terminal')"
                >
                  <TxTerminal ref="terminalRef" read-only :font-size="12" :labels="{ ariaLabel: copy.panel.terminalLabel }" />
                </div>
                <div
                  v-show="panelTab === 'problems'"
                  :id="panelBodyId('problems')"
                  class="workbench__problems"
                  role="tabpanel"
                  :aria-labelledby="panelTabId('problems')"
                >
                  <ul v-if="problems.length" class="workbench-problems">
                    <li v-for="problem in problems" :key="problem.key">
                      <button type="button" class="workbench-problem" :class="`is-${problem.severity}`" @click="revealProblem(problem)">
                        <span class="workbench-problem__icon" :class="problem.severity === 'error' ? 'i-carbon-error-filled' : 'i-carbon-warning-alt-filled'" aria-hidden="true" />
                        <span class="workbench-sr">{{ problem.severity === 'error' ? copy.panel.error : copy.panel.warning }}</span>
                        <span class="workbench-problem__text">{{ problem.text }}</span>
                        <span class="workbench-problem__where">manifest.json:{{ problem.line }}:{{ problem.column }}</span>
                      </button>
                    </li>
                  </ul>
                  <p v-else class="workbench-problems__none">
                    <span class="i-carbon-checkmark-outline" aria-hidden="true" />
                    {{ copy.panel.none }}
                  </p>
                </div>
              </div>
            </section>
          </section>

          <aside v-if="previewShown" ref="previewRef" class="workbench__preview" :aria-label="copy.preview.title">
            <div class="workbench-preview__head">
              <span class="workbench-preview__title">{{ copy.preview.title }}</span>
              <TxStatusBadge size="sm" :status="previewBadge.tone" :text="previewBadge.text" />
            </div>
            <div class="workbench-preview__box">
              <TxSearchInput
                v-model="previewQuery"
                class="workbench-preview__search"
                :placeholder="copy.preview.placeholder"
                :disabled="!loaded"
                @search="triggerFirst"
              />
              <TxStatusHint
                v-if="loaded && brokenAt"
                class="workbench-preview__stale"
                size="sm"
                tone="warning"
                :live="false"
                :text="copy.preview.stale(brokenAt.line)"
              />
              <div class="workbench-preview__results">
                <TxEmptyState
                  v-if="!loaded && devState === 'stopped'"
                  variant="custom"
                  size="small"
                  :title="copy.preview.offlineTitle"
                  :description="copy.preview.offlineDesc"
                  :primary-action="{ label: copy.panel.start, variant: 'primary', size: 'sm', icon: 'i-carbon-play-filled-alt' }"
                  @primary="startFromPreview"
                >
                  <template #icon>
                    <span class="workbench-empty-icon i-carbon-plug" aria-hidden="true" />
                  </template>
                </TxEmptyState>
                <TxEmptyState
                  v-else-if="!loaded && devState === 'booting'"
                  variant="custom"
                  size="small"
                  :title="copy.preview.bootingTitle"
                  :description="copy.preview.bootingDesc"
                >
                  <template #icon>
                    <span class="workbench-empty-icon i-carbon-renew" aria-hidden="true" />
                  </template>
                </TxEmptyState>
                <TxEmptyState
                  v-else-if="!loaded"
                  variant="custom"
                  size="small"
                  :title="copy.preview.brokenTitle"
                  :description="copy.preview.brokenDesc(brokenAt?.line ?? 1)"
                >
                  <template #icon>
                    <span class="workbench-empty-icon is-danger i-carbon-warning-alt" aria-hidden="true" />
                  </template>
                </TxEmptyState>
                <TxSearchEmpty
                  v-else-if="!previewHits.length"
                  size="small"
                  :title="copy.preview.noMatch(previewQuery.trim())"
                  :description="copy.preview.noMatchDesc"
                  :primary-action="{ label: copy.preview.openManifest, variant: 'secondary', size: 'sm', icon: 'i-carbon-json' }"
                  @primary="openKeywordSlot"
                >
                  <template #icon>
                    <span class="workbench-empty-icon i-carbon-search" aria-hidden="true" />
                  </template>
                </TxSearchEmpty>
                <ul v-else class="workbench-preview__list" :aria-label="copy.preview.results">
                  <li v-for="(hit, index) in previewHits" :key="hit.feature.id">
                    <button type="button" class="workbench-hit" :class="{ 'is-first': index === 0 }" @click="triggerFeature(hit)">
                      <TxIconChip :size="30" :tone="lookOf(hit.feature.id).tone" variant="soft" :font-size="16">
                        <span :class="lookOf(hit.feature.id).icon" />
                      </TxIconChip>
                      <span class="workbench-hit__text">
                        <span class="workbench-hit__name">{{ hit.feature.name }}</span>
                        <span class="workbench-hit__desc">{{ hit.feature.desc || PROJECT }}</span>
                      </span>
                      <TxTag v-if="hit.keyword" class="workbench-hit__tag" size="sm" variant="soft" :label="hit.keyword" />
                      <TxKbd v-if="index === 0" size="sm">
                        ↵
                      </TxKbd>
                    </button>
                  </li>
                </ul>
              </div>
              <p class="workbench-preview__foot">
                {{ copy.preview.foot }}
              </p>
            </div>
          </aside>
        </div>

        <footer class="workbench__statusbar">
          <TxStatusHint class="workbench__hint" size="sm" :text="hint.text" :tone="hint.tone" :pulse-key="hint.pulse" />
          <span class="workbench__spacer" />
          <button type="button" class="workbench__status-item" :aria-label="copy.status.problems(errorCount, warningCount)" @click="showPanelTab('problems')">
            <span class="workbench__status-icon is-error i-carbon-error-filled" aria-hidden="true" />
            <span aria-hidden="true">{{ errorCount }}</span>
            <span class="workbench__status-icon is-warning i-carbon-warning-alt" aria-hidden="true" />
            <span aria-hidden="true">{{ warningCount }}</span>
          </button>
          <span v-if="activeFile" class="workbench__status-item is-meta">{{ copy.status.spaces }}</span>
          <span v-if="activeFile" class="workbench__status-item is-meta">UTF-8</span>
          <span v-if="activeFile" class="workbench__status-item">{{ copy.lang[activeFile.lang] }}</span>
          <span class="workbench__status-item is-keys">
            <TxKbd size="sm">{{ MOD }}S</TxKbd>{{ copy.status.save }}
            <TxKbd size="sm">{{ MOD }}J</TxKbd>{{ copy.status.terminal }}
          </span>
        </footer>

        <!-- The panel keeps its box while closed (TxToastPanel fades rather
             than unmounts), so it is inert until it opens. Pointer or focus
             on it holds it open; otherwise it closes by itself. -->
        <div
          class="workbench__toast"
          :class="{ 'is-open': toast.open }"
          :inert="toast.open ? undefined : true"
          @mouseenter="holdToast('hover')"
          @mouseleave="releaseToast('hover')"
          @focusin="holdToast('focus')"
          @focusout="onToastFocusOut"
        >
          <TxToastPanel :open="toast.open" :tether="false" :stack="0" :aria-label="copy.toast.label">
            <div class="workbench-toast" :class="{ 'is-danger': toast.danger }">
              <span class="workbench-toast__icon" :class="toast.icon" aria-hidden="true" />
              <span class="workbench-toast__text">{{ toast.text }}</span>
              <button type="button" class="workbench-toast__close" :aria-label="copy.toast.dismiss" @click="closeToast($event)">
                <span class="i-carbon-close" aria-hidden="true" />
              </button>
            </div>
          </TxToastPanel>
        </div>
      </div>
    </template>
  </TemplateFrame>
</template>
