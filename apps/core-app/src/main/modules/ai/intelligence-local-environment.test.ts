import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getIntelligenceLocalEnvironment } from './intelligence-local-environment'

const originalEnv = {
  PATH: process.env.PATH,
  CODEX_HOME: process.env.CODEX_HOME
}

afterEach(() => {
  process.env.PATH = originalEnv.PATH
  if (originalEnv.CODEX_HOME === undefined) {
    delete process.env.CODEX_HOME
  } else {
    process.env.CODEX_HOME = originalEnv.CODEX_HOME
  }
  vi.restoreAllMocks()
})

describe('getIntelligenceLocalEnvironment', () => {
  it('detects local codex skills and redacts sensitive config values', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tuff-ai-env-'))
    const codexHome = join(root, '.codex')
    const skillsRoot = join(codexHome, 'skills')
    const skillRoot = join(skillsRoot, 'openai-docs')
    const binRoot = join(root, 'bin')

    await mkdir(skillRoot, { recursive: true })
    await mkdir(binRoot, { recursive: true })
    await writeFile(
      join(codexHome, 'config.toml'),
      [
        'model = "gpt-test"',
        'api_key = "sk-should-not-leak"',
        '[projects."/repo"]',
        'trust_level = "trusted"'
      ].join('\n')
    )
    await writeFile(
      join(skillRoot, 'SKILL.md'),
      [
        '---',
        'name: openai-docs',
        'description: Official OpenAI docs helper.',
        '---',
        '# OpenAI Docs'
      ].join('\n')
    )
    await writeFile(join(binRoot, 'codex'), '#!/bin/sh\n')

    process.env.CODEX_HOME = codexHome
    process.env.PATH = binRoot

    const summary = await getIntelligenceLocalEnvironment(root)
    const codex = summary.tools.find((tool) => tool.id === 'codex')
    const config = summary.configFiles.find((file) => file.kind === 'config')
    const skill = summary.skillProviders.find((item) => item.id === 'openai-docs')

    expect(codex).toMatchObject({
      installed: true,
      executablePath: join(binRoot, 'codex')
    })
    expect(config?.keyPaths).toContain('model')
    expect(config?.keyPaths).toContain('projects."/repo".trust_level')
    expect(config?.sensitiveKeyPaths).toContain('api_key')
    expect(JSON.stringify(config)).not.toContain('sk-should-not-leak')
    expect(skill).toMatchObject({
      installed: true,
      enabled: true,
      mode: 'core',
      riskLevel: 'low'
    })
    expect(skill?.capabilities).toContain('docs.openai.search')
  })

  it('keeps missing gated skills visible but disabled', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tuff-ai-env-'))
    const codexHome = join(root, '.codex')
    await mkdir(codexHome, { recursive: true })

    process.env.CODEX_HOME = codexHome
    process.env.PATH = ''

    const summary = await getIntelligenceLocalEnvironment(root)
    const sentry = summary.skillProviders.find((item) => item.id === 'sentry')

    expect(summary.tools.find((tool) => tool.id === 'claude')).toMatchObject({
      installed: false
    })
    expect(sentry).toMatchObject({
      installed: false,
      enabled: false,
      mode: 'gated',
      riskLevel: 'high'
    })
  })
})
