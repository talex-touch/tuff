const { plugin, dialog, logger, TuffItemBuilder, permission } = globalThis
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')

const PLUGIN_NAME = 'touch-batch-rename'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const ACTION_ID = 'batch-rename'
const PREVIEW_LIMIT = 20
const LAST_RENAME_FILE = 'last-rename.json'

const previewCacheByFeature = new Map()
const selectedPathsByFeature = new Map()
const dialogLockByFeature = new Set()

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

function getQueryText(query) {
  if (typeof query === 'string')
    return query
  return query?.text ?? ''
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
  if (!from)
    return null

  if (from.startsWith('/') && from.lastIndexOf('/') > 0) {
    const lastSlash = from.lastIndexOf('/')
    const pattern = from.slice(1, lastSlash)
    const flags = from.slice(lastSlash + 1)
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
  const tokens = normalizeText(text).split(/\s+/).filter(Boolean)
  const rules = {
    prefix: '',
    suffix: '',
    replaces: [],
    seq: null,
    dateFormat: null,
  }

  tokens.forEach((token) => {
    if (token.startsWith('prefix:')) {
      rules.prefix = token.slice(7)
    }
    else if (token.startsWith('suffix:')) {
      rules.suffix = token.slice(7)
    }
    else if (token.startsWith('replace:')) {
      const rule = parseReplaceRule(token.slice(8))
      if (rule)
        rules.replaces.push(rule)
    }
    else if (token.startsWith('seq:')) {
      const parts = token.slice(4).split(':')
      const start = Number(parts[0])
      const pad = Number(parts[1] ?? '1')
      if (!Number.isNaN(start)) {
        rules.seq = {
          start,
          pad: Number.isNaN(pad) ? 1 : Math.max(1, pad),
        }
      }
    }
    else if (token.startsWith('date:')) {
      const format = token.slice(5) || 'YYYYMMDD'
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
    else if (replaceRule.type === 'text') {
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
    const seqValue = rules.seq.start + index
    const padded = String(seqValue).padStart(rules.seq.pad, '0')
    result = `${result}_${padded}`
  }

  return result
}

function buildRenamePlan(paths, rules, now = new Date(), exists = fs.existsSync) {
  const items = paths.map((filePath, index) => {
    const parsed = path.parse(filePath)
    const baseName = parsed.name
    const nextBase = applyRules(baseName, index, rules, now)
    const nextName = `${nextBase}${parsed.ext}`
    const target = path.join(parsed.dir, nextName)
    return {
      from: filePath,
      to: target,
      name: parsed.base,
      nextName,
      unchanged: filePath === target,
    }
  })

  const fromSet = new Set(items.map(item => item.from))
  const toCount = new Map()
  items.forEach((item) => {
    toCount.set(item.to, (toCount.get(item.to) || 0) + 1)
  })

  const conflicts = []
  items.forEach((item) => {
    if (item.unchanged)
      return
    const duplicate = (toCount.get(item.to) || 0) > 1
    const existsConflict = exists(item.to) && !fromSet.has(item.to)
    if (duplicate || existsConflict) {
      item.conflict = duplicate ? 'duplicate' : 'exists'
      conflicts.push({ to: item.to, reason: item.conflict })
    }
  })

  return { items, conflicts }
}

async function ensurePermission(permissionId, reason) {
  if (!permission)
    return true
  const hasPermission = await permission.check(permissionId)
  if (hasPermission)
    return true
  const granted = await permission.request(permissionId, reason)
  return Boolean(granted)
}

async function pickFiles(featureId) {
  if (!dialog || dialogLockByFeature.has(featureId))
    return []
  dialogLockByFeature.add(featureId)
  try {
    const result = await dialog.showOpenDialog({
      title: '选择要重命名的文件',
      properties: ['openFile', 'multiSelections'],
    })
    const filePaths = Array.isArray(result?.filePaths) ? result.filePaths : []
    if (filePaths.length > 0) {
      selectedPathsByFeature.set(featureId, filePaths)
      return filePaths
    }
  }
  catch (error) {
    logger?.warn?.('[touch-batch-rename] Failed to open dialog', error)
  }
  finally {
    dialogLockByFeature.delete(featureId)
  }
  return []
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
    if (Array.isArray(parsed))
      return parsed.filter(item => typeof item === 'string')
  }
  catch {
    return []
  }
  return []
}

function buildInfoItem({ id, featureId, title, subtitle }) {
  return new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({ pluginName: PLUGIN_NAME, featureId })
    .build()
}

function buildActionItem({ id, featureId, title, subtitle, actionId }) {
  return new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: ACTION_ID,
      actionId,
    })
    .build()
}

function buildPreviewItem({ id, featureId, title, subtitle, conflict }) {
  return new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      conflict,
    })
    .build()
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

