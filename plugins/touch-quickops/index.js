const { plugin, logger, TuffItemBuilder, quickOps, flow } = globalThis

const PLUGIN_NAME = 'touch-quickops'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'emoji', value: '⚡' }
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB']
const FLOW_ACTION_ID = 'quickops-flow-action'
const DEVELOPER_PREVIEW_SAVE_SVG_ACTION_ID = 'quickops-developer-preview-save-svg'
const DEVELOPER_PREVIEW_SAVE_PNG_ACTION_ID = 'quickops-developer-preview-save-png'
const QUICKOPS_FLOW_SENDER_ID = PLUGIN_NAME
const QUICKOPS_PREFIXES = ['quickops', 'quick ops', 'ops', '快捷工具', '本地快捷工具']
const PREVIEW_COMPONENT_NAME = 'core-preview-card'

const SAFE_FLOW_ACTIONS = [
  {
    id: 'stop-all-sessions',
    targetId: 'quickops.stop-all-sessions',
    title: ['停止所有 QuickOps 会话', 'Stop All QuickOps Sessions'],
    subtitle: ['停止正在运行的所有 QuickOps 会话', 'Stops every running QuickOps session'],
    patterns: [
      /\bstop\s+all\s+(?:quick\s*ops?\s+)?sessions?\b/i,
      /停止.*(?:所有|全部).*(?:quickops|快捷工具|会话)/i,
    ],
  },
  {
    id: 'stop-system-awake',
    targetId: 'quickops.stop-system-awake',
    title: ['停止系统唤醒', 'Stop Keeping System Awake'],
    subtitle: ['结束当前的系统唤醒会话', 'Ends the current keep-system-awake session'],
    patterns: [/\bstop\s+system\s+awake\b/i, /停止.*(?:系统唤醒|系统防休眠)/],
  },
  {
    id: 'stop-keep-awake',
    targetId: 'quickops.stop-keep-awake',
    title: ['停止保持唤醒', 'Stop Keeping Display Awake'],
    subtitle: ['结束当前的保持唤醒会话', 'Ends the current keep-display-awake session'],
    patterns: [/\bstop\s+keep\s+awake\b/i, /停止.*(?:保持唤醒|屏幕常亮|防休眠)/],
  },
  {
    id: 'stop-clean-screen',
    targetId: 'quickops.stop-clean-screen',
    title: ['退出清屏模式', 'Exit Clean Screen'],
    subtitle: ['关闭当前的清屏遮罩', 'Closes the current clean-screen overlay'],
    patterns: [
      /\bstop\s+(?:clean\s+screen|screen\s+clean)\b/i,
      /(?:停止|退出|关闭).*(?:清屏|屏幕清洁)/,
    ],
  },
  {
    id: 'pause-timer',
    targetId: 'quickops.pause-timer',
    title: ['暂停计时器', 'Pause Timer'],
    subtitle: ['暂停正在运行的计时器', 'Pauses the running timer'],
    patterns: [/\bpause\s+timer\b/i, /\btimer\s+pause\b/i, /暂停.*计时器/],
  },
  {
    id: 'resume-timer',
    targetId: 'quickops.resume-timer',
    title: ['继续计时器', 'Resume Timer'],
    subtitle: ['继续已暂停的计时器', 'Resumes the paused timer'],
    patterns: [/\b(?:resume|continue)\s+timer\b/i, /\btimer\s+resume\b/i, /(?:继续|恢复).*计时器/],
  },
  {
    id: 'stop-timer',
    targetId: 'quickops.stop-timer',
    title: ['停止计时器', 'Stop Timer'],
    subtitle: ['停止当前的计时器', 'Stops the current timer'],
    patterns: [/\bstop\s+timer\b/i, /\btimer\s+stop\b/i, /停止.*计时器/],
  },
  {
    id: 'pause-pomodoro',
    targetId: 'quickops.pause-pomodoro',
    title: ['暂停番茄钟', 'Pause Pomodoro'],
    subtitle: ['暂停正在运行的番茄钟', 'Pauses the running Pomodoro session'],
    patterns: [/\bpause\s+pomodoro\b/i, /\bpomodoro\s+pause\b/i, /暂停.*番茄钟/],
  },
  {
    id: 'resume-pomodoro',
    targetId: 'quickops.resume-pomodoro',
    title: ['继续番茄钟', 'Resume Pomodoro'],
    subtitle: ['继续已暂停的番茄钟', 'Resumes the paused Pomodoro session'],
    patterns: [/\b(?:resume|continue)\s+pomodoro\b/i, /\bpomodoro\s+resume\b/i, /(?:继续|恢复).*番茄钟/],
  },
  {
    id: 'stop-pomodoro',
    targetId: 'quickops.stop-pomodoro',
    title: ['停止番茄钟', 'Stop Pomodoro'],
    subtitle: ['停止当前的番茄钟', 'Stops the current Pomodoro session'],
    patterns: [/\bstop\s+pomodoro\b/i, /\bpomodoro\s+stop\b/i, /停止.*番茄钟/],
  },
  {
    id: 'pause-stopwatch',
    targetId: 'quickops.pause-stopwatch',
    title: ['暂停秒表', 'Pause Stopwatch'],
    subtitle: ['暂停正在运行的秒表', 'Pauses the running stopwatch'],
    patterns: [/\bpause\s+stopwatch\b/i, /\bstopwatch\s+pause\b/i, /暂停.*秒表/],
  },
  {
    id: 'resume-stopwatch',
    targetId: 'quickops.resume-stopwatch',
    title: ['继续秒表', 'Resume Stopwatch'],
    subtitle: ['继续已暂停的秒表', 'Resumes the paused stopwatch'],
    patterns: [
      /\b(?:resume|continue)\s+stopwatch\b/i,
      /\bstopwatch\s+resume\b/i,
      /(?:继续|恢复).*秒表/,
    ],
  },
  {
    id: 'lap-stopwatch',
    targetId: 'quickops.lap-stopwatch',
    title: ['记录秒表分段', 'Record Lap'],
    subtitle: ['为正在运行的秒表记录一个分段', 'Records a lap on the running stopwatch'],
    patterns: [/\blap\s+stopwatch\b/i, /\bstopwatch\s+lap\b/i, /(?:记录|新增).*分段/],
  },
  {
    id: 'reset-stopwatch',
    targetId: 'quickops.reset-stopwatch',
    title: ['重置秒表', 'Reset Stopwatch'],
    subtitle: ['停止并清除当前的秒表', 'Stops and clears the current stopwatch'],
    patterns: [
      /\b(?:reset|stop)\s+stopwatch\b/i,
      /\bstopwatch\s+(?:reset|stop)\b/i,
      /(?:重置|停止).*秒表/,
    ],
  },
]

const CONFIRMATION_FLOW_ACTIONS = [
  {
    id: 'keep-awake',
    targetId: 'quickops.keep-awake',
    title: ['保持唤醒需要确认', 'Keep Display Awake Needs Confirmation'],
    patterns: [/\bkeep\s+awake\b/i, /(?:保持唤醒|屏幕常亮|防休眠)/],
  },
  {
    id: 'system-awake',
    targetId: 'quickops.system-awake',
    title: ['系统唤醒需要确认', 'Keep System Awake Needs Confirmation'],
    patterns: [/\bsystem\s+awake\b/i, /(?:系统唤醒|系统防休眠)/],
  },
  {
    id: 'start-timer',
    targetId: 'quickops.start-timer',
    title: ['启动计时器需要确认', 'Starting a Timer Needs Confirmation'],
    patterns: [/\bstart\s+timer\b/i, /\btimer\s+start\b/i, /(?:开始|启动).*计时器/],
  },
  {
    id: 'start-pomodoro',
    targetId: 'quickops.start-pomodoro',
    title: ['启动番茄钟需要确认', 'Starting a Pomodoro Needs Confirmation'],
    patterns: [/\bstart\s+pomodoro\b/i, /\bpomodoro\s+start\b/i, /(?:开始|启动).*番茄钟/],
  },
  {
    id: 'clean-screen',
    targetId: 'quickops.clean-screen',
    title: ['清屏模式需要确认', 'Clean Screen Needs Confirmation'],
    patterns: [/\b(?:start\s+)?clean\s+screen\b/i, /(?:开始|启动|进入).*清屏/],
  },
  {
    id: 'start-stopwatch',
    targetId: 'quickops.start-stopwatch',
    title: ['启动秒表需要确认', 'Starting a Stopwatch Needs Confirmation'],
    patterns: [/\bstart\s+stopwatch\b/i, /\bstopwatch\s+start\b/i, /(?:开始|启动).*秒表/],
  },
  {
    id: 'copy-to-clipboard',
    targetId: 'quickops.copy-to-clipboard',
    title: ['写入剪贴板需要确认', 'Copying to the Clipboard Needs Confirmation'],
    patterns: [/\bcopy\s+to\s+clipboard\b/i, /写入.*剪贴板/],
  },
  {
    id: 'show-notification',
    targetId: 'quickops.show-notification',
    title: ['发送通知需要确认', 'Showing a Notification Needs Confirmation'],
    patterns: [/\bshow\s+notification\b/i, /发送.*通知/],
  },
  {
    id: 'open-folder',
    targetId: 'quickops.open-folder',
    title: ['打开文件夹需要确认', 'Opening a Folder Needs Confirmation'],
    patterns: [/\bopen\s+folder\b/i, /打开.*(?:文件夹|目录)/],
  },
  {
    id: 'temp-text-file',
    targetId: 'quickops.temp-text-file',
    title: ['创建临时文本需要确认', 'Creating a Temporary Text File Needs Confirmation'],
    patterns: [/\btemp\s+text\s+file\b/i, /创建.*临时.*文本/],
  },
  {
    id: 'temp-directory',
    targetId: 'quickops.temp-directory',
    title: ['创建临时目录需要确认', 'Creating a Temporary Folder Needs Confirmation'],
    patterns: [/\btemp\s+directory\b/i, /创建.*临时.*(?:目录|文件夹)/],
  },
]

