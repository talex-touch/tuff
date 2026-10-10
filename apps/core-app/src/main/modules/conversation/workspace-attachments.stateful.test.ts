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

/** The composer's kept clip: a canonical WAV of 16 kHz mono 16-bit PCM. */
function wav(samples: number, sampleRate = 16_000): Buffer {
  const data = samples * 2
  const bytes = Buffer.alloc(44 + data)
  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(36 + data, 4)
  bytes.write('WAVE', 8)
  bytes.write('fmt ', 12)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(sampleRate, 24)
  bytes.writeUInt32LE(sampleRate * 2, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(data, 40)
  return bytes
}

describe('WorkspaceAttachmentStore voice audio', () => {
  it('copies a clip in, shows it as audio with its length, and never hands it to a model', async () => {
    const clip = join(root, 'clip.wav')
    await writeFile(clip, wav(24_000))

    const record = await store.persistAudio('parent', clip)

    expect(record).toMatchObject({ mimeType: 'audio/wav', size: 44 + 48_000 })
    expect(record.relativePath).toMatch(/^[a-f0-9-]{36}\.wav$/)
    expect(await store.publicRef(record)).toMatchObject({
      kind: 'audio',
      mimeType: 'audio/wav',
      durationMs: 1_500
    })
    await expect(store.toModel(record)).rejects.toThrow('WORKSPACE_ATTACHMENT_UNSAFE')
    // The conversation's copy is its own: the kept original can go.
    await unlink(clip)
    expect((await store.publicRef(record)).previewUrl).toBeTruthy()
  })

  it('carries a clip into a fork and cleans it up with its owner', async () => {
    const clip = join(root, 'clip.wav')
    await writeFile(clip, wav(160))
    const record = await store.persistAudio('parent', clip)

    const child = await store.clone(record, 'child')

    expect(await store.publicRef(child)).toMatchObject({ kind: 'audio' })
    await store.cleanupOwner('child')
    await expect(readFile(ownedFile(child))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await store.publicRef(record)).toMatchObject({ kind: 'audio' })
  })

  it.each([
    { name: 'not a WAV', bytes: Buffer.from('hello') },
    {
      name: 'stereo',
      bytes: (() => {
        const b = wav(160)
        b.writeUInt16LE(2, 22)
        return b
      })()
    },
    { name: 'truncated data', bytes: wav(160).subarray(0, 100) }
  ])('refuses a clip that is $name, leaving nothing behind', async ({ bytes }) => {
    const clip = join(root, 'clip.wav')
    await writeFile(clip, bytes)

    await expect(store.persistAudio('parent', clip)).rejects.toThrow('WORKSPACE_ATTACHMENT_INVALID')
    const owner = join(root, 'owned', createHash('sha256').update('parent').digest('hex'))
    expect(await readdir(owner).catch(() => [])).toEqual([])
  })

  it('refuses to follow a symlinked clip', async () => {
    const real = join(root, 'real.wav')
    await writeFile(real, wav(160))
    const link = join(root, 'link.wav')
    await symlink(real, link)

    await expect(store.persistAudio('parent', link)).rejects.toMatchObject({ code: 'ELOOP' })
  })
})
