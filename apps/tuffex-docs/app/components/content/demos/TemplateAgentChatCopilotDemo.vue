<script setup lang="ts">
// Agent Chat, second style: a copilot docked beside the page it helps with.
// The host is the clipboard-history plugin's README, laid out as ordinary DOM
// blocks so a text selection has real client rects. Selecting text raises
// TxSelectionActions (explain / improve / translate / shorten); the copilot
// streams its answer into the side panel as a before/after diff, and the page
// changes only when the reader clicks Apply — in the bar or in the panel.
//
// Positioning contract with TxSelectionActions: the bar anchors to a virtual
// reference built from `selection.rects`, and repositions itself on window
// scroll/resize. A snapshot of rects would leave it pinned to the viewport as
// the page or the article scrolls, so the payload handed to it reads its rects
// live from a Range on every call — a Range whose boundaries are put back after
// the stage is expanded or collapsed (see `trackRange`). Layout changes that
// fire no scroll event — collapsing the side panel, expanding the stage, text
// reflowing — call `updatePosition()` from an observer or right after the change.
//
// What the script never does:
// - Touch the reader's real selection. The scripted "selection" is a Range over
//   the template's own highlighted block; `window.getSelection()` is left alone.
// - Apply anything. It stops at the suggestion and waits for a click.
// - Scroll the page or take focus. Only the article's own scroller moves.
import type { AiSuggestion } from '@talex-touch/tuffex/ai-elements'
import type { PromptBarCommand, PromptBarSendPayload, PromptBarSource } from '@talex-touch/tuffex/prompt-bar'
import type { SelectionActionItem, SelectionActionState, SelectionPayload } from '@talex-touch/tuffex/selection-actions'
import type { OrbState } from '@talex-touch/tuffex/thinking-orb'
import type { ToolChipDiff } from '@talex-touch/tuffex/tool-chips'
import { useSelectionAnchor } from '@talex-touch/tuffex/selection-actions'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

type Layout = 'narrow' | 'column' | 'wide' | 'full'
type Lang = 'zh' | 'en'
type BlockKind = 'h1' | 'h2' | 'p' | 'li' | 'code'
type ActionId = 'explain' | 'improve' | 'translate' | 'shorten'
type CardKind = 'rewrite' | 'explain' | 'note' | 'reply'
type CardPhase = 'thinking' | 'streaming' | 'ready' | 'applied' | 'discarded'
/** How much of the block the reader actually selected. */
type Scope = 'block' | 'partial' | 'first'

interface Localized {
  zh: string
  en: string
}

interface BlockSeed {
  id: string
  kind: BlockKind
  text: Localized
  /** Pre-written rewrites; Retry steps through them. */
  improve?: Localized[]
  shorter?: Localized
  /** Markdown, streamed into the panel. */
  explain?: Localized
}

type DocRow = { type: 'block', id: string } | { type: 'list', id: string, ids: string[] }

interface Segment {
  kind: 'text' | 'strong' | 'code'
  text: string
}

interface Target {
  /** Identity of this selection, so a re-render of the same one is not a new one. */
  key: number
  blockId: string
  text: string
  scope: Scope
  /** Made by the template (script, starter chip), not by the reader's own selection. */
  scripted: boolean
  payload: SelectionPayload
  /** The selection's client rects now, or null when they cannot be measured. */
  measure: () => DOMRect[] | null
  /** False once a boundary node has left the document, e.g. its block re-rendered. */
  alive: () => boolean
  /** The card this selection is waiting on, if an action ran. */
  cardId: number | null
}

interface Card {
  id: number
  kind: CardKind
  action?: ActionId
  blockId?: string
  scope: Scope
  /** Free-text instruction typed into the bar or the prompt bar. */
  prompt?: string
  /** What the reader asked about, shown in their echo. */
  quote: string
  /** Block text when the card was made; Undo restores it. */
  original: string
  /** Rewrite, explanation or reply text, streamed through `shown`. */
  body: string
  variant: number
  shown: number
  phase: CardPhase
}

const THINK_MS = 700
const REWRITE_TICK_MS = 60
const EXPLAIN_TICK_MS = 40
const REPLY_MS = 700
/** The applied notice carries Undo, so it stays a little longer than a plain one. */
const TOAST_MS = 4500
const TOAST_REARM_MS = 2000
const FLASH_STILL_MS = 2000
/** Viewport rows the docs site header covers while the stage sits in the column. */
const SITE_HEADER_INSET = 64
/** Room the bar needs under a line: its 36px pill plus the 8px offset. */
const BAR_ROOM = 48
const SCRIPT_BLOCK = 'perm-ask'

// ---------------------------------------------------------------------------
// The README, adapted from plugins/clipboard-history/README.md and the
// permission reasons in its manifest.json
// ---------------------------------------------------------------------------

const BLOCK_LIST: BlockSeed[] = [
  {
    id: 'title',
    kind: 'h1',
    text: { zh: '剪贴板历史', en: 'Clipboard History' },
  },
  {
    id: 'intro',
    kind: 'p',
    text: {
      zh: '剪贴板历史记录插件。从 Tuff 核心提取剪贴板历史能力，把复制过的内容留在手边，随时翻回去重新粘贴。',
      en: 'A clipboard history plugin. It lifts clipboard history out of the Tuff core and keeps what you copied within reach, so you can go back and paste it again any time.',
    },
    improve: [
      {
        zh: '把复制过的文本、图片和文件都留在手边，想用时翻回去再粘贴一次。它原本是 Tuff 核心的一部分，现在是一个独立插件。',
        en: 'Keeps the text, images and files you copy within reach, so you can paste any of them again later. It used to live in the Tuff core and now ships as its own plugin.',
      },
      {
        zh: '复制过的东西不会再丢：剪贴板历史把它们都留着，随时翻回去重新粘贴。',
        en: 'Nothing you copy gets lost: Clipboard History keeps every item, ready to paste again whenever you need it.',
      },
    ],
    shorter: { zh: '复制过的内容都留在手边，随时重新粘贴。', en: 'Everything you copy stays within reach, ready to paste again.' },
    explain: {
      zh: '这段是插件简介：剪贴板历史原本是 Tuff 核心自带的功能，现在拆成了**独立插件**。装上之后，可以翻看复制过的内容并重新粘贴。',
      en: 'This is the plugin\'s summary. Clipboard history used to be built into the Tuff core and is now a **separate plugin**; install it to browse what you copied and paste it again.',
    },
  },
  {
    id: 'h-perm',
    kind: 'h2',
    text: { zh: '权限', en: 'Permissions' },
  },
  {
    id: 'perm-intro',
    kind: 'p',
    text: {
      zh: '插件按最小必要原则声明权限，每项用途都写在 `manifest.json` 的 `permissionReasons` 里：',
      en: 'The plugin asks only for what it needs, and `permissionReasons` in `manifest.json` says what each permission is for:',
    },
    improve: [
      {
        zh: '插件只申请用得到的权限，每一项的用途都写在 `manifest.json` 的 `permissionReasons` 里：',
        en: 'The plugin requests only the permissions it uses, each explained in `permissionReasons` in `manifest.json`:',
      },
    ],
  },
  {
    id: 'perm-read',
    kind: 'li',
    text: { zh: '`clipboard.read`：读取剪贴板历史记录并展示详情', en: '`clipboard.read`: read the clipboard history and show its details' },
  },
  {
    id: 'perm-write',
    kind: 'li',
    text: { zh: '`clipboard.write`：将选中的记录重新写回系统剪贴板', en: '`clipboard.write`: write a chosen entry back to the system clipboard' },
  },
  {
    id: 'perm-root',
    kind: 'li',
    text: { zh: '`search.root-results`：把剪贴板历史入口推送到 CoreBox 根搜索结果', en: '`search.root-results`: push the clipboard history entry into CoreBox root results' },
  },
  {
    id: 'perm-ask',
    kind: 'p',
    text: {
      zh: '根搜索结果推送受 `searchProviders` 的 `defaultState: "ask"` 约束，需用户显式同意后才会生效。',
      en: 'Pushing entries into the root search results is governed by `defaultState: "ask"` in `searchProviders`, and only takes effect after explicit user consent.',
    },
    improve: [
      {
        zh: '插件第一次把条目放进 CoreBox 根搜索前，会先征得你的同意；你拒绝的话就不会推送。',
        en: 'Before the plugin first puts entries into CoreBox\'s root results, Tuff asks you; say no and nothing is pushed.',
      },
      {
        zh: '只有你在授权提示里点了同意，剪贴板条目才会出现在 CoreBox 根搜索里。',
        en: 'Clipboard entries only appear in CoreBox root search after you approve the prompt.',
      },
    ],
    shorter: { zh: '推送到 CoreBox 根搜索前会先问你。', en: 'Tuff asks before pushing to root search.' },
    explain: {
      zh: '`defaultState: "ask"` 表示这项搜索来源默认处于「待询问」状态：插件在 `manifest.json` 里声明了它，但只有你在授权提示里点了同意才会启用。\n\n拒绝后插件照常可用，只是不往 CoreBox 根搜索推结果。',
      en: '`defaultState: "ask"` means this search source starts as "ask first": the plugin declares it in `manifest.json`, but it only turns on once you approve the prompt.\n\nDeclining keeps the plugin working; it just stays out of CoreBox root search.',
    },
  },
  {
    id: 'perm-deny',
    kind: 'p',
    text: {
      zh: '权限被拒绝时插件 fail-closed，不会静默降级为空列表。',
      en: 'If a permission is denied the plugin fails closed instead of silently falling back to an empty list.',
    },
    improve: [
      {
        zh: '如果你拒绝了某项权限，插件会明确告诉你，而不是悄悄显示一个空列表。',
        en: 'Deny a permission and the plugin tells you so, rather than quietly showing an empty list.',
      },
      {
        zh: '缺少权限时，插件会停下并说明原因，不会假装一切正常。',
        en: 'Without a permission the plugin stops and says why; it never pretends everything is fine.',
      },
    ],
    shorter: { zh: '没有权限就明确报错，不显示空列表。', en: 'No permission means a clear error, never an empty list.' },
    explain: {
      zh: '**fail-closed** 指出错时退到更安全的一侧：拿不到权限就停下并说明原因，而不是返回一个空列表假装正常。\n\n这样你不会把「没权限」误当成「没有记录」。',
      en: '**Failing closed** means erring on the safe side: without the permission the plugin stops and says why, instead of returning an empty list as if all were well.\n\nThat way "no permission" is never mistaken for "no history".',
    },
  },
  {
    id: 'h-features',
    kind: 'h2',
    text: { zh: '功能特性', en: 'Features' },
  },
  {
    id: 'feat-history',
    kind: 'li',
    text: { zh: '**历史留存**：自动记录复制过的文本、图片、文件与富文本', en: '**History**: text, images, files and rich text you copy are recorded automatically' },
  },
  {
    id: 'feat-corebox',
    kind: 'li',
    text: { zh: '**CoreBox 直达**：输入「剪贴板」或 `clipboard-history` 即可唤起', en: '**CoreBox shortcut**: type “clipboard” or `clipboard-history` to open it' },
  },
  {
    id: 'feat-paste',
    kind: 'li',
    text: { zh: '**一键回写**：选中任意历史条目重新写回系统剪贴板', en: '**Paste back**: send any entry back to the system clipboard' },
  },
  {
    id: 'feat-source',
    kind: 'li',
    text: { zh: '**来源标注**：记录复制时的来源应用，便于回忆上下文', en: '**Source app**: remembers which app each copy came from' },
  },
  {
    id: 'h-dev',
    kind: 'h2',
    text: { zh: '开发', en: 'Development' },
  },
  {
    id: 'dev',
    kind: 'code',
    text: { zh: 'pnpm -C plugins/clipboard-history dev   # 127.0.0.1:3488', en: 'pnpm -C plugins/clipboard-history dev   # 127.0.0.1:3488' },
    explain: {
      zh: '这行命令在插件目录启动本地开发服务，Surface 由 `127.0.0.1:3488` 提供，改动会热更新。',
      en: 'This starts the plugin\'s local dev server; the Surface is served from `127.0.0.1:3488` and hot-reloads as you edit.',
    },
  },
  {
    id: 'dev-note',
    kind: 'p',
    text: {
      zh: '开发模式需要把 `manifest.json` 的 `dev.enable` 置为 `true`，宿主会转而从 `dev.address` 加载 Surface。',
      en: 'Dev mode needs `dev.enable` set to `true` in `manifest.json`; the host then loads the Surface from `dev.address`.',
    },
    improve: [
      {
        zh: '调试插件界面时，把 `manifest.json` 里的 `dev.enable` 改成 `true`，Tuff 就会改从 `dev.address` 加载它。',
        en: 'To debug the plugin\'s UI, set `dev.enable` to `true` in `manifest.json` and Tuff loads it from `dev.address` instead.',
      },
    ],
  },
]

