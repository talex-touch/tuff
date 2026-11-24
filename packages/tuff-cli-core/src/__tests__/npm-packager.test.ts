import type { NpmPublishExecutionInput } from '../publish'
import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { CURRENT_SDK_VERSION } from '@talex-touch/utils/plugin'
import fs from 'fs-extra'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseBuildArgs, parsePublishArgs, resolveBuildPackageFormat } from '../args'
import { build } from '../exporter'
import {
  createReproducibleNpmTarball,
  formatNpmTarballFilename,
  packNpmPlugin,
  validateStagedNpmPackage,
} from '../npm-packager'
import { publish } from '../publish'
import { generateSignature } from '../security-util'
import { runValidate } from '../validate'

const TAR_BLOCK_SIZE = 512

function parseTarEntries(tgzBuffer: Buffer): Map<string, Buffer> {
  const tarBuffer = zlib.gunzipSync(tgzBuffer)
  const files = new Map<string, Buffer>()
  for (let offset = 0; offset + TAR_BLOCK_SIZE <= tarBuffer.length;) {
    const header = tarBuffer.subarray(offset, offset + TAR_BLOCK_SIZE)
    offset += TAR_BLOCK_SIZE
    if (header.every(byte => byte === 0))
      break

    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '')
    const prefix = header.subarray(345, 500).toString('utf8').replace(/\0.*$/s, '')
    const fullPath = prefix ? `${prefix}/${name}` : name
    const sizeOctal = header.subarray(124, 136).toString('utf8').replace(/\0.*$/s, '').trim()
    const size = sizeOctal ? Number.parseInt(sizeOctal, 8) : 0
    const content = Buffer.from(tarBuffer.subarray(offset, offset + size))
    files.set(fullPath, content)

    const padding = (TAR_BLOCK_SIZE - (size % TAR_BLOCK_SIZE)) % TAR_BLOCK_SIZE
    offset += size + padding
  }
  return files
}

async function withTempPlugin(
  options: {
    manifest?: Record<string, unknown>
    packageJson?: Record<string, unknown> | null
    indexJs?: string
    extraFiles?: Record<string, string>
  },
  fn: (root: string) => Promise<void>,
): Promise<void> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-npm-packager-'))
  try {
    const manifest = {
      id: 'com.tuffex.demo-tool',
      name: 'demo-tool',
      version: '1.2.0',
      sdkapi: CURRENT_SDK_VERSION,
      category: 'utilities',
      description: 'Demo Tuff plugin',
      author: 'Talex Touch',
      main: 'index.js',
      icon: { type: 'class', value: 'i-ri-tools-line' },
      dev: { enable: false, address: '', source: false },
      permissions: { required: ['clipboard.read'], optional: [] },
      features: [
        {
          id: 'main',
          name: 'Demo Tool',
          desc: 'Runs demo action',
          platform: { win32: true, darwin: true, linux: true },
          commands: [{ type: 'over', value: ['demo'] }],
        },
      ],
      ...options.manifest,
    }
    await fs.writeJson(path.join(root, 'manifest.json'), manifest, { spaces: 2 })

    if (options.packageJson !== null) {
      await fs.writeJson(
        path.join(root, 'package.json'),
        {
          name: '@talex-touch/demo-tool-plugin',
          version: manifest.version,
          private: true,
          license: 'MIT',
          dependencies: {
            '@talex-touch/utils': 'workspace:^',
            'lodash-es': 'catalog:',
          },
          devDependencies: {
            typescript: '^5.9.3',
          },
          scripts: {
            build: 'tuff builder',
            preinstall: 'echo bad',
            postinstall: 'echo worse',
            prepare: 'echo nope',
          },
          ...options.packageJson,
        },
        { spaces: 2 },
      )
    }

    await fs.writeFile(
      path.join(root, 'index.js'),
      options.indexJs ?? 'module.exports = { onFeatureTriggered() {} }\n',
    )

    if (options.extraFiles) {
      for (const [relativePath, content] of Object.entries(options.extraFiles)) {
        const dest = path.join(root, relativePath)
        await fs.ensureDir(path.dirname(dest))
        await fs.writeFile(dest, content)
      }
    }

    await fn(root)
  }
  finally {
    await fs.remove(root)
  }
}

