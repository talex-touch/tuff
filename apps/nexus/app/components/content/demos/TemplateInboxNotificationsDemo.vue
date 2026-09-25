<script setup lang="ts">
// Inbox template, notification-centre style: one feed grouped by day, where
// each notice carries its own quick action, so nothing needs opening to be
// dealt with. There is no reader pane: a row click marks it read and says
// what the host would open.
//
// Approve / deny, "it was me" / "not me" and every other quick action only
// ever run from the reader's own click. Scripted playback is limited to new
// notices arriving; during do-not-disturb they land silently and are counted.
// Keyboard shortcuts live on the template root and step aside in fields,
// menus and toolbars.
import type { FilterChipItem, FilterChipValue } from '@talex-touch/tuffex/filter-chips'
import type { IconChipTone } from '@talex-touch/tuffex/icon-chip'
import type { TxSelectOption } from '@talex-touch/tuffex/select'
import type { StatusTone } from '@talex-touch/tuffex/status-badge'
import { hasWindow } from '@talex-touch/utils/env'
import { createReusableTemplate } from '@vueuse/core'
import { computed, defineComponent, nextTick, onBeforeUnmount, reactive, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

type Kind = 'mention' | 'build' | 'security' | 'plugin' | 'system'
type KindFilter = 'all' | Kind
type SourceId = 'ci' | 'community' | 'store' | 'updates' | 'security'
type PersonId = 'ks' | 'ac' | 'nh' | 'mo'
type ActionId = 'reply' | 'viewLog' | 'retry' | 'approve' | 'deny' | 'itsMe' | 'notMe' | 'restart' | 'publish' | 'update' | 'renew' | 'resolve' | 'view'
type SnoozeKey = 'hour' | 'tonight' | 'tomorrow' | 'monday'
type MuteKey = 'hour' | 'today' | 'forever'
type DayRule = 'daily' | 'weekdays' | 'weekends'
type GroupKey = 'today' | 'yesterday' | 'earlier'
type Mode = 'narrow' | 'column' | 'wide'

interface Bi { zh: string, en: string }

interface NoticeResult {
  tone: StatusTone
  icon: string
  text: Bi
}

interface Notice {
  id: string
  kind: Kind
  source: SourceId
  actor: PersonId | null
  /** Glyph and tint for notices a system sends, drawn in place of an avatar. */
  icon: string
  tone: IconChipTone
  title: Bi
  body: Bi
  at: number
  unread: boolean
  urgent: boolean
  actions: ActionId[]
  /** What the host would open for a row click or a "view"-type action. */
  target: Bi
  /** The line an action leaves behind in place of its buttons. */
  results: Partial<Record<ActionId, NoticeResult>>
  result: NoticeResult | null
  snoozedUntil: number | null
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

// One settings panel, rendered in the side column when expanded and inside a
// popover otherwise, without writing it twice.
const [DefineSettings, ReuseSettings] = createReusableTemplate()

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))
const uid = useId().replace(/[^\w-]/g, '')

function L(text: Bi): string {
  return zh.value ? text.zh : text.en
}

