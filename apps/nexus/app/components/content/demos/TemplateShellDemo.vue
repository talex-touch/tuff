<script setup lang="ts">
// Shell template: the frame a Tuff admin surface hangs off — sidebar
// navigation, a top bar with a page filter, a ⌘K command palette, a
// notification tray and an overview dashboard. Every tuffex part is a
// controlled primitive; the section switch, the activity feed, the plugin list
// and the scripted arrivals are demo state held here.
import type { CommandPaletteItem } from '@talex-touch/tuffex/command-palette'
import type { IconChipTone } from '@talex-touch/tuffex/icon-chip'
import type { SidebarNavItem } from '@talex-touch/tuffex/sidebar-nav'
import type { StatCardInsight } from '@talex-touch/tuffex/stat-card'
import type { StatusTone } from '@talex-touch/tuffex/status-badge'
import type { TimelineItemColor } from '@talex-touch/tuffex/timeline'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

type Section = 'overview' | 'corebox' | 'plugins' | 'clipboard' | 'agents' | 'workflows'
type FeedKind = 'installed' | 'synced' | 'agent' | 'indexed' | 'ran' | 'signin' | 'backup' | 'workflow'
type NoteKey = 'review' | 'installed' | 'workflow' | 'invite' | 'signout' | 'syncPaused' | 'syncResumed'
type PluginStatus = 'running' | 'update' | 'fresh' | 'disabled'

interface FeedEntry {
  id: number
  kind: FeedKind
  /** Age in minutes; 0 reads as "just now". */
  minutes: number
  /** Workflow number, for the entries "New workflow" adds. */
  seq?: number
}

interface PluginRow {
  id: string
  icon: string
  tone: IconChipTone
  version: string
  enabled: boolean
  update: boolean
  fresh: boolean
}

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))