async function confirmAction(title, detail) {
  if (!dialog)
    return true
  const result = await dialog.showMessageBox({
    type: 'question',
    buttons: ['取消', '继续'],
    defaultId: 1,
    cancelId: 0,
    title,
    message: title,
    detail,
  })
  return result?.response === 1
}

async function applyRenamePlan(plan) {
  const pending = plan.items.filter(item => !item.unchanged)
  const timestamp = Date.now()
  const tempItems = []

  for (let index = 0; index < pending.length; index += 1) {
    const item = pending[index]
    const tempPath = path.join(path.dirname(item.from), `.__tuff_tmp_${timestamp}_${index}`)
    await fsp.rename(item.from, tempPath)
    tempItems.push({ ...item, tempPath })
  }

  try {
    for (const item of tempItems) {
      await fsp.rename(item.tempPath, item.to)
    }
  }
  catch (error) {
    for (const item of tempItems) {
      try {
        if (fs.existsSync(item.tempPath))
          await fsp.rename(item.tempPath, item.from)
      }
      catch {}
    }
    throw error
  }

  return pending.map(item => ({ from: item.from, to: item.to }))
}

async function undoRenamePlan(records) {
  const reversed = records.map(record => ({ from: record.to, to: record.from }))
  const plan = { items: reversed.map(item => ({ ...item, unchanged: item.from === item.to })) }
  await applyRenamePlan(plan)
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query) {
    try {
      const queryText = normalizeText(getQueryText(query))
      const rules = parseRules(queryText)

      let filePaths = extractFilesFromQuery(query)
      if (filePaths.length === 0) {
        const cached = selectedPathsByFeature.get(featureId) || []
        if (cached.length > 0) {
          filePaths = cached
        }
        else {
          filePaths = await pickFiles(featureId)
        }
      }

      const items = []
      if (filePaths.length === 0) {
        items.push(buildInfoItem({
          id: `${featureId}-empty`,
          featureId,
          title: '未选择文件',
          subtitle: '请先选择要重命名的文件',
        }))
        plugin.feature.clearItems()
        plugin.feature.pushItems(items)
        return true
      }

      const canRead = await ensurePermission('fs.read', '需要读取文件信息以生成重命名计划')
      if (!canRead) {
        items.push(buildInfoItem({
          id: `${featureId}-no-permission`,
          featureId,
          title: '缺少读取权限',
          subtitle: '请授予文件读取权限',
        }))
        plugin.feature.clearItems()
        plugin.feature.pushItems(items)
        return true
      }

      const plan = buildRenamePlan(filePaths, rules, new Date())
      previewCacheByFeature.set(featureId, plan)

      items.push(buildInfoItem({
        id: `${featureId}-rules`,
        featureId,
        title: '当前规则',
        subtitle: summarizeRules(rules),
      }))

      items.push(buildInfoItem({
        id: `${featureId}-count`,
        featureId,
        title: '文件数量',
        subtitle: `${plan.items.length} 个`,
      }))

      if (plan.conflicts.length > 0) {
        items.push(buildInfoItem({
          id: `${featureId}-conflicts`,
          featureId,
          title: '存在冲突',
          subtitle: `冲突 ${plan.conflicts.length} 条，请调整规则`,
        }))
      }

      items.push(buildActionItem({
        id: `${featureId}-apply`,
        featureId,
        title: '应用重命名',
        subtitle: '执行重命名操作',
        actionId: 'apply',
      }))

      items.push(buildActionItem({
        id: `${featureId}-undo`,
        featureId,
        title: '撤销上次重命名',
        subtitle: '根据 last-rename.json 还原',
        actionId: 'undo',
      }))

      plan.items.slice(0, PREVIEW_LIMIT).forEach((item, index) => {
        const title = path.basename(item.from)
        const subtitle = item.unchanged
          ? '名称未变化'
          : `${item.nextName}${item.conflict ? ` · 冲突(${item.conflict})` : ''}`
        items.push(buildPreviewItem({
          id: `${featureId}-preview-${index}`,
          featureId,
          title,
          subtitle,
          conflict: item.conflict,
        }))
      })

      if (plan.items.length > PREVIEW_LIMIT) {
        items.push(buildInfoItem({
          id: `${featureId}-more`,
          featureId,
          title: '更多预览',
          subtitle: `还有 ${plan.items.length - PREVIEW_LIMIT} 条未展示`,
        }))
      }

      plugin.feature.clearItems()
      plugin.feature.pushItems(items)
      return true
    }
    catch (error) {
      logger?.error?.('[touch-batch-rename] Failed to handle feature', error)
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
    if (item?.meta?.defaultAction !== ACTION_ID)
      return

    const actionId = item.meta?.actionId
    const featureId = item.meta?.featureId
    if (!actionId || !featureId)
      return

    if (actionId === 'apply') {
      const plan = previewCacheByFeature.get(featureId)
      if (!plan) {
        logger?.warn?.('[touch-batch-rename] No preview plan to apply')
        return
      }
      if (plan.conflicts.length > 0) {
        await dialog?.showMessageBox?.({
          type: 'warning',
          title: '存在冲突',
          message: '重命名计划存在冲突，请调整规则后重试。',
        })
        return
      }

      const canWrite = await ensurePermission('fs.write', '需要文件写入权限以执行重命名')
      if (!canWrite)
        return

      const confirmed = await confirmAction('确认执行批量重命名？', '将对选中文件执行不可逆重命名。')
      if (!confirmed)
        return

      try {
        const records = await applyRenamePlan(plan)
        await plugin.storage.setFile(LAST_RENAME_FILE, {
          items: records,
          createdAt: Date.now(),
        })
      }
      catch (error) {
        logger?.error?.('[touch-batch-rename] Rename failed', error)
        await dialog?.showMessageBox?.({
          type: 'error',
          title: '重命名失败',
          message: error?.message || '重命名过程中发生错误',
        })
      }
      return { externalAction: true }
    }

    if (actionId === 'undo') {
      const canWrite = await ensurePermission('fs.write', '需要文件写入权限以撤销重命名')
      if (!canWrite)
        return

      const confirmed = await confirmAction('确认撤销上次重命名？', '将根据 last-rename.json 还原文件名。')
      if (!confirmed)
        return

      try {
        const payload = await plugin.storage.getFile(LAST_RENAME_FILE)
        const data = typeof payload === 'string' ? JSON.parse(payload) : payload
        const records = Array.isArray(data?.items) ? data.items : []
        if (records.length === 0) {
          await dialog?.showMessageBox?.({
            type: 'info',
            title: '无可撤销记录',
            message: '未找到上次重命名记录。',
          })
          return
        }
        await undoRenamePlan(records)
      }
      catch (error) {
        logger?.error?.('[touch-batch-rename] Undo failed', error)
        await dialog?.showMessageBox?.({
          type: 'error',
          title: '撤销失败',
          message: error?.message || '撤销过程中发生错误',
        })
      }
      return { externalAction: true }
    }
  },
}

module.exports = {
  ...pluginLifecycle,
  __test: {
    applyRules,
    buildRenamePlan,
    formatDate,
    parseRules,
  },
}