function prefersReducedMotion(): boolean {
  return hasWindow() && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* ─── Mock data ───────────────────────────────────────────────────────── */

// 10:30 on Wednesday 23 Sep 2026 in Asia/Shanghai; every time below is fixed
// against it.
const NOW = Date.UTC(2026, 8, 23, 2, 30)
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const SHANGHAI = 8 * HOUR

/** A wall-clock time in Shanghai on a day of September 2026. */
function at(day: number, hour: number, minute = 0): number {
  return Date.UTC(2026, 8, day, hour, minute) - SHANGHAI
}

const PEOPLE: Record<PersonId, { name: Bi, hue: string }> = {
  ks: { name: { zh: '佐藤健二', en: 'Kenji Sato' }, hue: 'var(--tx-chart-categorical-5, #50c3b6)' },
  ac: { name: { zh: 'Ava Chen', en: 'Ava Chen' }, hue: 'var(--tx-chart-categorical-3, #e8649d)' },
  nh: { name: { zh: 'Noor Haddad', en: 'Noor Haddad' }, hue: 'var(--tx-chart-categorical-4, #8d58ee)' },
  mo: { name: { zh: 'Mara Okafor', en: 'Mara Okafor' }, hue: 'var(--tx-chart-categorical-6, #d37536)' },
}

const KINDS: Kind[] = ['mention', 'build', 'security', 'plugin', 'system']

const KIND_META: Record<Kind, { label: Bi, icon: string, color: string }> = {
  mention: { label: { zh: '提及', en: 'Mentions' }, icon: 'i-carbon-at', color: 'var(--tx-chart-categorical-3, #e8649d)' },
  build: { label: { zh: '构建', en: 'Builds' }, icon: 'i-carbon-build-tool', color: 'var(--tx-chart-categorical-1, #4290f0)' },
  security: { label: { zh: '安全', en: 'Security' }, icon: 'i-carbon-security', color: 'var(--tx-chart-categorical-6, #d37536)' },
  plugin: { label: { zh: '插件', en: 'Plugins' }, icon: 'i-carbon-plug', color: 'var(--tx-chart-categorical-4, #8d58ee)' },
  system: { label: { zh: '系统', en: 'System' }, icon: 'i-carbon-information', color: 'var(--tx-bui-ink-3, #9a9da3)' },
}

const SOURCES: SourceId[] = ['ci', 'community', 'store', 'updates', 'security']

const SOURCE_META: Record<SourceId, { label: Bi, icon: string, tone: IconChipTone }> = {
  ci: { label: { zh: 'Tuff CI 构建', en: 'Tuff CI builds' }, icon: 'i-carbon-build-tool', tone: 'accent' },
  community: { label: { zh: '提及与评论', en: 'Mentions and comments' }, icon: 'i-carbon-at', tone: 'accent' },
  store: { label: { zh: '插件审核与更新', en: 'Plugin reviews and updates' }, icon: 'i-carbon-plug', tone: 'accent' },
  updates: { label: { zh: '系统与维护公告', en: 'System and maintenance' }, icon: 'i-carbon-information', tone: 'neutral' },
  security: { label: { zh: '安全', en: 'Security' }, icon: 'i-carbon-security', tone: 'orange' },
}

const ACTION_META: Record<ActionId, { label: Bi, icon: string, variant: 'primary' | 'secondary' | 'danger' }> = {
  reply: { label: { zh: '回复', en: 'Reply' }, icon: 'i-carbon-reply', variant: 'secondary' },
  viewLog: { label: { zh: '查看日志', en: 'View log' }, icon: 'i-carbon-document-view', variant: 'secondary' },
  retry: { label: { zh: '重试', en: 'Retry' }, icon: 'i-carbon-renew', variant: 'primary' },
  approve: { label: { zh: '批准', en: 'Approve' }, icon: 'i-carbon-checkmark', variant: 'primary' },
  deny: { label: { zh: '拒绝', en: 'Decline' }, icon: 'i-carbon-close', variant: 'secondary' },
  itsMe: { label: { zh: '是我', en: 'It was me' }, icon: 'i-carbon-checkmark', variant: 'secondary' },
  notMe: { label: { zh: '不是我', en: 'Not me' }, icon: 'i-carbon-locked', variant: 'danger' },
  restart: { label: { zh: '立即重启', en: 'Restart now' }, icon: 'i-carbon-restart', variant: 'primary' },
  publish: { label: { zh: '发布', en: 'Publish' }, icon: 'i-carbon-send-alt', variant: 'primary' },
  update: { label: { zh: '更新', en: 'Update' }, icon: 'i-carbon-upgrade', variant: 'primary' },
  renew: { label: { zh: '续期', en: 'Renew' }, icon: 'i-carbon-renew', variant: 'primary' },
  resolve: { label: { zh: '处理', en: 'Resolve' }, icon: 'i-carbon-launch', variant: 'secondary' },
  view: { label: { zh: '查看', en: 'View' }, icon: 'i-carbon-launch', variant: 'secondary' },
}

// Actions that hand off to the host instead of settling the notice here.
const HOST_ACTIONS = new Set<ActionId>(['viewLog', 'resolve', 'view'])

interface Seed {
  id: string
  kind: Kind
  source: SourceId
  actor?: PersonId
  icon?: string
  tone?: IconChipTone
  title: Bi
  body: Bi
  at: number
  unread?: boolean
  urgent?: boolean
  actions?: ActionId[]
  target: Bi
  results?: Partial<Record<ActionId, NoticeResult>>
  snoozedUntil?: number
}

const REPLIED: NoticeResult = { tone: 'success', icon: 'i-carbon-reply', text: { zh: '已回复', en: 'Replied' } }

const SEEDS: Seed[] = [
  {
    id: 'kenji-mention',
    kind: 'mention',
    source: 'community',
    actor: 'ks',
    title: { zh: '佐藤健二 在 #plugin-dev 提到了你', en: 'Kenji Sato mentioned you in #plugin-dev' },
    body: { zh: '“我把 pushItems 放进了 requestIdleCallback，冷启动快了不少，会不会漏掉第一批结果？”', en: '“I moved pushItems into requestIdleCallback and cold start got faster. Could it drop the first batch of results?”' },
    at: at(23, 10, 24),
    unread: true,
    actions: ['reply'],
    target: { zh: '#plugin-dev 频道', en: 'the #plugin-dev channel' },
    results: { reply: REPLIED },
  },
  {
    id: 'win32-failed',
    kind: 'build',
    source: 'ci',
    icon: 'i-carbon-build-tool',
    tone: 'red',
    title: { zh: 'Nightly 2.4.0-beta.3 · win32 构建失败', en: 'Nightly 2.4.0-beta.3 · win32 build failed' },
    body: { zh: 'package:win 步骤退出码 1：tuff-native 在链接阶段找不到 OcrEngine。', en: 'package:win exited with 1: tuff-native could not find OcrEngine at link time.' },
    at: at(23, 9, 15),
    unread: true,
    actions: ['viewLog', 'retry'],
    target: { zh: '构建 #3102 的日志', en: 'the log for build #3102' },
    results: { retry: { tone: 'info', icon: 'i-carbon-renew', text: { zh: '已重新排队 · 构建 #3103', en: 'Queued again · build #3103' } } },
  },
  {
    id: 'bookmarks-permission',
    kind: 'plugin',
    source: 'store',
    icon: 'i-carbon-plug',
    tone: 'accent',
    title: { zh: 'touch-browser-bookmarks 请求可选权限「写入剪贴板」', en: 'touch-browser-bookmarks asks for the optional “Write clipboard” permission' },
    body: { zh: '用途：复制网址到剪贴板。批准前，1.1.0 不会启用这项功能。', en: 'Used to copy a URL to the clipboard. Until you approve, 1.1.0 keeps that feature off.' },
    at: at(23, 8, 40),
    unread: true,
    actions: ['approve', 'deny'],
    target: { zh: '插件权限设置', en: 'plugin permission settings' },
    results: {
      approve: { tone: 'success', icon: 'i-carbon-checkmark', text: { zh: '已批准「写入剪贴板」', en: 'Approved “Write clipboard”' } },
      deny: { tone: 'muted', icon: 'i-carbon-close', text: { zh: '已拒绝，这项功能保持关闭', en: 'Declined; the feature stays off' } },
    },
  },
  {
    id: 'hangzhou-login',
    kind: 'security',
    source: 'security',
    icon: 'i-carbon-security',
    tone: 'orange',
    title: { zh: '新设备登录：Windows 11 · 杭州', en: 'New sign-in: Windows 11 · Hangzhou' },
    body: { zh: '如果不是你本人，请立即撤销这台设备。', en: 'If this was not you, sign that device out now.' },
    at: at(23, 8, 2),
    unread: true,
    urgent: true,
    actions: ['itsMe', 'notMe'],
    target: { zh: '登录设备列表', en: 'your signed-in devices' },
    results: {
      itsMe: { tone: 'success', icon: 'i-carbon-checkmark', text: { zh: '已确认是你本人', en: 'Confirmed as you' } },
      notMe: { tone: 'danger', icon: 'i-carbon-locked', text: { zh: '已撤销这台设备，建议修改密码', en: 'Device signed out; consider changing your password' } },
    },
  },
  {
    id: 'update-241',
    kind: 'system',
    source: 'updates',
    icon: 'i-carbon-upgrade',
    tone: 'neutral',
    title: { zh: 'Tuff 2.4.1 已下载，重启即可安装', en: 'Tuff 2.4.1 is downloaded; restart to install' },
    body: { zh: '修复 CoreBox 在多屏下的定位问题。', en: 'Fixes CoreBox placement on multi-monitor setups.' },
    at: at(23, 7, 30),
    actions: ['restart'],
    target: { zh: '更新说明', en: 'the release notes' },
    results: { restart: { tone: 'info', icon: 'i-carbon-restart', text: { zh: '宿主会重启 Tuff 完成安装', en: 'The host would restart Tuff to install' } } },
  },
  {
    id: 'translation-review',
    kind: 'plugin',
    source: 'store',
    icon: 'i-carbon-plug',
    tone: 'green',
    title: { zh: 'touch-translation 1.0.18 已通过审核', en: 'touch-translation 1.0.18 passed review' },
    body: { zh: '审核员留下两条建议，不影响发布。', en: 'The reviewer left two suggestions; neither blocks the release.' },
    at: at(22, 17, 40),
    actions: ['publish'],
    target: { zh: '开发者后台', en: 'the developer console' },
    results: { publish: { tone: 'success', icon: 'i-carbon-send-alt', text: { zh: '已发布 1.0.18', en: 'Published 1.0.18' } } },
  },
  {
    id: 'ava-comment',
    kind: 'mention',
    source: 'community',
    actor: 'ac',
    title: { zh: 'Ava Chen 在《Tuff 2.4 发布说明》的评论里提到了你', en: 'Ava Chen mentioned you on “Tuff 2.4 release notes”' },
    body: { zh: '“升级方式那段要不要加一张截图？”', en: '“Should the upgrade section get a screenshot?”' },
    at: at(22, 15, 10),
    unread: true,
    actions: ['reply'],
    target: { zh: '文章评论', en: 'the post’s comments' },
    results: { reply: REPLIED },
  },
  {
    id: 'native-passed',
    kind: 'build',
    source: 'ci',
    icon: 'i-carbon-build-tool',
    tone: 'green',
    title: { zh: 'tuff-native 0.9.2 三平台构建通过', en: 'tuff-native 0.9.2 built on all three platforms' },
    body: { zh: 'darwin-arm64、win32-x64、linux-x64 全部通过。', en: 'darwin-arm64, win32-x64 and linux-x64 all passed.' },
    at: at(22, 13, 5),
    actions: ['view'],
    target: { zh: '构建 #3098', en: 'build #3098' },
  },
  {
    id: 'scripts-update',
    kind: 'plugin',
    source: 'store',
    icon: 'i-carbon-plug',
    tone: 'accent',
    title: { zh: 'touch-workspace-scripts 1.1.0 可更新', en: 'touch-workspace-scripts 1.1.0 is available' },
    body: { zh: '新增 pnpm 工作区识别，并记住每个项目上次运行的目录。', en: 'Adds pnpm workspace detection and remembers the folder each project last ran in.' },
    at: at(22, 11, 20),
    actions: ['update'],
    target: { zh: '插件详情', en: 'the plugin page' },
    results: { update: { tone: 'success', icon: 'i-carbon-checkmark', text: { zh: '已更新到 1.1.0', en: 'Updated to 1.1.0' } } },
  },
  {
    id: 'mara-theme',
    kind: 'mention',
    source: 'community',
    actor: 'mo',
    title: { zh: 'Mara Okafor 评论了你的主题《CoreBox 午夜》', en: 'Mara Okafor commented on your theme “CoreBox Midnight”' },
    body: { zh: '“夜里用很舒服，能出一版浅色的吗？”', en: '“Easy on the eyes at night. Any chance of a light version?”' },
    at: at(22, 9, 48),
    actions: ['reply'],
    target: { zh: '主题页面', en: 'the theme page' },
    results: { reply: REPLIED },
  },
  {
    id: 'token-expiring',
    kind: 'security',
    source: 'security',
    icon: 'i-carbon-locked',
    tone: 'orange',
    title: { zh: 'API 令牌「ci-deploy」7 天后过期', en: 'API token “ci-deploy” expires in 7 days' },
    body: { zh: '过期后，CI 将无法发布夜间构建。', en: 'Once it expires, CI can no longer publish nightly builds.' },
    at: at(21, 18),
    actions: ['renew'],
    target: { zh: '令牌设置', en: 'token settings' },
    results: { renew: { tone: 'success', icon: 'i-carbon-renew', text: { zh: '已续期 90 天', en: 'Renewed for 90 days' } } },
  },
  {
    id: 'maintenance',
    kind: 'system',
    source: 'updates',
    icon: 'i-carbon-information',
    tone: 'neutral',
    title: { zh: 'Nexus 计划维护：9 月 28 日 02:00–03:00', en: 'Nexus maintenance: 28 Sep, 02:00–03:00' },
    body: { zh: '维护期间插件市场只读，已安装的插件不受影响。', en: 'The plugin store is read-only during the window; installed plugins are unaffected.' },
    at: at(21, 12),
    actions: ['view'],
    target: { zh: '维护公告', en: 'the maintenance notice' },
  },
  {
    id: 'beta2-passed',
    kind: 'build',
    source: 'ci',
    icon: 'i-carbon-build-tool',
    tone: 'green',
    title: { zh: 'Nightly 2.4.0-beta.2 · macOS 构建通过', en: 'Nightly 2.4.0-beta.2 · macOS build passed' },
    body: { zh: '产物已上传到内部更新源。', en: 'The artefacts are on the internal update feed.' },
    at: at(21, 9, 30),
    target: { zh: '构建 #3091', en: 'build #3091' },
  },
  {
    id: 'clipboard-updated',
    kind: 'plugin',
    source: 'store',
    icon: 'i-carbon-plug',
    tone: 'accent',
    title: { zh: 'clipboard-history 已自动更新到 1.2.0-beta.6', en: 'clipboard-history updated itself to 1.2.0-beta.6' },
    body: { zh: '修复长文本预览被截断的问题。', en: 'Long text previews are no longer cut off.' },
    at: at(20, 22, 10),
    target: { zh: '插件详情', en: 'the plugin page' },
  },
  {
    id: 'sync-conflict',
    kind: 'system',
    source: 'updates',
    icon: 'i-carbon-warning-alt',
    tone: 'orange',
    title: { zh: '剪贴板同步：2 条记录冲突', en: 'Clipboard sync: 2 items conflicted' },
    body: { zh: '两台设备同时修改了同一条记录，两份都已保留。', en: 'Two devices edited the same item at once; both copies were kept.' },
    at: at(20, 16, 45),
    actions: ['resolve'],
    target: { zh: '剪贴板历史', en: 'clipboard history' },
  },
  {
    id: 'noor-review',
    kind: 'mention',
    source: 'community',
    actor: 'nh',
    title: { zh: 'Noor Haddad 请你审阅 PR #1043', en: 'Noor Haddad asked you to review PR #1043' },
    body: { zh: '“剪贴板：时间线按来源分组”', en: '“Clipboard: group the timeline by source”' },
    at: at(20, 10, 5),
    actions: ['view'],
    target: { zh: 'PR #1043', en: 'PR #1043' },
  },
  {
    id: 'backup-reminder',
    kind: 'system',
    source: 'updates',
    icon: 'i-carbon-time',
    tone: 'neutral',
    title: { zh: '设置备份提醒：上次备份是 14 天前', en: 'Settings backup: the last one was 14 days ago' },
    body: { zh: '在「设置 → 备份」里可以随时导出。', en: 'Export one any time under Settings → Backup.' },
    at: at(22, 9),
    target: { zh: '备份设置', en: 'backup settings' },
    snoozedUntil: at(24, 9),
  },
  {
    id: 'weekly-deps',
    kind: 'build',
    source: 'ci',
    icon: 'i-carbon-report',
    tone: 'neutral',
    title: { zh: '每周依赖更新报告：12 个包有新版本', en: 'Weekly dependency report: 12 packages have updates' },
    body: { zh: '其中 2 个是安全修复。', en: 'Two of them are security fixes.' },
    at: at(21, 8),
    target: { zh: '依赖报告', en: 'the dependency report' },
    snoozedUntil: at(23, 20),
  },
]

function toNotice(seed: Seed): Notice {
  return {
    id: seed.id,
    kind: seed.kind,
    source: seed.source,
    actor: seed.actor ?? null,
    icon: seed.icon ?? KIND_META[seed.kind].icon,
    tone: seed.tone ?? 'neutral',
    title: { ...seed.title },
    body: { ...seed.body },
    at: seed.at,
    unread: Boolean(seed.unread),
    urgent: Boolean(seed.urgent),
    actions: [...(seed.actions ?? [])],
    target: { ...seed.target },
    results: { ...seed.results },
    result: null,
    snoozedUntil: seed.snoozedUntil ?? null,
  }
}

function seedNotices(): Notice[] {
  return SEEDS.map(toNotice)
}

function cloneNotices(list: Notice[]): Notice[] {
  return list.map(notice => ({ ...notice, actions: [...notice.actions] }))
}

const ARRIVALS: { delay: number, seed: Seed }[] = [
  {
    delay: 3000,
    seed: {
      id: 'arrival-beta4',
      kind: 'build',
      source: 'ci',
      icon: 'i-carbon-build-tool',
      tone: 'green',
      title: { zh: 'Nightly 2.4.0-beta.4 · win32 构建通过', en: 'Nightly 2.4.0-beta.4 · win32 build passed' },
      body: { zh: '链接问题已修复，三个平台全部通过。', en: 'The link error is fixed and all three platforms passed.' },
      at: NOW + MINUTE,
      unread: true,
      actions: ['view'],
      target: { zh: '构建 #3104', en: 'build #3104' },
    },
  },
  {
    delay: 8000,
    seed: {
      id: 'arrival-ava',
      kind: 'mention',
      source: 'community',
      actor: 'ac',
      title: { zh: 'Ava Chen 在 #design 提到了你', en: 'Ava Chen mentioned you in #design' },
      body: { zh: '“新的空状态插画三套方案都放在设计稿里了，你更喜欢哪一套？”', en: '“All three options for the new empty-state art are in the file. Which do you prefer?”' },
      at: NOW + 2 * MINUTE,
      unread: true,
      actions: ['reply'],
      target: { zh: '#design 频道', en: 'the #design channel' },
      results: { reply: REPLIED },
    },
  },
  {
    delay: 14000,
    seed: {
      id: 'arrival-ipad',
      kind: 'security',
      source: 'security',
      icon: 'i-carbon-security',
      tone: 'orange',
      title: { zh: '新设备登录：iPad · 上海', en: 'New sign-in: iPad · Shanghai' },
      body: { zh: '如果不是你本人，请立即撤销这台设备。', en: 'If this was not you, sign that device out now.' },
      at: NOW + 3 * MINUTE,
      unread: true,
      urgent: true,
      actions: ['itsMe', 'notMe'],
      target: { zh: '登录设备列表', en: 'your signed-in devices' },
      results: {
        itsMe: { tone: 'success', icon: 'i-carbon-checkmark', text: { zh: '已确认是你本人', en: 'Confirmed as you' } },
        notMe: { tone: 'danger', icon: 'i-carbon-locked', text: { zh: '已撤销这台设备，建议修改密码', en: 'Device signed out; consider changing your password' } },
      },
    },
  },
]

const SNOOZE: Record<SnoozeKey, number> = {
  hour: NOW + HOUR,
  tonight: at(23, 20),
  tomorrow: at(24, 9),
  monday: at(28, 9),
}

// Half-hour slots for the quiet-hours selects; tuffex has no time picker, and
// TxPicker's inline wheel would take over the page's scroll.
const SLOTS: string[] = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`)

/* ─── Copy ────────────────────────────────────────────────────────────── */

const copy = computed(() => zh.value
  ? {
      frameTitle: '通知中心',
      heading: '通知中心',
      unread: (n: number) => `${n} 条未读`,
      filtersLabel: '按类型筛选',
      all: '全部',
      unreadOnly: '仅未读',
      select: '选择',
      markAllRead: '全部已读',
      settings: '通知设置',
      feedLabel: '通知',
      groups: { today: '今天', yesterday: '昨天', earlier: '更早' } as Record<GroupKey, string>,
      groupUnread: (n: number) => (n ? `${n} 条未读` : '全部已读'),
      markGroupRead: '全部标为已读',
      selectGroup: (group: string) => `选择「${group}」中的全部通知`,
      selectRow: (title: string) => `选择：${title}`,
      rowMenu: (title: string) => `“${title}”的更多操作`,
      menu: {
        read: '标为已读',
        unread: '标为未读',
        snooze: '稍后提醒',
        mute: '静音此来源',
        muteLocked: '安全通知不能静音',
        remove: '删除',
      },
      snooze: { hour: '1 小时后', tonight: '今晚 20:00', tomorrow: '明天 09:00', monday: '下周一 09:00' } as Record<SnoozeKey, string>,
      mute: { hour: '1 小时', today: '今天', forever: '直到我重新打开' } as Record<MuteKey, string>,
      muted: '已静音',
      urgent: '紧急',
      undo: '撤销',
      reply: { placeholder: (name: string) => `回复 ${name}…`, label: '回复内容', send: '发送', cancel: '取消' },
      bulk: {
        selectAll: '全选',
        selected: (n: number) => `已选 ${n} 条`,
        read: '标为已读',
        snooze: '稍后提醒',
        remove: '删除',
        done: '完成',
      },
      snoozed: (n: number) => `已延后 · ${n}`,
      snoozedUntil: (when: string) => `至 ${when}`,
      unsnooze: '取消延后',
      empty: {
        filteredTitle: '没有符合条件的通知',
        filteredDesc: '换个类型，或者关掉「仅未读」。',
        clear: '清除筛选',
        doneTitle: '全部处理完了',
        doneDesc: '新的通知会出现在这里。',
        showSnoozed: (n: number) => `查看已延后（${n}）`,
      },
      dnd: {
        on: (until: string) => `勿扰中 · 至 ${until}`,
        off: '通知已开启',
        silenced: (n: number) => `已静默 ${n} 条`,
        toggleLabel: '勿扰模式',
      },
      prefs: {
        quiet: '勿扰时段',
        from: '从',
        to: '到',
        days: { daily: '每天', weekdays: '工作日', weekends: '周末' } as Record<DayRule, string>,
        daysLabel: '生效日期',
        bypass: '安全通知可穿透勿扰',
        sources: '接收以下来源',
        sourceLocked: '安全通知不能关闭',
        snoozedSummary: (n: number) => `已延后 ${n} 条`,
        none: '没有延后的通知',
      },
      toastLabel: '通知',
      dismiss: '关闭提示',
      view: '查看',
      newNotice: (from: string) => `新通知 · ${from}`,
      hostOpens: (target: string) => `宿主会打开「${target}」`,
      markedRead: (n: number) => `已将 ${n} 条标为已读`,
      snoozedTo: (n: number, key: SnoozeKey) => `已把 ${n} 条通知${({ hour: '延后 1 小时', tonight: '延后到今晚 20:00', tomorrow: '延后到明天 09:00', monday: '延后到下周一 09:00' } as Record<SnoozeKey, string>)[key]}`,
      mutedSource: (source: string, span: string) => `已静音「${source}」· ${span}`,
      removed: (n: number) => `已删除 ${n} 条通知`,
      undone: '已撤销',
      keysLabel: '快捷键',
      keys: { move: '上下切换', read: '已读', select: '选择' },
      system: 'Tuff',
    }
  : {
      frameTitle: 'Notification center',
      heading: 'Notifications',
      unread: (n: number) => `${n} unread`,
      filtersLabel: 'Filter by type',
      all: 'All',
      unreadOnly: 'Unread only',
      select: 'Select',
      markAllRead: 'Mark all read',
      settings: 'Notification settings',
      feedLabel: 'Notifications',
      groups: { today: 'Today', yesterday: 'Yesterday', earlier: 'Earlier' } as Record<GroupKey, string>,
      groupUnread: (n: number) => (n ? `${n} unread` : 'All read'),
      markGroupRead: 'Mark all as read',
      selectGroup: (group: string) => `Select every notification in ${group}`,
      selectRow: (title: string) => `Select: ${title}`,
      rowMenu: (title: string) => `More actions for “${title}”`,
      menu: {
        read: 'Mark as read',
        unread: 'Mark as unread',
        snooze: 'Remind me later',
        mute: 'Mute this source',
        muteLocked: 'Security notices cannot be muted',
        remove: 'Delete',
      },
      snooze: { hour: 'In 1 hour', tonight: 'Tonight 20:00', tomorrow: 'Tomorrow 09:00', monday: 'Next Monday 09:00' } as Record<SnoozeKey, string>,
      mute: { hour: 'For 1 hour', today: 'For today', forever: 'Until I turn it back on' } as Record<MuteKey, string>,
      muted: 'Muted',
      urgent: 'Urgent',
      undo: 'Undo',
      reply: { placeholder: (name: string) => `Reply to ${name}…`, label: 'Reply', send: 'Send', cancel: 'Cancel' },
      bulk: {
        selectAll: 'Select all',
        selected: (n: number) => `${n} selected`,
        read: 'Mark read',
        snooze: 'Remind me later',
        remove: 'Delete',
        done: 'Done',
      },
      snoozed: (n: number) => `Snoozed · ${n}`,
      snoozedUntil: (when: string) => `until ${when}`,
      unsnooze: 'Unsnooze',
      empty: {
        filteredTitle: 'Nothing matches',
        filteredDesc: 'Pick another type, or turn off Unread only.',
        clear: 'Clear filters',
        doneTitle: 'All caught up',
        doneDesc: 'New notifications will show up here.',
        showSnoozed: (n: number) => `Show snoozed (${n})`,
      },
      dnd: {
        on: (until: string) => `Do not disturb · until ${until}`,
        off: 'Notifications on',
        silenced: (n: number) => `${n} held back`,
        toggleLabel: 'Do not disturb',
      },
      prefs: {
        quiet: 'Quiet hours',
        from: 'From',
        to: 'To',
        days: { daily: 'Every day', weekdays: 'Weekdays', weekends: 'Weekends' } as Record<DayRule, string>,
        daysLabel: 'Applies on',
        bypass: 'Security notices break through',
        sources: 'Receive from',
        sourceLocked: 'Security notices cannot be turned off',
        snoozedSummary: (n: number) => `${n} snoozed`,
        none: 'Nothing snoozed',
      },
      toastLabel: 'Notifications',
      dismiss: 'Dismiss',
      view: 'View',
      newNotice: (from: string) => `New · ${from}`,
      hostOpens: (target: string) => `The host would open ${target}`,
      markedRead: (n: number) => `Marked ${n} as read`,
      snoozedTo: (n: number, key: SnoozeKey) => `Snoozed ${n === 1 ? '1 notification' : `${n} notifications`} ${({ hour: 'for an hour', tonight: 'until 20:00 tonight', tomorrow: 'until 09:00 tomorrow', monday: 'until 09:00 next Monday' } as Record<SnoozeKey, string>)[key]}`,
      mutedSource: (source: string, span: string) => `Muted ${source} · ${span.toLowerCase()}`,
      removed: (n: number) => (n > 1 ? `Deleted ${n} notifications` : 'Deleted 1 notification'),
      undone: 'Undone',
      keysLabel: 'Shortcuts',
      keys: { move: 'move', read: 'read', select: 'select' },
      system: 'Tuff',
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

/* ─── State ───────────────────────────────────────────────────────────── */

const notices = ref<Notice[]>(seedNotices())
const kindFilter = ref<KindFilter>('all')
const unreadOnly = ref(false)
const selecting = ref(false)
const selected = ref<Set<string>>(new Set())
const focusId = ref<string | null>(null)
const replyingId = ref<string | null>(null)
const replyDraft = ref('')
const snoozeOpen = ref<string[]>([])
const settingsOpen = ref(false)
const fresh = ref<Set<string>>(new Set())
const silenced = ref(0)
const muted = reactive<Record<SourceId, MuteKey | null>>({ ci: null, community: null, store: null, updates: null, security: null })
const dnd = reactive({ manual: false, schedule: true, from: '22:00', to: '08:00', days: 'daily' as DayRule, bypass: true, skipWindow: false })
const rootRef = ref<HTMLElement | null>(null)
const feedRef = ref<HTMLElement | null>(null)

const live = computed(() => notices.value.filter(notice => notice.snoozedUntil === null))
const snoozedList = computed(() => notices.value
  .filter(notice => notice.snoozedUntil !== null)
  .sort((a, b) => a.snoozedUntil! - b.snoozedUntil!))

function matchesFilter(notice: Notice): boolean {
  if (kindFilter.value !== 'all' && notice.kind !== kindFilter.value)
    return false
  return !unreadOnly.value || notice.unread
}

const visible = computed(() => live.value.filter(matchesFilter).sort((a, b) => b.at - a.at))
const unreadCount = computed(() => live.value.filter(notice => notice.unread).length)

function dayNumber(ts: number): number {
  return Math.floor((ts + SHANGHAI) / DAY)
}

function groupOf(notice: Notice): GroupKey {
  const days = dayNumber(NOW) - dayNumber(notice.at)
  if (days <= 0)
    return 'today'
  return days === 1 ? 'yesterday' : 'earlier'
}

const groups = computed(() => (['today', 'yesterday', 'earlier'] as GroupKey[])
  .map(key => ({ key, items: visible.value.filter(notice => groupOf(notice) === key) }))
  .filter(group => group.items.length))

const kindItems = computed<FilterChipItem[]>(() => [
  { value: 'all', label: copy.value.all, count: live.value.length },
  ...KINDS.map(kind => ({
    value: kind,
    label: L(KIND_META[kind].label),
    iconClass: KIND_META[kind].icon,
    // From the same list the feed reads, so a chip never promises rows it
    // will not show.
    count: live.value.filter(notice => notice.kind === kind).length,
  })),
])

function onKind(value: FilterChipValue): void {
  kindFilter.value = value as KindFilter
}

function clearFilters(): void {
  kindFilter.value = 'all'
  unreadOnly.value = false
}

/* ─── Do not disturb ──────────────────────────────────────────────────── */

function minutesOf(slot: string): number {
  const [hours, minutes] = slot.split(':').map(Number)
  return (hours ?? 0) * 60 + (minutes ?? 0)
}

// Whether the quiet-hours window covers "now" (Wednesday 10:30). A window
// that ends before it starts runs across midnight.
const inWindow = computed(() => {
  if (!dnd.schedule || dnd.days === 'weekends')
    return false
  const now = 10 * 60 + 30
  const from = minutesOf(dnd.from)
  const to = minutesOf(dnd.to)
  if (from === to)
    return false
  return from < to ? now >= from && now < to : now >= from || now < to
})

const dndActive = computed(() => dnd.manual || (inWindow.value && !dnd.skipWindow))

const dndLabel = computed(() => {
  if (!dndActive.value)
    return copy.value.dnd.off
  return copy.value.dnd.on(dnd.manual ? '11:30' : dnd.to)
})

function toggleDnd(): void {
  if (dndActive.value) {
    dnd.manual = false
    // Turning it off inside the window skips this window, not the schedule.
    dnd.skipWindow = inWindow.value
    return
  }
  dnd.manual = true
  dnd.skipWindow = false
}

watch(() => [dnd.from, dnd.to, dnd.days, dnd.schedule], () => {
  dnd.skipWindow = false
})

const slotOptions = computed<TxSelectOption[]>(() => SLOTS.map(slot => ({ value: slot, label: slot })))

/* ─── Formatting ──────────────────────────────────────────────────────── */

const lang = computed(() => (zh.value ? 'zh-CN' : 'en'))
const timeFormat = computed(() => new Intl.DateTimeFormat(lang.value, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }))
const weekdayTimeFormat = computed(() => new Intl.DateTimeFormat(lang.value, { weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }))
const fullFormat = computed(() => new Intl.DateTimeFormat(lang.value, { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }))

function rowTime(notice: Notice): string {
  return groupOf(notice) === 'earlier' ? weekdayTimeFormat.value.format(notice.at) : timeFormat.value.format(notice.at)
}

function snoozeText(ts: number): string {
  const days = dayNumber(ts) - dayNumber(NOW)
  if (days === 0)
    return zh.value ? `今天 ${timeFormat.value.format(ts)}` : `today ${timeFormat.value.format(ts)}`
  if (days === 1)
    return zh.value ? `明天 ${timeFormat.value.format(ts)}` : `tomorrow ${timeFormat.value.format(ts)}`
  return fullFormat.value.format(ts)
}

function actorName(notice: Notice): string {
  return notice.actor ? L(PEOPLE[notice.actor].name) : copy.value.system
}

function avatarColors(id: PersonId): { bg: string, ink: string } {
  const hue = PEOPLE[id].hue
  return {
    bg: `color-mix(in srgb, ${hue} 20%, var(--tx-bg-color, #fff))`,
    ink: `color-mix(in srgb, ${hue} 78%, var(--tx-text-color-primary, #303133))`,
  }
}

function rowId(id: string): string {
  return `${uid}-notice-${id}`
}

function rowSelector(id: string): string {
  const value = rowId(id)
  return `#${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(value) : value}`
}

/* ─── Toast ───────────────────────────────────────────────────────────── */

interface ToastState {
  open: boolean
  title: string
  text: string
  icon: string
  tone: IconChipTone
  actor: PersonId | null
  action: 'view' | 'undo' | null
}

const toast = reactive<ToastState>({ open: false, title: '', text: '', icon: 'i-carbon-checkmark-outline', tone: 'neutral', actor: null, action: null })
let toastTimer: ReturnType<typeof setTimeout> | undefined
let toastTarget: string | null = null
let undoSnapshot: { notices: Notice[], muted: Record<SourceId, MuteKey | null> } | null = null
// Every toast closes by itself; a pointer or keyboard focus resting on it
// holds it open (it may carry View or Undo), and it re-arms two seconds after
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

function notify(state: Omit<ToastState, 'open'>): void {
  Object.assign(toast, state, { open: true })
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

function snapshot(): { notices: Notice[], muted: Record<SourceId, MuteKey | null> } {
  return { notices: cloneNotices(notices.value), muted: { ...muted } }
}

function withUndo(text: string, icon: string, before: ReturnType<typeof snapshot>): void {
  undoSnapshot = before
  toastTarget = null
  notify({ title: '', text, icon, tone: 'neutral', actor: null, action: 'undo' })
}

function onToastAction(): void {
  if (toast.action === 'undo' && undoSnapshot) {
    notices.value = undoSnapshot.notices
    Object.assign(muted, undoSnapshot.muted)
    undoSnapshot = null
    notify({ title: '', text: copy.value.undone, icon: 'i-carbon-undo', tone: 'neutral', actor: null, action: null })
    return
  }
  if (toast.action === 'view' && toastTarget) {
    const id = toastTarget
    closeToast()
    clearFilters()
    void nextTick(() => {
      if (feedRef.value)
        feedRef.value.scrollTop = 0
      focusRow(id)
    })
  }
}

function hostOpens(notice: Notice): void {
  notify({ title: '', text: copy.value.hostOpens(L(notice.target)), icon: 'i-carbon-launch', tone: 'neutral', actor: null, action: null })
}

/* ─── Row actions ─────────────────────────────────────────────────────── */

function find(id: string): Notice | undefined {
  return notices.value.find(notice => notice.id === id)
}

function onRowClick(notice: Notice): void {
  if (selecting.value) {
    toggleSelected(notice.id)
    return
  }
  notice.unread = false
  hostOpens(notice)
}

function runAction(notice: Notice, action: ActionId): void {
  if (action === 'reply') {
    replyingId.value = notice.id
    replyDraft.value = ''
    // The reader's own click: the field is what they asked for.
    void nextTick(() => rootRef.value?.querySelector<HTMLInputElement>(`${rowSelector(notice.id)} .notice-reply input`)?.focus({ preventScroll: true }))
    return
  }
  notice.unread = false
  if (HOST_ACTIONS.has(action)) {
    hostOpens(notice)
    return
  }
  notice.result = notice.results[action] ?? null
  if (action === 'restart')
    hostOpens(notice)
}

function undoResult(notice: Notice): void {
  notice.result = null
}

function sendReply(notice: Notice): void {
  if (!replyDraft.value.trim())
    return
  notice.unread = false
  notice.result = notice.results.reply ?? REPLIED
  replyingId.value = null
  replyDraft.value = ''
}

function cancelReply(): void {
  replyingId.value = null
  replyDraft.value = ''
}

function onReplyKeydown(event: KeyboardEvent, notice: Notice): void {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault()
    sendReply(notice)
  }
  else if (event.key === 'Escape') {
    // Handled here, so the expanded stage must not collapse on the same press.
    event.preventDefault()
    cancelReply()
    focusRow(notice.id)
  }
}

function setRead(ids: string[], unread: boolean): void {
  const wanted = new Set(ids)
  for (const notice of notices.value) {
    if (wanted.has(notice.id))
      notice.unread = unread
  }
}

function markAllRead(ids = visible.value.filter(notice => notice.unread).map(notice => notice.id)): void {
  if (!ids.length)
    return
  const before = snapshot()
  setRead(ids, false)
  withUndo(copy.value.markedRead(ids.length), 'i-carbon-checkmark-outline', before)
}

function snooze(ids: string[], key: SnoozeKey): void {
  if (!ids.length)
    return
  const before = snapshot()
  const wanted = new Set(ids)
  for (const notice of notices.value) {
    if (wanted.has(notice.id))
      notice.snoozedUntil = SNOOZE[key]
  }
  clearSelection(ids)
  withUndo(copy.value.snoozedTo(ids.length, key), 'i-carbon-snooze', before)
}

function unsnooze(notice: Notice): void {
  notice.snoozedUntil = null
}

function muteSource(source: SourceId, key: MuteKey): void {
  if (source === 'security')
    return
  const before = snapshot()
  muted[source] = key
  withUndo(copy.value.mutedSource(L(SOURCE_META[source].label), copy.value.mute[key]), 'i-carbon-notification-off', before)
}

function setSource(source: SourceId, on: boolean): void {
  if (source !== 'security')
    muted[source] = on ? null : 'forever'
}

function remove(ids: string[]): void {
  if (!ids.length)
    return
  const before = snapshot()
  const doomed = new Set(ids)
  notices.value = notices.value.filter(notice => !doomed.has(notice.id))
  clearSelection(ids)
  withUndo(copy.value.removed(ids.length), 'i-carbon-trash-can', before)
}

/* ─── Selection ───────────────────────────────────────────────────────── */

function toggleSelected(id: string): void {
  const next = new Set(selected.value)
  if (next.has(id))
    next.delete(id)
  else
    next.add(id)
  selected.value = next
}

function clearSelection(ids?: string[]): void {
  if (!ids) {
    selected.value = new Set()
    return
  }
  const next = new Set(selected.value)
  for (const id of ids)
    next.delete(id)
  selected.value = next
}

function startSelecting(): void {
  selecting.value = true
  replyingId.value = null
}

function stopSelecting(): void {
  selecting.value = false
  clearSelection()
}

function groupState(items: Notice[]): { all: boolean, some: boolean } {
  const count = items.filter(notice => selected.value.has(notice.id)).length
  return { all: count > 0 && count === items.length, some: count > 0 && count < items.length }
}

function toggleGroup(items: Notice[]): void {
  const { all } = groupState(items)
  const next = new Set(selected.value)
  for (const notice of items) {
    if (all)
      next.delete(notice.id)
    else
      next.add(notice.id)
  }
  selected.value = next
}

const selectedIds = computed(() => visible.value.filter(notice => selected.value.has(notice.id)).map(notice => notice.id))
const allState = computed(() => groupState(visible.value))

/* ─── Keyboard ────────────────────────────────────────────────────────── */

function isEditable(target: HTMLElement): boolean {
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
    return true
  return target.isContentEditable || Boolean(target.closest('[contenteditable]:not([contenteditable="false"])'))
}

const tabStopId = computed(() => {
  const ids = visible.value.map(notice => notice.id)
  return focusId.value && ids.includes(focusId.value) ? focusId.value : ids[0] ?? null
})

// Scroll only the feed, and only as far as the row needs; the sticky group
// header covers the top of the viewport, so a row has to clear it.
function focusRow(id: string): void {
  const feed = feedRef.value
  const row = feed?.querySelector<HTMLElement>(rowSelector(id))
  if (!feed || !row)
    return
  focusId.value = id
  row.focus({ preventScroll: true })
  const top = row.offsetTop - 36
  const bottom = row.offsetTop + row.offsetHeight + 8
  if (top < feed.scrollTop)
    feed.scrollTop = top
  else if (bottom > feed.scrollTop + feed.clientHeight)
    feed.scrollTop = bottom - feed.clientHeight
}

const MENU_LEAVE_MS = 320
const focusTimers = new Set<ReturnType<typeof setTimeout>>()

function later(ms: number, step: () => void): void {
  const timer = setTimeout(() => {
    focusTimers.delete(timer)
    step()
  }, ms)
  focusTimers.add(timer)
}

function clearFocusTimers(): void {
  for (const timer of focusTimers)
    clearTimeout(timer)
  focusTimers.clear()
  cancelAnimationFrame(settingsFrame)
}

// TxDropdownMenu does not hand focus back. After Esc or a choice, focus is
// still on a row of the leaving (teleported) panel, and it falls to <body>
// once the panel has hidden. Only stranded focus moves — on <body>, or inside
// that panel — as the menu closes and once more after its leave transition;
// focus the reader put elsewhere keeps it.
function afterMenuClose(restore: () => void): void {
  const active = document.activeElement
  const panel = active instanceof HTMLElement ? active.closest('[role="menu"]') : null
  const stranded = (): boolean => {
    const now = document.activeElement
    return !now || now === document.body || Boolean(panel?.contains(now))
  }
  const settle = (): void => {
    if (stranded())
      restore()
  }
  void nextTick(settle)
  later(MENU_LEAVE_MS, settle)
}

function feedRows(): HTMLElement[] {
  return [...(feedRef.value?.querySelectorAll<HTMLElement>('[data-notice]') ?? [])]
}

// Snooze, remove, mute or mark-read (under 仅未读) can take the row out of
// the feed; focus then goes to the row that took its place.
function onRowMenuClose(id: string): void {
  const index = feedRows().findIndex(row => row.dataset.notice === id)
  afterMenuClose(() => {
    const rows = feedRows()
    const row = rows.find(item => item.dataset.notice === id) ?? rows[Math.min(Math.max(index, 0), rows.length - 1)]
    if (row?.dataset.notice)
      focusRow(row.dataset.notice)
  })
}

// Read, Snooze and Remove empty the selection, which disables the button just
// used; focus moves on to the bar's Done button instead of falling to <body>.
function focusBulkDone(): void {
  rootRef.value?.querySelector<HTMLElement>('.notice-bulk__done')?.focus({ preventScroll: true })
}

function onBulkMenuClose(): void {
  afterMenuClose(() => {
    const snooze = rootRef.value?.querySelector<HTMLButtonElement>('.notice-bulk__snooze')
    if (snooze && !snooze.disabled)
      snooze.focus({ preventScroll: true })
    else
      focusBulkDone()
  })
}

function onBulkAction(run: () => void): void {
  run()
  void nextTick(() => {
    const active = document.activeElement
    if (!active || active === document.body || (active instanceof HTMLButtonElement && active.disabled))
      focusBulkDone()
  })
}

/* ─── Settings popover (column and narrow) ───────────────────────────── */

const settingsPanelRef = ref<HTMLElement | null>(null)
let settingsFrame = 0

// Tab stops only: TxFlatRadio's items sit at tabindex -1 behind the group.
function settingsControls(): HTMLElement[] {
  const panel = settingsPanelRef.value
  if (!panel)
    return []
  return [...panel.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')]
    .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0)
}

// The panel is teleported and takes no focus of its own, so a keyboard
// reader could never reach quiet hours or sources. Opening moves focus to its
// first control; the anchor keeps the panel `visibility: hidden` until it has
// been positioned and starts to expand, so that is retried once a frame, and
// dropped if the reader moves focus first. A close that strands focus (Esc,
// a click outside, tabbing out) hands it back to the gear.
watch(settingsOpen, (open) => {
  cancelAnimationFrame(settingsFrame)
  if (open) {
    const opener = document.activeElement
    let frames = 0
    const attempt = (): void => {
      if (document.activeElement !== opener)
        return
      const first = settingsControls()[0]
      if (first && getComputedStyle(first).visibility === 'visible')
        first.focus({ preventScroll: true })
      if (document.activeElement === opener && ++frames < 40)
        settingsFrame = requestAnimationFrame(attempt)
    }
    settingsFrame = requestAnimationFrame(attempt)
    return
  }
  if (!settingsPanelRef.value?.contains(document.activeElement))
    return
  const settle = (): void => {
    const now = document.activeElement
    if (!now || now === document.body || settingsPanelRef.value?.contains(now))
      rootRef.value?.querySelector<HTMLElement>('.notices__settings-trigger')?.focus({ preventScroll: true })
  }
  void nextTick(settle)
  later(MENU_LEAVE_MS, settle)
})

// Tab past either end closes the panel and returns to the gear, instead of
// running on to the end of <body>, where the panel lives.
function onSettingsKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Tab')
    return
  const controls = settingsControls()
  const edge = event.shiftKey ? controls[0] : controls.at(-1)
  if (edge && document.activeElement === edge) {
    event.preventDefault()
    settingsOpen.value = false
  }
}

