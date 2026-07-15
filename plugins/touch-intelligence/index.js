const {
  plugin,
  clipboard,
  logger,
  TuffItemBuilder,
  permission,
  touchChannel,
  intelligence,
  features,
} = globalThis
const crypto = require('node:crypto')

const AUTH_SESSION_GET_STATE_EVENT = resolveAuthSessionGetStateEvent()

let makeWidgetIdLoader = null

function getMakeWidgetId() {
  if (!makeWidgetIdLoader) {
    try {
      ;({
        makeWidgetId: makeWidgetIdLoader,
      } = require('@talex-touch/utils/plugin/widget'))
    } catch {
      makeWidgetIdLoader = (pluginName, featureId) =>
        `${pluginName}::${featureId}`
    }
  }
  return makeWidgetIdLoader
}

let contextExecutionRequestFactoryLoader = null

function getContextExecutionRequestFactory() {
  if (!contextExecutionRequestFactoryLoader) {
    try {
      ;({
        createIntelligenceContextExecutionRequest:
          contextExecutionRequestFactoryLoader,
      } = require('@talex-touch/utils/intelligence'))
    } catch {
      contextExecutionRequestFactoryLoader = ({
        capabilityId,
        input,
        payload,
        options,
        policy,
      }) => ({
        capabilityId,
        input,
        payload,
        options: {
          ...(options || {}),
          metadata: {
            ...(options?.metadata || {}),
            contextEntrypoint: {
              id: policy.entrypointId,
              owner: policy.owner,
              mode: policy.mode,
            },
          },
        },
        context: {
          mode: policy.mode,
          owner: policy.owner,
          ...(policy.sessionId ? { sessionId: policy.sessionId } : {}),
          ...(policy.scope ? { scope: policy.scope } : {}),
          ...(policy.objective ? { objective: policy.objective } : {}),
          ...(policy.tokenBudget ? { tokenBudget: policy.tokenBudget } : {}),
          ...(policy.traceId ? { traceId: policy.traceId } : {}),
        },
      })
    }
  }
  return contextExecutionRequestFactoryLoader
}

const PLUGIN_NAME = 'touch-intelligence'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const ACTION_ID = 'intelligence-action'
const DEFAULT_FEATURE_ID = 'intelligence-ask'
const MAX_HISTORY_MESSAGES = 10
const MAX_DRAFTS = 20
const MAX_OCR_CONTEXT_CHARS = 4000
const CALLER_ID = `plugin:${PLUGIN_NAME}`
const ENTRY_ID = 'corebox.ai-ask'
const WIDGET_ITEM_ID = 'intelligence-widget'
const HANDOFF_SOURCE = 'corebox.touch-intelligence'
const HANDOFF_SESSION_PREFIX = 'corebox_ai_ask'
const CONTEXT_TRACE_PREFIX = 'corebox_ai_ask'
const INPUT_TYPE_TEXT = 'text'
const INPUT_TYPE_HTML = 'html'
const INPUT_TYPE_IMAGE = 'image'
const HISTORY_FILE = 'conversation-history.json'
const AUTO_MODEL_SELECTION = '__auto__'
const OPEN_INTELLIGENCE_SETTINGS_ACTION_ID = 'open-intelligence-settings'
const INTELLIGENCE_SETTINGS_PATH = '/intelligence/channels'
const OPEN_PLUGIN_PERMISSIONS_ACTION_ID = 'open-plugin-permissions'
const PLUGIN_PERMISSIONS_PATH = `/plugin/${PLUGIN_NAME}?tab=Permissions`
const INTELLIGENCE_SETTINGS_RECOVERY_CODES = new Set([
  'NEXUS_AUTH_REQUIRED',
  'PROVIDER_UNAVAILABLE',
  'NETWORK_FAILURE',
])
const CONTEXT_CONTINUATION_REASONS = new Set([
  'archived-session-continuation',
  'expired-session-continuation',
  'idle-session-continuation',
  'continuation-session-missing',
])
const CONTEXT_CONTINUATION_STATUSES = new Set([
  'included',
  'excluded',
  'unavailable',
])
const CONTEXT_CONTINUATION_SOURCE_TYPES = new Set([
  'compression_snapshot',
  'session_summary',
])

function resolveAuthSessionGetStateEvent() {
  try {
    const { AuthEvents } = require('@talex-touch/utils/transport/events')
    return AuthEvents.session.getState.toEventName()
  } catch {
    return 'auth:session:get-state'
  }
}

const AI_ERROR_MESSAGES = {
  NEXUS_AUTH_REQUIRED: '未登录，请先登录后重试；可在登录恢复后再次发送',
  PERMISSION_DENIED: '权限已拒绝，请在插件权限中授予 intelligence.basic',
  OCR_EMPTY: 'OCR 未识别到可用文字',
  PROVIDER_UNAVAILABLE:
    'Provider 不可用，请在设置中检查默认模型或 BYOK 配置后重试',
  QUOTA_EXHAUSTED: 'AI 配额不足，请稍后重试或调整用量',
  QUOTA_CHECK_UNAVAILABLE:
    'AI 配额校验暂不可用，请稍后重试；若持续失败请检查配额存储与配置',
  MODEL_UNSUPPORTED:
    '当前模型不支持该能力，请切换支持 text.chat / vision.ocr 的模型',
  CAPABILITY_UNSUPPORTED: '当前 Provider 不支持该能力，请切换 Provider 或能力',
  NETWORK_FAILURE: 'AI 网络请求失败，请检查网络或 Provider endpoint 后重试',
  INVALID_REQUEST: 'AI 请求无效，请检查输入与调用参数',
  EMPTY_RESPONSE: 'AI 未返回可用内容',
  UNKNOWN: 'AI 调用失败',
}

const AI_SYSTEM_PROMPT =
  '你是 Talex Touch 桌面助手里的智能助手，请用简洁清晰的中文回答。'
const AI_COMMAND_VERSION = '1.0.0'
const CUSTOM_AI_COMMANDS_FILE = 'ai-commands.json'
const CUSTOM_AI_COMMANDS_SCHEMA_VERSION = 1
const CUSTOM_AI_COMMAND_FEATURE_PREFIX = 'intelligence-custom-'
const CUSTOM_AI_COMMAND_REGISTRY_FEATURE_ID = 'intelligence-command-registry'
const MAX_CUSTOM_AI_COMMANDS = 20
const MAX_CUSTOM_AI_COMMAND_ALIASES = 8
const MAX_CUSTOM_AI_COMMAND_TEMPLATE_CHARS = 4000
const MAX_CUSTOM_AI_COMMAND_VARIABLE_BYTES = 4096
const BUILTIN_AI_COMMANDS = {
  'intelligence-rewrite': {
    id: 'rewrite',
    name: 'AI 改写',
    version: AI_COMMAND_VERSION,
    prefixes: ['rewrite', '改写'],
    promptTemplate:
      'Rewrite the user input in a {{tone}} tone. Preserve its meaning and return only the rewritten text.',
    promptVariables: { tone: 'clear and concise' },
  },
  'intelligence-summarize': {
    id: 'summarize',
    name: 'AI 摘要',
    version: AI_COMMAND_VERSION,
    prefixes: ['summarize', 'summary', '总结', '摘要'],
    promptTemplate:
      'Summarize the user input in {{length}}. Return only the summary.',
    promptVariables: { length: 'three concise bullet points or fewer' },
  },
  'intelligence-explain': {
    id: 'explain',
    name: 'AI 解释',
    version: AI_COMMAND_VERSION,
    prefixes: ['explain', '解释'],
    promptTemplate:
      'Explain the user input for a {{audience}} audience. Be concise and return only the explanation.',
    promptVariables: { audience: 'general technical' },
  },
}
const AI_COMMAND_STARTER_PRESETS = [
  {
    id: 'fix-grammar',
    name: '修正语法与拼写',
    description: '修正拼写、语法和标点，同时保留原意与格式。',
    aliases: ['grammar', '语法修正'],
    promptTemplate:
      'Correct spelling, grammar, and punctuation in the user input. Preserve its meaning and formatting. Return only the corrected text.',
    promptVariables: {},
    version: AI_COMMAND_VERSION,
    enabled: true,
  },
  {
    id: 'professional-tone',
    name: '专业语气',
    description: '将文本改写为清晰、克制的职场表达。',
    aliases: ['professional', '专业语气'],
    promptTemplate:
      'Rewrite the user input in a {{tone}} professional tone for {{audience}}. Preserve its meaning and return only the rewritten text.',
    promptVariables: {
      tone: 'clear and concise',
      audience: 'workplace readers',
    },
    version: AI_COMMAND_VERSION,
    enabled: true,
  },
  {
    id: 'friendly-tone',
    name: '友好语气',
    description: '将文本改写得自然、友好，同时避免过度热情。',
    aliases: ['friendly', '友好语气'],
    promptTemplate:
      'Rewrite the user input in a {{tone}} friendly tone. Preserve its meaning and return only the rewritten text.',
    promptVariables: { tone: 'warm, natural, and concise' },
    version: AI_COMMAND_VERSION,
    enabled: true,
  },
  {
    id: 'review-code',
    name: '代码审查',
    description: '按优先级找出具体 bug、安全风险和可维护性问题。',
    aliases: ['reviewcode', '代码审查'],
    promptTemplate:
      'Review the user input as code. Identify concrete bugs, security risks, and maintainability issues. Return a concise prioritized review with actionable fixes.',
    promptVariables: {},
    version: AI_COMMAND_VERSION,
    enabled: true,
  },
]

function getAiCommandStarterPresets() {
  return AI_COMMAND_STARTER_PRESETS.map(preset => ({
    ...preset,
    aliases: [...preset.aliases],
    promptVariables: { ...preset.promptVariables },
  }))
}
const customAiCommands = new Map()
const registeredCustomAiCommandFeatureIds = new Set()
const conversationSessions = new Map()

function resolveIntelligenceClient() {
  if (intelligence?.invoke) {
    return intelligence
  }

  const {
    createIntelligenceClient,
  } = require('@talex-touch/tuff-intelligence/client')
  return createIntelligenceClient(touchChannel)
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function resolveAiCommand(featureId) {
  const resolved = resolveFeatureId(featureId)
  if (Object.prototype.hasOwnProperty.call(BUILTIN_AI_COMMANDS, resolved)) {
    return BUILTIN_AI_COMMANDS[resolved]
  }
  return customAiCommands.get(resolved) || null
}

function isKnownIntelligenceFeature(featureId) {
  const resolved = resolveFeatureId(featureId)
  return resolved === DEFAULT_FEATURE_ID || Boolean(resolveAiCommand(resolved))
}

function normalizeFeaturePrompt(featureId, value) {
  const text = normalizePrompt(value)
  const command = resolveAiCommand(featureId)
  if (!command || !text) return text

  const lowerText = text.toLocaleLowerCase()
  for (const prefix of command.prefixes) {
    for (const candidate of [prefix, `/${prefix}`]) {
      const normalizedCandidate = candidate.toLocaleLowerCase()
      if (lowerText === normalizedCandidate) return ''
      if (
        lowerText.startsWith(normalizedCandidate) &&
        /^[\s:：,，]/.test(text.slice(candidate.length, candidate.length + 1))
      ) {
        return text
          .slice(candidate.length)
          .replace(/^[\s:：,，]+/, '')
          .trim()
      }
    }
  }
  return text
}

function buildAiCommandInvokeOptions(featureId, baseOptions) {
  const command = resolveAiCommand(featureId)
  if (!command) return baseOptions
  return {
    ...baseOptions,
    promptTemplate: command.promptTemplate,
    promptVariables: { ...command.promptVariables },
    metadata: {
      ...(baseOptions?.metadata || {}),
      aiCommandId: command.id,
      aiCommandVersion: command.version || AI_COMMAND_VERSION,
    },
  }
}

function cloneMetadataRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return null
  }
}

function getUtf8ByteLength(value) {
  const text = String(value)
  let byteLength = 0
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index)
    if (codeUnit <= 0x7f) {
      byteLength += 1
    } else if (codeUnit <= 0x7ff) {
      byteLength += 2
    } else if (
      codeUnit >= 0xd800 &&
      codeUnit <= 0xdbff &&
      index + 1 < text.length &&
      text.charCodeAt(index + 1) >= 0xdc00 &&
      text.charCodeAt(index + 1) <= 0xdfff
    ) {
      byteLength += 4
      index += 1
    } else {
      byteLength += 3
    }
  }
  return byteLength
}

function getReservedAiCommandAliases() {
  const aliases = new Set(['ai', '@ai', '/ai', '智能', '问答'])
  for (const command of Object.values(BUILTIN_AI_COMMANDS)) {
    for (const prefix of command.prefixes) {
      aliases.add(prefix.toLocaleLowerCase())
      aliases.add(`/${prefix}`.toLocaleLowerCase())
    }
  }
  return aliases
}

