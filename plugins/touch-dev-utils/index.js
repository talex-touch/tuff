const { plugin, clipboard, logger, TuffItemBuilder } = globalThis
const { randomUUID } = require('node:crypto')

const PLUGIN_NAME = 'touch-dev-utils'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const COPY_ACTION_ID = 'copy'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function truncateText(value, max = 96) {
  const text = normalizeText(value)
  if (!text) {
    return ''
  }
  if (text.length <= max) {
    return text
  }
  return `${text.slice(0, max - 1)}…`
}

function getQueryText(query) {
  if (typeof query === 'string') {
    return query
  }
  return query?.text ?? ''
}

function buildCopyItem({ id, featureId, title, subtitle, output }) {
  return new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: COPY_ACTION_ID,
    })
    .createAndAddAction(COPY_ACTION_ID, 'copy', '复制', output)
    .build()
}

function buildInfoItem({ id, featureId, title, subtitle }) {
  return new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
    })
    .build()
}

function addCopyItem(items, seen, data) {
  const output = String(data.output ?? '')
  if (!output && output !== '0') {
    return
  }
  if (seen.has(output)) {
    return
  }
  seen.add(output)
  items.push(buildCopyItem({ ...data, output }))
}

function splitWords(value) {
  const normalized = normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-\s]+/g, ' ')
  if (!normalized) {
    return []
  }
  return normalized
    .split(' ')
    .map(part => part.trim().toLowerCase())
    .filter(Boolean)
}

function toCamelCase(value) {
  const words = splitWords(value)
  if (!words.length) {
    return ''
  }
  return words
    .map((word, index) => (index === 0 ? word : `${word[0].toUpperCase()}${word.slice(1)}`))
    .join('')
}

function toPascalCase(value) {
  return splitWords(value)
    .map(word => `${word[0]?.toUpperCase() || ''}${word.slice(1)}`)
    .join('')
}

function toSnakeCase(value) {
  return splitWords(value).join('_')
}

function toKebabCase(value) {
  return splitWords(value).join('-')
}

function decodeBase64Url(segment) {
  const normalized = String(segment)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const padding = normalized.length % 4
  const padded = padding === 0 ? normalized : normalized.padEnd(normalized.length + (4 - padding), '=')
  return Buffer.from(padded, 'base64').toString('utf8')
}

function parseJwt(token) {
  const normalized = normalizeText(token)
  const segments = normalized.split('.')
  if (segments.length !== 3) {
    throw new Error('JWT 格式无效')
  }

  return {
    header: JSON.parse(decodeBase64Url(segments[0])),
    payload: JSON.parse(decodeBase64Url(segments[1])),
    signature: segments[2],
  }
}

function formatTimestampDetails(input) {
  const normalized = normalizeText(input)
  if (!/^\d{10,13}$/.test(normalized)) {
    throw new Error('时间戳格式无效')
  }

  const numeric = Number.parseInt(normalized, 10)
  const unixMilliseconds = normalized.length === 10 ? numeric * 1000 : numeric
  const unixSeconds = Math.floor(unixMilliseconds / 1000)
  const date = new Date(unixMilliseconds)

  return {
    unixSeconds,
    unixMilliseconds,
    iso: date.toISOString(),
    local: date.toLocaleString('zh-CN', { hour12: false }),
  }
}

function parseQueryString(input) {
  let normalized = normalizeText(input)
  if (!normalized) {
    return {}
  }

  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    const url = new URL(normalized)
    normalized = url.search
  }

  normalized = normalized.replace(/^[?#&]/, '')
  const params = new URLSearchParams(normalized)
  const result = {}

  for (const [key, value] of params.entries()) {
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      const previous = result[key]
      if (Array.isArray(previous)) {
        previous.push(value)
      }
      else {
        result[key] = [previous, value]
      }
      continue
    }

    result[key] = value
  }

  return result
}

function buildQueryString(input) {
  const params = new URLSearchParams()
  const entries = Object.entries(input || {})

  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        params.append(key, String(item))
      })
      continue
    }
    if (value === undefined || value === null) {
      continue
    }
    params.append(key, String(value))
  }

  return params.toString()
}

function escapeStringLiteral(value) {
  return JSON.stringify(String(value ?? '')).slice(1, -1)
}

function unescapeStringLiteral(value) {
  return JSON.parse(`"${String(value ?? '').replace(/"/g, '\\"')}"`)
}

function isLikelyJwt(value) {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(normalizeText(value))
}

