/**
 * Safe, zero-eval parsers and evaluators for user-provided JS object literals and query expressions.
 *
 * Neither `eval` nor `new Function` is used anywhere in this module:
 * - `evaluateObjectLiteral` parses JSON5/JS object and array literals with a recursive-descent parser.
 * - `evaluateQuery` compiles and interprets read-only query expressions against parsed JSON data
 *   with strict property/method allowlists and prototype-escape guards.
 */

const FORBIDDEN_KEYS = new Set([
  '__proto__',
  'prototype',
  'constructor',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
])

const MAX_PARSE_DEPTH = 64
const MAX_EVAL_STEPS = 50_000

const SAFE_ARRAY_METHODS = new Set([
  'at',
  'concat',
  'every',
  'filter',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'flat',
  'flatMap',
  'includes',
  'indexOf',
  'join',
  'lastIndexOf',
  'map',
  'reduce',
  'reduceRight',
  'reverse',
  'slice',
  'some',
  'sort',
  'toReversed',
  'toSorted',
])

const SAFE_STRING_METHODS = new Set([
  'at',
  'charAt',
  'charCodeAt',
  'concat',
  'endsWith',
  'includes',
  'indexOf',
  'lastIndexOf',
  'padEnd',
  'padStart',
  'repeat',
  'replace',
  'replaceAll',
  'slice',
  'split',
  'startsWith',
  'substring',
  'toLowerCase',
  'toUpperCase',
  'trim',
  'trimEnd',
  'trimStart',
])

const SAFE_NUMBER_METHODS = new Set([
  'toExponential',
  'toFixed',
  'toPrecision',
  'toString',
])

const SAFE_BOOLEAN_METHODS = new Set([
  'toString',
])

const SAFE_OBJECT_STATIC = Object.freeze({
  entries: Object.entries,
  fromEntries: (entries: Iterable<readonly [PropertyKey, unknown]>) => {
    const out: Record<string, unknown> = {}
    for (const [key, value] of entries) {
      const prop = String(key)
      if (FORBIDDEN_KEYS.has(prop)) {
        throw new Error(`Disallowed property "${prop}"`)
      }
      out[prop] = value
    }
    return out
  },
  hasOwn: (target: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(target, key),
  keys: Object.keys,
  values: Object.values,
})

const SAFE_ARRAY_STATIC = Object.freeze({
  from: Array.from,
  isArray: Array.isArray,
  of: Array.of,
})

const SAFE_JSON_STATIC = Object.freeze({
  parse: JSON.parse,
  stringify: JSON.stringify,
})

const SAFE_MATH_STATIC = Object.freeze({
  E: Math.E,
  LN10: Math.LN10,
  LN2: Math.LN2,
  LOG10E: Math.LOG10E,
  LOG2E: Math.LOG2E,
  PI: Math.PI,
  SQRT1_2: Math.SQRT1_2,
  SQRT2: Math.SQRT2,
  abs: Math.abs,
  acos: Math.acos,
  asin: Math.asin,
  atan: Math.atan,
  atan2: Math.atan2,
  cbrt: Math.cbrt,
  ceil: Math.ceil,
  clz32: Math.clz32,
  cos: Math.cos,
  exp: Math.exp,
  floor: Math.floor,
  hypot: Math.hypot,
  log: Math.log,
  log10: Math.log10,
  log2: Math.log2,
  max: Math.max,
  min: Math.min,
  pow: Math.pow,
  round: Math.round,
  sign: Math.sign,
  sin: Math.sin,
  sqrt: Math.sqrt,
  tan: Math.tan,
  trunc: Math.trunc,
})

const SAFE_NUMBER_STATIC = Object.assign(
  (value?: unknown) => Number(value),
  {
    EPSILON: Number.EPSILON,
    MAX_SAFE_INTEGER: Number.MAX_SAFE_INTEGER,
    MAX_VALUE: Number.MAX_VALUE,
    MIN_SAFE_INTEGER: Number.MIN_SAFE_INTEGER,
    MIN_VALUE: Number.MIN_VALUE,
    NaN: Number.NaN,
    NEGATIVE_INFINITY: Number.NEGATIVE_INFINITY,
    POSITIVE_INFINITY: Number.POSITIVE_INFINITY,
    isFinite: Number.isFinite,
    isInteger: Number.isInteger,
    isNaN: Number.isNaN,
    isSafeInteger: Number.isSafeInteger,
    parseFloat: Number.parseFloat,
    parseInt: Number.parseInt,
  },
)

const SAFE_STRING_STATIC = Object.assign(
  (value?: unknown) => String(value),
  {
    fromCharCode: String.fromCharCode,
    fromCodePoint: String.fromCodePoint,
  },
)

const SAFE_GLOBALS: Record<string, unknown> = Object.freeze({
  Array: SAFE_ARRAY_STATIC,
  Boolean,
  Infinity: Number.POSITIVE_INFINITY,
  JSON: SAFE_JSON_STATIC,
  Math: SAFE_MATH_STATIC,
  NaN: Number.NaN,
  Number: SAFE_NUMBER_STATIC,
  Object: SAFE_OBJECT_STATIC,
  String: SAFE_STRING_STATIC,
  decodeURIComponent,
  encodeURIComponent,
  isFinite: Number.isFinite,
  isNaN: Number.isNaN,
  parseFloat: Number.parseFloat,
  parseInt: Number.parseInt,
  undefined,
})

function collectFunctions(record: Record<string, unknown>): Array<(...args: any[]) => unknown> {
  return Object.values(record).filter(
    (value): value is (...args: any[]) => unknown => typeof value === 'function',
  )
}

const SAFE_CALLABLES = new WeakSet<(...args: any[]) => unknown>([
  ...collectFunctions(SAFE_OBJECT_STATIC),
  ...collectFunctions(SAFE_ARRAY_STATIC),
  ...collectFunctions(SAFE_JSON_STATIC),
  ...collectFunctions(SAFE_MATH_STATIC),
  SAFE_NUMBER_STATIC,
  Number.isFinite,
  Number.isInteger,
  Number.isNaN,
  Number.isSafeInteger,
  Number.parseFloat,
  Number.parseInt,
  SAFE_STRING_STATIC,
  String.fromCharCode,
  String.fromCodePoint,
  Boolean,
  decodeURIComponent,
  encodeURIComponent,
])

function isIdentifierStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_' || ch === '$'
}