function normalizeCustomAiCommand(raw, index, seenIds, seenAliases) {
  if (
    !raw ||
    typeof raw !== 'object' ||
    Array.isArray(raw) ||
    raw.enabled === false
  ) {
    return null
  }

  const id = normalizeText(raw.id).toLocaleLowerCase()
  const name = normalizeText(raw.name)
  const description = normalizeText(raw.description)
  const promptTemplate = normalizeText(raw.promptTemplate)
  const version = normalizeText(raw.version) || AI_COMMAND_VERSION
  if (
    !/^[a-z0-9][a-z0-9-]{0,47}$/.test(id) ||
    !name ||
    name.length > 64 ||
    description.length > 160 ||
    !promptTemplate ||
    promptTemplate.length > MAX_CUSTOM_AI_COMMAND_TEMPLATE_CHARS ||
    !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version) ||
    seenIds.has(id)
  ) {
    return null
  }

  const prefixes = Array.from(
    new Set(
      (Array.isArray(raw.aliases) ? raw.aliases : [])
        .map(alias => normalizeText(alias))
        .filter(Boolean),
    ),
  )
  if (
    prefixes.length === 0 ||
    prefixes.length > MAX_CUSTOM_AI_COMMAND_ALIASES ||
    prefixes.some(prefix => prefix.length > 48 || prefix.startsWith('/'))
  ) {
    return null
  }

  const aliasKeys = prefixes.map(prefix => prefix.toLocaleLowerCase())
  const reservedAliases = getReservedAiCommandAliases()
  if (
    aliasKeys.some(
      alias =>
        seenAliases.has(alias) ||
        seenAliases.has(`/${alias}`) ||
        reservedAliases.has(alias) ||
        reservedAliases.has(`/${alias}`),
    )
  ) {
    return null
  }

  const promptVariables =
    raw.promptVariables === undefined
      ? {}
      : cloneMetadataRecord(raw.promptVariables)
  if (!promptVariables) return null
  if (
    getUtf8ByteLength(JSON.stringify(promptVariables)) >
    MAX_CUSTOM_AI_COMMAND_VARIABLE_BYTES
  ) {
    return null
  }

  seenIds.add(id)
  for (const alias of aliasKeys) {
    seenAliases.add(alias)
    seenAliases.add(`/${alias}`)
  }

  return {
    featureId: `${CUSTOM_AI_COMMAND_FEATURE_PREFIX}${id}`,
    id,
    name,
    description: description || `无历史执行自定义 AI 命令：${name}`,
    version,
    prefixes,
    promptTemplate,
    promptVariables,
    priority: 185 - index,
  }
}

function parseCustomAiCommandConfig(raw) {
  let config = raw
  if (typeof config === 'string') {
    try {
      config = JSON.parse(config)
    } catch {
      return { valid: false, commands: [], rejectedCount: 0 }
    }
  }

  if (
    !config ||
    typeof config !== 'object' ||
    Array.isArray(config) ||
    config.version !== CUSTOM_AI_COMMANDS_SCHEMA_VERSION ||
    !Array.isArray(config.commands)
  ) {
    return { valid: false, commands: [], rejectedCount: 0 }
  }

  const seenIds = new Set()
  const seenAliases = new Set()
  const sourceCommands = config.commands.slice(0, MAX_CUSTOM_AI_COMMANDS)
  const commands = sourceCommands
    .map((command, index) =>
      normalizeCustomAiCommand(command, index, seenIds, seenAliases),
    )
    .filter(Boolean)
  return {
    valid: true,
    commands,
    rejectedCount:
      sourceCommands.length -
      commands.length +
      Math.max(0, config.commands.length - MAX_CUSTOM_AI_COMMANDS),
  }
}

async function loadCustomAiCommandConfig() {
  if (!plugin?.storage?.getFile) {
    return { valid: false, commands: [], rejectedCount: 0 }
  }

  try {
    const stored = await plugin.storage.getFile(CUSTOM_AI_COMMANDS_FILE)
    const storedFiles = plugin.storage.listFiles
      ? await plugin.storage.listFiles()
      : []
    const missingConfig =
      stored == null ||
      (stored &&
        typeof stored === 'object' &&
        !Array.isArray(stored) &&
        Object.keys(stored).length === 0 &&
        !storedFiles.includes(CUSTOM_AI_COMMANDS_FILE))
    if (missingConfig) {
      const emptyConfig = {
        version: CUSTOM_AI_COMMANDS_SCHEMA_VERSION,
        commands: [],
      }
      if (plugin.storage.setFile) {
        const saveResult = await plugin.storage.setFile(
          CUSTOM_AI_COMMANDS_FILE,
          emptyConfig,
        )
        if (saveResult?.success === false) {
          return { valid: false, commands: [], rejectedCount: 0 }
        }
      }
      return { valid: true, commands: [], rejectedCount: 0 }
    }
    return parseCustomAiCommandConfig(stored)
  } catch (error) {
    logger?.warn?.(
      '[touch-intelligence] failed to load custom AI Commands',
      error,
    )
    return { valid: false, commands: [], rejectedCount: 0 }
  }
}

function buildCustomAiCommandFeature(command) {
  return {
    id: command.featureId,
    name: command.name,
    desc: command.description,
    icon: ICON,
    keywords: [...command.prefixes, 'ai', 'command'],
    push: true,
    priority: command.priority,
    acceptedInputTypes: [INPUT_TYPE_TEXT, INPUT_TYPE_HTML],
    interaction: {
      type: 'widget',
      rendererFeatureId: DEFAULT_FEATURE_ID,
      showInput: true,
      allowInput: true,
      sendMode: true,
      forceMax: true,
    },
    platform: { win32: true, darwin: true, linux: true },
    commands: [{ type: 'match', value: [...command.prefixes] }],
  }
}

async function reloadCustomAiCommands() {
  const config = await loadCustomAiCommandConfig()
  if (!config.valid) {
    return {
      applied: false,
      registeredCount: customAiCommands.size,
      rejectedCount: config.rejectedCount,
    }
  }

  if (
    !features?.addFeature ||
    !features?.removeFeature ||
    !features?.getFeature
  ) {
    return {
      applied: false,
      registeredCount: customAiCommands.size,
      rejectedCount: config.rejectedCount,
    }
  }

  const nextFeatures = config.commands.map(buildCustomAiCommandFeature)
  const retainedFeatures = (features.getFeatures?.() || []).filter(
    feature => !registeredCustomAiCommandFeatureIds.has(feature.id),
  )
  const hasCollision = nextFeatures.some(nextFeature =>
    retainedFeatures.some(
      feature =>
        feature.id === nextFeature.id || feature.name === nextFeature.name,
    ),
  )
  if (hasCollision) {
    return {
      applied: false,
      registeredCount: customAiCommands.size,
      rejectedCount: config.rejectedCount + 1,
    }
  }

  const previousCommands = Array.from(customAiCommands.values())
  const restorePreviousState = () => {
    customAiCommands.clear()
    registeredCustomAiCommandFeatureIds.clear()
    for (const command of previousCommands) {
      if (
        features.getFeature(command.featureId) ||
        features.addFeature(buildCustomAiCommandFeature(command))
      ) {
        customAiCommands.set(command.featureId, command)
        registeredCustomAiCommandFeatureIds.add(command.featureId)
      } else {
        logger?.error?.(
          `[touch-intelligence] failed to restore custom AI Command: ${command.featureId}`,
        )
      }
    }
  }

  for (const featureId of registeredCustomAiCommandFeatureIds) {
    if (!features.removeFeature(featureId)) {
      restorePreviousState()
      return {
        applied: false,
        registeredCount: customAiCommands.size,
        rejectedCount: config.rejectedCount + 1,
      }
    }
  }

  const addedFeatureIds = []
  for (let index = 0; index < config.commands.length; index += 1) {
    const command = config.commands[index]
    if (!features.addFeature(nextFeatures[index])) {
      for (const featureId of addedFeatureIds) {
        features.removeFeature(featureId)
      }
      restorePreviousState()
      return {
        applied: false,
        registeredCount: customAiCommands.size,
        rejectedCount: config.rejectedCount + 1,
      }
    }
    addedFeatureIds.push(command.featureId)
  }

  customAiCommands.clear()
  registeredCustomAiCommandFeatureIds.clear()
  for (const command of config.commands) {
    customAiCommands.set(command.featureId, command)
    registeredCustomAiCommandFeatureIds.add(command.featureId)
  }

  return {
    applied: true,
    registeredCount: customAiCommands.size,
    rejectedCount: config.rejectedCount,
  }
}

function serializeCustomAiCommand(command) {
  return {
    id: command.id,
    name: command.name,
    description: command.description,
    aliases: [...command.prefixes],
    promptTemplate: command.promptTemplate,
    promptVariables: { ...command.promptVariables },
    version: command.version,
    enabled: true,
  }
}

function buildCustomAiCommandDocument(commands) {
  return {
    version: CUSTOM_AI_COMMANDS_SCHEMA_VERSION,
    commands: commands.map(serializeCustomAiCommand),
  }
}

async function commitCustomAiCommandDocument(document) {
  const parsed = parseCustomAiCommandConfig(document)
  if (!parsed.valid || parsed.rejectedCount > 0 || !plugin?.storage?.setFile) {
    return {
      applied: false,
      registeredCount: customAiCommands.size,
      rejectedCount: parsed.rejectedCount || 1,
      reason: 'invalid-config',
    }
  }

  let previousDocument = {
    version: CUSTOM_AI_COMMANDS_SCHEMA_VERSION,
    commands: [],
  }
  try {
    const stored = await plugin.storage.getFile?.(CUSTOM_AI_COMMANDS_FILE)
    if (stored != null) previousDocument = stored
    await plugin.storage.setFile(
      CUSTOM_AI_COMMANDS_FILE,
      buildCustomAiCommandDocument(parsed.commands),
    )
    const result = await reloadCustomAiCommands()
    if (result.applied) return { ...result, reason: '' }

    await plugin.storage.setFile(CUSTOM_AI_COMMANDS_FILE, previousDocument)
    await reloadCustomAiCommands()
    return { ...result, reason: 'registry-conflict' }
  } catch (error) {
    logger?.warn?.(
      '[touch-intelligence] failed to save custom AI Commands',
      error,
    )
    try {
      await plugin.storage.setFile(CUSTOM_AI_COMMANDS_FILE, previousDocument)
      await reloadCustomAiCommands()
    } catch (rollbackError) {
      logger?.error?.(
        '[touch-intelligence] failed to restore custom AI Commands after save error',
        rollbackError,
      )
    }
    return {
      applied: false,
      registeredCount: customAiCommands.size,
      rejectedCount: 1,
      reason: 'storage-failed',
    }
  }
}

async function upsertCustomAiCommand(payload = {}) {
  const current = await loadCustomAiCommandConfig()
  if (!current.valid || current.rejectedCount > 0) {
    return {
      applied: false,
      registeredCount: customAiCommands.size,
      rejectedCount: current.rejectedCount || 1,
      reason: 'invalid-config',
    }
  }

  const candidate = buildCustomAiCommandDocument(current.commands)
  const command = payload.command
  const originalId = normalizeText(payload.originalId).toLocaleLowerCase()
  const nextId = normalizeText(command?.id).toLocaleLowerCase()
  const existingIndex = candidate.commands.findIndex(
    item => item.id === (originalId || nextId),
  )
  if (existingIndex >= 0) candidate.commands[existingIndex] = command
  else candidate.commands.push(command)
  return commitCustomAiCommandDocument(candidate)
}

async function deleteCustomAiCommand(commandId) {
  const current = await loadCustomAiCommandConfig()
  if (!current.valid || current.rejectedCount > 0) {
    return {
      applied: false,
      registeredCount: customAiCommands.size,
      rejectedCount: current.rejectedCount || 1,
      reason: 'invalid-config',
    }
  }

  const id = normalizeText(commandId).toLocaleLowerCase()
  const commands = current.commands.filter(command => command.id !== id)
  if (commands.length === current.commands.length) {
    return {
      applied: false,
      registeredCount: customAiCommands.size,
      rejectedCount: 0,
      reason: 'not-found',
    }
  }
  return commitCustomAiCommandDocument(buildCustomAiCommandDocument(commands))
}

