const { plugin, clipboard, permission, logger, TuffItemBuilder } = globalThis

const PLUGIN_NAME = 'touch-calc-pad'
const SOURCE_ID = 'plugin-features'
const STORE_FILE = 'calc-history.json'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const MAX_HISTORY = 30
const MAX_TOKENS = 256
const MAX_DEPTH = 64

let activeGeneration = 0
let destroyed = false

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getQueryText(query) {
  if (typeof query === 'string')
    return query
  return query?.text ?? ''
}

function cleanFloat(num) {
  if (!Number.isFinite(num))
    return num
  if (Object.is(num, -0) || Math.abs(num) < 1e-13)
    return 0
  if (Number.isInteger(num) && Math.abs(num) <= Number.MAX_SAFE_INTEGER)
    return num
  const rounded = Number(num.toPrecision(12))
  return Object.is(rounded, -0) ? 0 : rounded
}

function formatNumber(num, maxFraction = 8) {
  const clean = cleanFloat(num)
  if (!Number.isFinite(clean))
    return String(clean)
  if (Number.isInteger(clean) && Math.abs(clean) <= 1e15)
    return String(clean)
  if (Math.abs(clean) >= 1e15 || (Math.abs(clean) > 0 && Math.abs(clean) < 1e-7))
    return clean.toExponential(6).replace(/\.?0+e/, 'e')
  const fixed = clean.toFixed(maxFraction).replace(/\.?0+$/, '')
  return fixed === '-0' ? '0' : fixed
}

function formatWithCommas(numStr) {
  if (!/^-?\d+(?:\.\d+)?$/.test(numStr))
    return numStr
  const [intPart, fracPart] = numStr.split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fracPart !== undefined ? `${grouped}.${fracPart}` : grouped
}

function gcd(a, b) {
  let x = Math.abs(Math.trunc(a))
  let y = Math.abs(Math.trunc(b))
  while (y !== 0) {
    const t = x % y
    x = y
    y = t
  }
  return x || 1
}

function factorial(n) {
  if (!Number.isInteger(n) || n < 0 || n > 170)
    throw new Error('Factorial requires an integer between 0 and 170')
  let result = 1
  for (let i = 2; i <= n; i += 1)
    result *= i
  return result
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

function buildCopyItem({ id, featureId, title, subtitle, accessory, copyText, expression, extraActions = [] }) {
  const actions = [
    {
      id: 'copy-result',
      label: '复制结果',
      payload: { text: String(copyText), expression: expression || '', result: String(copyText) },
    },
    ...extraActions,
  ]
  return buildItem({
    id,
    featureId,
    title,
    subtitle,
    accessory,
    actions,
    defaultAction: 'copy-result',
  })
}

function buildInfoItem({ id, featureId, title, subtitle, accessory }) {
  return buildItem({
    id,
    featureId,
    title,
    subtitle,
    accessory,
    actions: [],
    defaultAction: 'none',
  })
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
    logger?.warn?.('[touch-calc-pad] Permission check failed')
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
    logger?.error?.('[touch-calc-pad] Clipboard write failed')
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

function normalizeHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object')
    return null
  const expression = normalizeText(entry.expression).slice(0, 160)
  const result = normalizeText(entry.result).slice(0, 160)
  if (!expression || !result)
    return null
  return {
    expression,
    result,
    timestamp: Number.isSafeInteger(entry.timestamp) && entry.timestamp >= 0 ? entry.timestamp : Date.now(),
  }
}

function parseStore(raw) {
  if (!raw)
    return { version: 1, history: [] }
  if (typeof raw === 'string') {
    try {
      return parseStore(JSON.parse(raw))
    }
    catch {
      return { version: 1, history: [] }
    }
  }
  const list = Array.isArray(raw?.history) ? raw.history : []
  const history = list
    .slice(0, MAX_HISTORY)
    .map(normalizeHistoryEntry)
    .filter(Boolean)
  return { version: 1, history }
}

async function loadHistory() {
  if (typeof plugin?.storage?.getFile !== 'function')
    return []
  try {
    const raw = await plugin.storage.getFile(STORE_FILE)
    return parseStore(raw).history
  }
  catch {
    logger?.warn?.('[touch-calc-pad] Failed to read history')
    return []
  }
}

async function saveHistoryEntry(expression, result) {
  if (typeof plugin?.storage?.setFile !== 'function')
    return false
  const cleanExpr = normalizeText(expression).slice(0, 160)
  const cleanResult = normalizeText(result).slice(0, 160)
  if (!cleanExpr || !cleanResult)
    return false
  const history = await loadHistory()
  const filtered = history.filter(
    item => !(item.expression === cleanExpr && item.result === cleanResult),
  )
  const next = [{ expression: cleanExpr, result: cleanResult, timestamp: Date.now() }, ...filtered].slice(0, MAX_HISTORY)
  await plugin.storage.setFile(STORE_FILE, { version: 1, history: next })
  return true
}

async function clearHistory() {
  if (typeof plugin?.storage?.setFile !== 'function')
    return false
  await plugin.storage.setFile(STORE_FILE, { version: 1, history: [] })
  return true
}

// =============================================================================
// 1. Recursive-Descent Math & Programmer Expression Parser (Zero Dynamic Code)
// =============================================================================

const MATH_CONSTANTS = Object.freeze({
  pi: Math.PI,
  π: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
  phi: (1 + Math.sqrt(5)) / 2,
})

const MATH_FUNCTIONS = Object.freeze({
  sqrt: args => Math.sqrt(args[0]),
  cbrt: args => Math.cbrt(args[0]),
  abs: args => Math.abs(args[0]),
  round: (args) => {
    if (args.length === 1)
      return Math.round(args[0])
    const factor = 10 ** Math.trunc(args[1])
    return Math.round(args[0] * factor) / factor
  },
  floor: args => Math.floor(args[0]),
  ceil: args => Math.ceil(args[0]),
  trunc: args => Math.trunc(args[0]),
  sign: args => Math.sign(args[0]),
  sin: args => Math.sin(args[0]),
  cos: args => Math.cos(args[0]),
  tan: args => Math.tan(args[0]),
  asin: args => Math.asin(args[0]),
  acos: args => Math.acos(args[0]),
  atan: args => Math.atan(args[0]),
  atan2: args => Math.atan2(args[0], args[1]),
  ln: args => Math.log(args[0]),
  log: args => (args.length === 2 ? Math.log(args[0]) / Math.log(args[1]) : Math.log10(args[0])),
  log2: args => Math.log2(args[0]),
  log10: args => Math.log10(args[0]),
  exp: args => Math.exp(args[0]),
  pow: args => args[0] ** args[1],
  min: args => Math.min(...args),
  max: args => Math.max(...args),
  clamp: args => Math.min(Math.max(args[0], args[1]), args[2]),
  hypot: args => Math.hypot(...args),
  fact: args => factorial(args[0]),
  factorial: args => factorial(args[0]),
  deg: args => (args[0] * 180) / Math.PI,
  rad: args => (args[0] * Math.PI) / 180,
})

function tokenizeExpression(input) {
  const normalized = input
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/[−–—]/g, '-')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/，/g, ',')

  const tokens = []
  let i = 0
  let hasBaseLiteral = false
  let hasBitwiseOp = false

  while (i < normalized.length) {
    if (tokens.length >= MAX_TOKENS)
      throw new Error('Expression too complex')

    const ch = normalized[i]
    if (/\s/.test(ch)) {
      i += 1
      continue
    }

    // Hex / Binary / Octal literals
    if (ch === '0' && i + 1 < normalized.length && /[xXbBoO]/.test(normalized[i + 1])) {
      const prefix = normalized[i + 1].toLowerCase()
      const radix = prefix === 'x' ? 16 : prefix === 'b' ? 2 : 8
      const digitRe = prefix === 'x' ? /[0-9a-fA-F_]/ : prefix === 'b' ? /[01_]/ : /[0-7_]/
      let j = i + 2
      while (j < normalized.length && digitRe.test(normalized[j]))
        j += 1
      const rawDigits = normalized.slice(i + 2, j).replace(/_/g, '')
      if (!rawDigits)
        throw new Error('Invalid base literal')
      const value = Number.parseInt(rawDigits, radix)
      if (!Number.isSafeInteger(value))
        throw new Error('Integer literal out of safe range')
      hasBaseLiteral = true
      tokens.push({ type: 'number', value, base: radix })
      i = j
      continue
    }

    // Decimal / scientific literals (allows thousands comma when followed by 3 digits)
    if (/[0-9]/.test(ch) || (ch === '.' && i + 1 < normalized.length && /[0-9]/.test(normalized[i + 1]))) {
      let j = i
      let seenDot = false
      while (j < normalized.length) {
        const c = normalized[j]
        if (/[0-9_]/.test(c)) {
          j += 1
          continue
        }
        if (c === ',' && !seenDot && /^\d{3}(?!\d)/.test(normalized.slice(j + 1))) {
          j += 1
          continue
        }
        if (c === '.' && !seenDot) {
          seenDot = true
          j += 1
          continue
        }
        break
      }
      if (j < normalized.length && (normalized[j] === 'e' || normalized[j] === 'E')) {
        let expIdx = j + 1
        if (expIdx < normalized.length && (normalized[expIdx] === '+' || normalized[expIdx] === '-'))
          expIdx += 1
        let expDigits = 0
        while (expIdx < normalized.length && /[0-9]/.test(normalized[expIdx])) {
          expIdx += 1
          expDigits += 1
        }
        if (expDigits > 0)
          j = expIdx
      }
      const raw = normalized.slice(i, j).replace(/[,_]/g, '')
      const value = Number(raw)
      if (!Number.isFinite(value))
        throw new Error('Invalid number')
      tokens.push({ type: 'number', value, base: 10 })
      i = j
      continue
    }

    // Identifiers (constants, functions, keyword ops like mod/xor/and/or/shl/shr)
    if (/[a-zA-Zπ_]/.test(ch)) {
      let j = i + 1
      while (j < normalized.length && /[a-zA-Z0-9_]/.test(normalized[j]))
        j += 1
      const ident = normalized.slice(i, j).toLowerCase()
      if (ident === 'mod') {
        tokens.push({ type: 'op', value: 'mod' })
      }
      else if (ident === 'xor') {
        hasBitwiseOp = true
        tokens.push({ type: 'op', value: 'xor' })
      }
      else if (ident === 'and') {
        hasBitwiseOp = true
        tokens.push({ type: 'op', value: '&' })
      }
      else if (ident === 'or') {
        hasBitwiseOp = true
        tokens.push({ type: 'op', value: '|' })
      }
      else if (ident === 'shl') {
        hasBitwiseOp = true
        tokens.push({ type: 'op', value: '<<' })
      }
      else if (ident === 'shr') {
        hasBitwiseOp = true
        tokens.push({ type: 'op', value: '>>' })
      }
      else {
        tokens.push({ type: 'ident', value: ident })
      }
      i = j
      continue
    }

    // Multi-char operators
    const three = normalized.slice(i, i + 3)
    if (three === '>>>') {
      hasBitwiseOp = true
      tokens.push({ type: 'op', value: '>>>' })
      i += 3
      continue
    }
    const two = normalized.slice(i, i + 2)
    if (two === '**' || two === '<<' || two === '>>') {
      if (two !== '**')
        hasBitwiseOp = true
      tokens.push({ type: 'op', value: two })
      i += 2
      continue
    }

    // Single-char operators & punctuation
    if ('+-*/%^&|~!' .includes(ch)) {
      if ('&|~'.includes(ch))
        hasBitwiseOp = true
      tokens.push({ type: 'op', value: ch })
      i += 1
      continue
    }
    if (ch === '(' || ch === ')' || ch === ',') {
      tokens.push({ type: ch, value: ch })
      i += 1
      continue
    }

    throw new Error(`Unexpected token: ${ch}`)
  }

  return { tokens, programmerMode: hasBaseLiteral || hasBitwiseOp }
}

