import type { StreamParser, StringStream } from '@codemirror/language'

type SectionState = Record<string, never>

function eatQuotedString(stream: StringStream, quote: string): void {
  let escaped = false
  while (!stream.eol()) {
    const next = stream.next()
    if (escaped) {
      escaped = false
      continue
    }
    if (next === '\\') {
      escaped = true
      continue
    }
    if (next === quote)
      break
  }
}

function eatBareValue(stream: StringStream): void {
  stream.eatWhile((char) => char !== '#' && char !== ';')
}

function tokenConfigLike(stream: StringStream): string | null {
  if (stream.eatSpace())
    return null

  if (stream.match(/[#;].*/))
    return 'comment'

  if (stream.match(/\[[^\]]*\]/))
    return 'keyword'

  if (stream.match(/[A-Za-z0-9_.-]+(?=\s*[=:])/))
    return 'propertyName'

  if (stream.match(/[=:]/))
    return 'operator'

  const next = stream.peek()
  if (next === '"' || next === "'") {
    stream.next()
    eatQuotedString(stream, next)
    return 'string'
  }

  if (stream.match(/[-+]?(?:\d+\.\d+|\d+)(?:[eE][-+]?\d+)?/))
    return 'number'

  if (stream.match(/\b(?:true|false|on|off|yes|no)\b/i))
    return 'bool'

  eatBareValue(stream)
  return 'string'
}

export const tomlParser: StreamParser<SectionState> = {
  name: 'toml',
  startState: () => ({}),
  token: tokenConfigLike,
}

export const iniParser: StreamParser<SectionState> = {
  name: 'ini',
  startState: () => ({}),
  token: tokenConfigLike,
}
