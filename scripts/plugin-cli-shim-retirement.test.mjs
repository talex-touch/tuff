import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'vitest'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const legacySourcePaths = [
  'packages/unplugin-export-plugin/src/bin',
  'packages/unplugin-export-plugin/src/cli',
  'packages/unplugin-export-plugin/src/core',
]
const retainedUnpluginExports = [
  './vite',
  './webpack',
  './rollup',
  './esbuild',
  './nuxt',
  './types',
]

async function readPackageJson(relativePath) {
  return JSON.parse(
    await fs.readFile(path.join(repositoryRoot, relativePath), 'utf8'),
  )
}

async function pathExists(relativePath) {
  try {
    await fs.access(path.join(repositoryRoot, relativePath))
    return true
  }
  catch {
    return false
  }
}

describe('plugin CLI shim retirement package boundary', () => {
  it('publishes only the canonical tuff executable', async () => {
    const tuffCliPackage = await readPackageJson('packages/tuff-cli/package.json')

    assert.deepEqual(tuffCliPackage.bin, { tuff: 'bin/tuff.js' })
  })

  it('keeps framework integrations while removing the unplugin CLI entrypoint', async () => {
    const unpluginPackage = await readPackageJson(
      'packages/unplugin-export-plugin/package.json',
    )
    const exports = unpluginPackage.exports

    assert.equal(Object.hasOwn(unpluginPackage, 'bin'), false)
    assert.equal(Object.hasOwn(exports, './cli'), false)
    for (const exportPath of retainedUnpluginExports) {
      assert.equal(
        Object.hasOwn(exports, exportPath),
        true,
        `expected unplugin to retain its ${exportPath} integration export`,
      )
    }
  })

  it('does not ship legacy unplugin CLI or duplicate core source trees', async () => {
    for (const legacySourcePath of legacySourcePaths) {
      assert.equal(
        await pathExists(legacySourcePath),
        false,
        `legacy source path must remain absent: ${legacySourcePath}`,
      )
    }
  })
})
