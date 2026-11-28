const {
  plugin,
  filesystem: initialFilesystem,
  logger,
  TuffItemBuilder,
  permission: initialPermission,
} = globalThis

function resolvePermission() {
  return Object.prototype.hasOwnProperty.call(globalThis, 'permission')
    ? globalThis.permission
    : initialPermission
}

function resolveFilesystem() {
  return Object.prototype.hasOwnProperty.call(globalThis, 'filesystem')
    ? globalThis.filesystem
    : initialFilesystem
}

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
let triggerGeneration = 0

function hasControlCharacter(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 0x1F || code === 0x7F)
      return true
  }
  return false
}

const WINDOWS_FORBIDDEN_CHARS_RE = /[<>:"/\\|?*]/
const WINDOWS_RESERVED_NAME_RE = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i
const MAX_REGEX_QUANTIFIER_BOUND = 64

function isValidTargetName(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_TARGET_NAME_LENGTH)
    return false
  if (value === '.' || value === '..')
    return false
  if (WINDOWS_FORBIDDEN_CHARS_RE.test(value) || hasControlCharacter(value))
    return false
  if (/[. ]$/.test(value))
    return false
  if (WINDOWS_RESERVED_NAME_RE.test(value))
    return false
  return true
}

function readSimpleQuantifier(pattern, index) {
  const ch = pattern[index]
  if (ch === '*' || ch === '+') {
    const lazy = pattern[index + 1] === '?'
    return { endIndex: index + (lazy ? 2 : 1), unbounded: true, infinite: true, min: ch === '+' ? 1 : 0, max: Infinity }
  }
  if (ch === '?') {
    const lazy = pattern[index + 1] === '?'
    return { endIndex: index + (lazy ? 2 : 1), unbounded: false, infinite: false, min: 0, max: 1 }
  }
  if (ch === '{') {
    const match = /^\{(\d+)(?:,(\d*))?\}\??/.exec(pattern.slice(index))
    if (match) {
      const min = Number.parseInt(match[1], 10)
      const hasComma = match[0].includes(',')
      const max = !hasComma ? min : (match[2] === '' ? Infinity : Number.parseInt(match[2], 10))
      return { endIndex: index + match[0].length, unbounded: max === Infinity || (max > min && max >= 4), infinite: max === Infinity, min, max }
    }
  }
  return null
}

const MAX_REGEX_BRANCHING = 64

function addAsciiRangeToSet(set, startCode, endCode) {
  const lo = Math.max(0, Math.min(startCode, endCode))
  const hi = Math.min(127, Math.max(startCode, endCode))
  for (let code = lo; code <= hi; code += 1)
    set.add(code)
}

