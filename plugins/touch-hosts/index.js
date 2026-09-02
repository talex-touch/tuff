const { plugin, TuffItemBuilder } = globalThis

const PLUGIN_NAME = 'touch-hosts'
const SOURCE_ID = 'plugin-features'
const FEATURE_ID = 'hosts'
const UPSERT_ACTION_ID = 'hosts.upsert'
const REMOVE_ACTION_ID = 'hosts.remove'
const MAX_HOSTNAME_LENGTH = 253
const MAX_ADDRESS_LENGTH = 45
const MAX_COMMENT_LENGTH = 96
const MAX_ENTRIES = 128
const MAX_ADDRESSES = 16

let issuedActions = new Map()
let triggerGeneration = 0

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function hasControlCharacter(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

function getQueryText(query) {
  return typeof query === 'string' ? query : text(query?.text)
}

function isIPv4(value) {
  const parts = value.split('.')
  return (
    parts.length === 4 &&
    parts.every(part => /^\d{1,3}$/.test(part) && (part === '0' || !part.startsWith('0')) && Number(part) <= 255)
  )
}

function isIPv6(value) {
  if (value.length > MAX_ADDRESS_LENGTH || !value.includes(':') || !/^[0-9a-f:]+$/i.test(value)) return false
  if ((value.match(/::/g) || []).length > 1) return false
  const halves = value.split('::')
  const validGroup = group => /^[0-9a-f]{1,4}$/i.test(group)
  if (halves.length === 1) {
    const groups = halves[0].split(':')
    return groups.length === 8 && groups.every(validGroup)
  }
  const left = halves[0] ? halves[0].split(':') : []
  const right = halves[1] ? halves[1].split(':') : []
  return left.every(validGroup) && right.every(validGroup) && left.length + right.length < 8
}

function isSafeHostname(value) {
  const hostname = text(value).toLowerCase()
  if (!hostname || hostname.length > MAX_HOSTNAME_LENGTH || hostname === 'localhost') return false
  if (hostname === '255.255.255.255' || hostname === '::' || hostname === '::1') return false
  if (isIPv4(hostname) || isIPv6(hostname)) return false
  return /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(
    hostname,
  )
}

function isSafeAddress(value) {
  const address = text(value)
  if (!address || address.length > MAX_ADDRESS_LENGTH || hasControlCharacter(address) || /\s/.test(address))
    return false
  if (address === '0.0.0.0' || address === '255.255.255.255' || address === '::') return false
  return isIPv4(address) || isIPv6(address)
}

function safeComment(value) {
  const comment = text(value)
  if (!comment || hasControlCharacter(comment)) return ''
  return comment
    .replace(/(?:~|\/|[A-Z]:\\)[^\s,;]*/gi, '[内容已隐藏]')
    .replace(/(secret|token|password|api[-_ ]?key)\s*[=:]\s*[^\s,;]+/gi, '$1=[内容已隐藏]')
    .slice(0, MAX_COMMENT_LENGTH)
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object' || !isSafeHostname(entry.hostname)) return null
  const addresses = Array.isArray(entry.addresses)
    ? [...new Set(entry.addresses.filter(isSafeAddress).map(value => text(value)))]
    : []
  if (addresses.length === 0) return null
  return {
    hostname: text(entry.hostname).toLowerCase(),
    addresses,
    ...(safeComment(entry.comment) ? { comment: safeComment(entry.comment) } : {}),
  }
}

function safeRevision(value) {
  const revision = text(value)
  return /^[\w.:-]{1,128}$/.test(revision) ? revision : undefined
}

function stripHostsPrefix(value) {
  return text(value)
    .replace(/^(?:hosts?|hosts\s*配置|域名解析)(?:\s*[:：-]?\s*)/i, '')
    .trim()
}

function parseMutationQuery(query) {
  const input = stripHostsPrefix(getQueryText(query))
  if (!input) return null
  const tokens = input.split(/\s+/)
  const operation = tokens[0]?.toLowerCase()
  if (['remove', 'delete', 'rm', '删除', '移除'].includes(operation)) {
    if (tokens.length !== 2 || !isSafeHostname(tokens[1])) return null
    return { operation: 'remove', hostname: text(tokens[1]).toLowerCase() }
  }
  const values = ['add', 'set', 'upsert', 'update', '添加', '新增', '设置', '更新'].includes(operation)
    ? tokens.slice(1)
    : tokens
  if (values.length !== 2 || !isSafeHostname(values[1])) return null
  const addresses = values[0].split(',').map(text)
  if (addresses.length === 0 || addresses.length > MAX_ADDRESSES || !addresses.every(isSafeAddress)) return null
  return {
    operation: 'upsert',
    hostname: text(values[1]).toLowerCase(),
    addresses: [...new Set(addresses)],
  }
}

function mutationPreviewItem(mutation, revision, exists) {
  const actionId = mutation.operation === 'upsert' ? UPSERT_ACTION_ID : REMOVE_ACTION_ID
  const payload = {
    operation: mutation.operation,
    actionToken: crypto.randomUUID(),
    hostname: mutation.hostname,
    ...(mutation.operation === 'upsert' ? { addresses: [...mutation.addresses] } : {}),
    ...(revision ? { expectedRevision: revision } : {}),
  }
  const verb = mutation.operation === 'remove' ? '删除' : exists ? '更新' : '新增'
  return buildItem(
    `hosts-mutation-${mutation.operation}-${mutation.hostname}`,
    `${verb} ${mutation.hostname}`,
    mutation.operation === 'upsert' ? mutation.addresses.join(', ') : '确认后从 Hosts 中移除该域名',
    FEATURE_ID,
    [{ id: actionId, label: `确认${verb}`, payload }],
  )
}

function hostsEntryItem(entry, revision, index) {
  const common = {
    hostname: entry.hostname,
    ...(revision ? { expectedRevision: revision } : {}),
  }
  return buildItem(
    `hosts-entry-${index}-${entry.hostname}`,
    entry.hostname,
    [entry.addresses.join(', '), entry.comment].filter(Boolean).join(' · '),
    FEATURE_ID,
    [
      {
        id: UPSERT_ACTION_ID,
        label: '确认更新',
        payload: {
          operation: 'upsert',
          actionToken: crypto.randomUUID(),
          ...common,
          addresses: [...entry.addresses],
        },
      },
      {
        id: REMOVE_ACTION_ID,
        label: '确认删除',
        payload: {
          operation: 'remove',
          actionToken: crypto.randomUUID(),
          ...common,
        },
      },
    ],
  )
}

function reasonCode(value, fallback = 'host-capability-failed') {
  const raw = text(value).toLowerCase()
  if (/permission.*denied/.test(raw)) return 'permission-denied'
  if (/permission.*unavailable|capability.*unavailable|unavailable/.test(raw)) return 'capability-unavailable'
  if (/confirm.*denied|cancel/.test(raw)) return 'confirmation-denied'
  if (/timeout/.test(raw)) return 'timeout'
  if (/conflict|revision|changed/.test(raw)) return 'revision-conflict'
  if (/unsupported|platform|path/.test(raw)) return 'unsupported'
  if (/valid|malformed|address|hostname/.test(raw)) return 'invalid-entry'
  if (/backup/.test(raw)) return 'backup-failed'
  if (/atomic|write|permission/.test(raw)) return 'write-failed'
  return fallback
}

function reasonMessage(reason) {
  return (
    {
      'permission-denied': '没有 Hosts 读写权限',
      'capability-unavailable': 'Hosts 能力不可用',
      'confirmation-denied': '操作已取消',
      timeout: 'Hosts 操作超时',
      'revision-conflict': 'Hosts 已被其他操作修改，请刷新后重试',
      unsupported: '当前平台不支持 Hosts 配置',
      'invalid-entry': 'Hosts 条目不符合安全规则',
      'backup-failed': '备份失败，未修改 Hosts',
      'write-failed': 'Hosts 写入失败，原文件未被替换',
      'host-capability-failed': 'Hosts 能力执行失败',
    }[reason] || 'Hosts 能力执行失败'
  )
}

function blocked(reason, status = 'blocked') {
  return { externalAction: true, success: false, status, reason }
}

function buildItem(id, title, subtitle, featureId = FEATURE_ID, actions = []) {
  const builder = new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(text(title).slice(0, 160))
    .setSubtitle(text(subtitle).slice(0, 240))
    .setIcon({ type: 'file', value: 'assets/logo.svg' })
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      ...(actions[0]?.id ? { defaultAction: actions[0].id } : {}),
    })
  for (const action of actions) builder.createAndAddAction(action.id, 'plugin', action.label, action.payload)
  return builder.build()
}

function copyPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload
  return {
    ...payload,
    ...(Array.isArray(payload.addresses) ? { addresses: [...payload.addresses] } : {}),
  }
}

async function publishItems(items, generation) {
  if (generation !== triggerGeneration) return true
  const nextActions = new Map()
  for (const item of items) {
    for (const action of item.actions || []) {
      const token = action?.payload?.actionToken
      if (typeof token === 'string') {
        nextActions.set(token, {
          id: action.id,
          type: action.type,
          payload: copyPayload(action.payload),
        })
      }
    }
  }
  const clearItems = plugin?.feature?.clearItems
  const pushItems = plugin?.feature?.pushItems
  if (typeof clearItems !== 'function' || typeof pushItems !== 'function') {
    issuedActions = new Map()
    return false
  }
  try {
    await clearItems.call(plugin.feature)
    if (generation !== triggerGeneration) return true
    await pushItems.call(plugin.feature, items)
    if (generation === triggerGeneration) issuedActions = nextActions
    return true
  } catch {
    issuedActions = new Map()
    return false
  }
}

function readError(error) {
  const code = error && typeof error === 'object' ? error.code || error.reason : error
  const reason = reasonCode(code, 'capability-unavailable')
  const status = error?.status === 'degraded' ? '（degraded）' : ''
  return buildItem('hosts-degraded', `Hosts 配置不可用${status}`, reasonMessage(reason))
}

