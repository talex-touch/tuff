const { plugin, filesystem, logger, TuffItemBuilder, permission } = globalThis

const PLUGIN_NAME = 'touch-batch-rename'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'class', value: 'i-ri-file-edit-line' }
const ACTION_ID = 'batch-rename'
const PREVIEW_LIMIT = 20
const LAST_RENAME_FILE = 'last-rename.json'
const MAX_FILES = 64
const MAX_PATH_LENGTH = 4096
const MAX_QUERY_LENGTH = 4096
const MAX_TARGET_NAME_LENGTH = 255

const previewCacheByFeature = new Map()

function normalizeText(value, maximum = MAX_QUERY_LENGTH) {
  const text = String(value ?? '').trim()
  return text.length <= maximum ? text : text.slice(0, maximum)
}

function getQueryText(query) {
  if (typeof query === 'string')
    return query
  return query && typeof query === 'object' ? (query.text ?? '') : ''
}

function formatNumber(value, length = 2) {
  return String(value).padStart(length, '0')
}

function formatDate(date, pattern) {
  const year = date.getFullYear()
  const month = formatNumber(date.getMonth() + 1)
  const day = formatNumber(date.getDate())
  const hour = formatNumber(date.getHours())
  const minute = formatNumber(date.getMinutes())
  const second = formatNumber(date.getSeconds())

  return pattern
    .replace(/YYYY/g, String(year))
    .replace(/MM/g, String(month))
    .replace(/DD/g, String(day))
    .replace(/HH/g, String(hour))
    .replace(/mm/g, String(minute))
    .replace(/ss/g, String(second))
}

function parseReplaceRule(value) {
  const arrowIndex = value.indexOf('->')
  if (arrowIndex === -1)
    return null
  const from = value.slice(0, arrowIndex)
  const to = value.slice(arrowIndex + 2)
  if (!from || from.length > 128 || to.length > 128)
    return null

  if (from.startsWith('/') && from.lastIndexOf('/') > 0) {
    const lastSlash = from.lastIndexOf('/')
    const pattern = from.slice(1, lastSlash)
    const flags = from.slice(lastSlash + 1)
    if (pattern.length > 96 || !/^[gimuy]*$/.test(flags))
      return null
    try {
      return { type: 'regex', regex: new RegExp(pattern, flags), to }
    }
    catch {
      return null
    }
  }

  return { type: 'text', from, to }
}

function parseRules(text) {
  const tokens = normalizeText(text).split(/\s+/).filter(Boolean).slice(0, 32)
  const rules = {
    prefix: '',
    suffix: '',
    replaces: [],
    seq: null,
    dateFormat: null,
  }

  tokens.forEach((token) => {
    if (token.startsWith('prefix:')) {
      rules.prefix = token.slice(7, 71)
    }
    else if (token.startsWith('suffix:')) {
      rules.suffix = token.slice(7, 71)
    }
    else if (token.startsWith('replace:') && rules.replaces.length < 8) {
      const rule = parseReplaceRule(token.slice(8))
      if (rule)
        rules.replaces.push(rule)
    }
    else if (token.startsWith('seq:')) {
      const parts = token.slice(4).split(':')
      const start = Number(parts[0])
      const pad = Number(parts[1] ?? '1')
      if (Number.isSafeInteger(start)) {
        rules.seq = {
          start,
          pad: Number.isSafeInteger(pad) ? Math.min(12, Math.max(1, pad)) : 1,
        }
      }
    }
    else if (token.startsWith('date:')) {
      const format = token.slice(5, 37) || 'YYYYMMDD'
      rules.dateFormat = format
    }
  })

  return rules
}

function applyRules(baseName, index, rules, now = new Date()) {
  let result = baseName
  rules.replaces.forEach((replaceRule) => {
    if (replaceRule.type === 'regex') {
      result = result.replace(replaceRule.regex, replaceRule.to)
    }
    else {
      result = result.split(replaceRule.from).join(replaceRule.to)
    }
  })

  if (rules.prefix)
    result = `${rules.prefix}${result}`
  if (rules.suffix)
    result = `${result}${rules.suffix}`
  if (rules.dateFormat)
    result = `${result}_${formatDate(now, rules.dateFormat)}`
  if (rules.seq) {
    const padded = String(rules.seq.start + index).padStart(rules.seq.pad, '0')
    result = `${result}_${padded}`
  }
  return result.slice(0, MAX_TARGET_NAME_LENGTH)
}