function onFocusIn(event: FocusEvent): void {
  const row = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-notice]')
  if (row?.dataset.notice)
    focusId.value = row.dataset.notice
}

// Bound to the template root: the shortcuts exist only while focus is inside
// the template, and never while the reader is typing or inside a widget that
// owns its own arrow keys.
function onKeydown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey)
    return
  const target = event.target as HTMLElement | null
  if (!target || isEditable(target))
    return
  if (target.closest('[role="menu"], [role="toolbar"], [role="tablist"], [role="radiogroup"], [role="switch"]'))
    return

  const key = event.key
  if (key === 'Escape' && selecting.value) {
    // Handled here, so the expanded stage must not collapse on the same press.
    event.preventDefault()
    stopSelecting()
    return
  }
  const ids = visible.value.map(notice => notice.id)
  if (!ids.length)
    return
  const rowKey = target.closest<HTMLElement>('[data-notice]')?.dataset.notice ?? null
  const current = rowKey ?? tabStopId.value
  if (key === 'ArrowDown' || key === 'j' || key === 'J' || key === 'ArrowUp' || key === 'k' || key === 'K') {
    event.preventDefault()
    const step = key === 'ArrowDown' || key === 'j' || key === 'J' ? 1 : -1
    const index = current ? ids.indexOf(current) : -1
    const next = ids[rowKey ? Math.min(ids.length - 1, Math.max(0, index + step)) : Math.max(0, index)]
    if (next)
      focusRow(next)
    return
  }
  if (!rowKey)
    return
  const notice = find(rowKey)
  if (!notice)
    return
  if (key === 'e' || key === 'E') {
    event.preventDefault()
    notice.unread = !notice.unread
  }
  else if (key === 'x' || key === 'X') {
    event.preventDefault()
    if (!selecting.value)
      startSelecting()
    toggleSelected(notice.id)
  }
}

