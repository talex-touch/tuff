<script setup lang="ts">
// Settings template: sectioned navigation over grouped setting rows that save
// as you go. TxTabs renders only the active panel and unmounts the rest, so
// every value lives in one reactive object here rather than in the rows — a
// row that owned its state would forget it on the next tab switch. When the
// stage is wide, a live preview beside the tabs redraws a small CoreBox from
// the same object.
import type { ImageUploaderFile } from '@talex-touch/tuffex/image-uploader'
import type { StatusTone } from '@talex-touch/tuffex/status-badge'
import { hasWindow } from '@talex-touch/utils/env'
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import TemplateFrame from './TemplateFrame.vue'

type PageKey = 'general' | 'corebox' | 'shortcuts' | 'ai' | 'privacy' | 'account'
type Theme = 'light' | 'dark' | 'system'
type Density = 'compact' | 'cozy' | 'roomy'
type SaveState = 'idle' | 'saving' | 'saved'
type ConfirmKind = 'reset' | 'clear' | 'signout'
type ShortcutId = 'corebox' | 'clipboard' | 'translate' | 'dictation' | 'window' | 'note'

interface SettingsState {
  language: string
  theme: Theme
  opacity: number
  launchAtLogin: boolean
  hotkey: string[]
  recommendations: boolean
  autoPaste: string
  density: Density
  maxResults: number | null
  placeholder: string
  rememberQuery: boolean
  shortcuts: Record<ShortcutId, boolean>
  provider: string
  apiKey: string
  temperature: number
  contextClipboard: boolean
  contextFiles: boolean
  contextWeb: boolean
  retention: string
  excluded: Record<string, boolean>
}

const { locale } = useI18n()
const zh = computed(() => locale.value.startsWith('zh'))

