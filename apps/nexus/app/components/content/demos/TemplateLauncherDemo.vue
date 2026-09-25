<script setup lang="ts">
// Launcher template: a CoreBox-style launcher on a desktop. The result list is
// a hand-built listbox on purpose — TxSearchPanel neither reports its
// highlighted row nor exposes its input, and the preview and the scripted
// typing both have to follow the highlight. Arrow keys, Enter and Escape live
// on the search field; the field owns focus the whole time and points at the
// highlighted option with aria-activedescendant.
import type { FilterChipItem } from '@talex-touch/tuffex/filter-chips'
import type { IconChipTone } from '@talex-touch/tuffex/icon-chip'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

type Kind = 'app' | 'plugin' | 'file' | 'clipboard' | 'ai' | 'system'
type Scope = 'all' | Kind
type ResultKind = Kind | 'calc'
type ActionKey = 'open' | 'reveal' | 'pin' | 'disable'

interface CatalogEntry {
  id: string
  kind: Kind
  icon: string
  tone: IconChipTone
  /** Multi-colour logos sit on a neutral plate instead of a tinted one. */
  logo?: boolean
  keywords: string[]
}

interface EntryText {
  title: string
  subtitle: string
  preview: string
}

interface Result {
  id: string
  kind: ResultKind
  icon: string
  tone: IconChipTone
  logo?: boolean
  title: string
  subtitle: string
  preview: string
  score: number
}

const KIND_ORDER: Kind[] = ['app', 'plugin', 'file', 'clipboard', 'ai', 'system']

const CATALOG: CatalogEntry[] = [
  { id: 'app-vscode', kind: 'app', icon: 'i-logos-visual-studio-code', tone: 'neutral', logo: true, keywords: ['vscode', 'code', 'editor'] },
  { id: 'app-figma', kind: 'app', icon: 'i-logos-figma', tone: 'neutral', logo: true, keywords: ['figma', 'design'] },
  { id: 'app-obsidian', kind: 'app', icon: 'i-logos-obsidian-icon', tone: 'neutral', logo: true, keywords: ['obsidian', 'notes', 'markdown', 'web clipper'] },
  { id: 'app-terminal', kind: 'app', icon: 'i-carbon-terminal', tone: 'ink', keywords: ['terminal', 'shell', 'zsh', 'cli'] },
  { id: 'plugin-clipboard', kind: 'plugin', icon: 'i-carbon-paste', tone: 'accent', keywords: ['clipboard-history', 'clipboard', 'paste', 'history', '剪贴板'] },
  { id: 'plugin-snippets', kind: 'plugin', icon: 'i-carbon-code', tone: 'neutral', keywords: ['touch-snippets', 'snippet', 'template', 'clipboard templates', '片段'] },
  { id: 'plugin-translate', kind: 'plugin', icon: 'i-carbon-translate', tone: 'green', keywords: ['touch-translation', 'translate', 'fy', 'translate clipboard', '翻译'] },
  { id: 'plugin-intelligence', kind: 'plugin', icon: 'i-carbon-machine-learning-model', tone: 'green', keywords: ['touch-intelligence', 'ai', 'ask', 'clipboard summary'] },
  { id: 'plugin-quick', kind: 'plugin', icon: 'i-carbon-flash', tone: 'orange', keywords: ['touch-quick-actions', 'lock', 'mute', 'quick'] },
  { id: 'plugin-browser', kind: 'plugin', icon: 'i-carbon-launch', tone: 'accent', keywords: ['touch-browser-open', 'browser', 'url', 'open'] },
  { id: 'plugin-window', kind: 'plugin', icon: 'i-carbon-screen', tone: 'ink', keywords: ['touch-window-presets', 'window', 'layout', 'preset'] },
  { id: 'file-clip-notes', kind: 'file', icon: 'i-carbon-document', tone: 'neutral', keywords: ['clip-notes', 'notes', 'markdown'] },
  { id: 'file-roadmap', kind: 'file', icon: 'i-carbon-document-pdf', tone: 'red', keywords: ['roadmap', 'q3', 'pdf'] },
  { id: 'file-export', kind: 'file', icon: 'i-carbon-document', tone: 'neutral', keywords: ['clipboard-export', 'json', 'export'] },
  { id: 'clip-meeting', kind: 'clipboard', icon: 'i-carbon-paste', tone: 'orange', keywords: ['meeting', 'q3', 'roadmap'] },
  { id: 'clip-shot', kind: 'clipboard', icon: 'i-carbon-image', tone: 'orange', keywords: ['screenshot', 'image'] },
  { id: 'clip-command', kind: 'clipboard', icon: 'i-carbon-terminal', tone: 'orange', keywords: ['npx', 'tuff plugin add clipboard-history'] },
  { id: 'ai-summarize', kind: 'ai', icon: 'i-carbon-machine-learning-model', tone: 'green', keywords: ['ai', 'summary', 'clipboard'] },
  { id: 'ai-explain', kind: 'ai', icon: 'i-carbon-chat-bot', tone: 'green', keywords: ['ai', 'explain', 'error'] },
  { id: 'sys-dark', kind: 'system', icon: 'i-carbon-moon', tone: 'ink', keywords: ['dark', 'theme', 'appearance'] },
  { id: 'sys-lock', kind: 'system', icon: 'i-carbon-locked', tone: 'ink', keywords: ['lock', 'screen', 'sleep'] },
]

// What an empty query shows: recent and frequent picks, as CoreBox does.
const SUGGESTED = ['app-vscode', 'plugin-clipboard', 'clip-meeting', 'plugin-translate', 'file-roadmap', 'ai-summarize', 'sys-dark']

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))

