import { describe, expect, it } from 'vitest'
import {
  matchesModelQuery,
  modelDisplayName,
  modelSubtitle,
  sameModelRef,
  splitModelId,
  type ModelDisplayFields
} from './model-display'

describe('splitModelId', () => {
  it('splits a pi id into its source prefix and the model name', () => {
    expect(splitModelId('codex/gpt-6-astra')).toEqual({ source: 'codex', name: 'gpt-6-astra' })
    expect(splitModelId('DeepSeekOfficial/deepseek-v4-flash')).toEqual({
      source: 'DeepSeekOfficial',
      name: 'deepseek-v4-flash'
    })
  })

  it('splits at the first slash only, keeping later ones in the name', () => {
    expect(splitModelId('org/team/model')).toEqual({ source: 'org', name: 'team/model' })
  })

  it('leaves an id without a slash whole, including the colon of a local model tag', () => {
    expect(splitModelId('qwen2.5:3b')).toEqual({ source: null, name: 'qwen2.5:3b' })
    expect(splitModelId('gpt-4o-mini')).toEqual({ source: null, name: 'gpt-4o-mini' })
  })

  it('treats a slash with nothing on one side as part of the name', () => {
    expect(splitModelId('/gpt-6-astra')).toEqual({ source: null, name: '/gpt-6-astra' })
    expect(splitModelId('codex/')).toEqual({ source: null, name: 'codex/' })
    expect(splitModelId('')).toEqual({ source: null, name: '' })
  })
})

describe('modelDisplayName', () => {
  it('drops the source prefix and otherwise returns the id unchanged', () => {
    expect(modelDisplayName('codex/gpt-6-astra')).toBe('gpt-6-astra')
    expect(modelDisplayName('qwen2.5:3b')).toBe('qwen2.5:3b')
  })
})

describe('modelSubtitle', () => {
  it('joins provider and source with a middle dot', () => {
    expect(modelSubtitle('Pi (local CLI)', 'codex')).toBe('Pi (local CLI) · codex')
  })

  it('is only the provider name when the model has no source', () => {
    expect(modelSubtitle('Local Model', null)).toBe('Local Model')
    expect(modelSubtitle('Local Model', '')).toBe('Local Model')
  })
})

describe('matchesModelQuery', () => {
  const pi: ModelDisplayFields = {
    providerId: 'pi-cli',
    providerName: 'Pi (local CLI)',
    model: 'codex/gpt-6-astra',
    source: 'codex',
    displayName: 'gpt-6-astra'
  }
  const local: ModelDisplayFields = {
    providerId: 'ollama',
    providerName: 'Local Model',
    model: 'qwen2.5:3b',
    source: null,
    displayName: 'qwen2.5:3b'
  }

  it('matches everything on an empty or whitespace query', () => {
    expect(matchesModelQuery(pi, '')).toBe(true)
    expect(matchesModelQuery(local, '   ')).toBe(true)
  })

  it('matches the model id, display name, provider name and source case-insensitively', () => {
    expect(matchesModelQuery(pi, 'ASTRA')).toBe(true)
    expect(matchesModelQuery(pi, 'codex/gpt')).toBe(true)
    expect(matchesModelQuery(pi, 'local cli')).toBe(true)
    expect(matchesModelQuery(pi, 'Codex')).toBe(true)
    expect(matchesModelQuery(local, '2.5:3B')).toBe(true)
    expect(matchesModelQuery(local, 'local model')).toBe(true)
  })

  it('ignores surrounding whitespace in the query', () => {
    expect(matchesModelQuery(pi, '  astra  ')).toBe(true)
  })

  it('rejects a query that appears in none of the fields', () => {
    expect(matchesModelQuery(pi, 'claude')).toBe(false)
    expect(matchesModelQuery(local, 'codex')).toBe(false)
  })

  it('does not let a missing source match the word null', () => {
    expect(matchesModelQuery(local, 'null')).toBe(false)
  })
})

describe('sameModelRef', () => {
  it('requires both provider and model to match', () => {
    expect(sameModelRef({ providerId: 'a', model: 'x' }, { providerId: 'a', model: 'x' })).toBe(
      true
    )
    expect(sameModelRef({ providerId: 'a', model: 'x' }, { providerId: 'b', model: 'x' })).toBe(
      false
    )
    expect(sameModelRef({ providerId: 'a', model: 'x' }, { providerId: 'a', model: 'y' })).toBe(
      false
    )
  })

  it('ignores fields beyond the two that identify a model', () => {
    const choice = { providerId: 'a', model: 'x', providerName: 'A', displayName: 'x' }
    expect(sameModelRef(choice, { providerId: 'a', model: 'x' })).toBe(true)
  })
})