const copy = computed(() => zh.value
  ? {
      title: 'Settings 设置中心',
      navGroups: { app: '通用', intelligence: '智能', account: '账户' },
      pages: { general: '通用', corebox: 'CoreBox', shortcuts: '快捷键', ai: 'AI 模型', privacy: '隐私', account: '账户' } as Record<PageKey, string>,
      version: 'Tuff 2.4.0 · 已是最新',
      save: { idle: '自动保存', saving: '保存中…', saved: '已保存 · 刚刚' } as Record<SaveState, string>,
      reset: '重置',
      appearance: { name: '外观', desc: '语言、主题与窗口质感' },
      language: { title: '语言', desc: '界面与搜索提示的语言', placeholder: '选择语言' },
      theme: { title: '主题', desc: '浅色、深色或跟随系统', light: '浅色', dark: '深色', system: '跟随系统' },
      opacity: { title: '窗口透明度', desc: 'CoreBox 背后透出多少桌面' },
      startup: { name: '启动', desc: '开机与呼出方式' },
      login: { title: '开机启动', desc: '登录后在后台待命' },
      hotkey: { title: '呼出快捷键', desc: '在任何应用里打开 CoreBox', record: '录制', cancel: '取消', press: '按下新的组合键…', recordLabel: '录制新的呼出快捷键' },
      search: { name: '搜索', desc: '结果怎么排、显示多少' },
      recommendations: { title: '显示推荐', desc: '输入框为空时推荐常用项' },
      autoPaste: { title: '自动粘贴', desc: '选中结果后粘贴到前台应用', off: '关闭', after: (s: string) => `${s} 秒后` },
      density: { title: '结果密度', desc: '每一行结果的高度', compact: '紧凑', cozy: '舒适', roomy: '宽松' },
      maxResults: { title: '最多结果', desc: '一次搜索最多显示几条', decrease: '减少', increase: '增加' },
      input: { name: '输入框', desc: '提示文字与记忆' },
      placeholder: { title: '占位文字', desc: '空输入框里显示的提示' },
      remember: { title: '记住上次输入', desc: '重新打开时保留关键词' },
      shortcutGroup: { name: '全局快捷键', desc: '在任何应用里都能触发' },
      filterShortcuts: '筛选快捷键…',
      shortcutCount: (n: number) => `${n} 个快捷键`,
      shortcutNames: { corebox: '打开 CoreBox', clipboard: '剪贴板历史', translate: '截图翻译', dictation: '语音听写', window: '窗口预设', note: '快速笔记' } as Record<ShortcutId, string>,
      builtIn: '内置',
      enableShortcut: (name: string) => `启用「${name}」`,
      noShortcut: '没有匹配的快捷键',
      noShortcutHint: '换个关键词试试。',
      aiRoute: { title: '登录后请求经 Nexus 路由', body: 'AI 请求经 Nexus 转发并计入账户额度；选择本地模型时不经过网络。' },
      model: { name: '模型', desc: '服务商与回答风格' },
      provider: { title: '服务商', desc: '回答问题的模型来自哪里' },
      providers: [
        { value: 'nexus', label: 'Tuff Nexus（推荐）', description: '跟随账户额度，无需密钥', icon: 'i-carbon-cloud' },
        { value: 'openai', label: 'OpenAI 兼容', description: '使用你自己的 API Key', icon: 'i-carbon-api' },
        { value: 'ollama', label: '本地 Ollama', description: '完全离线，速度取决于本机', icon: 'i-carbon-laptop' },
      ],
      temperature: { title: '温度', desc: '越高越发散，越低越稳定' },
      byok: { name: '自带密钥', desc: '选择 OpenAI 兼容服务时使用' },
      apiKey: { label: 'API Key', desc: '只保存在本机钥匙串，不会上传。示例值，并非真实密钥。' },
      context: { name: '可读取的上下文', desc: '回答时允许参考的内容', clipboard: '剪贴板', files: '文件索引', web: '当前网页' },
      privacyNote: { title: '剪贴板历史只保存在这台设备上', body: '开启同步时，只有固定的条目会上传到 Nexus。' },
      retention: { name: '保留时长', desc: '超过期限的记录会自动清理' },
      retentions: [
        { value: '7d', title: '7 天', desc: '适合临时内容' },
        { value: '30d', title: '30 天', desc: '默认，兼顾空间与回溯' },
        { value: 'forever', title: '永久', desc: '直到手动清空' },
      ],
      excludedGroup: { name: '排除的应用', desc: '从这些应用复制的内容不会被记录' },
      excludedApps: { onePassword: '1Password', keychain: '钥匙串访问', incognito: '浏览器无痕窗口', terminal: '终端' } as Record<string, string>,
      excludedDesc: { onePassword: '密码管理器', keychain: '系统密码', incognito: 'Chrome、Arc、Safari', terminal: '命令行输出' } as Record<string, string>,
      exclude: (name: string) => `不记录「${name}」`,
      danger: { name: '危险操作', desc: '无法撤销' },
      clear: { title: '清空剪贴板历史', desc: (n: number) => `当前共 ${n} 条记录`, button: '清空…', done: (n: number) => `已清空 ${n} 条记录` },
      profile: { name: '资料', desc: '头像与显示名称', displayName: '显示名称', upload: '上传', remove: (name?: string) => `移除${name ? `「${name}」` : '头像'}` },
      userName: '林小满',
      accountRows: { email: '邮箱', plan: '套餐', planValue: 'Team · 5 席位' },
      sessions: { name: '会话', desc: '登录的设备', title: '在其他设备上退出', desc2: (n: number) => `${n} 台设备已登录`, button: '退出…', done: '已在其他设备上退出' },
      modal: {
        reset: { title: '重置所有设置？', body: '所有分区都会恢复默认值，账户资料与剪贴板历史不受影响。', confirm: '重置' },
        clear: { title: '清空剪贴板历史？', body: (n: number) => `将删除 ${n} 条记录，这个操作无法撤销。`, pinned: '同时清除 12 条固定内容', confirm: '清空' },
        signout: { title: '在其他设备上退出？', body: '其他设备需要重新登录，这台设备保持登录。', confirm: '退出' },
        cancel: '取消',
      },
      preview: {
        title: '实时预览',
        desc: '改动立即反映在 CoreBox 上',
        empty: '输入以开始搜索',
        more: (n: number) => `还有 ${n} 条结果`,
        summary: (theme: string, opacity: number, density: string, max: number) => `${theme} · 透明度 ${opacity}% · ${density} · 最多 ${max} 条`,
        rows: [
          { title: 'Visual Studio Code', kind: '应用', icon: 'i-carbon-code' },
          { title: '剪贴板历史', kind: '插件', icon: 'i-carbon-paste' },
          { title: 'Q3-roadmap.pdf', kind: '文件', icon: 'i-carbon-document-pdf' },
          { title: '会议纪要 — Q3 路线图', kind: '剪贴板', icon: 'i-carbon-document' },
          { title: '翻译', kind: '插件', icon: 'i-carbon-translate' },
          { title: '总结剪贴板', kind: 'AI', icon: 'i-carbon-machine-learning-model' },
        ],
      },
      sensitive: {
        reveal: '点击显示',
        copy: '复制',
        copied: '已复制',
        hide: '隐藏',
        show: '显示',
        hidden: '已隐藏',
        masked: '已遮盖。',
        copySuccess: '已复制到剪贴板',
        instruction: '点击或按 Enter 显示。',
        fallbackName: '敏感值',
      },
    }
  : {
      title: 'Settings',
      navGroups: { app: 'General', intelligence: 'Intelligence', account: 'Account' },
      pages: { general: 'General', corebox: 'CoreBox', shortcuts: 'Shortcuts', ai: 'AI models', privacy: 'Privacy', account: 'Account' } as Record<PageKey, string>,
      version: 'Tuff 2.4.0 · up to date',
      save: { idle: 'Autosave', saving: 'Saving…', saved: 'Saved · just now' } as Record<SaveState, string>,
      reset: 'Reset',
      appearance: { name: 'Appearance', desc: 'Language, theme and window finish' },
      language: { title: 'Language', desc: 'For the interface and search hints', placeholder: 'Choose a language' },
      theme: { title: 'Theme', desc: 'Light, dark or follow the system', light: 'Light', dark: 'Dark', system: 'System' },
      opacity: { title: 'Window opacity', desc: 'How much desktop shows behind CoreBox' },
      startup: { name: 'Startup', desc: 'Launch and summon' },
      login: { title: 'Launch at login', desc: 'Waits in the background after sign-in' },
      hotkey: { title: 'Summon shortcut', desc: 'Opens CoreBox from any app', record: 'Record', cancel: 'Cancel', press: 'Press a new combination…', recordLabel: 'Record a new summon shortcut' },
      search: { name: 'Search', desc: 'How results rank and how many show' },
      recommendations: { title: 'Show suggestions', desc: 'Suggest frequent picks on an empty query' },
      autoPaste: { title: 'Auto paste', desc: 'Paste a picked result into the front app', off: 'Off', after: (s: string) => `After ${s} s` },
      density: { title: 'Result density', desc: 'Height of each result row', compact: 'Compact', cozy: 'Cozy', roomy: 'Roomy' },
      maxResults: { title: 'Max results', desc: 'How many one search shows', decrease: 'Decrease', increase: 'Increase' },
      input: { name: 'Input', desc: 'Hint text and memory' },
      placeholder: { title: 'Placeholder', desc: 'Shown in the empty field' },
      remember: { title: 'Remember last query', desc: 'Keep the words when it reopens' },
      shortcutGroup: { name: 'Global shortcuts', desc: 'Work from any app' },
      filterShortcuts: 'Filter shortcuts…',
      shortcutCount: (n: number) => `${n} shortcut${n === 1 ? '' : 's'}`,
      shortcutNames: { corebox: 'Open CoreBox', clipboard: 'Clipboard history', translate: 'Screenshot translate', dictation: 'Dictation', window: 'Window presets', note: 'Quick note' } as Record<ShortcutId, string>,
      builtIn: 'Built in',
      enableShortcut: (name: string) => `Enable ${name}`,
      noShortcut: 'No matching shortcuts',
      noShortcutHint: 'Try another word.',
      aiRoute: { title: 'Signed-in requests route through Nexus', body: 'AI requests go through Nexus and count against your plan; a local model never leaves the machine.' },
      model: { name: 'Model', desc: 'Provider and answer style' },
      provider: { title: 'Provider', desc: 'Where answers come from' },
      providers: [
        { value: 'nexus', label: 'Tuff Nexus (recommended)', description: 'Uses your plan, no key needed', icon: 'i-carbon-cloud' },
        { value: 'openai', label: 'OpenAI compatible', description: 'Bring your own API key', icon: 'i-carbon-api' },
        { value: 'ollama', label: 'Local Ollama', description: 'Fully offline, as fast as this machine', icon: 'i-carbon-laptop' },
      ],
      temperature: { title: 'Temperature', desc: 'Higher wanders, lower stays steady' },
      byok: { name: 'Your own key', desc: 'Used with OpenAI-compatible providers' },
      apiKey: { label: 'API key', desc: 'Kept in this machine\'s keychain, never uploaded. A sample value, not a real key.' },
      context: { name: 'Context it can read', desc: 'What answers may draw on', clipboard: 'Clipboard', files: 'File index', web: 'Current web page' },
      privacyNote: { title: 'Clipboard history stays on this device', body: 'With sync on, only pinned items upload to Nexus.' },
      retention: { name: 'Retention', desc: 'Older records are cleaned up automatically' },
      retentions: [
        { value: '7d', title: '7 days', desc: 'For throwaway clips' },
        { value: '30d', title: '30 days', desc: 'Default: room to look back' },
        { value: 'forever', title: 'Forever', desc: 'Until you clear it' },
      ],
      excludedGroup: { name: 'Excluded apps', desc: 'Nothing copied from these is recorded' },
      excludedApps: { onePassword: '1Password', keychain: 'Keychain Access', incognito: 'Private browser windows', terminal: 'Terminal' } as Record<string, string>,
      excludedDesc: { onePassword: 'Password manager', keychain: 'System passwords', incognito: 'Chrome, Arc, Safari', terminal: 'Command output' } as Record<string, string>,
      exclude: (name: string) => `Skip ${name}`,
      danger: { name: 'Danger zone', desc: 'Cannot be undone' },
      clear: { title: 'Clear clipboard history', desc: (n: number) => `${n} records right now`, button: 'Clear…', done: (n: number) => `Cleared ${n} records` },
      profile: { name: 'Profile', desc: 'Avatar and display name', displayName: 'Display name', upload: 'Upload', remove: (name?: string) => `Remove ${name || 'avatar'}` },
      userName: 'Mia Lin',
      accountRows: { email: 'Email', plan: 'Plan', planValue: 'Team · 5 seats' },
      sessions: { name: 'Sessions', desc: 'Signed-in devices', title: 'Sign out of other devices', desc2: (n: number) => `${n} device${n === 1 ? '' : 's'} signed in`, button: 'Sign out…', done: 'Signed out of other devices' },
      modal: {
        reset: { title: 'Reset all settings?', body: 'Every section goes back to its default. Your profile and clipboard history are kept.', confirm: 'Reset' },
        clear: { title: 'Clear clipboard history?', body: (n: number) => `This deletes ${n} records and cannot be undone.`, pinned: 'Also clear 12 pinned items', confirm: 'Clear' },
        signout: { title: 'Sign out of other devices?', body: 'They will need to sign in again. This device stays signed in.', confirm: 'Sign out' },
        cancel: 'Cancel',
      },
      preview: {
        title: 'Live preview',
        desc: 'Changes show up on CoreBox at once',
        empty: 'Type to start searching',
        more: (n: number) => `${n} more result${n === 1 ? '' : 's'}`,
        summary: (theme: string, opacity: number, density: string, max: number) => `${theme} · ${opacity}% opacity · ${density} · up to ${max}`,
        rows: [
          { title: 'Visual Studio Code', kind: 'App', icon: 'i-carbon-code' },
          { title: 'Clipboard History', kind: 'Plugin', icon: 'i-carbon-paste' },
          { title: 'Q3-roadmap.pdf', kind: 'File', icon: 'i-carbon-document-pdf' },
          { title: 'Meeting notes — Q3 roadmap', kind: 'Clip', icon: 'i-carbon-document' },
          { title: 'Translate', kind: 'Plugin', icon: 'i-carbon-translate' },
          { title: 'Summarise my clipboard', kind: 'AI', icon: 'i-carbon-machine-learning-model' },
        ],
      },
      sensitive: {
        reveal: 'Click to reveal',
        copy: 'Copy',
        copied: 'Copied',
        hide: 'Hide value',
        show: 'Reveal value',
        hidden: 'Value hidden',
        masked: 'masked.',
        copySuccess: 'Copied to clipboard',
        instruction: 'Click or press Enter to reveal.',
        fallbackName: 'Sensitive value',
      },
    })

