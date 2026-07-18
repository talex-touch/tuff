import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { resolveRuntimeRootPath } from '../../utils/app-root-path'

export interface AiImportContentWriteResult {
  ref: string
  created: boolean
}

function contentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function resolveBlobPath(ref: string): string {
  const match = /^sha256:([a-f0-9]{64})$/.exec(ref)
  if (!match) throw new Error('Invalid AI import content reference')
  return join(resolveRuntimeRootPath(app), 'data', 'ai-import-blobs', `${match[1]}.blob`)
}

export class AiImportContentStore {
  async write(content: string): Promise<AiImportContentWriteResult> {
    const ref = `sha256:${contentHash(content)}`
    const path = resolveBlobPath(ref)
    await mkdir(join(resolveRuntimeRootPath(app), 'data', 'ai-import-blobs'), {
      recursive: true,
      mode: 0o700
    })
    try {
      await writeFile(path, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      return { ref, created: true }
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      if (code !== 'EEXIST') throw error
      await access(path, constants.R_OK)
      return { ref, created: false }
    }
  }

  async read(ref: string): Promise<string> {
    return await readFile(resolveBlobPath(ref), 'utf8')
  }

  async remove(ref: string): Promise<void> {
    await rm(resolveBlobPath(ref), { force: true })
  }
}

export const aiImportContentStore = new AiImportContentStore()