const copy = computed(() => zh.value
  ? {
      title: 'Launcher 启动器',
      menus: ['文件', '编辑', '视图', '窗口', '帮助'],
      clock: '周四 09:41',
      placeholder: '搜索应用、文件、插件，或直接提问…',
      inputLabel: '搜索',
      listLabel: '搜索结果',
      scopeLabel: '搜索范围',
      scopes: { all: '全部', app: '应用', plugin: '插件', file: '文件', clipboard: '剪贴板', ai: 'AI', system: '系统' } as Record<Scope, string>,
      kinds: { app: '应用', plugin: '插件', file: '文件', clipboard: '剪贴板', ai: 'AI', system: '系统', calc: '计算' } as Record<ResultKind, string>,
      suggested: '推荐',
      best: '最佳匹配',
      results: (n: number) => `${n} 个结果`,
      emptyTitle: (q: string) => `没有找到「${q}」`,
      emptyBody: '换个关键词，或者直接问 Tuff 智能。',
      ask: '问问 Tuff 智能',
      open: '打开',
      actions: '操作',
      actionsLabel: '当前结果的操作',
      indexing: '索引中 82%',
      actionNames: { open: '打开', reveal: '在访达中显示', pin: '固定到推荐', disable: '停用插件' } as Record<ActionKey, string>,
      done: {
        open: (t: string) => `已打开「${t}」`,
        reveal: (t: string) => `已在访达中显示「${t}」`,
        pin: (t: string) => `已把「${t}」固定到推荐`,
        disable: (t: string) => `已停用「${t}」`,
        run: (t: string) => `已执行「${t}」`,
        paste: '已粘贴到当前应用',
        ask: '已发送给 Tuff 智能',
        calc: (v: string) => `= ${v}，CoreBox 会把它复制到剪贴板`,
      },
      fallbackTitle: (q: string) => `问问 Tuff 智能：「${q}」`,
      fallbackSub: '按 ↵ 发送 · 用当前剪贴板作上下文',
      fallbackPreview: (q: string) => `**Tuff 智能** 会结合剪贴板、最近文件和已启用的插件回答：\n\n> ${q}\n\n回答在 CoreBox 里流式展开，可以继续追问，也能一键粘贴回当前应用。`,
      calcSub: (expr: string) => `计算 · ${expr}`,
      calcPreview: (expr: string, value: string, hex?: string, bin?: string) => `### ${expr} = ${value}\n\n${hex ? `- 十六进制 \`${hex}\`\n- 二进制 \`${bin}\`\n` : ''}- \`↵\` 复制结果`,
      tips: '**小技巧**\n\n- 直接输入算式，例如 `128*4`\n- `⌘K` 打开当前结果的操作\n- `Esc` 先清空输入，再重置范围\n- `⌘1`–`⌘5` 快速选择前五项',
    }
  : {
      title: 'Launcher',
      menus: ['File', 'Edit', 'View', 'Window', 'Help'],
      clock: 'Thu 9:41',
      placeholder: 'Search apps, files and plugins, or just ask…',
      inputLabel: 'Search',
      listLabel: 'Search results',
      scopeLabel: 'Search scope',
      scopes: { all: 'All', app: 'Apps', plugin: 'Plugins', file: 'Files', clipboard: 'Clipboard', ai: 'AI', system: 'System' } as Record<Scope, string>,
      kinds: { app: 'App', plugin: 'Plugin', file: 'File', clipboard: 'Clip', ai: 'AI', system: 'System', calc: 'Math' } as Record<ResultKind, string>,
      suggested: 'Suggested',
      best: 'Best matches',
      results: (n: number) => `${n} result${n === 1 ? '' : 's'}`,
      emptyTitle: (q: string) => `Nothing matches "${q}"`,
      emptyBody: 'Try another word, or ask Tuff Intelligence.',
      ask: 'Ask Tuff Intelligence',
      open: 'Open',
      actions: 'Actions',
      actionsLabel: 'Actions for the selected result',
      indexing: 'Indexing 82%',
      actionNames: { open: 'Open', reveal: 'Reveal in Finder', pin: 'Pin to suggestions', disable: 'Disable plugin' } as Record<ActionKey, string>,
      done: {
        open: (t: string) => `Opened ${t}`,
        reveal: (t: string) => `Revealed ${t} in Finder`,
        pin: (t: string) => `Pinned ${t} to suggestions`,
        disable: (t: string) => `Disabled ${t}`,
        run: (t: string) => `Ran ${t}`,
        paste: 'Pasted into the front app',
        ask: 'Sent to Tuff Intelligence',
        calc: (v: string) => `= ${v} — CoreBox copies it to the clipboard`,
      },
      fallbackTitle: (q: string) => `Ask Tuff Intelligence: "${q}"`,
      fallbackSub: 'Press ↵ to send · uses the clipboard as context',
      fallbackPreview: (q: string) => `**Tuff Intelligence** answers with your clipboard, recent files and enabled plugins in view:\n\n> ${q}\n\nThe answer streams inside CoreBox; ask a follow-up or paste it back into the app you came from.`,
      calcSub: (expr: string) => `Math · ${expr}`,
      calcPreview: (expr: string, value: string, hex?: string, bin?: string) => `### ${expr} = ${value}\n\n${hex ? `- Hex \`${hex}\`\n- Binary \`${bin}\`\n` : ''}- \`↵\` copies the result`,
      tips: '**Tips**\n\n- Type a sum such as `128*4` to calculate\n- `⌘K` opens actions for the selected result\n- `Esc` clears the query first, then the scope\n- `⌘1`–`⌘5` pick one of the first five',
    })