describe('npm-packager', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('formats scoped and unscoped npm tarball filenames', () => {
    expect(formatNpmTarballFilename('@talex-touch/clipboard-history-plugin', '1.2.0'))
      .toBe('talex-touch-clipboard-history-plugin-1.2.0.tgz')
    expect(formatNpmTarballFilename('tuff-plugin-demo', '0.1.0-beta.1'))
      .toBe('tuff-plugin-demo-0.1.0-beta.1.tgz')
  })

  it('stages sanitized dist/npm, stamps package.json before _files/_signature, and emits reproducible ustar .tgz', async () => {
    await withTempPlugin(
      {
        extraFiles: {
          'README.md': '# Demo Tool\n',
          'LICENSE': 'MIT License\n',
          'assets/logo.svg': '<svg></svg>\n',
        },
      },
      async (root) => {
        await build({ root, outDir: 'dist', format: 'tpex' })

        const first = await packNpmPlugin({ root, outDir: 'dist' })
        const firstTgz = await fs.readFile(first.tarballPath!)

        const second = await packNpmPlugin({ root, outDir: 'dist' })
        const secondTgz = await fs.readFile(second.tarballPath!)

        // Byte-for-byte reproducibility
        expect(Buffer.compare(firstTgz, secondTgz)).toBe(0)
        expect(first.artifactSha256).toBe(second.artifactSha256)
        expect(first.integrity).toMatch(/^sha512-[A-Za-z0-9+/=]+$/)
        expect(first.shasum).toMatch(/^[a-f0-9]{40}$/)
        expect(first.tarballFilename).toBe('talex-touch-demo-tool-plugin-1.2.0.tgz')

        // Sanitized dist/npm/package.json contract
        const stagedPkgRaw = await fs.readFile(path.join(first.npmDir, 'package.json'))
        const stagedPkg = JSON.parse(stagedPkgRaw.toString('utf8')) as Record<string, unknown>
        expect(stagedPkg.name).toBe('@talex-touch/demo-tool-plugin')
        expect(stagedPkg.version).toBe('1.2.0')
        expect(stagedPkg.private).toBeUndefined()
        expect(stagedPkg.scripts).toBeUndefined()
        expect(stagedPkg.devDependencies).toBeUndefined()
        expect(stagedPkg.dependencies).toEqual({})
        expect(stagedPkg.publishConfig).toEqual({ access: 'public' })
        expect(stagedPkg.keywords).toContain('tuff-plugin')
        expect(stagedPkg.exports).toEqual({
          '.': './index.js',
          './manifest.json': './manifest.json',
          './package.json': './package.json',
        })
        expect(stagedPkg.tuff).toMatchObject({
          schemaVersion: 1,
          id: 'com.tuffex.demo-tool',
          name: 'demo-tool',
          sdkapi: CURRENT_SDK_VERSION,
          category: 'utilities',
          manifest: './manifest.json',
        })

        // manifest._files MUST include package.json SHA-256 computed AFTER writing package.json
        const stagedManifest = await fs.readJson(path.join(first.npmDir, 'manifest.json'))
        const expectedPkgHash = `sha256-${crypto.createHash('sha256').update(stagedPkgRaw).digest('hex')}`
        expect(stagedManifest._files['package.json']).toBe(expectedPkgHash)
        expect(stagedManifest._files['index.js']).toMatch(/^sha256-[a-f0-9]{64}$/)
        expect(stagedManifest._files['README.md']).toMatch(/^sha256-[a-f0-9]{64}$/)
        expect(stagedManifest._files.LICENSE).toMatch(/^sha256-[a-f0-9]{64}$/)
        expect(stagedManifest._signature).toBe(generateSignature(stagedManifest._files))
        expect(stagedManifest.dev).toEqual({ enable: false, address: '', source: false })

        // Verify POSIX/ustar package/ root prefix in tarball
        const tarEntries = parseTarEntries(firstTgz)
        expect(Array.from(tarEntries.keys()).every(entry => entry.startsWith('package/'))).toBe(true)
        expect(tarEntries.has('package/package.json')).toBe(true)
        expect(tarEntries.has('package/manifest.json')).toBe(true)
        expect(tarEntries.has('package/index.js')).toBe(true)
        expect(tarEntries.has('package/assets/logo.svg')).toBe(true)
        expect(tarEntries.get('package/package.json')?.equals(stagedPkgRaw)).toBe(true)

        // Independent validation passes
        const revalidated = validateStagedNpmPackage({ npmDir: first.npmDir })
        expect(revalidated.artifactSha256).toBe(first.artifactSha256)
      },
    )
  }, 30000)

  it('splits long paths (>100 bytes) cleanly using POSIX/ustar prefix header', () => {
    const deepPath = `assets/${'nested-directory-segment/'.repeat(4)}very-long-runtime-asset-filename.txt`
    expect(`package/${deepPath}`.length).toBeGreaterThan(100)

    const tgz = createReproducibleNpmTarball([
      { relativePath: deepPath, content: Buffer.from('hello ustar\n') },
    ])
    const entries = parseTarEntries(tgz)
    expect(entries.get(`package/${deepPath}`)?.toString('utf8')).toBe('hello ustar\n')
  })

  it('fails closed on security scan violations and removes invalid dist/npm staging dir', async () => {
    await withTempPlugin(
      {
        indexJs: 'module.exports = { run() { return eval("1+1") } }\n',
      },
      async (root) => {
        const buildDir = path.join(root, 'dist', 'build')
        await fs.ensureDir(buildDir)
        await fs.copyFile(path.join(root, 'manifest.json'), path.join(buildDir, 'manifest.json'))
        await fs.copyFile(path.join(root, 'index.js'), path.join(buildDir, 'index.js'))

        await expect(packNpmPlugin({ root, outDir: 'dist' })).rejects.toThrow(
          'PLUGIN_SCAN_DYNAMIC_EXECUTION',
        )
        await expect(fs.pathExists(path.join(root, 'dist', 'npm'))).resolves.toBe(false)
        await expect(
          fs.pathExists(path.join(root, 'dist', 'talex-touch-demo-tool-plugin-1.2.0.tgz')),
        ).resolves.toBe(false)
      },
    )
  })

  it('fails closed when buildDir contains forbidden node_modules or symlinks', async () => {
    await withTempPlugin({}, async (root) => {
      const buildDir = path.join(root, 'dist', 'build')
      await fs.ensureDir(path.join(buildDir, 'node_modules', 'evil'))
      await fs.copyFile(path.join(root, 'manifest.json'), path.join(buildDir, 'manifest.json'))
      await fs.copyFile(path.join(root, 'index.js'), path.join(buildDir, 'index.js'))
      await fs.writeFile(path.join(buildDir, 'node_modules', 'evil', 'index.js'), 'module.exports = 1\n')

      await expect(packNpmPlugin({ root, outDir: 'dist' })).rejects.toThrow(
        'PLUGIN_PACKAGE_NODE_MODULES_FORBIDDEN',
      )

      await fs.remove(path.join(buildDir, 'node_modules'))
      await fs.symlink(path.join(buildDir, 'index.js'), path.join(buildDir, 'link.js'))
      await expect(packNpmPlugin({ root, outDir: 'dist' })).rejects.toThrow(
        'PLUGIN_PACKAGE_ENTRY_TYPE_DENIED',
      )
    })
  })

  it('rejects package.json vs manifest.json version mismatch before staging', async () => {
    await withTempPlugin(
      { packageJson: { version: '9.9.9' } },
      async (root) => {
        const buildDir = path.join(root, 'dist', 'build')
        await fs.ensureDir(buildDir)
        await fs.copyFile(path.join(root, 'manifest.json'), path.join(buildDir, 'manifest.json'))
        await fs.copyFile(path.join(root, 'index.js'), path.join(buildDir, 'index.js'))

        await expect(packNpmPlugin({ root, outDir: 'dist' })).rejects.toThrow(
          'Version mismatch: package.json=9.9.9 manifest.json=1.2.0',
        )
      },
    )
  })
})