const HIGH_RISK_FLOW_ACTIONS = [
  {
    id: 'kill-port',
    targetId: 'quickops.port-kill',
    title: ['高风险端口释放已阻断', 'High-Risk Port Release Blocked'],
    subtitle: ['为安全起见，插件不会直接结束占用端口的进程', 'For safety, the plugin won\'t end the process on a port itself'],
    reason: 'high-risk-blocked',
    patterns: [
      /\b(?:kill|terminate|release)\s+port\s+\d+\b/i,
      /\bport\s+\d+\s+(?:kill|terminate|release)\b/i,
      /(?:杀掉|终止|释放).*端口\s*\d+/,
    ],
  },
]

function locale() {
  try {
    return plugin.getLocale() === 'en-US' ? 'en' : 'zh'
  }
  catch {
    return 'zh'
  }
}

function t(zh, en) {
  return locale() === 'en' ? en : zh
}

// The English noun takes its plural after any count but one.
function englishCount(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

// `zhUnit` carries the Chinese measure word (`个位置`).
function countText(count, zhUnit, singular, plural) {
  return t(`${count} ${zhUnit}`, englishCount(count, singular, plural))
}

// The ids the host gives for a capability that is off or a tool that came back empty. For these the
// host's own `message`, when it sends one, is raw detail (a system error, an error code) rather than a
// sentence, so it follows this text instead of replacing it.
const REASON_TEXT = {
  'quickops-disabled': ['QuickOps 已关闭', 'QuickOps is turned off'],
  'stateful-tools-disabled-by-policy': ['已按策略关闭会改变状态的工具', 'Tools that change state are turned off by policy'],
  'network-tools-disabled-by-policy': ['已按策略关闭网络工具', 'Network tools are turned off by policy'],
  'file-tools-disabled-by-policy': ['已按策略关闭文件工具', 'File tools are turned off by policy'],
  'system-tools-disabled-by-policy': ['已按策略关闭系统工具', 'System tools are turned off by policy'],
  'developer-tools-disabled-by-policy': ['已按策略关闭开发者工具', 'Developer tools are turned off by policy'],
  'high-risk-tools-disabled-by-policy': ['已按策略关闭高风险工具', 'High-risk tools are turned off by policy'],
  'public-ip-disabled': ['公网 IP 查询未开启', 'Public IP lookup is off'],
  'copy-only-command': ['只提供可复制的命令', 'Only offers a command to copy'],
  'unsupported-platform': ['当前系统不支持', 'Not supported on this system'],
  'not-developer-command': ['没有识别出开发者命令', 'That isn\'t a developer command'],
  'no-preview-result': ['没有可预览的结果', 'Nothing to preview'],
  'invalid-port': ['请输入 1 到 65535 之间的端口号', 'Enter a port number from 1 to 65535'],
  'port-probe-failed': ['无法检查这个端口', 'Couldn\'t check this port'],
  'missing-text': ['请输入要格式化的文本', 'Enter the text to format'],
  'local-ip-unavailable': ['没有找到本机 IP 地址', 'No local IP address found'],
  'system-proxy-probe-failed': ['无法读取系统代理设置', 'Couldn\'t read the system proxy settings'],
}

// An id this plugin doesn't name is shown as it came: it is the only diagnosis there is.
function describeReason(reason) {
  const text = REASON_TEXT[reason]
  return text ? t(...text) : normalizeText(reason)
}

const PLATFORM_NAMES = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }

function describePlatform(platform) {
  return PLATFORM_NAMES[platform] || normalizeText(platform) || t('未知系统', 'Unknown system')
}

const CAPABILITY_STATUS_TEXT = {
  supported: ['可用', 'Available'],
  disabled: ['已停用', 'Disabled'],
  degraded: ['受限', 'Limited'],
}

const RISK_LEVEL_TEXT = {
  safe: ['安全', 'Safe'],
  stateful: ['会改变状态', 'Changes state'],
  confirm: ['需要确认', 'Needs confirmation'],
  danger: ['高风险', 'High risk'],
}

const POMODORO_LOOP_TEXT = {
  'supported': ['可用', 'Available'],
  'unsupported': ['不支持', 'Not supported'],
  'unknown-host-capability': ['未知', 'Unknown'],
}

const PROXY_STATUS_TEXT = {
  'detected': ['检测到代理', 'Proxy detected'],
  'not-detected': ['未检测到代理', 'No proxy detected'],
  'degraded': ['无法读取代理设置', 'Couldn\'t read proxy settings'],
}

const PROXY_SOURCE_TEXT = {
  'macos-system': ['macOS 系统设置', 'macOS settings'],
  'windows-system': ['Windows 系统设置', 'Windows settings'],
  'linux-gsettings': ['GNOME 设置', 'GNOME settings'],
}

const PROXY_SETTING_TEXT = {
  'Auto Discovery': ['自动发现代理', 'Auto Proxy Discovery'],
  'GNOME Proxy Mode': ['代理模式', 'Proxy Mode'],
  'PAC': ['自动代理配置（PAC）', 'Automatic Proxy Configuration (PAC)'],
  'ProxyServer': ['代理服务器', 'Proxy Server'],
  'AutoConfigURL': ['自动配置脚本', 'Auto-Config Script'],
  'ProxyOverride': ['不使用代理的地址', 'Bypass List'],
}

// The status as the system reports it: `pmset` on macOS, `Win32_Battery` on Windows, sysfs on Linux.
const BATTERY_STATUS_TEXT = {
  'charging': ['正在充电', 'Charging'],
  'discharging': ['正在使用电池', 'On battery'],
  'charged': ['已充满', 'Fully charged'],
  'full': ['已充满', 'Fully charged'],
  'fully charged': ['已充满', 'Fully charged'],
  'finishing charge': ['即将充满', 'Finishing charge'],
  'ac attached': ['已接通电源', 'On power'],
  'ac': ['已接通电源', 'On power'],
  'not charging': ['未在充电', 'Not charging'],
  'low': ['电量低', 'Low'],
  'critical': ['电量严重不足', 'Critically low'],
  'charging and high': ['正在充电', 'Charging'],
  'charging and low': ['正在充电，电量低', 'Charging, low'],
  'charging and critical': ['正在充电，电量严重不足', 'Charging, critically low'],
  'partially charged': ['已部分充电', 'Partially charged'],
}

const SESSION_STATE_TEXT = {
  running: ['运行中', 'Running'],
  paused: ['已暂停', 'Paused'],
}

const AUDIT_DECISION_TEXT = {
  delivered: ['已送达', 'Delivered'],
  blocked: ['已拦截', 'Blocked'],
  degraded: ['受限', 'Limited'],
}

const PATH_FORMAT_TEXT = {
  shell: ['Shell', 'Shell'],
  fileUrl: ['文件 URL', 'File URL'],
  windows: ['Windows', 'Windows'],
  wsl: ['WSL', 'WSL'],
}

const FORMAT_MODE_TEXT = {
  upper: ['大写', 'UPPERCASE'],
  lower: ['小写', 'lowercase'],
  camel: ['驼峰命名', 'camelCase'],
  snake: ['蛇形命名', 'snake_case'],
  kebab: ['短横线命名', 'kebab-case'],
}

function describeWord(words, value) {
  const text = words[value]
  if (text)
    return t(...text)
  return value && value !== 'unknown' ? String(value) : t('未知', 'Unknown')
}