function isIdentifierPart(ch: string): boolean {
  return isIdentifierStart(ch) || (ch >= '0' && ch <= '9')
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9'
}

function isHexDigit(ch: string): boolean {
  return isDigit(ch) || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F')
}

function decodeEscape(source: string, index: number): { value: string, nextIndex: number } {
  if (index >= source.length) {
    throw new SyntaxError('Unterminated escape sequence')
  }
  const ch = source[index]
  switch (ch) {
    case 'n': return { value: '\n', nextIndex: index + 1 }
    case 'r': return { value: '\r', nextIndex: index + 1 }
    case 't': return { value: '\t', nextIndex: index + 1 }
    case 'b': return { value: '\b', nextIndex: index + 1 }
    case 'f': return { value: '\f', nextIndex: index + 1 }
    case 'v': return { value: '\v', nextIndex: index + 1 }
    case '0': return { value: '\0', nextIndex: index + 1 }
    case '\\': return { value: '\\', nextIndex: index + 1 }
    case '\'': return { value: '\'', nextIndex: index + 1 }
    case '"': return { value: '"', nextIndex: index + 1 }
    case '`': return { value: '`', nextIndex: index + 1 }
    case '\n': return { value: '', nextIndex: index + 1 }
    case '\r':
      return { value: '', nextIndex: source[index + 1] === '\n' ? index + 2 : index + 1 }
    case 'x': {
      const hex = source.slice(index + 1, index + 3)
      if (hex.length !== 2 || ![...hex].every(isHexDigit)) {
        throw new SyntaxError('Invalid hexadecimal escape sequence')
      }
      return { value: String.fromCharCode(Number.parseInt(hex, 16)), nextIndex: index + 3 }
    }
    case 'u': {
      if (source[index + 1] === '{') {
        const end = source.indexOf('}', index + 2)
        if (end === -1) {
          throw new SyntaxError('Unterminated unicode code point escape')
        }
        const hex = source.slice(index + 2, end)
        if (!hex || ![...hex].every(isHexDigit)) {
          throw new SyntaxError('Invalid unicode code point escape')
        }
        const codePoint = Number.parseInt(hex, 16)
        if (codePoint > 0x10FFFF) {
          throw new SyntaxError('Unicode code point out of range')
        }
        return { value: String.fromCodePoint(codePoint), nextIndex: end + 1 }
      }
      const hex = source.slice(index + 1, index + 5)
      if (hex.length !== 4 || ![...hex].every(isHexDigit)) {
        throw new SyntaxError('Invalid unicode escape sequence')
      }
      return { value: String.fromCharCode(Number.parseInt(hex, 16)), nextIndex: index + 5 }
    }
    default:
      return { value: ch, nextIndex: index + 1 }
  }
}

function readQuotedString(source: string, start: number, quote: string): { value: string, nextIndex: number } {
  let i = start + 1
  let out = ''
  while (i < source.length) {
    const ch = source[i]
    if (ch === quote) {
      return { value: out, nextIndex: i + 1 }
    }
    if (ch === '\\') {
      const decoded = decodeEscape(source, i + 1)
      out += decoded.value
      i = decoded.nextIndex
      continue
    }
    if ((ch === '\n' || ch === '\r') && quote !== '`') {
      throw new SyntaxError('Unterminated string literal')
    }
    out += ch
    i += 1
  }
  throw new SyntaxError('Unterminated string literal')
}

function readNumberLiteral(source: string, start: number): { value: number, nextIndex: number } {
  let i = start
  if (source[i] === '0' && i + 1 < source.length) {
    const next = source[i + 1]
    if (next === 'x' || next === 'X') {
      i += 2
      const digitsStart = i
      while (i < source.length && (isHexDigit(source[i]) || source[i] === '_'))
        i += 1
      const raw = source.slice(digitsStart, i).replace(/_/g, '')
      if (!raw)
        throw new SyntaxError('Invalid hexadecimal literal')
      return { value: Number.parseInt(raw, 16), nextIndex: i }
    }
    if (next === 'o' || next === 'O') {
      i += 2
      const digitsStart = i
      while (i < source.length && ((source[i] >= '0' && source[i] <= '7') || source[i] === '_'))
        i += 1
      const raw = source.slice(digitsStart, i).replace(/_/g, '')
      if (!raw)
        throw new SyntaxError('Invalid octal literal')
      return { value: Number.parseInt(raw, 8), nextIndex: i }
    }
    if (next === 'b' || next === 'B') {
      i += 2
      const digitsStart = i
      while (i < source.length && (source[i] === '0' || source[i] === '1' || source[i] === '_'))
        i += 1
      const raw = source.slice(digitsStart, i).replace(/_/g, '')
      if (!raw)
        throw new SyntaxError('Invalid binary literal')
      return { value: Number.parseInt(raw, 2), nextIndex: i }
    }
  }

  while (i < source.length && (isDigit(source[i]) || source[i] === '_'))
    i += 1
  if (source[i] === '.') {
    i += 1
    while (i < source.length && (isDigit(source[i]) || source[i] === '_'))
      i += 1
  }
  if (source[i] === 'e' || source[i] === 'E') {
    i += 1
    if (source[i] === '+' || source[i] === '-')
      i += 1
    const expStart = i
    while (i < source.length && (isDigit(source[i]) || source[i] === '_'))
      i += 1
    if (i === expStart)
      throw new SyntaxError('Invalid exponent in number literal')
  }

  const raw = source.slice(start, i).replace(/_/g, '')
  const num = Number(raw)
  if (Number.isNaN(num))
    throw new SyntaxError(`Invalid number literal "${raw}"`)
  return { value: num, nextIndex: i }
}

