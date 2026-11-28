// @vitest-environment jsdom
import type { TdsCanvasSessionData } from '@talex-touch/utils/transport/sdk/domains/tds-capture'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isElectron: true,
  send: vi.fn()
}))

vi.mock('@talex-touch/utils/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@talex-touch/utils/env')>()
  return {
    ...actual,
    isElectronRenderer: () => mocks.isElectron
  }
})

vi.mock('@talex-touch/utils/transport', () => ({
  useTuffTransport: () => ({
    send: mocks.send
  })
}))

import {
  isPermanentCanvasSessionSaveError,
  loadPersistedCanvasSession,
  savePersistedCanvasSession
} from './canvas-session-client'

const sampleSession: TdsCanvasSessionData = {
  version: 1,
  frames: [],
  notes: [],
  selectedFrameId: null,
  history: { blobs: {}, entries: [], cursor: -1 },
  deletedAutoFrameIds: [],
  antiSlop: true,
  canvasThemePackId: null
}

describe('canvas-session-client', () => {
  beforeEach(() => {
    mocks.isElectron = true
    mocks.send.mockReset()
  })

  it('keeps non-Electron renderers memory-only without calling IPC', async () => {
    mocks.isElectron = false
    await expect(loadPersistedCanvasSession('conv-1')).resolves.toEqual({ status: 'missing' })
    await expect(savePersistedCanvasSession('conv-1', sampleSession)).resolves.toEqual({
      ok: false,
      error: 'CANVAS_SESSION_NON_ELECTRON',
      permanent: true
    })
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('distinguishes loaded, missing, and error outcomes in loadPersistedCanvasSession', async () => {
    mocks.send.mockResolvedValueOnce({ ok: true, session: sampleSession })
    await expect(loadPersistedCanvasSession('conv-1')).resolves.toEqual({
      status: 'loaded',
      session: sampleSession
    })

    mocks.send.mockResolvedValueOnce({ ok: true, session: null })
    await expect(loadPersistedCanvasSession('conv-1')).resolves.toEqual({ status: 'missing' })

    mocks.send.mockResolvedValueOnce({
      ok: true,
      session: null,
      error: 'CANVAS_SESSION_CORRUPT_OVERSIZED'
    })
    await expect(loadPersistedCanvasSession('conv-1')).resolves.toEqual({
      status: 'error',
      error: 'CANVAS_SESSION_CORRUPT_OVERSIZED'
    })

    mocks.send.mockResolvedValueOnce({ ok: false, session: null, error: 'DB_BUSY' })
    await expect(loadPersistedCanvasSession('conv-1')).resolves.toEqual({
      status: 'error',
      error: 'DB_BUSY'
    })

    mocks.send.mockRejectedValueOnce(new Error('IPC_DISCONNECTED'))
    await expect(loadPersistedCanvasSession('conv-1')).resolves.toEqual({
      status: 'error',
      error: 'IPC_DISCONNECTED'
    })

    await expect(loadPersistedCanvasSession('   ')).resolves.toEqual({
      status: 'error',
      error: 'INVALID_CONVERSATION_ID'
    })
  })

  it('distinguishes permanent limit errors from transient failures in savePersistedCanvasSession', async () => {
    expect(isPermanentCanvasSessionSaveError('CANVAS_SESSION_TOO_LARGE:5000000>4194304')).toBe(true)
    expect(isPermanentCanvasSessionSaveError('CANVAS_FRAME_SOURCE_TOO_LARGE:600000>524288')).toBe(
      true
    )
    expect(isPermanentCanvasSessionSaveError('CANVAS_HISTORY_BLOB_TOO_LARGE:600000>524288')).toBe(
      true
    )
    expect(isPermanentCanvasSessionSaveError('CANVAS_SESSION_FRAME_LIMIT')).toBe(true)
    expect(isPermanentCanvasSessionSaveError('CANVAS_SESSION_CONVERSATION_DELETED')).toBe(true)
    expect(isPermanentCanvasSessionSaveError('INVALID_CONVERSATION_ID')).toBe(true)
    expect(isPermanentCanvasSessionSaveError('IPC_TIMEOUT')).toBe(false)

    mocks.send.mockResolvedValueOnce({ ok: true, bytes: 128 })
    await expect(savePersistedCanvasSession('conv-1', sampleSession)).resolves.toEqual({ ok: true })

    mocks.send.mockResolvedValueOnce({
      ok: false,
      error: 'CANVAS_SESSION_TOO_LARGE:5000000>4194304'
    })
    await expect(savePersistedCanvasSession('conv-1', sampleSession)).resolves.toEqual({
      ok: false,
      error: 'CANVAS_SESSION_TOO_LARGE:5000000>4194304',
      permanent: true
    })

    mocks.send.mockResolvedValueOnce({
      ok: false,
      error: 'CANVAS_FRAME_SOURCE_TOO_LARGE:600000>524288'
    })
    await expect(savePersistedCanvasSession('conv-1', sampleSession)).resolves.toEqual({
      ok: false,
      error: 'CANVAS_FRAME_SOURCE_TOO_LARGE:600000>524288',
      permanent: true
    })

    mocks.send.mockResolvedValueOnce({
      ok: false,
      error: 'CANVAS_HISTORY_BLOB_TOO_LARGE:600000>524288'
    })
    await expect(savePersistedCanvasSession('conv-1', sampleSession)).resolves.toEqual({
      ok: false,
      error: 'CANVAS_HISTORY_BLOB_TOO_LARGE:600000>524288',
      permanent: true
    })

    mocks.send.mockResolvedValueOnce({
      ok: false,
      error: 'CANVAS_SESSION_CONVERSATION_DELETED'
    })
    await expect(savePersistedCanvasSession('conv-1', sampleSession)).resolves.toEqual({
      ok: false,
      error: 'CANVAS_SESSION_CONVERSATION_DELETED',
      permanent: true
    })

    mocks.send.mockResolvedValueOnce({
      ok: false,
      error: 'CANVAS_SESSION_FRAME_LIMIT:65>64'
    })
    await expect(savePersistedCanvasSession('conv-1', sampleSession)).resolves.toEqual({
      ok: false,
      error: 'CANVAS_SESSION_FRAME_LIMIT:65>64',
      permanent: true
    })

    mocks.send.mockRejectedValueOnce(new Error('IPC_TIMEOUT'))
    await expect(savePersistedCanvasSession('conv-1', sampleSession)).resolves.toEqual({
      ok: false,
      error: 'IPC_TIMEOUT',
      permanent: false
    })

    await expect(savePersistedCanvasSession('   ', sampleSession)).resolves.toEqual({
      ok: false,
      error: 'INVALID_CONVERSATION_ID',
      permanent: true
    })
  })
})
