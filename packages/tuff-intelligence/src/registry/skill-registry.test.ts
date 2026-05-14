import { describe, expect, it } from 'vitest'
import { SkillRegistry } from './skill-registry'

describe('skillRegistry', () => {
  it('keeps legacy load support and prefers loadInstructions', async () => {
    const registry = new SkillRegistry()
    registry.register({
      id: 'release.notes',
      name: 'Release Notes',
      description: 'Write release notes.',
      triggers: ['changelog'],
      tools: ['git.log'],
      permissions: ['repo.read'],
      load: async () => 'legacy',
      loadInstructions: async () => 'modern',
    })

    expect(await registry.loadInstructions('release.notes')).toBe('modern')
    expect(registry.listManifests()).toEqual([
      {
        id: 'release.notes',
        name: 'Release Notes',
        description: 'Write release notes.',
        triggers: ['changelog'],
        tools: ['git.log'],
        permissions: ['repo.read'],
        metadata: undefined,
      },
    ])
  })

  it('resolves skills by deterministic trigger matching', () => {
    const registry = new SkillRegistry()
    registry.register({
      id: 'release.notes',
      description: 'Write release notes.',
      triggers: ['changelog'],
      load: async () => 'release instructions',
    })
    registry.register({
      id: 'code.review',
      description: 'Review code.',
      triggers: ['review'],
      load: async () => 'review instructions',
    })

    expect(registry.resolve('please write a changelog')).toEqual([
      expect.objectContaining({
        skill: expect.objectContaining({
          id: 'release.notes',
        }),
        matchedBy: ['trigger'],
      }),
    ])
  })
})
