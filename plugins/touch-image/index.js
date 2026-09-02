const { plugin, TuffItemBuilder } = globalThis

const PLUGIN_NAME = 'touch-image'
const SOURCE_ID = 'plugin-features'
const FEATURE_ID = 'image-tools'
const TOKEN_PATTERN = /^img_[\w-]{32}$/
const MAX_QUERY_LENGTH = 256
const MAX_DIMENSION = 8192
const MAX_PIXELS = 64_000_000
const MAX_NAME_LENGTH = 160
const MAX_RESULT_BYTES = 64 * 1024 * 1024
const FORMATS = Object.freeze([
  { id: 'image-tools.save-png', format: 'png', label: '导出 PNG', subtitle: '无损 PNG' },
  { id: 'image-tools.save-webp', format: 'webp', label: '导出 WebP', subtitle: 'WebP 图像', supportsQuality: true },
  { id: 'image-tools.save-jpeg', format: 'jpeg', label: '导出 JPEG', subtitle: '白色背景 JPEG', supportsQuality: true },
  { id: 'image-tools.save-ico', format: 'ico', label: '导出 ICO', subtitle: 'PNG 图标集' },
])
const FORMAT_BY_ACTION = new Map(FORMATS.map(format => [format.id, format]))

let issuedActions = new Map()
let triggerGeneration = 0

function hasControlCharacter(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1F || code === 0x7F)
      return true
  }
  return false
}

function text(value, limit = MAX_QUERY_LENGTH) {
  if (typeof value !== 'string')
    return ''
  const normalized = value.trim()
  return hasControlCharacter(normalized) ? '' : normalized.slice(0, limit)
}

function queryText(query) {
  return typeof query === 'string' ? text(query) : text(query?.text ?? query?.query)
}

function imageToken(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query) || !Array.isArray(query.inputs))
    return ''
  const imageInputs = query.inputs.filter(
    input => input && typeof input === 'object' && !Array.isArray(input) && input.type === 'image',
  )
  if (imageInputs.length !== 1)
    return ''
  const token = imageInputs[0]?.content
  return typeof token === 'string' && TOKEN_PATTERN.test(token) ? token : ''
}

function imageInputReason(query) {
  if (!query || typeof query !== 'object' || Array.isArray(query) || !Array.isArray(query.inputs))
    return ''
  const input = query.inputs.find(candidate => candidate?.type === 'image')
  return safeReason(input?.metadata?.reason, '')
}

function parseSettings(query) {
  const value = queryText(query)
  const dimensions = [...value.matchAll(/\b(\d{1,5})\s*[x×]\s*(\d{1,5})\b/gi)]
  const qualities = [...value.matchAll(/\bq(\d{1,3})\b/gi)]
  const hasDimensionMarker = /\d\s*[x×]|[x×]\s*\d/i.test(value)
  const hasQualityMarker = /\bq\d/i.test(value)
  if (
    dimensions.length > 1
    || qualities.length > 1
    || (hasDimensionMarker && dimensions.length !== 1)
    || (hasQualityMarker && qualities.length !== 1)
  ) {
    return { valid: false }
  }

  const width = dimensions.length ? Number(dimensions[0]?.[1]) : undefined
  const height = dimensions.length ? Number(dimensions[0]?.[2]) : undefined
  const quality = qualities.length ? Number(qualities[0]?.[1]) : undefined
  if (
    (width !== undefined && (!Number.isInteger(width) || width < 1 || width > MAX_DIMENSION))
    || (height !== undefined && (!Number.isInteger(height) || height < 1 || height > MAX_DIMENSION))
    || (width !== undefined && height !== undefined && width * height > MAX_PIXELS)
    || (quality !== undefined && (!Number.isInteger(quality) || quality < 1 || quality > 100))
  ) {
    return { valid: false }
  }
  return {
    valid: true,
    ...(width !== undefined ? { width, height } : {}),
    ...(quality !== undefined ? { quality } : {}),
  }
}

function requestFor(format, token, settings) {
  const usesRequestedSize
    = settings.width !== undefined
      && (format.format !== 'ico' || (settings.width === settings.height && settings.width <= 256))
  return {
    token,
    format: format.format,
    ...(usesRequestedSize ? { width: settings.width, height: settings.height } : {}),
    ...(format.supportsQuality && settings.quality !== undefined ? { quality: settings.quality } : {}),
  }
}

function requestKey(actionId, request) {
  return `${actionId}:${request.token}:${request.format}:${request.width ?? ''}:${request.height ?? ''}:${request.quality ?? ''}`
}