function describeEnabled(enabled) {
  return enabled ? t('已开启', 'On') : t('已关闭', 'Off')
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getQueryText(query) {
  if (typeof query === 'string')
    return query
  return query?.text ?? ''
}

function toTuffQuery(query) {
  if (query && typeof query === 'object')
    return query
  return {
    text: getQueryText(query),
    inputs: [],
  }
}

function extractFilesFromQuery(query) {
  if (!query || typeof query !== 'object')
    return []

  const inputs = Array.isArray(query.inputs) ? query.inputs : []
  const filesInput = inputs.find(input => input?.type === 'files')
  if (!filesInput || typeof filesInput.content !== 'string')
    return []

  try {
    const parsed = JSON.parse(filesInput.content)
    if (!Array.isArray(parsed))
      return []
    return parsed.filter(item => typeof item === 'string' && item.trim()).map(item => item.trim())
  }
  catch {
    return []
  }
}

function stripQuickOpsPrefix(value) {
  const text = normalizeText(value)
  const lower = text.toLowerCase()
  for (const prefix of QUICKOPS_PREFIXES) {
    if (lower === prefix)
      return ''
    if (!lower.startsWith(prefix))
      continue

    const tail = text.slice(prefix.length).trimStart()
    if (!tail || [':', '：', '-'].includes(tail[0]))
      return tail.slice(tail ? 1 : 0).trimStart()
  }
  return text
}

function truncateText(value, max = 120) {
  const text = normalizeText(value)
  if (text.length <= max)
    return text
  return `${text.slice(0, max - 1)}…`
}

function hashRequestText(value) {
  const text = normalizeText(value).slice(0, 256)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function buildFlowAdapterTrace(query, action, confirmation, result, payloadKeys = []) {
  return {
    requestHash: hashRequestText(getQueryText(query)),
    targetId: action.targetId,
    confirmation,
    result,
    payloadKeys: [...payloadKeys].sort(),
    sensitivePayloadRedacted: true,
  }
}

function formatBytes(value) {
  const size = Number(value)
  if (!Number.isFinite(size) || size <= 0)
    return '0 B'

  let current = size
  let unitIndex = 0
  while (current >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    current /= 1024
    unitIndex += 1
  }

  const precision = current >= 10 || unitIndex === 0 ? 0 : 1
  return `${current.toFixed(precision)} ${BYTE_UNITS[unitIndex]}`
}

function formatDuration(seconds) {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (days > 0)
    return t(`${days} 天 ${hours} 小时`, `${days}d ${hours}h`)
  if (hours > 0)
    return t(`${hours} 小时 ${minutes} 分钟`, `${hours}h ${minutes}m`)
  return t(`${minutes} 分钟`, `${minutes}m`)
}

function formatDurationMs(ms) {
  return formatDuration((Number(ms) || 0) / 1000)
}

function formatCounts(counts, words) {
  return Object.entries(counts)
    .map(([key, count]) => `${describeWord(words, key)} ${count}`)
    .join(' · ')
}

function formatReasonCounts(counts) {
  return Object.entries(counts)
    .map(([reason, count]) => t(`${describeReason(reason)}（${count}）`, `${describeReason(reason)} (${count})`))
    .join(t('；', '; '))
}

function countBy(entries, field) {
  return entries.reduce((result, entry) => {
    const key = entry?.[field] || 'unknown'
    result[key] = (result[key] || 0) + 1
    return result
  }, {})
}

function extractFirstNumber(text) {
  const match = text.match(/\b(\d{1,5})\b/)
  return match ? Number(match[1]) : undefined
}

function extractQuotedOrTrailingText(text, prefixes) {
  const quoted = text.match(/["“”']([^"“”']+)["“”']/)
  if (quoted?.[1])
    return quoted[1].trim()

  const cleaned = stripQuickOpsPrefix(text)
  const lower = cleaned.toLowerCase()
  for (const prefix of prefixes) {
    if (lower.startsWith(prefix.toLowerCase()))
      return cleaned.slice(prefix.length).trim()
  }

  return ''
}

function extractHostname(text) {
  const cleaned = stripQuickOpsPrefix(text)
  const match = cleaned.match(
    /(?:deep\s+)?(?:dns|dns\s+query|解析|域名解析)\s+([a-z0-9.-]+\.[a-z]{2,})/i,
  )
  return match?.[1]?.toLowerCase() || ''
}

function extractFilePath(text, keywords) {
  return extractQuotedOrTrailingText(text, [
    ...keywords,
  ])
}

function resolveFileToolPath(query, text, keywords) {
  const explicitPath = extractFilePath(text, keywords)
  if (explicitPath)
    return explicitPath
  return extractFilesFromQuery(query)[0] || ''
}

function extractCommonDirectoryQuery(text) {
  return extractQuotedOrTrailingText(text, [
    'common directory',
    'common dir',
    'folder',
    'directory',
    '目录',
    '常用目录',
  ])
}

function extractFormatTextRequest(text) {
  const cleaned = stripQuickOpsPrefix(text)
  const modeMatch = cleaned.match(/\b(upper|lower|camel|snake|kebab)\b/i)
  const mode = modeMatch?.[1]?.toLowerCase() || 'snake'
  const value = extractQuotedOrTrailingText(cleaned, [
    `format text ${mode}`,
    `text format ${mode}`,
    'format text',
    'text format',
    '格式化文本',
    '文本格式化',
    mode,
  ])
  return {
    mode,
    text: value,
  }
}

function isDeveloperPreviewQuery(query) {
  const text = normalizeText(getQueryText(query))
  if (!text)
    return false

  return /^(?:json|url\s+(?:encode|decode)|base64\s+(?:encode|decode)|jwt\s+decode|regex\s+test|markdown\s+table|csv\s+to\s+markdown|markdown\s+to\s+csv|timestamp|date|timezone|uuid|short\s+id|qr\s+code|case\s+(?:upper|lower|camel|snake|kebab)|upper|lower|camel|snake|kebab)(?:\b|$)/i.test(text)
}

function buildInfoItem({ featureId, id, title, subtitle, meta = {} }) {
  return new TuffItemBuilder(`${featureId}-${id}`)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      readOnly: true,
      runtimeBoundary: 'official-plugin',
      quickOpsMigrationShell: true,
      ...meta,
    })
    .build()
}

function isQrDeveloperPreviewPayload(payload) {
  return payload?.meta?.quickOps?.render?.kind === 'qr-code-svg'
}

function buildDeveloperPreviewItem(featureId, query, response) {
  if (!response || response.state !== 'ready' || !response.payload) {
    return buildInfoItem({
      featureId,
      id: `developer-preview-${response?.state || 'empty'}`,
      title: response?.state === 'blocked'
        ? t('QuickOps 开发者工具已关闭', 'QuickOps Developer Tools Are Turned Off')
        : t('QuickOps 开发者预览不可用', 'QuickOps Developer Preview Unavailable'),
      subtitle: describeReason(response?.reason || 'no-preview-result'),
      meta: {
        mode: 'developer-preview',
        state: response?.state || 'empty',
        reason: response?.reason,
      },
    })
  }

  const payload = {
    ...response.payload,
    confidence: response.confidence,
  }
  const id = `${featureId}-developer-preview-${hashRequestText(getQueryText(query))}`
  const builder = new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      readOnly: true,
      runtimeBoundary: 'coreapp-host-capability',
      quickOpsMigrationShell: false,
      mode: 'developer-preview',
      preview: {
        abilityId: response.abilityId,
        confidence: response.confidence,
      },
    })
  if (typeof builder.setKind === 'function')
    builder.setKind('preview')
  if (typeof builder.setCustomRender === 'function')
    builder.setCustomRender('vue', PREVIEW_COMPONENT_NAME, payload)
  if (typeof builder.setClassName === 'function')
    builder.setClassName('core-preview-card')
  if (typeof builder.setFinalScore === 'function')
    builder.setFinalScore(1)
  if (payload.title && typeof builder.setTitle === 'function')
    builder.setTitle(payload.title)

  const actions = []

  if (isQrDeveloperPreviewPayload(payload)) {
    builder.setMeta({
      defaultAction: DEVELOPER_PREVIEW_SAVE_SVG_ACTION_ID,
      actionId: DEVELOPER_PREVIEW_SAVE_SVG_ACTION_ID,
      developerPreviewPayload: payload,
    })
    actions.push({
      id: DEVELOPER_PREVIEW_SAVE_SVG_ACTION_ID,
      type: 'plugin',
      label: t('保存 SVG 到临时文件夹', 'Save SVG to Temporary Folder'),
      icon: { type: 'class', value: 'i-ri-save-line' },
      payload: { developerPreviewPayload: payload },
    })
    actions.push({
      id: DEVELOPER_PREVIEW_SAVE_PNG_ACTION_ID,
      type: 'plugin',
      label: t('保存 PNG 到临时文件夹', 'Save PNG to Temporary Folder'),
      icon: { type: 'class', value: 'i-ri-image-line' },
      payload: { developerPreviewPayload: payload },
    })
  }

  if (typeof builder.setActions === 'function')
    builder.setActions(actions)
  else
    actions.forEach(action => builder.createAndAddAction(action.id, action.type, action.label, action.payload))

  return builder.build()
}

async function buildDeveloperPreviewItems(featureId, query, api) {
  if (typeof api?.developerPreview !== 'function') {
    return [
      buildInfoItem({
        featureId,
        id: 'developer-preview-unsupported',
        title: t('QuickOps 开发者预览不可用', 'QuickOps Developer Preview Unavailable'),
        subtitle: t('当前版本的 Tuff 不提供开发者预览，更新后再试', 'This version of Tuff doesn\'t provide developer preview; update Tuff and try again'),
        meta: { mode: 'developer-preview', state: 'unsupported' },
      }),
    ]
  }

  return [buildDeveloperPreviewItem(featureId, query, await api.developerPreview({ query: toTuffQuery(query) }))]
}

function matchesAnyPattern(text, patterns) {
  return patterns.some(pattern => pattern.test(text))
}

function resolveSafeFlowAction(query) {
  const text = normalizeText(getQueryText(query))
  return SAFE_FLOW_ACTIONS.find(action => matchesAnyPattern(text, action.patterns)) || null
}

function resolveConfirmationFlowAction(query) {
  const text = normalizeText(getQueryText(query))
  if (!text)
    return null
  return CONFIRMATION_FLOW_ACTIONS.find(action => matchesAnyPattern(text, action.patterns)) || null
}

function resolveHighRiskFlowAction(query) {
  const text = normalizeText(getQueryText(query))
  if (!text)
    return null
  return HIGH_RISK_FLOW_ACTIONS.find(action => matchesAnyPattern(text, action.patterns)) || null
}