function truncateText(value, max = 88) {
  const text = normalizeText(value)
  if (!text) return ''
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

function getQueryText(query) {
  if (typeof query === 'string') return query
  return query?.text ?? ''
}

function hasAiPrefix(raw) {
  return /^(?:@?ai|\/ai|智能|问答)(?:[\s:：，,。?？]|$)/i.test(
    normalizeText(raw),
  )
}

function normalizePrompt(raw) {
  const input = normalizeText(raw)
  if (!input) return ''

  const withoutPrefix = input.replace(
    /^(?:@?ai|\/ai|智能|问答)[\s:：，,。?？]*/i,
    '',
  )
  if (withoutPrefix !== input) return normalizeText(withoutPrefix)
  return input
}

function resolveFeatureId(featureId) {
  return normalizeText(featureId) || DEFAULT_FEATURE_ID
}

function toSessionIdPart(value) {
  return normalizeText(value)
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function buildHandoffSessionId(featureId) {
  const resolvedFeatureId = resolveFeatureId(featureId)
  const slug = toSessionIdPart(resolvedFeatureId) || DEFAULT_FEATURE_ID
  const digest = crypto
    .createHash('sha256')
    .update(resolvedFeatureId)
    .digest('hex')
    .slice(0, 8)
  return `${HANDOFF_SESSION_PREFIX}_${slug}_${digest}`
}

function buildContextTraceId(featureId, requestId) {
  const slug = toSessionIdPart(featureId) || DEFAULT_FEATURE_ID
  const id = normalizeText(requestId) || crypto.randomUUID()
  return `${CONTEXT_TRACE_PREFIX}_${slug}_${id}`
}

function shouldSkipOptionalHandoff(error) {
  const message = toErrorMessage(error).toLowerCase()
  return (
    message.includes('not authenticated') ||
    message.includes('auth required') ||
    message.includes('nexus_auth_required') ||
    message.includes('permission') ||
    message.includes('denied') ||
    message.includes('intelligence.basic') ||
    message.includes('未登录') ||
    message.includes('需要登录')
  )
}

function shouldFallbackFromStream(error) {
  const message = toErrorMessage(error).toLowerCase()
  return (
    message.includes('stream-capable transport') ||
    message.includes('transport.stream') ||
    message.includes('not authenticated') ||
    message.includes('auth required') ||
    message.includes('nexus_auth_required') ||
    message.includes('permission') ||
    message.includes('denied') ||
    message.includes('intelligence.basic') ||
    message.includes('未登录') ||
    message.includes('需要登录')
  )
}

function normalizeHistory(messages) {
  if (!Array.isArray(messages)) return []

  return messages
    .map(message => {
      const role = normalizeText(message?.role)
      const content = normalizeText(message?.content)
      if (!content) return null
      if (role !== 'user' && role !== 'assistant') return null
      return { role, content }
    })
    .filter(Boolean)
}

function cloneHistory(messages) {
  return normalizeHistory(messages).map(message => ({ ...message }))
}

function keepNewestBusinessMessages(messages) {
  const normalized = cloneHistory(messages)
  if (normalized.length <= MAX_HISTORY_MESSAGES) return normalized
  return normalized.slice(normalized.length - MAX_HISTORY_MESSAGES)
}

async function loadStoredHistory(featureId) {
  try {
    const raw = await plugin?.storage?.getFile?.(HISTORY_FILE)
    const byFeature =
      raw && typeof raw === 'object' ? raw[resolveFeatureId(featureId)] : null
    return keepNewestBusinessMessages(byFeature?.messages || [])
  } catch (error) {
    logger?.warn?.(
      '[touch-intelligence] failed to load conversation history',
      error,
    )
    return []
  }
}

async function saveStoredHistory(featureId, messages) {
  try {
    const raw = await plugin?.storage?.getFile?.(HISTORY_FILE)
    const next = raw && typeof raw === 'object' ? { ...raw } : {}
    next[resolveFeatureId(featureId)] = {
      messages: keepNewestBusinessMessages(messages),
      updatedAt: Date.now(),
    }
    await plugin?.storage?.setFile?.(HISTORY_FILE, next)
  } catch (error) {
    logger?.warn?.(
      '[touch-intelligence] failed to save conversation history',
      error,
    )
  }
}

function canCommitResponse(session, requestId) {
  return (
    session.activeRequestId === requestId && session.uiRequestId === requestId
  )
}

function cancelStreamController(controller) {
  if (!controller || controller.cancelled || typeof controller.cancel !== 'function') return
  try {
    controller.cancel()
  } catch (error) {
    logger?.warn?.('[touch-intelligence] failed to cancel superseded context stream', error)
  }
}

function cancelActiveStream(session) {
  const cancel = session.activeStreamCancellation
  const controller = session.activeStreamController
  session.activeStreamCancellation = null
  session.activeStreamController = null
  if (typeof cancel === 'function') {
    cancel()
    return
  }
  cancelStreamController(controller)
}

function supersedeActiveRequest(session) {
  session.activeRequestId = ''
  session.uiRequestId = ''
  cancelActiveStream(session)
}

function supersedeAllActiveRequests() {
  for (const session of conversationSessions.values()) {
    supersedeActiveRequest(session)
  }
}

function markPendingRequest(session, requestId) {
  session.activeRequestId = requestId
  session.uiRequestId = requestId
  cancelActiveStream(session)
}

function getSession(featureId) {
  const resolvedFeatureId = resolveFeatureId(featureId)
  if (!conversationSessions.has(resolvedFeatureId)) {
    conversationSessions.set(resolvedFeatureId, {
      history: [],
      activeRequestId: '',
      uiRequestId: '',
      activeStreamController: null,
      activeStreamCancellation: null,
      handoffSessionId: buildHandoffSessionId(resolvedFeatureId),
      contextSessionId: '',
      contextMode: 'new',
      drafts: new Map(),
      lastReadyDraftId: '',
      lastReadyPromptKey: '',
      modelOptions: [],
      selectedProviderId: '',
      selectedModel: '',
    })
  }

  return conversationSessions.get(resolvedFeatureId)
}

function buildHandoffContext({
  featureId,
  prompt,
  history,
  answer,
  requestId,
  inputKinds = [],
}) {
  const messages = keepNewestBusinessMessages([
    ...cloneHistory(history),
    ...(answer
      ? [
          { role: 'user', content: normalizeText(prompt) },
          { role: 'assistant', content: normalizeText(answer) },
        ]
      : []),
  ])
  const conversation =
    messages.length > 0
      ? {
          conversation: {
            messages,
            updatedAt: Date.now(),
          },
        }
      : {}

  return {
    source: HANDOFF_SOURCE,
    featureId: resolveFeatureId(featureId),
    entry: ENTRY_ID,
    requestId,
    inputKinds: Array.from(new Set(inputKinds.filter(Boolean))),
    lastPrompt: normalizeText(prompt),
    ...(answer ? { lastAnswer: normalizeText(answer) } : {}),
    ...conversation,
  }
}

async function ensureHandoffSession(client, session, params) {
  const handoffSessionId =
    normalizeText(session.handoffSessionId) ||
    buildHandoffSessionId(params.featureId)

  if (!client?.agentSessionStart) return ''

  try {
    const handoff = await client.agentSessionStart({
      sessionId: handoffSessionId,
      objective: params.prompt,
      context: buildHandoffContext(params),
      metadata: {
        caller: CALLER_ID,
        entry: ENTRY_ID,
        featureId: resolveFeatureId(params.featureId),
        source: HANDOFF_SOURCE,
      },
    })
    const restoredMessages = normalizeHistory(
      handoff?.context?.conversation?.messages,
    )
    if (restoredMessages.length > session.history.length) {
      session.history = keepNewestBusinessMessages(restoredMessages)
    }
    session.handoffSessionId = handoffSessionId
    return handoffSessionId
  } catch (error) {
    logger?.warn?.('[touch-intelligence] handoff session unavailable', error)
    if (shouldSkipOptionalHandoff(error)) session.handoffSessionId = ''
  }

  return ''
}

async function updateHandoffSession(client, session, params) {
  if (!client?.agentSessionStart || !session.handoffSessionId) return

  try {
    await client.agentSessionStart({
      sessionId: session.handoffSessionId,
      objective: params.prompt,
      context: buildHandoffContext(params),
      metadata: {
        caller: CALLER_ID,
        entry: ENTRY_ID,
        featureId: resolveFeatureId(params.featureId),
        source: HANDOFF_SOURCE,
        lastRequestId: params.requestId,
      },
    })
  } catch (error) {
    logger?.warn?.(
      '[touch-intelligence] failed to update handoff session',
      error,
    )
  }
}

function summarizeContextContinuation(value) {
  if (!value || typeof value !== 'object') return null

  const reason = normalizeText(value.reason)
  const status = normalizeText(value.status)
  if (
    !CONTEXT_CONTINUATION_REASONS.has(reason) ||
    !CONTEXT_CONTINUATION_STATUSES.has(status)
  )
    return null

  const sourceSessionId = normalizeText(value.sourceSessionId)
  const summarySourceType = normalizeText(value.summarySourceType)
  const summarySourceId = normalizeText(value.summarySourceId)
  const degradedReason = normalizeText(value.degradedReason)
  return {
    reason,
    status,
    ...(sourceSessionId ? { sourceSessionId } : {}),
    ...(CONTEXT_CONTINUATION_SOURCE_TYPES.has(summarySourceType)
      ? { summarySourceType }
      : {}),
    ...(summarySourceId ? { summarySourceId } : {}),
    ...(degradedReason ? { degradedReason } : {}),
  }
}

function summarizeContextPackage(contextPackage) {
  if (!contextPackage || typeof contextPackage !== 'object') return null

  const items = Array.isArray(contextPackage.items) ? contextPackage.items : []
  const safeSourceTypes = normalizeStringList(contextPackage.sourceTypes)
  const sourceTypes = {}
  let citationCount = 0
  let retrievalItemCount = 0

  for (const sourceType of safeSourceTypes) {
    sourceTypes[sourceType] = (sourceTypes[sourceType] || 0) + 1
    if (sourceType === 'retrieval') retrievalItemCount += 1
  }
  for (const item of items) {
    const sourceType = normalizeText(item?.sourceType) || 'unknown'
    sourceTypes[sourceType] = (sourceTypes[sourceType] || 0) + 1
    if (sourceType === 'retrieval') retrievalItemCount += 1
    if (item?.metadata?.citation && typeof item.metadata.citation === 'object')
      citationCount += 1
  }

  const retrieval =
    contextPackage.metadata?.retrieval &&
    typeof contextPackage.metadata.retrieval === 'object'
      ? contextPackage.metadata.retrieval
      : null
  const metadataCitationCount = Number(retrieval?.citationCount)
  const safeCitationCount = Number(contextPackage.citationCount)
  const safeRetrievalItemCount = Number(contextPackage.retrievalItemCount)
  const continuation = summarizeContextContinuation(contextPackage.continuation)

  return {
    id: normalizeText(contextPackage.packageId || contextPackage.id),
    sessionId: normalizeText(contextPackage.sessionId),
    turnId: normalizeText(contextPackage.turnId),
    checkpointId: normalizeText(
      contextPackage.checkpoint?.id || contextPackage.checkpointId,
    ),
    checkpointReason: normalizeText(
      contextPackage.checkpoint?.reason || contextPackage.checkpointReason,
    ),
    ...(continuation ? { continuation } : {}),
    mode: normalizeText(contextPackage.mode),
    scope: normalizeText(contextPackage.scope),
    traceId: normalizeText(contextPackage.traceId),
    tokenBudget: Number(contextPackage.tokenBudget) || 0,
    tokenEstimate: Number(contextPackage.tokenEstimate) || 0,
    itemCount: Number(contextPackage.itemCount) || items.length,
    retrievalItemCount: Number.isFinite(safeRetrievalItemCount)
      ? safeRetrievalItemCount
      : retrievalItemCount,
    citationCount: Number.isFinite(safeCitationCount)
      ? safeCitationCount
      : Number.isFinite(metadataCitationCount)
        ? metadataCitationCount
        : citationCount,
    sourceTypes,
    retrievalStatus: normalizeText(retrieval?.status),
    degradedReason: normalizeText(
      contextPackage.degradedReason || retrieval?.degradedReason,
    ),
  }
}

function hasExplicitMemoryIntent(prompt) {
  return [
    /\b(remember this|remember that|save this as memory|save this memory)\b/i,
    /(请)?记住|帮我记住|保存为记忆|加入记忆|记到记忆/,
  ].some(pattern => pattern.test(normalizeText(prompt)))
}

function summarizeMemoryPolicy(result) {
  if (!result || typeof result !== 'object') return null

  const candidate =
    result.candidate && typeof result.candidate === 'object'
      ? result.candidate
      : null
  const summary = {
    status: normalizeText(result.status),
    reason: normalizeText(result.reason),
  }
  if (candidate) {
    summary.candidate = {
      type: normalizeText(candidate.type),
      scope: normalizeText(candidate.scope),
      summary: truncateText(candidate.summary, 160),
      tags: normalizeStringList(candidate.tags),
      confidence: Number(candidate.confidence) || 0,
      privacyLevel: normalizeText(candidate.privacyLevel),
      ...(candidate.sourceSessionId
        ? { sourceSessionId: normalizeText(candidate.sourceSessionId) }
        : {}),
      ...(candidate.sourceTurnId
        ? { sourceTurnId: normalizeText(candidate.sourceTurnId) }
        : {}),
    }
  }
  return summary
}

async function evaluateMemoryPolicyForAsk(client, { prompt, contextState }) {
  if (typeof client?.contextEvaluateMemory !== 'function') return null

  const content = normalizeText(prompt)
  if (!content || !hasExplicitMemoryIntent(content)) return null

  try {
    const result = await client.contextEvaluateMemory({
      content,
      type: 'preference',
      scope: 'session',
      tags: ['corebox-ai-ask'],
      sourceSessionId: normalizeText(contextState?.sessionId),
      sourceTurnId: normalizeText(contextState?.turnId),
      privacyLevel: 'normal',
      metadata: {
        caller: CALLER_ID,
        entry: ENTRY_ID,
        source: HANDOFF_SOURCE,
      },
    })
    return summarizeMemoryPolicy(result)
  } catch (error) {
    logger?.warn?.('[touch-intelligence] memory policy unavailable', error)
    return null
  }
}

function normalizeContextMode(value, fallback = 'new') {
  const mode = normalizeText(value)
  return mode === 'new' || mode === 'continue' || mode === 'stateless'
    ? mode
    : fallback
}

function normalizeContextOwner(value, fallback = 'corebox') {
  const owner = normalizeText(value)
  return owner === 'corebox' ||
    owner === 'workflow' ||
    owner === 'omni-panel' ||
    owner === 'assistant' ||
    owner === 'system'
    ? owner
    : fallback
}

function normalizeContextScope(value, fallback = 'retrieval') {
  const scope = normalizeText(value)
  return scope === 'light' || scope === 'session' || scope === 'retrieval'
    ? scope
    : fallback
}

function buildContextExecutionRequest({
  featureId,
  requestId,
  input,
  displayPrompt,
  payload,
  invokeOptions,
  session,
  entrypointContext,
  forceStateless = false,
}) {
  const execution = entrypointContext?.execution
  const requestedSessionId =
    normalizeText(execution?.sessionId) || session.contextSessionId
  const requestedMode = normalizeContextMode(
    execution?.mode ?? session.contextMode,
    requestedSessionId ? 'continue' : 'new',
  )
  const mode = forceStateless
    ? 'stateless'
    : requestedMode === 'continue' && !requestedSessionId
      ? 'new'
      : requestedMode
  const traceId = buildContextTraceId(featureId, requestId)
  const tokenBudget = Number(execution?.tokenBudget)
  return getContextExecutionRequestFactory()({
    capabilityId: 'text.chat',
    input: normalizeText(input),
    payload,
    options: invokeOptions,
    policy: {
      entrypointId: normalizeText(entrypointContext?.id) || ENTRY_ID,
      owner: normalizeContextOwner(execution?.owner),
      mode,
      ...(mode === 'continue' && requestedSessionId
        ? { sessionId: requestedSessionId }
        : {}),
      scope: normalizeContextScope(execution?.scope),
      objective:
        normalizeText(execution?.objective) || normalizeText(displayPrompt),
      tokenBudget:
        Number.isFinite(tokenBudget) && tokenBudget > 0 ? tokenBudget : 1200,
      traceId,
    },
  })
}

function truncateForContext(value, max = MAX_OCR_CONTEXT_CHARS) {
  const text = normalizeText(value)
  if (text.length <= max) return text
  return text.slice(0, max)
}

function buildUserMessageContent(prompt, context = {}) {
  const normalizedPrompt = normalizeText(prompt)
  const ocrText = truncateForContext(context.ocrText)

  if (!ocrText) return normalizedPrompt

  const task = normalizedPrompt || '请总结剪贴板图片中的文字。'
  return `${task}\n\n以下是剪贴板图片的 OCR 文本，请只基于这些文字回答：\n${ocrText}`
}

function buildInvokePayload(prompt, history = [], context = {}) {
  const normalizedHistory = normalizeHistory(history)
  return {
    messages: [
      { role: 'system', content: AI_SYSTEM_PROMPT },
      ...normalizedHistory,
      { role: 'user', content: buildUserMessageContent(prompt, context) },
    ],
  }
}

function buildOcrPayload(imageDataUrl) {
  return {
    source: {
      type: 'data-url',
      dataUrl: imageDataUrl,
    },
    language: 'zh-CN',
    includeLayout: false,
    includeKeywords: false,
  }
}

function buildInvokeOptions({
  featureId,
  requestId,
  capabilityId,
  inputKinds = [],
  sessionId,
  contextPackage,
  memoryPolicy,
}) {
  const contextSummary =
    contextPackage && typeof contextPackage === 'object' ? contextPackage : null
  const memoryPolicySummary =
    memoryPolicy && typeof memoryPolicy === 'object' ? memoryPolicy : null
  return {
    metadata: {
      caller: CALLER_ID,
      entry: ENTRY_ID,
      featureId: resolveFeatureId(featureId),
      requestId,
      inputKinds: Array.from(new Set(inputKinds.filter(Boolean))),
      capabilityId,
      ...(sessionId
        ? {
            sessionId,
            handoffSessionId: sessionId,
            handoffSource: HANDOFF_SOURCE,
          }
        : {}),
      ...(contextSummary
        ? {
            contextTraceId: contextSummary.traceId,
            contextSessionId: contextSummary.sessionId,
            contextPackageId: contextSummary.id,
            contextScope: contextSummary.scope,
            contextTokenEstimate: contextSummary.tokenEstimate,
            contextCitationCount: contextSummary.citationCount,
          }
        : {}),
      ...(memoryPolicySummary
        ? {
            memoryPolicyStatus: memoryPolicySummary.status,
            memoryPolicyReason: memoryPolicySummary.reason,
          }
        : {}),
    },
  }
}

function normalizeModelSelection(selection = {}) {
  const providerId = normalizeText(selection.providerId)
  const model = normalizeText(selection.model)
  if (
    !providerId ||
    !model ||
    providerId === AUTO_MODEL_SELECTION ||
    model === AUTO_MODEL_SELECTION
  ) {
    return {
      providerId: '',
      model: '',
    }
  }
  return { providerId, model }
}

function buildModelSelectionInvokeOptions(baseOptions, selection = {}) {
  const normalized = normalizeModelSelection(selection)
  if (!normalized.providerId || !normalized.model) {
    return baseOptions
  }
  return {
    ...baseOptions,
    preferredProviderId: normalized.providerId,
    modelPreference: [normalized.model],
    metadata: {
      ...(baseOptions.metadata ?? {}),
      selectedProviderId: normalized.providerId,
      selectedModel: normalized.model,
    },
  }
}

function normalizeStringList(values) {
  if (!Array.isArray(values)) return []
  return Array.from(
    new Set(values.map(value => normalizeText(value)).filter(Boolean)),
  )
}

function normalizeLatency(value) {
  const latency = Number(value)
  if (!Number.isFinite(latency) || latency < 0) return undefined
  return Math.round(latency)
}

function formatLatency(latency) {
  const normalized = normalizeLatency(latency)
  if (normalized === undefined) return ''
  if (normalized < 1000) return `${normalized}ms`
  return `${(normalized / 1000).toFixed(normalized >= 10000 ? 0 : 1)}s`
}

function buildCapabilitySummary(values) {
  return normalizeStringList(values).join(' + ')
}

function mapInvokeResult(
  result,
  prompt,
  requestId,
  handoffSessionId = '',
  inputKinds = [],
  contextPackage = null,
  memoryPolicy = null,
) {
  return {
    requestId,
    prompt,
    answer: normalizeText(result?.result),
    provider: normalizeText(result?.provider),
    model: normalizeText(result?.model),
    traceId: normalizeText(result?.traceId),
    latency: normalizeLatency(result?.latency ?? result?.latencyMs),
    handoffSessionId: normalizeText(handoffSessionId),
    inputKinds: normalizeStringList(inputKinds),
    contextPackage,
    memoryPolicy,
  }
}

async function streamChatAnswer({
  client,
  featureId,
  requestId,
  contextRequest,
  displayPrompt,
  handoffSessionId,
  inputKinds,
  imageDataUrl,
  ocrText,
  history,
  session,
  selectedProviderId,
  selectedModel,
  modelOptions,
  contextPackage,
  memoryPolicy,
}) {
  if (!canCommitResponse(session, requestId)) {
    throw new Error('INTELLIGENCE_STREAM_SUPERSEDED')
  }
  if (typeof client?.contextStream !== 'function') return null

  let answer = ''
  let hasVisibleDelta = false
  let streamSettled = false
  let streamSuperseded = false
  let cancelSupersededStream = null
  let streamController = null
  let provider = ''
  let model = ''
  let traceId = ''
  let latency = 0
  let safeContextPackage = contextPackage
  const startedAt = Date.now()
  const updateContextPackage = event => {
    const next = summarizeContextPackage(
      event?.context || event?.metadata?.contextExecution,
    )
    if (next) safeContextPackage = next
  }

  try {
    await new Promise((resolve, reject) => {
      const settleStream = callback => {
        if (streamSettled) return
        streamSettled = true
        if (session.activeStreamController === streamController) {
          session.activeStreamController = null
        }
        if (session.activeStreamCancellation === cancelSupersededStream) {
          session.activeStreamCancellation = null
        }
        callback()
      }
      cancelSupersededStream = () => {
        if (streamSettled) return
        streamSuperseded = true
        cancelStreamController(streamController)
        settleStream(() => reject(new Error('INTELLIGENCE_STREAM_SUPERSEDED')))
      }
      session.activeStreamCancellation = cancelSupersededStream
      const controllerPromise = client
        .contextStream(contextRequest, {
          onStart(event) {
            updateContextPackage(event)
            provider = normalizeText(event?.provider) || provider
            model = normalizeText(event?.model) || model
            traceId = normalizeText(event?.traceId) || traceId
          },
          onDelta(delta, event) {
            if (streamSettled || !canCommitResponse(session, requestId)) return
            const nextContent = normalizeText(event?.content)
            const nextDelta = normalizeText(delta)
            if (!nextContent && !nextDelta) return
            hasVisibleDelta = true
            answer = nextContent || `${answer}${nextDelta}`
            provider = normalizeText(event?.provider) || provider
            model = normalizeText(event?.model) || model
            traceId = normalizeText(event?.traceId) || traceId
            void pushWidgetState(featureId, {
              requestId,
              prompt: displayPrompt,
              answer,
              provider,
              model,
              traceId,
              latency: Date.now() - startedAt,
              handoffSessionId,
              status: 'chat-pending',
              stage: 'chat',
              capabilityId: 'text.chat',
              inputKinds,
              imageDataUrl,
              ocrText,
              history,
              selectedProviderId,
              selectedModel,
              modelOptions,
              contextPackage: safeContextPackage,
              memoryPolicy,
            })
          },
          onUsage(eventUsage, event) {
            provider = normalizeText(event?.provider) || provider
            model = normalizeText(event?.model) || model
            traceId = normalizeText(event?.traceId) || traceId
            void eventUsage
          },
          onEnd(event) {
            if (streamSettled) return
            updateContextPackage(event)
            answer =
              normalizeText(event?.content) ||
              normalizeText(event?.result) ||
              answer
            provider = normalizeText(event?.provider) || provider
            model = normalizeText(event?.model) || model
            traceId = normalizeText(event?.traceId) || traceId
            latency =
              normalizeLatency(event?.metadata?.latency) ||
              Date.now() - startedAt
            settleStream(resolve)
          },
          onError(error) {
            settleStream(() => reject(error))
          },
        })
      Promise.resolve(controllerPromise)
        .then(controller => {
          if (!controller || typeof controller.cancel !== 'function') return
          streamController = controller
          if (streamSettled) {
            if (streamSuperseded) cancelStreamController(controller)
            return
          }
          if (!canCommitResponse(session, requestId)) {
            streamSuperseded = true
            cancelStreamController(controller)
            settleStream(() => reject(new Error('INTELLIGENCE_STREAM_SUPERSEDED')))
            return
          }
          session.activeStreamController = controller
        })
        .catch(error => settleStream(() => reject(error)))
    })
  } catch (error) {
    if (!hasVisibleDelta && shouldFallbackFromStream(error)) {
      logger?.warn?.(
        '[touch-intelligence] context stream unavailable, falling back to invoke',
        error,
      )
      return null
    }
    throw error
  }

  if (!answer) throw createPluginError('EMPTY_RESPONSE')

  return {
    requestId,
    prompt: displayPrompt,
    answer,
    provider,
    model,
    traceId,
    latency,
    handoffSessionId,
    inputKinds: normalizeStringList(inputKinds),
    selectedProviderId: normalizeText(selectedProviderId),
    selectedModel: normalizeText(selectedModel),
    contextPackage: safeContextPackage,
    memoryPolicy,
  }
}

function toErrorMessage(error) {
  if (!error) return ''
  if (typeof error === 'string') return error
  return normalizeText(error.message || String(error))
}

function createPluginError(code, message) {
  const error = new Error(
    message || AI_ERROR_MESSAGES[code] || AI_ERROR_MESSAGES.UNKNOWN,
  )
  error.code = code
  return error
}

async function getAuthState() {
  if (!touchChannel?.send) return null

  try {
    return await touchChannel.send(AUTH_SESSION_GET_STATE_EVENT)
  } catch (error) {
    logger?.warn?.('[touch-intelligence] failed to resolve auth state', error)
    return null
  }
}

async function ensureSignedIn() {
  const state = await getAuthState()
  return state?.isSignedIn === true
}

function normalizeInvokeError(error) {
  const rawCode = normalizeText(error?.code).toUpperCase()
  const rawMessage = toErrorMessage(error)
  const lower = rawMessage.toLowerCase()

  let code = AI_ERROR_MESSAGES[rawCode] ? rawCode : 'UNKNOWN'
  if (code === 'UNKNOWN') {
    if (
      lower.includes('not authenticated') ||
      lower.includes('auth required') ||
      lower.includes('nexus_auth_required') ||
      lower.includes('未登录') ||
      lower.includes('需要登录')
    ) {
      code = 'NEXUS_AUTH_REQUIRED'
    } else if (
      lower.includes('permission') ||
      lower.includes('denied') ||
      lower.includes('intelligence.basic')
    ) {
      code = 'PERMISSION_DENIED'
    } else if (
      lower.includes('quota_check_unavailable') ||
      lower.includes('quota verification is unavailable') ||
      lower.includes('配额校验')
    ) {
      code = 'QUOTA_CHECK_UNAVAILABLE'
    } else if (
      lower.includes('quota') ||
      lower.includes('rate limit') ||
      lower.includes('too many')
    ) {
      code = 'QUOTA_EXHAUSTED'
    } else if (
      lower.includes('network') ||
      lower.includes('fetch failed') ||
      lower.includes('timeout') ||
      lower.includes('timed out') ||
      lower.includes('econn')
    ) {
      code = 'NETWORK_FAILURE'
    } else if (
      lower.includes('provider') ||
      lower.includes('api key') ||
      lower.includes('not configured') ||
      lower.includes('provider_config_unavailable') ||
      lower.includes('no enabled providers') ||
      lower.includes('no providers available')
    ) {
      code = 'PROVIDER_UNAVAILABLE'
    } else if (
      lower.includes('capability unsupported') ||
      lower.includes('capability not supported') ||
      lower.includes('unsupported capability')
    ) {
      code = 'CAPABILITY_UNSUPPORTED'
    } else if (
      lower.includes('model unsupported') ||
      lower.includes('model does not support') ||
      lower.includes('unsupported model') ||
      lower.includes('unsupported') ||
      lower.includes('not supported')
    ) {
      code = 'MODEL_UNSUPPORTED'
    } else if (lower.includes('invalid request') || lower.includes('invalid_request')) {
      code = 'INVALID_REQUEST'
    } else if (
      lower.includes('empty response') ||
      lower.includes('未返回可用内容')
    ) {
      code = 'EMPTY_RESPONSE'
    }
  }

  const fallback = AI_ERROR_MESSAGES[code] || AI_ERROR_MESSAGES.UNKNOWN
  const detail =
    rawMessage && rawMessage !== fallback
      ? `：${truncateText(rawMessage, 120)}`
      : ''
  return {
    code,
    message: `${fallback}${detail}`,
    reason: truncateText(normalizeText(error?.reason), 240),
    recovery: truncateText(normalizeText(error?.recovery), 240),
  }
}

function buildWidgetErrorState(normalizedError = {}) {
  return {
    errorCode: normalizeText(normalizedError.code),
    errorMessage: normalizeText(normalizedError.message),
    errorReason: truncateText(normalizeText(normalizedError.reason), 240),
    errorRecovery: truncateText(normalizeText(normalizedError.recovery), 240),
  }
}

async function ensurePermission(permissionId, reason) {
  if (!permission?.check || !permission?.request) return false

  try {
    const hasPermission = await permission.check(permissionId)
    if (hasPermission) return true

    const granted = await permission.request(permissionId, reason)
    return Boolean(granted)
  } catch (error) {
    logger?.warn?.('[touch-intelligence] Failed to request permission', error)
    return false
  }
}

function buildIntelligenceMeta(details = {}) {
  const meta = {
    entry: ENTRY_ID,
    source: HANDOFF_SOURCE,
  }
  const status = normalizeText(details.status)
  const stage = normalizeText(details.stage)
  const requestId = normalizeText(details.requestId)
  const capabilityId = normalizeText(details.capabilityId)
  const provider = normalizeText(details.provider)
  const model = normalizeText(details.model)
  const traceId = normalizeText(details.traceId)
  const handoffSessionId = normalizeText(details.handoffSessionId)
  const errorCode = normalizeText(details.errorCode)
  const errorMessage = normalizeText(details.errorMessage)
  const errorReason = truncateText(normalizeText(details.errorReason), 240)
  const errorRecovery = truncateText(normalizeText(details.errorRecovery), 240)
  const inputKinds = normalizeStringList(details.inputKinds)
  const capabilities = normalizeStringList(details.capabilities)
  const contextPackage =
    details.contextPackage && typeof details.contextPackage === 'object'
      ? details.contextPackage
      : null
  const memoryPolicy =
    details.memoryPolicy && typeof details.memoryPolicy === 'object'
      ? details.memoryPolicy
      : null
  const latency = normalizeLatency(details.latency)

  if (status) meta.status = status
  if (stage) meta.stage = stage
  if (requestId) meta.requestId = requestId
  if (capabilityId) meta.capabilityId = capabilityId
  if (capabilities.length > 0) meta.capabilities = capabilities
  if (provider) meta.provider = provider
  if (model) meta.model = model
  if (traceId) meta.traceId = traceId
  if (latency !== undefined) meta.latency = latency
  if (inputKinds.length > 0) meta.inputKinds = inputKinds
  if (errorCode) meta.errorCode = errorCode
  if (errorMessage) meta.errorMessage = errorMessage
  if (errorReason) meta.errorReason = errorReason
  if (errorRecovery) meta.errorRecovery = errorRecovery
  if (handoffSessionId) {
    meta.handoffSessionId = handoffSessionId
    meta.sessionId = handoffSessionId
  }
  if (contextPackage) {
    if (contextPackage.traceId) meta.contextTraceId = contextPackage.traceId
    if (contextPackage.sessionId)
      meta.contextSessionId = contextPackage.sessionId
    if (contextPackage.id) meta.contextPackageId = contextPackage.id
  }
  if (memoryPolicy) {
    if (memoryPolicy.status) meta.memoryPolicyStatus = memoryPolicy.status
    if (memoryPolicy.reason) meta.memoryPolicyReason = memoryPolicy.reason
  }

  return meta
}

function buildInfoItem({
  id,
  featureId,
  title,
  subtitle,
  description,
  accessory,
  payload,
  actionId,
  status,
  handoffSessionId,
  intelligence,
}) {
  const builder = new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)

  if (description) builder.setDescription(description)
  if (accessory) builder.setAccessory(accessory)

  const meta = {
    pluginName: PLUGIN_NAME,
    featureId,
    status,
    keepCoreBoxOpen: true,
    intelligence: buildIntelligenceMeta({
      ...intelligence,
      status,
      handoffSessionId,
    }),
  }

  if (actionId) {
    meta.defaultAction = ACTION_ID
    meta.actionId = actionId
    meta.payload = payload
  }

  return builder.setMeta(meta).build()
}

function buildCustomAiCommandRegistryItem(result, viewState = {}) {
  const status =
    viewState.operationStatus || (result.applied ? 'ready' : 'error')
  const operationMessage = normalizeText(viewState.operationMessage)
  const commands = Array.from(customAiCommands.values()).map(
    serializeCustomAiCommand,
  )
  return new TuffItemBuilder('custom-ai-command-registry-editor')
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle('AI 命令管理')
    .setSubtitle(
      `${commands.length}/${MAX_CUSTOM_AI_COMMANDS} 个命令 · ${result.rejectedCount} 个跳过`,
    )
    .setDescription(
      operationMessage ||
        '创建、编辑、删除或导入自定义命令；保存后立即原子更新 CoreBox feature。',
    )
    .setIcon(ICON)
    .setCustomRender(
      'vue',
      getMakeWidgetId()(PLUGIN_NAME, CUSTOM_AI_COMMAND_REGISTRY_FEATURE_ID),
      {
        schemaVersion: CUSTOM_AI_COMMANDS_SCHEMA_VERSION,
        configFile: CUSTOM_AI_COMMANDS_FILE,
        commands,
        presets: getAiCommandStarterPresets(),
        registeredCount: result.registeredCount,
        rejectedCount: result.rejectedCount,
        canEdit: result.applied && result.rejectedCount === 0,
        status,
        operationMessage,
        limits: {
          commands: MAX_CUSTOM_AI_COMMANDS,
          aliases: MAX_CUSTOM_AI_COMMAND_ALIASES,
          templateChars: MAX_CUSTOM_AI_COMMAND_TEMPLATE_CHARS,
          variableBytes: MAX_CUSTOM_AI_COMMAND_VARIABLE_BYTES,
        },
      },
    )
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId: CUSTOM_AI_COMMAND_REGISTRY_FEATURE_ID,
      status,
      keepCoreBoxOpen: true,
      defaultAction: ACTION_ID,
      actionId: 'reload-custom-ai-commands',
      payload: {},
    })
    .build()
}

