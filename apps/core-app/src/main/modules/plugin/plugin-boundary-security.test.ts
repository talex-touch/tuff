import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import compressing from 'compressing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  hasUnsafePluginNameEdgeChars,
  isReservedPrivilegedPluginName
} from '../../../shared/privileged-plugins'
import { bundlePluginPreludeFromFile } from './runtime/plugin-prelude-compiler'
import { extractArchiveSafely, peekTarManifestBounded } from './safe-archive-extract'
import { isLoopbackWidgetDevOrigin } from './widget/widget-loader'

const cleanupDirs: string[] = []

afterEach(async () => {
  for (const dir of cleanupDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true })
  }
  vi.restoreAllMocks()
})

describe('Plugin boundary hardening (#16-2, #16-7, #16-8, #16-20)', () => {
  it('accepts only exact loopback origins for widget dev.address', () => {
    expect(isLoopbackWidgetDevOrigin('http://localhost:5173')).toBe(true)
    expect(isLoopbackWidgetDevOrigin('http://127.0.0.1:3000')).toBe(true)
    expect(isLoopbackWidgetDevOrigin('http://[::1]:4000')).toBe(true)
    expect(isLoopbackWidgetDevOrigin('https://evil.example.com')).toBe(false)
    expect(isLoopbackWidgetDevOrigin('http://192.168.1.10:3000')).toBe(false)
    expect(isLoopbackWidgetDevOrigin('file:///etc/passwd')).toBe(false)
  })

  it('rejects prelude imports that escape the plugin root via relative paths or symlinks', async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'prelude-confinement-'))
    cleanupDirs.push(base)
    const pluginDir = path.join(base, 'plugin-a')
    const tempDir = path.join(base, 'tmp')
    await fs.mkdir(pluginDir, { recursive: true })
    await fs.mkdir(tempDir, { recursive: true })

    const secretJson = path.join(base, 'secure-store.json')
    await fs.writeFile(secretJson, JSON.stringify({ secret: 'DO_NOT_LEAK' }))

    // Legitimate local import succeeds
    await fs.writeFile(path.join(pluginDir, 'helper.js'), 'module.exports = { ok: true }\n')
    const goodEntry = path.join(pluginDir, 'good.js')
    await fs.writeFile(goodEntry, 'const h = require("./helper"); module.exports = h\n')
    const bundledGood = await bundlePluginPreludeFromFile('plugin-a', pluginDir, tempDir, goodEntry)
    expect(bundledGood).toContain('ok')

    // Relative escape outside pluginPath fails closed
    const escapeEntry = path.join(pluginDir, 'escape.js')
    await fs.writeFile(escapeEntry, 'module.exports = require("../secure-store.json")\n')
    const bundledEscape = await bundlePluginPreludeFromFile(
      'plugin-a',
      pluginDir,
      tempDir,
      escapeEntry
    )
    expect(bundledEscape).toBeNull()

    // Symlink inside pluginPath pointing outside fails closed
    const linkInside = path.join(pluginDir, 'linked.json')
    await fs.symlink(secretJson, linkInside)
    const symlinkEntry = path.join(pluginDir, 'symlink.js')
    await fs.writeFile(symlinkEntry, 'module.exports = require("./linked.json")\n')
    const bundledSymlink = await bundlePluginPreludeFromFile(
      'plugin-a',
      pluginDir,
      tempDir,
      symlinkEntry
    )
    expect(bundledSymlink).toBeNull()
  })

  it('enforces case-insensitive and Windows trailing-dot/space reservation for privileged plugin names', () => {
    expect(isReservedPrivilegedPluginName('touch-system-actions')).toBe(true)
    expect(isReservedPrivilegedPluginName('Touch-System-Actions')).toBe(true)
    expect(isReservedPrivilegedPluginName('touch-system-actions.')).toBe(true)
    expect(isReservedPrivilegedPluginName('touch-system-actions.. ')).toBe(true)
    expect(isReservedPrivilegedPluginName('TOUCH-TRANSLATION.')).toBe(true)
    expect(hasUnsafePluginNameEdgeChars('touch-system-actions.')).toBe(true)
    expect(hasUnsafePluginNameEdgeChars('demo ')).toBe(true)
    expect(hasUnsafePluginNameEdgeChars(' demo')).toBe(true)
    expect(hasUnsafePluginNameEdgeChars('my-custom-plugin')).toBe(false)
    expect(isReservedPrivilegedPluginName('my-custom-plugin')).toBe(false)
    expect(isReservedPrivilegedPluginName('')).toBe(false)
    expect(isReservedPrivilegedPluginName(undefined)).toBe(false)
  })

  it('enforces archive entry and byte ceilings and peeks manifest.json without full disk extraction', async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), 'archive-bounds-'))
    cleanupDirs.push(base)
    const srcDir = path.join(base, 'src')
    await fs.mkdir(srcDir, { recursive: true })
    await fs.writeFile(
      path.join(srcDir, 'manifest.json'),
      JSON.stringify({ name: 'bounded-demo', version: '1.0.0' })
    )
    await fs.writeFile(path.join(srcDir, 'a.txt'), 'A'.repeat(2048))
    await fs.writeFile(path.join(srcDir, 'b.txt'), 'B'.repeat(2048))

    const tarPath = path.join(base, 'demo.tpex')
    const tarStream = new compressing.tar.Stream()
    tarStream.addEntry(path.join(srcDir, 'manifest.json'), { relativePath: 'manifest.json' })
    tarStream.addEntry(path.join(srcDir, 'a.txt'), { relativePath: 'a.txt' })
    tarStream.addEntry(path.join(srcDir, 'b.txt'), { relativePath: 'b.txt' })
    await new Promise<void>((resolve, reject) => {
      const ws = createWriteStream(tarPath)
      tarStream.pipe(ws)
      ws.on('finish', resolve)
      ws.on('error', reject)
      tarStream.on('error', reject)
    })

    const manifest = await peekTarManifestBounded(tarPath)
    expect(manifest).toEqual({ name: 'bounded-demo', version: '1.0.0' })

    const extractGood = path.join(base, 'out-good')
    const stats = await extractArchiveSafely(tarPath, extractGood, 'tar')
    expect(stats.entries).toBe(3)

    // Exceeding entry count fails closed
    const extractTooMany = path.join(base, 'out-too-many')
    await expect(
      extractArchiveSafely(tarPath, extractTooMany, 'tar', { maxEntries: 2 })
    ).rejects.toThrow('ARCHIVE_ENTRY_LIMIT_EXCEEDED')

    // Exceeding total uncompressed bytes fails closed
    const extractTooBig = path.join(base, 'out-too-big')
    await expect(
      extractArchiveSafely(tarPath, extractTooBig, 'tar', { maxTotalBytes: 1024 })
    ).rejects.toThrow('ARCHIVE_SIZE_LIMIT_EXCEEDED')

    // node_modules zip bomb is still bounded even when skipNodeModules is true
    const zipSrcDir = path.join(base, 'zip-bomb-src')
    await fs.mkdir(path.join(zipSrcDir, 'node_modules'), { recursive: true })
    await fs.mkdir(path.join(zipSrcDir, 'sub'), { recursive: true })
    await fs.writeFile(path.join(zipSrcDir, 'node_modules', 'bomb.bin'), 'Z'.repeat(64 * 1024))
    await fs.writeFile(path.join(zipSrcDir, 'sub', 'nested.txt'), 'nested-ok')
    await fs.writeFile(path.join(zipSrcDir, 'index.js'), 'module.exports = 1')
    const zipPath = path.join(base, 'bomb.zip')
    await compressing.zip.compressDir(zipSrcDir, zipPath, { ignoreBase: true })
    await expect(
      extractArchiveSafely(zipPath, path.join(base, 'out-zip-bomb'), 'zip', {
        skipNodeModules: true,
        maxTotalBytes: 1024
      })
    ).rejects.toThrow('ARCHIVE_SIZE_LIMIT_EXCEEDED')

    // Zip with nested directories extracts cleanly when within bounds
    const zipGoodOut = path.join(base, 'out-zip-good')
    await extractArchiveSafely(zipPath, zipGoodOut, 'zip', {
      skipNodeModules: true,
      maxTotalBytes: 256 * 1024
    })
    expect(await fs.readFile(path.join(zipGoodOut, 'index.js'), 'utf8')).toBe('module.exports = 1')
    expect(await fs.readFile(path.join(zipGoodOut, 'sub', 'nested.txt'), 'utf8')).toBe('nested-ok')

    // Pre-existing symlink at destination file path is rejected (never followed)
    const outsideVictim = path.join(base, 'victim.txt')
    await fs.writeFile(outsideVictim, 'untouched')
    const symlinkTargetDir = path.join(base, 'out-symlink')
    await fs.mkdir(symlinkTargetDir, { recursive: true })
    await fs.symlink(outsideVictim, path.join(symlinkTargetDir, 'a.txt'))
    await expect(extractArchiveSafely(tarPath, symlinkTargetDir, 'tar')).rejects.toThrow(
      'ARCHIVE_SYMLINK_ESCAPE_DENIED'
    )
    expect(await fs.readFile(outsideVictim, 'utf8')).toBe('untouched')
  })
})