function isCleanupFlowAction(action) {
  return /^quickops\.(?:stop|reset)-/.test(action?.targetId || '')
}

function isScreenCleanFlowAction(action) {
  return action?.targetId === 'quickops.clean-screen' || action?.targetId === 'quickops.stop-clean-screen'
}

function buildFlowVisualContract(action) {
  if (!isScreenCleanFlowAction(action))
    return undefined

  return {
    id: 'quickops-screen-clean-visual',
    kind: 'screen-clean-overlay',
    requiresVisualArtifact: true,
  }
}

function buildFlowPayload(action) {
  return {
    type: 'json',
    data: {
      action: action.id,
      targetId: action.targetId,
      cleanup: isCleanupFlowAction(action),
      statefulRuntime: true,
    },
    context: {
      sourcePluginId: QUICKOPS_FLOW_SENDER_ID,
    },
  }
}

function buildFlowDispatchOptions(action) {
  return {
    preferredTarget: action.targetId,
    skipSelector: true,
    requireAck: true,
  }
}

function buildFlowActionItem(featureId, action, query) {
  const visualContract = buildFlowVisualContract(action)
  const payload = {
    actionId: action.id,
    targetId: action.targetId,
    payload: buildFlowPayload(action),
    options: buildFlowDispatchOptions(action),
  }
  const flowAdapterTrace = buildFlowAdapterTrace(query, action, 'not-required', 'dispatch-plan', [
    'action',
    'targetId',
  ])

  return new TuffItemBuilder(`${featureId}-flow-${action.id}`)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(t(...action.title))
    .setSubtitle(t(...action.subtitle))
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      readOnly: false,
      runtimeBoundary: 'official-plugin',
      quickOpsMigrationShell: true,
      mode: 'flow-action',
      cleanup: isCleanupFlowAction(action),
      statefulRuntime: true,
      defaultAction: FLOW_ACTION_ID,
      actionId: FLOW_ACTION_ID,
      flowTargetId: action.targetId,
      ...(visualContract ? { visualContract } : {}),
      payload,
      flowAdapterTrace: {
        ...flowAdapterTrace,
        runtimeDispatchBridge: true,
      },
    })
    .createAndAddAction(FLOW_ACTION_ID, 'plugin', t('执行', 'Run'), payload)
    .build()
}

// The one-time `confirmationToken` these actions need is handed out by Tuff's own confirmation UI; the
// plugin can neither mint one nor go around it, so all it shows is that the action waits for the user.
function buildConfirmationRequiredItems(featureId, action, query) {
  const visualContract = buildFlowVisualContract(action)
  const flowAdapterTrace = buildFlowAdapterTrace(
    query,
    action,
    'confirmation-token-required',
    'blocked-until-confirmed',
  )

  return [
    buildInfoItem({
      featureId,
      id: `confirmation-required-${action.id}`,
      title: t(...action.title),
      subtitle: t('这项操作需要在 Tuff 里确认后才会执行，插件不会替你确认', 'This runs only after you confirm it in Tuff; the plugin never confirms for you'),
      meta: {
        mode: 'confirmation-required',
        flowTargetId: action.targetId,
        ...(visualContract ? { visualContract } : {}),
        requiresConfirmation: true,
        flowAdapterTrace: {
          ...flowAdapterTrace,
          runtimeDispatchBridge: false,
        },
      },
    }),
  ]
}

function buildHighRiskBlockedItems(featureId, action, query) {
  const flowAdapterTrace = buildFlowAdapterTrace(query, action, 'blocked', 'blocked')

  return [
    buildInfoItem({
      featureId,
      id: `high-risk-blocked-${action.id}`,
      title: t(...action.title),
      subtitle: t(...action.subtitle),
      meta: {
        mode: 'high-risk-blocked',
        flowTargetId: action.targetId,
        reason: action.reason,
        confirmation: 'blocked',
        result: 'blocked',
        flowAdapterTrace: {
          ...flowAdapterTrace,
          runtimeDispatchBridge: false,
        },
      },
    }),
  ]
}

function formatFlowAck(ackPayload) {
  if (!ackPayload || typeof ackPayload !== 'object')
    return 'Flow action delivered'

  const state = ackPayload.state || ackPayload.kind || 'delivered'
  const parts = [String(state)]
  if (typeof ackPayload.stopped === 'number')
    parts.push(`stopped:${ackPayload.stopped}`)
  else if (typeof ackPayload.stopped === 'boolean')
    parts.push(`stopped:${ackPayload.stopped}`)
  if (typeof ackPayload.paused === 'boolean')
    parts.push(`paused:${ackPayload.paused}`)
  if (typeof ackPayload.resumed === 'boolean')
    parts.push(`resumed:${ackPayload.resumed}`)
  if (typeof ackPayload.recorded === 'boolean')
    parts.push(`recorded:${ackPayload.recorded}`)
  if (typeof ackPayload.reset === 'boolean')
    parts.push(`reset:${ackPayload.reset}`)
  return parts.join(' · ')
}

function resolveMode(query) {
  const text = normalizeText(getQueryText(query)).toLowerCase()
  const hasFilesInput = extractFilesFromQuery(query).length > 0
  if (/audit|审计|flow log|delivery log/i.test(text))
    return 'audit'
  if (/settings?|preferences?|配置|偏好|设置/i.test(text))
    return 'settings'
  if (/diagnostics?|诊断|排障/i.test(text))
    return 'diagnostics'
  if (/system\s+info|sysinfo|系统信息|系统摘要/i.test(text))
    return 'system-info'
  if (/port\s+\d+|端口\s*\d+/i.test(text))
    return 'port-status'
  if (/(?:deep\s+)?dns\s+(?:query\s+)?[a-z0-9.-]+\.[a-z]{2,}|(?:域名解析|解析)\s+[a-z0-9.-]+\.[a-z]{2,}/i.test(text))
    return 'dns-query'
  if (/(?:^|\b)(?:file\s+hash|hash\s+file|hash)(?:\b|$)|文件\s*hash|文件校验/i.test(text))
    return 'file-hash'
  if (/(?:^|\b)(?:file\s+base64|base64\s+file)(?:\b|$)|文件\s*base64/i.test(text))
    return 'file-base64'
  if (/recent\s+download|latest\s+download|最近下载|最新下载/i.test(text))
    return 'recent-download'
  if (/common\s+(?:directory|dir)|常用目录/i.test(text))
    return 'common-directory'
  if (/path\s+format|copy\s+path|路径格式|复制路径/i.test(text))
    return 'path-format'
  if (/format\s+text|text\s+format|格式化文本|文本格式化|\b(?:upper|lower|camel|snake|kebab)\s+.+/i.test(text))
    return 'format-text'
  if (/deep\s+(?:directory|dir)\s+usage|深度.*(?:目录|文件夹).*占用/i.test(text))
    return 'directory-usage-deep'
  if (/(?:directory|dir)\s+usage|目录占用|文件夹占用/i.test(text))
    return 'directory-usage'
  if (/disk\s+(?:space|usage)|storage\s+status|磁盘|存储空间|容量/i.test(text))
    return 'disk-space'
  if (/local\s+ip|本机\s*ip|ip\s+address/i.test(text))
    return 'local-ip'
  if (/network\s+status|网络状态|网络摘要/i.test(text))
    return 'network-status'
  if (/battery\s+status|电池|battery/i.test(text))
    return 'battery-status'
  if (/system\s+proxy|proxy\s+status|代理/i.test(text))
    return 'system-proxy'
  if (/session|quick\s*ops?\s+status|running|会话|运行|快捷工具.*状态|本地快捷工具.*状态/i.test(text))
    return 'sessions'
  if (hasFilesInput)
    return 'path-format'
  return 'capabilities'
}

function buildCapabilityItems(featureId, response) {
  const entries = Array.isArray(response?.entries) ? response.entries : []
  const statusCounts = countBy(entries, 'status')
  const riskCounts = countBy(entries, 'riskLevel')
  const noEntries = t('暂无能力条目', 'No capabilities')
  const items = [
    buildInfoItem({
      featureId,
      id: 'capability-summary',
      title: t('QuickOps 能力摘要', 'QuickOps Capabilities'),
      subtitle: `${describePlatform(response?.platform)} · ${describeEnabled(response?.enabled !== false)} · ${formatCounts(statusCounts, CAPABILITY_STATUS_TEXT) || noEntries}`,
      meta: { mode: 'capabilities', count: entries.length },
    }),
    buildInfoItem({
      featureId,
      id: 'risk-summary',
      title: t('QuickOps 风险分布', 'QuickOps Risk Levels'),
      subtitle: formatCounts(riskCounts, RISK_LEVEL_TEXT) || noEntries,
      meta: { mode: 'capabilities', count: entries.length },
    }),
  ]

  for (const entry of entries.slice(0, 8)) {
    // A supported capability's reason names the probe it reads (`macos-pmset`): nothing the user acts on.
    const reason = entry.reason && entry.status !== 'supported' ? ` · ${describeReason(entry.reason)}` : ''
    items.push(buildInfoItem({
      featureId,
      id: `capability-${entry.id}`,
      title: entry.label || entry.id,
      subtitle: `${describeWord(CAPABILITY_STATUS_TEXT, entry.status)} · ${describeWord(RISK_LEVEL_TEXT, entry.riskLevel)}${reason}`,
      meta: {
        mode: 'capabilities',
        capabilityId: entry.id,
        status: entry.status,
        riskLevel: entry.riskLevel,
      },
    }))
  }

  return items
}

