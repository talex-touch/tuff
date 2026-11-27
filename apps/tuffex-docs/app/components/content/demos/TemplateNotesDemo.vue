<script setup lang="ts">
import './TemplateNotesDemo.css'
// Notes template: a team notes app in the style of Notion or Bear — notebooks
// in a tree, one note in TxMarkdownEditor (the 0.9 rewrite: toolbar, slash
// menu, selection bar, comments, status bar), who is here, and the note's
// properties and activity once the stage is wide enough.
//
// What is real and what is sample data:
// - The editor, its comment threads and its collaboration adapter are the
//   component's real API. The two colleagues are scripted in the page, but
//   they arrive through the same `onPeers` / `onChanges` a server would call,
//   so carets, name tags, rebased history and comment anchors are the
//   editor's own behaviour, not a picture of it.
// - People, notes, dates and numbers are sample data, and the pages say so.
//   The AI rewrite is the docs site's local simulation (createDemoAi); no
//   model is called. Trigger words (「剪贴板」, `clipboard-history`, `s-fy`)
//   and ⌥Space come from the plugins' manifests and CoreBox.
//
// Playback runs once from `@enter`: Lin joins and types a to-do, then Zhou
// comments on it. Any pointer, key or focus inside the template takes over —
// Lin finishes the line she is on at once and nothing else is scheduled.
// Reduced motion gets the same end state synchronously.
//
// Nothing scripted focuses or scrolls. Remote edits only patch the editor's
// DOM and keep the reader's selection; the editor's `setSelection` / `insert`
// focus it, so the script never calls them. The editor's own scrolling (the
// comment sidebar, the slash menu) only follows the reader's actions.
import type {
  MarkdownEditorCollaboration,
  MarkdownEditorCollaborationHandlers,
  MarkdownEditorComment,
  MarkdownEditorPeer,
  MarkdownEditorSelection,
  MarkdownEditorToolbarActionKey,
  MarkdownEditorUser,
  MarkdownTextChange,
} from '@talex-touch/tuffex/markdown-editor'
import type { TreeKey, TreeNode } from '@talex-touch/tuffex/tree'
import { mapMarkdownPosition, markdownStats } from '@talex-touch/tuffex/markdown-editor'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, defineComponent, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { createDemoAi } from './markdown-editor-demo-host'
import { MARKDOWN_EDITOR_ZH_LABELS } from './markdown-editor-demo-labels'
import TemplateFrame from './TemplateFrame.vue'

type Mode = 'narrow' | 'column' | 'wide'
type Lang = 'zh' | 'en'
type PersonId = 'me' | 'lin' | 'zhou'
type NotebookId = 'sync' | 'plugins' | 'reading'
type TagId = 'sync' | 'corebox' | 'clipboard' | 'plugin' | 'roadmap' | 'reading' | 'translate'
/** Fixed sample times: nothing ticks, so the page reads the same on every visit. */
type Ago = 'now' | 'm12' | 'm40' | 'h2' | 'yesterday' | 'd3' | 'week'
type EventKind = 'created' | 'edited' | 'joined' | 'todo' | 'comment'

interface Bi { zh: string, en: string }

interface NoteEvent {
  id: number
  who: PersonId
  kind: EventKind
  ago: Ago
  quote?: string
  /** Happened while the page was open, so it animates in. */
  live?: boolean
}

interface Note {
  id: string
  notebook: NotebookId
  body: string
  comments: MarkdownEditorComment[]
  tags: TagId[]
  createdBy: PersonId
  created: Ago
  editedBy: PersonId
  edited: Ago
  events: NoteEvent[]
}

interface Seed extends Omit<Note, 'body' | 'comments' | 'events'> {
  /** Line for line the same in both languages: the simulated AI translates by line. */
  body: Bi
}

/** Where the two scripted colleagues are in the featured note. */
interface Room {
  linJoined: boolean
  lin: MarkdownEditorSelection | null
  zhou: MarkdownEditorSelection | null
  commented: boolean
}

/** The part of TxMarkdownEditor's exposed API this template calls. */
interface EditorHandle {
  focus: () => void
  getValue: () => string
}

// Scoped-slot values never reach <script setup>. This relays the stage's
// measured size into refs, so the toolbar and the drawer can follow it.
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
const lang = computed<Lang>(() => (zh.value ? 'zh' : 'en'))

function L(text: Bi): string {
  return text[lang.value]
}

function bi(zhText: string, en: string): Bi {
  return { zh: zhText, en }
}

function md(...lines: string[]): string {
  return lines.join('\n')
}

