import type { IManifest } from '@talex-touch/utils/plugin'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { tmpdir } from 'node:os'
import zlib from 'node:zlib'
import fse from 'fs-extra'
import { CURRENT_SDK_VERSION, PluginStatus } from '@talex-touch/utils/plugin'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { pluginModuleMock } = vi.hoisted(() => ({
  pluginModuleMock: {
    filePath: '',
    pluginManager: {
      getPluginByName: vi.fn<() => unknown>(() => null),
      loadPlugin: vi.fn(),
      unloadPlugin: vi.fn(),
      uninstallPlugin: vi.fn()
    }
  }
}))

vi.mock('./plugin-module', () => ({
  pluginModule: pluginModuleMock
}))

import { PluginResolver, ResolverStatus } from './plugin-resolver'
import { PRIVILEGED_PLUGIN_NAMES } from '../../../shared/privileged-plugins'

function writeOctal(buffer: Buffer, offset: number, length: number, value: number): void {
  const str = value.toString(8).padStart(length - 1, '0')
  buffer.write(`${str}\0`, offset, length, 'ascii')
}

function buildNpmTgz(files: Record<string, string>): Buffer {
  const chunks: Buffer[] = []
  for (const [name, content] of Object.entries(files)) {
    const body = Buffer.from(content, 'utf8')
    const header = Buffer.alloc(512, 0)
    header.write(name, 0, 100, 'utf8')
    writeOctal(header, 100, 8, 0o644)
    writeOctal(header, 108, 8, 0)
    writeOctal(header, 116, 8, 0)
    writeOctal(header, 124, 12, body.length)
    writeOctal(header, 136, 12, 1_700_000_000)
    header.write('0', 156, 1, 'ascii')
    header.write('ustar\0', 257, 6, 'ascii')
    header.write('00', 263, 2, 'ascii')
    header.fill(0x20, 148, 156)
    let sum = 0
    for (let i = 0; i < 512; i += 1) sum += header[i]!
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii')
    chunks.push(header)
    if (body.length > 0) {
      const rem = body.length % 512
      chunks.push(rem === 0 ? body : Buffer.concat([body, Buffer.alloc(512 - rem, 0)]))
    }
  }
  chunks.push(Buffer.alloc(1024, 0))
  return zlib.gzipSync(Buffer.concat(chunks))
}

async function createSourcePluginDir(root: string, manifest: IManifest): Promise<string> {
  const sourceDir = path.join(root, 'source-plugin')
  await fse.ensureDir(sourceDir)
  await fse.writeJSON(path.join(sourceDir, 'manifest.json'), manifest, { spaces: 2 })
  await fse.writeFile(path.join(sourceDir, 'index.js'), 'module.exports = {}', 'utf-8')
  return sourceDir
}