const PAGE_ICONS: Record<PageKey, string> = {
  general: 'i-carbon-settings',
  corebox: 'i-carbon-search',
  shortcuts: 'i-carbon-keyboard',
  ai: 'i-carbon-machine-learning-model',
  privacy: 'i-carbon-security',
  account: 'i-carbon-user-avatar',
}

const SHORTCUTS: Array<{ id: ShortcutId, source?: string, keys?: string[] }> = [
  { id: 'corebox' },
  { id: 'clipboard', source: 'clipboard-history', keys: ['⌘', '⇧', 'V'] },
  { id: 'translate', source: 'touch-translation', keys: ['⌘', '⇧', 'T'] },
  { id: 'dictation', source: 'touch-dictation', keys: ['⌥', 'Space'] },
  { id: 'window', source: 'touch-window-presets', keys: ['⌃', '⌥', '→'] },
  { id: 'note', source: 'touch-snippets', keys: ['⌘', '⇧', 'N'] },
]

const EXCLUDED_APPS = ['onePassword', 'keychain', 'incognito', 'terminal']
const LANGUAGES = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en-US', label: 'English' },
  { value: 'ja-JP', label: '日本語' },
]
const CLIPS_START = 1286
const PINNED_CLIPS = 12
const DEVICES_START = 3

function defaults(): SettingsState {
  return {
    language: zh.value ? 'zh-CN' : 'en-US',
    theme: 'system',
    opacity: 92,
    launchAtLogin: true,
    hotkey: ['⌥', 'Space'],
    recommendations: true,
    autoPaste: '3',
    density: 'cozy',
    maxResults: 8,
    placeholder: zh.value ? '搜索应用、文件与插件…' : 'Search apps, files and plugins…',
    rememberQuery: false,
    shortcuts: { corebox: true, clipboard: true, translate: true, dictation: false, window: true, note: true },
    provider: 'nexus',
    apiKey: 'sk-demo-7f3a91c2e4b8-not-a-real-key',
    temperature: 0.4,
    contextClipboard: true,
    contextFiles: true,
    contextWeb: false,
    retention: '30d',
    excluded: { onePassword: true, keychain: true, incognito: true, terminal: false },
  }
}

const settings = reactive<SettingsState>(defaults())
const page = ref<PageKey>('general')
const saveState = ref<SaveState>('idle')
const shortcutFilter = ref('')
const recording = ref(false)
const confirmKind = ref<ConfirmKind>('reset')
const confirmOpen = ref(false)
const clearPinned = ref(false)
const clips = ref(CLIPS_START)
const cleared = ref<number | null>(null)
const devices = ref(DEVICES_START)
const signedOut = ref(false)
const displayName = ref(copy.value.userName)
const avatar = ref<ImageUploaderFile[]>([])
const reducedMotion = ref(false)

/* ─── saving ─── */

let saveTimer: ReturnType<typeof setTimeout> | undefined
// Scripted and reset writes are not the reader's edits; they skip the
// "saving" beat instead of faking one.
let quiet = false

function quietly(write: () => void) {
  quiet = true
  write()
  quiet = false
}

watch(settings, () => {
  if (quiet)
    return
  saveState.value = 'saving'
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveState.value = 'saved'
  }, 600)
}, { deep: true, flush: 'sync' })

const saveTone = computed<StatusTone>(() => (saveState.value === 'saved' ? 'success' : saveState.value === 'saving' ? 'info' : 'muted'))
const saveIcon = computed(() => (saveState.value === 'saving' ? 'i-carbon-renew' : saveState.value === 'saved' ? 'i-carbon-checkmark' : 'i-carbon-save'))

/* ─── derived view data ─── */

const densitySegments = computed(() => [
  { value: 'compact', label: copy.value.density.compact },
  { value: 'cozy', label: copy.value.density.cozy },
  { value: 'roomy', label: copy.value.density.roomy },
])

const autoPasteOptions = computed(() => [
  { value: 'off', label: copy.value.autoPaste.off },
  ...['1', '3', '5'].map(s => ({ value: s, label: copy.value.autoPaste.after(s) })),
])

