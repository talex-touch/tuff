import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createSkillInstallPlan,
  installRecommendedSkills,
  resolveSkillInstallPlan,
} from '../local-capabilities'

const tempRoots: string[] = []

async function makeTempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'tuff-cli-skills-'))
  tempRoots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

describe('local capability setup', () => {
  it('creates core skill install plans by default', () => {
    const plan = createSkillInstallPlan({ targetRoot: '/tmp/tuff-skills' })

    expect(plan.items.map(item => item.id)).toEqual([
      'openai-docs',
      'playwright',
      'screenshot',
      'pdf',
      'doc',
      'frontend-skill',
    ])
    expect(plan.items.every(item => item.status === 'create')).toBe(true)
  })

  it('can include gated skills explicitly', () => {
    const plan = createSkillInstallPlan({ targetRoot: '/tmp/tuff-skills', includeGated: true })

    expect(plan.items.some(item => item.id === 'sentry')).toBe(true)
    expect(plan.items.some(item => item.mode === 'gated')).toBe(true)
  })

  it('skips existing skills unless overwrite is enabled', async () => {
    const root = await makeTempRoot()
    const existingPath = join(root, 'openai-docs', 'SKILL.md')
    await mkdir(join(root, 'openai-docs'), { recursive: true })
    await writeFile(existingPath, '---\nname: custom\n---\n')

    const skipped = await resolveSkillInstallPlan({ targetRoot: root })
    const openai = skipped.items.find(item => item.id === 'openai-docs')
    expect(openai?.status).toBe('skip')

    const overwrite = await resolveSkillInstallPlan({ targetRoot: root, overwrite: true })
    expect(overwrite.items.find(item => item.id === 'openai-docs')?.status).toBe('overwrite')
  })

  it('writes generated SKILL.md files for writable plan items', async () => {
    const root = await makeTempRoot()
    const plan = await resolveSkillInstallPlan({ targetRoot: root })
    const result = await installRecommendedSkills(plan)

    expect(result.written).toHaveLength(6)
    const skill = await readFile(join(root, 'openai-docs', 'SKILL.md'), 'utf8')
    expect(skill).toContain('name: openai-docs')
    expect(skill).toContain('docs.openai.answer')
  })
})
