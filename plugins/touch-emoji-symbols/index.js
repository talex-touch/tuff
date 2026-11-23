const { plugin, clipboard, logger, TuffItemBuilder } = globalThis

const PLUGIN_NAME = 'touch-emoji-symbols'
const SOURCE_ID = 'plugin-features'
const ICON = { type: 'emoji', value: '🙂' }
const COPY_ACTION_ID = 'copy'
const MAX_RESULTS = 24
const QUERY_PREFIXES = ['emoji', 'symbol', 'symbols', '表情', '符号', '特殊字符']

let triggerGeneration = 0
let destroyed = false

function isStaleGeneration(generation) {
  return destroyed || generation !== triggerGeneration
}

const EMOJI_SYMBOLS = [
  {
    id: 'sparkles',
    value: '✨',
    title: 'Sparkles',
    category: 'emoji',
    keywords: ['sparkle', 'magic', 'star', '闪光', '星星'],
  },
  {
    id: 'check',
    value: '✅',
    title: 'Check Mark',
    category: 'emoji',
    keywords: ['done', 'success', 'ok', '完成', '成功'],
  },
  {
    id: 'warning',
    value: '⚠️',
    title: 'Warning',
    category: 'emoji',
    keywords: ['warn', 'alert', 'risk', '警告', '风险'],
  },
  {
    id: 'rocket',
    value: '🚀',
    title: 'Rocket',
    category: 'emoji',
    keywords: ['ship', 'launch', 'release', '发布', '启动'],
  },
  { id: 'fire', value: '🔥', title: 'Fire', category: 'emoji', keywords: ['hot', 'popular', 'awesome', '火', '热门'] },
  { id: 'eyes', value: '👀', title: 'Eyes', category: 'emoji', keywords: ['look', 'watch', 'review', '查看', '关注'] },
  {
    id: 'thinking',
    value: '🤔',
    title: 'Thinking',
    category: 'emoji',
    keywords: ['think', 'question', 'idea', '思考', '问题'],
  },
  {
    id: 'thumbs-up',
    value: '👍',
    title: 'Thumbs Up',
    category: 'emoji',
    keywords: ['like', 'approve', 'yes', '赞', '同意'],
  },
  {
    id: 'heart',
    value: '❤️',
    title: 'Heart',
    category: 'emoji',
    keywords: ['love', 'favorite', 'like', '爱心', '喜欢'],
  },
  {
    id: 'party',
    value: '🎉',
    title: 'Party Popper',
    category: 'emoji',
    keywords: ['party', 'celebrate', 'done', '庆祝', '完成'],
  },
  {
    id: 'arrow-right',
    value: '→',
    title: 'Right Arrow',
    category: 'symbol',
    keywords: ['arrow', 'right', 'next', '右箭头', '下一步'],
  },
  {
    id: 'arrow-left',
    value: '←',
    title: 'Left Arrow',
    category: 'symbol',
    keywords: ['arrow', 'left', 'back', '左箭头', '返回'],
  },
  { id: 'arrow-up', value: '↑', title: 'Up Arrow', category: 'symbol', keywords: ['arrow', 'up', 'top', '上箭头'] },
  {
    id: 'arrow-down',
    value: '↓',
    title: 'Down Arrow',
    category: 'symbol',
    keywords: ['arrow', 'down', 'bottom', '下箭头'],
  },
  { id: 'em-dash', value: '—', title: 'Em Dash', category: 'punctuation', keywords: ['dash', 'line', '破折号'] },
  { id: 'ellipsis', value: '…', title: 'Ellipsis', category: 'punctuation', keywords: ['dots', 'more', '省略号'] },
  { id: 'bullet', value: '•', title: 'Bullet', category: 'punctuation', keywords: ['dot', 'list', '项目符号'] },
  {
    id: 'middle-dot',
    value: '·',
    title: 'Middle Dot',
    category: 'punctuation',
    keywords: ['dot', 'separator', '间隔号'],
  },
  {
    id: 'degree',
    value: '°',
    title: 'Degree Sign',
    category: 'symbol',
    keywords: ['temperature', 'angle', '度', '温度'],
  },
  { id: 'copyright', value: '©', title: 'Copyright', category: 'symbol', keywords: ['copyright', 'rights', '版权'] },
  {
    id: 'registered',
    value: '®',
    title: 'Registered',
    category: 'symbol',
    keywords: ['registered', 'trademark', '注册商标'],
  },
  { id: 'trademark', value: '™', title: 'Trademark', category: 'symbol', keywords: ['trademark', 'brand', '商标'] },
  {
    id: 'multiply',
    value: '×',
    title: 'Multiplication Sign',
    category: 'math',
    keywords: ['multiply', 'times', '乘号'],
  },
  { id: 'divide', value: '÷', title: 'Division Sign', category: 'math', keywords: ['divide', 'division', '除号'] },
  { id: 'plus-minus', value: '±', title: 'Plus Minus', category: 'math', keywords: ['plus', 'minus', '正负'] },
  { id: 'not-equal', value: '≠', title: 'Not Equal', category: 'math', keywords: ['not equal', 'neq', '不等于'] },
  {
    id: 'less-equal',
    value: '≤',
    title: 'Less Than Or Equal',
    category: 'math',
    keywords: ['less equal', 'lte', '小于等于'],
  },
  {
    id: 'greater-equal',
    value: '≥',
    title: 'Greater Than Or Equal',
    category: 'math',
    keywords: ['greater equal', 'gte', '大于等于'],
  },
  { id: 'infinity', value: '∞', title: 'Infinity', category: 'math', keywords: ['infinity', 'forever', '无限'] },
  {
    id: 'currency-yuan',
    value: '¥',
    title: 'Yen / Yuan Sign',
    category: 'currency',
    keywords: ['yuan', 'yen', 'cny', '人民币', '日元'],
  },
  {
    id: 'currency-dollar',
    value: '$',
    title: 'Dollar Sign',
    category: 'currency',
    keywords: ['dollar', 'usd', '美元'],
  },
  { id: 'currency-euro', value: '€', title: 'Euro Sign', category: 'currency', keywords: ['euro', 'eur', '欧元'] },
  { id: 'currency-pound', value: '£', title: 'Pound Sign', category: 'currency', keywords: ['pound', 'gbp', '英镑'] },
  { id: 'joy', value: '😂', title: 'Face with Tears of Joy', category: 'emoji', keywords: ['laugh', 'haha', 'lol', '笑哭', '哈哈'] },
  { id: 'heart-eyes', value: '😍', title: 'Smiling Face with Heart-Eyes', category: 'emoji', keywords: ['love', 'adore', '花痴', '喜欢'] },
  { id: 'sunglasses', value: '😎', title: 'Smiling Face with Sunglasses', category: 'emoji', keywords: ['cool', 'awesome', '酷', '墨镜'] },
  { id: 'sob', value: '😭', title: 'Loudly Crying Face', category: 'emoji', keywords: ['cry', 'sad', 'tears', '大哭', '泪目'] },
  { id: 'mind-blown', value: '🤯', title: 'Exploding Head', category: 'emoji', keywords: ['shock', 'wow', 'blown', '震撼', '炸裂'] },
  { id: 'salute', value: '🫡', title: 'Saluting Face', category: 'emoji', keywords: ['salute', 'respect', 'roger', '敬礼', '收到'] },
  { id: 'melting', value: '🫠', title: 'Melting Face', category: 'emoji', keywords: ['melt', 'awkward', 'embarrassed', '融化', '尴尬'] },
  { id: 'pray', value: '🙏', title: 'Folded Hands', category: 'emoji', keywords: ['thanks', 'please', 'pray', '感谢', '拜托'] },
  { id: 'clap', value: '👏', title: 'Clapping Hands', category: 'emoji', keywords: ['clap', 'bravo', 'applause', '鼓掌', '赞赏'] },
  { id: 'handshake', value: '🤝', title: 'Handshake', category: 'emoji', keywords: ['deal', 'agree', 'partner', '合作', '握手'] },
  { id: 'bulb', value: '💡', title: 'Light Bulb', category: 'emoji', keywords: ['idea', 'tip', 'insight', '灵感', '提示'] },
  { id: 'bug', value: '🐛', title: 'Bug', category: 'emoji', keywords: ['bug', 'issue', 'fix', '缺陷', '虫子'] },
  { id: 'wrench-hammer', value: '🛠️', title: 'Hammer and Wrench', category: 'emoji', keywords: ['build', 'tools', 'fix', '工具', '维护'] },
  { id: 'zap', value: '⚡', title: 'High Voltage', category: 'emoji', keywords: ['fast', 'perf', 'lightning', '闪电', '性能'] },
  { id: 'lock', value: '🔒', title: 'Locked', category: 'emoji', keywords: ['security', 'private', 'lock', '安全', '锁定'] },
  { id: 'pin', value: '📌', title: 'Pushpin', category: 'emoji', keywords: ['pin', 'note', 'important', '置顶', '标记'] },
  { id: 'memo', value: '📝', title: 'Memo', category: 'emoji', keywords: ['docs', 'note', 'write', '文档', '记录'] },
  { id: 'package', value: '📦', title: 'Package', category: 'emoji', keywords: ['npm', 'bundle', 'release', '打包', '发版'] },
  { id: 'target', value: '🎯', title: 'Direct Hit', category: 'emoji', keywords: ['goal', 'focus', 'hit', '目标', '精准'] },
  { id: 'cross-mark', value: '❌', title: 'Cross Mark', category: 'emoji', keywords: ['error', 'fail', 'no', '错误', '失败'] },
  { id: 'hourglass', value: '⏳', title: 'Hourglass Not Done', category: 'emoji', keywords: ['wait', 'pending', 'loading', '等待', '进行中'] },
  { id: 'coffee', value: '☕', title: 'Hot Beverage', category: 'emoji', keywords: ['coffee', 'break', 'cafe', '咖啡', '休息'] },
  { id: 'rainbow', value: '🌈', title: 'Rainbow', category: 'emoji', keywords: ['rainbow', 'color', 'happy', '彩虹'] },
  { id: 'command-key', value: '⌘', title: 'Command Key', category: 'symbol', keywords: ['cmd', 'mac', 'shortcut', '快捷键', '命令键'] },
  { id: 'option-key', value: '⌥', title: 'Option Key', category: 'symbol', keywords: ['opt', 'alt', 'mac', '选项键'] },
  { id: 'shift-key', value: '⇧', title: 'Shift Key', category: 'symbol', keywords: ['shift', 'mac', 'shortcut', '上档键'] },
  { id: 'control-key', value: '⌃', title: 'Control Key', category: 'symbol', keywords: ['ctrl', 'control', 'mac', '控制键'] },
  { id: 'return-key', value: '⏎', title: 'Return Symbol', category: 'symbol', keywords: ['enter', 'return', '回车'] },
  { id: 'arrow-left-right', value: '↔', title: 'Left Right Arrow', category: 'symbol', keywords: ['arrow', 'both', 'sync', '双向箭头'] },
  { id: 'approx', value: '≈', title: 'Almost Equal To', category: 'math', keywords: ['approx', 'about', '约等于'] },
  { id: 'sqrt', value: '√', title: 'Square Root', category: 'math', keywords: ['root', 'sqrt', 'check', '根号', '对勾'] },
  { id: 'sum', value: '∑', title: 'N-Ary Summation', category: 'math', keywords: ['sum', 'sigma', 'total', '求和'] },
  { id: 'pi', value: 'π', title: 'Greek Small Letter Pi', category: 'math', keywords: ['pi', 'circle', '圆周率'] },
  { id: 'star-solid', value: '★', title: 'Black Star', category: 'symbol', keywords: ['star', 'rating', 'favorite', '实心星'] },
  { id: 'star-outline', value: '☆', title: 'White Star', category: 'symbol', keywords: ['star', 'rating', 'empty', '空心星'] },
  { id: 'section-sign', value: '§', title: 'Section Sign', category: 'punctuation', keywords: ['section', 'clause', '章节号'] },
  { id: 'currency-won', value: '₩', title: 'Won Sign', category: 'currency', keywords: ['won', 'krw', '韩元'] },
  { id: 'currency-rupee', value: '₹', title: 'Indian Rupee Sign', category: 'currency', keywords: ['rupee', 'inr', '卢比'] },
  {
    id: 'kaomoji-shrug',
    value: '¯\\_(ツ)_/¯',
    icon: '🤷',
    title: 'Shrug Kaomoji',
    category: 'kaomoji',
    keywords: ['kaomoji', '颜文字', 'shrug', 'dunno', '摊手', '无奈'],
  },
  {
    id: 'kaomoji-table-flip',
    value: '(╯°□°）╯︵ ┻━┻',
    icon: '😤',
    title: 'Table Flip Kaomoji',
    category: 'kaomoji',
    keywords: ['kaomoji', '颜文字', 'flip', 'angry', '掀桌', '生气'],
  },
  {
    id: 'kaomoji-hug',
    value: '(づ｡◕‿‿◕｡)づ',
    icon: '🤗',
    title: 'Hug Kaomoji',
    category: 'kaomoji',
    keywords: ['kaomoji', '颜文字', 'hug', 'cute', '抱抱', '可爱'],
  },
  {
    id: 'kaomoji-cheer',
    value: '(•̀ᴗ•́)و ̑̑',
    icon: '💪',
    title: 'Cheer Kaomoji',
    category: 'kaomoji',
    keywords: ['kaomoji', '颜文字', 'cheer', 'fighting', '加油', '握拳'],
  },
  {
    id: 'kaomoji-excited',
    value: '(≧▽≦)',
    icon: '😄',
    title: 'Excited Kaomoji',
    category: 'kaomoji',
    keywords: ['kaomoji', '颜文字', 'happy', 'excited', '开心', '兴奋'],
  },
  {
    id: 'kaomoji-cry',
    value: '(╥﹏╥)',
    icon: '😢',
    title: 'Crying Kaomoji',
    category: 'kaomoji',
    keywords: ['kaomoji', '颜文字', 'cry', 'sad', '哭哭', '难过'],
  },
  {
    id: 'kaomoji-side-eye',
    value: '(¬_¬)',
    icon: '😒',
    title: 'Side Eye Kaomoji',
    category: 'kaomoji',
    keywords: ['kaomoji', '颜文字', 'disapprove', 'speechless', '无语', '嫌弃'],
  },
  {
    id: 'kaomoji-confused',
    value: '(⊙_⊙)?',
    icon: '😵',
    title: 'Confused Kaomoji',
    category: 'kaomoji',
    keywords: ['kaomoji', '颜文字', 'confused', 'shock', '疑惑', '震惊'],
  },
  {
    id: 'kaomoji-smile',
    value: '(✿◠‿◠)',
    icon: '😊',
    title: 'Gentle Smile Kaomoji',
    category: 'kaomoji',
    keywords: ['kaomoji', '颜文字', 'smile', 'flower', '微笑', '温柔'],
  },
  {
    id: 'kaomoji-starry',
    value: '(★ ω ★)',
    icon: '🤩',
    title: 'Starry Eyes Kaomoji',
    category: 'kaomoji',
    keywords: ['kaomoji', '颜文字', 'star', 'amazed', '星星眼', '期待'],
  },
  {
    id: 'kaomoji-celebrate',
    value: 'ヾ(≧▽≦*)o',
    icon: '🎉',
    title: 'Celebrate Kaomoji',
    category: 'kaomoji',
    keywords: ['kaomoji', '颜文字', 'celebrate', 'party', '欢呼', '庆祝'],
  },
  {
    id: 'kaomoji-awkward',
    value: '(￣▽￣)"',
    icon: '😅',
    title: 'Awkward Smile Kaomoji',
    category: 'kaomoji',
    keywords: ['kaomoji', '颜文字', 'awkward', 'sweat', '尴尬', '擦汗'],
  },
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
  return [entry.value, entry.title, entry.category, ...(Array.isArray(entry.keywords) ? entry.keywords : [])]
    .join(' ')
    .toLowerCase()
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
  const searchable = getSearchableText(entry)
  if (searchable.includes(lower))
    return 40
  const tokens = lower.split(/\s+/).filter(Boolean)
  if (tokens.length > 1 && tokens.every(token => searchable.includes(token)))
    return 50
  return 0
}

