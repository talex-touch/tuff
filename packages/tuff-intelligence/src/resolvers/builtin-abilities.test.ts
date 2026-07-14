import { describe, expect, it } from 'vitest'
import {
  getTuffIntelligenceBuiltinAbility,
  listTuffIntelligenceBuiltinAbilities,
  pickTuffIntelligenceBuiltinAbilities,
} from './builtin-abilities'

const EXPECTED_STABLE_CAPABILITY_IDS = [
  'text.chat',
  'text.translate',
  'text.summarize',
  'text.rewrite',
  'text.grammar',
  'embedding.generate',
  'code.generate',
  'code.explain',
  'code.review',
  'code.refactor',
  'code.debug',
  'intent.detect',
  'sentiment.analyze',
  'content.extract',
  'keywords.extract',
  'text.classify',
  'vision.ocr',
  'image.caption',
  'image.analyze',
  'image.translate.e2e',
  'image.generate',
  'image.edit',
  'audio.tts',
  'audio.stt',
  'audio.transcribe',
  'rag.query',
  'search.semantic',
  'search.rerank',
  'workflow.execute',
  'agent.run',
] as const

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

  it('exposes every stable CoreApp capability through list and lookup APIs', () => {
    const listedRuntimeIds = new Set(
      listTuffIntelligenceBuiltinAbilities().map(ability => ability.runtimeId),
    )

    for (const capabilityId of EXPECTED_STABLE_CAPABILITY_IDS) {
      expect(listedRuntimeIds.has(capabilityId), `${capabilityId} is listed`).toBe(true)
      expect(getTuffIntelligenceBuiltinAbility(capabilityId), `${capabilityId} resolves`).toMatchObject({
        runtimeId: capabilityId,
      })
    }
  })

  it('normalizes aliases for exposed stable CoreApp ability ids', () => {
    const aliasCases: Array<[alias: string, abilityId: string]> = [
      ['semantic-search', 'search.semantic'],
      ['semantic.search', 'search.semantic'],
      ['rerank', 'search.rerank'],
      ['stt', 'audio.stt'],
      ['transcribe', 'audio.transcribe'],
      ['workflow', 'workflow.execute'],
      ['workflow-execute', 'workflow.execute'],
      ['workflow.run', 'workflow.execute'],
      ['agent', 'agent.run'],
      ['agent-run', 'agent.run'],
    ]

    for (const [alias, abilityId] of aliasCases) {
      const directAbility = getTuffIntelligenceBuiltinAbility(abilityId)

      if (!directAbility) {
        expect(getTuffIntelligenceBuiltinAbility(alias), alias).toBeNull()
        continue
      }

      expect(getTuffIntelligenceBuiltinAbility(alias), alias).toMatchObject({
        id: directAbility.id,
        runtimeId: directAbility.runtimeId,
        registryId: directAbility.registryId,
      })
    }
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