async function pushCustomAiCommandRegistryState(viewState = {}) {
  const result = viewState.result || (await reloadCustomAiCommands())
  const item = buildCustomAiCommandRegistryItem(result, viewState)
  plugin.feature.clearItems()
  await plugin.feature.pushItems([item])
  return result
}

function resolveDisplayPrompt(prompt, hasImage) {
  const normalizedPrompt = normalizePrompt(prompt)
  if (normalizedPrompt) return normalizedPrompt
  return hasImage ? '分析剪贴板图片' : ''
}

function buildWidgetMessages(state = {}) {
  const messages = cloneHistory(state.history).map((message, index) => ({
    id: `${normalizeText(state.requestId) || 'history'}-${index}`,
    role: message.role,
    content: message.content,
    status: 'complete',
  }))
  const prompt = normalizeText(state.prompt)
  const answer = normalizeText(state.answer)
  if (prompt) {
    messages.push({
      id: `${normalizeText(state.requestId) || 'draft'}-user`,
      role: 'user',
      content: prompt,
      status: 'complete',
      attachments: state.imageDataUrl
        ? [
            {
              type: 'image',
              title: '剪贴板图片',
              detail: state.ocrText
                ? '已作为 OCR 上下文引用'
                : '作为图片上下文引用',
              preview: state.imageDataUrl,
            },
          ]
        : [],
    })
  }
  if (answer) {
    messages.push({
      id: `${normalizeText(state.requestId) || 'draft'}-assistant`,
      role: 'assistant',
      content: answer,
      status: state.status === 'chat-pending' ? 'streaming' : 'complete',
    })
  } else if (state.status === 'error') {
    messages.push({
      id: `${normalizeText(state.requestId) || 'draft'}-assistant-error`,
      role: 'assistant',
      content: normalizeText(state.errorMessage) || AI_ERROR_MESSAGES.UNKNOWN,
      status: 'error',
    })
  } else if (
    state.status === 'ocr-pending' ||
    state.status === 'chat-pending'
  ) {
    messages.push({
      id: `${normalizeText(state.requestId) || 'draft'}-assistant-pending`,
      role: 'assistant',
      content: '',
      status: 'streaming',
    })
  }
  return messages
}

