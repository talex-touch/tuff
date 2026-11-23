const { plugin, permission, logger, TuffItemBuilder } = globalThis

const PLUGIN_NAME = 'touch-music'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const FEATURE_ID = 'touch-music'
const ACTION_OPEN_MUSIC = 'open-music'
const NETWORK_PERMISSION_ID = 'network.internet'

let runtimeGeneration = 0

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function extractQueryText(query) {
  if (typeof query === 'string') return normalizeText(query)
  if (query && typeof query === 'object' && typeof query.text === 'string') {
    return normalizeText(query.text)
  }
  return ''
}

function stableErrorCode(error) {
  if (!error || typeof error !== 'object') return ''
  const descriptor = Object.getOwnPropertyDescriptor(error, 'code')
  return descriptor && 'value' in descriptor && typeof descriptor.value === 'string'
    ? descriptor.value
    : ''
}

async function checkNetworkPermission() {
  if (!permission || typeof permission.check !== 'function') {
    return { granted: false, reason: 'permission-sdk-unavailable' }
  }
  try {
    const granted = await permission.check(NETWORK_PERMISSION_ID)
    if (granted === true) {
      return { granted: true, reason: '' }
    }
    return { granted: false, reason: 'network-internet-permission-required' }
  }
  catch (error) {
    const code = stableErrorCode(error)
    if (code.includes('PERMISSION_UNAVAILABLE')) {
      return { granted: false, reason: 'permission-unavailable' }
    }
    return { granted: false, reason: 'permission-check-failed' }
  }
}

async function requestNetworkPermission() {
  if (!permission || typeof permission.request !== 'function') {
    return { granted: false, reason: 'permission-sdk-unavailable' }
  }
  try {
    const granted = await permission.request(
      NETWORK_PERMISSION_ID,
      '用于检索在线曲库、播放地址与歌词',
    )
    if (granted === true) {
      return { granted: true, reason: '' }
    }
    return { granted: false, reason: 'permission-denied' }
  }
  catch (error) {
    const code = stableErrorCode(error)
    if (code.includes('PERMISSION_UNAVAILABLE')) {
      return { granted: false, reason: 'permission-unavailable' }
    }
    if (code.includes('PERMISSION_DENIED')) {
      return { granted: false, reason: 'permission-denied' }
    }
    return { granted: false, reason: 'permission-check-failed' }
  }
}

function permissionSubtitle(reason) {
  switch (reason) {
    case 'permission-sdk-unavailable':
      return '权限 SDK 不可用，已阻止网络访问'
    case 'permission-unavailable':
      return '权限校验服务暂不可用，请稍后重试'
    case 'permission-check-failed':
      return '权限校验失败，已按安全策略拦截'
    case 'network-internet-permission-required':
    case 'permission-denied':
    default:
      return '需要授予 network.internet 权限后才能检索与播放音乐'
  }
}

function buildMusicItem(queryText, permState) {
  const title = queryText ? `搜索音乐：${queryText}` : '打开 Touch Music'
  const subtitle = permState.granted
    ? (queryText ? `在音乐面板中搜索 “${queryText}”` : '搜索曲目、播放音乐并查看逐字歌词')
    : permissionSubtitle(permState.reason)

  return new TuffItemBuilder(`${FEATURE_ID}-entry`)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId: FEATURE_ID,
      defaultAction: ACTION_OPEN_MUSIC,
      permissionStatus: permState.granted ? 'granted' : permState.reason,
    })
    .createAndAddAction(ACTION_OPEN_MUSIC, 'plugin', permState.granted ? '打开音乐面板' : '授权并打开', {
      query: queryText,
    })
    .build()
}

const lifecycle = {
  async onFeatureTriggered(featureId, query, _feature, signal) {
    if (featureId !== FEATURE_ID) return false

    const generation = ++runtimeGeneration
    if (signal?.aborted) return true

    try {
      const permState = await checkNetworkPermission()
      if (generation !== runtimeGeneration || signal?.aborted) return true

      if (!plugin?.feature?.clearItems || !plugin?.feature?.pushItems) {
        return false
      }

      const item = buildMusicItem(extractQueryText(query), permState)
      await plugin.feature.clearItems()
      if (generation !== runtimeGeneration || signal?.aborted) return true
      await plugin.feature.pushItems([item])
      return true
    }
    catch {
      logger?.error?.('[touch-music] Failed to handle feature trigger')
      return false
    }
  },

  async onItemAction(item, context = {}) {
    const featureId = normalizeText(item?.meta?.featureId)
    if (featureId !== FEATURE_ID) return

    const actionId = normalizeText(
      context?.actionId || item?.meta?.actionId || item?.meta?.defaultAction || item?.actions?.[0]?.id,
    )
    if (actionId !== ACTION_OPEN_MUSIC) return

    const permState = await requestNetworkPermission()
    if (!permState.granted) {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: permState.reason,
        message: permissionSubtitle(permState.reason),
      }
    }

    return {
      externalAction: false,
      shouldActivate: true,
      success: true,
      status: 'started',
    }
  },

  async onDestroy() {
    runtimeGeneration += 1
    return true
  },
}

module.exports = lifecycle
