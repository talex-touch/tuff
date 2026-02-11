const { plugin, clipboard, logger, TuffItemBuilder } = globalThis
const crypto = require('node:crypto')

const PLUGIN_NAME = 'touch-text-tools'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const COPY_ACTION_ID = 'copy'
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/

function getQueryText(query) {
  if (typeof query === 'string')
    return query
  return query?.text ?? ''
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function truncateText(value, max = 96) {
  const text = normalizeText(value)
  if (!text)
    return ''
  if (text.length <= max)
    return text
  return `${text.slice(0, max - 1)}…`
}

function isProbablyBase64(text) {
  if (!text)
    return false
  if (text.length % 4 !== 0)
    return false
  return BASE64_PATTERN.test(text)
}

function toTitleCase(text) {
  return text.replace(/\S+/g, (word) => {
    const head = word.charAt(0).toUpperCase()
    const tail = word.slice(1).toLowerCase()
    return `${head}${tail}`
  })
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
  if (!output && output !== '0')
    return
  if (seen.has(output))
    return
  seen.add(output)
  items.push(buildCopyItem({ ...data, output }))
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query, _feature, signal) {
    try {
      const rawText = normalizeText(getQueryText(query))
      if (!rawText.trim()) {
        plugin.feature.clearItems()
        return true
      }

      if (signal?.aborted)
        return true

      const items = []
      const seen = new Set()

      addCopyItem(items, seen, {
        id: `${featureId}-upper`,
        featureId,
        title: '大写',
        subtitle: '复制大写文本',
        output: rawText.toUpperCase(),
      })

      addCopyItem(items, seen, {
        id: `${featureId}-lower`,
        featureId,
        title: '小写',
        subtitle: '复制小写文本',
        output: rawText.toLowerCase(),
      })

      addCopyItem(items, seen, {
        id: `${featureId}-title`,
        featureId,
        title: '首字母大写',
        subtitle: '复制标题化文本',
        output: toTitleCase(rawText),
      })

      addCopyItem(items, seen, {
        id: `${featureId}-strip-space`,
        featureId,
        title: '移除空白',
        subtitle: '移除空格与换行',
        output: rawText.replace(/\s+/g, ''),
      })

      addCopyItem(items, seen, {
        id: `${featureId}-b64-encode`,
        featureId,
        title: 'Base64 编码',
        subtitle: '复制编码后的文本',
        output: Buffer.from(rawText, 'utf8').toString('base64'),
      })

      const base64Candidate = rawText.replace(/\s+/g, '')
      if (isProbablyBase64(base64Candidate)) {
        addCopyItem(items, seen, {
          id: `${featureId}-b64-decode`,
          featureId,
          title: 'Base64 解码',
          subtitle: '复制解码后的文本',
          output: Buffer.from(base64Candidate, 'base64').toString('utf8'),
        })
      }

      addCopyItem(items, seen, {
        id: `${featureId}-url-encode`,
        featureId,
        title: 'URL 编码',
        subtitle: '复制编码后的文本',
        output: encodeURIComponent(rawText),
      })

      if (/%/.test(rawText)) {
        try {
          addCopyItem(items, seen, {
            id: `${featureId}-url-decode`,
            featureId,
            title: 'URL 解码',
            subtitle: '复制解码后的文本',
            output: decodeURIComponent(rawText),
          })
        }
        catch (error) {
          items.push(buildInfoItem({
            id: `${featureId}-url-invalid`,
            featureId,
            title: 'URL 解码',
            subtitle: '输入不是有效的 URL 编码文本',
          }))
        }
      }

      const trimmed = rawText.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed)
          addCopyItem(items, seen, {
            id: `${featureId}-json-pretty`,
            featureId,
            title: 'JSON 美化',
            subtitle: '复制格式化后的 JSON',
            output: JSON.stringify(parsed, null, 2),
          })
          addCopyItem(items, seen, {
            id: `${featureId}-json-minify`,
            featureId,
            title: 'JSON 压缩',
            subtitle: '复制压缩后的 JSON',
            output: JSON.stringify(parsed),
          })
        }
        catch (error) {
          items.push(buildInfoItem({
            id: `${featureId}-json-invalid`,
            featureId,
            title: 'JSON 解析失败',
            subtitle: '输入不是有效的 JSON',
          }))
        }
      }

      addCopyItem(items, seen, {
        id: `${featureId}-md5`,
        featureId,
        title: 'MD5',
        subtitle: '复制 MD5 哈希',
        output: crypto.createHash('md5').update(rawText).digest('hex'),
      })

      addCopyItem(items, seen, {
        id: `${featureId}-sha1`,
        featureId,
        title: 'SHA1',
        subtitle: '复制 SHA1 哈希',
        output: crypto.createHash('sha1').update(rawText).digest('hex'),
      })

      addCopyItem(items, seen, {
        id: `${featureId}-sha256`,
        featureId,
        title: 'SHA256',
        subtitle: '复制 SHA256 哈希',
        output: crypto.createHash('sha256').update(rawText).digest('hex'),
      })

      plugin.feature.clearItems()
      plugin.feature.pushItems(items)
      return true
    }
    catch (error) {
      logger?.error?.('[touch-text-tools] Failed to process feature:', error)
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
      if (item?.meta?.defaultAction !== COPY_ACTION_ID)
        return

      const copyAction = item.actions?.find((action) => action.type === COPY_ACTION_ID)
      if (!copyAction?.payload)
        return

      const payload = copyAction.payload
      const payloadText = typeof payload === 'string' ? payload : payload.text
      if (typeof payloadText !== 'string')
        return

      clipboard.writeText(payloadText)
      logger?.log?.('[touch-text-tools] Copied to clipboard')

      const isFeatureExecution = Boolean(item.meta?.featureId)
      if (!isFeatureExecution)
        plugin.box.hide()
    }
    catch (error) {
      logger?.error?.('[touch-text-tools] Action failed', error)
    }
  },
}

module.exports = {
  ...pluginLifecycle,
  __test: {
    isProbablyBase64,
    toTitleCase,
  },
}