const shortcutRows = computed(() => {
  const q = shortcutFilter.value.trim().toLowerCase()
  return SHORTCUTS
    .map(item => ({
      ...item,
      name: copy.value.shortcutNames[item.id],
      from: item.source ?? copy.value.builtIn,
      keys: item.keys ?? settings.hotkey,
    }))
    .filter(row => !q || `${row.name} ${row.from} ${row.keys.join('')}`.toLowerCase().includes(q))
})

const maxShown = computed(() => settings.maxResults ?? 8)
const previewRows = computed(() => copy.value.preview.rows.slice(0, Math.min(maxShown.value, 5)))
const previewMore = computed(() => Math.max(0, maxShown.value - previewRows.value.length))
const previewSummary = computed(() => copy.value.preview.summary(
  copy.value.theme[settings.theme],
  settings.opacity,
  copy.value.density[settings.density],
  maxShown.value,
))

const confirmView = computed(() => {
  const modal = copy.value.modal
  if (confirmKind.value === 'clear') {
    return {
      ...modal.clear,
      body: modal.clear.body(clearPinned.value ? clips.value : clips.value - Math.min(PINNED_CLIPS, clips.value)),
    }
  }
  return modal[confirmKind.value]
})

/* ─── actions ─── */

function setPage(value: string) {
  page.value = value as PageKey
}

function ask(kind: ConfirmKind) {
  confirmKind.value = kind
  clearPinned.value = false
  confirmOpen.value = true
}

function confirm() {
  if (confirmKind.value === 'reset') {
    Object.assign(settings, defaults())
  }
  else if (confirmKind.value === 'clear') {
    const removed = clearPinned.value ? clips.value : clips.value - Math.min(PINNED_CLIPS, clips.value)
    clips.value -= removed
    cleared.value = removed
  }
  else {
    devices.value = 1
    signedOut.value = true
  }
  confirmOpen.value = false
}

function toggleRecording() {
  recording.value = !recording.value
}

const KEY_NAMES: Record<string, string> = {
  ' ': 'Space',
  'ArrowLeft': '←',
  'ArrowRight': '→',
  'ArrowUp': '↑',
  'ArrowDown': '↓',
  'Enter': '↵',
  'Backspace': '⌫',
  'Tab': '⇥',
}

// Recording listens on the button itself, which holds focus while it waits,
// so nothing outside the template ever sees these keys.
function onRecordKeydown(event: KeyboardEvent) {
  if (!recording.value)
    return
  event.preventDefault()
  if (event.key === 'Escape') {
    recording.value = false
    return
  }
  if (['Meta', 'Control', 'Alt', 'Shift'].includes(event.key))
    return
  if (!event.metaKey && !event.ctrlKey && !event.altKey)
    return
  const key = KEY_NAMES[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key)
  settings.hotkey = [
    event.metaKey && '⌘',
    event.ctrlKey && '⌃',
    event.altKey && '⌥',
    event.shiftKey && '⇧',
    key,
  ].filter((part): part is string => Boolean(part))
  recording.value = false
}

// TxTabs unmounts the Account panel on every tab switch, and the uploader
// revokes the object URLs it made when it unmounts — so a picked avatar would
// come back as a broken image. Each picked file gets a URL owned here instead.
const ownedUrls = new Map<string, string>()

function onAvatarChange(next: ImageUploaderFile[]) {
  const keep = new Set(next.map(item => item.id))
  for (const [id, url] of ownedUrls) {
    if (!keep.has(id)) {
      URL.revokeObjectURL(url)
      ownedUrls.delete(id)
    }
  }
  avatar.value = next.map((item) => {
    if (!item.file)
      return item
    let url = ownedUrls.get(item.id)
    if (!url) {
      url = URL.createObjectURL(item.file)
      ownedUrls.set(item.id, url)
    }
    return { ...item, url }
  })
}

function releaseAvatar() {
  for (const url of ownedUrls.values())
    URL.revokeObjectURL(url)
  ownedUrls.clear()
  avatar.value = []
}

/* ─── scripted tour ─── */

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

function play() {
  clearAutoplay()
  reducedMotion.value = prefersReducedMotion()
  if (reducedMotion.value) {
    page.value = 'corebox'
    quietly(() => {
      settings.density = 'compact'
    })
    saveState.value = 'saved'
    return
  }
  autoplaying = true
  schedule(1000, () => {
    page.value = 'corebox'
  })
  // A real edit, so it goes through the same save beat a reader's would.
  schedule(1600, () => {
    settings.density = 'compact'
    autoplaying = false
  })
}

function onEnter() {
  entered = true
  play()
}

function resetDemo() {
  clearAutoplay()
  clearTimeout(saveTimer)
  quietly(() => Object.assign(settings, defaults()))
  saveState.value = 'idle'
  page.value = 'general'
  shortcutFilter.value = ''
  recording.value = false
  confirmOpen.value = false
  clips.value = CLIPS_START
  cleared.value = null
  devices.value = DEVICES_START
  signedOut.value = false
  displayName.value = copy.value.userName
  releaseAvatar()
  if (entered)
    play()
}

watch(locale, resetDemo)

onBeforeUnmount(() => {
  clearAutoplay()
  clearTimeout(saveTimer)
  releaseAvatar()
})

defineExpose({ resetDemo })

const tabsAnimation = computed(() => (reducedMotion.value
  ? { size: false, nav: false, indicator: false, content: false }
  : undefined))
</script>