describe('exporter npm format integration', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('supports format="npm" without emitting .tpex and format="both" without feeding dist/npm or .tgz back into dist/out', async () => {
    await withTempPlugin({}, async (root) => {
      await build({ root, outDir: 'dist', format: 'npm' })

      const tgzPath = path.join(root, 'dist', 'talex-touch-demo-tool-plugin-1.2.0.tgz')
      const tpexPath = path.join(root, 'dist', 'demo-tool-1.2.0.tpex')
      await expect(fs.pathExists(tgzPath)).resolves.toBe(true)
      await expect(fs.pathExists(path.join(root, 'dist', 'npm', 'package.json'))).resolves.toBe(true)
      await expect(fs.pathExists(tpexPath)).resolves.toBe(false)

      // Rebuild with npm: true (both) and confirm dist/npm & prior .tgz are excluded from dist/out & dist/build
      await build({ root, outDir: 'dist', npm: true })
      await expect(fs.pathExists(tpexPath)).resolves.toBe(true)
      await expect(fs.pathExists(tgzPath)).resolves.toBe(true)
      await expect(fs.pathExists(path.join(root, 'dist', 'out', 'npm'))).resolves.toBe(false)
      await expect(fs.pathExists(path.join(root, 'dist', 'out', path.basename(tgzPath)))).resolves.toBe(false)
      const builtManifest = await fs.readJson(path.join(root, 'dist', 'build', 'manifest.json'))
      expect(builtManifest._files).not.toHaveProperty(path.basename(tgzPath))
      expect(builtManifest._files).not.toHaveProperty('npm/package.json')
    })
  }, 30000)
})