const copy = computed(() => zh.value
  ? {
      title: 'Shell 应用外壳',
      navLabel: '工作区导航',
      switchWorkspace: '切换工作区',
      workspace: { name: 'Tuff Labs', description: '团队工作区 · 5 人', initials: 'T' },
      newWorkflow: '新建工作流',
      addWorkflow: '添加工作流',
      groups: { workspace: '工作区', intelligence: '智能' },
      sections: { overview: '总览', corebox: 'CoreBox', plugins: '插件', clipboard: '剪贴板', agents: '智能体', workflows: '工作流' } as Record<Section, string>,
      synced: '已同步 · 3 台设备',
      paused: '同步已暂停',
      openNav: '打开导航',
      filter: { overview: '筛选动态…', plugins: '筛选插件…', none: '此页无可筛选内容' },
      palette: '命令面板',
      openPalette: '打开命令面板（⌘K）',
      notifications: (n: number) => (n ? `通知，${n} 条未读` : '通知'),
      account: '账户菜单',
      user: { name: '林小满', role: 'Team 套餐 · 管理员' },
      greeting: '早上好，小满。这是 Tuff Labs 今天的概况。',
      stats: {
        launches: '今日启动',
        plugins: '已启用插件',
        latency: '搜索耗时',
        coverage: '索引覆盖',
        coverageMeta: '剩余 2,140 个文件',
      },
      activity: '动态',
      activityEmpty: '没有匹配的动态',
      emptyHint: '换个关键词，或清空筛选。',
      clear: '清空筛选',
      queries: 'CoreBox 查询',
      queriesSub: '今天 · 按小时',
      queriesUnit: '次',
      topQueries: '热门查询',
      services: '服务状态',
      team: '在线成员',
      invite: '邀请成员',
      devices: '设备',
      pluginsSub: (total: number, pending: number) => `${total} 个已安装 · ${pending} 个待处理`,
      pluginEmpty: '没有匹配的插件',
      pluginStatus: { running: '运行中', update: '有更新', fresh: '新安装', disabled: '已停用' } as Record<PluginStatus, string>,
      enable: (name: string) => `启用「${name}」`,
      back: '返回总览',
      latest: '最新通知',
      view: '查看',
      menuPalette: '命令面板',
      menuSync: (paused: boolean) => (paused ? '恢复剪贴板同步' : '暂停剪贴板同步'),
      menuSignOut: '退出登录',
      paletteSearch: '搜索命令、页面或操作…',
      paletteEmpty: '没有匹配的命令',
      paletteKeys: { move: '选择', run: '执行', close: '关闭' },
      ago: (m: number) => (m === 0 ? '刚刚' : m < 60 ? `${m} 分钟前` : `${Math.round(m / 60)} 小时前`),
    }
  : {
      title: 'Shell',
      navLabel: 'Workspace navigation',
      switchWorkspace: 'Switch workspace',
      workspace: { name: 'Tuff Labs', description: 'Team workspace · 5 people', initials: 'T' },
      newWorkflow: 'New workflow',
      addWorkflow: 'Add workflow',
      groups: { workspace: 'Workspace', intelligence: 'Intelligence' },
      sections: { overview: 'Overview', corebox: 'CoreBox', plugins: 'Plugins', clipboard: 'Clipboard', agents: 'Agents', workflows: 'Workflows' } as Record<Section, string>,
      synced: 'Synced · 3 devices',
      paused: 'Sync paused',
      openNav: 'Open navigation',
      filter: { overview: 'Filter activity…', plugins: 'Filter plugins…', none: 'Nothing to filter here' },
      palette: 'Command palette',
      openPalette: 'Open command palette (⌘K)',
      notifications: (n: number) => (n ? `Notifications, ${n} unread` : 'Notifications'),
      account: 'Account menu',
      user: { name: 'Mia Lin', role: 'Team plan · Admin' },
      greeting: 'Good morning, Mia. Here is Tuff Labs today.',
      stats: {
        launches: 'Launches today',
        plugins: 'Active plugins',
        latency: 'Search latency',
        coverage: 'Index coverage',
        coverageMeta: '2,140 files to go',
      },
      activity: 'Activity',
      activityEmpty: 'No matching activity',
      emptyHint: 'Try another word, or clear the filter.',
      clear: 'Clear filter',
      queries: 'CoreBox queries',
      queriesSub: 'Today, by hour',
      queriesUnit: 'queries',
      topQueries: 'Top queries',
      services: 'Services',
      team: 'Online now',
      invite: 'Invite',
      devices: 'Devices',
      pluginsSub: (total: number, pending: number) => `${total} installed · ${pending} need attention`,
      pluginEmpty: 'No matching plugins',
      pluginStatus: { running: 'Running', update: 'Update', fresh: 'New', disabled: 'Off' } as Record<PluginStatus, string>,
      enable: (name: string) => `Enable ${name}`,
      back: 'Back to overview',
      latest: 'Latest notification',
      view: 'View',
      menuPalette: 'Command palette',
      menuSync: (paused: boolean) => (paused ? 'Resume clipboard sync' : 'Pause clipboard sync'),
      menuSignOut: 'Sign out',
      paletteSearch: 'Search commands, pages or actions…',
      paletteEmpty: 'No matching commands',
      paletteKeys: { move: 'Move', run: 'Run', close: 'Close' },
      ago: (m: number) => (m === 0 ? 'Just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`),
    })

// Entry text is looked up at render time rather than stored, so switching the
// docs language re-renders the whole feed instead of leaving old strings in it.
const feedText = computed<Record<FeedKind, (seq?: number) => { title: string, body: string }>>(() => zh.value
  ? {
      installed: () => ({ title: '「翻译」2.4.0 已安装', body: '来自 Nexus 插件市场 · touch-translation' }),
      synced: () => ({ title: '剪贴板已同步到 MacBook Pro', body: '3 条新内容 · 端到端加密' }),
      agent: () => ({ title: '智能体「每日摘要」已完成', body: '汇总了 12 条剪贴板与 3 封邮件，等待确认' }),
      indexed: () => ({ title: '新索引 1,204 个文件', body: '~/Documents 与 ~/Projects' }),
      ran: () => ({ title: '工作流「截图翻译」运行 18 次', body: '由 ⌘ ⇧ T 触发 · 全部成功' }),
      signin: () => ({ title: '在 Windows 台式机上登录', body: 'Windows 11 · 已通过双重验证' }),
      backup: () => ({ title: '设置已备份到 Nexus', body: '42 项偏好 · 自动备份' }),
      workflow: seq => ({ title: `新建「未命名工作流 ${seq}」`, body: '在工作流页设置触发器与步骤' }),
    }
  : {
      installed: () => ({ title: 'Translate 2.4.0 installed', body: 'From the Nexus plugin store · touch-translation' }),
      synced: () => ({ title: 'Clipboard synced to MacBook Pro', body: '3 new items · end-to-end encrypted' }),
      agent: () => ({ title: 'Agent "Daily digest" finished', body: 'Summarised 12 clips and 3 emails, waiting for review' }),
      indexed: () => ({ title: '1,204 files indexed', body: '~/Documents and ~/Projects' }),
      ran: () => ({ title: '"Screenshot translate" ran 18 times', body: 'Triggered by ⌘ ⇧ T · all succeeded' }),
      signin: () => ({ title: 'Signed in on a Windows desktop', body: 'Windows 11 · two-factor verified' }),
      backup: () => ({ title: 'Settings backed up to Nexus', body: '42 preferences · automatic backup' }),
      workflow: seq => ({ title: `Created "Untitled workflow ${seq}"`, body: 'Set its trigger and steps on the Workflows page' }),
    })

const FEED_COLOR: Record<FeedKind, TimelineItemColor> = {
  installed: 'success',
  synced: 'primary',
  agent: 'success',
  indexed: 'default',
  ran: 'primary',
  signin: 'warning',
  backup: 'default',
  workflow: 'primary',
}

const noteText = computed<Record<NoteKey, (seq: number) => { title: string, body: string }>>(() => zh.value
  ? {
      review: () => ({ title: '「每日摘要」等待确认', body: '智能体汇总了 12 条剪贴板与 3 封邮件。' }),
      installed: () => ({ title: '「翻译」2.4.0 已安装', body: '已在 CoreBox 中启用，输入 fy 即可调用。' }),
      workflow: seq => ({ title: `已创建「未命名工作流 ${seq}」`, body: '到工作流页设置触发器与步骤。' }),
      invite: () => ({ title: '邀请链接已生成（演示）', body: '7 天内有效，仅限 Tuff Labs 成员使用。' }),
      signout: () => ({ title: '已退出登录（演示）', body: '模板里的演示操作，刷新页面即可恢复。' }),
      syncPaused: () => ({ title: '剪贴板同步已暂停', body: '新内容只保存在这台设备上。' }),
      syncResumed: () => ({ title: '剪贴板同步已恢复', body: '3 条待同步内容已上传。' }),
    }
  : {
      review: () => ({ title: 'Daily digest needs review', body: 'The agent summarised 12 clips and 3 emails.' }),
      installed: () => ({ title: 'Translate 2.4.0 installed', body: 'Enabled in CoreBox — type fy to call it.' }),
      workflow: seq => ({ title: `Created "Untitled workflow ${seq}"`, body: 'Set its trigger and steps on the Workflows page.' }),
      invite: () => ({ title: 'Invite link created (demo)', body: 'Valid for 7 days, Tuff Labs members only.' }),
      signout: () => ({ title: 'Signed out (demo)', body: 'A demo action — reload the page to undo it.' }),
      syncPaused: () => ({ title: 'Clipboard sync paused', body: 'New clips stay on this device.' }),
      syncResumed: () => ({ title: 'Clipboard sync resumed', body: '3 pending clips uploaded.' }),
    })

const NOTE_STYLE: Record<NoteKey, { icon: string, tone: IconChipTone, target?: Section }> = {
  review: { icon: 'i-carbon-bot', tone: 'accent', target: 'agents' },
  installed: { icon: 'i-carbon-download', tone: 'green', target: 'plugins' },
  workflow: { icon: 'i-carbon-flow', tone: 'accent', target: 'workflows' },
  invite: { icon: 'i-carbon-user-multiple', tone: 'ink' },
  signout: { icon: 'i-carbon-logout', tone: 'neutral' },
  syncPaused: { icon: 'i-carbon-pause', tone: 'orange' },
  syncResumed: { icon: 'i-carbon-play', tone: 'green' },
}

const PLUGIN_NAMES: Record<string, { zh: string, en: string }> = {
  'clipboard-history': { zh: '剪贴板历史', en: 'Clipboard History' },
  'touch-translation': { zh: '翻译', en: 'Translate' },
  'touch-quick-actions': { zh: '快捷动作', en: 'Quick Actions' },
  'touch-browser-open': { zh: '浏览器打开', en: 'Browser Open' },
  'touch-window-presets': { zh: '窗口预设', en: 'Window Presets' },
  'touch-intelligence': { zh: 'Tuff 智能', en: 'Tuff Intelligence' },
  'touch-snippets': { zh: '片段库', en: 'Snippets' },
  'touch-dictation': { zh: '语音听写', en: 'Dictation' },
  'touch-image': { zh: '图片工具', en: 'Image Tools' },
}

function seedPlugins(): PluginRow[] {
  return [
    { id: 'clipboard-history', icon: 'i-carbon-paste', tone: 'accent', version: '1.2.0', enabled: true, update: false, fresh: false },
    { id: 'touch-quick-actions', icon: 'i-carbon-flash', tone: 'orange', version: '1.0.0', enabled: true, update: true, fresh: false },
    { id: 'touch-browser-open', icon: 'i-carbon-launch', tone: 'accent', version: '1.0.4', enabled: true, update: false, fresh: false },
    { id: 'touch-window-presets', icon: 'i-carbon-screen', tone: 'ink', version: '1.0.0', enabled: true, update: true, fresh: false },
    { id: 'touch-intelligence', icon: 'i-carbon-machine-learning-model', tone: 'green', version: '1.2.0', enabled: true, update: false, fresh: false },
    { id: 'touch-snippets', icon: 'i-carbon-code', tone: 'neutral', version: '1.0.0', enabled: true, update: true, fresh: false },
    { id: 'touch-dictation', icon: 'i-carbon-microphone', tone: 'red', version: '1.0.0', enabled: false, update: false, fresh: false },
    { id: 'touch-image', icon: 'i-carbon-image', tone: 'orange', version: '1.0.0', enabled: true, update: false, fresh: false },
  ]
}

function seedFeed(): FeedEntry[] {
  return [
    { id: 1, kind: 'synced', minutes: 8 },
    { id: 2, kind: 'agent', minutes: 21 },
    { id: 3, kind: 'indexed', minutes: 64 },
    { id: 4, kind: 'ran', minutes: 150 },
    { id: 5, kind: 'signin', minutes: 190 },
    { id: 6, kind: 'backup', minutes: 480 },
  ]
}

const LAUNCHES_START = 1284
const LAUNCHES_YESTERDAY = 1187
// Queries per hour, 00:00–24:00: a quiet night, a 10:00 peak and a 15:00 one.
// 25 samples, not 24: the chart spaces its ticks evenly over the time domain,
// and only a 0–24 domain puts five ticks on whole hours (00/06/12/18/24).
const HOURLY = [18, 12, 9, 7, 6, 9, 22, 64, 138, 196, 242, 228, 176, 188, 231, 262, 214, 168, 121, 96, 88, 71, 46, 31, 24]
// Stable objects: an inline literal would be a new prop on every render.
const CHART_PADDING = {
  column: { top: 8, bottom: 4 },
  wide: { top: 16, bottom: 22 },
}
const TOP_QUERIES = [
  { query: 'clip', hits: 412 },
  { query: 'vscode', hits: 208 },
  { query: 'fy hello', hits: 164 },
]
const UNREAD_START = 1

const section = ref<Section>('overview')
const filter = ref('')
const paletteOpen = ref(false)
const navMenuOpen = ref(false)
const userMenuOpen = ref(false)
const plugins = ref<PluginRow[]>(seedPlugins())
const feed = ref<FeedEntry[]>(seedFeed())
const launches = ref(LAUNCHES_START)
const unread = ref(UNREAD_START)
const latestNote = ref<NoteKey>('review')
const syncPaused = ref(false)
const workflowCount = ref(0)
const scrubIndex = ref<number | null>(null)

const toastOpen = ref(false)
const toastKey = ref<NoteKey>('review')
const toastSeq = ref(0)

let feedId = 100

const pluginName = (id: string) => PLUGIN_NAMES[id]?.[zh.value ? 'zh' : 'en'] ?? id
const pendingPlugins = computed(() => plugins.value.filter(p => p.enabled && (p.update || p.fresh)).length)
const enabledPlugins = computed(() => plugins.value.filter(p => p.enabled).length)

const navGroups = computed(() => [
  { key: 'workspace', label: copy.value.groups.workspace },
  { key: 'intelligence', label: copy.value.groups.intelligence },
])

const navItems = computed<SidebarNavItem[]>(() => {
  const label = copy.value.sections
  return [
    { value: 'overview', label: label.overview, group: 'workspace', icon: 'i-carbon-home' },
    { value: 'corebox', label: label.corebox, group: 'workspace', icon: 'i-carbon-search' },
    { value: 'plugins', label: label.plugins, group: 'workspace', icon: 'i-carbon-plug', badge: pendingPlugins.value || undefined },
    { value: 'clipboard', label: label.clipboard, group: 'workspace', icon: 'i-carbon-paste' },
    { value: 'agents', label: label.agents, group: 'intelligence', icon: 'i-carbon-bot', badge: 2 },
    {
      value: 'workflows',
      label: label.workflows,
      group: 'intelligence',
      icon: 'i-carbon-flow',
      badge: workflowCount.value || undefined,
      action: { label: copy.value.addWorkflow },
    },
  ]
})

const crumbs = computed(() => [
  { label: copy.value.workspace.name },
  { label: copy.value.sections[section.value] },
])

const filterable = computed(() => section.value === 'overview' || section.value === 'plugins')
const filterPlaceholder = computed(() => {
  if (section.value === 'overview')
    return copy.value.filter.overview
  if (section.value === 'plugins')
    return copy.value.filter.plugins
  return copy.value.filter.none
})

const needle = computed(() => filter.value.trim().toLowerCase())

const feedRows = computed(() => feed.value
  .map(entry => ({
    ...entry,
    ...feedText.value[entry.kind](entry.seq),
    color: FEED_COLOR[entry.kind],
    time: copy.value.ago(entry.minutes),
  }))
  .filter(row => !needle.value || `${row.title} ${row.body}`.toLowerCase().includes(needle.value)))

function pluginStatus(plugin: PluginRow): PluginStatus {
  if (!plugin.enabled)
    return 'disabled'
  if (plugin.update)
    return 'update'
  return plugin.fresh ? 'fresh' : 'running'
}

const pluginRows = computed(() => plugins.value
  .map((plugin) => {
    const status = pluginStatus(plugin)
    const statusTone: StatusTone = status === 'disabled' ? 'muted' : status === 'running' ? 'success' : 'info'
    return { ...plugin, name: pluginName(plugin.id), status, statusTone }
  })
  .filter(row => !needle.value || `${row.name} ${row.id}`.toLowerCase().includes(needle.value)))

const numberFormat = computed(() => new Intl.NumberFormat(zh.value ? 'zh-CN' : 'en-US'))
const launchesText = computed(() => numberFormat.value.format(launches.value))

const launchesInsight = computed<StatCardInsight>(() => ({
  from: LAUNCHES_YESTERDAY,
  to: launches.value,
  iconClass: 'i-carbon-arrow-up',
}))
const pluginsInsight = computed<StatCardInsight>(() => ({
  from: 5,
  to: enabledPlugins.value,
  type: 'delta',
  iconClass: enabledPlugins.value >= 5 ? 'i-carbon-arrow-up' : 'i-carbon-arrow-down',
}))
// Latency going down is the good direction, so the colour is set explicitly —
// by default the card paints every fall red.
const latencyInsight: StatCardInsight = {
  from: 43,
  to: 38,
  color: 'success',
  iconClass: 'i-carbon-arrow-down',
}

const queriesTotal = computed(() => numberFormat.value.format(HOURLY.reduce((sum, value) => sum + value, 0)))
const hourLabel = (index: number) => `${String(index).padStart(2, '0')}:00`
const querySeries = computed(() => [{
  id: 'queries',
  label: copy.value.queries,
  color: 'var(--tx-bui-accent)',
  data: HOURLY.map((value, index) => ({ time: index, value })),
}])
const scrubRows = computed(() => {
  if (scrubIndex.value === null)
    return []
  return [{
    label: copy.value.queries,
    value: `${HOURLY[scrubIndex.value] ?? 0} ${copy.value.queriesUnit}`,
    color: 'var(--tx-bui-accent)',
  }]
})
const scrubTime = computed(() => (scrubIndex.value === null ? '' : hourLabel(scrubIndex.value)))

const services = computed(() => {
  const t = zh.value
  const sync = syncPaused.value
    ? { detail: t ? '仅本机' : 'This device only', status: t ? '已暂停' : 'Paused', tone: 'warning' as StatusTone }
    : { detail: t ? '3 台设备' : '3 devices', status: t ? '正常' : 'Healthy', tone: 'success' as StatusTone }
  return [
    { id: 'sync', icon: 'i-carbon-paste', name: t ? '剪贴板同步' : 'Clipboard sync', ...sync },
    { id: 'index', icon: 'i-carbon-data-base', name: t ? '文件索引' : 'File index', detail: t ? '1,204 个新文件' : '1,204 new files', status: '82%', tone: 'info' as StatusTone },
    { id: 'nexus', icon: 'i-carbon-cloud', name: t ? 'Nexus 账户' : 'Nexus account', detail: 'tuff.tagzxia.com', status: t ? '已连接' : 'Online', tone: 'success' as StatusTone },
    { id: 'ai', icon: 'i-carbon-machine-learning-model', name: t ? 'AI 网关' : 'AI gateway', detail: t ? '经 Nexus 路由' : 'Routed via Nexus', status: t ? '偏慢' : 'Slow', tone: 'warning' as StatusTone },
  ]
})

const devices = computed(() => {
  const t = zh.value
  return [
    { id: 'mbp', icon: 'i-carbon-laptop', name: 'MacBook Pro', detail: t ? '本机 · 刚刚' : 'This device · just now' },
    { id: 'win', icon: 'i-carbon-screen', name: t ? 'Windows 台式机' : 'Windows desktop', detail: t ? '3 小时前' : '3 h ago' },
    { id: 'mini', icon: 'i-carbon-data-base', name: 'Mac mini', detail: t ? '办公室 · 昨天' : 'Office · yesterday' },
  ]
})

const team = computed(() => (zh.value
  ? ['林小满', '陈凯', '周以宁', 'Sam Rivera', '陈默']
  : ['Mia Lin', 'Kai Chen', 'Zhou Yining', 'Sam Rivera', 'Chen Mo']))
// Same-hue ink on each hue's soft fill: white initials on a solid semantic
// fill do not reach a readable contrast in either theme.
const AVATAR_TINTS = [
  { bg: 'var(--tx-color-primary-light-9)', ink: 'var(--tx-color-primary)' },
  { bg: 'var(--tx-color-success-light-9)', ink: 'var(--tx-color-success)' },
  { bg: 'var(--tx-color-warning-light-9)', ink: 'var(--tx-color-warning)' },
  { bg: 'var(--tx-fill-color)', ink: 'var(--tx-text-color-regular)' },
  { bg: 'var(--tx-color-danger-light-9)', ink: 'var(--tx-color-danger)' },
]
const tint = (index: number) => AVATAR_TINTS[index % AVATAR_TINTS.length]!

const emptyState = computed(() => {
  const t = zh.value
  switch (section.value) {
    case 'corebox':
      return { icon: 'i-carbon-search', title: t ? '查询数据还不够' : 'Not enough queries yet', body: t ? '使用 CoreBox 一周后，这里会出现热门查询与慢查询。' : 'After a week of CoreBox use, top and slow queries show up here.' }
    case 'clipboard':
      return { icon: 'i-carbon-paste', title: t ? '剪贴板历史只保存在本机' : 'Clipboard history stays on this device', body: t ? '在 CoreBox 里按 ⌘ ⇧ V 打开完整历史。' : 'Press ⌘ ⇧ V in CoreBox for the full history.' }
    case 'agents':
      return { icon: 'i-carbon-bot', title: t ? '2 个运行等待确认' : '2 runs need review', body: t ? '智能体的运行记录与审批集中在这里。' : 'Agent runs and approvals collect here.' }
    default:
      return {
        icon: 'i-carbon-flow',
        title: workflowCount.value
          ? (t ? `已有 ${workflowCount.value} 个工作流草稿` : `${workflowCount.value} workflow draft${workflowCount.value > 1 ? 's' : ''}`)
          : (t ? '还没有工作流' : 'No workflows yet'),
        body: t ? '用快捷键、剪贴板或定时来触发一串动作。' : 'Chain actions off a shortcut, the clipboard or a schedule.',
      }
  }
})

const noteView = computed(() => ({
  ...NOTE_STYLE[toastKey.value],
  ...noteText.value[toastKey.value](toastSeq.value),
}))

const commands = computed<CommandPaletteItem[]>(() => {
  const t = zh.value
  const go = (label: string) => (t ? `前往${label}` : `Go to ${label}`)
  const label = copy.value.sections
  return [
    { id: 'go-overview', title: go(label.overview), icon: 'i-carbon-home', shortcut: 'G O', keywords: ['overview', 'home', 'dashboard'] },
    { id: 'go-plugins', title: go(label.plugins), icon: 'i-carbon-plug', shortcut: 'G P', keywords: ['plugins', 'extensions'] },
    { id: 'go-clipboard', title: go(label.clipboard), icon: 'i-carbon-paste', shortcut: 'G C', keywords: ['clipboard', 'history'] },
    { id: 'go-agents', title: go(label.agents), icon: 'i-carbon-bot', shortcut: 'G A', keywords: ['agents', 'ai'] },
    { id: 'new-workflow', title: copy.value.newWorkflow, description: t ? '在动态里记一笔，并给工作流加一个草稿' : 'Adds a draft and logs it in the activity feed', icon: 'i-carbon-add', shortcut: '⌘ N', keywords: ['workflow', 'create'] },
    { id: 'toggle-sync', title: copy.value.menuSync(syncPaused.value), description: t ? '服务状态会同步变化' : 'The Services card follows along', icon: syncPaused.value ? 'i-carbon-play' : 'i-carbon-pause', keywords: ['sync', 'clipboard'] },
    { id: 'invite', title: t ? '邀请成员' : 'Invite a teammate', icon: 'i-carbon-user-multiple', keywords: ['team', 'invite', 'member'] },
    { id: 'settings', title: t ? '工作区设置' : 'Workspace settings', description: t ? '需要所有者权限' : 'Owner permission required', icon: 'i-carbon-settings', disabled: true, keywords: ['settings'] },
  ]
})

/* ─── timers ─── */

const autoplayTimers = new Set<ReturnType<typeof setTimeout>>()
let toastTimer: ReturnType<typeof setTimeout> | undefined
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

/* ─── actions ─── */

function showNote(key: NoteKey, options: { seq?: number, autoClose?: boolean } = {}) {
  toastKey.value = key
  toastSeq.value = options.seq ?? 0
  toastOpen.value = true
  clearTimeout(toastTimer)
  if (options.autoClose !== false) {
    toastTimer = setTimeout(() => {
      toastOpen.value = false
    }, 3200)
  }
}

function toggleNotifications() {
  clearTimeout(toastTimer)
  if (toastOpen.value) {
    toastOpen.value = false
    return
  }
  unread.value = 0
  showNote(latestNote.value, { autoClose: false })
}

function goTo(next: Section) {
  section.value = next
  toastOpen.value = false
}

function installTranslate() {
  if (plugins.value.some(p => p.id === 'touch-translation'))
    return
  plugins.value = [
    { id: 'touch-translation', icon: 'i-carbon-translate', tone: 'green', version: '2.4.0', enabled: true, update: false, fresh: true },
    ...plugins.value,
  ]
  feed.value = [{ id: ++feedId, kind: 'installed', minutes: 0 }, ...feed.value]
}

function createWorkflow() {
  workflowCount.value += 1
  feed.value = [{ id: ++feedId, kind: 'workflow', minutes: 0, seq: workflowCount.value }, ...feed.value]
  showNote('workflow', { seq: workflowCount.value })
}

function onItemAction(item: SidebarNavItem) {
  if (item.value === 'workflows')
    createWorkflow()
}

function toggleSync() {
  syncPaused.value = !syncPaused.value
  showNote(syncPaused.value ? 'syncPaused' : 'syncResumed')
}

const COMMAND_SECTIONS: Record<string, Section> = {
  'go-overview': 'overview',
  'go-plugins': 'plugins',
  'go-clipboard': 'clipboard',
  'go-agents': 'agents',
}

function onCommand(item: CommandPaletteItem) {
  const target = COMMAND_SECTIONS[item.id]
  if (target)
    goTo(target)
  else if (item.id === 'new-workflow')
    createWorkflow()
  else if (item.id === 'toggle-sync')
    toggleSync()
  else if (item.id === 'invite')
    showNote('invite')
}

function onCrumb(_item: unknown, index: number) {
  if (index === 0)
    goTo('overview')
}

function openPalette() {
  userMenuOpen.value = false
  paletteOpen.value = true
}

function setPluginEnabled(id: string, enabled: boolean) {
  plugins.value = plugins.value.map(p => (p.id === id ? { ...p, enabled } : p))
}

/* ─── scripted arrivals ─── */

function stopAutoplay() {
  if (autoplaying)
    clearAutoplay()
}

function applyFinalState() {
  installTranslate()
  unread.value = UNREAD_START + 1
  latestNote.value = 'installed'
  launches.value = LAUNCHES_START + 7
}

function play() {
  clearAutoplay()
  if (prefersReducedMotion()) {
    applyFinalState()
    return
  }
  autoplaying = true
  schedule(800, installTranslate)
  schedule(1400, () => {
    unread.value += 1
    latestNote.value = 'installed'
    showNote('installed')
  })
  schedule(2000, () => {
    launches.value = LAUNCHES_START + 7
    autoplaying = false
  })
}

function onEnter() {
  entered = true
  play()
}

function resetDemo() {
  clearAutoplay()
  clearTimeout(toastTimer)
  section.value = 'overview'
  filter.value = ''
  paletteOpen.value = false
  navMenuOpen.value = false
  userMenuOpen.value = false
  toastOpen.value = false
  plugins.value = seedPlugins()
  feed.value = seedFeed()
  launches.value = LAUNCHES_START
  unread.value = UNREAD_START
  latestNote.value = 'review'
  syncPaused.value = false
  workflowCount.value = 0
  scrubIndex.value = null
  if (entered)
    play()
}

function onKeydown(event: KeyboardEvent) {
  stopAutoplay()
  // Bound to this root, not window: the docs site owns ⌘K / Ctrl+K on window
  // for its own search, and skips a press a handler before it has claimed.
  if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    openPalette()
  }
}

