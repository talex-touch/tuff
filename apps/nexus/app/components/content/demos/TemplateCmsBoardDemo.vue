<script setup lang="ts">
import './TemplateCmsBoardDemo.css'
// CMS template, editorial-board style: the publishing schedule behind the
// Nexus blog, read as a flow from draft to published rather than row by row.
//
// Each column is its own TxSortableList, which owns in-column order, keyboard
// pick-up and the screen-reader announcements. It runs in `drag-mode="native"`
// because the board needs the HTML5 drag it starts. Its drag state is private
// to the instance, so a card cannot leave its list on its own: the board adds
// the cross-column half with native DnD on the column bodies and the week lane,
// and commits the move in its own `dragend` — after the source list has
// settled its preview, and while the source row is still mounted. Keyboard and
// touch users move cards with the card menu or ←/→.
import type { FilterChipItem, FilterChipValue } from '@talex-touch/tuffex/filter-chips'
import type { SortableListProps } from '@talex-touch/tuffex/sortable-list'
import type { StatusTone } from '@talex-touch/tuffex/status-badge'
import { hasNavigator, hasWindow } from '@talex-touch/utils/env'
import { computed, defineComponent, nextTick, onBeforeUnmount, reactive, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

type ColumnKey = 'draft' | 'review' | 'scheduled' | 'published'
type Section = 'release' | 'guide' | 'plugin' | 'engineering' | 'community'
type AuthorId = 'lq' | 'mo' | 'ks' | 'ac' | 'nh'
type QuickFilter = 'all' | 'mine' | 'due' | 'comments'
type ChecklistKey = 'art' | 'proof' | 'bilingual' | 'seo'
type Mode = 'narrow' | 'column' | 'wide'

interface Bi { zh: string, en: string }

interface BoardComment {
  id: string
  author: AuthorId
  at: number
  text: Bi
}

interface BoardCard {
  id: string
  slug: string
  title: Bi
  summary: Bi
  section: Section
  authorId: AuthorId
  reviewerId: AuthorId | null
  dueAt: number | null
  publishAt: number | null
  /** The latest comments; `commentCount` also counts the older ones. */
  comments: BoardComment[]
  commentCount: number
  unreadComments: boolean
  checklist: Record<ChecklistKey, boolean>
}

type Board = Record<ColumnKey, BoardCard[]>

interface PendingMove {
  id: string
  to: ColumnKey
  /** Insertion index in the target column; -1 slots a scheduled card by date. */
  index: number
  publishAt?: number
}

interface LaneDay {
  index: number
  start: number
  slot: number
  past: boolean
  today: boolean
  cards: BoardCard[]
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
// Card ids land in `data-tx-sort-id`, which TxSortableList looks up on the
// whole document, so they carry a per-instance prefix.
const uid = useId().replace(/[^\w-]/g, '')

function L(text: Bi): string {
  return zh.value ? text.zh : text.en
}

function prefersReducedMotion(): boolean {
  return hasWindow() && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* ─── Mock data ───────────────────────────────────────────────────────── */

// 10:30 on Wednesday 23 Sep 2026 in Asia/Shanghai; every time below is fixed
// against it so the board reads the same on every visit.
const NOW = Date.UTC(2026, 8, 23, 2, 30)
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const SHANGHAI = 8 * HOUR
// Monday 21 September, 00:00 in Shanghai.
const WEEK_START = Date.UTC(2026, 8, 20, 16, 0)
const WIP_LIMIT = 3
const ME: AuthorId = 'lq'
const COLUMNS: ColumnKey[] = ['draft', 'review', 'scheduled', 'published']
const CHECKLIST: ChecklistKey[] = ['art', 'proof', 'bilingual', 'seo']

/** A wall-clock time in Shanghai on a day of September 2026 (or later, by overflow). */
function at(day: number, hour: number, minute = 0): number {
  return Date.UTC(2026, 8, day, hour, minute) - SHANGHAI
}

const AUTHORS: Record<AuthorId, { name: Bi, hue: string }> = {
  lq: { name: { zh: '林乔', en: 'Lin Qiao' }, hue: 'var(--tx-chart-categorical-1, #4290f0)' },
  mo: { name: { zh: 'Mara Okafor', en: 'Mara Okafor' }, hue: 'var(--tx-chart-categorical-6, #d37536)' },
  ks: { name: { zh: '佐藤健二', en: 'Kenji Sato' }, hue: 'var(--tx-chart-categorical-5, #50c3b6)' },
  ac: { name: { zh: 'Ava Chen', en: 'Ava Chen' }, hue: 'var(--tx-chart-categorical-3, #e8649d)' },
  nh: { name: { zh: 'Noor Haddad', en: 'Noor Haddad' }, hue: 'var(--tx-chart-categorical-4, #8d58ee)' },
}

const SECTION_META: Record<Section, { label: Bi, color: string, icon: string }> = {
  release: { label: { zh: '发布说明', en: 'Release notes' }, color: 'var(--tx-chart-categorical-1, #4290f0)', icon: 'i-carbon-rocket' },
  guide: { label: { zh: '指南', en: 'Guides' }, color: 'var(--tx-chart-categorical-5, #50c3b6)', icon: 'i-carbon-book' },
  plugin: { label: { zh: '插件聚光灯', en: 'Spotlight' }, color: 'var(--tx-chart-categorical-4, #8d58ee)', icon: 'i-carbon-plug' },
  engineering: { label: { zh: '工程博客', en: 'Engineering' }, color: 'var(--tx-chart-categorical-6, #d37536)', icon: 'i-carbon-code' },
  community: { label: { zh: '社区', en: 'Community' }, color: 'var(--tx-chart-categorical-3, #e8649d)', icon: 'i-carbon-user-multiple' },
}

// `icon` is passed explicitly rather than left to the badge: the glyph names
// have to appear in this file for UnoCSS to generate them.
const COLUMN_META: Record<ColumnKey, { label: Bi, tone: StatusTone, icon: string, dot: string }> = {
  draft: { label: { zh: '草稿', en: 'Draft' }, tone: 'muted', icon: 'i-carbon-edit', dot: 'var(--tx-bui-ink-3, #9a9da3)' },
  review: { label: { zh: '审核中', en: 'In review' }, tone: 'warning', icon: 'i-carbon-time', dot: 'var(--tx-bui-orange, #ef720c)' },
  scheduled: { label: { zh: '已排期', en: 'Scheduled' }, tone: 'info', icon: 'i-carbon-calendar', dot: 'var(--tx-bui-accent, #0285ff)' },
  published: { label: { zh: '已发布', en: 'Published' }, tone: 'success', icon: 'i-carbon-checkmark', dot: 'var(--tx-bui-green, #189a4d)' },
}

const CHECKLIST_LABEL: Record<ChecklistKey, Bi> = {
  art: { zh: '配图', en: 'Artwork' },
  proof: { zh: '校对', en: 'Proofread' },
  bilingual: { zh: '中英同步', en: 'Both languages' },
  seo: { zh: 'SEO 描述', en: 'SEO summary' },
}

interface Seed {
  slug: string
  column: ColumnKey
  title: Bi
  summary: Bi
  section: Section
  author: AuthorId
  reviewer?: AuthorId
  due?: number
  publish?: number
  count?: number
  unread?: boolean
  comment?: { author: AuthorId, text: Bi, ago: number }
  done?: ChecklistKey[]
}

const SEEDS: Seed[] = [
  {
    slug: 'tuff-2-5-roadmap',
    column: 'draft',
    title: { zh: 'Tuff 2.5 路线图：插件市场与团队空间', en: 'Tuff 2.5 roadmap: plugin store and team spaces' },
    summary: { zh: '下一个版本要做的两件大事，以及我们暂时不做的三件事。', en: 'The two big things in the next release, and three we are leaving out for now.' },
    section: 'release',
    author: 'lq',
    reviewer: 'nh',
    due: at(8 + 30, 18),
    count: 2,
    unread: true,
    comment: { author: 'nh', text: { zh: '团队空间那段要不要先放一张草图？', en: 'Should the team-spaces part lead with a sketch?' }, ago: 35 * MINUTE },
  },
  {
    slug: 'pomodoro-plugin-surface',
    column: 'draft',
    title: { zh: '用 Surface 做一个番茄钟插件', en: 'Build a Pomodoro plugin with a Surface' },
    summary: { zh: '从 manifest 到 attachUIView：一个带界面的最小插件。', en: 'From manifest to attachUIView: the smallest plugin with a UI of its own.' },
    section: 'guide',
    author: 'mo',
    reviewer: 'ks',
    due: at(30, 18),
    done: ['art'],
  },
  {
    slug: 'spotlight-window-presets',
    column: 'draft',
    title: { zh: '插件聚光灯：touch-window-presets', en: 'Plugin spotlight: touch-window-presets' },
    summary: { zh: '把常用的窗口组合存成预设，一键摆好整个桌面。', en: 'Save the window layouts you use as presets and lay out the desktop in one go.' },
    section: 'plugin',
    author: 'ks',
    due: at(30 + 2, 18),
    count: 1,
    comment: { author: 'ac', text: { zh: '截图我来补，周五前给你。', en: 'I will add the screenshots before Friday.' }, ago: 5 * HOUR },
  },
  {
    slug: 'one-writer-local-database',
    column: 'draft',
    title: { zh: '单写入者：本地数据库的一次重构', en: 'One writer: reworking the local database' },
    summary: { zh: '两个进程同时写入会损坏数据库，于是所有写入都收拢到一个队列。', en: 'Two processes writing at once can corrupt the database, so every write now goes through one queue.' },
    section: 'engineering',
    author: 'ks',
    reviewer: 'lq',
    due: at(30 + 5, 18),
    count: 4,
    comment: { author: 'lq', text: { zh: 'BUSY 重试那段加一张时序图吧。', en: 'Add a sequence diagram to the BUSY retry part.' }, ago: 26 * HOUR },
    done: ['proof'],
  },
  {
    slug: 'plugin-review-guidelines-2026',
    column: 'review',
    title: { zh: 'Nexus 插件审核标准（2026 版）', en: 'Nexus plugin review guidelines (2026)' },
    summary: { zh: '权限最小化、存储配额与签名要求：提交前逐条自查。', en: 'Least privilege, storage quotas and signing: a checklist to run before you submit.' },
    section: 'guide',
    author: 'nh',
    reviewer: 'lq',
    due: at(25, 18),
    count: 6,
    comment: { author: 'mo', text: { zh: '签名要求那条写得很清楚。', en: 'The signing requirement reads clearly.' }, ago: 3 * HOUR },
    done: ['art', 'proof'],
  },
  {
    slug: 'changelog-sdkapi-260713',
    column: 'review',
    title: { zh: 'sdkapi 260713 变更日志', en: 'Changelog: sdkapi 260713' },
    summary: { zh: '新增 TuffQuery.inputs 与 acceptedInputTypes，旧插件无需改动。', en: 'Adds TuffQuery.inputs and acceptedInputTypes; existing plugins keep working.' },
    section: 'release',
    author: 'lq',
    reviewer: 'mo',
    due: at(24, 18),
    count: 3,
    unread: true,
    comment: { author: 'mo', text: { zh: '例子里的 sdkapi 版本号要和正文一致。', en: 'The sdkapi version in the example should match the text.' }, ago: 50 * MINUTE },
    done: ['art', 'proof', 'bilingual'],
  },
  {
    slug: 'keyboard-first-corebox',
    column: 'review',
    title: { zh: '键盘优先：CoreBox 的交互原则', en: 'Keyboard first: how CoreBox is designed' },
    summary: { zh: '从唤起到执行都不离开键盘，鼠标只是补充。', en: 'From summon to action without leaving the keyboard; the mouse is a fallback.' },
    section: 'engineering',
    author: 'ac',
    reviewer: 'lq',
    due: at(22, 18),
    count: 2,
    comment: { author: 'ac', text: { zh: '改完了，麻烦再看一眼。', en: 'Updated, could you take another look?' }, ago: 20 * HOUR },
    done: ['art'],
  },
  {
    slug: 'bring-your-own-key',
    column: 'scheduled',
    title: { zh: '自带密钥：接入你自己的 AI Provider', en: 'Bring your own key: custom AI providers' },
    summary: { zh: '在设置里添加 Provider，密钥只存本机钥匙串。', en: 'Add a provider in settings; the key stays in the local keychain.' },
    section: 'guide',
    author: 'ac',
    reviewer: 'nh',
    publish: at(25, 10),
    count: 1,
    done: ['art', 'proof', 'bilingual', 'seo'],
  },
  {
    slug: 'spotlight-touch-translation',
    column: 'scheduled',
    title: { zh: '插件聚光灯：touch-translation', en: 'Plugin spotlight: touch-translation' },
    summary: { zh: '在 CoreBox 输入 fy 就能翻译，多源对照与截图翻译也在同一个插件里。', en: 'Type fy in CoreBox to translate, with side-by-side sources and screenshot translation in the same plugin.' },
    section: 'plugin',
    author: 'mo',
    reviewer: 'ks',
    publish: at(24, 10),
    done: ['art', 'proof', 'bilingual', 'seo'],
  },
  {
    slug: 'theme-contest-results',
    column: 'scheduled',
    title: { zh: 'CoreBox 主题征集结果', en: 'CoreBox theme contest results' },
    summary: { zh: '九套入围主题与评审点评，前三名将内置到下个版本。', en: 'Nine shortlisted themes with notes from the judges; the top three ship next release.' },
    section: 'community',
    author: 'nh',
    publish: at(30, 10),
    done: ['art', 'bilingual'],
  },
  {
    slug: 'tuff-2-4-release-notes',
    column: 'published',
    title: { zh: 'Tuff 2.4 发布说明', en: 'Tuff 2.4 release notes' },
    summary: { zh: 'CoreBox 秒开、剪贴板时间线与插件增量更新。', en: 'Instant CoreBox, a clipboard timeline and delta plugin updates.' },
    section: 'release',
    author: 'lq',
    reviewer: 'mo',
    publish: at(23, 8),
    count: 12,
    unread: true,
    comment: { author: 'ks', text: { zh: '升级方式那段已经有人在社区里转发了。', en: 'People are already sharing the upgrade section on the forum.' }, ago: 40 * MINUTE },
    done: ['art', 'proof', 'bilingual', 'seo'],
  },
  {
    slug: 'community-digest-38',
    column: 'published',
    title: { zh: '社区周报 #38', en: 'Community digest #38' },
    summary: { zh: '本周新增 12 个插件，主题征集进入投票阶段。', en: 'Twelve new plugins, and the theme contest moves to voting.' },
    section: 'community',
    author: 'ac',
    publish: at(21, 10),
    count: 5,
    done: ['art', 'proof', 'bilingual', 'seo'],
  },
  {
    slug: 'search-main-thread-budget',
    column: 'published',
    title: { zh: '我们如何把搜索主线程阻塞压到 16ms 以下', en: 'Keeping search under a 16 ms main-thread budget' },
    summary: { zh: '把剪贴板读取与索引写入移出主线程之后，每一帧都不再掉帧。', en: 'Moving clipboard reads and index writes off the main thread kept every frame on budget.' },
    section: 'engineering',
    author: 'ks',
    publish: at(18, 10),
    count: 8,
    done: ['art', 'proof', 'bilingual', 'seo'],
  },
  {
    slug: 'shortcut-cheat-sheet',
    column: 'published',
    title: { zh: '快捷键速查表', en: 'Keyboard shortcut cheat sheet' },
    summary: { zh: 'CoreBox、剪贴板与窗口管理的全部默认快捷键。', en: 'Every default shortcut for CoreBox, the clipboard and window management.' },
    section: 'guide',
    author: 'mo',
    publish: at(-17, 10),
    count: 3,
    done: ['art', 'proof', 'bilingual', 'seo'],
  },
]

function cardId(slug: string): string {
  return `${uid}-${slug}`
}

function seedBoard(): Board {
  const board: Board = { draft: [], review: [], scheduled: [], published: [] }
  for (const seed of SEEDS) {
    board[seed.column].push({
      id: cardId(seed.slug),
      slug: seed.slug,
      title: { ...seed.title },
      summary: { ...seed.summary },
      section: seed.section,
      authorId: seed.author,
      reviewerId: seed.reviewer ?? null,
      dueAt: seed.due ?? null,
      publishAt: seed.publish ?? null,
      comments: seed.comment
        ? [{ id: `${seed.slug}-c1`, author: seed.comment.author, at: NOW - seed.comment.ago, text: { ...seed.comment.text } }]
        : [],
      commentCount: seed.count ?? 0,
      unreadComments: Boolean(seed.unread),
      checklist: {
        art: Boolean(seed.done?.includes('art')),
        proof: Boolean(seed.done?.includes('proof')),
        bilingual: Boolean(seed.done?.includes('bilingual')),
        seo: Boolean(seed.done?.includes('seo')),
      },
    })
  }
  return board
}

function cloneCard(card: BoardCard): BoardCard {
  return {
    ...card,
    title: { ...card.title },
    summary: { ...card.summary },
    comments: card.comments.map(comment => ({ ...comment, text: { ...comment.text } })),
    checklist: { ...card.checklist },
  }
}

function cloneBoard(source: Board): Board {
  return {
    draft: source.draft.map(cloneCard),
    review: source.review.map(cloneCard),
    scheduled: source.scheduled.map(cloneCard),
    published: source.published.map(cloneCard),
  }
}

/* ─── Copy ────────────────────────────────────────────────────────────── */

const copy = computed(() => zh.value
  ? {
      frameTitle: '看板排期',
      heading: '排期看板',
      site: 'tuff.tagzxia.com',
      posts: (n: number) => `${n} 篇`,
      thisWeek: (n: number) => `本周发布 ${n}`,
      overdueCount: (n: number) => `${n} 篇逾期`,
      online: '在线的协作者',
      searchPlaceholder: '搜索标题',
      searchLabel: '搜索卡片',
      newCard: '新建',
      newCardLabel: '新建草稿',
      quickLabel: '快捷筛选',
      quick: { all: '全部', mine: '我负责', due: '本周到期', comments: '有新评论' } as Record<QuickFilter, string>,
      sections: '栏目',
      allSections: '全部栏目',
      filterMenu: '筛选',
      columnsLabel: '看板列',
      listLabel: (column: string, n: number) => `${column}，${n} 张卡片`,
      matched: (m: number, n: number) => `${m}/${n} 匹配`,
      overLimit: '超限',
      wipHint: (limit: number) => `审核中最多同时 ${limit} 篇；超出时提醒，但不阻止放入`,
      emptyDrop: '把卡片拖到这里',
      emptyColumn: '这一列还没有卡片',
      addCard: '添加卡片',
      newPlaceholder: '一句话写下这篇文章，回车添加',
      newLabel: '新草稿标题',
      add: '添加',
      cancel: '取消',
      cardMenu: (title: string) => `《${title}》的更多操作`,
      menu: { open: '打开详情', moveTo: '移到', copyLink: '复制链接', remove: '删除' },
      overdue: '逾期',
      dueOn: (date: string) => `截止 ${date}`,
      publishesOn: (date: string) => `发布 ${date}`,
      publishedOn: (date: string) => `已发布 ${date}`,
      commentCount: (n: number) => `${n} 条评论`,
      commentSr: (n: number, unread: boolean) => `${n} 条评论${unread ? '，有新评论' : ''}`,
      checklist: (done: number, total: number) => `清单 ${done}/${total}`,
      keysLabel: '键盘操作',
      keys: { space: '空格', grab: '拿起', sort: '排序', move: '换列' },
      lane: {
        title: '本周发布',
        label: '按天排期',
        prev: '上一周',
        current: '本周',
        next: '下一周',
        hint: '把卡片拖到某一天即可排期',
        today: '今天',
        day: (day: string, n: number) => `${day}，${n} 篇`,
        past: '已过去的日期不能排期',
      },
      toastLabel: '操作结果',
      undo: '撤销',
      view: '查看',
      dismiss: '关闭提示',
      undone: '已撤销',
      movedTo: (column: string) => `已移到「${column}」`,
      scheduledFor: (date: string) => `排期到 ${date}`,
      rescheduled: (date: string) => `已改到 ${date} 发布`,
      overWip: (n: number, limit: number) => `审核中已有 ${n} 篇，超出上限 ${limit}`,
      created: (title: string) => `已创建草稿《${title}》`,
      removed: (title: string) => `已删除《${title}》`,
      updated: (title: string) => `已更新《${title}》`,
      linkCopied: '链接已复制',
      remoteMoved: (name: string, title: string, column: string) => `${name} 把《${title}》移到了「${column}」`,
      announceMove: (title: string, column: string, position: number) => `《${title}》已移到「${column}」第 ${position} 位`,
      sort: {
        grabbed: '已拿起「{item}」，第 {position} 位，共 {size} 张。上下方向键移动，空格放下，Esc 取消。',
        moved: '「{item}」移到第 {position} 位，共 {size} 张。',
        dropped: '「{item}」放在第 {position} 位，共 {size} 张。',
        cancelled: '已取消，「{item}」回到第 {position} 位，共 {size} 张。',
        handle: '拖动「{item}」',
      },
      detail: {
        stage: '阶段',
        due: '截止',
        publish: '发布',
        dueTitle: '选择截止日期',
        publishTitle: '选择发布日期',
        pickDate: '选择日期',
        people: '成员',
        author: '作者',
        reviewer: '审核',
        unassigned: '未指派',
        checklist: '发布前清单',
        comments: '评论',
        older: (n: number) => `还有 ${n} 条更早的评论`,
        noComments: '还没有评论',
        commentPlaceholder: '写下评论，回车发送',
        commentLabel: '评论内容',
        send: '发送',
        remove: '删除',
        close: '关闭',
        next: { draft: '提交审核', review: '排期', scheduled: '立即发布' } as Partial<Record<ColumnKey, string>>,
        publishedAt: (date: string) => `已于 ${date} 发布`,
        you: '你',
      },
    }
  : {
      frameTitle: 'Editorial board',
      heading: 'Publishing board',
      site: 'tuff.tagzxia.com',
      posts: (n: number) => `${n} posts`,
      thisWeek: (n: number) => `${n} this week`,
      overdueCount: (n: number) => `${n} overdue`,
      online: 'Collaborators online',
      searchPlaceholder: 'Search titles',
      searchLabel: 'Search cards',
      newCard: 'New',
      newCardLabel: 'New draft',
      quickLabel: 'Quick filters',
      quick: { all: 'All', mine: 'Mine', due: 'Due this week', comments: 'New comments' } as Record<QuickFilter, string>,
      sections: 'Sections',
      allSections: 'All sections',
      filterMenu: 'Filter',
      columnsLabel: 'Board columns',
      listLabel: (column: string, n: number) => `${column}, ${n} cards`,
      matched: (m: number, n: number) => `${m}/${n} match`,
      overLimit: 'Over',
      wipHint: (limit: number) => `At most ${limit} posts in review at once; going over is flagged, not blocked`,
      emptyDrop: 'Drop a card here',
      emptyColumn: 'No cards in this column yet',
      addCard: 'Add a card',
      newPlaceholder: 'Say what the post is about, then Enter',
      newLabel: 'New draft title',
      add: 'Add',
      cancel: 'Cancel',
      cardMenu: (title: string) => `More actions for “${title}”`,
      menu: { open: 'Open details', moveTo: 'Move to', copyLink: 'Copy link', remove: 'Delete' },
      overdue: 'Overdue',
      dueOn: (date: string) => `Due ${date}`,
      publishesOn: (date: string) => `Publishes ${date}`,
      publishedOn: (date: string) => `Published ${date}`,
      commentCount: (n: number) => `${n} comments`,
      commentSr: (n: number, unread: boolean) => `${n} comments${unread ? ', some new' : ''}`,
      checklist: (done: number, total: number) => `Checklist ${done}/${total}`,
      keysLabel: 'Keyboard',
      keys: { space: 'Space', grab: 'pick up', sort: 'reorder', move: 'change column' },
      lane: {
        title: 'Publishing this week',
        label: 'Schedule by day',
        prev: 'Previous week',
        current: 'This week',
        next: 'Next week',
        hint: 'Drop a card on a day to schedule it',
        today: 'Today',
        day: (day: string, n: number) => `${day}, ${n} posts`,
        past: 'Days that have passed cannot be scheduled',
      },
      toastLabel: 'Result',
      undo: 'Undo',
      view: 'View',
      dismiss: 'Dismiss',
      undone: 'Undone',
      movedTo: (column: string) => `Moved to ${column}`,
      scheduledFor: (date: string) => `scheduled for ${date}`,
      rescheduled: (date: string) => `Now publishing ${date}`,
      overWip: (n: number, limit: number) => `${n} posts in review, over the limit of ${limit}`,
      created: (title: string) => `Created the draft “${title}”`,
      removed: (title: string) => `Deleted “${title}”`,
      updated: (title: string) => `Updated “${title}”`,
      linkCopied: 'Link copied',
      remoteMoved: (name: string, title: string, column: string) => `${name} moved “${title}” to ${column}`,
      announceMove: (title: string, column: string, position: number) => `“${title}” moved to ${column}, position ${position}`,
      sort: {
        grabbed: '{item}, picked up. Position {position} of {size}. Up and down arrows move it, space drops it, escape cancels.',
        moved: '{item}, moved to position {position} of {size}.',
        dropped: '{item}, dropped at position {position} of {size}.',
        cancelled: 'Cancelled. {item} is back at position {position} of {size}.',
        handle: 'Drag {item}',
      },
      detail: {
        stage: 'Stage',
        due: 'Due',
        publish: 'Publish',
        dueTitle: 'Pick a due date',
        publishTitle: 'Pick a publish date',
        pickDate: 'Pick a date',
        people: 'People',
        author: 'Author',
        reviewer: 'Reviewer',
        unassigned: 'Unassigned',
        checklist: 'Before publishing',
        comments: 'Comments',
        older: (n: number) => `${n} earlier comments`,
        noComments: 'No comments yet',
        commentPlaceholder: 'Write a comment, Enter to send',
        commentLabel: 'Comment',
        send: 'Send',
        remove: 'Delete',
        close: 'Close',
        next: { draft: 'Submit for review', review: 'Schedule', scheduled: 'Publish now' } as Partial<Record<ColumnKey, string>>,
        publishedAt: (date: string) => `Published ${date}`,
        you: 'You',
      },
    })

const sortLabels = computed<SortableListProps['labels']>(() => copy.value.sort)

/* ─── Stage size → layout mode ────────────────────────────────────────── */

const stageWidth = ref(0)
const stageHeight = ref(0)

function onStageResize(width: number, height: number): void {
  stageWidth.value = width
  stageHeight.value = height
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

// The week lane needs room under the columns; a short overlay keeps the board.
const showLane = computed(() => mode.value === 'wide' && stageHeight.value >= 600)

/* ─── State ───────────────────────────────────────────────────────────── */

const board = reactive<Board>(seedBoard())
const search = ref('')
const quick = ref<QuickFilter>('all')
const sections = ref<Section[]>([])
const narrowColumn = ref<ColumnKey>('draft')
const weekOffset = ref(0)
const online = ref<AuthorId[]>(['lq', 'ac', 'nh'])
const remoteId = ref<string | null>(null)
const activeCardId = ref<string | null>(null)
const announcement = ref('')
const rootRef = ref<HTMLElement | null>(null)

const allCards = computed(() => COLUMNS.flatMap(column => board[column]))

function findCard(id: string | null): BoardCard | null {
  if (!id)
    return null
  for (const column of COLUMNS) {
    const card = board[column].find(item => item.id === id)
    if (card)
      return card
  }
  return null
}

function columnOf(id: string): ColumnKey | null {
  return COLUMNS.find(column => board[column].some(card => card.id === id)) ?? null
}

const visibleColumns = computed(() => (mode.value === 'narrow' ? [narrowColumn.value] : COLUMNS))

function onColumnOrder(column: ColumnKey, value: BoardCard[]): void {
  board[column] = value
}

/* ─── Filters ─────────────────────────────────────────────────────────── */

function dayNumber(ts: number): number {
  return Math.floor((ts + SHANGHAI) / DAY)
}

function isOverdue(card: BoardCard, column: ColumnKey): boolean {
  return (column === 'draft' || column === 'review') && card.dueAt !== null && card.dueAt < NOW
}

function dueThisWeek(card: BoardCard, column: ColumnKey): boolean {
  if (column !== 'draft' && column !== 'review' || card.dueAt === null)
    return false
  return card.dueAt < WEEK_START + 7 * DAY
}

function matchesQuick(card: BoardCard, column: ColumnKey, filter: QuickFilter): boolean {
  if (filter === 'mine')
    return card.authorId === ME || card.reviewerId === ME
  if (filter === 'due')
    return dueThisWeek(card, column)
  if (filter === 'comments')
    return card.unreadComments
  return true
}

const needle = computed(() => search.value.trim().toLowerCase())
const anyFilter = computed(() => Boolean(needle.value) || quick.value !== 'all' || sections.value.length > 0)

// Matching cards stay bright and the rest dim instead of disappearing: a
// sortable list handed a subset would reorder the subset, and the hidden cards
// would have no defined place to go back to.
function matches(card: BoardCard, column: ColumnKey): boolean {
  if (!matchesQuick(card, column, quick.value))
    return false
  if (sections.value.length && !sections.value.includes(card.section))
    return false
  return !needle.value || L(card.title).toLowerCase().includes(needle.value)
}

function matchCount(column: ColumnKey): number {
  return board[column].filter(card => matches(card, column)).length
}

const quickItems = computed<FilterChipItem[]>(() => (['all', 'mine', 'due', 'comments'] as QuickFilter[]).map(filter => ({
  value: filter,
  label: copy.value.quick[filter],
  // Counted from the same board the columns read, so a chip never promises a
  // number of cards it will not light up.
  count: COLUMNS.reduce((sum, column) => sum + board[column].filter(card => matchesQuick(card, column, filter)).length, 0),
})))

const columnItems = computed<FilterChipItem[]>(() => COLUMNS.map(column => ({
  value: column,
  label: L(COLUMN_META[column].label),
  dot: COLUMN_META[column].dot,
  count: board[column].length,
})))

function onQuick(value: FilterChipValue): void {
  quick.value = value as QuickFilter
}

function onNarrowColumn(value: FilterChipValue): void {
  narrowColumn.value = value as ColumnKey
}

function toggleSection(section: Section): void {
  sections.value = sections.value.includes(section)
    ? sections.value.filter(item => item !== section)
    : [...sections.value, section]
}

/* ─── Formatting ──────────────────────────────────────────────────────── */

const lang = computed(() => (zh.value ? 'zh-CN' : 'en'))
const dayFormat = computed(() => new Intl.DateTimeFormat(lang.value, { month: 'short', day: 'numeric', timeZone: 'Asia/Shanghai' }))
const timeFormat = computed(() => new Intl.DateTimeFormat(lang.value, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }))
const weekdayFormat = computed(() => new Intl.DateTimeFormat(lang.value, { weekday: 'short', timeZone: 'Asia/Shanghai' }))
const dayOfMonthFormat = computed(() => new Intl.DateTimeFormat(lang.value, { day: 'numeric', timeZone: 'Asia/Shanghai' }))
const fullFormat = computed(() => new Intl.DateTimeFormat(lang.value, { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }))
const relativeFormat = computed(() => new Intl.RelativeTimeFormat(lang.value, { numeric: 'auto' }))

function dayText(ts: number): string {
  const diff = dayNumber(ts) - dayNumber(NOW)
  return Math.abs(diff) <= 1 ? relativeFormat.value.format(diff, 'day') : dayFormat.value.format(ts)
}

function cardDate(card: BoardCard, column: ColumnKey): { icon: string, text: string, label: string } | null {
  if (column === 'published' && card.publishAt !== null) {
    const text = dayFormat.value.format(card.publishAt)
    return { icon: 'i-carbon-checkmark-outline', text, label: copy.value.publishedOn(text) }
  }
  if (column === 'scheduled' && card.publishAt !== null) {
    const full = `${dayText(card.publishAt)} ${timeFormat.value.format(card.publishAt)}`
    // Four ~180px columns leave the footer no room for the time; the card
    // keeps the day, and its label and the detail dialog keep the time.
    const text = mode.value === 'column' ? dayText(card.publishAt) : full
    return { icon: 'i-carbon-time', text, label: copy.value.publishesOn(full) }
  }
  if (card.dueAt === null)
    return null
  const text = dayText(card.dueAt)
  return { icon: 'i-carbon-calendar', text, label: copy.value.dueOn(text) }
}

function checkDone(card: BoardCard): number {
  return CHECKLIST.filter(key => card.checklist[key]).length
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

function cardLabel(card: BoardCard): string {
  return L(card.title)
}

const headline = computed(() => {
  const weekEnd = WEEK_START + 7 * DAY
  const week = [...board.scheduled, ...board.published]
    .filter(card => card.publishAt !== null && card.publishAt >= WEEK_START && card.publishAt < weekEnd).length
  const overdue = [...board.draft.map(card => isOverdue(card, 'draft')), ...board.review.map(card => isOverdue(card, 'review'))]
    .filter(Boolean).length
  const parts = [copy.value.site, copy.value.posts(allCards.value.length), copy.value.thisWeek(week)]
  if (overdue)
    parts.push(copy.value.overdueCount(overdue))
  return parts
})

function headId(column: ColumnKey): string {
  return `${uid}-col-${column}`
}

/* ─── Toast + undo ────────────────────────────────────────────────────── */

interface ToastState {
  open: boolean
  text: string
  icon: string
  tone: 'default' | 'warning'
  actor: AuthorId | null
  action: 'undo' | 'view' | null
}

const toast = reactive<ToastState>({ open: false, text: '', icon: 'i-carbon-checkmark-outline', tone: 'default', actor: null, action: null })
let toastTimer: ReturnType<typeof setTimeout> | undefined
let undoSnapshot: Board | null = null
let toastTarget: string | null = null
// Every toast closes by itself; a pointer or keyboard focus resting on it
// holds it open (it may carry Undo or View), and it re-arms two seconds after
// both have left.
let toastHovered = false
let toastFocused = false

function armToast(ms: number): void {
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.open = false
    undoSnapshot = null
  }, ms)
}

function notify(state: Omit<ToastState, 'open'>, snapshot: Board | null = null): void {
  Object.assign(toast, state, { open: true })
  undoSnapshot = snapshot
  if (toastHovered || toastFocused)
    clearTimeout(toastTimer)
  else
    armToast(state.action ? 4500 : 3200)
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

function restore(snapshot: Board): void {
  Object.assign(board, cloneBoard(snapshot))
}

function onToastAction(): void {
  if (toast.action === 'undo' && undoSnapshot) {
    restore(undoSnapshot)
    notify({ text: copy.value.undone, icon: 'i-carbon-undo', tone: 'default', actor: null, action: null })
    return
  }
  if (toast.action === 'view' && toastTarget) {
    const target = toastTarget
    closeToast()
    openDetail(target)
  }
}

function announce(text: string): void {
  // Re-set through an empty string so the same sentence twice is still read.
  announcement.value = ''
  void nextTick(() => {
    announcement.value = text
  })
}

/* ─── Moves ───────────────────────────────────────────────────────────── */

function defaultSlot(): number {
  // The next morning at 10:00, the desk's usual publishing time.
  return at(24, 10)
}

function insertByDate(list: BoardCard[], card: BoardCard): number {
  const index = list.findIndex(item => (item.publishAt ?? Infinity) > (card.publishAt ?? Infinity))
  return index < 0 ? list.length : index
}

interface MoveOptions {
  silent?: boolean
  /** Undo restores this board rather than the one right before the move. */
  snapshot?: Board | null
}

function applyMove(move: PendingMove, options: MoveOptions = {}): void {
  const from = columnOf(move.id)
  const card = findCard(move.id)
  if (!from || !card)
    return
  const snapshot = options.snapshot ?? cloneBoard(board)
  const rescheduleOnly = from === move.to && move.publishAt !== undefined

  if (move.to === 'scheduled')
    card.publishAt = move.publishAt ?? card.publishAt ?? defaultSlot()
  else if (move.to === 'published')
    card.publishAt = card.publishAt !== null && card.publishAt <= NOW ? card.publishAt : NOW
  else
    card.publishAt = null

  if (!rescheduleOnly && from !== move.to) {
    board[from] = board[from].filter(item => item.id !== card.id)
    const target = [...board[move.to]]
    const index = move.index < 0 ? insertByDate(target, card) : Math.min(Math.max(0, move.index), target.length)
    target.splice(index, 0, card)
    board[move.to] = target
  }

  if (options.silent)
    return

  const title = L(card.title)
  const column = L(COLUMN_META[move.to].label)
  const position = board[move.to].findIndex(item => item.id === card.id) + 1
  announce(copy.value.announceMove(title, column, position))

  const when = card.publishAt !== null && move.to === 'scheduled' ? fullFormat.value.format(card.publishAt) : ''
  if (rescheduleOnly) {
    notify({ text: copy.value.rescheduled(when), icon: 'i-carbon-calendar', tone: 'default', actor: null, action: 'undo' }, snapshot)
    return
  }
  if (move.to === 'review' && board.review.length > WIP_LIMIT) {
    notify({ text: `${copy.value.movedTo(column)} · ${copy.value.overWip(board.review.length, WIP_LIMIT)}`, icon: 'i-carbon-warning-alt', tone: 'warning', actor: null, action: 'undo' }, snapshot)
    return
  }
  const text = when ? `${copy.value.movedTo(column)} · ${copy.value.scheduledFor(when)}` : copy.value.movedTo(column)
  notify({ text, icon: COLUMN_META[move.to].icon, tone: 'default', actor: null, action: 'undo' }, snapshot)
}

function moveByMenu(id: string, to: ColumnKey): void {
  applyMove({ id, to, index: 0 })
  if (mode.value === 'narrow')
    narrowColumn.value = to
}

function removeCard(id: string, snapshot: Board | null = null): void {
  const card = findCard(id)
  const from = columnOf(id)
  if (!card || !from)
    return
  const before = snapshot ?? cloneBoard(board)
  board[from] = board[from].filter(item => item.id !== id)
  notify({ text: copy.value.removed(L(card.title)), icon: 'i-carbon-trash-can', tone: 'default', actor: null, action: 'undo' }, before)
}

async function copyLink(card: BoardCard): Promise<void> {
  // Only ever reached from the reader's own click.
  if (hasNavigator()) {
    try {
      await navigator.clipboard.writeText(`https://tuff.tagzxia.com/blog/${card.slug}`)
    }
    catch {
      // Clipboard permission can be denied; the toast still confirms intent.
    }
  }
  notify({ text: copy.value.linkCopied, icon: 'i-carbon-link', tone: 'default', actor: null, action: null })
}

/* ─── Focus ───────────────────────────────────────────────────────────── */

function cardElement(id: string): HTMLElement | null {
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id
  return rootRef.value?.querySelector<HTMLElement>(`[data-tx-sort-id="${escaped}"]`) ?? null
}

// Scroll only the column, and only as far as the card needs: `focus()` with
// its default scrolling would move the docs page too.
function focusCard(id: string): void {
  const element = cardElement(id)
  if (!element)
    return
  element.focus({ preventScroll: true })
  const body = element.closest<HTMLElement>('.board-col__body')
  if (!body)
    return
  // The body is positioned, so it is the row's offsetParent: `offsetTop` is
  // the row's place in the scrolled content, whatever the scroll position.
  const top = element.offsetTop
  if (top < body.scrollTop)
    body.scrollTop = top - 8
  else if (top + element.offsetHeight > body.scrollTop + body.clientHeight)
    body.scrollTop = top + element.offsetHeight - body.clientHeight + 8
}

// The card's own controls join the tab order only while the card is the one
// in focus, so tabbing through a column is one stop per card, not four.
function onFocusIn(event: FocusEvent): void {
  const card = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-tx-sort-id]')
  if (card)
    activeCardId.value = card.dataset.txSortId ?? null
}

let menuFollowUp: (() => void) | null = null
const MENU_LEAVE_MS = 320
const menuTimers = new Set<ReturnType<typeof setTimeout>>()

// TxDropdownMenu does not hand focus back. After Esc or a choice, focus is
// still on a row of the leaving (teleported) panel, and it falls to <body>
// once the panel has hidden. Only stranded focus moves — on <body>, or inside
// that panel — as the menu closes and once more after its leave transition;
// focus the reader put elsewhere, or a dialog the choice opened, keeps it.
function afterMenuClose(restore: () => void, then?: () => void): void {
  const active = document.activeElement
  const panel = active instanceof HTMLElement ? active.closest('[role="menu"]') : null
  const stranded = (): boolean => {
    const now = document.activeElement
    return !now || now === document.body || Boolean(panel?.contains(now))
  }
  void nextTick(() => {
    if (stranded())
      restore()
    then?.()
  })
  const timer = setTimeout(() => {
    menuTimers.delete(timer)
    if (stranded())
      restore()
  }, MENU_LEAVE_MS)
  menuTimers.add(timer)
}

function clearMenuTimers(): void {
  for (const timer of menuTimers)
    clearTimeout(timer)
  menuTimers.clear()
}

// The card the menu was opened from takes focus back; "Open details" opens
// the dialog only after that, so the dialog returns focus to the card too.
function onCardMenuClose(id: string): void {
  const next = menuFollowUp
  menuFollowUp = null
  afterMenuClose(() => focusCard(id), next ?? undefined)
}

function onFilterMenuClose(): void {
  afterMenuClose(() => rootRef.value?.querySelector<HTMLElement>('.board__filter-trigger')?.focus({ preventScroll: true }))
}

/* ─── Drag and drop between columns ───────────────────────────────────── */

const drag = reactive({
  id: null as string | null,
  from: null as ColumnKey | null,
  overColumn: null as ColumnKey | null,
  overIndex: -1,
  overDay: -1,
})
let pendingMove: PendingMove | null = null
let dragSnapshot: Board | null = null

function clearHint(): void {
  drag.overColumn = null
  drag.overIndex = -1
  drag.overDay = -1
}

function resetDrag(): void {
  drag.id = null
  drag.from = null
  clearHint()
  pendingMove = null
  dragSnapshot = null
}

// Bubble phase on the board root: the list's own handler on the row has
// already run and written the card id into the drag data.
function onBoardDragStart(event: DragEvent): void {
  if (event.defaultPrevented)
    return
  const target = event.target as HTMLElement | null
  const chip = target?.closest<HTMLElement>('[data-lane-card]')
  const row = target?.closest<HTMLElement>('[data-tx-sort-id]')
  const id = chip?.dataset.laneCard ?? row?.dataset.txSortId
  const from = id ? columnOf(id) : null
  if (!id || !from)
    return
  stopAutoplay()
  // `dataTransfer.getData()` is blank during dragover, so the board keeps its
  // own copy of what is being dragged.
  drag.id = id
  drag.from = from
  dragSnapshot = cloneBoard(board)
  if (chip && event.dataTransfer) {
    event.dataTransfer.setData('text/plain', id)
    event.dataTransfer.effectAllowed = 'move'
  }
}

function insertionIndex(column: HTMLElement, clientY: number): number {
  let index = 0
  for (const item of column.querySelectorAll<HTMLElement>('[data-tx-sort-id]')) {
    const rect = item.getBoundingClientRect()
    if (clientY < rect.top + rect.height / 2)
      break
    index += 1
  }
  return index
}

function onColumnDragOver(event: DragEvent, column: ColumnKey): void {
  if (!drag.id)
    return
  // Inside its own column the card belongs to TxSortableList.
  if (column === drag.from) {
    clearHint()
    return
  }
  // The other list never cancels dragover for a drag it did not start; this
  // is what makes the drop legal here.
  event.preventDefault()
  if (event.dataTransfer)
    event.dataTransfer.dropEffect = 'move'
  drag.overDay = -1
  drag.overColumn = column
  drag.overIndex = insertionIndex(event.currentTarget as HTMLElement, event.clientY)
}

function onColumnDrop(event: DragEvent, column: ColumnKey): void {
  if (!drag.id || column === drag.from)
    return
  event.preventDefault()
  pendingMove = { id: drag.id, to: column, index: drag.overIndex }
}

function onDayDragOver(event: DragEvent, day: LaneDay): void {
  if (!drag.id || day.past || drag.from === 'published')
    return
  event.preventDefault()
  if (event.dataTransfer)
    event.dataTransfer.dropEffect = 'move'
  drag.overColumn = null
  drag.overIndex = -1
  drag.overDay = day.index
}

function onDayDrop(event: DragEvent, day: LaneDay): void {
  if (!drag.id || day.past || drag.from === 'published')
    return
  event.preventDefault()
  pendingMove = { id: drag.id, to: 'scheduled', index: -1, publishAt: day.slot }
}

function onBoardDragOver(event: DragEvent): void {
  if (drag.id && !(event.target as HTMLElement | null)?.closest?.('[data-board-drop]'))
    clearHint()
}

// Leaving the board altogether: no later dragover would clear the hint.
function onBoardDragLeave(event: DragEvent): void {
  if (drag.id && !rootRef.value?.contains(event.relatedTarget as Node | null))
    clearHint()
}

// Committing here rather than in `drop`: a move made in `drop` unmounts the
// source row before the browser dispatches `dragend` to it, and the source
// list would never settle its preview.
function onBoardDragEnd(): void {
  const move = pendingMove
  const snapshot = dragSnapshot
  resetDrag()
  if (move)
    applyMove(move, { snapshot })
}

function dropBefore(column: ColumnKey, index: number): boolean {
  return drag.overColumn === column && drag.overIndex === index
}

function dropAfter(column: ColumnKey, index: number): boolean {
  return drag.overColumn === column && index === board[column].length - 1 && drag.overIndex >= board[column].length
}

/* ─── Week lane ───────────────────────────────────────────────────────── */

const laneDays = computed<LaneDay[]>(() => {
  const dated = [...board.scheduled, ...board.published].filter(card => card.publishAt !== null)
  return Array.from({ length: 7 }, (_, index) => {
    const start = WEEK_START + (weekOffset.value * 7 + index) * DAY
    const end = start + DAY
    const today = NOW >= start && NOW < end
    return {
      index,
      start,
      // Later today, or the usual 10:00 on a future day.
      slot: today ? start + 16 * HOUR : start + 10 * HOUR,
      past: end <= NOW,
      today,
      cards: dated
        .filter(card => card.publishAt! >= start && card.publishAt! < end)
        .sort((a, b) => a.publishAt! - b.publishAt!),
    }
  })
})

const laneRange = computed(() => {
  const first = laneDays.value[0]!.start
  const last = laneDays.value[6]!.start
  return dayFormat.value.formatRange(first, last)
})

function dayName(day: LaneDay): string {
  return `${weekdayFormat.value.format(day.start)} ${dayOfMonthFormat.value.format(day.start)}`
}

/* ─── New card ────────────────────────────────────────────────────────── */

const creating = ref(false)
const newTitle = ref('')
let newSeq = 0

function startNewCard(): void {
  narrowColumn.value = 'draft'
  creating.value = true
  newTitle.value = ''
  // A reader's own click: moving focus into the field is what they asked for.
  void nextTick(() => rootRef.value?.querySelector<HTMLInputElement>('.board-new input')?.focus({ preventScroll: true }))
}

function cancelNew(): void {
  creating.value = false
  newTitle.value = ''
}

function commitNew(): void {
  const title = newTitle.value.trim()
  if (!title) {
    cancelNew()
    return
  }
  const snapshot = cloneBoard(board)
  newSeq += 1
  const card: BoardCard = {
    id: cardId(`new-${newSeq}`),
    slug: `draft-${newSeq}`,
    title: { zh: title, en: title },
    summary: { zh: '', en: '' },
    section: 'guide',
    authorId: ME,
    reviewerId: null,
    dueAt: at(30, 18),
    publishAt: null,
    comments: [],
    commentCount: 0,
    unreadComments: false,
    checklist: { art: false, proof: false, bilingual: false, seo: false },
  }
  board.draft = [card, ...board.draft]
  cancelNew()
  notify({ text: copy.value.created(title), icon: 'i-carbon-add', tone: 'default', actor: null, action: 'undo' }, snapshot)
}

function onNewKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault()
    commitNew()
  }
  else if (event.key === 'Escape') {
    // Handled here, so the expanded stage must not collapse on the same press.
    event.preventDefault()
    cancelNew()
  }
}