function sameRequest(left, right) {
  return (
    left?.token === right?.token
    && left?.format === right?.format
    && left?.width === right?.width
    && left?.height === right?.height
    && left?.quality === right?.quality
  )
}

function validRequest(request, format) {
  if (!request || typeof request !== 'object' || Array.isArray(request))
    return false
  if (!TOKEN_PATTERN.test(request.token) || request.format !== format.format)
    return false
  const expectedKeys = ['format', 'token']
  if (request.width !== undefined || request.height !== undefined) {
    if (!Number.isInteger(request.width) || !Number.isInteger(request.height))
      return false
    if (request.width < 1 || request.width > MAX_DIMENSION || request.height < 1 || request.height > MAX_DIMENSION)
      return false
    if (request.width * request.height > MAX_PIXELS)
      return false
    if (format.format === 'ico' && (request.width !== request.height || request.width > 256))
      return false
    expectedKeys.push('height', 'width')
  }
  if (format.supportsQuality) {
    if (request.quality !== undefined) {
      if (!Number.isInteger(request.quality) || request.quality < 1 || request.quality > 100)
        return false
      expectedKeys.push('quality')
    }
  }
  else if (request.quality !== undefined) {
    return false
  }
  return Object.keys(request).sort().join(',') === expectedKeys.sort().join(',')
}

function buildItem(id, title, subtitle, action) {
  const builder = new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(text(title, 160))
    .setSubtitle(text(subtitle, 240))
    .setIcon({ type: 'file', value: 'assets/logo.svg' })
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId: FEATURE_ID,
      ...(action ? { defaultAction: action.id } : {}),
    })
  if (action)
    builder.createAndAddAction(action.id, 'plugin', action.label, action.payload)
  return builder.build()
}

function infoItem(id, title, subtitle) {
  return buildItem(`image-tools-${id}`, title, subtitle)
}

function exportItems(token, settings, nextActions) {
  return FORMATS.map((format) => {
    const payload = requestFor(format, token, settings)
    const action = { id: format.id, label: format.label, payload }
    nextActions.set(requestKey(action.id, payload), {
      generation: triggerGeneration,
      actionId: action.id,
      request: { ...payload },
    })
    const suffix
      = payload.width === undefined
        ? format.format === 'ico' && settings.width !== undefined
          ? '标准多尺寸图标（ICO 需方形尺寸）'
          : '保持原始尺寸'
        : `${payload.width} × ${payload.height}`
    const quality = format.supportsQuality && settings.quality !== undefined ? ` · 质量 ${settings.quality}` : ''
    return buildItem(`image-tools-${format.format}`, format.label, `${format.subtitle} · ${suffix}${quality}`, action)
  })
}

async function publishItems(items, generation, nextActions = new Map()) {
  if (generation !== triggerGeneration)
    return true
  const feature = plugin?.feature
  if (!feature || typeof feature.clearItems !== 'function' || typeof feature.pushItems !== 'function') {
    issuedActions = new Map()
    return false
  }
  try {
    await feature.clearItems()
    if (generation !== triggerGeneration)
      return true
    await feature.pushItems(items)
    if (generation === triggerGeneration)
      issuedActions = nextActions
    return true
  }
  catch {
    issuedActions = new Map()
    return false
  }
}

function safeReason(value, fallback) {
  const reason = text(value, 80)
  return /^(?:cancelled|permission-denied|permission-unavailable|capability-unavailable|token-invalid|token-expired|source-invalid|source-replaced|source-too-large|source-unsupported|source-animated|output-too-large|dialog-failed|render-failed|write-failed|save-failed|timeout)$/.test(
    reason,
  )
    ? reason
    : fallback
}

function errorResult(error) {
  const code = typeof error?.code === 'string' ? error.code : ''
  if (code === 'PLUGIN_HOST_CAPABILITY_CANCELLED' || code === 'PLUGIN_HOST_REQUEST_CANCELLED') {
    return { externalAction: true, success: false, status: 'cancelled', reason: 'cancelled' }
  }
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED') {
    return { externalAction: true, success: false, status: 'blocked', reason: 'permission-denied' }
  }
  if (
    code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE'
    || code === 'PLUGIN_HOST_CAPABILITY_RUNTIME_UNAVAILABLE'
  ) {
    return { externalAction: true, success: false, status: 'blocked', reason: 'capability-unavailable' }
  }
  return { externalAction: true, success: false, status: 'failed', reason: 'save-failed' }
}

