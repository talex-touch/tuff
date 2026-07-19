import { promises as fs } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  collectFiles,
  copyPluginSource,
  inventoryDigest,
  parseArgs,
  runCommand,
} from './plugin-source-package-audit'

const require = createRequire(import.meta.url)
const {
  PLUGIN_RELEASE_PREREQUISITES,
  PLUGIN_RELEASE_TARGETS,
} = require('./lib/plugin-release-targets.cjs') as {
  PLUGIN_RELEASE_PREREQUISITES: readonly string[]
  PLUGIN_RELEASE_TARGETS: readonly Array<{
    pluginName: string
    packageName: string
    root: string
    manifest: string
    bundledProjection: string
    gates: Record<string, { command: string, args: string[] } | { notApplicable: true, reason: string }>
  }>
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const temporaryDirectories: string[] = []

async function createTemporaryDirectory(prefix: string): Promise<string> {
  const directory = await fs.mkdtemp(path.join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(directory => fs.rm(directory, { recursive: true, force: true })),
  )
})

describe('plugin source package audit contracts', () => {
  it('enumerates every official target after the canonical prerequisites with declared gate applicability', () => {
    expect(PLUGIN_RELEASE_PREREQUISITES).toEqual([
      '@talex-touch/tuff-cli-core',
      '@talex-touch/unplugin-export-plugin',
      '@talex-touch/tuff-cli',
      '@talex-touch/tuffex',
    ])
    expect(PLUGIN_RELEASE_TARGETS.map(target => target.pluginName)).toEqual([
      'touch-translation',
      'touch-intelligence',
    ])
    expect(PLUGIN_RELEASE_TARGETS.map(target => target.packageName)).toEqual([
      '@talex-touch/touch-translation-plugin',
      '@talex-touch/touch-intelligence-plugin',
    ])

    const translation = PLUGIN_RELEASE_TARGETS[0]!
    expect(translation.gates).toEqual({
      build: { command: 'pnpm', args: ['run', 'build'] },
      test: { command: 'pnpm', args: ['exec', 'vitest', 'run'] },
      typecheck: { command: 'pnpm', args: ['run', 'typecheck'] },
      lint: { command: 'pnpm', args: ['run', 'lint'] },
    })

    const intelligence = PLUGIN_RELEASE_TARGETS[1]!
    expect(intelligence.gates.build).toEqual({ command: 'pnpm', args: ['run', 'build'] })
    for (const gateName of ['test', 'typecheck', 'lint']) {
      const gate = intelligence.gates[gateName]!
      expect(gate).toMatchObject({ notApplicable: true })
      expect('reason' in gate && gate.reason.trim()).not.toHaveLength(0)
    }
  })

  it('parses audit options with bounded repetition and keeps artifacts beside the report', () => {
    const defaults = parseArgs([])
    expect(defaults).toMatchObject({
      targets: [],
      allowDirty: false,
      ephemeralSigning: false,
      skipPrerequisites: false,
      repeat: 2,
      outputPath: path.join(
        repoRoot,
        '.trellis/tasks/07-18-plugin-source-package-audit/evidence/source-package-audit.json',
      ),
    })
    expect(defaults.artifactDirectory).toBe(path.join(path.dirname(defaults.outputPath), 'artifacts'))

    const overrides = parseArgs([
      '--target',
      'touch-translation',
      '--target',
      'touch-intelligence',
      '--output',
      '.trellis/audit-fixtures/custom-report.json',
      '--allow-dirty',
      '--ephemeral-signing',
      '--skip-prerequisites',
      '--repeat',
      '1',
    ])
    expect(overrides).toMatchObject({
      targets: ['touch-translation', 'touch-intelligence'],
      outputPath: path.join(repoRoot, '.trellis/audit-fixtures/custom-report.json'),
      allowDirty: true,
      ephemeralSigning: true,
      skipPrerequisites: true,
      repeat: 1,
    })
    expect(overrides.artifactDirectory).toBe(path.join(path.dirname(overrides.outputPath), 'artifacts'))

    for (const repeat of ['0', '3', '1.5', 'not-a-number'])
      expect(() => parseArgs(['--repeat', repeat])).toThrow('--repeat must be 1 or 2.')
  })

  it('copies only canonical source inputs into an isolated plugin workspace', async () => {
    const fixtureRoot = await createTemporaryDirectory('plugin-source-copy-')
    const sourceRoot = path.join(fixtureRoot, 'source')
    const targetRoot = path.join(fixtureRoot, 'target')
    await Promise.all([
      fs.mkdir(path.join(sourceRoot, 'src'), { recursive: true }),
      fs.mkdir(path.join(sourceRoot, 'nested', 'dist'), { recursive: true }),
      fs.mkdir(path.join(sourceRoot, 'nested', 'node_modules', 'dependency'), { recursive: true }),
    ])
    await Promise.all([
      fs.writeFile(path.join(sourceRoot, 'src', 'canonical.ts'), 'export const canonical = true\n'),
      fs.writeFile(path.join(sourceRoot, 'nested', 'dist', 'generated.js'), 'stale dist output'),
      fs.writeFile(path.join(sourceRoot, 'nested', 'node_modules', 'dependency', 'index.js'), 'dependency'),
      fs.writeFile(path.join(sourceRoot, 'stale.tpex'), 'old archive'),
      fs.writeFile(path.join(sourceRoot, 'nested', 'STALE.TPEX'), 'old archive'),
    ])

    await copyPluginSource(sourceRoot, targetRoot)

    await expect(fs.readFile(path.join(targetRoot, 'src', 'canonical.ts'), 'utf8')).resolves.toBe('export const canonical = true\n')
    await expect(fs.lstat(path.join(targetRoot, 'nested', 'dist'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.lstat(path.join(targetRoot, 'nested', 'node_modules'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.lstat(path.join(targetRoot, 'stale.tpex'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.lstat(path.join(targetRoot, 'nested', 'STALE.TPEX'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('projects only content files, refuses symlinks, and hashes normalized inventories', async () => {
    const fixtureRoot = await createTemporaryDirectory('plugin-source-inventory-')
    await Promise.all([
      fs.mkdir(path.join(fixtureRoot, 'src'), { recursive: true }),
      fs.mkdir(path.join(fixtureRoot, 'nested'), { recursive: true }),
      fs.writeFile(path.join(fixtureRoot, 'package.json'), '{"name":"fixture"}\n'),
      fs.writeFile(path.join(fixtureRoot, 'manifest.json'), '{"name":"fixture"}\n'),
      fs.writeFile(path.join(fixtureRoot, 'key.talex'), 'private key'),
      fs.writeFile(path.join(fixtureRoot, 'stale.tpex'), 'archive'),
      fs.writeFile(path.join(fixtureRoot, 'nested', 'package.json'), '{"private":true}\n'),
      fs.writeFile(path.join(fixtureRoot, 'nested', 'another.tpex'), 'archive'),
      fs.writeFile(path.join(fixtureRoot, 'src', 'canonical.ts'), 'export const fixture = true\n'),
      fs.writeFile(path.join(fixtureRoot, 'nested', 'asset.txt'), 'canonical asset\n'),
    ])

    const files = await collectFiles(fixtureRoot)
    expect(files.map(file => file.path)).toEqual(['nested/asset.txt', 'src/canonical.ts'])

    const digest = inventoryDigest(files)
    expect(inventoryDigest([...files].reverse())).toBe(digest)
    expect(inventoryDigest([
      ...files.slice(0, 1),
      { ...files[1]!, sha256: '0'.repeat(64) },
    ])).not.toBe(digest)

    await fs.symlink(path.join(fixtureRoot, 'src', 'canonical.ts'), path.join(fixtureRoot, 'linked.ts'))
    await expect(collectFiles(fixtureRoot)).rejects.toThrow('Symlink is not allowed in audited projection: linked.ts')
  })

  it('returns caller-observable command records and redacts bounded failure reasons', async () => {
    const fixtureRoot = await createTemporaryDirectory('plugin-source-command-')
    const logDirectory = path.join(fixtureRoot, 'logs')
    await fs.mkdir(logDirectory)

    const passed = runCommand(
      'canonical-pass',
      { command: process.execPath, args: ['-e', 'process.exit(0)'] },
      fixtureRoot,
      'canonical-source',
      logDirectory,
    )
    expect(passed).toMatchObject({
      id: 'canonical-pass',
      status: 'passed',
      exitCode: 0,
    })
    expect(passed.reason).toBeUndefined()

    const privateKey = '-----BEGIN PRIVATE KEY-----\nPRIVATE-MATERIAL\n-----END PRIVATE KEY-----'
    const failureScript = [
      `console.error(${JSON.stringify('p'.repeat(800))})`,
      `console.error(${JSON.stringify(`temporary=${fixtureRoot}`)})`,
      `console.error(${JSON.stringify(`repository=${repoRoot}`)})`,
      'console.error(\'token=token-value-should-not-leak\')',
      'console.error(\'secret: secret-value-should-not-leak\')',
      'console.error(\'password = password-value-should-not-leak\')',
      `console.error(${JSON.stringify(privateKey)})`,
      `console.error(${JSON.stringify('q'.repeat(600))})`,
      'process.exit(17)',
    ].join(';')
    const failed = runCommand(
      'canonical-fail',
      { command: process.execPath, args: ['-e', failureScript] },
      fixtureRoot,
      'canonical-source',
      logDirectory,
    )

    expect(failed).toMatchObject({
      id: 'canonical-fail',
      status: 'failed',
      exitCode: 17,
    })
    expect(failed.label).toContain('@ canonical-source')
    expect(failed.reason).toHaveLength(1200)
    expect(failed.reason).toContain('<canonical-source>')
    expect(failed.reason).toContain('<repo>')
    expect(failed.reason).toContain('token=<redacted>')
    expect(failed.reason).toContain('secret=<redacted>')
    expect(failed.reason).toContain('password=<redacted>')
    expect(failed.reason).toContain('<redacted-key>')
    expect(failed.reason).not.toContain(fixtureRoot)
    expect(failed.reason).not.toContain(repoRoot)
    expect(failed.reason).not.toContain('token-value-should-not-leak')
    expect(failed.reason).not.toContain('secret-value-should-not-leak')
    expect(failed.reason).not.toContain('password-value-should-not-leak')
    expect(failed.reason).not.toContain('PRIVATE-MATERIAL')
  })
})
