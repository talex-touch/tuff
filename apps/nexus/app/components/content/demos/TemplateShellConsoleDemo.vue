<script setup lang="ts">
// Shell template, second style: a top-nav console. A global bar (product and
// workspace switchers, search, help, notifications, account) and a row of
// section tabs with who is online sit over a page header and a project grid
// that drills into a project. Below 640px the global bar folds into a
// TxNavBar whose menu button opens a drawer. Every tuffex part is a controlled
// primitive; workspaces, projects, presence and the scripted build are demo
// state held here.
import type { CommandPaletteItem } from '@talex-touch/tuffex/command-palette'
import type { FilterChipItem } from '@talex-touch/tuffex/filter-chips'
import type { IconChipTone } from '@talex-touch/tuffex/icon-chip'
import type { StatusTone } from '@talex-touch/tuffex/status-badge'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

type Section = 'overview' | 'projects' | 'activity' | 'members' | 'settings'
type WorkspaceId = 'labs' | 'personal' | 'community'
type RegionId = 'sha' | 'fra' | 'pdx'
type ProductId = 'desktop' | 'console' | 'store' | 'intelligence' | 'tuffex' | 'docs'
type ProjectKind = 'plugin' | 'workflow' | 'agent' | 'theme'
type ProjectStatus = 'building' | 'published' | 'review' | 'draft' | 'running' | 'waiting'
type Presence = 'online' | 'away' | 'offline'
type Role = 'owner' | 'admin' | 'developer' | 'guest'
type ActivityKind = 'published' | 'review' | 'workflow' | 'invited' | 'created'
type NoticeKind = 'review' | 'agent' | 'published'
type NoteKey = 'published' | 'created' | 'workspace' | 'region' | 'newWorkspace' | 'product' | 'invite' | 'help' | 'profile' | 'signout' | 'link'
type KindFilter = 'all' | ProjectKind
type MenuKey = 'product' | 'workspace' | 'notice' | 'account'

interface Bilingual { zh: string, en: string }

interface Project {
  id: string
  workspace: WorkspaceId
  kind: ProjectKind
  status: ProjectStatus
  icon: string
  tone: IconChipTone
  editors: string[]
  /** Age in minutes; 0 reads as "just now". */
  minutes: number
  /** Real id under `plugins/`, for plugin projects. */
  pluginId?: string
  version?: string
  progress?: number
  runs?: number
  trigger?: string
  /** Draft number, for the projects "New project" adds. */
  seq?: number
}

interface ActivityEntry {
  id: number
  workspace: WorkspaceId
  actor: string
  kind: ActivityKind
  project?: string
  target?: string
  version?: string
  minutes: number
}

interface Notice {
  id: string
  kind: NoticeKind
  project: string
  unread: boolean
  minutes: number
}

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))
const L = (text: Bilingual) => (zh.value ? text.zh : text.en)