/* ─── Arrivals (scripted playback) ───────────────────────────────────── */

const arrivalTimers: ReturnType<typeof setTimeout>[] = []
const freshTimers = new Set<ReturnType<typeof setTimeout>>()
let entered = false

function clearArrivals(): void {
  while (arrivalTimers.length)
    clearTimeout(arrivalTimers.pop())
  for (const id of freshTimers)
    clearTimeout(id)
  freshTimers.clear()
}

function markFresh(id: string): void {
  fresh.value = new Set(fresh.value).add(id)
  const timer = setTimeout(() => {
    freshTimers.delete(timer)
    const next = new Set(fresh.value)
    next.delete(id)
    fresh.value = next
  }, 2400)
  freshTimers.add(timer)
}

function deliver(seed: Seed, animate: boolean): void {
  if (notices.value.some(notice => notice.id === seed.id))
    return
  const feed = feedRef.value
  const scrolled = Boolean(feed && feed.scrollTop > 2)
  notices.value = [toNotice(seed), ...notices.value]
  // A reader who has scrolled away from the top keeps their place: the list
  // grows above the viewport by exactly the new row.
  if (scrolled && feed) {
    void nextTick(() => {
      const row = feed.querySelector<HTMLElement>(rowSelector(seed.id))
      if (row)
        feed.scrollTop += row.offsetHeight + 2
    })
  }
  if (!animate)
    return
  markFresh(seed.id)
  const notice = find(seed.id)!
  const quiet = muted[notice.source] !== null || (dndActive.value && !(notice.urgent && dnd.bypass))
  if (quiet) {
    silenced.value += 1
    return
  }
  toastTarget = notice.id
  undoSnapshot = null
  notify({
    title: copy.value.newNotice(notice.actor ? actorName(notice) : L(SOURCE_META[notice.source].label)),
    text: L(notice.title),
    icon: notice.icon,
    tone: notice.tone,
    actor: notice.actor,
    action: 'view',
  })
}