/**
 * Parses a JavaScript/JSON5 object or array literal without using `eval` or `new Function`.
 */
export function evaluateObjectLiteral(source: string): unknown {
  let pos = 0

  function skipIgnored(): void {
    while (pos < source.length) {
      const ch = source[pos]
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\uFEFF') {
        pos += 1
        continue
      }
      if (ch === '/' && source[pos + 1] === '/') {
        pos += 2
        while (pos < source.length && source[pos] !== '\n' && source[pos] !== '\r')
          pos += 1
        continue
      }
      if (ch === '/' && source[pos + 1] === '*') {
        const end = source.indexOf('*/', pos + 2)
        if (end === -1)
          throw new SyntaxError('Unterminated block comment')
        pos = end + 2
        continue
      }
      break
    }
  }

  function readIdentifier(): string {
    const start = pos
    if (pos >= source.length || !isIdentifierStart(source[pos])) {
      throw new SyntaxError(`Expected identifier at position ${pos}`)
    }
    pos += 1
    while (pos < source.length && isIdentifierPart(source[pos]))
      pos += 1
    return source.slice(start, pos)
  }

  function parseValue(depth: number): unknown {
    if (depth > MAX_PARSE_DEPTH) {
      throw new SyntaxError('Maximum nesting depth exceeded')
    }
    skipIgnored()
    if (pos >= source.length) {
      throw new SyntaxError('Unexpected end of input')
    }

    const ch = source[pos]
    if (ch === '{')
      return parseObject(depth + 1)
    if (ch === '[')
      return parseArray(depth + 1)
    if (ch === '\'' || ch === '"' || ch === '`') {
      const { value, nextIndex } = readQuotedString(source, pos, ch)
      if (ch === '`' && value.includes('${')) {
        throw new SyntaxError('Template interpolation is not allowed in object literals')
      }
      pos = nextIndex
      return value
    }
    if (ch === '-' || ch === '+') {
      const sign = ch === '-' ? -1 : 1
      pos += 1
      skipIgnored()
      if (source.startsWith('Infinity', pos) && !isIdentifierPart(source[pos + 8] || '')) {
        pos += 8
        return sign * Number.POSITIVE_INFINITY
      }
      if (source.startsWith('NaN', pos) && !isIdentifierPart(source[pos + 3] || '')) {
        pos += 3
        return Number.NaN
      }
      const next = source[pos]
      if (!next || (!isDigit(next) && next !== '.')) {
        throw new SyntaxError(`Expected number after "${ch}" at position ${pos}`)
      }
      const { value, nextIndex } = readNumberLiteral(source, pos)
      pos = nextIndex
      return sign * value
    }
    if (isDigit(ch) || (ch === '.' && isDigit(source[pos + 1] || ''))) {
      const { value, nextIndex } = readNumberLiteral(source, pos)
      pos = nextIndex
      return value
    }
    if (isIdentifierStart(ch)) {
      const ident = readIdentifier()
      if (ident === 'true')
        return true
      if (ident === 'false')
        return false
      if (ident === 'null')
        return null
      if (ident === 'undefined')
        return undefined
      if (ident === 'NaN')
        return Number.NaN
      if (ident === 'Infinity')
        return Number.POSITIVE_INFINITY
      throw new SyntaxError(`Unexpected identifier "${ident}"`)
    }

    throw new SyntaxError(`Unexpected token "${ch}" at position ${pos}`)
  }

  function parseArray(depth: number): unknown[] {
    pos += 1 // skip '['
    const result: unknown[] = []
    while (true) {
      skipIgnored()
      if (pos >= source.length)
        throw new SyntaxError('Unterminated array literal')
      if (source[pos] === ']') {
        pos += 1
        return result
      }
      result.push(parseValue(depth))
      skipIgnored()
      if (source[pos] === ',') {
        pos += 1
        continue
      }
      if (source[pos] === ']') {
        pos += 1
        return result
      }
      throw new SyntaxError(`Expected "," or "]" at position ${pos}`)
    }
  }

  function parseObject(depth: number): Record<string, unknown> {
    pos += 1 // skip '{'
    const result: Record<string, unknown> = {}
    while (true) {
      skipIgnored()
      if (pos >= source.length)
        throw new SyntaxError('Unterminated object literal')
      if (source[pos] === '}') {
        pos += 1
        return result
      }

      let key: string
      const ch = source[pos]
      if (ch === '\'' || ch === '"') {
        const parsedKey = readQuotedString(source, pos, ch)
        key = parsedKey.value
        pos = parsedKey.nextIndex
      }
      else if (isDigit(ch)) {
        const parsedKey = readNumberLiteral(source, pos)
        key = String(parsedKey.value)
        pos = parsedKey.nextIndex
      }
      else if (isIdentifierStart(ch)) {
        key = readIdentifier()
      }
      else {
        throw new SyntaxError(`Expected object property name at position ${pos}`)
      }

      if (FORBIDDEN_KEYS.has(key)) {
        throw new SyntaxError(`Disallowed property "${key}"`)
      }

      skipIgnored()
      if (source[pos] !== ':') {
        throw new SyntaxError(`Expected ":" after property "${key}" at position ${pos}`)
      }
      pos += 1

      const value = parseValue(depth)
      result[key] = value

      skipIgnored()
      if (source[pos] === ',') {
        pos += 1
        continue
      }
      if (source[pos] === '}') {
        pos += 1
        return result
      }
      throw new SyntaxError(`Expected "," or "}" at position ${pos}`)
    }
  }

  const value = parseValue(0)
  skipIgnored()
  if (pos < source.length) {
    throw new SyntaxError(`Unexpected trailing token "${source[pos]}" at position ${pos}`)
  }
  return value
}