function splitFilePath(filePath) {
  const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  const directory = slash >= 0 ? filePath.slice(0, slash + 1) : ''
  const name = slash >= 0 ? filePath.slice(slash + 1) : filePath
  const dot = name.lastIndexOf('.')
  const hasExtension = dot > 0
  return {
    directory,
    name,
    baseName: hasExtension ? name.slice(0, dot) : name,
    extension: hasExtension ? name.slice(dot) : '',
  }
}

function extractFilesFromQuery(query) {
  if (!query || typeof query !== 'object')
    return []
  const inputs = Array.isArray(query.inputs) ? query.inputs.slice(0, 32) : []
  const filesInput = inputs.find(input => input && input.type === 'files')
  if (!filesInput || typeof filesInput.content !== 'string' || filesInput.content.length > 256 * 1024)
    return []
  try {
    const parsed = JSON.parse(filesInput.content)
    if (!Array.isArray(parsed))
      return []
    return parsed
      .filter(item => typeof item === 'string' && item.length > 0 && item.length <= MAX_PATH_LENGTH)
      .slice(0, MAX_FILES)
  }
  catch {
    return []
  }
}

function buildRenamePlan(paths, rules, now = new Date()) {
  const items = paths.map((source, index) => {
    const parsed = splitFilePath(source)
    const nextBase = applyRules(parsed.baseName, index, rules, now)
    const targetName = `${nextBase}${parsed.extension}`
    return {
      source,
      sourceName: parsed.name,
      targetName,
      targetPath: `${parsed.directory}${targetName}`,
      unchanged: parsed.name === targetName,
    }
  })
  return { items }
}

async function hasPermission(permissionId) {
  if (!permission || typeof permission.check !== 'function')
    return false
  try {
    return (await permission.check(permissionId)) === true
  }
  catch {
    return false
  }
}

function stableErrorCode(error, fallback) {
  const code = error && typeof error === 'object' && typeof error.code === 'string' ? error.code : ''
  return /^[A-Z][A-Z0-9_]{0,127}$/.test(code) ? code : fallback
}

function buildItem({ id, featureId, title, subtitle, actionId }) {
  const builder = new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      ...(actionId ? { defaultAction: ACTION_ID } : {}),
    })
  if (actionId)
    builder.createAndAddAction(actionId, 'plugin', title)
  return builder.build()
}

async function publishItems(items) {
  await plugin.feature.clearItems()
  await plugin.feature.pushItems(items)
}

function summarizeRules(rules) {
  const parts = []
  if (rules.prefix)
    parts.push(`prefix=${rules.prefix}`)
  if (rules.suffix)
    parts.push(`suffix=${rules.suffix}`)
  if (rules.replaces.length > 0)
    parts.push(`replace=${rules.replaces.length}`)
  if (rules.dateFormat)
    parts.push(`date=${rules.dateFormat}`)
  if (rules.seq)
    parts.push(`seq=${rules.seq.start}:${rules.seq.pad}`)
  return parts.length > 0 ? parts.join(' ') : '未设置规则'
}

function blocked(reason, message) {
  return {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason,
    message,
  }
}