/* ─── Keyboard ────────────────────────────────────────────────────────── */

function isEditable(target: HTMLElement): boolean {
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
    return true
  return target.isContentEditable || Boolean(target.closest('[contenteditable]:not([contenteditable="false"])'))
}

// On the board root, never on document. TxSortableList leaves ←/→ alone, so
// they change a card's column; a card held for reordering keeps its list.
function onKeydown(event: KeyboardEvent): void {
  stopAutoplay()
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey)
    return
  const target = event.target as HTMLElement | null
  if (!target || isEditable(target))
    return
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
    return
  if (!target.matches('[data-tx-sort-id]') || target.classList.contains('tx-sortable-list__item--grabbed'))
    return
  const id = target.dataset.txSortId!
  const from = columnOf(id)
  if (!from)
    return
  const to = COLUMNS[COLUMNS.indexOf(from) + (event.key === 'ArrowLeft' ? -1 : 1)]
  if (!to)
    return
  event.preventDefault()
  applyMove({ id, to, index: board[from].findIndex(card => card.id === id) })
  if (mode.value === 'narrow')
    narrowColumn.value = to
  void nextTick(() => focusCard(id))
}

/* ─── Detail ──────────────────────────────────────────────────────────── */

const detailOpen = ref(false)
const detailId = ref<string | null>(null)
const commentDraft = ref('')
let detailSnapshot: Board | null = null
let detailChanged = false
let detailHandled = false
let commentSeq = 0

