<script setup lang="ts">
// Store template: the Tuff plugin store inside the desktop client — a featured
// carousel, categories, search with suggestions, plugin cards, details
// (screenshots, permissions with their reasons, versions, reviews) and the
// install / update / uninstall flow.
//
// What is real and what is sample data:
// - Plugin ids, versions, channels, trigger words, required / optional
//   permissions and their reasons come from `plugins/*/manifest.json`; risk
//   levels and permission names from `packages/utils/permission` and its
//   locales; install, update and uninstall wording from core-app's
//   `store.installation.*`, `store.upgradeDialog.*` and `plugin.uninstall.*`.
//   Ratings, install counts, reviews, release notes, sizes and the three
//   community plugins are sample data, and the page says so.
// - Every plugin is free to install: no price, plan, badge or checkout exists
//   anywhere here (apps/nexus/AGENTS.md).
// - Installing, updating and granting permissions only ever start from the
//   reader's click. The scripted playback turns the carousel and reports that
//   updates exist — nothing else.
// - Details are an in-template view (a side panel once expanded), not a
//   TxDrawer: the drawer handles Tab and Escape on document, so the screenshot
//   lightbox and the confirmations opened from it would lose focus to it and
//   one Escape would close two layers.
import type { StoreActionView } from './TemplateStoreAction.vue'
import type { StorePermissionRow } from './TemplateStorePermissions.vue'
import type { FilterChipItem, FilterChipValue } from '@talex-touch/tuffex/filter-chips'
import type { IconChipTone } from '@talex-touch/tuffex/icon-chip'
import type { ImageGalleryItem } from '@talex-touch/tuffex/image-gallery'
import type { TxSearchSelectOption } from '@talex-touch/tuffex/search-select'
import type { SidebarNavGroup, SidebarNavItem, SidebarNavValue } from '@talex-touch/tuffex/sidebar-nav'
import type { StatusTone } from '@talex-touch/tuffex/status-badge'
import { hasNavigator, hasWindow } from '@talex-touch/utils/env'
import { computed, defineComponent, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'
import TemplateStoreAction from './TemplateStoreAction.vue'
import TemplateStorePermissions from './TemplateStorePermissions.vue'

type Mode = 'narrow' | 'column' | 'wide'
type CategoryId = 'productivity' | 'ai' | 'development' | 'utilities' | 'design'
type CategoryFilter = 'all' | CategoryId
type Channel = 'RELEASE' | 'BETA' | 'SNAPSHOT'
type Risk = 'low' | 'medium' | 'high'
type AuthorId = 'team' | 'zy' | 'lm' | 'of'
type ReviewerId = 'lq' | 'mo' | 'ks' | 'ac' | 'nh' | 'you'
type View = 'discover' | 'installed'
type SortKey = 'popular' | 'newest' | 'rating'
type DetailTab = 'overview' | 'permissions' | 'versions' | 'reviews'
type Phase = 'idle' | 'queued' | 'downloading' | 'verifying' | 'installing' | 'uninstalling' | 'failed'
type Op = 'install' | 'update'
type ConfirmKind = 'permission' | 'update' | 'uninstall'
type PermissionId
  = | 'clipboard.read'
    | 'clipboard.write'
    | 'fs.read'
    | 'fs.write'
    | 'fs.tfile'
    | 'fs.index'
    | 'network.internet'
    | 'system.shell'
    | 'system.applications'
    | 'system.notification'
    | 'intelligence.basic'
    | 'storage.plugin'
    | 'search.root-results'
    | 'voice.dictation'
    | 'window.capture'

interface Bi { zh: string, en: string }
interface Grant { id: PermissionId, reason: Bi }
interface Feature { name: Bi, triggers: string[] }
interface Release { version: string, channel: Channel, days: number, note: Bi }
interface ReviewSeed { author: ReviewerId, stars: number, days: number, body: Bi, helpful: number }

interface Plugin {
  id: string
  /** Folder / manifest `name`. */
  slug: string
  name: Bi
  summary: Bi
  category: CategoryId
  version: string
  channel: Channel
  icon: string
  author: AuthorId
  /** Package size in MB (sample). */
  size: number
  required: Grant[]
  optional: Grant[]
  features: Feature[]
  rating: number
  reviews: number
  installs: number
  /** Days since the latest release. */
  days: number
  releases?: Release[]
  reviewSeeds?: ReviewSeed[]
  /** Permissions the latest version adds over the installed one. */
  adds?: PermissionId[]
  /** A community sample whose first download times out, to show the failure path. */
  flaky?: boolean
}

interface Review {
  key: string
  author: ReviewerId
  stars: number
  days: number
  body: string
  helpful: number
  pending: boolean
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

function L(text: Bi): string {
  return zh.value ? text.zh : text.en
}

function prefersReducedMotion(): boolean {
  return hasWindow() && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* ─── Catalogue ───────────────────────────────────────────────────────── */

function bi(zh: string, en: string): Bi {
  return { zh, en }
}

function grant(id: PermissionId, zh: string, en: string): Grant {
  return { id, reason: { zh, en } }
}

function feature(zh: string, en: string, ...triggers: string[]): Feature {
  return { name: { zh, en }, triggers }
}

const NOW = Date.UTC(2026, 8, 24, 2, 0)
const DAY = 86_400_000

// Risk levels and names from packages/utils/permission (registry.ts and the
// zh / en locales). Every plugin that shows up in CoreBox asks for
// `search.root-results`, which the registry rates high.
const PERMISSIONS: Record<PermissionId, { risk: Risk, name: Bi, icon: string }> = {
  'clipboard.read': { risk: 'medium', name: bi('读取剪贴板', 'Read Clipboard'), icon: 'i-carbon-paste' },
  'clipboard.write': { risk: 'low', name: bi('写入剪贴板', 'Write Clipboard'), icon: 'i-carbon-copy' },
  'fs.read': { risk: 'medium', name: bi('读取文件', 'Read Files'), icon: 'i-carbon-document' },
  'fs.write': { risk: 'high', name: bi('写入文件', 'Write Files'), icon: 'i-carbon-document-export' },
  'fs.tfile': { risk: 'medium', name: bi('临时文件引用', 'Temporary File References'), icon: 'i-carbon-document-attachment' },
  'fs.index': { risk: 'medium', name: bi('文件索引', 'File Index'), icon: 'i-carbon-folder-details' },
  'network.internet': { risk: 'medium', name: bi('互联网访问', 'Internet Access'), icon: 'i-carbon-earth' },
  'system.shell': { risk: 'high', name: bi('执行命令', 'Execute Commands'), icon: 'i-carbon-terminal' },
  'system.applications': { risk: 'low', name: bi('查询已安装应用', 'Query Installed Applications'), icon: 'i-carbon-application' },
  'system.notification': { risk: 'low', name: bi('系统通知', 'Notifications'), icon: 'i-carbon-notification' },
  'intelligence.basic': { risk: 'low', name: bi('基础 Intelligence', 'Basic Intelligence'), icon: 'i-carbon-machine-learning-model' },
  'storage.plugin': { risk: 'low', name: bi('插件存储', 'Plugin Storage'), icon: 'i-carbon-data-base' },
  'search.root-results': { risk: 'high', name: bi('推送根搜索结果', 'Push Root Search Results'), icon: 'i-carbon-search' },
  'voice.dictation': { risk: 'medium', name: bi('语音听写', 'Voice Dictation'), icon: 'i-carbon-microphone' },
  'window.capture': { risk: 'high', name: bi('屏幕截图', 'Screen Capture'), icon: 'i-carbon-screen' },
}

// The warning tone's default glyph is a clock and the danger one a cross,
// which would read as "pending" and "denied"; each level names its own.
const RISK: Record<Risk, { tone: StatusTone, icon: string }> = {
  low: { tone: 'success', icon: 'i-carbon-security' },
  medium: { tone: 'warning', icon: 'i-carbon-warning' },
  high: { tone: 'danger', icon: 'i-carbon-warning-alt' },
}

// Manifests almost all say `utilities`; these groupings are the template's.
// `art` is image content (tiles, banners, screenshots), tuned to read on both
// docs themes, so it is not tokenised.
const CATEGORIES: Record<CategoryId, { label: Bi, icon: string, tone: IconChipTone, art: [string, string, string] }> = {
  productivity: { label: bi('效率', 'Productivity'), icon: 'i-carbon-time', tone: 'accent', art: ['#0b1f4d', '#2563eb', '#7dd3fc'] },
  ai: { label: bi('AI', 'AI'), icon: 'i-carbon-ai', tone: 'green', art: ['#06291f', '#0f9d74', '#a7f3d0'] },
  development: { label: bi('开发', 'Development'), icon: 'i-carbon-code', tone: 'ink', art: ['#15132b', '#6d5dfc', '#c4b5fd'] },
  utilities: { label: bi('工具', 'Utilities'), icon: 'i-carbon-tools', tone: 'orange', art: ['#2a1405', '#e8720c', '#fed7aa'] },
  design: { label: bi('设计', 'Design'), icon: 'i-carbon-paint-brush', tone: 'red', art: ['#2a0a1f', '#d9467f', '#fbcfe8'] },
}

const CATEGORY_IDS: CategoryId[] = ['productivity', 'ai', 'development', 'utilities', 'design']

// The release channels read like TxVersionCapsule's tones: stable, preview, nightly.
const CHANNEL_COLOR: Record<Channel, string> = {
  RELEASE: 'var(--tx-color-success)',
  BETA: 'var(--tx-color-primary)',
  SNAPSHOT: 'var(--tx-color-warning)',
}

const AUTHORS: Record<AuthorId, Bi> = {
  team: bi('TalexTouch Team', 'TalexTouch Team'),
  zy: bi('周屿', 'Zhou Yu'),
  lm: bi('Léa Martin', 'Léa Martin'),
  of: bi('Omar Farouk', 'Omar Farouk'),
}

const REVIEWERS: Record<ReviewerId, { name: Bi, hue: string }> = {
  lq: { name: bi('林乔', 'Lin Qiao'), hue: 'var(--tx-chart-categorical-1, #4290f0)' },
  mo: { name: bi('Mara Okafor', 'Mara Okafor'), hue: 'var(--tx-chart-categorical-6, #d37536)' },
  ks: { name: bi('佐藤健二', 'Kenji Sato'), hue: 'var(--tx-chart-categorical-5, #50c3b6)' },
  ac: { name: bi('Ava Chen', 'Ava Chen'), hue: 'var(--tx-chart-categorical-3, #e8649d)' },
  nh: { name: bi('Noor Haddad', 'Noor Haddad'), hue: 'var(--tx-chart-categorical-4, #8d58ee)' },
  you: { name: bi('你', 'You'), hue: 'var(--tx-color-primary, #409eff)' },
}

const REVIEWER_ROTATION: ReviewerId[] = ['lq', 'mo', 'ks', 'ac', 'nh']

const GENERIC_REVIEWS: Array<{ stars: number, days: number, helpful: number, body: Bi }> = [
  { stars: 5, days: 3, helpful: 12, body: bi('装上就能用，在 CoreBox 里输入触发词直接出结果。', 'Worked straight away: type the trigger in CoreBox and it’s there.') },
  { stars: 5, days: 9, helpful: 7, body: bi('权限理由写得很清楚，知道它为什么要这些。', 'The permission reasons are clear, so I know why it needs each one.') },
  { stars: 4, days: 21, helpful: 3, body: bi('体积小、响应快，希望再多几个可调的选项。', 'Small and quick. I’d like a few more options to tweak it.') },
]

const PLUGINS: Plugin[] = [
  {
    id: 'com.tuffex.clipboard-history',
    slug: 'clipboard-history',
    name: bi('剪贴板历史', 'Clipboard History'),
    summary: bi('一款全平台剪贴板历史记录插件，从 Tuff 核心提取剪贴板历史。', 'A cross-platform clipboard history plugin, extracted from the Tuff core.'),
    category: 'productivity',
    version: '1.2.0-beta.6',
    channel: 'BETA',
    icon: 'i-carbon-paste',
    author: 'team',
    size: 2.3,
    required: [
      grant('clipboard.read', '读取剪贴板历史记录并展示详情', 'Reads clipboard history and shows each item’s details'),
      grant('clipboard.write', '将选中的剪贴记录重新写回系统剪贴板', 'Writes the selected item back to the system clipboard'),
      grant('fs.tfile', '显示剪贴板图片原图和来源应用图标', 'Shows full-size clipboard images and source app icons'),
      grant('search.root-results', '将剪贴板历史入口推送到 CoreBox 根搜索结果', 'Puts the clipboard history entry in CoreBox root results'),
      grant('system.applications', '按剪贴记录中的应用标识显示来源应用名称和图标', 'Resolves each item’s source app name and icon from its app identifier'),
    ],
    optional: [
      grant('system.shell', '用默认浏览器打开剪贴记录里的链接，以及在文件管理器中定位剪贴的文件', 'Opens links from clipboard items in the default browser and reveals copied files in the file manager'),
    ],
    features: [feature('剪贴板历史记录', 'Clipboard history', 'clipboard-history', '剪贴板历史记录', '剪贴板')],
    rating: 4.8,
    reviews: 1240,
    installs: 38000,
    days: 6,
    releases: [
      { version: '1.2.0-beta.6', channel: 'BETA', days: 6, note: bi('图片条目支持原图预览', 'Full-size preview for image clips') },
      { version: '1.2.0-beta.5', channel: 'BETA', days: 15, note: bi('按来源应用筛选剪贴记录', 'Filter clips by source app') },
      { version: '1.1.3', channel: 'RELEASE', days: 22, note: bi('修复固定条目偶尔被清理的问题', 'Fixed pinned clips occasionally being cleaned up') },
      { version: '1.1.2', channel: 'RELEASE', days: 35, note: bi('中文搜索更准确', 'More accurate Chinese search') },
    ],
    reviewSeeds: [
      { author: 'lq', stars: 5, days: 2, helpful: 31, body: bi('图片条目终于能看原图了，截图党狂喜。', 'Image clips finally open at full size. Great for screenshots.') },
      { author: 'mo', stars: 5, days: 9, helpful: 18, body: bi('固定的条目重启后还在，这正是我要的。', 'Pinned clips survive a restart, which is all I wanted.') },
      { author: 'ks', stars: 4, days: 16, helpful: 6, body: bi('按来源应用筛选很好用，希望能自定义保留条数。', 'Filtering by source app is great; I’d like to set how many clips to keep.') },
    ],
    adds: ['system.applications'],
  },
  {
    id: 'com.tuffex.translation',
    slug: 'touch-translation',
    name: bi('翻译', 'Translate'),
    summary: bi('一款全平台资源聚合翻译平台，支持多种翻译服务。', 'A cross-platform translation hub that brings several translation services together.'),
    category: 'ai',
    version: '1.0.18-beta.4',
    channel: 'BETA',
    icon: 'i-carbon-translate',
    author: 'team',
    size: 1.8,
    required: [
      grant('network.internet', '供插件设置 Surface 访问用户显式配置的翻译服务；隔离 Prelude 不直接联网', 'Lets the settings Surface reach the translation services you configure; the isolated Prelude never goes online itself'),
      grant('intelligence.basic', '通过宿主受控智能服务执行文本翻译与图片 OCR', 'Translates text and runs image OCR through the host’s governed intelligence service'),
      grant('storage.plugin', '供插件设置 Surface 保存启用状态和非敏感翻译源配置；密钥由安全存储管理', 'Saves enabled state and non-sensitive source settings; keys stay in secure storage'),
      grant('search.root-results', '将翻译状态与结果推送到 CoreBox 根搜索结果', 'Puts translation status and results in CoreBox root results'),
    ],
    optional: [grant('clipboard.write', '将翻译结果复制到剪贴板', 'Copies translations to the clipboard')],
    features: [
      feature('翻译', 'Translate', 'fy', '翻译', 'translate'),
      feature('多源翻译', 'Multi-source translate', 'fy-multi', '多源翻译'),
      feature('截图翻译', 'Screenshot translate', 's-fy', '截图翻译'),
    ],
    rating: 4.7,
    reviews: 860,
    installs: 27000,
    days: 2,
    releases: [
      { version: '1.0.18-beta.4', channel: 'BETA', days: 2, note: bi('截图翻译：框选屏幕文字直接出译文', 'Screenshot translate: box text on screen for an instant translation') },
      { version: '1.0.18-beta.3', channel: 'BETA', days: 12, note: bi('多源翻译并排对比', 'Compare sources side by side') },
      { version: '1.0.17', channel: 'RELEASE', days: 30, note: bi('翻译源密钥改由安全存储保管', 'Translation source keys move to secure storage') },
    ],
    reviewSeeds: [
      { author: 'ac', stars: 5, days: 1, helpful: 24, body: bi('截图翻译框一下就出译文，看外文文档快多了。', 'Box a screenshot and the translation is right there. Foreign docs read much faster.') },
      { author: 'nh', stars: 4, days: 8, helpful: 9, body: bi('多源并排对比很实用，偶尔某个源会超时。', 'Side-by-side sources are handy; one of them times out now and then.') },
    ],
  },
  {
    id: 'com.tuffex.intelligence',
    slug: 'touch-intelligence',
    name: bi('Tuff 智能', 'Tuff Intelligence'),
    summary: bi('CoreBox 智能问答、内置 AI 命令与本地自定义命令注册表。', 'Answers, built-in AI commands and a local custom-command registry inside CoreBox.'),
    category: 'ai',
    version: '1.2.0',
    channel: 'RELEASE',
    icon: 'i-carbon-machine-learning-model',
    author: 'team',
    size: 3.1,
    required: [
      grant('intelligence.basic', '调用智能能力完成问答', 'Calls intelligence capabilities to answer questions'),
      grant('search.root-results', '将智能问答入口与回答状态推送到 CoreBox 根搜索结果', 'Puts the Ask entry and answer status in CoreBox root results'),
      grant('storage.plugin', '保存本地对话历史与自定义 AI 命令配置', 'Saves local chat history and custom AI command settings'),
    ],
    optional: [grant('clipboard.write', '复制 AI 回答或将回答替换到当前应用的选中文本', 'Copies an answer, or replaces the selected text in the current app with it')],
    features: [
      feature('智能问答', 'Ask AI', 'ai', '@ai', '智能', '问答'),
      feature('AI 改写', 'AI rewrite', 'rewrite', '改写'),
      feature('AI 摘要', 'AI summary', 'summarize', '总结', '摘要'),
      feature('AI 解释', 'AI explain', 'explain', '解释'),
    ],
    rating: 4.6,
    reviews: 640,
    installs: 21000,
    days: 11,
    releases: [
      { version: '1.2.0', channel: 'RELEASE', days: 11, note: bi('新增改写、摘要与解释三个命令', 'Adds the rewrite, summarize and explain commands') },
      { version: '1.1.0', channel: 'RELEASE', days: 40, note: bi('本地自定义 AI 命令', 'Local custom AI commands') },
    ],
    reviewSeeds: [
      { author: 'ks', stars: 5, days: 4, helpful: 15, body: bi('选中文字输入 rewrite，改写结果直接替换，很顺手。', 'Select text, type rewrite, and the result replaces it in place. Very smooth.') },
      { author: 'lq', stars: 4, days: 13, helpful: 5, body: bi('自定义命令存在本机，这点让人放心。', 'Custom commands stay on this machine, which I like.') },
    ],
  },
  {
    id: 'com.tuffex.snippets',
    slug: 'touch-snippets',
    name: bi('片段库', 'Snippets'),
    summary: bi('统一片段库：搜索、保存并复制文本、代码与提示词模板。', 'One snippet library: search, save and copy text, code and prompt templates.'),
    category: 'productivity',
    version: '1.0.0',
    channel: 'RELEASE',
    icon: 'i-carbon-code',
    author: 'team',
    size: 1.2,
    required: [
      grant('clipboard.write', '复制片段内容到剪贴板', 'Copies snippet content to the clipboard'),
      grant('search.root-results', '将片段搜索、保存与管理入口推送到 CoreBox 根搜索结果', 'Puts snippet search, save and manage entries in CoreBox root results'),
      grant('storage.plugin', '保存片段库与本地管理状态', 'Saves the snippet library and its local state'),
    ],
    optional: [
      grant('clipboard.read', '支持 {{clipboard}} 占位符与从剪贴板保存片段', 'Powers the {{clipboard}} placeholder and saving snippets from the clipboard'),
      grant('network.internet', '通过宿主代理浏览、发布和安装 CloudShare 片段包', 'Browses, publishes and installs CloudShare snippet packs through the host proxy'),
    ],
    features: [
      feature('片段库', 'Snippets', 'snippet', '片段', '模板'),
      feature('保存片段', 'Save a snippet', 'snippet-save', '保存片段'),
      feature('片段库管理', 'Manage snippets', 'snippet-manage', '片段管理'),
    ],
    rating: 4.7,
    reviews: 410,
    installs: 12000,
    days: 19,
  },
  {
    id: 'com.tuffex.window-presets',
    slug: 'touch-window-presets',
    name: bi('窗口预设', 'Window Presets'),
    summary: bi('窗口预设：一键应用常用桌面布局。', 'Window presets: apply a saved desktop layout in one step.'),
    category: 'productivity',
    version: '1.0.0',
    channel: 'RELEASE',
    icon: 'i-carbon-screen',
    author: 'team',
    size: 0.8,
    required: [
      grant('system.shell', '查询窗口并执行贴边与置顶布局', 'Queries windows and applies snapping and always-on-top layouts'),
      grant('search.root-results', '将窗口预设入口推送到 CoreBox 根搜索结果', 'Puts the window preset entry in CoreBox root results'),
    ],
    optional: [],
    features: [feature('窗口预设', 'Window presets', 'window', 'preset', 'layout', '分屏', '布局')],
    rating: 4.5,
    reviews: 220,
    installs: 9400,
    days: 24,
  },
  {
    id: 'com.tuffex.quick-actions',
    slug: 'touch-quick-actions',
    name: bi('系统快捷动作', 'Quick Actions'),
    summary: bi('系统快捷动作：锁屏、静音与常用设置入口。', 'System quick actions: lock, mute and common settings.'),
    category: 'productivity',
    version: '1.0.0',
    channel: 'RELEASE',
    icon: 'i-carbon-flash',
    author: 'team',
    size: 0.6,
    required: [
      grant('system.shell', '执行系统快捷动作和打开系统设置', 'Runs system quick actions and opens system settings'),
      grant('search.root-results', '将系统快捷动作入口推送到 CoreBox 根搜索结果', 'Puts the quick actions entry in CoreBox root results'),
    ],
    optional: [],
    features: [feature('系统快捷动作', 'Quick actions', 'quick', 'actions', '快捷', '系统快捷')],
    rating: 4.4,
    reviews: 530,
    installs: 16000,
    days: 31,
  },
  {
    id: 'com.tuffex.system-actions',
    slug: 'touch-system-actions',
    name: bi('系统操作', 'System Actions'),
    summary: bi('系统高级控制：关机、重启、锁屏、音量与亮度。', 'Advanced system control: shut down, restart, lock, volume and brightness.'),
    category: 'utilities',
    version: '1.0.1',
    channel: 'RELEASE',
    icon: 'i-carbon-power',
    author: 'team',
    size: 0.7,
    required: [grant('search.root-results', '将系统操作入口推送到 CoreBox 根搜索结果', 'Puts the system actions entry in CoreBox root results')],
    optional: [grant('system.shell', '执行系统命令完成关机、重启、锁屏、音量与亮度操作', 'Runs system commands to shut down, restart, lock, and set volume and brightness')],
    features: [feature('系统操作', 'System actions', 'system', 'sys', '系统', '系统操作')],
    rating: 4.3,
    reviews: 180,
    installs: 7200,
    days: 27,
  },
  {
    id: 'com.tuffex.browser-open',
    slug: 'touch-browser-open',
    name: bi('浏览器打开', 'Browser Open'),
    summary: bi('浏览器打开：默认浏览器与指定浏览器快速打开链接。', 'Browser Open: open links in the default or a chosen browser.'),
    category: 'utilities',
    version: '1.0.4',
    channel: 'RELEASE',
    icon: 'i-carbon-launch',
    author: 'team',
    size: 0.9,
    required: [
      grant('system.shell', '通过宿主固定启动策略打开浏览器', 'Opens the browser through the host’s fixed launch policy'),
      grant('search.root-results', '将浏览器打开与网页搜索结果推送到 CoreBox 根搜索结果', 'Puts open-in-browser and web search results in CoreBox root results'),
      grant('storage.plugin', '保存搜索引擎设置与非权威的最近浏览器显示信息', 'Saves search engine settings and non-authoritative recent-browser details'),
    ],
    optional: [
      grant('clipboard.write', '复制链接到剪贴板', 'Copies links to the clipboard'),
      grant('network.internet', '打开网页并通过宿主安全网络能力获取搜索建议', 'Opens pages and fetches search suggestions through the host’s secure network'),
    ],
    features: [
      feature('浏览器打开', 'Open in browser', 'url', 'link', 'open', '浏览器'),
      feature('网页搜索', 'Web search', 'search', 'web', 'google', '搜索'),
    ],
    rating: 4.5,
    reviews: 260,
    installs: 11000,
    days: 15,
  },
  {
    id: 'com.tuffex.json-formatter',
    slug: 'json-formatter',
    name: bi('JSON 格式化', 'JSON Formatter'),
    summary: bi('一款全平台 JSON 工具，支持格式化、压缩、校验、转换与对比。', 'A cross-platform JSON tool: format, minify, validate, convert and compare.'),
    category: 'development',
    version: '1.0.9-beta.4',
    channel: 'BETA',
    icon: 'i-carbon-json',
    author: 'team',
    size: 4.6,
    required: [
      grant('clipboard.read', '读取剪贴板中的 JSON 文本作为格式化输入', 'Reads JSON text from the clipboard as input'),
      grant('network.internet', '内置 Monaco 编辑器在解析 $schema 时会发起网络请求；插件自身逻辑不联网', 'The bundled Monaco editor makes requests when it resolves $schema; the plugin’s own logic stays offline'),
    ],
    optional: [grant('clipboard.write', '将格式化后的结果复制回系统剪贴板', 'Copies the formatted result back to the clipboard')],
    features: [feature('JSON 格式化', 'Format JSON', 'json', 'json-formatter-format', '格式化')],
    rating: 4.6,
    reviews: 150,
    installs: 6800,
    days: 4,
  },
  {
    id: 'com.tuffex.dev-utils',
    slug: 'touch-dev-utils',
    name: bi('程序员工具', 'Dev Utils'),
    summary: bi('程序员工具：UUID、时间戳、JWT、命名转换、Query String 与字符串转义。', 'Dev Utils: UUIDs, timestamps, JWT, case conversion, query strings and escaping.'),
    category: 'development',
    version: '1.0.0',
    channel: 'RELEASE',
    icon: 'i-carbon-tools',
    author: 'team',
    size: 0.5,
    required: [
      grant('clipboard.write', '将开发工具结果复制到剪贴板', 'Copies results to the clipboard'),
      grant('search.root-results', '将程序员工具入口推送到 CoreBox 根搜索结果', 'Puts the Dev Utils entry in CoreBox root results'),
    ],
    optional: [],
    features: [feature('程序员工具', 'Dev utils', 'uuid', 'jwt', 'ts', 'case', '程序员工具')],
    rating: 4.7,
    reviews: 120,
    installs: 5200,
    days: 9,
  },
  {
    id: 'com.tuffex.workspace-scripts',
    slug: 'touch-workspace-scripts',
    name: bi('工作区脚本', 'Workspace Scripts'),
    summary: bi('工作区脚本：读取 package.json 脚本并一键执行。', 'Workspace Scripts: read the scripts in package.json and run them in one step.'),
    category: 'development',
    version: '1.0.0',
    channel: 'RELEASE',
    icon: 'i-carbon-terminal',
    author: 'team',
    size: 0.7,
    required: [
      grant('system.shell', '执行用户确认后的开发命令', 'Runs development commands after you confirm them'),
      grant('fs.read', '读取 workspace 的 package.json 脚本列表', 'Reads the scripts list from the workspace’s package.json'),
      grant('search.root-results', '将工作区脚本入口推送到 CoreBox 根搜索结果', 'Puts the workspace scripts entry in CoreBox root results'),
    ],
    optional: [],
    features: [feature('工作区脚本', 'Workspace scripts', 'script', 'workspace', '脚本', 'run')],
    rating: 4.4,
    reviews: 90,
    installs: 3900,
    days: 13,
  },
  {
    id: 'com.tuffex.vscode-projects',
    slug: 'touch-vscode-projects',
    name: bi('VS Code 项目', 'VS Code Projects'),
    summary: bi('安全列出并打开 VS Code 最近项目。', 'Safely lists and opens your recent VS Code projects.'),
    category: 'development',
    version: '1.0.0',
    channel: 'RELEASE',
    icon: 'i-carbon-folder',
    author: 'team',
    size: 0.6,
    required: [grant('search.root-results', '将 VS Code 最近项目入口展示在 CoreBox 根搜索结果', 'Shows recent VS Code projects in CoreBox root results')],
    optional: [
      grant('fs.read', '读取宿主允许的 VS Code 最近项目元数据', 'Reads the recent-project metadata the host allows'),
      grant('fs.index', '建立和刷新 VS Code 最近项目索引', 'Builds and refreshes the recent-project index'),
      grant('system.shell', '由宿主通过固定 VS Code 启动器打开项目', 'Opens projects through the host’s fixed VS Code launcher'),
    ],
    features: [feature('VS Code 项目', 'VS Code projects', 'vscode', 'vs code', '工作区')],
    rating: 4.5,
    reviews: 110,
    installs: 4800,
    days: 17,
  },
  {
    id: 'com.tuffex.image-tools',
    slug: 'touch-image',
    name: bi('图片转换与压缩', 'Image Tools'),
    summary: bi('快速修改图片分辨率、压缩并转换为 PNG、WebP、JPEG 或 ICO。', 'Resize, compress and convert images to PNG, WebP, JPEG or ICO.'),
    category: 'utilities',
    version: '1.0.0',
    channel: 'RELEASE',
    icon: 'i-carbon-image',
    author: 'team',
    size: 2.7,
    required: [
      grant('search.root-results', '将图片导出工具展示在 CoreBox 根搜索结果', 'Shows the image export tool in CoreBox root results'),
      grant('fs.read', '由宿主读取用户明确提供且经批准的图片输入', 'The host reads only images you explicitly provide and approve'),
      grant('fs.write', '由宿主在用户确认后将转换结果保存到选定位置', 'The host saves results to the location you pick, after you confirm'),
    ],
    optional: [],
    features: [feature('图片转换与压缩', 'Convert and compress', 'image', 'png', 'webp', 'resize', 'compress', '图片')],
    rating: 4.4,
    reviews: 70,
    installs: 3100,
    days: 8,
  },
  {
    id: 'com.tuffex.batch-rename',
    slug: 'touch-batch-rename',
    name: bi('批量重命名', 'Batch Rename'),
    summary: bi('文件批量重命名：前后缀、编号、正则替换。', 'Batch rename files: prefixes, suffixes, numbering and regex replace.'),
    category: 'utilities',
    version: '1.0.0',
    channel: 'RELEASE',
    icon: 'i-carbon-document',
    author: 'team',
    size: 0.6,
    required: [
      grant('fs.read', '读取选中文件信息用于生成重命名计划', 'Reads the selected files to build a rename plan'),
      grant('fs.write', '执行文件重命名操作', 'Renames the files'),
      grant('search.root-results', '将批量重命名入口推送到 CoreBox 根搜索结果', 'Puts the batch rename entry in CoreBox root results'),
      grant('storage.plugin', '保存最近一次批量重命名事务以支持撤销', 'Keeps the last rename batch so it can be undone'),
    ],
    optional: [],
    features: [feature('批量重命名', 'Batch rename', 'rename', '批量重命名', 'rename-files')],
    rating: 4.3,
    reviews: 60,
    installs: 2500,
    days: 21,
  },
  {
    id: 'com.tuffex.emoji-symbols',
    slug: 'touch-emoji-symbols',
    name: bi('Emoji 与符号', 'Emoji & Symbols'),
    summary: bi('Emoji 与符号选择器：搜索并复制常用表情、标点、货币与数学符号。', 'Emoji and symbol picker: search and copy emoji, punctuation, currency and math symbols.'),
    category: 'utilities',
    version: '1.0.0',
    channel: 'RELEASE',
    icon: 'i-carbon-face-satisfied',
    author: 'team',
    size: 1.4,
    required: [
      grant('clipboard.write', '将选中的 Emoji 或符号复制到剪贴板', 'Copies the chosen emoji or symbol to the clipboard'),
      grant('search.root-results', '将 Emoji 与符号入口推送到 CoreBox 根搜索结果', 'Puts the emoji and symbols entry in CoreBox root results'),
    ],
    optional: [],
    features: [feature('Emoji 与符号', 'Emoji & symbols', 'emoji', 'symbol', '表情', '符号')],
    rating: 4.6,
    reviews: 140,
    installs: 6100,
    days: 12,
  },
  {
    id: 'com.tuffex.dictation',
    slug: 'touch-dictation',
    name: bi('语音听写', 'Dictation'),
    summary: bi('语音听写：说话即输入，自动清理口水词并润色后粘贴到当前应用。', 'Dictation: speak to type; filler words are cleaned up and the text polished before it is pasted.'),
    category: 'ai',
    version: '1.0.0',
    channel: 'RELEASE',
    icon: 'i-carbon-microphone',
    author: 'team',
    size: 1.9,
    required: [
      grant('voice.dictation', '采集麦克风、将语音转写为文本并用 AI 润色后写入当前应用', 'Captures the microphone, transcribes speech and polishes it with AI before writing it into the current app'),
      grant('search.root-results', '在 CoreBox 根搜索结果中显示听写和朗读操作', 'Shows dictate and read-aloud actions in CoreBox root results'),
    ],
    optional: [grant('clipboard.read', '读取剪贴板文字用于朗读', 'Reads clipboard text to read it aloud')],
    features: [
      feature('语音听写', 'Dictate', 'say', '听写', 'dictate'),
      feature('朗读文本', 'Read aloud', '朗读', 'read aloud', 'tts'),
    ],
    rating: 4.2,
    reviews: 95,
    installs: 4400,
    days: 3,
  },
  {
    id: 'com.tuffex.ai-sessions',
    slug: 'touch-ai-sessions',
    name: bi('AI 会话', 'AI Sessions'),
    summary: bi('安全检索本地 AI 会话元数据并复制脱敏引用。', 'Search local AI session metadata safely and copy redacted references.'),
    category: 'ai',
    version: '1.0.0',
    channel: 'RELEASE',
    icon: 'i-carbon-chat',
    author: 'team',
    size: 0.5,
    required: [grant('search.root-results', '将 AI 会话检索入口展示在 CoreBox 根搜索结果', 'Shows the AI session search entry in CoreBox root results')],
    optional: [
      grant('intelligence.basic', '读取宿主允许的 AI 会话元数据索引', 'Reads the AI session metadata index the host allows'),
      grant('fs.read', '读取宿主维护的会话索引元数据', 'Reads the session index metadata the host maintains'),
      grant('clipboard.write', '在用户明确操作后复制脱敏会话引用', 'Copies a redacted session reference when you ask it to'),
    ],
    features: [feature('AI 会话', 'AI sessions', 'ai sessions', 'ai 会话', '会话历史')],
    rating: 4.1,
    reviews: 40,
    installs: 1800,
    days: 5,
  },
  {
    id: 'com.tuffex.hosts',
    slug: 'touch-hosts',
    name: bi('Hosts 配置', 'Hosts'),
    summary: bi('受限 Hosts 配置预览与确认写入。', 'Preview restricted Hosts entries and write them only after you confirm.'),
    category: 'development',
    version: '0.1.0',
    channel: 'SNAPSHOT',
    icon: 'i-carbon-data-base',
    author: 'team',
    size: 0.4,
    required: [
      grant('search.root-results', '将 Hosts 配置入口推送到 CoreBox 根搜索结果', 'Puts the Hosts entry in CoreBox root results'),
      grant('fs.read', '读取宿主受限的 Hosts 配置摘要', 'Reads the restricted Hosts summary the host provides'),
    ],
    optional: [
      grant('fs.write', '在确认后原子更新 Hosts 配置', 'Updates the Hosts file atomically after you confirm'),
      grant('system.shell', '由宿主执行受治理的 Hosts 写入流程', 'Lets the host run its governed Hosts write flow'),
    ],
    features: [feature('Hosts 配置', 'Hosts', 'hosts', 'host', '域名解析')],
    rating: 4,
    reviews: 12,
    installs: 900,
    days: 1,
  },
  // Community samples: fictional plugins and authors, from an unofficial
  // source, so the unofficial-source warning and a high-risk permission show.
  {
    id: 'dev.zhouyu.pomodoro',
    slug: 'pomodoro',
    name: bi('番茄钟', 'Pomodoro'),
    summary: bi('25 分钟专注、5 分钟休息，到点用系统通知提醒。', 'Focus for 25 minutes, rest for 5, with a system notification when time is up.'),
    category: 'productivity',
    version: '0.9.2',
    channel: 'RELEASE',
    icon: 'i-carbon-timer',
    author: 'zy',
    size: 0.5,
    required: [
      grant('system.notification', '到点时发送系统通知', 'Sends a system notification when a session ends'),
      grant('storage.plugin', '保存专注记录', 'Saves your focus history'),
      grant('search.root-results', '在 CoreBox 根搜索结果中显示计时状态', 'Shows the timer in CoreBox root results'),
    ],
    optional: [],
    features: [feature('番茄钟', 'Pomodoro', 'pomo', '番茄', 'focus')],
    rating: 4.4,
    reviews: 45,
    installs: 2600,
    days: 10,
  },
  {
    id: 'dev.leamartin.color-picker',
    slug: 'color-picker',
    name: bi('取色器', 'Color Picker'),
    summary: bi('屏幕取色，一键复制 HEX、RGB 与 HSL。', 'Pick any colour on screen and copy it as HEX, RGB or HSL.'),
    category: 'design',
    version: '2.1.0',
    channel: 'RELEASE',
    icon: 'i-carbon-color-palette',
    author: 'lm',
    size: 0.9,
    required: [
      grant('window.capture', '读取光标下屏幕像素的颜色', 'Reads the colour of the screen pixel under the cursor'),
      grant('clipboard.write', '复制取到的色值', 'Copies the picked colour'),
      grant('search.root-results', '将取色入口推送到 CoreBox 根搜索结果', 'Puts the picker entry in CoreBox root results'),
    ],
    optional: [],
    features: [feature('取色', 'Pick a colour', 'color', 'pick', '取色')],
    rating: 4.5,
    reviews: 38,
    installs: 2200,
    days: 7,
    reviewSeeds: [
      { author: 'mo', stars: 5, days: 3, helpful: 8, body: bi('HEX 和 RGB 一键复制，设计走查必备。', 'One click for HEX or RGB. A must for design reviews.') },
      { author: 'ks', stars: 4, days: 12, helpful: 4, body: bi('需要屏幕截图权限，装之前看清楚了理由。', 'It needs screen capture; I read the reason before installing.') },
    ],
  },
  {
    id: 'dev.omarfarouk.units',
    slug: 'units',
    name: bi('单位换算', 'Unit Converter'),
    summary: bi('长度、重量、温度与时区换算，结果直接出现在 CoreBox。', 'Length, weight, temperature and time zones, converted right in CoreBox.'),
    category: 'utilities',
    version: '1.3.0',
    channel: 'RELEASE',
    icon: 'i-carbon-calculator',
    author: 'of',
    size: 0.4,
    required: [
      grant('clipboard.write', '复制换算结果', 'Copies the converted value'),
      grant('search.root-results', '在 CoreBox 根搜索结果中直接显示换算结果', 'Shows conversions directly in CoreBox root results'),
    ],
    optional: [],
    features: [feature('单位换算', 'Convert units', 'unit', 'convert', '换算')],
    rating: 4.3,
    reviews: 22,
    installs: 1300,
    days: 14,
    flaky: true,
  },
]

const PLUGIN_BY_ID = new Map(PLUGINS.map(plugin => [plugin.id, plugin]))
const DEFAULT_DETAIL = 'com.tuffex.translation'
const POPULAR_IDS = [...PLUGINS].sort((a, b) => b.installs - a.installs).slice(0, 5).map(plugin => plugin.id)
const SORT_KEYS: SortKey[] = ['popular', 'newest', 'rating']
const NO_MATCH = '__none'

const FEATURED: Array<{ id: string, headline: Bi, seed: number }> = [
  { id: 'com.tuffex.translation', seed: 11, headline: bi('截图翻译上线：框选屏幕文字，直接出译文', 'Screenshot translate is here: box any text on screen and read it translated') },
  { id: 'com.tuffex.clipboard-history', seed: 23, headline: bi('固定常用条目，图片也能看原图', 'Pin the clips you reuse and open images at full size') },
  { id: 'com.tuffex.intelligence', seed: 37, headline: bi('改写、摘要、解释，一个前缀就够', 'Rewrite, summarize, explain — one prefix away') },
  { id: 'com.tuffex.window-presets', seed: 41, headline: bi('一键把桌面排成写作、评审或演示布局', 'Lay out your desktop for writing, review or a demo in one step') },
]

const INITIAL_INSTALLED: Record<string, { version: string, enabled: boolean }> = {
  'com.tuffex.clipboard-history': { version: '1.2.0-beta.5', enabled: true },
  'com.tuffex.translation': { version: '1.0.18-beta.3', enabled: true },
  'com.tuffex.intelligence': { version: '1.2.0', enabled: true },
  'com.tuffex.snippets': { version: '1.0.0', enabled: true },
  'com.tuffex.quick-actions': { version: '1.0.0', enabled: false },
}

function pluginById(id: string): Plugin | undefined {
  return PLUGIN_BY_ID.get(id)
}

function isOfficial(plugin: Plugin): boolean {
  return plugin.author === 'team'
}

function releasesOf(plugin: Plugin): Release[] {
  if (plugin.releases)
    return plugin.releases
  const first = /^(?:1\.0\.0|0\.1\.0)$/.test(plugin.version)
  return [{ version: plugin.version, channel: plugin.channel, days: plugin.days, note: first ? bi('首次上架', 'First listed') : bi('稳定性与性能改进', 'Stability and performance improvements') }]
}

// Five-to-one star shares that average close to the rating, in percent.
function distribution(rating: number): number[] {
  const five = Math.round(40 + (rating - 4) * 55)
  const four = Math.round((100 - five) * 0.6)
  const three = Math.round((100 - five - four) * 0.55)
  const two = Math.round((100 - five - four - three) * 0.55)
  return [five, four, three, two, 100 - five - four - three - two]
}

/* ─── Generated art ───────────────────────────────────────────────────── */

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

function hash(text: string): number {
  let value = 2166136261
  for (let index = 0; index < text.length; index += 1)
    value = Math.imul(value ^ text.charCodeAt(index), 16777619)
  return value >>> 0
}

function n(value: number): string {
  return String(Math.round(value * 10) / 10)
}

function svgUri(width: number, height: number, defs: string, body: string, slice = false): string {
  const aspect = slice ? ' preserveAspectRatio="xMidYMid slice"' : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"${aspect}><defs>${defs}</defs>${body}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function blurFilter(id: string, deviation: number): string {
  return `<filter id="${id}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="${n(deviation)}"/></filter>`
}

// Carousel backdrop: the category's dark ramp, soft light and two ribbons. The
// left third stays darkest so the white copy on it keeps its contrast.
function drawBanner(category: CategoryId, seed: number): string {
  const [c0, c1, c2] = CATEGORIES[category].art
  const rand = random(seed)
  const w = 960
  const h = 300
  const orbs = [c1, c2, c1].map((fill, index) => {
    const cx = w * (0.45 + index * 0.2 + rand() * 0.08)
    const cy = h * (0.2 + rand() * 0.6)
    return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(h * (0.35 + rand() * 0.25))}" fill="${fill}" opacity="${n(0.45 + rand() * 0.3)}"/>`
  }).join('')
  const ribbons = [c2, c1].map((stroke, index) => {
    const y = h * (0.35 + index * 0.3)
    const lift = h * (0.18 + rand() * 0.1)
    return `<path d="M${n(w * 0.25)} ${n(y + lift)}C${n(w * 0.5)} ${n(y - lift)} ${n(w * 0.75)} ${n(y + lift)} ${n(w * 1.05)} ${n(y - lift * 0.5)}" fill="none" stroke="${stroke}" stroke-width="${index ? 10 : 18}" stroke-linecap="round" opacity="0.55"/>`
  }).join('')
  return svgUri(w, h, `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="0.4"><stop offset="0" stop-color="${c0}"/><stop offset="1" stop-color="${c1}"/></linearGradient>${blurFilter('soft', 46)}${blurFilter('streak', 14)}`, `<rect width="${w}" height="${h}" fill="url(#bg)"/><g filter="url(#soft)">${orbs}</g><g filter="url(#streak)">${ribbons}</g><rect width="${w * 0.6}" height="${h}" fill="${c0}" opacity="0.35"/>`, true)
}

// A CoreBox window in the plugin's colours: the search field, then either a
// result list, results beside a preview, or a settings page.
function drawShot(plugin: Plugin, variant: number): string {
  const [c0, c1, c2] = CATEGORIES[plugin.category].art
  const rand = random(hash(plugin.id) + variant * 97)
  const w = 640
  const h = 400
  const x = 64
  const y = 44
  const ww = 512
  const wh = 312
  const ink = '#ffffff'
  const bar = (bx: number, by: number, bw: number, bh: number, opacity: number, fill = ink) => `<rect x="${n(bx)}" y="${n(by)}" width="${n(bw)}" height="${n(bh)}" rx="${n(bh / 2)}" fill="${fill}" opacity="${opacity}"/>`
  let content = ''
  if (variant === 2) {
    content += bar(x + 24, y + 78, 120, 10, 0.8)
    for (let row = 0; row < 4; row += 1) {
      const ry = y + 110 + row * 44
      const on = row !== 2
      content += bar(x + 24, ry + 4, 150 + rand() * 90, 8, 0.7) + bar(x + 24, ry + 18, 110 + rand() * 60, 6, 0.3)
      content += `<rect x="${x + ww - 70}" y="${ry + 2}" width="42" height="22" rx="11" fill="${on ? c1 : ink}" opacity="${on ? 1 : 0.18}"/><circle cx="${on ? x + ww - 39 : x + ww - 59}" cy="${ry + 13}" r="8" fill="${ink}"/>`
    }
  }
  else {
    const listWidth = variant === 1 ? ww * 0.5 : ww - 32
    for (let row = 0; row < 5; row += 1) {
      const ry = y + 72 + row * 44
      if (row === 1)
        content += `<rect x="${x + 12}" y="${ry - 6}" width="${n(listWidth)}" height="40" rx="10" fill="${c1}" opacity="0.32"/>`
      content += `<rect x="${x + 24}" y="${ry + 2}" width="24" height="24" rx="7" fill="${row % 2 ? c2 : c1}"/>`
      content += bar(x + 58, ry + 5, listWidth * (0.36 + rand() * 0.3), 8, 0.78) + bar(x + 58, ry + 18, listWidth * (0.2 + rand() * 0.2), 6, 0.3)
    }
    if (variant === 1) {
      const px = x + ww * 0.5 + 24
      content += `<rect x="${n(px)}" y="${y + 70}" width="${n(ww * 0.5 - 40)}" height="${wh - 100}" rx="12" fill="${ink}" opacity="0.05"/>`
      content += bar(px + 16, y + 90, 130, 10, 0.85)
      for (let line = 0; line < 5; line += 1)
        content += bar(px + 16, y + 118 + line * 20, (ww * 0.5 - 80) * (0.55 + rand() * 0.45), 7, 0.35)
      content += `<rect x="${n(px + 16)}" y="${y + wh - 64}" width="92" height="26" rx="8" fill="${c1}"/>`
    }
  }
  const body = `<rect width="${w}" height="${h}" fill="url(#bg)"/><circle cx="${n(w * 0.84)}" cy="${n(h * 0.16)}" r="150" fill="${c2}" opacity="0.3" filter="url(#soft)"/><circle cx="${n(w * 0.08)}" cy="${n(h * 0.92)}" r="170" fill="${c1}" opacity="0.55" filter="url(#soft)"/>`
    + `<rect x="${x + 6}" y="${y + 14}" width="${ww}" height="${wh}" rx="18" fill="#000" opacity="0.32" filter="url(#shade)"/>`
    + `<rect x="${x}" y="${y}" width="${ww}" height="${wh}" rx="18" fill="#10131a" opacity="0.94" stroke="${ink}" stroke-opacity="0.08"/>`
    + `<rect x="${x + 14}" y="${y + 14}" width="${ww - 28}" height="40" rx="11" fill="${ink}" opacity="0.07"/>`
    + `<circle cx="${x + 36}" cy="${y + 34}" r="7" fill="none" stroke="${ink}" stroke-opacity="0.55" stroke-width="2"/><line x1="${x + 41}" y1="${y + 39}" x2="${x + 46}" y2="${y + 44}" stroke="${ink}" stroke-opacity="0.55" stroke-width="2" stroke-linecap="round"/>`
    + bar(x + 58, y + 30, 70 + rand() * 60, 8, 0.6, c2)
    + content
  return svgUri(w, h, `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c0}"/></linearGradient>${blurFilter('soft', 48)}${blurFilter('shade', 14)}`, body)
}

const bannerCache = new Map<string, string>()
const shotCache = new Map<string, ImageGalleryItem[]>()

function bannerOf(id: string, seed: number): string {
  let url = bannerCache.get(id)
  if (!url) {
    url = drawBanner(pluginById(id)?.category ?? 'productivity', seed)
    bannerCache.set(id, url)
  }
  return url
}

function shotsOf(plugin: Plugin): ImageGalleryItem[] {
  let items = shotCache.get(plugin.id)
  if (!items) {
    items = [0, 1, 2].map(variant => ({ id: `${plugin.id}-${variant}`, url: drawShot(plugin, variant) }))
    shotCache.set(plugin.id, items)
  }
  return items
}

function glyphStyle(plugin: Plugin): Record<string, string> {
  const [c0, c1] = CATEGORIES[plugin.category].art
  return { '--store-glyph-from': c1, '--store-glyph-to': c0 }
}

/* ─── Copy ────────────────────────────────────────────────────────────── */

const zhCopy = {
  frameTitle: '插件商店',
  brand: '插件商店',
  subtitle: (count: number) => `${count} 个插件 · 示例数据`,
  views: { discover: '发现', installed: '已安装' } as Record<View, string>,
  viewsLabel: '商店视图',
  searchPlaceholder: '搜索插件、功能或触发词…',
  suggestTrigger: (name: string, trigger: string) => `${name} · 触发词 ${trigger}`,
  suggestFeature: (name: string, featureName: string) => `${name} · ${featureName}`,
  noMatch: '没有匹配的插件',
  categoriesLabel: '插件分类',
  all: '全部',
  sortLabel: '排序',
  sort: { popular: '热门', newest: '最新', rating: '评分' } as Record<SortKey, string>,
  sectionAll: '全部插件',
  searchResults: (query: string) => `搜索「${query}」`,
  clearSearch: '清除搜索',
  emptySearchTitle: '没有找到插件',
  emptySearchDesc: '换个关键词，或看看全部分类。',
  official: '官方',
  officialTip: '官方插件 · TalexTouch Team',
  community: '社区',
  communityTip: '社区插件 · 来自非官方来源（示例）',
  ratingText: (rating: string, count: string) => `${rating} 分，${count} 条评论`,
  installsShort: (count: string) => `${count} 次安装`,
  openDetail: (name: string) => `查看「${name}」详情`,
  sample: '示例数据',
  footnote: '评分、安装量、评论与版本说明为示例数据；插件、版本与权限取自仓库 plugins/。',
  verb: { install: '安装', update: '更新', open: '打开', enable: '启用', retry: '重试' },
  verbFor: (verb: string, name: string) => `${verb}「${name}」`,
  phase: { queued: '排队中', downloading: '下载中', verifying: '校验中', installing: '安装中', uninstalling: '卸载中' },
  cancelFor: (name: string) => `取消安装「${name}」`,
  bytes: (done: string, total: string) => `${done} / ${total} MB`,
  failReason: '插件包下载超时或被中断，请检查插件源网络后重试。',
  updatesAvailable: (count: number) => `${count} 个插件可更新`,
  viewUpdates: '查看更新',
  checkUpdates: '检查更新',
  checking: '正在检查更新...',
  noUpdates: '所有插件均为最新',
  installedSummary: (count: number, updates: number) => (updates ? `${count} 个已安装 · ${updates} 个可更新` : `${count} 个已安装`),
  updatesOnly: '只看可更新',
  showAll: '显示全部已安装插件',
  rowVersion: (version: string, official: boolean) => `v${version} · ${official ? '官方' : '社区'}`,
  disabledTag: '已停用',
  installedEmptyTitle: '还没有安装插件',
  installedEmptyDesc: '去「发现」挑几个，装好后会出现在这里。',
  goDiscover: '去发现',
  enableSwitch: (name: string) => `启用「${name}」`,
  more: (name: string) => `「${name}」的更多操作`,
  menu: { disable: '停用', enable: '启用', uninstall: '卸载', copyId: '复制插件 ID' },
  nav: { label: '商店导航', browse: '浏览', categories: '分类', updates: '可更新' },
  carousel: {
    label: '编辑精选',
    slide: (index: number, total: number) => `第 ${index} 张，共 ${total} 张`,
    prev: '上一张',
    next: '下一张',
    pause: '暂停轮播',
    play: '播放轮播',
    goTo: (index: number) => `切换到第 ${index} 张`,
    pick: '编辑精选',
    learnMore: '了解详情',
  },
  updateBanner: (count: number) => `${count} 个插件有新版本`,
  detail: {
    label: (name: string) => `「${name}」详情`,
    back: '返回',
    tabs: { overview: '概览', permissions: '权限', versions: '版本', reviews: '评论' } as Record<DetailTab, string>,
    screenshots: '截图',
    features: '功能与触发词',
    triggerHint: '在 CoreBox 里输入触发词即可使用',
    facts: { id: '插件 ID', version: '版本', size: '大小', updated: '更新于', author: '作者' },
    permissionsIntro: '安装时会请你确认必需权限；可选权限在插件用到时再询问。理由取自插件清单。',
    required: '必需',
    optional: '可选',
    askLater: '使用时再询问',
    risk: { low: '低风险', medium: '中风险', high: '高风险' } as Record<Risk, string>,
    installedTag: '当前安装',
    versionsNote: '版本号取自插件清单；更新说明与日期为示例数据。',
    reviewCount: (count: string) => `${count} 条评论`,
    distribution: '评分分布',
    distributionRow: (stars: number, percent: number) => `${stars} 星 ${percent}%`,
    helpful: (count: number) => `有帮助 ${count}`,
    helpfulLabel: (count: number) => `这条评论有帮助，已有 ${count} 人认同`,
    pending: '待审核',
    writeTitle: '写下评价',
    ratingLabel: '评分',
    starLabel: (star: number) => `评 ${star} 星`,
    placeholder: '说说你喜欢或不喜欢的地方',
    submitHint: '评论审核通过后公开展示。',
    submit: '提交评论',
    ratingRequired: '请先选择评分。',
    contentRequired: '请填写评论内容。',
    submitted: '评论已提交，审核通过后公开展示。',
    reviewsNote: '示例数据：只列出最近几条评论。',
    justNow: '刚刚',
    gallery: {
      title: '截图预览',
      prev: '上一张',
      next: '下一张',
      item: (index: number) => `截图 ${index + 1}`,
      open: (label: string) => `放大查看${label}`,
    },
  },
  modal: {
    permissionTitle: '插件权限确认',
    permissionLead: (name: string) => `插件「${name}」需要以下权限：`,
    unofficial: (name: string) => `插件「${name}」来自非官方来源，确定继续安装吗？`,
    optionalNote: (names: string) => `可选权限此时不授予，插件用到时再询问：${names}。`,
    chooseHow: '请选择授权方式。',
    allowAlways: '始终允许',
    allowSession: '仅本次会话',
    reject: '拒绝安装',
    updateTitle: '确认更新',
    updateLead: (name: string, from: string, to: string) => `即将更新插件「${name}」：v${from} → v${to}。`,
    updateWill: '更新将会：',
    updatePoints: ['停止当前运行的插件', '删除旧版本并安装新版本', '更新完成后自动重新启用'],
    newPermissions: '新版本新增的权限',
    startUpdate: '开始更新',
    cancel: '取消',
    uninstallTitle: '卸载插件',
    uninstallLead: (name: string) => `确定要卸载 ${name} 吗？这会删除插件文件及其缓存数据。`,
    uninstall: '卸载',
  },
  toast: {
    label: '操作结果',
    dismiss: '关闭提示',
    installed: (name: string) => `插件「${name}」已准备就绪。`,
    installedSession: (name: string) => `插件「${name}」已准备就绪，授权仅本次会话有效。`,
    updated: (name: string) => `插件「${name}」已更新到最新版本。`,
    uninstalled: (name: string) => `${name} 已卸载。`,
    rejected: (name: string) => `已拒绝安装「${name}」，未授予任何权限。`,
    cancelled: (name: string) => `已取消「${name}」的下载。`,
    failed: (name: string) => `未能安装「${name}」：插件包下载超时或被中断。`,
    opened: (name: string, trigger: string) => `宿主会在 CoreBox 中打开「${name}」· 触发词 ${trigger}`,
    enabled: (name: string) => `已启用「${name}」`,
    disabled: (name: string) => `已停用「${name}」`,
    copied: (id: string) => `已复制 ${id}`,
    reinstall: '重新安装',
    open: '打开',
    retry: '重试',
  },
}

const enCopy: typeof zhCopy = {
  frameTitle: 'Plugin store',
  brand: 'Plugin store',
  subtitle: (count: number) => `${count} plugins · sample data`,
  views: { discover: 'Discover', installed: 'Installed' },
  viewsLabel: 'Store views',
  searchPlaceholder: 'Search plugins, features or triggers…',
  suggestTrigger: (name: string, trigger: string) => `${name} · trigger ${trigger}`,
  suggestFeature: (name: string, featureName: string) => `${name} · ${featureName}`,
  noMatch: 'No matching plugins',
  categoriesLabel: 'Plugin categories',
  all: 'All',
  sortLabel: 'Sort',
  sort: { popular: 'Popular', newest: 'Newest', rating: 'Top rated' },
  sectionAll: 'All plugins',
  searchResults: (query: string) => `Results for “${query}”`,
  clearSearch: 'Clear search',
  emptySearchTitle: 'No plugins found',
  emptySearchDesc: 'Try another word, or browse every category.',
  official: 'Official',
  officialTip: 'Official plugin · TalexTouch Team',
  community: 'Community',
  communityTip: 'Community plugin · unofficial source (sample)',
  ratingText: (rating: string, count: string) => `Rated ${rating}, ${count} reviews`,
  installsShort: (count: string) => `${count} installs`,
  openDetail: (name: string) => `View ${name} details`,
  sample: 'Sample data',
  footnote: 'Ratings, installs, reviews and release notes are sample data; plugins, versions and permissions come from the repo’s plugins/.',
  verb: { install: 'Install', update: 'Update', open: 'Open', enable: 'Enable', retry: 'Retry' },
  verbFor: (verb: string, name: string) => `${verb} ${name}`,
  phase: { queued: 'Queued', downloading: 'Downloading', verifying: 'Verifying', installing: 'Installing', uninstalling: 'Uninstalling' },
  cancelFor: (name: string) => `Cancel installing ${name}`,
  bytes: (done: string, total: string) => `${done} / ${total} MB`,
  failReason: 'The plugin package download timed out or was interrupted. Check the plugin source network and try again.',
  updatesAvailable: (count: number) => (count === 1 ? '1 plugin update available' : `${count} plugin updates available`),
  viewUpdates: 'View updates',
  checkUpdates: 'Check for updates',
  checking: 'Checking for updates...',
  noUpdates: 'All plugins are up to date',
  installedSummary: (count: number, updates: number) => (updates ? `${count} installed · ${updates} to update` : `${count} installed`),
  updatesOnly: 'Updates only',
  showAll: 'Show every installed plugin',
  rowVersion: (version: string, official: boolean) => `v${version} · ${official ? 'Official' : 'Community'}`,
  disabledTag: 'Off',
  installedEmptyTitle: 'No plugins installed',
  installedEmptyDesc: 'Pick a few from Discover and they will show up here.',
  goDiscover: 'Go to Discover',
  enableSwitch: (name: string) => `Enable ${name}`,
  more: (name: string) => `More actions for ${name}`,
  menu: { disable: 'Disable', enable: 'Enable', uninstall: 'Uninstall', copyId: 'Copy plugin ID' },
  nav: { label: 'Store navigation', browse: 'Browse', categories: 'Categories', updates: 'Updates' },
  carousel: {
    label: 'Editor’s picks',
    slide: (index: number, total: number) => `${index} of ${total}`,
    prev: 'Previous slide',
    next: 'Next slide',
    pause: 'Pause slideshow',
    play: 'Play slideshow',
    goTo: (index: number) => `Go to slide ${index}`,
    pick: 'Editor’s pick',
    learnMore: 'Learn more',
  },
  updateBanner: (count: number) => (count === 1 ? '1 plugin has a new version' : `${count} plugins have new versions`),
  detail: {
    label: (name: string) => `${name} details`,
    back: 'Back',
    tabs: { overview: 'Overview', permissions: 'Permissions', versions: 'Versions', reviews: 'Reviews' },
    screenshots: 'Screenshots',
    features: 'Features and triggers',
    triggerHint: 'Type a trigger in CoreBox to use it',
    facts: { id: 'Plugin ID', version: 'Version', size: 'Size', updated: 'Updated', author: 'Author' },
    permissionsIntro: 'Required permissions are confirmed at install time; optional ones are asked for when the plugin needs them. Reasons come from the plugin manifest.',
    required: 'Required',
    optional: 'Optional',
    askLater: 'Asked when needed',
    risk: { low: 'Low risk', medium: 'Medium risk', high: 'High risk' },
    installedTag: 'Installed',
    versionsNote: 'Version numbers come from the plugin manifests; notes and dates are sample data.',
    reviewCount: (count: string) => `${count} reviews`,
    distribution: 'Rating distribution',
    distributionRow: (stars: number, percent: number) => `${stars} stars ${percent}%`,
    helpful: (count: number) => `Helpful ${count}`,
    helpfulLabel: (count: number) => `Mark this review helpful, ${count} people agree`,
    pending: 'Pending',
    writeTitle: 'Write a review',
    ratingLabel: 'Rating',
    starLabel: (star: number) => `Rate ${star} star${star > 1 ? 's' : ''}`,
    placeholder: 'What did you like or dislike?',
    submitHint: 'Reviews are published after approval.',
    submit: 'Submit review',
    ratingRequired: 'Please provide a rating.',
    contentRequired: 'Please write your review.',
    submitted: 'Review submitted. It is published after approval.',
    reviewsNote: 'Sample data: only the latest few reviews are listed.',
    justNow: 'Just now',
    gallery: {
      title: 'Screenshot preview',
      prev: 'Previous screenshot',
      next: 'Next screenshot',
      item: (index: number) => `Screenshot ${index + 1}`,
      open: (label: string) => `Enlarge ${label}`,
    },
  },
  modal: {
    permissionTitle: 'Plugin permission request',
    permissionLead: (name: string) => `“${name}” requires the following permissions:`,
    unofficial: (name: string) => `“${name}” comes from an unofficial source. Proceed with installation?`,
    optionalNote: (names: string) => `Optional permissions are not granted now; the plugin asks when it needs them: ${names}.`,
    chooseHow: 'Choose how to authorize this installation.',
    allowAlways: 'Always allow',
    allowSession: 'Allow this session',
    reject: 'Reject install',
    updateTitle: 'Confirm update',
    updateLead: (name: string, from: string, to: string) => `About to update “${name}”: v${from} → v${to}.`,
    updateWill: 'This will:',
    updatePoints: ['Stop the currently running plugin', 'Remove the old version and install the new one', 'Re-enable it automatically after the update'],
    newPermissions: 'New in this version',
    startUpdate: 'Update',
    cancel: 'Cancel',
    uninstallTitle: 'Uninstall plugin',
    uninstallLead: (name: string) => `Are you sure you want to uninstall ${name}? This removes all plugin files and cached data.`,
    uninstall: 'Uninstall',
  },
  toast: {
    label: 'Result',
    dismiss: 'Dismiss',
    installed: (name: string) => `“${name}” is ready to use.`,
    installedSession: (name: string) => `“${name}” is ready to use; its permissions last for this session.`,
    updated: (name: string) => `“${name}” has been updated to the latest version.`,
    uninstalled: (name: string) => `${name} has been uninstalled.`,
    rejected: (name: string) => `Install of ${name} rejected; no permission was granted.`,
    cancelled: (name: string) => `Download of ${name} cancelled.`,
    failed: (name: string) => `Unable to install “${name}”: the download timed out or was interrupted.`,
    opened: (name: string, trigger: string) => `The host would open ${name} in CoreBox · trigger ${trigger}`,
    enabled: (name: string) => `${name} enabled`,
    disabled: (name: string) => `${name} disabled`,
    copied: (id: string) => `Copied ${id}`,
    reinstall: 'Reinstall',
    open: 'Open',
    retry: 'Retry',
  },
}

const copy = computed(() => (zh.value ? zhCopy : enCopy))

const compactNumber = computed(() => new Intl.NumberFormat(zh.value ? 'zh-CN' : 'en', { notation: 'compact', maximumFractionDigits: 1 }))
const fullNumber = computed(() => new Intl.NumberFormat(zh.value ? 'zh-CN' : 'en'))
const dateFormat = computed(() => new Intl.DateTimeFormat(zh.value ? 'zh-CN' : 'en', { month: 'short', day: 'numeric', timeZone: 'Asia/Shanghai' }))
const relativeFormat = computed(() => new Intl.RelativeTimeFormat(zh.value ? 'zh-CN' : 'en', { numeric: 'auto' }))

function daysAgo(days: number): string {
  return dateFormat.value.format(NOW - days * DAY)
}

function authorName(plugin: Plugin): string {
  return L(AUTHORS[plugin.author])
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

/* ─── Install state ───────────────────────────────────────────────────── */

interface InstallState {
  /** Installed version; `null` when not installed. */
  version: string | null
  enabled: boolean
  phase: Phase
  progress: number
  op: Op
  grant: 'always' | 'session' | null
  attempts: number
}

function seedInstalls(): Record<string, InstallState> {
  const table: Record<string, InstallState> = {}
  for (const plugin of PLUGINS) {
    const seed = INITIAL_INSTALLED[plugin.id]
    table[plugin.id] = {
      version: seed?.version ?? null,
      enabled: seed?.enabled ?? true,
      phase: 'idle',
      progress: 0,
      op: 'install',
      grant: seed ? 'always' : null,
      attempts: 0,
    }
  }
  return table
}

// One table, keyed by plugin id: the card, the carousel, the detail header and
// the installed row all read it, so a download shows its progress everywhere.
const installs = reactive<Record<string, InstallState>>(seedInstalls())

function stateOf(plugin: Plugin): InstallState {
  return installs[plugin.id]!
}

const BUSY: Phase[] = ['queued', 'downloading', 'verifying', 'installing']

const updatesChecked = ref(false)
const checking = ref(false)

function hasUpdate(plugin: Plugin): boolean {
  const state = stateOf(plugin)
  return updatesChecked.value && !!state.version && state.version !== plugin.version
}

const installedPlugins = computed(() => PLUGINS.filter(plugin => stateOf(plugin).version))
const updatablePlugins = computed(() => installedPlugins.value.filter(plugin => hasUpdate(plugin)))

/* ─── Browse state ────────────────────────────────────────────────────── */

const view = ref<View>('discover')
const category = ref<CategoryFilter>('all')
const sortKey = ref<SortKey>('popular')
const query = ref('')
const suggestQuery = ref('')
const searchKey = ref(0)
const updatesOnly = ref(false)
const detailId = ref(DEFAULT_DETAIL)
const detailOpen = ref(false)
const detailTab = ref<DetailTab>('overview')

const rootRef = ref<HTMLElement | null>(null)
const browseRef = ref<HTMLElement | null>(null)
const installedRef = ref<HTMLElement | null>(null)
const detailRef = ref<HTMLElement | null>(null)
const detailScrollRef = ref<HTMLElement | null>(null)

const current = computed(() => pluginById(detailId.value) ?? PLUGINS[0]!)
const detailShown = computed(() => mode.value === 'wide' || detailOpen.value)
const searching = computed(() => query.value.length > 0)

function haystackHit(plugin: Plugin, needle: string): string | null {
  const name = L(plugin.name)
  const trigger = plugin.features.flatMap(item => item.triggers).find(item => item.toLowerCase().includes(needle))
  if (`${plugin.name.zh} ${plugin.name.en} ${plugin.slug}`.toLowerCase().includes(needle))
    return trigger ? copy.value.suggestTrigger(name, trigger) : name
  if (trigger)
    return copy.value.suggestTrigger(name, trigger)
  const match = plugin.features.find(item => `${item.name.zh} ${item.name.en}`.toLowerCase().includes(needle))
  if (match)
    return copy.value.suggestFeature(name, L(match.name))
  return L(plugin.summary).toLowerCase().includes(needle) ? name : null
}

const suggestions = computed<TxSearchSelectOption[]>(() => {
  const needle = suggestQuery.value.trim().toLowerCase()
  if (!needle) {
    return POPULAR_IDS.map((id) => {
      const plugin = pluginById(id)!
      return { value: id, label: copy.value.suggestTrigger(L(plugin.name), plugin.features[0]?.triggers[0] ?? plugin.slug) }
    })
  }
  const options: TxSearchSelectOption[] = []
  for (const plugin of PLUGINS) {
    const label = haystackHit(plugin, needle)
    if (label)
      options.push({ value: plugin.id, label })
    if (options.length >= 6)
      break
  }
  // TxSearchSelect's own empty state is hard-coded English; a disabled row
  // in the reader's language stands in for it.
  return options.length ? options : [{ value: NO_MATCH, label: copy.value.noMatch, disabled: true }]
})

const visiblePlugins = computed(() => {
  const needle = query.value.toLowerCase()
  const list = PLUGINS.filter(plugin => (category.value === 'all' || plugin.category === category.value) && (!needle || haystackHit(plugin, needle) !== null))
  if (sortKey.value === 'newest')
    return list.sort((a, b) => a.days - b.days)
  if (sortKey.value === 'rating')
    return list.sort((a, b) => b.rating - a.rating || b.reviews - a.reviews)
  return list.sort((a, b) => b.installs - a.installs)
})

const installedRows = computed(() => {
  const list = updatesOnly.value ? updatablePlugins.value : installedPlugins.value
  // Plugins with a pending update first, then by name order of the catalogue.
  return [...list].sort((a, b) => Number(hasUpdate(b)) - Number(hasUpdate(a)))
})

const sectionTitle = computed(() => {
  if (searching.value)
    return copy.value.searchResults(query.value)
  return category.value === 'all' ? copy.value.sectionAll : L(CATEGORIES[category.value].label)
})

const viewItems = computed<FilterChipItem[]>(() => [
  { value: 'discover', label: copy.value.views.discover, iconClass: 'i-carbon-grid' },
  { value: 'installed', label: copy.value.views.installed, iconClass: 'i-carbon-checkmark-outline', count: installedPlugins.value.length },
])

const categoryItems = computed<FilterChipItem[]>(() => [
  { value: 'all', label: copy.value.all, count: PLUGINS.length },
  ...CATEGORY_IDS.map(id => ({
    value: id,
    label: L(CATEGORIES[id].label),
    iconClass: CATEGORIES[id].icon,
    count: PLUGINS.filter(plugin => plugin.category === id).length,
  })),
])

const navGroups = computed<SidebarNavGroup[]>(() => [
  { key: 'browse', label: copy.value.nav.browse },
  { key: 'categories', label: copy.value.nav.categories },
])

const navItems = computed<SidebarNavItem[]>(() => [
  { value: 'discover', label: copy.value.views.discover, group: 'browse', icon: 'i-carbon-grid' },
  { value: 'installed', label: copy.value.views.installed, group: 'browse', icon: 'i-carbon-checkmark-outline', badge: installedPlugins.value.length || undefined },
  { value: 'updates', label: copy.value.nav.updates, group: 'browse', icon: 'i-carbon-upgrade', badge: updatablePlugins.value.length || undefined },
  ...CATEGORY_IDS.map(id => ({
    value: `cat:${id}`,
    label: L(CATEGORIES[id].label),
    group: 'categories',
    icon: CATEGORIES[id].icon,
    badge: PLUGINS.filter(plugin => plugin.category === id).length,
  })),
])

const navValue = computed<SidebarNavValue>(() => {
  if (view.value === 'installed')
    return updatesOnly.value ? 'updates' : 'installed'
  return category.value === 'all' ? 'discover' : `cat:${category.value}`
})

/* ─── Toast ───────────────────────────────────────────────────────────── */

interface ToastAction { label: string, run: () => void }

const toast = reactive({
  open: false,
  text: '',
  icon: 'i-carbon-checkmark-outline',
  danger: false,
  action: null as ToastAction | null,
})
let toastTimer: ReturnType<typeof setTimeout> | undefined
// The panel sits over the bottom row of cards, so every toast closes by
// itself; only a pointer or keyboard focus resting on it holds it open.
let toastHovered = false
let toastFocused = false

function armToast(ms: number): void {
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.open = false
  }, ms)
}

function notify(text: string, icon: string, action: ToastAction | null = null, danger = false): void {
  toast.text = text
  toast.icon = icon
  toast.action = action
  toast.danger = danger
  toast.open = true
  if (toastHovered || toastFocused)
    clearTimeout(toastTimer)
  else
    armToast(action ? 4500 : 3200)
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
  toastHovered = false
  toastFocused = false
}

function runToastAction(): void {
  const action = toast.action
  closeToast()
  action?.run()
}

/* ─── Action slot ─────────────────────────────────────────────────────── */

function buttonView(label: string, name: string, icon: string, variant: 'primary' | 'secondary', extra: Partial<StoreActionView> = {}): StoreActionView {
  return {
    kind: 'button',
    label,
    ariaLabel: copy.value.verbFor(label, name),
    icon,
    variant,
    loading: false,
    status: '',
    detail: '',
    percentage: null,
    cancelLabel: '',
    cancellable: false,
    error: '',
    ...extra,
  }
}

function actionOf(plugin: Plugin): StoreActionView {
  const state = stateOf(plugin)
  const name = L(plugin.name)
  const c = copy.value
  if (BUSY.includes(state.phase)) {
    const downloading = state.phase === 'downloading'
    const percentage = downloading ? Math.round(state.progress) : null
    const phase = state.phase as keyof typeof c.phase
    return {
      ...buttonView('', name, '', 'secondary'),
      kind: 'progress',
      status: downloading ? `${c.phase.downloading} ${percentage}%` : c.phase[phase],
      detail: downloading ? c.bytes((plugin.size * state.progress / 100).toFixed(1), plugin.size.toFixed(1)) : '',
      percentage,
      cancelLabel: c.cancelFor(name),
      cancellable: state.phase === 'queued' || downloading,
    }
  }
  if (state.phase === 'failed')
    return buttonView(c.verb.retry, name, 'i-carbon-renew', 'secondary', { error: c.failReason })
  if (state.phase === 'uninstalling')
    return buttonView(c.phase.uninstalling, name, '', 'secondary', { loading: true })
  if (!state.version)
    return buttonView(c.verb.install, name, 'i-carbon-download', 'primary')
  if (hasUpdate(plugin))
    return buttonView(c.verb.update, name, 'i-carbon-upgrade', 'primary')
  if (!state.enabled)
    return buttonView(c.verb.enable, name, 'i-carbon-play', 'secondary')
  return buttonView(c.verb.open, name, 'i-carbon-launch', 'secondary')
}

/** The installed list has its own switch and menu, so only pending work shows there. */
function rowNeedsAction(plugin: Plugin): boolean {
  const state = stateOf(plugin)
  return BUSY.includes(state.phase) || state.phase === 'failed' || state.phase === 'uninstalling' || hasUpdate(plugin)
}

function onAction(plugin: Plugin): void {
  const state = stateOf(plugin)
  if (state.phase === 'failed')
    retry(plugin)
  else if (!state.version)
    openConfirm('permission', plugin)
  else if (hasUpdate(plugin))
    openConfirm('update', plugin)
  else if (!state.enabled)
    setEnabled(plugin, true)
  else
    notify(copy.value.toast.opened(L(plugin.name), plugin.features[0]?.triggers[0] ?? plugin.slug), 'i-carbon-launch')
}

/* ─── Install / update / uninstall flow ───────────────────────────────── */

// Every step waits for a click that started it: the timers below only
// simulate a download after the reader granted or confirmed.
const flowTimers = new Map<string, Set<ReturnType<typeof setTimeout>>>()
const DOWNLOAD_STEPS = [6, 11, 8, 14, 9, 12, 7, 13, 10, 10]

function flowLater(id: string, ms: number, run: () => void): void {
  let set = flowTimers.get(id)
  if (!set) {
    set = new Set()
    flowTimers.set(id, set)
  }
  const timer = setTimeout(() => {
    set.delete(timer)
    run()
  }, ms)
  set.add(timer)
}

function cancelFlowTimers(id: string): void {
  const set = flowTimers.get(id)
  if (!set)
    return
  for (const timer of set)
    clearTimeout(timer)
  set.clear()
}

function clearAllFlows(): void {
  for (const id of flowTimers.keys())
    cancelFlowTimers(id)
  flowTimers.clear()
}

function runFlow(plugin: Plugin, op: Op): void {
  const state = stateOf(plugin)
  cancelFlowTimers(plugin.id)
  state.op = op
  state.phase = 'queued'
  state.progress = 0
  state.attempts += 1
  flowLater(plugin.id, 320, () => download(plugin))
}

function download(plugin: Plugin): void {
  const state = stateOf(plugin)
  state.phase = 'downloading'
  let tick = 0
  const step = (): void => {
    state.progress = Math.min(100, state.progress + DOWNLOAD_STEPS[tick % DOWNLOAD_STEPS.length]!)
    tick += 1
    if (plugin.flaky && state.op === 'install' && state.attempts === 1 && state.progress >= 55) {
      fail(plugin)
      return
    }
    if (state.progress >= 100) {
      flowLater(plugin.id, 160, () => verify(plugin))
      return
    }
    flowLater(plugin.id, 130, step)
  }
  flowLater(plugin.id, 130, step)
}

function verify(plugin: Plugin): void {
  const state = stateOf(plugin)
  state.phase = 'verifying'
  flowLater(plugin.id, 520, () => {
    state.phase = 'installing'
    flowLater(plugin.id, 520, () => finish(plugin))
  })
}

// When a flow ends, the progress bar in the slot turns back into a button and
// the cancel button that held focus goes with it. A keyboard reader who
// started it lands on the new button (Open, Retry, Install) in the same slot.
function withSlotFocus(change: () => void): void {
  const active = hasWindow() ? document.activeElement : null
  const slot = active instanceof HTMLElement && rootRef.value?.contains(active) ? active.closest<HTMLElement>('.store-action') : null
  change()
  if (!slot)
    return
  void nextTick(() => {
    const now = document.activeElement
    if (now && now !== document.body)
      return
    if (slot.isConnected)
      slot.querySelector<HTMLElement>('button:not([disabled])')?.focus({ preventScroll: true })
  })
}

function finish(plugin: Plugin): void {
  const state = stateOf(plugin)
  const name = L(plugin.name)
  const updated = state.op === 'update'
  withSlotFocus(() => {
    state.version = plugin.version
    state.enabled = true
    state.phase = 'idle'
    state.progress = 0
  })
  if (updated) {
    notify(copy.value.toast.updated(name), 'i-carbon-upgrade')
    return
  }
  const text = state.grant === 'session' ? copy.value.toast.installedSession(name) : copy.value.toast.installed(name)
  notify(text, 'i-carbon-checkmark-outline', { label: copy.value.toast.open, run: () => onAction(plugin) })
}

function fail(plugin: Plugin): void {
  const state = stateOf(plugin)
  withSlotFocus(() => {
    state.phase = 'failed'
    state.progress = 0
  })
  notify(copy.value.toast.failed(L(plugin.name)), 'i-carbon-warning-alt', { label: copy.value.toast.retry, run: () => retry(plugin) }, true)
}

/** The grant chosen before the failure still stands, so a retry goes straight to the download. */
function retry(plugin: Plugin): void {
  withSlotFocus(() => runFlow(plugin, stateOf(plugin).op))
}

function cancelDownload(plugin: Plugin): void {
  const state = stateOf(plugin)
  cancelFlowTimers(plugin.id)
  withSlotFocus(() => {
    state.phase = 'idle'
    state.progress = 0
    if (state.op === 'install')
      state.grant = null
  })
  notify(copy.value.toast.cancelled(L(plugin.name)), 'i-carbon-close-outline')
}

function setEnabled(plugin: Plugin, enabled: boolean): void {
  stateOf(plugin).enabled = enabled
  const name = L(plugin.name)
  notify(enabled ? copy.value.toast.enabled(name) : copy.value.toast.disabled(name), enabled ? 'i-carbon-play' : 'i-carbon-pause')
}

async function copyPluginId(plugin: Plugin): Promise<void> {
  // Only from the reader's own menu choice.
  if (hasNavigator()) {
    try {
      await navigator.clipboard.writeText(plugin.id)
    }
    catch {
      // Clipboard access can be denied; the feedback still confirms the intent.
    }
  }
  notify(copy.value.toast.copied(plugin.id), 'i-carbon-copy')
}

/* ─── Confirmations ───────────────────────────────────────────────────── */

const confirm = reactive({ open: false, kind: 'permission' as ConfirmKind, id: '' })
const confirmPlugin = computed(() => pluginById(confirm.id))

// Where focus goes once a confirmation has done its work. TxModal hands focus
// back to the button that opened it, but that button turns into a progress bar
// (or its row, or its menu, disappears), so the store settles it: a live
// button in the same action slot first, then the surrounding region. Both are
// looked up when the dialog opens — a detached node has no ancestors left.
interface FocusAnchor { slot: HTMLElement | null, region: HTMLElement | null }
let focusAnchor: FocusAnchor | null = null

function captureFocusAnchor(): void {
  const active = hasWindow() ? document.activeElement : null
  if (!(active instanceof HTMLElement) || !rootRef.value?.contains(active)) {
    focusAnchor = null
    return
  }
  const region = active.closest<HTMLElement>('.store-detail, .store-installed, .store-browse')
  // The "⋯" menu sits beside the detail's action slot; from there, that slot.
  const slot = active.closest<HTMLElement>('.store-action')
    ?? (region?.classList.contains('store-detail') ? region.querySelector<HTMLElement>('.store-action') : null)
  focusAnchor = { slot, region }
}

function settleFocus(): void {
  const anchor = focusAnchor
  focusAnchor = null
  if (!anchor)
    return
  void nextTick(() => {
    // Only when focus was actually lost — dropped to <body>, or left on a
    // button in the dialog that is fading out — never pulled back from
    // wherever the reader has since moved it.
    const active = document.activeElement
    const lost = !active || active === document.body || !!active.closest('.tx-modal__overlay')
    if (!lost)
      return
    const button = anchor.slot?.isConnected ? anchor.slot.querySelector<HTMLElement>('button:not([disabled])') : null
    const target = button ?? (anchor.region?.isConnected ? anchor.region : null)
    target?.focus({ preventScroll: true })
  })
}

function openConfirm(kind: ConfirmKind, plugin: Plugin): void {
  captureFocusAnchor()
  confirm.kind = kind
  confirm.id = plugin.id
  confirm.open = true
}

const confirmTitle = computed(() => {
  const modal = copy.value.modal
  if (confirm.kind === 'permission')
    return modal.permissionTitle
  return confirm.kind === 'update' ? modal.updateTitle : modal.uninstallTitle
})

function permissionRows(grants: Grant[], required: boolean): StorePermissionRow[] {
  const detail = copy.value.detail
  return grants.map((item) => {
    const meta = PERMISSIONS[item.id]
    return {
      id: item.id,
      name: L(meta.name),
      reason: L(item.reason),
      icon: meta.icon,
      risk: detail.risk[meta.risk],
      tone: RISK[meta.risk].tone,
      riskIcon: RISK[meta.risk].icon,
      tag: required ? detail.required : detail.optional,
      note: required ? '' : detail.askLater,
    }
  })
}

const confirmRequiredRows = computed(() => (confirmPlugin.value ? permissionRows(confirmPlugin.value.required, true).map(row => ({ ...row, tag: '' })) : []))
const confirmOptionalNames = computed(() => (confirmPlugin.value ? confirmPlugin.value.optional.map(item => L(PERMISSIONS[item.id].name)).join(zh.value ? '、' : ', ') : ''))
const confirmAddedRows = computed(() => {
  const plugin = confirmPlugin.value
  if (!plugin?.adds?.length)
    return []
  const all = [...plugin.required, ...plugin.optional]
  return permissionRows(all.filter(item => plugin.adds!.includes(item.id)), true).map(row => ({ ...row, tag: '' }))
})

function closeConfirm(): Plugin | undefined {
  confirm.open = false
  return confirmPlugin.value
}

function grantAndInstall(choice: 'always' | 'session'): void {
  const plugin = closeConfirm()
  if (!plugin)
    return
  stateOf(plugin).grant = choice
  runFlow(plugin, 'install')
  settleFocus()
}

function rejectInstall(): void {
  const plugin = closeConfirm()
  if (plugin)
    notify(copy.value.toast.rejected(L(plugin.name)), 'i-carbon-close-outline')
  settleFocus()
}

function confirmUpdate(): void {
  const plugin = closeConfirm()
  if (!plugin)
    return
  runFlow(plugin, 'update')
  settleFocus()
}

function confirmUninstall(): void {
  const plugin = closeConfirm()
  if (!plugin)
    return
  const state = stateOf(plugin)
  cancelFlowTimers(plugin.id)
  state.phase = 'uninstalling'
  flowLater(plugin.id, 420, () => {
    state.version = null
    state.enabled = true
    state.grant = null
    state.phase = 'idle'
    notify(copy.value.toast.uninstalled(L(plugin.name)), 'i-carbon-trash-can', { label: copy.value.toast.reinstall, run: () => openConfirm('permission', plugin) })
    settleFocus()
  })
}

/** Closed from the dialog itself (Esc, backdrop, ×): nothing happens and TxModal restores focus. */
function onConfirmDismiss(): void {
  focusAnchor = null
}

/* ─── Menus ───────────────────────────────────────────────────────────── */

// A menu item is removed as the menu closes, so focus would drop to <body>.
// Moving it back to the "⋯" trigger first lets a dialog opened from the menu
// return there, the way it would from a button.
let menuTrigger: HTMLElement | null = null

function rememberMenuTrigger(): void {
  const active = hasWindow() ? document.activeElement : null
  menuTrigger = active instanceof HTMLElement && rootRef.value?.contains(active) ? active : null
}

function fromMenu(run: () => void): void {
  menuTrigger?.focus({ preventScroll: true })
  run()
}

/* ─── Views, search and detail ────────────────────────────────────────── */

type Opener = 'card' | 'row' | 'slide' | 'search'

let browseScroll = 0
// In the column the list unmounts while details are open, so the opener is
// remembered by what it was, and found again in the list that comes back.
let lastOpener: { kind: Opener, id: string } | null = null

function scrollerOfView(): HTMLElement | null {
  return view.value === 'discover' ? browseRef.value : installedRef.value
}

/** The list is about to unmount: a hidden carousel has nothing to turn. */
function leaveCarousel(): void {
  stopCarousel()
  carouselHover.value = false
  carouselFocus.value = false
}

function openDetail(id: string, opener: Opener): void {
  detailId.value = id
  // Picking a suggestion remounts the search field, so focus has to go somewhere.
  let focusPanel = opener === 'search'
  if (mode.value !== 'wide') {
    if (!detailOpen.value) {
      browseScroll = scrollerOfView()?.scrollTop ?? 0
      lastOpener = opener === 'search' ? null : { kind: opener, id }
      leaveCarousel()
    }
    detailOpen.value = true
    focusPanel = true
  }
  void nextTick(() => {
    if (detailScrollRef.value)
      detailScrollRef.value.scrollTop = 0
    // Only ever after the reader's own click or key press.
    if (focusPanel)
      detailRef.value?.focus({ preventScroll: true })
  })
}

function closeDetail(restoreFocus = true): void {
  if (!detailOpen.value)
    return
  detailOpen.value = false
  const opener = lastOpener
  lastOpener = null
  void nextTick(() => {
    const scroller = scrollerOfView()
    if (scroller)
      scroller.scrollTop = browseScroll
    if (restoreFocus && opener)
      rootRef.value?.querySelector<HTMLElement>(`[data-opener="${opener.kind}"][data-plugin="${opener.id}"]`)?.focus({ preventScroll: true })
  })
}

function setView(next: View): void {
  if (next !== 'discover')
    leaveCarousel()
  const changed = view.value !== next
  if (changed) {
    view.value = next
    // A different list starts at its top, including one coming back from details.
    browseScroll = 0
  }
  if (detailOpen.value) {
    closeDetail(false)
    return
  }
  if (changed) {
    void nextTick(() => {
      const scroller = scrollerOfView()
      if (scroller)
        scroller.scrollTop = 0
    })
  }
}

function onViewChip(value: FilterChipValue): void {
  updatesOnly.value = false
  setView(value as View)
}

function onCategoryChip(value: FilterChipValue): void {
  category.value = value as CategoryFilter
}

function onNav(value: SidebarNavValue): void {
  const key = String(value)
  if (key === 'installed' || key === 'updates') {
    updatesOnly.value = key === 'updates'
    setView('installed')
    return
  }
  updatesOnly.value = false
  setView('discover')
  category.value = key.startsWith('cat:') ? key.slice(4) as CategoryId : 'all'
}

function showUpdates(): void {
  updatesOnly.value = true
  setView('installed')
}

function onSearch(text: string): void {
  suggestQuery.value = text
  const trimmed = text.trim()
  query.value = trimmed
  if (!trimmed)
    return
  // Results replace the carousel until the search is cleared.
  leaveCarousel()
  category.value = 'all'
  if (view.value !== 'discover')
    setView('discover')
  // Typing must keep focus in the field, so the detail steps aside silently.
  closeDetail(false)
}

function clearSearch(): void {
  query.value = ''
  suggestQuery.value = ''
  searchKey.value += 1
}

function onSuggestion(option: TxSearchSelectOption): void {
  if (option.value === NO_MATCH)
    return
  // A fresh field: the picked label would otherwise stay in the input while
  // the grid filter it stood for is cleared.
  clearSearch()
  openDetail(String(option.value), 'search')
}

function onRootKeydown(event: KeyboardEvent): void {
  stopAutoplay()
  if (event.key !== 'Escape' || event.defaultPrevented)
    return
  if (mode.value === 'wide' || !detailOpen.value)
    return
  const target = event.target as HTMLElement | null
  if (target?.closest('input, textarea, [aria-expanded="true"]'))
    return
  // Handled here, so the expanded overlay stays open.
  event.preventDefault()
  closeDetail()
}

/* ─── Reviews ─────────────────────────────────────────────────────────── */

const myReviews = reactive<Record<string, Review[]>>({})
const helpfulVotes = reactive<Record<string, boolean>>({})
const draft = reactive({ stars: 0, body: '', error: '' })

function resetDraft(): void {
  draft.stars = 0
  draft.body = ''
  draft.error = ''
}

function reviewsOf(plugin: Plugin): Review[] {
  const index = PLUGINS.indexOf(plugin)
  const seeds: Review[] = plugin.reviewSeeds
    ? plugin.reviewSeeds.map((seed, position) => ({
        key: `${plugin.id}:${position}`,
        author: seed.author,
        stars: seed.stars,
        days: seed.days,
        body: L(seed.body),
        helpful: seed.helpful,
        pending: false,
      }))
    : GENERIC_REVIEWS.map((seed, position) => ({
        key: `${plugin.id}:${position}`,
        author: REVIEWER_ROTATION[(index + position) % REVIEWER_ROTATION.length]!,
        stars: seed.stars,
        days: seed.days,
        body: L(seed.body),
        helpful: seed.helpful,
        pending: false,
      }))
  return [...(myReviews[plugin.id] ?? []), ...seeds]
}

function reviewTime(review: Review): string {
  if (review.author === 'you')
    return copy.value.detail.justNow
  return relativeFormat.value.format(-review.days, 'day')
}

function toggleHelpful(review: Review): void {
  helpfulVotes[review.key] = !helpfulVotes[review.key]
}

function helpfulCount(review: Review): number {
  return review.helpful + (helpfulVotes[review.key] ? 1 : 0)
}

function submitReview(plugin: Plugin): void {
  const body = draft.body.trim()
  if (!draft.stars) {
    draft.error = copy.value.detail.ratingRequired
    return
  }
  if (!body) {
    draft.error = copy.value.detail.contentRequired
    return
  }
  const list = myReviews[plugin.id] ?? []
  myReviews[plugin.id] = [{ key: `${plugin.id}:mine:${list.length}`, author: 'you', stars: draft.stars, days: 0, body, helpful: 0, pending: true }, ...list]
  resetDraft()
  notify(copy.value.detail.submitted, 'i-carbon-chat')
}

function reviewerColors(id: ReviewerId): { bg: string, ink: string } {
  const hue = REVIEWERS[id].hue
  return {
    bg: `color-mix(in srgb, ${hue} 22%, var(--tx-bg-color, #fff))`,
    ink: `color-mix(in srgb, ${hue} 70%, var(--tx-text-color-primary, #303133))`,
  }
}

function displayRating(value: number): number {
  return Math.round(value * 2) / 2
}

watch(detailId, () => {
  resetDraft()
  void nextTick(() => {
    if (detailScrollRef.value)
      detailScrollRef.value.scrollTop = 0
  })
})

/* ─── Updates check ───────────────────────────────────────────────────── */

let checkTimer: ReturnType<typeof setTimeout> | undefined

function checkUpdates(): void {
  checking.value = true
  clearTimeout(checkTimer)
  checkTimer = setTimeout(() => {
    checking.value = false
    updatesChecked.value = true
    const count = updatablePlugins.value.length
    notify(count ? copy.value.updatesAvailable(count) : copy.value.noUpdates, count ? 'i-carbon-upgrade' : 'i-carbon-checkmark-outline')
  }, 800)
}

/* ─── Carousel ────────────────────────────────────────────────────────── */

const SLIDE_MS = 5000

const slideIndex = ref(0)
const carouselPlaying = ref(false)
const carouselHover = ref(false)
const carouselFocus = ref(false)
const carouselRef = ref<HTMLElement | null>(null)
let slideTimer: ReturnType<typeof setTimeout> | undefined
let slidesLeft = 0

const slides = computed(() => FEATURED.map(item => ({ ...item, plugin: pluginById(item.id)!, art: bannerOf(item.id, item.seed) })))

// One lap, then it stops. Hover and focus hold the current slide; the pause
// button is always there (WCAG 2.2.2).
function scheduleSlide(): void {
  clearTimeout(slideTimer)
  if (!carouselPlaying.value)
    return
  slideTimer = setTimeout(() => {
    if (carouselHover.value || carouselFocus.value) {
      scheduleSlide()
      return
    }
    slideIndex.value = (slideIndex.value + 1) % FEATURED.length
    slidesLeft -= 1
    if (slidesLeft <= 0) {
      carouselPlaying.value = false
      return
    }
    scheduleSlide()
  }, SLIDE_MS)
}

function startCarousel(): void {
  carouselPlaying.value = true
  slidesLeft = FEATURED.length
  scheduleSlide()
}

function stopCarousel(): void {
  carouselPlaying.value = false
  clearTimeout(slideTimer)
  slideTimer = undefined
}

function toggleCarousel(): void {
  if (carouselPlaying.value)
    stopCarousel()
  else
    startCarousel()
}

function goToSlide(index: number): void {
  stopCarousel()
  slideIndex.value = (index + FEATURED.length) % FEATURED.length
}

function onCarouselKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey)
    return
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
    return
  event.preventDefault()
  goToSlide(slideIndex.value + (event.key === 'ArrowLeft' ? -1 : 1))
}

function onCarouselFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null
  if (!next || !carouselRef.value?.contains(next))
    carouselFocus.value = false
}

/* ─── Autoplay ────────────────────────────────────────────────────────── */

let entered = false
let autoplayTimer: ReturnType<typeof setTimeout> | undefined

function revealUpdates(announce: boolean): void {
  updatesChecked.value = true
  const count = updatablePlugins.value.length
  if (announce && count)
    notify(copy.value.updatesAvailable(count), 'i-carbon-upgrade', { label: copy.value.viewUpdates, run: showUpdates })
}

// Playback turns the carousel and finishes a background update check. It
// never installs, updates or opens a dialog: those wait for the reader.
function play(): void {
  clearTimeout(autoplayTimer)
  autoplayTimer = undefined
  if (prefersReducedMotion()) {
    revealUpdates(false)
    return
  }
  startCarousel()
  autoplayTimer = setTimeout(() => {
    autoplayTimer = undefined
    revealUpdates(true)
  }, 1500)
}

/** Reader input settles the pending check quietly; the carousel keeps its own rules. */
function stopAutoplay(): void {
  if (autoplayTimer === undefined)
    return
  clearTimeout(autoplayTimer)
  autoplayTimer = undefined
  revealUpdates(false)
}

function onEnter(): void {
  entered = true
  play()
}

