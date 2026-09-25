<script setup lang="ts">
// Onboarding template: the first run of Tuff Desktop in five steps — sign in,
// a workspace, preferences, system permissions, done. The sign-in methods and
// the copy are the real ones (the Nexus sign-in page: Passkey, GitHub,
// LINUX DO and Magic Link, no password field; core-app's first-run guide for
// the rest), and all of it is mocked: nothing leaves the page and no system
// permission is requested. The entrance effects mount on `@enter`, so they
// draw while the reader watches; "Watch the flow" plays the first three steps
// and stops at permissions, which only the reader's click grants.
import type { FormRules } from '@talex-touch/tuffex/form'
import type { IconChipTone } from '@talex-touch/tuffex/icon-chip'
import type { StatusTone } from '@talex-touch/tuffex/status-badge'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, onBeforeUnmount, reactive, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'
import TemplateOnboardingCoreBox from './TemplateOnboardingCoreBox.vue'

type StepKey = 'signin' | 'workspace' | 'prefs' | 'perms' | 'done'
type AuthMethod = 'passkey' | 'github' | 'linuxdo' | 'magic' | 'offline'
type Pending = 'passkey' | 'github' | 'linuxdo' | 'email' | 'join' | null
type WorkspaceMode = 'create' | 'join'
type Swatch = 'primary' | 'success' | 'warning' | 'danger'
type ThemePref = 'light' | 'dark' | 'system'
type LangPref = 'system' | 'zh' | 'en'
type UsageMode = 'guided' | 'self'
type PermKey = 'files' | 'accessibility' | 'screen'
type PermState = 'unchecked' | 'pending' | 'granted' | 'denied'
type RecordHint = 'idle' | 'listening' | 'modifier' | 'reserved'
type NoteKey = 'signedIn' | 'joined' | 'created' | 'hotkey' | 'granted' | 'settings' | 'summoned' | 'finished'

interface Hotkey { meta: boolean, ctrl: boolean, alt: boolean, shift: boolean, key: string }

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))
const colorMode = useColorMode()
const siteDark = computed(() => colorMode.value === 'dark')

const copy = computed(() => zh.value
  ? {
      title: '首启引导',
      setup: 'Tuff · 引导',
      welcome: '欢迎来到 Tuff',
      tagline: '本地优先、AI 原生、可无限扩展的桌面指令中心。',
      watch: '看一遍流程',
      stop: '停止演示',
      progress: '引导进度',
      stepOf: (i: number, n: number) => `${i} / ${n}`,
      steps: {
        signin: { title: '登录', hint: '账户与同步' },
        workspace: { title: '工作区', hint: '个人或团队' },
        prefs: { title: '偏好', hint: '快捷键与外观' },
        perms: { title: '权限', hint: '系统授权' },
        done: { title: '完成', hint: '试按快捷键' },
      } as Record<StepKey, { title: string, hint: string }>,
      stepsLabel: '引导步骤',
      skipped: '已跳过',
      back: '上一步',
      next: '继续',
      start: '开始使用',
      startOver: '重新开始',
      blocked: {
        signin: '选择一种登录方式，或离线继续',
        create: '给空间起个名字',
        join: '接受邀请后继续',
        perms: '必须授予文件访问权限才能继续',
      },
      methods: { passkey: 'Passkey', github: 'GitHub', linuxdo: 'LINUX DO', magic: 'Magic Link', offline: '离线' } as Record<AuthMethod, string>,
      signin: {
        title: '登录 Tuff',
        subtitle: '使用 Magic Link 或其他方式登录。',
        passkey: 'Passkey 登录',
        passkeyHint: '将调用系统 Passkey 完成验证。',
        passkeyPrompt: '确认系统弹出完成验证。',
        redirect: '即将前往第三方完成授权。',
        lastUsed: '上次使用',
        or: '或',
        email: '邮箱',
        continueEmail: '使用邮箱继续',
        emailRequired: '请输入邮箱',
        emailInvalid: '请输入有效邮箱',
        sentTitle: '已发送 Magic Link',
        sentBody: (email: string) => `请查收 ${email}。这是演示，不会真的发出邮件。`,
        changeEmail: '更换邮箱',
        opened: '我已点开链接（演示）',
        offline: '离线继续',
        offlineDesc: '可以不登录继续使用，但无法跨设备同步，也无法使用云端功能。',
        signedIn: (method: string) => `已登录 · ${method}`,
        offlineState: '离线使用',
        change: '更换方式',
      },
      workspace: {
        title: '选择工作区',
        subtitle: '项目、插件与同步都归属于一个工作区，之后可以随时切换。',
        create: '创建个人空间',
        createDesc: '只属于你，适合个人插件与主题。',
        join: '加入团队',
        joinDesc: '1 个待接受的邀请',
        name: '空间名称',
        defaultName: '小满的空间',
        color: '颜色',
        swatches: { primary: '蓝', success: '绿', warning: '橙', danger: '红' } as Record<Swatch, string>,
        invites: '邀请成员（可选）',
        invitePlaceholder: '输入邮箱后回车，最多 5 个',
        ignored: (list: string) => `已忽略无效地址：${list}`,
        inviteTitle: '陈凯 邀请你加入 Tuff Labs',
        inviteMeta: '5 位成员 · 7 天内有效',
        accept: '加入团队',
        accepted: '已加入',
      },
      prefs: {
        title: '偏好设置',
        subtitle: '之后都能在设置里再改。',
        hotkey: '呼出快捷键',
        hotkeyDesc: '在任何应用里唤起 CoreBox',
        record: '录制',
        recordLabel: '录制新的呼出快捷键',
        cancel: '取消',
        listening: '按下新的组合键…',
        hints: {
          idle: '需要带 ⌘、⌃ 或 ⌥；⌘W、⌘T 这类组合会先被浏览器接走。',
          listening: '按下组合键完成录制，Esc 取消。',
          modifier: '需要带 ⌘、⌃ 或 ⌥ 中的至少一个。',
          reserved: '这个组合被浏览器保留，请换一个。',
        } as Record<RecordHint, string>,
        theme: '主题',
        themes: { light: '浅色', dark: '深色', system: '跟随系统' } as Record<ThemePref, string>,
        language: '语言',
        languages: { system: '跟随系统', zh: '简体中文', en: 'English' } as Record<LangPref, string>,
        usage: '使用方式',
        recommended: '推荐',
        guided: '引导模式',
        guidedDesc: '通过完整引导快速了解核心功能。',
        self: '自助探索',
        selfDesc: '按自己的节奏直接探索界面与功能。',
        autoStart: '开机自动启动',
        autoStartDesc: '系统启动时自动运行',
        tray: '显示托盘图标',
        trayDesc: '在菜单栏显示 Tuff 图标',
      },
      perms: {
        title: '权限',
        subtitle: '先完成关键授权，免得第一次搜索时再弹出系统窗口。',
        simulated: '模拟授权',
        required: '必需',
        optional: '可选',
        allow: '允许访问',
        allowLabel: (name: string) => `允许访问：${name}`,
        openSettings: '前往系统设置',
        granting: '请在系统弹窗中点击「允许」',
        deniedHint: '系统已记录拒绝，需前往「系统设置 › 隐私与安全性 › 屏幕录制」手动开启。',
        restart: '重启后生效（示例）',
        rows: {
          files: { title: '文件访问权限', desc: '索引并搜索本机文件，只在本地读取，不会上传。' },
          accessibility: { title: '辅助功能权限', desc: '用于扫描应用和读取前台上下文；自动粘贴还需要自动化权限。' },
          screen: { title: '屏幕录制', desc: '截图翻译与 OCR 需要读取屏幕内容。' },
        } as Record<PermKey, { title: string, desc: string }>,
        status: { unchecked: '未检查', pending: '等待确认', granted: '已授权', denied: '已拒绝' } as Record<PermState, string>,
        summary: (n: number, total: number) => `已授权 ${n}/${total}`,
        privacy: 'Tuff 只在本机读取授权目录，用于搜索、索引和打开文件；除非你主动使用联网的 AI 或同步能力，文件内容不会上传。',
        jit: '麦克风、通知会在首次使用时单独询问。',
        tourHint: '点「允许访问」继续：模板不会替你授权。',
      },
      done: {
        title: '一切就绪',
        subtitle: '一切就绪，开始使用吧。',
        hint: (combo: string) => `按下 ${combo} 可快速唤起 Tuff`,
        change: '可在设置中修改快捷键',
        tryIt: '焦点在模板里时，直接按下这组快捷键。',
        keysLabel: (combo: string) => `快捷键 ${combo}`,
        simulate: '模拟按下',
        summoned: '已唤起 CoreBox（演示）',
        summary: { account: '账户', workspace: '工作区', hotkey: '快捷键', perms: '权限' },
        offlineNote: '离线 · 跨设备同步不可用',
      },
      preview: {
        title: '实时预览',
        desc: '偏好会立即反映在 CoreBox 上',
        perm: { files: '文件', accessibility: '辅助功能', screen: '录屏' } as Record<PermKey, string>,
        summary: (theme: string, lang: string, combo: string) => `主题：${theme} · 语言：${lang} · 快捷键 ${combo}`,
      },
      notes: {
        signedIn: (method: string) => ({ title: `已通过 ${method} 登录（演示）`, body: '账户为 mia@example.com，跨设备同步已开启。' }),
        joined: () => ({ title: '已加入 Tuff Labs', body: '陈凯和另外 4 位成员已经在这里。' }),
        created: (name: string) => ({ title: `已创建「${name}」`, body: '这个空间里的项目与插件只属于你。' }),
        hotkey: (combo: string) => ({ title: `呼出快捷键改为 ${combo}`, body: '也可以在设置 › 快捷键里修改。' }),
        granted: (name: string) => ({ title: `已授予「${name}」（模拟）`, body: '真实应用会在这里读取系统的授权状态。' }),
        settings: () => ({ title: '宿主会打开系统设置（演示）', body: '隐私与安全性 › 屏幕录制，打开开关后回到这里。' }),
        summoned: () => ({ title: '已唤起 CoreBox（演示）', body: '真实应用会在屏幕中央弹出搜索框。' }),
        finished: () => ({ title: '引导完成（演示）', body: '真实应用会关闭引导窗口并打开 CoreBox。' }),
      } as Record<NoteKey, (arg: string) => { title: string, body: string }>,
      latest: '最新消息',
    }
  : {
      title: 'First-run setup',
      setup: 'Tuff setup',
      welcome: 'Welcome to Tuff',
      tagline: 'A local-first, AI-native, and infinitely extensible desktop command center.',
      watch: 'Watch the flow',
      stop: 'Stop the demo',
      progress: 'Setup progress',
      stepOf: (i: number, n: number) => `${i} / ${n}`,
      steps: {
        signin: { title: 'Sign in', hint: 'Account and sync' },
        workspace: { title: 'Workspace', hint: 'Personal or team' },
        prefs: { title: 'Preferences', hint: 'Shortcut and looks' },
        perms: { title: 'Permissions', hint: 'System access' },
        done: { title: 'Done', hint: 'Try the shortcut' },
      } as Record<StepKey, { title: string, hint: string }>,
      stepsLabel: 'Setup steps',
      skipped: 'Skipped',
      back: 'Back',
      next: 'Continue',
      start: 'Get started',
      startOver: 'Start over',
      blocked: {
        signin: 'Pick a sign-in method, or continue offline',
        create: 'Give the space a name',
        join: 'Accept the invitation to continue',
        perms: 'File access permission is required to continue',
      },
      methods: { passkey: 'Passkey', github: 'GitHub', linuxdo: 'LINUX DO', magic: 'Magic Link', offline: 'Offline' } as Record<AuthMethod, string>,
      signin: {
        title: 'Sign in to Tuff',
        subtitle: 'Use Magic Link or another sign-in method.',
        passkey: 'Sign in with Passkey',
        passkeyHint: 'System Passkey verification will be invoked.',
        passkeyPrompt: 'Confirm the system prompt to complete verification.',
        redirect: 'Heading to the provider to authorize.',
        lastUsed: 'Last used',
        or: 'or',
        email: 'Email',
        continueEmail: 'Continue with Email',
        emailRequired: 'Enter your email',
        emailInvalid: 'Please enter a valid email.',
        sentTitle: 'Magic Link sent',
        sentBody: (email: string) => `Check ${email}. This is a demo, so no email actually goes out.`,
        changeEmail: 'Change email',
        opened: 'I opened the link (demo)',
        offline: 'Continue offline',
        offlineDesc: 'You can continue without signing in, but cross-device sync and cloud features will be unavailable.',
        signedIn: (method: string) => `Signed in · ${method}`,
        offlineState: 'Offline',
        change: 'Change method',
      },
      workspace: {
        title: 'Choose a workspace',
        subtitle: 'Projects, plugins and sync belong to a workspace. You can switch any time.',
        create: 'Create a personal space',
        createDesc: 'Just yours, for personal plugins and themes.',
        join: 'Join a team',
        joinDesc: '1 pending invitation',
        name: 'Space name',
        defaultName: 'Mia\'s space',
        color: 'Colour',
        swatches: { primary: 'Blue', success: 'Green', warning: 'Orange', danger: 'Red' } as Record<Swatch, string>,
        invites: 'Invite teammates (optional)',
        invitePlaceholder: 'Type an email and press Enter, up to 5',
        ignored: (list: string) => `Ignored, not an email: ${list}`,
        inviteTitle: 'Kai Chen invited you to Tuff Labs',
        inviteMeta: '5 members · valid for 7 days',
        accept: 'Join team',
        accepted: 'Joined',
      },
      prefs: {
        title: 'Preferences',
        subtitle: 'All of these can be changed in Settings later.',
        hotkey: 'Summon shortcut',
        hotkeyDesc: 'Opens CoreBox from any app',
        record: 'Record',
        recordLabel: 'Record a new summon shortcut',
        cancel: 'Cancel',
        listening: 'Press a new combination…',
        hints: {
          idle: 'Needs ⌘, ⌃ or ⌥. The browser takes combinations like ⌘W and ⌘T before the page sees them.',
          listening: 'Press the combination to record it, Esc to cancel.',
          modifier: 'Include at least one of ⌘, ⌃ or ⌥.',
          reserved: 'The browser keeps that combination. Pick another.',
        } as Record<RecordHint, string>,
        theme: 'Theme',
        themes: { light: 'Light', dark: 'Dark', system: 'System' } as Record<ThemePref, string>,
        language: 'Language',
        languages: { system: 'System', zh: '简体中文', en: 'English' } as Record<LangPref, string>,
        usage: 'How you start',
        recommended: 'Recommended',
        guided: 'Guided tour',
        guidedDesc: 'A walkthrough of the core features first.',
        self: 'Self-guided',
        selfDesc: 'Explore the interface at your own pace.',
        autoStart: 'Launch at login',
        autoStartDesc: 'Start Tuff when the system starts',
        tray: 'Show tray icon',
        trayDesc: 'Keep the Tuff icon in the menu bar',
      },
      perms: {
        title: 'Permissions',
        subtitle: 'Grant the key ones now so the first search does not stop for a system prompt.',
        simulated: 'Simulated',
        required: 'Required',
        optional: 'Optional',
        allow: 'Allow access',
        allowLabel: (name: string) => `Allow access: ${name}`,
        openSettings: 'Open System Settings',
        granting: 'Click "Allow" in the system dialog',
        deniedHint: 'The system recorded a denial. Enable it in System Settings › Privacy & Security › Screen Recording.',
        restart: 'Takes effect after a restart (sample)',
        rows: {
          files: { title: 'File access', desc: 'Index and search files on this device. Read locally only, never uploaded.' },
          accessibility: { title: 'Accessibility', desc: 'Scans apps and reads foreground context; auto paste also needs Automation.' },
          screen: { title: 'Screen recording', desc: 'Screenshot translate and OCR read what is on screen.' },
        } as Record<PermKey, { title: string, desc: string }>,
        status: { unchecked: 'Not checked', pending: 'Waiting', granted: 'Granted', denied: 'Denied' } as Record<PermState, string>,
        summary: (n: number, total: number) => `${n}/${total} granted`,
        privacy: 'Tuff reads authorized folders locally for search, indexing and opening files. File content is not uploaded unless you use an online AI or sync feature.',
        jit: 'Microphone and notifications are requested the first time you use them.',
        tourHint: 'Click Allow access to go on: the template never grants it for you.',
      },
      done: {
        title: 'You\'re all set',
        subtitle: 'You\'re all set. Let\'s get started.',
        hint: (combo: string) => `Press ${combo} to quickly open Tuff`,
        change: 'You can change this shortcut in Settings',
        tryIt: 'With focus inside the template, press the combination.',
        keysLabel: (combo: string) => `Shortcut ${combo}`,
        simulate: 'Simulate the press',
        summoned: 'CoreBox summoned (demo)',
        summary: { account: 'Account', workspace: 'Workspace', hotkey: 'Shortcut', perms: 'Permissions' },
        offlineNote: 'Offline · no cross-device sync',
      },
      preview: {
        title: 'Live preview',
        desc: 'Preferences show up on CoreBox at once',
        perm: { files: 'Files', accessibility: 'Accessibility', screen: 'Screen' } as Record<PermKey, string>,
        summary: (theme: string, lang: string, combo: string) => `Theme: ${theme} · Language: ${lang} · Shortcut ${combo}`,
      },
      notes: {
        signedIn: (method: string) => ({ title: `Signed in with ${method} (demo)`, body: 'Signed in as mia@example.com, cross-device sync on.' }),
        joined: () => ({ title: 'Joined Tuff Labs', body: 'Kai Chen and 4 others are already here.' }),
        created: (name: string) => ({ title: `Created ${name}`, body: 'Projects and plugins in this space are yours alone.' }),
        hotkey: (combo: string) => ({ title: `Summon shortcut is now ${combo}`, body: 'Settings › Shortcuts changes it too.' }),
        granted: (name: string) => ({ title: `${name} granted (simulated)`, body: 'The real app reads the system\'s own permission state here.' }),
        settings: () => ({ title: 'The host would open System Settings (demo)', body: 'Privacy & Security › Screen Recording, then come back here.' }),
        summoned: () => ({ title: 'CoreBox summoned (demo)', body: 'The real app pops the search bar up mid-screen.' }),
        finished: () => ({ title: 'Setup complete (demo)', body: 'The real app closes this window and opens CoreBox.' }),
      } as Record<NoteKey, (arg: string) => { title: string, body: string }>,
      latest: 'Latest message',
    })