function addEscapeClassToSet(set, escapeChar) {
  if (escapeChar === 'd') {
    addAsciiRangeToSet(set, 48, 57)
    return true
  }
  if (escapeChar === 'D') {
    for (let c = 0; c <= 127; c += 1) {
      if (c < 48 || c > 57)
        set.add(c)
    }
    return true
  }
  if (escapeChar === 'w') {
    addAsciiRangeToSet(set, 48, 57)
    addAsciiRangeToSet(set, 65, 90)
    addAsciiRangeToSet(set, 97, 122)
    set.add(95)
    return true
  }
  if (escapeChar === 'W') {
    for (let c = 0; c <= 127; c += 1) {
      const isWord = (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95
      if (!isWord)
        set.add(c)
    }
    return true
  }
  if (escapeChar === 's') {
    for (const c of [9, 10, 11, 12, 13, 32])
      set.add(c)
    return true
  }
  if (escapeChar === 'S') {
    const spaces = new Set([9, 10, 11, 12, 13, 32])
    for (let c = 0; c <= 127; c += 1) {
      if (!spaces.has(c))
        set.add(c)
    }
    return true
  }
  return false
}

function parseRegexCharClassSet(token) {
  if (!token || token[0] !== '[' || token[token.length - 1] !== ']')
    return null
  const inner = token.slice(1, -1)
  const negated = inner.startsWith('^')
  const body = negated ? inner.slice(1) : inner
  const set = new Set()

  const readAtom = (pos) => {
    if (body[pos] === '\\' && pos + 1 < body.length) {
      const next = body[pos + 1]
      if ('dDwWsS'.includes(next))
        return { kind: 'class', escape: next, nextPos: pos + 2 }
      const escapeCodes = { n: 10, r: 13, t: 9, f: 12, v: 11, 0: 0 }
      const code = Object.prototype.hasOwnProperty.call(escapeCodes, next) ? escapeCodes[next] : next.charCodeAt(0)
      return { kind: 'char', code, nextPos: pos + 2 }
    }
    return { kind: 'char', code: body.charCodeAt(pos), nextPos: pos + 1 }
  }

  let idx = 0
  while (idx < body.length) {
    const item = readAtom(idx)
    if (item.kind === 'class') {
      addEscapeClassToSet(set, item.escape)
      idx = item.nextPos
      continue
    }
    if (item.nextPos + 1 < body.length && body[item.nextPos] === '-') {
      const endItem = readAtom(item.nextPos + 1)
      if (endItem.kind === 'char') {
        addAsciiRangeToSet(set, item.code, endItem.code)
        idx = endItem.nextPos
        continue
      }
    }
    if (item.code <= 127)
      set.add(item.code)
    idx = item.nextPos
  }

  if (negated) {
    const inverted = new Set()
    for (let c = 0; c <= 127; c += 1) {
      if (!set.has(c))
        inverted.add(c)
    }
    return { wildcard: false, chars: inverted }
  }
  return { wildcard: false, chars: set }
}

function regexCharSetForAtom(atom) {
  if (!atom)
    return null
  if (atom === '.')
    return { wildcard: true, chars: null }
  if (atom.startsWith('[') && atom.endsWith(']'))
    return parseRegexCharClassSet(atom)
  if (atom.startsWith('\\') && atom.length >= 2) {
    const ch = atom[1]
    if ('dDwWsS'.includes(ch)) {
      const set = new Set()
      addEscapeClassToSet(set, ch)
      return { wildcard: false, chars: set }
    }
    if ('bBAZz'.includes(ch))
      return null
    if (/^\\[1-9]\d*$|^\\k<[^>]+>$/.test(atom) || ch === 'p' || ch === 'P')
      return { wildcard: true, chars: null }
    const code = ch.charCodeAt(0)
    return { wildcard: false, chars: new Set(code <= 127 ? [code] : []) }
  }
  if (atom.length === 1) {
    const code = atom.charCodeAt(0)
    return { wildcard: false, chars: new Set(code <= 127 ? [code] : []) }
  }
  return null
}

function regexCharSetsOverlap(a, b) {
  if (!a || !b)
    return false
  if (a.wildcard || b.wildcard)
    return true
  if (!a.chars || !b.chars || a.chars.size === 0 || b.chars.size === 0)
    return false
  for (const code of a.chars) {
    if (b.chars.has(code))
      return true
  }
  return false
}

function mergeRegexCharSets(a, b) {
  if (!a)
    return b
  if (!b)
    return a
  if (a.wildcard || b.wildcard)
    return { wildcard: true, chars: null }
  const merged = new Set(a.chars)
  for (const code of b.chars)
    merged.add(code)
  return { wildcard: false, chars: merged }
}

function readLeadingRegexAtom(branch) {
  let pos = 0
  while (pos < branch.length) {
    const ch = branch[pos]
    if (ch === '^' || ch === '$') {
      pos += 1
      continue
    }
    if (ch === '(') {
      pos += 1
      if (branch[pos] === '?') {
        const rest = branch.slice(pos)
        if (rest.startsWith('?:')) {
          pos += 2
        }
        else if (rest.startsWith('?<') && !rest.startsWith('?<=') && !rest.startsWith('?<!')) {
          const close = branch.indexOf('>', pos + 2)
          if (close > pos)
            pos = close + 1
        }
        else {
          return null
        }
      }
      continue
    }
    if (ch === '[') {
      let escaped = false
      for (let i = pos + 1; i < branch.length; i += 1) {
        if (escaped) {
          escaped = false
          continue
        }
        if (branch[i] === '\\') {
          escaped = true
          continue
        }
        if (branch[i] === ']')
          return branch.slice(pos, i + 1)
      }
      return null
    }
    if (ch === '\\') {
      const next = branch[pos + 1]
      if (!next)
        return '\\'
      const token = `\\${next}`
      if (token === '\\b' || token === '\\B') {
        pos += 2
        continue
      }
      return token
    }
    return ch
  }
  return null
}

function regexBranchesOverlap(branches) {
  if (branches.length < 2)
    return false
  const normalized = branches.map(b => b.trim())
  if (normalized.some(b => b.length === 0))
    return true
  const unique = new Set(normalized)
  if (unique.size < normalized.length)
    return true
  for (let aIdx = 0; aIdx < normalized.length; aIdx += 1) {
    for (let bIdx = aIdx + 1; bIdx < normalized.length; bIdx += 1) {
      const a = normalized[aIdx]
      const b = normalized[bIdx]
      if (a.startsWith(b) || b.startsWith(a))
        return true
      const leadA = readLeadingRegexAtom(a)
      const leadB = readLeadingRegexAtom(b)
      if (leadA && leadB && regexCharSetsOverlap(regexCharSetForAtom(leadA), regexCharSetForAtom(leadB)))
        return true
    }
  }
  return false
}

function isSafeReplaceRegex(pattern) {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > 96)
    return false
  if (/(?:\.\*|\.\+){2,}/.test(pattern))
    return false

  let inClass = false
  let classStart = -1
  const stack = []
  const topScope = {
    prevQuant: null,
    adjacentOverlapAltBranching: 1,
  }
  let totalOverlapAltGroups = 0

  const currentScope = () => (stack.length > 0 ? stack[stack.length - 1] : topScope)

  const recordVariableSpan = (entryQuant, exitQuant) => {
    const scope = currentScope()
    const prev = scope.prevQuant
    if (prev && entryQuant && regexCharSetsOverlap(prev.charSet, entryQuant.charSet)) {
      if (prev.unbounded || entryQuant.unbounded)
        return false
      const nextProduct = Math.min(1e9, prev.chainProduct * entryQuant.chainProduct)
      if (nextProduct > MAX_REGEX_BRANCHING)
        return false
      scope.prevQuant = {
        charSet: mergeRegexCharSets(prev.charSet, exitQuant.charSet),
        unbounded: false,
        chainProduct: nextProduct,
      }
      return true
    }
    scope.prevQuant = exitQuant
    return true
  }

  const recordAtomQuantifier = (atomToken, q, isBackref) => {
    const scope = currentScope()
    const isAnchor = atomToken === '^' || atomToken === '$' || atomToken === '\\b' || atomToken === '\\B'
    const atomSet = isAnchor ? null : regexCharSetForAtom(atomToken)
    if (stack.length > 0 && atomSet) {
      const top = stack[stack.length - 1]
      top.allCharSet = mergeRegexCharSets(top.allCharSet, atomSet)
    }

    if (q) {
      if (q.max !== Infinity && q.max > MAX_REGEX_QUANTIFIER_BOUND)
        return false
      if (isBackref && q.max >= 2)
        return false
      const isVariable = q.infinite || q.max > q.min
      const span = q.infinite ? MAX_REGEX_BRANCHING + 1 : Math.max(1, q.max - q.min + 1)
      if (stack.length > 0) {
        const top = stack[stack.length - 1]
        if (q.unbounded)
          top.hasUnbounded = true
        if (q.infinite)
          top.hasInfinite = true
        if (q.max >= 2 && q.max > q.min)
          top.hasVariableRepeat = true
        if (q.max >= 2)
          top.depth = Math.max(top.depth, 1)
      }
      if (isVariable && atomSet) {
        const quantInfo = {
          charSet: atomSet,
          unbounded: q.unbounded,
          chainProduct: span,
        }
        if (stack.length > 0) {
          const top = stack[stack.length - 1]
          if (!top.sawRequiredPrefix && top.branches.length === 1) {
            top.leadingQuant = top.leadingQuant
              ? {
                  charSet: mergeRegexCharSets(top.leadingQuant.charSet, quantInfo.charSet),
                  unbounded: top.leadingQuant.unbounded || quantInfo.unbounded,
                  chainProduct: Math.min(1e9, top.leadingQuant.chainProduct * quantInfo.chainProduct),
                }
              : quantInfo
          }
          if (q.min >= 1)
            top.sawRequiredPrefix = true
        }
        if (!recordVariableSpan(quantInfo, quantInfo))
          return false
        if (q.min >= 1)
          scope.adjacentOverlapAltBranching = 1
      }
      else if (q.min >= 1) {
        if (stack.length > 0)
          stack[stack.length - 1].sawRequiredPrefix = true
        scope.prevQuant = null
        scope.adjacentOverlapAltBranching = 1
      }
    }
    else if (!isAnchor) {
      if (stack.length > 0)
        stack[stack.length - 1].sawRequiredPrefix = true
      scope.prevQuant = null
      scope.adjacentOverlapAltBranching = 1
    }
    return true
  }

  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i]
    if (ch === '\\') {
      const next = pattern[i + 1]
      const atom = next ? `\\${next}` : '\\'
      i += next ? 1 : 0
      if (inClass)
        continue
      const isBackref = /^\\[1-9]$/.test(atom) || (next === 'k' && pattern[i + 1] === '<')
      if (stack.length > 0) {
        const top = stack[stack.length - 1]
        top.branches[top.branches.length - 1] += atom
        if (isBackref)
          top.hasBackref = true
      }
      const q = readSimpleQuantifier(pattern, i + 1)
      if (!recordAtomQuantifier(atom, q, isBackref))
        return false
      if (q)
        i = q.endIndex - 1
      continue
    }
    if (ch === '[' && !inClass) {
      inClass = true
      classStart = i
      continue
    }
    if (ch === ']' && inClass) {
      inClass = false
      const clsToken = pattern.slice(classStart, i + 1)
      if (stack.length > 0) {
        const top = stack[stack.length - 1]
        top.branches[top.branches.length - 1] += clsToken
      }
      const q = readSimpleQuantifier(pattern, i + 1)
      if (!recordAtomQuantifier(clsToken, q, false))
        return false
      if (q)
        i = q.endIndex - 1
      continue
    }
    if (inClass)
      continue

    if (ch === '(') {
      const isLookaround = /^\(\?(?:=|!|<=|<!)/.test(pattern.slice(i))
      let skip = i + 1
      if (pattern[skip] === '?') {
        const rest = pattern.slice(skip)
        if (rest.startsWith('?<=') || rest.startsWith('?<!')) {
          skip += 3
        }
        else if (rest.startsWith('?:') || rest.startsWith('?=') || rest.startsWith('?!')) {
          skip += 2
        }
        else if (rest.startsWith('?<')) {
          const close = pattern.indexOf('>', skip + 2)
          if (close > skip)
            skip = close + 1
        }
      }
      stack.push({
        hasUnbounded: false,
        hasInfinite: false,
        hasVariableRepeat: false,
        hasBackref: false,
        depth: 0,
        branches: [''],
        prevQuant: null,
        leadingQuant: null,
        allCharSet: null,
        sawRequiredPrefix: false,
        adjacentOverlapAltBranching: 1,
        isLookaround,
      })
      i = skip - 1
      continue
    }
    if (ch === '|' && stack.length > 0) {
      const top = stack[stack.length - 1]
      top.branches.push('')
      top.prevQuant = null
      top.leadingQuant = null
      top.sawRequiredPrefix = false
      top.adjacentOverlapAltBranching = 1
      continue
    }
    if (ch === ')' && stack.length > 0) {
      const group = stack.pop()
      const q = readSimpleQuantifier(pattern, i + 1)
      const outerScope = currentScope()
      const hasOverlappingAlt = group.branches.length > 1 && regexBranchesOverlap(group.branches)

      if (hasOverlappingAlt && !group.isLookaround) {
        const repeatCount = q ? Math.min(q.infinite ? 16 : Math.max(1, q.max), 16) : 1
        totalOverlapAltGroups += repeatCount
        if (totalOverlapAltGroups >= 7)
          return false
        const altFactor = Math.min(1e9, Math.max(2, group.branches.length) ** repeatCount)
        outerScope.adjacentOverlapAltBranching = Math.min(1e9, outerScope.adjacentOverlapAltBranching * altFactor)
        if (outerScope.adjacentOverlapAltBranching > MAX_REGEX_BRANCHING)
          return false
      }

      if (q) {
        if (q.max !== Infinity && q.max > MAX_REGEX_QUANTIFIER_BOUND)
          return false
        if (q.unbounded && (group.hasUnbounded || group.hasVariableRepeat || group.hasBackref))
          return false
        if (q.max >= 2 && group.hasInfinite)
          return false
        if (q.max >= 2 && group.depth >= 2 && (group.hasVariableRepeat || q.max > q.min))
          return false
        if (hasOverlappingAlt && (q.unbounded || q.max >= 4))
          return false
        if (stack.length > 0) {
          const parent = stack[stack.length - 1]
          if (q.unbounded || group.hasUnbounded)
            parent.hasUnbounded = true
          if (q.infinite || group.hasInfinite)
            parent.hasInfinite = true
          if ((q.max >= 2 && q.max > q.min) || group.hasVariableRepeat)
            parent.hasVariableRepeat = true
          if (group.hasBackref)
            parent.hasBackref = true
          parent.depth = Math.max(parent.depth, group.depth + (q.max >= 2 ? 1 : 0))
          if (group.allCharSet)
            parent.allCharSet = mergeRegexCharSets(parent.allCharSet, group.allCharSet)
        }
        if (!group.isLookaround) {
          const isVariable = q.infinite || q.max > q.min
          const span = q.infinite ? MAX_REGEX_BRANCHING + 1 : Math.max(1, q.max - q.min + 1)
          if (isVariable && group.allCharSet) {
            const quantInfo = {
              charSet: group.allCharSet,
              unbounded: q.unbounded,
              chainProduct: span,
            }
            if (stack.length > 0 && !outerScope.sawRequiredPrefix && outerScope.branches.length === 1) {
              outerScope.leadingQuant = outerScope.leadingQuant
                ? {
                    charSet: mergeRegexCharSets(outerScope.leadingQuant.charSet, quantInfo.charSet),
                    unbounded: outerScope.leadingQuant.unbounded || quantInfo.unbounded,
                    chainProduct: Math.min(1e9, outerScope.leadingQuant.chainProduct * quantInfo.chainProduct),
                  }
                : quantInfo
            }
            if (!recordVariableSpan(quantInfo, quantInfo))
              return false
          }
          else if (q.min >= 1) {
            outerScope.prevQuant = null
          }
          if (stack.length > 0 && q.min >= 1)
            outerScope.sawRequiredPrefix = true
          if (!hasOverlappingAlt && q.min >= 1)
            outerScope.adjacentOverlapAltBranching = 1
        }
        i = q.endIndex - 1
      }
      else {
        if (stack.length > 0) {
          const parent = stack[stack.length - 1]
          if (group.hasUnbounded)
            parent.hasUnbounded = true
          if (group.hasInfinite)
            parent.hasInfinite = true
          if (group.hasVariableRepeat)
            parent.hasVariableRepeat = true
          if (group.hasBackref)
            parent.hasBackref = true
          parent.depth = Math.max(parent.depth, group.depth)
          if (group.allCharSet)
            parent.allCharSet = mergeRegexCharSets(parent.allCharSet, group.allCharSet)
        }
        if (!group.isLookaround) {
          if (group.branches.length === 1 && (group.leadingQuant || group.prevQuant)) {
            if (stack.length > 0 && !outerScope.sawRequiredPrefix && outerScope.branches.length === 1 && group.leadingQuant) {
              outerScope.leadingQuant = outerScope.leadingQuant
                ? {
                    charSet: mergeRegexCharSets(outerScope.leadingQuant.charSet, group.leadingQuant.charSet),
                    unbounded: outerScope.leadingQuant.unbounded || group.leadingQuant.unbounded,
                    chainProduct: Math.min(1e9, outerScope.leadingQuant.chainProduct * group.leadingQuant.chainProduct),
                  }
                : group.leadingQuant
            }
            if (group.leadingQuant) {
              if (!recordVariableSpan(group.leadingQuant, group.prevQuant))
                return false
            }
            else {
              outerScope.prevQuant = group.prevQuant
            }
          }
          else {
            outerScope.prevQuant = null
          }
          if (stack.length > 0 && group.sawRequiredPrefix)
            outerScope.sawRequiredPrefix = true
          if (!hasOverlappingAlt && group.sawRequiredPrefix)
            outerScope.adjacentOverlapAltBranching = 1
        }
      }
      continue
    }

    if (stack.length > 0)
      stack[stack.length - 1].branches[stack[stack.length - 1].branches.length - 1] += ch
    const q = readSimpleQuantifier(pattern, i + 1)
    if (!recordAtomQuantifier(ch, q, false))
      return false
    if (q)
      i = q.endIndex - 1
  }
  return true
}

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
    if (pattern.length > 96 || !/^[gimuy]*$/.test(flags) || !isSafeReplaceRegex(pattern))
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
    const invalid = !isValidTargetName(targetName)
    return {
      source,
      sourceName: parsed.name,
      targetName,
      targetPath: `${parsed.directory}${targetName}`,
      unchanged: !invalid && parsed.name === targetName,
      invalid,
      collision: false,
    }
  })

  const targetPathCounts = new Map()
  items.forEach((entry) => {
    if (entry.invalid)
      return
    const collisionKey = entry.targetPath.toLowerCase()
    targetPathCounts.set(collisionKey, (targetPathCounts.get(collisionKey) ?? 0) + 1)
  })

  const collisions = []
  items.forEach((entry) => {
    if (!entry.invalid && (targetPathCounts.get(entry.targetPath.toLowerCase()) ?? 0) > 1) {
      entry.collision = true
      collisions.push(entry.targetPath)
    }
  })

  return {
    items,
    invalidItems: items.filter(entry => entry.invalid),
    collisions: [...new Set(collisions)],
  }
}

