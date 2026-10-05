import type { StoredWorkspaceAttachment } from './workspace-attachments'
import { createHash } from 'node:crypto'
import {
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WorkspaceAttachmentStore } from './workspace-attachments'

let root: string
let store: WorkspaceAttachmentStore
const image = {
  type: 'image' as const,
  name: 'original.png',
  dataUrl: 'data:image/png;base64,aGVsbG8='
}

function ownedFile(record: StoredWorkspaceAttachment): string {
  return join(
    root,
    'owned',
    createHash('sha256').update(record.conversationId).digest('hex'),
    record.relativePath
  )
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'workspace-attachments-stateful-')))
  store = new WorkspaceAttachmentStore(join(root, 'owned'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('WorkspaceAttachmentStore owner isolation', () => {
  it('child writes and cleanup leave the parent copy and original user file intact', async () => {
    const original = join(root, 'original.png')
    await writeFile(original, Buffer.from('hello'))
    const [parent] = await store.persist('parent', [image])
    const child = await store.clone(parent!, 'child')

    expect(child.id).not.toBe(parent!.id)
    expect(await store.toModel(child)).toEqual(image)
    await writeFile(ownedFile(child), 'world')
    expect(await store.toModel(child)).toEqual({
      ...image,
      dataUrl: 'data:image/png;base64,d29ybGQ='
    })
    expect(await store.toModel(parent!)).toEqual(image)

    await store.cleanupOwner('child')
    await expect(readFile(ownedFile(child))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await store.toModel(parent!)).toEqual(image)
    expect(await readFile(original, 'utf8')).toBe('hello')
  })

  it.each([
    { name: 'invalid base64 padding', dataUrl: 'data:image/png;base64,aGVsbG8===' },
    { name: 'noncanonical trailing bits', dataUrl: 'data:image/png;base64,Zh==' },
    { name: 'non-image media', dataUrl: 'data:text/plain;base64,aGVsbG8=' }
  ])(
    'rolls back an earlier materialized image when a later image has $name',
    async ({ dataUrl }) => {
      await expect(store.persist('parent', [image, { type: 'image', dataUrl }])).rejects.toThrow(
        'WORKSPACE_ATTACHMENT_INVALID'
      )
      const owner = join(root, 'owned', createHash('sha256').update('parent').digest('hex'))
      expect(await readdir(owner)).toEqual([])
      const [next] = await store.persist('parent', [image])
      expect(await store.toModel(next!)).toEqual(image)
    }
  )

  it('rejects a truncated owned image before projection or cloning, without creating a child file', async () => {
    const [parent] = await store.persist('parent', [image])
    await writeFile(ownedFile(parent!), 'bad')
    await expect(store.toModel(parent!)).rejects.toThrow('WORKSPACE_ATTACHMENT_UNSAFE')
    await expect(store.publicRef(parent!)).rejects.toThrow('WORKSPACE_ATTACHMENT_UNSAFE')
    await expect(store.clone(parent!, 'child')).rejects.toThrow('WORKSPACE_ATTACHMENT_UNSAFE')
    expect(await readdir(join(root, 'owned'))).toEqual([
      createHash('sha256').update('parent').digest('hex')
    ])
  })

  it('refuses a substituted symlink and never removes its external target', async () => {
    const original = join(root, 'original.png')
    await writeFile(original, 'hello')
    const [parent] = await store.persist('parent', [image])
    await unlink(ownedFile(parent!))
    await symlink(original, ownedFile(parent!))

    await expect(store.toModel(parent!)).rejects.toMatchObject({ code: 'ELOOP' })
    await expect(store.clone(parent!, 'child')).rejects.toThrow('WORKSPACE_ATTACHMENT_UNSAFE')
    await expect(store.publicRef(parent!)).rejects.toThrow('WORKSPACE_ATTACHMENT_UNSAFE')
    await expect(store.remove([parent!])).rejects.toThrow('WORKSPACE_ATTACHMENT_UNSAFE')
    await expect(store.cleanupOwner('parent')).rejects.toThrow('WORKSPACE_ATTACHMENT_UNSAFE')
    expect(await readFile(original, 'utf8')).toBe('hello')
  })
})
