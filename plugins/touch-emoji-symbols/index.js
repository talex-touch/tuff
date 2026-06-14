const { plugin, clipboard, logger, TuffItemBuilder, permission } = globalThis

const PLUGIN_NAME = 'touch-emoji-symbols'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'emoji', value: '🙂' }
const COPY_ACTION_ID = 'copy'
const MAX_RESULTS = 24
const QUERY_PREFIXES = ['emoji', 'symbol', 'symbols', '表情', '符号', '特殊字符']

const EMOJI_SYMBOLS = [
  { id: 'sparkles', value: '✨', title: 'Sparkles', category: 'emoji', keywords: ['sparkle', 'magic', 'star', '闪光', '星星'] },
  { id: 'check', value: '✅', title: 'Check Mark', category: 'emoji', keywords: ['done', 'success', 'ok', '完成', '成功'] },
  { id: 'warning', value: '⚠️', title: 'Warning', category: 'emoji', keywords: ['warn', 'alert', 'risk', '警告', '风险'] },
  { id: 'rocket', value: '🚀', title: 'Rocket', category: 'emoji', keywords: ['ship', 'launch', 'release', '发布', '启动'] },
  { id: 'fire', value: '🔥', title: 'Fire', category: 'emoji', keywords: ['hot', 'popular', 'awesome', '火', '热门'] },
  { id: 'eyes', value: '👀', title: 'Eyes', category: 'emoji', keywords: ['look', 'watch', 'review', '查看', '关注'] },
  { id: 'thinking', value: '🤔', title: 'Thinking', category: 'emoji', keywords: ['think', 'question', 'idea', '思考', '问题'] },
  { id: 'thumbs-up', value: '👍', title: 'Thumbs Up', category: 'emoji', keywords: ['like', 'approve', 'yes', '赞', '同意'] },
  { id: 'heart', value: '❤️', title: 'Heart', category: 'emoji', keywords: ['love', 'favorite', 'like', '爱心', '喜欢'] },
  { id: 'party', value: '🎉', title: 'Party Popper', category: 'emoji', keywords: ['party', 'celebrate', 'done', '庆祝', '完成'] },
  { id: 'arrow-right', value: '→', title: 'Right Arrow', category: 'symbol', keywords: ['arrow', 'right', 'next', '右箭头', '下一步'] },
  { id: 'arrow-left', value: '←', title: 'Left Arrow', category: 'symbol', keywords: ['arrow', 'left', 'back', '左箭头', '返回'] },
  { id: 'arrow-up', value: '↑', title: 'Up Arrow', category: 'symbol', keywords: ['arrow', 'up', 'top', '上箭头'] },
  { id: 'arrow-down', value: '↓', title: 'Down Arrow', category: 'symbol', keywords: ['arrow', 'down', 'bottom', '下箭头'] },
  { id: 'em-dash', value: '—', title: 'Em Dash', category: 'punctuation', keywords: ['dash', 'line', '破折号'] },
  { id: 'ellipsis', value: '…', title: 'Ellipsis', category: 'punctuation', keywords: ['dots', 'more', '省略号'] },
  { id: 'bullet', value: '•', title: 'Bullet', category: 'punctuation', keywords: ['dot', 'list', '项目符号'] },
  { id: 'middle-dot', value: '·', title: 'Middle Dot', category: 'punctuation', keywords: ['dot', 'separator', '间隔号'] },
  { id: 'degree', value: '°', title: 'Degree Sign', category: 'symbol', keywords: ['temperature', 'angle', '度', '温度'] },
  { id: 'copyright', value: '©', title: 'Copyright', category: 'symbol', keywords: ['copyright', 'rights', '版权'] },
  { id: 'registered', value: '®', title: 'Registered', category: 'symbol', keywords: ['registered', 'trademark', '注册商标'] },
  { id: 'trademark', value: '™', title: 'Trademark', category: 'symbol', keywords: ['trademark', 'brand', '商标'] },
  { id: 'multiply', value: '×', title: 'Multiplication Sign', category: 'math', keywords: ['multiply', 'times', '乘号'] },
  { id: 'divide', value: '÷', title: 'Division Sign', category: 'math', keywords: ['divide', 'division', '除号'] },
  { id: 'plus-minus', value: '±', title: 'Plus Minus', category: 'math', keywords: ['plus', 'minus', '正负'] },
  { id: 'not-equal', value: '≠', title: 'Not Equal', category: 'math', keywords: ['not equal', 'neq', '不等于'] },
  { id: 'less-equal', value: '≤', title: 'Less Than Or Equal', category: 'math', keywords: ['less equal', 'lte', '小于等于'] },
  { id: 'greater-equal', value: '≥', title: 'Greater Than Or Equal', category: 'math', keywords: ['greater equal', 'gte', '大于等于'] },
  { id: 'infinity', value: '∞', title: 'Infinity', category: 'math', keywords: ['infinity', 'forever', '无限'] },
  { id: 'currency-yuan', value: '¥', title: 'Yen / Yuan Sign', category: 'currency', keywords: ['yuan', 'yen', 'cny', '人民币', '日元'] },
  { id: 'currency-dollar', value: '$', title: 'Dollar Sign', category: 'currency', keywords: ['dollar', 'usd', '美元'] },
  { id: 'currency-euro', value: '€', title: 'Euro Sign', category: 'currency', keywords: ['euro', 'eur', '欧元'] },
  { id: 'currency-pound', value: '£', title: 'Pound Sign', category: 'currency', keywords: ['pound', 'gbp', '英镑'] },
]

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getQueryText(query) {
  if (typeof query === 'string')
    return query
  return query?.text ?? ''
}