const BLOCKS: Record<string, BlockSeed> = Object.fromEntries(BLOCK_LIST.map(block => [block.id, block]))

const DOC_ROWS: DocRow[] = [
  { type: 'block', id: 'title' },
  { type: 'block', id: 'intro' },
  { type: 'block', id: 'h-perm' },
  { type: 'block', id: 'perm-intro' },
  { type: 'list', id: 'perm-list', ids: ['perm-read', 'perm-write', 'perm-root'] },
  { type: 'block', id: 'perm-ask' },
  { type: 'block', id: 'perm-deny' },
  { type: 'block', id: 'h-features' },
  { type: 'list', id: 'feature-list', ids: ['feat-history', 'feat-corebox', 'feat-paste', 'feat-source'] },
  { type: 'block', id: 'h-dev' },
  { type: 'block', id: 'dev' },
  { type: 'block', id: 'dev-note' },
]

const HEADINGS = BLOCK_LIST.filter(block => block.kind === 'h2').map(block => block.id)

const DIFFS: ToolChipDiff[] = [{ file: 'README.md', add: 1, del: 1 }]

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

const zhCopy = {
  title: '侧边 Copilot',
  path: 'clipboard-history',
  saved: '已保存',
  unsaved: (count: number) => `${count} 处未保存`,
  words: (count: number) => `${count} 字`,
  rerun: '重新演示',
  docLabel: 'README 正文',
  tocTitle: '本页目录',
  copilot: '文档助手',
  copilotLabel: '文档助手面板',
  collapse: '收起助手',
  expandSide: '展开助手',
  closeSheet: '收起文档助手',
  pill: (count: number) => (count > 0 ? `助手 · ${count} 条建议` : '助手'),
  pending: (count: number) => `${count} 条建议待处理`,
  mode: {
    edit: '编辑需确认',
    readonly: '只读 · 仅解释',
  },
  readonlyHint: '只读：只解释，不改写页面。',
  sees: (count: number) => `它能看到 ${count} 项`,
  selectionChip: (count: number) => `选区 · ${count} 字`,
  selectionChipClose: '移除选区，放弃当前建议',
  clipboardChip: '剪贴板（示例）',
  emptyTitle: '选中页面里的文字',
  emptyText: '我可以解释、润色或翻译它。改动只有你点「应用」后才会写进页面。演示里的回答都是预写的。',
  starters: '可以先试试',
  actionName: {
    explain: '解释',
    improve: '润色',
    translate: '翻译',
    shorten: '精简',
  } satisfies Record<ActionId, string>,
  thinking: {
    explain: '正在解释…',
    rewrite: '正在改写…',
    reply: '正在回复…',
  },
  before: '原文',
  after: '建议',
  scope: {
    partial: '演示按整段改写',
    first: '只改写了第一段（演示）',
  },
  asked: (prompt: string) => `按你的要求「${prompt}」给出预写结果（演示）`,
  apply: '应用到页面',
  discard: '放弃',
  undo: '撤销',
  status: {
    ready: '待应用',
    applied: '已应用',
    discarded: '已放弃',
  },
  applyHint: '点「应用」才会改动页面，不会自动写入。',
  readonlyApply: '只读模式下不能应用改写。',
  notes: {
    rewriteOnly: '（演示）只为正文段落预写了改写结果；标题、列表和代码可以试试「解释」。',
    noShorter: '（演示）这一段没有预写的精简版本，试试「润色」。',
    noTranslate: '（演示）只能翻译原文或预写的改写。',
    code: '（演示）代码不做改写或翻译，可以试试「解释」。',
    explainFallback: '（演示）这部分没有预写的解释。试试选中「权限」下的段落。',
    needSelection: '（演示）先在左边选中一段文字，再用这个命令。',
  },
  demoReply: '（演示）在左边选中文字，试试「润色」或「翻译」。',
  next: {
    shorten: '再短一点',
    translate: '翻译成英文',
    explain: '解释这一段',
  },
  startList: [
    { id: 'improve:perm-ask', text: '润色「权限」里的授权说明' },
    { id: 'explain:perm-deny', text: '解释 fail-closed' },
    { id: 'translate:intro', text: '把简介翻译成英文' },
  ],
  bar: {
    placeholder: '描述修改…',
    ariaLabel: '划词助手',
    keepLabel: '应用',
    discardLabel: '放弃',
    retryLabel: '换一种写法',
    sendLabel: '发送修改指令',
    expandLabel: '更多动作',
    collapseLabel: '收起动作',
    busyLabel: '处理中',
  },
  actions: [
    { id: 'explain', label: '解释', busyLabel: '解释中' },
    { id: 'improve', label: '润色', busyLabel: '润色中' },
    { id: 'translate', label: '翻译', busyLabel: '翻译中' },
    { id: 'shorten', label: '精简', more: true, busyLabel: '精简中' },
  ] satisfies SelectionActionItem[],
  toast: '已应用到 README.md',
  toastLabel: '改动结果',
  dismiss: '关闭提示',
  messageActions: {
    copyLabel: '复制建议',
    copiedLabel: '已复制',
    label: '建议操作',
  },
  prompt: {
    placeholder: '问文档助手，@ 引用资料，/ 用命令…',
    sendLabel: '发送',
    attachLabel: '引用资料',
    sourcesHintText: '输入以搜索资料',
    commandsHintText: '输入以搜索命令',
    emptyText: (query: string) => `没有匹配「${query}」的项`,
    connectText: '连接',
    connectedText: '已连接',
    attachmentFallbackLabel: '附件',
    removeAttachmentLabel: (name: string) => `移除 ${name}`,
  },
  sources: [
    { key: 'doc', name: 'README.md', desc: '当前文档' },
    { key: 'selection', name: '选区', desc: '当前选中的文字' },
    { key: 'clipboard', name: '剪贴板', desc: '最近 1 条（示例）' },
    { key: 'manifest', name: 'manifest.json', desc: '权限声明' },
  ] satisfies PromptBarSource[],
  commands: [
    { key: 'improve', name: '/improve', desc: '润色选中的文字' },
    { key: 'explain', name: '/explain', desc: '解释选中的文字' },
    { key: 'translate', name: '/translate', desc: '翻译选中的文字' },
    { key: 'shorten', name: '/shorten', desc: '精简选中的文字' },
  ] satisfies PromptBarCommand[],
}