<template>
  <TemplateFrame :title="copy.title" @enter="onEnter">
    <template #default="{ width }">
      <div
        class="settings"
        :class="{ 'is-narrow': width > 0 && width < 640 }"
        @keydown="stopAutoplay"
        @pointerdown="stopAutoplay"
      >
        <!-- Below 640px the tabs move to the top: `navMinWidth` is an inline
             style, so only the prop can change it, not a container query. -->
        <TxTabs
          class="settings__tabs"
          :model-value="page"
          :placement="width > 0 && width < 640 ? 'top' : 'left'"
          :nav-min-width="width >= 960 ? 216 : 184"
          :nav-max-width="width >= 960 ? 216 : 184"
          :content-padding="0"
          borderless
          indicator-variant="block"
          indicator-motion="glide"
          :animation="tabsAnimation"
          @update:model-value="setPage"
        >
          <template #nav-right>
            <div class="settings__version">
              <i class="i-carbon-checkmark-outline" aria-hidden="true" />
              {{ copy.version }}
            </div>
          </template>

          <TxTabHeader>
            <div class="settings__header">
              <i :class="PAGE_ICONS[page]" class="settings__header-icon" aria-hidden="true" />
              <h3>{{ copy.pages[page] }}</h3>
              <TxStatusBadge class="settings__save" :text="copy.save[saveState]" :status="saveTone" :icon="saveIcon" size="sm" />
              <TxButton size="sm" variant="ghost" icon="i-carbon-reset" @click="ask('reset')">
                {{ copy.reset }}
              </TxButton>
            </div>
          </TxTabHeader>

          <TxTabItemGroup :name="copy.navGroups.app">
            <TxTabItem name="general" :icon-class="PAGE_ICONS.general">
              <template #name>
                {{ copy.pages.general }}
              </template>
              <div class="settings__page">
                <TxGroupBlock :name="copy.appearance.name" :description="copy.appearance.desc" default-icon="i-carbon-color-palette" :collapsible="false">
                  <!-- Raised above the rows after it: TxFlatSelect opens in
                       place, and each row is its own stacking context. -->
                  <TxBlockSlot class="settings__row--raised" :title="copy.language.title" :description="copy.language.desc" default-icon="i-carbon-earth">
                    <div class="settings__control settings__control--flat">
                      <TxFlatSelect v-model="settings.language" :placeholder="copy.language.placeholder">
                        <TxFlatSelectItem v-for="lang in LANGUAGES" :key="lang.value" :value="lang.value" :label="lang.label" />
                      </TxFlatSelect>
                    </div>
                  </TxBlockSlot>
                  <TxBlockSlot :title="copy.theme.title" :description="copy.theme.desc" default-icon="i-carbon-sun">
                    <TxFlatRadio v-model="settings.theme" size="sm" :aria-label="copy.theme.title">
                      <TxFlatRadioItem value="light" :label="copy.theme.light" icon="i-carbon-sun" />
                      <TxFlatRadioItem value="dark" :label="copy.theme.dark" icon="i-carbon-moon" />
                      <TxFlatRadioItem value="system" :label="copy.theme.system" icon="i-carbon-screen" />
                    </TxFlatRadio>
                  </TxBlockSlot>
                  <TxBlockSlot class="settings__row--still" :title="copy.opacity.title" :description="copy.opacity.desc" default-icon="i-carbon-brightness-contrast">
                    <div class="settings__control">
                      <TxSlider
                        v-model="settings.opacity"
                        :min="60"
                        :max="100"
                        :aria-label="copy.opacity.title"
                        show-value
                        :format-value="(v: number) => `${v}%`"
                      />
                    </div>
                  </TxBlockSlot>
                </TxGroupBlock>

                <TxGroupBlock :name="copy.startup.name" :description="copy.startup.desc" default-icon="i-carbon-power" :collapsible="false">
                  <TxBlockSlot :title="copy.login.title" :description="copy.login.desc" default-icon="i-carbon-laptop">
                    <TuffSwitch v-model="settings.launchAtLogin" :aria-label="copy.login.title" />
                  </TxBlockSlot>
                  <TxBlockSlot :title="copy.hotkey.title" :description="copy.hotkey.desc" default-icon="i-carbon-keyboard">
                    <div class="settings__hotkey">
                      <span class="settings__keys" :class="{ 'is-recording': recording }" aria-live="polite">
                        <template v-if="recording">{{ copy.hotkey.press }}</template>
                        <template v-else>
                          <TxKbd v-for="key in settings.hotkey" :key="key" size="md">{{ key }}</TxKbd>
                        </template>
                      </span>
                      <TxButton
                        size="sm"
                        :variant="recording ? 'primary' : 'secondary'"
                        :aria-label="recording ? copy.hotkey.cancel : copy.hotkey.recordLabel"
                        @click="toggleRecording"
                        @keydown="onRecordKeydown"
                        @blur="recording = false"
                      >
                        {{ recording ? copy.hotkey.cancel : copy.hotkey.record }}
                      </TxButton>
                    </div>
                  </TxBlockSlot>
                </TxGroupBlock>
              </div>
            </TxTabItem>

            <TxTabItem name="corebox" :icon-class="PAGE_ICONS.corebox">
              <template #name>
                {{ copy.pages.corebox }}
              </template>
              <div class="settings__page">
                <TxGroupBlock :name="copy.search.name" :description="copy.search.desc" default-icon="i-carbon-search" :collapsible="false">
                  <TxBlockSlot :title="copy.recommendations.title" :description="copy.recommendations.desc" default-icon="i-carbon-idea">
                    <TuffSwitch v-model="settings.recommendations" :aria-label="copy.recommendations.title" />
                  </TxBlockSlot>
                  <TxBlockSlot :title="copy.autoPaste.title" :description="copy.autoPaste.desc" default-icon="i-carbon-paste">
                    <div class="settings__control settings__control--select">
                      <TxSelect v-model="settings.autoPaste" :options="autoPasteOptions" />
                    </div>
                  </TxBlockSlot>
                  <TxBlockSlot class="settings__row--tall settings__row--still" :title="copy.density.title" :description="copy.density.desc" default-icon="i-carbon-row">
                    <div class="settings__control settings__control--density">
                      <TxSegmentedSlider v-model="settings.density" :segments="densitySegments" :aria-label="copy.density.title" />
                    </div>
                  </TxBlockSlot>
                  <TxBlockSlot :title="copy.maxResults.title" :description="copy.maxResults.desc" default-icon="i-carbon-list">
                    <div class="settings__control settings__control--number">
                      <TxNumberInput
                        v-model="settings.maxResults"
                        :min="3"
                        :max="20"
                        :aria-label="copy.maxResults.title"
                        :decrease-label="copy.maxResults.decrease"
                        :increase-label="copy.maxResults.increase"
                      />
                    </div>
                  </TxBlockSlot>
                </TxGroupBlock>

                <TxGroupBlock :name="copy.input.name" :description="copy.input.desc" default-icon="i-carbon-text-font" :collapsible="false">
                  <TxBlockSlot :title="copy.placeholder.title" :description="copy.placeholder.desc" default-icon="i-carbon-edit">
                    <div class="settings__control settings__control--wide">
                      <TxInput v-model="settings.placeholder" :aria-label="copy.placeholder.title" clearable />
                    </div>
                  </TxBlockSlot>
                  <TxBlockSlot :title="copy.remember.title" :description="copy.remember.desc" default-icon="i-carbon-time">
                    <TuffSwitch v-model="settings.rememberQuery" :aria-label="copy.remember.title" />
                  </TxBlockSlot>
                </TxGroupBlock>
              </div>
            </TxTabItem>

            <TxTabItem name="shortcuts" :icon-class="PAGE_ICONS.shortcuts">
              <template #name>
                {{ copy.pages.shortcuts }}
              </template>
              <div class="settings__page">
                <div class="settings__toolbar">
                  <div class="settings__filter">
                    <TxSearchInput v-model="shortcutFilter" :placeholder="copy.filterShortcuts" />
                  </div>
                  <span>{{ copy.shortcutCount(shortcutRows.length) }}</span>
                </div>
                <TxGroupBlock :name="copy.shortcutGroup.name" :description="copy.shortcutGroup.desc" default-icon="i-carbon-keyboard" :collapsible="false">
                  <TxBlockSlot
                    v-for="row in shortcutRows"
                    :key="row.id"
                    :title="row.name"
                    :description="row.from"
                  >
                    <div class="settings__shortcut" :class="{ 'is-off': !settings.shortcuts[row.id] }">
                      <span class="settings__keys">
                        <TxKbd v-for="key in row.keys" :key="key">{{ key }}</TxKbd>
                      </span>
                      <TuffSwitch v-model="settings.shortcuts[row.id]" size="small" :aria-label="copy.enableShortcut(row.name)" />
                    </div>
                  </TxBlockSlot>
                  <TxSearchEmpty
                    v-if="!shortcutRows.length"
                    size="small"
                    :title="copy.noShortcut"
                    :description="copy.noShortcutHint"
                  >
                    <template #icon>
                      <i class="i-carbon-keyboard settings__empty-icon" aria-hidden="true" />
                    </template>
                  </TxSearchEmpty>
                </TxGroupBlock>
              </div>
            </TxTabItem>
          </TxTabItemGroup>

          <TxTabItemGroup :name="copy.navGroups.intelligence">
            <TxTabItem name="ai" :icon-class="PAGE_ICONS.ai">
              <template #name>
                {{ copy.pages.ai }}
              </template>
              <div class="settings__page">
                <TxAlert type="info" :title="copy.aiRoute.title" :message="copy.aiRoute.body" :closable="false" />
                <TxGroupBlock :name="copy.model.name" :description="copy.model.desc" default-icon="i-carbon-machine-learning-model" :collapsible="false">
                  <TxBlockSlot :title="copy.provider.title" :description="copy.provider.desc" default-icon="i-carbon-cloud">
                    <div class="settings__control settings__control--provider">
                      <TxSelect v-model="settings.provider" :options="copy.providers" />
                    </div>
                  </TxBlockSlot>
                  <TxBlockSlot class="settings__row--still" :title="copy.temperature.title" :description="copy.temperature.desc" default-icon="i-carbon-temperature">
                    <div class="settings__control">
                      <TxSlider
                        v-model="settings.temperature"
                        :min="0"
                        :max="1"
                        :step="0.1"
                        :aria-label="copy.temperature.title"
                        show-value
                        :format-value="(v: number) => v.toFixed(1)"
                      />
                    </div>
                  </TxBlockSlot>
                </TxGroupBlock>

                <!-- The key sits in the group body, not in a 56px row: its copy
                     tab rises above the field and would cut into the row
                     before it. -->
                <TxGroupBlock :name="copy.byok.name" :description="copy.byok.desc" default-icon="i-carbon-password" :collapsible="false">
                  <div class="settings__body">
                    <TxSensitiveInput
                      v-model="settings.apiKey"
                      :label="copy.apiKey.label"
                      :description="copy.apiKey.desc"
                      :labels="copy.sensitive"
                      size="sm"
                    />
                  </div>
                </TxGroupBlock>

                <TxGroupBlock :name="copy.context.name" :description="copy.context.desc" default-icon="i-carbon-data-base" :collapsible="false">
                  <div class="settings__body settings__checks">
                    <TxCheckbox v-model="settings.contextClipboard" :label="copy.context.clipboard" />
                    <TxCheckbox v-model="settings.contextFiles" :label="copy.context.files" />
                    <TxCheckbox v-model="settings.contextWeb" :label="copy.context.web" />
                  </div>
                </TxGroupBlock>
              </div>
            </TxTabItem>

            <TxTabItem name="privacy" :icon-class="PAGE_ICONS.privacy">
              <template #name>
                {{ copy.pages.privacy }}
              </template>
              <div class="settings__page">
                <TxAlert type="warning" :title="copy.privacyNote.title" :message="copy.privacyNote.body" :closable="false" />
                <TxAlert v-if="cleared !== null" type="success" :title="copy.clear.done(cleared)" @close="cleared = null" />

                <TxGroupBlock :name="copy.retention.name" :description="copy.retention.desc" default-icon="i-carbon-time" :collapsible="false">
                  <div class="settings__body">
                    <TxRadioGroup
                      v-model="settings.retention"
                      type="card"
                      class="settings__retention"
                      :direction="width > 0 && width < 640 ? 'column' : 'row'"
                    >
                      <TxRadio v-for="option in copy.retentions" :key="option.value" :value="option.value">
                        <div class="settings__radio-title">
                          {{ option.title }}
                        </div>
                        <div class="settings__radio-desc">
                          {{ option.desc }}
                        </div>
                      </TxRadio>
                    </TxRadioGroup>
                  </div>
                </TxGroupBlock>

                <TxGroupBlock :name="copy.excludedGroup.name" :description="copy.excludedGroup.desc" default-icon="i-carbon-view-off" :collapsible="false">
                  <TxBlockSlot
                    v-for="app in EXCLUDED_APPS"
                    :key="app"
                    :title="copy.excludedApps[app]"
                    :description="copy.excludedDesc[app]"
                  >
                    <TuffSwitch v-model="settings.excluded[app]" size="small" :aria-label="copy.exclude(copy.excludedApps[app] ?? app)" />
                  </TxBlockSlot>
                </TxGroupBlock>

                <TxGroupBlock :name="copy.danger.name" :description="copy.danger.desc" default-icon="i-carbon-warning-alt" :collapsible="false">
                  <TxBlockSlot :title="copy.clear.title" :description="copy.clear.desc(clips)" default-icon="i-carbon-trash-can">
                    <TxButton size="sm" variant="danger" :disabled="clips === 0" @click="ask('clear')">
                      {{ copy.clear.button }}
                    </TxButton>
                  </TxBlockSlot>
                </TxGroupBlock>
              </div>
            </TxTabItem>
          </TxTabItemGroup>

          <TxTabItemGroup :name="copy.navGroups.account">
            <TxTabItem name="account" :icon-class="PAGE_ICONS.account">
              <template #name>
                {{ copy.pages.account }}
              </template>
              <div class="settings__page">
                <TxAlert v-if="signedOut" type="success" :title="copy.sessions.done" @close="signedOut = false" />
                <TxGroupBlock :name="copy.profile.name" :description="copy.profile.desc" default-icon="i-carbon-user-avatar" :collapsible="false">
                  <div class="settings__body settings__profile">
                    <TxAvatar
                      :src="avatar[0]?.url"
                      :name="displayName || copy.userName"
                      size="xlarge"
                      background-color="var(--tx-color-primary-light-9)"
                      text-color="var(--tx-color-primary)"
                    />
                    <div class="settings__uploader">
                      <TxImageUploader
                        :model-value="avatar"
                        :multiple="false"
                        :upload-text="copy.profile.upload"
                        :remove-label="copy.profile.remove"
                        @update:model-value="onAvatarChange"
                      />
                    </div>
                    <label class="settings__field">
                      <span>{{ copy.profile.displayName }}</span>
                      <TxInput v-model="displayName" :aria-label="copy.profile.displayName" />
                    </label>
                  </div>
                  <TxBlockLine :title="copy.accountRows.email" :description="zh ? 'xiaoman@example.com' : 'mia@example.com'" />
                  <TxBlockLine :title="copy.accountRows.plan" :description="copy.accountRows.planValue" />
                </TxGroupBlock>

                <TxGroupBlock :name="copy.sessions.name" :description="copy.sessions.desc" default-icon="i-carbon-laptop" :collapsible="false">
                  <TxBlockSlot :title="copy.sessions.title" :description="copy.sessions.desc2(devices)" default-icon="i-carbon-logout">
                    <TxButton size="sm" variant="danger" :disabled="devices <= 1" @click="ask('signout')">
                      {{ copy.sessions.button }}
                    </TxButton>
                  </TxBlockSlot>
                </TxGroupBlock>
              </div>
            </TxTabItem>
          </TxTabItemGroup>
        </TxTabs>

        <aside v-if="width >= 960" class="settings__preview" :aria-label="copy.preview.title">
          <header class="settings__preview-head">
            <h3>{{ copy.preview.title }}</h3>
            <p>{{ copy.preview.desc }}</p>
          </header>

          <div class="settings__desk">
            <!-- `dark` on the window swaps in the tuffex dark tokens for its
                 subtree; a forced light window on a dark page swaps ink and
                 surface instead, since no token block restores light values
                 under `.dark`. -->
            <div
              class="settings__mini"
              :class="[`is-${settings.density}`, { 'dark': settings.theme === 'dark', 'is-light': settings.theme === 'light' }]"
              :style="{ '--mini-alpha': `${settings.opacity}%` }"
              aria-hidden="true"
            >
              <div class="settings__mini-input">
                <TxIconChip :size="18" :radius="5" tone="ink" :font-size="10">
                  T
                </TxIconChip>
                <span class="settings__mini-placeholder">{{ settings.placeholder || '…' }}</span>
                <span class="settings__mini-keys">{{ settings.hotkey.join('') }}</span>
              </div>
              <ul v-if="settings.recommendations" class="settings__mini-list">
                <li v-for="(row, index) in previewRows" :key="row.title" :class="{ 'is-active': index === 0 }">
                  <i :class="row.icon" />
                  <span class="settings__mini-title">{{ row.title }}</span>
                  <span class="settings__mini-kind">{{ row.kind }}</span>
                </li>
                <li v-if="previewMore" class="settings__mini-more">
                  {{ copy.preview.more(previewMore) }}
                </li>
              </ul>
              <p v-else class="settings__mini-empty">
                {{ copy.preview.empty }}
              </p>
            </div>
          </div>

          <p class="settings__summary">
            {{ previewSummary }}
          </p>
        </aside>

        <TxModal v-model="confirmOpen" :title="confirmView.title" width="420px">
          <p class="settings__modal-body">
            {{ confirmView.body }}
          </p>
          <TxCheckbox v-if="confirmKind === 'clear'" v-model="clearPinned" :label="copy.modal.clear.pinned" />
          <template #footer>
            <div class="settings__modal-actions">
              <TxButton variant="secondary" @click="confirmOpen = false">
                {{ copy.modal.cancel }}
              </TxButton>
              <TxButton :variant="confirmKind === 'reset' ? 'primary' : 'danger'" @click="confirm">
                {{ confirmView.confirm }}
              </TxButton>
            </div>
          </template>
        </TxModal>
      </div>
    </template>
  </TemplateFrame>
