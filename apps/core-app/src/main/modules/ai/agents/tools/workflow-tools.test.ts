import { afterEach, describe, expect, it, vi } from 'vitest'

const { writeClipboardMock, openExternalMock } = vi.hoisted(() => ({
  writeClipboardMock: vi.fn(),
  openExternalMock: vi.fn()
}))

vi.mock('@talex-touch/utils/network', () => ({
  network: {
    readText: vi.fn()
  }
}))

vi.mock('../../../system/active-app', () => ({
  activeAppService: {
    getActiveApp: vi.fn()
  }
}))

vi.mock('../../../clipboard', () => ({
  clipboardModule: {
    queryHistoryByMeta: vi.fn()
  }
}))

vi.mock('../../intelligence-desktop-context', () => ({
  intelligenceDesktopContextService: {
    capture: vi.fn()
  }
}))

import { toolRegistry } from '../tool-registry'
import { registerWorkflowTools } from './workflow-tools'

afterEach(() => {
  toolRegistry.clear()
  vi.clearAllMocks()
})

describe('workflow clipboard and browser tools', () => {
  it('requires clipboard write permission and surfaces clipboard access failures', async () => {
    writeClipboardMock.mockImplementation(() => {
      throw new Error('clipboard access denied')
    })
    registerWorkflowTools({
      clipboard: { write: writeClipboardMock },
      systemShell: { openExternal: openExternalMock }
    })

    expect(toolRegistry.getTool('clipboard.copyResult')?.permissions).toEqual(['clipboard:write'])
    await expect(
      toolRegistry.executeTool(
        'clipboard.copyResult',
        { text: 'Sensitive result' },
        { taskId: 'task-clipboard', agentId: 'agent-workflow' }
      )
    ).resolves.toEqual({ success: false, error: 'clipboard access denied' })
  })

  it('requires network permission and returns a denied browser-open result without invoking its capability', async () => {
    registerWorkflowTools({
      clipboard: { write: writeClipboardMock },
      systemShell: { openExternal: openExternalMock }
    })

    expect(toolRegistry.getTool('browser.open')?.permissions).toEqual(['network:access'])
    await expect(
      toolRegistry.executeTool(
        'browser.open',
        { url: 'file:///private/report.html' },
        { taskId: 'task-browser', agentId: 'agent-workflow' }
      )
    ).resolves.toEqual({
      success: true,
      output: {
        success: false,
        url: 'file:///private/report.html',
        error: 'blocked-protocol',
        protocol: 'file:'
      }
    })
    expect(openExternalMock).not.toHaveBeenCalled()
  })
})