function canStartOperand(token) {
  if (!token)
    return false
  if (token.type === 'number' || token.type === 'ident' || token.type === '(')
    return true
  if (token.type === 'op' && (token.value === '+' || token.value === '-' || token.value === '~'))
    return true
  return false
}

function evaluateMathExpression(input) {
  const { tokens, programmerMode } = tokenizeExpression(input)
  if (!tokens.length)
    throw new Error('Empty expression')

  let pos = 0
  let depth = 0
  let usedBitwise = programmerMode

  const peek = (offset = 0) => tokens[pos + offset]
  const consume = () => tokens[pos++]

  function enter() {
    depth += 1
    if (depth > MAX_DEPTH)
      throw new Error('Expression nesting too deep')
  }

  function leave() {
    depth -= 1
  }

  function toInt32(value) {
    if (!Number.isFinite(value))
      throw new Error('Bitwise operand must be finite')
    return Math.trunc(value) | 0
  }

  function parseBitOr() {
    enter()
    try {
      let left = parseBitXor()
      while (peek()?.type === 'op' && peek().value === '|') {
        consume()
        usedBitwise = true
        const right = parseBitXor()
        left = toInt32(left) | toInt32(right)
      }
      return left
    }
    finally {
      leave()
    }
  }

  function parseBitXor() {
    enter()
    try {
      let left = parseBitAnd()
      while (
        peek()?.type === 'op'
        && (peek().value === 'xor' || (programmerMode && peek().value === '^'))
      ) {
        consume()
        usedBitwise = true
        const right = parseBitAnd()
        left = toInt32(left) ^ toInt32(right)
      }
      return left
    }
    finally {
      leave()
    }
  }

  function parseBitAnd() {
    enter()
    try {
      let left = parseShift()
      while (peek()?.type === 'op' && peek().value === '&') {
        consume()
        usedBitwise = true
        const right = parseShift()
        left = toInt32(left) & toInt32(right)
      }
      return left
    }
    finally {
      leave()
    }
  }

  function parseShift() {
    enter()
    try {
      let left = parseAdditive()
      while (peek()?.type === 'op' && (peek().value === '<<' || peek().value === '>>' || peek().value === '>>>')) {
        const op = consume().value
        usedBitwise = true
        const right = parseAdditive()
        const shift = toInt32(right)
        if (op === '<<')
          left = toInt32(left) << shift
        else if (op === '>>')
          left = toInt32(left) >> shift
        else
          left = toInt32(left) >>> shift
      }
      return left
    }
    finally {
      leave()
    }
  }

  // Supports Soulver-style `249 + 13%` and `249 - 15%`
  function parseAdditive() {
    enter()
    try {
      let left = parseMultiplicative()
      while (peek()?.type === 'op' && (peek().value === '+' || peek().value === '-')) {
        const op = consume().value
        // Check Soulver relative percentage on RHS: `<number> %` not followed by an operand (so `10 + 5 % 2` stays modulo)
        const startPos = pos
        let handledPercent = false
        if (peek()?.type === 'number' && peek(1)?.type === 'op' && peek(1).value === '%' && !canStartOperand(peek(2))) {
          const pct = consume().value
          consume() // '%'
          const delta = left * (pct / 100)
          left = op === '+' ? left + delta : left - delta
          handledPercent = true
        }
        if (!handledPercent) {
          pos = startPos
          const right = parseMultiplicative()
          left = op === '+' ? left + right : left - right
        }
      }
      return left
    }
    finally {
      leave()
    }
  }

  function parseMultiplicative() {
    enter()
    try {
      let left = parsePower()
      while (true) {
        const next = peek()
        if (!next)
          break
        if (next.type === 'op' && (next.value === '*' || next.value === '/' || next.value === 'mod')) {
          const op = consume().value
          const right = parsePower()
          if (op === '*') {
            left *= right
          }
          else if (op === '/') {
            if (right === 0)
              throw new Error('Division by zero')
            left /= right
          }
          else {
            if (right === 0)
              throw new Error('Modulo by zero')
            left %= right
          }
          continue
        }
        // Binary modulo `%` only when followed by an operand start
        if (next.type === 'op' && next.value === '%' && canStartOperand(peek(1))) {
          consume()
          const right = parsePower()
          if (right === 0)
            throw new Error('Modulo by zero')
          left %= right
          continue
        }
        // Implicit multiplication: `2pi`, `2(3+4)`, `(2+3)(4+5)`
        if (next.type === '(' || next.type === 'ident') {
          const right = parsePower()
          left *= right
          continue
        }
        break
      }
      return left
    }
    finally {
      leave()
    }
  }

  function parsePower() {
    enter()
    try {
      let base = parseUnary()
      if (peek()?.type === 'op' && (peek().value === '**' || (!programmerMode && peek().value === '^'))) {
        consume()
        const exponent = parsePower() // right-associative
        base = base ** exponent
      }
      return base
    }
    finally {
      leave()
    }
  }

  function parseUnary() {
    enter()
    try {
      const next = peek()
      if (next?.type === 'op' && (next.value === '+' || next.value === '-' || next.value === '~')) {
        const op = consume().value
        const value = parseUnary()
        if (op === '+')
          return value
        if (op === '-')
          return -value
        usedBitwise = true
        return ~toInt32(value)
      }
      return parsePostfix()
    }
    finally {
      leave()
    }
  }

  function parsePostfix() {
    enter()
    try {
      let value = parsePrimary()
      while (peek()?.type === 'op') {
        if (peek().value === '!') {
          consume()
          value = factorial(value)
          continue
        }
        // Postfix `%` (divide by 100) when NOT followed by an operand start (otherwise it's modulo)
        if (peek().value === '%' && !canStartOperand(peek(1))) {
          consume()
          value /= 100
          continue
        }
        break
      }
      return value
    }
    finally {
      leave()
    }
  }

  function parsePrimary() {
    enter()
    try {
      const token = peek()
      if (!token)
        throw new Error('Unexpected end of expression')

      if (token.type === 'number') {
        consume()
        return token.value
      }

      if (token.type === '(') {
        consume()
        const value = parseBitOr()
        if (peek()?.type !== ')')
          throw new Error('Missing closing parenthesis')
        consume()
        return value
      }

      if (token.type === 'ident') {
        consume()
        const name = token.value
        if (peek()?.type === '(') {
          const fn = MATH_FUNCTIONS[name]
          if (!fn)
            throw new Error(`Unknown function: ${name}`)
          consume() // '('
          const args = []
          if (peek()?.type !== ')') {
            args.push(parseBitOr())
            while (peek()?.type === ',') {
              consume()
              args.push(parseBitOr())
            }
          }
          if (peek()?.type !== ')')
            throw new Error(`Missing closing parenthesis for ${name}()`)
          consume()
          if (args.length === 0)
            throw new Error(`Function ${name}() requires at least one argument`)
          return fn(args)
        }
        if (Object.prototype.hasOwnProperty.call(MATH_CONSTANTS, name))
          return MATH_CONSTANTS[name]
        throw new Error(`Unknown identifier: ${name}`)
      }

      throw new Error(`Unexpected token: ${token.value}`)
    }
    finally {
      leave()
    }
  }

  const value = parseBitOr()
  if (pos !== tokens.length)
    throw new Error(`Unexpected trailing token: ${tokens[pos].value}`)
  if (!Number.isFinite(value))
    throw new Error('Result is not a finite number')

  return {
    value: cleanFloat(value),
    programmerMode: usedBitwise,
  }
}