// ============================================================================
// Safe Query Expression Parser & Evaluator (zero `eval` / `new Function`)
// ============================================================================

type TokenType = 'number' | 'string' | 'ident' | 'op' | 'punct' | 'template' | 'eof'

interface Token {
  type: TokenType
  value: string | number
  parts?: Array<{ kind: 'text', value: string } | { kind: 'expr', source: string }>
  pos: number
}

type ExprNode
  = | { kind: 'literal', value: unknown }
    | { kind: 'this' }
    | { kind: 'ident', name: string }
    | { kind: 'template', parts: Array<{ kind: 'text', value: string } | { kind: 'expr', node: ExprNode }> }
    | { kind: 'array', elements: Array<{ spread: boolean, node: ExprNode }> }
    | { kind: 'object', properties: Array<{ kind: 'spread', node: ExprNode } | { kind: 'prop', key: ExprNode | string, computed: boolean, value: ExprNode }> }
    | { kind: 'unary', op: string, argument: ExprNode }
    | { kind: 'binary', op: string, left: ExprNode, right: ExprNode }
    | { kind: 'logical', op: '&&' | '||' | '??', left: ExprNode, right: ExprNode }
    | { kind: 'conditional', test: ExprNode, consequent: ExprNode, alternate: ExprNode }
    | { kind: 'member', object: ExprNode, property: ExprNode | string, computed: boolean, optional: boolean }
    | { kind: 'call', callee: ExprNode, args: Array<{ spread: boolean, node: ExprNode }>, optional: boolean }
    | { kind: 'arrow', params: string[], body: ExprNode }

const MULTI_CHAR_OPS = ['===', '!==', '...', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '=>']
const SINGLE_CHAR_OPS = new Set(['+', '-', '*', '/', '%', '<', '>', '!', '?'])
const PUNCT_CHARS = new Set(['(', ')', '[', ']', '{', '}', '.', ',', ':'])

function tokenizeExpression(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < source.length) {
    const ch = source[i]
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1
      continue
    }
    if (ch === '/' && source[i + 1] === '/') {
      i += 2
      while (i < source.length && source[i] !== '\n' && source[i] !== '\r')
        i += 1
      continue
    }
    if (ch === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      if (end === -1)
        throw new SyntaxError('Unterminated block comment')
      i = end + 2
      continue
    }

    if (ch === '\'' || ch === '"') {
      const parsed = readQuotedString(source, i, ch)
      tokens.push({ type: 'string', value: parsed.value, pos: i })
      i = parsed.nextIndex
      continue
    }

    if (ch === '`') {
      const startPos = i
      i += 1
      const parts: Array<{ kind: 'text', value: string } | { kind: 'expr', source: string }> = []
      let currentText = ''
      let closed = false
      while (i < source.length) {
        if (source[i] === '`') {
          parts.push({ kind: 'text', value: currentText })
          i += 1
          closed = true
          break
        }
        if (source[i] === '\\') {
          const decoded = decodeEscape(source, i + 1)
          currentText += decoded.value
          i = decoded.nextIndex
          continue
        }
        if (source[i] === '$' && source[i + 1] === '{') {
          parts.push({ kind: 'text', value: currentText })
          currentText = ''
          i += 2
          const exprStart = i
          let braceDepth = 1
          while (i < source.length && braceDepth > 0) {
            if (source[i] === '\'' || source[i] === '"') {
              i = readQuotedString(source, i, source[i]).nextIndex
              continue
            }
            if (source[i] === '{')
              braceDepth += 1
            else if (source[i] === '}')
              braceDepth -= 1
            if (braceDepth > 0)
              i += 1
          }
          if (braceDepth !== 0)
            throw new SyntaxError('Unterminated template expression')
          parts.push({ kind: 'expr', source: source.slice(exprStart, i) })
          i += 1 // skip closing '}'
          continue
        }
        currentText += source[i]
        i += 1
      }
      if (!closed)
        throw new SyntaxError('Unterminated template literal')
      tokens.push({ type: 'template', value: '', parts, pos: startPos })
      continue
    }

    if (isDigit(ch) || (ch === '.' && isDigit(source[i + 1] || ''))) {
      const parsed = readNumberLiteral(source, i)
      tokens.push({ type: 'number', value: parsed.value, pos: i })
      i = parsed.nextIndex
      continue
    }

    if (isIdentifierStart(ch)) {
      const start = i
      i += 1
      while (i < source.length && isIdentifierPart(source[i]))
        i += 1
      tokens.push({ type: 'ident', value: source.slice(start, i), pos: start })
      continue
    }

    let matchedOp: string | null = null
    for (const op of MULTI_CHAR_OPS) {
      if (source.startsWith(op, i)) {
        matchedOp = op
        break
      }
    }
    if (matchedOp) {
      tokens.push({ type: 'op', value: matchedOp, pos: i })
      i += matchedOp.length
      continue
    }

    if (SINGLE_CHAR_OPS.has(ch)) {
      tokens.push({ type: 'op', value: ch, pos: i })
      i += 1
      continue
    }

    if (PUNCT_CHARS.has(ch)) {
      tokens.push({ type: 'punct', value: ch, pos: i })
      i += 1
      continue
    }

    throw new SyntaxError(`Unsupported token "${ch}" at position ${i}`)
  }

  tokens.push({ type: 'eof', value: '', pos: source.length })
  return tokens
}