function buildPomodoroTemplateSummary(diagnostics = {}) {
  const focusMs = Number(diagnostics.defaultPomodoroFocusMs) || 0
  const breakMs = Number(diagnostics.defaultPomodoroBreakMs) || 0
  if (focusMs <= 0 || breakMs <= 0)
    return null

  return {
    id: 'default-focus-break',
    title: '默认专注 / 休息',
    focusMs,
    breakMs,
    cycles: 1,
    advancedLoop: false,
    state: 'read-only',
  }
}

function resolvePomodoroAdvancedLoopState(diagnostics = {}) {
  if (diagnostics.pomodoroAdvancedLoopSupported === true)
    return 'supported'
  if (diagnostics.pomodoroAdvancedLoopSupported === false)
    return 'unsupported'
  return 'unknown-host-capability'
}

function buildSettingsItems(featureId, capabilityResponse, diagnosticsResponse) {
  const diagnostics = diagnosticsResponse?.diagnostics
  const entries = Array.isArray(capabilityResponse?.entries) ? capabilityResponse.entries : []
  const disabledEntries = entries.filter(entry => entry?.status === 'disabled')
  const disabledReasons = countBy(disabledEntries, 'reason')
  const platform = describePlatform(capabilityResponse?.platform || diagnostics?.platform)
  const items = [
    buildInfoItem({
      featureId,
      id: 'settings-summary',
      title: t('QuickOps 设置', 'QuickOps Settings'),
      subtitle: `${platform} · ${describeEnabled(capabilityResponse?.enabled !== false)}`,
      meta: {
        mode: 'settings',
        writable: false,
        settingsOwner: 'official-plugin',
        runtimeOwner: 'coreapp-host-capability',
      },
    }),
    buildInfoItem({
      featureId,
      id: 'settings-policy',
      title: t('QuickOps 策略', 'QuickOps Policy'),
      subtitle: disabledEntries.length
        ? `${countText(disabledEntries.length, '项已停用', 'feature off', 'features off')} · ${formatReasonCounts(disabledReasons)}`
        : t('没有停用的功能', 'No features are turned off'),
      meta: {
        mode: 'settings',
        disabledCount: disabledEntries.length,
        disabledReasons,
      },
    }),
  ]

  if (diagnostics) {
    const pomodoroTemplate = buildPomodoroTemplateSummary(diagnostics)
    const pomodoroAdvancedLoopState = resolvePomodoroAdvancedLoopState(diagnostics)
    const pomodoroCustomTemplateCount = Math.max(
      0,
      Math.trunc(Number(diagnostics.pomodoroCustomTemplateCount) || 0),
    )
    items.push(buildInfoItem({
      featureId,
      id: 'settings-defaults',
      title: t('QuickOps 默认值', 'QuickOps Defaults'),
      subtitle: [
        `${t('保持唤醒', 'Keep awake')} ${formatDurationMs(diagnostics.defaultKeepAwakeDurationMs)}`,
        `${t('计时器', 'Timer')} ${formatDurationMs(diagnostics.defaultTimerDurationMs)}`,
        `${t('番茄钟', 'Pomodoro')} ${formatDurationMs(diagnostics.defaultPomodoroFocusMs)}/${formatDurationMs(diagnostics.defaultPomodoroBreakMs)}`,
        `${t('番茄钟循环', 'Pomodoro cycles')} ${describeWord(POMODORO_LOOP_TEXT, pomodoroAdvancedLoopState)}`,
        `${t('清屏', 'Clean screen')} ${formatDurationMs(diagnostics.defaultScreenCleanDurationMs)}`,
      ].join(' · '),
      meta: {
        mode: 'settings',
        defaults: {
          keepAwakeMs: diagnostics.defaultKeepAwakeDurationMs,
          timerMs: diagnostics.defaultTimerDurationMs,
          pomodoroFocusMs: diagnostics.defaultPomodoroFocusMs,
          pomodoroBreakMs: diagnostics.defaultPomodoroBreakMs,
          screenCleanMs: diagnostics.defaultScreenCleanDurationMs,
        },
        pomodoroAdvancedLoopState,
        pomodoroCustomTemplateCount,
        ...(pomodoroTemplate
          ? {
              pomodoroTemplates: [pomodoroTemplate],
            }
          : {}),
      },
    }))
  }

  items.push(buildInfoItem({
    featureId,
    id: 'settings-boundary',
    title: t('QuickOps 设置在这里只读', 'QuickOps Settings Are Read-Only Here'),
    subtitle: t('这里只显示当前的策略和默认值', 'This shows the current policy and defaults'),
    meta: {
      mode: 'settings',
      state: 'read-only',
      privateIpcFallback: false,
    },
  }))

  return items
}

function buildUnsupportedToolItems(featureId, mode, methodName) {
  return [
    buildInfoItem({
      featureId,
      id: `${mode}-unsupported`,
      title: t('这项 QuickOps 功能不可用', 'This QuickOps Feature Is Unavailable'),
      subtitle: t('当前版本的 Tuff 不提供这项功能，更新后再试', 'This version of Tuff doesn\'t provide this feature; update Tuff and try again'),
      meta: { mode, methodName, state: 'unsupported' },
    }),
  ]
}

function buildDegradedItems(featureId, mode, title, response) {
  const reason = REASON_TEXT[response?.degradedReason]
  const detail = normalizeText(response?.message || response?.errorCode)
  const subtitle = reason
    ? [t(...reason), detail].filter(Boolean).join(' · ')
    : detail || describeReason(response?.degradedReason) || t('暂时无法完成，请稍后再试', 'Couldn\'t complete this right now; try again later')
  return [
    buildInfoItem({
      featureId,
      id: `${mode}-degraded`,
      title,
      subtitle: truncateText(subtitle),
      meta: {
        mode,
        state: 'degraded',
        degradedReason: response?.degradedReason,
      },
    }),
  ]
}

function buildSystemInfoItems(featureId, response) {
  const info = response?.systemInfo
  if (!info)
    return buildDegradedItems(featureId, 'system-info', t('QuickOps 系统信息不可用', 'QuickOps System Info Unavailable'), response)

  return [
    buildInfoItem({
      featureId,
      id: 'system-info-summary',
      title: t('QuickOps 系统信息', 'QuickOps System Info'),
      subtitle: `${info.osType} ${info.osRelease} · ${info.platform}/${info.arch} · ${t(`内存 ${formatBytes(info.totalMemoryBytes)}`, `${formatBytes(info.totalMemoryBytes)} memory`)}`,
      meta: { mode: 'system-info', platform: info.platform, arch: info.arch },
    }),
    buildInfoItem({
      featureId,
      id: 'system-info-runtime',
      title: t('处理器、内存与运行时间', 'CPU, Memory and Uptime'),
      subtitle: t(
        `${info.cpuModel || '未知处理器'} · ${info.cpuCount} 核 · 可用 ${formatBytes(info.freeMemoryBytes)} · 已运行 ${formatDuration(info.uptimeSeconds)}`,
        `${info.cpuModel || 'Unknown CPU'} · ${englishCount(info.cpuCount, 'core')} · ${formatBytes(info.freeMemoryBytes)} free · up ${formatDuration(info.uptimeSeconds)}`,
      ),
      meta: { mode: 'system-info', cpuCount: info.cpuCount },
    }),
  ]
}

function buildDiagnosticsItems(featureId, response) {
  const diagnostics = response?.diagnostics
  if (!diagnostics)
    return buildDegradedItems(featureId, 'diagnostics', t('Tuff 诊断摘要不可用', 'Tuff Diagnostics Unavailable'), response)

  return [
    buildInfoItem({
      featureId,
      id: 'diagnostics-summary',
      title: t('Tuff 诊断摘要', 'Tuff Diagnostics'),
      subtitle: `Tuff ${diagnostics.appVersion} · ${diagnostics.platform}/${diagnostics.arch} · QuickOps ${describeEnabled(diagnostics.quickOpsEnabled)}`,
      meta: { mode: 'diagnostics', schemaVersion: diagnostics.schemaVersion },
    }),
    buildInfoItem({
      featureId,
      id: 'diagnostics-runtime',
      title: t('运行环境与网络', 'Runtime and Network'),
      subtitle: [
        `Node ${diagnostics.nodeVersion}`,
        `Electron ${diagnostics.electronVersion}`,
        countText(diagnostics.localAddressCount, '个本机地址', 'local address', 'local addresses'),
        countText(diagnostics.dnsServerCount, '个 DNS 服务器', 'DNS server'),
        describeWord(PROXY_STATUS_TEXT, diagnostics.proxyStatus),
      ].join(' · '),
      meta: { mode: 'diagnostics', proxyStatus: diagnostics.proxyStatus },
    }),
  ]
}