// =============================================================================
// 2. Natural-Language Percentages & Base Conversions
// =============================================================================

function tryNaturalPercentage(raw) {
  // 1) "15% off 249" / "15% discount on 249"
  let match = raw.match(/^(.+?)\s*%\s*(?:off|discount(?:\s+on)?)\s+(.+)$/i)
  if (match) {
    const pct = evaluateMathExpression(match[1]).value
    const base = evaluateMathExpression(match[2]).value
    const savings = cleanFloat(base * (pct / 100))
    const finalVal = cleanFloat(base - savings)
    return {
      kind: 'percent-off',
      primary: finalVal,
      title: formatNumber(finalVal),
      subtitle: `${formatNumber(pct)}% off ${formatNumber(base)} · 节省 ${formatNumber(savings)}`,
      extras: [
        { label: '折扣节省金额', value: formatNumber(savings), subtitle: `${formatNumber(pct)}% × ${formatNumber(base)}` },
      ],
    }
  }

  // 2) "13% on 249" / "13% tax on 249" / "13% markup on 249"
  match = raw.match(/^(.+?)\s*%\s*(?:on|markup(?:\s+on)?|tax(?:\s+on)?|added\s+to)\s+(.+)$/i)
  if (match) {
    const pct = evaluateMathExpression(match[1]).value
    const base = evaluateMathExpression(match[2]).value
    const added = cleanFloat(base * (pct / 100))
    const finalVal = cleanFloat(base + added)
    return {
      kind: 'percent-on',
      primary: finalVal,
      title: formatNumber(finalVal),
      subtitle: `${formatNumber(base)} + ${formatNumber(pct)}% · 增加 +${formatNumber(added)}`,
      extras: [
        { label: '增加金额', value: formatNumber(added), subtitle: `${formatNumber(pct)}% × ${formatNumber(base)}` },
      ],
    }
  }

  // 3) "45 as % of 180" / "45 is what % of 180" (check before generic "% of")
  match = raw.match(/^(.+?)\s+(?:as\s+(?:a\s+)?%|is\s+what\s+%)\s+of\s+(.+)$/i)
  if (match) {
    const part = evaluateMathExpression(match[1]).value
    const whole = evaluateMathExpression(match[2]).value
    if (whole === 0)
      throw new Error('Division by zero')
    const pct = cleanFloat((part / whole) * 100)
    return {
      kind: 'as-percent-of',
      primary: pct,
      title: `${formatNumber(pct)}%`,
      copyText: `${formatNumber(pct)}%`,
      subtitle: `${formatNumber(part)} / ${formatNumber(whole)} = ${formatNumber(pct)}%`,
      extras: [
        { label: '小数比率', value: formatNumber(part / whole), subtitle: 'Ratio (0–1)' },
      ],
    }
  }

  // 4) "20% of 249"
  match = raw.match(/^(.+?)\s*%\s*of\s+(.+)$/i)
  if (match) {
    const pct = evaluateMathExpression(match[1]).value
    const base = evaluateMathExpression(match[2]).value
    const result = cleanFloat(base * (pct / 100))
    return {
      kind: 'percent-of',
      primary: result,
      title: formatNumber(result),
      subtitle: `${formatNumber(pct)}% of ${formatNumber(base)}`,
      extras: [
        { label: '剩余部分', value: formatNumber(cleanFloat(base - result)), subtitle: `${formatNumber(100 - pct)}% of ${formatNumber(base)}` },
      ],
    }
  }

  // 5) "% change from 80 to 100" / "change from 80 to 100"
  match = raw.match(/^(?:%\s*)?change\s+from\s+(.+?)\s+to\s+(.+)$/i)
  if (match) {
    const fromVal = evaluateMathExpression(match[1]).value
    const toVal = evaluateMathExpression(match[2]).value
    if (fromVal === 0)
      throw new Error('Cannot compute percentage change from 0')
    const diff = cleanFloat(toVal - fromVal)
    const pct = cleanFloat((diff / fromVal) * 100)
    const sign = pct > 0 ? '+' : ''
    return {
      kind: 'percent-change',
      primary: pct,
      title: `${sign}${formatNumber(pct)}%`,
      copyText: `${sign}${formatNumber(pct)}%`,
      subtitle: `${formatNumber(fromVal)} → ${formatNumber(toVal)} (差值 ${diff >= 0 ? '+' : ''}${formatNumber(diff)})`,
      extras: [
        { label: '绝对差值', value: `${diff >= 0 ? '+' : ''}${formatNumber(diff)}`, subtitle: `${formatNumber(toVal)} - ${formatNumber(fromVal)}` },
      ],
    }
  }

  return null
}