// Preview markdown carries no links on purpose: TxMarkdownView renders real
// anchors, and a click would navigate the docs page away.
const entryText = computed<Record<string, EntryText>>(() => zh.value
  ? {
      'app-vscode': { title: 'Visual Studio Code', subtitle: '应用 · /Applications', preview: '**Visual Studio Code** 1.104\n\n- 最近项目 `talex-touch`、`tuffex`\n- `↵` 打开，`⌘↵` 在终端打开所在目录\n- 已安装插件：`touch-vscode-projects`' },
      'app-figma': { title: 'Figma', subtitle: '应用 · /Applications', preview: '**Figma** 桌面版\n\n- 最近文件：`CoreBox 3.0`、`Nexus 模板`\n- 上次打开：今天 08:52' },
      'app-obsidian': { title: 'Obsidian', subtitle: '应用 · 含 Web Clipper', preview: '**Obsidian** 1.9\n\n- 仓库 `~/Notes`，共 1,284 篇笔记\n- Web Clipper 已连接' },
      'app-terminal': { title: '终端', subtitle: '应用 · /System/Applications', preview: '**终端**\n\n- 默认 shell `zsh`\n- `⌘↵` 在当前 Finder 目录打开' },
      'plugin-clipboard': { title: '剪贴板历史', subtitle: '插件 · clipboard-history', preview: '保留最近 **500** 条文本、图片与文件，按应用和时间筛选。\n\n- `⌘ ⇧ V` 直接打开历史\n- 密码管理器里的内容自动跳过\n- 固定的条目不会被清理' },
      'plugin-snippets': { title: '片段库', subtitle: '插件 · touch-snippets', preview: '统一的片段库：文本、代码与提示词模板。\n\n- 输入 `;` 前缀触发片段\n- 支持 `{clipboard}` 与 `{date}` 占位符' },
      'plugin-translate': { title: '翻译', subtitle: '插件 · touch-translation', preview: '选中文字或复制后输入 `fy`，在 CoreBox 里直接翻译。\n\n- 聚合多家翻译服务\n- 译文可一键替换原文' },
      'plugin-intelligence': { title: 'Tuff 智能', subtitle: '插件 · touch-intelligence', preview: 'CoreBox 里的智能问答与内置 AI 命令。\n\n- 读取剪贴板作为上下文\n- 自定义命令保存在本机' },
      'plugin-quick': { title: '快捷动作', subtitle: '插件 · touch-quick-actions', preview: '锁屏、静音、切换深色模式等系统动作。\n\n- 每个动作都可以绑定快捷键' },
      'plugin-browser': { title: '浏览器打开', subtitle: '插件 · touch-browser-open', preview: '用默认或指定浏览器打开输入的网址。\n\n- `⌘↵` 选择其他浏览器' },
      'plugin-window': { title: '窗口预设', subtitle: '插件 · touch-window-presets', preview: '一键应用常用的窗口布局。\n\n- 已保存 3 个预设：写作、评审、演示' },
      'file-clip-notes': { title: 'clip-notes.md', subtitle: '文件 · ~/Documents/notes', preview: '**clip-notes.md** · 4 KB · 今天 09:12 修改\n\n> 剪贴板历史插件的待办：图片条目的缩略图、按应用分组、敏感内容检测。' },
      'file-roadmap': { title: 'Q3-roadmap.pdf', subtitle: '文件 · ~/Downloads', preview: '**Q3-roadmap.pdf** · 2.4 MB · 12 页\n\n- 昨天 18:40 从邮件下载\n- `⌘↵` 在访达中显示' },
      'file-export': { title: 'clipboard-export.json', subtitle: '文件 · ~/Desktop', preview: '**clipboard-export.json** · 186 KB\n\n- 从剪贴板历史导出的 500 条记录\n- 敏感条目已剔除' },
      'clip-meeting': { title: '会议纪要 — Q3 路线图评审', subtitle: '剪贴板 · 文本 · 2 分钟前', preview: '> 会议纪要 — Q3 路线图评审\n>\n> 1. CoreBox 3.0 的搜索排序改为按使用频率\n> 2. 插件市场开放付费插件的内测\n\n来自 **飞书** · 312 字' },
      'clip-shot': { title: '截图 09:41', subtitle: '剪贴板 · 图片 · 5 分钟前', preview: '**截图 09:41** · 1280 × 720\n\n- 来自系统截图\n- 可以直接交给 `翻译` 做 OCR 翻译' },
      'clip-command': { title: 'npx tuff plugin add clipboard-history', subtitle: '剪贴板 · 代码 · 18 分钟前', preview: '```bash\nnpx tuff plugin add clipboard-history\n```\n\n来自 **终端** · 1 行' },
      'ai-summarize': { title: '总结剪贴板', subtitle: 'AI · 最近 20 条', preview: '让 **Tuff 智能** 把最近 20 条剪贴板整理成要点，结果可以直接粘贴。' },
      'ai-explain': { title: '解释这段报错', subtitle: 'AI · 读取剪贴板', preview: '把剪贴板里的报错交给 **Tuff 智能**，得到原因和修复建议。' },
      'sys-dark': { title: '切换深色模式', subtitle: '系统 · 快捷动作', preview: '在浅色与深色外观之间切换，CoreBox 跟随系统一起变化。' },
      'sys-lock': { title: '锁定屏幕', subtitle: '系统 · ⌃⌘Q', preview: '立即锁定屏幕。正在进行的下载不会中断。' },
    }
  : {
      'app-vscode': { title: 'Visual Studio Code', subtitle: 'App · /Applications', preview: '**Visual Studio Code** 1.104\n\n- Recent projects `talex-touch`, `tuffex`\n- `↵` opens, `⌘↵` opens its folder in Terminal\n- Plugin installed: `touch-vscode-projects`' },
      'app-figma': { title: 'Figma', subtitle: 'App · /Applications', preview: '**Figma** for desktop\n\n- Recent files: `CoreBox 3.0`, `Nexus templates`\n- Last opened today at 08:52' },
      'app-obsidian': { title: 'Obsidian', subtitle: 'App · with Web Clipper', preview: '**Obsidian** 1.9\n\n- Vault `~/Notes`, 1,284 notes\n- Web Clipper connected' },
      'app-terminal': { title: 'Terminal', subtitle: 'App · /System/Applications', preview: '**Terminal**\n\n- Default shell `zsh`\n- `⌘↵` opens at the current Finder folder' },
      'plugin-clipboard': { title: 'Clipboard History', subtitle: 'Plugin · clipboard-history', preview: 'Keeps your last **500** texts, images and files, filterable by app and time.\n\n- `⌘ ⇧ V` opens the history directly\n- Anything copied from a password manager is skipped\n- Pinned items are never cleaned up' },
      'plugin-snippets': { title: 'Snippets', subtitle: 'Plugin · touch-snippets', preview: 'One library for text, code and prompt templates.\n\n- Type the `;` prefix to expand a snippet\n- `{clipboard}` and `{date}` placeholders' },
      'plugin-translate': { title: 'Translate', subtitle: 'Plugin · touch-translation', preview: 'Select or copy text, type `fy`, and translate inside CoreBox.\n\n- Aggregates several translation services\n- Replace the original text in one step' },
      'plugin-intelligence': { title: 'Tuff Intelligence', subtitle: 'Plugin · touch-intelligence', preview: 'Answers and built-in AI commands inside CoreBox.\n\n- Reads the clipboard as context\n- Custom commands stay on this device' },
      'plugin-quick': { title: 'Quick Actions', subtitle: 'Plugin · touch-quick-actions', preview: 'Lock, mute, toggle dark mode and other system actions.\n\n- Any action can take its own shortcut' },
      'plugin-browser': { title: 'Browser Open', subtitle: 'Plugin · touch-browser-open', preview: 'Opens the typed address in your default or a chosen browser.\n\n- `⌘↵` picks another browser' },
      'plugin-window': { title: 'Window Presets', subtitle: 'Plugin · touch-window-presets', preview: 'Apply a saved window layout in one step.\n\n- 3 presets saved: Writing, Review, Demo' },
      'file-clip-notes': { title: 'clip-notes.md', subtitle: 'File · ~/Documents/notes', preview: '**clip-notes.md** · 4 KB · modified today 09:12\n\n> Clipboard History to-dos: thumbnails for image clips, grouping by app, sensitive-content detection.' },
      'file-roadmap': { title: 'Q3-roadmap.pdf', subtitle: 'File · ~/Downloads', preview: '**Q3-roadmap.pdf** · 2.4 MB · 12 pages\n\n- Downloaded from mail yesterday at 18:40\n- `⌘↵` reveals it in Finder' },
      'file-export': { title: 'clipboard-export.json', subtitle: 'File · ~/Desktop', preview: '**clipboard-export.json** · 186 KB\n\n- 500 records exported from Clipboard History\n- Sensitive items removed' },
      'clip-meeting': { title: 'Meeting notes — Q3 roadmap review', subtitle: 'Clipboard · text · 2 min ago', preview: '> Meeting notes — Q3 roadmap review\n>\n> 1. CoreBox 3.0 ranks results by frequency of use\n> 2. The plugin store opens a paid-plugin beta\n\nFrom **Lark** · 312 words' },
      'clip-shot': { title: 'Screenshot 09:41', subtitle: 'Clipboard · image · 5 min ago', preview: '**Screenshot 09:41** · 1280 × 720\n\n- From the system screenshot tool\n- Hand it to `Translate` for OCR translation' },
      'clip-command': { title: 'npx tuff plugin add clipboard-history', subtitle: 'Clipboard · code · 18 min ago', preview: '```bash\nnpx tuff plugin add clipboard-history\n```\n\nFrom **Terminal** · 1 line' },
      'ai-summarize': { title: 'Summarise my clipboard', subtitle: 'AI · last 20 clips', preview: 'Let **Tuff Intelligence** turn your last 20 clips into bullet points, ready to paste.' },
      'ai-explain': { title: 'Explain this error', subtitle: 'AI · reads the clipboard', preview: 'Hand the error on your clipboard to **Tuff Intelligence** for a cause and a fix.' },
      'sys-dark': { title: 'Toggle dark mode', subtitle: 'System · quick action', preview: 'Switch between light and dark appearance; CoreBox follows the system.' },
      'sys-lock': { title: 'Lock screen', subtitle: 'System · ⌃⌘Q', preview: 'Locks the screen straight away. Downloads in progress keep going.' },
    })