function startArrivals(): void {
  clearArrivals()
  if (prefersReducedMotion()) {
    for (const arrival of ARRIVALS)
      deliver(arrival.seed, false)
    return
  }
  for (const arrival of ARRIVALS)
    arrivalTimers.push(setTimeout(() => deliver(arrival.seed, true), arrival.delay))
}

function onEnter(): void {
  entered = true
  startArrivals()
}

/* ─── Reset ───────────────────────────────────────────────────────────── */

function resetDemo(): void {
  clearArrivals()
  clearFocusTimers()
  closeToast()
  notices.value = seedNotices()
  kindFilter.value = 'all'
  unreadOnly.value = false
  selecting.value = false
  selected.value = new Set()
  focusId.value = null
  replyingId.value = null
  replyDraft.value = ''
  snoozeOpen.value = []
  settingsOpen.value = false
  fresh.value = new Set()
  silenced.value = 0
  toastTarget = null
  Object.assign(muted, { ci: null, community: null, store: null, updates: null, security: null })
  Object.assign(dnd, { manual: false, schedule: true, from: '22:00', to: '08:00', days: 'daily', bypass: true, skipWindow: false })
  void nextTick(() => {
    if (feedRef.value)
      feedRef.value.scrollTop = 0
  })
  if (entered)
    startArrivals()
}