function buildDiskSpaceItems(featureId, response) {
  if (response?.state !== 'ready') {
    return buildDegradedItems(featureId, 'disk-space', t('QuickOps 磁盘空间不可用', 'QuickOps Disk Space Unavailable'), response)
  }

  const entries = Array.isArray(response?.diskSpace?.entries) ? response.diskSpace.entries : []
  const items = [
    buildInfoItem({
      featureId,
      id: 'disk-space-summary',
      title: t('QuickOps 磁盘空间', 'QuickOps Disk Space'),
      subtitle: entries.length ? countText(entries.length, '个位置', 'location') : t('没有可显示的磁盘', 'No disks to show'),
      meta: { mode: 'disk-space', count: entries.length },
    }),
  ]

  for (const entry of entries.slice(0, 6)) {
    items.push(buildInfoItem({
      featureId,
      // The label follows the interface language; the path keeps the id the same across a switch.
      id: `disk-${entry.path || entry.label}`,
      title: `${entry.label} · ${t(`已用 ${entry.usedPercent}%`, `${entry.usedPercent}% used`)}`,
      subtitle: `${t(`可用 ${formatBytes(entry.freeBytes)}，共 ${formatBytes(entry.totalBytes)}`, `${formatBytes(entry.freeBytes)} free of ${formatBytes(entry.totalBytes)}`)} · ${entry.path}`,
      meta: {
        mode: 'disk-space',
        label: entry.label,
        usedPercent: entry.usedPercent,
      },
    }))
  }

  return items
}

function buildDirectoryUsageItems(featureId, response, deep) {
  const mode = deep ? 'directory-usage-deep' : 'directory-usage'
  if (response?.state !== 'ready') {
    return buildDegradedItems(featureId, mode, t('QuickOps 文件夹占用不可用', 'QuickOps Folder Usage Unavailable'), response)
  }

  const entries = Array.isArray(response?.directoryUsage?.entries)
    ? response.directoryUsage.entries
    : []
  const items = [
    buildInfoItem({
      featureId,
      id: `${mode}-summary`,
      title: deep
        ? t('QuickOps 文件夹占用（含子文件夹）', 'QuickOps Folder Usage (Including Subfolders)')
        : t('QuickOps 文件夹占用', 'QuickOps Folder Usage'),
      subtitle: countText(entries.length, '个文件夹', 'folder'),
      meta: { mode, count: entries.length },
    }),
  ]

  for (const entry of entries.slice(0, 6)) {
    const size = deep ? entry.totalFileBytes : entry.directFileBytes
    items.push(buildInfoItem({
      featureId,
      id: `${mode}-${entry.path || entry.label}`,
      title: `${entry.label} · ${formatBytes(size)}`,
      subtitle: [
        countText(entry.fileCount, '个文件', 'file'),
        countText(entry.directoryCount, '个文件夹', 'folder'),
        ...(entry.truncated ? [t('只扫描了一部分', 'Partly scanned')] : []),
      ].join(' · '),
      meta: {
        mode,
        label: entry.label,
        truncated: Boolean(entry.truncated),
      },
    }))
  }

  return items
}

function buildNetworkStatusItems(featureId, response) {
  const info = response?.networkStatus
  if (!info)
    return buildDegradedItems(featureId, 'network-status', t('QuickOps 网络状态不可用', 'QuickOps Network Status Unavailable'), response)

  const addresses = Array.isArray(info.addresses) ? info.addresses : []
  const dnsServers = Array.isArray(info.dnsServers) ? info.dnsServers : []
  const proxies = Array.isArray(info.proxies) ? info.proxies : []
  const items = [
    buildInfoItem({
      featureId,
      id: 'network-status-summary',
      title: t('QuickOps 网络状态', 'QuickOps Network Status'),
      subtitle: [
        countText(addresses.length, '个本机地址', 'local address', 'local addresses'),
        countText(dnsServers.length, '个 DNS 服务器', 'DNS server'),
        describeWord(PROXY_STATUS_TEXT, info.proxyStatus),
      ].join(' · '),
      meta: {
        mode: 'network-status',
        addressCount: addresses.length,
        dnsServerCount: dnsServers.length,
        proxyStatus: info.proxyStatus,
      },
    }),
  ]

  for (const address of addresses.slice(0, 5)) {
    items.push(buildInfoItem({
      featureId,
      id: `network-address-${address.name}-${address.address}`,
      title: `${address.name} · ${address.family}`,
      subtitle: address.address,
      meta: { mode: 'network-status', family: address.family },
    }))
  }

  if (dnsServers.length > 0) {
    items.push(buildInfoItem({
      featureId,
      id: 'network-dns',
      title: t('DNS 服务器', 'DNS Servers'),
      subtitle: dnsServers.slice(0, 5).join(' · '),
      meta: { mode: 'network-status', dnsServerCount: dnsServers.length },
    }))
  }

  if (proxies.length > 0) {
    items.push(buildInfoItem({
      featureId,
      id: 'network-proxy',
      title: t('代理环境变量', 'Proxy Environment Variables'),
      subtitle: proxies.slice(0, 4).map(proxy => `${proxy.source}:${proxy.value}`).join(' · '),
      meta: { mode: 'network-status', proxyCount: proxies.length },
    }))
  }

  return items
}

function buildLocalIpItems(featureId, response) {
  const addresses = Array.isArray(response?.addresses) ? response.addresses : []
  if (addresses.length === 0) {
    return buildDegradedItems(featureId, 'local-ip', t('QuickOps 本机 IP 不可用', 'QuickOps Local IP Unavailable'), {
      degradedReason: response?.degradedReason || 'local-ip-unavailable',
    })
  }

  return addresses.slice(0, 8).map((address, index) =>
    buildInfoItem({
      featureId,
      id: `local-ip-${index}`,
      title: `${address.name} · ${address.family}`,
      subtitle: address.address,
      meta: { mode: 'local-ip', family: address.family },
    }))
}

function buildBatteryStatusItems(featureId, response) {
  if (response?.state !== 'ready') {
    return buildDegradedItems(featureId, 'battery-status', t('QuickOps 电池状态不可用', 'QuickOps Battery Status Unavailable'), response)
  }

  const info = response?.batteryStatus
  const level = typeof info?.levelPercent === 'number' ? `${info.levelPercent}%` : t('电量未知', 'Level unknown')
  return [
    buildInfoItem({
      featureId,
      id: 'battery-status-summary',
      title: t('QuickOps 电池状态', 'QuickOps Battery Status'),
      subtitle: `${level} · ${describeBatteryStatus(info)}`,
      meta: {
        mode: 'battery-status',
        levelPercent: info?.levelPercent,
        charging: info?.charging,
        source: info?.source,
      },
    }),
  ]
}

// A status the table doesn't know (`Undefined`, `Unknown (12)`) falls back to whether it is charging.
function describeBatteryStatus(info) {
  const text = BATTERY_STATUS_TEXT[normalizeText(info?.status).toLowerCase()]
  if (text)
    return t(...text)
  if (info?.charging === true)
    return t('正在充电', 'Charging')
  if (info?.charging === false)
    return t('未在充电', 'Not charging')
  return t('状态未知', 'Unknown status')
}

function describeProxyValue(value) {
  if (value === 'enabled')
    return t('已开启', 'On')
  if (value === 'manual')
    return t('手动', 'Manual')
  if (value === 'auto')
    return t('自动', 'Automatic')
  return value
}

function buildSystemProxyItems(featureId, response) {
  const info = response?.systemProxy
  if (!info || response?.state === 'degraded') {
    return buildDegradedItems(featureId, 'system-proxy', t('QuickOps 系统代理不可用', 'QuickOps System Proxy Unavailable'), response)
  }

  const environment = Array.isArray(info.environment) ? info.environment : []
  const system = Array.isArray(info.system) ? info.system : []
  const items = [
    buildInfoItem({
      featureId,
      id: 'system-proxy-summary',
      title: t('QuickOps 系统代理', 'QuickOps System Proxy'),
      subtitle: [
        describePlatform(info.platform),
        describeWord(PROXY_STATUS_TEXT, info.status),
        countText(environment.length, '个环境变量', 'environment variable'),
        countText(system.length, '项系统设置', 'system setting'),
      ].join(' · '),
      meta: { mode: 'system-proxy', status: info.status },
    }),
  ]

  for (const proxy of [...environment, ...system].slice(0, 6)) {
    // An environment entry is named by its variable (`HTTPS_PROXY`), which stays as it is.
    const source = describeWord(PROXY_SOURCE_TEXT, proxy.source)
    items.push(buildInfoItem({
      featureId,
      id: `system-proxy-${proxy.source}-${proxy.name || proxy.value}`,
      title: proxy.name ? `${source} · ${describeWord(PROXY_SETTING_TEXT, proxy.name)}` : source,
      subtitle: describeProxyValue(proxy.value),
      meta: { mode: 'system-proxy', source: proxy.source },
    }))
  }

  return items
}

function buildPortStatusItems(featureId, response) {
  if (!response || response.state === 'degraded') {
    return buildDegradedItems(featureId, 'port-status', t('QuickOps 端口状态不可用', 'QuickOps Port Status Unavailable'), response)
  }

  const title = response.available
    ? t(`端口 ${response.port} 可用`, `Port ${response.port} Is Free`)
    : t(`端口 ${response.port} 被占用`, `Port ${response.port} Is in Use`)
  const subtitle = response.process
    ? `${response.host || '127.0.0.1'} · PID ${response.process.pid} · ${response.process.name || response.process.command || response.process.source}`
    : `${response.host || '127.0.0.1'} · ${response.available ? t('空闲', 'Free') : t('被占用', 'In use')}`
  const items = [
    buildInfoItem({
      featureId,
      id: `port-status-${response.port}`,
      title,
      subtitle,
      meta: {
        mode: 'port-status',
        port: response.port,
        state: response.state,
        available: response.available,
      },
    }),
  ]

  if (response.releaseCommand) {
    items.push(buildInfoItem({
      featureId,
      id: `port-status-release-${response.port}`,
      title: t('释放端口的命令', 'Command to Free the Port'),
      subtitle: response.releaseCommand,
      meta: {
        mode: 'port-status',
        port: response.port,
        copyOnly: true,
      },
    }))
  }

  return items
}