const DOCK = [
  { id: 'vscode', icon: 'i-logos-visual-studio-code' },
  { id: 'figma', icon: 'i-logos-figma' },
  { id: 'obsidian', icon: 'i-logos-obsidian-icon' },
  { id: 'chrome', icon: 'i-logos-chrome' },
  { id: 'slack', icon: 'i-logos-slack-icon' },
  { id: 'notion', icon: 'i-logos-notion-icon' },
]

const uid = useId()
const listId = `${uid}-list`
const optionId = (index: number) => `${uid}-option-${index}`

const query = ref('')
const scope = ref<Scope>('all')
const activeIndex = ref(0)
const actionsOpen = ref(false)
const flash = ref('')
const pinned = ref<string[]>([])
const listRef = ref<HTMLElement | null>(null)

/* ─── search ─── */

const needle = computed(() => query.value.trim().toLowerCase())

// A tiny recursive-descent evaluator for + - * / and parentheses — enough for
// the calculator row, and no `eval`.
function evaluate(source: string): number | null {
  const tokens = source.match(/\d+(?:\.\d+)?|[()+\-*/]/g)
  if (!tokens || tokens.join('') !== source.replace(/\s+/g, ''))
    return null
  let pos = 0
  const peek = () => tokens[pos]
  function factor(): number {
    const token = tokens![pos++]
    if (token === '(') {
      const value = expression()
      if (tokens![pos++] !== ')')
        throw new Error('paren')
      return value
    }
    if (token === '-')
      return -factor()
    const value = Number(token)
    if (Number.isNaN(value))
      throw new Error('token')
    return value
  }
  function term(): number {
    let value = factor()
    while (peek() === '*' || peek() === '/')
      value = tokens![pos++] === '*' ? value * factor() : value / factor()
    return value
  }
  function expression(): number {
    let value = term()
    while (peek() === '+' || peek() === '-')
      value = tokens![pos++] === '+' ? value + term() : value - term()
    return value
  }
  try {
    const value = expression()
    return pos === tokens.length && Number.isFinite(value) ? value : null
  }
  catch {
    return null
  }
}