defineExpose({ resetDemo })

watch(locale, () => resetDemo())

onBeforeUnmount(() => {
  clearArrivals()
  clearFocusTimers()
  clearTimeout(toastTimer)
})
</script>

<template>
  <TemplateFrame :title="copy.frameTitle" :height="580" @enter="onEnter">
    <template #default="{ width: stageW, height: stageH }">
      <StageSize :width="stageW" :height="stageH" @resize="onStageResize" />

      <DefineSettings>
        <div class="notice-prefs">
          <section class="notice-prefs__group">
            <div class="notice-prefs__row">
              <span :id="`${uid}-quiet`" class="notice-prefs__title">{{ copy.prefs.quiet }}</span>
              <TuffSwitch v-model="dnd.schedule" size="small" :aria-labelledby="`${uid}-quiet`" />
            </div>
            <div class="notice-prefs__times" :class="{ 'is-off': !dnd.schedule }">
              <label class="notice-prefs__time">
                <span>{{ copy.prefs.from }}</span>
                <TxSelect v-model="dnd.from" :options="slotOptions" :eager="false" :disabled="!dnd.schedule" />
              </label>
              <label class="notice-prefs__time">
                <span>{{ copy.prefs.to }}</span>
                <TxSelect v-model="dnd.to" :options="slotOptions" :eager="false" :disabled="!dnd.schedule" />
              </label>
            </div>
            <TxFlatRadio v-model="dnd.days" size="sm" :disabled="!dnd.schedule" :aria-label="copy.prefs.daysLabel">
              <TxFlatRadioItem v-for="(label, rule) in copy.prefs.days" :key="rule" :value="rule" :label="label" />
            </TxFlatRadio>
            <div class="notice-prefs__row">
              <span :id="`${uid}-bypass`" class="notice-prefs__text">{{ copy.prefs.bypass }}</span>
              <TuffSwitch v-model="dnd.bypass" size="small" :aria-labelledby="`${uid}-bypass`" />
            </div>
          </section>

          <section class="notice-prefs__group">
            <span class="notice-prefs__title">{{ copy.prefs.sources }}</span>
            <div v-for="source in SOURCES" :key="source" class="notice-prefs__row">
              <TxIconChip :size="22" :tone="SOURCE_META[source].tone" variant="soft">
                <span :class="SOURCE_META[source].icon" />
              </TxIconChip>
              <span :id="`${uid}-source-${source}`" class="notice-prefs__text">{{ L(SOURCE_META[source].label) }}</span>
              <TxTooltip v-if="source === 'security'" :content="copy.prefs.sourceLocked">
                <span class="notice-prefs__locked" tabindex="0" :aria-label="copy.prefs.sourceLocked">
                  <TuffSwitch :model-value="true" size="small" disabled :aria-labelledby="`${uid}-source-${source}`" />
                </span>
              </TxTooltip>
              <TuffSwitch
                v-else
                :model-value="muted[source] === null"
                size="small"
                :aria-labelledby="`${uid}-source-${source}`"
                @update:model-value="setSource(source, $event)"
              />
            </div>
          </section>

          <section class="notice-prefs__group">
            <span class="notice-prefs__title">{{ snoozedList.length ? copy.prefs.snoozedSummary(snoozedList.length) : copy.prefs.none }}</span>
            <span v-for="notice in snoozedList" :key="notice.id" class="notice-prefs__snoozed">
              <span class="i-carbon-snooze" aria-hidden="true" />
              <span class="notice-prefs__snoozed-title">{{ L(notice.title) }}</span>
              <span class="notice-prefs__snoozed-when">{{ snoozeText(notice.snoozedUntil!) }}</span>
            </span>
          </section>
        </div>
      </DefineSettings>

      <div
        ref="rootRef"
        class="notices"
        :class="[`is-${mode}`, { 'is-selecting': selecting }]"
        @keydown="onKeydown"
        @focusin="onFocusIn"
      >
        <header class="notices__head">
          <div class="notices__brand">
            <span class="notices__logo" aria-hidden="true"><span :class="dndActive ? 'i-carbon-notification-off' : 'i-carbon-notification'" /></span>
            <strong class="notices__title">{{ copy.heading }}</strong>
            <TxBadge v-if="unreadCount" variant="primary" :value="unreadCount" :aria-label="copy.unread(unreadCount)" />
          </div>

          <span v-if="mode === 'wide'" class="notices__keys" role="note" :aria-label="copy.keysLabel">
            <span class="notices__key"><TxKbd>J</TxKbd><TxKbd>K</TxKbd>{{ copy.keys.move }}</span>
            <span class="notices__key"><TxKbd>E</TxKbd>{{ copy.keys.read }}</span>
            <span class="notices__key"><TxKbd>X</TxKbd>{{ copy.keys.select }}</span>
          </span>

          <div class="notices__tools">
            <span v-if="silenced && dndActive && mode !== 'narrow'" class="notices__silenced">{{ copy.dnd.silenced(silenced) }}</span>
            <!-- No aria-pressed: the label already names the state, and a pressed
                 toggle has to keep one label (the narrow icon button does). -->
            <TxModeChip
              v-if="mode !== 'narrow'"
              :label="dndLabel"
              :icon="dndActive ? 'i-carbon-notification-off' : 'i-carbon-notification'"
              :tone="dndActive ? 'warning' : 'muted'"
              @click="toggleDnd"
            />
            <TxIconButton
              v-else
              :icon="dndActive ? 'i-carbon-notification-off' : 'i-carbon-notification'"
              size="sm"
              :pressed="dndActive"
              :label="copy.dnd.toggleLabel"
              @click="toggleDnd"
            />
            <template v-if="mode === 'narrow'">
              <TxIconButton icon="i-carbon-list-checked" size="sm" :pressed="selecting" :label="copy.select" @click="selecting ? stopSelecting() : startSelecting()" />
              <TxIconButton icon="i-carbon-checkmark-outline" size="sm" :label="copy.markAllRead" :disabled="!visible.some(notice => notice.unread)" @click="markAllRead()" />
            </template>
            <template v-else>
              <TxButton size="sm" :variant="selecting ? 'primary' : 'secondary'" icon="i-carbon-list-checked" @click="selecting ? stopSelecting() : startSelecting()">
                {{ copy.select }}
              </TxButton>
              <TxButton size="sm" variant="secondary" icon="i-carbon-checkmark-outline" :disabled="!visible.some(notice => notice.unread)" @click="markAllRead()">
                {{ copy.markAllRead }}
              </TxButton>
            </template>
            <TxPopover v-if="mode !== 'wide'" v-model="settingsOpen" placement="bottom-end" :width="320">
              <template #reference>
                <TxIconButton class="notices__settings-trigger" icon="i-carbon-settings" size="sm" :label="copy.settings" />
              </template>
              <div ref="settingsPanelRef" role="group" :aria-label="copy.settings" @keydown="onSettingsKeydown">
                <ReuseSettings />
              </div>
            </TxPopover>
          </div>
        </header>

        <div class="notices__filters">
          <div class="notices__chips">
            <TxFilterChips :model-value="kindFilter" :items="kindItems" :aria-label="copy.filtersLabel" @update:model-value="onKind" />
          </div>
          <TuffSwitch v-model="unreadOnly" size="small" :label="copy.unreadOnly" />
        </div>

        <!-- Arrivals and action results share one card, at the foot of the feed:
             nothing it announces (the filters, the group headers) is under it.
             TxToastPanel fades rather than unmounts, so the wrapper is inert
             while closed. -->
        <div
          class="notices__toast"
          :class="{ 'is-open': toast.open }"
          :inert="toast.open ? undefined : true"
          @mouseenter="holdToast('hover')"
          @mouseleave="releaseToast('hover')"
          @focusin="holdToast('focus')"
          @focusout="onToastFocusOut"
        >
          <TxToastPanel :open="toast.open" :stack="toast.action === 'view' ? 1 : 0" side="above" :tether-length="10" :aria-label="copy.toastLabel">
            <div class="notice-toast">
              <TxAvatar
                v-if="toast.actor"
                :name="L(PEOPLE[toast.actor].name)"
                :size="28"
                :background-color="avatarColors(toast.actor).bg"
                :text-color="avatarColors(toast.actor).ink"
              />
              <TxIconChip v-else-if="toast.title" :size="28" :tone="toast.tone" variant="soft" shape="circle">
                <span :class="toast.icon" />
              </TxIconChip>
              <span v-else class="notice-toast__icon" :class="toast.icon" aria-hidden="true" />
              <span class="notice-toast__text">
                <span v-if="toast.title" class="notice-toast__title">{{ toast.title }}</span>
                <span class="notice-toast__body">{{ toast.text }}</span>
              </span>
              <button v-if="toast.action" type="button" class="notice-toast__action" @click="onToastAction">
                {{ toast.action === 'view' ? copy.view : copy.undo }}
              </button>
              <button type="button" class="notice-toast__close" :aria-label="copy.dismiss" @click="closeToast">
                <span class="i-carbon-close" aria-hidden="true" />
              </button>
            </div>
          </TxToastPanel>
        </div>

        <section class="notices__main">
          <div ref="feedRef" class="notice-feed" role="region" :aria-label="copy.feedLabel">
            <template v-if="groups.length">
              <section v-for="group in groups" :key="group.key" class="notice-group" :aria-labelledby="`${uid}-group-${group.key}`">
                <div class="notice-group__head">
                  <TxCheckbox
                    v-if="selecting"
                    :model-value="groupState(group.items).all"
                    :indeterminate="groupState(group.items).some"
                    :aria-label="copy.selectGroup(copy.groups[group.key])"
                    @update:model-value="toggleGroup(group.items)"
                  />
                  <span :id="`${uid}-group-${group.key}`" class="notice-group__title" role="heading" aria-level="3">{{ copy.groups[group.key] }}</span>
                  <span class="notice-group__count">{{ copy.groupUnread(group.items.filter(notice => notice.unread).length) }}</span>
                  <button
                    v-if="group.items.some(notice => notice.unread)"
                    type="button"
                    class="notice-link notice-group__action"
                    @click="markAllRead(group.items.filter(notice => notice.unread).map(notice => notice.id))"
                  >
                    {{ copy.markGroupRead }}
                  </button>
                </div>

                <TxCardItem
                  v-for="notice in group.items"
                  :id="rowId(notice.id)"
                  :key="notice.id"
                  class="notice-row"
                  :class="{
                    'is-unread': notice.unread,
                    'is-muted': muted[notice.source] !== null,
                    'is-fresh': fresh.has(notice.id),
                  }"
                  role="article"
                  :aria-labelledby="`${rowId(notice.id)}-title`"
                  :aria-describedby="`${rowId(notice.id)}-body`"
                  :data-notice="notice.id"
                  clickable
                  :active="selecting && selected.has(notice.id)"
                  :tabindex="tabStopId === notice.id ? 0 : -1"
                  @click="onRowClick(notice)"
                >
                  <template #avatar>
                    <span class="notice-row__lead">
                      <TxCheckbox
                        v-if="selecting"
                        :model-value="selected.has(notice.id)"
                        :aria-label="copy.selectRow(L(notice.title))"
                        tabindex="-1"
                        @click.stop
                        @update:model-value="toggleSelected(notice.id)"
                      />
                      <template v-else>
                        <TxAvatar
                          v-if="notice.actor"
                          :name="L(PEOPLE[notice.actor].name)"
                          :size="34"
                          :background-color="avatarColors(notice.actor).bg"
                          :text-color="avatarColors(notice.actor).ink"
                        />
                        <TxIconChip v-else :size="34" :tone="notice.tone" variant="soft" shape="circle">
                          <span :class="notice.icon" />
                        </TxIconChip>
                      </template>
                      <span v-if="notice.unread && !selecting" class="notice-row__dot">
                        <TxDotIndicator color="var(--tx-bui-accent, #0285ff)" :size="8" />
                      </span>
                    </span>
                  </template>

                  <template #title>
                    <span :id="`${rowId(notice.id)}-title`" class="notice-row__title">{{ L(notice.title) }}</span>
                  </template>

                  <template #right>
                    <time class="notice-row__time" :datetime="new Date(notice.at).toISOString()">{{ rowTime(notice) }}</time>
                    <span class="notice-row__menu" @click.stop>
                      <TxDropdownMenu placement="bottom-end" :min-width="200" @close="onRowMenuClose(notice.id)">
                        <template #trigger>
                          <!-- In the tab order only on the row that holds focus, so tabbing
                               down the feed is not one stop per row for the menus alone. -->
                          <TxIconButton
                            icon="i-carbon-overflow-menu-horizontal"
                            size="xs"
                            :tabindex="tabStopId === notice.id ? 0 : -1"
                            :label="copy.rowMenu(L(notice.title))"
                          />
                        </template>
                        <TxDropdownItem @select="notice.unread = !notice.unread">
                          <span class="notice-menu-item">
                            <span :class="notice.unread ? 'i-carbon-checkmark-outline' : 'i-carbon-notification-new'" aria-hidden="true" />
                            {{ notice.unread ? copy.menu.read : copy.menu.unread }}
                          </span>
                        </TxDropdownItem>
                        <TxDropdownSubmenu>
                          <span class="notice-menu-item"><span class="i-carbon-snooze" aria-hidden="true" />{{ copy.menu.snooze }}</span>
                          <template #menu>
                            <TxDropdownItem v-for="(label, key) in copy.snooze" :key="key" @select="snooze([notice.id], key)">
                              {{ label }}
                            </TxDropdownItem>
                          </template>
                        </TxDropdownSubmenu>
                        <TxDropdownSubmenu v-if="notice.source !== 'security'">
                          <span class="notice-menu-item"><span class="i-carbon-notification-off" aria-hidden="true" />{{ copy.menu.mute }}</span>
                          <template #menu>
                            <TxDropdownItem v-for="(label, key) in copy.mute" :key="key" @select="muteSource(notice.source, key)">
                              {{ label }}
                            </TxDropdownItem>
                          </template>
                        </TxDropdownSubmenu>
                        <TxDropdownItem v-else disabled>
                          <span class="notice-menu-item"><span class="i-carbon-security" aria-hidden="true" />{{ copy.menu.muteLocked }}</span>
                        </TxDropdownItem>
                        <TxDropdownItem danger @select="remove([notice.id])">
                          <span class="notice-menu-item"><span class="i-carbon-trash-can" aria-hidden="true" />{{ copy.menu.remove }}</span>
                        </TxDropdownItem>
                      </TxDropdownMenu>
                    </span>
                  </template>

                  <template #description>
                    <span :id="`${rowId(notice.id)}-body`" class="notice-row__body">{{ L(notice.body) }}</span>
                    <!-- Controls inside the row keep their own clicks: a click here must
                         not also mark the row read and hand it to the host. -->
                    <span class="notice-row__foot" @click.stop>
                      <TxTag v-if="mode !== 'narrow'" :label="L(KIND_META[notice.kind].label)" :color="KIND_META[notice.kind].color" variant="soft" />
                      <span v-if="notice.urgent" class="notice-row__urgent">
                        <span class="i-carbon-warning-alt" aria-hidden="true" />{{ copy.urgent }}
                      </span>
                      <span v-if="muted[notice.source] !== null" class="notice-row__muted">
                        <span class="i-carbon-notification-off" aria-hidden="true" />{{ copy.muted }}
                      </span>
                      <template v-if="notice.result">
                        <TxStatusBadge size="sm" :text="L(notice.result.text)" :status="notice.result.tone" :icon="notice.result.icon" />
                        <button type="button" class="notice-link" @click="undoResult(notice)">
                          {{ copy.undo }}
                        </button>
                      </template>
                      <template v-else-if="replyingId !== notice.id && !selecting">
                        <TxButton
                          v-for="action in notice.actions"
                          :key="action"
                          size="sm"
                          :variant="ACTION_META[action].variant"
                          :icon="ACTION_META[action].icon"
                          @click="runAction(notice, action)"
                        >
                          {{ L(ACTION_META[action].label) }}
                        </TxButton>
                      </template>
                    </span>
                    <span v-if="replyingId === notice.id" class="notice-reply" @click.stop>
                      <TxInput
                        v-model="replyDraft"
                        :placeholder="copy.reply.placeholder(actorName(notice))"
                        :aria-label="copy.reply.label"
                        @keydown="onReplyKeydown($event, notice)"
                      />
                      <TxButton size="sm" variant="primary" icon="i-carbon-send-alt" :disabled="!replyDraft.trim()" @click="sendReply(notice)">
                        {{ copy.reply.send }}
                      </TxButton>
                      <TxButton size="sm" variant="ghost" @click="cancelReply">
                        {{ copy.reply.cancel }}
                      </TxButton>
                    </span>
                  </template>
                </TxCardItem>
              </section>
            </template>

            <div v-else class="notice-feed__empty">
              <TxEmptyState
                v-if="kindFilter !== 'all' || unreadOnly"
                variant="custom"
                size="small"
                :title="copy.empty.filteredTitle"
                :description="copy.empty.filteredDesc"
                :primary-action="{ label: copy.empty.clear, icon: 'i-carbon-filter-remove' }"
                @primary="clearFilters"
              >
                <template #icon>
                  <span class="notice-empty-icon i-carbon-filter" aria-hidden="true" />
                </template>
              </TxEmptyState>
              <TxEmptyState
                v-else
                variant="custom"
                size="small"
                :title="copy.empty.doneTitle"
                :description="copy.empty.doneDesc"
                :secondary-action="snoozedList.length ? { label: copy.empty.showSnoozed(snoozedList.length) } : undefined"
                @secondary="snoozeOpen = ['snoozed']"
              >
                <template #icon>
                  <span class="notice-empty-icon i-carbon-notification" aria-hidden="true" />
                </template>
              </TxEmptyState>
            </div>

            <TxCollapse v-if="snoozedList.length" v-model="snoozeOpen" class="notice-snoozed">
              <TxCollapseItem name="snoozed" :title="copy.snoozed(snoozedList.length)">
                <div class="notice-snoozed__list">
                  <div v-for="notice in snoozedList" :key="notice.id" class="notice-snoozed__row">
                    <TxIconChip :size="24" :tone="notice.tone" variant="soft" shape="circle">
                      <span :class="notice.icon" />
                    </TxIconChip>
                    <span class="notice-snoozed__text">
                      <span class="notice-snoozed__title">{{ L(notice.title) }}</span>
                      <span class="notice-snoozed__when">{{ copy.snoozedUntil(snoozeText(notice.snoozedUntil!)) }}</span>
                    </span>
                    <TxButton size="sm" variant="ghost" icon="i-carbon-undo" @click="unsnooze(notice)">
                      {{ copy.unsnooze }}
                    </TxButton>
                  </div>
                </div>
              </TxCollapseItem>
            </TxCollapse>
          </div>

          <div v-if="selecting" class="notice-bulk">
            <TxCheckbox
              :model-value="allState.all"
              :indeterminate="allState.some"
              :label="copy.bulk.selectAll"
              @update:model-value="toggleGroup(visible)"
            />
            <span class="notice-bulk__count">{{ copy.bulk.selected(selectedIds.length) }}</span>
            <TxButton size="sm" variant="secondary" icon="i-carbon-checkmark-outline" :disabled="!selectedIds.length" @click="onBulkAction(() => { markAllRead(selectedIds); clearSelection() })">
              {{ copy.bulk.read }}
            </TxButton>
            <TxDropdownMenu placement="top-start" :min-width="180" @close="onBulkMenuClose">
              <template #trigger>
                <TxButton class="notice-bulk__snooze" size="sm" variant="secondary" icon="i-carbon-snooze" :disabled="!selectedIds.length">
                  {{ copy.bulk.snooze }}
                </TxButton>
              </template>
              <TxDropdownItem v-for="(label, key) in copy.snooze" :key="key" @select="snooze(selectedIds, key)">
                {{ label }}
              </TxDropdownItem>
            </TxDropdownMenu>
            <TxButton size="sm" variant="danger" icon="i-carbon-trash-can" :disabled="!selectedIds.length" @click="onBulkAction(() => remove(selectedIds))">
              {{ copy.bulk.remove }}
            </TxButton>
            <TxButton class="notice-bulk__done" size="sm" variant="ghost" @click="stopSelecting">
              {{ copy.bulk.done }}
            </TxButton>
          </div>
        </section>

        <aside v-if="mode === 'wide'" class="notices__settings" :aria-label="copy.settings">
          <strong class="notices__settings-title">{{ copy.settings }}</strong>
          <ReuseSettings />
        </aside>
      </div>
    </template>
  </TemplateFrame>