const enCopy: typeof zhCopy = {
  title: 'Side copilot',
  path: 'clipboard-history',
  saved: 'Saved',
  unsaved: (count: number) => `${count} unsaved change${count === 1 ? '' : 's'}`,
  words: (count: number) => `${count} words`,
  rerun: 'Replay',
  docLabel: 'README text',
  tocTitle: 'On this page',
  copilot: 'Docs copilot',
  copilotLabel: 'Docs copilot panel',
  collapse: 'Collapse the copilot',
  expandSide: 'Expand the copilot',
  closeSheet: 'Close the docs copilot',
  pill: (count: number) => (count > 0 ? `Copilot · ${count} suggestion${count === 1 ? '' : 's'}` : 'Copilot'),
  pending: (count: number) => `${count} suggestion${count === 1 ? '' : 's'} waiting`,
  mode: {
    edit: 'Edits need your OK',
    readonly: 'Read-only · explain',
  },
  readonlyHint: 'Read-only: explains, never rewrites the page.',
  sees: (count: number) => `Can see ${count} item${count === 1 ? '' : 's'}`,
  selectionChip: (count: number) => `Selection · ${count} word${count === 1 ? '' : 's'}`,
  selectionChipClose: 'Remove the selection and drop its suggestion',
  clipboardChip: 'Clipboard (sample)',
  emptyTitle: 'Select some text on the page',
  emptyText: 'I can explain, improve or translate it. Nothing reaches the page until you click Apply. Every answer in this demo is pre-written.',
  starters: 'Try one of these',
  actionName: {
    explain: 'Explain',
    improve: 'Improve',
    translate: 'Translate',
    shorten: 'Shorten',
  },
  thinking: {
    explain: 'Explaining…',
    rewrite: 'Rewriting…',
    reply: 'Replying…',
  },
  before: 'Before',
  after: 'After',
  scope: {
    partial: 'The demo rewrites the whole paragraph',
    first: 'Only the first paragraph is rewritten (demo)',
  },
  asked: (prompt: string) => `A pre-written take on “${prompt}” (demo)`,
  apply: 'Apply to page',
  discard: 'Discard',
  undo: 'Undo',
  status: {
    ready: 'Waiting',
    applied: 'Applied',
    discarded: 'Discarded',
  },
  applyHint: 'Nothing changes on the page until you click Apply.',
  readonlyApply: 'Read-only mode cannot apply rewrites.',
  notes: {
    rewriteOnly: '(Demo) Rewrites are pre-written for body paragraphs only; for headings, list items and code, try Explain.',
    noShorter: '(Demo) There is no pre-written shorter version of this part; try Improve.',
    noTranslate: '(Demo) Only the original text or a pre-written rewrite can be translated.',
    code: '(Demo) Code is never rewritten or translated; try Explain.',
    explainFallback: '(Demo) There is no pre-written explanation for this part. Try a paragraph under Permissions.',
    needSelection: '(Demo) Select some text on the left first, then use the command.',
  },
  demoReply: '(Demo) Select some text on the left and try Improve or Translate.',
  next: {
    shorten: 'Make it shorter',
    translate: 'Translate to Chinese',
    explain: 'Explain this part',
  },
  startList: [
    { id: 'improve:perm-ask', text: 'Improve the consent sentence under Permissions' },
    { id: 'explain:perm-deny', text: 'Explain “fails closed”' },
    { id: 'translate:intro', text: 'Translate the intro into Chinese' },
  ],
  bar: {
    placeholder: 'Describe the edit…',
    ariaLabel: 'Selection assistant',
    keepLabel: 'Apply',
    discardLabel: 'Discard',
    retryLabel: 'Try another version',
    sendLabel: 'Send edit instruction',
    expandLabel: 'More actions',
    collapseLabel: 'Fewer actions',
    busyLabel: 'Working',
  },
  actions: [
    { id: 'explain', label: 'Explain', busyLabel: 'Explaining' },
    { id: 'improve', label: 'Improve', busyLabel: 'Improving' },
    { id: 'translate', label: 'Translate', busyLabel: 'Translating' },
    { id: 'shorten', label: 'Shorten', more: true, busyLabel: 'Shortening' },
  ],
  toast: 'Applied to README.md',
  toastLabel: 'Edit result',
  dismiss: 'Dismiss',
  messageActions: {
    copyLabel: 'Copy suggestion',
    copiedLabel: 'Copied',
    label: 'Suggestion actions',
  },
  prompt: {
    placeholder: 'Ask the copilot, @ to cite, / for commands…',
    sendLabel: 'Send',
    attachLabel: 'Cite a source',
    sourcesHintText: 'Type to search sources',
    commandsHintText: 'Type to search commands',
    emptyText: (query: string) => `No matches for “${query}”`,
    connectText: 'Connect',
    connectedText: 'Connected',
    attachmentFallbackLabel: 'Attachment',
    removeAttachmentLabel: (name: string) => `Remove ${name}`,
  },
  sources: [
    { key: 'doc', name: 'README.md', desc: 'This document' },
    { key: 'selection', name: 'Selection', desc: 'The text you selected' },
    { key: 'clipboard', name: 'Clipboard', desc: 'Latest item (sample)' },
    { key: 'manifest', name: 'manifest.json', desc: 'Permission declarations' },
  ],
  commands: [
    { key: 'improve', name: '/improve', desc: 'Improve the selection' },
    { key: 'explain', name: '/explain', desc: 'Explain the selection' },
    { key: 'translate', name: '/translate', desc: 'Translate the selection' },
    { key: 'shorten', name: '/shorten', desc: 'Shorten the selection' },
  ],
}

const ACTION_ICONS: Record<string, string> = {
  explain: 'i-carbon-help',
  improve: 'i-carbon-magic-wand',
  translate: 'i-carbon-translate',
  shorten: 'i-carbon-cut',
}

const ACTION_IDS: ActionId[] = ['explain', 'improve', 'translate', 'shorten']

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))
const lang = computed<Lang>(() => (zh.value ? 'zh' : 'en'))
const copy = computed(() => (zh.value ? zhCopy : enCopy))

const sheetId = useId()

function layoutOf(width: number): Layout {
  // The stage reports 0 before its first measurement; the column layout is the
  // one it is about to be in.
  if (width <= 0)
    return 'column'
  if (width < 640)
    return 'narrow'
  if (width < 960)
    return 'column'
  return width < 1200 ? 'wide' : 'full'
}