const detailCard = computed(() => findCard(detailId.value))
const detailColumn = computed<ColumnKey>(() => (detailId.value ? columnOf(detailId.value) : null) ?? 'draft')
// The column the dialog's primary button sends the card to; published has none.
const detailNextColumn = computed<ColumnKey | null>(() => {
  const index = COLUMNS.indexOf(detailColumn.value)
  return index < COLUMNS.length - 1 ? COLUMNS[index + 1]! : null
})

function openDetail(id: string): void {
  const card = findCard(id)
  if (!card)
    return
  stopAutoplay()
  detailSnapshot = cloneBoard(board)
  detailChanged = false
  detailHandled = false
  detailId.value = id
  commentDraft.value = ''
  if (card.unreadComments) {
    card.unreadComments = false
    detailChanged = true
  }
  detailOpen.value = true
}

function queueDetail(id: string): void {
  // Opened after the menu has closed and handed focus back, so the dialog
  // returns focus to the card rather than to a menu row that no longer exists.
  menuFollowUp = () => openDetail(id)
}

function markChanged(): void {
  detailChanged = true
}

function setDetailColumn(value: unknown): void {
  const card = detailCard.value
  if (!card || value === detailColumn.value)
    return
  applyMove({ id: card.id, to: value as ColumnKey, index: 0 }, { silent: true })
  markChanged()
}

