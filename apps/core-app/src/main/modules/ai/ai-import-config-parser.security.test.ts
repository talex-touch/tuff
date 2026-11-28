import { describe, expect, it } from 'vitest'
import { parseConfig } from './ai-import-config-parser'

describe('ai-import-config-parser prototype pollution protection', () => {
  it('blocks __proto__, constructor, and prototype keys in TOML configs', () => {
    const maliciousToml = `
__proto__.pollutedToml = "pwned"
constructor.prototype.pollutedCtor = "pwned"

[__proto__]
pollutedSection = "pwned"

[constructor.prototype]
pollutedSectionCtor = "pwned"

[safe]
model = "gpt-5"
`
    const parsed = parseConfig(maliciousToml, '.toml')

    expect(parsed).toBeNull()
    expect(({} as Record<string, unknown>).pollutedToml).toBeUndefined()
    expect(({} as Record<string, unknown>).pollutedCtor).toBeUndefined()
    expect(({} as Record<string, unknown>).pollutedSection).toBeUndefined()
    expect(({} as Record<string, unknown>).pollutedSectionCtor).toBeUndefined()

    const benignToml = '[safe]\nmodel = "gpt-5"\n'
    expect(parseConfig(benignToml, '.toml')?.safe).toEqual({ model: 'gpt-5' })
  })

  it('blocks __proto__ and constructor keys in inline TOML tables, YAML, and JSON', () => {
    const inlineToml = 'mcp = { __proto__ = { inlinePolluted = true }, ok = "yes" }\n'
    const parsedToml = parseConfig(inlineToml, '.toml')
    expect(({} as Record<string, unknown>).inlinePolluted).toBeUndefined()
    expect(parsedToml?.mcp).toBeNull()

    const maliciousYaml = [
      '__proto__:',
      '  yamlPolluted: yes',
      'constructor:',
      '  prototype:',
      '    yamlCtorPolluted: yes',
      'model: claude-4'
    ].join('\n')
    const parsedYaml = parseConfig(maliciousYaml, '.yml')
    expect(({} as Record<string, unknown>).yamlPolluted).toBeUndefined()
    expect(({} as Record<string, unknown>).yamlCtorPolluted).toBeUndefined()
    expect(parsedYaml?.model).toBe('claude-4')

    const maliciousJson = '{"__proto__":{"jsonPolluted":true},"provider":"openai"}'
    const parsedJson = parseConfig(maliciousJson, '.json')
    expect(({} as Record<string, unknown>).jsonPolluted).toBeUndefined()
    expect(parsedJson?.provider).toBe('openai')
  })
})