function parseSearchQuery(query) {
  const normalized = normalizeText(getQueryText(query)).replace(/\s+/g, ' ')
  if (!normalized)
    return ''

  const lower = normalized.toLowerCase()
  for (const prefix of QUERY_PREFIXES) {
    const normalizedPrefix = prefix.toLowerCase()
    if (lower === normalizedPrefix)
      return ''
    if (lower.startsWith(`${normalizedPrefix} `))
      return normalized.slice(prefix.length).trim()
    if (lower.startsWith(`${normalizedPrefix}:`))
      return normalized.slice(prefix.length + 1).trim()
  }

  return normalized
}

function getSearchableText(entry) {
  return [
    entry.value,
    entry.title,
    entry.category,
    ...(Array.isArray(entry.keywords) ? entry.keywords : []),
  ].join(' ').toLowerCase()
}

function rankEntry(entry, query) {
  const lower = query.toLowerCase()
  if (!lower)
    return 10
  if (entry.value === query)
    return 100
  if (entry.title.toLowerCase().startsWith(lower))
    return 80
  if (entry.category.toLowerCase() === lower)
    return 70
  if ((entry.keywords || []).some(keyword => keyword.toLowerCase() === lower))
    return 65
  if (getSearchableText(entry).includes(lower))
    return 40
  return 0
}

function searchEmojiSymbols(query, limit = MAX_RESULTS) {
  const text = normalizeText(query)
  return EMOJI_SYMBOLS
    .map((entry, index) => ({
      ...entry,
      score: rankEntry(entry, text),
      index,
    }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
}

async function ensurePermission(permissionId, reason) {
  if (!permission?.check || !permission?.request)
    return false

  try {
    const hasPermission = await permission.check(permissionId)
    if (hasPermission)
      return true
    const granted = await permission.request(permissionId, reason)
    return Boolean(granted)
  }
  catch (error) {
    logger?.warn?.('[touch-emoji-symbols] Failed to request permission', error)
    return false
  }
}

function buildCopyItem({ featureId, entry }) {
  return new TuffItemBuilder(`${featureId}-${entry.id}`)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(`${entry.value} ${entry.title}`)
    .setSubtitle(`${entry.category} · ${entry.keywords.slice(0, 4).join(', ')}`)
    .setIcon({ type: 'emoji', value: entry.value })
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: COPY_ACTION_ID,
    })
    .createAndAddAction(COPY_ACTION_ID, 'plugin', '复制', { text: entry.value })
    .build()
}

function buildInfoItem({ featureId, id, title, subtitle }) {
  return new TuffItemBuilder(`${featureId}-${id}`)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({ pluginName: PLUGIN_NAME, featureId })
    .build()
}

function buildResultItems(featureId, query) {
  const searchQuery = parseSearchQuery(query)
  const results = searchEmojiSymbols(searchQuery)
  if (!results.length) {
    return [
      buildInfoItem({
        featureId,
        id: 'empty',
        title: '没有匹配的 Emoji 或符号',
        subtitle: '试试输入 arrow、check、currency、表情、符号或中文关键词',
      }),
    ]
  }
  return results.map(entry => buildCopyItem({ featureId, entry }))
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query) {
    try {
      plugin.feature.clearItems()
      plugin.feature.pushItems(buildResultItems(featureId, query))
      return true
    }
    catch (error) {
      logger?.error?.('[touch-emoji-symbols] Failed to process feature', error)
      plugin.feature.clearItems()
      plugin.feature.pushItems([
        buildInfoItem({
          featureId,
          id: 'error',
          title: '加载失败',
          subtitle: error?.message || '未知错误',
        }),
      ])
      return true
    }
  },

  async onItemAction(item) {
    try {
      if (item?.meta?.defaultAction !== COPY_ACTION_ID)
        return

      const copyAction = Array.isArray(item.actions)
        ? item.actions.find(action => action.id === COPY_ACTION_ID || action.type === COPY_ACTION_ID)
        : null
      const output = typeof copyAction?.payload === 'string' ? copyAction.payload : copyAction?.payload?.text
      if (typeof output !== 'string')
        return

      const canCopy = await ensurePermission('clipboard.write', '需要剪贴板写入权限以复制 Emoji 或符号')
      if (!canCopy) {
        return {
          externalAction: true,
          success: false,
          status: 'blocked',
          reason: 'permission-denied',
          message: '缺少 clipboard.write 权限',
        }
      }

      clipboard.writeText(output)
      return { externalAction: true, status: 'started' }
    }
    catch (error) {
      logger?.error?.('[touch-emoji-symbols] Action failed', error)
    }
  },
}

module.exports = {
  ...pluginLifecycle,
  __test: {
    buildResultItems,
    parseSearchQuery,
    rankEntry,
    searchEmojiSymbols,
  },
}