/**
 * Fail-closed either way, but say which way. A missing SDK and a thrown check used to collapse
 * into the same `false` as a real denial, so a user whose permission host was absent was told to
 * grant a permission they may already hold (#821). Shape matches touch-browser-data's
 * ensurePermission.
 */
async function ensurePermission(permissionId) {
  const permissionFacade = resolvePermission()
  if (!permissionFacade || typeof permissionFacade.check !== 'function')
    return { granted: false, reason: 'permission-sdk-unavailable', message: '权限系统不可用' }
  try {
    if ((await permissionFacade.check(permissionId)) === true)
      return { granted: true, reason: '', message: '' }
    return { granted: false, reason: 'permission-denied', message: `缺少 ${permissionId} 权限` }
  }
  catch {
    logger?.warn?.('[touch-batch-rename] Permission check failed')
    return { granted: false, reason: 'permission-check-failed', message: '权限检查失败' }
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

async function publishItems(items, generation) {
  if (generation !== triggerGeneration)
    return false
  await plugin.feature.clearItems()
  if (generation !== triggerGeneration)
    return false
  await plugin.feature.pushItems(items)
  return generation === triggerGeneration
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
      || !isValidTargetName(item.targetName)
    ) {
      return []
    }
    return [{ source: item.source, targetName: item.targetName }]
  })
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query) {
    const generation = ++triggerGeneration
    previewCacheByFeature.delete(featureId)
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
        ], generation)
        return true
      }

      const readAccess = await ensurePermission('fs.read')
      if (generation !== triggerGeneration)
        return true
      if (!readAccess.granted) {
        // "请授予文件读取权限" is the wrong advice when the host is absent or the check threw --
        // there is nothing for the user to grant. Only the denial says that (#821).
        await publishItems([
          buildItem({
            id: `${featureId}-no-permission`,
            featureId,
            title: readAccess.reason === 'permission-denied' ? '缺少读取权限' : readAccess.message,
            subtitle: readAccess.reason === 'permission-denied'
              ? '请授予文件读取权限'
              : `无法确认文件读取权限 · ${readAccess.reason}`,
          }),
        ], generation)
        return true
      }

      const rules = parseRules(getQueryText(query))
      const plan = buildRenamePlan(filePaths, rules, new Date())
      const applySubtitle = plan.invalidItems.length > 0
        ? '目标文件名包含非法字符或路径分隔符，无法应用'
        : plan.collisions.length > 0
          ? '目标文件名存在冲突，请调整重命名规则'
          : '执行受控批量重命名事务'
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
          subtitle: applySubtitle,
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
        const previewSubtitle = item.invalid
          ? '目标文件名无效（不可含路径分隔符或控制字符）'
          : item.collision
            ? `${item.targetName} · 目标文件名冲突`
            : item.unchanged
              ? '名称未变化'
              : item.targetName
        items.push(
          buildItem({
            id: `${featureId}-preview-${index}`,
            featureId,
            title: item.sourceName,
            subtitle: previewSubtitle,
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
      const published = await publishItems(items, generation)
      if (published)
        previewCacheByFeature.set(featureId, plan)
      return true
    }
    catch (error) {
      if (generation !== triggerGeneration)
        return true
      previewCacheByFeature.delete(featureId)
      const code = stableErrorCode(error, 'BATCH_RENAME_PREVIEW_FAILED')
      logger.error(`[touch-batch-rename] ${code}`)
      await publishItems([
        buildItem({
          id: `${featureId}-error`,
          featureId,
          title: '加载失败',
          subtitle: code,
        }),
      ], generation)
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
      if (plan.invalidItems.length > 0)
        return blocked('invalid-target-name', '目标文件名不能包含路径分隔符或控制字符')
      if (plan.collisions.length > 0)
        return blocked('target-collision', '存在重复的目标文件名，已阻止重命名')
      const pending = plan.items.filter(entry => !entry.unchanged)
      if (pending.length === 0)
        return blocked('no-changes', '没有需要重命名的文件')
      const writeAccess = await ensurePermission('fs.write')
      if (!writeAccess.granted)
        return blocked(writeAccess.reason, writeAccess.message)
      const fsFacade = resolveFilesystem()
      if (!fsFacade || typeof fsFacade.renameBatch !== 'function')
        return blocked('capability-unavailable', '文件系统重命名能力不可用')
      previewCacheByFeature.delete(featureId)
      try {
        await fsFacade.renameBatch(pending.map(entry => ({ source: entry.source, targetName: entry.targetName })))
      }
      catch (error) {
        const code = stableErrorCode(error, 'BATCH_RENAME_APPLY_FAILED')
        logger.error(`[touch-batch-rename] ${code}`)
        return blocked(code, '批量重命名失败')
      }
      try {
        await plugin.storage.setFile(LAST_RENAME_FILE, {
          items: [...pending].reverse().map(entry => ({
            source: entry.targetPath,
            targetName: entry.sourceName,
          })),
          createdAt: Date.now(),
        })
        return { externalAction: true, success: true, status: 'completed' }
      }
      catch (error) {
        const code = stableErrorCode(error, 'BATCH_RENAME_UNDO_LOG_FAILED')
        logger?.warn?.(`[touch-batch-rename] ${code}`)
        return {
          externalAction: true,
          success: true,
          status: 'completed',
          undoLogSaved: false,
          warning: code,
          message: '批量重命名已完成，但撤销日志写入失败',
        }
      }
    }

    if (actionId === 'undo') {
      const writeAccess = await ensurePermission('fs.write')
      if (!writeAccess.granted)
        return blocked(writeAccess.reason, writeAccess.message)
      const fsFacade = resolveFilesystem()
      if (!fsFacade || typeof fsFacade.renameBatch !== 'function')
        return blocked('capability-unavailable', '文件系统重命名能力不可用')
      let entries
      try {
        entries = normalizeUndoEntries(await plugin.storage.getFile(LAST_RENAME_FILE))
        if (entries.length === 0)
          return blocked('undo-empty', '没有可撤销的重命名事务')
        await fsFacade.renameBatch(entries)
      }
      catch (error) {
        const code = stableErrorCode(error, 'BATCH_RENAME_UNDO_FAILED')
        logger.error(`[touch-batch-rename] ${code}`)
        return blocked(code, '撤销重命名失败')
      }
      try {
        await plugin.storage.setFile(LAST_RENAME_FILE, { items: [], createdAt: Date.now() })
        return { externalAction: true, success: true, status: 'completed' }
      }
      catch (error) {
        const code = stableErrorCode(error, 'BATCH_RENAME_UNDO_LOG_CLEAR_FAILED')
        logger?.warn?.(`[touch-batch-rename] ${code}`)
        return {
          externalAction: true,
          success: true,
          status: 'completed',
          undoLogCleared: false,
          warning: code,
          message: '撤销重命名已完成，但清理撤销日志失败',
        }
      }
    }
  },

  onDestroy() {
    triggerGeneration += 1
    previewCacheByFeature.clear()
  },
}

module.exports = pluginLifecycle