</template>

<style scoped>
.settings {
  --settings-line: var(--tx-border-color-lighter, #ebeef5);
  --settings-nav: color-mix(in srgb, var(--tx-fill-color-lighter, #fafafa) 70%, var(--tx-bg-color, #ffffff));

  display: flex;
  height: 100%;
  min-width: 0;
  color: var(--tx-text-color-primary, #303133);
  font-size: 13px;
}

.settings__tabs {
  min-width: 0;
  flex: 1;
}

/* ─── navigation ─── */

.settings__tabs :deep(.tx-tabs__nav) {
  background: var(--settings-nav);
  box-shadow: inset -1px 0 0 var(--settings-line);
}

.settings__tabs :deep(.tx-tabs__nav-inner) {
  padding-top: 6px;
}

.settings__tabs :deep(.tx-tabs__group-name) {
  padding: 8px 16px 2px;
  font-size: 12px;
  font-weight: 500;
}

.settings__tabs :deep(.tx-tab-item) {
  margin: 2px 8px;
  padding: 7px 10px;
}

.settings__tabs :deep(.tx-tab-item__icon) {
  font-size: 16px;
}

.settings__version {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.settings__version i {
  color: var(--tx-color-success, #67c23a);
}

/* ─── header ─── */

.settings__tabs :deep(.tx-tab-header) {
  --fake-color: var(--tx-bg-color, #ffffff);
  --fake-opacity: 1;
}

.settings__header {
  display: flex;
  width: 100%;
  height: 52px;
  align-items: center;
  gap: 10px;
  padding: 0 12px 0 20px;
  box-shadow: inset 0 -1px 0 var(--settings-line);
}

.settings__header h3 {
  margin: 0 auto 0 0;
  font-size: 15px;
  font-weight: 600;
}

.settings__header-icon {
  color: var(--tx-text-color-secondary, #909399);
  font-size: 17px;
}

/* ─── pages ─── */

.settings__page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 20px 20px;
}

/* Groups space themselves through the page gap, not their own margin. */
.settings__page :deep(.tx-group-block) {
  margin-bottom: 0;
}

/* The group reserves 32px on the right of each control to line up with its
   collapse chevron; every group here is static, so the gutter goes. */
.settings__page :deep(.tx-group-block__body .tx-block-slot .tx-block-slot__slot) {
  margin-right: 0;
}

.settings__page :deep(.tx-block-slot__content) {
  cursor: default;
}

.settings__row--raised {
  --fake-fix-index: 2;
}

.settings__row--tall {
  height: 76px;
}

/* A row shrinks on press; while a slider in it is being dragged the whole row
   would stay shrunk, so rows holding one keep still. */
.settings__page .settings__row--still:active {
  transform: none;
}

.settings__control {
  width: 200px;
}

.settings__control--flat {
  width: 150px;
}

.settings__control--select {
  width: 150px;
}

.settings__control--provider {
  width: 230px;
}

.settings__control--number {
  width: 120px;
}

.settings__control--wide {
  width: 240px;
}

/* The labels hang below the track; the padding makes the pair one block so
   the row centres both. */
.settings__control--density {
  width: 220px;
  padding: 0 6px 20px;
}

.settings__control :deep(.tuff-select) {
  width: 100%;
}

.settings__hotkey,
.settings__shortcut {
  display: flex;
  align-items: center;
  gap: 12px;
}

.settings__keys {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.settings__keys.is-recording {
  color: var(--tx-color-primary, #409eff);
  font-size: 12px;
}

.settings__shortcut.is-off .settings__keys {
  opacity: 0.45;
}

.settings__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.settings__filter {
  width: 240px;
}

.settings__empty-icon {
  color: var(--tx-text-color-placeholder, #a8abb2);
  font-size: 26px;
}

.settings__body {
  padding: 14px 16px;
}

.settings__checks {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 24px;
}

.settings__body .settings__retention {
  display: flex;
  width: 100%;
}

.settings__retention :deep(.tx-radio) {
  min-width: 0;
  flex: 1;
}

.settings__radio-title {
  font-size: 13px;
  font-weight: 500;
}

.settings__radio-desc {
  margin-top: 2px;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.settings__profile {
  display: grid;
  align-items: center;
  gap: 12px 16px;
  grid-template-columns: auto 100px minmax(0, 1fr);
}

.settings__uploader :deep(.tx-image-uploader__grid) {
  grid-template-columns: repeat(2, 88px);
}

.settings__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: var(--tx-text-color-regular, #606266);
  font-size: 13px;
}

/* ─── live preview ─── */

.settings__preview {
  display: flex;
  width: 340px;
  flex: none;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  background: var(--settings-nav);
  box-shadow: inset 1px 0 0 var(--settings-line);
}

.settings__preview-head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.settings__preview-head p {
  margin: 2px 0 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
}

.settings__desk {
  display: flex;
  min-height: 300px;
  flex: 1;
  align-items: flex-start;
  justify-content: center;
  padding: 28px 18px;
  border-radius: 14px;
  background:
    radial-gradient(70% 80% at 15% 20%, color-mix(in srgb, var(--tx-color-primary, #409eff) 42%, transparent), transparent 70%),
    radial-gradient(60% 70% at 90% 90%, color-mix(in srgb, var(--tx-color-warning, #e6a23c) 34%, transparent), transparent 70%),
    var(--tx-bg-color-page, #f2f3f5);
  box-shadow: inset 0 0 0 1px var(--settings-line);
}

/* Surface and ink as local variables, so the forced-light case below can swap
   them without touching the markup. */
.settings__mini {
  --mini-surface: var(--tx-bg-color, #ffffff);
  --mini-ink: var(--tx-text-color-primary, #303133);
  --mini-muted: var(--tx-text-color-secondary, #909399);
  --mini-line: var(--tx-border-color-lighter, #ebeef5);
  --mini-row: 36px;

  width: 100%;
  overflow: hidden;
  border-radius: 12px;
  background: color-mix(in srgb, var(--mini-surface) var(--mini-alpha, 92%), transparent);
  -webkit-backdrop-filter: blur(12px);
  backdrop-filter: blur(12px);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--mini-ink) 12%, transparent),
    var(--tx-elevation-4, 4px 8px 24px rgba(0, 0, 0, 0.08));
  color: var(--mini-ink);
  font-size: 12px;
}

.dark .settings__mini.is-light {
  --mini-surface: var(--tx-text-color-primary, #e5eaf3);
  --mini-ink: var(--tx-bg-color, #141414);
  --mini-muted: color-mix(in srgb, var(--tx-bg-color, #141414) 55%, var(--tx-text-color-primary, #e5eaf3));
  --mini-line: color-mix(in srgb, var(--tx-bg-color, #141414) 12%, transparent);
}

.settings__mini.is-compact {
  --mini-row: 30px;
}

.settings__mini.is-roomy {
  --mini-row: 42px;
}

.settings__mini-input {
  display: flex;
  height: 40px;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  box-shadow: inset 0 -1px 0 var(--mini-line);
}

.settings__mini-placeholder {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--mini-muted);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings__mini-keys {
  color: var(--mini-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
}

.settings__mini-list {
  margin: 0;
  padding: 6px;
  list-style: none;
}

.settings__mini-list li {
  display: flex;
  height: var(--mini-row);
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border-radius: 8px;
  transition: height 0.2s var(--tx-ease-out-strong, cubic-bezier(0.23, 1, 0.32, 1));
}

.settings__mini-list li.is-active {
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 16%, transparent);
}

.settings__mini-list i {
  flex: none;
  color: var(--mini-muted);
  font-size: 14px;
}

.settings__mini-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings__mini-kind {
  color: var(--mini-muted);
  font-size: 11px;
}

.settings__mini-list .settings__mini-more {
  justify-content: center;
  color: var(--mini-muted);
  font-size: 11px;
}

.settings__mini-empty {
  margin: 0;
  padding: 18px 12px;
  color: var(--mini-muted);
  text-align: center;
}

.settings__summary {
  margin: 0;
  color: var(--tx-text-color-secondary, #909399);
  font-size: 12px;
  line-height: 1.6;
}

/* ─── modal (teleported, so token colours only) ─── */

.settings__modal-body {
  margin: 0 0 14px;
  color: var(--tx-text-color-regular, #606266);
  font-size: 13px;
  line-height: 1.6;
}

.settings__modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* ─── wide ─── */

@container template (min-width: 960px) {
  .settings__page {
    padding: 20px 28px 28px;
  }

  .settings__header {
    padding-left: 28px;
  }
}

/* ─── narrow: tabs on top, rows wrap ─── */

@container template (max-width: 639px) {
  /* On top, TxTabs draws its own bottom border (the borderless rule only
     clears the side one); it just takes the page's hairline colour. */
  .settings__tabs :deep(.tx-tabs__nav) {
    border-bottom-color: var(--settings-line);
    box-shadow: none;
  }

  /* Group headings do not fit a single row of tabs: the groups dissolve and
     their tabs join the row. */
  .settings__tabs :deep(.tx-tabs__group) {
    display: contents;
  }

  .settings__tabs :deep(.tx-tabs__group-name),
  .settings__version {
    display: none;
  }

  .settings__tabs :deep(.tx-tabs__nav-inner) {
    padding: 4px 4px 0;
  }

  .settings__tabs :deep(.tx-tab-item) {
    flex: none;
    margin: 4px 2px;
  }

  .settings__header {
    padding-left: 14px;
  }

  .settings__header :deep(.tx-button) {
    padding-inline: 8px;
  }

  .settings__page {
    padding: 12px;
  }

  .settings__page :deep(.tx-block-slot) {
    height: auto;
    min-height: 56px;
    flex-wrap: wrap;
    gap: 8px 12px;
    padding: 10px 12px;
  }

  .settings__page :deep(.tx-block-slot__content) {
    flex: 1 1 160px;
  }

  .settings__page :deep(.tx-block-slot__content > .tuff-icon) {
    display: none;
  }

  .settings__control,
  .settings__control--flat,
  .settings__control--select,
  .settings__control--provider,
  .settings__control--wide,
  .settings__filter {
    width: min(100%, 240px);
  }

  /* The segmented slider has no intrinsic width, so a percentage of a
     shrink-to-fit slot collapsed it to a dot with its labels stacked. Give it
     the whole row under its label instead. */
  .settings__row--tall :deep(.tx-block-slot__slot) {
    flex: 1 1 100%;
  }

  .settings__control--density {
    width: 100%;
  }

  .settings__profile {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .settings__profile .settings__field {
    grid-column: 1 / -1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .settings__mini-list li {
    transition: none;
  }
}
</style>