function formatBaseRepresentations(intValue) {
  const isNeg = intValue < 0
  const absVal = Math.abs(intValue)
  const hex = `${isNeg ? '-' : ''}0x${absVal.toString(16).toUpperCase()}`
  const binRaw = absVal.toString(2)
  const binGrouped = binRaw.replace(/\B(?=(\d{4})+(?!\d))/g, '_')
  const bin = `${isNeg ? '-' : ''}0b${binRaw}`
  const oct = `${isNeg ? '-' : ''}0o${absVal.toString(8)}`
  const out = [
    { base: 'hex', label: 'HEX (十六进制)', value: hex, display: hex },
    { base: 'bin', label: 'BIN (二进制)', value: bin, display: `${isNeg ? '-' : ''}0b${binGrouped}` },
    { base: 'oct', label: 'OCT (八进制)', value: oct, display: oct },
    { base: 'dec', label: 'DEC (十进制)', value: String(intValue), display: formatWithCommas(String(intValue)) },
  ]
  if (isNeg && intValue >= -2147483648) {
    const u32 = intValue >>> 0
    out.push({
      base: 'u32',
      label: 'UINT32 (无符号 32 位)',
      value: `0x${u32.toString(16).toUpperCase()}`,
      display: `0x${u32.toString(16).toUpperCase()} (${u32})`,
    })
  }
  return out
}

function tryBaseConversion(raw) {
  const match = raw.match(/^(.+?)\s+(?:to|in|->|=>)\s+(hex|hexadecimal|bin|binary|oct|octal|dec|decimal)$/i)
  if (!match)
    return null
  const expr = match[1].trim()
  const target = match[2].toLowerCase().slice(0, 3)
  const { value } = evaluateMathExpression(expr)
  if (!Number.isSafeInteger(value))
    throw new Error('Base conversion requires a safe integer')
  const reps = formatBaseRepresentations(value)
  const primary = reps.find(r => r.base === target) || reps[0]
  const others = reps.filter(r => r.base !== primary.base)
  return { primary, others, intValue: value }
}

// =============================================================================
// 3. Unit Conversion Engine (Length, Mass, Temp, Data Size, Speed, Area, Volume, Time)
// =============================================================================

const LINEAR_UNITS = {
  length: {
    label: '长度 / Length',
    base: 'm',
    defaults: ['m', 'cm', 'km', 'in', 'ft', 'mi'],
    units: {
      mm: { factor: 0.001, display: 'mm' },
      millimeter: { factor: 0.001, display: 'mm' },
      millimeters: { factor: 0.001, display: 'mm' },
      cm: { factor: 0.01, display: 'cm' },
      centimeter: { factor: 0.01, display: 'cm' },
      centimeters: { factor: 0.01, display: 'cm' },
      m: { factor: 1, display: 'm' },
      meter: { factor: 1, display: 'm' },
      meters: { factor: 1, display: 'm' },
      metre: { factor: 1, display: 'm' },
      km: { factor: 1000, display: 'km' },
      kilometer: { factor: 1000, display: 'km' },
      kilometers: { factor: 1000, display: 'km' },
      in: { factor: 0.0254, display: 'in' },
      inch: { factor: 0.0254, display: 'in' },
      inches: { factor: 0.0254, display: 'in' },
      ft: { factor: 0.3048, display: 'ft' },
      foot: { factor: 0.3048, display: 'ft' },
      feet: { factor: 0.3048, display: 'ft' },
      yd: { factor: 0.9144, display: 'yd' },
      yard: { factor: 0.9144, display: 'yd' },
      yards: { factor: 0.9144, display: 'yd' },
      mi: { factor: 1609.344, display: 'mi' },
      mile: { factor: 1609.344, display: 'mi' },
      miles: { factor: 1609.344, display: 'mi' },
      nmi: { factor: 1852, display: 'nmi' },
      px: { factor: 0.0254 / 96, display: 'px' },
      pt: { factor: 0.0254 / 72, display: 'pt' },
    },
  },
  mass: {
    label: '质量 / Mass',
    base: 'kg',
    defaults: ['g', 'kg', 'oz', 'lb'],
    units: {
      mg: { factor: 1e-6, display: 'mg' },
      g: { factor: 0.001, display: 'g' },
      gram: { factor: 0.001, display: 'g' },
      grams: { factor: 0.001, display: 'g' },
      kg: { factor: 1, display: 'kg' },
      kilogram: { factor: 1, display: 'kg' },
      kilograms: { factor: 1, display: 'kg' },
      t: { factor: 1000, display: 't' },
      tonne: { factor: 1000, display: 't' },
      tonnes: { factor: 1000, display: 't' },
      oz: { factor: 0.028349523125, display: 'oz' },
      ounce: { factor: 0.028349523125, display: 'oz' },
      ounces: { factor: 0.028349523125, display: 'oz' },
      lb: { factor: 0.45359237, display: 'lb' },
      lbs: { factor: 0.45359237, display: 'lb' },
      pound: { factor: 0.45359237, display: 'lb' },
      pounds: { factor: 0.45359237, display: 'lb' },
      st: { factor: 6.35029318, display: 'st' },
    },
  },
  speed: {
    label: '速度 / Speed',
    base: 'm/s',
    defaults: ['m/s', 'km/h', 'mph', 'kn'],
    units: {
      'm/s': { factor: 1, display: 'm/s' },
      'mps': { factor: 1, display: 'm/s' },
      'km/h': { factor: 1 / 3.6, display: 'km/h' },
      'kmh': { factor: 1 / 3.6, display: 'km/h' },
      'kph': { factor: 1 / 3.6, display: 'km/h' },
      'mph': { factor: 0.44704, display: 'mph' },
      'kn': { factor: 1852 / 3600, display: 'kn' },
      'knot': { factor: 1852 / 3600, display: 'kn' },
      'knots': { factor: 1852 / 3600, display: 'kn' },
    },
  },
  area: {
    label: '面积 / Area',
    base: 'm2',
    defaults: ['cm2', 'm2', 'km2', 'ft2', 'acre'],
    units: {
      mm2: { factor: 1e-6, display: 'mm²' },
      cm2: { factor: 1e-4, display: 'cm²' },
      m2: { factor: 1, display: 'm²' },
      sqm: { factor: 1, display: 'm²' },
      km2: { factor: 1e6, display: 'km²' },
      ha: { factor: 1e4, display: 'ha' },
      hectare: { factor: 1e4, display: 'ha' },
      acre: { factor: 4046.8564224, display: 'acre' },
      acres: { factor: 4046.8564224, display: 'acre' },
      ft2: { factor: 0.09290304, display: 'ft²' },
      sqft: { factor: 0.09290304, display: 'ft²' },
      in2: { factor: 0.00064516, display: 'in²' },
    },
  },
  volume: {
    label: '体积 / Volume',
    base: 'l',
    defaults: ['ml', 'l', 'gal', 'floz'],
    units: {
      ml: { factor: 0.001, display: 'mL' },
      l: { factor: 1, display: 'L' },
      liter: { factor: 1, display: 'L' },
      liters: { factor: 1, display: 'L' },
      litre: { factor: 1, display: 'L' },
      m3: { factor: 1000, display: 'm³' },
      gal: { factor: 3.785411784, display: 'gal (US)' },
      gallon: { factor: 3.785411784, display: 'gal (US)' },
      qt: { factor: 0.946352946, display: 'qt' },
      cup: { factor: 0.2365882365, display: 'cup' },
      floz: { factor: 0.0295735295625, display: 'fl oz' },
    },
  },
  time: {
    label: '时间 / Duration',
    base: 's',
    defaults: ['ms', 's', 'min', 'h', 'd'],
    units: {
      ms: { factor: 0.001, display: 'ms' },
      s: { factor: 1, display: 's' },
      sec: { factor: 1, display: 's' },
      secs: { factor: 1, display: 's' },
      second: { factor: 1, display: 's' },
      seconds: { factor: 1, display: 's' },
      min: { factor: 60, display: 'min' },
      mins: { factor: 60, display: 'min' },
      minute: { factor: 60, display: 'min' },
      minutes: { factor: 60, display: 'min' },
      h: { factor: 3600, display: 'h' },
      hr: { factor: 3600, display: 'h' },
      hrs: { factor: 3600, display: 'h' },
      hour: { factor: 3600, display: 'h' },
      hours: { factor: 3600, display: 'h' },
      d: { factor: 86400, display: 'd' },
      day: { factor: 86400, display: 'd' },
      days: { factor: 86400, display: 'd' },
      wk: { factor: 604800, display: 'wk' },
      week: { factor: 604800, display: 'wk' },
      weeks: { factor: 604800, display: 'wk' },
    },
  },
}