function parseExpression(source: string, depth = 0): ExprNode {
  if (depth > MAX_PARSE_DEPTH) {
    throw new SyntaxError('Maximum expression depth exceeded')
  }
  const tokens = tokenizeExpression(source)
  let pos = 0

  const peek = (offset = 0): Token => tokens[pos + offset] ?? tokens[tokens.length - 1]
  const consume = (): Token => tokens[pos++]
  const match = (type: TokenType, value?: string): boolean => {
    const token = peek()
    if (token.type === type && (value === undefined || token.value === value)) {
      pos += 1
      return true
    }
    return false
  }
  const expect = (type: TokenType, value?: string): Token => {
    const token = peek()
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      throw new SyntaxError(`Expected "${value ?? type}" near position ${token.pos}`)
    }
    pos += 1
    return token
  }

  function tryParseArrowParams(): string[] | null {
    const token = peek()
    if (token.type === 'ident' && peek(1).type === 'op' && peek(1).value === '=>') {
      const name = String(consume().value)
      consume() // =>
      return [name]
    }
    if (token.type === 'punct' && token.value === '(') {
      let scan = pos + 1
      const params: string[] = []
      if (tokens[scan]?.type === 'punct' && tokens[scan]?.value === ')') {
        scan += 1
        if (tokens[scan]?.type === 'op' && tokens[scan]?.value === '=>') {
          pos = scan + 1
          return params
        }
        return null
      }
      while (scan < tokens.length) {
        if (tokens[scan]?.type !== 'ident')
          return null
        params.push(String(tokens[scan].value))
        scan += 1
        if (tokens[scan]?.type === 'punct' && tokens[scan]?.value === ',') {
          scan += 1
          continue
        }
        if (tokens[scan]?.type === 'punct' && tokens[scan]?.value === ')') {
          scan += 1
          if (tokens[scan]?.type === 'op' && tokens[scan]?.value === '=>') {
            pos = scan + 1
            return params
          }
          return null
        }
        return null
      }
    }
    return null
  }

  function parseAssignment(exprDepth: number): ExprNode {
    if (exprDepth > MAX_PARSE_DEPTH)
      throw new SyntaxError('Maximum expression depth exceeded')
    const params = tryParseArrowParams()
    if (params !== null) {
      for (const param of params) {
        if (FORBIDDEN_KEYS.has(param))
          throw new SyntaxError(`Disallowed parameter "${param}"`)
      }
      return { kind: 'arrow', params, body: parseAssignment(exprDepth + 1) }
    }
    return parseConditional(exprDepth)
  }

  function parseConditional(exprDepth: number): ExprNode {
    const test = parseNullish(exprDepth)
    if (match('op', '?')) {
      const consequent = parseAssignment(exprDepth + 1)
      expect('punct', ':')
      const alternate = parseAssignment(exprDepth + 1)
      return { kind: 'conditional', test, consequent, alternate }
    }
    return test
  }

  function parseNullish(exprDepth: number): ExprNode {
    let left = parseLogicalOr(exprDepth)
    while (match('op', '??')) {
      left = { kind: 'logical', op: '??', left, right: parseLogicalOr(exprDepth + 1) }
    }
    return left
  }

  function parseLogicalOr(exprDepth: number): ExprNode {
    let left = parseLogicalAnd(exprDepth)
    while (match('op', '||')) {
      left = { kind: 'logical', op: '||', left, right: parseLogicalAnd(exprDepth + 1) }
    }
    return left
  }

  function parseLogicalAnd(exprDepth: number): ExprNode {
    let left = parseEquality(exprDepth)
    while (match('op', '&&')) {
      left = { kind: 'logical', op: '&&', left, right: parseEquality(exprDepth + 1) }
    }
    return left
  }

  function parseEquality(exprDepth: number): ExprNode {
    let left = parseRelational(exprDepth)
    while (peek().type === 'op' && ['===', '!==', '==', '!='].includes(String(peek().value))) {
      const op = String(consume().value)
      left = { kind: 'binary', op, left, right: parseRelational(exprDepth + 1) }
    }
    return left
  }

  function parseRelational(exprDepth: number): ExprNode {
    let left = parseAdditive(exprDepth)
    while (
      (peek().type === 'op' && ['<', '<=', '>', '>='].includes(String(peek().value)))
      || (peek().type === 'ident' && peek().value === 'in')
    ) {
      const op = String(consume().value)
      left = { kind: 'binary', op, left, right: parseAdditive(exprDepth + 1) }
    }
    return left
  }

  function parseAdditive(exprDepth: number): ExprNode {
    let left = parseMultiplicative(exprDepth)
    while (peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = String(consume().value)
      left = { kind: 'binary', op, left, right: parseMultiplicative(exprDepth + 1) }
    }
    return left
  }

  function parseMultiplicative(exprDepth: number): ExprNode {
    let left = parseUnary(exprDepth)
    while (peek().type === 'op' && ['*', '/', '%'].includes(String(peek().value))) {
      const op = String(consume().value)
      left = { kind: 'binary', op, left, right: parseUnary(exprDepth + 1) }
    }
    return left
  }

  function parseUnary(exprDepth: number): ExprNode {
    if (
      (peek().type === 'op' && ['!', '-', '+'].includes(String(peek().value)))
      || (peek().type === 'ident' && peek().value === 'typeof')
    ) {
      const op = String(consume().value)
      return { kind: 'unary', op, argument: parseUnary(exprDepth + 1) }
    }
    return parsePostfix(exprDepth)
  }

  function parseArgs(exprDepth: number): Array<{ spread: boolean, node: ExprNode }> {
    const args: Array<{ spread: boolean, node: ExprNode }> = []
    while (!(peek().type === 'punct' && peek().value === ')')) {
      const spread = match('op', '...')
      args.push({ spread, node: parseAssignment(exprDepth + 1) })
      if (!match('punct', ','))
        break
    }
    expect('punct', ')')
    return args
  }

  function parsePostfix(exprDepth: number): ExprNode {
    let node = parsePrimary(exprDepth)
    while (true) {
      if (match('punct', '.')) {
        const prop = expect('ident')
        node = { kind: 'member', object: node, property: String(prop.value), computed: false, optional: false }
        continue
      }
      if (match('op', '?.')) {
        if (match('punct', '[')) {
          const propExpr = parseAssignment(exprDepth + 1)
          expect('punct', ']')
          node = { kind: 'member', object: node, property: propExpr, computed: true, optional: true }
        }
        else if (match('punct', '(')) {
          const args = parseArgs(exprDepth + 1)
          node = { kind: 'call', callee: node, args, optional: true }
        }
        else {
          const prop = expect('ident')
          node = { kind: 'member', object: node, property: String(prop.value), computed: false, optional: true }
        }
        continue
      }
      if (match('punct', '[')) {
        const propExpr = parseAssignment(exprDepth + 1)
        expect('punct', ']')
        node = { kind: 'member', object: node, property: propExpr, computed: true, optional: false }
        continue
      }
      if (match('punct', '(')) {
        const args = parseArgs(exprDepth + 1)
        node = { kind: 'call', callee: node, args, optional: false }
        continue
      }
      break
    }
    return node
  }

  function parsePrimary(exprDepth: number): ExprNode {
    const token = peek()
    if (token.type === 'number' || token.type === 'string') {
      consume()
      return { kind: 'literal', value: token.value }
    }
    if (token.type === 'template') {
      consume()
      return {
        kind: 'template',
        parts: (token.parts || []).map(part =>
          part.kind === 'text'
            ? part
            : { kind: 'expr', node: parseExpression(part.source, exprDepth + 1) },
        ),
      }
    }
    if (token.type === 'ident') {
      consume()
      const name = String(token.value)
      if (name === 'this')
        return { kind: 'this' }
      if (name === 'true')
        return { kind: 'literal', value: true }
      if (name === 'false')
        return { kind: 'literal', value: false }
      if (name === 'null')
        return { kind: 'literal', value: null }
      if (name === 'undefined')
        return { kind: 'literal', value: undefined }
      return { kind: 'ident', name }
    }
    if (match('punct', '(')) {
      const inner = parseAssignment(exprDepth + 1)
      expect('punct', ')')
      return inner
    }
    if (match('punct', '[')) {
      const elements: Array<{ spread: boolean, node: ExprNode }> = []
      while (!(peek().type === 'punct' && peek().value === ']')) {
        const spread = match('op', '...')
        elements.push({ spread, node: parseAssignment(exprDepth + 1) })
        if (!match('punct', ','))
          break
      }
      expect('punct', ']')
      return { kind: 'array', elements }
    }
    if (match('punct', '{')) {
      const properties: Array<{ kind: 'spread', node: ExprNode } | { kind: 'prop', key: ExprNode | string, computed: boolean, value: ExprNode }> = []
      while (!(peek().type === 'punct' && peek().value === '}')) {
        if (match('op', '...')) {
          properties.push({ kind: 'spread', node: parseAssignment(exprDepth + 1) })
        }
        else if (match('punct', '[')) {
          const key = parseAssignment(exprDepth + 1)
          expect('punct', ']')
          expect('punct', ':')
          const value = parseAssignment(exprDepth + 1)
          properties.push({ kind: 'prop', key, computed: true, value })
        }
        else if (peek().type === 'ident') {
          const keyToken = consume()
          const key = String(keyToken.value)
          if (match('punct', ':')) {
            const value = parseAssignment(exprDepth + 1)
            properties.push({ kind: 'prop', key, computed: false, value })
          }
          else {
            properties.push({ kind: 'prop', key, computed: false, value: { kind: 'ident', name: key } })
          }
        }
        else if (peek().type === 'string' || peek().type === 'number') {
          const key = String(consume().value)
          expect('punct', ':')
          const value = parseAssignment(exprDepth + 1)
          properties.push({ kind: 'prop', key, computed: false, value })
        }
        else {
          throw new SyntaxError(`Expected object property near position ${peek().pos}`)
        }
        if (!match('punct', ','))
          break
      }
      expect('punct', '}')
      return { kind: 'object', properties }
    }
    throw new SyntaxError(`Unexpected token "${token.value || token.type}" at position ${token.pos}`)
  }

  const ast = parseAssignment(depth)
  if (peek().type !== 'eof') {
    throw new SyntaxError(`Unexpected token "${peek().value}" at position ${peek().pos}`)
  }
  return ast
}