const copy = computed(() => zh.value
  ? {
      title: '顶栏控制台',
      products: '切换产品',
      productsHead: 'Tuff 产品',
      recentHead: '最近访问',
      current: '当前',
      switchWorkspace: (name: string) => `切换工作区，当前为「${name}」`,
      workspacesHead: '工作区',
      people: (n: number) => `${n} 人`,
      region: '数据区域',
      regionSample: '示例',
      newWorkspace: '新建工作区',
      search: '搜索项目与命令…',
      searchWide: '搜索项目、成员与命令…',
      openPalette: '打开命令面板（⌘K）',
      docs: '文档',
      changelog: '更新日志',
      help: '帮助与快捷键',
      notifications: (n: number) => (n ? `通知，${n} 条未读` : '通知'),
      noticesHead: '通知',
      markAllRead: '全部标为已读',
      unread: '未读：',
      account: '账户菜单',
      profile: '个人资料',
      palette: '命令面板',
      shortcuts: '键盘快捷键',
      signOut: '退出登录',
      sections: { overview: '概览', projects: '项目', activity: '活动', members: '成员', settings: '设置' } as Record<Section, string>,
      ownerOnly: '需要所有者权限',
      lockedNote: '（需要所有者权限）',
      online: (n: number) => `${n} 人在线`,
      onlineHead: '在线成员',
      invite: '邀请成员',
      newProject: '新建项目',
      newProjectMenu: '选择项目类型',
      newKind: (kind: string) => `新建${kind}`,
      recentProjects: '最近项目',
      viewAll: '查看全部',
      activity: '动态',
      queue: '构建队列',
      weekly: '本周构建',
      sample: '示例数据',
      builds: (n: number) => `${n} 次`,
      overviewSub: (total: number, pending: number) => `${total} 个项目，${pending} 个待处理`,
      greeting: (ws: string, n: number) => `早上好，小满。${ws} 本周发布了 ${n} 个版本。`,
      projectsSub: (n: number) => `共 ${n} 个项目`,
      activitySub: '最近 7 天',
      membersSub: (total: number, online: number) => `${total} 位成员，${online} 人在线`,
      settingsSub: '仅所有者可见',
      filterLabel: '按类型筛选',
      filterPlaceholder: '筛选名称或插件 ID…',
      all: '全部',
      noProjects: '没有匹配的项目',
      noProjectsHint: '换个关键词，或清空筛选。',
      clear: '清空筛选',
      noActivity: '这里还没有动态',
      noActivityHint: '新建项目或邀请成员后，动态会出现在这里。',
      settingsTitle: '工作区设置',
      settingsBody: '名称、图标与数据区域都在这里修改。演示到此为止。',
      editing: '正在编辑',
      you: '（你）',
      versions: '版本',
      notPublished: '尚未发布',
      collaborators: '协作者',
      facts: { builds: '本周构建', duration: '平均构建时长', updated: '最近更新' },
      durationValue: '2 分 14 秒',
      building: (v: string, p: number) => `正在构建 ${v} · ${p}%`,
      runsToday: (n: number) => `今天运行 ${n} 次`,
      triggeredBy: (k: string) => `由 ${k} 触发`,
      awaiting: '等待确认',
      inReview: (v: string) => `${v} · 审核中`,
      draftLine: (ago: string) => `草稿 · ${ago}`,
      publishedLine: (v: string, ago: string) => `v${v} · ${ago}`,
      buildProgress: (name: string) => `「${name}」构建进度`,
      view: '查看',
      latest: '最新消息',
      openMenu: (n: number) => (n ? `打开菜单，${n} 条未读通知` : '打开菜单'),
      menu: '菜单',
      paletteSearch: '搜索命令、项目或成员…',
      paletteEmpty: '没有匹配的命令',
      paletteKeys: { move: '选择', run: '执行', close: '关闭' },
      go: (label: string) => `前往${label}`,
      open: (name: string) => `打开「${name}」`,
      switchTo: (name: string) => `切换到「${name}」`,
      ago: (m: number) => {
        if (m === 0)
          return '刚刚'
        if (m < 60)
          return `${m} 分钟前`
        if (m < 1440)
          return `${Math.round(m / 60)} 小时前`
        if (m < 2880)
          return '昨天'
        return m < 10080 ? `${Math.floor(m / 1440)} 天前` : `${Math.floor(m / 10080)} 周前`
      },
    }
  : {
      title: 'Top-nav console',
      products: 'Switch product',
      productsHead: 'Tuff products',
      recentHead: 'Recent',
      current: 'Current',
      switchWorkspace: (name: string) => `Switch workspace, current: ${name}`,
      workspacesHead: 'Workspaces',
      people: (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`,
      region: 'Data region',
      regionSample: 'Sample',
      newWorkspace: 'New workspace',
      search: 'Search projects and commands…',
      searchWide: 'Search projects, people and commands…',
      openPalette: 'Open command palette (⌘K)',
      docs: 'Docs',
      changelog: 'Changelog',
      help: 'Help and shortcuts',
      notifications: (n: number) => (n ? `Notifications, ${n} unread` : 'Notifications'),
      noticesHead: 'Notifications',
      markAllRead: 'Mark all as read',
      unread: 'Unread: ',
      account: 'Account menu',
      profile: 'Profile',
      palette: 'Command palette',
      shortcuts: 'Keyboard shortcuts',
      signOut: 'Sign out',
      sections: { overview: 'Overview', projects: 'Projects', activity: 'Activity', members: 'Members', settings: 'Settings' } as Record<Section, string>,
      ownerOnly: 'Owner permission required',
      lockedNote: ' (owner permission required)',
      online: (n: number) => `${n} online`,
      onlineHead: 'Online now',
      invite: 'Invite',
      newProject: 'New project',
      newProjectMenu: 'Choose a project type',
      newKind: (kind: string) => `New ${kind.toLowerCase()}`,
      recentProjects: 'Recent projects',
      viewAll: 'View all',
      activity: 'Activity',
      queue: 'Build queue',
      weekly: 'Builds this week',
      sample: 'Sample data',
      builds: (n: number) => `${n} builds`,
      overviewSub: (total: number, pending: number) => `${total} projects, ${pending} need attention`,
      greeting: (ws: string, n: number) => `Good morning, Mia. ${ws} shipped ${n} releases this week.`,
      projectsSub: (n: number) => `${n} project${n === 1 ? '' : 's'}`,
      activitySub: 'Last 7 days',
      membersSub: (total: number, online: number) => `${total} member${total === 1 ? '' : 's'}, ${online} online`,
      settingsSub: 'Owners only',
      filterLabel: 'Filter by type',
      filterPlaceholder: 'Filter by name or plugin id…',
      all: 'All',
      noProjects: 'No matching projects',
      noProjectsHint: 'Try another word, or clear the filter.',
      clear: 'Clear filter',
      noActivity: 'Nothing here yet',
      noActivityHint: 'New projects and invitations show up here.',
      settingsTitle: 'Workspace settings',
      settingsBody: 'Name, icon and data region live here. The demo stops at this door.',
      editing: 'editing',
      you: ' (you)',
      versions: 'Versions',
      notPublished: 'Not published yet',
      collaborators: 'Collaborators',
      facts: { builds: 'Builds this week', duration: 'Average build', updated: 'Last update' },
      durationValue: '2 m 14 s',
      building: (v: string, p: number) => `Building ${v} · ${p}%`,
      runsToday: (n: number) => `Ran ${n} times today`,
      triggeredBy: (k: string) => `Triggered by ${k}`,
      awaiting: 'Waiting for review',
      inReview: (v: string) => `${v} · in review`,
      draftLine: (ago: string) => `Draft · ${ago}`,
      publishedLine: (v: string, ago: string) => `v${v} · ${ago}`,
      buildProgress: (name: string) => `${name} build progress`,
      view: 'View',
      latest: 'Latest message',
      openMenu: (n: number) => (n ? `Open menu, ${n} unread notifications` : 'Open menu'),
      menu: 'Menu',
      paletteSearch: 'Search commands, projects or people…',
      paletteEmpty: 'No matching commands',
      paletteKeys: { move: 'Move', run: 'Run', close: 'Close' },
      go: (label: string) => `Go to ${label}`,
      open: (name: string) => `Open ${name}`,
      switchTo: (name: string) => `Switch to ${name}`,
      ago: (m: number) => {
        if (m === 0)
          return 'Just now'
        if (m < 60)
          return `${m} min ago`
        if (m < 1440)
          return `${Math.round(m / 60)} h ago`
        if (m < 2880)
          return 'Yesterday'
        return m < 10080 ? `${Math.floor(m / 1440)} days ago` : `${Math.floor(m / 10080)} wk ago`
      },
    })

/* ─── fixed data ─── */

const WORKSPACES: Array<{ id: WorkspaceId, mark: Bilingual, tone: IconChipTone, name: Bilingual, kind: Bilingual }> = [
  { id: 'labs', mark: { zh: 'TL', en: 'TL' }, tone: 'accent', name: { zh: 'Tuff Labs', en: 'Tuff Labs' }, kind: { zh: '团队', en: 'Team' } },
  { id: 'personal', mark: { zh: '满', en: 'M' }, tone: 'green', name: { zh: '小满的空间', en: 'Mia\'s space' }, kind: { zh: '个人', en: 'Personal' } },
  { id: 'community', mark: { zh: 'OS', en: 'OS' }, tone: 'orange', name: { zh: 'Tuff 开源社区', en: 'Tuff Open Source' }, kind: { zh: '社区', en: 'Community' } },
]

// Sample regions: the console does not promise where anyone's data lives.
const REGIONS: Array<{ id: RegionId, name: Bilingual }> = [
  { id: 'sha', name: { zh: '上海', en: 'Shanghai' } },
  { id: 'fra', name: { zh: '法兰克福', en: 'Frankfurt' } },
  { id: 'pdx', name: { zh: '俄勒冈', en: 'Oregon' } },
]

// `short` labels the app grid's half-width cells; `name` is what the host opens.
const PRODUCTS: Array<{ id: ProductId, icon: string, tone: IconChipTone, name: Bilingual, short?: Bilingual, desc: Bilingual }> = [
  { id: 'desktop', icon: 'i-carbon-laptop', tone: 'ink', name: { zh: 'Tuff 桌面版', en: 'Tuff Desktop' }, desc: { zh: 'CoreBox 与插件', en: 'CoreBox and plugins' } },
  { id: 'console', icon: 'i-carbon-dashboard', tone: 'accent', name: { zh: 'Nexus 控制台', en: 'Nexus Console' }, desc: { zh: '团队与项目', en: 'Teams and projects' } },
  { id: 'store', icon: 'i-carbon-store', tone: 'orange', name: { zh: '插件市场', en: 'Plugin Store' }, desc: { zh: '发现与安装', en: 'Discover and install' } },
  { id: 'intelligence', icon: 'i-carbon-machine-learning-model', tone: 'green', name: { zh: 'Tuff Intelligence', en: 'Tuff Intelligence' }, short: { zh: 'Intelligence', en: 'Intelligence' }, desc: { zh: 'AI 网关', en: 'AI gateway' } },
  { id: 'tuffex', icon: 'i-carbon-cube', tone: 'red', name: { zh: 'TuffEx', en: 'TuffEx' }, desc: { zh: '组件库', en: 'Component library' } },
  { id: 'docs', icon: 'i-carbon-book', tone: 'neutral', name: { zh: '文档', en: 'Docs' }, desc: { zh: '指南与 API', en: 'Guides and API' } },
]

const PEOPLE: Record<string, { name: Bilingual, email: string, tint: number }> = {
  kai: { name: { zh: '陈凯', en: 'Kai Chen' }, email: 'kai@example.com', tint: 1 },
  mia: { name: { zh: '林小满', en: 'Mia Lin' }, email: 'mia@example.com', tint: 0 },
  sam: { name: { zh: 'Sam Rivera', en: 'Sam Rivera' }, email: 'sam@example.com', tint: 2 },
  yining: { name: { zh: '周以宁', en: 'Zhou Yining' }, email: 'yining@example.com', tint: 4 },
  mo: { name: { zh: '陈默', en: 'Chen Mo' }, email: 'mo@example.com', tint: 3 },
  xiang: { name: { zh: '李想', en: 'Li Xiang' }, email: 'xiang@example.com', tint: 2 },
}

const MEMBERSHIP: Record<WorkspaceId, Array<{ id: string, role: Role }>> = {
  labs: [
    { id: 'kai', role: 'owner' },
    { id: 'mia', role: 'admin' },
    { id: 'sam', role: 'developer' },
    { id: 'yining', role: 'developer' },
    { id: 'xiang', role: 'developer' },
    { id: 'mo', role: 'guest' },
  ],
  personal: [{ id: 'mia', role: 'owner' }],
  community: [
    { id: 'sam', role: 'owner' },
    { id: 'mia', role: 'developer' },
    { id: 'kai', role: 'developer' },
  ],
}

const ROLE_LABEL: Record<Role, Bilingual> = {
  owner: { zh: '所有者', en: 'Owner' },
  admin: { zh: '管理员', en: 'Admin' },
  developer: { zh: '开发者', en: 'Developer' },
  guest: { zh: '访客', en: 'Guest' },
}

const PRESENCE_LABEL: Record<Presence, Bilingual> = {
  online: { zh: '在线', en: 'Online' },
  away: { zh: '离开', en: 'Away' },
  offline: { zh: '离线', en: 'Offline' },
}

const PROJECT_NAMES: Record<string, Bilingual> = {
  translate: { zh: '翻译', en: 'Translate' },
  clipboard: { zh: '剪贴板历史', en: 'Clipboard History' },
  shot: { zh: '截图翻译', en: 'Screenshot translate' },
  quick: { zh: '快捷动作', en: 'Quick Actions' },
  digest: { zh: '每日摘要', en: 'Daily digest' },
  window: { zh: '窗口预设', en: 'Window Presets' },
  intelligence: { zh: 'Tuff 智能', en: 'Tuff Intelligence' },
  scripts: { zh: '工作区脚本', en: 'Workspace Scripts' },
  aurora: { zh: '极光', en: 'Aurora' },
  mist: { zh: '晨雾', en: 'Morning mist' },
  notes: { zh: '剪贴板转笔记', en: 'Clip to note' },
  emoji: { zh: '表情与符号', en: 'Emoji & Symbols' },
  text: { zh: '文本工具', en: 'Text Tools' },
  snippets: { zh: '代码片段', en: 'Code Snippets' },
}

const KIND_META: Record<ProjectKind, { icon: string, tone: IconChipTone, label: Bilingual, untitled: Bilingual }> = {
  plugin: { icon: 'i-carbon-plug', tone: 'accent', label: { zh: '插件', en: 'Plugin' }, untitled: { zh: '未命名插件', en: 'Untitled plugin' } },
  workflow: { icon: 'i-carbon-flow', tone: 'green', label: { zh: '工作流', en: 'Workflow' }, untitled: { zh: '未命名工作流', en: 'Untitled workflow' } },
  agent: { icon: 'i-carbon-bot', tone: 'orange', label: { zh: '智能体', en: 'Agent' }, untitled: { zh: '未命名智能体', en: 'Untitled agent' } },
  theme: { icon: 'i-carbon-color-palette', tone: 'red', label: { zh: '主题', en: 'Theme' }, untitled: { zh: '未命名主题', en: 'Untitled theme' } },
}
const KINDS: ProjectKind[] = ['plugin', 'workflow', 'agent', 'theme']

const STATUS_META: Record<ProjectStatus, { tone: StatusTone, label: Bilingual }> = {
  building: { tone: 'info', label: { zh: '构建中', en: 'Building' } },
  published: { tone: 'success', label: { zh: '已发布', en: 'Published' } },
  review: { tone: 'warning', label: { zh: '审核中', en: 'In review' } },
  draft: { tone: 'muted', label: { zh: '草稿', en: 'Draft' } },
  running: { tone: 'success', label: { zh: '运行中', en: 'Running' } },
  waiting: { tone: 'warning', label: { zh: '等待确认', en: 'Needs review' } },
}

// Same-hue ink on each hue's soft fill: white initials on a solid semantic
// fill do not reach a readable contrast in either theme.
const AVATAR_TINTS = [
  { bg: 'var(--tx-color-primary-light-9)', ink: 'var(--tx-color-primary)' },
  { bg: 'var(--tx-color-success-light-9)', ink: 'var(--tx-color-success)' },
  { bg: 'var(--tx-color-warning-light-9)', ink: 'var(--tx-color-warning)' },
  { bg: 'var(--tx-fill-color)', ink: 'var(--tx-text-color-regular)' },
  { bg: 'var(--tx-color-danger-light-9)', ink: 'var(--tx-color-danger)' },
]
const tint = (person: string) => AVATAR_TINTS[(PEOPLE[person]?.tint ?? 3) % AVATAR_TINTS.length]!

// Builds per weekday, Monday first: sample figures for the wide rail.
const WEEKLY_BUILDS = [3, 5, 2, 6, 4, 7, 5]
const SPARK_PADDING = { top: 10, bottom: 4 }

function seedProjects(): Project[] {
  return [
    { id: 'translate', workspace: 'labs', kind: 'plugin', pluginId: 'touch-translation', status: 'building', version: '2.4.1', progress: 72, icon: 'i-carbon-translate', tone: 'accent', editors: ['kai', 'mia'], minutes: 12 },
    { id: 'shot', workspace: 'labs', kind: 'workflow', status: 'running', runs: 18, trigger: '⌘⇧T', icon: 'i-carbon-image', tone: 'green', editors: ['sam'], minutes: 34 },
    { id: 'clipboard', workspace: 'labs', kind: 'plugin', pluginId: 'clipboard-history', status: 'published', version: '1.2.0', icon: 'i-carbon-paste', tone: 'accent', editors: ['kai'], minutes: 120 },
    { id: 'digest', workspace: 'labs', kind: 'agent', status: 'waiting', icon: 'i-carbon-bot', tone: 'orange', editors: ['kai'], minutes: 190 },
    { id: 'quick', workspace: 'labs', kind: 'plugin', pluginId: 'touch-quick-actions', status: 'review', version: '1.1.0', icon: 'i-carbon-flash', tone: 'orange', editors: ['yining'], minutes: 1500 },
    { id: 'scripts', workspace: 'labs', kind: 'plugin', pluginId: 'touch-workspace-scripts', status: 'draft', icon: 'i-carbon-code', tone: 'ink', editors: ['mia'], minutes: 2900 },
    { id: 'aurora', workspace: 'labs', kind: 'theme', status: 'draft', icon: 'i-carbon-color-palette', tone: 'red', editors: ['mia', 'xiang'], minutes: 5800 },
    { id: 'window', workspace: 'labs', kind: 'plugin', pluginId: 'touch-window-presets', status: 'published', version: '1.0.0', icon: 'i-carbon-screen', tone: 'ink', editors: ['xiang'], minutes: 7300 },
    { id: 'intelligence', workspace: 'labs', kind: 'plugin', pluginId: 'touch-intelligence', status: 'published', version: '1.2.0', icon: 'i-carbon-machine-learning-model', tone: 'green', editors: ['sam'], minutes: 10200 },
    { id: 'notes', workspace: 'personal', kind: 'workflow', status: 'running', runs: 4, trigger: '⌘⇧N', icon: 'i-carbon-edit', tone: 'green', editors: ['mia'], minutes: 90 },
    { id: 'mist', workspace: 'personal', kind: 'theme', status: 'draft', icon: 'i-carbon-color-palette', tone: 'red', editors: ['mia'], minutes: 2000 },
    { id: 'emoji', workspace: 'community', kind: 'plugin', pluginId: 'touch-emoji-symbols', status: 'published', version: '1.3.0', icon: 'i-carbon-face-add', tone: 'orange', editors: ['sam'], minutes: 300 },
    { id: 'text', workspace: 'community', kind: 'plugin', pluginId: 'touch-text-tools', status: 'review', version: '0.9.0', icon: 'i-carbon-text-font', tone: 'accent', editors: ['kai', 'mia'], minutes: 2950 },
    { id: 'snippets', workspace: 'community', kind: 'plugin', pluginId: 'touch-code-snippets', status: 'draft', icon: 'i-carbon-code', tone: 'ink', editors: ['mia'], minutes: 6000 },
  ]
}

function seedActivity(): ActivityEntry[] {
  return [
    { id: 1, workspace: 'labs', actor: 'kai', kind: 'published', project: 'clipboard', version: '1.2.0', minutes: 120 },
    { id: 2, workspace: 'labs', actor: 'yining', kind: 'review', project: 'quick', version: '1.1.0', minutes: 1500 },
    { id: 3, workspace: 'labs', actor: 'sam', kind: 'workflow', project: 'shot', minutes: 3000 },
    { id: 4, workspace: 'labs', actor: 'mia', kind: 'invited', target: 'mo', minutes: 4400 },
    { id: 5, workspace: 'personal', actor: 'mia', kind: 'workflow', project: 'notes', minutes: 1450 },
    { id: 6, workspace: 'community', actor: 'sam', kind: 'published', project: 'emoji', version: '1.3.0', minutes: 300 },
    { id: 7, workspace: 'community', actor: 'kai', kind: 'review', project: 'text', version: '0.9.0', minutes: 2950 },
  ]
}

function seedNotices(): Notice[] {
  return [
    { id: 'review', kind: 'review', project: 'quick', unread: true, minutes: 25 },
    { id: 'agent', kind: 'agent', project: 'digest', unread: false, minutes: 190 },
  ]
}

function seedPresence(): Record<string, Presence> {
  return { kai: 'online', mia: 'online', sam: 'online', yining: 'away', xiang: 'offline', mo: 'offline' }
}

/* ─── state ─── */

const workspace = ref<WorkspaceId>('labs')
const region = ref<RegionId>('sha')
const section = ref<Section>('overview')
const detailId = ref<string | null>(null)
const kindFilter = ref<KindFilter>('all')
const query = ref('')
const projects = ref<Project[]>(seedProjects())
const activity = ref<ActivityEntry[]>(seedActivity())
const notices = ref<Notice[]>(seedNotices())
const presence = ref<Record<string, Presence>>(seedPresence())
const weekly = ref<number[]>([...WEEKLY_BUILDS])
const draftCount = ref(0)

const productMenuOpen = ref(false)
const workspaceMenuOpen = ref(false)
const noticeMenuOpen = ref(false)
const accountMenuOpen = ref(false)
const paletteOpen = ref(false)
const drawerOpen = ref(false)
const reducedMotion = ref(prefersReducedMotion())

const noteOpen = ref(false)
const noteShown = ref(false)
const noteKey = ref<NoteKey>('published')
const noteArg = ref('')
const noteTarget = ref<string | null>(null)

const rootRef = ref<HTMLElement | null>(null)
const searchTriggerRef = ref<HTMLButtonElement | null>(null)

let activityId = 100

/* ─── derived ─── */

const currentWorkspace = computed(() => WORKSPACES.find(w => w.id === workspace.value) ?? WORKSPACES[0]!)
const workspaceName = computed(() => L(currentWorkspace.value.name))
const regionName = computed(() => L(REGIONS.find(r => r.id === region.value)?.name ?? REGIONS[0]!.name))
const personName = (id: string) => (PEOPLE[id] ? L(PEOPLE[id].name) : id)

const members = computed(() => MEMBERSHIP[workspace.value].map(entry => ({
  ...entry,
  name: personName(entry.id),
  email: PEOPLE[entry.id]?.email ?? '',
  presence: presence.value[entry.id] ?? 'offline',
})))
const onlineMembers = computed(() => members.value.filter(m => m.presence === 'online'))
const myRole = computed<Role>(() => MEMBERSHIP[workspace.value].find(m => m.id === 'mia')?.role ?? 'guest')
const isOwner = computed(() => myRole.value === 'owner')

function projectName(project: Project): string {
  if (project.seq !== undefined)
    return `${L(KIND_META[project.kind].untitled)} ${project.seq}`
  return PROJECT_NAMES[project.id] ? L(PROJECT_NAMES[project.id]!) : project.id
}

const wsProjects = computed(() => projects.value
  .filter(p => p.workspace === workspace.value)
  .sort((a, b) => a.minutes - b.minutes))

const pendingCount = computed(() => wsProjects.value.filter(p => ['building', 'review', 'waiting'].includes(p.status)).length)
const releasesThisWeek = computed(() => wsProjects.value.filter(p => p.status === 'published' && p.minutes < 10080).length)

function metaLine(project: Project): string {
  const kind = L(KIND_META[project.kind].label)
  if (project.pluginId)
    return `${project.pluginId} · ${kind}`
  return kind
}

function detailLine(project: Project): string {
  const c = copy.value
  switch (project.status) {
    case 'building':
      return c.building(project.version ?? '', project.progress ?? 0)
    case 'published':
      return c.publishedLine(project.version ?? '1.0.0', c.ago(project.minutes))
    case 'review':
      return c.inReview(`v${project.version}`)
    case 'running':
      return project.trigger ? `${c.runsToday(project.runs ?? 0)} · ${c.triggeredBy(project.trigger)}` : c.runsToday(project.runs ?? 0)
    case 'waiting':
      return c.awaiting
    default:
      return c.draftLine(c.ago(project.minutes))
  }
}

function editingLine(project: Project): string {
  const live = project.editors.filter(id => presence.value[id] === 'online' && project.status !== 'published')
  if (!live.length)
    return copy.value.ago(project.minutes)
  const names = live.map(personName).join(zh.value ? '、' : ', ')
  return `${names} ${copy.value.editing}`
}

const projectViews = computed(() => wsProjects.value.map(project => ({
  ...project,
  name: projectName(project),
  meta: metaLine(project),
  line: detailLine(project),
  editing: editingLine(project),
  statusText: L(STATUS_META[project.status].label),
  statusTone: STATUS_META[project.status].tone,
})))

const queueViews = computed(() => projectViews.value.filter(p => ['building', 'review', 'waiting'].includes(p.status)))

const kindChips = computed<FilterChipItem[]>(() => [
  { value: 'all', label: copy.value.all, count: wsProjects.value.length },
  ...KINDS.map(kind => ({
    value: kind,
    label: L(KIND_META[kind].label),
    count: wsProjects.value.filter(p => p.kind === kind).length,
  })),
])

const needle = computed(() => query.value.trim().toLowerCase())
const filteredProjects = computed(() => projectViews.value.filter((project) => {
  if (kindFilter.value !== 'all' && project.kind !== kindFilter.value)
    return false
  return !needle.value || `${project.name} ${project.pluginId ?? ''}`.toLowerCase().includes(needle.value)
}))

const detail = computed(() => (detailId.value ? projectViews.value.find(p => p.id === detailId.value) ?? null : null))

function versionHistory(project: Project): Array<{ version: string, status: ProjectStatus, when: string }> {
  if (!project.version || project.status === 'draft')
    return []
  const [major, minor, patch] = project.version.split('.').map(Number)
  const head = { version: project.version, status: project.status, when: copy.value.ago(project.minutes) }
  const older = [1, 2]
    .map(step => ({ major: major ?? 1, minor: minor ?? 0, patch: (patch ?? 0) - step }))
    .filter(v => v.patch >= 0)
    .map((v, index) => ({
      version: `${v.major}.${v.minor}.${v.patch}`,
      status: 'published' as ProjectStatus,
      when: copy.value.ago(project.minutes + (index + 1) * 4320),
    }))
  return [head, ...older]
}

function activityText(entry: ActivityEntry): string {
  const actor = personName(entry.actor)
  const project = entry.project ? projects.value.find(p => p.id === entry.project) : undefined
  const name = project ? projectName(project) : ''
  if (zh.value) {
    switch (entry.kind) {
      case 'published':
        return `${actor} 发布了「${name}」${entry.version}`
      case 'review':
        return `${actor} 把「${name}」${entry.version} 提交审核`
      case 'workflow':
        return `${actor} 新建工作流「${name}」`
      case 'invited':
        return `${actor} 邀请了 ${personName(entry.target ?? '')}`
      default:
        return `${actor} 新建了「${name}」`
    }
  }
  switch (entry.kind) {
    case 'published':
      return `${actor} published ${name} ${entry.version}`
    case 'review':
      return `${actor} sent ${name} ${entry.version} for review`
    case 'workflow':
      return `${actor} created the workflow ${name}`
    case 'invited':
      return `${actor} invited ${personName(entry.target ?? '')}`
    default:
      return `${actor} created ${name}`
  }
}

const activityViews = computed(() => activity.value
  .filter(entry => entry.workspace === workspace.value)
  .sort((a, b) => a.minutes - b.minutes)
  .map(entry => ({ ...entry, text: activityText(entry), time: copy.value.ago(entry.minutes) })))

function noticeText(notice: Notice): string {
  const project = projects.value.find(p => p.id === notice.project)
  const name = project ? projectName(project) : ''
  if (notice.kind === 'review')
    return zh.value ? `陈凯 请你审核「${name}」1.1.0` : `Kai Chen asked you to review ${name} 1.1.0`
  if (notice.kind === 'agent')
    return zh.value ? `智能体「${name}」等待确认` : `Agent "${name}" is waiting for review`
  return zh.value ? `「${name}」${project?.version ?? ''} 已发布` : `${name} ${project?.version ?? ''} published`
}

const noticeViews = computed(() => notices.value.map(notice => ({
  ...notice,
  text: noticeText(notice),
  time: copy.value.ago(notice.minutes),
  icon: notice.kind === 'review' ? 'i-carbon-user-follow' : notice.kind === 'agent' ? 'i-carbon-bot' : 'i-carbon-rocket',
})))
const unread = computed(() => notices.value.filter(n => n.unread).length)

const crumbs = computed(() => {
  const items = [{ label: workspaceName.value }]
  if (detail.value) {
    items.push({ label: copy.value.sections.projects }, { label: detail.value.name })
    return items
  }
  items.push({ label: copy.value.sections[section.value] })
  return items
})

const headSub = computed(() => {
  const c = copy.value
  if (detail.value)
    return detail.value.meta
  switch (section.value) {
    case 'projects':
      return c.projectsSub(wsProjects.value.length)
    case 'activity':
      return c.activitySub
    case 'members':
      return c.membersSub(members.value.length, onlineMembers.value.length)
    case 'settings':
      return c.settingsSub
    default:
      return c.overviewSub(wsProjects.value.length, pendingCount.value)
  }
})

const weeklySeries = computed(() => [{
  id: 'builds',
  label: copy.value.weekly,
  color: 'var(--tx-bui-accent)',
  data: weekly.value.map((value, index) => ({ time: index, value })),
}])
const weeklyTotal = computed(() => weekly.value.reduce((sum, value) => sum + value, 0))

const commands = computed<CommandPaletteItem[]>(() => {
  const c = copy.value
  const go = (id: Section, icon: string, keywords: string[]) => ({ id: `go-${id}`, title: c.go(c.sections[id]), icon, keywords })
  const open = wsProjects.value.slice(0, 3).map(project => ({
    id: `open-${project.id}`,
    title: c.open(projectName(project)),
    description: metaLine(project),
    icon: project.icon,
    keywords: [project.id, project.pluginId ?? ''],
  }))
  const switches = WORKSPACES.filter(w => w.id !== workspace.value).map(w => ({
    id: `ws-${w.id}`,
    title: c.switchTo(L(w.name)),
    description: L(w.kind),
    icon: 'i-carbon-switcher',
    keywords: ['workspace', w.id],
  }))
  return [
    go('overview', 'i-carbon-home', ['overview', 'home']),
    go('projects', 'i-carbon-folders', ['projects']),
    go('activity', 'i-carbon-activity', ['activity', 'feed']),
    go('members', 'i-carbon-user-multiple', ['members', 'team']),
    ...open,
    { id: 'new-plugin', title: c.newKind(L(KIND_META.plugin.label)), icon: 'i-carbon-add', shortcut: '⌘ N', keywords: ['new', 'plugin', 'create'] },
    { id: 'new-workflow', title: c.newKind(L(KIND_META.workflow.label)), icon: 'i-carbon-flow', keywords: ['new', 'workflow', 'create'] },
    ...switches,
    { id: 'invite', title: c.invite, icon: 'i-carbon-user-follow', keywords: ['invite', 'member'] },
    { id: 'settings', title: c.settingsTitle, description: isOwner.value ? undefined : c.ownerOnly, icon: 'i-carbon-settings', disabled: !isOwner.value, keywords: ['settings'] },
  ]
})

const noteView = computed(() => {
  const t = zh.value
  const arg = noteArg.value
  switch (noteKey.value) {
    case 'published':
      return { icon: 'i-carbon-rocket', tone: 'green' as IconChipTone, title: t ? `「${arg}」2.4.1 已发布` : `${arg} 2.4.1 published`, body: t ? '构建通过，已推送到插件市场的更新队列。' : 'The build passed and joined the store\'s update queue.' }
    case 'created':
      return { icon: 'i-carbon-add', tone: 'accent' as IconChipTone, title: t ? `已创建「${arg}」` : `Created ${arg}`, body: t ? '草稿已放在最近项目的第一位。' : 'The draft sits first in Recent projects.' }
    case 'workspace':
      return { icon: 'i-carbon-switcher', tone: 'ink' as IconChipTone, title: t ? `已切换到「${arg}」` : `Switched to ${arg}`, body: t ? '项目、成员与动态都换成了这个工作区的。' : 'Projects, members and activity now come from this workspace.' }
    case 'region':
      return { icon: 'i-carbon-location', tone: 'ink' as IconChipTone, title: t ? `数据区域：${arg}（示例）` : `Data region: ${arg} (sample)`, body: t ? '演示只记下选择，不会迁移任何数据。' : 'The demo records the choice; no data moves.' }
    case 'newWorkspace':
      return { icon: 'i-carbon-add', tone: 'ink' as IconChipTone, title: t ? '新建工作区（演示）' : 'New workspace (demo)', body: t ? '宿主会在这里打开创建向导。' : 'The host would open its setup wizard here.' }
    case 'product':
      return { icon: 'i-carbon-launch', tone: 'ink' as IconChipTone, title: t ? `宿主会打开「${arg}」（演示）` : `The host would open ${arg} (demo)`, body: t ? '产品切换只换应用，不离开当前账户。' : 'Switching product keeps you signed in.' }
    case 'link':
      return { icon: 'i-carbon-launch', tone: 'ink' as IconChipTone, title: t ? `宿主会打开「${arg}」（演示）` : `The host would open ${arg} (demo)`, body: t ? '模板里的外链都只给反馈，不跳转。' : 'Links in the template report here instead of navigating.' }
    case 'invite':
      return { icon: 'i-carbon-user-follow', tone: 'accent' as IconChipTone, title: t ? '邀请链接已生成（演示）' : 'Invite link created (demo)', body: t ? `7 天内有效，加入后进入「${arg}」。` : `Valid for 7 days, joins ${arg}.` }
    case 'help':
      return { icon: 'i-carbon-help', tone: 'ink' as IconChipTone, title: t ? '键盘快捷键' : 'Keyboard shortcuts', body: t ? '⌘K 命令面板 · ←/→ 切换分区 · Esc 关闭菜单' : '⌘K palette · ←/→ switch sections · Esc closes menus' }
    case 'profile':
      return { icon: 'i-carbon-user-avatar', tone: 'ink' as IconChipTone, title: t ? '个人资料（演示）' : 'Profile (demo)', body: t ? '宿主会在这里打开账户设置。' : 'The host would open account settings here.' }
    default:
      return { icon: 'i-carbon-logout', tone: 'neutral' as IconChipTone, title: t ? '已退出登录（演示）' : 'Signed out (demo)', body: t ? '模板里的演示操作，重置即可恢复。' : 'A demo action; reset the demo to undo it.' }
  }
})

/* ─── timers ─── */

const autoplayTimers = new Set<ReturnType<typeof setTimeout>>()
let noteTimer: ReturnType<typeof setTimeout> | undefined
let entered = false
let autoplaying = false
let paletteReturn: HTMLElement | null = null
let noteHovered = false
let noteFocused = false
const focusTimers = new Set<ReturnType<typeof setTimeout>>()

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

function armNote(ms: number) {
  clearTimeout(noteTimer)
  noteTimer = setTimeout(() => {
    noteOpen.value = false
  }, ms)
}

// Every note closes by itself, longer when it carries 查看; a pointer or
// keyboard focus resting on it holds it, and it re-arms once both leave.
function showNote(key: NoteKey, options: { arg?: string, target?: string | null } = {}) {
  noteKey.value = key
  noteArg.value = options.arg ?? ''
  noteTarget.value = options.target ?? null
  noteShown.value = true
  noteOpen.value = true
  if (noteHovered || noteFocused)
    clearTimeout(noteTimer)
  else
    armNote(noteTarget.value ? 4500 : 3200)
}

function holdNote(kind: 'hover' | 'focus') {
  if (kind === 'hover')
    noteHovered = true
  else
    noteFocused = true
  clearTimeout(noteTimer)
}

function releaseNote(kind: 'hover' | 'focus') {
  if (kind === 'hover')
    noteHovered = false
  else
    noteFocused = false
  if (noteOpen.value && !noteHovered && !noteFocused)
    armNote(2000)
}

function onNoteFocusOut(event: FocusEvent) {
  const next = event.relatedTarget
  if (!(next instanceof Node) || !(event.currentTarget as HTMLElement).contains(next))
    releaseNote('focus')
}

function closeNote() {
  clearTimeout(noteTimer)
  noteOpen.value = false
  noteHovered = false
  noteFocused = false
}

// The tab content scrolls in its own box; a new page starts at its top.
function resetContentScroll() {
  void nextTick(() => {
    const scroller = rootRef.value?.querySelector<HTMLElement>('.tx-tabs__content-scroll')
    if (scroller)
      scroller.scrollTop = 0
  })
}

function goTo(next: Section) {
  if (next === 'settings' && !isOwner.value)
    return
  section.value = next
  detailId.value = null
}

function onTabChange(value: string) {
  goTo(value as Section)
}

function openProject(id: string) {
  const project = projects.value.find(p => p.id === id)
  if (!project)
    return
  if (project.workspace !== workspace.value)
    workspace.value = project.workspace
  section.value = 'projects'
  detailId.value = id
  resetContentScroll()
}

function onCrumb(_item: unknown, index: number) {
  if (index === 0)
    goTo('overview')
  else if (index === 1 && detailId.value)
    goTo('projects')
}

function switchWorkspace(id: WorkspaceId) {
  if (id === workspace.value)
    return
  workspace.value = id
  kindFilter.value = 'all'
  query.value = ''
  detailId.value = null
  if (section.value === 'settings' && !isOwner.value)
    section.value = 'overview'
  showNote('workspace', { arg: workspaceName.value })
}

function setRegion(id: RegionId) {
  region.value = id
  showNote('region', { arg: regionName.value })
}

function openProduct(id: ProductId) {
  if (id === 'console')
    return
  const product = PRODUCTS.find(p => p.id === id)
  if (product)
    showNote('product', { arg: L(product.name) })
}

function createProject(kind: ProjectKind) {
  draftCount.value += 1
  const project: Project = {
    id: `draft-${draftCount.value}`,
    workspace: workspace.value,
    kind,
    status: 'draft',
    icon: KIND_META[kind].icon,
    tone: KIND_META[kind].tone,
    editors: ['mia'],
    minutes: 0,
    seq: draftCount.value,
  }
  projects.value = [project, ...projects.value]
  activity.value = [{ id: ++activityId, workspace: workspace.value, actor: 'mia', kind: 'created', project: project.id, minutes: 0 }, ...activity.value]
  showNote('created', { arg: projectName(project), target: project.id })
}

function invite() {
  showNote('invite', { arg: workspaceName.value })
}

function openNotice(id: string) {
  const notice = notices.value.find(n => n.id === id)
  if (!notice)
    return
  notices.value = notices.value.map((n): Notice => (n.id === id ? { ...n, unread: false } : n))
  openProject(notice.project)
}

function markAllRead() {
  notices.value = notices.value.map((n): Notice => ({ ...n, unread: false }))
}

// `returnTo` is for the palette opened from a menu item: the item is hidden
// once the menu closes, so the palette hands focus back to the menu's trigger.
function openPalette(returnTo: HTMLElement | null = null) {
  const active = hasWindow() ? document.activeElement : null
  paletteReturn = returnTo ?? (active instanceof HTMLElement && rootRef.value?.contains(active) ? active : null)
  productMenuOpen.value = false
  workspaceMenuOpen.value = false
  noticeMenuOpen.value = false
  accountMenuOpen.value = false
  paletteOpen.value = true
}

// None of TxDropdownMenu, TxDropdownSubmenu, TxSplitButton's menu or
// TxCommandPalette hands focus back when it closes, and none lets go of it:
// the chosen menu item keeps focus inside its closed panel (kept mounted,
// hidden), the palette's input keeps it through the fade-out. Both are
// outside the template, where the expanded stage's Escape never arrives. So
// stranded focus goes back to the trigger — right away, and once more after
// the leave transition in case it only fell later. Focus a chosen item moved
// on purpose (the palette taking it) and focus the reader put somewhere else
// stay where they are.
const PALETTE_SELECTOR = '.tx-command-palette__overlay, .tx-command-palette__panel'
const POPUP_LEAVE_MS = 400

function focusIsStranded(): boolean {
  const active = document.activeElement
  if (!active || active === document.body || active.closest('[inert]'))
    return true
  const anchor = active.closest('.tx-base-anchor')
  if (anchor)
    return !anchor.classList.contains('is-open')
  return !paletteOpen.value && active.closest(PALETTE_SELECTOR) !== null
}

function returnFocus(target: () => HTMLElement | null) {
  const attempt = () => {
    if (focusIsStranded())
      target()?.focus({ preventScroll: true })
  }
  void nextTick(attempt)
  const id = setTimeout(() => {
    focusTimers.delete(id)
    attempt()
  }, POPUP_LEAVE_MS)
  focusTimers.add(id)
}

function menuTrigger(key: MenuKey): HTMLElement | null {
  return rootRef.value?.querySelector<HTMLElement>(`[data-console-trigger="${key}"]`) ?? null
}

function onMenuClose(key: MenuKey) {
  returnFocus(() => menuTrigger(key))
}

function onNewMenuChange(open: boolean) {
  if (!open)
    returnFocus(() => rootRef.value?.querySelector<HTMLElement>('.console__new .tx-split-button__menu') ?? null)
}

// The note's 查看 unmounts into an inert panel; focus follows the reader to
// the tab of the page it opened.
function viewNoteTarget() {
  const target = noteTarget.value
  closeNote()
  if (target)
    openProject(target)
  returnFocus(() => rootRef.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? null)
}

function paletteReturnTarget(): HTMLElement | null {
  const candidates = [paletteReturn, searchTriggerRef.value, rootRef.value?.querySelector<HTMLElement>('.tx-nav-bar__right') ?? null]
    .filter((element): element is HTMLElement => Boolean(element?.isConnected))
  // The first one on screen: the search trigger is display: none when narrow.
  return candidates.find(element => element.getClientRects().length > 0) ?? candidates[0] ?? null
}

watch(paletteOpen, (open) => {
  if (!open)
    returnFocus(paletteReturnTarget)
})

function onCommand(item: CommandPaletteItem) {
  if (item.id.startsWith('go-'))
    goTo(item.id.slice(3) as Section)
  else if (item.id.startsWith('open-'))
    openProject(item.id.slice(5))
  else if (item.id.startsWith('ws-'))
    switchWorkspace(item.id.slice(3) as WorkspaceId)
  else if (item.id === 'new-plugin')
    createProject('plugin')
  else if (item.id === 'new-workflow')
    createProject('workflow')
  else if (item.id === 'invite')
    invite()
  else if (item.id === 'settings')
    goTo('settings')
}

function fromDrawer(action: () => void) {
  drawerOpen.value = false
  action()
}

/* ─── scripted arrivals ─── */

function stopAutoplay() {
  if (autoplaying)
    clearAutoplay()
}

function comeOnline() {
  presence.value = { ...presence.value, yining: 'online' }
}

function setBuildProgress(value: number) {
  projects.value = projects.value.map((p): Project => (p.id === 'translate' && p.status === 'building' ? { ...p, progress: value } : p))
}

function finishBuild() {
  const project = projects.value.find(p => p.id === 'translate')
  if (!project || project.status !== 'building')
    return
  projects.value = projects.value.map((p): Project => (p.id === 'translate' ? { ...p, status: 'published', progress: undefined, minutes: 0 } : p))
  activity.value = [{ id: ++activityId, workspace: 'labs', actor: 'kai', kind: 'published', project: 'translate', version: '2.4.1', minutes: 0 }, ...activity.value]
  weekly.value = weekly.value.map((value, index) => (index === weekly.value.length - 1 ? value + 1 : value))
}

function announceRelease() {
  if (notices.value.some(n => n.id === 'published'))
    return
  notices.value = [{ id: 'published', kind: 'published', project: 'translate', unread: true, minutes: 0 }, ...notices.value]
}

function play() {
  clearAutoplay()
  reducedMotion.value = prefersReducedMotion()
  if (reducedMotion.value) {
    comeOnline()
    finishBuild()
    announceRelease()
    return
  }
  autoplaying = true
  schedule(800, comeOnline)
  schedule(1200, () => setBuildProgress(88))
  schedule(1600, finishBuild)
  schedule(2200, () => {
    announceRelease()
    showNote('published', { arg: L(PROJECT_NAMES.translate!), target: 'translate' })
    autoplaying = false
  })
}

function onEnter() {
  entered = true
  play()
}

function resetDemo() {
  clearAutoplay()
  clearTimeout(noteTimer)
  workspace.value = 'labs'
  region.value = 'sha'
  section.value = 'overview'
  detailId.value = null
  kindFilter.value = 'all'
  query.value = ''
  projects.value = seedProjects()
  activity.value = seedActivity()
  notices.value = seedNotices()
  presence.value = seedPresence()
  weekly.value = [...WEEKLY_BUILDS]
  draftCount.value = 0
  productMenuOpen.value = false
  workspaceMenuOpen.value = false
  noticeMenuOpen.value = false
  accountMenuOpen.value = false
  paletteOpen.value = false
  drawerOpen.value = false
  closeNote()
  noteShown.value = false
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

watch(locale, resetDemo)

onBeforeUnmount(() => {
  clearAutoplay()
  clearTimeout(noteTimer)
  for (const id of focusTimers)
    clearTimeout(id)
  focusTimers.clear()
})

defineExpose({ resetDemo })

const tabsAnimation = computed(() => (reducedMotion.value
  ? { size: false, nav: false, indicator: false, content: false }
  : { content: { type: 'fade' as const } }))
</script>

<template>
  <TemplateFrame :title="copy.title" :height="580" @enter="onEnter">
    <div ref="rootRef" class="console" @keydown="onKeydown" @pointerdown="stopAutoplay">
      <!-- ─── row 1: the global bar (≥ 640) ─── -->
      <header class="console__bar">
        <div class="console__start">
          <TxDropdownMenu v-model="productMenuOpen" placement="bottom-start" :min-width="340" @close="onMenuClose('product')">
            <template #trigger>
              <TxIconButton data-console-trigger="product" icon="i-carbon-app-switcher" size="sm" :label="copy.products" />
            </template>
            <div class="console__menu-head">
              {{ copy.productsHead }}
            </div>
            <!-- A grid wrapper is transparent to the menu's arrow keys: they
                 walk every [role=menuitem] in DOM order. -->
            <div class="console__apps">
              <TxDropdownItem v-for="product in PRODUCTS" :key="product.id" @select="openProduct(product.id)">
                <span class="console__app" :class="{ 'is-current': product.id === 'console' }">
                  <TxIconChip :size="30" :radius="9" :tone="product.tone" variant="soft">
                    <i :class="product.icon" />
                  </TxIconChip>
                  <span class="console__app-text">
                    <span class="console__app-name">{{ L(product.short ?? product.name) }}</span>
                    <span class="console__app-desc">
                      {{ product.id === 'console' ? copy.current : L(product.desc) }}
                    </span>
                  </span>
                </span>
              </TxDropdownItem>
            </div>
            <div class="console__menu-head">
              {{ copy.recentHead }}
            </div>
            <TxDropdownItem v-for="project in projectViews.slice(0, 3)" :key="project.id" @select="openProject(project.id)">
              <span class="console__menu-row">
                <i :class="project.icon" aria-hidden="true" />
                <span class="console__menu-label">{{ project.name }}</span>
              </span>
              <template #right>
                <span class="console__menu-value">{{ L(KIND_META[project.kind].label) }}</span>
              </template>
            </TxDropdownItem>
          </TxDropdownMenu>

          <span class="console__brand">
            <TxIconChip :size="22" :radius="7" tone="ink" :font-size="11">
              N
            </TxIconChip>
            Nexus
          </span>
          <span class="console__divider" aria-hidden="true" />

          <TxDropdownMenu v-model="workspaceMenuOpen" placement="bottom-start" :min-width="268" @close="onMenuClose('workspace')">
            <template #trigger>
              <button type="button" class="console__ws" data-console-trigger="workspace" :aria-label="copy.switchWorkspace(workspaceName)">
                <TxIconChip :size="24" :radius="7" :tone="currentWorkspace.tone" variant="soft" :font-size="10">
                  {{ L(currentWorkspace.mark) }}
                </TxIconChip>
                <span class="console__ws-name">{{ workspaceName }}</span>
                <span class="console__ws-region">· {{ regionName }}</span>
                <i class="i-carbon-chevron-down console__ws-caret" aria-hidden="true" />
              </button>
            </template>
            <div class="console__menu-head">
              {{ copy.workspacesHead }}
            </div>
            <TxDropdownItem v-for="ws in WORKSPACES" :key="ws.id" @select="switchWorkspace(ws.id)">
              <span class="console__menu-row">
                <TxIconChip :size="24" :radius="7" :tone="ws.tone" variant="soft" :font-size="10">
                  {{ L(ws.mark) }}
                </TxIconChip>
                <span class="console__menu-stack">
                  <span class="console__menu-label">{{ L(ws.name) }}</span>
                  <span class="console__menu-desc">{{ L(ws.kind) }} · {{ copy.people(MEMBERSHIP[ws.id].length) }}</span>
                </span>
              </span>
              <template v-if="ws.id === workspace" #right>
                <i class="i-carbon-checkmark console__check" aria-hidden="true" />
                <span class="console__sr">{{ copy.current }}</span>
              </template>
            </TxDropdownItem>
            <TxDropdownSubmenu :min-width="176">
              <span class="console__menu-row">
                <i class="i-carbon-location" aria-hidden="true" />
                <span class="console__menu-label">{{ copy.region }}</span>
              </span>
              <template #right>
                <span class="console__menu-value">{{ regionName }}</span>
              </template>
              <template #menu>
                <div class="console__menu-head">
                  {{ copy.region }} · {{ copy.regionSample }}
                </div>
                <TxDropdownItem v-for="option in REGIONS" :key="option.id" @select="setRegion(option.id)">
                  <span class="console__menu-row">
                    <i class="i-carbon-earth" aria-hidden="true" />
                    <span class="console__menu-label">{{ L(option.name) }}</span>
                  </span>
                  <template v-if="option.id === region" #right>
                    <i class="i-carbon-checkmark console__check" aria-hidden="true" />
                    <span class="console__sr">{{ copy.current }}</span>
                  </template>
                </TxDropdownItem>
              </template>
            </TxDropdownSubmenu>
            <TxDropdownItem @select="showNote('newWorkspace')">
              <span class="console__menu-row">
                <i class="i-carbon-add" aria-hidden="true" />
                <span class="console__menu-label">{{ copy.newWorkspace }}</span>
              </span>
            </TxDropdownItem>
          </TxDropdownMenu>
        </div>

        <div class="console__end">
          <button ref="searchTriggerRef" type="button" class="console__search" :aria-label="copy.openPalette" @click="openPalette()">
            <i class="i-carbon-search" aria-hidden="true" />
            <span class="console__search-text">
              <span class="console__search-short">{{ copy.search }}</span>
              <span class="console__search-long">{{ copy.searchWide }}</span>
            </span>
            <TxKbd class="console__search-kbd">
              ⌘K
            </TxKbd>
          </button>
          <button type="button" class="console__link" @click="showNote('link', { arg: copy.docs })">
            {{ copy.docs }}
          </button>
          <button type="button" class="console__link" @click="showNote('link', { arg: copy.changelog })">
            {{ copy.changelog }}
          </button>
          <TxTooltip :content="copy.help">
            <TxIconButton icon="i-carbon-help" size="sm" :label="copy.help" @click="showNote('help')" />
          </TxTooltip>

          <TxDropdownMenu v-model="noticeMenuOpen" placement="bottom-end" :min-width="320" @close="onMenuClose('notice')">
            <template #trigger>
              <TxCornerOverlay placement="top-right" :offset-x="-4" :offset-y="-3">
                <TxIconButton data-console-trigger="notice" icon="i-carbon-notification" size="sm" :label="copy.notifications(unread)" />
                <template #overlay>
                  <TxBadge class="console__count" variant="error" :value="unread" :open="unread > 0" />
                </template>
              </TxCornerOverlay>
            </template>
            <div class="console__menu-head">
              {{ copy.noticesHead }}
            </div>
            <TxDropdownItem v-for="notice in noticeViews" :key="notice.id" @select="openNotice(notice.id)">
              <span class="console__notice">
                <span class="console__notice-dot" :class="{ 'is-unread': notice.unread }" aria-hidden="true" />
                <i :class="notice.icon" class="console__notice-icon" aria-hidden="true" />
                <span class="console__menu-stack">
                  <span class="console__notice-text">
                    <span v-if="notice.unread" class="console__sr">{{ copy.unread }}</span>{{ notice.text }}
                  </span>
                  <span class="console__menu-desc">{{ notice.time }}</span>
                </span>
              </span>
            </TxDropdownItem>
            <TxDropdownItem :close-on-select="false" :disabled="unread === 0" @select="markAllRead">
              <span class="console__menu-row">
                <i class="i-carbon-checkmark-outline" aria-hidden="true" />
                <span class="console__menu-label">{{ copy.markAllRead }}</span>
              </span>
            </TxDropdownItem>
          </TxDropdownMenu>

          <TxDropdownMenu v-model="accountMenuOpen" placement="bottom-end" :min-width="240" @close="onMenuClose('account')">
            <template #trigger>
              <button type="button" class="console__user" data-console-trigger="account" :aria-label="copy.account">
                <TxAvatar :name="personName('mia')" size="small" status="online" :background-color="tint('mia').bg" :text-color="tint('mia').ink" />
              </button>
            </template>
            <div class="console__who">
              <strong>{{ personName('mia') }}</strong>
              <span>{{ PEOPLE.mia?.email }}</span>
              <span>{{ workspaceName }} · {{ L(ROLE_LABEL[myRole]) }}</span>
            </div>
            <TxDropdownItem @select="showNote('profile')">
              <span class="console__menu-row"><i class="i-carbon-user-avatar" aria-hidden="true" /><span class="console__menu-label">{{ copy.profile }}</span></span>
            </TxDropdownItem>
            <TxDropdownItem @select="openPalette(menuTrigger('account'))">
              <span class="console__menu-row"><i class="i-carbon-search" aria-hidden="true" /><span class="console__menu-label">{{ copy.palette }}</span></span>
              <template #right>
                <TxKbd>⌘K</TxKbd>
              </template>
            </TxDropdownItem>
            <TxDropdownItem @select="showNote('help')">
              <span class="console__menu-row"><i class="i-carbon-keyboard" aria-hidden="true" /><span class="console__menu-label">{{ copy.shortcuts }}</span></span>
            </TxDropdownItem>
            <TxDropdownItem danger @select="showNote('signout')">
              <span class="console__menu-row"><i class="i-carbon-logout" aria-hidden="true" /><span class="console__menu-label">{{ copy.signOut }}</span></span>
            </TxDropdownItem>
          </TxDropdownMenu>
        </div>
      </header>

      <!-- ─── row 1, narrow: its side cells are buttons, so the menus move
           into a drawer instead of nesting inside them ─── -->
      <TxNavBar class="console__navbar" :safe-area-top="false" :z-index="3" @click-left="drawerOpen = true" @click-right="openPalette()">
        <template #left>
          <span class="console__nav-icon">
            <i class="i-carbon-menu" aria-hidden="true" />
            <span v-if="unread" class="console__nav-dot" aria-hidden="true" />
          </span>
          <span class="console__sr">{{ copy.openMenu(unread) }}</span>
        </template>
        <template #title>
          <div class="console__nav-title">
            {{ detail ? detail.name : copy.sections[section] }} · {{ workspaceName }}
          </div>
        </template>
        <template #right>
          <span class="console__nav-icon">
            <i class="i-carbon-search" aria-hidden="true" />
          </span>
          <span class="console__sr">{{ copy.openPalette }}</span>
        </template>
      </TxNavBar>

      <!-- ─── row 2: section tabs, and the page under them ─── -->
      <TxTabs
        class="console__tabs"
        :model-value="section"
        placement="top"
        :content-padding="0"
        borderless
        indicator-variant="line"
        :animation="tabsAnimation"
        @update:model-value="onTabChange"
      >
        <template #nav-right>
          <div class="console__presence">
            <TxAvatarGroup :max="3" :size="24" :overlap="6">
              <TxAvatar
                v-for="member in onlineMembers"
                :key="member.id"
                :name="member.name"
                status="online"
                :background-color="tint(member.id).bg"
                :text-color="tint(member.id).ink"
              />
            </TxAvatarGroup>
            <span class="console__presence-text">
              <TxTextMorph :text="copy.online(onlineMembers.length)" />
            </span>
          </div>
        </template>

        <TxTabHeader>
          <div class="console__head">
            <div class="console__head-main">
              <TxBreadcrumb class="console__crumbs" :items="crumbs" @click="onCrumb" />
              <p class="console__head-sub">
                <span v-if="section === 'overview' && !detail" class="console__greeting">
                  {{ copy.greeting(workspaceName, releasesThisWeek) }}
                </span>
                <span :class="{ 'console__head-plain': section === 'overview' && !detail }">{{ headSub }}</span>
              </p>
            </div>
            <div class="console__head-actions">
              <TxButton class="console__invite" size="sm" variant="secondary" icon="i-carbon-user-follow" @click="invite">
                {{ copy.invite }}
              </TxButton>
              <TxSplitButton
                class="console__new"
                size="sm"
                variant="primary"
                icon="i-carbon-add"
                :menu-width="184"
                @click="createProject('plugin')"
                @menu-open-change="onNewMenuChange"
              >
                {{ copy.newProject }}
                <template #menu-icon>
                  <i class="tx-split-button__menu-icon i-carbon-chevron-down" aria-hidden="true" />
                  <span class="console__sr">{{ copy.newProjectMenu }}</span>
                </template>
                <template #menu="{ close }">
                  <div class="console__new-menu">
                    <TxButton
                      v-for="kind in KINDS"
                      :key="kind"
                      size="sm"
                      plain
                      block
                      :icon="KIND_META[kind].icon"
                      @click="close(); createProject(kind)"
                    >
                      {{ copy.newKind(L(KIND_META[kind].label)) }}
                    </TxButton>
                  </div>
                </template>
              </TxSplitButton>
              <TxIconButton class="console__new-compact" icon="i-carbon-add" size="sm" :label="copy.newProject" @click="createProject('plugin')" />
            </div>
          </div>
        </TxTabHeader>

        <TxTabItem name="overview">
          <template #name>
            {{ copy.sections.overview }}
          </template>
          <div class="console__overview">
            <section class="console__block console__recent" :aria-label="copy.recentProjects">
              <header class="console__block-head">
                <h3>{{ copy.recentProjects }}</h3>
                <button type="button" class="console__more" @click="goTo('projects')">
                  {{ copy.viewAll }}
                  <i class="i-carbon-arrow-right" aria-hidden="true" />
                </button>
              </header>
              <TransitionGroup tag="div" name="console-card" class="console__grid">
                <TxCard
                  v-for="project in projectViews"
                  :key="project.id"
                  class="console__card"
                  clickable
                  :radius="14"
                  :padding="14"
                  @click="openProject(project.id)"
                >
                  <div class="console__card-top">
                    <TxIconChip :size="32" :radius="9" :tone="project.tone" variant="soft">
                      <i :class="project.icon" />
                    </TxIconChip>
                    <div class="console__card-title">
                      <strong>{{ project.name }}</strong>
                      <span>{{ project.meta }}</span>
                    </div>
                  </div>
                  <div class="console__card-status">
                    <TxStatusBadge :text="project.statusText" :status="project.statusTone" size="sm" />
                    <span class="console__card-line">{{ project.line }}</span>
                  </div>
                  <TxProgressBar
                    v-if="project.status === 'building'"
                    class="console__card-progress"
                    :percentage="project.progress"
                    height="4px"
                    :aria-label="copy.buildProgress(project.name)"
                  />
                  <div class="console__card-foot">
                    <TxAvatarGroup :max="3" :size="22" :overlap="6">
                      <TxAvatar
                        v-for="editor in project.editors"
                        :key="editor"
                        :name="personName(editor)"
                        :background-color="tint(editor).bg"
                        :text-color="tint(editor).ink"
                      />
                    </TxAvatarGroup>
                    <span>{{ project.editing }}</span>
                  </div>
                </TxCard>
              </TransitionGroup>
            </section>

            <section class="console__block console__queue" :aria-label="copy.queue">
              <header class="console__block-head">
                <h3>{{ copy.queue }}</h3>
                <span class="console__block-meta">{{ queueViews.length }}</span>
              </header>
              <ul class="console__rows">
                <li v-for="project in queueViews" :key="project.id">
                  <TxCardItem role="button" clickable :title="project.name" :subtitle="project.line" @click="openProject(project.id)">
                    <template #avatar>
                      <TxIconChip :size="30" :radius="9" :tone="project.tone" variant="soft">
                        <i :class="project.icon" />
                      </TxIconChip>
                    </template>
                    <template #right>
                      <TxStatusBadge :text="project.statusText" :status="project.statusTone" size="sm" />
                    </template>
                    <template v-if="project.status === 'building'" #description>
                      <TxProgressBar :percentage="project.progress" height="4px" :aria-label="copy.buildProgress(project.name)" />
                    </template>
                  </TxCardItem>
                </li>
              </ul>
            </section>

            <!-- In the column this wrapper dissolves (display: contents) and
                 only the feed keeps a grid area; wide, it is the rail. A div,
                 not an aside: `display: contents` drops a landmark in some
                 engines. -->
            <div class="console__rail">
              <section class="console__block console__online" :aria-label="copy.onlineHead">
                <header class="console__block-head">
                  <h3>{{ copy.onlineHead }}</h3>
                  <span class="console__block-meta">{{ onlineMembers.length }} / {{ members.length }}</span>
                </header>
                <ul class="console__rows">
                  <li v-for="member in onlineMembers" :key="member.id">
                    <TxCardItem :title="member.name" :subtitle="L(ROLE_LABEL[member.role])" align="center">
                      <template #avatar>
                        <TxAvatar :name="member.name" :size="28" status="online" :background-color="tint(member.id).bg" :text-color="tint(member.id).ink" />
                      </template>
                    </TxCardItem>
                  </li>
                </ul>
              </section>

              <section class="console__block console__weekly" :aria-label="copy.weekly">
                <header class="console__block-head">
                  <h3>{{ copy.weekly }}</h3>
                  <span class="console__block-meta">{{ copy.builds(weeklyTotal) }} · {{ copy.sample }}</span>
                </header>
                <div class="console__spark">
                  <TxSparkChart :series="weeklySeries" :aria-label="`${copy.weekly} · ${copy.sample}`" :padding="SPARK_PADDING" />
                </div>
              </section>

              <section class="console__block console__feed" :aria-label="copy.activity">
                <header class="console__block-head">
                  <h3>{{ copy.activity }}</h3>
                </header>
                <TransitionGroup tag="ul" name="console-row" class="console__rows">
                  <li v-for="entry in activityViews.slice(0, 5)" :key="entry.id">
                    <TxCardItem :title="entry.text" :subtitle="entry.time" align="center">
                      <template #avatar>
                        <TxAvatar :name="personName(entry.actor)" :size="26" :background-color="tint(entry.actor).bg" :text-color="tint(entry.actor).ink" />
                      </template>
                    </TxCardItem>
                  </li>
                </TransitionGroup>
              </section>
            </div>
          </div>
        </TxTabItem>

        <TxTabItem name="projects">
          <template #name>
            {{ copy.sections.projects }}
            <TxBadge class="console__tab-count" :value="wsProjects.length" />
          </template>

          <div v-if="detail" class="console__page console__detail">
            <div class="console__detail-head">
              <TxIconChip :size="44" :radius="12" :tone="detail.tone" variant="soft">
                <i :class="detail.icon" />
              </TxIconChip>
              <div class="console__detail-title">
                <h3>{{ detail.name }}</h3>
                <span>{{ detail.meta }}</span>
              </div>
              <TxStatusBadge :text="detail.statusText" :status="detail.statusTone" />
            </div>
            <div class="console__detail-line">
              <span>{{ detail.line }}</span>
              <TxProgressBar
                v-if="detail.status === 'building'"
                :percentage="detail.progress"
                height="6px"
                :aria-label="copy.buildProgress(detail.name)"
              />
            </div>
            <dl class="console__facts">
              <div>
                <dt>{{ copy.facts.builds }}</dt>
                <dd>{{ detail.status === 'draft' ? '—' : weekly[weekly.length - 1] }}</dd>
              </div>
              <div>
                <dt>{{ copy.facts.duration }}</dt>
                <dd>{{ detail.status === 'draft' ? '—' : copy.durationValue }}</dd>
              </div>
              <div>
                <dt>{{ copy.facts.updated }}</dt>
                <dd>{{ copy.ago(detail.minutes) }}</dd>
              </div>
            </dl>
            <p class="console__sample">
              {{ copy.sample }}
            </p>

            <section class="console__block" :aria-label="copy.versions">
              <header class="console__block-head">
                <h3>{{ copy.versions }}</h3>
              </header>
              <ul v-if="versionHistory(detail).length" class="console__rows">
                <li v-for="entry in versionHistory(detail)" :key="entry.version">
                  <TxCardItem :title="`v${entry.version}`" :subtitle="entry.when" align="center">
                    <template #avatar>
                      <TxIconChip :size="26" :radius="8" tone="neutral" variant="soft">
                        <i class="i-carbon-deploy" />
                      </TxIconChip>
                    </template>
                    <template #right>
                      <TxStatusBadge :text="L(STATUS_META[entry.status].label)" :status="STATUS_META[entry.status].tone" size="sm" />
                    </template>
                  </TxCardItem>
                </li>
              </ul>
              <p v-else class="console__muted">
                {{ copy.notPublished }}
              </p>
            </section>

            <section class="console__block" :aria-label="copy.collaborators">
              <header class="console__block-head">
                <h3>{{ copy.collaborators }}</h3>
              </header>
              <ul class="console__rows">
                <li v-for="editor in detail.editors" :key="editor">
                  <TxCardItem :title="`${personName(editor)}${editor === 'mia' ? copy.you : ''}`" :subtitle="L(PRESENCE_LABEL[presence[editor] ?? 'offline'])" align="center">
                    <template #avatar>
                      <TxAvatar :name="personName(editor)" :size="28" :status="presence[editor] ?? 'offline'" :background-color="tint(editor).bg" :text-color="tint(editor).ink" />
                    </template>
                  </TxCardItem>
                </li>
              </ul>
            </section>
          </div>

          <div v-else class="console__page">
            <div class="console__toolbar">
              <div class="console__chips">
                <TxFilterChips :model-value="kindFilter" :items="kindChips" :aria-label="copy.filterLabel" @update:model-value="kindFilter = $event as KindFilter" />
              </div>
              <div class="console__filter">
                <TxSearchInput v-model="query" :placeholder="copy.filterPlaceholder" :aria-label="copy.filterPlaceholder" />
              </div>
            </div>
            <ul v-if="filteredProjects.length" class="console__rows console__list">
              <li v-for="project in filteredProjects" :key="project.id">
                <TxCardItem role="button" clickable :title="project.name" :subtitle="project.meta" align="center" @click="openProject(project.id)">
                  <template #avatar>
                    <TxIconChip :size="32" :radius="9" :tone="project.tone" variant="soft">
                      <i :class="project.icon" />
                    </TxIconChip>
                  </template>
                  <template #right>
                    <span class="console__list-line">{{ project.line }}</span>
                    <TxStatusBadge :text="project.statusText" :status="project.statusTone" size="sm" />
                  </template>
                </TxCardItem>
              </li>
            </ul>
            <TxSearchEmpty
              v-else
              size="small"
              :title="copy.noProjects"
              :description="copy.noProjectsHint"
              :primary-action="{ label: copy.clear, variant: 'secondary', size: 'sm' }"
              @primary="kindFilter = 'all'; query = ''"
            >
              <template #icon>
                <i class="i-carbon-folders console__empty-icon" aria-hidden="true" />
              </template>
            </TxSearchEmpty>
          </div>
        </TxTabItem>

        <TxTabItem name="activity">
          <template #name>
            {{ copy.sections.activity }}
          </template>
          <div class="console__page">
            <ul v-if="activityViews.length" class="console__rows console__list">
              <li v-for="entry in activityViews" :key="entry.id">
                <TxCardItem :title="entry.text" :subtitle="entry.time" align="center">
                  <template #avatar>
                    <TxAvatar :name="personName(entry.actor)" :size="30" :background-color="tint(entry.actor).bg" :text-color="tint(entry.actor).ink" />
                  </template>
                </TxCardItem>
              </li>
            </ul>
            <TxEmptyState v-else size="small" :title="copy.noActivity" :description="copy.noActivityHint">
              <template #icon>
                <span class="console__empty-plate" aria-hidden="true"><i class="i-carbon-activity" /></span>
              </template>
            </TxEmptyState>
          </div>
        </TxTabItem>

        <TxTabItem name="members">
          <template #name>
            {{ copy.sections.members }}
          </template>
          <div class="console__page">
            <ul class="console__rows console__list">
              <li v-for="member in members" :key="member.id">
                <TxCardItem :title="`${member.name}${member.id === 'mia' ? copy.you : ''}`" :subtitle="member.email" align="center">
                  <template #avatar>
                    <TxAvatar :name="member.name" :size="32" :status="member.presence" :background-color="tint(member.id).bg" :text-color="tint(member.id).ink" />
                  </template>
                  <template #right>
                    <span class="console__presence-state" :class="`is-${member.presence}`">{{ L(PRESENCE_LABEL[member.presence]) }}</span>
                    <TxTag :label="L(ROLE_LABEL[member.role])" size="sm" variant="soft" :color="member.role === 'owner' ? 'var(--tx-color-primary)' : 'var(--tx-text-color-regular)'" />
                  </template>
                </TxCardItem>
              </li>
            </ul>
          </div>
        </TxTabItem>

        <TxTabItem name="settings" :disabled="!isOwner">
          <template #name>
            <i v-if="!isOwner" class="i-carbon-locked console__tab-lock" aria-hidden="true" />
            {{ copy.sections.settings }}
            <span v-if="!isOwner" class="console__sr">{{ copy.lockedNote }}</span>
          </template>
          <div class="console__page console__page--empty">
            <TxEmptyState :title="copy.settingsTitle" :description="copy.settingsBody">
              <template #icon>
                <span class="console__empty-plate" aria-hidden="true"><i class="i-carbon-settings" /></span>
              </template>
            </TxEmptyState>
          </div>
        </TxTabItem>
      </TxTabs>

      <!-- The panel keeps its box while closed (it fades rather than
           unmounts), so it is inert until it opens. -->
      <div
        class="console__note"
        :class="{ 'is-open': noteOpen }"
        :inert="noteOpen ? undefined : true"
        @mouseenter="holdNote('hover')"
        @mouseleave="releaseNote('hover')"
        @focusin="holdNote('focus')"
        @focusout="onNoteFocusOut"
      >
        <TxToastPanel :open="noteOpen" :tether="false" :stack="0" :aria-label="copy.latest">
          <div v-if="noteShown" class="console__note-body">
            <TxIconChip :size="30" :radius="9" :tone="noteView.tone" variant="soft">
              <i :class="noteView.icon" />
            </TxIconChip>
            <div class="console__note-text">
              <strong>{{ noteView.title }}</strong>
              <span>{{ noteView.body }}</span>
            </div>
            <TxButton v-if="noteTarget" size="sm" variant="secondary" @click="viewNoteTarget">
              {{ copy.view }}
            </TxButton>
          </div>
        </TxToastPanel>
      </div>

      <TxDrawer v-model:visible="drawerOpen" :title="copy.menu" direction="left" size="70%">
        <div class="console-drawer">
          <section>
            <h4>{{ copy.workspacesHead }}</h4>
            <button
              v-for="ws in WORKSPACES"
              :key="ws.id"
              type="button"
              class="console-drawer__row"
              :aria-pressed="ws.id === workspace"
              @click="fromDrawer(() => switchWorkspace(ws.id))"
            >
              <TxIconChip :size="24" :radius="7" :tone="ws.tone" variant="soft" :font-size="10">
                {{ L(ws.mark) }}
              </TxIconChip>
              <span class="console-drawer__label">{{ L(ws.name) }}</span>
              <i v-if="ws.id === workspace" class="i-carbon-checkmark" aria-hidden="true" />
            </button>
          </section>
          <section>
            <h4>{{ copy.noticesHead }}</h4>
            <button
              v-for="notice in noticeViews"
              :key="notice.id"
              type="button"
              class="console-drawer__row"
              @click="fromDrawer(() => openNotice(notice.id))"
            >
              <span class="console__notice-dot" :class="{ 'is-unread': notice.unread }" aria-hidden="true" />
              <span class="console-drawer__label">
                <span v-if="notice.unread" class="console__sr">{{ copy.unread }}</span>{{ notice.text }}
              </span>
            </button>
          </section>
          <section>
            <h4>{{ copy.productsHead }}</h4>
            <div class="console-drawer__apps">
              <button
                v-for="product in PRODUCTS"
                :key="product.id"
                type="button"
                class="console-drawer__app"
                :aria-current="product.id === 'console' ? 'true' : undefined"
                @click="fromDrawer(() => openProduct(product.id))"
              >
                <i :class="product.icon" aria-hidden="true" />
                {{ L(product.short ?? product.name) }}
              </button>
            </div>
          </section>
          <section>
            <h4>{{ personName('mia') }}</h4>
            <button type="button" class="console-drawer__row" @click="fromDrawer(invite)">
              <i class="i-carbon-user-follow" aria-hidden="true" />
              <span class="console-drawer__label">{{ copy.invite }}</span>
            </button>
            <button type="button" class="console-drawer__row is-danger" @click="fromDrawer(() => showNote('signout'))">
              <i class="i-carbon-logout" aria-hidden="true" />
              <span class="console-drawer__label">{{ copy.signOut }}</span>
            </button>
          </section>
        </div>
      </TxDrawer>

      <TxCommandPalette
        v-model="paletteOpen"
        :commands="commands"
        :placeholder="copy.paletteSearch"
        :empty-text="copy.paletteEmpty"
        :aria-label="copy.palette"
        @select="onCommand"
      >
        <template #footer>
          <div class="console__palette-foot">
            <span><TxKbd>↑</TxKbd><TxKbd>↓</TxKbd>{{ copy.paletteKeys.move }}</span>
            <span><TxKbd>↵</TxKbd>{{ copy.paletteKeys.run }}</span>
            <span><TxKbd>Esc</TxKbd>{{ copy.paletteKeys.close }}</span>
          </div>
        </template>
      </TxCommandPalette>
    </div>
  </TemplateFrame>
</template>

<style scoped>
.console {
  --console-line: var(--tx-border-color-lighter, #ebeef5);
  --console-surface: var(--tx-bg-color, #ffffff);
  /* The content canvas sits one step below the cards, so they read as
     objects on a surface without a shadow each. */
  --console-canvas: color-mix(in srgb, var(--tx-bg-color-page, #f2f3f5) 70%, var(--tx-bg-color, #ffffff));

  position: relative;
  display: flex;
  height: 100%;
  min-width: 0;
  flex-direction: column;
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
}

.console__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

/* ─── row 1: global bar ─── */

.console__bar {
  display: flex;
  height: 52px;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 12px 0 10px;
  background: var(--console-surface);
  box-shadow: inset 0 -1px 0 var(--console-line);
}

.console__start,
.console__end {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.console__end {
  flex: none;
}

.console__brand {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 8px;
  margin-left: 4px;
  font-size: 14px;
  font-weight: 600;
}

.console__divider {
  width: 1px;
  height: 20px;
  flex: none;
  margin: 0 4px;
  background: var(--console-line);
}

.console__ws {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 4px 8px 4px 4px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.console__ws:hover {
  background: var(--tx-fill-color-light, #f5f7fa);
}

.console__ws-name {
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.console__ws-region {
  display: none;
  flex: none;
  color: var(--tx-text-color-regular, #606266);
}

.console__ws-caret {
  flex: none;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 14px;
}

/* A search field in looks, a palette trigger in behaviour: the reader types
   into the palette, not into the bar. */
.console__search {
  display: inline-flex;
  width: 220px;
  height: 32px;
  align-items: center;
  gap: 8px;
  padding: 0 5px 0 10px;
  border: 0;
  border-radius: 10px;
  background: var(--tx-fill-color-light, #f5f7fa);
  box-shadow: inset 0 0 0 1px var(--console-line);
  color: var(--tx-text-color-regular, #606266);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  text-align: left;
}

.console__search:hover {
  box-shadow: inset 0 0 0 1px var(--tx-border-color, #dcdfe6);
}

.console__search-text {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.console__search-long {
  display: none;
}

.console__link {
  display: none;
  padding: 6px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--tx-text-color-regular, #606266);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
}

.console__link:hover {
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-primary, #303133);
}

.console__user {
  display: inline-flex;
  margin-left: 2px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
}

.console__ws:focus-visible,
.console__search:focus-visible,
.console__link:focus-visible,
.console__user:focus-visible,
.console__more:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

/* The count rides the bell's corner. The badge is a soft pill, so it gets an
   opaque base or the glyph under it would show through. */
.console__count {
  --tx-badge-bg: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 16%, var(--tx-bg-color, #ffffff));

  min-width: 16px;
  padding: 1px 4px;
  font-size: 10.5px;
  font-weight: 600;
}

/* ─── menus (teleported, so token colours only) ─── */

.console__menu-head {
  padding: 6px 10px 2px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-weight: 500;
}

.console__apps {
  display: grid;
  gap: 4px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.console__app {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.console__app-text,
.console__menu-stack {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.console__app-name,
.console__menu-label {
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
}

.console__app-desc,
.console__menu-desc {
  overflow: hidden;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-weight: 400;
  text-overflow: ellipsis;
}

.console__app.is-current .console__app-desc {
  color: var(--tx-color-primary, #409eff);
}

.console__menu-row {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.console__menu-row > i {
  flex: none;
  font-size: 15px;
  opacity: 0.8;
}

.console__menu-value {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-weight: 400;
}

.console__check {
  color: var(--tx-color-primary, #409eff);
  font-size: 15px;
}

.console__notice {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 8px;
}

.console__notice-dot {
  width: 7px;
  height: 7px;
  flex: none;
  margin-top: 5px;
  border-radius: 50%;
  background: transparent;
}

.console__notice-dot.is-unread {
  background: var(--tx-color-primary, #409eff);
}

.console__notice-icon {
  flex: none;
  margin-top: 1px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 15px;
}

.console__notice-text {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  white-space: normal;
}

.console__who {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 2px;
  padding: 6px 10px 10px;
  box-shadow: inset 0 -1px 0 var(--tx-border-color-lighter, #ebeef5);
}

.console__who strong {
  font-size: 13px;
  font-weight: 600;
}

.console__who span {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.console__new-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.console__new-menu :deep(.tx-button) {
  justify-content: flex-start;
}

/* ─── row 1, narrow ─── */

.console__navbar {
  display: none;
  flex: none;
}

.console__nav-icon {
  position: relative;
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  font-size: 18px;
}

.console__nav-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--tx-color-danger, #f56c6c);
  box-shadow: 0 0 0 2px var(--tx-bg-color, #ffffff);
}

.console__nav-title {
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ─── row 2: tabs ─── */

.console .console__tabs {
  height: auto;
  min-height: 0;
  flex: 1;
}

.console__tabs :deep(.tx-tabs__nav) {
  border-bottom-color: var(--console-line);
  background: var(--console-surface);
}

.console__tabs :deep(.tx-tabs__nav-inner) {
  padding: 0 10px;
}

/* An underline nav: the line indicator marks the page, so the active tab
   drops the filled block the component gives it. */
.console__tabs :deep(.tx-tab-item) {
  margin: 0 2px;
  padding: 12px 8px;
}

.console__tabs :deep(.tx-tab-item.is-active) {
  --fake-color: transparent;
}

.console__tabs :deep(.tx-tab-item.is-active .tx-tab-item__name) {
  font-weight: 600;
}

.console__tabs :deep(.tx-tab-item__name) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.console__tab-count {
  padding: 0 6px;
  font-size: 11px;
}

.console__tab-lock {
  font-size: 13px;
}

.console__tabs :deep(.tx-tabs__nav-extra) {
  padding: 0 12px 0 8px;
}

.console__presence {
  display: flex;
  align-items: center;
  gap: 8px;
}

.console__presence-text {
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
  white-space: nowrap;
}

.console__tabs :deep(.tx-tabs__content-wrapper) {
  padding: 0;
}

.console__tabs :deep(.tx-tabs__content-scroll) {
  background: var(--console-canvas);
}

/* ─── page header ─── */

.console__tabs :deep(.tx-tab-header) {
  --fake-color: var(--console-surface);
  --fake-opacity: 1;

  box-shadow: inset 0 -1px 0 var(--console-line);
}

.console__head {
  display: flex;
  width: 100%;
  min-height: 60px;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
}

.console__head-main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.console__crumbs {
  min-width: 0;
  margin-left: -8px;
}

.console__crumbs :deep(.tx-breadcrumb__link) {
  font-size: 13px;
  white-space: nowrap;
}

.console__crumbs :deep(.tx-breadcrumb__link--current) {
  font-size: 15px;
  font-weight: 600;
}

.console__head-sub {
  overflow: hidden;
  margin: 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.console__greeting {
  display: none;
}

.console__head-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

.console__new-compact {
  display: none;
}

/* ─── pages ─── */

/* A badge beside text keeps its one line: the text next to it is what
   ellipsizes. CJK labels otherwise break between any two characters. */
.console :deep(.tx-status-badge) {
  flex: none;
  white-space: nowrap;
}

.console__overview {
  display: grid;
  box-sizing: border-box;
  grid-template-areas:
    'recent'
    'feed';
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: 16px;
  padding: 16px;
}

.console__block {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 10px;
}

.console__block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.console__block-head h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.console__block-meta {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.console__more {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--tx-text-color-regular, #606266);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

.console__more:hover {
  color: var(--tx-color-primary, #409eff);
}

.console__recent {
  grid-area: recent;
}

.console__queue {
  display: none;
  grid-area: queue;
}

.console__rail {
  display: contents;
}

.console__online,
.console__weekly {
  display: none;
}

.console__feed {
  grid-area: feed;
}

.console__grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}

/* Recent means the last six; the widest stage shows a row of four more. */
.console__grid > .console__card:nth-child(n + 7) {
  display: none;
}

.console__card {
  --tx-surface-color: var(--tx-bg-color, #ffffff);
}

.console__card :deep(.tx-card__body) {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.console__card-top {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.console__card-title {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.console__card-title strong {
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.console__card-title span {
  overflow: hidden;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.console__card-status {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.console__card-line {
  overflow: hidden;
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.console__card-foot {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.console__card-foot > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.console__rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Row lists sit on one card-coloured plate, a hairline between rows. */
.console__list {
  padding: 4px;
  border-radius: 14px;
  background: var(--console-surface);
  box-shadow: 0 0 0 1px var(--console-line);
}

.console__feed .console__rows,
.console__queue .console__rows,
.console__online .console__rows {
  padding: 4px;
  border-radius: 14px;
  background: var(--console-surface);
  box-shadow: 0 0 0 1px var(--console-line);
}

.console__rows :deep(.tx-card-item__title) {
  font-weight: 500;
}

.console__rows :deep(.tx-card-item__desc) {
  margin-top: 8px;
}

.console__list-line {
  display: none;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  white-space: nowrap;
}

.console__presence-state {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.console__presence-state.is-online {
  color: var(--tx-color-success, #67c23a);
}

.console__spark {
  height: 72px;
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--console-surface);
  box-shadow: 0 0 0 1px var(--console-line);
}

.console__page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}

.console__page--empty {
  height: 100%;
  box-sizing: border-box;
  align-items: center;
  justify-content: center;
}

.console__page--empty :deep(.tx-empty-state) {
  max-width: 360px;
}

.console__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.console__chips {
  min-width: 0;
  flex: 1;
}

.console__filter {
  width: 220px;
  flex: none;
}

.console__empty-icon {
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-size: 28px;
}

.console__empty-plate {
  display: inline-flex;
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: var(--tx-color-primary-light-9, #ecf5ff);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--tx-color-primary, #409eff) 18%, transparent);
  color: var(--tx-color-primary, #409eff);
  font-size: 22px;
}

/* ─── project detail ─── */

.console__detail-head {
  display: flex;
  align-items: center;
  gap: 12px;
}

.console__detail-title {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.console__detail-title h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.console__detail-title span {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.console__detail-line {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--tx-text-color-regular, #606266);
  font-size: 13px;
}

.console__facts {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  margin: 0;
}

.console__facts > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--console-surface);
  box-shadow: 0 0 0 1px var(--console-line);
}

.console__facts dt {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.console__facts dd {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.console__sample,
.console__muted {
  margin: -6px 0 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.console__muted {
  margin: 0;
}

/* ─── feedback ─── */

.console__note {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 5;
  width: min(320px, calc(100% - 24px));
  pointer-events: none;
}

.console__note.is-open {
  pointer-events: auto;
}

.console__note-body {
  display: flex;
  align-items: center;
  gap: 10px;
}

.console__note-text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.console__note-text strong {
  font-size: 13px;
  font-weight: 500;
}

.console__note-text span {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  line-height: 1.45;
}

/* ─── drawer (teleported, so token colours only) ─── */

.console-drawer {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 4px 2px 12px;
}

.console-drawer section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.console-drawer h4 {
  margin: 0 0 4px;
  padding: 0 10px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-weight: 500;
}

.console-drawer__row {
  display: flex;
  min-height: 40px;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--tx-text-color-primary, #303133);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  text-align: left;
}

.console-drawer__row:hover {
  background: var(--tx-fill-color-light, #f5f7fa);
}

.console-drawer__row.is-danger {
  color: var(--tx-color-danger, #f56c6c);
}

.console-drawer__row > i {
  flex: none;
  font-size: 16px;
}

.console-drawer__label {
  min-width: 0;
  flex: 1;
  line-height: 1.4;
}

.console-drawer__row .console__notice-dot {
  margin-top: 0;
}

.console-drawer__apps {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 0 4px;
}

.console-drawer__app {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 0;
  border-radius: 10px;
  background: var(--tx-fill-color-light, #f5f7fa);
  color: var(--tx-text-color-primary, #303133);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  text-align: left;
}

.console-drawer__app[aria-current='true'] {
  background: var(--tx-color-primary-light-9, #ecf5ff);
  color: var(--tx-color-primary, #409eff);
}

.console-drawer__row:focus-visible,
.console-drawer__app:focus-visible {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 1px;
}

/* ─── palette footer (teleported, so token colours only) ─── */

.console__palette-foot {
  display: flex;
  gap: 16px;
  padding: 10px 16px;
  border-top: 1px solid var(--tx-border-color-lighter, #ebeef5);
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.console__palette-foot span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* ─── motion ─── */

.console__grid :deep(.console-card-enter-active),
.console__grid :deep(.console-card-move),
.console__feed :deep(.console-row-enter-active),
.console__feed :deep(.console-row-move) {
  transition:
    opacity 0.32s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1)),
    transform 0.32s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.console__grid :deep(.console-card-enter-from) {
  opacity: 0;
  transform: translateY(6px) scale(0.98);
}

.console__feed :deep(.console-row-enter-from) {
  opacity: 0;
  transform: translateY(-6px);
}

/* ─── search collapses before the bar runs out of room ─── */

@container template (max-width: 759px) {
  .console__search {
    width: 32px;
    justify-content: center;
    padding: 0;
    background: transparent;
    box-shadow: none;
    color: var(--tx-text-color-regular, #606266);
    font-size: 16px;
  }

  .console__search:hover {
    background: var(--tx-fill-color-light, #f5f7fa);
    box-shadow: none;
  }

  .console__search-text,
  .console__search-kbd {
    display: none;
  }
}

/* ─── wide: the expanded overlay ─── */

@container template (min-width: 960px) {
  .console__bar {
    height: 56px;
    padding: 0 16px 0 14px;
  }

  .console__ws-region,
  .console__link {
    display: inline-flex;
  }

  .console__search {
    width: 320px;
  }

  .console__search-short {
    display: none;
  }

  .console__search-long {
    display: inline;
  }

  .console__tabs :deep(.tx-tabs__nav-inner) {
    padding: 0 16px;
  }

  .console__head {
    padding: 10px 24px;
  }

  .console__greeting {
    display: inline;
  }

  .console__head-plain {
    display: none;
  }

  .console__overview {
    grid-template-areas:
      'recent rail'
      'queue rail';
    grid-template-columns: minmax(0, 1fr) 300px;
    grid-template-rows: auto 1fr;
    gap: 20px 24px;
    padding: 20px 24px 24px;
  }

  .console__queue {
    display: flex;
  }

  .console__rail {
    grid-area: rail;
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 20px;
  }

  .console__online,
  .console__weekly {
    display: flex;
  }

  .console__list-line {
    display: inline;
  }

  .console__page {
    padding: 20px 24px;
  }
}

@container template (min-width: 1200px) {
  .console__grid > .console__card:nth-child(n + 7):nth-child(-n + 8) {
    display: flex;
  }
}

/* ─── narrow ─── */

@container template (max-width: 639px) {
  .console__bar {
    display: none;
  }

  .console__navbar {
    display: block;
  }

  .console__tabs :deep(.tx-tabs__nav-extra) {
    display: none;
  }

  .console__tabs :deep(.tx-tabs__nav-inner) {
    padding: 0 4px;
  }

  .console__head {
    min-height: 52px;
    padding: 6px 12px;
  }

  .console__crumbs {
    margin-left: -8px;
  }

  .console__crumbs :deep(.tx-breadcrumb__item:not(:last-child)) {
    display: none;
  }

  .console__invite,
  .console__new {
    display: none;
  }

  .console__new-compact {
    display: inline-flex;
  }

  .console__overview,
  .console__page {
    padding: 12px;
  }

  .console__grid > .console__card:nth-child(n + 5) {
    display: none;
  }

  .console__toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .console__filter {
    width: 100%;
  }

  .console__facts {
    grid-template-columns: minmax(0, 1fr);
  }

  .console__note {
    right: 12px;
    bottom: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .console__grid :deep(.console-card-enter-active),
  .console__grid :deep(.console-card-move),
  .console__feed :deep(.console-row-enter-active),
  .console__feed :deep(.console-row-move) {
    transition: none;
  }
}
</style>