function buildDnsQueryItems(featureId, response) {
  if (!response || response.state !== 'resolved') {
    return buildDegradedItems(featureId, 'dns-query', t('QuickOps DNS 查询不可用', 'QuickOps DNS Lookup Unavailable'), response)
  }

  const info = response.dnsQuery
  const items = [
    buildInfoItem({
      featureId,
      id: `dns-query-${info.hostname}`,
      title: t(`DNS 查询 · ${info.hostname}`, `DNS Lookup · ${info.hostname}`),
      subtitle: `${countText(info.records.length, '条记录', 'record')}${info.failedTypes.length ? ` · ${t('查询失败：', 'Failed: ')}${info.failedTypes.join('/')}` : ''}`,
      meta: {
        mode: 'dns-query',
        hostname: info.hostname,
        deep: info.deep,
      },
    }),
  ]

  for (const record of info.records.slice(0, 8)) {
    items.push(buildInfoItem({
      featureId,
      id: `dns-query-${info.hostname}-${record.type}-${record.value}`,
      title: `${record.type}${record.priority !== undefined ? ` ${record.priority}` : ''}`,
      subtitle: record.value,
      meta: { mode: 'dns-query', type: record.type },
    }))
  }

  return items
}

function buildFileHashItems(featureId, response) {
  if (!response || response.state !== 'hashed') {
    return buildDegradedItems(featureId, 'file-hash', t('QuickOps 文件哈希不可用', 'QuickOps File Hash Unavailable'), response)
  }

  return [
    buildInfoItem({
      featureId,
      id: `file-hash-${response.path}`,
      title: t(`文件哈希 · ${response.fileName}`, `File Hash · ${response.fileName}`),
      subtitle: `${formatBytes(response.size)} · SHA256 ${response.hashes.sha256}`,
      meta: {
        mode: 'file-hash',
        path: response.path,
        size: response.size,
      },
    }),
    buildInfoItem({
      featureId,
      id: `file-hash-md5-${response.path}`,
      title: 'MD5 / SHA1',
      subtitle: `MD5 ${response.hashes.md5} · SHA1 ${response.hashes.sha1}`,
      meta: { mode: 'file-hash', path: response.path },
    }),
  ]
}

function buildFileBase64Items(featureId, response) {
  if (!response || response.state !== 'encoded') {
    return buildDegradedItems(featureId, 'file-base64', t('QuickOps 文件 Base64 不可用', 'QuickOps File Base64 Unavailable'), response)
  }

  return [
    buildInfoItem({
      featureId,
      id: `file-base64-${response.path}`,
      title: t(`文件 Base64 · ${response.fileName}`, `File Base64 · ${response.fileName}`),
      subtitle: `${formatBytes(response.size)} · ${truncateText(response.base64, 80)}`,
      meta: {
        mode: 'file-base64',
        path: response.path,
        size: response.size,
        outputCharCount: response.base64.length,
      },
    }),
  ]
}

function buildRecentDownloadItems(featureId, response) {
  if (!response || response.state !== 'found') {
    return buildDegradedItems(featureId, 'recent-download', t('QuickOps 最近下载不可用', 'QuickOps Latest Download Unavailable'), response)
  }

  return [
    buildInfoItem({
      featureId,
      id: `recent-download-${response.path}`,
      title: t(`最近下载 · ${response.fileName}`, `Latest Download · ${response.fileName}`),
      subtitle: `${formatBytes(response.size)} · ${response.path}`,
      meta: {
        mode: 'recent-download',
        path: response.path,
        modifiedAt: response.modifiedAt,
      },
    }),
  ]
}

function buildCommonDirectoryItems(featureId, response) {
  const info = response?.commonDirectory
  if (!info) {
    return buildDegradedItems(featureId, 'common-directory', t('QuickOps 常用目录不可用', 'QuickOps Common Folder Unavailable'), response)
  }

  return [
    buildInfoItem({
      featureId,
      id: `common-directory-${info.id}`,
      // `title` is the folder in the interface language; `subtitle`, its name on disk, shows in the path.
      title: info.title || info.subtitle,
      subtitle: info.path,
      meta: {
        mode: 'common-directory',
        directoryId: info.id,
        path: info.path,
      },
    }),
  ]
}

function buildPathFormatItems(featureId, response) {
  if (!response || response.state !== 'formatted') {
    return buildDegradedItems(featureId, 'path-format', t('QuickOps 路径格式不可用', 'QuickOps Path Formats Unavailable'), response)
  }

  const formats = response.formats || {}
  const items = [
    buildInfoItem({
      featureId,
      id: `path-format-${response.path}`,
      title: t(`路径格式 · ${response.fileName}`, `Path Formats · ${response.fileName}`),
      subtitle: formats.raw || response.path,
      meta: { mode: 'path-format', path: response.path },
    }),
  ]

  for (const key of ['shell', 'fileUrl', 'windows', 'wsl']) {
    if (!formats[key])
      continue
    items.push(buildInfoItem({
      featureId,
      id: `path-format-${key}-${response.path}`,
      title: t(...PATH_FORMAT_TEXT[key]),
      subtitle: formats[key],
      meta: { mode: 'path-format', path: response.path, format: key },
    }))
  }

  return items
}

function buildFormatTextItems(featureId, response) {
  if (!response || response.state !== 'formatted') {
    return buildDegradedItems(featureId, 'format-text', t('QuickOps 文本格式化不可用', 'QuickOps Text Formatting Unavailable'), response)
  }

  return [
    buildInfoItem({
      featureId,
      id: `format-text-${response.mode}`,
      title: `${t('文本格式化', 'Formatted Text')} · ${describeWord(FORMAT_MODE_TEXT, response.mode)}`,
      subtitle: truncateText(response.text),
      meta: {
        mode: 'format-text',
        formatMode: response.mode,
        inputCharCount: response.inputCharCount,
        outputCharCount: response.outputCharCount,
        truncated: response.truncated,
      },
    }),
  ]
}

async function buildReadOnlyToolItems(featureId, mode, api, query) {
  const queryText = normalizeText(getQueryText(query))
  const toolMap = {
    'system-info': ['systemInfo', response => buildSystemInfoItems(featureId, response)],
    'diagnostics': ['tuffDiagnostics', response => buildDiagnosticsItems(featureId, response)],
    'disk-space': ['diskSpace', response => buildDiskSpaceItems(featureId, response)],
    'directory-usage': [
      'directoryUsage',
      response => buildDirectoryUsageItems(featureId, response, false),
      { deep: false },
    ],
    'directory-usage-deep': [
      'directoryUsage',
      response => buildDirectoryUsageItems(featureId, response, true),
      { deep: true },
    ],
    'network-status': ['networkStatus', response => buildNetworkStatusItems(featureId, response)],
    'local-ip': ['queryLocalIp', response => buildLocalIpItems(featureId, response)],
    'port-status': [
      'portStatus',
      response => buildPortStatusItems(featureId, response),
      { port: extractFirstNumber(queryText), text: queryText },
    ],
    'dns-query': [
      'dnsQuery',
      response => buildDnsQueryItems(featureId, response),
      {
        hostname: extractHostname(queryText),
        text: queryText,
        deep: /deep|深度/i.test(queryText),
      },
    ],
    'file-hash': [
      'fileHash',
      response => buildFileHashItems(featureId, response),
      {
        path: resolveFileToolPath(query, queryText, [
          'file hash',
          'hash file',
          'hash',
          '文件 hash',
          '文件校验',
        ]),
        text: queryText,
      },
    ],
    'file-base64': [
      'fileBase64',
      response => buildFileBase64Items(featureId, response),
      {
        path: resolveFileToolPath(query, queryText, [
          'file base64',
          'base64 file',
          '文件 base64',
        ]),
        text: queryText,
      },
    ],
    'recent-download': ['recentDownload', response => buildRecentDownloadItems(featureId, response)],
    'common-directory': [
      'commonDirectory',
      response => buildCommonDirectoryItems(featureId, response),
      { query: extractCommonDirectoryQuery(queryText), text: queryText },
    ],
    'path-format': [
      'pathFormat',
      response => buildPathFormatItems(featureId, response),
      {
        path: resolveFileToolPath(query, queryText, [
          'path format',
          'copy path',
          '路径格式',
          '复制路径',
        ]),
        text: queryText,
      },
    ],
    'format-text': [
      'formatText',
      response => buildFormatTextItems(featureId, response),
      extractFormatTextRequest(queryText),
    ],
    'battery-status': ['batteryStatus', response => buildBatteryStatusItems(featureId, response)],
    'system-proxy': ['systemProxy', response => buildSystemProxyItems(featureId, response)],
  }

  const [methodName, builder, request] = toolMap[mode] || []
  if (!methodName || typeof api?.[methodName] !== 'function')
    return buildUnsupportedToolItems(featureId, mode, methodName || mode)

  return builder(await api[methodName](request))
}

