import { describe, expect, it } from 'vitest'
import { createMcpFailure } from './intelligence-mcp-failure'
import {
  formatStableToolError,
  projectToolError,
  projectToolErrorCode,
  STABLE_TOOL_ERRORS
} from './tool-error-projection'

const CANARY = 'sk-live-token@/Users/private/native-stack.ts:42'

describe('tool error projection', () => {
  it('maps MCP failure reasons without retaining server-controlled text', () => {
    const server = projectToolError(createMcpFailure('server-unavailable', CANARY))
    const tool = projectToolError(createMcpFailure('tool-failed', CANARY))

    expect(server).toEqual({
      code: 'MCP_SERVER_UNAVAILABLE',
      message: STABLE_TOOL_ERRORS.MCP_SERVER_UNAVAILABLE
    })
    expect(tool).toEqual({ code: 'MCP_TOOL_FAILED', message: STABLE_TOOL_ERRORS.MCP_TOOL_FAILED })
    expect(JSON.stringify({ server, tool })).not.toContain(CANARY)
  })

  it.each([
    ['ENOENT', 'TOOL_RESOURCE_NOT_FOUND'],
    ['EEXIST', 'TOOL_RESOURCE_ALREADY_EXISTS'],
    ['EACCES', 'TOOL_RESOURCE_ACCESS_DENIED'],
    ['EPERM', 'TOOL_RESOURCE_ACCESS_DENIED'],
    ['ETIMEDOUT', 'TOOL_EXECUTION_TIMEOUT'],
    ['ECONNREFUSED', 'TOOL_SERVICE_UNAVAILABLE']
  ] as const)('allowlists Node error code %s', (code, expected) => {
    expect(projectToolError(Object.assign(new Error(CANARY), { code })).code).toBe(expected)
  })

  it('recognises AbortError but collapses every unknown shape to one generic failure', () => {
    expect(projectToolError(Object.assign(new Error(CANARY), { name: 'AbortError' })).code).toBe(
      'TOOL_EXECUTION_ABORTED'
    )

    for (const error of [new Error(CANARY), CANARY, { message: CANARY }, null]) {
      const projection = projectToolError(error)
      expect(projection).toEqual({
        code: 'TOOL_EXECUTION_FAILED',
        message: STABLE_TOOL_ERRORS.TOOL_EXECUTION_FAILED
      })
      expect(JSON.stringify(projection)).not.toContain(CANARY)
    }
  })

  it('fails closed when hostile getters or proxies throw during projection', () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error(CANARY)
        }
      }
    )
    const projection = projectToolError(hostile)

    expect(projection).toEqual({
      code: 'TOOL_EXECUTION_FAILED',
      message: STABLE_TOOL_ERRORS.TOOL_EXECUTION_FAILED
    })
    expect(JSON.stringify(projection)).not.toContain(CANARY)
  })

  it('accepts only declared stable codes and formats code plus fixed message', () => {
    expect(projectToolErrorCode('TOOL_INPUT_INVALID')).toEqual({
      code: 'TOOL_INPUT_INVALID',
      message: STABLE_TOOL_ERRORS.TOOL_INPUT_INVALID
    })
    expect(projectToolErrorCode(CANARY).code).toBe('TOOL_EXECUTION_FAILED')
    expect(formatStableToolError(projectToolErrorCode('MCP_TOOL_FAILED'))).toBe(
      'MCP_TOOL_FAILED: MCP tool execution failed.'
    )
  })
})
