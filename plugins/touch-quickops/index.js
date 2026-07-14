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
    title: '停止所有 QuickOps 会话',
    subtitle: '通过 CoreApp QuickOps runtime 停止当前所有本地会话',
    patterns: [
      /\bstop\s+all\s+(?:quick\s*ops?\s+)?sessions?\b/i,
      /停止.*(?:所有|全部).*(?:quickops|快捷工具|会话)/i,
    ],
  },
  {
    id: 'stop-system-awake',
    targetId: 'quickops.stop-system-awake',
    title: '停止系统唤醒',
    subtitle: '停止当前 system-awake 会话',
    patterns: [/\bstop\s+system\s+awake\b/i, /停止.*(?:系统唤醒|系统防休眠)/],
  },
  {
    id: 'stop-keep-awake',
    targetId: 'quickops.stop-keep-awake',
    title: '停止保持唤醒',
    subtitle: '停止当前 keep-awake 会话',
    patterns: [/\bstop\s+keep\s+awake\b/i, /停止.*(?:保持唤醒|屏幕常亮|防休眠)/],
  },
  {
    id: 'stop-clean-screen',
    targetId: 'quickops.stop-clean-screen',
    title: '退出清屏模式',
    subtitle: '关闭当前 clean-screen overlay',
    patterns: [
      /\bstop\s+(?:clean\s+screen|screen\s+clean)\b/i,
      /(?:停止|退出|关闭).*(?:清屏|屏幕清洁)/,
    ],
  },
  {
    id: 'pause-timer',
    targetId: 'quickops.pause-timer',
    title: '暂停计时器',
    subtitle: '暂停当前 QuickOps timer 会话',
    patterns: [/\bpause\s+timer\b/i, /\btimer\s+pause\b/i, /暂停.*计时器/],
  },
  {
    id: 'resume-timer',
    targetId: 'quickops.resume-timer',
    title: '继续计时器',
    subtitle: '恢复当前暂停的 QuickOps timer 会话',
    patterns: [/\b(?:resume|continue)\s+timer\b/i, /\btimer\s+resume\b/i, /(?:继续|恢复).*计时器/],
  },
  {
    id: 'stop-timer',
    targetId: 'quickops.stop-timer',
    title: '停止计时器',
    subtitle: '停止当前 QuickOps timer 会话',
    patterns: [/\bstop\s+timer\b/i, /\btimer\s+stop\b/i, /停止.*计时器/],
  },
  {
    id: 'pause-pomodoro',
    targetId: 'quickops.pause-pomodoro',
    title: '暂停番茄钟',
    subtitle: '暂停当前 QuickOps Pomodoro 会话',
    patterns: [/\bpause\s+pomodoro\b/i, /\bpomodoro\s+pause\b/i, /暂停.*番茄钟/],
  },
  {
    id: 'resume-pomodoro',
    targetId: 'quickops.resume-pomodoro',
    title: '继续番茄钟',
    subtitle: '恢复当前暂停的 QuickOps Pomodoro 会话',
    patterns: [/\b(?:resume|continue)\s+pomodoro\b/i, /\bpomodoro\s+resume\b/i, /(?:继续|恢复).*番茄钟/],
  },
  {
    id: 'stop-pomodoro',
    targetId: 'quickops.stop-pomodoro',
    title: '停止番茄钟',
    subtitle: '停止当前 QuickOps Pomodoro 会话',
    patterns: [/\bstop\s+pomodoro\b/i, /\bpomodoro\s+stop\b/i, /停止.*番茄钟/],
  },
  {
    id: 'pause-stopwatch',
    targetId: 'quickops.pause-stopwatch',
    title: '暂停秒表',
    subtitle: '暂停当前 QuickOps stopwatch 会话',
    patterns: [/\bpause\s+stopwatch\b/i, /\bstopwatch\s+pause\b/i, /暂停.*秒表/],
  },
  {
    id: 'resume-stopwatch',
    targetId: 'quickops.resume-stopwatch',
    title: '继续秒表',
    subtitle: '恢复当前暂停的 QuickOps stopwatch 会话',
    patterns: [
      /\b(?:resume|continue)\s+stopwatch\b/i,
      /\bstopwatch\s+resume\b/i,
      /(?:继续|恢复).*秒表/,
    ],
  },
  {
    id: 'lap-stopwatch',
    targetId: 'quickops.lap-stopwatch',
    title: '记录秒表分段',
    subtitle: '为当前 QuickOps stopwatch 记录 lap',
    patterns: [/\blap\s+stopwatch\b/i, /\bstopwatch\s+lap\b/i, /(?:记录|新增).*分段/],
  },
  {
    id: 'reset-stopwatch',
    targetId: 'quickops.reset-stopwatch',
    title: '重置秒表',
    subtitle: '停止并清除当前 QuickOps stopwatch 会话',
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
    title: '保持唤醒需要确认',
    patterns: [/\bkeep\s+awake\b/i, /(?:保持唤醒|屏幕常亮|防休眠)/],
  },
  {
    id: 'system-awake',
    targetId: 'quickops.system-awake',
    title: '系统唤醒需要确认',
    patterns: [/\bsystem\s+awake\b/i, /(?:系统唤醒|系统防休眠)/],
  },
  {
    id: 'start-timer',
    targetId: 'quickops.start-timer',
    title: '启动计时器需要确认',
    patterns: [/\bstart\s+timer\b/i, /\btimer\s+start\b/i, /(?:开始|启动).*计时器/],
  },
  {
    id: 'start-pomodoro',
    targetId: 'quickops.start-pomodoro',
    title: '启动番茄钟需要确认',
    patterns: [/\bstart\s+pomodoro\b/i, /\bpomodoro\s+start\b/i, /(?:开始|启动).*番茄钟/],
  },
  {
    id: 'clean-screen',
    targetId: 'quickops.clean-screen',
    title: '清屏模式需要确认',
    patterns: [/\b(?:start\s+)?clean\s+screen\b/i, /(?:开始|启动|进入).*清屏/],
  },
  {
    id: 'start-stopwatch',
    targetId: 'quickops.start-stopwatch',
    title: '启动秒表需要确认',
    patterns: [/\bstart\s+stopwatch\b/i, /\bstopwatch\s+start\b/i, /(?:开始|启动).*秒表/],
  },
  {
    id: 'copy-to-clipboard',
    targetId: 'quickops.copy-to-clipboard',
    title: '写入剪贴板需要确认',
    patterns: [/\bcopy\s+to\s+clipboard\b/i, /写入.*剪贴板/],
  },
  {
    id: 'show-notification',
    targetId: 'quickops.show-notification',
    title: '发送通知需要确认',
    patterns: [/\bshow\s+notification\b/i, /发送.*通知/],
  },
  {
    id: 'open-folder',
    targetId: 'quickops.open-folder',
    title: '打开文件夹需要确认',
    patterns: [/\bopen\s+folder\b/i, /打开.*(?:文件夹|目录)/],
  },
  {
    id: 'temp-text-file',
    targetId: 'quickops.temp-text-file',
    title: '创建临时文本需要确认',
    patterns: [/\btemp\s+text\s+file\b/i, /创建.*临时.*文本/],
  },
  {
    id: 'temp-directory',
    targetId: 'quickops.temp-directory',
    title: '创建临时目录需要确认',
    patterns: [/\btemp\s+directory\b/i, /创建.*临时.*(?:目录|文件夹)/],
  },
]