describe('cli args & publish npm target', () => {
  const previousExitCode = process.exitCode
  const previousConfigDir = process.env.TUFF_CONFIG_DIR

  beforeEach(() => {
    process.exitCode = undefined
    process.env.TUFF_CONFIG_DIR = path.join(os.tmpdir(), `tuff-npm-publish-auth-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    process.exitCode = previousExitCode
    if (previousConfigDir === undefined)
      delete process.env.TUFF_CONFIG_DIR
    else
      process.env.TUFF_CONFIG_DIR = previousConfigDir
    vi.restoreAllMocks()
  })

  it('parses build --npm / --format and publish --target / --registry / --provenance flags', () => {
    expect(parseBuildArgs(['--npm'])).toMatchObject({ npm: true })
    expect(parseBuildArgs(['--format', 'npm'])).toMatchObject({ format: 'npm' })
    expect(parseBuildArgs(['--format=both'])).toMatchObject({ format: 'both' })
    expect(() => parseBuildArgs(['--format', 'zip'])).toThrow('Invalid --format value')

    expect(resolveBuildPackageFormat()).toBe('tpex')
    expect(resolveBuildPackageFormat({ npm: true })).toBe('both')
    expect(resolveBuildPackageFormat({ format: 'npm' })).toBe('npm')
    expect(resolveBuildPackageFormat({ format: 'tpex', npm: true })).toBe('both')

    expect(parsePublishArgs([
      '--target',
      'npm',
      '--registry',
      'https://registry.npmjs.org',
      '--tag',
      'beta',
      '--provenance',
      '--access',
      'public',
      '--dry-run',
    ])).toEqual({
      target: 'npm',
      registry: 'https://registry.npmjs.org',
      tag: 'beta',
      provenance: true,
      access: 'public',
      dryRun: true,
    })
    expect(() => parsePublishArgs(['--target', 'github'])).toThrow('Invalid --target value')
  })

  it('publishes to npm target without requiring Nexus auth token and forwards flags cleanly', async () => {
    const previousCwd = process.cwd()
    const previousToken = process.env.TUFF_AUTH_TOKEN
    delete process.env.TUFF_AUTH_TOKEN

    try {
      await withTempPlugin({}, async (root) => {
        process.chdir(root)
        await build({ root, outDir: 'dist', format: 'npm' })

        const execNpmPublish = vi.fn(async (_input: NpmPublishExecutionInput) => ({ stdout: 'published ok', stderr: '' }))
        await publish(
          {
            target: 'npm',
            registry: 'https://registry.npmjs.org/',
            tag: 'beta',
            provenance: true,
            dryRun: true,
          },
          { execNpmPublish },
        )

        expect(process.exitCode).toBeUndefined()
        expect(execNpmPublish).toHaveBeenCalledTimes(1)
        const call = execNpmPublish.mock.calls[0]?.[0]
        expect(call).toMatchObject({
          cwd: path.join(fs.realpathSync(root), 'dist', 'npm'),
          packageName: '@talex-touch/demo-tool-plugin',
          version: '1.2.0',
          registry: 'https://registry.npmjs.org',
          access: 'public',
          tag: 'beta',
          provenance: true,
          dryRun: true,
          args: [
            'publish',
            '--access',
            'public',
            '--registry',
            'https://registry.npmjs.org',
            '--tag',
            'beta',
            '--provenance',
            '--dry-run',
          ],
        })
      })
    }
    finally {
      process.chdir(previousCwd)
      if (previousToken !== undefined)
        process.env.TUFF_AUTH_TOKEN = previousToken
    }
  }, 30000)

  it('rejects disallowed cleartext remote registry URLs and SemVer npm dist-tags', async () => {
    const previousCwd = process.cwd()
    try {
      await withTempPlugin({}, async (root) => {
        process.chdir(root)
        await build({ root, outDir: 'dist', format: 'npm' })

        const execNpmPublish = vi.fn(async (_input: NpmPublishExecutionInput) => ({ stdout: '', stderr: '' }))
        await publish(
          { target: 'npm', registry: 'http://evil.example.com', dryRun: true },
          { execNpmPublish },
        )
        expect(process.exitCode).toBe(1)
        expect(execNpmPublish).not.toHaveBeenCalled()

        process.exitCode = undefined
        await publish(
          { target: 'npm', tag: '1.2.0', dryRun: true },
          { execNpmPublish },
        )
        expect(process.exitCode).toBe(1)
        expect(execNpmPublish).not.toHaveBeenCalled()
      })
    }
    finally {
      process.chdir(previousCwd)
    }
  }, 30000)

  it('publishes to both Nexus and npm in --target both dry-run and skips npm if Nexus fails', async () => {
    const previousCwd = process.cwd()
    const previousToken = process.env.TUFF_AUTH_TOKEN
    try {
      await withTempPlugin({}, async (root) => {
        process.chdir(root)
        await build({ root, outDir: 'dist', format: 'both' })

        // Missing Nexus auth token -> Nexus fails, npm publish must NOT run
        delete process.env.TUFF_AUTH_TOKEN
        const execNpmPublish = vi.fn(async (_input: NpmPublishExecutionInput) => ({ stdout: 'ok', stderr: '' }))
        await publish({ target: 'both', dryRun: true }, { execNpmPublish })
        expect(process.exitCode).toBe(1)
        expect(execNpmPublish).not.toHaveBeenCalled()

        // Valid Nexus token in dry-run -> both succeed, SemVer --tag skipped for npm dist-tag
        process.exitCode = undefined
        process.env.TUFF_AUTH_TOKEN = 'test-token'
        await publish({ target: 'both', tag: '1.2.0', dryRun: true }, { execNpmPublish })
        expect(process.exitCode).toBeUndefined()
        expect(execNpmPublish).toHaveBeenCalledTimes(1)
        const bothCall = execNpmPublish.mock.calls[0]?.[0]
        expect(bothCall?.tag).toBeUndefined()
        expect(bothCall?.args).toEqual([
          'publish',
          '--access',
          'public',
          '--dry-run',
        ])
      })
    }
    finally {
      process.chdir(previousCwd)
      if (previousToken === undefined)
        delete process.env.TUFF_AUTH_TOKEN
      else
        process.env.TUFF_AUTH_TOKEN = previousToken
    }
  }, 30000)
})

describe('validate sibling package.json parity', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('enforces version, official naming, keywords, and tuff metadata parity while allowing manifest-only plugins', async () => {
    await withTempPlugin({ packageJson: null }, async (root) => {
      await expect(runValidate(['--manifest', path.join(root, 'manifest.json')])).resolves.toBeUndefined()
    })

    await withTempPlugin(
      {
        packageJson: {
          name: '@talex-touch/demo-tool-plugin',
          version: '1.2.0',
          private: false,
          dependencies: {},
          scripts: {},
          keywords: ['tuff-plugin', 'utilities'],
          tuff: {
            schemaVersion: 1,
            id: 'com.tuffex.demo-tool',
            name: 'demo-tool',
            sdkapi: CURRENT_SDK_VERSION,
            category: 'utilities',
          },
        },
      },
      async (root) => {
        await expect(
          runValidate(['--manifest', path.join(root, 'manifest.json'), '--npm', '--strict']),
        ).resolves.toBeUndefined()
      },
    )

    await withTempPlugin(
      { packageJson: { version: '2.0.0' } },
      async (root) => {
        await expect(
          runValidate(['--manifest', path.join(root, 'manifest.json')]),
        ).rejects.toThrow('Manifest validation failed')
      },
    )

    await withTempPlugin(
      { packageJson: { name: '@talex-touch/wrong-name-plugin' } },
      async (root) => {
        await expect(
          runValidate(['--manifest', path.join(root, 'manifest.json')]),
        ).rejects.toThrow('Manifest validation failed')
      },
    )

    await withTempPlugin(
      {
        packageJson: {
          keywords: ['tuff-plugin'],
          tuff: { schemaVersion: 1, id: 'com.tuffex.mismatch', name: 'demo-tool', sdkapi: CURRENT_SDK_VERSION },
        },
      },
      async (root) => {
        await expect(
          runValidate(['--manifest', path.join(root, 'manifest.json')]),
        ).rejects.toThrow('Manifest validation failed')
      },
    )
  })
})