// Case-sensitive data-size units (in bytes)
const DATA_SIZE_UNITS = Object.freeze({
  b: { factor: 0.125, display: 'bit' },
  bit: { factor: 0.125, display: 'bit' },
  bits: { factor: 0.125, display: 'bit' },
  B: { factor: 1, display: 'B' },
  byte: { factor: 1, display: 'B' },
  bytes: { factor: 1, display: 'B' },
  Kb: { factor: 1000 / 8, display: 'Kb' },
  kb: { factor: 1000 / 8, display: 'Kb' },
  Mb: { factor: 1e6 / 8, display: 'Mb' },
  mb: { factor: 1e6 / 8, display: 'Mb' },
  Gb: { factor: 1e9 / 8, display: 'Gb' },
  gb: { factor: 1e9 / 8, display: 'Gb' },
  Tb: { factor: 1e12 / 8, display: 'Tb' },
  KB: { factor: 1e3, display: 'KB' },
  MB: { factor: 1e6, display: 'MB' },
  GB: { factor: 1e9, display: 'GB' },
  TB: { factor: 1e12, display: 'TB' },
  PB: { factor: 1e15, display: 'PB' },
  KiB: { factor: 1024, display: 'KiB' },
  MiB: { factor: 1024 ** 2, display: 'MiB' },
  GiB: { factor: 1024 ** 3, display: 'GiB' },
  TiB: { factor: 1024 ** 4, display: 'TiB' },
  PiB: { factor: 1024 ** 5, display: 'PiB' },
})

// Case-insensitive fallback aliases for data sizes when user types lowercase `gb`, `mib`, `mb`
const DATA_SIZE_CI_FALLBACK = Object.freeze({
  kib: 'KiB',
  mib: 'MiB',
  gib: 'GiB',
  tib: 'TiB',
  pib: 'PiB',
  kb: 'KB',
  mb: 'MB',
  gb: 'GB',
  tb: 'TB',
  pb: 'PB',
  byte: 'B',
  bytes: 'B',
  bit: 'b',
  bits: 'b',
})

// Bandwidth units (in bits per second)
const BANDWIDTH_UNITS = Object.freeze({
  bps: { bps: 1, display: 'bps' },
  kbps: { bps: 1e3, display: 'Kbps' },
  mbps: { bps: 1e6, display: 'Mbps' },
  gbps: { bps: 1e9, display: 'Gbps' },
  tbps: { bps: 1e12, display: 'Tbps' },
  'b/s': { bps: 8, display: 'B/s' },
  'kb/s': { bps: 8e3, display: 'KB/s' },
  'mb/s': { bps: 8e6, display: 'MB/s' },
  'gb/s': { bps: 8e9, display: 'GB/s' },
  'kib/s': { bps: 8 * 1024, display: 'KiB/s' },
  'mib/s': { bps: 8 * 1024 ** 2, display: 'MiB/s' },
  'gib/s': { bps: 8 * 1024 ** 3, display: 'GiB/s' },
})

function resolveDataSizeUnit(rawUnit, preferBytesOnLowercase = false) {
  const token = rawUnit.trim()
  if (Object.prototype.hasOwnProperty.call(DATA_SIZE_UNITS, token)) {
    if (preferBytesOnLowercase && (token === 'kb' || token === 'mb' || token === 'gb'))
      return DATA_SIZE_UNITS[token.toUpperCase()]
    return DATA_SIZE_UNITS[token]
  }
  const lower = token.toLowerCase()
  const mapped = DATA_SIZE_CI_FALLBACK[lower]
  return mapped ? DATA_SIZE_UNITS[mapped] : null
}

function resolveTemperatureUnit(rawUnit) {
  const u = rawUnit.trim().toLowerCase().replace(/^°/, '')
  if (u === 'c' || u === 'celsius' || u === 'degc')
    return 'C'
  if (u === 'f' || u === 'fahrenheit' || u === 'degf')
    return 'F'
  if (u === 'k' || u === 'kelvin')
    return 'K'
  return null
}

function convertTemperature(value, from, to) {
  let celsius
  if (from === 'C')
    celsius = value
  else if (from === 'F')
    celsius = (value - 32) * (5 / 9)
  else
    celsius = value - 273.15

  if (to === 'C')
    return cleanFloat(celsius)
  if (to === 'F')
    return cleanFloat((celsius * 9) / 5 + 32)
  return cleanFloat(celsius + 273.15)
}

function formatDurationSeconds(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0)
    return '0s'
  if (totalSeconds < 1)
    return `${formatNumber(totalSeconds * 1000, 1)} ms`
  if (totalSeconds < 60)
    return `${formatNumber(totalSeconds, 2)}s`
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const secs = cleanFloat(totalSeconds % 60)
  const parts = []
  if (days > 0)
    parts.push(`${days}d`)
  if (hours > 0)
    parts.push(`${hours}h`)
  if (minutes > 0)
    parts.push(`${minutes}m`)
  if (secs > 0 || parts.length === 0)
    parts.push(`${formatNumber(secs, 1)}s`)
  return parts.join(' ')
}

function tryTransferTime(raw) {
  const match = raw.match(/^(?:(?:download|upload|transfer)\s+)?(-?\d+(?:[.,_]\d+)?)\s*([a-zA-Z]+)\s*(?:at|@|over|with)\s*(-?\d+(?:[.,_]\d+)?)\s*([a-zA-Z/]+)$/i)
  if (!match)
    return null
  const sizeVal = Number(match[1].replace(/[,_]/g, ''))
  const sizeUnit = resolveDataSizeUnit(match[2], true)
  const rateVal = Number(match[3].replace(/[,_]/g, ''))
  const rateKey = match[4].trim().toLowerCase()
  const rateUnit = BANDWIDTH_UNITS[rateKey]
  if (!sizeUnit || !rateUnit || !Number.isFinite(sizeVal) || !Number.isFinite(rateVal) || sizeVal < 0 || rateVal <= 0)
    return null

  const totalBytes = sizeVal * sizeUnit.factor
  const totalBits = totalBytes * 8
  const bitsPerSec = rateVal * rateUnit.bps
  const seconds = cleanFloat(totalBits / bitsPerSec)
  const mbPerSec = cleanFloat(bitsPerSec / 8e6)
  const mibPerSec = cleanFloat(bitsPerSec / (8 * 1024 * 1024))

  return {
    formatted: formatDurationSeconds(seconds),
    seconds,
    sizeDisplay: `${formatNumber(sizeVal)} ${sizeUnit.display}`,
    rateDisplay: `${formatNumber(rateVal)} ${rateUnit.display}`,
    mbPerSec,
    mibPerSec,
  }
}