const calcResult = computed<Result | null>(() => {
  const source = query.value.trim()
  if (!/^[\d\s+\-*/().]+$/.test(source) || !/\d\s*[+\-*/]\s*[\d(]/.test(source))
    return null
  const value = evaluate(source)
  if (value === null)
    return null
  const rounded = Number.isInteger(value) ? value : Number(value.toFixed(6))
  const text = new Intl.NumberFormat(zh.value ? 'zh-CN' : 'en-US', { maximumFractionDigits: 6 }).format(rounded)
  const expr = source.replace(/\s+/g, '').replace(/\*/g, ' × ').replace(/\//g, ' ÷ ').replace(/\+/g, ' + ').replace(/(\d|\))-/g, '$1 − ')
  const integral = Number.isInteger(rounded) && rounded >= 0 && rounded < 2 ** 32
  return {
    id: 'calc',
    kind: 'calc',
    icon: 'i-carbon-calculator',
    tone: 'accent',
    title: text,
    subtitle: copy.value.calcSub(expr),
    preview: copy.value.calcPreview(expr, text, integral ? `0x${rounded.toString(16).toUpperCase()}` : undefined, integral ? rounded.toString(2) : undefined),
    score: 10,
  }
})

function scoreEntry(entry: CatalogEntry, text: EntryText): number {
  const q = needle.value
  const title = text.title.toLowerCase()
  if (title.startsWith(q))
    return 3
  if (title.includes(q))
    return 2
  if (entry.keywords.some(keyword => keyword.toLowerCase().includes(q)) || text.subtitle.toLowerCase().includes(q))
    return 1
  return 0
}

function toResult(entry: CatalogEntry, score: number): Result {
  const text = entryText.value[entry.id]!
  return { ...entry, ...text, score }
}

const matches = computed<Result[]>(() => {
  if (!needle.value)
    return []
  const found: Result[] = []
  for (const entry of CATALOG) {
    const score = scoreEntry(entry, entryText.value[entry.id]!)
    if (score > 0)
      found.push(toResult(entry, score))
  }
  return found.sort((a, b) => b.score - a.score || KIND_ORDER.indexOf(a.kind as Kind) - KIND_ORDER.indexOf(b.kind as Kind))
})

const fallback = computed<Result | null>(() => {
  const q = query.value.trim()
  if (!q)
    return null
  return {
    id: 'ai-fallback',
    kind: 'ai',
    icon: 'i-carbon-chat-bot',
    tone: 'green',
    title: copy.value.fallbackTitle(q),
    subtitle: copy.value.fallbackSub,
    preview: copy.value.fallbackPreview(q),
    score: 0,
  }
})

const results = computed<Result[]>(() => {
  if (!needle.value) {
    const pool = scope.value === 'all'
      ? [...new Set([...pinned.value, ...SUGGESTED])].map(id => CATALOG.find(entry => entry.id === id)!)
      : CATALOG.filter(entry => entry.kind === scope.value)
    return pool.map(entry => toResult(entry, 0))
  }
  if (scope.value === 'all')
    return calcResult.value ? [calcResult.value, ...matches.value] : matches.value
  const scoped = matches.value.filter(result => result.kind === scope.value)
  // The AI scope always has an answer: the query itself, as a prompt.
  return scope.value === 'ai' && fallback.value ? [...scoped, fallback.value] : scoped
})

const active = computed<Result | null>(() => results.value[activeIndex.value] ?? null)

const scopeChips = computed<FilterChipItem[]>(() => {
  const labels = copy.value.scopes
  // Counts only mean something against a query; idle chips are plain scopes.
  const count = (kind: Kind) => (needle.value
    ? matches.value.filter(result => result.kind === kind).length + (kind === 'ai' && fallback.value ? 1 : 0)
    : undefined)
  const all = needle.value ? matches.value.length + (calcResult.value ? 1 : 0) : undefined
  return [
    { value: 'all', label: labels.all, count: all },
    ...KIND_ORDER.map(kind => ({ value: kind, label: labels[kind], count: count(kind) })),
  ]
})

const caption = computed(() => (needle.value ? copy.value.best : copy.value.suggested))
const status = computed(() => flash.value || copy.value.results(results.value.length))
const previewContent = computed(() => active.value?.preview ?? copy.value.tips)

function segments(text: string) {
  const q = needle.value
  const at = q ? text.toLowerCase().indexOf(q) : -1
  if (at < 0)
    return [{ text, hit: false }]
  return [
    { text: text.slice(0, at), hit: false },
    { text: text.slice(at, at + q.length), hit: true },
    { text: text.slice(at + q.length), hit: false },
  ].filter(part => part.text)
}

/* ─── highlight & activation ─── */

// Keeps the highlighted row inside the list's own scrollport. Never
// scrollIntoView: that would scroll the docs page as well.
function revealActive() {
  void nextTick(() => {
    const list = listRef.value
    const row = list?.querySelector<HTMLElement>(`[data-index="${activeIndex.value}"]`)
    if (!list || !row)
      return
    const top = row.offsetTop
    const bottom = top + row.offsetHeight
    if (top < list.scrollTop + 4)
      list.scrollTop = Math.max(0, top - 4)
    else if (bottom > list.scrollTop + list.clientHeight - 4)
      list.scrollTop = bottom - list.clientHeight + 4
  })
}

function move(step: number) {
  const count = results.value.length
  if (!count)
    return
  activeIndex.value = (activeIndex.value + step + count) % count
  revealActive()
}

let flashTimer: ReturnType<typeof setTimeout> | undefined

function showFlash(message: string) {
  flash.value = message
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => {
    flash.value = ''
  }, 1600)
}

function activate(result: Result | null) {
  if (!result)
    return
  const done = copy.value.done
  if (result.kind === 'calc')
    showFlash(done.calc(result.title))
  else if (result.kind === 'ai')
    showFlash(done.ask)
  else if (result.kind === 'system')
    showFlash(done.run(result.title))
  else if (result.kind === 'clipboard')
    showFlash(done.paste)
  else
    showFlash(done.open(result.title))
}

const actionItems = computed<ActionKey[]>(() => {
  const current = active.value
  if (!current || current.kind === 'calc' || current.id === 'ai-fallback')
    return ['open']
  const list: ActionKey[] = ['open']
  if (current.kind === 'file' || current.kind === 'app')
    list.push('reveal')
  list.push('pin')
  if (current.kind === 'plugin')
    list.push('disable')
  return list
})

function runAction(action: ActionKey) {
  const current = active.value
  if (!current)
    return
  if (action === 'open') {
    activate(current)
    return
  }
  if (action === 'pin' && !pinned.value.includes(current.id))
    pinned.value = [current.id, ...pinned.value]
  showFlash(copy.value.done[action](current.title))
}

function onScope(value: string | number) {
  stopAutoplay()
  scope.value = value as Scope
}

function onInputKeydown(event: KeyboardEvent) {
  if (event.isComposing)
    return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    move(event.key === 'ArrowDown' ? 1 : -1)
  }
  else if (event.key === 'Enter') {
    event.preventDefault()
    activate(active.value)
  }
  else if (event.key === 'Escape') {
    // Two layers, as in CoreBox: the query goes first, then the scope. Past
    // that the press is left alone for whoever sits above the launcher.
    if (query.value) {
      event.preventDefault()
      query.value = ''
    }
    else if (scope.value !== 'all') {
      event.preventDefault()
      scope.value = 'all'
    }
  }
}