function prefersReducedMotion(): boolean {
  return hasWindow()
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* ─── Content ─────────────────────────────────────────────────────────── */

const MAIN = 'sync-1021'
const MINUTE = 60_000
const INITIAL_EXPANDED: TreeKey[] = ['nb:sync', 'nb:plugins']

// Darker than the editor demos' sky / orange so white initials stay legible.
const PEOPLE: Record<PersonId, { name: Bi, inline: Bi, color: string }> = {
  me: { name: bi('你', 'You'), inline: bi('你', 'you'), color: '#7c3aed' },
  lin: { name: bi('林夕', 'Lin'), inline: bi('林夕', 'Lin'), color: '#0284c7' },
  zhou: { name: bi('周屿', 'Zhou'), inline: bi('周屿', 'Zhou'), color: '#ea580c' },
}

const NOTEBOOKS: { id: NotebookId, label: Bi }[] = [
  { id: 'sync', label: bi('产品周会', 'Product sync') },
  { id: 'plugins', label: bi('插件草稿', 'Plugin drafts') },
  { id: 'reading', label: bi('读书笔记', 'Reading notes') },
]

const TAGS: Record<TagId, { label: Bi, color: string }> = {
  sync: { label: bi('周会', 'sync'), color: 'var(--tx-color-primary, #409eff)' },
  corebox: { label: bi('CoreBox', 'CoreBox'), color: 'var(--tx-color-success, #67c23a)' },
  clipboard: { label: bi('剪贴板', 'clipboard'), color: 'var(--tx-color-warning, #e6a23c)' },
  plugin: { label: bi('插件', 'plugin'), color: 'var(--tx-color-info, #909399)' },
  roadmap: { label: bi('路线图', 'roadmap'), color: 'var(--tx-color-primary, #409eff)' },
  reading: { label: bi('阅读', 'reading'), color: 'var(--tx-color-success, #67c23a)' },
  translate: { label: bi('翻译', 'translate'), color: 'var(--tx-color-warning, #e6a23c)' },
}

// To-dos come first in the featured note, so Lin's line lands inside the first
// screen of the editor in every band.
const SEEDS: Seed[] = [
  {
    id: MAIN,
    notebook: 'sync',
    tags: ['sync', 'corebox'],
    createdBy: 'zhou',
    created: 'yesterday',
    editedBy: 'me',
    edited: 'm12',
    body: {
      zh: md(
        '# 10·21 周会纪要',
        '',
        '> [!NOTE]',
        '> 示例数据：人物、日期、数字与进展均为虚构。',
        '',
        '## 待办',
        '',
        '- [x] 合并剪贴板的图片预览 :tada:',
        '- [ ] 截图翻译支持导入术语表',
        '',
        '## 进展',
        '',
        '- CoreBox 冷启动从 ==820 ms 降到 510 ms==',
        '- 剪贴板历史支持图片与富文本，「阅后即焚」进入内测',
        '- 截图翻译新增术语表，命中时优先用团队的译法',
        '',
        '## 讨论',
        '',
        '搜索结果按 $s = \\alpha f + (1 - \\alpha) r$ 排序，$\\alpha$ 暂定 0.6，下周用真实日志再调。',
      ),
      en: md(
        '# Oct 21 sync',
        '',
        '> [!NOTE]',
        '> Sample data: the people, dates, numbers and progress here are made up.',
        '',
        '## To do',
        '',
        '- [x] Merge the clipboard image preview :tada:',
        '- [ ] Glossary import for screenshot translate',
        '',
        '## Progress',
        '',
        '- CoreBox cold start went from ==820 ms to 510 ms==',
        '- Clipboard history handles images and rich text; Burn after reading is in internal testing',
        '- Screenshot translate has a glossary, and the team’s terms win when they match',
        '',
        '## Discussion',
        '',
        'Results rank by $s = \\alpha f + (1 - \\alpha) r$, with $\\alpha$ at 0.6 for now; we tune it on real logs next week.',
      ),
    },
  },
  {
    id: 'sync-retro',
    notebook: 'sync',
    tags: ['sync', 'corebox'],
    createdBy: 'me',
    created: 'd3',
    editedBy: 'zhou',
    edited: 'h2',
    body: {
      zh: md(
        '# CoreBox 2.5 复盘',
        '',
        '> [!NOTE]',
        '> 示例数据，不代表真实的版本记录。',
        '',
        '## 做得好的',
        '',
        '- 增量索引让 ==首次搜索不再卡顿==',
        '- 功能冻结后，回归缺陷少了一半',
        '',
        '## 要改进的',
        '',
        '> [!WARNING]',
        '> Windows 托盘图标在高分屏上发虚，计划在 2.5.1 修复。',
        '',
        '- [ ] 整理插件市场的审核清单',
      ),
      en: md(
        '# CoreBox 2.5 retro',
        '',
        '> [!NOTE]',
        '> Sample data, not a real release record.',
        '',
        '## What went well',
        '',
        '- Incremental indexing means ==the first search no longer stalls==',
        '- The feature freeze halved regressions',
        '',
        '## What to improve',
        '',
        '> [!WARNING]',
        '> The Windows tray icon is blurry on HiDPI screens; planned for 2.5.1.',
        '',
        '- [ ] Write a review checklist for the plugin market',
      ),
    },
  },
  {
    id: 'sync-q4',
    notebook: 'sync',
    tags: ['roadmap'],
    createdBy: 'lin',
    created: 'week',
    editedBy: 'lin',
    edited: 'd3',
    body: {
      zh: md(
        '# Q4 路线图草稿',
        '',
        '> [!IMPORTANT]',
        '> 示例数据，不代表真实计划。',
        '',
        '1. 自然语言指令：直接告诉 CoreBox 要做什么',
        '2. 剪贴板跨设备同步',
        '3. 插件签名与权限面板',
        '',
        '| 项目 | 负责人 | 状态 |',
        '| --- | --- | --- |',
        '| 自然语言指令 | 林夕 | 设计中 |',
        '| 跨设备同步 | 周屿 | 调研中 |',
        '| 插件签名 | 你 | 未开始 |',
      ),
      en: md(
        '# Q4 roadmap draft',
        '',
        '> [!IMPORTANT]',
        '> Sample data, not a real plan.',
        '',
        '1. Natural-language commands: tell CoreBox what to do',
        '2. Clipboard sync across devices',
        '3. Plugin signing and a permissions panel',
        '',
        '| Project | Owner | Status |',
        '| --- | --- | --- |',
        '| Natural-language commands | Lin | Designing |',
        '| Cross-device sync | Zhou | Researching |',
        '| Plugin signing | You | Not started |',
      ),
    },
  },
  {
    id: 'plug-burn',
    notebook: 'plugins',
    tags: ['clipboard', 'plugin'],
    createdBy: 'lin',
    created: 'd3',
    editedBy: 'me',
    edited: 'yesterday',
    body: {
      zh: md(
        '# 剪贴板历史：阅后即焚',
        '',
        '带 `secret` 标记的复制内容，粘贴一次就从历史里移除。',
        '',
        '- [x] 识别密码管理器写入的标记',
        '- [ ] 粘贴后清空系统剪贴板',
        '- [ ] 在设置里加一个开关',
        '',
        '> [!TIP]',
        '> 在 CoreBox 输入「剪贴板」即可打开剪贴板历史。',
      ),
      en: md(
        '# Clipboard history: burn after reading',
        '',
        'A copy marked `secret` leaves the history after one paste.',
        '',
        '- [x] Detect the marker password managers write',
        '- [ ] Clear the system clipboard after pasting',
        '- [ ] Add a switch in settings',
        '',
        '> [!TIP]',
        '> Type `clipboard-history` in CoreBox to open clipboard history.',
      ),
    },
  },
  {
    id: 'plug-ocr',
    notebook: 'plugins',
    tags: ['translate', 'plugin'],
    createdBy: 'zhou',
    created: 'week',
    editedBy: 'zhou',
    edited: 'd3',
    body: {
      zh: md(
        '# 截图翻译术语表',
        '',
        '术语表里的词优先于机器译法。在 CoreBox 输入 `s-fy` 开始截图翻译。',
        '',
        '| 原文 | 译法 |',
        '| --- | --- |',
        '| Manifest | 清单文件 |',
        '| Prelude | 先导脚本 |',
        '| Surface | 展面 |',
      ),
      en: md(
        '# Screenshot translate glossary',
        '',
        'Glossary terms beat the machine translation. Type `s-fy` in CoreBox to start one.',
        '',
        '| Source | Translation |',
        '| --- | --- |',
        '| 清单文件 | Manifest |',
        '| 先导脚本 | Prelude |',
        '| 展面 | Surface |',
      ),
    },
  },
  {
    id: 'read-doet',
    notebook: 'reading',
    tags: ['reading'],
    createdBy: 'me',
    created: 'week',
    editedBy: 'me',
    edited: 'week',
    body: {
      zh: md(
        '# 《设计心理学》笔记',
        '',
        '大意：好的设计让人一看就知道怎么用。',
        '',
        '- **示能**：物体本身提示该怎么用',
        '- **反馈**：每个操作都马上有回应',
        '',
        '对 CoreBox 的启发：按下 ⌥Space 后，==输入框立刻就能打字==。',
      ),
      en: md(
        '# The Design of Everyday Things',
        '',
        'Paraphrased: good design shows you how to use it at a glance.',
        '',
        '- **Affordance**: the object itself suggests how to use it',
        '- **Feedback**: every action gets an immediate response',
        '',
        'For CoreBox: after ⌥Space, ==the box takes typing at once==.',
      ),
    },
  },
]

/** Every string the script looks for is a slice of the featured note. */
const SCRIPT = {
  zh: {
    after: '截图翻译支持导入术语表',
    line: '周五前把「阅后即焚」合进 beta',
    quote: '周五前',
    comment: '周五下午有 QA 回归，我把测试排到周四。',
    zhouRest: '「阅后即焚」进入内测',
    thread: { quote: '820 ms 降到 510 ms', body: '冷缓存还是热缓存？两种都记一下吧。', reply: '冷缓存。热缓存一直在 120 ms 左右。' },
  },
  en: {
    after: 'Glossary import for screenshot translate',
    line: 'Ship Burn after reading to beta by Friday',
    quote: 'by Friday',
    comment: 'QA regression is Friday afternoon, so I moved testing to Thursday.',
    zhouRest: 'Burn after reading is in internal testing',
    thread: { quote: '820 ms to 510 ms', body: 'Cold or warm cache? Worth logging both.', reply: 'Cold. Warm has been around 120 ms all along.' },
  },
}

const COPY = {
  zh: {
    frameTitle: '协作笔记',
    space: 'Tuff 团队空间',
    filter: '搜索笔记',
    newNote: '新建笔记',
    untitled: '未命名笔记',
    noMatch: '没有匹配的笔记',
    navLabel: '笔记本',
    navFoot: '示例数据：修改不会保存，AI 改写在本地模拟。',
    openNav: '打开笔记本',
    closeNav: '关闭笔记本',
    crumbs: '笔记位置',
    share: '分享',
    shared: '示例：已生成只读分享链接',
    editorLabel: '笔记正文',
    placeholder: '输入标题，或按 / 插入块…',
    panel: '笔记信息',
    properties: '属性',
    props: { createdBy: '创建者', notebook: '笔记本', updated: '更新于', words: '字数', comments: '评论', tags: '标签' },
    activity: '动态',
    toastLabel: '笔记动态',
    dismiss: '关闭提示',
    ago: { now: '刚刚', m12: '12 分钟前', m40: '40 分钟前', h2: '2 小时前', yesterday: '昨天', d3: '3 天前', week: '上周' },
    events: { created: '创建了这篇笔记', edited: '编辑了这篇笔记', joined: '加入了编辑', todo: '添加了一条待办' },
    commentedOn: (quote: string) => `评论了「${quote}」`,
    commented: (who: string, quote: string) => `${who} 评论了「${quote}」`,
    presence: (names: string[]) => `正在查看：${names.join('、')}`,
    edited: (ago: string, who: string) => `${ago}由${who}编辑`,
    updated: (ago: string, who: string) => `${ago} · ${who}`,
    threads: (count: number) => (count ? `${count} 条未解决` : '无'),
  },
  en: {
    frameTitle: 'Notes',
    space: 'Tuff team space',
    filter: 'Search notes',
    newNote: 'New note',
    untitled: 'Untitled',
    noMatch: 'No matching notes',
    navLabel: 'Notebooks',
    navFoot: 'Sample data: edits aren’t saved, and AI rewrites are simulated locally.',
    openNav: 'Open notebooks',
    closeNav: 'Close notebooks',
    crumbs: 'Note location',
    share: 'Share',
    shared: 'Sample: read-only share link created',
    editorLabel: 'Note body',
    placeholder: 'Start with a title, or press / for blocks…',
    panel: 'Note info',
    properties: 'Properties',
    props: { createdBy: 'Created by', notebook: 'Notebook', updated: 'Updated', words: 'Words', comments: 'Comments', tags: 'Tags' },
    activity: 'Activity',
    toastLabel: 'Note activity',
    dismiss: 'Dismiss',
    ago: { now: 'just now', m12: '12 min ago', m40: '40 min ago', h2: '2 h ago', yesterday: 'yesterday', d3: '3 days ago', week: 'last week' },
    events: { created: 'created this note', edited: 'edited this note', joined: 'joined', todo: 'added a to-do' },
    commentedOn: (quote: string) => `commented on “${quote}”`,
    commented: (who: string, quote: string) => `${who} commented on “${quote}”`,
    presence: (names: string[]) => `Here now: ${names.join(', ')}`,
    edited: (ago: string, who: string) => `Edited ${ago} by ${who}`,
    updated: (ago: string, who: string) => `${ago} · ${who}`,
    threads: (count: number) => (count ? `${count} open` : 'None'),
  },
}

const copy = computed(() => COPY[lang.value])
const script = computed(() => SCRIPT[lang.value])
const labels = computed(() => (zh.value ? MARKDOWN_EDITOR_ZH_LABELS : undefined))

function personName(id: PersonId): string {
  return L(PEOPLE[id].name)
}

function personInline(id: PersonId): string {
  return L(PEOPLE[id].inline)
}

function user(id: PersonId): MarkdownEditorUser {
  return { id, name: personName(id), color: PEOPLE[id].color }
}

function seedBody(id: string, language: Lang = lang.value): string {
  return SEEDS.find(seed => seed.id === id)?.body[language] ?? ''
}

function caret(pos: number): MarkdownEditorSelection {
  return { anchor: pos, head: pos }
}

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

// Sized so the toolbar keeps to two rows (actions, then comments and modes) at
// the editor widths each band leaves; the bar wraps by itself beyond that.
const COMPACT: MarkdownEditorToolbarActionKey[] = ['heading', 'bold', 'highlight', 'taskList', 'link', 'undo']
const STANDARD: MarkdownEditorToolbarActionKey[] = ['heading', 'bold', 'italic', 'highlight', 'bulletList', 'taskList', 'link', 'codeBlock', 'emoji', 'undo', 'redo']
const FULL: MarkdownEditorToolbarActionKey[] = ['heading', 'bold', 'italic', 'strike', 'highlight', 'quote', 'bulletList', 'taskList', 'link', 'table', 'codeBlock', 'math', 'emoji', 'undo', 'redo']

const toolbarActions = computed(() => {
  if (mode.value === 'narrow')
    return COMPACT
  return mode.value === 'wide' && stageWidth.value >= 1200 ? FULL : STANDARD
})

/* ─── State ───────────────────────────────────────────────────────────── */

let noteIds = 0
let eventIds = 0
let commentIds = 0

function seedNotes(): Note[] {
  return SEEDS.map((seed) => {
    const note: Note = {
      ...seed,
      body: seed.body[lang.value],
      comments: [],
      tags: [...seed.tags],
      events: [
        { id: ++eventIds, who: seed.editedBy, kind: 'edited', ago: seed.edited },
        { id: ++eventIds, who: seed.createdBy, kind: 'created', ago: seed.created },
      ],
    }
    if (seed.id === MAIN)
      seedThread(note)
    return note
  })
}

/** Lin's question on the perf numbers, with your answer. Only the sidebar shows the times. */
function seedThread(note: Note): void {
  const { thread } = script.value
  const from = note.body.indexOf(thread.quote)
  if (from < 0)
    return
  const now = Date.now()
  note.comments = [{
    id: 'c-cache',
    from,
    to: from + thread.quote.length,
    quote: thread.quote,
    author: user('lin'),
    body: thread.body,
    createdAt: now - 40 * MINUTE,
    replies: [{ id: 'r-cache', author: user('me'), body: thread.reply, createdAt: now - 35 * MINUTE }],
  }]
  note.events.splice(1, 0, { id: ++eventIds, who: 'lin', kind: 'comment', ago: 'm40', quote: thread.quote })
}

/** Zhou is already reading the featured note, his caret at the end of a progress line. */
function seedRoom(): Room {
  const body = seedBody(MAIN)
  const rest = script.value.zhouRest
  const at = body.indexOf(rest)
  return { linJoined: false, lin: null, zhou: at < 0 ? null : caret(at + rest.length), commented: false }
}

const notes = ref<Note[]>(seedNotes())
const activeId = ref(MAIN)
const expanded = ref<TreeKey[]>([...INITIAL_EXPANDED])
const query = ref('')
const navOpen = ref(false)
/** Bumped on reset: remounts the editor on a fresh document. */
const generation = ref(0)
const room = reactive<Room>(seedRoom())
const linJoining = ref(false)

const navRef = ref<HTMLElement | null>(null)
const menuButtonRef = ref<HTMLButtonElement | null>(null)
const editorRef = ref<EditorHandle | null>(null)

function noteById(id: string): Note | undefined {
  return notes.value.find(note => note.id === id)
}

/** The first line with text, without its Markdown markers: what the tree and the breadcrumb call a note. */
function titleOf(body: string): string {
  for (const line of body.split('\n')) {
    const text = line
      .replace(/^\s*(?:#{1,6}\s+|(?:>\s*)+|[-*+]\s+(?:\[[ x]\]\s+)?|\d+[.)]\s+)?/i, '')
      .replace(/[*_~`=]/g, '')
      .trim()
    if (text)
      return text.length > 40 ? `${text.slice(0, 39)}…` : text
  }
  return ''
}

function noteTitle(note: Note): string {
  return titleOf(note.body) || copy.value.untitled
}

const activeNote = computed(() => noteById(activeId.value) ?? notes.value[0]!)
const activeTitle = computed(() => noteTitle(activeNote.value))
const activeNotebook = computed(() => NOTEBOOKS.find(item => item.id === activeNote.value.notebook) ?? NOTEBOOKS[0]!)
const me = computed(() => user('me'))

function peersIn(key: TreeKey): PersonId[] {
  if (key !== MAIN)
    return []
  return room.linJoined ? ['zhou', 'lin'] : ['zhou']
}

const treeNodes = computed<TreeNode[]>(() => NOTEBOOKS.map(notebook => ({
  key: `nb:${notebook.id}`,
  label: L(notebook.label),
  leaf: false,
  children: notes.value
    .filter(note => note.notebook === notebook.id)
    .map(note => ({ key: note.id, label: noteTitle(note) })),
})))

const crumbs = computed(() => mode.value === 'narrow'
  ? [{ label: activeTitle.value }]
  : [{ label: L(activeNotebook.value.label) }, { label: activeTitle.value }])

const present = computed<PersonId[]>(() => ['me', ...peersIn(activeId.value)])
const presenceLabel = computed(() => copy.value.presence(present.value.map(personInline)))
const editedLine = computed(() => copy.value.edited(copy.value.ago[activeNote.value.edited], personInline(activeNote.value.editedBy)))
const openThreads = computed(() => activeNote.value.comments.filter(comment => !comment.resolved).length)
const events = computed(() => activeNote.value.events.slice(0, 5))

function eventText(entry: NoteEvent): string {
  return entry.kind === 'comment' ? copy.value.commentedOn(entry.quote ?? '') : copy.value.events[entry.kind]
}

const words = computed(() => markdownStats(activeNote.value.body).words)

/* ─── Collaboration ───────────────────────────────────────────────────── */

let handlers: MarkdownEditorCollaborationHandlers | null = null

function peersFor(id: string): MarkdownEditorPeer[] {
  const peer = (who: PersonId, selection: MarkdownEditorSelection | null): MarkdownEditorPeer =>
    ({ ...user(who), selection: selection && { ...selection }, mode: 'wysiwyg' })
  return peersIn(id).map(who => peer(who, who === 'lin' ? room.lin : room.zhou))
}

/** Everyone else in the open note; the editor keeps its own copy and maps it through every edit. */
function announce(): void {
  handlers?.onPeers?.(peersFor(activeId.value))
}

/** The same mapping the editor applies to its peers, so an announced caret it already moved is not a "move". */
function mapSelection(selection: MarkdownEditorSelection | null, changes: readonly MarkdownTextChange[]): MarkdownEditorSelection | null {
  return selection && {
    anchor: mapMarkdownPosition(selection.anchor, changes, 1),
    head: mapMarkdownPosition(selection.head, changes, 1),
  }
}

// One adapter for the whole session: a new object would restart it, and every
// note's editor (remounted per note) subscribes to it in turn. No
// `sendPresence`, so the editor runs no presence timer for a room this small.
const collaboration: MarkdownEditorCollaboration = {
  send(changes) {
    const id = activeId.value
    if (id === MAIN) {
      room.lin = mapSelection(room.lin, changes)
      room.zhou = mapSelection(room.zhou, changes)
    }
    markEdited(id, 'me')
  },
  subscribe(next) {
    handlers = next
    next.onPeers?.(peersFor(activeId.value))
    return () => {
      if (handlers === next)
        handlers = null
    }
  },
}

function docOf(id: string): string {
  return activeId.value === id && editorRef.value ? editorRef.value.getValue() : noteById(id)?.body ?? ''
}

function afterLineEnd(doc: string): number {
  const at = doc.indexOf(script.value.after)
  return at < 0 ? doc.length : at + script.value.after.length
}

/** Lin types `text` at her caret: one remote change, delivered as a server would. */
function peerInsert(text: string): void {
  // The script only runs while the featured note is open: any click ends it.
  if (!handlers || activeId.value !== MAIN)
    return
  const doc = docOf(MAIN)
  const at = Math.min(room.lin?.head ?? afterLineEnd(doc), doc.length)
  const changes: MarkdownTextChange[] = [{ from: at, to: at, insert: text }]
  room.lin = caret(at + text.length)
  room.zhou = mapSelection(room.zhou, changes)
  // The editor rebases its undo history, maps comments and carets, and emits v-model.
  handlers.onChanges(changes)
  announce()
}

/**
 * The simulated AI translates by matching lines between the note's two
 * samples, so Lin's to-do joins both, at the same line, once she has written it.
 */
function aiSamples(): readonly [string, string] {
  const id = activeId.value
  const withTodo = (language: Lang): string => {
    const body = seedBody(id, language)
    const { after, line } = SCRIPT[language]
    const at = body.indexOf(after)
    if (id !== MAIN || !typing.logged || at < 0)
      return body
    return `${body.slice(0, at + after.length)}\n- [ ] ${line}${body.slice(at + after.length)}`
  }
  return [withTodo('zh'), withTodo('en')]
}

const ai = createDemoAi(aiSamples)

/* ─── Notes ───────────────────────────────────────────────────────────── */

function pushEvent(note: Note, who: PersonId, kind: EventKind, quote?: string): void {
  note.events.unshift({ id: ++eventIds, who, kind, ago: 'now', quote, live: true })
  note.events.splice(8)
}

function markEdited(id: string, who: PersonId): void {
  const note = noteById(id)
  if (!note)
    return
  note.editedBy = who
  note.edited = 'now'
  const top = note.events[0]
  // A burst of typing is one "edited" entry, not one per keystroke.
  if (who === 'me' && !(top?.who === 'me' && top.kind === 'edited' && top.ago === 'now'))
    pushEvent(note, 'me', 'edited')
}

function onCommentCreate(comment: MarkdownEditorComment): void {
  pushEvent(activeNote.value, 'me', 'comment', comment.quote)
}

function expandNotebook(notebook: NotebookId): void {
  const key = `nb:${notebook}`
  if (!expanded.value.includes(key))
    expanded.value = [...expanded.value, key]
}

function openNote(id: string): void {
  const note = noteById(id)
  if (!note)
    return
  expandNotebook(note.notebook)
  activeId.value = id
  // From the slide-over panel the tree goes inert as it closes: focus returns to the button that opened it.
  closeNav()
}

function onTreeSelect(payload: { key: TreeKey, node: TreeNode }): void {
  const key = String(payload.key)
  if (key.startsWith('nb:')) {
    expanded.value = expanded.value.includes(key) ? expanded.value.filter(item => item !== key) : [...expanded.value, key]
    return
  }
  openNote(key)
}

function matchNote(node: TreeNode, needle: string): boolean {
  const lowered = needle.toLowerCase()
  if (node.label.toLowerCase().includes(lowered))
    return true
  const note = noteById(String(node.key))
  return !!note && note.body.toLowerCase().includes(lowered)
}

/** The notebook crumb shows that notebook in the tree, on its own. */
function onCrumb(_item: unknown, index: number): void {
  if (index !== 0)
    return
  query.value = ''
  expanded.value = [`nb:${activeNote.value.notebook}`]
}

function newNote(): void {
  const notebook = activeNote.value.notebook
  const id = `note-${++noteIds}`
  notes.value.unshift({
    id,
    notebook,
    body: '',
    comments: [],
    tags: [],
    createdBy: 'me',
    created: 'now',
    editedBy: 'me',
    edited: 'now',
    events: [{ id: ++eventIds, who: 'me', kind: 'created', ago: 'now', live: true }],
  })
  query.value = ''
  expandNotebook(notebook)
  navOpen.value = false
  activeId.value = id
  // The reader's own click: the fresh editor takes the typing.
  void nextTick(() => editorRef.value?.focus())
}

function share(): void {
  openToast(copy.value.shared, 'i-carbon-link')
}

/* ─── Drawer (below 640px) ────────────────────────────────────────────── */

function openNav(): void {
  navOpen.value = true
  void nextTick(() => navRef.value?.focus({ preventScroll: true }))
}

function closeNav(): void {
  if (!navOpen.value)
    return
  navOpen.value = false
  void nextTick(() => menuButtonRef.value?.focus({ preventScroll: true }))
}

watch(mode, (next) => {
  if (next !== 'narrow')
    navOpen.value = false
})

/* ─── Toast ───────────────────────────────────────────────────────────── */

const TOAST_MS = 4200
const TOAST_REARM_MS = 2000

const toast = reactive({ open: false, text: '', icon: 'i-carbon-chat' })
let toastTimer: ReturnType<typeof setTimeout> | undefined
let toastHovered = false
let toastFocused = false

function armToast(ms: number): void {
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.open = false
  }, ms)
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
    armToast(TOAST_REARM_MS)
}

function onToastFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null
  if (!next || !(event.currentTarget as HTMLElement).contains(next))
    releaseToast('focus')
}

function openToast(text: string, icon: string): void {
  toast.text = text
  toast.icon = icon
  toast.open = true
  if (toastHovered || toastFocused)
    clearTimeout(toastTimer)
  else
    armToast(TOAST_MS)
}

function closeToast(): void {
  clearTimeout(toastTimer)
  toast.open = false
  toastHovered = false
  toastFocused = false
}

/* ─── Playback ────────────────────────────────────────────────────────── */

let entered = false
let playing = false
let tookOver = false
let typing = { chunks: [] as string[], index: 0, logged: false }
let timers: ReturnType<typeof setTimeout>[] = []

function later(ms: number, run: () => void): void {
  const id = setTimeout(() => {
    timers = timers.filter(timer => timer !== id)
    run()
  }, ms)
  timers.push(id)
}

function clearTimers(): void {
  for (const id of timers)
    clearTimeout(id)
  timers = []
}

/**
 * The gap after each character. The line takes under two seconds in either
 * language, so it ends while Lin's name tag (2.5 s from her last move) is
 * still up; a fixed wobble keeps it from reading as a metronome.
 */
function pace(index: number, count: number): number {
  const base = Math.min(110, Math.max(40, Math.round(1700 / Math.max(1, count - 1))))
  return base + (((index * 7) % 5) - 2) * 9
}

function linJoins(): void {
  const doc = docOf(MAIN)
  const at = doc.indexOf(script.value.after)
  room.linJoined = true
  room.lin = caret(at < 0 ? doc.length : at)
  linJoining.value = true
  pushEvent(noteById(MAIN)!, 'lin', 'joined')
  announce()
}

/** A real move: carets the editor only maps through edits keep their old tag time, so this restarts it. */
function linMovesToLineEnd(): void {
  linJoining.value = false
  room.lin = caret(afterLineEnd(docOf(MAIN)))
  announce()
}

function linTypes(index: number): void {
  peerInsert(typing.chunks[index]!)
  typing.index = index + 1
}

function linDone(): void {
  if (typing.logged)
    return
  typing.logged = true
  markEdited(MAIN, 'lin')
  pushEvent(noteById(MAIN)!, 'lin', 'todo')
}

function quoteRange(): { from: number, to: number } | null {
  const { line, quote } = script.value
  const at = docOf(MAIN).indexOf(line)
  if (at < 0)
    return null
  const from = at + line.indexOf(quote)
  return { from, to: from + quote.length }
}

function zhouSelects(): void {
  const range = quoteRange()
  if (!range)
    return
  room.zhou = { anchor: range.from, head: range.to }
  announce()
}

function zhouComments(withToast: boolean): void {
  const note = noteById(MAIN)
  const range = quoteRange()
  playing = false
  if (!note || !range || room.commented)
    return
  const { quote, comment } = script.value
  room.commented = true
  note.comments = [...note.comments, {
    id: `c-zhou-${++commentIds}`,
    from: range.from,
    to: range.to,
    quote,
    author: user('zhou'),
    body: comment,
    createdAt: Date.now(),
  }]
  room.zhou = caret(range.to)
  pushEvent(note, 'zhou', 'comment', quote)
  announce()
  if (withToast)
    openToast(copy.value.commented(personName('zhou'), quote), 'i-carbon-chat')
}

function start(): void {
  clearTimers()
  if (tookOver || room.commented)
    return
  const chunks = ['\n- [ ] ', ...Array.from(script.value.line)]
  typing = { chunks, index: 0, logged: false }
  if (prefersReducedMotion()) {
    finish()
    return
  }
  playing = true
  let at = 700
  later(at, linJoins)
  at += 650
  later(at, linMovesToLineEnd)
  at += 350
  chunks.forEach((_, index) => {
    later(at, () => linTypes(index))
    // A beat after Enter, as the new checkbox appears.
    at += index === 0 ? 280 : pace(index, chunks.length)
  })
  later(at + 300, linDone)
  later(at + 1200, zhouSelects)
  later(at + 2200, () => zhouComments(true))
}

/** Reduced motion: where the script ends, at once — Lin's line and Zhou's comment, no toast. */
function finish(): void {
  linJoins()
  linJoining.value = false
  room.lin = caret(afterLineEnd(docOf(MAIN)))
  peerInsert(typing.chunks.join(''))
  typing.index = typing.chunks.length
  linDone()
  zhouComments(false)
}

/** The reader's first pointer, key or focus inside the template ends the script. */
function takeOver(): void {
  if (tookOver)
    return
  tookOver = true
  if (!playing)
    return
  playing = false
  clearTimers()
  linJoining.value = false
  const { chunks, index } = typing
  // Mid-line, Lin finishes her sentence at once rather than leaving half a to-do.
  if (index > 0 && index < chunks.length) {
    peerInsert(chunks.slice(index).join(''))
    typing.index = chunks.length
  }
  if (typing.index === chunks.length)
    linDone()
  // A phrase Zhou had selected for his comment collapses to a caret.
  if (room.zhou && room.zhou.anchor !== room.zhou.head)
    room.zhou = caret(room.zhou.head)
  announce()
}

function onEnter(): void {
  entered = true
  start()
}

/* ─── Keyboard ────────────────────────────────────────────────────────── */

function onRootKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.defaultPrevented || !navOpen.value)
    return
  // Closing the panel is this press's whole job; the overlay stays open.
  event.preventDefault()
  closeNav()
}

/* ─── Reset ───────────────────────────────────────────────────────────── */

function resetDemo(): void {
  clearTimers()
  closeToast()
  playing = false
  tookOver = false
  typing = { chunks: [], index: 0, logged: false }
  notes.value = seedNotes()
  Object.assign(room, seedRoom())
  linJoining.value = false
  activeId.value = MAIN
  expanded.value = [...INITIAL_EXPANDED]
  query.value = ''
  navOpen.value = false
  generation.value++
  // After the remount, so the new editor has subscribed before Lin arrives.
  if (entered)
    void nextTick(start)
}

defineExpose({ resetDemo })

watch(locale, () => resetDemo())

onBeforeUnmount(() => {
  clearTimers()
  clearTimeout(toastTimer)
  handlers = null
})
</script>

<template>
  <TemplateFrame :title="copy.frameTitle" :height="600" @enter="onEnter">
    <template #default="{ width: stageW, height: stageH }">
      <StageSize :width="stageW" :height="stageH" @resize="onStageResize" />
      <div
        class="tpl-notes"
        :class="`is-${mode}`"
        @pointerdown.capture="takeOver"
        @keydown.capture="takeOver"
        @focusin="takeOver"
        @keydown="onRootKeydown"
      >
        <!-- One tree for every width: a column beside the note, or a panel
             that slides over it below 640px (not TxDrawer, which would take
             Tab and Escape on the whole document). -->
        <div v-if="mode === 'narrow'" class="tpl-notes__scrim" :class="{ 'is-open': navOpen }" aria-hidden="true" @click="closeNav" />
        <aside
          ref="navRef"
          class="tpl-notes__nav"
          :class="{ 'is-drawer': mode === 'narrow', 'is-open': navOpen }"
          :aria-label="copy.navLabel"
          :tabindex="mode === 'narrow' ? -1 : undefined"
          :inert="mode === 'narrow' && !navOpen ? true : undefined"
        >
          <div class="tpl-notes__nav-head">
            <span class="tpl-notes__space-mark" aria-hidden="true"><span class="i-carbon-collaborate" /></span>
            <strong class="tpl-notes__space">{{ copy.space }}</strong>
            <button v-if="mode === 'narrow'" type="button" class="tpl-notes__icon-button" :aria-label="copy.closeNav" @click="closeNav">
              <span class="i-carbon-close" aria-hidden="true" />
            </button>
          </div>
          <div class="tpl-notes__nav-tools">
            <TxSearchInput v-model="query" :placeholder="copy.filter" :aria-label="copy.filter" />
            <TxButton size="sm" variant="secondary" icon="i-carbon-add" block @click="newNote">
              {{ copy.newNote }}
            </TxButton>
          </div>
          <div class="tpl-notes__tree">
            <TxTree
              :nodes="treeNodes"
              :model-value="activeId"
              :expanded-keys="expanded"
              :filter-text="query"
              :filter-method="matchNote"
              :indent="14"
              :aria-label="copy.navLabel"
              @update:expanded-keys="expanded = $event"
              @select="onTreeSelect"
            >
              <template #item="{ node, expanded: open, hasChildren, toggleExpand }">
                <div
                  class="tpl-notes-row"
                  :class="{ 'is-notebook': hasChildren, 'is-current': node.key === activeId }"
                  :title="node.label"
                >
                  <span
                    v-if="hasChildren"
                    class="tpl-notes-row__caret i-carbon-chevron-right"
                    :class="{ 'is-open': open }"
                    aria-hidden="true"
                    @click.stop="toggleExpand()"
                  />
                  <span class="tpl-notes-row__icon" :class="hasChildren ? 'i-carbon-notebook' : 'i-carbon-document'" aria-hidden="true" />
                  <span class="tpl-notes-row__label">{{ node.label }}</span>
                  <span v-if="hasChildren" class="tpl-notes-row__count">{{ node.children?.length ?? 0 }}</span>
                  <span v-else-if="peersIn(node.key).length" class="tpl-notes-row__peers" aria-hidden="true">
                    <span
                      v-for="id in peersIn(node.key)"
                      :key="id"
                      class="tpl-notes-row__peer"
                      :style="{ background: PEOPLE[id].color }"
                    />
                  </span>
                </div>
              </template>
              <template #empty>
                <p class="tpl-notes-empty">
                  {{ copy.noMatch }}
                </p>
              </template>
            </TxTree>
          </div>
          <p class="tpl-notes__nav-foot">
            {{ copy.navFoot }}
          </p>
        </aside>

        <section class="tpl-notes__main" :aria-label="activeTitle">
          <header class="tpl-notes__head">
            <button
              v-if="mode === 'narrow'"
              ref="menuButtonRef"
              type="button"
              class="tpl-notes__icon-button"
              :aria-label="copy.openNav"
              :aria-expanded="navOpen ? 'true' : 'false'"
              @click="openNav"
            >
              <span class="i-carbon-menu" aria-hidden="true" />
            </button>
            <!-- TxBreadcrumb hardcodes aria-label="Breadcrumb"; the attribute here replaces it. -->
            <TxBreadcrumb class="tpl-notes__crumbs" :items="crumbs" :aria-label="copy.crumbs" @click="onCrumb" />
            <span v-if="mode !== 'narrow'" class="tpl-notes__edited">
              <span class="i-carbon-time" aria-hidden="true" />
              <span class="tpl-notes__edited-text">{{ editedLine }}</span>
            </span>
            <span class="tpl-notes__people" role="group" :aria-label="presenceLabel">
              <TxAvatarGroup :max="4" :size="24" :overlap="6">
                <TxAvatar
                  v-for="id in present"
                  :key="id"
                  class="tpl-notes__avatar"
                  :class="{ 'is-joining': id === 'lin' && linJoining }"
                  :name="personName(id)"
                  :background-color="PEOPLE[id].color"
                  text-color="#fff"
                />
              </TxAvatarGroup>
            </span>
            <TxButton v-if="mode !== 'narrow'" class="tpl-notes__share" size="sm" variant="secondary" icon="i-carbon-share" @click="share">
              {{ copy.share }}
            </TxButton>
            <TxIconButton v-else icon="i-carbon-share" size="sm" :label="copy.share" @click="share" />
          </header>

          <div class="tpl-notes__doc">
            <!-- Keyed per note: each note gets its own document, history and
                 subscription, and a remount re-announces who is here. -->
            <TxMarkdownEditor
              :key="`${activeId}:${generation}`"
              ref="editorRef"
              v-model="activeNote.body"
              v-model:comments="activeNote.comments"
              class="tpl-notes__editor"
              :labels="labels"
              :placeholder="copy.placeholder"
              :aria-label="copy.editorLabel"
              :toolbar-actions="toolbarActions"
              :user="me"
              :collaboration="collaboration"
              :ai="ai"
              :min-height="0"
              @comment-create="onCommentCreate"
            />
          </div>

          <!-- TxToastPanel fades rather than unmounts, so the wrapper is inert while closed. -->
          <div
            class="tpl-notes__toast"
            :class="{ 'is-open': toast.open }"
            :inert="toast.open ? undefined : true"
            @mouseenter="holdToast('hover')"
            @mouseleave="releaseToast('hover')"
            @focusin="holdToast('focus')"
            @focusout="onToastFocusOut"
          >
            <TxToastPanel :open="toast.open" :tether="false" :stack="0" :aria-label="copy.toastLabel">
              <div class="tpl-notes__toast-card">
                <span class="tpl-notes__toast-icon" :class="toast.icon" aria-hidden="true" />
                <span class="tpl-notes__toast-text">{{ toast.text }}</span>
                <button type="button" class="tpl-notes__toast-close" :aria-label="copy.dismiss" @click="closeToast">
                  <span class="i-carbon-close" aria-hidden="true" />
                </button>
              </div>
            </TxToastPanel>
          </div>
        </section>

        <aside class="tpl-notes__panel" :aria-label="copy.panel">
          <section class="tpl-notes__section">
            <h3 class="tpl-notes__section-title">
              {{ copy.properties }}
            </h3>
            <TxDescriptions :columns="1" size="sm">
              <TxDescriptionsItem :label="copy.props.createdBy">
                <span class="tpl-notes__person">
                  <TxAvatar
                    :name="personName(activeNote.createdBy)"
                    :size="18"
                    :background-color="PEOPLE[activeNote.createdBy].color"
                    text-color="#fff"
                  />
                  <span class="tpl-notes__person-name">{{ personName(activeNote.createdBy) }}</span>
                </span>
              </TxDescriptionsItem>
              <TxDescriptionsItem :label="copy.props.notebook">
                {{ L(activeNotebook.label) }}
              </TxDescriptionsItem>
              <TxDescriptionsItem :label="copy.props.updated">
                {{ copy.updated(copy.ago[activeNote.edited], personName(activeNote.editedBy)) }}
              </TxDescriptionsItem>
              <TxDescriptionsItem :label="copy.props.words">
                <span class="tpl-notes__num">{{ words }}</span>
              </TxDescriptionsItem>
              <TxDescriptionsItem :label="copy.props.comments">
                {{ copy.threads(openThreads) }}
              </TxDescriptionsItem>
              <TxDescriptionsItem :label="copy.props.tags">
                <!-- A new note has none: the list shows its own empty value. -->
                <span v-if="activeNote.tags.length" class="tpl-notes__tags">
                  <TxTag
                    v-for="tag in activeNote.tags"
                    :key="tag"
                    :label="L(TAGS[tag].label)"
                    :color="TAGS[tag].color"
                    variant="soft"
                    size="sm"
                  />
                </span>
              </TxDescriptionsItem>
            </TxDescriptions>
          </section>

          <section class="tpl-notes__section">
            <h3 class="tpl-notes__section-title">
              {{ copy.activity }}
            </h3>
            <ol class="tpl-notes__events">
              <li v-for="entry in events" :key="entry.id" class="tpl-notes__event" :class="{ 'is-live': entry.live }">
                <TxAvatar
                  class="tpl-notes__event-avatar"
                  :name="personName(entry.who)"
                  :size="20"
                  :background-color="PEOPLE[entry.who].color"
                  text-color="#fff"
                />
                <span class="tpl-notes__event-text"><strong>{{ personName(entry.who) }}</strong> {{ eventText(entry) }}</span>
                <span class="tpl-notes__event-ago">{{ copy.ago[entry.ago] }}</span>
              </li>
            </ol>
          </section>
        </aside>
      </div>
    </template>
  </TemplateFrame>
</template>
