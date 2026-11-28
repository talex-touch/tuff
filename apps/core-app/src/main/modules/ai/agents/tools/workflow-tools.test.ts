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

  it('executes shell commands and returns stdout and exitCode', async () => {
    registerWorkflowTools({
      clipboard: { write: writeClipboardMock },
      systemShell: { openExternal: openExternalMock }
    })

    expect(toolRegistry.getTool('system.exec')?.permissions).toEqual(['system:exec'])
    expect(toolRegistry.getTool('bash')?.permissions).toEqual(['system:exec'])

    const result = await toolRegistry.executeTool(
      'system.exec',
      { command: 'echo "hello tuff"' },
      { taskId: 'task-shell', agentId: 'agent-workflow' }
    )
    expect(result.success).toBe(true)
    const output = result.output as { stdout: string; exitCode: number }
    expect(output.stdout.trim()).toBe('hello tuff')
    expect(output.exitCode).toBe(0)
  })

  it('rejects pre-aborted AbortSignal in system.exec without running the command and removes abort listener', async () => {
    registerWorkflowTools({
      clipboard: { write: writeClipboardMock },
      systemShell: { openExternal: openExternalMock }
    })

    const preAborted = new AbortController()
    preAborted.abort()
    const abortedResult = await toolRegistry.executeTool(
      'system.exec',
      { command: 'echo should-not-run' },
      { taskId: 'task-shell-abort', agentId: 'agent-workflow', signal: preAborted.signal }
    )
    expect(abortedResult.success).toBe(false)

    const liveController = new AbortController()
    const removeSpy = vi.spyOn(liveController.signal, 'removeEventListener')
    const okResult = await toolRegistry.executeTool(
      'system.exec',
      { command: 'echo clean' },
      { taskId: 'task-shell-clean', agentId: 'agent-workflow', signal: liveController.signal }
    )
    expect(okResult.success).toBe(true)
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it('blocks local file and loopback SSRF targets in browser.extract', async () => {
    registerWorkflowTools({
      clipboard: { write: writeClipboardMock },
      systemShell: { openExternal: openExternalMock }
    })

    for (const blockedUrl of [
      'file:///etc/passwd',
      'http://127.0.0.1:8080/secret',
      'http://169.254.169.254/latest/meta-data/'
    ]) {
      const res = await toolRegistry.executeTool(
        'browser.extract',
        { url: blockedUrl },
        { taskId: 'task-ssrf', agentId: 'agent-workflow' }
      )
      expect(res.success, blockedUrl).toBe(false)
      expect(res.error, blockedUrl).toContain('SSRF_BLOCKED')
    }
  })
})
