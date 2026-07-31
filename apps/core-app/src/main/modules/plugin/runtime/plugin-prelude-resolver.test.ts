import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { PluginPreludeResolutionError, resolvePluginPrelude } from './plugin-prelude-resolver'

const roots: string[] = []

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-plugin-prelude-'))
  roots.push(root)
  return root
}

function writeProjectionManifest(root: string, relativePrelude: string): void {
  const content = fs.readFileSync(path.join(root, relativePrelude))
  fs.writeFileSync(
    path.join(root, path.dirname(relativePrelude), 'manifest.json'),
    JSON.stringify({
      _files: {
        'index.js': `sha256-${createHash('sha256').update(content).digest('hex')}`
      }
    })
  )
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true })
})

describe('plugin Prelude artifact resolution', () => {
  it('uses an empty lifecycle only when neither main nor build index is declared', () => {
    const root = fixture()
    expect(resolvePluginPrelude(root, {})).toEqual({
      kind: 'empty',
      scriptContent: 'module.exports = {}'
    })
  })

  it('resolves a declared root main as a required regular file', () => {
    const root = fixture()
    fs.writeFileSync(path.join(root, 'index.js'), 'module.exports = { onInit() {} }')

    expect(resolvePluginPrelude(root, { main: 'index.js' })).toMatchObject({
      kind: 'file',
      filePath: fs.realpathSync(path.join(root, 'index.js')),
      scriptContent: 'module.exports = { onInit() {} }'
    })
  })

  it('selects the canonical build when the build source entry exists', () => {
    const root = fixture()
    fs.mkdirSync(path.join(root, 'index'), { recursive: true })
    fs.mkdirSync(path.join(root, 'dist', 'build'), { recursive: true })
    fs.writeFileSync(path.join(root, 'index', 'main.ts'), 'module.exports = {}')
    fs.writeFileSync(
      path.join(root, 'dist', 'build', 'index.js'),
      'module.exports = { canonical: 1 }'
    )
    writeProjectionManifest(root, path.join('dist', 'build', 'index.js'))
    fs.writeFileSync(path.join(root, 'index.js'), 'module.exports = { stale: 1 }')

    expect(resolvePluginPrelude(root, { buildIndexEntry: 'index/main.ts' })).toMatchObject({
      kind: 'file',
      filePath: fs.realpathSync(path.join(root, 'dist', 'build', 'index.js')),
      scriptContent: 'module.exports = { canonical: 1 }'
    })
  })

  it('selects the package root projection when canonical source is absent', () => {
    const root = fixture()
    fs.writeFileSync(path.join(root, 'index.js'), 'module.exports = { packaged: 1 }')
    writeProjectionManifest(root, 'index.js')

    expect(resolvePluginPrelude(root, { buildIndexEntry: 'index/main.ts' })).toMatchObject({
      kind: 'file',
      filePath: fs.realpathSync(path.join(root, 'index.js')),
      scriptContent: 'module.exports = { packaged: 1 }'
    })
  })

  it('rejects a stale package projection with a stable fail-closed code', () => {
    const root = fixture()
    fs.writeFileSync(path.join(root, 'index.js'), 'module.exports = { packaged: 1 }')
    writeProjectionManifest(root, 'index.js')
    fs.writeFileSync(path.join(root, 'index.js'), 'module.exports = { stale: 1 }')

    expect(() => resolvePluginPrelude(root, { buildIndexEntry: 'index/main.ts' })).toThrowError(
      new PluginPreludeResolutionError('PLUGIN_RUNTIME_PRELUDE_ARTIFACT_STALE')
    )
  })

  it('fails a missing canonical build instead of masking it with a stale root script', () => {
    const root = fixture()
    fs.mkdirSync(path.join(root, 'index'), { recursive: true })
    fs.writeFileSync(path.join(root, 'index', 'main.ts'), 'module.exports = {}')
    fs.writeFileSync(path.join(root, 'index.js'), 'module.exports = { stale: 1 }')

    expect(() => resolvePluginPrelude(root, { buildIndexEntry: 'index/main.ts' })).toThrowError(
      new PluginPreludeResolutionError('PLUGIN_RUNTIME_PRELUDE_ARTIFACT_MISSING')
    )
  })

  it('fails missing required main files and path or symlink escapes', () => {
    const root = fixture()
    const outside = path.join(fixture(), 'outside.js')
    fs.writeFileSync(outside, 'module.exports = {}')
    fs.symlinkSync(outside, path.join(root, 'linked.js'))

    expect(() => resolvePluginPrelude(root, { main: 'missing.js' })).toThrowError(
      new PluginPreludeResolutionError('PLUGIN_RUNTIME_PRELUDE_ARTIFACT_MISSING')
    )
    expect(() => resolvePluginPrelude(root, { main: '../outside.js' })).toThrowError(
      new PluginPreludeResolutionError('PLUGIN_RUNTIME_PRELUDE_CONTRACT_INVALID')
    )
    expect(() => resolvePluginPrelude(root, { main: 'linked.js' })).toThrowError(
      new PluginPreludeResolutionError('PLUGIN_RUNTIME_PRELUDE_ARTIFACT_INVALID')
    )
  })
})
