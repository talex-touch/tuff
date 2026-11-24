const { plugin, clipboard, permission, logger, TuffItemBuilder } = globalThis

const PLUGIN_NAME = 'touch-world-time'
const SOURCE_ID = 'plugin-features'
const STORE_FILE = 'world-time.json'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const MAX_PINNED = 16
const DEFAULT_PINNED = ['shanghai', 'tokyo', 'london', 'new-york', 'san-francisco', 'utc']

let activeGeneration = 0
let destroyed = false

// 52 curated global cities across Asia-Pacific, Americas, Europe, Middle East & Africa
const CITIES = Object.freeze([
  // UTC
  { id: 'utc', city: 'UTC', zh: '协调世界时', country: 'Universal', iana: 'UTC', region: 'Global', aliases: ['utc', 'gmt', 'z', 'zulu', '世界时'] },
  // Asia-Pacific (20)
  { id: 'shanghai', city: 'Shanghai', zh: '上海', country: 'China', iana: 'Asia/Shanghai', region: 'APAC', aliases: ['sh', 'shanghai', 'beijing', 'bj', 'shenzhen', 'sz', 'guangzhou', 'gz', 'hangzhou', 'hz', 'china', 'cn', '上海', '北京', '深圳', '广州', '杭州', '中国'] },
  { id: 'hong-kong', city: 'Hong Kong', zh: '香港', country: 'China', iana: 'Asia/Hong_Kong', region: 'APAC', aliases: ['hk', 'hongkong', 'hkt', '香港'] },
  { id: 'taipei', city: 'Taipei', zh: '台北', country: 'Taiwan', iana: 'Asia/Taipei', region: 'APAC', aliases: ['tpe', 'taipei', 'taiwan', 'tw', '台北', '台湾'] },
  { id: 'tokyo', city: 'Tokyo', zh: '东京', country: 'Japan', iana: 'Asia/Tokyo', region: 'APAC', aliases: ['tok', 'tyo', 'tokyo', 'osaka', 'kyoto', 'japan', 'jp', 'jst', '东京', '大阪', '日本'] },
  { id: 'seoul', city: 'Seoul', zh: '首尔', country: 'South Korea', iana: 'Asia/Seoul', region: 'APAC', aliases: ['sel', 'icn', 'seoul', 'korea', 'kr', 'kst', '首尔', '韩国'] },
  { id: 'singapore', city: 'Singapore', zh: '新加坡', country: 'Singapore', iana: 'Asia/Singapore', region: 'APAC', aliases: ['sg', 'sin', 'singapore', 'sgt', '新加坡'] },
  { id: 'bangkok', city: 'Bangkok', zh: '曼谷', country: 'Thailand', iana: 'Asia/Bangkok', region: 'APAC', aliases: ['bkk', 'bangkok', 'thailand', 'th', '曼谷', '泰国'] },
  { id: 'ho-chi-minh', city: 'Ho Chi Minh', zh: '胡志明市', country: 'Vietnam', iana: 'Asia/Ho_Chi_Minh', region: 'APAC', aliases: ['sgn', 'hcm', 'saigon', 'vietnam', 'vn', '胡志明', '越南'] },
  { id: 'jakarta', city: 'Jakarta', zh: '雅加达', country: 'Indonesia', iana: 'Asia/Jakarta', region: 'APAC', aliases: ['jkt', 'jakarta', 'indonesia', 'wib', '雅加达', '印尼'] },
  { id: 'kuala-lumpur', city: 'Kuala Lumpur', zh: '吉隆坡', country: 'Malaysia', iana: 'Asia/Kuala_Lumpur', region: 'APAC', aliases: ['kl', 'kul', 'malaysia', 'myt', '吉隆坡', '马来西亚'] },
  { id: 'manila', city: 'Manila', zh: '马尼拉', country: 'Philippines', iana: 'Asia/Manila', region: 'APAC', aliases: ['mnl', 'manila', 'philippines', 'pht', '马尼拉', '菲律宾'] },
  { id: 'bengaluru', city: 'Bengaluru', zh: '班加罗尔', country: 'India', iana: 'Asia/Kolkata', region: 'APAC', aliases: ['blr', 'bengaluru', 'bangalore', 'mumbai', 'bom', 'delhi', 'del', 'india', 'in', 'ist', '班加罗尔', '孟买', '新德里', '印度'] },
  { id: 'dubai', city: 'Dubai', zh: '迪拜', country: 'UAE', iana: 'Asia/Dubai', region: 'MENA', aliases: ['dxb', 'dubai', 'abudhabi', 'uae', 'gst', '迪拜', '阿联酋'] },
  { id: 'riyadh', city: 'Riyadh', zh: '利雅得', country: 'Saudi Arabia', iana: 'Asia/Riyadh', region: 'MENA', aliases: ['ruh', 'riyadh', 'saudi', '利雅得', '沙特'] },
  { id: 'tel-aviv', city: 'Tel Aviv', zh: '特拉维夫', country: 'Israel', iana: 'Asia/Jerusalem', region: 'MENA', aliases: ['tlv', 'telaviv', 'jerusalem', 'israel', '特拉维夫', '以色列'] },
  { id: 'sydney', city: 'Sydney', zh: '悉尼', country: 'Australia', iana: 'Australia/Sydney', region: 'APAC', aliases: ['syd', 'sydney', 'australia', 'au', 'aest', 'aedt', '悉尼', '澳大利亚'] },
  { id: 'melbourne', city: 'Melbourne', zh: '墨尔本', country: 'Australia', iana: 'Australia/Melbourne', region: 'APAC', aliases: ['mel', 'melbourne', '墨尔本'] },
  { id: 'perth', city: 'Perth', zh: '珀斯', country: 'Australia', iana: 'Australia/Perth', region: 'APAC', aliases: ['per', 'perth', 'awst', '珀斯'] },
  { id: 'auckland', city: 'Auckland', zh: '奥克兰', country: 'New Zealand', iana: 'Pacific/Auckland', region: 'APAC', aliases: ['akl', 'auckland', 'nz', 'nzst', 'nzdt', '奥克兰', '新西兰'] },
  { id: 'honolulu', city: 'Honolulu', zh: '火奴鲁鲁', country: 'USA', iana: 'Pacific/Honolulu', region: 'Americas', aliases: ['hnl', 'honolulu', 'hawaii', 'hst', '夏威夷', '火奴鲁鲁'] },
  // Americas (13)
  { id: 'san-francisco', city: 'San Francisco', zh: '旧金山', country: 'USA', iana: 'America/Los_Angeles', region: 'Americas', aliases: ['sf', 'sfo', 'bay', 'siliconvalley', 'la', 'lax', 'losangeles', 'seattle', 'sea', 'pt', 'pacific', '旧金山', '洛杉矶', '西雅图', '硅谷'] },
  { id: 'vancouver', city: 'Vancouver', zh: '温哥华', country: 'Canada', iana: 'America/Vancouver', region: 'Americas', aliases: ['yvr', 'van', 'vancouver', '温哥华'] },
  { id: 'denver', city: 'Denver', zh: '丹佛', country: 'USA', iana: 'America/Denver', region: 'Americas', aliases: ['den', 'denver', 'saltlake', 'mt', 'mountain', '丹佛'] },
  { id: 'chicago', city: 'Chicago', zh: '芝加哥', country: 'USA', iana: 'America/Chicago', region: 'Americas', aliases: ['chi', 'ord', 'chicago', 'austin', 'dallas', 'houston', 'ct', 'us-cst', 'cdt', '芝加哥', '奥斯汀', '达拉斯'] },
  { id: 'new-york', city: 'New York', zh: '纽约', country: 'USA', iana: 'America/New_York', region: 'Americas', aliases: ['ny', 'nyc', 'jfk', 'newyork', 'boston', 'bos', 'miami', 'mia', 'dc', 'et', 'eastern', '纽约', '波士顿', '华盛顿', '迈阿密'] },
  { id: 'toronto', city: 'Toronto', zh: '多伦多', country: 'Canada', iana: 'America/Toronto', region: 'Americas', aliases: ['yyz', 'tor', 'toronto', 'montreal', 'canada', 'ca', '多伦多', '蒙特利尔', '加拿大'] },
  { id: 'mexico-city', city: 'Mexico City', zh: '墨西哥城', country: 'Mexico', iana: 'America/Mexico_City', region: 'Americas', aliases: ['mex', 'cdmx', 'mexico', '墨西哥城'] },
  { id: 'bogota', city: 'Bogotá', zh: '波哥大', country: 'Colombia', iana: 'America/Bogota', region: 'Americas', aliases: ['bog', 'bogota', 'colombia', '波哥大'] },
  { id: 'lima', city: 'Lima', zh: '利马', country: 'Peru', iana: 'America/Lima', region: 'Americas', aliases: ['lim', 'lima', 'peru', '利马'] },
  { id: 'santiago', city: 'Santiago', zh: '圣地亚哥', country: 'Chile', iana: 'America/Santiago', region: 'Americas', aliases: ['scl', 'santiago', 'chile', '圣地亚哥'] },
  { id: 'sao-paulo', city: 'São Paulo', zh: '圣保罗', country: 'Brazil', iana: 'America/Sao_Paulo', region: 'Americas', aliases: ['gru', 'sp', 'saopaulo', 'brazil', 'br', 'brt', '圣保罗', '巴西'] },
  { id: 'buenos-aires', city: 'Buenos Aires', zh: '布宜诺斯艾利斯', country: 'Argentina', iana: 'America/Argentina/Buenos_Aires', region: 'Americas', aliases: ['eze', 'ba', 'buenosaires', 'argentina', '布宜诺斯艾利斯'] },
  { id: 'phoenix', city: 'Phoenix', zh: '凤凰城', country: 'USA', iana: 'America/Phoenix', region: 'Americas', aliases: ['phx', 'phoenix', 'arizona', '凤凰城'] },
  // Europe & Africa (18)
  { id: 'london', city: 'London', zh: '伦敦', country: 'UK', iana: 'Europe/London', region: 'EMEA', aliases: ['ldn', 'lhr', 'lon', 'london', 'uk', 'britain', 'bst', '伦敦', '英国'] },
  { id: 'dublin', city: 'Dublin', zh: '都柏林', country: 'Ireland', iana: 'Europe/Dublin', region: 'EMEA', aliases: ['dub', 'dublin', 'ireland', '都柏林', '爱尔兰'] },
  { id: 'lisbon', city: 'Lisbon', zh: '里斯本', country: 'Portugal', iana: 'Europe/Lisbon', region: 'EMEA', aliases: ['lis', 'lisbon', 'portugal', 'wet', '里斯本', '葡萄牙'] },
  { id: 'paris', city: 'Paris', zh: '巴黎', country: 'France', iana: 'Europe/Paris', region: 'EMEA', aliases: ['par', 'cdg', 'paris', 'france', 'fr', '巴黎', '法国'] },
  { id: 'berlin', city: 'Berlin', zh: '柏林', country: 'Germany', iana: 'Europe/Berlin', region: 'EMEA', aliases: ['ber', 'berlin', 'munich', 'muc', 'frankfurt', 'fra', 'germany', 'de', '柏林', '慕尼黑', '法兰克福', '德国'] },
  { id: 'amsterdam', city: 'Amsterdam', zh: '阿姆斯特丹', country: 'Netherlands', iana: 'Europe/Amsterdam', region: 'EMEA', aliases: ['ams', 'amsterdam', 'netherlands', 'nl', '阿姆斯特丹', '荷兰'] },
  { id: 'zurich', city: 'Zurich', zh: '苏黎世', country: 'Switzerland', iana: 'Europe/Zurich', region: 'EMEA', aliases: ['zrh', 'zur', 'zurich', 'geneva', 'switzerland', 'ch', '苏黎世', '日内瓦', '瑞士'] },
  { id: 'madrid', city: 'Madrid', zh: '马德里', country: 'Spain', iana: 'Europe/Madrid', region: 'EMEA', aliases: ['mad', 'madrid', 'barcelona', 'bcn', 'spain', 'es', '马德里', '巴塞罗那', '西班牙'] },
  { id: 'rome', city: 'Rome', zh: '罗马', country: 'Italy', iana: 'Europe/Rome', region: 'EMEA', aliases: ['rom', 'fco', 'rome', 'milan', 'mxp', 'italy', 'it', '罗马', '米兰', '意大利'] },
  { id: 'stockholm', city: 'Stockholm', zh: '斯德哥尔摩', country: 'Sweden', iana: 'Europe/Stockholm', region: 'EMEA', aliases: ['arn', 'sto', 'stockholm', 'sweden', 'se', '斯德哥尔摩', '瑞典'] },
  { id: 'warsaw', city: 'Warsaw', zh: '华沙', country: 'Poland', iana: 'Europe/Warsaw', region: 'EMEA', aliases: ['waw', 'warsaw', 'poland', 'pl', '华沙', '波兰'] },
  { id: 'prague', city: 'Prague', zh: '布拉格', country: 'Czechia', iana: 'Europe/Prague', region: 'EMEA', aliases: ['prg', 'prague', 'czech', '布拉格', '捷克'] },
  { id: 'vienna', city: 'Vienna', zh: '维也纳', country: 'Austria', iana: 'Europe/Vienna', region: 'EMEA', aliases: ['vie', 'vienna', 'austria', '维也纳', '奥地利'] },
  { id: 'helsinki', city: 'Helsinki', zh: '赫尔辛基', country: 'Finland', iana: 'Europe/Helsinki', region: 'EMEA', aliases: ['hel', 'helsinki', 'finland', 'eet', '赫尔辛基', '芬兰'] },
  { id: 'athens', city: 'Athens', zh: '雅典', country: 'Greece', iana: 'Europe/Athens', region: 'EMEA', aliases: ['ath', 'athens', 'greece', '雅典', '希腊'] },
  { id: 'istanbul', city: 'Istanbul', zh: '伊斯坦布尔', country: 'Turkey', iana: 'Europe/Istanbul', region: 'EMEA', aliases: ['ist-tr', 'istanbul', 'turkey', 'trt', '伊斯坦布尔', '土耳其'] },
  { id: 'cairo', city: 'Cairo', zh: '开罗', country: 'Egypt', iana: 'Africa/Cairo', region: 'EMEA', aliases: ['cai', 'cairo', 'egypt', '开罗', '埃及'] },
  { id: 'johannesburg', city: 'Johannesburg', zh: '约翰内斯堡', country: 'South Africa', iana: 'Africa/Johannesburg', region: 'EMEA', aliases: ['jnb', 'johannesburg', 'capetown', 'sast', '约翰内斯堡', '南非'] },
  { id: 'nairobi', city: 'Nairobi', zh: '内罗毕', country: 'Kenya', iana: 'Africa/Nairobi', region: 'EMEA', aliases: ['nbo', 'nairobi', 'kenya', 'eat', '内罗毕', '肯尼亚'] },
])