function toDateInput(ts: number | null): string {
  if (ts === null)
    return ''
  return new Date(ts + SHANGHAI).toISOString().slice(0, 10)
}

function fromDateInput(value: unknown, hour: number): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null
  return Date.parse(`${value}T${String(hour).padStart(2, '0')}:00:00+08:00`)
}

function setDue(value: unknown): void {
  const card = detailCard.value
  const ts = fromDateInput(value, 18)
  if (card && ts !== null) {
    card.dueAt = ts
    markChanged()
  }
}

function setPublish(value: unknown): void {
  const card = detailCard.value
  const ts = fromDateInput(value, 10)
  if (card && ts !== null) {
    card.publishAt = ts
    markChanged()
  }
}

function toggleCheck(key: ChecklistKey, value: boolean): void {
  const card = detailCard.value
  if (!card)
    return
  card.checklist[key] = value
  markChanged()
}

function sendComment(): void {
  const card = detailCard.value
  const text = commentDraft.value.trim()
  if (!card || !text)
    return
  commentSeq += 1
  card.comments = [...card.comments, { id: `mine-${commentSeq}`, author: ME, at: NOW + commentSeq * MINUTE, text: { zh: text, en: text } }]
  card.commentCount += 1
  commentDraft.value = ''
  markChanged()
}

function onCommentKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault()
    sendComment()
  }
}

function detailNext(): void {
  const card = detailCard.value
  const to = detailNextColumn.value
  if (!card || !to)
    return
  detailHandled = true
  detailOpen.value = false
  applyMove({ id: card.id, to, index: to === 'scheduled' ? -1 : 0 }, { snapshot: detailSnapshot })
}

function detailRemove(): void {
  const card = detailCard.value
  if (!card)
    return
  detailHandled = true
  detailOpen.value = false
  removeCard(card.id, detailSnapshot)
}

// Edits in the dialog apply as they happen; closing it offers one undo for
// the whole visit, since the stage's own toast sits behind the dialog.
watch(detailOpen, (open) => {
  if (open)
    return
  const card = detailCard.value
  if (card && detailChanged && !detailHandled && detailSnapshot)
    notify({ text: copy.value.updated(L(card.title)), icon: 'i-carbon-edit', tone: 'default', actor: null, action: 'undo' }, detailSnapshot)
  detailSnapshot = null
  detailChanged = false
  detailHandled = false
})

/* ─── Scripted playback ───────────────────────────────────────────────── */

const autoplayTimers = new Set<ReturnType<typeof setTimeout>>()
let flashTimer: ReturnType<typeof setTimeout> | undefined
let entered = false
let autoplaying = false