function isLikelyTimestamp(value) {
  return /^\d{10,13}$/.test(normalizeText(value))
}

function isLikelyQueryString(value) {
  const normalized = normalizeText(value)
  return normalized.includes('=') || normalized.startsWith('?') || normalized.startsWith('http://') || normalized.startsWith('https://')
}

function safeParseJson(value) {
  try {
    return JSON.parse(value)
  }
  catch {
    return null
  }
}

function addNowItems(items, seen, featureId) {
  const now = Date.now()
  const details = formatTimestampDetails(String(now))

  addCopyItem(items, seen, {
    id: `${featureId}-uuid`,
    featureId,
    title: 'UUID v4',
    subtitle: '复制随机 UUID',
    output: randomUUID(),
  })
  addCopyItem(items, seen, {
    id: `${featureId}-now-seconds`,
    featureId,
    title: '当前 Unix 秒',
    subtitle: '复制当前时间戳（秒）',
    output: String(details.unixSeconds),
  })
  addCopyItem(items, seen, {
    id: `${featureId}-now-milliseconds`,
    featureId,
    title: '当前 Unix 毫秒',
    subtitle: '复制当前时间戳（毫秒）',
    output: String(details.unixMilliseconds),
  })
  addCopyItem(items, seen, {
    id: `${featureId}-now-iso`,
    featureId,
    title: '当前 ISO 时间',
    subtitle: '复制当前 ISO 8601 时间',
    output: details.iso,
  })
}

function addNamingItems(items, seen, featureId, rawText) {
  if (!/[A-Za-z]/.test(rawText)) {
    return
  }

  addCopyItem(items, seen, {
    id: `${featureId}-camel`,
    featureId,
    title: 'camelCase',
    subtitle: '复制 camelCase 结果',
    output: toCamelCase(rawText),
  })
  addCopyItem(items, seen, {
    id: `${featureId}-pascal`,
    featureId,
    title: 'PascalCase',
    subtitle: '复制 PascalCase 结果',
    output: toPascalCase(rawText),
  })
  addCopyItem(items, seen, {
    id: `${featureId}-snake`,
    featureId,
    title: 'snake_case',
    subtitle: '复制 snake_case 结果',
    output: toSnakeCase(rawText),
  })
  addCopyItem(items, seen, {
    id: `${featureId}-kebab`,
    featureId,
    title: 'kebab-case',
    subtitle: '复制 kebab-case 结果',
    output: toKebabCase(rawText),
  })
}

function addTimestampItems(items, seen, featureId, rawText) {
  if (!isLikelyTimestamp(rawText)) {
    return
  }

  try {
    const details = formatTimestampDetails(rawText)
    addCopyItem(items, seen, {
      id: `${featureId}-timestamp-seconds`,
      featureId,
      title: 'Unix 秒',
      subtitle: '复制标准化秒级时间戳',
      output: String(details.unixSeconds),
    })
    addCopyItem(items, seen, {
      id: `${featureId}-timestamp-milliseconds`,
      featureId,
      title: 'Unix 毫秒',
      subtitle: '复制标准化毫秒时间戳',
      output: String(details.unixMilliseconds),
    })
    addCopyItem(items, seen, {
      id: `${featureId}-timestamp-iso`,
      featureId,
      title: 'ISO 时间',
      subtitle: details.local,
      output: details.iso,
    })
    addCopyItem(items, seen, {
      id: `${featureId}-timestamp-local`,
      featureId,
      title: '本地时间',
      subtitle: '复制本地时间字符串',
      output: details.local,
    })
  }
  catch {
    // ignore invalid timestamp payload
  }
}

function addJwtItems(items, seen, featureId, rawText) {
  if (!isLikelyJwt(rawText)) {
    return
  }

  try {
    const parsed = parseJwt(rawText)
    addCopyItem(items, seen, {
      id: `${featureId}-jwt-header`,
      featureId,
      title: 'JWT Header',
      subtitle: '复制格式化后的 Header',
      output: JSON.stringify(parsed.header, null, 2),
    })
    addCopyItem(items, seen, {
      id: `${featureId}-jwt-payload`,
      featureId,
      title: 'JWT Payload',
      subtitle: '复制格式化后的 Payload',
      output: JSON.stringify(parsed.payload, null, 2),
    })

    if (parsed.payload.exp) {
      addTimestampItems(items, seen, featureId, String(parsed.payload.exp))
    }
  }
  catch (error) {
    items.push(buildInfoItem({
      id: `${featureId}-jwt-invalid`,
      featureId,
      title: 'JWT 解析失败',
      subtitle: truncateText(error instanceof Error ? error.message : '未知错误'),
    }))
  }
}