interface EvalContext {
  rootData: unknown
  steps: { count: number }
  closures: WeakSet<(...args: any[]) => unknown>
}

function readSafeProperty(target: unknown, key: unknown): unknown {
  if (target === null || target === undefined) {
    throw new TypeError(`Cannot read property "${String(key)}" of ${String(target)}`)
  }
  const prop = String(key)
  if (FORBIDDEN_KEYS.has(prop)) {
    throw new Error(`Access to property "${prop}" is not allowed`)
  }
  if (Array.isArray(target)) {
    if (prop === 'length' || Object.prototype.hasOwnProperty.call(target, prop)) {
      return (target as any)[prop]
    }
    if (SAFE_ARRAY_METHODS.has(prop)) {
      return (target as any)[prop]
    }
    return undefined
  }
  if (typeof target === 'string') {
    if (prop === 'length' || /^\d+$/.test(prop)) {
      return target[prop as any]
    }
    if (SAFE_STRING_METHODS.has(prop)) {
      return (String.prototype as any)[prop]
    }
    return undefined
  }
  if (typeof target === 'number') {
    if (SAFE_NUMBER_METHODS.has(prop)) {
      return (Number.prototype as any)[prop]
    }
    return undefined
  }
  if (typeof target === 'boolean') {
    if (SAFE_BOOLEAN_METHODS.has(prop)) {
      return (Boolean.prototype as any)[prop]
    }
    return undefined
  }
  if (typeof target === 'object' || typeof target === 'function') {
    if (Object.prototype.hasOwnProperty.call(target, prop)) {
      return (target as Record<string, unknown>)[prop]
    }
    return undefined
  }
  return undefined
}

