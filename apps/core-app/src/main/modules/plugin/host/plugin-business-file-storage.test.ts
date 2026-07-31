import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { rmSync } from 'node:fs'
import {
  listPluginBusinessFiles,
  readPluginBusinessFile,
  removePluginBusinessFile,
  writePluginBusinessFile
} from './plugin-business-file-storage'

const roots: string[] = []

function createConfigRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'plugin-business-file-'))
  roots.push(root)
  const config = path.join(root, 'plugin', 'data', 'config')
  mkdirSync(config, { recursive: true })
  return config
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('plugin business file storage', () => {
  it('atomically reads, writes, lists and removes bounded JSON files', () => {
    const config = createConfigRoot()

    writePluginBusinessFile(config, 'state.json', { count: 1 })

    expect(readPluginBusinessFile(config, 'state.json')).toEqual({
      found: true,
      value: { count: 1 }
    })
    expect(listPluginBusinessFiles(config)).toEqual(['state.json'])
    expect(JSON.parse(readFileSync(path.join(config, 'state.json'), 'utf8'))).toEqual({ count: 1 })
    expect(removePluginBusinessFile(config, 'state.json')).toBe(true)
    expect(removePluginBusinessFile(config, 'state.json')).toBe(false)
  })

  it('keeps every accepted file name visible to list and removal', () => {
    const config = createConfigRoot()

    writePluginBusinessFile(config, 'state', { count: 1 })

    expect(listPluginBusinessFiles(config)).toContain('state')
    expect(removePluginBusinessFile(config, 'state')).toBe(true)
  })

  it('rejects target and owner symlinks without following them', () => {
    const config = createConfigRoot()
    const outside = path.join(path.dirname(path.dirname(path.dirname(config))), 'outside.json')
    writeFileSync(outside, JSON.stringify({ secret: true }))
    symlinkSync(outside, path.join(config, 'state.json'))

    expect(() => readPluginBusinessFile(config, 'state.json')).toThrow(
      'PLUGIN_BUSINESS_FILE_SYMLINK_DENIED'
    )
    expect(() => writePluginBusinessFile(config, 'state.json', { safe: true })).toThrow(
      'PLUGIN_BUSINESS_FILE_SYMLINK_DENIED'
    )
    expect(readFileSync(outside, 'utf8')).toContain('secret')
  })

  it('enforces the aggregate activation-independent storage quota', () => {
    const config = createConfigRoot()
    const payload = 'x'.repeat(1024 * 1024 - 2)
    for (let index = 0; index < 10; index += 1) {
      writePluginBusinessFile(config, `state-${index}.json`, payload)
    }

    expect(() => writePluginBusinessFile(config, 'overflow.json', true)).toThrow(
      'PLUGIN_BUSINESS_FILE_QUOTA_EXCEEDED'
    )
  })
})
