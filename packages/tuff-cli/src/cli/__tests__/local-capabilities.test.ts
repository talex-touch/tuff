import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createSkillInstallPlan,
  findLocalExecutable,
  getLocalCapabilityEnvironment,
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

async function writeFakeExecutable(filePath: string, executable = true): Promise<void> {
  await mkdir(join(filePath, '..'), { recursive: true })
  await writeFile(filePath, '#!/bin/sh\necho ok\n', 'utf8')
  await chmod(filePath, executable ? 0o755 : 0o644)
}

describe('local CLI executable discovery', () => {
  it('discovers CLIs across version-manager Node installs (newest SemVer first) and fixed bin roots', async () => {
    const home = await makeTempRoot()
    const oldCodex = join(home, '.local', 'share', 'mise', 'installs', 'node', '24.9.0', 'bin', 'codex')
    const newCodex = join(home, '.local', 'share', 'mise', 'installs', 'node', '24.18.0', 'bin', 'codex')
    const localOmp = join(home, '.local', 'bin', 'omp')
    const fallbackPie = join(home, '.bun', 'bin', 'pie')
    await writeFakeExecutable(oldCodex)
    await writeFakeExecutable(newCodex)
    await writeFakeExecutable(localOmp)
    await writeFakeExecutable(fallbackPie)

    const opts = { homeDir: home, envPath: '', env: {} as NodeJS.ProcessEnv, platform: 'linux' as const }
    expect(await findLocalExecutable({ command: 'codex' }, opts)).toBe(newCodex)
    expect(await findLocalExecutable({ command: 'omp' }, opts)).toBe(localOmp)
    expect(await findLocalExecutable({ command: 'pi', fallbackCommands: ['pie'] }, opts)).toBe(fallbackPie)
  })

  it('ignores directories and non-executable files, and treats env overrides as authoritative', async () => {
    const home = await makeTempRoot()
    const pathBin = join(home, 'path-bin')
    // A directory named `claude` (e.g. app bundle) must not match.
    await mkdir(join(pathBin, 'claude'), { recursive: true })
    // A non-executable file must not match on POSIX.
    await writeFakeExecutable(join(pathBin, 'codex'), false)
    const realCodex = join(home, '.local', 'bin', 'codex')
    await writeFakeExecutable(realCodex, true)

    const opts = { homeDir: home, envPath: pathBin, env: {} as NodeJS.ProcessEnv, platform: 'linux' as const }
    expect(await findLocalExecutable({ command: 'claude' }, opts)).toBeUndefined()
    expect(await findLocalExecutable({ command: 'codex' }, opts)).toBe(realCodex)

    // Authoritative env override pointing to a missing file returns undefined instead of falling back.
    expect(
      await findLocalExecutable(
        { command: 'codex', envOverride: 'TUFF_CODEX_CLI_PATH' },
        {
          ...opts,
          env: { TUFF_CODEX_CLI_PATH: join(home, 'nonexistent-codex') },
        },
      ),
    ).toBeUndefined()
  })

  it('reports codex, claude, omp, pi, herdr tools and redacts sensitive config keys in doctor environment', async () => {
    const home = await makeTempRoot()
    const cwd = await makeTempRoot()
    const codexBin = join(home, '.local', 'share', 'mise', 'installs', 'node', '24.18.0', 'bin', 'codex')
    const claudeBin = join(home, '.local', 'bin', 'claude')
    const ompBin = join(home, '.local', 'bin', 'omp')
    const piBin = join(home, '.local', 'share', 'mise', 'installs', 'node', '24.9.0', 'bin', 'pi')
    const herdrBin = join(home, '.local', 'bin', 'herdr-core')
    await Promise.all([
      writeFakeExecutable(codexBin),
      writeFakeExecutable(claudeBin),
      writeFakeExecutable(ompBin),
      writeFakeExecutable(piBin),
      writeFakeExecutable(herdrBin),
    ])

    await mkdir(join(home, '.claude'), { recursive: true })
    await writeFile(
      join(home, '.claude', 'settings.json'),
      JSON.stringify({
        includeCoAuthoredBy: false,
        env: {
          ANTHROPIC_BASE_URL: 'http://127.0.0.1:3425',
          ANTHROPIC_AUTH_TOKEN: 'secret-token',
          CLAUDE_CODE_MAX_OUTPUT_TOKENS: '64000',
        },
      }),
      'utf8',
    )
    await mkdir(join(home, '.omp', 'agent'), { recursive: true })
    await writeFile(
      join(home, '.omp', 'agent', 'models.yml'),
      'providers:\n  magpie:\n    apiKey: secret\n    maxTokens: 128000\n    authHeader: true\n',
      'utf8',
    )
    await mkdir(join(home, '.pi', 'agent'), { recursive: true })
    await writeFile(
      join(home, '.pi', 'agent', 'models.json'),
      JSON.stringify({ providers: { magpie: { apiKey: 'secret-key', authHeader: true } } }),
      'utf8',
    )

    const envReport = await getLocalCapabilityEnvironment(cwd, {
      homeDir: home,
      envPath: '',
      env: {},
      platform: 'linux',
    })

    expect(envReport.tools.map(tool => [tool.id, tool.installed])).toEqual([
      ['codex', true],
      ['claude', true],
      ['omp', true],
      ['pi', true],
      ['herdr', true],
    ])
    expect(envReport.tools.find(t => t.id === 'codex')?.executablePath).toBe(codexBin)
    expect(envReport.tools.find(t => t.id === 'herdr')?.executablePath).toBe(herdrBin)

    const claudeCfg = envReport.configFiles.find(f => f.tool === 'claude' && f.kind === 'config')
    expect(claudeCfg?.exists).toBe(true)
    expect(claudeCfg?.sensitiveKeyPaths).toEqual(['env.ANTHROPIC_AUTH_TOKEN'])
    const ompCfg = envReport.configFiles.find(f => f.tool === 'omp' && f.path.endsWith('models.yml'))
    expect(ompCfg?.sensitiveKeyPaths).toEqual(['apiKey'])
    const piCfg = envReport.configFiles.find(f => f.tool === 'pi' && f.path.endsWith('models.json'))
    expect(piCfg?.exists).toBe(true)
    expect(piCfg?.sensitiveKeyPaths).toEqual(['providers.magpie.apiKey'])
  })
})
