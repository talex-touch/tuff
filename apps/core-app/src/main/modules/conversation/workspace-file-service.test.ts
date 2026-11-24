import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  isBlockedSensitivePath,
  isExecutableFilePath,
  isSafeExternalOpenPath,
  openWorkspaceFileExternal,
  pickWorkspaceFile,
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

    const result = await readWorkspaceFile({ path: dir }, { allowedRoots: [dir] })

    expect(result.kind).toBe('directory')
    expect(result.entries?.map((e) => e.name)).toEqual(['sub', 'a.html', 'b.txt'])
    expect(result.entries?.[0]?.isDirectory).toBe(true)
  })

  it('classifies binary files with NUL bytes safely without decoding garbage', async () => {
    const dir = await makeTempDir()
    const binPath = path.join(dir, 'archive.dat')
    await fs.writeFile(binPath, Buffer.from([0x89, 0x50, 0x00, 0x47, 0x00, 0x0a]))

    const result = await readWorkspaceFile({ path: binPath }, { allowedRoots: [dir] })

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
    await expect(
      readWorkspaceFile({ path: keyPath }, { homedir: () => fakeHome, allowedRoots: [fakeHome] })
    ).rejects.toThrow('WORKSPACE_FILE_FORBIDDEN')
  })

  it('enforces canonical path containment against ../ escapes and external opens, while allowing user-picked paths', async () => {
    const workspaceRoot = await makeTempDir()
    const outsideDir = await makeTempDir()
    const outsideFile = path.join(outsideDir, 'secret.txt')
    await fs.writeFile(outsideFile, 'outside-secret', 'utf-8')

    const relativeEscape = path.relative(workspaceRoot, outsideFile)
    await expect(
      readWorkspaceFile(
        { path: relativeEscape, conversationId: 'conv-contained' },
        { resolveConversationRoot: async () => workspaceRoot }
      )
    ).rejects.toThrow('WORKSPACE_FILE_FORBIDDEN')

    await expect(
      openWorkspaceFileExternal(
        { path: outsideFile, conversationId: 'conv-contained' },
        {
          resolveConversationRoot: async () => workspaceRoot,
          openPath: vi.fn(async () => ''),
          showItemInFolder: vi.fn()
        }
      )
    ).rejects.toThrow('WORKSPACE_FILE_FORBIDDEN')

    // Explicitly picking the outside file via dialog approves it for reading & safe external open.
    const picked = await pickWorkspaceFile(
      {},
      {
        openDialog: vi.fn(async () => ({ canceled: false, filePaths: [outsideFile] })) as never
      }
    )
    expect(picked.path).toBe(await fs.realpath(outsideFile))

    const readApproved = await readWorkspaceFile({ path: outsideFile })
    expect(readApproved.kind).toBe('text')
    expect(readApproved.text).toBe('outside-secret')
  })

  it('rejects symlinks or junctions pointing outside the workspace root', async () => {
    const workspaceRoot = await makeTempDir()
    const outsideDir = await makeTempDir()
    const outsideFile = path.join(outsideDir, 'secret.txt')
    await fs.writeFile(outsideFile, 'outside-secret', 'utf-8')

    const linkTarget = path.join(workspaceRoot, 'escape-link')
    try {
      if (process.platform === 'win32') {
        await fs.symlink(outsideDir, linkTarget, 'junction')
      } else {
        await fs.symlink(outsideFile, linkTarget)
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code
      if (process.platform === 'win32' && (code === 'EPERM' || code === 'EACCES')) {
        return
      }
      throw error
    }

    const escapeRel =
      process.platform === 'win32' ? path.join('escape-link', 'secret.txt') : 'escape-link'
    await expect(
      readWorkspaceFile(
        { path: escapeRel, conversationId: 'conv-symlink' },
        { resolveConversationRoot: async () => workspaceRoot }
      )
    ).rejects.toThrow('WORKSPACE_FILE_FORBIDDEN')
  })

  it('opens allowlisted viewer documents externally and reveals executables, .js scripts, and extensionless files', async () => {
    const dir = await makeTempDir()
    const htmlPath = path.join(dir, 'login.html')
    const scriptPath = path.join(dir, 'run.command')
    const jsPath = path.join(dir, 'payload.js')
    const noExtPath = path.join(dir, 'unix-binary')
    await fs.writeFile(htmlPath, '<h1>ok</h1>', 'utf-8')
    await fs.writeFile(scriptPath, '#!/bin/sh\necho hi\n', 'utf-8')
    await fs.writeFile(jsPath, 'console.log("hi")', 'utf-8')
    await fs.writeFile(noExtPath, '#!/bin/sh\necho hi\n', 'utf-8')

    const openPath = vi.fn(async () => '')
    const showItemInFolder = vi.fn()

    expect(isSafeExternalOpenPath(htmlPath)).toBe(true)
    const docRes = await openWorkspaceFileExternal(
      { path: htmlPath },
      { allowedRoots: [dir], openPath, showItemInFolder }
    )
    expect(docRes).toEqual({ opened: true })
    expect(openPath).toHaveBeenCalledOnce()
    expect(showItemInFolder).not.toHaveBeenCalled()

    for (const candidate of [scriptPath, jsPath, noExtPath]) {
      openPath.mockClear()
      showItemInFolder.mockClear()
      expect(isSafeExternalOpenPath(candidate)).toBe(false)
      const res = await openWorkspaceFileExternal(
        { path: candidate },
        { allowedRoots: [dir], openPath, showItemInFolder }
      )
      expect(res).toEqual({ opened: false, revealed: true })
      expect(openPath).not.toHaveBeenCalled()
      expect(showItemInFolder).toHaveBeenCalledOnce()
    }
    expect(isExecutableFilePath(scriptPath)).toBe(true)
  })
})