function tryUnitConversion(raw) {
  // Explicit `<val> <from> to|in|-> <to>`
  const explicit = raw.match(/^(-?\d+(?:[.,_]\d+)?)\s*(°?[a-zA-Z][a-zA-Z0-9/]*)\s+(?:to|in|->|=>)\s+(°?[a-zA-Z][a-zA-Z0-9/]*)$/i)
  if (explicit) {
    const val = Number(explicit[1].replace(/[,_]/g, ''))
    const fromRaw = explicit[2]
    const toRaw = explicit[3]
    if (!Number.isFinite(val))
      return null

    // Temperature
    const fromTemp = resolveTemperatureUnit(fromRaw)
    const toTemp = resolveTemperatureUnit(toRaw)
    if (fromTemp && toTemp) {
      const converted = convertTemperature(val, fromTemp, toTemp)
      const unitSym = u => (u === 'K' ? 'K' : `°${u}`)
      return {
        primary: `${formatNumber(converted)} ${unitSym(toTemp)}`,
        copyText: `${formatNumber(converted)} ${unitSym(toTemp)}`,
        subtitle: `${formatNumber(val)} ${unitSym(fromTemp)} → ${unitSym(toTemp)}`,
        extras: ['C', 'F', 'K']
          .filter(u => u !== toTemp && u !== fromTemp)
          .map(u => ({
            label: `${formatNumber(convertTemperature(val, fromTemp, u))} ${unitSym(u)}`,
            copyText: `${formatNumber(convertTemperature(val, fromTemp, u))} ${unitSym(u)}`,
            subtitle: `温度换算 (${unitSym(u)})`,
          })),
      }
    }

    // Data Size
    const fromData = resolveDataSizeUnit(fromRaw, false)
    const toData = resolveDataSizeUnit(toRaw, false)
    if (fromData && toData) {
      const bytes = val * fromData.factor
      const converted = cleanFloat(bytes / toData.factor)
      return {
        primary: `${formatNumber(converted)} ${toData.display}`,
        copyText: `${formatNumber(converted)} ${toData.display}`,
        subtitle: `${formatNumber(val)} ${fromData.display} → ${toData.display}`,
        extras: [
          { unit: 'MB', factor: 1e6, display: 'MB (SI)' },
          { unit: 'MiB', factor: 1024 ** 2, display: 'MiB (IEC)' },
          { unit: 'GB', factor: 1e9, display: 'GB (SI)' },
          { unit: 'GiB', factor: 1024 ** 3, display: 'GiB (IEC)' },
        ]
          .filter(entry => entry.unit !== toData.display && entry.unit !== fromData.display)
          .slice(0, 3)
          .map(entry => ({
            label: `${formatNumber(bytes / entry.factor)} ${entry.unit}`,
            copyText: `${formatNumber(bytes / entry.factor)} ${entry.unit}`,
            subtitle: `${entry.display}`,
          })),
      }
    }

    // Bandwidth
    const fromBw = BANDWIDTH_UNITS[fromRaw.toLowerCase()]
    const toBw = BANDWIDTH_UNITS[toRaw.toLowerCase()]
    if (fromBw && toBw) {
      const bps = val * fromBw.bps
      const converted = cleanFloat(bps / toBw.bps)
      return {
        primary: `${formatNumber(converted)} ${toBw.display}`,
        copyText: `${formatNumber(converted)} ${toBw.display}`,
        subtitle: `${formatNumber(val)} ${fromBw.display} → ${toBw.display}`,
        extras: [],
      }
    }

    // Linear unit families
    const fromKey = fromRaw.toLowerCase()
    const toKey = toRaw.toLowerCase()
    for (const family of Object.values(LINEAR_UNITS)) {
      const uFrom = family.units[fromKey]
      const uTo = family.units[toKey]
      if (uFrom && uTo) {
        const baseVal = val * uFrom.factor
        const converted = cleanFloat(baseVal / uTo.factor)
        return {
          primary: `${formatNumber(converted)} ${uTo.display}`,
          copyText: `${formatNumber(converted)} ${uTo.display}`,
          subtitle: `${family.label} · ${formatNumber(val)} ${uFrom.display} → ${uTo.display}`,
          extras: family.defaults
            .filter(k => k !== toKey && k !== fromKey && family.units[k])
            .slice(0, 3)
            .map((k) => {
              const target = family.units[k]
              const v = cleanFloat(baseVal / target.factor)
              return {
                label: `${formatNumber(v)} ${target.display}`,
                copyText: `${formatNumber(v)} ${target.display}`,
                subtitle: `${formatNumber(val)} ${uFrom.display} in ${target.display}`,
              }
            }),
        }
      }
    }
  }

  return null
}

// =============================================================================
// 4. Aspect Ratio & Resolution Helper
// =============================================================================

const KNOWN_RESOLUTIONS = Object.freeze({
  '1280x720': 'HD 720p',
  '1920x1080': 'Full HD 1080p',
  '2560x1080': 'UW-FHD 21:9',
  '2560x1440': 'QHD / 2K 1440p',
  '2560x1600': 'WQXGA 16:10',
  '3440x1440': 'UW-QHD 21:9',
  '3840x2160': '4K UHD 2160p',
  '5120x2880': '5K Retina',
  '6016x3384': '6K Pro Display',
  '7680x4320': '8K UHD',
  '1080x1920': 'Vertical 9:16 (Mobile)',
})

function tryAspectRatio(raw) {
  // Scaling: `1920x1080 at width 1280` or `16:9 at 720h` or `16:9 at 1280w`
  const scaleMatch = raw.match(/^(\d+)\s*[x×:]\s*(\d+)\s+(?:at|@|to)\s+(?:(width|w|height|h)\s*)?(\d+)\s*(w|width|h|height)?$/i)
  if (scaleMatch) {
    const rw = Number.parseInt(scaleMatch[1], 10)
    const rh = Number.parseInt(scaleMatch[2], 10)
    const targetVal = Number.parseInt(scaleMatch[4], 10)
    const dimHint = (scaleMatch[3] || scaleMatch[5] || 'w').toLowerCase()
    if (rw > 0 && rh > 0 && targetVal > 0) {
      const isHeight = dimHint.startsWith('h')
      const outW = isHeight ? Math.round((targetVal * rw) / rh) : targetVal
      const outH = isHeight ? targetVal : Math.round((targetVal * rh) / rw)
      const g = gcd(rw, rh)
      return {
        primary: `${outW}×${outH}`,
        copyText: `${outW}x${outH}`,
        subtitle: `按比例 ${rw / g}:${rh / g} 缩放 (${isHeight ? `高 ${targetVal}` : `宽 ${targetVal}`})`,
        extras: [
          { label: `${rw / g}:${rh / g}`, copyText: `${rw / g}:${rh / g}`, subtitle: `宽高比 (${formatNumber(rw / rh, 3)})` },
          { label: `${formatNumber((outW * outH) / 1e6, 2)} MP`, copyText: `${formatNumber((outW * outH) / 1e6, 2)} MP`, subtitle: `${formatWithCommas(String(outW * outH))} 像素` },
        ],
      }
    }
  }

  // Resolution inspection: `1920x1080`
  const resMatch = raw.match(/^(\d{2,5})\s*[x×]\s*(\d{2,5})$/i)
  if (resMatch) {
    const w = Number.parseInt(resMatch[1], 10)
    const h = Number.parseInt(resMatch[2], 10)
    if (w > 0 && h > 0) {
      const g = gcd(w, h)
      const ratioStr = `${w / g}:${h / g}`
      const decimal = formatNumber(w / h, 4)
      const mp = formatNumber((w * h) / 1e6, 2)
      const preset = KNOWN_RESOLUTIONS[`${w}x${h}`]
      const halfW = Math.round(w / 2)
      const halfH = Math.round(h / 2)
      return {
        primary: ratioStr,
        copyText: ratioStr,
        subtitle: `${w}×${h}${preset ? ` (${preset})` : ''} · ${decimal} · ${mp} MP`,
        extras: [
          { label: `${w}×${h} (${mp} MP)`, copyText: `${w}x${h}`, subtitle: `${formatWithCommas(String(w * h))} total pixels` },
          { label: `50% 缩放: ${halfW}×${halfH}`, copyText: `${halfW}x${halfH}`, subtitle: `2× 缩放: ${w * 2}×${h * 2}` },
          { label: `CSS aspect-ratio: ${w / g} / ${h / g};`, copyText: `aspect-ratio: ${w / g} / ${h / g};`, subtitle: '复制 CSS aspect-ratio 属性' },
        ],
      }
    }
  }

  return null
}

// =============================================================================
// 5. Date Arithmetic (`today + 45 days`, `2026-01-15 + 3 months`, date diff)
// =============================================================================

const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function parseIsoDateUtc(str) {
  const m = str.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m)
    return null
  const y = Number.parseInt(m[1], 10)
  const mo = Number.parseInt(m[2], 10)
  const d = Number.parseInt(m[3], 10)
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d)
    return null
  return dt
}

function getTodayUtcDate(nowMs = Date.now()) {
  const local = new Date(nowMs)
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()))
}

function resolveDateAnchor(token, nowMs) {
  const t = token.trim().toLowerCase()
  const today = getTodayUtcDate(nowMs)
  if (t === 'today' || t === 'now' || t === '今天')
    return today
  if (t === 'tomorrow' || t === '明天')
    return new Date(today.getTime() + 86400000)
  if (t === 'yesterday' || t === '昨天')
    return new Date(today.getTime() - 86400000)
  return parseIsoDateUtc(t)
}