watch(section, () => {
  filter.value = ''
})
watch(locale, resetDemo)

onBeforeUnmount(() => {
  clearAutoplay()
  clearTimeout(toastTimer)
})

defineExpose({ resetDemo })
</script>

<template>
  <TemplateFrame :title="copy.title" :height="580" @enter="onEnter">
    <template #default="{ width }">
      <div class="shell" @keydown="onKeydown" @pointerdown="stopAutoplay">
        <TxSidebarNav
          class="shell__sidebar"
          :model-value="section"
          :items="navItems"
          :groups="navGroups"
          :workspace="copy.workspace"
          :workspace-label="copy.switchWorkspace"
          :action-label="copy.newWorkflow"
          :aria-label="copy.navLabel"
          @update:model-value="goTo($event as Section)"
          @action="createWorkflow"
          @item-action="onItemAction"
        >
          <template #footer>
            <div class="shell__sync" :class="{ 'is-paused': syncPaused }">
              <span class="shell__sync-dot" aria-hidden="true" />
              {{ syncPaused ? copy.paused : copy.synced }}
            </div>
          </template>
        </TxSidebarNav>

        <div class="shell__main">
          <header class="shell__topbar">
            <div class="shell__burger">
              <TxDropdownMenu v-model="navMenuOpen" placement="bottom-start" :min-width="200">
                <template #trigger>
                  <TxIconButton icon="i-carbon-menu" size="sm" :label="copy.openNav" />
                </template>
                <TxDropdownItem v-for="item in navItems" :key="item.value" @select="goTo(item.value as Section)">
                  <span class="shell__menu-row">
                    <i :class="item.icon" aria-hidden="true" />
                    {{ item.label }}
                  </span>
                  <template v-if="item.badge" #right>
                    <span class="shell__menu-count">{{ item.badge }}</span>
                  </template>
                </TxDropdownItem>
              </TxDropdownMenu>
            </div>

            <TxBreadcrumb class="shell__crumbs" :items="crumbs" @click="onCrumb" />

            <div class="shell__tools">
              <div class="shell__filter">
                <TxSearchInput v-model="filter" :placeholder="filterPlaceholder" :disabled="!filterable" />
              </div>
              <TxTooltip :content="copy.palette">
                <button type="button" class="shell__palette" :aria-label="copy.openPalette" @click="openPalette">
                  <TxKbd>⌘K</TxKbd>
                </button>
              </TxTooltip>
              <div class="shell__bell">
                <TxIconButton
                  icon="i-carbon-notification"
                  size="sm"
                  :label="copy.notifications(unread)"
                  :pressed="toastOpen"
                  @click="toggleNotifications"
                />
                <TxBadge class="shell__bell-count" variant="error" :value="unread" :open="unread > 0" aria-hidden="true" />
              </div>
              <TxDropdownMenu v-model="userMenuOpen" placement="bottom-end" :min-width="232">
                <template #trigger>
                  <button type="button" class="shell__user" :aria-label="copy.account">
                    <TxAvatar :name="copy.user.name" size="small" status="online" :background-color="tint(0).bg" :text-color="tint(0).ink" />
                  </button>
                </template>
                <div class="shell__who">
                  <strong>{{ copy.user.name }}</strong>
                  <span>{{ copy.user.role }}</span>
                </div>
                <TxDropdownItem @select="openPalette">
                  <span class="shell__menu-row"><i class="i-carbon-search" aria-hidden="true" />{{ copy.menuPalette }}</span>
                  <template #right>
                    <TxKbd>⌘K</TxKbd>
                  </template>
                </TxDropdownItem>
                <TxDropdownItem @select="toggleSync">
                  <span class="shell__menu-row">
                    <i :class="syncPaused ? 'i-carbon-play' : 'i-carbon-pause'" aria-hidden="true" />
                    {{ copy.menuSync(syncPaused) }}
                  </span>
                </TxDropdownItem>
                <TxDropdownItem danger @select="showNote('signout')">
                  <span class="shell__menu-row"><i class="i-carbon-logout" aria-hidden="true" />{{ copy.menuSignOut }}</span>
                </TxDropdownItem>
              </TxDropdownMenu>
            </div>

            <!-- The tray keeps its box while closed (TxToastPanel fades rather
                 than unmounts), so it is inert until it opens. -->
            <div class="shell__toast" :class="{ 'is-open': toastOpen }" :inert="toastOpen ? undefined : true">
              <TxToastPanel :open="toastOpen" :stack="unread > 0 ? 1 : 0" :aria-label="copy.latest">
                <template #tether>
                  <span class="shell__tether" aria-hidden="true" />
                </template>
                <div class="shell__note">
                  <TxIconChip :size="30" :radius="9" :tone="noteView.tone" variant="soft">
                    <i :class="noteView.icon" />
                  </TxIconChip>
                  <div class="shell__note-text">
                    <strong>{{ noteView.title }}</strong>
                    <span>{{ noteView.body }}</span>
                  </div>
                  <TxButton v-if="noteView.target" size="sm" variant="secondary" @click="goTo(noteView.target)">
                    {{ copy.view }}
                  </TxButton>
                </div>
              </TxToastPanel>
            </div>
          </header>

          <div class="shell__scroll">
            <!-- One grid whose areas move with the container width: each card
                 is written once and only its placement changes. -->
            <div v-if="section === 'overview'" class="shell__overview">
              <div class="shell__head">
                <h2>{{ copy.sections.overview }}</h2>
                <p>{{ copy.greeting }}</p>
              </div>

              <div class="shell__stats">
                <TxStatCard
                  class="shell__stat"
                  :value="launches"
                  :label="copy.stats.launches"
                  icon-class="i-carbon-rocket text-[var(--tx-color-primary)]"
                  :insight="launchesInsight"
                >
                  <template #value>
                    <TxTextMorph :text="launchesText" />
                  </template>
                </TxStatCard>
                <TxStatCard
                  class="shell__stat"
                  :value="enabledPlugins"
                  :label="copy.stats.plugins"
                  icon-class="i-carbon-plug text-[var(--tx-color-success)]"
                  :insight="pluginsInsight"
                />
                <TxStatCard
                  class="shell__stat"
                  value="38 ms"
                  :label="copy.stats.latency"
                  icon-class="i-carbon-meter text-[var(--tx-color-warning)]"
                  :insight="latencyInsight"
                />
                <TxStatCard
                  class="shell__stat shell__stat--extra"
                  value="82%"
                  :label="copy.stats.coverage"
                  variant="progress"
                  :progress="82"
                  :meta="copy.stats.coverageMeta"
                  icon-class="i-carbon-data-base"
                />
              </div>

              <section class="shell__card shell__activity" :aria-label="copy.activity">
                <header class="shell__card-head">
                  <h3>{{ copy.activity }}</h3>
                  <span class="shell__card-meta">{{ feedRows.length }}</span>
                </header>
                <div class="shell__feed">
                  <TxTimeline v-if="feedRows.length">
                    <TransitionGroup name="shell-feed">
                      <TxTimelineItem
                        v-for="row in feedRows"
                        :key="row.id"
                        :title="row.title"
                        :time="row.time"
                        :color="row.color"
                      >
                        {{ row.body }}
                      </TxTimelineItem>
                    </TransitionGroup>
                  </TxTimeline>
                  <TxSearchEmpty
                    v-else
                    size="small"
                    :title="copy.activityEmpty"
                    :description="copy.emptyHint"
                    :primary-action="{ label: copy.clear, variant: 'secondary', size: 'sm' }"
                    @primary="filter = ''"
                  >
                    <template #icon>
                      <i class="i-carbon-search shell__empty-icon" aria-hidden="true" />
                    </template>
                  </TxSearchEmpty>
                </div>
              </section>

              <section class="shell__card shell__traffic" :aria-label="copy.queries">
                <header class="shell__card-head">
                  <div>
                    <h3>{{ copy.queries }}</h3>
                    <span class="shell__card-meta">{{ copy.queriesSub }}</span>
                  </div>
                  <strong class="shell__figure">{{ queriesTotal }}</strong>
                </header>
                <TxChartScrubber
                  class="shell__chart"
                  :point-count="HOURLY.length"
                  :active-index="scrubIndex"
                  :rows="scrubRows"
                  :time-label="scrubTime"
                  @update:active-index="scrubIndex = $event"
                >
                  <TxSparkChart
                    :series="querySeries"
                    :active-index="scrubIndex"
                    :aria-label="`${copy.queries} · ${copy.queriesSub}`"
                    :grid="width >= 960"
                    :x-axis="width >= 960"
                    :x-ticks="5"
                    :x-tick-format="hourLabel"
                    :padding="width >= 960 ? CHART_PADDING.wide : CHART_PADDING.column"
                  />
                </TxChartScrubber>
                <ol class="shell__top">
                  <li v-for="(row, index) in TOP_QUERIES" :key="row.query">
                    <span class="shell__top-rank">{{ index + 1 }}</span>
                    <code>{{ row.query }}</code>
                    <span class="shell__top-hits">{{ numberFormat.format(row.hits) }}</span>
                  </li>
                </ol>
              </section>

              <!-- In the column this wrapper dissolves (display: contents) and
                   its cards take their own grid areas; wide, it is the rail. -->
              <div class="shell__rail">
                <section class="shell__card shell__team" :aria-label="copy.team">
                  <header class="shell__card-head">
                    <h3>{{ copy.team }}</h3>
                    <span class="shell__card-meta">3 / {{ team.length }}</span>
                  </header>
                  <div class="shell__team-row">
                    <TxAvatarGroup :max="4" size="small">
                      <TxAvatar
                        v-for="(name, index) in team"
                        :key="name"
                        :name="name"
                        :status="index < 3 ? 'online' : 'away'"
                        :background-color="tint(index).bg"
                        :text-color="tint(index).ink"
                      />
                    </TxAvatarGroup>
                    <TxButton size="sm" variant="secondary" icon="i-carbon-user-multiple" @click="showNote('invite')">
                      {{ copy.invite }}
                    </TxButton>
                  </div>
                </section>

                <section class="shell__card shell__services" :aria-label="copy.services">
                  <header class="shell__card-head">
                    <h3>{{ copy.services }}</h3>
                  </header>
                  <ul class="shell__list">
                    <li v-for="service in services" :key="service.id" class="shell__row">
                      <i :class="service.icon" class="shell__row-icon" aria-hidden="true" />
                      <span class="shell__row-text">
                        <span class="shell__row-name">{{ service.name }}</span>
                        <span class="shell__row-detail">{{ service.detail }}</span>
                      </span>
                      <TxStatusBadge :text="service.status" :status="service.tone" size="sm" />
                    </li>
                  </ul>
                </section>

                <section class="shell__card shell__devices" :aria-label="copy.devices">
                  <header class="shell__card-head">
                    <h3>{{ copy.devices }}</h3>
                  </header>
                  <ul class="shell__list">
                    <li v-for="device in devices" :key="device.id" class="shell__row">
                      <i :class="device.icon" class="shell__row-icon" aria-hidden="true" />
                      <span class="shell__row-text">
                        <span class="shell__row-name">{{ device.name }}</span>
                        <span class="shell__row-detail">{{ device.detail }}</span>
                      </span>
                    </li>
                  </ul>
                </section>
              </div>
            </div>

            <div v-else-if="section === 'plugins'" class="shell__page">
              <div class="shell__head">
                <h2>{{ copy.sections.plugins }}</h2>
                <p>{{ copy.pluginsSub(plugins.length, pendingPlugins) }}</p>
              </div>
              <ul v-if="pluginRows.length" class="shell__plugins">
                <li v-for="plugin in pluginRows" :key="plugin.id" class="shell__plugin" :class="{ 'is-off': !plugin.enabled }">
                  <TxIconChip :size="32" :radius="9" :tone="plugin.tone" variant="soft">
                    <i :class="plugin.icon" />
                  </TxIconChip>
                  <span class="shell__plugin-text">
                    <span class="shell__plugin-name">{{ plugin.name }}</span>
                    <span class="shell__plugin-id">{{ plugin.id }}</span>
                  </span>
                  <span class="shell__plugin-meta">
                    <TxTag :label="`v${plugin.version}`" size="sm" variant="soft" color="var(--tx-text-color-secondary)" />
                    <TxStatusBadge :text="copy.pluginStatus[plugin.status]" :status="plugin.statusTone" size="sm" />
                  </span>
                  <TuffSwitch
                    :model-value="plugin.enabled"
                    size="small"
                    :aria-label="copy.enable(plugin.name)"
                    @update:model-value="setPluginEnabled(plugin.id, $event)"
                  />
                </li>
              </ul>
              <TxSearchEmpty
                v-else
                size="small"
                :title="copy.pluginEmpty"
                :description="copy.emptyHint"
                :primary-action="{ label: copy.clear, variant: 'secondary', size: 'sm' }"
                @primary="filter = ''"
              >
                <template #icon>
                  <i class="i-carbon-plug shell__empty-icon" aria-hidden="true" />
                </template>
              </TxSearchEmpty>
            </div>

            <div v-else class="shell__page shell__page--empty">
              <TxEmptyState
                :title="emptyState.title"
                :description="emptyState.body"
                :primary-action="section === 'workflows'
                  ? { label: copy.newWorkflow, variant: 'primary', size: 'sm', icon: 'i-carbon-add' }
                  : { label: copy.back, variant: 'secondary', size: 'sm' }"
                @primary="section === 'workflows' ? createWorkflow() : goTo('overview')"
              >
                <!-- A static glyph: the built-in illustrations loop forever and
                     have no reduced-motion stop. -->
                <template #icon>
                  <span class="shell__empty-plate" aria-hidden="true">
                    <i :class="emptyState.icon" />
                  </span>
                </template>
              </TxEmptyState>
            </div>
          </div>
        </div>

        <TxCommandPalette
          v-model="paletteOpen"
          :commands="commands"
          :placeholder="copy.paletteSearch"
          :empty-text="copy.paletteEmpty"
          :aria-label="copy.palette"
          @select="onCommand"
        >
          <template #footer>
            <div class="shell__palette-foot">
              <span><TxKbd>↑</TxKbd><TxKbd>↓</TxKbd>{{ copy.paletteKeys.move }}</span>
              <span><TxKbd>↵</TxKbd>{{ copy.paletteKeys.run }}</span>
              <span><TxKbd>Esc</TxKbd>{{ copy.paletteKeys.close }}</span>
            </div>
          </template>
        </TxCommandPalette>
      </div>
    </template>
  </TemplateFrame>