function buildImageContext(state = {}) {
  const hasImage = Boolean(
    state.imageDataUrl ||
    state.ocrText ||
    normalizeStringList(state.inputKinds).includes(INPUT_TYPE_IMAGE),
  )
  if (!hasImage) return null

  const errorCode = normalizeText(state.errorCode)
  const unsupported =
    errorCode === 'MODEL_UNSUPPORTED' ||
    errorCode === 'CAPABILITY_UNSUPPORTED' ||
    errorCode === 'PROVIDER_UNAVAILABLE'
  return {
    type: 'image',
    title: '剪贴板图片上下文',
    preview: normalizeText(state.imageDataUrl),
    ocrText: normalizeText(state.ocrText),
    status: unsupported ? 'unsupported' : state.ocrText ? 'ready' : 'attached',
    note: unsupported
      ? '当前默认模型或 Provider 不支持图片/OCR，请切换支持 vision.ocr 的模型后重试。'
      : state.ocrText
        ? '图片已识别为文字上下文并参与回答。'
        : '图片将作为上下文参与本次提问。',
  }
}

function buildWidgetPayload(state = {}) {
  const selected = normalizeModelSelection({
    providerId: state.selectedProviderId,
    model: state.selectedModel,
  })
  const contextPackage = cloneMetadataRecord(state.contextPackage)
  const memoryPolicy = cloneMetadataRecord(state.memoryPolicy)
  const aiCommandId = normalizeText(state.aiCommandId)
  return {
    ...(aiCommandId ? { aiCommandId } : {}),
    requestId: normalizeText(state.requestId),
    prompt: normalizeText(state.prompt),
    answer: normalizeText(state.answer),
    provider: normalizeText(state.provider),
    model: normalizeText(state.model),
    traceId: normalizeText(state.traceId),
    latency: normalizeLatency(state.latency),
    handoffSessionId: normalizeText(state.handoffSessionId),
    status: normalizeText(state.status) || 'idle',
    stage: normalizeText(state.stage),
    capabilityId: normalizeText(state.capabilityId),
    inputKinds: normalizeStringList(state.inputKinds),
    errorCode: normalizeText(state.errorCode),
    errorMessage: normalizeText(state.errorMessage),
    errorReason: truncateText(normalizeText(state.errorReason), 240),
    errorRecovery: truncateText(normalizeText(state.errorRecovery), 240),
    copyStatus: normalizeText(state.copyStatus),
    copyError: normalizeText(state.copyError),
    copyRecovery: normalizeText(state.copyRecovery),
    replaceStatus: normalizeText(state.replaceStatus),
    replaceError: normalizeText(state.replaceError),
    replaceRecovery: normalizeText(state.replaceRecovery),
    contextMode: normalizeContextMode(
      state.contextMode,
      normalizeContextMode(contextPackage?.mode),
    ),
    contextPackage,
    memoryPolicy,
    modelOptions: normalizeModelOptions(state.modelOptions),
    selectedProviderId: selected.providerId,
    selectedModel: selected.model,
    messages: buildWidgetMessages(state),
    imageContext: buildImageContext(state),
    streamMode: 'visual-reveal',
    updatedAt: Date.now(),
  }
}

function buildWidgetHostActions(state = {}) {
  if (normalizeText(state.status) !== 'error') return []

  const errorCode = normalizeText(state.errorCode)
  if (errorCode === 'PERMISSION_DENIED') {
    return [
      {
        id: OPEN_PLUGIN_PERMISSIONS_ACTION_ID,
        type: 'navigate',
        label: '检查插件权限',
        primary: false,
        payload: { path: PLUGIN_PERMISSIONS_PATH },
      },
    ]
  }
  if (!INTELLIGENCE_SETTINGS_RECOVERY_CODES.has(errorCode)) return []

  return [
    {
      id: OPEN_INTELLIGENCE_SETTINGS_ACTION_ID,
      type: 'navigate',
      label: '检查 AI 渠道',
      primary: false,
      payload: { path: INTELLIGENCE_SETTINGS_PATH },
    },
  ]
}

function resolveWidgetAction(state = {}) {
  const contextPackage = cloneMetadataRecord(state.contextPackage)
  const memoryPolicy = cloneMetadataRecord(state.memoryPolicy)
  const status = normalizeText(state.status)
  if (status === 'ready-to-send') {
    return {
      actionId: 'send',
      payload: {
        prompt: state.prompt,
        draftId: state.draftId,
        inputKinds: state.inputKinds,
        selectedProviderId: state.selectedProviderId,
        selectedModel: state.selectedModel,
      },
    }
  }
  if (status === 'ready' || (status === 'cancelled' && normalizeText(state.answer))) {
    return {
      actionId: 'copy-answer',
      payload: {
        prompt: state.prompt,
        requestId: state.requestId,
        answer: state.answer,
        provider: state.provider,
        model: state.model,
        traceId: state.traceId,
        latency: state.latency,
        handoffSessionId: state.handoffSessionId,
        inputKinds: state.inputKinds,
        contextPackage,
        memoryPolicy,
        selectedProviderId: state.selectedProviderId,
        selectedModel: state.selectedModel,
      },
    }
  }
  if (status === 'error') {
    return {
      actionId: 'retry',
      payload: {
        prompt: state.prompt,
        history: cloneHistory(state.history),
        draftId: state.draftId,
        inputKinds: state.inputKinds,
        errorCode: state.errorCode,
        errorMessage: state.errorMessage,
        errorReason: state.errorReason,
        errorRecovery: state.errorRecovery,
        handoffSessionId: state.handoffSessionId,
        contextPackage,
        memoryPolicy,
        selectedProviderId: state.selectedProviderId,
        selectedModel: state.selectedModel,
      },
    }
  }
  return null
}

function buildWidgetItem(featureId, state = {}) {
  const session = getSession(featureId)
  const aiCommand = resolveAiCommand(featureId)
  const renderState = aiCommand
    ? {
        ...state,
        aiCommandId: aiCommand.id,
        contextMode: 'stateless',
        handoffSessionId: '',
        history: [],
        memoryPolicy: null,
      }
    : state
  const status = normalizeText(renderState.status) || 'idle'
  const prompt = resolveDisplayPrompt(
    renderState.prompt,
    Boolean(renderState.imageDataUrl || renderState.ocrText),
  )
  const commandTitle = aiCommand?.name || '智能问答'
  const title = prompt
    ? `${commandTitle}：${truncateText(prompt, 48)}`
    : commandTitle
  const action = resolveWidgetAction({
    ...renderState,
    prompt: prompt || renderState.prompt,
  })
  const subtitleMap = {
    idle: '等待 AI 输入',
    'ready-to-send': '按回车发送到 AI',
    'ocr-pending': '正在识别剪贴板图片…',
    'chat-pending': 'AI 正在思考…',
    ready: '回答已生成',
    cancelled: '已停止生成',
    error: 'AI 请求失败',
  }

  const builder = new TuffItemBuilder(WIDGET_ITEM_ID)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitleMap[status] || commandTitle)
    .setIcon(ICON)
    .setCustomRender(
      'vue',
      getMakeWidgetId()(
        PLUGIN_NAME,
        customAiCommands.has(featureId) ? DEFAULT_FEATURE_ID : featureId,
      ),
      buildWidgetPayload({
        modelOptions: renderState.modelOptions ?? session.modelOptions,
        selectedProviderId:
          renderState.selectedProviderId ?? session.selectedProviderId,
        selectedModel: renderState.selectedModel ?? session.selectedModel,
        ...renderState,
        prompt: prompt || renderState.prompt,
      }),
    )
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      status,
      keepCoreBoxOpen: true,
      ...(action
        ? {
            defaultAction: ACTION_ID,
            actionId: action.actionId,
            payload: action.payload,
          }
        : {}),
      intelligence: buildIntelligenceMeta({
        status,
        stage: renderState.stage,
        requestId: renderState.requestId,
        capabilityId: renderState.capabilityId,
        provider: renderState.provider,
        model: renderState.model,
        traceId: renderState.traceId,
        latency: renderState.latency,
        inputKinds: renderState.inputKinds,
        errorCode: renderState.errorCode,
        errorMessage: renderState.errorMessage,
        errorReason: renderState.errorReason,
        errorRecovery: renderState.errorRecovery,
        handoffSessionId: renderState.handoffSessionId,
        contextPackage: renderState.contextPackage,
        memoryPolicy: renderState.memoryPolicy,
        selectedProviderId: renderState.selectedProviderId,
        selectedModel: renderState.selectedModel,
      }),
    })

  const hostActions = buildWidgetHostActions(renderState)
  if (hostActions.length > 0) builder.setActions(hostActions)
  return builder.build()
}

