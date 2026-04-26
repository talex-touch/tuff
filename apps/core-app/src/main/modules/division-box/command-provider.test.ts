import type { TuffQuery } from '@talex-touch/utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

const shortcutMocks = vi.hoisted(() => ({
  registerMainShortcut: vi.fn(() => true),
  unregisterMainShortcut: vi.fn(() => true)
}))

const divisionManagerMocks = vi.hoisted(() => ({
  createSession: vi.fn(async () => ({ sessionId: 'session-1' })),
  getActiveSessions: vi.fn(() => [{ sessionId: 'session-active' }])
}))

vi.mock('../global-shortcon', () => ({
  shortcutModule: {
    registerMainShortcut: shortcutMocks.registerMainShortcut,
    unregisterMainShortcut: shortcutMocks.unregisterMainShortcut
  }
}))

vi.mock('./manager', () => ({
  DivisionBoxManager: {
    getInstance: () => ({
      createSession: divisionManagerMocks.createSession,
      getActiveSessions: divisionManagerMocks.getActiveSessions
    })
  }
}))

import { DivisionBoxCommandProvider } from './command-provider'
import { shortcutTriggerManager } from './shortcut-trigger'

function createMapping(id: string) {
  return {
    id,
    defaultAccelerator: 'CommandOrControl+Shift+D',
    config: {
      url: 'plugin://demo-plugin/index.html',
      title: 'Active Demo Plugin',
      size: 'medium' as const,
      keepAlive: true
    }
  }
}

afterEach(() => {
  shortcutTriggerManager.clear()
  shortcutMocks.registerMainShortcut.mockClear()
  shortcutMocks.unregisterMainShortcut.mockClear()
  divisionManagerMocks.createSession.mockClear()
  divisionManagerMocks.getActiveSessions.mockClear()
})

describe('DivisionBoxCommandProvider', () => {
  it('does not expose active-session results without a user-visible action', async () => {
    const mapping = createMapping('plugin.demo.division-box')
    shortcutTriggerManager.registerShortcut(mapping)

    const provider = new DivisionBoxCommandProvider()
    const result = await provider.onSearch(
      { text: 'active', inputs: [] } as TuffQuery,
      new AbortController().signal
    )

    expect(result.items.map((item) => item.id)).toEqual([`division-box:${mapping.id}`])
    expect(result.items).not.toContainEqual(
      expect.objectContaining({ id: 'division-box:show-active-sessions' })
    )
  })
})
