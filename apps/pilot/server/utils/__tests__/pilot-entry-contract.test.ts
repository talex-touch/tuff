import { describe, expect, it } from 'vitest'

describe('pilot entry contract', () => {
  it('browser-safe pilot 入口不再暴露服务端 runtime/store/engine 导出', async () => {
    const pilot = await import('@talex-touch/tuff-intelligence/pilot')

    expect(typeof pilot.buildPilotSystemMessageId).toBe('function')
    expect(typeof pilot.projectPilotSystemMessage).toBe('function')
    expect(typeof pilot.createPilotStreamEmitter).toBe('function')
    expect('AbstractAgentRuntime' in pilot).toBe(false)
    expect('DecisionDispatcher' in pilot).toBe(false)
    expect('DeepAgentLangChainEngineAdapter' in pilot).toBe(false)
    expect('D1RuntimeStoreAdapter' in pilot).toBe(false)
  })

  it('pilot-server 入口承载服务端 runtime/store/engine 导出', async () => {
    const pilotServer = await import('@talex-touch/tuff-intelligence/pilot-server')

    expect(typeof pilotServer.AbstractAgentRuntime).toBe('function')
    expect(typeof pilotServer.DecisionDispatcher).toBe('function')
    expect(typeof pilotServer.DeepAgentLangChainEngineAdapter).toBe('function')
    expect(typeof pilotServer.D1RuntimeStoreAdapter).toBe('function')
  })
})