async function pushWidgetState(featureId, state = {}) {
  try {
    const session = getSession(featureId)
    const item = buildWidgetItem(featureId, {
      ...state,
      contextMode: normalizeContextMode(state.contextMode, session.contextMode),
    })
    if (
      typeof plugin.feature.getItems === 'function' &&
      typeof plugin.feature.updateItem === 'function'
    ) {
      const items = plugin.feature.getItems()
      if (Array.isArray(items) && items.some(current => current?.id === WIDGET_ITEM_ID)) {
        plugin.feature.updateItem(WIDGET_ITEM_ID, {
          title: item.title,
          subtitle: item.subtitle,
          render: item.render,
          meta: item.meta,
        })
        return item
      }
    }
    plugin.feature.clearItems()
    await plugin.feature.pushItems([item])
    return item
  } catch (error) {
    logger?.warn?.('[touch-intelligence] failed to push widget state', error)
    return null
  }
}

function buildSendItem(featureId, draft) {
  const hasImage = Boolean(draft.imageDataUrl || draft.ocrText)
  const prompt = resolveDisplayPrompt(draft.prompt, hasImage)
  const subtitle = hasImage ? '按回车先 OCR，再发送到 AI' : '按回车发送到 AI'

  return buildInfoItem({
    id: `${featureId}-send`,
    featureId,
    title: prompt,
    subtitle,
    description: buildCapabilitySummary(
      hasImage ? ['vision.ocr', 'text.chat'] : ['text.chat'],
    ),
    accessory: hasImage ? 'OCR + AI' : 'AI Ask',
    actionId: 'send',
    payload: {
      prompt: draft.prompt,
      draftId: draft.draftId,
      inputKinds: draft.inputKinds,
      selectedProviderId: draft.selectedProviderId,
      selectedModel: draft.selectedModel,
    },
    status: 'ready-to-send',
    intelligence: {
      stage: hasImage ? 'ocr' : 'chat',
      capabilities: hasImage ? ['vision.ocr', 'text.chat'] : ['text.chat'],
      inputKinds: draft.inputKinds,
    },
  })
}

function buildPendingItem(
  featureId,
  prompt,
  requestId,
  stage = 'chat',
  handoffSessionId = '',
  context = {},
) {
  const isOcr = stage === 'ocr'
  const capabilityId = isOcr ? 'vision.ocr' : 'text.chat'
  return buildInfoItem({
    id: `${featureId}-${isOcr ? 'ocr-pending' : 'chat-pending'}-${requestId}`,
    featureId,
    title: prompt,
    subtitle: isOcr ? '正在识别剪贴板图片…' : 'AI 正在思考…',
    description: isOcr
      ? '正在调用 vision.ocr，完成后继续 text.chat。'
      : '正在调用 text.chat。',
    accessory: capabilityId,
    status: isOcr ? 'ocr-pending' : 'chat-pending',
    handoffSessionId,
    intelligence: {
      requestId,
      stage,
      capabilityId,
      inputKinds: context.inputKinds,
    },
  })
}

function buildReadyItem(featureId, state) {
  const modelInfo = [state.provider, state.model].filter(Boolean).join(' / ')
  const latencyText = formatLatency(state.latency)
  const handoffText = state.handoffSessionId ? '已接入交接会话' : ''
  const traceText = state.traceId ? `Trace ${state.traceId}` : ''
  const subtitle = [truncateText(state.answer, 72), modelInfo, latencyText]
    .filter(Boolean)
    .join(' · ')
  const description = [traceText, handoffText].filter(Boolean).join(' · ')

  return buildInfoItem({
    id: `${featureId}-ready-${state.requestId}`,
    featureId,
    title: state.prompt || 'AI 回答',
    subtitle: subtitle || '回答已生成',
    description,
    accessory: modelInfo || 'text.chat',
    actionId: 'copy-answer',
    payload: {
      prompt: state.prompt,
      requestId: state.requestId,
      answer: state.answer,
      provider: state.provider,
      model: state.model,
      traceId: state.traceId,
      latency: state.latency,
      handoffSessionId: state.handoffSessionId,
      inputKinds: state.inputKinds,
    },
    status: 'ready',
    handoffSessionId: state.handoffSessionId,
    intelligence: {
      requestId: state.requestId,
      capabilityId: 'text.chat',
      provider: state.provider,
      model: state.model,
      traceId: state.traceId,
      latency: state.latency,
      inputKinds: state.inputKinds,
    },
  })
}

function buildErrorItem(
  featureId,
  prompt,
  error,
  history = [],
  retryContext = {},
) {
  const normalizedError =
    typeof error === 'object' && error?.code && error?.message
      ? error
      : normalizeInvokeError(error)

  return buildInfoItem({
    id: `${featureId}-error-${Date.now()}`,
    featureId,
    title: prompt ? `AI 请求失败：${truncateText(prompt, 48)}` : 'AI 请求失败',
    subtitle: truncateText(normalizedError.message, 120),
    description: buildCapabilitySummary([
      retryContext.capabilityId || 'text.chat',
      normalizedError.code,
    ]),
    accessory: normalizedError.code,
    actionId: 'retry',
    payload: {
      prompt,
      history: cloneHistory(history),
      draftId: retryContext.draftId,
      inputKinds: retryContext.inputKinds,
      ...buildWidgetErrorState(normalizedError),
      handoffSessionId: retryContext.handoffSessionId,
      selectedProviderId: retryContext.selectedProviderId,
      selectedModel: retryContext.selectedModel,
    },
    status: 'error',
    handoffSessionId: retryContext.handoffSessionId,
    intelligence: {
      stage: 'error',
      capabilityId: retryContext.capabilityId || 'text.chat',
      inputKinds: retryContext.inputKinds,
      ...buildWidgetErrorState(normalizedError),
    },
  })
}

function getQueryInputs(query) {
  if (!query || typeof query !== 'object' || !Array.isArray(query.inputs))
    return []
  return query.inputs
}

function extractAttachedText(query) {
  const attachedInput = getQueryInputs(query).find(input => {
    return (
      (input?.type === INPUT_TYPE_TEXT || input?.type === INPUT_TYPE_HTML) &&
      typeof input?.content === 'string' &&
      normalizeText(input.content)
    )
  })
  return normalizeText(attachedInput?.content)
}

function extractEntrypointContext(query) {
  const entrypoint =
    query && typeof query === 'object' ? query.context?.entrypoint : null
  const execution = entrypoint?.execution
  const id = normalizeText(entrypoint?.id)
  const mode = normalizeContextMode(execution?.mode, '')
  const owner = normalizeContextOwner(execution?.owner, '')
  if (!id || !mode || !owner) {
    return null
  }

  const scope = normalizeContextScope(execution?.scope, '')
  const tokenBudget = Number(execution?.tokenBudget)
  return {
    id,
    source: normalizeText(entrypoint?.source),
    execution: {
      mode,
      owner,
      ...(scope ? { scope } : {}),
      ...(normalizeText(execution?.sessionId)
        ? { sessionId: normalizeText(execution.sessionId) }
        : {}),
      ...(normalizeText(execution?.objective)
        ? { objective: normalizeText(execution.objective) }
        : {}),
      ...(Number.isFinite(tokenBudget) && tokenBudget > 0
        ? { tokenBudget }
        : {}),
      ...(execution?.isolated === true ? { isolated: true } : {}),
    },
  }
}

function extractImageDataUrl(query) {
  const imageInput = getQueryInputs(query).find(input => {
    return (
      input?.type === INPUT_TYPE_IMAGE &&
      typeof input?.content === 'string' &&
      input.content.startsWith('data:image/')
    )
  })
  return imageInput?.content || ''
}

function extractInputKinds(query) {
  const inputKinds = new Set()
  if (normalizeText(getQueryText(query))) inputKinds.add(INPUT_TYPE_TEXT)

  for (const input of getQueryInputs(query)) {
    if (typeof input?.type === 'string' && input.type.trim()) {
      inputKinds.add(input.type.trim())
    }
  }

  return Array.from(inputKinds)
}

function extractQueryContext(query, options = {}) {
  const rawText = getQueryText(query)
  const prompt = normalizePrompt(rawText)
  const imageDataUrl = extractImageDataUrl(query)
  const isExplicitAiQuery = hasAiPrefix(rawText)
  const forceImageOcr = options?.forceImageOcr === true
  const shouldUseOcr = Boolean(
    imageDataUrl && prompt && (isExplicitAiQuery || forceImageOcr),
  )
  const shouldShowEntry = Boolean(prompt || shouldUseOcr)

  return {
    rawText,
    prompt,
    imageDataUrl: shouldUseOcr ? imageDataUrl : '',
    inputKinds: extractInputKinds(query),
    entrypointContext: extractEntrypointContext(query),
    shouldShowEntry,
  }
}

function storeDraft(session, draft) {
  const selected = normalizeModelSelection({
    providerId: draft.selectedProviderId ?? session.selectedProviderId,
    model: draft.selectedModel ?? session.selectedModel,
  })
  const draftId = draft.draftId || crypto.randomUUID()
  const normalizedDraft = {
    draftId,
    prompt: normalizePrompt(draft.prompt),
    imageDataUrl: normalizeText(draft.imageDataUrl),
    ocrText: normalizeText(draft.ocrText),
    inputKinds: Array.isArray(draft.inputKinds)
      ? draft.inputKinds.filter(Boolean)
      : [],
    entrypointContext: cloneMetadataRecord(draft.entrypointContext),
    selectedProviderId: selected.providerId,
    selectedModel: selected.model,
  }
  session.drafts.set(draftId, normalizedDraft)

  while (session.drafts.size > MAX_DRAFTS) {
    const firstKey = session.drafts.keys().next().value
    session.drafts.delete(firstKey)
  }

  return normalizedDraft
}

function resolveDraft(session, payload, prompt) {
  const draftId = normalizeText(payload?.draftId)
  if (draftId && session.drafts.has(draftId)) {
    return session.drafts.get(draftId)
  }

  return storeDraft(session, {
    draftId,
    prompt,
    inputKinds: Array.isArray(payload?.inputKinds) ? payload.inputKinds : [],
    selectedProviderId: payload?.selectedProviderId,
    selectedModel: payload?.selectedModel,
  })
}

function normalizeModelOptions(values) {
  if (!Array.isArray(values)) return []

  return values
    .map(option => {
      const providerId = normalizeText(option?.providerId)
      const providerName = normalizeText(option?.providerName) || providerId
      const providerType = normalizeText(option?.providerType)
      const defaultModel = normalizeText(option?.defaultModel)
      const models = normalizeStringList(option?.models)
      if (!providerId || !models.length || option?.available !== true)
        return null
      return {
        providerId,
        providerName,
        providerType,
        models,
        defaultModel,
        capabilities: normalizeStringList(option?.capabilities),
        available: true,
      }
    })
    .filter(Boolean)
}

function resolveAvailableModelSelection(options, selection = {}) {
  const normalized = normalizeModelSelection(selection)
  if (!normalized.providerId || !normalized.model) {
    return normalized
  }

  const isAvailable = options.some(
    option =>
      option.providerId === normalized.providerId &&
      option.models.includes(normalized.model),
  )
  return isAvailable ? normalized : { providerId: '', model: '' }
}

async function resolveModelOptions(client) {
  if (!client?.getProviderModelOptions) return null
  try {
    return normalizeModelOptions(
      await client.getProviderModelOptions({ capabilityId: 'text.chat' }),
    )
  } catch (error) {
    logger?.warn?.('[touch-intelligence] failed to load model options', error)
    return null
  }
}

async function refreshSessionModelOptions(session, client) {
  const options = await resolveModelOptions(client)
  if (options === null) {
    return session.modelOptions
  }

  session.modelOptions = options
  const selected = resolveAvailableModelSelection(options, {
    providerId: session.selectedProviderId,
    model: session.selectedModel,
  })
  session.selectedProviderId = selected.providerId
  session.selectedModel = selected.model
  return session.modelOptions
}