function onRootKeydown(event: KeyboardEvent) {
  stopAutoplay()
  if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    actionsOpen.value = !actionsOpen.value
  }
}

function askAi() {
  scope.value = 'ai'
}

watch([needle, scope], () => {
  activeIndex.value = 0
  if (listRef.value)
    listRef.value.scrollTop = 0
})

/* ─── scripted typing ─── */

const TYPED = 'clip'
const autoplayTimers = new Set<ReturnType<typeof setTimeout>>()
let entered = false
let autoplaying = false

function prefersReducedMotion(): boolean {
  return hasWindow() && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function schedule(ms: number, step: () => void) {
  const id = setTimeout(() => {
    autoplayTimers.delete(id)
    step()
  }, ms)
  autoplayTimers.add(id)
}

function clearAutoplay() {
  for (const id of autoplayTimers)
    clearTimeout(id)
  autoplayTimers.clear()
  autoplaying = false
}

function stopAutoplay() {
  if (autoplaying)
    clearAutoplay()
}

// Writes the model directly: focusing the field would scroll the docs page to
// the demo and take the reader's keyboard with it.
function play() {
  clearAutoplay()
  if (prefersReducedMotion()) {
    query.value = TYPED
    scope.value = 'plugin'
    return
  }
  autoplaying = true
  let at = 500
  for (let i = 1; i <= TYPED.length; i++) {
    const text = TYPED.slice(0, i)
    schedule(at, () => {
      query.value = text
    })
    at += 120
  }
  at += 520
  schedule(at, () => move(1))
  at += 460
  schedule(at, () => move(1))
  at += 720
  schedule(at, () => {
    scope.value = 'plugin'
    autoplaying = false
  })
}

function onEnter() {
  entered = true
  play()
}

function resetDemo() {
  clearAutoplay()
  clearTimeout(flashTimer)
  query.value = ''
  scope.value = 'all'
  activeIndex.value = 0
  actionsOpen.value = false
  flash.value = ''
  pinned.value = []
  if (entered)
    play()
}

watch(locale, resetDemo)

onBeforeUnmount(() => {
  clearAutoplay()
  clearTimeout(flashTimer)
})

defineExpose({ resetDemo })
</script>

<template>
  <TemplateFrame :title="copy.title" @enter="onEnter">
    <div class="launcher" @keydown="onRootKeydown" @pointerdown="stopAutoplay">
      <div class="launcher__wallpaper" aria-hidden="true" />

      <div class="launcher__menubar" aria-hidden="true">
        <span class="launcher__brand">
          <TxIconChip :size="16" :radius="5" tone="ink" :font-size="10">T</TxIconChip>
          Tuff
        </span>
        <span v-for="menu in copy.menus" :key="menu" class="launcher__menu">{{ menu }}</span>
        <span class="launcher__tray">
          <i class="i-carbon-search" />
          <i class="i-carbon-wifi" />
          <i class="i-carbon-battery-full" />
          <span>{{ copy.clock }}</span>
        </span>
      </div>

      <div class="launcher__stage">
        <div class="launcher__window">
          <TxGlassSurface width="100%" height="100%" :border-radius="18" :blur="14" :saturation="1.4">
            <div class="launcher__panel">
              <!-- The listbox is always open, so it is not a popup that Escape closes:
                   past the two layers below, the press may collapse the stage. -->
              <div class="launcher__search" data-template-esc="self">
                <TxIconChip :size="30" :radius="9" tone="ink" :font-size="14" aria-hidden="true">
                  T
                </TxIconChip>
                <TxSearchInput
                  v-model="query"
                  :placeholder="copy.placeholder"
                  :aria-label="copy.inputLabel"
                  role="combobox"
                  :aria-expanded="results.length ? 'true' : 'false'"
                  aria-autocomplete="list"
                  :aria-controls="listId"
                  :aria-activedescendant="active ? optionId(activeIndex) : undefined"
                  @keydown="onInputKeydown"
                />
                <TxKbd class="launcher__esc">
                  Esc
                </TxKbd>
              </div>

              <div class="launcher__scopes">
                <TxFilterChips :model-value="scope" :items="scopeChips" :aria-label="copy.scopeLabel" @update:model-value="onScope" />
              </div>

              <div class="launcher__body">
                <div class="launcher__column">
                  <div class="launcher__caption" aria-hidden="true">
                    {{ caption }}
                  </div>
                  <div
                    v-if="results.length"
                    :id="listId"
                    ref="listRef"
                    class="launcher__list"
                    role="listbox"
                    :aria-label="copy.listLabel"
                  >
                    <div
                      v-for="(result, index) in results"
                      :id="optionId(index)"
                      :key="result.id"
                      class="launcher__option"
                      :class="{ 'is-active': index === activeIndex }"
                      role="option"
                      :aria-selected="index === activeIndex"
                      :data-index="index"
                      @pointermove="activeIndex = index"
                      @click="activate(result)"
                    >
                      <TxIconChip :size="30" :radius="9" :tone="result.tone" variant="soft" class="launcher__glyph" :class="{ 'is-logo': result.logo }">
                        <i :class="result.icon" />
                      </TxIconChip>
                      <span class="launcher__option-text">
                        <span class="launcher__option-title">
                          <template v-for="(part, partIndex) in segments(result.title)" :key="partIndex">
                            <mark v-if="part.hit">{{ part.text }}</mark>
                            <template v-else>{{ part.text }}</template>
                          </template>
                        </span>
                        <span class="launcher__option-sub">{{ result.subtitle }}</span>
                      </span>
                      <TxTag class="launcher__kind" :label="copy.kinds[result.kind]" size="sm" variant="soft" color="var(--tx-text-color-secondary)" />
                      <span class="launcher__quick" aria-hidden="true">
                        <TxKbd v-if="index < 5">⌘{{ index + 1 }}</TxKbd>
                      </span>
                    </div>
                  </div>
                  <div v-else class="launcher__empty">
                    <TxSearchEmpty
                      size="small"
                      :title="copy.emptyTitle(query.trim())"
                      :description="copy.emptyBody"
                      :primary-action="{ label: copy.ask, variant: 'primary', size: 'sm', icon: 'i-carbon-chat-bot' }"
                      @primary="askAi"
                    >
                      <template #icon>
                        <i class="i-carbon-search launcher__empty-icon" aria-hidden="true" />
                      </template>
                    </TxSearchEmpty>
                  </div>
                </div>

                <aside class="launcher__preview" :aria-label="active?.title">
                  <div v-if="active" class="launcher__preview-head">
                    <TxIconChip :size="44" :radius="12" :tone="active.tone" variant="soft" class="launcher__glyph launcher__glyph--lg" :class="{ 'is-logo': active.logo }">
                      <i :class="active.icon" />
                    </TxIconChip>
                    <div class="launcher__preview-title">
                      <strong>{{ active.title }}</strong>
                      <span>{{ active.subtitle }}</span>
                    </div>
                  </div>
                  <!-- One instance, only its content swaps: a remount would
                       blank it while the sanitiser loads again. -->
                  <TxMarkdownView class="launcher__markdown" :content="previewContent" />
                </aside>
              </div>

              <footer class="launcher__footer">
                <span class="launcher__status" role="status" aria-live="polite">
                  <i v-if="flash" class="i-carbon-checkmark-outline" aria-hidden="true" />
                  {{ status }}
                </span>
                <span class="launcher__hint"><TxKbd>↵</TxKbd>{{ copy.open }}</span>
                <TxDropdownMenu v-model="actionsOpen" placement="top-end" :min-width="208">
                  <template #trigger>
                    <button type="button" class="launcher__hint launcher__hint--button" :aria-label="copy.actionsLabel">
                      <TxKbd>⌘K</TxKbd>{{ copy.actions }}
                    </button>
                  </template>
                  <TxDropdownItem
                    v-for="action in actionItems"
                    :key="action"
                    :danger="action === 'disable'"
                    @select="runAction(action)"
                  >
                    {{ copy.actionNames[action] }}
                  </TxDropdownItem>
                </TxDropdownMenu>
                <TxStatusBadge class="launcher__indexing" :text="copy.indexing" status="info" icon="i-carbon-renew" size="sm" />
              </footer>
            </div>
          </TxGlassSurface>
        </div>
      </div>

      <div class="launcher__dock" aria-hidden="true">
        <TxIconChip v-for="app in DOCK" :key="app.id" :size="40" :radius="11" tone="neutral" class="launcher__dock-app">
          <i :class="app.icon" />
        </TxIconChip>
        <span class="launcher__dock-divider" />
        <TxIconChip :size="40" :radius="11" tone="ink" :font-size="17" class="launcher__dock-app">
          T
        </TxIconChip>
      </div>
    </div>
  </TemplateFrame>
</template>

<style scoped>
.launcher {
  /* Wallpaper blobs: token hues, dimmer on the dark theme where a saturated
     wash reads as neon rather than light. */
  --wp-primary: 46%;
  --wp-success: 30%;
  --wp-warning: 34%;
  --wp-danger: 22%;

  position: relative;
  display: flex;
  height: 100%;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
}

.dark .launcher {
  --wp-primary: 34%;
  --wp-success: 20%;
  --wp-warning: 18%;
  --wp-danger: 16%;
}

.launcher__wallpaper {
  position: absolute;
  background:
    radial-gradient(58% 70% at 10% 14%, color-mix(in srgb, var(--tx-color-primary, #409eff) var(--wp-primary), transparent), transparent 72%),
    radial-gradient(48% 60% at 92% 8%, color-mix(in srgb, var(--tx-color-success, #67c23a) var(--wp-success), transparent), transparent 72%),
    radial-gradient(64% 70% at 78% 100%, color-mix(in srgb, var(--tx-color-warning, #e6a23c) var(--wp-warning), transparent), transparent 72%),
    radial-gradient(56% 60% at 14% 104%, color-mix(in srgb, var(--tx-color-danger, #f56c6c) var(--wp-danger), transparent), transparent 72%),
    var(--tx-bg-color-page, #f2f3f5);
  inset: 0;
}

/* ─── desktop chrome ─── */

.launcher__menubar {
  position: relative;
  display: flex;
  height: 26px;
  flex: none;
  align-items: center;
  gap: 16px;
  padding: 0 14px;
  background: color-mix(in srgb, var(--tx-bg-color, #ffffff) 58%, transparent);
  -webkit-backdrop-filter: blur(18px);
  backdrop-filter: blur(18px);
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
}

.launcher__brand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--tx-text-color-primary, #303133);
  font-weight: 600;
}

.launcher__tray {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.launcher__tray i {
  font-size: 14px;
}

.launcher__stage {
  position: relative;
  display: flex;
  min-height: 0;
  flex: 1;
  align-items: flex-start;
  justify-content: center;
  padding: 26px 24px;
}

.launcher__window {
  width: min(700px, 100%);
  height: min(440px, 100%);
  border-radius: 18px;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--tx-text-color-primary, #303133) 12%, transparent),
    var(--tx-elevation-5, 6px 14px 40px rgba(0, 0, 0, 0.11));
}

/* The glass does the refraction; this tint is what keeps text readable over a
   busy wallpaper on every engine, including the blur-only fallback. */
.launcher__panel {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  border-radius: inherit;
  background: color-mix(in srgb, var(--tx-bg-color, #ffffff) 76%, transparent);
}

/* ─── search row ─── */

.launcher__search {
  display: flex;
  height: 58px;
  flex: none;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
}

.launcher__search :deep(.tx-input) {
  --fake-opacity: 0;

  height: 40px;
  padding: 0 2px;
  border: 0;
  background: transparent;
}

.launcher .launcher__search :deep(.tx-input:focus-within) {
  box-shadow: none;
}

.launcher__search :deep(.tx-input__inner) {
  font-size: 17px;
}

/* The chip already names the launcher; the field's own magnifier would be a
   second leading glyph. */
.launcher__search :deep(.tx-search-input__icon) {
  display: none;
}

.launcher__esc {
  flex: none;
  opacity: 0.7;
}

.launcher__scopes {
  flex: none;
  padding: 0 12px;
  box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--tx-text-color-primary, #303133) 8%, transparent);
}

/* ─── results + preview ─── */

.launcher__body {
  display: flex;
  min-height: 0;
  flex: 1;
}

.launcher__column {
  display: flex;
  width: 46%;
  min-width: 0;
  flex: none;
  flex-direction: column;
  box-shadow: inset -1px 0 0 color-mix(in srgb, var(--tx-text-color-primary, #303133) 8%, transparent);
}

.launcher__caption {
  padding: 10px 18px 4px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-weight: 500;
}

.launcher__list {
  position: relative;
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding: 2px 8px 8px;
  scrollbar-width: thin;
}

.launcher__option {
  display: flex;
  height: 46px;
  align-items: center;
  gap: 10px;
  padding: 0 8px 0 6px;
  border-radius: 10px;
  cursor: pointer;
}

.launcher__option.is-active {
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 14%, transparent);
}

.launcher__glyph {
  font-size: 13px;
}

.launcher__glyph--lg {
  font-size: 19px;
}

/* Brand logos carry their own colours; they sit on a plain plate. */
.launcher .launcher__glyph.is-logo {
  background: var(--tx-bg-color, #ffffff);
}

.launcher__option-text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
}

.launcher__option-title {
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.launcher__option-title mark {
  background: none;
  color: var(--tx-color-primary, #409eff);
}

.launcher__option-sub {
  overflow: hidden;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.launcher__kind {
  flex: none;
}

.launcher__quick {
  display: inline-flex;
  width: 36px;
  flex: none;
  justify-content: flex-end;
  opacity: 0.6;
}

.launcher__option.is-active .launcher__quick {
  opacity: 1;
}

.launcher__empty {
  display: flex;
  min-height: 0;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 0 12px 24px;
}

.launcher__empty-icon {
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-size: 28px;
}

.launcher__preview {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  padding: 18px 20px;
  overflow-y: auto;
}

.launcher__preview-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.launcher__preview-title {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.launcher__preview-title strong {
  overflow: hidden;
  font-size: 15px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.launcher__preview-title span {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

/* The docs' markdown sheet also matches `.markdown-body` and would set it at
   16px; the preview is a side panel and reads at 13px. */
.launcher__markdown :deep(.markdown-body) {
  color: var(--tx-text-color-regular, #606266);
  font-size: 13px;
  line-height: 1.65;
}

.launcher__markdown :deep(.markdown-body > :first-child) {
  margin-top: 0;
}

.launcher__markdown :deep(.markdown-body h3) {
  margin: 0 0 8px;
  color: var(--tx-text-color-primary, #303133);
  font-size: 16px;
}

.launcher__markdown :deep(.markdown-body blockquote) {
  margin: 0 0 10px;
  padding: 8px 12px;
  border-left-width: 3px;
  border-radius: 0 8px 8px 0;
}

.launcher__markdown :deep(.markdown-body pre) {
  margin: 0 0 10px;
  padding: 10px 12px;
}

/* ─── footer ─── */

.launcher__footer {
  display: flex;
  height: 40px;
  flex: none;
  align-items: center;
  gap: 12px;
  padding: 0 12px 0 16px;
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--tx-text-color-primary, #303133) 8%, transparent);
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.launcher__status {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  margin-right: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.launcher__status i {
  flex: none;
  color: var(--tx-color-success, #67c23a);
  font-size: 14px;
}

.launcher__hint {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
}

.launcher__hint--button {
  padding: 2px 4px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.launcher__hint--button:hover {
  background: color-mix(in srgb, var(--tx-text-color-primary, #303133) 6%, transparent);
  color: var(--tx-text-color-primary, #303133);
}

.launcher__hint--button:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

/* ─── dock (wide only) ─── */

.launcher__dock {
  position: absolute;
  bottom: 14px;
  left: 50%;
  display: none;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 20px;
  background: color-mix(in srgb, var(--tx-bg-color, #ffffff) 46%, transparent);
  -webkit-backdrop-filter: blur(18px);
  backdrop-filter: blur(18px);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--tx-text-color-primary, #303133) 10%, transparent),
    var(--tx-elevation-3, 2px 4px 14px rgba(0, 0, 0, 0.06));
  transform: translateX(-50%);
}

.launcher__dock-app {
  font-size: 19px;
}

.launcher__dock .launcher__dock-app:not(.is-ink) {
  background: var(--tx-bg-color, #ffffff);
}

.launcher__dock-divider {
  width: 1px;
  height: 28px;
  background: color-mix(in srgb, var(--tx-text-color-primary, #303133) 14%, transparent);
}

/* ─── wide ─── */

@container template (min-width: 960px) {
  .launcher__stage {
    padding-top: 48px;
  }

  .launcher__window {
    width: min(880px, 100%);
    height: min(560px, calc(100% - 96px));
  }

  .launcher__column {
    width: 380px;
  }

  .launcher__dock {
    display: flex;
  }
}

/* ─── narrow ─── */

@container template (max-width: 639px) {
  .launcher__menu,
  .launcher__tray i:not(:last-of-type) {
    display: none;
  }

  .launcher__stage {
    padding: 12px 10px;
  }

  .launcher__window {
    width: 100%;
    height: 100%;
  }

  .launcher__esc,
  .launcher__preview,
  .launcher__kind,
  .launcher__hint:not(.launcher__hint--button),
  .launcher__indexing {
    display: none;
  }

  .launcher__column {
    width: 100%;
    box-shadow: none;
  }

  .launcher__search :deep(.tx-input__inner) {
    font-size: 15px;
  }
}
</style>