function formatUtcIsoDate(dt) {
  const y = String(dt.getUTCFullYear()).padStart(4, '0')
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getIsoWeekNumber(dt) {
  const copy = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()))
  const dayNum = copy.getUTCDay() || 7
  copy.setUTCDate(copy.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1))
  return Math.ceil((((copy - yearStart) / 86400000) + 1) / 7)
}

function addMonthsClamped(dt, months) {
  const y = dt.getUTCFullYear()
  const m = dt.getUTCMonth() + months
  const d = dt.getUTCDate()
  const targetYear = y + Math.floor(m / 12)
  const targetMonth = ((m % 12) + 12) % 12
  const maxDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(d, maxDay)))
}

function addBusinessDays(dt, count) {
  let cursor = new Date(dt.getTime())
  const step = count >= 0 ? 1 : -1
  let remaining = Math.abs(count)
  while (remaining > 0) {
    cursor = new Date(cursor.getTime() + step * 86400000)
    const dow = cursor.getUTCDay()
    if (dow !== 0 && dow !== 6)
      remaining -= 1
  }
  return cursor
}

function tryDateArithmetic(raw, nowMs = Date.now()) {
  // 1) `today + 45 days` / `2026-01-15 - 2 weeks` / `today + 10 workdays`
  const addMatch = raw.match(/^(today|tomorrow|yesterday|now|今天|明天|昨天|\d{4}-\d{2}-\d{2})\s*([+-])\s*(\d+)\s*(days?|d|weeks?|w|wks?|months?|mo|years?|y|yrs?|workdays?|business\s+days?|天|周|个月|月|年|工作日)$/i)
  if (addMatch) {
    const anchor = resolveDateAnchor(addMatch[1], nowMs)
    if (!anchor)
      return null
    const sign = addMatch[2] === '-' ? -1 : 1
    const amount = Number.parseInt(addMatch[3], 10) * sign
    const unit = addMatch[4].toLowerCase().replace(/\s+/g, '')
    let target
    if (unit === 'workday' || unit === 'workdays' || unit === 'businessday' || unit === 'businessdays' || unit === '工作日')
      target = addBusinessDays(anchor, amount)
    else if (unit.startsWith('w') || unit === '周')
      target = new Date(anchor.getTime() + amount * 7 * 86400000)
    else if (unit.startsWith('mo') || unit === '月' || unit === '个月')
      target = addMonthsClamped(anchor, amount)
    else if (unit.startsWith('y') || unit === '年')
      target = addMonthsClamped(anchor, amount * 12)
    else
      target = new Date(anchor.getTime() + amount * 86400000)

    const iso = formatUtcIsoDate(target)
    const dow = target.getUTCDay()
    const isoWeek = getIsoWeekNumber(target)
    const dayDiff = Math.round((target.getTime() - anchor.getTime()) / 86400000)
    return {
      primary: iso,
      copyText: iso,
      subtitle: `${WEEKDAYS_ZH[dow]} (${WEEKDAYS_EN[dow]}) · W${String(isoWeek).padStart(2, '0')} · 基准 ${formatUtcIsoDate(anchor)} (${dayDiff >= 0 ? '+' : ''}${dayDiff} 天)`,
      extras: [
        { label: `${iso} (${WEEKDAYS_EN[dow]})`, copyText: `${iso} (${WEEKDAYS_EN[dow]})`, subtitle: `ISO 周数 W${String(isoWeek).padStart(2, '0')}` },
      ],
    }
  }

  // 2) `days between 2026-01-01 and 2026-12-31` or `2026-12-31 - 2026-01-01`
  const betweenMatch = raw.match(/^(?:days?\s+between\s+)?(today|tomorrow|yesterday|\d{4}-\d{2}-\d{2})\s+(?:and|to|-)\s+(today|tomorrow|yesterday|\d{4}-\d{2}-\d{2})$/i)
  if (betweenMatch) {
    const d1 = resolveDateAnchor(betweenMatch[1], nowMs)
    const d2 = resolveDateAnchor(betweenMatch[2], nowMs)
    if (!d1 || !d2)
      return null
    const isSubtraction = /\s-\s/.test(raw)
    const diffDays = isSubtraction
      ? Math.round((d1.getTime() - d2.getTime()) / 86400000)
      : Math.round((d2.getTime() - d1.getTime()) / 86400000)
    const absDays = Math.abs(diffDays)
    const weeks = Math.floor(absDays / 7)
    const remDays = absDays % 7
    return {
      primary: `${diffDays} days`,
      copyText: String(diffDays),
      subtitle: `${formatUtcIsoDate(d1)} ↔ ${formatUtcIsoDate(d2)} · ${weeks} 周 ${remDays} 天`,
      extras: [
        { label: `${weeks}w ${remDays}d`, copyText: `${weeks}w ${remDays}d`, subtitle: `约 ${formatNumber(absDays / 30.4375, 1)} 个月` },
      ],
    }
  }

  // 3) `days until 2026-12-31` / `days since 2026-01-01`
  const relMatch = raw.match(/^days?\s+(until|since)\s+(\d{4}-\d{2}-\d{2})$/i)
  if (relMatch) {
    const mode = relMatch[1].toLowerCase()
    const target = parseIsoDateUtc(relMatch[2])
    if (!target)
      return null
    const today = getTodayUtcDate(nowMs)
    const diff = mode === 'until'
      ? Math.round((target.getTime() - today.getTime()) / 86400000)
      : Math.round((today.getTime() - target.getTime()) / 86400000)
    return {
      primary: `${diff} days`,
      copyText: String(diff),
      subtitle: `${mode === 'until' ? '距离' : '已过'} ${formatUtcIsoDate(target)} (基准 ${formatUtcIsoDate(today)})`,
      extras: [],
    }
  }

  return null
}

// =============================================================================
// Unified Query Evaluator
// =============================================================================

