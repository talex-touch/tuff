import { describe, expect, it } from 'vitest'
import { createAgentRunStreamMapper } from './agent-run-stream-events'

const identity = (value: unknown): unknown => value

describe('createAgentRunStreamMapper', () => {
  it('maps text, reasoning and an executed tool call to structured stream events', () => {
    const mapper = createAgentRunStreamMapper('agent.run', identity)
    const run = (type: string, payload: Record<string, unknown>) =>
      mapper.map({ runId: 'run_1', type, payload })

    expect(
      run('message_update', { assistantMessageEvent: { type: 'thinking_delta', delta: 'plan' } })
    ).toEqual([
      {
        type: 'part',
        capabilityId: 'agent.run',
        partEvent: { kind: 'reasoning-delta', delta: 'plan' }
      }
    ])
    expect(
      run('message_update', { assistantMessageEvent: { type: 'text_delta', delta: 'hi' } })
    ).toEqual([{ type: 'delta', capabilityId: 'agent.run', delta: 'hi' }])

    const started = run('tool_execution_start', {
      toolCallId: 'c1',
      toolName: 'file.read',
      args: { path: 'a.txt' }
    })
    expect(started.map((event) => event.partEvent)).toEqual([
      { kind: 'tool-start', callId: 'c1', name: 'file.read' },
      { kind: 'tool-input-end', callId: 'c1', input: { path: 'a.txt' } }
    ])

    const ended = run('tool_execution_end', {
      toolCallId: 'c1',
      toolName: 'file.read',
      result: { content: [{ type: 'text', text: 'hello' }] },
      isError: false
    })
    expect(ended[0].partEvent).toEqual({
      kind: 'tool-result',
      callId: 'c1',
      name: 'file.read',
      output: 'hello',
      isError: false
    })

    run('turn_end', {})
    run('turn_end', {})
    expect(mapper.result('done')).toMatchObject({
      result: 'done',
      iterations: 2,
      toolCalls: [{ tool: 'file.read', input: { path: 'a.txt' }, output: 'hello' }]
    })
  })

  it('passes tool input and unreadable results through the sanitizer', () => {
    const mapper = createAgentRunStreamMapper('agent.run', () => '[redacted]')
    const [, input] = mapper.map({
      runId: 'run_1',
      type: 'tool_execution_start',
      payload: { toolCallId: 'c1', toolName: 'system.exec', args: { token: 'secret' } }
    })
    expect(input.partEvent).toEqual({ kind: 'tool-input-end', callId: 'c1', input: '[redacted]' })

    const [result] = mapper.map({
      runId: 'run_1',
      type: 'tool_execution_end',
      payload: {
        toolCallId: 'c1',
        toolName: 'system.exec',
        result: { raw: 'secret' },
        isError: true
      }
    })
    expect(result.partEvent).toMatchObject({
      kind: 'tool-result',
      output: '"[redacted]"',
      isError: true
    })
  })

  it('ignores events that carry no usable payload', () => {
    const mapper = createAgentRunStreamMapper('agent.run', identity)
    expect(mapper.map({ runId: 'r', type: 'message_update', payload: {} })).toEqual([])
    expect(mapper.map({ runId: 'r', type: 'tool_execution_start', payload: {} })).toEqual([])
    expect(mapper.map({ runId: 'r', type: 'agent_end' })).toEqual([])
  })

  describe('OMP runtime events', () => {
    // `OmpAgentRuntimeHost` reports `reasoning` and `text` with a bare `{ delta }`, not the Pi
    // worker's nested `message_update` envelope.
    it('maps reasoning and text deltas to the same stream events a Pi run produces', () => {
      const mapper = createAgentRunStreamMapper('agent.run', identity)
      const run = (type: string, payload: Record<string, unknown>) =>
        mapper.map({ runId: 'run_1', type, payload })

      expect(run('reasoning', { delta: 'plan' })).toEqual([
        {
          type: 'part',
          capabilityId: 'agent.run',
          partEvent: { kind: 'reasoning-delta', delta: 'plan' }
        }
      ])
      expect(run('text', { delta: 'hi' })).toEqual([
        { type: 'delta', capabilityId: 'agent.run', delta: 'hi' }
      ])
      expect(
        run('message_update', { assistantMessageEvent: { type: 'text_delta', delta: 'hi' } })
      ).toEqual(run('text', { delta: 'hi' }))
    })

    it('drops empty and malformed OMP deltas', () => {
      const mapper = createAgentRunStreamMapper('agent.run', identity)
      for (const type of ['reasoning', 'text']) {
        expect(mapper.map({ runId: 'r', type, payload: { delta: '' } })).toEqual([])
        expect(mapper.map({ runId: 'r', type, payload: { delta: 3 } })).toEqual([])
        expect(mapper.map({ runId: 'r', type, payload: {} })).toEqual([])
        expect(mapper.map({ runId: 'r', type })).toEqual([])
      }
    })
  })
})