const HIGH_RISK_FLOW_ACTIONS = [
  {
    id: 'kill-port',
    targetId: 'quickops.port-kill',
    title: '高风险端口释放已阻断',
    subtitle: '端口 kill 仍保持 copy-only / policy-gated；插件不会直接执行高风险动作',
    reason: 'high-risk-blocked',
    patterns: [
      /\b(?:kill|terminate|release)\s+port\s+\d+\b/i,
      /\bport\s+\d+\s+(?:kill|terminate|release)\b/i,
      /(?:杀掉|终止|释放).*端口\s*\d+/,
    ],
  },
]

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
    return `${days}d ${hours}h`
  if (hours > 0)
    return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatDurationMs(ms) {
  return formatDuration((Number(ms) || 0) / 1000)
}

function formatCountMap(counts) {
  return Object.entries(counts)
    .map(([key, count]) => `${key}:${count}`)
    .join(' · ')
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
      title: response?.state === 'blocked' ? 'QuickOps 开发者工具已禁用' : 'QuickOps 开发者预览不可用',
      subtitle: response?.reason || 'no-preview-result',
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

  const actions = [
    {
      id: 'preview-copy-primary',
      type: 'copy',
      label: '复制结果',
      icon: { type: 'class', value: 'i-ri-file-copy-line' },
      payload: { text: payload.primaryValue },
    },
  ]

  if (isQrDeveloperPreviewPayload(payload)) {
    builder.setMeta({
      defaultAction: DEVELOPER_PREVIEW_SAVE_SVG_ACTION_ID,
      actionId: DEVELOPER_PREVIEW_SAVE_SVG_ACTION_ID,
      developerPreviewPayload: payload,
    })
    actions.push({
      id: DEVELOPER_PREVIEW_SAVE_SVG_ACTION_ID,
      type: 'execute',
      label: '保存 SVG 到临时目录',
      icon: { type: 'class', value: 'i-ri-save-line' },
    })
    actions.push({
      id: DEVELOPER_PREVIEW_SAVE_PNG_ACTION_ID,
      type: 'execute',
      label: '保存 PNG 到临时目录',
      icon: { type: 'class', value: 'i-ri-image-line' },
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
        title: 'QuickOps 开发者预览暂不可用',
        subtitle: 'host facade 未暴露 developerPreview；插件不会 fallback 到私有 PreviewProvider',
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
    .setTitle(action.title)
    .setSubtitle(action.subtitle)
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
    .createAndAddAction(FLOW_ACTION_ID, 'plugin', '执行', payload)
    .build()
}

function buildConfirmationRequiredItems(featureId, action, query) {
  const visualContract = buildFlowVisualContract(action)
  const flowAdapterTrace = buildFlowAdapterTrace(
    query,
    action,
    'confirmation-token-required',
    'blocked-until-confirmed'
  )

  return [
    buildInfoItem({
      featureId,
      id: `confirmation-required-${action.id}`,
      title: action.title,
      subtitle: `${action.targetId} 需要 App UI 发放 confirmationToken；插件不会自行生成或绕过确认`,
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
      title: action.title,
      subtitle: action.subtitle,
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
  const enabledText = response?.enabled === false ? 'disabled' : 'enabled'
  const platform = response?.platform || 'unknown'
  const items = [
    buildInfoItem({
      featureId,
      id: 'capability-summary',
      title: 'QuickOps 能力摘要',
      subtitle: `${platform} · ${enabledText} · ${formatCountMap(statusCounts) || 'no entries'}`,
      meta: { mode: 'capabilities', count: entries.length },
    }),
    buildInfoItem({
      featureId,
      id: 'risk-summary',
      title: 'QuickOps 风险分布',
      subtitle: formatCountMap(riskCounts) || '暂无能力条目',
      meta: { mode: 'capabilities', count: entries.length },
    }),
  ]

  for (const entry of entries.slice(0, 8)) {
    items.push(buildInfoItem({
      featureId,
      id: `capability-${entry.id}`,
      title: entry.label || entry.id,
      subtitle: `${entry.status} · ${entry.riskLevel}${entry.reason ? ` · ${entry.reason}` : ''}`,
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
  const platform = capabilityResponse?.platform || diagnostics?.platform || 'unknown'
  const enabledText = capabilityResponse?.enabled === false ? 'disabled' : 'enabled'
  const items = [
    buildInfoItem({
      featureId,
      id: 'settings-summary',
      title: 'QuickOps 设置入口',
      subtitle: `${platform} · ${enabledText} · official plugin surface`,
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
      title: 'QuickOps 本地策略摘要',
      subtitle: disabledEntries.length
        ? `${disabledEntries.length} disabled · ${formatCountMap(disabledReasons)}`
        : '当前 capability 摘要未报告禁用策略',
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
      title: 'QuickOps 默认参数摘要',
      subtitle: [
        `keepAwake ${formatDurationMs(diagnostics.defaultKeepAwakeDurationMs)}`,
        `timer ${formatDurationMs(diagnostics.defaultTimerDurationMs)}`,
        `pomodoro ${formatDurationMs(diagnostics.defaultPomodoroFocusMs)}/${formatDurationMs(diagnostics.defaultPomodoroBreakMs)}`,
        `pomodoroLoop ${pomodoroAdvancedLoopState}`,
        `screenClean ${formatDurationMs(diagnostics.defaultScreenCleanDurationMs)}`,
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
    title: 'QuickOps 设置写入仍受 host policy 控制',
    subtitle: '插件当前只展示策略/默认值摘要；可写设置需要官方插件白名单 host capability，不能走私有 IPC',
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
      title: 'QuickOps 插件入口暂不可用',
      subtitle: `迁移期 host facade 未暴露 ${methodName}；该能力不会 fallback 到私有 IPC`,
      meta: { mode, methodName, state: 'unsupported' },
    }),
  ]
}

function buildDegradedItems(featureId, mode, title, response) {
  return [
    buildInfoItem({
      featureId,
      id: `${mode}-degraded`,
      title,
      subtitle: truncateText(response?.message || response?.degradedReason || '当前平台返回 degraded'),
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
    return buildDegradedItems(featureId, 'system-info', 'QuickOps 系统信息不可用', response)

  return [
    buildInfoItem({
      featureId,
      id: 'system-info-summary',
      title: 'QuickOps 系统信息',
      subtitle: `${info.osType} ${info.osRelease} · ${info.platform}/${info.arch} · ${formatBytes(info.totalMemoryBytes)} RAM`,
      meta: { mode: 'system-info', platform: info.platform, arch: info.arch },
    }),
    buildInfoItem({
      featureId,
      id: 'system-info-runtime',
      title: 'CPU / Memory / Uptime',
      subtitle: `${info.cpuModel || 'Unknown CPU'} · ${info.cpuCount} cores · ${formatBytes(info.freeMemoryBytes)} free · uptime ${formatDuration(info.uptimeSeconds)}`,
      meta: { mode: 'system-info', cpuCount: info.cpuCount },
    }),
  ]
}

function buildDiagnosticsItems(featureId, response) {
  const diagnostics = response?.diagnostics
  if (!diagnostics)
    return buildDegradedItems(featureId, 'diagnostics', 'QuickOps 诊断摘要不可用', response)

  return [
    buildInfoItem({
      featureId,
      id: 'diagnostics-summary',
      title: 'QuickOps 脱敏诊断摘要',
      subtitle: `${diagnostics.appVersion} · ${diagnostics.platform}/${diagnostics.arch} · QuickOps ${diagnostics.quickOpsEnabled ? 'enabled' : 'disabled'}`,
      meta: { mode: 'diagnostics', schemaVersion: diagnostics.schemaVersion },
    }),
    buildInfoItem({
      featureId,
      id: 'diagnostics-runtime',
      title: 'Runtime / Network',
      subtitle: `Node ${diagnostics.nodeVersion} · Electron ${diagnostics.electronVersion} · local:${diagnostics.localAddressCount} · dns:${diagnostics.dnsServerCount} · proxy:${diagnostics.proxyStatus}`,
      meta: { mode: 'diagnostics', proxyStatus: diagnostics.proxyStatus },
    }),
  ]
}

function buildDiskSpaceItems(featureId, response) {
  if (response?.state !== 'ready') {
    return buildDegradedItems(featureId, 'disk-space', 'QuickOps 磁盘空间不可用', response)
  }

  const entries = Array.isArray(response?.diskSpace?.entries) ? response.diskSpace.entries : []
  const items = [
    buildInfoItem({
      featureId,
      id: 'disk-space-summary',
      title: 'QuickOps 磁盘空间',
      subtitle: entries.length ? `${entries.length} 个安全根 · ${truncateText(response.text)}` : '没有可展示的磁盘条目',
      meta: { mode: 'disk-space', count: entries.length },
    }),
  ]

  for (const entry of entries.slice(0, 6)) {
    items.push(buildInfoItem({
      featureId,
      id: `disk-${entry.label}`,
      title: `${entry.label} · ${entry.usedPercent}% used`,
      subtitle: `${formatBytes(entry.freeBytes)} free / ${formatBytes(entry.totalBytes)} total · ${entry.path}`,
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
    return buildDegradedItems(featureId, mode, 'QuickOps 目录占用不可用', response)
  }

  const entries = Array.isArray(response?.directoryUsage?.entries)
    ? response.directoryUsage.entries
    : []
  const items = [
    buildInfoItem({
      featureId,
      id: `${mode}-summary`,
      title: deep ? 'QuickOps 深度目录占用' : 'QuickOps 目录占用',
      subtitle: `${entries.length} 个关键目录 · depth:${response?.directoryUsage?.scanDepth ?? 0}`,
      meta: { mode, count: entries.length },
    }),
  ]

  for (const entry of entries.slice(0, 6)) {
    const size = deep ? entry.totalFileBytes : entry.directFileBytes
    items.push(buildInfoItem({
      featureId,
      id: `${mode}-${entry.label}`,
      title: `${entry.label} · ${formatBytes(size)}`,
      subtitle: `files:${entry.fileCount} · dirs:${entry.directoryCount} · scanned:${entry.scannedEntryCount}${entry.truncated ? ' · truncated' : ''}`,
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
    return buildDegradedItems(featureId, 'network-status', 'QuickOps 网络状态不可用', response)

  const addresses = Array.isArray(info.addresses) ? info.addresses : []
  const dnsServers = Array.isArray(info.dnsServers) ? info.dnsServers : []
  const proxies = Array.isArray(info.proxies) ? info.proxies : []
  const items = [
    buildInfoItem({
      featureId,
      id: 'network-status-summary',
      title: 'QuickOps 网络状态',
      subtitle: `local:${addresses.length} · dns:${dnsServers.length} · proxy:${info.proxyStatus}`,
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
      title: 'DNS Servers',
      subtitle: dnsServers.slice(0, 5).join(' · '),
      meta: { mode: 'network-status', dnsServerCount: dnsServers.length },
    }))
  }

  if (proxies.length > 0) {
    items.push(buildInfoItem({
      featureId,
      id: 'network-proxy',
      title: 'Proxy Environment',
      subtitle: proxies.slice(0, 4).map(proxy => `${proxy.source}:${proxy.value}`).join(' · '),
      meta: { mode: 'network-status', proxyCount: proxies.length },
    }))
  }

  return items
}

function buildLocalIpItems(featureId, response) {
  const addresses = Array.isArray(response?.addresses) ? response.addresses : []
  if (addresses.length === 0) {
    return buildDegradedItems(featureId, 'local-ip', 'QuickOps 本机 IP 不可用', {
      degradedReason: response?.degradedReason || 'local-ip-unavailable',
      message: response?.text,
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
    return buildDegradedItems(featureId, 'battery-status', 'QuickOps 电池状态不可用', response)
  }

  const info = response?.batteryStatus
  return [
    buildInfoItem({
      featureId,
      id: 'battery-status-summary',
      title: 'QuickOps 电池状态',
      subtitle: `${info?.levelPercent ?? 'unknown'}% · ${info?.status || 'unknown'} · charging:${info?.charging ?? 'unknown'}`,
      meta: {
        mode: 'battery-status',
        levelPercent: info?.levelPercent,
        charging: info?.charging,
        source: info?.source,
      },
    }),
  ]
}

function buildSystemProxyItems(featureId, response) {
  const info = response?.systemProxy
  if (!info || response?.state === 'degraded') {
    return buildDegradedItems(featureId, 'system-proxy', 'QuickOps 系统代理不可用', response)
  }

  const environment = Array.isArray(info.environment) ? info.environment : []
  const system = Array.isArray(info.system) ? info.system : []
  const items = [
    buildInfoItem({
      featureId,
      id: 'system-proxy-summary',
      title: 'QuickOps 系统代理',
      subtitle: `${info.platform} · ${info.status} · env:${environment.length} · system:${system.length}`,
      meta: { mode: 'system-proxy', status: info.status },
    }),
  ]

  for (const proxy of [...environment, ...system].slice(0, 6)) {
    items.push(buildInfoItem({
      featureId,
      id: `system-proxy-${proxy.source}-${proxy.name || proxy.value}`,
      title: proxy.name ? `${proxy.source} · ${proxy.name}` : proxy.source,
      subtitle: proxy.value,
      meta: { mode: 'system-proxy', source: proxy.source },
    }))
  }

  return items
}

function buildPortStatusItems(featureId, response) {
  if (!response || response.state === 'degraded') {
    return buildDegradedItems(featureId, 'port-status', 'QuickOps 端口状态不可用', response)
  }

  const title = response.available
    ? `端口 ${response.port} 可用`
    : `端口 ${response.port} 被占用`
  const subtitle = response.process
    ? `${response.host || '127.0.0.1'} · pid:${response.process.pid} · ${response.process.name || response.process.command || response.process.source}`
    : `${response.host || '127.0.0.1'} · ${response.available ? 'available' : 'occupied'}`
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
      title: '端口释放命令预览',
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
    return buildDegradedItems(featureId, 'dns-query', 'QuickOps DNS 查询不可用', response)
  }

  const info = response.dnsQuery
  const items = [
    buildInfoItem({
      featureId,
      id: `dns-query-${info.hostname}`,
      title: `DNS 查询 ${info.hostname}`,
      subtitle: `${info.records.length} records${info.failedTypes.length ? ` · failed:${info.failedTypes.join('/')}` : ''}`,
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
    return buildDegradedItems(featureId, 'file-hash', 'QuickOps 文件 Hash 不可用', response)
  }

  return [
    buildInfoItem({
      featureId,
      id: `file-hash-${response.path}`,
      title: `文件 Hash · ${response.fileName}`,
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
    return buildDegradedItems(featureId, 'file-base64', 'QuickOps 文件 Base64 不可用', response)
  }

  return [
    buildInfoItem({
      featureId,
      id: `file-base64-${response.path}`,
      title: `文件 Base64 · ${response.fileName}`,
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
    return buildDegradedItems(featureId, 'recent-download', 'QuickOps 最近下载不可用', response)
  }

  return [
    buildInfoItem({
      featureId,
      id: `recent-download-${response.path}`,
      title: `最近下载 · ${response.fileName}`,
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
    return buildDegradedItems(featureId, 'common-directory', 'QuickOps 常用目录不可用', response)
  }

  return [
    buildInfoItem({
      featureId,
      id: `common-directory-${info.id}`,
      title: `${info.title} · ${info.subtitle}`,
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
    return buildDegradedItems(featureId, 'path-format', 'QuickOps 路径格式不可用', response)
  }

  const formats = response.formats || {}
  const items = [
    buildInfoItem({
      featureId,
      id: `path-format-${response.path}`,
      title: `路径格式 · ${response.fileName}`,
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
      title: key,
      subtitle: formats[key],
      meta: { mode: 'path-format', path: response.path, format: key },
    }))
  }

  return items
}

function buildFormatTextItems(featureId, response) {
  if (!response || response.state !== 'formatted') {
    return buildDegradedItems(featureId, 'format-text', 'QuickOps 文本格式化不可用', response)
  }

  return [
    buildInfoItem({
      featureId,
      id: `format-text-${response.mode}`,
      title: `文本格式化 · ${response.mode}`,
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

function buildSessionItems(featureId, response) {
  const sessions = Array.isArray(response?.sessions) ? response.sessions : []
  const items = [
    buildInfoItem({
      featureId,
      id: 'sessions-summary',
      title: response?.state === 'running' ? 'QuickOps 正在运行' : 'QuickOps 空闲',
      subtitle: response?.text || `运行会话 ${response?.count || 0} 个`,
      meta: { mode: 'sessions', count: sessions.length },
    }),
  ]

  for (const session of sessions.slice(0, 8)) {
    items.push(buildInfoItem({
      featureId,
      id: `session-${session.id}`,
      title: session.title || session.kind,
      subtitle: `${session.kind} · ${session.state} · ${session.displayDurationText || ''}`,
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
      title: entries.length ? 'QuickOps 最近 Flow 审计' : 'QuickOps 暂无审计记录',
      subtitle: `count:${response?.count || 0} · limit:${response?.limit || 0}`,
      meta: { mode: 'audit', count: entries.length },
    }),
  ]

  for (const entry of entries.slice(0, 8)) {
    const payloadKeys = Array.isArray(entry.payloadKeys) ? entry.payloadKeys.join(',') : ''
    items.push(buildInfoItem({
      featureId,
      id: `audit-${entry.id}`,
      title: `${entry.targetId} · ${entry.decision}`,
      subtitle: `${entry.requiresConfirmation ? 'confirm' : 'read-only'}${entry.reason ? ` · ${entry.reason}` : ''}${payloadKeys ? ` · keys:${payloadKeys}` : ''}`,
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
        title: 'QuickOps SDK 不可用',
        subtitle: '当前为迁移期只读壳；目标是把 QuickOps 业务 runtime 抽到官方插件，CoreApp 只留必要 host capability 与安全门禁',
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

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query) {
    try {
      const items = await buildResultItems(featureId, query)
      plugin.feature.clearItems()
      plugin.feature.pushItems(items)
      return true
    }
    catch (error) {
      logger?.error?.('[touch-quickops] Failed to render QuickOps summary', error)
      plugin.feature.clearItems()
      plugin.feature.pushItems([
        buildInfoItem({
          featureId,
          id: 'error',
          title: 'QuickOps 加载失败',
          subtitle: truncateText(error?.message || '未知错误'),
          meta: { mode: 'error' },
        }),
      ])
      return true
    }
  },

  async onItemAction(item, context = {}) {
    const selectedActionId = context.actionId || item?.meta?.defaultAction
    if (
      selectedActionId === DEVELOPER_PREVIEW_SAVE_SVG_ACTION_ID ||
      selectedActionId === DEVELOPER_PREVIEW_SAVE_PNG_ACTION_ID
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
        payload: item.meta.developerPreviewPayload,
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

    const payload = item.meta?.payload
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
      logger?.error?.('[touch-quickops] Failed to dispatch QuickOps Flow action', error)
      return {
        externalAction: true,
        success: false,
        status: 'failed',
        targetId: payload.targetId,
        reason: truncateText(error?.message || 'flow-dispatch-failed'),
      }
    }
  },
}

module.exports = {
  ...pluginLifecycle,
  __test: {
    buildAuditItems,
    buildCapabilityItems,
    buildResultItems,
    buildReadOnlyToolItems,
    buildSessionItems,
    buildSystemInfoItems,
    buildNetworkStatusItems,
    buildSettingsItems,
    extractFilesFromQuery,
    buildFlowActionItem,
    isCleanupFlowAction,
    buildConfirmationRequiredItems,
    buildHighRiskBlockedItems,
    buildFlowAdapterTrace,
    resolveSafeFlowAction,
    resolveConfirmationFlowAction,
    resolveHighRiskFlowAction,
    resolvePomodoroAdvancedLoopState,
    resolveMode,
  },
}