const tabsAnimation = computed(() =>
  prefersReducedMotion() ? { size: false, nav: false, indicator: false, content: false } : undefined,
)

/* ─── Reset ───────────────────────────────────────────────────────────── */

function clearTimers(): void {
  clearTimeout(autoplayTimer)
  autoplayTimer = undefined
  clearTimeout(toastTimer)
  clearTimeout(checkTimer)
  stopCarousel()
  clearAllFlows()
}

function resetDemo(): void {
  clearTimers()
  closeToast()
  toast.action = null
  confirm.open = false
  focusAnchor = null
  menuTrigger = null
  lastOpener = null
  Object.assign(installs, seedInstalls())
  for (const key of Object.keys(myReviews))
    delete myReviews[key]
  for (const key of Object.keys(helpfulVotes))
    delete helpfulVotes[key]
  resetDraft()
  updatesChecked.value = false
  checking.value = false
  view.value = 'discover'
  category.value = 'all'
  sortKey.value = 'popular'
  updatesOnly.value = false
  clearSearch()
  detailOpen.value = false
  detailId.value = DEFAULT_DETAIL
  detailTab.value = 'overview'
  slideIndex.value = 0
  void nextTick(() => {
    for (const scroller of [browseRef.value, installedRef.value, detailScrollRef.value]) {
      if (scroller)
        scroller.scrollTop = 0
    }
  })
  if (entered)
    play()
}