function addQueryStringItems(items, seen, featureId, rawText) {
  if (isLikelyQueryString(rawText)) {
    try {
      const parsed = parseQueryString(rawText)
      if (Object.keys(parsed).length > 0) {
        addCopyItem(items, seen, {
          id: `${featureId}-query-parse`,
          featureId,
          title: 'Query String → JSON',
          subtitle: '复制格式化后的参数对象',
          output: JSON.stringify(parsed, null, 2),
        })
      }
    }
    catch (error) {
      items.push(buildInfoItem({
        id: `${featureId}-query-invalid`,
        featureId,
        title: 'Query String 解析失败',
        subtitle: truncateText(error instanceof Error ? error.message : '未知错误'),
      }))
    }
  }

  const parsedJson = safeParseJson(rawText)
  if (!parsedJson || Array.isArray(parsedJson) || typeof parsedJson !== 'object') {
    return
  }

  const queryString = buildQueryString(parsedJson)
  if (!queryString) {
    return
  }

  addCopyItem(items, seen, {
    id: `${featureId}-query-build`,
    featureId,
    title: 'JSON → Query String',
    subtitle: '复制组装后的查询字符串',
    output: queryString,
  })
}

function addEscapeItems(items, seen, featureId, rawText) {
  addCopyItem(items, seen, {
    id: `${featureId}-escape`,
    featureId,
    title: '字符串转义',
    subtitle: '复制适合代码字面量的转义文本',
    output: escapeStringLiteral(rawText),
  })

  if (!rawText.includes('\\')) {
    return
  }

  try {
    addCopyItem(items, seen, {
      id: `${featureId}-unescape`,
      featureId,
      title: '字符串反转义',
      subtitle: '复制还原后的原始文本',
      output: unescapeStringLiteral(rawText),
    })
  }
  catch (error) {
    items.push(buildInfoItem({
      id: `${featureId}-unescape-invalid`,
      featureId,
      title: '字符串反转义失败',
      subtitle: truncateText(error instanceof Error ? error.message : '未知错误'),
    }))
  }
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query) {
    try {
      const rawText = normalizeText(getQueryText(query))
      const items = []
      const seen = new Set()

      addNowItems(items, seen, featureId)

      if (!rawText) {
        items.push(buildInfoItem({
          id: `${featureId}-hint`,
          featureId,
          title: '输入文本开始解析',
          subtitle: '支持 JWT、时间戳、命名转换、Query String 和字符串转义',
        }))
        plugin.feature.clearItems()
        plugin.feature.pushItems(items)
        return true
      }

      addTimestampItems(items, seen, featureId, rawText)
      addJwtItems(items, seen, featureId, rawText)
      addNamingItems(items, seen, featureId, rawText)
      addQueryStringItems(items, seen, featureId, rawText)
      addEscapeItems(items, seen, featureId, rawText)

      if (!items.length) {
        items.push(buildInfoItem({
          id: `${featureId}-empty`,
          featureId,
          title: '暂无匹配结果',
          subtitle: '试试输入 JWT、时间戳、查询串或代码风格名称',
        }))
      }

      plugin.feature.clearItems()
      plugin.feature.pushItems(items)
      return true
    }
    catch (error) {
      logger?.error?.('[touch-dev-utils] Failed to process feature', error)
      plugin.feature.clearItems()
      plugin.feature.pushItems([
        buildInfoItem({
          id: `${featureId}-error`,
          featureId,
          title: '加载失败',
          subtitle: truncateText(error?.message || '未知错误', 120),
        }),
      ])
      return true
    }
  },

  async onItemAction(item) {
    try {
      if (item?.meta?.defaultAction !== COPY_ACTION_ID) {
        return
      }

      const copyAction = Array.isArray(item.actions)
        ? item.actions.find(action => action.type === 'copy')
        : null

      if (copyAction?.payload) {
        clipboard.writeText(copyAction.payload)
      }
    }
    catch (error) {
      logger?.error?.('[touch-dev-utils] Action failed', error)
    }
  },
}

module.exports = {
  ...pluginLifecycle,
  __test: {
    buildQueryString,
    escapeStringLiteral,
    formatTimestampDetails,
    parseJwt,
    parseQueryString,
    toCamelCase,
    toKebabCase,
    toPascalCase,
    toSnakeCase,
    unescapeStringLiteral,
  },
}