/* ─── fixed data ─── */

const STEPS: StepKey[] = ['signin', 'workspace', 'prefs', 'perms', 'done']
const PERM_KEYS: PermKey[] = ['files', 'accessibility', 'screen']
const SWATCHES: Swatch[] = ['primary', 'success', 'warning', 'danger']

// Same-hue ink on the hue's soft fill, as every avatar in the templates does.
const SWATCH_TINT: Record<Swatch, { bg: string, ink: string }> = {
  primary: { bg: 'var(--tx-color-primary-light-9)', ink: 'var(--tx-color-primary)' },
  success: { bg: 'var(--tx-color-success-light-9)', ink: 'var(--tx-color-success)' },
  warning: { bg: 'var(--tx-color-warning-light-9)', ink: 'var(--tx-color-warning)' },
  danger: { bg: 'var(--tx-color-danger-light-9)', ink: 'var(--tx-color-danger)' },
}

const PERM_META: Record<PermKey, { icon: string, tone: IconChipTone, required: boolean }> = {
  files: { icon: 'i-carbon-folder-open', tone: 'accent', required: true },
  accessibility: { icon: 'i-carbon-accessibility', tone: 'green', required: false },
  screen: { icon: 'i-carbon-video', tone: 'orange', required: false },
}

const PERM_TONE: Record<PermState, StatusTone> = {
  unchecked: 'muted',
  pending: 'info',
  granted: 'success',
  denied: 'danger',
}

const TEAM = [
  { id: 'kai', name: { zh: '陈凯', en: 'Kai Chen' }, tint: 'primary' as Swatch },
  { id: 'sam', name: { zh: 'Sam Rivera', en: 'Sam Rivera' }, tint: 'warning' as Swatch },
  { id: 'yining', name: { zh: '周以宁', en: 'Zhou Yining' }, tint: 'danger' as Swatch },
  { id: 'xiang', name: { zh: '李想', en: 'Li Xiang' }, tint: 'success' as Swatch },
  { id: 'mo', name: { zh: '陈默', en: 'Chen Mo' }, tint: 'primary' as Swatch },
]