function schedule(ms: number, step: () => void): void {
  const id = setTimeout(() => {
    autoplayTimers.delete(id)
    step()
  }, ms)
  autoplayTimers.add(id)
}

function clearAutoplay(): void {
  for (const id of autoplayTimers)
    clearTimeout(id)
  autoplayTimers.clear()
  autoplaying = false
}

// The reader's first press inside the board ends the script where it stands.
function stopAutoplay(): void {
  if (autoplaying)
    clearAutoplay()
}

function joinMara(): void {
  if (!online.value.includes('mo'))
    online.value = [...online.value, 'mo']
}

// A colleague's move, not the reader's: it is not offered for undo.
function remoteMove(announceIt: boolean): void {
  const id = cardId('changelog-sdkapi-260713')
  if (columnOf(id) !== 'review')
    return
  applyMove({ id, to: 'scheduled', index: -1, publishAt: at(24, 15) }, { silent: true })
  if (!announceIt)
    return
  const card = findCard(id)
  if (!card)
    return
  remoteId.value = id
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => {
    remoteId.value = null
  }, 1400)
  toastTarget = id
  notify({
    text: copy.value.remoteMoved(authorName('mo'), L(card.title), L(COLUMN_META.scheduled.label)),
    icon: '',
    tone: 'default',
    actor: 'mo',
    action: 'view',
  })
}

function remoteComment(): void {
  const card = findCard(cardId('plugin-review-guidelines-2026'))
  if (!card || card.comments.some(comment => comment.id === 'remote-ava'))
    return
  card.comments = [...card.comments, { id: 'remote-ava', author: 'ac', at: NOW + 3 * MINUTE, text: { zh: '第 3 条能不能配一个反例？', en: 'Could rule 3 come with a counter-example?' } }]
  card.commentCount += 1
  card.unreadComments = true
}

function play(): void {
  clearAutoplay()
  if (prefersReducedMotion()) {
    joinMara()
    remoteMove(false)
    remoteComment()
    return
  }
  autoplaying = true
  schedule(1000, joinMara)
  schedule(1800, () => remoteMove(true))
  schedule(3400, () => {
    remoteComment()
    autoplaying = false
  })
}

function onEnter(): void {
  entered = true
  play()
}

/* ─── Reset ───────────────────────────────────────────────────────────── */

function resetDemo(): void {
  clearAutoplay()
  clearMenuTimers()
  clearTimeout(flashTimer)
  closeToast()
  resetDrag()
  Object.assign(board, seedBoard())
  search.value = ''
  quick.value = 'all'
  sections.value = []
  narrowColumn.value = 'draft'
  weekOffset.value = 0
  online.value = ['lq', 'ac', 'nh']
  remoteId.value = null
  activeCardId.value = null
  announcement.value = ''
  toastTarget = null
  menuFollowUp = null
  cancelNew()
  detailOpen.value = false
  detailId.value = null
  if (entered)
    play()
}

defineExpose({ resetDemo })

watch(locale, () => resetDemo())

onBeforeUnmount(() => {
  clearAutoplay()
  clearMenuTimers()
  clearTimeout(toastTimer)
  clearTimeout(flashTimer)
})
</script>

