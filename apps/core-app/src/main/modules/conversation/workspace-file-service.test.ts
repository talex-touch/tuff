import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isBlockedSensitivePath,
  isExecutableFilePath,
  openWorkspaceFileExternal,
  readWorkspaceFile
} from './workspace-file-service'

const tempDirs: string[] = []

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tuff-workspace-file-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('workspace-file-service', () => {
  it('reads relative HTML files from the conversation temporary space root', async () => {
    const spaceRoot = await makeTempDir()
    const htmlPath = path.join(spaceRoot, 'login.html')
    await fs.writeFile(htmlPath, '<!doctype html><h1>Login</h1>', 'utf-8')

    const result = await readWorkspaceFile(
      { path: 'login.html', conversationId: 'conv-temp-1' },
      { resolveConversationRoot: async () => spaceRoot }
    )

    expect(result.kind).toBe('text')
    expect(result.name).toBe('login.html')
    expect(result.ext).toBe('html')
    expect(result.mimeType).toBe('text/html')
    expect(result.text).toContain('<h1>Login</h1>')
  })

  it('reads directories sorted with folders first', async () => {
    const dir = await makeTempDir()
    await fs.mkdir(path.join(dir, 'sub'))
    await fs.writeFile(path.join(dir, 'b.txt'), 'hello', 'utf-8')
    await fs.writeFile(path.join(dir, 'a.html'), '<p>hi</p>', 'utf-8')

    const result = await readWorkspaceFile({ path: dir })

    expect(result.kind).toBe('directory')
    expect(result.entries?.map((e) => e.name)).toEqual(['sub', 'a.html', 'b.txt'])
    expect(result.entries?.[0]?.isDirectory).toBe(true)
  })

  it('classifies binary files with NUL bytes safely without decoding garbage', async () => {
    const dir = await makeTempDir()
    const binPath = path.join(dir, 'archive.dat')
    await fs.writeFile(binPath, Buffer.from([0x89, 0x50, 0x00, 0x47, 0x00, 0x0a]))

    const result = await readWorkspaceFile({ path: binPath })

    expect(result.kind).toBe('binary')
    expect(result.text).toBeUndefined()
  })

  it('blocks sensitive credential directories such as ~/.ssh and ~/.aws', async () => {
    const fakeHome = await makeTempDir()
    const sshDir = path.join(fakeHome, '.ssh')
    await fs.mkdir(sshDir)
    const keyPath = path.join(sshDir, 'id_rsa')
    await fs.writeFile(keyPath, 'PRIVATE', 'utf-8')

    expect(isBlockedSensitivePath(keyPath, fakeHome)).toBe(true)
    await expect(readWorkspaceFile({ path: keyPath }, { homedir: () => fakeHome })).rejects.toThrow(
      'WORKSPACE_FILE_FORBIDDEN'
    )
  })

  it('opens safe documents externally via openPath and reveals executables instead of executing them', async () => {
    const dir = await makeTempDir()
    const htmlPath = path.join(dir, 'login.html')
    const scriptPath = path.join(dir, 'run.command')
    await fs.writeFile(htmlPath, '<h1>ok</h1>', 'utf-8')
    await fs.writeFile(scriptPath, '#!/bin/sh\necho hi\n', 'utf-8')

    const openPath = vi.fn(async () => '')
    const showItemInFolder = vi.fn()

    const docRes = await openWorkspaceFileExternal(
      { path: htmlPath },
      { openPath, showItemInFolder }
    )
    expect(docRes).toEqual({ opened: true })
    expect(openPath).toHaveBeenCalledOnce()
    expect(showItemInFolder).not.toHaveBeenCalled()

    openPath.mockClear()
    expect(isExecutableFilePath(scriptPath)).toBe(true)
    const execRes = await openWorkspaceFileExternal(
      { path: scriptPath },
      { openPath, showItemInFolder }
    )
    expect(execRes).toEqual({ opened: false, revealed: true })
    expect(openPath).not.toHaveBeenCalled()
    expect(showItemInFolder).toHaveBeenCalledOnce()
  })
})