</template>

<style scoped>
.notices {
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
  padding: 14px 16px 14px;
  background: var(--tx-bg-color, #fff);
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
}

/* Header ---------------------------------------------------------------- */

.notices__head {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  grid-area: head;
}

.notices__brand {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.notices__logo {
  display: inline-flex;
  width: 32px;
  height: 32px;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: color-mix(in srgb, var(--tx-bui-accent, #0285ff) 12%, var(--tx-bg-color, #fff));
  color: var(--tx-bui-accent-ink, #0170dd);
  font-size: 16px;
}

.notices__title {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
}

.notices__keys {
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.notices__key {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.notices__tools {
  display: flex;
  min-width: 0;
  flex: none;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.notices__silenced {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  white-space: nowrap;
}

.notices__filters {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  padding-top: 10px;
  grid-area: filters;
}

.notices__chips {
  min-width: 0;
  flex: 1;
}

/* Feed ------------------------------------------------------------------- */

.notices__main {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  margin-top: 8px;
  overflow: hidden;
  border-radius: 14px;
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  grid-area: main;
}

.notice-feed {
  position: relative;
  min-height: 0;
  flex: 1;
  padding: 0 6px 10px;
  overflow-y: auto;
}

.notice-group__head {
  position: sticky;
  z-index: 2;
  top: 0;
  display: flex;
  min-height: 34px;
  align-items: center;
  gap: 8px;
  margin: 0 -6px 4px;
  padding: 0 14px;
  border-bottom: 1px solid var(--tx-border-color-lighter, #ebeef5);
  background: var(--tx-bg-color, #fff);
}

.notice-group__title {
  font-size: 12px;
  font-weight: 600;
}

.notice-group__count {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.notice-group__action {
  margin-left: auto;
}

.notice-link {
  padding: 3px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--tx-bui-accent-ink, #0170dd);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 500;
}

.notice-link:hover {
  background: var(--tx-bui-accent-tint, #e9f3ff);
}

.notice-link:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

/* Rows paint their own hover on the neutral BUI ramp: TxCardItem's default
   wash is invisible on the dark stage. */
.notice-row {
  --tx-card-item-hover-bg: var(--tx-bui-hover, #f4f5f6);
  --tx-card-item-active-bg: color-mix(in srgb, var(--tx-bui-accent, #0285ff) 9%, var(--tx-bg-color, #fff));

  position: relative;
  margin-bottom: 2px;
  outline: none;
}

.notice-feed .notice-row:focus-visible {
  box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--tx-color-primary, #409eff) 45%, transparent);
}

.notice-row.is-muted {
  opacity: 0.55;
}

.notice-row__lead {
  position: relative;
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
}

.notice-row__dot {
  position: absolute;
  top: -2px;
  left: -3px;
  display: inline-flex;
  border-radius: 999px;
  box-shadow: 0 0 0 2px var(--tx-bg-color, #fff);
}

.notice-row__title {
  font-weight: 500;
}

.notice-row.is-unread .notice-row__title {
  font-weight: 600;
}

.notice-row__time {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.notice-row.is-unread .notice-row__time {
  color: var(--tx-bui-accent-ink, #0170dd);
}

.notice-row__menu {
  display: inline-flex;
  margin: -4px -4px -4px 0;
}

.notice-row__body {
  display: -webkit-box;
  overflow: hidden;
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.notice-row__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.notice-row__foot:empty {
  display: none;
}

.notice-row__urgent,
.notice-row__muted {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  white-space: nowrap;
}

.notice-row__urgent {
  color: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 55%, var(--tx-text-color-primary, #303133));
}

.notice-row__muted {
  color: var(--tx-text-color-secondary, #909399);
}

.notice-reply {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
}

.notice-reply :deep(.tx-input) {
  min-width: 0;
  flex: 1;
}

.notice-menu-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.notice-feed__empty {
  display: flex;
  min-height: 260px;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.notice-empty-icon {
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-size: 28px;
}

.notice-snoozed {
  margin: 10px 6px 0;
}

.notice-snoozed__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notice-snoozed__row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.notice-snoozed__text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.notice-snoozed__title {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notice-snoozed__when {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

/* Bulk bar ---------------------------------------------------------------- */

.notice-bulk {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--tx-border-color-lighter, #ebeef5);
  background: var(--tx-bg-color, #fff);
}

.notice-bulk__count {
  margin-right: 4px;
  color: var(--tx-bui-accent-ink, #0170dd);
  font-size: 12px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.notice-bulk__done {
  margin-left: auto;
}

/* Toast: bottom right of the feed. Placed on the feed's grid area, so an
   absolutely positioned child of the root measures against the feed itself
   (not the stage, which also holds the settings column when expanded) and
   is not clipped by the feed's rounded frame. */

.notices__toast {
  position: absolute;
  z-index: 6;
  right: 12px;
  bottom: 12px;
  width: min(360px, calc(100% - 24px));
  grid-area: main;
  pointer-events: none;
}

/* Above the bulk bar while it is showing. */
.notices.is-selecting .notices__toast {
  bottom: 60px;
}

.notices__toast.is-open {
  pointer-events: auto;
}

.notice-toast {
  display: flex;
  align-items: center;
  gap: 10px;
}

.notice-toast__icon {
  flex: none;
  color: var(--tx-bui-accent, #0285ff);
  font-size: 15px;
}

.notice-toast__text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.notice-toast__title {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.notice-toast__body {
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notice-toast__action,
.notice-toast__close {
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

.notice-toast__action {
  padding: 3px 8px;
  color: var(--tx-bui-accent-ink, #0170dd);
  font-size: 12px;
  font-weight: 500;
}

.notice-toast__action:hover {
  background: var(--tx-bui-accent-tint, #e9f3ff);
}

.notice-toast__close {
  width: 22px;
  height: 22px;
  color: var(--tx-text-color-secondary, #909399);
}

.notice-toast__close:hover {
  background: var(--tx-fill-color-light, #f5f7fa);
}

.notice-toast__action:focus-visible,
.notice-toast__close:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

/* Settings (side column when expanded, popover otherwise) --------------- */

.notices__settings {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  overflow-y: auto;
  border-radius: 14px;
  background: var(--tx-fill-color-lighter, #fafafa);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter, #ebeef5);
  grid-area: settings;
}

.notices__settings-title {
  font-size: 14px;
  font-weight: 600;
}

.notice-prefs {
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-size: 13px;
}

.notice-prefs__group {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.notice-prefs__group + .notice-prefs__group {
  padding-top: 14px;
  border-top: 1px solid var(--tx-border-color-lighter, #ebeef5);
}

.notice-prefs__row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.notice-prefs__row > :last-child {
  margin-left: auto;
}

.notice-prefs__title {
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
  font-weight: 600;
}

.notice-prefs__text {
  min-width: 0;
  overflow: hidden;
  color: var(--tx-text-color-regular, #606266);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notice-prefs__times {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.notice-prefs__times.is-off {
  opacity: 0.55;
}

.notice-prefs__time {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
}

.notice-prefs__time :deep(.tuff-select) {
  width: 104px;
}

.notice-prefs :deep(.tx-flat-radio) {
  width: fit-content;
}

.notice-prefs__locked {
  display: inline-flex;
  border-radius: 999px;
}

.notice-prefs__locked:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 2px;
}

.notice-prefs__snoozed {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
}

.notice-prefs__snoozed-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notice-prefs__snoozed-when {
  flex: none;
  color: var(--tx-text-color-secondary, #909399);
}

/* Motion ----------------------------------------------------------------- */

@media (prefers-reduced-motion: no-preference) {
  .notice-row.is-fresh {
    animation: notice-fresh 2.4s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
  }
}

@keyframes notice-fresh {
  0%,
  30% {
    background: color-mix(in srgb, var(--tx-bui-accent, #0285ff) 11%, transparent);
  }
}

/* Layout ------------------------------------------------------------------ */

/* After the base rules: a container query adds no specificity. */
@container template (max-width: 639px) {
  .notices {
    padding: 12px;
  }

  .notices__head {
    gap: 8px;
  }

  .notices__title {
    font-size: 14px;
  }

  .notices__tools {
    gap: 4px;
  }

  .notices__filters {
    gap: 8px;
  }

  .notices__toast {
    right: 8px;
    bottom: 8px;
    left: 8px;
    width: auto;
  }

  .notices.is-selecting .notices__toast {
    bottom: 96px;
  }
}

@container template (min-width: 960px) {
  .notices {
    justify-content: center;
    column-gap: 20px;
    grid-template-areas:
      'head head'
      'filters settings'
      'main settings';
    grid-template-columns: minmax(0, 760px) 340px;
    padding: 18px 20px 18px;
  }

  .notices__settings {
    margin-top: 10px;
  }
}
</style>