<template>
  <TemplateFrame :title="copy.frameTitle" :height="580" @enter="onEnter">
    <template #default="{ width: stageW, height: stageH }">
      <StageSize :width="stageW" :height="stageH" @resize="onStageResize" />
      <div
        ref="rootRef"
        class="board"
        :class="[`is-${mode}`, { 'has-lane': showLane, 'is-dragging': drag.id }]"
        @pointerdown="stopAutoplay"
        @keydown="onKeydown"
        @focusin="onFocusIn"
        @dragstart="onBoardDragStart"
        @dragover="onBoardDragOver"
        @dragleave="onBoardDragLeave"
        @dragend="onBoardDragEnd"
      >
        <header class="board__head">
          <div class="board__heading">
            <span class="board__logo" aria-hidden="true"><span class="i-carbon-task-view" /></span>
            <div class="board__heading-text">
              <strong class="board__title">{{ copy.heading }}</strong>
              <span class="board__subtitle">
                <span v-for="(part, index) in headline" :key="index" class="board__subtitle-part">{{ part }}</span>
              </span>
            </div>
          </div>
          <div class="board__tools">
            <span v-if="mode !== 'narrow'" class="board__people" role="group" :aria-label="copy.online">
              <TxAvatarGroup :max="4" :size="26">
                <TxAvatar
                  v-for="person in online"
                  :key="person"
                  :name="authorName(person)"
                  status="online"
                  :background-color="avatarColors(person).bg"
                  :text-color="avatarColors(person).ink"
                />
              </TxAvatarGroup>
            </span>
            <div class="board__search">
              <TxSearchInput v-model="search" :placeholder="copy.searchPlaceholder" :aria-label="copy.searchLabel" />
            </div>
            <TxButton variant="primary" size="sm" icon="i-carbon-add" :aria-label="copy.newCardLabel" @click="startNewCard">
              <span class="board__new-label">{{ copy.newCard }}</span>
            </TxButton>
          </div>
        </header>

        <div class="board__filters">
          <div class="board__chips">
            <TxFilterChips
              v-if="mode === 'narrow'"
              :model-value="narrowColumn"
              :items="columnItems"
              role="tablist"
              :aria-label="copy.columnsLabel"
              @update:model-value="onNarrowColumn"
            />
            <TxFilterChips
              v-else
              :model-value="quick"
              :items="quickItems"
              :aria-label="copy.quickLabel"
              @update:model-value="onQuick"
            />
          </div>
          <TxDropdownMenu placement="bottom-end" :min-width="200" :close-on-select="false" @close="onFilterMenuClose">
            <template #trigger>
              <TxButton size="sm" variant="ghost" icon="i-carbon-filter" class="board__filter-trigger" :class="{ 'is-filtering': sections.length || (mode === 'narrow' && quick !== 'all') }">
                {{ mode === 'narrow' ? copy.filterMenu : copy.sections }}
                <span v-if="sections.length" class="board__filter-count">{{ sections.length }}</span>
              </TxButton>
            </template>
            <template v-if="mode === 'narrow'">
              <TxDropdownItem v-for="filter in (['all', 'mine', 'due', 'comments'] as QuickFilter[])" :key="filter" @select="quick = filter">
                {{ copy.quick[filter] }}
                <template v-if="quick === filter" #right>
                  <span class="i-carbon-checkmark board-check" aria-hidden="true" />
                </template>
              </TxDropdownItem>
            </template>
            <TxDropdownItem @select="sections = []">
              {{ copy.allSections }}
              <template v-if="!sections.length" #right>
                <span class="i-carbon-checkmark board-check" aria-hidden="true" />
              </template>
            </TxDropdownItem>
            <TxDropdownItem v-for="(meta, key) in SECTION_META" :key="key" @select="toggleSection(key)">
              <span class="board-menu-item">
                <span class="board-menu-item__dot" :style="{ background: meta.color }" aria-hidden="true" />
                {{ L(meta.label) }}
              </span>
              <template v-if="sections.includes(key)" #right>
                <span class="i-carbon-checkmark board-check" aria-hidden="true" />
              </template>
            </TxDropdownItem>
          </TxDropdownMenu>
          <span v-if="mode === 'wide'" class="board__keys" role="note" :aria-label="copy.keysLabel">
            <span class="board__key"><TxKbd>{{ copy.keys.space }}</TxKbd>{{ copy.keys.grab }}</span>
            <span class="board__key"><TxKbd>↑</TxKbd><TxKbd>↓</TxKbd>{{ copy.keys.sort }}</span>
            <span class="board__key"><TxKbd>←</TxKbd><TxKbd>→</TxKbd>{{ copy.keys.move }}</span>
          </span>
        </div>

        <div class="board__columns">
          <section
            v-for="column in visibleColumns"
            :key="column"
            class="board-col"
            :class="{ 'is-drop-target': drag.overColumn === column }"
            :aria-labelledby="headId(column)"
            data-board-drop
            @dragover="onColumnDragOver($event, column)"
            @drop="onColumnDrop($event, column)"
          >
            <header class="board-col__head">
              <span class="board-col__dot" :style="{ background: COLUMN_META[column].dot }" aria-hidden="true" />
              <strong :id="headId(column)" class="board-col__name">{{ L(COLUMN_META[column].label) }}</strong>
              <TxBadge :value="board[column].length" :variant="column === 'review' && board.review.length > WIP_LIMIT ? 'warning' : 'default'" />
              <span v-if="anyFilter" class="board-col__match">{{ copy.matched(matchCount(column), board[column].length) }}</span>
              <TxTooltip v-if="column === 'review'" :content="copy.wipHint(WIP_LIMIT)">
                <span
                  class="board-col__wip"
                  :class="{ 'is-over': board.review.length > WIP_LIMIT }"
                  tabindex="0"
                  :aria-label="copy.wipHint(WIP_LIMIT)"
                >
                  <span v-if="board.review.length > WIP_LIMIT" class="i-carbon-warning-alt" aria-hidden="true" />
                  {{ board.review.length }}/{{ WIP_LIMIT }}
                  <template v-if="board.review.length > WIP_LIMIT">{{ copy.overLimit }}</template>
                </span>
              </TxTooltip>
            </header>

            <div class="board-col__body">
              <div v-if="column === 'draft' && creating" class="board-new">
                <TxInput v-model="newTitle" :placeholder="copy.newPlaceholder" :aria-label="copy.newLabel" @keydown="onNewKeydown" />
                <div class="board-new__actions">
                  <TxButton size="sm" variant="primary" @click="commitNew">
                    {{ copy.add }}
                  </TxButton>
                  <TxButton size="sm" variant="ghost" @click="cancelNew">
                    {{ copy.cancel }}
                  </TxButton>
                </div>
              </div>

              <TxSortableList
                :model-value="board[column]"
                drag-mode="native"
                :aria-label="copy.listLabel(L(COLUMN_META[column].label), board[column].length)"
                :item-label="cardLabel"
                :labels="sortLabels"
                @update:model-value="(value) => onColumnOrder(column, value)"
              >
                <template #item="{ item, index, grabbed, dragging }">
                  <div
                    class="board-card"
                    :class="{
                      'is-dimmed': anyFilter && !matches(item, column),
                      'is-remote': remoteId === item.id,
                      'is-held': grabbed || dragging,
                      'is-drop-before': dropBefore(column, index),
                      'is-drop-after': dropAfter(column, index),
                    }"
                    :style="{ '--card-hue': SECTION_META[item.section].color }"
                    @click="openDetail(item.id)"
                  >
                    <span class="board-card__cover" aria-hidden="true" />
                    <div class="board-card__top">
                      <TxTag :label="L(SECTION_META[item.section].label)" :color="SECTION_META[item.section].color" variant="soft" />
                      <span v-if="isOverdue(item, column)" class="board-card__overdue">
                        <span class="i-carbon-warning-alt" aria-hidden="true" />{{ copy.overdue }}
                      </span>
                      <!-- The list treats Enter / Space anywhere in a row as pick up; the
                           menu keeps them, and its click must not open the dialog. -->
                      <span class="board-card__menu" @click.stop @keydown.enter.stop @keydown.space.stop>
                        <TxDropdownMenu placement="bottom-end" :min-width="200" @close="onCardMenuClose(item.id)">
                          <template #trigger>
                            <TxIconButton
                              icon="i-carbon-overflow-menu-horizontal"
                              size="xs"
                              :tabindex="activeCardId === item.id ? 0 : -1"
                              :label="copy.cardMenu(L(item.title))"
                            />
                          </template>
                          <TxDropdownItem @select="queueDetail(item.id)">
                            <span class="board-menu-item"><span class="i-carbon-view" aria-hidden="true" />{{ copy.menu.open }}</span>
                          </TxDropdownItem>
                          <TxDropdownSubmenu>
                            <span class="board-menu-item"><span class="i-carbon-arrow-right" aria-hidden="true" />{{ copy.menu.moveTo }}</span>
                            <template #menu>
                              <TxDropdownItem
                                v-for="target in COLUMNS"
                                :key="target"
                                :disabled="target === column"
                                @select="moveByMenu(item.id, target)"
                              >
                                <span class="board-menu-item">
                                  <span class="board-menu-item__dot" :style="{ background: COLUMN_META[target].dot }" aria-hidden="true" />
                                  {{ L(COLUMN_META[target].label) }}
                                </span>
                              </TxDropdownItem>
                            </template>
                          </TxDropdownSubmenu>
                          <TxDropdownItem @select="copyLink(item)">
                            <span class="board-menu-item"><span class="i-carbon-link" aria-hidden="true" />{{ copy.menu.copyLink }}</span>
                          </TxDropdownItem>
                          <TxDropdownItem danger @select="removeCard(item.id)">
                            <span class="board-menu-item"><span class="i-carbon-trash-can" aria-hidden="true" />{{ copy.menu.remove }}</span>
                          </TxDropdownItem>
                        </TxDropdownMenu>
                      </span>
                    </div>
                    <strong class="board-card__title">{{ L(item.title) }}</strong>
                    <p v-if="mode === 'wide' && L(item.summary)" class="board-card__summary">
                      {{ L(item.summary) }}
                    </p>
                    <div v-if="mode === 'wide'" class="board-card__checklist">
                      <TxProgressBar
                        height="3px"
                        :percentage="checkDone(item) * 25"
                        :aria-label="copy.checklist(checkDone(item), CHECKLIST.length)"
                      />
                      <span>{{ checkDone(item) }}/{{ CHECKLIST.length }}</span>
                    </div>
                    <div class="board-card__meta">
                      <TxAvatar
                        :name="authorName(item.authorId)"
                        :size="20"
                        :background-color="avatarColors(item.authorId).bg"
                        :text-color="avatarColors(item.authorId).ink"
                      />
                      <span
                        v-if="cardDate(item, column)"
                        class="board-card__date"
                        :class="{ 'is-overdue': isOverdue(item, column) }"
                        :title="cardDate(item, column)!.label"
                      >
                        <span :class="cardDate(item, column)!.icon" aria-hidden="true" />
                        <span class="board-sr-only">{{ cardDate(item, column)!.label }}</span>
                        <span class="board-card__date-text" aria-hidden="true">{{ cardDate(item, column)!.text }}</span>
                      </span>
                      <span
                        v-if="item.commentCount"
                        class="board-card__comments"
                        :class="{ 'is-unread': item.unreadComments }"
                        :title="copy.commentCount(item.commentCount)"
                      >
                        <span class="i-carbon-chat" aria-hidden="true" />
                        <span class="board-sr-only">{{ copy.commentSr(item.commentCount, item.unreadComments) }}</span>
                        <span aria-hidden="true">{{ item.commentCount }}</span>
                        <span v-if="item.unreadComments" class="board-card__unread" aria-hidden="true" />
                      </span>
                    </div>
                  </div>
                </template>
              </TxSortableList>

              <div v-if="!board[column].length" class="board-col__empty" :class="{ 'is-drop-target': drag.overColumn === column }">
                {{ drag.id ? copy.emptyDrop : copy.emptyColumn }}
              </div>

              <button v-if="column === 'draft' && !creating" type="button" class="board-col__add" @click="startNewCard">
                <span class="i-carbon-add" aria-hidden="true" />{{ copy.addCard }}
              </button>
            </div>
          </section>
        </div>

        <section v-if="showLane" class="board-lane" :aria-label="copy.lane.label">
          <header class="board-lane__head">
            <strong class="board-lane__title">{{ copy.lane.title }}</strong>
            <span class="board-lane__range">{{ laneRange }}</span>
            <span class="board-lane__hint"><span class="i-carbon-draggable" aria-hidden="true" />{{ copy.lane.hint }}</span>
            <span class="board-lane__nav">
              <TxIconButton icon="i-carbon-chevron-left" size="xs" :label="copy.lane.prev" :disabled="weekOffset <= -1" @click="weekOffset -= 1" />
              <TxButton size="sm" variant="ghost" :disabled="weekOffset === 0" @click="weekOffset = 0">
                {{ copy.lane.current }}
              </TxButton>
              <TxIconButton icon="i-carbon-chevron-right" size="xs" :label="copy.lane.next" :disabled="weekOffset >= 1" @click="weekOffset += 1" />
            </span>
          </header>
          <div class="board-lane__days">
            <div
              v-for="day in laneDays"
              :key="day.start"
              class="board-day"
              :class="{ 'is-past': day.past, 'is-today': day.today, 'is-over': drag.overDay === day.index }"
              role="group"
              :aria-label="copy.lane.day(dayName(day), day.cards.length)"
              :title="day.past ? copy.lane.past : undefined"
              data-board-drop
              @dragover="onDayDragOver($event, day)"
              @drop="onDayDrop($event, day)"
            >
              <span class="board-day__name">
                {{ dayName(day) }}
                <span v-if="day.today" class="board-day__today">{{ copy.lane.today }}</span>
              </span>
              <button
                v-for="card in day.cards"
                :key="card.id"
                type="button"
                class="board-day__chip"
                :class="{ 'is-published': columnOf(card.id) === 'published' }"
                :draggable="columnOf(card.id) !== 'published'"
                :data-lane-card="card.id"
                :style="{ '--card-hue': SECTION_META[card.section].color }"
                @click="openDetail(card.id)"
              >
                <span class="board-day__dot" aria-hidden="true" />
                <span class="board-day__time">{{ timeFormat.format(card.publishAt!) }}</span>
                <span class="board-day__label">{{ L(card.title) }}</span>
                <span v-if="columnOf(card.id) === 'published'" class="board-day__done i-carbon-checkmark" :aria-label="L(COLUMN_META.published.label)" role="img" />
              </button>
            </div>
          </div>
        </section>

        <!-- TxToastPanel fades rather than unmounts, so the wrapper is inert while
             closed: its buttons leave the tab order and the accessibility tree. -->
        <div
          class="board__toast"
          :class="{ 'is-open': toast.open }"
          :inert="toast.open ? undefined : true"
          @mouseenter="holdToast('hover')"
          @mouseleave="releaseToast('hover')"
          @focusin="holdToast('focus')"
          @focusout="onToastFocusOut"
        >
          <TxToastPanel :open="toast.open" :stack="0" side="above" :tether-length="12" :aria-label="copy.toastLabel">
            <div class="board-toast" :class="{ 'is-warning': toast.tone === 'warning' }">
              <TxAvatar
                v-if="toast.actor"
                :name="authorName(toast.actor)"
                :size="26"
                :background-color="avatarColors(toast.actor).bg"
                :text-color="avatarColors(toast.actor).ink"
              />
              <span v-else class="board-toast__icon" :class="toast.icon" aria-hidden="true" />
              <span class="board-toast__text">{{ toast.text }}</span>
              <button v-if="toast.action" type="button" class="board-toast__action" @click="onToastAction">
                {{ toast.action === 'view' ? copy.view : copy.undo }}
              </button>
              <button type="button" class="board-toast__close" :aria-label="copy.dismiss" @click="closeToast">
                <span class="i-carbon-close" aria-hidden="true" />
              </button>
            </div>
          </TxToastPanel>
        </div>

        <span class="board-sr-only" role="status" aria-live="polite">{{ announcement }}</span>

        <TxModal v-model="detailOpen" :title="detailCard ? L(detailCard.title) : ''" width="min(640px, calc(100vw - 48px))">
          <div v-if="detailCard" class="board-detail" :style="{ '--card-hue': SECTION_META[detailCard.section].color }">
            <span class="board-detail__cover" aria-hidden="true" />
            <div class="board-detail__badges">
              <TxStatusBadge
                size="sm"
                :text="L(COLUMN_META[detailColumn].label)"
                :status="COLUMN_META[detailColumn].tone"
                :icon="COLUMN_META[detailColumn].icon"
              />
              <TxTag :label="L(SECTION_META[detailCard.section].label)" :color="SECTION_META[detailCard.section].color" variant="soft" />
              <span v-if="isOverdue(detailCard, detailColumn)" class="board-card__overdue">
                <span class="i-carbon-warning-alt" aria-hidden="true" />{{ copy.overdue }}
              </span>
            </div>
            <p v-if="L(detailCard.summary)" class="board-detail__summary">
              {{ L(detailCard.summary) }}
            </p>

            <div class="board-detail__field">
              <span class="board-detail__label">{{ copy.detail.stage }}</span>
              <TxFlatRadio :model-value="detailColumn" size="sm" :aria-label="copy.detail.stage" @update:model-value="setDetailColumn">
                <TxFlatRadioItem v-for="column in COLUMNS" :key="column" :value="column" :label="L(COLUMN_META[column].label)" />
              </TxFlatRadio>
            </div>

            <div class="board-detail__pair">
              <div v-if="detailColumn === 'draft' || detailColumn === 'review'" class="board-detail__field">
                <span class="board-detail__label">{{ copy.detail.due }}</span>
                <TxDatePicker
                  :model-value="toDateInput(detailCard.dueAt)"
                  variant="field"
                  :title="copy.detail.dueTitle"
                  :placeholder="copy.detail.pickDate"
                  @update:model-value="setDue"
                />
              </div>
              <div v-else class="board-detail__field">
                <span class="board-detail__label">{{ copy.detail.publish }}</span>
                <TxDatePicker
                  v-if="detailColumn === 'scheduled'"
                  :model-value="toDateInput(detailCard.publishAt)"
                  variant="field"
                  :min="toDateInput(NOW)"
                  :title="copy.detail.publishTitle"
                  :placeholder="copy.detail.pickDate"
                  @update:model-value="setPublish"
                />
                <span v-else-if="detailCard.publishAt !== null" class="board-detail__value">
                  {{ copy.detail.publishedAt(fullFormat.format(detailCard.publishAt)) }}
                </span>
              </div>
              <div class="board-detail__field">
                <span class="board-detail__label">{{ copy.detail.people }}</span>
                <span class="board-detail__people">
                  <span class="board-detail__person">
                    <TxAvatar
                      :name="authorName(detailCard.authorId)"
                      :size="22"
                      :background-color="avatarColors(detailCard.authorId).bg"
                      :text-color="avatarColors(detailCard.authorId).ink"
                    />
                    <span><em>{{ copy.detail.author }}</em>{{ authorName(detailCard.authorId) }}</span>
                  </span>
                  <span class="board-detail__person">
                    <TxAvatar
                      v-if="detailCard.reviewerId"
                      :name="authorName(detailCard.reviewerId)"
                      :size="22"
                      :background-color="avatarColors(detailCard.reviewerId).bg"
                      :text-color="avatarColors(detailCard.reviewerId).ink"
                    />
                    <span><em>{{ copy.detail.reviewer }}</em>{{ detailCard.reviewerId ? authorName(detailCard.reviewerId) : copy.detail.unassigned }}</span>
                  </span>
                </span>
              </div>
            </div>

            <div class="board-detail__field">
              <span class="board-detail__label">
                {{ copy.detail.checklist }}
                <span class="board-detail__count">{{ checkDone(detailCard) }}/{{ CHECKLIST.length }}</span>
              </span>
              <div class="board-detail__checks">
                <TxCheckbox
                  v-for="key in CHECKLIST"
                  :key="key"
                  :model-value="detailCard.checklist[key]"
                  :label="L(CHECKLIST_LABEL[key])"
                  @update:model-value="toggleCheck(key, $event)"
                />
              </div>
            </div>

            <div class="board-detail__field">
              <span class="board-detail__label">
                {{ copy.detail.comments }}
                <span class="board-detail__count">{{ detailCard.commentCount }}</span>
              </span>
              <span v-if="detailCard.commentCount > detailCard.comments.length" class="board-detail__older">
                {{ copy.detail.older(detailCard.commentCount - detailCard.comments.length) }}
              </span>
              <ul v-if="detailCard.comments.length" class="board-detail__comments">
                <li v-for="comment in detailCard.comments" :key="comment.id" class="board-comment">
                  <TxAvatar
                    :name="authorName(comment.author)"
                    :size="22"
                    :background-color="avatarColors(comment.author).bg"
                    :text-color="avatarColors(comment.author).ink"
                  />
                  <span class="board-comment__body">
                    <span class="board-comment__head">
                      <strong>{{ comment.author === ME ? copy.detail.you : authorName(comment.author) }}</strong>
                      <span>{{ fullFormat.format(comment.at) }}</span>
                    </span>
                    <span class="board-comment__text">{{ L(comment.text) }}</span>
                  </span>
                </li>
              </ul>
              <span v-else class="board-detail__older">{{ copy.detail.noComments }}</span>
              <div class="board-detail__compose">
                <TxInput v-model="commentDraft" :placeholder="copy.detail.commentPlaceholder" :aria-label="copy.detail.commentLabel" @keydown="onCommentKeydown" />
                <TxButton size="sm" variant="secondary" icon="i-carbon-send-alt" :disabled="!commentDraft.trim()" @click="sendComment">
                  {{ copy.detail.send }}
                </TxButton>
              </div>
            </div>
          </div>

          <template #footer>
            <div v-if="detailCard" class="board-detail__footer">
              <TxButton variant="danger" size="sm" icon="i-carbon-trash-can" @click="detailRemove">
                {{ copy.detail.remove }}
              </TxButton>
              <span class="board-detail__spacer" />
              <TxButton variant="ghost" size="sm" @click="detailOpen = false">
                {{ copy.detail.close }}
              </TxButton>
              <TxButton
                v-if="detailNextColumn"
                variant="primary"
                size="sm"
                :icon="COLUMN_META[detailNextColumn].icon"
                @click="detailNext"
              >
                {{ copy.detail.next[detailColumn] }}
              </TxButton>
            </div>
          </template>
        </TxModal>
      </div>
    </template>
  </TemplateFrame>
</template>
