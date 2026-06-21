import { describe, expect, it } from 'vitest'
import {
  getTuffIntelligenceBuiltinAbility,
  listTuffIntelligenceBuiltinAbilities,
  pickTuffIntelligenceBuiltinAbilities,
} from './builtin-abilities'

describe('tuff intelligence builtin abilities', () => {
  it('normalizes runtime aliases to registry ability ids', () => {
    expect(getTuffIntelligenceBuiltinAbility('text.chat')).toMatchObject({
      id: 'chat.completion',
      runtimeId: 'text.chat',
      registryId: 'chat.completion',
      schemaRef: 'nexus://schemas/provider/chat-completion.v1',
      meteringUnit: 'token',
    })
  })

  it('returns defensive copies for builtin ability lists', () => {
    const [first] = listTuffIntelligenceBuiltinAbilities()
    expect(first).toBeTruthy()
    first!.meteringUnit = 'mutated'

    expect(getTuffIntelligenceBuiltinAbility(first!.id)?.meteringUnit).not.toBe('mutated')
  })

  it('picks known abilities in requested order and skips unknown ids', () => {
    expect(pickTuffIntelligenceBuiltinAbilities([
      'vision.ocr',
      'unknown.ability',
      'content.extract',
    ]).map(ability => ability.id)).toEqual([
      'vision.ocr',
      'content.extract',
    ])
  })
})