function searchEmojiSymbols(query, limit = MAX_RESULTS) {
  const text = normalizeText(query)
  return EMOJI_SYMBOLS.map((entry, index) => ({
    ...entry,
    score: rankEntry(entry, text),
    index,
  }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
}

function buildCopyItem({ featureId, entry }) {
  return new TuffItemBuilder(`${featureId}-${entry.id}`)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(`${entry.value} ${entry.title}`)
    .setSubtitle(`${entry.category} · ${entry.keywords.slice(0, 4).join(', ')}`)
    .setIcon({ type: 'emoji', value: entry.icon || entry.value })
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
        subtitle: '试试输入 arrow、check、kaomoji、颜文字、currency、表情或中文关键词',
      }),
    ]
  }
  return results.map(entry => buildCopyItem({ featureId, entry }))
}

function classifyClipboardError(error) {
  const code = error && typeof error === 'object' && typeof error.code === 'string' ? error.code : ''
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED') {
    return {
      status: 'blocked',
      reason: 'permission-denied',
      message: '缺少 clipboard.write 权限',
    }
  }
  if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE') {
    return {
      status: 'blocked',
      reason: 'permission-unavailable',
      message: '权限系统暂时不可用',
    }
  }
  if (code === 'PLUGIN_HOST_CAPABILITY_CANCELLED') {
    return {
      status: 'cancelled',
      reason: 'cancelled',
      message: '已取消复制',
    }
  }
  if (code === 'PLUGIN_HOST_CAPABILITY_TIMEOUT' || code === 'PLUGIN_HOST_REQUEST_TIMEOUT') {
    return {
      status: 'failed',
      reason: 'timeout',
      message: '复制超时，请重试',
    }
  }
  return {
    status: 'blocked',
    reason: 'clipboard-write-failed',
    message: '复制失败',
  }
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query) {
    destroyed = false
    const generation = ++triggerGeneration
    try {
      const items = buildResultItems(featureId, query)
      if (isStaleGeneration(generation))
        return true
      await plugin.feature.clearItems()
      if (isStaleGeneration(generation))
        return true
      await plugin.feature.pushItems(items)
      return true
    }
    catch {
      logger?.error?.('[touch-emoji-symbols] feature failed')
      if (isStaleGeneration(generation))
        return true
      try {
        await plugin.feature.clearItems()
        await plugin.feature.pushItems([
          buildInfoItem({
            featureId,
            id: 'error',
            title: '加载失败',
            subtitle: '插件运行失败',
          }),
        ])
        return true
      }
      catch {
        logger?.error?.('[touch-emoji-symbols] fallback failed')
        return false
      }
    }
  },

  async onItemAction(item, context = {}) {
    try {
      if (item?.meta?.defaultAction !== COPY_ACTION_ID)
        return

      const actions = Array.isArray(item.actions) ? item.actions : []
      const requestedActionId = normalizeText(context?.actionId)
      const copyAction = requestedActionId
        ? actions.find(action => action?.id === requestedActionId) || null
        : actions.find(action => action?.id === COPY_ACTION_ID || action?.type === COPY_ACTION_ID) || null

      if (requestedActionId && !copyAction) {
        return {
          externalAction: true,
          success: false,
          status: 'blocked',
          reason: 'invalid-action',
          message: '未找到可执行操作',
        }
      }

      const output = typeof copyAction?.payload === 'string' ? copyAction.payload : copyAction?.payload?.text
      if (typeof output !== 'string')
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

      await clipboard.writeText(output)
      return { externalAction: true, status: 'started' }
    }
    catch (error) {
      logger?.error?.('[touch-emoji-symbols] clipboard write failed')
      const failure = classifyClipboardError(error)
      return {
        externalAction: true,
        success: false,
        status: failure.status,
        reason: failure.reason,
        message: failure.message,
      }
    }
  },

  async onDestroy() {
    destroyed = true
    triggerGeneration += 1
  },
}

module.exports = pluginLifecycle