function invokeSafeMethod(
  target: unknown,
  prop: string,
  args: unknown[],
  ctx: EvalContext,
): unknown {
  if (FORBIDDEN_KEYS.has(prop)) {
    throw new Error(`Access to method "${prop}" is not allowed`)
  }
  if (Array.isArray(target) && SAFE_ARRAY_METHODS.has(prop)) {
    // Avoid mutating caller's parsed input when `sort` or `reverse` is used in a query
    const receiver = prop === 'sort' || prop === 'reverse' ? [...target] : target
    return ((receiver as any)[prop] as (...callArgs: unknown[]) => unknown).apply(receiver, args)
  }
  if (typeof target === 'string' && SAFE_STRING_METHODS.has(prop)) {
    return ((String.prototype as any)[prop] as (...callArgs: unknown[]) => unknown).apply(target, args)
  }
  if (typeof target === 'number' && SAFE_NUMBER_METHODS.has(prop)) {
    return ((Number.prototype as any)[prop] as (...callArgs: unknown[]) => unknown).apply(target, args)
  }
  if (typeof target === 'boolean' && SAFE_BOOLEAN_METHODS.has(prop)) {
    return ((Boolean.prototype as any)[prop] as (...callArgs: unknown[]) => unknown).apply(target, args)
  }
  const fn = readSafeProperty(target, prop)
  if (typeof fn === 'function' && (SAFE_CALLABLES.has(fn as any) || ctx.closures.has(fn as any))) {
    return fn.apply(target, args)
  }
  throw new TypeError(`Method "${prop}" is not allowed or not a function`)
}