// Explicit fixed-offset timezone abbreviations for deterministic time conversions
const FIXED_ABBREVS = Object.freeze({
  'utc': { code: 'UTC', label: 'UTC', zh: '协调世界时', offsetMin: 0, iana: 'UTC', cityId: 'utc' },
  'gmt': { code: 'GMT', label: 'GMT / UTC', zh: '格林威治时间', offsetMin: 0, iana: 'UTC', cityId: 'utc' },
  'z': { code: 'UTC', label: 'UTC (Z)', zh: '协调世界时', offsetMin: 0, iana: 'UTC', cityId: 'utc' },
  'pst': { code: 'PST', label: 'PST (UTC-8)', zh: '太平洋标准时间', offsetMin: -480, iana: 'America/Los_Angeles', cityId: 'san-francisco' },
  'pdt': { code: 'PDT', label: 'PDT (UTC-7)', zh: '太平洋夏令时', offsetMin: -420, iana: 'America/Los_Angeles', cityId: 'san-francisco' },
  'mst': { code: 'MST', label: 'MST (UTC-7)', zh: '山地标准时间', offsetMin: -420, iana: 'America/Denver', cityId: 'denver' },
  'mdt': { code: 'MDT', label: 'MDT (UTC-6)', zh: '山地夏令时', offsetMin: -360, iana: 'America/Denver', cityId: 'denver' },
  'est': { code: 'EST', label: 'EST (UTC-5)', zh: '美东标准时间', offsetMin: -300, iana: 'America/New_York', cityId: 'new-york' },
  'edt': { code: 'EDT', label: 'EDT (UTC-4)', zh: '美东夏令时', offsetMin: -240, iana: 'America/New_York', cityId: 'new-york' },
  'cdt': { code: 'CDT', label: 'US CDT (UTC-5)', zh: '美中夏令时', offsetMin: -300, iana: 'America/Chicago', cityId: 'chicago' },
  'us-cst': { code: 'US CST', label: 'US Central (UTC-6)', zh: '美中标准时间', offsetMin: -360, iana: 'America/Chicago', cityId: 'chicago' },
  'cst': { code: 'CST', label: 'China CST (UTC+8)', zh: '中国标准时间', offsetMin: 480, iana: 'Asia/Shanghai', cityId: 'shanghai', ambiguousUsCstOffsetMin: -360 },
  'bst': { code: 'BST', label: 'BST (UTC+1)', zh: '英国夏令时', offsetMin: 60, iana: 'Europe/London', cityId: 'london' },
  'cet': { code: 'CET', label: 'CET (UTC+1)', zh: '中欧标准时间', offsetMin: 60, iana: 'Europe/Berlin', cityId: 'berlin' },
  'cest': { code: 'CEST', label: 'CEST (UTC+2)', zh: '中欧夏令时', offsetMin: 120, iana: 'Europe/Berlin', cityId: 'berlin' },
  'eet': { code: 'EET', label: 'EET (UTC+2)', zh: '东欧标准时间', offsetMin: 120, iana: 'Europe/Helsinki', cityId: 'helsinki' },
  'eest': { code: 'EEST', label: 'EEST (UTC+3)', zh: '东欧夏令时', offsetMin: 180, iana: 'Europe/Helsinki', cityId: 'helsinki' },
  'ist': { code: 'IST', label: 'IST (UTC+5:30)', zh: '印度标准时间', offsetMin: 330, iana: 'Asia/Kolkata', cityId: 'bengaluru' },
  'sgt': { code: 'SGT', label: 'SGT (UTC+8)', zh: '新加坡时间', offsetMin: 480, iana: 'Asia/Singapore', cityId: 'singapore' },
  'hkt': { code: 'HKT', label: 'HKT (UTC+8)', zh: '香港时间', offsetMin: 480, iana: 'Asia/Hong_Kong', cityId: 'hong-kong' },
  'jst': { code: 'JST', label: 'JST (UTC+9)', zh: '日本标准时间', offsetMin: 540, iana: 'Asia/Tokyo', cityId: 'tokyo' },
  'kst': { code: 'KST', label: 'KST (UTC+9)', zh: '韩国标准时间', offsetMin: 540, iana: 'Asia/Seoul', cityId: 'seoul' },
  'aest': { code: 'AEST', label: 'AEST (UTC+10)', zh: '澳东标准时间', offsetMin: 600, iana: 'Australia/Sydney', cityId: 'sydney' },
  'aedt': { code: 'AEDT', label: 'AEDT (UTC+11)', zh: '澳东夏令时', offsetMin: 660, iana: 'Australia/Sydney', cityId: 'sydney' },
  'nzst': { code: 'NZST', label: 'NZST (UTC+12)', zh: '新西兰标准时间', offsetMin: 720, iana: 'Pacific/Auckland', cityId: 'auckland' },
  'nzdt': { code: 'NZDT', label: 'NZDT (UTC+13)', zh: '新西兰夏令时', offsetMin: 780, iana: 'Pacific/Auckland', cityId: 'auckland' },
})

