import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { registerFileTools } from './file-tools'
import { toolRegistry } from '../tool-registry'

describe('file-tools file.search', () => {
  let tmpRoot: string

  beforeEach(async () => {
    tmpRoot = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-file-search-test-')))
    registerFileTools()
  })

  afterEach(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined)
  })

  it('searches text files for string pattern and returns lines and line numbers', async () => {
    const srcDir = path.join(tmpRoot, 'src')
    await fs.mkdir(srcDir, { recursive: true })
    const fileA = path.join(srcDir, 'a.ts')
    await fs.writeFile(fileA, 'const x = 1\nconst target = "HELLO_WORLD"\nconst y = 2')

    const response = await toolRegistry.executeTool(
      'file.search',
      { pattern: 'hello_world' },
      { taskId: 'test', agentId: 'test', workingDirectory: tmpRoot }
    )
    expect(response.success).toBe(true)
    const result = response.output as {
      matches: Array<{ file: string; line: number; text: string }>
      count: number
    }

    expect(result.count).toBe(1)
    expect(result.matches[0]).toEqual({
      file: 'src/a.ts',
      line: 2,
      text: 'const target = "HELLO_WORLD"'
    })
  })

  it('searches with regular expression pattern', async () => {
    const file = path.join(tmpRoot, 'index.js')
    await fs.writeFile(file, 'function test1234() {\n  return true\n}')

    const response = await toolRegistry.executeTool(
      'file.search',
      { pattern: 'test\\d+', regex: true },
      { taskId: 'test', agentId: 'test', workingDirectory: tmpRoot }
    )
    expect(response.success).toBe(true)
    const result = response.output as {
      matches: Array<{ file: string; line: number; text: string }>
      count: number
    }

    expect(result.count).toBe(1)
    expect(result.matches[0]?.line).toBe(1)
    expect(result.matches[0]?.file).toBe('index.js')
  })

  it('fails with stable error on invalid regular expression pattern', async () => {
    const response = await toolRegistry.executeTool(
      'file.search',
      { pattern: '[invalid', regex: true },
      { taskId: 'test', agentId: 'test', workingDirectory: tmpRoot }
    )
    expect(response).toMatchObject({ success: false, error: 'INVALID_REGEX_PATTERN' })
  })

  it('ignores .git and node_modules directories', async () => {
    const gitDir = path.join(tmpRoot, '.git')
    const nmDir = path.join(tmpRoot, 'node_modules')
    await fs.mkdir(gitDir, { recursive: true })
    await fs.mkdir(nmDir, { recursive: true })
    await fs.writeFile(path.join(gitDir, 'git-info.txt'), 'TARGET_TOKEN')
    await fs.writeFile(path.join(nmDir, 'pkg.js'), 'TARGET_TOKEN')

    const response = await toolRegistry.executeTool(
      'file.search',
      { pattern: 'TARGET_TOKEN' },
      { taskId: 'test', agentId: 'test', workingDirectory: tmpRoot }
    )
    expect(response.success).toBe(true)
    const result = response.output as { matches: unknown[]; count: number }

    expect(result.count).toBe(0)
  })

  it('caps matching lines at specified maxResults', async () => {
    const file = path.join(tmpRoot, 'lines.txt')
    const content = Array.from({ length: 20 }, (_, i) => `MATCH_ROW ${i}`).join('\n')
    await fs.writeFile(file, content)

    const response = await toolRegistry.executeTool(
      'file.search',
      { pattern: 'MATCH_ROW', maxResults: 5 },
      { taskId: 'test', agentId: 'test', workingDirectory: tmpRoot }
    )
    expect(response.success).toBe(true)
    const result = response.output as { matches: unknown[]; count: number }

    expect(result.count).toBe(5)
  })

  it('confines file.read, file.exists, file.info, and file.list inside workingDirectory and blocks symlinks and credential files', async () => {
    const outsideRoot = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-file-outside-'))
    )
    try {
      const outsideSecret = path.join(outsideRoot, 'secret.txt')
      await fs.writeFile(outsideSecret, 'TOP_SECRET')
      await fs.symlink(outsideSecret, path.join(tmpRoot, 'escape-link.txt'))
      await fs.writeFile(path.join(tmpRoot, '.env'), 'API_KEY=secret')
      await fs.writeFile(path.join(tmpRoot, 'safe.txt'), 'hello safe')

      const ctx = { taskId: 'test', agentId: 'test', workingDirectory: tmpRoot }

      expect(
        (await toolRegistry.executeTool('file.read', { path: outsideSecret }, ctx)).success
      ).toBe(false)
      expect(
        (await toolRegistry.executeTool('file.read', { path: '../outside' }, ctx)).success
      ).toBe(false)
      expect(
        (await toolRegistry.executeTool('file.read', { path: 'escape-link.txt' }, ctx)).success
      ).toBe(false)
      expect((await toolRegistry.executeTool('file.read', { path: '.env' }, ctx)).success).toBe(
        false
      )
      expect(
        (await toolRegistry.executeTool('file.exists', { path: outsideSecret }, ctx)).success
      ).toBe(false)
      expect(
        (await toolRegistry.executeTool('file.info', { path: outsideSecret }, ctx)).success
      ).toBe(false)
      expect(
        (await toolRegistry.executeTool('file.list', { path: outsideRoot }, ctx)).success
      ).toBe(false)

      const safeRead = await toolRegistry.executeTool('file.read', { path: 'safe.txt' }, ctx)
      expect(safeRead.success).toBe(true)
      expect(safeRead.output).toBe('hello safe')
    } finally {
      await fs.rm(outsideRoot, { recursive: true, force: true }).catch(() => undefined)
    }
  })
})