function evalNode(
  node: ExprNode,
  scope: Map<string, unknown>,
  ctx: EvalContext,
): unknown {
  ctx.steps.count += 1
  if (ctx.steps.count > MAX_EVAL_STEPS) {
    throw new Error('Expression evaluation step limit exceeded')
  }

  switch (node.kind) {
    case 'literal':
      return node.value
    case 'this':
      return ctx.rootData
    case 'ident': {
      if (FORBIDDEN_KEYS.has(node.name)) {
        throw new Error(`Access to identifier "${node.name}" is not allowed`)
      }
      if (scope.has(node.name)) {
        return scope.get(node.name)
      }
      if (
        ctx.rootData !== null
        && typeof ctx.rootData === 'object'
        && Object.prototype.hasOwnProperty.call(ctx.rootData, node.name)
      ) {
        return (ctx.rootData as Record<string, unknown>)[node.name]
      }
      if (Object.prototype.hasOwnProperty.call(SAFE_GLOBALS, node.name)) {
        return SAFE_GLOBALS[node.name]
      }
      throw new ReferenceError(`${node.name} is not defined`)
    }
    case 'template':
      return node.parts
        .map(part => (part.kind === 'text' ? part.value : String(evalNode(part.node, scope, ctx))))
        .join('')
    case 'array': {
      const out: unknown[] = []
      for (const element of node.elements) {
        const value = evalNode(element.node, scope, ctx)
        if (element.spread) {
          if (!Array.isArray(value))
            throw new TypeError('Spread element must be an array')
          out.push(...value)
        }
        else {
          out.push(value)
        }
      }
      return out
    }
    case 'object': {
      const out: Record<string, unknown> = {}
      for (const prop of node.properties) {
        if (prop.kind === 'spread') {
          const spreadVal = evalNode(prop.node, scope, ctx)
          if (spreadVal && typeof spreadVal === 'object') {
            for (const [k, v] of Object.entries(spreadVal)) {
              if (!FORBIDDEN_KEYS.has(k))
                out[k] = v
            }
          }
        }
        else {
          const key = prop.computed ? String(evalNode(prop.key as ExprNode, scope, ctx)) : String(prop.key)
          if (FORBIDDEN_KEYS.has(key))
            throw new Error(`Disallowed property "${key}"`)
          out[key] = evalNode(prop.value, scope, ctx)
        }
      }
      return out
    }
    case 'unary': {
      if (node.op === 'typeof') {
        try {
          return typeof evalNode(node.argument, scope, ctx)
        }
        catch (err) {
          if (err instanceof ReferenceError && node.argument.kind === 'ident')
            return 'undefined'
          throw err
        }
      }
      const value = evalNode(node.argument, scope, ctx)
      if (node.op === '!')
        return !value
      if (node.op === '-')
        return -(value as number)
      if (node.op === '+')
        return +(value as number)
      throw new Error(`Unsupported unary operator "${node.op}"`)
    }
    case 'logical': {
      const left = evalNode(node.left, scope, ctx)
      if (node.op === '&&')
        return left ? evalNode(node.right, scope, ctx) : left
      if (node.op === '||')
        return left || evalNode(node.right, scope, ctx)
      return left ?? evalNode(node.right, scope, ctx)
    }
    case 'binary': {
      const left = evalNode(node.left, scope, ctx) as any
      const right = evalNode(node.right, scope, ctx) as any
      switch (node.op) {
        case '+': return left + right
        case '-': return left - right
        case '*': return left * right
        case '/': return left / right
        case '%': return left % right
        case '===': return left === right
        case '!==': return left !== right
        // eslint-disable-next-line eqeqeq
        case '==': return left == right
        // eslint-disable-next-line eqeqeq
        case '!=': return left != right
        case '<': return left < right
        case '<=': return left <= right
        case '>': return left > right
        case '>=': return left >= right
        case 'in': {
          if (right === null || (typeof right !== 'object'))
            throw new TypeError('Right-hand side of "in" must be an object')
          const prop = String(left)
          if (FORBIDDEN_KEYS.has(prop))
            return false
          return Object.prototype.hasOwnProperty.call(right, prop)
        }
        default:
          throw new Error(`Unsupported binary operator "${node.op}"`)
      }
    }
    case 'conditional':
      return evalNode(node.test, scope, ctx)
        ? evalNode(node.consequent, scope, ctx)
        : evalNode(node.alternate, scope, ctx)
    case 'member': {
      const target = evalNode(node.object, scope, ctx)
      if (target === null || target === undefined) {
        if (node.optional)
          return undefined
        throw new TypeError(`Cannot read property of ${String(target)}`)
      }
      const propKey = node.computed ? evalNode(node.property as ExprNode, scope, ctx) : node.property
      return readSafeProperty(target, propKey)
    }
    case 'call': {
      const resolvedArgs: unknown[] = []
      for (const arg of node.args) {
        const value = evalNode(arg.node, scope, ctx)
        if (arg.spread) {
          if (!Array.isArray(value))
            throw new TypeError('Spread argument must be an array')
          resolvedArgs.push(...value)
        }
        else {
          resolvedArgs.push(value)
        }
      }

      if (node.callee.kind === 'member') {
        const target = evalNode(node.callee.object, scope, ctx)
        if (target === null || target === undefined) {
          if (node.callee.optional || node.optional)
            return undefined
          throw new TypeError(`Cannot call method on ${String(target)}`)
        }
        const propKey = node.callee.computed
          ? String(evalNode(node.callee.property as ExprNode, scope, ctx))
          : String(node.callee.property)
        return invokeSafeMethod(target, propKey, resolvedArgs, ctx)
      }

      const fn = evalNode(node.callee, scope, ctx)
      if (fn === null || fn === undefined) {
        if (node.optional)
          return undefined
        throw new TypeError('Callee is not a function')
      }
      if (typeof fn !== 'function' || (!SAFE_CALLABLES.has(fn as any) && !ctx.closures.has(fn as any))) {
        throw new TypeError('Function invocation is not allowed')
      }
      return fn(...resolvedArgs)
    }
    case 'arrow': {
      const closure = (...callArgs: unknown[]): unknown => {
        const childScope = new Map(scope)
        node.params.forEach((param, index) => {
          childScope.set(param, callArgs[index])
        })
        return evalNode(node.body, childScope, ctx)
      }
      ctx.closures.add(closure)
      return closure
    }
  }
}

/**
 * Safely evaluates a read-only query expression against parsed JSON data:
 * `this` is the parsed input and top-level object keys are in scope as bare identifiers.
 */
export function evaluateQuery(expression: string, data: unknown): unknown {
  const trimmed = expression.trim()
  if (!trimmed) {
    return data
  }
  const ast = parseExpression(trimmed)
  const ctx: EvalContext = {
    rootData: data,
    steps: { count: 0 },
    closures: new WeakSet(),
  }
  return evalNode(ast, new Map(), ctx)
}