const CITY_BY_ID = new Map(CITIES.map(c => [c.id, c]))

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getQueryText(query) {
  if (typeof query === 'string')
    return query
  return query?.text ?? ''
}

function normalizeLookupKey(str) {
  return normalizeText(str).toLowerCase().replace(/\s+/g, '')
}

function formatOffsetMinutes(offsetMin) {
  const sign = offsetMin >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMin)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${String(m).padStart(2, '0')}`
}

function pad2(n) {
  return String(Math.trunc(n)).padStart(2, '0')
}

function getPartsInIana(iana, epochMs) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: iana,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.create(null)
  for (const part of formatter.formatToParts(new Date(epochMs))) {
    if (part.type !== 'literal')
      parts[part.type] = part.value
  }
  const year = Number.parseInt(parts.year, 10)
  const month = Number.parseInt(parts.month, 10)
  const day = Number.parseInt(parts.day, 10)
  let hour = Number.parseInt(parts.hour, 10)
  if (hour === 24)
    hour = 0
  const minute = Number.parseInt(parts.minute, 10)
  const second = Number.parseInt(parts.second, 10)
  return {
    year,
    month,
    day,
    weekday: parts.weekday || '',
    hour,
    minute,
    second,
  }
}

function getZoneOffsetMinutes(iana, epochMs) {
  const p = getPartsInIana(iana, epochMs)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  const baseSec = Math.floor(epochMs / 1000) * 1000
  return Math.round((asUtc - baseSec) / 60000)
}

function getPartsWithFixedOffset(offsetMin, epochMs) {
  const shifted = new Date(epochMs + offsetMin * 60000)
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: weekdays[shifted.getUTCDay()],
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  }
}

function format12Hour(hour, minute) {
  const period = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 || 12
  return `${h12}:${pad2(minute)} ${period}`
}

function getDayPhase(hour) {
  if (hour >= 9 && hour < 18)
    return { icon: '☀️', label: '工作时段', tier: 'golden', score: 3 }
  if (hour === 8 || (hour >= 18 && hour < 21))
    return { icon: '🌅', label: '弹性时段', tier: 'flexible', score: 2 }
  if (hour === 7 || hour === 21)
    return { icon: '🌆', label: '非工作时段', tier: 'stretch', score: 1 }
  return { icon: '🌙', label: '夜间休息', tier: 'sleep', score: 0 }
}

function parseUtcOffsetLiteral(token) {
  const m = token.trim().match(/^(?:utc|gmt)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i)
  if (!m)
    return null
  const sign = m[1] === '-' ? -1 : 1
  const h = Number.parseInt(m[2], 10)
  const min = m[3] ? Number.parseInt(m[3], 10) : 0
  if (h > 14 || min >= 60)
    return null
  const offsetMin = sign * (h * 60 + min)
  const label = formatOffsetMinutes(offsetMin)
  return {
    kind: 'fixed',
    id: `offset-${offsetMin}`,
    label,
    zh: label,
    offsetMin,
    code: label,
  }
}

function resolveZoneTarget(rawToken) {
  const cleaned = normalizeText(rawToken)
  if (!cleaned)
    return null

  // 1. Explicit UTC+8 / GMT-5 literal
  const offsetTarget = parseUtcOffsetLiteral(cleaned)
  if (offsetTarget)
    return offsetTarget

  const lower = cleaned.toLowerCase()
  const compact = normalizeLookupKey(cleaned)

  // 2. Fixed timezone abbreviation (`PST`, `EST`, `CST`, `CET`, `JST`, `UTC`, ...)
  if (Object.prototype.hasOwnProperty.call(FIXED_ABBREVS, lower)) {
    const ab = FIXED_ABBREVS[lower]
    return {
      kind: 'fixed',
      id: ab.cityId || lower,
      code: ab.code,
      label: ab.label,
      zh: ab.zh,
      offsetMin: ab.offsetMin,
      iana: ab.iana,
      city: ab.cityId ? CITY_BY_ID.get(ab.cityId) : null,
      ambiguousUsCstOffsetMin: ab.ambiguousUsCstOffsetMin,
    }
  }

  // 3. Exact city id / city name / alias / Chinese name / IANA match
  for (const city of CITIES) {
    if (
      city.id === lower
      || normalizeLookupKey(city.city) === compact
      || city.zh === cleaned
      || city.iana.toLowerCase() === lower
      || city.aliases.some(a => normalizeLookupKey(a) === compact)
    ) {
      return {
        kind: 'city',
        id: city.id,
        label: city.city,
        zh: city.zh,
        iana: city.iana,
        city,
      }
    }
  }

  // 4. Prefix match on city name or alias
  for (const city of CITIES) {
    if (
      normalizeLookupKey(city.city).startsWith(compact)
      || city.zh.includes(cleaned)
      || city.aliases.some(a => normalizeLookupKey(a).startsWith(compact))
    ) {
      return {
        kind: 'city',
        id: city.id,
        label: city.city,
        zh: city.zh,
        iana: city.iana,
        city,
      }
    }
  }

  // 5. Direct valid IANA timezone (e.g. `America/Anchorage`, `Europe/Oslo`)
  if (cleaned.includes('/')) {
    try {
      Intl.DateTimeFormat('en-US', { timeZone: cleaned }).resolvedOptions()
      const shortCity = cleaned.split('/').at(-1).replace(/_/g, ' ')
      return {
        kind: 'iana',
        id: cleaned.toLowerCase(),
        label: shortCity,
        zh: shortCity,
        iana: cleaned,
      }
    }
    catch {
      return null
    }
  }

  return null
}

function searchCities(queryText) {
  const q = normalizeText(queryText).toLowerCase()
  const compact = normalizeLookupKey(queryText)
  if (!q)
    return CITIES

  const scored = []
  // Check if query matches a fixed abbreviation first
  if (Object.prototype.hasOwnProperty.call(FIXED_ABBREVS, q)) {
    const ab = FIXED_ABBREVS[q]
    if (ab.cityId && CITY_BY_ID.has(ab.cityId)) {
      scored.push({ city: CITY_BY_ID.get(ab.cityId), score: 100 })
    }
  }

  for (const city of CITIES) {
    if (scored.some(entry => entry.city.id === city.id))
      continue
    let score = 0
    if (city.id === q || normalizeLookupKey(city.city) === compact || city.zh === queryText.trim()) {
      score = 95
    }
    else if (city.aliases.some(a => normalizeLookupKey(a) === compact)) {
      score = 90
    }
    else if (normalizeLookupKey(city.city).startsWith(compact) || city.zh.startsWith(queryText.trim())) {
      score = 75
    }
    else if (city.aliases.some(a => normalizeLookupKey(a).startsWith(compact))) {
      score = 65
    }
    else if (
      city.city.toLowerCase().includes(q)
      || city.zh.includes(queryText.trim())
      || city.country.toLowerCase().includes(q)
      || city.iana.toLowerCase().includes(q)
      || city.region.toLowerCase().includes(q)
    ) {
      score = 40
    }

    if (score > 0)
      scored.push({ city, score })
  }

  scored.sort((a, b) => b.score - a.score || a.city.city.localeCompare(b.city.city))
  return scored.map(entry => entry.city)
}

function resolveInstantForWallClock(year, month, day, hour, minute, sourceZone) {
  const wallUtc = Date.UTC(year, month - 1, day, hour, minute, 0)
  if (sourceZone.kind === 'fixed')
    return wallUtc - sourceZone.offsetMin * 60000
  const off1 = getZoneOffsetMinutes(sourceZone.iana, wallUtc)
  const pass1 = wallUtc - off1 * 60000
  const off2 = getZoneOffsetMinutes(sourceZone.iana, pass1)
  return wallUtc - off2 * 60000
}

function getZoneSnapshot(zone, epochMs) {
  if (zone.kind === 'fixed') {
    const parts = getPartsWithFixedOffset(zone.offsetMin, epochMs)
    return {
      parts,
      offsetMin: zone.offsetMin,
      offsetLabel: formatOffsetMinutes(zone.offsetMin),
    }
  }
  const parts = getPartsInIana(zone.iana, epochMs)
  const offsetMin = getZoneOffsetMinutes(zone.iana, epochMs)
  return {
    parts,
    offsetMin,
    offsetLabel: formatOffsetMinutes(offsetMin),
  }
}

function dayDeltaBetween(baseParts, targetParts) {
  const baseUtc = Date.UTC(baseParts.year, baseParts.month - 1, baseParts.day)
  const targetUtc = Date.UTC(targetParts.year, targetParts.month - 1, targetParts.day)
  return Math.round((targetUtc - baseUtc) / 86400000)
}

function formatDayDelta(delta) {
  if (delta === 0)
    return ''
  return delta > 0 ? ` (+${delta}d)` : ` (${delta}d)`
}

function parseClockTime(rawTime) {
  const m = rawTime.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (!m)
    return null
  let hour = Number.parseInt(m[1], 10)
  const minute = m[2] ? Number.parseInt(m[2], 10) : 0
  const meridiem = m[3] ? m[3].toLowerCase() : ''
  if (minute < 0 || minute > 59)
    return null
  if (meridiem) {
    if (hour < 1 || hour > 12)
      return null
    if (meridiem === 'pm' && hour !== 12)
      hour += 12
    else if (meridiem === 'am' && hour === 12)
      hour = 0
  }
  else {
    if (!m[2] && hour > 23)
      return null
    if (hour < 0 || hour > 23)
      return null
  }
  return { hour, minute }
}

// Natural Time Conversion Parser:
// - `14:00 PST to CST/UTC/Tokyo`
// - `9:30am nyc to london, berlin, sg`
// - `2pm sf in shanghai`
// - `2026-07-15 15:00 london -> nyc/tokyo`
// - `14:00 PST` (defaults targets to pinned cities + UTC)
function tryParseTimeConversion(raw, nowMs) {
  const text = normalizeText(raw)
  const prefixMatch = text.match(/^(?:(today|tomorrow|yesterday|\d{4}-\d{2}-\d{2})\s+)?(\d{1,2}(?::\d{2})?(?:[ \t]*(?:am|pm))?)\s+(\S.*)$/i)
  if (!prefixMatch)
    return null

  const rest = prefixMatch[3].trim()
  const sep = /\s+(?:to|in|->|=>)\s+/i.exec(rest)
  const zonePart = (sep ? rest.slice(0, sep.index) : rest).trim()
  const targetPart = sep ? rest.slice(sep.index + sep[0].length).trim() : undefined
  if (!/^[a-z\u4E00-\u9FA5][\w\u4E00-\u9FA5/+\- ]*$/i.test(zonePart))
    return null
  const match = [prefixMatch[0], prefixMatch[1], prefixMatch[2], zonePart, targetPart]

  // Require either colon or am/pm so plain numbers like "2026" don't misparse as hours
  if (!match[2].includes(':') && !/[ap]m$/i.test(match[2].trim()))
    return null

  const clock = parseClockTime(match[2])
  if (!clock)
    return null

  const sourceZone = resolveZoneTarget(match[3])
  if (!sourceZone)
    return null

  // Determine anchor date in source zone
  const baseSnapshot = getZoneSnapshot(sourceZone, nowMs)
  let year = baseSnapshot.parts.year
  let month = baseSnapshot.parts.month
  let day = baseSnapshot.parts.day

  if (match[1]) {
    const dateToken = match[1].toLowerCase()
    if (dateToken === 'tomorrow') {
      const next = new Date(Date.UTC(year, month - 1, day + 1))
      year = next.getUTCFullYear()
      month = next.getUTCMonth() + 1
      day = next.getUTCDate()
    }
    else if (dateToken === 'yesterday') {
      const prev = new Date(Date.UTC(year, month - 1, day - 1))
      year = prev.getUTCFullYear()
      month = prev.getUTCMonth() + 1
      day = prev.getUTCDate()
    }
    else if (/^\d{4}-\d{2}-\d{2}$/.test(dateToken)) {
      const parts = dateToken.split('-').map(n => Number.parseInt(n, 10))
      year = parts[0]
      month = parts[1]
      day = parts[2]
    }
  }

  const epochMs = resolveInstantForWallClock(year, month, day, clock.hour, clock.minute, sourceZone)
  const sourceSnap = getZoneSnapshot(sourceZone, epochMs)

  const targets = []
  if (match[4]) {
    const rawTargets = match[4]
      .split(/[,/，、|]+|\s+and\s+/i)
      .map(s => s.trim())
      .filter(Boolean)
    for (const token of rawTargets) {
      const resolved = resolveZoneTarget(token)
      if (resolved)
        targets.push(resolved)
    }
  }

  return {
    epochMs,
    sourceZone,
    sourceSnap,
    explicitTargets: targets,
  }
}

// =============================================================================
// Golden-Hours Team Meeting Overlap Planner
// =============================================================================

function planMeetingOverlap(cities, nowMs) {
  const unique = []
  const seenIana = new Set()
  for (const c of cities) {
    if (!c || seenIana.has(c.iana))
      continue
    seenIana.add(c.iana)
    unique.push(c)
  }
  if (unique.length < 2)
    return null

  const now = new Date(nowMs)
  const baseUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)

  const slots = []
  for (let utcHour = 0; utcHour < 24; utcHour += 1) {
    const instant = baseUtcMidnight + utcHour * 3600000
    const cityTimes = unique.map((city) => {
      const parts = getPartsInIana(city.iana, instant)
      const phase = getDayPhase(parts.hour)
      return {
        city,
        hour: parts.hour,
        minute: parts.minute,
        weekday: parts.weekday,
        phase,
      }
    })
    const allGolden = cityTimes.every(t => t.phase.tier === 'golden')
    const allWorkOrFlex = cityTimes.every(t => t.phase.tier === 'golden' || t.phase.tier === 'flexible')
    const sleepCount = cityTimes.filter(t => t.phase.tier === 'sleep').length
    const minScore = Math.min(...cityTimes.map(t => t.phase.score))
    const totalScore = cityTimes.reduce((sum, t) => sum + t.phase.score, 0)
    slots.push({
      utcHour,
      instant,
      cityTimes,
      allGolden,
      allWorkOrFlex,
      sleepCount,
      minScore,
      totalScore,
    })
  }

  // Group contiguous golden windows (or flexible windows if no strict golden window exists)
  const goldenSlots = slots.filter(s => s.allGolden)
  const flexSlots = slots.filter(s => s.allWorkOrFlex)
  const rankedSlots = [...slots].sort((a, b) =>
    (b.allGolden ? 1 : 0) - (a.allGolden ? 1 : 0)
    || (b.allWorkOrFlex ? 1 : 0) - (a.allWorkOrFlex ? 1 : 0)
    || a.sleepCount - b.sleepCount
    || b.minScore - a.minScore
    || b.totalScore - a.totalScore
    || a.utcHour - b.utcHour,
  )

  function groupContiguous(list) {
    if (!list.length)
      return []
    const sorted = [...list].sort((a, b) => a.utcHour - b.utcHour)
    const ranges = []
    let start = sorted[0]
    let prev = sorted[0]
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].utcHour === prev.utcHour + 1) {
        prev = sorted[i]
      }
      else {
        ranges.push({ startHour: start.utcHour, endHour: (prev.utcHour + 1) % 24, hours: prev.utcHour - start.utcHour + 1, sample: start })
        start = sorted[i]
        prev = sorted[i]
      }
    }
    ranges.push({ startHour: start.utcHour, endHour: (prev.utcHour + 1) % 24, hours: prev.utcHour - start.utcHour + 1, sample: start })
    return ranges
  }

  return {
    cities: unique,
    goldenWindows: groupContiguous(goldenSlots),
    flexWindows: groupContiguous(flexSlots),
    topSlots: rankedSlots.slice(0, 6),
    hasStrictGolden: goldenSlots.length > 0,
    hasFlexOverlap: flexSlots.length > 0,
  }
}

function formatSlotLine(slot) {
  const parts = slot.cityTimes.map(
    ct => `${ct.city.city} ${pad2(ct.hour)}:${pad2(ct.minute)} ${ct.phase.icon}`,
  )
  return `${pad2(slot.utcHour)}:00 UTC · ${parts.join(' | ')}`
}

// =============================================================================
// Storage & Permission Gates
// =============================================================================

function parseStore(raw) {
  if (!raw)
    return { version: 1, pinned: [...DEFAULT_PINNED] }
  if (typeof raw === 'string') {
    try {
      return parseStore(JSON.parse(raw))
    }
    catch {
      return { version: 1, pinned: [...DEFAULT_PINNED] }
    }
  }
  const rawPinned = Array.isArray(raw?.pinned) ? raw.pinned : null
  if (!rawPinned)
    return { version: 1, pinned: [...DEFAULT_PINNED] }
  const cleaned = []
  const seen = new Set()
  for (const id of rawPinned) {
    const norm = normalizeText(id).toLowerCase()
    if (CITY_BY_ID.has(norm) && !seen.has(norm)) {
      seen.add(norm)
      cleaned.push(norm)
      if (cleaned.length >= MAX_PINNED)
        break
    }
  }
  return { version: 1, pinned: cleaned.length ? cleaned : [...DEFAULT_PINNED] }
}

async function loadPinned() {
  if (typeof plugin?.storage?.getFile !== 'function')
    return [...DEFAULT_PINNED]
  try {
    const raw = await plugin.storage.getFile(STORE_FILE)
    return parseStore(raw).pinned
  }
  catch {
    logger?.warn?.('[touch-world-time] Failed to read pinned cities')
    return [...DEFAULT_PINNED]
  }
}

async function savePinned(pinnedIds) {
  if (typeof plugin?.storage?.setFile !== 'function')
    return false
  const unique = []
  const seen = new Set()
  for (const id of pinnedIds) {
    if (CITY_BY_ID.has(id) && !seen.has(id)) {
      seen.add(id)
      unique.push(id)
      if (unique.length >= MAX_PINNED)
        break
    }
  }
  await plugin.storage.setFile(STORE_FILE, { version: 1, pinned: unique })
  return true
}

async function ensurePermission(permissionId) {
  if (!permission || typeof permission.check !== 'function')
    return { granted: false, reason: 'permission-sdk-unavailable', message: '权限系统不可用' }
  try {
    if ((await permission.check(permissionId)) === true)
      return { granted: true, reason: '', message: '' }
    return { granted: false, reason: 'permission-denied', message: `缺少 ${permissionId} 权限` }
  }
  catch {
    logger?.warn?.('[touch-world-time] Permission check failed')
    return { granted: false, reason: 'permission-check-failed', message: '权限检查失败' }
  }
}

async function copyWithPermissionGate(text) {
  const perm = await ensurePermission('clipboard.write')
  if (!perm.granted) {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: perm.reason,
      message: perm.message,
    }
  }
  if (typeof clipboard?.writeText !== 'function') {
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: 'clipboard-unavailable',
      message: '当前环境不支持写入剪贴板',
    }
  }
  try {
    await clipboard.writeText(String(text))
    return { externalAction: true, success: true, status: 'started', message: '已复制到剪贴板' }
  }
  catch (error) {
    logger?.error?.('[touch-world-time] Clipboard write failed')
    const denied = error?.code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
    const unavailable = error?.code === 'PLUGIN_HOST_CAPABILITY_UNAVAILABLE'
    return {
      externalAction: true,
      success: false,
      status: 'blocked',
      reason: denied ? 'permission-denied' : unavailable ? 'capability-unavailable' : 'clipboard-write-failed',
      message: denied ? '缺少 clipboard.write 权限' : unavailable ? '剪贴板服务暂不可用' : '复制失败',
    }
  }
}

function buildItem({ id, featureId, title, subtitle, accessory, actions = [], defaultAction }) {
  const builder = new TuffItemBuilder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle || '')
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: defaultAction ?? (actions[0]?.id || 'none'),
    })
  if (accessory && typeof builder.setAccessory === 'function')
    builder.setAccessory(accessory)
  for (const action of actions)
    builder.createAndAddAction(action.id, 'plugin', action.label, action.payload)
  return builder.build()
}

function buildCityClockItem(featureId, city, nowMs, pinnedSet) {
  const parts = getPartsInIana(city.iana, nowMs)
  const offsetMin = getZoneOffsetMinutes(city.iana, nowMs)
  const offsetStr = formatOffsetMinutes(offsetMin)
  const phase = getDayPhase(parts.hour)
  const time24 = `${pad2(parts.hour)}:${pad2(parts.minute)}`
  const time12 = format12Hour(parts.hour, parts.minute)
  const dateStr = `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)} ${parts.weekday}`
  const isPinned = pinnedSet.has(city.id)
  const copyText = `${city.city} (${offsetStr}): ${dateStr} ${time24} (${time12})`

  return buildItem({
    id: `${featureId}-city-${city.id}`,
    featureId,
    title: `${phase.icon} ${city.city} (${city.zh})  ${time24}`,
    subtitle: `${dateStr} · ${time12} · ${offsetStr} · ${city.iana} · ${phase.label}`,
    accessory: isPinned ? `★ ${offsetStr}` : offsetStr,
    actions: [
      { id: 'copy-time', label: '复制时间', payload: { text: copyText } },
      isPinned
        ? { id: 'unpin-city', label: '取消置顶', payload: { cityId: city.id } }
        : { id: 'pin-city', label: '置顶城市', payload: { cityId: city.id } },
    ],
    defaultAction: 'copy-time',
  })
}

function buildConversionItems(featureId, parsed, pinnedIds) {
  const { epochMs, sourceZone, sourceSnap, explicitTargets } = parsed
  const srcTime = `${pad2(sourceSnap.parts.hour)}:${pad2(sourceSnap.parts.minute)}`
  const srcDate = `${sourceSnap.parts.year}-${pad2(sourceSnap.parts.month)}-${pad2(sourceSnap.parts.day)}`
  const targets = explicitTargets.length > 0
    ? explicitTargets
    : [
        ...pinnedIds.map(id => CITY_BY_ID.get(id)).filter(Boolean).map(city => ({
          kind: 'city',
          id: city.id,
          label: city.city,
          zh: city.zh,
          iana: city.iana,
          city,
        })),
      ]

  const items = []
  const summaryParts = [`${sourceZone.label} ${srcTime}`]

  targets.forEach((target, idx) => {
    const snap = getZoneSnapshot(target, epochMs)
    const delta = dayDeltaBetween(sourceSnap.parts, snap.parts)
    const phase = getDayPhase(snap.parts.hour)
    const t24 = `${pad2(snap.parts.hour)}:${pad2(snap.parts.minute)}`
    const t12 = format12Hour(snap.parts.hour, snap.parts.minute)
    const dStr = `${snap.parts.year}-${pad2(snap.parts.month)}-${pad2(snap.parts.day)} ${snap.parts.weekday}`
    const diffHours = (snap.offsetMin - sourceSnap.offsetMin) / 60
    const diffStr = diffHours === 0 ? '同偏移' : `${diffHours > 0 ? '+' : ''}${Number.isInteger(diffHours) ? diffHours : diffHours.toFixed(1)}h`

    let extraNote = ''
    if (typeof target.ambiguousUsCstOffsetMin === 'number') {
      const usParts = getPartsWithFixedOffset(target.ambiguousUsCstOffsetMin, epochMs)
      const usDelta = dayDeltaBetween(sourceSnap.parts, usParts)
      extraNote = ` · US Central (UTC-6): ${pad2(usParts.hour)}:${pad2(usParts.minute)}${formatDayDelta(usDelta)}`
    }

    const title = `${phase.icon} ${target.label}${target.zh && target.zh !== target.label ? ` (${target.zh})` : ''}  ${t24}${formatDayDelta(delta)}`
    const copyText = `${target.label} (${snap.offsetLabel}): ${dStr} ${t24} (${t12})${formatDayDelta(delta)}`
    summaryParts.push(`${target.label} ${t24}${formatDayDelta(delta)}`)

    items.push(buildItem({
      id: `${featureId}-conv-${target.id}-${idx}`,
      featureId,
      title,
      subtitle: `${dStr} · ${t12} · ${snap.offsetLabel} (${diffStr}) · 源 ${sourceZone.label} ${srcDate} ${srcTime}${extraNote}`,
      accessory: `${snap.offsetLabel}`,
      actions: [
        { id: 'copy-time', label: '复制换算结果', payload: { text: copyText } },
      ],
      defaultAction: 'copy-time',
    }))
  })

  if (items.length > 1) {
    const fullSummary = `${srcDate} | ${summaryParts.join(' → ')}`
    items.push(buildItem({
      id: `${featureId}-conv-summary`,
      featureId,
      title: '复制全部时区换算摘要',
      subtitle: fullSummary,
      accessory: 'Summary',
      actions: [
        { id: 'copy-time', label: '复制全部摘要', payload: { text: fullSummary } },
      ],
      defaultAction: 'copy-time',
    }))
  }

  return items
}

function buildMeetingItems(featureId, cityTokens, pinnedIds, nowMs) {
  let participants = []
  if (cityTokens.length > 0) {
    for (const token of cityTokens) {
      const resolved = resolveZoneTarget(token)
      if (resolved?.city) {
        participants.push(resolved.city)
      }
      else if (resolved?.iana) {
        participants.push({
          id: resolved.id,
          city: resolved.label,
          zh: resolved.zh || resolved.label,
          iana: resolved.iana,
        })
      }
    }
  }
  else {
    participants = pinnedIds
      .filter(id => id !== 'utc')
      .map(id => CITY_BY_ID.get(id))
      .filter(Boolean)
      .slice(0, 6)
  }

  const plan = planMeetingOverlap(participants, nowMs)
  if (!plan) {
    return [
      buildItem({
        id: `${featureId}-meet-hint`,
        featureId,
        title: '至少需要 2 个不同时区的城市来规划会议',
        subtitle: '示例: meet sf nyc london berlin 或 overlap tokyo shanghai sf',
        accessory: 'Hint',
        actions: [],
        defaultAction: 'none',
      }),
    ]
  }

  const items = []
  const names = plan.cities.map(c => c.city).join(' / ')

  if (plan.goldenWindows.length > 0) {
    plan.goldenWindows.forEach((win, idx) => {
      const rangeUtc = `${pad2(win.startHour)}:00–${pad2(win.endHour)}:00 UTC`
      const startDetail = formatSlotLine(win.sample)
      const inviteText = `Golden Hours (${win.hours}h, ${rangeUtc}): ${startDetail}`
      items.push(buildItem({
        id: `${featureId}-golden-${idx}`,
        featureId,
        title: `✨ 黄金重叠时段 ${rangeUtc} (${win.hours}h)`,
        subtitle: `${startDetail}`,
        accessory: 'Golden',
        actions: [
          { id: 'copy-meeting', label: '复制会议时段', payload: { text: inviteText } },
        ],
        defaultAction: 'copy-meeting',
      }))
    })
  }
  else if (plan.flexWindows.length > 0) {
    plan.flexWindows.slice(0, 3).forEach((win, idx) => {
      const rangeUtc = `${pad2(win.startHour)}:00–${pad2(win.endHour)}:00 UTC`
      const startDetail = formatSlotLine(win.sample)
      const inviteText = `Flexible Overlap (${win.hours}h, ${rangeUtc}): ${startDetail}`
      items.push(buildItem({
        id: `${featureId}-flex-${idx}`,
        featureId,
        title: `🌅 弹性重叠时段 ${rangeUtc} (${win.hours}h)`,
        subtitle: `${names} 无全员 09–18 重叠 · ${startDetail}`,
        accessory: 'Flexible',
        actions: [
          { id: 'copy-meeting', label: '复制弹性时段', payload: { text: inviteText } },
        ],
        defaultAction: 'copy-meeting',
      }))
    })
  }
  else {
    items.push(buildItem({
      id: `${featureId}-meet-none`,
      featureId,
      title: `${names} 无全员工作时段重叠`,
      subtitle: '以下按最少熬夜人数排序推荐折中会议时段',
      accessory: 'Compromise',
      actions: [],
      defaultAction: 'none',
    }))
  }

  plan.topSlots.slice(0, 4).forEach((slot, idx) => {
    const line = formatSlotLine(slot)
    const badge = slot.allGolden
      ? 'Golden'
      : slot.allWorkOrFlex
        ? 'Flexible'
        : `Score ${slot.totalScore}/${plan.cities.length * 3}`
    items.push(buildItem({
      id: `${featureId}-slot-${idx}`,
      featureId,
      title: line,
      subtitle: `参与城市: ${names} · ${slot.sleepCount === 0 ? '全员清醒时段' : `${slot.sleepCount} 个城市处于夜间`}`,
      accessory: badge,
      actions: [
        { id: 'copy-meeting', label: '复制该时段', payload: { text: line } },
      ],
      defaultAction: 'copy-meeting',
    }))
  })

  return items
}

async function publishItems(items, isStale) {
  if (isStale())
    return
  await plugin.feature.clearItems()
  if (isStale())
    return
  await plugin.feature.pushItems(items)
}

async function renderPinnedView(featureId, pinnedIds, nowMs, isStale) {
  const pinnedSet = new Set(pinnedIds)
  const items = pinnedIds
    .map(id => CITY_BY_ID.get(id))
    .filter(Boolean)
    .map(city => buildCityClockItem(featureId, city, nowMs, pinnedSet))

  items.push(buildItem({
    id: `${featureId}-quick-meet`,
    featureId,
    title: '✨ 规划当前置顶城市的黄金会议时段',
    subtitle: '或直接输入 `14:00 PST to CST/UTC/Tokyo` / `meet sf nyc london berlin`',
    accessory: 'Planner',
    actions: [
      { id: 'plan-pinned-meeting', label: '查看黄金会议时段', payload: {} },
      { id: 'reset-pins', label: '恢复默认置顶', payload: {} },
    ],
    defaultAction: 'plan-pinned-meeting',
  }))

  await publishItems(items, isStale)
}

const pluginLifecycle = {
  async onInit() {
    destroyed = false
    if (typeof plugin?.storage?.getFile === 'function' && typeof plugin?.storage?.setFile === 'function') {
      try {
        const existing = await plugin.storage.getFile(STORE_FILE)
        if (!existing)
          await plugin.storage.setFile(STORE_FILE, { version: 1, pinned: [...DEFAULT_PINNED] })
      }
      catch {
        logger?.warn?.('[touch-world-time] Failed to initialize storage')
      }
    }
  },

  async onFeatureTriggered(featureId, query, _feature, signal) {
    if (destroyed)
      return false
    const generation = ++activeGeneration
    const isStale = () => destroyed || generation !== activeGeneration || Boolean(signal?.aborted)

    try {
      const rawText = normalizeText(getQueryText(query))
      const pinnedIds = await loadPinned()
      if (isStale())
        return true

      const nowMs = Date.now()
      const pinnedSet = new Set(pinnedIds)

      // 1. Empty query -> pinned clocks + meeting planner entry
      if (!rawText) {
        await renderPinnedView(featureId, pinnedIds, nowMs, isStale)
        return true
      }

      // 2. Pin / Unpin / Reset shortcuts
      const pinMatch = rawText.match(/^(pin|unpin|置顶|取消置顶)\s+(\S.*)$/i)
      if (pinMatch) {
        const isUnpin = /^(?:unpin|取消置顶)$/i.test(pinMatch[1])
        const matches = searchCities(pinMatch[2]).slice(0, 6)
        const items = matches.length
          ? matches.map((city) => {
              const parts = getPartsInIana(city.iana, nowMs)
              const offsetStr = formatOffsetMinutes(getZoneOffsetMinutes(city.iana, nowMs))
              return buildItem({
                id: `${featureId}-${isUnpin ? 'unpin' : 'pin'}-${city.id}`,
                featureId,
                title: `${isUnpin ? '取消置顶' : '置顶'} ${city.city} (${city.zh})`,
                subtitle: `${pad2(parts.hour)}:${pad2(parts.minute)} · ${offsetStr} · ${city.iana}`,
                accessory: isUnpin ? 'Unpin' : 'Pin',
                actions: [
                  {
                    id: isUnpin ? 'unpin-city' : 'pin-city',
                    label: isUnpin ? '取消置顶' : '置顶城市',
                    payload: { cityId: city.id },
                  },
                ],
                defaultAction: isUnpin ? 'unpin-city' : 'pin-city',
              })
            })
          : [
              buildItem({
                id: `${featureId}-pin-empty`,
                featureId,
                title: `未找到匹配城市: ${pinMatch[2]}`,
                subtitle: '支持 50+ 城市与别名 (tokyo / nyc / sf / london / berlin / sg / shanghai / sydney)',
                actions: [],
                defaultAction: 'none',
              }),
            ]
        await publishItems(items, isStale)
        return true
      }

      if (/^(?:reset|重置)$/i.test(rawText)) {
        await publishItems([
          buildItem({
            id: `${featureId}-reset-pins`,
            featureId,
            title: '恢复默认置顶城市',
            subtitle: 'Shanghai · Tokyo · London · New York · San Francisco · UTC',
            accessory: 'Reset',
            actions: [{ id: 'reset-pins', label: '恢复默认置顶', payload: {} }],
            defaultAction: 'reset-pins',
          }),
        ], isStale)
        return true
      }

      // 3. Golden-hours team meeting overlap planner (`meet ...` / `overlap ...` / `会议 ...`)
      const meetMatch = rawText.match(/^(?:meet|meeting|overlap|golden|会议|黄金时段)(?:\s+(\S.*))?$/i)
      if (meetMatch) {
        const rest = normalizeText(meetMatch[1])
        const tokens = rest
          ? rest.split(/[,/，、|\s]+/).map(s => s.trim()).filter(Boolean)
          : []
        const items = buildMeetingItems(featureId, tokens, pinnedIds, nowMs)
        await publishItems(items, isStale)
        return true
      }

      // 4. Natural time conversion (`14:00 PST to CST/UTC/Tokyo`, `9:30am nyc to london`)
      const conversion = tryParseTimeConversion(rawText, nowMs)
      if (conversion) {
        const items = buildConversionItems(featureId, conversion, pinnedIds)
        await publishItems(items, isStale)
        return true
      }

      // 5. City / timezone search across 52 cities + fixed abbreviations
      const matchedCities = searchCities(rawText).slice(0, 12)
      const items = matchedCities.map(city => buildCityClockItem(featureId, city, nowMs, pinnedSet))

      // If user typed a direct IANA timezone not in the 52-city table
      if (items.length === 0) {
        const resolved = resolveZoneTarget(rawText)
        if (resolved) {
          const snap = getZoneSnapshot(resolved, nowMs)
          const phase = getDayPhase(snap.parts.hour)
          const t24 = `${pad2(snap.parts.hour)}:${pad2(snap.parts.minute)}`
          const dStr = `${snap.parts.year}-${pad2(snap.parts.month)}-${pad2(snap.parts.day)} ${snap.parts.weekday}`
          items.push(buildItem({
            id: `${featureId}-zone-${resolved.id}`,
            featureId,
            title: `${phase.icon} ${resolved.label}  ${t24}`,
            subtitle: `${dStr} · ${format12Hour(snap.parts.hour, snap.parts.minute)} · ${snap.offsetLabel}`,
            accessory: snap.offsetLabel,
            actions: [
              { id: 'copy-time', label: '复制时间', payload: { text: `${resolved.label} (${snap.offsetLabel}): ${dStr} ${t24}` } },
            ],
            defaultAction: 'copy-time',
          }))
        }
      }

      if (items.length === 0) {
        items.push(buildItem({
          id: `${featureId}-no-match`,
          featureId,
          title: `未找到城市或时区: ${rawText}`,
          subtitle: '试试 tokyo / nyc / sf / london / berlin / 14:00 PST to CST/UTC/Tokyo / meet sf nyc london',
          accessory: 'Hint',
          actions: [],
          defaultAction: 'none',
        }))
      }

      await publishItems(items, isStale)
      return true
    }
    catch {
      logger?.error?.('[touch-world-time] Failed to handle feature')
      if (isStale())
        return true
      try {
        await publishItems([
          buildItem({
            id: `${featureId}-error`,
            featureId,
            title: '世界时钟加载失败',
            subtitle: '请稍后重试',
            actions: [],
            defaultAction: 'none',
          }),
        ], isStale)
        return true
      }
      catch {
        return false
      }
    }
  },

  async onItemAction(item, context = {}) {
    if (destroyed) {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'cancelled',
        message: '插件已销毁',
      }
    }

    const actionId = context?.actionId || item?.meta?.defaultAction
    if (!actionId || actionId === 'none') {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'invalid-action',
        message: '该条目没有可执行操作',
      }
    }

    const action = Array.isArray(item?.actions)
      ? item.actions.find(entry => entry?.id === actionId)
      : null
    if (!action) {
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'invalid-action',
        message: '不支持的操作',
      }
    }

    const payload = action.payload || {}
    const featureId = item?.meta?.featureId || 'world-time'

    try {
      if (actionId === 'copy-time' || actionId === 'copy-meeting') {
        const text = typeof payload.text === 'string' ? payload.text : ''
        if (!text) {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: 'invalid-action',
            message: '缺少可复制内容',
          }
        }
        return await copyWithPermissionGate(text)
      }

      if (actionId === 'pin-city') {
        const cityId = normalizeText(payload.cityId).toLowerCase()
        if (!CITY_BY_ID.has(cityId)) {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: 'invalid-action',
            message: '无效的城市 ID',
          }
        }
        const pinned = await loadPinned()
        const next = [cityId, ...pinned.filter(id => id !== cityId)].slice(0, MAX_PINNED)
        await savePinned(next)
        const generation = ++activeGeneration
        const isStale = () => destroyed || generation !== activeGeneration
        await renderPinnedView(featureId, next, Date.now(), isStale)
        return { externalAction: true, success: true, status: 'started', message: `已置顶 ${CITY_BY_ID.get(cityId).city}` }
      }

      if (actionId === 'unpin-city') {
        const cityId = normalizeText(payload.cityId).toLowerCase()
        const pinned = await loadPinned()
        const next = pinned.filter(id => id !== cityId)
        const finalPinned = next.length ? next : ['utc']
        await savePinned(finalPinned)
        const generation = ++activeGeneration
        const isStale = () => destroyed || generation !== activeGeneration
        await renderPinnedView(featureId, finalPinned, Date.now(), isStale)
        return { externalAction: true, success: true, status: 'started', message: '已取消置顶' }
      }

      if (actionId === 'reset-pins') {
        await savePinned(DEFAULT_PINNED)
        const generation = ++activeGeneration
        const isStale = () => destroyed || generation !== activeGeneration
        await renderPinnedView(featureId, DEFAULT_PINNED, Date.now(), isStale)
        return { externalAction: true, success: true, status: 'started', message: '已恢复默认置顶城市' }
      }

      if (actionId === 'plan-pinned-meeting') {
        const pinned = await loadPinned()
        const generation = ++activeGeneration
        const isStale = () => destroyed || generation !== activeGeneration
        const items = buildMeetingItems(featureId, [], pinned, Date.now())
        await publishItems(items, isStale)
        return { externalAction: true, success: true, status: 'started', message: '已生成黄金会议时段' }
      }

      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: 'invalid-action',
        message: '未知操作',
      }
    }
    catch (error) {
      logger?.error?.('[touch-world-time] Action failed')
      const denied = error?.code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
      const unavailable = error?.code === 'PLUGIN_HOST_CAPABILITY_UNAVAILABLE'
      return {
        externalAction: true,
        success: false,
        status: 'blocked',
        reason: denied ? 'permission-denied' : unavailable ? 'capability-unavailable' : 'action-failed',
        message: denied ? '缺少所需权限' : unavailable ? '宿主能力暂不可用' : '操作失败',
      }
    }
  },

  onDestroy() {
    destroyed = true
    activeGeneration += 1
  },
}

module.exports = pluginLifecycle
