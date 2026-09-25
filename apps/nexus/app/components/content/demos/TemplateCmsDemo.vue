<script setup lang="ts">
// CMS template: the content workbench behind the Nexus docs and blog.
//
// The table is host-driven on purpose. TxDataTable sorts only the rows it is
// handed and its select-all covers the rows on screen, so this host sorts the
// whole filtered set before slicing a page (`sort-on-client` off) and drops
// the selection whenever the page or the filter changes. Filter, search, sort
// and paging go through a simulated 350 ms fetch so the skeleton is part of
// the template; edits land immediately and can be undone from the toast.
import type { DataTableColumn, DataTableKey, DataTableSortState } from '@talex-touch/tuffex/data-table'
import type { FilterChipItem, FilterChipValue } from '@talex-touch/tuffex/filter-chips'
import type { FormRule } from '@talex-touch/tuffex/form'
import type { TxSelectOption } from '@talex-touch/tuffex/select'
import type { StatusTone } from '@talex-touch/tuffex/status-badge'
import { useDeferredLoading } from '@talex-touch/tuffex/skeleton'
import { hasNavigator } from '@talex-touch/utils/env'
import { computed, defineComponent, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

type Section = 'release' | 'guide' | 'plugin' | 'engineering' | 'community'
type Status = 'draft' | 'review' | 'scheduled' | 'published' | 'archived'
type ArticleLang = 'zh' | 'en' | 'both'
type AuthorId = 'lq' | 'mo' | 'ks' | 'ac' | 'nh'
type Mode = 'narrow' | 'column' | 'wide'
type StatusFilter = 'all' | Status

interface Bi { zh: string, en: string }

interface Article {
  id: string
  slug: string
  title: Bi
  summary: Bi
  body: Bi
  section: Section
  status: Status
  authorId: AuthorId
  tags: string[]
  lang: ArticleLang
  updatedAt: number
  publishAt: number | null
  views: number
  pinned: boolean
  comments: boolean
}

interface SkeletonRow {
  id: string
  skeleton: true
}

type TableRow = Article | SkeletonRow

interface Query {
  status: StatusFilter
  search: string
  sort: DataTableSortState | null
  page: number
}

interface EditorDraft {
  id: string
  isNew: boolean
  title: string
  slug: string
  section: string
  status: string
  tags: string[]
  publishDate: string
  lang: string
  pinned: boolean
  comments: boolean
  summary: string
  body: string
}

// Scoped-slot values never reach <script setup>. This relays the stage's
// measured size into refs, so the column set and page size can follow it.
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

/* ─── Mock data ───────────────────────────────────────────────────────── */

// A fixed "now" keeps every relative time and sort order reproducible.
const NOW = Date.UTC(2026, 8, 23, 2, 0)
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const FETCH_MS = 350
const DEFAULT_SORT: DataTableSortState = { key: 'updatedAt', order: 'desc' }

const AUTHORS: Record<AuthorId, { name: Bi, hue: string }> = {
  lq: { name: { zh: '林乔', en: 'Lin Qiao' }, hue: 'var(--tx-chart-categorical-1, #4290f0)' },
  mo: { name: { zh: 'Mara Okafor', en: 'Mara Okafor' }, hue: 'var(--tx-chart-categorical-6, #d37536)' },
  ks: { name: { zh: '佐藤健二', en: 'Kenji Sato' }, hue: 'var(--tx-chart-categorical-5, #50c3b6)' },
  ac: { name: { zh: 'Ava Chen', en: 'Ava Chen' }, hue: 'var(--tx-chart-categorical-3, #e8649d)' },
  nh: { name: { zh: 'Noor Haddad', en: 'Noor Haddad' }, hue: 'var(--tx-chart-categorical-4, #8d58ee)' },
}

const SECTION_META: Record<Section, { label: Bi, hint: Bi, color: string, icon: string }> = {
  release: { label: { zh: '发布说明', en: 'Release notes' }, hint: { zh: '版本更新与变更日志', en: 'Versions and changelogs' }, color: 'var(--tx-chart-categorical-1, #4290f0)', icon: 'i-carbon-rocket' },
  guide: { label: { zh: '指南', en: 'Guides' }, hint: { zh: '上手教程与参考', en: 'Tutorials and reference' }, color: 'var(--tx-chart-categorical-5, #50c3b6)', icon: 'i-carbon-book' },
  plugin: { label: { zh: '插件聚光灯', en: 'Spotlight' }, hint: { zh: '推荐插件与作者访谈', en: 'Featured plugins and authors' }, color: 'var(--tx-chart-categorical-4, #8d58ee)', icon: 'i-carbon-plug' },
  engineering: { label: { zh: '工程博客', en: 'Engineering' }, hint: { zh: '架构、性能与隐私', en: 'Architecture, speed, privacy' }, color: 'var(--tx-chart-categorical-6, #d37536)', icon: 'i-carbon-code' },
  community: { label: { zh: '社区', en: 'Community' }, hint: { zh: '周报、活动与征集', en: 'Digests, events, contests' }, color: 'var(--tx-chart-categorical-3, #e8649d)', icon: 'i-carbon-user-multiple' },
}

const STATUS_ORDER: Status[] = ['draft', 'review', 'scheduled', 'published', 'archived']

// `icon` is passed explicitly rather than left to the badge: the glyph names
// have to appear in this file for UnoCSS to generate them.
const STATUS_META: Record<Status, { label: Bi, tone: StatusTone, icon: string, dot: string }> = {
  draft: { label: { zh: '草稿', en: 'Draft' }, tone: 'muted', icon: 'i-carbon-edit', dot: 'var(--tx-bui-ink-3, #9a9da3)' },
  review: { label: { zh: '审核中', en: 'In review' }, tone: 'warning', icon: 'i-carbon-time', dot: 'var(--tx-bui-orange, #ef720c)' },
  scheduled: { label: { zh: '已排期', en: 'Scheduled' }, tone: 'info', icon: 'i-carbon-calendar', dot: 'var(--tx-bui-accent, #0285ff)' },
  published: { label: { zh: '已发布', en: 'Published' }, tone: 'success', icon: 'i-carbon-checkmark', dot: 'var(--tx-bui-green, #189a4d)' },
  archived: { label: { zh: '已归档', en: 'Archived' }, tone: 'muted', icon: '', dot: 'var(--tx-bui-line-strong, #e0e2e5)' },
}

const LANG_LABEL: Record<ArticleLang, Bi> = {
  zh: { zh: '中文', en: 'Chinese' },
  en: { zh: '英文', en: 'English' },
  both: { zh: '双语', en: 'Bilingual' },
}

const SECTION_OUTLINE: Record<Section, Bi> = {
  release: {
    zh: '## 本次更新\n\n- **CoreBox**：结果列表与预览同一帧出现\n- **剪贴板**：时间线视图，可按来源筛选\n- **插件市场**：增量更新，下载体积更小\n\n## 升级方式\n\n在「设置 → 关于」中检查更新即可，已安装的插件会自动迁移。',
    en: '## What changed\n\n- **CoreBox**: results and preview land in the same frame\n- **Clipboard**: a timeline view with source filters\n- **Plugin store**: delta updates and smaller downloads\n\n## Upgrading\n\nCheck for updates under Settings → About; installed plugins migrate on their own.',
  },
  guide: {
    zh: '## 开始之前\n\n1. 安装 Tuff 2.4 或更新版本\n2. 在「设置 → 开发者」中打开插件开发模式\n3. 准备好 `manifest.json`\n\n```json\n{ "id": "com.example.rates", "sdkapi": 260713 }\n```',
    en: '## Before you start\n\n1. Install Tuff 2.4 or later\n2. Turn on plugin development under Settings → Developer\n3. Have a `manifest.json` ready\n\n```json\n{ "id": "com.example.rates", "sdkapi": 260713 }\n```',
  },
  plugin: {
    zh: '## 为什么推荐\n\n- 键盘直达，不打断手头的工作\n- 只申请必需的几项权限\n- 作者持续维护，更新及时\n\n> 在 CoreBox 输入插件名即可安装。',
    en: '## Why we like it\n\n- Keyboard-first, never breaks your flow\n- Asks only for the permissions it needs\n- Actively maintained by its author\n\n> Type its name in CoreBox to install it.',
  },
  engineering: {
    zh: '## 背景\n\n问题最早出现在用户反馈里：偶发的卡顿很难复现。我们先补齐埋点，再逐段排除。\n\n## 做法\n\n- 把耗时操作移出主线程\n- 用一个队列串行化写入\n- 每一步都有可观测的指标',
    en: '## Background\n\nIt started with reports of hitches nobody could reproduce. We added instrumentation first, then ruled things out one step at a time.\n\n## Approach\n\n- Move slow work off the main thread\n- Serialise writes through one queue\n- Give every step a metric',
  },
  community: {
    zh: '## 本期内容\n\n- 新插件与值得关注的更新\n- 社区作品与主题\n- 下期活动预告\n\n欢迎在 Nexus 社区投稿。',
    en: '## In this issue\n\n- New plugins and notable updates\n- Community work and themes\n- What is coming up next\n\nSubmissions are welcome on the Nexus community board.',
  },
}

interface Seed {
  slug: string
  title: Bi
  summary: Bi
  section: Section
  status: Status
  author: AuthorId
  tags: string[]
  lang: ArticleLang
  updated: number
  publish?: number
  views?: number
  pinned?: boolean
  body?: Bi
}

const SEEDS: Seed[] = [
  {
    slug: 'tuff-2-4-release-notes',
    title: { zh: 'Tuff 2.4 发布说明：CoreBox 秒开与剪贴板时间线', en: 'Tuff 2.4 release notes: instant CoreBox and a clipboard timeline' },
    summary: { zh: 'CoreBox 冷启动明显提速，剪贴板历史改为时间线视图，插件市场支持增量更新。', en: 'CoreBox opens noticeably faster from cold, clipboard history becomes a timeline, and the plugin store ships delta updates.' },
    section: 'release',
    status: 'published',
    author: 'lq',
    tags: ['release', 'corebox', 'clipboard'],
    lang: 'both',
    updated: 2 * HOUR,
    publish: -2 * HOUR,
    views: 18240,
    pinned: true,
  },
  {
    slug: 'currency-plugin-in-50-lines',
    title: { zh: '用 50 行 Prelude 写一个汇率插件', en: 'Build a currency plugin in 50 lines of Prelude' },
    summary: { zh: '从 manifest.json 到 pushItems：一个能在 CoreBox 里直接换算汇率的最小插件。', en: 'From manifest.json to pushItems: the smallest plugin that converts currencies right inside CoreBox.' },
    section: 'guide',
    status: 'review',
    author: 'mo',
    tags: ['prelude', 'sdk', 'tutorial'],
    lang: 'both',
    updated: 26 * HOUR,
    body: {
      zh: '这篇教程带你写一个最小可用的插件：在 CoreBox 输入 `100 usd`，直接得到换算结果。\n\n## 1. 声明能力\n\n```json\n{\n  "id": "com.example.rates",\n  "features": [{ "id": "convert", "commands": [{ "type": "over", "value": ["usd", "汇率"] }] }]\n}\n```\n\n## 2. 推送结果\n\n在 Prelude 里监听查询，用 `pushItems()` 返回一行结果。汇率数据缓存在插件存储里，离线也能用。',
      en: 'This tutorial builds the smallest useful plugin: type `100 usd` in CoreBox and get the conversion back.\n\n## 1. Declare the capability\n\n```json\n{\n  "id": "com.example.rates",\n  "features": [{ "id": "convert", "commands": [{ "type": "over", "value": ["usd", "rate"] }] }]\n}\n```\n\n## 2. Push a result\n\nListen for the query in the Prelude and return one row with `pushItems()`. Rates are cached in plugin storage, so it works offline.',
    },
  },
  {
    slug: 'spotlight-workspace-scripts',
    title: { zh: '插件聚光灯：Workspace Scripts', en: 'Plugin spotlight: Workspace Scripts' },
    summary: { zh: '把 package.json 里的脚本变成 CoreBox 命令，一键在正确的目录里运行。', en: 'Turns the scripts in package.json into CoreBox commands that run in the right folder.' },
    section: 'plugin',
    status: 'published',
    author: 'ks',
    tags: ['plugins', 'developer'],
    lang: 'both',
    updated: 3 * DAY,
    publish: -3 * DAY,
    views: 6420,
  },
  {
    slug: 'search-main-thread-budget',
    title: { zh: '我们如何把搜索主线程阻塞压到 16ms 以下', en: 'Keeping search under a 16 ms main-thread budget' },
    summary: { zh: '把剪贴板读取与索引写入移出主线程之后，从按键到出结果的每一帧都不再掉帧。', en: 'Moving clipboard reads and index writes off the main thread kept every keystroke-to-result frame on budget.' },
    section: 'engineering',
    status: 'published',
    author: 'ks',
    tags: ['performance', 'corebox'],
    lang: 'both',
    updated: 5 * DAY,
    publish: -5 * DAY,
    views: 9312,
  },
  {
    slug: 'bring-your-own-key',
    title: { zh: '自带密钥：接入你自己的 AI Provider', en: 'Bring your own key: custom AI providers' },
    summary: { zh: '在设置里添加 Provider，密钥只存本机钥匙串，按场景选择模型。', en: 'Add a provider in settings, keep the key in the local keychain, and pick a model per scene.' },
    section: 'guide',
    status: 'scheduled',
    author: 'ac',
    tags: ['ai', 'privacy'],
    lang: 'both',
    updated: 6 * HOUR,
    publish: 2 * DAY,
  },
  {
    slug: 'migrating-from-alfred-raycast',
    title: { zh: '从 Alfred / Raycast 迁移', en: 'Migrating from Alfred or Raycast' },
    summary: { zh: '快捷键、代码片段与常用工作流怎么对应到 Tuff，附一张对照表。', en: 'How hotkeys, snippets and everyday workflows map onto Tuff, with a side-by-side table.' },
    section: 'guide',
    status: 'published',
    author: 'nh',
    tags: ['migration', 'corebox'],
    lang: 'both',
    updated: 9 * DAY,
    publish: -12 * DAY,
    views: 12870,
  },
  {
    slug: 'changelog-sdkapi-260713',
    title: { zh: 'sdkapi 260713 变更日志', en: 'Changelog: sdkapi 260713' },
    summary: { zh: '新增 TuffQuery.inputs、acceptedInputTypes 与权限声明字段，旧插件无需改动。', en: 'Adds TuffQuery.inputs, acceptedInputTypes and permission fields; existing plugins keep working.' },
    section: 'release',
    status: 'published',
    author: 'lq',
    tags: ['sdk', 'changelog'],
    lang: 'en',
    updated: 14 * DAY,
    publish: -14 * DAY,
    views: 4105,
  },
  {
    slug: 'plugin-review-guidelines-2026',
    title: { zh: 'Nexus 插件审核标准（2026 版）', en: 'Nexus plugin review guidelines (2026)' },
    summary: { zh: '权限最小化、存储配额与签名要求——提交前逐条自查。', en: 'Least privilege, storage quotas and signing — a checklist to run before you submit.' },
    section: 'guide',
    status: 'review',
    author: 'nh',
    tags: ['plugins', 'review'],
    lang: 'both',
    updated: 20 * HOUR,
  },
  {
    slug: 'native-ocr',
    title: { zh: '原生 OCR：Apple Vision 与 Windows OCR', en: 'Native OCR with Apple Vision and Windows OCR' },
    summary: { zh: '截图文字识别默认走系统引擎，离线可用；识别不佳时才回退到 AI Provider。', en: 'Screenshot text recognition runs on the system engine and works offline; it only falls back to an AI provider when needed.' },
    section: 'engineering',
    status: 'draft',
    author: 'ks',
    tags: ['ocr', 'macos', 'windows'],
    lang: 'zh',
    updated: 40 * MINUTE,
  },
  {
    slug: 'shortcut-cheat-sheet',
    title: { zh: '快捷键速查表', en: 'Keyboard shortcut cheat sheet' },
    summary: { zh: 'CoreBox、剪贴板与窗口管理的全部默认快捷键，一页打印版。', en: 'Every default shortcut for CoreBox, the clipboard and window management on one printable page.' },
    section: 'guide',
    status: 'published',
    author: 'mo',
    tags: ['shortcuts', 'corebox'],
    lang: 'both',
    updated: 30 * DAY,
    publish: -40 * DAY,
    views: 22410,
  },
  {
    slug: 'plugin-storage-quota',
    title: { zh: '插件存储的 100MB 配额怎么算', en: 'How the 100 MB plugin storage quota is counted' },
    summary: { zh: '配置、文件与密钥分别计入哪里，超出配额时插件会看到什么。', en: 'What counts towards config, files and secrets, and what a plugin sees when it runs out.' },
    section: 'engineering',
    status: 'draft',
    author: 'lq',
    tags: ['plugins', 'storage'],
    lang: 'both',
    updated: 3 * HOUR,
  },
  {
    slug: 'community-digest-38',
    title: { zh: '社区周报 #38', en: 'Community digest #38' },
    summary: { zh: '本周新增 12 个插件，CoreBox 主题征集进入投票阶段。', en: 'Twelve new plugins this week, and the CoreBox theme contest moves to voting.' },
    section: 'community',
    status: 'published',
    author: 'ac',
    tags: ['community', 'digest'],
    lang: 'both',
    updated: 28 * HOUR,
    publish: -28 * HOUR,
    views: 3380,
  },
  {
    slug: 'clipboard-stays-on-device',
    title: { zh: '隐私说明：剪贴板数据只留在本机', en: 'Privacy note: clipboard data stays on device' },
    summary: { zh: '历史记录、图片与 OCR 结果只存在本地数据库，同步需要你手动开启。', en: 'History, images and OCR results live in the local database only; sync is opt-in.' },
    section: 'engineering',
    status: 'published',
    author: 'lq',
    tags: ['privacy', 'clipboard'],
    lang: 'both',
    updated: 18 * DAY,
    publish: -60 * DAY,
    views: 15120,
    pinned: true,
  },
  {
    slug: 'window-materials',
    title: { zh: 'Mica 与 Vibrancy：窗口材质', en: 'Window materials: Mica and Vibrancy' },
    summary: { zh: '同一套界面在 Windows 与 macOS 上如何取得一致的透明质感。', en: 'How one interface gets a consistent translucent feel on Windows and macOS.' },
    section: 'engineering',
    status: 'scheduled',
    author: 'ac',
    tags: ['design', 'windows', 'macos'],
    lang: 'both',
    updated: 30 * HOUR,
    publish: 5 * DAY,
  },
  {
    slug: 'tuff-2-3-release-notes',
    title: { zh: 'Tuff 2.3 发布说明', en: 'Tuff 2.3 release notes' },
    summary: { zh: '多屏幕定位、插件热重载与新的设置中心。', en: 'Multi-monitor placement, plugin hot reload and a new settings hub.' },
    section: 'release',
    status: 'archived',
    author: 'lq',
    tags: ['release'],
    lang: 'both',
    updated: 70 * DAY,
    publish: -90 * DAY,
    views: 30550,
  },
  {
    slug: 'spotlight-touch-translate',
    title: { zh: '插件聚光灯：touch-translate', en: 'Plugin spotlight: touch-translate' },
    summary: { zh: '选中文字按下快捷键即可翻译，支持离线词典与多个 Provider。', en: 'Select text, press a shortcut, get a translation — with an offline dictionary and several providers.' },
    section: 'plugin',
    status: 'scheduled',
    author: 'mo',
    tags: ['plugins', 'translate'],
    lang: 'both',
    updated: 10 * HOUR,
    publish: DAY,
  },
  {
    slug: 'spotlight-quick-actions',
    title: { zh: '插件聚光灯：Quick Actions', en: 'Plugin spotlight: Quick Actions' },
    summary: { zh: '把常用系统操作收进 CoreBox：锁屏、清空废纸篓、切换深色模式。', en: 'Everyday system actions inside CoreBox: lock the screen, empty the trash, toggle dark mode.' },
    section: 'plugin',
    status: 'draft',
    author: 'ks',
    tags: ['plugins', 'system'],
    lang: 'zh',
    updated: 2 * DAY,
  },
  {
    slug: 'prelude-and-surface',
    title: { zh: 'Prelude 与 Surface：插件的两层结构', en: 'Prelude and Surface: the two layers of a plugin' },
    summary: { zh: '轻量入口负责注册能力，重界面按需加载——为什么插件要这样拆。', en: 'A light entry registers capabilities and the heavy UI loads on demand — why plugins are split this way.' },
    section: 'guide',
    status: 'published',
    author: 'mo',
    tags: ['prelude', 'surface', 'sdk'],
    lang: 'both',
    updated: 22 * DAY,
    publish: -25 * DAY,
    views: 7730,
  },
  {
    slug: 'keyboard-first-corebox',
    title: { zh: '键盘优先：CoreBox 的交互原则', en: 'Keyboard first: how CoreBox is designed' },
    summary: { zh: '从唤起到执行都不离开键盘，鼠标只是补充。', en: 'From summon to action without leaving the keyboard; the mouse is a fallback.' },
    section: 'engineering',
    status: 'review',
    author: 'ac',
    tags: ['design', 'corebox'],
    lang: 'en',
    updated: 4 * HOUR,
  },
  {
    slug: 'community-digest-37',
    title: { zh: '社区周报 #37', en: 'Community digest #37' },
    summary: { zh: '新的剪贴板插件、两场线上分享与一次插件作者访谈。', en: 'A new clipboard plugin, two online talks and an interview with a plugin author.' },
    section: 'community',
    status: 'published',
    author: 'ac',
    tags: ['community', 'digest'],
    lang: 'both',
    updated: 8 * DAY,
    publish: -8 * DAY,
    views: 2960,
  },
  {
    slug: 'theme-contest-results',
    title: { zh: 'CoreBox 主题征集结果', en: 'CoreBox theme contest results' },
    summary: { zh: '九套入围主题与评审点评，前三名将内置到下个版本。', en: 'Nine shortlisted themes with notes from the judges; the top three ship in the next release.' },
    section: 'community',
    status: 'scheduled',
    author: 'nh',
    tags: ['community', 'themes'],
    lang: 'both',
    updated: 2 * DAY,
    publish: 7 * DAY,
  },
  {
    slug: 'how-ai-quota-works',
    title: { zh: 'AI 额度怎么计算', en: 'How AI quota is counted' },
    summary: { zh: '请求数与 token 分开计量，本地模型不占用额度。', en: 'Requests and tokens are metered separately, and local models do not count.' },
    section: 'guide',
    status: 'draft',
    author: 'nh',
    tags: ['ai', 'account'],
    lang: 'both',
    updated: 5 * DAY,
  },
  {
    slug: 'join-the-2-4-beta',
    title: { zh: '2.4 Beta 公开测试招募', en: 'Join the 2.4 public beta' },
    summary: { zh: '抢先体验剪贴板时间线，并帮我们找出最后的问题。', en: 'Try the clipboard timeline early and help us find the last bugs.' },
    section: 'release',
    status: 'archived',
    author: 'lq',
    tags: ['release', 'beta'],
    lang: 'both',
    updated: 35 * DAY,
    publish: -45 * DAY,
    views: 11280,
  },
  {
    slug: 'one-writer-local-database',
    title: { zh: '单写入者：本地数据库的一次重构', en: 'One writer: reworking the local database' },
    summary: { zh: '两个进程同时写入会损坏数据库，我们把所有写入收拢到一个队列。', en: 'Two processes writing at once can corrupt the database, so every write now goes through one queue.' },
    section: 'engineering',
    status: 'draft',
    author: 'ks',
    tags: ['database', 'reliability'],
    lang: 'en',
    updated: 70 * MINUTE,
  },
  {
    slug: 'plugin-permission-model',
    title: { zh: '插件权限模型详解', en: 'Inside the plugin permission model' },
    summary: { zh: '权限在安装时声明、运行时授予，随时可以在设置里撤销。', en: 'Permissions are declared at install, granted at runtime and revocable in settings at any time.' },
    section: 'guide',
    status: 'published',
    author: 'nh',
    tags: ['plugins', 'permissions', 'security'],
    lang: 'both',
    updated: 11 * DAY,
    publish: -16 * DAY,
    views: 8840,
  },
  {
    slug: 'shanghai-meetup-recap',
    title: { zh: '上海开发者见面会回顾', en: 'Shanghai developer meetup recap' },
    summary: { zh: '三场分享的幻灯片与录像，以及现场收集到的 40 条反馈。', en: 'Slides and recordings from three talks, plus forty pieces of feedback from the room.' },
    section: 'community',
    status: 'published',
    author: 'mo',
    tags: ['community', 'events'],
    lang: 'zh',
    updated: 15 * DAY,
    publish: -15 * DAY,
    views: 1920,
  },
]

function seedArticles(): Article[] {
  return SEEDS.map((seed, index) => ({
    id: `post-${String(index + 1).padStart(2, '0')}`,
    slug: seed.slug,
    title: { ...seed.title },
    summary: { ...seed.summary },
    body: seed.body
      ? { ...seed.body }
      : {
          zh: `${seed.summary.zh}\n\n${SECTION_OUTLINE[seed.section].zh}`,
          en: `${seed.summary.en}\n\n${SECTION_OUTLINE[seed.section].en}`,
        },
    section: seed.section,
    status: seed.status,
    authorId: seed.author,
    tags: [...seed.tags],
    lang: seed.lang,
    updatedAt: NOW - seed.updated,
    publishAt: seed.publish === undefined ? null : NOW + seed.publish,
    views: seed.views ?? 0,
    pinned: Boolean(seed.pinned),
    comments: seed.section !== 'release',
  }))
}

function cloneArticles(list: Article[]): Article[] {
  return list.map(article => ({
    ...article,
    title: { ...article.title },
    summary: { ...article.summary },
    body: { ...article.body },
    tags: [...article.tags],
  }))
}

/* ─── Copy ────────────────────────────────────────────────────────────── */

const copy = computed(() => zh.value
  ? {
      frameTitle: 'CMS 内容管理',
      heading: '内容工作台',
      site: 'tuff.tagzxia.com',
      posts: (n: number) => `${n} 篇`,
      inReview: (n: number) => `${n} 篇待审核`,
      weekViews: (v: string) => `累计浏览 ${v}`,
      searchPlaceholder: '搜索标题或 slug',
      searchLabel: '搜索文章',
      newPost: '新建',
      newPostLabel: '新建文章',
      filtersLabel: '按状态筛选',
      all: '全部',
      columns: { title: '标题', section: '栏目', status: '状态', author: '作者', lang: '语言', views: '浏览', updated: '更新', actions: '操作' },
      pinned: '已置顶',
      rowMenu: (title: string) => `《${title}》的更多操作`,
      menu: { edit: '编辑', duplicate: '复制为草稿', publish: '发布', unpublish: '撤回为草稿', archive: '归档', remove: '删除' },
      selected: (n: number) => `已选 ${n} 篇`,
      bulk: { publish: '发布', archive: '归档', remove: '删除', clear: '取消选择' },
      summary: (total: number, page: number, pages: number) => `共 ${total} 篇 · 第 ${page}/${pages} 页`,
      pagination: { aria: '文章分页', first: '第一页', prev: '上一页', next: '下一页', last: '最后一页' },
      emptyTitle: '没有匹配的文章',
      emptyDesc: '换个关键词，或者清除筛选条件。',
      clearFilters: '清除筛选',
      inspectorLabel: '文章详情',
      noSelection: '选择一篇文章',
      noSelectionDesc: '单击表格中的一行，在这里查看摘要与正文预览。',
      meta: { author: '作者', updated: '更新', publish: '发布', views: '浏览', unscheduled: '未排期' },
      preview: '正文预览',
      edit: '编辑',
      copyLink: '复制链接',
      hostOpens: (href: string) => `宿主会打开 ${href}`,
      toastLabel: '操作结果',
      undo: '撤销',
      dismiss: '关闭提示',
      undone: '已撤销',
      linkCopied: '链接已复制',
      saved: (title: string) => `已保存《${title}》`,
      created: (title: string) => `已创建《${title}》`,
      published: (n: number) => n > 1 ? `已发布 ${n} 篇` : '已发布',
      unpublished: '已撤回为草稿',
      archived: (n: number) => n > 1 ? `已归档 ${n} 篇` : '已归档',
      removed: (n: number) => n > 1 ? `已删除 ${n} 篇` : '已删除 1 篇',
      duplicated: '已复制为草稿',
      copySuffix: '（副本）',
      untitled: '未命名文章',
      editorEdit: '编辑文章',
      editorNew: '新建文章',
      cancel: '取消',
      save: '保存',
      saveAs: { draft: '保存为草稿', review: '提交审核', publish: '立即发布' },
      form: {
        title: '标题',
        titlePlaceholder: '一句话说清这篇文章',
        slug: '链接',
        section: '栏目',
        status: '状态',
        tags: '标签',
        tagsPlaceholder: '回车添加，最多 5 个',
        publishAt: '发布时间',
        publishPlaceholder: '选择日期',
        publishTitle: '选择发布时间',
        lang: '语言',
        pinned: '置顶',
        comments: '允许评论',
        summary: '摘要',
        summaryPlaceholder: '会显示在列表与分享卡片上',
        body: '正文（Markdown）',
        titleRequired: '请填写标题',
        slugRequired: '请填写链接',
        slugPattern: '只能包含小写字母、数字和连字符',
        slugTaken: '这个链接已被其他文章使用',
        summaryLength: '摘要最多 160 字',
      },
    }
  : {
      frameTitle: 'CMS',
      heading: 'Content workbench',
      site: 'tuff.tagzxia.com',
      posts: (n: number) => `${n} posts`,
      inReview: (n: number) => `${n} in review`,
      weekViews: (v: string) => `${v} total views`,
      searchPlaceholder: 'Search title or slug',
      searchLabel: 'Search posts',
      newPost: 'New',
      newPostLabel: 'New post',
      filtersLabel: 'Filter by status',
      all: 'All',
      columns: { title: 'Title', section: 'Section', status: 'Status', author: 'Author', lang: 'Language', views: 'Views', updated: 'Updated', actions: 'Actions' },
      pinned: 'Pinned',
      rowMenu: (title: string) => `More actions for “${title}”`,
      menu: { edit: 'Edit', duplicate: 'Duplicate as draft', publish: 'Publish', unpublish: 'Revert to draft', archive: 'Archive', remove: 'Delete' },
      selected: (n: number) => `${n} selected`,
      bulk: { publish: 'Publish', archive: 'Archive', remove: 'Delete', clear: 'Clear selection' },
      summary: (total: number, page: number, pages: number) => `${total} posts · page ${page} of ${pages}`,
      pagination: { aria: 'Post pages', first: 'First page', prev: 'Previous page', next: 'Next page', last: 'Last page' },
      emptyTitle: 'No matching posts',
      emptyDesc: 'Try another keyword, or clear the filters.',
      clearFilters: 'Clear filters',
      inspectorLabel: 'Post details',
      noSelection: 'Pick a post',
      noSelectionDesc: 'Click a row in the table to see its summary and a preview here.',
      meta: { author: 'Author', updated: 'Updated', publish: 'Publishes', views: 'Views', unscheduled: 'Not scheduled' },
      preview: 'Preview',
      edit: 'Edit',
      copyLink: 'Copy link',
      hostOpens: (href: string) => `The host would open ${href}`,
      toastLabel: 'Result',
      undo: 'Undo',
      dismiss: 'Dismiss',
      undone: 'Undone',
      linkCopied: 'Link copied',
      saved: (title: string) => `Saved “${title}”`,
      created: (title: string) => `Created “${title}”`,
      published: (n: number) => n > 1 ? `Published ${n} posts` : 'Published',
      unpublished: 'Reverted to draft',
      archived: (n: number) => n > 1 ? `Archived ${n} posts` : 'Archived',
      removed: (n: number) => n > 1 ? `Deleted ${n} posts` : 'Deleted 1 post',
      duplicated: 'Duplicated as a draft',
      copySuffix: ' (copy)',
      untitled: 'Untitled post',
      editorEdit: 'Edit post',
      editorNew: 'New post',
      cancel: 'Cancel',
      save: 'Save',
      saveAs: { draft: 'Save as draft', review: 'Submit for review', publish: 'Publish now' },
      form: {
        title: 'Title',
        titlePlaceholder: 'Say what this post is about',
        slug: 'Link',
        section: 'Section',
        status: 'Status',
        tags: 'Tags',
        tagsPlaceholder: 'Press Enter to add, up to 5',
        publishAt: 'Publish date',
        publishPlaceholder: 'Pick a date',
        publishTitle: 'Pick a publish date',
        lang: 'Language',
        pinned: 'Pin to top',
        comments: 'Allow comments',
        summary: 'Summary',
        summaryPlaceholder: 'Shown in lists and on share cards',
        body: 'Body (Markdown)',
        titleRequired: 'A title is required',
        slugRequired: 'A link is required',
        slugPattern: 'Lowercase letters, digits and hyphens only',
        slugTaken: 'Another post already uses this link',
        summaryLength: 'Keep the summary under 160 characters',
      },
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

const pageSize = computed(() => ({ narrow: 6, column: 8, wide: 12 })[mode.value])

/* ─── State ───────────────────────────────────────────────────────────── */

const articles = ref<Article[]>(seedArticles())
const pending = reactive<Query>({ status: 'all', search: '', sort: { ...DEFAULT_SORT }, page: 1 })
const committed = ref<Query>({ ...pending })
const loading = ref(false)
const showSkeleton = useDeferredLoading(loading, { delay: 120, minDuration: 320 })
const selectedKeys = ref<DataTableKey[]>([])
const focusedId = ref<string | null>('post-01')

let fetchTimer: ReturnType<typeof setTimeout> | undefined

function commit(): void {
  const previous = committed.value
  if (previous.page !== pending.page || previous.status !== pending.status || previous.search !== pending.search)
    selectedKeys.value = []
  committed.value = { ...pending, sort: pending.sort ? { ...pending.sort } : null }
}

// What a real backend call would be: the controls update at once, the table
// catches up after the response.
function request(patch: Partial<Query>): void {
  Object.assign(pending, patch)
  loading.value = true
  clearTimeout(fetchTimer)
  fetchTimer = setTimeout(() => {
    fetchTimer = undefined
    commit()
    loading.value = false
  }, FETCH_MS)
}

function commitNow(patch: Partial<Query> = {}): void {
  Object.assign(pending, patch)
  clearTimeout(fetchTimer)
  fetchTimer = undefined
  loading.value = false
  commit()
}

function onStatusChange(value: FilterChipValue): void {
  request({ status: value as StatusFilter, page: 1 })
}

function onSearch(value: string): void {
  request({ search: value, page: 1 })
}

function onSort(value: DataTableSortState | null): void {
  request({ sort: value })
}

function onPage(page: number): void {
  if (page !== pending.page)
    request({ page })
}

// Keep the first visible post in view when the page size changes with the
// stage, instead of jumping back to page one.
watch(pageSize, (next, previous) => {
  const firstIndex = (pending.page - 1) * previous
  commitNow({ page: Math.floor(firstIndex / next) + 1 })
})

const collator = computed(() => new Intl.Collator(zh.value ? 'zh-CN' : 'en'))

function matches(article: Article, query: Query): boolean {
  if (query.status !== 'all' && article.status !== query.status)
    return false
  const needle = query.search.trim().toLowerCase()
  if (!needle)
    return true
  return L(article.title).toLowerCase().includes(needle) || article.slug.includes(needle)
}

function compare(a: Article, b: Article, sort: DataTableSortState | null): number {
  if (!sort || !sort.order)
    return b.updatedAt - a.updatedAt
  const direction = sort.order === 'desc' ? -1 : 1
  if (sort.key === 'title')
    return direction * collator.value.compare(L(a.title), L(b.title))
  if (sort.key === 'views')
    return direction * (a.views - b.views)
  return direction * (a.updatedAt - b.updatedAt)
}

// The whole filtered set is sorted before a page is cut from it.
const resultRows = computed(() => {
  const query = committed.value
  return articles.value
    .filter(article => matches(article, query))
    .sort((a, b) => compare(a, b, query.sort))
})

const pageCount = computed(() => Math.max(1, Math.ceil(resultRows.value.length / pageSize.value)))
const shownPage = computed(() => Math.min(committed.value.page, pageCount.value))

const pageRows = computed(() => {
  const start = (shownPage.value - 1) * pageSize.value
  return resultRows.value.slice(start, start + pageSize.value)
})

// Placeholder rows travel through the real table, so the header, the column
// widths and the row height are the loaded layout's own.
const tableRows = computed<TableRow[]>(() => {
  if (!showSkeleton.value)
    return pageRows.value
  const count = Math.max(3, pageRows.value.length || pageSize.value)
  return Array.from({ length: count }, (_, index) => ({ id: `skeleton-${index}`, skeleton: true as const }))
})

function isSkeleton(row: TableRow): row is SkeletonRow {
  return 'skeleton' in row
}

function asArticle(row: unknown): Article {
  return row as Article
}

const byId = computed(() => new Map(articles.value.map(article => [article.id, article])))
const focused = computed(() => (focusedId.value ? byId.value.get(focusedId.value) ?? null : null))

/* ─── Derived labels ──────────────────────────────────────────────────── */

const statusItems = computed<FilterChipItem[]>(() => [
  { value: 'all', label: copy.value.all, count: articles.value.length },
  ...STATUS_ORDER.map(status => ({
    value: status,
    label: L(STATUS_META[status].label),
    dot: STATUS_META[status].dot,
    // Counted from the same array the table reads, so a mutation cannot leave
    // a chip lying about how many posts it will show.
    count: articles.value.filter(article => article.status === status).length,
  })),
])

const numberFormat = computed(() => new Intl.NumberFormat(zh.value ? 'zh-CN' : 'en', { notation: 'compact', maximumFractionDigits: 1 }))
// `short` keeps "40 min. ago" inside a 104px column; the long English form does not fit.
const relativeFormat = computed(() => new Intl.RelativeTimeFormat(zh.value ? 'zh-CN' : 'en', { numeric: 'auto', style: 'short' }))
const dateFormat = computed(() => new Intl.DateTimeFormat(zh.value ? 'zh-CN' : 'en', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Shanghai' }))

const headline = computed(() => {
  const total = articles.value.length
  const review = articles.value.filter(article => article.status === 'review').length
  const views = articles.value.filter(article => article.status === 'published').reduce((sum, article) => sum + article.views, 0)
  return [copy.value.site, copy.value.posts(total), copy.value.inReview(review), copy.value.weekViews(numberFormat.value.format(views))]
})

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
  return relativeFormat.value.format(Math.round(days / 30), 'month')
}

function authorName(id: AuthorId): string {
  return L(AUTHORS[id].name)
}

function avatarColors(id: AuthorId): { bg: string, ink: string } {
  const hue = AUTHORS[id].hue
  return {
    bg: `color-mix(in srgb, ${hue} 20%, var(--tx-bg-color, #fff))`,
    ink: `color-mix(in srgb, ${hue} 78%, var(--tx-text-color-primary, #303133))`,
  }
}

function postHref(article: Article): string {
  return `https://tuff.tagzxia.com/blog/${article.slug}`
}

const columns = computed<DataTableColumn[]>(() => {
  const c = copy.value.columns
  if (mode.value === 'narrow') {
    return [
      { key: 'title', title: c.title, sortable: true },
      { key: 'actions', title: c.actions, width: 48, align: 'right' },
    ]
  }
  const wide = mode.value === 'wide'
  return [
    { key: 'title', title: c.title, sortable: true },
    ...(wide ? [{ key: 'section', title: c.section, width: 128 }] : []),
    // English status labels run longer in the badge's mono face.
    { key: 'status', title: c.status, width: zh.value ? 108 : 128 },
    { key: 'author', title: c.author, width: wide ? 150 : 136 },
    ...(wide
      ? [
          { key: 'lang', title: c.lang, width: 92 },
          { key: 'views', title: c.views, width: 88, align: 'right' as const, sortable: true },
        ]
      : []),
    { key: 'updatedAt', title: c.updated, width: 104, sortable: true },
    { key: 'actions', title: c.actions, width: 52, align: 'right' },
  ]
})

function rowClass(row: TableRow) {
  return {
    'is-skeleton': isSkeleton(row),
    'is-focused': mode.value === 'wide' && !isSkeleton(row) && row.id === focusedId.value,
  }
}

/* ─── Toast + undo ────────────────────────────────────────────────────── */

const toast = reactive({ open: false, text: '', icon: 'i-carbon-checkmark-outline', undoable: false })
let toastTimer: ReturnType<typeof setTimeout> | undefined
let undoSnapshot: Article[] | null = null

function notify(text: string, icon: string, snapshot: Article[] | null = null): void {
  undoSnapshot = snapshot
  toast.text = text
  toast.icon = icon
  toast.undoable = Boolean(snapshot)
  toast.open = true
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.open = false
    undoSnapshot = null
  }, snapshot ? 5200 : 2600)
}

function closeToast(): void {
  clearTimeout(toastTimer)
  toast.open = false
  undoSnapshot = null
}

function undo(): void {
  if (!undoSnapshot)
    return
  articles.value = undoSnapshot
  if (focusedId.value && !byId.value.has(focusedId.value))
    focusedId.value = articles.value[0]?.id ?? null
  notify(copy.value.undone, 'i-carbon-undo')
}

function mutate(change: (list: Article[]) => void): Article[] {
  const snapshot = cloneArticles(articles.value)
  const next = cloneArticles(articles.value)
  change(next)
  articles.value = next
  return snapshot
}

/* ─── Row actions ─────────────────────────────────────────────────────── */

let lastClick: { id: string, at: number } | null = null

function onRowClick(payload: { row: unknown }): void {
  const row = payload.row as TableRow
  if (isSkeleton(row))
    return
  if (mode.value !== 'wide') {
    openEditor(row)
    return
  }
  // TxDataTable reports clicks only, so a second click on the same row within
  // the double-click window opens the editor.
  const now = Date.now()
  if (lastClick && lastClick.id === row.id && now - lastClick.at < 400) {
    lastClick = null
    openEditor(row)
    return
  }
  lastClick = { id: row.id, at: now }
  focusedId.value = row.id
}

function duplicate(article: Article): void {
  const id = `post-${Date.now().toString(36)}`
  const snapshot = mutate((list) => {
    const index = list.findIndex(item => item.id === article.id)
    list.splice(index + 1, 0, {
      ...cloneArticles([article])[0]!,
      id,
      slug: `${article.slug}-copy`,
      title: { zh: `${article.title.zh}（副本）`, en: `${article.title.en} (copy)` },
      status: 'draft',
      views: 0,
      pinned: false,
      publishAt: null,
      updatedAt: NOW,
    })
  })
  focusedId.value = id
  notify(copy.value.duplicated, 'i-carbon-copy', snapshot)
}

function togglePublish(article: Article): void {
  const publish = article.status !== 'published'
  const snapshot = mutate((list) => {
    const target = list.find(item => item.id === article.id)
    if (!target)
      return
    target.status = publish ? 'published' : 'draft'
    target.updatedAt = NOW
    if (publish && target.publishAt === null)
      target.publishAt = NOW
  })
  notify(publish ? copy.value.published(1) : copy.value.unpublished, publish ? 'i-carbon-send-alt' : 'i-carbon-edit', snapshot)
}

function setStatus(ids: DataTableKey[], status: Status): Article[] {
  const wanted = new Set(ids)
  return mutate((list) => {
    for (const item of list) {
      if (!wanted.has(item.id))
        continue
      item.status = status
      item.updatedAt = NOW
      if (status === 'published' && item.publishAt === null)
        item.publishAt = NOW
    }
  })
}

function remove(ids: DataTableKey[]): Article[] {
  const doomed = new Set(ids)
  const snapshot = mutate((list) => {
    for (let index = list.length - 1; index >= 0; index -= 1) {
      if (doomed.has(list[index]!.id))
        list.splice(index, 1)
    }
  })
  if (focusedId.value && doomed.has(focusedId.value))
    focusedId.value = pageRows.value[0]?.id ?? articles.value[0]?.id ?? null
  return snapshot
}

function onMenu(article: Article, action: 'edit' | 'duplicate' | 'publish' | 'archive' | 'remove'): void {
  if (action === 'edit')
    return openEditor(article)
  if (action === 'duplicate')
    return duplicate(article)
  if (action === 'publish')
    return togglePublish(article)
  if (action === 'archive')
    return notify(copy.value.archived(1), 'i-carbon-archive', setStatus([article.id], 'archived'))
  notify(copy.value.removed(1), 'i-carbon-trash-can', remove([article.id]))
}

function bulk(action: 'publish' | 'archive' | 'remove'): void {
  const ids = [...selectedKeys.value]
  if (!ids.length)
    return
  selectedKeys.value = []
  if (action === 'publish')
    return notify(copy.value.published(ids.length), 'i-carbon-send-alt', setStatus(ids, 'published'))
  if (action === 'archive')
    return notify(copy.value.archived(ids.length), 'i-carbon-archive', setStatus(ids, 'archived'))
  notify(copy.value.removed(ids.length), 'i-carbon-trash-can', remove(ids))
}

function clearFilters(): void {
  request({ status: 'all', search: '', page: 1 })
}

async function copyLink(article: Article): Promise<void> {
  if (hasNavigator()) {
    try {
      await navigator.clipboard.writeText(postHref(article))
    }
    catch {
      // Clipboard permission can be denied; the toast still confirms intent.
    }
  }
  notify(copy.value.linkCopied, 'i-carbon-link')
}

function onOpenLink(article: Article): void {
  // The docs site never navigates from a demo; say what the host would do.
  notify(copy.value.hostOpens(`/blog/${article.slug}`), 'i-carbon-launch')
}

/* ─── Editor drawer ───────────────────────────────────────────────────── */

const drawerOpen = ref(false)
const formRef = ref<{ validate: () => Promise<boolean>, clearValidate: () => void } | null>(null)
const draft = reactive<EditorDraft>(emptyDraft())

function emptyDraft(): EditorDraft {
  return {
    id: `post-new-${Date.now().toString(36)}`,
    isNew: true,
    title: '',
    slug: '',
    section: 'guide',
    status: 'draft',
    tags: [],
    publishDate: '',
    lang: 'both',
    pinned: false,
    comments: true,
    summary: '',
    body: '',
  }
}

// Calendar dates are shown in Asia/Shanghai, the site's own publishing zone.
function toDateInput(ts: number | null): string {
  if (ts === null)
    return ''
  return new Date(ts + 8 * HOUR).toISOString().slice(0, 10)
}

function fromDateInput(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null
  return Date.parse(`${value}T10:00:00+08:00`)
}

function openEditor(article: Article | null): void {
  const next = article
    ? {
        id: article.id,
        isNew: false,
        title: L(article.title),
        slug: article.slug,
        section: article.section,
        status: article.status,
        tags: [...article.tags],
        publishDate: toDateInput(article.publishAt),
        lang: article.lang,
        pinned: article.pinned,
        comments: article.comments,
        summary: L(article.summary),
        body: L(article.body),
      }
    : emptyDraft()
  Object.assign(draft, next)
  if (article)
    focusedId.value = article.id
  drawerOpen.value = true
}

const editorTitle = computed(() => (draft.isNew ? copy.value.editorNew : copy.value.editorEdit))

const rules = computed<Record<string, FormRule[]>>(() => ({
  title: [{ required: true, message: copy.value.form.titleRequired }],
  slug: [
    { required: true, message: copy.value.form.slugRequired },
    { validator: (value: string) => /^[a-z0-9-]+$/.test(value ?? '') || copy.value.form.slugPattern },
    { validator: (value: string) => !articles.value.some(item => item.slug === value && item.id !== draft.id) || copy.value.form.slugTaken },
  ],
  summary: [{ validator: (value: string) => (value ?? '').length <= 160 || copy.value.form.summaryLength }],
}))

const sectionOptions = computed<TxSelectOption[]>(() => (Object.keys(SECTION_META) as Section[]).map(section => ({
  value: section,
  label: L(SECTION_META[section].label),
  icon: SECTION_META[section].icon,
  description: L(SECTION_META[section].hint),
})))

const statusOptions = computed<TxSelectOption[]>(() => STATUS_ORDER.map(status => ({
  value: status,
  label: L(STATUS_META[status].label),
})))

async function save(status?: Status): Promise<void> {
  const valid = await formRef.value?.validate()
  if (!valid)
    return
  const lang = zh.value ? 'zh' : 'en'
  const nextStatus = (status ?? draft.status) as Status
  const title = draft.title.trim()
  const snapshot = mutate((list) => {
    const existing = list.find(item => item.id === draft.id)
    const target: Article = existing ?? {
      id: draft.id,
      slug: draft.slug,
      title: { zh: title, en: title },
      summary: { zh: '', en: '' },
      body: { zh: '', en: '' },
      section: draft.section as Section,
      status: nextStatus,
      authorId: 'lq',
      tags: [],
      lang: draft.lang as ArticleLang,
      updatedAt: NOW,
      publishAt: null,
      views: 0,
      pinned: false,
      comments: true,
    }
    target.title[lang] = title
    target.summary[lang] = draft.summary.trim()
    target.body[lang] = draft.body
    target.slug = draft.slug
    target.section = draft.section as Section
    target.status = nextStatus
    target.tags = [...draft.tags]
    target.lang = draft.lang as ArticleLang
    target.pinned = draft.pinned
    target.comments = draft.comments
    target.publishAt = fromDateInput(draft.publishDate) ?? (nextStatus === 'published' ? NOW : null)
    target.updatedAt = NOW
    if (!existing)
      list.unshift(target)
  })
  focusedId.value = draft.id
  drawerOpen.value = false
  notify(draft.isNew ? copy.value.created(title) : copy.value.saved(title), 'i-carbon-checkmark-outline', snapshot)
}

/* ─── Reset ───────────────────────────────────────────────────────────── */

function resetDemo(): void {
  clearTimeout(toastTimer)
  toast.open = false
  undoSnapshot = null
  drawerOpen.value = false
  articles.value = seedArticles()
  selectedKeys.value = []
  focusedId.value = 'post-01'
  lastClick = null
  commitNow({ status: 'all', search: '', sort: { ...DEFAULT_SORT }, page: 1 })
}

defineExpose({ resetDemo })

onBeforeUnmount(() => {
  clearTimeout(fetchTimer)
  clearTimeout(toastTimer)
})
</script>

<template>
  <TemplateFrame :title="copy.frameTitle" :height="580">
    <template #default="{ width: stageW, height: stageH }">
      <StageSize :width="stageW" :height="stageH" @resize="onStageResize" />
      <div class="cms" :class="`is-${mode}`">
        <header class="cms__head">
          <div class="cms__heading">
            <span class="cms__logo" aria-hidden="true"><span class="i-carbon-catalog" /></span>
            <div class="cms__heading-text">
              <strong class="cms__title">{{ copy.heading }}</strong>
              <span class="cms__subtitle">
                <span v-for="(part, index) in headline" :key="index" class="cms__subtitle-part">{{ part }}</span>
              </span>
            </div>
          </div>
          <div class="cms__tools">
            <div class="cms__search">
              <TxSearchInput
                :model-value="pending.search"
                :placeholder="copy.searchPlaceholder"
                :aria-label="copy.searchLabel"
                @update:model-value="onSearch"
              />
            </div>
            <TxButton variant="primary" size="sm" icon="i-carbon-add" :aria-label="copy.newPostLabel" @click="openEditor(null)">
              <span class="cms__new-label">{{ copy.newPost }}</span>
            </TxButton>
          </div>
        </header>

        <div class="cms__chips">
          <TxFilterChips
            :model-value="pending.status"
            :items="statusItems"
            :aria-label="copy.filtersLabel"
            @update:model-value="onStatusChange"
          />
        </div>

        <section class="cms__main">
          <div class="cms__table" :class="{ 'is-loading': showSkeleton }">
            <TxDataTable
              v-model:selected-keys="selectedKeys"
              :columns="columns"
              :data="tableRows"
              :sort="pending.sort"
              :sort-on-client="false"
              :row-class="rowClass"
              row-key="id"
              sort-cycle="bi"
              table-layout="fixed"
              selectable
              highlight-selected
              sticky-header
              @update:sort="onSort"
              @row-click="onRowClick"
            >
              <template #header-actions>
                <span class="cms-sr-only">{{ copy.columns.actions }}</span>
              </template>

              <template #cell-title="{ row }">
                <span v-if="row.skeleton" class="cms-skeleton cms-skeleton--title">
                  <TxSkeleton width="72%" :height="12" />
                  <TxSkeleton v-if="mode === 'narrow'" width="40%" :height="10" />
                </span>
                <span v-else class="cms-title">
                  <span class="cms-title__line">
                    <span v-if="row.pinned" class="cms-title__pin i-carbon-pin-filled" role="img" :aria-label="copy.pinned" />
                    <span class="cms-title__text">{{ L(asArticle(row).title) }}</span>
                    <TxTag
                      v-if="mode === 'column'"
                      :label="L(SECTION_META[asArticle(row).section].label)"
                      :color="SECTION_META[asArticle(row).section].color"
                      variant="soft"
                    />
                  </span>
                  <span v-if="mode === 'narrow'" class="cms-title__meta">
                    <TxDotIndicator
                      :color="STATUS_META[asArticle(row).status].dot"
                      :label="L(STATUS_META[asArticle(row).status].label)"
                      :size="6"
                    />
                    <span aria-hidden="true">·</span>
                    <span>{{ relative(asArticle(row).updatedAt) }}</span>
                  </span>
                </span>
              </template>

              <template #cell-section="{ row }">
                <TxSkeleton v-if="row.skeleton" width="64px" :height="12" />
                <TxTag
                  v-else
                  :label="L(SECTION_META[asArticle(row).section].label)"
                  :color="SECTION_META[asArticle(row).section].color"
                  variant="soft"
                />
              </template>

              <template #cell-status="{ row }">
                <TxSkeleton v-if="row.skeleton" width="64px" :height="12" />
                <TxStatusBadge
                  v-else
                  size="sm"
                  :text="L(STATUS_META[asArticle(row).status].label)"
                  :status="STATUS_META[asArticle(row).status].tone"
                  :icon="STATUS_META[asArticle(row).status].icon"
                />
              </template>

              <template #cell-author="{ row }">
                <span v-if="row.skeleton" class="cms-skeleton">
                  <TxSkeleton variant="circle" width="22px" :height="22" />
                  <TxSkeleton width="56px" :height="10" />
                </span>
                <span v-else class="cms-author">
                  <TxAvatar
                    :name="authorName(asArticle(row).authorId)"
                    :size="22"
                    :background-color="avatarColors(asArticle(row).authorId).bg"
                    :text-color="avatarColors(asArticle(row).authorId).ink"
                  />
                  <span class="cms-author__name">{{ authorName(asArticle(row).authorId) }}</span>
                </span>
              </template>

              <template #cell-lang="{ row }">
                <TxSkeleton v-if="row.skeleton" width="36px" :height="10" />
                <span v-else class="cms-muted">{{ L(LANG_LABEL[asArticle(row).lang]) }}</span>
              </template>

              <template #cell-views="{ row }">
                <TxSkeleton v-if="row.skeleton" width="40px" :height="10" />
                <span v-else class="cms-number">{{ asArticle(row).views ? numberFormat.format(asArticle(row).views) : '—' }}</span>
              </template>

              <template #cell-updatedAt="{ row }">
                <TxSkeleton v-if="row.skeleton" width="52px" :height="10" />
                <span v-else class="cms-muted" :title="dateFormat.format(asArticle(row).updatedAt)">{{ relative(asArticle(row).updatedAt) }}</span>
              </template>

              <template #cell-actions="{ row }">
                <span v-if="!row.skeleton" class="cms-row-menu" @click.stop>
                  <TxDropdownMenu placement="bottom-end" :min-width="188">
                    <template #trigger>
                      <TxIconButton
                        icon="i-carbon-overflow-menu-horizontal"
                        size="xs"
                        :label="copy.rowMenu(L(asArticle(row).title))"
                      />
                    </template>
                    <TxDropdownItem @select="onMenu(asArticle(row), 'edit')">
                      <span class="cms-menu-item"><span class="i-carbon-edit" aria-hidden="true" />{{ copy.menu.edit }}</span>
                    </TxDropdownItem>
                    <TxDropdownItem @select="onMenu(asArticle(row), 'duplicate')">
                      <span class="cms-menu-item"><span class="i-carbon-copy" aria-hidden="true" />{{ copy.menu.duplicate }}</span>
                    </TxDropdownItem>
                    <TxDropdownItem @select="onMenu(asArticle(row), 'publish')">
                      <span class="cms-menu-item">
                        <span :class="asArticle(row).status === 'published' ? 'i-carbon-undo' : 'i-carbon-send-alt'" aria-hidden="true" />
                        {{ asArticle(row).status === 'published' ? copy.menu.unpublish : copy.menu.publish }}
                      </span>
                    </TxDropdownItem>
                    <TxDropdownItem :disabled="asArticle(row).status === 'archived'" @select="onMenu(asArticle(row), 'archive')">
                      <span class="cms-menu-item"><span class="i-carbon-archive" aria-hidden="true" />{{ copy.menu.archive }}</span>
                    </TxDropdownItem>
                    <TxDropdownItem danger @select="onMenu(asArticle(row), 'remove')">
                      <span class="cms-menu-item"><span class="i-carbon-trash-can" aria-hidden="true" />{{ copy.menu.remove }}</span>
                    </TxDropdownItem>
                  </TxDropdownMenu>
                </span>
              </template>

              <template #empty>
                <TxSearchEmpty
                  size="small"
                  :title="copy.emptyTitle"
                  :description="copy.emptyDesc"
                  :primary-action="{ label: copy.clearFilters, icon: 'i-carbon-filter-remove' }"
                  @primary="clearFilters"
                >
                  <template #icon>
                    <span class="cms-empty-icon i-carbon-document-unknown" aria-hidden="true" />
                  </template>
                </TxSearchEmpty>
              </template>
            </TxDataTable>
          </div>

          <div class="cms__toast" :class="{ 'is-open': toast.open }">
            <TxToastPanel :open="toast.open" :stack="0" side="above" :tether-length="12" :aria-label="copy.toastLabel">
              <div class="cms-toast">
                <span class="cms-toast__icon" :class="toast.icon" aria-hidden="true" />
                <span class="cms-toast__text">{{ toast.text }}</span>
                <button v-if="toast.undoable" type="button" class="cms-toast__action" @click="undo">
                  {{ copy.undo }}
                </button>
                <button type="button" class="cms-toast__close" :aria-label="copy.dismiss" @click="closeToast">
                  <span class="i-carbon-close" aria-hidden="true" />
                </button>
              </div>
            </TxToastPanel>
          </div>

          <footer class="cms__foot">
            <div v-if="selectedKeys.length" class="cms__bulk">
              <span class="cms__bulk-count">{{ copy.selected(selectedKeys.length) }}</span>
              <TxButton size="sm" variant="secondary" icon="i-carbon-send-alt" @click="bulk('publish')">
                {{ copy.bulk.publish }}
              </TxButton>
              <TxButton size="sm" variant="secondary" icon="i-carbon-archive" @click="bulk('archive')">
                {{ copy.bulk.archive }}
              </TxButton>
              <TxButton size="sm" variant="danger" icon="i-carbon-trash-can" @click="bulk('remove')">
                {{ copy.bulk.remove }}
              </TxButton>
              <button type="button" class="cms__text-button" @click="selectedKeys = []">
                {{ copy.bulk.clear }}
              </button>
            </div>
            <span v-else class="cms__summary">{{ copy.summary(resultRows.length, shownPage, pageCount) }}</span>
            <TxPagination
              :current-page="pending.page"
              :page-size="pageSize"
              :total="resultRows.length"
              :show-first-last="mode === 'wide'"
              prev-icon="i-carbon-chevron-left"
              next-icon="i-carbon-chevron-right"
              :aria-label="copy.pagination.aria"
              :first-label="copy.pagination.first"
              :prev-label="copy.pagination.prev"
              :next-label="copy.pagination.next"
              :last-label="copy.pagination.last"
              @update:current-page="onPage"
            />
          </footer>
        </section>

        <aside v-if="mode === 'wide'" class="cms__inspector" :aria-label="copy.inspectorLabel">
          <template v-if="focused">
            <div class="cms-inspector__bar">
              <TxStatusBadge
                size="sm"
                :text="L(STATUS_META[focused.status].label)"
                :status="STATUS_META[focused.status].tone"
                :icon="STATUS_META[focused.status].icon"
              />
              <TxTag :label="L(SECTION_META[focused.section].label)" :color="SECTION_META[focused.section].color" variant="soft" />
              <span class="cms-inspector__lang">{{ L(LANG_LABEL[focused.lang]) }}</span>
            </div>
            <strong class="cms-inspector__title">{{ L(focused.title) }}</strong>
            <span class="cms-inspector__link">
              <TxCellLink
                :href="postHref(focused)"
                :label="`/blog/${focused.slug}`"
                external
                @open="onOpenLink(focused)"
              />
            </span>
            <p class="cms-inspector__summary">
              {{ L(focused.summary) }}
            </p>

            <dl class="cms-inspector__meta">
              <div>
                <dt>{{ copy.meta.author }}</dt>
                <dd class="cms-author">
                  <TxAvatar
                    :name="authorName(focused.authorId)"
                    :size="20"
                    :background-color="avatarColors(focused.authorId).bg"
                    :text-color="avatarColors(focused.authorId).ink"
                  />
                  {{ authorName(focused.authorId) }}
                </dd>
              </div>
              <div>
                <dt>{{ copy.meta.updated }}</dt>
                <dd>{{ relative(focused.updatedAt) }}</dd>
              </div>
              <div>
                <dt>{{ copy.meta.publish }}</dt>
                <dd>{{ focused.publishAt === null ? copy.meta.unscheduled : dateFormat.format(focused.publishAt) }}</dd>
              </div>
              <div>
                <dt>{{ copy.meta.views }}</dt>
                <dd class="cms-number">
                  {{ focused.views ? numberFormat.format(focused.views) : '—' }}
                </dd>
              </div>
            </dl>

            <div v-if="focused.tags.length" class="cms-inspector__tags">
              <TxTag v-for="tag in focused.tags" :key="tag" :label="`#${tag}`" variant="plain" />
            </div>

            <div class="cms-inspector__preview">
              <span class="cms-inspector__preview-label">{{ copy.preview }}</span>
              <TxMarkdownView :content="L(focused.body)" />
            </div>

            <div class="cms-inspector__actions">
              <TxButton variant="primary" size="sm" icon="i-carbon-edit" @click="openEditor(focused)">
                {{ copy.edit }}
              </TxButton>
              <TxButton variant="secondary" size="sm" icon="i-carbon-link" @click="copyLink(focused)">
                {{ copy.copyLink }}
              </TxButton>
            </div>
          </template>
          <TxNoSelection v-else size="small" :title="copy.noSelection" :description="copy.noSelectionDesc">
            <template #icon>
              <span class="cms-empty-icon i-carbon-document-blank" aria-hidden="true" />
            </template>
          </TxNoSelection>
        </aside>

        <TxDrawer v-model:visible="drawerOpen" :title="editorTitle" size="min(560px, 94vw)">
          <div class="cms-editor">
            <TxForm ref="formRef" :key="draft.id" :model="draft" :rules="rules" label-position="top">
              <TxFormItem :label="copy.form.title" prop="title">
                <template #default="{ id, ariaInvalid, ariaDescribedby }">
                  <TxInput
                    :id="id"
                    v-model="draft.title"
                    :placeholder="copy.form.titlePlaceholder"
                    :aria-invalid="ariaInvalid"
                    :aria-describedby="ariaDescribedby"
                  />
                </template>
              </TxFormItem>

              <TxFormItem :label="copy.form.slug" prop="slug">
                <template #default="{ id, ariaInvalid, ariaDescribedby }">
                  <TxInput
                    :id="id"
                    v-model="draft.slug"
                    placeholder="my-first-post"
                    :aria-invalid="ariaInvalid"
                    :aria-describedby="ariaDescribedby"
                  >
                    <template #prefix>
                      <span class="cms-editor__prefix">/blog/</span>
                    </template>
                  </TxInput>
                </template>
              </TxFormItem>

              <div class="cms-editor__pair">
                <TxFormItem :label="copy.form.section">
                  <TxSelect v-model="draft.section" :options="sectionOptions" />
                </TxFormItem>
                <TxFormItem :label="copy.form.status">
                  <TxSelect v-model="draft.status" :options="statusOptions" />
                </TxFormItem>
              </div>

              <TxFormItem :label="copy.form.tags">
                <TxTagInput v-model="draft.tags" :max="5" :placeholder="copy.form.tagsPlaceholder" />
              </TxFormItem>

              <div class="cms-editor__pair">
                <TxFormItem :label="copy.form.publishAt">
                  <TxDatePicker
                    v-model="draft.publishDate"
                    variant="field"
                    :title="copy.form.publishTitle"
                    :placeholder="copy.form.publishPlaceholder"
                  />
                </TxFormItem>
                <TxFormItem :label="copy.form.lang">
                  <TxFlatRadio v-model="draft.lang" size="sm">
                    <TxFlatRadioItem value="zh" :label="L(LANG_LABEL.zh)" />
                    <TxFlatRadioItem value="en" :label="L(LANG_LABEL.en)" />
                    <TxFlatRadioItem value="both" :label="L(LANG_LABEL.both)" />
                  </TxFlatRadio>
                </TxFormItem>
              </div>

              <div class="cms-editor__switches">
                <TuffSwitch v-model="draft.pinned" :label="copy.form.pinned" />
                <TuffSwitch v-model="draft.comments" :label="copy.form.comments" />
              </div>

              <TxFormItem :label="copy.form.summary" prop="summary">
                <TxTextarea
                  v-model="draft.summary"
                  :rows="3"
                  :max-length="160"
                  show-count
                  resize="none"
                  :placeholder="copy.form.summaryPlaceholder"
                />
              </TxFormItem>

              <TxFormItem :label="copy.form.body">
                <div class="cms-editor__body">
                  <TxTextarea v-model="draft.body" :rows="9" />
                </div>
              </TxFormItem>
            </TxForm>
          </div>

          <template #footer="{ close }">
            <div class="cms-editor__footer">
              <TxButton variant="ghost" size="sm" @click="close()">
                {{ copy.cancel }}
              </TxButton>
              <TxSplitButton variant="primary" size="sm" icon="i-carbon-save" menu-icon="i-carbon-chevron-down" :menu-width="176" @click="save()">
                {{ copy.save }}
                <template #menu="{ close: closeMenu }">
                  <div class="cms-editor__save-menu">
                    <TxButton size="sm" plain block icon="i-carbon-document" @click="closeMenu(); save('draft')">
                      {{ copy.saveAs.draft }}
                    </TxButton>
                    <TxButton size="sm" plain block icon="i-carbon-time" @click="closeMenu(); save('review')">
                      {{ copy.saveAs.review }}
                    </TxButton>
                    <TxButton size="sm" plain block icon="i-carbon-send-alt" @click="closeMenu(); save('published')">
                      {{ copy.saveAs.publish }}
                    </TxButton>
                  </div>
                </template>
              </TxSplitButton>
            </div>
          </template>
        </TxDrawer>
      </div>
    </template>
  </TemplateFrame>
</template>

<style scoped>
.cms {
  display: grid;
  height: 100%;
  box-sizing: border-box;
  grid-template-areas:
    'head'
    'chips'
    'main';
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto minmax(0, 1fr);
  padding: 14px 16px 12px;
  background: var(--tx-bg-color, #fff);
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
}

/* Header ---------------------------------------------------------------- */

.cms__head {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  grid-area: head;
}

.cms__heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.cms__logo {
  display: inline-flex;
  width: 32px;
  height: 32px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: color-mix(in srgb, var(--tx-bui-accent, #0285ff) 12%, var(--tx-bg-color, #fff));
  color: var(--tx-bui-accent-ink, #0170dd);
  font-size: 15px;
}

.cms__heading-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.cms__title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}

.cms__subtitle {
  display: flex;
  min-width: 0;
  overflow: hidden;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  white-space: nowrap;
}

.cms__subtitle-part + .cms__subtitle-part::before {
  margin: 0 6px;
  content: '·';
  opacity: 0.6;
}

.cms__tools {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

.cms__search {
  width: 220px;
}

.cms__search :deep(.tx-input) {
  width: 100%;
}

.cms__chips {
  min-width: 0;
  padding-top: 10px;
  grid-area: chips;
}

/* Table ------------------------------------------------------------------ */

.cms__main {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
  padding-top: 6px;
  grid-area: main;
}

.cms__table {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  border-radius: 12px;
  box-shadow: 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);

  /* Neutral paper rather than an accent-tinted list, like the records demo. */
  --tx-data-table-row-hover-bg: var(--tx-bui-hover, #f4f5f6);
  --tx-data-table-row-selected-bg: color-mix(in srgb, var(--tx-bui-accent, #0285ff) 8%, var(--tx-bg-color, #fff));
}

/* The table is its own scroll container (sticky header); flex sizing, not a
   measured max-height, keeps it inside the stage at every size. */
.cms__table :deep(.tx-data-table) {
  min-height: 0;
  flex: 0 1 auto;
}

.cms__table :deep(.tx-data-table__row.is-skeleton) {
  cursor: default;
  pointer-events: none;
}

.cms__table :deep(.tx-data-table__row.is-skeleton .tx-data-table__cell--select > *) {
  visibility: hidden;
}

.cms__table :deep(.tx-data-table__row.is-focused > .tx-data-table__cell) {
  background: color-mix(in srgb, var(--tx-bui-accent, #0285ff) 6%, var(--tx-bg-color, #fff));
}

.cms__table :deep(.tx-data-table__row.is-focused > .tx-data-table__cell:first-child) {
  box-shadow: inset 2px 0 0 var(--tx-bui-accent, #0285ff);
}

.cms-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

.cms-skeleton {
  display: inline-flex;
  width: 100%;
  align-items: center;
  gap: 8px;
}

.cms-skeleton--title {
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.cms-title {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.cms-title__line {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.cms-title__pin {
  flex: none;
  color: var(--tx-bui-orange, #ef720c);
  font-size: 12px;
}

.cms-title__text {
  min-width: 0;
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cms-title__line :deep(.tx-tag) {
  flex: none;
}

.cms-title__meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.cms-author {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.cms-author__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cms-muted {
  color: var(--tx-text-color-secondary, #909399);
  white-space: nowrap;
}

.cms-number {
  font-variant-numeric: tabular-nums;
}

.cms-row-menu {
  display: inline-flex;
}

.cms-menu-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.cms-empty-icon {
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-size: 28px;
}

/* Footer ------------------------------------------------------------------ */

.cms__foot {
  display: flex;
  min-height: 32px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}

.cms__summary {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.cms__bulk {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.cms__bulk-count {
  margin-right: 4px;
  color: var(--tx-bui-accent-ink, #0170dd);
  font-size: 12px;
  font-weight: 500;
}

.cms__text-button {
  padding: 4px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--tx-text-color-secondary, #909399);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

.cms__text-button:hover {
  color: var(--tx-text-color-primary, #303133);
}

.cms__text-button:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

.cms__foot :deep(.tx-pagination) {
  --tx-pagination-radius: 8px;
}

/* Toast ------------------------------------------------------------------- */

.cms__toast {
  position: absolute;
  z-index: 8;
  right: 12px;
  bottom: 44px;
  width: min(340px, calc(100% - 24px));
  pointer-events: none;
}

.cms__toast.is-open {
  pointer-events: auto;
}

.cms-toast {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.cms-toast__icon {
  flex: none;
  color: var(--tx-bui-green, #189a4d);
  font-size: 15px;
}

.cms-toast__text {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cms-toast__action,
.cms-toast__close {
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

.cms-toast__action {
  padding: 3px 8px;
  color: var(--tx-bui-accent-ink, #0170dd);
  font-size: 12px;
  font-weight: 500;
}

.cms-toast__action:hover {
  background: var(--tx-bui-accent-tint, #e9f3ff);
}

.cms-toast__close {
  width: 22px;
  height: 22px;
  color: var(--tx-text-color-secondary, #909399);
}

.cms-toast__close:hover {
  background: var(--tx-fill-color-light, #f5f7fa);
}

.cms-toast__action:focus-visible,
.cms-toast__close:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

/* Inspector (wide) -------------------------------------------------------- */

.cms__inspector {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  overflow-y: auto;
  border-radius: 12px;
  background: var(--tx-fill-color-lighter, #fafafa);
  box-shadow: 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  grid-area: inspector;
}

.cms-inspector__bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.cms-inspector__lang {
  margin-left: auto;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.cms-inspector__title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;
}

.cms-inspector__link {
  display: flex;
  min-width: 0;
  margin-top: -6px;
}

.cms-inspector__summary {
  margin: 0;
  color: var(--tx-text-color-regular, #606266);
  font-size: 13px;
  line-height: 1.6;
}

.cms-inspector__meta {
  display: grid;
  margin: 0;
  gap: 8px 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.cms-inspector__meta > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.cms-inspector__meta dt {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.cms-inspector__meta dd {
  margin: 0;
  font-size: 13px;
}

.cms-inspector__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.cms-inspector__preview {
  display: flex;
  min-height: 140px;
  flex: 1;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  overflow: auto;
  border-radius: 10px;
  background: var(--tx-bg-color, #fff);
  box-shadow: 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
}

.cms-inspector__preview-label {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-weight: 500;
}

.cms-inspector__preview :deep(.markdown-body) {
  font-size: 13px;
  line-height: 1.65;
}

.cms-inspector__preview :deep(.markdown-body h2) {
  margin: 12px 0 6px;
  font-size: 14px;
}

.cms-inspector__actions {
  display: flex;
  gap: 8px;
}

/* Editor drawer ----------------------------------------------------------- */

/* With the label on top, TxFormItem's content box shrinks to its control, so
   every field came out a different width (the title input cut its value off
   at ~170px). Stretch the box and let the control fill it; the language
   segmented control keeps its own width. */
.cms-editor :deep(.tx-form-item__content) {
  align-self: stretch;
  width: 100%;
}

.cms-editor :deep(.tx-form-item__content > :not(.tx-flat-radio)) {
  min-width: 0;
  flex: 1 1 auto;
}

/* The segmented control stretches its track by default, leaving its three
   options bunched on the left of an empty bar. */
.cms-editor :deep(.tx-flat-radio) {
  width: fit-content;
  flex: none;
}

.cms-editor__body :deep(.tx-textarea) {
  width: 100%;
}

.cms-editor :deep(.tuff-select) {
  width: 100%;
}

.cms-editor__prefix {
  margin-right: 2px;
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-family: var(--tx-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
}

/* The editor renders inside TxDrawer, which teleports out of the stage, so a
   `@container template` rule never reaches it: it measures its own width. */
.cms-editor {
  container: cms-editor / inline-size;
}

.cms-editor__pair {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

/* After the base rule: a container query adds no specificity, so placed before
   it the two-column declaration would win at every width. */
@container cms-editor (max-width: 419px) {
  .cms-editor__pair {
    grid-template-columns: minmax(0, 1fr);
  }
}

.cms-editor__switches {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 24px;
}

.cms-editor__body :deep(.tx-textarea__field) {
  font-family: var(--tx-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 12px;
  line-height: 1.6;
}

.cms-editor__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.cms-editor__save-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cms-editor__save-menu :deep(.tx-button) {
  justify-content: flex-start;
}

/* Layout ------------------------------------------------------------------ */

@container template (max-width: 639px) {
  .cms {
    padding: 12px;
  }

  .cms__head {
    gap: 10px;
  }

  .cms__search {
    width: auto;
    min-width: 0;
    flex: 1;
  }

  .cms__tools {
    min-width: 0;
    flex: 1;
    justify-content: flex-end;
  }

  .cms__heading-text {
    display: none;
  }

  .cms__new-label {
    display: none;
  }

  .cms__tools :deep(.tx-button) {
    min-width: 32px;
  }

  .cms__toast {
    right: 8px;
    width: calc(100% - 16px);
  }
}

@container template (min-width: 960px) {
  .cms {
    column-gap: 16px;
    grid-template-areas:
      'head head'
      'chips inspector'
      'main inspector';
    grid-template-columns: minmax(0, 1fr) 340px;
    grid-template-rows: auto auto minmax(0, 1fr);
    padding: 18px 20px 16px;
  }

  .cms__inspector {
    margin-top: 10px;
  }

  .cms__search {
    width: 260px;
  }
}
</style>