// The preview's own language, which the Language preference drives — not the
// docs page's.
const PREVIEW_TEXT = {
  zh: {
    placeholder: '搜索应用、文件与插件…',
    rows: [
      { title: 'Visual Studio Code', kind: '应用', icon: 'i-carbon-code' },
      { title: '剪贴板历史', kind: '插件', icon: 'i-carbon-paste' },
      { title: '翻译', kind: '插件', icon: 'i-carbon-translate' },
    ],
  },
  en: {
    placeholder: 'Search apps, files and plugins…',
    rows: [
      { title: 'Visual Studio Code', kind: 'App', icon: 'i-carbon-code' },
      { title: 'Clipboard History', kind: 'Plugin', icon: 'i-carbon-paste' },
      { title: 'Translate', kind: 'Plugin', icon: 'i-carbon-translate' },
    ],
  },
}

const EMAIL_RE = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/
const MODIFIERS = new Set(['Meta', 'Control', 'Alt', 'Shift'])
// Combinations the browser handles before the page, or that a page must not
// take from the reader (close / new tab, quit, reload, address bar, hide).
const RESERVED_KEYS = new Set(['W', 'T', 'N', 'Q', 'R', 'L', 'H', 'M'])
const KEY_NAMES: Record<string, string> = {
  Space: 'Space',
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Enter: '↵',
  Backspace: '⌫',
  Tab: '⇥',
  Slash: '/',
  Period: '.',
  Comma: ',',
  Semicolon: ';',
  Quote: '\'',
  BracketLeft: '[',
  BracketRight: ']',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
}

const isMac = hasWindow() && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)

function defaultHotkey(): Hotkey {
  return { meta: isMac, ctrl: !isMac, alt: false, shift: false, key: 'E' }
}

// From `code`, not `key`: ⌥E on a Mac types "´", and the shortcut is still E.
function keyName(event: KeyboardEvent): string {
  const code = event.code
  if (code.startsWith('Key'))
    return code.slice(3)
  if (code.startsWith('Digit'))
    return code.slice(5)
  return KEY_NAMES[code] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key)
}

function hotkeyParts(hotkey: Hotkey): Array<{ id: 'ctrl' | 'alt' | 'shift' | 'meta' | 'key', label: string }> {
  const parts: Array<{ id: 'ctrl' | 'alt' | 'shift' | 'meta' | 'key', label: string }> = []
  if (hotkey.ctrl)
    parts.push({ id: 'ctrl', label: isMac ? '⌃' : 'Ctrl' })
  if (hotkey.alt)
    parts.push({ id: 'alt', label: isMac ? '⌥' : 'Alt' })
  if (hotkey.shift)
    parts.push({ id: 'shift', label: '⇧' })
  if (hotkey.meta)
    parts.push({ id: 'meta', label: isMac ? '⌘' : 'Win' })
  parts.push({ id: 'key', label: hotkey.key })
  return parts
}

function isEditable(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null
  if (!element)
    return false
  return element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.isContentEditable
}