async function dispatchPrompt({
  featureId,
  prompt,
  requestId,
  historySnapshot,
  imageDataUrl,
  ocrText,
  inputKinds,
  draftId,
  selectedProviderId,
  selectedModel,
  entrypointContext,
}) {
  const resolvedFeatureId = resolveFeatureId(featureId)
  const aiCommand = resolveAiCommand(resolvedFeatureId)
  const normalizedPrompt = normalizeFeaturePrompt(resolvedFeatureId, prompt)
  const session = getSession(resolvedFeatureId)
  const isolatedEntrypoint =
    Boolean(aiCommand) || entrypointContext?.execution?.isolated === true
  let resolvedHistory = isolatedEntrypoint ? [] : cloneHistory(historySnapshot)
  let resolvedOcrText = normalizeText(ocrText)
  let selected = normalizeModelSelection({
    providerId: selectedProviderId,
    model: selectedModel,
  })
  const displayPrompt = resolveDisplayPrompt(
    normalizedPrompt,
    Boolean(imageDataUrl || resolvedOcrText),
  )
  let contextPackage = null
  let memoryPolicy = null

  if (!displayPrompt) return

  try {
    if (!canCommitResponse(session, requestId)) return
    const client = resolveIntelligenceClient()
    const modelOptions = await refreshSessionModelOptions(session, client)
    if (!canCommitResponse(session, requestId)) return
    selected = resolveAvailableModelSelection(modelOptions, selected)
    const handoffSessionId = isolatedEntrypoint
      ? ''
      : await ensureHandoffSession(client, session, {
          featureId: resolvedFeatureId,
          prompt: displayPrompt,
          history: resolvedHistory,
          requestId,
          inputKinds,
        })
    if (!canCommitResponse(session, requestId)) return
    if (
      !isolatedEntrypoint &&
      session.history.length > resolvedHistory.length
    ) {
      resolvedHistory = cloneHistory(session.history)
    }

    if (imageDataUrl && !resolvedOcrText) {
      const ocrPayload = buildOcrPayload(imageDataUrl)
      const ocrResult = await client.invoke(
        'vision.ocr',
        ocrPayload,
        buildInvokeOptions({
          featureId: resolvedFeatureId,
          requestId,
          capabilityId: 'vision.ocr',
          inputKinds,
          sessionId: handoffSessionId,
          contextPackage,
          memoryPolicy,
        }),
      )
      resolvedOcrText = normalizeText(ocrResult?.result?.text)

      if (!resolvedOcrText) {
        throw createPluginError('OCR_EMPTY')
      }

      if (!canCommitResponse(session, requestId)) return

      if (draftId && session.drafts.has(draftId)) {
        storeDraft(session, {
          draftId,
          prompt: normalizedPrompt,
          ocrText: resolvedOcrText,
          inputKinds,
          entrypointContext,
          selectedProviderId: selected.providerId,
          selectedModel: selected.model,
        })
      }

      await pushWidgetState(resolvedFeatureId, {
        prompt: displayPrompt,
        requestId,
        status: 'chat-pending',
        stage: 'chat',
        capabilityId: 'text.chat',
        handoffSessionId,
        inputKinds,
        imageDataUrl,
        ocrText: resolvedOcrText,
        history: resolvedHistory,
        modelOptions,
        selectedProviderId: selected.providerId,
        selectedModel: selected.model,
        contextPackage,
        memoryPolicy,
      })
    }

    const chatPrompt = normalizedPrompt || '请总结剪贴板图片中的文字。'
    const effectiveInput = buildUserMessageContent(chatPrompt, {
      ocrText: resolvedOcrText,
    })
    const payload = buildInvokePayload(chatPrompt, resolvedHistory, {
      ocrText: resolvedOcrText,
    })
    const invokeOptions = buildModelSelectionInvokeOptions(
      buildAiCommandInvokeOptions(
        resolvedFeatureId,
        buildInvokeOptions({
          featureId: resolvedFeatureId,
          requestId,
          capabilityId: 'text.chat',
          inputKinds,
          sessionId: handoffSessionId,
          contextPackage,
          memoryPolicy,
        }),
      ),
      selected,
    )
    const contextRequest = buildContextExecutionRequest({
      featureId: resolvedFeatureId,
      requestId,
      input: effectiveInput,
      displayPrompt,
      payload,
      invokeOptions,
      session,
      entrypointContext,
      forceStateless: Boolean(aiCommand),
    })
    const streamed = await streamChatAnswer({
      client,
      featureId: resolvedFeatureId,
      requestId,
      contextRequest,
      displayPrompt,
      handoffSessionId,
      inputKinds,
      imageDataUrl,
      ocrText: resolvedOcrText,
      history: resolvedHistory,
      session,
      selectedProviderId: selected.providerId,
      selectedModel: selected.model,
      modelOptions,
      contextPackage,
      memoryPolicy,
    })
    if (!canCommitResponse(session, requestId)) return

    let mapped = streamed
    if (!mapped && typeof client?.contextInvoke === 'function') {
      const execution = await client.contextInvoke(contextRequest)
      contextPackage = summarizeContextPackage(execution?.context)
      mapped = mapInvokeResult(
        execution?.invocation,
        displayPrompt,
        requestId,
        handoffSessionId,
        inputKinds,
        contextPackage,
        memoryPolicy,
      )
    }
    if (!mapped) {
      const currentOnlyPayload = buildInvokePayload(chatPrompt, [], {
        ocrText: resolvedOcrText,
      })
      mapped = mapInvokeResult(
        await client.invoke('text.chat', currentOnlyPayload, invokeOptions),
        displayPrompt,
        requestId,
        handoffSessionId,
        inputKinds,
        contextPackage,
        memoryPolicy,
      )
    }

    contextPackage = mapped.contextPackage || contextPackage
    if (
      !isolatedEntrypoint &&
      contextPackage?.sessionId &&
      contextRequest.context.mode !== 'stateless'
    ) {
      session.contextSessionId = contextPackage.sessionId
      session.contextMode = 'continue'
    }
    memoryPolicy = aiCommand
      ? null
      : await evaluateMemoryPolicyForAsk(client, {
          prompt: displayPrompt,
          contextState: contextPackage,
        })
    mapped.memoryPolicy = memoryPolicy

    if (!mapped.answer) {
      throw createPluginError('EMPTY_RESPONSE')
    }

    if (!canCommitResponse(session, requestId)) return

    if (!isolatedEntrypoint) {
      session.history = keepNewestBusinessMessages([
        ...resolvedHistory,
        { role: 'user', content: displayPrompt },
        { role: 'assistant', content: mapped.answer },
      ])
      await saveStoredHistory(resolvedFeatureId, session.history)
      await updateHandoffSession(client, session, {
        featureId: resolvedFeatureId,
        prompt: displayPrompt,
        history: resolvedHistory,
        answer: mapped.answer,
        requestId,
        inputKinds,
      })
    }
    session.activeRequestId = ''
    session.uiRequestId = requestId
    session.lastReadyDraftId = ''
    session.lastReadyPromptKey = ''

    await pushWidgetState(resolvedFeatureId, {
      ...mapped,
      status: 'ready',
      stage: 'chat',
      capabilityId: 'text.chat',
      imageDataUrl,
      ocrText: resolvedOcrText,
      history: resolvedHistory,
      modelOptions,
      selectedProviderId: selected.providerId,
      selectedModel: selected.model,
      contextPackage,
      memoryPolicy,
    })
  } catch (error) {
    if (!canCommitResponse(session, requestId)) return

    session.activeRequestId = ''
    session.uiRequestId = requestId
    session.lastReadyDraftId = ''
    session.lastReadyPromptKey = ''
    const normalizedError = normalizeInvokeError(error)
    logger?.error?.('[touch-intelligence] invoke failed', error)
    await pushWidgetState(resolvedFeatureId, {
      prompt: displayPrompt,
      requestId,
      status: 'error',
      stage: 'error',
      capabilityId:
        imageDataUrl && !resolvedOcrText ? 'vision.ocr' : 'text.chat',
      inputKinds,
      imageDataUrl,
      ocrText: resolvedOcrText,
      ...buildWidgetErrorState(normalizedError),
      handoffSessionId: session.handoffSessionId,
      history: resolvedHistory,
      modelOptions: session.modelOptions,
      selectedProviderId: selected.providerId,
      selectedModel: selected.model,
      contextPackage: contextPackage ?? null,
      memoryPolicy: memoryPolicy ?? null,
    })
  }
}

async function copyAnswer(answer) {
  if (!clipboard?.writeText) return false

  const canCopy = await ensurePermission(
    'clipboard.write',
    '需要剪贴板权限以复制 AI 回答',
  )
  if (!canCopy) return false

  try {
    await clipboard.writeText(answer)
    return true
  } catch (error) {
    logger?.warn?.('[touch-intelligence] failed to copy answer', error)
    return false
  }
}

function normalizeReplaceAnswerFailure(error) {
  const code = normalizeText(error?.code || error?.result?.code)
  const fallbackMessage = normalizeText(error?.message)

  if (code === 'MACOS_AUTOMATION_PERMISSION_DENIED') {
    return {
      success: false,
      code,
      message: '替换失败：未授予 macOS 自动化权限',
      recovery:
        '请在系统设置 > 隐私与安全性 > 自动化中允许 Talex Touch 控制当前应用后重试。',
    }
  }
  if (code === 'PERMISSION_DENIED') {
    return {
      success: false,
      code,
      message: '替换失败：缺少 clipboard.write 权限',
      recovery: '请在插件权限中允许 clipboard.write 后重试。',
    }
  }
  if (code === 'SDK_UNAVAILABLE') {
    return {
      success: false,
      code,
      message: '替换失败：当前宿主不支持自动粘贴',
      recovery: '请升级 Talex Touch 后重试，或先使用“复制回答”。',
    }
  }

  return {
    success: false,
    code: code || 'AUTO_PASTE_FAILED',
    message: fallbackMessage || '替换失败：无法将回答粘贴到当前应用',
    recovery: '请确认原应用仍可输入，并检查系统自动化权限后重试。',
  }
}

async function replaceAnswer(answer) {
  if (!clipboard?.copyAndPaste) {
    return normalizeReplaceAnswerFailure({ code: 'SDK_UNAVAILABLE' })
  }

  const canReplace = await ensurePermission(
    'clipboard.write',
    '需要剪贴板权限以替换选中文本',
  )
  if (!canReplace) {
    return normalizeReplaceAnswerFailure({ code: 'PERMISSION_DENIED' })
  }

  try {
    const replaced = await clipboard.copyAndPaste({
      text: answer,
      hideCoreBox: true,
    })
    return replaced
      ? { success: true }
      : normalizeReplaceAnswerFailure({ code: 'AUTO_PASTE_FAILED' })
  } catch (error) {
    logger?.warn?.('[touch-intelligence] failed to replace selection', error)
    return normalizeReplaceAnswerFailure(error)
  }
}

