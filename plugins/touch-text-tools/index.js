const { plugin, clipboard, logger, TuffItemBuilder } = globalThis

const PLUGIN_NAME = 'touch-text-tools'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'class', value: 'i-ri-text' }
const COPY_ACTION_ID = 'copy'
const BASE64_PATTERN = /^[\d+/a-z]+={0,2}$/i
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function getQueryText(query) {
  if (typeof query === 'string')
    return query
  return query?.text ?? ''
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function isProbablyBase64(text) {
  if (!text)
    return false
  if (text.length % 4 !== 0)
    return false
  return BASE64_PATTERN.test(text)
}

function bytesToBase64(value) {
  const bytes = new Uint8Array(value)
  let output = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]
    const hasB = index + 1 < bytes.length
    const hasC = index + 2 < bytes.length
    const b = hasB ? bytes[index + 1] : 0
    const c = hasC ? bytes[index + 2] : 0
    const chunk = (a << 16) | (b << 8) | c
    output += BASE64_ALPHABET[(chunk >>> 18) & 63]
    output += BASE64_ALPHABET[(chunk >>> 12) & 63]
    output += hasB ? BASE64_ALPHABET[(chunk >>> 6) & 63] : '='
    output += hasC ? BASE64_ALPHABET[chunk & 63] : '='
  }
  return output
}

function base64ToBytes(value) {
  const normalized = String(value)
  const bytes = []
  for (let index = 0; index < normalized.length; index += 4) {
    const a = BASE64_ALPHABET.indexOf(normalized[index])
    const b = BASE64_ALPHABET.indexOf(normalized[index + 1])
    const c = normalized[index + 2] === '=' ? 0 : BASE64_ALPHABET.indexOf(normalized[index + 2])
    const d = normalized[index + 3] === '=' ? 0 : BASE64_ALPHABET.indexOf(normalized[index + 3])
    if (a < 0 || b < 0 || c < 0 || d < 0)
      throw new TypeError('INVALID_BASE64')
    const chunk = (a << 18) | (b << 12) | (c << 6) | d
    bytes.push((chunk >>> 16) & 0xFF)
    if (normalized[index + 2] !== '=')
      bytes.push((chunk >>> 8) & 0xFF)
    if (normalized[index + 3] !== '=')
      bytes.push(chunk & 0xFF)
  }
  return Uint8Array.from(bytes)
}

async function digestHex(algorithm, text) {
  if (typeof globalThis.crypto?.digest !== 'function')
    throw new TypeError('CRYPTO_DIGEST_UNAVAILABLE')
  const digest = new Uint8Array(
    await globalThis.crypto.digest(algorithm, new TextEncoder().encode(text)),
  )
  return Array.from(digest, value => value.toString(16).padStart(2, '0')).join('')
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
    .createAndAddAction(COPY_ACTION_ID, 'plugin', '复制', { text: output })
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
        await plugin.feature.clearItems()
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
        output: bytesToBase64(new TextEncoder().encode(rawText)),
      })

      const base64Candidate = rawText.replace(/\s+/g, '')
      if (isProbablyBase64(base64Candidate)) {
        addCopyItem(items, seen, {
          id: `${featureId}-b64-decode`,
          featureId,
          title: 'Base64 解码',
          subtitle: '复制解码后的文本',
          output: new TextDecoder().decode(base64ToBytes(base64Candidate)),
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
        catch {
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
        catch {
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
        output: await digestHex('MD5', rawText),
      })

      addCopyItem(items, seen, {
        id: `${featureId}-sha1`,
        featureId,
        title: 'SHA1',
        subtitle: '复制 SHA1 哈希',
        output: await digestHex('SHA-1', rawText),
      })

      addCopyItem(items, seen, {
        id: `${featureId}-sha256`,
        featureId,
        title: 'SHA256',
        subtitle: '复制 SHA256 哈希',
        output: await digestHex('SHA-256', rawText),
      })

      if (signal?.aborted)
        return true

      await plugin.feature.clearItems()
      await plugin.feature.pushItems(items)
      return true
    }
    catch {
      logger?.error?.('[touch-text-tools] Failed to handle feature')
      try {
        await plugin.feature.clearItems()
        await plugin.feature.pushItems([
          buildInfoItem({
            id: `${featureId}-error`,
            featureId,
            title: '加载失败',
            subtitle: '插件运行失败',
          }),
        ])
        return true
      }
      catch {
        logger?.error?.('[touch-text-tools] Failed to publish fallback')
        return false
      }
    }
  },

  async onItemAction(item) {
    try {
      if (item?.meta?.defaultAction !== COPY_ACTION_ID)
        return

      const copyAction = item.actions?.find(action => action.id === COPY_ACTION_ID || action.type === COPY_ACTION_ID)
      if (!copyAction?.payload)
        return

      const payload = copyAction.payload
      const payloadText = typeof payload === 'string' ? payload : payload.text
      if (typeof payloadText !== 'string')
        return

      if (typeof clipboard?.writeText !== 'function') {
        return {
          externalAction: true,
          success: false,
          status: 'blocked',
          reason: 'clipboard-unavailable',
          message: '当前环境不支持写入剪贴板',
        }
      }

      await clipboard.writeText(payloadText)
      logger?.info?.('[touch-text-tools] Copied to clipboard')
      return { externalAction: true, status: 'started' }
    }
    catch (error) {
      logger?.error?.('[touch-text-tools] Action failed')
      const permissionDenied = error?.code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: permissionDenied ? 'permission-denied' : 'clipboard-write-failed',
        message: permissionDenied ? '缺少 clipboard.write 权限' : '复制失败',
      }
    }
  },
}

module.exports = pluginLifecycle
