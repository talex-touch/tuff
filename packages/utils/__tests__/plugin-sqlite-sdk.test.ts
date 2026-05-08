import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PluginEvents } from '../transport/events'

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  usePluginName: vi.fn(() => 'demo-plugin'),
  ensureRendererChannel: vi.fn(() => ({ send: vi.fn() })),
}))

vi.mock('../plugin/sdk/channel', () => ({
  ensureRendererChannel: mocks.ensureRendererChannel,
}))

vi.mock('../plugin/sdk/plugin-info', () => ({
  usePluginName: mocks.usePluginName,
}))

vi.mock('../transport', () => ({
  createPluginTuffTransport: vi.fn(() => ({
    send: mocks.send,
  })),
}))

import { usePluginSqlite } from '../plugin/sdk/sqlite'

describe('Plugin SQLite SDK', () => {
  beforeEach(() => {
    mocks.send.mockReset()
    mocks.usePluginName.mockClear()
    mocks.ensureRendererChannel.mockClear()
  })

  it('maps execute/query/transaction to typed sqlite events', async () => {
    mocks.send
      .mockResolvedValueOnce({
        success: true,
        rowsAffected: 1,
        lastInsertRowId: 7,
      })
      .mockResolvedValueOnce({
        success: true,
        rows: [{ id: 7 }],
        columns: ['id'],
      })
      .mockResolvedValueOnce({
        success: true,
        results: [{ rowsAffected: 1, lastInsertRowId: 7 }],
      })

    const sqlite = usePluginSqlite()

    await expect(sqlite.execute(' insert into notes values (?) ', ['a'])).resolves.toEqual({
      rowsAffected: 1,
      lastInsertRowId: 7,
    })
    await expect(sqlite.query(' select id from notes ')).resolves.toEqual({
      rows: [{ id: 7 }],
      columns: ['id'],
    })
    await expect(sqlite.transaction([
      { sql: ' insert into notes values (?) ', params: ['b'] },
    ])).resolves.toEqual({
      results: [{ rowsAffected: 1, lastInsertRowId: 7 }],
    })

    expect(mocks.send).toHaveBeenNthCalledWith(
      1,
      PluginEvents.sqlite.execute,
      {
        pluginName: 'demo-plugin',
        sql: 'insert into notes values (?)',
        params: ['a'],
      },
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      2,
      PluginEvents.sqlite.query,
      {
        pluginName: 'demo-plugin',
        sql: 'select id from notes',
        params: [],
      },
    )
    expect(mocks.send).toHaveBeenNthCalledWith(
      3,
      PluginEvents.sqlite.transaction,
      {
        pluginName: 'demo-plugin',
        statements: [
          {
            sql: 'insert into notes values (?)',
            params: ['b'],
          },
        ],
      },
    )
  })

  it('preserves failed response error messages', async () => {
    mocks.send.mockResolvedValueOnce({
      success: false,
      error: 'Permission denied',
    })

    await expect(usePluginSqlite().execute('select 1')).rejects.toThrow(
      '[Plugin SQLite SDK] Execute failed: Permission denied',
    )
  })
})