function evaluateQuery(rawInput, featureId, nowMs = Date.now()) {
  const raw = normalizeText(rawInput)
  const items = []

  // 1. Transfer time (`2.5 GB at 80 Mbps`)
  const transfer = tryTransferTime(raw)
  if (transfer) {
    items.push(buildCopyItem({
      id: `${featureId}-transfer-main`,
      featureId,
      title: transfer.formatted,
      subtitle: `${transfer.sizeDisplay} @ ${transfer.rateDisplay} · 吞吐 ${formatNumber(transfer.mbPerSec, 2)} MB/s (${formatNumber(transfer.mibPerSec, 2)} MiB/s)`,
      accessory: 'Transfer',
      copyText: transfer.formatted,
      expression: raw,
    }))
    items.push(buildCopyItem({
      id: `${featureId}-transfer-seconds`,
      featureId,
      title: `${formatNumber(transfer.seconds, 2)} seconds`,
      subtitle: `总耗时秒数 (${formatNumber(transfer.seconds / 60, 2)} min)`,
      accessory: 'Seconds',
      copyText: String(transfer.seconds),
      expression: raw,
    }))
    return items
  }

  // 2. Date arithmetic (`today + 45 days`, `days between ...`)
  const dateResult = tryDateArithmetic(raw, nowMs)
  if (dateResult) {
    items.push(buildCopyItem({
      id: `${featureId}-date-main`,
      featureId,
      title: dateResult.primary,
      subtitle: dateResult.subtitle,
      accessory: 'Date',
      copyText: dateResult.copyText,
      expression: raw,
    }))
    dateResult.extras.forEach((extra, idx) => {
      items.push(buildCopyItem({
        id: `${featureId}-date-extra-${idx}`,
        featureId,
        title: extra.label,
        subtitle: extra.subtitle,
        copyText: extra.copyText,
        expression: raw,
      }))
    })
    return items
  }

  // 3. Aspect ratio (`1920x1080`, `16:9 at 720h`)
  const aspect = tryAspectRatio(raw)
  if (aspect) {
    items.push(buildCopyItem({
      id: `${featureId}-aspect-main`,
      featureId,
      title: aspect.primary,
      subtitle: aspect.subtitle,
      accessory: 'Aspect',
      copyText: aspect.copyText,
      expression: raw,
    }))
    aspect.extras.forEach((extra, idx) => {
      items.push(buildCopyItem({
        id: `${featureId}-aspect-extra-${idx}`,
        featureId,
        title: extra.label,
        subtitle: extra.subtitle,
        copyText: extra.copyText,
        expression: raw,
      }))
    })
    return items
  }

  // 4. Explicit base conversion (`255 to hex`, `0xff to bin`)
  const baseConv = tryBaseConversion(raw)
  if (baseConv) {
    items.push(buildCopyItem({
      id: `${featureId}-base-main`,
      featureId,
      title: baseConv.primary.display,
      subtitle: `${raw} · ${baseConv.primary.label}`,
      accessory: baseConv.primary.base.toUpperCase(),
      copyText: baseConv.primary.value,
      expression: raw,
    }))
    baseConv.others.forEach((rep) => {
      items.push(buildCopyItem({
        id: `${featureId}-base-${rep.base}`,
        featureId,
        title: rep.display,
        subtitle: rep.label,
        accessory: rep.base.toUpperCase(),
        copyText: rep.value,
        expression: raw,
      }))
    })
    return items
  }

  // 5. Unit conversion (`100 c to f`, `12 km to mi`, `2.5 GB to MiB`)
  const unitConv = tryUnitConversion(raw)
  if (unitConv) {
    items.push(buildCopyItem({
      id: `${featureId}-unit-main`,
      featureId,
      title: unitConv.primary,
      subtitle: unitConv.subtitle,
      accessory: 'Unit',
      copyText: unitConv.copyText,
      expression: raw,
    }))
    unitConv.extras.forEach((extra, idx) => {
      items.push(buildCopyItem({
        id: `${featureId}-unit-extra-${idx}`,
        featureId,
        title: extra.label,
        subtitle: extra.subtitle,
        copyText: extra.copyText,
        expression: raw,
      }))
    })
    return items
  }

  // 6. Natural percentages (`15% off 249`, `20% of 500`, `45 as % of 180`)
  const pctResult = tryNaturalPercentage(raw)
  if (pctResult) {
    const copyText = pctResult.copyText ?? formatNumber(pctResult.primary)
    items.push(buildCopyItem({
      id: `${featureId}-pct-main`,
      featureId,
      title: pctResult.title,
      subtitle: pctResult.subtitle,
      accessory: 'Percent',
      copyText,
      expression: raw,
    }))
    pctResult.extras.forEach((extra, idx) => {
      items.push(buildCopyItem({
        id: `${featureId}-pct-extra-${idx}`,
        featureId,
        title: extra.value,
        subtitle: `${extra.label} · ${extra.subtitle}`,
        copyText: extra.value,
        expression: raw,
      }))
    })
    return items
  }

  // 7. Recursive-descent math & programmer expression (`249 + 13%`, `0xff & 0x0f`, `sqrt(144) + 2^10`)
  const math = evaluateMathExpression(raw)
  const formatted = formatNumber(math.value)
  const pretty = formatWithCommas(formatted)
  items.push(buildCopyItem({
    id: `${featureId}-math-main`,
    featureId,
    title: pretty,
    subtitle: `${raw} = ${formatted}`,
    accessory: math.programmerMode ? 'Programmer' : 'Result',
    copyText: formatted,
    expression: raw,
    extraActions: [
      {
        id: 'save-history',
        label: '保存到历史',
        payload: { expression: raw, result: formatted },
      },
    ],
  }))

  if (Number.isSafeInteger(math.value) && (math.programmerMode || Math.abs(math.value) <= 0xFFFFFFFF)) {
    const reps = formatBaseRepresentations(math.value)
    for (const rep of reps) {
      if (rep.base === 'dec')
        continue
      items.push(buildCopyItem({
        id: `${featureId}-math-${rep.base}`,
        featureId,
        title: rep.display,
        subtitle: `${rep.label} · ${raw}`,
        accessory: rep.base.toUpperCase(),
        copyText: rep.value,
        expression: raw,
      }))
    }
  }

  return items
}

function buildWelcomeItems(featureId, history) {
  const items = []
  if (history.length > 0) {
    history.slice(0, 8).forEach((entry, idx) => {
      items.push(buildCopyItem({
        id: `${featureId}-hist-${idx}`,
        featureId,
        title: `${entry.expression} = ${entry.result}`,
        subtitle: '最近计算历史 · 回车复制结果',
        accessory: 'History',
        copyText: entry.result,
        expression: entry.expression,
      }))
    })
    items.push(buildItem({
      id: `${featureId}-hist-clear`,
      featureId,
      title: '清空计算历史',
      subtitle: `当前保存 ${history.length} 条记录`,
      accessory: 'Clear',
      actions: [{ id: 'clear-history', label: '清空历史', payload: {} }],
      defaultAction: 'clear-history',
    }))
  }

  const examples = [
    { expr: '15% off 249', desc: '自然语言折扣 / 百分比 (249 + 13%, 20% of 500)' },
    { expr: '0xff & 0x0f', desc: '程序员进制与位运算 (hex / bin / oct / shift)' },
    { expr: '2.5 GB at 80 Mbps', desc: '带宽传输时间与单位换算 (100 c to f, 12 km to mi)' },
    { expr: '1920x1080', desc: '分辨率宽高比、像素与缩放 (16:9 at 720h)' },
    { expr: 'today + 45 days', desc: '日期加减、工作日与间隔天数 (days between ...)' },
  ]
  examples.forEach((ex, idx) => {
    items.push(buildInfoItem({
      id: `${featureId}-example-${idx}`,
      featureId,
      title: ex.expr,
      subtitle: ex.desc,
      accessory: 'Example',
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

const pluginLifecycle = {
  async onInit() {
    destroyed = false
    if (typeof plugin?.storage?.getFile === 'function' && typeof plugin?.storage?.setFile === 'function') {
      try {
        const existing = await plugin.storage.getFile(STORE_FILE)
        if (!existing)
          await plugin.storage.setFile(STORE_FILE, { version: 1, history: [] })
      }
      catch {
        logger?.warn?.('[touch-calc-pad] Failed to initialize storage')
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
      if (!rawText || /^(?:history|历史)$/i.test(rawText)) {
        const history = await loadHistory()
        if (isStale())
          return true
        await publishItems(buildWelcomeItems(featureId, history), isStale)
        return true
      }

      const items = evaluateQuery(rawText, featureId, Date.now())
      await publishItems(items, isStale)
      return true
    }
    catch (error) {
      if (isStale())
        return true
      const message = error instanceof Error ? error.message : '无法解析表达式'
      try {
        await publishItems([
          buildInfoItem({
            id: `${featureId}-parse-hint`,
            featureId,
            title: '无法解析输入表达式',
            subtitle: `${message} · 示例: 15% off 249 / 0xff & 0x0f / 2.5 GB at 80 Mbps / today + 45 days`,
            accessory: 'Hint',
          }),
        ], isStale)
        return true
      }
      catch {
        logger?.error?.('[touch-calc-pad] Failed to publish fallback')
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
    const featureId = item?.meta?.featureId || 'calc-pad'

    try {
      if (actionId === 'copy-result') {
        const text = typeof payload.text === 'string' ? payload.text : ''
        if (!text) {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: 'invalid-action',
            message: '缺少可复制的结果',
          }
        }
        const copyRes = await copyWithPermissionGate(text)
        if (copyRes.success && payload.expression && payload.result) {
          try {
            await saveHistoryEntry(payload.expression, payload.result)
          }
          catch {
            logger?.warn?.('[touch-calc-pad] Failed to record history entry')
          }
        }
        return copyRes
      }

      if (actionId === 'save-history') {
        const saved = await saveHistoryEntry(payload.expression, payload.result)
        if (!saved) {
          return {
            externalAction: true,
            success: false,
            status: 'blocked',
            reason: 'action-failed',
            message: '保存计算历史失败',
          }
        }
        return { externalAction: true, success: true, status: 'started', message: '已保存到计算历史' }
      }

      if (actionId === 'clear-history') {
        await clearHistory()
        const generation = ++activeGeneration
        const isStale = () => destroyed || generation !== activeGeneration
        await publishItems(buildWelcomeItems(featureId, []), isStale)
        return { externalAction: true, success: true, status: 'started', message: '已清空计算历史' }
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
      logger?.error?.('[touch-calc-pad] Action failed')
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