function mutationResult(result) {
  if (result?.status === 'started') return { externalAction: true, success: true, status: 'started' }
  if (result?.status === 'blocked') return blocked(reasonCode(result.reason, 'confirmation-denied'))
  return blocked(reasonCode(result?.reason, 'write-failed'), 'failed')
}

function samePayload(left, right) {
  if (!left || !right || left.operation !== right.operation || left.hostname !== right.hostname) return false
  if (left.actionToken !== right.actionToken || left.expectedRevision !== right.expectedRevision) return false
  if (left.operation === 'upsert') {
    return (
      Array.isArray(left.addresses) &&
      Array.isArray(right.addresses) &&
      left.addresses.length === right.addresses.length &&
      left.addresses.every((value, index) => value === right.addresses[index])
    )
  }
  return !('addresses' in left) && !('addresses' in right)
}

function validPayload(payload, actionId) {
  if (!payload || typeof payload !== 'object') return false
  if (!isSafeHostname(payload.hostname) || !['upsert', 'remove'].includes(payload.operation)) return false
  const keys = Object.keys(payload).sort().join(',')
  const baseKeys =
    payload.operation === 'upsert' ? 'actionToken,addresses,hostname,operation' : 'actionToken,hostname,operation'
  const allowedKeys = [...baseKeys.split(','), ...(payload.expectedRevision === undefined ? [] : ['expectedRevision'])]
    .sort()
    .join(',')
  if (keys !== allowedKeys) return false
  if (typeof payload.actionToken !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.actionToken)) return false
  if (payload.operation === 'upsert') {
    if (!Array.isArray(payload.addresses) || payload.addresses.length === 0 || payload.addresses.length > MAX_ADDRESSES)
      return false
    if (!payload.addresses.every(isSafeAddress)) return false
  } else if ('addresses' in payload) {
    return false
  }
  if (payload.expectedRevision !== undefined && !safeRevision(payload.expectedRevision)) return false
  return (
    (actionId === UPSERT_ACTION_ID && payload.operation === 'upsert') ||
    (actionId === REMOVE_ACTION_ID && payload.operation === 'remove')
  )
}