function prefersReducedMotion(): boolean {
  return hasWindow() && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* ─── state ─── */

const step = ref(0)
const account = ref<AuthMethod | null>(null)
const pending = ref<Pending>(null)
const emailForm = reactive({ email: '' })
const magicSent = ref(false)
const wsMode = ref<WorkspaceMode>('create')
const wsName = ref(copy.value.workspace.defaultName)
const wsSwatch = ref<Swatch>('primary')
const invites = ref<string[]>([])
const ignoredInvites = ref<string[]>([])
const joined = ref(false)
const hotkey = ref<Hotkey>(defaultHotkey())
const recording = ref(false)
const recordHint = ref<RecordHint>('idle')
const theme = ref<ThemePref>('system')
const lang = ref<LangPref>('system')
const usage = ref<UsageMode>('guided')
const autoStart = ref(true)
const showTray = ref(true)
const perms = reactive<Record<PermKey, PermState>>({ files: 'unchecked', accessibility: 'unchecked', screen: 'unchecked' })
const screenDenied = ref(false)
const held = reactive({ ctrl: false, alt: false, shift: false, meta: false, key: false })
const pressing = ref(false)
const summoned = ref(false)
const finished = ref(false)

const entered = ref(false)
const introKey = ref(0)
const beamOn = ref(false)
const glowOn = ref(false)
const reducedMotion = ref(prefersReducedMotion())
const touring = ref(false)
const tourHint = ref(false)
const flashShortcut = ref(false)

const noteOpen = ref(false)
const noteShown = ref(false)
const noteKey = ref<NoteKey>('signedIn')
const noteArg = ref('')

const rootRef = ref<HTMLElement | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
const headingRef = ref<HTMLElement | null>(null)
const formRef = ref<{ validate: () => Promise<boolean>, clearValidate: () => void } | null>(null)

const passkeyHintId = useId()
const swatchLabelId = useId()
const linuxdoClip = `onb-linuxdo-${useId().replace(/[^\w-]/g, '')}`

let createdNoted = false

/* ─── derived ─── */

const stepKey = computed<StepKey>(() => STEPS[step.value] ?? 'signin')
const busy = computed(() => pending.value !== null)
const progressPct = computed(() => Math.round(((step.value + 1) / STEPS.length) * 100))
const grantedCount = computed(() => PERM_KEYS.filter(key => perms[key] === 'granted').length)
const combo = computed(() => hotkeyParts(hotkey.value).map(part => part.label).join(' '))
const personName = (name: { zh: string, en: string }) => (zh.value ? name.zh : name.en)

const canContinue = computed(() => {
  switch (stepKey.value) {
    case 'signin':
      return account.value !== null
    case 'workspace':
      return wsMode.value === 'create' ? wsName.value.trim().length > 0 : joined.value
    case 'perms':
      return perms.files === 'granted'
    default:
      return true
  }
})

const blockedText = computed(() => {
  if (canContinue.value || busy.value)
    return ''
  const blocked = copy.value.blocked
  switch (stepKey.value) {
    case 'signin':
      return blocked.signin
    case 'workspace':
      return wsMode.value === 'create' ? blocked.create : blocked.join
    case 'perms':
      return blocked.perms
    default:
      return ''
  }
})

const accountText = computed(() => {
  if (!account.value)
    return ''
  if (account.value === 'offline')
    return copy.value.done.offlineNote
  return `${copy.value.methods[account.value]} · mia@example.com`
})

const workspaceText = computed(() => {
  if (account.value === 'offline')
    return copy.value.skipped
  if (wsMode.value === 'join')
    return joined.value ? 'Tuff Labs' : copy.value.steps.workspace.hint
  return wsName.value.trim() || copy.value.workspace.defaultName
})

function stepDescription(key: StepKey, index: number): string {
  const c = copy.value
  if (index > step.value)
    return c.steps[key].hint
  switch (key) {
    case 'signin':
      return account.value ? c.methods[account.value] : c.steps.signin.hint
    case 'workspace':
      return index < step.value || joined.value ? workspaceText.value : c.steps.workspace.hint
    case 'prefs':
      return combo.value
    case 'perms':
      return c.perms.summary(grantedCount.value, PERM_KEYS.length)
    default:
      return c.steps.done.hint
  }
}

// A step already passed can be reopened from the rail; the workspace step
// cannot when the reader went offline, because it was never shown.
function canRevisit(index: number): boolean {
  if (index >= step.value || busy.value)
    return false
  return !(index === 1 && account.value === 'offline')
}

const emailRules = computed<FormRules>(() => ({
  email: [
    { required: true, message: copy.value.signin.emailRequired },
    { validator: (value: string) => EMAIL_RE.test(String(value ?? '').trim()), message: copy.value.signin.emailInvalid },
  ],
}))

const heldParts = computed(() => hotkeyParts(hotkey.value).map(part => ({
  ...part,
  lit: summoned.value || pressing.value || held[part.id],
})))

const previewLang = computed<'zh' | 'en'>(() => (lang.value === 'system' ? (zh.value ? 'zh' : 'en') : lang.value))
const miniDark = computed(() => theme.value === 'dark' || (theme.value === 'system' && siteDark.value))
const miniProps = computed(() => ({
  placeholder: PREVIEW_TEXT[previewLang.value].placeholder,
  keys: hotkeyParts(hotkey.value).map(part => part.label).join(''),
  rows: PREVIEW_TEXT[previewLang.value].rows,
  dark: theme.value === 'dark',
  light: theme.value === 'light' && siteDark.value,
}))
const siteBeamTheme = computed(() => (siteDark.value ? 'dark' : 'light'))
const miniBeamTheme = computed(() => (miniDark.value ? 'dark' : 'light'))
const previewSummary = computed(() => {
  const p = copy.value.prefs
  return copy.value.preview.summary(p.themes[theme.value], p.languages[lang.value], combo.value)
})

const noteView = computed(() => copy.value.notes[noteKey.value](noteArg.value))

const summaryRows = computed(() => {
  const d = copy.value.done.summary
  return [
    { id: 'account', icon: 'i-carbon-user-avatar', title: d.account, value: accountText.value },
    { id: 'workspace', icon: 'i-carbon-workspace', title: d.workspace, value: workspaceText.value },
    { id: 'hotkey', icon: 'i-carbon-keyboard', title: d.hotkey, value: combo.value },
    { id: 'perms', icon: 'i-carbon-security', title: d.perms, value: copy.value.perms.summary(grantedCount.value, PERM_KEYS.length) },
  ]
})

/* ─── timers ─── */

// Three clocks, cleared separately: the entrance, the scripted tour (which
// any reader input stops), and the waits of the reader's own actions (which
// reader input must not cancel).
function timerSet() {
  const ids = new Set<ReturnType<typeof setTimeout>>()
  return {
    at(ms: number, run: () => void) {
      const id = setTimeout(() => {
        ids.delete(id)
        run()
      }, ms)
      ids.add(id)
    },
    clear() {
      for (const id of ids)
        clearTimeout(id)
      ids.clear()
    },
  }
}

const introTimers = timerSet()
const tourTimers = timerSet()
const actionTimers = timerSet()
let noteTimer: ReturnType<typeof setTimeout> | undefined

let noteHovered = false
let noteFocused = false

function armNote(ms: number) {
  clearTimeout(noteTimer)
  noteTimer = setTimeout(() => {
    noteOpen.value = false
  }, ms)
}

// A note closes by itself; a pointer or keyboard focus resting on it holds
// it, and it re-arms once both leave.
function showNote(key: NoteKey, arg = '') {
  noteKey.value = key
  noteArg.value = arg
  noteShown.value = true
  noteOpen.value = true
  if (noteHovered || noteFocused)
    clearTimeout(noteTimer)
  else
    armNote(3200)
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

/* ─── focus ─── */

// A step the reader moved to takes focus on its heading, so the keyboard does
// not fall back to <body> when the old step's controls unmount. Never from the
// tour or the entrance, and never away from something outside the template.
let wantsFocus = false

watch(headingRef, (element) => {
  if (!element || !wantsFocus)
    return
  wantsFocus = false
  const active = document.activeElement
  if (active && active !== document.body && !rootRef.value?.contains(active))
    return
  element.focus({ preventScroll: true })
}, { flush: 'post' })

function goToStep(target: number, options: { focus?: boolean } = {}) {
  let next = Math.max(0, Math.min(STEPS.length - 1, target))
  if (next === 1 && account.value === 'offline')
    next = target > step.value ? 2 : 0
  if (next === step.value)
    return
  recording.value = false
  wantsFocus = options.focus !== false
  step.value = next
}

/* ─── step 1: sign in ─── */

function signIn(method: 'passkey' | 'github' | 'linuxdo') {
  if (busy.value)
    return
  pending.value = method
  actionTimers.at(method === 'passkey' ? 1200 : 1000, () => {
    pending.value = null
    account.value = method
    showNote('signedIn', copy.value.methods[method])
    goToStep(1)
  })
}

async function submitEmail() {
  if (busy.value)
    return
  const valid = await formRef.value?.validate()
  if (!valid)
    return
  pending.value = 'email'
  actionTimers.at(900, () => {
    pending.value = null
    magicSent.value = true
  })
}

function changeEmail() {
  magicSent.value = false
}

function openMagicLink() {
  account.value = 'magic'
  showNote('signedIn', copy.value.methods.magic)
  goToStep(1)
}

function goOffline() {
  if (busy.value)
    return
  account.value = 'offline'
  goToStep(2)
}

function changeMethod() {
  account.value = null
  magicSent.value = false
}

/* ─── step 2: workspace ─── */

function onInvites(next: string[]) {
  const valid = next.filter(value => EMAIL_RE.test(value))
  ignoredInvites.value = next.filter(value => !EMAIL_RE.test(value))
  invites.value = valid
}

function join() {
  if (busy.value || joined.value)
    return
  pending.value = 'join'
  actionTimers.at(1000, () => {
    pending.value = null
    joined.value = true
    showNote('joined')
  })
}

/* ─── step 3: preferences ─── */

function toggleRecording() {
  recording.value = !recording.value
  recordHint.value = recording.value ? 'listening' : 'idle'
}

function stopRecording() {
  if (!recording.value)
    return
  recording.value = false
  recordHint.value = 'idle'
}

// Recording listens on the button, which holds focus while it waits, so no
// key reaches the page. Every key is taken while it listens; Escape cancels
// the recording rather than collapsing the expanded stage.
function onRecordKeydown(event: KeyboardEvent) {
  if (!recording.value)
    return
  event.preventDefault()
  if (event.key === 'Escape') {
    stopRecording()
    return
  }
  if (MODIFIERS.has(event.key))
    return
  const next: Hotkey = { meta: event.metaKey, ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, key: keyName(event) }
  if (!next.meta && !next.ctrl && !next.alt) {
    recordHint.value = 'modifier'
    return
  }
  if ((next.meta || next.ctrl) && !next.alt && RESERVED_KEYS.has(next.key)) {
    recordHint.value = 'reserved'
    return
  }
  hotkey.value = next
  recording.value = false
  recordHint.value = 'idle'
  showNote('hotkey', combo.value)
}

/* ─── step 4: permissions ─── */

// Every grant starts from a click; the wait stands in for the system dialog.
function grant(key: PermKey) {
  if (perms[key] === 'pending' || perms[key] === 'granted')
    return
  tourHint.value = false
  perms[key] = 'pending'
  // Screen recording is refused the first time, as macOS does when the dialog
  // is dismissed: the row then offers System Settings instead.
  const refuse = key === 'screen' && !screenDenied.value
  actionTimers.at(1200, () => {
    if (refuse) {
      screenDenied.value = true
      perms.screen = 'denied'
      return
    }
    perms[key] = 'granted'
    showNote('granted', copy.value.perms.rows[key].title)
  })
}

function openSystemSettings() {
  showNote('settings')
  grant('screen')
}

/* ─── step 5: done ─── */

function summon() {
  if (summoned.value)
    return
  pressing.value = false
  summoned.value = true
  showNote('summoned')
}

function simulatePress() {
  if (summoned.value || pressing.value)
    return
  if (reducedMotion.value) {
    summon()
    return
  }
  pressing.value = true
  actionTimers.at(420, summon)
}

function finish() {
  finished.value = true
  showNote('finished')
}

/* ─── navigation ─── */

function next() {
  if (!canContinue.value || busy.value)
    return
  if (stepKey.value === 'workspace' && wsMode.value === 'create' && !createdNoted) {
    createdNoted = true
    showNote('created', wsName.value.trim())
  }
  goToStep(step.value + 1)
}

function back() {
  if (busy.value)
    return
  goToStep(step.value - 1)
}

function onStepClick(index: number) {
  if (canRevisit(index))
    goToStep(index)
}

/* ─── entrance and tour ─── */

function resetFlow() {
  step.value = 0
  account.value = null
  pending.value = null
  emailForm.email = ''
  formRef.value?.clearValidate()
  magicSent.value = false
  wsMode.value = 'create'
  wsName.value = copy.value.workspace.defaultName
  wsSwatch.value = 'primary'
  invites.value = []
  ignoredInvites.value = []
  joined.value = false
  hotkey.value = defaultHotkey()
  recording.value = false
  recordHint.value = 'idle'
  theme.value = 'system'
  lang.value = 'system'
  usage.value = 'guided'
  autoStart.value = true
  showTray.value = true
  for (const key of PERM_KEYS)
    perms[key] = 'unchecked'
  screenDenied.value = false
  Object.assign(held, { ctrl: false, alt: false, shift: false, meta: false, key: false })
  pressing.value = false
  summoned.value = false
  finished.value = false
  tourHint.value = false
  flashShortcut.value = false
  createdNoted = false
  wantsFocus = false
}

// The logo, the stroked title and the tagline sweep all play once when they
// mount, so they mount here, when the reader can see them; a new key replays.
function playIntro() {
  introTimers.clear()
  reducedMotion.value = prefersReducedMotion()
  entered.value = true
  introKey.value += 1
  beamOn.value = false
  glowOn.value = false
  if (reducedMotion.value)
    return
  introTimers.at(900, () => {
    beamOn.value = true
  })
  introTimers.at(1400, () => {
    glowOn.value = true
  })
}

function stopTour() {
  if (!touring.value)
    return
  tourTimers.clear()
  touring.value = false
  flashShortcut.value = false
  // The tour owns whatever it left spinning.
  pending.value = null
}

// Signs in, joins the team, shows off the shortcut field and stops at the
// permissions step: it never grants a permission, that waits for the reader.
function startTour() {
  tourTimers.clear()
  actionTimers.clear()
  noteOpen.value = false
  resetFlow()
  if (reducedMotion.value) {
    account.value = 'passkey'
    wsMode.value = 'join'
    joined.value = true
    step.value = 3
    tourHint.value = true
    return
  }
  touring.value = true
  tourTimers.at(400, () => {
    pending.value = 'passkey'
  })
  tourTimers.at(1600, () => {
    pending.value = null
    account.value = 'passkey'
    step.value = 1
  })
  tourTimers.at(2500, () => {
    wsMode.value = 'join'
  })
  tourTimers.at(3100, () => {
    pending.value = 'join'
  })
  tourTimers.at(4100, () => {
    pending.value = null
    joined.value = true
    step.value = 2
  })
  tourTimers.at(4700, () => {
    flashShortcut.value = true
  })
  tourTimers.at(5900, () => {
    flashShortcut.value = false
    step.value = 3
    tourHint.value = true
    touring.value = false
  })
}

function toggleTour() {
  if (touring.value)
    stopTour()
  else
    startTour()
}

function onEnter() {
  playIntro()
}

function resetDemo() {
  tourTimers.clear()
  actionTimers.clear()
  touring.value = false
  clearTimeout(noteTimer)
  noteOpen.value = false
  noteShown.value = false
  noteHovered = false
  noteFocused = false
  resetFlow()
  if (entered.value)
    playIntro()
}

function startOver() {
  resetDemo()
  wantsFocus = true
}

/* ─── keyboard ─── */

// The tour toggle stops or starts the tour itself; its own press must not
// count as the reader interrupting.
function fromTourToggle(event: Event): boolean {
  return event.target instanceof Element && event.target.closest('[data-onb-tour]') !== null
}

function onPointerdown(event: PointerEvent) {
  if (!fromTourToggle(event))
    stopTour()
}

// Bound to the template root, not window: the shortcut only counts while
// focus is inside, and the docs page keeps its own keys.
function onKeydown(event: KeyboardEvent) {
  if (!fromTourToggle(event))
    stopTour()
  if (stepKey.value !== 'done' || summoned.value || isEditable(event.target))
    return
  Object.assign(held, { ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey })
  if (MODIFIERS.has(event.key))
    return
  const target = hotkey.value
  const matches = event.metaKey === target.meta && event.ctrlKey === target.ctrl
    && event.altKey === target.alt && event.shiftKey === target.shift && keyName(event) === target.key
  if (!matches)
    return
  event.preventDefault()
  held.key = true
  summon()
}

function onKeyup(event: KeyboardEvent) {
  Object.assign(held, { ctrl: event.ctrlKey, alt: event.altKey, shift: event.shiftKey, meta: event.metaKey, key: false })
}

function onFocusout(event: FocusEvent) {
  const next = event.relatedTarget
  if (!(next instanceof Node) || !rootRef.value?.contains(next))
    Object.assign(held, { ctrl: false, alt: false, shift: false, meta: false, key: false })
}

// The pane scrolls in its own box; each step starts at its top.
watch(step, () => {
  if (scrollRef.value)
    scrollRef.value.scrollTop = 0
})

watch(locale, resetDemo)

onBeforeUnmount(() => {
  introTimers.clear()
  tourTimers.clear()
  actionTimers.clear()
  clearTimeout(noteTimer)
})

defineExpose({ resetDemo })
</script>

<template>
  <TemplateFrame :title="copy.title" :height="560" @enter="onEnter">
    <template #default="{ width }">
      <div
        ref="rootRef"
        class="onb"
        :class="{ 'is-narrow': width > 0 && width < 640, 'is-wide': width >= 960, 'has-preview': width >= 1200 }"
        @pointerdown="onPointerdown"
        @keydown="onKeydown"
        @keyup="onKeyup"
        @focusout="onFocusout"
      >
        <!-- ─── brand rail (≥ 640) ─── -->
        <aside v-if="!(width > 0 && width < 640)" class="onb__rail">
          <div class="onb__brand">
            <!-- The logo's own aria-label is hard-coded English; the name is
                 already the heading beside it. -->
            <span class="onb__logo" :style="{ '--onb-logo': `${width >= 960 ? 72 : 56}px` }" aria-hidden="true">
              <TxTuffLogoStroke v-if="entered" :key="introKey" :size="width >= 960 ? 72 : 56" mode="once" />
            </span>
            <h2 class="onb__welcome">
              <span class="onb__sr">{{ copy.welcome }}</span>
              <TxKeyframeStrokeText
                v-if="entered"
                :key="introKey"
                class="onb__welcome-stroke"
                aria-hidden="true"
                :text="copy.welcome"
                :font-size="width >= 960 ? 32 : 24"
                :font-weight="600"
                :stroke-width="1.5"
                stroke-color="var(--tx-color-primary)"
                fill-color="var(--tx-text-color-primary)"
              />
              <span v-else class="onb__welcome-still" aria-hidden="true">{{ copy.welcome }}</span>
            </h2>
            <p class="onb__tagline">
              <TxGlowText v-if="glowOn" mode="text-clip" :repeat="false" :active="!reducedMotion" color="var(--tx-color-primary)" :duration-ms="1800">
                {{ copy.tagline }}
              </TxGlowText>
              <template v-else>
                {{ copy.tagline }}
              </template>
            </p>
          </div>

          <TxSteps class="onb__steps" direction="vertical" size="small" :active="step" :aria-label="copy.stepsLabel">
            <TxStep
              v-for="(key, index) in STEPS"
              :key="key"
              :step="index"
              :title="copy.steps[key].title"
              :description="stepDescription(key, index)"
              :clickable="canRevisit(index)"
              @click="onStepClick(index)"
            />
          </TxSteps>

          <div class="onb__rail-foot">
            <TxButton data-onb-tour size="sm" variant="ghost" :icon="touring ? 'i-carbon-stop' : 'i-carbon-play'" @click="toggleTour">
              {{ touring ? copy.stop : copy.watch }}
            </TxButton>
          </div>
        </aside>

        <!-- ─── narrow header ─── -->
        <header v-else class="onb__top">
          <div class="onb__top-row">
            <TxIconChip :size="26" :radius="8" tone="ink" :font-size="12">
              T
            </TxIconChip>
            <span class="onb__top-title">{{ copy.setup }}</span>
            <span class="onb__count">{{ copy.stepOf(step + 1, STEPS.length) }}</span>
            <TxIconButton data-onb-tour size="sm" :icon="touring ? 'i-carbon-stop' : 'i-carbon-play'" :label="touring ? copy.stop : copy.watch" @click="toggleTour" />
          </div>
          <TxSteps class="onb__steps onb__steps--row" direction="horizontal" size="small" :active="step" :aria-label="copy.stepsLabel">
            <TxStep
              v-for="(key, index) in STEPS"
              :key="key"
              :step="index"
              :title="copy.steps[key].title"
              :clickable="canRevisit(index)"
              @click="onStepClick(index)"
            />
          </TxSteps>
        </header>

        <!-- ─── the step pane ─── -->
        <main class="onb__main">
          <div class="onb__progress">
            <TxProgressBar class="onb__bar" :percentage="progressPct" height="4px" :aria-label="copy.progress" />
            <span class="onb__count onb__count--bar">{{ copy.stepOf(step + 1, STEPS.length) }}</span>
          </div>

          <div ref="scrollRef" class="onb__scroll">
            <TxTransition preset="slide-fade" :appear="false" class="onb__stage">
              <!-- 1 · sign in -->
              <section v-if="stepKey === 'signin'" key="signin" class="onb__step">
                <header class="onb__head">
                  <h3 ref="headingRef" tabindex="-1">
                    {{ copy.signin.title }}
                  </h3>
                  <p>{{ copy.signin.subtitle }}</p>
                </header>

                <div v-if="account" class="onb__signed">
                  <TxStatusBadge :text="account === 'offline' ? copy.signin.offlineState : copy.signin.signedIn(copy.methods[account])" status="success" size="sm" />
                  <button type="button" class="onb__text-button" @click="changeMethod">
                    {{ copy.signin.change }}
                  </button>
                </div>

                <div class="onb__passkey">
                  <TxBorderBeam class="onb__beam" size="sm" :theme="siteBeamTheme" :active="beamOn && !reducedMotion" :border-radius="10">
                    <TxButton
                      block
                      size="lg"
                      variant="secondary"
                      :loading="pending === 'passkey'"
                      :disabled="busy && pending !== 'passkey'"
                      :aria-describedby="passkeyHintId"
                      @click="signIn('passkey')"
                    >
                      <i class="i-carbon-fingerprint-recognition" aria-hidden="true" />
                      {{ copy.signin.passkey }}
                    </TxButton>
                  </TxBorderBeam>
                  <TxBadge class="onb__last" variant="primary">
                    {{ copy.signin.lastUsed }}
                  </TxBadge>
                </div>
                <p :id="passkeyHintId" class="onb__hint" aria-live="polite">
                  {{ pending === 'passkey' ? copy.signin.passkeyPrompt : pending === 'github' || pending === 'linuxdo' ? copy.signin.redirect : copy.signin.passkeyHint }}
                </p>

                <div class="onb__oauth">
                  <TxButton variant="secondary" :loading="pending === 'github'" :disabled="busy && pending !== 'github'" @click="signIn('github')">
                    <i class="i-carbon-logo-github" aria-hidden="true" />
                    GitHub
                  </TxButton>
                  <TxButton variant="secondary" :loading="pending === 'linuxdo'" :disabled="busy && pending !== 'linuxdo'" @click="signIn('linuxdo')">
                    <svg class="onb__linuxdo" viewBox="0 0 120 120" aria-hidden="true">
                      <clipPath :id="linuxdoClip">
                        <circle cx="60" cy="60" r="47" />
                      </clipPath>
                      <circle fill="#f0f0f0" cx="60" cy="60" r="50" />
                      <rect fill="#1c1c1e" :clip-path="`url(#${linuxdoClip})`" x="10" y="10" width="100" height="30" />
                      <rect fill="#f0f0f0" :clip-path="`url(#${linuxdoClip})`" x="10" y="40" width="100" height="40" />
                      <rect fill="#ffb003" :clip-path="`url(#${linuxdoClip})`" x="10" y="80" width="100" height="30" />
                    </svg>
                    LINUX DO
                  </TxButton>
                </div>

                <div class="onb__or" role="presentation">
                  <span>{{ copy.signin.or }}</span>
                </div>

                <TxForm
                  v-if="!magicSent"
                  ref="formRef"
                  class="onb__email"
                  :model="emailForm"
                  :rules="emailRules"
                  label-position="top"
                  @submit="submitEmail"
                >
                  <TxFormItem :label="copy.signin.email" prop="email">
                    <template #default="{ id, ariaInvalid, ariaDescribedby }">
                      <TxInput
                        :id="id"
                        v-model="emailForm.email"
                        type="email"
                        placeholder="you@example.com"
                        autocomplete="email"
                        :aria-invalid="ariaInvalid"
                        :aria-describedby="ariaDescribedby"
                      />
                    </template>
                  </TxFormItem>
                  <TxButton native-type="submit" variant="primary" block :loading="pending === 'email'" :disabled="busy && pending !== 'email'">
                    {{ copy.signin.continueEmail }}
                  </TxButton>
                </TxForm>
                <div v-else class="onb__sent" role="status">
                  <TxIconChip :size="32" :radius="9" tone="accent" variant="soft">
                    <i class="i-carbon-email" />
                  </TxIconChip>
                  <div class="onb__sent-text">
                    <strong>{{ copy.signin.sentTitle }}</strong>
                    <span>{{ copy.signin.sentBody(emailForm.email) }}</span>
                  </div>
                  <div class="onb__sent-actions">
                    <TxButton size="sm" variant="ghost" @click="changeEmail">
                      {{ copy.signin.changeEmail }}
                    </TxButton>
                    <TxButton size="sm" variant="primary" @click="openMagicLink">
                      {{ copy.signin.opened }}
                    </TxButton>
                  </div>
                </div>

                <div class="onb__offline">
                  <TxButton size="sm" variant="ghost" icon="i-carbon-cloud-offline" :disabled="busy" @click="goOffline">
                    {{ copy.signin.offline }}
                  </TxButton>
                  <span>{{ copy.signin.offlineDesc }}</span>
                </div>
              </section>

              <!-- 2 · workspace -->
              <section v-else-if="stepKey === 'workspace'" key="workspace" class="onb__step">
                <header class="onb__head">
                  <h3 ref="headingRef" tabindex="-1">
                    {{ copy.workspace.title }}
                  </h3>
                  <p>{{ copy.workspace.subtitle }}</p>
                </header>

                <TxRadioGroup v-model="wsMode" class="onb__cards" type="card" :direction="width > 0 && width < 640 ? 'column' : 'row'" :disabled="busy">
                  <TxRadio value="create">
                    <span class="onb__card-title">
                      <i class="i-carbon-workspace" aria-hidden="true" />
                      {{ copy.workspace.create }}
                    </span>
                    <span class="onb__card-desc">{{ copy.workspace.createDesc }}</span>
                  </TxRadio>
                  <TxRadio value="join">
                    <span class="onb__card-title">
                      <i class="i-carbon-user-multiple" aria-hidden="true" />
                      {{ copy.workspace.join }}
                    </span>
                    <span class="onb__card-desc">{{ copy.workspace.joinDesc }}</span>
                  </TxRadio>
                </TxRadioGroup>

                <div v-if="wsMode === 'create'" class="onb__panel">
                  <div class="onb__ws-row">
                    <label class="onb__field onb__field--grow">
                      <span class="onb__label">{{ copy.workspace.name }}</span>
                      <TxInput v-model="wsName" :placeholder="copy.workspace.defaultName" clearable />
                    </label>
                    <TxAvatar
                      class="onb__ws-avatar"
                      :name="wsName.trim() || copy.workspace.defaultName"
                      :size="40"
                      shape="rounded"
                      :background-color="SWATCH_TINT[wsSwatch].bg"
                      :text-color="SWATCH_TINT[wsSwatch].ink"
                    />
                  </div>
                  <div class="onb__field">
                    <span :id="swatchLabelId" class="onb__label">{{ copy.workspace.color }}</span>
                    <TxFlatRadio v-model="wsSwatch" size="sm" :aria-labelledby="swatchLabelId">
                      <TxFlatRadioItem v-for="swatch in SWATCHES" :key="swatch" :value="swatch" :label="copy.workspace.swatches[swatch]">
                        <template #icon>
                          <span class="onb__swatch" :style="{ '--onb-swatch': SWATCH_TINT[swatch].ink }" />
                        </template>
                      </TxFlatRadioItem>
                    </TxFlatRadio>
                  </div>
                  <div class="onb__field">
                    <span class="onb__label">{{ copy.workspace.invites }}</span>
                    <TxTagInput
                      :model-value="invites"
                      :max="5"
                      :placeholder="copy.workspace.invitePlaceholder"
                      @update:model-value="onInvites"
                    />
                    <span class="onb__hint is-warning" aria-live="polite">
                      {{ ignoredInvites.length ? copy.workspace.ignored(ignoredInvites.join(zh ? '、' : ', ')) : '' }}
                    </span>
                  </div>
                </div>

                <TxCard v-else class="onb__invite" :radius="14" :padding="14">
                  <div class="onb__invite-row">
                    <TxAvatar :name="personName(TEAM[0]!.name)" :size="36" :background-color="SWATCH_TINT.primary.bg" :text-color="SWATCH_TINT.primary.ink" />
                    <div class="onb__invite-text">
                      <strong>{{ copy.workspace.inviteTitle }}</strong>
                      <span>{{ copy.workspace.inviteMeta }}</span>
                    </div>
                  </div>
                  <div class="onb__invite-row onb__invite-row--end">
                    <TxAvatarGroup :max="4" :size="24" :overlap="6">
                      <TxAvatar
                        v-for="member in TEAM"
                        :key="member.id"
                        :name="personName(member.name)"
                        :background-color="SWATCH_TINT[member.tint].bg"
                        :text-color="SWATCH_TINT[member.tint].ink"
                      />
                    </TxAvatarGroup>
                    <TxStatusBadge v-if="joined" :text="copy.workspace.accepted" status="success" size="sm" />
                    <TxButton v-else size="sm" variant="primary" :loading="pending === 'join'" @click="join">
                      {{ copy.workspace.accept }}
                    </TxButton>
                  </div>
                </TxCard>
              </section>

              <!-- 3 · preferences -->
              <section v-else-if="stepKey === 'prefs'" key="prefs" class="onb__step">
                <header class="onb__head">
                  <h3 ref="headingRef" tabindex="-1">
                    {{ copy.prefs.title }}
                  </h3>
                  <p>{{ copy.prefs.subtitle }}</p>
                </header>

                <div class="onb__row">
                  <div class="onb__row-text">
                    <span class="onb__row-title">{{ copy.prefs.hotkey }}</span>
                    <span class="onb__row-desc">{{ copy.prefs.hotkeyDesc }}</span>
                  </div>
                  <div class="onb__hotkey">
                    <!-- The ring only exists while the field listens: a
                         rotating border says "recording" without words. -->
                    <TxGradientBorder v-if="recording || flashShortcut" class="onb__keys-ring" border-radius="10px" padding="3px 6px">
                      <span class="onb__keys">
                        <template v-if="recording">{{ copy.prefs.listening }}</template>
                        <template v-else>
                          <TxKbd v-for="part in hotkeyParts(hotkey)" :key="part.id" size="md">{{ part.label }}</TxKbd>
                        </template>
                      </span>
                    </TxGradientBorder>
                    <span v-else class="onb__keys onb__keys--rest">
                      <TxKbd v-for="part in hotkeyParts(hotkey)" :key="part.id" size="md">{{ part.label }}</TxKbd>
                    </span>
                    <TxButton
                      size="sm"
                      :variant="recording ? 'primary' : 'secondary'"
                      :aria-label="recording ? copy.prefs.cancel : copy.prefs.recordLabel"
                      @click="toggleRecording"
                      @keydown="onRecordKeydown"
                      @blur="stopRecording"
                    >
                      {{ recording ? copy.prefs.cancel : copy.prefs.record }}
                    </TxButton>
                  </div>
                </div>
                <p class="onb__hint onb__hint--tight" :class="{ 'is-warning': recordHint === 'modifier' || recordHint === 'reserved' }" aria-live="polite">
                  {{ copy.prefs.hints[recordHint] }}
                </p>

                <div class="onb__row">
                  <span class="onb__row-title">{{ copy.prefs.theme }}</span>
                  <TxFlatRadio v-model="theme" size="sm" :aria-label="copy.prefs.theme">
                    <TxFlatRadioItem value="light" :label="copy.prefs.themes.light" icon="i-carbon-sun" />
                    <TxFlatRadioItem value="dark" :label="copy.prefs.themes.dark" icon="i-carbon-moon" />
                    <TxFlatRadioItem value="system" :label="copy.prefs.themes.system" icon="i-carbon-screen" />
                  </TxFlatRadio>
                </div>

                <div class="onb__row">
                  <span class="onb__row-title">{{ copy.prefs.language }}</span>
                  <TxFlatRadio v-model="lang" size="sm" :aria-label="copy.prefs.language">
                    <TxFlatRadioItem value="system" :label="copy.prefs.languages.system" />
                    <TxFlatRadioItem value="zh" :label="copy.prefs.languages.zh" />
                    <TxFlatRadioItem value="en" :label="copy.prefs.languages.en" />
                  </TxFlatRadio>
                </div>

                <div class="onb__field">
                  <span class="onb__label">{{ copy.prefs.usage }}</span>
                  <TxRadioGroup v-model="usage" class="onb__cards" type="card" :direction="width > 0 && width < 640 ? 'column' : 'row'">
                    <TxRadio value="guided">
                      <span class="onb__card-title">
                        <i class="i-carbon-compass" aria-hidden="true" />
                        {{ copy.prefs.guided }}
                        <TxTag :label="copy.prefs.recommended" size="sm" variant="soft" />
                      </span>
                      <span class="onb__card-desc">{{ copy.prefs.guidedDesc }}</span>
                    </TxRadio>
                    <TxRadio value="self">
                      <span class="onb__card-title">
                        <i class="i-carbon-idea" aria-hidden="true" />
                        {{ copy.prefs.self }}
                      </span>
                      <span class="onb__card-desc">{{ copy.prefs.selfDesc }}</span>
                    </TxRadio>
                  </TxRadioGroup>
                </div>

                <div class="onb__row">
                  <div class="onb__row-text">
                    <span class="onb__row-title">{{ copy.prefs.autoStart }}</span>
                    <span class="onb__row-desc">{{ copy.prefs.autoStartDesc }}</span>
                  </div>
                  <TuffSwitch v-model="autoStart" :aria-label="copy.prefs.autoStart" />
                </div>
                <div class="onb__row">
                  <div class="onb__row-text">
                    <span class="onb__row-title">{{ copy.prefs.tray }}</span>
                    <span class="onb__row-desc">{{ copy.prefs.trayDesc }}</span>
                  </div>
                  <TuffSwitch v-model="showTray" :aria-label="copy.prefs.tray" />
                </div>
              </section>

              <!-- 4 · permissions -->
              <section v-else-if="stepKey === 'perms'" key="perms" class="onb__step">
                <header class="onb__head">
                  <h3 ref="headingRef" tabindex="-1">
                    {{ copy.perms.title }}
                    <TxTag :label="copy.perms.simulated" size="sm" variant="soft" color="var(--tx-text-color-regular)" />
                  </h3>
                  <p>{{ copy.perms.subtitle }}</p>
                </header>

                <p v-if="tourHint && perms.files !== 'granted'" class="onb__callout" role="status">
                  <i class="i-carbon-information" aria-hidden="true" />
                  {{ copy.perms.tourHint }}
                </p>

                <ul class="onb__perms">
                  <li v-for="key in PERM_KEYS" :key="key" class="onb__perm">
                    <TxIconChip :size="32" :radius="9" :tone="PERM_META[key].tone" variant="soft">
                      <i :class="PERM_META[key].icon" />
                    </TxIconChip>
                    <div class="onb__perm-text">
                      <span class="onb__perm-title">
                        {{ copy.perms.rows[key].title }}
                        <TxTag
                          :label="PERM_META[key].required ? copy.perms.required : copy.perms.optional"
                          size="sm"
                          variant="soft"
                          :color="PERM_META[key].required ? 'var(--tx-color-danger)' : 'var(--tx-text-color-regular)'"
                        />
                      </span>
                      <span class="onb__perm-desc">{{ copy.perms.rows[key].desc }}</span>
                      <span v-if="perms[key] === 'pending'" class="onb__perm-note">{{ copy.perms.granting }}</span>
                      <span v-else-if="perms[key] === 'denied'" class="onb__perm-note is-danger">{{ copy.perms.deniedHint }}</span>
                      <span v-else-if="key === 'screen' && perms.screen === 'granted'" class="onb__perm-note">{{ copy.perms.restart }}</span>
                    </div>
                    <div class="onb__perm-side">
                      <TxStatusBadge :text="copy.perms.status[perms[key]]" :status="PERM_TONE[perms[key]]" size="sm" />
                      <TxButton
                        v-if="perms[key] !== 'granted'"
                        size="sm"
                        :variant="PERM_META[key].required ? 'primary' : 'secondary'"
                        :loading="perms[key] === 'pending'"
                        :aria-label="perms[key] === 'denied' ? copy.perms.openSettings : copy.perms.allowLabel(copy.perms.rows[key].title)"
                        @click="perms[key] === 'denied' ? openSystemSettings() : grant(key)"
                      >
                        {{ perms[key] === 'denied' ? copy.perms.openSettings : copy.perms.allow }}
                      </TxButton>
                    </div>
                  </li>
                </ul>

                <div class="onb__perm-summary">
                  <TxProgressBar :percentage="Math.round((grantedCount / PERM_KEYS.length) * 100)" height="4px" :aria-label="copy.perms.summary(grantedCount, PERM_KEYS.length)" />
                  <span>{{ copy.perms.summary(grantedCount, PERM_KEYS.length) }}</span>
                </div>
                <p class="onb__privacy">
                  <i class="i-carbon-locked" aria-hidden="true" />
                  <span>{{ copy.perms.privacy }}</span>
                </p>
                <p class="onb__hint">
                  {{ copy.perms.jit }}
                </p>
              </section>

              <!-- 5 · done -->
              <section v-else key="done" class="onb__step onb__done">
                <header class="onb__head">
                  <h3 ref="headingRef" tabindex="-1" class="onb__done-title">
                    <span class="onb__sr">{{ copy.done.title }}</span>
                    <TxKeyframeStrokeText
                      aria-hidden="true"
                      :text="copy.done.title"
                      :font-size="width >= 960 ? 34 : 28"
                      :font-weight="600"
                      :stroke-width="1.5"
                      stroke-color="var(--tx-color-primary)"
                      fill-color="var(--tx-text-color-primary)"
                    />
                  </h3>
                  <p>{{ copy.done.subtitle }}</p>
                </header>

                <p class="onb__done-hint">
                  <TxGlowText mode="text-clip" :repeat="false" :active="!reducedMotion" color="var(--tx-color-primary)" :duration-ms="1600" :delay-ms="700">
                    {{ copy.done.hint(combo) }}
                  </TxGlowText>
                </p>

                <div class="onb__bigkeys" role="group" :aria-label="copy.done.keysLabel(combo)">
                  <TxKbd
                    v-for="part in heldParts"
                    :key="part.id"
                    class="onb__bigkey"
                    :class="{ 'is-lit': part.lit }"
                    size="md"
                    :tone="part.lit ? 'primary' : 'default'"
                  >
                    {{ part.label }}
                  </TxKbd>
                </div>
                <div class="onb__done-actions">
                  <TxButton size="sm" variant="secondary" icon="i-carbon-mac-command" :disabled="summoned || pressing" @click="simulatePress">
                    {{ copy.done.simulate }}
                  </TxButton>
                  <span class="onb__hint" aria-live="polite">{{ summoned ? copy.done.summoned : copy.done.tryIt }}</span>
                </div>

                <div v-if="summoned && width < 1200" class="onb__done-desk">
                  <TxBorderBeam size="md" :theme="miniBeamTheme" :active="!reducedMotion" :border-radius="14">
                    <TemplateOnboardingCoreBox v-bind="miniProps" />
                  </TxBorderBeam>
                </div>

                <ul class="onb__summary">
                  <li v-for="row in summaryRows" :key="row.id">
                    <TxCardItem :icon-class="row.icon" :title="row.title" :subtitle="row.value" :avatar-size="30" avatar-shape="rounded" />
                  </li>
                </ul>
                <p class="onb__hint">
                  {{ copy.done.change }}
                </p>
              </section>
            </TxTransition>
          </div>

          <footer class="onb__footer">
            <TxButton size="sm" variant="ghost" icon="i-carbon-arrow-left" :disabled="step === 0 || busy" @click="back">
              {{ copy.back }}
            </TxButton>
            <span class="onb__blocked" aria-live="polite">{{ blockedText }}</span>
            <TxButton v-if="stepKey !== 'done'" size="sm" variant="primary" :disabled="!canContinue || busy" @click="next">
              {{ copy.next }}
              <i class="i-carbon-arrow-right" aria-hidden="true" />
            </TxButton>
            <TxButton v-else-if="!finished" size="sm" variant="primary" icon="i-carbon-launch" @click="finish">
              {{ copy.start }}
            </TxButton>
            <TxButton v-else size="sm" variant="secondary" icon="i-carbon-reset" @click="startOver">
              {{ copy.startOver }}
            </TxButton>
          </footer>

          <!-- The panel keeps its box while closed (it fades rather than
               unmounts), so it is inert until it opens. -->
          <div
            class="onb__note"
            :class="{ 'is-open': noteOpen }"
            :inert="noteOpen ? undefined : true"
            @mouseenter="holdNote('hover')"
            @mouseleave="releaseNote('hover')"
            @focusin="holdNote('focus')"
            @focusout="onNoteFocusOut"
          >
            <TxToastPanel :open="noteOpen" :tether="false" :stack="0" :aria-label="copy.latest">
              <div v-if="noteShown" class="onb__note-body">
                <TxIconChip :size="30" :radius="9" tone="accent" variant="soft">
                  <i class="i-carbon-checkmark-outline" />
                </TxIconChip>
                <div class="onb__note-text">
                  <strong>{{ noteView.title }}</strong>
                  <span>{{ noteView.body }}</span>
                </div>
              </div>
            </TxToastPanel>
          </div>
        </main>

        <!-- ─── live preview (≥ 1200) ─── -->
        <aside v-if="width >= 1200" class="onb__preview" :aria-label="copy.preview.title">
          <header class="onb__preview-head">
            <h3>{{ copy.preview.title }}</h3>
            <p>{{ copy.preview.desc }}</p>
          </header>
          <div class="onb__desk">
            <div class="onb__desk-bar" aria-hidden="true">
              <span class="onb__desk-brand">
                <TxIconChip :size="14" :radius="4" tone="ink" :font-size="9">T</TxIconChip>
                Tuff
              </span>
              <span>12:04</span>
            </div>
            <div class="onb__desk-stage">
              <TxBorderBeam v-if="summoned && stepKey === 'done'" size="md" :theme="miniBeamTheme" :active="!reducedMotion" :border-radius="14">
                <TemplateOnboardingCoreBox v-bind="miniProps" />
              </TxBorderBeam>
              <TemplateOnboardingCoreBox v-else v-bind="miniProps" />
            </div>
            <div class="onb__desk-perms">
              <TxStatusBadge v-for="key in PERM_KEYS" :key="key" :text="copy.preview.perm[key]" :status="PERM_TONE[perms[key]]" size="sm" />
            </div>
          </div>
          <p class="onb__preview-summary">
            {{ previewSummary }}
          </p>
        </aside>
      </div>
    </template>
  </TemplateFrame>
</template>

<style scoped>
.onb {
  --onb-line: var(--tx-border-color-lighter, #ebeef5);
  /* Wallpaper blobs: token hues, dimmer on the dark theme, where a saturated
     wash reads as neon rather than light. */
  --wp-primary: 26%;
  --wp-success: 16%;
  --wp-danger: 14%;

  position: relative;
  display: grid;
  height: 100%;
  min-width: 0;
  grid-template-columns: 264px minmax(0, 1fr);
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
}

.dark .onb {
  --wp-primary: 20%;
  --wp-success: 10%;
  --wp-danger: 9%;
}

.onb.is-wide {
  grid-template-columns: 300px minmax(0, 1fr);
}

.onb.has-preview {
  grid-template-columns: 300px minmax(0, 1fr) 380px;
}

.onb.is-narrow {
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr);
}

.onb__sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

/* ─── brand rail ─── */

/* The wallpaper is the rail's own background, so it covers the visible rail
   even when the rail scrolls. */
.onb__rail {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 18px;
  overflow: hidden auto;
  padding: 22px 20px 16px;
  background:
    radial-gradient(90% 55% at 0% 0%, color-mix(in srgb, var(--tx-color-primary, #409eff) var(--wp-primary), transparent), transparent 72%),
    radial-gradient(70% 50% at 100% 42%, color-mix(in srgb, var(--tx-color-success, #67c23a) var(--wp-success), transparent), transparent 72%),
    radial-gradient(90% 50% at 30% 100%, color-mix(in srgb, var(--tx-color-danger, #f56c6c) var(--wp-danger), transparent), transparent 72%),
    var(--tx-bg-color-page, #f2f3f5);
  box-shadow: inset -1px 0 0 var(--onb-line);
}

.onb__brand {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.onb__logo {
  display: block;
  width: var(--onb-logo, 56px);
  height: var(--onb-logo, 56px);
  margin-bottom: 4px;
}

.onb__welcome {
  display: flex;
  min-height: 34px;
  align-items: center;
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  line-height: 1.3;
}

.onb__welcome-stroke {
  max-width: 100%;
}

/* Holds the heading's line until the stroke mounts on entry. */
.onb__welcome-still {
  opacity: 0;
}

.onb__tagline {
  margin: 0;
  color: var(--tx-text-color-regular, #606266);
  font-size: 13px;
  line-height: 1.55;
}

.onb__steps :deep(.tx-step__description) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.onb__rail-foot {
  display: flex;
  margin-top: auto;
}

/* ─── narrow header ─── */

.onb__top {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px 8px;
  background: var(--tx-bg-color-page, #f2f3f5);
  box-shadow: inset 0 -1px 0 var(--onb-line);
}

.onb__top-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.onb__top-title {
  min-width: 0;
  flex: 1;
  font-size: 14px;
  font-weight: 600;
}

.onb__count {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

/* Five titles do not fit a phone row: the markers stay, the names go to the
   accessibility tree only. */
.onb__steps--row :deep(.tx-step__content) {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

/* ─── step pane ─── */

.onb__main {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  background: var(--tx-bg-color, #ffffff);
}

.onb__progress {
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
  padding: 16px 24px 0;
}

.onb__bar {
  min-width: 0;
  flex: 1;
}

.onb.is-narrow .onb__count--bar {
  display: none;
}

.onb.is-narrow .onb__progress {
  padding: 10px 12px 0;
}

.onb__scroll {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
}

.onb__stage {
  box-sizing: border-box;
  max-width: 440px;
  margin: 0 auto;
  padding: 16px 24px 24px;
}

.onb.is-wide .onb__stage {
  max-width: 540px;
  padding-top: 28px;
}

.onb.is-narrow .onb__stage {
  padding: 14px 12px 20px;
}

.onb__step {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.onb__head {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 4px;
}

.onb__head h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.35;
}

.onb__head h3:focus {
  outline: none;
}

.onb__head h3:focus-visible {
  border-radius: 6px;
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 3px;
}

.onb__head p {
  margin: 0;
  color: var(--tx-text-color-regular, #606266);
  font-size: 13px;
  line-height: 1.55;
}

.onb__hint {
  margin: 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  line-height: 1.5;
}

.onb__hint--tight {
  margin-top: -6px;
}

.onb__hint.is-warning {
  color: color-mix(in srgb, var(--tx-color-warning, #e6a23c) 55%, var(--tx-text-color-primary, #303133));
}

.onb__hint:empty {
  display: none;
}

/* ─── sign in ─── */

.onb__signed {
  display: flex;
  align-items: center;
  gap: 10px;
}

.onb__text-button {
  padding: 2px 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--tx-color-primary, #409eff);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

.onb__text-button:hover {
  text-decoration: underline;
}

.onb__passkey {
  position: relative;
  border-radius: 12px;
}

/* The beam clips its content, the button's focus outline with it; the ring
   is redrawn outside the clip. */
.onb__passkey:has(:focus-visible) {
  outline: 2px solid var(--tx-color-primary, #409eff);
  outline-offset: 2px;
}

.onb__beam {
  display: block;
}

.onb__passkey :deep(.tx-button__inner) {
  gap: 8px;
}

.onb__last {
  position: absolute;
  top: 50%;
  right: 12px;
  z-index: 2;
  padding: 1px 6px;
  font-size: 11px;
  pointer-events: none;
  transform: translateY(-50%);
}

.onb__oauth {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.onb__oauth :deep(.tx-button__inner) {
  gap: 8px;
}

.onb__linuxdo {
  width: 16px;
  height: 16px;
  flex: none;
}

.onb__or {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.onb__or::before,
.onb__or::after {
  height: 1px;
  flex: 1;
  background: var(--onb-line);
  content: '';
}

.onb__email {
  gap: 10px;
}

/* TxFormItem's content column does not stretch by default, which left the
   field at its intrinsic width under a full-width button. */
.onb__email :deep(.tx-form-item__content) {
  align-self: stretch;
  width: 100%;
}

.onb__email :deep(.tx-input) {
  width: 100%;
}

.onb__sent {
  display: grid;
  align-items: start;
  gap: 10px 12px;
  grid-template-columns: auto minmax(0, 1fr);
  padding: 14px;
  border-radius: 12px;
  background: var(--tx-fill-color-lighter, #fafafa);
  box-shadow: inset 0 0 0 1px var(--onb-line);
}

.onb__sent-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.onb__sent-text strong {
  font-size: 13px;
  font-weight: 600;
}

.onb__sent-text span {
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
  line-height: 1.5;
}

.onb__sent-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  grid-column: 1 / -1;
}

.onb__offline {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding-top: 12px;
  box-shadow: inset 0 1px 0 var(--onb-line);
}

.onb__offline > span {
  padding-top: 4px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  line-height: 1.5;
}

.onb__offline :deep(.tx-button) {
  flex: none;
}

/* ─── workspace ─── */

.onb__cards {
  width: 100%;
  gap: 10px;
}

.onb__cards :deep(.tx-radio) {
  min-width: 0;
  flex: 1;
}

.onb__card-title {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
  font-weight: 600;
}

.onb__card-desc {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  line-height: 1.45;
}

.onb__panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.onb__ws-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}

.onb__field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.onb__field--grow {
  flex: 1;
}

.onb__label {
  color: var(--tx-text-color-regular, #606266);
  font-size: 13px;
}

.onb__swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--onb-swatch);
}

.onb__invite-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.onb__invite-row--end {
  justify-content: space-between;
  margin-top: 12px;
}

.onb__invite-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.onb__invite-text strong {
  font-size: 13px;
  font-weight: 600;
}

.onb__invite-text span {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

/* ─── preferences ─── */

.onb__row {
  display: flex;
  min-height: 36px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.onb__row-text {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.onb__row-title {
  font-size: 13px;
  font-weight: 500;
}

.onb__row-desc {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.onb__hotkey {
  display: flex;
  flex: none;
  align-items: center;
  gap: 10px;
}

.onb__keys {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  gap: 4px;
  color: var(--tx-color-primary, #409eff);
  font-size: 12px;
  white-space: nowrap;
}

/* The same box the ring's padding gives it, so nothing moves when the ring
   comes and goes. */
.onb__keys--rest {
  padding: 3px 6px;
}

/* ─── permissions ─── */

.onb__callout {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--tx-color-primary-light-9, #ecf5ff);
  color: color-mix(in srgb, var(--tx-color-primary, #409eff) 50%, var(--tx-text-color-primary, #303133));
  font-size: 12px;
  line-height: 1.5;
}

.onb__callout i {
  flex: none;
  margin-top: 2px;
  font-size: 14px;
}

.onb__perms {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.onb__perm {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
}

.onb__perm + .onb__perm {
  box-shadow: inset 0 1px 0 var(--onb-line);
}

.onb__perm-text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 3px;
}

.onb__perm-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}

.onb__perm-desc {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  line-height: 1.5;
}

.onb__perm-note {
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
  line-height: 1.5;
}

.onb__perm-note.is-danger {
  color: color-mix(in srgb, var(--tx-color-danger, #f56c6c) 55%, var(--tx-text-color-primary, #303133));
}

.onb__perm-side {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.onb__perm-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.onb__perm-summary > :first-child {
  min-width: 0;
  flex: 1;
}

.onb__privacy {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  color: var(--tx-text-color-regular, #606266);
  font-size: 12px;
  line-height: 1.55;
}

.onb__privacy i {
  flex: none;
  margin-top: 2px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 14px;
}

/* ─── done ─── */

.onb__done-title {
  min-height: 44px;
}

.onb__done-title :deep(.tx-keyframe-stroke-text) {
  max-width: 100%;
}

.onb__done-hint {
  margin: 0;
  color: var(--tx-text-color-regular, #606266);
  font-size: 14px;
}

.onb__bigkeys {
  display: flex;
  justify-content: center;
  gap: 10px;
  padding: 6px 0;
}

/* TxKbd tops out at 26px; the keycaps outrank its scoped size rule. */
.onb .onb__bigkey {
  min-width: 56px;
  height: 56px;
  padding: 0 14px;
  border-radius: 12px;
  font-size: 22px;
  transition: transform 0.12s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.onb .onb__bigkey.is-lit {
  transform: translateY(2px);
}

.onb__done-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px 12px;
}

.onb__done-desk {
  padding: 18px;
  border-radius: 16px;
  background:
    radial-gradient(70% 80% at 15% 20%, color-mix(in srgb, var(--tx-color-primary, #409eff) 36%, transparent), transparent 70%),
    radial-gradient(60% 70% at 90% 90%, color-mix(in srgb, var(--tx-color-warning, #e6a23c) 28%, transparent), transparent 70%),
    var(--tx-bg-color-page, #f2f3f5);
  box-shadow: inset 0 0 0 1px var(--onb-line);
}

.onb__summary {
  display: grid;
  gap: 4px 12px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
  padding: 0;
  list-style: none;
}

.onb__summary :deep(.tx-card-item) {
  --tx-card-item-padding: 6px 4px;
}

.onb__summary :deep(.tx-card-item__title) {
  font-weight: 500;
}

/* The values are what the reader checks here, so they get resting ink. */
.onb__summary :deep(.tx-card-item__subtitle) {
  color: var(--tx-text-color-regular, #606266);
}

/* ─── footer ─── */

.onb__footer {
  display: flex;
  height: 60px;
  flex: none;
  align-items: center;
  gap: 12px;
  padding: 0 24px;
  box-shadow: inset 0 1px 0 var(--onb-line);
}

.onb.is-narrow .onb__footer {
  padding: 0 12px;
}

.onb__blocked {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.onb__footer :deep(.tx-button__inner) {
  gap: 6px;
}

/* ─── feedback ─── */

.onb__note {
  position: absolute;
  bottom: 72px;
  left: 50%;
  z-index: 5;
  width: min(340px, calc(100% - 24px));
  pointer-events: none;
  transform: translateX(-50%);
}

.onb__note.is-open {
  pointer-events: auto;
}

.onb__note-body {
  display: flex;
  align-items: center;
  gap: 10px;
}

.onb__note-text {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.onb__note-text strong {
  font-size: 13px;
  font-weight: 500;
}

.onb__note-text span {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  line-height: 1.45;
}

/* ─── live preview ─── */

.onb__preview {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  padding: 24px 20px;
  background: color-mix(in srgb, var(--tx-fill-color-lighter, #fafafa) 70%, var(--tx-bg-color, #ffffff));
  box-shadow: inset 1px 0 0 var(--onb-line);
}

.onb__preview-head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.onb__preview-head p {
  margin: 2px 0 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.onb__desk {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
  padding-bottom: 16px;
  border-radius: 14px;
  background:
    radial-gradient(70% 80% at 15% 20%, color-mix(in srgb, var(--tx-color-primary, #409eff) 42%, transparent), transparent 70%),
    radial-gradient(60% 70% at 90% 90%, color-mix(in srgb, var(--tx-color-warning, #e6a23c) 34%, transparent), transparent 70%),
    var(--tx-bg-color-page, #f2f3f5);
  box-shadow: inset 0 0 0 1px var(--onb-line);
}

.onb__desk-bar {
  display: flex;
  height: 24px;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: color-mix(in srgb, var(--tx-bg-color, #ffffff) 58%, transparent);
  color: var(--tx-text-color-regular, #606266);
  font-size: 11px;
}

.onb__desk-brand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.onb__desk-stage {
  padding: 18px 18px 0;
}

.onb__desk-perms {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  padding: 0 12px;
}

.onb__preview-summary {
  margin: 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  line-height: 1.6;
}

/* ─── narrow ─── */

@container template (max-width: 639px) {
  .onb__oauth {
    grid-template-columns: minmax(0, 1fr);
  }

  .onb__row {
    flex-wrap: wrap;
  }

  .onb__perm {
    flex-wrap: wrap;
  }

  .onb__perm-side {
    width: 100%;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    padding-left: 44px;
  }

  .onb__summary {
    grid-template-columns: minmax(0, 1fr);
  }

  .onb__blocked {
    display: none;
  }

  .onb .onb__bigkey {
    min-width: 48px;
    height: 48px;
    font-size: 19px;
  }
}

/* ─── wide ─── */

@container template (min-width: 960px) {
  .onb__rail {
    gap: 22px;
    padding: 28px 26px 20px;
  }

  .onb__welcome {
    min-height: 44px;
    font-size: 32px;
  }

  .onb__tagline {
    font-size: 14px;
  }

  .onb__progress {
    padding: 20px 32px 0;
  }

  .onb__footer {
    padding: 0 32px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .onb .onb__bigkey {
    transition: none;
  }
}
</style>