function prefersReducedMotion(): boolean {
  return hasWindow()
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

// ---------------------------------------------------------------------------
// Inline markup: the README carries `code` and **bold**; nothing else
// ---------------------------------------------------------------------------

function parseInline(source: string): Segment[] {
  const parts: Segment[] = []
  let last = 0
  for (const match of source.matchAll(/\*\*[^*]+\*\*|`[^`]+`/g)) {
    const index = match.index ?? 0
    if (index > last)
      parts.push({ kind: 'text', text: source.slice(last, index) })
    const token = match[0]
    parts.push(token.startsWith('**')
      ? { kind: 'strong', text: token.slice(2, -2) }
      : { kind: 'code', text: token.slice(1, -1) })
    last = index + token.length
  }
  if (last < source.length)
    parts.push({ kind: 'text', text: source.slice(last) })
  return parts
}

function plain(source: string): string {
  return source.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1')
}

function excerpt(source: string, max: number): string {
  const text = plain(source).replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function seedTexts(): Record<string, string> {
  return Object.fromEntries(BLOCK_LIST.map(block => [block.id, block.text[lang.value]]))
}

const texts = reactive<Record<string, string>>(seedTexts())
const cards = ref<Card[]>([])
const target = shallowRef<Target | null>(null)
const targetInView = ref(true)
const readonly = ref(false)
const seesClipboard = ref(true)
const sideCollapsed = ref(false)
const sheetOpen = ref(false)
const draft = ref('')
const barPrompt = ref('')
const barExpanded = ref(false)
const flashBlock = ref<string | null>(null)
const activeHeading = ref(HEADINGS[0] ?? '')
const generation = ref(0)
const reduced = ref(false)
const toast = reactive({ open: false, cardId: 0 })

const rootRef = ref<HTMLElement | null>(null)
const docRef = ref<HTMLElement | null>(null)
const articleRef = ref<HTMLElement | null>(null)
const chatRef = ref<HTMLElement | null>(null)
const sheetRef = ref<HTMLElement | null>(null)
const sheetToggleRef = ref<HTMLElement | null>(null)
const barRef = ref<{ updatePosition: () => void, el: HTMLElement | null } | null>(null)

let entered = false
let targetKeys = 0
let cardIds = 0
let timers: ReturnType<typeof setTimeout>[] = []
let toastTimer: ReturnType<typeof setTimeout> | undefined
let flashTimer: ReturnType<typeof setTimeout> | undefined

function later(ms: number, run: () => void): void {
  const id = setTimeout(() => {
    timers = timers.filter(timer => timer !== id)
    run()
  }, ms)
  timers.push(id)
}

/** Calls `step` every `ms` until it returns false. */
function every(ms: number, step: () => boolean): void {
  later(ms, () => {
    if (step())
      every(ms, step)
  })
}

function clearTimers(): void {
  for (const id of timers)
    clearTimeout(id)
  timers = []
}

// The reader's own selection inside the article. `ignore` keeps the bar's text
// field from reading as a deselection when it takes focus.
const { selection: readerSelection, clear: clearReaderAnchor } = useSelectionAnchor({
  root: articleRef,
  ignore: () => [barRef.value?.el ?? null],
})

// ---------------------------------------------------------------------------
// Derived
// ---------------------------------------------------------------------------

function segmentsOf(id: string): Segment[] {
  return parseInline(texts[id] ?? '')
}

function blockTag(id: string): 'h1' | 'h2' | 'p' {
  const kind = BLOCKS[id]?.kind
  return kind === 'h1' || kind === 'h2' ? kind : 'p'
}

const cardById = computed(() => new Map(cards.value.map(card => [card.id, card])))

const activeCard = computed(() => {
  const id = target.value?.cardId
  return id === null || id === undefined ? undefined : cardById.value.get(id)
})

const barState = computed<SelectionActionState>(() => {
  const card = activeCard.value
  if (!card)
    return 'idle'
  if (card.phase === 'thinking')
    return 'thinking'
  if (card.phase === 'streaming')
    return 'streaming'
  return card.kind === 'rewrite' && card.phase === 'ready' ? 'result' : 'idle'
})

const barSelection = computed<SelectionPayload | null>(() =>
  target.value && targetInView.value ? target.value.payload : null,
)

const barActions = computed<SelectionActionItem[]>(() =>
  readonly.value ? copy.value.actions.filter(action => action.id === 'explain') : copy.value.actions,
)

/** The block drawn highlighted: a template-made selection, or one an action is working on. */
const pickedBlock = computed(() => {
  const current = target.value
  return current && (current.scripted || current.cardId !== null) ? current.blockId : null
})

const pendingCount = computed(() => cards.value.filter(card => card.kind === 'rewrite' && card.phase === 'ready').length)
const dirtyCount = computed(() => cards.value.filter(card => card.phase === 'applied').length)
const working = computed(() => cards.value.some(card => card.phase === 'thinking' || card.phase === 'streaming'))

const orbState = computed<OrbState>(() => {
  const busy = cards.value.find(card => card.phase === 'thinking' || card.phase === 'streaming')
  if (!busy)
    return 'breathing'
  return busy.kind === 'explain' ? 'weaving' : busy.kind === 'reply' ? 'listening' : 'composing'
})

const seenCount = computed(() => 1 + (target.value ? 1 : 0) + (seesClipboard.value ? 1 : 0))

const wordCount = computed(() => {
  const all = BLOCK_LIST.map(block => plain(texts[block.id] ?? '')).join(' ')
  if (zh.value)
    return (all.match(/\p{Script=Han}/gu)?.length ?? 0) + (all.match(/[a-z0-9][\w.:-]*/gi)?.length ?? 0)
  return all.split(/\s+/).filter(Boolean).length
})

const selectionSize = computed(() => {
  const text = plain(target.value?.text ?? '')
  return zh.value ? text.replace(/\s+/g, '').length : text.split(/\s+/).filter(Boolean).length
})

const startSuggestions = computed<AiSuggestion[]>(() => copy.value.startList.map(item => ({ id: item.id, text: item.text })))

/** Follow-ups for the block the latest settled answer was about. */
const nextSuggestions = computed<AiSuggestion[]>(() => {
  const last = [...cards.value].reverse().find(card => card.kind !== 'reply' && card.phase !== 'thinking' && card.phase !== 'streaming')
  const block = last?.blockId ? BLOCKS[last.blockId] : undefined
  if (!last || !block)
    return []
  const next = copy.value.next
  const items: AiSuggestion[] = []
  if (!readonly.value && block.shorter && last.action !== 'shorten')
    items.push({ id: `shorten:${block.id}`, text: next.shorten })
  if (!readonly.value && block.kind !== 'code' && last.action !== 'translate')
    items.push({ id: `translate:${block.id}`, text: next.translate })
  if (last.action !== 'explain')
    items.push({ id: `explain:${block.id}`, text: next.explain })
  return items
})

function cardText(card: Card): string {
  return card.body.slice(0, card.shown)
}

function echoMessage(card: Card) {
  const content = card.kind === 'reply'
    ? card.prompt ?? ''
    : `${copy.value.actionName[card.action ?? 'improve']} · 「${excerpt(card.quote, zh.value ? 18 : 36)}」`
  return { id: `echo-${card.id}`, role: 'user' as const, content }
}

function thinkingText(card: Card): string {
  if (card.kind === 'explain')
    return copy.value.thinking.explain
  return card.kind === 'reply' ? copy.value.thinking.reply : copy.value.thinking.rewrite
}

function cardStatus(card: Card): { text: string, status: 'warning' | 'success' | 'muted' } | null {
  if (card.kind !== 'rewrite')
    return null
  if (card.phase === 'applied')
    return { text: copy.value.status.applied, status: 'success' }
  if (card.phase === 'discarded')
    return { text: copy.value.status.discarded, status: 'muted' }
  return card.phase === 'ready' ? { text: copy.value.status.ready, status: 'warning' } : null
}

const toastCard = computed(() => cardById.value.get(toast.cardId))

function canUndo(card: Card): boolean {
  return card.phase === 'applied' && card.blockId !== undefined && texts[card.blockId] === card.body
}

// ---------------------------------------------------------------------------
// Selection targets
// ---------------------------------------------------------------------------

function nodeLength(node: Node): number {
  return node.nodeType === Node.TEXT_NODE || node.nodeType === Node.COMMENT_NODE
    ? (node as CharacterData).length
    : node.childNodes.length
}

/**
 * A selection the bar can keep following.
 *
 * The bar reads `rects` on every reposition, so they are measured from the
 * Range each time: that is what keeps it under the text while the page or the
 * article scrolls. Expanding or collapsing the stage is the trap. TemplateFrame
 * moves the stage with a Teleport, and moving a node removes it first, which
 * collapses every live Range inside it onto the old parent; the Text nodes
 * themselves move intact. So the boundaries are kept here and put back before
 * each measurement. Once a boundary node has left the document for good (its
 * block re-rendered), the range reports that instead of guessing: `measure()`
 * returns null and the refresh drops the target.
 */
function trackRange(text: string, range: Range): Pick<Target, 'payload' | 'measure' | 'alive'> {
  const bounds = {
    startNode: range.startContainer,
    startOffset: range.startOffset,
    endNode: range.endContainer,
    endOffset: range.endOffset,
  }
  const alive = (): boolean => bounds.startNode.isConnected && bounds.endNode.isConnected

  function restore(): boolean {
    if (!alive())
      return false
    const moved = range.startContainer !== bounds.startNode || range.startOffset !== bounds.startOffset
      || range.endContainer !== bounds.endNode || range.endOffset !== bounds.endOffset
    if (!moved)
      return true
    try {
      range.setStart(bounds.startNode, Math.min(bounds.startOffset, nodeLength(bounds.startNode)))
      range.setEnd(bounds.endNode, Math.min(bounds.endOffset, nodeLength(bounds.endNode)))
      return true
    }
    catch {
      return false
    }
  }

  function measure(): DOMRect[] | null {
    if (!restore())
      return null
    const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 || rect.height > 0)
    return rects.length > 0 ? rects : null
  }

  let last: DOMRect[] = []
  const payload: SelectionPayload = markRaw({
    text,
    range,
    get rects(): DOMRect[] {
      const rects = measure()
      if (rects) {
        last = rects
        return rects
      }
      // Unmeasurable: the next frame hides the bar or drops the target. Until
      // then it keeps its last place rather than jumping to the page's corner.
      scheduleRefresh()
      return last
    },
  })
  return { payload, measure, alive }
}

function makeTarget(blockId: string, text: string, range: Range, scripted: boolean, scope: Scope): Target {
  targetKeys += 1
  return { key: targetKeys, blockId, text, scope, scripted, ...trackRange(text, range), cardId: null }
}

function blockElementOf(node: Node | null): HTMLElement | null {
  const element = node instanceof Element ? node : node?.parentElement ?? null
  return element?.closest<HTMLElement>('[data-block]') ?? null
}

function targetFromReader(payload: SelectionPayload): Target | null {
  const range = payload.range
  if (!range)
    return null
  const start = blockElementOf(range.startContainer)
  const end = blockElementOf(range.endContainer)
  const block = start ?? end
  const id = block?.dataset.block
  if (!block || !id || !BLOCKS[id])
    return null
  const whole = (block.textContent ?? '').replace(/\s+/g, '')
  const picked = payload.text.replace(/\s+/g, '')
  const scope: Scope = start && end && start !== end
    ? 'first'
    : picked.length >= whole.length ? 'block' : 'partial'
  return makeTarget(id, payload.text, range.cloneRange(), false, scope)
}

function blockTextElement(id: string): HTMLElement | null {
  return articleRef.value?.querySelector<HTMLElement>(`[data-block-text="${id}"]`) ?? null
}

/** Top edge of the narrow sheet when it covers the article; the docked panel sits beside it instead. */
function sheetTop(): number {
  const panel = sheetRef.value
  return panel?.classList.contains('is-sheet') ? panel.getBoundingClientRect().top : Number.POSITIVE_INFINITY
}

/** Scrolls the article's own container — never the page — so a block and the bar under it are in view. */
function bringIntoView(element: HTMLElement): void {
  const doc = docRef.value
  if (!doc)
    return
  const box = doc.getBoundingClientRect()
  const bottom = Math.min(box.bottom, sheetTop())
  const rect = element.getBoundingClientRect()
  if (rect.top >= box.top + 12 && rect.bottom <= bottom - BAR_ROOM - 40)
    return
  const top = doc.scrollTop + rect.top - box.top - Math.round((bottom - box.top) * 0.28)
  doc.scrollTo({ top: Math.max(0, top), behavior: reduced.value || prefersReducedMotion() ? 'auto' : 'smooth' })
}

/** A template-made selection over a whole block: a Range the template owns, not the reader's. */
function pickBlock(id: string): Target | null {
  const element = blockTextElement(id)
  if (!element)
    return null
  const range = document.createRange()
  range.selectNodeContents(element)
  const next = makeTarget(id, texts[id] ?? element.textContent ?? '', range, true, 'block')
  target.value = next
  targetInView.value = true
  barPrompt.value = ''
  barExpanded.value = false
  bringIntoView(element)
  scheduleRefresh()
  return next
}

/** Drops the reader's selection inside the article. Only ever runs from their click. */
function clearReaderSelection(): void {
  const selection = hasWindow() ? window.getSelection() : null
  const article = articleRef.value
  if (selection && article && selection.rangeCount > 0 && article.contains(selection.anchorNode))
    selection.removeAllRanges()
}

function clearTarget(): void {
  target.value = null
  barPrompt.value = ''
  barExpanded.value = false
  clearReaderAnchor()
}

watch(readerSelection, (payload) => {
  if (payload) {
    const next = targetFromReader(payload)
    if (!next)
      return
    interrupt()
    target.value = next
    targetInView.value = true
    barPrompt.value = ''
    barExpanded.value = false
    scheduleRefresh()
    return
  }
  // A collapsed selection retracts a bar that was only offering actions; one
  // with an answer on it stays until the reader applies or discards it.
  const current = target.value
  if (current && !current.scripted && current.cardId === null)
    clearTarget()
})

// ---------------------------------------------------------------------------
// Keeping the bar under the text
// ---------------------------------------------------------------------------

let refreshFrame = 0

function updateTargetInView(): void {
  const current = target.value
  const doc = docRef.value
  if (!current || !doc) {
    targetInView.value = true
    return
  }
  const rects = current.measure()
  const first = rects?.[0]
  const last = rects?.at(-1)
  if (!first || !last) {
    targetInView.value = false
    return
  }
  const box = doc.getBoundingClientRect()
  const expanded = rootRef.value?.dataset.expanded === 'true'
  const top = Math.max(box.top, expanded ? 0 : SITE_HEADER_INSET) + 4
  const bottom = Math.min(box.bottom, window.innerHeight, sheetTop()) - 8
  // Hidden once the text it points at has left the article's visible band: the
  // bar lives on <body>, so nothing would clip it otherwise.
  targetInView.value = last.bottom > top && first.top < bottom && last.bottom <= bottom
}

function refresh(): void {
  refreshFrame = 0
  // The text it pointed at was re-rendered away: nothing left to anchor to.
  if (target.value && !target.value.alive())
    clearTarget()
  updateTargetInView()
  updateActiveHeading()
  // After the parent has flushed: the bar reads its props when it repositions.
  void nextTick(() => barRef.value?.updatePosition())
}

function scheduleRefresh(): void {
  if (!hasWindow() || refreshFrame)
    return
  refreshFrame = window.requestAnimationFrame(refresh)
}

function updateActiveHeading(): void {
  const doc = docRef.value
  if (!doc)
    return
  const box = doc.getBoundingClientRect()
  let active = HEADINGS[0] ?? ''
  for (const id of HEADINGS) {
    const element = doc.querySelector<HTMLElement>(`[data-block="${id}"]`)
    if (element && element.getBoundingClientRect().top - box.top <= 24)
      active = id
  }
  activeHeading.value = active
}

let resizeObserver: ResizeObserver | null = null
let expandObserver: MutationObserver | null = null

onMounted(() => {
  window.addEventListener('scroll', scheduleRefresh, { passive: true, capture: true })
  window.addEventListener('resize', scheduleRefresh, { passive: true })
  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(scheduleRefresh)
    if (rootRef.value)
      resizeObserver.observe(rootRef.value)
    if (docRef.value)
      resizeObserver.observe(docRef.value)
  }
  // Expanding moves the stage into an overlay; when its size happens not to
  // change there is no resize to hear, so the flag the slot writes is watched too.
  if (rootRef.value && 'MutationObserver' in window) {
    expandObserver = new MutationObserver(scheduleRefresh)
    expandObserver.observe(rootRef.value, { attributes: true, attributeFilter: ['data-expanded'] })
  }
})

// The article re-mounts per generation; keep observing the live element.
watch(docRef, (next, previous) => {
  if (previous)
    resizeObserver?.unobserve(previous)
  if (next)
    resizeObserver?.observe(next)
})

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Which pre-written variant a block's current text is, so Translate can follow it. */
function variantOf(block: BlockSeed, text: string): Localized | null {
  const candidates = [block.text, ...(block.improve ?? []), ...(block.shorter ? [block.shorter] : [])]
  return candidates.find(candidate => candidate[lang.value] === text) ?? null
}

interface Plan {
  kind: CardKind
  body: string
}

function planFor(action: ActionId, block: BlockSeed, variant: number): Plan {
  const notes = copy.value.notes
  const current = texts[block.id] ?? ''
  if (action === 'explain')
    return { kind: 'explain', body: block.explain?.[lang.value] ?? notes.explainFallback }
  if (block.kind === 'code')
    return { kind: 'note', body: notes.code }
  if (action === 'translate') {
    const source = variantOf(block, current)
    const other = source?.[zh.value ? 'en' : 'zh']
    return other ? { kind: 'rewrite', body: other } : { kind: 'note', body: notes.noTranslate }
  }
  if (action === 'shorten')
    return block.shorter ? { kind: 'rewrite', body: block.shorter[lang.value] } : { kind: 'note', body: notes.noShorter }
  const options = block.improve ?? []
  if (options.length === 0)
    return { kind: 'note', body: notes.rewriteOnly }
  // Skip a version the block already reads as, so Improve always offers a change.
  let index = variant % options.length
  if (options.length > 1 && options[index]?.[lang.value] === current)
    index = (index + 1) % options.length
  return { kind: 'rewrite', body: options[index]?.[lang.value] ?? current }
}

function stickChat(force = false): void {
  void nextTick(() => {
    const chat = chatRef.value
    if (!chat)
      return
    // The panel's own scroller only; the page never moves.
    if (force || chat.scrollHeight - chat.scrollTop - chat.clientHeight < 72)
      chat.scrollTop = chat.scrollHeight
  })
}

function settleCard(card: Card): void {
  card.shown = card.body.length
  card.phase = 'ready'
  if (card.id === scriptCardId)
    scripting = false
  // An explanation has nothing to apply, so its bar steps aside once it is written.
  if (card.kind === 'explain' && target.value?.cardId === card.id)
    clearTarget()
}

/** Lands every answer still being written, at once. */
function finishWriting(): void {
  clearTimers()
  for (const card of cards.value) {
    if (card.phase === 'thinking' || card.phase === 'streaming')
      settleCard(card)
  }
}

function streamCard(id: number): void {
  const card = cardById.value.get(id)
  if (!card || card.phase !== 'thinking')
    return
  if (card.kind === 'reply' || card.kind === 'note') {
    settleCard(card)
    stickChat()
    return
  }
  card.phase = 'streaming'
  card.shown = 0
  // Chinese carries more per character, so it streams fewer per tick.
  const explain = card.kind === 'explain'
  const step = explain ? (zh.value ? 4 : 8) : (zh.value ? 2 : 5)
  every(explain ? EXPLAIN_TICK_MS : REWRITE_TICK_MS, () => {
    card.shown = Math.min(card.body.length, card.shown + step)
    stickChat()
    if (card.shown < card.body.length)
      return true
    settleCard(card)
    return false
  })
}

function runAction(action: ActionId, prompt?: string): void {
  const current = target.value
  const block = current ? BLOCKS[current.blockId] : undefined
  if (!current || !block)
    return
  if (readonly.value && action !== 'explain')
    return
  finishWriting()
  const plan = planFor(action, block, 0)
  cardIds += 1
  const card: Card = {
    id: cardIds,
    kind: plan.kind,
    action,
    blockId: block.id,
    scope: current.scope,
    prompt,
    quote: current.text,
    original: texts[block.id] ?? '',
    body: plan.body,
    variant: 0,
    shown: 0,
    phase: 'thinking',
  }
  cards.value.push(card)
  const live = cardById.value.get(card.id) ?? card
  // A note answers without waiting on anything; the selection stays free for another action.
  if (plan.kind !== 'note')
    target.value = { ...current, cardId: live.id }
  stickChat(true)
  if (reduced.value || prefersReducedMotion()) {
    settleCard(live)
    return
  }
  later(plan.kind === 'note' ? 360 : THINK_MS, () => streamCard(live.id))
}

function retryCard(card: Card | undefined): void {
  if (!card || card.kind !== 'rewrite' || card.phase !== 'ready' || !card.blockId)
    return
  const block = BLOCKS[card.blockId]
  if (!block || !card.action)
    return
  finishWriting()
  const variant = card.variant + 1
  card.variant = variant
  card.body = planFor(card.action, block, variant).body
  card.phase = 'thinking'
  card.shown = 0
  if (reduced.value || prefersReducedMotion()) {
    settleCard(card)
    return
  }
  later(THINK_MS, () => streamCard(card.id))
}

function applyCard(card: Card | undefined): void {
  if (!card || card.kind !== 'rewrite' || card.phase !== 'ready' || !card.blockId || readonly.value)
    return
  // The bar goes first: any range in this block is about to lose the text it measures.
  if (target.value?.cardId === card.id || target.value?.blockId === card.blockId)
    clearTarget()
  clearReaderSelection()
  card.original = texts[card.blockId] ?? card.original
  texts[card.blockId] = card.body
  card.phase = 'applied'
  flash(card.blockId)
  openToast(card.id)
  scheduleRefresh()
}

function undoCard(card: Card | undefined): void {
  if (!card || !canUndo(card) || !card.blockId)
    return
  if (target.value?.blockId === card.blockId)
    clearTarget()
  texts[card.blockId] = card.original
  card.phase = 'ready'
  closeToast()
  flash(card.blockId)
  scheduleRefresh()
}

function discardCard(card: Card | undefined): void {
  if (!card || card.kind !== 'rewrite' || (card.phase !== 'ready' && card.phase !== 'streaming' && card.phase !== 'thinking'))
    return
  if (card.phase !== 'ready')
    finishWriting()
  card.phase = 'discarded'
  if (target.value?.cardId === card.id) {
    clearTarget()
    clearReaderSelection()
  }
}

function flash(blockId: string): void {
  flashBlock.value = null
  clearTimeout(flashTimer)
  void nextTick(() => {
    flashBlock.value = blockId
    // Without motion there is no animationend to take the ring off again.
    if (prefersReducedMotion()) {
      flashTimer = setTimeout(() => {
        flashBlock.value = null
      }, FLASH_STILL_MS)
    }
  })
}

/** Arms the toast's own dismissal. It runs under reduced motion too: that setting removes movement, not the timer. */
function armToast(ms: number): void {
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.open = false
  }, ms)
}

// Pointer or keyboard focus resting on the toast holds it open, so its buttons
// can be reached; it re-arms shortly after both have left.
let toastHovered = false
let toastFocused = false

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

function openToast(cardId: number): void {
  toast.cardId = cardId
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

/** Runs an action on a whole block, as the starter and follow-up chips do. */
function runOnBlock(action: ActionId, blockId: string): void {
  interrupt()
  if (!pickBlock(blockId))
    return
  runAction(action)
}

function onSuggestion(suggestion: AiSuggestion): void {
  const [action, blockId] = suggestion.id.split(':')
  if (blockId && ACTION_IDS.includes(action as ActionId))
    runOnBlock(action as ActionId, blockId)
}

function revealBlock(blockId: string | undefined): void {
  const element = blockId ? blockTextElement(blockId) : null
  if (!element || !blockId)
    return
  bringIntoView(element)
  flash(blockId)
}

// --- the bar ----------------------------------------------------------------

function onBarAction(payload: { id: string }): void {
  interrupt()
  if (ACTION_IDS.includes(payload.id as ActionId))
    runAction(payload.id as ActionId)
}

function onBarSubmit(payload: { prompt: string }): void {
  interrupt()
  runAction('improve', payload.prompt)
  barPrompt.value = ''
}

function onBarPrompt(value: string): void {
  if (value !== barPrompt.value)
    interrupt()
  barPrompt.value = value
}

// --- the panel --------------------------------------------------------------

function toggleMode(): void {
  interrupt()
  readonly.value = !readonly.value
  // Read-only cannot apply, so a rewrite waiting on the bar steps back into the panel.
  if (readonly.value && activeCard.value?.kind === 'rewrite')
    clearTarget()
}

function onSelectionChipClose(): void {
  const card = activeCard.value
  if (card && card.kind === 'rewrite' && card.phase !== 'applied')
    discardCard(card)
  clearTarget()
  clearReaderSelection()
}

function onSend(payload: PromptBarSendPayload): void {
  const text = payload.text.trim()
  draft.value = ''
  if (!text)
    return
  interrupt()
  const command = ACTION_IDS.find(id => text === `/${id}` || text.startsWith(`/${id} `))
  if (command && target.value) {
    runAction(command, text.slice(command.length + 1).trim() || undefined)
    return
  }
  cardIds += 1
  const card: Card = {
    id: cardIds,
    kind: 'reply',
    scope: 'block',
    prompt: text,
    quote: text,
    original: '',
    body: command ? copy.value.notes.needSelection : copy.value.demoReply,
    variant: 0,
    shown: 0,
    phase: 'thinking',
  }
  cards.value.push(card)
  stickChat(true)
  if (reduced.value || prefersReducedMotion()) {
    settleCard(cardById.value.get(card.id) ?? card)
    return
  }
  later(REPLY_MS, () => streamCard(card.id))
}

function onDraft(value: string): void {
  if (value !== draft.value)
    interrupt()
  draft.value = value
}

function toggleSide(): void {
  sideCollapsed.value = !sideCollapsed.value
  scheduleRefresh()
}

function openSheet(): void {
  sheetOpen.value = true
  scheduleRefresh()
  // The reader asked for the panel, so their focus follows it — without moving the page.
  void nextTick(() => sheetRef.value?.querySelector<HTMLElement>('[data-sheet-close]')?.focus({ preventScroll: true }))
}

function closeSheet(): void {
  sheetOpen.value = false
  scheduleRefresh()
  void nextTick(() => sheetToggleRef.value?.focus({ preventScroll: true }))
}

function jumpToHeading(id: string): void {
  const doc = docRef.value
  const element = doc?.querySelector<HTMLElement>(`[data-block="${id}"]`)
  if (!doc || !element)
    return
  const top = doc.scrollTop + element.getBoundingClientRect().top - doc.getBoundingClientRect().top - 12
  doc.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}

function onRootPointerDown(event: PointerEvent): void {
  // Any reader input inside the template takes over from the script.
  if (event.isPrimary)
    interrupt()
}

function onRootKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && sheetOpen.value && !event.defaultPrevented) {
    // Handled here, so an expanded stage does not collapse on the same press.
    event.preventDefault()
    closeSheet()
  }
}

// ---------------------------------------------------------------------------
// Script
// ---------------------------------------------------------------------------

let scripting = false
let scriptCardId = 0

/**
 * The reader took over from the script: its answer lands at once, and a
 * scripted pick nobody has acted on yet goes away. Answers the reader asked for
 * are left to finish.
 */
function interrupt(): void {
  if (!scripting)
    return
  scripting = false
  finishWriting()
  const current = target.value
  if (current?.scripted && current.cardId === null)
    clearTarget()
}

function onEnter(): void {
  entered = true
  start()
}

function start(): void {
  clearTimers()
  reduced.value = prefersReducedMotion()
  if (reduced.value) {
    // The end state, with no timers: the suggestion is ready and still waits for Apply.
    if (pickBlock(SCRIPT_BLOCK))
      runAction('improve')
    return
  }
  scripting = true
  later(800, () => {
    if (!scripting)
      return
    pickBlock(SCRIPT_BLOCK)
    later(1200, () => {
      if (!scripting)
        return
      runAction('improve')
      // Nothing is scheduled past the suggestion: Apply is the reader's.
      scriptCardId = cardIds
    })
  })
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

function resetDemo(): void {
  clearTimers()
  scripting = false
  scriptCardId = 0
  clearTarget()
  cards.value = []
  Object.assign(texts, seedTexts())
  readonly.value = false
  seesClipboard.value = true
  sideCollapsed.value = false
  sheetOpen.value = false
  draft.value = ''
  flashBlock.value = null
  clearTimeout(flashTimer)
  closeToast()
  targetInView.value = true
  activeHeading.value = HEADINGS[0] ?? ''
  // Rebuilds the panel: the prompt bar and the answers' entrance motion only reset on mount.
  generation.value += 1
  if (entered)
    void nextTick(start)
}

watch(locale, resetDemo)

onBeforeUnmount(() => {
  clearTimers()
  clearTimeout(toastTimer)
  clearTimeout(flashTimer)
  if (refreshFrame)
    window.cancelAnimationFrame(refreshFrame)
  window.removeEventListener('scroll', scheduleRefresh, { capture: true } as EventListenerOptions)
  window.removeEventListener('resize', scheduleRefresh)
  resizeObserver?.disconnect()
  expandObserver?.disconnect()
})

defineExpose({ resetDemo })
</script>

<template>
  <TemplateFrame :title="copy.title" :height="560" @enter="onEnter">
    <template #default="{ width, expanded }">
      <div
        ref="rootRef"
        class="cp"
        :class="[`is-${layoutOf(width)}`, { 'is-collapsed': sideCollapsed && layoutOf(width) !== 'narrow' }]"
        :data-expanded="expanded ? 'true' : undefined"
        @pointerdown="onRootPointerDown"
        @keydown="onRootKeydown"
      >
        <header class="cp-bar">
          <span class="cp-bar__file">
            <span class="cp-bar__icon i-carbon-document" aria-hidden="true" />
            <span class="cp-bar__path">
              <span class="cp-bar__dir">{{ copy.path }} /</span>
              <strong>README.md</strong>
            </span>
          </span>
          <span class="cp-bar__state" :class="{ 'is-dirty': dirtyCount > 0 }">
            <span class="cp-bar__dot" aria-hidden="true" />
            {{ dirtyCount > 0 ? copy.unsaved(dirtyCount) : copy.saved }}
          </span>
          <span v-if="layoutOf(width) === 'wide' || layoutOf(width) === 'full'" class="cp-bar__count">
            {{ copy.words(wordCount) }}
          </span>
          <span class="cp-bar__spacer" />
          <button
            v-if="layoutOf(width) === 'narrow'"
            ref="sheetToggleRef"
            type="button"
            class="cp-bar__pill"
            :class="{ 'has-pending': pendingCount > 0 }"
            :aria-expanded="sheetOpen"
            :aria-controls="sheetId"
            @click="sheetOpen ? closeSheet() : openSheet()"
          >
            <span class="i-carbon-chat-bot" aria-hidden="true" />
            {{ copy.pill(pendingCount) }}
          </button>
          <TxIconButton icon="i-carbon-renew" size="sm" :label="copy.rerun" @click="resetDemo" />
        </header>

        <div class="cp-body">
          <nav v-if="layoutOf(width) === 'full'" class="cp-toc" :aria-label="copy.tocTitle">
            <p class="cp-toc__title">
              {{ copy.tocTitle }}
            </p>
            <button
              v-for="id in HEADINGS"
              :key="id"
              type="button"
              class="cp-toc__item"
              :class="{ 'is-active': activeHeading === id }"
              :aria-current="activeHeading === id ? 'true' : undefined"
              @click="jumpToHeading(id)"
            >
              {{ plain(texts[id] ?? '') }}
            </button>
          </nav>

          <main class="cp-main">
            <div ref="docRef" :key="generation" class="cp-doc" :aria-label="copy.docLabel" role="region">
              <article ref="articleRef" class="cp-doc__article" :lang="lang">
                <template v-for="row in DOC_ROWS" :key="row.id">
                  <ul v-if="row.type === 'list'" class="cp-doc__list">
                    <li
                      v-for="id in row.ids"
                      :key="id"
                      class="cp-doc__block is-li"
                      :class="{ 'is-flash': flashBlock === id }"
                      :data-block="id"
                      @animationend="flashBlock = null"
                    >
                      <span
                        class="cp-doc__text"
                        :class="{ 'is-picked': pickedBlock === id }"
                        :data-block-text="id"
                      ><template v-for="(segment, index) in segmentsOf(id)" :key="index"><strong v-if="segment.kind === 'strong'">{{ segment.text }}</strong><code v-else-if="segment.kind === 'code'">{{ segment.text }}</code><template v-else>{{ segment.text }}</template></template></span>
                    </li>
                  </ul>
                  <pre
                    v-else-if="BLOCKS[row.id]?.kind === 'code'"
                    class="cp-doc__block is-code"
                    :class="{ 'is-flash': flashBlock === row.id }"
                    :data-block="row.id"
                    @animationend="flashBlock = null"
                  ><code
                    class="cp-doc__text"
                    :class="{ 'is-picked': pickedBlock === row.id }"
                    :data-block-text="row.id"
                  >{{ texts[row.id] }}</code></pre>
                  <component
                    :is="blockTag(row.id)"
                    v-else
                    class="cp-doc__block"
                    :class="[`is-${BLOCKS[row.id]?.kind}`, { 'is-flash': flashBlock === row.id }]"
                    :data-block="row.id"
                    @animationend="flashBlock = null"
                  >
                    <span
                      class="cp-doc__text"
                      :class="{ 'is-picked': pickedBlock === row.id }"
                      :data-block-text="row.id"
                    ><template v-for="(segment, index) in segmentsOf(row.id)" :key="index"><strong v-if="segment.kind === 'strong'">{{ segment.text }}</strong><code v-else-if="segment.kind === 'code'">{{ segment.text }}</code><template v-else>{{ segment.text }}</template></template></span>
                  </component>
                </template>
              </article>
            </div>

            <!-- Keeps its box while closed, so it is inert until it opens; pointer
                 or focus on it holds it open, otherwise it closes by itself. -->
            <div
              class="cp-toast"
              :class="{ 'is-open': toast.open }"
              :inert="toast.open ? undefined : true"
              @mouseenter="holdToast('hover')"
              @mouseleave="releaseToast('hover')"
              @focusin="holdToast('focus')"
              @focusout="onToastFocusOut"
            >
              <TxToastPanel :open="toast.open" :tether="false" :stack="0" :aria-label="copy.toastLabel">
                <div class="cp-toast__card">
                  <span class="cp-toast__icon i-carbon-checkmark-filled" aria-hidden="true" />
                  <span class="cp-toast__text">{{ copy.toast }}</span>
                  <button
                    v-if="toastCard && canUndo(toastCard)"
                    type="button"
                    class="cp-toast__undo"
                    @click="undoCard(toastCard)"
                  >
                    {{ copy.undo }}
                  </button>
                  <button type="button" class="cp-toast__close" :aria-label="copy.dismiss" @click="closeToast">
                    <span class="i-carbon-close" aria-hidden="true" />
                  </button>
                </div>
              </TxToastPanel>
            </div>
          </main>

          <aside
            v-if="layoutOf(width) !== 'narrow' && sideCollapsed"
            class="cp-rail"
            :aria-label="copy.copilotLabel"
          >
            <span class="cp-rail__orb">
              <TxThinkingOrb
                :state="orbState"
                :size="20"
                :display-size="22"
                :paused="!working || reduced"
                :label="copy.copilot"
              />
            </span>
            <span v-if="pendingCount > 0" class="cp-rail__count" aria-hidden="true">
              {{ pendingCount }}
            </span>
            <TxIconButton
              icon="i-carbon-side-panel-open"
              size="sm"
              :label="pendingCount > 0 ? `${copy.expandSide} · ${copy.pending(pendingCount)}` : copy.expandSide"
              @click="toggleSide"
            />
          </aside>

          <aside
            v-else-if="layoutOf(width) !== 'narrow' || sheetOpen"
            :id="sheetId"
            ref="sheetRef"
            :key="`side-${generation}`"
            class="cp-side"
            :class="{ 'is-sheet': layoutOf(width) === 'narrow' }"
            :aria-label="copy.copilotLabel"
          >
            <div class="cp-side__head">
              <span class="cp-side__orb">
                <TxThinkingOrb
                  :state="orbState"
                  :size="20"
                  :display-size="22"
                  :paused="!working || reduced"
                  :label="copy.copilot"
                />
              </span>
              <span class="cp-side__name">{{ copy.copilot }}</span>
              <TxModeChip
                class="cp-side__mode"
                :label="readonly ? copy.mode.readonly : copy.mode.edit"
                :icon="readonly ? 'i-carbon-view' : 'i-carbon-locked'"
                :tone="readonly ? 'info' : 'muted'"
                @click="toggleMode"
              />
              <TxIconButton
                v-if="layoutOf(width) === 'narrow'"
                data-sheet-close
                icon="i-carbon-close"
                size="sm"
                :label="copy.closeSheet"
                @click="closeSheet"
              />
              <TxIconButton
                v-else
                icon="i-carbon-side-panel-close"
                size="sm"
                :label="copy.collapse"
                @click="toggleSide"
              />
            </div>

            <div class="cp-side__context">
              <span class="cp-side__sees">{{ copy.sees(seenCount) }}</span>
              <TxTag label="README.md" icon="i-carbon-document" variant="plain" size="sm" />
              <TxTag
                v-if="target"
                :label="copy.selectionChip(selectionSize)"
                icon="i-carbon-text-selection"
                color="var(--tx-bui-accent, #0285ff)"
                variant="soft"
                size="sm"
                closable
                :close-aria-label="copy.selectionChipClose"
                @close="onSelectionChipClose"
              />
              <TxTag
                :label="copy.clipboardChip"
                icon="i-carbon-paste"
                :variant="seesClipboard ? 'soft' : 'plain'"
                :color="seesClipboard ? 'var(--tx-bui-green, #189a4d)' : undefined"
                size="sm"
                class="cp-side__clip"
                :class="{ 'is-off': !seesClipboard }"
                :aria-pressed="seesClipboard"
                @click="seesClipboard = !seesClipboard"
              />
            </div>

            <div ref="chatRef" class="cp-side__chat">
              <div v-if="cards.length === 0" class="cp-empty">
                <p class="cp-empty__title">
                  <span class="i-carbon-text-selection" aria-hidden="true" />
                  {{ copy.emptyTitle }}
                </p>
                <p class="cp-empty__text">
                  {{ copy.emptyText }}
                </p>
                <p class="cp-empty__label">
                  {{ copy.starters }}
                </p>
                <TxSuggestionChips :suggestions="startSuggestions" layout="list" @select="onSuggestion" />
              </div>

              <div v-for="card in cards" :key="card.id" class="cp-turn">
                <TxChatMessage class="cp-echo" :message="echoMessage(card)" :markdown="false">
                  <template #avatar>
                    <span class="cp-avatar" aria-hidden="true">
                      <span class="i-carbon-user" />
                    </span>
                  </template>
                </TxChatMessage>

                <div class="cp-answer" :class="[`is-${card.kind}`, `is-${card.phase}`]">
                  <div class="cp-answer__who">
                    <span class="cp-answer__mark" aria-hidden="true">
                      <span :class="card.action ? ACTION_ICONS[card.action] : 'i-carbon-chat-bot'" />
                    </span>
                    <span class="cp-answer__name">{{ copy.copilot }}</span>
                    <TxStatusBadge
                      v-if="cardStatus(card)"
                      class="cp-answer__status"
                      size="sm"
                      :text="cardStatus(card)!.text"
                      :status="cardStatus(card)!.status"
                    />
                  </div>

                  <TxTypingIndicator v-if="card.phase === 'thinking'" :text="thinkingText(card)" />

                  <template v-else-if="card.kind === 'rewrite'">
                    <div class="cp-diff">
                      <p class="cp-diff__row is-before">
                        <span class="cp-diff__label">{{ copy.before }}</span>
                        <del class="cp-diff__text"><template v-for="(segment, index) in parseInline(card.original)" :key="index"><code v-if="segment.kind === 'code'">{{ segment.text }}</code><template v-else>{{ segment.text }}</template></template></del>
                      </p>
                      <p class="cp-diff__row is-after">
                        <span class="cp-diff__label">{{ copy.after }}</span>
                        <ins class="cp-diff__text"><template v-for="(segment, index) in parseInline(cardText(card))" :key="index"><code v-if="segment.kind === 'code'">{{ segment.text }}</code><template v-else>{{ segment.text }}</template></template></ins>
                      </p>
                    </div>
                    <p v-if="card.prompt || card.scope !== 'block'" class="cp-answer__note">
                      <span class="i-carbon-information" aria-hidden="true" />
                      {{ card.prompt ? copy.asked(card.prompt) : card.scope === 'first' ? copy.scope.first : copy.scope.partial }}
                    </p>
                    <template v-if="card.phase !== 'streaming'">
                      <div v-if="card.phase === 'ready'" class="cp-answer__actions">
                        <TxButton variant="primary" size="sm" icon="i-carbon-checkmark" :disabled="readonly" @click="applyCard(card)">
                          {{ copy.apply }}
                        </TxButton>
                        <TxButton variant="ghost" size="sm" @click="discardCard(card)">
                          {{ copy.discard }}
                        </TxButton>
                      </div>
                      <div v-else-if="canUndo(card)" class="cp-answer__actions">
                        <TxButton variant="ghost" size="sm" icon="i-carbon-undo" @click="undoCard(card)">
                          {{ copy.undo }}
                        </TxButton>
                      </div>
                      <div class="cp-answer__foot">
                        <TxDiffChips :diffs="DIFFS" :stagger-step="0" @select="revealBlock(card.blockId)" />
                        <TxMessageActions
                          :copy-text="plain(card.body)"
                          :appear="!reduced"
                          v-bind="copy.messageActions"
                        />
                      </div>
                      <p v-if="card.phase === 'ready'" class="cp-answer__hint" :class="{ 'is-readonly': readonly }">
                        <span class="i-carbon-locked" aria-hidden="true" />
                        {{ readonly ? copy.readonlyApply : copy.applyHint }}
                      </p>
                    </template>
                  </template>

                  <TxStreamMarkdown
                    v-else-if="card.kind === 'explain'"
                    class="cp-md"
                    :content="cardText(card)"
                    :streaming="card.phase === 'streaming'"
                  />

                  <p v-else class="cp-answer__say" :class="{ 'is-note': card.kind === 'note' }">
                    {{ card.body }}
                  </p>
                </div>
              </div>

              <p v-if="readonly" class="cp-side__readonly">
                <span class="i-carbon-view" aria-hidden="true" />
                {{ copy.readonlyHint }}
              </p>
            </div>

            <div class="cp-side__foot">
              <TxSuggestionChips
                v-if="nextSuggestions.length > 0 && !working"
                class="cp-side__next"
                :suggestions="nextSuggestions"
                @select="onSuggestion"
              />
              <TxPromptBar
                :model-value="draft"
                :sources="copy.sources"
                :commands="copy.commands"
                :placeholder="copy.prompt.placeholder"
                :send-label="copy.prompt.sendLabel"
                :attach-label="copy.prompt.attachLabel"
                :sources-hint-text="copy.prompt.sourcesHintText"
                :commands-hint-text="copy.prompt.commandsHintText"
                :empty-text-formatter="copy.prompt.emptyText"
                :connect-text="copy.prompt.connectText"
                :connected-text="copy.prompt.connectedText"
                :attachment-fallback-label="copy.prompt.attachmentFallbackLabel"
                :remove-attachment-label-formatter="copy.prompt.removeAttachmentLabel"
                @update:model-value="onDraft"
                @send="onSend"
              />
            </div>
          </aside>
        </div>

        <div class="cp-anchor">
          <TxSelectionActions
            ref="barRef"
            :selection="barSelection"
            :state="barState"
            :actions="barActions"
            :active-action-id="activeCard?.action"
            :expanded="barExpanded"
            :prompt="barPrompt"
            :hide-prompt="readonly || layoutOf(width) === 'narrow'"
            v-bind="copy.bar"
            @update:expanded="barExpanded = $event"
            @update:prompt="onBarPrompt"
            @action="onBarAction"
            @submit="onBarSubmit"
            @keep="applyCard(activeCard)"
            @discard="discardCard(activeCard)"
            @retry="retryCard(activeCard)"
          >
            <template #action-icon="{ action }">
              <span class="cp-bar-icon" :class="ACTION_ICONS[action.id] ?? 'i-carbon-edit'" aria-hidden="true" />
            </template>
          </TxSelectionActions>
        </div>
      </div>
    </template>
  </TemplateFrame>
</template>

<style scoped>
.cp {
  position: relative;
  display: grid;
  grid-template-rows: 44px minmax(0, 1fr);
  height: 100%;
  background: var(--tx-bui-page, #fafafb);
  color: var(--tx-bui-ink, #1f2124);
  font-size: 13px;
}

/* --- host toolbar ---------------------------------------------------------- */

.cp-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding: 0 10px 0 14px;
  box-shadow: inset 0 -1px 0 var(--tx-bui-line, #ecedef);
}

.cp-bar__file {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.cp-bar__icon {
  flex: none;
  color: var(--tx-bui-ink-2, #62656b);
  font-size: 15px;
}

.cp-bar__path {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cp-bar__dir {
  margin-right: 4px;
  color: var(--tx-bui-ink-3, #9a9da3);
}

.cp-bar__path strong {
  font-weight: 600;
}

.cp-bar__state {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  color: var(--tx-bui-ink-2, #62656b);
  font-size: 12px;
  white-space: nowrap;
}

.cp-bar__dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--tx-bui-green, #189a4d);
}

.cp-bar__state.is-dirty .cp-bar__dot {
  background: var(--tx-bui-orange, #ef720c);
}

.cp-bar__count {
  flex: none;
  color: var(--tx-bui-ink-3, #9a9da3);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.cp-bar__spacer {
  flex: 1;
}

.cp-bar__pill {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: 0;
  border-radius: 999px;
  background: var(--tx-bui-surface, #fff);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
  color: var(--tx-bui-ink, #1f2124);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
}

.cp-bar__pill:hover {
  background: var(--tx-bui-hover, #f4f5f6);
}

.cp-bar__pill.has-pending {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tx-bui-accent, #0285ff) 45%, transparent);
  color: var(--tx-bui-accent-ink, #0170dd);
}

.cp-bar__pill:focus-visible {
  outline: 2px solid var(--tx-bui-accent, #0285ff);
  outline-offset: 2px;
}

/* --- body ------------------------------------------------------------------ */

.cp-body {
  display: flex;
  min-height: 0;
}

.cp-toc {
  display: flex;
  width: 196px;
  flex: none;
  flex-direction: column;
  gap: 2px;
  padding: 18px 12px;
  box-shadow: inset -1px 0 0 var(--tx-bui-line, #ecedef);
}

.cp-toc__title {
  margin: 0 0 6px;
  padding: 0 8px;
  color: var(--tx-bui-ink-3, #9a9da3);
  font-size: 12px;
  font-weight: 500;
}

.cp-toc__item {
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--tx-bui-ink-2, #62656b);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  text-align: left;
}

.cp-toc__item:hover {
  background: var(--tx-bui-hover, #f4f5f6);
  color: var(--tx-bui-ink, #1f2124);
}

.cp-toc__item.is-active {
  box-shadow: inset 2px 0 0 var(--tx-bui-accent, #0285ff);
  color: var(--tx-bui-ink, #1f2124);
  font-weight: 500;
}

.cp-toc__item:focus-visible {
  outline: 2px solid var(--tx-bui-accent, #0285ff);
  outline-offset: 1px;
}

.cp-main {
  position: relative;
  min-width: 0;
  flex: 1;
}

.cp-doc {
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
}

/* The page being written: a plain reading column. The bottom padding leaves
   room for the bar under the last line when the article is scrolled to its end. */
.cp-doc__article {
  box-sizing: border-box;
  max-width: 680px;
  margin: 0 auto;
  padding: 20px 24px 72px;
}

.cp-doc__block {
  margin: 0;
  border-radius: 6px;
}

.cp-doc__block + .cp-doc__block,
.cp-doc__list + .cp-doc__block,
.cp-doc__block + .cp-doc__list {
  margin-top: 10px;
}

.cp-doc__block.is-h1 {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.35;
}

.cp-doc__block.is-h2 {
  margin-top: 22px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.cp-doc__block.is-p,
.cp-doc__block.is-li {
  color: var(--tx-bui-ink, #1f2124);
  font-size: 13.5px;
  line-height: 1.7;
}

.cp-doc__list {
  margin: 10px 0 0;
  padding-left: 1.3em;
}

.cp-doc__block.is-li + .cp-doc__block.is-li {
  margin-top: 2px;
}

.cp-doc__block.is-code {
  margin-top: 10px;
  padding: 10px 12px;
  overflow-x: auto;
  background: var(--tx-bui-inset, #f7f8f9);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
  font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
  font-size: 12px;
  line-height: 1.6;
}

.cp-doc__text {
  border-radius: 3px;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

.cp-doc__text code {
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--tx-bui-field, #f2f2f3);
  font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
  font-size: 0.9em;
}

.cp-doc__block.is-code .cp-doc__text {
  padding: 0;
  background: transparent;
  font-size: inherit;
}

.cp-doc__text strong {
  font-weight: 600;
}

/* What the copilot is working on: a template-made selection or a pinned one. */
.cp-doc__text.is-picked {
  background: color-mix(in srgb, var(--tx-bui-accent, #0285ff) 16%, transparent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--tx-bui-accent, #0285ff) 16%, transparent);
}

.cp-doc__block.is-flash {
  box-shadow: 0 0 0 2px var(--tx-bui-green, #189a4d);
}

@media (prefers-reduced-motion: no-preference) {
  .cp-doc__block.is-flash {
    animation: cp-flash 1.2s ease-out forwards;
  }
}

@keyframes cp-flash {
  from {
    background: color-mix(in srgb, var(--tx-bui-green, #189a4d) 18%, transparent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--tx-bui-green, #189a4d) 55%, transparent);
  }

  to {
    background: transparent;
    box-shadow: 0 0 0 3px transparent;
  }
}

/* --- toast ----------------------------------------------------------------- */

/* Keeps its box while closed (that is how the panel avoids a layout jump), so
   it lets clicks through until it opens. */
.cp-toast {
  position: absolute;
  z-index: 3;
  bottom: 14px;
  left: 16px;
  width: min(340px, calc(100% - 32px));
  pointer-events: none;
}

.cp-toast.is-open {
  pointer-events: auto;
}

.cp-toast__card {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
}

.cp-toast__icon {
  flex: none;
  color: var(--tx-bui-green, #189a4d);
  font-size: 15px;
}

.cp-toast__text {
  min-width: 0;
  flex: 1;
  font-weight: 500;
}

.cp-toast__undo,
.cp-toast__close {
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

.cp-toast__undo {
  height: 24px;
  padding: 0 8px;
  color: var(--tx-bui-accent-ink, #0170dd);
  font-size: 12px;
  font-weight: 500;
}

.cp-toast__close {
  width: 22px;
  height: 22px;
  color: var(--tx-bui-ink-3, #9a9da3);
}

.cp-toast__undo:hover,
.cp-toast__close:hover {
  background: var(--tx-bui-hover, #f4f5f6);
}

.cp-toast__undo:focus-visible,
.cp-toast__close:focus-visible {
  outline: 2px solid var(--tx-bui-accent, #0285ff);
  outline-offset: 1px;
}

/* --- collapsed rail -------------------------------------------------------- */

.cp-rail {
  display: flex;
  width: 48px;
  flex: none;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 12px 0;
  background: var(--tx-bui-canvas, #f1f2f3);
  box-shadow: inset 1px 0 0 var(--tx-bui-line, #ecedef);
}

.cp-rail__orb,
.cp-side__orb {
  display: grid;
  width: 28px;
  height: 28px;
  flex: none;
  place-items: center;
  border-radius: 8px;
  background: var(--tx-bui-surface, #fff);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
}

.cp-rail__count {
  display: grid;
  min-width: 20px;
  height: 20px;
  place-items: center;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--tx-bui-accent-tint, #e9f3ff);
  color: var(--tx-bui-accent-ink, #0170dd);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* --- side panel ------------------------------------------------------------ */

/* Opaque on purpose: the chips and messages inside are transparent in dark mode.
   No overflow clipping here — the prompt bar's menus open upward over the chat. */
.cp-side {
  display: flex;
  width: 300px;
  min-height: 0;
  flex: none;
  flex-direction: column;
  background: var(--tx-bui-canvas, #f1f2f3);
  box-shadow: inset 1px 0 0 var(--tx-bui-line, #ecedef);
}

.cp-side__head {
  display: flex;
  height: 46px;
  flex: none;
  align-items: center;
  gap: 8px;
  padding: 0 8px 0 12px;
}

.cp-side__name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cp-side__mode {
  flex: none;
}

.cp-side__context {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 0 12px 10px;
  box-shadow: inset 0 -1px 0 var(--tx-bui-line, #ecedef);
}

.cp-side__sees {
  width: 100%;
  color: var(--tx-bui-ink-3, #9a9da3);
  font-size: 12px;
}

.cp-side__clip {
  cursor: pointer;
}

.cp-side__clip.is-off {
  text-decoration: line-through;
}

.cp-side__chat {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  gap: 14px;
  padding: 12px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.cp-side__readonly {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--tx-bui-ink-2, #62656b);
  font-size: 12px;
}

.cp-side__foot {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 8px;
  padding: 8px 12px 12px;
}

.cp-side__next {
  min-width: 0;
}

/* --- empty state ----------------------------------------------------------- */

.cp-empty {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: 12px;
  background: var(--tx-bui-surface, #fff);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
}

.cp-empty__title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.cp-empty__text {
  margin: 0;
  color: var(--tx-bui-ink-2, #62656b);
  font-size: 12.5px;
  line-height: 1.6;
}

.cp-empty__label {
  margin: 6px 0 0;
  color: var(--tx-bui-ink-3, #9a9da3);
  font-size: 12px;
  font-weight: 500;
}

/* --- turns ----------------------------------------------------------------- */

.cp-turn {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cp-echo :deep(.tx-chat-message__bubble) {
  max-width: 88%;
  flex: 0 1 auto;
  border-radius: 12px 4px 12px 12px;
}

.cp-echo :deep(.tx-chat-message__plain) {
  font-size: 12.5px;
}

.cp-avatar {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  color: var(--tx-bui-ink-2, #62656b);
  font-size: 13px;
}

.cp-answer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--tx-bui-surface, #fff);
  box-shadow: var(--tx-bui-shadow-hairline, 0 0 0 1px #ecedef);
}

.cp-answer.is-discarded {
  opacity: 0.7;
}

.cp-answer__who {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cp-answer__mark {
  display: grid;
  width: 20px;
  height: 20px;
  flex: none;
  place-items: center;
  border-radius: 6px;
  background: var(--tx-bui-accent-tint, #e9f3ff);
  color: var(--tx-bui-accent-ink, #0170dd);
  font-size: 12px;
}

.cp-answer__name {
  min-width: 0;
  flex: 1;
  font-size: 12px;
  font-weight: 600;
}

.cp-answer__status {
  flex: none;
}

.cp-diff {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cp-diff__row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
}

.cp-diff__label {
  color: var(--tx-bui-ink-3, #9a9da3);
  font-size: 11px;
  font-weight: 500;
}

.cp-diff__text {
  padding: 4px 6px;
  border-radius: 6px;
  font-size: 13px;
  line-height: 1.6;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}

/* Struck through and underlined, not only red and green. */
.cp-diff__row.is-before .cp-diff__text {
  background: var(--tx-bui-red-tint, #fdecec);
  color: var(--tx-bui-ink-2, #62656b);
  text-decoration: line-through;
  text-decoration-color: color-mix(in srgb, var(--tx-bui-red, #e3474c) 70%, transparent);
}

.cp-diff__row.is-after .cp-diff__text {
  background: var(--tx-bui-green-tint, #e8f5ed);
  color: var(--tx-bui-ink, #1f2124);
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--tx-bui-green, #189a4d) 60%, transparent);
  text-underline-offset: 3px;
}

.cp-diff__text code {
  font-family: var(--tx-bui-font-mono, ui-monospace, monospace);
  font-size: 0.9em;
}

.cp-answer__note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  color: var(--tx-bui-ink-2, #62656b);
  font-size: 12px;
  line-height: 1.5;
}

.cp-answer__note > span {
  flex: none;
  margin-top: 2px;
}

.cp-answer__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cp-answer__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.cp-answer__foot :deep(.tx-bui-diff-chips) {
  width: auto;
}

.cp-answer__hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--tx-bui-ink-2, #62656b);
  font-size: 12px;
}

.cp-answer__hint > span {
  flex: none;
  color: var(--tx-bui-orange, #ef720c);
}

.cp-answer__say {
  margin: 0;
  color: var(--tx-bui-ink-2, #62656b);
  font-size: 12.5px;
  line-height: 1.6;
}

.cp-md :deep(.markdown-body) {
  font-size: 13px;
  line-height: 1.65;
}

.cp-md :deep(.markdown-body p) {
  margin: 0 0 8px;
}

.cp-md :deep(.markdown-body p:last-child) {
  margin-bottom: 0;
}

/* --- the bar's icons ------------------------------------------------------- */

.cp-anchor {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
}

.cp-bar-icon {
  font-size: 14px;
}

/* --- container tiers ------------------------------------------------------- */

/* Narrow: the copilot is a sheet over the lower part of the page, opened from
   the toolbar pill. Not a drawer — it stays inside the template. */
@container template (max-width: 639.98px) {
  .cp-bar {
    gap: 8px;
    padding: 0 6px 0 10px;
  }

  .cp-bar__dir {
    display: none;
  }

  .cp-doc__article {
    padding: 16px 16px 72px;
  }

  .cp-side.is-sheet {
    position: absolute;
    z-index: 4;
    right: 0;
    bottom: 0;
    left: 0;
    width: auto;
    height: 68%;
    border-radius: 14px 14px 0 0;
    box-shadow:
      0 -1px 0 var(--tx-bui-line, #ecedef),
      var(--tx-elevation-4, 4px 10px 28px rgba(0, 0, 0, 0.1));
  }

  .cp-toast {
    top: 12px;
    bottom: auto;
  }
}

@container template (max-width: 419.98px) {
  .cp-bar__state {
    display: none;
  }
}

@container template (min-width: 960px) {
  .cp-side {
    width: 360px;
  }

  .cp-doc__article {
    padding: 28px 40px 80px;
  }

  .cp-doc__block.is-h1 {
    font-size: 20px;
  }

  .cp-doc__block.is-p,
  .cp-doc__block.is-li {
    font-size: 14px;
  }
}

@container template (min-width: 1200px) {
  .cp-side {
    width: 380px;
  }
}
</style>