const pluginLifecycle = {
  async onInit() {
    triggerGeneration = 0
    issuedActions = new Map()
  },

  async onFeatureTriggered(featureId, query) {
    if (featureId !== FEATURE_ID) return false
    const generation = ++triggerGeneration
    const facade = plugin?.hosts
    if (!facade || typeof facade.read !== 'function') {
      return await publishItems([readError({ reason: 'capability-unavailable' })], generation)
    }
    try {
      const snapshot = await facade.read()
      if (generation !== triggerGeneration) return true
      if (snapshot?.status !== 'ready') {
        return await publishItems([readError(snapshot)], generation)
      }
      const entries = Array.isArray(snapshot.entries)
        ? snapshot.entries.slice(0, MAX_ENTRIES).map(normalizeEntry).filter(Boolean)
        : []
      const revision = safeRevision(snapshot.revision)
      const mutation = parseMutationQuery(query)
      const keyword = stripHostsPrefix(getQueryText(query)).toLowerCase()
      const matched = keyword
        ? entries.filter(entry =>
            [entry.hostname, ...entry.addresses, entry.comment || ''].join(' ').toLowerCase().includes(keyword),
          )
        : entries
      const items = mutation
        ? [
            mutationPreviewItem(
              mutation,
              revision,
              entries.some(entry => entry.hostname === mutation.hostname),
            ),
          ]
        : matched.map((entry, index) => hostsEntryItem(entry, revision, index))
      if (items.length === 0) {
        items.push(
          buildItem(
            'hosts-empty',
            keyword ? '没有匹配的 Hosts 条目' : 'Hosts 配置为空',
            keyword ? '请尝试其他关键词' : '宿主未返回可展示的安全条目',
          ),
        )
      }
      return await publishItems(items, generation)
    } catch (error) {
      return await publishItems([readError(error)], generation)
    }
  },

  async onItemAction(item, context = {}) {
    const selectedActionId = context?.actionId || item?.meta?.defaultAction || item?.actions?.[0]?.id
    if (
      item?.source?.type !== 'plugin' ||
      ![SOURCE_ID, PLUGIN_NAME].includes(item.source.id) ||
      item.source.name !== PLUGIN_NAME
    ) {
      return blocked('invalid-item')
    }
    if (item?.meta?.pluginName !== PLUGIN_NAME || item?.meta?.featureId !== FEATURE_ID)
      return blocked('invalid-feature')
    if (![UPSERT_ACTION_ID, REMOVE_ACTION_ID].includes(selectedActionId)) return blocked('invalid-action')
    const declared = item.actions?.find?.(action => action?.id === selectedActionId)
    const issued = issuedActions.get(declared?.payload?.actionToken)
    if (
      !declared ||
      declared.type !== 'plugin' ||
      !issued ||
      issued.id !== selectedActionId ||
      issued.type !== declared.type ||
      !samePayload(declared.payload, issued.payload) ||
      !validPayload(declared.payload, selectedActionId)
    ) {
      return blocked('invalid-action')
    }
    const facade = plugin?.hosts
    if (!facade || typeof facade.apply !== 'function') return blocked('capability-unavailable')
    try {
      return mutationResult(
        await facade.apply({
          operation: declared.payload.operation,
          hostname: declared.payload.hostname,
          ...(declared.payload.operation === 'upsert' ? { addresses: [...declared.payload.addresses] } : {}),
          ...(declared.payload.expectedRevision ? { expectedRevision: declared.payload.expectedRevision } : {}),
        }),
      )
    } catch (error) {
      return blocked(reasonCode(error?.code || error?.reason, 'write-failed'), 'failed')
    }
  },
  onDestroy() {
    triggerGeneration += 1
    issuedActions = new Map()
  },
}

module.exports = pluginLifecycle