function validSavedResult(result, request) {
  const name = text(result?.name, MAX_NAME_LENGTH)
  return (
    result
    && typeof result === 'object'
    && result.status === 'saved'
    && result.format === request.format
    && name.length > 0
    && !/[\\/]/.test(name)
    && Number.isInteger(result.width)
    && result.width >= 1
    && result.width <= MAX_DIMENSION
    && Number.isInteger(result.height)
    && result.height >= 1
    && result.height <= MAX_DIMENSION
    && Number.isSafeInteger(result.bytes)
    && result.bytes >= 1
    && result.bytes <= MAX_RESULT_BYTES
  )
}

function saveResult(result, request) {
  if (validSavedResult(result, request)) {
    return {
      externalAction: true,
      success: true,
      status: 'saved',
      name: text(result.name, MAX_NAME_LENGTH),
      format: result.format,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
    }
  }
  if (result?.status === 'cancelled') {
    return { externalAction: true, success: false, status: 'cancelled', reason: 'cancelled' }
  }
  if (result?.status === 'blocked') {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: safeReason(result.reason, 'capability-unavailable'),
    }
  }
  if (result?.status === 'failed') {
    return { externalAction: true, success: false, status: 'failed', reason: safeReason(result.reason, 'save-failed') }
  }
  return { externalAction: true, success: false, status: 'failed', reason: 'invalid-response' }
}

const lifecycle = {
  async onInit() {
    triggerGeneration = 0
    issuedActions = new Map()
  },

  async onFeatureTriggered(featureId, query) {
    if (featureId !== FEATURE_ID)
      return false
    const generation = ++triggerGeneration
    issuedActions = new Map()

    const token = imageToken(query)
    if (!token) {
      const reason = imageInputReason(query)
      return await publishItems(
        [
          reason
            ? infoItem('invalid-input', '图片无法处理', reason)
            : infoItem('no-input', '需要一张图片', '请拖入或选择一张已授权的图片'),
        ],
        generation,
      )
    }

    const settings = parseSettings(query)
    if (!settings.valid) {
      return await publishItems(
        [infoItem('invalid-size', '图片导出参数无效', '请使用 1–8192、总计不超过 6400 万像素的 WIDTHxHEIGHT 和 q1–100')],
        generation,
      )
    }

    if (!plugin?.imageTools || typeof plugin.imageTools.save !== 'function') {
      return await publishItems(
        [infoItem('capability-unavailable', '图片导出能力不可用', '请检查图片读取与保存权限后重试')],
        generation,
      )
    }

    try {
      const nextActions = new Map()
      const items = exportItems(token, settings, nextActions)
      return await publishItems(items, generation, nextActions)
    }
    catch {
      return await publishItems([infoItem('error', '图片导出暂不可用', '请稍后重试')], generation)
    }
  },

  async onItemAction(item, context = {}) {
    const actionId = context?.actionId || item?.meta?.defaultAction
    if (
      item?.source?.type !== 'plugin'
      || item.source.id !== SOURCE_ID
      || item.source.name !== PLUGIN_NAME
      || item?.meta?.pluginName !== PLUGIN_NAME
      || item.meta.featureId !== FEATURE_ID
    ) {
      return undefined
    }
    const format = FORMAT_BY_ACTION.get(actionId)
    if (!format) {
      return { externalAction: true, success: false, status: 'blocked', reason: 'invalid-action' }
    }

    const action = Array.isArray(item.actions)
      ? item.actions.find(candidate => candidate?.id === actionId && candidate?.type === 'plugin')
      : undefined
    const request = action?.payload
    if (!validRequest(request, format)) {
      return { externalAction: true, success: false, status: 'blocked', reason: 'invalid-action' }
    }

    const key = requestKey(actionId, request)
    const issued = issuedActions.get(key)
    if (
      !issued
      || issued.generation !== triggerGeneration
      || issued.actionId !== actionId
      || !sameRequest(issued.request, request)
    ) {
      return { externalAction: true, success: false, status: 'blocked', reason: 'invalid-action' }
    }

    const imageTools = plugin?.imageTools
    if (!imageTools || typeof imageTools.save !== 'function') {
      return { externalAction: true, success: false, status: 'blocked', reason: 'capability-unavailable' }
    }

    if (issued.generation !== triggerGeneration || !TOKEN_PATTERN.test(request.token)) {
      return { externalAction: true, success: false, status: 'blocked', reason: 'invalid-action' }
    }

    try {
      return saveResult(await imageTools.save({ ...request }), request)
    }
    catch (error) {
      return errorResult(error)
    }
  },

  onDestroy() {
    triggerGeneration += 1
    issuedActions = new Map()
  },
}

module.exports = lifecycle