defineExpose({ resetDemo })

watch(locale, () => resetDemo())

onBeforeUnmount(clearTimers)
</script>

<template>
  <TemplateFrame :title="copy.frameTitle" :height="580" @enter="onEnter">
    <template #default="{ width: stageW, height: stageH }">
      <StageSize :width="stageW" :height="stageH" @resize="onStageResize" />
      <div
        ref="rootRef"
        class="store"
        :class="[`is-${mode}`, { 'is-reading': mode !== 'wide' && detailOpen }]"
        @keydown="onRootKeydown"
        @pointerdown="stopAutoplay"
      >
        <header class="store__head">
          <div class="store__brand">
            <span class="store__logo" aria-hidden="true"><span class="i-carbon-store" /></span>
            <div class="store__brand-text">
              <strong class="store__title">{{ copy.brand }}</strong>
              <span class="store__subtitle">{{ copy.subtitle(PLUGINS.length) }}</span>
            </div>
          </div>
          <TxFilterChips
            v-if="mode !== 'wide'"
            class="store__views"
            :model-value="view"
            :items="viewItems"
            role="tablist"
            :aria-label="copy.viewsLabel"
            @update:model-value="onViewChip"
          />
          <div class="store__search">
            <TxSearchSelect
              :key="searchKey"
              model-value=""
              remote
              :search-debounce="140"
              :options="suggestions"
              :placeholder="copy.searchPlaceholder"
              :dropdown-max-height="300"
              @search="onSearch"
              @select="onSuggestion"
            />
          </div>
        </header>

        <div v-if="mode !== 'wide' && view === 'discover' && !detailOpen" class="store__filters">
          <TxFilterChips
            :model-value="category"
            :items="categoryItems"
            :aria-label="copy.categoriesLabel"
            @update:model-value="onCategoryChip"
          />
        </div>

        <TxSidebarNav
          v-if="mode === 'wide'"
          class="store__side"
          :model-value="navValue"
          :items="navItems"
          :groups="navGroups"
          :aria-label="copy.nav.label"
          @update:model-value="onNav"
        />

        <!-- Discover ------------------------------------------------------ -->
        <div v-if="(mode === 'wide' || !detailOpen) && view === 'discover'" ref="browseRef" class="store-browse">
          <!-- The art is dark in either docs theme, so the whole carousel is a
               dark-theme scope: the tuffex dark token block matches the
               attribute on any element (the `.dark` class would also switch on
               UnoCSS `dark:` variants), and the action buttons on the slides
               resolve their dark colours here even on the light docs page. -->
          <section
            v-if="!searching"
            ref="carouselRef"
            class="store-carousel"
            data-theme="dark"
            role="region"
            aria-roledescription="carousel"
            :aria-label="copy.carousel.label"
            @mouseenter="carouselHover = true"
            @mouseleave="carouselHover = false"
            @focusin="carouselFocus = true"
            @focusout="onCarouselFocusOut"
            @keydown="onCarouselKeydown"
          >
            <div class="store-carousel__controls">
              <button
                type="button"
                class="store-carousel__button"
                :aria-label="carouselPlaying ? copy.carousel.pause : copy.carousel.play"
                @click="toggleCarousel"
              >
                <span :class="carouselPlaying ? 'i-carbon-pause-filled' : 'i-carbon-play-filled'" aria-hidden="true" />
              </button>
              <button type="button" class="store-carousel__button" :aria-label="copy.carousel.prev" @click="goToSlide(slideIndex - 1)">
                <span class="i-carbon-chevron-left" aria-hidden="true" />
              </button>
              <button type="button" class="store-carousel__button" :aria-label="copy.carousel.next" @click="goToSlide(slideIndex + 1)">
                <span class="i-carbon-chevron-right" aria-hidden="true" />
              </button>
            </div>
            <div class="store-carousel__track" :aria-live="carouselPlaying ? 'off' : 'polite'">
              <div
                v-for="(slide, index) in slides"
                :key="slide.id"
                class="store-slide"
                :class="{ 'is-current': index === slideIndex }"
                role="group"
                aria-roledescription="slide"
                :aria-label="copy.carousel.slide(index + 1, slides.length)"
                :inert="index === slideIndex ? undefined : true"
              >
                <img class="store-slide__art" :src="slide.art" alt="" draggable="false">
                <div class="store-slide__body">
                  <span class="store-glyph is-md" :style="glyphStyle(slide.plugin)" aria-hidden="true"><span :class="slide.plugin.icon" /></span>
                  <div class="store-slide__text">
                    <span class="store-slide__eyebrow">{{ copy.carousel.pick }} · {{ L(CATEGORIES[slide.plugin.category].label) }}</span>
                    <strong class="store-slide__name">{{ L(slide.plugin.name) }}</strong>
                    <p class="store-slide__headline">
                      {{ L(slide.headline) }}
                    </p>
                  </div>
                  <div class="store-slide__actions">
                    <TemplateStoreAction :view="actionOf(slide.plugin)" compact @press="onAction(slide.plugin)" @cancel="cancelDownload(slide.plugin)" />
                    <button
                      type="button"
                      class="store-slide__more"
                      data-opener="slide"
                      :data-plugin="slide.plugin.id"
                      @click="openDetail(slide.plugin.id, 'slide')"
                    >
                      {{ copy.carousel.learnMore }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div class="store-carousel__dots">
              <button
                v-for="(slide, index) in slides"
                :key="slide.id"
                type="button"
                class="store-carousel__dot"
                :class="{ 'is-current': index === slideIndex }"
                :aria-label="copy.carousel.goTo(index + 1)"
                :aria-current="index === slideIndex ? 'true' : undefined"
                @click="goToSlide(index)"
              />
            </div>
          </section>

          <div v-if="!searching && updatablePlugins.length" class="store-banner">
            <TxStatusBadge :text="copy.updateBanner(updatablePlugins.length)" status="info" icon="i-carbon-upgrade" size="sm" />
            <button type="button" class="store-banner__link" @click="showUpdates">
              {{ copy.viewUpdates }}
              <span class="i-carbon-chevron-right" aria-hidden="true" />
            </button>
          </div>

          <section class="store-section" :aria-label="sectionTitle">
            <div class="store-section__head">
              <h3 class="store-section__title">
                {{ sectionTitle }}
              </h3>
              <span class="store-section__count">{{ visiblePlugins.length }}</span>
              <TxButton v-if="searching" size="sm" variant="ghost" icon="i-carbon-close" @click="clearSearch">
                {{ copy.clearSearch }}
              </TxButton>
              <TxFlatRadio v-model="sortKey" class="store-section__sort" size="sm" :aria-label="copy.sortLabel">
                <TxFlatRadioItem v-for="key in SORT_KEYS" :key="key" :value="key" :label="copy.sort[key]" />
              </TxFlatRadio>
            </div>

            <ul v-if="visiblePlugins.length" class="store-grid">
              <li v-for="plugin in visiblePlugins" :key="plugin.id" class="store-grid__cell">
                <TxCard class="store-card" variant="solid" size="small" :radius="14">
                  <span class="store-card__icon">
                    <TxIconChip :size="40" :radius="11" :tone="CATEGORIES[plugin.category].tone" variant="soft">
                      <span :class="plugin.icon" class="store-card__glyph" />
                    </TxIconChip>
                  </span>
                  <div class="store-card__heading">
                    <!-- The title opens the details; its ::after stretches over
                         the whole card, and the action row sits above it. -->
                    <button
                      type="button"
                      class="store-card__open"
                      data-opener="card"
                      :data-plugin="plugin.id"
                      :aria-label="copy.openDetail(L(plugin.name))"
                      @click="openDetail(plugin.id, 'card')"
                    >
                      {{ L(plugin.name) }}
                    </button>
                    <span class="store-card__author">
                      <span v-if="isOfficial(plugin)" class="i-carbon-certificate-check store-card__badge" aria-hidden="true" />
                      {{ authorName(plugin) }} · {{ isOfficial(plugin) ? copy.official : copy.community }}
                    </span>
                  </div>
                  <p class="store-card__summary">
                    {{ L(plugin.summary) }}
                  </p>
                  <div class="store-card__stats">
                    <span class="store-card__stars" aria-hidden="true">
                      <TxRating :model-value="displayRating(plugin.rating)" readonly :size="12" :gap="1" :precision="0.5" />
                    </span>
                    <span aria-hidden="true">{{ plugin.rating.toFixed(1) }} · {{ copy.installsShort(compactNumber.format(plugin.installs)) }}</span>
                    <span class="store-sr">{{ copy.ratingText(plugin.rating.toFixed(1), fullNumber.format(plugin.reviews)) }}, {{ copy.installsShort(fullNumber.format(plugin.installs)) }}</span>
                  </div>
                  <div class="store-card__tags">
                    <TxTag :label="L(CATEGORIES[plugin.category].label)" size="sm" variant="soft" color="var(--tx-text-color-secondary)" />
                    <TxTag v-if="plugin.channel !== 'RELEASE'" :label="plugin.channel" size="sm" variant="outline" :color="CHANNEL_COLOR[plugin.channel]" />
                  </div>
                  <div class="store-card__action">
                    <TemplateStoreAction :view="actionOf(plugin)" compact @press="onAction(plugin)" @cancel="cancelDownload(plugin)" />
                  </div>
                </TxCard>
              </li>
            </ul>
            <TxSearchEmpty
              v-else
              size="small"
              :title="copy.emptySearchTitle"
              :description="copy.emptySearchDesc"
              :primary-action="{ label: copy.clearSearch, variant: 'secondary', size: 'sm' }"
              @primary="clearSearch"
            >
              <template #icon>
                <span class="store-empty-icon i-carbon-search" aria-hidden="true" />
              </template>
            </TxSearchEmpty>
          </section>

          <p class="store-browse__note">
            {{ copy.footnote }}
          </p>
        </div>

        <!-- Installed ----------------------------------------------------- -->
        <div
          v-else-if="mode === 'wide' || !detailOpen"
          ref="installedRef"
          class="store-installed"
          role="region"
          tabindex="-1"
          :aria-label="copy.views.installed"
        >
          <div class="store-installed__head">
            <div class="store-installed__heading">
              <h3 class="store-section__title">
                {{ updatesOnly ? copy.nav.updates : copy.views.installed }}
              </h3>
              <span class="store-installed__summary">{{ copy.installedSummary(installedPlugins.length, updatablePlugins.length) }}</span>
            </div>
            <TxTag v-if="updatesOnly" :label="copy.updatesOnly" size="sm" variant="soft" closable :close-aria-label="copy.showAll" @close="updatesOnly = false" />
            <TxButton size="sm" variant="secondary" icon="i-carbon-renew" :loading="checking" @click="checkUpdates">
              {{ checking ? copy.checking : copy.checkUpdates }}
            </TxButton>
          </div>

          <ul v-if="installedRows.length" class="store-rows">
            <li v-for="plugin in installedRows" :key="plugin.id">
              <TxCardItem class="store-row" :class="{ 'is-off': !stateOf(plugin).enabled }" align="center">
                <template #avatar>
                  <TxIconChip :size="34" :radius="10" :tone="CATEGORIES[plugin.category].tone" variant="soft">
                    <span :class="plugin.icon" class="store-row__glyph" />
                  </TxIconChip>
                </template>
                <template #title>
                  <button
                    type="button"
                    class="store-row__name"
                    data-opener="row"
                    :data-plugin="plugin.id"
                    :aria-label="copy.openDetail(L(plugin.name))"
                    @click="openDetail(plugin.id, 'row')"
                  >
                    {{ L(plugin.name) }}
                  </button>
                </template>
                <template #subtitle>
                  {{ copy.rowVersion(stateOf(plugin).version ?? plugin.version, isOfficial(plugin)) }}
                  <template v-if="!stateOf(plugin).enabled">
                    · {{ copy.disabledTag }}
                  </template>
                </template>
                <template #right>
                  <div class="store-row__tools">
                    <TemplateStoreAction v-if="rowNeedsAction(plugin)" class="store-row__action" :view="actionOf(plugin)" compact @press="onAction(plugin)" @cancel="cancelDownload(plugin)" />
                    <TxSwitch
                      :model-value="stateOf(plugin).enabled"
                      size="small"
                      :disabled="stateOf(plugin).phase !== 'idle'"
                      :aria-label="copy.enableSwitch(L(plugin.name))"
                      @update:model-value="setEnabled(plugin, $event)"
                    />
                    <TxDropdownMenu placement="bottom-end" :min-width="180" @open="rememberMenuTrigger">
                      <template #trigger>
                        <TxIconButton icon="i-carbon-overflow-menu-horizontal" size="sm" :label="copy.more(L(plugin.name))" />
                      </template>
                      <TxDropdownItem @select="fromMenu(() => openConfirm('uninstall', plugin))">
                        <span class="store-menu-row"><span class="i-carbon-trash-can" aria-hidden="true" />{{ copy.menu.uninstall }}</span>
                      </TxDropdownItem>
                      <TxDropdownItem @select="fromMenu(() => copyPluginId(plugin))">
                        <span class="store-menu-row"><span class="i-carbon-copy" aria-hidden="true" />{{ copy.menu.copyId }}</span>
                      </TxDropdownItem>
                    </TxDropdownMenu>
                  </div>
                </template>
              </TxCardItem>
            </li>
          </ul>
          <TxEmptyState
            v-else
            variant="custom"
            size="small"
            :title="copy.installedEmptyTitle"
            :description="copy.installedEmptyDesc"
            :primary-action="{ label: copy.goDiscover, variant: 'secondary', size: 'sm', icon: 'i-carbon-grid' }"
            @primary="onViewChip('discover')"
          >
            <!-- A static glyph: the built-in illustrations loop forever and
                 have no reduced-motion stop. -->
            <template #icon>
              <span class="store-empty-icon i-carbon-plug" aria-hidden="true" />
            </template>
          </TxEmptyState>
        </div>

        <!-- Details ------------------------------------------------------- -->
        <section
          v-if="detailShown"
          ref="detailRef"
          class="store-detail"
          :class="{ 'is-panel': mode === 'wide' }"
          tabindex="-1"
          :aria-label="copy.detail.label(L(current.name))"
        >
          <div v-if="mode !== 'wide'" class="store-detail__bar">
            <TxButton size="sm" variant="ghost" icon="i-carbon-arrow-left" @click="closeDetail()">
              {{ copy.detail.back }}
            </TxButton>
            <span class="store-detail__crumb">{{ copy.brand }} › {{ L(CATEGORIES[current.category].label) }} › {{ L(current.name) }}</span>
          </div>

          <div ref="detailScrollRef" class="store-detail__scroll">
            <div class="store-detail__head">
              <TxCornerOverlay placement="bottom-right" :offset-x="-5" :offset-y="-5">
                <span class="store-glyph is-lg" :style="glyphStyle(current)" aria-hidden="true"><span :class="current.icon" /></span>
                <template v-if="isOfficial(current)" #overlay>
                  <span class="store-glyph__badge"><span class="i-carbon-certificate-check" /></span>
                </template>
              </TxCornerOverlay>
              <div class="store-detail__identity">
                <h3 class="store-detail__name">
                  {{ L(current.name) }}
                </h3>
                <div class="store-detail__byline">
                  <TxTooltip :content="isOfficial(current) ? copy.officialTip : copy.communityTip">
                    <span class="store-detail__source" :class="{ 'is-community': !isOfficial(current) }" tabindex="0">
                      <span :class="isOfficial(current) ? 'i-carbon-certificate-check' : 'i-carbon-user-multiple'" aria-hidden="true" />
                      {{ isOfficial(current) ? copy.official : copy.community }}
                    </span>
                  </TxTooltip>
                  <span>{{ authorName(current) }}</span>
                  <span aria-hidden="true">·</span>
                  <span>{{ L(CATEGORIES[current.category].label) }}</span>
                </div>
              </div>
            </div>

            <p class="store-detail__summary">
              {{ L(current.summary) }}
            </p>

            <div class="store-detail__stats">
              <span class="store-card__stars" aria-hidden="true">
                <TxRating :model-value="displayRating(current.rating)" readonly :size="13" :gap="1" :precision="0.5" />
              </span>
              <span aria-hidden="true">{{ current.rating.toFixed(1) }} · {{ copy.detail.reviewCount(fullNumber.format(current.reviews)) }} · {{ copy.installsShort(compactNumber.format(current.installs)) }}</span>
              <span class="store-sr">{{ copy.ratingText(current.rating.toFixed(1), fullNumber.format(current.reviews)) }}, {{ copy.installsShort(fullNumber.format(current.installs)) }}</span>
              <TxTag :label="copy.sample" size="sm" variant="plain" />
            </div>

            <div class="store-detail__actions">
              <TemplateStoreAction :view="actionOf(current)" @press="onAction(current)" @cancel="cancelDownload(current)" />
              <TxDropdownMenu v-if="stateOf(current).version && stateOf(current).phase === 'idle'" placement="bottom-end" :min-width="200" @open="rememberMenuTrigger">
                <template #trigger>
                  <TxIconButton icon="i-carbon-overflow-menu-horizontal" size="sm" :label="copy.more(L(current.name))" />
                </template>
                <TxDropdownItem @select="fromMenu(() => setEnabled(current, !stateOf(current).enabled))">
                  <span class="store-menu-row">
                    <span :class="stateOf(current).enabled ? 'i-carbon-pause' : 'i-carbon-play'" aria-hidden="true" />
                    {{ stateOf(current).enabled ? copy.menu.disable : copy.menu.enable }}
                  </span>
                </TxDropdownItem>
                <TxDropdownItem danger @select="fromMenu(() => openConfirm('uninstall', current))">
                  <span class="store-menu-row"><span class="i-carbon-trash-can" aria-hidden="true" />{{ copy.menu.uninstall }}</span>
                </TxDropdownItem>
                <TxDropdownItem @select="fromMenu(() => copyPluginId(current))">
                  <span class="store-menu-row"><span class="i-carbon-copy" aria-hidden="true" />{{ copy.menu.copyId }}</span>
                </TxDropdownItem>
              </TxDropdownMenu>
            </div>

            <TxTabs
              v-model="detailTab"
              class="store-detail__tabs"
              placement="top"
              borderless
              :content-padding="0"
              :content-scrollable="false"
              indicator-variant="pill"
              :animation="tabsAnimation"
            >
              <TxTabItem name="overview">
                <template #name>
                  {{ copy.detail.tabs.overview }}
                </template>
                <div class="store-pane">
                  <div class="store-block">
                    <h4 class="store-block__title">
                      {{ copy.detail.screenshots }}
                    </h4>
                    <TxImageGallery
                      class="store-shots"
                      :items="shotsOf(current)"
                      :preview-title="copy.detail.gallery.title"
                      :previous-label="copy.detail.gallery.prev"
                      :next-label="copy.detail.gallery.next"
                      :previous-text="copy.detail.gallery.prev"
                      :next-text="copy.detail.gallery.next"
                      :item-label-formatter="copy.detail.gallery.item"
                      :open-label-formatter="copy.detail.gallery.open"
                    />
                  </div>
                  <div class="store-block">
                    <h4 class="store-block__title">
                      {{ copy.detail.features }}
                    </h4>
                    <ul class="store-features">
                      <li v-for="item in current.features" :key="item.name.en" class="store-feature">
                        <span class="store-feature__name">{{ L(item.name) }}</span>
                        <span class="store-feature__triggers">
                          <TxKbd v-for="trigger in item.triggers.slice(0, 4)" :key="trigger">{{ trigger }}</TxKbd>
                        </span>
                      </li>
                    </ul>
                    <p class="store-block__hint">
                      {{ copy.detail.triggerHint }}
                    </p>
                  </div>
                  <dl class="store-facts">
                    <div>
                      <dt>{{ copy.detail.facts.id }}</dt>
                      <dd><code>{{ current.id }}</code></dd>
                    </div>
                    <div>
                      <dt>{{ copy.detail.facts.version }}</dt>
                      <dd>v{{ current.version }} · {{ current.channel }}</dd>
                    </div>
                    <div>
                      <dt>{{ copy.detail.facts.size }}</dt>
                      <dd>{{ current.size.toFixed(1) }} MB</dd>
                    </div>
                    <div>
                      <dt>{{ copy.detail.facts.updated }}</dt>
                      <dd>{{ daysAgo(current.days) }}</dd>
                    </div>
                  </dl>
                </div>
              </TxTabItem>

              <TxTabItem name="permissions">
                <template #name>
                  {{ copy.detail.tabs.permissions }}
                  <span class="store-tab-count">{{ current.required.length + current.optional.length }}</span>
                </template>
                <div class="store-pane">
                  <p class="store-block__hint">
                    {{ copy.detail.permissionsIntro }}
                  </p>
                  <TemplateStorePermissions :rows="[...permissionRows(current.required, true), ...permissionRows(current.optional, false)]" />
                </div>
              </TxTabItem>

              <TxTabItem name="versions">
                <template #name>
                  {{ copy.detail.tabs.versions }}
                  <span class="store-tab-count">{{ releasesOf(current).length }}</span>
                </template>
                <div class="store-pane">
                  <TxTimeline class="store-versions">
                    <TxTimelineItem
                      v-for="(release, index) in releasesOf(current)"
                      :key="release.version"
                      :title="`v${release.version}`"
                      :time="daysAgo(release.days)"
                      :color="index === 0 ? 'primary' : 'default'"
                      :active="index === 0"
                    >
                      <span class="store-release">
                        <TxTag :label="release.channel" size="sm" variant="outline" :color="CHANNEL_COLOR[release.channel]" />
                        <TxTag v-if="stateOf(current).version === release.version" :label="copy.detail.installedTag" size="sm" variant="soft" />
                        <span>{{ L(release.note) }}</span>
                      </span>
                    </TxTimelineItem>
                  </TxTimeline>
                  <p class="store-block__hint">
                    {{ copy.detail.versionsNote }}
                  </p>
                </div>
              </TxTabItem>

              <TxTabItem name="reviews">
                <template #name>
                  {{ copy.detail.tabs.reviews }}
                  <span class="store-tab-count">{{ compactNumber.format(current.reviews) }}</span>
                </template>
                <div class="store-pane">
                  <div class="store-reviews__summary">
                    <div class="store-reviews__score">
                      <strong aria-hidden="true">{{ current.rating.toFixed(1) }}</strong>
                      <span class="store-card__stars" aria-hidden="true">
                        <TxRating :model-value="displayRating(current.rating)" readonly :size="14" :gap="1" :precision="0.5" />
                      </span>
                      <span class="store-reviews__count">{{ copy.detail.reviewCount(fullNumber.format(current.reviews)) }}</span>
                      <span class="store-sr">{{ copy.ratingText(current.rating.toFixed(1), fullNumber.format(current.reviews)) }}</span>
                    </div>
                    <ul class="store-dist" :aria-label="copy.detail.distribution">
                      <li v-for="(percent, index) in distribution(current.rating)" :key="index" class="store-dist__row">
                        <span class="store-dist__label" aria-hidden="true">{{ 5 - index }}<span class="i-carbon-star-filled" /></span>
                        <TxProgressBar :percentage="percent" height="6px" :aria-label="copy.detail.distributionRow(5 - index, percent)" />
                        <span class="store-dist__value" aria-hidden="true">{{ percent }}%</span>
                      </li>
                    </ul>
                  </div>

                  <ul class="store-review-list">
                    <li v-for="review in reviewsOf(current)" :key="review.key" class="store-review">
                      <TxAvatar
                        :name="L(REVIEWERS[review.author].name)"
                        :size="28"
                        :background-color="reviewerColors(review.author).bg"
                        :text-color="reviewerColors(review.author).ink"
                      />
                      <div class="store-review__main">
                        <div class="store-review__head">
                          <strong>{{ L(REVIEWERS[review.author].name) }}</strong>
                          <span class="store-card__stars" aria-hidden="true">
                            <TxRating :model-value="review.stars" readonly :size="11" :gap="1" />
                          </span>
                          <span class="store-sr">{{ copy.detail.starLabel(review.stars) }}</span>
                          <span class="store-review__time">{{ reviewTime(review) }}</span>
                          <TxTag v-if="review.pending" :label="copy.detail.pending" size="sm" variant="soft" color="var(--tx-color-warning)" />
                        </div>
                        <p class="store-review__body">
                          {{ review.body }}
                        </p>
                        <button
                          v-if="!review.pending"
                          type="button"
                          class="store-review__helpful"
                          :class="{ 'is-on': helpfulVotes[review.key] }"
                          :aria-pressed="helpfulVotes[review.key] ? 'true' : 'false'"
                          :aria-label="copy.detail.helpfulLabel(helpfulCount(review))"
                          @click="toggleHelpful(review)"
                        >
                          <span :class="helpfulVotes[review.key] ? 'i-carbon-thumbs-up-filled' : 'i-carbon-thumbs-up'" aria-hidden="true" />
                          {{ copy.detail.helpful(helpfulCount(review)) }}
                        </button>
                      </div>
                    </li>
                  </ul>
                  <p class="store-block__hint">
                    {{ copy.detail.reviewsNote }}
                  </p>

                  <div class="store-review-form">
                    <h4 class="store-block__title">
                      {{ copy.detail.writeTitle }}
                    </h4>
                    <div class="store-review-form__rating">
                      <span class="store-review-form__label">{{ copy.detail.ratingLabel }}</span>
                      <TxRating v-model="draft.stars" :size="20" :star-label="copy.detail.starLabel" />
                    </div>
                    <TxTextarea v-model="draft.body" :rows="3" :max-length="500" show-count resize="none" :placeholder="copy.detail.placeholder" />
                    <div class="store-review-form__foot">
                      <span class="store-block__hint">{{ copy.detail.submitHint }}</span>
                      <TxButton size="sm" variant="primary" icon="i-carbon-send-alt" @click="submitReview(current)">
                        {{ copy.detail.submit }}
                      </TxButton>
                    </div>
                    <p v-if="draft.error" class="store-review-form__error" role="alert">
                      {{ draft.error }}
                    </p>
                  </div>
                </div>
              </TxTabItem>
            </TxTabs>
          </div>
        </section>

        <!-- The panel keeps its box while closed (TxToastPanel fades rather
             than unmounts), so it is inert until it opens. Pointer or focus
             on it holds it open; otherwise it closes by itself. -->
        <div
          class="store__toast"
          :class="{ 'is-open': toast.open }"
          :inert="toast.open ? undefined : true"
          @mouseenter="holdToast('hover')"
          @mouseleave="releaseToast('hover')"
          @focusin="holdToast('focus')"
          @focusout="onToastFocusOut"
        >
          <TxToastPanel :open="toast.open" :tether="false" :stack="0" :aria-label="copy.toast.label">
            <div class="store-toast" :class="{ 'is-danger': toast.danger }">
              <span class="store-toast__icon" :class="toast.icon" aria-hidden="true" />
              <span class="store-toast__text">{{ toast.text }}</span>
              <TxButton v-if="toast.action" size="sm" variant="secondary" @click="runToastAction">
                {{ toast.action.label }}
              </TxButton>
              <button type="button" class="store-toast__close" :aria-label="copy.toast.dismiss" @click="closeToast">
                <span class="i-carbon-close" aria-hidden="true" />
              </button>
            </div>
          </TxToastPanel>
        </div>

        <TxModal v-model="confirm.open" :title="confirmTitle" width="min(520px, calc(100vw - 32px))" @close="onConfirmDismiss">
          <div v-if="confirmPlugin" class="store-confirm">
            <div class="store-confirm__plugin">
              <span class="store-glyph is-sm" :style="glyphStyle(confirmPlugin)" aria-hidden="true"><span :class="confirmPlugin.icon" /></span>
              <div class="store-confirm__plugin-text">
                <strong>{{ L(confirmPlugin.name) }}</strong>
                <span>v{{ confirmPlugin.version }} · {{ authorName(confirmPlugin) }} · {{ confirmPlugin.id }}</span>
              </div>
            </div>

            <template v-if="confirm.kind === 'permission'">
              <!-- Not TxAlert: role="alert" would be announced a second time
                   over the dialog's own name. -->
              <p v-if="!isOfficial(confirmPlugin)" class="store-confirm__warn">
                <span class="i-carbon-warning-alt" aria-hidden="true" />
                {{ copy.modal.unofficial(L(confirmPlugin.name)) }}
              </p>
              <p class="store-confirm__lead">
                {{ copy.modal.permissionLead(L(confirmPlugin.name)) }}
              </p>
              <TemplateStorePermissions :rows="confirmRequiredRows" compact />
              <p v-if="confirmOptionalNames" class="store-confirm__note">
                {{ copy.modal.optionalNote(confirmOptionalNames) }}
              </p>
              <p class="store-confirm__lead">
                {{ copy.modal.chooseHow }}
              </p>
            </template>

            <template v-else-if="confirm.kind === 'update'">
              <p class="store-confirm__lead">
                {{ copy.modal.updateLead(L(confirmPlugin.name), stateOf(confirmPlugin).version ?? '', confirmPlugin.version) }}
              </p>
              <p class="store-confirm__lead">
                {{ copy.modal.updateWill }}
              </p>
              <ul class="store-confirm__points">
                <li v-for="point in copy.modal.updatePoints" :key="point">
                  {{ point }}
                </li>
              </ul>
              <template v-if="confirmAddedRows.length">
                <h4 class="store-confirm__subhead">
                  {{ copy.modal.newPermissions }}
                </h4>
                <TemplateStorePermissions :rows="confirmAddedRows" compact />
              </template>
            </template>

            <p v-else class="store-confirm__lead">
              {{ copy.modal.uninstallLead(L(confirmPlugin.name)) }}
            </p>
          </div>

          <template #footer>
            <div class="store-confirm__actions">
              <template v-if="confirm.kind === 'permission'">
                <TxButton size="sm" variant="ghost" @click="rejectInstall">
                  {{ copy.modal.reject }}
                </TxButton>
                <TxButton size="sm" variant="secondary" @click="grantAndInstall('session')">
                  {{ copy.modal.allowSession }}
                </TxButton>
                <TxButton size="sm" variant="primary" icon="i-carbon-checkmark" @click="grantAndInstall('always')">
                  {{ copy.modal.allowAlways }}
                </TxButton>
              </template>
              <template v-else-if="confirm.kind === 'update'">
                <TxButton size="sm" variant="ghost" @click="closeConfirm(); settleFocus()">
                  {{ copy.modal.cancel }}
                </TxButton>
                <TxButton size="sm" variant="primary" icon="i-carbon-upgrade" @click="confirmUpdate">
                  {{ copy.modal.startUpdate }}
                </TxButton>
              </template>
              <template v-else>
                <TxButton size="sm" variant="ghost" @click="closeConfirm(); settleFocus()">
                  {{ copy.modal.cancel }}
                </TxButton>
                <TxButton size="sm" variant="danger" icon="i-carbon-trash-can" @click="confirmUninstall">
                  {{ copy.modal.uninstall }}
                </TxButton>
              </template>
            </div>
          </template>
        </TxModal>
      </div>
    </template>
  </TemplateFrame>
</template>

<style scoped>
.store {
  --store-line: var(--tx-border-color-lighter, #ebeef5);
  --store-panel: color-mix(in srgb, var(--tx-bg-color-page, #f2f3f5) 45%, var(--tx-bg-color, #fff));

  position: relative;
  display: grid;
  height: 100%;
  box-sizing: border-box;
  grid-template-areas:
    'head'
    'filters'
    'main';
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto minmax(0, 1fr);
  background: var(--tx-bg-color, #fff);
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
}

.store-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  border: 0;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

/* Header ---------------------------------------------------------------- */

.store__head {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  padding: 12px 16px 8px;
  grid-area: head;
}

.store__brand {
  display: flex;
  min-width: 0;
  flex: none;
  align-items: center;
  gap: 10px;
}

.store__logo {
  display: inline-flex;
  width: 32px;
  height: 32px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: var(--tx-color-primary-light-9, #ecf5ff);
  color: color-mix(in srgb, var(--tx-color-primary, #409eff) 60%, var(--tx-text-color-primary, #303133));
  font-size: 16px;
}

.store__brand-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.store__title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}

.store__subtitle {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  white-space: nowrap;
}

.store__views {
  flex: none;
  margin: 0;
}

.store__search {
  width: min(280px, 42%);
  min-width: 180px;
  margin-left: auto;
}

.store__filters {
  min-width: 0;
  padding: 0 16px 2px;
  grid-area: filters;
}

.store__side {
  --tx-bui-sidebar-nav-width: 100%;

  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow-y: auto;
  border-radius: 0;
  background: var(--tx-bg-color, #fff);
  box-shadow: inset -1px 0 0 var(--store-line);
  grid-area: side;
}

/* Browse ---------------------------------------------------------------- */

.store-browse,
.store-installed {
  min-width: 0;
  min-height: 0;
  padding: 6px 16px 18px;
  overflow-y: auto;
  grid-area: main;
  outline: none;
}

.store-browse__note {
  margin: 18px 0 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  line-height: 1.55;
}

/* Carousel: the art is image content and always dark, so the carousel is a
   dark-theme scope (`data-theme="dark"` in the template). `--store-on-art`
   is declared on that element, so it resolves to the dark ink. */
.store-carousel {
  --store-on-art: var(--tx-text-color-primary, #e5eaf3);

  position: relative;
  height: 176px;
  overflow: hidden;
  border-radius: 16px;
  background: #0b1020;
  color: var(--store-on-art);
  color-scheme: dark;
  isolation: isolate;
}

.store-carousel__track {
  position: absolute;
  inset: 0;
}

/* Stacked slides only fade: a transform would make each one a containing
   block for anything fixed inside it. */
.store-slide {
  position: absolute;
  inset: 0;
  opacity: 0;
  transition: opacity 0.45s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.store-slide.is-current {
  z-index: 1;
  opacity: 1;
}

.store-slide__art {
  position: absolute;
  width: 100%;
  height: 100%;
  object-fit: cover;
  inset: 0;
}

.store-slide__body {
  position: relative;
  display: grid;
  height: 100%;
  box-sizing: border-box;
  align-content: center;
  gap: 12px 14px;
  grid-template-areas:
    'glyph text'
    '. actions';
  grid-template-columns: auto minmax(0, 1fr);
  padding: 18px 132px 18px 22px;
}

.store-slide__body > .store-glyph {
  grid-area: glyph;
}

.store-slide__text {
  display: flex;
  min-width: 0;
  max-width: 460px;
  flex-direction: column;
  gap: 3px;
  grid-area: text;
}

.store-slide__eyebrow {
  font-size: 12px;
  opacity: 0.82;
}

.store-slide__name {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
}

.store-slide__headline {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.92;
}

.store-slide__actions {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  grid-area: actions;
}

.store-slide__actions .store-action.is-progress {
  max-width: 220px;
}

.store-slide__more {
  display: inline-flex;
  height: 26px;
  align-items: center;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: color-mix(in srgb, var(--store-on-art) 16%, transparent);
  color: var(--store-on-art);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.store-slide__more:hover {
  background: color-mix(in srgb, var(--store-on-art) 26%, transparent);
}

.store-slide__more:focus-visible,
.store-carousel__button:focus-visible,
.store-carousel__dot:focus-visible {
  outline: 2px solid var(--store-on-art);
  outline-offset: 1px;
}

.store-carousel__controls {
  position: absolute;
  z-index: 2;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: color-mix(in srgb, #000 32%, transparent);
}

.store-carousel__button {
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--store-on-art);
  cursor: pointer;
  font-size: 14px;
}

.store-carousel__button:hover {
  background: color-mix(in srgb, var(--store-on-art) 18%, transparent);
}

.store-carousel__dots {
  position: absolute;
  z-index: 2;
  right: 12px;
  bottom: 10px;
  display: flex;
  gap: 2px;
}

/* A 22px hit area around a small dot. */
.store-carousel__dot {
  display: inline-flex;
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  cursor: pointer;
}

.store-carousel__dot::before {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--store-on-art) 45%, transparent);
  content: '';
  transition: width 0.2s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.store-carousel__dot.is-current::before {
  width: 16px;
  background: var(--store-on-art);
}

/* Plugin glyph: a tile in the category's art colours with a white mark. */
.store-glyph {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, var(--store-glyph-from), var(--store-glyph-to));
  box-shadow: inset 0 0 0 1px color-mix(in srgb, #fff 16%, transparent);
  color: #fff;
}

.store-glyph.is-sm {
  width: 36px;
  height: 36px;
  border-radius: 11px;
  font-size: 18px;
}

.store-glyph.is-md {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  font-size: 26px;
}

.store-glyph.is-lg {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  font-size: 30px;
}

.store-glyph__badge {
  display: inline-flex;
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--tx-bg-color, #fff);
  box-shadow: 0 0 0 2px var(--tx-bg-color, #fff);
  color: var(--tx-color-primary, #409eff);
  font-size: 16px;
}

/* Updates banner --------------------------------------------------------- */

.store-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 12px;
  padding: 7px 8px 7px 10px;
  border-radius: 12px;
  background: var(--tx-color-primary-light-9, #ecf5ff);
}

.store-banner__link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: color-mix(in srgb, var(--tx-color-primary, #409eff) 50%, var(--tx-text-color-primary, #303133));
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
}

.store-banner__link:hover {
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 12%, transparent);
}

.store-banner__link:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

/* Grid ------------------------------------------------------------------- */

.store-section {
  margin-top: 16px;
}

.store-section__head {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.store-section__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

.store-section__count {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.store-section__sort {
  margin-left: auto;
}

.store-grid {
  display: grid;
  margin: 0;
  padding: 0;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(214px, 1fr));
  list-style: none;
}

.store-grid__cell {
  display: flex;
  min-width: 0;
}

.store-card {
  height: 100%;
}

.store-card :deep(.tx-card__body) {
  display: grid;
  flex: 1;
  align-content: start;
  gap: 8px 10px;
  grid-template-areas:
    'icon heading heading'
    'summary summary summary'
    'stats stats stats'
    'tags tags action';
  grid-template-columns: 40px minmax(0, 1fr) auto;
  grid-template-rows: auto auto auto minmax(0, 1fr);
}

.store-card__icon {
  display: flex;
  grid-area: icon;
}

.store-card__glyph {
  font-size: 19px;
}

.store-card__heading {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  grid-area: heading;
}

.store-card__open {
  display: block;
  max-width: 100%;
  padding: 0;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: var(--tx-text-color-primary, #303133);
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The stretched target: the whole card opens the details. */
.store-card__open::after {
  position: absolute;
  border-radius: var(--tx-card-radius, 14px);
  content: '';
  inset: calc(-1 * var(--tx-card-padding, 10px));
}

.store-card__open:focus-visible {
  outline: none;
}

.store-card__open:focus-visible::after {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: -1px;
}

.store-card__author {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.store-card__badge {
  flex: none;
  color: var(--tx-color-primary, #409eff);
  font-size: 13px;
}

.store-card__summary {
  display: -webkit-box;
  min-height: calc(1.55em * 2);
  margin: 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
  grid-area: summary;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  line-height: 1.55;
}

.store-card__stats {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  grid-area: stats;
  white-space: nowrap;
}

.store-card__stars {
  display: inline-flex;
  flex: none;

  --tx-rating-star-filled: var(--tx-bui-orange, #ef720c);
}

.store-card__tags {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  align-self: end;
  gap: 4px;
  grid-area: tags;
}

.store-card__action {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  align-self: end;
  justify-content: flex-end;
  grid-area: action;
}

.store-empty-icon {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 28px;
}

/* Installed -------------------------------------------------------------- */

.store-installed__head {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin: 6px 0 12px;
}

.store-installed__heading {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
  margin-right: auto;
}

.store-installed__summary {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.store-rows {
  display: flex;
  margin: 0;
  padding: 0;
  flex-direction: column;
  gap: 6px;
  list-style: none;
}

.store-row {
  --tx-card-item-padding: 8px 10px;

  border-color: var(--store-line);
}

.store-row.is-off :deep(.tx-bui-icon-chip) {
  opacity: 0.5;
}

.store-row__glyph {
  font-size: 17px;
}

.store-row__name {
  max-width: 100%;
  padding: 0;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: var(--tx-text-color-primary, #303133);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.store-row__name:hover {
  text-decoration: underline;
}

.store-row__name:focus-visible {
  border-radius: 4px;
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 2px;
}

.store-row__tools {
  display: flex;
  align-items: center;
  gap: 8px;
}

.store-row__action {
  min-width: 96px;
  max-width: 160px;
}

.store-menu-row {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* Details ---------------------------------------------------------------- */

.store-detail {
  --store-detail-bg: var(--tx-bg-color, #fff);

  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  background: var(--store-detail-bg);
  grid-area: main;
  outline: none;
}

.store-detail.is-panel {
  --store-detail-bg: var(--store-panel);

  box-shadow: inset 1px 0 0 var(--store-line);
  grid-area: detail;
}

.store-detail__bar {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 0 12px 6px;
  border-bottom: 1px solid var(--store-line);
}

.store-detail__crumb {
  min-width: 0;
  overflow: hidden;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.store-detail__scroll {
  min-height: 0;
  flex: 1;
  padding: 14px 16px 22px;
  overflow-y: auto;
}

.store-detail__head {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 14px;
}

.store-detail__identity {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.store-detail__name {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
}

.store-detail__byline {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.store-detail__source {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px 1px 6px;
  border-radius: 999px;
  background: var(--tx-color-primary-light-9, #ecf5ff);
  color: color-mix(in srgb, var(--tx-color-primary, #409eff) 50%, var(--tx-text-color-primary, #303133));
  font-weight: 500;
}

.store-detail__source.is-community {
  background: var(--tx-color-warning-light-9, #fdf6ec);
  color: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 45%, var(--tx-text-color-primary, #303133));
}

.store-detail__source:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 2px;
}

.store-detail__summary {
  margin: 12px 0 0;
  color: var(--tx-text-color-regular, #606266);
  font-size: 13px;
  line-height: 1.6;
}

.store-detail__stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  margin-top: 8px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.store-detail__actions {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 12px;
}

.store-detail__actions .store-action.is-progress {
  max-width: 320px;
}

.store-detail__tabs {
  margin-top: 14px;
}

.store-detail__tabs :deep(.tx-tabs__nav-inner) {
  padding: 4px 0;
}

.store-tab-count {
  margin-left: 4px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.store-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 12px;
}

.store-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.store-block__title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.store-block__hint {
  margin: 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  line-height: 1.55;
}

.store-shots :deep(.tx-image-gallery__grid) {
  gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
}

.store-shots :deep(.tx-image-gallery__thumb) {
  border-radius: 10px;
  aspect-ratio: 16 / 10;
}

.store-features {
  display: flex;
  margin: 0;
  padding: 0;
  flex-direction: column;
  gap: 6px;
  list-style: none;
}

.store-feature {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  padding: 7px 10px;
  border-radius: 10px;
  background: var(--tx-fill-color-light, #f5f7fa);
}

.store-feature__name {
  min-width: 7em;
  font-weight: 500;
}

.store-feature__triggers {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.store-facts {
  display: grid;
  margin: 0;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.store-facts div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  border-radius: 10px;
  box-shadow: inset 0 0 0 1px var(--store-line);
}

.store-facts dt {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.store-facts dd {
  margin: 0;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.store-facts code {
  font-family: var(--tx-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 11px;
}

/* The dot's ring is hard-coded white in the component; here it has to be
   the pane it sits on, or dark mode shows a white halo round every release. */
.store-versions :deep(.tx-timeline-item__dot) {
  border-color: var(--store-detail-bg);
}

.store-versions :deep(.tx-timeline-item--vertical) {
  padding-bottom: 16px;
}

.store-versions :deep(.tx-timeline-item__title) {
  font-family: var(--tx-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  font-weight: 600;
}

.store-versions :deep(.tx-timeline-item__time) {
  font-size: 12px;
}

.store-release {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
  line-height: 1.5;
}

/* Reviews */
.store-reviews__summary {
  display: grid;
  align-items: center;
  gap: 16px;
  grid-template-columns: auto minmax(0, 1fr);
  padding: 12px;
  border-radius: 12px;
  box-shadow: inset 0 0 0 1px var(--store-line);
}

.store-reviews__score {
  display: flex;
  min-width: 88px;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.store-reviews__score strong {
  font-size: 28px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1;
}

.store-reviews__count {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.store-dist {
  display: flex;
  margin: 0;
  padding: 0;
  flex-direction: column;
  gap: 4px;
  list-style: none;
}

.store-dist__row {
  display: grid;
  align-items: center;
  gap: 8px;
  grid-template-columns: 24px minmax(0, 1fr) 34px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.store-dist__label {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.store-dist__label span {
  color: var(--tx-bui-orange, #ef720c);
  font-size: 10px;
}

.store-dist__value {
  text-align: right;
}

.store-review-list {
  display: flex;
  margin: 0;
  padding: 0;
  flex-direction: column;
  list-style: none;
}

.store-review {
  display: flex;
  gap: 10px;
  padding: 12px 0;
  border-bottom: 1px solid var(--store-line);
}

.store-review__main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.store-review__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  font-size: 12px;
}

.store-review__head strong {
  font-size: 13px;
  font-weight: 600;
}

.store-review__time {
  color: var(--tx-text-color-secondary, #909399);
}

.store-review__body {
  margin: 0;
  color: var(--tx-text-color-regular, #606266);
  font-size: 13px;
  line-height: 1.6;
}

.store-review__helpful {
  display: inline-flex;
  align-items: center;
  align-self: flex-start;
  gap: 4px;
  padding: 3px 8px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--tx-text-color-regular, #606266);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

.store-review__helpful:hover {
  background: var(--tx-fill-color-light, #f5f7fa);
}

.store-review__helpful.is-on {
  background: var(--tx-color-primary-light-9, #ecf5ff);
  color: color-mix(in srgb, var(--tx-color-primary, #409eff) 50%, var(--tx-text-color-primary, #303133));
}

.store-review__helpful:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

.store-review-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: var(--tx-fill-color-lighter, #fafafa);
  box-shadow: inset 0 0 0 1px var(--store-line);
}

.store-review-form__rating {
  display: flex;
  align-items: center;
  gap: 10px;

  --tx-rating-star-filled: var(--tx-bui-orange, #ef720c);
  --tx-rating-star-hover: var(--tx-bui-orange, #ef720c);
}

.store-review-form__label {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-weight: 500;
}

.store-review-form__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.store-review-form__error {
  margin: 0;
  color: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 55%, var(--tx-text-color-primary, #303133));
  font-size: 12px;
}

/* Toast ------------------------------------------------------------------ */

.store__toast {
  position: absolute;
  z-index: 6;
  bottom: 14px;
  left: 50%;
  width: min(400px, calc(100% - 28px));
  pointer-events: none;
  translate: -50% 0;
}

.store__toast.is-open {
  pointer-events: auto;
}

.store-toast {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.store-toast__icon {
  flex: none;
  color: var(--tx-color-success, #67c23a);
  font-size: 15px;
}

.store-toast.is-danger .store-toast__icon {
  color: var(--tx-color-danger, #f56c6c);
}

.store-toast__text {
  min-width: 0;
  flex: 1;
  line-height: 1.45;
}

.store-toast__close {
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

.store-toast__close:hover {
  background: var(--tx-fill-color-light, #f5f7fa);
}

.store-toast__close:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

/* Confirmations (teleported: only --tx-* tokens reach them) -------------- */

.store-confirm {
  display: flex;
  max-height: min(60vh, 460px);
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
}

.store-confirm__plugin {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 12px;
  background: var(--tx-fill-color-light, #f5f7fa);
}

.store-confirm__plugin-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.store-confirm__plugin-text strong {
  font-size: 14px;
  font-weight: 600;
}

.store-confirm__plugin-text span {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.store-confirm__warn {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--tx-color-warning-light-9, #fdf6ec);
  color: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 45%, var(--tx-text-color-primary, #303133));
  line-height: 1.5;
}

.store-confirm__warn span {
  flex: none;
  margin-top: 3px;
}

.store-confirm__lead {
  margin: 0;
  line-height: 1.6;
}

.store-confirm__note {
  margin: 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  line-height: 1.55;
}

.store-confirm__points {
  margin: 0;
  padding-left: 18px;
  color: var(--tx-text-color-regular, #606266);
  line-height: 1.7;
}

.store-confirm__subhead {
  margin: 4px 0 0;
  font-size: 13px;
  font-weight: 600;
}

.store-confirm__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

/* Narrow: under 640px ------------------------------------------------------ */

@container template (max-width: 639px) {
  .store__head {
    flex-wrap: wrap;
    gap: 8px 10px;
    padding: 10px 12px 6px;
  }

  .store__subtitle {
    display: none;
  }

  .store__views {
    margin-left: auto;
  }

  .store__search {
    width: 100%;
    min-width: 0;
    margin-left: 0;
    order: 3;
  }

  .store__filters {
    padding: 0 12px 2px;
  }

  .store-browse,
  .store-installed {
    padding: 4px 12px 14px;
  }

  .store-carousel {
    height: 148px;
  }

  .store-slide__body {
    gap: 10px 12px;
    padding: 14px 16px 36px;
  }

  .store-slide__body > .store-glyph {
    width: 44px;
    height: 44px;
    border-radius: 13px;
    font-size: 21px;
  }

  .store-slide__headline {
    display: none;
  }

  /* Clear of the pause / previous / next pill in the top-right corner. */
  .store-slide__text {
    padding-right: 84px;
  }

  .store-slide__name {
    font-size: 16px;
  }

  .store-grid {
    gap: 8px;
    grid-template-columns: minmax(0, 1fr);
  }

  .store-card :deep(.tx-card__body) {
    align-items: center;
    gap: 2px 12px;
    grid-template-areas:
      'icon heading action'
      'icon stats action';
    grid-template-rows: auto auto;
  }

  .store-card__summary,
  .store-card__tags {
    display: none;
  }

  .store-card__action {
    align-self: center;
  }

  .store-section__sort {
    margin-left: 0;
  }

  .store-detail__bar {
    padding: 0 8px 6px;
  }

  .store-detail__scroll {
    padding: 12px 12px 20px;
  }

  .store-glyph.is-lg {
    width: 52px;
    height: 52px;
    border-radius: 15px;
    font-size: 25px;
  }

  .store-reviews__summary {
    grid-template-columns: minmax(0, 1fr);
  }

  .store-facts {
    grid-template-columns: minmax(0, 1fr);
  }

  .store-row__action {
    min-width: 0;
    max-width: 120px;
  }
}

/* Expanded: 960px and up -------------------------------------------------- */

@container template (min-width: 960px) {
  .store {
    grid-template-areas:
      'head head head'
      'side main detail';
    grid-template-columns: 208px minmax(0, 1fr) 360px;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .store__head {
    padding: 12px 20px;
    border-bottom: 1px solid var(--store-line);
  }

  .store__search {
    width: 360px;
  }

  .store-browse,
  .store-installed {
    padding: 16px 20px 22px;
  }

  .store-carousel {
    height: 208px;
  }

  .store-slide__body {
    padding: 22px 140px 22px 28px;
  }

  .store-slide__name {
    font-size: 20px;
  }

  .store-detail__scroll {
    padding: 16px 18px 24px;
  }
}

@container template (min-width: 1200px) {
  .store {
    grid-template-columns: 224px minmax(0, 1fr) 400px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .store-slide,
  .store-carousel__dot::before {
    transition: none;
  }
}
</style>