// A stopwatch counts up; the other kinds with a duration count down to it.
function describeSessionTime(session) {
  const duration = normalizeText(session.displayDurationText)
  if (!duration)
    return ''
  if (session.kind === 'stopwatch')
    return t(`已计时 ${duration}`, `${duration} elapsed`)
  return Number(session.durationMs) > 0 ? t(`剩余 ${duration}`, `${duration} left`) : ''
}

function buildSessionItems(featureId, response) {
  const sessions = Array.isArray(response?.sessions) ? response.sessions : []
  const count = Number(response?.count) || sessions.length
  const items = [
    buildInfoItem({
      featureId,
      id: 'sessions-summary',
      title: response?.state === 'running'
        ? t('QuickOps 正在运行', 'QuickOps Is Running')
        : t('QuickOps 空闲', 'QuickOps Is Idle'),
      subtitle: count
        ? t(`${count} 个会话进行中`, `${count} active ${count === 1 ? 'session' : 'sessions'}`)
        : t('没有进行中的会话', 'No active sessions'),
      meta: { mode: 'sessions', count: sessions.length },
    }),
  ]

  for (const session of sessions.slice(0, 8)) {
    items.push(buildInfoItem({
      featureId,
      id: `session-${session.id}`,
      title: session.title || session.kind,
      subtitle: [describeWord(SESSION_STATE_TEXT, session.state), describeSessionTime(session)].filter(Boolean).join(' · '),
      meta: {
        mode: 'sessions',
        sessionId: session.id,
        kind: session.kind,
        state: session.state,
      },
    }))
  }

  return items
}

function buildAuditItems(featureId, response) {
  const entries = Array.isArray(response?.entries) ? response.entries : []
  const items = [
    buildInfoItem({
      featureId,
      id: 'audit-summary',
      title: entries.length
        ? t('QuickOps 最近的 Flow 审计', 'Recent QuickOps Flow Audit')
        : t('QuickOps 暂无审计记录', 'No QuickOps Audit Records'),
      subtitle: entries.length
        ? t(`最近 ${entries.length} 条记录`, `Latest ${englishCount(entries.length, 'record')}`)
        : t('还没有经过 QuickOps 的 Flow 动作', 'No Flow actions have gone through QuickOps yet'),
      meta: { mode: 'audit', count: entries.length },
    }),
  ]

  for (const entry of entries.slice(0, 8)) {
    const payloadKeys = Array.isArray(entry.payloadKeys) ? entry.payloadKeys.join(',') : ''
    items.push(buildInfoItem({
      featureId,
      id: `audit-${entry.id}`,
      title: `${entry.targetId} · ${describeWord(AUDIT_DECISION_TEXT, entry.decision)}`,
      subtitle: [
        entry.requiresConfirmation ? t('需要确认', 'Needs confirmation') : t('无需确认', 'No confirmation needed'),
        entry.reason ? describeReason(entry.reason) : '',
        payloadKeys ? t(`字段：${payloadKeys}`, `Fields: ${payloadKeys}`) : '',
      ].filter(Boolean).join(' · '),
      meta: {
        mode: 'audit',
        auditId: entry.id,
        targetId: entry.targetId,
        decision: entry.decision,
      },
    }))
  }

  return items
}

async function buildResultItems(featureId, query, api = quickOps) {
  const highRiskAction = resolveHighRiskFlowAction(query)
  if (highRiskAction)
    return buildHighRiskBlockedItems(featureId, highRiskAction, query)

  const safeAction = resolveSafeFlowAction(query)
  if (safeAction)
    return [buildFlowActionItem(featureId, safeAction, query)]

  const confirmationAction = resolveConfirmationFlowAction(query)
  if (confirmationAction)
    return buildConfirmationRequiredItems(featureId, confirmationAction, query)

  if (isDeveloperPreviewQuery(query))
    return buildDeveloperPreviewItems(featureId, query, api)

  if (!api) {
    return [
      buildInfoItem({
        featureId,
        id: 'unavailable',
        title: t('QuickOps 不可用', 'QuickOps Unavailable'),
        subtitle: t('当前版本的 Tuff 没有向插件提供 QuickOps，更新后再试', 'This version of Tuff doesn\'t provide QuickOps to plugins; update Tuff and try again'),
        meta: { mode: 'unavailable' },
      }),
    ]
  }

  const mode = resolveMode(query)
  if (mode === 'sessions')
    return buildSessionItems(featureId, await api.sessions())
  if (mode === 'audit')
    return buildAuditItems(featureId, await api.auditRecent({ limit: 8 }))
  if (mode === 'settings')
    return buildSettingsItems(featureId, await api.capabilities(), await api.tuffDiagnostics())
  if (mode !== 'capabilities')
    return buildReadOnlyToolItems(featureId, mode, api, query)
  return buildCapabilityItems(featureId, await api.capabilities())
}

function projectItemsForHost(items) {
  return items.map((item) => {
    const basic = item.render?.basic || {
      title: item.title,
      ...(item.subtitle ? { subtitle: item.subtitle } : {}),
      ...(item.icon ? { icon: item.icon } : {}),
    }
    const actions = Array.isArray(item.actions)
      ? item.actions.map(action => ({
          id: action.id,
          type: 'plugin',
          label: action.label || action.title || action.id,
          ...(action.payload === undefined ? {} : { payload: action.payload }),
          ...(action.icon ? { icon: action.icon } : {}),
          ...(typeof action.primary === 'boolean' ? { primary: action.primary } : {}),
        }))
      : []
    const meta = {
      pluginName: PLUGIN_NAME,
      featureId: item.meta?.featureId || 'quickops',
      ...(typeof item.meta?.defaultAction === 'string'
        ? { defaultAction: item.meta.defaultAction }
        : {}),
      ...(Number.isFinite(item.meta?.priority) ? { priority: item.meta.priority } : {}),
    }
    return {
      id: item.id,
      source: item.source,
      ...(item.kind ? { kind: item.kind } : {}),
      ...(actions.length ? { actions } : {}),
      meta,
      render: { mode: 'default', basic },
      ...(item.scoring ? { scoring: item.scoring } : {}),
    }
  })
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query) {
    try {
      const items = projectItemsForHost(await buildResultItems(featureId, query))
      await plugin.feature.clearItems()
      await plugin.feature.pushItems(items)
      return true
    }
    catch {
      logger?.error?.('[touch-quickops] Failed to render QuickOps summary')
      try {
        await plugin.feature.clearItems()
        await plugin.feature.pushItems(projectItemsForHost([
          buildInfoItem({
            featureId,
            id: 'error',
            title: t('QuickOps 加载失败', 'QuickOps Failed to Load'),
            subtitle: t('Tuff 暂时无法提供这项功能，请稍后再试', 'Tuff can\'t provide this right now; try again later'),
            meta: { mode: 'error' },
          }),
        ]))
        return true
      }
      catch {
        logger?.error?.('[touch-quickops] Failed to publish fallback')
        return false
      }
    }
  },

  async onItemAction(item, context = {}) {
    const selectedActionId = context.actionId || item?.meta?.defaultAction
    const selectedAction = item?.actions?.find(action => action?.id === selectedActionId)
    if (
      selectedActionId === DEVELOPER_PREVIEW_SAVE_SVG_ACTION_ID
      || selectedActionId === DEVELOPER_PREVIEW_SAVE_PNG_ACTION_ID
    ) {
      if (typeof quickOps?.saveDeveloperPreview !== 'function') {
        return {
          externalAction: true,
          success: false,
          status: 'blocked',
          reason: 'developer-preview-save-unavailable',
        }
      }

      const format = selectedActionId === DEVELOPER_PREVIEW_SAVE_PNG_ACTION_ID ? 'png' : 'svg'
      const result = await quickOps.saveDeveloperPreview({
        format,
        payload: selectedAction?.payload?.developerPreviewPayload,
      })
      return {
        externalAction: true,
        success: result?.state === 'saved',
        status: result?.state || 'unknown',
        reason: result?.reason,
        message: result?.path || result?.message,
      }
    }

    if (item?.meta?.defaultAction !== FLOW_ACTION_ID)
      return

    const payload = selectedAction?.payload || item.meta?.payload
    if (!payload?.targetId || !payload?.payload || !payload?.options) {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'invalid-flow-action',
      }
    }

    if (typeof flow?.dispatch !== 'function') {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'flow-sdk-unavailable',
      }
    }

    try {
      const result = await flow.dispatch(payload.payload, payload.options)
      return {
        externalAction: true,
        success: result?.state !== 'FAILED',
        status: result?.state || 'UNKNOWN',
        targetId: payload.targetId,
        sessionId: result?.sessionId,
        message: formatFlowAck(result?.ackPayload),
      }
    }
    catch (error) {
      logger?.error?.('[touch-quickops] Failed to dispatch QuickOps Flow action')
      const permissionDenied = error?.code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
      const unavailable = error?.code === 'PLUGIN_HOST_CAPABILITY_UNAVAILABLE'
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        targetId: payload.targetId,
        reason: permissionDenied
          ? 'permission-denied'
          : unavailable
            ? 'host-unavailable'
            : 'flow-dispatch-failed',
        message: permissionDenied || unavailable
          ? undefined
          : 'Flow action failed',
      }
    }
  },
}

module.exports = pluginLifecycle