</template>

<style scoped>
.shell {
  --shell-line: var(--tx-border-color-lighter, #ebeef5);
  --shell-card: var(--tx-bg-color, #ffffff);
  /* The content canvas sits one step below the cards so they read as objects
     on a surface without a shadow each. */
  --shell-canvas: color-mix(in srgb, var(--tx-bg-color-page, #f2f3f5) 70%, var(--tx-bg-color, #ffffff));

  display: flex;
  height: 100%;
  min-width: 0;
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
}

/* ─── sidebar ─── */

/* The BUI card chrome (radius, raised shadow) comes off: the sidebar is a
   column of the frame, not a card sitting inside it. */
.shell__sidebar {
  --tx-bui-sidebar-nav-width: 200px;

  display: flex;
  flex: none;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  border-radius: 0;
  background: var(--tx-bg-color, #ffffff);
  box-shadow: inset -1px 0 0 var(--shell-line);
}

.shell__sync {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  padding: 10px 8px 2px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.shell__sync-dot {
  width: 7px;
  height: 7px;
  flex: none;
  border-radius: 50%;
  background: var(--tx-color-success, #67c23a);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tx-color-success, #67c23a) 18%, transparent);
}

.shell__sync.is-paused .shell__sync-dot {
  background: var(--tx-color-warning, #e6a23c);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--tx-color-warning, #e6a23c) 18%, transparent);
}

/* ─── top bar ─── */

.shell__main {
  position: relative;
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  background: var(--shell-canvas);
}

.shell__topbar {
  --shell-topbar-end: 12px;

  position: relative;
  z-index: 2;
  display: flex;
  height: 52px;
  flex: none;
  align-items: center;
  gap: 8px;
  padding: 0 var(--shell-topbar-end) 0 16px;
  background: var(--tx-bg-color, #ffffff);
  box-shadow: inset 0 -1px 0 var(--shell-line);
}

.shell__burger {
  display: none;
}

.shell__crumbs {
  min-width: 0;
  margin-left: -8px;
}

.shell__crumbs :deep(.tx-breadcrumb__link) {
  font-size: 13px;
  white-space: nowrap;
}

.shell__tools {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.shell__filter {
  width: 188px;
  margin-right: 2px;
}

.shell__palette {
  display: inline-flex;
  align-items: center;
  padding: 3px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
}

.shell__palette:focus-visible,
.shell__user:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

.shell__bell {
  position: relative;
  display: inline-flex;
}

.shell__bell :deep(.tx-icon-button__icon) {
  font-size: 17px;
}

/* The count rides the bell's corner. The badge is a soft pill, so it gets an
   opaque base or the glyph under it would show through. */
.shell__bell .shell__bell-count {
  --tx-badge-bg: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 16%, var(--tx-bg-color, #ffffff));

  position: absolute;
  top: -2px;
  right: -3px;
  min-width: 16px;
  padding: 1px 4px;
  font-size: 10.5px;
  font-weight: 600;
  pointer-events: none;
}

.shell__user {
  display: inline-flex;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
}

/* Rendered in the menu panel, which teleports out from under .shell, so the
   --shell-* aliases do not reach it: tokens only. */
.shell__who {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 10px 10px;
  margin-bottom: 2px;
  box-shadow: inset 0 -1px 0 var(--tx-border-color-lighter, #ebeef5);
}

.shell__who strong {
  font-size: 13px;
  font-weight: 600;
}

.shell__who span {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.shell__menu-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.shell__menu-row i {
  font-size: 15px;
  opacity: 0.8;
}

.shell__menu-count {
  min-width: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--tx-color-primary-light-9, #ecf5ff);
  color: var(--tx-color-primary, #409eff);
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  text-align: center;
}

/* ─── notification tray ─── */

/* Right edge flush with the bar's padding, so the tether below lands on the
   bell's centre at every width: 32px avatar + 6px gap + half the 32px bell.
   The top clears the bell's bottom edge whatever the bar's height. */
.shell__toast {
  position: absolute;
  top: calc(50% + 18px);
  right: var(--shell-topbar-end);
  width: 300px;
  pointer-events: none;
}

.shell__toast.is-open {
  pointer-events: auto;
}

.shell__tether {
  width: 0;
  height: 14px;
  flex: none;
  align-self: flex-end;
  margin-right: 53px;
  border-left: 1px dashed var(--tx-border-color, #dcdfe6);
}

.shell__note {
  display: flex;
  align-items: center;
  gap: 10px;
}

.shell__note-text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.shell__note-text strong {
  font-size: 13px;
  font-weight: 500;
}

.shell__note-text span {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  line-height: 1.45;
}

/* ─── overview grid ─── */

.shell__scroll {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
}

.shell__overview {
  display: grid;
  min-height: 100%;
  box-sizing: border-box;
  grid-template-areas:
    'stats stats'
    'activity traffic'
    'activity services';
  grid-template-columns: minmax(0, 1.12fr) minmax(0, 1fr);
  grid-template-rows: auto auto 1fr;
  align-content: start;
  gap: 12px;
  padding: 16px;
}

/* The breadcrumb already names the page in the column; the greeting only
   earns its row when there is width to spare. */
.shell__overview > .shell__head {
  display: none;
}

.shell__head {
  grid-area: head;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.shell__head h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
}

.shell__head p {
  margin: 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.shell__stats {
  grid-area: stats;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.shell__stats .shell__stat {
  --fake-opacity: 1;

  min-height: 104px;
  padding: 14px;
  border-radius: 14px;
}

.shell__stats .shell__stat--extra {
  display: none;
}

.shell__card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  border-radius: 14px;
  background: var(--shell-card);
  box-shadow: 0 0 0 1px var(--shell-line);
}

.shell__card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.shell__card-head h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.shell__card-meta {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.shell__activity {
  grid-area: activity;
}

.shell__traffic {
  grid-area: traffic;
}

.shell__rail {
  display: contents;
}

.shell__services {
  grid-area: services;
}

.shell__team,
.shell__devices {
  display: none;
}

/* Size containment: the feed scrolls inside whatever height the grid gives
   the card, instead of its entries stretching the rows it spans. */
.shell__feed {
  min-height: 0;
  flex: 1 1 0;
  margin-right: -6px;
  padding-right: 6px;
  overflow-y: auto;
  contain: size;
}

/* Timeline, compacted for a card: tighter rhythm, a hairline rail and dots
   ringed in the card colour instead of the component's fixed white. */
.shell__feed :deep(.tx-timeline--vertical) {
  padding-left: 22px;
}

.shell__feed :deep(.tx-timeline-item--vertical) {
  padding-bottom: 14px;
}

.shell__feed :deep(.tx-timeline-item--vertical:last-child) {
  padding-bottom: 0;
}

.shell__feed :deep(.tx-timeline-item--vertical::before) {
  top: 9px;
  bottom: -10px;
  left: -16px;
  width: 1px;
  background: var(--shell-line);
}

.shell__feed :deep(.tx-timeline-item__dot) {
  top: 3px;
  left: -22px;
  width: 9px;
  height: 9px;
  box-sizing: content-box;
  border: 2px solid var(--shell-card);
  box-shadow: none;
}

.shell__feed :deep(.tx-timeline-item__header) {
  justify-content: space-between;
  margin-bottom: 2px;
}

.shell__feed :deep(.tx-timeline-item__title) {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shell__feed :deep(.tx-timeline-item__time) {
  flex: none;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.shell__feed :deep(.tx-timeline-item__description) {
  font-size: 12px;
  line-height: 1.5;
}

.shell__feed :deep(.shell-feed-enter-active),
.shell__feed :deep(.shell-feed-move) {
  transition:
    opacity 0.32s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
    transform 0.32s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.shell__feed :deep(.shell-feed-enter-from) {
  opacity: 0;
  transform: translateY(-6px);
}

.shell__empty-icon {
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-size: 28px;
}

.shell__figure {
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.shell__chart {
  height: 72px;
  flex: none;
}

.shell__top {
  display: none;
  margin: 0;
  padding: 0;
  list-style: none;
}

.shell__top li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}

.shell__top li + li {
  box-shadow: inset 0 1px 0 var(--shell-line);
}

.shell__top-rank {
  width: 16px;
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.shell__top code {
  flex: 1;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
}

.shell__top-hits {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.shell__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.shell__row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.shell__row-icon {
  flex: none;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 15px;
}

.shell__row-text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
}

.shell__row-name {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* One line per service in the column; the detail joins it in the rail. */
.shell__row-detail {
  display: none;
  overflow: hidden;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shell__team-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

/* ─── plugins & empty sections ─── */

.shell__page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.shell__page--empty {
  height: 100%;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
}

.shell__page--empty :deep(.tx-empty-state) {
  max-width: 360px;
}

.shell__empty-plate {
  display: inline-flex;
  width: 52px;
  height: 52px;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: var(--tx-color-primary-light-9, #ecf5ff);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--tx-color-primary, #409eff) 18%, transparent);
  color: var(--tx-color-primary, #409eff);
  font-size: 24px;
}

.shell__plugins {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 4px 0;
  border-radius: 14px;
  background: var(--shell-card);
  box-shadow: 0 0 0 1px var(--shell-line);
  list-style: none;
}

.shell__plugin {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 14px;
}

.shell__plugin + .shell__plugin {
  box-shadow: inset 0 1px 0 var(--shell-line);
}

.shell__plugin.is-off .shell__plugin-text {
  opacity: 0.6;
}

.shell__plugin-text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
}

.shell__plugin-name {
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shell__plugin-id {
  overflow: hidden;
  color: var(--tx-text-color-secondary, #909399);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.shell__plugin-meta {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

/* ─── palette footer (teleported, so token colours only) ─── */

.shell__palette-foot {
  display: flex;
  gap: 16px;
  padding: 10px 16px;
  border-top: 1px solid var(--tx-border-color-lighter, #ebeef5);
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.shell__palette-foot span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* ─── wide: the expanded overlay ─── */

@container template (min-width: 960px) {
  .shell__sidebar {
    --tx-bui-sidebar-nav-width: 232px;

    padding: 12px 10px;
  }

  .shell__topbar {
    --shell-topbar-end: 16px;

    height: 56px;
    padding-left: 24px;
  }

  .shell__filter {
    width: 240px;
  }

  .shell__overview {
    grid-template-areas:
      'head head rail'
      'stats stats rail'
      'activity traffic rail';
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) 288px;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 16px;
    padding: 20px 24px 24px;
  }

  .shell__overview > .shell__head {
    display: flex;
  }

  .shell__stats {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .shell__stats .shell__stat--extra {
    display: flex;
  }

  .shell__rail {
    grid-area: rail;
    display: flex;
    min-height: 0;
    flex-direction: column;
    gap: 16px;
  }

  .shell__team,
  .shell__devices {
    display: flex;
  }

  .shell__services {
    flex: 1;
  }

  .shell__row-detail {
    display: block;
  }

  .shell__chart {
    min-height: 160px;
    flex: 1 1 0;
  }

  .shell__top {
    display: block;
  }

  .shell__page {
    padding: 20px 24px;
  }
}

/* ─── narrow ─── */

@container template (max-width: 639px) {
  .shell__sidebar {
    display: none;
  }

  .shell__burger {
    display: block;
  }

  .shell__topbar {
    --shell-topbar-end: 8px;

    padding-left: 10px;
  }

  .shell__crumbs {
    margin-left: 0;
  }

  .shell__crumbs :deep(.tx-breadcrumb__item:not(:last-child)) {
    display: none;
  }

  .shell__filter,
  .shell__palette {
    display: none;
  }

  .shell__toast {
    width: min(300px, calc(100% - 16px));
  }

  .shell__overview {
    grid-template-areas:
      'stats'
      'traffic'
      'activity'
      'services';
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
    padding: 12px;
  }

  /* A deliberate carousel: three cards side by side do not fit a phone
     column, and stacked they would push everything else off screen. */
  .shell__stats {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }

  .shell__stats .shell__stat {
    flex: 0 0 72%;
    scroll-snap-align: start;
  }

  /* Stacked, the card has no row height to fill, so the feed goes back to
     its natural size. */
  .shell__feed {
    flex: none;
    overflow: visible;
    contain: none;
  }

  .shell__plugin-meta {
    display: none;
  }

  .shell__page {
    padding: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .shell__feed :deep(.shell-feed-enter-active),
  .shell__feed :deep(.shell-feed-move) {
    transition: none;
  }
}
</style>