const pluginLifecycle = {
  async onInit() {
    const result = await reloadCustomAiCommands()
    logger?.info?.(
      `[touch-intelligence] custom AI Commands: ${result.registeredCount} registered, ${result.rejectedCount} skipped`,
    )
  },

  async onFeatureTriggered(featureId, query) {
    try {
      const resolvedFeatureId = resolveFeatureId(featureId)
      supersedeAllActiveRequests()
      if (resolvedFeatureId === CUSTOM_AI_COMMAND_REGISTRY_FEATURE_ID) {
        await pushCustomAiCommandRegistryState()
        return true
      }
      const session = getSession(resolvedFeatureId)
      const aiCommand = resolveAiCommand(resolvedFeatureId)
      const commandStateless = Boolean(aiCommand)
      const queryContext = {
        ...extractQueryContext(query, {
          forceImageOcr: resolvedFeatureId === DEFAULT_FEATURE_ID,
        }),
      }
      const explicitPrompt = normalizeFeaturePrompt(
        resolvedFeatureId,
        queryContext.prompt,
      )
      queryContext.prompt =
        explicitPrompt || (commandStateless ? extractAttachedText(query) : '')
      queryContext.shouldShowEntry = Boolean(
        queryContext.prompt || queryContext.imageDataUrl,
      )
      if (!commandStateless) {
        const storedHistory = await loadStoredHistory(resolvedFeatureId)
        if (storedHistory.length > session.history.length) {
          session.history = storedHistory
        }
      }

      if (!queryContext.shouldShowEntry) {
        const client = resolveIntelligenceClient()
        await refreshSessionModelOptions(session, client)
        session.lastReadyDraftId = ''
        session.lastReadyPromptKey = ''
        await pushWidgetState(resolvedFeatureId, {
          status: 'idle',
          stage: 'chat',
          capabilityId: 'text.chat',
          history: commandStateless ? [] : cloneHistory(session.history),
          handoffSessionId: commandStateless ? '' : session.handoffSessionId,
          modelOptions: session.modelOptions,
          selectedProviderId: session.selectedProviderId,
          selectedModel: session.selectedModel,
        })
        return true
      }

      const draft = storeDraft(session, queryContext)
      const displayPrompt = resolveDisplayPrompt(
        draft.prompt,
        Boolean(draft.imageDataUrl || draft.ocrText),
      )
      if (!displayPrompt) return true

      const hasPermission = await ensurePermission(
        'intelligence.basic',
        '需要 AI 权限以执行智能问答',
      )
      if (!hasPermission) {
        const normalizedError = normalizeInvokeError(
          createPluginError('PERMISSION_DENIED'),
        )
        await pushWidgetState(resolvedFeatureId, {
          ...draft,
          prompt: displayPrompt,
          status: 'error',
          stage: 'error',
          ...buildWidgetErrorState(normalizedError),
          handoffSessionId: commandStateless ? '' : session.handoffSessionId,
          history: commandStateless ? [] : cloneHistory(session.history),
        })
        return true
      }

      const requestId = crypto.randomUUID()
      markPendingRequest(session, requestId)
      session.lastReadyDraftId = ''
      session.lastReadyPromptKey = ''
      await pushWidgetState(resolvedFeatureId, {
        ...draft,
        prompt: displayPrompt,
        requestId,
        status: draft.imageDataUrl ? 'ocr-pending' : 'chat-pending',
        stage: draft.imageDataUrl ? 'ocr' : 'chat',
        capabilityId: draft.imageDataUrl ? 'vision.ocr' : 'text.chat',
        handoffSessionId:
          commandStateless || draft.entrypointContext?.execution?.isolated
            ? ''
            : session.handoffSessionId,
        history:
          commandStateless || draft.entrypointContext?.execution?.isolated
            ? []
            : cloneHistory(session.history),
        modelOptions: session.modelOptions,
      })
      void dispatchPrompt({
        featureId: resolvedFeatureId,
        prompt: draft.prompt,
        requestId,
        historySnapshot: commandStateless ? [] : cloneHistory(session.history),
        imageDataUrl: draft.imageDataUrl,
        ocrText: draft.ocrText,
        inputKinds: draft.inputKinds,
        draftId: draft.draftId,
        selectedProviderId: draft.selectedProviderId,
        selectedModel: draft.selectedModel,
        entrypointContext: draft.entrypointContext,
      })
      return true
    } catch (error) {
      const normalizedError = normalizeInvokeError(error)
      logger?.error?.('[touch-intelligence] Failed to handle feature', error)
      await pushWidgetState(featureId, {
        status: 'error',
        stage: 'error',
        ...buildWidgetErrorState(normalizedError),
      })
      return true
    }
  },

  async onItemAction(item, context = {}) {
    try {
      const actionId = context?.actionId || item?.meta?.actionId
      const actionFeatureId = normalizeText(item?.meta?.featureId)
      const isWidgetHostAction =
        (isKnownIntelligenceFeature(actionFeatureId) ||
          actionFeatureId === CUSTOM_AI_COMMAND_REGISTRY_FEATURE_ID) &&
        Boolean(actionId)
      if (item?.meta?.defaultAction !== ACTION_ID && !isWidgetHostAction) return
      const payload = item.meta?.payload || {}
      const prompt = normalizePrompt(payload.prompt)
      const featureId = resolveFeatureId(item.meta?.featureId)
      if (featureId === CUSTOM_AI_COMMAND_REGISTRY_FEATURE_ID) {
        if (actionId === 'open-custom-ai-command-folder') {
          await plugin.storage?.openFolder?.()
          return { externalAction: true, status: 'started' }
        }

        let result = null
        let successMessage = ''
        if (actionId === 'reload-custom-ai-commands') {
          result = await reloadCustomAiCommands()
          successMessage = '配置已重新加载。'
        } else if (actionId === 'save-custom-ai-command') {
          result = await upsertCustomAiCommand(payload)
          successMessage = '命令已保存并生效。'
        } else if (actionId === 'delete-custom-ai-command') {
          result = await deleteCustomAiCommand(payload.commandId)
          successMessage = '命令已删除。'
        } else if (actionId === 'import-custom-ai-commands') {
          result = await commitCustomAiCommandDocument(payload.document)
          successMessage = '命令配置已导入并生效。'
        }

        if (result) {
          await pushCustomAiCommandRegistryState({
            result,
            operationStatus: result.applied ? 'ready' : 'error',
            operationMessage: result.applied
              ? successMessage
              : `操作失败：${result.reason || 'invalid-config'}`,
          })
          return {
            externalAction: true,
            status: result.applied ? 'started' : 'blocked',
            reason: result.applied
              ? undefined
              : result.reason || 'invalid-config',
          }
        }
        return
      }
      const commandStateless = Boolean(resolveAiCommand(featureId))
      const session = getSession(featureId)

      if (actionId === 'cancel-request') {
        const requestId = normalizeText(payload.requestId)
        if (!requestId || session.activeRequestId !== requestId) {
          return {
            externalAction: true,
            success: false,
            status: 'ignored',
            reason: 'stale-request',
          }
        }

        supersedeActiveRequest(session)
        await pushWidgetState(featureId, {
          prompt,
          requestId,
          answer: normalizeText(payload.answer),
          provider: payload.provider,
          model: payload.model,
          traceId: payload.traceId,
          latency: payload.latency,
          status: 'cancelled',
          stage:
            normalizeText(payload.stage) ||
            (normalizeText(payload.status) === 'ocr-pending' ? 'ocr' : 'chat'),
          capabilityId: normalizeText(payload.capabilityId) || 'text.chat',
          handoffSessionId: commandStateless ? '' : session.handoffSessionId,
          inputKinds: Array.isArray(payload.inputKinds) ? payload.inputKinds : [],
          imageDataUrl: payload.imageDataUrl,
          ocrText: payload.ocrText,
          history: cloneHistory(session.history),
          modelOptions: session.modelOptions,
          selectedProviderId: session.selectedProviderId,
          selectedModel: session.selectedModel,
          contextMode: session.contextMode,
          contextPackage: payload.contextPackage,
        })
        return {
          externalAction: true,
          success: true,
          status: 'cancelled',
          message: '已停止生成',
        }
      }

      if (actionId === 'copy-answer') {
        const answer = normalizeText(payload.answer)
        if (!answer) return

        const copied = await copyAnswer(answer)
        if (!copied) {
          const failedItem = await pushWidgetState(featureId, {
            prompt,
            answer,
            provider: payload.provider,
            model: payload.model,
            traceId: payload.traceId,
            latency: payload.latency,
            handoffSessionId: payload.handoffSessionId,
            inputKinds: payload.inputKinds,
            status: 'ready',
            stage: 'chat',
            capabilityId: 'text.chat',
            copyStatus: 'failed',
            copyError: '复制失败：缺少 clipboard.write 权限',
            copyRecovery: '请在插件权限中允许 clipboard.write 后重试。',
            history: cloneHistory(session.history),
            modelOptions: session.modelOptions,
            selectedProviderId: payload.selectedProviderId,
            selectedModel: payload.selectedModel,
            contextPackage: payload.contextPackage,
          })
          return {
            externalAction: true,
            success: false,
            shouldActivate: Boolean(failedItem),
            activation: failedItem
              ? {
                  id: SOURCE_ID,
                  meta: {
                    pluginName: PLUGIN_NAME,
                    featureId,
                    feature: failedItem,
                  },
                  hideResults: false,
                  showInput: true,
                  forceMax: true,
                }
              : undefined,
            status: 'blocked',
            reason: 'permission-denied',
            message: '复制失败：缺少 clipboard.write 权限',
          }
        }

        return { externalAction: true, status: 'started' }
      }

      if (actionId === 'replace-answer') {
        const answer = normalizeText(payload.answer)
        if (!answer) return

        const replacement = await replaceAnswer(answer)
        if (!replacement.success) {
          const failedItem = await pushWidgetState(featureId, {
            prompt,
            answer,
            provider: payload.provider,
            model: payload.model,
            traceId: payload.traceId,
            latency: payload.latency,
            handoffSessionId: payload.handoffSessionId,
            inputKinds: payload.inputKinds,
            status: 'ready',
            stage: 'chat',
            capabilityId: 'text.chat',
            replaceStatus: 'failed',
            replaceError: replacement.message,
            replaceRecovery: replacement.recovery,
            history: cloneHistory(session.history),
            modelOptions: session.modelOptions,
            selectedProviderId: payload.selectedProviderId,
            selectedModel: payload.selectedModel,
            contextPackage: payload.contextPackage,
          })
          return {
            externalAction: true,
            success: false,
            shouldActivate: Boolean(failedItem),
            activation: failedItem
              ? {
                  id: SOURCE_ID,
                  meta: {
                    pluginName: PLUGIN_NAME,
                    featureId,
                    feature: failedItem,
                  },
                  hideResults: false,
                  showInput: true,
                  forceMax: true,
                }
              : undefined,
            status: 'blocked',
            reason: replacement.code,
            message: replacement.message,
          }
        }

        return {
          externalAction: true,
          status: 'started',
          message: '已替换选中文本',
        }
      }

      if (actionId === 'select-context-mode') {
        const nextMode = normalizeContextMode(
          payload.contextMode,
          session.contextMode,
        )
        session.contextMode = nextMode
        if (nextMode === 'new') {
          session.contextSessionId = ''
          session.history = []
          await saveStoredHistory(featureId, [])
        }

        await pushWidgetState(featureId, {
          prompt,
          requestId: payload.requestId,
          answer: payload.answer,
          provider: payload.provider,
          model: payload.model,
          traceId: payload.traceId,
          latency: payload.latency,
          status: normalizeText(payload.status) || 'idle',
          stage: normalizeText(payload.stage) || 'chat',
          capabilityId: normalizeText(payload.capabilityId) || 'text.chat',
          errorCode: payload.errorCode,
          errorMessage: payload.errorMessage,
          copyStatus: payload.copyStatus,
          copyError: payload.copyError,
          copyRecovery: payload.copyRecovery,
          replaceStatus: payload.replaceStatus,
          replaceError: payload.replaceError,
          replaceRecovery: payload.replaceRecovery,
          handoffSessionId: session.handoffSessionId,
          inputKinds: Array.isArray(payload.inputKinds)
            ? payload.inputKinds
            : [],
          imageDataUrl: payload.imageDataUrl,
          ocrText: payload.ocrText,
          history: cloneHistory(session.history),
          modelOptions: session.modelOptions,
          selectedProviderId: session.selectedProviderId,
          selectedModel: session.selectedModel,
          contextMode: nextMode,
          contextPackage:
            nextMode === 'continue' ? payload.contextPackage : null,
        })

        return { externalAction: true }
      }

      if (actionId === 'select-model') {
        const selected = normalizeModelSelection({
          providerId: payload.selectedProviderId,
          model: payload.selectedModel,
        })
        session.selectedProviderId = selected.providerId
        session.selectedModel = selected.model

        const client = resolveIntelligenceClient()
        await refreshSessionModelOptions(session, client)

        await pushWidgetState(featureId, {
          prompt,
          requestId: payload.requestId,
          answer: payload.answer,
          provider: payload.provider,
          model: payload.model,
          traceId: payload.traceId,
          latency: payload.latency,
          status: normalizeText(payload.status) || 'idle',
          stage: normalizeText(payload.stage) || 'chat',
          capabilityId: normalizeText(payload.capabilityId) || 'text.chat',
          errorCode: payload.errorCode,
          errorMessage: payload.errorMessage,
          copyStatus: payload.copyStatus,
          copyError: payload.copyError,
          copyRecovery: payload.copyRecovery,
          replaceStatus: payload.replaceStatus,
          replaceError: payload.replaceError,
          replaceRecovery: payload.replaceRecovery,
          handoffSessionId: session.handoffSessionId,
          inputKinds: Array.isArray(payload.inputKinds)
            ? payload.inputKinds
            : [],
          imageDataUrl: payload.imageDataUrl,
          ocrText: payload.ocrText,
          history: cloneHistory(session.history),
          modelOptions: session.modelOptions,
          selectedProviderId: session.selectedProviderId,
          selectedModel: session.selectedModel,
          contextPackage: payload.contextPackage,
        })

        return { externalAction: true }
      }

      if (actionId === 'send' || actionId === 'retry') {
        const draft = resolveDraft(session, payload, prompt)
        const hasImageContext = Boolean(draft.imageDataUrl || draft.ocrText)
        const displayPrompt = resolveDisplayPrompt(
          draft.prompt,
          hasImageContext,
        )

        if (!displayPrompt) return

        supersedeAllActiveRequests()
        const hasPermission = await ensurePermission(
          'intelligence.basic',
          '需要 AI 权限以执行智能问答',
        )
        if (!hasPermission) {
          const normalizedError = normalizeInvokeError(
            createPluginError('PERMISSION_DENIED'),
          )
          await pushWidgetState(featureId, {
            prompt: displayPrompt,
            status: 'error',
            stage: 'error',
            inputKinds: draft.inputKinds,
            ...buildWidgetErrorState(normalizedError),
            handoffSessionId: commandStateless ? '' : session.handoffSessionId,
          })
          return {
            externalAction: true,
            success: false,
            message: normalizedError.message,
          }
        }

        const historySnapshot =
          commandStateless || draft.entrypointContext?.execution?.isolated
            ? []
            : actionId === 'retry' && Array.isArray(payload.history)
              ? cloneHistory(payload.history)
              : cloneHistory(session.history)

        const requestId = crypto.randomUUID()
        markPendingRequest(session, requestId)
        await pushWidgetState(featureId, {
          prompt: displayPrompt,
          requestId,
          status: draft.imageDataUrl ? 'ocr-pending' : 'chat-pending',
          stage: draft.imageDataUrl ? 'ocr' : 'chat',
          capabilityId: draft.imageDataUrl ? 'vision.ocr' : 'text.chat',
          handoffSessionId:
            commandStateless || draft.entrypointContext?.execution?.isolated
              ? ''
              : session.handoffSessionId,
          inputKinds: draft.inputKinds,
          modelOptions: session.modelOptions,
          selectedProviderId: draft.selectedProviderId,
          selectedModel: draft.selectedModel,
        })
        void dispatchPrompt({
          featureId,
          prompt: draft.prompt,
          requestId,
          historySnapshot,
          imageDataUrl: draft.imageDataUrl,
          ocrText: draft.ocrText,
          inputKinds: draft.inputKinds,
          draftId: draft.draftId,
          selectedProviderId: draft.selectedProviderId,
          selectedModel: draft.selectedModel,
          entrypointContext: draft.entrypointContext,
        })
        return { externalAction: true }
      }
    } catch (error) {
      logger?.error?.('[touch-intelligence] Action failed', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })
    }
  },
}

module.exports = {
  ...pluginLifecycle,
  __test: {
    buildInvokePayload,
    buildInvokeOptions,
    buildAiCommandInvokeOptions,
    buildCustomAiCommandFeature,
    buildCustomAiCommandDocument,
    buildCustomAiCommandRegistryItem,
    getAiCommandStarterPresets,
    commitCustomAiCommandDocument,
    deleteCustomAiCommand,
    loadCustomAiCommandConfig,
    parseCustomAiCommandConfig,
    reloadCustomAiCommands,
    serializeCustomAiCommand,
    upsertCustomAiCommand,
    buildErrorItem,
    buildWidgetItem,
    buildWidgetPayload,
    buildHandoffContext,
    buildContextExecutionRequest,
    buildHandoffSessionId,
    buildIntelligenceMeta,
    buildOcrPayload,
    buildPendingItem,
    buildReadyItem,
    buildSendItem,
    extractEntrypointContext,
    extractImageDataUrl,
    extractInputKinds,
    extractQueryContext,
    formatLatency,
    getAuthState,
    ensureSignedIn,
    mapInvokeResult,
    normalizeInvokeError,
    normalizeLatency,
    normalizeModelOptions,
    normalizeModelSelection,
    normalizePrompt,
    normalizeFeaturePrompt,
    resolveAiCommand,
    isKnownIntelligenceFeature,
    buildModelSelectionInvokeOptions,
    resolveIntelligenceClient,
  },
}