function normalizeUndoEntries(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.items))
    return []
  return payload.items.slice(0, MAX_FILES).flatMap((item) => {
    if (!item || typeof item !== 'object')
      return []
    if (
      typeof item.source !== 'string'
      || item.source.length === 0
      || item.source.length > MAX_PATH_LENGTH
      || typeof item.targetName !== 'string'
      || item.targetName.length === 0
      || item.targetName.length > MAX_TARGET_NAME_LENGTH
    ) {
      return []
    }
    return [{ source: item.source, targetName: item.targetName }]
  })
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query) {
    try {
      const filePaths = extractFilesFromQuery(query)
      if (filePaths.length === 0) {
        await publishItems([
          buildItem({
            id: `${featureId}-empty`,
            featureId,
            title: '未选择文件',
            subtitle: '请从文件输入触发批量重命名',
          }),
        ])
        return true
      }

      if (!(await hasPermission('fs.read'))) {
        await publishItems([
          buildItem({
            id: `${featureId}-no-permission`,
            featureId,
            title: '缺少读取权限',
            subtitle: '请授予文件读取权限',
          }),
        ])
        return true
      }

      const rules = parseRules(getQueryText(query))
      const plan = buildRenamePlan(filePaths, rules, new Date())
      previewCacheByFeature.set(featureId, plan)
      const items = [
        buildItem({
          id: `${featureId}-rules`,
          featureId,
          title: '当前规则',
          subtitle: summarizeRules(rules),
        }),
        buildItem({
          id: `${featureId}-count`,
          featureId,
          title: '文件数量',
          subtitle: `${plan.items.length} 个`,
        }),
        buildItem({
          id: `${featureId}-apply`,
          featureId,
          title: '应用重命名',
          subtitle: '执行受控批量重命名事务',
          actionId: 'apply',
        }),
        buildItem({
          id: `${featureId}-undo`,
          featureId,
          title: '撤销上次重命名',
          subtitle: '还原最近一次成功事务',
          actionId: 'undo',
        }),
      ]

      plan.items.slice(0, PREVIEW_LIMIT).forEach((item, index) => {
        items.push(
          buildItem({
            id: `${featureId}-preview-${index}`,
            featureId,
            title: item.sourceName,
            subtitle: item.unchanged ? '名称未变化' : item.targetName,
          }),
        )
      })
      if (plan.items.length > PREVIEW_LIMIT) {
        items.push(
          buildItem({
            id: `${featureId}-more`,
            featureId,
            title: '更多预览',
            subtitle: `还有 ${plan.items.length - PREVIEW_LIMIT} 条未展示`,
          }),
        )
      }
      await publishItems(items)
      return true
    }
    catch (error) {
      const code = stableErrorCode(error, 'BATCH_RENAME_PREVIEW_FAILED')
      logger.error(`[touch-batch-rename] ${code}`)
      await publishItems([
        buildItem({
          id: `${featureId}-error`,
          featureId,
          title: '加载失败',
          subtitle: code,
        }),
      ])
      return true
    }
  },

  async onItemAction(item, context = {}) {
    if (!item || !item.meta || item.meta.defaultAction !== ACTION_ID)
      return
    const actionId = context.actionId || item.actions?.[0]?.id
    const featureId = item.meta.featureId
    if (typeof actionId !== 'string' || typeof featureId !== 'string')
      return

    if (actionId === 'apply') {
      const plan = previewCacheByFeature.get(featureId)
      if (!plan)
        return blocked('preview-missing', '请先生成重命名预览')
      if (!(await hasPermission('fs.write')))
        return blocked('permission-denied', '缺少 fs.write 权限')
      try {
        const pending = plan.items.filter(entry => !entry.unchanged)
        if (pending.length > 0) {
          await filesystem.renameBatch(pending.map(entry => ({ source: entry.source, targetName: entry.targetName })))
        }
        await plugin.storage.setFile(LAST_RENAME_FILE, {
          items: pending.map(entry => ({
            source: entry.targetPath,
            targetName: entry.sourceName,
          })),
          createdAt: Date.now(),
        })
        return { externalAction: true, success: true, status: 'completed' }
      }
      catch (error) {
        const code = stableErrorCode(error, 'BATCH_RENAME_APPLY_FAILED')
        logger.error(`[touch-batch-rename] ${code}`)
        return blocked(code, '批量重命名失败')
      }
    }

    if (actionId === 'undo') {
      if (!(await hasPermission('fs.write')))
        return blocked('permission-denied', '缺少 fs.write 权限')
      try {
        const entries = normalizeUndoEntries(await plugin.storage.getFile(LAST_RENAME_FILE))
        if (entries.length === 0)
          return blocked('undo-empty', '没有可撤销的重命名事务')
        await filesystem.renameBatch(entries)
        await plugin.storage.setFile(LAST_RENAME_FILE, { items: [], createdAt: Date.now() })
        return { externalAction: true, success: true, status: 'completed' }
      }
      catch (error) {
        const code = stableErrorCode(error, 'BATCH_RENAME_UNDO_FAILED')
        logger.error(`[touch-batch-rename] ${code}`)
        return blocked(code, '撤销重命名失败')
      }
    }
  },

  onDestroy() {
    previewCacheByFeature.clear()
  },
}

module.exports = pluginLifecycle