describe('PluginResolver', () => {
  const createdRoots: string[] = []

  afterEach(async () => {
    await Promise.all(createdRoots.splice(0).map(async (root) => fse.remove(root)))
    pluginModuleMock.filePath = ''
    vi.clearAllMocks()
  })

  it('removes broken install targets when required webcontent entry files are missing', async () => {
    const root = await fse.mkdtemp(path.join(tmpdir(), 'plugin-resolver-test-'))
    createdRoots.push(root)

    const manifest: IManifest = {
      name: 'clipboard-history',
      version: '1.1.0',
      description: 'clipboard',
      icon: 'logo.svg',
      author: 'Talex',
      main: 'index.js',
      sdkapi: CURRENT_SDK_VERSION,
      features: [
        {
          id: 'clipboard-history',
          name: 'Clipboard History',
          desc: 'clipboard',
          icon: { type: 'emoji', value: '📋' },
          push: false,
          platform: { windows: true, linux: true, darwin: true },
          commands: [],
          interaction: { type: 'webcontent', path: '/clipboard-manager' }
        }
      ] as never
    }

    const sourceDir = await createSourcePluginDir(root, manifest)
    const installRoot = path.join(root, 'installed-plugins')
    await fse.ensureDir(installRoot)
    pluginModuleMock.filePath = installRoot

    const callback = vi.fn()
    await new PluginResolver(sourceDir).install(manifest, callback)

    expect(callback).toHaveBeenCalledWith(
      expect.stringContaining('Missing required webcontent entry files after install: index.html'),
      'error'
    )
    await expect(fse.pathExists(path.join(installRoot, manifest.name))).resolves.toBe(false)
    expect(pluginModuleMock.pluginManager.loadPlugin).not.toHaveBeenCalled()
  })

  it('preserves an installed plugin when force-update teardown is incomplete', async () => {
    const root = await fse.mkdtemp(path.join(tmpdir(), 'plugin-resolver-update-test-'))
    createdRoots.push(root)
    const manifest: IManifest = {
      name: 'touch-example',
      version: '2.0.0',
      description: 'example',
      icon: 'logo.svg',
      author: 'Talex',
      main: 'index.js',
      sdkapi: CURRENT_SDK_VERSION,
      features: []
    }
    const sourceDir = await createSourcePluginDir(root, manifest)
    const installRoot = path.join(root, 'installed-plugins')
    const targetDir = path.join(installRoot, manifest.name)
    await fse.ensureDir(targetDir)
    await fse.writeFile(path.join(targetDir, 'index.js'), 'old-content', 'utf-8')
    pluginModuleMock.filePath = installRoot
    const disable = vi.fn().mockResolvedValue(false)
    pluginModuleMock.pluginManager.getPluginByName.mockReturnValue({
      status: PluginStatus.ACTIVE,
      disable
    })
    const callback = vi.fn()

    await new PluginResolver(sourceDir).install(manifest, callback, { forceUpdate: true })

    expect(disable).toHaveBeenCalledOnce()
    expect(pluginModuleMock.pluginManager.unloadPlugin).not.toHaveBeenCalled()
    expect(pluginModuleMock.pluginManager.uninstallPlugin).not.toHaveBeenCalled()
    expect(pluginModuleMock.pluginManager.loadPlugin).not.toHaveBeenCalled()
    expect(callback).toHaveBeenCalledWith(
      'Failed to remove old plugin: PLUGIN_RUNTIME_RESOURCE_CLEANUP_FAILED',
      'error'
    )
    expect(await fse.readFile(path.join(targetDir, 'index.js'), 'utf-8')).toBe('old-content')
  })

  for (const [mode, options] of [
    ['regular installation', undefined],
    ['force update', { forceUpdate: true }]
  ] as const) {
    it(`rejects every privileged bundled name before ${mode} can touch its runtime`, async () => {
      const root = await fse.mkdtemp(path.join(tmpdir(), 'plugin-resolver-reserved-name-test-'))
      createdRoots.push(root)
      const installRoot = path.join(root, 'installed-plugins')
      await fse.ensureDir(installRoot)
      pluginModuleMock.filePath = installRoot

      for (const pluginName of PRIVILEGED_PLUGIN_NAMES) {
        const manifest: IManifest = {
          name: pluginName,
          version: '2.0.0',
          description: 'reserved runtime impersonation',
          icon: 'logo.svg',
          author: 'untrusted installer',
          main: 'index.js',
          sdkapi: CURRENT_SDK_VERSION,
          features: []
        }
        const sourceDir = await createSourcePluginDir(root, manifest)
        const targetDir = path.join(installRoot, pluginName)
        const originalContents = `bundled ${pluginName} runtime`
        await fse.ensureDir(targetDir)
        await fse.writeFile(path.join(targetDir, 'index.js'), originalContents, 'utf-8')
        const callback = vi.fn()

        await new PluginResolver(sourceDir).install(manifest, callback, options)

        expect(callback).toHaveBeenCalledWith(
          'privileged plugin name is reserved for the bundled runtime',
          'error'
        )
        await expect(fse.readFile(path.join(targetDir, 'index.js'), 'utf-8')).resolves.toBe(
          originalContents
        )
      }

      expect(pluginModuleMock.pluginManager.unloadPlugin).not.toHaveBeenCalled()
      expect(pluginModuleMock.pluginManager.uninstallPlugin).not.toHaveBeenCalled()
      expect(pluginModuleMock.pluginManager.loadPlugin).not.toHaveBeenCalled()
    })
  }

  it('unwraps npm package/ root in resolve() and enforces allowUnstampedNpm gate', async () => {
    const root = await fse.mkdtemp(path.join(tmpdir(), 'plugin-resolver-npm-tgz-'))
    createdRoots.push(root)
    const installRoot = path.join(root, 'installed-plugins')
    await fse.ensureDir(installRoot)
    pluginModuleMock.filePath = installRoot

    const indexJs = 'module.exports = { ok: true }\n'
    const pkgJson = JSON.stringify({
      name: 'tuff-plugin-npm-demo',
      version: '1.0.0',
      dependencies: {}
    })
    const fileHashes = {
      'index.js': `sha256-${createHash('sha256').update(indexJs).digest('hex')}`,
      'package.json': `sha256-${createHash('sha256').update(pkgJson).digest('hex')}`
    }
    const sig = createHash('sha256').update(JSON.stringify(fileHashes)).digest('base64')

    const stampedTgzPath = path.join(root, 'stamped.tgz')
    await fse.writeFile(
      stampedTgzPath,
      buildNpmTgz({
        'package/manifest.json': JSON.stringify({
          id: 'com.example.npm.demo',
          name: 'npm-demo',
          version: '1.0.0',
          description: 'demo',
          author: 'Talex',
          main: 'index.js',
          sdkapi: CURRENT_SDK_VERSION,
          category: 'utilities',
          dev: { enable: true, address: 'http://localhost:5173', source: true },
          _files: fileHashes,
          _signature: sig
        }),
        'package/package.json': pkgJson,
        'package/index.js': indexJs
      })
    )

    const stampedResult = await new Promise<{ event: { msg: unknown }; type: string }>(
      (resolve) => {
        void new PluginResolver(stampedTgzPath).resolve(resolve, true, {
          installOptions: { enforceProdMode: true }
        })
      }
    )
    expect(stampedResult.type).toBe('success')
    const installedDir = path.join(installRoot, 'npm-demo')
    expect(await fse.pathExists(path.join(installedDir, 'manifest.json'))).toBe(true)
    expect(await fse.pathExists(path.join(installedDir, 'package'))).toBe(false)
    const installedManifest = await fse.readJSON(path.join(installedDir, 'manifest.json'))
    expect(installedManifest.dev).toEqual({ enable: false, address: '', source: false })

    // Unstamped tarball rejected without allowUnstampedNpm, accepted with allowUnstampedNpm: true
    const unstampedTgzPath = path.join(root, 'unstamped.tgz')
    await fse.writeFile(
      unstampedTgzPath,
      buildNpmTgz({
        'package/manifest.json': JSON.stringify({
          id: 'com.example.npm.community',
          name: 'npm-community',
          version: '1.0.0',
          description: 'community',
          author: 'Community',
          main: 'index.js',
          sdkapi: CURRENT_SDK_VERSION,
          category: 'utilities'
        }),
        'package/package.json': JSON.stringify({
          name: 'tuff-plugin-npm-community',
          version: '1.0.0',
          dependencies: {}
        }),
        'package/index.js': indexJs
      })
    )

    const rejected = await new Promise<{ event: { msg: unknown }; type: string }>((resolve) => {
      void new PluginResolver(unstampedTgzPath).resolve(resolve, false)
    })
    expect(rejected.type).toBe('error')
    expect(rejected.event.msg).toBe(ResolverStatus.INVALID_MANIFEST)

    const allowed = await new Promise<{ event: { msg: unknown }; type: string }>((resolve) => {
      void new PluginResolver(unstampedTgzPath).resolve(resolve, true, {
        installOptions: { allowUnstampedNpm: true, enforceProdMode: true }
      })
    })
    expect(allowed.type).toBe('success')
    expect(await fse.pathExists(path.join(installRoot, 'npm-community', 'index.js'))).toBe(true)
  })

  it('preserves data/ and logs/ on atomic forceUpdate and rolls back cleanly when loadPlugin fails', async () => {
    const root = await fse.mkdtemp(path.join(tmpdir(), 'plugin-resolver-atomic-swap-'))
    createdRoots.push(root)
    const installRoot = path.join(root, 'installed-plugins')
    const targetDir = path.join(installRoot, 'touch-atomic')
    await fse.ensureDir(path.join(targetDir, 'data'))
    await fse.ensureDir(path.join(targetDir, 'logs'))
    await fse.writeFile(path.join(targetDir, 'index.js'), 'module.exports = { v: 1 }', 'utf-8')
    await fse.writeFile(path.join(targetDir, 'data', 'state.json'), '{"count":42}', 'utf-8')
    await fse.writeFile(path.join(targetDir, 'logs', 'app.log'), 'old-log', 'utf-8')
    pluginModuleMock.filePath = installRoot

    const v2Manifest: IManifest = {
      name: 'touch-atomic',
      version: '2.0.0',
      description: 'atomic update',
      icon: 'logo.svg',
      author: 'Talex',
      main: 'index.js',
      sdkapi: CURRENT_SDK_VERSION,
      features: []
    }
    const sourceDir = await createSourcePluginDir(root, v2Manifest)
    await fse.writeFile(path.join(sourceDir, 'index.js'), 'module.exports = { v: 2 }', 'utf-8')

    const disable = vi.fn().mockResolvedValue(true)
    const enable = vi.fn().mockResolvedValue(true)
    pluginModuleMock.pluginManager.getPluginByName.mockReturnValue({
      status: PluginStatus.ENABLED,
      disable,
      enable
    })
    pluginModuleMock.pluginManager.unloadPlugin.mockResolvedValue(true)
    pluginModuleMock.pluginManager.loadPlugin.mockResolvedValueOnce(true)

    const updateCb = vi.fn()
    await new PluginResolver(sourceDir).install(v2Manifest, updateCb, {
      forceUpdate: true,
      autoReEnable: true
    })

    expect(updateCb).toHaveBeenCalledWith('success', 'success')
    expect(await fse.readFile(path.join(targetDir, 'index.js'), 'utf-8')).toBe(
      'module.exports = { v: 2 }'
    )
    expect(await fse.readFile(path.join(targetDir, 'data', 'state.json'), 'utf-8')).toBe(
      '{"count":42}'
    )
    expect(await fse.readFile(path.join(targetDir, 'logs', 'app.log'), 'utf-8')).toBe('old-log')
    expect(enable).toHaveBeenCalledOnce()

    // Now simulate a failing loadPlugin on v3 -> must roll back to v2 with data/ & logs/ intact!
    const v3SourceDir = path.join(root, 'source-plugin-v3')
    await fse.ensureDir(v3SourceDir)
    await fse.writeJSON(path.join(v3SourceDir, 'manifest.json'), {
      ...v2Manifest,
      version: '3.0.0'
    })
    await fse.writeFile(path.join(v3SourceDir, 'index.js'), 'module.exports = { v: 3 }', 'utf-8')

    pluginModuleMock.pluginManager.loadPlugin
      .mockRejectedValueOnce(new Error('LOAD_BOOM'))
      .mockResolvedValueOnce(true)

    const rollbackCb = vi.fn()
    await new PluginResolver(v3SourceDir).install({ ...v2Manifest, version: '3.0.0' }, rollbackCb, {
      forceUpdate: true,
      autoReEnable: true
    })

    expect(rollbackCb).toHaveBeenCalledWith('LOAD_BOOM', 'error')
    expect(await fse.readFile(path.join(targetDir, 'index.js'), 'utf-8')).toBe(
      'module.exports = { v: 2 }'
    )
    expect(await fse.readFile(path.join(targetDir, 'data', 'state.json'), 'utf-8')).toBe(
      '{"count":42}'
    )
    expect(await fse.readFile(path.join(targetDir, 'logs', 'app.log'), 'utf-8')).toBe('old-log')
    expect(await fse.pathExists(path.join(installRoot, '.staging'))).toBe(false)
  })

  it('extracts forced tgz installs via extractTgzSafely even if filename ends with .zip (defeats GZIP FEXTRA polyglot)', async () => {
    const root = await fse.mkdtemp(path.join(tmpdir(), 'plugin-resolver-polyglot-'))
    createdRoots.push(root)
    const installRoot = path.join(root, 'installed-plugins')
    await fse.ensureDir(installRoot)
    pluginModuleMock.filePath = installRoot

    const benignIndex = 'module.exports = { safe: true }\n'
    const manifestJson = JSON.stringify({
      id: 'com.example.polyglot',
      name: 'polyglot-check',
      version: '1.0.0',
      description: 'polyglot check',
      author: 'Tester',
      main: 'index.js',
      sdkapi: CURRENT_SDK_VERSION,
      category: 'utilities'
    })
    const pkgJson = JSON.stringify({
      name: 'tuff-plugin-polyglot-check',
      version: '1.0.0',
      dependencies: {}
    })

    // Build a valid .tgz, then embed a real malicious ZIP archive inside the RFC 1952 GZIP
    // FEXTRA header (`FLG |= 0x04`) and save the file with a `.zip` suffix.
    const benignTgz = buildNpmTgz({
      'package/manifest.json': manifestJson,
      'package/package.json': pkgJson,
      'package/index.js': benignIndex
    })
    const evilZipDir = path.join(root, 'evil-zip-src')
    await fse.ensureDir(evilZipDir)
    await fse.writeFile(path.join(evilZipDir, 'manifest.json'), manifestJson, 'utf-8')
    await fse.writeFile(
      path.join(evilZipDir, 'index.js'),
      'require("child_process").execSync("id")\n',
      'utf-8'
    )
    const evilZipPath = path.join(root, 'evil.zip')
    const compressing = (await import('compressing')).default
    await compressing.zip.compressDir(evilZipDir, evilZipPath, { ignoreBase: true })
    const evilZipBytes = await fse.readFile(evilZipPath)

    // Inject FEXTRA into the 10-byte GZIP header (bytes 0..9, FLG at byte 3)
    const header = Buffer.from(benignTgz.subarray(0, 10))
    header[3] = (header[3]! | 0x04) & 0xff
    const xlen = Buffer.alloc(2)
    xlen.writeUInt16LE(evilZipBytes.length, 0)
    const polyglotBytes = Buffer.concat([header, xlen, evilZipBytes, benignTgz.subarray(10)])

    const polyglotZipNamedPath = path.join(root, 'pkg.zip')
    await fse.writeFile(polyglotZipNamedPath, polyglotBytes)

    const cb = vi.fn()
    await new PluginResolver(polyglotZipNamedPath).install(
      JSON.parse(manifestJson) as IManifest,
      cb,
      {
        archiveFormat: 'tgz',
        stripRootDir: 'package',
        allowUnstampedNpm: true,
        enforceProdMode: true
      }
    )

    expect(cb).toHaveBeenCalledWith('success', 'success')
    const installedIndex = await fse.readFile(
      path.join(installRoot, 'polyglot-check', 'index.js'),
      'utf-8'
    )
    expect(installedIndex).toBe(benignIndex)
    expect(installedIndex).not.toContain('child_process')
  })
})
