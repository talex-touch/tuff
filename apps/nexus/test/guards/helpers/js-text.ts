/**
 * Length- and newline-preserving blanking of comments and string bodies.
 *
 * Guards that reason about code structure (brace depth, identifier bindings)
 * must not be fooled by a keyword inside a comment or a string, and must still
 * be able to turn an offset back into the original line number — hence blanking
 * in place rather than deleting.
 */
export function stripCommentsAndStrings(code: string): string {
  const out = code.split('')
  const length = code.length
  let index = 0

  const blank = (from: number, to: number): void => {
    for (let cursor = from; cursor < to && cursor < length; cursor += 1) {
      if (out[cursor] !== '\n')
        out[cursor] = ' '
    }
  }

  while (index < length) {
    const char = code[index]
    const next = code[index + 1]

    if (char === '/' && next === '/') {
      let end = index + 2
      while (end < length && code[end] !== '\n')
        end += 1
      blank(index, end)
      index = end
      continue
    }

    if (char === '/' && next === '*') {
      let end = index + 2
      while (end < length && !(code[end] === '*' && code[end + 1] === '/'))
        end += 1
      blank(index, Math.min(end + 2, length))
      index = end + 2
      continue
    }

    if (char === '\'' || char === '"' || char === '`') {
      const quote = char
      let end = index + 1
      while (end < length) {
        if (code[end] === '\\') {
          end += 2
          continue
        }
        if (code[end] === quote)
          break
        end += 1
      }
      // Keep the quotes so a blanked literal still parses as an expression.
      blank(index + 1, end)
      index = end + 1
      continue
    }

    index += 1
  }

  return out.join('')
}

const IDENTIFIER = /\b[A-Z][A-Za-z0-9]*\b/g

/**
 * PascalCase identifiers that appear in real code (comments and string bodies
 * blanked first). Used to decide whether a template tag has a local binding.
 */
export function collectPascalCaseIdentifiers(code: string): Set<string> {
  const stripped = stripCommentsAndStrings(code)
  const names = new Set<string>()
  for (const match of stripped.matchAll(IDENTIFIER))
    names.add(match[0])
  return names
}

/**
 * Offsets of every occurrence of `pattern` that sits at nesting depth 0 of
 * already-stripped code. Everything inside a function, object literal or block
 * is at depth >= 1.
 */
export function topLevelOffsets(stripped: string, pattern: RegExp): number[] {
  const depths = new Array<number>(stripped.length).fill(0)
  let depth = 0
  for (let index = 0; index < stripped.length; index += 1) {
    depths[index] = depth
    const char = stripped[index]
    if (char === '{' || char === '(' || char === '[')
      depth += 1
    else if (char === '}' || char === ')' || char === ']')
      depth = Math.max(0, depth - 1)
  }

  const offsets: number[] = []
  const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`)
  for (const match of stripped.matchAll(global)) {
    const offset = match.index ?? 0
    if (depths[offset] === 0)
      offsets.push(offset)
  }
  return offsets
}

/** Index of the `(` matching the `)` at `closeIndex`, or -1. */
function matchingOpenParen(stripped: string, closeIndex: number): number {
  let depth = 0
  for (let index = closeIndex; index >= 0; index -= 1) {
    if (stripped[index] === ')')
      depth += 1
    else if (stripped[index] === '(') {
      depth -= 1
      if (depth === 0)
        return index
    }
  }
  return -1
}

/**
 * Whether a statement at `offset` executes unconditionally.
 *
 * Depth alone is not enough: this codebase writes braceless bodies
 * (`if (!data.value)\n  throw ...`), which stay at depth 0 while being perfectly
 * conditional. This walks back over the preceding token instead.
 */
export function isUnconditional(stripped: string, offset: number): boolean {
  let index = offset - 1
  while (index >= 0 && /\s/.test(stripped[index]!))
    index -= 1
  if (index < 0)
    return true

  const char = stripped[index]

  // `else throw`, `case x: throw`, `cond ? a : throw`, `cond && throw`, `=> throw`.
  if (char === ':' || char === '?' || char === '&' || char === '|' || char === '>')
    return false

  if (char === ')') {
    const open = matchingOpenParen(stripped, index)
    if (open < 0)
      return false
    const before = stripped.slice(0, open).trimEnd()
    // An arrow function's parameter list also ends in `)`, but `=>` sits after
    // the `)`, so reaching here means a control-flow header.
    return !/\b(?:if|while|for|switch|catch)$/.test(before)
  }

  const wordEnd = index + 1
  let wordStart = wordEnd
  while (wordStart > 0 && /[\w$]/.test(stripped[wordStart - 1]!))
    wordStart -= 1
  const word = stripped.slice(wordStart, wordEnd)
  if (word === 'else' || word === 'do' || word === 'try')
    return false

  return true
}

/**
 * Offsets of every unconditional top-level occurrence of `keyword`, i.e.
 * "runs while the module evaluates, for every input".
 */
export function findTopLevelOccurrences(code: string, keyword: RegExp): number[] {
  const stripped = stripCommentsAndStrings(code)
  return topLevelOffsets(stripped, keyword).filter(offset => isUnconditional(stripped, offset))
}
