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
      riskLevel: 'low',
      gate: {
        status: 'ready',
        reason: 'trusted_core',
        approvalRequired: false,
        sceneIds: ['docs.openai.answer']
      }
    })
    expect(skill?.capabilities).toContain('docs.openai.search')
  })

  it('keeps missing gated skills visible but unavailable', async () => {
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
      riskLevel: 'high',
      gate: {
        status: 'unavailable',
        reason: 'not_installed',
        approvalRequired: false,
        sceneIds: []
      }
    })
  })

  it('marks installed gated and external skills as approval-only', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tuff-ai-env-'))
    const codexHome = join(root, '.codex')
    const skillsRoot = join(codexHome, 'skills')
    const sentryRoot = join(skillsRoot, 'sentry')
    const customRoot = join(skillsRoot, 'custom-review')

    await mkdir(sentryRoot, { recursive: true })
    await mkdir(customRoot, { recursive: true })
    await writeFile(
      join(sentryRoot, 'SKILL.md'),
      ['---', 'name: Sentry', 'description: Inspect Sentry issues.', '---', '# Sentry'].join('\n')
    )
    await writeFile(
      join(customRoot, 'SKILL.md'),
      [
        '---',
        'name: Custom Review',
        'description: Local unreviewed skill.',
        '---',
        '# Custom Review'
      ].join('\n')
    )

    process.env.CODEX_HOME = codexHome
    process.env.PATH = ''

    const summary = await getIntelligenceLocalEnvironment(root)
    const sentry = summary.skillProviders.find((item) => item.id === 'sentry')
    const custom = summary.skillProviders.find((item) => item.id === 'custom-review')

    expect(sentry).toMatchObject({
      installed: true,
      enabled: false,
      mode: 'gated',
      riskLevel: 'high',
      gate: {
        status: 'approval_required',
        reason: 'high_risk',
        approvalRequired: true,
        sceneIds: ['observability.sentry.review']
      }
    })
    expect(custom).toMatchObject({
      installed: true,
      enabled: false,
      mode: 'external',
      riskLevel: 'low',
      gate: {
        status: 'approval_required',
        reason: 'external_unreviewed',
        approvalRequired: true,
        sceneIds: []
      }
    })
  })
})
